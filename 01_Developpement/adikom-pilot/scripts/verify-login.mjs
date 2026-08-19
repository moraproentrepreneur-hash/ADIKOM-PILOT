#!/usr/bin/env node
/**
 * Recette de la connexion, dans un vrai navigateur — ADIKOM PILOT.
 *
 * Exerce le formulaire tel qu'un utilisateur l'utilise : saisie, soumission,
 * Server Action, session, redirection. C'est la seule façon de vérifier
 * réellement le parcours de connexion — une requête HTTP fabriquée à la main
 * ne reproduit pas fidèlement l'appel d'une Server Action.
 *
 * Utilisation :
 *   node scripts/verify-login.mjs [url]
 *
 * Par défaut : http://localhost:3100
 */

import { chromium } from '@playwright/test'

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

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'http://localhost:3100'
  const username = required('ADIKOM_ADMIN_USERNAME')
  const password = required('ADIKOM_ADMIN_PASSWORD')

  console.log(`\nCible : ${base}\n`)

  const browser = await chromium.launch()

  /** Ouvre un contexte neuf : aucune session héritée d'un scénario précédent. */
  async function freshPage() {
    const context = await browser.newContext()
    const page = await context.newPage()
    return { context, page }
  }

  /**
   * Ouvre l'écran de connexion et attend l'hydratation.
   *
   * Sans cette attente, la saisie interviendrait avant que React n'attache ses
   * gestionnaires, et le test mesurerait un état transitoire plutôt que le
   * comportement réel.
   */
  async function openLogin(page) {
    await page.goto(`${base}/connexion`, { waitUntil: 'load' })
    await page.waitForFunction(
      () => document.querySelector('button[aria-label]') !== null,
      null,
      { timeout: 20000 }
    )
  }

  // ---------------------------------------------------------------- A ------
  console.log('A. Nom d’utilisateur et mot de passe valides')
  {
    const { context, page } = await freshPage()
    await openLogin(page)

    const label = await page.locator('label[for="username"]').textContent()
    if (label?.includes('utilisateur')) ok('Le champ demande un nom d’utilisateur', label.trim())
    else ko('Le champ demande un nom d’utilisateur', label ?? 'introuvable')

    const placeholder = await page.locator('#username').getAttribute('placeholder')
    ok('Marque substitutive', placeholder ?? '')

    await page.fill('#username', username)
    await page.fill('#password', password)
    await page.click('button[type="submit"]')

    try {
      await page.waitForURL('**/tableau-de-bord', { timeout: 25000 })
      ok('Redirection vers le tableau de bord', page.url().replace(base, ''))
    } catch {
      ko('Redirection vers le tableau de bord', `resté sur ${page.url().replace(base, '')}`)
    }

    const body = await page.textContent('body')
    if (body?.includes('Rachade')) ok('Profil chargé', 'nom affiché dans la barre latérale')
    else ko('Profil chargé', 'nom absent de la page')

    if (body?.includes('Gestion de location')) ok('Navigation chargée selon les permissions')
    else ko('Navigation chargée selon les permissions')

    const cookies = await context.cookies()
    const authCookie = cookies.filter((c) => c.name.includes('auth-token'))
    if (authCookie.length > 0) ok('Session établie', `${authCookie.length} cookie(s)`)
    else ko('Session établie', 'aucun cookie de session')

    // Aucune adresse interne ne doit apparaître dans la page rendue.
    if (body?.includes('@adikom.km')) ko('Adresse interne non exposée', 'email visible dans la page')
    else ok('Adresse interne non exposée')

    await context.close()
  }

  // ---------------------------------------------------------------- B ------
  console.log('\nB. Nom d’utilisateur inexistant')
  {
    const { context, page } = await freshPage()
    await openLogin(page)
    await page.fill('#username', 'utilisateur-qui-nexiste-pas')
    await page.fill('#password', 'motdepassequelconque')
    await page.click('button[type="submit"]')

    await page.waitForSelector('form [role="alert"]', { timeout: 25000 }).catch(() => null)
    const alert = (await page.locator('form [role="alert"]').textContent().catch(() => '')) ?? ''

    if (page.url().includes('/connexion')) ok('Connexion refusée', 'maintenu sur /connexion')
    else ko('Connexion refusée', `redirigé vers ${page.url()}`)

    if (/incorrect/i.test(alert)) ok('Message générique', alert.trim())
    else ko('Message générique', alert.trim() || 'aucun message')

    if (/@|existe pas|introuvable|Supabase|invalid/i.test(alert)) {
      ko('Aucune fuite d’information', alert.trim())
    } else {
      ok('Aucune fuite d’information', 'ni email, ni existence du compte')
    }

    await context.close()
  }

  // ---------------------------------------------------------------- C ------
  console.log('\nC. Nom d’utilisateur valide, mot de passe erroné')
  {
    const { context, page } = await freshPage()
    await openLogin(page)
    await page.fill('#username', username)
    await page.fill('#password', 'mauvaisMotDePasse123')
    await page.click('button[type="submit"]')

    await page.waitForSelector('form [role="alert"]', { timeout: 25000 }).catch(() => null)
    const alert = (await page.locator('form [role="alert"]').textContent().catch(() => '')) ?? ''

    if (page.url().includes('/connexion')) ok('Connexion refusée')
    else ko('Connexion refusée', `redirigé vers ${page.url()}`)

    if (/incorrect/i.test(alert)) ok('Message identique au cas B', alert.trim())
    else ko('Message identique au cas B', alert.trim() || 'aucun message')

    await context.close()
  }

  // ---------------------------------------------------------------- D ------
  console.log('\nD. Mot de passe de moins de 8 caractères')
  {
    const { context, page } = await freshPage()

    // Compte les appels réseau vers l'action de connexion : il ne doit y en
    // avoir aucun, la validation devant intervenir avant toute soumission.
    let serverCalls = 0
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/connexion')) serverCalls += 1
    })

    await openLogin(page)
    await page.fill('#username', username)
    await page.fill('#password', 'court')
    await page.locator('#password').blur()

    const hint = (await page.locator('#password-error').textContent().catch(() => '')) ?? ''
    if (/8/.test(hint)) ok('Message de validation à la saisie', hint.trim())
    else ko('Message de validation à la saisie', hint.trim() || 'aucun message')

    await page.click('button[type="submit"]')
    await page.waitForTimeout(1500)

    const after = (await page.locator('#password-error').textContent().catch(() => '')) ?? ''
    if (/8/.test(after)) ok('Message maintenu après tentative de soumission')
    else ko('Message maintenu après tentative de soumission', after.trim() || 'aucun')

    if (page.url().includes('/connexion')) ok('Maintenu sur l’écran de connexion')
    else ko('Maintenu sur l’écran de connexion', page.url())

    if (serverCalls === 0) ok('Aucune tentative d’authentification inutile')
    else ko('Aucune tentative d’authentification inutile', `${serverCalls} appel(s) serveur`)

    await context.close()
  }

  // ---------------------------------------------------------------- E ------
  console.log('\nE. Utilisateur non authentifié')
  {
    const { context, page } = await freshPage()
    await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'domcontentloaded' })

    if (page.url().includes('/connexion')) {
      ok('Route protégée', `redirigé vers ${page.url().replace(base, '')}`)
    } else {
      ko('Route protégée', `accessible sans session : ${page.url()}`)
    }
    await context.close()
  }

  // ------------------------------------------------- Affichage du mot de passe
  console.log('\nBascule d’affichage du mot de passe')
  {
    const { context, page } = await freshPage()
    await openLogin(page)
    await page.fill('#password', 'secret123')

    const before = await page.locator('#password').getAttribute('type')
    await page.click('button[aria-label="Afficher le mot de passe"]')
    const during = await page.locator('#password').getAttribute('type')
    await page.click('button[aria-label="Masquer le mot de passe"]')
    const after = await page.locator('#password').getAttribute('type')

    if (before === 'password' && during === 'text' && after === 'password') {
      ok('Afficher / masquer', `${before} → ${during} → ${after}`)
    } else {
      ko('Afficher / masquer', `${before} → ${during} → ${after}`)
    }
    await context.close()
  }

  await browser.close()

  console.log(`\n${'─'.repeat(58)}`)
  if (failed === 0) {
    console.log(`${GREEN}RECETTE CONNEXION : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE CONNEXION : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
