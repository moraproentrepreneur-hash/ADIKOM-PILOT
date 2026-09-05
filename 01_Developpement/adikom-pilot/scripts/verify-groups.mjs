#!/usr/bin/env node
/**
 * Recette Groupes & Vue hiérarchique — LOT 14.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:groups` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL contrôle les règles avec le rôle de service, pour lequel
 * `current_actor()` vaut NULL : aucune capacité n'y est vérifiée. Celle-ci
 * ouvre de VRAIES sessions et éprouve ce que chaque profil peut faire — par
 * l'écran ET par appel direct à l'API, sans passer par aucun bouton.
 *
 * Les critères d'acceptation du Module 08 §61 que le lot couvre servent de fil :
 *
 *   §61.9  — les groupes peuvent être créés ;
 *   §61.10 — les groupes peuvent être listés ;
 *   §61.11 — les utilisateurs peuvent être associés à des groupes ;
 *   §61.25 — la vue hiérarchique représente l'organisation d'ADIKOM ;
 *   §61.26 — une personne peut être responsable de plusieurs départements.
 *
 * Et les frontières que le lot pose :
 *
 *   §52, DEC-024 — DÉSACTIVER N'EST PAS MODIFIER. Un compte de
 *                  `users.groups.update` ne peut pas désactiver un groupe ; un
 *                  compte de `users.groups.archive` ne peut pas le renommer.
 *   §34, §42     — NUL NE S'ACCORDE UN DROIT PAR SON PROPRE GROUPE. Un membre
 *                  détenteur de `users.groups.permissions.update` ne peut pas
 *                  toucher aux permissions de SON groupe.
 *   §24          — CONFIGURER N'EST PAS PEUPLER. `users.groups.permissions.update`
 *                  n'ouvre pas l'affectation des membres.
 *   §35 à §37    — `users.hierarchy.view` est AUTONOME : elle ouvre
 *                  l'organigramme sans ouvrir la liste des utilisateurs.
 *   §45, §51     — aucune capacité ne s'obtient par une URL tapée à la main.
 *   DEC-009      — un refus de groupe prime sur toute autorisation.
 *
 * AUCUNE DATE EN DUR : le lot n'en manipule aucune.
 *
 * Utilisation :
 *   node scripts/verify-groups.mjs [url]
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
const MARK = `RECETTE GRP ${STAMP}`

/** Lecture commune : c'est l'écran d'atterrissage, sans rapport avec le lot. */
const BASE = ['dashboard.view']

/**
 * Un profil par frontière éprouvée.
 *
 * Aucun ne cumule : c'est précisément le cumul qui masquerait un défaut. Un
 * compte qui détiendrait `.update` ET `.archive` ne dirait rien de la frontière
 * entre les deux.
 */
const PROFILES = {
  /* Le poste d'administration des accès : voit et lit, ne décide de rien. */
  lecteur: [...BASE, 'users.groups.view', 'users.users.view'],

  /*
   * LE PREMIER PROFIL CENTRAL DU LOT.
   *
   * Il renomme les groupes mais ne peut pas les DÉSACTIVER. Sans le déclencheur
   * `fn_group_write_guard`, `users.groups.archive` serait impliquée par
   * `.update` — le défaut exact que la migration 041 avait corrigé pour la
   * maintenance, et la 058 pour les projets (DEC-024).
   */
  modificateur: [...BASE, 'users.groups.view', 'users.groups.update'],

  /* La frontière inverse : il désactive et supprime, il ne renomme pas. */
  archiviste: [...BASE, 'users.groups.view', 'users.groups.archive'],

  /*
   * LE SECOND PROFIL CENTRAL.
   *
   * Il configure les permissions des groupes. Membre de l'un d'eux, il ne doit
   * pas pouvoir s'y accorder quoi que ce soit — c'est le défaut que la
   * migration 060 ferme. Il ne doit pas non plus pouvoir PEUPLER un groupe :
   * affecter quelqu'un relève de `users.users.permissions.update`.
   */
  configurateur: [...BASE, 'users.groups.view', 'users.groups.permissions.update'],

  /*
   * L'ORGANIGRAMME SEUL.
   *
   * Ni `users.users.view`, ni `users.groups.view` : exactement la dotation que
   * la migration 008 donne aux groupes « Direction » et « Assistant(e) de
   * direction ». Si la vue hiérarchique dépendait de la liste des
   * utilisateurs, ce profil verrait un organigramme vide.
   */
  organigramme: [...BASE, 'users.hierarchy.view'],

  /*
   * LE POSTE QUI ARBITRE LES DROITS D'UNE PERSONNE.
   *
   * Il sert la NON-RÉGRESSION de l'onglet « Permissions » de la fiche
   * utilisateur, réécrit par ce lot sur l'arborescence partagée : les deux
   * fiches — utilisateur et groupe — emploient désormais le même composant, et
   * seule leur SÉMANTIQUE diffère (héritage d'un côté, décision de l'autre).
   */
  gouverneur: [
    ...BASE,
    'users.users.view',
    'users.users.permissions.view',
    'users.users.permissions.update',
  ],

  /* Rien de la gouvernance : tous les écrans du lot lui sont fermés. */
  sans_acces: [...BASE],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.grp.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-grp-${STAMP}`

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
    last_name: `Grp ${key}`,
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
 * Une insertion de mise en place qui échoue doit ARRÊTER la recette.
 *
 * Un sujet à moitié construit fait échouer les contrôles suivants pour une
 * raison qui n'est pas la leur.
 */
async function insert(admin, table, row, columns = 'id') {
  const { data, error } = await admin.from(table).insert(row).select(columns).single()
  if (error) throw new Error(`${table} : ${error.message}`)
  return data
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
  const fixtures = { groups: [] }
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

  const refused = (result) => Boolean(result.error)
  /** Une écriture sans effet est un refus : RLS masque au lieu de lever. */
  const blocked = (result) => Boolean(result.error) || !result.count
  /**
   * Dit COMMENT le refus s'est produit — ou qu'il ne s'est pas produit.
   *
   * La distinction compte : une policy qui masque et un déclencheur qui lève
   * ferment la même porte, mais pas au même endroit. Un contrôle vert qui
   * afficherait « autorisé à tort » ferait douter du contrôle lui-même.
   */
  const why = (result) => {
    if (result.error) return String(result.error.message).slice(0, 60)
    if (!result.count) return 'aucune ligne modifiée'
    return '*** OPÉRATION AUTORISÉE À TORT ***'
  }

  try {
    /* --- Sujets de recette ------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, accounts, key, codes)
    }

    // Le groupe sur lequel se jouent les frontières d'écriture.
    const cible = await insert(admin, 'groups', {
      code: `RECETTE_CIBLE_${STAMP}`,
      name: `${MARK} — Groupe cible`,
      description: 'Éprouve la frontière entre modifier et désactiver.',
    })
    fixtures.groups.push(cible.id)

    // Le groupe DONT le configurateur est membre : il ne doit pas y toucher.
    const sien = await insert(admin, 'groups', {
      code: `RECETTE_SIEN_${STAMP}`,
      name: `${MARK} — Son propre groupe`,
      description: 'Éprouve l’escalade par le groupe.',
    })
    fixtures.groups.push(sien.id)

    // Un groupe vide et ordinaire, pour la suppression.
    const vide = await insert(admin, 'groups', {
      code: `RECETTE_VIDE_${STAMP}`,
      name: `${MARK} — Groupe vide`,
    })
    fixtures.groups.push(vide.id)

    const { data: permClients } = await admin
      .from('permissions')
      .select('id')
      .eq('code', 'parties.clients.view')
      .single()

    // Hiérarchie de recette : le lecteur répond de deux départements et
    // encadre l'organigramme (§36).
    const { data: departements } = await admin
      .from('departments')
      .select('id, name')
      .order('sort_order')
      .limit(2)

    /*
     * TOUTES LES LIGNES PORTENT LES MÊMES CLÉS.
     *
     * PostgREST refuse un lot dont les objets n'ont pas le même jeu de clés
     * (PGRST102) — et un refus de mise en place qui n'est pas lu fait échouer
     * plus tard un contrôle qui n'y est pour rien. La recette LÈVE donc.
     */
    const { error: rattachements } = await admin.from('user_departments').insert([
      {
        user_id: accounts.lecteur.id,
        department_id: departements[0].id,
        is_manager: true,
        is_primary: true,
      },
      {
        user_id: accounts.lecteur.id,
        department_id: departements[1].id,
        is_manager: true,
        is_primary: false,
      },
    ])
    if (rattachements) throw new Error(`rattachements : ${rattachements.message}`)

    const { error: hierarchie } = await admin
      .from('app_users')
      .update({ manager_id: accounts.lecteur.id })
      .eq('id', accounts.modificateur.id)
    if (hierarchie) throw new Error(`hiérarchie : ${hierarchie.message}`)

    const { error: appartenance } = await admin
      .from('user_groups')
      .insert({ user_id: accounts.configurateur.id, group_id: sien.id })
    if (appartenance) throw new Error(`appartenance : ${appartenance.message}`)

    console.log(`  ${DIM}3 groupes, 6 comptes, 2 départements dirigés, 1 rattachement.${RESET}`)

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — CHAQUE ÉCRAN EXIGE SA CAPACITÉ (§45, §51)\n')
    {
      const { context, page } = await signIn(browser, base, accounts.sans_acces)

      for (const [route, libelle] of [
        ['/utilisateurs/groupes', 'Liste des groupes'],
        ['/utilisateurs/groupes/nouveau', 'Nouveau groupe'],
        [`/utilisateurs/groupes/${cible.id}`, 'Fiche groupe'],
        ['/utilisateurs/hierarchie', 'Vue hiérarchique'],
      ]) {
        await page.goto(`${base}${route}`, { waitUntil: 'load' })
        check(
          page.url().includes('/acces-refuse'),
          `${libelle} : refusée sans capacité`,
          page.url().replace(base, '') || '/'
        )
      }

      // La barre latérale ne propose pas ce qu'elle ne peut pas ouvrir.
      await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      const nav = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(
        !nav.includes('Vue hiérarchique') && !nav.includes('Groupes'),
        'La barre latérale n’annonce ni Groupes ni Vue hiérarchique'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LES GROUPES SE LISTENT ET S’OUVRENT (§61.9, §61.10)\n')
    {
      const { context, page } = await signIn(browser, base, accounts.lecteur)

      await page.goto(`${base}/utilisateurs/groupes`, { waitUntil: 'load' })
      const liste = await mainText(page)
      check(liste.includes(`${MARK} — Groupe cible`), 'Le groupe figure à la liste')
      check(
        liste.includes('Membres') && liste.includes('Permissions'),
        'La liste porte les colonnes du §29',
        'membres, permissions, statut'
      )
      check(
        !liste.includes('Nouveau groupe'),
        'Sans `users.groups.create`, la création n’est pas proposée'
      )

      await page.goto(`${base}/utilisateurs/groupes/${cible.id}`, { waitUntil: 'load' })
      const fiche = await mainText(page)
      check(fiche.includes(`RECETTE_CIBLE_${STAMP}`), 'La fiche affiche le code du groupe')
      check(
        !fiche.includes('Modifier le groupe') && !fiche.includes('Désactiver le groupe'),
        'Sans `.update` ni `.archive`, aucun acte n’est proposé'
      )

      await page.goto(`${base}/utilisateurs/groupes/${cible.id}?onglet=permissions`, {
        waitUntil: 'load',
      })
      const perms = await mainText(page)
      check(
        perms.includes('Ce groupe accorde') && perms.includes('sur 170'),
        'L’onglet Permissions présente le catalogue complet',
        '170 capacités'
      )
      check(
        perms.includes('Consultation seule'),
        'Sans `users.groups.permissions.update`, l’onglet est en lecture seule'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — DÉSACTIVER N’EST PAS MODIFIER (§52, DEC-024)\n')
    {
      const modificateur = await session('modificateur')
      const archiviste = await session('archiviste')

      // 3a. Le modificateur renomme — c'est son acte.
      const renomme = await modificateur
        .from('groups')
        .update({ description: `${MARK} — description modifiée` }, { count: 'exact' })
        .eq('id', cible.id)
      check(
        !renomme.error && renomme.count === 1,
        '`users.groups.update` modifie la description',
        renomme.error?.message ?? '1 ligne'
      )

      // 3b. …mais il ne désactive pas. C'EST LE POINT DU LOT.
      const desactive = await modificateur
        .from('groups')
        .update({ is_active: false }, { count: 'exact' })
        .eq('id', cible.id)
      check(
        blocked(desactive),
        '`users.groups.update` NE désactive PAS un groupe',
        why(desactive)
      )

      // 3c. Ni ne renomme le code, qui identifie.
      const recode = await modificateur
        .from('groups')
        .update({ code: `RECETTE_RENOMME_${STAMP}` }, { count: 'exact' })
        .eq('id', cible.id)
      check(
        blocked(recode),
        'Le code d’un groupe ne se modifie pas',
        why(recode)
      )

      // 3d. Ni ne s'octroie un groupe système.
      const systeme = await modificateur
        .from('groups')
        .update({ is_system: true }, { count: 'exact' })
        .eq('id', cible.id)
      check(
        blocked(systeme),
        'Le caractère système ne s’attribue pas depuis l’application',
        why(systeme)
      )

      // 3e. L'archiviste désactive — c'est son acte.
      const eteint = await archiviste
        .from('groups')
        .update({ is_active: false }, { count: 'exact' })
        .eq('id', cible.id)
      check(
        !eteint.error && eteint.count === 1,
        '`users.groups.archive` désactive le groupe',
        eteint.error?.message ?? '1 ligne'
      )

      // 3f. …mais il ne renomme pas. La frontière vaut dans les deux sens.
      const renommeArchiviste = await archiviste
        .from('groups')
        .update({ name: `${MARK} — renommé sans droit` }, { count: 'exact' })
        .eq('id', cible.id)
      check(
        blocked(renommeArchiviste),
        '`users.groups.archive` NE renomme PAS un groupe',
        why(renommeArchiviste)
      )

      // 3g. Réactivation par l'archiviste : la frontière vaut aussi au retour.
      const rallume = await archiviste
        .from('groups')
        .update({ is_active: true }, { count: 'exact' })
        .eq('id', cible.id)
      check(!rallume.error && rallume.count === 1, 'La réactivation relève de la même capacité')

      // 3h. Ce que la base a réellement enregistré.
      const { data: apres } = await admin
        .from('groups')
        .select('name, description, code, is_active, is_system')
        .eq('id', cible.id)
        .single()
      check(
        apres.code === `RECETTE_CIBLE_${STAMP}` &&
          apres.is_system === false &&
          apres.is_active === true &&
          apres.name === `${MARK} — Groupe cible`,
        'La base n’a retenu que les écritures autorisées',
        `code ${apres.code}, système ${apres.is_system}`
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — NUL NE S’ACCORDE UN DROIT PAR SON PROPRE GROUPE (§34, §42)\n')
    {
      const configurateur = await session('configurateur')

      // 4a. Sur SON groupe : refusé, alors qu'il détient la capacité.
      const escalade = await configurateur.from('group_permissions').insert({
        group_id: sien.id,
        permission_id: permClients.id,
        effect: 'ALLOW',
      })
      check(
        refused(escalade),
        'Un membre ne modifie pas les permissions de SON groupe',
        escalade.error
          ? String(escalade.error.message).slice(0, 70)
          : '*** ESCALADE DE PRIVILÈGES ***'
      )

      // 4b. Vérification de fond : rien n'a été écrit.
      const { count: ecrit } = await admin
        .from('group_permissions')
        .select('permission_id', { count: 'exact', head: true })
        .eq('group_id', sien.id)
      check(ecrit === 0, 'Aucune règle n’a été posée sur son propre groupe', `${ecrit} règle(s)`)

      // 4c. Et il n'obtient donc pas la capacité convoitée.
      const { data: siennes } = await configurateur.rpc('my_permissions')
      check(
        !(siennes ?? []).includes('parties.clients.view'),
        'La capacité convoitée n’a pas été obtenue'
      )

      // 4d. Sur un groupe DONT IL N'EST PAS MEMBRE : autorisé. La règle ferme
      //     l'escalade, elle ne ferme pas le métier.
      const legitime = await configurateur.from('group_permissions').insert({
        group_id: cible.id,
        permission_id: permClients.id,
        effect: 'ALLOW',
      })
      check(
        !legitime.error,
        'Configurer un groupe dont on n’est pas membre reste possible',
        legitime.error?.message ?? 'règle posée'
      )

      // 4e. CONFIGURER N'EST PAS PEUPLER : il ne s'y ajoute pas non plus.
      const auto = await configurateur
        .from('user_groups')
        .insert({ user_id: accounts.configurateur.id, group_id: cible.id })
      check(
        refused(auto),
        'Nul ne s’affecte lui-même à un groupe',
        why(auto)
      )

      // 4f. …ni n'y ajoute quelqu'un d'autre : cela relève de
      //     `users.users.permissions.update`, qu'il ne détient pas.
      const tiers = await configurateur
        .from('user_groups')
        .insert({ user_id: accounts.sans_acces.id, group_id: cible.id })
      check(
        refused(tiers),
        '`users.groups.permissions.update` n’ouvre pas l’affectation des membres',
        why(tiers)
      )

      // 4g. L'écran le DIT plutôt que de laisser tenter (DEC-017).
      const { context, page } = await signIn(browser, base, accounts.configurateur)
      await page.goto(`${base}/utilisateurs/groupes/${sien.id}?onglet=permissions`, {
        waitUntil: 'load',
      })
      const texte = await mainText(page)
      check(
        texte.includes('Vous appartenez à ce groupe'),
        'L’écran nomme la raison du refus sur son propre groupe'
      )

      await page.goto(`${base}/utilisateurs/groupes/${cible.id}?onglet=permissions`, {
        waitUntil: 'load',
      })
      const autre = await mainText(page)
      check(
        !autre.includes('Vous appartenez à ce groupe') && autre.includes('Non défini'),
        'Sur un autre groupe, l’écran propose bien la modification'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — UN GROUPE TRANSMET, PUIS SE TAIT (§61.11, DEC-009)\n')
    {
      // Le groupe cible accorde `parties.clients.view` depuis 4d.
      await admin
        .from('user_groups')
        .insert({ user_id: accounts.sans_acces.id, group_id: cible.id })

      const beneficiaire = await session('sans_acces')
      const { data: avant } = await beneficiaire.rpc('my_permissions')
      check(
        (avant ?? []).includes('parties.clients.view'),
        'Le membre hérite de la permission du groupe (§61.11)'
      )

      // Désactivé, le groupe cesse d'accorder — sans rien perdre.
      await admin.from('groups').update({ is_active: false }).eq('id', cible.id)
      const { data: pendant } = await beneficiaire.rpc('my_permissions')
      check(
        !(pendant ?? []).includes('parties.clients.view'),
        'Un groupe désactivé cesse de transmettre'
      )

      await admin.from('groups').update({ is_active: true }).eq('id', cible.id)

      // Un refus de groupe prime sur une autorisation individuelle (DEC-009).
      await admin.from('user_permissions').insert({
        user_id: accounts.sans_acces.id,
        permission_id: permClients.id,
        effect: 'ALLOW',
      })
      await admin
        .from('group_permissions')
        .update({ effect: 'DENY' })
        .eq('group_id', cible.id)
        .eq('permission_id', permClients.id)

      const { data: apres } = await beneficiaire.rpc('my_permissions')
      check(
        !(apres ?? []).includes('parties.clients.view'),
        'Un refus de groupe prime sur une autorisation individuelle (DEC-009)'
      )

      await admin
        .from('user_permissions')
        .delete()
        .eq('user_id', accounts.sans_acces.id)
        .eq('permission_id', permClients.id)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — LA VUE HIÉRARCHIQUE EST AUTONOME (§35 à §37, §61.25, §61.26)\n')
    {
      const { context, page } = await signIn(browser, base, accounts.organigramme)

      // 6a. L'organigramme s'ouvre sans `users.users.view`.
      await page.goto(`${base}/utilisateurs/hierarchie`, { waitUntil: 'load' })
      check(
        !page.url().includes('/acces-refuse'),
        '`users.hierarchy.view` ouvre l’organigramme, seule'
      )

      const chart = await mainText(page)
      check(
        chart.includes('Recette Grp lecteur'),
        'L’organigramme nomme les collaborateurs (§61.25)'
      )
      check(
        chart.includes(`Responsable · ${departements[0].name}`) &&
          chart.includes(`Responsable · ${departements[1].name}`),
        'Une personne répond de deux départements, sur un seul compte (§61.26)'
      )
      check(
        chart.includes('Recette Grp modificateur'),
        'Le rattachement hiérarchique est représenté'
      )

      // 6b. …mais elle n'ouvre PAS la liste des utilisateurs (DEC-024).
      await page.goto(`${base}/utilisateurs`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'La vue hiérarchique n’ouvre pas la liste des utilisateurs'
      )

      await page.goto(`${base}/utilisateurs/groupes`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'Ni la liste des groupes')

      await context.close()

      // 6c. Par appel direct : la structure, et rien de la fiche.
      const organigramme = await session('organigramme')
      const { data: rows, error } = await organigramme.rpc('organisation_chart')
      check(!error && (rows ?? []).length > 0, 'L’appel direct rend l’organigramme')
      if (rows && rows.length > 0) {
        const colonnes = Object.keys(rows[0])
        check(
          !colonnes.some((c) =>
            ['email', 'phone', 'last_login_at', 'notes', 'username'].includes(c)
          ),
          'L’organigramme ne rend ni email, ni téléphone, ni connexion',
          colonnes.join(', ')
        )
      }

      // 6d. Les fiches, elles, restent fermées.
      const { data: fiches } = await organigramme
        .from('app_users')
        .select('id')
        .neq('id', accounts.organigramme.id)
      check(
        (fiches ?? []).length === 0,
        'Les fiches des autres restent illisibles',
        `${(fiches ?? []).length} ligne(s)`
      )

      // 6e. Sans la capacité, la fonction REFUSE — elle ne rend pas un vide.
      const aveugle = await session('sans_acces')
      const refus = await aveugle.rpc('organisation_chart')
      check(
        refused(refus),
        'Sans capacité, l’organigramme refuse au lieu de se taire',
        refus.error ? String(refus.error.message).slice(0, 60) : '*** RENDU SANS DROIT ***'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — LE DÉCOMPTE EST HONNÊTE, L’IDENTITÉ RESTE FERMÉE (§29, DEC-017)\n')
    {
      // Le configurateur voit les groupes, pas les utilisateurs.
      const configurateur = await session('configurateur')
      const { data: comptes, error } = await configurateur.rpc('groups_member_counts')
      check(!error, 'Le décompte des membres s’obtient avec `users.groups.view`')

      const ligne = (comptes ?? []).find((row) => row.group_id === cible.id)
      check(
        ligne && ligne.member_count === 1,
        'Le décompte suit la réalité',
        ligne ? `${ligne.member_count} membre(s)` : 'ligne absente'
      )

      const { context, page } = await signIn(browser, base, accounts.configurateur)
      await page.goto(`${base}/utilisateurs/groupes/${cible.id}`, { waitUntil: 'load' })
      const fiche = await mainText(page)
      check(
        fiche.includes('Membres non consultables'),
        'L’écran NOMME l’absence au lieu d’afficher un groupe vide (DEC-017)'
      )
      await context.close()

      // Sans `users.groups.view`, le décompte lui-même est refusé.
      const aveugle = await session('sans_acces')
      const refus = await aveugle.rpc('groups_member_counts')
      check(refused(refus), 'Sans `users.groups.view`, le décompte est refusé')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — LA SUPPRESSION RESTE SOUS CONTRÔLE (§52)\n')
    {
      const archiviste = await session('archiviste')
      const modificateur = await session('modificateur')

      // 8a. Sans `.archive`, on ne supprime pas.
      const sansDroit = await modificateur
        .from('groups')
        .delete({ count: 'exact' })
        .eq('id', vide.id)
      check(blocked(sansDroit), '`users.groups.update` ne supprime pas un groupe')

      // 8b. Un groupe peuplé résiste, même à `.archive`.
      const peuple = await archiviste.from('groups').delete({ count: 'exact' }).eq('id', cible.id)
      check(blocked(peuple), 'Un groupe comptant des membres ne se supprime pas', why(peuple))

      /*
       * 8c. ET LE REFUS DIT POURQUOI.
       *
       * L'archiviste ne détient pas `users.users.view` : avant la migration 062,
       * `fn_protect_group_deletion` comptait zéro membre et laissait la CLÉ
       * ÉTRANGÈRE refuser — avec un message de base de données. Une garde qui
       * compte doit compter la vérité, et le message doit rester métier
       * (CLAUDE.md §43).
       */
      check(
        Boolean(peuple.error) && /compte 1 utilisateur/.test(peuple.error.message),
        'Le refus nomme la cause métier, pas une contrainte technique',
        peuple.error ? String(peuple.error.message).slice(0, 80) : 'aucun message'
      )

      // 8c. Un groupe vide se supprime.
      const supprime = await archiviste.from('groups').delete({ count: 'exact' }).eq('id', vide.id)
      check(
        !supprime.error && supprime.count === 1,
        'Un groupe vide et ordinaire se supprime',
        supprime.error?.message ?? '1 ligne'
      )
      if (!supprime.error && supprime.count === 1) {
        fixtures.groups = fixtures.groups.filter((id) => id !== vide.id)
      }
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — NON-RÉGRESSION\n')
    {
      // Le journal d'audit a suivi la gouvernance (§54).
      const { count: traces } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'groups')
        .eq('entity_id', cible.id)
      check(typeof traces === 'number' && traces > 0, 'Les mouvements du groupe sont journalisés', `${traces} ligne(s)`)

      // Le catalogue n'a pas bougé.
      const { count: catalogue } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
      check(catalogue === 170, 'Le catalogue reste à 170 capacités', `${catalogue}`)

      // Les données DEMO sont intactes.
      const [{ count: clients }, { count: vehicules }, { count: fournisseurs }] = await Promise.all([
        admin.from('clients').select('id', { count: 'exact', head: true }),
        admin.from('vehicles').select('id', { count: 'exact', head: true }),
        admin.from('suppliers').select('id', { count: 'exact', head: true }),
      ])
      check(
        clients === 3 && vehicules === 3 && fournisseurs === 3,
        'Base DEMO intacte',
        `${clients} clients · ${vehicules} véhicules · ${fournisseurs} fournisseurs`
      )

      // Les lots précédents restent lisibles et inchangés.
      const [{ count: locations }, { count: factures }, { count: projets }] = await Promise.all([
        admin.from('rentals').select('id', { count: 'exact', head: true }),
        admin.from('customer_invoices').select('id', { count: 'exact', head: true }),
        admin.from('projects').select('id', { count: 'exact', head: true }),
      ])
      check(
        [locations, factures, projets].every((value) => typeof value === 'number'),
        'Location, facturation et projets restent lisibles',
        `${locations} locations · ${factures} factures · ${projets} projets`
      )

      /*
       * L'ONGLET « PERMISSIONS » DE LA FICHE UTILISATEUR N'A PAS RÉGRESSÉ.
       *
       * Il a été réécrit sur l'arborescence partagée introduite par ce lot : le
       * même composant sert désormais la fiche utilisateur et la fiche groupe.
       * Une refonte silencieuse serait la pire des régressions — la recette
       * éprouve donc ce que l'onglet MONTRE et ce qu'il ENREGISTRE.
       */
      const { context, page } = await signIn(browser, base, accounts.gouverneur)

      // Sans droit de lecture des permissions d'autrui, l'onglet le DIT.
      const { context: aveugle, page: pageAveugle } = await signIn(browser, base, accounts.lecteur)
      await pageAveugle.goto(`${base}/utilisateurs/${accounts.modificateur.id}?onglet=permissions`, {
        waitUntil: 'load',
      })
      check(
        (await mainText(pageAveugle)).includes('Permissions non consultables'),
        'Sans `users.users.permissions.view`, l’onglet nomme le refus (DEC-017)'
      )
      await aveugle.close()

      // Le bénéficiaire du groupe cible porte un REFUS hérité (DEC-009) : les
      // quatre états du §48 doivent rester distinguables.
      await page.goto(`${base}/utilisateurs/${accounts.sans_acces.id}?onglet=permissions`, {
        waitUntil: 'load',
      })

      /*
       * Les modules sans droit accordé s'ouvrent repliés — et le texte d'un
       * `<details>` fermé n'existe pas pour `innerText`. Les déplier D'ABORD :
       * lire avant reviendrait à conclure « absent » d'un « non affiché ».
       */
      await page.evaluate(() => {
        document.querySelectorAll('details').forEach((item) => {
          item.open = true
        })
      })

      const onglet = await mainText(page)
      check(onglet.includes('sur 170'), 'L’arborescence présente le catalogue complet')
      check(
        onglet.includes('Refusé (groupe)'),
        'Un refus hérité d’un groupe reste nommé comme tel (§48)'
      )
      check(
        onglet.includes('Non défini') && onglet.includes('Accorder') && onglet.includes('Refuser'),
        'Le sélecteur à trois positions est proposé'
      )

      // Et il ENREGISTRE : une règle individuelle posée par l'écran atteint la
      // base.
      /*
       * Le bouton radio est `sr-only` : c'est le libellé qui se clique, comme
       * un utilisateur le ferait. Viser l'input lui-même se heurterait au
       * libellé qui le recouvre — et forcer le clic éprouverait un geste que
       * personne ne fait.
       */
      await page
        .locator('label:has(input[name="perm:notifications.view"][value="ALLOW"]) span')
        .click()
      check(
        await page.isChecked('input[name="perm:notifications.view"][value="ALLOW"]'),
        'Le sélecteur retient le choix « Accorder »'
      )
      await page.getByRole('button', { name: 'Enregistrer les permissions' }).click()
      await page.waitForFunction(
        () => (document.querySelector('main')?.innerText ?? '').includes('à jour'),
        { timeout: 30000 }
      )

      const { data: posee } = await admin
        .from('user_permissions')
        .select('effect, permissions!inner ( code )')
        .eq('user_id', accounts.sans_acces.id)
      check(
        (posee ?? []).some(
          (row) => row.permissions?.code === 'notifications.view' && row.effect === 'ALLOW'
        ),
        'Une règle individuelle posée par l’écran atteint la base',
        `${(posee ?? []).length} règle(s)`
      )

      await context.close()
    }
    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — RESPONSIVE (§55, CLAUDE.md §35)\n')
    {
      /*
       * Une page peut être juste et illisible.
       *
       * Le contrôle porte sur le débordement HORIZONTAL du corps : un écran
       * qu'il faut faire glisser latéralement pour lire n'est pas responsive,
       * il est réduit. Les débordements INTERNES — un tableau dans son propre
       * conteneur `overflow-x-auto` — sont légitimes et ne sont pas comptés.
       */
      const ecrans = [
        ['/utilisateurs/groupes', 'Liste des groupes', 'lecteur'],
        [`/utilisateurs/groupes/${cible.id}`, 'Fiche groupe', 'lecteur'],
        [`/utilisateurs/groupes/${cible.id}?onglet=permissions`, 'Permissions du groupe', 'lecteur'],
        ['/utilisateurs/hierarchie', 'Vue hiérarchique', 'organigramme'],
      ]

      const formats = [
        [390, 844, 'mobile'],
        [820, 1180, 'tablette'],
        [1440, 900, 'desktop'],
      ]

      for (const [profil, comptes] of [
        ['lecteur', accounts.lecteur],
        ['organigramme', accounts.organigramme],
      ]) {
        const { context, page } = await signIn(browser, base, comptes)

        for (const [route, libelle, requis] of ecrans) {
          if (requis !== profil) continue

          for (const [width, height, format] of formats) {
            await page.setViewportSize({ width, height })
            await page.goto(`${base}${route}`, { waitUntil: 'load' })

            const debordement = await page.evaluate(
              () =>
                document.documentElement.scrollWidth - document.documentElement.clientWidth
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
        if (profil === 'lecteur') {
          await page.setViewportSize({ width: 390, height: 844 })
          await page.goto(`${base}/utilisateurs/groupes`, { waitUntil: 'load' })
          const tableau = await page.locator('main table').count()
          const visible = tableau > 0 ? await page.locator('main table').first().isVisible() : false
          check(!visible, 'Liste des groupes · mobile : le tableau cède la place aux cartes')
          check(
            (await mainText(page)).includes(`${MARK} — Groupe cible`),
            'Liste des groupes · mobile : le groupe reste lisible'
          )
        }

        await context.close()
      }
    }
  } finally {
    await browser.close()
    for (const client of Object.values(sessions)) await client.auth.signOut()

    /*
     * NETTOYAGE — dans l'ordre des dépendances.
     *
     * `groups` refuse la suppression tant qu'il reste un membre
     * (`fn_protect_group_deletion`) : les appartenances partent d'abord.
     */
    for (const id of fixtures.groups) {
      await admin.from('group_permissions').delete().eq('group_id', id)
      await admin.from('user_groups').delete().eq('group_id', id)
      await admin.from('groups').delete().eq('id', id)
    }
    await admin.from('groups').delete().ilike('name', `%${MARK}%`)

    for (const account of Object.values(accounts)) {
      await admin.from('user_departments').delete().eq('user_id', account.id)
      await admin.from('user_groups').delete().eq('user_id', account.id)
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      // Un compte peut avoir été désigné responsable d'un autre : le lien doit
      // partir avant la fiche, sinon la suppression est retenue.
      await admin.from('app_users').update({ manager_id: null }).eq('manager_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    /*
     * BALAYAGE PAR MARQUEUR — le nettoyage par identifiants suivis ne suffit pas.
     *
     * Un `delete` refusé ne lève rien avec PostgREST : la boucle l'ignorerait.
     * Le balayage compte donc ce qui subsiste et le DIT — une recette silencieuse
     * sur ses résidus n'est pas une recette propre.
     */
    const leftovers = []

    const { count: strayGroups } = await admin
      .from('groups')
      .select('id', { count: 'exact', head: true })
      .ilike('name', `%${MARK}%`)
    if (strayGroups) leftovers.push(`groups : ${strayGroups}`)

    const { count: strayCodes } = await admin
      .from('groups')
      .select('id', { count: 'exact', head: true })
      .like('code', `RECETTE_%_${STAMP}`)
    if (strayCodes) leftovers.push(`groups (code) : ${strayCodes}`)

    const { count: strayUsers } = await admin
      .from('app_users')
      .select('id', { count: 'exact', head: true })
      .like('username', `recette.grp.%.${STAMP}`)
    if (strayUsers) leftovers.push(`app_users : ${strayUsers}`)

    if (leftovers.length > 0) {
      failed += 1
      console.log(`\n${RED}Résidus de recette non supprimés — ${leftovers.join(', ')}${RESET}`)
    } else {
      console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE GROUPES & HIÉRARCHIE : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE GROUPES & HIÉRARCHIE : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
