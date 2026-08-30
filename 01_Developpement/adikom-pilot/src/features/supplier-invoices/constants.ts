import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Libellés et états de la facture fournisseur — Étape 2.5, LOT 5.
 *
 * Module 07 §31 : les sept statuts documentés, et rien de plus.
 *
 * Trois ne sont pas produits par le système aujourd'hui :
 *
 *   `OVERDUE`                    DÉRIVÉ de l'échéance et de la date du jour
 *                                (DEC-025 §a). Jamais écrit en base.
 *   `PARTIALLY_PAID` · `PAID`    découlent de RÈGLEMENTS, qui relèvent du lot
 *                                suivant. Les transitions qui y mènent sont
 *                                refusées par la base, avec leur motif.
 */

export type SupplierInvoiceStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'VALIDATED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED'

export const SUPPLIER_INVOICE_STATUS_LABELS: Record<SupplierInvoiceStatus, string> = {
  DRAFT: 'Brouillon',
  PENDING: 'En attente',
  VALIDATED: 'Validée',
  PARTIALLY_PAID: 'Partiellement payée',
  PAID: 'Payée',
  OVERDUE: 'En retard',
  CANCELLED: 'Annulée',
}

export const SUPPLIER_INVOICE_STATUS_TONES: Record<SupplierInvoiceStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  VALIDATED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'danger',
}

/** Ce que chaque état signifie pour l'argent — la question que l'écran doit trancher. */
export const SUPPLIER_INVOICE_STATUS_EFFECT: Record<SupplierInvoiceStatus, string> = {
  DRAFT: 'En saisie. Aucune dette n’est encore reconnue.',
  PENDING: 'Saisie complète, en attente de contrôle. Aucune dette reconnue.',
  VALIDATED: 'Dette reconnue. La facture peut recevoir des imputations.',
  PARTIALLY_PAID: 'Partiellement réglée.',
  PAID: 'Intégralement réglée.',
  OVERDUE: 'Échéance dépassée et net à payer non soldé.',
  CANCELLED: 'Annulée. Elle ne peut plus recevoir d’imputation.',
}

/** Ordre d'affichage dans les filtres — celui de Module 07 §31. */
export const SUPPLIER_INVOICE_STATUS_ORDER: SupplierInvoiceStatus[] = [
  'DRAFT',
  'PENDING',
  'VALIDATED',
  'OVERDUE',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
]

/**
 * Les statuts que le LOT 5 sait produire.
 *
 * « Partiellement payée » et « Payée » supposent des règlements ; « En retard »
 * se calcule. Aucun des trois n'est écrit en base.
 */
export const SUPPLIER_INVOICE_STATUS_REACHABLE: SupplierInvoiceStatus[] = [
  'DRAFT',
  'PENDING',
  'VALIDATED',
  'CANCELLED',
]

/** Une facture en saisie se modifie encore ; validée, elle est figée. */
export function isEditable(status: SupplierInvoiceStatus): boolean {
  return status === 'DRAFT' || status === 'PENDING'
}

/** Elle s'annule tant qu'elle n'est ni annulée ni réglée. */
export function isCancellable(status: SupplierInvoiceStatus): boolean {
  return status !== 'CANCELLED' && status !== 'PAID' && status !== 'PARTIALLY_PAID'
}

/** Seule une facture validée reçoit une imputation (Workflow 06 §32). */
export function acceptsImputations(status: SupplierInvoiceStatus): boolean {
  return status === 'VALIDATED'
}

/**
 * « En retard » — Module 07 §31, dérivé (DEC-025 §a).
 *
 * Une facture est en retard lorsque son échéance est passée et qu'il reste
 * quelque chose à payer. Tant qu'aucun règlement n'est géré, « reste à payer »
 * se lit « net à payer non nul ».
 *
 * `netPayable` vaut `null` lorsqu'il n'est pas lisible : on ne conclut alors
 * rien, plutôt que de qualifier une facture de « en retard » sur une somme
 * qu'on n'a pas pu lire (DEC-017).
 */
export function displayStatus(
  status: SupplierInvoiceStatus,
  dueDate: string | null,
  netPayable: number | null
): SupplierInvoiceStatus {
  if (status !== 'VALIDATED' || !dueDate || netPayable === null || netPayable <= 0) {
    return status
  }

  // Comparaison de jours calendaires, sur le fuseau d'affichage : une échéance
  // au 30 n'est pas dépassée le 30.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Comoro' })

  return dueDate < today ? 'OVERDUE' : status
}

/**
 * Montant en KMF — DEC-010 : entier, jamais un flottant.
 * Le formatage est séparé du stockage (Module 09 §19).
 */
export function formatAmount(amount: number | null): string | null {
  if (amount === null) return null
  return `${amount.toLocaleString('fr-FR')} KMF`
}
