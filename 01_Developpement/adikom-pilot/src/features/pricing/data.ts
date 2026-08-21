import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { PricingSource, PricingUnit } from './constants'

/**
 * Accès aux données de la tarification.
 *
 * La résolution du tarif n'est PAS réimplémentée ici : elle est appelée en base
 * (`resolve_pricing_rule`), unique implémentation de DEC-002. Un écran ne peut
 * donc pas appliquer une règle différente d'un autre — il n'a pas les moyens de
 * la reformuler (03_Modules/05 §20).
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données.
 */

export { UNIT_LABELS, UNIT_SUFFIX, UNIT_HELP, SOURCE_LABELS, SOURCE_TONES, SCOPE_LABELS, MODE_LABELS, formatPrice, formatDiscount } from './constants'
export type { PricingUnit, PricingSource, PricingScope, PricingMode } from './constants'

/** Tarif retenu par le résolveur, avec la source qui l'explique. */
export type ResolvedPrice = {
  ruleId: string
  amount: number
  unit: PricingUnit
  source: PricingSource
  /** Remise appliquée, le cas échéant, avec le tarif de référence utilisé. */
  discountPercent: number | null
  baseAmount: number | null
}

export type PricingRuleRow = {
  id: string
  clientId: string | null
  clientLabel: string | null
  vehicleId: string | null
  vehicleLabel: string | null
  categoryId: string | null
  categoryLabel: string | null
  amount: number | null
  unit: PricingUnit | null
  discountPercent: number | null
  validFrom: string | null
  validTo: string | null
  isActive: boolean
  conditions: string | null
  specificity: number
  createdAt: string
}

type RawRuleRow = {
  id: string
  client_id: string | null
  vehicle_id: string | null
  category_id: string | null
  amount: number | null
  unit: PricingUnit | null
  discount_percent: number | string | null
  valid_from: string | null
  valid_to: string | null
  is_active: boolean
  conditions: string | null
  specificity: number
  created_at: string
  clients: { legal_name: string; client_no: string } | null
  vehicles: { vehicle_no: string; brand: string; model: string; plate: string | null } | null
  vehicle_categories: { label: string } | null
}

const RULE_SELECT = `
  id, client_id, vehicle_id, category_id, amount, unit, discount_percent,
  valid_from, valid_to, is_active, conditions, specificity, created_at,
  clients ( legal_name, client_no ),
  vehicles ( vehicle_no, brand, model, plate ),
  vehicle_categories ( label )
`

/**
 * `numeric` est renvoyé sous forme de chaîne par PostgREST : le convertir
 * explicitement évite qu'un pourcentage devienne « 10.00 » à l'affichage ou
 * qu'une comparaison numérique échoue silencieusement.
 */
function toPercent(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(parsed) ? parsed : null
}

function toRuleRow(row: RawRuleRow): PricingRuleRow {
  return {
    id: row.id,
    clientId: row.client_id,
    clientLabel: row.clients ? `${row.clients.legal_name} (${row.clients.client_no})` : null,
    vehicleId: row.vehicle_id,
    vehicleLabel: row.vehicles
      ? `${row.vehicles.brand} ${row.vehicles.model}${row.vehicles.plate ? ` — ${row.vehicles.plate}` : ''}`
      : null,
    categoryId: row.category_id,
    categoryLabel: row.vehicle_categories?.label ?? null,
    amount: row.amount,
    unit: row.unit,
    discountPercent: toPercent(row.discount_percent),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    isActive: row.is_active,
    conditions: row.conditions,
    specificity: row.specificity,
    createdAt: row.created_at,
  }
}

export type PricingRuleFilters = {
  /** `null` cible explicitement les tarifs standard, sans client. */
  clientId?: string | null
  vehicleId?: string
  categoryId?: string
  includeInactive?: boolean
}

export async function listPricingRules(
  filters: PricingRuleFilters = {}
): Promise<PricingRuleRow[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('pricing_rules').select(RULE_SELECT)

  if (filters.clientId === null) query = query.is('client_id', null)
  else if (filters.clientId) query = query.eq('client_id', filters.clientId)

  if (filters.vehicleId) query = query.eq('vehicle_id', filters.vehicleId)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (!filters.includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
    .order('specificity', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) {
    reportQueryFailure('tarification', error, 'Les tarifs n’ont pas pu être chargés.')
  }

  return ((data ?? []) as unknown as RawRuleRow[]).map(toRuleRow)
}

export async function getPricingRule(id: string): Promise<PricingRuleRow | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('pricing_rules')
    .select(RULE_SELECT)
    .eq('id', id)
    .maybeSingle()

  // Une ligne absente est un cas fonctionnel (404) ; une erreur de requête ne
  // l'est pas et ne doit pas être présentée comme une absence (DEC-017).
  if (error) reportQueryFailure('tarif', error, 'Ce tarif n’a pas pu être chargé.')
  if (!data) return null

  return toRuleRow(data as unknown as RawRuleRow)
}

/**
 * Tarif applicable à un couple client / véhicule à une date donnée.
 *
 * Renvoie `null` lorsqu'AUCUN tarif n'est configuré : l'absence de tarif est un
 * cas explicite que l'interface doit signaler, jamais un montant nul supposé
 * (DEC-008 — le système signale ce qui n'est pas configuré).
 */
export async function resolvePrice(
  clientId: string | null,
  vehicleId: string,
  on?: string
): Promise<ResolvedPrice | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('resolve_pricing_rule', {
    p_client_id: clientId,
    p_vehicle_id: vehicleId,
    ...(on ? { p_on: on } : {}),
  })

  if (error) {
    reportQueryFailure('résolution tarifaire', error, 'Le tarif applicable n’a pas pu être déterminé.')
  }

  const rows = (data ?? []) as {
    rule_id: string
    amount: number
    unit: PricingUnit
    source: PricingSource
    discount_percent: number | string | null
    base_amount: number | null
  }[]

  const row = rows[0]
  if (!row) return null

  return {
    ruleId: row.rule_id,
    amount: row.amount,
    unit: row.unit,
    source: row.source,
    discountPercent: toPercent(row.discount_percent),
    baseAmount: row.base_amount,
  }
}
