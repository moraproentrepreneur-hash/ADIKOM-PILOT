import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { PricingUnit } from '@/features/pricing/constants'
import { commission, type CommissionResult } from '@/features/supplier-rates/constants'
import type { AmendmentKind, SegmentStatus } from './constants'

/**
 * Accès aux avenants et aux segments d'une location — LOT 22, DEC-045.
 *
 * TOUTES les requêtes passent par le client porteur de la session : RLS reste la
 * barrière au niveau des données.
 *
 *   · `rental_segments` et `rental_amendments` s'ouvrent par
 *     `rental.rentals.view` — l'histoire d'un contrat appartient au contrat ;
 *   · `rental_segment_costs` s'ouvre par `rental.pricing.supplier.view`, et par
 *     elle SEULE. Un lecteur qui ne la détient pas ne reçoit AUCUNE ligne, ici
 *     comme ailleurs, et aucune fonction de ce fichier ne peut lui en rendre une.
 *
 * UNE LECTURE REFUSÉE N'EST PAS UNE LECTURE VIDE. RLS ne lève aucune erreur :
 * elle rend zéro ligne. Les écrans ne doivent donc JAMAIS écrire « aucun coût »
 * sur la foi d'un tableau vide — c'est la CAPACITÉ, vérifiée séparément, qui
 * décide du message affiché (DEC-017).
 */

export type { AmendmentKind, SegmentStatus } from './constants'

/* -------------------------------------------------------------------------- */
/*  Périodes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `tstzrange` renvoyé par PostgREST : `["2026-09-01 08:00:00+00","…")`.
 *
 * Le décalage tient sur deux chiffres, forme que JavaScript ne reconnaît pas une
 * fois l'espace remplacé par « T » : il est complété en « +00:00 ». Même
 * traitement que dans les modules Locations et Réservations, pour la même raison.
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

/**
 * `bigint` en base, donc chaîne renvoyée par PostgREST lorsqu'il dépasse la plage
 * sûre. La conversion est faite une fois, ici (DEC-010).
 */
function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'string' ? Number(value) : value
  return Number.isSafeInteger(parsed) ? parsed : null
}

/* -------------------------------------------------------------------------- */
/*  Segments                                                                   */
/* -------------------------------------------------------------------------- */

export type RentalSegment = {
  id: string
  sequenceNo: number
  status: SegmentStatus
  vehicleId: string
  /**
   * `null` signifie « véhicule non lisible avec vos droits » (la jointure
   * respecte `vehicles_select`, qui exige `rental.fleet.view`), JAMAIS « sans
   * véhicule » : un segment en porte toujours un. Les écrans qui s'en servent
   * doivent distinguer les deux (DEC-017).
   */
  vehicleLabel: string | null
  vehicleOrigin: string | null
  from: string
  to: string
  lockedAmount: number
  lockedUnit: PricingUnit
  lockedSource: string | null
  lockedAt: string
  /** L'avenant qui a ouvert ce segment. `null` = segment initial du contrat. */
  amendmentId: string | null
  amendmentNo: string | null
  /**
   * Coût d'acquisition GELÉ à l'ouverture du segment.
   *
   * `null` signifie l'une de TROIS choses, que l'appelant doit distinguer : aucun
   * coût n'existait à cette date, le véhicule n'est pas fourni par un
   * fournisseur, ou le lecteur n'a pas `rental.pricing.supplier.view`. Le
   * tableau seul ne les sépare pas.
   */
  lockedCost: { amount: number; unit: PricingUnit; resolvedOn: string } | null
}

type RawSegment = {
  id: string
  sequence_no: number
  status: SegmentStatus
  vehicle_id: string
  period: string | null
  locked_amount: number | string
  locked_unit: PricingUnit
  locked_source: string | null
  locked_at: string
  amendment_id: string | null
  vehicles: { brand: string; model: string; plate: string | null; origin: string } | null
  rental_amendments: { amendment_no: string } | null
  /*
   * UN OBJET, ET NON UN TABLEAU — et c'est `segment_id unique` qui le décide.
   *
   * PostgREST déduit la cardinalité d'une relation embarquée de ses CONTRAINTES :
   * la clé étrangère vers `rental_segments` étant UNIQUE, il rend UN objet, pas
   * une collection. Le lire comme un tableau donnait `undefined` — donc « aucun
   * coût gelé » — sur des segments qui en portaient un, sans qu'aucune erreur ne
   * soit levée. Le type accepte les deux formes : une contrainte qui changerait
   * ne doit pas refaire disparaître le coût en silence.
   */
  rental_segment_costs:
    | { amount: number | string; unit: PricingUnit; resolved_on: string }
    | { amount: number | string; unit: PricingUnit; resolved_on: string }[]
    | null
}

/** La ligne embarquée, quelle que soit la cardinalité que PostgREST en déduit. */
function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (value === null || value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

/**
 * Les segments d'un contrat, du premier au dernier.
 *
 * LE COÛT GELÉ EST LU PAR JOINTURE, et RLS s'applique à l'embarqué comme au
 * reste : un lecteur dépourvu de `rental.pricing.supplier.view` reçoit un tableau
 * vide pour cette relation — jamais une erreur, jamais un zéro.
 */
export async function listRentalSegments(rentalId: string): Promise<RentalSegment[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('rental_segments')
    .select(
      `id, sequence_no, status, vehicle_id, period,
       locked_amount, locked_unit, locked_source, locked_at, amendment_id,
       vehicles ( brand, model, plate, origin ),
       rental_amendments ( amendment_no ),
       rental_segment_costs ( amount, unit, resolved_on )`
    )
    .eq('rental_id', rentalId)
    .order('sequence_no', { ascending: true })

  if (error) {
    reportQueryFailure(
      'avenants:segments',
      error,
      'La chronologie de cette location n’a pas pu être chargée.'
    )
  }

  return ((data ?? []) as unknown as RawSegment[]).map((row) => {
    const period = parsePeriod(row.period)
    const cost = firstOf(row.rental_segment_costs)
    const costAmount = toAmount(cost?.amount)

    return {
      id: row.id,
      sequenceNo: row.sequence_no,
      status: row.status,
      vehicleId: row.vehicle_id,
      vehicleLabel: row.vehicles
        ? `${row.vehicles.brand} ${row.vehicles.model}${row.vehicles.plate ? ` — ${row.vehicles.plate}` : ''}`
        : null,
      vehicleOrigin: row.vehicles?.origin ?? null,
      from: period.from,
      to: period.to,
      lockedAmount: toAmount(row.locked_amount) ?? 0,
      lockedUnit: row.locked_unit,
      lockedSource: row.locked_source,
      lockedAt: row.locked_at,
      amendmentId: row.amendment_id,
      amendmentNo: row.rental_amendments?.amendment_no ?? null,
      lockedCost:
        cost && costAmount !== null
          ? { amount: costAmount, unit: cost.unit, resolvedOn: cost.resolved_on }
          : null,
    }
  })
}

/**
 * Commission d'un segment — calculée, jamais stockée (doctrine D1).
 *
 * Le calcul n'est pas réécrit : c'est `commission()` du LOT 21, avec ses trois
 * règles — un coût absent n'est pas un coût nul, une commission négative est
 * rendue telle quelle, deux unités différentes ne se soustraient pas.
 */
export function segmentCommission(
  segment: RentalSegment,
  options: { canSeeClientPrice: boolean; canSeeCost: boolean }
): CommissionResult {
  if (!options.canSeeCost) return { ok: false, gap: 'NO_COST_ACCESS' }
  if (!options.canSeeClientPrice) return { ok: false, gap: 'NO_CLIENT_PRICE_ACCESS' }
  if (segment.vehicleOrigin !== null && segment.vehicleOrigin !== 'SUPPLIED') {
    return { ok: false, gap: 'NOT_SUPPLIED' }
  }

  return commission(
    { amount: segment.lockedAmount, unit: segment.lockedUnit },
    segment.lockedCost
  )
}

/* -------------------------------------------------------------------------- */
/*  Avenants                                                                   */
/* -------------------------------------------------------------------------- */

export type RentalAmendment = {
  id: string
  amendmentNo: string
  sequenceNo: number
  kind: AmendmentKind
  effectiveAt: string
  reason: string
  notes: string | null
  rateOverride: boolean
  rateOverrideReason: string | null
  createdAt: string
  authorLabel: string | null
}

type RawAmendment = {
  id: string
  amendment_no: string
  sequence_no: number
  kind: AmendmentKind
  effective_at: string
  reason: string
  notes: string | null
  rate_override: boolean
  rate_override_reason: string | null
  created_at: string
  app_users: { first_name: string; last_name: string } | null
}

/**
 * Les avenants d'un contrat, du premier au dernier.
 *
 * L'AUTEUR N'EST NOMMÉ QUE S'IL EST LISIBLE : `app_users` a sa propre policy, et
 * un exploitant dépourvu de `users.users.view` ne reçoit pas le nom. L'écran dit
 * alors « auteur non lisible » plutôt qu'un tiret, qui se lirait « personne »
 * (DEC-017).
 */
export async function listRentalAmendments(rentalId: string): Promise<RentalAmendment[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('rental_amendments')
    .select(
      `id, amendment_no, sequence_no, kind, effective_at, reason, notes,
       rate_override, rate_override_reason, created_at,
       app_users!rental_amendments_created_by_fkey ( first_name, last_name )`
    )
    .eq('rental_id', rentalId)
    .order('sequence_no', { ascending: true })

  if (error) {
    reportQueryFailure(
      'avenants:liste',
      error,
      'Les avenants de cette location n’ont pas pu être chargés.'
    )
  }

  return ((data ?? []) as unknown as RawAmendment[]).map((row) => ({
    id: row.id,
    amendmentNo: row.amendment_no,
    sequenceNo: row.sequence_no,
    kind: row.kind,
    effectiveAt: row.effective_at,
    reason: row.reason,
    notes: row.notes,
    rateOverride: row.rate_override,
    rateOverrideReason: row.rate_override_reason,
    createdAt: row.created_at,
    authorLabel: row.app_users
      ? `${row.app_users.first_name} ${row.app_users.last_name}`.trim()
      : null,
  }))
}

/** Un avenant précis — pour son document. */
export async function getRentalAmendment(id: string): Promise<RentalAmendment | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('rental_amendments')
    .select(
      `id, amendment_no, sequence_no, kind, effective_at, reason, notes,
       rate_override, rate_override_reason, created_at, rental_id,
       app_users!rental_amendments_created_by_fkey ( first_name, last_name )`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('avenant', error, 'Cet avenant n’a pas pu être chargé.')
  }
  if (!data) return null

  const row = data as unknown as RawAmendment & { rental_id: string }

  return {
    id: row.id,
    amendmentNo: row.amendment_no,
    sequenceNo: row.sequence_no,
    kind: row.kind,
    effectiveAt: row.effective_at,
    reason: row.reason,
    notes: row.notes,
    rateOverride: row.rate_override,
    rateOverrideReason: row.rate_override_reason,
    createdAt: row.created_at,
    authorLabel: row.app_users
      ? `${row.app_users.first_name} ${row.app_users.last_name}`.trim()
      : null,
  }
}

/** La location dont un avenant relève — la clé du document. */
export async function getAmendmentRentalId(id: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('rental_amendments')
    .select('rental_id')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('avenant:contrat', error, 'Cet avenant n’a pas pu être rattaché.')
  }

  return (data as { rental_id: string } | null)?.rental_id ?? null
}

/* -------------------------------------------------------------------------- */
/*  Véhicules de remplacement                                                  */
/* -------------------------------------------------------------------------- */

export type SwapCandidate = {
  id: string
  label: string
  categoryLabel: string | null
}

/**
 * Les véhicules qu'on peut proposer en remplacement.
 *
 * NI LE VÉHICULE COURANT, NI UN VÉHICULE RETIRÉ DU PARC. La DISPONIBILITÉ, elle,
 * n'est pas filtrée ici : elle dépend de la période exacte, que l'utilisateur
 * choisit dans le formulaire. La base tranche — la contrainte d'exclusion refuse
 * un véhicule déjà engagé, et le message le dit (CLAUDE.md §38, §43).
 */
export async function listSwapCandidates(excludeVehicleId: string): Promise<SwapCandidate[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select('id, vehicle_no, brand, model, plate, vehicle_categories ( label )')
    .neq('status', 'RETIRED')
    .neq('id', excludeVehicleId)
    .order('brand')
    .order('model')
    .limit(400)

  if (error) {
    reportQueryFailure(
      'avenants:véhicules',
      error,
      'La liste des véhicules de remplacement n’a pas pu être chargée.'
    )
  }

  return (
    (data ?? []) as unknown as {
      id: string
      vehicle_no: string
      brand: string
      model: string
      plate: string | null
      vehicle_categories: { label: string } | null
    }[]
  ).map((row) => ({
    id: row.id,
    label: `${row.brand} ${row.model}${row.plate ? ` — ${row.plate}` : ''} · ${row.vehicle_no}`,
    categoryLabel: row.vehicle_categories?.label ?? null,
  }))
}
