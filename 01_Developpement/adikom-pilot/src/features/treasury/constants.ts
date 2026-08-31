import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Libellés de Banques & Caisses — Étape 2.5, LOT 6.
 *
 * Module 06 §5 : banques et caisses, « au minimum ». §10 : actif, inactif,
 * archivé. §19 : entrée et sortie. §36 : « pour le MVP, ne proposer que les
 * états réellement nécessaires » — deux suffisent pour une écriture.
 */

export type FinancialAccountKind = 'BANK' | 'CASH'
export type FinancialAccountStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
export type TreasuryDirection = 'IN' | 'OUT'
export type TreasuryEntryStatus = 'VALIDATED' | 'CANCELLED'

export type TreasuryEntryKind =
  | 'SUPPLIER_PAYMENT'
  | 'CUSTOMER_PAYMENT'
  | 'MISC_PAYMENT'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TRANSFER'
  | 'CORRECTION'

export const ACCOUNT_KIND_LABELS: Record<FinancialAccountKind, string> = {
  BANK: 'Compte bancaire',
  CASH: 'Caisse',
}

export const ACCOUNT_KIND_ORDER: FinancialAccountKind[] = ['BANK', 'CASH']

/** §7 : la banque du compte. §8 : le responsable de la caisse. */
export const ACCOUNT_INSTITUTION_LABELS: Record<FinancialAccountKind, string> = {
  BANK: 'Banque',
  CASH: 'Responsable',
}

export const ACCOUNT_STATUS_LABELS: Record<FinancialAccountStatus, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  ARCHIVED: 'Archivé',
}

export const ACCOUNT_STATUS_TONES: Record<FinancialAccountStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  ARCHIVED: 'neutral',
}

/** §10 : « un compte inactif ou archivé ne doit plus être proposé ». */
export const ACCOUNT_STATUS_HINTS: Record<FinancialAccountStatus, string> = {
  ACTIVE: 'Proposé pour les nouvelles opérations.',
  INACTIVE: 'N’est plus proposé ; son historique reste consultable.',
  ARCHIVED: 'N’est plus proposé ; son historique reste consultable.',
}

export const ACCOUNT_STATUS_ORDER: FinancialAccountStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED']

export const DIRECTION_LABELS: Record<TreasuryDirection, string> = {
  IN: 'Entrée',
  OUT: 'Sortie',
}

export const ENTRY_KIND_LABELS: Record<TreasuryEntryKind, string> = {
  SUPPLIER_PAYMENT: 'Paiement fournisseur',
  CUSTOMER_PAYMENT: 'Règlement client',
  MISC_PAYMENT: 'Paiement divers',
  DEPOSIT: 'Dépôt',
  WITHDRAWAL: 'Retrait',
  TRANSFER: 'Virement interne',
  CORRECTION: 'Correction autorisée',
}

export const ENTRY_STATUS_LABELS: Record<TreasuryEntryStatus, string> = {
  VALIDATED: 'Validée',
  CANCELLED: 'Annulée',
}

export const ENTRY_STATUS_TONES: Record<TreasuryEntryStatus, BadgeTone> = {
  VALIDATED: 'success',
  CANCELLED: 'danger',
}

/** Seuls les comptes actifs reçoivent une nouvelle opération (§10). */
export function acceptsOperations(status: FinancialAccountStatus): boolean {
  return status === 'ACTIVE'
}

/**
 * Montant signé d'une écriture — §19 : « le sens doit être clairement visible ».
 *
 * Le montant stocké est toujours positif ; c'est le SENS qui porte le signe.
 * L'affichage le rend, plutôt que de laisser lire un nombre nu.
 */
export function formatSigned(direction: TreasuryDirection, amount: number): string {
  const sign = direction === 'IN' ? '+' : '−'
  return `${sign} ${amount.toLocaleString('fr-FR')} KMF`
}

/** DEC-010 : entier, jamais un flottant. */
export function formatAmount(amount: number | null): string | null {
  if (amount === null) return null
  return `${amount.toLocaleString('fr-FR')} KMF`
}
