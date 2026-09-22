#!/usr/bin/env node
/**
 * Recette Relevé global de location — LOT 24, DEC-048.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES TESTS UNITAIRES NE PEUVENT PAS ÉPROUVER
 *
 * `document.test.ts` rend le modèle PDF dans tous ses états et éprouve
 * l'arithmétique de la synthèse. Il ne peut pas prouver que LA LECTURE EST
 * RÉELLEMENT FERMÉE en production, ni qu'un exploitant obtient le document par
 * l'écran, ni — surtout — que LE PRODUIRE NE CHANGE RIEN.
 *
 * C'est ce que celle-ci fait, avec de VRAIES SESSIONS — jeton Supabase, cookie
 * applicatif, appels PostgREST directs, documents PDF :
 *
 *   1. 🟩 A-6 : le relevé existe, et l'écran DIT que ce n'est pas une facture.
 *   2. 🟥 LE TEST CENTRAL : une photographie financière AVANT, un aperçu, un
 *      téléchargement, une impression, une photographie APRÈS. Rien n'a bougé.
 *   3. LE CONTENU : chronologie à deux véhicules, avenants, périodes
 *      facturables, plusieurs factures, plusieurs règlements.
 *   4. LA SYNTHÈSE : facturé, réglé, solde — brouillon écarté, annulée écartée,
 *      règlement annulé écarté, aucun double comptage.
 *   5. 🟥 CONFIDENTIALITÉ : aucun coût fournisseur, par la page, la charge
 *      utile, l'appel direct et le PDF.
 *   6. 🟥 LE RELEVÉ N'EST PAS UNE PORTE DÉROBÉE : un profil qui voit la
 *      location sans voir les factures ni les règlements n'obtient NI l'une NI
 *      les autres par le document.
 *   7. Les trois capacités documentaires, éprouvées séparément (DEC-024).
 *   8. La durée fixée, le responsive, aucun résidu, catalogue conforme.
 *
 * Utilisation :
 *   node scripts/verify-statement.mjs [url]
 *
 * NE JAMAIS piper la sortie vers `head` : SIGPIPE tuerait le processus avant son
 * nettoyage, et laisserait des comptes et des véhicules de recette en base.
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required, dayOffset } from './lib/env.mjs'
import { checkCatalogue } from './lib/capabilities.mjs'
import { demoFootprint } from './lib/demo.mjs'
import { purgeRentalHistory } from './lib/rentals.mjs'

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
const MARK = `RECETTE REL ${STAMP}`
const NOTE = 'RECETTE REL'

/* Les montants du scénario, écrits une fois et confrontés à la fin. */
const PRIX_A = 50_000
const PRIX_B = 60_000
const COUT_A = 41_000
const COUT_B = 46_000

const F1 = 300_000 // période 1 — émise, intégralement réglée
const F2 = 500_000 // période 2 — émise, partiellement réglée
const F3 = 400_000 // période 3 — émise, non réglée
const F4 = 700_000 // période 4 — BROUILLON, jamais compté
const F5 = 900_000 // période 4 — émise puis ANNULÉE, jamais comptée

const REG1 = 300_000 // solde F1
const REG2 = 200_000 // acompte sur F2
const REG3 = 50_000 // sur F2, puis ANNULÉ — jamais compté

const FACTURE_ATTENDUE = F1 + F2 + F3 // 1 200 000
const REGLE_ATTENDU = REG1 + REG2 // 500 000
const SOLDE_ATTENDU = FACTURE_ATTENDUE - REGLE_ATTENDU // 700 000

const BASE = ['dashboard.view']

const PROFILES = {
  /*
   * LE LECTEUR DU RELEVÉ — celui qui peut tout voir de ce contrat.
   *
   * C'est le profil pour lequel le document est complet : contrat, chronologie,
   * avenants, périodes, factures, règlements, synthèse. Il n'a PAS
   * `rental.pricing.supplier.view` : le coût fournisseur ne doit pas lui
   * parvenir, et c'est déjà vrai de ce profil-là.
   */
  releve: [
    ...BASE,
    'rental.fleet.view',
    'rental.rentals.view',
    'rental.rentals.financial.view',
    'rental.rentals.download',
    'rental.rentals.print',
    'parties.clients.view',
    'billing.customer_invoices.view',
    'billing.customer_payments.view',
  ],

  /*
   * 🟥 L'EXPLOITATION — LE PROFIL DE LA PORTE DÉROBÉE.
   *
   * Elle conduit le cycle et produit les documents du contrat. Elle n'a NI
   * `billing.customer_invoices.view`, NI `billing.customer_payments.view` :
   * suivre une location n'est pas consulter sa facturation (DEC-024).
   *
   * Le relevé AGRÈGE ces domaines. S'il les lui livrait, il aurait ouvert par
   * un document ce que deux capacités ferment — et le fichier circulerait hors
   * du système. C'est le contrôle le plus important du lot.
   */
  exploitation: [
    ...BASE,
    'rental.fleet.view',
    'rental.rentals.view',
    'rental.rentals.financial.view',
    'rental.rentals.download',
    'rental.rentals.print',
    'parties.clients.view',
  ],

  /*
   * Elle voit les factures, PAS les règlements — DEC-024, le cas intermédiaire.
   *
   * Le relevé doit alors porter le total FACTURÉ et se taire sur le réglé et le
   * solde : afficher zéro ferait passer un contrat à moitié réglé pour
   * entièrement impayé (DEC-017).
   */
  sansReglement: [
    ...BASE,
    'rental.fleet.view',
    'rental.rentals.view',
    'rental.rentals.financial.view',
    'rental.rentals.download',
    'rental.rentals.print',
    'parties.clients.view',
    'billing.customer_invoices.view',
  ],

  /*
   * 🟥 CELLE QUI A LE DROIT DE LIRE LE COÛT — et qui ne le verra pas non plus.
   *
   * Elle détient `rental.pricing.supplier.view` EN PLUS de tout ce que porte le
   * profil `releve`. C'est le seul profil capable de prouver la barrière du
   * Plan 02 §6.4 : le relevé ne compose pas le coût, MÊME pour un demandeur
   * qui a le droit de le lire.
   *
   * Sans elle, la confidentialité n'aurait été éprouvée que sur des profils
   * incapables de lire le coût de toute façon — ce qui ne prouve rien du
   * document, seulement de RLS.
   */
  avecCout: [
    ...BASE,
    'rental.fleet.view',
    'rental.rentals.view',
    'rental.rentals.financial.view',
    'rental.rentals.download',
    'rental.rentals.print',
    'parties.clients.view',
    'billing.customer_invoices.view',
    'billing.customer_payments.view',
    'rental.pricing.supplier.view',
  ],

  /*
   * Elle CONSULTE la location, et rien de plus — DEC-024.
   *
   * Ni `download`, ni `print` : « voir » n'a jamais inclus « produire un
   * document ». La route doit refuser les trois modes, y compris appelée
   * directement.
   */
  lecteur: [
    ...BASE,
    'rental.fleet.view',
    'rental.rentals.view',
    'rental.rentals.financial.view',
    'parties.clients.view',
    'billing.customer_invoices.view',
    'billing.customer_payments.view',
  ],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.rel.${key}.${STAMP}`
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
    last_name: `Rel ${key}`,
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

/* -------------------------------------------------------------------------- */
/*  🟥 LA PHOTOGRAPHIE FINANCIÈRE — le cœur du lot                             */
/* -------------------------------------------------------------------------- */

/**
 * Tout ce qu'un relevé pourrait modifier s'il était une facture.
 *
 * Prise AVANT, reprise APRÈS, comparée terme à terme. Le relevé est un document
 * de synthèse : le produire ne doit créer aucune facture, aucune ligne, aucun
 * règlement, aucun mouvement de trésorerie, et ne doit modifier ni un statut,
 * ni une période facturable, ni un segment, ni un avenant.
 *
 * ELLE COMPTE ET ELLE SOMME. Un décompte seul laisserait passer une écriture
 * qui en remplacerait une autre, ou un montant modifié sur place. La somme le
 * voit ; les statuts, relevés un à un, le voient aussi.
 *
 * Portée par la clé de service : la photographie doit voir TOUT ce qui existe,
 * y compris ce qu'une session ne verrait pas. Un relevé qui créerait une ligne
 * invisible à son auteur resterait une ligne créée.
 */
async function photographie(admin, decor) {
  const rentalIds = [decor.longue.id, decor.fixe.id]

  const { data: factures } = await admin
    .from('customer_invoices')
    .select('id, invoice_no, status, billing_period_id, invoice_date, due_date')
    .in('rental_id', rentalIds)
    .order('invoice_no')

  const invoiceIds = (factures ?? []).map((row) => row.id)
  const sur = (ids) => (ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'])

  const { data: lignes } = await admin
    .from('customer_invoice_lines')
    .select('id, customer_invoice_id, kind, quantity, unit_price, is_archived')
    .in('customer_invoice_id', sur(invoiceIds))
    .order('id')

  const { data: reglements } = await admin
    .from('customer_payments')
    .select('id, payment_no, amount, status, customer_invoice_id')
    .in('customer_invoice_id', sur(invoiceIds))
    .order('payment_no')

  const { data: ecritures } = await admin
    .from('treasury_entries')
    .select('id, amount, direction, customer_payment_id')
    .in('customer_payment_id', sur((reglements ?? []).map((row) => row.id)))
    .order('id')

  const { data: periodes } = await admin
    .from('rental_billing_periods')
    .select('id, sequence_no, status, origin, period')
    .in('rental_id', rentalIds)
    .order('sequence_no')

  const { data: segments } = await admin
    .from('rental_segments')
    .select('id, sequence_no, status, locked_amount, locked_unit, vehicle_id')
    .in('rental_id', rentalIds)
    .order('sequence_no')

  const { data: avenants } = await admin
    .from('rental_amendments')
    .select('id, amendment_no, kind, effective_at, reason')
    .in('rental_id', rentalIds)
    .order('amendment_no')

  const { data: contrats } = await admin
    .from('rentals')
    .select('id, status, rental_type, billing_cadence, locked_amount, expected_return_at')
    .in('id', rentalIds)
    .order('id')

  const { data: couts } = await admin
    .from('rental_segment_costs')
    .select('segment_id, locked_cost_amount')
    .in('rental_id', rentalIds)
    .order('segment_id')

  return {
    /* Les décomptes, lisibles d'un coup d'œil dans un message d'échec. */
    nbFactures: (factures ?? []).length,
    nbLignes: (lignes ?? []).length,
    nbReglements: (reglements ?? []).length,
    nbEcritures: (ecritures ?? []).length,
    nbPeriodes: (periodes ?? []).length,
    nbSegments: (segments ?? []).length,
    nbAvenants: (avenants ?? []).length,

    /* Les sommes : elles voient ce qu'un décompte ne voit pas. */
    sommeFacturee: (lignes ?? []).reduce(
      (total, l) => total + (l.is_archived ? 0 : (l.kind === 'DISCOUNT' ? -1 : 1) * l.quantity * l.unit_price),
      0
    ),
    sommeReglee: (reglements ?? [])
      .filter((r) => r.status === 'VALIDATED')
      .reduce((total, r) => total + r.amount, 0),
    sommeTresorerie: (ecritures ?? []).reduce((total, e) => total + e.amount, 0),

    /* L'état exact de chaque objet, terme à terme. */
    etat: JSON.stringify({ factures, lignes, reglements, ecritures, periodes, segments, avenants, contrats, couts }),
  }
}

/** Ce qui a changé entre deux photographies, nommé. */
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

  const { count: strays } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .like('brand', 'RECETTE REL%')

  if (strays > 0) {
    console.log(
      `${DIM}${strays} véhicule(s) d’un passage antérieur détecté(s) : nettoyage préalable.${RESET}`
    )
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

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — LE DÉCOR : UN CONTRAT QUI A UNE HISTOIRE\n')

    {
      const { data: categorie, error: catError } = await admin
        .from('vehicle_categories')
        .insert({ code: `RREL${STAMP}`, label: `${MARK} — Catégorie` })
        .select('id')
        .single()
      if (catError) throw new Error(`catégorie : ${catError.message}`)
      decor.categorie = categorie.id

      const { data: supplierNo } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
      const { data: fournisseur, error: supError } = await admin
        .from('suppliers')
        .insert({
          supplier_no: supplierNo,
          type: 'VEHICLE_SUPPLIER',
          legal_name: `${MARK} — Fournisseur`,
          phone: '+269 980',
          status: 'ACTIVE',
        })
        .select('id')
        .single()
      if (supError) throw new Error(`fournisseur : ${supError.message}`)
      decor.fournisseur = fournisseur.id

      const { data: clientNo } = await admin.rpc('next_number', { p_entity_key: 'client' })
      const { data: client, error: cliError } = await admin
        .from('clients')
        .insert({
          client_no: clientNo,
          type: 'COMPANY',
          legal_name: `${MARK} — Client`,
          phone: '+269 981',
          city: 'Moroni',
          country: 'Comores',
          status: 'ACTIVE',
        })
        .select('id')
        .single()
      if (cliError) throw new Error(`client : ${cliError.message}`)
      decor.client = client.id

      /*
       * DEUX VÉHICULES FOURNIS, TOUS DEUX PORTANT UN COÛT CONFIDENTIEL.
       *
       * Le coût ne sert ici qu'à une chose : prouver que le relevé ne le porte
       * pas. Le document n'a aucune raison de le connaître — et le profil qui
       * le produit n'a même pas le droit de le lire.
       */
      decor.vehicules = {}

      /*
       * TROIS VÉHICULES, ET NON DEUX.
       *
       * A et B servent la chronologie du contrat de longue durée : A jusqu'au
       * remplacement, B ensuite — et B lui reste affecté jusqu'à la fin de la
       * prolongation. Le contrat à durée fixée en exige donc un TROISIÈME : un
       * véhicule ne peut pas être affecté à deux engagements qui se
       * chevauchent, et la base le refuse — à juste titre.
       */
      for (const item of [
        { key: 'a', model: 'REL-A', prix: PRIX_A, cout: COUT_A },
        { key: 'b', model: 'REL-B', prix: PRIX_B, cout: COUT_B },
        { key: 'c', model: 'REL-C', prix: PRIX_B, cout: COUT_B },
      ]) {
        const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
        const { data: vehicle, error: vehError } = await admin
          .from('vehicles')
          .insert({
            vehicle_no: vehicleNo,
            category_id: decor.categorie,
            brand: MARK,
            model: item.model,
            plate: `REL-${STAMP}-${item.key.toUpperCase()}`,
            origin: 'SUPPLIED',
            current_supplier_id: decor.fournisseur,
            status: 'AVAILABLE',
            entry_date: dayOffset(-400),
          })
          .select('id')
          .single()
        if (vehError) throw new Error(`véhicule ${item.key} : ${vehError.message}`)

        decor.vehicules[item.key] = vehicle.id

        await admin.from('vehicle_supplier_history').insert({
          vehicle_id: vehicle.id,
          supplier_id: decor.fournisseur,
          started_on: dayOffset(-400),
        })

        const { error: ruleError } = await admin.from('pricing_rules').insert({
          vehicle_id: vehicle.id,
          amount: item.prix,
          unit: 'DAY',
          valid_from: dayOffset(-400),
          is_active: true,
          conditions: `${MARK} — tarif de recette`,
        })
        if (ruleError) throw new Error(`tarif ${item.key} : ${ruleError.message}`)

        const { error: costError } = await admin.rpc('set_supplier_vehicle_rate', {
          p_vehicle_id: vehicle.id,
          p_supplier_id: decor.fournisseur,
          p_amount: item.cout,
          p_unit: 'DAY',
          p_valid_from: dayOffset(-400),
          p_conditions: `${MARK} — coût de recette`,
          p_reason: 'Décor de recette',
        })
        if (costError) throw new Error(`coût ${item.key} : ${costError.message}`)
      }

      check(Object.keys(decor.vehicules).length === 3, 'Trois véhicules fournis, avec leur coût')

      /* LE CONTRAT DE LONGUE DURÉE : J-100 → J-5, parti, véhicule A. */
      decor.longue = await creerLocation(admin, decor, {
        vehicule: decor.vehicules.a,
        du: -100,
        au: -5,
        depart: -100,
      })
      check(Boolean(decor.longue.id), 'Contrat de longue durée créé', decor.longue.no)

      /* LE CONTRAT À DURÉE FIXÉE : J-40 → J-30, parti, véhicule C. */
      decor.fixe = await creerLocation(admin, decor, {
        vehicule: decor.vehicules.c,
        du: -40,
        au: -30,
        depart: -40,
      })
      check(Boolean(decor.fixe.id), 'Contrat à durée fixée créé', decor.fixe.no)

      /*
       * LE CONTRAT À DURÉE FIXÉE VA JUSQU'À « À FACTURER ».
       *
       * Workflow 07 §5 : seule une location « À facturer » se facture. Le
       * retour la laisse « À contrôler » ; le contrôle la fait passer à « À
       * facturer » — c'est exactement ce que fait l'écran de contrôle, par une
       * mise à jour de statut (`rentals/actions.ts`). Sans ces deux gestes, la
       * base refuse sa facture, et c'est elle qui a raison.
       */
      const { error: retourError } = await admin.rpc('return_rental', {
        p_rental_id: decor.fixe.id,
        p_returned_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
        p_mileage: 10_800,
        p_fuel_level: 'FULL',
      })
      if (retourError) throw new Error(`retour : ${retourError.message}`)

      const { error: controleError } = await admin
        .from('rentals')
        .update({
          status: 'TO_INVOICE',
          status_reason: 'Contrôle de retour satisfaisant — recette.',
          status_changed_at: new Date().toISOString(),
        })
        .eq('id', decor.fixe.id)
        .eq('status', 'TO_CONTROL')
      if (controleError) throw new Error(`contrôle : ${controleError.message}`)

      check(true, 'Le contrat à durée fixée est rendu, contrôlé, et à facturer')

      /*
       * L'AVENANT DE REMPLACEMENT — LOT 22, A-4.
       *
       * Véhicule A jusqu'à J-60, véhicule B ensuite, AU TARIF DU NOUVEAU
       * VÉHICULE. Le contrat garde son numéro ; sa chronologie porte alors deux
       * véhicules et deux tarifs — exactement l'exemple de la consigne §8.
       */
      const { data: avenantSwap, error: swapError } = await admin.rpc('replace_rental_vehicle', {
        p_rental_id: decor.longue.id,
        p_new_vehicle_id: decor.vehicules.b,
        p_effective_at: new Date(Date.now() - 60 * 86400_000).toISOString(),
        p_reason: 'Panne immobilisante du véhicule initial — recette',
        p_amount: null,
        p_unit: null,
        p_rate_reason: null,
        p_notes: NOTE,
      })
      if (swapError) throw new Error(`remplacement : ${swapError.message}`)
      decor.avenantSwap = avenantSwap

      check(Boolean(avenantSwap), 'Avenant de remplacement de véhicule posé')

      /* LE RÉGIME MENSUEL, et le découpage qu'il ouvre — LOT 23, A-6. */
      const { error: planError } = await admin.rpc('set_rental_billing_plan', {
        p_rental_id: decor.longue.id,
        p_type: 'LONG_TERM',
        p_cadence: 'MONTHLY',
      })
      if (planError) throw new Error(`régime : ${planError.message}`)

      /*
       * L'AVENANT DE PROLONGATION, AVEC UN TARIF FORCÉ — LOT 23, A-5.
       *
       * Le temps ajouté part à un tarif convenu, différent du barème. Le relevé
       * doit raconter ce changement sans jamais le recalculer.
       */
      const { data: avenantExt, error: extError } = await admin.rpc('extend_rental', {
        p_rental_id: decor.longue.id,
        p_new_end: new Date(Date.now() + 5 * 86400_000).toISOString(),
        p_reason: 'Prolongation demandée par le client — recette',
        p_amount: 65_000,
        p_unit: 'DAY',
        p_rate_reason: 'Tarif convenu pour la prolongation — recette',
        p_notes: NOTE,
      })
      if (extError) throw new Error(`prolongation : ${extError.message}`)
      decor.avenantExt = avenantExt

      check(Boolean(avenantExt), 'Avenant de prolongation posé, au tarif convenu')

      const { data: periodes } = await admin
        .from('rental_billing_periods')
        .select('id, sequence_no, status')
        .eq('rental_id', decor.longue.id)
        .eq('status', 'PLANNED')
        .order('sequence_no')

      decor.periodes = periodes ?? []

      check(
        decor.periodes.length >= 4,
        'Le contrat porte au moins quatre périodes facturables',
        `${decor.periodes.length} périodes`
      )

      const { data: segments } = await admin
        .from('rental_segments')
        .select('id, sequence_no, vehicle_id, locked_amount')
        .eq('rental_id', decor.longue.id)
        .order('sequence_no')

      check(
        (segments ?? []).length >= 3,
        'La chronologie porte plusieurs segments — deux véhicules, trois tarifs',
        `${(segments ?? []).length} segments`
      )

      check(
        new Set((segments ?? []).map((s) => s.vehicle_id)).size === 2,
        'Deux véhicules distincts figurent dans la chronologie'
      )

      check(
        new Set((segments ?? []).map((s) => s.locked_amount)).size >= 2,
        'Le tarif a changé au fil du contrat, et l’histoire le conserve'
      )

      /*
       * UNE PÉRIODE QUI TRAVERSE DEUX SEGMENTS — consigne §21, contrôle 20.
       *
       * Le découpage de la CRÉANCE et celui de l'EXPLOITATION ne coïncident
       * pas : c'est précisément ce que le relevé doit rendre lisible en les
       * présentant séparément plutôt qu'en les fondant.
       */
      /*
       * ⚠ LE DÉCALAGE HORAIRE TIENT SUR DEUX CHIFFRES.
       *
       * PostgREST rend `["2026-07-24 19:36:00+00","…")`. Une fois l'espace
       * remplacé par « T », `+00` n'est pas une forme que JavaScript reconnaît :
       * `Date.parse` rend `NaN`, toute intersection devient fausse, et le
       * contrôle échoue en accusant le découpage. Même normalisation que la
       * couche de données du SaaS.
       */
      const bornes = (valeur) => {
        const m = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(valeur ?? '')
        if (!m) return [NaN, NaN]
        const iso = (brut) => Date.parse(brut.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
        return [iso(m[1]), iso(m[2])]
      }

      const { data: periodesCompletes } = await admin
        .from('rental_billing_periods')
        .select('id, sequence_no, period')
        .eq('rental_id', decor.longue.id)
        .order('sequence_no')

      const { data: segmentsComplets } = await admin
        .from('rental_segments')
        .select('id, period, status')
        .eq('rental_id', decor.longue.id)

      const traversees = (periodesCompletes ?? []).filter((p) => {
        const [pd, pf] = bornes(p.period)
        if (Number.isNaN(pd) || Number.isNaN(pf)) return false
        return (
          (segmentsComplets ?? []).filter((s) => {
            if (s.status === 'CANCELLED') return false
            const [sd, sf] = bornes(s.period)
            if (Number.isNaN(sd) || Number.isNaN(sf)) return false
            return Math.max(pd, sd) < Math.min(pf, sf)
          }).length > 1
        )
      })

      check(
        traversees.length > 0,
        'Au moins une période facturable traverse PLUSIEURS segments',
        `période n° ${traversees[0]?.sequence_no}`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LES FACTURES ET LES RÈGLEMENTS DU CONTRAT\n')

    {
      decor.factures = {}

      const facturer = async ({ cle, periodeIndex, montant, emettre, annuler }) => {
        const periode = periodeIndex === null ? null : decor.periodes[periodeIndex]

        const { data: id, error } = await admin.rpc('create_customer_invoice', {
          p_client_id: decor.client,
          p_invoice_date: dayOffset(-20),
          p_due_date: dayOffset(10),
          p_rental_id: decor.longue.id,
          p_notes: `${NOTE} ${cle}`,
          p_billing_period_id: periode?.id ?? null,
        })
        if (error) throw new Error(`facture ${cle} : ${error.message}`)

        const { error: ligneError } = await admin.rpc('add_customer_invoice_line', {
          p_invoice_id: id,
          p_kind: 'RENTAL',
          p_label: `Location — période de recette ${cle}`,
          p_quantity: 1,
          p_unit_price: montant,
          p_justification: null,
        })
        if (ligneError) throw new Error(`ligne ${cle} : ${ligneError.message}`)

        if (emettre) {
          const { error: emissionError } = await admin.rpc('issue_customer_invoice', {
            p_invoice_id: id,
            p_reason: 'Émission de recette.',
          })
          if (emissionError) throw new Error(`émission ${cle} : ${emissionError.message}`)
        }

        if (annuler) {
          const { error: annulationError } = await admin.rpc('cancel_customer_invoice', {
            p_invoice_id: id,
            p_reason: 'Annulation de recette.',
          })
          if (annulationError) throw new Error(`annulation ${cle} : ${annulationError.message}`)
        }

        decor.factures[cle] = id
        return id
      }

      await facturer({ cle: 'F1', periodeIndex: 0, montant: F1, emettre: true })
      await facturer({ cle: 'F2', periodeIndex: 1, montant: F2, emettre: true })
      await facturer({ cle: 'F3', periodeIndex: 2, montant: F3, emettre: true })

      /*
       * F5 : ÉMISE PUIS ANNULÉE. Elle libère sa période, sur laquelle F4
       * pourra naître — et elle ne compte plus pour rien. Une facture annulée
       * dans un total facturé est exactement la faute que ce lot doit écarter.
       */
      await facturer({ cle: 'F5', periodeIndex: 3, montant: F5, emettre: true, annuler: true })

      /* F4 : BROUILLON. Aucune créance n'est reconnue tant qu'elle n'est pas émise. */
      await facturer({ cle: 'F4', periodeIndex: 3, montant: F4, emettre: false })

      check(Object.keys(decor.factures).length === 5, 'Cinq factures posées sur le contrat')

      /* Le compte d'encaissement — un compte de recette, jamais un compte réel. */
      const { data: compteNo } = await admin.rpc('next_number', { p_entity_key: 'account' })
      const { data: compte, error: compteError } = await admin
        .from('financial_accounts')
        .insert({
          account_no: compteNo,
          kind: 'BANK',
          label: `${MARK} — Compte`,
          // `currency_code` porte son défaut « KMF » : la nommer ici
          // n'ajouterait rien, et la nommer MAL casse la recette.
          opening_balance: 0,
          status: 'ACTIVE',
        })
        .select('id')
        .single()
      if (compteError) throw new Error(`compte : ${compteError.message}`)
      decor.compte = compte.id

      const regler = async (facture, montant, methode, ref) => {
        const { data: id, error } = await admin.rpc('record_customer_payment', {
          p_invoice_id: decor.factures[facture],
          p_account_id: decor.compte,
          p_amount: montant,
          p_received_on: dayOffset(-10),
          p_method: methode,
          p_external_ref: ref,
          p_notes: NOTE,
        })
        if (error) throw new Error(`règlement ${facture} : ${error.message}`)
        return id
      }

      await regler('F1', REG1, 'BANK_TRANSFER', `REL-${STAMP}-1`)
      await regler('F2', REG2, 'CASH', null)

      /* Un règlement ANNULÉ : montré au relevé, jamais compté dans le solde. */
      const annule = await regler('F2', REG3, 'CHEQUE', `REL-${STAMP}-3`)
      const { error: annulError } = await admin.rpc('cancel_customer_payment', {
        p_payment_id: annule,
        p_reason: 'Chèque sans provision — recette.',
      })
      if (annulError) throw new Error(`annulation du règlement : ${annulError.message}`)

      check(true, 'Trois règlements posés, dont un annulé')

      /* LA FACTURE DU CONTRAT À DURÉE FIXÉE — le second régime. */
      const { data: fixeId, error: fixeError } = await admin.rpc('create_customer_invoice', {
        p_client_id: decor.client,
        p_invoice_date: dayOffset(-25),
        p_due_date: dayOffset(5),
        p_rental_id: decor.fixe.id,
        p_notes: `${NOTE} FIXE`,
        p_billing_period_id: null,
      })
      if (fixeError) throw new Error(`facture fixe : ${fixeError.message}`)

      await admin.rpc('add_customer_invoice_line', {
        p_invoice_id: fixeId,
        p_kind: 'RENTAL',
        p_label: 'Location — contrat à durée fixée de recette',
        p_quantity: 10,
        p_unit_price: PRIX_B,
        p_justification: null,
      })
      await admin.rpc('issue_customer_invoice', {
        p_invoice_id: fixeId,
        p_reason: 'Émission de recette.',
      })
      decor.factureFixe = fixeId

      check(Boolean(fixeId), 'Le contrat à durée fixée porte sa facture unique')
    }

    const fiche = (id) => `/location/locations/${id}`
    const releve = (id) => `/api/documents/releves/${id}`

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — 🟩 A-6 : LE RELEVÉ EXISTE, ET L’ÉCRAN DIT CE QU’IL EST\n')

    {
      const { context, page } = await signIn(browser, base, accounts.releve)
      await page.goto(`${base}${fiche(decor.longue.id)}`, { waitUntil: 'load' })

      const texte = await mainText(page)

      check(texte.includes('Relevé de location'), 'La fiche de location propose le relevé')
      check(
        /récapitule les factures et les règlements/i.test(texte),
        'L’écran dit que le relevé RÉCAPITULE'
      )
      check(
        /ne crée aucune facture ni aucune créance nouvelle/i.test(texte),
        '🟥 L’écran dit qu’il NE CRÉE AUCUNE FACTURE',
      )
      check(
        !/nouvelle facture globale|facture globale à établir/i.test(texte),
        'Aucun écran ne propose d’établir une « facture globale »'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — 🟥 LE TEST CENTRAL : LE RELEVÉ EST SANS EFFET\n')

    {
      const avant = await photographie(admin, decor)

      check(
        avant.nbFactures === 6 && avant.nbReglements === 3,
        'Photographie AVANT : six factures, trois règlements',
        `${avant.nbFactures} factures · ${avant.nbLignes} lignes · ${avant.nbReglements} règlements · ${avant.nbEcritures} écritures`
      )

      /* L'APERÇU, par l'écran — le chemin réel de l'utilisateur. */
      const { context, page } = await signIn(browser, base, accounts.releve)
      await page.goto(`${base}${fiche(decor.longue.id)}`, { waitUntil: 'load' })

      /*
       * ⚠ ON ATTEND L'ÉTAT, PAS LE CHARGEMENT.
       *
       * `waitUntil: 'load'` dit que le document est arrivé, non que la carte
       * « Documents » est rendue. Compter les boutons à cet instant rend zéro,
       * et le contrôle échoue en accusant une barre absente qui paraîtra une
       * fraction de seconde plus tard.
       */
      await page.waitForFunction(
        () => document.querySelector('main')?.innerText.includes('Relevé de location') ?? false,
        undefined,
        { timeout: 30000 }
      )

      // Le relevé est la DERNIÈRE pièce de la carte « Documents » : le dernier
      // bouton « Aperçu » de la page est le sien.
      const apercus = page.getByRole('button', { name: /Aperçu/ })
      const nb = await apercus.count()
      check(nb > 0, 'La barre documentaire du relevé est présente', `${nb} boutons d’aperçu`)

      if (nb > 0) {
        await apercus.nth(nb - 1).click()
        await page.waitForSelector('iframe[title*="Aperçu"]', { timeout: 30000 })
        // L'aperçu charge le document : on attend que le cadre ait réellement
        // demandé quelque chose, plutôt qu'un délai arbitraire.
        await page.waitForTimeout(4000)
        check(true, 'L’aperçu du relevé s’ouvre dans l’application')
      }

      await context.close()

      /* LE TÉLÉCHARGEMENT ET L'IMPRESSION, par la route — les deux autres modes. */
      const telechargement = await fetchAs(
        base,
        accounts.releve,
        url,
        anonKey,
        `${releve(decor.longue.id)}?mode=download`
      )
      check(telechargement.status === 200, 'Le relevé se télécharge', `HTTP ${telechargement.status}`)

      const impression = await fetchAs(
        base,
        accounts.releve,
        url,
        anonKey,
        `${releve(decor.longue.id)}?mode=print`
      )
      check(impression.status === 200, 'Le relevé s’imprime', `HTTP ${impression.status}`)

      const apercu = await fetchAs(
        base,
        accounts.releve,
        url,
        anonKey,
        `${releve(decor.longue.id)}?mode=preview`
      )
      check(apercu.status === 200, 'Le relevé s’aperçoit', `HTTP ${apercu.status}`)

      /* ET MAINTENANT : RIEN N'A BOUGÉ. */
      const apres = await photographie(admin, decor)
      const differences = ecarts(avant, apres)

      check(
        differences.length === 0,
        '🟥 GÉNÉRER LE RELEVÉ N’A CRÉÉ NI MODIFIÉ AUCUNE DONNÉE FINANCIÈRE',
        differences.length === 0
          ? 'factures, lignes, règlements, trésorerie, périodes, segments, avenants : identiques'
          : differences.join(' · ')
      )

      check(
        avant.nbFactures === apres.nbFactures,
        'Aucune facture n’a été créée par le relevé',
        `${avant.nbFactures} → ${apres.nbFactures}`
      )
      check(
        avant.nbLignes === apres.nbLignes,
        'Aucune ligne de facture n’a été créée par le relevé'
      )
      check(
        avant.nbReglements === apres.nbReglements,
        'Aucun règlement n’a été créé par le relevé'
      )
      check(
        avant.nbEcritures === apres.nbEcritures && avant.sommeTresorerie === apres.sommeTresorerie,
        '🟥 Aucun mouvement de trésorerie n’a été produit par le relevé',
        `${avant.sommeTresorerie} → ${apres.sommeTresorerie} KMF`
      )
      check(
        avant.sommeFacturee === apres.sommeFacturee && avant.sommeReglee === apres.sommeReglee,
        '🟥 Aucun solde n’a été modifié par le relevé',
        `facturé ${apres.sommeFacturee} · réglé ${apres.sommeReglee}`
      )
      check(
        avant.nbPeriodes === apres.nbPeriodes,
        'Aucune période facturable n’a été touchée par le relevé'
      )
      check(
        avant.nbSegments === apres.nbSegments && avant.nbAvenants === apres.nbAvenants,
        'Ni segment ni avenant n’a été touché par le relevé'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — LA SYNTHÈSE FINANCIÈRE : CE QUI COMPTE, ET CE QUI NE COMPTE PAS\n')

    {
      /*
       * LES SOURCES, LUES PAR LA SESSION QUI PRODUIT LE RELEVÉ.
       *
       * Le relevé n'a pas de source à lui : il additionne ce que les factures
       * et les règlements portent déjà. Éprouver ces sources avec la session
       * réelle prouve que ce que le document additionne est bien ce que la base
       * reconnaît — l'arithmétique, elle, est éprouvée par `document.test.ts`.
       */
      const session = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await session.auth.signInWithPassword({
        email: accounts.releve.email,
        password: accounts.releve.password,
      })

      const { data: factures } = await session
        .from('customer_invoices')
        .select('id, invoice_no, status, billing_period_id')
        .eq('rental_id', decor.longue.id)

      const vivantes = (factures ?? []).filter((f) => f.status !== 'CANCELLED')
      const emises = vivantes.filter((f) => f.status === 'ISSUED')
      const brouillons = vivantes.filter((f) => f.status === 'DRAFT')

      check(
        (factures ?? []).length === 5,
        'Le contrat porte cinq factures, annulée comprise',
        `${(factures ?? []).length}`
      )
      check(vivantes.length === 4, 'Quatre factures vivantes : l’annulée est écartée')
      check(emises.length === 3, 'Trois factures ÉMISES reconnaissent une créance')
      check(brouillons.length === 1, 'Une facture en BROUILLON ne reconnaît aucune créance')

      const { data: lignes } = await session
        .from('customer_invoice_lines')
        .select('customer_invoice_id, kind, quantity, unit_price, is_archived')
        .in('customer_invoice_id', emises.map((f) => f.id))

      const totalFacture = (lignes ?? []).reduce(
        (total, l) =>
          total + (l.is_archived ? 0 : (l.kind === 'DISCOUNT' ? -1 : 1) * l.quantity * l.unit_price),
        0
      )

      check(
        totalFacture === FACTURE_ATTENDUE,
        '🟥 TOTAL FACTURÉ : les trois factures émises, ni la brouillon ni l’annulée',
        `${totalFacture} KMF, attendu ${FACTURE_ATTENDUE}`
      )

      const { data: reglements } = await session
        .from('customer_payments')
        .select('amount, status, customer_invoice_id')
        .in('customer_invoice_id', vivantes.map((f) => f.id))

      const valides = (reglements ?? []).filter((r) => r.status === 'VALIDATED')
      const totalRegle = valides.reduce((total, r) => total + r.amount, 0)

      check(
        (reglements ?? []).length === 3,
        'Les trois règlements sont lisibles, annulé compris — le relevé les MONTRE'
      )
      check(
        totalRegle === REGLE_ATTENDU,
        '🟥 TOTAL RÉGLÉ : les règlements VALIDÉS, jamais l’annulé',
        `${totalRegle} KMF, attendu ${REGLE_ATTENDU}`
      )
      check(
        totalFacture - totalRegle === SOLDE_ATTENDU,
        '🟥 SOLDE : facturé − réglé, sans double comptage',
        `${totalFacture - totalRegle} KMF, attendu ${SOLDE_ATTENDU}`
      )

      /*
       * 🟥 AUCUNE CRÉANCE DE SYNTHÈSE N'A ÉTÉ CRÉÉE.
       *
       * Il n'existe AUCUNE facture couvrant tout le contrat : si le relevé en
       * avait fabriqué une, elle porterait 1 200 000 et se trouverait ici. La
       * somme des créances du contrat est celle de ses trois factures, et rien
       * de plus (Plan 02 §3.3).
       */
      const globale = vivantes.filter((f) => f.billing_period_id === null)
      check(
        globale.length === 0,
        '🟥 AUCUNE « facture globale » n’existe : le relevé n’en a fabriqué aucune',
        `${globale.length} facture sans période`
      )

      /* Une facture totalement réglée, une partielle, une impayée. */
      const soldeDe = (id) => {
        const du = (lignes ?? [])
          .filter((l) => l.customer_invoice_id === id && !l.is_archived)
          .reduce((t, l) => t + (l.kind === 'DISCOUNT' ? -1 : 1) * l.quantity * l.unit_price, 0)
        const paye = valides
          .filter((r) => r.customer_invoice_id === id)
          .reduce((t, r) => t + r.amount, 0)
        return du - paye
      }

      check(soldeDe(decor.factures.F1) === 0, 'Facture totalement réglée : solde nul')
      check(soldeDe(decor.factures.F2) === F2 - REG2, 'Facture partiellement réglée : solde partiel')
      check(soldeDe(decor.factures.F3) === F3, 'Facture non réglée : solde entier')

      await session.auth.signOut()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — 🟥 CONFIDENTIALITÉ : AUCUN COÛT FOURNISSEUR\n')

    {
      const session = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await session.auth.signInWithPassword({
        email: accounts.releve.email,
        password: accounts.releve.password,
      })

      const { data: couts } = await session
        .from('rental_segment_costs')
        .select('locked_cost_amount')
        .eq('rental_id', decor.longue.id)

      check(
        (couts ?? []).length === 0,
        '🟥 Le producteur du relevé n’obtient AUCUN coût gelé, même par appel direct'
      )

      const { data: tarifs } = await session
        .from('supplier_vehicle_rates')
        .select('amount')
        .in('vehicle_id', Object.values(decor.vehicules))

      check(
        (tarifs ?? []).length === 0,
        '🟥 Il n’obtient AUCUN tarif fournisseur non plus'
      )

      await session.auth.signOut()

      /* LA PAGE : ni le coût, ni la commission, ni la marge. */
      const { context, page } = await signIn(browser, base, accounts.releve)
      await page.goto(`${base}${fiche(decor.longue.id)}`, { waitUntil: 'load' })

      const texte = await mainText(page)
      const charge = await page.content()

      check(
        !texte.includes(String(COUT_A)) && !texte.includes(String(COUT_B)),
        '🟥 Aucun coût fournisseur n’apparaît sur la fiche de location'
      )
      check(
        !charge.includes(String(COUT_A)) && !charge.includes(String(COUT_B)),
        'Le coût n’atteint pas non plus la charge utile de la page'
      )
      check(
        !/commission|marge/i.test(texte),
        '🟥 Ni commission ni marge interne n’apparaissent'
      )

      await context.close()

      /* LE DOCUMENT LUI-MÊME. */
      const pdf = await fetchAs(
        base,
        accounts.releve,
        url,
        anonKey,
        `${releve(decor.longue.id)}?mode=download`
      )

      check(pdf.status === 200, 'Le relevé se produit', `HTTP ${pdf.status}`)
      check(pdf.body?.startsWith('%PDF-') ?? false, '🟥 Le fichier commence par %PDF')
      check(
        (pdf.body?.length ?? 0) > 30_000,
        'Le PDF embarque ses polices et son logo',
        `${Math.round((pdf.body?.length ?? 0) / 1024)} Ko`
      )
      check(
        (pdf.type ?? '').includes('application/pdf'),
        'Il est servi comme un PDF',
        pdf.type ?? '(sans type)'
      )

      /*
       * ═══════════════════════════════════════════════════════════════════
       * 🟥 LA CONFIDENTIALITÉ DU DOCUMENT, ÉPROUVÉE PAR DIFFÉRENCE
       * ═══════════════════════════════════════════════════════════════════
       *
       * ⚠ POURQUOI PAS UN BALAYAGE D'OCTETS DANS LE PDF.
       *
       * Les recettes des lots précédents cherchent le montant du coût dans les
       * octets du fichier. Mesure faite : `@react-pdf` COMPRIME ses flux
       * (`FlateDecode`) et SOUS-ENSEMBLE ses polices — le texte est encodé par
       * index de glyphe. Ni « 41000 », ni « Relevé », ni le numéro du contrat
       * n'y sont retrouvables, même après décompression. Un tel balayage NE
       * PEUT PAS ÉCHOUER : il passe sur un document qui porterait le coût en
       * gros titre. Ce n'est pas un contrôle, c'est un décor.
       *
       * 🟩 CE QUI SE PROUVE VRAIMENT : LA DIFFÉRENCE.
       *
       * Deux profils demandent LE MÊME relevé, du MÊME contrat. L'un peut lire
       * le coût fournisseur, l'autre non. Si le document composait le coût pour
       * qui a le droit de le lire — la « seconde composition » que le Plan 02
       * §6.4 envisageait et que DEC-048 §k écarte —, le fichier du premier
       * serait plus lourd : une colonne de plus au tableau de chronologie, trois
       * montants de plus.
       *
       * Ils doivent donc peser PAREIL. Et pour que cette égalité prouve quelque
       * chose, on vérifie D'ABORD que le profil privilégié lit RÉELLEMENT le
       * coût — sans quoi on comparerait deux aveugles.
       */
      const sessionCout = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await sessionCout.auth.signInWithPassword({
        email: accounts.avecCout.email,
        password: accounts.avecCout.password,
      })

      const { data: coutsLus } = await sessionCout
        .from('rental_segment_costs')
        .select('locked_cost_amount')
        .eq('rental_id', decor.longue.id)

      await sessionCout.auth.signOut()

      check(
        (coutsLus ?? []).length > 0,
        'Le profil privilégié lit RÉELLEMENT le coût gelé — sans quoi la comparaison ne prouverait rien',
        `${(coutsLus ?? []).length} coût(s) lisible(s)`
      )

      const pdfAvecCout = await fetchAs(
        base,
        accounts.avecCout,
        url,
        anonKey,
        `${releve(decor.longue.id)}?mode=download`
      )

      check(pdfAvecCout.status === 200, 'Son relevé se produit', `HTTP ${pdfAvecCout.status}`)

      /*
       * Tolérance de 64 octets : les métadonnées du PDF portent un horodatage,
       * et deux éditions à quelques secondes d'intervalle peuvent différer de
       * quelques octets. Une colonne de tableau en pèse des centaines.
       */
      const ecart = Math.abs((pdfAvecCout.body?.length ?? 0) - (pdf.body?.length ?? 0))

      check(
        ecart <= 64,
        '🟥 LE RELEVÉ EST IDENTIQUE POUR QUI PEUT LIRE LE COÛT : il ne le compose JAMAIS',
        `écart de ${ecart} octet(s) sur ${Math.round((pdf.body?.length ?? 0) / 1024)} Ko`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — 🟥 LE RELEVÉ N’EST PAS UNE PORTE DÉROBÉE\n')

    {
      /*
       * L'EXPLOITATION voit la location et produit ses documents. Elle n'a NI
       * `billing.customer_invoices.view`, NI `billing.customer_payments.view`.
       *
       * Le relevé doit lui être remis — c'est une pièce du contrat — MAIS
       * AMPUTÉ de ce que ces deux capacités ferment, et le document doit le
       * DIRE plutôt que d'afficher des tableaux vides (DEC-017).
       */
      const session = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await session.auth.signInWithPassword({
        email: accounts.exploitation.email,
        password: accounts.exploitation.password,
      })

      const { data: factures } = await session
        .from('customer_invoices')
        .select('id')
        .eq('rental_id', decor.longue.id)

      const { data: reglements } = await session
        .from('customer_payments')
        .select('id')
        .in('customer_invoice_id', Object.values(decor.factures))

      check(
        (factures ?? []).length === 0,
        '🟥 L’exploitation n’obtient AUCUNE facture par appel direct'
      )
      check(
        (reglements ?? []).length === 0,
        '🟥 Elle n’obtient AUCUN règlement par appel direct'
      )

      await session.auth.signOut()

      /* ET PAR LE DOCUMENT ? */
      const pdfAmpute = await fetchAs(
        base,
        accounts.exploitation,
        url,
        anonKey,
        `${releve(decor.longue.id)}?mode=download`
      )

      check(
        pdfAmpute.status === 200,
        'Le relevé lui est tout de même remis : c’est une pièce du contrat',
        `HTTP ${pdfAmpute.status}`
      )
      check(
        pdfAmpute.body?.startsWith('%PDF-') ?? false,
        'Et c’est un PDF valide, malgré les sections fermées'
      )

      /*
       * LE DOCUMENT AMPUTÉ EST PLUS COURT.
       *
       * Deux factures détaillées, trois règlements et une synthèse en moins :
       * la différence de poids est franche. Ce n'est pas une preuve d'absence —
       * seule la lecture conditionnée en est une, éprouvée juste au-dessus par
       * appel direct — mais un document IDENTIQUE au complet signalerait que
       * les sections fermées ne le sont pas.
       */
      const pdfComplet = await fetchAs(
        base,
        accounts.releve,
        url,
        anonKey,
        `${releve(decor.longue.id)}?mode=download`
      )

      check(
        (pdfAmpute.body?.length ?? 0) < (pdfComplet.body?.length ?? 0),
        '🟥 Le relevé de l’exploitation est PLUS COURT : les sections sont bien fermées',
        `${Math.round((pdfAmpute.body?.length ?? 0) / 1024)} Ko contre ${Math.round((pdfComplet.body?.length ?? 0) / 1024)} Ko`
      )

      /* La page, elle aussi, doit se taire sur la facturation. */
      const { context, page } = await signIn(browser, base, accounts.exploitation)
      await page.goto(`${base}${fiche(decor.longue.id)}`, { waitUntil: 'load' })

      const texte = await mainText(page)
      const charge = await page.content()

      check(
        !charge.includes(String(F1)) && !charge.includes(String(F2)),
        '🟥 Aucun montant de facture n’atteint la charge utile de sa page'
      )
      check(
        texte.includes('Relevé de location'),
        'Elle voit tout de même le relevé proposé'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — DEC-024 : VOIR, TÉLÉCHARGER ET IMPRIMER SONT TROIS CAPACITÉS\n')

    {
      /* LE LECTEUR : ni `download`, ni `print`. Les trois modes sont refusés. */
      for (const mode of ['download', 'print', 'preview']) {
        const refus = await fetchAs(
          base,
          accounts.lecteur,
          url,
          anonKey,
          `${releve(decor.longue.id)}?mode=${mode}`
        )
        check(
          refus.status === 403,
          `🟥 Sans capacité documentaire, le mode « ${mode} » est REFUSÉ`,
          `HTTP ${refus.status}`
        )
      }

      /* Et l'écran ne lui propose pas la barre documentaire. */
      const { context, page } = await signIn(browser, base, accounts.lecteur)
      await page.goto(`${base}${fiche(decor.longue.id)}`, { waitUntil: 'load' })

      const texte = await mainText(page)
      check(
        !texte.includes('Relevé de location'),
        'L’écran ne propose pas un relevé que la route refuserait'
      )

      await context.close()

      /*
       * LE REFUS EST TRACÉ — Règles audit §60.
       *
       * Un refus sur une capacité documentaire est un événement de sécurité. Il
       * doit se retrouver au journal, sans détail technique.
       */
      const { data: refuses } = await admin
        .from('audit_log')
        .select('action, entity_type, result')
        .eq('entity_id', decor.longue.id)
        .eq('action', 'ACCESS_DENIED')
        .limit(5)

      check(
        (refuses ?? []).length > 0,
        'Les refus documentaires sont journalisés',
        `${(refuses ?? []).length} refus tracés`
      )

      /*
       * LE TÉLÉCHARGEMENT EST TRACÉ, l'aperçu ne l'est pas — règle existante
       * du système documentaire, réemployée telle quelle. Le relevé n'invente
       * aucune architecture d'audit : il hérite de celle des quatre autres
       * pièces du cycle (consigne §18).
       */
      const { data: exports } = await admin
        .from('audit_log')
        .select('action, entity_type, reason')
        .eq('entity_id', decor.longue.id)
        .eq('action', 'EXPORT')
        .limit(10)

      check(
        (exports ?? []).length > 0,
        'Le téléchargement du relevé est journalisé, comme tout document',
        `${(exports ?? []).length} exports tracés`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — LE PROFIL QUI VOIT LES FACTURES, MAIS PAS LES RÈGLEMENTS\n')

    {
      /*
       * DEC-017 : on ne conclut RIEN de ce qu'on n'a pas le droit de lire.
       *
       * Le total facturé s'affiche ; le total réglé et le solde se TAISENT. Un
       * zéro à leur place ferait passer un contrat à moitié réglé pour
       * entièrement impayé — et c'est ce relevé qui serait remis au client.
       */
      const session = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await session.auth.signInWithPassword({
        email: accounts.sansReglement.email,
        password: accounts.sansReglement.password,
      })

      const { data: factures } = await session
        .from('customer_invoices')
        .select('id')
        .eq('rental_id', decor.longue.id)

      const { data: reglements } = await session
        .from('customer_payments')
        .select('id')
        .in('customer_invoice_id', Object.values(decor.factures))

      check((factures ?? []).length === 5, 'Elle voit les factures du contrat')
      check((reglements ?? []).length === 0, '🟥 Elle ne voit AUCUN règlement')

      await session.auth.signOut()

      const pdf = await fetchAs(
        base,
        accounts.sansReglement,
        url,
        anonKey,
        `${releve(decor.longue.id)}?mode=download`
      )

      check(pdf.status === 200, 'Son relevé se produit', `HTTP ${pdf.status}`)
      check(pdf.body?.startsWith('%PDF-') ?? false, 'Et c’est un PDF valide')
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — LES DEUX RÉGIMES, ET UNE LOCATION EN COURS\n')

    {
      /* LA DURÉE FIXÉE : une facture, aucune période facturable. */
      const pdfFixe = await fetchAs(
        base,
        accounts.releve,
        url,
        anonKey,
        `${releve(decor.fixe.id)}?mode=download`
      )

      check(pdfFixe.status === 200, 'Le relevé d’une location à DURÉE FIXÉE se produit')
      check(pdfFixe.body?.startsWith('%PDF-') ?? false, 'Et c’est un PDF valide')

      const { count: periodesFixe } = await admin
        .from('rental_billing_periods')
        .select('id', { count: 'exact', head: true })
        .eq('rental_id', decor.fixe.id)

      check(
        periodesFixe === 0,
        'Une durée fixée n’a aucune période facturable : le chapitre disparaît'
      )

      /*
       * UNE LOCATION EN COURS — le relevé INTERMÉDIAIRE.
       *
       * Le contrat de longue durée n'est pas rendu : c'est même le seul moment
       * où un client réclame son récapitulatif. Le document doit se produire et
       * porter sa date d'édition (consigne §7).
       */
      const { data: contrat } = await admin
        .from('rentals')
        .select('status, returned_at')
        .eq('id', decor.longue.id)
        .single()

      check(
        contrat.returned_at === null,
        'Le contrat de longue durée n’est pas terminé',
        contrat.status
      )

      const pdfEnCours = await fetchAs(
        base,
        accounts.releve,
        url,
        anonKey,
        `${releve(decor.longue.id)}?mode=download`
      )

      check(
        pdfEnCours.status === 200,
        '🟩 Le relevé d’une location EN COURS se produit — il n’attend pas la clôture'
      )

      /* Un identifiant inexistant : « introuvable », jamais une trace. */
      const inconnu = await fetchAs(
        base,
        accounts.releve,
        url,
        anonKey,
        `${releve('00000000-0000-0000-0000-000000000000')}?mode=download`
      )
      check(
        inconnu.status === 404,
        'Un contrat inexistant rend « introuvable »',
        `HTTP ${inconnu.status}`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('11 — RESPONSIVE\n')

    {
      for (const { largeur, hauteur, nom } of [
        { largeur: 360, hauteur: 780, nom: 'mobile' },
        { largeur: 768, hauteur: 1024, nom: 'tablette' },
        { largeur: 1440, hauteur: 900, nom: 'desktop' },
      ]) {
        const { context, page } = await signIn(browser, base, accounts.releve, {
          width: largeur,
          height: hauteur,
        })

        await page.goto(`${base}${fiche(decor.longue.id)}`, { waitUntil: 'load' })
        await page.waitForFunction(
          () => document.querySelector('main')?.innerText.includes('Relevé de location') ?? false,
          undefined,
          { timeout: 30000 }
        )

        const debordement = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        )

        check(!debordement, `Aucun débordement horizontal à ${largeur} px`, nom)

        /*
         * ⚠ LA CASSE. Le libellé OUVRE la phrase — « Récapitule les factures
         * et les règlements existants… ». Une comparaison sensible à la casse
         * échoue sur cette seule majuscule, et le contrôle accuse un texte
         * tronqué qui est en réalité présent.
         */
        const lisible = await page.evaluate(() => {
          const texte = document.querySelector('main')?.innerText ?? ''
          return /r[ée]capitule les factures/i.test(texte)
        })

        check(lisible, `La portée du relevé reste lisible à ${largeur} px`, nom)

        await context.close()
      }
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('12 — CATALOGUE, JOURNAL DU NAVIGATEUR\n')

    {
      /*
       * AUCUNE CAPACITÉ NOUVELLE — Plan 02 §10.1 et §10.3.
       *
       * « La synthèse est le 4ᵉ document du cycle, sous
       * `rental.rentals.download` / `.print` ». Le catalogue doit être exactement
       * celui que le code déclare : ni plus, ni moins.
       */
      await checkCatalogue(admin, check)

      const { data: inventees } = await admin
        .from('permissions')
        .select('code')
        .or('code.like.%statement%,code.like.%summary%,code.like.%releve%,code.like.%synthese%')

      check(
        (inventees ?? []).length === 0,
        '🟥 Aucune capacité n’a été créée pour le relevé (Plan 02 §10.3)',
        (inventees ?? []).map((p) => p.code).join(', ') || 'aucune'
      )

      check(
        journalNavigateur.length === 0,
        'Aucune erreur signalée par le navigateur',
        journalNavigateur.slice(0, 3).join(' | ') || 'aucune'
      )
    }
  } finally {
    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('NETTOYAGE\n')

    await browser.close()
    await purgeStrays(admin)

    const restes = await admin
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .like('brand', 'RECETTE REL%')

    check(restes.count === 0, 'Aucun résidu de recette', `${restes.count ?? 0} véhicule(s)`)

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
/*  Décor et nettoyage                                                         */
/* -------------------------------------------------------------------------- */

/** Une location partie, depuis sa réservation — le chemin réel du cycle. */
async function creerLocation(admin, decor, { vehicule, du, au, depart }) {
  const { data: reservationNo } = await admin.rpc('next_number', { p_entity_key: 'reservation' })

  const from = new Date(Date.now() + du * 86400_000).toISOString()
  const to = new Date(Date.now() + au * 86400_000).toISOString()

  const { data: reservation, error } = await admin
    .from('reservations')
    .insert({
      reservation_no: reservationNo,
      client_id: decor.client,
      vehicle_id: vehicule,
      period: `[${from},${to})`,
      notes: NOTE,
    })
    .select('id')
    .single()
  if (error) throw new Error(`réservation : ${error.message}`)

  const { error: confirmError } = await admin.rpc('confirm_reservation', {
    p_reservation_id: reservation.id,
    p_vehicle_id: vehicule,
  })
  if (confirmError) throw new Error(`confirmation : ${confirmError.message}`)

  const { data: rentalId, error: convertError } = await admin.rpc(
    'convert_reservation_to_rental',
    { p_reservation_id: reservation.id }
  )
  if (convertError) throw new Error(`conversion : ${convertError.message}`)

  await admin
    .from('rentals')
    .update({ status: 'CONFIRMED', notes: NOTE })
    .eq('id', rentalId)
    .eq('status', 'PREPARING')

  if (depart !== null) {
    const { error: startError } = await admin.rpc('start_rental', {
      p_rental_id: rentalId,
      p_started_at: new Date(Date.now() + depart * 86400_000).toISOString(),
      p_mileage: 10000,
      p_fuel_level: 'FULL',
    })
    if (startError) throw new Error(`départ : ${startError.message}`)
  }

  const { data: rental } = await admin
    .from('rentals')
    .select('rental_no')
    .eq('id', rentalId)
    .single()

  return { id: rentalId, no: rental.rental_no, reservationId: reservation.id }
}

/**
 * Tout ce que la recette a écrit, retiré dans l'ordre de ses dépendances.
 *
 * LE BALAYAGE SE FAIT PAR MARQUEUR, NON PAR IDENTIFIANT SUIVI : une recette
 * interrompue laisse des résidus que la liste en mémoire ne connaît pas.
 */
async function purgeStrays(admin) {
  const { data: reservations } = await admin
    .from('reservations')
    .select('id')
    .eq('notes', NOTE)
  const reservationIds = (reservations ?? []).map((row) => row.id)

  const { data: rentals } = await admin.from('rentals').select('id').eq('notes', NOTE)
  const rentalIds = (rentals ?? []).map((row) => row.id)

  if (rentalIds.length > 0) {
    const invoiceIds = await idsOf(admin, 'customer_invoices', 'rental_id', rentalIds)

    // Les écritures AVANT les règlements : elles les désignent.
    await admin.from('treasury_entries').delete().in('customer_payment_id',
      await idsOf(admin, 'customer_payments', 'customer_invoice_id', invoiceIds))
    await admin.from('customer_payments').delete().in('customer_invoice_id', invoiceIds)
    await admin.from('customer_invoice_lines').delete().in('customer_invoice_id', invoiceIds)
    await admin.from('customer_invoices').delete().in('rental_id', rentalIds)

    await admin.from('rental_billing_periods').delete().in('rental_id', rentalIds)

    await admin
      .from('rental_inspection_photos')
      .delete()
      .in('inspection_id', await idsOf(admin, 'rental_inspections', 'rental_id', rentalIds))
    await admin.from('rental_inspections').delete().in('rental_id', rentalIds)
    await purgeRentalHistory(admin, rentalIds)
    await admin.from('rentals').delete().in('id', rentalIds)
  }

  if (reservationIds.length > 0) {
    await admin.from('vehicle_occupations').delete().in('source_id', reservationIds)
    await admin.from('reservations').delete().in('id', reservationIds)
  }

  await admin.from('supplier_vehicle_rates').delete().like('conditions', 'RECETTE REL%')
  await admin.from('pricing_rules').delete().like('conditions', 'RECETTE REL%')

  const { data: comptes } = await admin
    .from('financial_accounts')
    .select('id')
    .like('label', 'RECETTE REL%')

  const compteIds = (comptes ?? []).map((row) => row.id)
  if (compteIds.length > 0) {
    await admin.from('treasury_entries').delete().in('account_id', compteIds)
    await admin.from('financial_accounts').delete().in('id', compteIds)
  }

  const { data: vehicles } = await admin.from('vehicles').select('id').like('brand', 'RECETTE REL%')
  const vehicleIds = (vehicles ?? []).map((row) => row.id)

  if (vehicleIds.length > 0) {
    await admin.from('supplier_vehicle_rates').delete().in('vehicle_id', vehicleIds)
    await admin.from('pricing_rules').delete().in('vehicle_id', vehicleIds)
    await admin.from('vehicle_supplier_history').delete().in('vehicle_id', vehicleIds)
    await admin.from('vehicle_occupations').delete().in('vehicle_id', vehicleIds)
    await admin.from('vehicles').delete().in('id', vehicleIds)
  }

  const { data: fournisseurs } = await admin
    .from('suppliers')
    .select('id')
    .like('legal_name', 'RECETTE REL%')

  const supplierIds = (fournisseurs ?? []).map((row) => row.id)
  if (supplierIds.length > 0) {
    await admin.from('supplier_vehicle_rates').delete().in('supplier_id', supplierIds)
    await admin.from('vehicle_supplier_history').delete().in('supplier_id', supplierIds)
    await admin.from('suppliers').delete().in('id', supplierIds)
  }

  await admin.from('clients').delete().like('legal_name', 'RECETTE REL%')
  await admin.from('vehicle_categories').delete().like('label', 'RECETTE REL%')

  const { data: utilisateurs } = await admin
    .from('app_users')
    .select('id')
    .like('username', 'recette.rel.%')

  for (const compte of utilisateurs ?? []) {
    await admin.from('user_permissions').delete().eq('user_id', compte.id)
    await admin.from('app_users').delete().eq('id', compte.id)
    await admin.auth.admin.deleteUser(compte.id)
  }
}

/** Identifiants d'une table filtrée par une colonne — `in ()` ne se vide pas. */
async function idsOf(admin, table, column, values) {
  if (values.length === 0) return ['00000000-0000-0000-0000-000000000000']
  const { data } = await admin.from(table).select('id').in(column, values)
  const ids = (data ?? []).map((row) => row.id)
  return ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']
}

/** Une requête HTTP portée par la session d'un compte. */
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

  const body =
    response.status === 200
      ? Buffer.from(await response.arrayBuffer()).toString('latin1')
      : null

  await client.auth.signOut()

  return { status: response.status, type: response.headers.get('content-type'), body }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
