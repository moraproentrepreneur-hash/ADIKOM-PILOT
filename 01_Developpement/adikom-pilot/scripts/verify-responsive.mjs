#!/usr/bin/env node
/**
 * Recette Responsive — LOT 18.
 *
 * CE QU'ELLE MESURE, PLUTÔT QU'ELLE NE REGARDE
 *
 * « L'écran a l'air correct » n'est pas un contrôle. Trois mesures le sont :
 *
 *   1. DÉBORDEMENT HORIZONTAL — `scrollWidth > clientWidth` signifie qu'une
 *      partie de la page est hors de l'écran et qu'il faut la faire glisser
 *      pour la lire. Aucun écran ne doit l'exiger (CLAUDE.md §35).
 *
 *   2. CENTRAGE RÉEL DU LIBELLÉ D'UN BOUTON — mesuré, et pas supposé. Le centre
 *      du CONTENU (texte et icône) est comparé au centre de la BOÎTE, sur les
 *      deux axes. Un libellé « à peu près centré » est un libellé décentré.
 *
 *   3. HAUTEUR DE CIBLE TACTILE — sur mobile, un bouton de moins de 40 px se
 *      rate. La cible est mesurée sur chaque bouton réellement rendu.
 *
 * Elle parcourt la page publique ET les écrans principaux du SaaS, à trois
 * largeurs : mobile étroit, tablette, bureau.
 *
 * UN SUPER ADMIN TEMPORAIRE, JAMAIS CELUI D'ADIKOM
 *
 * Les identifiants du Super Admin ne figurent nulle part dans le code
 * (CLAUDE.md §25) : la recette crée son propre compte, avec un mot de passe
 * aléatoire jamais affiché, et le supprime quoi qu'il arrive. Elle n'écrit
 * AUCUNE donnée métier : elle ne fait que lire des écrans.
 *
 * Utilisation :
 *   node scripts/verify-responsive.mjs [url]
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

function section(title) {
  console.log(`\n──────────────────────────────────────────────────────────────`)
  console.log(`${title}\n`)
}

const STAMP = Date.now().toString().slice(-6)

/** Mobile étroit, tablette, bureau. L'ordre est celui des priorités (§35). */
const FORMATS = [
  [360, 740, 'mobile étroit'],
  [768, 1024, 'tablette'],
  [1440, 900, 'bureau'],
]

/** Les écrans principaux du SaaS — un par menu livré. */
const ROUTES = [
  ['/tableau-de-bord', 'Tableau de bord'],
  ['/notifications', 'Notifications'],
  ['/projets', 'Projets'],
  ['/projets/taches', 'Tâches'],
  ['/projets/calendrier', 'Calendrier'],
  ['/projets/reunions', 'Réunions'],
  ['/tiers/clients', 'Clients'],
  ['/tiers/clients/nouveau', 'Nouveau client'],
  ['/tiers/fournisseurs', 'Fournisseurs'],
  ['/tiers/partenaires', 'Partenaires'],
  ['/location', 'Tableau de location'],
  ['/location/reservations', 'Réservations'],
  ['/location/locations', 'Locations'],
  ['/location/parc', 'Parc automobile'],
  ['/location/tarification', 'Tarification'],
  ['/location/incidents', 'Incidents'],
  ['/location/maintenance', 'Maintenance'],
  ['/tresorerie/comptes', 'Comptes'],
  ['/tresorerie/ecritures', 'Écritures'],
  ['/tresorerie/virements', 'Virements'],
  ['/facturation/clients', 'Factures clients'],
  ['/facturation/fournisseurs', 'Factures fournisseurs'],
  ['/facturation/imputations', 'Imputations'],
  ['/facturation/paiements-divers', 'Paiements divers'],
  ['/utilisateurs', 'Utilisateurs'],
  ['/utilisateurs/groupes', 'Groupes'],
  ['/utilisateurs/hierarchie', 'Vue hiérarchique'],
  ['/utilisateurs/journal', 'Journal d’activité'],
  ['/parametres?onglet=entreprise', 'Paramètres · Entreprise'],
  ['/parametres?onglet=sauvegarde', 'Paramètres · Sauvegarde'],
]

/**
 * Mesure, dans la page rendue, ce qui ne se voit pas à l'œil.
 *
 * Le centre du contenu d'un bouton est obtenu par un `Range` sur ses enfants :
 * c'est la seule façon d'avoir la boîte réelle du texte ET de l'icône, celle
 * que le navigateur a effectivement peinte.
 */
const MEASURE = () => {
  const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth

  const boutons = []

  for (const el of document.querySelectorAll('button, a[href]')) {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue

    /*
     * CE QUI EST MESURÉ : UN BOUTON, PAS UN LIEN DE NAVIGATION.
     *
     * `justify-content: center` est la déclaration qui distingue les deux. Une
     * entrée de barre latérale, une carte cliquable du tableau de bord, un
     * retour « ← Retour à la liste » alignent leur contenu à GAUCHE, et c'est
     * voulu : leur reprocher de ne pas être centrés n'aurait aucun sens.
     *
     * Le contrôle porte donc exactement sur ce qu'il annonce : les éléments qui
     * DÉCLARENT centrer leur contenu doivent le centrer réellement.
     */
    if (!style.display.includes('flex')) continue
    if (style.justifyContent !== 'center') continue

    const box = el.getBoundingClientRect()
    if (box.width < 8 || box.height < 8) continue

    const range = document.createRange()
    range.selectNodeContents(el)
    const content = range.getBoundingClientRect()
    range.detach?.()

    if (content.width < 1 || content.height < 1) continue

    boutons.push({
      label: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
      hauteur: Math.round(box.height),
      largeur: Math.round(box.width),
      dx: Math.abs((content.left + content.right) / 2 - (box.left + box.right) / 2),
      dy: Math.abs((content.top + content.bottom) / 2 - (box.top + box.bottom) / 2),
      horsEcran: Math.round(Math.max(0, box.right - document.documentElement.clientWidth)),
    })
  }

  return { overflow, boutons }
}

/**
 * `pages` porte deux onglets : l'un ouvert dans un contexte TACTILE, l'autre
 * non.
 *
 * Le confort tactile du Design System est posé par `@media (pointer: coarse)` :
 * un navigateur piloté sans `hasTouch` répond `pointer: fine` et la règle ne
 * s'applique jamais. Mesurer les cibles dans un contexte non tactile
 * reviendrait à mesurer une page que personne ne voit.
 */
async function audit(pages, base, route, libelle, width, format) {
  const page = width <= 400 ? pages.tactile : pages.pointeur

  await page.setViewportSize({ width, height: FORMATS.find(([w]) => w === width)[1] })
  await page.goto(`${base}${route}`, { waitUntil: 'load' })
  await page.waitForTimeout(250)

  const { overflow, boutons } = await page.evaluate(MEASURE)

  check(
    overflow <= 1,
    `${libelle} · ${format} : aucun défilement horizontal`,
    `${width} px · débordement ${overflow} px`
  )

  const decentres = boutons.filter((b) => b.dx > 2 || b.dy > 2)
  check(
    decentres.length === 0,
    `${libelle} · ${format} : libellés de boutons centrés`,
    decentres.map((b) => `« ${b.label} » ↔${b.dx.toFixed(1)} ↕${b.dy.toFixed(1)}`).join(' · ')
  )

  const debordants = boutons.filter((b) => b.horsEcran > 1)
  check(
    debordants.length === 0,
    `${libelle} · ${format} : aucun bouton ne sort de l’écran`,
    debordants.map((b) => `« ${b.label} » +${b.horsEcran} px`).join(' · ')
  )

  if (width <= 400) {
    const trop_petits = boutons.filter((b) => b.hauteur < 40)
    check(
      trop_petits.length === 0,
      `${libelle} · ${format} : cibles tactiles d’au moins 40 px`,
      trop_petits.map((b) => `« ${b.label} » ${b.hauteur} px`).join(' · ')
    )
  }

  return boutons.length
}

/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'

  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  console.log(`\nCible : ${base}\n`)

  const { data: residus } = await admin
    .from('app_users')
    .select('username')
    .like('username', 'recette.resp.%')

  if ((residus ?? []).length > 0) {
    throw new Error(
      `Comptes de recette laissés par un passage précédent : ${residus
        .map((u) => u.username)
        .join(', ')}. Les supprimer avant de relancer.`
    )
  }

  const username = `recette.resp.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-resp-${STAMP}-${crypto.randomUUID().slice(0, 8)}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte de recette : ${error?.message}`)

  const { error: profileError } = await admin.from('app_users').insert({
    id: created.user.id,
    first_name: 'Recette',
    last_name: 'Responsive',
    username,
    email,
    status: 'ACTIVE',
    is_super_admin: true,
  })
  if (profileError) throw new Error(`profil de recette : ${profileError.message}`)

  const browser = await chromium.launch()
  let mesures = 0

  try {
    /* --- La page publique, sans session ---------------------------------- */
    section('1. PAGE PUBLIQUE')

    const publicTactile = await browser.newContext({ hasTouch: true })
    const publicPointeur = await browser.newContext()
    const publicPages = {
      tactile: await publicTactile.newPage(),
      pointeur: await publicPointeur.newPage(),
    }

    for (const [width, , format] of FORMATS) {
      mesures += await audit(publicPages, base, '/', 'Accueil', width, format)
      mesures += await audit(publicPages, base, '/connexion', 'Connexion', width, format)
    }

    // Le logo n'est jamais déformé : sa boîte reste carrée (CLAUDE.md §33).
    const publicPage = publicPages.tactile
    await publicPage.setViewportSize({ width: 360, height: 740 })
    await publicPage.goto(`${base}/`, { waitUntil: 'load' })
    const logos = await publicPage.evaluate(() =>
      [...document.querySelectorAll('img[alt*="ADIKOM"]')].map((img) => {
        const box = img.getBoundingClientRect()
        return { w: Math.round(box.width), h: Math.round(box.height) }
      })
    )
    check(
      logos.length > 0 && logos.every((l) => Math.abs(l.w - l.h) <= 1),
      'Accueil · mobile : le logo reste carré, jamais étiré',
      logos.map((l) => `${l.w}×${l.h}`).join(' · ')
    )

    await publicTactile.close()
    await publicPointeur.close()

    /* --- Le SaaS ---------------------------------------------------------- */
    section('2. ÉCRANS DU SAAS')

    const tactile = await browser.newContext({ hasTouch: true })
    const pointeur = await browser.newContext()
    const pages = { tactile: await tactile.newPage(), pointeur: await pointeur.newPage() }

    for (const page of Object.values(pages)) {
      await page.goto(`${base}/connexion`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#username') !== null)
      await page.fill('#username', username)
      await page.fill('#password', password)
      await page.click('button[type="submit"]')
      await page.waitForURL('**/tableau-de-bord', { timeout: 60000 })
    }

    for (const [route, libelle] of ROUTES) {
      for (const [width, , format] of FORMATS) {
        mesures += await audit(pages, base, route, libelle, width, format)
      }
    }

    const page = pages.tactile

    /* --- La barre latérale sur mobile ------------------------------------- */
    section('3. NAVIGATION MOBILE')

    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })

    const ouvrir = page.locator('button[aria-label="Ouvrir la navigation"]')
    check(await ouvrir.isVisible(), 'Mobile : le bouton d’ouverture de la navigation est présent')

    const nav = page.locator('nav[aria-label="Navigation principale"]')
    check(!(await nav.isVisible()), 'Mobile : la navigation ne recouvre pas le contenu par défaut')

    await ouvrir.click()
    await page.waitForTimeout(300)
    check(await nav.isVisible(), 'Mobile : la navigation s’ouvre en panneau')

    const panneau = await page.evaluate(() => {
      const aside = document.querySelector('aside')
      if (!aside) return null
      const box = aside.getBoundingClientRect()
      return { largeur: Math.round(box.width), ecran: document.documentElement.clientWidth }
    })
    check(
      panneau !== null && panneau.largeur <= panneau.ecran,
      'Mobile : le panneau ne dépasse pas la largeur de l’écran',
      panneau ? `${panneau.largeur} px / ${panneau.ecran} px` : 'panneau introuvable'
    )

    const fermer = page.locator('button[aria-label="Fermer la navigation"]')
    check(await fermer.isVisible(), 'Mobile : la navigation peut être refermée')
    await fermer.click()
    await page.waitForTimeout(300)
    check(!(await nav.isVisible()), 'Mobile : la navigation se referme et rend l’écran au contenu')

    /* --- Un tableau financier reste consultable --------------------------- */
    section('4. TABLEAUX ET FICHES')

    await page.goto(`${base}/tresorerie/ecritures`, { waitUntil: 'load' })
    const tableau = await page.evaluate(() => {
      const conteneurs = [...document.querySelectorAll('table')].map((t) => {
        let parent = t.parentElement
        while (parent && getComputedStyle(parent).overflowX !== 'auto') parent = parent.parentElement
        return Boolean(parent)
      })
      return { total: conteneurs.length, encadres: conteneurs.filter(Boolean).length }
    })
    check(
      tableau.total === 0 || tableau.encadres === tableau.total,
      'Écritures · mobile : chaque tableau défile dans son propre conteneur',
      `${tableau.encadres}/${tableau.total}`
    )

    await tactile.close()
    await pointeur.close()
  } finally {
    await browser.close().catch(() => {})

    await admin.from('app_users').delete().eq('id', created.user.id)
    const { error: authError } = await admin.auth.admin.deleteUser(created.user.id)

    if (authError) {
      console.log(`\n${RED}✖ COMPTE DE RECETTE NON SUPPRIMÉ : ${username}${RESET}`)
      failed += 1
    }

    const { data: reste } = await admin
      .from('app_users')
      .select('username')
      .like('username', 'recette.resp.%')
    check((reste ?? []).length === 0, 'Aucun compte de recette ne subsiste')

    console.log(`\n──────────────────────────────────────────────────────────────`)
    console.log(
      `${passed} contrôle(s) réussi(s), ${failed} échec(s) — ${mesures} bouton(s) mesuré(s).`
    )
    console.log('')
  }

  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(`\n${RED}✖ ${error.message}${RESET}\n`)
  process.exit(1)
})
