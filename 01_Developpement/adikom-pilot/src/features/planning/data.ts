import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import { todayISO } from '@/lib/dates'
import {
  UNREADABLE_DECISION,
  UNREADABLE_MEETING,
  UNREADABLE_PARTY,
  UNREADABLE_PROJECT,
  UNREADABLE_TASK,
  UNREADABLE_USER,
  type ActionStatus,
  type CalendarKind,
  type PlanningStatus,
} from './constants'
import type { TaskStatus } from '@/features/projects/constants'

/**
 * Accès aux données du second volet de Projets & Planification — Module 03.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données. Sans `projects.meetings.view`, la liste
 * des réunions est vide — et l'appelant doit alors DIRE qu'il n'a pas le droit,
 * jamais afficher « aucune réunion » (DEC-017).
 *
 * CE QUI MANQUE SE DIT, CE QUI EST FAUX SE TAIT.
 *
 * Un nom de tiers, de responsable, de projet, de réunion citée par une
 * décision : tous arrivent par jointure EXTERNE et dépendent d'une capacité qui
 * n'est pas celle de l'écran. Leur absence produit un LIBELLÉ EXPLICITE —
 * « Réunion non lisible » —, jamais un tiret : un tiret dirait qu'il n'y en a
 * pas (doctrine de DEC-034 §d, reconduite du LOT 12).
 */

export * from './constants'

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Option = { id: string; label: string; description?: string }

export type Participant = {
  userId: string
  label: string
  jobTitle: string | null
}

export type MeetingListItem = {
  id: string
  title: string
  startsAt: string
  durationMinutes: number
  location: string | null
  status: PlanningStatus
  ownerId: string | null
  ownerLabel: string | null
  projectId: string | null
  projectLabel: string | null
  participantCount: number
  hasMinutes: boolean
}

export type MeetingDetail = Omit<MeetingListItem, 'participantCount'> & {
  objective: string | null
  agenda: string | null
  minutes: string | null
  minutesRecordedAt: string | null
  statusReason: string | null
  createdAt: string
  updatedAt: string
  participants: Participant[]
}

export type AppointmentListItem = {
  id: string
  subject: string
  startsAt: string
  durationMinutes: number
  location: string | null
  status: PlanningStatus
  ownerId: string | null
  ownerLabel: string | null
  partyLabel: string | null
  externalContact: string | null
  participantCount: number
}

export type AppointmentDetail = Omit<AppointmentListItem, 'participantCount'> & {
  notes: string | null
  clientId: string | null
  supplierId: string | null
  partnerId: string | null
  statusReason: string | null
  createdAt: string
  updatedAt: string
  participants: Participant[]
}

export type DecisionListItem = {
  id: string
  title: string
  decidedOn: string
  ownerId: string | null
  ownerLabel: string | null
  projectId: string | null
  projectLabel: string | null
  meetingId: string | null
  meetingLabel: string | null
}

export type DecisionDetail = DecisionListItem & {
  context: string | null
  statement: string
  createdAt: string
  updatedAt: string
}

/**
 * L'état effectif d'une action — §25.
 *
 * Une action transformée en tâche ne porte plus le sien : le suivi appartient à
 * la tâche, et la base gèle la colonne (`fn_action_write_guard`). L'écran lit
 * donc l'état de la TÂCHE lorsqu'il y en a une — sauf s'il ne peut pas la lire,
 * auquel cas il le DIT plutôt que de présenter un état périmé.
 */
export type ActionListItem = {
  id: string
  title: string
  status: ActionStatus
  assigneeId: string | null
  assigneeLabel: string | null
  dueOn: string | null
  isLate: boolean
  meetingId: string | null
  meetingLabel: string | null
  decisionId: string | null
  decisionLabel: string | null
  taskId: string | null
  /** L'état de la tâche liée, ou `null` si elle n'est pas lisible. */
  taskStatus: TaskStatus | null
  taskLabel: string | null
}

export type ActionDetail = ActionListItem & {
  description: string | null
  statusReason: string | null
  completedAt: string | null
  taskLinkedAt: string | null
  createdAt: string
  updatedAt: string
}

export type CalendarEntry = {
  kind: CalendarKind
  id: string
  title: string
  subtitle: string | null
  day: string
  startsAt: string | null
  endsAt: string | null
  status: string
  isLate: boolean
}

/* -------------------------------------------------------------------------- */
/*  Composition des libellés                                                   */
/* -------------------------------------------------------------------------- */

type UserRow = { first_name: string; last_name: string; job_title?: string | null } | null

/**
 * Le nom d'un utilisateur, ou l'aveu qu'on ne peut pas le lire.
 *
 * `id` présent et ligne absente = RLS a masqué le compte : `users.users.view`
 * manque. `id` absent = personne n'est désignée, et c'est une information.
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
  if (ids.partnerId) {
    return rows.partner ? `Partenaire · ${rows.partner.legal_name}` : UNREADABLE_PARTY
  }
  return null
}

/** Un objet cité par un autre : nommé quand il manque, jamais effacé. */
function linkedLabel(id: string | null, name: string | undefined | null, fallback: string) {
  if (!id) return null
  return name ?? fallback
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

function toParticipants(
  rows: { user_id: string; app_users: UserRow }[] | undefined
): Participant[] {
  return (rows ?? [])
    .map((row) => ({
      userId: row.user_id,
      label: userLabel(row.user_id, row.app_users) ?? UNREADABLE_USER,
      jobTitle: row.app_users?.job_title ?? null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

/* -------------------------------------------------------------------------- */
/*  Réunions — §21, §23                                                        */
/* -------------------------------------------------------------------------- */

/*
 * `owner:app_users!project_meetings_owner_id_fkey` : la jointure est NOMMÉE.
 *
 * Une réunion cite `app_users` par plusieurs colonnes — responsable, auteur du
 * compte rendu, auteur du changement d'état. PostgREST ne peut pas deviner
 * laquelle est visée et refuse la requête (DEC-018).
 */
const MEETING_SELECT = `
  id, title, starts_at, duration_minutes, location, status, owner_id, project_id,
  minutes,
  owner:app_users!project_meetings_owner_id_fkey ( first_name, last_name, job_title ),
  projects ( name )
`

type RawMeeting = {
  id: string
  title: string
  starts_at: string
  duration_minutes: number
  location: string | null
  status: PlanningStatus
  owner_id: string | null
  project_id: string | null
  minutes: string | null
  owner?: UserRow
  projects?: { name: string } | null
  project_meeting_participants?: { count: number }[] | null
}

function toMeetingListItem(row: RawMeeting): MeetingListItem {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    location: row.location,
    status: row.status,
    ownerId: row.owner_id,
    ownerLabel: userLabel(row.owner_id, row.owner ?? null),
    projectId: row.project_id,
    projectLabel: linkedLabel(row.project_id, row.projects?.name, UNREADABLE_PROJECT),
    participantCount: row.project_meeting_participants?.[0]?.count ?? 0,
    hasMinutes: Boolean(row.minutes && row.minutes.trim()),
  }
}

export type MeetingFilters = {
  search?: string
  status?: string
  projectId?: string
  participantId?: string
  /** §41 : les réunions se filtrent par PÉRIODE. Bornes en jours civils. */
  from?: string
  to?: string
}

export async function listMeetings(filters: MeetingFilters = {}): Promise<MeetingListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('project_meetings')
    .select(`${MEETING_SELECT}, project_meeting_participants ( count )`)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) query = query.or(`title.ilike.%${search}%,objective.ilike.%${search}%`)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.projectId) query = query.eq('project_id', filters.projectId)

  /*
   * Les bornes de période sont des JOURS, convertis en instants sur le fuseau
   * des Comores : « jusqu'au 30 » inclut le 30 tout entier, pas jusqu'à minuit
   * du 29 au 30 (DEC-025 §e).
   */
  if (filters.from) query = query.gte('starts_at', `${filters.from}T00:00:00+03:00`)
  if (filters.to) query = query.lt('starts_at', `${nextDay(filters.to)}T00:00:00+03:00`)

  if (filters.participantId) {
    const ids = await meetingIdsFor(filters.participantId)
    if (ids.length === 0) return []
    query = query.in('id', ids)
  }

  const { data, error } = await query.order('starts_at', { ascending: false }).limit(200)

  if (error) {
    reportQueryFailure('reunions', error, 'La liste des réunions n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawMeeting[]).map(toMeetingListItem)
}

export async function getMeetingDetail(id: string): Promise<MeetingDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('project_meetings')
    .select(
      `${MEETING_SELECT}, objective, agenda, minutes_recorded_at, status_reason,
       created_at, updated_at,
       project_meeting_participants (
         user_id,
         app_users!project_meeting_participants_user_id_fkey ( first_name, last_name, job_title )
       )`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('reunion', error, 'Cette réunion n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as Omit<RawMeeting, 'project_meeting_participants'> & {
    objective: string | null
    agenda: string | null
    minutes_recorded_at: string | null
    status_reason: string | null
    created_at: string
    updated_at: string
    project_meeting_participants?: { user_id: string; app_users: UserRow }[]
  }

  const base = toMeetingListItem({ ...row, project_meeting_participants: null })

  return {
    ...base,
    objective: row.objective,
    agenda: row.agenda,
    minutes: row.minutes,
    minutesRecordedAt: row.minutes_recorded_at,
    statusReason: row.status_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participants: toParticipants(row.project_meeting_participants),
  }
}

async function meetingIdsFor(userId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('project_meeting_participants')
    .select('meeting_id')
    .eq('user_id', userId)
  return (data ?? []).map((row) => row.meeting_id as string)
}

/* -------------------------------------------------------------------------- */
/*  Rendez-vous — §26, §27                                                     */
/* -------------------------------------------------------------------------- */

const APPOINTMENT_SELECT = `
  id, subject, starts_at, duration_minutes, location, status, owner_id,
  client_id, supplier_id, partner_id, external_contact,
  owner:app_users!project_appointments_owner_id_fkey ( first_name, last_name, job_title ),
  clients ( legal_name ),
  suppliers ( legal_name ),
  partners ( legal_name )
`

type RawAppointment = {
  id: string
  subject: string
  starts_at: string
  duration_minutes: number
  location: string | null
  status: PlanningStatus
  owner_id: string | null
  client_id: string | null
  supplier_id: string | null
  partner_id: string | null
  external_contact: string | null
  owner?: UserRow
  clients?: PartyRow
  suppliers?: PartyRow
  partners?: PartyRow
  project_appointment_participants?: { count: number }[] | null
}

function toAppointmentListItem(row: RawAppointment): AppointmentListItem {
  return {
    id: row.id,
    subject: row.subject,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    location: row.location,
    status: row.status,
    ownerId: row.owner_id,
    ownerLabel: userLabel(row.owner_id, row.owner ?? null),
    partyLabel: partyLabel(
      { clientId: row.client_id, supplierId: row.supplier_id, partnerId: row.partner_id },
      {
        client: row.clients ?? null,
        supplier: row.suppliers ?? null,
        partner: row.partners ?? null,
      }
    ),
    externalContact: row.external_contact,
    participantCount: row.project_appointment_participants?.[0]?.count ?? 0,
  }
}

export type AppointmentFilters = {
  search?: string
  status?: string
  ownerId?: string
  /** §41 : période, tiers, responsable. */
  partyType?: string
  partyId?: string
  from?: string
  to?: string
}

export async function listAppointments(
  filters: AppointmentFilters = {}
): Promise<AppointmentListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('project_appointments')
    .select(`${APPOINTMENT_SELECT}, project_appointment_participants ( count )`)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(`subject.ilike.%${search}%,external_contact.ilike.%${search}%`)
  }

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.ownerId) query = query.eq('owner_id', filters.ownerId)

  if (filters.partyId && filters.partyType) {
    const column =
      filters.partyType === 'CLIENT'
        ? 'client_id'
        : filters.partyType === 'SUPPLIER'
          ? 'supplier_id'
          : filters.partyType === 'PARTNER'
            ? 'partner_id'
            : null
    if (column) query = query.eq(column, filters.partyId)
  }

  if (filters.from) query = query.gte('starts_at', `${filters.from}T00:00:00+03:00`)
  if (filters.to) query = query.lt('starts_at', `${nextDay(filters.to)}T00:00:00+03:00`)

  const { data, error } = await query.order('starts_at', { ascending: false }).limit(200)

  if (error) {
    reportQueryFailure('rendez-vous', error, 'La liste des rendez-vous n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawAppointment[]).map(toAppointmentListItem)
}

export async function getAppointmentDetail(id: string): Promise<AppointmentDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('project_appointments')
    .select(
      `${APPOINTMENT_SELECT}, notes, status_reason, created_at, updated_at,
       project_appointment_participants (
         user_id,
         app_users!project_appointment_participants_user_id_fkey ( first_name, last_name, job_title )
       )`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('rendez-vous', error, 'Ce rendez-vous n’a pas pu être chargé.')
  }
  if (!data) return null

  const row = data as unknown as Omit<RawAppointment, 'project_appointment_participants'> & {
    notes: string | null
    status_reason: string | null
    created_at: string
    updated_at: string
    project_appointment_participants?: { user_id: string; app_users: UserRow }[]
  }

  const base = toAppointmentListItem({ ...row, project_appointment_participants: null })

  return {
    ...base,
    notes: row.notes,
    clientId: row.client_id,
    supplierId: row.supplier_id,
    partnerId: row.partner_id,
    statusReason: row.status_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participants: toParticipants(row.project_appointment_participants),
  }
}

/* -------------------------------------------------------------------------- */
/*  Décisions — §24                                                            */
/* -------------------------------------------------------------------------- */

const DECISION_SELECT = `
  id, title, decided_on, owner_id, project_id, meeting_id,
  owner:app_users!project_decisions_owner_id_fkey ( first_name, last_name, job_title ),
  projects ( name ),
  project_meetings ( title )
`

type RawDecision = {
  id: string
  title: string
  decided_on: string
  owner_id: string | null
  project_id: string | null
  meeting_id: string | null
  owner?: UserRow
  projects?: { name: string } | null
  project_meetings?: { title: string } | null
}

function toDecisionListItem(row: RawDecision): DecisionListItem {
  return {
    id: row.id,
    title: row.title,
    decidedOn: row.decided_on,
    ownerId: row.owner_id,
    ownerLabel: userLabel(row.owner_id, row.owner ?? null),
    projectId: row.project_id,
    projectLabel: linkedLabel(row.project_id, row.projects?.name, UNREADABLE_PROJECT),
    meetingId: row.meeting_id,
    meetingLabel: linkedLabel(row.meeting_id, row.project_meetings?.title, UNREADABLE_MEETING),
  }
}

export type DecisionFilters = {
  search?: string
  projectId?: string
  meetingId?: string
  ownerId?: string
  from?: string
  to?: string
}

export async function listDecisions(filters: DecisionFilters = {}): Promise<DecisionListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('project_decisions').select(DECISION_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(`title.ilike.%${search}%,statement.ilike.%${search}%,context.ilike.%${search}%`)
  }

  if (filters.projectId) query = query.eq('project_id', filters.projectId)
  if (filters.meetingId) query = query.eq('meeting_id', filters.meetingId)
  if (filters.ownerId) query = query.eq('owner_id', filters.ownerId)
  if (filters.from) query = query.gte('decided_on', filters.from)
  if (filters.to) query = query.lte('decided_on', filters.to)

  const { data, error } = await query
    .order('decided_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    reportQueryFailure('decisions', error, 'La liste des décisions n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawDecision[]).map(toDecisionListItem)
}

export async function getDecisionDetail(id: string): Promise<DecisionDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('project_decisions')
    .select(`${DECISION_SELECT}, context, statement, created_at, updated_at`)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('decision', error, 'Cette décision n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawDecision & {
    context: string | null
    statement: string
    created_at: string
    updated_at: string
  }

  return {
    ...toDecisionListItem(row),
    context: row.context,
    statement: row.statement,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* -------------------------------------------------------------------------- */
/*  Actions — §25                                                              */
/* -------------------------------------------------------------------------- */

const ACTION_SELECT = `
  id, title, status, assignee_id, due_on, meeting_id, decision_id, task_id,
  assignee:app_users!project_actions_assignee_id_fkey ( first_name, last_name, job_title ),
  project_meetings ( title ),
  project_decisions ( title ),
  project_tasks ( title, status )
`

type RawAction = {
  id: string
  title: string
  status: ActionStatus
  assignee_id: string | null
  due_on: string | null
  meeting_id: string | null
  decision_id: string | null
  task_id: string | null
  assignee?: UserRow
  project_meetings?: { title: string } | null
  project_decisions?: { title: string } | null
  project_tasks?: { title: string; status: TaskStatus } | null
}

/**
 * Une action est en retard selon la même règle qu'une tâche (§16).
 *
 * Dérivé du jour civil des Comores, jamais stocké : un retard écrit en base
 * serait faux le lendemain de sa clôture (DEC-025 §a).
 *
 * Une action TRANSFORMÉE n'est jamais en retard de son côté : c'est la tâche
 * qui porte l'échéance et le suivi. Deux retards pour un même travail se
 * contrediraient.
 */
function actionIsLate(row: RawAction, today: string): boolean {
  if (row.task_id) return false
  if (!row.due_on) return false
  if (row.status !== 'TODO') return false
  return row.due_on < today
}

function toActionListItem(row: RawAction, today: string): ActionListItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    assigneeId: row.assignee_id,
    assigneeLabel: userLabel(row.assignee_id, row.assignee ?? null),
    dueOn: row.due_on,
    isLate: actionIsLate(row, today),
    meetingId: row.meeting_id,
    meetingLabel: linkedLabel(row.meeting_id, row.project_meetings?.title, UNREADABLE_MEETING),
    decisionId: row.decision_id,
    decisionLabel: linkedLabel(row.decision_id, row.project_decisions?.title, UNREADABLE_DECISION),
    taskId: row.task_id,
    taskStatus: row.project_tasks?.status ?? null,
    taskLabel: linkedLabel(row.task_id, row.project_tasks?.title, UNREADABLE_TASK),
  }
}

export type ActionFilters = {
  search?: string
  status?: string
  assigneeId?: string
  meetingId?: string
  decisionId?: string
  /** §37 : « actions en attente » — celles qui restent à faire. */
  pendingOnly?: boolean
  lateOnly?: boolean
}

export async function listActions(filters: ActionFilters = {}): Promise<ActionListItem[]> {
  const supabase = await createSupabaseServerClient()
  const today = todayISO()

  let query = supabase.from('project_actions').select(ACTION_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.assigneeId) query = query.eq('assignee_id', filters.assigneeId)
  if (filters.meetingId) query = query.eq('meeting_id', filters.meetingId)
  if (filters.decisionId) query = query.eq('decision_id', filters.decisionId)
  if (filters.pendingOnly) query = query.eq('status', 'TODO')

  /*
   * Le retard est filtré EN BASE, jamais après la limite : filtrer 200 lignes
   * déjà tronquées rendrait une liste silencieusement incomplète (DEC-032 §b).
   */
  if (filters.lateOnly) {
    query = query.lt('due_on', today).eq('status', 'TODO').is('task_id', null)
  }

  const { data, error } = await query
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    reportQueryFailure('actions', error, 'La liste des actions n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawAction[]).map((row) => toActionListItem(row, today))
}

export async function getActionDetail(id: string): Promise<ActionDetail | null> {
  const supabase = await createSupabaseServerClient()
  const today = todayISO()

  const { data, error } = await supabase
    .from('project_actions')
    .select(
      `${ACTION_SELECT}, description, status_reason, completed_at, task_linked_at,
       created_at, updated_at`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('action', error, 'Cette action n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawAction & {
    description: string | null
    status_reason: string | null
    completed_at: string | null
    task_linked_at: string | null
    created_at: string
    updated_at: string
  }

  return {
    ...toActionListItem(row, today),
    description: row.description,
    statusReason: row.status_reason,
    completedAt: row.completed_at,
    taskLinkedAt: row.task_linked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* -------------------------------------------------------------------------- */
/*  Calendrier — §19, §20                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Les éléments planifiés d'une période.
 *
 * UN SEUL APPEL POUR LES TROIS COUCHES. La fonction SQL les rassemble et
 * calcule le jour civil une seule fois : trois requêtes applicatives feraient
 * trois définitions du « jour », et l'une finirait par diverger.
 *
 * La fonction ne LÈVE pas lorsqu'une capacité manque — elle omet la couche.
 * C'est l'écran qui NOMME les couches fermées : un calendrier vide et un
 * calendrier interdit ne sont pas la même chose (DEC-017).
 */
export async function getCalendar(from: string, to: string): Promise<CalendarEntry[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('planning_calendar', { p_from: from, p_to: to })

  if (error) {
    reportQueryFailure('calendrier', error, 'Le calendrier n’a pas pu être chargé.')
  }

  return ((data ?? []) as {
    kind: CalendarKind
    id: string
    title: string
    subtitle: string | null
    day: string
    starts_at: string | null
    ends_at: string | null
    status: string
    is_late: boolean
  }[]).map((row) => ({
    kind: row.kind,
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    day: row.day,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    isLate: row.is_late,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Vue personnelle — §36                                                      */
/* -------------------------------------------------------------------------- */

/**
 * « Mes réunions », « Mes rendez-vous » (§36).
 *
 * Responsable OU participant : les deux façons d'être concerné. La vue FILTRE
 * ce que l'utilisateur a déjà le droit de lire — sans `projects.meetings.view`,
 * il n'y voit pas même les réunions auxquelles il est convoqué. Une vue
 * personnelle n'est pas une porte dérobée (DEC-024).
 */
export async function listMyMeetings(userId: string): Promise<MeetingListItem[]> {
  const supabase = await createSupabaseServerClient()

  const ids = await meetingIdsFor(userId)

  let query = supabase
    .from('project_meetings')
    .select(`${MEETING_SELECT}, project_meeting_participants ( count )`)
    .neq('status', 'CANCELLED')

  // `or` accepte une liste vide de façon ambiguë : les deux cas sont séparés.
  query =
    ids.length > 0
      ? query.or(`owner_id.eq.${userId},id.in.(${ids.join(',')})`)
      : query.eq('owner_id', userId)

  const { data, error } = await query.order('starts_at', { ascending: true }).limit(100)

  if (error) {
    reportQueryFailure('mes-reunions', error, 'Vos réunions n’ont pas pu être chargées.')
  }

  return ((data ?? []) as unknown as RawMeeting[]).map(toMeetingListItem)
}

export async function listMyAppointments(userId: string): Promise<AppointmentListItem[]> {
  const supabase = await createSupabaseServerClient()

  const { data: memberships } = await supabase
    .from('project_appointment_participants')
    .select('appointment_id')
    .eq('user_id', userId)

  const ids = (memberships ?? []).map((row) => row.appointment_id as string)

  let query = supabase
    .from('project_appointments')
    .select(`${APPOINTMENT_SELECT}, project_appointment_participants ( count )`)
    .neq('status', 'CANCELLED')

  query =
    ids.length > 0
      ? query.or(`owner_id.eq.${userId},id.in.(${ids.join(',')})`)
      : query.eq('owner_id', userId)

  const { data, error } = await query.order('starts_at', { ascending: true }).limit(100)

  if (error) {
    reportQueryFailure('mes-rendez-vous', error, 'Vos rendez-vous n’ont pas pu être chargés.')
  }

  return ((data ?? []) as unknown as RawAppointment[]).map(toAppointmentListItem)
}

/** « Suivre les actions » (§43) : celles qui sont confiées à l'utilisateur. */
export async function listMyActions(userId: string): Promise<ActionListItem[]> {
  return listActions({ assigneeId: userId })
}

/* -------------------------------------------------------------------------- */
/*  Listes de choix                                                            */
/* -------------------------------------------------------------------------- */

/** Réunions auxquelles rattacher une décision (§24). */
export async function listMeetingOptions(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('project_meetings')
    .select('id, title, starts_at')
    .neq('status', 'CANCELLED')
    .order('starts_at', { ascending: false })
    .limit(200)

  if (error) {
    reportQueryFailure('reunions', error, 'La liste des réunions n’a pas pu être chargée.')
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.title as string,
    description: formatDayOf(row.starts_at as string),
  }))
}

/* -------------------------------------------------------------------------- */
/*  Utilitaires de date                                                        */
/* -------------------------------------------------------------------------- */

/** Le lendemain d'un jour civil, pour une borne haute EXCLUSIVE. */
function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10)
}

/**
 * L'instant courant, en millisecondes.
 *
 * Trivial, et pourtant nécessaire : un composant serveur ne doit appeler
 * aucune fonction impure pendant son rendu. La lecture de l'horloge vit donc
 * dans ce module — comme `todayISO()` —, et le composant reçoit une valeur.
 */
export function now(): number {
  return Date.now()
}

/** Le jour d'un instant, lu sur le fuseau des Comores. */
function formatDayOf(instant: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Indian/Comoro',
  }).format(new Date(instant))
}
