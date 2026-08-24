-- =============================================================================
-- ADIKOM PILOT — 036 · Retour d'une location et contrôle
-- Étape 2.3, Lot 6
--
-- POURQUOI UNE SEULE OPÉRATION
--
-- Un retour touche CINQ choses :
--
--   · l'état des lieux de retour — relevés, états, nouveaux dommages ;
--   · la location — date de retour réelle, puis « Retournée » et « À contrôler » ;
--   · l'occupation — libérée, et ramenée à la durée réellement occupée ;
--   · le véhicule — il quitte « En location » ;
--   · rien d'autre : aucun montant, aucun écart valorisé.
--
-- Les enchaîner depuis l'application laisserait, à la moindre interruption, un
-- véhicule rendu que le calendrier croit encore engagé, ou une location
-- retournée sans état des lieux. « Une erreur doit laisser l'ensemble dans son
-- état précédent » — arbitrage ADIKOM du 24 août 2026.
--
-- L'OCCUPATION EST RAMENÉE À LA RÉALITÉ, PUIS LIBÉRÉE
--
-- Elle bloquait jusqu'au retour ATTENDU. Un retour anticipé laissait le
-- véhicule engagé pour rien ; un retour tardif laissait un créneau que le
-- système croyait libre alors que le véhicule était dehors. La borne haute est
-- donc portée à la date réelle, dans la MÊME écriture qui libère la ligne :
-- puisque `is_active` devient faux, la contrainte d'exclusion ne s'y applique
-- plus, et un retour tardif ne peut pas buter sur un engagement postérieur.
--
-- CE QUI N'EST PAS FAIT ICI, ET NE DOIT PAS L'ÊTRE
--
-- Aucun écart n'est valorisé : ni carburant manquant, ni kilométrage
-- supplémentaire, ni retard, ni dommage. DEC-008 laisse ces barèmes non
-- définis, et DEC-025 §i pose que le contrôle CONSTATE. Le système compare et
-- affiche ; il n'invente aucun montant.
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
  l                public.rentals%rowtype;
  v_return         timestamptz := coalesce(p_returned_at, now());
  v_departure      public.rental_inspections%rowtype;
  v_inspection     uuid;
begin
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
$$;

comment on function public.return_rental is
  'Enregistre le retour d''une location : état des lieux, dates, calendrier et véhicule, en une seule opération. Ne valorise aucun écart (DEC-025 §i).';

revoke execute on function public.return_rental(
  uuid, timestamptz, int, public.fuel_level, text, text, text, text
) from public, anon;
grant execute on function public.return_rental(
  uuid, timestamptz, int, public.fuel_level, text, text, text, text
) to authenticated, service_role;


-- --- Le calendrier et le parc reconnaissent le retour ---------------------------
--
-- Suite des migrations 033, 034 et 035 : chaque capacité est ouverte quand SA
-- fonction existe, jamais avant. Avec le retour, la liste du cycle est
-- complète pour l'Étape 2.3.

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
  )
  with check (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.cancel')
    or public.has_permission('rental.rentals.create')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.cancel')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
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
  )
  with check (
    public.has_permission('rental.fleet.update')
    or public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.fleet.supplier.update')
    or public.has_permission('rental.fleet.archive')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
  );
