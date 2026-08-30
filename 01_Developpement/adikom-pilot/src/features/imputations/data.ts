import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { MaintenanceDocumentType } from '@/features/maintenance/costs-data'
import type { ImputationStatus } from './constants'

/**
 * Accès aux données des imputations fournisseurs — Étape 2.4, LOT 4.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données. Sans `billing.imputations.view`, ces
 * fonctions ne renvoient rien — et l'appelant doit alors DIRE qu'il ne sait
 * pas, jamais afficher zéro (DEC-017).
 *
 * CE QUE CE MODULE NE CALCULE JAMAIS
 *
 * Ni net à payer, ni solde, ni montant dû. DEC-013 : seule une imputation
 * `Imputée` — validée ET rattachée à une facture fournisseur — réduit un
 * montant, et la facture fournisseur relève de l'Étape 2.5. Le seul agrégat
 * produit ici est la consommation du PLAFOND de la maintenance.
 *
 * DEC-018 : `imputations` référence `app_users` six fois. Toute jointure vers
 * cette table désignerait donc la colonne explicitement — raison pour laquelle
 * aucune n'est faite : les noms d'acteurs relèvent du journal d'audit.
 */

export type { ImputationStatus } from './constants'

export type ImputationListItem = {
  id: string
  imputationNo: string
  status: ImputationStatus
  amount: number
  /** `null` par construction au LOT 4 : la facture relève de l'Étape 2.5. */
  supplierInvoiceId: string | null
  createdAt: string
  maintenanceId: string
  /** `null` sans `rental.maintenance.view` — l'écran le dit (DEC-017). */
  maintenanceNo: string | null
  vehicleLabel: string | null
  supplierId: string
  /** `null` sans `parties.suppliers.view`. */
  supplierLabel: string | null
}

export type ImputationDetail = ImputationListItem & {
  justification: string
  statusReason: string | null
  validatedAt: string | null
  cancelledAt: string | null
  imputedAt: string | null
  updatedAt: string
}

export type ImputationDocument = {
  id: string
  docType: MaintenanceDocumentType
  label: string
  fileName: string
}

const BASE_SELECT = `
  id, imputation_no, status, amount, supplier_invoice_id, created_at,
  maintenance_id, supplier_id,
  vehicle_maintenances ( maintenance_no, vehicles ( brand, model, plate ) ),
  suppliers ( supplier_no, legal_name, trade_name )
`

type RawRow = {
  id: string
  imputation_no: string
  status: ImputationStatus
  amount: number
  supplier_invoice_id: string | null
  created_at: string
  maintenance_id: string
  supplier_id: string
  vehicle_maintenances?: {
    maintenance_no: string
    vehicles?: { brand: string; model: string; plate: string | null } | null
  } | null
  suppliers?: { supplier_no: string; legal_name: string; trade_name: string | null } | null
}

function toListItem(row: RawRow): ImputationListItem {
  const vehicle = row.vehicle_maintenances?.vehicles
  const supplier = row.suppliers

  return {
    id: row.id,
    imputationNo: row.imputation_no,
    status: row.status,
    amount: row.amount,
    supplierInvoiceId: row.supplier_invoice_id,
    createdAt: row.created_at,
    maintenanceId: row.maintenance_id,
    // Ressources embarquées : RLS s'applique à CHACUNE indépendamment. Un
    // lecteur sans `rental.maintenance.view` obtient l'imputation, pas le
    // numéro de l'intervention — et l'écran le DIT (DEC-017, DEC-024).
    maintenanceNo: row.vehicle_maintenances?.maintenance_no ?? null,
    vehicleLabel: vehicle
      ? `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''}`
      : null,
    supplierId: row.supplier_id,
    supplierLabel: supplier
      ? `${supplier.trade_name ?? supplier.legal_name} (${supplier.supplier_no})`
      : null,
  }
}

export type ImputationFilters = {
  search?: string
  status?: string
  supplierId?: string
  maintenanceId?: string
  /** Filtre dérivé (§31) : validée et sans facture rattachée. */
  awaitingInvoice?: boolean
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export async function listImputations(
  filters: ImputationFilters = {}
): Promise<ImputationListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('imputations').select(BASE_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(`imputation_no.ilike.%${search}%,justification.ilike.%${search}%`)
  }

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId)
  if (filters.maintenanceId) query = query.eq('maintenance_id', filters.maintenanceId)

  // §31 : « imputation en attente de facture ». État dérivé, filtré sur ses
  // deux composantes plutôt que sur un statut inventé.
  if (filters.awaitingInvoice) {
    query = query.eq('status', 'VALIDATED').is('supplier_invoice_id', null)
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(200)

  if (error) {
    reportQueryFailure('imputations', error, 'La liste des imputations n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawRow[]).map(toListItem)
}

export async function getImputationDetail(id: string): Promise<ImputationDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('imputations')
    .select(
      `${BASE_SELECT}, justification, status_reason, validated_at, cancelled_at,
       imputed_at, updated_at`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('imputation', error, 'Cette imputation n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawRow & {
    justification: string
    status_reason: string | null
    validated_at: string | null
    cancelled_at: string | null
    imputed_at: string | null
    updated_at: string
  }

  return {
    ...toListItem(row),
    justification: row.justification,
    statusReason: row.status_reason,
    validatedAt: row.validated_at,
    cancelledAt: row.cancelled_at,
    imputedAt: row.imputed_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Imputations d'une maintenance, pour son onglet dédié.
 *
 * L'appelant ne DOIT appeler cette fonction qu'après avoir vérifié
 * `billing.imputations.view`, et faire disparaître la section dans le cas
 * contraire. Un tableau vide obtenu par refus de lecture se lirait « cette
 * dépense n'a jamais été imputée » : l'affirmation que DEC-017 interdit de
 * tirer d'une absence de droit.
 */
export async function listMaintenanceImputations(
  maintenanceId: string
): Promise<ImputationListItem[]> {
  return listImputations({ maintenanceId })
}

/** Imputations d'un fournisseur — Workflow 06 §23 et §42. */
export async function listSupplierImputations(
  supplierId: string
): Promise<ImputationListItem[]> {
  return listImputations({ supplierId })
}

/**
 * Ce que le plafond du LOT 3 a déjà consommé — Module 07 §40.
 *
 * `null` sans `rental.maintenance.cost.view` : le plafond vit dans
 * `maintenance_costs`, dont la lecture est réservée à cette capacité. La
 * section financière disparaît alors, plutôt que d'annoncer « 0 KMF »
 * disponibles (DEC-017).
 *
 * Le total imputé, lui, est lisible avec `billing.imputations.view` seule :
 * c'est une donnée d'imputation, pas un coût de maintenance.
 */
export type ImputableBudget = {
  /** Plafond arrêté par le LOT 3. `null` = non arrêté, jamais « zéro ». */
  ceiling: number | null
  /** Σ des imputations non annulées. Toujours connu. */
  used: number
  /** Plafond − utilisé. `null` tant que le plafond n'est pas arrêté. */
  remaining: number | null
}

export async function getImputableBudget(
  maintenanceId: string,
  options: { canSeeCosts: boolean }
): Promise<ImputableBudget> {
  const supabase = await createSupabaseServerClient()

  const [costs, imputations] = await Promise.all([
    options.canSeeCosts
      ? supabase
          .from('maintenance_costs')
          .select('imputable_amount')
          .eq('maintenance_id', maintenanceId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('imputations')
      .select('amount, status')
      .eq('maintenance_id', maintenanceId)
      .neq('status', 'CANCELLED'),
  ])

  if (costs.error) {
    reportQueryFailure('montant imputable', costs.error, 'Le montant imputable n’a pas pu être lu.')
  }
  if (imputations.error) {
    reportQueryFailure(
      'imputations',
      imputations.error,
      'Le total imputé n’a pas pu être calculé.'
    )
  }

  // DEC-010 : somme d'entiers, aucun flottant.
  const used = (imputations.data ?? []).reduce((total, row) => total + row.amount, 0)
  const ceiling = costs.data?.imputable_amount ?? null

  return {
    ceiling,
    used,
    remaining: ceiling === null ? null : ceiling - used,
  }
}

/** Justificatifs d'une imputation — Workflow 06 §35. */
export async function listImputationDocuments(
  imputationId: string
): Promise<ImputationDocument[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('imputation_documents')
    .select('id, doc_type, label, file_name, is_archived')
    .eq('imputation_id', imputationId)
    .order('created_at')

  if (error) {
    reportQueryFailure(
      'justificatifs d’imputation',
      error,
      'Les justificatifs n’ont pas pu être chargés.'
    )
  }

  return (data ?? [])
    .filter((document) => !document.is_archived)
    .map((document) => ({
      id: document.id,
      docType: document.doc_type as MaintenanceDocumentType,
      label: document.label,
      fileName: document.file_name,
    }))
}

/**
 * Fournisseurs candidats à une imputation, pour une maintenance donnée.
 *
 * Workflow 06 §4 : le fournisseur du véhicule. §33 : « ou qu'une autre
 * relation justifie l'imputation » — d'où les anciens rattachements, que
 * `vehicle_supplier_history` conserve précisément pour cela (Règles
 * fournisseurs §60, §62).
 *
 * Le PRESTATAIRE de la maintenance n'y figure pas au titre de prestataire :
 * Workflow 05 §29 exige de le distinguer du fournisseur du véhicule, même
 * quand c'est la même entité. Il n'apparaît que s'il a fourni le véhicule.
 *
 * `null` lorsque le véhicule n'est pas lisible : l'écran le dit (DEC-017).
 */
export type ImputationSupplierOption = {
  id: string
  label: string
  /** Fournisseur actuel du véhicule (§4) plutôt qu'ancien rattachement (§33). */
  isCurrent: boolean
}

export async function listImputationSupplierOptions(
  maintenanceId: string
): Promise<ImputationSupplierOption[] | null> {
  const supabase = await createSupabaseServerClient()

  const { data: maintenance, error: maintenanceError } = await supabase
    .from('vehicle_maintenances')
    .select('vehicle_id, vehicles ( current_supplier_id )')
    .eq('id', maintenanceId)
    .maybeSingle()

  if (maintenanceError) {
    reportQueryFailure(
      'véhicule de la maintenance',
      maintenanceError,
      'Le rattachement fournisseur n’a pas pu être lu.'
    )
  }

  const row = maintenance as unknown as
    | { vehicle_id: string; vehicles?: { current_supplier_id: string | null } | null }
    | null

  // Ni la maintenance ni le véhicule ne sont lisibles : on ne conclut rien.
  if (!row?.vehicles) return null

  const currentId = row.vehicles.current_supplier_id

  const { data: history, error: historyError } = await supabase
    .from('vehicle_supplier_history')
    .select('supplier_id')
    .eq('vehicle_id', row.vehicle_id)

  if (historyError) {
    reportQueryFailure(
      'historique fournisseur',
      historyError,
      'L’historique des fournisseurs du véhicule n’a pas pu être lu.'
    )
  }

  const ids = new Set<string>()
  if (currentId) ids.add(currentId)
  for (const entry of history ?? []) ids.add(entry.supplier_id)

  if (ids.size === 0) return []

  const { data: suppliers, error: suppliersError } = await supabase
    .from('suppliers')
    .select('id, supplier_no, legal_name, trade_name')
    .in('id', [...ids])
    .order('legal_name')

  if (suppliersError) {
    reportQueryFailure(
      'fournisseurs',
      suppliersError,
      'La liste des fournisseurs n’a pas pu être chargée.'
    )
  }

  // Aucun fournisseur lisible alors qu'il en existe : c'est un refus de
  // lecture, pas une absence. On le signale par `null`.
  if ((suppliers ?? []).length === 0) return null

  return (suppliers ?? []).map((supplier) => ({
    id: supplier.id,
    label: `${supplier.trade_name ?? supplier.legal_name} (${supplier.supplier_no})`,
    isCurrent: supplier.id === currentId,
  }))
}

/** Fournisseurs présents dans les imputations, pour le filtre de la liste. */
export async function listImputationSupplierFilters(): Promise<
  { id: string; label: string }[]
> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('id, supplier_no, legal_name, trade_name, status')
    .eq('status', 'ACTIVE')
    .order('legal_name')

  if (error) {
    reportQueryFailure(
      'fournisseurs',
      error,
      'La liste des fournisseurs n’a pas pu être chargée.'
    )
  }

  return (data ?? []).map((supplier) => ({
    id: supplier.id,
    label: `${supplier.trade_name ?? supplier.legal_name} (${supplier.supplier_no})`,
  }))
}
