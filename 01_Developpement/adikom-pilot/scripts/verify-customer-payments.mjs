#!/usr/bin/env node
/**
 * Recette Règlements clients — Étape 2.5, LOT 8.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * `db:verify:customer-payments` contrôle le schéma et les règles ;
 * `verify:capabilities` contrôle les capacités par appel direct. Celle-ci
 * contrôle ce que L'UTILISATEUR VOIT :
 *
 *   1. Le cycle complet par l'écran : encaisser, voir le compte CRÉDITÉ et le
 *      solde de la facture diminuer (Workflow 08 §47, §48).
 *   2. §40 — un versement au-delà du solde est refusé, à l'écran, avec son motif.
 *   3. §23 — une facture soldée n'accepte plus rien, et se lit « Payée ».
 *   4. §61 — « Payée » ne dort pas en base : la facture y reste « Émise ».
 *   5. Une facture encaissée ne s'annule pas : l'écran ne propose plus l'acte.
 *   6. §28 — l'annulation fait redescendre le compte ET remonter le solde.
 *   7. DEC-024 — sans `billing.customer_payments.view`, le solde n'est pas
 *      affiché à zéro : l'écran dit qu'il ne peut pas le calculer.
 *   8. §32 — la fiche client permet de retrouver ses règlements.
 *
 * Utilisation :
 *   node scripts/verify-customer-payments.mjs [url]
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { dayOffset, loadEnvFile, required } from './lib/env.mjs'

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
const MARK = `RECETTE ENC ${STAMP}`

/** Lectures nécessaires pour que RLS ne masque pas les objets visés. */
const BASE_READERS = ['parties.clients.view', 'rental.rentals.view', 'rental.fleet.view']

const PROFILES = {
  // Le compte complet : il peut tout accomplir légitimement.
  full: [
    ...BASE_READERS,
    'billing.customer_invoices.view',
    'billing.customer_invoices.cancel',
    'billing.customer_payments.view',
    'billing.customer_payments.create',
    'billing.customer_payments.cancel',
    'treasury.accounts.view',
    'treasury.accounts.create',
    'treasury.balances.view',
    'treasury.entries.view',
  ],
  // Voit la facture, PAS les règlements qui la soldent.
  noPayment: [
    ...BASE_READERS,
    'billing.customer_invoices.view',
    'treasury.accounts.view',
    'treasury.balances.view',
    'treasury.entries.view',
  ],
}

async function createProfile(admin, key, codes) {
  const username = `recette.enc.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-enc-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${key} : ${error?.message}`)

  const id = created.user.id
  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Encaissement ${key}`,
    username,
    email,
    status: 'ACTIVE',
  })
  if (profileError) throw new Error(`profil ${key} : ${profileError.message}`)

  const { data: catalog } = await admin.from('permissions').select('id, code').in('code', codes)
  if ((catalog ?? []).length !== codes.length) {
    const found = new Set((catalog ?? []).map((p) => p.code))
    throw new Error(`catalogue incomplet (${key}) : ${codes.filter((c) => !found.has(c)).join(', ')}`)
  }

  const { error: grantError } = await admin
    .from('user_permissions')
    .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' })))
  if (grantError) throw new Error(`permissions ${key} : ${grantError.message}`)

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

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/** Valeur d'une ligne de fiche, en entier. */
async function rowAmount(page, label) {
  const text = await page
    .locator('dt', { hasText: label })
    .first()
    .locator('xpath=following-sibling::dd[1]')
    .innerText()
  return /\d/.test(text) ? Number(text.replace(/[^\d-]/g, '')) : null
}

/**
 * Déclenche un acte et attend le message que l'écran promet.
 *
 * `networkidle` ne prouve rien : une action serveur rend son résultat par un
 * nouvel arbre React, sans navigation.
 */
async function act(page, buttonName, expected, timeout = 60000) {
  const button = page.getByRole('button', { name: buttonName }).first()
  await button.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(800)
  await button.click()
  await page.getByText(expected, { exact: false }).first().waitFor({ timeout })
}

/**
 * Déclenche un acte qui FAIT DISPARAÎTRE SON PROPRE FORMULAIRE.
 *
 * L'encaissement qui solde une facture retire le formulaire : le message de
 * succès s'en va avec lui. Le repère devient alors l'état affiché ensuite,
 * relu jusqu'à ce qu'il change.
 */
async function actUntil(page, buttonName, needle, timeout = 60000) {
  const button = page.getByRole('button', { name: buttonName }).first()
  await button.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(800)
  await button.click()

  const started = Date.now()
  for (;;) {
    const text = await mainText(page).catch(() => '')
    if (text.includes(needle)) return true
    if (Date.now() - started > timeout) return false
    await page.waitForTimeout(1500)
    if (Date.now() - started > timeout / 3) await page.reload({ waitUntil: 'load' })
  }
}

/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'
  const url = required('NEXT_PUBLIC_SUPABASE_URL')

  const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nCible : ${base}\n`)

  const accounts = {}
  const fixtures = {
    vehicleIds: [],
    reservations: [],
    rentals: [],
    customerInvoices: [],
    financial: [],
  }
  const browser = await chromium.launch()

  try {
    /* --- Sujets : l'exemple de Workflow 08 §5 et §48 ---------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RENC-${STAMP}`, label: `${MARK} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    const { data: rule } = await admin
      .from('pricing_rules')
      .insert({ category_id: category.id, amount: 150000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    const { data: clientNo } = await admin.rpc('next_number', { p_entity_key: 'client' })
    const { data: client } = await admin
      .from('clients')
      .insert({
        client_no: clientNo,
        type: 'COMPANY',
        legal_name: `${MARK} — Client`,
        phone: '+269 400',
        status: 'ACTIVE',
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
        model: `ENC ${STAMP}`,
        plate: `RE-${STAMP}`,
        origin: 'OWNED',
        status: 'AVAILABLE',
      })
      .select('id')
      .single()
    fixtures.vehicleIds.push(vehicle.id)

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, key, codes)
    }

    // Une location menée jusqu'à « À facturer ».
    const { data: reservationNo } = await admin.rpc('next_number', {
      p_entity_key: 'reservation',
    })
    const start = new Date(Date.now() + 86400_000)
    const end = new Date(Date.now() + 4 * 86400_000)
    const { data: reservation } = await admin
      .from('reservations')
      .insert({
        reservation_no: reservationNo,
        client_id: client.id,
        category_id: category.id,
        period: `[${start.toISOString()},${end.toISOString()})`,
      })
      .select('id')
      .single()
    fixtures.reservations.push(reservation.id)

    await admin.rpc('confirm_reservation', {
      p_reservation_id: reservation.id,
      p_vehicle_id: vehicle.id,
    })
    const { data: rentalId } = await admin.rpc('convert_reservation_to_rental', {
      p_reservation_id: reservation.id,
    })
    fixtures.rentals.push(rentalId)

    await admin
      .from('rentals')
      .update({ status: 'CONFIRMED', status_changed_at: new Date().toISOString() })
      .eq('id', rentalId)
    await admin.rpc('start_rental', {
      p_rental_id: rentalId,
      p_started_at: new Date().toISOString(),
      p_mileage: 10000,
      p_fuel_level: 'FULL',
    })
    await admin.rpc('return_rental', {
      p_rental_id: rentalId,
      p_returned_at: new Date(Date.now() + 3600_000).toISOString(),
      p_mileage: 10450,
      p_fuel_level: 'HALF',
    })
    await admin
      .from('rentals')
      .update({ status: 'TO_INVOICE', status_changed_at: new Date().toISOString() })
      .eq('id', rentalId)

    // Facture de 450 000 KMF : trois jours à 150 000, émise.
    const { data: invId } = await admin.rpc('create_customer_invoice', {
      p_client_id: client.id,
      p_invoice_date: dayOffset(-1),
      p_due_date: dayOffset(30),
      p_rental_id: rentalId,
      p_notes: `${MARK} — facture`,
    })
    const invoiceId = String(invId)
    fixtures.customerInvoices.push(invoiceId)

    await admin.rpc('add_customer_invoice_line', {
      p_invoice_id: invoiceId,
      p_kind: 'RENTAL',
      p_label: `${MARK} — location 3 jours`,
      p_quantity: 3,
      p_unit_price: 150000,
    })
    await admin.rpc('issue_customer_invoice', { p_invoice_id: invoiceId, p_reason: 'Recette' })

    console.log(`${DIM}Sujets : facture client de 450 000 KMF, émise.${RESET}`)

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — OUVRIR UN COMPTE, ET LIRE UNE CRÉANCE NON ENCAISSÉE\n')

    let accountId = null

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/tresorerie/comptes/nouveau`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#label') !== null)

      await page.selectOption('#kind', 'BANK')
      await page.fill('#label', `${MARK} — Banque`)
      await page.fill('#institution', 'Banque de recette')
      await page.fill('#openingBalance', '0')
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: 'Ouvrir le compte' }).click()
      await page.waitForURL(/\/tresorerie\/comptes\/[0-9a-f-]{36}/, { timeout: 45000 })

      accountId = page.url().split('/tresorerie/comptes/')[1]?.split('?')[0] ?? null
      if (accountId) fixtures.financial.push(accountId)
      check(Boolean(accountId), 'Le compte est ouvert et sa fiche s’ouvre')

      await page.goto(`${base}/facturation/clients/${invoiceId}`, { waitUntil: 'load' })
      check((await rowAmount(page, 'Total')) === 450000, 'Total de la facture : 450 000 KMF')
      check((await rowAmount(page, 'Encaissé')) === 0, 'Encaissé : 0 KMF — la somme est LUE, pas supposée')
      check((await rowAmount(page, 'Solde')) === 450000, 'Solde : 450 000 KMF')

      const text = await mainText(page)
      check(!/pas encore gérés/i.test(text), 'L’écran n’annonce plus les encaissements comme à venir')

      await context.close()
    }

    if (!accountId) throw new Error('Le compte n’a pas pu être créé : recette interrompue.')

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — ENCAISSER : LE COMPTE EST CRÉDITÉ, LE SOLDE DIMINUE (§47, §48)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/clients/${invoiceId}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#accountId') !== null)

      await page.selectOption('#accountId', accountId)
      await page.fill('#amount', '200000')
      await page.fill('#receivedOn', dayOffset(0))
      await page.selectOption('#method', 'BANK_TRANSFER')
      await page.fill('#externalRef', `VIR-${STAMP}`)
      await act(page, 'Enregistrer le règlement', 'Le règlement est enregistré')

      await page.reload({ waitUntil: 'load' })
      check((await rowAmount(page, 'Encaissé')) === 200000, 'Encaissé : 200 000 KMF')
      check((await rowAmount(page, 'Solde')) === 250000, 'Solde : 450 000 − 200 000 = 250 000')

      let text = await mainText(page)
      check(text.includes('Partiellement payée'), 'La facture se lit « Partiellement payée »')
      check(/REG-\d{4}-\d{6}/.test(text), 'Le règlement porte son numéro REG-AAAA-000000')

      // §47 : le compte a été CRÉDITÉ.
      await page.goto(`${base}/tresorerie/comptes/${accountId}`, { waitUntil: 'load' })
      check(
        (await rowAmount(page, 'Solde actuel')) === 200000,
        'Le compte est crédité : 0 → 200 000'
      )

      text = await mainText(page)
      check(/Règlement client/.test(text), 'L’écriture porte son origine (Module 06 §20)')
      check(
        /\+ 200 000/.test(text.replace(/ | /g, ' ')),
        'Et son SENS : une ENTRÉE, jamais un nombre nu (§19)'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — §40 ET §23 : LE SOLDE BORNE L’ENCAISSEMENT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/clients/${invoiceId}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#accountId') !== null)

      await page.selectOption('#accountId', accountId)
      await page.fill('#amount', '250001')
      await page.fill('#receivedOn', dayOffset(0))
      await act(page, 'Enregistrer le règlement', 'dépasse le reste dû')

      let text = await mainText(page)
      check(
        /dépasse le reste dû/i.test(text),
        'Un versement au-delà du solde est refusé, avec son motif (§40)'
      )
      check(
        /qu’ADIKOM n’a pas arrêtée|n’a pas arrêtée/i.test(text),
        'Et le refus DIT que la règle du trop-perçu n’est pas définie'
      )

      /*
       * Au KMF près, il passe — et solde la facture. Le formulaire disparaît
       * alors, emportant son message de succès : le repère devient l'état.
       *
       * On resaisit TOUT le formulaire : après un refus, il a été re-rendu.
       */
      await page.selectOption('#accountId', accountId)
      await page.fill('#amount', '250000')
      await page.fill('#receivedOn', dayOffset(0))
      await page.selectOption('#method', 'CASH')
      await actUntil(page, 'Enregistrer le règlement', 'soldée')

      await page.reload({ waitUntil: 'load' })
      check((await rowAmount(page, 'Solde')) === 0, 'La facture est soldée : solde 0 KMF')

      text = await mainText(page)
      check(text.includes('Payée'), 'Elle se lit « Payée » — un statut calculé, jamais écrit')
      check(/soldée/i.test(text), 'Et l’écran refuse tout règlement supplémentaire (§23)')

      const { data: stored } = await admin
        .from('customer_invoices')
        .select('status')
        .eq('id', invoiceId)
        .maybeSingle()
      check(
        stored?.status === 'ISSUED',
        'En base, la facture reste « Émise » : « Payée » se calcule (Workflow 07 §61)',
        `${stored?.status}`
      )

      // Une facture encaissée ne s'annule pas : l'acte n'est même plus proposé.
      check(
        (await page.getByRole('button', { name: 'Annuler la facture' }).count()) === 0,
        'L’annulation n’est plus proposée sur une facture encaissée'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — ANNULER : LE COMPTE ET LE SOLDE REVIENNENT (§28, §29)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/clients/${invoiceId}`, { waitUntil: 'load' })

      /*
       * Le panneau ne s'offre qu'aux règlements validés : il disparaît avec le
       * succès, emportant son message. Le repère devient donc l'état de la
       * facture, qui repasse de « Payée » à « Partiellement payée ».
       */
      await page.getByText('Annuler ce règlement').first().click()
      await actUntil(page, 'Annuler le règlement', 'Partiellement payée')

      await page.reload({ waitUntil: 'load' })
      const remaining = await rowAmount(page, 'Solde')
      check(remaining !== null && remaining > 0, 'Le solde de la facture remonte', `${remaining}`)

      let text = await mainText(page)
      check(/Annulé/.test(text), 'Le règlement reste, marqué annulé : rien n’est effacé')

      await page.goto(`${base}/tresorerie/comptes/${accountId}`, { waitUntil: 'load' })
      const balance = await rowAmount(page, 'Solde actuel')
      check(balance !== null && balance < 450000, 'Le solde du compte redescend', `${balance}`)

      text = await mainText(page)
      check(/Annulée/.test(text), 'L’écriture reste, marquée annulée')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — LA FICHE CLIENT RETROUVE SES RÈGLEMENTS (§32)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/tiers/clients/${fixtures.clientId}?onglet=paiements`, {
        waitUntil: 'load',
      })
      let text = await mainText(page)

      check(/REG-\d{4}-\d{6}/.test(text), 'Les règlements du client y figurent')
      check(
        /Annulé/.test(text),
        'Le règlement annulé y reste visible, distingué du reste (§28, §31)'
      )

      await page.goto(`${base}/tiers/clients/${fixtures.clientId}?onglet=factures`, {
        waitUntil: 'load',
      })
      const collected = await rowAmount(page, 'Total encaissé')
      check(collected !== null && collected > 0, 'L’historique financier chiffre l’encaissé', `${collected}`)

      text = await mainText(page)
      check(
        !/pas encore gérés/i.test(text),
        'La fiche client n’annonce plus les encaissements comme à venir'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — SANS `customer_payments.view`, LE SOLDE N’EST PAS ZÉRO\n')

    {
      const { context, page } = await signIn(browser, base, accounts.noPayment)

      await page.goto(`${base}/facturation/clients/${invoiceId}`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        /ne peut pas consulter les règlements/i.test(text),
        'L’écran DIT que les règlements ne sont pas lisibles (DEC-017)'
      )
      check(
        /Non calculable|non calculable/.test(text),
        'Le solde est annoncé non calculable, jamais affiché à zéro'
      )
      check(
        (await page.getByRole('button', { name: 'Enregistrer le règlement' }).count()) === 0,
        'Et aucun formulaire d’encaissement n’est proposé'
      )
      check(
        !/Payée/.test(text.replace(/Partiellement payée/g, '')),
        'La facture n’est pas dite « Payée » sur une somme illisible'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — AUCUN EFFET DE BORD, DONNÉES DEMO INTACTES\n')

    {
      const [{ data: rentalRow }, { data: vehicleRow }] = await Promise.all([
        admin.from('rentals').select('status').eq('id', rentalId).maybeSingle(),
        admin.from('vehicles').select('status').eq('id', vehicle.id).maybeSingle(),
      ])

      check(
        rentalRow?.status === 'INVOICED',
        'Encaisser ne clôture pas la location : elle reste « Facturée » (Workflow 01 §42)',
        `${rentalRow?.status}`
      )
      check(vehicleRow?.status === 'AVAILABLE', 'Statut du véhicule inchangé', vehicleRow?.status)

      const [{ count: clients }, { count: vehicles }] = await Promise.all([
        admin
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .like('legal_name', '%DEMO%'),
        admin.from('vehicles').select('id', { count: 'exact', head: true }).like('model', '%DEMO%'),
      ])
      check(clients === 3, 'Les trois clients DEMO sont intacts', `${clients}`)
      check(vehicles === 3, 'Les trois véhicules DEMO sont intacts', `${vehicles}`)

      const { count: total } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
      check(total === 157, 'Catalogue conforme', `${total} permissions`)
    }
  } finally {
    await browser.close()

    for (const id of fixtures.customerInvoices) {
      const { data: payments } = await admin
        .from('customer_payments')
        .select('id')
        .eq('customer_invoice_id', id)
      for (const payment of payments ?? []) {
        await admin.rpc('cancel_customer_payment', { p_payment_id: payment.id })
        await admin.from('treasury_entries').delete().eq('customer_payment_id', payment.id)
        await admin.from('customer_payments').delete().eq('id', payment.id)
      }
      await admin.from('customer_invoice_lines').delete().eq('customer_invoice_id', id)
      await admin.from('customer_invoices').delete().eq('id', id)
    }

    for (const id of fixtures.financial) {
      await admin.from('treasury_entries').delete().eq('account_id', id)
      await admin.from('financial_accounts').delete().eq('id', id)
    }

    for (const id of fixtures.rentals) {
      await admin.from('rental_inspection_photos').delete().eq('inspection_id', id)
      await admin.from('rental_inspections').delete().eq('rental_id', id)
      await admin.from('vehicle_occupations').delete().eq('source_id', id)
      await admin.from('rentals').delete().eq('id', id)
    }

    for (const id of fixtures.reservations) {
      await admin.from('vehicle_occupations').delete().eq('source_id', id)
      await admin.from('reservations').delete().eq('id', id)
    }

    for (const vehicleId of fixtures.vehicleIds) {
      await admin.from('vehicle_occupations').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicle_supplier_history').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }

    if (fixtures.ruleId) await admin.from('pricing_rules').delete().eq('id', fixtures.ruleId)
    if (fixtures.clientId) await admin.from('clients').delete().eq('id', fixtures.clientId)
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
    console.log(`${GREEN}RECETTE RÈGLEMENTS CLIENTS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE RÈGLEMENTS CLIENTS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
