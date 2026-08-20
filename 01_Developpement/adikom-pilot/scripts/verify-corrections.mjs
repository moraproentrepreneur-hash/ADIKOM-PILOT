#!/usr/bin/env node
/**
 * Recette des corrections ciblées — ADIKOM PILOT.
 *
 * Couvre les quatre évolutions demandées après la recette de l'Étape 2.1 :
 *   1. actions globales « Tout accorder » / « Tout refuser » ;
 *   2. défilement indépendant de la barre latérale ;
 *   3. mot de passe temporaire généré, puis changement obligatoire ;
 *   4. protections de sécurité inchangées.
 *
 * Le compte créé pendant la recette est supprimé en fin d'exécution.
 *
 * Utilisation :
 *   node scripts/verify-corrections.mjs [url]
 */

import { randomUUID } from 'node:crypto'

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
const TEST_USERNAME = `recette.corr.${SUFFIX}`
const TEST_EMAIL = `${TEST_USERNAME}@adikom.test`
/**
 * Mot de passe choisi par l'utilisateur pendant la recette.
 * Tiré au hasard à chaque exécution : aucune valeur ressemblant à un secret
 * n'est versionnée, et le compte est supprimé en fin de parcours.
 */
const NEW_PASSWORD = `Recette-${randomUUID().slice(0, 12)}!`

/** Module de test : « Tableau de bord », le plus court du catalogue. */
const MODULE_LABEL = 'Tableau de bord'

async function expandAll(page) {
  await page.evaluate(() => {
    document.querySelectorAll('main details').forEach((d) => d.setAttribute('open', ''))
  })
}

async function login(page, base, username, password) {
  await page.goto(`${base}/connexion`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('button[aria-label]') !== null)
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
}

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
  let temporaryPassword = null

  try {
    // Relevé de référence : les permissions de groupe ne doivent pas bouger.
    const { count: groupRulesBefore } = await service
      .from('group_permissions')
      .select('*', { count: 'exact', head: true })

    await login(page, base, admin, adminPassword)
    await page.waitForURL('**/tableau-de-bord', { timeout: 25000 })

    // ======================= 1. CRÉATION AVEC MOT DE PASSE GÉNÉRÉ ==========
    console.log('1. Création avec mot de passe généré')
    await page.goto(`${base}/utilisateurs/nouveau`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#username') !== null)

    // 17. L'administrateur ne saisit plus de mot de passe.
    const editableCount = await page
      .locator('input[name="password"]:not([type="hidden"]):not([readonly])')
      .count()
    if (editableCount === 0) ok('Aucun champ de saisie de mot de passe', 'génération imposée')
    else ko('Aucun champ de saisie de mot de passe', `${editableCount} champ(s)`)

    const generateButton = page.getByRole('button', { name: 'Générer un mot de passe' })
    if ((await generateButton.count()) === 1) ok('Bouton « Générer un mot de passe » présent')
    else ko('Bouton « Générer un mot de passe » présent')

    // 16. Génération.
    await generateButton.click()
    temporaryPassword = await page.locator('#password-visible').inputValue()
    if (temporaryPassword.length >= 12) {
      ok('Mot de passe temporaire généré', `${temporaryPassword.length} caractères`)
    } else {
      ko('Mot de passe temporaire généré', `${temporaryPassword.length} caractères`)
    }

    const classes = [
      [/[a-z]/, 'minuscule'],
      [/[A-Z]/, 'majuscule'],
      [/[0-9]/, 'chiffre'],
      [/[^A-Za-z0-9]/, 'symbole'],
    ].filter(([re]) => re.test(temporaryPassword))
    if (classes.length === 4) ok('Robustesse', classes.map(([, n]) => n).join(' · '))
    else ko('Robustesse', `${classes.length} catégorie(s) sur 4`)

    if ((await page.getByRole('button', { name: 'Copier' }).count()) === 1) {
      ok('Action de copie disponible')
    } else {
      ko('Action de copie disponible')
    }

    await page.fill('#firstName', 'Recette')
    await page.fill('#lastName', 'Corrections')
    await page.fill('#username', TEST_USERNAME)
    await page.fill('#email', TEST_EMAIL)
    await page.locator('form:has(#username) button[type="submit"]').click()
    await page.waitForURL(/\/utilisateurs\/[0-9a-f-]{36}/, { timeout: 30000 })
    testUserId = page.url().match(/utilisateurs\/([0-9a-f-]{36})/)?.[1] ?? null
    if (testUserId) ok('Compte créé', TEST_USERNAME)
    else ko('Compte créé')

    const { data: created } = await service
      .from('app_users')
      .select('must_change_password')
      .eq('id', testUserId)
      .single()
    if (created?.must_change_password === true) ok('Marqué « changement obligatoire »')
    else ko('Marqué « changement obligatoire »', String(created?.must_change_password))

    // 18. Le mot de passe temporaire n'apparaît nulle part.
    const { data: auditAll } = await service
      .from('audit_log')
      .select('before_data, after_data, reason, comment')
      .order('occurred_at', { ascending: false })
      .limit(200)
    const auditText = JSON.stringify(auditAll ?? [])
    if (!auditText.includes(temporaryPassword)) ok('Absent du journal d’audit')
    else ko('Absent du journal d’audit', '*** PRÉSENT ***')

    const detailHtml = await page.content()
    if (!detailHtml.includes(temporaryPassword)) ok('Absent de la fiche créée')
    else ko('Absent de la fiche créée', '*** PRÉSENT ***')

    // ============================ 2. PERMISSIONS EN MASSE ==================
    console.log('\n2. Actions globales sur les permissions')
    await page.goto(`${base}/utilisateurs/${testUserId}?onglet=permissions`, {
      waitUntil: 'load',
    })
    await page.waitForFunction(() => document.querySelectorAll('main fieldset').length > 0, {
      timeout: 20000,
    })
    await expandAll(page)

    const moduleBlock = page.locator('main details').filter({ hasText: MODULE_LABEL }).first()
    const summary = moduleBlock.locator('summary').first()

    const counterBefore = (await summary.textContent()) ?? ''
    const total = Number(counterBefore.match(/(\d+)\s*\/\s*(\d+)/)?.[2] ?? 0)
    if (total > 0) ok('Compteur du bloc lisible', counterBefore.match(/\d+\s*\/\s*\d+/)?.[0])
    else ko('Compteur du bloc lisible', counterBefore.trim())

    // 2. Tout accorder — avec confirmation.
    await summary.getByRole('button', { name: `Tout accorder — ${MODULE_LABEL}` }).click()
    const confirmAllow = summary.getByRole('button', { name: 'Confirmer' })
    if ((await confirmAllow.count()) === 1) ok('Confirmation demandée avant « Tout accorder »')
    else ko('Confirmation demandée avant « Tout accorder »')
    await confirmAllow.click()

    // 3. Toutes les permissions du bloc passent à « Accorder ».
    const allowSelected = await moduleBlock
      .locator('input[value="ALLOW"]')
      .evaluateAll((nodes) => nodes.every((n) => n.checked))
    if (allowSelected) ok('Toutes les permissions du bloc passent à « Accorder »')
    else ko('Toutes les permissions du bloc passent à « Accorder »')

    // 4. Compteur mis à jour immédiatement.
    const counterAfter = (await summary.textContent()) ?? ''
    if (new RegExp(`${total}\\s*/\\s*${total}`).test(counterAfter)) {
      ok('Compteur mis à jour immédiatement', `${total} / ${total}`)
    } else {
      ko('Compteur mis à jour immédiatement', counterAfter.match(/\d+\s*\/\s*\d+/)?.[0])
    }

    // Les autres blocs ne sont pas touchés.
    const otherModule = page.locator('main details').filter({ hasNotText: MODULE_LABEL }).first()
    const otherAllowed = await otherModule
      .locator('input[value="ALLOW"]')
      .evaluateAll((nodes) => nodes.some((n) => n.checked))
    if (!otherAllowed) ok('Action limitée au bloc concerné')
    else ko('Action limitée au bloc concerné', 'un autre bloc a été modifié')

    await page.locator('main form button[type="submit"]').click()
    await page.waitForFunction(
      () => document.querySelector('main [role="status"], main [role="alert"]') !== null,
      { timeout: 30000 }
    )

    // 5. Persistance.
    const { data: storedAllow } = await service
      .from('user_permissions')
      .select('effect, permissions!inner ( module_code )')
      .eq('user_id', testUserId)
    const dashboardAllow = (storedAllow ?? []).filter(
      (r) => r.permissions.module_code === 'dashboard' && r.effect === 'ALLOW'
    )
    if (dashboardAllow.length === total) {
      ok('« Tout accorder » persisté', `${dashboardAllow.length} règles ALLOW`)
    } else {
      ko('« Tout accorder » persisté', `${dashboardAllow.length} sur ${total}`)
    }

    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelectorAll('main fieldset').length > 0, {
      timeout: 20000,
    })
    await expandAll(page)
    const stillAllowed = await page
      .locator('main details')
      .filter({ hasText: MODULE_LABEL })
      .first()
      .locator('input[value="ALLOW"]')
      .evaluateAll((nodes) => nodes.every((n) => n.checked))
    if (stillAllowed) ok('État conservé après actualisation')
    else ko('État conservé après actualisation')

    // 6 & 7. Tout refuser, avec confirmation explicite.
    console.log('\n3. « Tout refuser »')
    const block2 = page.locator('main details').filter({ hasText: MODULE_LABEL }).first()
    const summary2 = block2.locator('summary').first()
    await summary2.getByRole('button', { name: `Tout refuser — ${MODULE_LABEL}` }).click()

    const warning = (await summary2.textContent()) ?? ''
    if (/Refuser toutes les permissions de cette section/.test(warning)) {
      ok('Confirmation explicite avant « Tout refuser »')
    } else {
      ko('Confirmation explicite avant « Tout refuser »', warning.trim().slice(0, 60))
    }

    // Annulation : rien ne doit changer.
    await summary2.getByRole('button', { name: 'Annuler' }).click()
    const unchanged = await block2
      .locator('input[value="ALLOW"]')
      .evaluateAll((nodes) => nodes.every((n) => n.checked))
    if (unchanged) ok('L’annulation laisse les choix intacts')
    else ko('L’annulation laisse les choix intacts')

    await summary2.getByRole('button', { name: `Tout refuser — ${MODULE_LABEL}` }).click()
    await summary2.getByRole('button', { name: 'Confirmer' }).click()

    const denySelected = await block2
      .locator('input[value="DENY"]')
      .evaluateAll((nodes) => nodes.every((n) => n.checked))
    if (denySelected) ok('Toutes les permissions du bloc passent à « Refuser »')
    else ko('Toutes les permissions du bloc passent à « Refuser »')

    const counterDenied = (await summary2.textContent()) ?? ''
    if (new RegExp(`0\\s*/\\s*${total}`).test(counterDenied)) {
      ok('Compteur ramené à zéro', `0 / ${total}`)
    } else {
      ko('Compteur ramené à zéro', counterDenied.match(/\d+\s*\/\s*\d+/)?.[0])
    }

    await page.locator('main form button[type="submit"]').click()
    await page.waitForFunction(
      () => document.querySelector('main [role="status"], main [role="alert"]') !== null,
      { timeout: 30000 }
    )

    const { data: storedDeny } = await service
      .from('user_permissions')
      .select('effect, permissions!inner ( module_code )')
      .eq('user_id', testUserId)
    const dashboardDeny = (storedDeny ?? []).filter(
      (r) => r.permissions.module_code === 'dashboard' && r.effect === 'DENY'
    )
    if (dashboardDeny.length === total) ok('« Tout refuser » persisté', `${total} règles DENY`)
    else ko('« Tout refuser » persisté', `${dashboardDeny.length} sur ${total}`)

    // 9. Ni les groupes ni l'héritage n'ont été touchés. Comparé au relevé
    // effectué avant toute modification, plutôt qu'à un nombre figé.
    const { count: groupRules } = await service
      .from('group_permissions')
      .select('*', { count: 'exact', head: true })
    const { count: userGroupLinks } = await service
      .from('user_groups')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', testUserId)
    if (groupRules === groupRulesBefore) {
      ok('Permissions de groupe inchangées', `${groupRules} règles`)
    } else {
      ko('Permissions de groupe inchangées', `${groupRulesBefore} → ${groupRules}`)
    }
    if (userGroupLinks === 0) ok('Aucun groupe attribué à tort')
    else ko('Aucun groupe attribué à tort', `${userGroupLinks} rattachement(s)`)

    // ============================ 4. BARRE LATÉRALE ========================
    console.log('\n4. Défilement indépendant de la barre latérale')
    await page.setViewportSize({ width: 1280, height: 600 })
    await page.goto(`${base}/utilisateurs/${testUserId}?onglet=permissions`, {
      waitUntil: 'load',
    })
    await expandAll(page)
    await page.waitForTimeout(500)

    const geometry = await page.evaluate(() => {
      const nav = document.querySelector('aside nav')
      const main = document.querySelector('main')
      return {
        navScrollable: nav.scrollHeight > nav.clientHeight,
        mainScrollable: main.scrollHeight > main.clientHeight,
        bodyScrollable: document.documentElement.scrollHeight > window.innerHeight,
        horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })

    if (geometry.navScrollable) ok('La barre latérale possède son propre défilement')
    else ko('La barre latérale possède son propre défilement')
    if (geometry.mainScrollable) ok('La zone principale conserve le sien')
    else ko('La zone principale conserve le sien')
    if (!geometry.bodyScrollable) ok('Aucun défilement global parasite')
    else ko('Aucun défilement global parasite')
    if (!geometry.horizontal) ok('Aucun défilement horizontal')
    else ko('Aucun défilement horizontal')

    // 10 & 11. Défiler la barre latérale ne déplace pas la zone principale.
    const moved = await page.evaluate(() => {
      const nav = document.querySelector('aside nav')
      const main = document.querySelector('main')
      const mainBefore = main.scrollTop
      nav.scrollTop = nav.scrollHeight
      const navAfter = nav.scrollTop
      const mainAfter = main.scrollTop

      const navBefore2 = nav.scrollTop
      main.scrollTop = main.scrollHeight
      return {
        navScrolled: navAfter > 0,
        mainStayed: mainAfter === mainBefore,
        mainScrolled: main.scrollTop > 0,
        navStayed: nav.scrollTop === navBefore2,
      }
    })

    if (moved.navScrolled && moved.mainStayed) ok('Défiler la barre ne déplace pas le contenu')
    else ko('Défiler la barre ne déplace pas le contenu', JSON.stringify(moved))
    if (moved.mainScrolled && moved.navStayed) ok('Défiler le contenu ne déplace pas la barre')
    else ko('Défiler le contenu ne déplace pas la barre', JSON.stringify(moved))

    // Le bas de la barre reste atteignable.
    const logoutVisible = await page
      .locator('aside form button[type="submit"]')
      .first()
      .isVisible()
    if (logoutVisible) ok('« Se déconnecter » reste accessible')
    else ko('« Se déconnecter » reste accessible')

    await page.setViewportSize({ width: 1280, height: 900 })

    // ==================== 5. PREMIÈRE CONNEXION OBLIGATOIRE ================
    console.log('\n5. Changement obligatoire à la première connexion')
    const userContext = await browser.newContext()
    const userPage = await userContext.newPage()

    await login(userPage, base, TEST_USERNAME, temporaryPassword)
    await userPage.waitForURL('**/changer-mot-de-passe', { timeout: 25000 })
    ok('Redirection vers le changement de mot de passe')

    // 24. Contournement par URL directe.
    const bypass = ['/tableau-de-bord', '/utilisateurs', `/utilisateurs/${testUserId}`]
    let blocked = 0
    for (const route of bypass) {
      await userPage.goto(`${base}${route}`, { waitUntil: 'load' })
      if (userPage.url().includes('/changer-mot-de-passe')) blocked += 1
    }
    if (blocked === bypass.length) {
      ok('Aucune URL protégée ne contourne l’étape', `${blocked}/${bypass.length}`)
    } else {
      ko('Aucune URL protégée ne contourne l’étape', `${blocked}/${bypass.length}`)
    }

    // Le mot de passe temporaire n'apparaît pas dans la page de changement.
    const changeHtml = await userPage.content()
    if (!changeHtml.includes(temporaryPassword)) ok('Mot de passe temporaire absent du HTML')
    else ko('Mot de passe temporaire absent du HTML', '*** PRÉSENT ***')

    /*
     * Contournement par écriture directe, tenté pendant que l'indicateur est
     * encore levé. Une écriture écartée par RLS ne renvoie pas d'erreur : elle
     * ne touche simplement aucune ligne. Le contrôle porte donc sur l'état réel
     * en base, pas sur le retour de l'appel.
     */
    const bypassProbe = createClient(url, anonKey, { auth: { persistSession: false } })
    await bypassProbe.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: temporaryPassword,
    })
    await bypassProbe
      .from('app_users')
      .update({ must_change_password: false })
      .eq('id', testUserId)

    const { data: afterBypass } = await service
      .from('app_users')
      .select('must_change_password')
      .eq('id', testUserId)
      .single()
    if (afterBypass?.must_change_password === true) {
      ok('Levée directe de l’indicateur sans effet', 'indicateur toujours levé')
    } else {
      ko('Levée directe de l’indicateur sans effet', '*** INDICATEUR LEVÉ ***')
    }

    // 21. Changement effectif.
    await userPage.goto(`${base}/changer-mot-de-passe`, { waitUntil: 'load' })
    await userPage.waitForFunction(() => document.querySelector('#confirmation') !== null)
    await userPage.fill('#password', NEW_PASSWORD)
    await userPage.fill('#confirmation', NEW_PASSWORD)
    // Ciblé par son libellé : la page porte aussi un formulaire de déconnexion.
    await userPage.getByRole('button', { name: 'Définir mon mot de passe' }).click()
    await userPage.waitForURL('**/tableau-de-bord', { timeout: 30000 })
    ok('Changement accepté et accès rendu')

    // 23. Accès normal.
    await userPage.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
    if (!userPage.url().includes('/changer-mot-de-passe')) ok('Accès normal au SaaS')
    else ko('Accès normal au SaaS')

    const { data: afterChange } = await service
      .from('app_users')
      .select('must_change_password')
      .eq('id', testUserId)
      .single()
    if (afterChange?.must_change_password === false) ok('Indicateur levé en base')
    else ko('Indicateur levé en base', String(afterChange?.must_change_password))

    await userContext.close()

    // 22. L'ancien mot de passe temporaire ne fonctionne plus.
    const probe = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: oldError } = await probe.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: temporaryPassword,
    })
    if (oldError) ok('Le mot de passe temporaire est devenu inutilisable', oldError.message)
    else ko('Le mot de passe temporaire est devenu inutilisable', 'connexion acceptée')

    const { error: newError } = await probe.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: NEW_PASSWORD,
    })
    if (!newError) ok('Le nouveau mot de passe fonctionne')
    else ko('Le nouveau mot de passe fonctionne', newError.message)

    // Auto-attribution de permissions : toujours refusée.
    const { data: permRow } = await service
      .from('permissions')
      .select('id')
      .eq('code', 'users.users.permissions.update')
      .single()
    const { error: selfPerm } = await probe
      .from('user_permissions')
      .upsert(
        { user_id: testUserId, permission_id: permRow.id, effect: 'ALLOW' },
        { onConflict: 'user_id,permission_id' }
      )
    if (selfPerm) ok('Auto-attribution toujours refusée', selfPerm.code ?? '')
    else ko('Auto-attribution toujours refusée', 'écriture acceptée')

    // ============================= 6. SECRETS ==============================
    console.log('\n6. Données sensibles')
    const listResponse = await page.goto(`${base}/utilisateurs`)
    const listHtml = await listResponse.text()
    const bundles = [...new Set([...listHtml.matchAll(/\/_next\/static\/[^"]+\.js/g)].map((m) => m[0]))]
    let js = ''
    for (const b of bundles) {
      js += await (await page.request.get(`${base}${b}`)).text()
    }
    const leaks = ['sb_secret_', 'postgresql://', 'SERVICE_ROLE', temporaryPassword, NEW_PASSWORD]
    const found = leaks.filter((p) => listHtml.includes(p) || js.includes(p))
    if (found.length === 0) ok('Aucun secret côté client', `${bundles.length} bundles analysés`)
    else ko('Aucun secret côté client', found.join(', '))

    // ======================= 7. SUPER ADMIN INTACT =========================
    console.log('\n7. Super Admin')
    const { data: superAdmin } = await service
      .from('app_users')
      .select('username, is_super_admin, status, must_change_password')
      .eq('username', admin)
      .single()

    if (superAdmin) ok('Le compte « rachade » existe toujours')
    else ko('Le compte « rachade » existe toujours')
    if (superAdmin?.is_super_admin) ok('Toujours Super Admin')
    else ko('Toujours Super Admin')
    if (superAdmin?.status === 'ACTIVE') ok('Toujours actif')
    else ko('Toujours actif', superAdmin?.status)
    if (superAdmin?.must_change_password === false) {
      ok('Aucun changement de mot de passe imposé au Super Admin')
    } else {
      ko('Aucun changement de mot de passe imposé au Super Admin')
    }
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
    console.log(`${GREEN}RECETTE CORRECTIONS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE CORRECTIONS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
