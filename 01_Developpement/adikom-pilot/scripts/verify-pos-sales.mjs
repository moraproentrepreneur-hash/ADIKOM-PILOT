#!/usr/bin/env node
/**
 * Recette navigateur — Point de vente : ventes et encaissement (LOT 28, Module 12).
 *
 * ⚠ ÉCRITE DANS LE CLOUD, JAMAIS EXÉCUTÉE PAR LUI. Elle exige la base réelle et
 * une application déployée : c'est la reprise LOCALE qui la lance, après
 * `db:push` et `db:verify:pos-sales`.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LA RECETTE SQL N'ÉPROUVE PAS
 *
 *   1. sans session ouverte, la caisse le DIT et mène à l'ouverture ;
 *   2. 🟥 le test de référence PAR L'ÉCRAN : service à 60 000, donné 100 000 —
 *      la caisse annonce 40 000 de monnaie à la frappe, `F2` valide, la fiche
 *      dit encaissé 60 000, et la trésorerie porte UNE écriture de 60 000 ;
 *   3. le reçu A4 se télécharge (`%PDF`) avec SA capacité, et seulement avec elle ;
 *   4. 🟥 C-2 — la facture sur demande s'émet par l'écran, et le solde du compte
 *      NE BOUGE PAS ; le règlement adossé n'a aucune écriture ;
 *   5. B-10 — l'annulation motivée d'une vente non facturée, par l'écran ;
 *   6. les écritures directes (vente, règlement adossé) sont REFUSÉES par PostgREST ;
 *   7. l'export « ventes » exige SA capacité ;
 *   8. le lecteur consulte l'historique, mais n'encaisse pas.
 *
 * DISCIPLINE (Plan 02 §20.4, CLAUDE.md §47 bis) : garde d'entrée ; chaque erreur
 * de mise en place et de démontage vérifiée ; balayage PAR MARQUEUR puis
 * constat ; aucune date en dur ; on attend le LIBELLÉ d'un effet.
 *
 * Utilisation :
 *   node scripts/verify-pos-sales.mjs [url]
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

function must(result, what) {
  if (result.error) throw new Error(`${what} : ${result.error.message}`)
  return result.data
}

const STAMP = Date.now().toString().slice(-6)
const MARK = 'RECETTE VTE'
const LABEL = `${MARK} ${STAMP}`
const USER_PREFIX = 'recette.vte.'

const COUNTER = [
  'pos.sales.view',
  'pos.sales.create',
  'pos.sales.download',
  'pos.sessions.view',
  'pos.sessions.open',
  'pos.sessions.close',
  'pos.registers.view',
  'treasury.accounts.view',
  'catalog.services.view',
  'parties.clients.view',
]

const PROFILES = {
  caissier: COUNTER,
  responsable: [
    ...COUNTER,
    'pos.sales.discount',
    'pos.sales.credit',
    'pos.sales.cancel',
    'pos.sales.export',
    'treasury.entries.view',
    'billing.customer_invoices.view',
    'billing.customer_invoices.create',
    'billing.customer_invoices.issue',
    'billing.customer_payments.view',
    'billing.customer_payments.create',
  ],
  lecteur: ['pos.sales.view'],
}

async function createProfile(admin, key, codes) {
  const username = `${USER_PREFIX}${key.toLowerCase()}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-vte-${STAMP}`

  const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `compte ${key}`)
  const id = created.user.id
  must(
    await admin.from('app_users').insert({
      id,
      first_name: 'Recette',
      last_name: `VTE ${key}`,
      username,
      email,
      status: 'ACTIVE',
    }),
    `profil ${key}`
  )

  const unique = [...new Set(codes)]
  const catalog = must(await admin.from('permissions').select('id, code').in('code', unique), 'catalogue')
  if (catalog.length !== unique.length) {
    const found = new Set(catalog.map((p) => p.code))
    throw new Error(`catalogue incomplet (${key}) : ${unique.filter((c) => !found.has(c)).join(', ')}`)
  }
  must(
    await admin.from('user_permissions').insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' }))),
    `permissions ${key}`
  )
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

const text = async (page) => (await page.locator('main').innerText()).replace(/\s+/g, ' ')

/** Choix dans un champ déroulant, rejoué jusqu'à ce qu'il prenne (hydratation). */
async function choose(page, selector, value) {
  for (let essai = 1; essai <= 6; essai += 1) {
    await page.selectOption(selector, value)
    if ((await page.inputValue(selector)) === value) return
    await page.waitForTimeout(500)
  }
  throw new Error(`Le choix ${selector} = ${value} ne prend pas.`)
}

async function openByScreen(page, base, registerId, float) {
  await page.goto(`${base}/pdv/sessions`, { waitUntil: 'load' })
  await choose(page, '#registerId', registerId)
  await page.fill('#openingFloat', String(float))
  await page.getByRole('button', { name: 'Ouvrir la session' }).click()
  await page.waitForURL(/\/pdv\/sessions\/[0-9a-f-]{36}\?ouverte=1/, { timeout: 30000 })
  return page.url().match(/sessions\/([0-9a-f-]{36})/)[1]
}

/** Une vente par l'écran : recherche, Entrée, montant donné, client éventuel, F2. */
async function sellByScreen(page, base, { search, tendered, clientId }) {
  await page.goto(`${base}/pdv/caisse`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#recherche') !== null)
  await page.keyboard.press('Control+K')
  await page.fill('#recherche', search)
  await page.press('#recherche', 'Enter')
  await page.getByText('Total à payer').first().waitFor({ timeout: 15000 })
  await page.fill('#donne-0', String(tendered))
  if (clientId) await choose(page, '#client', clientId)
  return page
}

/* -------------------------------------------------------------------------- */

async function sweep(admin) {
  const registers = must(await admin.from('pos_registers').select('id').like('label', `${MARK}%`), 'balayage caisses') ?? []
  const registerIds = registers.map((r) => r.id)

  if (registerIds.length > 0) {
    const sessions = must(await admin.from('pos_sessions').select('id').in('register_id', registerIds), 'balayage sessions') ?? []
    const sessionIds = sessions.map((s) => s.id)
    if (sessionIds.length > 0) {
      const sales = must(await admin.from('pos_sales').select('id').in('session_id', sessionIds), 'balayage ventes') ?? []
      const saleIds = sales.map((s) => s.id)
      if (saleIds.length > 0) {
        const payments = must(await admin.from('pos_payments').select('id').in('pos_sale_id', saleIds), 'balayage paiements') ?? []
        const paymentIds = payments.map((p) => p.id)
        const invoices = must(await admin.from('customer_invoices').select('id').in('pos_sale_id', saleIds), 'balayage factures') ?? []
        const invoiceIds = invoices.map((i) => i.id)
        if (paymentIds.length > 0) {
          must(await admin.from('treasury_entries').delete().in('pos_payment_id', paymentIds), 'suppression écritures POS')
        }
        if (invoiceIds.length > 0) {
          const regl = must(await admin.from('customer_payments').select('id').in('customer_invoice_id', invoiceIds), 'balayage règlements') ?? []
          if (regl.length > 0) {
            must(await admin.from('treasury_entries').delete().in('customer_payment_id', regl.map((r) => r.id)), 'suppression écritures règlements')
            must(await admin.from('customer_payments').delete().in('id', regl.map((r) => r.id)), 'suppression règlements')
          }
          must(await admin.from('customer_invoice_lines').delete().in('customer_invoice_id', invoiceIds), 'suppression lignes de facture')
          must(await admin.from('customer_invoices').delete().in('id', invoiceIds), 'suppression factures')
        }
        const lines = must(await admin.from('pos_sale_lines').select('id').in('pos_sale_id', saleIds), 'balayage lignes') ?? []
        if (lines.length > 0) {
          must(await admin.from('commercial_line_costs').delete().in('pos_sale_line_id', lines.map((l) => l.id)), 'suppression coûts')
        }
        must(await admin.from('pos_payments').delete().in('pos_sale_id', saleIds), 'suppression paiements')
        must(await admin.from('pos_sale_lines').delete().in('pos_sale_id', saleIds), 'suppression lignes')
        must(await admin.from('pos_sales').delete().in('id', saleIds), 'suppression ventes')
      }
      must(await admin.from('pos_session_amounts').delete().in('session_id', sessionIds), 'suppression montants')
      must(await admin.from('pos_sessions').delete().in('id', sessionIds), 'suppression sessions')
    }
    must(await admin.from('pos_registers').delete().in('id', registerIds), 'suppression caisses')
  }

  const services = must(await admin.from('services').select('id').like('label', `${MARK}%`), 'balayage services') ?? []
  if (services.length > 0) {
    const ids = services.map((s) => s.id)
    const variants = must(await admin.from('service_variants').select('id').in('service_id', ids), 'balayage variantes') ?? []
    if (variants.length > 0) {
      must(await admin.from('service_variant_prices').delete().in('variant_id', variants.map((v) => v.id)), 'suppression prix')
      must(await admin.from('service_variants').delete().in('id', variants.map((v) => v.id)), 'suppression variantes')
    }
    must(await admin.from('services').delete().in('id', ids), 'suppression services')
  }
  must(await admin.from('service_categories').delete().like('label', `${MARK}%`), 'suppression catégories')
  must(await admin.from('clients').delete().like('legal_name', `${MARK}%`), 'suppression clients')
  must(await admin.from('financial_accounts').delete().like('label', `${MARK}%`), 'suppression comptes')

  const users = must(await admin.from('app_users').select('id').like('username', `${USER_PREFIX}%`), 'balayage comptes') ?? []
  for (const user of users) {
    must(await admin.from('user_permissions').delete().eq('user_id', user.id), 'suppression permissions')
    must(await admin.from('app_users').delete().eq('id', user.id), 'suppression profil')
    await admin.auth.admin.deleteUser(user.id)
  }
}

async function residue(admin) {
  const counts = await Promise.all([
    admin.from('pos_registers').select('id', { count: 'exact', head: true }).like('label', `${MARK}%`),
    admin.from('app_users').select('id', { count: 'exact', head: true }).like('username', `${USER_PREFIX}%`),
    admin.from('financial_accounts').select('id', { count: 'exact', head: true }).like('label', `${MARK}%`),
    admin.from('services').select('id', { count: 'exact', head: true }).like('label', `${MARK}%`),
    admin.from('clients').select('id', { count: 'exact', head: true }).like('legal_name', `${MARK}%`),
  ])
  return counts.reduce((total, result) => total + (result.count ?? 0), 0)
}

/** Σ des écritures validées d'un compte — on mesure une VARIATION, jamais un total. */
async function movements(admin, accountId) {
  const rows = must(
    await admin.from('treasury_entries').select('direction, amount').eq('account_id', accountId).eq('status', 'VALIDATED'),
    'écritures du compte'
  ) ?? []
  return rows.reduce((total, row) => total + (row.direction === 'IN' ? row.amount : -row.amount), 0)
}

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'
  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nCible : ${base}\n`)

  const before = await residue(admin)
  if (before > 0) {
    throw new Error(`${before} résidu(s) « ${MARK} » d'un passage précédent : lancez le balayage avant de rejouer.`)
  }

  const accounts = {}
  const browser = await chromium.launch()

  try {
    /* --- Mise en place --------------------------------------------------- */
    const cash = must(
      await admin.rpc('create_financial_account', {
        p_kind: 'CASH', p_label: `${LABEL} — Caisse`, p_institution: 'Recette',
        p_account_reference: null, p_opening_balance: 0, p_opened_on: null, p_description: null,
      }),
      'compte de caisse'
    )
    must(
      await admin.rpc('create_financial_account', {
        p_kind: 'BANK', p_label: `${LABEL} — Mvola`, p_institution: 'Telma Mvola',
        p_account_reference: null, p_opening_balance: 0, p_opened_on: null, p_description: null,
      }),
      'compte Mvola'
    )
    const register = must(
      await admin.rpc('create_pos_register', { p_label: `${LABEL} — Comptoir`, p_account_id: cash, p_location: null }),
      'caisse'
    )

    const category = must(
      await admin.from('service_categories').insert({ code: `RVTE${STAMP}`, label: `${LABEL} — Catégorie` }).select('id').single(),
      'catégorie'
    )
    const numbering = must(await admin.rpc('next_number', { p_entity_key: 'service' }), 'numéro de service')
    const service = must(
      await admin
        .from('services')
        .insert({ service_no: numbering, label: `${LABEL} Transfert`, category_id: category.id, purpose: 'SALE', unit_label: 'trajet' })
        .select('id')
        .single(),
      'service'
    )
    const variant = must(
      await admin.from('service_variants').select('id').eq('service_id', service.id).eq('is_default', true).single(),
      'variante'
    )
    must(await admin.rpc('set_service_price', { p_variant_id: variant.id, p_amount: 60000, p_valid_from: dayOffset(-30), p_reason: 'Recette' }), 'prix')

    const clientNo = must(await admin.rpc('next_number', { p_entity_key: 'client' }), 'numéro de client')
    const client = must(
      await admin
        .from('clients')
        .insert({ client_no: clientNo, type: 'COMPANY', legal_name: `${LABEL} SARL`, phone: '+269 300 00 02', status: 'ACTIVE' })
        .select('id')
        .single(),
      'client'
    )

    for (const [key, codes] of Object.entries(PROFILES)) accounts[key] = await createProfile(admin, key, codes)

    /* ------------------------------------------------------------------ */
    console.log('1 — SANS SESSION, LA CAISSE LE DIT\n')

    const c = await signIn(browser, base, accounts.caissier)
    await c.page.goto(`${base}/pdv/caisse`, { waitUntil: 'load' })
    check(/Aucune session de caisse ouverte/.test(await text(c.page)), 'La caisse dit « aucune session ouverte »')
    check((await c.page.getByRole('link', { name: 'Ouvrir une session' }).count()) === 1, 'Elle mène à l’ouverture')

    const sessionId = await openByScreen(c.page, base, register, 10000)

    /* ------------------------------------------------------------------ */
    console.log('\n2 — 🟥 LE TEST DE RÉFÉRENCE, PAR L’ÉCRAN\n')

    const cashBefore = await movements(admin, cash)
    await sellByScreen(c.page, base, { search: 'Transfert', tendered: 100000, clientId: client.id })
    const announced = await text(c.page)
    check(/Monnaie à rendre 40 000/.test(announced), 'La caisse annonce 40 000 de monnaie à la frappe')
    check(/Raccourcis|Ctrl\+K/.test(announced) && /F2/.test(announced), 'Les raccourcis sont annoncés à l’écran')

    await c.page.keyboard.press('F2')
    await c.page.waitForURL(/\/pdv\/ventes\/[0-9a-f-]{36}\?encaissee=1/, { timeout: 30000 })
    const saleId = c.page.url().match(/ventes\/([0-9a-f-]{36})/)[1]
    const fiche = await text(c.page)
    check(/Monnaie à rendre : 40 000 KMF/.test(fiche), 'La fiche annonce la monnaie à rendre')
    check(/Montant encaissé 60 000/.test(fiche), 'La fiche dit encaissé 60 000 (calculé par la base)')

    const cashAfter = await movements(admin, cash)
    check(cashAfter - cashBefore === 60000, '🟥 La trésorerie enregistre 60 000, jamais 100 000', `${cashAfter - cashBefore}`)

    const receipt = await c.page.request.get(`${base}/api/documents/ventes/${saleId}?mode=download`)
    const body = await receipt.body()
    check(receipt.status() === 200 && body.subarray(0, 4).toString() === '%PDF', 'Le reçu A4 se télécharge (%PDF)')

    /* ------------------------------------------------------------------ */
    console.log('\n3 — LE LECTEUR CONSULTE, N’ENCAISSE PAS\n')

    const l = await signIn(browser, base, accounts.lecteur)
    await l.page.goto(`${base}/pdv/ventes/${saleId}`, { waitUntil: 'load' })
    check(/Vente VTE-/.test(await text(l.page)), 'Le lecteur voit la vente')
    const noReceipt = await l.page.request.get(`${base}/api/documents/ventes/${saleId}?mode=download`)
    check(noReceipt.status() === 403, 'Sans pos.sales.download, le reçu est refusé', `${noReceipt.status()}`)
    const noExport = await l.page.request.get(`${base}/api/exports/ventes`)
    check(noExport.status() === 403, 'Sans pos.sales.export, l’export est refusé', `${noExport.status()}`)

    /* ------------------------------------------------------------------ */
    console.log('\n4 — 🟥 C-2 : FACTURE SUR DEMANDE, SOLDE INCHANGÉ\n')

    const r = await signIn(browser, base, accounts.responsable)
    const beforeInvoice = await movements(admin, cash)
    await r.page.goto(`${base}/pdv/ventes/${saleId}`, { waitUntil: 'load' })
    await r.page.getByRole('button', { name: 'Émettre la facture' }).click()
    await r.page.waitForURL(/\?facturee=1/, { timeout: 30000 })
    check(/aucune nouvelle écriture/.test(await text(r.page)), 'La facture est émise par l’écran')

    const invoice = must(
      await admin.from('customer_invoices').select('id, status').eq('pos_sale_id', saleId).neq('status', 'CANCELLED').single(),
      'facture'
    )
    const backed = must(
      await admin.from('customer_payments').select('id, amount').eq('customer_invoice_id', invoice.id).not('pos_payment_id', 'is', null),
      'règlement adossé'
    )
    check(invoice.status === 'ISSUED' && backed.length === 1 && backed[0].amount === 60000, 'Un règlement adossé de 60 000 solde la facture')
    const backedEntries = must(
      await admin.from('treasury_entries').select('id').in('customer_payment_id', backed.map((b) => b.id)),
      'écritures du règlement adossé'
    )
    check(backedEntries.length === 0, '🟥 Le règlement adossé n’a aucune écriture')
    check((await movements(admin, cash)) === beforeInvoice, '🟥 Le solde du compte n’a pas bougé')

    /* ------------------------------------------------------------------ */
    console.log('\n5 — ÉCRITURES DIRECTES REFUSÉES\n')

    const direct = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    must(await direct.auth.signInWithPassword({ email: accounts.caissier.email, password: accounts.caissier.password }), 'connexion directe')
    const forgedSale = await direct.from('pos_sales').insert({
      sale_no: `VTE-FORGEE-${STAMP}`, session_id: sessionId, cashier_id: accounts.caissier.id, sale_date: dayOffset(0),
    })
    check(Boolean(forgedSale.error), 'Un POST direct sur pos_sales est refusé', forgedSale.error?.code ?? 'accepté !')

    const directR = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    must(await directR.auth.signInWithPassword({ email: accounts.responsable.email, password: accounts.responsable.password }), 'connexion directe responsable')
    const payments = must(await admin.from('pos_payments').select('id').eq('pos_sale_id', saleId), 'paiements')
    const forgedBacked = await directR.from('customer_payments').insert({
      payment_no: `REG-FORGE-${STAMP}`, customer_invoice_id: invoice.id, account_id: cash, amount: 1,
      received_on: dayOffset(0), method: 'CASH', pos_payment_id: payments[0].id,
    })
    check(Boolean(forgedBacked.error), 'Un règlement adossé inséré directement est refusé', forgedBacked.error?.code ?? 'accepté !')

    /* ------------------------------------------------------------------ */
    console.log('\n6 — B-10 : ANNULER UNE VENTE NON FACTURÉE\n')

    await sellByScreen(c.page, base, { search: 'Transfert', tendered: 60000 })
    await c.page.keyboard.press('F2')
    await c.page.waitForURL(/\?encaissee=1/, { timeout: 30000 })
    const secondId = c.page.url().match(/ventes\/([0-9a-f-]{36})/)[1]

    const beforeCancel = await movements(admin, cash)
    await r.page.goto(`${base}/pdv/ventes/${secondId}`, { waitUntil: 'load' })
    await r.page.fill('#reason', 'Erreur de saisie — recette')
    await r.page.getByRole('button', { name: 'Annuler la vente' }).click()
    await r.page.waitForURL(/\?annulee=1/, { timeout: 30000 })
    check(/Annulée/.test(await text(r.page)), 'La vente est annulée par l’écran, motif à l’appui')
    check(beforeCancel - (await movements(admin, cash)) === 60000, 'Son écriture est annulée : le solde redescend de 60 000')

    await r.page.goto(`${base}/pdv/ventes/${saleId}`, { waitUntil: 'load' })
    check(/ne s’annule pas tant que les avoirs/.test(await text(r.page)), 'Une vente facturée ne propose pas l’annulation (B-10)')

    const exported = await r.page.request.get(`${base}/api/exports/ventes?jour=${dayOffset(0)}`)
    check(exported.status() === 200 && /spreadsheetml/.test(exported.headers()['content-type'] ?? ''), 'Le responsable exporte les ventes du jour')

    for (const session of [c, l, r]) await session.context.close()
  } finally {
    await browser.close()
    await sweep(admin)
    const after = await residue(admin)
    check(after === 0, `Démontage : aucun résidu « ${MARK} »`, `${after}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE VENTES AU COMPTOIR : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE VENTES AU COMPTOIR : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
