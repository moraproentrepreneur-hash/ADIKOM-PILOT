import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import { todayISO } from '@/lib/dates'
import {
  UNREADABLE_PARTY,
  UNREADABLE_PROJECT,
  UNREADABLE_USER,
  isLate,
  type MemberRole,
  type Priority,
  type ProjectStatus,
  type TaskStatus,
} from './constants'

/**
 * Accès aux données de Projets & Planification — Module 03.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste la
 * barrière au niveau des données. Sans `projects.view`, la liste des projets est
 * vide ; sans `projects.tasks.view`, celle des tâches l'est aussi — et l'appelant
 * doit alors DIRE qu'il n'a pas le droit, jamais afficher « aucun projet »
 * (DEC-017).
 *
 * CE QUI MANQUE SE DIT, CE QUI EST FAUX SE TAIT.
 *
 * Un nom de tiers, un nom de responsable, un nom de projet cité par une tâche :
 * tous arrivent par jointure EXTERNE et dépendent d'une capacité qui n'est pas
 * celle du module. Leur absence produit un LIBELLÉ EXPLICITE — « Tiers non
 * lisible » —, jamais un tiret : un tiret dirait qu'il n'y en a pas
 * (doctrine de DEC-034 §d).
 *
 * L'avancement, lui, ne se calcule pas ici : `projects_task_counts()` le refait
 * en base sur les tâches réelles, et REFUSE lorsque `projects.tasks.view`
 * manque — un pourcentage muet vaudrait « 0 % », c'est-à-dire « rien n'est
 * fait » (DEC-034 §c).
 */

export * from './constants'

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ProjectListItem = {
  id: string
  name: string
  status: ProjectStatus
  priority: Priority
  ownerLabel: string | null
  partyLabel: string | null
  startsOn: string | null
  dueOn: string | null
  isArchived: boolean
  memberCount: number
}

export type ProjectMember = {
  userId: string
  role: MemberRole
  label: string
  jobTitle: string | null
}

export type ProjectDetail = ProjectListItem & {
  description: string | null
  objective: string | null
  ownerId: string | null
  clientId: string | null
  supplierId: string | null
  partnerId: string | null
  statusReason: string | null
  statusChangedAt: string | null
  createdAt: string
  updatedAt: string
  members: ProjectMember[]
}

export type TaskListItem = {
  id: string
  title: string
  projectId: string | null
  projectLabel: string | null
  assigneeId: string | null
  assigneeLabel: string | null
  status: TaskStatus
  priority: Priority
  startsOn: string | null
  dueOn: string | null
  isLate: boolean
}

export type TaskDetail = TaskListItem & {
  description: string | null
  completedAt: string | null
  statusReason: string | null
  statusChangedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Avancement d'un projet, refait en base (§32, §33). */
export type TaskCounts = {
  total: number
  done: number
  late: number
  percent: number | null
}

export type Option = { id: string; label: string; description?: string }

/* -------------------------------------------------------------------------- */
/*  Composition des libellés                                                   */
/* -------------------------------------------------------------------------- */

type UserRow = { first_name: string; last_name: string; job_title?: string | null } | null

/**
 * Le nom d'un utilisateur, ou l'aveu qu'on ne peut pas le lire.
 *
 * `id` présent et ligne absente = RLS a masqué le compte : `users.users.view`
 * manque. `id` absent = personne n'est désigné, et c'est une information.
 */
function userLabel(id: string | null, row: UserRow): string | null {
  if (!id) return null
  if (!row) return UNREADABLE_USER
  return `${row.first_name} ${row.last_name}`.trim() || UNREADABLE_USER
}

type PartyRow = { legal_name: string } | null

function partyLabel(
  ids: { clientId: string | null; supplierId: string | null; partnerId: string | null },
  rows: { client: PartyRow; supplier: PartyRow; partner: PartyRow }
): string | null {
  if (ids.clientId) return rows.client ? `Client · ${rows.client.legal_name}` : UNREADABLE_PARTY
  if (ids.supplierId) {
    return rows.supplier ? `Fournisseur · ${rows.supplier.legal_name}` : UNREADABLE_PARTY
  }
  if (ids.partnerId) return rows.partner ? `Partenaire · ${rows.partner.legal_name}` : UNREADABLE_PARTY
  return null
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

/* -------------------------------------------------------------------------- */
/*  Projets                                                                    */
/* -------------------------------------------------------------------------- */

type RawProject = {
  id: string
  name: string
  status: ProjectStatus
  priority: Priority
  owner_id: string | null
  client_id: string | null
  supplier_id: string | null
  partner_id: string | null
  starts_on: string | null
  due_on: string | null
  is_archived: boolean
  owner?: UserRow
  clients?: PartyRow
  suppliers?: PartyRow
  partners?: PartyRow
  project_members?: { count: number }[] | null
}

/*
 * `owner:app_users!projects_owner_id_fkey` : la jointure est NOMMÉE.
 *
 * Un projet cite `app_users` par plusieurs colonnes — responsable, auteur,
 * archiviste, auteur du changement d'état. PostgREST ne peut pas deviner
 * laquelle est visée et refuse la requête (DEC-018).
 */
const PROJECT_SELECT = `
  id, name, status, priority, owner_id, client_id, supplier_id, partner_id,
  starts_on, due_on, is_archived,
  owner:app_users!projects_owner_id_fkey ( first_name, last_name, job_title ),
  clients ( legal_name ),
  suppliers ( legal_name ),
  partners ( legal_name )
`

function toProjectListItem(row: RawProject): ProjectListItem {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    priority: row.priority,
    ownerLabel: userLabel(row.owner_id, row.owner ?? null),
    partyLabel: partyLabel(
      { clientId: row.client_id, supplierId: row.supplier_id, partnerId: row.partner_id },
      {
        client: row.clients ?? null,
        supplier: row.suppliers ?? null,
        partner: row.partners ?? null,
      }
    ),
    startsOn: row.starts_on,
    dueOn: row.due_on,
    isArchived: row.is_archived,
    memberCount: row.project_members?.[0]?.count ?? 0,
  }
}

export type ProjectFilters = {
  search?: string
  status?: string
  priority?: string
  ownerId?: string
  /** Les projets rangés restent consultables, mais ne s'affichent qu'à la demande (§48). */
  archived?: boolean
}

export async function listProjects(filters: ProjectFilters = {}): Promise<ProjectListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('projects')
    .select(`${PROJECT_SELECT}, project_members ( count )`)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) query = query.or(`name.ilike.%${search}%,objective.ilike.%${search}%`)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.priority) query = query.eq('priority', filters.priority)
  if (filters.ownerId) query = query.eq('owner_id', filters.ownerId)
  query = query.eq('is_archived', filters.archived === true)

  const { data, error } = await query
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('name')
    .limit(200)

  if (error) {
    reportQueryFailure('projets', error, 'La liste des projets n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawProject[]).map(toProjectListItem)
}

export async function getProjectDetail(id: string): Promise<ProjectDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('projects')
    .select(
      `${PROJECT_SELECT}, description, objective, status_reason, status_changed_at,
       created_at, updated_at,
       project_members (
         user_id, role,
         app_users!project_members_user_id_fkey ( first_name, last_name, job_title )
       )`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('projet', error, 'Ce projet n’a pas pu être chargé.')
  }
  if (!data) return null

  const row = data as unknown as Omit<RawProject, 'project_members'> & {
    description: string | null
    objective: string | null
    status_reason: string | null
    status_changed_at: string | null
    created_at: string
    updated_at: string
    project_members?: {
      user_id: string
      role: MemberRole
      app_users: UserRow
    }[]
  }

  const members = (row.project_members ?? []).map((member) => ({
    userId: member.user_id,
    role: member.role,
    label: userLabel(member.user_id, member.app_users) ?? UNREADABLE_USER,
    jobTitle: member.app_users?.job_title ?? null,
  }))

  const base = toProjectListItem({ ...row, project_members: null })

  return {
    ...base,
    memberCount: members.length,
    description: row.description,
    objective: row.objective,
    ownerId: row.owner_id,
    clientId: row.client_id,
    supplierId: row.supplier_id,
    partnerId: row.partner_id,
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Les participants d'abord, les observateurs ensuite : c'est l'ordre dans
    // lequel on lit une équipe — qui fait, puis qui suit.
    members: members.sort((a, b) =>
      a.role === b.role ? a.label.localeCompare(b.label, 'fr') : a.role === 'PARTICIPANT' ? -1 : 1
    ),
  }
}

/* -------------------------------------------------------------------------- */
/*  Avancement — §32, §33                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Avancement des projets, par identifiant.
 *
 * UN SEUL APPEL POUR TOUTE LA LISTE. Interroger le décompte projet par projet
 * ferait autant d'allers-retours que de lignes, et une liste filtrée sur une
 * page ne dirait de toute façon rien de plus.
 *
 * La fonction SQL LÈVE lorsque `projects.tasks.view` manque : l'appelant doit
 * donc vérifier la capacité AVANT d'appeler (`gated`, `lib/pilotage/figure`),
 * afin de nommer ce qui manque au lieu d'afficher une erreur de chargement.
 */
export async function getTaskCounts(projectId?: string): Promise<Map<string, TaskCounts>> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('projects_task_counts', {
    p_project_id: projectId ?? null,
  })

  if (error) throw new Error(error.message)

  const counts = new Map<string, TaskCounts>()
  for (const row of (data ?? []) as {
    project_id: string
    total: number
    done: number
    late: number
    percent: number | null
  }[]) {
    counts.set(row.project_id, {
      total: row.total,
      done: row.done,
      late: row.late,
      percent: row.percent,
    })
  }

  return counts
}

/* -------------------------------------------------------------------------- */
/*  Tâches                                                                     */
/* -------------------------------------------------------------------------- */

type RawTask = {
  id: string
  project_id: string | null
  title: string
  assignee_id: string | null
  status: TaskStatus
  priority: Priority
  starts_on: string | null
  due_on: string | null
  projects?: { name: string } | null
  assignee?: UserRow
}

const TASK_SELECT = `
  id, project_id, title, assignee_id, status, priority, starts_on, due_on,
  projects ( name ),
  assignee:app_users!project_tasks_assignee_id_fkey ( first_name, last_name, job_title )
`

function toTaskListItem(row: RawTask, today: string): TaskListItem {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    projectLabel: row.project_id ? (row.projects?.name ?? UNREADABLE_PROJECT) : null,
    assigneeId: row.assignee_id,
    assigneeLabel: userLabel(row.assignee_id, row.assignee ?? null),
    status: row.status,
    priority: row.priority,
    startsOn: row.starts_on,
    dueOn: row.due_on,
    isLate: isLate(row.due_on, row.status, today),
  }
}

export type TaskFilters = {
  search?: string
  status?: string
  priority?: string
  projectId?: string
  assigneeId?: string
  /** §14 et §35 : « en retard » est un filtre à part entière, pas un statut. */
  lateOnly?: boolean
  /** §14 : les tâches sans échéance forment un cas distinct. */
  withoutDueDate?: boolean
}

export async function listTasks(filters: TaskFilters = {}): Promise<TaskListItem[]> {
  const supabase = await createSupabaseServerClient()
  const today = todayISO()

  let query = supabase.from('project_tasks').select(TASK_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.priority) query = query.eq('priority', filters.priority)
  if (filters.projectId) query = query.eq('project_id', filters.projectId)
  if (filters.assigneeId) query = query.eq('assignee_id', filters.assigneeId)

  /*
   * Le retard est filtré EN BASE, jamais après la limite : filtrer 200 lignes
   * déjà tronquées rendrait une liste silencieusement incomplète (DEC-032 §b).
   */
  if (filters.lateOnly) {
    query = query.lt('due_on', today).not('status', 'in', '("DONE","CANCELLED")')
  }
  if (filters.withoutDueDate) query = query.is('due_on', null)

  const { data, error } = await query
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    reportQueryFailure('taches', error, 'La liste des tâches n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawTask[]).map((row) => toTaskListItem(row, today))
}

export async function getTaskDetail(id: string): Promise<TaskDetail | null> {
  const supabase = await createSupabaseServerClient()
  const today = todayISO()

  const { data, error } = await supabase
    .from('project_tasks')
    .select(
      `${TASK_SELECT}, description, completed_at, status_reason, status_changed_at,
       created_at, updated_at`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('tache', error, 'Cette tâche n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawTask & {
    description: string | null
    completed_at: string | null
    status_reason: string | null
    status_changed_at: string | null
    created_at: string
    updated_at: string
  }

  return {
    ...toTaskListItem(row, today),
    description: row.description,
    completedAt: row.completed_at,
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* -------------------------------------------------------------------------- */
/*  Vue personnelle — §36                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Ce qui concerne l'utilisateur connecté.
 *
 * « Cette vue doit être construite selon les données réellement attribuées à
 * l'utilisateur » (§36) : elle FILTRE, elle n'élargit rien. Un utilisateur sans
 * `projects.tasks.view` n'y voit pas ses propres tâches — la vue personnelle
 * n'est pas une porte dérobée sur une capacité qu'il n'a pas (DEC-024).
 */
export async function listMyTasks(userId: string): Promise<TaskListItem[]> {
  return listTasks({ assigneeId: userId })
}

/** Projets dont l'utilisateur est responsable, participant ou observateur. */
export async function listMyProjects(userId: string): Promise<ProjectListItem[]> {
  const supabase = await createSupabaseServerClient()

  const { data: memberships, error: membershipError } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)

  if (membershipError) {
    reportQueryFailure('mes-projets', membershipError, 'Vos projets n’ont pas pu être chargés.')
  }

  const ids = (memberships ?? []).map((row) => row.project_id as string)

  // `or` accepte une liste vide de façon ambiguë : les deux cas sont séparés.
  let query = supabase
    .from('projects')
    .select(`${PROJECT_SELECT}, project_members ( count )`)
    .eq('is_archived', false)

  query =
    ids.length > 0
      ? query.or(`owner_id.eq.${userId},id.in.(${ids.join(',')})`)
      : query.eq('owner_id', userId)

  const { data, error } = await query
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(200)

  if (error) {
    reportQueryFailure('mes-projets', error, 'Vos projets n’ont pas pu être chargés.')
  }

  return ((data ?? []) as unknown as RawProject[]).map(toProjectListItem)
}

/* -------------------------------------------------------------------------- */
/*  Listes de choix                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Utilisateurs auxquels un projet ou une tâche peut être confié.
 *
 * Sans `users.users.view`, RLS ne rend que la propre ligne de l'appelant : la
 * liste se réduit à lui-même, et c'est exact — il ne peut confier un travail
 * qu'à quelqu'un dont il connaît l'existence. L'écran le DIT plutôt que de
 * présenter un menu vide sans explication.
 */
export async function listAssignableUsers(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('app_users')
    .select('id, first_name, last_name, job_title')
    .eq('status', 'ACTIVE')
    .order('last_name')
    .limit(500)

  if (error) {
    reportQueryFailure('utilisateurs', error, 'La liste des utilisateurs n’a pas pu être chargée.')
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${row.first_name} ${row.last_name}`.trim(),
    description: row.job_title ?? undefined,
  }))
}

/** Projets ouverts, pour rattacher une tâche (§10). */
export async function listProjectOptions(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('is_archived', false)
    .order('name')
    .limit(500)

  if (error) {
    reportQueryFailure('projets', error, 'La liste des projets n’a pas pu être chargée.')
  }

  return (data ?? []).map((row) => ({ id: row.id, label: row.name }))
}
