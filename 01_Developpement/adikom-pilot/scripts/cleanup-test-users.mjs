#!/usr/bin/env node
/**
 * Nettoyage exceptionnel des comptes de recette — ADIKOM PILOT.
 *
 * Opération d'environnement, PAS une fonctionnalité du SaaS. La règle métier
 * reste « désactivation plutôt que suppression » (CLAUDE.md §22) : aucune
 * suppression d'utilisateur n'est exposée dans l'interface.
 *
 * Le Super Admin principal est protégé par une liste explicite : le script
 * refuse de s'exécuter s'il ne le retrouve pas, et refuse de le supprimer quel
 * que soit le reste.
 *
 * Utilisation :
 *   node scripts/cleanup-test-users.mjs           # inventaire, sans rien supprimer
 *   node scripts/cleanup-test-users.mjs --appliquer
 */

import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required } from './lib/env.mjs'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

/** Comptes qui ne doivent jamais être supprimés, quel que soit le contexte. */
const PROTECTED_USERNAMES = ['rachade']

async function main() {
  loadEnvFile()

  const apply = process.argv.includes('--appliquer')

  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: users, error } = await admin
    .from('app_users')
    .select('id, username, first_name, last_name, email, is_super_admin, status')
    .order('created_at')

  if (error) throw new Error(`Lecture impossible : ${error.message}`)

  const protectedUsers = users.filter((u) =>
    PROTECTED_USERNAMES.includes((u.username ?? '').toLowerCase())
  )

  // Garde-fou : si le compte protégé est introuvable, la base n'est pas celle
  // attendue et rien ne doit être supprimé.
  for (const username of PROTECTED_USERNAMES) {
    if (!protectedUsers.some((u) => (u.username ?? '').toLowerCase() === username)) {
      throw new Error(
        `Compte protégé « ${username} » introuvable. Aucune suppression n'est effectuée.`
      )
    }
  }

  const targets = users.filter(
    (u) => !PROTECTED_USERNAMES.includes((u.username ?? '').toLowerCase())
  )

  console.log(`\nComptes présents : ${users.length}\n`)

  console.log('Conservés :')
  for (const u of protectedUsers) {
    console.log(
      `  ${GREEN}✔${RESET} ${u.first_name} ${u.last_name} ${DIM}— ${u.username}` +
        `${u.is_super_admin ? ' · Super Admin' : ''} · ${u.status}${RESET}`
    )
  }

  if (targets.length === 0) {
    console.log(`\n${GREEN}Aucun compte de recette à supprimer.${RESET}\n`)
    return
  }

  console.log(`\nÀ supprimer (${targets.length}) :`)
  for (const u of targets) {
    console.log(`  ${RED}✖${RESET} ${u.first_name} ${u.last_name} ${DIM}— ${u.username}${RESET}`)
  }

  if (!apply) {
    console.log(
      `\n${DIM}Inventaire uniquement. Relancez avec --appliquer pour supprimer.${RESET}\n`
    )
    return
  }

  console.log('')

  for (const user of targets) {
    // Dernière vérification avant chaque suppression : une erreur de filtre en
    // amont ne doit jamais pouvoir atteindre un compte protégé.
    if (PROTECTED_USERNAMES.includes((user.username ?? '').toLowerCase())) {
      throw new Error('Tentative de suppression d’un compte protégé — interrompu.')
    }

    /*
     * Ordre imposé par l'intégrité référentielle :
     *   1. droits individuels et rattachements ;
     *   2. références portées par d'autres fiches (responsable hiérarchique,
     *      auteur d'une création ou d'une désactivation) ;
     *   3. profil applicatif ;
     *   4. compte d'authentification (app_users.id → auth.users ON DELETE RESTRICT).
     *
     * Le journal d'audit n'est jamais touché : il conserve la trace des
     * opérations, y compris celles portant sur des comptes supprimés.
     */
    await admin.from('user_permissions').delete().eq('user_id', user.id)
    await admin.from('user_groups').delete().eq('user_id', user.id)
    await admin.from('user_departments').delete().eq('user_id', user.id)
    await admin.from('app_users').update({ manager_id: null }).eq('manager_id', user.id)

    const { error: profileError } = await admin.from('app_users').delete().eq('id', user.id)
    if (profileError) {
      console.log(`  ${RED}[ÉCHEC]${RESET} ${user.username} — ${profileError.message}`)
      continue
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id)
    if (authDeleteError) {
      console.log(
        `  ${RED}[PARTIEL]${RESET} ${user.username} — profil supprimé, compte Auth : ${authDeleteError.message}`
      )
      continue
    }

    console.log(`  ${GREEN}[SUPPRIMÉ]${RESET} ${user.username}`)
  }

  // Contrôle final : le compte protégé doit être intact.
  const { data: after } = await admin
    .from('app_users')
    .select('username, first_name, last_name, is_super_admin, status')
    .order('created_at')

  console.log(`\n${'─'.repeat(58)}`)
  console.log('Comptes restants :')
  for (const u of after ?? []) {
    console.log(
      `  ${u.first_name} ${u.last_name} ${DIM}— ${u.username}` +
        `${u.is_super_admin ? ' · Super Admin' : ''} · ${u.status}${RESET}`
    )
  }

  const superAdmin = (after ?? []).find(
    (u) => (u.username ?? '').toLowerCase() === PROTECTED_USERNAMES[0]
  )

  if (!superAdmin || !superAdmin.is_super_admin || superAdmin.status !== 'ACTIVE') {
    throw new Error('Le Super Admin principal n’est plus intact — vérifiez immédiatement.')
  }

  console.log(`\n${GREEN}Nettoyage terminé. Super Admin « rachade » intact et actif.${RESET}\n`)
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
