import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Le vocabulaire du second volet de Projets & Planification — Module 03.
 *
 * LA BASE PORTE LES ÉTATS, L'ÉCRAN PORTE LES MOTS.
 *
 * Les énumérations `planning_status` et `project_action_status` vivent dans la
 * migration 059. Les phrases françaises vivent ici, où elles se corrigent sans
 * migration — même partage qu'au LOT 12 et au Centre de notifications.
 *
 * UN SEUL TYPE, DEUX ACCORDS.
 *
 * Une réunion et un rendez-vous vivent le même cycle : prévu, tenu, annulé.
 * La base ne connaît donc qu'un type ; l'écran, lui, accorde — « Tenue » pour
 * une réunion, « Honoré » pour un rendez-vous. Ce sont deux mots pour un même
 * état, non deux états (CLAUDE.md §59).
 */

/* -------------------------------------------------------------------------- */
/*  Réunions et rendez-vous — §21, §26                                         */
/* -------------------------------------------------------------------------- */

export const PLANNING_STATUSES = ['PLANNED', 'HELD', 'CANCELLED'] as const

export type PlanningStatus = (typeof PLANNING_STATUSES)[number]

export const MEETING_STATUS_LABELS: Record<PlanningStatus, string> = {
  PLANNED: 'Planifiée',
  HELD: 'Tenue',
  CANCELLED: 'Annulée',
}

export const APPOINTMENT_STATUS_LABELS: Record<PlanningStatus, string> = {
  PLANNED: 'Planifié',
  HELD: 'Honoré',
  CANCELLED: 'Annulé',
}

export const PLANNING_STATUS_TONES: Record<PlanningStatus, BadgeTone> = {
  PLANNED: 'info',
  HELD: 'success',
  CANCELLED: 'danger',
}

/**
 * Miroir de `fn_planning_status_transition` (migration 059).
 *
 * Il ne protège rien : la base refuse d'elle-même un enchaînement absurde. Il
 * évite seulement de PROPOSER un choix qui sera refusé — annulé est terminal,
 * tenu se replanifie (DEC-035 §d, reconduit).
 */
export const PLANNING_NEXT_STATUSES: Record<PlanningStatus, readonly PlanningStatus[]> = {
  PLANNED: ['HELD', 'CANCELLED'],
  HELD: ['PLANNED'],
  CANCELLED: [],
}

/* -------------------------------------------------------------------------- */
/*  Actions — §25                                                              */
/* -------------------------------------------------------------------------- */

export const ACTION_STATUSES = ['TODO', 'DONE', 'CANCELLED'] as const

export type ActionStatus = (typeof ACTION_STATUSES)[number]

/**
 * Les mêmes mots que pour une tâche, pour les mêmes états.
 *
 * Une action n'a ni « En cours » ni « En attente » : ce degré de suivi est
 * précisément ce qui la fait devenir une TÂCHE (§25). Lui donner cinq états
 * effacerait la distinction que le module pose.
 */
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  TODO: 'À faire',
  DONE: 'Terminée',
  CANCELLED: 'Annulée',
}

export const ACTION_STATUS_TONES: Record<ActionStatus, BadgeTone> = {
  TODO: 'neutral',
  DONE: 'success',
  CANCELLED: 'danger',
}

export const ACTION_NEXT_STATUSES: Record<ActionStatus, readonly ActionStatus[]> = {
  TODO: ['DONE', 'CANCELLED'],
  DONE: ['TODO'],
  CANCELLED: [],
}

/* -------------------------------------------------------------------------- */
/*  Durées — §21, §26                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Les durées proposées à la saisie.
 *
 * Une liste plutôt qu'un champ libre : personne ne convoque une réunion de
 * 37 minutes, et un menu se remplit plus vite qu'un champ. La base accepte
 * néanmoins toute valeur entre 5 minutes et 24 heures — la liste est une
 * commodité, pas une règle.
 */
export const DURATION_CHOICES: readonly number[] = [15, 30, 45, 60, 90, 120, 180, 240, 480]

/**
 * Le créneau proposé par défaut à la création : demain, à 9 h.
 *
 * Ouvrir sur un champ vide obligerait à saisir une date entière pour la
 * plupart des réunions, qui se fixent à quelques jours. Demain plutôt
 * qu'aujourd'hui : une réunion convoquée pour l'heure passée serait déjà
 * fausse à l'ouverture du formulaire.
 *
 * `today` est passé par l'appelant — il vient de `todayISO()`, donc des Comores
 * (DEC-025 §e) — pour que la fonction reste pure et testable.
 */
export function nextSlot(today: string, hour = 9): string {
  const [year, month, day] = today.split('-').map(Number)
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
  return `${tomorrow}T${String(hour).padStart(2, '0')}:00`
}

/**
 * Une réunion ou un rendez-vous est TERMINÉ lorsque sa fin est passée.
 *
 * La FIN, pas le début : une réunion qui commence dans dix minutes n'attend pas
 * son compte rendu. Rien n'est stocké — l'état « tenue » se déclare, il ne se
 * déduit pas (§23) ; ceci sert seulement à le RAPPELER sur la fiche.
 *
 * `now` est passé par l'appelant plutôt que lu ici : une fonction pure se teste,
 * et un composant ne doit appeler aucune fonction impure pendant son rendu.
 */
export function hasEnded(startsAt: string, durationMinutes: number, now: number): boolean {
  return new Date(startsAt).getTime() + durationMinutes * 60_000 < now
}

/** `90` → « 1 h 30 ». Jamais « 90 min » : personne ne lit une réunion ainsi. */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${String(rest).padStart(2, '0')}`
}

/* -------------------------------------------------------------------------- */
/*  Le calendrier — §19, §20                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Les trois couches du calendrier.
 *
 * §19 : « Les éléments doivent être filtrables selon leur type. » Chacune
 * dépend d'une capacité DIFFÉRENTE, et une couche fermée est nommée plutôt que
 * silencieuse — sans quoi une semaine vide se confondrait avec une semaine sans
 * droit de lecture (DEC-017).
 */
export const CALENDAR_KINDS = ['TASK', 'MEETING', 'APPOINTMENT'] as const

export type CalendarKind = (typeof CALENDAR_KINDS)[number]

export const CALENDAR_KIND_LABELS: Record<CalendarKind, string> = {
  TASK: 'Échéances de tâches',
  MEETING: 'Réunions',
  APPOINTMENT: 'Rendez-vous',
}

/** Le singulier, pour désigner un élément et non une couche. */
export const CALENDAR_KIND_SINGULAR: Record<CalendarKind, string> = {
  TASK: 'Échéance',
  MEETING: 'Réunion',
  APPOINTMENT: 'Rendez-vous',
}

export const CALENDAR_KIND_TONES: Record<CalendarKind, BadgeTone> = {
  TASK: 'neutral',
  MEETING: 'info',
  APPOINTMENT: 'warning',
}

export const CALENDAR_KIND_HREF: Record<CalendarKind, (id: string) => string> = {
  TASK: (id) => `/projets/taches/${id}`,
  MEETING: (id) => `/projets/reunions/${id}`,
  APPOINTMENT: (id) => `/projets/rendez-vous/${id}`,
}

/** Les quatre niveaux de visualisation du §20. */
export const CALENDAR_VIEWS = ['jour', 'semaine', 'mois', 'agenda'] as const

export type CalendarView = (typeof CALENDAR_VIEWS)[number]

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  jour: 'Jour',
  semaine: 'Semaine',
  mois: 'Mois',
  agenda: 'Agenda',
}

export function isCalendarView(value: string | undefined): value is CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView)
}

export function isCalendarKind(value: string | undefined): value is CalendarKind {
  return CALENDAR_KINDS.includes(value as CalendarKind)
}

export function isPlanningStatus(value: string | undefined): value is PlanningStatus {
  return PLANNING_STATUSES.includes(value as PlanningStatus)
}

export function isActionStatus(value: string | undefined): value is ActionStatus {
  return ACTION_STATUSES.includes(value as ActionStatus)
}

/* -------------------------------------------------------------------------- */
/*  Ce qu'une valeur absente ne doit jamais devenir                            */
/* -------------------------------------------------------------------------- */

/** Reconduits du LOT 12 : une absence de DROIT ne se dit pas par un tiret. */
export const UNREADABLE_PARTY = 'Tiers non lisible'
export const UNREADABLE_USER = 'Utilisateur non lisible'
export const UNREADABLE_PROJECT = 'Projet non lisible'
export const UNREADABLE_MEETING = 'Réunion non lisible'
export const UNREADABLE_DECISION = 'Décision non lisible'
export const UNREADABLE_TASK = 'Tâche non lisible'

/* -------------------------------------------------------------------------- */
/*  Découpage du calendrier — les jours d'une période                          */
/* -------------------------------------------------------------------------- */

/**
 * Les bornes d'une vue, à partir d'un jour d'ancrage.
 *
 * TOUT SE CALCULE SUR DES JOURS CIVILS, en `AAAA-MM-JJ`.
 *
 * `Date` n'intervient que pour l'arithmétique du calendrier, et toujours en
 * UTC : construire un `Date` local ferait basculer d'un jour selon le fuseau de
 * la machine. Le jour d'ancrage, lui, vient de `todayISO()` — donc des Comores
 * (DEC-025 §e).
 *
 * La semaine commence le LUNDI, comme partout en France et aux Comores.
 */
export function calendarRange(view: CalendarView, anchor: string): { from: string; to: string } {
  const [year, month, day] = anchor.split('-').map(Number)
  const base = Date.UTC(year, month - 1, day)

  const iso = (time: number) => new Date(time).toISOString().slice(0, 10)
  const DAY = 86_400_000

  if (view === 'jour') return { from: anchor, to: anchor }

  if (view === 'semaine' || view === 'agenda') {
    // `getUTCDay()` : 0 = dimanche. Ramené à un index lundi = 0.
    const offset = (new Date(base).getUTCDay() + 6) % 7
    const start = base - offset * DAY
    // L'agenda regarde plus loin : c'est une liste, pas une grille (§20).
    const span = view === 'semaine' ? 6 : 27
    return { from: iso(start), to: iso(start + span * DAY) }
  }

  // Mois : du 1er au dernier jour, et la grille complétera les semaines.
  const first = Date.UTC(year, month - 1, 1)
  const last = Date.UTC(year, month, 0)
  return { from: iso(first), to: iso(last) }
}

/**
 * Les jours affichés par une GRILLE mensuelle ou hebdomadaire.
 *
 * Une grille se lit par semaines entières : un mois qui commence un jeudi
 * montre donc les trois jours de juillet qui le précèdent, en retrait. Les
 * éléments qui y tombent sont réels — ce ne sont pas des cases décoratives.
 */
export function gridDays(from: string, to: string): string[] {
  const DAY = 86_400_000
  const parse = (value: string) => {
    const [y, m, d] = value.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }

  const start = parse(from)
  const end = parse(to)

  const leading = (new Date(start).getUTCDay() + 6) % 7
  const trailing = 6 - ((new Date(end).getUTCDay() + 6) % 7)

  const days: string[] = []
  for (let time = start - leading * DAY; time <= end + trailing * DAY; time += DAY) {
    days.push(new Date(time).toISOString().slice(0, 10))
  }
  return days
}

/** Décale un jour d'ancrage d'une vue entière — la navigation « précédent / suivant ». */
export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  const [year, month, day] = anchor.split('-').map(Number)
  const DAY = 86_400_000

  if (view === 'mois') {
    return new Date(Date.UTC(year, month - 1 + direction, 1)).toISOString().slice(0, 10)
  }

  const step = view === 'jour' ? 1 : view === 'semaine' ? 7 : 28
  return new Date(Date.UTC(year, month - 1, day) + direction * step * DAY)
    .toISOString()
    .slice(0, 10)
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/** Les en-têtes courts d'une grille : « lun · mar · … ». */
export const WEEKDAY_SHORT = WEEKDAYS.map((name) => name.slice(0, 3))

/** Le titre d'une vue : « septembre 2026 », « du 31/08 au 06/09 », « vendredi 4 ». */
export function calendarTitle(view: CalendarView, from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [, tm, td] = to.split('-').map(Number)

  if (view === 'mois') return `${MONTHS[fm - 1]} ${fy}`

  if (view === 'jour') {
    const weekday = WEEKDAYS[(new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay() + 6) % 7]
    return `${weekday} ${fd} ${MONTHS[fm - 1]} ${fy}`
  }

  return `du ${String(fd).padStart(2, '0')} ${MONTHS[fm - 1]} au ${String(td).padStart(2, '0')} ${MONTHS[tm - 1]} ${fy}`
}

/** Le jour d'une case de grille : « 4 » — le mois se lit dans le titre. */
export function dayNumber(day: string): number {
  return Number(day.slice(8, 10))
}

/** Le libellé long d'un jour d'agenda : « vendredi 4 septembre ». */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const weekday = WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]
  return `${weekday} ${d} ${MONTHS[m - 1]}`
}

/** Samedi ou dimanche : la grille les grise, sans jamais les masquer. */
export function isWeekend(day: string): boolean {
  const [y, m, d] = day.split('-').map(Number)
  const index = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  return index >= 5
}
