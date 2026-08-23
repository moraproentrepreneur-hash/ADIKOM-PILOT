#!/usr/bin/env node
/**
 * Recette du module Locations — Étape 2.3, Lot 3.
 *
 * CE QU'ELLE ÉPROUVE
 *
 *   1. La conversion produit un CONTRAT FIDÈLE : client, véhicule, période et
 *      surtout le tarif VERROUILLÉ de la réservation, jamais résolu de nouveau.
 *
 *   2. L'engagement du véhicule est CONTINU : l'occupation change d'origine,
 *      elle n'est ni supprimée ni recréée. Aucune fenêtre pendant laquelle le
 *      véhicule paraîtrait libre.
 *
 *   3. Les capacités restent SÉPARÉES (DEC-024) : voir, créer, modifier et
 *      annuler sont quatre permissions ; `view` reste exigé pour atteindre la
 *      ressource, et aucune route ne se contourne.
 *
 *   4. Rien ne se supprime : une location annulée reste consultable et son
 *      occupation est libérée, pas effacée.
 *
 * Les documents relèvent du LOT 8 : ils ne sont pas éprouvés ici.
 *
 * Utilisation :
 *   node scripts/verify-rentals.mjs [url]
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
const MARK = `RECETTE LOC ${STAMP}`

const BASE = ['rental.reservations.view', 'parties.clients.view', 'rental.fleet.view']

const PROFILES = [
  // Voir les locations, sans pouvoir en créer.
  { key: 'view', permissions: [...BASE, 'rental.rentals.view'] },
  {
    key: 'full',
    permissions: [
      ...BASE,
      'rental.reservations.confirm',
      'rental.rentals.view',
      'rental.rentals.create',
      'rental.rentals.update',
      'rental.rentals.cancel',
      'rental.rentals.financial.view',
    ],
  },
  // Créer une location sans pouvoir la consulter : attribution incohérente.
  { key: 'createonly', permissions: ['rental.rentals.create'] },
]

async function createProfile(admin, profile) {
  const username = `recette.loc.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-loc-${STAMP}`

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
    last_name: `Location ${profile.key}`,
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

async function until(read, timeoutMs = 15000) {
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
  const fixtures = {}
  const browser = await chromium.launch()

  try {
    /* --- Sujets de recette, jamais les données DEMO ---------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RLOC-${STAMP}`, label: `${MARK} — Catégorie` })
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

    const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
    const { data: vehicle } = await admin
      .from('vehicles')
      .insert({
        vehicle_no: vehicleNo,
        category_id: category.id,
        brand: 'RECETTE',
        model: `LOC ${STAMP}`,
        plate: `RL-${STAMP}`,
        origin: 'OWNED',
        status: 'AVAILABLE',
      })
      .select('id')
      .single()
    fixtures.vehicleId = vehicle.id

    const { data: rule } = await admin
      .from('pricing_rules')
      .insert({ category_id: category.id, amount: 175000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    // Une réservation confirmée : le point de départ du contrat.
    const from = new Date(Date.now() + 30 * 864e5)
    const to = new Date(Date.now() + 33 * 864e5)
    const { data: resNo } = await admin.rpc('next_number', { p_entity_key: 'reservation' })
    const { data: reservation } = await admin
      .from('reservations')
      .insert({
        reservation_no: resNo,
        client_id: client.id,
        category_id: category.id,
        period: `[${from.toISOString()},${to.toISOString()})`,
        conditions: 'Recette : conditions du contrat',
      })
      .select('id')
      .single()
    fixtures.reservationId = reservation.id

    await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('confirm_reservation', {
        p_reservation_id: reservation.id,
        p_vehicle_id: vehicle.id,
      })
    )

    console.log(`${DIM}Sujets : ${resNo} confirmée · ${vehicleNo} · 175 000 KMF/jour${RESET}\n`)

    /* ------------------------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('CAS 1 — VIEW seul : consulter, sans pouvoir convertir\n')

    {
      const { context, page } = await signIn(browser, base, accounts.view)

      await page.goto(`${base}/location/locations`, { waitUntil: 'load' })
      check(
        !page.url().includes('/acces-refuse'),
        'La liste des locations est accessible',
        page.url().replace(base, '')
      )

      await page.goto(`${base}/location/reservations/${fixtures.reservationId}`, {
        waitUntil: 'load',
      })
      check(
        (await page.getByRole('button', { name: 'Convertir en location', exact: true }).count()) === 0,
        'Bouton « Convertir en location » absent sans « créer »'
      )

      await context.close()

      const forced = await asUser(accounts.view, url, anonKey, (c) =>
        c.rpc('convert_reservation_to_rental', { p_reservation_id: fixtures.reservationId })
      )
      const { count } = await admin
        .from('rentals')
        .select('id', { count: 'exact', head: true })
        .eq('reservation_id', fixtures.reservationId)

      check(
        count === 0,
        'Aucune location créée par appel direct sans « créer »',
        forced.error?.code ?? `${count} location(s)`
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 2 — Conversion : un contrat fidèle à la réservation\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/reservations/${fixtures.reservationId}`, {
        waitUntil: 'load',
      })
      check(
        (await page.getByRole('button', { name: 'Convertir en location', exact: true }).count()) === 1,
        'Bouton « Convertir en location » présent'
      )

      await submitForm(page, 'Convertir en location')
      await page.waitForURL((u) => u.href.includes('/location/locations/'), { timeout: 30000 })

      const rental = await until(async () => {
        const { data } = await admin
          .from('rentals')
          .select(
            'id, rental_no, client_id, vehicle_id, planned_period, expected_return_at, locked_amount, locked_unit, locked_source, status, conditions, created_by'
          )
          .eq('reservation_id', fixtures.reservationId)
          .maybeSingle()
        return data ?? null
      })
      fixtures.rentalId = rental?.id ?? null

      check(Boolean(rental), 'Le contrat est enregistré', rental?.rental_no)
      check(
        /^LOC-\d{4}-\d{6}$/.test(rental?.rental_no ?? ''),
        'Identifiant attribué côté serveur (DEC-005)',
        rental?.rental_no
      )
      check(rental?.client_id === fixtures.clientId, 'Le client est repris')
      check(rental?.vehicle_id === fixtures.vehicleId, 'Le véhicule est repris')
      check(rental?.status === 'PREPARING', 'Statut initial « En préparation »', rental?.status)
      check(
        rental?.conditions === 'Recette : conditions du contrat',
        'Les conditions sont reprises'
      )
      check(rental?.created_by === accounts.full.id, 'L’auteur de la conversion est conservé')

      // LE TARIF EST REPRIS, PAS RÉSOLU DE NOUVEAU.
      check(
        rental?.locked_amount === 175000 && rental?.locked_unit === 'DAY',
        'Le tarif verrouillé de la réservation est repris',
        `${rental?.locked_amount} / ${rental?.locked_unit}`
      )

      // Cohérence des dates : la période et le retour attendu suivent.
      const { data: res } = await admin
        .from('reservations')
        .select('period, status')
        .eq('id', fixtures.reservationId)
        .maybeSingle()

      check(res?.status === 'CONVERTED', 'La réservation passe à « Convertie »', res?.status)
      check(
        (rental?.planned_period ?? '') === (res?.period ?? 'x'),
        'La période du contrat est celle de la réservation'
      )

      const upper = /,"?([^",)\]]+)/.exec(res?.period ?? '')?.[1] ?? ''
      const expected = new Date(
        upper.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
      ).toISOString()
      check(
        new Date(rental?.expected_return_at ?? 0).toISOString() === expected,
        'Le retour attendu est la fin de la période réservée'
      )

      // CONTINUITÉ DE L'ENGAGEMENT : une seule occupation, changée d'origine.
      const { data: occupations } = await admin
        .from('vehicle_occupations')
        .select('source, source_id, is_active')
        .eq('vehicle_id', fixtures.vehicleId)

      const active = (occupations ?? []).filter((o) => o.is_active)
      check(active.length === 1, 'Une seule occupation active', `${active.length}`)
      check(
        active[0]?.source === 'RENTAL' && active[0]?.source_id === fixtures.rentalId,
        'L’occupation a changé d’origine, sans interruption',
        active[0]?.source
      )

      check(
        (await page.getByText('175 000', { exact: false }).count()) >= 1,
        'La fiche affiche le tarif verrouillé avec la permission financière'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 3 — Une réservation ne se convertit pas deux fois\n')

    {
      const again = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('convert_reservation_to_rental', { p_reservation_id: fixtures.reservationId })
      )
      check(Boolean(again.error), 'La seconde conversion est refusée', again.error?.code)

      const { count } = await admin
        .from('rentals')
        .select('id', { count: 'exact', head: true })
        .eq('reservation_id', fixtures.reservationId)
      check(count === 1, 'Une seule location existe pour cette réservation', `${count}`)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 4 — Confirmation du contrat, puis annulation\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/locations/${fixtures.rentalId}`, { waitUntil: 'load' })
      await submitForm(page, 'Confirmer le contrat')

      const confirmed = await until(async () => {
        const { data } = await admin
          .from('rentals')
          .select('status, status_changed_by')
          .eq('id', fixtures.rentalId)
          .maybeSingle()
        return data?.status === 'CONFIRMED' ? data : null
      })

      check(Boolean(confirmed), 'Le contrat passe à « Confirmée »')
      check(
        confirmed?.status_changed_by === accounts.full.id,
        'L’auteur du changement est conservé'
      )

      await page.goto(`${base}/location/locations/${fixtures.rentalId}`, { waitUntil: 'load' })
      await page.fill('input[name="reason"]', 'Recette : désistement')
      await submitForm(page, 'Annuler la location')

      const cancelled = await until(async () => {
        const { data } = await admin
          .from('rentals')
          .select('status, status_reason')
          .eq('id', fixtures.rentalId)
          .maybeSingle()
        return data?.status === 'CANCELLED' ? data : null
      })

      check(Boolean(cancelled), 'La location est annulée')
      check(cancelled?.status_reason === 'Recette : désistement', 'Le motif est conservé')

      const { data: occ } = await admin
        .from('vehicle_occupations')
        .select('is_active, released_at')
        .eq('source_id', fixtures.rentalId)
        .maybeSingle()

      check(occ?.is_active === false, 'Le véhicule est libéré')
      check(Boolean(occ?.released_at), 'L’occupation est libérée, pas effacée')

      // La fiche subsiste : annuler n'est pas supprimer.
      await page.goto(`${base}/location/locations/${fixtures.rentalId}`, { waitUntil: 'load' })
      check(
        (await page.getByText(MARK, { exact: false }).count()) >= 1,
        'La fiche reste consultable après annulation'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 5 — Aucune suppression, aucun contournement\n')

    {
      const removal = await asUser(accounts.full, url, anonKey, (c) =>
        c.from('rentals').delete().eq('id', fixtures.rentalId).select('id')
      )
      check(
        (removal.data?.length ?? 0) === 0,
        'La suppression d’une location est impossible',
        removal.error?.code ?? 'aucune ligne'
      )

      // Une location annulée ne repart pas.
      const revived = await asUser(accounts.full, url, anonKey, (c) =>
        c.from('rentals').update({ status: 'IN_PROGRESS' }).eq('id', fixtures.rentalId).select('id')
      )
      check(
        (revived.data?.length ?? 0) === 0,
        'Une location annulée ne peut pas repartir',
        revived.error?.code ?? 'aucune ligne'
      )

      const { context, page } = await signIn(browser, base, accounts.createonly)

      await page.goto(`${base}/location/locations`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'Liste refusée sans « voir »')

      await page.goto(`${base}/location/locations/${fixtures.rentalId}`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'Fiche refusée sans « voir »')

      await context.close()

      const read = await asUser(accounts.createonly, url, anonKey, (c) =>
        c.from('rentals').select('id').eq('id', fixtures.rentalId)
      )
      check((read.data?.length ?? 0) === 0, 'RLS ne laisse rien lire sans « voir »')
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

    if (fixtures.rentalId) {
      await admin.from('vehicle_occupations').delete().eq('source_id', fixtures.rentalId)
      await admin.from('rentals').delete().eq('id', fixtures.rentalId)
    }
    if (fixtures.reservationId) {
      await admin.from('vehicle_occupations').delete().eq('source_id', fixtures.reservationId)
      await admin.from('reservations').delete().eq('id', fixtures.reservationId)
    }
    if (fixtures.ruleId) await admin.from('pricing_rules').delete().eq('id', fixtures.ruleId)
    if (fixtures.vehicleId) await admin.from('vehicles').delete().eq('id', fixtures.vehicleId)
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
    console.log(`${GREEN}RECETTE LOCATIONS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE LOCATIONS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
