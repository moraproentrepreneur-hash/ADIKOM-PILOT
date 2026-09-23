#!/usr/bin/env node
/**
 * Recette Commerce fournisseur — devis et commandes — LOT 26.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE NI LES TESTS UNITAIRES NI LA RECETTE SQL NE PEUVENT
 *
 * `supabase/tests/purchasing.sql` éprouve ce que la BASE tient seule, avec le
 * rôle de la chaîne de connexion — qui contourne RLS. `constants.test.ts`
 * éprouve l'arithmétique et les cycles, hors de toute base.
 *
 * Celle-ci éprouve ce qui n'existe qu'EN PRODUCTION, avec de VRAIES SESSIONS —
 * jeton Supabase, cookie applicatif, appels PostgREST directs, documents PDF,
 * classeurs d'export :
 *
 *   1. LA CHAÎNE ENTIÈRE, par l'écran : offre reçue → commande → facture
 *      fournisseur → règlement partiel → trésorerie.
 *   2. 🟥 LE PRIX EST CELUI DE L'OFFRE : le coût de référence du catalogue vaut
 *      40 000, le fournisseur propose 52 000, et c'est 52 000 qui est figé. Puis
 *      le catalogue passe à 70 000 — et rien ne bouge, ni sur l'offre, ni sur la
 *      commande, ni sur la facture.
 *   3. 🟥 AUCUN SYSTÈME PARALLÈLE : la facture née d'une commande est une
 *      `supplier_invoices` ordinaire, et elle apparaît dans le module Factures
 *      fournisseurs.
 *   4. 🟥 CONFIDENTIALITÉ DES COÛTS D'ACHAT. Ici, `view` EST la barrière : un
 *      devis fournisseur n'est qu'un prix d'achat. Un profil sans cette capacité
 *      n'obtient rien — ni par l'écran, ni par PostgREST, ni par document, ni
 *      par export. Et la preuve est gardée par l'ANTI-VACUITÉ : un profil
 *      autorisé lit RÉELLEMENT ces montants.
 *   5. 🟥 AUCUNE ÉCRITURE DE TRÉSORERIE au devis ni à la commande — la
 *      photographie du système le constate terme à terme.
 *   6. LES CAPACITÉS, éprouvées séparément (A-14, DEC-024), positivement ET
 *      négativement, par l'écran ET par appel direct.
 *   7. LES DOUBLES ACTIONS : deux conversions, deux facturations, refusées.
 *   8. Le responsive à 360, 768 et 1440 px. Le nettoyage, et son effet vérifié.
 *
 * 🟥 ANTI-VACUITÉ. Tout contrôle qui attend « aucune donnée » DISTINGUE une
 * requête en erreur d'un refus de lecture : un `data` vide ne vaut preuve que
 * s'il vient SANS erreur (leçon du LOT 24).
 *
 * Utilisation :
 *   node scripts/verify-purchasing.mjs [url]
 *
 * NE JAMAIS piper la sortie vers `head` : SIGPIPE tuerait le processus avant son
 * nettoyage, et laisserait des comptes et des offres de recette en base.
 */

import { Buffer } from 'node:buffer'
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
const MARK = `RECETTE ACH ${STAMP}`
const NOTE = 'RECETTE ACH'

/* Les montants du scénario, écrits une fois et confrontés jusqu'au bout. */

/** 🟥 Le coût de RÉFÉRENCE du catalogue — celui qu'il ne faut PAS appliquer. */
const COUT_REFERENCE = 40_000
/** 🟥 Le prix que CE fournisseur propose — celui qui doit être figé. */
const PRIX_OFFRE = 52_000
const PRIX_RENFORCE = 90_000
const PRIX_LIBRE = 7_500

const QTE_OFFRE = 3
const QTE_RENFORCE = 1
const QTE_LIBRE = 2

const TOTAL_ATTENDU =
  QTE_OFFRE * PRIX_OFFRE + QTE_RENFORCE * PRIX_RENFORCE + QTE_LIBRE * PRIX_LIBRE // 261 000

/** Le catalogue est relevé APRÈS l'offre : rien d'historique ne doit bouger. */
const COUT_APRES = 70_000

const ACOMPTE = 100_000
const SOLDE_ATTENDU = TOTAL_ATTENDU - ACOMPTE

const BASE = ['dashboard.view']

const PROFILES = {
  /*
   * L'ACHETEUR — il mène l'offre et la commande de bout en bout.
   *
   * Il n'a AUCUNE capacité de facturation fournisseur : c'est ce qui prouve
   * qu'enregistrer la facture d'une commande exige
   * `billing.supplier_invoices.create`, et non la seule capacité de lire la
   * commande.
   *
   * 🟥 IL N'A PAS `catalog.services.cost.view`. Un acheteur négocie sans
   * connaître le coût de référence interne — et le lot doit fonctionner sans,
   * puisque le prix vient de l'offre. C'est aussi ce qui rend la preuve
   * différentielle des documents possible (§13).
   */
  acheteur: [
    ...BASE,
    'commerce.purchase_quotes.view',
    'commerce.purchase_quotes.create',
    'commerce.purchase_quotes.update',
    'commerce.purchase_quotes.validate',
    'commerce.purchase_quotes.cancel',
    'commerce.purchase_quotes.export',
    'commerce.purchase_quotes.download',
    'commerce.purchase_quotes.print',
    'commerce.purchase_orders.view',
    'commerce.purchase_orders.create',
    'commerce.purchase_orders.update',
    'commerce.purchase_orders.validate',
    'commerce.purchase_orders.cancel',
    'commerce.purchase_orders.export',
    'commerce.purchase_orders.download',
    'commerce.purchase_orders.print',
    'catalog.services.view',
    'parties.suppliers.view',
  ],

  /*
   * 🟥 LE LECTEUR — DEC-024, le contrôle le plus simple et le plus important.
   *
   * Il CONSULTE les offres et les commandes, et rien de plus. Ni `download`, ni
   * `print`, ni `export`, ni `validate`, ni `cancel` : « voir » n'a jamais inclus
   * « produire un document » ni « faire avancer un acte ».
   */
  lecteur: [
    ...BASE,
    'commerce.purchase_quotes.view',
    'commerce.purchase_orders.view',
    'catalog.services.view',
    'parties.suppliers.view',
  ],

  /*
   * LE COMPTABLE — il tient la facturation fournisseur, et ne fait aucun achat.
   *
   * `billing.imputations.view` et `billing.supplier_payments.view` ne sont pas
   * des conforts : depuis les LOTS 5 et 6, annuler une facture est refusé à qui
   * ne peut lire ni les imputations qui la réduisent, ni les règlements qui la
   * soldent. Le commerce fournisseur hérite de ces exigences sans les modifier.
   */
  comptable: [
    ...BASE,
    'commerce.purchase_orders.view',
    'commerce.purchase_quotes.view',
    'billing.supplier_invoices.view',
    'billing.supplier_invoices.create',
    'billing.supplier_invoices.update',
    'billing.supplier_invoices.validate',
    'billing.supplier_invoices.cancel',
    'billing.supplier_invoices.download',
    'billing.imputations.view',
    'billing.supplier_payments.view',
    'billing.supplier_payments.create',
    'billing.supplier_payments.cancel',
    'treasury.accounts.view',
    'treasury.entries.view',
    'catalog.services.view',
    'parties.suppliers.view',
  ],

  /*
   * 🟥 CELUI QUI A LE DROIT DE LIRE LE COÛT DE RÉFÉRENCE.
   *
   * Il détient `catalog.services.cost.view` EN PLUS des lectures d'achat. C'est
   * le SEUL profil capable de prouver que les documents d'achat ne composent
   * JAMAIS le coût de référence du catalogue — MÊME pour un demandeur qui a le
   * droit de le lire.
   *
   * Sans lui, la confidentialité n'aurait été éprouvée que sur des profils
   * incapables de lire ce coût de toute façon : cela ne prouverait rien du
   * document, seulement de RLS.
   */
  avecCout: [
    ...BASE,
    'commerce.purchase_quotes.view',
    'commerce.purchase_quotes.download',
    'commerce.purchase_quotes.print',
    'commerce.purchase_orders.view',
    'commerce.purchase_orders.download',
    'commerce.purchase_orders.print',
    'catalog.services.view',
    'catalog.services.cost.view',
    'parties.suppliers.view',
  ],

  /*
   * L'ÉTANCHÉITÉ ENTRE LES DEUX MENUS — A-14.
   *
   * Il voit les DEVIS fournisseurs, pas les COMMANDES. La fiche d'une offre
   * convertie doit le DIRE plutôt que de taire la commande (DEC-017).
   */
  devisSeul: [
    ...BASE,
    'commerce.purchase_quotes.view',
    'catalog.services.view',
    'parties.suppliers.view',
  ],

  /*
   * 🟥 LE PROFIL SANS ACHAT — la confidentialité du LOT 26, éprouvée sur un
   * utilisateur LÉGITIME.
   *
   * Il consulte le catalogue, les fournisseurs et les factures fournisseurs — un
   * profil parfaitement ordinaire. Il n'a AUCUNE capacité d'achat : il ne doit
   * donc obtenir AUCUN prix négocié, par AUCUN chemin. C'est ce profil qui rend
   * la preuve de confidentialité non triviale.
   */
  sansAchat: [
    ...BASE,
    'catalog.services.view',
    'parties.suppliers.view',
    'billing.supplier_invoices.view',
  ],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.ach.${key}.${STAMP}`
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
    last_name: `Ach ${key}`,
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

/** Une session PostgREST porteuse du jeton d'un compte. */
async function apiAs(url, anonKey, account) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error) throw new Error(`session API (${account.username}) : ${error.message}`)
  return client
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
 * Rend le STATUT et les OCTETS : le statut dit si la capacité a été honorée, les
 * octets servent à la comparaison DIFFÉRENTIELLE entre deux profils — la seule
 * forme de preuve documentaire qui tienne après le LOT 24.
 *
 * ⚠ DEUX RENDUS DU MÊME DOCUMENT NE SONT JAMAIS IDENTIQUES AU BIT PRÈS.
 *
 * Un PDF porte, dans son dictionnaire d'information, une DATE DE CRÉATION, et
 * dans sa bande-annonce un IDENTIFIANT `/ID` dérivé du moment de production.
 * Deux téléchargements séparés de quelques secondes diffèrent donc toujours —
 * sans qu'aucun contenu ait changé. Ces deux champs — et EUX SEULS — sont
 * neutralisés avant comparaison ; le reste du fichier, flux compressés compris,
 * entre intact dans l'empreinte.
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

    // Latin-1 : une correspondance octet ↔ caractère, sans perte ni
    // réinterprétation d'un flux binaire en UTF-8.
    let brut = ''
    for (let i = 0; i < bytes.length; i += 1) brut += String.fromCharCode(bytes[i])

    const normalise = brut
      .replace(/D:\d{14}(?:[+\-Z]\d{2}'\d{2}')?/g, 'D:HORODATAGE')
      .replace(/\/ID\s*\[[^\]]*\]/g, '/ID [NEUTRALISE]')

    return { status: response.status, length: bytes.length, signature, normalise }
  }, url)
}

/** Où deux documents divergent — pour diagnostiquer en un passage. */
function divergence(a, b) {
  const limite = Math.min(a.length, b.length)
  for (let i = 0; i < limite; i += 1) {
    if (a[i] !== b[i]) {
      const extrait = (s) => JSON.stringify(s.slice(Math.max(0, i - 20), i + 40))
      return `1er écart à l’octet ${i} : ${extrait(a)} ≠ ${extrait(b)}`
    }
  }
  return `longueurs différentes : ${a.length} ≠ ${b.length}`
}

/**
 * Appelle une route applicative avec le cookie d'une session — sans navigateur.
 *
 * Le cookie est découpé comme `@supabase/ssr` le fait au-delà de sa taille
 * limite : un jeton entier dans un seul cookie serait refusé par le serveur.
 */
async function fetchAs(base, account, url, anonKey, path) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error) throw new Error(`session HTTP : ${error.message}`)

  const ref = new URL(url).hostname.split('.')[0]
  const value = 'base64-' + Buffer.from(JSON.stringify(data.session)).toString('base64')

  const size = 3180
  const parts = []
  for (let index = 0; index * size < value.length; index += 1) {
    parts.push(`sb-${ref}-auth-token.${index}=${value.slice(index * size, (index + 1) * size)}`)
  }

  const response = await fetch(`${base}${path}`, {
    headers: { cookie: parts.join('; ') },
    redirect: 'manual',
  })

  const body = response.status === 200 ? Buffer.from(await response.arrayBuffer()) : null

  await client.auth.signOut()

  return {
    status: response.status,
    type: response.headers.get('content-type'),
    body,
  }
}

/* -------------------------------------------------------------------------- */
/*  🟥 LA PHOTOGRAPHIE — ce qu'un acte commercial ne doit jamais changer       */
/* -------------------------------------------------------------------------- */

const NEANT = ['00000000-0000-0000-0000-000000000000']
const sur = (ids) => (ids.length > 0 ? ids : NEANT)

/**
 * Tout ce qu'un devis, une commande ou un document pourraient modifier s'ils
 * étaient des actes financiers.
 *
 * Prise AVANT, reprise APRÈS, comparée terme à terme. 🟥 AUCUN de ces actes ne
 * doit créer de règlement ni d'écriture de trésorerie (CLAUDE.md §57, §20 du
 * cadrage du LOT 26).
 *
 * Portée par la clé de service : elle doit voir TOUT ce qui existe, y compris ce
 * qu'une session ne verrait pas.
 */
async function photographie(admin, decor) {
  const { data: devis, error: devisError } = await admin
    .from('purchase_quotes')
    .select('id, quote_no, external_ref, status, quote_date, valid_until, supplier_id')
    .eq('supplier_id', decor.fournisseur)
    .order('quote_no')

  if (devisError) throw new Error(`photographie : offres illisibles — ${devisError.message}`)

  const { data: lignesDevis, error: ldError } = await admin
    .from('purchase_quote_lines')
    .select('id, purchase_quote_id, label, quantity, unit_price, is_archived, service_id')
    .in('purchase_quote_id', sur((devis ?? []).map((r) => r.id)))
    .order('id')

  if (ldError) throw new Error(`photographie : lignes d'offre illisibles — ${ldError.message}`)

  const { data: commandes, error: cmdError } = await admin
    .from('purchase_orders')
    .select('id, order_no, status, order_date, purchase_quote_id, supplier_id')
    .eq('supplier_id', decor.fournisseur)
    .order('order_no')

  if (cmdError) throw new Error(`photographie : commandes illisibles — ${cmdError.message}`)

  const { data: lignesCmd, error: lcError } = await admin
    .from('purchase_order_lines')
    .select('id, purchase_order_id, label, quantity, unit_price, is_archived, source_quote_line_id')
    .in('purchase_order_id', sur((commandes ?? []).map((r) => r.id)))
    .order('id')

  if (lcError) throw new Error(`photographie : lignes de commande illisibles — ${lcError.message}`)

  const { data: factures, error: facError } = await admin
    .from('supplier_invoices')
    .select('id, invoice_no, external_ref, status, purchase_order_id, invoice_date, due_date')
    .eq('supplier_id', decor.fournisseur)
    .order('invoice_no')

  if (facError) throw new Error(`photographie : factures illisibles — ${facError.message}`)

  const { data: lignesFac, error: lfError } = await admin
    .from('supplier_invoice_lines')
    .select('id, supplier_invoice_id, label, amount, quantity, unit_price, service_id, is_archived')
    .in('supplier_invoice_id', sur((factures ?? []).map((r) => r.id)))
    .order('id')

  if (lfError) throw new Error(`photographie : lignes de facture illisibles — ${lfError.message}`)

  const { data: reglements, error: regError } = await admin
    .from('supplier_payments')
    .select('id, payment_no, amount, status, supplier_invoice_id')
    .in('supplier_invoice_id', sur((factures ?? []).map((r) => r.id)))
    .order('payment_no')

  if (regError) throw new Error(`photographie : règlements illisibles — ${regError.message}`)

  const { data: ecritures, error: ecrError } = await admin
    .from('treasury_entries')
    .select('id, amount, direction, supplier_payment_id')
    .in('supplier_payment_id', sur((reglements ?? []).map((r) => r.id)))
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
    sommeFac: (lignesFac ?? []).reduce((t, l) => t + (l.is_archived ? 0 : l.amount), 0),
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
    .from('suppliers')
    .select('id', { count: 'exact', head: true })
    .like('legal_name', 'RECETTE ACH%')

  if (straysError) {
    throw new Error(`Relevé des résidus impossible : ${straysError.message}`)
  }

  if (strays > 0) {
    console.log(`${DIM}${strays} fournisseur(s) de recette subsistent : balayage préalable.${RESET}`)
    await purgeStrays(admin)
  }

  const accounts = {}
  const browser = await chromium.launch()
  const decor = {}
  const sessions = {}
  const api = {}

  try {
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    for (const [key, codes] of Object.entries(PROFILES)) {
      await createProfile(admin, accounts, key, codes)
    }
    check(Object.keys(accounts).length === 6, 'Six comptes de recette créés')

    await checkCatalogue(admin, check)

    for (const key of Object.keys(PROFILES)) {
      api[key] = await apiAs(url, anonKey, accounts[key])
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — LE DÉCOR : UN FOURNISSEUR, UN SERVICE ACHETÉ, UN COÛT DE RÉFÉRENCE\n')

    {
      const { data: supplierNo } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
      const { data: fournisseur, error } = await admin
        .from('suppliers')
        .insert({
          supplier_no: supplierNo,
          type: 'SERVICE_PROVIDER',
          legal_name: `${MARK} — Fournisseur`,
          phone: '+269 971 00 00',
          address: 'Zone artisanale',
          city: 'Moroni',
          country: 'Comores',
          status: 'ACTIVE',
          notes: NOTE,
        })
        .select('id')
        .single()
      if (error) throw new Error(`fournisseur : ${error.message}`)
      decor.fournisseur = fournisseur.id

      const { data: categorie, error: catError } = await admin
        .from('service_categories')
        .insert({ code: `RACH${STAMP}`, label: `${MARK} — Catégorie` })
        .select('id')
        .single()
      if (catError) throw new Error(`catégorie : ${catError.message}`)
      decor.categorie = categorie.id

      const { data: serviceNo } = await admin.rpc('next_number', { p_entity_key: 'service' })
      const { data: service, error: srvError } = await admin
        .from('services')
        .insert({
          service_no: serviceNo,
          label: `${MARK} — Entretien`,
          category_id: categorie.id,
          // PURCHASE : un service ACHETÉ. C'est ce que l'éditeur d'achat propose.
          purpose: 'PURCHASE',
          unit_label: 'intervention',
          status: 'ACTIVE',
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
      decor.standard = standard.id

      const { data: renforcee, error: varError } = await admin
        .from('service_variants')
        .insert({ service_id: service.id, label: 'Renforcée', is_default: false, is_active: true })
        .select('id')
        .single()
      if (varError) throw new Error(`variante : ${varError.message}`)
      decor.renforcee = renforcee.id

      /*
       * 🟥 LE COÛT DE RÉFÉRENCE — posé pour démontrer qu'il N'EST PAS APPLIQUÉ.
       *
       * Sans lui, le contrôle « la ligne porte le prix de l'offre » ne prouverait
       * rien : il passerait aussi bien si le catalogue était vide.
       */
      const { error: coutError } = await admin.rpc('set_service_cost', {
        p_variant_id: decor.standard,
        p_amount: COUT_REFERENCE,
        p_valid_from: dayOffset(-30),
        p_reason: NOTE,
      })
      if (coutError) throw new Error(`coût de référence : ${coutError.message}`)

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

      check(true, 'Fournisseur, catégorie, service acheté et deux variantes créés')

      const { data: cout, error: lireCout } = await admin
        .rpc('resolve_service_cost', {
          p_variant_id: decor.standard,
          p_on: dayOffset(0),
        })
        .maybeSingle()

      check(
        !lireCout && Number(cout?.amount) === COUT_REFERENCE,
        'Le coût de référence du catalogue est en vigueur',
        lireCout ? `requête en erreur : ${lireCout.message}` : `${cout?.amount} KMF`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — L’OFFRE REÇUE : TROIS LIGNES, DONT UNE LIBRE (A-13)\n')

    {
      const { data: quoteId, error } = await api.acheteur.rpc('create_purchase_quote', {
        p_supplier_id: decor.fournisseur,
        p_quote_date: dayOffset(-5),
        p_valid_until: dayOffset(20),
        p_external_ref: `PRO-${STAMP}`,
        p_notes: NOTE,
        p_terms: 'Intervention sous 72 h, pièces incluses.',
      })
      check(!error && Boolean(quoteId), 'L’offre reçue s’enregistre', error?.message ?? '')
      decor.devis = quoteId

      const lignes = [
        { p_quantity: QTE_OFFRE, p_unit_price: PRIX_OFFRE, p_variant_id: decor.standard, p_label: null },
        {
          p_quantity: QTE_RENFORCE,
          p_unit_price: PRIX_RENFORCE,
          p_variant_id: decor.renforcee,
          p_label: null,
        },
        // 🟩 A-13 — une ligne LIBRE, sans aucun service au catalogue.
        {
          p_quantity: QTE_LIBRE,
          p_unit_price: PRIX_LIBRE,
          p_variant_id: null,
          p_label: 'Pièce détachée hors catalogue',
        },
      ]

      for (const ligne of lignes) {
        const { error: ligneError } = await api.acheteur.rpc('add_purchase_quote_line', {
          p_quote_id: quoteId,
          ...ligne,
        })
        check(
          !ligneError,
          ligne.p_variant_id ? 'Une ligne de catalogue est ajoutée' : '🟩 A-13 : une ligne LIBRE est ajoutée',
          ligneError?.message ?? ''
        )
      }

      const { data: total } = await api.acheteur.rpc('purchase_quote_total', {
        p_quote_id: quoteId,
      })
      check(
        Number(total) === TOTAL_ATTENDU,
        'Le total de l’offre est la somme de ses lignes',
        `${total} KMF attendu ${TOTAL_ATTENDU}`
      )

      const { data: entete, error: eError } = await api.acheteur
        .from('purchase_quotes')
        .select('quote_no, external_ref, status')
        .eq('id', quoteId)
        .maybeSingle()

      check(
        !eError && entete?.quote_no?.startsWith('DEV-F-'),
        'L’offre porte un numéro interne DEV-F',
        eError ? `requête en erreur : ${eError.message}` : (entete?.quote_no ?? '')
      )
      check(
        entete?.external_ref === `PRO-${STAMP}`,
        '🟥 LA RÉFÉRENCE DU FOURNISSEUR EST DISTINCTE DU NUMÉRO INTERNE',
        `${entete?.quote_no} ≠ ${entete?.external_ref}`
      )
      check(entete?.status === 'DRAFT', 'Elle naît en brouillon', entete?.status ?? '')
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — 🟥 LE PRIX EST CELUI DE L’OFFRE, PAS CELUI DU CATALOGUE\n')

    {
      const { data: ligne, error } = await api.acheteur
        .from('purchase_quote_lines')
        .select('unit_price, service_id, label')
        .eq('purchase_quote_id', decor.devis)
        .eq('service_variant_id', decor.standard)
        .maybeSingle()

      check(
        !error && ligne?.unit_price === PRIX_OFFRE,
        '🟥 Coût de référence 40 000, offre 52 000 : la ligne porte le PRIX DE L’OFFRE',
        error ? `requête en erreur : ${error.message}` : `${ligne?.unit_price} KMF`
      )
      check(
        ligne?.service_id === decor.service,
        'La ligne nomme le service pour la TRAÇABILITÉ, non pour la valorisation'
      )

      /*
       * 🟥 ANTI-VACUITÉ : le coût de référence EXISTE et est LISIBLE par un
       * profil autorisé. Sans ce contrôle, le précédent passerait aussi si le
       * catalogue n'avait aucun coût — et ne prouverait rien.
       */
      const { data: couts, error: coutsError } = await api.avecCout
        .from('service_variant_costs')
        .select('amount')
        .eq('variant_id', decor.standard)

      check(
        !coutsError && (couts ?? []).some((c) => c.amount === COUT_REFERENCE),
        '🟥 ANTI-VACUITÉ : le coût de référence est RÉELLEMENT lisible par un profil autorisé',
        coutsError ? `requête en erreur : ${coutsError.message}` : `${(couts ?? []).length} coût(s)`
      )

      /* Et l'acheteur, lui, ne le lit pas — et travaille quand même. */
      const { data: refuses, error: refusError } = await api.acheteur
        .from('service_variant_costs')
        .select('amount')
        .eq('variant_id', decor.standard)

      check(
        !refusError && (refuses ?? []).length === 0,
        '🟥 L’acheteur négocie SANS lire le coût de référence interne',
        refusError ? `requête en erreur : ${refusError.message}` : `${(refuses ?? []).length} ligne(s)`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LES REFUS DE SAISIE, ET L’APPEL DIRECT\n')

    {
      const refus = [
        [{ p_quantity: 0, p_unit_price: 1000, p_variant_id: decor.standard, p_label: null }, 'quantité nulle'],
        [{ p_quantity: 1, p_unit_price: null, p_variant_id: decor.standard, p_label: null }, 'prix absent sur une ligne de catalogue'],
        [{ p_quantity: 1, p_unit_price: null, p_variant_id: null, p_label: 'Sans prix' }, 'prix absent sur une ligne libre'],
        [{ p_quantity: 1, p_unit_price: 0, p_variant_id: null, p_label: 'Prix nul' }, 'prix nul'],
        [{ p_quantity: 1, p_unit_price: 5000, p_variant_id: null, p_label: '   ' }, 'désignation vide'],
      ]

      for (const [params, libelle] of refus) {
        const { error } = await api.acheteur.rpc('add_purchase_quote_line', {
          p_quote_id: decor.devis,
          ...params,
        })
        check(Boolean(error), `Refus : ${libelle}`, error ? '' : 'ACCEPTÉ À TORT')
      }

      /*
       * 🟥 L'APPEL DIRECT — il ne rencontre AUCUNE ligne de code applicatif.
       * C'est RLS qui doit refuser, et elle seule.
       */
      const { error: postDirect } = await api.lecteur.from('purchase_quote_lines').insert({
        purchase_quote_id: decor.devis,
        label: 'Ligne forcée par appel direct',
        quantity: 1,
        unit_price: 1,
      })
      check(
        Boolean(postDirect),
        '🟥 APPEL DIRECT : un lecteur ne peut pas insérer une ligne d’offre',
        postDirect ? 'refusé par RLS' : 'ACCEPTÉ À TORT'
      )

      const { error: postDevis } = await api.lecteur.from('purchase_quotes').insert({
        quote_no: `DEV-F-FORCE-${STAMP}`,
        supplier_id: decor.fournisseur,
        quote_date: dayOffset(0),
      })
      check(
        Boolean(postDevis),
        '🟥 APPEL DIRECT : un lecteur ne peut pas créer une offre',
        postDevis ? 'refusé par RLS' : 'ACCEPTÉ À TORT'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — LE CYCLE DE L’OFFRE, ET SON GEL\n')

    {
      const { error: refuse } = await api.lecteur.rpc('set_purchase_quote_status', {
        p_quote_id: decor.devis,
        p_status: 'SENT',
        p_reason: 'Tentative',
      })
      check(Boolean(refuse), '🟥 « Voir » ne fait pas avancer une offre (DEC-024)')

      const { error: enregistre } = await api.acheteur.rpc('set_purchase_quote_status', {
        p_quote_id: decor.devis,
        p_status: 'SENT',
        p_reason: 'Offre reçue du fournisseur',
      })
      check(!enregistre, 'L’acheteur enregistre l’offre reçue', enregistre?.message ?? '')

      /* Une offre enregistrée est figée — lignes, référence, conditions. */
      const gels = [
        [
          await api.acheteur.rpc('add_purchase_quote_line', {
            p_quote_id: decor.devis,
            p_quantity: 1,
            p_unit_price: 1000,
            p_variant_id: null,
            p_label: 'Ligne tardive',
          }),
          'aucune ligne ne s’ajoute',
        ],
        [
          await api.acheteur.rpc('update_purchase_quote', {
            p_quote_id: decor.devis,
            p_quote_date: dayOffset(-5),
            p_valid_until: null,
            p_external_ref: 'PRO-AUTRE',
            p_notes: null,
            p_terms: null,
          }),
          'l’en-tête ne se modifie plus',
        ],
        [
          await api.acheteur
            .from('purchase_quotes')
            .update({ external_ref: 'PRO-PIRATE' })
            .eq('id', decor.devis),
          '🟥 la RÉFÉRENCE DU FOURNISSEUR est figée',
        ],
        [
          await api.acheteur
            .from('purchase_quotes')
            .update({ terms: 'Autres conditions' })
            .eq('id', decor.devis),
          '🟥 les CONDITIONS sont figées',
        ],
      ]

      for (const [resultat, libelle] of gels) {
        check(Boolean(resultat.error), `Offre enregistrée : ${libelle}`, resultat.error ? '' : 'ACCEPTÉ À TORT')
      }

      /*
       * 🟥 ANNOTER, C'EST MODIFIER (migration 100, appliquée d'emblée ici).
       *
       * Le porteur de `purchase_orders.create` — que la policy d'écriture admet
       * pour la conversion — ne doit PAS pouvoir annoter une offre.
       */
      const { data: avant } = await admin
        .from('purchase_quotes')
        .select('notes')
        .eq('id', decor.devis)
        .maybeSingle()

      await api.lecteur
        .from('purchase_quotes')
        .update({ notes: 'Annotation interdite' })
        .eq('id', decor.devis)

      const { data: apres } = await admin
        .from('purchase_quotes')
        .select('notes')
        .eq('id', decor.devis)
        .maybeSingle()

      check(
        apres?.notes === avant?.notes,
        '🟥 Un lecteur ne peut pas annoter une offre',
        `« ${apres?.notes} »`
      )

      const { error: annote } = await api.acheteur
        .from('purchase_quotes')
        .update({ notes: `${NOTE} — relance du fournisseur` })
        .eq('id', decor.devis)
      check(!annote, 'Le porteur de `update` annote, dans tous les états', annote?.message ?? '')
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — 🟥 LE CATALOGUE CHANGE ; L’OFFRE HISTORIQUE NE BOUGE PAS\n')

    {
      const { error } = await admin.rpc('set_service_cost', {
        p_variant_id: decor.standard,
        p_amount: COUT_APRES,
        p_valid_from: dayOffset(0),
        p_reason: `${NOTE} — révision`,
      })
      check(!error, `Le coût de référence est porté à ${COUT_APRES} KMF`, error?.message ?? '')

      const { data: cout } = await admin
        .rpc('resolve_service_cost', { p_variant_id: decor.standard, p_on: dayOffset(0) })
        .maybeSingle()
      check(Number(cout?.amount) === COUT_APRES, 'Le catalogue dit bien le nouveau coût')

      const { data: ligne, error: lError } = await api.acheteur
        .from('purchase_quote_lines')
        .select('unit_price')
        .eq('purchase_quote_id', decor.devis)
        .eq('service_variant_id', decor.standard)
        .maybeSingle()

      check(
        !lError && ligne?.unit_price === PRIX_OFFRE,
        '🟥 L’OFFRE HISTORIQUE RESTE À 52 000 : le catalogue ne la réécrit pas',
        lError ? `requête en erreur : ${lError.message}` : `${ligne?.unit_price} KMF`
      )

      const { data: total } = await api.acheteur.rpc('purchase_quote_total', {
        p_quote_id: decor.devis,
      })
      check(Number(total) === TOTAL_ATTENDU, 'Son total est inchangé', `${total} KMF`)
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — LA CONVERSION : UN ACTE NOUVEAU, L’ANCIEN INTACT\n')

    {
      const { error: retenir } = await api.acheteur.rpc('set_purchase_quote_status', {
        p_quote_id: decor.devis,
        p_status: 'ACCEPTED',
        p_reason: 'Offre retenue par ADIKOM',
      })
      check(!retenir, 'ADIKOM retient l’offre', retenir?.message ?? '')

      const { data: orderId, error } = await api.acheteur.rpc('convert_purchase_quote_to_order', {
        p_quote_id: decor.devis,
        p_order_date: dayOffset(-2),
        p_expected_date: dayOffset(12),
      })
      check(!error && Boolean(orderId), 'L’offre devient une commande', error?.message ?? '')
      decor.commande = orderId

      const { data: devis, error: dError } = await api.acheteur
        .from('purchase_quotes')
        .select('status, quote_no, external_ref, converted_at')
        .eq('id', decor.devis)
        .maybeSingle()

      check(
        !dError && devis?.status === 'CONVERTED',
        '🟥 L’OFFRE EST CONSERVÉE, et passe à « converti »',
        dError ? `requête en erreur : ${dError.message}` : (devis?.status ?? '')
      )
      check(
        devis?.quote_no?.startsWith('DEV-F-') && devis?.external_ref === `PRO-${STAMP}`,
        'Elle garde son numéro ET la référence du fournisseur',
        `${devis?.quote_no} · ${devis?.external_ref}`
      )

      const { data: commande, error: cError } = await api.acheteur
        .from('purchase_orders')
        .select('order_no, status, purchase_quote_id')
        .eq('id', orderId)
        .maybeSingle()

      check(
        !cError && commande?.order_no?.startsWith('CDE-F-'),
        'La commande porte un numéro CDE-F',
        cError ? `requête en erreur : ${cError.message}` : (commande?.order_no ?? '')
      )
      check(commande?.purchase_quote_id === decor.devis, 'Elle désigne l’offre dont elle est née')

      const { data: lignes, error: lError } = await api.acheteur
        .from('purchase_order_lines')
        .select('unit_price, quantity, source_quote_line_id, service_id')
        .eq('purchase_order_id', orderId)

      check(
        !lError && (lignes ?? []).length === 3,
        'Ses trois lignes sont reprises',
        lError ? `requête en erreur : ${lError.message}` : `${(lignes ?? []).length} ligne(s)`
      )
      check(
        (lignes ?? []).every((l) => l.source_quote_line_id !== null),
        'Chacune trace la ligne d’offre dont elle est née'
      )
      check(
        (lignes ?? []).some((l) => l.unit_price === PRIX_OFFRE),
        '🟥 LES PRIX SONT RECOPIÉS DE L’OFFRE, jamais relus du catalogue',
        `le coût de référence vaut pourtant ${COUT_APRES} KMF`
      )

      const { data: total } = await api.acheteur.rpc('purchase_order_total', {
        p_order_id: orderId,
      })
      check(Number(total) === TOTAL_ATTENDU, 'Le total de la commande est celui de l’offre')

      /* DOUBLE CONVERSION — par la fonction, puis par appel direct. */
      const { error: seconde } = await api.acheteur.rpc('convert_purchase_quote_to_order', {
        p_quote_id: decor.devis,
        p_order_date: null,
        p_expected_date: null,
      })
      check(Boolean(seconde), '🟥 Une offre ne produit pas deux commandes (fonction)')

      const { error: force } = await api.acheteur.from('purchase_orders').insert({
        order_no: `CDE-F-FORCE-${STAMP}`,
        supplier_id: decor.fournisseur,
        purchase_quote_id: decor.devis,
        order_date: dayOffset(0),
      })
      check(Boolean(force), '🟥 Ni par appel direct — l’index partiel fait autorité')

      /* CONCURRENCE — deux conversions simultanées d'une seconde offre. */
      const { data: bisId } = await api.acheteur.rpc('create_purchase_quote', {
        p_supplier_id: decor.fournisseur,
        p_quote_date: dayOffset(-3),
        p_valid_until: null,
        p_external_ref: `PRO-BIS-${STAMP}`,
        p_notes: NOTE,
        p_terms: null,
      })
      decor.devisBis = bisId

      await api.acheteur.rpc('add_purchase_quote_line', {
        p_quote_id: bisId,
        p_quantity: 1,
        p_unit_price: 25_000,
        p_variant_id: null,
        p_label: 'Prestation ponctuelle',
      })
      await api.acheteur.rpc('set_purchase_quote_status', {
        p_quote_id: bisId,
        p_status: 'SENT',
        p_reason: null,
      })
      await api.acheteur.rpc('set_purchase_quote_status', {
        p_quote_id: bisId,
        p_status: 'ACCEPTED',
        p_reason: null,
      })

      const simultanees = await Promise.all([
        api.acheteur.rpc('convert_purchase_quote_to_order', {
          p_quote_id: bisId,
          p_order_date: null,
          p_expected_date: null,
        }),
        api.acheteur.rpc('convert_purchase_quote_to_order', {
          p_quote_id: bisId,
          p_order_date: null,
          p_expected_date: null,
        }),
      ])

      const reussies = simultanees.filter((r) => !r.error).length
      check(
        reussies === 1,
        '🟥 CONCURRENCE : deux conversions simultanées ne produisent qu’UNE commande',
        `${reussies} réussite(s) sur 2`
      )

      const { count: commandesBis } = await admin
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .eq('purchase_quote_id', bisId)
      check(commandesBis === 1, 'Une seule commande existe en base pour cette offre', `${commandesBis}`)

      const { data: cmdBis } = await admin
        .from('purchase_orders')
        .select('id')
        .eq('purchase_quote_id', bisId)
        .maybeSingle()
      decor.commandeBis = cmdBis?.id ?? null
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — LA COMMANDE DIRECTE (cas B), ET LA RÉCEPTION (B-6)\n')

    {
      const { data: directId, error } = await api.acheteur.rpc('create_purchase_order', {
        p_supplier_id: decor.fournisseur,
        p_order_date: dayOffset(-1),
        p_expected_date: dayOffset(14),
        p_notes: NOTE,
        p_terms: 'Achat de routine.',
      })
      check(
        !error && Boolean(directId),
        'Une commande se crée DIRECTEMENT, sans offre préalable',
        error?.message ?? ''
      )
      decor.commandeDirecte = directId

      const { data: origine } = await api.acheteur
        .from('purchase_orders')
        .select('purchase_quote_id')
        .eq('id', directId)
        .maybeSingle()
      check(origine?.purchase_quote_id === null, 'Elle ne désigne aucune offre : l’origine est facultative')

      await api.acheteur.rpc('add_purchase_order_line', {
        p_order_id: directId,
        p_quantity: 2,
        p_unit_price: PRIX_RENFORCE,
        p_variant_id: decor.renforcee,
        p_label: null,
      })

      const { data: total } = await api.acheteur.rpc('purchase_order_total', {
        p_order_id: directId,
      })
      check(Number(total) === 2 * PRIX_RENFORCE, 'Son total est celui de ses lignes', `${total} KMF`)

      const { error: passe } = await api.acheteur.rpc('set_purchase_order_status', {
        p_order_id: directId,
        p_status: 'CONFIRMED',
        p_reason: 'Commande transmise',
      })
      check(!passe, 'Elle se passe comme une autre', passe?.message ?? '')

      const { error: fige } = await api.acheteur.rpc('add_purchase_order_line', {
        p_order_id: directId,
        p_quantity: 1,
        p_unit_price: 1000,
        p_variant_id: null,
        p_label: 'Ligne tardive',
      })
      check(Boolean(fige), '🟥 Ses lignes sont figées une fois la commande passée')

      /* 🟩 B-6 — la réception se CONSTATE, sans produire aucun document. */
      const { error: recu } = await api.acheteur.rpc('set_purchase_order_status', {
        p_order_id: directId,
        p_status: 'DELIVERED',
        p_reason: 'Prestation reçue',
      })
      check(!recu, '🟩 B-6 : la réception se constate par un statut, pas par un bon', recu?.message ?? '')
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — 🟥 LA FACTURE EST UNE `supplier_invoices` ORDINAIRE\n')

    {
      /* La commande principale se passe d'abord. */
      const { error: passe } = await api.acheteur.rpc('set_purchase_order_status', {
        p_order_id: decor.commande,
        p_status: 'CONFIRMED',
        p_reason: 'Commande transmise au fournisseur',
      })
      check(!passe, 'La commande issue de l’offre est passée', passe?.message ?? '')

      /* 🟥 L'ACHETEUR ne peut PAS enregistrer la facture. */
      const { error: refuse } = await api.acheteur.rpc('create_invoice_from_purchase_order', {
        p_order_id: decor.commande,
        p_invoice_date: null,
        p_due_date: null,
        p_external_ref: null,
      })
      check(
        Boolean(refuse),
        '🟥 Enregistrer la facture exige `billing.supplier_invoices.create`, non la lecture de la commande'
      )

      const { data: invoiceId, error } = await api.comptable.rpc(
        'create_invoice_from_purchase_order',
        {
          p_order_id: decor.commande,
          p_invoice_date: dayOffset(-1),
          p_due_date: dayOffset(29),
          p_external_ref: `FA-${STAMP}`,
        }
      )
      check(!error && Boolean(invoiceId), 'Le comptable enregistre la facture reçue', error?.message ?? '')
      decor.facture = invoiceId

      const { data: facture, error: fError } = await api.comptable
        .from('supplier_invoices')
        .select('invoice_no, external_ref, status, purchase_order_id, supplier_id')
        .eq('id', invoiceId)
        .maybeSingle()

      check(
        !fError && facture?.invoice_no?.startsWith('FAC-F-'),
        '🟥 MÊME NUMÉROTATION que toute facture fournisseur : aucun second numéroteur',
        fError ? `requête en erreur : ${fError.message}` : (facture?.invoice_no ?? '')
      )
      check(facture?.status === 'DRAFT', '🟥 Elle naît EN BROUILLON : reconnaître la dette reste distinct')
      check(facture?.purchase_order_id === decor.commande, 'Elle désigne sa commande')
      check(
        facture?.external_ref === `FA-${STAMP}`,
        'La référence de la facture du fournisseur est conservée, distincte du numéro interne',
        `${facture?.invoice_no} ≠ ${facture?.external_ref}`
      )

      const { data: brut } = await api.comptable.rpc('supplier_invoice_gross', {
        p_invoice_id: invoiceId,
      })
      check(
        Number(brut) === TOTAL_ATTENDU,
        'Son montant brut est celui de la commande',
        `${brut} KMF attendu ${TOTAL_ATTENDU}`
      )

      const { data: lignes, error: lError } = await api.comptable
        .from('supplier_invoice_lines')
        .select('label, amount, quantity, unit_price, service_id')
        .eq('supplier_invoice_id', invoiceId)

      check(
        !lError && (lignes ?? []).length === 3,
        'Elle porte les trois lignes de la commande',
        lError ? `requête en erreur : ${lError.message}` : `${(lignes ?? []).length}`
      )
      check(
        (lignes ?? []).every((l) => l.quantity !== null && l.unit_price !== null),
        'Chaque ligne porte sa décomposition'
      )
      check(
        (lignes ?? []).every((l) => l.amount === l.quantity * l.unit_price),
        '🟥 `amount = quantité × prix unitaire` — garanti par la base (Plan 02 §18.2)'
      )
      check(
        (lignes ?? []).filter((l) => l.service_id !== null).length === 2,
        'Les deux lignes de catalogue sont tracées ; la ligne libre ne l’est pas'
      )

      const { data: commande } = await api.acheteur
        .from('purchase_orders')
        .select('status')
        .eq('id', decor.commande)
        .maybeSingle()
      check(commande?.status === 'INVOICED', 'La commande passe à « Facturée »', commande?.status ?? '')

      /* DOUBLE FACTURATION — par la fonction, puis par appel direct. */
      const { error: seconde } = await api.comptable.rpc('create_invoice_from_purchase_order', {
        p_order_id: decor.commande,
        p_invoice_date: null,
        p_due_date: null,
        p_external_ref: null,
      })
      check(Boolean(seconde), '🟥 Une commande ne porte pas deux factures vivantes (fonction)')

      const { error: force } = await api.comptable.from('supplier_invoices').insert({
        invoice_no: `FAC-F-FORCE-${STAMP}`,
        supplier_id: decor.fournisseur,
        invoice_date: dayOffset(0),
        purchase_order_id: decor.commande,
      })
      check(Boolean(force), '🟥 Ni par appel direct — l’index partiel fait autorité')

      /*
       * 🟥 CE QUI RESTE POSSIBLE, ET QUI COMPTE : une facture reçue POUR UN
       * COMPLÉMENT s'enregistre toujours, sans commande d'origine. Aucune dette
       * ne disparaît — seul le LIEN structurel est unique.
       */
      const { data: complement, error: cError } = await api.comptable.rpc(
        'create_supplier_invoice',
        {
          p_supplier_id: decor.fournisseur,
          p_invoice_date: dayOffset(0),
          p_due_date: null,
          p_external_ref: `FA-COMP-${STAMP}`,
          p_notes: `${NOTE} — complément`,
          p_purchase_order_id: null,
        }
      )
      check(
        !cError && Boolean(complement),
        '🟥 Une facture de complément s’enregistre toujours, sans commande d’origine',
        cError?.message ?? ''
      )
      decor.factureComplement = complement
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — RECONNAÎTRE LA DETTE, PUIS RÉGLER — PAR LA CHAÎNE EXISTANTE\n')

    {
      const { error: soumis } = await api.comptable.rpc('submit_supplier_invoice', {
        p_invoice_id: decor.facture,
      })
      check(!soumis, 'La facture se soumet au contrôle (LOT 5, inchangé)', soumis?.message ?? '')

      const { error: valide } = await api.comptable.rpc('validate_supplier_invoice', {
        p_invoice_id: decor.facture,
        p_reason: 'Contrôle fait',
      })
      check(!valide, '🟥 LA DETTE SE RECONNAÎT PAR `validate`, acte distinct', valide?.message ?? '')

      const { data: paymentId, error: regle } = await api.comptable.rpc(
        'record_supplier_payment',
        {
          p_invoice_id: decor.facture,
          p_account_id: decor.compte,
          p_amount: ACOMPTE,
          p_paid_on: dayOffset(0),
          p_method: 'BANK_TRANSFER',
          p_external_ref: `VIR-${STAMP}`,
          p_notes: NOTE,
        }
      )
      check(
        !regle && Boolean(paymentId),
        'Un règlement PARTIEL s’enregistre par la fonction existante',
        regle?.message ?? `${ACOMPTE} KMF`
      )
      decor.reglement = paymentId

      const { data: ecritures, error: eError } = await api.comptable
        .from('treasury_entries')
        .select('amount, direction')
        .eq('supplier_payment_id', paymentId)

      check(
        !eError && (ecritures ?? []).length === 1,
        '🟥 LA TRÉSORERIE NE BOUGE QU’AU RÈGLEMENT, et par la chaîne existante',
        eError ? `requête en erreur : ${eError.message}` : `${(ecritures ?? []).length} écriture(s)`
      )
      check(
        (ecritures ?? [])[0]?.amount === ACOMPTE && (ecritures ?? [])[0]?.direction === 'OUT',
        'Elle porte le montant réglé, en sortie',
        `${(ecritures ?? [])[0]?.amount} KMF · ${(ecritures ?? [])[0]?.direction}`
      )

      const { data: paye } = await api.comptable.rpc('supplier_invoice_paid', {
        p_invoice_id: decor.facture,
      })
      check(
        Number(paye) === ACOMPTE,
        'Le payé de la facture est celui du règlement',
        `${paye} KMF, solde ${SOLDE_ATTENDU} KMF`
      )

      const { data: statut } = await api.comptable
        .from('supplier_invoices')
        .select('status')
        .eq('id', decor.facture)
        .maybeSingle()
      check(
        statut?.status === 'VALIDATED',
        '🟥 « Partiellement payée » NE S’ÉCRIT PAS : elle se calcule (acquis du LOT 6)',
        statut?.status ?? ''
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('11 — 🟥 AUCUNE ÉCRITURE DE TRÉSORERIE AU DEVIS NI À LA COMMANDE\n')

    {
      const avant = await photographie(admin, decor)

      /* Une offre et une commande de plus, jusqu'à leur passage. */
      const { data: quoteId } = await api.acheteur.rpc('create_purchase_quote', {
        p_supplier_id: decor.fournisseur,
        p_quote_date: dayOffset(0),
        p_valid_until: null,
        p_external_ref: `PRO-TER-${STAMP}`,
        p_notes: NOTE,
        p_terms: null,
      })
      await api.acheteur.rpc('add_purchase_quote_line', {
        p_quote_id: quoteId,
        p_quantity: 1,
        p_unit_price: 33_000,
        p_variant_id: null,
        p_label: 'Prestation de contrôle',
      })
      await api.acheteur.rpc('set_purchase_quote_status', {
        p_quote_id: quoteId,
        p_status: 'SENT',
        p_reason: null,
      })
      await api.acheteur.rpc('set_purchase_quote_status', {
        p_quote_id: quoteId,
        p_status: 'ACCEPTED',
        p_reason: null,
      })
      const { data: orderId } = await api.acheteur.rpc('convert_purchase_quote_to_order', {
        p_quote_id: quoteId,
        p_order_date: dayOffset(0),
        p_expected_date: null,
      })
      await api.acheteur.rpc('set_purchase_order_status', {
        p_order_id: orderId,
        p_status: 'CONFIRMED',
        p_reason: null,
      })
      decor.devisTer = quoteId
      decor.commandeTer = orderId

      const apres = await photographie(admin, decor)

      check(
        apres.nbReglements === avant.nbReglements,
        '🟥 AUCUN RÈGLEMENT n’est né d’une offre ni d’une commande',
        `${avant.nbReglements} → ${apres.nbReglements}`
      )
      check(
        apres.nbEcritures === avant.nbEcritures && apres.sommeTresorerie === avant.sommeTresorerie,
        '🟥 AUCUNE ÉCRITURE DE TRÉSORERIE n’est née d’une offre ni d’une commande',
        `${avant.sommeTresorerie} → ${apres.sommeTresorerie} KMF`
      )
      check(
        apres.nbFactures === avant.nbFactures,
        '🟥 AUCUNE FACTURE n’est née toute seule',
        `${avant.nbFactures} → ${apres.nbFactures}`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('12 — 🟥 CONFIDENTIALITÉ DES COÛTS D’ACHAT\n')

    {
      /*
       * 🟥 ICI, `view` EST LA BARRIÈRE. Un devis fournisseur n'est qu'un prix
       * d'achat : un profil sans cette capacité ne doit rien obtenir, par aucun
       * chemin.
       *
       * ANTI-VACUITÉ : chaque « aucune donnée » est distingué d'une requête en
       * erreur. Un `data` vide ne vaut preuve que SANS erreur.
       */
      for (const [table, colonne, valeur, libelle] of [
        ['purchase_quotes', 'supplier_id', decor.fournisseur, 'les offres'],
        ['purchase_orders', 'supplier_id', decor.fournisseur, 'les commandes'],
      ]) {
        const { data, error } = await api.sansAchat.from(table).select('id').eq(colonne, valeur)
        check(
          !error && (data ?? []).length === 0,
          `🟥 Un profil sans capacité d’achat n’obtient AUCUNE ligne : ${libelle}`,
          error ? `requête en erreur : ${error.message}` : `${(data ?? []).length} ligne(s)`
        )
      }

      const { data: lignesSansAchat, error: lError } = await api.sansAchat
        .from('purchase_quote_lines')
        .select('unit_price')
        .eq('purchase_quote_id', decor.devis)
      check(
        !lError && (lignesSansAchat ?? []).length === 0,
        '🟥 Il n’obtient AUCUN prix négocié, même en visant les lignes',
        lError ? `requête en erreur : ${lError.message}` : `${(lignesSansAchat ?? []).length}`
      )

      /*
       * 🟥 ANTI-VACUITÉ : l'acheteur, lui, LIT RÉELLEMENT ces montants. Sans ce
       * contrôle, les précédents passeraient aussi sur une base vide.
       */
      const { data: lues, error: luesError } = await api.acheteur
        .from('purchase_quote_lines')
        .select('unit_price')
        .eq('purchase_quote_id', decor.devis)
      check(
        !luesError && (lues ?? []).some((l) => l.unit_price === PRIX_OFFRE),
        '🟥 ANTI-VACUITÉ : un profil autorisé lit RÉELLEMENT les prix négociés',
        luesError ? `requête en erreur : ${luesError.message}` : `${(lues ?? []).length} ligne(s)`
      )

      /* Même par la fonction de somme : elle ne voit que ce que RLS laisse voir. */
      const { data: totalMuet } = await api.sansAchat.rpc('purchase_quote_total', {
        p_quote_id: decor.devis,
      })
      check(
        Number(totalMuet) === 0,
        '🟥 La fonction de total ne rend rien à qui ne lit pas les lignes',
        `${totalMuet}`
      )

      /* Par l'écran : la route est refusée, et ne rend aucun montant. */
      const ecran = await fetchAs(base, accounts.sansAchat, url, anonKey, '/commerce/devis-fournisseurs')
      check(
        ecran.status === 307 || ecran.status === 302 || ecran.status === 403,
        '🟥 L’écran des devis fournisseurs lui est refusé',
        `statut ${ecran.status}`
      )

      /* 🟥 PAR L'EXPORT — §30 : un export n'est jamais plus permissif que l'écran. */
      // `classeur` et non `module` : ESLint interdit d'affecter cette variable,
      // que Next réserve au module système.
      for (const classeur of ['devis-fournisseurs', 'commandes-fournisseurs']) {
        const refus = await fetchAs(base, accounts.sansAchat, url, anonKey, `/api/exports/${classeur}`)
        check(
          refus.status === 403,
          `🟥 EXPORT refusé à un profil sans capacité d’achat : ${classeur}`,
          `statut ${refus.status}`
        )

        /* Et « voir » n'ouvre pas l'export non plus (DEC-024). */
        const lecteurSeul = await fetchAs(base, accounts.lecteur, url, anonKey, `/api/exports/${classeur}`)
        check(
          lecteurSeul.status === 403,
          `🟥 DEC-024 : « voir » n’ouvre pas l’export — ${classeur}`,
          `statut ${lecteurSeul.status}`
        )

        /* Le porteur de la capacité, lui, obtient bien un classeur. */
        const autorise = await fetchAs(base, accounts.acheteur, url, anonKey, `/api/exports/${classeur}`)
        check(
          autorise.status === 200 && (autorise.type ?? '').includes('spreadsheet'),
          `L’export est servi au porteur de la capacité — ${classeur}`,
          `${autorise.status} · ${autorise.type ?? ''}`
        )

        /*
         * 🟥 ANTI-VACUITÉ SUR LE CLASSEUR : un fichier vide passerait le contrôle
         * précédent sans rien prouver. Le classeur est un ZIP (`PK`), et il pèse.
         */
        const signature = autorise.body?.subarray(0, 2).toString('latin1')
        check(
          signature === 'PK' && (autorise.body?.length ?? 0) > 2000,
          `Le classeur est un vrai fichier, non une enveloppe vide — ${classeur}`,
          `${signature} · ${autorise.body?.length ?? 0} octets`
        )
      }
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('13 — LES DOCUMENTS, ET LEURS TROIS CAPACITÉS\n')

    {
      const avant = await photographie(admin, decor)

      sessions.acheteur = await signIn(browser, base, accounts.acheteur)

      for (const [type, id, nom] of [
        ['devis-fournisseurs', decor.devis, 'devis'],
        ['commandes-fournisseurs', decor.commande, 'commande'],
      ]) {
        const apercu = await fetchDocument(sessions.acheteur.page, base, type, id, null)
        check(
          apercu.status === 200 && apercu.signature === '%PDF-',
          `L’APERÇU du ${nom} fournisseur est un PDF`,
          `${apercu.status} · ${apercu.signature} · ${apercu.length} octets`
        )

        const telechargement = await fetchDocument(sessions.acheteur.page, base, type, id, 'download')
        check(
          telechargement.status === 200 && telechargement.signature === '%PDF-',
          `Le TÉLÉCHARGEMENT du ${nom} fournisseur est un PDF`,
          `${telechargement.status} · ${telechargement.length} octets`
        )

        const impression = await fetchDocument(sessions.acheteur.page, base, type, id, 'print')
        check(
          impression.status === 200 && impression.signature === '%PDF-',
          `L’IMPRESSION du ${nom} fournisseur est un PDF`,
          `${impression.status} · ${impression.length} octets`
        )

        decor[`empreinte_${nom}`] = telechargement.normalise
        decor[`taille_${nom}`] = telechargement.length
      }

      /*
       * 🟥 LA PREUVE DIFFÉRENTIELLE — la seule qui tienne après le LOT 24.
       *
       * Le profil qui LIT RÉELLEMENT le coût de référence (§3) télécharge les
       * mêmes documents. S'ils étaient identiques par hasard — parce que ce coût
       * n'existe pas —, le contrôle d'anti-vacuité du §3 aurait échoué. Ici, le
       * coût existe, ce profil le lit, et le document ne change pas d'un octet :
       * le coût de RÉFÉRENCE ne franchit jamais la couche documentaire.
       */
      sessions.avecCout = await signIn(browser, base, accounts.avecCout)

      for (const [type, id, nom] of [
        ['devis-fournisseurs', decor.devis, 'devis'],
        ['commandes-fournisseurs', decor.commande, 'commande'],
      ]) {
        const privilegie = await fetchDocument(sessions.avecCout.page, base, type, id, 'download')
        const identique =
          privilegie.status === 200 &&
          privilegie.length === decor[`taille_${nom}`] &&
          privilegie.normalise === decor[`empreinte_${nom}`]

        check(
          identique,
          `🟥 DIFFÉRENTIEL : le ${nom} d’un lecteur de coûts est IDENTIQUE, octet pour octet`,
          identique
            ? `${privilegie.length} octets, horodatage neutralisé`
            : divergence(decor[`empreinte_${nom}`], privilegie.normalise)
        )
      }

      /* DEC-024 — « voir » n'ouvre ni le téléchargement ni l'impression. */
      sessions.lecteur = await signIn(browser, base, accounts.lecteur)

      for (const [type, id, nom] of [
        ['devis-fournisseurs', decor.devis, 'devis'],
        ['commandes-fournisseurs', decor.commande, 'commande'],
      ]) {
        for (const mode of [null, 'download', 'print']) {
          const refus = await fetchDocument(sessions.lecteur.page, base, type, id, mode)
          check(
            refus.status === 403,
            `🟥 DEC-024 : « voir » n’obtient pas le ${nom} fournisseur (${mode ?? 'aperçu'})`,
            `statut ${refus.status}`
          )
        }
      }

      /* 🟥 Et un profil sans capacité d'achat n'obtient rien du tout. */
      sessions.sansAchat = await signIn(browser, base, accounts.sansAchat)

      for (const [type, id, nom] of [
        ['devis-fournisseurs', decor.devis, 'devis'],
        ['commandes-fournisseurs', decor.commande, 'commande'],
      ]) {
        const refus = await fetchDocument(sessions.sansAchat.page, base, type, id, 'download')
        check(
          refus.status === 403,
          `🟥 Un profil sans capacité d’achat n’obtient pas le ${nom}`,
          `statut ${refus.status}`
        )
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
    console.log('14 — LES ÉCRANS, ET L’ÉTANCHÉITÉ DES MENUS\n')

    {
      const page = sessions.acheteur.page

      const { data: devis } = await admin
        .from('purchase_quotes')
        .select('quote_no')
        .eq('id', decor.devis)
        .maybeSingle()

      await page.goto(`${base}/commerce/devis-fournisseurs`, { waitUntil: 'load' })
      await page.waitForFunction((no) => document.body.innerText.includes(no), devis.quote_no, {
        timeout: 60000,
      })
      let texte = await mainText(page)
      check(texte.includes('Devis fournisseurs'), 'La liste des devis fournisseurs s’affiche')
      check(texte.includes('261 000'), 'Le total de l’offre figure dans la liste', 'montant figé')
      check(texte.includes(`PRO-${STAMP}`), 'La référence du fournisseur y figure aussi')

      await page.goto(`${base}/commerce/devis-fournisseurs/${decor.devis}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('main') !== null)
      texte = await mainText(page)
      check(texte.includes('Converti'), 'La fiche de l’offre annonce son état « Converti »')
      check(
        texte.includes('Pièce détachée hors catalogue'),
        '🟩 A-13 : la ligne libre figure sur la fiche'
      )
      check(texte.includes('52 000'), '🟥 La fiche porte le prix FIGÉ de l’offre')
      check(
        !texte.includes('70 000'),
        '🟥 Le coût de référence courant du catalogue n’apparaît nulle part sur l’offre historique'
      )
      check(texte.includes('Commande issue de cette offre'), 'La fiche renvoie à la commande née de l’offre')

      /*
       * 🟥 LA CHARGE UTILE DE LA PAGE NE PORTE AUCUN COÛT DE RÉFÉRENCE.
       *
       * Le HTML rendu par le serveur, et non le seul texte visible : un coût
       * glissé dans une charge utile React serait invisible à l'écran et
       * pourtant transmis au navigateur. L'acheteur n'a pas `cost.view`.
       */
      const html = await page.content()
      const fuites = [
        String(COUT_APRES),
        '70 000',
        'service_variant_costs',
        'resolve_service_cost',
        'referenceCost',
      ].filter((terme) => html.includes(terme))
      check(
        fuites.length === 0,
        '🟥 La charge utile de la page ne porte AUCUN coût de référence',
        fuites.length === 0 ? 'aucun terme du domaine du coût' : fuites.join(', ')
      )

      await page.goto(`${base}/commerce/commandes-fournisseurs/${decor.commande}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.querySelector('main') !== null)
      texte = await mainText(page)
      check(texte.includes('Facturée'), 'La fiche de la commande annonce « Facturée »')
      check(texte.includes('Origine'), 'Elle nomme son origine')

      /* 🟥 LA FACTURE EST BIEN DANS LE MODULE DE FACTURATION EXISTANT. */
      const sessionComptable = await signIn(browser, base, accounts.comptable)
      await sessionComptable.page.goto(`${base}/facturation/fournisseurs`, { waitUntil: 'load' })

      const { data: facture } = await admin
        .from('supplier_invoices')
        .select('invoice_no')
        .eq('id', decor.facture)
        .maybeSingle()

      await sessionComptable.page.waitForFunction(
        (no) => document.body.innerText.includes(no),
        facture.invoice_no,
        { timeout: 60000 }
      )
      const texteFacture = await mainText(sessionComptable.page)
      check(
        texteFacture.includes(facture.invoice_no),
        '🟥 LA FACTURE APPARAÎT DANS LE MODULE FACTURES FOURNISSEURS EXISTANT',
        facture.invoice_no
      )

      await sessionComptable.page.goto(`${base}/facturation/fournisseurs/${decor.facture}`, {
        waitUntil: 'load',
      })
      await sessionComptable.page.waitForFunction(() => document.querySelector('main') !== null)
      const texteFiche = await mainText(sessionComptable.page)
      check(
        texteFiche.includes('Commande d’origine'),
        'La fiche de la facture renvoie à sa commande d’origine'
      )
      await sessionComptable.context.close()

      /* A-14 — l'étanchéité des deux menus. */
      const sessionDevisSeul = await signIn(browser, base, accounts.devisSeul)
      await sessionDevisSeul.page.goto(`${base}/commerce/devis-fournisseurs/${decor.devis}`, {
        waitUntil: 'load',
      })
      await sessionDevisSeul.page.waitForFunction(() => document.querySelector('main') !== null)
      const texteDevisSeul = await mainText(sessionDevisSeul.page)

      check(
        texteDevisSeul.includes('Converti'),
        '🟥 A-14 : qui ne voit que les devis fournisseurs les consulte'
      )
      check(
        texteDevisSeul.includes('ne peut pas consulter les commandes fournisseurs'),
        '🟥 DEC-017 : la fiche DIT que la commande existe sans en communiquer la référence'
      )

      const { data: cmd } = await admin
        .from('purchase_orders')
        .select('order_no')
        .eq('id', decor.commande)
        .maybeSingle()
      check(
        !texteDevisSeul.includes(cmd.order_no),
        'Et la référence de la commande n’y figure pas',
        cmd.order_no
      )
      await sessionDevisSeul.context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('15 — RESPONSIVE\n')

    for (const [largeur, hauteur, nom] of [
      [360, 740, 'mobile'],
      [768, 1024, 'tablette'],
      [1440, 900, 'bureau'],
    ]) {
      const session = await signIn(browser, base, accounts.acheteur, {
        width: largeur,
        height: hauteur,
      })

      try {
        for (const [route, libelle] of [
          [`/commerce/devis-fournisseurs`, 'liste des devis'],
          [`/commerce/devis-fournisseurs/${decor.devis}`, 'fiche de l’offre'],
          [`/commerce/commandes-fournisseurs/${decor.commande}`, 'fiche de la commande'],
        ]) {
          await session.page.goto(`${base}${route}`, { waitUntil: 'load' })
          await session.page.waitForFunction(() => document.querySelector('main') !== null, undefined, {
            timeout: 60000,
          })

          const debordement = await session.page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
          )
          check(!debordement, `Aucun débordement horizontal à ${largeur} px — ${libelle} (${nom})`)
        }

        const texte = await mainText(session.page)
        check(
          texte.includes('261 000'),
          `Le total reste lisible à ${largeur} px`,
          'aucune information perdue au rétrécissement'
        )
      } finally {
        await session.context.close()
      }
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('16 — L’ANNULATION NE CRÉE AUCUNE IMPASSE\n')

    {
      const { error: annuleReglement } = await api.comptable.rpc('cancel_supplier_payment', {
        p_payment_id: decor.reglement,
        p_reason: 'Annulation de recette',
      })
      check(!annuleReglement, 'Le règlement s’annule', annuleReglement?.message ?? '')

      const { error: annuleFacture } = await api.comptable.rpc('cancel_supplier_invoice', {
        p_invoice_id: decor.facture,
        p_reason: 'Annulation de recette',
      })
      check(!annuleFacture, 'La facture s’annule', annuleFacture?.message ?? '')

      const { data: commande, error: cError } = await api.comptable
        .from('purchase_orders')
        .select('status, invoiced_at')
        .eq('id', decor.commande)
        .maybeSingle()

      check(
        !cError && commande?.status === 'CONFIRMED' && commande?.invoiced_at === null,
        '🟥 Facture annulée → la commande revient à « Passée » et se refacture',
        cError ? `requête en erreur : ${cError.message}` : (commande?.status ?? '')
      )

      const { error: annuleCommande } = await api.acheteur.rpc('set_purchase_order_status', {
        p_order_id: decor.commande,
        p_status: 'CANCELLED',
        p_reason: 'Besoin annulé',
      })
      check(!annuleCommande, 'La commande s’annule', annuleCommande?.message ?? '')

      const { data: devis, error: dError } = await api.acheteur
        .from('purchase_quotes')
        .select('status, converted_at')
        .eq('id', decor.devis)
        .maybeSingle()

      check(
        !dError && devis?.status === 'ACCEPTED' && devis?.converted_at === null,
        '🟥 Commande annulée → l’offre revient à « Retenue » et se reconvertit',
        dError ? `requête en erreur : ${dError.message}` : (devis?.status ?? '')
      )

      const { data: prix } = await api.acheteur
        .from('purchase_quote_lines')
        .select('unit_price')
        .eq('purchase_quote_id', decor.devis)
        .eq('service_variant_id', decor.standard)
        .maybeSingle()
      check(
        prix?.unit_price === PRIX_OFFRE,
        '🟥 Après tout ce parcours, le prix de l’offre est TOUJOURS 52 000 KMF',
        `${prix?.unit_price} KMF`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('17 — AUDIT\n')

    {
      const { data: evenements, error } = await admin
        .from('audit_log')
        .select('action, entity_type, module_code')
        .in('entity_type', [
          'purchase_quotes',
          'purchase_orders',
          'purchase_quote_lines',
          'purchase_order_lines',
        ])
        .gte('occurred_at', new Date(Date.now() - 3600_000).toISOString())

      check(
        !error && (evenements ?? []).length > 0,
        'Les actes d’achat sont journalisés',
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

      /*
       * 🟥 LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME (DEC-038). La
       * correspondance est vérifiée en base : elle exige la capacité du MENU,
       * sans quoi l'avant/après d'un événement d'achat livrerait les prix
       * négociés à qui ne peut pas les lire.
       */
      const { data: garde, error: gError } = await admin.rpc('audit_detail_permission', {
        p_entity_type: 'purchase_quotes',
      })
      check(
        !gError && garde === 'commerce.purchase_quotes.view',
        '🟥 Le journal garde l’avant/après d’une offre par SA capacité',
        gError ? `requête en erreur : ${gError.message}` : String(garde)
      )
    }

    for (const client of Object.values(api)) await client.auth.signOut()
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
        .from('suppliers')
        .select('id', { count: 'exact', head: true })
        .like('legal_name', 'RECETTE ACH%')

      if (error) throw new Error(`relevé des résidus : ${error.message}`)

      restes = count ?? 0
      if (restes === 0) break

      console.log(
        `${DIM}Résidus après le passage ${passage} : ${restes} fournisseur(s). Nouveau balayage.${RESET}`
      )
    }

    check(restes === 0, 'Aucun résidu de recette — fournisseurs', `${restes}`)

    for (const [table, colonne, valeur, libelle] of [
      ['purchase_quotes', 'notes', NOTE, 'devis fournisseurs'],
      ['purchase_orders', 'notes', NOTE, 'commandes fournisseurs'],
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
  const { data: fournisseurs } = await admin
    .from('suppliers')
    .select('id')
    .like('legal_name', 'RECETTE ACH%')
  const supplierIds = (fournisseurs ?? []).map((row) => row.id)

  if (supplierIds.length > 0) {
    const invoiceIds = await idsOf(admin, 'supplier_invoices', 'supplier_id', supplierIds)

    // Les écritures AVANT les règlements : elles les désignent.
    const paymentIds = await idsOf(admin, 'supplier_payments', 'supplier_invoice_id', invoiceIds)
    if (paymentIds.length > 0) {
      await admin.from('treasury_entries').delete().in('supplier_payment_id', paymentIds)
      await admin.from('supplier_payments').delete().in('id', paymentIds)
    }

    if (invoiceIds.length > 0) {
      await admin.from('supplier_invoice_lines').delete().in('supplier_invoice_id', invoiceIds)
      await admin.from('supplier_invoices').delete().in('id', invoiceIds)
    }

    // Les lignes de commande AVANT celles de l'offre, qu'elles désignent.
    const orderIds = await idsOf(admin, 'purchase_orders', 'supplier_id', supplierIds)
    if (orderIds.length > 0) {
      await admin.from('purchase_order_lines').delete().in('purchase_order_id', orderIds)
      await admin.from('purchase_orders').delete().in('id', orderIds)
    }

    const quoteIds = await idsOf(admin, 'purchase_quotes', 'supplier_id', supplierIds)
    if (quoteIds.length > 0) {
      await admin.from('purchase_quote_lines').delete().in('purchase_quote_id', quoteIds)
      await admin.from('purchase_quotes').delete().in('id', quoteIds)
    }

    await admin.from('suppliers').delete().in('id', supplierIds)
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

  await admin.from('service_categories').delete().like('label', 'RECETTE ACH%')
  await admin.from('financial_accounts').delete().eq('description', NOTE)

  const { data: comptes } = await admin
    .from('app_users')
    .select('id')
    .like('username', 'recette.ach.%')

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
