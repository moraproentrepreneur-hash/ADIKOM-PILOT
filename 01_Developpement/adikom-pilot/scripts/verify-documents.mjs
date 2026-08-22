#!/usr/bin/env node
/**
 * Recette sécurité du moteur documentaire — ADIKOM PILOT.
 *
 * Éprouve la règle DEC-024 sur le terrain : consulter, télécharger et imprimer
 * sont trois capacités distinctes, et refuser l'une doit réellement bloquer la
 * route — pas seulement masquer un bouton.
 *
 * Quatre comptes sont créés, chacun avec un jeu de permissions différent, puis
 * chacun appelle la route documentaire dans les trois modes. Aucun identifiant
 * réel n'est nécessaire : le script fabrique ses propres comptes et les
 * supprime en fin d'exécution.
 *
 * Utilisation :
 *   node scripts/verify-documents.mjs [url]
 *
 *   url   par défaut https://adikom-pilot.vercel.app
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

function ok(label, detail = '') {
  passed += 1
  console.log(`  ${GREEN}[OK]${RESET} ${label}${detail ? ` ${DIM}— ${detail}${RESET}` : ''}`)
}

function ko(label, detail = '') {
  failed += 1
  console.log(`  ${RED}[ÉCHEC]${RESET} ${label}${detail ? ` — ${detail}` : ''}`)
}

const STAMP = Date.now().toString().slice(-6)

/** Les quatre cas demandés, plus le cas sans aucun droit sur les clients. */
const PROFILES = [
  {
    key: 'view',
    title: 'CAS 1 — VIEW seul',
    permissions: ['parties.clients.view'],
    expected: { preview: 403, download: 403, print: 403 },
  },
  {
    key: 'download',
    title: 'CAS 2 — VIEW + DOWNLOAD',
    permissions: ['parties.clients.view', 'parties.clients.download'],
    expected: { preview: 200, download: 200, print: 403 },
  },
  {
    key: 'print',
    title: 'CAS 3 — VIEW + PRINT',
    permissions: ['parties.clients.view', 'parties.clients.print'],
    expected: { preview: 200, download: 403, print: 200 },
  },
  {
    key: 'full',
    title: 'CAS 4 — VIEW + DOWNLOAD + PRINT',
    permissions: ['parties.clients.view', 'parties.clients.download', 'parties.clients.print'],
    expected: { preview: 200, download: 200, print: 200 },
  },
  {
    key: 'none',
    title: 'CAS 5 — aucune permission',
    permissions: [],
    expected: { preview: 403, download: 403, print: 403 },
  },
]

async function createProfile(admin, profile) {
  const email = `recette.doc.${profile.key}.${STAMP}@adikom.test`
  const password = `recette-doc-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error || !created.user) throw new Error(`compte ${profile.key} : ${error?.message}`)

  const id = created.user.id

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Document ${profile.key}`,
    username: `recette.doc.${profile.key}.${STAMP}`,
    email,
    status: 'ACTIVE',
  })

  if (profileError) throw new Error(`profil ${profile.key} : ${profileError.message}`)

  if (profile.permissions.length > 0) {
    const { data: catalog } = await admin
      .from('permissions')
      .select('id')
      .in('code', profile.permissions)

    const { error: grantError } = await admin.from('user_permissions').insert(
      (catalog ?? []).map((permission) => ({
        user_id: id,
        permission_id: permission.id,
        effect: 'ALLOW',
      }))
    )

    if (grantError) throw new Error(`permissions ${profile.key} : ${grantError.message}`)
  }

  return { id, email, password, username: `recette.doc.${profile.key}.${STAMP}` }
}

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'

  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  console.log(`\nCible : ${base}\n`)

  // Un client de démonstration sert de sujet : il reste en production, la
  // recette ne le modifie pas.
  const { data: client } = await admin
    .from('clients')
    .select('id, client_no, legal_name')
    .eq('legal_name', 'CLIENT DEMO 01')
    .maybeSingle()

  if (!client) {
    console.error('\n✖ CLIENT DEMO 01 introuvable. Lancer `npm run demo:seed`.\n')
    process.exit(1)
  }

  console.log(`${DIM}Sujet : ${client.legal_name} (${client.client_no})${RESET}`)

  const url = (mode) => `${base}/api/documents/clients/${client.id}?mode=${mode}`
  const accounts = []
  const browser = await chromium.launch()

  try {
    // ------------------------------------------- 0. Sans authentification ---
    console.log('\n0. Visiteur sans session')
    const anonymous = await browser.newContext()
    const anonPage = await anonymous.newPage()
    const anonResponse = await anonPage.request.get(url('download'), { maxRedirects: 0 })

    if ([302, 307, 401].includes(anonResponse.status())) {
      ok('Document refusé sans session', `HTTP ${anonResponse.status()}`)
    } else {
      ko('Document refusé sans session', `HTTP ${anonResponse.status()}`)
    }
    await anonymous.close()

    // ------------------------------------------------- 1 à 5. Les profils ---
    for (const profile of PROFILES) {
      const account = await createProfile(admin, profile)
      accounts.push(account)

      console.log(`\n${profile.title}`)

      const context = await browser.newContext()
      const page = await context.newPage()

      await page.goto(`${base}/connexion`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#username') !== null)
      await page.fill('#username', account.username)
      await page.fill('#password', account.password)
      await page.click('button[type="submit"]')
      await page.waitForURL('**/tableau-de-bord', { timeout: 30000 })

      for (const mode of ['preview', 'download', 'print']) {
        const expected = profile.expected[mode]
        const response = await page.request.get(url(mode), { maxRedirects: 0 })
        const status = response.status()
        const type = response.headers()['content-type'] ?? ''

        if (status !== expected) {
          ko(`${mode} → attendu ${expected}`, `obtenu ${status}`)
          continue
        }

        if (expected === 200) {
          const body = await response.body()
          const isPdf = /pdf/i.test(type) && body.subarray(0, 5).toString('latin1') === '%PDF-'
          const disposition = response.headers()['content-disposition'] ?? ''
          const attached = mode === 'download' ? /attachment/.test(disposition) : /inline/.test(disposition)

          if (isPdf && attached) {
            ok(`${mode} autorisé`, `${(body.byteLength / 1024).toFixed(0)} Ko · ${disposition.split(';')[0]}`)
          } else {
            ko(`${mode} autorisé`, `type ${type}, disposition ${disposition}`)
          }
        } else {
          // Un refus ne doit produire AUCUN fichier.
          const body = await response.body()
          const leaked = body.subarray(0, 5).toString('latin1') === '%PDF-'
          if (leaked) ko(`${mode} refusé`, '*** UN PDF A ÉTÉ SERVI ***')
          else ok(`${mode} refusé`, `HTTP ${status}, aucun fichier`)
        }
      }

      await context.close()
    }

    // ------------------------------------------------------- 6. Audit ------
    console.log('\n6. Journal d’audit')

    const ids = accounts.map((account) => account.id)

    const { count: exports } = await admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'EXPORT')
      .eq('entity_type', 'clients')
      .in('actor_id', ids)

    // CAS 2 et CAS 4 téléchargent : deux entrées attendues.
    if (exports === 2) ok('Téléchargements journalisés', `${exports} entrée(s) EXPORT`)
    else ko('Téléchargements journalisés', `${exports} entrée(s), 2 attendues`)

    const { count: denied } = await admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'ACCESS_DENIED')
      .eq('entity_type', 'clients')
      .in('actor_id', ids)

    // CAS 1 et 5 : 3 refus chacun ; CAS 2 et 3 : 1 refus chacun.
    if (denied === 8) ok('Refus journalisés', `${denied} entrée(s) ACCESS_DENIED`)
    else ko('Refus journalisés', `${denied} entrée(s), 8 attendues`)

    const { count: noisy } = await admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'EXPORT')
      .eq('entity_type', 'clients')
      .in('actor_id', ids)
      .ilike('reason', '%perçu%')

    if (!noisy) ok('L’aperçu ne pollue pas le journal')
    else ko('L’aperçu ne pollue pas le journal', `${noisy} entrée(s)`)
  } finally {
    await browser.close()

    for (const account of accounts) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    console.log(`\n${DIM}Comptes de recette supprimés.${RESET}`)
    console.log(
      `${DIM}Les entrées d'audit produites restent : le journal est immuable.${RESET}`
    )
  }

  console.log(`\n${'─'.repeat(62)}`)
  if (failed === 0) {
    console.log(`${GREEN}RECETTE DOCUMENTAIRE : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE DOCUMENTAIRE : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
