import type { BadgeTone } from '@/components/ui/primitives'
import type {
  CostLineKind,
  MaintenanceDocumentType,
  QuoteStatus,
} from './costs-data'

/**
 * Libellés du dossier financier — Étape 2.4, LOT 3.
 *
 * Aucun barème, aucun seuil, aucune règle commerciale : ce module NOMME des
 * montants saisis, il n'en produit aucun (DEC-008).
 */

export const COST_LINE_KIND_LABELS: Record<CostLineKind, string> = {
  PARTS: 'Pièces',
  LABOUR: 'Main-d’œuvre',
  OTHER: 'Autres frais',
}

export const COST_LINE_KIND_ORDER: CostLineKind[] = ['PARTS', 'LABOUR', 'OTHER']

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  PROPOSED: 'Proposé',
  ACCEPTED: 'Accepté',
  REFUSED: 'Refusé',
}

export const QUOTE_STATUS_TONES: Record<QuoteStatus, BadgeTone> = {
  PROPOSED: 'info',
  ACCEPTED: 'success',
  REFUSED: 'neutral',
}

export const DOCUMENT_TYPE_LABELS: Record<MaintenanceDocumentType, string> = {
  QUOTE: 'Devis',
  INVOICE: 'Facture du prestataire',
  RECEIPT: 'Reçu',
  REPAIR_ORDER: 'Bon de réparation',
  REPORT: 'Rapport d’intervention',
  OTHER: 'Autre justificatif',
}

export const DOCUMENT_TYPE_ORDER: MaintenanceDocumentType[] = [
  'QUOTE',
  'INVOICE',
  'RECEIPT',
  'REPAIR_ORDER',
  'REPORT',
  'OTHER',
]

/** Mêmes limites que les autres pièces jointes du projet. */
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024
export const ACCEPTED_DOCUMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

/**
 * Montant en KMF — DEC-010 : entier, jamais un flottant.
 *
 * Le formatage est séparé du stockage (Module 09 §19). Aucun arrondi n'a lieu
 * ici : il n'y aurait rien à arrondir.
 */
export function formatAmount(amount: number | null): string | null {
  if (amount === null) return null
  return `${amount.toLocaleString('fr-FR')} KMF`
}

/** Écart signé, pour un indicateur de pilotage (§35). */
export function formatVariance(variance: number | null): string | null {
  if (variance === null) return null
  const sign = variance > 0 ? '+' : ''
  return `${sign}${variance.toLocaleString('fr-FR')} KMF`
}
