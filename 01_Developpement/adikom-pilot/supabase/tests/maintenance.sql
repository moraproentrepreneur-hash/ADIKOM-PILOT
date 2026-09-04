-- =============================================================================
-- ADIKOM PILOT — Recette de la maintenance (Étape 2.4, LOT 2)
--
-- Vérifie les garanties que la BASE doit porter seule : structure, RLS,
-- interdiction de suppression, transitions, cohérence des rattachements,
-- atomicité — et surtout les deux points qui font tout ce lot :
--
--   · une maintenance NON IMMOBILISANTE ne crée AUCUNE occupation ;
--   · une immobilisation qui chevauche un engagement est REFUSÉE PAR LA BASE,
--     et la maintenance elle-même n'est alors pas créée.
--
-- Exécution :
--   npm run db:verify:maintenance
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne
-- RLS. Il contrôle donc le SCHÉMA ; les policies sont éprouvées avec de vraies
-- sessions par `npm run verify:maintenance`.
--
-- La transaction est annulée en fin de script : aucun résidu en base, et les
-- données DEMO ne sont jamais touchées.
-- =============================================================================

begin;

create temporary table recette_ids (
  category_id  uuid,
  vehicle_id   uuid,
  vehicle_b    uuid,
  client_id    uuid,
  incident_id  uuid,
  maintenance  uuid
) on commit drop;

insert into recette_ids values (null, null, null, null, null, null);


-- --- 1. Types et table ----------------------------------------------------------
do $$
declare
  expected_types text[] := array[
    'maintenance_origin', 'maintenance_priority', 'maintenance_status'
  ];
  missing text[];
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'vehicle_maintenances'
  ) then
    raise exception 'Table vehicle_maintenances absente.';
  end if;

  select array_agg(t) into missing
  from unnest(expected_types) t
  where not exists (select 1 from pg_type where typname = t);
  if missing is not null then
    raise exception 'Types manquants : %', missing;
  end if;

  raise notice '[OK] 1. Table et types de maintenance présents.';
end $$;


-- --- 2. RLS et aucune suppression -------------------------------------------------
do $$
declare v_bad text;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'vehicle_maintenances' and c.relrowsecurity
  ) then
    raise exception 'RLS absente sur vehicle_maintenances.';
  end if;

  if has_table_privilege('authenticated', 'public.vehicle_maintenances', 'DELETE') then
    raise exception 'DELETE encore accordé à authenticated.';
  end if;

  select p.policyname into v_bad
  from pg_policies p
  where p.tablename = 'vehicle_maintenances' and p.cmd in ('DELETE', 'ALL');
  if v_bad is not null then
    raise exception 'Policy de suppression trouvée : %', v_bad;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.vehicle_maintenances'::regclass
      and not tgisinternal and tgname like '%no_delete%'
  ) then
    raise exception 'Déclencheur anti-suppression absent.';
  end if;

  raise notice '[OK] 2. RLS activée, aucune suppression possible.';
end $$;


-- --- 3. Aucun montant nulle part ---------------------------------------------------
-- DEC-008 et arbitrage du 27/08/2026 : les coûts relèvent du LOT 3. Une colonne
-- monétaire serait remplie un jour, et ferait autorité sur une règle que
-- personne n'a arrêtée.
do $$
declare v_money text[];
begin
  select array_agg(c.column_name) into v_money
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'vehicle_maintenances'
    and (
      c.column_name ~ 'amount|cost|price|montant|cout|fee|quote|devis|imputab'
      or c.data_type in ('numeric', 'money')
    );

  if v_money is not null then
    raise exception 'Colonne(s) de montant trouvée(s) : % — le LOT 2 n''en porte aucune.', v_money;
  end if;

  raise notice '[OK] 3. Aucune colonne monétaire : le lot décrit l''intervention, pas sa dépense.';
end $$;


-- --- 4. Jeu de recette --------------------------------------------------------------
do $$
declare
  v_category uuid;
  v_a uuid;
  v_b uuid;
  v_client uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RMNT-TEST', 'Recette maintenance') returning id into v_category;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_category, 'RECETTE', 'MNT A', 'RM-0001', 'OWNED', 'AVAILABLE')
  returning id into v_a;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_category, 'RECETTE', 'MNT B', 'RM-0002', 'OWNED', 'AVAILABLE')
  returning id into v_b;

  insert into public.clients (client_no, type, legal_name, phone)
  values (public.next_number('client'), 'COMPANY', 'RECETTE MAINTENANCE', '+269 000')
  returning id into v_client;

  update recette_ids set category_id = v_category, vehicle_id = v_a, vehicle_b = v_b, client_id = v_client;

  raise notice '[OK] 4. Jeu de recette créé : catégorie, deux véhicules, un client.';
end $$;


-- --- 5. Maintenance NON immobilisante ------------------------------------------------
-- Workflow 05 §45 : « lorsqu'une maintenance nécessite une immobilisation ».
-- Toutes ne la nécessitent pas — et celles-là ne bloquent rien.
do $$
declare
  v_vehicle uuid := (select vehicle_id from recette_ids);
  v_id      uuid;
  v_no      text;
  v_occ     int;
  v_status  public.vehicle_status;
begin
  v_id := public.create_maintenance(
    p_vehicle_id => v_vehicle,
    p_origin     => 'PREVENTIVE',
    p_reason     => 'Vidange périodique'
  );

  select maintenance_no into v_no from public.vehicle_maintenances where id = v_id;
  select count(*) into v_occ from public.vehicle_occupations where vehicle_id = v_vehicle;
  select status into v_status from public.vehicles where id = v_vehicle;

  if v_no !~ '^MNT-\d{4}-\d{6}$' then
    raise exception 'Référence de maintenance inattendue : %.', v_no;
  end if;

  if v_occ <> 0 then
    raise exception 'Une maintenance non immobilisante a créé % occupation(s).', v_occ;
  end if;

  if v_status <> 'AVAILABLE' then
    raise exception 'Le statut du véhicule a changé (%) sans immobilisation.', v_status;
  end if;

  raise notice '[OK] 5. % sans immobilisation : aucune occupation, véhicule disponible.', v_no;
end $$;


-- --- 6. Maintenance immobilisante ------------------------------------------------------
do $$
declare
  v_vehicle uuid := (select vehicle_b from recette_ids);
  v_id      uuid;
  v_occ     record;
  v_status  public.vehicle_status;
begin
  v_id := public.create_maintenance(
    p_vehicle_id          => v_vehicle,
    p_origin              => 'BREAKDOWN',
    p_reason              => 'Panne moteur',
    p_priority            => 'URGENT',
    p_immobilization_from => now() - interval '1 hour',
    p_immobilization_to   => now() + interval '3 days'
  );

  update recette_ids set maintenance = v_id;

  select * into v_occ
  from public.vehicle_occupations
  where source = 'MAINTENANCE' and source_id = v_id and is_active;

  if not found then
    raise exception 'Aucune occupation MAINTENANCE posée.';
  end if;

  if v_occ.vehicle_id <> v_vehicle then
    raise exception 'L''occupation porte sur un autre véhicule.';
  end if;

  select status into v_status from public.vehicles where id = v_vehicle;

  -- La période court déjà : le statut décrit donc le présent (Parc §68).
  if v_status <> 'MAINTENANCE' then
    raise exception 'Statut attendu « En maintenance », obtenu %.', v_status;
  end if;

  -- Le calendrier, pas le statut, fait autorité sur la disponibilité (§67).
  if public.is_vehicle_available(v_vehicle, tstzrange(now(), now() + interval '1 day')) then
    raise exception 'Le véhicule est réputé disponible malgré son immobilisation.';
  end if;

  raise notice '[OK] 6. Occupation MAINTENANCE posée, statut cohérent, calendrier bloqué.';
end $$;


-- --- 7. Collision avec une réservation : refus intégral -----------------------------------
--
-- LE CONTRÔLE CENTRAL DU LOT.
--
-- La contrainte d'exclusion refuse — et rien ne subsiste : ni fiche, ni
-- occupation. Une maintenance annonçant une immobilisation que le calendrier
-- ignore serait pire que pas de maintenance du tout.
do $$
declare
  v_vehicle uuid := (select vehicle_id from recette_ids);
  v_client  uuid := (select client_id from recette_ids);
  v_res     uuid;
  v_before  int;
  v_after   int;
  v_caught  boolean := false;
begin
  insert into public.reservations (reservation_no, client_id, vehicle_id, period)
  values (
    public.next_number('reservation'), v_client, v_vehicle,
    tstzrange(now() + interval '30 days', now() + interval '33 days')
  ) returning id into v_res;

  insert into public.vehicle_occupations (vehicle_id, source, source_id, period, reason)
  values (
    v_vehicle, 'RESERVATION', v_res,
    tstzrange(now() + interval '30 days', now() + interval '33 days'), 'Recette'
  );

  select count(*) into v_before from public.vehicle_maintenances;

  begin
    perform public.create_maintenance(
      p_vehicle_id          => v_vehicle,
      p_origin              => 'INSPECTION',
      p_reason              => 'Contrôle qui chevauche une réservation',
      p_immobilization_from => now() + interval '31 days',
      p_immobilization_to   => now() + interval '32 days'
    );
  exception when exclusion_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Une immobilisation a pu chevaucher une réservation.';
  end if;

  select count(*) into v_after from public.vehicle_maintenances;

  if v_after <> v_before then
    raise exception
      'Une maintenance a survécu au refus : % fiche(s) créée(s).', v_after - v_before;
  end if;

  raise notice '[OK] 7. Collision réservation refusée par la base, aucune fiche partielle.';
end $$;


-- --- 8. Collision avec une location : même refus ------------------------------------------
do $$
declare
  v_vehicle uuid := (select vehicle_id from recette_ids);
  v_client  uuid := (select client_id from recette_ids);
  v_rental  uuid;
  v_before  int;
  v_after   int;
  v_caught  boolean := false;
begin
  insert into public.rentals
    (rental_no, client_id, vehicle_id, planned_period, expected_return_at,
     locked_amount, locked_unit, locked_at)
  values
    (public.next_number('rental'), v_client, v_vehicle,
     tstzrange(now() + interval '60 days', now() + interval '63 days'),
     now() + interval '63 days', 100000, 'DAY', now())
  returning id into v_rental;

  insert into public.vehicle_occupations (vehicle_id, source, source_id, period, reason)
  values (
    v_vehicle, 'RENTAL', v_rental,
    tstzrange(now() + interval '60 days', now() + interval '63 days'), 'Recette'
  );

  select count(*) into v_before from public.vehicle_maintenances;

  begin
    perform public.create_maintenance(
      p_vehicle_id          => v_vehicle,
      p_origin              => 'BREAKDOWN',
      p_reason              => 'Panne qui chevauche une location',
      p_immobilization_from => now() + interval '61 days',
      p_immobilization_to   => now() + interval '62 days'
    );
  exception when exclusion_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Une immobilisation a pu chevaucher une location.';
  end if;

  select count(*) into v_after from public.vehicle_maintenances;
  if v_after <> v_before then
    raise exception 'Une maintenance a survécu au refus.';
  end if;

  raise notice '[OK] 8. Collision location refusée par la base, aucune fiche partielle.';
end $$;


-- --- 9. Panne pendant une location -----------------------------------------------------
--
-- Le véhicule est dehors : aucune immobilisation ne peut tenir dans son
-- calendrier. La maintenance existe donc SANS — ce qui est la vérité — puis
-- l'immobilisation est posée quand il est rentré (arbitrage du 27/08/2026).
do $$
declare
  v_vehicle uuid := (select vehicle_id from recette_ids);
  v_client  uuid := (select client_id from recette_ids);
  v_rental  uuid;
  v_id      uuid;
  v_occ     int;
  v_caught  boolean := false;
begin
  -- Une location EN COURS, qui occupe le calendrier maintenant.
  insert into public.rentals
    (rental_no, client_id, vehicle_id, planned_period, expected_return_at,
     started_at, status, locked_amount, locked_unit, locked_at)
  values
    (public.next_number('rental'), v_client, v_vehicle,
     tstzrange(now() - interval '1 day', now() + interval '2 days'),
     now() + interval '2 days', now() - interval '1 day', 'PREPARING',
     100000, 'DAY', now())
  returning id into v_rental;

  insert into public.vehicle_occupations (vehicle_id, source, source_id, period, reason)
  values (
    v_vehicle, 'RENTAL', v_rental,
    tstzrange(now() - interval '1 day', now() + interval '2 days'), 'Recette en cours'
  );

  -- La panne se déclare immédiatement, SANS immobilisation.
  v_id := public.create_maintenance(
    p_vehicle_id => v_vehicle,
    p_origin     => 'BREAKDOWN',
    p_reason     => 'Panne signalée pendant la location',
    p_rental_id  => v_rental
  );

  select count(*) into v_occ
  from public.vehicle_occupations where source = 'MAINTENANCE' and source_id = v_id;

  if v_occ <> 0 then
    raise exception 'Une occupation MAINTENANCE a été posée pendant une location.';
  end if;

  -- Et immobiliser pendant la location reste impossible : aucune dérogation.
  begin
    perform public.immobilize_maintenance(
      v_id, now() + interval '1 hour', now() + interval '1 day'
    );
  exception when exclusion_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Une immobilisation a pu être posée pendant une location en cours.';
  end if;

  -- Une fois le véhicule rendu (occupation libérée), elle devient possible.
  update public.vehicle_occupations
     set is_active = false, released_at = now()
   where source = 'RENTAL' and source_id = v_rental;

  perform public.immobilize_maintenance(
    v_id, now() + interval '1 hour', now() + interval '1 day'
  );

  select count(*) into v_occ
  from public.vehicle_occupations
  where source = 'MAINTENANCE' and source_id = v_id and is_active;

  if v_occ <> 1 then
    raise exception 'L''immobilisation différée n''a pas été posée.';
  end if;

  raise notice '[OK] 9. Panne pendant location : sans occupation, puis immobilisable au retour.';
end $$;


-- --- 10. Transitions -----------------------------------------------------------------------
do $$
declare
  v_id     uuid := (select maintenance from recette_ids);
  v_caught boolean := false;
begin
  -- Le chemin légitime, jusqu'à « En cours ».
  update public.vehicle_maintenances set status = 'PLANNED'     where id = v_id;
  update public.vehicle_maintenances set status = 'IN_PROGRESS' where id = v_id;
  update public.vehicle_maintenances set status = 'ON_HOLD'     where id = v_id;

  -- §49 : on ne conclut pas depuis une attente — le contrôle n'a pas pu avoir
  -- lieu. Il faut reprendre l'intervention.
  begin
    update public.vehicle_maintenances set status = 'COMPLETED' where id = v_id;
  exception when check_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Une maintenance en attente a pu être déclarée terminée.';
  end if;

  update public.vehicle_maintenances set status = 'IN_PROGRESS' where id = v_id;

  raise notice '[OK] 10. « En attente » ne mène pas à « Terminée » : l''intervention se reprend.';
end $$;


-- --- 11. Fin d'intervention -------------------------------------------------------------------
-- Rule métier : la fin libère l'occupation ET rend le véhicule, dans la même
-- opération. L'occupation est libérée, jamais effacée.
do $$
declare
  v_id      uuid := (select maintenance from recette_ids);
  v_vehicle uuid := (select vehicle_b from recette_ids);
  v_active  int;
  v_rows    int;
  v_status  public.vehicle_status;
  v_caught  boolean := false;
begin
  perform public.complete_maintenance(v_id, now(), 'Moteur réparé', 'Contrôle satisfaisant');

  select count(*) into v_active
  from public.vehicle_occupations
  where source = 'MAINTENANCE' and source_id = v_id and is_active;

  select count(*) into v_rows
  from public.vehicle_occupations
  where source = 'MAINTENANCE' and source_id = v_id;

  select status into v_status from public.vehicles where id = v_vehicle;

  if v_active <> 0 then
    raise exception 'L''occupation bloque encore après la fin de la maintenance.';
  end if;

  if v_rows <> 1 then
    raise exception 'L''historique de l''occupation a disparu (% ligne(s)).', v_rows;
  end if;

  if v_status <> 'AVAILABLE' then
    raise exception 'Le véhicule n''est pas revenu au parc (%).', v_status;
  end if;

  if not public.is_vehicle_available(v_vehicle, tstzrange(now(), now() + interval '1 day')) then
    raise exception 'Le véhicule reste indisponible après la fin de la maintenance.';
  end if;

  -- Une maintenance terminée ne se relance pas.
  begin
    update public.vehicle_maintenances set status = 'IN_PROGRESS' where id = v_id;
  exception when check_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Une maintenance terminée a pu être relancée.';
  end if;

  raise notice '[OK] 11. Fin : occupation libérée sans être effacée, véhicule disponible, état terminal.';
end $$;


-- --- 12. Annulation --------------------------------------------------------------------------
do $$
declare
  v_vehicle uuid := (select vehicle_b from recette_ids);
  v_id      uuid;
  v_active  int;
  v_status  public.vehicle_status;
begin
  v_id := public.create_maintenance(
    p_vehicle_id          => v_vehicle,
    p_origin              => 'INSPECTION',
    p_reason              => 'Contrôle finalement annulé',
    p_immobilization_from => now() - interval '10 minutes',
    p_immobilization_to   => now() + interval '2 days'
  );

  perform public.cancel_maintenance(v_id, 'Recette');

  select count(*) into v_active
  from public.vehicle_occupations
  where source = 'MAINTENANCE' and source_id = v_id and is_active;

  select status into v_status from public.vehicles where id = v_vehicle;

  if v_active <> 0 then
    raise exception 'L''annulation n''a pas libéré l''immobilisation.';
  end if;

  if v_status <> 'AVAILABLE' then
    raise exception 'Le véhicule reste bloqué après annulation (%).', v_status;
  end if;

  if not exists (select 1 from public.vehicle_maintenances where id = v_id and status = 'CANCELLED') then
    raise exception 'La maintenance annulée a disparu.';
  end if;

  raise notice '[OK] 12. Annulation : véhicule libéré, fiche conservée (§64).';
end $$;


-- --- 13. Cohérence des rattachements ------------------------------------------------------------
do $$
declare
  v_a      uuid := (select vehicle_id from recette_ids);
  v_b      uuid := (select vehicle_b from recette_ids);
  v_inc    uuid;
  v_caught boolean := false;
begin
  insert into public.vehicle_incidents (incident_no, vehicle_id, kind, description)
  values (public.next_number('incident'), v_a, 'BREAKDOWN', 'Incident du véhicule A')
  returning id into v_inc;

  update recette_ids set incident_id = v_inc;

  -- L'incident porte sur A, la maintenance sur B.
  begin
    perform public.create_maintenance(
      p_vehicle_id  => v_b,
      p_origin      => 'INCIDENT',
      p_reason      => 'Rattachement incohérent',
      p_incident_id => v_inc
    );
  exception when check_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Une maintenance a pu citer l''incident d''un autre véhicule.';
  end if;

  -- Le rattachement cohérent, lui, passe.
  perform public.create_maintenance(
    p_vehicle_id  => v_a,
    p_origin      => 'INCIDENT',
    p_reason      => 'Réparation suite à incident',
    p_incident_id => v_inc
  );

  raise notice '[OK] 13. Incident et location doivent porter sur le véhicule de la maintenance.';
end $$;


-- --- 14. Un incident ne crée aucune maintenance ---------------------------------------------------
-- Règle 9 de l'arbitrage : constater et faire réparer sont deux actes.
do $$
declare
  v_a     uuid := (select vehicle_id from recette_ids);
  v_inc   uuid;
  v_count int;
begin
  insert into public.vehicle_incidents (incident_no, vehicle_id, kind, description)
  values (public.next_number('incident'), v_a, 'FLAT_TYRE', 'Crevaison sans suite')
  returning id into v_inc;

  select count(*) into v_count
  from public.vehicle_maintenances where incident_id = v_inc;

  if v_count <> 0 then
    raise exception 'Déclarer un incident a créé % maintenance(s).', v_count;
  end if;

  raise notice '[OK] 14. Un incident ne déclenche aucune maintenance.';
end $$;


-- --- 15. Catalogue de permissions inchangé -----------------------------------------------------------
do $$
declare
  attendues text[] := array[
    'rental.maintenance.view', 'rental.maintenance.create', 'rental.maintenance.update',
    'rental.maintenance.validate', 'rental.maintenance.close', 'rental.maintenance.cost.update'
  ];
  manquantes text[];
  total int;
begin
  select array_agg(c) into manquantes
  from unnest(attendues) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if manquantes is not null then
    raise exception 'Permissions de maintenance manquantes : %', manquantes;
  end if;

  select count(*) into total from public.permissions;

  if total <> 157 then
    raise exception 'Catalogue attendu à 157 permissions, obtenu %.', total;
  end if;

  raise notice '[OK] 15. Catalogue à 157 permissions — aucune création par CE lot.';
end $$;


-- --- 16. Numérotation ---------------------------------------------------------------------------------
do $$
declare v_rule public.numbering_rules%rowtype;
begin
  select * into v_rule from public.numbering_rules where entity_key = 'maintenance';

  if not found then
    raise exception 'Aucune règle de numérotation pour les maintenances.';
  end if;

  if v_rule.prefix <> 'MNT' or not v_rule.include_year or not v_rule.reset_yearly then
    raise exception
      'Convention inattendue : % / année=% / reset=%',
      v_rule.prefix, v_rule.include_year, v_rule.reset_yearly;
  end if;

  raise notice '[OK] 16. Numérotation MNT-AAAA-000000, règle préexistante réemployée.';
end $$;


do $$ begin
  raise notice '';
  raise notice '[OK] Recette de la maintenance complète — Étape 2.4, Lot 2.';
end $$;

rollback;
