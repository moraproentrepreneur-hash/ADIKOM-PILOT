import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Constantes des maintenances — Étape 2.4, LOT 2.
 *
 * CE MODULE DÉCRIT UNE INTERVENTION, PAS SON COÛT.
 *
 * Aucun montant, aucun devis, aucune pièce, aucune main-d'œuvre :
 * `rental.maintenance.cost.update` existe au catalogue et porte exactement
 * cela — elle appartient au LOT 3 et n'est employée nulle part ici.
 */

/* -------------------------------------------------------------------------- */
/*  Origine                                                                    */
/* -------------------------------------------------------------------------- */

export type MaintenanceOrigin =
  | 'RENTAL_RETURN'
  | 'BREAKDOWN'
  | 'INCIDENT'
  | 'INSPECTION'
  | 'PREVENTIVE'
  | 'OTHER'

/** Workflow 05 §11 — les origines documentées, sans ajout. */
export const ORIGIN_LABELS: Record<MaintenanceOrigin, string> = {
  RENTAL_RETURN: 'Retour de location',
  BREAKDOWN: 'Panne',
  INCIDENT: 'Incident',
  INSPECTION: 'Contrôle',
  PREVENTIVE: 'Maintenance préventive',
  OTHER: 'Autre',
}

export const ORIGIN_ORDER: MaintenanceOrigin[] = [
  'BREAKDOWN',
  'INCIDENT',
  'RENTAL_RETURN',
  'INSPECTION',
  'PREVENTIVE',
  'OTHER',
]

/* -------------------------------------------------------------------------- */
/*  Priorité                                                                   */
/* -------------------------------------------------------------------------- */

export type MaintenancePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

/**
 * Workflow 05 §14.
 *
 * La priorité ORIENTE, elle ne commande rien : elle ne déclenche aucune
 * immobilisation ni aucune notification. Seule une période d'immobilisation
 * bloque un calendrier.
 */
export const PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  LOW: 'Faible',
  NORMAL: 'Normale',
  HIGH: 'Haute',
  URGENT: 'Urgente',
}

export const PRIORITY_TONES: Record<MaintenancePriority, BadgeTone> = {
  LOW: 'neutral',
  NORMAL: 'neutral',
  HIGH: 'warning',
  URGENT: 'danger',
}

export const PRIORITY_ORDER: MaintenancePriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

/* -------------------------------------------------------------------------- */
/*  Statuts                                                                    */
/* -------------------------------------------------------------------------- */

export type MaintenanceStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'TO_DIAGNOSE'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED'

/** Workflow 05 §17 — les sept statuts documentés, et rien de plus. */
export const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  DRAFT: 'Brouillon',
  PLANNED: 'Planifiée',
  TO_DIAGNOSE: 'À diagnostiquer',
  IN_PROGRESS: 'En cours',
  ON_HOLD: 'En attente',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
}

export const STATUS_TONES: Record<MaintenanceStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PLANNED: 'info',
  TO_DIAGNOSE: 'warning',
  IN_PROGRESS: 'info',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
}

export const FILTERABLE_STATUSES: MaintenanceStatus[] = [
  'DRAFT',
  'PLANNED',
  'TO_DIAGNOSE',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
]

/**
 * Changements d'état proposés depuis l'état courant.
 *
 * Copie exacte de la table du déclencheur `fn_maintenance_status_transition`,
 * MOINS deux actes qui ont leur propre écran parce qu'ils portent davantage
 * qu'un statut : terminer (contrôle et libération du véhicule) et annuler.
 *
 * « Terminée » n'est atteignable que depuis « En cours » : §49 interdit de
 * conclure tant que le problème persiste, et une maintenance en attente n'a pas
 * pu faire l'objet du contrôle qu'atteste cet état (§47).
 */
export const NEXT_STATUSES: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  DRAFT: ['PLANNED', 'TO_DIAGNOSE'],
  PLANNED: ['TO_DIAGNOSE', 'IN_PROGRESS', 'ON_HOLD'],
  TO_DIAGNOSE: ['IN_PROGRESS', 'ON_HOLD'],
  IN_PROGRESS: ['ON_HOLD'],
  ON_HOLD: ['IN_PROGRESS', 'TO_DIAGNOSE'],
  COMPLETED: [],
  CANCELLED: [],
}

/** États depuis lesquels la maintenance peut encore être abandonnée (§64). */
export function isCancellable(status: MaintenanceStatus): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED'
}

/** Seule une intervention en cours se termine — après contrôle satisfaisant. */
export function isCompletable(status: MaintenanceStatus): boolean {
  return status === 'IN_PROGRESS'
}

/**
 * Le passage `Brouillon → Planifiée` relève de `rental.maintenance.validate`.
 *
 * C'est l'acte qui ENGAGE l'intervention : la fiche cesse d'être une intention
 * et devient une opération prévue. Les autres changements d'état relèvent de
 * `rental.maintenance.update` (arbitrage ADIKOM du 27/08/2026).
 */
export function requiresValidate(
  from: MaintenanceStatus,
  to: MaintenanceStatus
): boolean {
  return from === 'DRAFT' && to === 'PLANNED'
}
