import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Constantes partagées du module Parc automobile.
 *
 * Les listes de valeurs sont celles des règles métier, sans ajout : les sept
 * statuts de 05_Regles_Metier/02_Parc_Automobile.md §12, confirmés par DEC-021.
 */

export type VehicleStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'RENTED'
  | 'MAINTENANCE'
  | 'IMMOBILIZED'
  | 'UNAVAILABLE'
  | 'RETIRED'

export const STATUS_LABELS: Record<VehicleStatus, string> = {
  AVAILABLE: 'Disponible',
  RESERVED: 'Réservé',
  RENTED: 'En location',
  MAINTENANCE: 'En maintenance',
  IMMOBILIZED: 'Immobilisé',
  UNAVAILABLE: 'Indisponible',
  RETIRED: 'Retiré',
}

export const STATUS_TONES: Record<VehicleStatus, BadgeTone> = {
  AVAILABLE: 'success',
  RESERVED: 'info',
  RENTED: 'info',
  MAINTENANCE: 'warning',
  IMMOBILIZED: 'danger',
  UNAVAILABLE: 'neutral',
  RETIRED: 'neutral',
}

/**
 * Conséquence de chaque statut, affichée avant de l'appliquer.
 *
 * Le statut décrit une situation ; il ne remplace pas le calendrier : un
 * véhicule « Disponible » aujourd'hui peut être réservé demain (§69).
 */
export const STATUS_HINTS: Partial<Record<VehicleStatus, string>> = {
  AVAILABLE: 'Le véhicule pourra être proposé, sous réserve de son calendrier.',
  MAINTENANCE: 'Le véhicule ne sera plus proposé. La maintenance elle-même relève d’une étape ultérieure.',
  IMMOBILIZED: 'Le véhicule ne peut plus être loué. Pensez à enregistrer la période d’immobilisation.',
  UNAVAILABLE: 'Le véhicule ne sera plus proposé, sans motif technique particulier.',
  RETIRED: 'Le véhicule sort définitivement du parc. Son historique est conservé et reste consultable.',
}

/** Statuts proposés depuis la fiche : le retrait du parc a son propre geste. */
export const OPERATIONAL_STATUSES: VehicleStatus[] = [
  'AVAILABLE',
  'MAINTENANCE',
  'IMMOBILIZED',
  'UNAVAILABLE',
]

/** 05_Regles_Metier/02_Parc_Automobile.md §10 et §11. */
export type VehicleOrigin = 'OWNED' | 'SUPPLIED' | 'PARTNERSHIP' | 'OTHER'

export const ORIGIN_LABELS: Record<VehicleOrigin, string> = {
  OWNED: 'Propriété ADIKOM',
  SUPPLIED: 'Fourni par un fournisseur',
  PARTNERSHIP: 'Partenariat',
  OTHER: 'Autre',
}

export type FuelType = 'PETROL' | 'DIESEL' | 'HYBRID' | 'ELECTRIC' | 'OTHER'

export const FUEL_LABELS: Record<FuelType, string> = {
  PETROL: 'Essence',
  DIESEL: 'Diesel',
  HYBRID: 'Hybride',
  ELECTRIC: 'Électrique',
  OTHER: 'Autre',
}

export type TransmissionType = 'MANUAL' | 'AUTOMATIC'

export const TRANSMISSION_LABELS: Record<TransmissionType, string> = {
  MANUAL: 'Manuelle',
  AUTOMATIC: 'Automatique',
}

export type VehicleDocumentType =
  | 'REGISTRATION'
  | 'INSURANCE'
  | 'TECHNICAL_INSPECTION'
  | 'SUPPLIER_CONTRACT'
  | 'MAINTENANCE_RECORD'
  | 'ADMINISTRATIVE'
  | 'OTHER'

export const DOCUMENT_LABELS: Record<VehicleDocumentType, string> = {
  REGISTRATION: 'Carte grise',
  INSURANCE: 'Assurance',
  TECHNICAL_INSPECTION: 'Visite technique',
  SUPPLIER_CONTRACT: 'Contrat fournisseur',
  MAINTENANCE_RECORD: 'Justificatif de maintenance',
  ADMINISTRATIVE: 'Document administratif',
  OTHER: 'Autre document',
}

/** Origine d'une période d'indisponibilité (DEC-012). */
export type OccupationSource = 'RESERVATION' | 'RENTAL' | 'MAINTENANCE' | 'IMMOBILIZATION'

export const OCCUPATION_LABELS: Record<OccupationSource, string> = {
  RESERVATION: 'Réservation',
  RENTAL: 'Location',
  MAINTENANCE: 'Maintenance',
  IMMOBILIZATION: 'Immobilisation',
}

export const OCCUPATION_TONES: Record<OccupationSource, BadgeTone> = {
  RESERVATION: 'info',
  RENTAL: 'info',
  MAINTENANCE: 'warning',
  IMMOBILIZATION: 'danger',
}

/** Taille maximale d'un document joint, alignée sur le bucket (migration 019). */
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024

export const ACCEPTED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
