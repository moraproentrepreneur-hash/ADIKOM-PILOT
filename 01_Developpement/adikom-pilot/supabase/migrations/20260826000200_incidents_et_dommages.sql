-- =============================================================================
-- ADIKOM PILOT — 038 · Incidents et dommages
-- Étape 2.4 (DEC-021), LOT 1 — arbitrages ADIKOM du 26 août 2026
--
-- CE QUE CETTE MIGRATION POSE
--
-- Le premier maillon de la chaîne « Dommages → Incidents → Maintenance →
-- Imputation » (Workflow 05 §3.1 : Retour → Incident → Maintenance).
--
-- Jusqu'ici, un dommage n'était pas une donnée. `rental_inspections` porte une
-- colonne `preexisting_damages` EN TEXTE, remplie au départ comme au retour.
-- L'écran de contrôle les oppose correctement, mais on ne peut ni compter les
-- dommages, ni les suivre d'une location à l'autre, ni les rattacher à la
-- maintenance qui les réparera. C'est ce que ces trois tables corrigent.
--
-- CE QU'ELLE NE FAIT PAS — et ce n'est pas un oubli
--
--   · AUCUN MONTANT. Ni coût de dommage, ni barème, ni franchise, ni
--     refacturation. Ces règles n'existent pas (DEC-008, toujours ouverte), et
--     le système signale ce qui n'est pas configuré plutôt que de l'inventer.
--   · AUCUNE ÉCRITURE DANS `vehicle_occupations`. Un incident ne bloque pas le
--     calendrier : seule une maintenance immobilisante le fera, au LOT 2, par
--     la valeur `MAINTENANCE` que `occupation_source` prévoit depuis la
--     migration 013.
--   · AUCUNE MAINTENANCE CRÉÉE AUTOMATIQUEMENT. Workflow 05 §44 pose le
--     principe pour l'imputation ; il vaut identiquement ici. Constater un
--     incident et décider d'une intervention sont deux actes distincts.
--   · AUCUNE PERMISSION NOUVELLE. `rental.incidents.view`, `.create` et
--     `.update` existent depuis la migration 025. Le catalogue reste à 152.
--   · AUCUNE REPRISE DES TEXTES EXISTANTS. `preexisting_damages` et
--     `observations` restent tels quels, intacts et non réinterprétés :
--     convertir automatiquement une phrase en dommages structurés produirait
--     des données que personne n'a saisies.
--
-- CE QU'ELLE RÉUTILISE, SANS LE REDÉFINIR
--
--   · `next_number()` et la table `numbering_rules` (DEC-005) ;
--   · `fn_set_updated_at`, `fn_audit_row`, `fn_forbid_delete`, `current_actor` ;
--   · le bucket PRIVÉ `vehicle-documents` et son accès par URL signée
--     (migration 019, DEC-025 §f).
-- =============================================================================


-- --- Numérotation --------------------------------------------------------------
--
-- INC-2026-000001 : même forme que `reservation` (RES), `rental` (LOC) et
-- `maintenance` (MNT) — préfixe, année, remise à zéro annuelle. Les
-- référentiels permanents (client, fournisseur, véhicule) n'ont pas d'année ;
-- les objets datés en portent une (DEC-021 §1). Un incident est daté.
--
-- La règle est INSÉRÉE, pas codée en dur : le format reste modifiable depuis
-- les paramètres, sans redéploiement.

insert into public.numbering_rules
  (entity_key, label, prefix, include_year, padding, reset_yearly)
values
  ('incident', 'Incident', 'INC', true, 6, true)
on conflict (entity_key) do nothing;


-- --- Types ---------------------------------------------------------------------

-- Module 05 §39 énumère les cas rencontrés par ADIKOM. `OTHER` existe pour ne
-- pas contraindre un exploitant à ranger un événement réel dans une case fausse.
do $$ begin
  create type public.incident_kind as enum (
    'BREAKDOWN',      -- Panne
    'ACCIDENT',       -- Accident
    'FLAT_TYRE',      -- Crevaison
    'MECHANICAL',     -- Problème mécanique
    'ELECTRICAL',     -- Problème électrique
    'DOCUMENT_LOSS',  -- Perte d'un document
    'OTHER'           -- Autre incident
  );
exception when duplicate_object then null; end $$;

-- Arbitrage ADIKOM du 26/08/2026 : OUVERT → EN_TRAITEMENT → CLOS, plus ANNULE.
-- Clos et annulé sont TERMINAUX, comme les états de fin de DEC-006 : un
-- incident rouvert serait indiscernable d'un incident jamais clos dans
-- l'historique. Un nouvel incident se déclare.
do $$ begin
  create type public.incident_status as enum (
    'OPEN',         -- Ouvert
    'IN_PROGRESS',  -- En traitement
    'CLOSED',       -- Clos
    'CANCELLED'     -- Annulé
  );
exception when duplicate_object then null; end $$;

-- Périmètre MVP §10.9 cite la gravité sans en fixer l'échelle. Trois crans
-- suffisent à trier ce qui attend de ce qui ne peut pas attendre, et n'ont
-- AUCUN effet financier : ils ne commandent ni coût, ni imputation.
do $$ begin
  create type public.damage_severity as enum (
    'MINOR',     -- Léger
    'MODERATE',  -- Moyen
    'MAJOR'      -- Important
  );
exception when duplicate_object then null; end $$;

-- Arbitrage ADIKOM du 26/08/2026 : CONSTAT SEUL.
--
-- Désigner un responsable ne déclenche rien — ni imputation, ni facturation,
-- ni écriture financière. `UNDETERMINED` est la valeur par défaut, et elle est
-- légitime : au moment du constat, la responsabilité est souvent inconnue, et
-- forcer un choix produirait une donnée fausse.
do $$ begin
  create type public.damage_responsibility as enum (
    'CLIENT',
    'ADIKOM',
    'SUPPLIER',
    'UNDETERMINED'
  );
exception when duplicate_object then null; end $$;


-- --- Transitions, imposées par la base -----------------------------------------
--
-- Même dispositif qu'au cycle d'exploitation (DEC-025 §k) : une permission dit
-- qui peut agir, une transition dit ce qui a un sens. Un appel direct à l'API,
-- muni de `rental.incidents.update`, ne peut pas pour autant ressusciter un
-- incident clos.

create or replace function public.fn_incident_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.incident_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'OPEN'        then array['IN_PROGRESS','CLOSED','CANCELLED']::public.incident_status[]
    when 'IN_PROGRESS' then array['CLOSED','CANCELLED']::public.incident_status[]
    -- Clos, annulé : états terminaux.
    else array[]::public.incident_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition d''incident refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_incident_status_transition is
  'Impose OUVERT → EN_TRAITEMENT → CLOS, et l''annulation depuis les états non terminaux.';


-- Cohérence des rattachements.
--
-- Un incident cite jusqu'à trois objets : un véhicule, une location, un état
-- des lieux. Rien n'empêcherait, sans ce contrôle, de rattacher l'état des
-- lieux d'une AUTRE location, ou une location portant sur un AUTRE véhicule.
-- Le dossier serait alors incohérent, et personne ne s'en apercevrait avant
-- d'avoir à s'en servir.
create or replace function public.fn_incident_coherence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rental_vehicle    uuid;
  v_inspection_rental uuid;
begin
  if new.rental_id is not null then
    select vehicle_id into v_rental_vehicle
    from public.rentals where id = new.rental_id;

    if v_rental_vehicle is distinct from new.vehicle_id then
      raise exception
        'Incohérence : cette location ne porte pas sur le véhicule désigné.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.inspection_id is not null then
    if new.rental_id is null then
      raise exception
        'Incohérence : un état des lieux ne se rattache qu''avec sa location.'
        using errcode = 'check_violation';
    end if;

    select rental_id into v_inspection_rental
    from public.rental_inspections where id = new.inspection_id;

    if v_inspection_rental is distinct from new.rental_id then
      raise exception
        'Incohérence : cet état des lieux appartient à une autre location.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_incident_coherence is
  'Vérifie que véhicule, location et état des lieux d''un incident désignent bien le même dossier.';


-- --- Incidents -----------------------------------------------------------------

create table public.vehicle_incidents (
  id             uuid        primary key default gen_random_uuid(),

  -- INC-2026-000001 (DEC-005, convention des objets datés).
  incident_no    text        not null unique,

  -- Le véhicule est le SEUL rattachement obligatoire : Workflow 05 §3.2 prévoit
  -- une panne survenue hors de toute location.
  vehicle_id     uuid        not null references public.vehicles (id) on delete restrict,

  -- Location et état des lieux : facultatifs, et cohérents lorsqu'ils sont
  -- présents (`fn_incident_coherence`).
  rental_id      uuid        references public.rentals (id) on delete restrict,
  inspection_id  uuid        references public.rental_inspections (id) on delete restrict,

  kind           public.incident_kind   not null,
  status         public.incident_status not null default 'OPEN',

  occurred_at    timestamptz not null default now(),
  description    text        not null,

  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  created_at     timestamptz not null default now(),
  created_by     uuid        references public.app_users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  updated_by     uuid        references public.app_users (id) on delete set null,

  constraint incidents_description_not_blank check (btrim(description) <> '')
);

comment on table public.vehicle_incidents is
  'Événement survenu sur un véhicule (Module 05 §39). Constat : aucun montant, aucune immobilisation, aucune maintenance déclenchée.';
comment on column public.vehicle_incidents.rental_id is
  'Location concernée, lorsque l''incident survient en exploitation. Nul pour une panne hors location (Workflow 05 §3.2).';
comment on column public.vehicle_incidents.inspection_id is
  'État des lieux d''où provient le constat. Exige la location correspondante.';

create index vehicle_incidents_vehicle_idx  on public.vehicle_incidents (vehicle_id, occurred_at desc);
create index vehicle_incidents_rental_idx   on public.vehicle_incidents (rental_id) where rental_id is not null;
create index vehicle_incidents_status_idx   on public.vehicle_incidents (status);

create trigger vehicle_incidents_updated_at
  before update on public.vehicle_incidents
  for each row execute function public.fn_set_updated_at();

create trigger vehicle_incidents_transition
  before update on public.vehicle_incidents
  for each row execute function public.fn_incident_status_transition();

create trigger vehicle_incidents_coherence
  before insert or update on public.vehicle_incidents
  for each row execute function public.fn_incident_coherence();

create trigger vehicle_incidents_audit
  after insert or update on public.vehicle_incidents
  for each row execute function public.fn_audit_row('rental');

create trigger vehicle_incidents_no_delete
  before delete on public.vehicle_incidents
  for each row execute function public.fn_forbid_delete();


-- --- Dommages ------------------------------------------------------------------
--
-- UNE ENTITÉ À PART ENTIÈRE, pas un type d'incident (arbitrage ADIKOM du
-- 26/08/2026). Un incident en porte autant qu'il en a causé : un accident
-- endommage rarement un seul élément, et les ranger dans une phrase unique
-- reviendrait à retrouver le texte libre que ce lot remplace.

create table public.incident_damages (
  id              uuid primary key default gen_random_uuid(),
  incident_id     uuid not null references public.vehicle_incidents (id) on delete cascade,

  -- Périmètre MVP §10.9 : emplacement, description, gravité, responsabilité.
  location        text not null,
  description     text,
  severity        public.damage_severity        not null default 'MINOR',
  responsibility  public.damage_responsibility  not null default 'UNDETERMINED',

  /*
   * PRÉEXISTANT OU NOUVEAU — la distinction la plus coûteuse du cycle.
   *
   * Module 05 §31 : un dommage relevé au DÉPART ne peut pas être reproché au
   * client. L'écran de contrôle de l'Étape 2.3 opposait déjà les deux, mais en
   * texte. Ici, la distinction est portée par la donnée : elle survivra à la
   * location, et la maintenance saura ce qu'elle répare.
   */
  is_preexisting  boolean not null default false,

  created_at      timestamptz not null default now(),
  created_by      uuid references public.app_users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.app_users (id) on delete set null,

  constraint damages_location_not_blank check (btrim(location) <> ''),

  -- Permet à une photo de désigner un dommage sans pouvoir désigner celui d'un
  -- autre incident : la clé composée ci-dessous s'y appuie.
  unique (id, incident_id)
);

comment on table public.incident_damages is
  'Dommage constaté dans le cadre d''un incident. Aucun coût : les barèmes ne sont pas définis (DEC-008).';
comment on column public.incident_damages.is_preexisting is
  'Vrai si le dommage était déjà présent au départ. Module 05 §31 : il ne peut pas être imputé au client.';
comment on column public.incident_damages.responsibility is
  'Responsabilité CONSTATÉE. Aucun effet financier, aucune imputation automatique (arbitrage du 26/08/2026).';

create index incident_damages_incident_idx on public.incident_damages (incident_id);

create trigger incident_damages_updated_at
  before update on public.incident_damages
  for each row execute function public.fn_set_updated_at();

create trigger incident_damages_audit
  after insert or update on public.incident_damages
  for each row execute function public.fn_audit_row('rental');

create trigger incident_damages_no_delete
  before delete on public.incident_damages
  for each row execute function public.fn_forbid_delete();


-- --- Photos --------------------------------------------------------------------
--
-- Même dispositif que les photos d'état des lieux (DEC-025 §f) : le bucket
-- `vehicle-documents` reste PRIVÉ et sans policy, l'accès passe par une action
-- serveur qui vérifie la permission puis délivre une URL signée de courte
-- durée. AUCUNE URL permanente n'est stockée — seulement un chemin.
--
-- Préfixe `incidents/{incidentId}/`, distinct de `inspections/` et de
-- `{vehicleId}/`. Aucun des trois ne peut entrer en collision : les deux
-- premiers sont des mots, le troisième un UUID.

create table public.incident_photos (
  id            uuid        primary key default gen_random_uuid(),
  incident_id   uuid        not null references public.vehicle_incidents (id) on delete cascade,

  -- Photo d'un dommage précis, ou de l'incident dans son ensemble.
  damage_id     uuid,

  storage_path  text        not null,
  file_name     text        not null,
  file_size     bigint      check (file_size is null or file_size >= 0),
  mime_type     text,
  caption       text,

  -- Une photo déposée par erreur se retire, elle ne se supprime pas
  -- (CLAUDE.md §22).
  is_archived   boolean     not null default false,

  created_at    timestamptz not null default now(),
  created_by    uuid        references public.app_users (id) on delete set null,

  -- La clé COMPOSÉE est le point important : elle rend structurellement
  -- impossible qu'une photo désigne le dommage d'un autre incident. Une simple
  -- référence à `incident_damages (id)` l'aurait permis.
  constraint incident_photos_damage_fkey
    foreign key (damage_id, incident_id)
    references public.incident_damages (id, incident_id) on delete cascade
);

comment on table public.incident_photos is
  'Photos d''un incident. `storage_path` désigne un objet du bucket PRIVÉ vehicle-documents ; aucune URL n''est conservée.';
comment on column public.incident_photos.storage_path is
  'Chemin sous le préfixe incidents/{incidentId}/. Jamais exposé au navigateur (DEC-025 §f).';

create index incident_photos_incident_idx
  on public.incident_photos (incident_id)
  where not is_archived;

create trigger incident_photos_audit
  after insert or update on public.incident_photos
  for each row execute function public.fn_audit_row('rental');

create trigger incident_photos_no_delete
  before delete on public.incident_photos
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- OPÉRATION ATOMIQUE
--
-- Déclarer un incident, c'est écrire dans deux tables et consommer un numéro.
-- Confier cet enchaînement à l'application reviendrait à espérer qu'il ne soit
-- jamais interrompu entre les deux — laissant sinon un incident sans ses
-- dommages, indiscernable d'un incident qui n'en aurait causé aucun.
--
-- Même raisonnement que `start_rental` (migration 035).
-- =============================================================================

create or replace function public.create_incident(
  p_vehicle_id    uuid,
  p_kind          public.incident_kind,
  p_description   text,
  p_occurred_at   timestamptz default now(),
  p_rental_id     uuid    default null,
  p_inspection_id uuid    default null,
  -- [{ location, description, severity, responsibility, isPreexisting }, …]
  p_damages       jsonb   default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_no     text;
  v_damage jsonb;
begin
  if p_vehicle_id is null then
    raise exception 'Un incident se rattache obligatoirement à un véhicule.'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_description), '') = '' then
    raise exception 'La description de l''incident est obligatoire.'
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('incident');

  insert into public.vehicle_incidents
    (incident_no, vehicle_id, rental_id, inspection_id, kind,
     occurred_at, description, created_by, updated_by)
  values
    (v_no, p_vehicle_id, p_rental_id, p_inspection_id, p_kind,
     coalesce(p_occurred_at, now()), btrim(p_description),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  for v_damage in select * from jsonb_array_elements(coalesce(p_damages, '[]'::jsonb))
  loop
    -- Un dommage sans emplacement ne décrit rien : il est écarté plutôt
    -- qu'enregistré vide.
    continue when coalesce(btrim(v_damage ->> 'location'), '') = '';

    insert into public.incident_damages
      (incident_id, location, description, severity, responsibility,
       is_preexisting, created_by, updated_by)
    values
      (v_id,
       btrim(v_damage ->> 'location'),
       nullif(btrim(coalesce(v_damage ->> 'description', '')), ''),
       coalesce((v_damage ->> 'severity')::public.damage_severity, 'MINOR'),
       coalesce((v_damage ->> 'responsibility')::public.damage_responsibility, 'UNDETERMINED'),
       coalesce((v_damage ->> 'isPreexisting')::boolean, false),
       public.current_actor(), public.current_actor());
  end loop;

  return v_id;
end;
$$;

comment on function public.create_incident is
  'Déclare un incident et ses dommages en une seule opération. Ne crée NI maintenance, NI occupation, NI montant.';


-- --- Sécurité au niveau des données -----------------------------------------------
-- Deuxième barrière de DEC-011, sur les permissions du catalogue.
--
-- Trois permissions seulement, et aucune nouvelle : `rental.incidents.view`,
-- `.create` et `.update` existent depuis la migration 025. Le changement
-- d'état relève de `.update` — arbitrage ADIKOM du 26/08/2026, aucune
-- permission `.close` n'est créée.
--
-- Comme ailleurs, les policies d'écriture acceptent l'une OU l'autre : c'est la
-- garde serveur qui exige celle correspondant à l'opération demandée.

revoke all    on public.vehicle_incidents from anon;
revoke all    on public.incident_damages  from anon;
revoke all    on public.incident_photos   from anon;

revoke delete on public.vehicle_incidents from authenticated;
revoke delete on public.incident_damages  from authenticated;
revoke delete on public.incident_photos   from authenticated;

alter table public.vehicle_incidents enable row level security;
alter table public.incident_damages  enable row level security;
alter table public.incident_photos   enable row level security;

-- --- Incidents
create policy vehicle_incidents_select on public.vehicle_incidents
  for select to authenticated
  using (public.has_permission('rental.incidents.view'));

create policy vehicle_incidents_insert on public.vehicle_incidents
  for insert to authenticated
  with check (public.has_permission('rental.incidents.create'));

create policy vehicle_incidents_update on public.vehicle_incidents
  for update to authenticated
  using (public.has_permission('rental.incidents.update'))
  with check (public.has_permission('rental.incidents.update'));

-- --- Dommages
create policy incident_damages_select on public.incident_damages
  for select to authenticated
  using (public.has_permission('rental.incidents.view'));

create policy incident_damages_insert on public.incident_damages
  for insert to authenticated
  with check (
    public.has_permission('rental.incidents.create')
    or public.has_permission('rental.incidents.update')
  );

create policy incident_damages_update on public.incident_damages
  for update to authenticated
  using (public.has_permission('rental.incidents.update'))
  with check (public.has_permission('rental.incidents.update'));

-- --- Photos
create policy incident_photos_select on public.incident_photos
  for select to authenticated
  using (public.has_permission('rental.incidents.view'));

create policy incident_photos_insert on public.incident_photos
  for insert to authenticated
  with check (
    public.has_permission('rental.incidents.create')
    or public.has_permission('rental.incidents.update')
  );

create policy incident_photos_update on public.incident_photos
  for update to authenticated
  using (public.has_permission('rental.incidents.update'))
  with check (public.has_permission('rental.incidents.update'));
