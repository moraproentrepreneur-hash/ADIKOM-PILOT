import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { PricingUnit } from '@/features/pricing/constants'
import type { ReservationStatus } from './constants'

/**
 * Accès aux données des réservations.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données. Une réservation invisible à l'écran l'est
 * aussi dans un export et dans un document.
 */

export {
  STATUS_LABELS,
  STATUS_TONES,
  FILTERABLE_STATUSES,
  displayStatus,
} from './constants'
export type { ReservationStatus } from './constants'

export type ReservationListItem = {
  id: string
  reservationNo: string
  clientId: string
  clientLabel: string
  categoryId: string | null
  categoryLabel: string | null
  vehicleId: string | null
  vehicleLabel: string | null
  startsAt: string
  endsAt: string
  status: ReservationStatus
  lockedAmount: number | null
  lockedUnit: PricingUnit | null
}

export type ReservationDetail = ReservationListItem & {
  lockedRuleId: string | null
  lockedSource: string | null
  lockedAt: string | null
  conditions: string | null
  notes: string | null
  statusReason: string | null
  statusChangedAt: string | null
  createdAt: string
  updatedAt: string
  /** Location née de cette réservation, le cas échéant. */
  rentalId: string | null
  rentalNo: string | null
}

/**
 * `tstzrange` renvoyé par PostgREST : `["2026-09-01 08:00:00+00","…")`.
 *
 * Les bornes sont extraites plutôt que devinées : une période mal lue
 * fausserait l'affichage ET la recherche de disponibilité.
 */
function parsePeriod(value: string | null): { startsAt: string; endsAt: string } {
  const bounds = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(value ?? '')
  if (!bounds) return { startsAt: '', endsAt: '' }

  /*
   * PostgreSQL rend « 2026-09-12 05:00:00+00 » : décalage sur DEUX chiffres.
   * Une fois l'espace remplacé par « T », cette forme n'est plus reconnue par
   * JavaScript — `new Date('…T05:00:00+00')` renvoie une date invalide, et la
   * période s'affichait vide. Le décalage est donc complété en « +00:00 ».
   */
  const toIso = (raw: string) => {
    const normalised = raw.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
    const parsed = new Date(normalised)
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
  }

  return { startsAt: toIso(bounds[1]), endsAt: toIso(bounds[2]) }
}

type RawRow = {
  id: string
  reservation_no: string
  client_id: string
  category_id: string | null
  vehicle_id: string | null
  period: string | null
  status: ReservationStatus
  locked_amount: number | null
  locked_unit: PricingUnit | null
  clients?: {
    client_no: string
    type: string
    legal_name: string
    first_name: string | null
  } | null
  vehicle_categories?: { label: string } | null
  vehicles?: { vehicle_no: string; brand: string; model: string; plate: string | null } | null
}

const BASE_SELECT = `
  id, reservation_no, client_id, category_id, vehicle_id, period, status,
  locked_amount, locked_unit,
  clients ( client_no, type, legal_name, first_name ),
  vehicle_categories ( label ),
  vehicles ( vehicle_no, brand, model, plate )
`

/** Même composition que la fiche client : un particulier porte son prénom. */
function clientLabel(row: RawRow): string {
  const client = row.clients
  if (!client) return '—'
  if (client.type === 'INDIVIDUAL' && client.first_name) {
    return `${client.first_name} ${client.legal_name}`.trim()
  }
  return client.legal_name
}

function vehicleLabel(row: RawRow): string | null {
  const vehicle = row.vehicles
  if (!vehicle) return null
  return `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''}`
}

function toListItem(row: RawRow): ReservationListItem {
  const period = parsePeriod(row.period)

  return {
    id: row.id,
    reservationNo: row.reservation_no,
    clientId: row.client_id,
    clientLabel: clientLabel(row),
    categoryId: row.category_id,
    categoryLabel: row.vehicle_categories?.label ?? null,
    vehicleId: row.vehicle_id,
    vehicleLabel: vehicleLabel(row),
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    status: row.status,
    lockedAmount: row.locked_amount,
    lockedUnit: row.locked_unit,
  }
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export type ReservationFilters = {
  search?: string
  status?: string
  /** Plusieurs états à la fois — le Tableau de location en interroge par groupe. */
  statuses?: ReservationStatus[]
  clientId?: string
  vehicleId?: string
  /**
   * Catégorie du VÉHICULE AFFECTÉ.
   *
   * Une réservation porte bien une catégorie « demandée », mais elle est
   * facultative : réserver un véhicule précis n'oblige pas à nommer sa
   * famille. Filtrer là-dessus écarterait donc les réservations les plus
   * fermes — celles qui désignent déjà leur véhicule.
   *
   * Le filtre porte sur la catégorie RÉELLE du véhicule engagé. Une
   * réservation sans véhicule affecté n'y répond pas : c'est sans effet pour
   * le Tableau de location, qui ne montre que des réservations confirmées,
   * lesquelles ont toujours un véhicule (contrainte
   * `reservations_confirmed_complete`).
   */
  categoryId?: string
  from?: string
  to?: string
}

/**
 * Liste des réservations.
 *
 * Le filtre par statut `EXPIRED` ne peut pas être posé en base — la valeur n'y
 * est jamais écrite (DEC-025 §a). Il est appliqué après lecture, sur le statut
 * dérivé, de sorte que l'utilisateur retrouve dans le filtre ce qu'il voit
 * dans la liste.
 */
export async function listReservations(
  filters: ReservationFilters = {}
): Promise<ReservationListItem[]> {
  const supabase = await createSupabaseServerClient()

  /*
   * Filtrer sur la catégorie du véhicule affecté exige une jointure INTERNE :
   * sans elle, PostgREST ne saurait pas sur quoi porter la condition. Elle
   * n'est posée QUE dans ce cas, afin que les réservations sans véhicule
   * continuent d'apparaître partout ailleurs.
   */
  const select = filters.categoryId
    ? BASE_SELECT.replace('vehicles (', 'vehicles!inner (')
    : BASE_SELECT

  let query = supabase.from('reservations').select(select)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(`reservation_no.ilike.%${search}%,conditions.ilike.%${search}%`)
  }

  if (filters.status && filters.status !== 'EXPIRED') {
    query = query.eq('status', filters.status)
  }
  if (filters.statuses?.length) query = query.in('status', filters.statuses)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.vehicleId) query = query.eq('vehicle_id', filters.vehicleId)
  if (filters.categoryId) query = query.eq('vehicles.category_id', filters.categoryId)

  /*
   * CHEVAUCHEMENT, et non inclusion : une réservation à cheval sur la borne de
   * la fenêtre doit apparaître. `overlaps` est l'opérateur de plage — une
   * comparaison ordinaire trierait les plages entre elles au lieu de les
   * confronter à la fenêtre.
   */
  if (filters.from || filters.to) {
    query = query.overlaps('period', `[${filters.from ?? ''},${filters.to ?? ''})`)
  }

  const { data, error } = await query.order('period', { ascending: false }).limit(200)

  if (error) {
    reportQueryFailure('réservations', error, 'La liste des réservations n’a pas pu être chargée.')
  }

  const rows = ((data ?? []) as unknown as RawRow[]).map(toListItem)

  if (filters.status === 'EXPIRED') {
    return rows.filter(
      (row) =>
        (row.status === 'DRAFT' || row.status === 'PENDING') &&
        new Date(row.startsAt).getTime() < Date.now()
    )
  }

  return rows
}

export async function getReservationDetail(id: string): Promise<ReservationDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('reservations')
    .select(
      `${BASE_SELECT}, locked_rule_id, locked_source, locked_at, conditions, notes,
       status_reason, status_changed_at, created_at, updated_at,
       rentals ( id, rental_no )`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('réservation', error, 'Cette réservation n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawRow & {
    locked_rule_id: string | null
    locked_source: string | null
    locked_at: string | null
    conditions: string | null
    notes: string | null
    status_reason: string | null
    status_changed_at: string | null
    created_at: string
    updated_at: string
    rentals?: { id: string; rental_no: string }[] | null
  }

  const rental = row.rentals?.[0] ?? null

  return {
    ...toListItem(row),
    lockedRuleId: row.locked_rule_id,
    lockedSource: row.locked_source,
    lockedAt: row.locked_at,
    conditions: row.conditions,
    notes: row.notes,
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rentalId: rental?.id ?? null,
    rentalNo: rental?.rental_no ?? null,
  }
}

/* -------------------------------------------------------------------------- */
/*  Recherche de disponibilité                                                 */
/* -------------------------------------------------------------------------- */

export type AvailableVehicle = {
  id: string
  vehicleNo: string
  label: string
  categoryId: string | null
  categoryLabel: string | null
}

/**
 * Véhicules réellement disponibles sur une période.
 *
 * DEUX REQUÊTES, PAS N APPELS.
 *
 * `is_vehicle_available()` répond pour UN véhicule ; l'interroger pour chacun
 * ferait autant d'allers-retours qu'il y a de véhicules. La liste des périodes
 * qui chevauchent la fenêtre est donc lue une fois, et les véhicules engagés
 * en sont retirés.
 *
 * Cette recherche est un CONFORT D'INTERFACE. L'autorité reste la contrainte
 * d'exclusion : entre cet affichage et la confirmation, un autre utilisateur
 * peut avoir engagé le même véhicule, et c'est la base qui refusera.
 */
export async function listAvailableVehicles(
  from: string,
  to: string,
  categoryId?: string | null
): Promise<AvailableVehicle[]> {
  const supabase = await createSupabaseServerClient()

  let candidates = supabase
    .from('vehicles')
    .select('id, vehicle_no, brand, model, plate, category_id, vehicle_categories ( label )')
    .neq('status', 'RETIRED')
    .is('exit_date', null)
    .order('brand')
    .limit(500)

  if (categoryId) candidates = candidates.eq('category_id', categoryId)

  const { data: vehicles, error: vehiclesError } = await candidates

  if (vehiclesError) {
    reportQueryFailure('parc', vehiclesError, 'Le parc n’a pas pu être consulté.')
  }

  const { data: busy, error: busyError } = await supabase
    .from('vehicle_occupations')
    .select('vehicle_id')
    .eq('is_active', true)
    .overlaps('period', `[${from},${to})`)

  if (busyError) {
    reportQueryFailure(
      'disponibilité',
      busyError,
      'La disponibilité des véhicules n’a pas pu être vérifiée.'
    )
  }

  const engaged = new Set((busy ?? []).map((row) => row.vehicle_id as string))

  type Candidate = {
    id: string
    vehicle_no: string
    brand: string
    model: string
    plate: string | null
    category_id: string | null
    vehicle_categories: { label: string } | null
  }

  return ((vehicles ?? []) as unknown as Candidate[])
    .filter((vehicle) => !engaged.has(vehicle.id))
    .map((vehicle) => ({
      id: vehicle.id,
      vehicleNo: vehicle.vehicle_no,
      label: `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''}`,
      categoryId: vehicle.category_id,
      categoryLabel: vehicle.vehicle_categories?.label ?? null,
    }))
}
