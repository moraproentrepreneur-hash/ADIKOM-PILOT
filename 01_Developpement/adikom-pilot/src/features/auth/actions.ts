'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { requireSession } from '@/lib/auth/dal'
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

/* -------------------------------------------------------------------------- */
/*  Changement du mot de passe temporaire                                      */
/* -------------------------------------------------------------------------- */

export type PasswordChangeState = {
  error?: string
  fieldErrors?: { password?: string; confirmation?: string }
}

const passwordChangeSchema = z
  .object({
    password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
      ),
    confirmation: z.string().min(1, 'Veuillez confirmer le nouveau mot de passe.'),
  })
  .refine((values) => values.password === values.confirmation, {
    path: ['confirmation'],
    message: 'Les deux mots de passe ne correspondent pas.',
  })

/**
 * Remplace le mot de passe temporaire par celui choisi par l'utilisateur.
 *
 * Deux écritures, dans cet ordre et sous condition :
 *
 *   1. Supabase Auth enregistre le nouveau mot de passe. Le temporaire cesse
 *      immédiatement d'être valable — c'est Auth qui le garantit, aucune copie
 *      applicative n'existe.
 *   2. L'indicateur `must_change_password` n'est levé qu'ensuite, et par le
 *      client d'administration. Aucune policy ne permet à l'utilisateur de le
 *      lever lui-même, et le trigger `app_users_no_self_promotion` le refuse
 *      en base : l'étape ne peut donc pas être sautée.
 *
 * Le mot de passe ne quitte jamais cette fonction : il n'est ni journalisé, ni
 * renvoyé, ni écrit dans une table applicative.
 */
export async function changePasswordAction(
  _prevState: PasswordChangeState,
  formData: FormData
): Promise<PasswordChangeState> {
  // Session exigée, sans imposer la redirection : c'est précisément l'écran
  // vers lequel `requireUser` détourne.
  const user = await requireSession()

  const parsed = passwordChangeSchema.safeParse({
    password: formData.get('password'),
    confirmation: formData.get('confirmation'),
  })

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors
    return {
      fieldErrors: {
        password: flat.password?.[0],
        confirmation: flat.confirmation?.[0],
      },
    }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return {
      error:
        'Le mot de passe n’a pas pu être enregistré. Choisissez-en un autre, puis réessayez.',
    }
  }

  // La mise à jour de la fiche journalise l'événement par le trigger d'audit
  // (avant / après sur `must_change_password`). Le mot de passe lui-même n'y
  // figure pas : aucune colonne d'`app_users` ne le contient.
  const admin = createSupabaseAdminClient()
  const { error: flagError } = await admin
    .from('app_users')
    .update({ must_change_password: false })
    .eq('id', user.id)

  if (flagError) {
    return {
      error:
        'Votre mot de passe a été modifié, mais la validation n’a pas abouti. Reconnectez-vous, puis réessayez.',
    }
  }

  // Journalisé avec la session de l'utilisateur, afin que l'auteur de
  // l'opération soit correctement identifié dans le journal.
  await supabase.rpc('log_audit', {
    p_action: 'UPDATE',
    p_entity_type: 'app_users',
    p_entity_id: user.id,
    p_module_code: 'users',
    p_reason: 'Définition du mot de passe personnel à la première connexion.',
  })

  redirect('/tableau-de-bord')
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
