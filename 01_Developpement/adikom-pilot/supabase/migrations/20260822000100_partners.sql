-- =============================================================================
-- ADIKOM PILOT — 024 · Partenaires — structure minimale
-- Étape 2.2, correction C2 — arbitrage ADIKOM du 22 août 2026
--
-- OBJET, ET SES LIMITES
--
-- Le Parc automobile doit pouvoir traiter ses trois origines. Deux le sont
-- déjà ; la troisième — « Partenariat » — était sélectionnable sans qu'aucun
-- emplacement n'existe pour désigner le partenaire. Un véhicule pouvait donc
-- être déclaré en partenariat sans contrepartie identifiable.
--
-- Cette migration crée le strict nécessaire pour fermer ce trou :
--   · une table `partners` ;
--   · une colonne `vehicles.partner_id` ;
--   · une contrainte imposant la cohérence des trois origines EN BASE.
--
-- Elle ne crée PAS le module Partenariats : ni écran de gestion, ni CRUD, ni
-- permission nouvelle. Les quatre permissions `parties.partners.*` existent
-- déjà au catalogue depuis la migration 007, et la règle de numérotation
-- `PAR-000001` depuis la migration 005 : les deux sont réutilisées telles
-- quelles. Le module complet relèvera d'une étape dédiée.
-- =============================================================================

-- --- Statut d'un partenariat ------------------------------------------------
-- Aligné sur celui des fournisseurs (05_Regles_Metier/04_Fournisseurs.md §6) :
-- un partenariat se suspend et s'archive, il ne se supprime pas.
do $$ begin
  create type public.partner_status as enum ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');
exception when duplicate_object then null; end $$;


-- --- Partenaires -------------------------------------------------------------

create table public.partners (
  id                   uuid primary key default gen_random_uuid(),

  -- PAR-000001, produit par public.next_number('partner') (DEC-005).
  partner_no           text        not null unique,

  legal_name           text        not null check (length(btrim(legal_name)) > 0),
  trade_name           text,
  contact_name         text,

  -- Le téléphone reste facultatif, contrairement aux clients (DEC-021 §4) et
  -- aux fournisseurs : la structure est délibérément minimale, et aucune
  -- interface de saisie n'existe encore pour en garantir le renseignement.
  phone                text,
  email                text,
  address              text,
  city                 text,
  country              text,
  registration_number  text,

  status               public.partner_status not null default 'ACTIVE',
  status_reason        text,
  status_changed_at    timestamptz,
  status_changed_by    uuid references public.app_users (id) on delete set null,

  notes                text,

  created_at           timestamptz not null default now(),
  created_by           uuid references public.app_users (id) on delete set null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.app_users (id) on delete set null
);

comment on table public.partners is
  'Partenaires d''ADIKOM. Structure minimale : elle permet de rattacher un véhicule, pas de gérer un partenariat.';
comment on column public.partners.partner_no is
  'Identifiant interne PAR-000001. Généré côté serveur, jamais saisi (DEC-005).';

create index partners_legal_name_idx on public.partners (lower(legal_name));
create index partners_status_idx     on public.partners (status);

create trigger partners_set_updated_at
  before update on public.partners
  for each row execute function public.fn_set_updated_at();

create trigger partners_audit
  after insert or update on public.partners
  for each row execute function public.fn_audit_row('parties');

-- Un partenaire porteur d'un rattachement ne se supprime pas : il s'archive.
create trigger partners_no_delete
  before delete on public.partners
  for each row execute function public.fn_forbid_delete();


-- --- Rattachement du véhicule -------------------------------------------------

alter table public.vehicles
  add column if not exists partner_id uuid references public.partners (id) on delete restrict;

comment on column public.vehicles.partner_id is
  'Partenaire mettant le véhicule à disposition. Renseigné si et seulement si origin = PARTNERSHIP.';

create index vehicles_partner_idx on public.vehicles (partner_id);


-- --- Cohérence des trois origines, imposée par la base ------------------------
--
-- L'ancienne contrainte ne connaissait que le fournisseur. Elle est remplacée
-- par une règle couvrant les trois cas, de sorte qu'une donnée incohérente soit
-- impossible à créer — y compris en contournant l'interface
-- (CLAUDE.md §31, README §55 : les règles importantes se protègent au niveau
-- des données).
--
--   OWNED / OTHER  → aucun fournisseur, aucun partenaire
--   SUPPLIED       → fournisseur obligatoire, partenaire nul
--   PARTNERSHIP    → partenaire obligatoire, fournisseur nul

alter table public.vehicles
  drop constraint if exists vehicles_origin_supplier_coherent;

alter table public.vehicles
  add constraint vehicles_origin_attachment_coherent check (
    (origin = 'SUPPLIED'    and current_supplier_id is not null and partner_id is null)
    or (origin = 'PARTNERSHIP' and partner_id is not null and current_supplier_id is null)
    or (origin in ('OWNED', 'OTHER') and current_supplier_id is null and partner_id is null)
  );


-- --- Changement d'origine, atomique ------------------------------------------
--
-- La fonction existante ne savait traiter que le fournisseur : sélectionner
-- « Partenariat » depuis la fiche d'un véhicule aurait désormais buté sur la
-- contrainte ci-dessus. Elle est étendue au partenaire, afin que le seul
-- chemin de changement d'origine reste cohérent et indivisible.
--
-- L'historique daté (`vehicle_supplier_history`) demeure propre aux
-- fournisseurs : c'est de lui que dépendront les imputations de maintenance
-- (§60). Un historique équivalent pour les partenaires relèvera du module
-- Partenariats, avec les règles métier qui l'accompagneront.

drop function if exists public.set_vehicle_supplier(uuid, uuid, public.vehicle_origin, date, text);

create or replace function public.set_vehicle_attachment(
  p_vehicle_id   uuid,
  p_origin       public.vehicle_origin,
  p_supplier_id  uuid default null,
  p_partner_id   uuid default null,
  p_effective_on date default current_date,
  p_reason       text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_supplier uuid;
  v_partner  uuid;
  v_status   public.vehicle_status;
  v_state    text;
begin
  -- Cohérence des arguments, contrôlée avant toute écriture afin de renvoyer un
  -- message compréhensible plutôt qu'une violation de contrainte.
  if p_origin = 'SUPPLIED' and p_supplier_id is null then
    raise exception 'Un véhicule fourni doit désigner son fournisseur.'
      using errcode = 'check_violation';
  end if;

  if p_origin = 'PARTNERSHIP' and p_partner_id is null then
    raise exception 'Un véhicule en partenariat doit désigner son partenaire.'
      using errcode = 'check_violation';
  end if;

  -- Les rattachements sans objet sont ignorés plutôt que refusés : passer un
  -- fournisseur avec une origine « Propriété ADIKOM » est une incohérence
  -- d'appel, pas une intention.
  if p_origin <> 'SUPPLIED'    then p_supplier_id := null; end if;
  if p_origin <> 'PARTNERSHIP' then p_partner_id  := null; end if;

  select current_supplier_id, partner_id, status
    into v_supplier, v_partner, v_status
  from public.vehicles
  where id = p_vehicle_id
  for update;

  if not found then
    raise exception 'Véhicule introuvable.' using errcode = 'no_data_found';
  end if;

  if v_status = 'RETIRED' then
    raise exception
      'Opération refusée : un véhicule retiré du parc ne peut plus changer de rattachement.'
      using errcode = 'check_violation';
  end if;

  -- Seul un tiers actif peut porter une nouvelle opération
  -- (05_Regles_Metier/04_Fournisseurs.md §6 et §7).
  if p_supplier_id is not null then
    select status::text into v_state from public.suppliers where id = p_supplier_id;
    if v_state is null then
      raise exception 'Fournisseur introuvable.' using errcode = 'no_data_found';
    end if;
    if v_state <> 'ACTIVE' then
      raise exception
        'Opération refusée : ce fournisseur n''est pas actif et ne peut pas recevoir de nouveau véhicule.'
        using errcode = 'check_violation';
    end if;
  end if;

  if p_partner_id is not null then
    select status::text into v_state from public.partners where id = p_partner_id;
    if v_state is null then
      raise exception 'Partenaire introuvable.' using errcode = 'no_data_found';
    end if;
    if v_state <> 'ACTIVE' then
      raise exception
        'Opération refusée : ce partenaire n''est pas actif et ne peut pas recevoir de nouveau véhicule.'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_supplier is not distinct from p_supplier_id
     and v_partner is not distinct from p_partner_id
  then
    return;                       -- aucun changement réel : ne rien historiser
  end if;

  -- Historique fournisseur : clôture de la période en cours, puis ouverture de
  -- la nouvelle lorsqu'un fournisseur est désigné.
  if v_supplier is distinct from p_supplier_id then
    update public.vehicle_supplier_history
       set ended_on = p_effective_on,
           reason   = coalesce(reason, p_reason)
     where vehicle_id = p_vehicle_id
       and ended_on is null;

    if p_supplier_id is not null then
      insert into public.vehicle_supplier_history
        (vehicle_id, supplier_id, started_on, reason, created_by)
      values
        (p_vehicle_id, p_supplier_id, p_effective_on, p_reason, public.current_actor());
    end if;
  end if;

  update public.vehicles
     set current_supplier_id = p_supplier_id,
         partner_id          = p_partner_id,
         origin              = p_origin
   where id = p_vehicle_id;
end;
$$;

comment on function public.set_vehicle_attachment is
  'Change l''origine d''un véhicule et son rattachement — fournisseur ou partenaire — en une seule opération (§59, §60).';


-- --- Sécurité au niveau des données -------------------------------------------
-- Deuxième barrière de DEC-011, sur les permissions déjà au catalogue.

revoke all on public.partners from anon;
revoke delete on public.partners from authenticated;

alter table public.partners enable row level security;

-- La lecture est ouverte à qui consulte le parc : le partenaire rattaché à un
-- véhicule est une information de la fiche véhicule. Sans cela, la fiche
-- afficherait un rattachement vide sans que rien ne l'explique.
create policy partners_select on public.partners
  for select to authenticated
  using (
    public.has_permission('parties.partners.view')
    or public.has_permission('rental.fleet.view')
  );

create policy partners_insert on public.partners
  for insert to authenticated
  with check (public.has_permission('parties.partners.create'));

create policy partners_update on public.partners
  for update to authenticated
  using (
    public.has_permission('parties.partners.update')
    or public.has_permission('parties.partners.archive')
  )
  with check (
    public.has_permission('parties.partners.update')
    or public.has_permission('parties.partners.archive')
  );

-- Aucune policy DELETE : un partenaire s'archive (CLAUDE.md §22).


-- --- Droits d'exécution --------------------------------------------------------
-- DEC-022 : un droit se retire à chaque source qui l'accorde — PUBLIC et anon.

revoke execute on function public.set_vehicle_attachment(
  uuid, public.vehicle_origin, uuid, uuid, date, text
) from public;
revoke execute on function public.set_vehicle_attachment(
  uuid, public.vehicle_origin, uuid, uuid, date, text
) from anon;
grant execute on function public.set_vehicle_attachment(
  uuid, public.vehicle_origin, uuid, uuid, date, text
) to authenticated, service_role;
