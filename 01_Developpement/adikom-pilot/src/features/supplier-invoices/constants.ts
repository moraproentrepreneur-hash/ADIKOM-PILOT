import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Libellés et états de la facture fournisseur — Étape 2.5, LOTs 5 et 6.
 *
 * Module 07 §31 : les sept statuts documentés, et rien de plus.
 *
 * TROIS SE CALCULENT, ET NE S'ÉCRIVENT JAMAIS
 *
 *   `OVERDUE`                    de l'échéance et de la date du jour
 *                                (DEC-025 §a).
 *   `PARTIALLY_PAID` · `PAID`    des RÈGLEMENTS enregistrés. Module 07 §55 :
 *                                « La logique doit être calculée
 *                                automatiquement. » Un statut stocké pourrait
 *                                contredire la somme qui le dit — il suffirait
 *                                d'un règlement annulé.
 *
 * La base refuse les trois transitions ; `displayStatus` les produit.
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
  VALIDATED: 'Dette reconnue. La facture peut recevoir des imputations et des règlements.',
  PARTIALLY_PAID: 'Partiellement réglée. Un reste dû subsiste.',
  PAID: 'Intégralement réglée. Le net à payer est soldé.',
  OVERDUE: 'Échéance dépassée et reste dû non soldé.',
  CANCELLED: 'Annulée. Elle ne peut plus recevoir ni imputation ni règlement.',
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
 * Les statuts réellement ÉCRITS en base.
 *
 * Les trois autres se calculent à l'affichage et au filtrage.
 */
export const SUPPLIER_INVOICE_STATUS_STORED: SupplierInvoiceStatus[] = [
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

/** Et seule une facture validée se règle : ni brouillon, ni annulée. */
export function acceptsPayments(status: SupplierInvoiceStatus): boolean {
  return status === 'VALIDATED'
}

/*
 * Modes de paiement — Workflow 08 §12.
 *
 * Le vocabulaire a rejoint `features/treasury` au LOT 8 : un encaissement
 * client et un règlement fournisseur empruntent les mêmes modes, et le mode
 * appartient au MOUVEMENT, non au sens dans lequel il va. La réexportation
 * garde ce module comme point d'entrée de ses propres écrans.
 */
export {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
  type PaymentMethod,
} from '@/features/treasury/constants'

/**
 * Les trois états dérivés — Module 07 §31 et §55, DEC-025 §a.
 *
 *   Payée                de `règlements ≥ net à payer`
 *   Partiellement payée  d'un règlement au moins, sans solder
 *   En retard            d'une échéance passée et d'un reste dû
 *
 * L'ORDRE COMPTE : une facture soldée n'est jamais « en retard », même si son
 * échéance est passée. Le retard qualifie une dette qui court encore.
 *
 * `netPayable` ou `paidAmount` valent `null` lorsqu'ils ne sont pas lisibles :
 * on ne conclut alors RIEN, plutôt que de qualifier une facture sur une somme
 * qu'on n'a pas pu lire (DEC-017).
 */
export function displayStatus(
  status: SupplierInvoiceStatus,
  dueDate: string | null,
  netPayable: number | null,
  paidAmount: number | null = null
): SupplierInvoiceStatus {
  if (status !== 'VALIDATED' || netPayable === null) return status

  if (paidAmount !== null && netPayable > 0) {
    if (paidAmount >= netPayable) return 'PAID'
    if (paidAmount > 0) return 'PARTIALLY_PAID'
  }

  const remaining = netPayable - (paidAmount ?? 0)
  if (!dueDate || remaining <= 0) return status

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
