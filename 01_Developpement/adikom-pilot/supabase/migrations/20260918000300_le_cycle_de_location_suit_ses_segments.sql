-- =============================================================================
-- ADIKOM PILOT — 089 · Le cycle de location suit ses segments
-- LOT 22 — DEC-045 · Plan 02 §1.3 (quatrième obstacle)
--
-- L'OBSTACLE, TEL QUE LE PLAN L'AVAIT ÉCRIT
--
--   « `vehicle_occupations` filtré par `rental_id` — cinq fonctions :
--     `convert_reservation_to_rental`, `extend_rental`, `return_rental`,
--     `cancel_rental`, `start_rental`. `extend_rental` toucherait TOUTES les
--     occupations d'une location segmentée. »
--
-- Tant qu'une location n'avait qu'un véhicule, `source = 'RENTAL' and
-- source_id = <la location>` désignait UNE ligne. Après un remplacement, elle
-- en désigne DEUX, sur DEUX véhicules — l'une active, l'autre libérée.
--
-- Prolonger la location allongerait alors aussi l'engagement du véhicule rendu.
-- Il bloquerait un créneau pour rien, et REFUSERAIT une autre location. Le
-- défaut serait silencieux : rien n'échoue, un véhicule disponible cesse
-- simplement d'être proposé.
--
-- CE QUE CETTE MIGRATION CHANGE, ET RIEN DE PLUS
--
-- Les cinq fonctions sont reprises À L'IDENTIQUE — corps repris de leur
-- définition RÉELLE en base, non réécrit —, avec trois différences :
--
--   1. elles désignent l'occupation PAR SON SEGMENT, non par la seule location ;
--   2. elles tiennent le SEGMENT à jour en même temps que l'occupation : les
--      deux racontent la même période, et c'est vérifiable ;
--   3. `convert_reservation_to_rental` OUVRE le segment initial du contrat.
--
-- AUCUNE RÈGLE MÉTIER N'EST MODIFIÉE. Aucun statut nouveau, aucune transition
-- nouvelle, aucun montant. `supabase/tests/location.sql` et
-- `supabase/tests/rental_cycle.sql` se rejouent SANS MODIFICATION.
--
-- POURQUOI `is_active` NE SUFFISAIT PAS
--
-- Parce qu'un remplacement laisse l'occupation sortante libérée — donc le
-- filtre `is_active` aurait, par chance, désigné la bonne ligne. Mais rien ne
-- garantit cette chance : une occupation d'une location peut être active sans
-- être celle du segment courant, et l'écrire par l'appartenance plutôt que par
-- l'état est ce qui rend la règle lisible. Les deux filtres sont conservés.
-- =============================================================================


-- =============================================================================
-- 1. LA CONVERSION OUVRE LE SEGMENT INITIAL
--
-- Le segment n° 1 porte le véhicule, la période et le TARIF VERROUILLÉ que la
-- réservation a fixés. Il est une COPIE de ce que la location vient d'inscrire,
-- jamais une seconde résolution : résoudre le tarif une seconde fois exposerait
-- le contrat à une modification de la grille intervenue entre-temps (D13).
--
-- L'occupation, qui vient de CHANGER D'ORIGINE plutôt que d'être recréée, nomme
-- désormais ce segment.
-- =============================================================================

create or replace function public.convert_reservation_to_rental(p_reservation_id uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r         public.reservations%rowtype;
  v_no      text;
  v_rental  uuid;
  v_segment uuid;
begin
  perform public.require_capability(
    array['rental.rentals.create'], 'convertir une réservation en location'
  );

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

  /*
   * LE SEGMENT INITIAL — LOT 22.
   *
   * Il naît avec le contrat, et c'est lui qui rend le remplacement possible :
   * sans segment ouvert, il n'y aurait rien à clore. Son coût d'acquisition est
   * GELÉ dans la foulée par `fn_lock_rental_segment_cost`, à la date de début
   * de la période — c'est l'ENGAGEMENT, et c'est le bon moment.
   */
  insert into public.rental_segments (
    rental_id, vehicle_id, sequence_no, amendment_id, period, status,
    locked_amount, locked_unit, locked_rule_id, locked_source, locked_at,
    created_by, updated_by
  )
  values (
    v_rental, r.vehicle_id, 1, null, r.period, 'ACTIVE',
    r.locked_amount, r.locked_unit, r.locked_rule_id, r.locked_source, r.locked_at,
    public.current_actor(), public.current_actor()
  )
  returning id into v_segment;

  -- L'occupation CHANGE D'ORIGINE au lieu d'être recréée — toute autre méthode
  -- ouvrirait une fenêtre pendant laquelle le véhicule paraîtrait libre — et
  -- nomme désormais LE SEGMENT qu'elle sert.
  update public.vehicle_occupations
     set source            = 'RENTAL',
         source_id         = v_rental,
         rental_segment_id = v_segment,
         reason            = 'Location ' || v_no
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

comment on function public.convert_reservation_to_rental(uuid) is
  'Transforme une réservation confirmée en location, en reportant le tarif verrouillé, en OUVRANT le segment initial (LOT 22) et en changeant l''origine de l''occupation.';


-- =============================================================================
-- 2. LE DÉPART SUIT LE SEGMENT OUVERT
--
-- Le calendrier bloquait la période PRÉVUE. Un départ anticipé engagerait le
-- véhicule avant la borne inscrite et laisserait un créneau que le système
-- croirait libre. La borne basse de l'occupation est donc avancée — et le
-- SEGMENT la suit, pour que les deux disent la même période.
-- =============================================================================

create or replace function public.start_rental(
  p_rental_id            uuid,
  p_started_at           timestamptz,
  p_mileage              int     default null,
  p_fuel_level           public.fuel_level default null,
  p_exterior_condition   text    default null,
  p_interior_condition   text    default null,
  p_preexisting_damages  text    default null,
  p_observations         text    default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  l            public.rentals%rowtype;
  v_start      timestamptz := coalesce(p_started_at, now());
  v_inspection uuid;
  v_segment    uuid;
  v_lower      timestamptz;
begin
  perform public.require_capability(
    array['rental.rentals.checkout'], 'enregistrer le départ d''une location'
  );

  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

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

  -- --- Le calendrier ET le segment suivent le départ réel -------------------
  select id, lower(period) into v_segment, v_lower
  from public.rental_segments
  where rental_id = l.id and status = 'ACTIVE';

  if v_segment is not null and v_start < v_lower then
    update public.rental_segments
       set period     = tstzrange(v_start, upper(period), '[)'),
           updated_by = public.current_actor()
     where id = v_segment;

    update public.vehicle_occupations
       set period = tstzrange(v_start, upper(period), '[)')
     where source = 'RENTAL'
       and source_id = l.id
       and rental_segment_id = v_segment
       and is_active;
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
  update public.vehicles
     set status            = 'RENTED',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.vehicle_id
     and status <> 'RETIRED';

  return v_inspection;
end;
$$;

comment on function public.start_rental(uuid, timestamptz, int, public.fuel_level, text, text, text, text) is
  'Enregistre le départ d''une location : état des lieux, statut, véhicule, calendrier ET segment ouvert, en une seule opération.';


-- =============================================================================
-- 3. LA PROLONGATION N'ALLONGE QUE LE SEGMENT OUVERT
--
-- 🟥 C'EST ICI QUE L'OBSTACLE DU PLAN 02 §1.3 SE MATÉRIALISAIT.
--
-- Sans le filtre par segment, prolonger une location ayant changé de véhicule
-- allongerait AUSSI l'engagement du véhicule rendu : il bloquerait un créneau
-- pour rien, et refuserait une autre location. Rien n'échouerait — un véhicule
-- disponible cesserait simplement d'être proposé.
--
-- La contrainte d'exclusion reste le juge : si un autre engagement occupe la
-- fenêtre demandée, la prolongation est refusée PAR LA BASE.
-- =============================================================================

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
  l         public.rentals%rowtype;
  v_segment uuid;
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

  select id into v_segment
  from public.rental_segments
  where rental_id = l.id and status = 'ACTIVE'
  for update;

  if v_segment is null then
    raise exception
      'Opération refusée : cette location n''a aucun segment ouvert. Son historique de véhicules est incomplet.'
      using errcode = 'no_data_found';
  end if;

  -- Étend la période bloquée DU SEUL SEGMENT OUVERT. Un chevauchement lève ici,
  -- pas plus tard.
  update public.vehicle_occupations
     set period = tstzrange(lower(period), p_new_end, '[)')
   where source = 'RENTAL'
     and source_id = l.id
     and rental_segment_id = v_segment
     and is_active;

  update public.rental_segments
     set period     = tstzrange(lower(period), p_new_end, '[)'),
         updated_by = public.current_actor()
   where id = v_segment;

  /*
   * LE TARIF N'EST PAS TOUCHÉ.
   *
   * `locked_amount` reste celui du segment. Module 05 §34 évoque un « nouveau
   * montant » sans en définir le calcul, et A-7 n'est pas tranchée. Le LOT 22
   * livre le MOYEN de changer un tarif — `change_rental_rate`, acte explicite,
   * motivé, permissionné, historisé — et n'applique aucun barème de lui-même.
   */
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

comment on function public.extend_rental(uuid, timestamptz, text) is
  'Prolonge une location : SEULS le segment ouvert et son occupation s''allongent. Le véhicule remplacé en cours de contrat reste libéré à sa date (LOT 22).';


-- =============================================================================
-- 4. LE RETOUR CLÔT LE SEGMENT OUVERT
--
-- L'occupation bloquait jusqu'au retour ATTENDU. La borne haute est portée à la
-- date RÉELLE, dans la MÊME écriture qui libère la ligne : `is_active` devenant
-- faux, la contrainte d'exclusion ne s'y applique plus, et un retour tardif ne
-- peut pas buter sur un engagement postérieur.
--
-- Le SEGMENT suit, et passe « terminé » : la chronologie du contrat s'arrête
-- exactement où le véhicule est rentré.
-- =============================================================================

create or replace function public.return_rental(
  p_rental_id           uuid,
  p_returned_at         timestamptz,
  p_mileage             int     default null,
  p_fuel_level          public.fuel_level default null,
  p_exterior_condition  text    default null,
  p_interior_condition  text    default null,
  p_new_damages         text    default null,
  p_observations        text    default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  l            public.rentals%rowtype;
  v_return     timestamptz := coalesce(p_returned_at, now());
  v_departure  public.rental_inspections%rowtype;
  v_inspection uuid;
  v_segment    uuid;
begin
  perform public.require_capability(
    array['rental.rentals.return'], 'enregistrer le retour d''une location'
  );

  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

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

  -- --- Le segment ouvert, son calendrier, et rien d'autre --------------------
  select id into v_segment
  from public.rental_segments
  where rental_id = l.id and status = 'ACTIVE'
  for update;

  update public.vehicle_occupations
     set period      = tstzrange(lower(period),
                                 greatest(v_return, lower(period) + interval '1 second'), '[)'),
         is_active   = false,
         released_at = now(),
         released_by = public.current_actor()
   where source = 'RENTAL'
     and source_id = l.id
     and (rental_segment_id = v_segment or v_segment is null)
     and is_active;

  if v_segment is not null then
    update public.rental_segments
       set period     = tstzrange(lower(period),
                                  greatest(v_return, lower(period) + interval '1 second'), '[)'),
           status     = 'ENDED',
           updated_by = public.current_actor()
     where id = v_segment;
  end if;

  -- --- La location est rentrée, et attend son contrôle -----------------------
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
  update public.vehicles
     set status            = 'AVAILABLE',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.vehicle_id
     and status = 'RENTED';

  return v_inspection;
end;
$$;

comment on function public.return_rental(uuid, timestamptz, int, public.fuel_level, text, text, text, text) is
  'Enregistre le retour d''une location : état des lieux, dates, calendrier, véhicule ET clôture du segment ouvert. Ne valorise aucun écart (DEC-025 §i).';


-- =============================================================================
-- 5. L'ANNULATION ANNULE LE SEGMENT OUVERT
--
-- Une location s'annule AVANT son départ : son segment ouvert n'a jamais été
-- exécuté. Il devient ANNULÉ — et non « terminé », qui laisserait croire qu'un
-- véhicule a servi.
--
-- Les segments DÉJÀ CLOS d'un contrat annulé — s'il a connu un remplacement
-- avant le départ — gardent leur état : ils disent ce qui s'est passé, et
-- l'annulation ne réécrit pas le passé.
-- =============================================================================

create or replace function public.cancel_rental(
  p_rental_id uuid,
  p_reason    text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
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

  -- L'occupation est LIBÉRÉE, pas effacée : la trace de ce qui avait été engagé
  -- demeure (Règles location §55, CLAUDE.md §22). Toutes les occupations de la
  -- location sont visées — un contrat annulé n'engage plus aucun véhicule.
  update public.vehicle_occupations
     set is_active   = false,
         released_at = now(),
         released_by = public.current_actor()
   where source = 'RENTAL'
     and source_id = l.id
     and is_active;

  update public.rental_segments
     set status     = 'CANCELLED',
         updated_by = public.current_actor()
   where rental_id = l.id
     and status = 'ACTIVE';

  update public.rentals
     set status            = 'CANCELLED',
         status_reason     = p_reason,
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.id;
end;
$$;

comment on function public.cancel_rental(uuid, text) is
  'Annule une location avant son départ, libère ses occupations et ANNULE son segment ouvert — qui n''a jamais été exécuté (LOT 22).';


-- =============================================================================
-- 6. CONTRÔLES
-- =============================================================================

do $$
declare
  v_fn  text;
  v_src text;
  v_manquants text[] := '{}';
begin
  -- Les cinq fonctions désignent l'occupation PAR SON SEGMENT.
  foreach v_fn in array array[
    'public.start_rental(uuid, timestamptz, int, public.fuel_level, text, text, text, text)',
    'public.extend_rental(uuid, timestamptz, text)',
    'public.return_rental(uuid, timestamptz, int, public.fuel_level, text, text, text, text)',
    'public.convert_reservation_to_rental(uuid)'
  ] loop
    select pg_get_functiondef(v_fn::regprocedure) into v_src;

    if v_src not like '%rental_segment_id%' then
      v_manquants := v_manquants || v_fn;
    end if;
  end loop;

  if array_length(v_manquants, 1) is not null then
    raise exception
      'Ces fonctions du cycle ignorent encore les segments : %', v_manquants;
  end if;

  -- 🟥 LE POINT DU PLAN 02 §1.3 : la prolongation ne touche QUE le segment ouvert.
  select pg_get_functiondef('public.extend_rental(uuid, timestamptz, text)'::regprocedure)
    into v_src;

  if v_src not like '%rental_segment_id = v_segment%' then
    raise exception
      'La prolongation ne filtre pas l''occupation par son segment : elle allongerait l''engagement d''un véhicule déjà rendu.';
  end if;

  -- Les cinq restent SECURITY INVOKER (doctrine D4).
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.convert_reservation_to_rental(uuid)'::regprocedure,
      'public.start_rental(uuid, timestamptz, int, public.fuel_level, text, text, text, text)'::regprocedure,
      'public.extend_rental(uuid, timestamptz, text)'::regprocedure,
      'public.return_rental(uuid, timestamptz, int, public.fuel_level, text, text, text, text)'::regprocedure,
      'public.cancel_rental(uuid, text)'::regprocedure
    ) and prosecdef
  ) then
    raise exception 'Une fonction du cycle est devenue SECURITY DEFINER (doctrine D4).';
  end if;

  raise notice
    '[OK] 089. Les cinq fonctions du cycle désignent l''occupation par son segment ; la prolongation n''allonge plus l''engagement d''un véhicule rendu.';
end $$;


-- --- Droits d'exécution : repris à l'identique --------------------------------
-- DEC-022 : un droit se retire à chaque source qui l'accorde — PUBLIC et anon.
-- `create or replace` conserve les droits existants ; la reprise explicite
-- garantit qu'une fonction recréée ailleurs ne les perde pas en chemin.

revoke execute on function public.convert_reservation_to_rental(uuid) from public, anon;
revoke execute on function public.cancel_rental(uuid, text) from public, anon;
revoke execute on function public.extend_rental(uuid, timestamptz, text) from public, anon;
revoke execute on function public.start_rental(
  uuid, timestamptz, int, public.fuel_level, text, text, text, text
) from public, anon;
revoke execute on function public.return_rental(
  uuid, timestamptz, int, public.fuel_level, text, text, text, text
) from public, anon;

grant execute on function public.convert_reservation_to_rental(uuid) to authenticated, service_role;
grant execute on function public.cancel_rental(uuid, text) to authenticated, service_role;
grant execute on function public.extend_rental(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.start_rental(
  uuid, timestamptz, int, public.fuel_level, text, text, text, text
) to authenticated, service_role;
grant execute on function public.return_rental(
  uuid, timestamptz, int, public.fuel_level, text, text, text, text
) to authenticated, service_role;
