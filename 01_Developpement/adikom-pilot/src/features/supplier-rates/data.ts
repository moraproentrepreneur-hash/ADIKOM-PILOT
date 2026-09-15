import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { PricingUnit } from '@/features/pricing/constants'
import { toAmount } from './constants'

/**
 * Accès aux coûts d'acquisition des véhicules — LOT 21, DEC-044.
 *
 * TOUTES les requêtes passent par le client porteur de la session : RLS reste la
 * barrière au niveau des données. `supplier_vehicle_rates` a une policy de
 * lecture qui exige `rental.pricing.supplier.view` — et ELLE SEULE. Un appelant
 * qui ne la détient pas ne reçoit AUCUNE ligne, ici comme ailleurs, et aucune
 * fonction de ce fichier ne peut lui en rendre une.
 *
 * LE COÛT APPLICABLE N'EST PAS CALCULÉ ICI. Il est résolu EN BASE
 * (`resolve_supplier_rate`, `resolve_supplier_rates`), unique implémentation de
 * D16(c) : un écran ne peut donc pas appliquer une règle différente d'un autre,
 * il n'a pas les moyens de la reformuler.
 *
 * UNE LECTURE REFUSÉE N'EST PAS UNE LECTURE VIDE. RLS ne lève aucune erreur :
 * elle rend zéro ligne. Les écrans ne doivent donc JAMAIS écrire « aucun coût »
 * sur la foi d'un tableau vide — c'est la CAPACITÉ, vérifiée séparément, qui
 * décide du message affiché (DEC-017).
 */

export { formatRate, commission, COMMISSION_GAP_MESSAGES } from './constants'
export type { Commission, CommissionResult, CommissionGap } from './constants'

/* -------------------------------------------------------------------------- */
/*  Versions de coût                                                           */
/* -------------------------------------------------------------------------- */

export type SupplierRateRow = {
  id: string
  vehicleId: string
  vehicleLabel: string | null
  vehicleNo: string | null
  supplierId: string
  supplierLabel: string | null
  amount: number | null
  unit: PricingUnit
  validFrom: string
  validTo: string | null
  isActive: boolean
  conditions: string | null
  reason: string | null
  deactivatedAt: string | null
  deactivationReason: string | null
  createdAt: string
}

type RawRate = {
  id: string
  vehicle_id: string
  supplier_id: string
  amount: number | string
  unit: PricingUnit
  valid_from: string
  valid_to: string | null
  is_active: boolean
  conditions: string | null
  reason: string | null
  deactivated_at: string | null
  deactivation_reason: string | null
  created_at: string
  vehicles: { vehicle_no: string; brand: string; model: string; plate: string | null } | null
  suppliers: { legal_name: string } | null
}

const RATE_SELECT = `
  id, vehicle_id, supplier_id, amount, unit, valid_from, valid_to, is_active,
  conditions, reason, deactivated_at, deactivation_reason, created_at,
  vehicles ( vehicle_no, brand, model, plate ),
  suppliers ( legal_name )
`

function toRateRow(row: RawRate): SupplierRateRow {
  const vehicle = row.vehicles

  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    // `null` signifie « non lisible avec vos droits », jamais « sans véhicule » :
    // `vehicles_select` exige `rental.fleet.view`, que le lecteur peut ne pas
    // détenir. L'écran doit le DIRE plutôt qu'afficher un tiret (DEC-017).
    vehicleLabel: vehicle
      ? `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''}`
      : null,
    vehicleNo: vehicle?.vehicle_no ?? null,
    supplierId: row.supplier_id,
    supplierLabel: row.suppliers?.legal_name ?? null,
    amount: toAmount(row.amount),
    unit: row.unit,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    isActive: row.is_active,
    conditions: row.conditions,
    reason: row.reason,
    deactivatedAt: row.deactivated_at,
    deactivationReason: row.deactivation_reason,
    createdAt: row.created_at,
  }
}

export type SupplierRateFilters = {
  vehicleId?: string
  supplierId?: string
  /** Les versions retirées sont exclues par défaut : elles ne s'appliquent plus. */
  includeRetired?: boolean
}

/**
 * Historique des coûts d'acquisition.
 *
 * Ordonné du plus récent au plus ancien : la question courante est « combien
 * paie-t-on aujourd'hui ? », et la chronologie se lit ensuite.
 */
export async function listSupplierRates(
  filters: SupplierRateFilters = {}
): Promise<SupplierRateRow[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('supplier_vehicle_rates').select(RATE_SELECT)

  if (filters.vehicleId) query = query.eq('vehicle_id', filters.vehicleId)
  if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId)
  if (!filters.includeRetired) query = query.eq('is_active', true)

  const { data, error } = await query
    .order('valid_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    reportQueryFailure(
      'tarifs-fournisseurs',
      error,
      'Les coûts d’acquisition n’ont pas pu être chargés.'
    )
  }

  return ((data ?? []) as unknown as RawRate[]).map(toRateRow)
}

/* -------------------------------------------------------------------------- */
/*  Résolution — D16(c)                                                        */
/* -------------------------------------------------------------------------- */

export type ResolvedCost = {
  rateId: string
  supplierId: string
  amount: number
  unit: PricingUnit
  validFrom: string
  validTo: string | null
  conditions: string | null
}

type RawResolved = {
  vehicle_id?: string
  rate_id: string | null
  supplier_id: string | null
  amount: number | string | null
  unit: PricingUnit | null
  valid_from: string | null
  valid_to: string | null
  conditions: string | null
}

function toResolved(row: RawResolved | undefined): ResolvedCost | null {
  if (!row || !row.rate_id || !row.unit || !row.supplier_id) return null

  const amount = toAmount(row.amount)
  // `null` ici signifie « aucune version applicable », jamais « zéro » : un coût
  // absent n'est pas un coût nul (DEC-008, D16(d)).
  if (amount === null) return null

  return {
    rateId: row.rate_id,
    supplierId: row.supplier_id,
    amount,
    unit: row.unit,
    validFrom: row.valid_from as string,
    validTo: row.valid_to,
    conditions: row.conditions,
  }
}

/**
 * Coût d'acquisition applicable à un véhicule, à une date.
 *
 * `null` signifie l'une de trois choses, que l'appelant doit distinguer : aucune
 * version applicable, aucun coût jamais saisi, ou capacité de lecture absente.
 * Le tableau seul ne les sépare pas — c'est à l'écran de vérifier la capacité.
 */
export async function resolveSupplierRate(
  vehicleId: string,
  on?: string
): Promise<ResolvedCost | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('resolve_supplier_rate', {
    p_vehicle_id: vehicleId,
    ...(on ? { p_on: on } : {}),
  })

  if (error) {
    reportQueryFailure(
      'tarifs-fournisseurs:résolution',
      error,
      'Le coût d’acquisition applicable n’a pas pu être déterminé.'
    )
  }

  return toResolved((data ?? [])[0] as RawResolved | undefined)
}

/**
 * Le même calcul, pour tout le parc en une requête.
 *
 * La résolution reste faite EN BASE, par la même fonction : cette variante ne
 * réimplémente pas le prédicat, elle le pose sur une liste (migration 086).
 */
export async function resolveSupplierRatesByVehicle(
  on?: string
): Promise<Map<string, ResolvedCost>> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('resolve_supplier_rates', {
    ...(on ? { p_on: on } : {}),
  })

  if (error) {
    reportQueryFailure(
      'tarifs-fournisseurs:résolution-par-lot',
      error,
      'Les coûts d’acquisition applicables n’ont pas pu être déterminés.'
    )
  }

  const map = new Map<string, ResolvedCost>()

  for (const row of (data ?? []) as RawResolved[]) {
    const resolved = toResolved(row)
    if (row.vehicle_id && resolved) map.set(row.vehicle_id, resolved)
  }

  return map
}

/**
 * Tarif client STANDARD applicable à UN véhicule, à une date.
 *
 * Le pendant du résolveur de coût, côté client. `p_client_id = null` : c'est le
 * barème, jamais une condition consentie à un client — cette fonction sert des
 * écrans qui ne parlent d'aucun client. DEC-002 n'est pas réécrite ici : elle
 * est appliquée par `resolve_pricing_rule` (migration 017).
 *
 * `null` = aucun tarif applicable, OU capacité de lecture absente. L'appelant
 * distingue les deux en vérifiant la capacité, jamais en interprétant ce `null`.
 */
export async function resolveStandardPrice(
  vehicleId: string,
  on?: string
): Promise<{ amount: number; unit: PricingUnit } | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('resolve_pricing_rule', {
    p_client_id: null,
    p_vehicle_id: vehicleId,
    ...(on ? { p_on: on } : {}),
  })

  if (error) {
    reportQueryFailure(
      'tarifs-fournisseurs:tarif-client',
      error,
      'Le tarif client applicable n’a pas pu être déterminé.'
    )
  }

  const row = (data ?? [])[0] as
    | { amount: number | string | null; unit: PricingUnit | null }
    | undefined

  const amount = toAmount(row?.amount)
  return amount !== null && row?.unit ? { amount, unit: row.unit } : null
}

/* -------------------------------------------------------------------------- */
/*  Le parc, vu depuis le coût                                                 */
/* -------------------------------------------------------------------------- */

export type VehicleOrigin = 'OWNED' | 'SUPPLIED' | 'PARTNERSHIP' | 'OTHER'

export type AcquisitionVehicleRow = {
  id: string
  vehicleNo: string
  label: string
  origin: VehicleOrigin
  status: string
  categoryLabel: string | null
  supplierId: string | null
  supplierLabel: string | null
  /** Coût applicable à la date demandée. `null` = aucune version applicable. */
  cost: ResolvedCost | null
  /** Tarif client STANDARD applicable — aucune condition client n'y entre. */
  standardPrice: { amount: number; unit: PricingUnit } | null
}

type RawVehicle = {
  id: string
  vehicle_no: string
  brand: string
  model: string
  plate: string | null
  origin: VehicleOrigin
  status: string
  current_supplier_id: string | null
  vehicle_categories: { label: string } | null
  suppliers: { legal_name: string } | null
}

export type AcquisitionFilters = {
  search?: string
  supplierId?: string
  origin?: string
  /** Jour métier de référence, au format `AAAA-MM-JJ`. */
  on: string
}

/**
 * Le parc et son coût d'acquisition à une date.
 *
 * POURQUOI TOUS LES VÉHICULES, ET PAS SEULEMENT LES VÉHICULES FOURNIS
 *
 * Un écran qui n'afficherait que les véhicules `SUPPLIED` laisserait croire que
 * les autres n'ont pas de coût. Ils en ont un — ADIKOM l'ignore simplement,
 * faute de décision (P-2 pour les véhicules ADIKOM ; aucune décision du tout
 * pour les partenariats). L'écran les montre donc, et DIT pourquoi leur ligne
 * est vide : c'est l'inverse d'un zéro silencieux.
 *
 * Les véhicules RETIRÉS du parc sont exclus : leur historique reste lisible
 * depuis leur fiche, mais ils n'ont plus de coût courant à suivre.
 */
export async function listAcquisitionVehicles(
  filters: AcquisitionFilters
): Promise<AcquisitionVehicleRow[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('vehicles')
    .select(
      `id, vehicle_no, brand, model, plate, origin, status, current_supplier_id,
       vehicle_categories ( label ),
       suppliers ( legal_name )`
    )
    .neq('status', 'RETIRED')

  if (filters.search) {
    const term = `%${filters.search.trim()}%`
    query = query.or(
      `brand.ilike.${term},model.ilike.${term},plate.ilike.${term},vehicle_no.ilike.${term}`
    )
  }

  if (filters.supplierId) query = query.eq('current_supplier_id', filters.supplierId)
  if (filters.origin) query = query.eq('origin', filters.origin)

  /*
   * TROIS REQUÊTES, ET TROIS SEULEMENT — jamais une par ligne.
   *
   * Les deux résolutions sont faites EN BASE, par les fonctions du domaine
   * concerné, et chacune reste gardée par SA capacité : sans
   * `rental.pricing.supplier.view`, la première ne rend rien ; sans droit de
   * lecture des tarifs, la seconde ne rend rien. Les deux colonnes sont donc
   * indépendantes, comme les deux permissions.
   */
  const [{ data, error }, costs, prices] = await Promise.all([
    query.order('brand', { ascending: true }).order('model', { ascending: true }).limit(400),
    resolveSupplierRatesByVehicle(filters.on),
    resolveStandardPricesByVehicle(filters.on),
  ])

  if (error) {
    reportQueryFailure('tarifs-fournisseurs:parc', error, 'Le parc n’a pas pu être chargé.')
  }

  return ((data ?? []) as unknown as RawVehicle[]).map((row) => ({
    id: row.id,
    vehicleNo: row.vehicle_no,
    label: `${row.brand} ${row.model}${row.plate ? ` — ${row.plate}` : ''}`,
    origin: row.origin,
    status: row.status,
    categoryLabel: row.vehicle_categories?.label ?? null,
    supplierId: row.current_supplier_id,
    supplierLabel: row.suppliers?.legal_name ?? null,
    cost: costs.get(row.id) ?? null,
    standardPrice: prices.get(row.id) ?? null,
  }))
}

/**
 * Tarif client STANDARD applicable, pour tout le parc en une requête.
 *
 * Résolu par `resolve_pricing_rule` — DEC-002 n'est pas réécrite ici
 * (migration 087). Sans droit de lecture des tarifs, la carte est vide, et
 * aucune commission n'est alors calculée.
 */
export async function resolveStandardPricesByVehicle(
  on?: string
): Promise<Map<string, { amount: number; unit: PricingUnit }>> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('resolve_standard_prices', {
    ...(on ? { p_on: on } : {}),
  })

  if (error) {
    reportQueryFailure(
      'tarifs-fournisseurs:tarif-standard',
      error,
      'Les tarifs clients applicables n’ont pas pu être déterminés.'
    )
  }

  const map = new Map<string, { amount: number; unit: PricingUnit }>()

  for (const row of (data ?? []) as {
    vehicle_id: string
    amount: number | string | null
    unit: PricingUnit | null
  }[]) {
    const amount = toAmount(row.amount)
    if (row.vehicle_id && amount !== null && row.unit) {
      map.set(row.vehicle_id, { amount, unit: row.unit })
    }
  }

  return map
}

/* -------------------------------------------------------------------------- */
/*  Options de saisie                                                          */
/* -------------------------------------------------------------------------- */

export type RateVehicleOption = {
  id: string
  label: string
  supplierId: string
  supplierLabel: string
}

/**
 * Les véhicules auxquels un coût d'acquisition peut être attaché.
 *
 * `SUPPLIED` seulement, et non retirés du parc : ce sont exactement ceux que la
 * base accepte. Proposer les autres mènerait à un refus certain — l'écran
 * s'abstient plutôt que de le provoquer (CLAUDE.md §38, §56).
 */
export async function listRateVehicleOptions(): Promise<RateVehicleOption[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select('id, vehicle_no, brand, model, plate, current_supplier_id, suppliers ( legal_name )')
    .eq('origin', 'SUPPLIED')
    .neq('status', 'RETIRED')
    .order('brand')
    .limit(500)

  if (error) {
    reportQueryFailure(
      'tarifs-fournisseurs:véhicules',
      error,
      'La liste des véhicules fournis n’a pas pu être chargée.'
    )
  }

  return ((data ?? []) as unknown as RawVehicle[])
    .filter((row) => row.current_supplier_id)
    .map((row) => ({
      id: row.id,
      label: `${row.brand} ${row.model}${row.plate ? ` — ${row.plate}` : ''} · ${row.vehicle_no}`,
      supplierId: row.current_supplier_id as string,
      supplierLabel: row.suppliers?.legal_name ?? 'Fournisseur non lisible',
    }))
}
