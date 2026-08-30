import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'

/**
 * Accès aux données financières d'une maintenance — Étape 2.4, LOT 3.
 *
 * TOUT PASSE PAR `rental.maintenance.cost.view`.
 *
 * Les montants vivent dans des tables séparées de `vehicle_maintenances`, et
 * ce n'est pas un détail d'organisation : RLS est ROW-level. Rangés dans la
 * table de la maintenance, ils auraient été lus par quiconque a le droit de
 * lire la ligne — la nouvelle capacité n'aurait masqué qu'un écran.
 *
 * L'appelant ne DOIT appeler ces fonctions qu'après avoir vérifié la
 * permission, et afficher `null` — section absente — dans le cas contraire.
 * Un « 0 KMF » obtenu par refus de lecture affirmerait que l'intervention n'a
 * rien coûté : exactement ce que DEC-017 interdit.
 */

export type MaintenanceCosts = {
  estimatedCost: number | null
  actualCost: number | null
  imputableAmount: number | null
  notes: string | null
  updatedAt: string
}

export type CostLineKind = 'PARTS' | 'LABOUR' | 'OTHER'

export type CostLine = {
  id: string
  kind: CostLineKind
  label: string
  quantity: number | null
  unitAmount: number | null
  amount: number
  notes: string | null
}

export type QuoteStatus = 'PROPOSED' | 'ACCEPTED' | 'REFUSED'

export type Quote = {
  id: string
  amount: number
  quotedOn: string | null
  description: string | null
  status: QuoteStatus
  providerSupplierId: string | null
  providerLabel: string | null
  decidedAt: string | null
  decisionReason: string | null
}

export type MaintenanceDocumentType =
  | 'QUOTE'
  | 'INVOICE'
  | 'RECEIPT'
  | 'REPAIR_ORDER'
  | 'REPORT'
  | 'OTHER'

export type MaintenanceDocument = {
  id: string
  docType: MaintenanceDocumentType
  label: string
  fileName: string
  quoteId: string | null
}

/**
 * Le dossier financier d'une maintenance.
 *
 * `costs` peut être `null` alors que la permission est accordée : aucune
 * saisie n'a encore eu lieu. L'écran distingue les deux — « pas encore
 * chiffré » n'est pas « gratuit ».
 */
export type MaintenanceFinancials = {
  costs: MaintenanceCosts | null
  lines: CostLine[]
  quotes: Quote[]
  documents: MaintenanceDocument[]
}

export async function getMaintenanceFinancials(
  maintenanceId: string
): Promise<MaintenanceFinancials> {
  const supabase = await createSupabaseServerClient()

  const [costs, lines, quotes, documents] = await Promise.all([
    supabase
      .from('maintenance_costs')
      .select('estimated_cost, actual_cost, imputable_amount, notes, updated_at')
      .eq('maintenance_id', maintenanceId)
      .maybeSingle(),
    supabase
      .from('maintenance_cost_lines')
      .select('id, kind, label, quantity, unit_amount, amount, notes')
      .eq('maintenance_id', maintenanceId)
      .order('created_at'),
    supabase
      .from('maintenance_quotes')
      .select(
        `id, amount, quoted_on, description, status, provider_supplier_id,
         decided_at, decision_reason,
         suppliers ( supplier_no, legal_name, trade_name )`
      )
      .eq('maintenance_id', maintenanceId)
      .order('created_at'),
    supabase
      .from('maintenance_documents')
      .select('id, doc_type, label, file_name, quote_id, is_archived')
      .eq('maintenance_id', maintenanceId)
      .order('created_at'),
  ])

  for (const [scope, result] of [
    ['coûts', costs],
    ['lignes de coût', lines],
    ['devis', quotes],
    ['justificatifs', documents],
  ] as const) {
    if (result.error) {
      reportQueryFailure(scope, result.error, 'Le dossier financier n’a pas pu être chargé.')
    }
  }

  type RawQuote = {
    id: string
    amount: number
    quoted_on: string | null
    description: string | null
    status: QuoteStatus
    provider_supplier_id: string | null
    decided_at: string | null
    decision_reason: string | null
    suppliers?: { supplier_no: string; legal_name: string; trade_name: string | null } | null
  }

  return {
    costs: costs.data
      ? {
          estimatedCost: costs.data.estimated_cost,
          actualCost: costs.data.actual_cost,
          imputableAmount: costs.data.imputable_amount,
          notes: costs.data.notes,
          updatedAt: costs.data.updated_at,
        }
      : null,

    lines: (lines.data ?? []).map((line) => ({
      id: line.id,
      kind: line.kind as CostLineKind,
      label: line.label,
      quantity: line.quantity,
      unitAmount: line.unit_amount,
      amount: line.amount,
      notes: line.notes,
    })),

    quotes: ((quotes.data ?? []) as unknown as RawQuote[]).map((quote) => ({
      id: quote.id,
      amount: quote.amount,
      quotedOn: quote.quoted_on,
      description: quote.description,
      status: quote.status,
      providerSupplierId: quote.provider_supplier_id,
      providerLabel: quote.suppliers
        ? `${quote.suppliers.trade_name ?? quote.suppliers.legal_name} (${quote.suppliers.supplier_no})`
        : null,
      decidedAt: quote.decided_at,
      decisionReason: quote.decision_reason,
    })),

    documents: (documents.data ?? [])
      .filter((document) => !document.is_archived)
      .map((document) => ({
        id: document.id,
        docType: document.doc_type as MaintenanceDocumentType,
        label: document.label,
        fileName: document.file_name,
        quoteId: document.quote_id,
      })),
  }
}

/* -------------------------------------------------------------------------- */
/*  Indicateurs dérivés — calculés, jamais stockés                             */
/* -------------------------------------------------------------------------- */

/**
 * Écart entre coût réel et coût estimé — Workflow 05 §35.
 *
 * `null` tant que l'un des deux manque : un écart contre zéro n'est pas un
 * écart, c'est une invention.
 */
export function costVariance(costs: MaintenanceCosts | null): number | null {
  if (!costs || costs.actualCost === null || costs.estimatedCost === null) return null
  return costs.actualCost - costs.estimatedCost
}

/**
 * Montant non imputable — Workflow 06 §7 : « coût total − montant imputable ».
 *
 * `null` si l'un des deux manque. La documentation pose la soustraction, elle
 * ne prévoit pas de la faire contre une valeur absente.
 */
export function nonImputableAmount(costs: MaintenanceCosts | null): number | null {
  if (!costs || costs.actualCost === null || costs.imputableAmount === null) return null
  return costs.actualCost - costs.imputableAmount
}

/**
 * Somme des lignes de coût.
 *
 * Elle DOCUMENTE le coût réel, elle ne le remplace pas : la ventilation étant
 * facultative (§31, §32), un total qui en découlerait serait faux dès qu'une
 * ligne manque. L'écran affiche les deux et signale une divergence ; il ne
 * choisit pas à la place de l'utilisateur (DEC-008).
 */
export function linesTotal(lines: CostLine[]): number {
  return lines.reduce((total, line) => total + line.amount, 0)
}
