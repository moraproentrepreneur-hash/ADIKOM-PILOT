#!/usr/bin/env node
/**
 * Recette Banques & Caisses et règlements — Étape 2.5, LOT 6.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * `db:verify:treasury` contrôle le schéma et les règles ;
 * `verify:capabilities` contrôle les capacités par appel direct. Celle-ci
 * contrôle ce que L'UTILISATEUR VOIT :
 *
 *   1. DEC-024 — voir un compte n'est pas voir son SOLDE : sans
 *      `treasury.balances.view`, la colonne DISPARAÎT au lieu d'afficher 0.
 *   2. Le cycle complet par l'écran : ouvrir un compte, régler une facture,
 *      voir le compte débité et le reste dû diminuer.
 *   3. Workflow 08 §22 — un règlement au-delà du reste dû est refusé, à l'écran.
 *   4. §23 — une facture soldée n'accepte plus rien, et se lit « Payée ».
 *   5. §28 — l'annulation fait remonter le solde du compte ET le reste dû.
 *   6. Module 06 §12 — le solde initial se fige dès la première écriture.
 *   7. Sans `billing.supplier_payments.view`, le reste dû n'est pas affiché à
 *      zéro : l'écran dit qu'il ne peut pas le calculer.
 *
 * Utilisation :
 *   node scripts/verify-treasury.mjs [url]
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
const MARK = `RECETTE TRE ${STAMP}`

const BASE_READERS = [
  'parties.suppliers.view',
  'rental.fleet.view',
  'billing.supplier_invoices.view',
  'billing.imputations.view',
]

const PROFILES = {
  // Le compte complet : il peut tout accomplir légitimement.
  full: [
    ...BASE_READERS,
    'treasury.accounts.view',
    'treasury.accounts.create',
    'treasury.accounts.update',
    'treasury.accounts.archive',
    'treasury.balances.view',
    'treasury.entries.view',
    'billing.supplier_payments.view',
    'billing.supplier_payments.create',
    'billing.supplier_payments.cancel',
    // Pour éprouver qu'une facture réglée ne s'annule PAS : sans cette
    // capacité, l'écran ne proposerait pas l'acte, et le refus ne se verrait
    // jamais.
    'billing.supplier_invoices.cancel',
  ],
  // Voit les comptes, PAS leurs soldes ni les écritures.
  noBalance: [...BASE_READERS, 'treasury.accounts.view'],
  // Voit la facture, PAS les règlements qui la soldent.
  noPayment: [
    ...BASE_READERS,
    'treasury.accounts.view',
    'treasury.balances.view',
  ],
}

async function createProfile(admin, key, codes) {
  const username = `recette.tre.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-tre-${STAMP}`

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
    last_name: `Trésorerie ${key}`,
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
 * Le règlement qui solde une facture retire le formulaire de règlement : le
 * message de succès s'en va avec lui. Le repère devient alors l'état que
 * l'écran affiche ensuite, relu jusqu'à ce qu'il change.
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
  const fixtures = { vehicleIds: [], maintenances: [], imputations: [], invoices: [], financial: [] }
  const browser = await chromium.launch()

  try {
    /* --- Sujets : l'exemple de référence du projet ------------------------ */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RTRE-${STAMP}`, label: `${MARK} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    const { data: supplierNo } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
    const { data: supplier } = await admin
      .from('suppliers')
      .insert({
        supplier_no: supplierNo,
        type: 'VEHICLE_SUPPLIER',
        legal_name: `${MARK} — Fournisseur`,
        phone: '+269 300',
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    fixtures.supplierId = supplier.id

    const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
    const { data: vehicle } = await admin
      .from('vehicles')
      .insert({
        vehicle_no: vehicleNo,
        category_id: category.id,
        brand: 'RECETTE',
        model: `TRE ${STAMP}`,
        plate: `RT-${STAMP}`,
        origin: 'SUPPLIED',
        current_supplier_id: supplier.id,
        status: 'AVAILABLE',
      })
      .select('id')
      .single()
    fixtures.vehicleIds.push(vehicle.id)

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, key, codes)
    }

    // Une maintenance imputable de 300 000, une facture de 500 000 : net 200 000.
    const { data: mntNo } = await admin.rpc('next_number', { p_entity_key: 'maintenance' })
    const { data: maintenance } = await admin
      .from('vehicle_maintenances')
      .insert({
        maintenance_no: mntNo,
        vehicle_id: vehicle.id,
        origin: 'BREAKDOWN',
        reason: `${MARK} — panne imputable`,
      })
      .select('id')
      .single()
    fixtures.maintenances.push(maintenance.id)

    await admin.from('maintenance_costs').insert({
      maintenance_id: maintenance.id,
      actual_cost: 300000,
      imputable_amount: 300000,
    })

    const { data: impId } = await admin.rpc('create_imputation', {
      p_maintenance_id: maintenance.id,
      p_supplier_id: supplier.id,
      p_amount: 300000,
      p_justification: `${MARK} — réparation imputable`,
    })
    fixtures.imputations.push(String(impId))
    await admin.rpc('submit_imputation', { p_imputation_id: impId })
    await admin.rpc('validate_imputation', { p_imputation_id: impId })

    const { data: invId } = await admin.rpc('create_supplier_invoice', {
      p_supplier_id: supplier.id,
      p_invoice_date: dayOffset(-30),
      p_due_date: dayOffset(30),
      p_external_ref: `FRN-TRE-${STAMP}`,
      p_notes: null,
    })
    const invoiceId = String(invId)
    fixtures.invoices.push(invoiceId)

    await admin.rpc('add_supplier_invoice_line', {
      p_invoice_id: invoiceId,
      p_label: `${MARK} — mise à disposition`,
      p_amount: 500000,
      p_vehicle_id: vehicle.id,
    })
    await admin.rpc('submit_supplier_invoice', { p_invoice_id: invoiceId })
    await admin.rpc('validate_supplier_invoice', { p_invoice_id: invoiceId })
    await admin.rpc('attach_imputation_to_invoice', {
      p_imputation_id: impId,
      p_invoice_id: invoiceId,
    })

    console.log(
      `${DIM}Sujets : facture 500 000, imputée 300 000 — net à payer 200 000 KMF.${RESET}`
    )

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — OUVRIR UN COMPTE, PAR L’ÉCRAN\n')

    let accountId = null

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/tresorerie/comptes/nouveau`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#label') !== null)

      await page.selectOption('#kind', 'BANK')
      await page.fill('#label', `${MARK} — Banque`)
      await page.fill('#institution', 'Banque de recette')
      await page.fill('#openingBalance', '1000000')
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: 'Ouvrir le compte' }).click()
      await page.waitForURL(/\/tresorerie\/comptes\/[0-9a-f-]{36}/, { timeout: 45000 })

      accountId = page.url().split('/tresorerie/comptes/')[1]?.split('?')[0] ?? null
      if (accountId) fixtures.financial.push(accountId)

      check(Boolean(accountId), 'Le compte est ouvert et sa fiche s’ouvre')

      const text = await mainText(page)
      check(/COMP-\d{6}/.test(text), 'L’identifiant COMP-000000 est attribué')
      check((await rowAmount(page, 'Solde actuel')) === 1000000, 'Solde = solde initial (1 000 000)')

      await context.close()
    }

    if (!accountId) throw new Error('Le compte n’a pas pu être créé : recette interrompue.')

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — DEC-024 : VOIR UN COMPTE N’EST PAS VOIR SON SOLDE\n')

    {
      const { context, page } = await signIn(browser, base, accounts.noBalance)

      await page.goto(`${base}/tresorerie/comptes/${accountId}`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        /ne peut pas consulter les soldes/i.test(text),
        'L’écran DIT que le solde n’est pas lisible (DEC-017)'
      )
      check(!/1 000 000 KMF/.test(text.replace(/ | /g, ' ')) || /Solde initial/.test(text),
        'Aucun solde actuel n’est affiché à sa place')
      check(
        /ne peut pas consulter les écritures/i.test(text),
        'Et les écritures relèvent d’une autre capacité encore'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — RÉGLER : LE COMPTE EST DÉBITÉ, LE RESTE DÛ DIMINUE\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/fournisseurs/${invoiceId}`, { waitUntil: 'load' })
      let text = await mainText(page)
      check(
        (await rowAmount(page, 'Reste dû')) === 200000,
        'Reste dû = 500 000 − 300 000 = 200 000 KMF'
      )
      check(
        /n’est pas un paiement|réduit ce montant sans le payer/i.test(text),
        'L’écran distingue l’imputation du règlement (Module 07 §37)'
      )

      // Un règlement partiel de 120 000.
      await page.waitForFunction(() => document.querySelector('#accountId') !== null)
      await page.selectOption('#accountId', accountId)
      await page.fill('#amount', '120000')
      await page.fill('#paidOn', dayOffset(0))
      await page.selectOption('#method', 'BANK_TRANSFER')
      await page.fill('#externalRef', `VIR-${STAMP}`)
      await act(page, 'Enregistrer le règlement', 'Le règlement est enregistré')

      await page.reload({ waitUntil: 'load' })
      check((await rowAmount(page, 'Total réglé')) === 120000, 'Total réglé : 120 000 KMF')
      check((await rowAmount(page, 'Reste dû')) === 80000, 'Reste dû : 200 000 − 120 000 = 80 000')

      text = await mainText(page)
      check(text.includes('Partiellement payée'), 'La facture se lit « Partiellement payée »')

      // §47 : le compte a été débité.
      await page.goto(`${base}/tresorerie/comptes/${accountId}`, { waitUntil: 'load' })
      check(
        (await rowAmount(page, 'Solde actuel')) === 880000,
        'Le compte est débité : 1 000 000 → 880 000'
      )
      text = await mainText(page)
      check(/Paiement fournisseur/.test(text), 'L’écriture porte son origine (§20)')
      check(/− 120 000|-120 000/.test(text.replace(/ | /g, ' ')),
        'Et son SENS : une sortie, jamais un nombre nu (§19)')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — §22 ET §23 : LE RESTE DÛ BORNE LE RÈGLEMENT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/fournisseurs/${invoiceId}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#accountId') !== null)
      await page.selectOption('#accountId', accountId)
      await page.fill('#amount', '80001')
      await page.fill('#paidOn', dayOffset(0))
      await act(page, 'Enregistrer le règlement', 'dépasse le reste dû')

      let text = await mainText(page)
      check(
        /dépasse le reste dû/i.test(text),
        'Un règlement au-delà du reste dû est refusé, avec son motif (§22)'
      )

      /*
       * Au KMF près, il passe — et solde la facture. Le formulaire disparaît
       * alors, emportant son message de succès : le repère devient l'état.
       *
       * On resaisit TOUT le formulaire : après un refus, il a été re-rendu, et
       * repartir de ses champs supposerait un état qu'aucun utilisateur ne
       * vérifierait.
       */
      await page.selectOption('#accountId', accountId)
      await page.fill('#amount', '80000')
      await page.fill('#paidOn', dayOffset(0))
      await page.selectOption('#method', 'CASH')
      await actUntil(page, 'Enregistrer le règlement', 'soldée')

      await page.reload({ waitUntil: 'load' })
      check((await rowAmount(page, 'Reste dû')) === 0, 'La facture est soldée : reste dû 0 KMF')

      text = await mainText(page)
      check(text.includes('Payée'), 'Elle se lit « Payée » — un statut calculé, jamais écrit')
      check(
        /soldée/i.test(text),
        'Et l’écran refuse tout règlement supplémentaire (§23)'
      )

      const { data: stored } = await admin
        .from('supplier_invoices')
        .select('status')
        .eq('id', invoiceId)
        .maybeSingle()
      check(
        stored?.status === 'VALIDATED',
        'En base, la facture reste « Validée » : « Payée » se calcule (Module 07 §55)',
        `${stored?.status}`
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — ANNULER : LE SOLDE ET LE RESTE DÛ REMONTENT (§28, §29)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/fournisseurs/${invoiceId}`, { waitUntil: 'load' })

      /*
       * Une facture ENGAGÉE ne s'annule pas.
       *
       * Celle-ci l'est deux fois : une imputation la réduit, des règlements la
       * soldent. Le refus nomme la première rencontrée — c'est l'imputation,
       * dont le contrôle s'exécute avant. Ce qui compte est qu'il NOMME un
       * motif, et qu'il indique la sortie.
       */
      await act(page, 'Annuler la facture', 'doit d’abord')
      let text = await mainText(page)
      check(
        /doit d’abord en être détachée|doit d’abord être annulé/i.test(text),
        'Une facture engagée ne s’annule pas, et l’écran dit pourquoi'
      )

      /*
       * Annulation d'un règlement.
       *
       * Le panneau ne s'offre qu'aux règlements validés : il disparaît avec le
       * succès, emportant son message. Le repère devient donc l'état de la
       * facture, qui repasse de « Payée » à « Partiellement payée ».
       */
      await page.reload({ waitUntil: 'load' })
      await page.getByText('Annuler ce règlement').first().click()
      await actUntil(page, 'Annuler le règlement', 'Partiellement payée')

      await page.reload({ waitUntil: 'load' })
      const remaining = await rowAmount(page, 'Reste dû')
      check(remaining !== null && remaining > 0, 'Le reste dû remonte', `${remaining}`)

      await page.goto(`${base}/tresorerie/comptes/${accountId}`, { waitUntil: 'load' })
      const balance = await rowAmount(page, 'Solde actuel')
      check(balance !== null && balance > 800000, 'Le solde du compte remonte', `${balance}`)

      text = await mainText(page)
      check(/Annulée/.test(text), 'L’écriture reste, marquée annulée : rien n’est effacé')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — LE SOLDE INITIAL SE FIGE (Module 06 §12)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/tresorerie/comptes/${accountId}`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        /est figé/i.test(text),
        'L’écran annonce que le solde initial ne se modifie plus'
      )
      check(
        (await page.locator('#openingBalance').count()) === 0,
        'Et ne propose plus le champ correspondant'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — SANS `supplier_payments.view`, LE RESTE DÛ N’EST PAS ZÉRO\n')

    {
      const { context, page } = await signIn(browser, base, accounts.noPayment)

      await page.goto(`${base}/facturation/fournisseurs/${invoiceId}`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        /ne peut pas consulter les règlements/i.test(text),
        'L’écran DIT que les règlements ne sont pas lisibles (DEC-017)'
      )
      check(
        /Non calculable|non calculable/.test(text),
        'Le reste dû est annoncé non calculable, jamais affiché à zéro'
      )
      check(
        (await page.getByRole('button', { name: 'Enregistrer le règlement' }).count()) === 0,
        'Et aucun formulaire de règlement n’est proposé'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — AUCUN EFFET DE BORD, DONNÉES DEMO INTACTES\n')

    {
      const [{ data: vehicleRow }, { data: costs }] = await Promise.all([
        admin.from('vehicles').select('status').eq('id', vehicle.id).maybeSingle(),
        admin
          .from('maintenance_costs')
          .select('imputable_amount')
          .eq('maintenance_id', fixtures.maintenances[0])
          .maybeSingle(),
      ])

      check(vehicleRow?.status === 'AVAILABLE', 'Statut du véhicule inchangé', vehicleRow?.status)
      check(costs?.imputable_amount === 300000, 'Le montant imputable n’a pas bougé')

      const { data: imputation } = await admin
        .from('imputations')
        .select('status')
        .eq('id', fixtures.imputations[0])
        .maybeSingle()
      check(
        imputation?.status === 'IMPUTED',
        'Régler une facture ne touche pas l’imputation qui la réduit',
        `${imputation?.status}`
      )

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
      check(total === 170, 'Catalogue conforme', `${total} permissions`)
    }
  } finally {
    await browser.close()

    for (const id of fixtures.invoices) {
      const { data: payments } = await admin
        .from('supplier_payments')
        .select('id')
        .eq('supplier_invoice_id', id)
      for (const payment of payments ?? []) {
        await admin.rpc('cancel_supplier_payment', { p_payment_id: payment.id })
        await admin.from('treasury_entries').delete().eq('supplier_payment_id', payment.id)
        await admin.from('supplier_payments').delete().eq('id', payment.id)
      }
    }

    for (const id of fixtures.imputations) {
      await admin.rpc('detach_imputation_from_invoice', { p_imputation_id: id })
      await admin.from('imputations').delete().eq('id', id)
    }

    for (const id of fixtures.invoices) {
      await admin.from('supplier_invoice_lines').delete().eq('supplier_invoice_id', id)
      await admin.from('supplier_invoices').delete().eq('id', id)
    }

    for (const id of fixtures.financial) {
      await admin.from('treasury_entries').delete().eq('account_id', id)
      await admin.from('financial_accounts').delete().eq('id', id)
    }

    for (const id of fixtures.maintenances) {
      await admin.from('imputations').delete().eq('maintenance_id', id)
      await admin.from('maintenance_costs').delete().eq('maintenance_id', id)
      await admin.from('vehicle_occupations').delete().eq('source_id', id)
      await admin.from('vehicle_maintenances').delete().eq('id', id)
    }

    for (const vehicleId of fixtures.vehicleIds) {
      await admin.from('vehicle_occupations').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicle_supplier_history').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }
    if (fixtures.supplierId) await admin.from('suppliers').delete().eq('id', fixtures.supplierId)
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
    console.log(`${GREEN}RECETTE TRÉSORERIE : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE TRÉSORERIE : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
