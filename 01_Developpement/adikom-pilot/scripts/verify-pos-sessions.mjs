#!/usr/bin/env node
/**
 * Recette navigateur — Point de vente : caisses et sessions (LOT 27, Module 12).
 *
 * ⚠ ÉCRITE DANS LE CLOUD, JAMAIS EXÉCUTÉE PAR LUI. Elle exige la base réelle et
 * une application déployée : c'est la reprise LOCALE qui la lance, après
 * `db:push` et `db:verify:pos-sessions`.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LA RECETTE SQL N'ÉPROUVE PAS
 *
 * `db:verify:pos-sessions` prouve les règles EN BASE, sous le rôle
 * `authenticated`. Celle-ci prouve ce que L'UTILISATEUR VOIT, par PostgREST :
 *
 *   1. un caissier ouvre SA session par l'écran ; le bandeau la rappelle ;
 *   2. 🟥 B-13 — le caissier A voit SES montants, PAS ceux du caissier B, et
 *      l'écran dit « non visibles », jamais « 0 KMF » ;
 *   3. le profil PLANNING (`pos.sessions.view` seul) voit qui était en caisse,
 *      sans aucun montant, et n'a ni bouton d'ouverture ni d'export ;
 *   4. 🟥 B-9 — la clôture exige un montant compté, affiche l'écart sans bloquer ;
 *   5. Q-2 — le responsable clôt la session d'un autre ; le caissier ne le peut pas ;
 *   6. « qui était en caisse aujourd'hui ? » par le filtre jour/heure ;
 *   7. un `POST` direct sur `pos_sessions` par le caissier est REFUSÉ ;
 *   8. l'export exige SA capacité, et ses montants celle des montants.
 *
 * DISCIPLINE (Plan 02 §20.4, CLAUDE.md §47 bis)
 *
 *   · garde d'entrée : un résidu d'un passage interrompu arrête la recette ;
 *   · la mise en place vérifie CHAQUE erreur ; le démontage aussi ;
 *   · le nettoyage balaie PAR MARQUEUR, puis CONSTATE qu'il ne reste rien ;
 *   · aucune date en dur ; on attend le LIBELLÉ d'un effet, jamais `networkidle`.
 *
 * Utilisation :
 *   node scripts/verify-pos-sessions.mjs [url]
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
const MARK = 'RECETTE PDV'
const LABEL = `${MARK} ${STAMP}`
const USER_PREFIX = 'recette.pdv.'

const CASHIER = [
  'pos.sessions.view',
  'pos.sessions.open',
  'pos.sessions.close',
  'pos.registers.view',
  'treasury.accounts.view',
]

const PROFILES = {
  caissierA: CASHIER,
  caissierB: CASHIER,
  // « Qui était en caisse » — et rien d'autre. `users.users.view` nomme le caissier.
  planning: ['pos.sessions.view', 'users.users.view'],
  responsable: [
    'pos.sessions.view',
    'pos.sessions.amounts.view',
    'pos.sessions.close',
    'pos.sessions.export',
    'pos.registers.view',
    'users.users.view',
  ],
}

async function createProfile(admin, key, codes) {
  const username = `${USER_PREFIX}${key.toLowerCase()}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-pdv-${STAMP}`

  const created = must(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    `compte ${key}`
  )
  const id = created.user.id

  must(
    await admin.from('app_users').insert({
      id,
      first_name: 'Recette',
      last_name: `PDV ${key}`,
      username,
      email,
      status: 'ACTIVE',
    }),
    `profil ${key}`
  )

  const catalog = must(await admin.from('permissions').select('id, code').in('code', codes), 'catalogue')
  if (catalog.length !== codes.length) {
    const found = new Set(catalog.map((p) => p.code))
    throw new Error(`catalogue incomplet (${key}) : ${codes.filter((c) => !found.has(c)).join(', ')}`)
  }
  must(
    await admin
      .from('user_permissions')
      .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' }))),
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

/**
 * Ouvre une session par l'écran et rend son identifiant.
 *
 * Le choix de la caisse est REJOUÉ jusqu'à ce qu'il prenne : avant l'hydratation,
 * `selectOption` pose une valeur que React remet ensuite à son défaut (motif de
 * `verify-ajustements.mjs`).
 */
async function openByScreen(page, base, registerId, float) {
  await page.goto(`${base}/pdv/sessions`, { waitUntil: 'load' })
  for (let essai = 1; essai <= 6; essai += 1) {
    await page.selectOption('#registerId', registerId)
    if ((await page.inputValue('#registerId')) === registerId) break
    await page.waitForTimeout(500)
  }
  await page.fill('#openingFloat', String(float))
  await page.getByRole('button', { name: 'Ouvrir la session' }).click()
  await page.waitForURL(/\/pdv\/sessions\/[0-9a-f-]{36}\?ouverte=1/, { timeout: 30000 })
  return page.url().match(/sessions\/([0-9a-f-]{36})/)[1]
}

async function closeByScreen(page, base, sessionId, counted) {
  await page.goto(`${base}/pdv/sessions/${sessionId}`, { waitUntil: 'load' })
  await page.fill('#countedAmount', String(counted))
  await page.getByRole('button', { name: 'Clôturer la session' }).click()
  await page.waitForURL(/\?close=1/, { timeout: 30000 })
}

/* -------------------------------------------------------------------------- */

async function sweep(admin) {
  // Par MARQUEUR, et non par identifiants suivis : un passage interrompu laisse
  // des résidus que seule une balayette retrouve.
  const registers =
    must(await admin.from('pos_registers').select('id').like('label', `${MARK}%`), 'balayage caisses') ?? []
  const registerIds = registers.map((r) => r.id)

  if (registerIds.length > 0) {
    const sessions =
      must(await admin.from('pos_sessions').select('id').in('register_id', registerIds), 'balayage sessions') ?? []
    const sessionIds = sessions.map((s) => s.id)
    if (sessionIds.length > 0) {
      must(await admin.from('pos_session_amounts').delete().in('session_id', sessionIds), 'suppression montants')
      must(await admin.from('pos_sessions').delete().in('id', sessionIds), 'suppression sessions')
    }
    must(await admin.from('pos_registers').delete().in('id', registerIds), 'suppression caisses')
  }

  must(await admin.from('financial_accounts').delete().like('label', `${MARK}%`), 'suppression comptes')

  const users =
    must(await admin.from('app_users').select('id').like('username', `${USER_PREFIX}%`), 'balayage comptes') ?? []
  for (const user of users) {
    must(await admin.from('user_permissions').delete().eq('user_id', user.id), 'suppression permissions')
    must(await admin.from('app_users').delete().eq('id', user.id), 'suppression profil')
    await admin.auth.admin.deleteUser(user.id)
  }
}

async function residue(admin) {
  const [registers, users, accounts] = await Promise.all([
    admin.from('pos_registers').select('id', { count: 'exact', head: true }).like('label', `${MARK}%`),
    admin.from('app_users').select('id', { count: 'exact', head: true }).like('username', `${USER_PREFIX}%`),
    admin.from('financial_accounts').select('id', { count: 'exact', head: true }).like('label', `${MARK}%`),
  ])
  return (registers.count ?? 0) + (users.count ?? 0) + (accounts.count ?? 0)
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

  // Garde d'entrée.
  const before = await residue(admin)
  if (before > 0) {
    throw new Error(`${before} résidu(s) « ${MARK} » d'un passage précédent : lancez le balayage avant de rejouer.`)
  }

  const accounts = {}
  const browser = await chromium.launch()

  try {
    /* --- Mise en place --------------------------------------------------- */
    const cashAccount = must(
      await admin.rpc('create_financial_account', {
        p_kind: 'CASH',
        p_label: `${LABEL} — Caisse`,
        p_institution: 'Recette',
        p_account_reference: null,
        p_opening_balance: 0,
        p_opened_on: null,
        p_description: null,
      }),
      'compte de caisse'
    )
    const register1 = must(
      await admin.rpc('create_pos_register', {
        p_label: `${LABEL} — Comptoir 1`,
        p_account_id: cashAccount,
        p_location: null,
      }),
      'caisse 1'
    )
    const register2 = must(
      await admin.rpc('create_pos_register', {
        p_label: `${LABEL} — Comptoir 2`,
        p_account_id: cashAccount,
        p_location: null,
      }),
      'caisse 2'
    )

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, key, codes)
    }

    const { count: entriesBefore } = await admin
      .from('treasury_entries')
      .select('id', { count: 'exact', head: true })

    /* ------------------------------------------------------------------ */
    console.log('1 — OUVRIR PAR L’ÉCRAN\n')

    const a = await signIn(browser, base, accounts.caissierA)
    const sessionA = await openByScreen(a.page, base, register1, 50000)
    check(/ouverte à votre nom/.test(await text(a.page)), 'Le caissier A ouvre sa session')

    await a.page.goto(`${base}/pdv/caisses`, { waitUntil: 'load' })
    check(/Votre session SES-/.test(await text(a.page)), 'Le bandeau rappelle la session ouverte')

    await a.page.goto(`${base}/pdv/sessions`, { waitUntil: 'load' })
    check(
      (await a.page.getByRole('button', { name: 'Ouvrir la session' }).count()) === 0,
      'Aucune seconde ouverture n’est proposée au caissier A (B-8)'
    )

    const b = await signIn(browser, base, accounts.caissierB)
    const sessionB = await openByScreen(b.page, base, register2, 30000)
    check(Boolean(sessionB), 'Le caissier B ouvre la sienne sur l’autre caisse')

    /* ------------------------------------------------------------------ */
    console.log('\n2 — B-13 : QUI VOIT QUELS MONTANTS\n')

    await a.page.goto(`${base}/pdv/sessions/${sessionA}`, { waitUntil: 'load' })
    check(/50 000 KMF/.test(await text(a.page)), 'A voit SON fond de caisse')

    await a.page.goto(`${base}/pdv/sessions/${sessionB}`, { waitUntil: 'load' })
    const seenByA = await text(a.page)
    check(/ne sont pas visibles/.test(seenByA), 'A ne voit pas les montants de B — et l’écran le dit')
    check(!/30 000 KMF/.test(seenByA), 'Aucun montant de B ne fuit sur l’écran de A')
    check(!/\b0 KMF/.test(seenByA), 'L’écran n’affiche jamais « 0 KMF » à la place d’un montant caché')
    check(
      (await a.page.getByRole('button', { name: 'Clôturer la session' }).count()) === 0,
      'A ne peut pas clôturer la session de B (Q-2)'
    )

    const p = await signIn(browser, base, accounts.planning)
    await p.page.goto(`${base}/pdv/sessions?jour=${dayOffset(0)}&de=00:00&a=23:59`, { waitUntil: 'load' })
    const seenByPlanning = await text(p.page)
    check(
      /Recette PDV caissierA/.test(seenByPlanning) && /Recette PDV caissierB/.test(seenByPlanning),
      'Le planning sait qui était en caisse aujourd’hui'
    )
    check(!/50 000|30 000/.test(seenByPlanning), 'Le planning ne voit aucun montant')
    check(/Non visibles/.test(seenByPlanning), 'Le planning lit « non visibles », jamais 0')
    check(
      (await p.page.getByRole('link', { name: 'Exporter Excel' }).count()) === 0,
      'Le planning n’a pas d’export'
    )
    const exportRefused = await p.page.request.get(`${base}/api/exports/sessions-caisse`)
    check(exportRefused.status() === 403, 'L’export appelé directement est refusé au planning', `${exportRefused.status()}`)

    /* ------------------------------------------------------------------ */
    console.log('\n3 — B-9 : CLÔTURER, L’ÉCART NE BLOQUE PAS\n')

    await a.page.goto(`${base}/pdv/sessions/${sessionA}`, { waitUntil: 'load' })
    await a.page.getByRole('button', { name: 'Clôturer la session' }).click()
    const refused = await a.page
      .getByText('Le montant compté est obligatoire', { exact: false })
      .first()
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    check(refused, 'Une clôture sans montant compté est refusée, au niveau du champ')

    await closeByScreen(a.page, base, sessionA, 48000)
    check(/Manque de 2 000 KMF/.test(await text(a.page)), 'Le manque de 2 000 est constaté sans bloquer')

    const r = await signIn(browser, base, accounts.responsable)
    await r.page.goto(`${base}/pdv/sessions/${sessionB}`, { waitUntil: 'load' })
    check(/30 000 KMF/.test(await text(r.page)), 'Le responsable voit les montants de B')
    await closeByScreen(r.page, base, sessionB, 35000)
    check(/Excédent de 5 000 KMF/.test(await text(r.page)), 'Le responsable clôt la session de B (Q-2)')

    const { count: entriesAfter } = await admin
      .from('treasury_entries')
      .select('id', { count: 'exact', head: true })
    check(entriesAfter === entriesBefore, 'Aucune écriture de trésorerie (B-9)', `${entriesBefore} → ${entriesAfter}`)

    const exported = await r.page.request.get(`${base}/api/exports/sessions-caisse?jour=${dayOffset(0)}`)
    check(
      exported.status() === 200 && /spreadsheetml/.test(exported.headers()['content-type'] ?? ''),
      'Le responsable exporte les sessions du jour'
    )

    /* ------------------------------------------------------------------ */
    console.log('\n4 — ÉCRITURE DIRECTE\n')

    const direct = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    must(
      await direct.auth.signInWithPassword({
        email: accounts.caissierA.email,
        password: accounts.caissierA.password,
      }),
      'connexion directe du caissier A'
    )
    const forged = await direct.from('pos_sessions').insert({
      session_no: `SES-FORGEE-${STAMP}`,
      register_id: register1,
      cashier_id: accounts.caissierA.id,
    })
    check(Boolean(forged.error), 'Un POST direct sur pos_sessions est refusé', forged.error?.code ?? 'accepté !')

    const patched = await direct
      .from('pos_session_amounts')
      .update({ counted_amount: 50000 })
      .eq('session_id', sessionA)
      .select('session_id')
    check(
      Boolean(patched.error) || (patched.data ?? []).length === 0,
      'Le montant compté ne se réécrit pas par PATCH'
    )

    for (const session of [a, b, p, r]) await session.context.close()
  } finally {
    await browser.close()
    await sweep(admin)
    const after = await residue(admin)
    check(after === 0, 'Démontage : aucun résidu « RECETTE PDV »', `${after}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE POINT DE VENTE : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE POINT DE VENTE : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
