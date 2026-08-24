#!/usr/bin/env node
/**
 * Recette du départ et de l'état des lieux — Étape 2.3, Lot 4.
 *
 * CE QU'ELLE ÉPROUVE
 *
 *   1. Le départ est ATOMIQUE : location, état des lieux, véhicule et
 *      calendrier bougent ensemble, ou pas du tout.
 *
 *   2. Il est IRRÉPÉTABLE : deux départs sont impossibles, et une location
 *      annulée ne part pas.
 *
 *   3. L'état des lieux est HISTORISÉ : ni écrasable, ni supprimable.
 *
 *   4. Les photos restent PRIVÉES : rattachées à l'inspection, servies par une
 *      route qui vérifie la permission, jamais par une URL stockée.
 *
 *   5. `rental.rentals.checkout` est ATTRIBUABLE SÉPARÉMENT (DEC-024) : voir
 *      une location ne permet pas de la faire partir.
 *
 * Utilisation :
 *   node scripts/verify-checkout.mjs [url]
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
const MARK = `RECETTE DEP ${STAMP}`

const BASE = ['parties.clients.view', 'rental.fleet.view', 'rental.rentals.view']

const PROFILES = [
  // Voir une location, sans pouvoir la faire partir.
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
      'rental.rentals.cancel',
      'rental.rentals.financial.view',
    ],
  },
  // Faire partir sans voir : attribution incohérente, volontairement éprouvée.
  { key: 'checkoutonly', permissions: ['rental.rentals.checkout'] },
]

async function createProfile(admin, profile) {
  const username = `recette.dep.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-dep-${STAMP}`

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
    last_name: `Départ ${profile.key}`,
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

/** Une image PNG minuscule mais valide, pour éprouver le dépôt réel. */
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

  /** Fabrique une location confirmée, prête à partir. */
  async function makeRental(offsetDays) {
    const { data: resNo } = await admin.rpc('next_number', { p_entity_key: 'reservation' })
    const from = new Date(Date.now() + offsetDays * 864e5)
    const to = new Date(Date.now() + (offsetDays + 3) * 864e5)

    const { data: reservation } = await admin
      .from('reservations')
      .insert({
        reservation_no: resNo,
        client_id: fixtures.clientId,
        category_id: fixtures.categoryId,
        period: `[${from.toISOString()},${to.toISOString()})`,
      })
      .select('id')
      .single()

    await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('confirm_reservation', {
        p_reservation_id: reservation.id,
        p_vehicle_id: fixtures.vehicleId,
      })
    )

    const { data: rentalId } = await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('convert_reservation_to_rental', { p_reservation_id: reservation.id })
    )

    await asUser(accounts.full, url, anonKey, (c) =>
      c.from('rentals').update({ status: 'CONFIRMED' }).eq('id', rentalId)
    )

    fixtures.rentals.push({ rentalId, reservationId: reservation.id })
    return rentalId
  }

  try {
    /* --- Sujets de recette ------------------------------------------------ */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RDEP-${STAMP}`, label: `${MARK} — Catégorie` })
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
        model: `DEP ${STAMP}`,
        plate: `RD-${STAMP}`,
        origin: 'OWNED',
        status: 'AVAILABLE',
      })
      .select('id')
      .single()
    fixtures.vehicleId = vehicle.id

    const { data: rule } = await admin
      .from('pricing_rules')
      .insert({ category_id: category.id, amount: 90000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    const rentalId = await makeRental(40)
    console.log(`${DIM}Sujets : ${vehicleNo} · location confirmée prête à partir${RESET}\n`)

    /* ------------------------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('CAS 1 — VIEW seul : voir la location, sans la faire partir\n')

    {
      const { context, page } = await signIn(browser, base, accounts.view)

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Enregistrer le départ' }).count()) === 0,
        'Bouton « Enregistrer le départ » absent'
      )

      await page.goto(`${base}/location/locations/${rentalId}/depart`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Accès direct à l’écran de départ refusé',
        page.url().replace(base, '')
      )

      // L'onglet états des lieux est accessible et DIT qu'il est vide.
      await page.goto(`${base}/location/locations/${rentalId}?onglet=etats`, { waitUntil: 'load' })
      check(
        (await page.getByText('Aucun état des lieux').count()) >= 1,
        'L’absence d’état des lieux est annoncée, pas subie (DEC-017)'
      )

      await context.close()

      const forced = await asUser(accounts.view, url, anonKey, (c) =>
        c.rpc('start_rental', {
          p_rental_id: rentalId,
          p_started_at: new Date().toISOString(),
          p_mileage: 10,
        })
      )
      const { data: untouched } = await admin
        .from('rentals')
        .select('status, started_at')
        .eq('id', rentalId)
        .maybeSingle()

      check(
        untouched?.status === 'CONFIRMED' && untouched?.started_at === null,
        'Aucun départ par appel direct sans « checkout »',
        forced.error?.code ?? untouched?.status
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 2 — Départ nominal : tout bouge ensemble\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Enregistrer le départ' }).count()) === 1,
        'Bouton « Enregistrer le départ » présent'
      )

      await page.getByRole('link', { name: 'Enregistrer le départ' }).click()
      await page.waitForURL((u) => u.href.includes('/depart'), { timeout: 30000 })
      check((await page.locator('#mileage').count()) === 1, 'L’écran de départ est réel')
      check(
        (await page.getByText('sera conservé tel quel', { exact: false }).count()) >= 1,
        'L’écran annonce ce que l’enregistrement va produire'
      )

      const day = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10)
      await page.fill('#startedAt', `${day}T09:00`)
      await page.fill('#mileage', '50000')
      await page.selectOption('select[name="fuelLevel"]', 'THREE_QUARTERS')
      await page.fill('#exteriorCondition', 'Carrosserie propre')
      await page.fill('#interiorCondition', 'Sellerie correcte')
      await page.fill('#preexistingDamages', 'Rayure portière avant droite')
      await page.fill('#observations', 'Recette : départ nominal')
      await page.setInputFiles('#photos', [
        { name: 'depart-avant.png', mimeType: 'image/png', buffer: PNG_1PX },
        { name: 'depart-arriere.png', mimeType: 'image/png', buffer: PNG_1PX },
      ])
      await submitForm(page, 'Enregistrer le départ')
      await page.waitForURL((u) => u.href.includes('parti=1'), { timeout: 30000 })

      const rental = await until(async () => {
        const { data } = await admin
          .from('rentals')
          .select('status, started_at, status_changed_by')
          .eq('id', rentalId)
          .maybeSingle()
        return data?.status === 'IN_PROGRESS' ? data : null
      })

      check(Boolean(rental), 'La location passe « En cours »')
      check(Boolean(rental?.started_at), 'La date de départ réelle est enregistrée')
      check(
        rental?.status_changed_by === accounts.full.id,
        'L’auteur du départ est conservé'
      )

      // FUSEAU : 09:00 saisi doit se relire 09:00 aux Comores.
      const shownHour = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Indian/Comoro',
        hour: '2-digit',
        hour12: false,
      })
        .format(new Date(rental.started_at))
        .replace(/\D/g, '')
      check(
        Number(shownHour) === 9,
        'L’heure de départ est interprétée aux Comores, sans dérive',
        `saisie 09:00 → relue ${shownHour}:00`
      )

      const inspection = await until(async () => {
        const { data } = await admin
          .from('rental_inspections')
          .select('id, kind, mileage, fuel_level, preexisting_damages, observations, created_by')
          .eq('rental_id', rentalId)
          .maybeSingle()
        return data ?? null
      })
      fixtures.inspectionId = inspection?.id ?? null

      check(inspection?.kind === 'DEPARTURE', 'L’état des lieux de départ est créé')
      check(inspection?.mileage === 50000, 'Le kilométrage est enregistré', `${inspection?.mileage}`)
      check(
        inspection?.fuel_level === 'THREE_QUARTERS',
        'Le carburant est enregistré',
        inspection?.fuel_level
      )
      check(
        inspection?.preexisting_damages === 'Rayure portière avant droite',
        'Les dommages préexistants sont enregistrés'
      )
      check(
        inspection?.observations === 'Recette : départ nominal',
        'Les observations sont enregistrées'
      )

      // LE VÉHICULE EST SORTI DU PARC (DEC-025 §c).
      const { data: veh } = await admin
        .from('vehicles')
        .select('status')
        .eq('id', fixtures.vehicleId)
        .maybeSingle()
      check(veh?.status === 'RENTED', 'Le véhicule passe « En location »', veh?.status)

      // L'OCCUPATION SUIT LE DÉPART RÉEL.
      const { data: occ } = await admin
        .from('vehicle_occupations')
        .select('source, is_active, period')
        .eq('source_id', rentalId)
        .maybeSingle()
      check(
        occ?.source === 'RENTAL' && occ?.is_active === true,
        'L’occupation reste active et portée par la location'
      )

      // PHOTOS : deux lignes, rattachées à l'inspection.
      const photos = await until(async () => {
        const { data } = await admin
          .from('rental_inspection_photos')
          .select('id, inspection_id, storage_path, mime_type')
          .eq('inspection_id', fixtures.inspectionId)
        return (data ?? []).length === 2 ? data : null
      })

      check(Boolean(photos), 'Les deux photos sont rattachées à l’état des lieux')
      check(
        (photos ?? []).every((p) =>
          p.storage_path.startsWith(`inspections/depart/${fixtures.inspectionId}/`)
        ),
        'Les photos sont rangées sous inspections/depart/{inspectionId}/ (DEC-025 §f)'
      )

      // La photo s'ouvre par la route, jamais par une URL stockée.
      const photoResponse = await context.request.get(`${base}/api/inspections/${photos[0].id}`)
      check(
        photoResponse.ok(),
        'La photo s’ouvre par la route contrôlée',
        `HTTP ${photoResponse.status()}`
      )

      await page.goto(`${base}/location/locations/${rentalId}?onglet=etats`, { waitUntil: 'load' })
      check(
        (await page.getByText('Rayure portière avant droite', { exact: false }).count()) >= 1,
        'L’onglet « États des lieux » affiche le relevé'
      )
      check(
        (await page.getByText('3/4', { exact: false }).count()) >= 1,
        'Le carburant est affiché en fraction'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 3 — Un seul départ, et rien ne s’écrase\n')

    {
      const again = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('start_rental', {
          p_rental_id: rentalId,
          p_started_at: new Date().toISOString(),
          p_mileage: 99999,
        })
      )
      check(Boolean(again.error), 'Le second départ est refusé', again.error?.code)

      const { count } = await admin
        .from('rental_inspections')
        .select('id', { count: 'exact', head: true })
        .eq('rental_id', rentalId)
      check(count === 1, 'Un seul état des lieux de départ subsiste', `${count}`)

      // Un second état des lieux de départ, inséré directement : refusé.
      const duplicate = await asUser(accounts.full, url, anonKey, (c) =>
        c
          .from('rental_inspections')
          .insert({ rental_id: rentalId, kind: 'DEPARTURE', mileage: 1 })
          .select('id')
      )
      check(
        (duplicate.data?.length ?? 0) === 0,
        'Un second état des lieux de départ est impossible',
        duplicate.error?.code ?? 'aucune ligne'
      )

      // Suppression : impossible, ni pour l'inspection ni pour la photo.
      const removeInspection = await asUser(accounts.full, url, anonKey, (c) =>
        c.from('rental_inspections').delete().eq('id', fixtures.inspectionId).select('id')
      )
      check(
        (removeInspection.data?.length ?? 0) === 0,
        'Un état des lieux ne se supprime pas',
        removeInspection.error?.code ?? 'aucune ligne'
      )

      const removePhoto = await asUser(accounts.full, url, anonKey, (c) =>
        c.from('rental_inspection_photos').delete().eq('inspection_id', fixtures.inspectionId).select('id')
      )
      check(
        (removePhoto.data?.length ?? 0) === 0,
        'Une photo d’état des lieux ne se supprime pas',
        removePhoto.error?.code ?? 'aucune ligne'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 4 — Une location annulée ne part pas\n')

    {
      const cancelledId = await makeRental(60)
      await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('cancel_rental', { p_rental_id: cancelledId, p_reason: 'Recette : annulée' })
      )

      const refused = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('start_rental', {
          p_rental_id: cancelledId,
          p_started_at: new Date().toISOString(),
        })
      )
      check(Boolean(refused.error), 'Le départ d’une location annulée est refusé', refused.error?.code)

      const { count } = await admin
        .from('rental_inspections')
        .select('id', { count: 'exact', head: true })
        .eq('rental_id', cancelledId)
      check(count === 0, 'Aucun état des lieux n’a été créé pour elle', `${count}`)

      // L'écran le dit clairement plutôt que d'échouer en silence.
      const { context, page } = await signIn(browser, base, accounts.full)
      await page.goto(`${base}/location/locations/${cancelledId}/depart`, { waitUntil: 'load' })
      check(
        (await page.getByText('Seule une location confirmée peut partir', { exact: false }).count()) >= 1,
        'L’écran explique pourquoi le départ est impossible'
      )
      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 5 — CHECKOUT sans VOIR : aucun contournement\n')

    {
      const { context, page } = await signIn(browser, base, accounts.checkoutonly)

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'Fiche refusée sans « voir »')

      const photoResponse = await context.request.get(
        `${base}/api/inspections/00000000-0000-0000-0000-000000000000`
      )
      check(
        photoResponse.status() === 403 || photoResponse.status() === 404,
        'La route photo refuse un compte sans « voir »',
        `HTTP ${photoResponse.status()}`
      )

      await context.close()

      const read = await asUser(accounts.checkoutonly, url, anonKey, (c) =>
        c.from('rental_inspections').select('id').eq('rental_id', rentalId)
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

    // Les photos déposées sont retirées du bucket, puis les lignes.
    if (fixtures.inspectionId) {
      const { data: photos } = await admin
        .from('rental_inspection_photos')
        .select('storage_path')
        .eq('inspection_id', fixtures.inspectionId)

      if ((photos ?? []).length > 0) {
        await admin.storage
          .from('vehicle-documents')
          .remove(photos.map((p) => p.storage_path))
      }
      await admin.from('rental_inspection_photos').delete().eq('inspection_id', fixtures.inspectionId)
    }

    for (const { rentalId, reservationId } of fixtures.rentals) {
      await admin.from('rental_inspections').delete().eq('rental_id', rentalId)
      await admin.from('vehicle_occupations').delete().eq('source_id', rentalId)
      await admin.from('rentals').delete().eq('id', rentalId)
      await admin.from('vehicle_occupations').delete().eq('source_id', reservationId)
      await admin.from('reservations').delete().eq('id', reservationId)
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
    console.log(`\n${DIM}Sujets, photos et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE DÉPART : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE DÉPART : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
