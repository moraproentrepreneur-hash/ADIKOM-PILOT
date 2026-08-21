import type { BadgeTone } from '@/components/ui/primitives'
import { formatAmount, NBSP } from '@/lib/money'

/**
 * Constantes partagées de la tarification.
 *
 * Séparées de `data.ts`, marqué `server-only` : les composants clients ont
 * besoin de ces libellés, et les importer depuis la couche de données
 * entraînerait le client Supabase serveur dans le bundle navigateur.
 */

/** Unité d'un tarif — DEC-001. Un montant sans unité n'existe pas. */
export type PricingUnit = 'DAY' | 'FLAT'

export const UNIT_LABELS: Record<PricingUnit, string> = {
  DAY: 'Par jour',
  FLAT: 'Forfait',
}

/** Suffixe d'affichage accolé à un montant : « 450 000 KMF / jour ». */
export const UNIT_SUFFIX: Record<PricingUnit, string> = {
  DAY: '/ jour',
  FLAT: 'forfait',
}

export const UNIT_HELP: Record<PricingUnit, string> = {
  DAY: 'Le montant est multiplié par la durée facturable.',
  FLAT: 'Le montant s’applique quelle que soit la durée.',
}

/**
 * Origine du tarif retenu par le résolveur (DEC-002).
 *
 * Elle est toujours affichée avant validation : l'utilisateur doit savoir
 * POURQUOI ce montant s'applique, et non seulement lequel s'applique
 * (04_Workflows/02_Reservation.md §8).
 */
export type PricingSource =
  | 'CLIENT_VEHICLE'
  | 'CLIENT_CATEGORY'
  | 'CLIENT'
  | 'VEHICLE'
  | 'CATEGORY'
  | 'STANDARD'
  | 'CLIENT_VEHICLE_DISCOUNT'
  | 'CLIENT_CATEGORY_DISCOUNT'
  | 'CLIENT_DISCOUNT'

export const SOURCE_LABELS: Record<PricingSource, string> = {
  CLIENT_VEHICLE: 'Tarif préférentiel du client sur ce véhicule',
  CLIENT_CATEGORY: 'Tarif préférentiel du client sur cette catégorie',
  CLIENT: 'Tarif préférentiel du client',
  VEHICLE: 'Tarif standard du véhicule',
  CATEGORY: 'Tarif standard de la catégorie',
  STANDARD: 'Tarif standard général',
  CLIENT_VEHICLE_DISCOUNT: 'Remise du client sur ce véhicule',
  CLIENT_CATEGORY_DISCOUNT: 'Remise du client sur cette catégorie',
  CLIENT_DISCOUNT: 'Remise accordée au client',
}

/** Un tarif préférentiel se distingue visuellement d'un tarif standard. */
export const SOURCE_TONES: Record<PricingSource, BadgeTone> = {
  CLIENT_VEHICLE: 'info',
  CLIENT_CATEGORY: 'info',
  CLIENT: 'info',
  VEHICLE: 'neutral',
  CATEGORY: 'neutral',
  STANDARD: 'neutral',
  CLIENT_VEHICLE_DISCOUNT: 'info',
  CLIENT_CATEGORY_DISCOUNT: 'info',
  CLIENT_DISCOUNT: 'info',
}

/** Portée d'une règle tarifaire, telle que présentée à l'utilisateur. */
export type PricingScope = 'GLOBAL' | 'CATEGORY' | 'VEHICLE'

export const SCOPE_LABELS: Record<PricingScope, string> = {
  GLOBAL: 'Tous les véhicules',
  CATEGORY: 'Une catégorie',
  VEHICLE: 'Un véhicule précis',
}

/** Mode d'expression du tarif : un montant, ou une remise sur la référence. */
export type PricingMode = 'AMOUNT' | 'DISCOUNT'

export const MODE_LABELS: Record<PricingMode, string> = {
  AMOUNT: 'Montant',
  DISCOUNT: 'Remise en pourcentage',
}

/**
 * Montant assorti de son unité : « 450 000 KMF / jour ».
 * Le formatage du montant lui-même reste dans `money.ts` (DEC-010).
 */
export function formatPrice(amount: number, unit: PricingUnit): string {
  return `${formatAmount(amount)}${NBSP}${UNIT_SUFFIX[unit]}`
}

/**
 * Un pourcentage de remise tel que saisi : « 10 % », « 7,5 % ».
 * La virgule décimale est la convention française ; le stockage reste numérique.
 */
export function formatDiscount(percent: number): string {
  return `${String(percent).replace('.', ',')}${NBSP}%`
}
