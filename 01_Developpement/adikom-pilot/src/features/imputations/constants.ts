import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Libellés et états de l'imputation fournisseur — Étape 2.4, LOT 4.
 *
 * Workflow 06 §13 : les cinq statuts documentés, et rien de plus.
 *
 * « Imputation en attente de facture » (§31) n'en est PAS un sixième : c'est
 * la lecture de `VALIDATED` sans facture rattachée, exactement ce que DEC-013
 * énumère. Elle se calcule, elle ne se stocke pas.
 */

export type ImputationStatus =
  | 'DRAFT'
  | 'TO_VALIDATE'
  | 'VALIDATED'
  | 'IMPUTED'
  | 'CANCELLED'

export const IMPUTATION_STATUS_LABELS: Record<ImputationStatus, string> = {
  DRAFT: 'Brouillon',
  TO_VALIDATE: 'À valider',
  VALIDATED: 'Validée',
  IMPUTED: 'Imputée',
  CANCELLED: 'Annulée',
}

export const IMPUTATION_STATUS_TONES: Record<ImputationStatus, BadgeTone> = {
  DRAFT: 'neutral',
  TO_VALIDATE: 'warning',
  VALIDATED: 'info',
  IMPUTED: 'success',
  CANCELLED: 'danger',
}

/**
 * Ce que chaque état signifie pour l'argent — la question que l'écran doit
 * répondre sans ambiguïté (DEC-013).
 */
export const IMPUTATION_STATUS_EFFECT: Record<ImputationStatus, string> = {
  DRAFT: 'En préparation. Aucun effet sur un montant dû.',
  TO_VALIDATE: 'Soumise à validation. Aucun effet sur un montant dû.',
  VALIDATED: 'En attente de facture fournisseur. Ne réduit encore aucun montant dû.',
  IMPUTED: 'Prise en compte dans le montant dû au fournisseur.',
  CANCELLED: 'Annulée. Le montant imputable qu’elle consommait est redevenu disponible.',
}

/** Ordre d'affichage dans les filtres. */
export const IMPUTATION_STATUS_ORDER: ImputationStatus[] = [
  'DRAFT',
  'TO_VALIDATE',
  'VALIDATED',
  'IMPUTED',
  'CANCELLED',
]

/**
 * Les cinq statuts sont désormais tous atteignables.
 *
 * `IMPUTED` supposait une facture fournisseur : le LOT 5 l'a livrée, et la
 * transition qui y mène est rattachée à sa capacité. Elle ne s'atteint que par
 * RATTACHEMENT à une facture validée du même fournisseur — jamais par
 * déclaration.
 */
export const IMPUTATION_STATUS_REACHABLE: ImputationStatus[] = [
  'DRAFT',
  'TO_VALIDATE',
  'VALIDATED',
  'IMPUTED',
  'CANCELLED',
]

/** Une imputation en préparation se modifie encore (Workflow 06 §38). */
export function isEditable(status: ImputationStatus): boolean {
  return status === 'DRAFT' || status === 'TO_VALIDATE'
}

/** Elle peut être annulée tant qu'elle n'est ni imputée ni déjà annulée (§40). */
export function isCancellable(status: ImputationStatus): boolean {
  return status !== 'IMPUTED' && status !== 'CANCELLED'
}

/**
 * « Imputation en attente de facture » — Workflow 06 §31.
 *
 * État DÉRIVÉ, jamais stocké : validée, et aucune facture rattachée. DEC-013
 * en fait la limite exacte du LOT 4.
 */
export function isAwaitingInvoice(
  status: ImputationStatus,
  supplierInvoiceId: string | null
): boolean {
  return status === 'VALIDATED' && supplierInvoiceId === null
}

/**
 * Montant en KMF — DEC-010 : entier, jamais un flottant.
 * Le formatage est séparé du stockage (Module 09 §19).
 */
export function formatAmount(amount: number | null): string | null {
  if (amount === null) return null
  return `${amount.toLocaleString('fr-FR')} KMF`
}
