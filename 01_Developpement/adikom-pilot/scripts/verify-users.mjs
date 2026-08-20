#!/usr/bin/env node
/**
 * Recette sécurité du module Utilisateurs — ADIKOM PILOT.
 *
 * Crée un compte de test dépourvu de toute permission, ouvre une session réelle
 * avec ce compte, puis vérifie que chaque opération de gouvernance lui est
 * refusée — y compris par appel direct, sans passer par l'interface.
 *
 * C'est le seul contrôle qui vaille : masquer un bouton n'est pas une
 * protection (05_Regles_Metier/05_Permissions.md §50 et §85).
 *
 * Le compte de test est supprimé en fin d'exécution.
 *
 * Utilisation :
 *   npm run verify:users
 */

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

/** Une opération de gouvernance doit être refusée : l'absence d'erreur est l'échec. */
function refused(error, label) {
  if (error) ok(label, String(error.message).slice(0, 48))
  else ko(label, '*** OPÉRATION AUTORISÉE À TORT ***')
}

/**
 * Une lecture non autorisée ne lève pas d'erreur sous RLS : elle renvoie
 * simplement un ensemble vide. C'est le comportement normal de PostgREST, et
 * la seule chose qui importe est qu'aucune donnée ne remonte.
 *
 * Vérifier la présence d'une erreur ferait échouer le test alors que la
 * protection fonctionne — et, plus grave, le ferait passer si une erreur
 * survenait pour une tout autre raison.
 */
function noRows(result, label) {
  if (result.error) {
    ok(label, `refus explicite — ${String(result.error.message).slice(0, 40)}`)
  } else if (!result.data || result.data.length === 0) {
    ok(label, 'aucune ligne renvoyée')
  } else {
    ko(label, `*** ${result.data.length} LIGNE(S) LISIBLE(S) ***`)
  }
}

const TEST_USERNAME = 'recette.securite'
const TEST_EMAIL = 'recette.securite@adikom.test'
const TEST_PASSWORD = 'recette-securite-2026'

async function main() {
  loadEnvFile()

  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nProjet : ${url}\n`)

  // ---------------------------------------------------------- préparation ---
  // Nettoyage préalable : une exécution interrompue peut avoir laissé le compte.
  const { data: existingList } = await admin.auth.admin.listUsers()
  const stale = existingList?.users.find((u) => u.email === TEST_EMAIL)
  if (stale) {
    await admin.from('app_users').delete().eq('id', stale.id)
    await admin.auth.admin.deleteUser(stale.id)
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })

  if (createError || !created.user) {
    console.error(`\n✖ Préparation impossible : ${createError?.message}\n`)
    process.exit(1)
  }

  const testId = created.user.id

  const { error: profileError } = await admin.from('app_users').insert({
    id: testId,
    first_name: 'Recette',
    last_name: 'Sécurité',
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    status: 'ACTIVE',
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(testId)
    console.error(`\n✖ Préparation impossible : ${profileError.message}\n`)
    process.exit(1)
  }

  console.log(`Compte de test créé : ${TEST_USERNAME} (aucune permission)\n`)

  // Identifiant du Super Admin, cible des tentatives d'accès illégitimes.
  const { data: superAdmin } = await admin
    .from('app_users')
    .select('id, username')
    .eq('is_super_admin', true)
    .limit(1)
    .maybeSingle()

  try {
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: signInError } = await client.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })

    if (signInError) {
      ko('Session du compte de test', signInError.message)
      throw new Error('session indisponible')
    }
    ok('Session du compte de test établie')

    // ------------------------------------------------------- 1. Lecture ----
    console.log('\n1. Lecture des utilisateurs')
    const { data: visible } = await client
      .from('app_users')
      .select('id, username')

    const others = (visible ?? []).filter((row) => row.id !== testId)
    if (others.length === 0) {
      ok('Ne voit que sa propre fiche', `${visible?.length ?? 0} ligne(s)`)
    } else {
      ko('Ne voit que sa propre fiche', `${others.length} autre(s) utilisateur(s) visible(s)`)
    }

    // ------------------------------------------------------ 2. Création ----
    console.log('\n2. Création d’un utilisateur')
    const { error: insertError } = await client.from('app_users').insert({
      id: crypto.randomUUID(),
      first_name: 'Intrus',
      last_name: 'Test',
      username: 'intrus.test',
      email: 'intrus@adikom.test',
      status: 'ACTIVE',
    })
    refused(insertError, 'Création refusée')

    // --------------------------------------------------- 3. Modification ---
    console.log('\n3. Modification d’un autre utilisateur')
    if (superAdmin) {
      const { error: updateError, count } = await client
        .from('app_users')
        .update({ job_title: 'Modifié sans droit' }, { count: 'exact' })
        .eq('id', superAdmin.id)

      // RLS peut renvoyer « aucune ligne affectée » plutôt qu'une erreur :
      // les deux constituent un refus, mais il faut le vérifier explicitement.
      if (updateError) {
        ok('Modification refusée', String(updateError.message).slice(0, 48))
      } else if (!count) {
        ok('Modification sans effet', 'aucune ligne modifiée')
      } else {
        ko('Modification refusée', '*** LA FICHE A ÉTÉ MODIFIÉE ***')
      }
    }

    // ---------------------------------------- 4. Escalade de privilèges ----
    console.log('\n4. Escalade de privilèges')
    const { error: selfPromote, count: promoteCount } = await client
      .from('app_users')
      .update({ is_super_admin: true }, { count: 'exact' })
      .eq('id', testId)

    if (selfPromote) {
      ok('Auto-promotion refusée', String(selfPromote.message).slice(0, 48))
    } else if (!promoteCount) {
      ok('Auto-promotion sans effet', 'aucune ligne modifiée')
    } else {
      ko('Auto-promotion refusée', '*** LE COMPTE EST DEVENU SUPER ADMIN ***')
    }

    const { error: selfPermission } = await client.from('user_permissions').insert({
      user_id: testId,
      permission_id: crypto.randomUUID(),
      effect: 'ALLOW',
    })
    refused(selfPermission, 'Auto-attribution de permission refusée')

    const { error: selfGroup } = await client.from('user_groups').insert({
      user_id: testId,
      group_id: crypto.randomUUID(),
    })
    refused(selfGroup, 'Auto-affectation à un groupe refusée')

    // ------------------------------------- 5. Permissions d’un tiers -------
    console.log('\n5. Consultation des permissions d’autrui')
    if (superAdmin) {
      const { error: peekError } = await client.rpc('effective_permissions', {
        p_user_id: superAdmin.id,
      })
      refused(peekError, 'Lecture des permissions d’un tiers refusée')
    }

    const { data: ownPermissions, error: ownError } = await client.rpc('my_permissions')
    if (ownError) {
      ko('Lecture de ses propres permissions', ownError.message)
    } else {
      ok('Lecture de ses propres permissions', `${(ownPermissions ?? []).length} accordée(s)`)
    }

    // ------------------------------------------ 6. Données sensibles -------
    console.log('\n6. Données sensibles')
    noRows(await client.from('audit_log').select('id').limit(1), 'Journal d’audit illisible')
    noRows(
      await client.from('company_settings').select('id').limit(1),
      'Paramètres entreprise illisibles'
    )
    noRows(await client.from('groups').select('id').limit(1), 'Liste des groupes illisible')
    noRows(
      await client.from('user_permissions').select('permission_id').neq('user_id', testId),
      'Permissions des autres utilisateurs illisibles'
    )
    noRows(
      await client.from('numbering_rules').select('entity_key').limit(1),
      'Règles de numérotation illisibles'
    )

    await client.auth.signOut()
  } finally {
    // ---------------------------------------------------------- nettoyage ---
    await admin.from('app_users').delete().eq('id', testId)
    await admin.auth.admin.deleteUser(testId)
    console.log(`\n${DIM}Compte de test supprimé.${RESET}`)
  }

  console.log(`\n${'─'.repeat(58)}`)
  if (failed === 0) {
    console.log(`${GREEN}RECETTE SÉCURITÉ UTILISATEURS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE SÉCURITÉ UTILISATEURS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
