'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { can, requirePermission, requireUser } from '@/lib/auth/dal'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PERMISSION_FIELD_PREFIX } from './constants'

/**
 * Actions du module Utilisateurs.
 *
 * Chaque action commence par une vérification de permission côté serveur. Le
 * masquage d'un bouton n'est jamais une protection : une action appelée
 * directement doit être refusée de la même manière
 * (05_Regles_Metier/05_Permissions.md §50 et §85).
 *
 * RÈGLE ABSOLUE SUR LE MOT DE PASSE INITIAL
 * Il ne doit jamais être : journalisé dans l'audit, affiché dans une fiche,
 * renvoyé au client après création, écrit dans un log, ni versionné.
 * Il ne quitte donc jamais cette couche : il est transmis à Supabase Auth puis
 * abandonné. Aucun état retourné ne le contient, et il n'est écrit dans aucune
 * table métier — `app_users` ne comporte d'ailleurs aucune colonne de mot de
 * passe (Module 08 §41).
 */

const PASSWORD_MIN_LENGTH = 8

export type UserFormState = {
  error?: string
  success?: string
  fieldErrors?: Record<string, string | undefined>
}

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Le nom d’utilisateur doit contenir au moins 3 caractères.')
  .max(48, 'Le nom d’utilisateur est trop long.')
  .regex(
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/,
    'Lettres, chiffres, point, tiret et souligné uniquement.'
  )

const identitySchema = {
  firstName: z.string().trim().min(1, 'Le prénom est obligatoire.').max(80),
  lastName: z.string().trim().min(1, 'Le nom est obligatoire.').max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'L’email professionnel est obligatoire.')
    .email('Cette adresse email n’est pas valide.'),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  jobTitle: z.string().trim().max(120).optional().or(z.literal('')),
  managerId: z.string().uuid().optional().or(z.literal('')),
  hiredOn: z.string().optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}

const createSchema = z.object({
  ...identitySchema,
  username: usernameSchema,
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
    ),
})

const updateSchema = z.object({
  ...identitySchema,
  username: usernameSchema,
})

/** Convertit les erreurs zod en messages rattachés à chaque champ. */
function toFieldErrors(error: z.ZodError): Record<string, string | undefined> {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>
  return Object.fromEntries(
    Object.entries(flat).map(([key, messages]) => [key, messages?.[0]])
  )
}

/** Valeur exploitable ou `null` : évite d'enregistrer des chaînes vides. */
function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function readMultiple(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === 'string')
}

/**
 * Traduit une erreur de base en message compréhensible.
 * N'expose jamais la structure interne ni le détail technique (CLAUDE.md §43).
 */
function friendlyError(message: string): string {
  if (/app_users_username_unique_idx|username/i.test(message)) {
    return 'Ce nom d’utilisateur est déjà attribué.'
  }
  if (/app_users_email_unique_idx|email/i.test(message)) {
    return 'Cette adresse email est déjà utilisée par un autre compte.'
  }
  if (/row-level security|insufficient_privilege|permission denied/i.test(message)) {
    return 'Vous ne disposez pas des droits nécessaires pour cette opération.'
  }
  if (/Super Admin/i.test(message)) return message
  return 'L’opération n’a pas pu être effectuée. Veuillez vérifier les informations saisies.'
}

/**
 * Exécute une action de formulaire sans jamais laisser une exception atteindre
 * le client : celui-ci verrait un écran d'erreur générique et perdrait sa
 * saisie. L'exception est journalisée côté serveur, l'utilisateur reçoit un
 * message fonctionnel (CLAUDE.md §38 et §43).
 */
async function guarded<T extends { error?: string }>(
  scope: string,
  run: () => Promise<T>
): Promise<T | { error: string }> {
  try {
    return await run()
  } catch (error) {
    // `redirect()` et `notFound()` communiquent par exception : elles doivent
    // remonter intactes, sinon la navigation ne se produit jamais.
    if (error && typeof error === 'object' && 'digest' in error) throw error
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[utilisateurs] ${scope} : ${message}`)
    return { error: friendlyError(message) }
  }
}

/* -------------------------------------------------------------------------- */
/*  Création                                                                   */
/* -------------------------------------------------------------------------- */

export async function createUserAction(
  prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  return guarded('création', () => createUserInner(prevState, formData))
}

async function createUserInner(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await requirePermission(PERMISSIONS.USERS_CREATE)

  // Dans le périmètre MVP, seul le Super Admin crée des utilisateurs
  // (Module 08 §5 et §6). La policy RLS l'impose déjà ; le contrôle est répété
  // ici pour éviter de créer un compte d'authentification qui ne pourrait pas
  // recevoir de profil.
  if (!actor.isSuperAdmin) {
    return { error: 'Seul le Super Admin peut créer un utilisateur.' }
  }

  const parsed = createSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    username: formData.get('username'),
    email: formData.get('email'),
    password: formData.get('password'),
    phone: formData.get('phone'),
    jobTitle: formData.get('jobTitle'),
    managerId: formData.get('managerId'),
    hiredOn: formData.get('hiredOn'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) }
  }

  const input = parsed.data
  const admin = createSupabaseAdminClient()

  // 1. Compte d'authentification. Le mot de passe temporaire, généré dans le
  //    navigateur de l'administrateur, est transmis à Supabase Auth et n'est
  //    conservé nulle part ailleurs : ni journalisé, ni renvoyé, ni stocké.
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  })

  if (authError || !created.user) {
    return {
      error: /already|exists|registered/i.test(authError?.message ?? '')
        ? 'Cette adresse email est déjà utilisée par un autre compte.'
        : 'Le compte n’a pas pu être créé. Veuillez vérifier les informations saisies.',
    }
  }

  const userId = created.user.id

  // 2. Profil interne, inséré avec la session de l'appelant : RLS reste la
  //    barrière de contrôle.
  const supabase = await createSupabaseServerClient()
  const { error: profileError } = await supabase.from('app_users').insert({
    id: userId,
    first_name: input.firstName,
    last_name: input.lastName,
    username: input.username,
    email: input.email,
    phone: orNull(input.phone),
    job_title: orNull(input.jobTitle),
    manager_id: orNull(input.managerId),
    hired_on: orNull(input.hiredOn),
    notes: orNull(input.notes),
    status: 'ACTIVE',
    created_by: actor.id,
    // Le mot de passe remis à la création est temporaire : son titulaire devra
    // le remplacer avant d'accéder à la moindre fonctionnalité métier.
    must_change_password: true,
  })

  if (profileError) {
    // Le profil n'a pas pu être créé : le compte d'authentification est retiré
    // afin de ne pas laisser un compte orphelin capable de se connecter sans
    // profil ni permissions.
    await admin.auth.admin.deleteUser(userId)
    return { error: friendlyError(profileError.message) }
  }

  const assignmentError = await syncAssignments(userId, formData)
  if (assignmentError) return { error: assignmentError }

  revalidatePath('/utilisateurs')
  redirect(`/utilisateurs/${userId}?cree=1`)
}

/* -------------------------------------------------------------------------- */
/*  Modification                                                               */
/* -------------------------------------------------------------------------- */

export async function updateUserAction(
  prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  return guarded('modification', () => updateUserInner(prevState, formData))
}

async function updateUserInner(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  await requirePermission(PERMISSIONS.USERS_UPDATE)

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Utilisateur introuvable.' }

  const parsed = updateSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    username: formData.get('username'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    jobTitle: formData.get('jobTitle'),
    managerId: formData.get('managerId'),
    hiredOn: formData.get('hiredOn'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) }
  }

  const input = parsed.data
  const supabase = await createSupabaseServerClient()

  const { data: existing } = await supabase
    .from('app_users')
    .select('email')
    .eq('id', userId)
    .maybeSingle()

  const { error } = await supabase
    .from('app_users')
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      username: input.username,
      email: input.email,
      phone: orNull(input.phone),
      job_title: orNull(input.jobTitle),
      manager_id: orNull(input.managerId),
      hired_on: orNull(input.hiredOn),
      notes: orNull(input.notes),
    })
    .eq('id', userId)

  if (error) return { error: friendlyError(error.message) }

  // L'email de la fiche sert à retrouver le compte d'authentification lors de
  // la connexion : les deux doivent rester synchronisés, sinon l'utilisateur
  // ne pourrait plus se connecter.
  if (existing && existing.email !== input.email) {
    const admin = createSupabaseAdminClient()
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      email: input.email,
    })

    if (authError) {
      // Retour à l'état antérieur plutôt que de laisser fiche et compte
      // d'authentification divergents.
      await supabase.from('app_users').update({ email: existing.email }).eq('id', userId)
      return { error: 'Cette adresse email est déjà utilisée par un autre compte.' }
    }
  }

  const assignmentError = await syncAssignments(userId, formData)
  if (assignmentError) return { error: assignmentError }

  revalidatePath('/utilisateurs')
  revalidatePath(`/utilisateurs/${userId}`)
  return { success: 'Les informations ont été enregistrées.' }
}

/* -------------------------------------------------------------------------- */
/*  Départements et groupes                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Aligne les rattachements sur les cases cochées.
 *
 * Les départements relèvent de `users.users.update`. Les groupes déterminent
 * des droits : leur modification exige `users.users.permissions.update`
 * (05_Regles_Metier/05_Permissions.md §24). Sans cette permission, les groupes
 * sont laissés inchangés plutôt que d'échouer bruyamment.
 */
async function syncAssignments(userId: string, formData: FormData): Promise<string | null> {
  const supabase = await createSupabaseServerClient()

  const departmentIds = readMultiple(formData, 'departmentIds')
  await supabase.from('user_departments').delete().eq('user_id', userId)

  if (departmentIds.length > 0) {
    const { error } = await supabase.from('user_departments').insert(
      departmentIds.map((departmentId, index) => ({
        user_id: userId,
        department_id: departmentId,
        is_primary: index === 0,
      }))
    )
    if (error) return friendlyError(error.message)
  }

  if (!(await can(PERMISSIONS.USER_PERMISSIONS_UPDATE))) return null

  const groupIds = readMultiple(formData, 'groupIds')
  await supabase.from('user_groups').delete().eq('user_id', userId)

  if (groupIds.length > 0) {
    const { error } = await supabase
      .from('user_groups')
      .insert(groupIds.map((groupId) => ({ user_id: userId, group_id: groupId })))
    if (error) return friendlyError(error.message)
  }

  return null
}

/* -------------------------------------------------------------------------- */
/*  Statut                                                                     */
/* -------------------------------------------------------------------------- */

const STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED'] as const

export async function setUserStatusAction(
  prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  return guarded('statut', () => setUserStatusInner(prevState, formData))
}

async function setUserStatusInner(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await requirePermission(PERMISSIONS.USERS_ARCHIVE)

  const userId = String(formData.get('userId') ?? '')
  const status = String(formData.get('status') ?? '')
  const reason = orNull(String(formData.get('reason') ?? ''))

  if (!userId || !STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) {
    return { error: 'Opération invalide.' }
  }

  // Un utilisateur ne modifie pas le statut de son propre compte. La base
  // l'interdit également ; le contrôle est fait ici pour renvoyer un message
  // clair plutôt qu'une erreur technique.
  if (userId === actor.id) {
    return { error: 'Vous ne pouvez pas modifier le statut de votre propre compte.' }
  }

  const supabase = await createSupabaseServerClient()
  const becomingInactive = status !== 'ACTIVE'

  const { error } = await supabase
    .from('app_users')
    .update({
      status,
      deactivated_at: becomingInactive ? new Date().toISOString() : null,
      deactivated_by: becomingInactive ? actor.id : null,
      // Le motif appartient au journal d'audit, pas aux notes de la fiche :
      // l'y écrire écraserait les observations saisies sur l'employé.
    })
    .eq('id', userId)

  if (error) return { error: friendlyError(error.message) }

  // Le changement de statut est déjà journalisé par le trigger d'audit ; le
  // motif est ajouté comme événement distinct pour rester explicite.
  if (reason) {
    await supabase.rpc('log_audit', {
      p_action: 'STATUS_CHANGE',
      p_entity_type: 'app_users',
      p_entity_id: userId,
      p_module_code: 'users',
      p_reason: reason,
    })
  }

  revalidatePath('/utilisateurs')
  revalidatePath(`/utilisateurs/${userId}`)
  return { success: 'Le statut a été mis à jour.' }
}

/* -------------------------------------------------------------------------- */
/*  Permissions individuelles                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Applique les règles individuelles d'un utilisateur.
 *
 * Seule la table `user_permissions` est touchée : l'héritage reste défini par
 * les groupes (Module 08 §46). Trois états sont possibles pour chaque
 * permission — `ALLOW`, `DENY`, ou aucune règle, ce qui laisse l'héritage
 * s'appliquer.
 *
 * Barrières successives, aucune n'étant supprimée au profit d'une autre :
 *   1. `requirePermission` refuse l'appel sans `users.users.permissions.update`,
 *      y compris lorsqu'il est émis directement, sans passer par l'interface ;
 *   2. le client porteur de la session soumet l'écriture aux policies RLS ;
 *   3. le trigger `user_permissions_no_self_change` interdit en base qu'un
 *      utilisateur modifie ses propres droits ;
 *   4. le trigger d'audit journalise chaque changement en `PERMISSION_CHANGE`,
 *      avec l'état avant et après.
 */
export async function updateUserPermissionsAction(
  prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  return guarded('permissions', () => updateUserPermissionsInner(prevState, formData))
}

async function updateUserPermissionsInner(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await requirePermission(PERMISSIONS.USER_PERMISSIONS_UPDATE)

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Utilisateur introuvable.' }

  // Contrôlé aussi en base ; répété ici pour renvoyer un message clair plutôt
  // qu'une erreur technique (05_Regles_Metier/05_Permissions.md §42).
  if (userId === actor.id) {
    return { error: 'Vous ne pouvez pas modifier vos propres droits d’accès.' }
  }

  const supabase = await createSupabaseServerClient()

  const { data: target, error: targetError } = await supabase
    .from('app_users')
    .select('is_super_admin')
    .eq('id', userId)
    .maybeSingle()

  if (targetError) return { error: friendlyError(targetError.message) }
  if (!target) return { error: 'Utilisateur introuvable.' }

  // Le Super Admin tient ses droits du rôle système : une règle individuelle
  // n'aurait aucun effet et laisserait croire à une restriction inexistante.
  if (target.is_super_admin) {
    return {
      error:
        'Ce compte détient le rôle Super Admin : ses droits ne dépendent pas des permissions individuelles.',
    }
  }

  // Le formulaire soumet un choix par permission du catalogue ; on ne retient
  // que les codes réellement existants pour ignorer toute valeur injectée.
  const { data: catalog, error: catalogError } = await supabase
    .from('permissions')
    .select('id, code')

  if (catalogError) return { error: friendlyError(catalogError.message) }

  const { data: current, error: currentError } = await supabase
    .from('user_permissions')
    .select('permission_id, effect')
    .eq('user_id', userId)

  if (currentError) return { error: friendlyError(currentError.message) }

  const existing = new Map((current ?? []).map((row) => [row.permission_id, row.effect as string]))

  const toUpsert: { user_id: string; permission_id: string; effect: string; granted_by: string }[] =
    []
  const toDelete: string[] = []

  for (const permission of catalog ?? []) {
    const raw = formData.get(`${PERMISSION_FIELD_PREFIX}${permission.code}`)
    // Une permission absente du formulaire n'est pas une permission effacée :
    // seule une valeur explicite est prise en compte.
    if (typeof raw !== 'string') continue

    const choice = raw === 'ALLOW' || raw === 'DENY' ? raw : 'INHERIT'
    const before = existing.get(permission.id) ?? null

    if (choice === 'INHERIT') {
      if (before !== null) toDelete.push(permission.id)
      continue
    }

    if (before !== choice) {
      toUpsert.push({
        user_id: userId,
        permission_id: permission.id,
        effect: choice,
        granted_by: actor.id,
      })
    }
  }

  if (toUpsert.length === 0 && toDelete.length === 0) {
    return { success: 'Aucune modification à enregistrer.' }
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      .in('permission_id', toDelete)

    if (error) return { error: friendlyError(error.message) }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from('user_permissions')
      .upsert(toUpsert, { onConflict: 'user_id,permission_id' })

    if (error) return { error: friendlyError(error.message) }
  }

  revalidatePath(`/utilisateurs/${userId}`)
  revalidatePath('/utilisateurs')

  const changed = toUpsert.length + toDelete.length
  return {
    success: `${changed} permission${changed > 1 ? 's' : ''} mise${changed > 1 ? 's' : ''} à jour.`,
  }
}

/** Garde utilisée par les pages : redirige plutôt que de lever une erreur. */
export async function ensureCanViewUsers() {
  await requireUser()
}
