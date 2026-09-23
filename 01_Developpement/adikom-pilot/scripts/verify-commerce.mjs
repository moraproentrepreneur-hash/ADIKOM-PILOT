#!/usr/bin/env node
/**
 * Recette Commerce client — devis et commandes — LOT 25, DEC-049.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE NI LES TESTS UNITAIRES NI LA RECETTE SQL NE PEUVENT
 *
 * `supabase/tests/commerce.sql` éprouve ce que la BASE tient seule, avec le rôle
 * de la chaîne de connexion — qui contourne RLS. `constants.test.ts` éprouve
 * l'arithmétique et les cycles, hors de toute base.
 *
 * Celle-ci éprouve ce qui n'existe qu'EN PRODUCTION, avec de VRAIES SESSIONS —
 * jeton Supabase, cookie applicatif, appels PostgREST directs, documents PDF :
 *
 *   1. LA CHAÎNE ENTIÈRE, par l'écran : devis → commande → facture → règlement
 *      partiel → trésorerie.
 *   2. 🟥 LE PRIX FIGÉ : le catalogue change APRÈS le devis, et rien ne bouge —
 *      ni sur le devis, ni sur la commande, ni sur la facture.
 *   3. 🟥 AUCUN SYSTÈME PARALLÈLE : la facture née d'une commande est une
 *      `customer_invoices` ordinaire, et elle apparaît dans le module Factures
 *      clients.
 *   4. 🟥 CONFIDENTIALITÉ, PROUVÉE AUTREMENT QU'UN BALAYAGE D'OCTETS. Le LOT 24
 *      a établi qu'un balayage du PDF NE PROUVE RIEN (flux compressés, polices
 *      sous-ensemblées). La preuve est ici : structurelle (aucune colonne de
 *      coût), par RLS (appel direct refusé), et DIFFÉRENTIELLE — le document
 *      produit par un profil qui LIT RÉELLEMENT le coût est identique, octet
 *      pour octet, à celui d'un profil qui ne le lit pas.
 *   5. LES HUIT CAPACITÉS, éprouvées séparément (A-14, DEC-024), positivement
 *      ET négativement, par l'écran ET par appel direct.
 *   6. LES DOUBLES ACTIONS : deux conversions, deux facturations, refusées.
 *   7. Le responsive à 360, 768 et 1440 px. Le nettoyage, et son effet vérifié.
 *
 * 🟥 ANTI-VACUITÉ. Tout contrôle qui attend « aucune donnée » DISTINGUE une
 * requête en erreur d'un refus de lecture : un `data` vide ne vaut preuve que
 * s'il vient SANS erreur (leçon du LOT 24, commit 41c8f41).
 *
 * Utilisation :
 *   node scripts/verify-commerce.mjs [url]
 *
 * NE JAMAIS piper la sortie vers `head` : SIGPIPE tuerait le processus avant son
 * nettoyage, et laisserait des comptes et des devis de recette en base.
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required, dayOffset } from './lib/env.mjs'
import { checkCatalogue } from './lib/capabilities.mjs'
import { demoFootprint } from './lib/demo.mjs'

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
const MARK = `RECETTE COM ${STAMP}`
const NOTE = 'RECETTE COM'

/* Les montants du scénario, écrits une fois et confrontés jusqu'au bout. */
const PRIX_STANDARD = 50_000
const PRIX_PREMIUM = 80_000
const PRIX_LIBRE = 7_500

const QTE_STANDARD = 3
const QTE_PREMIUM = 1
const QTE_LIBRE = 2

const TOTAL_ATTENDU =
  QTE_STANDARD * PRIX_STANDARD + QTE_PREMIUM * PRIX_PREMIUM + QTE_LIBRE * PRIX_LIBRE // 245 000

/** Le catalogue est relevé APRÈS le devis : rien d'historique ne doit bouger. */
const PRIX_APRES = 90_000

const ACOMPTE = 100_000
const SOLDE_ATTENDU = TOTAL_ATTENDU - ACOMPTE

const BASE = ['dashboard.view']

const PROFILES = {
  /*
   * LE COMMERCIAL — il mène le devis et la commande de bout en bout.
   *
   * Il n'a AUCUNE capacité de facturation : c'est ce qui prouve que facturer
   * une commande exige `billing.customer_invoices.create`, et non la seule
   * capacité de lire la commande (Plan 01 §15.5).
   */
  commercial: [
    ...BASE,
    'commerce.sales_quotes.view',
    'commerce.sales_quotes.create',
    'commerce.sales_quotes.update',
    'commerce.sales_quotes.validate',
    'commerce.sales_quotes.cancel',
    'commerce.sales_quotes.download',
    'commerce.sales_quotes.print',
    'commerce.sales_orders.view',
    'commerce.sales_orders.create',
    'commerce.sales_orders.update',
    'commerce.sales_orders.validate',
    'commerce.sales_orders.cancel',
    'commerce.sales_orders.download',
    'commerce.sales_orders.print',
    'catalog.services.view',
    'parties.clients.view',
  ],

  /*
   * 🟥 LE LECTEUR — DEC-024, le contrôle le plus simple et le plus important.
   *
   * Il CONSULTE les devis et les commandes, et rien de plus. Ni `download`, ni
   * `print`, ni `validate`, ni `cancel` : « voir » n'a jamais inclus
   * « produire un document » ni « faire avancer un acte ». La route doit
   * refuser les trois modes, y compris appelée directement.
   */
  lecteur: [
    ...BASE,
    'commerce.sales_quotes.view',
    'commerce.sales_orders.view',
    'catalog.services.view',
    'parties.clients.view',
  ],

  /*
   * LE FACTUREUR — il tient la facturation, et ne fait aucun commerce.
   *
   * `billing.customer_payments.view` n'est pas un confort : depuis le LOT 8,
   * `fn_customer_invoice_no_cancel_when_paid` refuse d'annuler une facture à
   * qui ne peut pas lire les règlements qui la soldent.
   */
  factureur: [
    ...BASE,
    'commerce.sales_orders.view',
    'commerce.sales_quotes.view',
    'billing.customer_invoices.view',
    'billing.customer_invoices.create',
    'billing.customer_invoices.update',
    'billing.customer_invoices.issue',
    'billing.customer_invoices.cancel',
    'billing.customer_invoices.download',
    'billing.customer_payments.view',
    'billing.customer_payments.create',
    'treasury.accounts.view',
    'treasury.entries.view',
    'catalog.services.view',
    'parties.clients.view',
  ],

  /*
   * 🟥 CELUI QUI A LE DROIT DE LIRE LE COÛT — et qui ne le verra pas non plus.
   *
   * Il détient `catalog.services.cost.view` EN PLUS de tout ce que porte le
   * commercial. C'est le SEUL profil capable de prouver la barrière du
   * Plan 02 §6.4 : les documents commerciaux ne composent pas le coût, MÊME
   * pour un demandeur qui a le droit de le lire.
   *
   * Sans lui, la confidentialité n'aurait été éprouvée que sur des profils
   * incapables de lire le coût de toute façon — ce qui ne prouve rien du
   * document, seulement de RLS.
   */
  avecCout: [
    ...BASE,
    'commerce.sales_quotes.view',
    'commerce.sales_quotes.download',
    'commerce.sales_quotes.print',
    'commerce.sales_orders.view',
    'commerce.sales_orders.download',
    'commerce.sales_orders.print',
    'catalog.services.view',
    'catalog.services.cost.view',
    'parties.clients.view',
  ],

  /*
   * L'ÉTANCHÉITÉ ENTRE LES DEUX MENUS — A-14.
   *
   * Il voit les DEVIS, pas les COMMANDES. Consulter l'un n'ouvre pas l'autre,
   * et la fiche du devis converti doit le DIRE plutôt que de taire la commande
   * (DEC-017).
   */
  devisSeul: [
    ...BASE,
    'commerce.sales_quotes.view',
    'catalog.services.view',
    'parties.clients.view',
  ],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.com.${key}.${STAMP}`
  const email = `${username}@adikom-recette.test`
  const password = `Recette!${STAMP}aA1`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${key} : ${error?.message}`)

  // Inscrit AVANT le profil : un échec ultérieur ne rend plus ce compte
  // invisible au nettoyage.
  const id = created.user.id
  accounts[key] = { id, email, password, username }

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Com ${key}`,
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

  return accounts[key]
}

/** Ce que le navigateur signale, et que personne ne regarde jamais. */
const journalNavigateur = []

function ecouter(page, origine) {
  page.on('pageerror', (error) => {
    journalNavigateur.push(`${origine} · exception : ${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      journalNavigateur.push(`${origine} · console : ${message.text()}`)
    }
  })
}

async function signIn(browser, base, account, viewport = null) {
  const context = await browser.newContext(viewport ? { viewport } : {})
  const page = await context.newPage()

  ecouter(page, account.username)

  await page.goto(`${base}/connexion`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#username') !== null)
  await page.fill('#username', account.username)
  await page.fill('#password', account.password)
  // Le libellé, plutôt que `button[type=submit]` : la page en porte plusieurs.
  await page.getByRole('button', { name: /Se connecter/i }).click()
  await page.waitForURL('**/tableau-de-bord', { timeout: 90000 })

  return { context, page }
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/**
 * Récupère un document par la route applicative, avec le cookie de la session.
 *
 * Rend le STATUT et les OCTETS : le statut dit si la capacité a été honorée,
 * les octets servent à la comparaison DIFFÉRENTIELLE entre deux profils — la
 * seule forme de preuve documentaire qui tienne après le LOT 24.
 */
async function fetchDocument(page, base, type, id, mode) {
  const url = `${base}/api/documents/${type}/${id}${mode ? `?mode=${mode}` : ''}`

  return page.evaluate(async (target) => {
    const response = await fetch(target, { credentials: 'include' })
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let signature = ''
    for (let i = 0; i < Math.min(5, bytes.length); i += 1) {
      signature += String.fromCharCode(bytes[i])
    }
    // Une empreinte simple suffit : deux documents identiques la partagent,
    // deux documents différents ne la partagent pas.
    let hash = 0
    for (let i = 0; i < bytes.length; i += 1) {
      hash = (hash * 31 + bytes[i]) >>> 0
    }
    return { status: response.status, length: bytes.length, signature, hash }
  }, url)
}

/* -------------------------------------------------------------------------- */
/*  🟥 LA PHOTOGRAPHIE — ce qu'un document ne doit jamais changer              */
/* -------------------------------------------------------------------------- */

/**
 * Tout ce que produire un document pourrait modifier s'il était un acte.
 *
 * Prise AVANT, reprise APRÈS, comparée terme à terme. Produire le PDF d'un
 * devis ou d'une commande ne doit créer aucune ligne, aucune facture, aucun
 * règlement, aucun mouvement de trésorerie, et ne doit modifier aucun statut.
 *
 * Portée par la clé de service : elle doit voir TOUT ce qui existe, y compris
 * ce qu'une session ne verrait pas.
 */
async function photographie(admin, decor) {
  const { data: devis, error: devisError } = await admin
    .from('sales_quotes')
    .select('id, quote_no, status, quote_date, valid_until, client_id')
    .eq('client_id', decor.client)
    .order('quote_no')

  if (devisError) throw new Error(`photographie : devis illisibles — ${devisError.message}`)

  const { data: lignesDevis, error: ldError } = await admin
    .from('sales_quote_lines')
    .select('id, sales_quote_id, label, quantity, unit_price, is_archived, service_id')
    .in('sales_quote_id', sur((devis ?? []).map((r) => r.id)))
    .order('id')

  if (ldError) throw new Error(`photographie : lignes de devis illisibles — ${ldError.message}`)

  const { data: commandes, error: cmdError } = await admin
    .from('sales_orders')
    .select('id, order_no, status, order_date, sales_quote_id, client_id')
    .eq('client_id', decor.client)
    .order('order_no')

  if (cmdError) throw new Error(`photographie : commandes illisibles — ${cmdError.message}`)

  const { data: lignesCmd, error: lcError } = await admin
    .from('sales_order_lines')
    .select('id, sales_order_id, label, quantity, unit_price, is_archived, source_quote_line_id')
    .in('sales_order_id', sur((commandes ?? []).map((r) => r.id)))
    .order('id')

  if (lcError) throw new Error(`photographie : lignes de commande illisibles — ${lcError.message}`)

  const { data: factures, error: facError } = await admin
    .from('customer_invoices')
    .select('id, invoice_no, status, sales_order_id, invoice_date, due_date')
    .eq('client_id', decor.client)
    .order('invoice_no')

  if (facError) throw new Error(`photographie : factures illisibles — ${facError.message}`)

  const { data: lignesFac, error: lfError } = await admin
    .from('customer_invoice_lines')
    .select('id, customer_invoice_id, label, quantity, unit_price, service_id, source_order_line_id')
    .in('customer_invoice_id', sur((factures ?? []).map((r) => r.id)))
    .order('id')

  if (lfError) throw new Error(`photographie : lignes de facture illisibles — ${lfError.message}`)

  const { data: reglements, error: regError } = await admin
    .from('customer_payments')
    .select('id, payment_no, amount, status, customer_invoice_id')
    .in('customer_invoice_id', sur((factures ?? []).map((r) => r.id)))
    .order('payment_no')

  if (regError) throw new Error(`photographie : règlements illisibles — ${regError.message}`)

  const { data: ecritures, error: ecrError } = await admin
    .from('treasury_entries')
    .select('id, amount, direction, customer_payment_id')
    .in('customer_payment_id', sur((reglements ?? []).map((r) => r.id)))
    .order('id')

  if (ecrError) throw new Error(`photographie : écritures illisibles — ${ecrError.message}`)

  return {
    nbDevis: (devis ?? []).length,
    nbLignesDevis: (lignesDevis ?? []).length,
    nbCommandes: (commandes ?? []).length,
    nbLignesCmd: (lignesCmd ?? []).length,
    nbFactures: (factures ?? []).length,
    nbLignesFac: (lignesFac ?? []).length,
    nbReglements: (reglements ?? []).length,
    nbEcritures: (ecritures ?? []).length,

    sommeDevis: (lignesDevis ?? []).reduce(
      (t, l) => t + (l.is_archived ? 0 : l.quantity * l.unit_price),
      0
    ),
    sommeCmd: (lignesCmd ?? []).reduce(
      (t, l) => t + (l.is_archived ? 0 : l.quantity * l.unit_price),
      0
    ),
    sommeFac: (lignesFac ?? []).reduce((t, l) => t + l.quantity * l.unit_price, 0),
    sommeTresorerie: (ecritures ?? []).reduce((t, e) => t + e.amount, 0),

    etat: JSON.stringify({
      devis,
      lignesDevis,
      commandes,
      lignesCmd,
      factures,
      lignesFac,
      reglements,
      ecritures,
    }),
  }
}

function ecarts(avant, apres) {
  const differences = []
  for (const cle of Object.keys(avant)) {
    if (cle === 'etat') continue
    if (avant[cle] !== apres[cle]) differences.push(`${cle} : ${avant[cle]} → ${apres[cle]}`)
  }
  if (differences.length === 0 && avant.etat !== apres.etat) {
    differences.push('un état a changé sans qu’aucun décompte ni aucune somme ne bouge')
  }
  return differences
}

const NEANT = ['00000000-0000-0000-0000-000000000000']
const sur = (ids) => (ids.length > 0 ? ids : NEANT)

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

  /*
   * L'EMPREINTE SE PREND AVANT TOUTE ÉCRITURE, et on refuse de démarrer sur un
   * dégât laissé par un passage précédent : un `finally` ne protège que son
   * propre passage.
   */
  const before = await demoFootprint(admin)

  const { count: strays, error: straysError } = await admin
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .like('legal_name', 'RECETTE COM%')

  if (straysError) {
    throw new Error(`Relevé des résidus impossible : ${straysError.message}`)
  }

  if (strays > 0) {
    console.log(`${DIM}${strays} client(s) de recette subsistent : balayage préalable.${RESET}`)
    await purgeStrays(admin)
  }

  const accounts = {}
  const browser = await chromium.launch()
  const decor = {}

  try {
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    for (const [key, codes] of Object.entries(PROFILES)) {
      await createProfile(admin, accounts, key, codes)
    }
    check(Object.keys(accounts).length === 5, 'Cinq comptes de recette créés')

    await checkCatalogue(admin, check)

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — LE DÉCOR : UN CLIENT, UN SERVICE, DEUX VARIANTES, DEUX PRIX\n')

    {
      const { data: clientNo } = await admin.rpc('next_number', { p_entity_key: 'client' })
      const { data: client, error } = await admin
        .from('clients')
        .insert({
          client_no: clientNo,
          type: 'COMPANY',
          legal_name: `${MARK} — Client`,
          phone: '+269 970',
          address: 'Route des puffins',
          city: 'Moroni',
          country: 'Comores',
          status: 'ACTIVE',
        })
        .select('id')
        .single()
      if (error) throw new Error(`client : ${error.message}`)
      decor.client = client.id

      const { data: categorie, error: catError } = await admin
        .from('service_categories')
        .insert({ code: `RCOM${STAMP}`, label: `${MARK} — Catégorie` })
        .select('id')
        .single()
      if (catError) throw new Error(`catégorie : ${catError.message}`)
      decor.categorie = categorie.id

      const { data: serviceNo } = await admin.rpc('next_number', { p_entity_key: 'service' })
      const { data: service, error: srvError } = await admin
        .from('services')
        .insert({
          service_no: serviceNo,
          label: `${MARK} — Transfert`,
          category_id: categorie.id,
          // BOTH : le service porte un PRIX DE VENTE **et** un COÛT. Sans coût,
          // la preuve de confidentialité n'aurait rien à protéger.
          purpose: 'BOTH',
          unit_label: 'trajet',
          notes: NOTE,
        })
        .select('id')
        .single()
      if (srvError) throw new Error(`service : ${srvError.message}`)
      decor.service = service.id

      const { data: standard } = await admin
        .from('service_variants')
        .select('id')
        .eq('service_id', service.id)
        .eq('is_default', true)
        .maybeSingle()
      decor.standard = standard?.id ?? null

      const { data: premium, error: varError } = await admin
        .from('service_variants')
        .insert({ service_id: service.id, label: 'Premium', is_default: false, is_active: true })
        .select('id')
        .single()
      if (varError) throw new Error(`variante : ${varError.message}`)
      decor.premium = premium.id

      check(
        decor.standard !== null,
        'La variante « Standard » est posée par la base à la création du service'
      )

      for (const [variantId, montant] of [
        [decor.standard, PRIX_STANDARD],
        [decor.premium, PRIX_PREMIUM],
      ]) {
        const { error: prixError } = await admin.rpc('set_service_price', {
          p_variant_id: variantId,
          p_amount: montant,
          p_valid_from: dayOffset(-30),
          p_reason: `${NOTE} — prix de vente`,
        })
        if (prixError) throw new Error(`prix : ${prixError.message}`)
      }

      // 🟥 LE COÛT — celui que rien de commercial ne doit jamais révéler.
      const { error: coutError } = await admin.rpc('set_service_cost', {
        p_variant_id: decor.standard,
        p_amount: 31_000,
        p_valid_from: dayOffset(-30),
        p_reason: `${NOTE} — coût d’acquisition`,
      })
      if (coutError) throw new Error(`coût : ${coutError.message}`)

      const { data: compteNo } = await admin.rpc('next_number', { p_entity_key: 'account' })
      const { data: compte, error: compteError } = await admin
        .from('financial_accounts')
        .insert({
          account_no: compteNo,
          kind: 'BANK',
          label: `${MARK} — Compte`,
          opening_balance: 0,
          opened_on: dayOffset(-60),
          status: 'ACTIVE',
          description: NOTE,
        })
        .select('id')
        .single()
      if (compteError) throw new Error(`compte : ${compteError.message}`)
      decor.compte = compte.id

      check(true, 'Décor posé', `client, service BOTH, 2 variantes, 2 prix, 1 coût, 1 compte`)
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LE DEVIS : DEUX LIGNES DE CATALOGUE, UNE LIGNE LIBRE (A-13)\n')

    const commercial = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await commercial.auth.signInWithPassword({
      email: accounts.commercial.email,
      password: accounts.commercial.password,
    })

    {
      const { data: quoteId, error } = await commercial.rpc('create_sales_quote', {
        p_client_id: decor.client,
        p_quote_date: dayOffset(-5),
        p_valid_until: dayOffset(25),
        p_notes: NOTE,
        p_terms: 'Conditions de recette.',
      })
      check(!error && Boolean(quoteId), 'Le commercial crée un devis', error?.message ?? '')
      decor.devis = quoteId

      const { data: l1, error: e1 } = await commercial.rpc('add_sales_quote_line', {
        p_quote_id: quoteId,
        p_quantity: QTE_STANDARD,
        p_variant_id: decor.standard,
        p_label: null,
        p_unit_price: null,
      })
      check(!e1 && Boolean(l1), 'Ligne de catalogue ajoutée (variante standard)', e1?.message ?? '')

      const { error: e2 } = await commercial.rpc('add_sales_quote_line', {
        p_quote_id: quoteId,
        p_quantity: QTE_PREMIUM,
        p_variant_id: decor.premium,
        p_label: null,
        p_unit_price: null,
      })
      check(!e2, 'Ligne de catalogue ajoutée (variante premium)', e2?.message ?? '')

      // 🟩 A-13 — LA LIGNE LIBRE, sans aucun service.
      const { data: l3, error: e3 } = await commercial.rpc('add_sales_quote_line', {
        p_quote_id: quoteId,
        p_quantity: QTE_LIBRE,
        p_variant_id: null,
        p_label: `${MARK} — Accompagnement hors catalogue`,
        p_unit_price: PRIX_LIBRE,
      })
      check(!e3 && Boolean(l3), '🟩 A-13 : une ligne LIBRE est acceptée', e3?.message ?? '')
      decor.ligneLibre = l3

      const { data: lignes, error: lError } = await commercial
        .from('sales_quote_lines')
        .select('id, service_id, service_variant_id, quantity, unit_price')
        .eq('sales_quote_id', quoteId)

      check(!lError && (lignes ?? []).length === 3, 'Le devis porte trois lignes', lError?.message ?? '')

      const catalogue = (lignes ?? []).filter((l) => l.service_id !== null)
      const libres = (lignes ?? []).filter((l) => l.service_id === null)
      check(
        catalogue.length === 2 && libres.length === 1,
        '🟩 A-13 : lignes de catalogue et ligne libre coexistent',
        `${catalogue.length} catalogue · ${libres.length} libre`
      )

      const standard = catalogue.find((l) => l.service_variant_id === decor.standard)
      check(
        standard?.unit_price === PRIX_STANDARD,
        'Le prix de la ligne vient du CATALOGUE, à la date du devis',
        `${standard?.unit_price} KMF attendu ${PRIX_STANDARD}`
      )

      const { data: total, error: tError } = await commercial.rpc('sales_quote_total', {
        p_quote_id: quoteId,
      })
      check(
        !tError && Number(total) === TOTAL_ATTENDU,
        'Le total du devis est la somme de ses lignes',
        `${total} KMF attendu ${TOTAL_ATTENDU}`
      )

      // 🟥 Un prix choisi sur une ligne de catalogue serait une remise déguisée.
      const { error: remise } = await commercial.rpc('add_sales_quote_line', {
        p_quote_id: quoteId,
        p_quantity: 1,
        p_variant_id: decor.standard,
        p_label: null,
        p_unit_price: 1,
      })
      check(
        Boolean(remise),
        '🟥 Un prix choisi sur une ligne de catalogue est REFUSÉ — aucune remise déguisée',
        remise ? 'refusé' : 'ACCEPTÉ'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — LES CAPACITÉS, SÉPARÉMENT (A-14, DEC-024)\n')

    const lecteur = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await lecteur.auth.signInWithPassword({
      email: accounts.lecteur.email,
      password: accounts.lecteur.password,
    })

    {
      const { data: vu, error: vuError } = await lecteur
        .from('sales_quotes')
        .select('id')
        .eq('id', decor.devis)

      check(
        !vuError && (vu ?? []).length === 1,
        'Le lecteur VOIT le devis',
        vuError ? `requête en erreur : ${vuError.message}` : `${(vu ?? []).length} ligne(s)`
      )

      const { error: emettre } = await lecteur.rpc('set_sales_quote_status', {
        p_quote_id: decor.devis,
        p_status: 'SENT',
        p_reason: null,
      })
      check(Boolean(emettre), '🟥 « Voir » n’ÉMET pas — `validate` est exigée')

      const { error: annuler } = await lecteur.rpc('set_sales_quote_status', {
        p_quote_id: decor.devis,
        p_status: 'CANCELLED',
        p_reason: null,
      })
      check(Boolean(annuler), '🟥 « Voir » n’ANNULE pas — `cancel` est exigée')

      const { error: ajouter } = await lecteur.rpc('add_sales_quote_line', {
        p_quote_id: decor.devis,
        p_quantity: 1,
        p_variant_id: null,
        p_label: 'Ligne du lecteur',
        p_unit_price: 1000,
      })
      check(Boolean(ajouter), '🟥 « Voir » n’AJOUTE pas de ligne')

      // 🟥 L'ÉTANCHÉITÉ ENTRE LES DEUX MENUS.
      const devisSeul = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await devisSeul.auth.signInWithPassword({
        email: accounts.devisSeul.email,
        password: accounts.devisSeul.password,
      })

      const { data: cmdVues, error: cmdError } = await devisSeul.from('sales_orders').select('id')
      check(
        !cmdError && (cmdVues ?? []).length === 0,
        '🟥 Consulter les DEVIS n’ouvre pas les COMMANDES (A-14)',
        cmdError ? `requête en erreur : ${cmdError.message}` : `${(cmdVues ?? []).length} ligne(s)`
      )

      const { data: devisVus, error: dvError } = await devisSeul
        .from('sales_quotes')
        .select('id')
        .eq('id', decor.devis)
      check(
        !dvError && (devisVus ?? []).length === 1,
        'Le même profil lit RÉELLEMENT les devis — sans quoi le contrôle ne prouverait rien',
        dvError ? `requête en erreur : ${dvError.message}` : `${(devisVus ?? []).length} ligne(s)`
      )

      await devisSeul.auth.signOut()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LE CYCLE DU DEVIS, ET LE GEL DE SES LIGNES\n')

    {
      const { error: sent } = await commercial.rpc('set_sales_quote_status', {
        p_quote_id: decor.devis,
        p_status: 'SENT',
        p_reason: 'Remis au client',
      })
      check(!sent, 'Le commercial ÉMET le devis', sent?.message ?? '')

      const { error: fige } = await commercial.rpc('add_sales_quote_line', {
        p_quote_id: decor.devis,
        p_quantity: 1,
        p_variant_id: null,
        p_label: 'Ligne tardive',
        p_unit_price: 1000,
      })
      check(Boolean(fige), '🟥 Les lignes d’un devis ÉMIS sont figées — aucun ajout')

      const { error: retire } = await commercial.rpc('archive_sales_quote_line', {
        p_line_id: decor.ligneLibre,
      })
      check(
        Boolean(retire),
        '🟥 Retirer une ligne d’un devis émis est REFUSÉ — le total ne bouge pas en silence'
      )

      // Appel PostgREST DIRECT : hors de toute fonction, le déclencheur tient.
      const { error: direct } = await commercial
        .from('sales_quote_lines')
        .update({ unit_price: 1 })
        .eq('sales_quote_id', decor.devis)
      check(Boolean(direct), '🟥 Un PATCH direct sur une ligne figée est REFUSÉ')

      const { error: enTete } = await commercial
        .from('sales_quotes')
        .update({ client_id: decor.client, quote_date: dayOffset(-1) })
        .eq('id', decor.devis)
      check(Boolean(enTete), '🟥 Un PATCH direct sur l’en-tête d’un devis émis est REFUSÉ')

      const { data: total } = await commercial.rpc('sales_quote_total', { p_quote_id: decor.devis })
      check(
        Number(total) === TOTAL_ATTENDU,
        'Le total du devis émis n’a pas bougé',
        `${total} KMF`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — 🟥 LE PRIX HISTORIQUE NE SE RÉÉCRIT PAS\n')

    {
      const { error } = await admin.rpc('set_service_price', {
        p_variant_id: decor.standard,
        p_amount: PRIX_APRES,
        p_valid_from: dayOffset(0),
        p_reason: `${NOTE} — hausse du catalogue`,
      })
      check(!error, 'Le catalogue passe à 90 000 KMF, à effet immédiat', error?.message ?? '')

      const { data: resolu, error: rError } = await admin
        .rpc('resolve_service_price', { p_variant_id: decor.standard, p_on: dayOffset(0) })
        .maybeSingle()
      check(
        !rError && Number(resolu?.amount) === PRIX_APRES,
        'Le résolveur rend bien le prix du jour',
        rError ? `requête en erreur : ${rError.message}` : `${resolu?.amount} KMF`
      )

      const { data: ligne, error: lError } = await commercial
        .from('sales_quote_lines')
        .select('unit_price')
        .eq('sales_quote_id', decor.devis)
        .eq('service_variant_id', decor.standard)
        .maybeSingle()

      check(
        !lError && ligne?.unit_price === PRIX_STANDARD,
        '🟥 LA LIGNE DU DEVIS PORTE TOUJOURS 50 000 KMF',
        lError ? `requête en erreur : ${lError.message}` : `${ligne?.unit_price} KMF`
      )

      const { data: total } = await commercial.rpc('sales_quote_total', { p_quote_id: decor.devis })
      check(
        Number(total) === TOTAL_ATTENDU,
        '🟥 Le total du devis ne suit pas le catalogue',
        `${total} KMF attendu ${TOTAL_ATTENDU}`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — LA CONVERSION : UN ACTE NOUVEAU, LE DEVIS CONSERVÉ\n')

    {
      const { error: tot } = await commercial.rpc('convert_sales_quote_to_order', {
        p_quote_id: decor.devis,
        p_order_date: null,
        p_expected_date: null,
      })
      check(Boolean(tot), 'Un devis NON ACCEPTÉ ne se convertit pas')

      const { error: accept } = await commercial.rpc('set_sales_quote_status', {
        p_quote_id: decor.devis,
        p_status: 'ACCEPTED',
        p_reason: 'Accord du client',
      })
      check(!accept, 'Le commercial enregistre l’ACCEPTATION du client', accept?.message ?? '')

      const { data: orderId, error: conv } = await commercial.rpc('convert_sales_quote_to_order', {
        p_quote_id: decor.devis,
        p_order_date: dayOffset(-3),
        p_expected_date: dayOffset(5),
      })
      check(!conv && Boolean(orderId), 'La conversion produit une commande', conv?.message ?? '')
      decor.commande = orderId

      const { data: devis, error: dError } = await commercial
        .from('sales_quotes')
        .select('quote_no, status, converted_at')
        .eq('id', decor.devis)
        .maybeSingle()

      check(
        !dError && devis?.status === 'CONVERTED' && devis?.quote_no?.startsWith('DEV-C-'),
        '🟥 LE DEVIS EST CONSERVÉ, et reste un DEVIS',
        dError ? `requête en erreur : ${dError.message}` : `${devis?.quote_no} · ${devis?.status}`
      )

      const { data: commande, error: cError } = await commercial
        .from('sales_orders')
        .select('order_no, status, sales_quote_id')
        .eq('id', orderId)
        .maybeSingle()

      check(
        !cError && commande?.order_no?.startsWith('CDE-C-'),
        'La commande porte sa PROPRE référence',
        cError ? `requête en erreur : ${cError.message}` : (commande?.order_no ?? '')
      )
      check(
        commande?.sales_quote_id === decor.devis,
        'La commande désigne explicitement son devis d’origine'
      )

      const { data: totalCmd } = await commercial.rpc('sales_order_total', { p_order_id: orderId })
      check(
        Number(totalCmd) === TOTAL_ATTENDU,
        '🟥 LES PRIX SONT RECOPIÉS, PAS RELUS — le catalogue dit pourtant 90 000',
        `${totalCmd} KMF attendu ${TOTAL_ATTENDU}`
      )

      const { data: lignes, error: lError } = await commercial
        .from('sales_order_lines')
        .select('id, service_id, source_quote_line_id')
        .eq('sales_order_id', orderId)

      check(
        !lError && (lignes ?? []).length === 3,
        'La commande reprend les trois lignes',
        lError ? `requête en erreur : ${lError.message}` : `${(lignes ?? []).length}`
      )
      check(
        (lignes ?? []).every((l) => l.source_quote_line_id !== null),
        'Chaque ligne nomme celle du devis dont elle est née'
      )
      check(
        (lignes ?? []).filter((l) => l.service_id === null).length === 1,
        '🟩 A-13 : la ligne libre traverse la conversion à l’identique'
      )

      const { error: deux } = await commercial.rpc('convert_sales_quote_to_order', {
        p_quote_id: decor.devis,
        p_order_date: null,
        p_expected_date: null,
      })
      check(Boolean(deux), '🟥 UN DEVIS NE PRODUIT PAS DEUX COMMANDES')

      // L'index fait autorité HORS de la fonction : deux clics simultanés.
      const { data: cmdNo } = await admin.rpc('next_number', { p_entity_key: 'sales_order' })
      const { error: forge } = await admin.from('sales_orders').insert({
        order_no: cmdNo,
        client_id: decor.client,
        sales_quote_id: decor.devis,
        order_date: dayOffset(0),
      })
      check(
        Boolean(forge),
        '🟥 Un INSERT DIRECT d’une seconde commande sur le même devis est REFUSÉ',
        forge ? 'refusé par l’index' : 'ACCEPTÉ'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — LA COMMANDE, ET SA FACTURATION PAR LA CHAÎNE EXISTANTE\n')

    const factureur = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await factureur.auth.signInWithPassword({
      email: accounts.factureur.email,
      password: accounts.factureur.password,
    })

    {
      const { error: brouillon } = await factureur.rpc('create_invoice_from_sales_order', {
        p_order_id: decor.commande,
        p_invoice_date: null,
        p_due_date: null,
      })
      check(Boolean(brouillon), 'Une commande en BROUILLON ne se facture pas')

      const { error: confirmeParFactureur } = await factureur.rpc('set_sales_order_status', {
        p_order_id: decor.commande,
        p_status: 'CONFIRMED',
        p_reason: null,
      })
      check(
        Boolean(confirmeParFactureur),
        '🟥 Le factureur ne CONFIRME pas — `commerce.sales_orders.validate` est exigée'
      )

      const { error: confirme } = await commercial.rpc('set_sales_order_status', {
        p_order_id: decor.commande,
        p_status: 'CONFIRMED',
        p_reason: 'Engagement du client',
      })
      check(!confirme, 'Le commercial CONFIRME la commande', confirme?.message ?? '')

      const { error: parCommercial } = await commercial.rpc('create_invoice_from_sales_order', {
        p_order_id: decor.commande,
        p_invoice_date: null,
        p_due_date: null,
      })
      check(
        Boolean(parCommercial),
        '🟥 `commerce.sales_orders.view` seule NE FACTURE PAS (Plan 01 §15.5)'
      )

      const { data: invoiceId, error: fact } = await factureur.rpc(
        'create_invoice_from_sales_order',
        {
          p_order_id: decor.commande,
          p_invoice_date: dayOffset(-2),
          p_due_date: dayOffset(28),
        }
      )
      check(!fact && Boolean(invoiceId), 'Le factureur prépare la facture', fact?.message ?? '')
      decor.facture = invoiceId

      const { data: facture, error: fError } = await factureur
        .from('customer_invoices')
        .select('invoice_no, status, sales_order_id, rental_id, billing_period_id, client_id')
        .eq('id', invoiceId)
        .maybeSingle()

      check(
        !fError && facture?.invoice_no?.startsWith('FAC-C-'),
        '🟥 LA FACTURE EMPRUNTE LA NUMÉROTATION EXISTANTE',
        fError ? `requête en erreur : ${fError.message}` : (facture?.invoice_no ?? '')
      )
      check(facture?.status === 'DRAFT', 'Elle naît en BROUILLON : émettre reste un acte distinct')
      check(facture?.sales_order_id === decor.commande, 'Elle désigne sa commande')
      check(
        facture?.rental_id === null && facture?.billing_period_id === null,
        'Commande et location sont deux origines ÉTANCHES'
      )
      check(facture?.client_id === decor.client, 'Elle est au client de la commande')

      const { data: lignes, error: lError } = await factureur
        .from('customer_invoice_lines')
        .select('kind, quantity, unit_price, service_id, source_order_line_id')
        .eq('customer_invoice_id', invoiceId)

      check(
        !lError && (lignes ?? []).length === 3,
        'Les lignes de la facture sont celles de la commande',
        lError ? `requête en erreur : ${lError.message}` : `${(lignes ?? []).length}`
      )
      check(
        (lignes ?? []).every((l) => l.kind === 'SERVICE'),
        'Chaque ligne est de nature « service »'
      )
      check(
        (lignes ?? []).every((l) => l.source_order_line_id !== null),
        'La traçabilité facture → commande → devis est complète'
      )

      const { data: total, error: tError } = await factureur.rpc('customer_invoice_total', {
        p_invoice_id: invoiceId,
      })
      check(
        !tError && Number(total) === TOTAL_ATTENDU,
        '🟥 LE MONTANT TRAVERSE TOUTE LA CHAÎNE SANS BOUGER',
        `${total} KMF attendu ${TOTAL_ATTENDU}`
      )

      const { data: commande } = await factureur
        .from('sales_orders')
        .select('status')
        .eq('id', decor.commande)
        .maybeSingle()
      check(commande?.status === 'INVOICED', 'La commande passe à « Facturée »')

      const { error: deux } = await factureur.rpc('create_invoice_from_sales_order', {
        p_order_id: decor.commande,
        p_invoice_date: null,
        p_due_date: null,
      })
      check(Boolean(deux), '🟥 UNE COMMANDE NE SE FACTURE PAS DEUX FOIS')

      const { data: facNo } = await admin.rpc('next_number', { p_entity_key: 'customer_invoice' })
      const { error: forge } = await admin.from('customer_invoices').insert({
        invoice_no: facNo,
        client_id: decor.client,
        sales_order_id: decor.commande,
        invoice_date: dayOffset(0),
      })
      check(
        Boolean(forge),
        '🟥 Un INSERT DIRECT d’une seconde facture sur la même commande est REFUSÉ',
        forge ? 'refusé par l’index' : 'ACCEPTÉ'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — ÉMISSION, RÈGLEMENT PARTIEL (A-10) ET TRÉSORERIE\n')

    {
      const { error: emise } = await factureur.rpc('issue_customer_invoice', {
        p_invoice_id: decor.facture,
        p_reason: 'Émission de recette',
      })
      check(!emise, 'La facture s’ÉMET par la fonction existante', emise?.message ?? '')

      const { error: fige } = await factureur
        .from('customer_invoice_lines')
        .update({ unit_price: 1 })
        .eq('customer_invoice_id', decor.facture)
      check(Boolean(fige), 'Une facture émise fige ses lignes — la règle du LOT 7 s’applique')

      // 🟩 A-10 — LE PAIEMENT PARTIEL, par le module EXISTANT.
      const { data: reglementId, error: reg } = await factureur.rpc('record_customer_payment', {
        p_invoice_id: decor.facture,
        p_account_id: decor.compte,
        p_amount: ACOMPTE,
        p_received_on: dayOffset(-1),
        p_method: 'BANK_TRANSFER',
        p_external_ref: null,
        p_notes: NOTE,
      })
      check(
        !reg && Boolean(reglementId),
        '🟩 A-10 : un RÈGLEMENT PARTIEL est enregistré par le module existant',
        reg?.message ?? ''
      )
      decor.reglement = reglementId

      const { data: paye, error: pError } = await factureur.rpc('customer_invoice_paid', {
        p_invoice_id: decor.facture,
      })
      check(
        !pError && Number(paye) === ACOMPTE,
        'L’encaissé de la facture est l’acompte',
        `${paye} KMF`
      )

      const { data: ecritures, error: eError } = await factureur
        .from('treasury_entries')
        .select('amount, direction, kind')
        .eq('customer_payment_id', reglementId)

      check(
        !eError && (ecritures ?? []).length === 1,
        'Le règlement produit UNE écriture de trésorerie',
        eError ? `requête en erreur : ${eError.message}` : `${(ecritures ?? []).length}`
      )
      check(
        ecritures?.[0]?.amount === ACOMPTE && ecritures?.[0]?.direction === 'IN',
        '🟥 LA TRÉSORERIE EXISTANTE ENREGISTRE EXACTEMENT L’ACOMPTE',
        `${ecritures?.[0]?.amount} KMF ${ecritures?.[0]?.direction}`
      )

      const { data: solde } = await admin.rpc('financial_account_balance', {
        p_account_id: decor.compte,
      })
      check(
        Number(solde) === ACOMPTE,
        'Le solde du compte augmente exactement de l’acompte',
        `${solde} KMF`
      )

      const { data: restant } = await factureur.rpc('customer_invoice_total', {
        p_invoice_id: decor.facture,
      })
      check(
        Number(restant) - ACOMPTE === SOLDE_ATTENDU,
        'Le solde restant dû est cohérent',
        `${Number(restant) - ACOMPTE} KMF attendu ${SOLDE_ATTENDU}`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — 🟥 CONFIDENTIALITÉ DES COÛTS — LA PREUVE, AUTREMENT\n')

    {
      /*
       * 1. STRUCTURELLE : aucune colonne de coût n'existe sur une ligne
       *    commerciale ni sur une ligne de facture. Interrogée, la requête
       *    ÉCHOUE — et c'est cet échec-là qui est la preuve, parce qu'il dit
       *    que la colonne n'existe pas du tout.
       */
      const { error: colonne } = await admin
        .from('sales_quote_lines')
        .select('unit_cost')
        .limit(1)
      check(
        Boolean(colonne),
        '🟥 STRUCTUREL : aucune colonne de coût sur une ligne de devis',
        colonne ? 'la colonne n’existe pas' : 'UNE COLONNE DE COÛT EXISTE'
      )

      const { error: colonneFac } = await admin
        .from('customer_invoice_lines')
        .select('unit_cost')
        .limit(1)
      check(
        Boolean(colonneFac),
        '🟥 STRUCTUREL : aucune colonne de coût sur une ligne de facture',
        colonneFac ? 'la colonne n’existe pas' : 'UNE COLONNE DE COÛT EXISTE'
      )

      /*
       * 2. PAR RLS : le commercial n'obtient AUCUN coût de service, même par
       *    appel direct. 🟥 Un `data` vide ne vaut preuve que SANS erreur.
       */
      const { data: couts, error: coutsError } = await commercial
        .from('service_variant_costs')
        .select('amount')
        .eq('variant_id', decor.standard)

      check(
        !coutsError && (couts ?? []).length === 0,
        '🟥 RLS : le commercial n’obtient AUCUN coût, même par appel direct',
        coutsError
          ? `requête en erreur : ${coutsError.message}`
          : `${(couts ?? []).length} ligne(s)`
      )

      /*
       * 3. LA GARDE ANTI-VACUITÉ : le profil PRIVILÉGIÉ lit RÉELLEMENT le coût.
       *    Sans ce contrôle, le précédent passerait aussi si la table était
       *    vide — et ne prouverait rien.
       */
      const avecCout = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await avecCout.auth.signInWithPassword({
        email: accounts.avecCout.email,
        password: accounts.avecCout.password,
      })

      const { data: lus, error: lusError } = await avecCout
        .from('service_variant_costs')
        .select('amount')
        .eq('variant_id', decor.standard)

      check(
        !lusError && (lus ?? []).length > 0,
        '🟥 ANTI-VACUITÉ : le profil privilégié lit RÉELLEMENT le coût',
        lusError ? `requête en erreur : ${lusError.message}` : `${(lus ?? []).length} coût(s)`
      )

      decor.avecCoutClient = avecCout
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — LES DOCUMENTS, ET LEURS TROIS CAPACITÉS\n')

    let sessionCommercial = null
    let sessionLecteur = null
    let sessionAvecCout = null

    {
      const avant = await photographie(admin, decor)

      sessionCommercial = await signIn(browser, base, accounts.commercial)

      for (const [type, id, nom] of [
        ['devis-clients', decor.devis, 'devis'],
        ['commandes-clients', decor.commande, 'commande'],
      ]) {
        const apercu = await fetchDocument(sessionCommercial.page, base, type, id, null)
        check(
          apercu.status === 200 && apercu.signature === '%PDF-',
          `L’APERÇU du ${nom} est un PDF`,
          `${apercu.status} · ${apercu.signature} · ${apercu.length} octets`
        )

        const telechargement = await fetchDocument(
          sessionCommercial.page,
          base,
          type,
          id,
          'download'
        )
        check(
          telechargement.status === 200 && telechargement.signature === '%PDF-',
          `Le TÉLÉCHARGEMENT du ${nom} est un PDF`,
          `${telechargement.status} · ${telechargement.length} octets`
        )

        const impression = await fetchDocument(sessionCommercial.page, base, type, id, 'print')
        check(
          impression.status === 200 && impression.signature === '%PDF-',
          `L’IMPRESSION du ${nom} est un PDF`,
          `${impression.status} · ${impression.length} octets`
        )

        decor[`empreinte_${nom}`] = telechargement.hash
        decor[`taille_${nom}`] = telechargement.length
      }

      /*
       * 🟥 LA PREUVE DIFFÉRENTIELLE — la seule qui tienne après le LOT 24.
       *
       * Le profil qui LIT RÉELLEMENT le coût (contrôle 9.3) télécharge les
       * mêmes documents. S'ils étaient identiques par hasard — parce que le
       * coût n'existe pas —, le contrôle 9.3 aurait échoué. Ici, le coût
       * existe, il est lisible par ce profil, et le document ne change pas
       * d'un octet.
       */
      sessionAvecCout = await signIn(browser, base, accounts.avecCout)

      for (const [type, id, nom] of [
        ['devis-clients', decor.devis, 'devis'],
        ['commandes-clients', decor.commande, 'commande'],
      ]) {
        const privilegie = await fetchDocument(sessionAvecCout.page, base, type, id, 'download')
        check(
          privilegie.status === 200 &&
            privilegie.hash === decor[`empreinte_${nom}`] &&
            privilegie.length === decor[`taille_${nom}`],
          `🟥 DIFFÉRENTIEL : le ${nom} d’un lecteur de coûts est IDENTIQUE, octet pour octet`,
          `${privilegie.length} vs ${decor[`taille_${nom}`]} octets · écart ${privilegie.length - decor[`taille_${nom}`]}`
        )
      }

      /* DEC-024 — « voir » n'ouvre ni le téléchargement ni l'impression. */
      sessionLecteur = await signIn(browser, base, accounts.lecteur)

      for (const [type, id, nom] of [
        ['devis-clients', decor.devis, 'devis'],
        ['commandes-clients', decor.commande, 'commande'],
      ]) {
        for (const mode of [null, 'download', 'print']) {
          const refus = await fetchDocument(sessionLecteur.page, base, type, id, mode)
          check(
            refus.status === 403,
            `🟥 DEC-024 : « voir » n’obtient pas le ${nom} (${mode ?? 'aperçu'})`,
            `statut ${refus.status}`
          )
        }
      }

      const apres = await photographie(admin, decor)
      const differences = ecarts(avant, apres)
      check(
        differences.length === 0,
        '🟥 PRODUIRE UN DOCUMENT NE CHANGE RIEN',
        differences.length === 0 ? 'photographie identique' : differences.join(' · ')
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('11 — LES ÉCRANS\n')

    {
      const page = sessionCommercial.page

      await page.goto(`${base}/commerce/devis`, { waitUntil: 'load' })
      await page.waitForFunction(
        (no) => document.body.innerText.includes(no),
        (await admin.from('sales_quotes').select('quote_no').eq('id', decor.devis).maybeSingle())
          .data.quote_no,
        { timeout: 60000 }
      )
      let texte = await mainText(page)
      check(texte.includes('Devis clients'), 'La liste des devis s’affiche')
      check(texte.includes('245 000'), 'Le total du devis figure dans la liste', 'montant figé')

      await page.goto(`${base}/commerce/devis/${decor.devis}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Détail') || true)
      texte = await mainText(page)
      check(texte.includes('Converti'), 'La fiche du devis annonce son état « Converti »')
      check(
        texte.includes('Accompagnement hors catalogue'),
        '🟩 A-13 : la ligne libre figure sur la fiche'
      )
      check(
        texte.includes('50 000'),
        '🟥 La fiche porte le prix FIGÉ, non le prix courant du catalogue'
      )
      check(
        !texte.includes('90 000'),
        '🟥 Le prix courant du catalogue n’apparaît nulle part sur le devis historique'
      )
      check(
        texte.includes('Commande issue de ce devis'),
        'La fiche renvoie à la commande née du devis'
      )

      await page.goto(`${base}/commerce/commandes/${decor.commande}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Facturation') || true)
      texte = await mainText(page)
      check(texte.includes('Facturée'), 'La fiche de la commande annonce « Facturée »')
      check(texte.includes('Devis d’origine') || texte.includes('Origine'), 'Elle nomme son origine')

      /*
       * 🟥 LA CHARGE UTILE DE LA PAGE NE PORTE AUCUN COÛT.
       *
       * Le HTML rendu par le serveur, et non le seul texte visible : un coût
       * glissé dans une charge utile React serait invisible à l'écran et
       * pourtant transmis au navigateur.
       */
      const html = await page.content()
      const fuites = ['31000', '31 000', 'unit_cost', 'unitCost', 'service_variant_costs'].filter(
        (terme) => html.includes(terme)
      )
      check(
        fuites.length === 0,
        '🟥 La charge utile de la page ne porte AUCUN coût',
        fuites.length === 0 ? 'aucun terme du domaine du coût' : fuites.join(', ')
      )

      /* La facture est bien DANS le module de facturation existant. */
      const pageFacture = sessionAvecCout.page
      await pageFacture.goto(`${base}/commerce/commandes/${decor.commande}`, { waitUntil: 'load' })

      const sessionFactureur = await signIn(browser, base, accounts.factureur)
      await sessionFactureur.page.goto(`${base}/facturation/clients`, { waitUntil: 'load' })

      const { data: facture } = await admin
        .from('customer_invoices')
        .select('invoice_no')
        .eq('id', decor.facture)
        .maybeSingle()

      await sessionFactureur.page.waitForFunction(
        (no) => document.body.innerText.includes(no),
        facture.invoice_no,
        { timeout: 60000 }
      )
      const texteFacture = await mainText(sessionFactureur.page)
      check(
        texteFacture.includes(facture.invoice_no),
        '🟥 LA FACTURE APPARAÎT DANS LE MODULE FACTURES CLIENTS EXISTANT',
        facture.invoice_no
      )
      check(
        texteFacture.includes('245 000'),
        'Elle y porte le montant venu du devis',
        `${TOTAL_ATTENDU} KMF`
      )

      await sessionFactureur.context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('12 — RESPONSIVE\n')

    for (const [largeur, hauteur, nom] of [
      [360, 740, 'mobile'],
      [768, 1024, 'tablette'],
      [1440, 900, 'bureau'],
    ]) {
      const session = await signIn(browser, base, accounts.commercial, {
        width: largeur,
        height: hauteur,
      })

      try {
        await session.page.goto(`${base}/commerce/devis/${decor.devis}`, { waitUntil: 'load' })
        await session.page.waitForFunction(
          () => document.querySelector('main') !== null,
          undefined,
          { timeout: 60000 }
        )

        const debordement = await session.page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        )
        check(!debordement, `Aucun débordement horizontal à ${largeur} px (${nom})`)

        const texte = await mainText(session.page)
        check(
          texte.includes('245 000'),
          `Le total reste lisible à ${largeur} px`,
          'aucune information perdue au rétrécissement'
        )
      } finally {
        await session.context.close()
      }
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('13 — L’ANNULATION NE CRÉE AUCUNE IMPASSE\n')

    {
      const { error: annuleReglement } = await factureur.rpc('cancel_customer_payment', {
        p_payment_id: decor.reglement,
        p_reason: 'Annulation de recette',
      })
      check(!annuleReglement, 'Le règlement s’annule', annuleReglement?.message ?? '')

      const { error: annuleFacture } = await factureur.rpc('cancel_customer_invoice', {
        p_invoice_id: decor.facture,
        p_reason: 'Annulation de recette',
      })
      check(!annuleFacture, 'La facture s’annule', annuleFacture?.message ?? '')

      const { data: commande, error: cError } = await factureur
        .from('sales_orders')
        .select('status, invoiced_at')
        .eq('id', decor.commande)
        .maybeSingle()

      check(
        !cError && commande?.status === 'CONFIRMED' && commande?.invoiced_at === null,
        '🟥 Facture annulée → la commande revient à « Confirmée » et se refacture',
        cError ? `requête en erreur : ${cError.message}` : (commande?.status ?? '')
      )

      const { error: annuleCommande } = await commercial.rpc('set_sales_order_status', {
        p_order_id: decor.commande,
        p_status: 'CANCELLED',
        p_reason: 'Affaire perdue',
      })
      check(!annuleCommande, 'La commande s’annule', annuleCommande?.message ?? '')

      const { data: devis, error: dError } = await commercial
        .from('sales_quotes')
        .select('status, converted_at')
        .eq('id', decor.devis)
        .maybeSingle()

      check(
        !dError && devis?.status === 'ACCEPTED' && devis?.converted_at === null,
        '🟥 Commande annulée → le devis revient à « Accepté » et se reconvertit',
        dError ? `requête en erreur : ${dError.message}` : (devis?.status ?? '')
      )

      const { data: prix } = await commercial
        .from('sales_quote_lines')
        .select('unit_price')
        .eq('sales_quote_id', decor.devis)
        .eq('service_variant_id', decor.standard)
        .maybeSingle()
      check(
        prix?.unit_price === PRIX_STANDARD,
        '🟥 Après tout ce parcours, le prix historique est TOUJOURS 50 000 KMF',
        `${prix?.unit_price} KMF`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('14 — AUDIT\n')

    {
      const { data: evenements, error } = await admin
        .from('audit_log')
        .select('action, entity_type, module_code')
        .in('entity_type', ['sales_quotes', 'sales_orders', 'sales_quote_lines', 'sales_order_lines'])
        .gte('occurred_at', new Date(Date.now() - 3600_000).toISOString())

      check(
        !error && (evenements ?? []).length > 0,
        'Les actes commerciaux sont journalisés',
        error ? `requête en erreur : ${error.message}` : `${(evenements ?? []).length} événement(s)`
      )

      check(
        (evenements ?? []).some((e) => e.action === 'STATUS_CHANGE'),
        'Les changements d’état sont qualifiés comme tels'
      )
      check(
        (evenements ?? []).every((e) => e.module_code === 'commerce'),
        'Chaque événement porte le module `commerce`'
      )

      const { data: refus, error: rError } = await admin
        .from('audit_log')
        .select('id')
        .eq('result', 'DENIED')
        .gte('occurred_at', new Date(Date.now() - 3600_000).toISOString())

      check(
        !rError,
        'Le journal des refus est lisible',
        rError ? `requête en erreur : ${rError.message}` : `${(refus ?? []).length} refus`
      )
    }

    await commercial.auth.signOut()
    await lecteur.auth.signOut()
    await factureur.auth.signOut()
    if (decor.avecCoutClient) await decor.avecCoutClient.auth.signOut()
  } finally {
    if (journalNavigateur.length > 0) {
      console.log('\n──────────────────────────────────────────────────────────────')
      console.log('JOURNAL DU NAVIGATEUR\n')
      for (const ligne of journalNavigateur.slice(0, 10)) console.log(`  ${DIM}${ligne}${RESET}`)
    }

    await browser.close()

    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('NETTOYAGE\n')

    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id).catch(() => {})
    }

    /*
     * 🟥 LE NETTOYAGE VÉRIFIE SON PROPRE EFFET — leçon du LOT 24.
     *
     * `purgeStrays` ignore l'erreur de chaque suppression, à dessein : un ordre
     * partiellement inapplicable ne doit pas interrompre les suivants. Mais une
     * défaillance passagère laisserait alors des résidus SANS que rien ne le
     * dise. Le balayage est donc rejoué tant qu'il reste quelque chose, trois
     * fois au plus, et ce qui subsiste est NOMMÉ.
     */
    let restes = 0

    for (let passage = 1; passage <= 3; passage += 1) {
      await purgeStrays(admin)

      const { count, error } = await admin
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .like('legal_name', 'RECETTE COM%')

      if (error) throw new Error(`relevé des résidus : ${error.message}`)

      restes = count ?? 0
      if (restes === 0) break

      console.log(
        `${DIM}Résidus après le passage ${passage} : ${restes} client(s). Nouveau balayage.${RESET}`
      )
    }

    check(restes === 0, 'Aucun résidu de recette — clients', `${restes}`)

    for (const [table, colonne, valeur, libelle] of [
      ['sales_quotes', 'notes', NOTE, 'devis'],
      ['services', 'notes', NOTE, 'services'],
      ['financial_accounts', 'description', NOTE, 'comptes'],
      ['service_categories', 'label', `${MARK}%`, 'catégories de services'],
    ]) {
      const { count, error } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true })
        [valeur.endsWith('%') ? 'like' : 'eq'](colonne, valeur)

      check(
        !error && (count ?? 0) === 0,
        `Aucun résidu de recette — ${libelle}`,
        error ? `requête en erreur : ${error.message}` : `${count ?? 0}`
      )
    }

    const after = await demoFootprint(admin)
    const bouge = Object.keys(before).filter((cle) => before[cle] !== after[cle])

    check(
      bouge.length === 0,
      'Le jeu de démonstration est intact',
      bouge.length === 0
        ? 'empreinte identique'
        : bouge.map((cle) => `${cle} : ${before[cle]} → ${after[cle]}`).join(' · ')
    )
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  console.log(`\n  ${GREEN}${passed} contrôle(s) réussi(s)${RESET}`)
  if (failed > 0) console.log(`  ${RED}${failed} contrôle(s) en échec${RESET}`)
  console.log()

  process.exit(failed === 0 ? 0 : 1)
}

/* -------------------------------------------------------------------------- */
/*  Nettoyage                                                                  */
/* -------------------------------------------------------------------------- */

async function idsOf(admin, table, column, values) {
  if (values.length === 0) return []
  const { data } = await admin.from(table).select('id').in(column, values)
  return (data ?? []).map((row) => row.id)
}

/**
 * Tout ce que la recette a écrit, retiré dans l'ordre de ses dépendances.
 *
 * LE BALAYAGE SE FAIT PAR MARQUEUR, NON PAR IDENTIFIANT SUIVI : une recette
 * interrompue laisse des résidus que la liste en mémoire ne connaît pas.
 */
async function purgeStrays(admin) {
  const { data: clients } = await admin
    .from('clients')
    .select('id')
    .like('legal_name', 'RECETTE COM%')
  const clientIds = (clients ?? []).map((row) => row.id)

  if (clientIds.length > 0) {
    const invoiceIds = await idsOf(admin, 'customer_invoices', 'client_id', clientIds)

    // Les écritures AVANT les règlements : elles les désignent.
    const paymentIds = await idsOf(admin, 'customer_payments', 'customer_invoice_id', invoiceIds)
    if (paymentIds.length > 0) {
      await admin.from('treasury_entries').delete().in('customer_payment_id', paymentIds)
      await admin.from('customer_payments').delete().in('id', paymentIds)
    }

    if (invoiceIds.length > 0) {
      await admin.from('customer_invoice_lines').delete().in('customer_invoice_id', invoiceIds)
      await admin.from('customer_invoices').delete().in('id', invoiceIds)
    }

    // Les lignes de commande AVANT celles du devis, qu'elles désignent.
    const orderIds = await idsOf(admin, 'sales_orders', 'client_id', clientIds)
    if (orderIds.length > 0) {
      await admin.from('sales_order_lines').delete().in('sales_order_id', orderIds)
      await admin.from('sales_orders').delete().in('id', orderIds)
    }

    const quoteIds = await idsOf(admin, 'sales_quotes', 'client_id', clientIds)
    if (quoteIds.length > 0) {
      await admin.from('sales_quote_lines').delete().in('sales_quote_id', quoteIds)
      await admin.from('sales_quotes').delete().in('id', quoteIds)
    }

    await admin.from('clients').delete().in('id', clientIds)
  }

  // Le catalogue de recette : les prix et coûts suivent leur variante.
  const { data: services } = await admin.from('services').select('id').eq('notes', NOTE)
  const serviceIds = (services ?? []).map((row) => row.id)

  if (serviceIds.length > 0) {
    const variantIds = await idsOf(admin, 'service_variants', 'service_id', serviceIds)
    if (variantIds.length > 0) {
      await admin.from('service_variant_prices').delete().in('variant_id', variantIds)
      await admin.from('service_variant_costs').delete().in('variant_id', variantIds)
      await admin.from('service_variants').delete().in('id', variantIds)
    }
    await admin.from('services').delete().in('id', serviceIds)
  }

  await admin.from('service_categories').delete().like('label', 'RECETTE COM%')
  await admin.from('financial_accounts').delete().eq('description', NOTE)

  const { data: comptes } = await admin
    .from('app_users')
    .select('id')
    .like('username', 'recette.com.%')

  for (const compte of comptes ?? []) {
    await admin.from('user_permissions').delete().eq('user_id', compte.id)
    await admin.from('app_users').delete().eq('id', compte.id)
    await admin.auth.admin.deleteUser(compte.id).catch(() => {})
  }
}

main().catch((error) => {
  console.error(`\n${RED}✖ ${error.message}${RESET}\n`)
  process.exit(1)
})
