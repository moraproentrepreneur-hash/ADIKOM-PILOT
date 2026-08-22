-- =============================================================================
-- ADIKOM PILOT — 027 · Identité documentaire
-- Lot 1 de la phase « Documents et exports »
--
-- OBJET
--
-- Les documents générés par le SaaS doivent porter l'identité officielle
-- d'ADIKOM. Cette identité est CENTRALISÉE dans `company_settings` : aucun
-- modèle documentaire ne la recopie, et la corriger un jour se fera en un seul
-- endroit — depuis le module Paramètres, sans redéploiement.
--
-- DEUX CHANGEMENTS
--
-- 1. La vue `company_profile` — sous-ensemble non sensible lisible par tout
--    compte authentifié — n'exposait ni l'adresse ni le nom commercial complet.
--    L'en-tête d'un document ne pouvait donc pas être composé sans exiger la
--    permission de lecture des paramètres, bien trop large pour un simple
--    en-tête. Les deux lignes d'adresse sont ajoutées.
--
-- 2. L'identité officielle est renseignée. Elle était restée à sa valeur par
--    défaut depuis la migration 005.
--
-- CONVENTION DE NOM
--
-- La raison sociale retenue pour les documents est « ADIKOM TECHNOLOGIE &
-- TRAVEL », confirmée par ADIKOM le 22 août 2026. Elle diffère de la mention
-- « ADIKOM Technology & Travel » présente dans l'interface et la
-- documentation : cet écart est signalé et reste à arbitrer, il n'est pas
-- corrigé ici de façon unilatérale.
-- =============================================================================

-- --- 1. Adresse dans le profil public ----------------------------------------
-- Les colonnes existantes conservent leur nom, leur type et leur position :
-- les deux nouvelles sont ajoutées en fin de liste, ce qui autorise le
-- remplacement de la vue sans la supprimer — donc sans toucher aux droits.

create or replace view public.company_profile
with (security_invoker = false) as
  select
    legal_name,
    trade_name,
    acronym,
    tagline,
    city,
    country,
    phone,
    email,
    website,
    logo_path,
    color_primary,
    color_secondary,
    color_accent,
    currency_code,
    currency_label,
    locale,
    timezone,
    date_format,
    address_line1,
    address_line2
  from public.company_settings
  where id;

comment on view public.company_profile is
  'Sous-ensemble non sensible des paramètres entreprise, dont l''identité documentaire. Exclut les données administratives et bancaires.';


-- --- 2. Identité officielle ---------------------------------------------------
--
-- Les deux numéros de téléphone tiennent dans la colonne existante, séparés par
-- une barre verticale, exactement comme ils doivent apparaître sur un document.
-- Une seconde colonne aurait imposé une migration de schéma et une reprise du
-- module Paramètres pour un gain nul : ce qui est stocké est ce qui s'affiche.

update public.company_settings
   set legal_name    = 'ADIKOM TECHNOLOGIE & TRAVEL',
       address_line1 = 'Moroni Oasis, route les puffins',
       phone         = '+269 733 22 48 | +269 322 81 35',
       email         = 'mchangama@adikom2t.com',
       country       = coalesce(country, 'Comores')
 where id;
