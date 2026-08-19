-- =============================================================================
-- ADIKOM PILOT — 001 · Fondations
-- Extensions, types partagés, helpers et conventions communes.
--
-- Conventions du projet :
--   · Identifiants techniques en anglais, interface en français (DEC-011 / G11).
--   · Montants en BIGINT exprimés en KMF, jamais en flottant (DEC-010).
--   · Aucune suppression physique des données métier : statut / archivage.
-- =============================================================================

-- --- Extensions -------------------------------------------------------------

-- btree_gist : indispensable pour les contraintes EXCLUDE combinant une égalité
-- (vehicle_id) et un chevauchement de période (DEC-012 — non-collision véhicule).
create extension if not exists btree_gist;

-- citext : comparaison d'emails insensible à la casse.
create extension if not exists citext;


-- --- Types partagés ---------------------------------------------------------

-- Statut d'un compte utilisateur interne.
-- Source : 03_Modules/08_Utilisateurs_et_Groupes.md §11
--          05_Regles_Metier/05_Permissions.md §6
do $$ begin
  create type public.user_status as enum ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');
exception when duplicate_object then null; end $$;

-- Actions contrôlables par permission.
-- Source : 05_Regles_Metier/05_Permissions.md §18
--          « Voir · Créer · Modifier · Supprimer/Archiver · Valider · Annuler
--            · Exporter · Imprimer · Administrer »
do $$ begin
  create type public.permission_action as enum (
    'VIEW',      -- Voir / consulter
    'CREATE',    -- Créer
    'UPDATE',    -- Modifier
    'ARCHIVE',   -- Archiver / désactiver / supprimer logiquement
    'VALIDATE',  -- Valider
    'CANCEL',    -- Annuler
    'EXPORT',    -- Exporter
    'PRINT',     -- Imprimer
    'ADMIN'      -- Administrer
  );
exception when duplicate_object then null; end $$;

-- Sens d'une attribution de permission.
-- DEC-009 : un refus explicite est prioritaire sur toute autorisation.
do $$ begin
  create type public.permission_effect as enum ('ALLOW', 'DENY');
exception when duplicate_object then null; end $$;

-- Types d'événements du journal d'audit.
-- Source : 05_Regles_Metier/06_Audit.md §8
do $$ begin
  create type public.audit_action as enum (
    'CREATE',
    'UPDATE',
    'DELETE',
    'ARCHIVE',
    'RESTORE',
    'VALIDATE',
    'CANCEL',
    'LOGIN',
    'LOGIN_FAILED',
    'LOGOUT',
    'PAYMENT',
    'TRANSFER',
    'IMPUTATION',
    'PERMISSION_CHANGE',
    'STATUS_CHANGE',
    'PRICE_CHANGE',
    'SUPPLIER_CHANGE',
    'EXPORT',
    'ACCESS_DENIED'
  );
exception when duplicate_object then null; end $$;

-- Résultat d'une action auditée.
-- Source : 05_Regles_Metier/06_Audit.md §60 — « réussite · échec · refus ».
-- Règle §81.17 : une action refusée n'est jamais enregistrée comme réussie.
do $$ begin
  create type public.audit_result as enum ('SUCCESS', 'FAILURE', 'DENIED');
exception when duplicate_object then null; end $$;


-- --- Helpers ----------------------------------------------------------------

-- Utilisateur à l'origine de la requête courante.
-- Renvoie NULL pour les opérations système (migrations, seed, tâches planifiées).
create or replace function public.current_actor()
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select auth.uid();
$$;

comment on function public.current_actor() is
  'Identifiant de l''utilisateur authentifié à l''origine de l''opération courante.';


-- Trigger générique : met à jour updated_at / updated_by à chaque modification.
create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();

  -- updated_by n'est renseigné que si la colonne existe sur la table.
  if to_jsonb(new) ? 'updated_by' then
    new.updated_by := coalesce(public.current_actor(), new.updated_by);
  end if;

  return new;
end;
$$;

comment on function public.fn_set_updated_at() is
  'Trigger générique d''horodatage des modifications (updated_at / updated_by).';


-- Empêche toute modification d'une ligne : utilisé pour les tables append-only
-- (journal d'audit). Source : 05_Regles_Metier/06_Audit.md §40 et §77 —
-- le journal doit être protégé contre modification, suppression et falsification.
create or replace function public.fn_forbid_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception
    'Cette table est en écriture seule : % interdit sur %.',
    tg_op, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function public.fn_forbid_mutation() is
  'Bloque UPDATE/DELETE sur les tables append-only (journal d''audit).';
