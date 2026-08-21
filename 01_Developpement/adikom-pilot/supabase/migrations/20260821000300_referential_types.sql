-- =============================================================================
-- ADIKOM PILOT — 013 · Types du référentiel d'exploitation
-- Étape 2.2 (DEC-021) — Clients · Fournisseurs · Parc · Tarifs · Disponibilité
--
-- Les listes de valeurs reprennent celles des règles métier. Lorsqu'un document
-- laissait la liste « à confirmer lors de l'implémentation », la valeur retenue
-- est celle du document, sans ajout : DEC-021 §5.
-- =============================================================================

-- --- Tiers ------------------------------------------------------------------

-- Nature du client : le système gère aussi bien des particuliers que des
-- entreprises (03_Modules/04_Tiers.md §5.2).
do $$ begin
  create type public.client_type as enum ('INDIVIDUAL', 'COMPANY');
exception when duplicate_object then null; end $$;

-- Statut du client — 03_Modules/04_Tiers.md §5.4.
-- Pas de « Suspendu » ici : le document ne le prévoit que pour les fournisseurs.
do $$ begin
  create type public.client_status as enum ('ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED');
exception when duplicate_object then null; end $$;

-- Statut du fournisseur — 05_Regles_Metier/04_Fournisseurs.md §6.
-- Pas de « Prospect » ici : notion propre aux clients.
do $$ begin
  create type public.supplier_status as enum ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');
exception when duplicate_object then null; end $$;

-- Type de fournisseur — 05_Regles_Metier/04_Fournisseurs.md §5.
do $$ begin
  create type public.supplier_type as enum (
    'VEHICLE_SUPPLIER',      -- fournisseur de véhicules
    'MAINTENANCE_PROVIDER',  -- prestataire de maintenance
    'PARTS_SUPPLIER',        -- fournisseur de pièces
    'SERVICE_PROVIDER',      -- prestataire de services
    'OTHER'
  );
exception when duplicate_object then null; end $$;


-- --- Parc automobile --------------------------------------------------------

-- Statut opérationnel du véhicule — 05_Regles_Metier/02_Parc_Automobile.md §12.
-- Les sept statuts documentés, sans ajout (DEC-021 §5).
--
-- Le statut décrit une SITUATION. Il ne vaut jamais preuve de disponibilité :
-- celle-ci se calcule depuis le calendrier des occupations (§67 et §69).
do $$ begin
  create type public.vehicle_status as enum (
    'AVAILABLE',    -- Disponible
    'RESERVED',     -- Réservé
    'RENTED',       -- En location
    'MAINTENANCE',  -- En maintenance
    'IMMOBILIZED',  -- Immobilisé
    'UNAVAILABLE',  -- Indisponible
    'RETIRED'       -- Retiré du parc
  );
exception when duplicate_object then null; end $$;

-- Origine / mode de mise à disposition — 05_Regles_Metier/02_Parc_Automobile.md
-- §10 et §11. La distinction ADIKOM / fournisseur commande le traitement des
-- dépenses de maintenance et l'imputation (Étape 2.4).
do $$ begin
  create type public.vehicle_origin as enum (
    'OWNED',        -- propriété ADIKOM
    'SUPPLIED',     -- mis à disposition par un fournisseur
    'PARTNERSHIP',  -- partenariat — le module Partenariats relève d'une étape ultérieure
    'OTHER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fuel_type as enum ('PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC', 'OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.transmission_type as enum ('MANUAL', 'AUTOMATIC');
exception when duplicate_object then null; end $$;

-- Documents du véhicule — 03_Modules/05_Gestion_de_Location.md §15,
-- 05_Regles_Metier/02_Parc_Automobile.md §49.
do $$ begin
  create type public.vehicle_document_type as enum (
    'REGISTRATION',        -- carte grise
    'INSURANCE',           -- assurance
    'TECHNICAL_INSPECTION',-- visite technique
    'SUPPLIER_CONTRACT',   -- contrat fournisseur
    'MAINTENANCE_RECORD',  -- justificatif de maintenance
    'ADMINISTRATIVE',
    'OTHER'
  );
exception when duplicate_object then null; end $$;


-- --- Tarification -----------------------------------------------------------

-- Unité du tarif — DEC-001. Un montant sans unité n'existe pas :
--   DAY  → montant × durée facturable
--   FLAT → montant, la durée est sans effet
do $$ begin
  create type public.pricing_unit as enum ('DAY', 'FLAT');
exception when duplicate_object then null; end $$;


-- --- Disponibilité ----------------------------------------------------------

-- Origine d'une période d'indisponibilité — DEC-012.
-- Une seule table d'occupations porte l'ensemble des blocages, quelle que soit
-- leur origine : c'est ce qui rend la non-collision garantissable par la base.
-- RESERVATION, RENTAL et MAINTENANCE seront alimentés aux étapes 2.3 et 2.4 ;
-- l'Étape 2.2 n'écrit que des immobilisations.
do $$ begin
  create type public.occupation_source as enum (
    'RESERVATION',
    'RENTAL',
    'MAINTENANCE',
    'IMMOBILIZATION'
  );
exception when duplicate_object then null; end $$;
