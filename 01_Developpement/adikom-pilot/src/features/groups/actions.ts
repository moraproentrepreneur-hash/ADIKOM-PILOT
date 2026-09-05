'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PERMISSION_FIELD_PREFIX } from '@/features/users/constants'

/**
 * Actions du module Groupes — Module 08 §28, §29, §30, §52.
 *
 * Chaque action commence par une vérification de capacité côté serveur. Le
 * masquage d'un bouton n'est jamais une protection : une action appelée
 * directement doit être refusée de la même manière
 * (05_Regles_Metier/05_Permissions.md §50 et §85).
 *
 * QUATRE ACTES, QUATRE CAPACITÉS, ET AUCUNE N'EN OUVRE UNE AUTRE (DEC-024) :
 *
 *   créer un groupe                    → `users.groups.create`
 *   modifier son nom ou sa description → `users.groups.update`
 *   l'activer, le désactiver, le supprimer → `users.groups.archive`
 *   changer ses permissions            → `users.groups.permissions.update`
 *   changer ses membres                → `users.users.permissions.update`
 *
 * La dernière n'est pas une exception : affecter quelqu'un à un groupe modifie
 * SES droits, et c'est déjà la capacité que la policy `user_groups_write`
 * exige depuis la migration 006.
 *
 * Les gardes de la base restent la barrière décisive : `fn_group_write_guard`
 * refuse une désactivation sans `.archive` même par appel direct, et
 * `group_permissions_no_self_change` interdit à quiconque de modifier les
 * permissions d'un groupe dont il est membre.
 */

export type GroupFormState = {
  error?: string
  success?: string
  fieldErrors?: Record<string, string | undefined>
}

const groupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Le nom du groupe est obligatoire.')
    .max(80, 'Le nom du groupe est trop long.'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
})

function toFieldErrors(error: z.ZodError): Record<string, string | undefined> {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>
  return Object.fromEntries(Object.entries(flat).map(([key, messages]) => [key, messages?.[0]]))
}

function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Traduit une erreur de base en message compréhensible.
 * N'expose jamais la structure interne ni le détail technique (CLAUDE.md §43).
 */
function friendlyError(message: string): string {
  if (/groupe système/i.test(message)) return message
  if (/dont il est membre/i.test(message)) {
    return 'Vous appartenez à ce groupe : ses permissions ne peuvent pas être modifiées par vous-même. Retirez-vous du groupe, ou faites-le modifier par un autre administrateur.'
  }
  if (/utilisateur\(s\) et ne peut pas être supprimé/i.test(message)) return message
  if (/Droit insuffisant/i.test(message)) return message
  if (/groups_code_key|code/i.test(message) && /duplicate|unique/i.test(message)) {
    return 'Un groupe portant un nom très proche existe déjà. Choisissez un nom distinct.'
  }
  if (/duplicate key|unique/i.test(message)) {
    return 'Cette valeur est déjà utilisée par un autre groupe.'
  }
  if (/row-level security|insufficient_privilege|permission denied/i.test(message)) {
    return 'Vous ne disposez pas des droits nécessaires pour cette opération.'
  }
  return 'L’opération n’a pas pu être effectuée. Veuillez vérifier les informations saisies.'
}

/**
 * Exécute une action de formulaire sans jamais laisser une exception atteindre
 * le client : celui-ci verrait un écran d'erreur générique et perdrait sa
 * saisie (CLAUDE.md §38 et §43).
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
    console.error(`[groupes] ${scope} : ${message}`)
    return { error: friendlyError(message) }
  }
}

/**
 * Code stable dérivé du nom, à la création seulement.
 *
 * Le code IDENTIFIE le groupe : il se retrouve dans un export, une reprise de
 * données, un journal d'audit. Le renommer ferait perdre la trace de ce qui l'a
 * précédé — `fn_group_write_guard` l'interdit d'ailleurs en base. Le nom, lui,
 * se corrige librement.
 */
function toCode(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)

  return base || 'GROUPE'
}

/* -------------------------------------------------------------------------- */
/*  Création                                                                   */
/* -------------------------------------------------------------------------- */

export async function createGroupAction(
  prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  return guarded('création', () => createGroupInner(prevState, formData))
}

async function createGroupInner(
  _prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  const actor = await requirePermission(PERMISSIONS.GROUPS_CREATE)

  const parsed = groupSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
    sortOrder: formData.get('sortOrder') || undefined,
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const input = parsed.data
  const supabase = await createSupabaseServerClient()

  // Le code se dérive du nom, et se suffixe s'il est déjà pris. La base porte
  // la contrainte d'unicité : la boucle évite seulement un échec inutile.
  const root = toCode(input.name)
  let code = root

  const { data: taken, error: takenError } = await supabase
    .from('groups')
    .select('code')
    .like('code', `${root}%`)

  if (takenError) return { error: friendlyError(takenError.message) }

  const existing = new Set((taken ?? []).map((row) => row.code))
  for (let suffix = 2; existing.has(code) && suffix < 100; suffix += 1) {
    code = `${root}_${suffix}`
  }

  const { data: created, error } = await supabase
    .from('groups')
    .insert({
      code,
      name: input.name,
      description: orNull(input.description),
      sort_order: input.sortOrder ?? 0,
      is_active: true,
      created_by: actor.id,
    })
    .select('id')
    .single()

  if (error) return { error: friendlyError(error.message) }

  revalidatePath('/utilisateurs/groupes')
  redirect(`/utilisateurs/groupes/${created.id}?cree=1`)
}

/* -------------------------------------------------------------------------- */
/*  Modification                                                               */
/* -------------------------------------------------------------------------- */

export async function updateGroupAction(
  prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  return guarded('modification', () => updateGroupInner(prevState, formData))
}

async function updateGroupInner(
  _prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  await requirePermission(PERMISSIONS.GROUPS_UPDATE)

  const groupId = String(formData.get('groupId') ?? '')
  if (!groupId) return { error: 'Groupe introuvable.' }

  const parsed = groupSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
    sortOrder: formData.get('sortOrder') || undefined,
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const input = parsed.data
  const supabase = await createSupabaseServerClient()

  // Ni `code`, ni `is_system`, ni `is_active` : le premier identifie, le
  // deuxième est une propriété du système, le troisième relève de `.archive`.
  const { error, count } = await supabase
    .from('groups')
    .update(
      {
        name: input.name,
        description: orNull(input.description),
        sort_order: input.sortOrder ?? 0,
      },
      { count: 'exact' }
    )
    .eq('id', groupId)

  if (error) return { error: friendlyError(error.message) }
  if (!count) return { error: 'Groupe introuvable ou modification refusée.' }

  revalidatePath('/utilisateurs/groupes')
  revalidatePath(`/utilisateurs/groupes/${groupId}`)
  return { success: 'Le groupe a été enregistré.' }
}

/* -------------------------------------------------------------------------- */
/*  Activation, désactivation, suppression                                     */
/* -------------------------------------------------------------------------- */

/**
 * Désactiver un groupe retire d'un seul geste leurs droits hérités à tous ses
 * membres : le catalogue range donc cet acte avec la suppression, sous
 * `users.groups.archive`. Le déclencheur `groups_write_guard` l'exige aussi en
 * base, y compris pour un `PATCH` direct.
 */
export async function setGroupActiveAction(
  prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  return guarded('activation', () => setGroupActiveInner(prevState, formData))
}

async function setGroupActiveInner(
  _prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  await requirePermission(PERMISSIONS.GROUPS_ARCHIVE)

  const groupId = String(formData.get('groupId') ?? '')
  const active = String(formData.get('active') ?? '') === '1'
  if (!groupId) return { error: 'Groupe introuvable.' }

  const supabase = await createSupabaseServerClient()
  const { error, count } = await supabase
    .from('groups')
    .update({ is_active: active }, { count: 'exact' })
    .eq('id', groupId)

  if (error) return { error: friendlyError(error.message) }
  if (!count) return { error: 'Groupe introuvable ou opération refusée.' }

  revalidatePath('/utilisateurs/groupes')
  revalidatePath(`/utilisateurs/groupes/${groupId}`)
  return {
    success: active
      ? 'Le groupe est de nouveau actif : ses permissions s’appliquent à ses membres.'
      : 'Le groupe est désactivé : ses permissions ne s’appliquent plus à ses membres.',
  }
}

/**
 * Suppression définitive.
 *
 * Réservée aux groupes SANS membre et NON système : `fn_protect_group_deletion`
 * (migration 002) refuse les autres, et le message de la base est repris tel
 * quel — il dit exactement ce qui bloque (Module 08 §52).
 *
 * La désactivation reste l'issue recommandée (CLAUDE.md §22) : elle conserve la
 * configuration du groupe et se rétablit.
 */
export async function deleteGroupAction(
  prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  return guarded('suppression', () => deleteGroupInner(prevState, formData))
}

async function deleteGroupInner(
  _prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  await requirePermission(PERMISSIONS.GROUPS_ARCHIVE)

  const groupId = String(formData.get('groupId') ?? '')
  if (!groupId) return { error: 'Groupe introuvable.' }

  const supabase = await createSupabaseServerClient()

  const { error, count } = await supabase
    .from('groups')
    .delete({ count: 'exact' })
    .eq('id', groupId)

  if (error) return { error: friendlyError(error.message) }
  if (!count) return { error: 'Groupe introuvable ou suppression refusée.' }

  revalidatePath('/utilisateurs/groupes')
  redirect('/utilisateurs/groupes?supprime=1')
}

/* -------------------------------------------------------------------------- */
/*  Membres                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Aligne les membres du groupe sur les cases cochées.
 *
 * L'appartenance à un groupe DÉTERMINE des droits : la capacité exigée est
 * `users.users.permissions.update`, celle-là même que la policy
 * `user_groups_write` réclame depuis la migration 006
 * (05_Regles_Metier/05_Permissions.md §24).
 *
 * Le déclencheur `user_groups_no_self_change` interdit par ailleurs à
 * l'appelant de s'ajouter ou de se retirer lui-même : la sélection le
 * concernant est donc laissée telle quelle plutôt que d'échouer bruyamment.
 */
export async function updateGroupMembersAction(
  prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  return guarded('membres', () => updateGroupMembersInner(prevState, formData))
}

async function updateGroupMembersInner(
  _prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  const actor = await requirePermission(PERMISSIONS.USER_PERMISSIONS_UPDATE)

  const groupId = String(formData.get('groupId') ?? '')
  if (!groupId) return { error: 'Groupe introuvable.' }

  const selected = new Set(
    formData.getAll('memberIds').filter((value): value is string => typeof value === 'string')
  )

  const supabase = await createSupabaseServerClient()

  const { data: current, error: currentError } = await supabase
    .from('user_groups')
    .select('user_id')
    .eq('group_id', groupId)

  if (currentError) return { error: friendlyError(currentError.message) }

  const existing = new Set((current ?? []).map((row) => row.user_id))

  // Nul ne modifie sa propre appartenance : la base le refuse, l'interface ne
  // le propose pas, et l'action l'écarte pour renvoyer un message clair plutôt
  // qu'une erreur technique.
  const toAdd = [...selected].filter((id) => !existing.has(id) && id !== actor.id)
  const toRemove = [...existing].filter((id) => !selected.has(id) && id !== actor.id)

  if (toAdd.length === 0 && toRemove.length === 0) {
    return { success: 'Aucune modification à enregistrer.' }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('user_groups')
      .delete()
      .eq('group_id', groupId)
      .in('user_id', toRemove)

    if (error) return { error: friendlyError(error.message) }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('user_groups')
      .insert(toAdd.map((userId) => ({ user_id: userId, group_id: groupId, assigned_by: actor.id })))

    if (error) return { error: friendlyError(error.message) }
  }

  revalidatePath('/utilisateurs/groupes')
  revalidatePath(`/utilisateurs/groupes/${groupId}`)
  revalidatePath('/utilisateurs')

  const changed = toAdd.length + toRemove.length
  return {
    success: `${changed} appartenance${changed > 1 ? 's' : ''} mise${changed > 1 ? 's' : ''} à jour.`,
  }
}

/* -------------------------------------------------------------------------- */
/*  Permissions du groupe                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Applique les règles de permission du groupe.
 *
 * Trois états par permission — `ALLOW`, `DENY`, ou aucune règle. Un `DENY` de
 * groupe prime sur toute autorisation, y compris individuelle (DEC-009) : c'est
 * le geste le plus lourd de l'écran, et l'interface le dit.
 *
 * Barrières successives, aucune n'étant supprimée au profit d'une autre :
 *   1. `requirePermission` refuse l'appel sans `users.groups.permissions.update`,
 *      y compris lorsqu'il est émis directement, sans passer par l'interface ;
 *   2. le client porteur de la session soumet l'écriture aux policies RLS ;
 *   3. le déclencheur `group_permissions_no_self_change` interdit en base qu'un
 *      membre modifie les droits de SON groupe ;
 *   4. le déclencheur d'audit journalise chaque changement en
 *      `PERMISSION_CHANGE`, avec l'état avant et après.
 */
export async function updateGroupPermissionsAction(
  prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  return guarded('permissions', () => updateGroupPermissionsInner(prevState, formData))
}

async function updateGroupPermissionsInner(
  _prevState: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  const actor = await requirePermission(PERMISSIONS.GROUP_PERMISSIONS_UPDATE)

  const groupId = String(formData.get('groupId') ?? '')
  if (!groupId) return { error: 'Groupe introuvable.' }

  const supabase = await createSupabaseServerClient()

  // Contrôlé aussi en base ; répété ici pour renvoyer un message clair plutôt
  // qu'une erreur technique (05_Regles_Metier/05_Permissions.md §42).
  const { data: membership, error: membershipError } = await supabase
    .from('user_groups')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', actor.id)
    .maybeSingle()

  if (membershipError) return { error: friendlyError(membershipError.message) }
  if (membership) {
    return {
      error:
        'Vous appartenez à ce groupe : ses permissions ne peuvent pas être modifiées par vous-même. Retirez-vous du groupe, ou faites-le modifier par un autre administrateur.',
    }
  }

  // Le formulaire soumet un choix par permission du catalogue ; on ne retient
  // que les codes réellement existants pour ignorer toute valeur injectée.
  const { data: catalog, error: catalogError } = await supabase
    .from('permissions')
    .select('id, code')

  if (catalogError) return { error: friendlyError(catalogError.message) }

  const { data: current, error: currentError } = await supabase
    .from('group_permissions')
    .select('permission_id, effect')
    .eq('group_id', groupId)

  if (currentError) return { error: friendlyError(currentError.message) }

  const existing = new Map((current ?? []).map((row) => [row.permission_id, row.effect as string]))

  const toUpsert: {
    group_id: string
    permission_id: string
    effect: string
    granted_by: string
  }[] = []
  const toDelete: string[] = []

  for (const permission of catalog ?? []) {
    const raw = formData.get(`${PERMISSION_FIELD_PREFIX}${permission.code}`)
    // Une permission absente du formulaire n'est pas une permission effacée :
    // seule une valeur explicite est prise en compte.
    if (typeof raw !== 'string') continue

    const choice = raw === 'ALLOW' || raw === 'DENY' ? raw : 'NONE'
    const before = existing.get(permission.id) ?? null

    if (choice === 'NONE') {
      if (before !== null) toDelete.push(permission.id)
      continue
    }

    if (before !== choice) {
      toUpsert.push({
        group_id: groupId,
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
      .from('group_permissions')
      .delete()
      .eq('group_id', groupId)
      .in('permission_id', toDelete)

    if (error) return { error: friendlyError(error.message) }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from('group_permissions')
      .upsert(toUpsert, { onConflict: 'group_id,permission_id' })

    if (error) return { error: friendlyError(error.message) }
  }

  revalidatePath(`/utilisateurs/groupes/${groupId}`)
  revalidatePath('/utilisateurs/groupes')
  // Les droits effectifs de tous les membres viennent de changer.
  revalidatePath('/utilisateurs')

  const changed = toUpsert.length + toDelete.length
  return {
    success: `${changed} permission${changed > 1 ? 's' : ''} mise${changed > 1 ? 's' : ''} à jour pour ce groupe.`,
  }
}
