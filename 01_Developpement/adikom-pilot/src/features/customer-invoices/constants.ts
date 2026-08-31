import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Libellés et états de la facture client — Étape 2.5, LOT 7.
 *
 * Workflow 07 §27 : les six statuts recommandés, et rien de plus.
 *
 * TROIS SE CALCULENT, ET NE S'ÉCRIVENT JAMAIS
 *
 *   `OVERDUE`                    de l'échéance et de la date du jour
 *                                (§30, DEC-025 §a).
 *   `PARTIALLY_PAID` · `PAID`    des RÈGLEMENTS enregistrés. §61 : « Le statut
 *                                doit être calculé à partir des règlements
 *                                réellement enregistrés. »
 *
 * La base refuse les trois transitions ; `displayStatus` les produit — le jour
 * où les encaissements clients existeront. Aujourd'hui, ils n'existent pas :
 * `paidAmount` vaut toujours `null`, et l'écran le DIT plutôt que d'afficher un
 * zéro qui se lirait « rien à encaisser » (DEC-017).
 */

export type CustomerInvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED'

export const CUSTOMER_INVOICE_STATUS_LABELS: Record<CustomerInvoiceStatus, string> = {
  DRAFT: 'Brouillon',
  ISSUED: 'Émise',
  PARTIALLY_PAID: 'Partiellement payée',
  PAID: 'Payée',
  OVERDUE: 'En retard',
  CANCELLED: 'Annulée',
}

export const CUSTOMER_INVOICE_STATUS_TONES: Record<CustomerInvoiceStatus, BadgeTone> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'danger',
}

/** Ce que chaque état signifie pour l'argent — la question que l'écran doit trancher. */
export const CUSTOMER_INVOICE_STATUS_EFFECT: Record<CustomerInvoiceStatus, string> = {
  DRAFT: 'En préparation. Aucune créance n’est encore reconnue.',
  ISSUED: 'Créance reconnue. Ses lignes et ses montants sont figés.',
  PARTIALLY_PAID: 'Partiellement encaissée. Un solde subsiste.',
  PAID: 'Intégralement encaissée.',
  OVERDUE: 'Échéance dépassée et solde non encaissé.',
  CANCELLED: 'Annulée. La location qu’elle facturait est redevenue « À facturer ».',
}

/** Ordre d'affichage dans les filtres — celui de Workflow 07 §27. */
export const CUSTOMER_INVOICE_STATUS_ORDER: CustomerInvoiceStatus[] = [
  'DRAFT',
  'ISSUED',
  'OVERDUE',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
]

/** Les statuts réellement ÉCRITS en base. Les trois autres se calculent. */
export const CUSTOMER_INVOICE_STATUS_STORED: CustomerInvoiceStatus[] = [
  'DRAFT',
  'ISSUED',
  'CANCELLED',
]

/** Une facture en brouillon se modifie encore ; émise, elle est figée (§8, §45). */
export function isEditable(status: CustomerInvoiceStatus): boolean {
  return status === 'DRAFT'
}

/** Elle s'annule tant qu'elle n'est ni annulée ni encaissée. */
export function isCancellable(status: CustomerInvoiceStatus): boolean {
  return status !== 'CANCELLED' && status !== 'PAID' && status !== 'PARTIALLY_PAID'
}

/* -------------------------------------------------------------------------- */
/*  La nature d'une ligne — §14, §15, §22, §24                                 */
/* -------------------------------------------------------------------------- */

export type CustomerInvoiceLineKind = 'RENTAL' | 'SERVICE' | 'FEE' | 'DISCOUNT'

export const LINE_KIND_LABELS: Record<CustomerInvoiceLineKind, string> = {
  RENTAL: 'Location',
  SERVICE: 'Service supplémentaire',
  FEE: 'Frais',
  DISCOUNT: 'Réduction',
}

export const LINE_KIND_ORDER: CustomerInvoiceLineKind[] = [
  'RENTAL',
  'SERVICE',
  'FEE',
  'DISCOUNT',
]

export const LINE_KIND_HELP: Record<CustomerInvoiceLineKind, string> = {
  RENTAL: 'La prestation de location elle-même, au tarif verrouillé du contrat.',
  SERVICE: 'Prestation ajoutée à la location (§14).',
  FEE: 'Frais validé : retard, carburant, dommage, équipement manquant (§15).',
  DISCOUNT: 'Se SOUSTRAIT du total. Le montant reste positif : c’est la nature qui porte le sens (§24).',
}

/** Une réduction se soustrait ; tout le reste s'ajoute. */
export function isDeduction(kind: CustomerInvoiceLineKind): boolean {
  return kind === 'DISCOUNT'
}

/* -------------------------------------------------------------------------- */
/*  États dérivés et formatage                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Les trois états dérivés — §27, §30, §61, DEC-025 §a.
 *
 *   Payée                de `encaissements ≥ total`
 *   Partiellement payée  d'un encaissement au moins, sans solder
 *   En retard            d'une échéance passée et d'un solde restant
 *
 * L'ORDRE COMPTE : une facture soldée n'est jamais « en retard », même échéance
 * dépassée. Le retard qualifie une créance qui court encore.
 *
 * `paidAmount` vaut `null` tant que les règlements clients n'existent pas : on
 * ne conclut alors RIEN sur l'encaissement, et seul le retard reste calculable —
 * il ne dépend que de l'échéance.
 */
export function displayStatus(
  status: CustomerInvoiceStatus,
  dueDate: string | null,
  total: number | null,
  paidAmount: number | null = null
): CustomerInvoiceStatus {
  if (status !== 'ISSUED' || total === null) return status

  if (paidAmount !== null && total > 0) {
    if (paidAmount >= total) return 'PAID'
    if (paidAmount > 0) return 'PARTIALLY_PAID'
  }

  const remaining = total - (paidAmount ?? 0)
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
