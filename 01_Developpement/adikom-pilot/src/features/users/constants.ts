import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Constantes partagées du module Utilisateurs.
 *
 * Volontairement séparées de `data.ts`, qui est marqué `server-only` : les
 * composants clients ont besoin de ces libellés, et les importer depuis la
 * couche de données entraînerait le client Supabase serveur dans le bundle
 * navigateur.
 */

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED'

/** Libellés et tons des statuts (Design System §42, §64 — cohérence des états). */
export const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archivé',
}

export const STATUS_TONES: Record<UserStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'warning',
  ARCHIVED: 'neutral',
}

/** Origine d'un droit (Module 08 §48 : accordé · refusé · hérité · non défini). */
export type PermissionSource =
  | 'SUPER_ADMIN'
  | 'USER_ALLOW'
  | 'GROUP_ALLOW'
  | 'USER_DENY'
  | 'GROUP_DENY'
  | 'NONE'

export const SOURCE_LABELS: Record<PermissionSource, string> = {
  SUPER_ADMIN: 'Rôle Super Admin',
  USER_ALLOW: 'Accordé individuellement',
  GROUP_ALLOW: 'Hérité d’un groupe',
  USER_DENY: 'Refusé individuellement',
  GROUP_DENY: 'Refusé par un groupe',
  NONE: 'Non défini',
}

/**
 * Effet d'une règle individuelle, tel qu'enregistré dans `user_permissions`
 * (type `permission_effect` en base). L'absence de règle n'est pas un effet :
 * elle se représente par `null` et laisse l'héritage s'appliquer.
 */
export type PermissionEffect = 'ALLOW' | 'DENY'

/** Valeur transmise par le formulaire pour chaque permission. */
export type PermissionChoice = 'INHERIT' | PermissionEffect

export const CHOICE_LABELS: Record<PermissionChoice, string> = {
  INHERIT: 'Non défini',
  ALLOW: 'Accorder',
  DENY: 'Refuser',
}

/** Préfixe des champs du formulaire de permissions : `perm:<code>`. */
export const PERMISSION_FIELD_PREFIX = 'perm:'
