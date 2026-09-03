/**
 * La période analysée du tableau de bord — Module 01 §5, §8.
 *
 * UNE PÉRIODE N'EST PAS UNE FENÊTRE GLISSANTE.
 *
 * « Ce mois » ne veut pas dire « les trente derniers jours » : il veut dire le
 * mois civil en cours. Un cumul qui recule d'un jour chaque nuit ne se compare
 * à rien et ne se rapproche d'aucun relevé.
 *
 * TOUT SE CALCULE SUR `Indian/Comoro` (DEC-025 §e).
 *
 * L'application s'exécute en UTC sur Vercel. Le 1er du mois à 01:00 aux
 * Comores, il est encore le dernier jour du mois précédent en UTC : un
 * indicateur calculé sur l'horloge du serveur afficherait le mois d'avant
 * pendant trois heures, chaque mois.
 *
 * Le jour civil est donc lu par `Intl`, puis les bornes sont posées par une
 * arithmétique de CALENDRIER — jamais par une soustraction de millisecondes,
 * qui suppose des jours de longueur égale.
 *
 * CE MODULE NE FAIT AUCUNE LECTURE. Il est pur, et testé comme tel.
 */

import { DISPLAY_TIMEZONE } from '@/lib/dates'

export const PERIOD_KEYS = ['jour', 'semaine', 'mois', 'trimestre', 'annee'] as const

export type PeriodKey = (typeof PERIOD_KEYS)[number]

/** Le mois civil : assez large pour une tendance, assez court pour agir. */
export const DEFAULT_PERIOD: PeriodKey = 'mois'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  jour: 'Aujourd’hui',
  semaine: 'Cette semaine',
  mois: 'Ce mois',
  trimestre: 'Ce trimestre',
  annee: 'Cette année',
}

export type Period = {
  key: PeriodKey
  label: string
  /** Premier jour inclus, `YYYY-MM-DD`. */
  from: string
  /** Dernier jour inclus, `YYYY-MM-DD`. */
  to: string
}

/** Le jour civil courant sur le fuseau d'affichage, en `YYYY-MM-DD`. */
export function civilToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Arithmétique de calendrier.
 *
 * Les parties du jour civil sont replacées dans un instant UTC : elles n'y
 * désignent plus un moment, seulement une case de calendrier. Aucun fuseau
 * n'intervient plus ensuite, et aucune heure d'été ne peut décaler un mois.
 */
function toParts(day: string): { year: number; month: number; date: number } {
  const [year, month, date] = day.split('-').map(Number)
  return { year, month, date }
}

function fromUTC(instant: number): string {
  return new Date(instant).toISOString().slice(0, 10)
}

function utc(year: number, month: number, date: number): number {
  return Date.UTC(year, month - 1, date)
}

/** Jour de la semaine, lundi = 0 (ISO 8601 : la semaine commence le lundi). */
function isoWeekday(instant: number): number {
  return (new Date(instant).getUTCDay() + 6) % 7
}

const DAY = 86_400_000

/**
 * Les bornes civiles de la période choisie.
 *
 * `key` inconnue — un paramètre d'URL bricolé — retombe sur le mois : le
 * tableau de bord affiche alors une période valide plutôt qu'une erreur.
 */
export function resolvePeriod(key: string | undefined, now: Date = new Date()): Period {
  const safe: PeriodKey = (PERIOD_KEYS as readonly string[]).includes(key ?? '')
    ? (key as PeriodKey)
    : DEFAULT_PERIOD

  const today = civilToday(now)
  const { year, month, date } = toParts(today)
  const instant = utc(year, month, date)

  let from: string
  let to: string

  switch (safe) {
    case 'jour':
      from = today
      to = today
      break

    case 'semaine': {
      const monday = instant - isoWeekday(instant) * DAY
      from = fromUTC(monday)
      to = fromUTC(monday + 6 * DAY)
      break
    }

    case 'trimestre': {
      const firstMonth = Math.floor((month - 1) / 3) * 3 + 1
      from = fromUTC(utc(year, firstMonth, 1))
      // Le premier jour du trimestre suivant, moins un jour : aucun 30/31 à
      // connaître, aucune année bissextile à traiter.
      to = fromUTC(utc(year, firstMonth + 3, 1) - DAY)
      break
    }

    case 'annee':
      from = fromUTC(utc(year, 1, 1))
      to = fromUTC(utc(year, 12, 31))
      break

    case 'mois':
    default:
      from = fromUTC(utc(year, month, 1))
      to = fromUTC(utc(year, month + 1, 1) - DAY)
      break
  }

  return { key: safe, label: PERIOD_LABELS[safe], from, to }
}

/** `du 01/09/2026 au 30/09/2026` — jours civils, jamais convertis. */
export function describePeriod(period: Period): string {
  const fr = (day: string) => day.split('-').reverse().join('/')
  return period.from === period.to
    ? `le ${fr(period.from)}`
    : `du ${fr(period.from)} au ${fr(period.to)}`
}
