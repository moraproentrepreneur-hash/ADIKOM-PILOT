#!/usr/bin/env node
/**
 * Création du compte Super Admin initial — ADIKOM PILOT.
 *
 * Le Super Admin est le seul compte créé hors de l'application : il n'existe
 * aucune inscription publique, et c'est lui qui crée ensuite tous les autres
 * utilisateurs (03_Modules/08_Utilisateurs_et_Groupes.md §6, §5).
 *
 * Le script est idempotent : relancé, il met à jour le profil sans dupliquer
 * le compte.
 *
 * Utilisation (les identifiants ne sont JAMAIS passés en argument de ligne de
 * commande — ils resteraient dans l'historique du terminal) :
 *
 *   ADIKOM_ADMIN_EMAIL="prenom.nom@adikom.km" \
 *   ADIKOM_ADMIN_PASSWORD="..." \
 *   ADIKOM_ADMIN_FIRSTNAME="Prénom" \
 *   ADIKOM_ADMIN_LASTNAME="Nom" \
 *   npm run bootstrap:admin
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Charge .env.local sans dépendance externe. */
function loadEnvFile() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue
      process.env[key] = rawValue.replace(/^["']|["']$/g, '')
    }
  } catch {
    // Absent : les variables viennent alors de l'environnement.
  }
}

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`\n✖ Variable manquante : ${name}\n`)
    process.exit(1)
  }
  return value
}

async function main() {
  loadEnvFile()

  const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY')
  const email = required('ADIKOM_ADMIN_EMAIL')
  const password = required('ADIKOM_ADMIN_PASSWORD')
  const username = process.env.ADIKOM_ADMIN_USERNAME ?? null
  const firstName = process.env.ADIKOM_ADMIN_FIRSTNAME ?? 'Super'
  const lastName = process.env.ADIKOM_ADMIN_LASTNAME ?? 'Admin'

  // Aucune politique de mot de passe n'est définie dans la documentation
  // fonctionnelle. Le plancher retenu est un minimum de sécurité, pas une règle
  // métier inventée : il reste au-dessus du défaut Supabase (6 caractères).
  const MINIMUM_LENGTH = 8
  const RECOMMENDED_LENGTH = 12

  if (password.length < MINIMUM_LENGTH) {
    console.error(
      `\n✖ Le mot de passe doit contenir au moins ${MINIMUM_LENGTH} caractères.\n`
    )
    process.exit(1)
  }

  if (password.length < RECOMMENDED_LENGTH) {
    console.warn(
      `\n⚠ Mot de passe de ${password.length} caractères.\n` +
        `  Ce compte détient l'accès complet au système, y compris aux données\n` +
        `  financières. Au moins ${RECOMMENDED_LENGTH} caractères sont recommandés\n` +
        `  avant toute mise en production.`
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nProjet   : ${supabaseUrl}`)
  console.log(`Compte   : ${email}`)

  // 1. Compte d'authentification -------------------------------------------
  let userId

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    // Déjà présent : on récupère son identifiant plutôt que d'échouer.
    const { data: list, error: listError } = await admin.auth.admin.listUsers()
    if (listError) {
      console.error(`\n✖ ${listError.message}\n`)
      process.exit(1)
    }

    const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!existing) {
      console.error(`\n✖ ${createError.message}\n`)
      process.exit(1)
    }

    userId = existing.id
    console.log('Auth     : compte existant réutilisé')
  } else {
    userId = created.user.id
    console.log('Auth     : compte créé')
  }

  // 2. Profil interne --------------------------------------------------------
  const { error: profileError } = await admin
    .from('app_users')
    .upsert(
      {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        job_title: 'Administrateur système',
        status: 'ACTIVE',
        is_super_admin: true,
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    console.error(`\n✖ Profil : ${profileError.message}\n`)
    process.exit(1)
  }

  console.log('Profil   : Super Admin actif')
  console.log('\n✔ Super Admin opérationnel. Connexion possible sur /connexion.\n')
  console.log('  Ce compte détient l’accès complet au système et ses actions')
  console.log('  sont journalisées comme toutes les autres.\n')
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
