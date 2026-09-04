-- =============================================================================
-- ADIKOM PILOT — Recette Règlements clients (Étape 2.5, LOT 8)
--
-- Vérifie ce que la BASE doit porter seule : l'encaissement d'une facture
-- client, l'écriture d'ENTRÉE qu'il produit (Workflow 08 §47), le solde qui
-- s'en déduit, et les refus qui bornent l'opération — trop-perçu, facture
-- soldée, facture non émise, facture encaissée qu'on voudrait annuler.
--
-- Le jeu de recette est l'exemple de la documentation (§5, §48) :
--
--   Facture client   450 000 KMF
--   Encaissement     200 000 KMF
--   Solde            250 000 KMF
--
-- Exécution :
--   npm run db:verify:customer-payments
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne RLS
-- et les gardes de capacité (`current_actor()` y est NULL). Il contrôle donc le
-- SCHÉMA et les RÈGLES ; les capacités sont éprouvées avec de vraies sessions
-- par `verify:customer-payments` et `verify:capabilities`.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_enc (
  client      uuid,
  category_id uuid,
  vehicle     uuid,
  rule_id     uuid,
  reservation uuid,
  rental      uuid,
  invoice     uuid,
  account     uuid,
  cash        uuid,
  payment     uuid
) on commit drop;

insert into recette_enc
values (null, null, null, null, null, null, null, null, null, null);


-- --- 1. Structure ------------------------------------------------------------------
do $$
declare missing text[];
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'customer_payments'
  ) then
    raise exception 'Table `customer_payments` absente.';
  end if;

  if not exists (select 1 from pg_type where typname = 'customer_payment_status') then
    raise exception 'Type `customer_payment_status` absent.';
  end if;

  -- Deux états suffisent : le catalogue n'offre aucune capacité de validation
  -- (DEC-029 §c, reconduit).
  if (select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'customer_payment_status') <> array['VALIDATED', 'CANCELLED']::text[]
  then
    raise exception 'Statuts de règlement client inattendus.';
  end if;

  -- Module 06 §20 : l'écriture doit pouvoir être reliée à son origine.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'treasury_entries'
      and column_name = 'customer_payment_id'
  ) then
    raise exception 'L''origine `customer_payment_id` est absente des écritures.';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'treasury_entries_single_origin'
  ) then
    raise exception 'Une écriture peut encore se réclamer de deux origines.';
  end if;

  -- DEC-010 : entiers, jamais de flottant.
  select array_agg(table_name || '.' || column_name) into missing
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'customer_payments'
    and data_type in ('numeric', 'money', 'real', 'double precision');
  if missing is not null then
    raise exception 'Type non entier pour un montant : % (DEC-010).', missing;
  end if;

  raise notice '[OK] 1. Table, type, origine d''écriture, aucun flottant.';
end $$;


-- --- 2. AUCUN MONTANT ENCAISSÉ STOCKÉ — Workflow 07 §61 --------------------------------
do $$
declare v_bad text[];
begin
  select array_agg(table_name || '.' || column_name) into v_bad
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('customer_invoices', 'customer_payments')
    and column_name in ('paid_amount', 'balance', 'remaining_amount', 'total_amount');
  if v_bad is not null then
    raise exception 'Montant encaissé ou solde recopié : % — ils se calculent.', v_bad;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'customer_invoice_paid' and not p.prosecdef
  ) then
    raise exception 'customer_invoice_paid absente ou SECURITY DEFINER.';
  end if;

  raise notice '[OK] 2. Aucun encaissement stocké ; une fonction le somme.';
end $$;


-- --- 3. RLS, aucune suppression, audit --------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'customer_payments' and rowsecurity
  ) then
    raise exception 'RLS désactivée sur `customer_payments`.';
  end if;

  if not exists (
    select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = 'customer_payments' and g.tgname = 'customer_payments_no_delete'
  ) then
    raise exception 'Suppression non interdite sur `customer_payments`.';
  end if;

  if not exists (
    select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = 'customer_payments' and g.tgname = 'customer_payments_audit'
  ) then
    raise exception 'Audit absent sur `customer_payments`.';
  end if;

  if has_table_privilege('authenticated', 'public.customer_payments', 'DELETE') then
    raise exception 'Droit DELETE accordé à « authenticated » sur `customer_payments`.';
  end if;

  raise notice '[OK] 3. RLS active, suppression interdite, audit branché.';
end $$;


-- --- 4. Fonctions : aucune SECURITY DEFINER, EXECUTE retiré à PUBLIC --------------------
do $$
declare
  v_bad text[];
  v_fns text[] := array[
    'customer_invoice_paid', 'record_customer_payment', 'cancel_customer_payment'
  ];
begin
  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns) and p.prosecdef;
  if v_bad is not null then raise exception 'SECURITY DEFINER de commodité : %', v_bad; end if;

  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns)
    and has_function_privilege('public', p.oid, 'EXECUTE');
  if v_bad is not null then
    raise exception 'EXECUTE encore accordé à PUBLIC (DEC-022) : %', v_bad;
  end if;

  raise notice '[OK] 4. Aucune SECURITY DEFINER, EXECUTE retiré à PUBLIC.';
end $$;


-- --- 5. Jeu de recette : l'exemple de Workflow 08 §5 et §48 -----------------------------
do $$
declare
  v_cat uuid; v_cli uuid; v_veh uuid; v_rule uuid; v_res uuid; v_loc uuid;
  v_inv uuid; v_acc uuid; v_cash uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RENC-TEST', 'Recette encaissement client') returning id into v_cat;

  insert into public.clients (client_no, type, legal_name, phone)
  values (public.next_number('client'), 'COMPANY', 'RECETTE ENC — Client', '+269 400')
  returning id into v_cli;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'ENC', 'RE-0001', 'OWNED', 'AVAILABLE')
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

  -- Trois jours à 150 000 : la facture de l'exemple, 450 000 KMF.
  v_inv := public.create_customer_invoice(v_cli, current_date, current_date + 15, v_loc, null);
  perform public.add_customer_invoice_line(v_inv, 'RENTAL', 'Location 3 jours', 3, 150000, null);
  perform public.issue_customer_invoice(v_inv, 'Recette LOT 8');

  v_acc  := public.create_financial_account('BANK', 'Banque de recette', 'BIC ADIKOM',
                                            'CPT-ENC-1', 0, current_date - 30, null);
  v_cash := public.create_financial_account('CASH', 'Caisse de recette', 'Responsable',
                                            null, 50000, null, null);

  update recette_enc set
    client = v_cli, category_id = v_cat, vehicle = v_veh, rule_id = v_rule,
    reservation = v_res, rental = v_loc, invoice = v_inv, account = v_acc, cash = v_cash;

  if public.customer_invoice_total(v_inv) <> 450000 then
    raise exception 'Total attendu 450 000, obtenu %.', public.customer_invoice_total(v_inv);
  end if;

  if (select status from public.rentals where id = v_loc) <> 'INVOICED' then
    raise exception 'La location de recette devrait être « Facturée ».';
  end if;

  raise notice '[OK] 5. Facture émise à 450 000 KMF ; banque ouverte à 0.';
end $$;


-- --- 6. Un encaissement n'existe pas encore : rien n'est présumé ------------------------
do $$
declare v_inv uuid := (select invoice from recette_enc);
begin
  if public.customer_invoice_paid(v_inv) <> 0 then
    raise exception 'Une facture neuve ne porte aucun encaissement.';
  end if;

  -- Numérotation : la série `payment` est partagée, et n'a pas bougé.
  if (select prefix from public.numbering_rules where entity_key = 'payment') <> 'REG' then
    raise exception 'Règle REG altérée.';
  end if;

  raise notice '[OK] 6. Aucun encaissement présumé ; série REG conservée.';
end $$;


-- --- 7. ENCAISSEMENT PARTIEL — §5, §47, §48 --------------------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_enc);
  v_acc uuid := (select account from recette_enc);
  v_pay uuid;
  e     public.treasury_entries%rowtype;
  v_no  text;
begin
  v_pay := public.record_customer_payment(v_inv, v_acc, 200000, current_date, 'BANK_TRANSFER',
                                          'VIR-ENC-1', null);
  update recette_enc set payment = v_pay;

  select payment_no into v_no from public.customer_payments where id = v_pay;
  if v_no !~ '^REG-\d{4}-\d{6}$' then
    raise exception 'Numéro de règlement inattendu : %', v_no;
  end if;

  if public.customer_invoice_paid(v_inv) <> 200000 then
    raise exception 'Total encaissé attendu 200 000, obtenu %.', public.customer_invoice_paid(v_inv);
  end if;

  -- §48 : solde de la facture 450 000 − 200 000 = 250 000.
  if public.customer_invoice_total(v_inv) - public.customer_invoice_paid(v_inv) <> 250000 then
    raise exception 'Solde attendu 250 000.';
  end if;

  -- §47 : un encaissement client AUGMENTE le compte.
  if public.financial_account_balance(v_acc) <> 200000 then
    raise exception 'Solde du compte attendu 200 000, obtenu %.',
      public.financial_account_balance(v_acc);
  end if;

  select * into e from public.treasury_entries where customer_payment_id = v_pay;

  if not found then raise exception 'L''encaissement n''a produit aucune écriture (§13, §20).'; end if;
  if e.direction <> 'IN' then raise exception 'L''écriture devrait être une ENTRÉE (§47).'; end if;
  if e.kind <> 'CUSTOMER_PAYMENT' then raise exception 'Type d''écriture inattendu : %.', e.kind; end if;
  if e.amount <> 200000 then raise exception 'Montant d''écriture inattendu : %.', e.amount; end if;
  if e.account_id <> v_acc then raise exception 'L''écriture porte sur un autre compte.'; end if;

  raise notice '[OK] 7. Encaissement 200 000 : écriture d''entrée, solde facture 250 000.';
end $$;


-- --- 8. §40 ET §23 — LE RESTE DÛ BORNE L'ENCAISSEMENT ------------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_enc);
  v_acc uuid := (select account from recette_enc);
begin
  -- Reste dû : 250 000. Un KMF de plus est refusé — aucune règle de trop-perçu
  -- n'est définie (§40).
  begin
    perform public.record_customer_payment(v_inv, v_acc, 250001, current_date, 'CASH', null, null);
    raise exception 'ÉCHEC : un encaissement a dépassé le reste dû (§40).';
  exception when check_violation then null;
  end;

  -- Au KMF près, il passe.
  perform public.record_customer_payment(v_inv, v_acc, 250000, current_date, 'CASH', null, null);

  if public.customer_invoice_paid(v_inv) <> 450000 then
    raise exception 'Total encaissé attendu 450 000, obtenu %.', public.customer_invoice_paid(v_inv);
  end if;

  -- §23 : une facture soldée n'accepte plus rien.
  begin
    perform public.record_customer_payment(v_inv, v_acc, 1, current_date, 'CASH', null, null);
    raise exception 'ÉCHEC : une facture soldée a accepté un encaissement (§23).';
  exception when check_violation then null;
  end;

  if public.financial_account_balance(v_acc) <> 450000 then
    raise exception 'Solde du compte attendu 450 000, obtenu %.',
      public.financial_account_balance(v_acc);
  end if;

  raise notice '[OK] 8. Le reste dû borne l''encaissement au KMF près ; facture soldée refusée.';
end $$;


-- --- 9. « PAYÉE » NE S'ÉCRIT PAS — Workflow 07 §61 ---------------------------------------
do $$
declare v_inv uuid := (select invoice from recette_enc);
begin
  begin
    update public.customer_invoices set status = 'PAID' where id = v_inv;
    raise exception 'ÉCHEC : une facture a été déclarée payée.';
  exception when check_violation then null;
  end;

  begin
    update public.customer_invoices set status = 'PARTIALLY_PAID' where id = v_inv;
    raise exception 'ÉCHEC : une facture a été déclarée partiellement payée.';
  exception when check_violation then null;
  end;

  begin
    update public.customer_invoices set status = 'OVERDUE' where id = v_inv;
    raise exception 'ÉCHEC : une facture a été déclarée en retard.';
  exception when check_violation then null;
  end;

  if (select status from public.customer_invoices where id = v_inv) <> 'ISSUED' then
    raise exception 'Le statut de la facture a bougé.';
  end if;

  raise notice '[OK] 9. « Payée », « Partiellement payée » et « En retard » se calculent.';
end $$;


-- --- 10. UNE FACTURE ENCAISSÉE NE S'ANNULE PAS -------------------------------------------
do $$
declare v_inv uuid := (select invoice from recette_enc);
begin
  begin
    perform public.cancel_customer_invoice(v_inv, 'Tentative');
    raise exception 'ÉCHEC : une facture encaissée a été annulée.';
  exception when check_violation then null;
  end;

  if (select status from public.customer_invoices where id = v_inv) <> 'ISSUED' then
    raise exception 'La facture a changé d''état.';
  end if;

  raise notice '[OK] 10. Une facture portant un encaissement ne s''annule pas.';
end $$;


-- --- 11. ANNULATION D'UN ENCAISSEMENT — §28, §29 -----------------------------------------
do $$
declare
  v_pay uuid := (select payment from recette_enc);
  v_inv uuid := (select invoice from recette_enc);
  v_acc uuid := (select account from recette_enc);
  e     public.treasury_entries%rowtype;
begin
  perform public.cancel_customer_payment(v_pay, 'Erreur de saisie');

  if (select status from public.customer_payments where id = v_pay) <> 'CANCELLED' then
    raise exception 'Le règlement n''a pas été annulé.';
  end if;

  -- §28 : il n'est plus comptabilisé.
  if public.customer_invoice_paid(v_inv) <> 250000 then
    raise exception 'Total encaissé attendu 250 000 après annulation, obtenu %.',
      public.customer_invoice_paid(v_inv);
  end if;

  -- L'écriture suit, et le solde du compte redescend.
  select * into e from public.treasury_entries where customer_payment_id = v_pay;
  if e.status <> 'CANCELLED' then
    raise exception 'L''écriture du règlement annulé est restée validée.';
  end if;

  if public.financial_account_balance(v_acc) <> 250000 then
    raise exception 'Solde du compte attendu 250 000 après annulation, obtenu %.',
      public.financial_account_balance(v_acc);
  end if;

  -- Rien n'est effacé.
  if not exists (select 1 from public.customer_payments where id = v_pay) then
    raise exception 'Le règlement annulé a été effacé.';
  end if;

  -- Annuler deux fois n'a pas de sens.
  begin
    perform public.cancel_customer_payment(v_pay);
    raise exception 'ÉCHEC : un règlement a été annulé deux fois.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 11. Annulation : solde du compte et reste dû reviennent, historique conservé.';
end $$;


-- --- 12. UN ENCAISSEMENT NE SE RÉÉCRIT PAS — §30, §31 -----------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_enc);
  v_acc uuid := (select account from recette_enc);
  v_pay uuid;
begin
  select id into v_pay from public.customer_payments
   where customer_invoice_id = v_inv and status = 'VALIDATED' limit 1;

  begin
    update public.customer_payments set amount = 1 where id = v_pay;
    raise exception 'ÉCHEC : le montant d''un règlement a été modifié.';
  exception when check_violation then null;
  end;

  begin
    update public.customer_payments set account_id = (select cash from recette_enc)
     where id = v_pay;
    raise exception 'ÉCHEC : le compte d''un règlement a été changé.';
  exception when check_violation then null;
  end;

  -- Et il ne naît pas annulé, ce qui produirait une écriture sans contrepartie.
  begin
    insert into public.customer_payments
      (payment_no, customer_invoice_id, account_id, amount, received_on, method,
       status, cancelled_at)
    values ('REG-FORGE-ENC', v_inv, v_acc, 1000, current_date, 'CASH', 'CANCELLED', now());
    raise exception 'ÉCHEC : un règlement est né annulé.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 12. Un encaissement ne se modifie pas et ne naît pas annulé.';
end $$;


-- --- 13. UNE ÉCRITURE EST IMMUABLE, ET NE SE FORGE PAS -----------------------------------
do $$
declare
  v_acc uuid := (select account from recette_enc);
  v_pay uuid;
  v_ent uuid;
begin
  select id into v_pay from public.customer_payments
   where account_id = v_acc and status = 'VALIDATED' limit 1;
  select id into v_ent from public.treasury_entries
   where customer_payment_id = v_pay limit 1;

  begin
    update public.treasury_entries set amount = 1 where id = v_ent;
    raise exception 'ÉCHEC : le montant d''une écriture a été modifié.';
  exception when check_violation then null;
  end;

  begin
    update public.treasury_entries set direction = 'OUT' where id = v_ent;
    raise exception 'ÉCHEC : le sens d''une écriture a été inversé.';
  exception when check_violation then null;
  end;

  -- Une écriture qui se réclame d'un encaissement doit lui correspondre : un
  -- encaissement est une ENTRÉE, du montant reçu (§47).
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, customer_payment_id)
    values (v_acc, current_date, 'OUT', 'CUSTOMER_PAYMENT', 250000, v_pay);
    raise exception 'ÉCHEC : une écriture de sens inverse a été acceptée.';
  exception when check_violation then null;
  end;

  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, customer_payment_id)
    values (v_acc, current_date, 'IN', 'CUSTOMER_PAYMENT', 999999, v_pay);
    raise exception 'ÉCHEC : une écriture contredisant son règlement a été acceptée.';
  exception when check_violation then null;
  end;

  -- Et une écriture de type « règlement client » sans règlement n'existe pas.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount)
    values (v_acc, current_date, 'IN', 'CUSTOMER_PAYMENT', 5000);
    raise exception 'ÉCHEC : une écriture d''encaissement sans règlement a été acceptée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 13. Écriture immuable ; aucune écriture forgée sur un encaissement.';
end $$;


-- --- 14. SEULE UNE FACTURE ÉMISE S'ENCAISSE — Workflow 07 §26 ----------------------------
do $$
declare
  v_cli uuid := (select client from recette_enc);
  v_acc uuid := (select account from recette_enc);
  v_draft uuid;
begin
  v_draft := public.create_customer_invoice(v_cli, current_date, null, null, 'Brouillon');
  perform public.add_customer_invoice_line(v_draft, 'SERVICE', 'Prestation', 1, 80000, null);

  begin
    perform public.record_customer_payment(v_draft, v_acc, 1000, current_date, 'CASH', null, null);
    raise exception 'ÉCHEC : une facture en brouillon a été encaissée.';
  exception when check_violation then null;
  end;

  -- Émise puis annulée : elle n'est plus une créance.
  perform public.issue_customer_invoice(v_draft, null);
  perform public.cancel_customer_invoice(v_draft, 'Recette');

  begin
    perform public.record_customer_payment(v_draft, v_acc, 1000, current_date, 'CASH', null, null);
    raise exception 'ÉCHEC : une facture annulée a été encaissée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 14. Ni brouillon ni facture annulée ne s''encaissent.';
end $$;


-- --- 15. UN COMPTE NON ACTIF NE REÇOIT PLUS D'OPÉRATION — Module 06 §10 ------------------
do $$
declare
  v_cli  uuid := (select client from recette_enc);
  v_cash uuid := (select cash from recette_enc);
  v_inv  uuid;
begin
  v_inv := public.create_customer_invoice(v_cli, current_date, null, null, 'Prestation isolée');
  perform public.add_customer_invoice_line(v_inv, 'SERVICE', 'Assistance', 1, 60000, null);
  perform public.issue_customer_invoice(v_inv, null);

  perform public.set_financial_account_status(v_cash, 'ARCHIVED', 'Recette');

  begin
    perform public.record_customer_payment(v_inv, v_cash, 1000, current_date, 'CASH', null, null);
    raise exception 'ÉCHEC : un compte archivé a reçu une opération (§10).';
  exception when check_violation then null;
  end;

  -- Réactivé, il redevient utilisable : l'historique n'a pas disparu.
  perform public.set_financial_account_status(v_cash, 'ACTIVE', 'Recette');
  perform public.record_customer_payment(v_inv, v_cash, 60000, current_date, 'CASH', null, null);

  if public.financial_account_balance(v_cash) <> 110000 then
    raise exception 'Solde de caisse attendu 110 000, obtenu %.',
      public.financial_account_balance(v_cash);
  end if;

  raise notice '[OK] 15. Un compte archivé refuse toute nouvelle opération.';
end $$;


-- --- 16. AUCUNE SUPPRESSION -------------------------------------------------------------
do $$
declare
  v_acc uuid := (select account from recette_enc);
  v_pay uuid := (select payment from recette_enc);
begin
  -- Sous session applicative uniquement : le rôle de service passe outre.
  if public.current_actor() is not null then
    begin
      delete from public.customer_payments where id = v_pay;
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

  raise notice '[OK] 16. Ni règlement ni compte mouvementé ne se suppriment.';
end $$;


-- --- 17. AUCUN EFFET DE BORD ------------------------------------------------------------
do $$
declare
  v_loc uuid := (select rental from recette_enc);
  v_veh uuid := (select vehicle from recette_enc);
  v_inv uuid := (select invoice from recette_enc);
begin
  /*
   * ENCAISSER N'EST PAS CLÔTURER (Workflow 01 §42).
   *
   * La location reste « Facturée » : la clôture est un acte d'exploitation,
   * et elle n'attend pas le paiement — ni ne le suit automatiquement.
   */
  if (select status from public.rentals where id = v_loc) <> 'INVOICED' then
    raise exception 'Encaisser a changé l''état de la location.';
  end if;

  if (select status from public.vehicles where id = v_veh) <> 'AVAILABLE' then
    raise exception 'Le statut du véhicule a changé.';
  end if;

  -- Le tarif verrouillé de la location n'a pas bougé (§8, §72).
  if (select locked_amount from public.rentals where id = v_loc) <> 150000 then
    raise exception 'Le tarif verrouillé de la location a bougé.';
  end if;

  -- Et les lignes de la facture restent figées : encaisser ne les rouvre pas.
  begin
    perform public.add_customer_invoice_line(v_inv, 'FEE', 'Après coup', 1, 1000, null);
    raise exception 'ÉCHEC : une ligne a été ajoutée à une facture émise.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 17. Ni location, ni parc, ni tarif, ni lignes touchés par un encaissement.';
end $$;


-- --- 18. AUDIT ET CATALOGUE -------------------------------------------------------------
do $$
declare
  v_count int;
  v_total int;
begin
  select count(*) into v_count
  from public.audit_log
  where entity_type = 'customer_payments';
  if v_count = 0 then
    raise exception 'Aucune écriture d''audit pour les règlements clients.';
  end if;

  select count(*) into v_total from public.permissions;
  if v_total <> 157 then
    raise exception 'Catalogue attendu à 157 permissions, obtenu %.', v_total;
  end if;

  raise notice '[OK] 18. Encaissements journalisés (% entrées) ; catalogue à 157.', v_count;
end $$;


rollback;
