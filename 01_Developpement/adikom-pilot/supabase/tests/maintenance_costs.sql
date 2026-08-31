-- =============================================================================
-- ADIKOM PILOT — Recette des coûts de maintenance (Étape 2.4, LOT 3)
--
-- Vérifie ce que la BASE doit porter seule : structure, verrou, transitions de
-- devis, absence totale d'effet en aval, et surtout la SÉPARATION que le
-- LOT 3 introduit — voir un coût, le saisir, décider d'un devis sont trois
-- capacités distinctes.
--
-- Exécution :
--   npm run db:verify:maintenance-costs
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne
-- RLS et les gardes de capacité (`current_actor()` y est NULL). Il contrôle
-- donc le SCHÉMA et les RÈGLES ; les capacités sont éprouvées avec de vraies
-- sessions par `verify:maintenance-costs` et `verify:capabilities`.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_ids (
  category_id uuid,
  vehicle_id  uuid,
  mnt_open    uuid,
  mnt_done    uuid,
  quote_id    uuid
) on commit drop;

insert into recette_ids values (null, null, null, null, null);


-- --- 1. Structure ------------------------------------------------------------------
do $$
declare
  expected_tables text[] := array[
    'maintenance_costs', 'maintenance_cost_lines',
    'maintenance_quotes', 'maintenance_documents'
  ];
  expected_types text[] := array[
    'quote_status', 'cost_line_kind', 'maintenance_document_type'
  ];
  missing text[];
begin
  select array_agg(t) into missing
  from unnest(expected_tables) t
  where not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t);
  if missing is not null then
    raise exception 'Tables manquantes : %', missing;
  end if;

  select array_agg(t) into missing
  from unnest(expected_types) t
  where not exists (select 1 from pg_type where typname = t);
  if missing is not null then
    raise exception 'Types manquants : %', missing;
  end if;

  raise notice '[OK] 1. Les 4 tables et les 3 types financiers sont présents.';
end $$;


-- --- 2. Les montants sont HORS de vehicle_maintenances -------------------------------
--
-- LE POINT DE CONCEPTION DU LOT.
--
-- RLS est ROW-level : un montant rangé dans `vehicle_maintenances` serait lu
-- par quiconque a le droit de lire la ligne, et `rental.maintenance.cost.view`
-- ne masquerait qu'un écran. La séparation N'EST PAS cosmétique.
do $$
declare v_money text[];
begin
  select array_agg(column_name) into v_money
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'vehicle_maintenances'
    and (column_name ~ 'amount|cost|price|montant|cout' or data_type in ('numeric', 'money'));

  if v_money is not null then
    raise exception
      'Montant trouvé dans vehicle_maintenances : % — il serait lisible sans cost.view.', v_money;
  end if;

  -- Et DEC-010 : entiers, jamais de flottant.
  select array_agg(table_name || '.' || column_name) into v_money
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('maintenance_costs', 'maintenance_cost_lines', 'maintenance_quotes')
    and data_type in ('numeric', 'money', 'real', 'double precision');

  if v_money is not null then
    raise exception 'Type non entier pour un montant : % (DEC-010).', v_money;
  end if;

  raise notice '[OK] 2. Montants hors de la table maintenance, et en entiers (DEC-010).';
end $$;


-- --- 3. RLS et aucune suppression -----------------------------------------------------
do $$
declare
  tables text[] := array[
    'maintenance_costs', 'maintenance_cost_lines',
    'maintenance_quotes', 'maintenance_documents'
  ];
  faulty text[];
begin
  select array_agg(c.relname) into faulty
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = any(tables) and not c.relrowsecurity;
  if faulty is not null then raise exception 'RLS absente sur : %', faulty; end if;

  select array_agg(t) into faulty
  from unnest(tables) t
  where has_table_privilege('authenticated', 'public.' || t, 'DELETE');
  if faulty is not null then raise exception 'DELETE accordé sur : %', faulty; end if;

  select array_agg(distinct p.tablename) into faulty
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = any(tables) and p.cmd in ('DELETE', 'ALL');
  if faulty is not null then raise exception 'Policy de suppression sur : %', faulty; end if;

  select array_agg(t) into faulty
  from unnest(tables) t
  where not exists (
    select 1 from pg_trigger
    where tgrelid = ('public.' || t)::regclass and not tgisinternal and tgname like '%no_delete%'
  );
  if faulty is not null then raise exception 'Anti-suppression absent sur : %', faulty; end if;

  -- La LECTURE doit exiger `cost.view` sur les quatre tables : c'est la
  -- raison d'être de la permission créée par ce lot.
  select array_agg(p.tablename) into faulty
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = any(tables) and p.cmd = 'SELECT'
    and p.qual::text not like '%rental.maintenance.cost.view%';
  if faulty is not null then
    raise exception 'Lecture non protégée par cost.view sur : %', faulty;
  end if;

  raise notice '[OK] 3. RLS active, lecture sous cost.view, aucune suppression possible.';
end $$;


-- --- 4. Jeu de recette -----------------------------------------------------------------
do $$
declare v_cat uuid; v_veh uuid; v_open uuid; v_done uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RCOST-TEST', 'Recette coûts') returning id into v_cat;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'COST', 'RC-0001', 'OWNED', 'AVAILABLE')
  returning id into v_veh;

  v_open := public.create_maintenance(
    p_vehicle_id => v_veh, p_origin => 'BREAKDOWN', p_reason => 'Intervention en cours');

  v_done := public.create_maintenance(
    p_vehicle_id => v_veh, p_origin => 'INSPECTION', p_reason => 'Intervention à clore');

  update recette_ids set category_id = v_cat, vehicle_id = v_veh,
                         mnt_open = v_open, mnt_done = v_done;

  raise notice '[OK] 4. Jeu de recette : un véhicule, deux maintenances.';
end $$;


-- --- 5. Les trois montants sont indépendants ---------------------------------------------
-- Aucune règle documentaire ne les relie : rien n'est déduit de rien.
do $$
declare
  v_id uuid := (select mnt_open from recette_ids);
  c    public.maintenance_costs%rowtype;
begin
  perform public.record_maintenance_costs(v_id, 250000, null, null);
  select * into c from public.maintenance_costs where maintenance_id = v_id;

  if c.actual_cost is not null or c.imputable_amount is not null then
    raise exception 'Une estimation a produit un coût réel ou un imputable.';
  end if;

  perform public.record_maintenance_costs(v_id, 250000, 300000, 200000);
  select * into c from public.maintenance_costs where maintenance_id = v_id;

  if c.estimated_cost <> 250000 or c.actual_cost <> 300000 or c.imputable_amount <> 200000 then
    raise exception 'Montants inattendus : % / % / %.',
      c.estimated_cost, c.actual_cost, c.imputable_amount;
  end if;

  -- §35 et Workflow 06 §7 : l'écart et le non-imputable se CALCULENT.
  if (c.actual_cost - c.estimated_cost) <> 50000 then
    raise exception 'Écart attendu 50 000, obtenu %.', c.actual_cost - c.estimated_cost;
  end if;
  if (c.actual_cost - c.imputable_amount) <> 100000 then
    raise exception 'Non imputable attendu 100 000, obtenu %.',
      c.actual_cost - c.imputable_amount;
  end if;

  raise notice '[OK] 5. Estimé, réel et imputable indépendants ; écart et non-imputable dérivés.';
end $$;


-- --- 6. L'imputable ne dépasse pas le coût réel --------------------------------------------
-- Workflow 06 §7 pose « non imputable = total − imputable » : la contrainte ne
-- fait qu'interdire un état que cette soustraction exclut déjà.
do $$
declare v_id uuid := (select mnt_open from recette_ids); v_caught boolean := false;
begin
  begin
    perform public.record_maintenance_costs(v_id, null, 100000, 200000);
  exception when check_violation then v_caught := true;
  end;

  if not v_caught then
    raise exception 'Un imputable supérieur au coût réel a été accepté.';
  end if;

  raise notice '[OK] 6. Le montant imputable ne peut pas dépasser le coût réel.';
end $$;


-- --- 7. Les lignes documentent le coût, elles ne le calculent pas -----------------------------
do $$
declare
  v_id    uuid := (select mnt_open from recette_ids);
  v_sum   bigint;
  v_real  bigint;
begin
  insert into public.maintenance_cost_lines (maintenance_id, kind, label, amount)
  values (v_id, 'PARTS', 'Plaquettes', 200000),
         (v_id, 'LABOUR', 'Main-d''œuvre', 50000);

  select sum(amount) into v_sum from public.maintenance_cost_lines where maintenance_id = v_id;
  select actual_cost into v_real from public.maintenance_costs where maintenance_id = v_id;

  -- La ventilation est facultative : sa somme (250 000) DIFFÈRE du coût réel
  -- (300 000), et rien ne l'a corrigée. C'est le comportement voulu.
  if v_sum <> 250000 then
    raise exception 'Somme des lignes attendue 250 000, obtenue %.', v_sum;
  end if;
  if v_real <> 300000 then
    raise exception 'Le coût réel a été écrasé par la somme des lignes : %.', v_real;
  end if;

  raise notice '[OK] 7. La somme des lignes (250 000) ne remplace pas le coût réel (300 000).';
end $$;


-- --- 8. Devis : deux issues, terminales ------------------------------------------------------
do $$
declare
  v_id    uuid := (select mnt_open from recette_ids);
  v_quote uuid;
  v_caught boolean := false;
begin
  v_quote := public.add_maintenance_quote(v_id, 280000, null, current_date, 'Offre du garage');
  update recette_ids set quote_id = v_quote;

  if (select status from public.maintenance_quotes where id = v_quote) <> 'PROPOSED' then
    raise exception 'Un devis ne naît pas « Proposé ».';
  end if;

  perform public.decide_maintenance_quote(v_quote, true, 'Offre retenue');

  if (select status from public.maintenance_quotes where id = v_quote) <> 'ACCEPTED' then
    raise exception 'Le devis n''a pas été accepté.';
  end if;

  -- Une décision ne se reprend pas.
  begin
    perform public.decide_maintenance_quote(v_quote, false, 'Changement d''avis');
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'Un devis décidé a pu être redécidé.'; end if;

  -- Ni se modifier (arbitrage L6).
  v_caught := false;
  begin
    update public.maintenance_quotes set amount = 999000 where id = v_quote;
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'Le montant d''un devis décidé a pu changer.'; end if;

  raise notice '[OK] 8. Devis : accepté/refusé terminal, et figé après décision.';
end $$;


-- --- 9. Accepter un devis ne recopie aucun montant ----------------------------------------------
-- Rien dans la documentation ne dit qu'un devis accepté devient le coût estimé
-- ou réel. Le déduire serait inventer une règle (DEC-008).
do $$
declare
  v_id uuid := (select mnt_open from recette_ids);
  c    public.maintenance_costs%rowtype;
begin
  select * into c from public.maintenance_costs where maintenance_id = v_id;

  if c.estimated_cost <> 250000 or c.actual_cost <> 300000 then
    raise exception
      'Le devis accepté (280 000) a modifié les coûts : % / %.', c.estimated_cost, c.actual_cost;
  end if;

  raise notice '[OK] 9. Le devis accepté (280 000) n''a rien recopié dans les coûts.';
end $$;


-- --- 10. Le verrou après clôture ------------------------------------------------------------------
-- Arbitrage L6, Workflow 05 §65. Aucun chemin de déverrouillage n'existe.
do $$
declare
  v_id     uuid := (select mnt_done from recette_ids);
  v_caught boolean := false;
begin
  perform public.record_maintenance_costs(v_id, 100000, null, null);

  update public.vehicle_maintenances set status = 'PLANNED'     where id = v_id;
  update public.vehicle_maintenances set status = 'IN_PROGRESS' where id = v_id;
  perform public.complete_maintenance(v_id, now(), 'Fait', 'Contrôle satisfaisant');

  begin
    perform public.record_maintenance_costs(v_id, 100000, 150000, null);
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'Un coût a pu être modifié après clôture.'; end if;

  v_caught := false;
  begin
    update public.maintenance_costs set actual_cost = 150000 where maintenance_id = v_id;
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'Un PATCH direct a franchi le verrou.'; end if;

  v_caught := false;
  begin
    insert into public.maintenance_cost_lines (maintenance_id, kind, label, amount)
    values (v_id, 'OTHER', 'Après coup', 1000);
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'Une ligne a pu être ajoutée après clôture.'; end if;

  v_caught := false;
  begin
    perform public.add_maintenance_quote(v_id, 50000);
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'Un devis a pu être ajouté après clôture.'; end if;

  raise notice '[OK] 10. Après clôture : montants, lignes et devis verrouillés.';
end $$;


-- --- 11. Aucun effet en aval -----------------------------------------------------------------------
--
-- LE CONTRÔLE CENTRAL DU LOT.
--
-- Saisir un coût ne doit RIEN déclencher : ni imputation, ni facture, ni
-- paiement, ni solde, ni occupation, ni changement de statut.
do $$
declare
  v_veh  uuid := (select vehicle_id from recette_ids);
  v_id   uuid := (select mnt_open from recette_ids);
  v_occ  int;
  v_st   public.vehicle_status;
  v_mnt  public.maintenance_status;
  v_tbl  text[];
begin
  select count(*) into v_occ from public.vehicle_occupations where vehicle_id = v_veh;
  if v_occ <> 0 then
    raise exception 'Saisir un coût a écrit % occupation(s).', v_occ;
  end if;

  select status into v_st from public.vehicles where id = v_veh;
  if v_st <> 'AVAILABLE' then
    raise exception 'Le statut du véhicule a changé : %.', v_st;
  end if;

  select status into v_mnt from public.vehicle_maintenances where id = v_id;
  if v_mnt <> 'DRAFT' then
    raise exception 'Le statut de la maintenance a changé : %.', v_mnt;
  end if;

  /*
   * Aucun encaissement client n'existe : le LOT 3 ne pouvait rien y écrire, et
   * ne doit pas l'avoir créé.
   *
   * `imputations` a quitté cette liste le 29/08/2026 (LOT 4),
   * `supplier_invoices` le 30/08/2026 (LOT 5), `supplier_payments` le
   * 31/08/2026 (LOT 6), `customer_invoices` le 01/09/2026 (LOT 7). Ce que ce
   * contrôle doit désormais prouver, c'est que SAISIR UN COÛT ne crée rien —
   * la garantie du §44, pas l'absence des tables.
   */
  select array_agg(tablename) into v_tbl
  from pg_tables
  where schemaname = 'public'
    and tablename in ('customer_payments', 'supplier_balances', 'payment_allocations');
  if v_tbl is not null then
    raise exception 'Le LOT 3 a créé des objets hors périmètre : %.', v_tbl;
  end if;

  -- Saisir un coût ne produit AUCUNE imputation (Workflow 05 §44).
  if exists (select 1 from public.imputations where maintenance_id = v_id) then
    raise exception 'Saisir un coût a créé une imputation.';
  end if;

  raise notice '[OK] 11. Aucun effet : ni occupation, ni statut, ni imputation, ni facture.';
end $$;


-- --- 12. Aucune valorisation d'un dommage ------------------------------------------------------------
-- Arbitrage L5 : le LOT 3 chiffre l'INTERVENTION, jamais le constat.
do $$
declare v_money text[];
begin
  select array_agg(table_name || '.' || column_name) into v_money
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('vehicle_incidents', 'incident_damages')
    and (column_name ~ 'amount|cost|price|montant|cout|franchise|penalt'
         or data_type in ('numeric', 'money'));

  if v_money is not null then
    raise exception 'Un dommage a reçu un montant : % (arbitrage L5).', v_money;
  end if;

  raise notice '[OK] 12. Aucun montant sur un incident ni sur un dommage.';
end $$;


-- --- 13. Catalogue ------------------------------------------------------------------------------------
do $$
declare v_total int;
begin
  if not exists (select 1 from public.permissions where code = 'rental.maintenance.cost.view') then
    raise exception 'La permission rental.maintenance.cost.view est absente.';
  end if;

  if not exists (
    select 1 from public.permissions
    where code = 'rental.maintenance.cost.view' and is_sensitive
  ) then
    raise exception 'rental.maintenance.cost.view n''est pas marquée sensible.';
  end if;

  select count(*) into v_total from public.permissions;
  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;

  raise notice '[OK] 13. Catalogue à 153 : cost.view créée et sensible, aucune autre.';
end $$;


do $$ begin
  raise notice '';
  raise notice '[OK] Recette des coûts de maintenance complète — Étape 2.4, Lot 3.';
end $$;

rollback;
