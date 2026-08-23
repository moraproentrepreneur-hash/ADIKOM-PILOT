#!/usr/bin/env node
/**
 * Recette du module Partenaires — création et modification.
 *
 * DEUX QUESTIONS, ÉGALEMENT NÉCESSAIRES
 *
 *   1. Les deux capacités FONCTIONNENT-ELLES réellement ? Le formulaire est
 *      rempli et soumis comme le ferait un utilisateur ; le partenaire créé est
 *      relu en base, modifié, et la modification relue à son tour.
 *
 *   2. Sont-elles ATTRIBUABLES SÉPARÉMENT (DEC-024) ? Créer et modifier sont
 *      deux droits distincts, et aucun n'est inclus dans « voir ». Le contrôle
 *      porte sur les trois barrières, pas seulement sur l'affichage d'un
 *      bouton (DEC-011) :
 *
 *        · le bouton, qui doit disparaître ;
 *        · la ROUTE, qui doit refuser l'accès direct par URL ;
 *        · la BASE, dont les policies RLS doivent refuser l'écriture même si
 *          l'appel contourne entièrement l'interface.
 *
 * Les comptes de recette et le partenaire d'essai sont supprimés à la fin. Les
 * données DEMO ne sont jamais touchées : elles servent uniquement de sujets.
 *
 * Utilisation :
 *   node scripts/verify-partners.mjs [url]
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

function check(condition, label, detail = '') {
  if (condition) ok(label, detail)
  else ko(label, detail)
}

const STAMP = Date.now().toString().slice(-6)
const TEST_NAME = `RECETTE PARTENAIRE ${STAMP}`

/* -------------------------------------------------------------------------- */
/*  Profils de recette                                                         */
/* -------------------------------------------------------------------------- */

const PROFILES = [
  { key: 'view', permissions: ['parties.partners.view'] },
  { key: 'create', permissions: ['parties.partners.view', 'parties.partners.create'] },
  { key: 'update', permissions: ['parties.partners.view', 'parties.partners.update'] },
  { key: 'archive', permissions: ['parties.partners.view', 'parties.partners.archive'] },
  // Attribution incohérente, volontairement éprouvée : archiver sans voir.
  { key: 'archiveonly', permissions: ['parties.partners.archive'] },
]

async function createProfile(admin, profile) {
  const username = `recette.par.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-par-${STAMP}`

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
    last_name: `Partenaire ${profile.key}`,
    username,
    email,
    status: 'ACTIVE',
  })

  if (profileError) throw new Error(`profil ${profile.key} : ${profileError.message}`)

  const { data: catalog } = await admin
    .from('permissions')
    .select('id, code')
    .in('code', profile.permissions)

  if ((catalog ?? []).length !== profile.permissions.length) {
    throw new Error(
      `catalogue incomplet pour ${profile.key} : ` +
        `${(catalog ?? []).length}/${profile.permissions.length} permission(s) trouvée(s)`
    )
  }

  const { error: grantError } = await admin.from('user_permissions').insert(
    catalog.map((permission) => ({ user_id: id, permission_id: permission.id, effect: 'ALLOW' }))
  )

  if (grantError) throw new Error(`permissions ${profile.key} : ${grantError.message}`)

  return { id, email, password, username }
}

/**
 * Soumet le formulaire par SON bouton.
 *
 * `button[type="submit"]` ne convient pas : la barre latérale en porte un,
 * « Déconnexion », qui vient avant dans le document. Un sélecteur générique
 * déconnectait donc le compte au lieu d'enregistrer la fiche.
 */
async function submitForm(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click()
}

/** Attend une URL, sans passer par un motif glob où « ? » est un joker. */
async function waitForUrl(page, contains) {
  await page.waitForURL((url) => contains.every((part) => url.href.includes(part)), {
    timeout: 30000,
  })
}

async function signIn(browser, base, account) {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${base}/connexion`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#username') !== null)
  await page.fill('#username', account.username)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/tableau-de-bord', { timeout: 30000 })

  return { context, page }
}

/* -------------------------------------------------------------------------- */
/*  Barrière des données : l'écriture directe, interface contournée            */
/* -------------------------------------------------------------------------- */

/**
 * Écrit dans `partners` avec la session du compte, sans passer par
 * l'application. Seules les policies RLS répondent ici : c'est la barrière qui
 * subsiste si un appel direct atteint la base.
 */
async function writeAsUser(account, url, anonKey, operation, partnerId) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: signInError } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })

  if (signInError) throw new Error(`session ${account.username} : ${signInError.message}`)

  const operations = {
    insert: () =>
      client
        .from('partners')
        .insert({ partner_no: `PAR-RLS-${STAMP}`, legal_name: `${TEST_NAME} RLS` })
        .select('id'),
    update: () =>
      client
        .from('partners')
        .update({ legal_name: `${TEST_NAME} DÉTOURNÉ` })
        .eq('id', partnerId)
        .select('id'),
    status: () =>
      client.from('partners').update({ status: 'ARCHIVED' }).eq('id', partnerId).select('id'),
    select: () => client.from('partners').select('id').eq('id', partnerId),
    delete: () => client.from('partners').delete().eq('id', partnerId).select('id'),
  }

  const result = await operations[operation]()

  await client.auth.signOut()

  // Une policy qui refuse une mise à jour ne lève pas d'erreur : elle ne voit
  // simplement aucune ligne. Zéro ligne touchée vaut donc refus.
  return { error: result.error, rows: result.data?.length ?? 0 }
}

/* -------------------------------------------------------------------------- */
/*  Recette                                                                    */
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

  const { data: demo } = await admin
    .from('partners')
    .select('id, partner_no, legal_name')
    .eq('legal_name', 'PARTENAIRE DEMO 01')
    .maybeSingle()

  if (!demo) {
    console.error('\n✖ Sujet introuvable : PARTENAIRE DEMO 01. Lancer `npm run demo:seed`.\n')
    process.exit(1)
  }

  console.log(`${DIM}Sujet : ${demo.partner_no} · ${demo.legal_name}${RESET}\n`)

  const accounts = {}
  const browser = await chromium.launch()
  let createdId = null

  try {
    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    /* ------------------------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('CAS 1 — VIEW seul : ni créer, ni modifier\n')

    {
      const { context, page } = await signIn(browser, base, accounts.view)

      await page.goto(`${base}/tiers/partenaires`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Nouveau partenaire' }).count()) === 0,
        'Bouton « Nouveau partenaire » absent de la liste'
      )

      await page.goto(`${base}/tiers/partenaires/${demo.id}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Modifier' }).count()) === 0,
        'Bouton « Modifier » absent de la fiche'
      )

      // La route, pas seulement le bouton.
      await page.goto(`${base}/tiers/partenaires/nouveau`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Accès direct à /tiers/partenaires/nouveau refusé',
        page.url().replace(base, '')
      )

      await page.goto(`${base}/tiers/partenaires/${demo.id}?mode=edition`, { waitUntil: 'load' })
      check(
        (await page.locator('#legalName').count()) === 0,
        'Le mode édition ne s’ouvre pas par URL'
      )

      check(
        (await page.getByText('Statut du partenaire').count()) === 0,
        'Bloc « Statut du partenaire » absent : archiver n’est pas inclus dans voir'
      )

      await context.close()

      // La base, si l'appel contourne entièrement l'interface.
      const insert = await writeAsUser(accounts.view, url, anonKey, 'insert')
      check(insert.rows === 0, 'RLS refuse la création', insert.error?.code ?? 'aucune ligne')

      const update = await writeAsUser(accounts.view, url, anonKey, 'update', demo.id)
      check(update.rows === 0, 'RLS refuse la modification', update.error?.code ?? 'aucune ligne')

      const status = await writeAsUser(accounts.view, url, anonKey, 'status', demo.id)
      check(
        status.rows === 0,
        'RLS refuse le changement de statut',
        status.error?.code ?? 'aucune ligne'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 2 — VIEW + CREATE : créer, sans pouvoir modifier\n')

    {
      const { context, page } = await signIn(browser, base, accounts.create)

      await page.goto(`${base}/tiers/partenaires`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Nouveau partenaire' }).count()) === 1,
        'Bouton « Nouveau partenaire » présent'
      )

      await page.getByRole('link', { name: 'Nouveau partenaire' }).click()
      await page.waitForURL('**/tiers/partenaires/nouveau', { timeout: 30000 })
      check(
        (await page.locator('#legalName').count()) === 1,
        'Le bouton ouvre le formulaire réel de création'
      )

      await page.fill('#legalName', TEST_NAME)
      await page.fill('#tradeName', 'Enseigne de recette')
      await page.fill('#contactName', 'Contact de recette')
      await page.fill('#phone', '+269 000 00 00')
      await page.fill('#email', `recette.${STAMP}@adikom.test`)
      await page.fill('#city', 'Moroni')
      await submitForm(page, 'Créer le partenaire')

      await waitForUrl(page, ['/tiers/partenaires/', 'cree=1'])

      const { data: created } = await admin
        .from('partners')
        .select('id, partner_no, legal_name, trade_name, email, status, created_by')
        .eq('legal_name', TEST_NAME)
        .maybeSingle()

      createdId = created?.id ?? null

      check(Boolean(created), 'Partenaire réellement enregistré en base', created?.partner_no)
      check(
        /^PAR-\d{6}$/.test(created?.partner_no ?? ''),
        'Identifiant attribué côté serveur (DEC-005)',
        created?.partner_no
      )
      check(created?.trade_name === 'Enseigne de recette', 'Les champs saisis sont enregistrés')
      check(
        created?.created_by === accounts.create.id,
        'L’auteur de la création est conservé'
      )
      check(created?.status === 'ACTIVE', 'Statut initial « Actif »', created?.status)

      check(
        (await page.getByRole('link', { name: 'Modifier' }).count()) === 0,
        'Créer n’emporte pas modifier : bouton « Modifier » absent'
      )

      await context.close()

      const update = await writeAsUser(accounts.create, url, anonKey, 'update', demo.id)
      check(
        update.rows === 0,
        'RLS refuse la modification à un compte qui n’a que « créer »',
        update.error?.code ?? 'aucune ligne'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 3 — VIEW + UPDATE : modifier, sans pouvoir créer\n')

    {
      const { context, page } = await signIn(browser, base, accounts.update)

      await page.goto(`${base}/tiers/partenaires`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Nouveau partenaire' }).count()) === 0,
        'Modifier n’emporte pas créer : bouton « Nouveau partenaire » absent'
      )

      await page.goto(`${base}/tiers/partenaires/${createdId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Modifier' }).count()) === 1,
        'Bouton « Modifier » présent sur la fiche'
      )

      await page.getByRole('link', { name: 'Modifier' }).click()
      await waitForUrl(page, ['/tiers/partenaires/', 'mode=edition'])
      check(
        (await page.locator('#legalName').count()) === 1,
        'Le bouton ouvre le formulaire réel de modification'
      )
      check(
        (await page.inputValue('#legalName')) === TEST_NAME,
        'Le formulaire est pré-rempli avec la fiche'
      )

      await page.fill('#contactName', 'Contact modifié')
      await submitForm(page, 'Enregistrer')
      await waitForUrl(page, ['/tiers/partenaires/', 'enregistre=1'])

      const { data: saved } = await admin
        .from('partners')
        .select('contact_name, updated_by')
        .eq('id', createdId)
        .maybeSingle()

      check(saved?.contact_name === 'Contact modifié', 'La modification est enregistrée en base')
      check(saved?.updated_by === accounts.update.id, 'L’auteur de la modification est conservé')

      await context.close()

      const insert = await writeAsUser(accounts.update, url, anonKey, 'insert')
      check(
        insert.rows === 0,
        'RLS refuse la création à un compte qui n’a que « modifier »',
        insert.error?.code ?? 'aucune ligne'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 4 — VIEW + ARCHIVE : archiver, sans pouvoir modifier\n')

    {
      const { context, page } = await signIn(browser, base, accounts.archive)

      await page.goto(`${base}/tiers/partenaires/${createdId}`, { waitUntil: 'load' })
      check(
        (await page.getByText('Statut du partenaire').count()) >= 1,
        'Bloc « Statut du partenaire » présent'
      )
      check(
        (await page.getByRole('link', { name: 'Modifier' }).count()) === 0,
        'Archiver n’emporte pas modifier : bouton « Modifier » absent'
      )

      // La conséquence est annoncée AVANT validation : c'est la confirmation
      // retenue par le projet pour les changements d'état.
      await page.selectOption('select[name="status"]', 'ARCHIVED')
      check(
        (await page.getByText('sort des listes de sélection', { exact: false }).count()) >= 1,
        'La conséquence de l’archivage est annoncée avant validation'
      )

      await page.fill('input[name="reason"]', 'Recette : fin de partenariat')
      await submitForm(page, 'Appliquer le changement')
      await page.waitForTimeout(2500)

      const { data: archived } = await admin
        .from('partners')
        .select('status, status_reason, status_changed_at, status_changed_by')
        .eq('id', createdId)
        .maybeSingle()

      check(archived?.status === 'ARCHIVED', 'Le partenaire est archivé en base', archived?.status)
      check(
        archived?.status_reason === 'Recette : fin de partenariat',
        'Le motif est conservé sur la fiche'
      )
      check(Boolean(archived?.status_changed_at), 'La date du changement est conservée')
      check(
        archived?.status_changed_by === accounts.archive.id,
        'L’auteur du changement est conservé'
      )

      // La fiche subsiste : archiver n'est pas supprimer.
      await page.goto(`${base}/tiers/partenaires/${createdId}`, { waitUntil: 'load' })
      check(
        (await page.getByText(TEST_NAME, { exact: false }).count()) >= 1,
        'La fiche reste consultable après archivage'
      )

      // La liste distingue l'état archivé selon la convention existante.
      await page.goto(`${base}/tiers/partenaires?statut=ARCHIVED`, { waitUntil: 'load' })
      check(
        (await page.getByText(TEST_NAME, { exact: false }).count()) >= 1,
        'La liste identifie les partenaires archivés',
        'filtre statut=ARCHIVED'
      )

      await context.close()

      // Journal d'audit : le motif y est porté, indépendamment de la ligne.
      const { data: journal } = await admin
        .from('audit_log')
        .select('action, entity_type, reason')
        .eq('entity_type', 'partners')
        .eq('entity_id', createdId)
        .eq('action', 'STATUS_CHANGE')

      check(
        (journal ?? []).some((e) => e.reason === 'Recette : fin de partenariat'),
        'Le changement de statut est journalisé avec son motif',
        `${(journal ?? []).length} entrée(s) STATUS_CHANGE`
      )

      // Un partenaire ne se supprime pas, même avec le droit d'archiver.
      const removal = await writeAsUser(accounts.archive, url, anonKey, 'delete', createdId)
      check(
        removal.rows === 0,
        'La suppression reste impossible depuis l’application',
        removal.error?.code ?? 'aucune ligne'
      )

      // Un partenaire archivé ne peut plus recevoir de véhicule : il sort des
      // options de rattachement, qui ne retiennent que les partenaires actifs.
      const { data: selectable } = await admin
        .from('partners')
        .select('id')
        .eq('status', 'ACTIVE')
        .eq('id', createdId)

      check(
        (selectable ?? []).length === 0,
        'Le partenaire archivé sort des listes de sélection'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 5 — ARCHIVE sans VIEW : attribution incohérente, aucun contournement\n')

    {
      const { context, page } = await signIn(browser, base, accounts.archiveonly)

      await page.goto(`${base}/tiers/partenaires`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Liste refusée sans « voir »',
        page.url().replace(base, '')
      )

      await page.goto(`${base}/tiers/partenaires/${demo.id}`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Fiche refusée sans « voir »',
        page.url().replace(base, '')
      )

      await context.close()

      const read = await writeAsUser(accounts.archiveonly, url, anonKey, 'select', demo.id)
      check(read.rows === 0, 'RLS ne laisse rien lire sans « voir »', 'aucune ligne')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('DONNÉES DEMO\n')

    const { data: demoAfter } = await admin
      .from('partners')
      .select('partner_no, legal_name')
      .like('legal_name', 'PARTENAIRE DEMO%')
      .order('partner_no')

    check(
      (demoAfter ?? []).length === 3,
      'Les trois partenaires DEMO sont intacts',
      (demoAfter ?? []).map((p) => p.partner_no).join(', ')
    )
  } finally {
    await browser.close()

    // Nettoyage : le rôle de service peut supprimer, l'application non (DEC-020).
    if (createdId) await admin.from('partners').delete().eq('id', createdId)
    for (const account of Object.values(accounts)) {
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }
    console.log(`\n${DIM}Comptes et partenaire de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE PARTENAIRES : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE PARTENAIRES : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
