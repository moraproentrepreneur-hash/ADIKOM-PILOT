#!/usr/bin/env node
/**
 * Recette de l'authentification et des protections serveur — ADIKOM PILOT.
 *
 * Vérifie sur la base réelle, avec une vraie session, que :
 *   · l'authentification fonctionne ;
 *   · le Super Admin dispose de l'accès complet ;
 *   · la connexion est journalisée ;
 *   · les protections serveur résistent à une tentative directe, sans passer
 *     par l'interface (05_Regles_Metier/05_Permissions.md §85 et §86).
 *
 * Utilisation :
 *   ADIKOM_ADMIN_EMAIL=... ADIKOM_ADMIN_PASSWORD=... npm run verify:auth
 *
 * Lecture seule sur les données métier : les tentatives d'écriture testées
 * doivent toutes échouer. Aucune donnée n'est créée.
 */

import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required } from './lib/env.mjs'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0

function ok(label, detail = '') {
  passed += 1
  console.log(`${GREEN}[OK]${RESET} ${label}${detail ? ` — ${detail}` : ''}`)
}

function ko(label, detail = '') {
  failed += 1
  console.log(`${RED}[ÉCHEC]${RESET} ${label}${detail ? ` — ${detail}` : ''}`)
}

/** Enregistre le résultat d'un contrôle booléen. */
function check(condition, label, failureDetail = '', successDetail = '') {
  if (condition) {
    ok(label, successDetail)
  } else {
    ko(label, failureDetail)
  }
}

/**
 * Contrôle qu'une opération a bien été REFUSÉE.
 * Un succès signale une faille : l'absence d'erreur est l'échec du test.
 */
function checkRefused(error, label) {
  if (error) {
    ok(label, error.message.slice(0, 45))
  } else {
    ko(label, '*** OPÉRATION AUTORISÉE À TORT ***')
  }
}

async function main() {
  loadEnvFile()

  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const email = required('ADIKOM_ADMIN_EMAIL')
  const password = required('ADIKOM_ADMIN_PASSWORD')

  console.log(`\nProjet : ${url}`)
  console.log(`Compte : ${email}\n`)

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // --- 1. Authentification --------------------------------------------------
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError || !session.user) {
    ko('Authentification', signInError?.message ?? 'aucune session')
    console.log('\nLes contrôles suivants nécessitent une session. Arrêt.\n')
    process.exit(1)
  }
  ok('Authentification', `session établie pour ${session.user.id.slice(0, 8)}…`)

  // --- 2. Profil interne ----------------------------------------------------
  const { data: profile, error: profileError } = await supabase
    .from('app_users')
    .select('username, first_name, last_name, status, is_super_admin')
    .eq('id', session.user.id)
    .single()

  if (profileError || !profile) {
    ko('Lecture du profil', profileError?.message)
  } else {
    ok('Lecture du profil', `${profile.first_name} ${profile.last_name}`)
    check(profile.status === 'ACTIVE', 'Compte actif', `statut ${profile.status}`)
    check(profile.is_super_admin, 'Rôle Super Admin reconnu')
    check(
      Boolean(profile.username),
      'Identifiant applicatif renseigné',
      'aucun identifiant',
      profile.username ?? ''
    )
  }

  // --- 3. Permissions effectives -------------------------------------------
  const { data: perms, error: permsError } = await supabase.rpc('my_permissions')
  const { count: totalPerms } = await supabase
    .from('permissions')
    .select('*', { count: 'exact', head: true })

  if (permsError) {
    ko('Permissions effectives', permsError.message)
  } else if (perms.length === totalPerms) {
    ok('Accès complet du Super Admin', `${perms.length} permissions sur ${totalPerms}`)
  } else {
    ko('Accès complet du Super Admin', `${perms.length} sur ${totalPerms}`)
  }

  // Contrôle unitaire sur une permission financière sensible.
  const { data: canImpute } = await supabase.rpc('has_permission', {
    p_code: 'billing.imputations.validate',
  })
  check(
    canImpute,
    'Permission sensible accordée',
    'billing.imputations.validate refusée',
    'billing.imputations.validate'
  )

  // --- 4. Journalisation de la connexion -----------------------------------
  const { error: loginLogError } = await supabase.rpc('record_login')
  if (loginLogError) {
    ko('Journalisation de la connexion', loginLogError.message)
  } else {
    const { data: entries } = await supabase
      .from('audit_log')
      .select('action, result, actor_label')
      .eq('action', 'LOGIN')
      .order('occurred_at', { ascending: false })
      .limit(1)

    check(
      Boolean(entries?.length),
      'Connexion journalisée',
      'aucune entrée LOGIN trouvée',
      entries?.length ? `${entries[0].actor_label} · ${entries[0].result}` : ''
    )
  }

  // --- 5. Protections serveur ----------------------------------------------
  // Ces opérations DOIVENT échouer. Un succès est une faille.

  const { error: auditUpdateError } = await supabase
    .from('audit_log')
    .update({ reason: 'falsification' })
    .eq('action', 'LOGIN')

  checkRefused(auditUpdateError, 'Journal d’audit non modifiable')

  const { error: auditDeleteError } = await supabase
    .from('audit_log')
    .delete()
    .eq('action', 'LOGIN')

  checkRefused(auditDeleteError, 'Journal d’audit non supprimable')

  // Un utilisateur ne modifie pas son propre statut, même Super Admin.
  const { error: selfStatusError } = await supabase
    .from('app_users')
    .update({ status: 'INACTIVE' })
    .eq('id', session.user.id)

  checkRefused(selfStatusError, 'Auto-modification de statut refusée')

  // Nul ne peut se promouvoir ni se retirer le rôle Super Admin.
  const { error: selfRoleError } = await supabase
    .from('app_users')
    .update({ is_super_admin: false })
    .eq('id', session.user.id)

  checkRefused(selfRoleError, 'Auto-modification du rôle refusée')

  // Le catalogue des permissions n'est pas modifiable par l'application.
  const { error: catalogError } = await supabase
    .from('permissions')
    .insert({ code: 'faille.test', module_code: 'x', module_label: 'x', action: 'VIEW', label: 'x' })

  checkRefused(catalogError, 'Catalogue des permissions protégé')

  await supabase.auth.signOut()

  // --- Synthèse -------------------------------------------------------------
  console.log(`\n${'─'.repeat(55)}`)
  if (failed === 0) {
    console.log(`${GREEN}RECETTE AUTHENTIFICATION : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE AUTHENTIFICATION : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
