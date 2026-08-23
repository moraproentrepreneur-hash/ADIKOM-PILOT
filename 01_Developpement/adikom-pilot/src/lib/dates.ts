/**
 * Formatage des dates — ADIKOM PILOT.
 *
 * DEC-014, close sur ce point par DEC-025 §e : les horodatages sont stockés en
 * UTC (`timestamptz`) et interprétés sur le fuseau des Comores. Le fuseau est
 * fixé ici, et non laissé à celui du serveur : une application déployée sur
 * Vercel s'exécute en UTC, et un retour prévu « le 21 à 01:00 » s'afficherait
 * alors la veille à 22:00.
 *
 * SOURCE UNIQUE. `company_settings.timezone` porte la même valeur mais n'est
 * lue par rien : c'est un point d'extension, pas un paramètre en service. Le
 * câbler un jour se ferait ici, sans créer de seconde implémentation.
 *
 * Le cycle d'exploitation — réservation, départ, retard, prolongation, retour,
 * durée facturable, calendrier, tableau de location — dépend entièrement de ce
 * réglage.
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

/* -------------------------------------------------------------------------- */
/*  Saisie d'un instant — la conversion que le navigateur ne fait pas          */
/* -------------------------------------------------------------------------- */

/**
 * Décalage du fuseau d'affichage à un instant donné, en millisecondes.
 *
 * Calculé par `Intl` plutôt qu'écrit en dur : le décalage des Comores vaut
 * +3 h et ne change pas, mais l'inscrire ici en ferait une seconde définition
 * du fuseau — exactement ce que DEC-025 §e interdit.
 */
function zoneOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: DISPLAY_TIMEZONE,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  ) as Record<string, string>

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  )

  return asIfUtc - instant.getTime()
}

/**
 * `<input type="datetime-local">` → instant ISO en UTC.
 *
 * LE PIÈGE QUE CETTE FONCTION FERME.
 *
 * Un champ `datetime-local` produit une heure NUE : « 2026-09-01T08:00 », sans
 * fuseau. Transmise telle quelle à PostgreSQL, elle est lue dans le fuseau de
 * la session — UTC sur Supabase. Une réservation saisie à 08:00 aux Comores
 * était donc enregistrée à 08:00 UTC, et relue à 11:00. Trois heures de
 * dérive, silencieuses, sur la donnée même qui commande la non-collision.
 *
 * L'heure saisie est ici interprétée sur `Indian/Comoro` (DEC-025 §e), puis
 * convertie en instant. Toute écriture d'une période doit passer par elle.
 *
 * Les Comores n'observant pas d'heure d'été, une seule passe suffit ; un
 * fuseau à changement horaire en demanderait une seconde.
 */
export function fromLocalInput(value: string | null | undefined): string | null {
  if (!value) return null

  const parsed = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value)
  if (!parsed) return null

  const [, year, month, day, hour, minute] = parsed
  const naive = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))

  return new Date(naive - zoneOffsetMs(new Date(naive))).toISOString()
}

/** Instant ISO → valeur d'un `<input type="datetime-local">`, sur le fuseau d'affichage. */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return ''

  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return ''

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: DISPLAY_TIMEZONE,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  ) as Record<string, string>

  // `hour12: false` peut rendre « 24 » pour minuit selon le moteur : ramené à 00.
  const hour = String(Number(parts.hour) % 24).padStart(2, '0')

  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`
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
