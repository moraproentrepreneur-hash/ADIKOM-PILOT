-- =============================================================================
-- ADIKOM PILOT — 033 · Le calendrier s'ouvre aux écritures du cycle
-- Étape 2.3, Lot 2
--
-- CE QUE LA RECETTE A RÉVÉLÉ
--
-- `confirm_reservation` échouait silencieusement : la réservation restait en
-- brouillon, sans message utile. La cause n'était pas dans la fonction, mais
-- dans les policies de `vehicle_occupations`, écrites par la migration 018 à
-- une époque où SEULES les immobilisations écrivaient dans cette table :
--
--   insert with check (has_permission('rental.fleet.status.update'))
--   update using      (has_permission('rental.fleet.status.update'))
--
-- Un utilisateur habilité à confirmer une réservation n'a aucune raison de
-- détenir le droit d'immobiliser un véhicule. Il ne pouvait donc pas poser
-- l'occupation que sa confirmation exige.
--
-- DEC-021 §3 avait prévu que « les réservations, locations et maintenances y
-- écriront aux étapes 2.3 et 2.4 sans modification du schéma ». C'est exact
-- pour le SCHÉMA — aucune colonne ne change ici. Les POLICIES, elles, devaient
-- reconnaître les nouvelles origines.
--
-- POURQUOI PAS UNE FONCTION `SECURITY DEFINER`
--
-- Faire écrire les fonctions du cycle avec les droits du propriétaire aurait
-- résolu le problème en contournant RLS. C'eût été échanger une barrière
-- contre une commodité : DEC-011 veut deux barrières indépendantes, et la
-- seconde doit rester la base. Les policies disent donc la vérité — plusieurs
-- capacités écrivent dans ce calendrier — plutôt que de la masquer.
--
-- PÉRIMÈTRE
--
-- Seules les capacités dont la fonction EXISTE aujourd'hui sont ajoutées :
-- confirmer, annuler, convertir, prolonger. Le départ et le retour écriront
-- aussi dans cette table, mais leurs fonctions relèvent des lots 4 et 6 : leurs
-- policies seront ouvertes avec elles, pas « au cas où » (CLAUDE.md §29).
-- =============================================================================

drop policy if exists vehicle_occupations_insert on public.vehicle_occupations;
drop policy if exists vehicle_occupations_update on public.vehicle_occupations;

-- Poser une période : immobiliser un véhicule, ou engager une réservation.
create policy vehicle_occupations_insert on public.vehicle_occupations
  for insert to authenticated
  with check (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.confirm')
  );

-- Modifier une période : lever une immobilisation, libérer une réservation
-- annulée, transférer l'occupation à la location née de la conversion, ou
-- l'étendre lors d'une prolongation.
create policy vehicle_occupations_update on public.vehicle_occupations
  for update to authenticated
  using (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.cancel')
    or public.has_permission('rental.rentals.create')
    or public.has_permission('rental.rentals.extend')
  )
  with check (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.cancel')
    or public.has_permission('rental.rentals.create')
    or public.has_permission('rental.rentals.extend')
  );

-- La lecture n'a pas à changer : elle admettait déjà `rental.reservations.view`
-- et `rental.rentals.view` en plus du parc. Aucune policy DELETE, ici non plus.
