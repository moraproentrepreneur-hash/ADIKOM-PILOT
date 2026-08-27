#!/usr/bin/env node
/**
 * Recette des incidents et dommages — Étape 2.4, LOT 1.
 *
 * CE QU'ELLE ÉPROUVE
 *
 *   1. Les trois permissions sont ATTRIBUABLES SÉPARÉMENT (DEC-024) : voir
 *      sans déclarer, déclarer sans voir, et l'accès direct aux routes.
 *
 *   2. Un dommage est une DONNÉE, pas une phrase : il se compte, se retrouve
 *      depuis la fiche du véhicule, et distingue le préexistant du nouveau.
 *
 *   3. Déclarer un incident NE DÉCLENCHE RIEN : aucune occupation, aucun
 *      changement de statut du véhicule, aucune maintenance.
 *
 *   4. AUCUN MONTANT n'apparaît nulle part (DEC-008).
 *
 *   5. Un incident peut exister HORS LOCATION (Workflow 05 §3.2).
 *
 *   6. Les photos ne sont servies que par URL signée, après contrôle de
 *      permission — jamais par un chemin de stockage (DEC-025 §f).
 *
 *   7. DEC-017 : un défaut de droit se DIT, il ne se présente jamais comme une
 *      absence de donnée.
 *
 * Utilisation :
 *   node scripts/verify-incidents.mjs [url]
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
const MARK = `RECETTE INC ${STAMP}`

const PROFILES = [
  {
    // Le profil complet : déclarer depuis un contrôle de retour exige aussi de
    // voir le parc et la location d'origine.
    key: 'full',
    permissions: [
      'rental.incidents.view',
      'rental.incidents.create',
      'rental.incidents.update',
      'rental.fleet.view',
      'rental.rentals.view',
      'rental.reservations.view',
      'rental.reservations.confirm',
      'rental.rentals.create',
      'rental.rentals.update',
      'rental.rentals.checkout',
      'rental.rentals.return',
    ],
  },
  // Consulter sans pouvoir déclarer ni modifier.
  { key: 'view', permissions: ['rental.incidents.view', 'rental.fleet.view'] },
  // Déclarer sans voir : attribution incohérente, volontairement éprouvée.
  { key: 'createonly', permissions: ['rental.incidents.create', 'rental.fleet.view'] },
  // Voir les véhicules, mais pas les incidents : l'onglet doit DISPARAÎTRE.
  { key: 'fleetonly', permissions: ['rental.fleet.view'] },
  { key: 'none', permissions: [] },
]

async function createProfile(admin, profile) {
  const username = `recette.inc.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-inc-${STAMP}`

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
    last_name: `Incident ${profile.key}`,
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

async function until(read, timeoutMs = 20000) {
  const started = Date.now()
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() - started > timeoutMs) return null
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
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
  const fixtures = { incidents: [], vehicleIds: [] }
  const browser = await chromium.launch()

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RINC-${STAMP}`, label: `${MARK} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    for (const suffix of ['A', 'B']) {
      const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
      const { data: vehicle } = await admin
        .from('vehicles')
        .insert({
          vehicle_no: vehicleNo,
          category_id: category.id,
          brand: 'RECETTE',
          model: `INC ${STAMP} ${suffix}`,
          plate: `RI-${STAMP}${suffix}`,
          origin: 'OWNED',
          status: 'AVAILABLE',
        })
        .select('id')
        .single()
      fixtures.vehicleIds.push(vehicle.id)
    }

    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    console.log(`${DIM}Sujets : deux véhicules de recette, aucun incident préalable${RESET}`)

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — DÉCLARATION D’UN INCIDENT HORS LOCATION\n')

    let incidentId = null

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/incidents/nouveau`, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle')

      await page.selectOption('select[name="vehicleId"]', fixtures.vehicleIds[0])
      await page.selectOption('select[name="kind"]', 'ACCIDENT')
      await page.fill('textarea[name="description"]', `${MARK} — choc sur le parking`)

      // Premier dommage.
      await page.fill('input[name="damageLocation"]', 'Pare-chocs arrière')
      await page.selectOption('select[name="damageSeverity"]', 'MAJOR')
      await page.selectOption('select[name="damageResponsibility"]', 'CLIENT')

      // Deuxième dommage, préexistant.
      await page.getByRole('button', { name: 'Ajouter un dommage', exact: true }).click()
      await page.locator('input[name="damageLocation"]').nth(1).fill('Feu arrière droit')
      await page.locator('select[name="damageSeverity"]').nth(1).selectOption('MODERATE')
      await page.locator('input[name="damagePreexisting"]').nth(1).check()

      await page.getByRole('button', { name: 'Déclarer l’incident', exact: true }).click()
      await page.waitForURL((target) => /\/location\/incidents\/[0-9a-f-]{36}/.test(target.href), {
        timeout: 30000,
      })

      incidentId = page.url().split('/location/incidents/')[1].split('?')[0]
      fixtures.incidents.push(incidentId)

      const row = await until(async () => {
        const { data } = await admin
          .from('vehicle_incidents')
          .select('incident_no, status, rental_id, inspection_id')
          .eq('id', incidentId)
          .maybeSingle()
        return data
      })

      check(Boolean(row), 'L’incident est enregistré', row?.incident_no)
      check(
        /^INC-\d{4}-\d{6}$/.test(row?.incident_no ?? ''),
        'Référence INC-AAAA-000000',
        row?.incident_no
      )
      check(row?.status === 'OPEN', 'Ouvert à la déclaration', row?.status)
      check(
        row?.rental_id === null && row?.inspection_id === null,
        'Un incident peut exister hors de toute location'
      )

      const { data: damages } = await admin
        .from('incident_damages')
        .select('location, severity, responsibility, is_preexisting')
        .eq('incident_id', incidentId)
        .order('location')

      check((damages ?? []).length === 2, 'Deux dommages structurés', `${damages?.length ?? 0}`)
      check(
        damages?.some((d) => d.location === 'Feu arrière droit' && d.is_preexisting === true),
        'Le dommage préexistant est marqué comme tel'
      )
      check(
        damages?.some(
          (d) => d.location === 'Pare-chocs arrière' && d.responsibility === 'CLIENT'
        ),
        'La responsabilité constatée est enregistrée'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LE CONSTAT NE DÉCLENCHE RIEN\n')

    {
      const [{ data: occupations }, { data: vehicle }] = await Promise.all([
        admin.from('vehicle_occupations').select('id').eq('vehicle_id', fixtures.vehicleIds[0]),
        admin.from('vehicles').select('status').eq('id', fixtures.vehicleIds[0]).maybeSingle(),
      ])

      check(
        (occupations ?? []).length === 0,
        'Aucune occupation posée : le calendrier ne bouge pas',
        `${occupations?.length ?? 0}`
      )
      check(
        vehicle?.status === 'AVAILABLE',
        'Le véhicule n’est pas immobilisé automatiquement',
        vehicle?.status
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — AUCUN MONTANT À L’ÉCRAN (DEC-008)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)
      await page.goto(`${base}/location/incidents/${incidentId}`, { waitUntil: 'load' })

      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

      check(!/KMF/.test(text), 'Aucun montant en KMF sur la fiche')
      check(
        !/(franchise|pénalit|penalit|refactur)/i.test(text),
        'Aucune franchise, pénalité ni refacturation annoncée'
      )
      check(
        /barèmes? (de dommage )?ne sont pas définis/i.test(text),
        'L’écran DIT que les barèmes ne sont pas définis, au lieu de se taire'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — DEC-024 : TROIS DROITS DISTINCTS\n')

    {
      console.log(`  ${DIM}VIEW seul${RESET}`)
      const { context, page } = await signIn(browser, base, accounts.view)

      await page.goto(`${base}/location/incidents`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Déclarer un incident' }).count()) === 0,
        'Aucun bouton de déclaration'
      )

      await page.goto(`${base}/location/incidents/nouveau`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Accès direct à l’écran de déclaration refusé',
        page.url().replace(base, '')
      )

      await page.goto(`${base}/location/incidents/${incidentId}`, { waitUntil: 'load' })
      const text = await page.locator('main').innerText()
      check(/Pare-chocs arrière/.test(text), 'La fiche reste consultable')
      check(
        (await page.getByRole('heading', { name: 'Ajouter un dommage', exact: true }).count()) === 0,
        'Sans « modifier », aucun ajout de dommage n’est proposé'
      )
      check(
        (await page
          .getByRole('heading', { name: 'Faire évoluer l’incident', exact: true })
          .count()) === 0,
        'Sans « modifier », aucun changement d’état n’est proposé'
      )

      await context.close()

      // La barrière de données, indépendamment de l'interface.
      const write = await asUser(accounts.view, url, anonKey, (c) =>
        c.from('vehicle_incidents').update({ status: 'CANCELLED' }).eq('id', incidentId)
      )
      const { data: after } = await admin
        .from('vehicle_incidents')
        .select('status')
        .eq('id', incidentId)
        .maybeSingle()
      check(
        after?.status === 'OPEN',
        'RLS refuse la modification à un lecteur',
        write.error ? 'refus explicite' : 'aucune ligne modifiée'
      )
    }

    {
      console.log(`\n  ${DIM}CREATE sans VIEW${RESET}`)
      const { context, page } = await signIn(browser, base, accounts.createonly)

      await page.goto(`${base}/location/incidents`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'La liste est refusée sans « voir »')

      await page.goto(`${base}/location/incidents/${incidentId}`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'La fiche est refusée sans « voir »')

      await context.close()

      const read = await asUser(accounts.createonly, url, anonKey, (c) =>
        c.from('vehicle_incidents').select('id').eq('id', incidentId)
      )
      check((read.data?.length ?? 0) === 0, 'RLS ne livre aucun incident sans « voir »')

      const damages = await asUser(accounts.createonly, url, anonKey, (c) =>
        c.from('incident_damages').select('id').eq('incident_id', incidentId)
      )
      check((damages.data?.length ?? 0) === 0, 'Ni aucun dommage')
    }

    {
      console.log(`\n  ${DIM}Aucune permission${RESET}`)
      const { context, page } = await signIn(browser, base, accounts.none)

      await page.goto(`${base}/location/incidents`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'Liste refusée')

      await page.goto(`${base}/location/incidents/nouveau`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'Déclaration refusée')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — DEC-017 : L’ABSENCE DE DROIT SE DIT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.fleetonly)

      await page.goto(`${base}/location/parc/${fixtures.vehicleIds[0]}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Incidents', exact: true }).count()) === 0,
        'Sans le droit, l’onglet Incidents DISPARAÎT au lieu d’être vide'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.view)

      await page.goto(`${base}/location/parc/${fixtures.vehicleIds[0]}?onglet=incidents`, {
        waitUntil: 'load',
      })
      const text = await page.locator('main').innerText()
      check(/Pare-chocs arrière|choc sur le parking/.test(text), 'Avec le droit, l’onglet montre l’incident')

      await page.goto(`${base}/location/parc/${fixtures.vehicleIds[1]}?onglet=incidents`, {
        waitUntil: 'load',
      })
      const empty = await page.locator('main').innerText()
      check(
        /Aucun incident n’a été constaté/.test(empty),
        'Un véhicule réellement sans incident le dit explicitement'
      )

      await context.close()
    }

    {
      // Le compte n'a PAS `rental.rentals.view` : la fiche doit annoncer le
      // rattachement inaccessible, jamais « hors location ».
      const { data: client } = await admin
        .from('clients')
        .insert({
          client_no: await admin
            .rpc('next_number', { p_entity_key: 'client' })
            .then((r) => r.data),
          type: 'COMPANY',
          legal_name: `${MARK} — Client`,
          phone: '+269 000',
        })
        .select('id')
        .single()
      fixtures.clientId = client.id

      const { data: rentalNo } = await admin.rpc('next_number', { p_entity_key: 'rental' })
      const { data: rental } = await admin
        .from('rentals')
        .insert({
          rental_no: rentalNo,
          client_id: client.id,
          vehicle_id: fixtures.vehicleIds[1],
          planned_period: `[${new Date(Date.now() + 500 * 864e5).toISOString()},${new Date(Date.now() + 503 * 864e5).toISOString()})`,
          expected_return_at: new Date(Date.now() + 503 * 864e5).toISOString(),
          locked_amount: 100000,
          locked_unit: 'DAY',
          locked_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      fixtures.rentalId = rental.id

      const { data: attached } = await admin
        .from('vehicle_incidents')
        .insert({
          incident_no: await admin
            .rpc('next_number', { p_entity_key: 'incident' })
            .then((r) => r.data),
          vehicle_id: fixtures.vehicleIds[1],
          rental_id: rental.id,
          kind: 'BREAKDOWN',
          description: `${MARK} — panne en exploitation`,
        })
        .select('id')
        .single()
      fixtures.incidents.push(attached.id)

      const { context, page } = await signIn(browser, base, accounts.view)
      await page.goto(`${base}/location/incidents/${attached.id}`, { waitUntil: 'load' })
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

      check(
        /que votre compte ne peut pas consulter/i.test(text),
        'Un rattachement illisible est ANNONCÉ, pas nié'
      )
      check(
        !/Hors location/i.test(text),
        'Il n’est jamais présenté comme « hors location » (DEC-017)'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — PHOTOS : AUCUN CHEMIN EXPOSÉ\n')

    {
      const { data: photo } = await admin
        .from('incident_photos')
        .insert({
          incident_id: incidentId,
          storage_path: `incidents/${incidentId}/recette-${STAMP}.png`,
          file_name: 'recette.png',
        })
        .select('id')
        .single()

      const { context, page } = await signIn(browser, base, accounts.full)
      await page.goto(`${base}/location/incidents/${incidentId}`, { waitUntil: 'load' })
      const html = await page.content()

      check(
        !html.includes(`incidents/${incidentId}/recette-${STAMP}.png`),
        'Le chemin de stockage n’apparaît jamais dans la page'
      )
      check(
        html.includes(`/api/incidents/photos/${photo.id}`),
        'La photo passe par la route contrôlée'
      )

      await context.close()

      // Sans le droit de voir : la route refuse, elle ne signe rien.
      const { context: denied, page: deniedPage } = await signIn(
        browser,
        base,
        accounts.fleetonly
      )
      const response = await deniedPage.request.get(
        `${base}/api/incidents/photos/${photo.id}`,
        { maxRedirects: 0 }
      )
      check(
        response.status() === 403,
        'La route refuse une photo sans « voir les incidents »',
        `HTTP ${response.status()}`
      )
      await denied.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — CYCLE DE VIE\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/incidents/${incidentId}`, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle')

      // Un dommage repéré après coup complète le constat.
      await page.locator('input[name="location"]').fill('Aile arrière gauche')
      await page.getByRole('button', { name: 'Enregistrer le dommage', exact: true }).click()

      const added = await until(async () => {
        const { count } = await admin
          .from('incident_damages')
          .select('id', { count: 'exact', head: true })
          .eq('incident_id', incidentId)
        return count === 3 ? count : null
      })
      check(added === 3, 'Un dommage peut être ajouté après coup', `${added ?? '—'} dommages`)

      // Ouvert → En traitement.
      await page.reload({ waitUntil: 'load' })
      await page.waitForLoadState('networkidle')
      await page.selectOption('select[name="status"]', 'IN_PROGRESS')
      await page.getByRole('button', { name: 'Mettre à jour', exact: true }).click()

      const progressing = await until(async () => {
        const { data } = await admin
          .from('vehicle_incidents')
          .select('status')
          .eq('id', incidentId)
          .maybeSingle()
        return data?.status === 'IN_PROGRESS' ? data : null
      })
      check(Boolean(progressing), 'Ouvert → En traitement')

      await context.close()

      // La base refuse le retour en arrière, quel que soit le droit détenu.
      const back = await asUser(accounts.full, url, anonKey, (c) =>
        c.from('vehicle_incidents').update({ status: 'OPEN' }).eq('id', incidentId)
      )
      check(
        Boolean(back.error),
        'La base refuse de revenir à « Ouvert »',
        back.error ? 'transition refusée' : 'ACCEPTÉE — anomalie'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — AUCUNE SUPPRESSION\n')

    {
      const removal = await asUser(accounts.full, url, anonKey, (c) =>
        c.from('vehicle_incidents').delete().eq('id', incidentId)
      )
      const { data: survivor } = await admin
        .from('vehicle_incidents')
        .select('id')
        .eq('id', incidentId)
        .maybeSingle()

      check(Boolean(survivor), 'Un incident ne se supprime pas', removal.error ? 'refus' : 'aucun effet')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — JOURNAL D’AUDIT\n')

    {
      const { count } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'vehicle_incidents')
        .in('entity_id', fixtures.incidents)

      check((count ?? 0) > 0, 'Les incidents sont journalisés', `${count} entrée(s)`)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — DONNÉES DEMO\n')

    {
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

    for (const id of fixtures.incidents) {
      await admin.from('incident_photos').delete().eq('incident_id', id)
      await admin.from('incident_damages').delete().eq('incident_id', id)
      await admin.from('vehicle_incidents').delete().eq('id', id)
    }

    if (fixtures.rentalId) {
      await admin.from('vehicle_occupations').delete().eq('source_id', fixtures.rentalId)
      await admin.from('rentals').delete().eq('id', fixtures.rentalId)
    }
    if (fixtures.clientId) await admin.from('clients').delete().eq('id', fixtures.clientId)
    for (const vehicleId of fixtures.vehicleIds) {
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
    console.log(`${GREEN}RECETTE INCIDENTS ET DOMMAGES : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE INCIDENTS ET DOMMAGES : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
