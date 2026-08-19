-- =============================================================================
-- ADIKOM PILOT — 005 · Paramètres entreprise & numérotation
--
-- Source : 03_Modules/09_Parametres.md
--   §31    — sections Identité · Coordonnées · Administratif · Commercial
--            · Facturation · Banque · Identité visuelle · Préférences
--   §15/16 — numérotation unique, générée côté serveur, sans collision
--   §46/47 — non-rétroactivité : les documents historiques conservent leur contexte
-- =============================================================================

-- --- Paramètres de l'entreprise (ligne unique) ------------------------------

create table public.company_settings (
  -- Contrainte de singleton : une seule configuration d'entreprise.
  id                    boolean primary key default true check (id),

  -- Section Identité (§32)
  legal_name            text not null default 'ADIKOM Technology & Travel',
  trade_name            text,
  acronym               text,
  description           text,
  activity              text,
  tagline               text,
  internal_code         text,

  -- Section Coordonnées (§33)
  address_line1         text,
  address_line2         text,
  city                  text,
  country               text default 'Comores',
  phone                 text,
  email                 text,
  website               text,

  -- Section Administratif (§34) — accès restreint par permission dédiée
  registration_number   text,
  tax_identifier        text,
  legal_form            text,
  administrative_notes  text,

  -- Section Commercial (§35)
  main_activity         text,
  secondary_activities  text,
  commercial_description text,

  -- Section Facturation (§36)
  invoice_display_name  text,
  invoice_address       text,
  invoice_footer_notes  text,
  invoice_legal_notes   text,

  -- Section Banque (§37) — information documentaire.
  -- Les comptes réellement mouvementés relèvent de Banques & Caisses.
  bank_name             text,
  bank_account_holder   text,
  bank_account_details  text,

  -- Section Identité visuelle (§38)
  -- Le logo officiel n'est jamais transformé (Design System §82).
  logo_path             text,
  logo_secondary_path   text,
  color_primary         text not null default '#1E5AA8',
  color_secondary       text not null default '#7FAEE3',
  color_accent          text not null default '#F2F6FB',

  -- Section Préférences (§18 à §23)
  currency_code         text not null default 'KMF',
  currency_label        text not null default 'Franc comorien',
  locale                text not null default 'fr-FR',
  timezone              text not null default 'Indian/Comoro',  -- DEC-014, à confirmer
  date_format           text not null default 'dd/MM/yyyy',

  -- Paramètres opérationnels sans valeur métier définie (DEC-008).
  -- Restent nuls tant qu'ADIKOM n'a pas tranché : aucune règle inventée.
  rental_duration_rounding text,          -- ex. 'STARTED_DAY' — non défini par défaut
  rental_buffer_minutes    int,           -- période de préparation entre deux locations
  imputation_approval_threshold bigint,   -- seuil de validation renforcée, en KMF

  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.app_users (id) on delete set null
);

comment on table public.company_settings is
  'Configuration générale d''ADIKOM. Ligne unique. Les modifications sont journalisées.';
comment on column public.company_settings.rental_duration_rounding is
  'Règle d''arrondi de la durée facturable. NULL tant qu''ADIKOM ne l''a pas définie (DEC-008).';
comment on column public.company_settings.imputation_approval_threshold is
  'Seuil de validation renforcée des imputations, en KMF. NULL = aucun seuil automatisé (DEC-008).';

create trigger company_settings_set_updated_at
  before update on public.company_settings
  for each row execute function public.fn_set_updated_at();

create trigger company_settings_audit
  after insert or update on public.company_settings
  for each row execute function public.fn_audit_row('settings');

-- La configuration ne se supprime pas.
create trigger company_settings_no_delete
  before delete on public.company_settings
  for each row execute function public.fn_forbid_mutation();

insert into public.company_settings (id) values (true) on conflict do nothing;


-- --- Règles de numérotation -------------------------------------------------
-- DEC-005 : aucun format codé en dur ; les formats divergeaient selon les
-- documents. Ils sont donc paramétrables depuis le module Paramètres.

create table public.numbering_rules (
  entity_key     text primary key,
  label          text not null,
  prefix         text not null,
  include_year   boolean not null default false,
  padding        int    not null default 6 check (padding between 1 and 12),
  separator      text   not null default '-',
  reset_yearly   boolean not null default false,
  current_year   int,
  current_value  bigint not null default 0 check (current_value >= 0),
  updated_at     timestamptz not null default now()
);

comment on table public.numbering_rules is
  'Formats de numérotation paramétrables (DEC-005). Génération atomique côté serveur.';

create trigger numbering_rules_audit
  after update on public.numbering_rules
  for each row execute function public.fn_audit_row('settings');


-- Génération atomique du numéro suivant.
-- §16 : « le système doit empêcher doublons, collisions, réutilisation
--         accidentelle et génération incohérente entre utilisateurs simultanés ».
-- Le FOR UPDATE sérialise les appels concurrents sur la ligne de la règle.
create or replace function public.next_number(p_entity_key text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r            public.numbering_rules%rowtype;
  v_year       int := extract(year from (now() at time zone 'UTC'))::int;
  v_next       bigint;
  v_result     text;
begin
  select * into r
  from public.numbering_rules
  where entity_key = p_entity_key
  for update;

  if not found then
    raise exception 'Aucune règle de numérotation définie pour « % ».', p_entity_key
      using errcode = 'raise_exception';
  end if;

  -- Remise à zéro au changement d'exercice lorsque la règle le prévoit.
  if r.reset_yearly and r.current_year is distinct from v_year then
    v_next := 1;
  else
    v_next := r.current_value + 1;
  end if;

  update public.numbering_rules
     set current_value = v_next,
         current_year  = v_year,
         updated_at    = now()
   where entity_key = p_entity_key;

  v_result := r.prefix;

  if r.include_year then
    v_result := v_result || r.separator || v_year::text;
  end if;

  v_result := v_result || r.separator || lpad(v_next::text, r.padding, '0');

  return v_result;
end;
$$;

comment on function public.next_number(text) is
  'Numéro suivant pour un type d''objet. Atomique : aucun doublon même en concurrence.';


-- Valeurs par défaut (DEC-005). Modifiables sans redéploiement.
insert into public.numbering_rules
  (entity_key, label, prefix, include_year, padding, reset_yearly)
values
  ('client',            'Client',               'CLI',   false, 6, false),
  ('supplier',          'Fournisseur',          'FOU',   false, 6, false),
  ('partner',           'Partenariat',          'PAR',   false, 6, false),
  ('vehicle',           'Véhicule',             'VEH',   false, 6, false),
  ('reservation',       'Réservation',          'RES',   true,  6, true),
  ('rental',            'Location',             'LOC',   true,  6, true),
  ('maintenance',       'Maintenance',          'MNT',   true,  6, true),
  ('imputation',        'Imputation',           'IMP',   true,  6, true),
  ('customer_invoice',  'Facture client',       'FAC-C', true,  6, true),
  ('supplier_invoice',  'Facture fournisseur',  'FAC-F', true,  6, true),
  ('payment',           'Règlement',            'REG',   true,  6, true),
  ('account',           'Compte financier',     'COMP',  false, 6, false),
  ('transfer',          'Virement interne',     'VIR',   true,  6, true)
on conflict (entity_key) do nothing;
