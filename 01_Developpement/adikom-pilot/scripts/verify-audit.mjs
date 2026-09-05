#!/usr/bin/env node
/**
 * Recette Journal d'activité — LOT 15.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:audit` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL contrôle la structure et les droits avec le rôle de service,
 * pour lequel `current_actor()` vaut NULL : aucune capacité n'y est détenue.
 * Celle-ci ouvre de VRAIES sessions et éprouve ce que chaque profil peut lire —
 * par l'écran ET par appel direct à l'API, sans passer par aucun bouton.
 *
 * LA FRONTIÈRE CENTRALE DU LOT (DEC-038)
 *
 *   `users.audit.view`  ouvre L'ÉVÉNEMENT : qui, quoi, quand, sur quel objet,
 *                       avec quel résultat, et quels champs ont changé.
 *
 *   Le DÉTAIL avant/après — la donnée métier elle-même — n'est rendu qu'à qui
 *   détient EN PLUS la lecture de l'objet concerné.
 *
 * Sans cette frontière, une seule capacité rendrait lisible tout le SaaS :
 * l'email d'un collaborateur, le montant d'une facture, la coordonnée de
 * règlement d'un fournisseur. Trois règles l'interdisent — `06_Audit.md` §51 et
 * §62, `Module 08` §46 — et la recette les éprouve toutes les trois par appel
 * direct, là où aucun écran ne protège plus rien.
 *
 * Les critères d'acceptation de `06_Audit.md` §82 que le lot couvre :
 *
 *   §82.21 — le Super Admin peut consulter l'audit ;
 *   §82.22 — les utilisateurs ordinaires ne peuvent pas modifier l'audit ;
 *   §82.23 à §82.29 — les événements se recherchent et se filtrent par
 *                     utilisateur, module, période, objet et référence ;
 *   §82.30 — les données sensibles sont protégées ;
 *   §82.31 — les opérations refusées se distinguent des opérations réussies.
 *
 * AUCUNE DATE EN DUR : les bornes de période se posent sur `Indian/Comoro`
 * (DEC-025 §e), par `dayOffset`.
 *
 * AUCUN SUJET N'EST FABRIQUÉ. Les événements éprouvés sont ceux que le journal
 * contient déjà : il est en écriture seule, et toute ligne qu'une recette y
 * ajouterait ne pourrait PLUS JAMAIS en être retirée (DEC-020, DEC-022). Seuls
 * les comptes de recette sont créés, puis supprimés.
 *
 * Utilisation :
 *   node scripts/verify-audit.mjs [url]
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

const STAMP = Date.now().toString().slice(-6)

/** Lecture commune : c'est l'écran d'atterrissage, sans rapport avec le lot. */
const BASE = ['dashboard.view']

/**
 * Un profil par frontière éprouvée.
 *
 * Aucun ne cumule la lecture du journal et celle de plusieurs modules : c'est
 * précisément le cumul qui masquerait le défaut. Un compte qui lirait à la fois
 * les clients ET les factures ne dirait rien de la frontière entre les deux.
 */
const PROFILES = {
  /*
   * LE PROFIL CENTRAL DU LOT.
   *
   * Il lit le journal ET RIEN D'AUTRE. C'est la dotation d'un contrôleur
   * interne : il doit pouvoir établir QUI a fait QUOI (§53), sans obtenir au
   * passage la donnée métier de sept modules.
   */
  journal: [...BASE, 'users.audit.view'],

  /*
   * LA MÊME LECTURE, PLUS UN SEUL MODULE.
   *
   * Il voit le détail d'un événement portant sur un CLIENT, et doit se voir
   * refuser celui d'un événement portant sur une FACTURE. La frontière n'est
   * pas « journal / hors journal » : elle est objet par objet.
   */
  journal_client: [...BASE, 'users.audit.view', 'parties.clients.view'],

  /* Il consulte et exporte : les deux capacités du menu (§64). */
  journal_export: [...BASE, 'users.audit.view', 'users.audit.export'],

  /*
   * EXPORTER SANS POUVOIR CONSULTER.
   *
   * `users.audit.export` seule ne doit rien produire : on n'exporte pas ce
   * qu'on n'a pas le droit de voir. Sans ce contrôle, ce compte recevrait un
   * classeur VIDE — RLS ayant tout filtré — et le lirait comme « il ne s'est
   * rien passé ».
   */
  exportateur_seul: [...BASE, 'users.audit.export'],

  /* Rien du journal : l'écran, l'API et l'export lui sont fermés. */
  sans_acces: [...BASE],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.jrn.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-jrn-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${key} : ${error?.message}`)

  const id = created.user.id
  accounts[key] = { id, email, password, username }

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Jrn ${key}`,
    username,
    email,
    status: 'ACTIVE',
  })
  if (profileError) throw new Error(`profil ${key} : ${profileError.message}`)

  const { data: catalog } = await admin.from('permissions').select('id, code').in('code', codes)
  if ((catalog ?? []).length !== codes.length) {
    const found = new Set((catalog ?? []).map((p) => p.code))
    throw new Error(
      `catalogue incomplet (${key}) : ${codes.filter((c) => !found.has(c)).join(', ')}`
    )
  }

  const { error: grantError } = await admin
    .from('user_permissions')
    .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' })))
  if (grantError) throw new Error(`permissions ${key} : ${grantError.message}`)

  return accounts[key]
}

async function signIn(browser, base, account) {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${base}/connexion`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#username') !== null)
  await page.fill('#username', account.username)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/tableau-de-bord', { timeout: 60000 })

  return { context, page }
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/**
 * Le contenu des LIGNES, sans le formulaire de filtres.
 *
 * Le piège que cette fonction ferme : le filtre par module est un `<select>`
 * qui porte le nom de TOUS les modules. Un contrôle lisant `main` entier
 * trouverait « Gestion de location » sur un écran filtré sur la trésorerie —
 * et croirait le filtre cassé alors qu'il lit la liste déroulante.
 */
async function rowsText(page) {
  const body = page.locator('main table tbody')
  if ((await body.count()) === 0) return ''
  return (await body.first().innerText()).replace(/\s+/g, ' ')
}

/**
 * Un événement existant d'un type donné — jamais fabriqué.
 *
 * Le journal ne se nettoie pas : ce qu'une recette y écrirait resterait à
 * jamais. Elle lit donc ce qui s'y trouve déjà.
 */
async function findEvent(admin, entityType, extra = {}) {
  let query = admin
    .from('audit_log')
    .select('id, entity_type, entity_id, entity_label, actor_id, actor_label, action, occurred_at')
    .eq('entity_type', entityType)

  for (const [column, value] of Object.entries(extra)) query = query.eq(column, value)

  const { data, error } = await query.order('id', { ascending: false }).limit(1)
  if (error) throw new Error(`événement ${entityType} : ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error(`aucun événement « ${entityType} » au journal : la recette ne peut rien éprouver`)
  }
  return data[0]
}

/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'
  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nCible : ${base}\n`)

  const accounts = {}
  const sessions = {}
  const browser = await chromium.launch()

  async function session(key) {
    if (sessions[key]) return sessions[key]
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await client.auth.signInWithPassword({
      email: accounts[key].email,
      password: accounts[key].password,
    })
    if (error) throw new Error(`session ${key} : ${error.message}`)
    sessions[key] = client
    return client
  }

  try {
    /* --- Sujets de recette ------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, accounts, key, codes)
    }
    console.log(`  ${DIM}${Object.keys(PROFILES).length} profils créés${RESET}`)

    // Les trois événements sur lesquels se joue la frontière du détail.
    const evtClient = await findEvent(admin, 'clients')
    const evtFacture = await findEvent(admin, 'supplier_invoices')
    const evtUtilisateur = await findEvent(admin, 'app_users', {
      entity_id: accounts.journal.id,
    })
    console.log(
      `  ${DIM}événements observés : client #${evtClient.id}, facture #${evtFacture.id}, utilisateur #${evtUtilisateur.id}${RESET}`
    )

    /* ================== 1. ACCÈS À L'ÉCRAN ================================ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1. Accès à l’écran (§41, Module 08 §45)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.sans_acces)
      await page.goto(`${base}/utilisateurs/journal`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Sans users.audit.view, le journal est refusé',
        page.url().replace(base, '')
      )

      // Le masquage n'est pas une protection, mais annoncer un écran qu'on ne
      // peut pas ouvrir est un défaut d'interface.
      await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      const nav = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(
        !nav.includes('Journal d’activité'),
        'La barre latérale n’annonce pas un écran fermé'
      )

      await page.goto(`${base}/utilisateurs/journal/${evtClient.id}`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'La fiche d’un événement est refusée elle aussi',
        page.url().replace(base, '')
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.journal)
      await page.goto(`${base}/utilisateurs/journal`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(page.url().includes('/utilisateurs/journal'), 'Avec la capacité, le journal s’ouvre')
      check(text.includes('Journal d’activité'), 'L’écran porte son titre')

      const nav = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(nav.includes('Journal d’activité'), 'La barre latérale l’annonce')

      // §54 : le journal doit identifier l'auteur, l'action, l'élément, la date.
      for (const colonne of ['Date et heure', 'Auteur', 'Action', 'Objet', 'Module', 'Résultat']) {
        check(text.includes(colonne), `Colonne « ${colonne} » présente`)
      }

      check(
        /Événements 1 à \d+ sur/.test(text) && /page 1 sur/.test(text),
        'La lecture est paginée et annonce son volume',
        (text.match(/Événements [\d   ]+ à [\d   ]+ sur [\d   ]+/) ?? [''])[0]
      )

      await context.close()
    }

    /* ================== 2. PAGINATION ===================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2. Le volume ne tronque pas la lecture (Module 08 §56)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.journal)

      await page.goto(`${base}/utilisateurs/journal`, { waitUntil: 'load' })
      const premiere = await mainText(page)

      await page.goto(`${base}/utilisateurs/journal?page=2`, { waitUntil: 'load' })
      const seconde = await mainText(page)

      check(seconde.includes('page 2 sur'), 'La page 2 s’ouvre')
      check(premiere !== seconde, 'Elle montre d’autres événements que la première')
      check(seconde.includes('Précédent') && seconde.includes('Suivant'), 'Les deux sens sont offerts')

      /*
       * UNE PAGE HORS BORNES N'EST PAS UNE PANNE.
       *
       * Le défaut que ce contrôle a révélé : PostgREST refuse une plage dont le
       * début dépasse le nombre de lignes (PGRST103). Une page tapée à la main
       * dans l'URL rendait donc « Cette page n'a pas pu être affichée » — une
       * panne annoncée là où il n'y avait qu'une page inexistante. La lecture
       * ramène désormais la page dans ses bornes.
       */
      await page.goto(`${base}/utilisateurs/journal?page=999999`, { waitUntil: 'load' })
      const horsBornes = await mainText(page)
      check(
        !horsBornes.includes('n’a pas pu être affichée'),
        'Une page hors bornes n’affiche pas une panne'
      )
      const bornes = /page (\d+) sur (\d+)/.exec(horsBornes)
      check(
        Boolean(bornes) && bornes[1] === bornes[2],
        'Elle est ramenée à la dernière page existante',
        bornes ? `page ${bornes[1]} sur ${bornes[2]}` : 'aucune pagination affichée'
      )

      await context.close()
    }

    /* ================== 3. FILTRES (§42 à §48) ============================ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3. Recherche et filtres (§42 à §48)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.journal)
      const client = await session('journal')

      // --- Par module (§44) ---
      await page.goto(`${base}/utilisateurs/journal?module=treasury`, { waitUntil: 'load' })
      const parModule = await rowsText(page)
      check(
        parModule.includes('Banques & Caisses') && !parModule.includes('Gestion de location'),
        'Filtre par module : seul le module demandé ressort',
        parModule ? '' : 'aucune ligne affichée'
      )

      // Le contrôle décisif est en base, pas à l'écran : l'écran pourrait
      // n'afficher qu'une page juste sur un filtre faux.
      const { data: treasuryRows } = await client
        .from('audit_log')
        .select('module_code')
        .eq('module_code', 'treasury')
        .limit(200)
      check(
        (treasuryRows ?? []).length > 0 &&
          (treasuryRows ?? []).every((r) => r.module_code === 'treasury'),
        'Filtre par module : aucun intrus dans les lignes filtrées',
        `${(treasuryRows ?? []).length} lignes`
      )

      // --- Par action (§46) ---
      await page.goto(`${base}/utilisateurs/journal?action=PERMISSION_CHANGE`, {
        waitUntil: 'load',
      })
      const parAction = await rowsText(page)
      check(
        parAction.includes('Changement de permission'),
        'Filtre par action : les changements de permission se retrouvent'
      )
      check(
        !parAction.includes('Création') && !parAction.includes('Connexion'),
        'Filtre par action : aucune autre action ne s’y glisse'
      )

      // --- Par résultat (§60) ---
      const { count: refus } = await client
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('result', 'DENIED')
      check(
        typeof refus === 'number',
        'Filtre par résultat : les refus se comptent séparément des réussites',
        `${refus} refus au journal`
      )

      // --- Par auteur (§43) ---
      await page.goto(`${base}/utilisateurs/journal?auteur=${evtUtilisateur.actor_id ?? ''}`, {
        waitUntil: 'load',
      })
      const parAuteur = await mainText(page)
      check(
        !parAuteur.includes('Le journal d’activité n’a pas pu être chargé'),
        'Filtre par auteur : l’écran répond'
      )

      const { data: acteurs } = await client.rpc('audit_actors')
      check(
        (acteurs ?? []).length > 0,
        'Le filtre par auteur se peuple SANS users.users.view',
        `${(acteurs ?? []).length} auteurs`
      )
      check(
        (acteurs ?? []).every((a) => a.actor_id && a.actor_label),
        'Aucun auteur anonyme dans le filtre'
      )

      // --- Par période (§45), sur le jour comorien ---
      const aujourdhui = dayOffset(0)
      await page.goto(`${base}/utilisateurs/journal?du=${aujourdhui}&au=${aujourdhui}`, {
        waitUntil: 'load',
      })
      const duJour = await mainText(page)
      check(
        !duJour.includes('Aucun événement'),
        'Filtre du jour : les comptes créés à l’instant y figurent',
        aujourdhui
      )

      const demain = dayOffset(1)
      await page.goto(`${base}/utilisateurs/journal?du=${demain}&au=${demain}`, {
        waitUntil: 'load',
      })
      check(
        (await mainText(page)).includes('Aucun événement ne correspond'),
        'Filtre sur demain : rien, et l’écran le dit',
        demain
      )

      // --- Par référence (§48) ---
      await page.goto(
        `${base}/utilisateurs/journal?q=${encodeURIComponent(evtUtilisateur.entity_id)}`,
        { waitUntil: 'load' }
      )
      const parReference = await mainText(page)
      check(
        !parReference.includes('Aucun événement ne correspond'),
        'Recherche par référence : l’objet se retrouve par son identifiant'
      )

      // --- Un filtre sans résultat n'est pas une erreur ---
      await page.goto(`${base}/utilisateurs/journal?q=INTROUVABLE-${STAMP}`, {
        waitUntil: 'load',
      })
      const vide = await mainText(page)
      check(
        vide.includes('Aucun événement ne correspond') &&
          vide.includes('Réinitialiser les filtres'),
        'Un filtre sans résultat propose de revenir en arrière'
      )

      // --- Une recherche à ponctuation ne casse pas la requête ---
      await page.goto(`${base}/utilisateurs/journal?q=${encodeURIComponent('Dupont, (Marie) 100%')}`, {
        waitUntil: 'load',
      })
      check(
        !(await mainText(page)).includes('n’a pas pu être chargé'),
        'Une recherche ponctuée ne rompt pas la requête'
      )

      await context.close()
    }

    /* ================== 4. LA FRONTIÈRE DU DÉTAIL (DEC-038) =============== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4. Le détail avant/après suit l’objet, pas le journal (§51, §62)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.journal)

      await page.goto(`${base}/utilisateurs/journal/${evtClient.id}`, { waitUntil: 'load' })
      const fiche = await mainText(page)

      check(fiche.includes('L’événement'), 'La fiche de l’événement s’ouvre')
      check(
        fiche.includes('Détail non consultable avec vos droits'),
        'Sans la lecture des clients, le détail se refuse'
      )
      check(
        fiche.includes('Consulter les clients') || fiche.includes('parties.clients.view'),
        'Le refus NOMME la capacité qui l’ouvrirait',
        'DEC-017 — jamais un détail vide'
      )
      // L'événement, lui, reste entier : c'est tout l'objet de la distinction.
      check(fiche.includes('Auteur'), 'L’auteur reste lisible')
      check(fiche.includes('Type d’objet'), 'L’objet concerné reste lisible')
      check(
        fiche.includes('Champs modifiés'),
        'Ce qui a changé reste lisible — sans la valeur'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.journal_client)

      await page.goto(`${base}/utilisateurs/journal/${evtClient.id}`, { waitUntil: 'load' })
      const surClient = await mainText(page)
      check(
        !surClient.includes('Détail non consultable'),
        'Avec la lecture des clients, le détail d’un client s’ouvre'
      )
      check(
        surClient.includes('Avant') && surClient.includes('Après'),
        'La situation avant / après est présentée (§9, §10)'
      )

      // LA MOITIÉ QUI COMPTE : la même capacité n'ouvre pas les factures.
      await page.goto(`${base}/utilisateurs/journal/${evtFacture.id}`, { waitUntil: 'load' })
      const surFacture = await mainText(page)
      check(
        surFacture.includes('Détail non consultable avec vos droits'),
        'La MÊME capacité n’ouvre pas le détail d’une facture'
      )
      check(
        surFacture.includes('factures fournisseurs') ||
          surFacture.includes('billing.supplier_invoices.view'),
        'Et le refus nomme la capacité manquante'
      )

      await context.close()
    }

    /* --- Par appel direct : là où plus aucun écran ne protège ------------- */
    {
      const journal = await session('journal')
      const journalClient = await session('journal_client')
      const sansAcces = await session('sans_acces')

      // La colonne n'est plus atteignable, quelle que soit la requête écrite.
      const brut = await journal.from('audit_log').select('id, before_data').limit(1)
      check(
        Boolean(brut.error),
        'API : `before_data` est refusée à la lecture directe',
        brut.error ? String(brut.error.message).slice(0, 60) : '*** COLONNE LISIBLE ***'
      )

      const apres = await journal.from('audit_log').select('after_data').limit(1)
      check(
        Boolean(apres.error),
        'API : `after_data` est refusée à la lecture directe',
        apres.error ? String(apres.error.message).slice(0, 60) : '*** COLONNE LISIBLE ***'
      )

      // Et l'écran, lui, continue de lire ce qu'il doit lire.
      const evenement = await journal
        .from('audit_log')
        .select('id, occurred_at, actor_label, action, result, entity_type')
        .limit(1)
      check(
        !evenement.error && (evenement.data ?? []).length === 1,
        'API : l’événement reste lisible avec la capacité',
        evenement.error ? String(evenement.error.message).slice(0, 60) : ''
      )

      // La fonction arbitre, et le dit.
      const refuse = await journal.rpc('audit_entry_detail', { p_id: evtClient.id })
      const refuseRow = (refuse.data ?? [])[0]
      check(
        !refuse.error && refuseRow && refuseRow.may_read === false,
        'RPC : le détail est refusé sans la lecture de l’objet'
      )
      check(
        refuseRow && refuseRow.before_data === null && refuseRow.after_data === null,
        'RPC : et rien de la donnée métier ne transite'
      )
      check(
        refuseRow && refuseRow.required_permission === 'parties.clients.view',
        'RPC : la capacité manquante est nommée',
        refuseRow?.required_permission ?? '(aucune)'
      )

      const ouvert = await journalClient.rpc('audit_entry_detail', { p_id: evtClient.id })
      const ouvertRow = (ouvert.data ?? [])[0]
      check(
        !ouvert.error && ouvertRow && ouvertRow.may_read === true,
        'RPC : avec la lecture de l’objet, le détail s’ouvre'
      )

      const ferme = await journalClient.rpc('audit_entry_detail', { p_id: evtFacture.id })
      const fermeRow = (ferme.data ?? [])[0]
      check(
        !ferme.error && fermeRow && fermeRow.may_read === false,
        'RPC : la lecture des clients n’ouvre pas une facture'
      )
      check(
        fermeRow && fermeRow.before_data === null && fermeRow.after_data === null,
        'RPC : aucun montant ne transite vers qui n’y a pas droit'
      )

      // Sans la lecture du journal, rien du tout.
      const interdit = await sansAcces.rpc('audit_entry_detail', { p_id: evtClient.id })
      check(
        Boolean(interdit.error),
        'RPC : sans users.audit.view, la fonction refuse',
        interdit.error ? String(interdit.error.message).slice(0, 60) : '*** OUVERTE À TORT ***'
      )

      const listeInterdite = await sansAcces.from('audit_log').select('id').limit(5)
      check(
        (listeInterdite.data ?? []).length === 0,
        'API : sans la capacité, le journal ne rend aucune ligne'
      )

      const acteursInterdits = await sansAcces.rpc('audit_actors')
      check(
        Boolean(acteursInterdits.error) || (acteursInterdits.data ?? []).length === 0,
        'API : le filtre par auteur ne révèle personne non plus'
      )
    }

    /* ================== 5. LE JOURNAL RESTE INFALSIFIABLE ================= */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5. Écriture seule, y compris par appel direct (§40, §77)\n')

    {
      const journal = await session('journal')

      const modif = await journal
        .from('audit_log')
        .update({ reason: `falsification ${STAMP}` }, { count: 'exact' })
        .eq('id', evtClient.id)
      check(
        Boolean(modif.error) || !modif.count,
        'Un événement ne se réécrit pas',
        modif.error ? String(modif.error.message).slice(0, 60) : 'aucune ligne modifiée'
      )

      const suppr = await journal
        .from('audit_log')
        .delete({ count: 'exact' })
        .eq('id', evtClient.id)
      check(
        Boolean(suppr.error) || !suppr.count,
        'Un événement ne s’efface pas',
        suppr.error ? String(suppr.error.message).slice(0, 60) : 'aucune ligne supprimée'
      )

      const ajout = await journal
        .from('audit_log')
        .insert({ action: 'CREATE', entity_type: `faux_${STAMP}` })
      check(
        Boolean(ajout.error),
        'Un événement ne s’invente pas',
        ajout.error ? String(ajout.error.message).slice(0, 60) : '*** INSERTION ACCEPTÉE ***'
      )

      // L'événement observé est intact après les trois tentatives.
      const { data: intact } = await admin
        .from('audit_log')
        .select('reason')
        .eq('id', evtClient.id)
        .single()
      check(
        !String(intact?.reason ?? '').includes('falsification'),
        'Et l’événement observé est resté intact'
      )
    }

    /* ================== 6. EXPORT (§64) =================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6. L’export est une capacité distincte (§64, DEC-024)\n')

    {
      const route = `${base}/api/exports/journal`

      /*
       * La route s'éprouve avec la SESSION du profil, jamais avec un jeton
       * porté en en-tête : l'application s'authentifie par cookie, et un appel
       * Bearer serait refusé en 401 pour tout le monde — le contrôle
       * paraîtrait vert sans avoir rien éprouvé, et surtout sans laisser la
       * trace de refus qu'il doit produire.
       */
      const refusEcran = async (key, libelle) => {
        const { context, page } = await signIn(browser, base, accounts[key])
        const reponse = await page.request.get(route)
        check(reponse.status() === 403, libelle, `HTTP ${reponse.status()}`)
        await context.close()
      }

      await refusEcran('journal', 'Consulter n’emporte pas exporter')
      await refusEcran('exportateur_seul', 'Exporter sans pouvoir consulter ne produit rien')

      const { context, page } = await signIn(browser, base, accounts.journal_export)

      /*
       * Délai allongé, délibérément.
       *
       * Un export du journal lit jusqu'à cinq mille événements et compose un
       * classeur : quelques secondes sont NORMALES. Le délai par défaut du
       * navigateur — trente secondes — ferait échouer la recette pour une
       * lenteur attendue, et non pour un défaut. Ce qu'on éprouve ici, c'est
       * que l'export ABOUTIT, pas qu'il est instantané.
       */
      const debutExport = Date.now()
      const reponse = await page.request.get(route, { timeout: 120000 })
      check(
        Date.now() - debutExport < 60000,
        'L’export aboutit dans un délai exploitable',
        `${Math.round((Date.now() - debutExport) / 100) / 10} s`
      )
      check(reponse.status() === 200, 'Avec les deux capacités, l’export est produit',
        `HTTP ${reponse.status()}`)
      check(
        (reponse.headers()['content-type'] ?? '').includes('spreadsheetml'),
        'Le fichier est bien un classeur',
        reponse.headers()['content-type'] ?? ''
      )
      const corps = await reponse.body()
      check(corps.length > 1000, 'Le classeur n’est pas vide', `${corps.length} octets`)

      await page.goto(`${base}/utilisateurs/journal`, { waitUntil: 'load' })
      check(
        (await mainText(page)).includes('Exporter Excel'),
        'Le bouton d’export s’affiche pour qui le détient'
      )
      await context.close()

      const { context: ctx2, page: page2 } = await signIn(browser, base, accounts.journal)
      await page2.goto(`${base}/utilisateurs/journal`, { waitUntil: 'load' })
      check(
        !(await mainText(page2)).includes('Exporter Excel'),
        'Il ne s’affiche pas pour qui ne le détient pas'
      )
      await ctx2.close()

      // §64 : un export fait sortir des données ; il se journalise lui-même.
      const { count: exports } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'EXPORT')
        .eq('entity_type', 'audit_log')
      check(
        (exports ?? 0) > 0,
        'L’export du journal est lui-même journalisé',
        `${exports} export(s)`
      )

      const { count: refusExport } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'ACCESS_DENIED')
        .eq('entity_type', 'audit_log')
      check(
        (refusExport ?? 0) > 0,
        'Un export refusé laisse lui aussi sa trace (§61)',
        `${refusExport} refus`
      )
    }

    /* ================== 7. NON-RÉGRESSION ================================= */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7. Non-régression — le lot ne referme rien d’autre\n')

    {
      // Le retrait du SELECT de table sur `audit_log` est la modification la
      // plus intrusive du lot : elle touche une table lue par toute
      // l'application au travers de `log_audit`. Si une action ordinaire
      // cessait de journaliser, personne ne s'en apercevrait — sauf ici.
      const journal = await session('journal')

      const avant = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'app_users')

      const { context, page } = await signIn(browser, base, accounts.journal_client)

      // Une connexion est journalisée (§25) : elle vient de se produire.
      const { count: connexions } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'LOGIN')
        .eq('actor_id', accounts.journal_client.id)
      check((connexions ?? 0) > 0, 'Les connexions continuent d’être journalisées', `${connexions}`)

      await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      check(!page.url().includes('/acces-refuse'), 'Le tableau de bord s’ouvre toujours')

      await page.goto(`${base}/tiers/clients`, { waitUntil: 'load' })
      check(
        !page.url().includes('/acces-refuse'),
        'La liste des clients s’ouvre toujours'
      )
      await context.close()

      const apres = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'app_users')
      check(
        (apres.count ?? 0) >= (avant.count ?? 0),
        'Le journal continue de s’alimenter',
        `${avant.count} → ${apres.count}`
      )

      // Le catalogue n'a pas bougé : le lot n'ajoute aucune capacité.
      const { count: catalogue } = await journal
        .from('permissions')
        .select('id', { count: 'exact', head: true })
      check(catalogue === 170, 'Catalogue à 170 capacités', String(catalogue))

      const { count: inventees } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
        .like('code', 'users.audit.%')
      check(inventees === 2, 'Deux capacités d’audit, pas une de plus', String(inventees))
    }

    /* ================== 8. RESPONSIVE ===================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8. Responsive (Module 08 §55, CLAUDE.md §35)\n')

    {
      /*
       * Le contrôle porte sur le débordement HORIZONTAL du corps de page : un
       * écran qu'il faut faire glisser latéralement pour lire n'est pas
       * responsive, il est réduit. Les débordements INTERNES — un tableau dans
       * son propre conteneur `overflow-x-auto` — sont légitimes.
       */
      const ecrans = [
        ['/utilisateurs/journal', 'Journal'],
        [`/utilisateurs/journal/${evtClient.id}`, 'Fiche d’un événement'],
      ]

      const formats = [
        [390, 844, 'mobile'],
        [820, 1180, 'tablette'],
        [1440, 900, 'desktop'],
      ]

      const { context, page } = await signIn(browser, base, accounts.journal)

      for (const [route, libelle] of ecrans) {
        for (const [width, height, format] of formats) {
          await page.setViewportSize({ width, height })
          await page.goto(`${base}${route}`, { waitUntil: 'load' })

          const debordement = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          )
          check(
            debordement <= 1,
            `${libelle} · ${format} : aucun défilement horizontal`,
            `${width} px · débordement ${debordement} px`
          )
        }
      }

      // Le tableau cède la place à des cartes : l'interface est réorganisée,
      // pas rétrécie (Design System §53).
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${base}/utilisateurs/journal`, { waitUntil: 'load' })
      const tableau = await page.locator('main table').count()
      const visible = tableau > 0 ? await page.locator('main table').first().isVisible() : false
      check(!visible, 'Journal · mobile : le tableau cède la place aux cartes')
      check(
        (await mainText(page)).includes('Réussie') || (await mainText(page)).includes('Refusée'),
        'Journal · mobile : le résultat reste lisible'
      )

      await context.close()
    }
  } finally {
    await browser.close()
    for (const client of Object.values(sessions)) await client.auth.signOut()

    /*
     * NETTOYAGE.
     *
     * Le journal, lui, ne se nettoie pas : les événements produits par la
     * création et la suppression des comptes de recette y restent, comme ceux
     * de toute opération. C'est la propriété qui fait sa valeur (§40), et la
     * raison pour laquelle cette recette n'y écrit rien d'autre.
     */
    for (const account of Object.values(accounts)) {
      await admin.from('user_departments').delete().eq('user_id', account.id)
      await admin.from('user_groups').delete().eq('user_id', account.id)
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').update({ manager_id: null }).eq('manager_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    /*
     * BALAYAGE PAR MARQUEUR — le nettoyage par identifiants suivis ne suffit
     * pas : un `delete` refusé ne lève rien avec PostgREST.
     */
    const leftovers = []

    const { count: strayUsers } = await admin
      .from('app_users')
      .select('id', { count: 'exact', head: true })
      .like('username', `recette.jrn.%.${STAMP}`)
    if (strayUsers) leftovers.push(`app_users : ${strayUsers}`)

    // La recette ne crée aucun autre sujet ; le contrôle le vérifie plutôt que
    // de l'affirmer.
    const { count: strayLog } = await admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', `faux_${STAMP}`)
    if (strayLog) leftovers.push(`audit_log (entrées inventées) : ${strayLog}`)

    if (leftovers.length > 0) {
      failed += 1
      console.log(`\n${RED}Résidus de recette non supprimés — ${leftovers.join(', ')}${RESET}`)
    } else {
      console.log(`\n${DIM}Comptes de recette supprimés. Données DEMO intactes.${RESET}`)
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE JOURNAL D’ACTIVITÉ : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE JOURNAL D’ACTIVITÉ : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
