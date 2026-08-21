-- =============================================================================
-- ADIKOM PILOT — 015 · Parc automobile
-- Étape 2.2 (DEC-021) — Catégories · Véhicules · Fournisseur · Documents
--
-- Règles appliquées :
--   · Chaque véhicule possède une fiche unique et un identifiant sans ambiguïté
--     (05_Regles_Metier/02_Parc_Automobile.md §79.1 et §79.2).
--   · Un véhicule ADIKOM se distingue d'un véhicule fournisseur (§10) : cette
--     distinction commande le traitement des dépenses de maintenance.
--   · Un véhicule, un fournisseur actif ; tout changement est historisé et sans
--     effet rétroactif (§59, §60, §62).
--   · Un véhicule exploité ne se supprime pas : il se retire et s'archive
--     (§45, §47, §79.7).
--   · Le statut décrit une situation ; la disponibilité se calcule depuis le
--     calendrier (§67 et §69) — voir la migration 016.
-- =============================================================================

-- --- Catégories de véhicules ------------------------------------------------
-- 03_Modules/05_Gestion_de_Location.md §10 · Règles parc §7.
-- Une catégorie porte des caractéristiques tarifaires (§10) : elle est donc une
-- cible possible de tarif standard comme de tarif préférentiel (migration 017).

create table public.vehicle_categories (
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

comment on table public.vehicle_categories is
  'Catégories du parc (citadine, berline, SUV, utilitaire, minibus…). Définies par ADIKOM selon le parc réel.';

create unique index vehicle_categories_label_unique_idx
  on public.vehicle_categories (lower(label));

create trigger vehicle_categories_set_updated_at
  before update on public.vehicle_categories
  for each row execute function public.fn_set_updated_at();

create trigger vehicle_categories_audit
  after insert or update or delete on public.vehicle_categories
  for each row execute function public.fn_audit_row('rental');


-- --- Véhicules --------------------------------------------------------------

create table public.vehicles (
  id                 uuid primary key default gen_random_uuid(),

  -- Identifiant interne VEH-000001 (DEC-005 / DEC-021). À ne pas confondre avec
  -- l'immatriculation, le numéro de châssis ou la référence fournisseur (§3).
  vehicle_no         text        not null unique,

  -- Immatriculation : présente « lorsqu'elle est applicable » (§4), donc
  -- facultative, mais unique dès qu'elle est renseignée.
  plate              text,

  brand              text        not null check (length(btrim(brand)) > 0),
  model              text        not null check (length(btrim(model)) > 0),
  model_year         int         check (model_year between 1950 and 2100),
  category_id        uuid        not null references public.vehicle_categories (id) on delete restrict,

  -- Caractéristiques techniques (§8), distinctes des informations commerciales.
  color              text,
  fuel               public.fuel_type,
  transmission       public.transmission_type,
  seats              int         check (seats is null or seats between 1 and 100),
  doors              int         check (doors is null or doors between 1 and 10),

  -- Kilométrage (§25). La cohérence d'un nouveau relevé (§26) est contrôlée à
  -- la saisie, avec justification : le document demande de « signaler l'anomalie
  -- ou demander une justification », pas d'interdire.
  initial_mileage    bigint      check (initial_mileage is null or initial_mileage >= 0),
  mileage            bigint      not null default 0 check (mileage >= 0),

  -- Origine et rattachement fournisseur (§9, §10, §11).
  origin             public.vehicle_origin not null default 'OWNED',
  current_supplier_id uuid references public.suppliers (id) on delete restrict,

  status             public.vehicle_status not null default 'AVAILABLE',
  status_reason      text,
  status_changed_at  timestamptz,
  status_changed_by  uuid references public.app_users (id) on delete set null,

  -- Cycle de vie dans le parc (§44, §45, §46).
  entry_date         date,
  exit_date          date,
  exit_reason        text,

  notes              text,

  created_at         timestamptz not null default now(),
  created_by         uuid references public.app_users (id) on delete set null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.app_users (id) on delete set null,

  -- Un véhicule fourni a un fournisseur ; un véhicule ADIKOM n'en a pas (§10).
  constraint vehicles_origin_supplier_coherent check (
    (origin = 'SUPPLIED' and current_supplier_id is not null)
    or (origin <> 'SUPPLIED' and current_supplier_id is null)
  ),

  -- Sortie du parc : le véhicule n'est pas supprimé, il passe en état
  -- historique (§45). Les deux informations vont donc toujours ensemble.
  constraint vehicles_exit_coherent check (
    (exit_date is null and status <> 'RETIRED')
    or (exit_date is not null and status = 'RETIRED')
  ),

  constraint vehicles_exit_after_entry check (
    exit_date is null or entry_date is null or exit_date >= entry_date
  )
);

comment on table  public.vehicles is
  'Référentiel central des véhicules exploités par ADIKOM (§79.15). Un véhicule exploité ne se supprime jamais.';
comment on column public.vehicles.status is
  'Situation opérationnelle. Ne vaut jamais preuve de disponibilité : celle-ci se calcule depuis les occupations (§67, §69).';
comment on column public.vehicles.origin is
  'OWNED · SUPPLIED · PARTNERSHIP · OTHER. Détermine le traitement des dépenses de maintenance (§10, §11).';

-- Unicité de l'immatriculation, insensible à la casse et aux espaces.
create unique index vehicles_plate_unique_idx
  on public.vehicles (upper(replace(plate, ' ', '')))
  where plate is not null;

create index vehicles_category_idx  on public.vehicles (category_id);
create index vehicles_supplier_idx  on public.vehicles (current_supplier_id);
create index vehicles_status_idx    on public.vehicles (status);
create index vehicles_brand_idx     on public.vehicles (lower(brand), lower(model));

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.fn_set_updated_at();

create trigger vehicles_audit
  after insert or update on public.vehicles
  for each row execute function public.fn_audit_row('rental');

create trigger vehicles_no_delete
  before delete on public.vehicles
  for each row execute function public.fn_forbid_delete();


-- --- Historique du rattachement fournisseur ---------------------------------
-- §59 : un véhicule, un fournisseur actif à la fois.
-- §60 : le changement conserve ancien, nouveau, date et motif.
-- §62 : il ne modifie jamais rétroactivement les opérations passées — c'est
--       précisément le rôle de cet historique daté.

create table public.vehicle_supplier_history (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid        not null references public.vehicles (id)  on delete cascade,
  supplier_id  uuid        not null references public.suppliers (id) on delete restrict,

  started_on   date        not null,
  -- Date de fin du rattachement. Le rattachement suivant démarre ce jour-là.
  ended_on     date,
  reason       text,

  created_at   timestamptz not null default now(),
  created_by   uuid references public.app_users (id) on delete set null,

  constraint vehicle_supplier_history_period check (ended_on is null or ended_on >= started_on)
);

comment on table public.vehicle_supplier_history is
  'Périodes de rattachement d''un véhicule à un fournisseur. Permet de savoir qui fournissait le véhicule à une date donnée (§60, §62).';

-- Un seul rattachement ouvert par véhicule (§59).
create unique index vehicle_supplier_history_one_open_idx
  on public.vehicle_supplier_history (vehicle_id)
  where ended_on is null;

create index vehicle_supplier_history_supplier_idx
  on public.vehicle_supplier_history (supplier_id, started_on desc);

create trigger vehicle_supplier_history_audit
  after insert or update or delete on public.vehicle_supplier_history
  for each row execute function public.fn_audit_row('rental');


-- Changement de fournisseur, en une seule opération atomique.
--
-- SECURITY INVOKER (défaut) : les policies RLS du fournisseur et du véhicule
-- s'appliquent à l'appelant. La fonction ne contourne aucune permission, elle
-- garantit seulement que la clôture de l'ancien rattachement, l'ouverture du
-- nouveau et la mise à jour de la fiche véhicule ne peuvent pas être dissociées.
create or replace function public.set_vehicle_supplier(
  p_vehicle_id   uuid,
  p_supplier_id  uuid,
  p_origin       public.vehicle_origin,
  p_effective_on date default current_date,
  p_reason       text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_current  uuid;
  v_status   public.vehicle_status;
  v_sup_stat public.supplier_status;
begin
  if (p_origin = 'SUPPLIED') <> (p_supplier_id is not null) then
    raise exception
      'Origine et fournisseur incohérents : un véhicule fourni doit désigner un fournisseur, un véhicule ADIKOM ne doit pas en avoir.'
      using errcode = 'check_violation';
  end if;

  select current_supplier_id, status
    into v_current, v_status
  from public.vehicles
  where id = p_vehicle_id
  for update;

  if not found then
    raise exception 'Véhicule introuvable.' using errcode = 'no_data_found';
  end if;

  if v_status = 'RETIRED' then
    raise exception
      'Opération refusée : un véhicule retiré du parc ne peut plus changer de fournisseur.'
      using errcode = 'check_violation';
  end if;

  -- Seul un fournisseur actif peut porter une nouvelle opération
  -- (05_Regles_Metier/04_Fournisseurs.md §6 et §7).
  if p_supplier_id is not null then
    select status into v_sup_stat from public.suppliers where id = p_supplier_id;

    if v_sup_stat is null then
      raise exception 'Fournisseur introuvable.' using errcode = 'no_data_found';
    end if;

    if v_sup_stat <> 'ACTIVE' then
      raise exception
        'Opération refusée : ce fournisseur n''est pas actif et ne peut pas recevoir de nouveau véhicule.'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_current is not distinct from p_supplier_id then
    return;                       -- aucun changement réel : ne rien historiser
  end if;

  -- Clôture du rattachement en cours.
  update public.vehicle_supplier_history
     set ended_on = p_effective_on,
         reason   = coalesce(reason, p_reason)
   where vehicle_id = p_vehicle_id
     and ended_on is null;

  -- Ouverture du nouveau rattachement.
  if p_supplier_id is not null then
    insert into public.vehicle_supplier_history
      (vehicle_id, supplier_id, started_on, reason, created_by)
    values
      (p_vehicle_id, p_supplier_id, p_effective_on, p_reason, public.current_actor());
  end if;

  update public.vehicles
     set current_supplier_id = p_supplier_id,
         origin              = p_origin
   where id = p_vehicle_id;
end;
$$;

comment on function public.set_vehicle_supplier is
  'Change le fournisseur d''un véhicule en historisant la période précédente (§59, §60). Opération atomique.';


-- --- Documents du véhicule --------------------------------------------------
-- 03_Modules/05_Gestion_de_Location.md §15 et §16 · Règles parc §49 et §50.
-- Les fichiers résident dans un bucket Supabase privé (migration 019) ; seul le
-- chemin est stocké ici. Aucun fichier n'est accessible sans passer par le
-- serveur, qui vérifie la permission puis délivre une URL signée de courte durée.

create table public.vehicle_documents (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid        not null references public.vehicles (id) on delete cascade,

  doc_type      public.vehicle_document_type not null,
  label         text        not null check (length(btrim(label)) > 0),
  reference     text,                         -- numéro de police, de contrat…

  issued_on     date,
  expires_on    date,

  -- Fichier joint (facultatif : une échéance peut être suivie sans justificatif).
  storage_path  text,
  file_name     text,
  file_size     bigint      check (file_size is null or file_size >= 0),
  mime_type     text,

  is_archived   boolean     not null default false,
  notes         text,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint vehicle_documents_dates check (
    expires_on is null or issued_on is null or expires_on >= issued_on
  )
);

comment on table public.vehicle_documents is
  'Documents et échéances d''un véhicule (carte grise, assurance, visite technique…). Les fichiers sont dans un bucket privé.';
comment on column public.vehicle_documents.storage_path is
  'Chemin de l''objet dans le bucket privé « vehicle-documents ». Jamais exposé directement au navigateur.';

create index vehicle_documents_vehicle_idx on public.vehicle_documents (vehicle_id, doc_type);
create index vehicle_documents_expiry_idx
  on public.vehicle_documents (expires_on)
  where expires_on is not null and not is_archived;

create trigger vehicle_documents_set_updated_at
  before update on public.vehicle_documents
  for each row execute function public.fn_set_updated_at();

create trigger vehicle_documents_audit
  after insert or update or delete on public.vehicle_documents
  for each row execute function public.fn_audit_row('rental');
