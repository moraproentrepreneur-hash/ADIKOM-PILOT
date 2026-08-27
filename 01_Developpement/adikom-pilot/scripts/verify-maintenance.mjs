#!/usr/bin/env node
/**
 * Recette de la maintenance — Étape 2.4, LOT 2.
 *
 * CE QU'ELLE ÉPROUVE
 *
 *   1. Une maintenance NON IMMOBILISANTE ne bloque rien : aucune occupation,
 *      véhicule toujours louable.
 *   2. Une maintenance IMMOBILISANTE pose son occupation `MAINTENANCE` et
 *      sort le véhicule du service — atomiquement.
 *   3. Une collision est REFUSÉE PAR LA BASE et ne laisse AUCUNE fiche
 *      partielle. L'écran l'explique au lieu de la subir.
 *   4. Panne pendant une location : déclarable immédiatement, sans
 *      immobilisation, et immobilisable seulement une fois le véhicule rendu.
 *   5. « Terminée » atteste d'un contrôle : elle n'est atteignable que depuis
 *      « En cours », libère l'occupation sans l'effacer, et rend le véhicule.
 *   6. Les cinq permissions sont ATTRIBUABLES SÉPARÉMENT (DEC-024).
 *   7. AUCUN MONTANT nulle part (DEC-008 ; les coûts relèvent du LOT 3).
 *   8. DEC-017 : un défaut de droit se DIT, il ne se présente jamais comme une
 *      absence de donnée.
 *
 * Utilisation :
 *   node scripts/verify-maintenance.mjs [url]
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
const MARK = `RECETTE MNT ${STAMP}`

const PROFILES = [
  {
    key: 'full',
    permissions: [
      'rental.maintenance.view',
      'rental.maintenance.create',
      'rental.maintenance.update',
      'rental.maintenance.validate',
      'rental.maintenance.close',
      'rental.fleet.view',
      'rental.incidents.view',
      'rental.incidents.create',
      'rental.rentals.view',
      'parties.suppliers.view',
    ],
  },
  // Consulter sans pouvoir déclarer, avancer ni terminer.
  { key: 'view', permissions: ['rental.maintenance.view', 'rental.fleet.view'] },
  // Déclarer sans voir : attribution incohérente, volontairement éprouvée.
  { key: 'createonly', permissions: ['rental.maintenance.create', 'rental.fleet.view'] },
  // Tout sauf terminer : `close` est bien une capacité distincte.
  {
    key: 'noclose',
    permissions: [
      'rental.maintenance.view',
      'rental.maintenance.create',
      'rental.maintenance.update',
      'rental.fleet.view',
    ],
  },
  // Le lecteur le plus dépouillé : il voit les maintenances, rien d'autre.
  { key: 'minimal', permissions: ['rental.maintenance.view'] },
  { key: 'none', permissions: [] },
]

async function createProfile(admin, profile) {
  const username = `recette.mnt.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-mnt-${STAMP}`

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
    last_name: `Maintenance ${profile.key}`,
    username,
    email,
    status: 'ACTIVE',
  })
  if (profileError) throw new Error(`profil ${profile.key} : ${profileError.message}`)

  if (profile.permissions.length > 0) {
    const { data: catalog } = await admin
      .from('permissions')
      .select('id, code')
      .in('code', profile.permissions)

    if ((catalog ?? []).length !== profile.permissions.length) {
      const found = new Set((catalog ?? []).map((p) => p.code))
      throw new Error(
        `catalogue incomplet pour ${profile.key} : ` +
          `${profile.permissions.filter((c) => !found.has(c)).join(', ')}`
      )
    }

    const { error: grantError } = await admin
      .from('user_permissions')
      .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' })))
    if (grantError) throw new Error(`permissions ${profile.key} : ${grantError.message}`)
  }

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

/** Le message est-il apparu ? Un formulaire d'action ne stabilise pas le reseau. */
async function sawText(page, pattern, timeoutMs = 15000) {
  try {
    await page.getByText(pattern).first().waitFor({ state: 'visible', timeout: timeoutMs })
    return true
  } catch {
    return false
  }
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
  const fixtures = { vehicleIds: [], maintenances: [], incidents: [], rentals: [] }
  const browser = await chromium.launch()

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RMNT-${STAMP}`, label: `${MARK} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    for (const suffix of ['A', 'B', 'C']) {
      const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
      const { data: vehicle } = await admin
        .from('vehicles')
        .insert({
          vehicle_no: vehicleNo,
          category_id: category.id,
          brand: 'RECETTE',
          model: `MNT ${STAMP} ${suffix}`,
          plate: `RM-${STAMP}${suffix}`,
          origin: 'OWNED',
          status: 'AVAILABLE',
        })
        .select('id')
        .single()
      fixtures.vehicleIds.push(vehicle.id)
    }

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

    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    console.log(`${DIM}Sujets : trois véhicules de recette, aucun engagement préalable${RESET}`)

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — MAINTENANCE NON IMMOBILISANTE\n')

    let plainId = null

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/maintenance/nouvelle`, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle')

      await page.selectOption('select[name="vehicleId"]', fixtures.vehicleIds[0])
      await page.selectOption('select[name="origin"]', 'PREVENTIVE')
      await page.fill('input[name="reason"]', `${MARK} — vidange périodique`)

      await page.getByRole('button', { name: 'Déclarer la maintenance', exact: true }).click()
      await page.waitForURL((t) => /\/location\/maintenance\/[0-9a-f-]{36}/.test(t.href), {
        timeout: 30000,
      })

      plainId = page.url().split('/location/maintenance/')[1].split('?')[0]
      fixtures.maintenances.push(plainId)

      const row = await until(async () => {
        const { data } = await admin
          .from('vehicle_maintenances')
          .select('maintenance_no, status, immobilization_period')
          .eq('id', plainId)
          .maybeSingle()
        return data
      })

      check(Boolean(row), 'La maintenance est enregistrée', row?.maintenance_no)
      check(
        /^MNT-\d{4}-\d{6}$/.test(row?.maintenance_no ?? ''),
        'Référence MNT-AAAA-000000',
        row?.maintenance_no
      )
      check(row?.status === 'DRAFT', 'Brouillon à la déclaration', row?.status)
      check(row?.immobilization_period === null, 'Aucune période d’immobilisation')

      const { data: occupations } = await admin
        .from('vehicle_occupations')
        .select('id')
        .eq('source', 'MAINTENANCE')
        .eq('source_id', plainId)

      check(
        (occupations ?? []).length === 0,
        'Aucune occupation : le véhicule reste louable',
        `${occupations?.length ?? 0}`
      )

      const { data: vehicle } = await admin
        .from('vehicles')
        .select('status')
        .eq('id', fixtures.vehicleIds[0])
        .maybeSingle()
      check(vehicle?.status === 'AVAILABLE', 'Statut du véhicule inchangé', vehicle?.status)

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — MAINTENANCE IMMOBILISANTE\n')

    let blockingId = null

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/maintenance/nouvelle`, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle')

      await page.selectOption('select[name="vehicleId"]', fixtures.vehicleIds[1])
      await page.selectOption('select[name="origin"]', 'BREAKDOWN')
      await page.selectOption('select[name="priority"]', 'URGENT')
      await page.fill('input[name="reason"]', `${MARK} — panne moteur`)

      await page.locator('input[name="immobilizes"]').check()
      await page.fill(
        'input[name="immobilizationFrom"]',
        toLocal(new Date(Date.now() - 3600e3))
      )
      await page.fill('input[name="immobilizationTo"]', toLocal(new Date(Date.now() + 3 * 864e5)))

      await page.getByRole('button', { name: 'Déclarer la maintenance', exact: true }).click()
      await page.waitForURL((t) => /\/location\/maintenance\/[0-9a-f-]{36}/.test(t.href), {
        timeout: 30000,
      })

      blockingId = page.url().split('/location/maintenance/')[1].split('?')[0]
      fixtures.maintenances.push(blockingId)

      const occupation = await until(async () => {
        const { data } = await admin
          .from('vehicle_occupations')
          .select('id, vehicle_id, source, is_active')
          .eq('source', 'MAINTENANCE')
          .eq('source_id', blockingId)
          .maybeSingle()
        return data
      })

      check(Boolean(occupation), 'Une occupation MAINTENANCE est posée')
      check(
        occupation?.vehicle_id === fixtures.vehicleIds[1] && occupation?.is_active === true,
        'Elle porte sur le bon véhicule et bloque',
        occupation?.source
      )

      const { data: vehicle } = await admin
        .from('vehicles')
        .select('status')
        .eq('id', fixtures.vehicleIds[1])
        .maybeSingle()
      check(
        vehicle?.status === 'MAINTENANCE',
        'Le véhicule est « En maintenance » — la période court déjà',
        vehicle?.status
      )

      const { data: available } = await admin.rpc('is_vehicle_available', {
        p_vehicle_id: fixtures.vehicleIds[1],
        p_period: `[${new Date().toISOString()},${new Date(Date.now() + 864e5).toISOString()})`,
      })
      check(
        available === false,
        'Le calendrier — pas le statut — le déclare indisponible'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — COLLISION : REFUS INTÉGRAL\n')

    {
      // Une réservation confirmée occupe le véhicule C dans 30 jours.
      const { data: resNo } = await admin.rpc('next_number', { p_entity_key: 'reservation' })
      const from = new Date(Date.now() + 30 * 864e5)
      const to = new Date(Date.now() + 33 * 864e5)

      const { data: reservation } = await admin
        .from('reservations')
        .insert({
          reservation_no: resNo,
          client_id: fixtures.clientId,
          vehicle_id: fixtures.vehicleIds[2],
          period: `[${from.toISOString()},${to.toISOString()})`,
        })
        .select('id')
        .single()
      fixtures.reservationId = reservation.id

      await admin.from('vehicle_occupations').insert({
        vehicle_id: fixtures.vehicleIds[2],
        source: 'RESERVATION',
        source_id: reservation.id,
        period: `[${from.toISOString()},${to.toISOString()})`,
        reason: 'Recette',
      })

      const { count: before } = await admin
        .from('vehicle_maintenances')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_id', fixtures.vehicleIds[2])

      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/maintenance/nouvelle`, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle')

      await page.selectOption('select[name="vehicleId"]', fixtures.vehicleIds[2])
      await page.selectOption('select[name="origin"]', 'INSPECTION')
      await page.fill('input[name="reason"]', `${MARK} — contrôle en conflit`)
      await page.locator('input[name="immobilizes"]').check()
      await page.fill(
        'input[name="immobilizationFrom"]',
        toLocal(new Date(Date.now() + 31 * 864e5))
      )
      await page.fill(
        'input[name="immobilizationTo"]',
        toLocal(new Date(Date.now() + 32 * 864e5))
      )

      await page.getByRole('button', { name: 'Déclarer la maintenance', exact: true }).click()

      // Une action de formulaire ne stabilise pas le réseau : on attend le
      // MESSAGE, pas un état de chargement qui ne viendra pas.
      const explained = await sawText(page, /engagement existant/i)
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

      check(
        !/\/location\/maintenance\/[0-9a-f-]{36}/.test(page.url()),
        'Aucune fiche n’a été ouverte',
        page.url().replace(base, '')
      )
      check(explained, 'L’écran explique qu’un engagement occupe la période')
      check(
        /n’a pas été créée|n'a pas été créée/i.test(text),
        'Et dit explicitement que rien n’a été créé'
      )

      const { count: after } = await admin
        .from('vehicle_maintenances')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_id', fixtures.vehicleIds[2])

      check(
        after === before,
        'Aucune maintenance partielle en base',
        `${before} → ${after}`
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — PANNE PENDANT UNE LOCATION\n')

    let brokenId = null

    {
      // Le véhicule A part en location dès maintenant.
      const { data: rentalNo } = await admin.rpc('next_number', { p_entity_key: 'rental' })
      const from = new Date(Date.now() - 864e5)
      const to = new Date(Date.now() + 2 * 864e5)

      const { data: rental } = await admin
        .from('rentals')
        .insert({
          rental_no: rentalNo,
          client_id: fixtures.clientId,
          vehicle_id: fixtures.vehicleIds[0],
          planned_period: `[${from.toISOString()},${to.toISOString()})`,
          expected_return_at: to.toISOString(),
          started_at: from.toISOString(),
          locked_amount: 100000,
          locked_unit: 'DAY',
          locked_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      fixtures.rentals.push(rental.id)

      await admin.from('vehicle_occupations').insert({
        vehicle_id: fixtures.vehicleIds[0],
        source: 'RENTAL',
        source_id: rental.id,
        period: `[${from.toISOString()},${to.toISOString()})`,
        reason: 'Recette en cours',
      })

      /*
       * Le chemin réel : la panne est d'abord CONSTATÉE — l'incident porte la
       * location en cours — puis quelqu'un décide de faire réparer. La
       * maintenance hérite alors de la location, sans qu'on la ressaisisse
       * (Workflow 05 §59).
       */
      const { data: incidentNo } = await admin.rpc('next_number', { p_entity_key: 'incident' })
      const { data: incident } = await admin
        .from('vehicle_incidents')
        .insert({
          incident_no: incidentNo,
          vehicle_id: fixtures.vehicleIds[0],
          rental_id: rental.id,
          kind: 'BREAKDOWN',
          description: `${MARK} — panne signalée en route`,
        })
        .select('id')
        .single()
      fixtures.incidents.push(incident.id)

      const { context, page } = await signIn(browser, base, accounts.full)

      // La panne se déclare immédiatement, sans immobilisation.
      await page.goto(`${base}/location/maintenance/nouvelle?incident=${incident.id}`, {
        waitUntil: 'load',
      })
      await page.waitForLoadState('networkidle')
      await page.selectOption('select[name="origin"]', 'BREAKDOWN')
      await page.fill('input[name="reason"]', `${MARK} — panne signalée en route`)
      await page.getByRole('button', { name: 'Déclarer la maintenance', exact: true }).click()
      await page.waitForURL((t) => /\/location\/maintenance\/[0-9a-f-]{36}/.test(t.href), {
        timeout: 30000,
      })

      brokenId = page.url().split('/location/maintenance/')[1].split('?')[0]
      fixtures.maintenances.push(brokenId)

      const { data: occ } = await admin
        .from('vehicle_occupations')
        .select('id')
        .eq('source', 'MAINTENANCE')
        .eq('source_id', brokenId)

      check(
        (occ ?? []).length === 0,
        'Déclarable pendant la location, sans immobilisation'
      )

      const { data: inherited } = await admin
        .from('vehicle_maintenances')
        .select('rental_id, incident_id')
        .eq('id', brokenId)
        .maybeSingle()
      check(
        inherited?.rental_id === rental.id && inherited?.incident_id === incident.id,
        'La maintenance hérite de la location et de l’incident, sans ressaisie'
      )

      const { data: stillRented } = await admin
        .from('vehicle_occupations')
        .select('id')
        .eq('source', 'RENTAL')
        .eq('source_id', rental.id)
        .eq('is_active', true)
      check((stillRented ?? []).length === 1, 'La location reste intacte au calendrier')

      // Immobiliser maintenant est refusé : le calendrier est occupé.
      await page.waitForLoadState('networkidle')
      await page.fill(
        'input[name="immobilizationFrom"]',
        toLocal(new Date(Date.now() + 3600e3))
      )
      await page.fill('input[name="immobilizationTo"]', toLocal(new Date(Date.now() + 864e5)))
      await page.getByRole('button', { name: 'Immobiliser le véhicule', exact: true }).click()

      check(
        await sawText(page, /engagement existant/i),
        'Immobiliser pendant la location est refusé, sans dérogation'
      )

      // Le véhicule rentre : l'occupation de location est libérée.
      await admin
        .from('vehicle_occupations')
        .update({ is_active: false, released_at: new Date().toISOString() })
        .eq('source', 'RENTAL')
        .eq('source_id', rental.id)

      await page.reload({ waitUntil: 'load' })
      await page.waitForLoadState('networkidle')
      await page.fill(
        'input[name="immobilizationFrom"]',
        toLocal(new Date(Date.now() + 3600e3))
      )
      await page.fill('input[name="immobilizationTo"]', toLocal(new Date(Date.now() + 864e5)))
      await page.getByRole('button', { name: 'Immobiliser le véhicule', exact: true }).click()

      const posted = await until(async () => {
        const { data } = await admin
          .from('vehicle_occupations')
          .select('id')
          .eq('source', 'MAINTENANCE')
          .eq('source_id', brokenId)
          .eq('is_active', true)
          .maybeSingle()
        return data
      })

      check(Boolean(posted), 'Immobilisable une fois le véhicule réellement rendu')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — CYCLE DE VIE ET FIN D’INTERVENTION\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      // Brouillon → Planifiée → En cours.
      for (const [target, label] of [
        ['PLANNED', 'Brouillon → Planifiée'],
        ['IN_PROGRESS', 'Planifiée → En cours'],
      ]) {
        await page.goto(`${base}/location/maintenance/${blockingId}`, { waitUntil: 'load' })
        await page.waitForLoadState('networkidle')
        await page.selectOption('select[name="status"]', target)
        await page.getByRole('button', { name: 'Mettre à jour', exact: true }).click()

        const moved = await until(async () => {
          const { data } = await admin
            .from('vehicle_maintenances')
            .select('status')
            .eq('id', blockingId)
            .maybeSingle()
          return data?.status === target ? data : null
        })
        check(Boolean(moved), label)
      }

      // « Terminée » n'apparaît jamais dans la liste des états proposés.
      await page.goto(`${base}/location/maintenance/${blockingId}`, { waitUntil: 'load' })
      const options = await page.locator('select[name="status"] option').allInnerTexts()
      check(
        !options.includes('Terminée'),
        'Terminer ne se fait pas depuis le sélecteur d’états',
        options.join(' · ') || 'aucun état restant'
      )

      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: 'Terminer après contrôle', exact: true }).click()

      const done = await until(async () => {
        const { data } = await admin
          .from('vehicle_maintenances')
          .select('status, completed_at')
          .eq('id', blockingId)
          .maybeSingle()
        return data?.status === 'COMPLETED' ? data : null
      })
      check(Boolean(done), 'Terminée après contrôle satisfaisant')

      const { data: occupations } = await admin
        .from('vehicle_occupations')
        .select('id, is_active, released_at')
        .eq('source', 'MAINTENANCE')
        .eq('source_id', blockingId)

      check(
        (occupations ?? []).length === 1 && occupations[0].is_active === false,
        'L’occupation est libérée, non supprimée',
        occupations?.[0]?.released_at ? 'released_at renseigné' : 'sans horodatage'
      )

      const { data: vehicle } = await admin
        .from('vehicles')
        .select('status')
        .eq('id', fixtures.vehicleIds[1])
        .maybeSingle()
      check(vehicle?.status === 'AVAILABLE', 'Le véhicule est revenu au parc', vehicle?.status)

      await context.close()

      // Et la base refuse de la relancer, quel que soit le droit détenu.
      const relaunch = await asUser(accounts.full, url, anonKey, (c) =>
        c.from('vehicle_maintenances').update({ status: 'IN_PROGRESS' }).eq('id', blockingId)
      )
      check(
        Boolean(relaunch.error),
        'Une maintenance terminée ne se relance pas',
        relaunch.error ? 'transition refusée' : 'ACCEPTÉE — anomalie'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — DEC-024 : CINQ DROITS DISTINCTS\n')

    {
      console.log(`  ${DIM}VIEW seul${RESET}`)
      const { context, page } = await signIn(browser, base, accounts.view)

      await page.goto(`${base}/location/maintenance`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Déclarer une maintenance' }).count()) === 0,
        'Aucun bouton de déclaration'
      )

      await page.goto(`${base}/location/maintenance/nouvelle`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'Accès direct à la déclaration refusé')

      await page.goto(`${base}/location/maintenance/${plainId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('heading', { name: 'Faire avancer l’intervention', exact: true }).count()) === 0,
        'Sans « modifier », aucun avancement n’est proposé'
      )
      check(
        (await page.getByRole('heading', { name: 'Annuler', exact: true }).count()) === 0,
        'Ni aucune annulation'
      )

      await context.close()
    }

    {
      console.log(`\n  ${DIM}CREATE sans VIEW${RESET}`)
      const { context, page } = await signIn(browser, base, accounts.createonly)

      await page.goto(`${base}/location/maintenance`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'La liste est refusée sans « voir »')

      await context.close()

      const read = await asUser(accounts.createonly, url, anonKey, (c) =>
        c.from('vehicle_maintenances').select('id').eq('id', plainId)
      )
      check((read.data?.length ?? 0) === 0, 'RLS ne livre aucune maintenance sans « voir »')
    }

    {
      console.log(`\n  ${DIM}Tout sauf « terminer »${RESET}`)
      const { context, page } = await signIn(browser, base, accounts.noclose)

      // Amener une maintenance en cours pour éprouver précisément `close`.
      await asUser(accounts.full, url, anonKey, async (c) => {
        await c.from('vehicle_maintenances').update({ status: 'PLANNED' }).eq('id', plainId)
        await c.from('vehicle_maintenances').update({ status: 'IN_PROGRESS' }).eq('id', plainId)
      })

      await page.goto(`${base}/location/maintenance/${plainId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('heading', { name: 'Terminer après contrôle', exact: true }).count()) === 0,
        'Sans `close`, l’écran de fin n’apparaît pas'
      )

      await context.close()

      const forced = await asUser(accounts.noclose, url, anonKey, (c) =>
        c.rpc('complete_maintenance', { p_maintenance_id: plainId })
      )
      const { data: after } = await admin
        .from('vehicle_maintenances')
        .select('status')
        .eq('id', plainId)
        .maybeSingle()
      check(
        after?.status === 'IN_PROGRESS',
        'Et l’appel direct de la fonction ne termine rien',
        forced.error ? 'refus explicite' : 'aucun effet'
      )
    }

    {
      console.log(`\n  ${DIM}Aucune permission${RESET}`)
      const { context, page } = await signIn(browser, base, accounts.none)
      await page.goto(`${base}/location/maintenance`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'Liste refusée')
      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — AUCUN MONTANT (DEC-008)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      for (const [label, target] of [
        ['Fiche', `${base}/location/maintenance/${plainId}`],
        ['Liste', `${base}/location/maintenance`],
        ['Déclaration', `${base}/location/maintenance/nouvelle`],
      ]) {
        await page.goto(target, { waitUntil: 'load' })
        const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

        check(!/KMF/.test(text), `${label} : aucun montant affiché`)

        /*
         * Le mot « devis » PEUT apparaître : les écrans annoncent justement
         * qu'aucun devis n'est demandé. Ce qui doit être absent, c'est un
         * CHAMP de saisie financière — car c'est lui, et non une phrase, qui
         * produirait des montants.
         */
        const moneyFields = await page
          .locator(
            'input[name*="cost" i], input[name*="amount" i], input[name*="montant" i], input[name*="devis" i], input[name*="prix" i]'
          )
          .count()
        check(moneyFields === 0, `${label} : aucun champ de saisie financière`)
      }

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — DEC-017 : L’ABSENCE DE DROIT SE DIT\n')

    {
      // Le compte `minimal` voit les maintenances mais NI le parc, NI les
      // fournisseurs, NI les incidents, NI les locations.
      const { context, page } = await signIn(browser, base, accounts.minimal)

      await page.goto(`${base}/location/maintenance/${brokenId}`, { waitUntil: 'load' })
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

      check(
        /que votre compte ne peut pas consulter/i.test(text),
        'Un rattachement illisible est ANNONCÉ, pas nié'
      )
      check(
        !/Location concernée Aucune/i.test(text),
        'Il n’est jamais présenté comme « Aucune » (DEC-017)'
      )

      await context.close()
    }

    {
      // Sans `rental.maintenance.view`, l'onglet du véhicule DISPARAÎT.
      const { context, page } = await signIn(browser, base, accounts.createonly)
      await page.goto(`${base}/location/parc/${fixtures.vehicleIds[0]}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Maintenance', exact: true }).count()) === 0,
        'Sans le droit, l’onglet Maintenance disparaît au lieu d’être vide'
      )
      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.full)
      await page.goto(`${base}/location/parc/${fixtures.vehicleIds[0]}?onglet=maintenance`, {
        waitUntil: 'load',
      })
      const text = await page.locator('main').innerText()
      check(/vidange périodique|panne signalée/i.test(text), 'Avec le droit, l’onglet les montre')
      check(
        /Sans immobilisation/i.test(text),
        'La ligne dit si l’intervention a sorti le véhicule du service'
      )
      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — INCIDENT → MAINTENANCE : UNE DÉCISION\n')

    {
      const { data: incidentNo } = await admin.rpc('next_number', { p_entity_key: 'incident' })
      const { data: incident } = await admin
        .from('vehicle_incidents')
        .insert({
          incident_no: incidentNo,
          vehicle_id: fixtures.vehicleIds[2],
          kind: 'ACCIDENT',
          description: `${MARK} — choc arrière`,
        })
        .select('id')
        .single()
      fixtures.incidents.push(incident.id)

      const { count: spontaneous } = await admin
        .from('vehicle_maintenances')
        .select('id', { count: 'exact', head: true })
        .eq('incident_id', incident.id)
      check(spontaneous === 0, 'Déclarer un incident ne crée aucune maintenance')

      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/incidents/${incident.id}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Créer une maintenance' }).count()) === 1,
        'La fiche incident propose une action explicite'
      )

      await page.getByRole('link', { name: 'Créer une maintenance' }).click()
      await page.waitForLoadState('networkidle')

      await page.fill('input[name="reason"]', `${MARK} — réparation suite à incident`)
      await page.getByRole('button', { name: 'Déclarer la maintenance', exact: true }).click()
      await page.waitForURL((t) => /\/location\/maintenance\/[0-9a-f-]{36}/.test(t.href), {
        timeout: 30000,
      })

      const linkedId = page.url().split('/location/maintenance/')[1].split('?')[0]
      fixtures.maintenances.push(linkedId)

      const { data: linked } = await admin
        .from('vehicle_maintenances')
        .select('incident_id, vehicle_id, origin')
        .eq('id', linkedId)
        .maybeSingle()

      check(linked?.incident_id === incident.id, 'La maintenance reprend l’incident')
      check(
        linked?.vehicle_id === fixtures.vehicleIds[2],
        'Et le véhicule de l’incident, sans choix possible'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — AUCUNE SUPPRESSION · AUDIT · DEMO\n')

    {
      const removal = await asUser(accounts.full, url, anonKey, (c) =>
        c.from('vehicle_maintenances').delete().eq('id', plainId)
      )
      const { data: survivor } = await admin
        .from('vehicle_maintenances')
        .select('id')
        .eq('id', plainId)
        .maybeSingle()
      check(
        Boolean(survivor),
        'Une maintenance ne se supprime pas',
        removal.error ? 'refus' : 'aucun effet'
      )

      const { count: audited } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'vehicle_maintenances')
        .in('entity_id', fixtures.maintenances)
      check((audited ?? 0) > 0, 'Les maintenances sont journalisées', `${audited} entrée(s)`)

      const [{ count: clients }, { count: vehicles }] = await Promise.all([
        admin
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .like('legal_name', '%DEMO%'),
        admin.from('vehicles').select('id', { count: 'exact', head: true }).like('model', '%DEMO%'),
      ])
      check(clients === 3, 'Les trois clients DEMO sont intacts', `${clients}`)
      check(vehicles === 3, 'Les trois véhicules DEMO sont intacts', `${vehicles}`)
    }
  } finally {
    await browser.close()

    for (const id of fixtures.maintenances) {
      await admin.from('vehicle_occupations').delete().eq('source_id', id)
      await admin.from('vehicle_maintenances').delete().eq('id', id)
    }
    for (const id of fixtures.incidents) {
      await admin.from('incident_damages').delete().eq('incident_id', id)
      await admin.from('vehicle_incidents').delete().eq('id', id)
    }
    for (const id of fixtures.rentals) {
      await admin.from('vehicle_occupations').delete().eq('source_id', id)
      await admin.from('rentals').delete().eq('id', id)
    }
    if (fixtures.reservationId) {
      await admin.from('vehicle_occupations').delete().eq('source_id', fixtures.reservationId)
      await admin.from('reservations').delete().eq('id', fixtures.reservationId)
    }
    if (fixtures.clientId) await admin.from('clients').delete().eq('id', fixtures.clientId)
    for (const vehicleId of fixtures.vehicleIds) {
      await admin.from('vehicle_occupations').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }
    if (fixtures.categoryId) {
      await admin.from('vehicle_categories').delete().eq('id', fixtures.categoryId)
    }

    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE MAINTENANCE : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE MAINTENANCE : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
