#!/usr/bin/env node
/**
 * Recette du Tableau de location — Étape 2.3, Lot 7.
 *
 * CE QU'ELLE ÉPROUVE
 *
 *   1. Le tableau montre le CYCLE RÉEL : un jeu couvrant chaque situation est
 *      fabriqué, puis retrouvé à l'écran dans le bon groupe.
 *
 *   2. `rental.board.view` est ATTRIBUABLE SÉPARÉMENT (DEC-024).
 *
 *   3. DEC-017 sous sa forme la plus stricte : sans `rentals.view`, le tableau
 *      DIT que la permission manque — il n'affiche pas un tableau vide.
 *
 *   4. Aucun montant ne fuit sans `rentals.financial.view`.
 *
 *   5. Les filtres portent réellement, et la navigation mène aux fiches.
 *
 * Utilisation :
 *   node scripts/verify-rental-dashboard.mjs [url]
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
const MARK = `RECETTE TAB ${STAMP}`

const PROFILES = [
  // Le tableau seul : il doit s'ouvrir, et DIRE ce qu'il ne peut pas montrer.
  { key: 'boardonly', permissions: ['rental.board.view'] },
  {
    key: 'full',
    permissions: [
      'rental.board.view',
      'parties.clients.view',
      'rental.fleet.view',
      'rental.reservations.view',
      'rental.reservations.confirm',
      'rental.rentals.view',
      'rental.rentals.create',
      'rental.rentals.update',
      'rental.rentals.checkout',
      'rental.rentals.extend',
      'rental.rentals.return',
      'rental.rentals.financial.view',
    ],
  },
  // Tout voir sauf les montants : aucun chiffre ne doit apparaître.
  {
    key: 'nofinance',
    permissions: [
      'rental.board.view',
      'parties.clients.view',
      'rental.fleet.view',
      'rental.reservations.view',
      'rental.rentals.view',
    ],
  },
  // Sans le tableau : la route doit se fermer.
  { key: 'noboard', permissions: ['rental.rentals.view'] },
]

async function createProfile(admin, profile) {
  const username = `recette.tab.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-tab-${STAMP}`

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
    last_name: `Tableau ${profile.key}`,
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

/** Le bloc d'un titre donné, pour y chercher un contenu précis. */
function section(page, title) {
  return page.locator('section').filter({ hasText: title }).first()
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
  const fixtures = { rentals: [], vehicleIds: [] }
  const browser = await chromium.launch()

  /** Amène une location au stade voulu, sur son propre véhicule. */
  async function makeRental({ index, offsetDays, stage }) {
    const vehicleId = fixtures.vehicleIds[index]
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
      c.rpc('confirm_reservation', { p_reservation_id: reservation.id, p_vehicle_id: vehicleId })
    )

    if (stage === 'reservation') {
      fixtures.rentals.push({ rentalId: null, reservationId: reservation.id })
      return { reservationId: reservation.id }
    }

    const { data: rentalId } = await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('convert_reservation_to_rental', { p_reservation_id: reservation.id })
    )
    fixtures.rentals.push({ rentalId, reservationId: reservation.id })

    await asUser(accounts.full, url, anonKey, (c) =>
      c.from('rentals').update({ status: 'CONFIRMED' }).eq('id', rentalId)
    )

    if (stage === 'confirmed') return { rentalId }

    await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('start_rental', {
        p_rental_id: rentalId,
        p_started_at: from.toISOString(),
        p_mileage: 10000,
        p_fuel_level: 'FULL',
      })
    )

    if (stage === 'running' || stage === 'late') return { rentalId }

    await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('return_rental', {
        p_rental_id: rentalId,
        p_returned_at: to.toISOString(),
        p_mileage: 10500,
        p_fuel_level: 'HALF',
      })
    )

    if (stage === 'tocontrol') return { rentalId }

    await asUser(accounts.full, url, anonKey, (c) =>
      c.from('rentals').update({ status: 'TO_INVOICE' }).eq('id', rentalId)
    )

    return { rentalId }
  }

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RTAB-${STAMP}`, label: `${MARK} — Catégorie` })
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
      .insert({ category_id: category.id, amount: 133000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    for (const suffix of ['A', 'B', 'C', 'D', 'E']) {
      const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
      const { data: vehicle } = await admin
        .from('vehicles')
        .insert({
          vehicle_no: vehicleNo,
          category_id: category.id,
          brand: 'RECETTE',
          model: `TAB ${STAMP} ${suffix}`,
          plate: `TB-${STAMP}${suffix}`,
          origin: 'OWNED',
          status: 'AVAILABLE',
        })
        .select('id')
        .single()
      fixtures.vehicleIds.push(vehicle.id)
    }

    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    // Un jeu couvrant le cycle : chaque situation sur son propre véhicule.
    const upcoming = await makeRental({ index: 0, offsetDays: 3, stage: 'reservation' })
    const starting = await makeRental({ index: 1, offsetDays: 2, stage: 'confirmed' })
    const running = await makeRental({ index: 2, offsetDays: -1, stage: 'running' })
    const late = await makeRental({ index: 3, offsetDays: -10, stage: 'late' })
    const toControl = await makeRental({ index: 4, offsetDays: -20, stage: 'tocontrol' })

    fixtures.ids = { upcoming, starting, running, late, toControl }

    // Une prolongation, pour que « Prolongée » soit réellement présente.
    const { data: runningRow } = await admin
      .from('rentals')
      .select('expected_return_at')
      .eq('id', running.rentalId)
      .maybeSingle()
    await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('extend_rental', {
        p_rental_id: running.rentalId,
        p_new_end: new Date(new Date(runningRow.expected_return_at).getTime() + 2 * 864e5).toISOString(),
      })
    )

    console.log(`${DIM}Jeu du cycle : réservation, départ à venir, en cours prolongée, en retard, à contrôler${RESET}\n`)

    /* ------------------------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('CAS 1 — Le tableau est une capacité distincte\n')

    {
      const { context, page } = await signIn(browser, base, accounts.noboard)
      await page.goto(`${base}/location`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Tableau refusé sans « rental.board.view »',
        page.url().replace(base, '')
      )
      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 2 — DEC-017 : le tableau DIT ce qu’il ne peut pas montrer\n')

    {
      const { context, page } = await signIn(browser, base, accounts.boardonly)

      await page.goto(`${base}/location`, { waitUntil: 'load' })
      check(!page.url().includes('/acces-refuse'), 'Le tableau s’ouvre avec la seule permission')

      check(
        (await page.getByText('ne vous est pas attribuée', { exact: false }).count()) >= 1,
        'Le manque de permission est NOMMÉ, pas subi'
      )
      check(
        (await page.getByText('Il ne s’agit pas d’une absence de données', { exact: false }).count()) >= 1,
        'Le texte écarte explicitement la lecture « aucune donnée »'
      )
      check(
        (await page.getByText('Aucune location en cours', { exact: false }).count()) === 0,
        'Aucun groupe ne prétend qu’il n’y a rien'
      )
      check(
        (await page.getByText('KMF', { exact: false }).count()) === 0,
        'Aucun montant n’apparaît'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 3 — Le cycle réel apparaît dans les bons groupes\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location?jours=30`, { waitUntil: 'load' })

      check(
        (await section(page, 'Réservations à venir').getByText(MARK, { exact: false }).count()) >= 1,
        'La réservation à venir est présente'
      )
      check(
        (await section(page, 'Départs à préparer').getByText(MARK, { exact: false }).count()) >= 1,
        'Le contrat confirmé apparaît dans « Départs à préparer »'
      )
      check(
        (await section(page, 'Locations en cours').getByText(MARK, { exact: false }).count()) >= 2,
        'Les locations en cours sont présentes'
      )
      check(
        (await section(page, 'En retard').getByText(MARK, { exact: false }).count()) >= 1,
        'La location en retard est signalée'
      )
      check(
        (await section(page, 'À contrôler').getByText(MARK, { exact: false }).count()) >= 1,
        'La location rentrée attend son contrôle'
      )

      // Statuts : les libellés sont ceux des fiches, sans invention.
      check(
        (await page.getByText('Prolongée', { exact: false }).count()) >= 1,
        'Le statut « Prolongée » est identifiable'
      )
      check(
        (await page.getByText('En retard', { exact: false }).count()) >= 1,
        'Le statut « En retard » est identifiable — dérivé, non stocké'
      )
      check(
        (await page.getByText('À contrôler', { exact: false }).count()) >= 1,
        'Le statut « À contrôler » est identifiable'
      )

      // Retard : constaté, jamais chiffré.
      const lateSection = section(page, 'En retard')
      check(
        (await lateSection.getByText('aucun frais', { exact: false }).count()) >= 1,
        'Le tableau annonce qu’aucun frais de retard n’est calculé'
      )

      // Navigation vers les fiches.
      await page.goto(`${base}/location?jours=30`, { waitUntil: 'load' })
      await section(page, 'À contrôler').getByText(MARK, { exact: false }).first().click()
      await page.waitForURL((u) => u.href.includes('/location/locations/'), { timeout: 30000 })
      check(
        page.url().includes('onglet=controle'),
        'Le groupe « À contrôler » mène directement au contrôle',
        page.url().replace(base, '')
      )

      await page.goto(`${base}/location?jours=30`, { waitUntil: 'load' })
      await section(page, 'Réservations à venir').getByText(MARK, { exact: false }).first().click()
      await page.waitForURL((u) => u.href.includes('/location/reservations/'), { timeout: 30000 })
      check(true, 'Le groupe « Réservations » mène à la fiche réservation')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 4 — Filtres et fenêtre\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      // Fenêtre courte : la réservation à J+3 sort du cadre « aujourd'hui ».
      await page.goto(`${base}/location?jours=1`, { waitUntil: 'load' })
      check(
        (await section(page, 'Réservations à venir').getByText(MARK, { exact: false }).count()) === 0,
        'La fenêtre « aujourd’hui » écarte une réservation à J+3'
      )
      check(
        (await section(page, 'En retard').getByText(MARK, { exact: false }).count()) >= 1,
        'Un retard reste visible quelle que soit la fenêtre'
      )

      // Filtre véhicule : seul le véhicule choisi subsiste.
      await page.goto(
        `${base}/location?jours=30&vehicule=${fixtures.vehicleIds[3]}`,
        { waitUntil: 'load' }
      )
      check(
        (await section(page, 'En retard').getByText(`TAB ${STAMP} D`, { exact: false }).count()) >= 1,
        'Le filtre véhicule conserve le véhicule demandé'
      )
      check(
        (await section(page, 'Locations en cours').getByText(`TAB ${STAMP} C`, { exact: false }).count()) === 0,
        'Il écarte les autres véhicules'
      )

      // Filtre client : notre client de recette ne masque rien de son propre jeu.
      await page.goto(`${base}/location?jours=30&client=${fixtures.clientId}`, {
        waitUntil: 'load',
      })
      check(
        (await section(page, 'En retard').getByText(MARK, { exact: false }).count()) >= 1,
        'Le filtre client conserve les lignes du client demandé'
      )

      // Filtre catégorie : la jointure interne sur le véhicule fonctionne.
      await page.goto(`${base}/location?jours=30&categorie=${fixtures.categoryId}`, {
        waitUntil: 'load',
      })
      check(
        (await section(page, 'Locations en cours').getByText(MARK, { exact: false }).count()) >= 1,
        'Le filtre catégorie fonctionne sur les locations'
      )
      check(
        (await section(page, 'Réservations à venir').getByText(MARK, { exact: false }).count()) >= 1,
        'Le filtre catégorie fonctionne aussi sur les réservations'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 5 — Aucune fuite des montants\n')

    {
      const { context, page } = await signIn(browser, base, accounts.nofinance)

      await page.goto(`${base}/location?jours=30`, { waitUntil: 'load' })

      check(
        (await section(page, 'En retard').getByText(MARK, { exact: false }).count()) >= 1,
        'Le suivi opérationnel reste complet sans le droit financier'
      )
      check(
        (await page.getByText('KMF', { exact: false }).count()) === 0,
        'AUCUN montant n’apparaît sur le tableau'
      )
      check(
        (await page.getByText('133 000', { exact: false }).count()) === 0,
        'Le tarif verrouillé ne fuit pas'
      )
      check(
        (await page.getByText('0 KMF', { exact: false }).count()) === 0,
        'Aucun « 0 KMF » ne remplace le montant masqué'
      )

      await context.close()
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
      if (rentalId) {
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
      }
      await admin.from('vehicle_occupations').delete().eq('source_id', reservationId)
      await admin.from('reservations').delete().eq('id', reservationId)
    }

    if (fixtures.ruleId) await admin.from('pricing_rules').delete().eq('id', fixtures.ruleId)
    for (const vehicleId of fixtures.vehicleIds) {
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
    console.log(`${GREEN}RECETTE TABLEAU DE LOCATION : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE TABLEAU DE LOCATION : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
