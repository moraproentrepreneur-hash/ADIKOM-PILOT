-- =============================================================================
-- ADIKOM PILOT — 081 · Catalogue de services et historisation des prix
-- LOT 20 — DEC-043 (doctrine D16) · Module 10 « Produits & Services »
--
-- CE QUE CETTE MIGRATION LIVRE
--
--   · les CATÉGORIES de services ;
--   · les SERVICES, et leur destination — achat, vente, ou les deux ;
--   · les VARIANTES, seules porteuses d'un prix ;
--   · les VERSIONS DATÉES du prix de vente ;
--   · les VERSIONS DATÉES du prix d'achat, dans une table SÉPARÉE ;
--   · deux RÉSOLVEURS, qui répondent « quel prix s'applique à cette date ? » ;
--   · douze capacités, et pas une de plus.
--
-- CE QU'ELLE NE LIVRE PAS
--
--   · AUCUNE table de produit, AUCUNE capacité `catalog.products.*`, aucun
--     stock, aucun entrepôt, aucun mouvement (Plan 02 §4.4) ;
--   · AUCUNE ligne de devis, de commande, de facture ou de vente : elles
--     appartiennent aux LOT 25 à 28 ;
--   · AUCUNE marge stockée. Une différence se recalcule (doctrine D1).
--
-- LA DOCTRINE — D16, DEC-043
--
--   « Un prix est une ligne datée ; une opération en garde la copie. »
--
-- Changer un prix, c'est CLORE la version courante et en OUVRIR une nouvelle,
-- jamais réécrire une colonne. Un prix se lit TOUJOURS par un résolveur prenant
-- une DATE D'EFFET. Aucune version applicable ⇒ AUCUNE ligne renvoyée : un prix
-- absent n'est jamais un prix nul (DEC-008, DEC-017).
--
-- Ce n'est pas un mécanisme nouveau : `pricing_rules` porte `valid_from` /
-- `valid_to` et `resolve_pricing_rule(client, véhicule, DATE)` les applique
-- depuis la migration 017. Cette migration GÉNÉRALISE ce qui est éprouvé.
--
-- POURQUOI LE COÛT VIT DANS SA PROPRE TABLE
--
-- RLS filtre des LIGNES, pas des COLONNES. Un prix d'achat rangé à côté du
-- libellé serait rendu par un `select *` à quiconque détient la simple lecture
-- du service — et `catalog.services.cost.view` ne servirait qu'à masquer un
-- écran. Le précédent est `maintenance_costs` (migration 044, DEC-024).
--
-- Catalogue : 179 → 191.
-- =============================================================================


-- =============================================================================
-- 1. LES TYPES
--
-- Deux énumérations NOUVELLES : aucun `alter type … add value`, donc aucune
-- contrainte de transaction à respecter.
-- =============================================================================

-- Plan 02 §9.5. La destination est une DONNÉE, jamais une déduction : un
-- service n'est pas « vendable parce qu'il porte un prix ».
do $$ begin
  create type public.service_purpose as enum (
    'PURCHASE',  -- Achat seulement
    'SALE',      -- Vente seulement
    'BOTH'       -- Achat et vente
  );
exception when duplicate_object then null; end $$;

-- Trois états, et trois seulement (CLAUDE.md §59 : ne pas multiplier les
-- statuts qui disent la même chose).
do $$ begin
  create type public.service_status as enum (
    'ACTIVE',    -- proposable
    'INACTIVE',  -- suspendu, sans être retiré du catalogue
    'ARCHIVED'   -- retiré du catalogue ; l'historique demeure
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 2. NUMÉROTATION — DEC-005
--
-- `SRV-000001`. Le format est paramétrable depuis le module Paramètres, comme
-- tous les autres : aucun format n'est codé en dur.
-- =============================================================================

insert into public.numbering_rules
  (entity_key, label, prefix, include_year, padding, reset_yearly)
values
  ('service', 'Service', 'SRV', false, 6, false)
on conflict (entity_key) do nothing;


-- =============================================================================
-- 3. LES CATÉGORIES
--
-- Même forme que `vehicle_categories` (migration 015) : un code stable, un
-- libellé unique, un indicateur d'activité. Rien ne se supprime.
-- =============================================================================

create table public.service_categories (
  id            uuid primary key default gen_random_uuid(),
  code          text        not null unique check (length(btrim(code)) > 0),
  label         text        not null check (length(btrim(label)) > 0),
  description   text,
  is_active     boolean     not null default true,
  display_order int         not null default 0,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null
);

comment on table public.service_categories is
  'Catégories du catalogue de services (transport, excursion, assistance…). Une catégorie archivée n''est plus proposée à la création d''un service.';

create unique index service_categories_label_unique_idx
  on public.service_categories (lower(label));

create trigger service_categories_set_updated_at
  before update on public.service_categories
  for each row execute function public.fn_set_updated_at();

create trigger service_categories_audit
  after insert or update on public.service_categories
  for each row execute function public.fn_audit_row('catalog');

create trigger service_categories_no_delete
  before delete on public.service_categories
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 4. LES SERVICES
-- =============================================================================

create table public.services (
  id            uuid primary key default gen_random_uuid(),

  -- Identifiant interne SRV-000001, produit par `next_number` (DEC-005).
  service_no    text        not null unique,

  label         text        not null check (length(btrim(label)) > 0),
  category_id   uuid        not null references public.service_categories (id) on delete restrict,

  -- LA DESTINATION EST ENREGISTRÉE, JAMAIS DÉDUITE (Plan 02 §7.4).
  purpose       public.service_purpose not null,

  status        public.service_status  not null default 'ACTIVE',

  -- Unité d'exploitation : « trajet », « journée », « personne ». Information
  -- de lecture, SANS effet sur aucun calcul — le prix est celui de la variante.
  unit_label    text,

  description   text,
  notes         text,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null
);

comment on table public.services is
  'Identité d''un service. AUCUN PRIX ICI : les prix sont des lignes datées, portées par les variantes (D16, DEC-043).';
comment on column public.services.purpose is
  'ACHAT · VENTE · LES DEUX. Enregistrée explicitement : un prix ne fait pas une destination (Plan 02 §7.4).';
comment on column public.services.unit_label is
  'Unité d''exploitation, à titre indicatif. N''intervient dans aucun calcul : le montant d''une variante est un montant, pas un taux.';

/*
 * Unicité du libellé DANS SA CATÉGORIE, et hors services archivés.
 *
 * Globale, elle interdirait deux prestations homonymes dans deux catégories
 * distinctes — légitime. Sans exclusion des archivés, elle interdirait de
 * recréer un service dont l'ancien a été retiré du catalogue.
 */
create unique index services_label_unique_idx
  on public.services (category_id, lower(label))
  where status <> 'ARCHIVED';

create index services_category_idx on public.services (category_id);
create index services_status_idx   on public.services (status, label);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.fn_set_updated_at();

create trigger services_audit
  after insert or update on public.services
  for each row execute function public.fn_audit_row('catalog');

create trigger services_no_delete
  before delete on public.services
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 5. LES VARIANTES — l'identité, et rien qu'elle
--
-- AUCUN PRIX SUR CETTE TABLE (Plan 02 §5.4). `purchase_price` et `sale_price`,
-- que le Plan 01 y plaçait, DISPARAISSENT : ils sont devenus des lignes datées.
-- =============================================================================

create table public.service_variants (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references public.services (id) on delete cascade,

  label        text not null check (length(btrim(label)) > 0),

  -- Référence courte, facultative. Unique dans tout le catalogue lorsqu'elle
  -- est renseignée : c'est ce qui en fait une référence.
  sku          text,

  is_default   boolean not null default false,
  is_active    boolean not null default true,
  display_order int    not null default 0,

  created_at   timestamptz not null default now(),
  created_by   uuid references public.app_users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.app_users (id) on delete set null,

  constraint service_variants_label_unique unique (service_id, label)
);

comment on table public.service_variants is
  'Déclinaisons d''un service (Standard, Premium, VIP…). Identité seule : les prix sont des lignes datées dans deux tables filles.';

create unique index service_variants_default_idx
  on public.service_variants (service_id)
  where is_default;

create unique index service_variants_sku_idx
  on public.service_variants (lower(sku))
  where sku is not null;

create index service_variants_service_idx on public.service_variants (service_id);

create trigger service_variants_set_updated_at
  before update on public.service_variants
  for each row execute function public.fn_set_updated_at();

create trigger service_variants_audit
  after insert or update on public.service_variants
  for each row execute function public.fn_audit_row('catalog');

create trigger service_variants_no_delete
  before delete on public.service_variants
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 6. LES VERSIONS DE PRIX — la forme commune (Plan 02 §5.5)
--
-- Cinq points, chacun pour une raison :
--
--   1. `bigint` en KMF ENTIERS — DEC-010, jamais de flottant.
--   2. CONTRAINTE D'EXCLUSION, et non un déclencheur : elle ferme la COURSE
--      entre deux saisies simultanées, qu'aucun déclencheur ne voit. C'est la
--      leçon de DEC-028, déjà apprise sur `vehicle_occupations`.
--   3. UNE DATE DE DÉBUT FUTURE EST AUTORISÉE — c'est précisément ce que la
--      Direction demande : préparer le prix du 1er juillet avant le 1er juillet.
--   4. UN TROU entre deux versions est PERMIS, et signifie « pas de prix à
--      cette date ». Le résolveur ne rend rien, l'écran le dit, rien ne se
--      facture. Refus explicite, pas zéro silencieux.
--   5. AUCUNE SUPPRESSION. Une version se clôt, ou se désactive.
--
-- LE MOTIF NE SE RÉÉCRIT PAS APRÈS COUP (migration 069) : le motif de la
-- version et celui de sa désactivation sont deux colonnes distinctes.
-- =============================================================================

-- --- Prix de vente ------------------------------------------------------------

create table public.service_variant_prices (
  id            uuid primary key default gen_random_uuid(),
  variant_id    uuid not null references public.service_variants (id) on delete cascade,

  amount        bigint not null check (amount > 0),
  currency_code text   not null default 'KMF',

  valid_from    date not null,
  valid_to      date,

  is_active     boolean not null default true,
  reason        text,

  deactivated_at     timestamptz,
  deactivated_by     uuid references public.app_users (id) on delete set null,
  deactivation_reason text,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint service_variant_prices_period check (
    valid_to is null or valid_to >= valid_from
  ),

  constraint service_variant_prices_no_overlap exclude using gist (
    variant_id extensions.gist_uuid_ops with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
  ) where (is_active)
);

comment on table public.service_variant_prices is
  'Versions datées du PRIX DE VENTE d''une variante (D16, DEC-043). Deux versions actives ne se recouvrent jamais : la base le refuse.';
comment on column public.service_variant_prices.valid_to is
  'NULL = en vigueur sans terme. Un TROU entre deux versions signifie « aucun prix à cette date » — et le résolveur ne rend alors rien.';
comment on column public.service_variant_prices.deactivation_reason is
  'Motif du retrait de la version. Distinct de `reason`, qui porte le motif du changement de prix : un motif ne se réécrit pas après coup.';

create index service_variant_prices_lookup_idx
  on public.service_variant_prices (variant_id, valid_from desc)
  where is_active;

create trigger service_variant_prices_set_updated_at
  before update on public.service_variant_prices
  for each row execute function public.fn_set_updated_at();

create trigger service_variant_prices_no_delete
  before delete on public.service_variant_prices
  for each row execute function public.fn_forbid_delete();


-- --- Prix d'achat — TABLE SÉPARÉE, et c'est la garantie ------------------------
--
-- Sa policy de lecture exige `catalog.services.cost.view`. C'est la seule
-- construction qui rende la confidentialité applicable au niveau de la DONNÉE :
-- RLS ne sait pas masquer une colonne.

create table public.service_variant_costs (
  id            uuid primary key default gen_random_uuid(),
  variant_id    uuid not null references public.service_variants (id) on delete cascade,

  amount        bigint not null check (amount > 0),
  currency_code text   not null default 'KMF',

  valid_from    date not null,
  valid_to      date,

  is_active     boolean not null default true,
  reason        text,

  deactivated_at      timestamptz,
  deactivated_by      uuid references public.app_users (id) on delete set null,
  deactivation_reason text,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint service_variant_costs_period check (
    valid_to is null or valid_to >= valid_from
  ),

  constraint service_variant_costs_no_overlap exclude using gist (
    variant_id extensions.gist_uuid_ops with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
  ) where (is_active)
);

comment on table public.service_variant_costs is
  'Versions datées du PRIX D''ACHAT d''une variante. Table séparée : RLS étant ROW-level, c''est la seule façon de faire respecter `catalog.services.cost.view`.';

create index service_variant_costs_lookup_idx
  on public.service_variant_costs (variant_id, valid_from desc)
  where is_active;

create trigger service_variant_costs_set_updated_at
  before update on public.service_variant_costs
  for each row execute function public.fn_set_updated_at();

create trigger service_variant_costs_no_delete
  before delete on public.service_variant_costs
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 7. LE JOURNAL — un changement de prix porte son propre type d'événement
--
-- `PRICE_CHANGE` est réservé aux tarifs depuis la migration 017. La fonction
-- reprend celle de `pricing_rules`, avec le module en argument : deux
-- domaines écrivent désormais des prix.
--
-- SECURITY DEFINER comme toutes les fonctions d'audit du projet : elles
-- écrivent dans une table que personne n'a le droit d'écrire (migration 004).
-- Ce n'est pas une fonction MÉTIER — la doctrine D4 n'est pas en cause.
-- =============================================================================

create or replace function public.fn_audit_price_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_id     text;
  v_module text := coalesce(tg_argv[0], null);
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_id    := new.id::text;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_id     := new.id::text;

    -- Rien de significatif n'a changé : ne pas polluer le journal (§80).
    if (v_before - 'updated_at' - 'updated_by') = (v_after - 'updated_at' - 'updated_by') then
      return new;
    end if;
  else
    v_before := to_jsonb(old);
    v_id     := old.id::text;
  end if;

  perform public.log_audit(
    p_action      => 'PRICE_CHANGE',
    p_entity_type => tg_table_name,
    p_entity_id   => v_id,
    p_module_code => v_module,
    p_before      => v_before,
    p_after       => v_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.fn_audit_price_row() is
  'Journalise une écriture de prix sous le type PRICE_CHANGE. Argument 1 : code du module. Le détail reste gardé par audit_detail_permission (DEC-038).';

revoke execute on function public.fn_audit_price_row() from public;

create trigger service_variant_prices_audit
  after insert or update on public.service_variant_prices
  for each row execute function public.fn_audit_price_row('catalog');

create trigger service_variant_costs_audit
  after insert or update on public.service_variant_costs
  for each row execute function public.fn_audit_price_row('catalog');


-- =============================================================================
-- 8. LES GARDES DE COHÉRENCE
--
-- UNE GARDE QUI COMPTE DOIT COMPTER LA VÉRITÉ, pas ce que l'appelant a le droit
-- de voir (migration 062). Un porteur de `catalog.services.update` dépourvu de
-- `cost.view` ne verrait AUCUNE version de coût : une garde qui lirait avec ses
-- droits conclurait « aucun coût » et le laisserait rendre le service « vente
-- seule » alors que des coûts y vivent encore.
--
-- Ces fonctions ne RENVOIENT aucune ligne : elles refusent, ou laissent passer.
-- `SECURITY DEFINER` ne divulgue donc rien.
--
-- ET LA COHÉRENCE PASSE AVANT L'ACTEUR (migration 055) : les règles de
-- cohérence sont posées AVANT tout test de capacité, faute de quoi la clé de
-- service — donc une restauration ou un script — les contournerait.
-- =============================================================================

-- --- Une catégorie archivée n'accueille pas un service nouveau ----------------

create or replace function public.fn_service_category_active()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active boolean;
  v_label  text;
begin
  -- Une restauration REMET ce qui a existé : elle n'a pas à rejouer une règle
  -- de cycle de vie (migration 075).
  if public.is_restoring() then return new; end if;

  if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id then
    return new;
  end if;

  select c.is_active, c.label into v_active, v_label
  from public.service_categories c
  where c.id = new.category_id;

  if not found then
    raise exception 'Catégorie de service introuvable.' using errcode = 'no_data_found';
  end if;

  if not v_active then
    raise exception
      'Opération refusée : la catégorie « % » est archivée. Réactivez-la, ou choisissez-en une autre.',
      v_label
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_service_category_active() is
  'Un service ne naît pas dans une catégorie archivée, et n''y est pas déplacé. Les services qui la portent déjà ne sont pas déclassés.';

revoke execute on function public.fn_service_category_active() from public;

create trigger services_category_active
  before insert or update on public.services
  for each row execute function public.fn_service_category_active();


-- --- Tout service reçoit sa variante « Standard » -----------------------------
--
-- Plan 02 §7.4 : « il n'existe donc jamais de service sans variante, et aucun
-- des quatre modules consommateurs n'a de cas particulier à traiter ».

create or replace function public.fn_service_default_variant()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Pendant une restauration, les variantes reviennent par la sauvegarde : en
  -- créer une ici produirait un doublon, puis une violation d'unicité.
  if public.is_restoring() then return new; end if;

  insert into public.service_variants
    (service_id, label, is_default, is_active, display_order, created_by, updated_by)
  values
    (new.id, 'Standard', true, true, 0, public.current_actor(), public.current_actor());

  return new;
end;
$$;

comment on function public.fn_service_default_variant() is
  'Tout service naît avec une variante « Standard » par défaut : aucune ligne commerciale n''aura donc de cas particulier à traiter.';

revoke execute on function public.fn_service_default_variant() from public;

create trigger services_default_variant
  after insert on public.services
  for each row execute function public.fn_service_default_variant();


-- --- Une seule variante par défaut, et elle reste active ----------------------

create or replace function public.fn_service_variant_default_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not new.is_default then return new; end if;

  if not new.is_active then
    raise exception
      'Opération refusée : la variante par défaut d''un service ne peut pas être désactivée. Désignez-en une autre d''abord.'
      using errcode = 'check_violation';
  end if;

  -- La bascule, plutôt qu'un refus : désigner une nouvelle variante par défaut
  -- est l'acte attendu, et l'index unique le refuserait sèchement.
  update public.service_variants
     set is_default = false
   where service_id = new.service_id
     and id <> new.id
     and is_default;

  return new;
end;
$$;

comment on function public.fn_service_variant_default_guard() is
  'Une seule variante par défaut et par service ; elle reste active. Désigner la nouvelle retire l''ancienne plutôt que d''échouer.';

revoke execute on function public.fn_service_variant_default_guard() from public;

create trigger service_variants_default_guard
  before insert or update on public.service_variants
  for each row execute function public.fn_service_variant_default_guard();


-- --- La destination commande ce qu'une variante peut porter -------------------
--
-- Plan 02 §7.4 :
--   SALE     → aucun prix d'achat
--   PURCHASE → aucun prix de vente
--   BOTH     → les deux admis, aucun obligatoire
--
-- « Au moins une version en vigueur » n'est PAS transcrit en contrainte de
-- base : le §5.5 du même plan autorise expressément un trou entre deux
-- versions, et un service naît nécessairement sans prix. C'est un ÉTAT
-- D'EXPLOITABILITÉ, que l'écran nomme (DEC-043 §d).

create or replace function public.fn_service_price_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purpose public.service_purpose;
  v_label   text;
begin
  select s.purpose, s.label into v_purpose, v_label
  from public.service_variants v
  join public.services s on s.id = v.service_id
  where v.id = new.variant_id;

  if not found then
    raise exception 'Variante de service introuvable.' using errcode = 'no_data_found';
  end if;

  if tg_argv[0] = 'SALE' and v_purpose = 'PURCHASE' then
    raise exception
      'Opération refusée : le service « % » est destiné à l''achat. Il ne porte pas de prix de vente.',
      v_label using errcode = 'check_violation';
  end if;

  if tg_argv[0] = 'PURCHASE' and v_purpose = 'SALE' then
    raise exception
      'Opération refusée : le service « % » est destiné à la vente. Il ne porte pas de prix d''achat.',
      v_label using errcode = 'check_violation';
  end if;

  -- Seconde barrière, APRÈS la cohérence : la policy dit qui peut écrire dans
  -- la table, ceci dit qui peut accomplir CET acte (DEC-024).
  if tg_argv[0] = 'SALE' then
    perform public.require_capability(
      array['catalog.services.price.update'], 'modifier le prix de vente d''un service'
    );
  else
    perform public.require_capability(
      array['catalog.services.cost.update'], 'saisir le prix d''achat d''un service'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_service_price_scope() is
  'Une version de prix respecte la destination du service, et exige la capacité de son acte. Argument 1 : SALE ou PURCHASE.';

revoke execute on function public.fn_service_price_scope() from public;

create trigger service_variant_prices_scope
  before insert or update on public.service_variant_prices
  for each row execute function public.fn_service_price_scope('SALE');

create trigger service_variant_costs_scope
  before insert or update on public.service_variant_costs
  for each row execute function public.fn_service_price_scope('PURCHASE');


-- --- Changer la destination d'un service, et changer son statut ---------------

create or replace function public.fn_service_write_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prices int;
  v_costs  int;
begin
  /* --- COHÉRENCE, pour tout acteur — y compris la clé de service ---------- */
  if new.purpose is distinct from old.purpose then

    -- LE DÉCOMPTE EST CELUI DE LA BASE, pas celui que l'appelant peut lire :
    -- un porteur dépourvu de `cost.view` verrait zéro coût et rendrait le
    -- service « vente seule » en laissant des coûts orphelins (migration 062).
    select count(*) into v_costs
    from public.service_variant_costs c
    join public.service_variants v on v.id = c.variant_id
    where v.service_id = new.id and c.is_active;

    select count(*) into v_prices
    from public.service_variant_prices p
    join public.service_variants v on v.id = p.variant_id
    where v.service_id = new.id and p.is_active;

    if new.purpose = 'SALE' and v_costs > 0 then
      raise exception
        'Opération refusée : ce service porte % version(s) de prix d''achat en vigueur. Retirez-les avant de le réserver à la vente.',
        v_costs using errcode = 'check_violation';
    end if;

    if new.purpose = 'PURCHASE' and v_prices > 0 then
      raise exception
        'Opération refusée : ce service porte % version(s) de prix de vente en vigueur. Retirez-les avant de le réserver à l''achat.',
        v_prices using errcode = 'check_violation';
    end if;
  end if;

  /* --- CAPACITÉS — deux actes distincts, deux capacités (DEC-024) --------- */
  if new.status is distinct from old.status then
    perform public.require_capability(
      array['catalog.services.archive'], 'changer le statut d''un service'
    );
  end if;

  if (to_jsonb(new) - 'status' - 'updated_at' - 'updated_by')
     is distinct from
     (to_jsonb(old) - 'status' - 'updated_at' - 'updated_by')
  then
    perform public.require_capability(
      array['catalog.services.update'], 'modifier un service'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_service_write_guard() is
  'La destination ne contredit jamais les prix en vigueur ; changer un statut exige `archive`, modifier une fiche exige `update` (DEC-024).';

revoke execute on function public.fn_service_write_guard() from public;

create trigger services_write_guard
  before update on public.services
  for each row execute function public.fn_service_write_guard();


-- --- Activer ou archiver une catégorie n'est pas la modifier ------------------

create or replace function public.fn_service_category_write_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_active is distinct from old.is_active then
    perform public.require_capability(
      array['catalog.categories.archive'], 'activer ou archiver une catégorie de services'
    );
  end if;

  if (to_jsonb(new) - 'is_active' - 'updated_at' - 'updated_by')
     is distinct from
     (to_jsonb(old) - 'is_active' - 'updated_at' - 'updated_by')
  then
    perform public.require_capability(
      array['catalog.categories.update'], 'modifier une catégorie de services'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_service_category_write_guard() is
  'Archiver une catégorie et la modifier sont deux actes, donc deux capacités (DEC-024).';

revoke execute on function public.fn_service_category_write_guard() from public;

create trigger service_categories_write_guard
  before update on public.service_categories
  for each row execute function public.fn_service_category_write_guard();


-- =============================================================================
-- 9. LES RÉSOLVEURS — D16(c) et D16(d)
--
-- `SECURITY INVOKER` (défaut), et c'est l'essentiel : un appelant dépourvu de
-- `catalog.services.cost.view` ne lit RIEN, parce que RLS ne lui rend rien. Le
-- résolveur n'ouvre aucune porte que la policy fermerait (doctrine D4).
--
-- LE JOUR EST COMORIEN, PAS UTC. `current_date` s'évalue en UTC : entre 21 h et
-- minuit, il désigne LA VEILLE à Moroni. L'écart est invisible en recette de
-- journée, et ferait tarifer une prestation du soir au prix de la veille le jour
-- d'un changement de tarif (DEC-025 §e).
--
-- AUCUNE VERSION APPLICABLE ⇒ AUCUNE LIGNE. Un prix absent n'est jamais un prix
-- nul (DEC-008, DEC-017).
-- =============================================================================

create or replace function public.resolve_service_price(
  p_variant_id uuid,
  p_on         date default (now() at time zone 'Indian/Comoro')::date
)
returns table (
  price_id      uuid,
  amount        bigint,
  currency_code text,
  valid_from    date,
  valid_to      date
)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.id, p.amount, p.currency_code, p.valid_from, p.valid_to
  from public.service_variant_prices p
  where p.variant_id = p_variant_id
    and p.is_active
    and p.valid_from <= p_on
    and (p.valid_to is null or p.valid_to >= p_on)
  -- La contrainte d'exclusion garantit l'unicité ; l'ordre départage une base
  -- où une version aurait été désactivée puis réactivée à la même seconde.
  order by p.valid_from desc, p.created_at desc, p.id desc
  limit 1;
$$;

comment on function public.resolve_service_price(uuid, date) is
  'Prix de vente applicable à une date (D16). Aucune ligne si aucune version n''est applicable — un prix absent n''est pas un prix nul.';

revoke execute on function public.resolve_service_price(uuid, date) from public, anon;
grant  execute on function public.resolve_service_price(uuid, date) to authenticated, service_role;


create or replace function public.resolve_service_cost(
  p_variant_id uuid,
  p_on         date default (now() at time zone 'Indian/Comoro')::date
)
returns table (
  cost_id       uuid,
  amount        bigint,
  currency_code text,
  valid_from    date,
  valid_to      date
)
language sql
stable
set search_path = public, pg_temp
as $$
  select c.id, c.amount, c.currency_code, c.valid_from, c.valid_to
  from public.service_variant_costs c
  where c.variant_id = p_variant_id
    and c.is_active
    and c.valid_from <= p_on
    and (c.valid_to is null or c.valid_to >= p_on)
  order by c.valid_from desc, c.created_at desc, c.id desc
  limit 1;
$$;

comment on function public.resolve_service_cost(uuid, date) is
  'Prix d''achat applicable à une date. SECURITY INVOKER : sans `catalog.services.cost.view`, la policy ne rend AUCUNE ligne.';

revoke execute on function public.resolve_service_cost(uuid, date) from public, anon;
grant  execute on function public.resolve_service_cost(uuid, date) to authenticated, service_role;


-- =============================================================================
-- 10. LES ACTES — ouvrir une version, en retirer une
--
-- CHANGER UN PRIX, C'EST CLORE ET OUVRIR — D16(a). Ces fonctions sont le seul
-- chemin applicatif : elles enchaînent la clôture et l'ouverture dans une même
-- transaction, ce qu'un écran ne saurait garantir.
--
-- POURQUOI `catalog.services.view` EST EXIGÉE EN PLUS
--
-- Une écriture sous RLS LIT d'abord les lignes qu'elle vise, et un
-- `insert … returning` exige la policy de lecture. Sans elle, l'opération ne
-- modifierait rien ET NE DIRAIT RIEN. La capacité est donc exigée
-- explicitement, puis L'EFFET est vérifié plutôt que supposé (leçon DEC-046).
-- =============================================================================

create or replace function public.set_service_price(
  p_variant_id uuid,
  p_amount     bigint,
  p_valid_from date default null,
  p_reason     text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_on   date := coalesce(p_valid_from, (now() at time zone 'Indian/Comoro')::date);
  v_next date;
  v_id   uuid;
begin
  perform public.require_capability(
    array['catalog.services.price.update'], 'modifier le prix de vente d''un service'
  );
  perform public.require_capability(
    array['catalog.services.view'], 'consulter le service concerné'
  );

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant d''un prix de vente doit être strictement positif.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.service_variants where id = p_variant_id) then
    raise exception 'Variante de service introuvable.' using errcode = 'no_data_found';
  end if;

  -- Une version qui DÉBUTE ce jour-là ne se clôt pas la veille : la période
  -- deviendrait négative. L'écran doit dire lequel des deux actes est demandé.
  if exists (
    select 1 from public.service_variant_prices
    where variant_id = p_variant_id and is_active and valid_from = v_on
  ) then
    raise exception
      'Opération refusée : une version de prix débute déjà le %. Retirez-la, ou choisissez une autre date d''effet.',
      to_char(v_on, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  -- 1. Clore la version qui couvre la date d'effet — la veille.
  update public.service_variant_prices
     set valid_to = v_on - 1
   where variant_id = p_variant_id
     and is_active
     and valid_from < v_on
     and (valid_to is null or valid_to >= v_on);

  -- 2. Une version ULTÉRIEURE déjà saisie borne la nouvelle : préparer le prix
  --    du 1er juillet ne doit pas effacer celui du 1er octobre.
  select min(valid_from) into v_next
  from public.service_variant_prices
  where variant_id = p_variant_id and is_active and valid_from > v_on;

  insert into public.service_variant_prices
    (variant_id, amount, valid_from, valid_to, reason, created_by, updated_by)
  values
    (p_variant_id, p_amount, v_on,
     case when v_next is null then null else v_next - 1 end,
     nullif(btrim(coalesce(p_reason, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.set_service_price(uuid, bigint, date, text) is
  'Ouvre une version de prix de vente à une date d''effet, en closant la version courante. Ne réécrit jamais un montant (D16).';

revoke execute on function public.set_service_price(uuid, bigint, date, text) from public, anon;
grant  execute on function public.set_service_price(uuid, bigint, date, text) to authenticated, service_role;


create or replace function public.set_service_cost(
  p_variant_id uuid,
  p_amount     bigint,
  p_valid_from date default null,
  p_reason     text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_on   date := coalesce(p_valid_from, (now() at time zone 'Indian/Comoro')::date);
  v_next date;
  v_id   uuid;
begin
  perform public.require_capability(
    array['catalog.services.cost.update'], 'saisir le prix d''achat d''un service'
  );
  perform public.require_capability(
    array['catalog.services.view'], 'consulter le service concerné'
  );
  -- Écrire une version suppose de lire la chronologie : sans cette capacité,
  -- la clôture de la version courante ne toucherait aucune ligne, en silence.
  perform public.require_capability(
    array['catalog.services.cost.view'], 'lire la chronologie des prix d''achat'
  );

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant d''un prix d''achat doit être strictement positif.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.service_variants where id = p_variant_id) then
    raise exception 'Variante de service introuvable.' using errcode = 'no_data_found';
  end if;

  if exists (
    select 1 from public.service_variant_costs
    where variant_id = p_variant_id and is_active and valid_from = v_on
  ) then
    raise exception
      'Opération refusée : une version de coût débute déjà le %. Retirez-la, ou choisissez une autre date d''effet.',
      to_char(v_on, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  update public.service_variant_costs
     set valid_to = v_on - 1
   where variant_id = p_variant_id
     and is_active
     and valid_from < v_on
     and (valid_to is null or valid_to >= v_on);

  select min(valid_from) into v_next
  from public.service_variant_costs
  where variant_id = p_variant_id and is_active and valid_from > v_on;

  insert into public.service_variant_costs
    (variant_id, amount, valid_from, valid_to, reason, created_by, updated_by)
  values
    (p_variant_id, p_amount, v_on,
     case when v_next is null then null else v_next - 1 end,
     nullif(btrim(coalesce(p_reason, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.set_service_cost(uuid, bigint, date, text) is
  'Ouvre une version de prix d''achat. Exige la capacité de saisie ET celle de lecture : on n''écrit pas une chronologie qu''on ne lit pas.';

revoke execute on function public.set_service_cost(uuid, bigint, date, text) from public, anon;
grant  execute on function public.set_service_cost(uuid, bigint, date, text) to authenticated, service_role;


-- --- Retirer une version ------------------------------------------------------
--
-- D16 : « Aucune suppression. Une version se clôt ou se désactive. » La version
-- reste lisible, avec son auteur, son motif et la raison de son retrait.

create or replace function public.deactivate_service_price(
  p_price_id uuid,
  p_reason   text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_touched int;
begin
  perform public.require_capability(
    array['catalog.services.price.update'], 'retirer une version de prix de vente'
  );
  perform public.require_capability(
    array['catalog.services.view'], 'consulter le service concerné'
  );

  update public.service_variant_prices
     set is_active           = false,
         deactivated_at      = now(),
         deactivated_by      = public.current_actor(),
         deactivation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by          = public.current_actor()
   where id = p_price_id
     and is_active;

  get diagnostics v_touched = row_count;

  -- L'EFFET, pas l'intention : une policy manquante rendrait zéro ligne sans
  -- lever d'erreur, et l'appelant croirait l'opération faite.
  if v_touched = 0 then
    raise exception
      'Opération refusée : cette version de prix est introuvable, déjà retirée, ou hors de portée.'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.deactivate_service_price(uuid, text) is
  'Retire une version de prix de vente sans la supprimer. Le motif du retrait est distinct de celui du changement de prix.';

revoke execute on function public.deactivate_service_price(uuid, text) from public, anon;
grant  execute on function public.deactivate_service_price(uuid, text) to authenticated, service_role;


create or replace function public.deactivate_service_cost(
  p_cost_id uuid,
  p_reason  text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_touched int;
begin
  perform public.require_capability(
    array['catalog.services.cost.update'], 'retirer une version de prix d''achat'
  );
  perform public.require_capability(
    array['catalog.services.view'], 'consulter le service concerné'
  );
  perform public.require_capability(
    array['catalog.services.cost.view'], 'lire la chronologie des prix d''achat'
  );

  update public.service_variant_costs
     set is_active           = false,
         deactivated_at      = now(),
         deactivated_by      = public.current_actor(),
         deactivation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by          = public.current_actor()
   where id = p_cost_id
     and is_active;

  get diagnostics v_touched = row_count;

  if v_touched = 0 then
    raise exception
      'Opération refusée : cette version de coût est introuvable, déjà retirée, ou hors de portée.'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.deactivate_service_cost(uuid, text) is
  'Retire une version de prix d''achat sans la supprimer.';

revoke execute on function public.deactivate_service_cost(uuid, text) from public, anon;
grant  execute on function public.deactivate_service_cost(uuid, text) to authenticated, service_role;


-- =============================================================================
-- 11. RLS — le patron du Plan 02 §8.2, sans exception
--
-- `has_permission(...)` est ENVELOPPÉE DANS UN SOUS-SELECT : une garde de RLS
-- s'évalue PAR LIGNE, et l'appel coûterait sinon un aller-retour par ligne de
-- la liste. Le sous-select le ramène à un (migration 065).
-- =============================================================================

revoke all on public.service_categories     from anon;
revoke all on public.services               from anon;
revoke all on public.service_variants       from anon;
revoke all on public.service_variant_prices from anon;
revoke all on public.service_variant_costs  from anon;

revoke delete on public.service_categories     from authenticated;
revoke delete on public.services               from authenticated;
revoke delete on public.service_variants       from authenticated;
revoke delete on public.service_variant_prices from authenticated;
revoke delete on public.service_variant_costs  from authenticated;

alter table public.service_categories     enable row level security;
alter table public.services               enable row level security;
alter table public.service_variants       enable row level security;
alter table public.service_variant_prices enable row level security;
alter table public.service_variant_costs  enable row level security;


-- --- Catégories ---------------------------------------------------------------
--
-- La lecture accepte AUSSI `catalog.services.view` : une fiche de service NOMME
-- sa catégorie, et un écran qui afficherait « Catégorie : (illisible) » serait
-- absurde. Même précédent que `vehicle_categories_select` (migration 018).

create policy service_categories_select on public.service_categories
  for select to authenticated
  using (
    (select public.has_permission('catalog.categories.view'))
    or (select public.has_permission('catalog.services.view'))
  );

create policy service_categories_insert on public.service_categories
  for insert to authenticated
  with check ((select public.has_permission('catalog.categories.create')));

create policy service_categories_update on public.service_categories
  for update to authenticated
  using (
    (select public.has_permission('catalog.categories.update'))
    or (select public.has_permission('catalog.categories.archive'))
  )
  with check (
    (select public.has_permission('catalog.categories.update'))
    or (select public.has_permission('catalog.categories.archive'))
  );


-- --- Services -----------------------------------------------------------------

create policy services_select on public.services
  for select to authenticated
  using ((select public.has_permission('catalog.services.view')));

create policy services_insert on public.services
  for insert to authenticated
  with check ((select public.has_permission('catalog.services.create')));

create policy services_update on public.services
  for update to authenticated
  using (
    (select public.has_permission('catalog.services.update'))
    or (select public.has_permission('catalog.services.archive'))
  )
  with check (
    (select public.has_permission('catalog.services.update'))
    or (select public.has_permission('catalog.services.archive'))
  );


-- --- Variantes ----------------------------------------------------------------
--
-- L'écriture accepte `create` : c'est le déclencheur `services_default_variant`
-- qui pose la variante « Standard », avec la session de qui crée le service.

create policy service_variants_select on public.service_variants
  for select to authenticated
  using ((select public.has_permission('catalog.services.view')));

create policy service_variants_insert on public.service_variants
  for insert to authenticated
  with check (
    (select public.has_permission('catalog.services.create'))
    or (select public.has_permission('catalog.services.update'))
  );

create policy service_variants_update on public.service_variants
  for update to authenticated
  using ((select public.has_permission('catalog.services.update')))
  with check ((select public.has_permission('catalog.services.update')));


-- --- Prix de vente ------------------------------------------------------------
--
-- La LECTURE relève de `catalog.services.view` : l'historique de vente ne montre
-- rien de plus que la fiche n'ouvre déjà, et une capacité de plus ne fermerait
-- RIEN (Plan 02 §10.2). L'ÉCRITURE relève de `price.update`, et d'elle seule.

create policy service_variant_prices_select on public.service_variant_prices
  for select to authenticated
  using ((select public.has_permission('catalog.services.view')));

create policy service_variant_prices_insert on public.service_variant_prices
  for insert to authenticated
  with check ((select public.has_permission('catalog.services.price.update')));

create policy service_variant_prices_update on public.service_variant_prices
  for update to authenticated
  using ((select public.has_permission('catalog.services.price.update')))
  with check ((select public.has_permission('catalog.services.price.update')));


-- --- Prix d'achat — LA TABLE SENSIBLE -----------------------------------------
--
-- `catalog.services.view` N'APPARAÎT PAS ICI, et c'est tout l'objet de la table
-- séparée : un utilisateur qui vend un service ne voit pas ce qu'il a coûté.

create policy service_variant_costs_select on public.service_variant_costs
  for select to authenticated
  using ((select public.has_permission('catalog.services.cost.view')));

create policy service_variant_costs_insert on public.service_variant_costs
  for insert to authenticated
  with check ((select public.has_permission('catalog.services.cost.update')));

create policy service_variant_costs_update on public.service_variant_costs
  for update to authenticated
  using ((select public.has_permission('catalog.services.cost.update')))
  with check ((select public.has_permission('catalog.services.cost.update')));


-- =============================================================================
-- 12. LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME — DEC-038
--
-- `users.audit.view` donne l'ÉVÉNEMENT. La donnée métier d'un événement reste
-- derrière la lecture de l'objet concerné. Un type d'objet absent de cette
-- correspondance se referme sur le seul Super Admin : le défaut serait sûr,
-- mais SILENCIEUX — et un coût de service serait alors invisible même à qui a
-- le droit de le voir.
--
-- LE POINT QUI COMPTE : `service_variant_costs` s'ouvre par
-- `catalog.services.cost.view`, JAMAIS par `catalog.services.view`. Sans cela,
-- le journal rendrait par la bande ce que la table refuse.
-- =============================================================================

create or replace function public.audit_detail_permission(p_entity_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_entity_type
    -- --- Utilisateurs & Groupes ----------------------------------------------
    when 'app_users'                      then 'users.users.view'
    when 'user_groups'                    then 'users.users.view'
    when 'user_departments'               then 'users.users.view'
    when 'groups'                         then 'users.groups.view'
    when 'group_permissions'              then 'users.groups.view'
    when 'user_permissions'               then 'users.users.permissions.view'

    -- --- Tiers ---------------------------------------------------------------
    when 'clients'                        then 'parties.clients.view'
    when 'suppliers'                      then 'parties.suppliers.view'
    when 'partners'                       then 'parties.partners.view'
    when 'supplier_bank_details'          then 'parties.suppliers.bank.view'
    when 'supplier_payment_details'       then 'parties.suppliers.bank.view'

    -- --- Gestion de location -------------------------------------------------
    when 'vehicles'                       then 'rental.fleet.view'
    when 'vehicle_supplier_history'       then 'rental.fleet.view'
    when 'vehicle_occupations'            then 'rental.fleet.view'
    when 'vehicle_categories'             then 'rental.categories.view'
    when 'vehicle_documents'              then 'rental.documents.view'
    when 'pricing_rules'                  then 'rental.pricing.view'
    when 'reservations'                   then 'rental.reservations.view'
    when 'rentals'                        then 'rental.rentals.view'
    when 'rental_inspections'             then 'rental.rentals.view'
    when 'rental_inspection_photos'       then 'rental.rentals.view'
    when 'vehicle_incidents'              then 'rental.incidents.view'
    when 'incident_damages'               then 'rental.incidents.view'
    when 'incident_photos'                then 'rental.incidents.view'
    when 'vehicle_maintenances'           then 'rental.maintenance.view'
    when 'maintenance_documents'          then 'rental.maintenance.view'
    when 'maintenance_quotes'             then 'rental.maintenance.view'
    when 'maintenance_costs'              then 'rental.maintenance.cost.view'
    when 'maintenance_cost_lines'         then 'rental.maintenance.cost.view'

    -- --- Produits & Services — LOT 20 ----------------------------------------
    when 'service_categories'             then 'catalog.categories.view'
    when 'services'                       then 'catalog.services.view'
    when 'service_variants'               then 'catalog.services.view'
    when 'service_variant_prices'         then 'catalog.services.view'
    -- Un prix d'achat garde SA lecture jusque dans le journal : consulter un
    -- service n'a jamais ouvert son coût (DEC-024, DEC-043 §e).
    when 'service_variant_costs'          then 'catalog.services.cost.view'

    -- --- Facturation & Paiement ----------------------------------------------
    when 'customer_invoices'              then 'billing.customer_invoices.view'
    when 'customer_invoice_lines'         then 'billing.customer_invoices.view'
    when 'customer_payments'              then 'billing.customer_payments.view'
    when 'supplier_invoices'              then 'billing.supplier_invoices.view'
    when 'supplier_invoice_lines'         then 'billing.supplier_invoices.view'
    when 'supplier_payments'              then 'billing.supplier_payments.view'
    when 'imputations'                    then 'billing.imputations.view'
    when 'imputation_documents'           then 'billing.imputations.view'
    when 'misc_payments'                  then 'billing.misc_payments.view'

    -- --- Banques & Caisses ---------------------------------------------------
    when 'financial_accounts'             then 'treasury.accounts.view'
    when 'treasury_entries'               then 'treasury.entries.view'
    when 'internal_transfers'             then 'treasury.transfers.view'

    -- --- Projets & Planification ---------------------------------------------
    when 'projects'                       then 'projects.view'
    when 'project_members'                then 'projects.view'
    when 'project_tasks'                  then 'projects.tasks.view'
    when 'project_meetings'               then 'projects.meetings.view'
    when 'project_meeting_participants'   then 'projects.meetings.view'
    when 'project_appointments'           then 'projects.appointments.view'
    when 'project_appointment_participants' then 'projects.appointments.view'
    when 'project_decisions'              then 'projects.decisions.view'
    when 'project_actions'                then 'projects.actions.view'

    -- --- Paramètres ----------------------------------------------------------
    when 'company_settings'               then 'settings.company.view'
    when 'numbering_rules'                then 'settings.numbering.view'

    else null
  end;
$$;

comment on function public.audit_detail_permission(text) is
  'Capacité exigée pour lire le détail avant/après d''un événement (DEC-038). NULL = Super Admin uniquement.';


-- =============================================================================
-- 13. LES DOUZE CAPACITÉS
--
-- La liste de colonnes ouvre par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît pour rejouer le
-- catalogue sans interpréter du SQL.
--
-- MODULE `catalog`, ordre 10 — nommé « Produits & Services », alors que SEULS
-- les services sont développés. Choisir le nom large maintenant évite de
-- renommer un `module_code` après attribution de ses capacités (Plan 02 §4.4).
--
-- AUCUNE capacité `catalog.products.*` : une permission qui ne débloque rien ne
-- s'attribue pas (CLAUDE.md §19 bis).
--
-- Catalogue : 179 → 191.
-- =============================================================================

with nouvelles (
  code, module_code, menu_code, menu_label, menu_order,
  submenu_code, submenu_label, action, label, sensitive, rang
) as (values
  ('catalog.services.view',          'catalog', 'services', 'Services', 1,
   null, null, 'VIEW',    'Consulter les services',                    false, 1),
  ('catalog.services.create',        'catalog', 'services', 'Services', 1,
   null, null, 'CREATE',  'Créer un service',                          false, 2),
  ('catalog.services.update',        'catalog', 'services', 'Services', 1,
   null, null, 'UPDATE',  'Modifier un service',                       false, 3),
  ('catalog.services.archive',       'catalog', 'services', 'Services', 1,
   null, null, 'ARCHIVE', 'Activer / désactiver / archiver un service', false, 4),
  ('catalog.services.export',        'catalog', 'services', 'Services', 1,
   null, null, 'EXPORT',  'Exporter la liste des services',            true,  5),
  ('catalog.services.price.update',  'catalog', 'services', 'Services', 1,
   'price', 'Prix de vente', 'UPDATE', 'Modifier les prix de vente',    true,  6),
  ('catalog.services.cost.view',     'catalog', 'services', 'Services', 1,
   'cost',  'Prix d''achat', 'VIEW',   'Voir les prix d''achat',        true,  7),
  ('catalog.services.cost.update',   'catalog', 'services', 'Services', 1,
   'cost',  'Prix d''achat', 'UPDATE', 'Saisir les prix d''achat',      true,  8),

  ('catalog.categories.view',        'catalog', 'categories', 'Catégories', 2,
   null, null, 'VIEW',    'Consulter les catégories de services',      false, 1),
  ('catalog.categories.create',      'catalog', 'categories', 'Catégories', 2,
   null, null, 'CREATE',  'Créer une catégorie de services',           false, 2),
  ('catalog.categories.update',      'catalog', 'categories', 'Catégories', 2,
   null, null, 'UPDATE',  'Modifier une catégorie de services',        false, 3),
  ('catalog.categories.archive',     'catalog', 'categories', 'Catégories', 2,
   null, null, 'ARCHIVE', 'Activer / désactiver une catégorie',        false, 4)
)
insert into public.permissions (
  code, module_code, module_label, menu_code, menu_label,
  submenu_code, submenu_label, action, label, is_sensitive,
  module_order, menu_order, submenu_order, action_order
)
select
  n.code,
  n.module_code,
  'Produits & Services',
  n.menu_code,
  n.menu_label,
  n.submenu_code,
  n.submenu_label,
  n.action::public.permission_action,
  n.label,
  n.sensitive,
  10,
  n.menu_order,
  n.rang,
  case n.action
    when 'VIEW'    then 1
    when 'CREATE'  then 2
    when 'UPDATE'  then 3
    when 'ARCHIVE' then 6
    when 'EXPORT'  then 7
    else 99
  end
from nouvelles n
on conflict (code) do update set
  module_label  = excluded.module_label,
  menu_label    = excluded.menu_label,
  submenu_code  = excluded.submenu_code,
  submenu_label = excluded.submenu_label,
  label         = excluded.label,
  is_sensitive  = excluded.is_sensitive,
  module_order  = excluded.module_order,
  menu_order    = excluded.menu_order,
  submenu_order = excluded.submenu_order,
  action_order  = excluded.action_order;


-- =============================================================================
-- 14. CONTRÔLES DE NON-RÉGRESSION
--
-- LE TOTAL DU CATALOGUE EST AFFIRMÉ ICI, ET NULLE PART AILLEURS (DEC-046).
-- Une migration énonce un fait DATÉ — le total au moment où elle s'applique — et
-- n'a jamais à être rouverte. Les recettes, elles, nomment les capacités
-- qu'elles éprouvent.
-- =============================================================================

do $$
declare
  v_total   int;
  v_attendu text[] := array[
    'catalog.services.view', 'catalog.services.create', 'catalog.services.update',
    'catalog.services.archive', 'catalog.services.export',
    'catalog.services.price.update',
    'catalog.services.cost.view', 'catalog.services.cost.update',
    'catalog.categories.view', 'catalog.categories.create',
    'catalog.categories.update', 'catalog.categories.archive'
  ];
  v_manquantes text[];
  v_inconnues  text[];
  v_table      text;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 191 then
    raise exception 'Catalogue attendu à 191 permissions, obtenu %.', v_total;
  end if;

  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_manquantes is not null then
    raise exception 'Capacités du LOT 20 absentes du catalogue : %', v_manquantes;
  end if;

  -- AUCUNE capacité inventée : ni produit, ni marge, ni historique, ni
  -- suppression, ni document (CLAUDE.md §19 bis).
  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.module_code = 'catalog' and not (p.code = any (v_attendu));

  if v_inconnues is not null then
    raise exception
      'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  -- Les quatre capacités sensibles du lot.
  if exists (
    select 1 from public.permissions
    where code in ('catalog.services.export', 'catalog.services.price.update',
                   'catalog.services.cost.view', 'catalog.services.cost.update')
      and is_sensitive is not true
  ) then
    raise exception 'Une capacité de prix ou d''export du catalogue n''est pas marquée sensible.';
  end if;

  -- Les cinq tables, avec RLS activée.
  foreach v_table in array array[
    'service_categories', 'services', 'service_variants',
    'service_variant_prices', 'service_variant_costs'
  ] loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = v_table
    ) then
      raise exception 'Table % absente.', v_table;
    end if;

    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'RLS non activée sur %.', v_table;
    end if;
  end loop;

  -- LA GARANTIE CENTRALE DU LOT : la lecture des coûts ne cite QUE sa capacité.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_variant_costs'
      and policyname = 'service_variant_costs_select'
      and (qual not like '%catalog.services.cost.view%'
        or qual like '%catalog.services.view''%')
  ) then
    raise exception
      'La lecture des prix d''achat ne doit dépendre que de `catalog.services.cost.view`.';
  end if;

  -- Les deux contraintes d'exclusion, sans lesquelles deux saisies simultanées
  -- créeraient deux versions valides au même moment (DEC-028).
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_variant_prices_no_overlap' and contype = 'x'
  ) or not exists (
    select 1 from pg_constraint
    where conname = 'service_variant_costs_no_overlap' and contype = 'x'
  ) then
    raise exception 'Une contrainte d''exclusion de chevauchement est absente.';
  end if;

  -- DOCTRINE D4 : aucun résolveur, aucun acte métier en SECURITY DEFINER.
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.resolve_service_price(uuid, date)'::regprocedure,
      'public.resolve_service_cost(uuid, date)'::regprocedure,
      'public.set_service_price(uuid, bigint, date, text)'::regprocedure,
      'public.set_service_cost(uuid, bigint, date, text)'::regprocedure,
      'public.deactivate_service_price(uuid, text)'::regprocedure,
      'public.deactivate_service_cost(uuid, text)'::regprocedure
    )
    and prosecdef
  ) then
    raise exception 'Une fonction métier du catalogue est SECURITY DEFINER (doctrine D4).';
  end if;

  raise notice
    '[OK] 081. Catalogue à 191 ; 5 tables, RLS active, coûts gardés par leur propre capacité.';
end $$;
