import { PERIOD_LABELS, resolvePeriod, type PeriodKey } from '@/features/dashboard/period'

/**
 * La période analysée des statistiques et des rapports — Module 07 §59.
 *
 * « Les périodes peuvent être : jour, semaine, mois, trimestre, année, période
 * personnalisée. » Les cinq premières sont exactement celles du tableau de bord
 * (LOT 9) : des périodes CIVILES, jamais des fenêtres glissantes. « Ce mois »
 * veut dire le mois en cours, pas les trente derniers jours — un cumul qui
 * recule d'un jour chaque nuit ne se compare à rien.
 *
 * Elles ne sont donc pas recalculées ici : `resolvePeriod` en reste la seule
 * vérité, et ce module lui ajoute ce que le tableau de bord n'a pas — la
 * PÉRIODE PERSONNALISÉE, que le Module 01 ne demande pas et que le Module 07
 * exige.
 *
 * LE GRAIN N'EST PAS UN CHOIX D'AFFICHAGE
 *
 * Il décide de ce que chaque point de la série agrège. Trois cent soixante-cinq
 * barres pour une année ne se lisent pas ; une seule barre pour une semaine
 * n'apprend rien. Le grain se déduit donc de l'étendue, et l'écran l'annonce.
 *
 * CE MODULE NE FAIT AUCUNE LECTURE. Il est pur, et testé comme tel.
 */

export const CUSTOM_PERIOD_KEY = 'personnalisee' as const

export const ANALYTICS_PERIOD_KEYS = [
  'jour',
  'semaine',
  'mois',
  'trimestre',
  'annee',
  CUSTOM_PERIOD_KEY,
] as const

export type AnalyticsPeriodKey = (typeof ANALYTICS_PERIOD_KEYS)[number]

export const ANALYTICS_PERIOD_LABELS: Record<AnalyticsPeriodKey, string> = {
  ...PERIOD_LABELS,
  [CUSTOM_PERIOD_KEY]: 'Période personnalisée',
}

/** Le pas d'agrégation d'une série — les cinq grains du §59. */
export type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year'

export const GRAIN_LABELS: Record<Grain, string> = {
  day: 'par jour',
  week: 'par semaine',
  month: 'par mois',
  quarter: 'par trimestre',
  year: 'par année',
}

/**
 * Ce que l'écran a dû corriger dans une période saisie à la main.
 *
 * Une correction silencieuse serait un mensonge : l'utilisateur croirait lire
 * les chiffres des dates qu'il a tapées. Elle est donc NOMMÉE, et l'écran la
 * rapporte (DEC-017).
 */
export type PeriodNote = 'incomplete' | 'swapped' | null

export type AnalyticsPeriod = {
  key: AnalyticsPeriodKey
  label: string
  /** Premier jour inclus, `AAAA-MM-JJ`. */
  from: string
  /** Dernier jour inclus, `AAAA-MM-JJ`. */
  to: string
  grain: Grain
  note: PeriodNote
}

/** Un jour civil complet et réel — `2026-02-30` n'en est pas un. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function isCivilDay(value: string | undefined): value is string {
  if (!value || !ISO_DAY.test(value)) return false
  const instant = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(instant)) return false
  // `Date.parse` accepte 2026-02-30 en le reportant au 2 mars : seul l'aller-
  // retour prouve que le jour existe vraiment.
  return new Date(instant).toISOString().slice(0, 10) === value
}

/** Nombre de jours civils entre deux bornes incluses. */
export function spanInDays(from: string, to: string): number {
  const day = 86_400_000
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / day) + 1
}

/**
 * Le pas d'une série, déduit de l'étendue de la période.
 *
 * Les seuils visent une série lisible — de quelques points à quelques dizaines,
 * jamais des centaines. Ils donnent aux cinq périodes fixes le grain attendu :
 * le jour, la semaine et le mois se lisent par jour ; le trimestre par semaine ;
 * l'année par mois.
 */
export function grainFor(from: string, to: string): Grain {
  const days = spanInDays(from, to)
  if (days <= 31) return 'day'
  if (days <= 120) return 'week'
  if (days <= 1100) return 'month'
  if (days <= 4000) return 'quarter'
  return 'year'
}

/**
 * Les bornes civiles de la période demandée.
 *
 * `personnalisee` exige deux jours valides. À défaut, l'écran retombe sur la
 * période par défaut — et le DIT (`note`), plutôt que d'afficher les chiffres
 * d'un mois qu'on ne lui a pas demandé sans prévenir.
 */
export function resolveAnalyticsPeriod(
  key: string | undefined,
  from: string | undefined,
  to: string | undefined,
  now: Date = new Date()
): AnalyticsPeriod {
  if (key === CUSTOM_PERIOD_KEY) {
    if (!isCivilDay(from) || !isCivilDay(to)) {
      const fallback = resolvePeriod(undefined, now)
      return { ...withGrain(fallback), note: 'incomplete' }
    }

    // Deux dates valides mais inversées : l'intention est lisible, la période
    // est lue à l'endroit — et la correction est annoncée.
    const swapped = from > to
    const start = swapped ? to : from
    const end = swapped ? from : to

    return {
      key: CUSTOM_PERIOD_KEY,
      label: ANALYTICS_PERIOD_LABELS[CUSTOM_PERIOD_KEY],
      from: start,
      to: end,
      grain: grainFor(start, end),
      note: swapped ? 'swapped' : null,
    }
  }

  return { ...withGrain(resolvePeriod(key, now)), note: null }
}

function withGrain(period: {
  key: PeriodKey
  label: string
  from: string
  to: string
}): Omit<AnalyticsPeriod, 'note'> {
  return { ...period, grain: grainFor(period.from, period.to) }
}

/** `du 01/09/2026 au 30/09/2026` — jours civils, jamais convertis. */
export function describeAnalyticsPeriod(period: AnalyticsPeriod): string {
  const fr = (day: string) => day.split('-').reverse().join('/')
  return period.from === period.to
    ? `le ${fr(period.from)}`
    : `du ${fr(period.from)} au ${fr(period.to)}`
}

/** L'étiquette d'un point de série, au grain choisi. */
export function describeBucket(bucket: string, grain: Grain): string {
  const [year, month, day] = bucket.split('-')
  switch (grain) {
    case 'day':
      return `${day}/${month}`
    case 'week':
      return `sem. ${day}/${month}`
    case 'month':
      return `${month}/${year}`
    case 'quarter':
      return `T${Math.floor((Number(month) - 1) / 3) + 1} ${year}`
    case 'year':
      return year
  }
}

/** Les paramètres d'URL qui reconduisent la période d'un écran à l'autre. */
export function periodQuery(period: AnalyticsPeriod): Record<string, string> {
  return period.key === CUSTOM_PERIOD_KEY
    ? { periode: period.key, du: period.from, au: period.to }
    : { periode: period.key }
}
