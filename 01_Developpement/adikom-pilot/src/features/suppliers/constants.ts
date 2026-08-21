import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Constantes partagées du module Fournisseurs.
 * Listes de valeurs issues de 05_Regles_Metier/04_Fournisseurs.md §5 et §6.
 */

export type SupplierStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED'

export const STATUS_LABELS: Record<SupplierStatus, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archivé',
}

export const STATUS_TONES: Record<SupplierStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'warning',
  ARCHIVED: 'neutral',
}

/**
 * Conséquence de chaque statut. §7 : seul un fournisseur actif peut porter une
 * nouvelle opération — un véhicule, une facture, une maintenance.
 */
export const STATUS_HINTS: Partial<Record<SupplierStatus, string>> = {
  ACTIVE: 'Le fournisseur pourra de nouveau recevoir des véhicules et des opérations.',
  INACTIVE:
    'Aucune nouvelle opération ne pourra lui être rattachée. Son historique reste intact.',
  SUSPENDED:
    'Décision interne : plus aucune nouvelle opération. Le motif est conservé dans le journal.',
  ARCHIVED: 'Le fournisseur sort des listes de sélection. Tout son historique est conservé.',
}

export type SupplierType =
  | 'VEHICLE_SUPPLIER'
  | 'MAINTENANCE_PROVIDER'
  | 'PARTS_SUPPLIER'
  | 'SERVICE_PROVIDER'
  | 'OTHER'

export const TYPE_LABELS: Record<SupplierType, string> = {
  VEHICLE_SUPPLIER: 'Fournisseur de véhicules',
  MAINTENANCE_PROVIDER: 'Prestataire de maintenance',
  PARTS_SUPPLIER: 'Fournisseur de pièces',
  SERVICE_PROVIDER: 'Prestataire de services',
  OTHER: 'Autre',
}
