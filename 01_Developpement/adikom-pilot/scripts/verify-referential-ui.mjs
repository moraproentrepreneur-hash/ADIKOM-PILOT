#!/usr/bin/env node
/**
 * Recette fonctionnelle du référentiel d'exploitation — ADIKOM PILOT (Étape 2.2).
 *
 * Parcourt l'interface dans un vrai navigateur, du point de vue d'un
 * utilisateur : clients, tarification, fournisseurs, coordonnées bancaires,
 * catégories, véhicules, rattachement fournisseur, documents, simulation
 * tarifaire, disponibilité et non-collision.
 *
 * Utilisation :
 *   node scripts/verify-referential-ui.mjs [url] [--restaurer-compteurs]
 *
 *   url                    par défaut http://localhost:3100
 *   --restaurer-compteurs  remet les compteurs de numérotation à leur valeur
 *                          d'avant la recette, et seulement si personne n'a
 *                          rien créé entre-temps. Désactivé par défaut :
 *                          toucher aux compteurs est une écriture volontaire.
 *
 * Identifiants : ADIKOM_ADMIN_USERNAME et ADIKOM_ADMIN_PASSWORD, définis dans
 * l'environnement du terminal — jamais dans un fichier, jamais en argument.
 *
 * TRACES LAISSÉES EN BASE
 * Les données créées sont supprimées en fin d'exécution, fichier déposé
 * compris. Les entrées du journal d'audit, elles, sont DÉFINITIVES : le
 * journal est immuable par construction. Toutes les fiches portent donc le
 * marqueur « RECETTE 2.2 », afin que ces traces restent identifiables.
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required } from './lib/env.mjs'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0

function ok(label, detail = '') {
  passed += 1
  console.log(`  ${GREEN}[OK]${RESET} ${label}${detail ? ` ${DIM}— ${detail}${RESET}` : ''}`)
}

function ko(label, detail = '') {
  failed += 1
  console.log(`  ${RED}[ÉCHEC]${RESET} ${label}${detail ? ` — ${detail}` : ''}`)
}

function expect(condition, label, detail = '') {
  if (condition) ok(label, detail)
  else ko(label, detail)
}

const MARKER = 'RECETTE 2.2'
const STAMP = Date.now().toString().slice(-6)

const CLIENT_NAME = `${MARKER} Client ${STAMP}`
const CLIENT_TWIN = `${MARKER} Homonyme ${STAMP}`
const CLIENT_PHONE = `+269 77 ${STAMP}`
const SUPPLIER_A = `${MARKER} Fournisseur A ${STAMP}`
const SUPPLIER_B = `${MARKER} Fournisseur B ${STAMP}`
const CATEGORY_LABEL = `${MARKER} Catégorie ${STAMP}`
const CATEGORY_CODE = `REC${STAMP}`
const VEHICLE_MODEL = `${MARKER} ${STAMP}`
const PLATE = `RC ${STAMP}`
const TEST_IBAN = `KM99${STAMP}0000000000`

const READER = {
  username: `recette.ui.lecture.${STAMP}`,
  email: `recette.ui.lecture.${STAMP}@adikom.test`,
  password: `recette-lecture-${STAMP}`,
  permissions: ['parties.suppliers.view', 'rental.fleet.view'],
}

/** Date décalée, au format attendu par un champ `datetime-local`. */
function inDays(days, hour = 9) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`
}

/** Même date, bornes ISO complètes, pour interroger le moteur directement. */
function isoInDays(days, hour = 9) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

/* -------------------------------------------------------------------------- */
/*  Nettoyage                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Retire tout ce que porte le marqueur.
 *
 * Exécuté au démarrage — une exécution interrompue laisse des résidus — puis en
 * fin de recette. Possible parce qu'aucun utilisateur n'est authentifié : la
 * suppression reste réservée aux opérations d'environnement (DEC-020,
 * migration 021).
 */
async function cleanup(admin) {
  // Les tarifs référencent clients, véhicules et catégories en RESTRICT :
  // ils partent d'abord.
  await admin.from('pricing_rules').delete().like('conditions', `${MARKER}%`)

  const { data: vehicles } = await admin
    .from('vehicles')
    .select('id')
    .like('notes', `${MARKER}%`)

  for (const vehicle of vehicles ?? []) {
    // Le bucket est privé : seul le rôle de service peut y faire le ménage.
    const { data: files } = await admin.storage.from('vehicle-documents').list(vehicle.id)
    if (files?.length) {
      await admin.storage
        .from('vehicle-documents')
        .remove(files.map((file) => `${vehicle.id}/${file.name}`))
    }
  }

  // Documents, occupations et historique fournisseur partent en cascade.
  await admin.from('vehicles').delete().like('notes', `${MARKER}%`)
  await admin.from('clients').delete().like('legal_name', `${MARKER}%`)
  await admin.from('suppliers').delete().like('legal_name', `${MARKER}%`)
  await admin.from('vehicle_categories').delete().like('label', `${MARKER}%`)

  const { data: stale } = await admin
    .from('app_users')
    .select('id')
    .like('username', 'recette.ui.lecture.%')

  for (const user of stale ?? []) {
    await admin.from('user_permissions').delete().eq('user_id', user.id)
    await admin.from('app_users').delete().eq('id', user.id)
    await admin.auth.admin.deleteUser(user.id)
  }
}

const COUNTER_KEYS = ['client', 'supplier', 'vehicle']

async function readCounters(admin) {
  const { data } = await admin
    .from('numbering_rules')
    .select('entity_key, current_value')
    .in('entity_key', COUNTER_KEYS)

  return Object.fromEntries((data ?? []).map((row) => [row.entity_key, row.current_value]))
}

/**
 * Remet les compteurs à leur valeur d'avant la recette.
 *
 * Uniquement si leur valeur actuelle est exactement celle que la recette a
 * laissée : c'est la preuve que personne n'a rien créé entre-temps. Sinon la
 * restauration est abandonnée — mieux vaut un trou dans la numérotation qu'un
 * numéro réattribué à deux objets différents.
 */
async function restoreCounters(admin, before, after) {
  const restored = []
  const skipped = []

  for (const key of COUNTER_KEYS) {
    if (before[key] === after[key]) continue

    /*
     * Verrou optimiste : la remise à zéro n'est appliquée que si le compteur
     * vaut encore exactement ce que la recette y a laissé. Si un utilisateur a
     * créé une fiche entre-temps, la condition ne s'applique à aucune ligne et
     * le compteur reste intact — un trou dans la numérotation vaut toujours
     * mieux qu'un numéro attribué deux fois.
     */
    const { data } = await admin
      .from('numbering_rules')
      .update({ current_value: before[key] })
      .eq('entity_key', key)
      .eq('current_value', after[key])
      .select('entity_key')

    if (data?.length) restored.push(`${key} ${after[key]} → ${before[key]}`)
    else skipped.push(key)
  }

  return { restored, skipped }
}

/* -------------------------------------------------------------------------- */
/*  Recette                                                                    */
/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const args = process.argv.slice(2)
  const restoreRequested = args.includes('--restaurer-compteurs')
  const base = args.find((arg) => !arg.startsWith('--')) ?? 'http://localhost:3100'

  const adminUser = required(
    'ADIKOM_ADMIN_USERNAME',
    'À définir dans le terminal : $env:ADIKOM_ADMIN_USERNAME="…"'
  )
  const adminPassword = required(
    'ADIKOM_ADMIN_PASSWORD',
    'À définir dans le terminal : $env:ADIKOM_ADMIN_PASSWORD="…"'
  )

  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  console.log(`\nCible   : ${base}`)
  console.log(`Marqueur : ${MARKER} · ${STAMP}\n`)

  await cleanup(admin)
  const countersBefore = await readCounters(admin)

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  const ids = { client: null, supplier: null, category: null, vehicle: null, owned: null }

  const mainText = async () => (await page.locator('main').textContent()) ?? ''

  try {
    // ------------------------------------------------------- Connexion ----
    await page.goto(`${base}/connexion`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#username') !== null)
    await page.fill('#username', adminUser)
    await page.fill('#password', adminPassword)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/tableau-de-bord', { timeout: 25000 })

    // ---------------------------------------------------- 1. Navigation ---
    console.log('1. Accès aux modules')
    for (const [label, href] of [
      ['Clients', '/tiers/clients'],
      ['Fournisseurs', '/tiers/fournisseurs'],
      ['Parc automobile', '/location/parc'],
      ['Tarification', '/location/tarification'],
    ]) {
      const link = page.locator(`aside a[href="${href}"]`).first()
      expect(await link.count(), `Entrée « ${label} » active dans la barre latérale`)
    }

    // ------------------------------------------------------- 2. Clients ---
    console.log('\n2. Clients — création, doublon, modification')
    await page.goto(`${base}/tiers/clients?q=zzzintrouvable`, { waitUntil: 'load' })
    expect(
      /Aucun client ne correspond/i.test(await mainText()),
      'État vide explicite sur la liste'
    )

    await page.goto(`${base}/tiers/clients/nouveau`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#legalName') !== null)
    await page.selectOption('#type', 'COMPANY')
    await page.fill('#legalName', CLIENT_NAME)
    await page.fill('#phone', CLIENT_PHONE)
    await page.fill('#city', 'Moroni')
    await page.locator('form:has(#legalName) button[type="submit"]').click()
    await page.waitForURL(/\/tiers\/clients\/[0-9a-f-]{36}/, { timeout: 30000 })

    ids.client = page.url().match(/clients\/([0-9a-f-]{36})/)?.[1] ?? null
    await page.waitForLoadState('networkidle')

    const clientSheet = await mainText()
    expect(Boolean(ids.client), 'Client créé', CLIENT_NAME)
    expect(clientSheet.includes(CLIENT_NAME), 'Fiche ouverte sur le nouveau client')

    const clientNo = clientSheet.match(/CLI-\d{6}/)?.[0]
    expect(Boolean(clientNo), 'Identifiant attribué par le serveur', clientNo ?? 'aucun')

    // Détection de doublon : le système avertit, il ne bloque pas (Tiers §18).
    await page.goto(`${base}/tiers/clients/nouveau`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#legalName') !== null)
    await page.fill('#legalName', CLIENT_TWIN)
    await page.fill('#phone', CLIENT_PHONE)
    await page.locator('form:has(#legalName) button[type="submit"]').click()
    await page.waitForTimeout(4000)

    const warned = await mainText()
    expect(/similaire existe déjà/i.test(warned), 'Doublon potentiel signalé')
    expect(
      /Confirmer la création/i.test(warned),
      'Création possible après confirmation — jamais bloquée'
    )

    await page.locator('form:has(#legalName) button[type="submit"]').click()
    await page.waitForURL(/\/tiers\/clients\/[0-9a-f-]{36}/, { timeout: 30000 })
    expect(
      !page.url().includes(ids.client ?? 'x'),
      'Second client créé après confirmation explicite'
    )

    // Modification
    await page.goto(`${base}/tiers/clients/${ids.client}?mode=edition`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#city') !== null)
    await page.fill('#city', 'Mutsamudu')
    await page.locator('form:has(#legalName) button[type="submit"]').click()
    await page.waitForURL(/enregistre=1/, { timeout: 30000 })
    await page.waitForLoadState('networkidle')
    expect((await mainText()).includes('Mutsamudu'), 'Modification enregistrée')

    // --------------------------------------------------- 3. Fournisseurs --
    console.log('\n3. Fournisseurs — création et coordonnées bancaires')
    for (const name of [SUPPLIER_A, SUPPLIER_B]) {
      await page.goto(`${base}/tiers/fournisseurs/nouveau`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#legalName') !== null)
      await page.fill('#legalName', name)
      await page.fill('#phone', `+269 33 ${STAMP}`)
      await page.locator('form:has(#legalName) button[type="submit"]').click()
      await page.waitForURL(/\/tiers\/fournisseurs\/[0-9a-f-]{36}/, { timeout: 30000 })

      if (name === SUPPLIER_A) {
        ids.supplier = page.url().match(/fournisseurs\/([0-9a-f-]{36})/)?.[1] ?? null
      } else {
        ids.supplierB = page.url().match(/fournisseurs\/([0-9a-f-]{36})/)?.[1] ?? null
      }
    }

    await page.waitForLoadState('networkidle')
    const supplierSheet = await mainText()
    expect(Boolean(ids.supplier), 'Fournisseurs créés', `${SUPPLIER_A} · ${SUPPLIER_B}`)
    expect(Boolean(supplierSheet.match(/FOU-\d{6}/)), 'Identifiant fournisseur attribué')

    await page.goto(`${base}/tiers/fournisseurs/${ids.supplier}?onglet=banque`, {
      waitUntil: 'load',
    })
    await page.waitForFunction(() => document.querySelector('#iban') !== null)
    await page.fill('#bankName', `${MARKER} Banque`)
    await page.fill('#accountHolder', SUPPLIER_A)
    await page.fill('#iban', TEST_IBAN)
    await page.locator('form:has(#iban) button[type="submit"]').click()
    await page.waitForTimeout(4000)
    expect(
      /enregistrées/i.test(await mainText()),
      'Coordonnées bancaires enregistrées par le Super Admin'
    )

    // ------------------------------------------------------ 4. Catégorie --
    console.log('\n4. Catégories')
    await page.goto(`${base}/location/parc/categories`, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'Nouvelle catégorie' }).click()
    await page.waitForFunction(() => document.querySelector('#code') !== null)
    await page.fill('#code', CATEGORY_CODE)
    await page.fill('#label', CATEGORY_LABEL)
    await page.locator('form:has(#code) button[type="submit"]').click()
    await page.waitForTimeout(4000)

    await page.goto(`${base}/location/parc/categories`, { waitUntil: 'load' })
    expect((await mainText()).includes(CATEGORY_LABEL), 'Catégorie créée', CATEGORY_CODE)

    const { data: categoryRow } = await admin
      .from('vehicle_categories')
      .select('id')
      .eq('code', CATEGORY_CODE)
      .maybeSingle()
    ids.category = categoryRow?.id ?? null

    // ------------------------------------------------------ 5. Véhicules --
    console.log('\n5. Véhicules — ADIKOM et fournisseur')

    // Véhicule ADIKOM
    await page.goto(`${base}/location/parc/nouveau`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#brand') !== null)
    await page.fill('#brand', 'Recette')
    await page.fill('#model', `${VEHICLE_MODEL} ADIKOM`)
    await page.selectOption('#categoryId', ids.category)
    await page.fill('#plate', PLATE)
    await page.fill('#mileage', '10000')
    await page.fill('#notes', MARKER)
    await page.selectOption('#origin', 'OWNED')
    await page.locator('form:has(#brand) button[type="submit"]').click()
    await page.waitForURL(/\/location\/parc\/[0-9a-f-]{36}/, { timeout: 30000 })
    ids.owned = page.url().match(/parc\/([0-9a-f-]{36})/)?.[1] ?? null
    await page.waitForLoadState('networkidle')

    const ownedSheet = await mainText()
    expect(Boolean(ownedSheet.match(/VEH-\d{6}/)), 'Identifiant véhicule attribué')
    expect(ownedSheet.includes('Propriété ADIKOM'), 'Véhicule identifié comme propriété ADIKOM')

    // Véhicule fourni — sans fournisseur : refusé
    await page.goto(`${base}/location/parc/nouveau`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#brand') !== null)
    await page.fill('#brand', 'Recette')
    await page.fill('#model', `${VEHICLE_MODEL} Fournisseur`)
    await page.selectOption('#categoryId', ids.category)
    await page.fill('#notes', MARKER)
    await page.selectOption('#origin', 'SUPPLIED')
    // Le sélecteur de fournisseur apparaît, laissé volontairement vide.
    await page.waitForFunction(() => document.querySelector('#supplierId') !== null)
    await page.locator('form:has(#brand) button[type="submit"]').click()
    await page.waitForTimeout(4000)
    expect(
      /Choisissez le fournisseur/i.test(await mainText()),
      'Véhicule fourni sans fournisseur : refusé'
    )

    // Puis avec fournisseur
    await page.selectOption('#supplierId', ids.supplier)
    await page.locator('form:has(#brand) button[type="submit"]').click()
    await page.waitForURL(/\/location\/parc\/[0-9a-f-]{36}/, { timeout: 30000 })
    ids.vehicle = page.url().match(/parc\/([0-9a-f-]{36})/)?.[1] ?? null
    await page.waitForLoadState('networkidle')

    const suppliedSheet = await mainText()
    expect(
      suppliedSheet.includes('Fourni par un fournisseur'),
      'Véhicule identifié comme fourni'
    )
    expect(suppliedSheet.includes(SUPPLIER_A), 'Fournisseur rattaché visible sur la fiche')

    // --------------------------------------- 6. Changement de fournisseur --
    console.log('\n6. Rattachement fournisseur et historisation')
    await page.goto(`${base}/location/parc/${ids.vehicle}?onglet=fournisseur`, {
      waitUntil: 'load',
    })
    await page.getByRole('button', { name: 'Changer de fournisseur' }).click()
    await page.waitForFunction(() => document.querySelector('select[name="origin"]') !== null)
    await page.selectOption('select[name="origin"]', 'SUPPLIED')
    await page.selectOption('select[name="supplierId"]', ids.supplierB)
    await page.fill('textarea[name="reason"]', `${MARKER} — changement de contrat`)
    await page.locator('form:has(select[name="supplierId"]) button[type="submit"]').click()
    await page.waitForTimeout(4000)

    await page.goto(`${base}/location/parc/${ids.vehicle}?onglet=fournisseur`, {
      waitUntil: 'load',
    })
    const history = await mainText()
    expect(history.includes(SUPPLIER_B), 'Nouveau fournisseur rattaché')
    expect(history.includes(SUPPLIER_A), 'Ancien fournisseur conservé dans l’historique')
    expect(/Clôturé/.test(history), 'Période précédente clôturée')
    expect(/En cours/.test(history), 'Une seule période en cours')

    const { data: periods } = await admin
      .from('vehicle_supplier_history')
      .select('id, ended_on')
      .eq('vehicle_id', ids.vehicle)

    const open = (periods ?? []).filter((row) => row.ended_on === null)
    expect(periods?.length === 2, 'Deux périodes historisées', `${periods?.length ?? 0}`)
    expect(open.length === 1, 'Un seul rattachement ouvert', `${open.length}`)

    // ------------------------------------------------------ 7. Documents --
    console.log('\n7. Documents du véhicule')
    await page.goto(`${base}/location/parc/${ids.owned}?onglet=documents`, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'Ajouter un document' }).click()
    await page.waitForFunction(() => document.querySelector('#label') !== null)
    await page.selectOption('#docType', 'INSURANCE')
    await page.fill('#label', `${MARKER} Assurance`)
    await page.fill('#expiresOn', inDays(15).slice(0, 10))
    await page.setInputFiles('#file', {
      name: 'recette.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'),
    })
    await page.locator('form:has(#label) button[type="submit"]').click()
    await page.waitForTimeout(6000)

    await page.goto(`${base}/location/parc/${ids.owned}?onglet=documents`, { waitUntil: 'load' })
    const documents = await mainText()
    expect(documents.includes(`${MARKER} Assurance`), 'Document ajouté')
    expect(/Expire dans \d+ j/.test(documents), 'Échéance proche signalée')

    const { data: documentRow } = await admin
      .from('vehicle_documents')
      .select('id, storage_path')
      .eq('vehicle_id', ids.owned)
      .maybeSingle()

    expect(Boolean(documentRow?.storage_path), 'Fichier déposé dans le bucket privé')

    if (documentRow) {
      const response = await page.request.get(`${base}/api/documents/vehicule/${documentRow.id}`)
      expect(
        response.status() === 200 && /pdf/i.test(response.headers()['content-type'] ?? ''),
        'Fichier servi par lien signé',
        `${response.status()} · ${response.headers()['content-type'] ?? '—'}`
      )
    }

    // ------------------------------------ 8. Simulation sans aucun tarif ---
    console.log('\n8. Tarification — simulation et sources')
    await page.goto(`${base}/location/tarification?onglet=simulation`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#vehicleId') !== null)
    await page.selectOption('#vehicleId', ids.owned)
    await page.locator('form:has(#vehicleId) button[type="submit"]').click()
    await page.waitForTimeout(4000)
    expect(
      /Aucun tarif n’est configuré/i.test(await mainText()),
      'Absence de tarif : cas explicite, aucun montant supposé'
    )

    // Tarif standard de catégorie
    await createStandardRule(page, base, { scope: 'CATEGORY', target: ids.category, amount: '200000' })
    await simulate(page, base, { vehicleId: ids.owned })
    let simulation = await mainText()
    expect(
      /Tarif standard de la catégorie/i.test(simulation) && /200/.test(simulation),
      'Tarif de catégorie appliqué',
      'source CATEGORY'
    )

    // Tarif standard du véhicule — plus spécifique, il l'emporte
    await createStandardRule(page, base, { scope: 'VEHICLE', target: ids.owned, amount: '300000' })
    await simulate(page, base, { vehicleId: ids.owned })
    simulation = await mainText()
    expect(
      /Tarif standard du véhicule/i.test(simulation) && /300/.test(simulation),
      'Tarif du véhicule l’emporte sur celui de la catégorie',
      'source VEHICLE'
    )

    // ------------------------------------------- 9. Tarif préférentiel ----
    console.log('\n9. Tarif préférentiel du client')
    await page.goto(`${base}/tiers/clients/${ids.client}?onglet=tarification`, {
      waitUntil: 'load',
    })
    await page.getByRole('button', { name: 'Ajouter un tarif' }).click()
    await page.waitForFunction(() => document.querySelector('#scope') !== null)
    await page.selectOption('#scope', 'VEHICLE')
    await page.waitForFunction(() => document.querySelector('#vehicleId') !== null)
    await page.selectOption('#vehicleId', ids.owned)
    await page.selectOption('#mode', 'AMOUNT')
    await page.fill('#amount', '450000')
    await page.selectOption('#unit', 'DAY')
    await page.fill('#conditions', `${MARKER} — accord commercial`)
    await page.locator('form:has(#scope) button[type="submit"]').click()
    await page.waitForTimeout(4000)

    await page.goto(`${base}/tiers/clients/${ids.client}?onglet=tarification`, {
      waitUntil: 'load',
    })
    expect(/450/.test(await mainText()), 'Tarif préférentiel enregistré sur la fiche client')

    await simulate(page, base, { vehicleId: ids.owned, clientId: ids.client })
    simulation = await mainText()
    expect(
      /Tarif préférentiel du client sur ce véhicule/i.test(simulation) && /450/.test(simulation),
      'Tarif préférentiel appliqué et sa source affichée',
      'source CLIENT_VEHICLE'
    )

    // --------------------------------- 10. Disponibilité et non-collision --
    console.log('\n10. Disponibilité, immobilisation et non-collision')
    await page.goto(`${base}/location/parc/${ids.owned}?onglet=disponibilite`, {
      waitUntil: 'load',
    })
    await page.getByRole('button', { name: 'Enregistrer une indisponibilité' }).click()
    await page.waitForFunction(() => document.querySelector('#from') !== null)
    await page.fill('#from', inDays(2))
    await page.fill('#to', inDays(5))
    await page.fill('textarea[name="reason"]', `${MARKER} — contrôle technique`)
    await page.locator('form:has(#from) button[type="submit"]').click()
    await page.waitForTimeout(4000)

    await page.goto(`${base}/location/parc/${ids.owned}?onglet=disponibilite`, {
      waitUntil: 'load',
    })
    expect(/Immobilisation/.test(await mainText()), 'Immobilisation enregistrée au calendrier')

    // Chevauchement : refusé par la base
    await page.getByRole('button', { name: 'Enregistrer une indisponibilité' }).click()
    await page.waitForFunction(() => document.querySelector('#from') !== null)
    await page.fill('#from', inDays(3))
    await page.fill('#to', inDays(7))
    await page.locator('form:has(#from) button[type="submit"]').click()
    await page.waitForTimeout(4000)
    expect(
      /chevauche/i.test(await mainText()),
      'Chevauchement refusé, avec un message compréhensible'
    )

    // Période adjacente : acceptée
    await page.fill('#from', inDays(5))
    await page.fill('#to', inDays(8))
    await page.locator('form:has(#from) button[type="submit"]').click()
    await page.waitForTimeout(4000)

    const { count: occupations } = await admin
      .from('vehicle_occupations')
      .select('id', { count: 'exact', head: true })
      .eq('vehicle_id', ids.owned)
      .eq('is_active', true)

    expect(occupations === 2, 'Période adjacente acceptée', `${occupations} période(s) active(s)`)

    /*
     * Disponibilité réelle : le statut affiché reste « Disponible » alors que
     * le calendrier est occupé (Règles parc §67 et §69). Le moteur est
     * interrogé directement — c'est bien la logique métier qui est vérifiée
     * ici, les permissions l'étant par `verify:referential`.
     */
    await page.goto(`${base}/location/parc/${ids.owned}`, { waitUntil: 'load' })
    expect(/Disponible/.test(await mainText()), 'Statut du véhicule : Disponible')

    const { data: busy } = await admin.rpc('is_vehicle_available', {
      p_vehicle_id: ids.owned,
      p_period: `[${isoInDays(3)},${isoInDays(4)})`,
    })
    expect(busy === false, 'Indisponible sur une période occupée, malgré le statut')

    const { data: free } = await admin.rpc('is_vehicle_available', {
      p_vehicle_id: ids.owned,
      p_period: `[${isoInDays(60)},${isoInDays(61)})`,
    })
    expect(free === true, 'Disponible en dehors des périodes bloquées')

    // ------------------------- 11. Protection des coordonnées bancaires ----
    console.log('\n11. Coordonnées bancaires — compte sans le droit de les voir')
    const readerId = await createReader(admin)
    const readerContext = await browser.newContext()
    const readerPage = await readerContext.newPage()

    try {
      await readerPage.goto(`${base}/connexion`, { waitUntil: 'load' })
      await readerPage.waitForFunction(() => document.querySelector('#username') !== null)
      await readerPage.fill('#username', READER.username)
      await readerPage.fill('#password', READER.password)
      await readerPage.click('button[type="submit"]')
      await readerPage.waitForURL('**/tableau-de-bord', { timeout: 25000 })

      await readerPage.goto(`${base}/tiers/fournisseurs/${ids.supplier}`, { waitUntil: 'load' })
      const readerSheet = (await readerPage.locator('main').textContent()) ?? ''
      expect(readerSheet.includes(SUPPLIER_A), 'Le fournisseur reste consultable')

      const tabs = await readerPage
        .locator('nav[aria-label="Sections de la fiche"] a')
        .allTextContents()
      expect(
        !tabs.some((tab) => /bancaire/i.test(tab)),
        'Onglet « Coordonnées bancaires » absent',
        tabs.join(' · ')
      )

      // Accès direct par URL : le masquage n'est pas la protection.
      await readerPage.goto(`${base}/tiers/fournisseurs/${ids.supplier}?onglet=banque`, {
        waitUntil: 'load',
      })
      const forced = await readerPage.content()
      expect(!forced.includes(TEST_IBAN), 'IBAN invisible même par accès direct à l’URL')
    } finally {
      await readerContext.close()
      if (readerId) {
        await admin.from('user_permissions').delete().eq('user_id', readerId)
        await admin.from('app_users').delete().eq('id', readerId)
        await admin.auth.admin.deleteUser(readerId)
      }
    }

    // ---------------------------------------------- 12. Archivage client --
    console.log('\n12. Archivage du client')
    await page.goto(`${base}/tiers/clients/${ids.client}`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('select[name="status"]') !== null)
    await page.selectOption('select[name="status"]', 'ARCHIVED')
    await page.fill('input[name="reason"]', `${MARKER} — fin de recette`)
    await page.locator('form:has(select[name="status"]) button[type="submit"]').click()
    await page.waitForTimeout(4000)

    await page.goto(`${base}/tiers/clients/${ids.client}`, { waitUntil: 'load' })
    const archived = await mainText()
    expect(/Archivé/.test(archived), 'Client archivé')
    expect(archived.includes(CLIENT_NAME), 'Fiche et historique conservés après archivage')

    // ------------------------------------------- 13. Fuite de secrets -----
    console.log('\n13. Données sensibles côté client')
    const listResponse = await page.goto(`${base}/tiers/fournisseurs`)
    const html = await listResponse.text()
    const bundles = [...html.matchAll(/\/_next\/static\/[^"]+\.js/g)].map((match) => match[0])

    let js = ''
    for (const bundle of [...new Set(bundles)]) {
      js += await (await page.request.get(`${base}${bundle}`)).text()
    }

    const leaks = ['sb_secret_', 'postgresql://', 'SERVICE_ROLE', TEST_IBAN, adminPassword]
    const found = leaks.filter((needle) => html.includes(needle) || js.includes(needle))
    expect(found.length === 0, 'Aucun secret côté client', `${bundles.length} bundle(s) analysé(s)`)
  } finally {
    await browser.close()

    await cleanup(admin)
    console.log(`\n${DIM}Données de recette supprimées (fichier déposé compris).${RESET}`)

    const countersAfter = await readCounters(admin)
    const consumed = COUNTER_KEYS.map(
      (key) => `${key} : ${countersBefore[key]} → ${countersAfter[key]}`
    ).join(' · ')

    if (restoreRequested) {
      const { restored, skipped } = await restoreCounters(admin, countersBefore, countersAfter)
      if (restored.length) console.log(`${DIM}Compteurs restaurés : ${restored.join(' · ')}${RESET}`)
      if (skipped.length) {
        console.log(
          `${YELLOW}Compteurs non restaurés (activité concurrente détectée) : ${skipped.join(', ')}${RESET}`
        )
      }
    } else {
      console.log(`${DIM}Numérotation consommée : ${consumed}${RESET}`)
      console.log(
        `${DIM}Relancer avec --restaurer-compteurs pour revenir aux valeurs initiales.${RESET}`
      )
    }

    console.log(
      `${YELLOW}Rappel : les entrées du journal d'audit produites par cette recette sont définitives.${RESET}`
    )
  }

  console.log(`\n${'─'.repeat(62)}`)
  if (failed === 0) {
    console.log(`${GREEN}RECETTE FONCTIONNELLE 2.2 : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE FONCTIONNELLE 2.2 : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}

/* -------------------------------------------------------------------------- */
/*  Gestes réutilisés                                                          */
/* -------------------------------------------------------------------------- */

/** Crée un tarif standard depuis l'écran Tarification. */
async function createStandardRule(page, base, { scope, target, amount }) {
  await page.goto(`${base}/location/tarification`, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Ajouter un tarif' }).click()
  await page.waitForFunction(() => document.querySelector('#scope') !== null)
  await page.selectOption('#scope', scope)

  const field = scope === 'CATEGORY' ? '#categoryId' : '#vehicleId'
  await page.waitForFunction((selector) => document.querySelector(selector) !== null, field)
  await page.selectOption(field, target)

  await page.fill('#amount', amount)
  await page.selectOption('#unit', 'DAY')
  await page.fill('#conditions', `${MARKER} — tarif de recette`)
  await page.locator('form:has(#scope) button[type="submit"]').click()
  await page.waitForTimeout(4000)
}

/** Interroge le simulateur et laisse la page sur le résultat. */
async function simulate(page, base, { vehicleId, clientId }) {
  await page.goto(`${base}/location/tarification?onglet=simulation`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#vehicleId') !== null)
  if (clientId) await page.selectOption('#clientId', clientId)
  await page.selectOption('#vehicleId', vehicleId)
  await page.locator('form:has(#vehicleId) button[type="submit"]').click()
  await page.waitForTimeout(4000)
}

/** Compte de consultation : voit les tiers et le parc, jamais les RIB. */
async function createReader(admin) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: READER.email,
    password: READER.password,
    email_confirm: true,
  })

  if (error || !created.user) {
    ko('Compte de consultation créé', error?.message ?? 'inconnu')
    return null
  }

  const id = created.user.id

  await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: 'Lecture',
    username: READER.username,
    email: READER.email,
    status: 'ACTIVE',
  })

  const { data: catalog } = await admin
    .from('permissions')
    .select('id')
    .in('code', READER.permissions)

  await admin.from('user_permissions').insert(
    (catalog ?? []).map((permission) => ({
      user_id: id,
      permission_id: permission.id,
      effect: 'ALLOW',
    }))
  )

  return id
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
