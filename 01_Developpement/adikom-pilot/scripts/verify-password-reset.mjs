#!/usr/bin/env node
/**
 * Recette Réinitialisation du mot de passe — LOT 19, DEC-046.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:password-reset` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL contrôle la structure, les policies et les gardes avec le rôle
 * de service : elle prouve que la base refuse ce qu'elle doit refuser. Elle ne
 * peut pas prouver que LE PARCOURS FONCTIONNE — qu'un collaborateur se connecte
 * réellement avec le mot de passe temporaire remis, qu'il est réellement
 * détourné vers l'écran de changement, et que son ancien temporaire cesse
 * réellement d'être valable.
 *
 * C'est ce que celle-ci fait, de bout en bout, avec de vraies sessions :
 *
 *   1. Le porteur de `users.users.password.reset` voit l'encart sur la FICHE, et
 *      la liste porte le badge « Mot de passe temporaire ».
 *   2. Le VOISIN — `users.users.update` sans la capacité — ne voit pas l'encart,
 *      et l'appel direct au RPC lui est refusé (DEC-024).
 *   3. LE PARCOURS COMPLET : réinitialisation à l'écran → le temporaire est
 *      affiché et copiable → connexion avec lui → détournement obligatoire →
 *      choix du mot de passe définitif → tableau de bord.
 *   4. L'ANCIEN TEMPORAIRE NE FONCTIONNE PLUS ; le nouveau fonctionne.
 *   5. Le porteur de la seule capacité de réinitialisation ne modifie AUCUNE
 *      autre colonne, par appel direct.
 *   6. Nul ne réinitialise son propre compte par cette voie.
 *   7. Un compte ARCHIVED est refusé.
 *   8. LE SUPER ADMIN D'ADIKOM est hors de portée — éprouvé sur le vrai compte,
 *      et l'indicateur est relu ensuite pour s'en assurer.
 *   9. Le journal dit qui, sur qui, quand — et AUCUN mot de passe n'y figure.
 *  10. Aucun résidu, catalogue conforme au code déclaré.
 *
 * Utilisation :
 *   node scripts/verify-password-reset.mjs [url]
 *
 * NE JAMAIS piper la sortie vers `head` : SIGPIPE tuerait le processus avant
 * son nettoyage, et laisserait des comptes de recette en base.
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required } from './lib/env.mjs'
import { checkCatalogue } from './lib/capabilities.mjs'

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

const BASE = ['dashboard.view']

const PROFILES = {
  /*
   * L'ACTEUR LÉGITIME. `users.users.view` l'accompagne parce qu'un `UPDATE` sous
   * RLS lit les lignes qu'il vise : sans elle, l'écriture ne modifierait rien et
   * ne dirait rien.
   */
  op: [...BASE, 'users.users.view', 'users.users.password.reset'],

  /*
   * LE VOISIN, ET LE CŒUR DU LOT. Il modifie les fiches — nom, email, fonction —
   * et ne doit PAS pouvoir rendre un accès (DEC-024). Un profil qui cumulerait
   * les deux capacités ne prouverait rien.
   */
  maj: [...BASE, 'users.users.view', 'users.users.update'],

  /* Le collaborateur dont on réinitialise le mot de passe. */
  cible: [...BASE],

  /* Le compte archivé : on le réactive avant de rendre un accès. */
  archive: [...BASE],
}

async function createProfile(admin, accounts, key, codes, status = 'ACTIVE') {
  const username = `recette.pwd.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-pwd-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${key} : ${error?.message}`)

  // Inscrit AVANT le profil : un échec ultérieur ne rend plus ce compte
  // invisible au nettoyage.
  const id = created.user.id
  accounts[key] = { id, email, password, username }

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Pwd ${key}`,
    username,
    email,
    status,
    ...(status === 'ACTIVE' ? {} : { deactivated_at: new Date().toISOString() }),
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
  // Le libellé, plutôt que `button[type=submit]` : la page en porte plusieurs
  // (œil, bascules), et le premier n'est pas toujours celui qui soumet.
  await page.getByRole('button', { name: /Se connecter/i }).click()

  return { context, page }
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
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

  /** Le mot de passe temporaire lu à l'écran — jamais renvoyé par le serveur. */
  let temporaire = null
  let definitif = null

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

  const refused = (result) => Boolean(result.error) || !result.count
  const why = (result) => {
    if (result.error) return String(result.error.message).slice(0, 70)
    if (!result.count) return 'aucune ligne modifiée'
    return '*** OPÉRATION AUTORISÉE À TORT ***'
  }

  try {
    /* --- Sujets de recette ------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    for (const [key, codes] of Object.entries(PROFILES)) {
      await createProfile(admin, accounts, key, codes, key === 'archive' ? 'ARCHIVED' : 'ACTIVE')
    }
    check(Object.keys(accounts).length === 4, 'Quatre comptes de recette créés')

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — L’ACTE VIT SUR LA FICHE, L’INFORMATION SUR LA LISTE\n')

    {
      const { context, page } = await signIn(browser, base, accounts.op)
      await page.waitForURL('**/tableau-de-bord', { timeout: 60000 })

      await page.goto(`${base}/utilisateurs/${accounts.cible.id}`, { waitUntil: 'load' })
      const fiche = await mainText(page)

      check(fiche.includes('Accès & sécurité'), 'L’encart « Accès & sécurité » est présent')
      check(
        fiche.includes('Réinitialiser le mot de passe'),
        'L’action est proposée sur la fiche'
      )
      check(
        fiche.includes('n’est jamais consultable'),
        'L’écran dit que le mot de passe actuel n’est pas consultable'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LE VOISIN : MODIFIER N’EST PAS RÉINITIALISER (DEC-024)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.maj)
      await page.waitForURL('**/tableau-de-bord', { timeout: 60000 })

      await page.goto(`${base}/utilisateurs/${accounts.cible.id}`, { waitUntil: 'load' })
      const fiche = await mainText(page)

      check(
        fiche.includes('Modifier'),
        'Le porteur de `users.users.update` peut toujours modifier la fiche'
      )
      check(
        !fiche.includes('Réinitialiser le mot de passe'),
        'Il ne voit AUCUNE action de réinitialisation'
      )

      await context.close()

      // L'ÉCRAN N'EST PAS LA PROTECTION : l'appel direct doit être refusé aussi.
      const voisin = await session('maj')
      const rpc = await voisin.rpc('require_password_reset', {
        p_user_id: accounts.cible.id,
      })
      check(
        Boolean(rpc.error),
        'L’appel direct au RPC lui est refusé',
        rpc.error ? String(rpc.error.message).slice(0, 70) : '*** AUTORISÉ À TORT ***'
      )

      const patch = await voisin
        .from('app_users')
        .update({ must_change_password: true }, { count: 'exact' })
        .eq('id', accounts.cible.id)
      check(
        refused(patch),
        'Le PATCH direct qui lèverait l’indicateur lui est refusé',
        why(patch)
      )

      const { data: apres } = await admin
        .from('app_users')
        .select('must_change_password')
        .eq('id', accounts.cible.id)
        .single()
      check(
        apres?.must_change_password === false,
        'L’indicateur du collaborateur n’a pas bougé'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — LE PARCOURS COMPLET, À L’ÉCRAN\n')

    {
      const { context, page } = await signIn(browser, base, accounts.op)
      await page.waitForURL('**/tableau-de-bord', { timeout: 60000 })

      await page.goto(`${base}/utilisateurs/${accounts.cible.id}`, { waitUntil: 'load' })

      // 1. Le bouton ouvre une confirmation qui NOMME la personne.
      await page
        .getByRole('button', { name: 'Réinitialiser le mot de passe' })
        .first()
        .click()

      const confirmation = await mainText(page)
      check(
        confirmation.includes(`Recette Pwd cible`) &&
          confirmation.includes(accounts.cible.username),
        'La confirmation nomme la personne et son identifiant'
      )
      check(
        confirmation.includes('cessera d’être valable'),
        'La confirmation annonce la perte du mot de passe actuel'
      )

      // 2. L'acte. Le repère est le champ du temporaire, qui n'existe qu'après.
      await page
        .getByRole('button', { name: 'Réinitialiser le mot de passe' })
        .last()
        .click()

      const champ = page.locator('#temporary-password')
      await champ.waitFor({ state: 'visible', timeout: 90000 })

      temporaire = await champ.inputValue()
      check(
        typeof temporaire === 'string' && temporaire.length >= 8,
        'Le mot de passe temporaire est affiché',
        `${temporaire.length} caractères`
      )

      const apres = await mainText(page)
      check(
        apres.includes('Ce mot de passe est temporaire'),
        'L’écran dit que le mot de passe est temporaire'
      )
      check(
        apres.includes('devra définir son propre mot de passe'),
        'L’écran annonce le changement obligatoire à la prochaine connexion'
      )
      check(apres.includes('Copier'), 'Le mot de passe est copiable')

      // 3. Masqué par défaut, affichable sur demande : le geste est contrôlé.
      check(
        (await champ.getAttribute('type')) === 'password',
        'Le temporaire est masqué par défaut'
      )
      await page.getByRole('button', { name: 'Afficher le mot de passe' }).click()
      check(
        (await champ.getAttribute('type')) === 'text',
        'L’œil le révèle à la demande'
      )

      // 4. Le badge apparaît sur la liste — l'information, pas l'acte.
      await page.goto(`${base}/utilisateurs?q=${accounts.cible.username}`, {
        waitUntil: 'load',
      })
      const liste = await mainText(page)
      check(
        liste.includes('Mot de passe temporaire'),
        'La liste porte le badge « Mot de passe temporaire »'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LE COLLABORATEUR SE CONNECTE, ET DOIT CHOISIR LE SIEN\n')

    {
      const { data: flag } = await admin
        .from('app_users')
        .select('must_change_password')
        .eq('id', accounts.cible.id)
        .single()
      check(
        flag?.must_change_password === true,
        'L’indicateur de changement obligatoire est levé en base'
      )

      const context = await browser.newContext()
      const page = await context.newPage()

      await page.goto(`${base}/connexion`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#username') !== null)
      await page.fill('#username', accounts.cible.username)
      await page.fill('#password', temporaire)
      await page.getByRole('button', { name: /Se connecter/i }).click()

      await page.waitForURL('**/changer-mot-de-passe', { timeout: 90000 })
      check(true, 'La connexion avec le temporaire réussit')
      check(
        page.url().includes('/changer-mot-de-passe'),
        'Le collaborateur est détourné vers l’écran de changement'
      )

      // AUCUNE FONCTIONNALITÉ MÉTIER N'EST ACCESSIBLE AVANT LE CHANGEMENT.
      await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      check(
        page.url().includes('/changer-mot-de-passe'),
        'Le tableau de bord reste fermé tant que le temporaire n’est pas remplacé'
      )

      definitif = `Adikom-recette-${STAMP}!`
      await page.fill('#password', definitif)
      await page.fill('#confirmation', definitif)
      await page.getByRole('button', { name: /Enregistrer|Valider|Définir/i }).first().click()

      await page.waitForURL('**/tableau-de-bord', { timeout: 90000 })
      check(true, 'Le mot de passe définitif est accepté, et le SaaS s’ouvre')

      await context.close()

      const { data: leve } = await admin
        .from('app_users')
        .select('must_change_password')
        .eq('id', accounts.cible.id)
        .single()
      check(
        leve?.must_change_password === false,
        'L’indicateur est levé une fois le mot de passe personnel défini'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — L’ANCIEN TEMPORAIRE NE FONCTIONNE PLUS\n')

    {
      const essai = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const ancien = await essai.auth.signInWithPassword({
        email: accounts.cible.email,
        password: temporaire,
      })
      check(
        Boolean(ancien.error),
        'Le mot de passe temporaire est devenu invalide',
        ancien.error ? String(ancien.error.message).slice(0, 60) : '*** ENCORE VALABLE ***'
      )

      const nouveau = await essai.auth.signInWithPassword({
        email: accounts.cible.email,
        password: definitif,
      })
      check(!nouveau.error, 'Le mot de passe choisi par le collaborateur fonctionne')
      await essai.auth.signOut()

      // L'ADMINISTRATEUR NE CONNAÎT PAS LE MOT DE PASSE DÉFINITIF : aucune
      // surface applicative ne le rend, et aucune colonne ne le porte.
      const { data: fiche } = await admin
        .from('app_users')
        .select('*')
        .eq('id', accounts.cible.id)
        .single()
      const porteurs = Object.keys(fiche ?? {}).filter((column) =>
        /password/i.test(column) && column !== 'must_change_password'
      )
      check(
        porteurs.length === 0,
        'Aucune colonne de la fiche ne porte un mot de passe',
        porteurs.join(', ') || 'aucune'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — LA RÉINITIALISATION NE MODIFIE RIEN D’AUTRE\n')

    {
      const op = await session('op')

      /*
       * RLS EST ROW-LEVEL : la policy dédiée ouvre la LIGNE. Sans le
       * déclencheur, elle ouvrirait donc le nom, l'email, le statut et le rôle
       * Super Admin. Chaque colonne est tentée séparément, par appel direct.
       */
      const tentatives = {
        first_name: 'DÉTOURNÉ',
        last_name: 'DÉTOURNÉ',
        email: `detourne.${STAMP}@adikom.test`,
        phone: '+269 000 0000',
        job_title: 'DÉTOURNÉ',
        status: 'SUSPENDED',
        is_super_admin: true,
        notes: 'DÉTOURNÉ',
      }

      const passees = []
      for (const [column, value] of Object.entries(tentatives)) {
        const result = await op
          .from('app_users')
          .update({ [column]: value }, { count: 'exact' })
          .eq('id', accounts.cible.id)
        if (!refused(result)) passees.push(column)
      }

      check(
        passees.length === 0,
        'Huit colonnes tentées par appel direct, toutes refusées',
        passees.length > 0 ? `*** PASSÉES : ${passees.join(', ')} ***` : '8 refus'
      )

      // Et la fiche est intacte : un refus qui laisserait passer une valeur ne
      // serait pas un refus.
      const { data: fiche } = await admin
        .from('app_users')
        .select('first_name, email, status, is_super_admin, job_title')
        .eq('id', accounts.cible.id)
        .single()
      check(
        fiche?.first_name === 'Recette' &&
          fiche?.email === accounts.cible.email &&
          fiche?.status === 'ACTIVE' &&
          fiche?.is_super_admin === false,
        'La fiche du collaborateur est inchangée'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — LES TROIS REFUS, PAR APPEL DIRECT\n')

    {
      const op = await session('op')

      // a. Son propre compte : l'écran de changement existe pour cela.
      const soi = await op.rpc('require_password_reset', { p_user_id: accounts.op.id })
      check(
        Boolean(soi.error),
        'Nul ne réinitialise son propre mot de passe par cette voie',
        soi.error ? String(soi.error.message).slice(0, 70) : '*** AUTORISÉ À TORT ***'
      )

      // b. Un compte archivé : on le réactive d'abord.
      const arch = await op.rpc('require_password_reset', { p_user_id: accounts.archive.id })
      check(
        Boolean(arch.error),
        'Un compte archivé ne se réinitialise pas',
        arch.error ? String(arch.error.message).slice(0, 70) : '*** AUTORISÉ À TORT ***'
      )

      /*
       * c. LE SUPER ADMIN D'ADIKOM — le refus le plus important du lot.
       *
       * Sans lui, la capacité devient un chemin de prise de contrôle : qui
       * réinitialise le mot de passe du Super Admin se connecte à sa place.
       *
       * Le contrôle porte sur le VRAI compte, parce que c'est lui qu'il protège.
       * L'indicateur est relu ensuite, et remis à faux s'il avait bougé : une
       * recette ne doit jamais laisser le Super Admin d'ADIKOM enfermé dans
       * l'écran de changement.
       */
      const { data: patron } = await admin
        .from('app_users')
        .select('id, must_change_password')
        .eq('is_super_admin', true)
        .eq('status', 'ACTIVE')
        .limit(1)
        .single()

      if (!patron) {
        check(false, 'Le Super Admin d’ADIKOM est introuvable')
      } else {
        const tentative = await op.rpc('require_password_reset', { p_user_id: patron.id })
        check(
          Boolean(tentative.error),
          'Un non-Super-Admin ne réinitialise pas le mot de passe du Super Admin',
          tentative.error
            ? String(tentative.error.message).slice(0, 70)
            : '*** AUTORISÉ À TORT ***'
        )

        const { data: apres } = await admin
          .from('app_users')
          .select('must_change_password')
          .eq('id', patron.id)
          .single()
        check(
          apres?.must_change_password === patron.must_change_password,
          'L’indicateur du Super Admin n’a pas bougé'
        )
        if (apres?.must_change_password !== patron.must_change_password) {
          await admin
            .from('app_users')
            .update({ must_change_password: patron.must_change_password })
            .eq('id', patron.id)
        }
      }
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — LE JOURNAL DIT QUI, SUR QUI, QUAND — ET RIEN DE PLUS\n')

    {
      /*
       * UNE LECTURE QUI ÉCHOUE N'EST PAS UN JOURNAL VIDE.
       *
       * L'erreur est nommée plutôt qu'assimilée à une absence : sans cela, une
       * colonne mal orthographiée se lit « la réinitialisation n'est pas
       * journalisée », et l'on part corriger un défaut qui n'existe pas. C'est
       * arrivé pendant l'écriture de cette recette — `created_at` au lieu
       * d'`occurred_at`.
       */
      const journal = await admin
        .from('audit_log')
        .select(
          'actor_id, actor_label, action, entity_type, entity_id, reason, before_data, after_data, occurred_at'
        )
        .eq('entity_type', 'app_users')
        .eq('entity_id', accounts.cible.id)
        .order('occurred_at', { ascending: false })
        .limit(20)

      if (journal.error) {
        check(false, 'Le journal est lisible', String(journal.error.message).slice(0, 80))
      }

      const reinit = (journal.data ?? []).filter((row) =>
        /Réinitialisation du mot de passe/i.test(row.reason ?? '')
      )

      check(reinit.length > 0, 'La réinitialisation est journalisée', `${reinit.length} entrée(s)`)
      check(
        reinit.length > 0 && reinit.every((row) => row.actor_id === accounts.op.id),
        'Le journal nomme l’administrateur qui l’a demandée',
        reinit.map((row) => row.actor_label).join(', ')
      )
      check(
        reinit.length > 0 && reinit.every((row) => row.entity_id === accounts.cible.id),
        'Le journal nomme l’utilisateur concerné'
      )
      check(
        reinit.length > 0 && reinit.every((row) => Boolean(row.occurred_at)),
        'Le journal porte la date et l’heure',
        reinit[0]?.occurred_at ?? ''
      )

      /*
       * AUCUN MOT DE PASSE NULLE PART.
       *
       * Le temporaire est connu de cette recette : elle peut donc le chercher
       * littéralement dans TOUT le journal, ce qu'aucun contrôle en base ne peut
       * faire. Le mot de passe définitif est cherché de la même façon.
       */
      const tout = await admin
        .from('audit_log')
        .select('reason, comment, before_data, after_data')
        .eq('entity_type', 'app_users')
        .order('occurred_at', { ascending: false })
        .limit(400)

      // Un balayage qui n'a rien lu ne prouve rien : l'échec est nommé.
      check(
        !tout.error && (tout.data ?? []).length > 0,
        'Le journal des comptes est lisible pour y chercher une fuite',
        tout.error ? String(tout.error.message).slice(0, 60) : `${tout.data?.length} entrée(s)`
      )

      const serialise = JSON.stringify(tout.data ?? [])
      check(
        !serialise.includes(temporaire),
        'Le mot de passe temporaire n’apparaît nulle part au journal'
      )
      check(
        !serialise.includes(definitif),
        'Le mot de passe définitif n’apparaît nulle part au journal'
      )
      check(
        !/\$2[aby]\$/.test(serialise),
        'Aucune empreinte de mot de passe n’apparaît au journal'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — AUCUN EFFET DE BORD\n')

    {
      await checkCatalogue(admin, check)

      const { count: inventees } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
        .like('code', 'users.users.password.%')
      check(
        inventees === 1,
        'Une seule capacité de mot de passe, pas une de plus',
        String(inventees)
      )
    }
  } finally {
    await browser.close()
    for (const client of Object.values(sessions)) await client.auth.signOut()

    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('NETTOYAGE\n')

    const leftovers = []

    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('user_departments').delete().eq('user_id', account.id)
      await admin.from('user_groups').delete().eq('user_id', account.id)
      await admin.from('app_users').update({ manager_id: null }).eq('manager_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    /*
     * LE BALAYAGE PAR MARQUEUR, ET NON PAR IDENTIFIANT SUIVI.
     *
     * Un passage interrompu laisse des comptes que `accounts` ne connaît pas :
     * ils seraient invisibles à un nettoyage qui ne viserait que les identifiants
     * retenus. Le motif retrouve TOUS les comptes de cette recette, y compris
     * ceux d'un passage précédent qui n'a pas pu se terminer.
     */
    const { data: strays } = await admin
      .from('app_users')
      .select('id, username')
      .like('username', 'recette.pwd.%')

    for (const stray of strays ?? []) {
      await admin.from('user_permissions').delete().eq('user_id', stray.id)
      await admin.from('app_users').delete().eq('id', stray.id)
      await admin.auth.admin.deleteUser(stray.id)
      console.log(`${DIM}Résidu d’un passage antérieur supprimé : ${stray.username}${RESET}`)
    }

    const { count: restants } = await admin
      .from('app_users')
      .select('id', { count: 'exact', head: true })
      .like('username', 'recette.pwd.%')
    if (restants) leftovers.push(`app_users : ${restants}`)

    if (leftovers.length > 0) {
      failed += 1
      console.log(`\n${RED}Résidus de recette non supprimés — ${leftovers.join(' · ')}${RESET}`)
    } else {
      console.log(`${DIM}Comptes de recette supprimés. Données DEMO intactes.${RESET}`)
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE RÉINITIALISATION : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE RÉINITIALISATION : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
