import type { BadgeTone } from '@/components/ui/primitives'
import { DISPLAY_TIMEZONE } from '@/lib/dates'

/**
 * Vocabulaire des avenants et des segments — LOT 22, DEC-045.
 *
 * Séparé de `data.ts`, marqué `server-only` : les composants clients ont besoin
 * de ces libellés, et les importer depuis la couche de données entraînerait le
 * client Supabase serveur dans le bundle navigateur.
 *
 * TROIS MOTS, TROIS CHOSES, JAMAIS CONFONDUES :
 *
 *   · CONTRAT   ce qui lie ADIKOM au client. Il ne change pas d'identité, même
 *               lorsque le véhicule change (A-4).
 *   · AVENANT   l'ACTE qui consigne un changement : sa nature, sa date d'effet,
 *               son motif, son auteur.
 *   · SEGMENT   la CONSÉQUENCE : un véhicule, une période, un tarif verrouillé.
 *
 * Un contrat a un avenant de plus, et un segment de plus. Il n'a jamais deux
 * identités.
 */

/* -------------------------------------------------------------------------- */
/*  Nature d'un avenant                                                        */
/* -------------------------------------------------------------------------- */

export type AmendmentKind = 'VEHICLE_CHANGE' | 'EXTENSION' | 'RATE_CHANGE'

export const AMENDMENT_KIND_LABELS: Record<AmendmentKind, string> = {
  VEHICLE_CHANGE: 'Changement de véhicule',
  EXTENSION: 'Prolongation',
  RATE_CHANGE: 'Changement de tarif',
}

export const AMENDMENT_KIND_TONES: Record<AmendmentKind, BadgeTone> = {
  VEHICLE_CHANGE: 'info',
  EXTENSION: 'neutral',
  RATE_CHANGE: 'warning',
}

/* -------------------------------------------------------------------------- */
/*  État d'un segment                                                          */
/* -------------------------------------------------------------------------- */

export type SegmentStatus = 'ACTIVE' | 'ENDED' | 'CANCELLED'

export const SEGMENT_STATUS_LABELS: Record<SegmentStatus, string> = {
  ACTIVE: 'En cours',
  ENDED: 'Terminé',
  CANCELLED: 'Annulé',
}

export const SEGMENT_STATUS_TONES: Record<SegmentStatus, BadgeTone> = {
  ACTIVE: 'success',
  ENDED: 'neutral',
  CANCELLED: 'danger',
}

export const SEGMENT_STATUS_HELP: Record<SegmentStatus, string> = {
  ACTIVE: 'Le véhicule est affecté au contrat pour cette période.',
  ENDED: 'Cette période est achevée : un autre véhicule, ou un autre tarif, a pris le relais.',
  CANCELLED: 'Cette affectation n’a jamais été exécutée — elle n’a engagé aucun véhicule.',
}

/* -------------------------------------------------------------------------- */
/*  Ce que la chronologie doit dire, et ne jamais taire                        */
/* -------------------------------------------------------------------------- */

/**
 * Rappel affiché sur la chronologie d'un contrat.
 *
 * 🟩 A-4 : « On garde le même contrat et on rajoute des avenants. » L'écran doit
 * le DIRE : un exploitant qui voit deux véhicules sur une même fiche doit
 * comprendre qu'il n'y a pas deux contrats.
 */
export const SAME_CONTRACT_NOTE =
  'Un remplacement de véhicule ne crée pas de nouveau contrat : le contrat reste le même, et chaque changement y est consigné par un avenant. L’ancien véhicule et son tarif restent lisibles ci-dessous.'

/**
 * Pourquoi la commission d'un contrat segmenté ne se totalise pas.
 *
 * Additionner 10 000 KMF/jour et 15 000 KMF/jour ne donne pas 25 000 KMF/jour :
 * il faudrait pondérer chaque segment par sa DURÉE FACTURABLE, dont la règle
 * d'arrondi n'est pas arrêtée (DEC-008). Le système affiche donc la commission
 * de CHAQUE segment, et dit pourquoi il n'en fait pas la somme — plutôt que de
 * produire un total qui aurait l'air juste.
 */
export const COMMISSION_NO_TOTAL_NOTE =
  'La commission est donnée par segment, et non totalisée : additionner des montants journaliers supposerait une règle de durée facturable qui n’est pas encore arrêtée. Le total en valeur relèvera de la facturation.'

/**
 * Ce que l'exception tarifaire signifie, écrit là où elle s'affiche.
 *
 * 🟩 A-5 : « Généralement le client paie le nouveau tarif, toutefois des
 * situations peuvent se présenter autrement et on les gère selon le contexte. »
 */
export const OVERRIDE_NOTE =
  'Tarif appliqué en dérogation du barème, sous la capacité « Forcer un tarif manuellement ». La raison écrite ci-dessous accompagne la décision, et l’acte figure au journal d’activité.'

/* -------------------------------------------------------------------------- */
/*  Instants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Le jour COMORIEN d'un instant, au format `AAAA-MM-JJ`.
 *
 * Reprend `businessDate` des tarifs fournisseurs, pour la même raison : découper
 * un instant UTC donnerait, entre 21 h et minuit, la veille à Moroni (DEC-025
 * §e). La fonction est réécrite plutôt qu'importée pour ne pas faire dépendre le
 * module des avenants de celui du coût fournisseur — dont la lecture est
 * gouvernée par une capacité que l'avenant n'exige pas.
 */
export function businessDay(instant: string | null | undefined): string {
  const parsed = instant ? new Date(instant) : new Date()
  const value = Number.isNaN(parsed.getTime()) ? new Date() : parsed

  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: DISPLAY_TIMEZONE,
  }).format(value)
}
