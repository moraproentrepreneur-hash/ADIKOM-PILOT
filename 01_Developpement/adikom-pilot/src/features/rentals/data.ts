import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { PricingUnit } from '@/features/pricing/constants'
import type { FuelLevel, InspectionKind, RentalStatus } from './constants'

/**
 * Accès aux données des locations.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données.
 */

export {
  STATUS_LABELS,
  STATUS_TONES,
  FILTERABLE_STATUSES,
  displayStatus,
} from './constants'
export {
  calendarDaysUntil,
  FUEL_LEVEL_LABELS,
  FUEL_LEVEL_ORDER,
  INSPECTION_LABELS,
} from './constants'
export type { FuelLevel, InspectionKind, RentalStatus } from './constants'

export type RentalListItem = {
  id: string
  rentalNo: string
  clientId: string
  clientLabel: string
  vehicleId: string
  vehicleLabel: string
  plannedFrom: string
  plannedTo: string
  startedAt: string | null
  expectedReturnAt: string
  returnedAt: string | null
  status: RentalStatus
  lockedAmount: number
  lockedUnit: PricingUnit
}

export type RentalDetail = RentalListItem & {
  reservationId: string | null
  reservationNo: string | null
  lockedRuleId: string | null
  lockedSource: string | null
  lockedAt: string
  conditions: string | null
  notes: string | null
  statusReason: string | null
  statusChangedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * `tstzrange` renvoyé par PostgREST : `["2026-09-01 08:00:00+00","…")`.
 *
 * Le décalage tient sur deux chiffres, forme que JavaScript ne reconnaît pas
 * une fois l'espace remplacé par « T » : il est complété en « +00:00 ». Même
 * traitement que dans le module Réservations, pour la même raison.
 */
function parsePeriod(value: string | null): { from: string; to: string } {
  const bounds = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(value ?? '')
  if (!bounds) return { from: '', to: '' }

  const toIso = (raw: string) => {
    const normalised = raw.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
    const parsed = new Date(normalised)
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
  }

  return { from: toIso(bounds[1]), to: toIso(bounds[2]) }
}

type RawRow = {
  id: string
  rental_no: string
  client_id: string
  vehicle_id: string
  planned_period: string | null
  started_at: string | null
  expected_return_at: string
  returned_at: string | null
  status: RentalStatus
  locked_amount: number
  locked_unit: PricingUnit
  clients?: {
    type: string
    legal_name: string
    first_name: string | null
  } | null
  vehicles?: { vehicle_no: string; brand: string; model: string; plate: string | null } | null
}

const BASE_SELECT = `
  id, rental_no, client_id, vehicle_id, planned_period,
  started_at, expected_return_at, returned_at, status,
  locked_amount, locked_unit,
  clients ( type, legal_name, first_name ),
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

function vehicleLabel(row: RawRow): string {
  const vehicle = row.vehicles
  if (!vehicle) return '—'
  return `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''}`
}

function toListItem(row: RawRow): RentalListItem {
  const planned = parsePeriod(row.planned_period)

  return {
    id: row.id,
    rentalNo: row.rental_no,
    clientId: row.client_id,
    clientLabel: clientLabel(row),
    vehicleId: row.vehicle_id,
    vehicleLabel: vehicleLabel(row),
    plannedFrom: planned.from,
    plannedTo: planned.to,
    startedAt: row.started_at,
    expectedReturnAt: row.expected_return_at,
    returnedAt: row.returned_at,
    status: row.status,
    lockedAmount: row.locked_amount,
    lockedUnit: row.locked_unit,
  }
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export type RentalFilters = {
  search?: string
  status?: string
  clientId?: string
  vehicleId?: string
}

/**
 * Liste des locations.
 *
 * `LATE` ne peut pas être filtré en base — la valeur n'y est jamais écrite
 * (DEC-025 §a). Le filtre s'applique après lecture, sur le statut dérivé, afin
 * que l'utilisateur retrouve dans le filtre ce que la liste lui montre.
 */
export async function listRentals(filters: RentalFilters = {}): Promise<RentalListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('rentals').select(BASE_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(`rental_no.ilike.%${search}%,conditions.ilike.%${search}%`)
  }

  if (filters.status && filters.status !== 'LATE') query = query.eq('status', filters.status)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.vehicleId) query = query.eq('vehicle_id', filters.vehicleId)

  const { data, error } = await query.order('expected_return_at', { ascending: false }).limit(200)

  if (error) {
    reportQueryFailure('locations', error, 'La liste des locations n’a pas pu être chargée.')
  }

  const rows = ((data ?? []) as unknown as RawRow[]).map(toListItem)

  if (filters.status === 'LATE') {
    return rows.filter(
      (row) =>
        (row.status === 'IN_PROGRESS' || row.status === 'EXTENDED') &&
        new Date(row.expectedReturnAt).getTime() < Date.now()
    )
  }

  return rows
}

export async function getRentalDetail(id: string): Promise<RentalDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('rentals')
    .select(
      `${BASE_SELECT}, reservation_id, locked_rule_id, locked_source, locked_at,
       conditions, notes, status_reason, status_changed_at, created_at, updated_at,
       reservations ( reservation_no )`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('location', error, 'Cette location n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawRow & {
    reservation_id: string | null
    locked_rule_id: string | null
    locked_source: string | null
    locked_at: string
    conditions: string | null
    notes: string | null
    status_reason: string | null
    status_changed_at: string | null
    created_at: string
    updated_at: string
    reservations?: { reservation_no: string } | null
  }

  return {
    ...toListItem(row),
    reservationId: row.reservation_id,
    reservationNo: row.reservations?.reservation_no ?? null,
    lockedRuleId: row.locked_rule_id,
    lockedSource: row.locked_source,
    lockedAt: row.locked_at,
    conditions: row.conditions,
    notes: row.notes,
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* -------------------------------------------------------------------------- */
/*  États des lieux                                                            */
/* -------------------------------------------------------------------------- */

export type InspectionPhoto = {
  id: string
  fileName: string
  caption: string | null
}

export type Inspection = {
  id: string
  kind: InspectionKind
  performedAt: string
  mileage: number | null
  fuelLevel: FuelLevel | null
  exteriorCondition: string | null
  interiorCondition: string | null
  preexistingDamages: string | null
  observations: string | null
  photos: InspectionPhoto[]
}

/**
 * États des lieux d'une location, avec leurs photos.
 *
 * `storage_path` n'est JAMAIS renvoyé à l'interface : une photo s'ouvre par
 * `/api/inspections/[id]`, qui vérifie la permission puis délivre une URL
 * signée de courte durée. Exposer le chemin ne donnerait rien — le bucket est
 * privé et sans policy — mais le taire évite d'inviter à l'essayer.
 */
export async function listInspections(rentalId: string): Promise<Inspection[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('rental_inspections')
    .select(
      `id, kind, performed_at, mileage, fuel_level,
       exterior_condition, interior_condition, preexisting_damages, observations,
       rental_inspection_photos ( id, file_name, caption, is_archived )`
    )
    .eq('rental_id', rentalId)
    .order('performed_at')

  if (error) {
    reportQueryFailure(
      'états des lieux',
      error,
      'Les états des lieux n’ont pas pu être chargés.'
    )
  }

  type RawInspection = {
    id: string
    kind: InspectionKind
    performed_at: string
    mileage: number | null
    fuel_level: FuelLevel | null
    exterior_condition: string | null
    interior_condition: string | null
    preexisting_damages: string | null
    observations: string | null
    rental_inspection_photos:
      | { id: string; file_name: string; caption: string | null; is_archived: boolean }[]
      | null
  }

  return ((data ?? []) as unknown as RawInspection[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    performedAt: row.performed_at,
    mileage: row.mileage,
    fuelLevel: row.fuel_level,
    exteriorCondition: row.exterior_condition,
    interiorCondition: row.interior_condition,
    preexistingDamages: row.preexisting_damages,
    observations: row.observations,
    photos: (row.rental_inspection_photos ?? [])
      .filter((photo) => !photo.is_archived)
      .map((photo) => ({ id: photo.id, fileName: photo.file_name, caption: photo.caption })),
  }))
}
