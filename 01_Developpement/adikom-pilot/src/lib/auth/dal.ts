import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { PermissionCode } from '@/lib/auth/permissions'

/**
 * Couche d'accès aux données (Data Access Layer).
 *
 * Frontière de sécurité de l'application. Toute lecture de session et tout
 * contrôle de permission passe par ici :
 *
 *   1. Cette couche          → contrôle applicatif serveur
 *   2. Policies RLS Postgres → contrôle au niveau des données
 *   3. Interface             → confort de lecture, JAMAIS une protection
 *
 * Références : 05_Regles_Metier/05_Permissions.md §50, §83, §85, §86.
 *
 * `server-only` empêche toute importation depuis un composant client.
 * `cache()` déduplique les appels au sein d'une même requête.
 */

export type SessionUser = {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  jobTitle: string | null
  isSuperAdmin: boolean
  avatarPath: string | null
  /** Le mot de passe temporaire remis à la création n'a pas encore été remplacé. */
  mustChangePassword: boolean
}

/** Écran de définition du mot de passe personnel, hors du groupe applicatif. */
export const PASSWORD_CHANGE_PATH = '/changer-mot-de-passe'

/** Utilisateur authentifié auprès de Supabase Auth, sans profil métier. */
export const getAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * Profil interne de l'utilisateur connecté.
 *
 * Renvoie `null` si le compte n'est pas ACTIF : une désactivation prend effet
 * immédiatement, quelles que soient les permissions accordées
 * (05_Regles_Metier/05_Permissions.md §48).
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const authUser = await getAuthUser()
  if (!authUser) return null

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('app_users')
    .select(
      'id, first_name, last_name, email, job_title, status, is_super_admin, avatar_path, must_change_password'
    )
    .eq('id', authUser.id)
    .maybeSingle()

  if (error || !data) return null
  if (data.status !== 'ACTIVE') return null

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    fullName: `${data.first_name} ${data.last_name}`.trim(),
    email: data.email,
    jobTitle: data.job_title,
    isSuperAdmin: data.is_super_admin,
    avatarPath: data.avatar_path,
    mustChangePassword: data.must_change_password,
  }
})

/** Codes des permissions accordées à l'utilisateur connecté. */
export const getPermissionCodes = cache(async (): Promise<ReadonlySet<string>> => {
  const user = await getCurrentUser()
  if (!user) return new Set<string>()

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('my_permissions')

  if (error || !data) return new Set<string>()
  return new Set<string>(data as string[])
})

/** Indique si l'utilisateur connecté détient une permission. */
export async function can(code: PermissionCode): Promise<boolean> {
  const codes = await getPermissionCodes()
  return codes.has(code)
}

/** Indique si l'utilisateur détient au moins une des permissions listées. */
export async function canAny(codes: readonly PermissionCode[]): Promise<boolean> {
  const granted = await getPermissionCodes()
  return codes.some((code) => granted.has(code))
}

/**
 * Exige une session valide. Redirige vers la connexion sinon.
 * Utilisée par le layout applicatif et par toute action serveur protégée.
 *
 * Détourne également vers la définition du mot de passe personnel tant que le
 * mot de passe temporaire n'a pas été remplacé. Le contrôle est placé ici, et
 * non dans chaque page, pour qu'aucune route ni aucune action ne puisse
 * l'oublier : l'accès direct par URL aboutit au même détournement.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await requireSession()
  if (user.mustChangePassword) redirect(PASSWORD_CHANGE_PATH)
  return user
}

/**
 * Exige une session valide **sans** imposer le changement de mot de passe.
 *
 * Réservée à l'écran de changement lui-même et à son action : toute autre
 * utilisation rouvrirait le contournement que `requireUser` ferme.
 */
export async function requireSession(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/connexion')
  return user
}

/**
 * Erreur levée lorsqu'une action est refusée faute de permission.
 *
 * Le message reste volontairement non technique : il ne révèle ni structure de
 * données, ni détail interne (CLAUDE.md §43, Règles permissions §29).
 */
export class PermissionDeniedError extends Error {
  readonly code: PermissionCode

  constructor(code: PermissionCode) {
    super("Vous ne disposez pas des droits nécessaires pour effectuer cette action.")
    this.name = 'PermissionDeniedError'
    this.code = code
  }
}

/**
 * Exige une permission avant l'exécution d'une action sensible.
 *
 * À appeler au tout début de chaque Server Action et Route Handler protégé.
 * Ne jamais se reposer sur le masquage d'un bouton (§85).
 */
export async function requirePermission(code: PermissionCode): Promise<SessionUser> {
  const user = await requireUser()
  if (user.isSuperAdmin) return user

  const granted = await getPermissionCodes()
  if (!granted.has(code)) {
    throw new PermissionDeniedError(code)
  }

  return user
}

/**
 * Variante destinée aux pages : redirige vers l'écran « accès refusé »
 * au lieu de lever une erreur.
 */
export async function requirePermissionOrRedirect(code: PermissionCode): Promise<SessionUser> {
  const user = await requireUser()
  if (user.isSuperAdmin) return user

  const granted = await getPermissionCodes()
  if (!granted.has(code)) {
    redirect(`/acces-refuse?requis=${encodeURIComponent(code)}`)
  }

  return user
}

/**
 * Exige AU MOINS UNE des permissions citées.
 *
 * Réservée aux écrans qui rassemblent plusieurs sources sans rien montrer de
 * plus qu'elles : le calendrier (Module 03 §19) superpose échéances de tâches,
 * réunions et rendez-vous, et chaque couche exige ensuite SA lecture.
 *
 * CE N'EST PAS UN ASSOUPLISSEMENT. Aucune capacité n'en ouvre une autre : la
 * page s'ouvre à qui détient l'une d'elles, et n'affiche que la couche
 * correspondante — les autres sont NOMMÉES comme fermées (DEC-017, DEC-024).
 *
 * Le code cité en premier est celui que l'écran d'accès refusé annonce : c'est
 * la lecture la plus courante, donc la plus utile à demander.
 */
export async function requireAnyPermissionOrRedirect(
  codes: readonly PermissionCode[]
): Promise<SessionUser> {
  const user = await requireUser()
  if (user.isSuperAdmin) return user

  const granted = await getPermissionCodes()
  if (!codes.some((code) => granted.has(code))) {
    redirect(`/acces-refuse?requis=${encodeURIComponent(codes[0])}`)
  }

  return user
}
