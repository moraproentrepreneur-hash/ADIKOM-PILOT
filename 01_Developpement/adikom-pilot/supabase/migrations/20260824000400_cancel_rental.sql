-- =============================================================================
-- ADIKOM PILOT — 034 · Annulation d'une location avant départ
-- Étape 2.3, Lot 3
--
-- POURQUOI UNE FONCTION
--
-- Annuler une location touche deux tables : la location passe à « Annulée », et
-- son occupation cesse de bloquer le calendrier. Les séparer laisserait, entre
-- les deux écritures, une location annulée dont le véhicule reste engagé — ou
-- l'inverse. Même raisonnement que `cancel_reservation` (migration 031).
--
-- L'occupation est LIBÉRÉE, pas effacée : la trace de ce qui avait été engagé
-- demeure (Règles location §55, CLAUDE.md §22).
--
-- PÉRIMÈTRE : AVANT LE DÉPART, ET SEULEMENT AVANT
--
-- Une location partie ne s'annule pas — elle se termine par un retour. Le
-- déclencheur de transition de la migration 031 l'impose déjà ; la fonction le
-- vérifie en amont pour rendre un message compréhensible plutôt qu'une
-- violation de contrainte.
--
-- POLICY
--
-- `rental.rentals.cancel` rejoint les capacités autorisées à modifier le
-- calendrier. La migration 033 avait ouvert celles dont la fonction existait
-- alors ; celle-ci existe maintenant. Le départ et le retour suivront aux
-- lots 4 et 6, avec les leurs.
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
$$;

comment on function public.cancel_rental is
  'Annule une location avant son départ et libère son occupation sans l''effacer (Règles location §55).';

revoke execute on function public.cancel_rental(uuid, text) from public, anon;
grant  execute on function public.cancel_rental(uuid, text) to authenticated, service_role;


-- --- Le calendrier reconnaît l'annulation d'une location ------------------------

drop policy if exists vehicle_occupations_update on public.vehicle_occupations;

create policy vehicle_occupations_update on public.vehicle_occupations
  for update to authenticated
  using (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.cancel')
    or public.has_permission('rental.rentals.create')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.cancel')
  )
  with check (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.cancel')
    or public.has_permission('rental.rentals.create')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.cancel')
  );
