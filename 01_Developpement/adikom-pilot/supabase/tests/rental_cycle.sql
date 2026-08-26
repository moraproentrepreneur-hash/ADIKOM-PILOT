-- =============================================================================
-- ADIKOM PILOT — Recette du cycle d'exploitation (Étape 2.3, DEC-021 / DEC-025)
--
-- Vérifie les garanties que la BASE doit porter seule, indépendamment de toute
-- interface : non-collision, verrouillage du tarif, transitions de statut,
-- interdiction de suppression, atomicité des opérations du cycle.
--
-- Exécution :
--   npm run db:verify:cycle
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne
-- RLS. Il contrôle donc le SCHÉMA. Les policies RLS seront éprouvées avec de
-- vraies sessions utilisateur lorsque les écrans existeront (lots 2 et suivants).
--
-- La transaction est annulée en fin de script : aucun résidu en base, et les
-- données DEMO ne sont jamais touchées.
-- =============================================================================

begin;

create temporary table recette_ids (
  client_id      uuid,
  category_id    uuid,
  vehicle_id     uuid,
  rule_id        uuid,
  reservation_id uuid,
  rental_id      uuid
) on commit drop;

insert into recette_ids values (null, null, null, null, null, null);


-- --- 1. Types et tables du cycle ----------------------------------------------
do $$
declare
  expected_tables text[] := array[
    'reservations', 'rentals', 'rental_inspections', 'rental_inspection_photos'
  ];
  expected_types  text[] := array[
    'reservation_status', 'rental_status', 'inspection_kind', 'fuel_level'
  ];
  missing text[];
begin
  select array_agg(t) into missing
  from unnest(expected_tables) t
  where not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = t
  );
  if missing is not null then
    raise exception 'Tables manquantes : %', missing;
  end if;

  select array_agg(t) into missing
  from unnest(expected_types) t
  where not exists (select 1 from pg_type where typname = t);
  if missing is not null then
    raise exception 'Types manquants : %', missing;
  end if;

  raise notice '[OK] 1. Les 4 tables et les 4 types du cycle sont présents.';
end $$;


-- --- 2. Aucune suppression possible --------------------------------------------
-- Même contrôle que le référentiel : la policy ET le droit, car l'un sans
-- l'autre ne protège rien (leçon de `supplier_bank_details`).
do $$
declare
  tables text[] := array[
    'reservations', 'rentals', 'rental_inspections', 'rental_inspection_photos'
  ];
  faulty text[];
begin
  select array_agg(c.relname) into faulty
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = any(tables) and not c.relrowsecurity;
  if faulty is not null then
    raise exception 'RLS absente sur : %', faulty;
  end if;

  select array_agg(distinct c.relname) into faulty
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  where c.relname = any(tables) and p.polcmd in ('d', '*');
  if faulty is not null then
    raise exception 'Policy autorisant la suppression sur : %', faulty;
  end if;

  select array_agg(t) into faulty
  from unnest(tables) t
  where has_table_privilege('authenticated', 'public.' || t, 'DELETE');
  if faulty is not null then
    raise exception 'Droit DELETE accordé à « authenticated » sur : %', faulty;
  end if;

  raise notice '[OK] 2. RLS activée, aucune suppression possible sur le cycle.';
end $$;


-- --- 3. Jeu d'essai --------------------------------------------------------------
do $$
declare
  v_cat uuid; v_cli uuid; v_veh uuid; v_rule uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RECETTE-CYCLE', 'Catégorie de recette du cycle')
  returning id into v_cat;

  insert into public.clients (client_no, type, legal_name, phone)
  values (public.next_number('client'), 'COMPANY', 'RECETTE CYCLE — Client', '+269 000')
  returning id into v_cli;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'CYCLE', 'RC-CYCLE-01', 'OWNED', 'AVAILABLE')
  returning id into v_veh;

  -- Tarif standard de catégorie : 100 000 KMF / jour.
  insert into public.pricing_rules (category_id, amount, unit)
  values (v_cat, 100000, 'DAY')
  returning id into v_rule;

  update recette_ids
     set client_id = v_cli, category_id = v_cat, vehicle_id = v_veh, rule_id = v_rule;

  raise notice '[OK] 3. Jeu de recette créé : catégorie, client, véhicule, tarif.';
end $$;


-- --- 4. Confirmation : tarif verrouillé et occupation posée ----------------------
do $$
declare
  v_res uuid; v_cli uuid; v_veh uuid;
  v_amount bigint; v_unit public.pricing_unit; v_status public.reservation_status;
  v_occ int;
begin
  select client_id, vehicle_id into v_cli, v_veh from recette_ids;

  insert into public.reservations (reservation_no, client_id, category_id, period)
  select public.next_number('reservation'), v_cli, category_id,
         tstzrange(now() + interval '10 days', now() + interval '13 days', '[)')
  from recette_ids
  returning id into v_res;

  update recette_ids set reservation_id = v_res;

  perform public.confirm_reservation(v_res, v_veh);

  select status, locked_amount, locked_unit into v_status, v_amount, v_unit
  from public.reservations where id = v_res;

  if v_status <> 'CONFIRMED' then
    raise exception 'Statut attendu CONFIRMED, obtenu %.', v_status;
  end if;
  if v_amount <> 100000 or v_unit <> 'DAY' then
    raise exception 'Tarif verrouillé inattendu : % %.', v_amount, v_unit;
  end if;

  select count(*) into v_occ
  from public.vehicle_occupations
  where source = 'RESERVATION' and source_id = v_res and is_active;

  if v_occ <> 1 then
    raise exception 'Occupation attendue : 1, obtenue %.', v_occ;
  end if;

  raise notice '[OK] 4. Confirmation : tarif verrouillé à 100 000 KMF/jour, occupation posée.';
end $$;


-- --- 5. Le tarif verrouillé est insensible à la grille ----------------------------
-- Module 05 §21 : « une modification ultérieure des conditions tarifaires ne
-- doit pas modifier les anciennes réservations ».
do $$
declare
  v_amount bigint; v_resolved bigint;
begin
  update public.pricing_rules set amount = 250000 where id = (select rule_id from recette_ids);

  select locked_amount into v_amount
  from public.reservations where id = (select reservation_id from recette_ids);

  if v_amount <> 100000 then
    raise exception 'Le tarif verrouillé a bougé : % au lieu de 100 000.', v_amount;
  end if;

  -- La grille, elle, a bien changé : le verrouillage est une copie, pas un gel.
  select amount into v_resolved
  from public.resolve_pricing_rule(
    (select client_id from recette_ids), (select vehicle_id from recette_ids), current_date
  );

  if v_resolved <> 250000 then
    raise exception 'La grille n''a pas été modifiée : résolution à %.', v_resolved;
  end if;

  raise notice '[OK] 5. Tarif verrouillé immunisé (100 000) alors que la grille passe à 250 000.';
end $$;


-- --- 6. Non-collision garantie par la base -----------------------------------------
do $$
declare
  v_res2 uuid; v_caught boolean := false;
begin
  insert into public.reservations (reservation_no, client_id, vehicle_id, period)
  select public.next_number('reservation'), client_id, vehicle_id,
         -- Chevauche d'un jour la réservation confirmée.
         tstzrange(now() + interval '12 days', now() + interval '15 days', '[)')
  from recette_ids
  returning id into v_res2;

  begin
    perform public.confirm_reservation(v_res2);
  exception when others then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'Deux engagements se chevauchent sur le même véhicule.';
  end if;

  -- Période adjacente, sans recouvrement : acceptée.
  update public.reservations
     set period = tstzrange(now() + interval '13 days', now() + interval '15 days', '[)')
   where id = v_res2;

  perform public.confirm_reservation(v_res2);

  perform public.cancel_reservation(v_res2, 'Recette : nettoyage');

  raise notice '[OK] 6. Chevauchement refusé, période adjacente acceptée.';
end $$;


-- --- 7. Annulation : l'occupation est libérée, pas effacée ---------------------------
do $$
declare
  v_active int; v_released int;
begin
  select count(*) filter (where is_active),
         count(*) filter (where not is_active and released_at is not null)
    into v_active, v_released
  from public.vehicle_occupations o
  join public.reservations r on r.id = o.source_id
  where o.source = 'RESERVATION' and r.status = 'CANCELLED';

  if v_active > 0 then
    raise exception 'Une réservation annulée bloque encore % période(s).', v_active;
  end if;
  if v_released = 0 then
    raise exception 'L''occupation annulée a disparu au lieu d''être libérée.';
  end if;

  raise notice '[OK] 7. Annulation : occupation libérée, trace conservée.';
end $$;


-- --- 8. Conversion en location -------------------------------------------------------
do $$
declare
  v_rental uuid; v_no text; v_res_status public.reservation_status;
  v_amount bigint; v_src public.occupation_source; v_src_id uuid;
begin
  v_rental := public.convert_reservation_to_rental((select reservation_id from recette_ids));
  update recette_ids set rental_id = v_rental;

  select rental_no, locked_amount into v_no, v_amount from public.rentals where id = v_rental;

  if v_no !~ '^LOC-[0-9]{4}-[0-9]{6}$' then
    raise exception 'Numéro de location inattendu : %.', v_no;
  end if;
  if v_amount <> 100000 then
    raise exception 'Le tarif verrouillé n''a pas suivi : %.', v_amount;
  end if;

  select status into v_res_status
  from public.reservations where id = (select reservation_id from recette_ids);
  if v_res_status <> 'CONVERTED' then
    raise exception 'Réservation attendue CONVERTED, obtenue %.', v_res_status;
  end if;

  -- L'occupation a CHANGÉ D'ORIGINE : aucune fenêtre pendant laquelle le
  -- véhicule aurait paru libre.
  select source, source_id into v_src, v_src_id
  from public.vehicle_occupations
  where source_id = v_rental and is_active;

  if v_src is distinct from 'RENTAL' or v_src_id is distinct from v_rental then
    raise exception 'L''occupation n''a pas été reprise par la location.';
  end if;

  raise notice '[OK] 8. Conversion : % créée, tarif reporté, occupation reprise.', v_no;
end $$;


-- --- 9. Transitions de statut imposées par la base -------------------------------------
do $$
declare
  v_rental uuid := (select rental_id from recette_ids);
  v_res    uuid := (select reservation_id from recette_ids);
  v_caught boolean;
begin
  -- Une location en préparation ne saute pas à « À facturer ».
  v_caught := false;
  begin
    update public.rentals set status = 'TO_INVOICE' where id = v_rental;
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then
    raise exception 'Une location a pu passer de PREPARING à TO_INVOICE.';
  end if;

  -- Une réservation convertie est un état terminal.
  v_caught := false;
  begin
    update public.reservations set status = 'CANCELLED' where id = v_res;
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then
    raise exception 'Une réservation convertie a pu être annulée.';
  end if;

  -- Le chemin légitime, lui, passe.
  update public.rentals set status = 'CONFIRMED' where id = v_rental;
  update public.rentals
     set status = 'IN_PROGRESS', started_at = now() + interval '10 days'
   where id = v_rental;

  raise notice '[OK] 9. Transitions incohérentes refusées, chemin légitime accepté.';
end $$;


-- --- 10. Une location en cours est nécessairement partie ---------------------------------
do $$
declare
  v_caught boolean := false;
begin
  begin
    update public.rentals set started_at = null where id = (select rental_id from recette_ids);
  exception when check_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Une location en cours a pu perdre sa date de départ.';
  end if;

  raise notice '[OK] 10. Statut et faits indissociables : départ obligatoire dès « En cours ».';
end $$;


-- --- 11. Prolongation : la contrainte d'exclusion arbitre ---------------------------------
do $$
declare
  v_rental uuid := (select rental_id from recette_ids);
  v_veh    uuid := (select vehicle_id from recette_ids);
  v_end    timestamptz;
  v_caught boolean := false;
begin
  select expected_return_at into v_end from public.rentals where id = v_rental;

  -- Prolongation libre : acceptée.
  perform public.extend_rental(v_rental, v_end + interval '1 day', 'Recette : prolongation');

  select expected_return_at into v_end from public.rentals where id = v_rental;

  if (select status from public.rentals where id = v_rental) <> 'EXTENDED' then
    raise exception 'La location n''est pas passée en « Prolongée ».';
  end if;

  if (select upper(period) from public.vehicle_occupations
      where source_id = v_rental and is_active) <> v_end then
    raise exception 'La période bloquée n''a pas suivi la prolongation.';
  end if;

  -- Un autre engagement occupe la fenêtre suivante.
  insert into public.vehicle_occupations (vehicle_id, source, period, reason)
  values (v_veh, 'IMMOBILIZATION',
          tstzrange(v_end, v_end + interval '5 days', '[)'), 'Recette : blocage');

  begin
    perform public.extend_rental(v_rental, v_end + interval '2 days', 'Recette : refus attendu');
  exception when others then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Une prolongation a empiété sur une période déjà engagée.';
  end if;

  raise notice '[OK] 11. Prolongation acceptée puis refusée par la contrainte d''exclusion.';
end $$;


-- --- 12. États des lieux : un départ, un retour ---------------------------------------------
do $$
declare
  v_rental uuid := (select rental_id from recette_ids);
  v_caught boolean := false;
begin
  insert into public.rental_inspections (rental_id, kind, mileage, fuel_level)
  values (v_rental, 'DEPARTURE', 50000, 'THREE_QUARTERS');

  insert into public.rental_inspections (rental_id, kind, mileage, fuel_level)
  values (v_rental, 'RETURN', 50800, 'HALF');

  begin
    insert into public.rental_inspections (rental_id, kind, mileage)
    values (v_rental, 'DEPARTURE', 51000);
  exception when unique_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Deux états des lieux de départ ont pu coexister.';
  end if;

  -- Le contrôle compare des colonnes identiques : c'est la raison de la table
  -- unique. 800 km parcourus, carburant de 3/4 à 1/2 — CONSTAT, sans montant.
  if (select max(mileage) - min(mileage) from public.rental_inspections
      where rental_id = v_rental) <> 800 then
    raise exception 'La comparaison départ / retour ne donne pas 800 km.';
  end if;

  raise notice '[OK] 12. Un seul départ et un seul retour ; comparaison possible (800 km).';
end $$;


-- --- 13. Catalogue : 152 permissions, les quatre capacités servies présentes ---------------
--
-- Quatre, et non six. `rental.reservations.download` et `.print` ont été
-- retirées le 26/08/2026 : aucun document de réservation n'existe, et un
-- catalogue qui déclare une capacité inexistante trompe qui attribue les
-- droits (CLAUDE.md §19 bis, migration 037).
do $$
declare
  attendues text[] := array[
    'rental.reservations.export',
    'rental.rentals.export', 'rental.rentals.download', 'rental.rentals.print'
  ];
  retirees text[] := array[
    'rental.reservations.download', 'rental.reservations.print'
  ];
  manquantes text[];
  survivantes text[];
  total int;
  peu_sensibles int;
begin
  select array_agg(c) into manquantes
  from unnest(attendues) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if manquantes is not null then
    raise exception 'Permissions documentaires manquantes : %', manquantes;
  end if;

  -- Le retrait est vérifié POSITIVEMENT : sans cela, une migration 037 non
  -- appliquée passerait inaperçue tant que le total reste juste par ailleurs.
  select array_agg(c) into survivantes
  from unnest(retirees) c
  where exists (select 1 from public.permissions p where p.code = c);

  if survivantes is not null then
    raise exception
      'Permissions sans fonctionnalité encore au catalogue : %', survivantes;
  end if;

  -- DEC-025 §j : toutes sensibles — elles exposent client, période et montant.
  select count(*) into peu_sensibles
  from public.permissions where code = any(attendues) and not is_sensitive;

  if peu_sensibles > 0 then
    raise exception '% permission(s) du cycle non marquée(s) sensible(s).', peu_sensibles;
  end if;

  select count(*) into total from public.permissions;

  if total <> 152 then
    raise exception 'Catalogue attendu à 152 permissions, obtenu %.', total;
  end if;

  raise notice '[OK] 13. Catalogue : 152 permissions, les 4 capacités du cycle sont sensibles.';
end $$;


do $$ begin
  raise notice '';
  raise notice '[OK] Recette du cycle d''exploitation complète — Étape 2.3, Lot 1.';
end $$;

rollback;
