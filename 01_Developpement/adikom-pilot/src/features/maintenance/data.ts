import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type {
  MaintenanceOrigin,
  MaintenancePriority,
  MaintenanceStatus,
} from './constants'

/**
 * Accès aux données des maintenances.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données. Sans `rental.maintenance.view`, ces
 * fonctions ne renvoient rien — et l'appelant doit alors DIRE qu'il ne sait
 * pas, jamais afficher zéro (DEC-017).
 */

export {
  ORIGIN_LABELS,
  ORIGIN_ORDER,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_TONES,
  FILTERABLE_STATUSES,
  NEXT_STATUSES,
  isCancellable,
  isCompletable,
  requiresValidate,
} from './constants'
export type {
  MaintenanceOrigin,
  MaintenancePriority,
  MaintenanceStatus,
} from './constants'

export type MaintenanceListItem = {
  id: string
  maintenanceNo: string
  vehicleId: string
  vehicleLabel: string
  origin: MaintenanceOrigin
  priority: MaintenancePriority
  status: MaintenanceStatus
  reason: string
  plannedAt: string | null
  completedAt: string | null
  /** `null` lorsque la maintenance n'immobilise pas : aucune occupation n'existe. */
  immobilizationFrom: string | null
  immobilizationTo: string | null
}

export type MaintenanceDetail = MaintenanceListItem & {
  incidentId: string | null
  incidentNo: string | null
  rentalId: string | null
  rentalNo: string | null
  previousMaintenanceId: string | null
  previousMaintenanceNo: string | null
  providerSupplierId: string | null
  providerLabel: string | null
  description: string | null
  intervention: string | null
  observations: string | null
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
 * traitement que dans les modules Réservations et Locations.
 */
function parsePeriod(value: string | null): { from: string | null; to: string | null } {
  const bounds = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(value ?? '')
  if (!bounds) return { from: null, to: null }

  const toIso = (raw: string) => {
    const normalised = raw.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
    const parsed = new Date(normalised)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  return { from: toIso(bounds[1]), to: toIso(bounds[2]) }
}

type RawRow = {
  id: string
  maintenance_no: string
  vehicle_id: string
  origin: MaintenanceOrigin
  priority: MaintenancePriority
  status: MaintenanceStatus
  reason: string
  planned_at: string | null
  completed_at: string | null
  immobilization_period: string | null
  vehicles?: { vehicle_no: string; brand: string; model: string; plate: string | null } | null
}

const BASE_SELECT = `
  id, maintenance_no, vehicle_id, origin, priority, status, reason,
  planned_at, completed_at, immobilization_period,
  vehicles ( vehicle_no, brand, model, plate )
`

/** Même composition que partout ailleurs : marque, modèle, immatriculation. */
function vehicleLabel(row: RawRow): string {
  const vehicle = row.vehicles
  if (!vehicle) return '—'
  return `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''}`
}

function toListItem(row: RawRow): MaintenanceListItem {
  const period = parsePeriod(row.immobilization_period)

  return {
    id: row.id,
    maintenanceNo: row.maintenance_no,
    vehicleId: row.vehicle_id,
    vehicleLabel: vehicleLabel(row),
    origin: row.origin,
    priority: row.priority,
    status: row.status,
    reason: row.reason,
    plannedAt: row.planned_at,
    completedAt: row.completed_at,
    immobilizationFrom: period.from,
    immobilizationTo: period.to,
  }
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export type MaintenanceFilters = {
  search?: string
  status?: string
  origin?: string
  priority?: string
  vehicleId?: string
  incidentId?: string
}

export async function listMaintenances(
  filters: MaintenanceFilters = {}
): Promise<MaintenanceListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('vehicle_maintenances').select(BASE_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(`maintenance_no.ilike.%${search}%,reason.ilike.%${search}%`)
  }

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.origin) query = query.eq('origin', filters.origin)
  if (filters.priority) query = query.eq('priority', filters.priority)
  if (filters.vehicleId) query = query.eq('vehicle_id', filters.vehicleId)
  if (filters.incidentId) query = query.eq('incident_id', filters.incidentId)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(200)

  if (error) {
    reportQueryFailure('maintenances', error, 'La liste des maintenances n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawRow[]).map(toListItem)
}

export async function getMaintenanceDetail(id: string): Promise<MaintenanceDetail | null> {
  const supabase = await createSupabaseServerClient()

  /*
   * Les libellés d'incident, de location, de maintenance précédente et de
   * prestataire viennent de ressources embarquées : RLS s'applique à chacune
   * INDÉPENDAMMENT. Un lecteur sans `rental.rentals.view` obtient la
   * maintenance, mais pas le numéro de la location — et l'écran le DIT plutôt
   * que d'afficher un tiret (DEC-017, DEC-024).
   */
  const { data, error } = await supabase
    .from('vehicle_maintenances')
    .select(
      `${BASE_SELECT}, incident_id, rental_id, previous_maintenance_id, provider_supplier_id,
       description, intervention, observations, status_reason, status_changed_at,
       created_at, updated_at,
       vehicle_incidents ( incident_no ),
       rentals ( rental_no ),
       previous:vehicle_maintenances!previous_maintenance_id ( maintenance_no ),
       suppliers ( supplier_no, legal_name, trade_name )`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('maintenance', error, 'Cette maintenance n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawRow & {
    incident_id: string | null
    rental_id: string | null
    previous_maintenance_id: string | null
    provider_supplier_id: string | null
    description: string | null
    intervention: string | null
    observations: string | null
    status_reason: string | null
    status_changed_at: string | null
    created_at: string
    updated_at: string
    vehicle_incidents?: { incident_no: string } | null
    rentals?: { rental_no: string } | null
    previous?: { maintenance_no: string } | null
    suppliers?: { supplier_no: string; legal_name: string; trade_name: string | null } | null
  }

  const supplier = row.suppliers

  return {
    ...toListItem(row),
    incidentId: row.incident_id,
    incidentNo: row.vehicle_incidents?.incident_no ?? null,
    rentalId: row.rental_id,
    rentalNo: row.rentals?.rental_no ?? null,
    previousMaintenanceId: row.previous_maintenance_id,
    previousMaintenanceNo: row.previous?.maintenance_no ?? null,
    providerSupplierId: row.provider_supplier_id,
    providerLabel: supplier
      ? `${supplier.trade_name ?? supplier.legal_name} (${supplier.supplier_no})`
      : null,
    description: row.description,
    intervention: row.intervention,
    observations: row.observations,
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Maintenances d'un véhicule, pour sa fiche.
 *
 * L'appelant ne DOIT appeler cette fonction qu'après avoir vérifié
 * `rental.maintenance.view`, et afficher `null` — section absente — dans le
 * cas contraire. Un tableau vide obtenu par refus de lecture se lirait « ce
 * véhicule n'a jamais été entretenu » : l'affirmation que DEC-017 interdit de
 * tirer d'une absence de droit.
 */
export async function listVehicleMaintenances(
  vehicleId: string
): Promise<MaintenanceListItem[]> {
  return listMaintenances({ vehicleId })
}

/** Prestataires disponibles — le référentiel fournisseurs, et lui seul (§29). */
export async function listProviderOptions(): Promise<
  { id: string; label: string; isMaintenanceProvider: boolean }[]
> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('id, supplier_no, legal_name, trade_name, type, status')
    .eq('status', 'ACTIVE')
    .order('legal_name')

  if (error) {
    reportQueryFailure('prestataires', error, 'La liste des prestataires n’a pas pu être chargée.')
  }

  return (data ?? []).map((supplier) => ({
    id: supplier.id,
    label: `${supplier.trade_name ?? supplier.legal_name} (${supplier.supplier_no})`,
    // Signalé, non imposé : §29 dit « lorsque pertinent », et un fournisseur de
    // véhicules peut réaliser lui-même l'intervention.
    isMaintenanceProvider: supplier.type === 'MAINTENANCE_PROVIDER',
  }))
}
