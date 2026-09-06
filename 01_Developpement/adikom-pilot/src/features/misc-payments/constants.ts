import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Vocabulaire des paiements divers — Module 07 §43 à §46, LOT 17.
 *
 * §43 : « des paiements qui ne sont pas directement rattachés à une facture
 * client ou fournisseur ». Les quatre catégories sont celles que §43 cite, sans
 * ajout : les inventer reviendrait à décider à la place d'ADIKOM du plan de
 * classement de ses dépenses.
 *
 * §46 : « Brouillon ; Validé ; Annulé » — mot pour mot. C'est le seul menu de
 * facturation dont le catalogue expose une capacité de validation, et le seul
 * dont la documentation nomme un état de brouillon (DEC-029 §c, DEC-040).
 */

export type MiscPaymentStatus = 'DRAFT' | 'VALIDATED' | 'CANCELLED'

export type MiscPaymentCategory =
  | 'ADMIN_FEE'
  | 'SMALL_EXPENSE'
  | 'ONE_OFF_SERVICE'
  | 'OTHER'

export const MISC_PAYMENT_STATUS_LABELS: Record<MiscPaymentStatus, string> = {
  DRAFT: 'Brouillon',
  VALIDATED: 'Validé',
  CANCELLED: 'Annulé',
}

export const MISC_PAYMENT_STATUS_TONES: Record<MiscPaymentStatus, BadgeTone> = {
  DRAFT: 'warning',
  VALIDATED: 'success',
  CANCELLED: 'danger',
}

export const MISC_PAYMENT_STATUS_ORDER: MiscPaymentStatus[] = [
  'DRAFT',
  'VALIDATED',
  'CANCELLED',
]

/** Ce que chaque état signifie pour la trésorerie — §45, §46, §47. */
export const MISC_PAYMENT_STATUS_HINTS: Record<MiscPaymentStatus, string> = {
  DRAFT: 'Aucun fonds sorti : l’écriture naît à la validation.',
  VALIDATED: 'Le compte source est débité du montant payé.',
  CANCELLED: 'L’écriture est annulée ; le solde du compte est revenu.',
}

export const MISC_PAYMENT_CATEGORY_LABELS: Record<MiscPaymentCategory, string> = {
  ADMIN_FEE: 'Frais administratifs',
  SMALL_EXPENSE: 'Petite dépense',
  ONE_OFF_SERVICE: 'Prestation ponctuelle',
  OTHER: 'Autre paiement autorisé',
}

export const MISC_PAYMENT_CATEGORY_ORDER: MiscPaymentCategory[] = [
  'ADMIN_FEE',
  'SMALL_EXPENSE',
  'ONE_OFF_SERVICE',
  'OTHER',
]
