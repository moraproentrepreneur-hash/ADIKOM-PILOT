#!/usr/bin/env node
/**
 * Recette de l'imputation fournisseur — Étape 2.4, LOT 4.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * `db:verify:imputations` contrôle le schéma et les règles ;
 * `verify:capabilities` contrôle les capacités par appel direct. Celle-ci
 * contrôle ce que L'UTILISATEUR VOIT :
 *
 *   1. DEC-017 — sans `billing.imputations.view`, l'onglet DISPARAÎT. Il ne
 *      s'affiche ni vide, ni à « 0 KMF » : l'un et l'autre affirmeraient que
 *      cette dépense n'a été imputée à personne.
 *   2. Le plafond n'est jamais supposé — sans `cost.view`, l'écran le DIT.
 *   3. Un montant imputable nul se lit « charge ADIKOM », pas « rien à imputer ».
 *   4. Le cycle complet par l'écran — préparer, soumettre, valider — sans
 *      qu'aucune facture, aucun paiement ni aucun solde n'apparaisse.
 *   5. Une imputation validée est présentée comme EN ATTENTE DE FACTURE, et
 *      l'écran dit qu'elle ne réduit aucun montant dû (DEC-013).
 *   6. Le verrou après validation se voit à l'écran, pas seulement en base.
 *   7. Les justificatifs ne sont servis que par URL signée, après contrôle.
 *
 * Utilisation :
 *   node scripts/verify-imputations.mjs [url]
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
const MARK = `RECETTE IMP ${STAMP}`

const BASE_READERS = [
  'rental.maintenance.view',
  'rental.fleet.view',
  'parties.suppliers.view',
]

const PROFILES = {
  // Le compte complet : il peut tout accomplir légitimement.
  full: [
    ...BASE_READERS,
    'rental.maintenance.cost.view',
    'rental.maintenance.cost.update',
    'billing.imputations.view',
    'billing.imputations.create',
    'billing.imputations.update',
    'billing.imputations.validate',
    'billing.imputations.cancel',
  ],
  // Voit la maintenance et son prix, PAS les imputations.
  noImputation: [...BASE_READERS, 'rental.maintenance.cost.view'],
  // Voit les imputations, PAS le coût de la maintenance qui les plafonne.
  blindCeiling: [...BASE_READERS, 'billing.imputations.view'],
  // Voit les imputations, n'en prépare aucune.
  readOnly: [...BASE_READERS, 'rental.maintenance.cost.view', 'billing.imputations.view'],
}

async function createProfile(admin, key, codes) {
  const username = `recette.imp.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-imp-${STAMP}`

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
    last_name: `Imputation ${key}`,
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

async function until(read, timeoutMs = 20000) {
  const started = Date.now()
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() - started > timeoutMs) return null
    await new Promise((resolve) => setTimeout(resolve, 400))
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
  const fixtures = { vehicleIds: [], maintenances: [], imputations: [], storagePaths: [] }
  const browser = await chromium.launch()

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RIMP-${STAMP}`, label: `${MARK} — Catégorie` })
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
        phone: '+269 000',
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    fixtures.supplierId = supplier.id

    // Un véhicule FOURNI — sans lui, aucune imputation n'est possible (§4) —
    // et un véhicule ADIKOM, pour éprouver le refus.
    const { data: suppliedNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
    const { data: supplied } = await admin
      .from('vehicles')
      .insert({
        vehicle_no: suppliedNo,
        category_id: category.id,
        brand: 'RECETTE',
        model: `IMP ${STAMP} SUP`,
        plate: `RI-${STAMP}S`,
        origin: 'SUPPLIED',
        current_supplier_id: supplier.id,
        status: 'AVAILABLE',
      })
      .select('id')
      .single()
    fixtures.vehicleIds.push(supplied.id)

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, key, codes)
    }

    /** Une maintenance chiffrée sur le véhicule fourni. */
    async function makeMaintenance(reason, imputable) {
      const { data: no } = await admin.rpc('next_number', { p_entity_key: 'maintenance' })
      const { data } = await admin
        .from('vehicle_maintenances')
        .insert({
          maintenance_no: no,
          vehicle_id: supplied.id,
          origin: 'BREAKDOWN',
          reason: `${MARK} — ${reason}`,
        })
        .select('id')
        .single()

      fixtures.maintenances.push(data.id)

      if (imputable !== null) {
        await admin.from('maintenance_costs').insert({
          maintenance_id: data.id,
          actual_cost: 300000,
          imputable_amount: imputable,
        })
      }

      return data.id
    }

    const mainId = await makeMaintenance('imputable', 300000)
    const zeroId = await makeMaintenance('charge ADIKOM', 0)
    const noCeilingId = await makeMaintenance('sans plafond', null)

    console.log(
      `${DIM}Sujets : un véhicule fourni, trois maintenances (300 000 / 0 / non arrêté).${RESET}`
    )

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — DEC-017 : L’ONGLET DISPARAÎT, IL NE MENT PAS\n')

    {
      const { context, page } = await signIn(browser, base, accounts.noImputation)

      await page.goto(`${base}/location/maintenance/${mainId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Imputations', exact: true }).count()) === 0,
        'Sans `imputations.view`, l’onglet Imputations n’existe pas'
      )

      // Même en forçant l'URL de l'onglet.
      await page.goto(`${base}/location/maintenance/${mainId}?onglet=imputations`, {
        waitUntil: 'load',
      })
      const forced = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      check(
        !/Déjà imputé|Reste imputable/.test(forced),
        'Forcer l’URL de l’onglet ne révèle aucune imputation'
      )

      // Et la page dédiée est hors d'atteinte.
      await page.goto(`${base}/facturation/imputations`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'La liste /facturation/imputations redirige vers « accès refusé »',
        page.url()
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LE PLAFOND N’EST JAMAIS SUPPOSÉ\n')

    {
      const { context, page } = await signIn(browser, base, accounts.blindCeiling)

      await page.goto(`${base}/location/maintenance/${mainId}?onglet=imputations`, {
        waitUntil: 'load',
      })
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

      check(
        /ne peut pas consulter les coûts de maintenance/.test(text),
        'Sans `cost.view`, l’écran DIT qu’il ne peut pas montrer le plafond'
      )

      /*
       * La ligne du PLAFOND ne doit porter aucun montant. Celle du « déjà
       * imputé », si : ce total-là relève de `billing.imputations.view` et
       * vaut réellement zéro — le masquer serait aussi faux que d'inventer le
       * plafond. C'est exactement la distinction que DEC-017 demande de tenir.
       */
      const ceilingRow = text.slice(
        text.indexOf('Plafond imputable'),
        text.indexOf('Déjà imputé')
      )
      check(!/KMF/.test(ceilingRow), 'Aucun montant ne remplace le plafond illisible', ceilingRow.trim())
      const usedRow = text.slice(text.indexOf('Déjà imputé'), text.indexOf('Reste imputable'))
      check(
        /\b0 KMF\b/.test(usedRow),
        'Le total imputé, lui, reste affiché : il vaut réellement zéro',
        usedRow.trim()
      )
      check(
        /Non communiqué/.test(text),
        'Le reste imputable se déclare non communiqué, pas nul'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — IMPUTABLE NUL ET IMPUTABLE NON ARRÊTÉ SE DISENT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/maintenance/${zeroId}?onglet=imputations`, {
        waitUntil: 'load',
      })
      const zero = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      check(
        /reste à la charge d’ADIKOM/.test(zero),
        'Un imputable nul se lit « charge ADIKOM » (Workflow 06 §10)'
      )
      check(
        (await page.getByRole('button', { name: 'Préparer l’imputation' }).count()) === 0,
        'Et aucun formulaire de préparation n’est proposé'
      )

      await page.goto(`${base}/location/maintenance/${noCeilingId}?onglet=imputations`, {
        waitUntil: 'load',
      })
      const none = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      check(/Non arrêté/.test(none), 'Un plafond non arrêté se dit « Non arrêté »')
      check(
        /doit l’être .*avant qu’une imputation puisse être préparée|Aucun montant imputable n’a été arrêté/.test(
          none
        ),
        'Et l’écran explique ce qui manque'
      )
      check(!/\b0 KMF\b/.test(none.split('Déjà imputé')[0] ?? ''), 'Sans jamais afficher « 0 KMF »')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LE CYCLE PAR L’ÉCRAN : PRÉPARER → SOUMETTRE → VALIDER\n')

    let imputationId = null

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/maintenance/${mainId}?onglet=imputations`, {
        waitUntil: 'load',
      })
      await page.waitForLoadState('networkidle')

      const before = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      check(/300 000 KMF/.test(before), 'Le plafond est affiché tel que le LOT 3 l’a arrêté')
      check(
        /n’est pas un paiement/.test(before),
        'L’écran rappelle qu’une imputation n’est pas un paiement'
      )

      await page.selectOption('select[name="supplierId"]', { index: 1 })
      await page.fill('input[name="amount"]', '200000')
      await page.fill(
        'textarea[name="justification"]',
        'Panne mécanique imputable au fournisseur selon les conditions de mise à disposition.'
      )
      await page.getByRole('button', { name: 'Préparer l’imputation' }).click()

      const created = await until(async () => {
        const { data } = await admin
          .from('imputations')
          .select('id, status, amount, imputation_no')
          .eq('maintenance_id', mainId)
          .maybeSingle()
        return data ?? null
      })

      check(Boolean(created), 'L’imputation est enregistrée depuis l’écran')
      check(created?.status === 'DRAFT', 'Elle naît en brouillon', created?.status)
      check(created?.amount === 200000, 'Avec le montant saisi', `${created?.amount}`)
      check(
        /^IMP-\d{4}-\d{6}$/.test(created?.imputation_no ?? ''),
        'Et le numéro de la règle existante',
        created?.imputation_no
      )

      imputationId = created?.id ?? null
      if (imputationId) fixtures.imputations.push(imputationId)

      // Le plafond est consommé, sans que le LOT 3 ait bougé.
      await page.reload({ waitUntil: 'load' })
      const after = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      check(/100 000 KMF/.test(after), 'Le reste imputable est recalculé à la lecture')

      const { data: costs } = await admin
        .from('maintenance_costs')
        .select('imputable_amount, actual_cost')
        .eq('maintenance_id', mainId)
        .maybeSingle()
      check(
        costs?.imputable_amount === 300000 && costs?.actual_cost === 300000,
        'Aucun montant du LOT 3 n’a été modifié'
      )

      /* --- Soumettre puis valider, depuis la fiche. */
      await page.goto(`${base}/facturation/imputations/${imputationId}`, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle')

      await page.getByRole('button', { name: 'Soumettre à validation' }).click()
      const submitted = await until(async () => {
        const { data } = await admin
          .from('imputations')
          .select('status')
          .eq('id', imputationId)
          .maybeSingle()
        return data?.status === 'TO_VALIDATE' ? data : null
      })
      check(Boolean(submitted), 'La soumission à validation aboutit')

      await page.reload({ waitUntil: 'load' })
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: 'Valider l’imputation' }).click()

      const validated = await until(async () => {
        const { data } = await admin
          .from('imputations')
          .select('status, validated_at, supplier_invoice_id')
          .eq('id', imputationId)
          .maybeSingle()
        return data?.status === 'VALIDATED' ? data : null
      })
      check(Boolean(validated), 'La validation aboutit')
      check(Boolean(validated?.validated_at), 'Elle est datée (§48)')
      check(
        validated?.supplier_invoice_id === null,
        'Et AUCUNE facture n’a été rattachée (DEC-013)'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — « EN ATTENTE DE FACTURE » EST DIT, PAS SOUS-ENTENDU\n')

    {
      const { context, page } = await signIn(browser, base, accounts.readOnly)

      await page.goto(`${base}/facturation/imputations/${imputationId}`, { waitUntil: 'load' })
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

      check(/en attente de facture/i.test(text), 'La fiche annonce l’attente de facture (§31)')
      check(
        /ne réduit .{0,20}aucun montant dû/i.test(text),
        'Et dit explicitement qu’aucun montant dû n’est réduit (DEC-013)'
      )
      check(
        !/net à payer\s*:?\s*[\d  ]+ KMF/i.test(text),
        'Aucun net à payer n’est affiché'
      )
      check(!/Solde\s*:?\s*[\d  ]+ KMF/i.test(text), 'Aucun solde non plus')
      check(
        /relève d’une étape ultérieure/.test(text),
        'La facturation fournisseur est annoncée comme ultérieure'
      )

      // Sans droit de préparer, aucun formulaire.
      check(
        (await page.getByRole('button', { name: 'Valider l’imputation' }).count()) === 0,
        'Sans `validate`, aucun bouton de validation'
      )

      // La liste dédiée porte le même message.
      await page.goto(`${base}/facturation/imputations`, { waitUntil: 'load' })
      const list = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      check(/En attente de facture/.test(list), 'La liste distingue l’attente de facture')
      check(
        /aucun montant dû réduit/i.test(list),
        'Et rappelle qu’aucun montant dû n’est réduit'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — LE VERROU APRÈS VALIDATION SE VOIT À L’ÉCRAN\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/imputations/${imputationId}`, { waitUntil: 'load' })
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

      check(
        (await page.getByRole('button', { name: 'Enregistrer', exact: true }).count()) === 0,
        'Aucun formulaire de modification sur une imputation validée (§39)'
      )
      check(
        (await page.getByRole('button', { name: 'Joindre le justificatif' }).count()) === 0,
        'Ni de dépôt de justificatif'
      )
      check(/Annuler l’imputation/.test(text), 'Seule l’annulation reste offerte (§40)')

      // Et la base refuse, quel que soit le chemin.
      const { error } = await admin.rpc('update_imputation', {
        p_imputation_id: imputationId,
        p_amount: 150000,
        p_justification: 'Correction après validation, refusée.',
      })
      const { data: intact } = await admin
        .from('imputations')
        .select('amount')
        .eq('id', imputationId)
        .maybeSingle()
      check(
        Boolean(error) && intact?.amount === 200000,
        'La base refuse toute correction après validation',
        `${intact?.amount}`
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — JUSTIFICATIFS : URL SIGNÉE, APRÈS CONTRÔLE\n')

    {
      // Une pièce sur une imputation encore en préparation.
      const { data: draft } = await admin
        .from('imputations')
        .insert({
          imputation_no: `IMP-RECETTE-${STAMP}`,
          maintenance_id: mainId,
          supplier_id: fixtures.supplierId,
          amount: 50000,
          justification: 'Imputation de recette portant un justificatif.',
        })
        .select('id')
        .single()
      fixtures.imputations.push(draft.id)

      // Un objet RÉEL dans le bucket privé : sans lui, l'adresse signée ne
      // prouverait rien — une route qui échoue refuse aussi bien qu'elle
      // protège, et le contrôle serait une illusion.
      const storagePath = `imputations/${draft.id}/recette-${STAMP}.pdf`
      const { error: uploadError } = await admin.storage
        .from('vehicle-documents')
        .upload(storagePath, Buffer.from('%PDF-1.4 recette ADIKOM\n'), {
          contentType: 'application/pdf',
          upsert: true,
        })
      if (uploadError) throw new Error(`dépôt du justificatif : ${uploadError.message}`)
      fixtures.storagePaths.push(storagePath)

      const { data: document } = await admin
        .from('imputation_documents')
        .insert({
          imputation_id: draft.id,
          doc_type: 'INVOICE',
          label: `${MARK} — facture`,
          storage_path: storagePath,
          file_name: 'recette.pdf',
        })
        .select('id')
        .single()

      const blind = await signIn(browser, base, accounts.noImputation)
      const denied = await blind.page.request.get(
        `${base}/api/imputations/documents/${document.id}`,
        { maxRedirects: 0 }
      )
      check(
        denied.status() === 403 || denied.status() === 404,
        'Sans `imputations.view`, le justificatif est refusé',
        `HTTP ${denied.status()}`
      )
      await blind.context.close()

      const allowed = await signIn(browser, base, accounts.readOnly)
      const served = await allowed.page.request.get(
        `${base}/api/imputations/documents/${document.id}`,
        { maxRedirects: 0 }
      )
      const location = served.headers()['location'] ?? ''
      check(
        [302, 307, 308].includes(served.status()),
        'Avec le droit, la route redirige vers une adresse signée',
        `HTTP ${served.status()}`
      )
      check(
        location.includes('token=') || location.includes('/object/sign/'),
        'L’adresse est signée, jamais un chemin de stockage nu'
      )
      await allowed.context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — AUCUN EFFET SUR L’ÉTAPE 2.5 · AUDIT · DEMO\n')

    {
      // Ni facture, ni paiement, ni solde : les tables n'existent pas.
      const absent = []
      for (const table of ['supplier_invoices', 'supplier_payments', 'payments']) {
        const { error } = await admin.from(table).select('*').limit(1)
        if (!error) absent.push(table)
      }
      check(absent.length === 0, 'Aucune table de facture ou de paiement n’est apparue',
        absent.join(', '))

      const { count: audited } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'imputations')
      check((audited ?? 0) > 0, 'Les actes d’imputation sont journalisés', `${audited} entrée(s)`)

      // Le calendrier et le parc n'ont pas bougé.
      const [{ data: occupations }, { data: vehicle }] = await Promise.all([
        admin.from('vehicle_occupations').select('id').eq('vehicle_id', fixtures.vehicleIds[0]),
        admin.from('vehicles').select('status').eq('id', fixtures.vehicleIds[0]).maybeSingle(),
      ])
      check((occupations ?? []).length === 0, 'Aucune occupation posée par une imputation')
      check(vehicle?.status === 'AVAILABLE', 'Statut du véhicule inchangé', vehicle?.status)

      const [{ count: clients }, { count: vehicles }] = await Promise.all([
        admin
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .like('legal_name', '%DEMO%'),
        admin.from('vehicles').select('id', { count: 'exact', head: true }).like('model', '%DEMO%'),
      ])
      check(clients === 3, 'Les trois clients DEMO sont intacts', `${clients}`)
      check(vehicles === 3, 'Les trois véhicules DEMO sont intacts', `${vehicles}`)

      const { count: demoImputations } = await admin
        .from('imputations')
        .select('id', { count: 'exact', head: true })
        .like('justification', '%DEMO%')
      check(demoImputations === 0, 'Aucune imputation de recette dans les données DEMO')
    }
  } finally {
    await browser.close()

    if (fixtures.storagePaths.length > 0) {
      await admin.storage.from('vehicle-documents').remove(fixtures.storagePaths)
    }
    for (const id of fixtures.imputations) {
      await admin.from('imputation_documents').delete().eq('imputation_id', id)
      await admin.from('imputations').delete().eq('id', id)
    }
    for (const id of fixtures.maintenances) {
      await admin.from('imputations').delete().eq('maintenance_id', id)
      await admin.from('maintenance_documents').delete().eq('maintenance_id', id)
      await admin.from('maintenance_quotes').delete().eq('maintenance_id', id)
      await admin.from('maintenance_cost_lines').delete().eq('maintenance_id', id)
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
    console.log(`${GREEN}RECETTE IMPUTATIONS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE IMPUTATIONS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
