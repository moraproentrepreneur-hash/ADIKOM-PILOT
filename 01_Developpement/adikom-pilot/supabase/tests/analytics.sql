-- =============================================================================
-- ADIKOM PILOT — Recette Statistiques & Rapports (Phase 3 — Pilotage, LOT 11)
--
-- CE QU'ELLE ÉPROUVE
--
-- Les statistiques n'écrivent rien : ni table, ni colonne, ni statut. Ce que la
-- BASE doit porter seule, ce sont ses SOMMES — et une somme fausse est pire
-- qu'une somme absente, parce qu'elle fait autorité.
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
-- Trois points sont critiques :
--
--   1. une imputation N'EST PAS un paiement (CLAUDE.md §57) : l'ignorer
--      annoncerait une dette de 1 000 000 là où ADIKOM en doit 500 000 ;
--   2. un FLUX se date de son propre acte : l'encaissé se compte au jour du
--      règlement, jamais à celui de la facture (Workflow 08 §11) ;
--   3. un ÉTAT dont les lignes ne font pas son total est faux : le rapport par
--      tiers doit se recouper avec la statistique.
--
-- AUCUN `current_date` — LE JOUR EST CELUI D'ADIKOM, PAS CELUI DU SERVEUR
--
-- `current_date` rend le jour de la SESSION, donc UTC sur Supabase. Or les
-- fonctions éprouvées ici datent leurs flux sur `Indian/Comoro` (DEC-025 §e) :
-- `billing_supplier_stats` compte une imputation au jour de
-- `(imputed_at at time zone 'Indian/Comoro')`.
--
-- Entre 21 h et minuit UTC, les Comores sont DÉJÀ le lendemain. Une imputation
-- créée à cet instant tombait alors hors de la fenêtre bornée par
-- `current_date`, et la recette échouait — sans qu'aucune régression n'ait eu
-- lieu. Défaut découvert le 5 septembre 2026, pendant les non-régressions du
-- LOT 13 : le code de production était juste, c'est l'horloge de la recette qui
-- ne l'était pas.
--
-- Toutes les bornes se posent donc sur le jour civil des Comores, exactement
-- comme les fonctions qu'elles interrogent.
--
-- Exécution :
--   npm run db:verify:analytics
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne RLS
-- et les gardes de capacité (`current_actor()` y est NULL). Il contrôle donc
-- l'ARITHMÉTIQUE et la STRUCTURE ; les capacités sont éprouvées avec de vraies
-- sessions par `verify:analytics` et `verify:capabilities`.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_stats (
  category_id uuid,
  client      uuid,
  vehicle     uuid,
  supplier    uuid,
  garage      uuid,
  invoice     uuid,
  account     uuid,
  maintenance uuid,
  imputation  uuid,
  sup_invoice uuid,
  audit_before bigint
) on commit drop;

insert into recette_stats
values (null, null, null, null, null, null, null, null, null, null, null);


-- --- 1. AUCUNE STATISTIQUE N'EST STOCKÉE ---------------------------------------------
--
-- Un chiffre d'affaires recopié dans une table devrait être tenu à jour par un
-- déclencheur sur chaque ligne de facture, chaque réduction, chaque règlement et
-- chaque annulation. Le premier oubli produirait un total faux.
do $$
declare v_bad text[];
begin
  select array_agg(tablename) into v_bad
  from pg_tables
  where schemaname = 'public'
    and (tablename like 'billing_stat%' or tablename like '%_statistics'
         or tablename like '%_report%' or tablename like 'chiffre%');
  if v_bad is not null then
    raise exception 'Des statistiques sont stockées : %.', v_bad;
  end if;

  select array_agg(table_name || '.' || column_name) into v_bad
  from information_schema.columns
  where table_schema = 'public'
    and column_name in ('revenue_total', 'collected_total', 'stats_amount', 'report_total');
  if v_bad is not null then
    raise exception 'Statistique recopiée dans une colonne : %.', v_bad;
  end if;

  raise notice '[OK] 1. Aucune statistique stockée : tout se recalcule à la lecture.';
end $$;


-- --- 2. HUIT FONCTIONS, TOUTES SOBRES ------------------------------------------------
--
-- `SECURITY INVOKER` (DEC-022), non volatiles, `search_path` figé, `EXECUTE`
-- retiré à PUBLIC. Une fonction de lecture qui s'exécuterait avec les droits de
-- son propriétaire contournerait RLS — et rendrait à chacun les montants de
-- tous.
do $$
declare
  v_fns text[] := array[
    'billing_require_period', 'billing_period_bucket',
    'billing_customer_stats', 'billing_customer_series', 'billing_customer_report',
    'billing_supplier_stats', 'billing_supplier_series', 'billing_supplier_report'
  ];
  v_bad text[];
  v_n   int;
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns);
  if v_n <> array_length(v_fns, 1) then
    raise exception 'Fonctions attendues : %, trouvées : %.', array_length(v_fns, 1), v_n;
  end if;

  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns) and p.prosecdef;
  if v_bad is not null then
    raise exception 'Fonction SECURITY DEFINER interdite (DEC-022) : %.', v_bad;
  end if;

  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_fns) and p.provolatile = 'v';
  if v_bad is not null then
    raise exception 'Fonction de lecture volatile : %.', v_bad;
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

  raise notice '[OK] 2. Huit fonctions, toutes SECURITY INVOKER et fermées à PUBLIC.';
end $$;


-- --- 3. CHAQUE FONCTION EXIGE SES CAPACITÉS -------------------------------------------
--
-- Le contrôle est LEXICAL : la garde doit être écrite dans le corps de la
-- fonction. Son EFFET s'éprouve avec de vraies sessions — ici `current_actor()`
-- est NULL et `require_capability` s'efface (migration 021).
--
-- Le point structurant : une synthèse EXIGE TOUTES les lectures dont elle
-- dépend. Sans les règlements, l'encaissé vaudrait zéro ; sans les imputations,
-- le net vaudrait le brut.
do $$
declare
  v_src  text;
  v_pair text[][] := array[
    ['billing_customer_stats',  'billing.customer.stats.view'],
    ['billing_customer_stats',  'billing.customer_invoices.view'],
    ['billing_customer_stats',  'billing.customer_payments.view'],
    ['billing_customer_series', 'billing.customer.stats.view'],
    ['billing_customer_series', 'billing.customer_invoices.view'],
    ['billing_customer_series', 'billing.customer_payments.view'],
    ['billing_customer_report', 'billing.customer.reports.view'],
    ['billing_customer_report', 'billing.customer_invoices.view'],
    ['billing_customer_report', 'billing.customer_payments.view'],
    ['billing_supplier_stats',  'billing.supplier.stats.view'],
    ['billing_supplier_stats',  'billing.supplier_invoices.view'],
    ['billing_supplier_stats',  'billing.imputations.view'],
    ['billing_supplier_stats',  'billing.supplier_payments.view'],
    ['billing_supplier_series', 'billing.supplier.stats.view'],
    ['billing_supplier_series', 'billing.supplier_invoices.view'],
    ['billing_supplier_series', 'billing.imputations.view'],
    ['billing_supplier_series', 'billing.supplier_payments.view'],
    ['billing_supplier_report', 'billing.supplier.reports.view'],
    ['billing_supplier_report', 'billing.supplier_invoices.view'],
    ['billing_supplier_report', 'billing.imputations.view'],
    ['billing_supplier_report', 'billing.supplier_payments.view']
  ];
  i int;
begin
  for i in 1 .. array_length(v_pair, 1) loop
    select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_pair[i][1]
    limit 1;

    if position(v_pair[i][2] in v_src) = 0 then
      raise exception '% n''exige pas « % ».', v_pair[i][1], v_pair[i][2];
    end if;
  end loop;

  raise notice '[OK] 3. Chaque synthèse nomme TOUTES les lectures dont elle dépend.';
end $$;


-- --- 4. LE CATALOGUE NE BOUGE PAS ------------------------------------------------------
do $$
declare v_total int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 170 then
    raise exception 'Catalogue attendu à 170 permissions, obtenu %.', v_total;
  end if;

  if not exists (
    select 1 from public.permissions
    where code in ('billing.customer.stats.view', 'billing.customer.reports.view',
                   'billing.supplier.stats.view', 'billing.supplier.reports.view')
    having count(*) = 4
  ) then
    raise exception 'Les quatre capacités de statistiques et rapports ne sont pas au catalogue.';
  end if;

  raise notice '[OK] 4. Catalogue à 170 : le LOT 11 ne crée aucune permission.';
end $$;


-- --- 5. LES GARDES DE PÉRIODE ET DE GRAIN ----------------------------------------------
--
-- Une borne absente donnerait un `between` toujours faux — donc un chiffre
-- d'affaires nul présenté comme un fait. Un grain inconnu rendrait une série
-- vide qui se lirait « aucune activité ».
do $$
declare v_ok boolean;
begin
  begin
    perform public.billing_customer_stats(null, (now() at time zone 'Indian/Comoro')::date);
    raise exception 'Une période incomplète a été acceptée.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date, (now() at time zone 'Indian/Comoro')::date - 1);
    raise exception 'Une période inversée a été acceptée.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.billing_customer_series((now() at time zone 'Indian/Comoro')::date - 7, (now() at time zone 'Indian/Comoro')::date, 'decennie');
    raise exception 'Un grain inconnu a été accepté.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.billing_supplier_series((now() at time zone 'Indian/Comoro')::date - 7, (now() at time zone 'Indian/Comoro')::date, null);
    raise exception 'Un grain absent a été accepté.';
  exception when invalid_parameter_value then null;
  end;

  -- La semaine commence le LUNDI (ISO 8601) : le 2 septembre 2026 est un
  -- mercredi, sa semaine commence le 31 août.
  if public.billing_period_bucket(date '2026-09-02', 'week') <> date '2026-08-31' then
    raise exception 'La semaine ne commence pas le lundi.';
  end if;
  if public.billing_period_bucket(date '2026-09-02', 'quarter') <> date '2026-07-01' then
    raise exception 'Le trimestre est mal borné.';
  end if;
  if public.billing_period_bucket(date '2026-09-02', 'year') <> date '2026-01-01' then
    raise exception 'L''année est mal bornée.';
  end if;

  raise notice '[OK] 5. Période incomplète, inversée et grain inconnu : refusés avec leur motif.';
end $$;


-- --- 6. JEU DE RECETTE — le cycle client ------------------------------------------------
do $$
declare
  v_cat uuid; v_cli uuid; v_veh uuid; v_inv uuid; v_acc uuid;
begin
  update recette_stats set audit_before = (select count(*) from public.audit_log);

  insert into public.vehicle_categories (code, label)
  values ('RSTA-TEST', 'Recette statistiques') returning id into v_cat;

  insert into public.clients (client_no, type, legal_name, phone)
  values (public.next_number('client'), 'COMPANY', 'RECETTE STATS — Client', '+269 910')
  returning id into v_cli;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'STATS', 'RS-0001', 'OWNED', 'AVAILABLE')
  returning id into v_veh;

  -- Facture datée d'il y a vingt jours, échéance dépassée de cinq : elle doit
  -- ressortir dans la part échue, et sa période est distincte de celle du
  -- règlement, qui sera du jour.
  v_inv := public.create_customer_invoice(v_cli, (now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date - 5, null,
                                          'Recette LOT 11');
  perform public.add_customer_invoice_line(v_inv, 'RENTAL', 'Location 3 jours', 3, 150000, null);
  perform public.issue_customer_invoice(v_inv, 'Recette LOT 11');

  v_acc := public.create_financial_account('BANK', 'Banque de recette STATS', 'BIC ADIKOM',
                                           'CPT-STATS-1', 0, (now() at time zone 'Indian/Comoro')::date - 30, null);

  update recette_stats set
    category_id = v_cat, client = v_cli, vehicle = v_veh, invoice = v_inv, account = v_acc;

  if public.customer_invoice_total(v_inv) <> 450000 then
    raise exception 'Total attendu 450 000, obtenu %.', public.customer_invoice_total(v_inv);
  end if;

  raise notice '[OK] 6. Facture client de 450 000 KMF émise, échéance dépassée.';
end $$;


-- --- 7. STATISTIQUES CLIENTS — flux de la période ----------------------------------------
do $$
declare
  v_cli   uuid := (select client from recette_stats);
  v_draft uuid;
  v_out   uuid;
  s       record;
  v_ref   bigint;
begin
  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date - 20);
  v_ref := s.invoiced_amount;

  if v_ref < 450000 then
    raise exception 'La facture n''est pas comptée dans le facturé : %.', v_ref;
  end if;

  -- Un BROUILLON ne reconnaît aucune créance (Workflow 07 §25).
  v_draft := public.create_customer_invoice(v_cli, (now() at time zone 'Indian/Comoro')::date - 20, null, null, 'Brouillon');
  perform public.add_customer_invoice_line(v_draft, 'SERVICE', 'Non émise', 1, 999000, null);

  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date - 20);
  if s.invoiced_amount <> v_ref then
    raise exception 'Un brouillon est compté dans le facturé.';
  end if;

  -- Une ANNULÉE n'a jamais produit de chiffre d'affaires.
  v_out := public.create_customer_invoice(v_cli, (now() at time zone 'Indian/Comoro')::date - 20, null, null, 'À annuler');
  perform public.add_customer_invoice_line(v_out, 'SERVICE', 'Annulée', 1, 777000, null);
  perform public.issue_customer_invoice(v_out, 'Recette');
  perform public.cancel_customer_invoice(v_out, 'Recette LOT 11');

  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date - 20);
  if s.invoiced_amount <> v_ref then
    raise exception 'Une facture annulée est comptée dans le facturé.';
  end if;

  -- Hors période : une facture d'il y a vingt jours n'est pas d'hier.
  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 19, (now() at time zone 'Indian/Comoro')::date);
  if s.invoiced_amount <> 0 then
    raise exception 'Une facture est comptée hors de sa période.';
  end if;

  -- Bornes INCLUSES aux deux extrémités.
  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date);
  if s.invoiced_amount < 450000 then
    raise exception 'La borne basse n''est pas incluse.';
  end if;
  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 30, (now() at time zone 'Indian/Comoro')::date - 20);
  if s.invoiced_amount < 450000 then
    raise exception 'La borne haute n''est pas incluse.';
  end if;

  raise notice '[OK] 7. Facturé : brouillon et annulée exclus, bornes incluses.';
end $$;


-- --- 8. ENCAISSÉ, CRÉANCES, ET LA DATE QUI COMPTE ------------------------------------------
--
-- Workflow 08 §11 : « La date réelle du règlement doit être enregistrée. Elle ne
-- doit pas être confondue avec la date de facture. » Le règlement est du JOUR,
-- la facture d'il y a vingt jours : les deux ne doivent jamais tomber dans la
-- même case.
do $$
declare
  v_inv uuid := (select invoice from recette_stats);
  v_acc uuid := (select account from recette_stats);
  v_pay uuid;
  s     record;
begin
  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date, (now() at time zone 'Indian/Comoro')::date);
  if s.collected_amount <> 0 then
    raise exception 'Un encaissement est présumé avant tout règlement.';
  end if;

  v_pay := public.record_customer_payment(v_inv, v_acc, 200000, (now() at time zone 'Indian/Comoro')::date, 'BANK_TRANSFER',
                                          'VIR-STATS-1', null);

  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date, (now() at time zone 'Indian/Comoro')::date);
  if s.collected_amount <> 200000 or s.collected_count <> 1 then
    raise exception 'Encaissé attendu 1 / 200 000, obtenu % / %.',
      s.collected_count, s.collected_amount;
  end if;
  -- Le règlement du jour ne fait entrer AUCUNE facture dans la période.
  if s.issued_count <> 0 then
    raise exception 'Une facture est comptée à la date de son règlement.';
  end if;

  -- La créance, elle, ignore la période : 450 000 − 200 000.
  if s.outstanding_amount <> 250000 or s.outstanding_count <> 1 then
    raise exception 'Créance attendue 1 / 250 000, obtenue % / %.',
      s.outstanding_count, s.outstanding_amount;
  end if;
  -- Échéance à J−5 : elle est échue.
  if s.outstanding_overdue_count <> 1 or s.outstanding_overdue_amount <> 250000 then
    raise exception 'Part échue attendue 1 / 250 000, obtenue % / %.',
      s.outstanding_overdue_count, s.outstanding_overdue_amount;
  end if;

  -- Sur la période de la FACTURE, elle est non soldée et en retard.
  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date - 20);
  if s.settled_count <> 0 or s.unsettled_count <> 1 or s.period_overdue_count <> 1 then
    raise exception 'États attendus 0 soldée / 1 non soldée / 1 en retard, obtenus % / % / %.',
      s.settled_count, s.unsettled_count, s.period_overdue_count;
  end if;

  -- ANNULER le règlement rétablit la créance ENTIÈRE (Workflow 08 §28).
  perform public.cancel_customer_payment(v_pay, 'Recette LOT 11');
  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date, (now() at time zone 'Indian/Comoro')::date);
  if s.outstanding_amount <> 450000 or s.collected_amount <> 0 then
    raise exception 'Un règlement annulé compte encore : créance %, encaissé %.',
      s.outstanding_amount, s.collected_amount;
  end if;

  -- Puis on le rejoue, pour la suite de la recette.
  perform public.record_customer_payment(v_inv, v_acc, 200000, (now() at time zone 'Indian/Comoro')::date, 'CASH', null, null);

  raise notice '[OK] 8. Encaissé compté à SA date ; créance 250 000, échue ; annulation rendue.';
end $$;


-- --- 9. UNE FACTURE SOLDÉE SORT DES CRÉANCES ------------------------------------------------
--
-- « Le retard qualifie une créance qui court encore » : une facture payée n'est
-- jamais en retard, même échéance dépassée (Workflow 07 §30).
do $$
declare
  v_inv uuid := (select invoice from recette_stats);
  v_acc uuid := (select account from recette_stats);
  s     record;
begin
  perform public.record_customer_payment(v_inv, v_acc, 250000, (now() at time zone 'Indian/Comoro')::date, 'CASH', null, null);

  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date);
  if s.outstanding_amount <> 0 or s.outstanding_count <> 0 then
    raise exception 'Une facture soldée reste comptée : % / %.',
      s.outstanding_count, s.outstanding_amount;
  end if;
  if s.outstanding_overdue_count <> 0 then
    raise exception 'Une facture soldée est présentée comme en retard.';
  end if;
  if s.settled_count <> 1 or s.unsettled_count <> 0 or s.period_overdue_count <> 0 then
    raise exception 'La facture soldée n''est pas comptée comme telle : % / % / %.',
      s.settled_count, s.unsettled_count, s.period_overdue_count;
  end if;
  if s.collected_amount <> 450000 then
    raise exception 'Encaissé attendu 450 000, obtenu %.', s.collected_amount;
  end if;

  raise notice '[OK] 9. Facture soldée : sortie des créances, jamais dite en retard.';
end $$;


-- --- 10. LA SÉRIE DÉTAILLE LES MÊMES LIGNES QUE LE TOTAL --------------------------------------
--
-- Deux calculs différents finiraient par diverger. La somme des points doit donc
-- valoir exactement le total, et la facture ne doit pas tomber dans le pas du
-- règlement.
do $$
declare
  s        record;
  v_sum_i  bigint := 0;
  v_sum_c  bigint := 0;
  v_points int := 0;
  p        record;
begin
  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date);

  for p in select * from public.billing_customer_series((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date, 'day') loop
    v_sum_i := v_sum_i + p.invoiced_amount;
    v_sum_c := v_sum_c + p.collected_amount;
    v_points := v_points + 1;

    -- Le jour de la facture ne porte aucun encaissement, et réciproquement.
    if p.bucket = (now() at time zone 'Indian/Comoro')::date - 20 and p.collected_amount <> 0 then
      raise exception 'Un encaissement est daté du jour de la facture.';
    end if;
    if p.bucket = (now() at time zone 'Indian/Comoro')::date and p.invoiced_amount <> 0 then
      raise exception 'Une facture est datée du jour de son règlement.';
    end if;
  end loop;

  if v_sum_i <> s.invoiced_amount or v_sum_c <> s.collected_amount then
    raise exception 'La série ne fait pas le total : % / % contre % / %.',
      v_sum_i, v_sum_c, s.invoiced_amount, s.collected_amount;
  end if;

  -- Un pas sans mouvement n'est pas rendu : deux jours porteurs, pas vingt et un.
  if v_points <> 2 then
    raise exception 'Points attendus 2 (facture et règlement), obtenus %.', v_points;
  end if;

  -- Au grain « mois », les deux jours peuvent se rejoindre ou non selon la
  -- date d'exécution — mais la somme, elle, ne change jamais.
  v_sum_i := 0;
  for p in select * from public.billing_customer_series((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date, 'month') loop
    v_sum_i := v_sum_i + p.invoiced_amount;
  end loop;
  if v_sum_i <> s.invoiced_amount then
    raise exception 'Le grain change le total : % contre %.', v_sum_i, s.invoiced_amount;
  end if;

  raise notice '[OK] 10. La série détaille le total sans le contredire, quel que soit le grain.';
end $$;


-- --- 11. RAPPORT CLIENTS — les lignes font le total ------------------------------------------
do $$
declare
  s       record;
  r       record;
  v_inv   bigint := 0;
  v_col   bigint := 0;
  v_out   bigint := 0;
  v_lines int := 0;
  v_cli   uuid := (select client from recette_stats);
  v_seen  boolean := false;
begin
  select * into s from public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date);

  for r in select * from public.billing_customer_report((now() at time zone 'Indian/Comoro')::date - 20, (now() at time zone 'Indian/Comoro')::date) loop
    v_inv := v_inv + r.invoiced_amount;
    v_col := v_col + r.collected_amount;
    v_out := v_out + r.outstanding_amount;
    v_lines := v_lines + 1;
    if r.client_id = v_cli then
      v_seen := true;
      if r.invoice_count <> 1 or r.invoiced_amount <> 450000 then
        raise exception 'Ligne du client attendue 1 / 450 000, obtenue % / %.',
          r.invoice_count, r.invoiced_amount;
      end if;
      if r.collected_amount <> 450000 then
        raise exception 'Encaissé du client attendu 450 000, obtenu %.', r.collected_amount;
      end if;
      -- Le nom vient de la base en PARTIES : la composition reste à
      -- l'application, jamais dupliquée en SQL.
      if r.client_no is null or r.legal_name <> 'RECETTE STATS — Client' then
        raise exception 'Le rapport ne rend pas les parties du nom du client.';
      end if;
    end if;
  end loop;

  if not v_seen then
    raise exception 'Le client de recette n''apparaît pas dans le rapport.';
  end if;
  if v_inv <> s.invoiced_amount or v_col <> s.collected_amount
     or v_out <> s.outstanding_amount then
    raise exception 'Le rapport ne se recoupe pas avec la statistique : % / % / % contre % / % / %.',
      v_inv, v_col, v_out, s.invoiced_amount, s.collected_amount, s.outstanding_amount;
  end if;

  raise notice '[OK] 11. Rapport clients : % ligne(s), et leur somme fait le total.', v_lines;
end $$;


-- --- 12. DETTE FOURNISSEUR — l'imputation n'est PAS un paiement -------------------------------
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
  v_cat uuid := (select category_id from recette_stats);
  v_acc uuid := (select account from recette_stats);
  v_sup uuid; v_gar uuid; v_veh uuid; v_mnt uuid; v_imp uuid; v_inv uuid;
  s     record;
begin
  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER', 'RECETTE STATS — Fournisseur',
          '+269 911', 'ACTIVE')
  returning id into v_sup;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'MAINTENANCE_PROVIDER', 'RECETTE STATS — Garage',
          '+269 912', 'ACTIVE')
  returning id into v_gar;

  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'STATS-SUP', 'RS-0002',
          'SUPPLIED', v_sup, 'AVAILABLE')
  returning id into v_veh;

  v_mnt := public.create_maintenance(
    p_vehicle_id => v_veh, p_origin => 'BREAKDOWN',
    p_reason => 'Panne imputable — recette statistiques',
    p_provider_supplier_id => v_gar);
  perform public.record_maintenance_costs(v_mnt, 250000, 300000, 300000);

  v_imp := public.create_imputation(v_mnt, v_sup, 300000,
    'Panne imputable au fournisseur selon les conditions de mise à disposition.');
  perform public.submit_imputation(v_imp);
  perform public.validate_imputation(v_imp, 'Recette LOT 11');

  v_inv := public.create_supplier_invoice(v_sup, (now() at time zone 'Indian/Comoro')::date - 10, (now() at time zone 'Indian/Comoro')::date - 3,
                                          'FRN-STATS-1', 'Recette LOT 11');
  perform public.add_supplier_invoice_line(v_inv, 'Mise à disposition', 1000000, v_veh);
  perform public.submit_supplier_invoice(v_inv);
  perform public.validate_supplier_invoice(v_inv);
  perform public.attach_imputation_to_invoice(v_imp, v_inv);

  update recette_stats set
    supplier = v_sup, garage = v_gar, maintenance = v_mnt,
    imputation = v_imp, sup_invoice = v_inv;

  -- AVANT tout règlement : la dette vaut le NET, jamais le brut.
  select * into s from public.billing_supplier_stats((now() at time zone 'Indian/Comoro')::date - 10, (now() at time zone 'Indian/Comoro')::date);
  if s.gross_amount <> 1000000 then
    raise exception 'Brut attendu 1 000 000, obtenu %.', s.gross_amount;
  end if;
  if s.imputed_amount <> 300000 or s.imputation_count <> 1 then
    raise exception 'Imputé attendu 1 / 300 000, obtenu % / %.',
      s.imputation_count, s.imputed_amount;
  end if;
  if s.payable_amount <> 700000 then
    raise exception 'Dette attendue 700 000 (imputation déduite), obtenue %.', s.payable_amount;
  end if;
  -- Et une imputation n'est PAS un règlement : le payé reste à zéro.
  if s.paid_amount <> 0 or s.payment_count <> 0 then
    raise exception 'Une imputation est comptée comme un paiement : % / %.',
      s.payment_count, s.paid_amount;
  end if;

  perform public.record_supplier_payment(v_inv, v_acc, 200000, (now() at time zone 'Indian/Comoro')::date, 'BANK_TRANSFER',
                                         'VIR-STATS-F', null);

  select * into s from public.billing_supplier_stats((now() at time zone 'Indian/Comoro')::date - 10, (now() at time zone 'Indian/Comoro')::date);
  if s.paid_amount <> 200000 or s.payment_count <> 1 then
    raise exception 'Réglé attendu 1 / 200 000, obtenu % / %.', s.payment_count, s.paid_amount;
  end if;
  if s.payable_amount <> 500000 or s.payable_count <> 1 then
    raise exception 'Reste à payer attendu 1 / 500 000, obtenu % / %.',
      s.payable_count, s.payable_amount;
  end if;
  -- Échéance à J−3 : la dette est échue.
  if s.payable_overdue_count <> 1 or s.payable_overdue_amount <> 500000 then
    raise exception 'Part échue attendue 1 / 500 000, obtenue % / %.',
      s.payable_overdue_count, s.payable_overdue_amount;
  end if;

  raise notice '[OK] 12. Dette = brut − imputé − payé : 500 000 KMF, jamais 1 000 000.';
end $$;


-- --- 13. UNE FACTURE FOURNISSEUR NON VALIDÉE N'EST PAS UNE DETTE --------------------------------
do $$
declare
  v_sup uuid := (select supplier from recette_stats);
  v_new uuid;
  s     record;
  v_ref bigint;
begin
  select payable_amount into v_ref
  from public.billing_supplier_stats((now() at time zone 'Indian/Comoro')::date - 10, (now() at time zone 'Indian/Comoro')::date);

  v_new := public.create_supplier_invoice(v_sup, (now() at time zone 'Indian/Comoro')::date, null, 'FRN-STATS-2', 'En saisie');
  perform public.add_supplier_invoice_line(v_new, 'Ligne en saisie', 888000, null);

  select * into s from public.billing_supplier_stats((now() at time zone 'Indian/Comoro')::date - 10, (now() at time zone 'Indian/Comoro')::date);
  if s.payable_amount <> v_ref then
    raise exception 'Une facture non validée est comptée comme dette : % contre %.',
      s.payable_amount, v_ref;
  end if;
  if s.gross_amount <> 1000000 then
    raise exception 'Un brouillon est compté dans le facturé fournisseur : %.', s.gross_amount;
  end if;

  raise notice '[OK] 13. Brouillon fournisseur : aucune dette, aucun facturé.';
end $$;


-- --- 14. RAPPORT FOURNISSEURS — la chaîne complète, fournisseur par fournisseur ------------------
do $$
declare
  s      record;
  r      record;
  v_sup  uuid := (select supplier from recette_stats);
  v_gr   bigint := 0;
  v_im   bigint := 0;
  v_pd   bigint := 0;
  v_pa   bigint := 0;
  v_seen boolean := false;
begin
  select * into s from public.billing_supplier_stats((now() at time zone 'Indian/Comoro')::date - 10, (now() at time zone 'Indian/Comoro')::date);

  for r in select * from public.billing_supplier_report((now() at time zone 'Indian/Comoro')::date - 10, (now() at time zone 'Indian/Comoro')::date) loop
    v_gr := v_gr + r.gross_amount;
    v_im := v_im + r.imputed_amount;
    v_pd := v_pd + r.paid_amount;
    v_pa := v_pa + r.payable_amount;

    if r.supplier_id = v_sup then
      v_seen := true;
      if r.invoice_count <> 1 or r.gross_amount <> 1000000
         or r.imputed_amount <> 300000 or r.paid_amount <> 200000
         or r.payable_amount <> 500000 then
        raise exception
          'Ligne fournisseur attendue 1 / 1 000 000 / 300 000 / 200 000 / 500 000, obtenue % / % / % / % / %.',
          r.invoice_count, r.gross_amount, r.imputed_amount, r.paid_amount, r.payable_amount;
      end if;
      if r.overdue_amount <> 500000 then
        raise exception 'Part échue du fournisseur attendue 500 000, obtenue %.', r.overdue_amount;
      end if;
    end if;
  end loop;

  if not v_seen then
    raise exception 'Le fournisseur de recette n''apparaît pas dans le rapport.';
  end if;
  if v_gr <> s.gross_amount or v_im <> s.imputed_amount
     or v_pd <> s.paid_amount or v_pa <> s.payable_amount then
    raise exception 'Le rapport fournisseur ne se recoupe pas avec la statistique.';
  end if;

  raise notice '[OK] 14. Rapport fournisseurs : la chaîne brut → imputé → payé → reste dû.';
end $$;


-- --- 15. LIRE NE MODIFIE RIEN ------------------------------------------------------------------
--
-- Une statistique lit ; elle n'écrit pas. Aucun statut ne bouge, aucune entrée
-- d'audit n'est produite par la consultation.
do $$
declare
  v_inv    uuid := (select invoice from recette_stats);
  v_sinv   uuid := (select sup_invoice from recette_stats);
  v_imp    uuid := (select imputation from recette_stats);
  v_before bigint;
  v_after  bigint;
  v_status text;
begin
  select count(*) into v_before from public.audit_log;

  perform public.billing_customer_stats((now() at time zone 'Indian/Comoro')::date - 30, (now() at time zone 'Indian/Comoro')::date);
  perform public.billing_customer_series((now() at time zone 'Indian/Comoro')::date - 30, (now() at time zone 'Indian/Comoro')::date, 'week');
  perform count(*) from public.billing_customer_report((now() at time zone 'Indian/Comoro')::date - 30, (now() at time zone 'Indian/Comoro')::date);
  perform public.billing_supplier_stats((now() at time zone 'Indian/Comoro')::date - 30, (now() at time zone 'Indian/Comoro')::date);
  perform public.billing_supplier_series((now() at time zone 'Indian/Comoro')::date - 30, (now() at time zone 'Indian/Comoro')::date, 'week');
  perform count(*) from public.billing_supplier_report((now() at time zone 'Indian/Comoro')::date - 30, (now() at time zone 'Indian/Comoro')::date);

  select count(*) into v_after from public.audit_log;
  if v_after <> v_before then
    raise exception 'Consulter une statistique a écrit % entrée(s) d''audit.', v_after - v_before;
  end if;

  select status::text into v_status from public.customer_invoices where id = v_inv;
  if v_status <> 'ISSUED' then
    raise exception 'La facture client a changé d''état : %.', v_status;
  end if;
  select status::text into v_status from public.supplier_invoices where id = v_sinv;
  if v_status <> 'VALIDATED' then
    raise exception 'La facture fournisseur a changé d''état : %.', v_status;
  end if;
  select status::text into v_status from public.imputations where id = v_imp;
  if v_status <> 'IMPUTED' then
    raise exception 'L''imputation a changé d''état : %.', v_status;
  end if;

  raise notice '[OK] 15. Lire ne déplace aucun statut et n''écrit aucune entrée d''audit.';
end $$;


do $$
begin
  raise notice '';
  raise notice 'RECETTE STATISTIQUES & RAPPORTS : 15 contrôles, tous réussis.';
  raise notice 'La transaction est annulée : aucun résidu en base.';
end $$;

rollback;
