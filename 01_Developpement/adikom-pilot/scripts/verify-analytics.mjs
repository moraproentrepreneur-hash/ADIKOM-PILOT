#!/usr/bin/env node
/**
 * Recette Statistiques & Rapports — Phase 3, LOT 11.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * `db:verify:analytics` contrôle l'arithmétique des sommes, avec une connexion
 * qui contourne RLS. Celle-ci contrôle ce que L'UTILISATEUR VOIT, dans un
 * navigateur, avec de vraies sessions :
 *
 *   1. §26, §58 — les quatre écrans s'ouvrent et affichent les chiffres réels,
 *      identiques à ceux que la base rend au rôle de service ;
 *   2. §59 — la période change réellement les chiffres, y compris la période
 *      PERSONNALISÉE, et deux dates inversées sont remises à l'endroit ;
 *   3. DEC-032 §d — une synthèse privée d'une de ses lectures SE TAIT : sans
 *      `billing.customer_payments.view`, aucun montant, et la permission
 *      manquante est NOMMÉE (DEC-017) ;
 *   4. CLAUDE.md §57 — sans `billing.imputations.view`, la dette fournisseur
 *      n'est pas affichée gonflée du montant imputé : elle n'est pas affichée
 *      du tout ;
 *   5. §27, §60 — l'état par tiers se recoupe avec la statistique : ses lignes
 *      font son total ;
 *   6. DEC-017 — un tiers illisible est dit « non lisible », jamais inventé, et
 *      ses montants restent justes ;
 *   7. DEC-011, DEC-024 — la garde est SERVEUR : les fonctions refusent l'appel
 *      direct, et les écrans refusent l'URL tapée à la main ;
 *   8. DEC-022 — la clé publique seule n'exécute aucune de ces fonctions ;
 *   9. §22 — un onglet qu'on ne peut pas ouvrir n'est pas proposé ;
 *  10. lire n'écrit rien : aucun statut déplacé, aucune donnée DEMO touchée.
 *
 * Utilisation :
 *   node scripts/verify-analytics.mjs [url]
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
const MARK = `RECETTE STATS ${STAMP}`

/*
 * AUCUNE DATE EN DUR.
 *
 * Une échéance figée finit par tomber dans le passé, et la recette échoue sans
 * qu'aucune régression n'ait eu lieu. Toutes les bornes se posent par rapport au
 * jour d'exécution, sur `Indian/Comoro` (DEC-025 §e).
 */
const INVOICE_DAY = dayOffset(-20)
const DUE_DAY = dayOffset(-5)
const SUPPLIER_INVOICE_DAY = dayOffset(-10)
const SUPPLIER_DUE_DAY = dayOffset(-3)
const TODAY = dayOffset(0)
const WINDOW_FROM = dayOffset(-30)

/** La fenêtre personnalisée qui englobe tout le jeu de recette. */
const RANGE = `periode=personnalisee&du=${WINDOW_FROM}&au=${TODAY}`

const PROFILES = {
  /* Le poste complet : il voit les quatre écrans, et tous leurs montants. */
  analyste: [
    'dashboard.view',
    'parties.clients.view',
    'parties.suppliers.view',
    'billing.customer_invoices.view',
    'billing.customer_payments.view',
    'billing.supplier_invoices.view',
    'billing.supplier_payments.view',
    'billing.imputations.view',
    'billing.customer.stats.view',
    'billing.customer.reports.view',
    'billing.supplier.stats.view',
    'billing.supplier.reports.view',
  ],
  /*
   * Le même, PRIVÉ de `billing.customer_payments.view`.
   *
   * Il détient pourtant la capacité de statistiques ET la lecture des factures :
   * c'est le cas qui distingue « masquer » de « protéger ». Sans les règlements,
   * l'encaissé vaudrait zéro et toute facture se lirait impayée — l'écran doit
   * REFUSER, pas arrondir.
   */
  sansReglements: [
    'dashboard.view',
    'parties.clients.view',
    'billing.customer_invoices.view',
    'billing.customer.stats.view',
    'billing.customer.reports.view',
  ],
  /*
   * Le cas le plus grave du lot : privé de `billing.imputations.view`.
   *
   * Une imputation n'est pas un paiement (CLAUDE.md §57) — et elle ne doit pas
   * non plus pouvoir être ignorée. Sans elle, la dette annoncée vaudrait le brut.
   */
  sansImputations: [
    'dashboard.view',
    'parties.suppliers.view',
    'billing.supplier_invoices.view',
    'billing.supplier_payments.view',
    'billing.supplier.stats.view',
    'billing.supplier.reports.view',
  ],
  /*
   * Toute la facturation, mais AUCUN répertoire de tiers.
   *
   * Les montants doivent rester justes ; les noms, eux, ne se devinent pas.
   */
  sansTiers: [
    'dashboard.view',
    'billing.customer_invoices.view',
    'billing.customer_payments.view',
    'billing.supplier_invoices.view',
    'billing.supplier_payments.view',
    'billing.imputations.view',
    'billing.customer.reports.view',
    'billing.supplier.reports.view',
  ],
  /* La liste, et rien d'autre : ni statistiques, ni rapports. */
  listeSeule: [
    'dashboard.view',
    'parties.clients.view',
    'billing.customer_invoices.view',
    'billing.customer_payments.view',
  ],
}

async function createProfile(admin, key, codes) {
  const username = `recette.stats.${key}.${STAMP}`.toLowerCase()
  const email = `${username}@adikom.test`
  const password = `recette-stats-${STAMP}`

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
    last_name: `Stats ${key}`,
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
  await page.waitForURL('**/tableau-de-bord', { timeout: 60000 })

  return { context, page }
}

/**
 * Un appel de mise en place qui échoue doit ARRÊTER la recette.
 *
 * Un `rpc` dont on ignore l'erreur laisse un sujet à moitié construit — et les
 * contrôles qui suivent échouent alors pour une raison qui n'est pas la leur.
 */
async function rpc(admin, fn, args) {
  const { data, error } = await admin.rpc(fn, args)
  if (error) throw new Error(`${fn} : ${error.message}`)
  return data
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/**
 * La valeur d'une carte KPI, en entier.
 *
 * Lue sur `data-kpi-value` — la valeur BRUTE, jamais le texte formaté : un
 * espace insécable ou un suffixe « KMF » ne doit pas décider d'un contrôle.
 * Rend `null` lorsque la carte n'affiche aucun chiffre : refus ou erreur.
 */
async function kpiValue(page, label) {
  const value = page.locator(`[data-kpi="${label}"] [data-kpi-value]`).first()
  if ((await value.count()) === 0) return null
  const raw = await value.getAttribute('data-kpi-value')
  return raw === null ? null : Number(raw)
}

/** Un total de pied de tableau, ramené à un entier. */
async function totalValue(page, key) {
  const cell = page.locator(`[data-total="${key}"]`).first()
  if ((await cell.count()) === 0) return null
  const text = await cell.innerText()
  const digits = text.replace(/[^\d]/g, '')
  return digits === '' ? null : Number(digits)
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
  const sessions = {}
  const fixtures = {
    vehicleIds: [],
    customerInvoices: [],
    supplierInvoices: [],
    imputations: [],
    maintenances: [],
    financial: [],
  }
  const browser = await chromium.launch()

  try {
    /* --- Sujets de recette ------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RSTA-${STAMP}`, label: `${MARK} — Catégorie` })
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
        phone: '+269 920',
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    fixtures.clientId = client.id

    const { data: supplierNo } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
    const { data: supplier } = await admin
      .from('suppliers')
      .insert({
        supplier_no: supplierNo,
        type: 'VEHICLE_SUPPLIER',
        legal_name: `${MARK} — Fournisseur`,
        phone: '+269 921',
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    fixtures.supplierId = supplier.id

    const { data: garageNo } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
    const { data: garage } = await admin
      .from('suppliers')
      .insert({
        supplier_no: garageNo,
        type: 'MAINTENANCE_PROVIDER',
        legal_name: `${MARK} — Garage`,
        phone: '+269 922',
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    fixtures.garageId = garage.id

    const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
    const { data: vehicle } = await admin
      .from('vehicles')
      .insert({
        vehicle_no: vehicleNo,
        category_id: category.id,
        brand: 'RECETTE',
        model: `STATS ${STAMP}`,
        plate: `RS-${STAMP}`,
        origin: 'SUPPLIED',
        current_supplier_id: supplier.id,
        status: 'AVAILABLE',
      })
      .select('id')
      .single()
    fixtures.vehicleIds.push(vehicle.id)

    const accountId = await rpc(admin, 'create_financial_account', {
      p_kind: 'BANK',
      p_label: `${MARK} — Banque`,
      p_institution: 'BIC ADIKOM',
      p_account_reference: `CPT-${STAMP}`,
      p_opening_balance: 0,
      p_opened_on: WINDOW_FROM,
      p_description: MARK,
    })
    fixtures.financial.push(accountId)

    /*
     * Le cycle client documenté : 450 000 facturés il y a vingt jours,
     * 200 000 encaissés AUJOURD'HUI. Les deux dates sont distinctes — c'est
     * précisément ce que la série doit savoir séparer (Workflow 08 §11).
     */
    const invoiceId = await rpc(admin, 'create_customer_invoice', {
      p_client_id: client.id,
      p_invoice_date: INVOICE_DAY,
      p_due_date: DUE_DAY,
      p_rental_id: null,
      p_notes: MARK,
    })
    fixtures.customerInvoices.push(invoiceId)
    await rpc(admin, 'add_customer_invoice_line', {
      p_invoice_id: invoiceId,
      p_kind: 'RENTAL',
      p_label: 'Location 3 jours',
      p_quantity: 3,
      p_unit_price: 150000,
      p_justification: null,
    })
    await rpc(admin, 'issue_customer_invoice', { p_invoice_id: invoiceId, p_reason: MARK })
    await rpc(admin, 'record_customer_payment', {
      p_invoice_id: invoiceId,
      p_account_id: accountId,
      p_amount: 200000,
      p_received_on: TODAY,
      p_method: 'BANK_TRANSFER',
      p_external_ref: `VIR-${STAMP}`,
      p_notes: MARK,
    })

    const { data: invoiceRow } = await admin
      .from('customer_invoices')
      .select('invoice_no, status')
      .eq('id', invoiceId)
      .maybeSingle()
    check(
      invoiceRow?.status === 'ISSUED',
      'Une facture client de 450 000 KMF, émise, échéance dépassée',
      invoiceRow?.invoice_no
    )

    /*
     * Le cycle fournisseur documenté : 1 000 000 brut, 300 000 imputés,
     * 200 000 réglés — donc 500 000 restant dus, et jamais 1 000 000.
     */
    const maintenanceId = await rpc(admin, 'create_maintenance', {
      p_vehicle_id: vehicle.id,
      p_origin: 'BREAKDOWN',
      p_reason: `${MARK} — panne imputable`,
      p_provider_supplier_id: garage.id,
    })
    fixtures.maintenances.push(maintenanceId)
    await rpc(admin, 'record_maintenance_costs', {
      p_maintenance_id: maintenanceId,
      p_estimated_cost: 250000,
      p_actual_cost: 300000,
      p_imputable_amount: 300000,
      p_notes: MARK,
    })

    const imputationId = await rpc(admin, 'create_imputation', {
      p_maintenance_id: maintenanceId,
      p_supplier_id: supplier.id,
      p_amount: 300000,
      p_justification: `${MARK} — panne imputable au fournisseur.`,
    })
    fixtures.imputations.push(imputationId)
    await rpc(admin, 'submit_imputation', { p_imputation_id: imputationId })
    await rpc(admin, 'validate_imputation', {
      p_imputation_id: imputationId,
      p_reason: MARK,
    })

    const supplierInvoiceId = await rpc(admin, 'create_supplier_invoice', {
      p_supplier_id: supplier.id,
      p_invoice_date: SUPPLIER_INVOICE_DAY,
      p_due_date: SUPPLIER_DUE_DAY,
      p_external_ref: `FRN-${STAMP}`,
      p_notes: MARK,
    })
    fixtures.supplierInvoices.push(supplierInvoiceId)
    await rpc(admin, 'add_supplier_invoice_line', {
      p_invoice_id: supplierInvoiceId,
      p_label: 'Mise à disposition',
      p_amount: 1000000,
      p_vehicle_id: vehicle.id,
    })
    await rpc(admin, 'submit_supplier_invoice', { p_invoice_id: supplierInvoiceId })
    await rpc(admin, 'validate_supplier_invoice', { p_invoice_id: supplierInvoiceId })
    await rpc(admin, 'attach_imputation_to_invoice', {
      p_imputation_id: imputationId,
      p_invoice_id: supplierInvoiceId,
    })
    await rpc(admin, 'record_supplier_payment', {
      p_invoice_id: supplierInvoiceId,
      p_account_id: accountId,
      p_amount: 200000,
      p_paid_on: TODAY,
      p_method: 'BANK_TRANSFER',
      p_external_ref: `VIRF-${STAMP}`,
      p_notes: MARK,
    })

    const { data: gross } = await admin.rpc('supplier_invoice_gross', {
      p_invoice_id: supplierInvoiceId,
    })
    const { data: imputed } = await admin.rpc('supplier_invoice_imputed', {
      p_invoice_id: supplierInvoiceId,
    })
    check(
      Number(gross) === 1000000 && Number(imputed) === 300000,
      'Une facture fournisseur de 1 000 000 KMF, dont 300 000 imputés',
      `brut ${gross}, imputé ${imputed}`
    )

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, key, codes)
    }
    check(Object.keys(accounts).length === 5, 'Cinq profils de recette créés')

    /*
     * LA RÉFÉRENCE.
     *
     * Ce que la BASE rend au rôle de service, sur la fenêtre de recette. Les
     * écrans devront afficher exactement cela — ni un total à eux, ni une somme
     * paginée.
     */
    const { data: refCustomer } = await admin.rpc('billing_customer_stats', {
      p_from: WINDOW_FROM,
      p_to: TODAY,
    })
    const { data: refSupplier } = await admin.rpc('billing_supplier_stats', {
      p_from: WINDOW_FROM,
      p_to: TODAY,
    })
    const expectedCustomer = refCustomer[0]
    const expectedSupplier = refSupplier[0]

    check(
      Number(expectedCustomer.invoiced_amount) >= 450000,
      'La base compte la facture de recette dans le facturé',
      `${expectedCustomer.invoiced_amount} KMF`
    )
    check(
      Number(expectedSupplier.payable_amount) >= 500000,
      'La base compte la dette nette, imputation déduite',
      `${expectedSupplier.payable_amount} KMF`
    )

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — STATISTIQUES CLIENTS : LES CHIFFRES SONT CEUX DE LA BASE (§26)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.analyste)
      await page.goto(`${base}/facturation/clients/statistiques?${RANGE}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.body.innerText.includes('Total facturé'))
      const text = await mainText(page)

      check(/Statistiques — Factures clients/.test(text), 'L’écran s’ouvre')

      check(
        (await kpiValue(page, 'Total facturé')) === Number(expectedCustomer.invoiced_amount),
        'Total facturé identique à celui de la base',
        `${expectedCustomer.invoiced_amount}`
      )
      check(
        (await kpiValue(page, 'Total encaissé')) === Number(expectedCustomer.collected_amount),
        'Total encaissé identique à celui de la base',
        `${expectedCustomer.collected_amount}`
      )
      check(
        (await kpiValue(page, 'Total restant dû')) ===
          Number(expectedCustomer.outstanding_amount),
        'Reste dû identique à celui de la base',
        `${expectedCustomer.outstanding_amount}`
      )
      check(
        (await kpiValue(page, 'Dont échu')) ===
          Number(expectedCustomer.outstanding_overdue_amount),
        'Part échue identique à celle de la base',
        `${expectedCustomer.outstanding_overdue_amount}`
      )
      check(
        (await kpiValue(page, 'Factures non soldées')) >= 1,
        'La facture de recette est comptée comme non soldée'
      )
      check(
        /Une créance ne se borne pas à une période/.test(text),
        'L’écran distingue le flux de la situation'
      )
      check(
        /Facturé et encaissé/.test(text),
        'La série « paiements par période » est présente (§26, §59)'
      )
      check(!/Non accessible/.test(text), 'Aucun indicateur n’est refusé au poste complet')
      check(!/n’a pas pu être chargé/.test(text), 'Aucun indicateur n’est en erreur')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LA PÉRIODE CHANGE RÉELLEMENT LES CHIFFRES (§59)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.analyste)

      // Aujourd'hui : le règlement y est, la facture d'il y a vingt jours non.
      await page.goto(`${base}/facturation/clients/statistiques?periode=jour`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.body.innerText.includes('Total encaissé'))

      const todayInvoiced = await kpiValue(page, 'Total facturé')
      const todayCollected = await kpiValue(page, 'Total encaissé')
      const todayOutstanding = await kpiValue(page, 'Total restant dû')

      check(todayCollected >= 200000, 'Le règlement du jour est compté aujourd’hui')
      check(
        todayInvoiced < Number(expectedCustomer.invoiced_amount),
        'La facture d’il y a vingt jours n’est PAS comptée aujourd’hui',
        `${todayInvoiced} contre ${expectedCustomer.invoiced_amount}`
      )
      check(
        todayOutstanding === Number(expectedCustomer.outstanding_amount),
        'La créance, elle, ne dépend pas de la période',
        `${todayOutstanding}`
      )

      // Période personnalisée bornée à la seule journée de la facture.
      await page.goto(
        `${base}/facturation/clients/statistiques?periode=personnalisee&du=${INVOICE_DAY}&au=${INVOICE_DAY}`,
        { waitUntil: 'load' }
      )
      await page.waitForFunction(() => document.body.innerText.includes('Total facturé'))
      const oneDay = await mainText(page)

      check(
        (await kpiValue(page, 'Total facturé')) >= 450000,
        'La période personnalisée retrouve la facture'
      )
      check(
        (await kpiValue(page, 'Total encaissé')) === 0,
        'Et n’y compte aucun encaissement : il est d’un autre jour'
      )
      check(
        oneDay.includes(INVOICE_DAY.split('-').reverse().join('/')),
        'L’écran annonce la période analysée'
      )

      // Deux dates INVERSÉES : remises à l'endroit, et l'écran le dit.
      await page.goto(
        `${base}/facturation/clients/statistiques?periode=personnalisee&du=${TODAY}&au=${WINDOW_FROM}`,
        { waitUntil: 'load' }
      )
      await page.waitForFunction(() => document.body.innerText.includes('Total facturé'))
      const swapped = await mainText(page)

      check(
        /dates étaient inversées/.test(swapped),
        'Deux dates inversées sont remises à l’endroit, et l’écran l’annonce'
      )
      check(
        (await kpiValue(page, 'Total facturé')) === Number(expectedCustomer.invoiced_amount),
        'Et la période lue est bien la bonne'
      )

      // Une période personnalisée incomplète retombe sur le mois, en le disant.
      await page.goto(
        `${base}/facturation/clients/statistiques?periode=personnalisee&du=${TODAY}`,
        { waitUntil: 'load' }
      )
      await page.waitForFunction(() => document.body.innerText.includes('Total facturé'))
      check(
        /deux dates valides/.test(await mainText(page)),
        'Une période incomplète est signalée, jamais appliquée en silence'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — SANS LES RÈGLEMENTS, LA SYNTHÈSE SE TAIT (DEC-032 §d)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.sansReglements)
      await page.goto(`${base}/facturation/clients/statistiques?${RANGE}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.body.innerText.includes('Total facturé'))
      const text = await mainText(page)

      check(/Statistiques — Factures clients/.test(text), 'L’écran s’ouvre malgré tout')
      check(
        (await kpiValue(page, 'Total facturé')) === null,
        'AUCUN montant n’est affiché — pas même le facturé, qu’il pourrait lire'
      )
      check(
        (await kpiValue(page, 'Total encaissé')) === null,
        'Aucun encaissé : un zéro se lirait « rien n’a été payé »'
      )
      check(
        /billing\.customer_payments\.view/.test(text),
        'La permission manquante est NOMMÉE (DEC-017)'
      )
      check(
        /toute facture se lirait impayée/.test(text),
        'Et l’écran explique pourquoi il refuse'
      )
      check(!/0 KMF/.test(text), 'Aucun zéro n’est présenté à la place d’un refus')

      // L'appel DIRECT est refusé lui aussi : la garde est serveur (DEC-011).
      const session = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await session.auth.signInWithPassword({
        email: accounts.sansReglements.email,
        password: accounts.sansReglements.password,
      })
      sessions.sansReglements = session

      const direct = await session.rpc('billing_customer_stats', {
        p_from: WINDOW_FROM,
        p_to: TODAY,
      })
      check(
        Boolean(direct.error),
        'L’appel direct de la fonction est refusé côté serveur',
        direct.error?.message?.slice(0, 60)
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — SANS LES IMPUTATIONS, LA DETTE N’EST PAS GONFLÉE (CLAUDE.md §57)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.sansImputations)
      await page.goto(`${base}/facturation/fournisseurs/statistiques?${RANGE}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.body.innerText.includes('Total facturé'))
      const text = await mainText(page)

      check(
        (await kpiValue(page, 'Reste à payer')) === null,
        'Aucune dette n’est affichée — surtout pas le montant brut'
      )
      check(
        !/1 000 000/.test(text.replace(/ | /g, ' ')),
        'Le montant brut n’apparaît nulle part comme une dette'
      )
      check(
        /billing\.imputations\.view/.test(text),
        'La permission manquante est nommée'
      )
      check(
        /imputation n’est pas un paiement/.test(text),
        'Et l’écran rappelle pourquoi elle est indispensable'
      )

      const session = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await session.auth.signInWithPassword({
        email: accounts.sansImputations.email,
        password: accounts.sansImputations.password,
      })
      sessions.sansImputations = session

      const stats = await session.rpc('billing_supplier_stats', {
        p_from: WINDOW_FROM,
        p_to: TODAY,
      })
      check(Boolean(stats.error), 'La statistique fournisseur refuse l’appel direct')

      const report = await session.rpc('billing_supplier_report', {
        p_from: WINDOW_FROM,
        p_to: TODAY,
      })
      check(Boolean(report.error), 'Le rapport fournisseur refuse l’appel direct')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — STATISTIQUES FOURNISSEURS AU POSTE COMPLET (§58)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.analyste)
      await page.goto(`${base}/facturation/fournisseurs/statistiques?${RANGE}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.body.innerText.includes('Total imputé'))
      const text = await mainText(page)

      check(
        (await kpiValue(page, 'Total facturé')) === Number(expectedSupplier.gross_amount),
        'Brut identique à celui de la base',
        `${expectedSupplier.gross_amount}`
      )
      check(
        (await kpiValue(page, 'Total imputé')) === Number(expectedSupplier.imputed_amount),
        'Imputé identique à celui de la base',
        `${expectedSupplier.imputed_amount}`
      )
      check(
        (await kpiValue(page, 'Total réglé')) === Number(expectedSupplier.paid_amount),
        'Réglé identique à celui de la base',
        `${expectedSupplier.paid_amount}`
      )
      check(
        (await kpiValue(page, 'Reste à payer')) === Number(expectedSupplier.payable_amount),
        'Reste à payer = brut − imputé − payé',
        `${expectedSupplier.payable_amount}`
      )
      check(
        (await kpiValue(page, 'Total imputé')) > 0 &&
          (await kpiValue(page, 'Total réglé')) !== (await kpiValue(page, 'Total imputé')),
        'Imputé et réglé restent deux chiffres distincts (CLAUDE.md §57)'
      )
      check(
        /Trois flux distincts/.test(text),
        'L’écran dit que ces trois flux ne se retranchent pas'
      )
      check(!/Non accessible/.test(text), 'Aucun indicateur refusé au poste complet')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — LES ÉTATS : LEURS LIGNES FONT LEUR TOTAL (§27, §60)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.analyste)

      await page.goto(`${base}/facturation/clients/rapports?${RANGE}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Rapports'))
      const clientText = await mainText(page)

      check(/Rapports — Factures clients/.test(clientText), 'L’état client s’ouvre')
      check(
        (await page.locator(`[data-report-row="${client.id}"]`).count()) > 0,
        'Le client de recette y figure'
      )
      check(
        (await totalValue(page, 'facture')) === Number(expectedCustomer.invoiced_amount),
        'Le total facturé de l’état vaut celui de la statistique',
        `${expectedCustomer.invoiced_amount}`
      )
      check(
        (await totalValue(page, 'encaisse')) === Number(expectedCustomer.collected_amount),
        'Le total encaissé aussi'
      )
      check(
        (await totalValue(page, 'reste')) === Number(expectedCustomer.outstanding_amount),
        'Le total restant dû aussi'
      )
      check(
        (await totalValue(page, 'echu')) === Number(expectedCustomer.outstanding_overdue_amount),
        'Et la part échue aussi'
      )
      check(clientText.includes(MARK), 'Le nom du client est lisible et affiché')

      await page.goto(`${base}/facturation/fournisseurs/rapports?${RANGE}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.body.innerText.includes('Rapports'))

      check(
        (await page.locator(`[data-report-row="${supplier.id}"]`).count()) > 0,
        'Le fournisseur de recette figure dans son état'
      )
      check(
        (await totalValue(page, 'brut')) === Number(expectedSupplier.gross_amount),
        'Le total brut de l’état vaut celui de la statistique'
      )
      check(
        (await totalValue(page, 'impute')) === Number(expectedSupplier.imputed_amount),
        'Le total imputé aussi'
      )
      check(
        (await totalValue(page, 'regle')) === Number(expectedSupplier.paid_amount),
        'Le total réglé aussi'
      )
      check(
        (await totalValue(page, 'reste')) === Number(expectedSupplier.payable_amount),
        'Et le reste dû aussi'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — UN TIERS ILLISIBLE EST DIT, JAMAIS INVENTÉ (DEC-017)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.sansTiers)

      await page.goto(`${base}/facturation/clients/rapports?${RANGE}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Rapports'))
      const text = await mainText(page)

      check(/Client non lisible/.test(text), 'L’état dit que le client n’est pas lisible')
      check(!text.includes(MARK), 'Et n’en révèle pas le nom')
      check(
        (await totalValue(page, 'facture')) === Number(expectedCustomer.invoiced_amount),
        'Les montants, eux, restent justes',
        `${expectedCustomer.invoiced_amount}`
      )

      await page.goto(`${base}/facturation/fournisseurs/rapports?${RANGE}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.body.innerText.includes('Rapports'))
      const supplierText = await mainText(page)

      check(
        /Fournisseur non lisible/.test(supplierText),
        'Même règle côté fournisseur'
      )
      check(
        (await totalValue(page, 'reste')) === Number(expectedSupplier.payable_amount),
        'Et la dette reste exacte'
      )

      // Statistiques NON attribuées : l'écran est refusé, pas vide.
      await page.goto(`${base}/facturation/clients/statistiques?${RANGE}`, {
        waitUntil: 'load',
      })
      check(
        page.url().includes('/acces-refuse'),
        'Sans `billing.customer.stats.view`, l’écran est refusé, pas vidé',
        page.url().split('/').pop()
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — UN ONGLET QU’ON NE PEUT PAS OUVRIR N’EST PAS PROPOSÉ (§22)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.listeSeule)
      await page.goto(`${base}/facturation/clients`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Factures clients'))
      const text = await mainText(page)

      check(
        !/Statistiques/.test(text) && !/Rapports/.test(text),
        'Ni « Statistiques » ni « Rapports » ne sont proposés'
      )

      await page.goto(`${base}/facturation/clients/rapports?${RANGE}`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'L’URL tapée à la main est refusée',
        page.url().split('/').pop()
      )

      const session = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await session.auth.signInWithPassword({
        email: accounts.listeSeule.email,
        password: accounts.listeSeule.password,
      })
      sessions.listeSeule = session

      for (const fn of [
        'billing_customer_stats',
        'billing_customer_series',
        'billing_customer_report',
      ]) {
        const args =
          fn === 'billing_customer_series'
            ? { p_from: WINDOW_FROM, p_to: TODAY, p_grain: 'month' }
            : { p_from: WINDOW_FROM, p_to: TODAY }
        const result = await session.rpc(fn, args)
        check(Boolean(result.error), `\`${fn}\` refuse l’appel direct sans sa capacité`)
      }

      await context.close()
    }

    // Et l'onglet EST proposé à qui le détient : une barrière qui bloque tout
    // le monde n'est pas une barrière, c'est une panne.
    {
      const { context, page } = await signIn(browser, base, accounts.analyste)
      await page.goto(`${base}/facturation/clients`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Factures clients'))
      const text = await mainText(page)
      check(
        /Statistiques/.test(text) && /Rapports/.test(text),
        'Les deux onglets sont proposés à qui les détient'
      )
      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — LA CLÉ PUBLIQUE N’EXÉCUTE RIEN (DEC-022)\n')

    {
      const anon = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })

      for (const [fn, args] of [
        ['billing_customer_stats', { p_from: WINDOW_FROM, p_to: TODAY }],
        ['billing_customer_report', { p_from: WINDOW_FROM, p_to: TODAY }],
        ['billing_supplier_stats', { p_from: WINDOW_FROM, p_to: TODAY }],
        ['billing_supplier_report', { p_from: WINDOW_FROM, p_to: TODAY }],
        ['billing_customer_series', { p_from: WINDOW_FROM, p_to: TODAY, p_grain: 'month' }],
        ['billing_supplier_series', { p_from: WINDOW_FROM, p_to: TODAY, p_grain: 'month' }],
      ]) {
        const result = await anon.rpc(fn, args)
        check(Boolean(result.error), `\`${fn}\` est hors de portée de la clé publique`)
      }
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — LIRE N’ÉCRIT RIEN, DONNÉES DEMO INTACTES\n')

    {
      const [{ data: inv }, { data: sup }, { data: imp }, { data: veh }] = await Promise.all([
        admin.from('customer_invoices').select('status').eq('id', invoiceId).maybeSingle(),
        admin
          .from('supplier_invoices')
          .select('status')
          .eq('id', supplierInvoiceId)
          .maybeSingle(),
        admin.from('imputations').select('status').eq('id', imputationId).maybeSingle(),
        admin.from('vehicles').select('status').eq('id', vehicle.id).maybeSingle(),
      ])

      check(inv?.status === 'ISSUED', 'La facture client reste « Émise »', inv?.status)
      check(sup?.status === 'VALIDATED', 'La facture fournisseur reste « Validée »', sup?.status)
      check(imp?.status === 'IMPUTED', 'L’imputation reste « Imputée »', imp?.status)
      check(veh?.status === 'AVAILABLE', 'Le statut du véhicule est inchangé', veh?.status)

      const { count: entries } = await admin
        .from('treasury_entries')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', fixtures.financial[0])
      check(entries === 2, 'Deux écritures seulement : les deux règlements', `${entries}`)

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
      check(total === 153, 'Catalogue conforme', `${total} permissions`)
    }
  } finally {
    await browser.close()
    for (const session of Object.values(sessions)) await session.auth.signOut()

    /* --- Nettoyage, dans l'ordre des dépendances ------------------------ */
    for (const id of fixtures.imputations) {
      await admin.rpc('detach_imputation_from_invoice', { p_imputation_id: id })
      await admin.from('imputation_documents').delete().eq('imputation_id', id)
      await admin.from('imputations').delete().eq('id', id)
    }

    for (const id of fixtures.supplierInvoices) {
      const { data: payments } = await admin
        .from('supplier_payments')
        .select('id')
        .eq('supplier_invoice_id', id)
      for (const payment of payments ?? []) {
        await admin.from('treasury_entries').delete().eq('supplier_payment_id', payment.id)
        await admin.from('supplier_payments').delete().eq('id', payment.id)
      }
      await admin.from('supplier_invoice_lines').delete().eq('supplier_invoice_id', id)
      await admin.from('supplier_invoices').delete().eq('id', id)
    }

    for (const id of fixtures.customerInvoices) {
      const { data: payments } = await admin
        .from('customer_payments')
        .select('id')
        .eq('customer_invoice_id', id)
      for (const payment of payments ?? []) {
        await admin.from('treasury_entries').delete().eq('customer_payment_id', payment.id)
        await admin.from('customer_payments').delete().eq('id', payment.id)
      }
      await admin.from('customer_invoice_lines').delete().eq('customer_invoice_id', id)
      await admin.from('customer_invoices').delete().eq('id', id)
    }

    for (const id of fixtures.maintenances) {
      await admin.from('maintenance_documents').delete().eq('maintenance_id', id)
      await admin.from('maintenance_quotes').delete().eq('maintenance_id', id)
      await admin.from('maintenance_cost_lines').delete().eq('maintenance_id', id)
      await admin.from('maintenance_costs').delete().eq('maintenance_id', id)
      await admin.from('vehicle_occupations').delete().eq('source_id', id)
      await admin.from('vehicle_maintenances').delete().eq('id', id)
    }

    for (const id of fixtures.financial) {
      await admin.from('treasury_entries').delete().eq('account_id', id)
      await admin.from('financial_accounts').delete().eq('id', id)
    }

    for (const vehicleId of fixtures.vehicleIds) {
      await admin.from('vehicle_documents').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicle_occupations').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicle_supplier_history').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }

    if (fixtures.clientId) await admin.from('clients').delete().eq('id', fixtures.clientId)
    if (fixtures.supplierId) await admin.from('suppliers').delete().eq('id', fixtures.supplierId)
    if (fixtures.garageId) await admin.from('suppliers').delete().eq('id', fixtures.garageId)
    if (fixtures.categoryId) {
      await admin.from('vehicle_categories').delete().eq('id', fixtures.categoryId)
    }

    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    /*
     * BALAYAGE PAR MARQUEUR.
     *
     * Une recette interrompue en cours de route n'a pas suivi tous ses
     * identifiants : ce qu'elle a laissé ne se retrouve que par sa marque. Le
     * balayage reprend donc la chaîne, puis COMPTE ce qui subsiste — un
     * nettoyage silencieux qui échoue est pire qu'un nettoyage absent.
     */
    const leftovers = []
    for (const [table, column] of [
      ['customer_invoices', 'notes'],
      ['supplier_invoices', 'notes'],
      ['financial_accounts', 'label'],
      ['clients', 'legal_name'],
      ['suppliers', 'legal_name'],
      ['vehicle_categories', 'label'],
    ]) {
      const { count } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .ilike(column, `%${MARK}%`)
      if (count) leftovers.push(`${table} : ${count}`)
    }

    if (leftovers.length > 0) {
      console.log(`\n${RED}Résidus de recette non supprimés — ${leftovers.join(', ')}${RESET}`)
      failed += 1
    }

    console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE STATISTIQUES & RAPPORTS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE STATISTIQUES & RAPPORTS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
