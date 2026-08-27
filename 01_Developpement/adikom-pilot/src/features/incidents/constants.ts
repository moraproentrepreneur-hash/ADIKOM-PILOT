import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Constantes des incidents et des dommages — Étape 2.4, LOT 1.
 *
 * CE MODULE CONSTATE, IL NE CHIFFRE PAS.
 *
 * Aucun montant, aucun barème, aucune franchise : ces règles n'existent pas
 * (DEC-008, toujours ouverte). La gravité d'un dommage et la responsabilité
 * constatée ne commandent RIEN — ni coût, ni imputation, ni facturation. Elles
 * décrivent, et c'est tout ce qu'on leur demande à ce stade.
 */

/* -------------------------------------------------------------------------- */
/*  Incidents                                                                  */
/* -------------------------------------------------------------------------- */

export type IncidentKind =
  | 'BREAKDOWN'
  | 'ACCIDENT'
  | 'FLAT_TYRE'
  | 'MECHANICAL'
  | 'ELECTRICAL'
  | 'DOCUMENT_LOSS'
  | 'OTHER'

/** Module 05 §39 — les cas rencontrés par ADIKOM, dans son vocabulaire. */
export const KIND_LABELS: Record<IncidentKind, string> = {
  BREAKDOWN: 'Panne',
  ACCIDENT: 'Accident',
  FLAT_TYRE: 'Crevaison',
  MECHANICAL: 'Problème mécanique',
  ELECTRICAL: 'Problème électrique',
  DOCUMENT_LOSS: 'Perte d’un document',
  OTHER: 'Autre incident',
}

export const KIND_ORDER: IncidentKind[] = [
  'BREAKDOWN',
  'ACCIDENT',
  'FLAT_TYRE',
  'MECHANICAL',
  'ELECTRICAL',
  'DOCUMENT_LOSS',
  'OTHER',
]

export type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED'

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En traitement',
  CLOSED: 'Clos',
  CANCELLED: 'Annulé',
}

export const STATUS_TONES: Record<IncidentStatus, BadgeTone> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  CLOSED: 'success',
  CANCELLED: 'neutral',
}

export const FILTERABLE_STATUSES: IncidentStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'CLOSED',
  'CANCELLED',
]

/**
 * États atteignables depuis l'état courant.
 *
 * Strictement la table du déclencheur `fn_incident_status_transition`. La
 * dupliquer ici ne relâche rien : la base refuse de toute façon un
 * enchaînement incohérent. Elle sert à ne PROPOSER que ce qui aboutira, plutôt
 * qu'à laisser l'utilisateur découvrir un refus après coup.
 */
export const NEXT_STATUSES: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: ['IN_PROGRESS', 'CLOSED', 'CANCELLED'],
  IN_PROGRESS: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
}

/* -------------------------------------------------------------------------- */
/*  Dommages                                                                   */
/* -------------------------------------------------------------------------- */

export type DamageSeverity = 'MINOR' | 'MODERATE' | 'MAJOR'

export const SEVERITY_LABELS: Record<DamageSeverity, string> = {
  MINOR: 'Léger',
  MODERATE: 'Moyen',
  MAJOR: 'Important',
}

export const SEVERITY_TONES: Record<DamageSeverity, BadgeTone> = {
  MINOR: 'neutral',
  MODERATE: 'warning',
  MAJOR: 'danger',
}

export const SEVERITY_ORDER: DamageSeverity[] = ['MINOR', 'MODERATE', 'MAJOR']

export type DamageResponsibility = 'CLIENT' | 'ADIKOM' | 'SUPPLIER' | 'UNDETERMINED'

export const RESPONSIBILITY_LABELS: Record<DamageResponsibility, string> = {
  CLIENT: 'Client',
  ADIKOM: 'ADIKOM',
  SUPPLIER: 'Fournisseur',
  UNDETERMINED: 'Indéterminée',
}

export const RESPONSIBILITY_ORDER: DamageResponsibility[] = [
  'UNDETERMINED',
  'CLIENT',
  'ADIKOM',
  'SUPPLIER',
]

/* -------------------------------------------------------------------------- */
/*  Photos                                                                     */
/* -------------------------------------------------------------------------- */

/** Mêmes limites que les photos d'état des lieux : un dépôt, un seul usage. */
export const MAX_PHOTO_SIZE = 10 * 1024 * 1024
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
