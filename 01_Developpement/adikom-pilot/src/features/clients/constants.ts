import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Constantes partagées du module Clients.
 *
 * Séparées de `data.ts`, marqué `server-only` : les composants clients en ont
 * besoin, et les importer depuis la couche de données entraînerait le client
 * Supabase serveur dans le bundle navigateur.
 */

/** 03_Modules/04_Tiers.md §5.2 — particuliers comme entreprises. */
export type ClientType = 'INDIVIDUAL' | 'COMPANY'

export const TYPE_LABELS: Record<ClientType, string> = {
  INDIVIDUAL: 'Particulier',
  COMPANY: 'Entreprise',
}

/** 03_Modules/04_Tiers.md §5.4. */
export type ClientStatus = 'ACTIVE' | 'INACTIVE' | 'PROSPECT' | 'ARCHIVED'

export const STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  PROSPECT: 'Prospect',
  ARCHIVED: 'Archivé',
}

export const STATUS_TONES: Record<ClientStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  PROSPECT: 'info',
  ARCHIVED: 'neutral',
}

/**
 * Un client archivé ou inactif ne doit plus être proposé pour de nouvelles
 * opérations (§19). La règle est portée ici pour rester cohérente entre les
 * écrans qui proposent un client.
 */
export const SELECTABLE_STATUSES: ClientStatus[] = ['ACTIVE', 'PROSPECT']
