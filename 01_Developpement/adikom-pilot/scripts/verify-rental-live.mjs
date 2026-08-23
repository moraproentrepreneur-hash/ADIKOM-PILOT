#!/usr/bin/env node
/**
 * Recette de la location en cours — Étape 2.3, Lot 5.
 *
 * CE QU'ELLE ÉPROUVE
 *
 *   1. Le suivi : une location partie est consultable, ses dates réelles et
 *      prévues sont distinctes, son retard se lit sans être stocké.
 *
 *   2. La prolongation est ATOMIQUE : la période bloquée suit la nouvelle date
 *      attendue, et un refus ne laisse AUCUNE modification partielle.
 *
 *   3. La collision est refusée par la BASE, avec un message explicite — jamais
 *      une indisponibilité inexpliquée.
 *
 *   4. Le tarif verrouillé du contrat ne bouge pas. Aucun montant n'est
 *      recalculé : la règle de valorisation n'existe pas (DEC-008).
 *
 *   5. `rental.rentals.extend` est ATTRIBUABLE SÉPARÉMENT (DEC-024).
 *
 * Utilisation :
 *   node scripts/verify-rental-live.mjs [url]
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required } from './lib/env.mjs'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0

function check(condition, label, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ${GREEN}[OK]${RESET} ${label}${detail ? ` ${DIM}— ${detail}${RESET}` : ''}`)
  } else {
    failed += 1
    console.log(`  ${RED}[ÉCHEC]${RESET} ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const STAMP = Date.now().toString().slice(-6)
const MARK = `RECETTE VIE ${STAMP}`

const BASE = ['parties.clients.view', 'rental.fleet.view', 'rental.rentals.view']

const PROFILES = [
  // Suivre une location, sans pouvoir la prolonger.
  { key: 'view', permissions: BASE },
  {
    key: 'full',
    permissions: [
      ...BASE,
      'rental.reservations.view',
      'rental.reservations.confirm',
      'rental.rentals.create',
      'rental.rentals.update',
      'rental.rentals.checkout',
      'rental.rentals.extend',
      'rental.rentals.financial.view',
    ],
  },
  // Voir sans le droit financier : le tarif doit DISPARAÎTRE (DEC-017).
  { key: 'nofinance', permissions: [...BASE, 'rental.rentals.extend'] },
]

async function createProfile(admin, profile) {
  const username = `recette.vie.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-vie-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${profile.key} : ${error?.message}`)

  const id = created.user.id

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Vie ${profile.key}`,
    username,
    email,
    status: 'ACTIVE',
  })
  if (profileError) throw new Error(`profil ${profile.key} : ${profileError.message}`)

  const { data: catalog } = await admin
    .from('permissions')
    .select('id, code')
    .in('code', profile.permissions)

  if ((catalog ?? []).length !== profile.permissions.length) {
    throw new Error(
      `catalogue incomplet pour ${profile.key} : ${(catalog ?? []).length}/${profile.permissions.length}`
    )
  }

  const { error: grantError } = await admin
    .from('user_permissions')
    .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' })))
  if (grantError) throw new Error(`permissions ${profile.key} : ${grantError.message}`)

  return { id, email, password, username }
}

async function signIn(browser, base, account) {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${base}/connexion`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#username') !== null)
  await page.fill('#username', account.username)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/tableau-de-bord', { timeout: 30000 })

  return { context, page }
}

async function submitForm(page, label) {
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: label, exact: true }).click()
}

async function until(read, timeoutMs = 20000) {
  const started = Date.now()
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() - started > timeoutMs) return null
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

async function asUser(account, url, anonKey, run) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error) throw new Error(`session ${account.username} : ${error.message}`)

  const result = await run(client)
  await client.auth.signOut()
  return result
}

/** Bornes d'une plage `tstzrange` renvoyée par PostgREST. */
function periodBounds(raw) {
  const bounds = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(raw ?? '')
  if (!bounds) return null
  const toDate = (value) =>
    new Date(value.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
  return { from: toDate(bounds[1]), to: toDate(bounds[2]) }
}

/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'
  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nCible : ${base}\n`)

  const accounts = {}
  const fixtures = { rentals: [] }
  const browser = await chromium.launch()

  /** Location partie, prête à être suivie. */
  async function makeRunningRental(offsetDays, vehicleId) {
    const { data: resNo } = await admin.rpc('next_number', { p_entity_key: 'reservation' })
    const from = new Date(Date.now() + offsetDays * 864e5)
    const to = new Date(Date.now() + (offsetDays + 3) * 864e5)

    const { data: reservation } = await admin
      .from('reservations')
      .insert({
        reservation_no: resNo,
        client_id: fixtures.clientId,
        vehicle_id: vehicleId,
        period: `[${from.toISOString()},${to.toISOString()})`,
      })
      .select('id')
      .single()

    await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('confirm_reservation', {
        p_reservation_id: reservation.id,
        p_vehicle_id: vehicleId,
      })
    )

    const { data: rentalId } = await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('convert_reservation_to_rental', { p_reservation_id: reservation.id })
    )

    await asUser(accounts.full, url, anonKey, (c) =>
      c.from('rentals').update({ status: 'CONFIRMED' }).eq('id', rentalId)
    )

    await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('start_rental', {
        p_rental_id: rentalId,
        p_started_at: from.toISOString(),
        p_mileage: 30000,
        p_fuel_level: 'FULL',
      })
    )

    fixtures.rentals.push({ rentalId, reservationId: reservation.id })
    return rentalId
  }

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RVIE-${STAMP}`, label: `${MARK} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    const { data: clientNo } = await admin.rpc('next_number', { p_entity_key: 'client' })
    const { data: client } = await admin
      .from('clients')
      .insert({
        client_no: clientNo,
        type: 'COMPANY',
        legal_name: `${MARK} — Client`,
        phone: '+269 000',
      })
      .select('id')
      .single()
    fixtures.clientId = client.id

    const { data: rule } = await admin
      .from('pricing_rules')
      .insert({ category_id: category.id, amount: 140000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    // Deux véhicules : l'un pour la location suivie, l'autre pour éprouver la
    // collision sans perturber la première.
    fixtures.vehicleIds = []
    for (const suffix of ['A', 'B']) {
      const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
      const { data: vehicle } = await admin
        .from('vehicles')
        .insert({
          vehicle_no: vehicleNo,
          category_id: category.id,
          brand: 'RECETTE',
          model: `VIE ${STAMP} ${suffix}`,
          plate: `RV-${STAMP}${suffix}`,
          origin: 'OWNED',
          status: 'AVAILABLE',
        })
        .select('id')
        .single()
      fixtures.vehicleIds.push(vehicle.id)
    }

    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    const rentalId = await makeRunningRental(50, fixtures.vehicleIds[0])
    console.log(`${DIM}Sujet : location en cours · tarif 140 000 KMF/jour${RESET}\n`)

    /* ------------------------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('CAS 1 — Suivi d’une location en cours\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })

      check(
        (await page.getByText('En cours', { exact: false }).count()) >= 1,
        'La location est suivie comme « En cours »'
      )
      check(
        (await page.getByText('Retour attendu dans', { exact: false }).count()) >= 1,
        'Un repère de calendrier annonce l’échéance'
      )
      check(
        (await page.getByText('Relevés au départ', { exact: false }).count()) >= 1,
        'Les relevés du départ sont remontés sur la fiche'
      )
      check(
        (await page.getByText('30 000', { exact: false }).count()) >= 1,
        'Le kilométrage de départ est visible — référence du retour'
      )
      check(
        (await page.getByText('140 000', { exact: false }).count()) >= 1,
        'Le tarif verrouillé est visible avec la permission financière'
      )

      // Dates prévues et réelles restent distinctes.
      const { data: dates } = await admin
        .from('rentals')
        .select('started_at, expected_return_at, planned_period, returned_at')
        .eq('id', rentalId)
        .maybeSingle()

      check(Boolean(dates?.started_at), 'La date de départ réelle est connue')
      check(dates?.returned_at === null, 'Aucune date de retour tant que rien n’est rentré')
      check(
        periodBounds(dates?.planned_period)?.to.toISOString() ===
          new Date(dates.expected_return_at).toISOString(),
        'Le retour attendu correspond encore à la période prévue'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 2 — DEC-017 : sans droit financier, le tarif disparaît\n')

    {
      const { context, page } = await signIn(browser, base, accounts.nofinance)

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })

      /*
       * Le TITRE de la carte, et non le texte libre : le panneau de
       * prolongation mentionne lui aussi « le tarif verrouillé du contrat
       * reste inchangé » — une phrase qui ne divulgue aucun montant.
       */
      check(
        (await page.getByRole('heading', { name: 'Tarif verrouillé', exact: true }).count()) === 0,
        'La carte « Tarif verrouillé » est absente'
      )
      check(
        (await page.getByText('140 000', { exact: false }).count()) === 0,
        'Aucun montant n’est affiché'
      )
      check(
        (await page.getByText('0 KMF', { exact: false }).count()) === 0,
        'Aucun « 0 KMF » ne remplace le montant masqué'
      )
      check(
        (await page.getByText('En cours', { exact: false }).count()) >= 1,
        'Le suivi opérationnel reste accessible'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 3 — Prolongation : le calendrier suit, le tarif ne bouge pas\n')

    {
      const { context, page } = await signIn(browser, base, accounts.view)

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('button', { name: 'Prolonger la location', exact: true }).count()) === 0,
        'Panneau de prolongation absent sans « prolonger »'
      )
      await context.close()

      const forced = await asUser(accounts.view, url, anonKey, (c) =>
        c.rpc('extend_rental', {
          p_rental_id: rentalId,
          p_new_end: new Date(Date.now() + 60 * 864e5).toISOString(),
        })
      )
      const { data: untouched } = await admin
        .from('rentals')
        .select('status')
        .eq('id', rentalId)
        .maybeSingle()
      check(
        untouched?.status === 'IN_PROGRESS',
        'Aucune prolongation par appel direct sans « prolonger »',
        forced.error?.code ?? untouched?.status
      )
    }

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      const { data: before } = await admin
        .from('rentals')
        .select('expected_return_at, locked_amount, locked_unit')
        .eq('id', rentalId)
        .maybeSingle()

      const target = new Date(new Date(before.expected_return_at).getTime() + 2 * 864e5)
      const local = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Indian/Comoro',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .format(target)
        .replace(' ', 'T')

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('button', { name: 'Prolonger la location', exact: true }).count()) === 1,
        'Panneau de prolongation présent'
      )
      check(
        (await page.getByText('tarif verrouillé du contrat reste inchangé', { exact: false }).count()) >= 1,
        'L’écran annonce que le tarif ne change pas'
      )

      await page.fill('input[name="newEnd"]', local)
      await page.fill('input[name="reason"]', 'Recette : demande du client')
      await submitForm(page, 'Prolonger la location')

      const extended = await until(async () => {
        const { data } = await admin
          .from('rentals')
          .select('status, expected_return_at, locked_amount, locked_unit, status_reason')
          .eq('id', rentalId)
          .maybeSingle()
        return data?.status === 'EXTENDED' ? data : null
      })

      check(Boolean(extended), 'La location passe « Prolongée »')
      check(
        new Date(extended.expected_return_at).getTime() >
          new Date(before.expected_return_at).getTime(),
        'Le retour attendu est repoussé'
      )
      check(
        extended?.status_reason === 'Recette : demande du client',
        'Le motif de la prolongation est conservé'
      )

      // LE TARIF NE BOUGE PAS.
      check(
        extended?.locked_amount === before.locked_amount &&
          extended?.locked_unit === before.locked_unit,
        'Le tarif verrouillé du contrat est inchangé',
        `${extended?.locked_amount} / ${extended?.locked_unit}`
      )

      // L'OCCUPATION SUIT, SANS ÊTRE RECRÉÉE.
      const { data: occupations } = await admin
        .from('vehicle_occupations')
        .select('id, source, period, is_active')
        .eq('source_id', rentalId)

      const active = (occupations ?? []).filter((o) => o.is_active)
      check(active.length === 1, 'Une seule occupation active subsiste', `${active.length}`)
      check(
        periodBounds(active[0]?.period)?.to.toISOString() ===
          new Date(extended.expected_return_at).toISOString(),
        'La période bloquée suit la nouvelle date attendue'
      )

      // FUSEAU : l'heure saisie est une heure des Comores.
      const savedLocal = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Indian/Comoro',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .format(new Date(extended.expected_return_at))
        .replace(' ', 'T')
      check(
        savedLocal === local,
        'L’heure saisie est relue à l’identique aux Comores',
        `${local} → ${savedLocal}`
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 4 — Collision refusée, période adjacente acceptée\n')

    {
      const { data: current } = await admin
        .from('rentals')
        .select('expected_return_at')
        .eq('id', rentalId)
        .maybeSingle()

      const end = new Date(current.expected_return_at)

      // Une immobilisation accolée à la fin : la prolonger dedans doit échouer.
      const { data: block } = await admin
        .from('vehicle_occupations')
        .insert({
          vehicle_id: fixtures.vehicleIds[0],
          source: 'IMMOBILIZATION',
          period: `[${end.toISOString()},${new Date(end.getTime() + 5 * 864e5).toISOString()})`,
          reason: `${MARK} — blocage`,
        })
        .select('id')
        .single()
      fixtures.blockId = block.id

      const refused = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('extend_rental', {
          p_rental_id: rentalId,
          p_new_end: new Date(end.getTime() + 864e5).toISOString(),
        })
      )

      check(Boolean(refused.error), 'La collision est refusée par la base', refused.error?.code)
      check(
        /exclusion|overlap|23P01/i.test(
          `${refused.error?.code ?? ''} ${refused.error?.message ?? ''}`
        ),
        'Le refus désigne bien un conflit d’engagement, pas une cause inconnue'
      )

      // AUCUNE MODIFICATION PARTIELLE.
      const { data: after } = await admin
        .from('rentals')
        .select('expected_return_at, status')
        .eq('id', rentalId)
        .maybeSingle()
      check(
        new Date(after.expected_return_at).toISOString() === end.toISOString(),
        'La date attendue n’a pas bougé après le refus'
      )

      const { data: occ } = await admin
        .from('vehicle_occupations')
        .select('period')
        .eq('source_id', rentalId)
        .eq('is_active', true)
        .maybeSingle()
      check(
        periodBounds(occ?.period)?.to.toISOString() === end.toISOString(),
        'La période bloquée n’a pas bougé non plus'
      )

      // Le message rendu à l'utilisateur est explicite.
      const { context, page } = await signIn(browser, base, accounts.full)
      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })
      const localTarget = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Indian/Comoro',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .format(new Date(end.getTime() + 864e5))
        .replace(' ', 'T')

      await page.fill('input[name="newEnd"]', localTarget)
      await submitForm(page, 'Prolonger la location')
      await page.waitForTimeout(3000)

      check(
        (await page.getByText('déjà engagée', { exact: false }).count()) >= 1,
        'L’utilisateur lit une cause, pas une indisponibilité muette'
      )

      // Libérer le blocage : la prolongation adjacente redevient possible.
      await admin
        .from('vehicle_occupations')
        .update({ is_active: false, released_at: new Date().toISOString() })
        .eq('id', fixtures.blockId)

      const accepted = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('extend_rental', {
          p_rental_id: rentalId,
          p_new_end: new Date(end.getTime() + 864e5).toISOString(),
        })
      )
      check(!accepted.error, 'La prolongation passe une fois le créneau libéré', accepted.error?.message ?? 'ok')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 5 — Cohérence du véhicule, et rien ne se supprime\n')

    {
      const { data: veh } = await admin
        .from('vehicles')
        .select('status')
        .eq('id', fixtures.vehicleIds[0])
        .maybeSingle()
      check(veh?.status === 'RENTED', 'Le véhicule reste « En location »', veh?.status)

      // Une location en cours ne s'annule pas : elle se termine par un retour.
      const cancelled = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('cancel_rental', { p_rental_id: rentalId, p_reason: 'Recette : refus attendu' })
      )
      check(
        Boolean(cancelled.error),
        'Une location partie ne s’annule pas',
        cancelled.error?.code
      )

      const removal = await asUser(accounts.full, url, anonKey, (c) =>
        c.from('vehicle_occupations').delete().eq('source_id', rentalId).select('id')
      )
      check(
        (removal.data?.length ?? 0) === 0,
        'Une occupation ne se supprime pas',
        removal.error?.code ?? 'aucune ligne'
      )

      // Une prolongation vers le passé est refusée.
      const backwards = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('extend_rental', {
          p_rental_id: rentalId,
          p_new_end: new Date(Date.now() - 864e5).toISOString(),
        })
      )
      check(Boolean(backwards.error), 'Une prolongation vers le passé est refusée', backwards.error?.code)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('DONNÉES DEMO\n')

    {
      const [{ count: clients }, { count: vehicles }] = await Promise.all([
        admin.from('clients').select('id', { count: 'exact', head: true }).like('legal_name', '%DEMO%'),
        admin.from('vehicles').select('id', { count: 'exact', head: true }).like('model', '%DEMO%'),
      ])
      check(clients === 3, 'Les trois clients DEMO sont intacts', `${clients}`)
      check(vehicles === 3, 'Les trois véhicules DEMO sont intacts', `${vehicles}`)
    }
  } finally {
    await browser.close()

    if (fixtures.blockId) await admin.from('vehicle_occupations').delete().eq('id', fixtures.blockId)

    for (const { rentalId, reservationId } of fixtures.rentals) {
      const { data: inspections } = await admin
        .from('rental_inspections')
        .select('id')
        .eq('rental_id', rentalId)
      for (const inspection of inspections ?? []) {
        await admin.from('rental_inspection_photos').delete().eq('inspection_id', inspection.id)
      }
      await admin.from('rental_inspections').delete().eq('rental_id', rentalId)
      await admin.from('vehicle_occupations').delete().eq('source_id', rentalId)
      await admin.from('rentals').delete().eq('id', rentalId)
      await admin.from('vehicle_occupations').delete().eq('source_id', reservationId)
      await admin.from('reservations').delete().eq('id', reservationId)
    }

    if (fixtures.ruleId) await admin.from('pricing_rules').delete().eq('id', fixtures.ruleId)
    for (const vehicleId of fixtures.vehicleIds ?? []) {
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }
    if (fixtures.clientId) await admin.from('clients').delete().eq('id', fixtures.clientId)
    if (fixtures.categoryId)
      await admin.from('vehicle_categories').delete().eq('id', fixtures.categoryId)

    for (const account of Object.values(accounts)) {
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }
    console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE LOCATION EN COURS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE LOCATION EN COURS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
