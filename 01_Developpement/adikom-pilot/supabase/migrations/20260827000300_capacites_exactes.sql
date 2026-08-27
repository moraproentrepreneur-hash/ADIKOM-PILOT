-- =============================================================================
-- ADIKOM PILOT — 041 · Chaque acte exige SA capacité, jusque dans un appel direct
-- Audit de sécurité demandé par ADIKOM le 27 août 2026
--
-- L'AUDIT
--
-- Le LOT 2 avait révélé que `complete_maintenance` pouvait être appelée par un
-- porteur de `rental.maintenance.update` alors qu'elle exige
-- `rental.maintenance.close`. La migration 040 avait corrigé les trois
-- fonctions de maintenance. L'audit du reste du projet montre que le défaut est
-- GÉNÉRAL, et qu'il tient à un choix d'architecture parfaitement explicite.
--
-- LA CAUSE
--
-- Une table sert plusieurs actes. `rentals` est écrite par le départ, la
-- prolongation, le retour, l'annulation et la clôture ; `reservations` par la
-- confirmation, l'annulation et la conversion. PostgreSQL n'accepte qu'UNE
-- policy d'UPDATE par table : elle doit donc énumérer toutes les capacités qui
-- ont le droit d'écrire — `update OR checkout OR extend OR return OR close OR
-- cancel`.
--
-- La convention posée en migration 018 assumait ce relâchement : « les policies
-- d'écriture acceptent l'une OU l'autre ; c'est la garde serveur qui exige
-- celle correspondant à l'opération demandée. » Elle est juste tant que la
-- garde serveur se trouve sur le chemin. Or PostgREST expose les tables ET les
-- fonctions : un appel direct ne rencontre AUCUNE garde serveur.
--
-- Conséquence mesurée : `rental.rentals.checkout` permettait de RETOURNER une
-- location ; `rental.reservations.update` combiné à n'importe quelle capacité
-- du calendrier permettait de CONFIRMER ou d'ANNULER une réservation. C'est
-- exactement ce que DEC-024 interdit — « aucune fonctionnalité ne doit être
-- implicitement autorisée par une autre permission ».
--
-- LA CORRECTION, EN TROIS COUCHES
--
--   1. Chaque FONCTION atomique vérifie la capacité qu'elle incarne.
--   2. Chaque TRANSITION de statut vérifie la capacité qui la légitime — ce qui
--      couvre aussi les `PATCH` directs sur la table, hors de toute fonction.
--   3. Chaque écriture du CALENDRIER vérifie la capacité correspondant à
--      l'origine de l'occupation — un porteur de `rentals.checkout` ne peut
--      plus libérer l'immobilisation d'une maintenance.
--
-- CE QUI N'EST PAS FAIT
--
--   · Aucune fonction ne devient `SECURITY DEFINER` : elles s'exécutent avec
--     les droits de l'appelant, RLS comprise. Le défaut venait d'un contrôle
--     manquant, pas d'un contrôle gênant.
--   · Aucune policy n'est modifiée : elles restent la première barrière, et
--     doivent rester larges puisqu'une table sert plusieurs actes. Les
--     contrôles ajoutés ici sont la seconde, celle qui distingue.
--   · AUCUNE PERMISSION N'EST CRÉÉE. Catalogue : 152.
--   · Aucune règle métier n'est modifiée : les enchaînements autorisés, les
--     conditions et les effets restent identiques. Seul CHANGE QUI a le droit
--     de les déclencher — et cela ne fait que rejoindre ce que les écrans
--     exigeaient déjà.
--
-- DEUX TRANSITIONS RESTENT SANS CAPACITÉ DÉSIGNÉE
--
-- `TO_INVOICE → INVOICED` et `INVOICED → CLOSED` appartiennent à l'Étape 2.5.
-- Aucune capacité ne leur correspond aujourd'hui, et en désigner une
-- reviendrait à inventer une règle. Elles restent donc protégées par la seule
-- policy, et l'Étape 2.5 devra les rattacher explicitement. C'est signalé, non
-- masqué.
--
-- HORS SESSION APPLICATIVE
--
-- `current_actor()` renvoie NULL pour une migration, un script d'environnement
-- ou la clé de service — laquelle contourne déjà RLS. Les contrôles ajoutés
-- s'effacent alors, exactement comme `fn_forbid_delete` (migration 021).
-- =============================================================================


-- --- Garde commune ---------------------------------------------------------------

create or replace function public.require_capability(
  p_codes text[],
  p_action text
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  -- Migration, script d'environnement, clé de service : pas de session
  -- applicative, donc pas de capacité à vérifier (convention de la 021).
  if public.current_actor() is null then
    return;
  end if;

  foreach v_code in array p_codes loop
    if public.has_permission(v_code) then
      return;
    end if;
  end loop;

  raise exception 'Droit insuffisant pour cette opération : %.', p_action
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function public.require_capability(text[], text) is
  'Exige au moins une des capacités citées. Seconde barrière : la policy dit qui peut écrire dans la table, ceci dit qui peut accomplir CET acte.';


-- =============================================================================
-- 1. LES FONCTIONS ATOMIQUES VÉRIFIENT LEUR CAPACITÉ
-- =============================================================================

-- --- Réservations ------------------------------------------------------------------

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
  perform public.require_capability(
    array['rental.reservations.confirm'], 'confirmer une réservation'
  );

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

  if not public.is_vehicle_available(v_vehicle, r.period) then
    raise exception
      'Opération refusée : ce véhicule n''est pas disponible sur la période demandée.'
      using errcode = 'exclusion_violation';
  end if;

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
  perform public.require_capability(
    array['rental.reservations.cancel'], 'annuler une réservation'
  );

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


-- =============================================================================
-- 2. LES TRANSITIONS VÉRIFIENT LA CAPACITÉ QUI LES LÉGITIME
--
-- Ces déclencheurs couvrent TOUS les chemins, y compris un `PATCH` direct sur
-- la table, hors de toute fonction. C'est la couche qui manquait : jusqu'ici
-- ils imposaient la COHÉRENCE d'un enchaînement sans se soucier de savoir QUI
-- l'accomplissait.
-- =============================================================================

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
    else array[]::public.reservation_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition de réservation refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- QUI peut accomplir CE pas. Convertir est un acte de LOCATION, pas de
  -- réservation : c'est `rentals.create` qui le porte.
  case new.status
    when 'CONFIRMED' then
      perform public.require_capability(
        array['rental.reservations.confirm'], 'confirmer une réservation');
    when 'CANCELLED' then
      perform public.require_capability(
        array['rental.reservations.cancel'], 'annuler une réservation');
    when 'CONVERTED' then
      perform public.require_capability(
        array['rental.rentals.create'], 'convertir une réservation en location');
    else
      perform public.require_capability(
        array['rental.reservations.update'], 'modifier une réservation');
  end case;

  return new;
end;
$$;

comment on function public.fn_reservation_status_transition is
  'Impose les transitions de DEC-006 ET la capacité qui légitime chacune, y compris hors des fonctions atomiques.';


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
    when 'TO_INVOICE'  then array['INVOICED']::public.rental_status[]
    when 'INVOICED'    then array['CLOSED']::public.rental_status[]
    else array[]::public.rental_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition de location refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  /*
   * `RETURNED` et `TO_CONTROL` relèvent du même acte : `return_rental` les
   * enchaîne dans la même transaction. Les séparer exigerait deux capacités
   * pour une seule opération.
   *
   * `INVOICED` et `CLOSED` appartiennent à l'Étape 2.5 : aucune capacité ne
   * leur correspond, et en désigner une serait inventer une règle. Elles
   * restent protégées par la seule policy — point ouvert, signalé.
   */
  case new.status
    when 'CONFIRMED'   then
      perform public.require_capability(
        array['rental.rentals.update'], 'confirmer un contrat de location');
    when 'IN_PROGRESS' then
      perform public.require_capability(
        array['rental.rentals.checkout'], 'enregistrer le départ d''une location');
    when 'EXTENDED'    then
      perform public.require_capability(
        array['rental.rentals.extend'], 'prolonger une location');
    when 'RETURNED'    then
      perform public.require_capability(
        array['rental.rentals.return'], 'enregistrer le retour d''une location');
    when 'TO_CONTROL'  then
      perform public.require_capability(
        array['rental.rentals.return'], 'enregistrer le retour d''une location');
    when 'TO_INVOICE'  then
      perform public.require_capability(
        array['rental.rentals.close'], 'valider le contrôle de retour');
    when 'CANCELLED'   then
      perform public.require_capability(
        array['rental.rentals.cancel'], 'annuler une location');
    else
      null;  -- INVOICED, CLOSED : Étape 2.5.
  end case;

  return new;
end;
$$;

comment on function public.fn_rental_status_transition is
  'Impose les transitions de DEC-006 ET la capacité qui légitime chacune. INVOICED et CLOSED restent à rattacher à l''Étape 2.5.';


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
    else array[]::public.maintenance_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition de maintenance refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- Engager (Brouillon → Planifiée) relève de `validate` ; terminer, de
  -- `close`. Le reste, de `update`. C'est ce que les écrans exigeaient déjà.
  if new.status = 'COMPLETED' then
    perform public.require_capability(
      array['rental.maintenance.close'], 'terminer une maintenance');
  elsif old.status = 'DRAFT' and new.status = 'PLANNED' then
    perform public.require_capability(
      array['rental.maintenance.validate'], 'engager une maintenance');
  else
    perform public.require_capability(
      array['rental.maintenance.update'], 'modifier une maintenance');
  end if;

  return new;
end;
$$;

comment on function public.fn_maintenance_status_transition is
  'Impose les enchaînements de Workflow 05 §17 et §49 ET la capacité qui légitime chacun.';


-- =============================================================================
-- 3. LE CALENDRIER VÉRIFIE LA CAPACITÉ CORRESPONDANT À L'ORIGINE
--
-- La policy de `vehicle_occupations` énumère neuf capacités, parce que neuf
-- actes légitimes y écrivent. Sans distinction, un porteur de
-- `rental.rentals.checkout` pouvait libérer l'immobilisation d'une maintenance
-- — c'est-à-dire remettre en location un véhicule au garage.
--
-- Ce déclencheur rattache chaque écriture à l'ORIGINE de l'occupation, et
-- n'accepte que les capacités qui, dans le code, écrivent réellement cette
-- origine-là.
-- =============================================================================

create or replace function public.fn_occupation_capability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source public.occupation_source;
begin
  -- Sur une mise à jour, c'est l'origine D'AVANT qui décide : la conversion
  -- fait précisément passer une occupation de RESERVATION à RENTAL.
  v_source := case tg_op when 'INSERT' then new.source else old.source end;

  if tg_op = 'INSERT' then
    case v_source
      when 'RESERVATION' then
        perform public.require_capability(
          array['rental.reservations.confirm'], 'engager un véhicule sur une réservation');
      when 'RENTAL' then
        perform public.require_capability(
          array['rental.rentals.create'], 'engager un véhicule sur une location');
      when 'MAINTENANCE' then
        perform public.require_capability(
          array['rental.maintenance.create', 'rental.maintenance.update'],
          'immobiliser un véhicule pour maintenance');
      when 'IMMOBILIZATION' then
        perform public.require_capability(
          array['rental.fleet.status.update'], 'immobiliser un véhicule');
    end case;
  else
    case v_source
      when 'RESERVATION' then
        -- Libérer (annulation) ou convertir en location.
        perform public.require_capability(
          array['rental.reservations.cancel', 'rental.rentals.create'],
          'modifier l''engagement d''une réservation');
      when 'RENTAL' then
        perform public.require_capability(
          array['rental.rentals.checkout', 'rental.rentals.extend',
                'rental.rentals.return', 'rental.rentals.cancel'],
          'modifier l''engagement d''une location');
      when 'MAINTENANCE' then
        perform public.require_capability(
          array['rental.maintenance.close', 'rental.maintenance.update'],
          'lever une immobilisation de maintenance');
      when 'IMMOBILIZATION' then
        perform public.require_capability(
          array['rental.fleet.status.update'], 'lever une immobilisation');
    end case;
  end if;

  return new;
end;
$$;

comment on function public.fn_occupation_capability is
  'Rattache chaque écriture du calendrier à l''origine de l''occupation : une capacité de location ne lève pas une immobilisation de maintenance.';

create trigger vehicle_occupations_capability
  before insert or update on public.vehicle_occupations
  for each row execute function public.fn_occupation_capability();


-- =============================================================================
-- 1 bis. LES CINQ FONCTIONS DU CYCLE DE LOCATION
--
-- Redéfinies à l'identique — corps repris de leur définition RÉELLE en base,
-- non réécrit — avec une seule ligne ajoutée : la capacité que chacune incarne.
--
-- Elle fait double emploi avec le déclencheur de transition, et c'est
-- volontaire : le déclencheur protège la DONNÉE quel que soit le chemin, la
-- garde ici refuse AVANT d'engager le travail et nomme l'acte refusé. Un refus
-- lisible vaut mieux qu'un « transition refusée » à la dernière écriture.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.convert_reservation_to_rental(p_reservation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r         public.reservations%rowtype;
  v_no      text;
  v_rental  uuid;
begin
  perform public.require_capability(array['rental.rentals.create'], 'convertir une réservation en location');
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
$function$;

CREATE OR REPLACE FUNCTION public.start_rental(p_rental_id uuid, p_started_at timestamp with time zone, p_mileage integer DEFAULT NULL::integer, p_fuel_level fuel_level DEFAULT NULL::fuel_level, p_exterior_condition text DEFAULT NULL::text, p_interior_condition text DEFAULT NULL::text, p_preexisting_damages text DEFAULT NULL::text, p_observations text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  l           public.rentals%rowtype;
  v_start     timestamptz := coalesce(p_started_at, now());
  v_inspection uuid;
  v_lower     timestamptz;
begin
  perform public.require_capability(array['rental.rentals.checkout'], 'enregistrer le départ d''une location');
  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  -- Une location annulée ne part pas ; une location déjà partie non plus.
  -- Le déclencheur de transition l'imposerait aussi, mais un message clair
  -- vaut mieux qu'une violation de contrainte (CLAUDE.md §43).
  if l.status <> 'CONFIRMED' then
    raise exception
      'Opération refusée : seule une location confirmée peut partir. État actuel : %.', l.status
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.rental_inspections
    where rental_id = l.id and kind = 'DEPARTURE'
  ) then
    raise exception 'Opération refusée : le départ de cette location est déjà enregistré.'
      using errcode = 'unique_violation';
  end if;

  if v_start > l.expected_return_at then
    raise exception
      'Opération refusée : la date de départ est postérieure au retour attendu.'
      using errcode = 'check_violation';
  end if;

  -- --- L'état des lieux, d'abord : sans lui, rien ne part ------------------
  insert into public.rental_inspections (
    rental_id, kind, performed_at, mileage, fuel_level,
    exterior_condition, interior_condition, preexisting_damages, observations,
    created_by
  )
  values (
    l.id, 'DEPARTURE', v_start, p_mileage, p_fuel_level,
    p_exterior_condition, p_interior_condition, p_preexisting_damages, p_observations,
    public.current_actor()
  )
  returning id into v_inspection;

  -- --- Le calendrier suit le départ réel ------------------------------------
  select lower(period) into v_lower
  from public.vehicle_occupations
  where source = 'RENTAL' and source_id = l.id and is_active;

  if v_lower is not null and v_start < v_lower then
    update public.vehicle_occupations
       set period = tstzrange(v_start, upper(period), '[)')
     where source = 'RENTAL' and source_id = l.id and is_active;
  end if;

  -- --- La location est partie ------------------------------------------------
  update public.rentals
     set started_at        = v_start,
         status            = 'IN_PROGRESS',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.id;

  -- --- Le véhicule est en location (DEC-025 §c) -------------------------------
  -- Le statut décrit une SITUATION : il ne bougeait pas à la réservation, il
  -- bouge au départ, parce que le véhicule a réellement quitté le parc.
  update public.vehicles
     set status            = 'RENTED',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.vehicle_id
     and status <> 'RETIRED';

  return v_inspection;
end;
$function$;

CREATE OR REPLACE FUNCTION public.extend_rental(p_rental_id uuid, p_new_end timestamp with time zone, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  l public.rentals%rowtype;
begin
  perform public.require_capability(array['rental.rentals.extend'], 'prolonger une location');
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
$function$;

CREATE OR REPLACE FUNCTION public.return_rental(p_rental_id uuid, p_returned_at timestamp with time zone, p_mileage integer DEFAULT NULL::integer, p_fuel_level fuel_level DEFAULT NULL::fuel_level, p_exterior_condition text DEFAULT NULL::text, p_interior_condition text DEFAULT NULL::text, p_new_damages text DEFAULT NULL::text, p_observations text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  l                public.rentals%rowtype;
  v_return         timestamptz := coalesce(p_returned_at, now());
  v_departure      public.rental_inspections%rowtype;
  v_inspection     uuid;
begin
  perform public.require_capability(array['rental.rentals.return'], 'enregistrer le retour d''une location');
  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  -- Ni une location annulée, ni une location qui n'est pas partie.
  if l.status not in ('IN_PROGRESS', 'EXTENDED') then
    raise exception
      'Opération refusée : seule une location en cours peut être retournée. État actuel : %.',
      l.status
      using errcode = 'check_violation';
  end if;

  if l.started_at is null then
    raise exception 'Opération refusée : cette location n''est jamais partie.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.rental_inspections where rental_id = l.id and kind = 'RETURN'
  ) then
    raise exception 'Opération refusée : le retour de cette location est déjà enregistré.'
      using errcode = 'unique_violation';
  end if;

  if v_return < l.started_at then
    raise exception 'Opération refusée : le retour ne peut pas précéder le départ.'
      using errcode = 'check_violation';
  end if;

  -- --- Le compteur ne recule pas -------------------------------------------
  --
  -- Règle de bon sens, mais qui ne peut pas s'écrire en contrainte : elle
  -- compare DEUX LIGNES de la même table. La fonction est donc le seul endroit
  -- où elle tient — et c'est aussi le seul chemin d'écriture d'un retour.
  select * into v_departure
  from public.rental_inspections
  where rental_id = l.id and kind = 'DEPARTURE';

  if v_departure.mileage is not null
     and p_mileage is not null
     and p_mileage < v_departure.mileage
  then
    raise exception
      'Opération refusée : le kilométrage de retour (%) est inférieur à celui du départ (%).',
      p_mileage, v_departure.mileage
      using errcode = 'check_violation';
  end if;

  -- --- L'état des lieux de retour, d'abord ----------------------------------
  -- Il n'écrase rien : celui du départ est une AUTRE ligne, et l'unicité
  -- (rental_id, kind) garantit qu'aucun des deux ne peut être doublé.
  insert into public.rental_inspections (
    rental_id, kind, performed_at, mileage, fuel_level,
    exterior_condition, interior_condition, preexisting_damages, observations,
    created_by
  )
  values (
    l.id, 'RETURN', v_return, p_mileage, p_fuel_level,
    p_exterior_condition, p_interior_condition, p_new_damages, p_observations,
    public.current_actor()
  )
  returning id into v_inspection;

  -- --- Le calendrier revient à la réalité, et se libère ----------------------
  update public.vehicle_occupations
     set period      = tstzrange(lower(period), greatest(v_return, lower(period) + interval '1 second'), '[)'),
         is_active   = false,
         released_at = now(),
         released_by = public.current_actor()
   where source = 'RENTAL'
     and source_id = l.id
     and is_active;

  -- --- La location est rentrée, et attend son contrôle -----------------------
  -- Deux transitions successives, autorisées par le déclencheur de la
  -- migration 031 : « Retournée » constate le fait, « À contrôler » ouvre
  -- l'étape suivante.
  update public.rentals
     set returned_at       = v_return,
         status            = 'RETURNED',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.id;

  update public.rentals
     set status            = 'TO_CONTROL',
         status_changed_at = now(),
         status_changed_by = public.current_actor()
   where id = l.id;

  -- --- Le véhicule quitte « En location » ------------------------------------
  --
  -- `status = 'RENTED'` en condition : si le véhicule a été immobilisé ou mis
  -- en maintenance pendant la location, ce n'est pas au retour de l'effacer.
  update public.vehicles
     set status            = 'AVAILABLE',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.vehicle_id
     and status = 'RENTED';

  return v_inspection;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_rental(p_rental_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  l public.rentals%rowtype;
begin
  perform public.require_capability(array['rental.rentals.cancel'], 'annuler une location');
  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if l.status not in ('PREPARING', 'CONFIRMED') then
    raise exception
      'Opération refusée : une location déjà partie ne s''annule pas, elle se termine par un retour.'
      using errcode = 'check_violation';
  end if;

  update public.vehicle_occupations
     set is_active   = false,
         released_at = now(),
         released_by = public.current_actor()
   where source = 'RENTAL'
     and source_id = l.id
     and is_active;

  update public.rentals
     set status            = 'CANCELLED',
         status_reason     = p_reason,
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.id;
end;
$function$;
