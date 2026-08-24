#!/usr/bin/env node
/**
 * Recette du retour et du contrôle — Étape 2.3, Lot 6.
 *
 * CE QU'ELLE ÉPROUVE
 *
 *   1. Le retour est ATOMIQUE : état des lieux, dates, statuts, calendrier et
 *      véhicule bougent ensemble, ou pas du tout.
 *
 *   2. Il est IRRÉPÉTABLE et CONDITIONNÉ : pas deux fois, pas avant le départ,
 *      pas sur une location annulée, pas avec un compteur qui recule.
 *
 *   3. L'état des lieux de départ n'est JAMAIS écrasé : les deux inspections
 *      coexistent, et le contrôle les compare.
 *
 *   4. Rien n'est valorisé : aucun montant n'apparaît sur un écart de
 *      carburant, de kilométrage, de retard ou de dommage (DEC-008, DEC-025 §i).
 *
 *   5. `rental.rentals.return` est ATTRIBUABLE SÉPARÉMENT (DEC-024).
 *
 * Utilisation :
 *   node scripts/verify-rental-return.mjs [url]
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
const MARK = `RECETTE RET ${STAMP}`

const BASE = ['parties.clients.view', 'rental.fleet.view', 'rental.rentals.view']

const PROFILES = [
  // Suivre une location, sans pouvoir la retourner.
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
      'rental.rentals.return',
      'rental.rentals.close',
      'rental.rentals.financial.view',
    ],
  },
  // Retourner sans voir : attribution incohérente, volontairement éprouvée.
  { key: 'returnonly', permissions: ['rental.rentals.return'] },
]

async function createProfile(admin, profile) {
  const username = `recette.ret.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-ret-${STAMP}`

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
    last_name: `Retour ${profile.key}`,
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

/** Heure locale des Comores au format `datetime-local`. */
function toLocal(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Indian/Comoro',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(' ', 'T')
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
)

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

  /**
   * Location au stade voulu.
   * `stage` : 'confirmed' | 'running' | 'cancelled'
   */
  async function makeRental({ vehicleId, offsetDays, stage, mileage = 20000 }) {
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

    fixtures.rentals.push({ rentalId, reservationId: reservation.id })

    await asUser(accounts.full, url, anonKey, (c) =>
      c.from('rentals').update({ status: 'CONFIRMED' }).eq('id', rentalId)
    )

    if (stage === 'cancelled') {
      await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('cancel_rental', { p_rental_id: rentalId, p_reason: 'Recette' })
      )
      return { rentalId, from, to }
    }

    if (stage === 'running') {
      await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('start_rental', {
          p_rental_id: rentalId,
          p_started_at: from.toISOString(),
          p_mileage: mileage,
          p_fuel_level: 'FULL',
          p_preexisting_damages: 'Rayure portière avant droite',
        })
      )
    }

    return { rentalId, from, to }
  }

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RRET-${STAMP}`, label: `${MARK} — Catégorie` })
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
      .insert({ category_id: category.id, amount: 110000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    fixtures.vehicleIds = []
    for (const suffix of ['A', 'B', 'C', 'D']) {
      const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
      const { data: vehicle } = await admin
        .from('vehicles')
        .insert({
          vehicle_no: vehicleNo,
          category_id: category.id,
          brand: 'RECETTE',
          model: `RET ${STAMP} ${suffix}`,
          plate: `RT-${STAMP}${suffix}`,
          origin: 'OWNED',
          status: 'AVAILABLE',
        })
        .select('id')
        .single()
      fixtures.vehicleIds.push(vehicle.id)
    }

    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    const main = await makeRental({
      vehicleId: fixtures.vehicleIds[0],
      offsetDays: 70,
      stage: 'running',
    })
    fixtures.mainRentalId = main.rentalId

    console.log(`${DIM}Sujet : location en cours · départ 20 000 km · plein${RESET}\n`)

    /* ------------------------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('CAS 1 — VIEW seul : suivre, sans pouvoir retourner\n')

    {
      const { context, page } = await signIn(browser, base, accounts.view)

      await page.goto(`${base}/location/locations/${main.rentalId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Enregistrer le retour' }).count()) === 0,
        'Bouton « Enregistrer le retour » absent'
      )

      await page.goto(`${base}/location/locations/${main.rentalId}/retour`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Accès direct à l’écran de retour refusé',
        page.url().replace(base, '')
      )

      // L'onglet Contrôle existe et DIT qu'il n'y a rien à comparer.
      await page.goto(`${base}/location/locations/${main.rentalId}?onglet=controle`, {
        waitUntil: 'load',
      })
      check(
        (await page.getByText('pas encore rentré', { exact: false }).count()) >= 1,
        'L’absence de retour est annoncée, pas subie (DEC-017)'
      )

      await context.close()

      const forced = await asUser(accounts.view, url, anonKey, (c) =>
        c.rpc('return_rental', {
          p_rental_id: main.rentalId,
          p_returned_at: new Date().toISOString(),
          p_mileage: 21000,
        })
      )
      const { data: untouched } = await admin
        .from('rentals')
        .select('status, returned_at')
        .eq('id', main.rentalId)
        .maybeSingle()

      check(
        untouched?.status === 'IN_PROGRESS' && untouched?.returned_at === null,
        'Aucun retour par appel direct sans « retour »',
        forced.error?.code ?? untouched?.status
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 2 — Le compteur ne recule pas\n')

    {
      const backwards = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('return_rental', {
          p_rental_id: main.rentalId,
          p_returned_at: new Date().toISOString(),
          p_mileage: 19000,
        })
      )
      check(
        Boolean(backwards.error),
        'Un kilométrage de retour inférieur au départ est refusé',
        backwards.error?.code
      )

      const { count } = await admin
        .from('rental_inspections')
        .select('id', { count: 'exact', head: true })
        .eq('rental_id', main.rentalId)
      check(count === 1, 'Aucun état des lieux de retour n’a été créé', `${count}`)

      const before = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('return_rental', {
          p_rental_id: main.rentalId,
          p_returned_at: new Date(main.from.getTime() - 864e5).toISOString(),
          p_mileage: 21000,
        })
      )
      check(
        Boolean(before.error),
        'Un retour antérieur au départ est refusé',
        before.error?.code
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 3 — Retour nominal : tout bouge ensemble\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/locations/${main.rentalId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Enregistrer le retour' }).count()) === 1,
        'Bouton « Enregistrer le retour » présent'
      )

      await page.getByRole('link', { name: 'Enregistrer le retour' }).click()
      await page.waitForURL((u) => u.href.includes('/retour'), { timeout: 30000 })

      check(
        (await page.getByText('Référence — état des lieux de départ', { exact: false }).count()) >= 1,
        'L’écran distingue visuellement ce qui vient du départ'
      )
      check(
        (await page.getByText('20 000', { exact: false }).count()) >= 1,
        'Le kilométrage de départ est rappelé comme référence'
      )
      check(
        (await page.getByText('constatés, jamais chiffrés', { exact: false }).count()) >= 1,
        'L’écran annonce qu’aucun écart n’est valorisé'
      )

      const returnedAt = new Date(main.to.getTime() - 3600e3)
      await page.fill('#returnedAt', toLocal(returnedAt))
      await page.fill('#mileage', '20800')
      await page.selectOption('select[name="fuelLevel"]', 'HALF')
      await page.fill('#exteriorCondition', 'Propre, hormis le point ci-dessous')
      await page.fill('#interiorCondition', 'Correct')
      await page.fill('#newDamages', 'Rétroviseur droit fissuré')
      await page.fill('#observations', 'Recette : retour nominal')
      await page.setInputFiles('#photos', [
        { name: 'retour-avant.png', mimeType: 'image/png', buffer: PNG_1PX },
      ])
      await submitForm(page, 'Enregistrer le retour')
      await page.waitForURL((u) => u.href.includes('rentre=1'), { timeout: 30000 })

      const rental = await until(async () => {
        const { data } = await admin
          .from('rentals')
          .select('status, returned_at, started_at, status_changed_by')
          .eq('id', main.rentalId)
          .maybeSingle()
        return data?.status === 'TO_CONTROL' ? data : null
      })

      check(Boolean(rental), 'La location passe « À contrôler »')
      check(Boolean(rental?.returned_at), 'La date de retour réelle est enregistrée')
      check(
        rental?.returned_at !== rental?.started_at,
        'La date réelle de retour est distincte de celle du départ'
      )

      // FUSEAU.
      check(
        toLocal(new Date(rental.returned_at)) === toLocal(returnedAt),
        'L’heure de retour est relue à l’identique aux Comores',
        `${toLocal(returnedAt)} → ${toLocal(new Date(rental.returned_at))}`
      )

      // DEUX INSPECTIONS, NI ÉCRASÉES NI CONFONDUES.
      const { data: inspections } = await admin
        .from('rental_inspections')
        .select('id, kind, mileage, fuel_level, preexisting_damages, observations')
        .eq('rental_id', main.rentalId)
        .order('kind')

      const departure = (inspections ?? []).find((i) => i.kind === 'DEPARTURE')
      const back = (inspections ?? []).find((i) => i.kind === 'RETURN')
      fixtures.returnInspectionId = back?.id ?? null

      check((inspections ?? []).length === 2, 'Les deux états des lieux coexistent')
      check(
        departure?.mileage === 20000 && departure?.fuel_level === 'FULL',
        'L’état des lieux de départ est intact',
        `${departure?.mileage} km · ${departure?.fuel_level}`
      )
      check(
        departure?.preexisting_damages === 'Rayure portière avant droite',
        'Les dommages préexistants du départ ne sont pas écrasés'
      )
      check(
        back?.mileage === 20800 && back?.fuel_level === 'HALF',
        'Les relevés du retour sont enregistrés',
        `${back?.mileage} km · ${back?.fuel_level}`
      )
      check(
        back?.preexisting_damages === 'Rétroviseur droit fissuré',
        'Les nouveaux dommages sont enregistrés séparément'
      )
      check(
        back?.observations === 'Recette : retour nominal',
        'Les observations du retour sont enregistrées'
      )

      // LE VÉHICULE EST RENTRÉ.
      const { data: veh } = await admin
        .from('vehicles')
        .select('status')
        .eq('id', fixtures.vehicleIds[0])
        .maybeSingle()
      check(veh?.status === 'AVAILABLE', 'Le véhicule quitte « En location »', veh?.status)

      // LE CALENDRIER EST LIBÉRÉ.
      const { data: occ } = await admin
        .from('vehicle_occupations')
        .select('is_active, released_at')
        .eq('source_id', main.rentalId)
        .maybeSingle()
      check(occ?.is_active === false, 'L’occupation ne bloque plus')
      check(Boolean(occ?.released_at), 'L’occupation est libérée, pas effacée')

      // PHOTOS DE RETOUR, RANGÉES À PART.
      const photos = await until(async () => {
        const { data } = await admin
          .from('rental_inspection_photos')
          .select('id, storage_path, inspection_id')
          .eq('inspection_id', fixtures.returnInspectionId)
        return (data ?? []).length === 1 ? data : null
      })
      check(Boolean(photos), 'La photo de retour est rattachée à l’inspection de retour')
      check(
        photos?.[0]?.storage_path.startsWith(`inspections/retour/${fixtures.returnInspectionId}/`),
        'Elle est rangée sous inspections/retour/, distinctement du départ',
        photos?.[0]?.storage_path.split('/').slice(0, 2).join('/')
      )

      const { data: departurePhotos } = await admin
        .from('rental_inspection_photos')
        .select('storage_path')
        .eq('inspection_id', departure.id)
      check(
        (departurePhotos ?? []).every((p) => p.storage_path.startsWith('inspections/depart/')),
        'Les photos de départ restent sous inspections/depart/'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 4 — Contrôle : comparer, sans chiffrer\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/locations/${main.rentalId}?onglet=controle`, {
        waitUntil: 'load',
      })

      check(
        (await page.getByText('800 km', { exact: false }).count()) >= 1,
        'La distance parcourue est calculée : 800 km'
      )
      check(
        (await page.getByText('Plein', { exact: false }).count()) >= 1 &&
          (await page.getByText('1/2', { exact: false }).count()) >= 1,
        'L’écart de carburant est présenté en fractions : Plein → 1/2'
      )
      check(
        (await page.getByText('Rayure portière avant droite', { exact: false }).count()) >= 1 &&
          (await page.getByText('Rétroviseur droit fissuré', { exact: false }).count()) >= 1,
        'Dommages préexistants et nouveaux sont distingués'
      )
      check(
        (await page.getByText('KMF', { exact: false }).count()) === 0,
        'AUCUN montant n’apparaît dans le contrôle'
      )

      await submitForm(page, 'Valider le contrôle')

      const closed = await until(async () => {
        const { data } = await admin
          .from('rentals')
          .select('status')
          .eq('id', main.rentalId)
          .maybeSingle()
        return data?.status === 'TO_INVOICE' ? data : null
      })
      check(Boolean(closed), 'Le contrôle validé fait passer la location « À facturer »')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 5 — Un seul retour, et rien ne se supprime\n')

    {
      const again = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('return_rental', {
          p_rental_id: main.rentalId,
          p_returned_at: new Date().toISOString(),
          p_mileage: 30000,
        })
      )
      check(Boolean(again.error), 'Le second retour est refusé', again.error?.code)

      const { count } = await admin
        .from('rental_inspections')
        .select('id', { count: 'exact', head: true })
        .eq('rental_id', main.rentalId)
      check(count === 2, 'Toujours deux états des lieux, pas trois', `${count}`)

      const removal = await asUser(accounts.full, url, anonKey, (c) =>
        c.from('rental_inspections').delete().eq('rental_id', main.rentalId).select('id')
      )
      check(
        (removal.data?.length ?? 0) === 0,
        'Un état des lieux ne se supprime pas',
        removal.error?.code ?? 'aucune ligne'
      )

      const photoRemoval = await asUser(accounts.full, url, anonKey, (c) =>
        c
          .from('rental_inspection_photos')
          .delete()
          .eq('inspection_id', fixtures.returnInspectionId)
          .select('id')
      )
      check(
        (photoRemoval.data?.length ?? 0) === 0,
        'Une photo de retour ne se supprime pas',
        photoRemoval.error?.code ?? 'aucune ligne'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 6 — Retours impossibles : jamais partie, annulée\n')

    {
      const notLeft = await makeRental({
        vehicleId: fixtures.vehicleIds[1],
        offsetDays: 80,
        stage: 'confirmed',
      })
      const refusedNotLeft = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('return_rental', {
          p_rental_id: notLeft.rentalId,
          p_returned_at: new Date().toISOString(),
        })
      )
      check(
        Boolean(refusedNotLeft.error),
        'Le retour d’une location jamais partie est refusé',
        refusedNotLeft.error?.code
      )

      const cancelled = await makeRental({
        vehicleId: fixtures.vehicleIds[2],
        offsetDays: 90,
        stage: 'cancelled',
      })
      const refusedCancelled = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('return_rental', {
          p_rental_id: cancelled.rentalId,
          p_returned_at: new Date().toISOString(),
        })
      )
      check(
        Boolean(refusedCancelled.error),
        'Le retour d’une location annulée est refusé',
        refusedCancelled.error?.code
      )

      // L'écran l'explique au lieu d'échouer en silence.
      const { context, page } = await signIn(browser, base, accounts.full)
      await page.goto(`${base}/location/locations/${notLeft.rentalId}/retour`, {
        waitUntil: 'load',
      })
      check(
        (await page.getByText('jamais partie', { exact: false }).count()) >= 1,
        'L’écran explique pourquoi le retour est impossible'
      )
      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 7 — Location prolongée, rendue en retard\n')

    {
      const late = await makeRental({
        vehicleId: fixtures.vehicleIds[3],
        offsetDays: -6,
        stage: 'running',
        mileage: 5000,
      })

      // Prolongée, puis rendue APRÈS la nouvelle date attendue.
      const { data: before } = await admin
        .from('rentals')
        .select('expected_return_at')
        .eq('id', late.rentalId)
        .maybeSingle()

      const newEnd = new Date(new Date(before.expected_return_at).getTime() + 864e5)
      const extended = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('extend_rental', { p_rental_id: late.rentalId, p_new_end: newEnd.toISOString() })
      )
      check(!extended.error, 'La location est prolongée', extended.error?.message ?? 'ok')

      // Retour deux jours APRÈS la date attendue : le retard est constaté.
      const returnedAt = new Date(newEnd.getTime() + 2 * 864e5)
      const done = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('return_rental', {
          p_rental_id: late.rentalId,
          p_returned_at: returnedAt.toISOString(),
          p_mileage: 5400,
          p_fuel_level: 'QUARTER',
        })
      )
      check(!done.error, 'Une location prolongée se retourne normalement', done.error?.message ?? 'ok')

      const { data: rental } = await admin
        .from('rentals')
        .select('status, returned_at, expected_return_at, locked_amount')
        .eq('id', late.rentalId)
        .maybeSingle()

      check(rental?.status === 'TO_CONTROL', 'Elle passe « À contrôler »', rental?.status)
      check(
        new Date(rental.returned_at).getTime() > new Date(rental.expected_return_at).getTime(),
        'Le retour réel est postérieur au retour attendu : le retard est constaté'
      )
      check(
        rental?.locked_amount === 110000,
        'Le tarif verrouillé n’a pas bougé malgré le retard',
        `${rental?.locked_amount}`
      )

      // L'occupation a été ramenée à la durée réellement occupée, puis libérée.
      const { data: occ } = await admin
        .from('vehicle_occupations')
        .select('is_active, period')
        .eq('source_id', late.rentalId)
        .maybeSingle()
      check(occ?.is_active === false, 'La période est libérée après un retour tardif')

      const upper = /,"?([^",)\]]+)/.exec(occ?.period ?? '')?.[1] ?? ''
      const upperDate = new Date(upper.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
      check(
        Math.abs(upperDate.getTime() - returnedAt.getTime()) < 2000,
        'La période conservée reflète la durée réellement occupée',
        upperDate.toISOString()
      )

      const { data: veh } = await admin
        .from('vehicles')
        .select('status')
        .eq('id', fixtures.vehicleIds[3])
        .maybeSingle()
      check(veh?.status === 'AVAILABLE', 'Le véhicule est de nouveau disponible', veh?.status)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 8 — RETURN sans VOIR : aucun contournement\n')

    {
      const { context, page } = await signIn(browser, base, accounts.returnonly)

      await page.goto(`${base}/location/locations/${main.rentalId}`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'Fiche refusée sans « voir »')

      await context.close()

      const read = await asUser(accounts.returnonly, url, anonKey, (c) =>
        c.from('rental_inspections').select('id').eq('rental_id', main.rentalId)
      )
      check((read.data?.length ?? 0) === 0, 'RLS ne laisse lire aucun état des lieux sans « voir »')
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

    for (const { rentalId, reservationId } of fixtures.rentals) {
      const { data: inspections } = await admin
        .from('rental_inspections')
        .select('id')
        .eq('rental_id', rentalId)

      for (const inspection of inspections ?? []) {
        const { data: photos } = await admin
          .from('rental_inspection_photos')
          .select('storage_path')
          .eq('inspection_id', inspection.id)
        if ((photos ?? []).length > 0) {
          await admin.storage.from('vehicle-documents').remove(photos.map((p) => p.storage_path))
        }
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
    console.log(`\n${DIM}Sujets, photos et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE RETOUR ET CONTRÔLE : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE RETOUR ET CONTRÔLE : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
