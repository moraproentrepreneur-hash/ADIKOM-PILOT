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
