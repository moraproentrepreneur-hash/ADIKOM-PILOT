-- =============================================================================
-- ADIKOM PILOT — Recette des incidents et dommages (Étape 2.4, LOT 1)
--
-- Vérifie les garanties que la BASE doit porter seule : structure, RLS,
-- interdiction de suppression, cohérence des rattachements, transitions
-- d'état, atomicité de la déclaration, et — le point le plus important de ce
-- lot — l'ABSENCE de tout mécanisme financier ou d'immobilisation.
--
-- Exécution :
--   npm run db:verify:incidents
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne
-- RLS. Il contrôle donc le SCHÉMA ; les policies sont éprouvées avec de vraies
-- sessions par `npm run verify:incidents`.
--
-- La transaction est annulée en fin de script : aucun résidu en base, et les
-- données DEMO ne sont jamais touchées.
-- =============================================================================

begin;

create temporary table recette_ids (
  category_id uuid,
  vehicle_id  uuid,
  incident_id uuid
) on commit drop;

insert into recette_ids values (null, null, null);


-- --- 1. Types et tables --------------------------------------------------------
do $$
declare
  expected_tables text[] := array[
    'vehicle_incidents', 'incident_damages', 'incident_photos'
  ];
  expected_types text[] := array[
    'incident_kind', 'incident_status', 'damage_severity', 'damage_responsibility'
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

  raise notice '[OK] 1. Les 3 tables et les 4 types des incidents sont présents.';
end $$;


-- --- 2. Aucune suppression possible --------------------------------------------
-- La policy ET le droit : l'un sans l'autre ne protège rien (leçon de
-- `supplier_bank_details`, migration 029).
do $$
declare
  tables text[] := array['vehicle_incidents', 'incident_damages', 'incident_photos'];
  faulty text[];
begin
  select array_agg(c.relname) into faulty
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = any(tables) and not c.relrowsecurity;
  if faulty is not null then
    raise exception 'RLS absente sur : %', faulty;
  end if;

  select array_agg(distinct t) into faulty
  from unnest(tables) t
  where has_table_privilege('authenticated', 'public.' || t, 'DELETE');
  if faulty is not null then
    raise exception 'DELETE encore accordé à authenticated sur : %', faulty;
  end if;

  select array_agg(distinct p.tablename) into faulty
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = any(tables) and p.cmd in ('DELETE', 'ALL');
  if faulty is not null then
    raise exception 'Policy de suppression trouvée sur : %', faulty;
  end if;

  select array_agg(t) into faulty
  from unnest(tables) t
  where not exists (
    select 1 from pg_trigger tg
    where tg.tgrelid = ('public.' || t)::regclass
      and not tg.tgisinternal
      and tg.tgname like '%no_delete%'
  );
  if faulty is not null then
    raise exception 'Déclencheur anti-suppression absent sur : %', faulty;
  end if;

  raise notice '[OK] 2. RLS activée, aucune suppression possible sur les incidents.';
end $$;


-- --- 3. Jeu de recette ----------------------------------------------------------
do $$
declare
  v_category uuid;
  v_vehicle  uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RINC-TEST', 'Recette incidents')
  returning id into v_category;

  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, status)
  values
    (public.next_number('vehicle'), v_category, 'RECETTE', 'INC', 'RI-0001', 'OWNED', 'AVAILABLE')
  returning id into v_vehicle;

  update recette_ids set category_id = v_category, vehicle_id = v_vehicle;

  raise notice '[OK] 3. Jeu de recette créé : catégorie et véhicule.';
end $$;


-- --- 4. Déclaration atomique ----------------------------------------------------
-- L'incident et ses dommages naissent ensemble, ou pas du tout.
do $$
declare
  v_vehicle  uuid := (select vehicle_id from recette_ids);
  v_incident uuid;
  v_no       text;
  v_damages  int;
begin
  v_incident := public.create_incident(
    p_vehicle_id  => v_vehicle,
    p_kind        => 'ACCIDENT',
    p_description => 'Choc à l''arrière sur le parking.',
    p_damages     => '[
      {"location":"Pare-chocs arrière","severity":"MAJOR","responsibility":"CLIENT"},
      {"location":"Feu arrière droit","severity":"MODERATE","isPreexisting":true},
      {"location":"   "}
    ]'::jsonb
  );

  update recette_ids set incident_id = v_incident;

  select incident_no into v_no from public.vehicle_incidents where id = v_incident;
  select count(*) into v_damages from public.incident_damages where incident_id = v_incident;

  -- La troisième ligne, sans emplacement, est ÉCARTÉE : l'utilisateur a ajouté
  -- une ligne puis renoncé, ce n'est pas un dommage.
  if v_damages <> 2 then
    raise exception '2 dommages attendus, % enregistré(s).', v_damages;
  end if;

  if v_no !~ '^INC-\d{4}-\d{6}$' then
    raise exception 'Référence d''incident inattendue : %.', v_no;
  end if;

  raise notice '[OK] 4. Déclaration atomique : % avec 2 dommages (ligne vide écartée).', v_no;
end $$;


-- --- 5. Aucune immobilisation, aucune maintenance -------------------------------
--
-- LE CONTRÔLE CENTRAL DE CE LOT.
--
-- Déclarer un incident ne doit RIEN déclencher : ni blocage du calendrier, ni
-- changement de statut du véhicule, ni intervention. Ces décisions
-- appartiennent à l'exploitant (arbitrage ADIKOM du 26/08/2026).
do $$
declare
  v_vehicle uuid := (select vehicle_id from recette_ids);
  v_blocked int;
  v_status  public.vehicle_status;
begin
  select count(*) into v_blocked
  from public.vehicle_occupations
  where vehicle_id = v_vehicle;

  if v_blocked <> 0 then
    raise exception
      'Un incident a écrit % occupation(s) : le calendrier ne doit pas bouger.', v_blocked;
  end if;

  select status into v_status from public.vehicles where id = v_vehicle;

  if v_status <> 'AVAILABLE' then
    raise exception 'Le statut du véhicule a changé (%) : aucune immobilisation n''est prévue.', v_status;
  end if;

  raise notice '[OK] 5. Aucune occupation posée, statut du véhicule inchangé.';
end $$;


-- --- 6. Aucun montant nulle part ------------------------------------------------
-- DEC-008 : les barèmes de dommage n'existent pas. Une colonne de montant
-- serait remplie un jour, et ferait autorité sur une règle que personne n'a
-- arrêtée.
do $$
declare
  v_money text[];
begin
  select array_agg(c.table_name || '.' || c.column_name) into v_money
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in ('vehicle_incidents', 'incident_damages', 'incident_photos')
    and (
      c.column_name ~ 'amount|cost|price|montant|cout|fee|penalt'
      or c.data_type in ('numeric', 'money')
    );

  if v_money is not null then
    raise exception 'Colonne(s) de montant trouvée(s) : % — DEC-008 l''interdit.', v_money;
  end if;

  raise notice '[OK] 6. Aucune colonne de montant : le lot constate, il ne chiffre pas.';
end $$;


-- --- 7. Transitions d'état -------------------------------------------------------
do $$
declare
  v_incident uuid := (select incident_id from recette_ids);
  v_caught   boolean := false;
begin
  -- OUVERT → EN_TRAITEMENT → CLOS : le chemin légitime.
  update public.vehicle_incidents set status = 'IN_PROGRESS' where id = v_incident;
  update public.vehicle_incidents set status = 'CLOSED' where id = v_incident;

  -- Un incident clos ne ressuscite pas.
  begin
    update public.vehicle_incidents set status = 'IN_PROGRESS' where id = v_incident;
  exception when check_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Un incident clos a pu être rouvert.';
  end if;

  -- Ni ne s'annule après coup.
  v_caught := false;
  begin
    update public.vehicle_incidents set status = 'CANCELLED' where id = v_incident;
  exception when check_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Un incident clos a pu être annulé.';
  end if;

  raise notice '[OK] 7. OUVERT → EN_TRAITEMENT → CLOS accepté ; clos terminal.';
end $$;


-- --- 8. Cohérence des rattachements ----------------------------------------------
-- Un incident ne cite pas la location d'un autre véhicule, ni l'état des lieux
-- d'une autre location.
do $$
declare
  v_vehicle  uuid := (select vehicle_id from recette_ids);
  v_category uuid := (select category_id from recette_ids);
  v_other    uuid;
  v_client   uuid;
  v_rental   uuid;
  v_caught   boolean := false;
begin
  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, status)
  values
    (public.next_number('vehicle'), v_category, 'RECETTE', 'INC2', 'RI-0002', 'OWNED', 'AVAILABLE')
  returning id into v_other;

  insert into public.clients (client_no, type, legal_name, phone)
  values (public.next_number('client'), 'COMPANY', 'RECETTE INCIDENTS', '+269 000')
  returning id into v_client;

  insert into public.rentals
    (rental_no, client_id, vehicle_id, planned_period, expected_return_at,
     locked_amount, locked_unit, locked_at)
  values
    (public.next_number('rental'), v_client, v_other,
     tstzrange(now() + interval '400 days', now() + interval '403 days'),
     now() + interval '403 days', 100000, 'DAY', now())
  returning id into v_rental;

  -- La location porte sur `v_other`, l'incident sur `v_vehicle`.
  begin
    perform public.create_incident(
      p_vehicle_id  => v_vehicle,
      p_kind        => 'BREAKDOWN',
      p_description => 'Rattachement incohérent.',
      p_rental_id   => v_rental
    );
  exception when check_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Un incident a pu citer la location d''un autre véhicule.';
  end if;

  -- Un état des lieux sans sa location.
  v_caught := false;
  begin
    insert into public.vehicle_incidents
      (incident_no, vehicle_id, inspection_id, kind, description)
    values
      (public.next_number('incident'), v_vehicle, gen_random_uuid(), 'OTHER', 'Sans location');
  exception when check_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Un état des lieux a pu être rattaché sans sa location.';
  end if;

  raise notice '[OK] 8. Véhicule, location et état des lieux restent cohérents.';
end $$;


-- --- 9. Une photo ne désigne pas le dommage d'un autre incident -------------------
-- Garantie portée par la clé ÉTRANGÈRE COMPOSÉE, pas par du code applicatif.
do $$
declare
  v_vehicle  uuid := (select vehicle_id from recette_ids);
  v_first    uuid := (select incident_id from recette_ids);
  v_second   uuid;
  v_damage   uuid;
  v_caught   boolean := false;
begin
  v_second := public.create_incident(
    p_vehicle_id  => v_vehicle,
    p_kind        => 'FLAT_TYRE',
    p_description => 'Crevaison sur route.'
  );

  select id into v_damage from public.incident_damages where incident_id = v_first limit 1;

  begin
    insert into public.incident_photos
      (incident_id, damage_id, storage_path, file_name)
    values
      (v_second, v_damage, 'incidents/x/photo.png', 'photo.png');
  exception when foreign_key_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Une photo a pu désigner le dommage d''un autre incident.';
  end if;

  -- Une photo sans dommage désigné reste possible : elle montre l'incident.
  insert into public.incident_photos (incident_id, storage_path, file_name)
  values (v_second, 'incidents/y/photo.png', 'photo.png');

  raise notice '[OK] 9. Clé composée : une photo ne franchit pas la frontière d''un incident.';
end $$;


-- --- 10. Numérotation -------------------------------------------------------------
do $$
declare
  v_rule public.numbering_rules%rowtype;
begin
  select * into v_rule from public.numbering_rules where entity_key = 'incident';

  if not found then
    raise exception 'Aucune règle de numérotation pour les incidents.';
  end if;

  -- Même convention que les autres objets DATÉS (DEC-021 §1) : préfixe, année,
  -- remise à zéro annuelle. Les référentiels permanents n'ont pas d'année.
  if v_rule.prefix <> 'INC' or not v_rule.include_year or not v_rule.reset_yearly then
    raise exception
      'Convention de numérotation inattendue : % / année=% / reset=%',
      v_rule.prefix, v_rule.include_year, v_rule.reset_yearly;
  end if;

  raise notice '[OK] 10. Numérotation INC-AAAA-000000, alignée sur les objets datés.';
end $$;


-- --- 11. Catalogue de permissions inchangé ------------------------------------------
-- Aucune permission n'est créée pour ce lot : les trois codes existent depuis
-- la migration 025.
do $$
declare
  attendues text[] := array[
    'rental.incidents.view', 'rental.incidents.create', 'rental.incidents.update'
  ];
  manquantes text[];
  total int;
begin
  select array_agg(c) into manquantes
  from unnest(attendues) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if manquantes is not null then
    raise exception 'Permissions d''incident manquantes : %', manquantes;
  end if;

  if exists (select 1 from public.permissions where code = 'rental.incidents.close') then
    raise exception
      'La permission rental.incidents.close a été créée : `update` couvre le changement d''état.';
  end if;

  select count(*) into total from public.permissions;

  if total <> 152 then
    raise exception 'Catalogue attendu à 152 permissions, obtenu %.', total;
  end if;

  raise notice '[OK] 11. Catalogue inchangé : 152 permissions, aucune création.';
end $$;


do $$ begin
  raise notice '';
  raise notice '[OK] Recette des incidents et dommages complète — Étape 2.4, Lot 1.';
end $$;

rollback;
