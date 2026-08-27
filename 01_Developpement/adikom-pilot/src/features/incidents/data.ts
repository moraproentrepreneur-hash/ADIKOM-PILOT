import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type {
  DamageResponsibility,
  DamageSeverity,
  IncidentKind,
  IncidentStatus,
} from './constants'

/**
 * Accès aux données des incidents.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données. Sans `rental.incidents.view`, ces
 * fonctions ne renvoient rien — et l'appelant doit alors DIRE qu'il ne sait
 * pas, jamais afficher zéro (DEC-017).
 */

export {
  KIND_LABELS,
  KIND_ORDER,
  STATUS_LABELS,
  STATUS_TONES,
  FILTERABLE_STATUSES,
  NEXT_STATUSES,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  SEVERITY_ORDER,
  RESPONSIBILITY_LABELS,
  RESPONSIBILITY_ORDER,
} from './constants'
export type {
  DamageResponsibility,
  DamageSeverity,
  IncidentKind,
  IncidentStatus,
} from './constants'

export type IncidentListItem = {
  id: string
  incidentNo: string
  vehicleId: string
  vehicleLabel: string
  rentalId: string | null
  rentalNo: string | null
  kind: IncidentKind
  status: IncidentStatus
  occurredAt: string
  description: string
  damageCount: number
}

export type Damage = {
  id: string
  location: string
  description: string | null
  severity: DamageSeverity
  responsibility: DamageResponsibility
  isPreexisting: boolean
}

export type IncidentPhoto = {
  id: string
  fileName: string
  caption: string | null
  damageId: string | null
}

export type IncidentDetail = Omit<IncidentListItem, 'damageCount'> & {
  inspectionId: string | null
  statusReason: string | null
  statusChangedAt: string | null
  createdAt: string
  updatedAt: string
  damages: Damage[]
  photos: IncidentPhoto[]
}

type RawRow = {
  id: string
  incident_no: string
  vehicle_id: string
  rental_id: string | null
  kind: IncidentKind
  status: IncidentStatus
  occurred_at: string
  description: string
  vehicles?: { vehicle_no: string; brand: string; model: string; plate: string | null } | null
  rentals?: { rental_no: string } | null
  incident_damages?: { count: number }[] | null
}

const BASE_SELECT = `
  id, incident_no, vehicle_id, rental_id, kind, status, occurred_at, description,
  vehicles ( vehicle_no, brand, model, plate ),
  rentals ( rental_no )
`

/** Même composition que partout ailleurs : marque, modèle, immatriculation. */
function vehicleLabel(row: RawRow): string {
  const vehicle = row.vehicles
  if (!vehicle) return '—'
  return `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''}`
}

function toListItem(row: RawRow): IncidentListItem {
  return {
    id: row.id,
    incidentNo: row.incident_no,
    vehicleId: row.vehicle_id,
    vehicleLabel: vehicleLabel(row),
    rentalId: row.rental_id,
    rentalNo: row.rentals?.rental_no ?? null,
    kind: row.kind,
    status: row.status,
    occurredAt: row.occurred_at,
    description: row.description,
    damageCount: row.incident_damages?.[0]?.count ?? 0,
  }
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export type IncidentFilters = {
  search?: string
  status?: string
  kind?: string
  vehicleId?: string
  rentalId?: string
}

export async function listIncidents(filters: IncidentFilters = {}): Promise<IncidentListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('vehicle_incidents')
    .select(`${BASE_SELECT}, incident_damages ( count )`)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(`incident_no.ilike.%${search}%,description.ilike.%${search}%`)
  }

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.vehicleId) query = query.eq('vehicle_id', filters.vehicleId)
  if (filters.rentalId) query = query.eq('rental_id', filters.rentalId)

  const { data, error } = await query.order('occurred_at', { ascending: false }).limit(200)

  if (error) {
    reportQueryFailure('incidents', error, 'La liste des incidents n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawRow[]).map(toListItem)
}

export async function getIncidentDetail(id: string): Promise<IncidentDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('vehicle_incidents')
    .select(
      `${BASE_SELECT}, inspection_id, status_reason, status_changed_at, created_at, updated_at,
       incident_damages ( id, location, description, severity, responsibility, is_preexisting ),
       incident_photos ( id, file_name, caption, damage_id, is_archived )`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('incident', error, 'Cet incident n’a pas pu être chargé.')
  }
  if (!data) return null

  /*
   * `incident_damages` ne porte pas la même chose ici que dans la liste : là
   * un décompte, ici les lignes elles-mêmes. Il est donc RETIRÉ de `RawRow`
   * avant d'être redéclaré — une intersection aurait conservé le type du
   * décompte et fait passer les vrais dommages pour des erreurs.
   */
  const row = data as unknown as Omit<RawRow, 'incident_damages'> & {
    inspection_id: string | null
    status_reason: string | null
    status_changed_at: string | null
    created_at: string
    updated_at: string
    incident_damages?: {
      id: string
      location: string
      description: string | null
      severity: DamageSeverity
      responsibility: DamageResponsibility
      is_preexisting: boolean
    }[]
    incident_photos?: {
      id: string
      file_name: string
      caption: string | null
      damage_id: string | null
      is_archived: boolean
    }[]
  }

  const base = toListItem({ ...row, incident_damages: undefined })

  return {
    ...base,
    inspectionId: row.inspection_id,
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Les préexistants d'abord : c'est l'ordre dans lequel on les lit lors d'un
    // contrôle — ce qui était déjà là, puis ce qui ne l'était pas.
    damages: (row.incident_damages ?? [])
      .map((damage) => ({
        id: damage.id,
        location: damage.location,
        description: damage.description,
        severity: damage.severity,
        responsibility: damage.responsibility,
        isPreexisting: damage.is_preexisting,
      }))
      .sort((a, b) => Number(b.isPreexisting) - Number(a.isPreexisting)),
    photos: (row.incident_photos ?? [])
      .filter((photo) => !photo.is_archived)
      .map((photo) => ({
        id: photo.id,
        fileName: photo.file_name,
        caption: photo.caption,
        damageId: photo.damage_id,
      })),
  }
}

/**
 * Incidents d'un véhicule, pour sa fiche.
 *
 * L'appelant ne DOIT appeler cette fonction qu'après avoir vérifié
 * `rental.incidents.view`, et afficher `null` — section absente — dans le cas
 * contraire. Un tableau vide obtenu par refus de lecture se lirait « ce
 * véhicule n'a connu aucun incident », ce qui est exactement l'affirmation que
 * DEC-017 interdit de produire à partir d'une absence de droit.
 */
export async function listVehicleIncidents(vehicleId: string): Promise<IncidentListItem[]> {
  return listIncidents({ vehicleId })
}
