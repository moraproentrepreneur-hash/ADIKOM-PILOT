#!/usr/bin/env node
/**
 * Recette de la modification des permissions individuelles — ADIKOM PILOT.
 *
 * Vérifie l'onglet « Permissions » de bout en bout : affichage des états,
 * modification par le Super Admin, persistance réelle en base, effet sur les
 * droits de l'utilisateur concerné, journalisation, et impossibilité de
 * contourner le contrôle par un appel direct.
 *
 * Contrôle également la hiérarchie visuelle de la barre latérale.
 *
 * Le compte créé pendant la recette est supprimé en fin d'exécution.
 *
 * Utilisation :
 *   node scripts/verify-permissions-ui.mjs [url]
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

const SUFFIX = Date.now().toString().slice(-6)
const TEST_USERNAME = `recette.perm.${SUFFIX}`
const TEST_EMAIL = `${TEST_USERNAME}@adikom.test`
const TEST_PASSWORD = 'recette-permissions-2026'

/** Déplie tous les modules : sans droits, ils sont repliés par défaut. */
async function expandAll(page) {
  await page.evaluate(() => {
    document.querySelectorAll('main details').forEach((d) => d.setAttribute('open', ''))
  })
}

/** Permission non sensible, choisie pour son effet visible sur la navigation. */
const TARGET_CODE = 'parties.clients.view'
/** Permission d'administration : elle ne doit jamais devenir auto-attribuable. */
const ADMIN_CODE = 'users.users.permissions.update'

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'http://localhost:3100'
  const admin = required('ADIKOM_ADMIN_USERNAME')
  const adminPassword = required('ADIKOM_ADMIN_PASSWORD')
  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const service = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nCible : ${base}\n`)

  const browser = await chromium.launch()
  const page = await browser.newPage()
  let testUserId = null

  try {
    // ------------------------------------------------------- Connexion ----
    await page.goto(`${base}/connexion`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('button[aria-label]') !== null)
    await page.fill('#username', admin)
    await page.fill('#password', adminPassword)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/tableau-de-bord', { timeout: 25000 })

    // ------------------------------------------ 1. Barre latérale ---------
    console.log('1. Hiérarchie visuelle de la barre latérale')

    const colour = (selector) =>
      page.locator(selector).first().evaluate((n) => getComputedStyle(n).color)

    const sectionColour = await page
      .locator('aside nav > ul > li > p')
      .first()
      .evaluate((n) => getComputedStyle(n).color)
    if (sectionColour === 'rgb(30, 90, 168)') {
      ok('Menu principal en bleu ADIKOM', sectionColour)
    } else {
      ko('Menu principal en bleu ADIKOM', sectionColour)
    }

    // Sous-menu accessible : « Utilisateurs », seul sous-menu livré.
    const submenuColour = await colour('aside a[href="/utilisateurs"]')
    if (submenuColour === 'rgb(31, 41, 55)') {
      ok('Sous-menu accessible en texte foncé', submenuColour)
    } else {
      ko('Sous-menu accessible en texte foncé', submenuColour)
    }

    // Entrée non accessible : conserve le style atténué et le curseur interdit.
    const disabled = page.locator('aside [aria-disabled="true"]').first()
    const disabledStyle = await disabled.evaluate((n) => {
      const s = getComputedStyle(n)
      return `${s.color}|${s.cursor}`
    })
    // Tailwind v4 rend l'opacité en oklab : on vérifie donc que la couleur est
    // atténuée, et surtout qu'elle n'est ni l'encre ni le bleu ADIKOM.
    const disabledAttenuated =
      /\/ 0\.6\)|rgba\(107, 114, 128/.test(disabledStyle) &&
      !/rgb\(31, 41, 55\)|rgb\(30, 90, 168\)/.test(disabledStyle)
    if (disabledAttenuated && /not-allowed/.test(disabledStyle)) {
      ok('Entrée inaccessible : style désactivé conservé', disabledStyle)
    } else {
      ko('Entrée inaccessible : style désactivé conservé', disabledStyle)
    }

    const disabledCount = await page.locator('aside [aria-disabled="true"]').count()
    if (disabledCount > 0) ok('Entrées « à venir » toujours signalées', `${disabledCount} entrées`)
    else ko('Entrées « à venir » toujours signalées')

    // Élément sélectionné : identifiable par aria-current et par le fond.
    const active = page.locator('aside a[aria-current="page"]')
    if ((await active.count()) === 1) {
      const activeStyle = await active.evaluate((n) => {
        const s = getComputedStyle(n)
        return `${s.color}|${s.backgroundColor}`
      })
      if (/rgb\(30, 90, 168\)/.test(activeStyle) && /rgb\(242, 246, 251\)/.test(activeStyle)) {
        ok('Élément sélectionné identifiable', activeStyle)
      } else {
        ko('Élément sélectionné identifiable', activeStyle)
      }
    } else {
      ko('Élément sélectionné identifiable', `${await active.count()} élément(s) actif(s)`)
    }

    // ---------------------------------------- 2. Compte de recette --------
    console.log('\n2. Préparation d’un compte de recette')
    await page.goto(`${base}/utilisateurs/nouveau`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#password') !== null)
    await page.fill('#firstName', 'Recette')
    await page.fill('#lastName', 'Permissions')
    await page.fill('#username', TEST_USERNAME)
    await page.fill('#email', TEST_EMAIL)
    await page.fill('#password', TEST_PASSWORD)
    await page.locator('form:has(#password) button[type="submit"]').click()
    await page.waitForURL(/\/utilisateurs\/[0-9a-f-]{36}/, { timeout: 30000 })
    testUserId = page.url().match(/utilisateurs\/([0-9a-f-]{36})/)?.[1] ?? null
    if (testUserId) ok('Compte de recette créé', TEST_USERNAME)
    else ko('Compte de recette créé')

    // ------------------------------------ 3. Onglet Permissions -----------
    console.log('\n3. Onglet Permissions')
    await page.goto(`${base}/utilisateurs/${testUserId}?onglet=permissions`, {
      waitUntil: 'load',
    })
    await page.waitForFunction(() => document.querySelectorAll('fieldset').length > 0, {
      timeout: 20000,
    })

    const selectors = await page.locator('form fieldset').count()
    if (selectors === 135) ok('Les 135 permissions sont modifiables', `${selectors} sélecteurs`)
    else ko('Les 135 permissions sont modifiables', `${selectors} sélecteurs`)

    const radios = await page.locator(`input[name="perm:${TARGET_CODE}"]`).count()
    if (radios === 3) ok('Trois états proposés par permission', 'Non défini · Accorder · Refuser')
    else ko('Trois états proposés par permission', `${radios} options`)

    const inheritChecked = await page
      .locator(`input[name="perm:${TARGET_CODE}"][value="INHERIT"]`)
      .isChecked()
    if (inheritChecked) ok('État initial « non défini » correctement présélectionné')
    else ko('État initial « non défini » correctement présélectionné')

    const mainText = (await page.locator('main').textContent()) ?? ''
    if (/Non défini/.test(mainText)) ok('États existants toujours affichés')
    else ko('États existants toujours affichés')

    // ------------------------------------------- 4. Modification ----------
    console.log('\n4. Modification par le Super Admin')

    // Les modules sans aucun droit sont repliés : un utilisateur les déplie
    // pour agir. La recette fait de même avant d'interagir.
    await expandAll(page)

    // Le bouton radio est masqué visuellement (`sr-only`) : c'est le libellé
    // qui est cliqué, exactement comme le ferait un utilisateur.
    await page.locator(`label:has(input[name="perm:${TARGET_CODE}"][value="ALLOW"])`).click()
    await page.locator(`label:has(input[name="perm:${ADMIN_CODE}"][value="DENY"])`).click()

    if (
      (await page.locator(`input[name="perm:${TARGET_CODE}"][value="ALLOW"]`).isChecked()) &&
      (await page.locator(`input[name="perm:${ADMIN_CODE}"][value="DENY"]`).isChecked())
    ) {
      ok('Sélection des états par le libellé')
    } else {
      ko('Sélection des états par le libellé')
    }

    // Le formulaire visé est celui de l'onglet : l'en-tête applicatif porte lui
    // aussi un formulaire dont le bouton est de type « submit ».
    await page.locator('main form button[type="submit"]').click()
    await page.waitForFunction(
      () => document.querySelector('main [role="status"], main [role="alert"]') !== null,
      { timeout: 30000 }
    )

    const feedback = (await page.locator('main [role="status"], main [role="alert"]').first().textContent()) ?? ''
    if (/mise[s]? à jour/i.test(feedback)) ok('Modification confirmée à l’écran', feedback.trim())
    else ko('Modification confirmée à l’écran', feedback.trim())

    // --------------------------------------- 5. Persistance en base -------
    console.log('\n5. Persistance')
    const { data: stored } = await service
      .from('user_permissions')
      .select('effect, permissions ( code )')
      .eq('user_id', testUserId)

    const storedMap = new Map((stored ?? []).map((r) => [r.permissions.code, r.effect]))
    if (storedMap.get(TARGET_CODE) === 'ALLOW') ok('Autorisation enregistrée dans Supabase')
    else ko('Autorisation enregistrée dans Supabase', String(storedMap.get(TARGET_CODE)))
    if (storedMap.get(ADMIN_CODE) === 'DENY') ok('Refus explicite enregistré dans Supabase')
    else ko('Refus explicite enregistré dans Supabase', String(storedMap.get(ADMIN_CODE)))

    // ------------------------------------- 6. État après actualisation ----
    console.log('\n6. Persistance après actualisation')
    await page.goto(`${base}/utilisateurs/${testUserId}?onglet=permissions`, {
      waitUntil: 'load',
    })
    await page.waitForFunction(() => document.querySelectorAll('fieldset').length > 0, {
      timeout: 20000,
    })
    const stillAllowed = await page
      .locator(`input[name="perm:${TARGET_CODE}"][value="ALLOW"]`)
      .isChecked()
    const stillDenied = await page
      .locator(`input[name="perm:${ADMIN_CODE}"][value="DENY"]`)
      .isChecked()
    if (stillAllowed && stillDenied) ok('Le nouvel état est conservé après rechargement')
    else ko('Le nouvel état est conservé après rechargement', `${stillAllowed} / ${stillDenied}`)

    const afterText = (await page.locator('main').textContent()) ?? ''
    if (/Accordé individuellement/.test(afterText)) ok('Origine « individuelle » distinguée')
    else ko('Origine « individuelle » distinguée')

    // ------------------------- 7. Effet réel sur les droits ---------------
    console.log('\n7. Effet réel sur les droits de l’utilisateur')
    const asUser = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: signInError } = await asUser.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })
    if (signInError) ko('Connexion du compte de recette', signInError.message)

    const { data: codes } = await asUser.rpc('my_permissions')
    const granted = new Set(codes ?? [])
    if (granted.has(TARGET_CODE)) ok('La permission accordée est effective', TARGET_CODE)
    else ko('La permission accordée est effective', TARGET_CODE)
    if (!granted.has(ADMIN_CODE)) ok('La permission refusée reste inopérante', ADMIN_CODE)
    else ko('La permission refusée reste inopérante', ADMIN_CODE)

    // ------------------- 8 & 9. Contournement par appel direct ------------
    console.log('\n8. Contournement impossible')

    // 8a. Écriture directe en base sans le droit : refusée par RLS.
    const { data: permRow } = await service
      .from('permissions')
      .select('id')
      .eq('code', ADMIN_CODE)
      .single()

    const { error: rlsError } = await asUser
      .from('user_permissions')
      .upsert(
        { user_id: testUserId, permission_id: permRow.id, effect: 'ALLOW' },
        { onConflict: 'user_id,permission_id' }
      )
    if (rlsError) ok('Écriture directe refusée par RLS', rlsError.code ?? rlsError.message)
    else ko('Écriture directe refusée par RLS', 'écriture acceptée')

    // 8b. Auto-attribution : refusée par la base, même avec le droit.
    const asAdmin = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data: adminRow } = await service
      .from('app_users')
      .select('id, email')
      .eq('username', admin)
      .single()
    await asAdmin.auth.signInWithPassword({ email: adminRow.email, password: adminPassword })

    const { error: selfError } = await asAdmin
      .from('user_permissions')
      .upsert(
        { user_id: adminRow.id, permission_id: permRow.id, effect: 'ALLOW' },
        { onConflict: 'user_id,permission_id' }
      )
    if (selfError) ok('Auto-attribution refusée en base', selfError.message.slice(0, 60))
    else ko('Auto-attribution refusée en base', 'écriture acceptée')

    // 8c. La Server Action refuse un appel sans le droit correspondant.
    const userPage = await (await browser.newContext()).newPage()
    await userPage.goto(`${base}/connexion`, { waitUntil: 'load' })
    await userPage.waitForFunction(() => document.querySelector('button[aria-label]') !== null)
    await userPage.fill('#username', TEST_USERNAME)
    await userPage.fill('#password', TEST_PASSWORD)
    await userPage.click('button[type="submit"]')
    await userPage.waitForURL('**/tableau-de-bord', { timeout: 25000 })

    await userPage.goto(`${base}/utilisateurs/${testUserId}?onglet=permissions`, {
      waitUntil: 'load',
    })
    const userMain = (await userPage.textContent('body')) ?? ''
    const userSelectors = await userPage.locator('form fieldset').count()
    if (userSelectors === 0) ok('Aucun contrôle de modification pour un compte non habilité')
    else ko('Aucun contrôle de modification pour un compte non habilité', `${userSelectors}`)
    if (/Accès refusé|introuvable|non consultables|Consultation seule/i.test(userMain)) {
      ok('Refus explicite plutôt qu’arborescence vide')
    } else {
      ko('Refus explicite plutôt qu’arborescence vide', userMain.slice(0, 80))
    }
    await userPage.context().close()

    // -------------------------------------------------- 10. Audit --------
    console.log('\n9. Audit')
    const { data: auditRows } = await service
      .from('audit_log')
      .select('action, entity_type, entity_id, before_data, after_data, occurred_at')
      .eq('entity_type', 'user_permissions')
      .eq('entity_id', testUserId)
      .order('occurred_at', { ascending: false })

    const events = auditRows ?? []
    if (events.length >= 2) ok('Chaque changement est journalisé', `${events.length} événements`)
    else ko('Chaque changement est journalisé', `${events.length} événement(s)`)
    if (events.every((e) => e.action === 'PERMISSION_CHANGE')) {
      ok('Action journalisée sous PERMISSION_CHANGE')
    } else {
      ko('Action journalisée sous PERMISSION_CHANGE')
    }
    if (events.some((e) => e.after_data !== null)) ok('Valeur après changement conservée')
    else ko('Valeur après changement conservée')

    // ------------------------------- 11. Protection du Super Admin -------
    console.log('\n10. Protections conservées')
    const { data: superRow } = await service
      .from('app_users')
      .select('id')
      .eq('username', admin)
      .single()

    await page.goto(`${base}/utilisateurs/${superRow.id}?onglet=permissions`, {
      waitUntil: 'load',
    })
    const superSelectors = await page.locator('form fieldset').count()
    if (superSelectors === 0) ok('Fiche Super Admin : aucune règle individuelle proposée')
    else ko('Fiche Super Admin : aucune règle individuelle proposée', `${superSelectors}`)

    const superText = (await page.locator('main').textContent()) ?? ''
    if (/rôle système Super Admin/i.test(superText)) ok('Motif expliqué à l’écran')
    else ko('Motif expliqué à l’écran')

    // ------------------------------------------ 12. Secrets --------------
    console.log('\n11. Données sensibles')
    const html = await page.content()
    const leaks = ['sb_secret_', 'postgresql://', 'SERVICE_ROLE', TEST_PASSWORD]
    const found = leaks.filter((p) => html.includes(p))
    if (found.length === 0) ok('Aucun secret exposé au client')
    else ko('Aucun secret exposé au client', found.join(', '))
  } finally {
    await browser.close()

    if (testUserId) {
      const cleanup = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await cleanup.from('user_permissions').delete().eq('user_id', testUserId)
      await cleanup.from('app_users').delete().eq('id', testUserId)
      await cleanup.auth.admin.deleteUser(testUserId)
      console.log(`\n${DIM}Compte de recette supprimé.${RESET}`)
    }
  }

  console.log(`\n${'─'.repeat(58)}`)
  if (failed === 0) {
    console.log(`${GREEN}RECETTE PERMISSIONS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE PERMISSIONS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
