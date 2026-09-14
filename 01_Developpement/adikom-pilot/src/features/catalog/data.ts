import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import { toAmount, type ServicePurpose, type ServiceStatus } from './constants'

/**
 * Accès aux données du catalogue de services — LOT 20, DEC-043.
 *
 * TOUTES les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données. En particulier, les PRIX D'ACHAT vivent
 * dans une table dont la policy de lecture exige `catalog.services.cost.view` —
 * un appelant qui ne la détient pas ne reçoit AUCUNE ligne, ici comme ailleurs.
 *
 * LE PRIX APPLICABLE N'EST PAS CALCULÉ ICI. Il est résolu EN BASE
 * (`resolve_service_price`, `resolve_service_cost`), unique implémentation de
 * D16(c) : un écran ne peut donc pas appliquer une règle différente d'un autre,
 * il n'a pas les moyens de la reformuler.
 */

export {
  PURPOSE_LABELS,
  PURPOSE_HELP,
  STATUS_LABELS,
  STATUS_TONES,
  STATUS_HELP,
  allowsPurchase,
  allowsSale,
  formatMoney,
  margin,
} from './constants'
export type { ServicePurpose, ServiceStatus, Margin } from './constants'

/* -------------------------------------------------------------------------- */
/*  Catégories                                                                 */
/* -------------------------------------------------------------------------- */

export type ServiceCategoryRow = {
  id: string
  code: string
  label: string
  description: string | null
  isActive: boolean
  displayOrder: number
  serviceCount: number
}

type RawCategory = {
  id: string
  code: string
  label: string
  description: string | null
  is_active: boolean
  display_order: number
  services: { count: number }[]
}

/**
 * Catégories du catalogue.
 *
 * `includeArchived` est explicite plutôt que par défaut : l'écran de gestion
 * les montre — il faut pouvoir les réactiver — tandis qu'un formulaire de
 * création de service ne doit proposer QUE les catégories actives (§3.1 du
 * Module 10). Deux besoins opposés, un paramètre qui les nomme.
 */
export async function listServiceCategories(
  includeArchived = false
): Promise<ServiceCategoryRow[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('service_categories')
    .select('id, code, label, description, is_active, display_order, services ( count )')

  if (!includeArchived) query = query.eq('is_active', true)

  const { data, error } = await query
    .order('display_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) {
    reportQueryFailure(
      'catalogue:catégories',
      error,
      'Les catégories de services n’ont pas pu être chargées.'
    )
  }

  return ((data ?? []) as unknown as RawCategory[]).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    description: row.description,
    isActive: row.is_active,
    displayOrder: row.display_order,
    serviceCount: row.services?.[0]?.count ?? 0,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Services                                                                   */
/* -------------------------------------------------------------------------- */

export type ServiceRow = {
  id: string
  serviceNo: string
  label: string
  categoryId: string
  categoryLabel: string | null
  categoryIsActive: boolean
  purpose: ServicePurpose
  status: ServiceStatus
  unitLabel: string | null
  description: string | null
  notes: string | null
  variantCount: number
  createdAt: string
}

type RawService = {
  id: string
  service_no: string
  label: string
  category_id: string
  purpose: ServicePurpose
  status: ServiceStatus
  unit_label: string | null
  description: string | null
  notes: string | null
  created_at: string
  service_categories: { label: string; is_active: boolean } | null
  service_variants: { count: number }[]
}

const SERVICE_SELECT = `
  id, service_no, label, category_id, purpose, status, unit_label,
  description, notes, created_at,
  service_categories ( label, is_active ),
  service_variants ( count )
`

function toServiceRow(row: RawService): ServiceRow {
  return {
    id: row.id,
    serviceNo: row.service_no,
    label: row.label,
    categoryId: row.category_id,
    categoryLabel: row.service_categories?.label ?? null,
    categoryIsActive: row.service_categories?.is_active ?? true,
    purpose: row.purpose,
    status: row.status,
    unitLabel: row.unit_label,
    description: row.description,
    notes: row.notes,
    variantCount: row.service_variants?.[0]?.count ?? 0,
    createdAt: row.created_at,
  }
}

export type ServiceFilters = {
  search?: string
  status?: string
  categoryId?: string
  purpose?: string
}

export async function listServices(filters: ServiceFilters = {}): Promise<ServiceRow[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('services').select(SERVICE_SELECT)

  if (filters.search) {
    const term = `%${filters.search.trim()}%`
    query = query.or(
      `label.ilike.${term},service_no.ilike.${term},description.ilike.${term}`
    )
  }

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)

  /*
   * FILTRER PAR DESTINATION, C'EST RÉPONDRE À « QUE PUIS-JE VENDRE ? ».
   *
   * Un service `BOTH` est vendable ET achetable : il doit donc apparaître dans
   * les deux filtres. Un `eq` strict le ferait disparaître des deux listes
   * utiles, et l'écran mentirait.
   */
  if (filters.purpose === 'SALE') query = query.in('purpose', ['SALE', 'BOTH'])
  else if (filters.purpose === 'PURCHASE') query = query.in('purpose', ['PURCHASE', 'BOTH'])
  else if (filters.purpose === 'BOTH') query = query.eq('purpose', 'BOTH')

  const { data, error } = await query
    .order('label', { ascending: true })
    .limit(400)

  if (error) {
    reportQueryFailure('catalogue:services', error, 'Les services n’ont pas pu être chargés.')
  }

  return ((data ?? []) as unknown as RawService[]).map(toServiceRow)
}

export async function getService(id: string): Promise<ServiceRow | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('services')
    .select(SERVICE_SELECT)
    .eq('id', id)
    .maybeSingle()

  // Une ligne absente est un cas fonctionnel (404) ; une erreur de requête ne
  // l'est pas et ne doit pas être présentée comme une absence (DEC-017).
  if (error) {
    reportQueryFailure('catalogue:service', error, 'Ce service n’a pas pu être chargé.')
  }
  if (!data) return null

  return toServiceRow(data as unknown as RawService)
}

/* -------------------------------------------------------------------------- */
/*  Variantes                                                                  */
/* -------------------------------------------------------------------------- */

export type ServiceVariantRow = {
  id: string
  serviceId: string
  label: string
  sku: string | null
  isDefault: boolean
  isActive: boolean
  displayOrder: number
}

export async function listServiceVariants(serviceId: string): Promise<ServiceVariantRow[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('service_variants')
    .select('id, service_id, label, sku, is_default, is_active, display_order')
    .eq('service_id', serviceId)
    .order('display_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) {
    reportQueryFailure('catalogue:variantes', error, 'Les variantes n’ont pas pu être chargées.')
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    serviceId: row.service_id as string,
    label: row.label as string,
    sku: row.sku as string | null,
    isDefault: row.is_default as boolean,
    isActive: row.is_active as boolean,
    displayOrder: row.display_order as number,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Versions de prix                                                           */
/* -------------------------------------------------------------------------- */

export type PriceVersionRow = {
  id: string
  variantId: string
  amount: number | null
  validFrom: string
  validTo: string | null
  isActive: boolean
  reason: string | null
  deactivatedAt: string | null
  deactivationReason: string | null
  createdAt: string
}

type RawVersion = {
  id: string
  variant_id: string
  amount: number | string
  valid_from: string
  valid_to: string | null
  is_active: boolean
  reason: string | null
  deactivated_at: string | null
  deactivation_reason: string | null
  created_at: string
}

const VERSION_SELECT = `
  id, variant_id, amount, valid_from, valid_to, is_active, reason,
  deactivated_at, deactivation_reason, created_at
`

function toVersionRow(row: RawVersion): PriceVersionRow {
  return {
    id: row.id,
    variantId: row.variant_id,
    amount: toAmount(row.amount),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    isActive: row.is_active,
    reason: row.reason,
    deactivatedAt: row.deactivated_at,
    deactivationReason: row.deactivation_reason,
    createdAt: row.created_at,
  }
}

async function listVersions(
  table: 'service_variant_prices' | 'service_variant_costs',
  variantIds: readonly string[]
): Promise<PriceVersionRow[]> {
  if (variantIds.length === 0) return []

  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from(table)
    .select(VERSION_SELECT)
    .in('variant_id', variantIds)
    .order('valid_from', { ascending: false })

  /*
   * UNE LECTURE REFUSÉE N'EST PAS UNE LECTURE VIDE — mais ici, elle l'est.
   *
   * RLS ne lève AUCUNE erreur : elle rend zéro ligne. L'écran ne doit donc
   * jamais écrire « aucun prix d'achat » sur la foi de ce tableau : c'est la
   * CAPACITÉ, vérifiée séparément, qui décide du message affiché (DEC-017).
   * Une erreur réelle, elle, reste nommée.
   */
  if (error) {
    reportQueryFailure(
      `catalogue:${table}`,
      error,
      'L’historique des prix n’a pas pu être chargé.'
    )
  }

  return ((data ?? []) as unknown as RawVersion[]).map(toVersionRow)
}

/** Historique complet du prix de vente, versions retirées comprises. */
export function listSalePrices(variantIds: readonly string[]) {
  return listVersions('service_variant_prices', variantIds)
}

/** Historique complet du prix d'achat. Vide sans `catalog.services.cost.view`. */
export function listPurchaseCosts(variantIds: readonly string[]) {
  return listVersions('service_variant_costs', variantIds)
}

/* -------------------------------------------------------------------------- */
/*  Résolution — D16(c)                                                        */
/* -------------------------------------------------------------------------- */

export type ResolvedPrice = {
  id: string
  amount: number
  validFrom: string
  validTo: string | null
}

async function resolve(
  fn: 'resolve_service_price' | 'resolve_service_cost',
  variantId: string,
  on?: string
): Promise<ResolvedPrice | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc(fn, {
    p_variant_id: variantId,
    ...(on ? { p_on: on } : {}),
  })

  if (error) {
    reportQueryFailure(`catalogue:${fn}`, error, 'Le prix applicable n’a pas pu être déterminé.')
  }

  const rows = (data ?? []) as {
    price_id?: string
    cost_id?: string
    amount: number | string
    valid_from: string
    valid_to: string | null
  }[]

  const row = rows[0]
  if (!row) return null

  const amount = toAmount(row.amount)
  if (amount === null) return null

  return {
    id: (row.price_id ?? row.cost_id) as string,
    amount,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  }
}

/**
 * Prix de vente applicable à une date.
 *
 * `null` signifie « aucune version applicable », jamais « zéro » : un prix
 * absent n'est pas un prix nul (DEC-008, D16(d)).
 */
export function resolveSalePrice(variantId: string, on?: string) {
  return resolve('resolve_service_price', variantId, on)
}

/** Prix d'achat applicable. `null` aussi lorsque la capacité manque. */
export function resolvePurchaseCost(variantId: string, on?: string) {
  return resolve('resolve_service_cost', variantId, on)
}
