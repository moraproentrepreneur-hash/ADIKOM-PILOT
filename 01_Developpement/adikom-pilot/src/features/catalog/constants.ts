import type { BadgeTone } from '@/components/ui/primitives'
import { formatAmount } from '@/lib/money'

/**
 * Vocabulaire du catalogue de services — LOT 20, DEC-043.
 *
 * Aucun accès n'est décidé ici : les capacités sont vérifiées par les actions
 * serveur et par RLS. Ce fichier ne porte que des libellés et des mises en
 * forme, utilisables aussi bien par un composant serveur que client.
 */

/* -------------------------------------------------------------------------- */
/*  Destination — miroir de `public.service_purpose`                           */
/* -------------------------------------------------------------------------- */

export type ServicePurpose = 'PURCHASE' | 'SALE' | 'BOTH'

export const PURPOSE_LABELS: Record<ServicePurpose, string> = {
  PURCHASE: 'Achat',
  SALE: 'Vente',
  BOTH: 'Achat et vente',
}

/**
 * Ce que la destination autorise. Écrit une fois, lu partout.
 *
 * L'écran n'en déduit AUCUN droit : la base refuse de toute façon un prix de
 * vente sur un service d'achat. Ces deux fonctions évitent seulement de
 * proposer un champ qui serait refusé (CLAUDE.md §38 et §56).
 */
export function allowsSale(purpose: ServicePurpose): boolean {
  return purpose === 'SALE' || purpose === 'BOTH'
}

export function allowsPurchase(purpose: ServicePurpose): boolean {
  return purpose === 'PURCHASE' || purpose === 'BOTH'
}

export const PURPOSE_HELP: Record<ServicePurpose, string> = {
  PURCHASE: 'Ce service est acheté auprès d’un tiers. Il ne porte aucun prix de vente.',
  SALE: 'Ce service est vendu aux clients d’ADIKOM. Il ne porte aucun prix d’achat.',
  BOTH: 'Ce service est acheté puis revendu. Les deux prix sont admis, aucun n’est obligatoire.',
}

/* -------------------------------------------------------------------------- */
/*  Statut — miroir de `public.service_status`                                 */
/* -------------------------------------------------------------------------- */

export type ServiceStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'

export const STATUS_LABELS: Record<ServiceStatus, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  ARCHIVED: 'Archivé',
}

export const STATUS_TONES: Record<ServiceStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  ARCHIVED: 'neutral',
}

export const STATUS_HELP: Record<ServiceStatus, string> = {
  ACTIVE: 'Le service est proposable.',
  INACTIVE: 'Suspendu temporairement. Il reste au catalogue et ses prix demeurent.',
  ARCHIVED: 'Retiré du catalogue. L’historique et les prix restent consultables.',
}

/* -------------------------------------------------------------------------- */
/*  Montants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `bigint` en base, donc chaîne renvoyée par PostgREST lorsqu'il dépasse la
 * plage sûre. La conversion est faite une fois, ici, plutôt que devinée à
 * l'affichage — un montant n'est jamais une chaîne dans un calcul (DEC-010).
 */
export function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'string' ? Number(value) : value
  return Number.isSafeInteger(parsed) ? parsed : null
}

/** `50 000 KMF`, ou `—` lorsqu'aucun montant n'est applicable. */
export function formatMoney(value: number | null): string {
  return value === null ? '—' : formatAmount(value)
}

/* -------------------------------------------------------------------------- */
/*  Marge — calculée, jamais stockée (doctrine D1)                             */
/* -------------------------------------------------------------------------- */

export type Margin = {
  amount: number
  /** Taux en pourcentage, arrondi à une décimale. Absent si le prix est nul. */
  rate: number | null
}

/**
 * Marge unitaire d'une variante à une date donnée.
 *
 * Renvoie `null` dès qu'un des deux termes manque. UN COÛT ABSENT N'EST PAS UN
 * COÛT NUL : le traiter comme zéro ferait passer la marge pour 100 % du prix
 * (DEC-008, DEC-017). L'écran doit alors dire POURQUOI il ne montre rien.
 */
export function margin(price: number | null, cost: number | null): Margin | null {
  if (price === null || cost === null) return null

  const amount = price - cost
  const rate = price > 0 ? Math.round((amount / price) * 1000) / 10 : null

  return { amount, rate }
}
