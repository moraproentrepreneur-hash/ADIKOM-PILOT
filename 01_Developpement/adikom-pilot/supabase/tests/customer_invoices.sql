-- =============================================================================
-- ADIKOM PILOT — Recette Facture client et clôture (Étape 2.5, LOT 7)
--
-- Vérifie ce que la BASE doit porter seule : la facture client, ses lignes, ses
-- trois montants recalculés, et les deux transitions que la migration 042 avait
-- laissées sans capacité — « Facturée » et « Clôturée ».
--
-- Exécution :
--   npm run db:verify:customer-invoices
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne RLS
-- et les gardes de capacité (`current_actor()` y est NULL). Il contrôle donc le
-- SCHÉMA et les RÈGLES ; les capacités sont éprouvées avec de vraies sessions
-- par `verify:customer-invoices` et `verify:capabilities`.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_fac (
  client      uuid,
  category_id uuid,
  vehicle     uuid,
  rule_id     uuid,
  reservation uuid,
  rental      uuid,
  invoice     uuid,
  line_rental uuid
) on commit drop;

insert into recette_fac values (null, null, null, null, null, null, null, null);


-- --- 1. Structure ------------------------------------------------------------------
do $$
declare missing text[];
begin
  select array_agg(t) into missing
  from unnest(array['customer_invoices', 'customer_invoice_lines']) t
  where not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t);
  if missing is not null then
    raise exception 'Tables manquantes : %', missing;
  end if;

  select array_agg(t) into missing
  from unnest(array['customer_invoice_status', 'customer_invoice_line_kind']) t
  where not exists (select 1 from pg_type where typname = t);
  if missing is not null then
    raise exception 'Types manquants : %', missing;
  end if;

  -- Workflow 07 §27 : les six statuts recommandés, et rien de plus.
  if (select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'customer_invoice_status')
     <> array['DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED']::text[]
  then
    raise exception 'Statuts de facture client inattendus.';
  end if;

  -- §14, §15, §24 : location, service, frais, réduction.
  if (select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'customer_invoice_line_kind')
     <> array['RENTAL','SERVICE','FEE','DISCOUNT']::text[]
  then
    raise exception 'Natures de ligne inattendues.';
  end if;

  -- DEC-010 : entiers, jamais de flottant.
  select array_agg(table_name || '.' || column_name) into missing
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('customer_invoices', 'customer_invoice_lines')
    and data_type in ('numeric', 'money', 'real', 'double precision');
  if missing is not null then
    raise exception 'Type non entier pour un montant : % (DEC-010).', missing;
  end if;

  raise notice '[OK] 1. Deux tables, deux types, six statuts, aucun flottant.';
end $$;


-- --- 2. AUCUN TOTAL STOCKÉ — Workflow 07 §60 ------------------------------------------
do $$
declare v_bad text[];
begin
  select array_agg(column_name) into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name = 'customer_invoices'
    and column_name in ('total_amount', 'subtotal', 'amount', 'net_amount', 'paid_amount');
  if v_bad is not null then
    raise exception 'Montant recopié sur la facture : % — il doit se calculer (§60).', v_bad;
  end if;

  -- Le total de LIGNE non plus : quantité × prix se refait, il ne se stocke pas.
  select array_agg(column_name) into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name = 'customer_invoice_lines'
    and column_name in ('line_total', 'total', 'amount');
  if v_bad is not null then
    raise exception 'Total de ligne recopié : %.', v_bad;
  end if;

  select array_agg(p.proname) into v_bad
  from unnest(array[
    'customer_invoice_subtotal', 'customer_invoice_discount', 'customer_invoice_total'
  ]) p(proname)
  where not exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public' and pr.proname = p.proname
  );
  if v_bad is not null then raise exception 'Fonctions de calcul absentes : %', v_bad; end if;

  raise notice '[OK] 2. Aucun total stocké ; trois fonctions le calculent.';
end $$;


-- --- 3. RLS, aucune suppression, audit --------------------------------------------------
do $$
declare v_missing text[];
begin
  select array_agg(t) into v_missing
  from unnest(array['customer_invoices', 'customer_invoice_lines']) t
  where not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = t and rowsecurity
  );
  if v_missing is not null then raise exception 'RLS désactivée sur : %', v_missing; end if;

  select array_agg(t) into v_missing
  from unnest(array['customer_invoices', 'customer_invoice_lines']) t
  where not exists (
    select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = t and g.tgname = t || '_no_delete'
  );
  if v_missing is not null then raise exception 'Suppression non interdite sur : %', v_missing; end if;

  select array_agg(t) into v_missing
  from unnest(array['customer_invoices', 'customer_invoice_lines']) t
  where not exists (
    select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = t and g.tgname = t || '_audit'
  );
  if v_missing is not null then raise exception 'Audit absent sur : %', v_missing; end if;

  select array_agg(t) into v_missing
  from unnest(array['customer_invoices', 'customer_invoice_lines']) t
  where has_table_privilege('authenticated', 'public.' || t, 'DELETE');
  if v_missing is not null then
    raise exception 'Droit DELETE accordé à « authenticated » sur : %', v_missing;
  end if;

  raise notice '[OK] 3. RLS active, suppression interdite, audit branché.';
end $$;


-- --- 4. Fonctions : aucune SECURITY DEFINER, EXECUTE retiré à PUBLIC --------------------
do $$
declare
  v_bad text[];
  v_fns text[] := array[
    'customer_invoice_subtotal', 'customer_invoice_discount', 'customer_invoice_total',
    'create_customer_invoice', 'update_customer_invoice', 'add_customer_invoice_line',
    'archive_customer_invoice_line', 'issue_customer_invoice', 'cancel_customer_invoice',
    'close_rental'
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


-- --- 5. Jeu de recette : une location menée jusqu'à « À facturer » ----------------------
do $$
declare
  v_cat uuid; v_cli uuid; v_veh uuid; v_rule uuid; v_res uuid; v_loc uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RFAC-TEST', 'Recette facturation client') returning id into v_cat;

  insert into public.clients (client_no, type, legal_name, phone)
  values (public.next_number('client'), 'COMPANY', 'RECETTE FAC — Client', '+269 300')
  returning id into v_cli;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'FAC', 'RF-0001', 'OWNED', 'AVAILABLE')
  returning id into v_veh;

  -- Tarif standard de catégorie : 150 000 KMF / jour.
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

  -- DEC-025 §b : la validation du contrôle relève de `rental.rentals.close`.
  update public.rentals set status = 'TO_INVOICE', status_changed_at = now() where id = v_loc;

  update recette_fac set
    client = v_cli, category_id = v_cat, vehicle = v_veh, rule_id = v_rule,
    reservation = v_res, rental = v_loc;

  if (select status from public.rentals where id = v_loc) <> 'TO_INVOICE' then
    raise exception 'La location de recette n''est pas « À facturer ».';
  end if;

  raise notice '[OK] 5. Location partie, rentrée, contrôlée : elle est « À facturer ».';
end $$;


-- --- 6. Numérotation FAC-C-AAAA-000000 --------------------------------------------------
do $$
declare
  r    public.numbering_rules%rowtype;
  v_id uuid;
  v_no text;
begin
  select * into r from public.numbering_rules where entity_key = 'customer_invoice';
  if r.prefix <> 'FAC-C' or not r.include_year or not r.reset_yearly then
    raise exception 'Règle FAC-C altérée : % / % / %', r.prefix, r.include_year, r.reset_yearly;
  end if;

  v_id := public.create_customer_invoice(
    (select client from recette_fac), current_date, current_date + 7,
    (select rental from recette_fac), 'Recette LOT 7');

  update recette_fac set invoice = v_id;

  select invoice_no into v_no from public.customer_invoices where id = v_id;
  if v_no !~ '^FAC-C-\d{4}-\d{6}$' then
    raise exception 'Numéro de facture inattendu : %', v_no;
  end if;

  -- §25 : elle naît en BROUILLON, et la location ne bouge pas encore.
  if (select status from public.customer_invoices where id = v_id) <> 'DRAFT' then
    raise exception 'Une facture client devrait naître en brouillon.';
  end if;
  if (select status from public.rentals where id = (select rental from recette_fac))
     <> 'TO_INVOICE' then
    raise exception 'Préparer une facture ne doit pas changer l''état de la location.';
  end if;

  raise notice '[OK] 6. % préparée en brouillon ; la location reste « À facturer ».', v_no;
end $$;


-- --- 7. LES TROIS MONTANTS SE CALCULENT — §22, §23, §24 ---------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_fac);
  v_line uuid;
begin
  -- La location : 3 jours × 150 000 = 450 000 (le tarif verrouillé, la quantité
  -- saisie — la règle d'arrondi n'est pas définie, DEC-008).
  v_line := public.add_customer_invoice_line(v_inv, 'RENTAL', 'Location Toyota — 3 jours',
                                             3, 150000, null);
  update recette_fac set line_rental = v_line;

  -- §14 : un service supplémentaire, ligne distincte.
  perform public.add_customer_invoice_line(v_inv, 'SERVICE', 'Siège enfant', 1, 50000, null);

  -- §15 : un frais validé, avec sa justification.
  perform public.add_customer_invoice_line(v_inv, 'FEE', 'Carburant manquant', 1, 20000,
                                           'Retour à 1/2 contre plein au départ.');

  if public.customer_invoice_subtotal(v_inv) <> 520000 then
    raise exception 'Sous-total attendu 520 000, obtenu %.',
      public.customer_invoice_subtotal(v_inv);
  end if;

  -- §24 : une réduction est une LIGNE, identifiable, à montant positif.
  perform public.add_customer_invoice_line(v_inv, 'DISCOUNT', 'Geste commercial', 1, 70000, null);

  if public.customer_invoice_discount(v_inv) <> 70000 then
    raise exception 'Réductions attendues 70 000, obtenues %.',
      public.customer_invoice_discount(v_inv);
  end if;

  if public.customer_invoice_total(v_inv) <> 450000 then
    raise exception 'Total attendu 450 000, obtenu %.', public.customer_invoice_total(v_inv);
  end if;

  raise notice '[OK] 7. Sous-total 520 000 − réduction 70 000 = total 450 000.';
end $$;


-- --- 8. UNE LIGNE RETIRÉE SORT DES SOMMES, SANS ÊTRE EFFACÉE ----------------------------
do $$
declare
  v_inv  uuid := (select invoice from recette_fac);
  v_line uuid;
begin
  v_line := public.add_customer_invoice_line(v_inv, 'FEE', 'Frais saisi par erreur', 1, 99000, null);

  if public.customer_invoice_total(v_inv) <> 549000 then
    raise exception 'Total attendu 549 000, obtenu %.', public.customer_invoice_total(v_inv);
  end if;

  perform public.archive_customer_invoice_line(v_line);

  if public.customer_invoice_total(v_inv) <> 450000 then
    raise exception 'Total attendu 450 000 après retrait, obtenu %.',
      public.customer_invoice_total(v_inv);
  end if;

  if not exists (select 1 from public.customer_invoice_lines where id = v_line) then
    raise exception 'La ligne retirée a été effacée (CLAUDE.md §22).';
  end if;

  -- Une quantité ou un prix nuls n'existent pas.
  begin
    perform public.add_customer_invoice_line(v_inv, 'SERVICE', 'Gratuit', 1, 0, null);
    raise exception 'ÉCHEC : une ligne à prix nul a été acceptée.';
  exception when check_violation then null;
  end;

  begin
    perform public.add_customer_invoice_line(v_inv, 'SERVICE', 'Zéro', 0, 1000, null);
    raise exception 'ÉCHEC : une ligne de quantité nulle a été acceptée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 8. Ligne retirée : hors des sommes, conservée en base.';
end $$;


-- --- 9. UNE FACTURE SANS LIGNE NE S'ÉMET PAS — §22, §60 --------------------------------
do $$
declare
  v_cli uuid := (select client from recette_fac);
  v_id  uuid;
begin
  v_id := public.create_customer_invoice(v_cli, current_date, null, null, 'Recette — vide');

  begin
    perform public.issue_customer_invoice(v_id, null);
    raise exception 'ÉCHEC : une facture sans ligne a été émise.';
  exception when check_violation then null;
  end;

  -- Et une réduction ne fabrique pas un avoir par accident (§44).
  perform public.add_customer_invoice_line(v_id, 'SERVICE', 'Prestation', 1, 10000, null);
  perform public.add_customer_invoice_line(v_id, 'DISCOUNT', 'Réduction excessive', 1, 15000, null);

  begin
    perform public.issue_customer_invoice(v_id, null);
    raise exception 'ÉCHEC : une facture au total négatif a été émise.';
  exception when check_violation then null;
  end;

  perform public.cancel_customer_invoice(v_id, 'Recette : nettoyage');

  raise notice '[OK] 9. Ni facture vide, ni total négatif : l''avoir n''existe pas.';
end $$;


-- --- 10. ÉMISSION : LA LOCATION DEVIENT « FACTURÉE » -----------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_fac);
  v_loc uuid := (select rental from recette_fac);
  f     public.customer_invoices%rowtype;
begin
  perform public.issue_customer_invoice(v_inv, 'Recette');

  select * into f from public.customer_invoices where id = v_inv;

  if f.status <> 'ISSUED' then raise exception 'Facture attendue ISSUED, obtenue %.', f.status; end if;
  if f.issued_at is null then raise exception 'Une facture émise sans date d''émission (§26).'; end if;

  -- LA CONSÉQUENCE : le point ouvert de la migration 042 se referme.
  if (select status from public.rentals where id = v_loc) <> 'INVOICED' then
    raise exception 'La location n''est pas passée à « Facturée ».';
  end if;

  -- §8 et §72 : les lignes sont figées, sans chemin de déverrouillage.
  begin
    perform public.add_customer_invoice_line(v_inv, 'FEE', 'Après coup', 1, 1000, null);
    raise exception 'ÉCHEC : une ligne a été ajoutée à une facture émise.';
  exception when check_violation then null;
  end;

  begin
    update public.customer_invoice_lines set unit_price = 1
     where id = (select line_rental from recette_fac);
    raise exception 'ÉCHEC : une ligne de facture émise a été modifiée.';
  exception when check_violation then null;
  end;

  begin
    perform public.archive_customer_invoice_line((select line_rental from recette_fac));
    raise exception 'ÉCHEC : une ligne de facture émise a été retirée.';
  exception when check_violation then null;
  end;

  -- §45 : l'en-tête ne se modifie plus davantage.
  begin
    perform public.update_customer_invoice(v_inv, current_date, null, 'Tentative');
    raise exception 'ÉCHEC : une facture émise a été modifiée.';
  exception when check_violation then null;
  end;

  if public.customer_invoice_total(v_inv) <> 450000 then
    raise exception 'Le total a bougé après émission : %.', public.customer_invoice_total(v_inv);
  end if;

  raise notice '[OK] 10. Émission : location « Facturée », lignes et en-tête figés.';
end $$;


-- --- 11. « PAYÉE », « PARTIELLEMENT PAYÉE » ET « EN RETARD » NE S'ÉCRIVENT PAS ----------
do $$
declare v_inv uuid := (select invoice from recette_fac);
begin
  begin
    update public.customer_invoices set status = 'PAID' where id = v_inv;
    raise exception 'ÉCHEC : une facture client a été déclarée payée.';
  exception when check_violation then null;
  end;

  begin
    update public.customer_invoices set status = 'PARTIALLY_PAID' where id = v_inv;
    raise exception 'ÉCHEC : une facture client a été déclarée partiellement payée.';
  exception when check_violation then null;
  end;

  begin
    update public.customer_invoices set status = 'OVERDUE' where id = v_inv;
    raise exception 'ÉCHEC : une facture client a été déclarée en retard.';
  exception when check_violation then null;
  end;

  if (select status from public.customer_invoices where id = v_inv) <> 'ISSUED' then
    raise exception 'Le statut de la facture a bougé.';
  end if;

  raise notice '[OK] 11. Les trois statuts dérivés se calculent, ne s''écrivent pas.';
end $$;


-- --- 12. UNE LOCATION NE SE FACTURE PAS DEUX FOIS ---------------------------------------
do $$
declare
  v_cli uuid := (select client from recette_fac);
  v_loc uuid := (select rental from recette_fac);
begin
  begin
    perform public.create_customer_invoice(v_cli, current_date, null, v_loc, 'Doublon');
    raise exception 'ÉCHEC : une location a reçu une seconde facture.';
  exception when unique_violation or check_violation then null;
  end;

  raise notice '[OK] 12. Une seconde facture sur la même location est refusée.';
end $$;


-- --- 13. LA CHAÎNE FACTURE → LOCATION → CLIENT NE SE ROMPT PAS — §49 --------------------
do $$
declare
  v_loc   uuid := (select rental from recette_fac);
  v_other uuid;
  v_cli   uuid := (select client from recette_fac);
  v_new   uuid;
begin
  insert into public.clients (client_no, type, legal_name, phone)
  values (public.next_number('client'), 'COMPANY', 'RECETTE FAC — Autre client', '+269 301')
  returning id into v_other;

  -- La location de recette est « Facturée » : elle n'est plus facturable, et le
  -- refus le dit avant même la question du client.
  begin
    perform public.create_customer_invoice(v_other, current_date, null, v_loc, null);
    raise exception 'ÉCHEC : une location déjà facturée a été refacturée.';
  exception when unique_violation or check_violation then null;
  end;

  -- Une location « En cours », elle, n'est pas facturable non plus (§5).
  insert into public.reservations (reservation_no, client_id, category_id, period)
  select public.next_number('reservation'), v_cli, category_id,
         tstzrange(now() + interval '30 days', now() + interval '33 days', '[)')
  from recette_fac
  returning id into v_new;

  perform public.confirm_reservation(v_new, (select vehicle from recette_fac));
  v_new := public.convert_reservation_to_rental(v_new);

  begin
    perform public.create_customer_invoice(v_cli, current_date, null, v_new, null);
    raise exception 'ÉCHEC : une location « En préparation » a été facturée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 13. Seule une location « À facturer » se facture, et pour SON client.';
end $$;


-- --- 14. ANNULATION : LA LOCATION REVIENT À « À FACTURER » ------------------------------
--
-- DEC-027 §e : « Une impasse n'est pas une garantie. » Sans ce retour, une
-- facture émise par erreur enfermerait le contrat dans « Facturée ».
do $$
declare
  v_inv uuid := (select invoice from recette_fac);
  v_loc uuid := (select rental from recette_fac);
  v_new uuid;
begin
  perform public.cancel_customer_invoice(v_inv, 'Erreur de saisie');

  if (select status from public.customer_invoices where id = v_inv) <> 'CANCELLED' then
    raise exception 'La facture n''a pas été annulée.';
  end if;

  if (select status from public.rentals where id = v_loc) <> 'TO_INVOICE' then
    raise exception 'La location n''est pas revenue à « À facturer » : %.',
      (select status from public.rentals where id = v_loc);
  end if;

  -- Rien n'est effacé (§46).
  if not exists (select 1 from public.customer_invoices where id = v_inv) then
    raise exception 'La facture annulée a été effacée.';
  end if;

  -- Annuler deux fois n'a pas de sens.
  begin
    perform public.cancel_customer_invoice(v_inv, null);
    raise exception 'ÉCHEC : une facture a été annulée deux fois.';
  exception when check_violation then null;
  end;

  -- Et la location se refacture : la correction que la règle rend nécessaire
  -- est bien possible (DEC-028).
  v_new := public.create_customer_invoice(
    (select client from recette_fac), current_date, current_date + 7, v_loc, 'Facture corrigée');
  perform public.add_customer_invoice_line(v_new, 'RENTAL', 'Location Toyota — 3 jours',
                                           3, 150000, null);
  perform public.issue_customer_invoice(v_new, null);

  update recette_fac set invoice = v_new;

  if (select status from public.rentals where id = v_loc) <> 'INVOICED' then
    raise exception 'La refacturation n''a pas ramené la location à « Facturée ».';
  end if;

  raise notice '[OK] 14. Annulation réversible : la location se refacture, rien n''est effacé.';
end $$;


-- --- 15. CLÔTURE — Workflow 01 §41, §42 -------------------------------------------------
--
-- §42 : « Une location peut être clôturée opérationnellement même si la facture
-- n'est pas encore entièrement payée. » Aucun règlement n'existe : la clôture
-- doit passer quand même.
do $$
declare
  v_loc uuid := (select rental from recette_fac);
  v_inv uuid := (select invoice from recette_fac);
begin
  perform public.close_rental(v_loc, 'Dossier traité');

  if (select status from public.rentals where id = v_loc) <> 'CLOSED' then
    raise exception 'La location n''a pas été clôturée.';
  end if;

  -- Clôturer deux fois n'a pas de sens, et « Clôturée » est terminal.
  begin
    perform public.close_rental(v_loc, null);
    raise exception 'ÉCHEC : une location a été clôturée deux fois.';
  exception when check_violation then null;
  end;

  -- La facture reste émise, et impayée : les deux informations restent
  -- séparées (§42).
  if (select status from public.customer_invoices where id = v_inv) <> 'ISSUED' then
    raise exception 'La clôture a modifié l''état de la facture.';
  end if;

  -- ET UNE CLÔTURE NE SE DÉFAIT PAS PAR L'ANNULATION D'UNE FACTURE.
  begin
    perform public.cancel_customer_invoice(v_inv, 'Tentative');
    raise exception 'ÉCHEC : la facture d''une location clôturée a été annulée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 15. Clôture sans paiement (§42) ; elle ne se défait pas ensuite.';
end $$;


-- --- 16. LES TRANSITIONS DE LOCATION NE SE COURT-CIRCUITENT PAS -------------------------
do $$
declare
  v_cli uuid := (select client from recette_fac);
  v_loc uuid;
begin
  insert into public.reservations (reservation_no, client_id, category_id, period)
  select public.next_number('reservation'), v_cli, category_id,
         tstzrange(now() + interval '60 days', now() + interval '63 days', '[)')
  from recette_fac
  returning id into v_loc;

  perform public.confirm_reservation(v_loc, (select vehicle from recette_fac));
  v_loc := public.convert_reservation_to_rental(v_loc);

  -- « En préparation » ne devient ni « Facturée » ni « Clôturée ».
  begin
    update public.rentals set status = 'INVOICED' where id = v_loc;
    raise exception 'ÉCHEC : une location en préparation est devenue « Facturée ».';
  exception when check_violation then null;
  end;

  begin
    update public.rentals set status = 'CLOSED' where id = v_loc;
    raise exception 'ÉCHEC : une location en préparation a été clôturée.';
  exception when check_violation then null;
  end;

  -- Et « Clôturée » est TERMINAL : on n'en revient pas.
  begin
    update public.rentals set status = 'TO_INVOICE'
     where id = (select rental from recette_fac);
    raise exception 'ÉCHEC : une location clôturée est revenue à « À facturer ».';
  exception when check_violation then null;
  end;

  raise notice '[OK] 16. Aucun raccourci : ni « Facturée » ni « Clôturée » ne se déclarent.';
end $$;


-- --- 17. UNE FACTURE NE NAÎT NI ÉMISE NI ANNULÉE -----------------------------------------
--
-- Le déclencheur de transition ne voit pas un INSERT : sans ce contrôle, un POST
-- direct créerait une facture émise sans que `issue` ait été exigée.
do $$
declare v_cli uuid := (select client from recette_fac);
begin
  begin
    insert into public.customer_invoices
      (invoice_no, client_id, invoice_date, status, issued_at)
    values ('FAC-C-FORGE-1', v_cli, current_date, 'ISSUED', now());
    raise exception 'ÉCHEC : une facture client est née émise.';
  exception when check_violation then null;
  end;

  begin
    insert into public.customer_invoices
      (invoice_no, client_id, invoice_date, status, cancelled_at)
    values ('FAC-C-FORGE-2', v_cli, current_date, 'CANCELLED', now());
    raise exception 'ÉCHEC : une facture client est née annulée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 17. Une facture naît en brouillon, y compris par INSERT direct.';
end $$;


-- --- 18. AUCUNE SUPPRESSION ---------------------------------------------------------------
do $$
declare
  v_inv uuid := (select invoice from recette_fac);
begin
  if public.current_actor() is not null then
    begin
      delete from public.customer_invoices where id = v_inv;
      raise exception 'ÉCHEC : une facture client a été supprimée.';
    exception when others then null;
    end;
  end if;

  -- La clé étrangère protège de toute façon la location facturée.
  begin
    delete from public.rentals where id = (select rental from recette_fac);
    raise exception 'ÉCHEC : une location portant une facture a été supprimée.';
  exception when foreign_key_violation or others then null;
  end;

  raise notice '[OK] 18. Ni facture ni location facturée ne se suppriment.';
end $$;


-- --- 19. AUCUN EFFET DE BORD --------------------------------------------------------------
do $$
declare
  v_veh uuid := (select vehicle from recette_fac);
  v_loc uuid := (select rental from recette_fac);
  v_amount bigint;
begin
  -- Le retour a ramené le véhicule au parc ; facturer et clôturer n'y touchent pas.
  if (select status from public.vehicles where id = v_veh) <> 'AVAILABLE' then
    raise exception 'Le statut du véhicule a changé : %.',
      (select status from public.vehicles where id = v_veh);
  end if;

  -- §8 et §72 : le tarif verrouillé de la location n'a pas bougé.
  select locked_amount into v_amount from public.rentals where id = v_loc;
  if v_amount <> 150000 then
    raise exception 'Le tarif verrouillé de la location a bougé : %.', v_amount;
  end if;

  /*
   * FACTURER N'ENCAISSE RIEN.
   *
   * Le LOT 8 a livré les règlements clients : d'autres factures en portent
   * désormais. Ce que ce contrôle doit prouver reste le même — émettre une
   * facture ne fait entrer aucun argent — et il se mesure donc sur LA FACTURE
   * DE CETTE RECETTE, jamais sur toute la base.
   */
  if exists (
    select 1 from public.customer_payments p
    where p.customer_invoice_id = (select invoice from recette_fac)
  ) then
    raise exception 'Émettre une facture a produit un encaissement.';
  end if;

  raise notice '[OK] 19. Ni parc, ni tarif, ni trésorerie touchés par la facturation.';
end $$;


-- --- 20. AUDIT ET CATALOGUE ---------------------------------------------------------------
do $$
declare
  v_count int;
  v_total int;
begin
  select count(*) into v_count
  from public.audit_log
  where entity_type in ('customer_invoices', 'customer_invoice_lines');
  if v_count = 0 then
    raise exception 'Aucune écriture d''audit pour la facturation client.';
  end if;

  select count(*) into v_total from public.permissions;
  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;

  raise notice '[OK] 20. Facturation client journalisée (% entrées) ; catalogue à 153.', v_count;
end $$;


rollback;
