-- =============================================================================
-- ADIKOM PILOT — 031 · Cycle d'exploitation : réservations, locations, états des lieux
-- Étape 2.3 (DEC-021) — arbitrages ADIKOM du 24 août 2026 (DEC-025)
--
-- CE QUE CETTE MIGRATION POSE
--
-- Le modèle du cycle « Réservation → Contrat → Départ → Location → Retour →
-- Contrôle », et surtout les garanties que la BASE doit porter seule :
--
--   1. deux engagements ne peuvent pas se chevaucher sur un même véhicule ;
--   2. un tarif verrouillé ne bouge plus, quoi qu'il advienne de la grille ;
--   3. aucune transition de statut hors de celles prévues par DEC-006 ;
--   4. rien ne se supprime.
--
-- CE QU'ELLE NE POSE PAS
--
-- Aucun écran, aucune permission (migration 032), aucun barème financier.
-- DEC-025 : le contrôle de retour CONSTATE, il ne valorise pas. Aucun montant
-- de pénalité, de carburant ou de kilométrage n'est calculé ici — ces règles
-- n'existent pas encore (DEC-008), et le système signale ce qui n'est pas
-- configuré plutôt que d'inventer un barème.
--
-- CE QU'ELLE RÉUTILISE, SANS LE REDÉFINIR
--
--   · `vehicle_occupations` et sa contrainte d'exclusion (migration 016,
--     DEC-012) — son énumération `occupation_source` prévoyait déjà
--     `RESERVATION` et `RENTAL` ;
--   · `is_vehicle_available()` et `vehicle_calendar()` ;
--   · `resolve_pricing_rule()` et sa hiérarchie à six niveaux (DEC-002) ;
--   · `next_number()` et les règles `reservation` → `RES` et `rental` → `LOC`,
--     enregistrées depuis la migration 005 ;
--   · `fn_set_updated_at`, `fn_audit_row`, `fn_forbid_delete`, `current_actor`.
--
-- Aucun de ces mécanismes n'est reconstruit.
-- =============================================================================


-- --- Types du cycle -----------------------------------------------------------

-- DEC-006 : une réservation n'est pas une location. Deux entités, deux jeux de
-- statuts, reliés par une référence — jamais une valeur partagée.
--
-- `EXPIRED` figure dans l'énumération par fidélité à DEC-006, mais DEC-025 §a
-- décide qu'il est DÉRIVÉ de la date à l'affichage et n'est jamais écrit :
-- le projet n'a pas d'ordonnanceur, et un statut stocké qui dépendrait d'une
-- tâche non exécutée mentirait. La valeur reste disponible le jour où une
-- tâche planifiée existera.
do $$ begin
  create type public.reservation_status as enum (
    'DRAFT',       -- Brouillon
    'PENDING',     -- En attente
    'CONFIRMED',   -- Confirmée
    'PREPARING',   -- En préparation
    'CONVERTED',   -- Convertie en location
    'CANCELLED',   -- Annulée
    'EXPIRED'      -- Expirée — dérivé, jamais écrit (DEC-025 §a)
  );
exception when duplicate_object then null; end $$;

-- Même remarque pour `LATE` : dérivé de `expected_return_at` et de l'heure
-- courante, sur le fuseau `Indian/Comoro` (DEC-014, confirmé par DEC-025 §e).
do $$ begin
  create type public.rental_status as enum (
    'PREPARING',    -- En préparation
    'CONFIRMED',    -- Confirmée
    'IN_PROGRESS',  -- En cours
    'EXTENDED',     -- Prolongée
    'LATE',         -- En retard — dérivé, jamais écrit (DEC-025 §a)
    'RETURNED',     -- Retournée
    'TO_CONTROL',   -- À contrôler
    'TO_INVOICE',   -- À facturer
    'INVOICED',     -- Facturée   — Étape 2.5
    'CLOSED',       -- Clôturée   — Étape 2.5
    'CANCELLED'     -- Annulée
  );
exception when duplicate_object then null; end $$;

-- Un seul état des lieux de départ et un seul de retour par location. La forme
-- est identique des deux côtés : c'est ce qui rend la comparaison du contrôle
-- possible sans convertir quoi que ce soit (Module 05 §36).
do $$ begin
  create type public.inspection_kind as enum ('DEPARTURE', 'RETURN');
exception when duplicate_object then null; end $$;

-- Niveau de carburant, en crans. La documentation raisonne en fractions —
-- « 3/4 » au départ, « 1/2 » au retour (Module 05 §36) — et non en litres :
-- un relevé à la jauge n'a pas la précision d'un volume.
do $$ begin
  create type public.fuel_level as enum (
    'EMPTY',           -- 0
    'QUARTER',         -- 1/4
    'HALF',            -- 1/2
    'THREE_QUARTERS',  -- 3/4
    'FULL'             -- plein
  );
exception when duplicate_object then null; end $$;


-- --- Transitions de statut, imposées par la base -------------------------------
--
-- « Ne crée pas de raccourci qui permettrait de contourner les transitions
--   métier. » — arbitrage ADIKOM du 24 août 2026.
--
-- Les gardes serveur exigent la permission de l'action ; ces déclencheurs
-- exigent la COHÉRENCE de l'enchaînement. Les deux sont nécessaires : une
-- permission dit qui peut agir, une transition dit ce qui a un sens. Un appel
-- direct à l'API, muni de la bonne permission, ne peut pas pour autant faire
-- passer une location de « En préparation » à « À facturer ».

create or replace function public.fn_reservation_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.reservation_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'DRAFT'     then array['PENDING','CONFIRMED','CANCELLED']::public.reservation_status[]
    when 'PENDING'   then array['CONFIRMED','CANCELLED']::public.reservation_status[]
    when 'CONFIRMED' then array['PREPARING','CONVERTED','CANCELLED']::public.reservation_status[]
    when 'PREPARING' then array['CONVERTED','CANCELLED']::public.reservation_status[]
    -- Convertie, annulée, expirée : états terminaux.
    else array[]::public.reservation_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition de réservation refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.fn_rental_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.rental_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'PREPARING'   then array['CONFIRMED','CANCELLED']::public.rental_status[]
    when 'CONFIRMED'   then array['IN_PROGRESS','CANCELLED']::public.rental_status[]
    when 'IN_PROGRESS' then array['EXTENDED','RETURNED']::public.rental_status[]
    when 'EXTENDED'    then array['EXTENDED','RETURNED']::public.rental_status[]
    when 'RETURNED'    then array['TO_CONTROL']::public.rental_status[]
    when 'TO_CONTROL'  then array['TO_INVOICE']::public.rental_status[]
    -- À partir d'ici, l'Étape 2.5 prend le relais (DEC-025 §b).
    when 'TO_INVOICE'  then array['INVOICED']::public.rental_status[]
    when 'INVOICED'    then array['CLOSED']::public.rental_status[]
    -- Clôturée, annulée : états terminaux.
    else array[]::public.rental_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition de location refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_reservation_status_transition is
  'Impose les transitions de DEC-006 pour une réservation. Une permission dit qui peut agir ; ceci dit ce qui a un sens.';
comment on function public.fn_rental_status_transition is
  'Impose les transitions de DEC-006 pour une location, jusqu''à « À facturer » (DEC-025 §b).';


-- --- Réservations -------------------------------------------------------------

create table public.reservations (
  id                  uuid primary key default gen_random_uuid(),

  -- RES-2026-000001 — avec année et remise à zéro annuelle (DEC-005, DEC-021 §1).
  reservation_no      text        not null unique,

  client_id           uuid        not null references public.clients (id) on delete restrict,

  -- Une réservation se prend sur une catégorie OU sur un véhicule précis
  -- (Module 05 §24 et §26). La confirmation exige le véhicule : on ne bloque
  -- pas un calendrier au nom d'une catégorie.
  category_id         uuid        references public.vehicle_categories (id) on delete restrict,
  vehicle_id          uuid        references public.vehicles (id) on delete restrict,

  period              tstzrange   not null,

  -- Tarif VERROUILLÉ à la confirmation (Module 05 §21, MVP §10.4).
  -- Le montant est celui que `resolve_pricing_rule` a renvoyé — remise déjà
  -- appliquée. Une modification ultérieure de la grille ne peut plus l'atteindre :
  -- il ne s'agit pas d'une référence vers un tarif, mais d'une copie.
  locked_amount       bigint      check (locked_amount is null or locked_amount >= 0),
  locked_unit         public.pricing_unit,
  locked_rule_id      uuid        references public.pricing_rules (id) on delete set null,
  locked_source       text,
  locked_at           timestamptz,

  status              public.reservation_status not null default 'DRAFT',
  status_reason       text,
  status_changed_at   timestamptz,
  status_changed_by   uuid        references public.app_users (id) on delete set null,

  conditions          text,
  notes               text,

  created_at          timestamptz not null default now(),
  created_by          uuid        references public.app_users (id) on delete set null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid        references public.app_users (id) on delete set null,

  constraint reservations_period_bounded check (
    not isempty(period) and lower(period) is not null and upper(period) is not null
  ),

  -- Sans affectation, une réservation ne désigne rien.
  constraint reservations_assignment check (
    category_id is not null or vehicle_id is not null
  ),

  -- Le verrouillage est un tout : montant, unité et horodatage vont ensemble.
  constraint reservations_lock_coherent check (
    (locked_amount is null and locked_unit is null and locked_at is null)
    or (locked_amount is not null and locked_unit is not null and locked_at is not null)
  ),

  -- Une réservation confirmée porte NÉCESSAIREMENT son véhicule et son tarif.
  -- C'est la règle que l'écran ne doit pas être seul à garantir.
  constraint reservations_confirmed_complete check (
    status not in ('CONFIRMED', 'PREPARING', 'CONVERTED')
    or (vehicle_id is not null and locked_amount is not null)
  )
);

comment on table public.reservations is
  'Engagement sur une période. Distincte d''une location (DEC-006) : elle ne porte jamais l''état d''exécution.';
comment on column public.reservations.locked_amount is
  'Copie du tarif au moment de la confirmation, remise appliquée. Insensible à toute modification ultérieure de la grille (Module 05 §21).';

create index reservations_client_idx  on public.reservations (client_id);
create index reservations_vehicle_idx on public.reservations (vehicle_id);
create index reservations_status_idx  on public.reservations (status);
create index reservations_period_idx  on public.reservations using gist (period);

create trigger reservations_status_transition
  before update on public.reservations
  for each row execute function public.fn_reservation_status_transition();

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.fn_set_updated_at();

create trigger reservations_audit
  after insert or update on public.reservations
  for each row execute function public.fn_audit_row('rental');

create trigger reservations_no_delete
  before delete on public.reservations
  for each row execute function public.fn_forbid_delete();


-- --- Locations ----------------------------------------------------------------

create table public.rentals (
  id                  uuid primary key default gen_random_uuid(),

  -- LOC-2026-000001.
  rental_no           text        not null unique,

  -- Une location naît le plus souvent d'une réservation, mais pas toujours :
  -- un départ immédiat au comptoir n'en a pas.
  reservation_id      uuid        references public.reservations (id) on delete restrict,

  client_id           uuid        not null references public.clients (id) on delete restrict,
  -- Une location porte TOUJOURS un véhicule : c'est ce qui la distingue d'une
  -- réservation, qui peut n'avoir qu'une catégorie.
  vehicle_id          uuid        not null references public.vehicles (id) on delete restrict,

  planned_period      tstzrange   not null,
  started_at          timestamptz,
  expected_return_at  timestamptz not null,
  returned_at         timestamptz,

  -- Tarif repris de la réservation, ou résolu et verrouillé à la création.
  -- `not null` : une location ne peut pas exister sans son prix.
  locked_amount       bigint      not null check (locked_amount >= 0),
  locked_unit         public.pricing_unit not null,
  locked_rule_id      uuid        references public.pricing_rules (id) on delete set null,
  locked_source       text,
  locked_at           timestamptz not null default now(),

  status              public.rental_status not null default 'PREPARING',
  status_reason       text,
  status_changed_at   timestamptz,
  status_changed_by   uuid        references public.app_users (id) on delete set null,

  conditions          text,
  notes               text,

  created_at          timestamptz not null default now(),
  created_by          uuid        references public.app_users (id) on delete set null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid        references public.app_users (id) on delete set null,

  constraint rentals_period_bounded check (
    not isempty(planned_period) and lower(planned_period) is not null
    and upper(planned_period) is not null
  ),

  constraint rentals_return_after_start check (
    returned_at is null or started_at is null or returned_at >= started_at
  ),

  -- Une location en cours est PARTIE. Une location retournée est RENTRÉE.
  -- Les deux faits ne peuvent pas manquer à leur statut.
  constraint rentals_started_when_running check (
    status not in ('IN_PROGRESS','EXTENDED','LATE','RETURNED','TO_CONTROL','TO_INVOICE','INVOICED','CLOSED')
    or started_at is not null
  ),
  constraint rentals_returned_when_back check (
    status not in ('RETURNED','TO_CONTROL','TO_INVOICE','INVOICED','CLOSED')
    or returned_at is not null
  )
);

comment on table public.rentals is
  'Exécution d''un contrat de location. Ses dates réelles sont distinctes des dates prévues (DEC-006).';
comment on column public.rentals.expected_return_at is
  'Retour attendu. Une prolongation le déplace ; l''avant / après est conservé par le journal d''audit (DEC-025 §d).';

create index rentals_client_idx      on public.rentals (client_id);
create index rentals_vehicle_idx     on public.rentals (vehicle_id);
create index rentals_status_idx      on public.rentals (status);
create index rentals_reservation_idx on public.rentals (reservation_id);
create index rentals_period_idx      on public.rentals using gist (planned_period);
-- Le Tableau de location interroge les départs et retours du jour (Lot 7).
create index rentals_expected_return_idx on public.rentals (expected_return_at);

create trigger rentals_status_transition
  before update on public.rentals
  for each row execute function public.fn_rental_status_transition();

create trigger rentals_set_updated_at
  before update on public.rentals
  for each row execute function public.fn_set_updated_at();

create trigger rentals_audit
  after insert or update on public.rentals
  for each row execute function public.fn_audit_row('rental');

create trigger rentals_no_delete
  before delete on public.rentals
  for each row execute function public.fn_forbid_delete();


-- --- États des lieux -----------------------------------------------------------
--
-- UNE SEULE TABLE POUR LE DÉPART ET LE RETOUR.
--
-- Le contrôle compare le kilométrage, le carburant et les états : si les deux
-- relevés vivaient dans deux tables, la comparaison porterait sur des colonnes
-- que rien n'obligerait à rester identiques. Elles auraient divergé à la
-- première correction.

create table public.rental_inspections (
  id                   uuid primary key default gen_random_uuid(),
  rental_id            uuid        not null references public.rentals (id) on delete cascade,

  kind                 public.inspection_kind not null,
  performed_at         timestamptz not null default now(),

  mileage              int         check (mileage is null or mileage >= 0),
  fuel_level           public.fuel_level,

  exterior_condition   text,
  interior_condition   text,

  -- Les dommages DÉJÀ présents au départ, distingués de ceux constatés au
  -- retour (Module 05 §31). Cette distinction est la raison d'être du contrôle.
  preexisting_damages  text,
  observations         text,

  created_at           timestamptz not null default now(),
  created_by           uuid        references public.app_users (id) on delete set null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid        references public.app_users (id) on delete set null,

  -- Un seul départ, un seul retour.
  constraint rental_inspections_unique_kind unique (rental_id, kind)
);

comment on table public.rental_inspections is
  'État des lieux de départ ou de retour. Forme identique des deux côtés : c''est ce qui rend le contrôle comparable (Module 05 §36).';

create index rental_inspections_rental_idx on public.rental_inspections (rental_id, kind);

create trigger rental_inspections_set_updated_at
  before update on public.rental_inspections
  for each row execute function public.fn_set_updated_at();

create trigger rental_inspections_audit
  after insert or update on public.rental_inspections
  for each row execute function public.fn_audit_row('rental');

create trigger rental_inspections_no_delete
  before delete on public.rental_inspections
  for each row execute function public.fn_forbid_delete();


-- --- Photos d'état des lieux ---------------------------------------------------
--
-- Rattachées à L'ÉTAT DES LIEUX, jamais au véhicule : une photo de départ et
-- une photo de retour ne disent pas la même chose, et les confondre priverait
-- le contrôle de son objet.
--
-- Bucket existant `vehicle-documents`, préfixe `inspections/{inspectionId}/…`
-- (DEC-025). Le bucket reste privé et sans policy : l'accès passe par une
-- action serveur qui vérifie la permission, puis par une URL signée de courte
-- durée. AUCUNE URL permanente n'est stockée ici — seulement un chemin.

create table public.rental_inspection_photos (
  id             uuid        primary key default gen_random_uuid(),
  inspection_id  uuid        not null references public.rental_inspections (id) on delete cascade,

  storage_path   text        not null,
  file_name      text        not null,
  file_size      bigint      check (file_size is null or file_size >= 0),
  mime_type      text,
  caption        text,

  -- Une photo déposée par erreur se retire, elle ne se supprime pas
  -- (CLAUDE.md §22, comme `vehicle_documents.is_archived`).
  is_archived    boolean     not null default false,

  created_at     timestamptz not null default now(),
  created_by     uuid        references public.app_users (id) on delete set null
);

comment on table public.rental_inspection_photos is
  'Photos d''un état des lieux. `storage_path` désigne un objet du bucket PRIVÉ vehicle-documents ; aucune URL n''est conservée.';
comment on column public.rental_inspection_photos.storage_path is
  'Chemin sous le préfixe inspections/{inspectionId}/. Jamais exposé au navigateur (DEC-025).';

create index rental_inspection_photos_inspection_idx
  on public.rental_inspection_photos (inspection_id)
  where not is_archived;

create trigger rental_inspection_photos_audit
  after insert or update on public.rental_inspection_photos
  for each row execute function public.fn_audit_row('rental');

create trigger rental_inspection_photos_no_delete
  before delete on public.rental_inspection_photos
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- OPÉRATIONS ATOMIQUES
--
-- Ces quatre opérations touchent plusieurs tables et doivent être
-- indivisibles. Les confier à l'application reviendrait à espérer que deux
-- écritures successives ne soient jamais interrompues — et que deux
-- utilisateurs ne les lancent jamais en même temps. Même raisonnement que
-- `set_vehicle_attachment` (migration 024).
-- =============================================================================

-- --- Confirmer une réservation -------------------------------------------------
--
-- Résout le tarif, le VERROUILLE, et pose l'occupation. La contrainte
-- d'exclusion de `vehicle_occupations` est le juge de la collision : la
-- vérification préalable n'existe que pour produire un message lisible.

create or replace function public.confirm_reservation(
  p_reservation_id uuid,
  p_vehicle_id     uuid default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r          public.reservations%rowtype;
  v_vehicle  uuid;
  v_price    record;
begin
  select * into r from public.reservations where id = p_reservation_id for update;

  if not found then
    raise exception 'Réservation introuvable.' using errcode = 'no_data_found';
  end if;

  if r.status not in ('DRAFT', 'PENDING') then
    raise exception
      'Opération refusée : seule une réservation en brouillon ou en attente peut être confirmée.'
      using errcode = 'check_violation';
  end if;

  v_vehicle := coalesce(p_vehicle_id, r.vehicle_id);

  if v_vehicle is null then
    raise exception 'Confirmer une réservation exige de désigner le véhicule.'
      using errcode = 'check_violation';
  end if;

  -- Statut ET calendrier : la règle de 05_Regles_Metier/02 §67.
  if not public.is_vehicle_available(v_vehicle, r.period) then
    raise exception
      'Opération refusée : ce véhicule n''est pas disponible sur la période demandée.'
      using errcode = 'exclusion_violation';
  end if;

  -- Tarif au premier jour de la période. Aucun montant n'est inventé : sans
  -- règle applicable, la confirmation échoue plutôt que de figer un prix nul.
  select * into v_price
  from public.resolve_pricing_rule(r.client_id, v_vehicle, lower(r.period)::date);

  if v_price.amount is null then
    raise exception
      'Opération refusée : aucun tarif applicable à ce client et à ce véhicule.'
      using errcode = 'check_violation';
  end if;

  insert into public.vehicle_occupations
    (vehicle_id, source, source_id, period, reason, created_by)
  values
    (v_vehicle, 'RESERVATION', r.id, r.period,
     'Réservation ' || r.reservation_no, public.current_actor());

  update public.reservations
     set vehicle_id        = v_vehicle,
         locked_amount     = v_price.amount,
         locked_unit       = v_price.unit,
         locked_rule_id    = v_price.rule_id,
         locked_source     = v_price.source,
         locked_at         = now(),
         status            = 'CONFIRMED',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = r.id;
end;
$$;

comment on function public.confirm_reservation is
  'Confirme une réservation : verrouille le tarif et pose l''occupation, en une seule opération (Module 05 §21, DEC-012).';


-- --- Annuler une réservation ---------------------------------------------------
--
-- « Une réservation annulée ne bloque plus la disponibilité du véhicule »
-- (Règles location §13, DEC-006). L'occupation est LIBÉRÉE, pas supprimée :
-- l'historique de ce qui a été bloqué reste lisible.

create or replace function public.cancel_reservation(
  p_reservation_id uuid,
  p_reason         text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation_id for update;

  if not found then
    raise exception 'Réservation introuvable.' using errcode = 'no_data_found';
  end if;

  if r.status not in ('DRAFT', 'PENDING', 'CONFIRMED', 'PREPARING') then
    raise exception
      'Opération refusée : cette réservation ne peut plus être annulée.'
      using errcode = 'check_violation';
  end if;

  update public.vehicle_occupations
     set is_active   = false,
         released_at = now(),
         released_by = public.current_actor()
   where source = 'RESERVATION'
     and source_id = r.id
     and is_active;

  update public.reservations
     set status            = 'CANCELLED',
         status_reason     = p_reason,
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = r.id;
end;
$$;

comment on function public.cancel_reservation is
  'Annule une réservation et libère son occupation sans l''effacer (Règles location §13).';


-- --- Convertir une réservation en location --------------------------------------
--
-- L'occupation n'est ni supprimée ni recréée : elle CHANGE D'ORIGINE. Toute
-- autre méthode ouvrirait une fenêtre, si brève soit-elle, pendant laquelle le
-- véhicule paraîtrait libre.

create or replace function public.convert_reservation_to_rental(
  p_reservation_id uuid
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r         public.reservations%rowtype;
  v_no      text;
  v_rental  uuid;
begin
  select * into r from public.reservations where id = p_reservation_id for update;

  if not found then
    raise exception 'Réservation introuvable.' using errcode = 'no_data_found';
  end if;

  if r.status not in ('CONFIRMED', 'PREPARING') then
    raise exception
      'Opération refusée : seule une réservation confirmée peut devenir une location.'
      using errcode = 'check_violation';
  end if;

  -- Garanti par `reservations_confirmed_complete`, revérifié ici : cette
  -- fonction ne doit jamais produire une location sans prix.
  if r.vehicle_id is null or r.locked_amount is null then
    raise exception 'Réservation incomplète : véhicule ou tarif manquant.'
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('rental');

  insert into public.rentals (
    rental_no, reservation_id, client_id, vehicle_id,
    planned_period, expected_return_at,
    locked_amount, locked_unit, locked_rule_id, locked_source, locked_at,
    conditions, status, created_by
  )
  values (
    v_no, r.id, r.client_id, r.vehicle_id,
    r.period, upper(r.period),
    r.locked_amount, r.locked_unit, r.locked_rule_id, r.locked_source, r.locked_at,
    r.conditions, 'PREPARING', public.current_actor()
  )
  returning id into v_rental;

  update public.vehicle_occupations
     set source    = 'RENTAL',
         source_id = v_rental,
         reason    = 'Location ' || v_no
   where source = 'RESERVATION'
     and source_id = r.id
     and is_active;

  update public.reservations
     set status            = 'CONVERTED',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = r.id;

  return v_rental;
end;
$$;

comment on function public.convert_reservation_to_rental is
  'Transforme une réservation confirmée en location, en reportant le tarif verrouillé et en changeant l''origine de l''occupation.';


-- --- Prolonger une location ------------------------------------------------------
--
-- La contrainte d'exclusion tranche : si un autre engagement occupe la fenêtre
-- demandée, la prolongation est refusée par la BASE. L'application ne décide
-- rien, et deux prolongations simultanées ne peuvent pas se croiser.

create or replace function public.extend_rental(
  p_rental_id uuid,
  p_new_end   timestamptz,
  p_reason    text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  l public.rentals%rowtype;
begin
  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if l.status not in ('IN_PROGRESS', 'EXTENDED') then
    raise exception
      'Opération refusée : seule une location en cours peut être prolongée.'
      using errcode = 'check_violation';
  end if;

  if p_new_end <= l.expected_return_at then
    raise exception
      'Opération refusée : la nouvelle date de retour doit être postérieure à la date attendue.'
      using errcode = 'check_violation';
  end if;

  -- Étend la période bloquée. Un chevauchement lève ici, pas plus tard.
  update public.vehicle_occupations
     set period = tstzrange(lower(period), p_new_end, '[)')
   where source = 'RENTAL'
     and source_id = l.id
     and is_active;

  update public.rentals
     set expected_return_at = p_new_end,
         status             = 'EXTENDED',
         status_reason      = p_reason,
         status_changed_at  = now(),
         status_changed_by  = public.current_actor(),
         updated_by         = public.current_actor()
   where id = l.id;
end;
$$;

comment on function public.extend_rental is
  'Prolonge une location. La contrainte d''exclusion refuse la prolongation si la période est déjà engagée (DEC-012).';


-- --- Sécurité au niveau des données -----------------------------------------------
-- Deuxième barrière de DEC-011, sur les permissions du catalogue.
--
-- Comme pour les clients et les fournisseurs (migration 018), les policies
-- d'écriture acceptent l'une OU l'autre des permissions d'action : c'est la
-- garde serveur qui exige celle correspondant à l'opération réellement
-- demandée. Ici s'ajoute une barrière que le référentiel n'avait pas : les
-- déclencheurs de transition, qui refusent un enchaînement incohérent quelle
-- que soit la permission détenue.

revoke all    on public.reservations              from anon;
revoke all    on public.rentals                   from anon;
revoke all    on public.rental_inspections        from anon;
revoke all    on public.rental_inspection_photos  from anon;

revoke delete on public.reservations              from authenticated;
revoke delete on public.rentals                   from authenticated;
revoke delete on public.rental_inspections        from authenticated;
revoke delete on public.rental_inspection_photos  from authenticated;

alter table public.reservations             enable row level security;
alter table public.rentals                  enable row level security;
alter table public.rental_inspections       enable row level security;
alter table public.rental_inspection_photos enable row level security;

-- --- Réservations
create policy reservations_select on public.reservations
  for select to authenticated
  using (public.has_permission('rental.reservations.view'));

create policy reservations_insert on public.reservations
  for insert to authenticated
  with check (public.has_permission('rental.reservations.create'));

create policy reservations_update on public.reservations
  for update to authenticated
  using (
    public.has_permission('rental.reservations.update')
    or public.has_permission('rental.reservations.confirm')
    or public.has_permission('rental.reservations.cancel')
  )
  with check (
    public.has_permission('rental.reservations.update')
    or public.has_permission('rental.reservations.confirm')
    or public.has_permission('rental.reservations.cancel')
  );

-- --- Locations
create policy rentals_select on public.rentals
  for select to authenticated
  using (public.has_permission('rental.rentals.view'));

create policy rentals_insert on public.rentals
  for insert to authenticated
  with check (public.has_permission('rental.rentals.create'));

create policy rentals_update on public.rentals
  for update to authenticated
  using (
    public.has_permission('rental.rentals.update')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.rentals.close')
    or public.has_permission('rental.rentals.cancel')
  )
  with check (
    public.has_permission('rental.rentals.update')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.rentals.close')
    or public.has_permission('rental.rentals.cancel')
  );

-- --- États des lieux et photos
-- La lecture suit celle de la location : un état des lieux n'a pas de sens
-- séparé de son contrat. L'écriture exige le geste correspondant — enregistrer
-- un départ ou un retour — et rien d'autre.
create policy rental_inspections_select on public.rental_inspections
  for select to authenticated
  using (public.has_permission('rental.rentals.view'));

create policy rental_inspections_insert on public.rental_inspections
  for insert to authenticated
  with check (
    public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
  );

create policy rental_inspections_update on public.rental_inspections
  for update to authenticated
  using (
    public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
  )
  with check (
    public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
  );

create policy rental_inspection_photos_select on public.rental_inspection_photos
  for select to authenticated
  using (public.has_permission('rental.rentals.view'));

create policy rental_inspection_photos_insert on public.rental_inspection_photos
  for insert to authenticated
  with check (
    public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
  );

create policy rental_inspection_photos_update on public.rental_inspection_photos
  for update to authenticated
  using (
    public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
  )
  with check (
    public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
  );

-- Aucune policy DELETE nulle part : le cycle s'annule et s'archive.


-- --- Fuseau horaire : où il est réellement décidé ------------------------------
--
-- DEC-014 est close sur ce point par DEC-025 §e : stockage en UTC, lecture
-- métier sur `Indian/Comoro`. L'implémentation vit en UN SEUL endroit —
-- `DISPLAY_TIMEZONE` dans `src/lib/dates.ts` — et alimente l'interface, le
-- moteur documentaire et le moteur d'export.
--
-- `company_settings.timezone` porte la même valeur mais n'est LUE PAR RIEN.
-- Le commentaire est corrigé pour que personne ne la prenne pour la source
-- active : c'est un point d'extension, pas un paramètre en service.

comment on column public.company_settings.timezone is
  'Fuseau de référence — Indian/Comoro (DEC-025 §e). POINT D''EXTENSION, NON CÂBLÉ : la source active est DISPLAY_TIMEZONE dans src/lib/dates.ts.';


-- --- Droits d'exécution -------------------------------------------------------
-- DEC-022 : un droit se retire à chaque source qui l'accorde — PUBLIC et anon.

revoke execute on function public.confirm_reservation(uuid, uuid)              from public, anon;
revoke execute on function public.cancel_reservation(uuid, text)               from public, anon;
revoke execute on function public.convert_reservation_to_rental(uuid)          from public, anon;
revoke execute on function public.extend_rental(uuid, timestamptz, text)       from public, anon;

grant execute on function public.confirm_reservation(uuid, uuid)              to authenticated, service_role;
grant execute on function public.cancel_reservation(uuid, text)               to authenticated, service_role;
grant execute on function public.convert_reservation_to_rental(uuid)          to authenticated, service_role;
grant execute on function public.extend_rental(uuid, timestamptz, text)       to authenticated, service_role;
