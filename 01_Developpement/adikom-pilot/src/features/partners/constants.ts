import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Constantes des partenaires.
 *
 * Structure minimale (migration 024) : elle porte l'identité d'un partenaire et
 * permet de lui rattacher un véhicule, pas de gérer un partenariat. Les
 * conditions, contrats et projets communs relèvent d'une étape dédiée.
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

/**
 * Conséquence de chaque statut, annoncée AVANT validation.
 *
 * C'est la confirmation retenue par le projet pour les changements d'état :
 * l'utilisateur choisit la cible, lit ce qu'elle entraîne, saisit un motif,
 * puis valide explicitement. Même formulation que les fournisseurs, dont les
 * statuts sont les mêmes (05_Regles_Metier/04_Fournisseurs.md §6).
 */
export const STATUS_HINTS: Partial<Record<PartnerStatus, string>> = {
  ACTIVE: 'Le partenaire pourra de nouveau recevoir des véhicules et des opérations.',
  INACTIVE:
    'Aucune nouvelle opération ne pourra lui être rattachée. Son historique reste intact.',
  SUSPENDED:
    'Décision interne : plus aucune nouvelle opération. Le motif est conservé dans le journal.',
  ARCHIVED:
    'Le partenaire sort des listes de sélection : aucun véhicule ne pourra plus lui être rattaché. Sa fiche et tout son historique sont conservés.',
}
