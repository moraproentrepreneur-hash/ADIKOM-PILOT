#!/usr/bin/env node
/**
 * Recette des coûts de maintenance — Étape 2.4, LOT 3.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * `db:verify:maintenance-costs` contrôle le schéma et les règles ;
 * `verify:capabilities` contrôle les capacités par appel direct. Celle-ci
 * contrôle ce que L'UTILISATEUR VOIT :
 *
 *   1. DEC-017 — sans `cost.view`, l'onglet Coûts DISPARAÎT. Il ne s'affiche
 *      ni vide, ni à « 0 KMF » : l'un et l'autre affirmeraient que
 *      l'intervention n'a rien coûté.
 *   2. « Pas encore chiffré » n'est pas « gratuit » — un montant non saisi ne
 *      se présente jamais comme un zéro.
 *   3. Saisir un coût par l'écran ne déclenche RIEN : ni imputation, ni
 *      facture, ni paiement, ni occupation, ni statut.
 *   4. Les justificatifs ne sont servis que par URL signée, après contrôle de
 *      `cost.view`.
 *   5. Le verrou après clôture se voit à l'écran, pas seulement en base.
 *
 * Utilisation :
 *   node scripts/verify-maintenance-costs.mjs [url]
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
const MARK = `RECETTE COUT ${STAMP}`

const BASE_READERS = ['rental.maintenance.view', 'rental.fleet.view']

const PROFILES = {
  full: [
    ...BASE_READERS,
    'rental.maintenance.create',
    'rental.maintenance.update',
    'rental.maintenance.validate',
    'rental.maintenance.close',
    'rental.maintenance.cost.view',
    'rental.maintenance.cost.update',
    'parties.suppliers.view',
  ],
  // Voit l'intervention, PAS son prix.
  noFinance: [...BASE_READERS, 'rental.maintenance.update'],
  // Voit le prix, ne le saisit pas.
  readCost: [...BASE_READERS, 'rental.maintenance.cost.view'],
}

async function createProfile(admin, key, codes) {
  const username = `recette.cout.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-cout-${STAMP}`

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
    last_name: `Coût ${key}`,
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
  const fixtures = { vehicleIds: [], maintenances: [] }
  const browser = await chromium.launch()

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RCST-${STAMP}`, label: `${MARK} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    for (const suffix of ['A', 'B']) {
      const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
      const { data: vehicle } = await admin
        .from('vehicles')
        .insert({
          vehicle_no: vehicleNo,
          category_id: category.id,
          brand: 'RECETTE',
          model: `COUT ${STAMP} ${suffix}`,
          plate: `RK-${STAMP}${suffix}`,
          origin: 'OWNED',
          status: 'AVAILABLE',
        })
        .select('id')
        .single()
      fixtures.vehicleIds.push(vehicle.id)
    }

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, key, codes)
    }

    // Une maintenance ouverte, sans aucun montant saisi.
    const { data: mntNo } = await admin.rpc('next_number', { p_entity_key: 'maintenance' })
    const { data: maintenance } = await admin
      .from('vehicle_maintenances')
      .insert({
        maintenance_no: mntNo,
        vehicle_id: fixtures.vehicleIds[0],
        origin: 'BREAKDOWN',
        reason: `${MARK} — panne`,
      })
      .select('id')
      .single()
    fixtures.maintenances.push(maintenance.id)
    const openId = maintenance.id

    console.log(`${DIM}Sujet : une maintenance sans aucun montant saisi${RESET}`)

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — DEC-017 : L’ONGLET DISPARAÎT, IL NE MENT PAS\n')

    {
      const { context, page } = await signIn(browser, base, accounts.noFinance)

      await page.goto(`${base}/location/maintenance/${openId}`, { waitUntil: 'load' })
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

      check(
        (await page.getByRole('link', { name: 'Coûts', exact: true }).count()) === 0,
        'Sans `cost.view`, l’onglet Coûts n’existe pas'
      )
      check(!/KMF/.test(text), 'Aucun montant sur la fiche')
      check(!/\b0 KMF\b/.test(text), 'Et surtout aucun « 0 KMF » trompeur')

      // Même en forçant l'URL de l'onglet.
      await page.goto(`${base}/location/maintenance/${openId}?onglet=couts`, { waitUntil: 'load' })
      const forced = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      check(
        !/Montant imputable|Coût réel/.test(forced),
        'Forcer l’URL de l’onglet ne révèle aucun montant'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — « PAS ENCORE CHIFFRÉ » N’EST PAS « GRATUIT »\n')

    {
      const { context, page } = await signIn(browser, base, accounts.readCost)

      await page.goto(`${base}/location/maintenance/${openId}?onglet=couts`, { waitUntil: 'load' })
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

      check(/Pas encore chiffré/.test(text), 'L’absence de saisie est DITE')
      check(!/\b0 KMF\b/.test(text), 'Aucun « 0 KMF » ne la remplace')
      check(
        /Indéterminable/.test(text),
        'L’écart et le non-imputable se déclarent indéterminables, pas nuls'
      )
      check(
        (await page.getByRole('heading', { name: 'Saisir les montants', exact: true }).count()) === 0,
        'Sans `cost.update`, aucun formulaire de saisie'
      )
      check(
        /peut consulter ces montants, mais pas les saisir/.test(text),
        'Et l’écran explique pourquoi'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — SAISIE PAR L’ÉCRAN, SANS AUCUN EFFET EN AVAL\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/maintenance/${openId}?onglet=couts`, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle')

      await page.fill('input[name="estimatedCost"]', '250000')
      await page.fill('input[name="actualCost"]', '300000')
      await page.fill('input[name="imputableAmount"]', '200000')
      await page.getByRole('button', { name: 'Enregistrer les montants', exact: true }).click()

      const saved = await until(async () => {
        const { data } = await admin
          .from('maintenance_costs')
          .select('estimated_cost, actual_cost, imputable_amount')
          .eq('maintenance_id', openId)
          .maybeSingle()
        return data?.actual_cost === 300000 ? data : null
      })

      check(Boolean(saved), 'Les trois montants sont enregistrés')
      check(
        saved?.estimated_cost === 250000 && saved?.imputable_amount === 200000,
        'Chacun tel qu’il a été saisi, sans déduction',
        `${saved?.estimated_cost} / ${saved?.actual_cost} / ${saved?.imputable_amount}`
      )

      await page.reload({ waitUntil: 'load' })
      const shown = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      check(/\+50 000 KMF/.test(shown), 'L’écart est calculé à la lecture (§35)')
      check(/100 000 KMF/.test(shown), 'Le montant non imputable aussi (Workflow 06 §7)')

      // RIEN n'a été déclenché.
      const [{ data: occupations }, { data: vehicle }, { data: mnt }] = await Promise.all([
        admin.from('vehicle_occupations').select('id').eq('vehicle_id', fixtures.vehicleIds[0]),
        admin.from('vehicles').select('status').eq('id', fixtures.vehicleIds[0]).maybeSingle(),
        admin.from('vehicle_maintenances').select('status').eq('id', openId).maybeSingle(),
      ])

      check((occupations ?? []).length === 0, 'Aucune occupation posée')
      check(vehicle?.status === 'AVAILABLE', 'Statut du véhicule inchangé', vehicle?.status)
      check(mnt?.status === 'DRAFT', 'Statut de la maintenance inchangé', mnt?.status)

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — DEVIS : SAISIR ET DÉCIDER SONT DEUX ACTES\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/maintenance/${openId}?onglet=couts`, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle')

      await page.fill('form:has(button:text("Enregistrer le devis")) input[name="amount"]', '280000')
      await page.getByRole('button', { name: 'Enregistrer le devis', exact: true }).click()

      const quote = await until(async () => {
        const { data } = await admin
          .from('maintenance_quotes')
          .select('id, status, amount')
          .eq('maintenance_id', openId)
          .maybeSingle()
        return data
      })

      check(quote?.amount === 280000 && quote?.status === 'PROPOSED', 'Le devis naît « Proposé »')

      await page.reload({ waitUntil: 'load' })
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: 'Accepter', exact: true }).click()

      const decided = await until(async () => {
        const { data } = await admin
          .from('maintenance_quotes')
          .select('status, decided_at')
          .eq('id', quote.id)
          .maybeSingle()
        return data?.status === 'ACCEPTED' ? data : null
      })
      check(Boolean(decided), 'Accepté, et la décision est datée (§27)')

      const { data: costs } = await admin
        .from('maintenance_costs')
        .select('estimated_cost, actual_cost')
        .eq('maintenance_id', openId)
        .maybeSingle()
      check(
        costs?.estimated_cost === 250000 && costs?.actual_cost === 300000,
        'Accepter n’a recopié aucun montant dans les coûts (DEC-008)'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — JUSTIFICATIFS : AUCUN CHEMIN EXPOSÉ\n')

    {
      const { data: document } = await admin
        .from('maintenance_documents')
        .insert({
          maintenance_id: openId,
          doc_type: 'INVOICE',
          label: `${MARK} — facture garage`,
          storage_path: `maintenances/${openId}/recette-${STAMP}.pdf`,
          file_name: 'facture.pdf',
        })
        .select('id')
        .single()

      const { context, page } = await signIn(browser, base, accounts.full)
      await page.goto(`${base}/location/maintenance/${openId}?onglet=couts`, { waitUntil: 'load' })
      const html = await page.content()

      check(
        !html.includes(`maintenances/${openId}/recette-${STAMP}.pdf`),
        'Le chemin de stockage n’apparaît jamais dans la page'
      )
      check(
        html.includes(`/api/maintenance/documents/${document.id}`),
        'Le justificatif passe par la route contrôlée'
      )
      await context.close()

      const { context: denied, page: deniedPage } = await signIn(browser, base, accounts.noFinance)
      const response = await deniedPage.request.get(
        `${base}/api/maintenance/documents/${document.id}`,
        { maxRedirects: 0 }
      )
      check(
        response.status() === 403,
        'La route refuse un justificatif sans `cost.view`',
        `HTTP ${response.status()}`
      )
      await denied.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — LE VERROU APRÈS CLÔTURE SE VOIT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      // Amener la maintenance jusqu'à « Terminée ».
      for (const status of ['PLANNED', 'IN_PROGRESS']) {
        await admin.from('vehicle_maintenances').update({ status }).eq('id', openId)
      }
      await admin
        .from('vehicle_maintenances')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
        .eq('id', openId)

      await page.goto(`${base}/location/maintenance/${openId}?onglet=couts`, { waitUntil: 'load' })
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

      check(/verrouillées/.test(text), 'L’écran annonce le verrouillage')
      check(
        (await page.getByRole('heading', { name: 'Saisir les montants', exact: true }).count()) === 0,
        'Aucun formulaire de saisie ne subsiste'
      )
      check(/300 000 KMF/.test(text), 'Les montants restent consultables')

      await context.close()

      // Et la base refuse, quel que soit le chemin.
      const { error } = await admin.rpc('record_maintenance_costs', {
        p_maintenance_id: openId,
        p_actual_cost: 999000,
      })
      const { data: intact } = await admin
        .from('maintenance_costs')
        .select('actual_cost')
        .eq('maintenance_id', openId)
        .maybeSingle()
      check(
        Boolean(error) && intact?.actual_cost === 300000,
        'La base refuse toute correction après clôture',
        `${intact?.actual_cost}`
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — AUDIT · SUPPRESSION · DEMO\n')

    {
      const { count: audited } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .in('entity_type', ['maintenance_costs', 'maintenance_quotes', 'maintenance_documents'])
      check((audited ?? 0) > 0, 'Les écritures financières sont journalisées', `${audited} entrée(s)`)

      const [{ count: clients }, { count: vehicles }] = await Promise.all([
        admin
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .like('legal_name', '%DEMO%'),
        admin.from('vehicles').select('id', { count: 'exact', head: true }).like('model', '%DEMO%'),
      ])
      check(clients === 3, 'Les trois clients DEMO sont intacts', `${clients}`)
      check(vehicles === 3, 'Les trois véhicules DEMO sont intacts', `${vehicles}`)
    }
  } finally {
    await browser.close()

    for (const id of fixtures.maintenances) {
      await admin.from('maintenance_documents').delete().eq('maintenance_id', id)
      await admin.from('maintenance_quotes').delete().eq('maintenance_id', id)
      await admin.from('maintenance_cost_lines').delete().eq('maintenance_id', id)
      await admin.from('maintenance_costs').delete().eq('maintenance_id', id)
      await admin.from('vehicle_occupations').delete().eq('source_id', id)
      await admin.from('vehicle_maintenances').delete().eq('id', id)
    }
    for (const vehicleId of fixtures.vehicleIds) {
      await admin.from('vehicle_occupations').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }
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
    console.log(`${GREEN}RECETTE COÛTS DE MAINTENANCE : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE COÛTS DE MAINTENANCE : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
