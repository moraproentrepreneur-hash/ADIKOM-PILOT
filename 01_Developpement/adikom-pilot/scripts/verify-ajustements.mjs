#!/usr/bin/env node
/**
 * Recette des AJUSTEMENTS du 08/09/2026 — DEC-042.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * Les sept ajustements demandés par ADIKOM touchent des écrans que les recettes
 * existantes traversent sans les regarder : ce qu'un bandeau DIT, ce qu'un
 * onglet CONTIENT, ce qu'une barre d'actions PRODUIT, et ce qu'un champ
 * déroulant fait sous le doigt. Cette recette regarde exactement cela.
 *
 *   1. TABLEAU DE BORD — les indicateurs agrégés s'affichent sans les capacités
 *      des modules, et le DÉTAIL reste fermé (DEC-042 §a).
 *   2. BANDEAUX — plus aucune référence de documentation interne dans une page :
 *      ni « §25 », ni « Workflow 07 §23 », ni « DEC-017 » (DEC-042 §h).
 *   3. ONGLETS — plus aucun « à venir » sur les six fiches concernées, et
 *      chacun des onglets ouverts montre de vraies données (DEC-042 §d, §e).
 *   4. BARRES D'ACTIONS — réservation, facture client, facture fournisseur et
 *      paiement divers offrent aperçu, téléchargement et impression, et le
 *      document est RÉELLEMENT produit (DEC-042 §c).
 *   5. PAIEMENT DIVERS — un ENCAISSEMENT saisi à l'écran augmente le solde du
 *      compte, et son annulation le rend (DEC-042 §b).
 *   6. CHAMPS DÉROULANTS — sur téléphone, la liste est celle de l'application,
 *      dessinée dans la page, jamais la fenêtre du système (DEC-042 §f).
 *   7. AJOUT D'UNE PERSONNE À UN PROJET — les champs s'empilent sur téléphone,
 *      le bouton tient sa largeur, et l'ajout apparaît dans la liste
 *      (DEC-042 §g).
 *
 * Utilisation :
 *   node scripts/verify-ajustements.mjs [url]
 *
 * NE JAMAIS piper la sortie vers `head` : SIGPIPE tuerait le processus avant
 * son nettoyage, et laisserait des comptes de recette en base.
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { dayOffset, loadEnvFile, required } from './lib/env.mjs'
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
const MARK = `RECETTE AJU ${STAMP}`

/** L'écran d'un téléphone courant : c'est là que le point 6 se joue. */
const MOBILE = { width: 390, height: 844 }

/**
 * Ce qu'une référence de documentation interne a l'air, dans une page.
 *
 * `§` seul suffirait presque ; les deux autres attrapent ce qui subsisterait
 * sans lui — « DEC-017 », « CLAUDE.md ». Aucun texte métier n'emploie ces
 * formes : elles ne peuvent venir que de la documentation de développement.
 */
const REFERENCES = [
  { pattern: /§/, label: 'une référence de paragraphe (§)' },
  { pattern: /\bDEC-\d{3}\b/, label: 'une référence de décision (DEC-0XX)' },
  { pattern: /CLAUDE\.md/i, label: 'une référence au fichier de règles' },
  { pattern: /\b\d\d_[A-Za-z_]+\.md\b/, label: 'un chemin de documentation' },
]

/**
 * Le profil complet de la recette.
 *
 * Il porte les lectures des six fiches concernées ET les capacités
 * documentaires : sans elles, une barre d'actions ne s'afficherait pas, et le
 * contrôle ne prouverait rien.
 */
const COMPLET = [
  'dashboard.view',
  'dashboard.fleet.view',
  'dashboard.financial.view',

  'parties.clients.view',
  'parties.clients.download',
  'parties.clients.print',
  'parties.clients.pricing.view',
  'parties.clients.pricing.manage',
  'parties.suppliers.view',
  'parties.suppliers.download',
  'parties.suppliers.print',
  'parties.partners.view',
  'parties.partners.download',
  'parties.partners.print',

  'rental.reservations.view',
  'rental.reservations.download',
  'rental.reservations.print',
  'rental.rentals.view',
  'rental.rentals.financial.view',
  'rental.rentals.download',
  'rental.rentals.print',
  'rental.fleet.view',
  'rental.categories.view',
  'rental.pricing.view',
  'rental.maintenance.view',
  'rental.maintenance.cost.view',
  'rental.incidents.view',
  'rental.documents.view',

  'billing.customer_invoices.view',
  'billing.customer_invoices.download',
  'billing.customer_invoices.print',
  'billing.customer_payments.view',
  'billing.supplier_invoices.view',
  'billing.supplier_invoices.download',
  'billing.supplier_invoices.print',
  'billing.supplier_payments.view',
  'billing.imputations.view',
  'billing.misc_payments.view',
  'billing.misc_payments.create',
  'billing.misc_payments.validate',
  'billing.misc_payments.cancel',
  'billing.misc_payments.download',
  'billing.misc_payments.print',

  'treasury.accounts.view',
  'treasury.balances.view',
  'treasury.entries.view',

  'projects.view',
  'projects.update',
  'projects.tasks.view',
  'projects.meetings.view',
  'projects.appointments.view',
  'projects.decisions.view',
  'projects.actions.view',
  'users.users.view',
  'users.audit.view',
]

/** Le pilote : les trois capacités du tableau de bord, et rien d'autre. */
const PILOTE = ['dashboard.view', 'dashboard.fleet.view', 'dashboard.financial.view']

/* -------------------------------------------------------------------------- */

async function createProfile(admin, key, codes) {
  const username = `recette.aju.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-aju-${STAMP}`

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
    last_name: `Ajustements ${key}`,
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

/*
 * POURQUOI `domcontentloaded` PLUTÔT QUE `load`.
 *
 * `load` attend TOUTES les sous-ressources, polices comprises. Aucune assertion
 * de cette recette n'en dépend : elles portent sur du texte, des états et des
 * mesures de disposition, que le document rend dès qu'il est analysé.
 *
 * L'attente complète, elle, dépend du lien réseau : contre la production, un
 * fichier de police de 35 Ko a mis plus de trente secondes à parvenir depuis le
 * poste de recette, et la recette échouait sur « navigating to /connexion » —
 * ce qui n'apprend rien du SaaS. Chaque contrôle attend donc ce dont il a
 * besoin, et rien de plus : les localisateurs de Playwright s'en chargent.
 */

/**
 * Ouvre une session, éventuellement sur un écran de téléphone.
 *
 * `hasTouch` n'est pas un détail : sans lui, le navigateur piloté répond
 * `pointer: fine`, et les règles de confort tactile du Design System — dont la
 * cible de 44 px d'une option de liste — ne s'appliquent pas. La recette
 * mesurerait alors un écran qui n'existe sur aucun téléphone.
 */
async function signIn(browser, base, account, viewport = null) {
  const context = await browser.newContext(viewport ? { viewport, hasTouch: true } : {})

  /*
   * DES DÉLAIS QUI TIENNENT SUR UN LIEN LENT.
   *
   * Les 30 secondes par défaut de Playwright suffisent contre un serveur local
   * et pas toujours contre la production : depuis certains réseaux, le premier
   * octet de Vercel arrive après six secondes, et une page complète — polices
   * comprises — dépasse le délai. La recette échouait alors sur « navigating
   * to /connexion », ce qui n'apprend rien du SaaS.
   */
  context.setDefaultNavigationTimeout(120000)
  context.setDefaultTimeout(60000)
  const page = await context.newPage()

  await page.goto(`${base}/connexion`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('#username') !== null)
  await page.fill('#username', account.username)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/tableau-de-bord', { timeout: 60000 })

  return { context, page }
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/**
 * Attend qu'un acte ait ABOUTI, en guettant ce que la fiche DIT de son état.
 *
 * Deux fausses pistes ont été écartées :
 *
 *   · le message de succès vit DANS la carte qui porte l'acte, et cette carte
 *     s'efface dès que l'état change : l'attendre, c'est attendre ce que
 *     l'écran a raison de ne plus montrer ;
 *   · la disparition du bouton ne prouve rien non plus — pendant l'envoi, son
 *     libellé devient « Validation… », et il n'est déjà plus trouvable sous son
 *     nom d'origine.
 *
 * Le bandeau d'état, lui, dit exactement où en est la fiche, et il reste. C'est
 * lui qu'on guette. Un refus est guetté en même temps : sans cela, un échec
 * expirerait en silence et le message n'apprendrait rien.
 */
async function actUntilState(page, pattern, timeout = 60000) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const text = await mainText(page)
    if (pattern.test(text)) return { done: true, text }
    if (/Opération refusée|Vous ne disposez|n’a pas pu/.test(text)) return { done: false, text }
    await page.waitForTimeout(300)
  }

  return { done: false, text: await mainText(page) }
}

/** Les libellés de la barre d'onglets d'une fiche. */
async function tabLabels(page) {
  const nav = page.locator('nav[aria-label]')
  const count = await nav.count()
  for (let i = 0; i < count; i += 1) {
    const label = await nav.nth(i).getAttribute('aria-label')
    if (label && /Sections/.test(label)) {
      return (await nav.nth(i).innerText()).replace(/\s+/g, ' ')
    }
  }
  return ''
}

/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'
  const url = required('NEXT_PUBLIC_SUPABASE_URL')

  const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // L'empreinte du jeu de démonstration, prise AVANT toute écriture. Elle
  // échoue d'elle-même si elle n'a pas pu être lue.
  const demoAvant = await demoFootprint(admin)

  console.log(`\nCible : ${base}\n`)

  const accounts = {}
  const fixtures = { accountId: null, miscPayments: [], members: [] }
  const browser = await chromium.launch()

  try {
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    accounts.complet = await createProfile(admin, 'complet', COMPLET)
    accounts.pilote = await createProfile(admin, 'pilote', PILOTE)

    // Un compte financier à la recette : le point 5 mouvemente un solde, et il
    // ne doit toucher à aucun compte de la démonstration.
    const { data: account, error: accountError } = await admin
      .from('financial_accounts')
      .insert({
        account_no: `AJU-${STAMP}`,
        kind: 'CASH',
        label: `${MARK} — Caisse`,
        opening_balance: 500000,
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    if (accountError) throw new Error(`compte financier : ${accountError.message}`)
    fixtures.accountId = account.id

    // Les sujets de démonstration que la recette LIT, sans jamais les modifier.
    const [{ data: client }, { data: supplier }, { data: partner }, { data: vehicle }] =
      await Promise.all([
        admin.from('clients').select('id').like('legal_name', '%DEMO%').limit(1).maybeSingle(),
        admin.from('suppliers').select('id').like('legal_name', '%DEMO%').limit(1).maybeSingle(),
        admin.from('partners').select('id').like('legal_name', '%DEMO%').limit(1).maybeSingle(),
        admin.from('vehicles').select('id').like('model', '%DEMO%').limit(1).maybeSingle(),
      ])

    const [{ data: reservation }, { data: rental }, { data: invoice }, { data: supInvoice }] =
      await Promise.all([
        admin.from('reservations').select('id').limit(1).maybeSingle(),
        admin.from('rentals').select('id').limit(1).maybeSingle(),
        admin.from('customer_invoices').select('id').limit(1).maybeSingle(),
        admin.from('supplier_invoices').select('id').limit(1).maybeSingle(),
      ])

    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('is_archived', false)
      .limit(1)
      .maybeSingle()

    const subjects = { client, supplier, partner, vehicle, reservation, rental, invoice, supInvoice, project }
    const missing = Object.entries(subjects)
      .filter(([, value]) => !value?.id)
      .map(([key]) => key)

    if (missing.length > 0) {
      throw new Error(
        `Le jeu de démonstration est incomplet (${missing.join(', ')}). ` +
          'Lancez `npm run demo:seed` avant cette recette.'
      )
    }

    console.log(`  ${DIM}Deux profils, une caisse de recette, les sujets DEMO lus.${RESET}`)

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — TABLEAU DE BORD : LES CHIFFRES SANS LES MODULES (DEC-042 §a)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.pilote)
      const text = await mainText(page)

      for (const label of [
        'Locations en cours',
        'Départs du jour',
        'Retours du jour',
        'Retours en retard',
        'À contrôler',
        'À facturer',
        'Réservations à venir',
        'Réservations du jour',
        'Nouveaux clients',
        'Nouvelles réservations',
        'Nouvelles locations',
        'Nouvelles factures clients',
      ]) {
        const value = await page
          .locator(`[data-kpi="${label}"] [data-kpi-value]`)
          .count()
        check(value === 1, `« ${label} » affiche sa valeur`)
      }

      check(
        !/Non accessible/.test(text),
        'Aucun « Non accessible » ne subsiste sur le tableau de bord du pilote'
      )
      check(/État du parc/.test(text), 'L’état du parc est chiffré')
      check(/Total disponible/.test(text), 'Le total de trésorerie est chiffré')

      // Et le DÉTAIL, lui, reste fermé.
      check(
        !/LOC-\d/.test(text),
        'Aucune référence de contrat : la liste des retards reste fermée'
      )
      const session = createClient(url, required('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await session.auth.signInWithPassword({
        email: accounts.pilote.email,
        password: accounts.pilote.password,
      })
      const { data: rows } = await session.from('rentals').select('id').limit(1)
      check((rows ?? []).length === 0, 'RLS masque toujours les locations au pilote')
      await session.auth.signOut()

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — AUCUNE RÉFÉRENCE DE DOCUMENTATION DANS UNE PAGE (DEC-042 §h)\n')

    const PAGES = [
      ['/tableau-de-bord', 'Tableau de bord'],
      ['/notifications', 'Centre de notifications'],
      ['/projets', 'Projets'],
      [`/projets/${project.id}`, 'Fiche projet'],
      ['/projets/actions', 'Actions'],
      ['/projets/decisions', 'Décisions'],
      ['/projets/reunions', 'Réunions'],
      ['/projets/rendez-vous', 'Rendez-vous'],
      ['/projets/taches', 'Tâches'],
      ['/tiers/clients', 'Clients'],
      [`/tiers/clients/${client.id}`, 'Fiche client'],
      [`/tiers/fournisseurs/${supplier.id}`, 'Fiche fournisseur'],
      [`/tiers/partenaires/${partner.id}`, 'Fiche partenaire'],
      ['/location', 'Tableau de location'],
      [`/location/parc/${vehicle.id}`, 'Fiche véhicule'],
      ['/location/tarification', 'Tarification'],
      [`/location/reservations/${reservation.id}`, 'Fiche réservation'],
      [`/location/locations/${rental.id}`, 'Fiche location'],
      ['/location/maintenance', 'Maintenance'],
      ['/facturation/clients', 'Factures clients'],
      [`/facturation/clients/${invoice.id}`, 'Fiche facture client'],
      ['/facturation/fournisseurs', 'Factures fournisseurs'],
      [`/facturation/fournisseurs/${supInvoice.id}`, 'Fiche facture fournisseur'],
      ['/facturation/imputations', 'Imputations'],
      ['/facturation/paiements-divers', 'Paiements divers'],
      ['/facturation/paiements-divers/nouveau', 'Nouveau paiement divers'],
      ['/tresorerie/comptes', 'Comptes'],
      ['/tresorerie/ecritures', 'Écritures'],
      ['/tresorerie/virements', 'Virements'],
      ['/utilisateurs/journal', 'Journal d’activité'],
    ]

    {
      const { context, page } = await signIn(browser, base, accounts.complet)

      let clean = 0
      for (const [path, label] of PAGES) {
        await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
        const text = await mainText(page)

        const found = REFERENCES.filter((rule) => rule.pattern.test(text))
        if (found.length === 0) {
          clean += 1
        } else {
          const excerpt = text.match(/[^.]{0,60}§[^.]{0,40}/)?.[0] ?? ''
          check(false, `${label} porte ${found[0].label}`, excerpt.trim())
        }
      }

      check(clean === PAGES.length, `Les ${PAGES.length} pages parcourues sont nettes`, `${clean}/${PAGES.length}`)

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — PLUS AUCUN ONGLET « À VENIR » (DEC-042 §d, §e)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.complet)

      const FICHES = [
        [`/tiers/clients/${client.id}`, 'Fiche client', ['Réservations', 'Locations', 'Documents', 'Historique']],
        [`/tiers/fournisseurs/${supplier.id}`, 'Fiche fournisseur', ['Documents']],
        [`/tiers/partenaires/${partner.id}`, 'Fiche partenaire', ['Projets', 'Documents', 'Historique']],
        [`/location/locations/${rental.id}`, 'Fiche location', ['Historique']],
        [`/location/parc/${vehicle.id}`, 'Fiche véhicule', ['Locations', 'Rentabilité']],
        ['/location/tarification', 'Tarification', ['Tarifs préférentiels']],
      ]

      for (const [path, label, expected] of FICHES) {
        await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
        const tabs = await tabLabels(page)

        check(!/à venir/i.test(tabs), `${label} : aucun onglet « à venir »`, tabs.slice(0, 90))
        for (const tab of expected) {
          check(tabs.includes(tab), `${label} : l’onglet « ${tab} » est présent`)
        }
      }

      /* --- Et chaque onglet ouvre du CONTENU, pas une page vide -------- */

      await page.goto(`${base}/tiers/clients/${client.id}?onglet=reservations`, { waitUntil: 'domcontentloaded' })
      check(
        /Réservations/.test(await mainText(page)),
        'Client → Réservations : la carte s’ouvre'
      )

      await page.goto(`${base}/tiers/clients/${client.id}?onglet=locations`, { waitUntil: 'domcontentloaded' })
      check(/Locations/.test(await mainText(page)), 'Client → Locations : la carte s’ouvre')

      await page.goto(`${base}/tiers/clients/${client.id}?onglet=documents`, { waitUntil: 'domcontentloaded' })
      const clientDocs = await mainText(page)
      check(
        /Fiche client/.test(clientDocs) && /Aperçu/.test(clientDocs),
        'Client → Documents : la fiche est produisible depuis l’onglet'
      )

      await page.goto(`${base}/tiers/clients/${client.id}?onglet=historique`, { waitUntil: 'domcontentloaded' })
      check(
        /Historique/.test(await mainText(page)),
        'Client → Historique : le journal de la fiche s’ouvre'
      )

      await page.goto(`${base}/location/locations/${rental.id}?onglet=historique`, { waitUntil: 'domcontentloaded' })
      check(
        /Historique/.test(await mainText(page)),
        'Location → Historique : le cycle réellement parcouru s’ouvre'
      )

      await page.goto(`${base}/location/parc/${vehicle.id}?onglet=rentabilite`, { waitUntil: 'domcontentloaded' })
      const profit = await mainText(page)
      check(/Marge d’exploitation/.test(profit), 'Véhicule → Rentabilité : la marge est calculée')
      check(
        /n’est pas une rentabilité complète/i.test(profit),
        'Et l’écran DIT que ce n’est pas une rentabilité complète'
      )

      await page.goto(`${base}/location/tarification?onglet=preferentiels`, { waitUntil: 'domcontentloaded' })
      check(
        /Conditions consenties aux clients/.test(await mainText(page)),
        'Tarification → Tarifs préférentiels : les conditions s’ouvrent'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — BARRES D’ACTIONS : LES DOCUMENTS SONT RÉELLEMENT PRODUITS (§c)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.complet)

      const FICHES = [
        [`/location/reservations/${reservation.id}`, 'reservations', reservation.id, 'Réservation'],
        [`/facturation/clients/${invoice.id}`, 'factures-clients', invoice.id, 'Facture client'],
        [
          `/facturation/fournisseurs/${supInvoice.id}`,
          'factures-fournisseurs',
          supInvoice.id,
          'Facture fournisseur',
        ],
      ]

      for (const [path, type, id, label] of FICHES) {
        await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
        const text = await mainText(page)

        check(/Aperçu/.test(text), `${label} : le bouton « Aperçu » est là`)
        check(/Télécharger PDF/.test(text), `${label} : « Télécharger PDF » est là`)
        check(/Imprimer/.test(text), `${label} : « Imprimer » est là`)

        // LE BOUTON N'EST PAS MORT : le document est produit, et c'est un PDF.
        const response = await page.request.get(
          `${base}/api/documents/${type}/${id}?mode=download`
        )
        const body = await response.body()
        check(
          response.status() === 200 && body.subarray(0, 4).toString() === '%PDF',
          `${label} : le PDF est réellement produit`,
          `${response.status()}, ${body.length} octets`
        )
      }

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — PAIEMENT DIVERS : UN ENCAISSEMENT AUGMENTE LE SOLDE (§b)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.complet)

      const { data: avant } = await admin.rpc('financial_account_balance', {
        p_account_id: fixtures.accountId,
      })

      await page.goto(`${base}/facturation/paiements-divers/nouveau`, { waitUntil: 'domcontentloaded' })

      const formText = await mainText(page)
      check(/Sens/.test(formText), 'Le formulaire demande le SENS du paiement')

      await page.selectOption('#direction', 'IN')
      await page.selectOption('#accountId', fixtures.accountId)
      await page.selectOption('#category', 'OTHER')
      await page.fill('#amount', '75000')
      await page.fill('#paidOn', dayOffset(0))
      await page.fill('#beneficiary', `${MARK} — Assureur`)
      await page.fill('#purpose', 'Remboursement de franchise — recette des ajustements.')

      // Le formulaire annonce l'effet AVANT le clic.
      check(
        /créditera le compte/i.test(await mainText(page)),
        'L’écran annonce que la validation CRÉDITERA le compte'
      )
      check(
        /Payeur/.test(await mainText(page)),
        'Le tiers devient un « Payeur », et non un bénéficiaire'
      )

      await page.getByRole('button', { name: 'Enregistrer le paiement' }).click()

      // L'ATTENTE VISE UN IDENTIFIANT, PAS UN CHEMIN.
      //
      // Un motif en étoile sur « paiements-divers » est déjà satisfait par la
      // page de SAISIE elle-même, « nouveau » : la recette repartirait avec ce
      // mot pour identifiant, et l'échec accuserait la fiche alors que rien ne
      // s'est passé. Le motif exige donc un UUID.
      await page.waitForURL(
        /\/facturation\/paiements-divers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
        { timeout: 60000 }
      )

      const paymentId = page.url().split('/').pop().split('?')[0]
      fixtures.miscPayments.push(paymentId)

      const fiche = await mainText(page)
      check(/Encaissement/.test(fiche), 'La fiche porte le sens « Encaissement »')
      check(/Brouillon/.test(fiche), 'Le paiement naît en brouillon')

      const { data: enBrouillon } = await admin.rpc('financial_account_balance', {
        p_account_id: fixtures.accountId,
      })
      check(
        Number(enBrouillon) === Number(avant),
        'Un brouillon ne mouvemente rien',
        `${enBrouillon} = ${avant}`
      )

      await page.getByRole('button', { name: 'Valider le paiement' }).click()

      /*
       * CE QUI PROUVE LA VALIDATION, C'EST L'ÉTAT DE LA FICHE.
       *
       * Le message de succès vit dans la carte « Valider » — et cette carte
       * DISPARAÎT dès que le paiement cesse d'être un brouillon : le message
       * part avec elle. L'attendre serait attendre ce que l'écran a raison de
       * ne plus montrer. C'est donc l'état affiché qui est guetté.
       */
      const validation = await actUntilState(page, /Le compte est crédité du montant reçu/)
      check(
        validation.done,
        'La validation aboutit, et le bandeau dit que le compte est CRÉDITÉ',
        validation.text.slice(0, 110)
      )
      check(
        !/Le compte est débité/.test(validation.text),
        'Jamais « débité » : le sens décide de ce que l’écran annonce'
      )

      const { data: apres } = await admin.rpc('financial_account_balance', {
        p_account_id: fixtures.accountId,
      })
      check(
        Number(apres) === Number(avant) + 75000,
        'La validation AUGMENTE le solde du compte',
        `${avant} → ${apres}`
      )

      const { data: entries } = await admin
        .from('treasury_entries')
        .select('direction, amount, status')
        .eq('misc_payment_id', paymentId)
      const live = (entries ?? []).filter((e) => e.status === 'VALIDATED')
      check(
        live.length === 1 && live[0].direction === 'IN' && Number(live[0].amount) === 75000,
        'Une seule écriture, une ENTRÉE de 75 000 KMF',
        `${live.length} écriture(s)`
      )

      // Le reçu du paiement divers est réellement produit.
      const receipt = await page.request.get(
        `${base}/api/documents/paiements-divers/${paymentId}?mode=download`
      )
      const body = await receipt.body()
      check(
        receipt.status() === 200 && body.subarray(0, 4).toString() === '%PDF',
        'Le reçu d’encaissement est réellement produit',
        `${receipt.status()}, ${body.length} octets`
      )

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: 'Annuler le paiement' }).click()
      const annulation = await actUntilState(page, /L’écriture est annulée/)
      check(
        annulation.done,
        'L’annulation aboutit, et le bandeau dit que le solde est revenu',
        annulation.text.slice(0, 110)
      )

      const { data: rendu } = await admin.rpc('financial_account_balance', {
        p_account_id: fixtures.accountId,
      })
      check(
        Number(rendu) === Number(avant),
        'L’annulation rend le solde au compte',
        `${apres} → ${rendu}`
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — CHAMPS DÉROULANTS SUR TÉLÉPHONE (DEC-042 §f)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.complet, MOBILE)

      await page.goto(`${base}/facturation/paiements-divers/nouveau`, { waitUntil: 'domcontentloaded' })

      /*
       * LE `<select>` NATIF NE REÇOIT PLUS LE DOIGT.
       *
       * C'est ce qui empêche la fenêtre du système de s'ouvrir : il est
       * toujours là — le formulaire l'envoie —, mais hors d'atteinte du
       * pointeur. Tout ce qui est touché appartient à l'application.
       */
      const nativePointer = await page.evaluate(() => {
        const element = document.querySelector('select[name="category"]')
        return element ? getComputedStyle(element).pointerEvents : null
      })
      check(
        nativePointer === 'none',
        'Le `<select>` natif ne reçoit pas le pointeur : le système n’ouvre rien',
        `pointer-events: ${nativePointer}`
      )

      /*
       * Le champ est désigné par son NOM, jamais par sa position : un champ
       * ajouté au-dessus déplacerait la recette sans rien casser d'autre.
       */
      const trigger = page.locator('[data-select-for="category"]')
      check(await trigger.isVisible(), 'Le champ « Catégorie » affiche un déclencheur de liste')

      await trigger.click()
      const listbox = page.locator('[data-select-list="category"]')
      await listbox.waitFor({ state: 'visible', timeout: 10000 })
      check(true, 'La liste s’ouvre DANS la page, dessinée par l’application')

      /* --- Elle tient dans l'écran, entièrement ------------------------ */
      const box = await listbox.boundingBox()
      check(
        box !== null && box.x >= 0 && box.x + box.width <= MOBILE.width + 1,
        'La liste ne déborde pas horizontalement',
        box ? `x=${Math.round(box.x)} largeur=${Math.round(box.width)}` : 'non mesurée'
      )
      check(
        box !== null && box.y >= 0 && box.y + box.height <= MOBILE.height + 1,
        'La liste ne sort pas de l’écran verticalement',
        box ? `y=${Math.round(box.y)} hauteur=${Math.round(box.height)}` : 'non mesurée'
      )

      /* --- Une option se vise au doigt --------------------------------- */
      const option = listbox.locator('[data-select-option]').nth(2)
      const optionBox = await option.boundingBox()
      check(
        optionBox !== null && optionBox.height >= 44,
        'Une option offre une cible tactile d’au moins 44 px',
        optionBox ? `${Math.round(optionBox.height)} px` : 'non mesurée'
      )

      const wanted = (await option.innerText()).trim()
      await option.click()

      /* --- Le choix atteint le `<select>`, et le champ le montre ------- */
      const stored = await page.evaluate(
        () => document.querySelector('select[name="category"]')?.value ?? null
      )
      check(
        stored === 'ONE_OFF_SERVICE',
        'Le choix est posé sur le `<select>` : le formulaire l’enverra',
        `value=${stored}`
      )
      check(
        (await trigger.innerText()).includes(wanted),
        'Le champ affiche le libellé retenu, en entier',
        wanted
      )
      check(
        (await page.locator('[role="listbox"]').count()) === 0,
        'La liste se referme après le choix'
      )
      check(
        (await page.locator('select[name="category"]').count()) === 1,
        'Le `<select>` est toujours là : le formulaire enverra bien le champ'
      )

      /* --- Aucun débordement horizontal de la page --------------------- */
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      check(overflow <= 1, 'La page ne défile pas horizontalement', `${overflow} px`)

      /* --- Un libellé long reste lisible ------------------------------- */
      await page.goto(`${base}/location/tarification?onglet=preferentiels`, { waitUntil: 'domcontentloaded' })
      await page.goto(`${base}/facturation/paiements-divers`, { waitUntil: 'domcontentloaded' })

      const filterTrigger = page.locator('[data-select-for="compte"]')
      await filterTrigger.click()
      const filterList = page.locator('[data-select-list="compte"]')
      await filterList.waitFor({ state: 'visible', timeout: 10000 })

      const truncated = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-select-option]')).some(
          (node) => node.scrollWidth > node.clientWidth + 1
        )
      )
      check(!truncated, 'Aucune option n’est coupée : le texte revient à la ligne')

      await page.keyboard.press('Escape')
      check(
        (await page.locator('[role="listbox"]').count()) === 0,
        'La touche Échap referme la liste'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — AJOUTER UNE PERSONNE À UN PROJET (DEC-042 §g)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.complet, MOBILE)

      await page.goto(`${base}/projets/${project.id}?onglet=equipe`, { waitUntil: 'domcontentloaded' })
      if (!/Personne/.test(await mainText(page))) {
        await page.goto(`${base}/projets/${project.id}`, { waitUntil: 'domcontentloaded' })
      }

      const personne = page.locator('#userId')
      const role = page.locator('#role')

      check((await personne.count()) === 1, 'Le champ « Personne » existe')
      check((await role.count()) === 1, 'Le champ « Rôle » existe')

      const personneBox = await page.locator('[data-select-for="userId"]').boundingBox()
      const roleBox = await page.locator('[data-select-for="role"]').boundingBox()

      check(
        personneBox && roleBox && Math.abs(personneBox.x - roleBox.x) < 2,
        'Sur téléphone, les deux champs sont alignés : ils s’empilent',
        personneBox && roleBox ? `x=${Math.round(personneBox.x)} / ${Math.round(roleBox.x)}` : ''
      )
      check(
        personneBox && roleBox && roleBox.y > personneBox.y + personneBox.height - 2,
        'Le rôle est SOUS la personne, jamais à côté et comprimé'
      )
      check(
        roleBox && roleBox.width > MOBILE.width * 0.5,
        'Le champ « Rôle » occupe une largeur utile',
        roleBox ? `${Math.round(roleBox.width)} px` : ''
      )

      const bouton = page.getByRole('button', { name: /Ajouter au projet/ })
      const boutonBox = await bouton.boundingBox()
      check(
        boutonBox && boutonBox.width > MOBILE.width * 0.5 && boutonBox.height >= 44,
        'Le bouton n’est pas comprimé : pleine largeur, hauteur tactile',
        boutonBox ? `${Math.round(boutonBox.width)} × ${Math.round(boutonBox.height)} px` : ''
      )

      /* --- L'ajout fonctionne, et la liste le montre ------------------- */
      const options = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#userId option'))
          .map((node) => node.value)
          .filter(Boolean)
      )

      if (options.length === 0) {
        check(false, 'Aucune personne à ajouter : le sujet de recette est incomplet')
      } else {
        await page.selectOption('#userId', options[0])
        await page.selectOption('#role', 'OBSERVER')
        await bouton.click()
        await page.waitForFunction(
          () => document.body.innerText.includes('Observateur'),
          undefined,
          { timeout: 60000 }
        )
        check(true, 'La personne ajoutée apparaît dans la liste, avec son rôle')
        fixtures.members.push({ projectId: project.id, userId: options[0] })

        const retirer = page.getByRole('button', { name: 'Retirer' }).last()
        await retirer.click()
        await page.waitForTimeout(1500)
        check(true, 'Et elle se retire depuis la même liste')
      }

      await context.close()
    }
  } finally {
    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('NETTOYAGE ET DONNÉES DEMO\n')

    for (const id of fixtures.miscPayments) {
      await admin.from('treasury_entries').delete().eq('misc_payment_id', id)
      await admin.from('misc_payments').delete().eq('id', id)
    }

    // Balayage par marqueur : ce que les ids suivis n'ont pas pu viser.
    const { data: stray } = await admin
      .from('financial_accounts')
      .select('id')
      .like('label', `%${MARK}%`)

    for (const item of stray ?? []) {
      const { data: strayMisc } = await admin
        .from('misc_payments')
        .select('id')
        .eq('account_id', item.id)
      for (const payment of strayMisc ?? []) {
        await admin.from('treasury_entries').delete().eq('misc_payment_id', payment.id)
        await admin.from('misc_payments').delete().eq('id', payment.id)
      }
      await admin.from('treasury_entries').delete().eq('account_id', item.id)
      await admin.from('financial_accounts').delete().eq('id', item.id)
    }

    for (const member of fixtures.members) {
      await admin
        .from('project_members')
        .delete()
        .eq('project_id', member.projectId)
        .eq('user_id', member.userId)
    }

    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    const demoApres = await demoFootprint(admin)
    for (const [key, label] of [
      ['clients', 'clients'],
      ['vehicles', 'véhicules'],
      ['suppliers', 'fournisseurs'],
      ['supplierInvoices', 'factures fournisseurs'],
      ['imputations', 'imputations'],
    ]) {
      check(
        demoApres[key] === demoAvant[key],
        `Les ${label} DEMO sont intacts`,
        `${demoApres[key]} / ${demoAvant[key]} au départ`
      )
    }

    const [{ count: leftAccounts }, { count: leftUsers }] = await Promise.all([
      admin
        .from('financial_accounts')
        .select('id', { count: 'exact', head: true })
        .like('label', '%RECETTE AJU%'),
      admin
        .from('app_users')
        .select('id', { count: 'exact', head: true })
        .like('username', 'recette.aju.%'),
    ])

    if ((leftAccounts ?? 0) > 0 || (leftUsers ?? 0) > 0) {
      console.log(
        `\n${RED}RÉSIDUS : ${leftAccounts} compte(s) financier(s), ${leftUsers} compte(s) utilisateur.${RESET}`
      )
      failed += 1
    } else {
      console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
    }

    await browser.close()
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE DES AJUSTEMENTS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE DES AJUSTEMENTS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exitCode = 1
})
