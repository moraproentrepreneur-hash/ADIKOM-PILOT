-- =============================================================================
-- ADIKOM PILOT — Recette Centre de notifications (Phase 3 — Pilotage, LOT 10)
--
-- CE QU'ELLE ÉPROUVE
--
-- Le centre de notifications ne stocke aucune notification : il n'en existe pas
-- une seule ligne en base. Ce que la BASE doit porter seule, c'est donc la
-- VEILLE — savoir dire, sur des données réelles, ce qui appelle une information
-- ou un geste. Une veille qui se trompe est pire qu'une veille absente.
--
-- Le jeu de recette reprend les exemples de la documentation :
--
--   Facture client        450 000 KMF   (Workflow 08 §5)
--   Encaissement          200 000 KMF
--   Reste à encaisser     250 000 KMF   ← montant annoncé par la notification
--
--   Facture fournisseur 1 000 000 KMF   (CLAUDE.md §16)
--   Imputation            300 000 KMF
--   Net à payer           700 000 KMF   ← montant annoncé par la notification
--   Règlement             200 000 KMF
--   Reste à payer         500 000 KMF   ← puis celui-ci
--
-- Le contrôle central est le second : une imputation N'EST PAS un paiement
-- (CLAUDE.md §57). Une notification qui l'ignorerait réclamerait 1 000 000 KMF
-- là où ADIKOM ne doit que 700 000.
--
-- Exécution :
--   npm run db:verify:notifications
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne RLS
-- et les gardes de capacité (`current_actor()` y est NULL). Il contrôle donc la
-- STRUCTURE, la VEILLE et son ARITHMÉTIQUE ; l'effet des capacités et l'état de
-- lecture s'éprouvent avec de vraies sessions — `verify:capabilities` et
-- `verify:notifications`.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_notif (
  category_id uuid,
  client      uuid,
  supplier    uuid,
  garage      uuid,
  vehicle_a   uuid,   -- location en retard, documents
  vehicle_b   uuid,   -- immobilisé hors location, maintenances
  vehicle_c   uuid,   -- immobilisé PENDANT une location
  vehicle_d   uuid,   -- retour du jour, contrôle
  rule_id     uuid,
  res_depart  uuid,
  res_a       uuid,
  res_c       uuid,
  res_d       uuid,
  res_e       uuid,
  rental_a    uuid,
  rental_c    uuid,
  rental_d    uuid,
  rental_e    uuid,
  doc_soon    uuid,
  doc_expired uuid,
  mnt_planned uuid,
  mnt_late    uuid,
  incident_ma uuid,
  incident_mi uuid,
  invoice_c   uuid,
  invoice_s   uuid,
  imputation  uuid,
  account     uuid
) on commit drop;

insert into recette_notif default values;


-- --- 1. AUCUNE NOTIFICATION N'EST STOCKÉE --------------------------------------------
--
-- Module 02 §3 : « le système ne doit jamais générer artificiellement des
-- notifications ». La garantie la plus forte est structurelle : il n'existe
-- aucune table où en écrire une. Seul l'ÉTAT DE LECTURE est stocké.
do $$
declare v_bad text[];
begin
  select array_agg(tablename) into v_bad
  from pg_tables
  where schemaname = 'public'
    and (tablename like 'notification%' or tablename like '%_alerts' or tablename like 'alertes%')
    and tablename <> 'notification_reads';
  if v_bad is not null then
    raise exception 'Le centre stocke des notifications : %.', v_bad;
  end if;

  -- Et aucun déclencheur de diffusion : une notification ne se fabrique pas à
  -- l'insertion d'une réservation ou d'une facture.
  select array_agg(t.tgname) into v_bad
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and t.tgname ilike '%notif%';
  if v_bad is not null then
    raise exception 'Des déclencheurs fabriquent des notifications : %.', v_bad;
  end if;

  raise notice '[OK] 1. Aucune notification stockée, aucun déclencheur de diffusion.';
end $$;


-- --- 2. L'ÉTAT DE LECTURE : UNE LIGNE, SON PROPRIÉTAIRE, RIEN DE PLUS ----------------
do $$
declare
  v_cols text[];
  v_user uuid;
  v_ok   boolean;
begin
  select array_agg(column_name order by column_name) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'notification_reads';

  if v_cols is distinct from array['notification_key', 'read_at', 'user_id'] then
    raise exception 'Colonnes inattendues sur notification_reads : %.', v_cols;
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'notification_reads' and c.relrowsecurity
  ) then
    raise exception 'RLS n''est pas activée sur notification_reads.';
  end if;

  -- Ni UPDATE ni DELETE pour le rôle applicatif : une lecture est un fait daté.
  if has_table_privilege('authenticated', 'public.notification_reads', 'UPDATE')
     or has_table_privilege('authenticated', 'public.notification_reads', 'DELETE') then
    raise exception 'notification_reads accepte encore UPDATE ou DELETE.';
  end if;
  if has_table_privilege('anon', 'public.notification_reads', 'SELECT') then
    raise exception 'notification_reads est lisible par anon.';
  end if;

  -- La forme de la clé est contrainte : la table n'est pas un espace d'écriture
  -- libre pour toute session authentifiée.
  select id into v_user from public.app_users order by created_at limit 1;
  if v_user is null then
    raise exception 'Aucun utilisateur en base : recette impossible.';
  end if;

  v_ok := false;
  begin
    insert into public.notification_reads (user_id, notification_key)
    values (v_user, 'n''importe quoi');
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'Une clé de notification malformée a été acceptée.';
  end if;

  -- Une clé bien formée passe, et ne passe qu'une fois.
  insert into public.notification_reads (user_id, notification_key)
  values (v_user, 'rental.return.late:00000000-0000-0000-0000-000000000000');

  v_ok := false;
  begin
    insert into public.notification_reads (user_id, notification_key)
    values (v_user, 'rental.return.late:00000000-0000-0000-0000-000000000000');
  exception when unique_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'Une même notification a pu être marquée lue deux fois.';
  end if;

  delete from public.notification_reads where user_id = v_user;

  raise notice '[OK] 2. État de lecture : trois colonnes, RLS, clé contrainte, sans doublon.';
end $$;


-- --- 3. LES FONCTIONS EXISTENT, ET SONT SOBRES ---------------------------------------
--
-- `SECURITY INVOKER` (DEC-022), `search_path` figé, rien pour PUBLIC. Une
-- fonction de veille qui s'exécuterait avec les droits de son propriétaire
-- rendrait à chacun les notifications de tout le monde.
do $$
declare
  v_fns text[] := array[
    'notifications_watch', 'notifications_feed', 'notifications_summary',
    'notification_mark_read', 'notification_mark_all_read',
    'holds_capabilities', 'notification_level_rank', 'notification_vehicle_label'
  ];
  v_bad text[];
  v_seen int;
begin
  select count(distinct p.proname) into v_seen
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns);
  if v_seen <> array_length(v_fns, 1) then
    raise exception '% fonctions attendues, % trouvée(s).', array_length(v_fns, 1), v_seen;
  end if;

  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns) and p.prosecdef;
  if v_bad is not null then
    raise exception 'SECURITY DEFINER de commodité (DEC-022) : %.', v_bad;
  end if;

  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns)
    and (p.proconfig is null or not exists (
      select 1 from unnest(p.proconfig) c where c like 'search\_path=%'
    ));
  if v_bad is not null then
    raise exception '`search_path` non figé : %.', v_bad;
  end if;

  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns)
    and has_function_privilege('public', p.oid, 'EXECUTE');
  if v_bad is not null then
    raise exception 'EXECUTE encore accordé à PUBLIC (DEC-022) : %.', v_bad;
  end if;

  -- Les trois lectures sont « stable » : elles ne peuvent rien écrire.
  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('notifications_watch', 'notifications_feed', 'notifications_summary')
    and p.provolatile <> 's';
  if v_bad is not null then
    raise exception 'Fonction de lecture non « stable » : %.', v_bad;
  end if;

  raise notice '[OK] 3. Huit fonctions, SECURITY INVOKER, fermées à PUBLIC.';
end $$;


-- --- 4. CHAQUE FONCTION ET CHAQUE FAMILLE NOMME SES CAPACITÉS ------------------------
--
-- Le contrôle est LEXICAL : la garde doit être écrite dans le corps de la
-- fonction. Son EFFET s'éprouve avec de vraies sessions — ici `current_actor()`
-- est NULL et les gardes s'effacent (migration 021).
do $$
declare
  v_src  text;
  v_want text;
  v_need text[] := array[
    'notifications_watch', 'notifications_feed', 'notifications_summary',
    'notification_mark_read', 'notification_mark_all_read'
  ];
  v_caps text[] := array[
    'rental.reservations.view',
    'rental.rentals.view',
    'rental.maintenance.view',
    'rental.fleet.view',
    'rental.incidents.view',
    'rental.documents.view',
    'billing.customer_invoices.view',
    'billing.customer_payments.view',
    'billing.supplier_invoices.view',
    'billing.imputations.view',
    'billing.supplier_payments.view'
  ];
  i int;
begin
  for i in 1 .. array_length(v_need, 1) loop
    select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_need[i]
    limit 1;

    if position('notifications.view' in v_src) = 0 then
      raise exception '% n''exige pas « notifications.view ».', v_need[i];
    end if;
  end loop;

  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'notifications_watch'
  limit 1;

  for i in 1 .. array_length(v_caps, 1) loop
    v_want := v_caps[i];
    if position(v_want in v_src) = 0 then
      raise exception 'La veille ne conditionne aucune famille à « % ».', v_want;
    end if;
  end loop;

  raise notice '[OK] 4. Cinq fonctions gardées, onze lectures conditionnent la veille.';
end $$;


-- --- 5. JEU DE RECETTE — les situations que la veille doit voir ----------------------
do $$
declare
  v_cat uuid; v_cli uuid; v_sup uuid; v_gar uuid; v_rule uuid; v_acc uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid;
  v_res uuid; v_loc uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RNOTIF-TEST', 'Recette notifications') returning id into v_cat;

  insert into public.pricing_rules (category_id, amount, unit)
  values (v_cat, 150000, 'DAY') returning id into v_rule;

  insert into public.clients (client_no, type, legal_name, phone)
  values (public.next_number('client'), 'COMPANY', 'RECETTE NOTIF — Client', '+269 910')
  returning id into v_cli;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER', 'RECETTE NOTIF — Fournisseur',
          '+269 911', 'ACTIVE')
  returning id into v_sup;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'MAINTENANCE_PROVIDER', 'RECETTE NOTIF — Garage',
          '+269 912', 'ACTIVE')
  returning id into v_gar;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RNOTIF', 'A', 'RN-0001', 'OWNED', 'AVAILABLE')
  returning id into v_a;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RNOTIF', 'B', 'RN-0002', 'OWNED', 'AVAILABLE')
  returning id into v_b;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RNOTIF', 'C', 'RN-0003', 'OWNED', 'AVAILABLE')
  returning id into v_c;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RNOTIF', 'D', 'RN-0004', 'OWNED', 'AVAILABLE')
  returning id into v_d;

  v_acc := public.create_financial_account('CASH', 'RECETTE NOTIF — Caisse', 'Recette',
                                           null, 1000000, current_date - 30, null);

  update recette_notif set
    category_id = v_cat, client = v_cli, supplier = v_sup, garage = v_gar,
    rule_id = v_rule, account = v_acc,
    vehicle_a = v_a, vehicle_b = v_b, vehicle_c = v_c, vehicle_d = v_d;

  raise notice '[OK] 5. Quatre véhicules, un client, deux fournisseurs, une caisse.';
end $$;


-- --- 6. LA VEILLE D'EXPLOITATION — §8, §9, §10, §11 ---------------------------------
--
-- Chaque situation est posée SANS DATE EN DUR : une recette ne doit pas expirer
-- avec le calendrier. Le retard est dérivé de l'heure courante (DEC-025 §a).
do $$
declare
  r        recette_notif;
  v_res    uuid;
  v_loc    uuid;
  v_keys   text[];
  v_level  text;
begin
  select * into r from recette_notif;

  /* --- Une location EN RETARD : départ avant-hier, retour attendu il y a 1 h. */
  insert into public.reservations (reservation_no, client_id, category_id, period)
  values (public.next_number('reservation'), r.client, r.category_id,
          tstzrange(now() - interval '2 days', now() - interval '1 hour', '[)'))
  returning id into v_res;
  perform public.confirm_reservation(v_res, r.vehicle_a);
  v_loc := public.convert_reservation_to_rental(v_res);
  update public.rentals set status = 'CONFIRMED', status_changed_at = now() where id = v_loc;
  perform public.start_rental(v_loc, now() - interval '2 days', 10000, 'FULL');
  update recette_notif set res_a = v_res, rental_a = v_loc;

  /* --- Une location EN COURS dont le véhicule est ensuite IMMOBILISÉ. */
  insert into public.reservations (reservation_no, client_id, category_id, period)
  values (public.next_number('reservation'), r.client, r.category_id,
          tstzrange(now() - interval '1 day', now() + interval '3 days', '[)'))
  returning id into v_res;
  perform public.confirm_reservation(v_res, r.vehicle_c);
  v_loc := public.convert_reservation_to_rental(v_res);
  update public.rentals set status = 'CONFIRMED', status_changed_at = now() where id = v_loc;
  perform public.start_rental(v_loc, now() - interval '1 day', 20000, 'FULL');
  update public.vehicles
     set status = 'IMMOBILIZED',
         status_reason = 'Panne constatée pendant la location',
         status_changed_at = now()
   where id = r.vehicle_c;
  update recette_notif set res_c = v_res, rental_c = v_loc;

  /* --- Un RETOUR PRÉVU dans deux heures : rappel, jamais retard. */
  insert into public.reservations (reservation_no, client_id, category_id, period)
  values (public.next_number('reservation'), r.client, r.category_id,
          tstzrange(now() - interval '1 day', now() + interval '2 hours', '[)'))
  returning id into v_res;
  perform public.confirm_reservation(v_res, r.vehicle_d);
  v_loc := public.convert_reservation_to_rental(v_res);
  update public.rentals set status = 'CONFIRMED', status_changed_at = now() where id = v_loc;
  perform public.start_rental(v_loc, now() - interval '1 day', 30000, 'FULL');
  update recette_notif set res_d = v_res, rental_d = v_loc;

  /* --- Un DÉPART PRÉVU demain : réservation confirmée, non partie. */
  insert into public.reservations (reservation_no, client_id, category_id, period)
  values (public.next_number('reservation'), r.client, r.category_id,
          tstzrange(
            ((now() at time zone 'Indian/Comoro')::date + 1 + time '09:00')
              at time zone 'Indian/Comoro',
            ((now() at time zone 'Indian/Comoro')::date + 3 + time '09:00')
              at time zone 'Indian/Comoro',
            '[)'))
  returning id into v_res;
  perform public.confirm_reservation(v_res, r.vehicle_b);
  update recette_notif set res_depart = v_res;

  /* --- Un véhicule IMMOBILISÉ hors location. */
  update public.vehicles
     set status = 'IMMOBILIZED',
         status_reason = 'Immobilisation hors exploitation',
         status_changed_at = now()
   where id = r.vehicle_b;

  select * into r from recette_notif;

  select array_agg(w.key) into v_keys from public.notifications_watch() w;

  if not ('rental.return.late:' || r.rental_a::text = any(v_keys)) then
    raise exception 'Le retour dépassé n''est pas signalé.';
  end if;
  if 'rental.return.due:' || r.rental_a::text = any(v_keys) then
    raise exception 'Une location en retard est AUSSI annoncée comme rappel (§27).';
  end if;
  if not ('rental.return.due:' || r.rental_d::text = any(v_keys)) then
    raise exception 'Le retour prévu du jour n''est pas rappelé.';
  end if;
  if not ('reservation.departure:' || r.res_depart::text = any(v_keys)) then
    raise exception 'Le départ prévu demain n''est pas rappelé.';
  end if;
  if not ('vehicle.immobilized:' || r.vehicle_b::text = any(v_keys)) then
    raise exception 'Le véhicule immobilisé n''est pas signalé.';
  end if;
  if 'vehicle.immobilized:' || r.vehicle_c::text = any(v_keys) then
    raise exception 'Un véhicule immobilisé PENDANT une location est compté deux fois (§27).';
  end if;
  if not ('rental.vehicle.immobilized:' || r.rental_c::text = any(v_keys)) then
    raise exception 'L''immobilisation pendant une location n''est pas signalée.';
  end if;

  -- Les niveaux viennent des exemples du §4, jamais d'une appréciation.
  select w.level into v_level from public.notifications_watch() w
  where w.key = 'rental.return.late:' || r.rental_a::text;
  if v_level <> 'IMPORTANT' then
    raise exception 'Retour non enregistré attendu « IMPORTANT » (§4.4), obtenu « % ».', v_level;
  end if;

  select w.level into v_level from public.notifications_watch() w
  where w.key = 'rental.vehicle.immobilized:' || r.rental_c::text;
  if v_level <> 'URGENT' then
    raise exception 'Immobilisation en location attendue « URGENT » (§4.5), obtenue « % ».', v_level;
  end if;

  select w.level into v_level from public.notifications_watch() w
  where w.key = 'rental.return.due:' || r.rental_d::text;
  if v_level <> 'REMINDER' then
    raise exception 'Retour prévu attendu « REMINDER » (§4.2), obtenu « % ».', v_level;
  end if;

  raise notice '[OK] 6. Retard, rappel, départ, immobilisation : vus, et jamais deux fois.';
end $$;


-- --- 7. CONTRÔLE DE RETOUR, MAINTENANCES, INCIDENTS ---------------------------------
do $$
declare
  r       recette_notif;
  v_res   uuid;
  v_loc   uuid;
  v_mnt   uuid;
  v_inc   uuid;
  v_keys  text[];
  v_level text;
begin
  select * into r from recette_notif;

  /* --- Une location RENTRÉE dont le contrôle attend (§9). */
  insert into public.reservations (reservation_no, client_id, category_id, period)
  values (public.next_number('reservation'), r.client, r.category_id,
          tstzrange(now() - interval '5 days', now() - interval '4 days', '[)'))
  returning id into v_res;
  perform public.confirm_reservation(v_res, r.vehicle_a);
  v_loc := public.convert_reservation_to_rental(v_res);
  update public.rentals set status = 'CONFIRMED', status_changed_at = now() where id = v_loc;
  perform public.start_rental(v_loc, now() - interval '5 days', 9000, 'FULL');
  perform public.return_rental(v_loc, now() - interval '4 days', 9300, 'HALF');
  update recette_notif set res_e = v_res, rental_e = v_loc;

  /* --- Une maintenance PRÉVUE dans trois jours, et une EN RETARD de deux jours. */
  v_mnt := public.create_maintenance(
    p_vehicle_id => r.vehicle_b, p_origin => 'PREVENTIVE',
    p_reason     => 'Entretien préventif — recette notifications',
    p_provider_supplier_id => r.garage,
    p_planned_at => now() + interval '3 days');
  update public.vehicle_maintenances set status = 'PLANNED' where id = v_mnt;
  update recette_notif set mnt_planned = v_mnt;

  v_mnt := public.create_maintenance(
    p_vehicle_id => r.vehicle_b, p_origin => 'INSPECTION',
    p_reason     => 'Contrôle technique — recette notifications',
    p_provider_supplier_id => r.garage,
    p_planned_at => now() - interval '2 days');
  update public.vehicle_maintenances set status = 'PLANNED' where id = v_mnt;
  update recette_notif set mnt_late = v_mnt;

  /* --- Deux incidents sur la location en cours : l'un avec dommage IMPORTANT. */
  select * into r from recette_notif;

  v_inc := public.create_incident(
    p_vehicle_id  => r.vehicle_c,
    p_kind        => 'ACCIDENT',
    p_description => 'Choc latéral pendant la location — recette',
    p_rental_id   => r.rental_c,
    p_damages     => '[{"location":"Aile avant droite","severity":"MAJOR"}]'::jsonb);
  update recette_notif set incident_ma = v_inc;

  v_inc := public.create_incident(
    p_vehicle_id  => r.vehicle_c,
    p_kind        => 'FLAT_TYRE',
    p_description => 'Crevaison signalée — recette',
    p_rental_id   => r.rental_c,
    p_damages     => '[{"location":"Pneu arrière gauche","severity":"MINOR"}]'::jsonb);
  update recette_notif set incident_mi = v_inc;

  select * into r from recette_notif;
  select array_agg(w.key) into v_keys from public.notifications_watch() w;

  if not ('rental.control:' || r.rental_e::text = any(v_keys)) then
    raise exception 'Le contrôle de retour à effectuer n''est pas signalé (§9).';
  end if;
  if not ('maintenance.planned:' || r.mnt_planned::text = any(v_keys)) then
    raise exception 'La maintenance prévue n''est pas rappelée (§28).';
  end if;
  if not ('maintenance.late:' || r.mnt_late::text = any(v_keys)) then
    raise exception 'La maintenance en retard n''est pas signalée (§11).';
  end if;
  if 'maintenance.planned:' || r.mnt_late::text = any(v_keys) then
    raise exception 'Une maintenance en retard est AUSSI annoncée comme prévue (§27).';
  end if;

  select w.level into v_level from public.notifications_watch() w
  where w.key = 'maintenance.late:' || r.mnt_late::text;
  if v_level <> 'ATTENTION' then
    raise exception 'Maintenance en retard attendue « ATTENTION » (§11), obtenue « % ».', v_level;
  end if;

  -- Le niveau de l'incident vient de la GRAVITÉ CONSTATÉE, pas d'un défaut.
  select w.level into v_level from public.notifications_watch() w
  where w.key = 'incident.rental:' || r.incident_ma::text;
  if v_level <> 'URGENT' then
    raise exception 'Incident avec dommage important attendu « URGENT » (§4.5), obtenu « % ».',
      v_level;
  end if;

  select w.level into v_level from public.notifications_watch() w
  where w.key = 'incident.rental:' || r.incident_mi::text;
  if v_level <> 'ATTENTION' then
    raise exception 'Incident sans dommage important attendu « ATTENTION », obtenu « % ».',
      v_level;
  end if;

  raise notice '[OK] 7. Contrôle, maintenances et incidents : niveaux pris dans la donnée.';
end $$;


-- --- 8. ÉCHÉANCES DOCUMENTAIRES — §4.3, §28 -----------------------------------------
do $$
declare
  r      recette_notif;
  v_soon uuid;
  v_old  uuid;
  v_keys text[];
begin
  select * into r from recette_notif;

  insert into public.vehicle_documents (vehicle_id, doc_type, label, expires_on)
  values (r.vehicle_a, 'INSURANCE', 'RECETTE NOTIF — Assurance', current_date + 10)
  returning id into v_soon;

  insert into public.vehicle_documents (vehicle_id, doc_type, label, expires_on)
  values (r.vehicle_a, 'TECHNICAL_INSPECTION', 'RECETTE NOTIF — Contrôle', current_date - 5)
  returning id into v_old;

  -- Un document ARCHIVÉ ne réclame plus rien.
  insert into public.vehicle_documents (vehicle_id, doc_type, label, expires_on, is_archived)
  values (r.vehicle_a, 'INSURANCE', 'RECETTE NOTIF — Archivée', current_date - 5, true);

  -- Un document dont l'échéance est LOIN ne dit rien non plus (horizon 30 jours).
  insert into public.vehicle_documents (vehicle_id, doc_type, label, expires_on)
  values (r.vehicle_a, 'INSURANCE', 'RECETTE NOTIF — Lointaine', current_date + 90);

  update recette_notif set doc_soon = v_soon, doc_expired = v_old;

  select array_agg(w.key) into v_keys from public.notifications_watch() w;

  if not ('vehicle.document.expiring:' || v_soon::text = any(v_keys)) then
    raise exception 'Un document expirant sous 30 jours n''est pas signalé.';
  end if;
  if not ('vehicle.document.expired:' || v_old::text = any(v_keys)) then
    raise exception 'Un document expiré n''est pas signalé.';
  end if;

  if exists (
    select 1 from public.notifications_watch() w
    where w.kind like 'VEHICLE_DOCUMENT%'
      and w.subject = 'RECETTE NOTIF — Archivée'
  ) then
    raise exception 'Un document archivé produit encore une notification.';
  end if;
  if exists (
    select 1 from public.notifications_watch() w
    where w.kind like 'VEHICLE_DOCUMENT%'
      and w.subject = 'RECETTE NOTIF — Lointaine'
  ) then
    raise exception 'Un document expirant dans 90 jours est signalé trop tôt.';
  end if;

  -- Un document expirant AUJOURD'HUI n'est pas expiré : l'échéance au 30 n'est
  -- pas dépassée le 30 (DEC-025 §e).
  if exists (
    select 1 from public.notifications_watch() w
    where w.kind = 'VEHICLE_DOCUMENT_EXPIRED'
      and w.due_on = current_date
  ) then
    raise exception 'Une échéance du jour est présentée comme dépassée.';
  end if;

  raise notice '[OK] 8. Échéances documentaires : proches, dépassées, archivées, lointaines.';
end $$;


-- --- 9. FACTURE CLIENT ÉCHUE — le montant est le SOLDE, jamais le total -------------
--
-- Workflow 08 §21 : solde = total − encaissé. Une notification qui annoncerait
-- le total réclamerait ce qui a déjà été payé.
do $$
declare
  r       recette_notif;
  v_inv   uuid;
  v_amount bigint;
begin
  select * into r from recette_notif;

  -- Sans location rattachée : `rental_e` doit rester « À contrôler » pour la
  -- famille du §9, et seule une location « À facturer » se facture
  -- (Workflow 07 §5).
  v_inv := public.create_customer_invoice(r.client, current_date - 20, current_date - 5,
                                          null, 'Recette LOT 10');
  perform public.add_customer_invoice_line(v_inv, 'RENTAL', 'Location 3 jours', 3, 150000, null);
  perform public.issue_customer_invoice(v_inv, 'Recette LOT 10');
  update recette_notif set invoice_c = v_inv;

  select w.amount into v_amount from public.notifications_watch() w
  where w.key = 'customer_invoice.overdue:' || v_inv::text;
  if v_amount is null then
    raise exception 'La facture client échue n''est pas signalée.';
  end if;
  if v_amount <> 450000 then
    raise exception 'Solde annoncé attendu 450 000, obtenu %.', v_amount;
  end if;

  -- Un encaissement partiel RÉDUIT le montant annoncé.
  perform public.record_customer_payment(v_inv, r.account, 200000, current_date,
                                         'BANK_TRANSFER', 'VIR-NOTIF-1', null);

  select w.amount into v_amount from public.notifications_watch() w
  where w.key = 'customer_invoice.overdue:' || v_inv::text;
  if v_amount <> 250000 then
    raise exception 'Après 200 000 encaissés, solde attendu 250 000, obtenu %.', v_amount;
  end if;

  -- Une facture NON ÉCHUE ne dit rien : le retard qualifie une échéance passée.
  if exists (
    select 1 from public.notifications_watch() w
    where w.kind = 'CUSTOMER_INVOICE_OVERDUE' and w.due_on >= current_date
  ) then
    raise exception 'Une facture non échue est signalée comme en retard.';
  end if;

  raise notice '[OK] 9. Facture client échue : 450 000 puis 250 000 — le solde, pas le total.';
end $$;


-- --- 10. FACTURE FOURNISSEUR ÉCHUE — L'IMPUTATION N'EST PAS UN PAIEMENT -------------
--
-- LE CONTRÔLE LE PLUS IMPORTANT DE CETTE RECETTE (CLAUDE.md §16, §57).
--
--   Brut      1 000 000
--   Imputé      300 000    ← n'est pas un règlement
--   Net         700 000    ← ce que la notification doit annoncer
--   Payé        200 000
--   Reste dû    500 000
do $$
declare
  r        recette_notif;
  v_veh    uuid;
  v_mnt    uuid;
  v_imp    uuid;
  v_inv    uuid;
  v_amount bigint;
begin
  select * into r from recette_notif;

  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id, status)
  values (public.next_number('vehicle'), r.category_id, 'RNOTIF', 'SUP', 'RN-0005',
          'SUPPLIED', r.supplier, 'AVAILABLE')
  returning id into v_veh;

  v_mnt := public.create_maintenance(
    p_vehicle_id => v_veh, p_origin => 'BREAKDOWN',
    p_reason     => 'Panne imputable — recette notifications',
    p_provider_supplier_id => r.garage);
  perform public.record_maintenance_costs(v_mnt, 250000, 300000, 300000);

  v_imp := public.create_imputation(v_mnt, r.supplier, 300000,
    'Panne imputable au fournisseur selon les conditions de mise à disposition.');
  perform public.submit_imputation(v_imp);
  perform public.validate_imputation(v_imp, 'Recette LOT 10');

  v_inv := public.create_supplier_invoice(r.supplier, current_date - 10, current_date - 3,
                                          'FRN-NOTIF-1', 'Recette LOT 10');
  perform public.add_supplier_invoice_line(v_inv, 'Mise à disposition', 1000000, v_veh);
  perform public.submit_supplier_invoice(v_inv);
  perform public.validate_supplier_invoice(v_inv);

  update recette_notif set invoice_s = v_inv, imputation = v_imp;

  -- Avant rattachement : la dette vaut le brut.
  select w.amount into v_amount from public.notifications_watch() w
  where w.key = 'supplier_invoice.overdue:' || v_inv::text;
  if v_amount <> 1000000 then
    raise exception 'Dette annoncée attendue 1 000 000 avant imputation, obtenue %.', v_amount;
  end if;

  perform public.attach_imputation_to_invoice(v_imp, v_inv);

  select w.amount into v_amount from public.notifications_watch() w
  where w.key = 'supplier_invoice.overdue:' || v_inv::text;
  if v_amount <> 700000 then
    raise exception
      'Dette annoncée attendue 700 000 (brut − imputé), obtenue % — une imputation aurait été ignorée.',
      v_amount;
  end if;

  perform public.record_supplier_payment(v_inv, r.account, 200000, current_date,
                                         'CASH', 'REG-NOTIF-1', null);

  select w.amount into v_amount from public.notifications_watch() w
  where w.key = 'supplier_invoice.overdue:' || v_inv::text;
  if v_amount <> 500000 then
    raise exception 'Reste dû annoncé attendu 500 000, obtenu %.', v_amount;
  end if;

  raise notice '[OK] 10. Dette fournisseur : 1 000 000 → 700 000 → 500 000. Imputé ≠ payé.';
end $$;


-- --- 11. L'ORDRE, LES COMPTEURS, LES FILTRES ----------------------------------------
do $$
declare
  v_first  text;
  v_total  int;
  v_watch  int;
  s        record;
  v_ranks  int[];
begin
  -- §25 : l'urgent d'abord. Le premier rang rendu ne peut jamais être plus
  -- faible qu'un rang présent plus loin.
  select array_agg(public.notification_level_rank(f.level)) into v_ranks
  from public.notifications_feed() f;

  for v_total in 2 .. coalesce(array_length(v_ranks, 1), 1) loop
    if v_ranks[v_total] < v_ranks[v_total - 1] then
      raise exception 'Le centre ne présente pas les notifications par priorité (§25).';
    end if;
  end loop;

  select w.level into v_first from public.notifications_feed() f
  join public.notifications_watch() w on w.key = f.key limit 1;

  -- Le compteur porte sur TOUTE la veille, jamais sur une page (DEC-032 §b).
  select count(*)::int into v_watch from public.notifications_watch();
  select * into s from public.notifications_summary();

  if s.total <> v_watch then
    raise exception 'Le total du compteur (%) diffère de la veille (%).', s.total, v_watch;
  end if;
  -- Hors session applicative, aucun état de lecture n'existe : tout est non lu.
  if s.unread <> v_watch then
    raise exception 'Sans session, le non-lu (%) devrait valoir le total (%).', s.unread, v_watch;
  end if;
  if s.urgent + s.important + s.attention + s.reminder > s.total then
    raise exception 'La somme des niveaux dépasse le total.';
  end if;
  if s.urgent < 1 or s.important < 1 or s.attention < 1 or s.reminder < 1 then
    raise exception 'Les quatre niveaux devraient être représentés : % / % / % / %.',
      s.urgent, s.important, s.attention, s.reminder;
  end if;

  -- Le filtre s'applique EN BASE, avant la limite.
  if exists (select 1 from public.notifications_feed('unread', 'URGENT') f where f.level <> 'URGENT')
  then
    raise exception 'Le filtre de niveau laisse passer un autre niveau.';
  end if;
  if exists (select 1 from public.notifications_feed(null, null, 'billing') f
             where f.source <> 'billing') then
    raise exception 'Le filtre de module laisse passer un autre module.';
  end if;
  if (select count(*) from public.notifications_feed(null, null, null, 2)) > 2 then
    raise exception 'La limite du centre n''est pas respectée.';
  end if;
  -- Une limite absurde est ramenée dans ses bornes, sans erreur.
  perform public.notifications_feed(null, null, null, -50);
  perform public.notifications_feed(null, null, null, 100000);

  -- Un filtre inconnu ne rend rien plutôt que tout : mieux vaut vide que faux.
  if exists (select 1 from public.notifications_feed(null, 'N''IMPORTE QUOI')) then
    raise exception 'Un niveau inconnu rend des lignes.';
  end if;

  raise notice '[OK] 11. Priorité, compteurs exacts, filtres en base, limite bornée.';
end $$;


-- --- 12. MARQUER COMME LU EXIGE UNE SESSION -----------------------------------------
--
-- Une notification se marque au nom d'un utilisateur : la clé de service n'en
-- est pas un. Le refus est explicite, jamais une écriture anonyme.
do $$
declare v_ok boolean := false;
begin
  begin
    perform public.notification_mark_read(array['rental.return.late:00000000-0000-0000-0000-000000000000']);
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'Un marquage sans session applicative a été accepté.';
  end if;

  v_ok := false;
  begin
    perform public.notification_mark_all_read();
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '« Tout marquer comme lu » a été accepté sans session.';
  end if;

  raise notice '[OK] 12. Aucun marquage hors session applicative.';
end $$;


-- --- 13. UNE SITUATION RÉSOLUE CESSE D'ELLE-MÊME DE DIRE ----------------------------
--
-- C'est la preuve que rien n'est stocké : aucune tâche, aucun déclencheur ne
-- vient « fermer » la notification. Le retour enregistré, elle n'existe plus.
do $$
declare
  r      recette_notif;
  v_keys text[];
begin
  select * into r from recette_notif;

  perform public.return_rental(r.rental_a, now(), 10500, 'HALF');
  perform public.record_customer_payment(r.invoice_c, r.account, 250000, current_date,
                                         'CASH', null, null);
  update public.vehicles set status = 'AVAILABLE', status_changed_at = now()
   where id = r.vehicle_b;

  select array_agg(w.key) into v_keys from public.notifications_watch() w;

  if 'rental.return.late:' || r.rental_a::text = any(v_keys) then
    raise exception 'Une location rentrée est encore annoncée en retard.';
  end if;
  if 'customer_invoice.overdue:' || r.invoice_c::text = any(v_keys) then
    raise exception 'Une facture soldée est encore annoncée impayée.';
  end if;
  if 'vehicle.immobilized:' || r.vehicle_b::text = any(v_keys) then
    raise exception 'Un véhicule remis en service est encore annoncé immobilisé.';
  end if;

  -- Et le contrôle de retour, lui, apparaît : le retour vient d'être enregistré.
  if not ('rental.control:' || r.rental_a::text = any(v_keys)) then
    raise exception 'Le contrôle du retour qui vient d''être enregistré n''est pas signalé.';
  end if;

  raise notice '[OK] 13. Situation résolue, notification disparue. Rien n''est stocké.';
end $$;


-- --- 14. AUCUNE ÉCRITURE PRODUITE PAR LA VEILLE -------------------------------------
do $$
declare
  v_before int;
  v_after  int;
  v_audit  int;
begin
  select count(*)::int into v_before from public.treasury_entries;
  select count(*)::int into v_audit  from public.audit_log;

  perform count(*) from public.notifications_watch();
  perform count(*) from public.notifications_feed();
  perform count(*) from public.notifications_summary();

  select count(*)::int into v_after from public.treasury_entries;
  if v_after <> v_before then
    raise exception 'La veille a produit une écriture de trésorerie.';
  end if;

  if (select count(*)::int from public.audit_log) <> v_audit then
    raise exception 'La veille a produit une entrée au journal d''audit.';
  end if;

  raise notice '[OK] 14. Trois lectures, aucune écriture, aucun journal.';
end $$;


-- --- 15. LE CATALOGUE NE BOUGE PAS ---------------------------------------------------
do $$
declare v_total int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 170 then
    raise exception 'Catalogue attendu à 170 permissions, obtenu %.', v_total;
  end if;

  if exists (
    select 1 from public.permissions p
    where p.code like 'notifications.%' and p.code <> 'notifications.view'
  ) then
    raise exception 'Une capacité de notifications a été créée d''office (DEC-024).';
  end if;

  raise notice '[OK] 15. Catalogue à 170 permissions, `notifications.view` seule.';
end $$;


rollback;

-- =============================================================================
-- Transaction annulée : aucune donnée de recette ne subsiste.
-- =============================================================================
