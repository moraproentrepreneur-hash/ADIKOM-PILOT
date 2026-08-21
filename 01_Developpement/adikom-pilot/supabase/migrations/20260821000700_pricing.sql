-- =============================================================================
-- ADIKOM PILOT — 017 · Tarification
-- Étape 2.2 (DEC-021) — mise en œuvre de DEC-001 et DEC-002
--
-- DEC-001 : chaque tarif porte son unité — DAY (montant × durée) ou FLAT.
-- DEC-002 : le tarif le plus spécifique gagne —
--           client+véhicule → client+catégorie → client
--           → véhicule → catégorie → standard.
--           À égalité, le tarif le plus récemment créé s'applique.
--
-- « La règle définitive doit être centralisée et ne doit pas être réinventée
--   différemment dans chaque écran. » — 03_Modules/05 §20
--
-- Une table unique porte les six niveaux, et une seule fonction les départage.
-- Un écran ne peut donc pas appliquer sa propre règle : il n'a pas les moyens
-- de la reformuler.
-- =============================================================================

create table public.pricing_rules (
  id               uuid primary key default gen_random_uuid(),

  -- Portée. Chaque colonne nulle élargit la règle ; toutes nulles = tarif
  -- standard global.
  client_id        uuid references public.clients (id)            on delete restrict,
  vehicle_id       uuid references public.vehicles (id)           on delete restrict,
  category_id      uuid references public.vehicle_categories (id) on delete restrict,

  -- Montant appliqué, en KMF entiers (DEC-010). Exclusif d'une remise.
  amount           bigint  check (amount is null or amount >= 0),
  unit             public.pricing_unit,

  -- Remise en pourcentage du tarif de référence (03_Modules/04_Tiers.md §6.4,
  -- Périmètre MVP §9). Réservée aux conditions client : une remise suppose un
  -- tarif de référence sur lequel s'appliquer.
  discount_percent numeric(5,2) check (
    discount_percent is null or (discount_percent > 0 and discount_percent < 100)
  ),

  -- Période de validité (§6.5). Sans date de fin, la condition est permanente.
  valid_from       date,
  valid_to         date,

  is_active        boolean not null default true,
  conditions       text,                    -- conditions particulières (§6.4)

  -- Spécificité, calculée et non saisie : c'est l'ordre de DEC-002 rendu
  -- comparable. client = 4 · véhicule = 2 · catégorie = 1.
  --   6 client+véhicule · 5 client+catégorie · 4 client
  --   2 véhicule        · 1 catégorie        · 0 standard
  specificity      int generated always as (
                     (case when client_id   is not null then 4 else 0 end)
                   + (case when vehicle_id  is not null then 2 else 0 end)
                   + (case when category_id is not null then 1 else 0 end)
                   ) stored,

  created_at       timestamptz not null default now(),
  created_by       uuid references public.app_users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.app_users (id) on delete set null,

  -- Une règle vise un véhicule OU une catégorie, jamais les deux : la
  -- spécificité doit rester un ordre total et lisible.
  constraint pricing_rules_scope check (vehicle_id is null or category_id is null),

  -- Un montant ou une remise, jamais les deux, jamais aucun des deux :
  -- « le système ne doit jamais appliquer plusieurs tarifs simultanément de
  --   manière ambiguë » (Tiers §6.6).
  constraint pricing_rules_amount_xor_discount check (
    (amount is not null and discount_percent is null)
    or (amount is null and discount_percent is not null)
  ),

  -- DEC-001 : un montant sans unité n'existe pas. Une remise hérite en
  -- revanche de l'unité du tarif de référence.
  constraint pricing_rules_unit_required check (
    (amount is not null and unit is not null)
    or (amount is null and unit is null)
  ),

  constraint pricing_rules_discount_needs_client check (
    discount_percent is null or client_id is not null
  ),

  constraint pricing_rules_period check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

comment on table public.pricing_rules is
  'Tarifs standard et conditions préférentielles. Les six niveaux de DEC-002 dans une table unique.';
comment on column public.pricing_rules.specificity is
  'Ordre de priorité DEC-002, calculé. À égalité, la règle la plus récente s''applique.';
comment on column public.pricing_rules.unit is
  'DEC-001 — DAY : montant × durée facturable. FLAT : montant, durée sans effet.';

create index pricing_rules_client_idx   on public.pricing_rules (client_id)   where client_id   is not null;
create index pricing_rules_vehicle_idx  on public.pricing_rules (vehicle_id)  where vehicle_id  is not null;
create index pricing_rules_category_idx on public.pricing_rules (category_id) where category_id is not null;
create index pricing_rules_lookup_idx   on public.pricing_rules (is_active, specificity desc, created_at desc);

create trigger pricing_rules_set_updated_at
  before update on public.pricing_rules
  for each row execute function public.fn_set_updated_at();

-- Un changement de tarif est une opération sensible explicitement citée par
-- CLAUDE.md §46 et Tiers §23. Le type d'événement PRICE_CHANGE lui est réservé.
create or replace function public.fn_audit_price_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_id     text;
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_id    := new.id::text;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_id     := new.id::text;

    if (v_before - 'updated_at' - 'updated_by') = (v_after - 'updated_at' - 'updated_by') then
      return new;
    end if;
  else
    v_before := to_jsonb(old);
    v_id     := old.id::text;
  end if;

  perform public.log_audit(
    p_action      => 'PRICE_CHANGE',
    p_entity_type => 'pricing_rules',
    p_entity_id   => v_id,
    p_module_code => 'rental',
    p_before      => v_before,
    p_after       => v_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger pricing_rules_audit
  after insert or update or delete on public.pricing_rules
  for each row execute function public.fn_audit_price_change();

-- Un tarif ne se supprime pas : il se désactive ou expire. Une réservation ou
-- une location passée doit pouvoir continuer à désigner la règle qui lui a été
-- appliquée (Tiers §6.7, Module 05 §21 — conservation du tarif appliqué).
create trigger pricing_rules_no_delete
  before delete on public.pricing_rules
  for each row execute function public.fn_forbid_delete();


-- --- Résolveur tarifaire ----------------------------------------------------
--
-- Point d'entrée unique de DEC-002. Renvoie toujours la SOURCE du tarif retenu,
-- afin qu'elle soit affichée à l'utilisateur avant validation (Workflow 02 §8).
--
-- Aucun tarif applicable ne produit AUCUNE ligne : l'absence de tarif est un
-- cas explicite, jamais un montant nul inventé (DEC-008 — le système signale
-- ce qui n'est pas configuré plutôt que d'appliquer un barème supposé).

create or replace function public.resolve_pricing_rule(
  p_client_id  uuid,
  p_vehicle_id uuid,
  p_on         date default current_date
)
returns table (
  rule_id          uuid,
  amount           bigint,
  unit             public.pricing_unit,
  source           text,
  specificity      int,
  discount_percent numeric,
  base_rule_id     uuid,
  base_amount      bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_category uuid;
  v_rule     public.pricing_rules%rowtype;
  v_base     public.pricing_rules%rowtype;
  v_source   text;
begin
  select category_id into v_category
  from public.vehicles
  where id = p_vehicle_id;

  if v_category is null then
    return;                       -- véhicule inconnu : aucun tarif à proposer
  end if;

  -- Règle gagnante : la plus spécifique, puis la plus récente (DEC-002).
  -- Une condition expirée ou désactivée n'est pas candidate (Tiers §6.5).
  select * into v_rule
  from public.pricing_rules r
  where r.is_active
    and (r.valid_from is null or r.valid_from <= p_on)
    and (r.valid_to   is null or r.valid_to   >= p_on)
    and (r.client_id   is null or r.client_id   = p_client_id)
    and (r.vehicle_id  is null or r.vehicle_id  = p_vehicle_id)
    and (r.category_id is null or r.category_id = v_category)
  -- `id` en dernier départage deux règles créées à la même microseconde : sans
  -- lui, PostgreSQL pourrait renvoyer l'une ou l'autre, et le même dossier
  -- produirait deux montants selon l'exécution. Un tarif ne peut pas dépendre du
  -- hasard.
  order by r.specificity desc, r.created_at desc, r.id desc
  limit 1;

  if not found then
    return;                       -- aucun tarif configuré : cas explicite
  end if;

  v_source := case v_rule.specificity
                when 6 then 'CLIENT_VEHICLE'
                when 5 then 'CLIENT_CATEGORY'
                when 4 then 'CLIENT'
                when 2 then 'VEHICLE'
                when 1 then 'CATEGORY'
                else        'STANDARD'
              end;

  -- Tarif exprimé en montant : appliqué tel quel.
  if v_rule.amount is not null then
    return query select
      v_rule.id, v_rule.amount, v_rule.unit, v_source, v_rule.specificity,
      null::numeric, null::uuid, null::bigint;
    return;
  end if;

  -- Tarif exprimé en remise : il lui faut un tarif de référence, cherché parmi
  -- les seuls tarifs non liés à un client.
  select * into v_base
  from public.pricing_rules r
  where r.is_active
    and r.client_id is null
    and r.amount is not null
    and (r.valid_from is null or r.valid_from <= p_on)
    and (r.valid_to   is null or r.valid_to   >= p_on)
    and (r.vehicle_id  is null or r.vehicle_id  = p_vehicle_id)
    and (r.category_id is null or r.category_id = v_category)
  order by r.specificity desc, r.created_at desc, r.id desc
  limit 1;

  if not found then
    return;                       -- remise sans référence : aucun montant inventé
  end if;

  -- Arrondi au franc comorien : le KMF n'a pas de sous-unité (DEC-010).
  -- `round` sur numeric arrondit à l'entier le plus proche, les demis vers le haut.
  return query select
    v_rule.id,
    round(v_base.amount * (100 - v_rule.discount_percent) / 100)::bigint,
    v_base.unit,
    v_source || '_DISCOUNT',
    v_rule.specificity,
    v_rule.discount_percent,
    v_base.id,
    v_base.amount;
end;
$$;

comment on function public.resolve_pricing_rule(uuid, uuid, date) is
  'Tarif applicable et sa source (DEC-002). Aucune ligne renvoyée si aucun tarif n''est configuré.';
