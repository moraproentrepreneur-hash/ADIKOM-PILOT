-- =============================================================================
-- ADIKOM PILOT — 039 · Maintenance des véhicules
-- Étape 2.4 (DEC-021), LOT 2 — arbitrages ADIKOM du 27 août 2026
--
-- CE QUE CETTE MIGRATION POSE
--
-- L'INTERVENTION : qui répare quoi, quand, et si le véhicule doit sortir du
-- parc pendant ce temps. Le LOT 1 avait rendu le CONSTAT structuré ; celui-ci
-- lui donne une suite, sans jamais la lui imposer.
--
-- CE QU'ELLE NE FAIT PAS — et ce n'est pas un oubli
--
--   · AUCUN MONTANT. Ni coût estimé, ni coût réel, ni devis, ni pièce, ni
--     main-d'œuvre, ni montant imputable. `rental.maintenance.cost.update`
--     existe au catalogue et porte exactement cela — elle n'est PAS employée
--     ici : elle appartient au LOT 3. Une recette vérifie dans
--     `information_schema` qu'aucune colonne monétaire n'est apparue.
--   · AUCUNE PIÈCE JOINTE. Devis, facture, reçu, justificatif : tous
--     financiers. Un demi-mécanisme aujourd'hui serait à défaire demain.
--   · AUCUN ORDONNANCEUR. L'origine « Préventive » et la date prévue
--     existent ; aucune échéance ne se déclenche seule (DEC-025 §a).
--   · AUCUNE PERMISSION NOUVELLE. Les six codes `rental.maintenance.*`
--     existent depuis la migration 005. Catalogue : 152, inchangé.
--   · AUCUNE RÈGLE DE NUMÉROTATION NOUVELLE. `maintenance` → `MNT`, avec
--     année et remise à zéro annuelle, est enregistrée depuis la migration 005.
--
-- CE QU'ELLE RÉUTILISE, SANS LE REDÉFINIR
--
--   · `vehicle_occupations` et sa contrainte d'exclusion (DEC-012) — son
--     énumération prévoyait `MAINTENANCE` depuis la migration 013 ;
--   · `is_vehicle_available()` et `vehicle_calendar()` ;
--   · `next_number()`, `fn_set_updated_at`, `fn_audit_row`,
--     `fn_forbid_delete`, `current_actor`.
--
-- LA COLLISION RESTE L'AFFAIRE DE LA BASE
--
-- Aucune logique d'exclusion n'est réécrite : la contrainte
-- `vehicle_occupations_no_overlap` est l'autorité. Les fonctions ci-dessous ne
-- la devancent pas — elles la laissent trancher, et traduisent son refus.
-- =============================================================================


-- --- Types ---------------------------------------------------------------------

-- Workflow 05 §11 — les origines documentées, sans ajout.
do $$ begin
  create type public.maintenance_origin as enum (
    'RENTAL_RETURN',  -- Retour de location
    'BREAKDOWN',      -- Panne
    'INCIDENT',       -- Incident
    'INSPECTION',     -- Contrôle
    'PREVENTIVE',     -- Maintenance préventive
    'OTHER'           -- Autre
  );
exception when duplicate_object then null; end $$;

-- Workflow 05 §14 — les quatre niveaux documentés.
--
-- La priorité ORIENTE, elle ne commande rien : elle ne déclenche aucune
-- immobilisation, aucune notification et aucun traitement automatique. Seule
-- une période d'immobilisation bloque un calendrier.
do $$ begin
  create type public.maintenance_priority as enum (
    'LOW',     -- Faible
    'NORMAL',  -- Normale
    'HIGH',    -- Haute
    'URGENT'   -- Urgente
  );
exception when duplicate_object then null; end $$;

-- Workflow 05 §17 — les sept statuts documentés, et RIEN DE PLUS.
--
-- Arbitrage ADIKOM du 27/08/2026 : pas de huitième statut « Clôturée », pas
-- d'état de contrôle distinct. « Terminée » signifie intervention réalisée ET
-- contrôle après intervention satisfaisant (§47, Parc §23) — c'est cet acte,
-- et lui seul, qui rend le véhicule au parc.
--
-- §49 en tire la conséquence : tant que le problème persiste, « Terminée » ne
-- doit pas être employé ; la maintenance reste « En cours » ou « En attente ».
-- La table de transitions ci-dessous le rend impossible autrement.
do $$ begin
  create type public.maintenance_status as enum (
    'DRAFT',         -- Brouillon
    'PLANNED',       -- Planifiée
    'TO_DIAGNOSE',   -- À diagnostiquer
    'IN_PROGRESS',   -- En cours
    'ON_HOLD',       -- En attente
    'COMPLETED',     -- Terminée
    'CANCELLED'      -- Annulée
  );
exception when duplicate_object then null; end $$;


-- --- Transitions, imposées par la base -----------------------------------------
--
-- Même dispositif qu'au cycle d'exploitation (DEC-025 §k) et qu'aux incidents :
-- une permission dit qui peut agir, une transition dit ce qui a un sens. Un
-- appel direct à l'API, muni du bon droit, ne peut pas pour autant relancer
-- une maintenance terminée.
--
-- « En attente » ne mène PAS directement à « Terminée » : reprendre
-- l'intervention est un acte, et terminer atteste d'un contrôle satisfaisant
-- qui n'a pas pu avoir lieu pendant l'attente (§47, §49).

create or replace function public.fn_maintenance_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.maintenance_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'DRAFT' then
      array['PLANNED','TO_DIAGNOSE','CANCELLED']::public.maintenance_status[]
    when 'PLANNED' then
      array['TO_DIAGNOSE','IN_PROGRESS','ON_HOLD','CANCELLED']::public.maintenance_status[]
    when 'TO_DIAGNOSE' then
      array['IN_PROGRESS','ON_HOLD','CANCELLED']::public.maintenance_status[]
    when 'IN_PROGRESS' then
      array['ON_HOLD','COMPLETED','CANCELLED']::public.maintenance_status[]
    when 'ON_HOLD' then
      array['IN_PROGRESS','TO_DIAGNOSE','CANCELLED']::public.maintenance_status[]
    -- Terminée, annulée : états terminaux (§64 — une maintenance réalisée ne se
    -- défait pas ; arbitrage du 27/08/2026 — elle ne se relance pas non plus).
    else array[]::public.maintenance_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition de maintenance refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_maintenance_status_transition is
  'Impose les enchaînements de Workflow 05 §17 et §49. « Terminée » atteste d''un contrôle satisfaisant et reste terminal.';


-- Cohérence des rattachements.
--
-- Une maintenance cite jusqu'à quatre objets. Sans ce contrôle, elle pourrait
-- désigner l'incident d'un autre véhicule ou la location d'un autre véhicule,
-- et le dossier serait incohérent sans que personne ne s'en aperçoive avant
-- d'avoir à s'en servir. Même dispositif que `fn_incident_coherence`.
create or replace function public.fn_maintenance_coherence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_other uuid;
begin
  if new.incident_id is not null then
    select vehicle_id into v_other
    from public.vehicle_incidents where id = new.incident_id;

    if v_other is distinct from new.vehicle_id then
      raise exception
        'Incohérence : cet incident ne concerne pas le véhicule désigné.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.rental_id is not null then
    select vehicle_id into v_other
    from public.rentals where id = new.rental_id;

    if v_other is distinct from new.vehicle_id then
      raise exception
        'Incohérence : cette location ne porte pas sur le véhicule désigné.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.previous_maintenance_id is not null then
    if new.previous_maintenance_id = new.id then
      raise exception 'Une maintenance ne peut pas se suivre elle-même.'
        using errcode = 'check_violation';
    end if;

    select vehicle_id into v_other
    from public.vehicle_maintenances where id = new.previous_maintenance_id;

    if v_other is distinct from new.vehicle_id then
      raise exception
        'Incohérence : la maintenance précédente porte sur un autre véhicule.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_maintenance_coherence is
  'Vérifie que véhicule, incident, location et maintenance précédente désignent bien le même véhicule.';


-- --- Maintenances ---------------------------------------------------------------

create table public.vehicle_maintenances (
  id             uuid primary key default gen_random_uuid(),

  -- MNT-2026-000001 — règle `maintenance` de `numbering_rules`, migration 005.
  maintenance_no text not null unique,

  -- Le véhicule est le seul rattachement obligatoire (Workflow 05 §7).
  vehicle_id     uuid not null references public.vehicles (id) on delete restrict,

  /*
   * TROIS LIENS FACULTATIFS, JAMAIS AUTOMATIQUES.
   *
   * Un incident ne crée pas de maintenance (§44 appliqué à l'amont) : c'est un
   * utilisateur qui décide qu'une intervention est nécessaire. De même, une
   * maintenance peut naître d'une panne sans incident déclaré, ou d'un
   * entretien préventif sans rien en amont.
   */
  incident_id             uuid references public.vehicle_incidents (id) on delete restrict,
  rental_id               uuid references public.rentals (id) on delete restrict,
  -- §50 : une nouvelle intervention peut prolonger l'histoire de la précédente.
  previous_maintenance_id uuid references public.vehicle_maintenances (id) on delete restrict,

  /*
   * PRESTATAIRE — le référentiel fournisseurs, et lui seul.
   *
   * §29 exige de distinguer le fournisseur DU VÉHICULE du prestataire DE
   * MAINTENANCE, même lorsque les deux sont la même entité : ce sont deux
   * colonnes de deux tables, et rien ne les confond. Aucun nom libre n'est
   * accepté — un second référentiel parallèle de garages diviserait
   * l'information sans rien apporter (arbitrage du 27/08/2026).
   */
  provider_supplier_id uuid references public.suppliers (id) on delete restrict,

  origin       public.maintenance_origin   not null,
  priority     public.maintenance_priority not null default 'NORMAL',
  status       public.maintenance_status   not null default 'DRAFT',

  -- §12 et §13 : pourquoi l'intervention, et ce qui a été constaté.
  reason       text not null,
  description  text,
  -- §30 : ce qui a été fait. Renseigné à la fin, pas à la déclaration.
  intervention text,
  observations text,

  -- §19 : date prévue d'intervention. Aucune échéance ne s'en déduit.
  planned_at   timestamptz,
  completed_at timestamptz,

  /*
   * IMMOBILISATION — la période EST l'information.
   *
   * Nulle : la maintenance n'immobilise pas, et AUCUNE occupation n'existe
   * (Workflow 05 §45 — « lorsqu'une maintenance nécessite une immobilisation »,
   * donc toutes ne le nécessitent pas). Non nulle : une occupation
   * `MAINTENANCE` la double, posée dans la même transaction.
   *
   * Un booléen séparé aurait pu contredire la période ; ici les deux ne peuvent
   * pas diverger, faute d'exister séparément.
   */
  immobilization_period tstzrange,

  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint maintenances_reason_not_blank check (btrim(reason) <> ''),
  constraint maintenances_period_bounded check (
    immobilization_period is null
    or (
      not isempty(immobilization_period)
      and lower(immobilization_period) is not null
      and upper(immobilization_period) is not null
    )
  )
);

comment on table public.vehicle_maintenances is
  'Intervention sur un véhicule (Workflow 05). Aucun montant : coûts, devis et imputation relèvent du LOT 3.';
comment on column public.vehicle_maintenances.immobilization_period is
  'Période d''indisponibilité. Nulle = maintenance non immobilisante, sans occupation. Non nulle = occupation MAINTENANCE posée dans la même transaction.';
comment on column public.vehicle_maintenances.provider_supplier_id is
  'Prestataire, issu du référentiel fournisseurs. Distinct du fournisseur du véhicule (§29), même si c''est la même entité.';

create index vehicle_maintenances_vehicle_idx  on public.vehicle_maintenances (vehicle_id, created_at desc);
create index vehicle_maintenances_status_idx   on public.vehicle_maintenances (status);
create index vehicle_maintenances_incident_idx on public.vehicle_maintenances (incident_id) where incident_id is not null;
create index vehicle_maintenances_rental_idx   on public.vehicle_maintenances (rental_id) where rental_id is not null;

create trigger vehicle_maintenances_updated_at
  before update on public.vehicle_maintenances
  for each row execute function public.fn_set_updated_at();

create trigger vehicle_maintenances_transition
  before update on public.vehicle_maintenances
  for each row execute function public.fn_maintenance_status_transition();

create trigger vehicle_maintenances_coherence
  before insert or update on public.vehicle_maintenances
  for each row execute function public.fn_maintenance_coherence();

create trigger vehicle_maintenances_audit
  after insert or update on public.vehicle_maintenances
  for each row execute function public.fn_audit_row('rental');

create trigger vehicle_maintenances_no_delete
  before delete on public.vehicle_maintenances
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- OPÉRATIONS ATOMIQUES
--
-- Chacune touche la maintenance, le calendrier et le parc. Les confier à
-- l'application laisserait, à la première interruption, une fiche annonçant une
-- immobilisation que le calendrier ignore — c'est-à-dire un véhicule réputé
-- bloqué et pourtant louable.
--
-- Aucune n'est `security definer` : elles s'exécutent avec les droits de
-- l'appelant, RLS comprise. Échanger cette barrière contre une commodité
-- reviendrait à faire du droit d'appeler une fonction un droit d'écrire
-- partout.
-- =============================================================================

/**
 * Pose l'immobilisation et met le parc à jour.
 *
 * LE STATUT DÉCRIT LE PRÉSENT, LE CALENDRIER PORTE LES PÉRIODES.
 *
 * `MAINTENANCE` n'est inscrit que si l'immobilisation court MAINTENANT
 * (Parc §68 et §69 : le calendrier reflète les périodes, le statut la situation
 * courante). Une immobilisation planifiée pour la semaine prochaine bloque le
 * calendrier sans mentir sur l'état d'aujourd'hui.
 *
 * La mise à jour est conditionnée à `AVAILABLE` : si le véhicule est en
 * location ou immobilisé pour un autre motif, ce n'est pas à la maintenance de
 * l'effacer — exactement la garde que `return_rental` applique en sens inverse.
 */
create or replace function public.fn_apply_maintenance_block(
  p_maintenance_id uuid,
  p_vehicle_id     uuid,
  p_period         tstzrange,
  p_label          text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- La contrainte d'exclusion est le juge : aucune vérification préalable ne
  -- la devance, et aucune ne la remplace (DEC-012).
  insert into public.vehicle_occupations
    (vehicle_id, source, source_id, period, reason, created_by)
  values
    (p_vehicle_id, 'MAINTENANCE', p_maintenance_id, p_period,
     'Maintenance ' || p_label, public.current_actor());

  if p_period @> now() then
    update public.vehicles
       set status            = 'MAINTENANCE',
           status_changed_at = now(),
           status_changed_by = public.current_actor(),
           updated_by        = public.current_actor()
     where id = p_vehicle_id
       and status = 'AVAILABLE';
  end if;
end;
$$;

comment on function public.fn_apply_maintenance_block is
  'Pose l''occupation MAINTENANCE et n''inscrit « En maintenance » que si la période court déjà (Parc §68).';


/**
 * Libère l'immobilisation et rend le véhicule au parc.
 *
 * L'occupation est LIBÉRÉE, jamais effacée : l'historique de ce qui a été
 * bloqué doit rester lisible (CLAUDE.md §22, comme `cancel_reservation`).
 */
create or replace function public.fn_release_maintenance_block(
  p_maintenance_id uuid,
  p_vehicle_id     uuid
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.vehicle_occupations
     set is_active   = false,
         released_at = now(),
         released_by = public.current_actor()
   where source = 'MAINTENANCE'
     and source_id = p_maintenance_id
     and is_active;

  update public.vehicles
     set status            = 'AVAILABLE',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = p_vehicle_id
     and status = 'MAINTENANCE';
end;
$$;

comment on function public.fn_release_maintenance_block is
  'Libère l''occupation MAINTENANCE sans l''effacer et ramène le véhicule à « Disponible ».';


-- --- Déclarer une maintenance ----------------------------------------------------
--
-- TOUT OU RIEN.
--
-- Si la période d'immobilisation chevauche une réservation ou une location, la
-- contrainte d'exclusion refuse — et la maintenance elle-même n'est pas créée.
-- Aucune fiche ne doit prétendre à une immobilisation que le calendrier ignore
-- (arbitrage du 27/08/2026).

create or replace function public.create_maintenance(
  p_vehicle_id              uuid,
  p_origin                  public.maintenance_origin,
  p_reason                  text,
  p_priority                public.maintenance_priority default 'NORMAL',
  p_description             text        default null,
  p_incident_id             uuid        default null,
  p_rental_id               uuid        default null,
  p_previous_maintenance_id uuid        default null,
  p_provider_supplier_id    uuid        default null,
  p_planned_at              timestamptz default null,
  p_immobilization_from     timestamptz default null,
  p_immobilization_to       timestamptz default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_no     text;
  v_period tstzrange;
begin
  if p_vehicle_id is null then
    raise exception 'Une maintenance se rattache obligatoirement à un véhicule.'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Le motif de la maintenance est obligatoire.'
      using errcode = 'check_violation';
  end if;

  if (p_immobilization_from is null) <> (p_immobilization_to is null) then
    raise exception 'Une immobilisation exige une date de début ET une date de fin.'
      using errcode = 'check_violation';
  end if;

  if p_immobilization_from is not null then
    if p_immobilization_to <= p_immobilization_from then
      raise exception 'La fin de l''immobilisation doit suivre son début.'
        using errcode = 'check_violation';
    end if;
    v_period := tstzrange(p_immobilization_from, p_immobilization_to, '[)');
  end if;

  v_no := public.next_number('maintenance');

  insert into public.vehicle_maintenances
    (maintenance_no, vehicle_id, incident_id, rental_id, previous_maintenance_id,
     provider_supplier_id, origin, priority, reason, description, planned_at,
     immobilization_period, created_by, updated_by)
  values
    (v_no, p_vehicle_id, p_incident_id, p_rental_id, p_previous_maintenance_id,
     p_provider_supplier_id, p_origin, coalesce(p_priority, 'NORMAL'),
     btrim(p_reason), nullif(btrim(coalesce(p_description, '')), ''), p_planned_at,
     v_period, public.current_actor(), public.current_actor())
  returning id into v_id;

  if v_period is not null then
    perform public.fn_apply_maintenance_block(v_id, p_vehicle_id, v_period, v_no);
  end if;

  return v_id;
end;
$$;

comment on function public.create_maintenance is
  'Déclare une maintenance et, si elle immobilise, pose son occupation dans la même transaction. Ne crée NI incident, NI imputation, NI montant.';


-- --- Immobiliser après coup --------------------------------------------------------
--
-- LE CAS DE LA PANNE PENDANT UNE LOCATION.
--
-- Le véhicule est dehors : son calendrier est occupé par la location, et toute
-- immobilisation immédiate est structurellement impossible. La maintenance
-- existe donc d'abord SANS immobilisation — ce qui est la vérité — puis
-- l'immobilisation est posée quand le véhicule est réellement rentré.
--
-- Aucune période artificielle n'est inventée pour contourner l'attente, et la
-- contrainte de calendrier n'est jamais contournée (arbitrage du 27/08/2026).

create or replace function public.immobilize_maintenance(
  p_maintenance_id uuid,
  p_from           timestamptz,
  p_to             timestamptz
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  m        public.vehicle_maintenances%rowtype;
  v_period tstzrange;
begin
  select * into m from public.vehicle_maintenances where id = p_maintenance_id for update;

  if not found then
    raise exception 'Maintenance introuvable.' using errcode = 'no_data_found';
  end if;

  if m.status in ('COMPLETED', 'CANCELLED') then
    raise exception
      'Opération refusée : une maintenance terminée ou annulée ne s''immobilise plus.'
      using errcode = 'check_violation';
  end if;

  if m.immobilization_period is not null then
    raise exception
      'Opération refusée : cette maintenance immobilise déjà le véhicule.'
      using errcode = 'check_violation';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Une immobilisation exige une période valide.'
      using errcode = 'check_violation';
  end if;

  v_period := tstzrange(p_from, p_to, '[)');

  update public.vehicle_maintenances
     set immobilization_period = v_period,
         updated_by            = public.current_actor()
   where id = m.id;

  perform public.fn_apply_maintenance_block(m.id, m.vehicle_id, v_period, m.maintenance_no);
end;
$$;

comment on function public.immobilize_maintenance is
  'Pose l''immobilisation d''une maintenance déjà déclarée — cas de la panne survenue pendant une location.';


-- --- Terminer une maintenance --------------------------------------------------------
--
-- « TERMINÉE » ATTESTE D'UN CONTRÔLE SATISFAISANT.
--
-- Workflow 05 §47 et Parc §23 : le véhicule ne redevient pas disponible sans
-- vérification de son état. §49 : si le problème persiste, cet état ne doit pas
-- être employé. La transition n'est donc ouverte que depuis « En cours » — on
-- ne termine pas depuis une attente, on reprend d'abord l'intervention.

create or replace function public.complete_maintenance(
  p_maintenance_id uuid,
  p_completed_at   timestamptz default now(),
  p_intervention   text        default null,
  p_observations   text        default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  m public.vehicle_maintenances%rowtype;
begin
  select * into m from public.vehicle_maintenances where id = p_maintenance_id for update;

  if not found then
    raise exception 'Maintenance introuvable.' using errcode = 'no_data_found';
  end if;

  if m.status <> 'IN_PROGRESS' then
    raise exception
      'Opération refusée : seule une maintenance en cours peut être terminée après contrôle.'
      using errcode = 'check_violation';
  end if;

  update public.vehicle_maintenances
     set status            = 'COMPLETED',
         completed_at      = coalesce(p_completed_at, now()),
         intervention      = nullif(btrim(coalesce(p_intervention, '')), ''),
         observations      = nullif(btrim(coalesce(p_observations, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = m.id;

  -- Même opération, même transaction : la fiche et le parc ne peuvent pas
  -- diverger.
  perform public.fn_release_maintenance_block(m.id, m.vehicle_id);
end;
$$;

comment on function public.complete_maintenance is
  'Termine une maintenance après contrôle satisfaisant : libère l''immobilisation et rend le véhicule au parc, en une seule opération.';


-- --- Annuler une maintenance ------------------------------------------------------
--
-- §64 : l'annulation change le statut, enregistre le motif, identifie
-- l'utilisateur et LIBÈRE le véhicule lorsqu'elle le permet. La maintenance,
-- elle, reste : une opération annulée se retrouve, elle ne s'efface pas.

create or replace function public.cancel_maintenance(
  p_maintenance_id uuid,
  p_reason         text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  m public.vehicle_maintenances%rowtype;
begin
  select * into m from public.vehicle_maintenances where id = p_maintenance_id for update;

  if not found then
    raise exception 'Maintenance introuvable.' using errcode = 'no_data_found';
  end if;

  if m.status in ('COMPLETED', 'CANCELLED') then
    raise exception
      'Opération refusée : cette maintenance ne peut plus être annulée.'
      using errcode = 'check_violation';
  end if;

  update public.vehicle_maintenances
     set status            = 'CANCELLED',
         status_reason     = p_reason,
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = m.id;

  perform public.fn_release_maintenance_block(m.id, m.vehicle_id);
end;
$$;

comment on function public.cancel_maintenance is
  'Annule une maintenance et libère son immobilisation sans l''effacer (§64).';


-- --- Sécurité au niveau des données ------------------------------------------------
-- Deuxième barrière de DEC-011, sur les permissions du catalogue.

revoke all    on public.vehicle_maintenances from anon;
revoke delete on public.vehicle_maintenances from authenticated;

alter table public.vehicle_maintenances enable row level security;

create policy vehicle_maintenances_select on public.vehicle_maintenances
  for select to authenticated
  using (public.has_permission('rental.maintenance.view'));

create policy vehicle_maintenances_insert on public.vehicle_maintenances
  for insert to authenticated
  with check (public.has_permission('rental.maintenance.create'));

-- L'une OU l'autre : c'est la garde serveur qui exige celle correspondant à
-- l'opération réellement demandée (convention de la migration 018).
create policy vehicle_maintenances_update on public.vehicle_maintenances
  for update to authenticated
  using (
    public.has_permission('rental.maintenance.update')
    or public.has_permission('rental.maintenance.validate')
    or public.has_permission('rental.maintenance.close')
  )
  with check (
    public.has_permission('rental.maintenance.update')
    or public.has_permission('rental.maintenance.validate')
    or public.has_permission('rental.maintenance.close')
  );


-- --- Le calendrier et le parc reconnaissent la maintenance -------------------------
--
-- Suite des migrations 033, 034, 035 et 036 : chaque capacité est ouverte quand
-- SA fonction existe, jamais avant. Les policies sont réécrites en entier —
-- ajouter une clause à l'aveugle laisserait la liste réelle invisible à qui
-- relit ce fichier.
--
-- ARBITRAGE ADIKOM DU 27/08/2026 : le droit de maintenance porte l'opération de
-- maintenance. Exiger EN PLUS `rental.fleet.status.update` de qui déclare une
-- panne reviendrait à lui donner le droit d'immobiliser n'importe quel véhicule
-- pour n'importe quel motif — c'est-à-dire à élargir ses pouvoirs sous prétexte
-- de les restreindre.

drop policy if exists vehicle_occupations_insert on public.vehicle_occupations;

create policy vehicle_occupations_insert on public.vehicle_occupations
  for insert to authenticated
  with check (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.confirm')
    -- Déclarer une maintenance immobilisante, ou l'immobiliser après coup.
    or public.has_permission('rental.maintenance.create')
    or public.has_permission('rental.maintenance.update')
  );

drop policy if exists vehicle_occupations_update on public.vehicle_occupations;

create policy vehicle_occupations_update on public.vehicle_occupations
  for update to authenticated
  using (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.cancel')
    or public.has_permission('rental.rentals.create')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.cancel')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
    -- Terminer une maintenance libère son occupation ; l'annuler aussi.
    or public.has_permission('rental.maintenance.close')
    or public.has_permission('rental.maintenance.update')
  )
  with check (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.cancel')
    or public.has_permission('rental.rentals.create')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.cancel')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.maintenance.close')
    or public.has_permission('rental.maintenance.update')
  );

drop policy if exists vehicles_update on public.vehicles;

create policy vehicles_update on public.vehicles
  for update to authenticated
  using (
    public.has_permission('rental.fleet.update')
    or public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.fleet.supplier.update')
    or public.has_permission('rental.fleet.archive')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
    -- « En maintenance » à la pose, « Disponible » à la fin.
    or public.has_permission('rental.maintenance.create')
    or public.has_permission('rental.maintenance.update')
    or public.has_permission('rental.maintenance.close')
  )
  with check (
    public.has_permission('rental.fleet.update')
    or public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.fleet.supplier.update')
    or public.has_permission('rental.fleet.archive')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.maintenance.create')
    or public.has_permission('rental.maintenance.update')
    or public.has_permission('rental.maintenance.close')
  );
