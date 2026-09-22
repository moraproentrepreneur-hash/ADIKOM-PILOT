import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { BillingOrigin } from './constants'

/*
 * LES PORTIONS TARIFAIRES SONT PURES, ET VIVENT DONC AILLEURS.
 *
 * `ratePortions` ne lit rien : elle découpe une période selon les segments
 * qu'on lui donne. La laisser dans un module `server-only` la rendrait
 * intestable unitairement — et c'est exactement le genre de découpage qu'il faut
 * pouvoir éprouver sans base.
 */
export { ratePortions, type RatePortion } from './constants'

/**
 * Accès aux périodes facturables d'une location — LOT 23, DEC-047.
 *
 * TOUTES les requêtes passent par le client porteur de la session : RLS reste la
 * barrière au niveau des données.
 *
 *   · `rental_billing_periods` s'ouvre par `rental.rentals.view` — le découpage
 *     de la créance appartient au contrat, et il ne porte AUCUN montant ;
 *   · `customer_invoices` s'ouvre par `billing.customer_invoices.view`, et par
 *     elle seule. Un lecteur qui ne la détient pas ne reçoit AUCUNE facture, et
 *     l'écran doit alors dire qu'il ne voit pas — jamais qu'il n'y a rien
 *     (DEC-017).
 *
 * POURQUOI LES FACTURES SONT LUES PAR UNE REQUÊTE SÉPARÉE, ET NON PAR JOINTURE
 *
 * `customer_invoices.billing_period_id` porte un index unique PARTIEL — les
 * factures annulées en sortent. PostgREST déduit la cardinalité d'une relation
 * embarquée de ses CONTRAINTES, et un index partiel n'en est pas une : la forme
 * rendue dépendrait de son interprétation. Deux requêtes, deux formes connues.
 */

export type { BillingCadence, BillingOrigin, RentalType } from './constants'

/* -------------------------------------------------------------------------- */
/*  Périodes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `tstzrange` renvoyé par PostgREST : `["2026-10-01 00:00:00+00","…")`.
 *
 * Même traitement que dans les modules Locations, Réservations et Avenants, pour
 * la même raison : le décalage tient sur deux chiffres, forme que JavaScript ne
 * reconnaît pas une fois l'espace remplacé par « T ».
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

export type BillingPeriod = {
  id: string
  sequenceNo: number
  status: 'PLANNED' | 'CANCELLED'
  origin: BillingOrigin
  from: string
  to: string
  /** L'avenant qui a ouvert cette période. `null` = découpage initial. */
  amendmentId: string | null
  amendmentNo: string | null
  /**
   * La facture qui couvre cette période, annulées exclues.
   *
   * `null` signifie DEUX choses que l'appelant doit distinguer : aucune facture
   * ne la couvre, ou le lecteur n'a pas `billing.customer_invoices.view`. Le
   * tableau seul ne les sépare pas (DEC-017).
   */
  invoiceId: string | null
  invoiceNo: string | null
  invoiceStatus: string | null
}

type RawPeriod = {
  id: string
  sequence_no: number
  status: 'PLANNED' | 'CANCELLED'
  origin: BillingOrigin
  period: string | null
  amendment_id: string | null
  rental_amendments: { amendment_no: string } | null
}

/**
 * Les périodes facturables d'un contrat, de la première à la dernière.
 *
 * `canSeeInvoices` n'est PAS une protection : c'est ce qui évite une requête
 * dont le résultat serait de toute façon vide, et ce qui permet à l'écran de
 * dire « vous ne voyez pas les factures » plutôt que « il n'y en a pas ».
 */
export async function listBillingPeriods(
  rentalId: string,
  options: { canSeeInvoices: boolean } = { canSeeInvoices: false }
): Promise<BillingPeriod[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('rental_billing_periods')
    .select(
      `id, sequence_no, status, origin, period, amendment_id,
       rental_amendments ( amendment_no )`
    )
    .eq('rental_id', rentalId)
    .order('sequence_no', { ascending: true })

  if (error) {
    reportQueryFailure(
      'facturation:periodes',
      error,
      'Les périodes facturables de cette location n’ont pas pu être chargées.'
    )
  }

  const rows = (data ?? []) as unknown as RawPeriod[]

  const invoices = new Map<string, { id: string; no: string; status: string }>()

  if (options.canSeeInvoices && rows.length > 0) {
    const { data: found, error: invoiceError } = await supabase
      .from('customer_invoices')
      .select('id, invoice_no, status, billing_period_id')
      .eq('rental_id', rentalId)
      .not('billing_period_id', 'is', null)
      .neq('status', 'CANCELLED')

    if (invoiceError) {
      reportQueryFailure(
        'facturation:periodes:factures',
        invoiceError,
        'Les factures de ces périodes n’ont pas pu être chargées.'
      )
    }

    for (const row of found ?? []) {
      if (row.billing_period_id) {
        invoices.set(row.billing_period_id, {
          id: row.id,
          no: row.invoice_no,
          status: row.status,
        })
      }
    }
  }

  return rows.map((row) => {
    const period = parsePeriod(row.period)
    const invoice = invoices.get(row.id)

    return {
      id: row.id,
      sequenceNo: row.sequence_no,
      status: row.status,
      origin: row.origin,
      from: period.from,
      to: period.to,
      amendmentId: row.amendment_id,
      amendmentNo: row.rental_amendments?.amendment_no ?? null,
      invoiceId: invoice?.id ?? null,
      invoiceNo: invoice?.no ?? null,
      invoiceStatus: invoice?.status ?? null,
    }
  })
}

/* -------------------------------------------------------------------------- */
/*  Le régime d'un contrat                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Le contrat porte-t-il déjà une facture ?
 *
 * C'est ce qui fige son régime (migration 095 §3). La question est posée à la
 * base, non déduite d'une liste : un lecteur dépourvu de
 * `billing.customer_invoices.view` ne verrait aucune facture, et l'écran lui
 * proposerait un changement que la base refuserait ensuite.
 *
 * `count` avec `head: true` ne rend aucune ligne — seulement leur nombre — et
 * reste donc soumis à RLS sans rien divulguer de plus.
 */
export async function rentalHasInvoice(rentalId: string): Promise<boolean | null> {
  const supabase = await createSupabaseServerClient()

  const { count, error } = await supabase
    .from('customer_invoices')
    .select('id', { count: 'exact', head: true })
    .eq('rental_id', rentalId)
    .neq('status', 'CANCELLED')

  // Une lecture qui n'a jamais abouti n'est pas une absence de facture : on
  // rend `null`, et l'appelant s'abstient plutôt que d'affirmer.
  if (error) return null

  return (count ?? 0) > 0
}
