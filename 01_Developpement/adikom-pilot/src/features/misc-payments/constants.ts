import type { BadgeTone } from '@/components/ui/primitives'
import type { TreasuryDirection } from '@/features/treasury/constants'

/**
 * Vocabulaire des paiements divers — Module 07 §43 à §46.
 *
 * §43 : « des paiements qui ne sont pas directement rattachés à une facture
 * client ou fournisseur ». Les quatre catégories sont celles que §43 cite, sans
 * ajout : les inventer reviendrait à décider à la place d'ADIKOM du plan de
 * classement de ses dépenses.
 *
 * §46 : « Brouillon ; Validé ; Annulé » — mot pour mot. C'est le seul menu de
 * facturation dont le catalogue expose une capacité de validation, et le seul
 * dont la documentation nomme un état de brouillon (DEC-029 §c, DEC-040).
 *
 * LE SENS — ajustement du 08/09/2026 (DEC-042 §b)
 *
 * Un paiement divers peut être un ENCAISSEMENT ou un DÉCAISSEMENT. Le sens
 * n'est pas un habillage : il décide de ce que l'écriture fait au solde du
 * compte. Il emprunte le vocabulaire des écritures — `IN` et `OUT` — plutôt que
 * d'en inventer un second pour dire la même chose.
 */

export type MiscPaymentStatus = 'DRAFT' | 'VALIDATED' | 'CANCELLED'

/** Le sens d'un paiement divers, dans le vocabulaire des écritures. */
export type MiscPaymentDirection = TreasuryDirection

export const MISC_PAYMENT_DIRECTIONS: MiscPaymentDirection[] = ['OUT', 'IN']

export const MISC_PAYMENT_DIRECTION_LABELS: Record<MiscPaymentDirection, string> = {
  IN: 'Encaissement',
  OUT: 'Décaissement',
}

/** Ce que chaque sens fait au compte — dit avant le clic, pas après. */
export const MISC_PAYMENT_DIRECTION_HINTS: Record<MiscPaymentDirection, string> = {
  IN: 'Une entrée de trésorerie : le solde du compte augmente du montant reçu.',
  OUT: 'Une sortie de trésorerie : le solde du compte diminue du montant payé.',
}

export const MISC_PAYMENT_DIRECTION_TONES: Record<MiscPaymentDirection, BadgeTone> = {
  IN: 'success',
  OUT: 'warning',
}

/** L'autre partie change de nom avec le sens : on ne verse pas à un payeur. */
export const MISC_PAYMENT_PARTY_LABELS: Record<MiscPaymentDirection, string> = {
  IN: 'Payeur',
  OUT: 'Bénéficiaire',
}

export const MISC_PAYMENT_PARTY_HINTS: Record<MiscPaymentDirection, string> = {
  IN: 'De qui l’argent est reçu.',
  OUT: 'À qui l’argent est versé.',
}

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

/**
 * Ce que chaque état signifie pour la trésorerie — §45, §46, §47.
 *
 * Le texte dépend du SENS : « le compte est débité » serait faux pour un
 * encaissement, et un écran qui dit le contraire de ce qu'il fait est pire
 * qu'un écran muet.
 */
export function miscPaymentStatusHint(
  status: MiscPaymentStatus,
  direction: MiscPaymentDirection
): string {
  const entree = direction === 'IN'

  switch (status) {
    case 'DRAFT':
      return entree
        ? 'Aucun fonds reçu au journal : l’écriture naît à la validation.'
        : 'Aucun fonds sorti : l’écriture naît à la validation.'
    case 'VALIDATED':
      return entree
        ? 'Le compte est crédité du montant reçu.'
        : 'Le compte est débité du montant payé.'
    default:
      return 'L’écriture est annulée ; le solde du compte est revenu.'
  }
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
