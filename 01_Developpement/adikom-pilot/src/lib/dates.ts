/**
 * Formatage des dates — ADIKOM PILOT.
 *
 * DEC-014 : les horodatages sont stockés en UTC (`timestamptz`) et affichés sur
 * le fuseau des Comores. Le fuseau est fixé ici, et non laissé à celui du
 * serveur : une application déployée sur Vercel s'exécute en UTC, et un retour
 * prévu « le 21 à 01:00 » s'afficherait alors la veille à 22:00.
 *
 * Le fuseau reste à confirmer par ADIKOM (DEC-014) ; le changer se fait ici,
 * en un seul point.
 */

export const DISPLAY_TIMEZONE = 'Indian/Comoro'

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: DISPLAY_TIMEZONE,
})

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: DISPLAY_TIMEZONE,
})

/**
 * Date seule : `2026-08-21` → `21/08/2026`.
 *
 * Une date sans heure est traitée comme un jour civil, pas comme un instant :
 * la convertir en fuseau la ferait basculer d'un jour. Elle est donc formatée
 * telle qu'elle est stockée.
 */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return `${day}/${month}/${year}`
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : DATE_FORMAT.format(parsed)
}

/** Horodatage : `21/08/2026 14:05`, sur le fuseau d'affichage. */
export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : DATE_TIME_FORMAT.format(parsed)
}

/** Période affichée d'un bloc de calendrier : `du 21/08/2026 au 25/08/2026`. */
export function formatPeriod(from: string | null, to: string | null): string {
  const start = formatDateTime(from)
  const end = formatDateTime(to)

  if (start && end) return `du ${start} au ${end}`
  if (start) return `à partir du ${start}`
  if (end) return `jusqu’au ${end}`
  return '—'
}

/** Date du jour au format attendu par un champ `<input type="date">`. */
export function todayISO(): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: DISPLAY_TIMEZONE,
  }).format(now)
  return parts
}
