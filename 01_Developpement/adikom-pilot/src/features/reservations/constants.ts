import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Constantes des réservations — DEC-006.
 *
 * Une réservation n'est pas une location : deux entités, deux jeux de statuts,
 * reliés par une référence. Aucune valeur n'est partagée entre les deux.
 */

export type ReservationStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'CONVERTED'
  | 'CANCELLED'
  | 'EXPIRED'

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  DRAFT: 'Brouillon',
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  PREPARING: 'En préparation',
  CONVERTED: 'Convertie en location',
  CANCELLED: 'Annulée',
  EXPIRED: 'Expirée',
}

export const STATUS_TONES: Record<ReservationStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  CONFIRMED: 'success',
  PREPARING: 'info',
  CONVERTED: 'info',
  CANCELLED: 'neutral',
  EXPIRED: 'danger',
}

/**
 * Statuts qu'un utilisateur peut choisir dans un filtre.
 *
 * `EXPIRED` en fait partie bien qu'il ne soit jamais écrit : il est dérivé, et
 * le filtre doit pouvoir le retrouver comme n'importe quel autre état.
 */
export const FILTERABLE_STATUSES: ReservationStatus[] = [
  'DRAFT',
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'CONVERTED',
  'CANCELLED',
  'EXPIRED',
]

/**
 * Statut apparent d'une réservation — DEC-025 §a.
 *
 * `EXPIRED` n'est JAMAIS enregistré : le projet n'a pas d'ordonnanceur, et un
 * statut stocké qui dépendrait d'une tâche non exécutée afficherait une
 * information fausse. Il est donc calculé à la lecture, à partir de l'heure
 * courante.
 *
 * La dérivation ne concerne que les réservations NON ENGAGÉES — brouillon et
 * en attente. Une réservation confirmée dont la date est passée bloque encore
 * le calendrier : l'annoncer « expirée » alors qu'elle immobilise un véhicule
 * serait plus trompeur que de montrer son état réel.
 */
export function displayStatus(status: ReservationStatus, startsAt: string): ReservationStatus {
  if (status !== 'DRAFT' && status !== 'PENDING') return status
  return new Date(startsAt).getTime() < Date.now() ? 'EXPIRED' : status
}
