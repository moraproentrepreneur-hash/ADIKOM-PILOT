import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import { todayISO } from '@/lib/dates'
import type {
  FuelType,
  OccupationSource,
  TransmissionType,
  VehicleDocumentType,
  VehicleOrigin,
  VehicleStatus,
} from './constants'

/**
 * Accès aux données du Parc automobile.
 *
 * Règle structurante (05_Regles_Metier/02_Parc_Automobile.md §67 et §69) :
 * le statut d'un véhicule décrit sa situation, il ne prouve jamais sa
 * disponibilité. Celle-ci se demande à `is_vehicle_available`, qui interroge le
 * calendrier — jamais au champ `status`.
 */

export {
  STATUS_LABELS,
  STATUS_TONES,
  STATUS_HINTS,
  OPERATIONAL_STATUSES,
  ORIGIN_LABELS,
  FUEL_LABELS,
  TRANSMISSION_LABELS,
  DOCUMENT_LABELS,
  OCCUPATION_LABELS,
  OCCUPATION_TONES,
} from './constants'
export type {
  VehicleStatus,
  VehicleOrigin,
  FuelType,
  TransmissionType,
  VehicleDocumentType,
  OccupationSource,
} from './constants'

export type Option = { id: string; label: string }

export type CategoryRow = {
  id: string
  code: string
  label: string
  description: string | null
  isActive: boolean
  displayOrder: number
  vehicleCount: number
}

export type VehicleListItem = {
  id: string
  vehicleNo: string
  plate: string | null
  brand: string
  model: string
  modelYear: number | null
  categoryId: string
  categoryLabel: string | null
  status: VehicleStatus
  origin: VehicleOrigin
  supplierId: string | null
  supplierLabel: string | null
  partnerId: string | null
  partnerLabel: string | null
  mileage: number
}

export type VehicleDetail = VehicleListItem & {
  color: string | null
  fuel: FuelType | null
  transmission: TransmissionType | null
  seats: number | null
  doors: number | null
  initialMileage: number | null
  entryDate: string | null
  exitDate: string | null
  exitReason: string | null
  statusReason: string | null
  statusChangedAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

type RawVehicleRow = {
  id: string
  vehicle_no: string
  plate: string | null
  brand: string
  model: string
  model_year: number | null
  category_id: string
  status: VehicleStatus
  origin: VehicleOrigin
  current_supplier_id: string | null
  partner_id: string | null
  mileage: number
  vehicle_categories: { label: string } | null
  suppliers: { legal_name: string; supplier_no: string } | null
  partners: { legal_name: string; partner_no: string } | null
}

const LIST_SELECT = `
  id, vehicle_no, plate, brand, model, model_year, category_id, status, origin,
  current_supplier_id, partner_id, mileage,
  vehicle_categories ( label ),
  suppliers ( legal_name, supplier_no ),
  partners ( legal_name, partner_no )
`

const DETAIL_SELECT = `
  ${LIST_SELECT}, color, fuel, transmission, seats, doors, initial_mileage,
  entry_date, exit_date, exit_reason, status_reason, status_changed_at,
  notes, created_at, updated_at
`

function toListItem(row: RawVehicleRow): VehicleListItem {
  return {
    id: row.id,
    vehicleNo: row.vehicle_no,
    plate: row.plate,
    brand: row.brand,
    model: row.model,
    modelYear: row.model_year,
    categoryId: row.category_id,
    categoryLabel: row.vehicle_categories?.label ?? null,
    status: row.status,
    origin: row.origin,
    supplierId: row.current_supplier_id,
    supplierLabel: row.suppliers
      ? `${row.suppliers.legal_name} (${row.suppliers.supplier_no})`
      : null,
    partnerId: row.partner_id,
    partnerLabel: row.partners
      ? `${row.partners.legal_name} (${row.partners.partner_no})`
      : null,
    mileage: row.mileage,
  }
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

/* -------------------------------------------------------------------------- */
/*  Catégories                                                                 */
/* -------------------------------------------------------------------------- */

export async function listCategories(includeInactive = false): Promise<CategoryRow[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('vehicle_categories')
    .select('id, code, label, description, is_active, display_order, vehicles ( count )')

  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query.order('display_order').order('label')

  if (error) {
    reportQueryFailure('catégories', error, 'Les catégories n’ont pas pu être chargées.')
  }

  type Raw = {
    id: string
    code: string
    label: string
    description: string | null
    is_active: boolean
    display_order: number
    vehicles: { count: number }[] | null
  }

  return ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    description: row.description,
    isActive: row.is_active,
    displayOrder: row.display_order,
    vehicleCount: row.vehicles?.[0]?.count ?? 0,
  }))
}

export async function listCategoryOptions(): Promise<Option[]> {
  const categories = await listCategories()
  return categories.map((category) => ({ id: category.id, label: category.label }))
}

/* -------------------------------------------------------------------------- */
/*  Véhicules                                                                  */
/* -------------------------------------------------------------------------- */

export type VehicleFilters = {
  search?: string
  status?: string
  categoryId?: string
  supplierId?: string
  /** Rattachement à un partenaire — distinct de `supplierId` (DEC-021). */
  partnerId?: string
  origin?: string
}

export async function listVehicles(filters: VehicleFilters = {}): Promise<VehicleListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('vehicles').select(LIST_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(
      [
        `vehicle_no.ilike.%${search}%`,
        `plate.ilike.%${search}%`,
        `brand.ilike.%${search}%`,
        `model.ilike.%${search}%`,
      ].join(',')
    )
  }

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.supplierId) query = query.eq('current_supplier_id', filters.supplierId)
  if (filters.partnerId) query = query.eq('partner_id', filters.partnerId)
  if (filters.origin) query = query.eq('origin', filters.origin)

  const { data, error } = await query.order('brand').order('model').limit(300)

  if (error) {
    reportQueryFailure('parc', error, 'Le parc automobile n’a pas pu être chargé.')
  }

  return ((data ?? []) as unknown as RawVehicleRow[]).map(toListItem)
}

export async function getVehicleDetail(id: string): Promise<VehicleDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) reportQueryFailure('véhicule', error, 'Cette fiche véhicule n’a pas pu être chargée.')
  if (!data) return null

  const row = data as unknown as RawVehicleRow & {
    color: string | null
    fuel: FuelType | null
    transmission: TransmissionType | null
    seats: number | null
    doors: number | null
    initial_mileage: number | null
    entry_date: string | null
    exit_date: string | null
    exit_reason: string | null
    status_reason: string | null
    status_changed_at: string | null
    notes: string | null
    created_at: string
    updated_at: string
  }

  return {
    ...toListItem(row),
    color: row.color,
    fuel: row.fuel,
    transmission: row.transmission,
    seats: row.seats,
    doors: row.doors,
    initialMileage: row.initial_mileage,
    entryDate: row.entry_date,
    exitDate: row.exit_date,
    exitReason: row.exit_reason,
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Véhicules sélectionnables : un véhicule retiré du parc n'est pas proposé. */
export async function listVehicleOptions(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select('id, vehicle_no, brand, model, plate')
    .neq('status', 'RETIRED')
    .order('brand')
    .limit(500)

  if (error) {
    reportQueryFailure('parc', error, 'La liste des véhicules n’a pas pu être chargée.')
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${row.brand} ${row.model}${row.plate ? ` — ${row.plate}` : ''} · ${row.vehicle_no}`,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Historique fournisseur                                                     */
/* -------------------------------------------------------------------------- */

export type SupplierPeriod = {
  id: string
  supplierId: string
  supplierLabel: string
  startedOn: string
  endedOn: string | null
  reason: string | null
}

export async function listSupplierHistory(vehicleId: string): Promise<SupplierPeriod[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('vehicle_supplier_history')
    .select('id, supplier_id, started_on, ended_on, reason, suppliers ( legal_name, supplier_no )')
    .eq('vehicle_id', vehicleId)
    .order('started_on', { ascending: false })

  if (error) {
    reportQueryFailure(
      'historique fournisseur',
      error,
      'L’historique des fournisseurs n’a pas pu être chargé.'
    )
  }

  type Raw = {
    id: string
    supplier_id: string
    started_on: string
    ended_on: string | null
    reason: string | null
    suppliers: { legal_name: string; supplier_no: string } | null
  }

  return ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    supplierLabel: row.suppliers
      ? `${row.suppliers.legal_name} (${row.suppliers.supplier_no})`
      : 'Fournisseur inconnu',
    startedOn: row.started_on,
    endedOn: row.ended_on,
    reason: row.reason,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Documents                                                                  */
/* -------------------------------------------------------------------------- */

export type VehicleDocument = {
  id: string
  docType: VehicleDocumentType
  label: string
  reference: string | null
  issuedOn: string | null
  expiresOn: string | null
  storagePath: string | null
  fileName: string | null
  isArchived: boolean
  notes: string | null
}

export async function listVehicleDocuments(
  vehicleId: string,
  includeArchived = false
): Promise<VehicleDocument[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('vehicle_documents')
    .select(
      'id, doc_type, label, reference, issued_on, expires_on, storage_path, file_name, is_archived, notes'
    )
    .eq('vehicle_id', vehicleId)

  if (!includeArchived) query = query.eq('is_archived', false)

  const { data, error } = await query.order('expires_on', { nullsFirst: false })

  if (error) {
    reportQueryFailure('documents', error, 'Les documents n’ont pas pu être chargés.')
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    docType: row.doc_type as VehicleDocumentType,
    label: row.label,
    reference: row.reference,
    issuedOn: row.issued_on,
    expiresOn: row.expires_on,
    storagePath: row.storage_path,
    fileName: row.file_name,
    isArchived: row.is_archived,
    notes: row.notes,
  }))
}

/**
 * Documents dont l'échéance approche ou est passée — Module 01 §14.
 *
 * Une assurance, une visite technique, une carte grise : le tableau de bord
 * doit pouvoir les signaler avant qu'elles n'expirent. « Les alertes doivent
 * être basées sur les dates réellement enregistrées » — aucune échéance n'est
 * déduite d'une périodicité supposée, et un document sans `expires_on` ne
 * remonte jamais.
 *
 * Les documents archivés en sont exclus : ils ont été remplacés.
 *
 * La lecture se fait sous `rental.documents.view` OU `rental.fleet.view`, comme
 * la policy de la table (migration 023). Sans l'une des deux, la requête ne
 * renvoie rien — l'appelant doit donc avoir vérifié la capacité, sans quoi il
 * lirait une liste vide comme une absence d'échéance (DEC-017).
 */
export type ExpiringDocument = {
  id: string
  vehicleId: string
  vehicleLabel: string
  docType: VehicleDocumentType
  label: string
  expiresOn: string
}

export async function listExpiringVehicleDocuments(
  withinDays: number,
  limit = 5
): Promise<ExpiringDocument[]> {
  const supabase = await createSupabaseServerClient()

  // Jour civil des Comores (DEC-025 §e) : une échéance au 30 n'est pas
  // dépassée le 30, et l'horizon se compte en jours de calendrier.
  const today = todayISO()
  const [year, month, day] = today.split('-').map(Number)
  const horizon = new Date(Date.UTC(year, month - 1, day + withinDays))
    .toISOString()
    .slice(0, 10)

  const { data, error } = await supabase
    .from('vehicle_documents')
    .select('id, vehicle_id, doc_type, label, expires_on, vehicles ( brand, model, plate )')
    .eq('is_archived', false)
    .not('expires_on', 'is', null)
    .lte('expires_on', horizon)
    .order('expires_on', { ascending: true })
    .limit(limit)

  if (error) {
    reportQueryFailure(
      'échéances de documents',
      error,
      'Les échéances de documents n’ont pas pu être chargées.'
    )
  }

  type Raw = {
    id: string
    vehicle_id: string
    doc_type: VehicleDocumentType
    label: string
    expires_on: string
    vehicles?: { brand: string; model: string; plate: string | null } | null
  }

  return ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    vehicleId: row.vehicle_id,
    // Sans `rental.fleet.view`, le véhicule reste inconnu : le document est
    // lisible, sa monture ne l'est pas. L'écran le dit plutôt que d'inventer.
    vehicleLabel: row.vehicles
      ? `${row.vehicles.brand} ${row.vehicles.model}${row.vehicles.plate ? ` — ${row.vehicles.plate}` : ''}`
      : 'Véhicule non lisible',
    docType: row.doc_type,
    label: row.label,
    expiresOn: row.expires_on,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Disponibilité                                                              */
/* -------------------------------------------------------------------------- */

export type Occupation = {
  id: string
  source: OccupationSource
  sourceId: string | null
  from: string
  to: string
  reason: string | null
}

/**
 * Périodes bloquées d'un véhicule.
 *
 * §68 : le calendrier doit refléter les différentes périodes plutôt qu'un seul
 * statut permanent.
 */
export async function listOccupations(vehicleId: string): Promise<Occupation[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('vehicle_occupations')
    .select('id, source, source_id, period, reason')
    .eq('vehicle_id', vehicleId)
    .eq('is_active', true)
    .order('period')
    .limit(100)

  if (error) {
    reportQueryFailure('disponibilité', error, 'Le calendrier du véhicule n’a pas pu être chargé.')
  }

  /**
   * PostgreSQL renvoie un intervalle sous la forme `["borne","borne")`.
   * Il est décomposé ici plutôt qu'à l'affichage : un écran ne doit pas avoir à
   * connaître la syntaxe des intervalles PostgreSQL.
   */
  return (data ?? []).flatMap((row) => {
    const match = /^[[(]"?([^",]*)"?,"?([^",]*)"?[\])]$/.exec(String(row.period))
    if (!match) return []

    return [
      {
        id: row.id,
        source: row.source as OccupationSource,
        sourceId: row.source_id,
        from: match[1],
        to: match[2],
        reason: row.reason,
      },
    ]
  })
}

/** Disponibilité réelle sur une période : statut ET calendrier (§67). */
export async function isVehicleAvailable(
  vehicleId: string,
  from: string,
  to: string
): Promise<boolean> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('is_vehicle_available', {
    p_vehicle_id: vehicleId,
    p_period: `[${from},${to})`,
  })

  if (error) {
    reportQueryFailure(
      'disponibilité',
      error,
      'La disponibilité du véhicule n’a pas pu être vérifiée.'
    )
  }

  return data === true
}
