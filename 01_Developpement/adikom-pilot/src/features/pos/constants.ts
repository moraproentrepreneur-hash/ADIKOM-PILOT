import type { BadgeTone } from '@/components/ui/primitives'
import { formatAmount } from '@/lib/money'

/**
 * Point de vente — caisses et sessions (LOT 27, Module 12).
 *
 * Ce module ne contient que du vocabulaire et des calculs d'AFFICHAGE, sans
 * accès aux données : il est importable par les composants clients comme par
 * le serveur, et il se teste sans base.
 *
 * 🟥 AUCUN MONTANT N'Y EST CALCULÉ POUR ÊTRE CRU. Le théorique et l'écart sont
 * dérivés EN BASE (`pos_session_expected`, `pos_session_variance` — D1). Ce
 * fichier ne fait que les DIRE.
 */

export type PosSessionStatus = 'OPEN' | 'CLOSED'

export const SESSION_STATUS_LABELS: Record<PosSessionStatus, string> = {
  OPEN: 'Ouverte',
  CLOSED: 'Close',
}

export const SESSION_STATUS_TONES: Record<PosSessionStatus, BadgeTone> = {
  OPEN: 'success',
  CLOSED: 'neutral',
}

export const SESSION_STATUS_ORDER: PosSessionStatus[] = ['OPEN', 'CLOSED']

export const REGISTER_ACTIVE_LABELS = { true: 'Active', false: 'Inactive' } as const

/** Libellés de ce qui ne peut pas être lu — jamais un tiret, qui se lirait « personne » (DEC-017). */
export const UNREADABLE_CASHIER = 'Caissier non lisible avec vos droits'
export const UNREADABLE_REGISTER = 'Caisse non lisible avec vos droits'

/* -------------------------------------------------------------------------- */
/*  L'écart — B-9 : constaté, jamais bloquant                                  */
/* -------------------------------------------------------------------------- */

export type VarianceReading =
  /** Les montants ne sont pas lisibles : on le DIT, on n'affiche pas 0. */
  | { kind: 'hidden' }
  /** Session ouverte : aucun montant compté, donc aucun écart. */
  | { kind: 'pending' }
  | { kind: 'balanced' }
  | { kind: 'surplus'; amount: number }
  | { kind: 'shortage'; amount: number }

/**
 * Lit un écart rendu par la base.
 *
 * `amountsReadable` distingue « je ne peux pas savoir » de « il n'y a rien » :
 * `pos_session_variance` rend NULL dans les deux cas (session ouverte, montants
 * invisibles), et les confondre ferait dire « session ouverte » à un écran qui
 * ne sait simplement pas.
 */
export function readVariance(
  variance: number | null,
  amountsReadable: boolean,
  status: PosSessionStatus
): VarianceReading {
  if (!amountsReadable) return { kind: 'hidden' }
  if (status === 'OPEN' || variance === null) return { kind: 'pending' }
  if (variance === 0) return { kind: 'balanced' }
  return variance > 0
    ? { kind: 'surplus', amount: variance }
    : { kind: 'shortage', amount: -variance }
}

export function describeVariance(reading: VarianceReading): string {
  switch (reading.kind) {
    case 'hidden':
      return 'Montants non visibles avec vos droits'
    case 'pending':
      return 'Session ouverte — l’écart se constate à la clôture'
    case 'balanced':
      return 'Aucun écart'
    case 'surplus':
      return `Excédent de ${formatAmount(reading.amount)}`
    case 'shortage':
      return `Manque de ${formatAmount(reading.amount)}`
  }
}

export const VARIANCE_TONES: Record<VarianceReading['kind'], BadgeTone> = {
  hidden: 'neutral',
  pending: 'info',
  balanced: 'success',
  surplus: 'warning',
  shortage: 'danger',
}

/* -------------------------------------------------------------------------- */
/*  La fenêtre « qui était en caisse ? »                                       */
/* -------------------------------------------------------------------------- */

export type SessionWindowInput = {
  /** Jour, AAAA-MM-JJ, au fuseau comorien. */
  day: string
  /** Heure de début, HH:MM. Vide : début de journée. */
  from: string
  /** Heure de fin, HH:MM. Vide : fin de journée. */
  to: string
}

export type SessionWindow =
  | { kind: 'none' }
  | { kind: 'invalid'; message: string }
  | { kind: 'window'; fromLocal: string; toLocal: string; label: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Traduit la saisie de l'écran en fenêtre locale `[début, fin)`.
 *
 * Sans jour, pas de fenêtre : la liste montre les sessions les plus récentes.
 * Avec un jour seul, la fenêtre couvre la journée entière. La conversion vers
 * l'instant UTC se fait ailleurs (`fromLocalInput`), au fuseau comorien.
 *
 * La fin de journée est `J+1 00:00` — et non `23:59` —, sans quoi une session
 * ouverte à 23h59 et 30 secondes serait oubliée.
 */
export function parseSessionWindow(input: SessionWindowInput): SessionWindow {
  const day = input.day.trim()
  const from = input.from.trim()
  const to = input.to.trim()

  if (!day) {
    return from || to
      ? { kind: 'invalid', message: 'Choisissez le jour avant la plage horaire.' }
      : { kind: 'none' }
  }

  if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    return { kind: 'invalid', message: 'Le jour saisi n’est pas une date valide.' }
  }
  if (from && !TIME.test(from)) {
    return { kind: 'invalid', message: 'L’heure de début doit s’écrire HH:MM.' }
  }
  if (to && !TIME.test(to)) {
    return { kind: 'invalid', message: 'L’heure de fin doit s’écrire HH:MM.' }
  }

  const fromLocal = `${day}T${from || '00:00'}`
  const toLocal = to ? `${day}T${to}` : `${nextDay(day)}T00:00`

  if (to && from && to <= from) {
    return { kind: 'invalid', message: 'L’heure de fin doit suivre l’heure de début.' }
  }
  if (to === '00:00') {
    return { kind: 'invalid', message: 'L’heure de fin doit suivre l’heure de début.' }
  }

  const [y, m, d] = day.split('-')
  const label =
    from || to
      ? `le ${d}/${m}/${y} entre ${from || '00:00'} et ${to || '24:00'}`
      : `le ${d}/${m}/${y}`

  return { kind: 'window', fromLocal, toLocal, label }
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

/* -------------------------------------------------------------------------- */
/*  Durée d'une session                                                        */
/* -------------------------------------------------------------------------- */

/** « 2 h 05 », « 45 min » — durée entre deux instants, à la minute. */
export function formatDuration(fromIso: string, toIso: string | null, now = new Date()): string {
  const start = Date.parse(fromIso)
  const end = toIso ? Date.parse(toIso) : now.getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—'

  const minutes = Math.floor((end - start) / 60000)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return `${hours} h ${String(rest).padStart(2, '0')}`
}
