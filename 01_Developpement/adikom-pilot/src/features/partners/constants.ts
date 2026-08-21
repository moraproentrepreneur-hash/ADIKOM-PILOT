import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Constantes des partenaires.
 *
 * Structure minimale (migration 024) : elle permet de rattacher un véhicule à
 * un partenaire, pas de gérer un partenariat. Le module complet — création,
 * fiche, conditions, documents — relève d'une étape dédiée.
 */

export type PartnerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED'

export const STATUS_LABELS: Record<PartnerStatus, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archivé',
}

export const STATUS_TONES: Record<PartnerStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'warning',
  ARCHIVED: 'neutral',
}
