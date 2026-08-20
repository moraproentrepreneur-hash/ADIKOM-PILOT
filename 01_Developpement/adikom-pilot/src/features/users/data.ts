import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { PermissionEffect, PermissionSource, UserStatus } from './constants'
import type { PermissionAction } from '@/lib/auth/permissions'
import { ACTION_LABELS } from '@/lib/auth/permissions'

/**
 * Accès aux données du module Utilisateurs.
 *
 * `server-only` : ces fonctions ne peuvent pas être importées par un composant
 * client. Elles renvoient des objets de transfert restreints à ce qui est
 * réellement affiché, plutôt que des lignes de base complètes.
 *
 * Aucune requête n'est privilégiée : tout passe par le client serveur porteur
 * de la session, donc soumis à RLS. Un utilisateur sans `users.users.view`
 * n'obtient que sa propre fiche, sans qu'aucun filtre applicatif n'ait à le
 * prévoir.
 */

// Les libellés et types partagés vivent dans constants.ts : ils sont
// consommés par des composants clients, qui ne peuvent pas importer ce module.
export { STATUS_LABELS, STATUS_TONES, SOURCE_LABELS } from './constants'
export type { UserStatus, PermissionSource, PermissionEffect } from './constants'

export type UserListItem = {
  id: string
  username: string
  fullName: string
  email: string
  jobTitle: string | null
  status: UserStatus
  isSuperAdmin: boolean
  departments: string[]
  groups: string[]
  lastLoginAt: string | null
  createdAt: string
}

export type UserDetail = UserListItem & {
  firstName: string
  lastName: string
  phone: string | null
  hiredOn: string | null
  notes: string | null
  managerId: string | null
  managerName: string | null
  departmentIds: string[]
  groupIds: string[]
  deactivatedAt: string | null
}

export type UserFilters = {
  search?: string
  status?: string
  departmentId?: string
  groupId?: string
}

type RawUserRow = {
  id: string
  username: string
  first_name: string
  last_name: string
  email: string
  job_title: string | null
  status: UserStatus
  is_super_admin: boolean
  last_login_at: string | null
  created_at: string
  user_departments: { department_id: string; departments: { name: string } | null }[] | null
  user_groups: { group_id: string; groups: { name: string } | null }[] | null
}

/**
 * `user_departments` et `user_groups` référencent `app_users` deux fois :
 * une fois pour le titulaire (`user_id`), une fois pour l'auteur de
 * l'affectation (`assigned_by`). Sans indication explicite de la colonne,
 * PostgREST refuse la jointure (PGRST201) et la requête entière échoue.
 */
const LIST_SELECT = `
  id, username, first_name, last_name, email, job_title, status,
  is_super_admin, last_login_at, created_at,
  user_departments!user_id ( department_id, departments ( name ) ),
  user_groups!user_id ( group_id, groups ( name ) )
`

/**
 * Une erreur de requête ne doit jamais être confondue avec une absence de
 * résultat : l'utilisateur verrait « aucun utilisateur » ou une page
 * introuvable alors que la donnée existe (règles §38 et §43). Le détail
 * technique reste côté serveur ; l'interface n'affiche qu'un message neutre.
 */
function reportQueryFailure(scope: string, error: { code?: string; message: string }): never {
  console.error(`[utilisateurs] ${scope} : ${error.code ?? 'ERREUR'} ${error.message}`)
  throw new Error("Les données des utilisateurs n'ont pas pu être chargées.")
}

function toListItem(row: RawUserRow): UserListItem {
  return {
    id: row.id,
    username: row.username,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    jobTitle: row.job_title,
    status: row.status,
    isSuperAdmin: row.is_super_admin,
    departments: (row.user_departments ?? [])
      .map((link) => link.departments?.name)
      .filter((name): name is string => Boolean(name)),
    groups: (row.user_groups ?? [])
      .map((link) => link.groups?.name)
      .filter((name): name is string => Boolean(name)),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  }
}

/** Échappe les caractères ayant une signification dans un filtre PostgREST. */
function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export async function listUsers(filters: UserFilters = {}): Promise<UserListItem[]> {
  const supabase = await createSupabaseServerClient()

  // `!inner` restreint la jointure lorsqu'un filtre porte sur la relation :
  // sans cela, l'utilisateur serait renvoyé avec une liste vide au lieu d'être
  // exclu du résultat.
  const select = filters.departmentId
    ? LIST_SELECT.replace('user_departments!user_id (', 'user_departments!user_id!inner (')
    : filters.groupId
      ? LIST_SELECT.replace('user_groups!user_id (', 'user_groups!user_id!inner (')
      : LIST_SELECT

  let query = supabase.from('app_users').select(select)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(
      [
        `first_name.ilike.%${search}%`,
        `last_name.ilike.%${search}%`,
        `username.ilike.%${search}%`,
        `email.ilike.%${search}%`,
        `job_title.ilike.%${search}%`,
      ].join(',')
    )
  }

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.departmentId) {
    query = query.eq('user_departments.department_id', filters.departmentId)
  }
  if (filters.groupId) {
    query = query.eq('user_groups.group_id', filters.groupId)
  }

  const { data, error } = await query
    .order('is_super_admin', { ascending: false })
    .order('last_name')
    .limit(200)

  if (error) reportQueryFailure('liste', error)

  return ((data ?? []) as unknown as RawUserRow[]).map(toListItem)
}

export async function getUserDetail(id: string): Promise<UserDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('app_users')
    .select(
      `${LIST_SELECT}, phone, hired_on, notes, manager_id, deactivated_at,
       manager:manager_id ( first_name, last_name )`
    )
    .eq('id', id)
    .maybeSingle()

  // Une ligne absente est un cas fonctionnel légitime (404) ; une erreur de
  // requête ne l'est pas et doit rester visible.
  if (error) reportQueryFailure('fiche', error)
  if (!data) return null

  const row = data as unknown as RawUserRow & {
    phone: string | null
    hired_on: string | null
    notes: string | null
    manager_id: string | null
    deactivated_at: string | null
    manager: { first_name: string; last_name: string } | null
  }

  return {
    ...toListItem(row),
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    hiredOn: row.hired_on,
    notes: row.notes,
    managerId: row.manager_id,
    managerName: row.manager
      ? `${row.manager.first_name} ${row.manager.last_name}`.trim()
      : null,
    departmentIds: (row.user_departments ?? []).map((link) => link.department_id),
    groupIds: (row.user_groups ?? []).map((link) => link.group_id),
    deactivatedAt: row.deactivated_at,
  }
}

export type Option = { id: string; label: string; description?: string }

export async function listDepartments(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, description')
    .eq('is_active', true)
    .order('sort_order')

  if (error) reportQueryFailure('départements', error)

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.name,
    description: row.description ?? undefined,
  }))
}

export async function listGroups(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, description')
    .eq('is_active', true)
    .order('sort_order')

  if (error) reportQueryFailure('groupes', error)

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.name,
    description: row.description ?? undefined,
  }))
}

/** Utilisateurs pouvant être désignés comme responsable hiérarchique. */
export async function listPotentialManagers(excludeId?: string): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()
  let query = supabase
    .from('app_users')
    .select('id, first_name, last_name, job_title')
    .eq('status', 'ACTIVE')
    .order('last_name')

  // Un utilisateur ne peut pas être son propre responsable : la base l'interdit,
  // l'interface ne doit donc pas le proposer.
  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query

  if (error) reportQueryFailure('responsables', error)

  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${row.first_name} ${row.last_name}`.trim(),
    description: row.job_title ?? undefined,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Arborescence des permissions (lecture seule — Étape 2.1)                   */
/* -------------------------------------------------------------------------- */



export type PermissionEntry = {
  code: string
  label: string
  action: PermissionAction
  actionLabel: string
  isSensitive: boolean
  granted: boolean
  source: PermissionSource
  /**
   * Règle individuelle réellement enregistrée dans `user_permissions`.
   * `null` signifie « non définie » : seul l'héritage des groupes s'applique.
   * À distinguer de `granted`, qui est le résultat effectif toutes origines
   * confondues.
   */
  userEffect: PermissionEffect | null
  /**
   * Verdict des groupes seuls, indépendamment de la règle individuelle.
   * Permet à l'interface de recalculer le résultat effectif pendant la saisie,
   * sans réinterroger le serveur ni deviner l'héritage.
   */
  inheritedEffect: PermissionEffect | null
}

export type PermissionBranch = {
  key: string
  menuLabel: string | null
  submenuLabel: string | null
  entries: PermissionEntry[]
}

export type PermissionModuleTree = {
  code: string
  label: string
  branches: PermissionBranch[]
  granted: number
  total: number
  sensitiveGranted: number
}

export type PermissionOverview = {
  modules: PermissionModuleTree[]
  granted: number
  total: number
  sensitiveGranted: number
  readable: boolean
}

/**
 * Construit l'arborescence des permissions d'un utilisateur.
 *
 * `effective_permissions` refuse l'appel lorsque l'appelant n'a pas le droit de
 * consulter les permissions d'autrui : `readable` vaut alors `false` et
 * l'interface affiche un refus plutôt qu'une arborescence vide, qui laisserait
 * croire à une absence de droits.
 */
export async function getPermissionOverview(userId: string): Promise<PermissionOverview> {
  const supabase = await createSupabaseServerClient()

  const [catalogResult, effectiveResult, individualResult, groupResult] = await Promise.all([
    supabase
      .from('permissions')
      .select(
        'id, code, module_code, module_label, menu_label, submenu_label, action, label, is_sensitive, module_order, menu_order, submenu_order, action_order'
      )
      .order('module_order')
      .order('menu_order')
      .order('submenu_order')
      .order('action_order'),
    supabase.rpc('effective_permissions', { p_user_id: userId }),
    // Règles individuelles réellement enregistrées : elles seules sont
    // modifiables ici, l'héritage relevant des groupes.
    supabase
      .from('user_permissions')
      .select('permission_id, effect')
      .eq('user_id', userId),
    // Règles héritées des groupes actifs. Lues séparément pour que l'interface
    // puisse distinguer l'héritage de la décision individuelle, y compris
    // lorsque celle-ci vient d'être modifiée et pas encore enregistrée.
    supabase
      .from('user_groups')
      .select('groups!inner ( is_active, group_permissions ( permission_id, effect ) )')
      .eq('user_id', userId),
  ])

  const empty: PermissionOverview = {
    modules: [],
    granted: 0,
    total: 0,
    sensitiveGranted: 0,
    readable: false,
  }

  // Un refus de `effective_permissions` est un cas fonctionnel attendu.
  if (effectiveResult.error) return empty
  // Un échec de lecture du catalogue ne l'est pas : il doit rester repérable.
  if (catalogResult.error) reportQueryFailure('catalogue des permissions', catalogResult.error)
  if (!catalogResult.data) return empty

  type EffectiveRow = { permission_code: string; granted: boolean; source: PermissionSource }
  const effective = new Map<string, EffectiveRow>(
    ((effectiveResult.data ?? []) as EffectiveRow[]).map((row) => [row.permission_code, row])
  )

  // Une erreur ici ne doit pas faire passer une règle existante pour absente :
  // l'interface proposerait « non défini » et l'enregistrement l'effacerait.
  if (individualResult.error) {
    reportQueryFailure('permissions individuelles', individualResult.error)
  }
  const individual = new Map<string, PermissionEffect>(
    (individualResult.data ?? []).map((row) => [row.permission_id, row.effect as PermissionEffect])
  )

  if (groupResult.error) reportQueryFailure('permissions héritées', groupResult.error)

  /*
   * Verdict des groupes seuls. Un refus hérité prime sur une autorisation
   * héritée, conformément à `effective_permissions` : DENY l'emporte toujours.
   */
  type GroupRow = {
    groups: { is_active: boolean; group_permissions: { permission_id: string; effect: string }[] }
  }
  const inherited = new Map<string, PermissionEffect>()
  for (const row of (groupResult.data ?? []) as unknown as GroupRow[]) {
    if (!row.groups?.is_active) continue
    for (const rule of row.groups.group_permissions ?? []) {
      if (rule.effect === 'DENY' || !inherited.has(rule.permission_id)) {
        inherited.set(rule.permission_id, rule.effect as PermissionEffect)
      }
    }
  }

  const modules = new Map<string, PermissionModuleTree>()
  let granted = 0
  let sensitiveGranted = 0

  for (const row of catalogResult.data) {
    const state = effective.get(row.code)
    const isGranted = state?.granted ?? false
    const source: PermissionSource = state?.source ?? 'NONE'

    if (isGranted) {
      granted += 1
      if (row.is_sensitive) sensitiveGranted += 1
    }

    let moduleTree = modules.get(row.module_code)
    if (!moduleTree) {
      moduleTree = {
        code: row.module_code,
        label: row.module_label,
        branches: [],
        granted: 0,
        total: 0,
        sensitiveGranted: 0,
      }
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
      granted: isGranted,
      source,
      userEffect: individual.get(row.id) ?? null,
      inheritedEffect: inherited.get(row.id) ?? null,
    })

    moduleTree.total += 1
    if (isGranted) {
      moduleTree.granted += 1
      if (row.is_sensitive) moduleTree.sensitiveGranted += 1
    }
  }

  return {
    modules: [...modules.values()],
    granted,
    total: catalogResult.data.length,
    sensitiveGranted,
    readable: true,
  }
}
