import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Constantes des locations — DEC-006.
 *
 * Une location porte l'état d'EXÉCUTION du contrat ; la réservation, elle, ne
 * porte que l'engagement. Aucune valeur n'est partagée entre les deux jeux de
 * statuts.
 */

export type RentalStatus =
  | 'PREPARING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'EXTENDED'
  | 'LATE'
  | 'RETURNED'
  | 'TO_CONTROL'
  | 'TO_INVOICE'
  | 'INVOICED'
  | 'CLOSED'
  | 'CANCELLED'

export const STATUS_LABELS: Record<RentalStatus, string> = {
  PREPARING: 'En préparation',
  CONFIRMED: 'Confirmée',
  IN_PROGRESS: 'En cours',
  EXTENDED: 'Prolongée',
  LATE: 'En retard',
  RETURNED: 'Retournée',
  TO_CONTROL: 'À contrôler',
  TO_INVOICE: 'À facturer',
  INVOICED: 'Facturée',
  CLOSED: 'Clôturée',
  CANCELLED: 'Annulée',
}

export const STATUS_TONES: Record<RentalStatus, BadgeTone> = {
  PREPARING: 'neutral',
  CONFIRMED: 'info',
  IN_PROGRESS: 'success',
  EXTENDED: 'info',
  LATE: 'danger',
  RETURNED: 'info',
  TO_CONTROL: 'warning',
  TO_INVOICE: 'warning',
  INVOICED: 'neutral',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
}

/** Statuts proposés au filtrage, `LATE` compris bien qu'il soit dérivé. */
export const FILTERABLE_STATUSES: RentalStatus[] = [
  'PREPARING',
  'CONFIRMED',
  'IN_PROGRESS',
  'EXTENDED',
  'LATE',
  'RETURNED',
  'TO_CONTROL',
  'TO_INVOICE',
  'INVOICED',
  'CLOSED',
  'CANCELLED',
]

/**
 * Statut apparent d'une location — DEC-025 §a.
 *
 * `LATE` n'est JAMAIS enregistré : le projet n'a pas d'ordonnanceur, et un
 * statut stocké qui dépendrait d'une tâche non exécutée mentirait dès la
 * minute suivante. Il se calcule à la lecture, sur l'heure courante.
 *
 * Seule une location PARTIE peut être en retard : une location qui n'a pas
 * quitté le parc n'a rien à rendre.
 */
export function displayStatus(status: RentalStatus, expectedReturnAt: string): RentalStatus {
  if (status !== 'IN_PROGRESS' && status !== 'EXTENDED') return status
  return new Date(expectedReturnAt).getTime() < Date.now() ? 'LATE' : status
}

/* -------------------------------------------------------------------------- */
/*  États des lieux                                                            */
/* -------------------------------------------------------------------------- */

export type InspectionKind = 'DEPARTURE' | 'RETURN'

export const INSPECTION_LABELS: Record<InspectionKind, string> = {
  DEPARTURE: 'État des lieux de départ',
  RETURN: 'État des lieux de retour',
}

/**
 * Niveau de carburant, en crans.
 *
 * La documentation raisonne en fractions — « 3/4 » au départ, « 1/2 » au
 * retour (Module 05 §36) — et non en litres : un relevé à la jauge n'a pas la
 * précision d'un volume, et prétendre le contraire produirait un écart
 * faussement exact.
 */
export type FuelLevel = 'EMPTY' | 'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'FULL'

export const FUEL_LEVEL_LABELS: Record<FuelLevel, string> = {
  EMPTY: 'Vide',
  QUARTER: '1/4',
  HALF: '1/2',
  THREE_QUARTERS: '3/4',
  FULL: 'Plein',
}

/** Ordre de la jauge, du vide au plein — pour l'affichage et la comparaison. */
export const FUEL_LEVEL_ORDER: FuelLevel[] = [
  'EMPTY',
  'QUARTER',
  'HALF',
  'THREE_QUARTERS',
  'FULL',
]

/** Photos : mêmes limites que les documents de véhicule, même bucket. */
export const MAX_PHOTO_SIZE = 10 * 1024 * 1024

export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/* -------------------------------------------------------------------------- */
/*  Repères opérationnels                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Écart en jours civils entre aujourd'hui et une échéance, sur le fuseau
 * d'affichage. Positif à venir, négatif dépassé, zéro le jour même.
 *
 * CE N'EST PAS UNE DURÉE FACTURABLE.
 *
 * C'est un repère d'exploitation : « le retour est attendu dans deux jours ».
 * La durée facturable dépend d'une règle d'arrondi qui n'est pas arrêtée
 * (DEC-008 : jour entamé, heure de retour, franchise — tous « non définis »),
 * et aucun montant n'en est déduit ici. Confondre les deux produirait un
 * chiffre commercial inventé.
 */
export function calendarDaysUntil(iso: string, timeZone = 'Indian/Comoro'): number | null {
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return null

  const asCivilDate = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
    return Date.parse(`${parts}T00:00:00Z`)
  }

  return Math.round((asCivilDate(target) - asCivilDate(new Date())) / 86400000)
}
