'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Actions d'authentification.
 *
 * ADIKOM PILOT ne propose ni inscription publique ni création de compte en
 * libre-service : les comptes sont créés par le Super Admin
 * (03_Modules/08_Utilisateurs_et_Groupes.md §6).
 *
 * La connexion se fait par **nom d'utilisateur**. L'utilisateur final ne
 * saisit jamais d'adresse email. Supabase Auth reste le système
 * d'authentification : la correspondance est résolue côté serveur.
 */

/** Longueur minimale d'un mot de passe. Contrôlée ici ET côté formulaire. */
const PASSWORD_MIN_LENGTH = 8

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'Veuillez saisir votre nom d’utilisateur.')
    .max(64, 'Ce nom d’utilisateur est trop long.'),
  password: z
    .string()
    .min(1, 'Veuillez saisir votre mot de passe.')
    .min(
      PASSWORD_MIN_LENGTH,
      `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
    ),
})

export type SignInState = {
  error?: string
  fieldErrors?: { username?: string; password?: string }
}

/**
 * Message unique pour tout échec d'authentification.
 *
 * Ne révèle jamais si le nom d'utilisateur existe, ni l'adresse interne
 * associée, ni aucun détail technique — cela permettrait d'énumérer les
 * comptes (CLAUDE.md §43, 05_Regles_Metier/05_Permissions.md §29).
 */
const GENERIC_AUTH_ERROR = 'Nom d’utilisateur ou mot de passe incorrect.'

/** Destination interne sûre : empêche une redirection ouverte via `suite`. */
function safeRedirectTarget(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw : ''
  if (value.startsWith('/') && !value.startsWith('//')) {
    return value
  }
  return '/tableau-de-bord'
}

/**
 * Résout le nom d'utilisateur en identifiant de connexion Supabase.
 *
 * Exécutée exclusivement côté serveur, avec le client d'administration : la
 * table `app_users` n'est pas lisible sans session, et aucune requête publique
 * ne doit permettre d'énumérer les comptes ou les adresses.
 *
 * L'adresse retournée ne quitte jamais le serveur : elle sert uniquement à
 * appeler `signInWithPassword`.
 *
 * La recherche est insensible à la casse ; l'unicité correspondante est
 * garantie en base par un index sur `lower(username)`.
 */
async function resolveLoginEmail(username: string): Promise<string | null> {
  const admin = createSupabaseAdminClient()

  const { data, error } = await admin
    .from('app_users')
    .select('email')
    .ilike('username', username)
    .limit(2)

  // Aucun compte, ou correspondance ambiguë : traité comme un échec.
  if (error || !data || data.length !== 1) return null

  return data[0].email
}

export async function signInAction(
  _prevState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors
    return {
      fieldErrors: {
        username: flat.username?.[0],
        password: flat.password?.[0],
      },
    }
  }

  const { username, password } = parsed.data
  const email = await resolveLoginEmail(username)
  const supabase = await createSupabaseServerClient()

  // Nom d'utilisateur inconnu : une tentative d'authentification est tout de
  // même effectuée sur une adresse inexistante. Sans cela, un échec immédiat
  // se distinguerait par sa rapidité d'un échec sur mot de passe erroné, ce
  // qui permettrait de déduire quels noms d'utilisateur existent.
  if (!email) {
    await supabase.auth.signInWithPassword({
      email: 'inconnu@adikom.invalid',
      password,
    })
    return { error: GENERIC_AUTH_ERROR }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    return { error: GENERIC_AUTH_ERROR }
  }

  // Le compte existe côté authentification, mais son profil interne peut être
  // désactivé ou suspendu : la désactivation prime sur tout
  // (05_Regles_Metier/05_Permissions.md §48).
  const { data: profile } = await supabase
    .from('app_users')
    .select('status')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile || profile.status !== 'ACTIVE') {
    await supabase.auth.signOut()
    return {
      error:
        "Votre compte n'est pas actif. Veuillez contacter l'administrateur d'ADIKOM PILOT.",
    }
  }

  // Horodatage et traçabilité de la connexion (05_Regles_Metier/06_Audit.md §25).
  // Passe par une fonction dédiée : un utilisateur n'a aucun droit d'écriture
  // sur sa propre fiche.
  await supabase.rpc('record_login')

  redirect(safeRedirectTarget(formData.get('suite')))
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await supabase.rpc('log_audit', {
      p_action: 'LOGOUT',
      p_entity_type: 'app_users',
      p_entity_id: user.id,
      p_module_code: 'users',
    })
  }

  await supabase.auth.signOut()
  redirect('/connexion')
}
