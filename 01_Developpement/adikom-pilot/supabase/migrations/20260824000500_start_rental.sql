-- =============================================================================
-- ADIKOM PILOT — 035 · Départ d'une location et état des lieux
-- Étape 2.3, Lot 4
--
-- POURQUOI UNE SEULE OPÉRATION
--
-- Un départ touche QUATRE choses :
--
--   · la location — date de départ réelle, statut « En cours » ;
--   · l'état des lieux — kilométrage, carburant, états, dommages préexistants ;
--   · le véhicule — statut « En location » (DEC-025 §c) ;
--   · l'occupation — si le départ précède la période prévue.
--
-- Les enchaîner depuis l'application laisserait, à la moindre interruption,
-- une location partie sans état des lieux, ou un véhicule marqué en location
-- alors que rien n'est parti. « Une erreur ne doit jamais laisser une location
-- partiellement mise à jour » — arbitrage ADIKOM du 24 août 2026.
--
-- L'OCCUPATION SUIT LE DÉPART RÉEL
--
-- Le calendrier bloquait la période PRÉVUE. Un départ anticipé engagerait donc
-- le véhicule avant la borne inscrite, et laisserait un créneau que le système
-- croirait libre. La borne basse est avancée si nécessaire — et si un autre
-- engagement occupe ce créneau, la contrainte d'exclusion refuse le départ.
-- C'est la base qui tranche, pas l'application.
--
-- CE QUI N'EST PAS FAIT ICI
--
-- Aucun contrôle, aucune comparaison, aucun montant. Le départ CONSTATE l'état
-- du véhicule ; le rapprochement avec le retour relève du lot 6, et sa
-- valorisation n'existe pas (DEC-008, DEC-025 §i).
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
  l           public.rentals%rowtype;
  v_start     timestamptz := coalesce(p_started_at, now());
  v_inspection uuid;
  v_lower     timestamptz;
begin
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
$$;

comment on function public.start_rental is
  'Enregistre le départ d''une location : état des lieux, statut, véhicule et calendrier, en une seule opération.';

revoke execute on function public.start_rental(
  uuid, timestamptz, int, public.fuel_level, text, text, text, text
) from public, anon;
grant execute on function public.start_rental(
  uuid, timestamptz, int, public.fuel_level, text, text, text, text
) to authenticated, service_role;


-- --- Le calendrier et le parc reconnaissent le départ -------------------------
--
-- `rental.rentals.checkout` rejoint les capacités autorisées à modifier une
-- occupation — le départ peut en avancer la borne basse. Suite des migrations
-- 033 et 034 : chaque capacité est ouverte quand SA fonction existe, jamais
-- avant.

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
  )
  with check (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.cancel')
    or public.has_permission('rental.rentals.create')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.cancel')
    or public.has_permission('rental.rentals.checkout')
  );


-- --- Le statut du véhicule suit le cycle ---------------------------------------
--
-- `vehicles_update` exigeait jusqu'ici les permissions du parc. Or c'est le
-- DÉPART qui fait passer un véhicule « En location » : exiger
-- `rental.fleet.status.update` reviendrait à demander le droit d'immobiliser un
-- véhicule pour pouvoir le remettre à un client.
--
-- La policy est reprise à l'identique, augmentée des gestes du cycle qui
-- déplacent réellement le statut. Le retour suivra au lot 6.

do $$
declare v_using text;
begin
  select pg_get_expr(polqual, polrelid) into v_using
  from pg_policy p join pg_class c on c.oid = p.polrelid
  where c.relname = 'vehicles' and p.polname = 'vehicles_update';

  if v_using is null then
    raise exception 'Policy vehicles_update introuvable : migration à revoir.';
  end if;
end $$;

drop policy if exists vehicles_update on public.vehicles;

create policy vehicles_update on public.vehicles
  for update to authenticated
  using (
    public.has_permission('rental.fleet.update')
    or public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.fleet.supplier.update')
    or public.has_permission('rental.fleet.archive')
    or public.has_permission('rental.rentals.checkout')
  )
  with check (
    public.has_permission('rental.fleet.update')
    or public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.fleet.supplier.update')
    or public.has_permission('rental.fleet.archive')
    or public.has_permission('rental.rentals.checkout')
  );
