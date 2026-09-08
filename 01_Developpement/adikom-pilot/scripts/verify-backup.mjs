#!/usr/bin/env node
/**
 * Recette Sauvegarde / Réinitialisation / Restauration — LOT 18.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:backup` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL contrôle le schéma et les règles avec le rôle de service, pour
 * lequel `current_actor()` vaut NULL : aucun statut n'y est vérifié. Celle-ci
 * ouvre de VRAIES sessions et éprouve ce que chaque profil peut atteindre —
 * par l'écran, par la route de téléchargement ET par appel direct à l'API,
 * sans passer par aucun bouton.
 *
 * LA FRONTIÈRE CENTRALE DU LOT
 *
 * Ces trois opérations ne sont gouvernées par AUCUNE permission (DEC-041) :
 * elles suivent le statut de Super Admin. Le profil éprouvé ici détient donc
 * TOUTES les capacités du module Paramètres — entreprise, administratif,
 * banque, identité visuelle, numérotation — et ne doit malgré tout rien
 * pouvoir faire. C'est ce cumul qui rend le contrôle probant : un profil
 * démuni aurait été refusé pour de mauvaises raisons.
 *
 * ELLE RÉINITIALISE ET RESTAURE POUR DE VRAI
 *
 * Sur la base réelle, et depuis l'interface. La sauvegarde est téléchargée
 * AVANT, et c'est elle qui est restaurée : l'état final est identique à l'état
 * initial, table par table, et la recette le VÉRIFIE. Si elle s'interrompt
 * entre les deux, le fichier reste écrit sur le disque et `npm run demo:seed`
 * reconstruit le jeu de démonstration.
 *
 * UN SUPER ADMIN TEMPORAIRE, JAMAIS CELUI D'ADIKOM
 *
 * Les identifiants du Super Admin ne figurent nulle part dans le code (CLAUDE.md
 * §25) : la recette crée donc son PROPRE compte de statut Super Admin, avec un
 * mot de passe aléatoire jamais affiché, et le supprime quoi qu'il arrive. Le
 * compte réel d'ADIKOM n'est ni lu, ni modifié, ni utilisé — et la recette
 * vérifie à la fin qu'il est toujours là, actif.
 *
 * Utilisation :
 *   node scripts/verify-backup.mjs [url]
 */

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

/**
 * Le profil le plus doté que le module Paramètres puisse produire.
 * Il détient tout, sauf le statut — et c'est le statut qui compte.
 */
const SETTINGS_MAX = [
  'dashboard.view',
  'settings.company.view',
  'settings.company.update',
  'settings.company.administrative.view',
  'settings.company.administrative.update',
  'settings.company.bank.view',
  'settings.company.bank.update',
  'settings.branding.update',
  'settings.numbering.view',
  'settings.numbering.update',
]

async function createAccount(admin, { key, codes, superAdmin }) {
  const username = `recette.sauv.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-sauv-${STAMP}-${crypto.randomUUID().slice(0, 8)}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${key} : ${error?.message}`)

  const id = created.user.id

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Sauvegarde ${key}`,
    username,
    email,
    status: 'ACTIVE',
    is_super_admin: Boolean(superAdmin),
  })
  if (profileError) throw new Error(`profil ${key} : ${profileError.message}`)

  if (codes?.length) {
    const { data: catalog } = await admin.from('permissions').select('id, code').in('code', codes)
    if ((catalog ?? []).length !== codes.length) {
      const found = new Set((catalog ?? []).map((p) => p.code))
      throw new Error(`catalogue incomplet : ${codes.filter((c) => !found.has(c)).join(', ')}`)
    }
    const { error: grantError } = await admin
      .from('user_permissions')
      .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' })))
    if (grantError) throw new Error(`permissions ${key} : ${grantError.message}`)
  }

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
  await page.waitForURL('**/tableau-de-bord', { timeout: 60000 })

  return { context, page }
}

const flat = (text) => text.replace(/\s+/g, ' ')

async function mainText(page) {
  return flat(await page.locator('main').innerText())
}

/** Compte les lignes de chaque table du périmètre, pour comparer avant/après. */
async function countScope(admin, scope) {
  const counts = {}
  for (const table of scope) {
    const { count, error } = await admin
      .from(table)
      .select('*', { count: 'exact', head: true })
    if (error) throw new Error(`comptage ${table} : ${error.message}`)
    counts[table] = count ?? 0
  }
  return counts
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

  /*
   * LA RECETTE REFUSE DE DÉMARRER SUR UN DÉGÂT LAISSÉ PAR LE PASSAGE PRÉCÉDENT.
   *
   * Un passage interrompu peut laisser un compte de statut Super Admin derrière
   * lui. Le suivant s'exécuterait très bien, et conclurait « le Super Admin est
   * protégé » alors que le SaaS en compte un de trop.
   */
  const { data: residus } = await admin
    .from('app_users')
    .select('id, username')
    .like('username', 'recette.sauv.%')

  if ((residus ?? []).length > 0) {
    throw new Error(
      `Comptes de recette laissés par un passage précédent : ${residus
        .map((u) => u.username)
        .join(', ')}. Les supprimer avant de relancer.`
    )
  }

  const { data: scopeData, error: scopeError } = await admin.rpc('backup_scope')
  if (scopeError) throw new Error(`périmètre : ${scopeError.message}`)
  const scope = scopeData

  const accounts = {}
  const contexts = []
  const browser = await chromium.launch()
  let backupFile = null

  try {
    section('SUJETS')

    accounts.parametres = await createAccount(admin, {
      key: 'parametres',
      codes: SETTINGS_MAX,
    })
    console.log(
      `  ${DIM}parametres${RESET}  ${accounts.parametres.username} — toutes les capacités Paramètres, aucun statut`
    )

    accounts.super = await createAccount(admin, { key: 'super', superAdmin: true })
    console.log(
      `  ${DIM}super${RESET}       ${accounts.super.username} — statut Super Admin, temporaire`
    )

    // L'état de référence, avant toute opération destructrice.
    const before = await countScope(admin, scope)
    const beforeTotal = Object.values(before).reduce((a, b) => a + b, 0)
    console.log(`  ${DIM}état initial${RESET} ${beforeTotal} ligne(s) métier réparties sur ${scope.length} tables`)

    const { count: usersBefore } = await admin
      .from('app_users')
      .select('*', { count: 'exact', head: true })

    /* ================================================================== */
    section('1. UN PROFIL SANS STATUT — L’ÉCRAN')

    const parametres = await signIn(browser, base, accounts.parametres)
    contexts.push(parametres.context)

    await parametres.page.goto(`${base}/parametres`, { waitUntil: 'load' })
    const tabs = flat(await parametres.page.locator('nav[aria-label="Sections des paramètres"]').innerText())

    check(tabs.includes('Entreprise'), 'L’onglet Entreprise lui est ouvert', tabs)
    check(tabs.includes('Numérotation'), 'L’onglet Numérotation lui est ouvert')
    check(
      !tabs.includes('Sauvegarde'),
      'L’onglet Sauvegarde ne lui est PAS annoncé',
      tabs.includes('Sauvegarde') ? '*** ONGLET VISIBLE À TORT ***' : ''
    )

    await parametres.page.goto(`${base}/parametres?onglet=sauvegarde`, { waitUntil: 'load' })
    const refus = await mainText(parametres.page)

    check(
      refus.includes('réservée au Super Admin'),
      'L’accès direct par URL est refusé, et le refus est NOMMÉ',
      refus.slice(0, 90)
    )
    check(
      !refus.includes('Télécharger la sauvegarde'),
      'Aucun bouton de téléchargement ne lui est rendu'
    )
    check(
      !refus.includes('Réinitialiser le SaaS'),
      'Aucun formulaire de réinitialisation ne lui est rendu'
    )

    /* ================================================================== */
    section('2. UN PROFIL SANS STATUT — LES APPELS DIRECTS')

    const download = await parametres.page.request.get(`${base}/api/sauvegarde`)
    check(
      download.status() === 403,
      'GET /api/sauvegarde refusé (403), sans passer par aucun bouton',
      `statut ${download.status()}`
    )

    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: signInError } = await client.auth.signInWithPassword({
      email: accounts.parametres.email,
      password: accounts.parametres.password,
    })
    if (signInError) throw new Error(`session directe : ${signInError.message}`)

    for (const [fn, args] of [
      ['admin_backup_export', { p_actor_id: accounts.parametres.id }],
      ['admin_reset_business_data', { p_actor_id: accounts.parametres.id, p_confirmation: 'REINITIALISER' }],
      ['admin_restore_backup', { p_actor_id: accounts.parametres.id, p_payload: {} }],
      ['backup_scope', {}],
    ]) {
      const { error } = await client.rpc(fn, args)
      check(Boolean(error), `RPC ${fn} refusée à un jeton d’utilisateur`, error?.message?.slice(0, 60) ?? '*** AUTORISÉE À TORT ***')
    }

    /*
     * L'USURPATION D'IDENTITÉ, ÉPROUVÉE PLUTÔT QUE SUPPOSÉE.
     *
     * Les fonctions prennent l'identifiant de l'auteur EN PARAMÈTRE. Si
     * l'`EXECUTE` n'était pas retiré, il suffirait d'y écrire l'identifiant du
     * Super Admin pour passer. C'est précisément ce qui est tenté ici.
     */
    const { error: usurpation } = await client.rpc('admin_reset_business_data', {
      p_actor_id: accounts.super.id,
      p_confirmation: 'REINITIALISER',
    })
    check(
      Boolean(usurpation),
      'Se déclarer Super Admin dans l’appel ne suffit pas : la fonction reste inatteignable',
      usurpation?.message?.slice(0, 60) ?? '*** RÉINITIALISATION AUTORISÉE ***'
    )

    /* ================================================================== */
    section('3. SANS SESSION')

    const anonymous = await browser.newContext()
    contexts.push(anonymous)
    const anonPage = await anonymous.newPage()
    const anonDownload = await anonPage.request.get(`${base}/api/sauvegarde`, {
      maxRedirects: 0,
    })
    check(
      anonDownload.status() === 401 || anonDownload.status() >= 300,
      'GET /api/sauvegarde sans session ne délivre aucun fichier',
      `statut ${anonDownload.status()}`
    )

    /* ================================================================== */
    section('4. LE SUPER ADMIN — TÉLÉCHARGEMENT')

    const superAdmin = await signIn(browser, base, accounts.super)
    contexts.push(superAdmin.context)

    await superAdmin.page.goto(`${base}/parametres`, { waitUntil: 'load' })
    const superTabs = flat(
      await superAdmin.page.locator('nav[aria-label="Sections des paramètres"]').innerText()
    )
    check(superTabs.includes('Sauvegarde'), 'L’onglet Sauvegarde lui est ouvert', superTabs)

    await superAdmin.page.goto(`${base}/parametres?onglet=sauvegarde`, { waitUntil: 'load' })
    const panel = await mainText(superAdmin.page)
    check(panel.includes('Télécharger la sauvegarde'), 'Le téléchargement est proposé')
    check(panel.includes('Restaurer la sauvegarde'), 'La restauration est proposée')
    check(panel.includes('Réinitialiser le SaaS'), 'La réinitialisation est proposée')
    check(
      panel.includes('Le fichier obtenu est confidentiel'),
      'L’écran avertit de la confidentialité du fichier'
    )
    check(
      panel.includes('Le compte Super Admin et sa connexion'),
      'L’écran dit explicitement que le Super Admin est conservé'
    )

    const response = await superAdmin.page.request.get(`${base}/api/sauvegarde`)
    check(response.status() === 200, 'GET /api/sauvegarde délivre le fichier', `statut ${response.status()}`)

    const disposition = response.headers()['content-disposition'] ?? ''
    check(
      /attachment; filename="adikom-pilot-sauvegarde-\d{4}-\d{2}-\d{2}\.json"/.test(disposition),
      'Le fichier porte un nom explicite et daté',
      disposition
    )

    const backup = await response.json()
    check(backup.format === 'adikom-pilot.sauvegarde', 'Le format est celui d’ADIKOM PILOT', String(backup.format))
    check(Number(backup.version) === 1, 'Le format est versionné', `version ${backup.version}`)
    check(Boolean(backup.created_at), 'La sauvegarde porte sa date de création')
    check(
      backup.donnees && typeof backup.donnees === 'object',
      'La sauvegarde porte une section « donnees »'
    )

    const fuites = ['app_users', 'permissions', 'audit_log', 'groups', 'user_permissions'].filter(
      (key) => key in (backup.donnees ?? {})
    )
    check(
      fuites.length === 0,
      'AUCUN compte, AUCUNE permission, AUCUN journal dans le fichier',
      fuites.join(', ')
    )

    const serialised = JSON.stringify(backup)
    check(
      !/"(password|encrypted_password|token|refresh_token|secret|api_key)"/.test(serialised),
      'Aucun mot de passe, jeton ni secret dans le fichier'
    )

    const savedTotal = Object.values(backup.donnees).reduce(
      (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
      0
    )
    check(
      savedTotal === beforeTotal,
      'La sauvegarde contient exactement les lignes présentes en base',
      `${savedTotal} sauvegardée(s) / ${beforeTotal} en base`
    )

    // Conservée sur disque : c'est le filet de sécurité de la suite.
    backupFile = join(tmpdir(), `adikom-recette-sauvegarde-${STAMP}.json`)
    writeFileSync(backupFile, serialised, 'utf8')
    console.log(`  ${DIM}sauvegarde conservée : ${backupFile}${RESET}`)

    /* ================================================================== */
    section('5. LE SUPER ADMIN — UN FICHIER INVALIDE EST REFUSÉ')

    /**
     * Soumet un fichier et ATTEND L'EFFET, jamais un délai.
     *
     * Une restauration réelle prend plusieurs secondes ; un `waitForTimeout`
     * calibré sur un refus immédiat conclurait à l'échec pour la seule opération
     * qui réussit. La recette attend donc l'apparition d'un verdict — refus
     * nommé OU résultat chiffré — et ne se contente jamais d'un temps écoulé.
     */
    /*
     * LE VERDICT LU EST CELUI DU SERVEUR, PAS CELUI DE L'APERÇU.
     *
     * L'écran affiche deux choses très semblables : un AVERTISSEMENT lu dans le
     * navigateur dès le choix du fichier, et la RÉPONSE du serveur après envoi.
     * Se contenter du texte de la page ferait passer le premier pour le second,
     * et la recette conclurait « refusé » sans que rien n'ait été soumis.
     *
     * Le refus du serveur, lui, est rattaché au champ : `#fichier-error` et
     * `#confirmation-error` n'existent QUE lorsqu'une action serveur les a
     * renvoyés. C'est ce que cette fonction rapporte.
     */
    async function tryRestore(fileName, mimeType, content, confirmation) {
      await superAdmin.page.goto(`${base}/parametres?onglet=sauvegarde`, { waitUntil: 'load' })
      const form = superAdmin.page.locator('form:has(input[name="fichier"])')
      await form.locator('input[name="fichier"]').setInputFiles({
        name: fileName,
        mimeType,
        buffer: Buffer.from(content, 'utf8'),
      })
      await form.locator('input[name="confirmation"]').fill(confirmation)
      await form.locator('button[type="submit"]').click()

      await superAdmin.page
        .waitForFunction(
          () =>
            document.querySelector('#fichier-error') !== null ||
            document.querySelector('#confirmation-error') !== null ||
            /ligne\(s\) restaurée|n’a pas pu être effectuée/.test(document.body.innerText),
          undefined,
          { timeout: 120000 }
        )
        .catch(() => {})

      const reponse = await superAdmin.page.evaluate(() => ({
        fichier: document.querySelector('#fichier-error')?.textContent ?? '',
        confirmation: document.querySelector('#confirmation-error')?.textContent ?? '',
      }))

      return {
        texte: await mainText(superAdmin.page),
        serveur: `${reponse.fichier} ${reponse.confirmation}`.trim(),
      }
    }

    const notJson = await tryRestore(
      'bidon.json',
      'application/json',
      'ceci n’est pas du JSON',
      'RESTAURER'
    )
    check(
      /n’est pas un JSON lisible/.test(notJson.serveur),
      'Un fichier qui n’est pas du JSON est refusé PAR LE SERVEUR',
      notJson.serveur || 'aucune réponse du serveur'
    )

    const foreign = await tryRestore(
      'autre.json',
      'application/json',
      JSON.stringify({ format: 'autre-produit', version: 1, donnees: {} }),
      'RESTAURER'
    )
    check(
      /n’est pas une sauvegarde ADIKOM PILOT/.test(foreign.serveur),
      'Un fichier d’un autre produit est refusé PAR LE SERVEUR',
      foreign.serveur || 'aucune réponse du serveur'
    )

    const incomplete = await tryRestore(
      'incomplet.json',
      'application/json',
      JSON.stringify({ format: 'adikom-pilot.sauvegarde', version: 1 }),
      'RESTAURER'
    )
    check(
      /Sauvegarde incomplète/.test(incomplete.serveur),
      'Une sauvegarde sans données est refusée PAR LE SERVEUR',
      incomplete.serveur || 'aucune réponse du serveur'
    )

    const forged = await tryRestore(
      'forge.json',
      'application/json',
      JSON.stringify({
        format: 'adikom-pilot.sauvegarde',
        version: 1,
        donnees: { app_users: [{ id: accounts.super.id, is_super_admin: true }] },
      }),
      'RESTAURER'
    )
    check(
      /hors du périmètre de sauvegarde/.test(forged.texte),
      'UN FICHIER QUI VISE LES COMPTES EST REFUSÉ',
      forged.texte.slice(0, 110)
    )

    const badWord = await tryRestore('bon.json', 'application/json', serialised, 'oui')
    check(
      /Saisissez exactement/.test(badWord.serveur),
      'Une confirmation approximative ne déclenche rien',
      badWord.serveur || 'aucune réponse du serveur'
    )

    /* ================================================================== */
    section('6. LE SUPER ADMIN — RÉINITIALISATION RÉELLE')

    await superAdmin.page.goto(`${base}/parametres?onglet=sauvegarde`, { waitUntil: 'load' })
    const resetForm = superAdmin.page.locator('form:has(input[name="confirmation"])').last()

    await resetForm.locator('input[name="confirmation"]').fill('efface tout')
    await resetForm.locator('button[type="submit"]').click()
    await superAdmin.page.waitForTimeout(2000)
    check(
      /Saisissez exactement/.test(await mainText(superAdmin.page)),
      'Une confirmation approximative ne réinitialise rien'
    )

    const stillThere = await countScope(admin, scope)
    check(
      Object.values(stillThere).reduce((a, b) => a + b, 0) === beforeTotal,
      'Aucune donnée n’a été supprimée par la tentative refusée'
    )

    await superAdmin.page.goto(`${base}/parametres?onglet=sauvegarde`, { waitUntil: 'load' })
    const realReset = superAdmin.page.locator('form:has(input[name="confirmation"])').last()
    await realReset.locator('input[name="confirmation"]').fill('REINITIALISER')
    await realReset.locator('button[type="submit"]').click()
    await superAdmin.page.waitForFunction(
      () => /ligne\(s\) de données métier supprimée|déjà vierge/.test(document.body.innerText),
      undefined,
      { timeout: 90000 }
    )

    const emptied = await countScope(admin, scope)
    const remaining = Object.entries(emptied).filter(([, count]) => count > 0)
    check(
      remaining.length === 0,
      'Toutes les données métier sont supprimées',
      remaining.map(([t, c]) => `${t}=${c}`).join(', ')
    )

    const { count: usersAfterReset } = await admin
      .from('app_users')
      .select('*', { count: 'exact', head: true })
    check(
      usersAfterReset === usersBefore,
      'AUCUN COMPTE N’A ÉTÉ SUPPRIMÉ',
      `${usersAfterReset} / ${usersBefore}`
    )

    const { data: realSuper } = await admin
      .from('app_users')
      .select('id, status')
      .eq('is_super_admin', true)
      .neq('id', accounts.super.id)
    check(
      (realSuper ?? []).some((u) => u.status === 'ACTIVE'),
      'LE SUPER ADMIN D’ADIKOM EST TOUJOURS PRÉSENT ET ACTIF'
    )

    const { count: permsAfter } = await admin
      .from('permissions')
      .select('*', { count: 'exact', head: true })
    check(permsAfter === 178, 'Le catalogue des permissions est intact', `${permsAfter} permissions`)

    const { count: settingsAfter } = await admin
      .from('company_settings')
      .select('*', { count: 'exact', head: true })
    check(settingsAfter === 1, 'La configuration de l’entreprise est intacte')

    // Le SaaS reste utilisable : la session en cours n'a pas été invalidée.
    await superAdmin.page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
    check(
      superAdmin.page.url().includes('/tableau-de-bord'),
      'La session du Super Admin survit à la réinitialisation'
    )

    /* ================================================================== */
    section('7. LE SUPER ADMIN — RESTAURATION RÉELLE')

    const restored = await tryRestore('sauvegarde.json', 'application/json', serialised, 'RESTAURER')
    check(
      /ligne\(s\) restaurée/.test(restored.texte),
      'La restauration réussit et annonce son résultat',
      (restored.texte.match(/\d+ ligne\(s\) restaurée[^.]*\./) ?? [restored.texte.slice(0, 120)])[0]
    )

    const after = await countScope(admin, scope)
    const divergences = Object.keys(before).filter((table) => before[table] !== after[table])
    check(
      divergences.length === 0,
      'L’état est rétabli à l’identique, table par table',
      divergences.map((t) => `${t} : ${before[t]} → ${after[t]}`).join(' · ')
    )

    const { count: usersAfterRestore } = await admin
      .from('app_users')
      .select('*', { count: 'exact', head: true })
    check(
      usersAfterRestore === usersBefore,
      'AUCUN COMPTE N’A ÉTÉ CRÉÉ NI REMPLACÉ PAR LA RESTAURATION',
      `${usersAfterRestore} / ${usersBefore}`
    )

    /* ================================================================== */
    section('8. UNE NOUVELLE CONNEXION RESTE POSSIBLE')

    const again = await signIn(browser, base, accounts.super)
    contexts.push(again.context)
    check(
      again.page.url().includes('/tableau-de-bord'),
      'Un Super Admin peut se reconnecter après réinitialisation ET restauration'
    )

    /* ================================================================== */
    section('9. LE JOURNAL D’ACTIVITÉ')

    const { data: journal } = await admin
      .from('audit_log')
      .select('action, entity_type, actor_id')
      .eq('entity_type', 'backup')
      .eq('actor_id', accounts.super.id)

    const actions = new Set((journal ?? []).map((row) => row.action))
    check(actions.has('EXPORT'), 'Le téléchargement est journalisé')
    check(actions.has('DELETE'), 'La réinitialisation est journalisée')
    check(actions.has('RESTORE'), 'La restauration est journalisée')

    const { data: denied } = await admin
      .from('audit_log')
      .select('action, result')
      .eq('entity_type', 'backup')
      .eq('actor_id', accounts.parametres.id)
    check(
      (denied ?? []).some((row) => row.result === 'DENIED'),
      'Le refus opposé au profil sans statut est journalisé'
    )
  } finally {
    for (const context of contexts) {
      await context.close().catch(() => {})
    }
    await browser.close().catch(() => {})

    /*
     * LE NETTOYAGE NE LAISSE JAMAIS UN SUPER ADMIN DERRIÈRE LUI.
     *
     * C'est la seule partie de cette recette qui ne peut pas échouer en
     * silence : un compte de statut Super Admin oublié serait un défaut de
     * sécurité, pas un résidu.
     */
    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      const { error: profileError } = await admin.from('app_users').delete().eq('id', account.id)
      const { error: authError } = await admin.auth.admin.deleteUser(account.id)

      if (profileError || authError) {
        console.log(
          `\n${RED}✖ COMPTE DE RECETTE NON SUPPRIMÉ : ${account.username}${RESET}` +
            `\n  ${profileError?.message ?? ''} ${authError?.message ?? ''}` +
            `\n  Le supprimer manuellement avant toute autre opération.`
        )
        failed += 1
      }
    }

    const { data: reste } = await admin
      .from('app_users')
      .select('username')
      .like('username', 'recette.sauv.%')
    check(
      (reste ?? []).length === 0,
      'Aucun compte de recette ne subsiste',
      (reste ?? []).map((u) => u.username).join(', ')
    )

    console.log(`\n──────────────────────────────────────────────────────────────`)
    console.log(`${passed} contrôle(s) réussi(s), ${failed} échec(s).`)
    if (backupFile) {
      console.log(`${DIM}Sauvegarde de sécurité : ${backupFile}${RESET}`)
    }
    console.log('')
  }

  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(`\n${RED}✖ ${error.message}${RESET}\n`)
  process.exit(1)
})
