import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Le vocabulaire de Projets & Planification — Module 03.
 *
 * LA BASE PORTE LES ÉTATS, L'ÉCRAN PORTE LES MOTS.
 *
 * Les énumérations `project_status`, `project_task_status`, `project_priority`
 * et `project_member_role` vivent dans la migration 058. Les phrases françaises
 * vivent ici, où elles se corrigent sans migration — même partage que le Centre
 * de notifications (LOT 10).
 *
 * Aucun état n'est inventé : les six statuts de projet viennent du §7, les cinq
 * statuts de tâche du §12, les quatre priorités du §8.
 */

/* -------------------------------------------------------------------------- */
/*  Statuts de projet — §7                                                     */
/* -------------------------------------------------------------------------- */

export const PROJECT_STATUSES = [
  'DRAFT',
  'UPCOMING',
  'ACTIVE',
  'ON_HOLD',
  'DONE',
  'CANCELLED',
] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: 'Brouillon',
  UPCOMING: 'À venir',
  ACTIVE: 'En cours',
  ON_HOLD: 'En pause',
  DONE: 'Terminé',
  CANCELLED: 'Annulé',
}

export const PROJECT_STATUS_TONES: Record<ProjectStatus, BadgeTone> = {
  DRAFT: 'neutral',
  UPCOMING: 'info',
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  DONE: 'neutral',
  CANCELLED: 'danger',
}

/**
 * Miroir de `fn_project_status_transition` (migration 058).
 *
 * Il ne protège rien : la base refuse d'elle-même un enchaînement absurde. Il
 * évite seulement de PROPOSER un choix qui sera refusé — annulé est terminal,
 * terminé peut être repris.
 */
export const PROJECT_NEXT_STATUSES: Record<ProjectStatus, readonly ProjectStatus[]> = {
  DRAFT: ['UPCOMING', 'ACTIVE', 'CANCELLED'],
  UPCOMING: ['ACTIVE', 'ON_HOLD', 'CANCELLED'],
  ACTIVE: ['ON_HOLD', 'DONE', 'CANCELLED'],
  ON_HOLD: ['ACTIVE', 'DONE', 'CANCELLED'],
  DONE: ['ACTIVE'],
  CANCELLED: [],
}

/* -------------------------------------------------------------------------- */
/*  Statuts de tâche — §12                                                     */
/* -------------------------------------------------------------------------- */

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'À faire',
  IN_PROGRESS: 'En cours',
  WAITING: 'En attente',
  DONE: 'Terminée',
  CANCELLED: 'Annulée',
}

export const TASK_STATUS_TONES: Record<TaskStatus, BadgeTone> = {
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  WAITING: 'warning',
  DONE: 'success',
  CANCELLED: 'danger',
}

export const TASK_NEXT_STATUSES: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['TODO', 'WAITING', 'DONE', 'CANCELLED'],
  WAITING: ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'],
  DONE: ['TODO', 'IN_PROGRESS'],
  CANCELLED: [],
}

/**
 * Les colonnes de la vue Kanban — §34.
 *
 * « Annulée » n'y figure pas : le tableau montre le travail en cours, et une
 * colonne d'abandons ferait grossir l'écran de ce qui ne demande rien. Les
 * tâches annulées restent lisibles dans la vue liste, avec leur filtre.
 */
export const TASK_BOARD_COLUMNS: readonly TaskStatus[] = [
  'TODO',
  'IN_PROGRESS',
  'WAITING',
  'DONE',
]

/* -------------------------------------------------------------------------- */
/*  Priorités — §8                                                             */
/* -------------------------------------------------------------------------- */

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

export type Priority = (typeof PRIORITIES)[number]

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Faible',
  NORMAL: 'Normale',
  HIGH: 'Importante',
  URGENT: 'Urgente',
}

/**
 * §8 : « la priorité ne doit pas être utilisée pour transformer artificiellement
 * tous les projets en projets urgents ». Les deux premiers niveaux restent donc
 * neutres à l'écran : seul ce qui presse porte une couleur.
 */
export const PRIORITY_TONES: Record<Priority, BadgeTone> = {
  LOW: 'neutral',
  NORMAL: 'neutral',
  HIGH: 'warning',
  URGENT: 'danger',
}

/* -------------------------------------------------------------------------- */
/*  Rôles dans un projet — §9                                                  */
/* -------------------------------------------------------------------------- */

export const MEMBER_ROLES = ['PARTICIPANT', 'OBSERVER'] as const

export type MemberRole = (typeof MEMBER_ROLES)[number]

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  PARTICIPANT: 'Participant',
  OBSERVER: 'Observateur',
}

export const MEMBER_ROLE_HINTS: Record<MemberRole, string> = {
  PARTICIPANT: 'Prend part au travail du projet.',
  OBSERVER: 'Suit l’avancement sans y prendre part.',
}

/* -------------------------------------------------------------------------- */
/*  Ce qu'une valeur absente ne doit jamais devenir                            */
/* -------------------------------------------------------------------------- */

/**
 * Le tiers d'un projet, ou l'aveu qu'on ne peut pas le lire.
 *
 * Sans `parties.clients.view`, RLS masque la ligne du client : le projet reste
 * lisible, et l'écran DIT que le nom ne l'est pas. Afficher un tiret laisserait
 * croire qu'aucun tiers n'est rattaché (DEC-017, doctrine de DEC-034 §d).
 */
export const UNREADABLE_PARTY = 'Tiers non lisible'

/** Même raisonnement pour un responsable, que `users.users.view` commande. */
export const UNREADABLE_USER = 'Utilisateur non lisible'

/** Et pour un projet cité depuis une tâche, que `projects.view` commande. */
export const UNREADABLE_PROJECT = 'Projet non lisible'

export function isProjectStatus(value: string | undefined): value is ProjectStatus {
  return PROJECT_STATUSES.includes(value as ProjectStatus)
}

export function isTaskStatus(value: string | undefined): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus)
}

export function isPriority(value: string | undefined): value is Priority {
  return PRIORITIES.includes(value as Priority)
}

/* -------------------------------------------------------------------------- */
/*  Retard — §16                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Une tâche est en retard lorsque son échéance est PASSÉE et qu'elle n'est ni
 * terminée ni annulée.
 *
 * Le retard n'est jamais un statut stocké : il serait faux le lendemain de la
 * clôture. Il se dérive du jour civil des Comores, comme tous les retards du
 * système (DEC-025 §a et §e) — et la même règle vaut en base, dans
 * `projects_task_counts` et dans la veille.
 *
 * `today` est passé par l'appelant plutôt que lu ici : une fonction pure se
 * teste, et deux lignes d'une même liste ne doivent pas changer de jour entre
 * elles.
 */
export function isLate(
  dueOn: string | null,
  status: TaskStatus,
  today: string
): boolean {
  if (!dueOn) return false
  if (status === 'DONE' || status === 'CANCELLED') return false
  return dueOn < today
}
