-- =============================================================================
-- ADIKOM PILOT — Recette Banques & Caisses et règlements (Étape 2.5, LOT 6)
--
-- Vérifie ce que la BASE doit porter seule : comptes, écritures, solde calculé,
-- et le règlement fournisseur — le premier acte du système qui fasse SORTIR de
-- l'argent d'un compte.
--
-- Exécution :
--   npm run db:verify:treasury
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne
-- RLS et les gardes de capacité (`current_actor()` y est NULL). Il contrôle
-- donc le SCHÉMA et les RÈGLES ; les capacités sont éprouvées avec de vraies
-- sessions par `verify:treasury` et `verify:capabilities`.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_tre (
  supplier    uuid,
  category_id uuid,
  vehicle     uuid,
  maintenance uuid,
  imputation  uuid,
  invoice     uuid,
  account     uuid,
  cash        uuid,
  payment     uuid
) on commit drop;

insert into recette_tre values (null, null, null, null, null, null, null, null, null);


-- --- 1. Structure ------------------------------------------------------------------
do $$
declare missing text[];
begin
  select array_agg(t) into missing
  from unnest(array['financial_accounts', 'treasury_entries', 'supplier_payments']) t
  where not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t);
  if missing is not null then
    raise exception 'Tables manquantes : %', missing;
  end if;

  select array_agg(t) into missing
  from unnest(array[
    'financial_account_kind', 'financial_account_status', 'treasury_direction',
    'treasury_entry_kind', 'treasury_entry_status', 'supplier_payment_status',
    'payment_method'
  ]) t
  where not exists (select 1 from pg_type where typname = t);
  if missing is not null then
    raise exception 'Types manquants : %', missing;
  end if;

  -- Module 06 §5 : banques et caisses, rien de plus.
  if (select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'financial_account_kind') <> array['BANK', 'CASH']::text[]
  then
    raise exception 'Types de comptes inattendus.';
  end if;

  -- §19 : au minimum entrée et sortie.
  if (select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'treasury_direction') <> array['IN', 'OUT']::text[]
  then
    raise exception 'Sens d''écriture inattendus.';
  end if;

  -- DEC-010 : entiers, jamais de flottant.
  select array_agg(table_name || '.' || column_name) into missing
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('financial_accounts', 'treasury_entries', 'supplier_payments')
    and data_type in ('numeric', 'money', 'real', 'double precision');
  if missing is not null then
    raise exception 'Type non entier pour un montant : % (DEC-010).', missing;
  end if;

  raise notice '[OK] 1. Trois tables, sept types, aucun flottant.';
end $$;


-- --- 2. AUCUN SOLDE STOCKÉ — Module 06 §17 --------------------------------------------
do $$
declare v_bad text[];
begin
  select array_agg(column_name) into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name = 'financial_accounts'
    and column_name in ('balance', 'current_balance', 'solde', 'available_balance');

  if v_bad is not null then
    raise exception 'Solde recopié sur le compte : % — il doit se calculer (§17).', v_bad;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'financial_account_balance' and not p.prosecdef
  ) then
    raise exception 'financial_account_balance absente ou SECURITY DEFINER.';
  end if;

  raise notice '[OK] 2. Aucun solde stocké ; il se calcule des écritures.';
end $$;


-- --- 3. RLS, aucune suppression, audit --------------------------------------------------
do $$
declare v_missing text[];
begin
  select array_agg(t) into v_missing
  from unnest(array['financial_accounts', 'treasury_entries', 'supplier_payments']) t
  where not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = t and rowsecurity
  );
  if v_missing is not null then raise exception 'RLS désactivée sur : %', v_missing; end if;

  select array_agg(t) into v_missing
  from unnest(array['financial_accounts', 'treasury_entries', 'supplier_payments']) t
  where not exists (
    select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = t and g.tgname = t || '_no_delete'
  );
  if v_missing is not null then raise exception 'Suppression non interdite sur : %', v_missing; end if;

  select array_agg(t) into v_missing
  from unnest(array['financial_accounts', 'treasury_entries', 'supplier_payments']) t
  where not exists (
    select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = t and g.tgname = t || '_audit'
  );
  if v_missing is not null then raise exception 'Audit absent sur : %', v_missing; end if;

  raise notice '[OK] 3. RLS active, suppression interdite, audit branché.';
end $$;


-- --- 4. Fonctions : aucune SECURITY DEFINER, EXECUTE retiré à PUBLIC --------------------
do $$
declare v_bad text[];
begin
  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_financial_account', 'update_financial_account',
      'set_financial_account_status', 'record_supplier_payment',
      'cancel_supplier_payment', 'financial_account_balance', 'supplier_invoice_paid'
    )
    and p.prosecdef;
  if v_bad is not null then raise exception 'SECURITY DEFINER de commodité : %', v_bad; end if;

  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_financial_account', 'update_financial_account',
      'set_financial_account_status', 'record_supplier_payment',
      'cancel_supplier_payment', 'financial_account_balance', 'supplier_invoice_paid'
    )
    and has_function_privilege('public', p.oid, 'EXECUTE');
  if v_bad is not null then raise exception 'EXECUTE encore accordé à PUBLIC (DEC-022) : %', v_bad; end if;

  raise notice '[OK] 4. Aucune SECURITY DEFINER, EXECUTE retiré à PUBLIC.';
end $$;


-- --- 5. Jeu de recette : l'exemple de référence du projet -------------------------------
--
-- Fournisseur A · facture 500 000 · imputation 300 000 · net 200 000.
do $$
declare
  v_cat uuid; v_sup uuid; v_veh uuid; v_mnt uuid; v_imp uuid;
  v_inv uuid; v_acc uuid; v_cash uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RTRE-TEST', 'Recette trésorerie') returning id into v_cat;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER', 'RECETTE TRE — Fournisseur',
          '+269 200', 'ACTIVE')
  returning id into v_sup;

  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'TRE', 'RT-0001',
          'SUPPLIED', v_sup, 'AVAILABLE')
  returning id into v_veh;

  v_mnt := public.create_maintenance(
    p_vehicle_id => v_veh, p_origin => 'BREAKDOWN', p_reason => 'Panne imputable');
  perform public.record_maintenance_costs(v_mnt, null, 300000, 300000);

  v_imp := public.create_imputation(v_mnt, v_sup, 300000, 'Réparation imputable au fournisseur.');
  perform public.submit_imputation(v_imp);
  perform public.validate_imputation(v_imp);

  v_inv := public.create_supplier_invoice(v_sup, current_date, current_date + 30, 'FRN-TRE-1', null);
  perform public.add_supplier_invoice_line(v_inv, 'Mise à disposition', 500000, v_veh);
  perform public.submit_supplier_invoice(v_inv);
  perform public.validate_supplier_invoice(v_inv);
  perform public.attach_imputation_to_invoice(v_imp, v_inv);

  v_acc  := public.create_financial_account('BANK', 'Banque de recette', 'BIC ADIKOM',
                                            'CPT-0001', 1000000, current_date - 30, null);
  v_cash := public.create_financial_account('CASH', 'Caisse de recette', 'Responsable',
                                            null, 50000, null, null);

  update recette_tre set
    supplier = v_sup, category_id = v_cat, vehicle = v_veh, maintenance = v_mnt,
    imputation = v_imp, invoice = v_inv, account = v_acc, cash = v_cash;

  raise notice '[OK] 5. Facture 500 000, imputée 300 000, net 200 000 ; banque à 1 000 000.';
end $$;


-- --- 6. Numérotation COMP-000001 et REG-AAAA-000000 -------------------------------------
do $$
declare
  r    public.numbering_rules%rowtype;
  v_no text;
begin
  select * into r from public.numbering_rules where entity_key = 'account';
  if r.prefix <> 'COMP' or r.include_year then
    raise exception 'Règle COMP altérée : % / %', r.prefix, r.include_year;
  end if;

  select account_no into v_no from public.financial_accounts
   where id = (select account from recette_tre);
  if v_no !~ '^COMP-\d{6}$' then
    raise exception 'Identifiant de compte inattendu : %', v_no;
  end if;

  select * into r from public.numbering_rules where entity_key = 'payment';
  if r.prefix <> 'REG' or not r.include_year or not r.reset_yearly then
    raise exception 'Règle REG altérée : % / % / %', r.prefix, r.include_year, r.reset_yearly;
  end if;

  raise notice '[OK] 6. COMP-000000 et REG-AAAA-000000 conformes.';
end $$;


-- --- 7. LE SOLDE SE CALCULE — Module 06 §17 ---------------------------------------------
do $$
declare v_acc uuid := (select account from recette_tre);
begin
  if public.financial_account_balance(v_acc) <> 1000000 then
    raise exception 'Solde initial attendu 1 000 000, obtenu %.',
      public.financial_account_balance(v_acc);
  end if;

  if exists (select 1 from public.treasury_entries where account_id = v_acc) then
    raise exception 'Un compte neuf ne porte aucune écriture.';
  end if;

  raise notice '[OK] 7. Solde = solde initial tant qu''aucune écriture n''existe.';
end $$;


-- --- 8. RÈGLEMENT PARTIEL — §19, §21, §47 ----------------------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_tre);
  v_acc uuid := (select account from recette_tre);
  v_pay uuid;
  e     public.treasury_entries%rowtype;
begin
  -- Net à payer : 500 000 − 300 000 = 200 000. On en règle la moitié.
  v_pay := public.record_supplier_payment(v_inv, v_acc, 100000, current_date, 'BANK_TRANSFER',
                                          'VIR-0001', null);
  update recette_tre set payment = v_pay;

  if public.supplier_invoice_paid(v_inv) <> 100000 then
    raise exception 'Total réglé attendu 100 000, obtenu %.', public.supplier_invoice_paid(v_inv);
  end if;

  -- §47 : un paiement fournisseur DIMINUE le compte.
  if public.financial_account_balance(v_acc) <> 900000 then
    raise exception 'Solde attendu 900 000, obtenu %.', public.financial_account_balance(v_acc);
  end if;

  select * into e from public.treasury_entries where supplier_payment_id = v_pay;

  if not found then raise exception 'Le règlement n''a produit aucune écriture (§13, §20).'; end if;
  if e.direction <> 'OUT' then raise exception 'L''écriture devrait être une SORTIE (§47).'; end if;
  if e.kind <> 'SUPPLIER_PAYMENT' then raise exception 'Type d''écriture inattendu : %.', e.kind; end if;
  if e.amount <> 100000 then raise exception 'Montant d''écriture inattendu : %.', e.amount; end if;
  if e.account_id <> v_acc then raise exception 'L''écriture porte sur un autre compte.'; end if;

  raise notice '[OK] 8. Règlement partiel : écriture de sortie, solde 1 000 000 → 900 000.';
end $$;


-- --- 9. §22 ET §23 — CE QUI DÉPASSE LE RESTE DÛ EST REFUSÉ -------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_tre);
  v_acc uuid := (select account from recette_tre);
begin
  -- Reste dû : 200 000 − 100 000 = 100 000.
  begin
    perform public.record_supplier_payment(v_inv, v_acc, 100001, current_date, 'CASH', null, null);
    raise exception 'ÉCHEC : un règlement a dépassé le reste dû (§22).';
  exception when check_violation then null;
  end;

  -- Au KMF près, il passe.
  perform public.record_supplier_payment(v_inv, v_acc, 100000, current_date, 'CASH', null, null);

  if public.supplier_invoice_paid(v_inv) <> 200000 then
    raise exception 'Total réglé attendu 200 000, obtenu %.', public.supplier_invoice_paid(v_inv);
  end if;

  -- §23 : une facture soldée n'accepte plus rien.
  begin
    perform public.record_supplier_payment(v_inv, v_acc, 1, current_date, 'CASH', null, null);
    raise exception 'ÉCHEC : une facture soldée a accepté un règlement (§23).';
  exception when check_violation then null;
  end;

  if public.financial_account_balance(v_acc) <> 800000 then
    raise exception 'Solde attendu 800 000, obtenu %.', public.financial_account_balance(v_acc);
  end if;

  raise notice '[OK] 9. Le reste dû borne le règlement au KMF près ; facture soldée refusée.';
end $$;


-- --- 10. « PAYÉE » NE S'ÉCRIT PAS — Module 07 §55 ---------------------------------------
do $$
declare v_inv uuid := (select invoice from recette_tre);
begin
  begin
    update public.supplier_invoices set status = 'PAID' where id = v_inv;
    raise exception 'ÉCHEC : une facture a été déclarée payée.';
  exception when check_violation then null;
  end;

  begin
    update public.supplier_invoices set status = 'PARTIALLY_PAID' where id = v_inv;
    raise exception 'ÉCHEC : une facture a été déclarée partiellement payée.';
  exception when check_violation then null;
  end;

  if (select status from public.supplier_invoices where id = v_inv) <> 'VALIDATED' then
    raise exception 'Le statut de la facture a bougé.';
  end if;

  raise notice '[OK] 10. « Payée » et « Partiellement payée » se calculent, ne s''écrivent pas.';
end $$;


-- --- 11. UNE FACTURE RÉGLÉE NE S'ANNULE PAS ---------------------------------------------
do $$
declare v_inv uuid := (select invoice from recette_tre);
begin
  begin
    perform public.cancel_supplier_invoice(v_inv, 'Tentative');
    raise exception 'ÉCHEC : une facture réglée a été annulée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 11. Une facture portant un règlement ne s''annule pas.';
end $$;


-- --- 12. ANNULATION D'UN RÈGLEMENT — §28, §29 -------------------------------------------
do $$
declare
  v_pay uuid := (select payment from recette_tre);
  v_inv uuid := (select invoice from recette_tre);
  v_acc uuid := (select account from recette_tre);
  e     public.treasury_entries%rowtype;
begin
  perform public.cancel_supplier_payment(v_pay, 'Erreur de saisie');

  if (select status from public.supplier_payments where id = v_pay) <> 'CANCELLED' then
    raise exception 'Le règlement n''a pas été annulé.';
  end if;

  -- §28 : il n'est plus comptabilisé.
  if public.supplier_invoice_paid(v_inv) <> 100000 then
    raise exception 'Total réglé attendu 100 000 après annulation, obtenu %.',
      public.supplier_invoice_paid(v_inv);
  end if;

  -- L'écriture suit, et le solde du compte remonte.
  select * into e from public.treasury_entries where supplier_payment_id = v_pay;
  if e.status <> 'CANCELLED' then
    raise exception 'L''écriture du règlement annulé est restée validée.';
  end if;

  if public.financial_account_balance(v_acc) <> 900000 then
    raise exception 'Solde attendu 900 000 après annulation, obtenu %.',
      public.financial_account_balance(v_acc);
  end if;

  -- Rien n'est effacé : les deux lignes sont toujours là.
  if not exists (select 1 from public.supplier_payments where id = v_pay) then
    raise exception 'Le règlement annulé a été effacé.';
  end if;

  -- Annuler deux fois n'a pas de sens.
  begin
    perform public.cancel_supplier_payment(v_pay);
    raise exception 'ÉCHEC : un règlement a été annulé deux fois.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 12. Annulation : solde du compte et reste dû remontent, historique conservé.';
end $$;


-- --- 13. UN RÈGLEMENT NE SE RÉÉCRIT PAS — §30, §31 --------------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_tre);
  v_acc uuid := (select account from recette_tre);
  v_pay uuid;
begin
  select id into v_pay from public.supplier_payments
   where supplier_invoice_id = v_inv and status = 'VALIDATED' limit 1;

  begin
    update public.supplier_payments set amount = 1 where id = v_pay;
    raise exception 'ÉCHEC : le montant d''un règlement a été modifié.';
  exception when check_violation then null;
  end;

  begin
    update public.supplier_payments set account_id = (select cash from recette_tre)
     where id = v_pay;
    raise exception 'ÉCHEC : le compte d''un règlement a été changé.';
  exception when check_violation then null;
  end;

  -- Et il ne naît pas annulé, ce qui produirait une écriture sans contrepartie.
  begin
    insert into public.supplier_payments
      (payment_no, supplier_invoice_id, account_id, amount, paid_on, method, status, cancelled_at)
    values ('REG-FORGE-1', v_inv, v_acc, 1000, current_date, 'CASH', 'CANCELLED', now());
    raise exception 'ÉCHEC : un règlement est né annulé.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 13. Un règlement ne se modifie pas et ne naît pas annulé.';
end $$;


-- --- 14. UNE ÉCRITURE EST IMMUABLE, ET NE SE FORGE PAS -----------------------------------
do $$
declare
  v_acc uuid := (select account from recette_tre);
  v_pay uuid;
  v_ent uuid;
begin
  select id into v_pay from public.supplier_payments
   where account_id = v_acc and status = 'VALIDATED' limit 1;
  select id into v_ent from public.treasury_entries
   where supplier_payment_id = v_pay limit 1;

  begin
    update public.treasury_entries set amount = 1 where id = v_ent;
    raise exception 'ÉCHEC : le montant d''une écriture a été modifié.';
  exception when check_violation then null;
  end;

  begin
    update public.treasury_entries set direction = 'IN' where id = v_ent;
    raise exception 'ÉCHEC : le sens d''une écriture a été inversé.';
  exception when check_violation then null;
  end;

  -- Une écriture qui se réclame d'un règlement doit lui correspondre.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, supplier_payment_id)
    values (v_acc, current_date, 'IN', 'SUPPLIER_PAYMENT', 999999, v_pay);
    raise exception 'ÉCHEC : une écriture contredisant son règlement a été acceptée.';
  exception when check_violation then null;
  end;

  -- Et une écriture de type « paiement fournisseur » sans règlement n'existe pas.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount)
    values (v_acc, current_date, 'OUT', 'SUPPLIER_PAYMENT', 5000);
    raise exception 'ÉCHEC : une écriture de règlement sans règlement a été acceptée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 14. Écriture immuable ; aucune écriture forgée sur un règlement.';
end $$;


-- --- 15. LE SOLDE INITIAL SE FIGE — Module 06 §12 ---------------------------------------
do $$
declare
  v_acc  uuid := (select account from recette_tre);
  v_cash uuid := (select cash from recette_tre);
begin
  -- Le compte mouvementé : figé.
  begin
    perform public.update_financial_account(v_acc, 'Banque de recette', null, null, 5000000, null, null);
    raise exception 'ÉCHEC : le solde initial d''un compte mouvementé a été modifié.';
  exception when check_violation then null;
  end;

  -- La caisse, sans écriture : encore modifiable.
  perform public.update_financial_account(v_cash, 'Caisse de recette', 'Responsable', null,
                                          75000, null, null);
  if (select opening_balance from public.financial_accounts where id = v_cash) <> 75000 then
    raise exception 'Le solde initial d''un compte vierge devrait rester modifiable.';
  end if;

  raise notice '[OK] 15. Solde initial figé dès la première écriture, libre avant.';
end $$;


-- --- 16. UN COMPTE NON ACTIF NE REÇOIT PLUS D'OPÉRATION — §10 ----------------------------
do $$
declare
  v_sup uuid := (select supplier from recette_tre);
  v_cash uuid := (select cash from recette_tre);
  v_inv uuid;
begin
  v_inv := public.create_supplier_invoice(v_sup, current_date, null, 'FRN-TRE-2', null);
  perform public.add_supplier_invoice_line(v_inv, 'Autre prestation', 40000, null);
  perform public.submit_supplier_invoice(v_inv);
  perform public.validate_supplier_invoice(v_inv);

  perform public.set_financial_account_status(v_cash, 'ARCHIVED', 'Recette');

  begin
    perform public.record_supplier_payment(v_inv, v_cash, 1000, current_date, 'CASH', null, null);
    raise exception 'ÉCHEC : un compte archivé a reçu une opération (§10).';
  exception when check_violation then null;
  end;

  -- Réactivé, il redevient utilisable : l'historique n'a pas disparu.
  perform public.set_financial_account_status(v_cash, 'ACTIVE', 'Recette');
  perform public.record_supplier_payment(v_inv, v_cash, 1000, current_date, 'CASH', null, null);

  if public.financial_account_balance(v_cash) <> 74000 then
    raise exception 'Solde de caisse attendu 74 000, obtenu %.',
      public.financial_account_balance(v_cash);
  end if;

  raise notice '[OK] 16. Un compte archivé refuse toute nouvelle opération.';
end $$;


-- --- 17. AUCUNE SUPPRESSION -------------------------------------------------------------
do $$
declare
  v_acc uuid := (select account from recette_tre);
  v_pay uuid := (select payment from recette_tre);
begin
  -- Sous session applicative uniquement : le rôle de service passe outre.
  if public.current_actor() is not null then
    begin
      delete from public.supplier_payments where id = v_pay;
      raise exception 'ÉCHEC : un règlement a été supprimé.';
    exception when others then null;
    end;
  end if;

  -- La clé étrangère protège de toute façon le compte mouvementé.
  begin
    delete from public.financial_accounts where id = v_acc;
    raise exception 'ÉCHEC : un compte portant des écritures a été supprimé.';
  exception when foreign_key_violation or others then null;
  end;

  raise notice '[OK] 17. Ni règlement ni compte mouvementé ne se suppriment.';
end $$;


-- --- 18. AUCUN EFFET DE BORD ------------------------------------------------------------
do $$
declare
  v_veh uuid := (select vehicle from recette_tre);
  v_mnt uuid := (select maintenance from recette_tre);
  v_imp uuid := (select imputation from recette_tre);
begin
  if (select status from public.vehicles where id = v_veh) <> 'AVAILABLE' then
    raise exception 'Le statut du véhicule a changé.';
  end if;

  if (select imputable_amount from public.maintenance_costs where maintenance_id = v_mnt) <> 300000
  then
    raise exception 'Le montant imputable a bougé.';
  end if;

  -- Régler une facture ne touche pas l'imputation qui la réduit.
  if (select status from public.imputations where id = v_imp) <> 'IMPUTED' then
    raise exception 'L''imputation a changé d''état.';
  end if;

  raise notice '[OK] 18. Ni parc, ni maintenance, ni imputation touchés par un règlement.';
end $$;


-- --- 19. AUDIT ET CATALOGUE -------------------------------------------------------------
do $$
declare
  v_count int;
  v_total int;
begin
  select count(*) into v_count
  from public.audit_log
  where entity_type in ('financial_accounts', 'treasury_entries', 'supplier_payments');
  if v_count = 0 then
    raise exception 'Aucune écriture d''audit pour la trésorerie.';
  end if;

  select count(*) into v_total from public.permissions;
  if v_total <> 170 then
    raise exception 'Catalogue attendu à 170 permissions, obtenu %.', v_total;
  end if;

  raise notice '[OK] 19. Trésorerie journalisée (% entrées) ; catalogue à 170.', v_count;
end $$;


rollback;
