-- =============================================================================
-- ADIKOM PILOT — Recette de la facture fournisseur (Étape 2.5, LOT 5)
--
-- Vérifie ce que la BASE doit porter seule : structure, montants sans seconde
-- source, transitions, verrous, le plafond de Workflow 06 §20, et la seule
-- opération du système qui réduise un montant dû — le rattachement d'une
-- imputation à une facture (DEC-013).
--
-- Exécution :
--   npm run db:verify:supplier-invoices
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne
-- RLS et les gardes de capacité (`current_actor()` y est NULL). Il contrôle
-- donc le SCHÉMA et les RÈGLES ; les capacités sont éprouvées avec de vraies
-- sessions par `verify:supplier-invoices` et `verify:capabilities`.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_fac (
  category_id uuid,
  supplier_a  uuid,
  supplier_b  uuid,
  garage      uuid,
  vehicle     uuid,
  maintenance uuid,
  imp_main    uuid,
  imp_second  uuid,
  invoice     uuid,
  line_one    uuid
) on commit drop;

insert into recette_fac values (null, null, null, null, null, null, null, null, null, null);


-- --- 1. Structure ------------------------------------------------------------------
do $$
declare
  missing text[];
begin
  select array_agg(t) into missing
  from unnest(array['supplier_invoices', 'supplier_invoice_lines']) t
  where not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t);
  if missing is not null then
    raise exception 'Tables manquantes : %', missing;
  end if;

  if not exists (select 1 from pg_type where typname = 'supplier_invoice_status') then
    raise exception 'Type supplier_invoice_status manquant.';
  end if;

  -- Module 07 §31 : les sept statuts documentés, dans leur ordre, et RIEN DE PLUS.
  if (select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'supplier_invoice_status')
     <> array['DRAFT', 'PENDING', 'VALIDATED', 'PARTIALLY_PAID', 'PAID',
              'OVERDUE', 'CANCELLED']::text[]
  then
    raise exception 'Statuts de facture fournisseur inattendus.';
  end if;

  -- DEC-010 : entiers, jamais de flottant.
  select array_agg(table_name || '.' || column_name) into missing
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('supplier_invoices', 'supplier_invoice_lines')
    and data_type in ('numeric', 'money', 'real', 'double precision');
  if missing is not null then
    raise exception 'Type non entier pour un montant : % (DEC-010).', missing;
  end if;

  -- §30 : numéro interne ADIKOM et numéro du fournisseur sont DEUX colonnes.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_invoices'
      and column_name = 'external_ref'
  ) then
    raise exception 'La référence externe du fournisseur est absente (§30).';
  end if;

  raise notice '[OK] 1. Tables, type et sept statuts conformes à Module 07 §31.';
end $$;


-- --- 2. AUCUNE SECONDE SOURCE DES MONTANTS ---------------------------------------------
--
-- Brut, imputé, net et payé sont des SOMMES. Une colonne les recopiant pourrait
-- diverger de ses lignes — exactement ce que le LOT 4 a refusé pour le plafond.
do $$
declare v_bad text[];
begin
  select array_agg(column_name) into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name = 'supplier_invoices'
    and column_name in (
      'gross_amount', 'total_amount', 'amount', 'imputed_amount',
      'net_payable', 'paid_amount', 'balance', 'remaining_amount'
    );

  if v_bad is not null then
    raise exception 'Montants recopiés sur la facture : % — ils doivent être calculés.', v_bad;
  end if;

  -- Les fonctions de calcul existent, et ne sont pas SECURITY DEFINER : elles
  -- somment sous les droits de l'appelant.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'supplier_invoice_gross' and not p.prosecdef
  ) then
    raise exception 'supplier_invoice_gross absente ou SECURITY DEFINER.';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'supplier_invoice_imputed' and not p.prosecdef
  ) then
    raise exception 'supplier_invoice_imputed absente ou SECURITY DEFINER.';
  end if;

  raise notice '[OK] 2. Aucun montant recopié ; brut et imputé sont des sommes.';
end $$;


-- --- 3. LES RÈGLEMENTS N'EXISTENT PAS ---------------------------------------------------
do $$
declare v_bad text[];
begin
  select array_agg(tablename) into v_bad
  from pg_tables
  where schemaname = 'public'
    and tablename in (
      'supplier_payments', 'customer_invoices', 'payments',
      'financial_accounts', 'supplier_balances', 'payment_allocations'
    );

  if v_bad is not null then
    raise exception 'Le LOT 5 a créé des objets du lot suivant : %', v_bad;
  end if;

  raise notice '[OK] 3. Aucun paiement, aucun compte financier, aucun solde stocké.';
end $$;


-- --- 4. RLS, aucune suppression, lecture sous `supplier_invoices.view` ------------------
do $$
declare
  v_missing text[];
begin
  select array_agg(t) into v_missing
  from unnest(array['supplier_invoices', 'supplier_invoice_lines']) t
  where not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = t and rowsecurity
  );
  if v_missing is not null then
    raise exception 'RLS désactivée sur : %', v_missing;
  end if;

  select array_agg(t) into v_missing
  from unnest(array['supplier_invoices', 'supplier_invoice_lines']) t
  where not exists (
    select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = t and g.tgname = t || '_no_delete'
  );
  if v_missing is not null then
    raise exception 'Suppression non interdite sur : %', v_missing;
  end if;

  select array_agg(t) into v_missing
  from unnest(array['supplier_invoices', 'supplier_invoice_lines']) t
  where not exists (
    select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = t and g.tgname = t || '_audit'
  );
  if v_missing is not null then
    raise exception 'Audit absent sur : %', v_missing;
  end if;

  raise notice '[OK] 4. RLS active, suppression interdite, audit branché.';
end $$;


-- --- 5. Fonctions : aucune SECURITY DEFINER, EXECUTE retiré à PUBLIC --------------------
do $$
declare
  v_bad text[];
begin
  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_supplier_invoice', 'update_supplier_invoice', 'add_supplier_invoice_line',
      'archive_supplier_invoice_line', 'submit_supplier_invoice',
      'validate_supplier_invoice', 'cancel_supplier_invoice',
      'attach_imputation_to_invoice', 'detach_imputation_from_invoice'
    )
    and p.prosecdef;

  if v_bad is not null then
    raise exception 'SECURITY DEFINER de commodité : %', v_bad;
  end if;

  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_supplier_invoice', 'update_supplier_invoice', 'add_supplier_invoice_line',
      'archive_supplier_invoice_line', 'submit_supplier_invoice',
      'validate_supplier_invoice', 'cancel_supplier_invoice',
      'attach_imputation_to_invoice', 'detach_imputation_from_invoice',
      'supplier_invoice_gross', 'supplier_invoice_imputed'
    )
    and has_function_privilege('public', p.oid, 'EXECUTE');

  if v_bad is not null then
    raise exception 'EXECUTE encore accordé à PUBLIC (DEC-022) : %', v_bad;
  end if;

  raise notice '[OK] 5. Neuf actes, aucune SECURITY DEFINER, EXECUTE retiré à PUBLIC.';
end $$;


-- --- 6. Jeu de recette -------------------------------------------------------------------
do $$
declare
  v_cat uuid; v_sa uuid; v_sb uuid; v_gar uuid;
  v_veh uuid; v_mnt uuid; v_imp uuid; v_imp2 uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RFAC-TEST', 'Recette factures fournisseurs') returning id into v_cat;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER', 'RECETTE FAC — Fournisseur A',
          '+269 100', 'ACTIVE')
  returning id into v_sa;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER', 'RECETTE FAC — Fournisseur B',
          '+269 101', 'ACTIVE')
  returning id into v_sb;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'MAINTENANCE_PROVIDER', 'RECETTE FAC — Garage',
          '+269 102', 'ACTIVE')
  returning id into v_gar;

  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'FAC-SUP', 'RF-0001',
          'SUPPLIED', v_sa, 'AVAILABLE')
  returning id into v_veh;

  v_mnt := public.create_maintenance(
    p_vehicle_id => v_veh, p_origin => 'BREAKDOWN',
    p_reason => 'Panne mécanique imputable au fournisseur',
    p_provider_supplier_id => v_gar);

  -- L'exemple de référence du projet : coût 300 000, entièrement imputable.
  perform public.record_maintenance_costs(v_mnt, 250000, 300000, 300000);

  v_imp := public.create_imputation(
    v_mnt, v_sa, 300000,
    'Réparation imputable au fournisseur selon les conditions de mise à disposition.');
  perform public.submit_imputation(v_imp);
  perform public.validate_imputation(v_imp, 'Contrôlée');

  update recette_fac set
    category_id = v_cat, supplier_a = v_sa, supplier_b = v_sb, garage = v_gar,
    vehicle = v_veh, maintenance = v_mnt, imp_main = v_imp;

  raise notice '[OK] 6. Jeu de recette : imputation de 300 000 KMF validée, en attente de facture.';
end $$;


-- --- 7. Numérotation FAC-F-2026-000001 ---------------------------------------------------
do $$
declare
  r    public.numbering_rules%rowtype;
  v_id uuid;
  v_no text;
begin
  select * into r from public.numbering_rules where entity_key = 'supplier_invoice';

  if not found then raise exception 'Règle de numérotation « supplier_invoice » absente.'; end if;
  if r.prefix <> 'FAC-F' or not r.include_year or r.padding <> 6 or not r.reset_yearly then
    raise exception 'Règle FAC-F altérée : % / % / % / %',
      r.prefix, r.include_year, r.padding, r.reset_yearly;
  end if;

  v_id := public.create_supplier_invoice(
    (select supplier_a from recette_fac), current_date, current_date + 30,
    'FRN-2026-77', 'Mise à disposition du véhicule');

  select invoice_no into v_no from public.supplier_invoices where id = v_id;

  if v_no !~ '^FAC-F-\d{4}-\d{6}$' then
    raise exception 'Numéro interne inattendu : %', v_no;
  end if;

  -- §30 : le numéro du fournisseur reste distinct du numéro interne.
  if (select external_ref from public.supplier_invoices where id = v_id) <> 'FRN-2026-77' then
    raise exception 'La référence externe du fournisseur n''a pas été conservée.';
  end if;

  update recette_fac set invoice = v_id;

  raise notice '[OK] 7. FAC-F-AAAA-000001, référence fournisseur distincte (§30).';
end $$;


-- --- 8. UNE FACTURE NAÎT EN BROUILLON -----------------------------------------------------
--
-- Un déclencheur de transition ne voit pas un INSERT. Sans le contrôle d'état
-- de départ, un POST direct créerait une facture validée sans `validate`.
do $$
declare v_sa uuid := (select supplier_a from recette_fac);
begin
  begin
    insert into public.supplier_invoices
      (invoice_no, supplier_id, invoice_date, status, validated_at)
    values ('FAC-F-FORGE-1', v_sa, current_date, 'VALIDATED', now());
    raise exception 'ÉCHEC : une facture est née validée.';
  exception when check_violation then null;
  end;

  begin
    insert into public.supplier_invoices (invoice_no, supplier_id, invoice_date, status)
    values ('FAC-F-FORGE-2', v_sa, current_date, 'PENDING');
    raise exception 'ÉCHEC : une facture est née en attente.';
  exception when check_violation then null;
  end;

  -- Le même chemin est fermé sur les imputations (complément de l'audit 041).
  begin
    insert into public.imputations
      (imputation_no, maintenance_id, supplier_id, amount, justification, status, validated_at)
    values ('IMP-FORGE-1', (select maintenance from recette_fac), v_sa, 1000,
            'Imputation née validée', 'VALIDATED', now());
    raise exception 'ÉCHEC : une imputation est née validée.';
  exception when check_violation then null;
  end;

  if (select count(*) from public.supplier_invoices where invoice_no like 'FAC-F-FORGE%') > 0 then
    raise exception 'Une facture forgée a été enregistrée.';
  end if;

  raise notice '[OK] 8. Facture et imputation naissent en brouillon, INSERT direct compris.';
end $$;


-- --- 9. LE MONTANT BRUT EST LA SOMME DES LIGNES -------------------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_fac);
  v_l1  uuid;
  v_l2  uuid;
begin
  if public.supplier_invoice_gross(v_inv) <> 0 then
    raise exception 'Une facture sans ligne devrait valoir 0.';
  end if;

  v_l1 := public.add_supplier_invoice_line(v_inv, 'Mise à disposition — janvier', 400000,
                                           (select vehicle from recette_fac));
  v_l2 := public.add_supplier_invoice_line(v_inv, 'Mise à disposition — février', 200000, null);

  if public.supplier_invoice_gross(v_inv) <> 600000 then
    raise exception 'Brut attendu 600 000, obtenu %.', public.supplier_invoice_gross(v_inv);
  end if;

  -- Une ligne retirée sort de la somme, sans être effacée.
  perform public.archive_supplier_invoice_line(v_l2);

  if public.supplier_invoice_gross(v_inv) <> 400000 then
    raise exception 'Brut après retrait attendu 400 000, obtenu %.',
      public.supplier_invoice_gross(v_inv);
  end if;

  if not exists (select 1 from public.supplier_invoice_lines where id = v_l2 and is_archived) then
    raise exception 'La ligne retirée a été effacée au lieu d''être archivée.';
  end if;

  -- Un montant nul ou négatif n'est pas une ligne.
  begin
    perform public.add_supplier_invoice_line(v_inv, 'Ligne nulle', 0, null);
    raise exception 'ÉCHEC : une ligne à 0 KMF a été acceptée.';
  exception when check_violation then null;
  end;

  -- On ramène le brut à 500 000, montant de l'exemple de référence du projet.
  perform public.add_supplier_invoice_line(v_inv, 'Complément de mise à disposition', 100000, null);

  if public.supplier_invoice_gross(v_inv) <> 500000 then
    raise exception 'Brut attendu 500 000, obtenu %.', public.supplier_invoice_gross(v_inv);
  end if;

  update recette_fac set line_one = v_l1;

  raise notice '[OK] 9. Brut = Σ lignes actives ; une ligne retirée est archivée, jamais effacée.';
end $$;


-- --- 10. Cycle Brouillon → En attente → Validée -------------------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_fac);
  f     public.supplier_invoices%rowtype;
  v_sa  uuid := (select supplier_a from recette_fac);
  v_vide uuid;
begin
  -- On ne valide pas un brouillon : il se soumet d'abord.
  begin
    perform public.validate_supplier_invoice(v_inv);
    raise exception 'ÉCHEC : un brouillon a été validé directement.';
  exception when check_violation then null;
  end;

  perform public.submit_supplier_invoice(v_inv);

  select * into f from public.supplier_invoices where id = v_inv;
  if f.status <> 'PENDING' then raise exception 'Statut attendu PENDING, obtenu %.', f.status; end if;

  -- Règles finance §8 : une facture sans ligne n'a pas de montant brut à
  -- reconnaître. Sa validation est refusée.
  v_vide := public.create_supplier_invoice(v_sa, current_date, null, null, 'Sans ligne');
  perform public.submit_supplier_invoice(v_vide);

  begin
    perform public.validate_supplier_invoice(v_vide);
    raise exception 'ÉCHEC : une facture sans ligne a été validée.';
  exception when check_violation then null;
  end;

  perform public.validate_supplier_invoice(v_inv, 'Facture contrôlée');

  select * into f from public.supplier_invoices where id = v_inv;
  if f.status <> 'VALIDATED' then raise exception 'Statut attendu VALIDATED, obtenu %.', f.status; end if;
  if f.validated_at is null then raise exception 'Validation non datée (§48).'; end if;

  raise notice '[OK] 10. Brouillon → En attente → Validée ; validation sans ligne refusée.';
end $$;


-- --- 11. VERROU APRÈS VALIDATION -----------------------------------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_fac);
  v_l1  uuid := (select line_one from recette_fac);
begin
  -- Les lignes sont figées : le brut reconnu ne se corrige plus.
  begin
    perform public.add_supplier_invoice_line(v_inv, 'Ligne ajoutée après coup', 50000, null);
    raise exception 'ÉCHEC : une ligne a été ajoutée à une facture validée.';
  exception when check_violation then null;
  end;

  begin
    update public.supplier_invoice_lines set amount = 900000 where id = v_l1;
    raise exception 'ÉCHEC : une ligne validée a été modifiée.';
  exception when check_violation then null;
  end;

  begin
    perform public.archive_supplier_invoice_line(v_l1);
    raise exception 'ÉCHEC : une ligne validée a été retirée.';
  exception when check_violation then null;
  end;

  -- L'en-tête aussi : fournisseur, dates, référence.
  begin
    update public.supplier_invoices set invoice_date = current_date - 5 where id = v_inv;
    raise exception 'ÉCHEC : la date d''une facture validée a été modifiée.';
  exception when check_violation then null;
  end;

  begin
    update public.supplier_invoices
       set supplier_id = (select supplier_b from recette_fac) where id = v_inv;
    raise exception 'ÉCHEC : le fournisseur d''une facture validée a été changé.';
  exception when check_violation then null;
  end;

  if public.supplier_invoice_gross(v_inv) <> 500000 then
    raise exception 'Le montant brut a bougé : %.', public.supplier_invoice_gross(v_inv);
  end if;

  raise notice '[OK] 11. Lignes et en-tête figés après validation ; brut inchangé.';
end $$;


-- --- 12. « PAYÉE », « PARTIELLEMENT PAYÉE » ET « EN RETARD » NE S'ÉCRIVENT PAS ------------
--
-- L'état de règlement DÉCOULE des paiements (Module 07 §55, §57) ; « En retard »
-- se calcule de l'échéance (DEC-025 §a). Aucun des trois ne se déclare.
do $$
declare v_inv uuid := (select invoice from recette_fac);
begin
  begin
    update public.supplier_invoices set status = 'PAID' where id = v_inv;
    raise exception 'ÉCHEC : une facture a été déclarée payée sans paiement.';
  exception when check_violation then null;
  end;

  begin
    update public.supplier_invoices set status = 'PARTIALLY_PAID' where id = v_inv;
    raise exception 'ÉCHEC : une facture a été déclarée partiellement payée.';
  exception when check_violation then null;
  end;

  begin
    update public.supplier_invoices set status = 'OVERDUE' where id = v_inv;
    raise exception 'ÉCHEC : « En retard » a été écrit en base.';
  exception when check_violation then null;
  end;

  if (select status from public.supplier_invoices where id = v_inv) <> 'VALIDATED' then
    raise exception 'La facture a changé d''état.';
  end if;

  raise notice '[OK] 12. Payée, Partiellement payée et En retard restent hors d''atteinte.';
end $$;


-- --- 13. LE RATTACHEMENT — §20, §24, §32 --------------------------------------------------
--
-- LE CONTRÔLE LE PLUS IMPORTANT DU LOT : c'est le seul acte qui réduise un
-- montant dû (DEC-013).
do $$
declare
  v_inv    uuid := (select invoice from recette_fac);
  v_imp    uuid := (select imp_main from recette_fac);
  v_sb     uuid := (select supplier_b from recette_fac);
  v_brouil uuid;
  i        public.imputations%rowtype;
begin
  -- §32 : une facture en brouillon n'est pas une dette reconnue.
  v_brouil := public.create_supplier_invoice(
    (select supplier_a from recette_fac), current_date, null, null, 'Encore en saisie');
  perform public.add_supplier_invoice_line(v_brouil, 'Ligne', 500000, null);

  begin
    perform public.attach_imputation_to_invoice(v_imp, v_brouil);
    raise exception 'ÉCHEC : une imputation a été rattachée à une facture non validée.';
  exception when check_violation then null;
  end;

  -- §24 : la chaîne relie UN fournisseur.
  declare v_autre uuid;
  begin
    v_autre := public.create_supplier_invoice(v_sb, current_date, null, null, 'Autre fournisseur');
    perform public.add_supplier_invoice_line(v_autre, 'Ligne', 500000, null);
    perform public.submit_supplier_invoice(v_autre);
    perform public.validate_supplier_invoice(v_autre);

    begin
      perform public.attach_imputation_to_invoice(v_imp, v_autre);
      raise exception 'ÉCHEC : imputation rattachée à la facture d''un autre fournisseur.';
    exception when check_violation then null;
    end;
  end;

  -- Le rattachement légitime.
  perform public.attach_imputation_to_invoice(v_imp, v_inv);

  select * into i from public.imputations where id = v_imp;
  if i.status <> 'IMPUTED' then raise exception 'Statut attendu IMPUTED, obtenu %.', i.status; end if;
  if i.supplier_invoice_id is distinct from v_inv then
    raise exception 'La facture rattachée est inattendue.';
  end if;
  if i.imputed_at is null then raise exception 'Rattachement non daté (§48).'; end if;

  -- Une imputation déjà rattachée ne se rattache pas deux fois.
  begin
    perform public.attach_imputation_to_invoice(v_imp, v_inv);
    raise exception 'ÉCHEC : une imputation a été rattachée deux fois.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 13. Rattachement : facture validée, même fournisseur, une seule fois.';
end $$;


-- --- 14. NET À PAYER, ET LE PLAFOND DE §20 -------------------------------------------------
do $$
declare
  v_inv  uuid := (select invoice from recette_fac);
  v_mnt  uuid := (select maintenance from recette_fac);
  v_sa   uuid := (select supplier_a from recette_fac);
  v_mnt2 uuid;
  v_imp2 uuid;
begin
  -- Module 07 §57 : Net = Brut − Imputé. 500 000 − 300 000 = 200 000.
  if public.supplier_invoice_imputed(v_inv) <> 300000 then
    raise exception 'Total imputé attendu 300 000, obtenu %.',
      public.supplier_invoice_imputed(v_inv);
  end if;

  if public.supplier_invoice_gross(v_inv) - public.supplier_invoice_imputed(v_inv) <> 200000 then
    raise exception 'Net à payer attendu 200 000 KMF.';
  end if;

  -- §22 : une même facture peut recevoir plusieurs imputations. §20 : leur
  -- total ne dépasse jamais le montant de la facture.
  v_mnt2 := public.create_maintenance(
    p_vehicle_id => (select vehicle from recette_fac), p_origin => 'BREAKDOWN',
    p_reason => 'Seconde panne imputable');
  perform public.record_maintenance_costs(v_mnt2, null, 400000, 400000);

  v_imp2 := public.create_imputation(v_mnt2, v_sa, 250000, 'Seconde réparation imputable.');
  perform public.submit_imputation(v_imp2);
  perform public.validate_imputation(v_imp2);

  -- 300 000 + 250 000 = 550 000 > 500 000 : refusé, sans crédit ni report.
  begin
    perform public.attach_imputation_to_invoice(v_imp2, v_inv);
    raise exception 'ÉCHEC : le total imputé a dépassé le montant de la facture (§20).';
  exception when check_violation then null;
  end;

  if public.supplier_invoice_imputed(v_inv) <> 300000 then
    raise exception 'Le total imputé a bougé malgré le refus.';
  end if;

  -- Le PATCH direct rencontre le même plafond, sans passer par la fonction.
  begin
    update public.imputations
       set status = 'IMPUTED', supplier_invoice_id = v_inv, imputed_at = now()
     where id = v_imp2;
    raise exception 'ÉCHEC : le plafond a été contourné par PATCH direct.';
  exception when check_violation then null;
  end;

  update recette_fac set imp_second = v_imp2;

  raise notice '[OK] 14. Net = 500 000 − 300 000 = 200 000 ; §20 tient, PATCH direct compris.';
end $$;


-- --- 15. UNE IMPUTATION RATTACHÉE EST FIGÉE — §39 ------------------------------------------
do $$
declare
  v_imp uuid := (select imp_main from recette_fac);
  v_inv uuid := (select invoice from recette_fac);
begin
  begin
    update public.imputations set amount = 100000 where id = v_imp;
    raise exception 'ÉCHEC : le montant d''une imputation rattachée a été modifié.';
  exception when check_violation then null;
  end;

  -- Elle ne change pas de facture : elle se détache, puis se rattache.
  declare v_autre uuid;
  begin
    select id into v_autre from public.supplier_invoices
    where notes = 'Autre fournisseur' limit 1;

    begin
      update public.imputations set supplier_invoice_id = v_autre where id = v_imp;
      raise exception 'ÉCHEC : une imputation a changé de facture.';
    exception when check_violation then null;
    end;
  end;

  -- Elle ne s'annule pas non plus tant qu'elle porte une facture (§41 :
  -- la correction passe par le détachement, pas par une suppression).
  begin
    perform public.cancel_imputation(v_imp, 'Tentative');
    raise exception 'ÉCHEC : une imputation rattachée a été annulée.';
  exception when check_violation then null;
  end;

  if public.supplier_invoice_imputed(v_inv) <> 300000 then
    raise exception 'Le total imputé a bougé.';
  end if;

  raise notice '[OK] 15. Imputation rattachée figée : ni montant, ni facture, ni annulation.';
end $$;


-- --- 16. LE DÉTACHEMENT RESTITUE LE NET À PAYER — §39 --------------------------------------
do $$
declare
  v_imp uuid := (select imp_main from recette_fac);
  v_inv uuid := (select invoice from recette_fac);
  i     public.imputations%rowtype;
begin
  perform public.detach_imputation_from_invoice(v_imp, 'Facture reçue en double');

  select * into i from public.imputations where id = v_imp;

  if i.status <> 'VALIDATED' then
    raise exception 'Statut attendu VALIDATED après détachement, obtenu %.', i.status;
  end if;
  if i.supplier_invoice_id is not null then
    raise exception 'La facture est restée rattachée.';
  end if;
  if i.imputed_at is not null then
    raise exception 'La date de rattachement subsiste sur une imputation détachée.';
  end if;
  if i.validated_at is null then
    raise exception 'La validation antérieure a été perdue.';
  end if;

  -- Le net à payer remonte à son montant brut.
  if public.supplier_invoice_imputed(v_inv) <> 0 then
    raise exception 'Le total imputé n''a pas été restitué.';
  end if;

  -- Détacher deux fois n'a pas de sens.
  begin
    perform public.detach_imputation_from_invoice(v_imp);
    raise exception 'ÉCHEC : une imputation non rattachée a été détachée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 16. Détachement : retour à « en attente de facture », net restitué.';
end $$;


-- --- 17. ANNULER UNE FACTURE N'ORPHELINE JAMAIS UNE DÉDUCTION -------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_fac);
  v_imp uuid := (select imp_main from recette_fac);
begin
  -- On rattache de nouveau, puis on tente l'annulation.
  perform public.attach_imputation_to_invoice(v_imp, v_inv);

  begin
    perform public.cancel_supplier_invoice(v_inv, 'Tentative');
    raise exception 'ÉCHEC : une facture portant une imputation a été annulée.';
  exception when check_violation then null;
  end;

  if (select status from public.supplier_invoices where id = v_inv) <> 'VALIDATED' then
    raise exception 'La facture a changé d''état malgré le refus.';
  end if;

  -- Détachée, elle s'annule.
  perform public.detach_imputation_from_invoice(v_imp, 'Annulation de la facture');
  perform public.cancel_supplier_invoice(v_inv, 'Facture reçue en double');

  if (select status from public.supplier_invoices where id = v_inv) <> 'CANCELLED' then
    raise exception 'La facture n''a pas été annulée.';
  end if;

  -- Une facture annulée ne reçoit plus rien.
  begin
    perform public.attach_imputation_to_invoice(v_imp, v_inv);
    raise exception 'ÉCHEC : une imputation a été rattachée à une facture annulée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 17. Annulation refusée tant qu''une imputation la réduit ; puis acceptée.';
end $$;


-- --- 18. AUCUN EFFET DE BORD -----------------------------------------------------------------
--
-- Workflow 05 §44 : « Une opération ne déclenche jamais automatiquement une
-- autre opération métier. »
do $$
declare
  v_mnt uuid := (select maintenance from recette_fac);
  v_veh uuid := (select vehicle from recette_fac);
begin
  if (select imputable_amount from public.maintenance_costs where maintenance_id = v_mnt) <> 300000
  then
    raise exception 'Le montant imputable de la maintenance a été modifié.';
  end if;

  if (select status from public.vehicles where id = v_veh) <> 'AVAILABLE' then
    raise exception 'Le statut du véhicule a changé.';
  end if;

  if (select status from public.vehicle_maintenances where id = v_mnt) = 'CANCELLED' then
    raise exception 'La maintenance a changé d''état.';
  end if;

  raise notice '[OK] 18. Ni parc, ni maintenance, ni coût touchés par la facturation (§44).';
end $$;


-- --- 19. AUDIT ------------------------------------------------------------------------------
do $$
declare v_count int;
begin
  select count(*) into v_count
  from public.audit_log
  where entity_type in ('supplier_invoices', 'supplier_invoice_lines');

  if v_count = 0 then
    raise exception 'Aucune écriture d''audit pour la facturation fournisseur.';
  end if;

  raise notice '[OK] 19. Le journal d''audit conserve les écritures de facturation (% entrées).', v_count;
end $$;


-- --- 20. Catalogue inchangé -------------------------------------------------------------------
do $$
declare v_total int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;

  raise notice '[OK] 20. Catalogue à 153 permissions : aucune capacité créée par le LOT 5.';
end $$;


rollback;
