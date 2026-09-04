#!/usr/bin/env node
/**
 * Recette Centre de notifications — Phase 3, LOT 10.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * `db:verify:notifications` contrôle la veille et son arithmétique ;
 * `verify:capabilities` contrôle les refus par appel direct. Celle-ci contrôle
 * ce que L'UTILISATEUR VOIT, et ce qu'il ne doit pas voir — les quatorze
 * critères d'acceptation du Module 02 §39, éprouvés dans un navigateur :
 *
 *   1. §39.1  — l'utilisateur autorisé accède à son centre ; l'autre en est écarté.
 *   2. §39.2  — les notifications viennent d'ÉVÉNEMENTS RÉELS : les sujets créés
 *               pour la recette apparaissent, avec leurs références.
 *   3. §39.3  — elles respectent les permissions : une source fermée se TAIT, et
 *               l'écran DIT laquelle (DEC-017).
 *   4. §39.4  — elles peuvent être lues, une par une.
 *   5. §39.5  — les non lues sont identifiables.
 *   6. §39.6  — le compteur fonctionne, et suit le marquage.
 *   7. §39.7  — les niveaux sont distinguables, PAR UN MOT (§20 Module 01).
 *   8. §39.8  — une notification renvoie vers l'objet concerné.
 *   9. §39.9  — les notifications financières sont PROTÉGÉES, et le montant
 *               annoncé est le net : 700 000, jamais 1 000 000 (CLAUDE.md §57).
 *  10. §39.11 — aucun doublon : une situation, une notification.
 *  11. §39.12 — l'état de lecture est PROPRE à chaque utilisateur (§24).
 *  12. §39.14 — aucune notification ne contourne les permissions : appels RPC
 *               directs et écriture directe dans `notification_reads`.
 *  13. §20    — « tout marquer comme lu » ne modifie que l'état de lecture.
 *  14. §33    — le tableau de bord affiche le nombre de non lues.
 *
 * Utilisation :
 *   node scripts/verify-notifications.mjs [url]
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
const MARK = `RECETTE NOTIF ${STAMP}`

/** Les lectures d'exploitation, sans lesquelles RLS masquerait les sujets. */
const OPERATIONS = [
  'rental.reservations.view',
  'rental.rentals.view',
  'rental.fleet.view',
  'rental.maintenance.view',
  'rental.incidents.view',
  'rental.documents.view',
  'parties.clients.view',
  'parties.suppliers.view',
]

const FINANCE = [
  'billing.customer_invoices.view',
  'billing.customer_payments.view',
  'billing.supplier_invoices.view',
  'billing.imputations.view',
  'billing.supplier_payments.view',
]

const PROFILES = {
  /* Le veilleur complet : toutes les sources lui sont ouvertes. */
  veilleur: ['notifications.view', ...OPERATIONS, ...FINANCE],

  /*
   * Un second veilleur complet : il éprouve que l'état de lecture est PROPRE à
   * chaque utilisateur (§24). Il porte en plus `dashboard.view`, qui lui ouvre
   * le tableau de bord où le compteur de non lues est annoncé (§33).
   */
  veilleur2: ['notifications.view', 'dashboard.view', ...OPERATIONS, ...FINANCE],

  /* L'exploitant : rien de financier. Les factures échues doivent être muettes,
     et les sources fermées NOMMÉES. */
  exploitant: ['notifications.view', ...OPERATIONS],

  /*
   * LE PROFIL CENTRAL DE CE LOT.
   *
   * Il voit les factures fournisseurs et les règlements, mais PAS les
   * imputations. Sous la seule RLS, le net vaudrait le brut : la notification
   * réclamerait 1 000 000 là où ADIKOM ne doit que 700 000. La famille doit
   * donc se TAIRE (DEC-032 §d, CLAUDE.md §57).
   */
  dette_aveugle: [
    'notifications.view',
    ...OPERATIONS,
    'billing.supplier_invoices.view',
    'billing.supplier_payments.view',
  ],

  /* Même piège côté client : sans les règlements, une facture soldée paraîtrait
     impayée. */
  creance_aveugle: ['notifications.view', ...OPERATIONS, 'billing.customer_invoices.view'],

  /* `notifications.view` et rien d'autre : le centre s'ouvre, et il est fermé. */
  nu: ['notifications.view'],

  /* Sans la capacité : l'écran n'est pas atteignable. */
  sans_acces: [...OPERATIONS, 'dashboard.view'],
}

async function createProfile(admin, key, codes) {
  const username = `recette.notif.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-notif-${STAMP}`

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
    last_name: `Notif ${key}`,
    username,
    email,
    status: 'ACTIVE',
  })
  if (profileError) throw new Error(`profil ${key} : ${profileError.message}`)

  const { data: catalog } = await admin.from('permissions').select('id, code').in('code', codes)
  if ((catalog ?? []).length !== codes.length) {
    const found = new Set((catalog ?? []).map((p) => p.code))
    throw new Error(
      `catalogue incomplet (${key}) : ${codes.filter((c) => !found.has(c)).join(', ')}`
    )
  }

  const { error: grantError } = await admin
    .from('user_permissions')
    .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' })))
  if (grantError) throw new Error(`permissions ${key} : ${grantError.message}`)

  return { id, email, password, username }
}

async function signIn(browser, base, account, landing = '**/tableau-de-bord') {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${base}/connexion`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#username') !== null)
  await page.fill('#username', account.username)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(landing, { timeout: 60000 })

  return { context, page }
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/** La valeur d'un compteur du centre, en entier — jamais son texte formaté. */
async function counter(page, label) {
  const node = page.locator(`[data-compteur="${label}"]`).first()
  if ((await node.count()) === 0) return null
  const raw = await node.getAttribute('data-compteur-valeur')
  return raw === null ? null : Number(raw)
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
    reservations: [],
    rentals: [],
    customerInvoices: [],
    supplierInvoices: [],
    imputations: [],
    maintenances: [],
    documents: [],
    financial: [],
  }
  const browser = await chromium.launch()

  async function session(key) {
    if (sessions[key]) return sessions[key]
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await client.auth.signInWithPassword({
      email: accounts[key].email,
      password: accounts[key].password,
    })
    if (error) throw new Error(`session ${key} : ${error.message}`)
    sessions[key] = client
    return client
  }

  const refused = (result) => Boolean(result.error)

  try {
    /* --- Sujets de recette ------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RNOT-${STAMP}`, label: `${MARK} — Catégorie` })
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
        phone: '+269 700',
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
        phone: '+269 701',
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
        phone: '+269 702',
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
        model: `NOTIF ${STAMP}`,
        plate: `RN-${STAMP}`,
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

    /*
     * UNE LOCATION EN RETARD — aucune date en dur : le retard est dérivé de
     * l'heure courante (DEC-025 §a), la recette reste vraie dans six mois.
     */
    const { data: reservationNo } = await admin.rpc('next_number', {
      p_entity_key: 'reservation',
    })
    const start = new Date(Date.now() - 2 * 86400_000)
    const end = new Date(Date.now() - 3600_000)
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
      p_started_at: start.toISOString(),
      p_mileage: 10000,
      p_fuel_level: 'FULL',
    })

    const { data: rentalRow } = await admin
      .from('rentals')
      .select('rental_no, status, expected_return_at')
      .eq('id', rentalId)
      .maybeSingle()
    check(
      rentalRow?.status === 'IN_PROGRESS' &&
        new Date(rentalRow.expected_return_at).getTime() < Date.now(),
      'Une location en cours, retour attendu DÉPASSÉ',
      `${rentalRow?.rental_no}`
    )

    /* Un document de véhicule dont l'échéance approche (§28). */
    const { data: document } = await admin
      .from('vehicle_documents')
      .insert({
        vehicle_id: vehicle.id,
        doc_type: 'INSURANCE',
        label: `${MARK} — Assurance`,
        expires_on: dayOffset(10),
      })
      .select('id')
      .single()
    fixtures.documents.push(document.id)

    /* Une caisse, pour les règlements. */
    const { data: accountId } = await admin.rpc('create_financial_account', {
      p_kind: 'CASH',
      p_label: `${MARK} — Caisse`,
      p_institution: 'Responsable de recette',
      p_account_reference: null,
      p_opening_balance: 2000000,
      p_opened_on: dayOffset(-30),
      p_description: MARK,
    })
    fixtures.financial.push(accountId)

    /* Une facture client ÉCHUE, partiellement réglée : 450 000 − 200 000. */
    const { data: invoiceId } = await admin.rpc('create_customer_invoice', {
      p_client_id: client.id,
      p_invoice_date: dayOffset(-20),
      p_due_date: dayOffset(-5),
      p_rental_id: null,
      p_notes: MARK,
    })
    fixtures.customerInvoices.push(invoiceId)
    await admin.rpc('add_customer_invoice_line', {
      p_invoice_id: invoiceId,
      p_kind: 'SERVICE',
      p_label: 'Prestation de recette',
      p_quantity: 1,
      p_unit_price: 450000,
      p_justification: null,
    })
    await admin.rpc('issue_customer_invoice', { p_invoice_id: invoiceId, p_reason: MARK })
    await admin.rpc('record_customer_payment', {
      p_invoice_id: invoiceId,
      p_account_id: accountId,
      p_amount: 200000,
      p_received_on: dayOffset(-1),
      p_method: 'CASH',
      p_external_ref: null,
      p_notes: MARK,
    })

    /*
     * UNE FACTURE FOURNISSEUR ÉCHUE, RÉDUITE PAR UNE IMPUTATION.
     *
     *   Brut     1 000 000
     *   Imputé     300 000   ← n'est pas un paiement (CLAUDE.md §16, §57)
     *   Net        700 000   ← ce que la notification doit annoncer
     */
    const { data: maintenanceId } = await admin.rpc('create_maintenance', {
      p_vehicle_id: vehicle.id,
      p_origin: 'BREAKDOWN',
      p_reason: `${MARK} — Panne imputable`,
      p_provider_supplier_id: garage.id,
    })
    fixtures.maintenances.push(maintenanceId)
    await admin.rpc('record_maintenance_costs', {
      p_maintenance_id: maintenanceId,
      p_estimated_cost: 250000,
      p_actual_cost: 300000,
      p_imputable_amount: 300000,
      p_notes: MARK,
    })

    const { data: imputationId } = await admin.rpc('create_imputation', {
      p_maintenance_id: maintenanceId,
      p_supplier_id: supplier.id,
      p_amount: 300000,
      p_justification:
        'Panne imputable au fournisseur selon les conditions de mise à disposition.',
    })
    fixtures.imputations.push(imputationId)
    await admin.rpc('submit_imputation', { p_imputation_id: imputationId })
    await admin.rpc('validate_imputation', {
      p_imputation_id: imputationId,
      p_reason: MARK,
    })

    const { data: supplierInvoiceId } = await admin.rpc('create_supplier_invoice', {
      p_supplier_id: supplier.id,
      p_invoice_date: dayOffset(-10),
      p_due_date: dayOffset(-3),
      p_external_ref: `FRN-NOTIF-${STAMP}`,
      p_notes: MARK,
    })
    fixtures.supplierInvoices.push(supplierInvoiceId)
    await admin.rpc('add_supplier_invoice_line', {
      p_invoice_id: supplierInvoiceId,
      p_label: 'Mise à disposition',
      p_amount: 1000000,
      p_vehicle_id: vehicle.id,
    })
    await admin.rpc('submit_supplier_invoice', { p_invoice_id: supplierInvoiceId })
    await admin.rpc('validate_supplier_invoice', { p_invoice_id: supplierInvoiceId })
    await admin.rpc('attach_imputation_to_invoice', {
      p_imputation_id: imputationId,
      p_invoice_id: supplierInvoiceId,
    })

    const { data: supplierInvoiceRow } = await admin
      .from('supplier_invoices')
      .select('invoice_no')
      .eq('id', supplierInvoiceId)
      .maybeSingle()
    const { data: customerInvoiceRow } = await admin
      .from('customer_invoices')
      .select('invoice_no')
      .eq('id', invoiceId)
      .maybeSingle()

    console.log(
      `${DIM}Une location en retard, un document, une facture client échue, une facture fournisseur imputée.${RESET}`
    )

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — LE VEILLEUR ACCÈDE À SON CENTRE (§39.1, §39.2)\n')

    let veilleurPage
    let veilleurContext
    {
      const opened = await signIn(browser, base, accounts.veilleur)
      veilleurContext = opened.context
      veilleurPage = opened.page

      await veilleurPage.goto(`${base}/notifications`, { waitUntil: 'load' })
      const text = await mainText(veilleurPage)

      check(/Centre de notifications/.test(text), 'La page s’ouvre')
      check(
        new RegExp(rentalRow.rental_no).test(text),
        'La location en retard est notifiée, avec sa référence (§39.2)',
        rentalRow.rental_no
      )
      check(
        /Retour non enregistré/.test(text),
        'Le titre nomme la situation, il ne la devine pas (§5)'
      )
      check(
        new RegExp(`${MARK} — Assurance`).test(text),
        'L’échéance de document est notifiée (§28)'
      )
      check(
        new RegExp(customerInvoiceRow.invoice_no).test(text),
        'La facture client échue est notifiée',
        customerInvoiceRow.invoice_no
      )
      check(
        new RegExp(supplierInvoiceRow.invoice_no).test(text),
        'La facture fournisseur échue est notifiée',
        supplierInvoiceRow.invoice_no
      )
      check(
        !/Sources non surveillées/.test(text),
        'Aucune source ne lui est fermée'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LE MONTANT ANNONCÉ EST LE NET (CLAUDE.md §16, §57)\n')

    {
      const text = await mainText(veilleurPage)

      check(
        /700[\s  ]000/.test(text),
        'La dette fournisseur annoncée vaut 700 000 — brut moins imputé'
      )
      check(
        !/1[\s  ]000[\s  ]000/.test(text),
        'Le brut de 1 000 000 n’est JAMAIS annoncé comme dû'
      )
      check(
        /imputations déduites/i.test(text),
        'L’écran DIT que les imputations sont déduites'
      )
      check(
        /250[\s  ]000/.test(text),
        'La créance client annoncée vaut 250 000 — total moins encaissé'
      )
      check(
        !/450[\s  ]000/.test(text),
        'Le total facturé de 450 000 n’est pas annoncé comme restant dû'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — NIVEAUX, COMPTEURS, DOUBLONS (§39.5, §39.6, §39.7, §39.11)\n')

    let unreadBefore
    {
      const text = await mainText(veilleurPage)

      check(/Important/.test(text), 'Le niveau « Important » est écrit (§20 Module 01)')
      check(/À surveiller/.test(text), 'Le niveau « À surveiller » aussi')
      check(/Non lue/.test(text), 'Les non lues sont identifiables (§39.5)')

      unreadBefore = await counter(veilleurPage, 'Non lues')
      const total = await counter(veilleurPage, 'En veille')
      check(
        unreadBefore !== null && unreadBefore >= 4,
        'Le compteur de non lues est renseigné (§39.6)',
        `${unreadBefore}`
      )
      check(
        total !== null && total >= unreadBefore,
        'Le total de la veille englobe les non lues',
        `${total}`
      )

      const shown = await veilleurPage.locator('[data-notification]').count()
      const keys = await veilleurPage.locator('[data-notification]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-notification'))
      )
      check(
        new Set(keys).size === shown,
        'Aucun doublon : une situation, une notification (§39.11, §27)',
        `${shown} lignes`
      )

      // Le compteur du gabarit est celui de la page : une seule vérité.
      const badge = await veilleurPage.locator('[data-badge="/notifications"]').first()
      const badgeText = (await badge.count()) > 0 ? (await badge.innerText()).trim() : null
      check(
        badgeText !== null && Number(badgeText) === unreadBefore,
        'La pastille de navigation porte le même chiffre que la page (§17)',
        `${badgeText}`
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — UNE NOTIFICATION MÈNE À SON OBJET (§39.8, §21)\n')

    {
      const link = veilleurPage
        .locator(`a[href="/location/locations/${rentalId}"]`)
        .first()
      const found = (await link.count()) > 0
      check(found, 'La notification de retard porte un lien vers la location')

      if (found) {
        await link.click()
        await veilleurPage.waitForURL(`**/location/locations/${rentalId}`, { timeout: 30000 })
        const text = await mainText(veilleurPage)
        check(
          new RegExp(rentalRow.rental_no).test(text),
          'L’écran atteint est bien la location concernée',
          rentalRow.rental_no
        )
        await veilleurPage.goto(`${base}/notifications`, { waitUntil: 'load' })
      }
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — MARQUER COMME LU (§39.4, §19)\n')

    {
      const key = `rental.return.late:${rentalId}`
      const row = veilleurPage.locator(`[data-notification="${key}"]`)
      check((await row.count()) === 1, 'La notification de retard est présente')
      check(
        (await row.getAttribute('data-notification-lue')) === 'non',
        'Elle est non lue avant le geste'
      )

      await row.locator('button[type="submit"]').first().click()

      // On attend l'EFFET, jamais un mot : la ligne devient lue.
      await veilleurPage.waitForFunction(
        (selector) => {
          const node = document.querySelector(selector)
          return node !== null && node.getAttribute('data-notification-lue') === 'oui'
        },
        `[data-notification="${key}"]`,
        { timeout: 30000 }
      )

      const text = await mainText(veilleurPage)
      check(true, 'La notification passe à l’état « lue »')
      check(/Lue le /.test(text), 'La date de lecture est conservée (§31)')

      const unreadAfter = await counter(veilleurPage, 'Non lues')
      check(
        unreadAfter === unreadBefore - 1,
        'Le compteur de non lues a diminué d’une unité',
        `${unreadBefore} → ${unreadAfter}`
      )

      // §19 : « une notification importante ne doit pas disparaître simplement
      // parce qu'elle a été lue ».
      check(
        new RegExp(rentalRow.rental_no).test(text),
        'Lue, la notification reste présente à l’historique (§19)'
      )

      // Le filtre d'état la retrouve d'un côté, et plus de l'autre.
      await veilleurPage.goto(`${base}/notifications?etat=read`, { waitUntil: 'load' })
      check(
        (await veilleurPage.locator(`[data-notification="${key}"]`).count()) === 1,
        'Le filtre « Lues » la retrouve (§18)'
      )
      await veilleurPage.goto(`${base}/notifications?etat=unread`, { waitUntil: 'load' })
      check(
        (await veilleurPage.locator(`[data-notification="${key}"]`).count()) === 0,
        'Le filtre « Non lues » ne la propose plus'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — LES FILTRES DE NIVEAU ET DE MODULE (§18)\n')

    {
      await veilleurPage.goto(`${base}/notifications?niveau=IMPORTANT`, { waitUntil: 'load' })
      let text = await mainText(veilleurPage)

      /*
       * Le contrôle porte sur les LIGNES, jamais sur le texte de la page : la
       * barre de filtres nomme les quatre niveaux, et chercher « Rappel » dans
       * le texte trouverait toujours le bouton du filtre.
       */
      const levels = await veilleurPage
        .locator('[data-notification]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-notification-niveau')))
      check(levels.length > 0, 'Le filtre « Important » rend des lignes', `${levels.length}`)
      check(
        levels.every((level) => level === 'IMPORTANT'),
        'Et aucune ligne d’un autre niveau',
        [...new Set(levels)].join(', ')
      )

      await veilleurPage.goto(`${base}/notifications?module=billing`, { waitUntil: 'load' })
      text = await mainText(veilleurPage)
      check(
        new RegExp(supplierInvoiceRow.invoice_no).test(text),
        'Le filtre « Facturation » rend les factures'
      )
      check(
        !new RegExp(rentalRow.rental_no).test(text),
        'Et pas les situations de location'
      )

      // Un filtre bricolé ne casse pas l'écran.
      await veilleurPage.goto(`${base}/notifications?niveau=;drop%20table&etat=xxx`, {
        waitUntil: 'load',
      })
      text = await mainText(veilleurPage)
      check(
        /Centre de notifications/.test(text),
        'Un paramètre inconnu est ignoré, sans erreur'
      )
      check(
        new RegExp(rentalRow.rental_no).test(text),
        'Et la veille complète est rendue'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — L’ÉTAT DE LECTURE EST PROPRE À CHAQUE UTILISATEUR (§24)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.veilleur2)
      await page.goto(`${base}/notifications`, { waitUntil: 'load' })

      const key = `rental.return.late:${rentalId}`
      const row = page.locator(`[data-notification="${key}"]`)
      check((await row.count()) === 1, 'Le second veilleur voit la même situation')
      check(
        (await row.getAttribute('data-notification-lue')) === 'non',
        'Elle reste NON LUE pour lui : chacun conserve son propre état (§24)'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — SANS DROIT FINANCIER : MUET, ET DIT (§39.3, §39.9, DEC-017)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.exploitant)
      await page.goto(`${base}/notifications`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        new RegExp(rentalRow.rental_no).test(text),
        'Les situations d’exploitation lui remontent normalement'
      )
      check(
        !new RegExp(supplierInvoiceRow.invoice_no).test(text),
        'Aucune facture fournisseur ne fuit'
      )
      check(
        !new RegExp(customerInvoiceRow.invoice_no).test(text),
        'Aucune facture client ne fuit'
      )
      check(
        !/700[\s  ]000/.test(text) && !/250[\s  ]000/.test(text),
        'Aucun montant n’apparaît'
      )
      check(
        /Sources non surveillées/.test(text),
        'L’écran DIT que des sources ne lui sont pas ouvertes'
      )
      check(
        /billing\.customer_invoices\.view/.test(text) &&
          /billing\.supplier_invoices\.view/.test(text),
        'Et il NOMME les permissions manquantes (DEC-017)'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — UNE VEILLE MUETTE EST REFUSÉE, JAMAIS APPROCHÉE (DEC-032 §d)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.dette_aveugle)
      await page.goto(`${base}/notifications`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        !new RegExp(supplierInvoiceRow.invoice_no).test(text),
        'Sans `imputations.view`, la facture fournisseur est MUETTE'
      )
      check(
        !/1[\s  ]000[\s  ]000/.test(text),
        'Le brut n’est jamais annoncé à sa place — une imputation n’est pas un paiement'
      )
      check(
        /billing\.imputations\.view/.test(text),
        'La capacité manquante est nommée, sans rien révéler du contenu'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.creance_aveugle)
      await page.goto(`${base}/notifications`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        !new RegExp(customerInvoiceRow.invoice_no).test(text),
        'Sans `customer_payments.view`, la facture client est MUETTE'
      )
      check(
        !/450[\s  ]000/.test(text),
        'Une facture partiellement réglée n’est pas annoncée à son total'
      )
      check(
        /billing\.customer_payments\.view/.test(text),
        'La capacité manquante est nommée'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — `notifications.view` SEULE, ET SANS ELLE (§39.1)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.nu)
      await page.goto(`${base}/notifications`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(/Centre de notifications/.test(text), 'Le centre s’ouvre')
      check(/Rien à signaler/.test(text), 'Il ne présente aucune notification')
      check(
        /Sources non surveillées/.test(text),
        'Et il DIT que rien ne lui est surveillé : il n’est pas calme, il est fermé'
      )
      check(
        !new RegExp(rentalRow.rental_no).test(text),
        'Aucune situation ne fuit'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.sans_acces)
      await page.goto(`${base}/notifications`, { waitUntil: 'load' })
      check(
        /acces-refuse/.test(page.url()),
        'Sans `notifications.view`, l’écran n’est pas atteignable',
        page.url().replace(base, '')
      )

      /*
       * Le refus est PROPRE : il oriente sans exposer la donnée protégée
       * (Règles permissions §29). La capacité voyage dans l'URL, à destination
       * de l'administrateur ; l'écran, lui, ne dévoile rien.
       */
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(/Accès refusé/.test(text), 'Le refus est annoncé clairement')
      check(
        !/notification_reads|supplier_invoice|rpc|postgres/i.test(text),
        'Et il n’expose aucun détail technique (Règles permissions §29)'
      )

      // La pastille de navigation ne s'affiche pas non plus.
      await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      check(
        (await page.locator('[data-badge="/notifications"]').count()) === 0,
        'Aucune pastille de notification pour qui n’y a pas accès'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('11 — AUCUN CONTOURNEMENT PAR APPEL DIRECT (§39.14, §37)\n')

    {
      const nu = await session('nu')
      const sansAcces = await session('sans_acces')
      const veilleur = await session('veilleur')
      const aveugle = await session('dette_aveugle')

      // Sans la capacité, les cinq fonctions refusent — pas de « 0 » complaisant.
      check(
        refused(await sansAcces.rpc('notifications_watch')),
        'Sans `notifications.view` : la veille est refusée'
      )
      check(
        refused(await sansAcces.rpc('notifications_feed', {})),
        '… le centre aussi'
      )
      check(
        refused(await sansAcces.rpc('notifications_summary')),
        '… les compteurs aussi'
      )
      check(
        refused(await sansAcces.rpc('notification_mark_all_read')),
        '… et « tout marquer comme lu » aussi'
      )

      // Avec la capacité, tout répond : une barrière qui bloque tout le monde
      // n'est pas une barrière, c'est une panne.
      const feed = await veilleur.rpc('notifications_feed', {})
      check(
        !refused(feed) && Array.isArray(feed.data) && feed.data.length > 0,
        'Avec `notifications.view`, le centre répond',
        feed.error?.message ?? `${feed.data?.length} notification(s)`
      )

      // La veille du profil « nu » est vide : la capacité ouvre l'écran, pas
      // les données (DEC-024).
      const nuFeed = await nu.rpc('notifications_feed', {})
      check(
        !refused(nuFeed) && Array.isArray(nuFeed.data) && nuFeed.data.length === 0,
        '`notifications.view` seule ouvre l’écran, mais aucune source'
      )

      // La facture fournisseur n'apparaît pas dans la veille du lecteur aveugle.
      const aveugleFeed = await aveugle.rpc('notifications_feed', {})
      check(
        !refused(aveugleFeed) &&
          !(aveugleFeed.data ?? []).some(
            (row) => row.key === `supplier_invoice.overdue:${supplierInvoiceId}`
          ),
        'La famille fournisseur est absente de la veille du lecteur aveugle'
      )

      /* --- L'état de lecture n'est pas un espace d'écriture libre --------- */

      const forged = await veilleur.from('notification_reads').insert({
        user_id: accounts.veilleur2.id,
        notification_key: `rental.return.late:${rentalId}`,
      })
      check(
        refused(forged),
        'Impossible de marquer une notification AU NOM d’un autre utilisateur (§37)'
      )

      const malformed = await veilleur.from('notification_reads').insert({
        user_id: accounts.veilleur.id,
        notification_key: 'n’importe quoi',
      })
      check(refused(malformed), 'Une clé malformée est refusée par la base')

      const updated = await veilleur
        .from('notification_reads')
        .update({ read_at: new Date(0).toISOString() })
        .eq('user_id', accounts.veilleur.id)
      const removed = await veilleur
        .from('notification_reads')
        .delete()
        .eq('user_id', accounts.veilleur.id)
      const { count: stillRead } = await admin
        .from('notification_reads')
        .select('notification_key', { count: 'exact', head: true })
        .eq('user_id', accounts.veilleur.id)
      check(
        (refused(updated) || refused(removed) || stillRead >= 1) && stillRead >= 1,
        'Une lecture ne se réécrit pas et ne s’efface pas',
        `${stillRead} marque(s)`
      )

      // Une clé inventée ne marque rien : on ne marque que ce que l'on voit.
      const forgedKey = await veilleur.rpc('notification_mark_read', {
        p_keys: ['rental.return.late:00000000-0000-0000-0000-000000000000'],
      })
      check(
        !refused(forgedKey) && Number(forgedKey.data) === 0,
        'Une clé étrangère à sa propre veille ne marque rien',
        `${forgedKey.data}`
      )

      // Le lecteur aveugle ne peut pas marquer une notification qu'il ne voit pas.
      const blindMark = await aveugle.rpc('notification_mark_read', {
        p_keys: [`supplier_invoice.overdue:${supplierInvoiceId}`],
      })
      check(
        !refused(blindMark) && Number(blindMark.data) === 0,
        'Ni une notification que ses droits lui cachent'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('12 — TOUT MARQUER COMME LU (§20)\n')

    {
      await veilleurPage.goto(`${base}/notifications`, { waitUntil: 'load' })

      const before = await veilleurPage.locator('[data-notification]').count()

      /*
       * Le bouton est celui de l'EN-TÊTE, désigné sans ambiguïté.
       *
       * Un sélecteur plus large attraperait « Se déconnecter » — la barre
       * latérale est rendue avant le contenu, et son formulaire viendrait en
       * premier. La recette se terminerait alors sur un écran de connexion.
       */
      const markAll = veilleurPage.locator('header form button[type="submit"]').first()
      check((await markAll.count()) === 1, 'L’action « Tout marquer comme lu » est proposée (§20)')
      await markAll.click()

      await veilleurPage.waitForFunction(
        () => {
          const node = document.querySelector('[data-compteur="Non lues"]')
          return node !== null && node.getAttribute('data-compteur-valeur') === '0'
        },
        undefined,
        { timeout: 30000 }
      )

      const after = await veilleurPage.locator('[data-notification]').count()
      const unread = await counter(veilleurPage, 'Non lues')

      check(unread === 0, 'Plus aucune notification non lue', `${unread}`)
      check(
        after === before,
        'AUCUNE notification n’a disparu : seul l’état de lecture a changé (§20)',
        `${before} → ${after}`
      )
      check(
        (await veilleurPage.locator('[data-badge="/notifications"]').count()) === 0,
        'La pastille de navigation s’effface'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('13 — LE TABLEAU DE BORD COMPTE LES NON LUES (§33)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.veilleur2)
      await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        /notification\(s\) non lue\(s\)/.test(text),
        'Le tableau de bord annonce le nombre de non lues (§33)'
      )
      check(
        /Centre de notifications/.test(text),
        'Et renvoie au Centre, qui reste l’endroit principal'
      )
      check(
        !/n’a pas pu être chargé/.test(text),
        'Aucun indicateur du tableau de bord n’est en erreur de chargement'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('14 — AUCUN EFFET DE BORD, DONNÉES DEMO INTACTES\n')

    {
      const [{ data: rental }, { data: veh }, { data: inv }, { data: sup }] = await Promise.all([
        admin.from('rentals').select('status').eq('id', rentalId).maybeSingle(),
        admin.from('vehicles').select('status').eq('id', vehicle.id).maybeSingle(),
        admin.from('customer_invoices').select('status').eq('id', invoiceId).maybeSingle(),
        admin
          .from('supplier_invoices')
          .select('status')
          .eq('id', supplierInvoiceId)
          .maybeSingle(),
      ])

      check(
        rental?.status === 'IN_PROGRESS',
        'Consulter ses notifications ne clôture aucune location',
        rental?.status
      )
      check(veh?.status === 'RENTED', 'Le statut du véhicule est inchangé', veh?.status)
      check(inv?.status === 'ISSUED', 'La facture client reste « Émise »', inv?.status)
      check(
        sup?.status === 'VALIDATED',
        'La facture fournisseur reste « Validée »',
        sup?.status
      )

      const { count: imputed } = await admin
        .from('imputations')
        .select('id', { count: 'exact', head: true })
        .eq('id', imputationId)
        .eq('status', 'IMPUTED')
      check(imputed === 1, 'L’imputation n’a pas changé d’état')

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

    await veilleurContext.close()
  } finally {
    await browser.close()
    for (const client of Object.values(sessions)) await client.auth.signOut()

    /*
     * NETTOYAGE — dans l'ordre des dépendances.
     *
     * Les marques de lecture partent avec leurs comptes (`on delete cascade`),
     * mais elles sont retirées explicitement : une recette interrompue ne doit
     * rien laisser derrière elle.
     */
    for (const account of Object.values(accounts)) {
      await admin.from('notification_reads').delete().eq('user_id', account.id)
    }

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
      await admin.from('vehicle_documents').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicle_occupations').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicle_supplier_history').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }

    if (fixtures.ruleId) await admin.from('pricing_rules').delete().eq('id', fixtures.ruleId)
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

    /* Balayage par marqueur : une recette interrompue ne laisse rien d'invisible. */
    const { count: leftovers } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .like('legal_name', `%${MARK}%`)
    if (leftovers && leftovers > 0) {
      console.log(`\n${RED}Résidus de recette : ${leftovers} client(s) ${MARK}${RESET}`)
    }

    console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE NOTIFICATIONS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE NOTIFICATIONS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
