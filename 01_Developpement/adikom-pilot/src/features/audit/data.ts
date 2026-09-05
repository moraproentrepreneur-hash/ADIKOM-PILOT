import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import { fromLocalInput } from '@/lib/dates'
import type { AuditAction, AuditResult } from './constants'

/**
 * Accès au journal d'activité — Module 08 §54, Règles métier 06 (Audit).
 *
 * Toutes les lectures passent par le client porteur de la session : la policy
 * `audit_log_select` exige `users.audit.view`, et le journal reste inaccessible
 * sans elle.
 *
 * CE QUE CETTE COUCHE NE PEUT PAS DEMANDER.
 *
 * `before_data` et `after_data` ne figurent dans aucune requête d'ici, et ce
 * n'est pas une convenance : la migration 064 a retiré ces deux colonnes des
 * droits de `authenticated`. Les demander produirait une erreur, y compris par
 * appel direct à l'API. Le détail passe exclusivement par
 * `audit_entry_detail()`, qui arbitre au cas par cas (DEC-038).
 */

export type AuditEvent = {
  id: number
  occurredAt: string
  actorId: string | null
  /** Nom figé au moment de l'action : il survit à la suppression du compte. */
  actorLabel: string | null
  action: AuditAction
  result: AuditResult
  moduleCode: string | null
  entityType: string
  entityId: string | null
  entityLabel: string | null
  changedFields: string[] | null
  reason: string | null
  comment: string | null
}

export type AuditEventDetail = {
  /** L'appelant a-t-il le droit de lire la donnée métier de cet objet ? */
  mayRead: boolean
  /** Capacité qui l'ouvrirait. `null` : réservé au Super Admin. */
  requiredPermission: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export type AuditFilters = {
  search?: string
  actorId?: string
  moduleCode?: string
  entityType?: string
  action?: string
  result?: string
  /** Jour civil comorien, inclus. */
  from?: string
  /** Jour civil comorien, inclus. */
  to?: string
}

/**
 * Le journal se lit par pages, jamais d'un bloc.
 *
 * Il compte déjà des dizaines de milliers de lignes et ne cesse jamais de
 * croître : c'est la seule liste du SaaS dont le volume ne dépend pas de
 * l'activité d'ADIKOM mais de sa durée. Une limite haute — celle des autres
 * écrans — donnerait un écran silencieusement tronqué, ce qui est pire qu'un
 * écran lent (Module 08 §56 : pagination et chargement progressif).
 */
export const PAGE_SIZE = 50

const SELECT = `
  id, occurred_at, actor_id, actor_label, action, result,
  module_code, entity_type, entity_id, entity_label,
  changed_fields, reason, comment
`

type RawEvent = {
  id: number
  occurred_at: string
  actor_id: string | null
  actor_label: string | null
  action: AuditAction
  result: AuditResult
  module_code: string | null
  entity_type: string
  entity_id: string | null
  entity_label: string | null
  changed_fields: string[] | null
  reason: string | null
  comment: string | null
}

function toEvent(row: RawEvent): AuditEvent {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    actorLabel: row.actor_label,
    action: row.action,
    result: row.result,
    moduleCode: row.module_code,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    changedFields: row.changed_fields,
    reason: row.reason,
    comment: row.comment,
  }
}

/** `2026-09-05` → `2026-09-06`, sur le calendrier civil. */
function nextDay(date: string): string {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!parsed) return date

  const [, year, month, day] = parsed
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1))
  return shifted.toISOString().slice(0, 10)
}

/**
 * Neutralise les caractères que PostgREST interprète dans un `or(...)`.
 *
 * La virgule y sépare deux conditions et la parenthèse en délimite le groupe :
 * une recherche sur « Dupont, Marie » romprait la requête.
 */
function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export type AuditPage = {
  events: AuditEvent[]
  /** Nombre d'événements correspondant aux filtres, toutes pages confondues. */
  total: number
  page: number
  pageCount: number
}

/**
 * Une page du journal — §42 à §48.
 *
 * Les bornes de PÉRIODE sont des jours civils COMORIENS, pas des jours UTC.
 * Sans cette conversion, un événement de 23 h 00 aux Comores — 20 h 00 UTC —
 * serait rangé au bon jour, mais celui de 01 h 00 aux Comores tomberait la
 * veille : la journée demandée n'aurait ni le bon début ni la bonne fin
 * (DEC-025 §e).
 */
export async function listAuditEvents(
  filters: AuditFilters,
  page = 1,
  pageSize = PAGE_SIZE
): Promise<AuditPage> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('audit_log').select(SELECT, { count: 'exact' })

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    // Objet (§47) et référence (§48) : le libellé figé, l'identifiant de la
    // ligne concernée, et le motif — les trois façons de retrouver un fait.
    query = query.or(
      `entity_label.ilike.%${search}%,entity_id.ilike.%${search}%,reason.ilike.%${search}%,comment.ilike.%${search}%`
    )
  }

  if (filters.actorId) query = query.eq('actor_id', filters.actorId)
  if (filters.moduleCode) query = query.eq('module_code', filters.moduleCode)
  if (filters.entityType) query = query.eq('entity_type', filters.entityType)
  if (filters.action) query = query.eq('action', filters.action)
  if (filters.result) query = query.eq('result', filters.result)

  const from = filters.from ? fromLocalInput(`${filters.from}T00:00`) : null
  if (from) query = query.gte('occurred_at', from)

  // Borne haute EXCLUSIVE au lendemain minuit : `<= 23:59` perdrait la dernière
  // minute de la journée, et un événement peut s'y produire.
  const to = filters.to ? fromLocalInput(`${nextDay(filters.to)}T00:00`) : null
  if (to) query = query.lt('occurred_at', to)

  const current = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const offset = (current - 1) * pageSize

  const { data, error, count } = await query
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error) {
    reportQueryFailure(
      'journal d’activité',
      error,
      'Le journal d’activité n’a pas pu être chargé.'
    )
  }

  const total = count ?? 0

  return {
    events: ((data ?? []) as unknown as RawEvent[]).map(toEvent),
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * Plafond d'un export du journal.
 *
 * `06_Audit.md` §64 autorise l'export sous permission ; il n'ordonne pas de
 * verser des décennies d'historique dans un seul classeur. Un plafond ANNONCÉ
 * vaut mieux qu'un fichier tronqué en silence — ou qu'un serveur qui renonce à
 * mi-parcours. L'utilisateur affine ses filtres, et le sous-titre du classeur
 * lui dit quand la limite a joué.
 */
export const EXPORT_LIMIT = 5000

/** Taille des tranches d'un export — sous la fenêtre par défaut de PostgREST. */
const EXPORT_CHUNK = 1000

/** Les événements d'un export, dans l'ordre de l'écran, plafonnés. */
export async function listAuditEventsForExport(
  filters: AuditFilters
): Promise<{ events: AuditEvent[]; total: number; truncated: boolean }> {
  const collected: AuditEvent[] = []
  let total = 0

  const maxChunks = Math.ceil(EXPORT_LIMIT / EXPORT_CHUNK)

  for (let chunk = 1; chunk <= maxChunks; chunk += 1) {
    const result = await listAuditEvents(filters, chunk, EXPORT_CHUNK)
    total = result.total

    collected.push(...result.events)

    if (result.events.length < EXPORT_CHUNK || chunk >= result.pageCount) break
  }

  const events = collected.slice(0, EXPORT_LIMIT)
  return { events, total, truncated: total > events.length }
}

/** Un événement précis, sans son détail avant/après. */
export async function getAuditEvent(id: number): Promise<AuditEvent | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('audit_log')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure(
      'événement d’audit',
      error,
      'Cet événement n’a pas pu être chargé.'
    )
  }

  return data ? toEvent(data as unknown as RawEvent) : null
}

/**
 * Détail avant/après — arbitré en base (DEC-038).
 *
 * La fonction rend TOUJOURS une réponse : « autorisé, voici », ou « refusé,
 * voici la capacité qui l'ouvrirait ». Aucun détail vide ne se fait passer pour
 * une absence de changement (DEC-017).
 */
export async function getAuditEventDetail(id: number): Promise<AuditEventDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('audit_entry_detail', { p_id: id })

  if (error) {
    reportQueryFailure(
      'détail d’un événement d’audit',
      error,
      'Le détail de cet événement n’a pas pu être chargé.'
    )
  }

  const row = (data as
    | {
        may_read: boolean
        required_permission: string | null
        before_data: Record<string, unknown> | null
        after_data: Record<string, unknown> | null
      }[]
    | null)?.[0]

  if (!row) return null

  return {
    mayRead: row.may_read,
    requiredPermission: row.required_permission,
    before: row.before_data,
    after: row.after_data,
  }
}

/**
 * Libellé d'une capacité, tel qu'il apparaît dans l'onglet « Permissions ».
 *
 * Un refus doit se lire « Consulter les imputations », pas
 * `billing.imputations.view` : l'utilisateur qui le lit doit pouvoir demander
 * ce qui lui manque, et il ne le demandera pas sous son nom technique.
 * Le catalogue est lisible par tout compte authentifié (migration 006) et ne
 * contient aucune donnée métier.
 */
export async function permissionLabel(code: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('permissions')
    .select('label')
    .eq('code', code)
    .maybeSingle()

  // Un libellé manquant n'empêche pas d'annoncer le refus : le code suffit.
  if (error) return null

  return (data as { label: string } | null)?.label ?? null
}

export type AuditActor = { id: string; label: string }

/**
 * Auteurs présents au journal — filtre §43.
 *
 * Lus depuis le journal, pas depuis la liste des utilisateurs :
 * `users.audit.view` n'ouvre pas `users.users.view` (DEC-024), et un compte
 * supprimé doit rester filtrable — son nom est figé sur chaque ligne.
 */
export async function listAuditActors(): Promise<AuditActor[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('audit_actors')

  if (error) {
    reportQueryFailure(
      'auteurs du journal',
      error,
      'La liste des auteurs n’a pas pu être chargée.'
    )
  }

  return ((data ?? []) as { actor_id: string; actor_label: string }[]).map((row) => ({
    id: row.actor_id,
    label: row.actor_label,
  }))
}
