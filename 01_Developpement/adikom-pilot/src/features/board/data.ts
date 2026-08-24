import 'server-only'

import { can } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { DISPLAY_TIMEZONE } from '@/lib/dates'
import {
  listReservations,
  type ReservationListItem,
} from '@/features/reservations/data'
import { listRentals, type RentalListItem } from '@/features/rentals/data'

/**
 * Tableau de location — la lecture, et rien d'autre.
 *
 * AUCUNE LOGIQUE MÉTIER N'EST RÉÉCRITE ICI.
 *
 * Le tableau interroge `listReservations` et `listRentals`, les mêmes
 * fonctions que les listes et les fiches : mêmes requêtes, même RLS, mêmes
 * conversions de période. Il ne fait que REGROUPER ce qu'elles renvoient.
 *
 * Les actions, elles, ne passent pas par ici : depuis le tableau, on NAVIGUE
 * vers la fiche, où les gestes du cycle restent portés par les fonctions
 * atomiques du lot 1. Rien n'est dupliqué.
 *
 * DEC-017 — CE QUE `null` SIGNIFIE
 *
 * Un groupe vaut `null` lorsque le lecteur n'a pas le droit de consulter la
 * ressource, et un tableau VIDE lorsqu'il n'y a réellement rien. L'écran doit
 * dire l'un et l'autre différemment : « vous n'y avez pas accès » n'est pas
 * « il n'y a rien aujourd'hui ».
 */

export type BoardFilters = {
  /** Fenêtre en jours pour les départs et retours attendus. */
  days: number
  clientId?: string
  vehicleId?: string
  categoryId?: string
}

export type Board = {
  /** `null` sans `rental.reservations.view`. */
  upcomingReservations: ReservationListItem[] | null
  /** `null` sans `rental.rentals.view` — vaut pour les cinq groupes suivants. */
  startingSoon: RentalListItem[] | null
  running: RentalListItem[] | null
  returningSoon: RentalListItem[] | null
  late: RentalListItem[] | null
  toControl: RentalListItem[] | null
  toInvoice: RentalListItem[] | null
  /** Vrai si les montants peuvent être affichés (DEC-024). */
  showAmounts: boolean
}

/** Jour civil d'un instant, sur le fuseau d'affichage (DEC-025 §e). */
function civilDay(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

/** Borne haute de la fenêtre : fin du n-ième jour à venir. */
function windowEnd(days: number): number {
  return Date.now() + days * 86400000
}

export async function loadBoard(filters: BoardFilters): Promise<Board> {
  const [canReservations, canRentals, showAmounts] = await Promise.all([
    can(PERMISSIONS.RESERVATIONS_VIEW),
    can(PERMISSIONS.RENTALS_VIEW),
    can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
  ])

  const scope = {
    clientId: filters.clientId,
    vehicleId: filters.vehicleId,
    categoryId: filters.categoryId,
  }

  /*
   * Cinq lectures ciblées plutôt qu'une lecture large découpée ensuite : chaque
   * groupe interroge ses propres états, et une file qui s'allonge — « à
   * facturer », par exemple — ne peut pas chasser les autres d'une limite
   * commune.
   */
  const [reservations, confirmed, live, toControl, toInvoice] = await Promise.all([
    canReservations
      ? listReservations({ ...scope, statuses: ['CONFIRMED', 'PREPARING'] })
      : Promise.resolve(null),
    canRentals ? listRentals({ ...scope, statuses: ['CONFIRMED'] }) : Promise.resolve(null),
    canRentals
      ? listRentals({ ...scope, statuses: ['IN_PROGRESS', 'EXTENDED'] })
      : Promise.resolve(null),
    canRentals ? listRentals({ ...scope, statuses: ['TO_CONTROL'] }) : Promise.resolve(null),
    canRentals ? listRentals({ ...scope, statuses: ['TO_INVOICE'] }) : Promise.resolve(null),
  ])

  const horizon = windowEnd(filters.days)
  const now = Date.now()

  return {
    upcomingReservations:
      reservations?.filter((row) => new Date(row.startsAt).getTime() <= horizon) ?? null,

    // Contrats confirmés dont le départ tombe dans la fenêtre — ou l'a déjà
    // dépassée sans être parti : c'est précisément ce qu'il faut voir.
    startingSoon:
      confirmed?.filter((row) => new Date(row.plannedFrom).getTime() <= horizon) ?? null,

    running: live ?? null,

    // « En retard » et « retour attendu » sont DÉRIVÉS de l'heure courante,
    // jamais stockés (DEC-025 §a). Un même contrat ne figure que dans l'un.
    returningSoon:
      live?.filter((row) => {
        const due = new Date(row.expectedReturnAt).getTime()
        return due >= now && due <= horizon
      }) ?? null,

    late: live?.filter((row) => new Date(row.expectedReturnAt).getTime() < now) ?? null,

    toControl: toControl ?? null,
    toInvoice: toInvoice ?? null,
    showAmounts,
  }
}

/** Le départ ou le retour tombe-t-il aujourd'hui ? Repère, jamais un calcul. */
export function isToday(value: string): boolean {
  return civilDay(value) === civilDay(new Date().toISOString())
}
