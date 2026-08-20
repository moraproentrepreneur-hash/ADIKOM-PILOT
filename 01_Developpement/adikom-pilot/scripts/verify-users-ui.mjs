#!/usr/bin/env node
/**
 * Recette fonctionnelle du module Utilisateurs — ADIKOM PILOT.
 *
 * Parcourt l'interface dans un vrai navigateur : connexion, liste, recherche,
 * création, fiche à deux onglets, modification, désactivation.
 *
 * Le compte créé pendant la recette est supprimé en fin d'exécution.
 *
 * Utilisation :
 *   node scripts/verify-users-ui.mjs [url]
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

const NEW_USERNAME = `recette.ui.${Date.now().toString().slice(-6)}`
const NEW_EMAIL = `${NEW_USERNAME}@adikom.test`
const NEW_PASSWORD = 'recette-interface-2026'

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'http://localhost:3100'
  const admin = required('ADIKOM_ADMIN_USERNAME')
  const adminPassword = required('ADIKOM_ADMIN_PASSWORD')

  console.log(`\nCible : ${base}\n`)

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  let createdId = null

  try {
    // ------------------------------------------------------- Connexion ----
    await page.goto(`${base}/connexion`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('button[aria-label]') !== null)
    await page.fill('#username', admin)
    await page.fill('#password', adminPassword)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/tableau-de-bord', { timeout: 25000 })

    // ---------------------------------------------------- 1. Navigation ---
    console.log('1. Accès au module')
    const navLink = page.locator('aside a[href="/utilisateurs"]').first()
    if (await navLink.count()) ok('Entrée « Utilisateurs » active dans la barre latérale')
    else ko('Entrée « Utilisateurs » active dans la barre latérale', 'introuvable')

    // Les assertions portent sur `main` : l'en-tête applicatif affiche le nom
    // du compte connecté et provoquerait des succès trompeurs.
    const mainText = async () => (await page.locator('main').textContent()) ?? ''

    await page.goto(`${base}/utilisateurs`, { waitUntil: 'load' })
    const body = await mainText()
    if (body.includes('Utilisateurs')) ok('Liste affichée')
    else ko('Liste affichée')
    if (body.includes('Rachade')) ok('Le Super Admin figure dans la liste')
    else ko('Le Super Admin figure dans la liste')

    // ------------------------------------------------------ 2. Recherche --
    console.log('\n2. Recherche et filtres')
    await page.goto(`${base}/utilisateurs?q=rachade`, { waitUntil: 'load' })
    if ((await mainText()).includes('Rachade')) ok('Recherche par identifiant')
    else ko('Recherche par identifiant')

    await page.goto(`${base}/utilisateurs?q=zzzintrouvable`, { waitUntil: 'load' })
    const emptyBody = await mainText()
    if (/Aucun utilisateur ne correspond/i.test(emptyBody)) ok('État vide explicite')
    else ko('État vide explicite', 'message absent')

    // ------------------------------------------------------ 3. Création ---
    console.log('\n3. Création d’un utilisateur')
    await page.goto(`${base}/utilisateurs/nouveau`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#password') !== null)

    await page.fill('#firstName', 'Recette')
    await page.fill('#lastName', 'Interface')
    await page.fill('#username', NEW_USERNAME)
    await page.fill('#email', NEW_EMAIL)
    await page.fill('#password', NEW_PASSWORD)
    await page.fill('#jobTitle', 'Testeur')

    const department = page.locator('input[name="departmentIds"]').first()
    if (await department.count()) await department.check()

    // Le sélecteur doit viser le formulaire de création : l'en-tête applicatif
    // contient lui aussi un formulaire dont le bouton est de type « submit ».
    await page.locator('form:has(#password) button[type="submit"]').click()
    await page.waitForURL(/\/utilisateurs\/[0-9a-f-]{36}/, { timeout: 30000 })

    const detailUrl = page.url()
    createdId = detailUrl.match(/utilisateurs\/([0-9a-f-]{36})/)?.[1] ?? null

    if (createdId) ok('Compte créé', NEW_USERNAME)
    else ko('Compte créé', `URL inattendue : ${detailUrl}`)

    await page.waitForLoadState('networkidle')
    const detail = await mainText()
    if (detail.includes('Recette Interface')) ok('Fiche ouverte sur le nouveau compte')
    else ko('Fiche ouverte sur le nouveau compte', detail.slice(0, 80))
    if (/Compte créé/.test(detail)) ok('Confirmation de création affichée')
    else ko('Confirmation de création affichée')

    // Le mot de passe initial ne doit apparaître nulle part.
    const html = await page.content()
    if (html.includes(NEW_PASSWORD)) ko('Mot de passe initial non exposé', '*** VISIBLE DANS LA PAGE ***')
    else ok('Mot de passe initial non exposé')

    // -------------------------------------------------------- 4. Onglets --
    console.log('\n4. Fiche à deux onglets')
    const tabs = await page.locator('nav[aria-label="Sections de la fiche"] a').allTextContents()
    if (tabs.length === 2 && tabs[0].includes('Utilisateur') && tabs[1].includes('Permissions')) {
      ok('Exactement deux onglets', tabs.join(' · '))
    } else {
      ko('Exactement deux onglets', tabs.join(' · ') || 'aucun')
    }

    await page.goto(`${base}/utilisateurs/${createdId}?onglet=permissions`, { waitUntil: 'load' })
    const perms = await mainText()
    if (/permission/i.test(perms) && /sur 135/.test(perms)) {
      ok('Onglet Permissions : synthèse affichée')
    } else {
      ko('Onglet Permissions : synthèse affichée')
    }
    if (/Gestion de location/.test(perms)) ok('Arborescence des modules présente')
    else ko('Arborescence des modules présente')
    if (/Non défini/.test(perms)) ok('État « non défini » distingué')
    else ko('État « non défini » distingué')
    // Le Super Admin dispose du droit de modifier les permissions individuelles :
    // l'onglet expose un sélecteur à trois états par permission du catalogue.
    const selectorCount = await page.locator('main form fieldset').count()
    if (selectorCount === 135) {
      ok('Permissions individuelles modifiables', `${selectorCount} sélecteurs`)
    } else {
      ko('Permissions individuelles modifiables', `${selectorCount} sélecteurs`)
    }

    // --------------------------------------------------- 5. Modification --
    console.log('\n5. Modification')
    await page.goto(`${base}/utilisateurs/${createdId}?mode=edition`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#jobTitle') !== null)
    await page.fill('#jobTitle', 'Responsable recette')
    await page.locator('form:has(#jobTitle) button[type="submit"]').click()
    await page.waitForTimeout(3000)

    await page.goto(`${base}/utilisateurs/${createdId}`, { waitUntil: 'load' })
    const updated = await mainText()
    if (updated.includes('Responsable recette')) ok('Modification enregistrée')
    else ko('Modification enregistrée')

    // ------------------------------------------------- 6. Désactivation ---
    console.log('\n6. Désactivation')
    const statusSelect = page.locator('select[name="status"]')
    if (await statusSelect.count()) {
      await statusSelect.selectOption('INACTIVE')
      await page.fill('input[name="reason"]', 'Recette automatisée')
      await page.locator('form:has(select[name="status"]) button[type="submit"]').click()
      await page.waitForTimeout(3000)

      await page.goto(`${base}/utilisateurs/${createdId}`, { waitUntil: 'load' })
      const after = await mainText()
      if (/Inactif/.test(after)) ok('Compte désactivé', 'statut Inactif')
      else ko('Compte désactivé', 'statut inchangé')
    } else {
      ko('Formulaire de statut disponible', 'absent')
    }

    // --------------------------------------------- 7. Fuite de données ----
    console.log('\n7. Données sensibles')
    const listHtml = await (await page.goto(`${base}/utilisateurs`)).text()
    const bundles = [...listHtml.matchAll(/\/_next\/static\/[^"]+\.js/g)].map((m) => m[0])
    let js = ''
    for (const b of [...new Set(bundles)]) {
      js += await (await page.request.get(`${base}${b}`)).text()
    }
    const leaks = ['sb_secret_', 'postgresql://', 'SERVICE_ROLE', NEW_PASSWORD]
    const found = leaks.filter((p) => listHtml.includes(p) || js.includes(p))
    if (found.length === 0) ok('Aucun secret côté client', `${bundles.length} bundle(s) analysé(s)`)
    else ko('Aucun secret côté client', found.join(', '))
  } finally {
    await browser.close()

    if (createdId) {
      const adminClient = createClient(
        required('NEXT_PUBLIC_SUPABASE_URL'),
        required('SUPABASE_SERVICE_ROLE_KEY'),
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      await adminClient.from('app_users').delete().eq('id', createdId)
      await adminClient.auth.admin.deleteUser(createdId)
      console.log(`\n${DIM}Compte de recette supprimé.${RESET}`)
    }
  }

  console.log(`\n${'─'.repeat(58)}`)
  if (failed === 0) {
    console.log(`${GREEN}RECETTE FONCTIONNELLE UTILISATEURS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE FONCTIONNELLE UTILISATEURS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
