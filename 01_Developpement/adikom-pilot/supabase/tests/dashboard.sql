-- =============================================================================
-- ADIKOM PILOT — Recette Tableau de bord (Phase 3 — Pilotage, LOT 9)
--
-- CE QU'ELLE ÉPROUVE
--
-- Le tableau de bord n'écrit rien : il n'a ni table, ni colonne, ni statut. Ce
-- que la BASE doit porter seule, ce sont ses SOMMES — et une somme fausse est
-- pire qu'une somme absente.
--
-- Le jeu de recette reprend les exemples de la documentation :
--
--   Facture client        450 000 KMF   (Workflow 08 §5)
--   Encaissement          200 000 KMF
--   Reste à encaisser     250 000 KMF
--
--   Facture fournisseur 1 000 000 KMF   (CLAUDE.md §16)
--   Imputation            300 000 KMF
--   Net à payer           700 000 KMF
--   Règlement             200 000 KMF
--   Reste à payer         500 000 KMF
--
-- Le point critique est le second : une imputation N'EST PAS un paiement
-- (CLAUDE.md §57). Un tableau de bord qui l'ignorerait annoncerait une dette
-- de 1 000 000 là où ADIKOM ne doit que 500 000.
--
-- Exécution :
--   npm run db:verify:dashboard
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne RLS
-- et les gardes de capacité (`current_actor()` y est NULL). Il contrôle donc
-- l'ARITHMÉTIQUE et la STRUCTURE ; les capacités sont éprouvées avec de vraies
-- sessions par `verify:pilotage` et `verify:capabilities`.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_tdb (
  category_id uuid,
  client      uuid,
  vehicle     uuid,
  supplier    uuid,
  garage      uuid,
  rule_id     uuid,
  reservation uuid,
  rental      uuid,
  invoice     uuid,
  account     uuid,
  maintenance uuid,
  imputation  uuid,
  sup_invoice uuid
) on commit drop;

insert into recette_tdb
values (null, null, null, null, null, null, null, null, null, null, null, null, null);


-- --- 1. LE TABLEAU DE BORD NE STOCKE RIEN -------------------------------------------
--
-- Aucun indicateur en base. S'il en existait un, il faudrait le tenir à jour —
-- et un indicateur périmé est un indicateur faux (Module 01 §6 : « calculés à
-- partir des données réelles »).
do $$
declare v_bad text[];
begin
  select array_agg(tablename) into v_bad
  from pg_tables
  where schemaname = 'public'
    and (tablename like 'dashboard%' or tablename like '%_kpi%' or tablename like 'indicateur%');
  if v_bad is not null then
    raise exception 'Le tableau de bord stocke des indicateurs : %.', v_bad;
  end if;

  select array_agg(table_name || '.' || column_name) into v_bad
  from information_schema.columns
  where table_schema = 'public'
    and column_name in ('kpi_value', 'dashboard_total', 'cached_total', 'revenue_total');
  if v_bad is not null then
    raise exception 'Indicateur recopié dans une colonne : %.', v_bad;
  end if;

  raise notice '[OK] 1. Aucun indicateur stocké : tout se recalcule à la lecture.';
end $$;


-- --- 2. LES SEPT FONCTIONS EXISTENT, ET SONT SOBRES ----------------------------------
--
-- `SECURITY INVOKER` (DEC-022), `stable`, `search_path` figé. Une fonction de
-- lecture qui s'exécuterait avec les droits de son propriétaire contournerait
-- RLS — et rendrait à chacun les chiffres de tout le monde.
do $$
declare
  v_fns  text[] := array[
    'dashboard_operations', 'dashboard_reservations', 'dashboard_fleet',
    'dashboard_customer_invoiced', 'dashboard_customer_collected',
    'dashboard_customer_receivables', 'dashboard_supplier_payables'
  ];
  v_bad  text[];
  v_seen int;
begin
  select count(distinct p.proname) into v_seen
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns);
  if v_seen <> 7 then
    raise exception 'Sept fonctions attendues, % trouvée(s).', v_seen;
  end if;

  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns) and p.prosecdef;
  if v_bad is not null then
    raise exception 'SECURITY DEFINER de commodité (DEC-022) : %.', v_bad;
  end if;

  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns) and p.provolatile <> 's';
  if v_bad is not null then
    raise exception 'Fonction de lecture non « stable » : %.', v_bad;
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

  raise notice '[OK] 2. Sept fonctions, toutes SECURITY INVOKER, stables et fermées à PUBLIC.';
end $$;


-- --- 3. CHAQUE FONCTION EXIGE SES CAPACITÉS -----------------------------------------
--
-- Le contrôle est LEXICAL : la garde doit être écrite dans le corps de la
-- fonction. Son EFFET, lui, s'éprouve avec de vraies sessions — ici
-- `current_actor()` est NULL et `require_capability` s'efface (migration 021).
do $$
declare
  v_src  text;
  v_want text;
  v_pair text[][] := array[
    ['dashboard_operations',           'rental.rentals.view'],
    ['dashboard_reservations',         'rental.reservations.view'],
    ['dashboard_fleet',                'dashboard.fleet.view'],
    ['dashboard_fleet',                'rental.fleet.view'],
    ['dashboard_customer_invoiced',    'dashboard.financial.view'],
    ['dashboard_customer_invoiced',    'billing.customer_invoices.view'],
    ['dashboard_customer_collected',   'billing.customer_payments.view'],
    ['dashboard_customer_receivables', 'billing.customer_invoices.view'],
    ['dashboard_customer_receivables', 'billing.customer_payments.view'],
    ['dashboard_supplier_payables',    'billing.supplier_invoices.view'],
    ['dashboard_supplier_payables',    'billing.imputations.view'],
    ['dashboard_supplier_payables',    'billing.supplier_payments.view']
  ];
  i int;
begin
  for i in 1 .. array_length(v_pair, 1) loop
    select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_pair[i][1]
    limit 1;

    v_want := v_pair[i][2];
    if position(v_want in v_src) = 0 then
      raise exception '% n''exige pas « % ».', v_pair[i][1], v_want;
    end if;
  end loop;

  -- `dashboard.view` garde les sept : la page ne s'ouvre pas par la bande.
  for i in 1 .. 7 loop
    select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = (array[
        'dashboard_operations', 'dashboard_reservations', 'dashboard_fleet',
        'dashboard_customer_invoiced', 'dashboard_customer_collected',
        'dashboard_customer_receivables', 'dashboard_supplier_payables'
      ])[i]
    limit 1;

    if position('dashboard.view' in v_src) = 0 then
      raise exception 'Une fonction du pilotage n''exige pas « dashboard.view ».';
    end if;
  end loop;

  raise notice '[OK] 3. Chaque somme nomme les capacités dont elle dépend.';
end $$;


-- --- 4. JEU DE RECETTE — le cycle client complet -------------------------------------
do $$
declare
  v_cat uuid; v_cli uuid; v_veh uuid; v_rule uuid; v_res uuid; v_loc uuid;
  v_inv uuid; v_acc uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RTDB-TEST', 'Recette tableau de bord') returning id into v_cat;

  insert into public.clients (client_no, type, legal_name, phone)
  values (public.next_number('client'), 'COMPANY', 'RECETTE TDB — Client', '+269 900')
  returning id into v_cli;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'TDB', 'RT-0001', 'OWNED', 'AVAILABLE')
  returning id into v_veh;

  insert into public.pricing_rules (category_id, amount, unit)
  values (v_cat, 150000, 'DAY') returning id into v_rule;

  insert into public.reservations (reservation_no, client_id, category_id, period)
  values (public.next_number('reservation'), v_cli, v_cat,
          tstzrange(now() + interval '1 day', now() + interval '4 days', '[)'))
  returning id into v_res;

  perform public.confirm_reservation(v_res, v_veh);
  v_loc := public.convert_reservation_to_rental(v_res);

  update public.rentals set status = 'CONFIRMED', status_changed_at = now() where id = v_loc;
  perform public.start_rental(v_loc, now(), 10000, 'FULL');
  perform public.return_rental(v_loc, now() + interval '1 hour', 10450, 'HALF');
  update public.rentals set status = 'TO_INVOICE', status_changed_at = now() where id = v_loc;

  -- Échéance DÉPASSÉE : la facture doit ressortir dans la part échue. Une
  -- échéance ne pouvant précéder sa facture (§21), c'est la FACTURE qui est
  -- datée d'il y a vingt jours — ce qui éprouve du même coup la période.
  v_inv := public.create_customer_invoice(v_cli, current_date - 20, current_date - 5, v_loc, null);
  perform public.add_customer_invoice_line(v_inv, 'RENTAL', 'Location 3 jours', 3, 150000, null);
  perform public.issue_customer_invoice(v_inv, 'Recette LOT 9');

  v_acc := public.create_financial_account('BANK', 'Banque de recette TDB', 'BIC ADIKOM',
                                           'CPT-TDB-1', 0, current_date - 30, null);

  update recette_tdb set
    category_id = v_cat, client = v_cli, vehicle = v_veh, rule_id = v_rule,
    reservation = v_res, rental = v_loc, invoice = v_inv, account = v_acc;

  if public.customer_invoice_total(v_inv) <> 450000 then
    raise exception 'Total attendu 450 000, obtenu %.', public.customer_invoice_total(v_inv);
  end if;

  raise notice '[OK] 4. Facture client de 450 000 KMF émise, échéance dépassée.';
end $$;


-- --- 5. FACTURÉ SUR LA PÉRIODE — Module 01 §16 --------------------------------------
--
-- La période est un intervalle de JOURS CIVILS, bornes comprises. Un jour de
-- trop ou de moins, et le mois se met à empiéter sur le suivant.
do $$
declare
  v_before bigint;
  v_inv    uuid := (select invoice from recette_tdb);
  v_cli    uuid := (select client from recette_tdb);
  v_draft  uuid;
  v_out    uuid;
begin
  v_before := public.dashboard_customer_invoiced(current_date - 20, current_date - 20);
  if v_before < 450000 then
    raise exception 'La facture du jour n''est pas comptée : % KMF.', v_before;
  end if;

  -- Un BROUILLON ne reconnaît aucune créance (Workflow 07 §25) : il n'entre pas.
  v_draft := public.create_customer_invoice(v_cli, current_date - 20, null, null, 'Brouillon');
  perform public.add_customer_invoice_line(v_draft, 'SERVICE', 'Non émise', 1, 999000, null);

  if public.dashboard_customer_invoiced(current_date - 20, current_date - 20) <> v_before then
    raise exception 'Un brouillon a été compté dans le facturé.';
  end if;

  -- Une ANNULÉE non plus : elle n'a jamais produit de chiffre d'affaires.
  v_out := public.create_customer_invoice(v_cli, current_date - 20, null, null, 'À annuler');
  perform public.add_customer_invoice_line(v_out, 'SERVICE', 'Annulée', 1, 777000, null);
  perform public.issue_customer_invoice(v_out, 'Recette');
  perform public.cancel_customer_invoice(v_out, 'Recette LOT 9');

  if public.dashboard_customer_invoiced(current_date - 20, current_date - 20) <> v_before then
    raise exception 'Une facture annulée a été comptée dans le facturé.';
  end if;

  -- Hors période : une facture d'il y a vingt jours n'est pas d'hier.
  if public.dashboard_customer_invoiced(current_date - 19, current_date) <> 0 then
    raise exception 'Une facture est comptée hors de sa période.';
  end if;

  -- Bornes INCLUSES aux deux extrémités.
  if public.dashboard_customer_invoiced(current_date - 20, current_date) < 450000
     or public.dashboard_customer_invoiced(current_date - 30, current_date - 20) < 450000 then
    raise exception 'Les bornes de la période ne sont pas incluses.';
  end if;

  raise notice '[OK] 5. Facturé : brouillon et annulée exclus, bornes incluses.';
end $$;


-- --- 6. ENCAISSÉ ET RESTE À ENCAISSER — Workflow 08 §21 ------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_tdb);
  v_acc uuid := (select account from recette_tdb);
  v_pay uuid;
  r     record;
begin
  if public.dashboard_customer_collected(current_date, current_date) <> 0 then
    raise exception 'Un encaissement est présumé avant tout règlement.';
  end if;

  v_pay := public.record_customer_payment(v_inv, v_acc, 200000, current_date, 'BANK_TRANSFER',
                                          'VIR-TDB-1', null);

  if public.dashboard_customer_collected(current_date, current_date) <> 200000 then
    raise exception 'Encaissé attendu 200 000, obtenu %.',
      public.dashboard_customer_collected(current_date, current_date);
  end if;

  -- Le règlement se compte à SA date, jamais à celle de la facture (§11).
  if public.dashboard_customer_collected(current_date + 1, current_date + 30) <> 0 then
    raise exception 'Un règlement est compté hors de sa date de réception.';
  end if;

  select * into r from public.dashboard_customer_receivables();

  if r.amount <> 250000 then
    raise exception 'Reste à encaisser attendu 250 000, obtenu %.', r.amount;
  end if;
  if r.invoice_count <> 1 then
    raise exception 'Une seule facture non soldée attendue, % trouvée(s).', r.invoice_count;
  end if;
  -- Échéance à J−5 : la créance est échue.
  if r.overdue_count <> 1 or r.overdue_amount <> 250000 then
    raise exception 'Part échue attendue 1 / 250 000, obtenue % / %.',
      r.overdue_count, r.overdue_amount;
  end if;

  -- ANNULER le règlement rétablit la créance ENTIÈRE : un encaissement annulé
  -- n'a rien encaissé (Workflow 08 §28, migration 054).
  perform public.cancel_customer_payment(v_pay, 'Recette LOT 9');

  select * into r from public.dashboard_customer_receivables();
  if r.amount <> 450000 then
    raise exception 'Après annulation, créance attendue 450 000, obtenue %.', r.amount;
  end if;
  if public.dashboard_customer_collected(current_date, current_date) <> 0 then
    raise exception 'Un règlement annulé compte encore dans l''encaissé.';
  end if;

  -- Puis on le rejoue, pour la suite de la recette.
  perform public.record_customer_payment(v_inv, v_acc, 200000, current_date, 'CASH', null, null);

  raise notice '[OK] 6. Encaissé 200 000, reste 250 000, dont 250 000 échus. Annulation rendue.';
end $$;


-- --- 7. UNE FACTURE SOLDÉE SORT DES CRÉANCES ----------------------------------------
--
-- « Le retard qualifie une créance qui court encore » : une facture payée
-- n'est jamais en retard, même échéance dépassée (Workflow 07 §30).
do $$
declare
  v_inv uuid := (select invoice from recette_tdb);
  v_acc uuid := (select account from recette_tdb);
  r     record;
begin
  perform public.record_customer_payment(v_inv, v_acc, 250000, current_date, 'CASH', null, null);

  select * into r from public.dashboard_customer_receivables();
  if r.amount <> 0 or r.invoice_count <> 0 then
    raise exception 'Une facture soldée reste comptée : % / %.', r.invoice_count, r.amount;
  end if;
  if r.overdue_count <> 0 then
    raise exception 'Une facture soldée est présentée comme en retard.';
  end if;

  -- Et l'encaissé du jour vaut bien la totalité versée.
  if public.dashboard_customer_collected(current_date, current_date) <> 450000 then
    raise exception 'Encaissé attendu 450 000, obtenu %.',
      public.dashboard_customer_collected(current_date, current_date);
  end if;

  raise notice '[OK] 7. Facture soldée : sortie des créances, jamais dite en retard.';
end $$;


-- --- 8. DETTE FOURNISSEUR — l'imputation n'est PAS un paiement ------------------------
--
-- CLAUDE.md §16 et §57, le contrôle le plus important de cette recette.
--
--   Brut      1 000 000
--   Imputé      300 000    ← n'est pas un règlement
--   Net         700 000
--   Payé        200 000
--   Reste dû    500 000
do $$
declare
  v_cat uuid := (select category_id from recette_tdb);
  v_sup uuid; v_gar uuid; v_veh uuid; v_mnt uuid; v_imp uuid; v_inv uuid;
  v_acc uuid := (select account from recette_tdb);
  r     record;
begin
  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER', 'RECETTE TDB — Fournisseur',
          '+269 901', 'ACTIVE')
  returning id into v_sup;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'MAINTENANCE_PROVIDER', 'RECETTE TDB — Garage',
          '+269 902', 'ACTIVE')
  returning id into v_gar;

  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'TDB-SUP', 'RT-0002',
          'SUPPLIED', v_sup, 'AVAILABLE')
  returning id into v_veh;

  v_mnt := public.create_maintenance(
    p_vehicle_id => v_veh, p_origin => 'BREAKDOWN',
    p_reason => 'Panne imputable — recette tableau de bord',
    p_provider_supplier_id => v_gar);
  perform public.record_maintenance_costs(v_mnt, 250000, 300000, 300000);

  v_imp := public.create_imputation(v_mnt, v_sup, 300000,
    'Panne imputable au fournisseur selon les conditions de mise à disposition.');
  perform public.submit_imputation(v_imp);
  perform public.validate_imputation(v_imp, 'Recette LOT 9');

  -- Échéance dépassée : la dette doit ressortir dans la part échue. Même
  -- contrainte que côté client — c'est la facture qui est antidatée.
  v_inv := public.create_supplier_invoice(v_sup, current_date - 10, current_date - 3,
                                          'FRN-TDB-1', 'Recette LOT 9');
  perform public.add_supplier_invoice_line(v_inv, 'Mise à disposition', 1000000, v_veh);
  perform public.submit_supplier_invoice(v_inv);
  perform public.validate_supplier_invoice(v_inv);
  perform public.attach_imputation_to_invoice(v_imp, v_inv);

  update recette_tdb set
    supplier = v_sup, garage = v_gar, maintenance = v_mnt,
    imputation = v_imp, sup_invoice = v_inv;

  if public.supplier_invoice_gross(v_inv) <> 1000000 then
    raise exception 'Brut attendu 1 000 000, obtenu %.', public.supplier_invoice_gross(v_inv);
  end if;
  if public.supplier_invoice_imputed(v_inv) <> 300000 then
    raise exception 'Imputé attendu 300 000, obtenu %.', public.supplier_invoice_imputed(v_inv);
  end if;

  -- AVANT tout règlement : la dette vaut le NET, jamais le brut.
  select * into r from public.dashboard_supplier_payables();
  if r.amount <> 700000 then
    raise exception 'Dette attendue 700 000 (imputation déduite), obtenue %.', r.amount;
  end if;

  perform public.record_supplier_payment(v_inv, v_acc, 200000, current_date, 'BANK_TRANSFER',
                                         'VIR-TDB-F', null);

  select * into r from public.dashboard_supplier_payables();
  if r.amount <> 500000 then
    raise exception 'Reste à payer attendu 500 000, obtenu %.', r.amount;
  end if;
  if r.invoice_count <> 1 then
    raise exception 'Une seule facture fournisseur due attendue, %.', r.invoice_count;
  end if;
  if r.overdue_count <> 1 or r.overdue_amount <> 500000 then
    raise exception 'Part échue fournisseur attendue 1 / 500 000, obtenue % / %.',
      r.overdue_count, r.overdue_amount;
  end if;

  raise notice '[OK] 8. Dette = brut − imputé − payé : 500 000 KMF, jamais 1 000 000.';
end $$;


-- --- 9. UNE FACTURE FOURNISSEUR NON VALIDÉE N'EST PAS UNE DETTE ----------------------
do $$
declare
  v_sup uuid := (select supplier from recette_tdb);
  v_new uuid;
  r     record;
  v_ref bigint;
begin
  select amount into v_ref from public.dashboard_supplier_payables();

  v_new := public.create_supplier_invoice(v_sup, current_date, null, 'FRN-TDB-2', 'En saisie');
  perform public.add_supplier_invoice_line(v_new, 'Ligne en saisie', 888000, null);

  select * into r from public.dashboard_supplier_payables();
  if r.amount <> v_ref then
    raise exception 'Une facture non validée est comptée comme dette : % vs %.', r.amount, v_ref;
  end if;

  raise notice '[OK] 9. Brouillon fournisseur : aucune dette reconnue.';
end $$;


-- --- 10. EXPLOITATION, RÉSERVATIONS, PARC -------------------------------------------
do $$
declare
  v_veh uuid := (select vehicle from recette_tdb);
  o     record;
  f     record;
  v_seen int;
begin
  select * into o from public.dashboard_operations();

  -- La location de recette est passée à « Facturée » : elle ne court plus.
  if o.running < 0 or o.late < 0 or o.to_control < 0 or o.to_invoice < 0 then
    raise exception 'Un comptage d''exploitation est négatif.';
  end if;

  -- Le parc rend un décompte par statut, et le véhicule de recette y figure.
  select count(*) into v_seen from public.dashboard_fleet();
  if v_seen = 0 then
    raise exception 'Le parc ne rend aucun statut alors que des véhicules existent.';
  end if;

  select * into f from public.dashboard_fleet()
  where status = (select status::text from public.vehicles where id = v_veh);
  if f.vehicle_count < 1 then
    raise exception 'Le véhicule de recette n''est pas compté dans son statut.';
  end if;

  -- Une fenêtre de réservation hors bornes est ramenée, jamais refusée.
  perform public.dashboard_reservations(-5);
  perform public.dashboard_reservations(9999);
  perform public.dashboard_reservations(null);

  raise notice '[OK] 10. Exploitation, parc et réservations répondent ; fenêtre bornée.';
end $$;


-- --- 11. AUCUN EFFET DE BORD : LE PILOTAGE NE MODIFIE RIEN ---------------------------
--
-- Sept fonctions `stable` : les appeler ne doit rien changer. Le contrôle est
-- direct — on relève l'état avant, on appelle tout, on compare.
do $$
declare
  v_loc      uuid := (select rental from recette_tdb);
  v_inv      uuid := (select invoice from recette_tdb);
  v_veh      uuid := (select vehicle from recette_tdb);
  v_loc_st   text;
  v_inv_st   text;
  v_veh_st   text;
  v_entries  int;
begin
  select status::text into v_loc_st from public.rentals where id = v_loc;
  select status::text into v_inv_st from public.customer_invoices where id = v_inv;
  select status::text into v_veh_st from public.vehicles where id = v_veh;
  select count(*) into v_entries from public.treasury_entries;

  perform public.dashboard_operations();
  perform public.dashboard_reservations(7);
  perform public.dashboard_fleet();
  perform public.dashboard_customer_invoiced(current_date - 365, current_date);
  perform public.dashboard_customer_collected(current_date - 365, current_date);
  perform public.dashboard_customer_receivables();
  perform public.dashboard_supplier_payables();

  if (select status::text from public.rentals where id = v_loc) <> v_loc_st then
    raise exception 'Le pilotage a modifié le statut d''une location.';
  end if;
  if (select status::text from public.customer_invoices where id = v_inv) <> v_inv_st then
    raise exception 'Le pilotage a modifié le statut d''une facture.';
  end if;
  if (select status::text from public.vehicles where id = v_veh) <> v_veh_st then
    raise exception 'Le pilotage a modifié le statut d''un véhicule.';
  end if;
  if (select count(*) from public.treasury_entries) <> v_entries then
    raise exception 'Le pilotage a produit une écriture de trésorerie.';
  end if;

  raise notice '[OK] 11. Sept lectures, aucun effet : statuts et écritures inchangés.';
end $$;


-- --- 12. AUCUNE PERMISSION CRÉÉE, LES TROIS EXISTENT ---------------------------------
do $$
declare
  v_total   int;
  v_missing text[];
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 170 then
    raise exception 'Catalogue attendu à 170 permissions, obtenu %.', v_total;
  end if;

  select array_agg(code) into v_missing
  from unnest(array['dashboard.view', 'dashboard.financial.view', 'dashboard.fleet.view']) as code
  where not exists (select 1 from public.permissions p where p.code = code);
  if v_missing is not null then
    raise exception 'Capacité du pilotage absente : %.', array_to_string(v_missing, ', ');
  end if;

  -- Et aucune capacité inventée pour le tableau de bord.
  if exists (
    select 1 from public.permissions
    where code like 'dashboard.%'
      and code not in ('dashboard.view', 'dashboard.financial.view', 'dashboard.fleet.view')
  ) then
    raise exception 'Une capacité `dashboard.*` a été ajoutée sans décision (DEC-024).';
  end if;

  raise notice '[OK] 12. Catalogue à 170 ; trois capacités de pilotage, pas une de plus.';
end $$;


-- --- 13. CE QUI RESTE HORS PÉRIMÈTRE ------------------------------------------------
--
-- Le LOT 9 ne livre ni journal d'activité sur le tableau de bord, ni rapport.
--
-- Le Centre de notifications, lui, est arrivé au LOT 10 — et le contrôle
-- ci-dessous n'a rien perdu de son sens : il ne stocke AUCUNE notification.
-- Aucune table `notifications` n'existe, et le tableau de bord se contente d'en
-- compter les non lues (Module 02 §33).
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'notifications') then
    raise exception
      'Une table `notifications` est apparue : une notification stockée est une notification qui se périme (DEC-033 §a).';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'dashboard_report%'
  ) then
    raise exception 'Une fonction de rapport est apparue hors périmètre.';
  end if;

  raise notice '[OK] 13. Aucune notification stockée ; les rapports restent hors périmètre.';
end $$;


rollback;
