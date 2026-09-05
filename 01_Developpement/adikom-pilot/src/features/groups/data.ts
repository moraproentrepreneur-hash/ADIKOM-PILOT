import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ACTION_LABELS, type PermissionAction } from '@/lib/auth/permissions'
import type { PermissionEffect, UserStatus } from '@/features/users/constants'

/**
 * Accès aux données du module Groupes — Module 08 §27 à §32, §52.
 *
 * `server-only` : ces fonctions ne peuvent pas être importées par un composant
 * client. Aucune requête n'est privilégiée : tout passe par le client serveur
 * porteur de la session, donc soumis à RLS.
 *
 * DEUX LECTURES PASSENT PAR UNE FONCTION, ET C'EST DÉLIBÉRÉ.
 *
 * `user_groups` n'est lisible qu'avec `users.users.view` : un administrateur
 * des groupes qui ne consulte pas les utilisateurs lirait « 0 membre » partout.
 * Le décompte du §29 vient donc de `groups_member_counts()`, qui exige
 * `users.groups.view` — la capacité qui ouvre précisément cette liste. Les NOMS
 * des membres, eux, restent derrière `users.users.view`, et l'écran NOMME cette
 * absence plutôt que d'afficher une liste vide (DEC-017).
 */

export type GroupListItem = {
  id: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  isSystem: boolean
  createdAt: string
  /** `null` : le décompte n'a pas pu être établi (capacité manquante). */
  memberCount: number | null
  activeMemberCount: number | null
  allowCount: number
  denyCount: number
}

export type GroupDetail = GroupListItem & {
  sortOrder: number
  updatedAt: string
}

/**
 * Membres d'un groupe.
 *
 * `readable` distingue « ce groupe n'a aucun membre » de « je n'ai pas le droit
 * de savoir qui en est ». Confondre les deux ferait retirer un groupe qu'on
 * croirait vide.
 */
export type GroupMember = {
  id: string
  fullName: string
  username: string
  jobTitle: string | null
  status: UserStatus
  isSuperAdmin: boolean
}

export type GroupMembership = {
  readable: boolean
  members: GroupMember[]
}

function reportQueryFailure(scope: string, error: { code?: string; message: string }): never {
  console.error(`[groupes] ${scope} : ${error.code ?? 'ERREUR'} ${error.message}`)
  throw new Error("Les données des groupes n'ont pas pu être chargées.")
}

type RawGroupRow = {
  id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
  is_system: boolean
  created_at: string
}

/**
 * Décomptes par groupe : membres d'un côté, règles de permission de l'autre.
 *
 * Rien n'est stocké — ni effectif, ni total de permissions. Un compteur tenu
 * par déclencheur serait faux au premier oubli, et un total faux fait autorité
 * plus longtemps qu'un total absent (DEC-034 §a).
 */
async function loadCounts(): Promise<{
  members: Map<string, { total: number; active: number }> | null
  rules: Map<string, { allow: number; deny: number }>
}> {
  const supabase = await createSupabaseServerClient()

  const [countsResult, rulesResult] = await Promise.all([
    supabase.rpc('groups_member_counts'),
    supabase.from('group_permissions').select('group_id, effect'),
  ])

  // Un refus de `groups_member_counts` est un cas fonctionnel attendu : la
  // colonne affichera « — » et l'écran dira pourquoi.
  const members = countsResult.error
    ? null
    : new Map(
        ((countsResult.data ?? []) as {
          group_id: string
          member_count: number
          active_count: number
        }[]).map((row) => [row.group_id, { total: row.member_count, active: row.active_count }])
      )

  if (rulesResult.error) reportQueryFailure('règles de permission', rulesResult.error)

  const rules = new Map<string, { allow: number; deny: number }>()
  for (const row of rulesResult.data ?? []) {
    const current = rules.get(row.group_id) ?? { allow: 0, deny: 0 }
    if (row.effect === 'DENY') current.deny += 1
    else current.allow += 1
    rules.set(row.group_id, current)
  }

  return { members, rules }
}

function toListItem(
  row: RawGroupRow,
  members: Map<string, { total: number; active: number }> | null,
  rules: Map<string, { allow: number; deny: number }>
): GroupListItem {
  const count = members?.get(row.id)
  const rule = rules.get(row.id) ?? { allow: 0, deny: 0 }

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    isSystem: row.is_system,
    createdAt: row.created_at,
    memberCount: members ? (count?.total ?? 0) : null,
    activeMemberCount: members ? (count?.active ?? 0) : null,
    allowCount: rule.allow,
    denyCount: rule.deny,
  }
}

export type GroupFilters = {
  search?: string
  status?: 'ACTIVE' | 'INACTIVE' | ''
}

/** Échappe les caractères ayant une signification dans un filtre PostgREST. */
function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export async function listGroups(filters: GroupFilters = {}): Promise<GroupListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('groups')
    .select('id, code, name, description, is_active, is_system, created_at')

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or([`name.ilike.%${search}%`, `description.ilike.%${search}%`].join(','))
  }

  if (filters.status === 'ACTIVE') query = query.eq('is_active', true)
  if (filters.status === 'INACTIVE') query = query.eq('is_active', false)

  const [{ data, error }, counts] = await Promise.all([
    query.order('sort_order').order('name'),
    loadCounts(),
  ])

  if (error) reportQueryFailure('liste', error)

  return ((data ?? []) as RawGroupRow[]).map((row) =>
    toListItem(row, counts.members, counts.rules)
  )
}

export async function getGroupDetail(id: string): Promise<GroupDetail | null> {
  const supabase = await createSupabaseServerClient()

  const [{ data, error }, counts] = await Promise.all([
    supabase
      .from('groups')
      .select(
        'id, code, name, description, is_active, is_system, sort_order, created_at, updated_at'
      )
      .eq('id', id)
      .maybeSingle(),
    loadCounts(),
  ])

  // Une ligne absente est un cas fonctionnel légitime (404) ; une erreur de
  // requête ne l'est pas et doit rester visible.
  if (error) reportQueryFailure('fiche', error)
  if (!data) return null

  const row = data as RawGroupRow & { sort_order: number; updated_at: string }

  return {
    ...toListItem(row, counts.members, counts.rules),
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  }
}

/**
 * Membres du groupe.
 *
 * DEUX SILENCES À NE PAS CONFONDRE.
 *
 * `user_groups` n'est lisible qu'avec `users.users.view` : sans elle, la
 * requête ne LÈVE pas, elle rend zéro ligne — exactement comme un groupe
 * réellement vide. Le décompte servi par `groups_member_counts()` sert donc de
 * témoin : s'il annonce des membres que la lecture ne rend pas, c'est qu'ils
 * sont masqués, et l'écran le DIT (DEC-017).
 *
 * `expectedCount` à `null` signifie que le décompte lui-même est hors de
 * portée : rien ne permet alors d'affirmer que la liste est complète.
 */
export async function listGroupMembers(
  groupId: string,
  expectedCount: number | null
): Promise<GroupMembership> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('user_groups')
    .select(
      'user_id, app_users!user_id ( id, first_name, last_name, username, job_title, status, is_super_admin )'
    )
    .eq('group_id', groupId)

  if (error) reportQueryFailure('membres', error)

  type Row = {
    user_id: string
    app_users: {
      id: string
      first_name: string
      last_name: string
      username: string
      job_title: string | null
      status: UserStatus
      is_super_admin: boolean
    } | null
  }

  const rows = (data ?? []) as unknown as Row[]

  const members = rows
    .map((row) => row.app_users)
    .filter((user): user is NonNullable<Row['app_users']> => Boolean(user))
    .map((user) => ({
      id: user.id,
      fullName: `${user.first_name} ${user.last_name}`.trim(),
      username: user.username,
      jobTitle: user.job_title,
      status: user.status,
      isSuperAdmin: user.is_super_admin,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr'))

  return { readable: expectedCount !== null && members.length === expectedCount, members }
}

/**
 * L'utilisateur connecté appartient-il à ce groupe ?
 *
 * `user_groups_select` laisse toujours lire SES propres lignes : la question se
 * pose donc sans exiger `users.users.view`. Elle décide de ce que l'écran
 * propose — le déclencheur `group_permissions_no_self_change` refuserait de
 * toute façon l'écriture, mais mieux vaut l'annoncer que la laisser tenter.
 */
export async function isCurrentUserMember(groupId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('user_groups')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle()

  return Boolean(data)
}

/** Utilisateurs pouvant être ajoutés au groupe. */
export type AssignableUser = {
  id: string
  fullName: string
  username: string
  jobTitle: string | null
  status: UserStatus
}

export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('app_users')
    .select('id, first_name, last_name, username, job_title, status')
    .neq('status', 'ARCHIVED')
    .order('last_name')
    .order('first_name')

  if (error) reportQueryFailure('utilisateurs assignables', error)

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    username: row.username,
    jobTitle: row.job_title,
    status: row.status as UserStatus,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Arborescence des permissions du groupe                                     */
/* -------------------------------------------------------------------------- */

export type GroupPermissionEntry = {
  code: string
  label: string
  action: PermissionAction
  actionLabel: string
  isSensitive: boolean
  /** Règle réellement enregistrée dans `group_permissions`. `null` = aucune. */
  effect: PermissionEffect | null
}

export type GroupPermissionBranch = {
  key: string
  menuLabel: string | null
  submenuLabel: string | null
  entries: GroupPermissionEntry[]
}

export type GroupPermissionModule = {
  code: string
  label: string
  total: number
  branches: GroupPermissionBranch[]
}

export type GroupPermissionOverview = {
  modules: GroupPermissionModule[]
  total: number
  allow: number
  deny: number
  sensitiveAllow: number
  readable: boolean
}

/**
 * Construit l'arborescence des permissions d'un groupe.
 *
 * Contrairement à la fiche utilisateur, il n'y a rien à hériter : un groupe est
 * une SOURCE de droits, pas un destinataire. Chaque permission y est donc dans
 * l'un de trois états — accordée, refusée, ou absente du groupe.
 *
 * `readable` distingue « ce groupe n'accorde rien » de « je n'ai pas le droit
 * de voir ce qu'il accorde ».
 */
export async function getGroupPermissionOverview(
  groupId: string
): Promise<GroupPermissionOverview> {
  const supabase = await createSupabaseServerClient()

  const [catalogResult, rulesResult] = await Promise.all([
    supabase
      .from('permissions')
      .select(
        'id, code, module_code, module_label, menu_label, submenu_label, action, label, is_sensitive, module_order, menu_order, submenu_order, action_order'
      )
      .order('module_order')
      .order('menu_order')
      .order('submenu_order')
      .order('action_order'),
    supabase.from('group_permissions').select('permission_id, effect').eq('group_id', groupId),
  ])

  const empty: GroupPermissionOverview = {
    modules: [],
    total: 0,
    allow: 0,
    deny: 0,
    sensitiveAllow: 0,
    readable: false,
  }

  // Un refus de lecture des règles est un cas fonctionnel attendu.
  if (rulesResult.error) return empty
  // Un échec de lecture du catalogue ne l'est pas : il doit rester repérable.
  if (catalogResult.error) reportQueryFailure('catalogue des permissions', catalogResult.error)
  if (!catalogResult.data) return empty

  const rules = new Map<string, PermissionEffect>(
    (rulesResult.data ?? []).map((row) => [row.permission_id, row.effect as PermissionEffect])
  )

  const modules = new Map<string, GroupPermissionModule>()
  let allow = 0
  let deny = 0
  let sensitiveAllow = 0

  for (const row of catalogResult.data) {
    const effect = rules.get(row.id) ?? null

    if (effect === 'ALLOW') {
      allow += 1
      if (row.is_sensitive) sensitiveAllow += 1
    } else if (effect === 'DENY') {
      deny += 1
    }

    let moduleTree = modules.get(row.module_code)
    if (!moduleTree) {
      moduleTree = { code: row.module_code, label: row.module_label, total: 0, branches: [] }
      modules.set(row.module_code, moduleTree)
    }

    const branchKey = `${row.menu_label ?? ''}|${row.submenu_label ?? ''}`
    let branch = moduleTree.branches.find((item) => item.key === branchKey)
    if (!branch) {
      branch = {
        key: branchKey,
        menuLabel: row.menu_label,
        submenuLabel: row.submenu_label,
        entries: [],
      }
      moduleTree.branches.push(branch)
    }

    branch.entries.push({
      code: row.code,
      label: row.label,
      action: row.action as PermissionAction,
      actionLabel: ACTION_LABELS[row.action as PermissionAction] ?? row.action,
      isSensitive: row.is_sensitive,
      effect,
    })

    moduleTree.total += 1
  }

  return {
    modules: [...modules.values()],
    total: catalogResult.data.length,
    allow,
    deny,
    sensitiveAllow,
    readable: true,
  }
}
