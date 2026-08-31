#!/usr/bin/env node
/**
 * Recette de la facture fournisseur — Étape 2.5, LOT 5.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * `db:verify:supplier-invoices` contrôle le schéma et les règles ;
 * `verify:capabilities` contrôle les capacités par appel direct. Celle-ci
 * contrôle ce que L'UTILISATEUR VOIT :
 *
 *   1. DEC-017 — sans `billing.supplier_invoices.view`, le menu et l'onglet
 *      DISPARAISSENT, et l'URL forcée ne révèle rien.
 *   2. Le cycle complet par l'écran : enregistrer, chiffrer, soumettre, valider.
 *   3. Le montant brut est la somme des lignes, et une ligne retirée en sort.
 *   4. Le rattachement d'une imputation RÉDUIT le net à payer — et l'écran dit
 *      que ce n'est pas un paiement (Module 07 §37).
 *   5. Le plafond de Workflow 06 §20 se voit à l'écran, pas seulement en base.
 *   6. Le détachement restitue le net à payer.
 *   7. Sans `billing.imputations.view`, le net à payer n'est PAS affiché à
 *      zéro : l'écran dit qu'il ne peut pas le calculer.
 *   8. Aucun montant payé, aucun solde : l'écran le DIT.
 *
 * Utilisation :
 *   node scripts/verify-supplier-invoices.mjs [url]
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
const MARK = `RECETTE FAC ${STAMP}`

const BASE_READERS = [
  'parties.suppliers.view',
  'rental.fleet.view',
  'rental.maintenance.view',
  'rental.maintenance.cost.view',
]

const PROFILES = {
  // Le compte complet : il peut tout accomplir légitimement.
  full: [
    ...BASE_READERS,
    'billing.supplier_invoices.view',
    'billing.supplier_invoices.create',
    'billing.supplier_invoices.update',
    'billing.supplier_invoices.validate',
    'billing.supplier_invoices.cancel',
    'billing.imputations.view',
    'billing.imputations.create',
    'billing.imputations.update',
    'billing.imputations.validate',
    'billing.imputations.cancel',
  ],
  // Voit les imputations, PAS les factures.
  noInvoice: [...BASE_READERS, 'billing.imputations.view'],
  // Voit les factures, PAS les imputations qui les réduisent.
  noImputation: [...BASE_READERS, 'billing.supplier_invoices.view'],
}

async function createProfile(admin, key, codes) {
  const username = `recette.fac.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-fac-${STAMP}`

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
    last_name: `Facture ${key}`,
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

/** Texte de la zone principale, espaces normalisés. */
async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/**
 * Déclenche un acte et ATTEND SON RÉSULTAT ANNONCÉ.
 *
 * `networkidle` ne prouve rien ici : une action serveur rend son résultat par
 * un nouvel arbre React, sans navigation. Attendre le message que l'écran
 * promet est le seul repère fiable — et c'est aussi ce qu'un utilisateur
 * attendrait avant de continuer.
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
 * Valider une facture retire le panneau de validation ; rattacher une
 * imputation retire celui du rattachement. Le message de succès s'en va avec
 * eux, et chercher un texte dans la page est trompeur — le panneau de
 * détachement, par exemple, ANNONCE lui-même « en attente de facture » avant
 * que rien ne soit fait.
 *
 * Le seul repère non ambigu est donc la disparition du bouton : elle ne
 * survient qu'une fois l'état changé côté serveur, et l'écran re-rendu.
 */
async function actUntil(page, buttonName, needle, timeout = 60000) {
  const button = page.getByRole('button', { name: buttonName }).first()
  await button.waitFor({ state: 'visible', timeout: 30000 })
  // L'hydratation n'est pas couverte par l'attente d'actionabilité : un clic
  // trop tôt part dans le vide.
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
  const fixtures = { vehicleIds: [], maintenances: [], imputations: [], invoices: [] }
  const browser = await chromium.launch()

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RFAC-${STAMP}`, label: `${MARK} — Catégorie` })
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
        phone: '+269 100',
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    fixtures.supplierId = supplier.id

    // DEC-028 : un SECOND fournisseur, pour prouver que l'unicité de la
    // référence lui est propre et ne déborde pas sur ses confrères.
    const { data: supplierBNo } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
    const { data: supplierB } = await admin
      .from('suppliers')
      .insert({
        supplier_no: supplierBNo,
        type: 'VEHICLE_SUPPLIER',
        legal_name: `${MARK} — Fournisseur B`,
        phone: '+269 101',
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    fixtures.supplierBId = supplierB.id

    const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
    const { data: vehicle } = await admin
      .from('vehicles')
      .insert({
        vehicle_no: vehicleNo,
        category_id: category.id,
        brand: 'RECETTE',
        model: `FAC ${STAMP}`,
        plate: `RF-${STAMP}`,
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

    /** Une imputation validée, en attente de facture (§31). */
    async function makeImputation(amount, reason) {
      const { data: no } = await admin.rpc('next_number', { p_entity_key: 'maintenance' })
      const { data: maintenance } = await admin
        .from('vehicle_maintenances')
        .insert({
          maintenance_no: no,
          vehicle_id: vehicle.id,
          origin: 'BREAKDOWN',
          reason: `${MARK} — ${reason}`,
        })
        .select('id')
        .single()
      fixtures.maintenances.push(maintenance.id)

      await admin.from('maintenance_costs').insert({
        maintenance_id: maintenance.id,
        actual_cost: amount,
        imputable_amount: amount,
      })

      const { data: impId, error } = await admin.rpc('create_imputation', {
        p_maintenance_id: maintenance.id,
        p_supplier_id: supplier.id,
        p_amount: amount,
        p_justification: `${MARK} — ${reason}`,
      })
      if (error) throw new Error(`imputation : ${error.message}`)

      fixtures.imputations.push(impId)
      await admin.rpc('submit_imputation', { p_imputation_id: impId })
      await admin.rpc('validate_imputation', { p_imputation_id: impId, p_reason: 'Recette' })

      return impId
    }

    const impMain = await makeImputation(300000, 'réparation imputable')
    const impBig = await makeImputation(400000, 'réparation trop lourde')

    console.log(
      `${DIM}Sujets : un véhicule fourni, deux imputations validées (300 000 / 400 000).${RESET}`
    )

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — DEC-017 : SANS LA CAPACITÉ, L’ÉCRAN DISPARAÎT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.noInvoice)

      check(
        (await page.getByRole('link', { name: 'Factures fournisseurs' }).count()) === 0,
        'Sans `supplier_invoices.view`, le menu Factures fournisseurs n’apparaît pas'
      )

      await page.goto(`${base}/facturation/fournisseurs`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'L’URL forcée de la liste mène à un refus explicite',
        page.url().replace(base, '')
      )

      await page.goto(`${base}/tiers/fournisseurs/${supplier.id}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Factures', exact: true }).count()) === 0,
        'L’onglet Factures de la fiche fournisseur n’existe pas non plus'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LE CYCLE COMPLET PAR L’ÉCRAN\n')

    let invoiceId = null

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/fournisseurs/nouvelle`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#supplierId') !== null)

      await page.selectOption('#supplierId', supplier.id)
      await page.fill('#externalRef', `FRN-${STAMP}`)
      await page.fill('#invoiceDate', '2026-08-01')
      await page.fill('#dueDate', '2026-09-01')

      /*
       * Le bouton est désigné par son NOM, jamais par `button[type=submit]` :
       * la barre de l'application en porte un autre — « Se déconnecter » —, et
       * un sélecteur générique le trouverait en premier.
       */
      await page.getByRole('button', { name: 'Enregistrer la facture' }).click()
      await page.waitForURL(/\/facturation\/fournisseurs\/[0-9a-f-]{36}/, { timeout: 30000 })

      invoiceId = page.url().split('/facturation/fournisseurs/')[1]?.split('?')[0] ?? null
      if (invoiceId) fixtures.invoices.push(invoiceId)

      check(Boolean(invoiceId), 'La facture est enregistrée et sa fiche s’ouvre')

      let text = await mainText(page)
      check(/FAC-F-\d{4}-\d{6}/.test(text), 'Le numéro interne ADIKOM est attribué')
      check(text.includes(`FRN-${STAMP}`), 'La référence du fournisseur est conservée, distincte')
      check(
        /Aucun règlement n’est géré/.test(text),
        'L’écran DIT qu’aucun montant payé ni solde n’est calculé'
      )

      /** Le montant brut lu sur la fiche, en entier (DEC-010). */
      async function grossOnScreen() {
        const row = await page
          .locator('dt', { hasText: 'Montant brut' })
          .first()
          .locator('xpath=following-sibling::dd[1]')
          .innerText()
        return Number(row.replace(/[^\d]/g, ''))
      }

      // --- Les lignes font le montant brut.
      async function addLine(label, amount) {
        await page.fill('#label', label)
        await page.fill('#amount', String(amount))
        await act(page, 'Ajouter la ligne', 'La ligne a été ajoutée')
        await page.reload({ waitUntil: 'load' })
      }

      await addLine(`${MARK} — mise à disposition`, 400000)
      await addLine(`${MARK} — complément`, 200000)

      check(
        (await grossOnScreen()) === 600000,
        'Le montant brut est la somme des lignes (600 000)',
        `${await grossOnScreen()}`
      )

      /*
       * Le retrait d'une ligne n'annonce rien : c'est un lien discret, sans
       * message de succès. Le repère fiable est donc le MONTANT BRUT lui-même,
       * relu jusqu'à ce qu'il ait bougé.
       */
      async function waitForGross(expected, timeout = 45000) {
        const started = Date.now()
        for (;;) {
          const value = await grossOnScreen().catch(() => null)
          if (value === expected) return value
          if (Date.now() - started > timeout) return value
          await page.waitForTimeout(1000)
          if (Date.now() - started > timeout / 2) await page.reload({ waitUntil: 'load' })
        }
      }

      // Une ligne retirée sort du total, sans être effacée.
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: 'Retirer' }).last().click()
      const afterRemoval = await waitForGross(400000)
      check(
        afterRemoval === 400000,
        'Une ligne retirée sort du montant brut (400 000)',
        `${afterRemoval}`
      )

      // On ramène le brut à 500 000, montant de l'exemple de référence.
      await addLine(`${MARK} — solde de mise à disposition`, 100000)
      check(
        (await grossOnScreen()) === 500000,
        'Montant brut ramené à 500 000 KMF',
        `${await grossOnScreen()}`
      )

      /* --- DEC-028 : la référence ne se répète pas chez le même fournisseur. */
      await page.goto(`${base}/facturation/fournisseurs/nouvelle`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#supplierId') !== null)
      await page.selectOption('#supplierId', supplier.id)
      await page.fill('#externalRef', `FRN-${STAMP}`)
      await page.fill('#invoiceDate', '2026-08-02')
      await act(page, 'Enregistrer la facture', 'porte déjà la référence')

      text = await mainText(page)
      check(
        /porte déjà la référence/i.test(text),
        'Un doublon de référence est refusé, et l’écran nomme la facture existante'
      )
      check(
        page.url().includes('/nouvelle'),
        'Aucune seconde facture n’a été créée',
        page.url().replace(base, '')
      )

      // Le MÊME numéro chez un AUTRE fournisseur reste légitime. On repart d'un
      // formulaire neuf, comme le ferait l'utilisateur après un refus.
      await page.goto(`${base}/facturation/fournisseurs/nouvelle`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#supplierId') !== null)
      await page.selectOption('#supplierId', fixtures.supplierBId)
      await page.fill('#externalRef', `FRN-${STAMP}`)
      await page.fill('#invoiceDate', '2026-08-02')
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: 'Enregistrer la facture' }).click()
      await page.waitForURL(/\/facturation\/fournisseurs\/[0-9a-f-]{36}/, { timeout: 45000 })

      const secondId = page.url().split('/facturation/fournisseurs/')[1]?.split('?')[0] ?? null
      if (secondId) fixtures.invoices.push(secondId)
      check(
        Boolean(secondId),
        'Deux fournisseurs peuvent porter la même référence',
        `FRN-${STAMP}`
      )

      // Retour à la facture du cycle.
      await page.goto(`${base}/facturation/fournisseurs/${invoiceId}`, { waitUntil: 'load' })

      /*
       * --- Soumettre puis valider.
       *
       * Le repère est le libellé d'EFFET du nouvel état — « Saisie complète »,
       * puis « Dette reconnue ». Il n'apparaît nulle part ailleurs, là où
       * « En attente » ou « Validée » figurent aussi dans des phrases
       * explicatives.
       */
      await actUntil(page, 'Soumettre au contrôle', 'Saisie complète')
      await page.reload({ waitUntil: 'load' })
      text = await mainText(page)
      check(text.includes('En attente'), 'La facture passe « En attente »')

      await actUntil(page, 'Valider la facture', 'Dette reconnue')
      await page.reload({ waitUntil: 'load' })
      text = await mainText(page)
      check(text.includes('Validée'), 'La facture passe « Validée »')
      check(
        /Dette reconnue/.test(text),
        'L’écran dit que la validation reconnaît une dette, sans la payer'
      )

      await context.close()
    }

    if (!invoiceId) throw new Error('La facture n’a pas pu être créée : recette interrompue.')

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — LE RATTACHEMENT RÉDUIT LE NET À PAYER (DEC-013)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      // §20 : 400 000 sur une facture de 500 000 déjà nette de rien passe ;
      // c'est le CUMUL qui doit être refusé. On rattache d'abord la grosse.
      await page.goto(`${base}/facturation/imputations/${impBig}`, { waitUntil: 'load' })
      let text = await mainText(page)
      check(
        /en attente de facture/i.test(text),
        'Une imputation validée est présentée « en attente de facture »'
      )

      await page.waitForFunction(() => document.querySelector('#invoiceId') !== null)
      await page.selectOption('#invoiceId', invoiceId)
      await actUntil(page, 'Rattacher à la facture', 'Prise en compte dans le montant dû')
      await page.reload({ waitUntil: 'load' })
      text = await mainText(page)
      check(text.includes('Imputée'), 'L’imputation de 400 000 passe « Imputée »')
      check(
        /n’est pas un paiement/i.test(text),
        'L’écran rappelle qu’une imputation n’est jamais un paiement (§37)'
      )

      // Le net à payer de la facture a diminué.
      await page.goto(`${base}/facturation/fournisseurs/${invoiceId}`, { waitUntil: 'load' })
      const net = Number(
        (
          await page
            .locator('dt', { hasText: 'Net à payer' })
            .first()
            .locator('xpath=following-sibling::dd[1]')
            .innerText()
        ).replace(/[^\d]/g, '')
      )
      check(net === 100000, 'Net à payer = 500 000 − 400 000 = 100 000 KMF', `${net}`)

      // §20 : 400 000 + 300 000 dépasserait 500 000.
      await page.goto(`${base}/facturation/imputations/${impMain}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#invoiceId') !== null)
      await page.selectOption('#invoiceId', invoiceId)
      await act(page, 'Rattacher à la facture', 'dépasser le montant de la facture')
      text = await mainText(page)
      check(
        /dépasser le montant de la facture/i.test(text),
        'Le plafond de Workflow 06 §20 est refusé à l’écran, avec son motif'
      )

      const { data: stillWaiting } = await admin
        .from('imputations')
        .select('status, supplier_invoice_id')
        .eq('id', impMain)
        .maybeSingle()
      check(
        stillWaiting?.status === 'VALIDATED' && stillWaiting?.supplier_invoice_id === null,
        'L’imputation refusée n’a pas bougé',
        `${stillWaiting?.status}`
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — ANNULATION REFUSÉE, PUIS DÉTACHEMENT (§39)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/fournisseurs/${invoiceId}`, { waitUntil: 'load' })
      await act(page, 'Annuler la facture', 'doit d’abord en être détachée')
      let text = await mainText(page)
      check(
        /doit d’abord en être détachée|réduisent encore cette facture/i.test(text),
        'Une facture portant une imputation ne s’annule pas, et l’écran dit pourquoi'
      )

      const { data: stillValidated } = await admin
        .from('supplier_invoices')
        .select('status')
        .eq('id', invoiceId)
        .maybeSingle()
      check(stillValidated?.status === 'VALIDATED', 'La facture n’a pas été annulée')

      // Détachement depuis la fiche de l'imputation.
      await page.goto(`${base}/facturation/imputations/${impBig}`, { waitUntil: 'load' })
      await actUntil(page, 'Détacher de la facture', 'Ne réduit encore aucun montant dû')
      await page.reload({ waitUntil: 'load' })
      text = await mainText(page)
      check(
        /validée et en attente de facture/i.test(text),
        'Détachée, l’imputation redevient « en attente de facture »'
      )

      await page.goto(`${base}/facturation/fournisseurs/${invoiceId}`, { waitUntil: 'load' })
      const restored = Number(
        (
          await page
            .locator('dt', { hasText: 'Net à payer' })
            .first()
            .locator('xpath=following-sibling::dd[1]')
            .innerText()
        ).replace(/[^\d]/g, '')
      )
      check(restored === 500000, 'Le net à payer est restitué à 500 000 KMF', `${restored}`)

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — SANS `imputations.view`, LE NET N’EST PAS AFFICHÉ À ZÉRO\n')

    {
      // On rattache de nouveau, afin qu'une déduction existe réellement.
      const { error } = await admin.rpc('attach_imputation_to_invoice', {
        p_imputation_id: impMain,
        p_invoice_id: invoiceId,
      })
      if (error) throw new Error(`rattachement de recette : ${error.message}`)

      const { context, page } = await signIn(browser, base, accounts.noImputation)

      await page.goto(`${base}/facturation/fournisseurs/${invoiceId}`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        /ne peut pas consulter les imputations/i.test(text),
        'L’écran DIT que le total imputé n’est pas lisible (DEC-017)'
      )
      check(
        /Non calculable|non calculable/.test(text),
        'Le net à payer est annoncé non calculable, jamais affiché à zéro'
      )
      check(
        !/200\s*000 KMF/.test(text),
        'Aucun net à payer n’est déduit d’une somme que le compte ne peut pas lire'
      )
      check(
        /500\s*000 KMF/.test(text),
        'Le montant brut, lui, reste lisible avec la seule capacité facture'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — AUCUN EFFET DE BORD, DONNÉES DEMO INTACTES\n')

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
      check(
        costs?.imputable_amount === 300000,
        'Le montant imputable de la maintenance n’a pas bougé'
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

      const { count: demoInvoices } = await admin
        .from('supplier_invoices')
        .select('id', { count: 'exact', head: true })
        .like('notes', '%DEMO%')
      check(demoInvoices === 0, 'Aucune facture de recette dans les données DEMO')

      const { count: total } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
      check(total === 153, 'Catalogue conforme', `${total} permissions`)
    }
  } finally {
    await browser.close()

    /*
     * Une imputation rattachée retient sa facture (`on delete restrict`), et
     * son rattachement ne se retire QUE par le détachement : la base refuse un
     * `UPDATE` qui laisserait « Imputée » sans facture. Le nettoyage emprunte
     * donc le même chemin que l'utilisateur.
     */
    for (const id of fixtures.imputations) {
      await admin.rpc('detach_imputation_from_invoice', { p_imputation_id: id })
      await admin.from('imputation_documents').delete().eq('imputation_id', id)
      await admin.from('imputations').delete().eq('id', id)
    }
    for (const id of fixtures.invoices) {
      await admin.from('supplier_invoice_lines').delete().eq('supplier_invoice_id', id)
      await admin.from('supplier_invoices').delete().eq('id', id)
    }
    // Les factures créées hors de la liste resteraient visibles : on nettoie
    // par les fournisseurs de recette, qui n'existent que pour elle.
    for (const supplierId of [fixtures.supplierId, fixtures.supplierBId]) {
      if (!supplierId) continue
      const { data: leftovers } = await admin
        .from('supplier_invoices')
        .select('id')
        .eq('supplier_id', supplierId)
      for (const row of leftovers ?? []) {
        await admin.from('supplier_invoice_lines').delete().eq('supplier_invoice_id', row.id)
        await admin.from('supplier_invoices').delete().eq('id', row.id)
      }
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
    if (fixtures.supplierBId) await admin.from('suppliers').delete().eq('id', fixtures.supplierBId)
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
    console.log(`${GREEN}RECETTE FACTURES FOURNISSEURS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE FACTURES FOURNISSEURS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
