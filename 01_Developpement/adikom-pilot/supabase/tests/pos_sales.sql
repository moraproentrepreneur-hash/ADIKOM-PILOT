-- =============================================================================
-- ADIKOM PILOT — Recette Point de vente : ventes et encaissement
-- LOT 28 (Module 12 §12 à §22) — migrations 112 à 120 · DEC-055
--
-- CE QU'ELLE ÉPROUVE — Plan 02 §18.2 (LOT 28) et Plan 01 §21.2
--
--   · 🟥 LE TEST DE RÉFÉRENCE DE LA DIRECTION : net 60 000, donné 100 000 →
--     encaissé 60 000, monnaie 40 000, la trésorerie enregistre 60 000 ;
--   · 🟥 C-2 : facture sur demande → facture PAYÉE, et le solde du compte NE
--     BOUGE PAS ; une écriture forgée sur le règlement adossé est REFUSÉE ; un
--     règlement adossé inséré directement est REFUSÉ ; il ne s'annule pas seul ;
--     une vente ne se facture qu'une fois ;
--   · T-2 / D-3 : paiement mixte réparti entre deux comptes, une écriture par
--     paiement ; espèces sur le compte de la caisse, imposé ; Mvola sur un
--     compte bancaire actif ; pas de monnaie hors espèces ;
--   · D-1 : remises de ligne et globale, sous `pos.sales.discount`, bornées ;
--     la vente reste soldée ; la facture porte des lignes DISCOUNT libellées ;
--   · P-4 : vente non soldée — client exigé, `pos.sales.credit`, facture émise
--     dans la transaction, solde suivi ; règlement ultérieur normal ;
--   · B-10 : annulation motivée, y compris session close ; refusée si facturée ;
--   · une vente sans session ouverte, ou sur la session d'un autre : REFUSÉE ;
--   · services SALE/BOTH actifs seulement, prix résolu à la date (D16) ;
--   · le théorique de session = fond + ESPÈCES encaissées ;
--   · écritures directes refusées (« nées par leurs fonctions ») ;
--   · permissions positives ET négatives, profil minimal ; coût copié lu par
--     `catalog.services.cost.view` seule ; journal CREATE / CANCEL.
--
-- 🟥 LA RLS EST ÉPROUVÉE POUR DE BON : les actes s'exécutent sous `set local
-- role authenticated`, avec l'identité d'un compte de recette.
--
-- LE CONTRÔLE DIFFÉRÉ : une recette annulée n'atteint jamais la validation.
-- Après chaque acte, `pg_temp.valider()` déclenche les contrôles différés
-- (`set constraints all immediate`) puis les remet en différé.
--
-- ANTI-VACUITÉ : chaque refus est précédé ou suivi d'un succès sur les mêmes
-- objets ; chaque « ne voit rien » d'un « voit quelque chose ».
--
-- MESURER UNE VARIATION, JAMAIS UN TOTAL ABSOLU (Plan 01 §21.3, règle 6).
--
-- Exécution : npm run db:verify:pos-sales
-- AUCUNE DATE EN DUR. La transaction est annulée en fin de script.
-- =============================================================================

begin;

-- Garde d'entrée : un résidu d'un passage interrompu fausserait la recette.
do $$
begin
  if exists (select 1 from public.app_users where email like 'recette.vte.%@adikom.test') then
    raise exception 'Résidu d''une recette précédente (comptes recette.vte.*) : nettoyez avant de rejouer.';
  end if;
end $$;


-- --- 1. LES HUIT CAPACITÉS, ET PAS UNE DE PLUS (C-28) ------------------------
do $$
declare
  v_attendu text[] := array[
    'pos.sales.view', 'pos.sales.create', 'pos.sales.discount', 'pos.sales.credit',
    'pos.sales.cancel', 'pos.sales.download', 'pos.sales.print', 'pos.sales.export'
  ];
  v_n int;
begin
  select count(*) into v_n from public.permissions where code = any (v_attendu);
  if v_n <> 8 then
    raise exception 'Capacités de vente : % sur 8.', v_n;
  end if;

  if exists (select 1 from public.permissions
             where menu_code = 'sales' and module_code = 'pos' and not (code = any (v_attendu))) then
    raise exception 'Une capacité de vente a été inventée.';
  end if;

  -- Aucune « facture sur demande », aucun remboursement (C-28, B-11).
  if exists (select 1 from public.permissions
             where code like 'pos.sales.%' and (code like '%invoice%' or code like '%refund%')) then
    raise exception 'Une capacité exclue par C-28 ou B-11 a été créée.';
  end if;

  if exists (select 1 from public.permissions
             where code = any (v_attendu)
               and is_sensitive is distinct from (code not in ('pos.sales.view', 'pos.sales.create'))) then
    raise exception 'Sensibilité incorrecte : seules view et create ne sont pas sensibles.';
  end if;

  if (select action from public.permissions where code = 'pos.sales.discount') <> 'ADMIN'
     or (select action from public.permissions where code = 'pos.sales.credit') <> 'ADMIN' then
    raise exception 'discount et credit doivent être des actions ADMIN (Plan 02 §10.2).';
  end if;

  raise notice '[OK] 1. Huit capacités de vente, six sensibles, aucune inventée.';
end $$;


-- --- 2. LES TABLES, REFERMÉES -------------------------------------------------
do $$
declare
  v_table text;
  v_n     int;
begin
  foreach v_table in array array['pos_sales', 'pos_sale_lines', 'pos_payments', 'commercial_line_costs'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'RLS non activée sur %.', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
       or has_table_privilege('authenticated', 'public.' || v_table, 'TRUNCATE') then
      raise exception 'Privilège excessif sur %.', v_table;
    end if;
    select count(*) into v_n from pg_trigger
    where tgrelid = ('public.' || v_table)::regclass and not tgisinternal
      and tgname > v_table || '_zzz_born_by_function';
    if v_n > 0 then
      raise exception 'La garde « née par sa fonction » de % n''est pas la dernière.', v_table;
    end if;
  end loop;

  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (p.proname like '%pos_%' or p.proname like 'pos%');
  if v_n > 0 then
    raise exception '% fonction(s) du point de vente sont SECURITY DEFINER.', v_n;
  end if;

  -- D1 : aucun total, aucune monnaie ; DEC-049 §e : aucun coût sur la ligne.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name in ('pos_sales', 'pos_sale_lines', 'pos_payments')
               and (column_name like '%total%' or column_name like '%change%' or column_name like '%cost%')) then
    raise exception 'Un total, une monnaie ou un coût est stocké sur une table de vente.';
  end if;

  raise notice '[OK] 2. Quatre tables : RLS, ni DELETE ni TRUNCATE, gardes en dernier, aucun SECURITY DEFINER, aucun total stocké.';
end $$;


-- =============================================================================
-- SUJETS ET DÉCOR
-- =============================================================================

create temporary table recette_vte (cle text primary key, id uuid not null) on commit drop;
grant select, insert on recette_vte to authenticated;

do $$
declare
  v_cles text[] := array['caissier', 'caissier_b', 'remiseur', 'responsable', 'facturier',
                         'lecteur', 'annuleur_aveugle', 'minimal'];
  v_cle  text;
  v_id   uuid;
  v_caisse text[] := array['pos.sales.view', 'pos.sales.create', 'pos.sessions.view',
                           'pos.sessions.open', 'pos.sessions.close', 'pos.registers.view',
                           'treasury.accounts.view', 'catalog.services.view', 'parties.clients.view'];
  v_facture text[] := array['billing.customer_invoices.create', 'billing.customer_invoices.view',
                            'billing.customer_invoices.issue', 'billing.customer_payments.create',
                            'billing.customer_payments.view'];
begin
  foreach v_cle in array v_cles loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'recette.vte.' || v_cle || '@adikom.test', now(), now());
    insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
    values (v_id, 'Recette', 'Vente ' || v_cle, 'recette.vte.' || v_cle,
            'recette.vte.' || v_cle || '@adikom.test', 'ACTIVE', false);
    insert into recette_vte values (v_cle, v_id);
  end loop;

  -- Caissiers : encaisser, sans remise, sans crédit, sans annulation, sans facturation.
  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW' from recette_vte r cross join public.permissions p
  where r.cle in ('caissier', 'caissier_b', 'remiseur', 'responsable') and p.code = any (v_caisse);

  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW' from recette_vte r cross join public.permissions p
  where r.cle = 'remiseur' and p.code = 'pos.sales.discount';

  -- Le responsable : tout le comptoir, la facturation, l'annulation, le coût.
  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW' from recette_vte r cross join public.permissions p
  where r.cle = 'responsable'
    and (p.code = any (v_facture)
      or p.code in ('pos.sales.discount', 'pos.sales.credit', 'pos.sales.cancel',
                    'treasury.entries.view', 'catalog.services.cost.view',
                    'pos.sessions.amounts.view',
                    -- Pour éprouver que la facture d'une vente et le règlement
                    -- adossé ne s'annulent pas, MÊME avec ces capacités :
                    'billing.customer_invoices.cancel', 'billing.customer_payments.cancel'));

  -- Le facturier : facture sur demande, sans encaisser.
  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW' from recette_vte r cross join public.permissions p
  where r.cle = 'facturier'
    and (p.code = any (v_facture)
      or p.code in ('pos.sales.view', 'parties.clients.view', 'catalog.services.view'));

  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW' from recette_vte r cross join public.permissions p
  where r.cle = 'lecteur' and p.code = 'pos.sales.view';

  -- Annule, mais ne lit pas les écritures : doit être refusé.
  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW' from recette_vte r cross join public.permissions p
  where r.cle = 'annuleur_aveugle'
    and p.code in ('pos.sales.view', 'pos.sales.cancel', 'billing.customer_invoices.view');

  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW' from recette_vte r cross join public.permissions p
  where r.cle = 'minimal' and p.code = 'dashboard.view';

  raise notice '[OK] 3. Huit profils : deux caissiers, remiseur, responsable, facturier, lecteur, annuleur sans lecture des écritures, minimal.';
end $$;

create or replace function pg_temp.agir_comme(p_cle text)
returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from recette_vte where cle = p_cle;
  if v_id is null then raise exception 'Compte de recette « % » introuvable.', p_cle; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.redevenir_service()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pg_temp.id_de(p_cle text)
returns uuid language sql stable as $$ select id from recette_vte where cle = p_cle $$;

-- Déclenche les contrôles différés de ce qui vient d'être fait, puis les remet
-- en différé : la recette, annulée, n'atteindrait jamais la validation.
-- 🟥 Appelée APRÈS CHAQUE ACTE, SOUS L'IDENTITÉ QUI L'A FAIT : en production,
-- chaque requête est sa propre transaction, et ses contrôles différés lisent
-- sous les droits de son auteur.
create or replace function pg_temp.valider()
returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- Solde d'un compte, mesuré par la clé de service : Σ entrées − Σ sorties validées.
create or replace function pg_temp.mouvements(p_account uuid)
returns bigint language sql stable as $$
  select coalesce(sum(case when e.direction = 'IN' then e.amount else -e.amount end), 0)::bigint
  from public.treasury_entries e
  where e.account_id = p_account and e.status = 'VALIDATED'
$$;


-- --- 4. LE DÉCOR : comptes, catalogue, client, caisses, sessions --------------
do $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
  v_cat   uuid;
  v_svc   uuid;
  v_var   uuid;
begin
  insert into recette_vte values ('cash', public.create_financial_account(
    'CASH', 'RECETTE VTE — Caisse comptoir', 'Recette', null, 0, null, null));
  insert into recette_vte values ('cash_b', public.create_financial_account(
    'CASH', 'RECETTE VTE — Caisse annexe', 'Recette', null, 0, null, null));
  insert into recette_vte values ('mvola', public.create_financial_account(
    'BANK', 'RECETTE VTE — Mvola ADIKOM', 'Telma Mvola', null, 0, null, null));
  insert into recette_vte values ('bank_off', public.create_financial_account(
    'BANK', 'RECETTE VTE — Banque fermée', 'Recette', null, 0, null, null));
  perform public.set_financial_account_status(pg_temp.id_de('bank_off'), 'INACTIVE', 'Recette');

  insert into public.clients (client_no, type, legal_name, phone, status)
  values (public.next_number('client'), 'COMPANY', 'RECETTE VTE SARL', '+269 300 00 01', 'ACTIVE')
  returning id into v_svc;
  insert into recette_vte values ('client', v_svc);

  insert into public.service_categories (code, label)
  values ('RECETTE-VTE', 'Recette — Point de vente')
  returning id into v_cat;

  -- Un service de VENTE à 60 000 : le test de référence. (Un service de vente
  -- ne porte pas de prix d'achat — règle du LOT 20.)
  insert into public.services (service_no, label, category_id, purpose, unit_label)
  values (public.next_number('service'), 'Recette VTE — Transfert', v_cat, 'SALE', 'trajet')
  returning id into v_svc;
  select id into v_var from public.service_variants where service_id = v_svc and is_default;
  perform public.set_service_price(v_var, 60000, v_today - 30, 'Prix de recette');
  -- 🟥 D16 : un nouveau prix, en vigueur DEMAIN. La vente d'aujourd'hui prend 60 000.
  perform public.set_service_price(v_var, 70000, v_today + 1, 'Hausse de demain');
  insert into recette_vte values ('transfert', v_var);

  -- Un service MIXTE (BOTH) à 25 000, coût 15 000.
  insert into public.services (service_no, label, category_id, purpose, unit_label)
  values (public.next_number('service'), 'Recette VTE — Guide', v_cat, 'BOTH', 'journée')
  returning id into v_svc;
  select id into v_var from public.service_variants where service_id = v_svc and is_default;
  perform public.set_service_price(v_var, 25000, v_today - 30, 'Prix de recette');
  perform public.set_service_cost(v_var, 15000, v_today - 30, 'Coût de recette');
  insert into recette_vte values ('guide', v_var);

  -- Une variante INACTIVE, et une variante SANS PRIX, du même service.
  insert into public.service_variants (service_id, label, is_default, is_active)
  values (v_svc, 'Ancienne formule', false, false) returning id into v_var;
  perform public.set_service_price(v_var, 10000, v_today - 30, 'Prix de recette');
  insert into recette_vte values ('guide_inactif', v_var);
  insert into public.service_variants (service_id, label, is_default, is_active)
  values (v_svc, 'Sans prix', false, true) returning id into v_var;
  insert into recette_vte values ('guide_sans_prix', v_var);

  -- Un service d'ACHAT : il ne se vend pas.
  insert into public.services (service_no, label, category_id, purpose, unit_label)
  values (public.next_number('service'), 'Recette VTE — Achat carburant', v_cat, 'PURCHASE', 'plein')
  returning id into v_svc;
  select id into v_var from public.service_variants where service_id = v_svc and is_default;
  -- (Un service d'achat ne porte pas de prix de vente : la nature est refusée d'abord.)
  insert into recette_vte values ('achat', v_var);

  -- Deux caisses, deux comptes de caisse.
  insert into recette_vte values ('caisse', public.create_pos_register('Recette VTE — Comptoir', pg_temp.id_de('cash'), null));
  insert into recette_vte values ('caisse_b', public.create_pos_register('Recette VTE — Annexe', pg_temp.id_de('cash_b'), null));

  raise notice '[OK] 4. Décor : 2 caisses, 1 compte Mvola, 1 banque fermée, 1 client, services SALE/BOTH/PURCHASE, variante inactive et sans prix, hausse datée de demain.';
end $$;


-- =============================================================================
-- LES ACTES ET LA RLS — SOUS LE RÔLE `authenticated`
-- =============================================================================

set local role authenticated;


-- --- 5. UNE VENTE EXIGE UNE SESSION OUVERTE — LA SIENNE -----------------------
do $$
declare
  v_ok int := 0;
begin
  perform pg_temp.agir_comme('caissier');

  -- Sans session : aucune n'existe encore pour lui.
  begin
    perform public.record_pos_sale(gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('transfert'), 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 60000)));
    raise exception 'ÉCHEC : une vente sans session a été encaissée.';
  exception when no_data_found then v_ok := v_ok + 1;
  end;

  insert into recette_vte values ('session', public.open_pos_session(pg_temp.id_de('caisse'), 10000));
  perform pg_temp.valider();

  perform pg_temp.agir_comme('caissier_b');
  insert into recette_vte values ('session_b', public.open_pos_session(pg_temp.id_de('caisse_b'), 0));
  perform pg_temp.valider();

  -- 🟥 B ne vend pas sur la session de A.
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'),
      jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('transfert'), 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 60000)));
    raise exception 'ÉCHEC : un caissier a vendu sur la session d''un autre.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  if v_ok <> 2 then raise exception 'Refus attendus : 2, obtenus %.', v_ok; end if;
  raise notice '[OK] 5. Vente sans session, et sur la session d''un autre : refusées. Deux sessions ouvertes.';
end $$;


-- --- 6. 🟥 LE TEST DE RÉFÉRENCE : 60 000 / 100 000 / 40 000 → TRÉSORERIE 60 000 --
do $$
declare
  v_sale uuid;
begin
  perform pg_temp.agir_comme('caissier');

  v_sale := public.record_pos_sale(
    pg_temp.id_de('session'),
    jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('transfert'), 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 100000)),
    pg_temp.id_de('client'), 0, 'Client pressé');
  perform pg_temp.valider();
  insert into recette_vte values ('vente_ref', v_sale);

  if public.pos_sale_total(v_sale) <> 60000 then
    raise exception 'Net attendu 60 000 (prix d''aujourd''hui, pas celui de demain) ; obtenu %.', public.pos_sale_total(v_sale);
  end if;
  if public.pos_sale_tendered(v_sale) <> 100000 or public.pos_sale_paid(v_sale) <> 60000
     or public.pos_sale_change(v_sale) <> 40000 then
    raise exception 'Donné / encaissé / monnaie : % / % / % (attendu 100 000 / 60 000 / 40 000).',
      public.pos_sale_tendered(v_sale), public.pos_sale_paid(v_sale), public.pos_sale_change(v_sale);
  end if;

  if (select sale_no from public.pos_sales where id = v_sale)
     !~ ('^VTE-' || extract(year from (now() at time zone 'Indian/Comoro'))::int || '-\d{6}$') then
    raise exception 'Numéro de vente inattendu.';
  end if;

  raise notice '[OK] 6. Net 60 000 (D16 : la hausse de demain ne s''applique pas), donné 100 000, encaissé 60 000, monnaie 40 000.';
end $$;

reset role;
do $$ begin perform pg_temp.redevenir_service(); end $$;

do $$
declare
  v_sale uuid := pg_temp.id_de('vente_ref');
  v_n    int;
  v_amt  bigint;
  v_acc  uuid;
begin
  select count(*), max(e.amount), max(e.account_id::text)::uuid into v_n, v_amt, v_acc
  from public.treasury_entries e
  join public.pos_payments p on p.id = e.pos_payment_id
  where p.pos_sale_id = v_sale and e.status = 'VALIDATED';

  if v_n <> 1 or v_amt <> 60000 then
    raise exception '🟥 La trésorerie porte % écriture(s), de % KMF : attendu UNE de 60 000.', v_n, v_amt;
  end if;
  if v_acc <> pg_temp.id_de('cash') then
    raise exception 'D-3 : les espèces ne sont pas entrées sur le compte de la caisse.';
  end if;
  if pg_temp.mouvements(pg_temp.id_de('cash')) <> 60000 then
    raise exception '🟥 Le compte de la caisse a bougé de % KMF : attendu 60 000, jamais 100 000.', pg_temp.mouvements(pg_temp.id_de('cash'));
  end if;
  if not exists (select 1 from public.treasury_entries e join public.pos_payments p on p.id = e.pos_payment_id
                 where p.pos_sale_id = v_sale and e.kind = 'POS_SALE' and e.direction = 'IN'
                   and e.description like '%Espèces%') then
    raise exception 'D-3 : le mode de paiement n''est pas lisible sur l''écriture.';
  end if;

  raise notice '[OK] 6 bis. 🟥 TRÉSORERIE : une écriture POS_SALE de 60 000 sur le compte de la caisse — jamais 100 000.';
end $$;

set local role authenticated;


-- --- 7. 🟥 C-2 — FACTURE SUR DEMANDE : PAYÉE, ET LE SOLDE NE BOUGE PAS -----------
do $$
declare
  v_sale uuid := pg_temp.id_de('vente_ref');
  v_inv  uuid;
  v_ok   boolean := false;
begin
  -- Un caissier ne facture pas : DEC-024, rien n'est contourné.
  perform pg_temp.agir_comme('caissier');
  begin
    perform public.invoice_pos_sale(v_sale);
    raise exception 'ÉCHEC : un caissier sans droit de facturer a facturé.';
  exception when insufficient_privilege then v_ok := true;
  end;

  perform pg_temp.agir_comme('facturier');
  v_inv := public.invoice_pos_sale(v_sale);
  perform pg_temp.valider();
  insert into recette_vte values ('facture_ref', v_inv);

  if (select status from public.customer_invoices where id = v_inv) <> 'ISSUED'
     or (select pos_sale_id from public.customer_invoices where id = v_inv) <> v_sale
     or (select client_id from public.customer_invoices where id = v_inv) <> pg_temp.id_de('client') then
    raise exception 'La facture n''est pas émise, rattachée à la vente, au client de la vente.';
  end if;

  if public.customer_invoice_total(v_inv) <> 60000 or public.customer_invoice_paid(v_inv) <> 60000 then
    raise exception 'Facture : total % / encaissé % (attendu 60 000 / 60 000 — PAYÉE).',
      public.customer_invoice_total(v_inv), public.customer_invoice_paid(v_inv);
  end if;

  -- 🟥 Une vente ne se facture qu'une fois.
  v_ok := false;
  begin
    perform public.invoice_pos_sale(v_sale);
    raise exception 'ÉCHEC : une vente a été facturée deux fois.';
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'Seconde facture non refusée.'; end if;

  raise notice '[OK] 7. Facture sur demande émise, au client de la vente, PAYÉE (60 000 / 60 000) ; une seule facture par vente ; un caissier ne facture pas.';
end $$;

reset role;
do $$ begin perform pg_temp.redevenir_service(); end $$;

do $$
declare
  v_inv uuid := pg_temp.id_de('facture_ref');
  v_n   int;
begin
  -- 🟥 LE SOLDE DU COMPTE RESTE 60 000.
  if pg_temp.mouvements(pg_temp.id_de('cash')) <> 60000 then
    raise exception '🟥 DOUBLE COMPTAGE : après la facture, le compte de la caisse a bougé de % KMF (attendu 60 000).',
      pg_temp.mouvements(pg_temp.id_de('cash'));
  end if;

  -- Le règlement adossé existe, et n'a AUCUNE écriture.
  select count(*) into v_n from public.customer_payments cp
  where cp.customer_invoice_id = v_inv and cp.pos_payment_id is not null and cp.status = 'VALIDATED'
    and cp.amount = 60000 and cp.method = 'CASH';
  if v_n <> 1 then raise exception 'Règlement adossé attendu : 1, obtenu %.', v_n; end if;

  if exists (select 1 from public.treasury_entries e
             join public.customer_payments cp on cp.id = e.customer_payment_id
             where cp.customer_invoice_id = v_inv) then
    raise exception '🟥 Le règlement adossé porte une écriture : l''argent serait compté deux fois.';
  end if;

  -- D-1 sur facture : aucune remise ici, donc aucune ligne DISCOUNT ; une ligne SERVICE tracée.
  if (select count(*) from public.customer_invoice_lines
      where customer_invoice_id = v_inv and kind = 'SERVICE' and service_variant_id = pg_temp.id_de('transfert')) <> 1 then
    raise exception 'La ligne SERVICE de la facture ne reprend pas la variante vendue.';
  end if;

  raise notice '[OK] 7 bis. 🟥 C-2 : solde du compte TOUJOURS 60 000 ; un règlement adossé, sans aucune écriture.';
end $$;


-- --- 8. 🟥 C-2 — ÉCRITURES FORGÉES ET RÈGLEMENTS FICTIFS, REFUSÉS -----------------
--
-- Par la CLÉ DE SERVICE, qui contourne RLS mais jamais les gardes.
do $$
declare
  v_inv  uuid := pg_temp.id_de('facture_ref');
  v_cp   uuid;
  v_pp   uuid;
  v_ok   int := 0;
begin
  select cp.id, cp.pos_payment_id into v_cp, v_pp
  from public.customer_payments cp where cp.customer_invoice_id = v_inv;

  -- a. Une écriture CUSTOMER_PAYMENT sur le règlement adossé.
  begin
    insert into public.treasury_entries (account_id, entry_date, direction, kind, amount, customer_payment_id)
    values (pg_temp.id_de('cash'), current_date, 'IN', 'CUSTOMER_PAYMENT', 60000, v_cp);
    raise exception 'ÉCHEC : une écriture a été forgée sur un règlement adossé.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- b. Une écriture POS_SALE du montant DONNÉ (100 000).
  begin
    insert into public.treasury_entries (account_id, entry_date, direction, kind, amount, pos_payment_id)
    values (pg_temp.id_de('cash'), current_date, 'IN', 'POS_SALE', 100000, v_pp);
    raise exception 'ÉCHEC : une écriture du montant donné a été acceptée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- c. Une SECONDE écriture, exacte, sur le même paiement.
  begin
    insert into public.treasury_entries (account_id, entry_date, direction, kind, amount, pos_payment_id)
    values (pg_temp.id_de('cash'), current_date, 'IN', 'POS_SALE', 60000, v_pp);
    raise exception 'ÉCHEC : un paiement a reçu deux écritures.';
  exception when unique_violation then v_ok := v_ok + 1;
  end;

  -- d. Une écriture POS_SALE sans origine.
  begin
    insert into public.treasury_entries (account_id, entry_date, direction, kind, amount)
    values (pg_temp.id_de('cash'), current_date, 'IN', 'POS_SALE', 60000);
    raise exception 'ÉCHEC : une écriture de vente sans origine a été acceptée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- e. Un règlement adossé inséré DIRECTEMENT (sans aucun drapeau).
  begin
    insert into public.customer_payments
      (payment_no, customer_invoice_id, account_id, amount, received_on, method, pos_payment_id)
    values ('REG-FORGE-ADOSSE', v_inv, pg_temp.id_de('cash'), 1, current_date, 'CASH', v_pp);
    raise exception 'ÉCHEC : un règlement adossé est né par écriture directe.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- f. Même avec le drapeau S-1 posé à la main : l'adossement a SON drapeau.
  perform set_config('adikom.customer_payment', 'on', true);
  begin
    insert into public.customer_payments
      (payment_no, customer_invoice_id, account_id, amount, received_on, method, pos_payment_id)
    values ('REG-FORGE-ADOSSE-2', v_inv, pg_temp.id_de('cash'), 1, current_date, 'CASH', v_pp);
    raise exception 'ÉCHEC : un règlement adossé est né sans la fonction d''adossement.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- g. Et avec les DEUX drapeaux : la garde exige le montant ENCAISSÉ — un
  --    paiement fictif de 1 KMF est refusé (et l'unicité tient, par ailleurs).
  perform set_config('adikom.pos_backed_payment', 'on', true);
  begin
    insert into public.customer_payments
      (payment_no, customer_invoice_id, account_id, amount, received_on, method, pos_payment_id)
    values ('REG-FORGE-ADOSSE-3', v_inv, pg_temp.id_de('cash'), 1, current_date, 'CASH', v_pp);
    raise exception 'ÉCHEC : un règlement adossé fictif a été accepté.';
  exception when check_violation or unique_violation then v_ok := v_ok + 1;
  end;
  perform set_config('adikom.pos_backed_payment', 'off', true);
  perform set_config('adikom.customer_payment', 'off', true);

  -- h. Une vente, des lignes, un paiement insérés directement.
  begin
    insert into public.pos_sales (sale_no, session_id, cashier_id, sale_date)
    values ('VTE-FORGE', pg_temp.id_de('session'), pg_temp.id_de('caissier'),
            (now() at time zone 'Indian/Comoro')::date);
    raise exception 'ÉCHEC : une vente est née par écriture directe.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  if v_ok <> 8 then raise exception 'Refus attendus : 8, obtenus %.', v_ok; end if;
  raise notice '[OK] 8. 🟥 Écriture forgée sur le règlement adossé, du montant donné, en double, sans origine ; règlement adossé direct, fictif ; vente directe : REFUSÉS.';
end $$;


-- --- 9. 🟥 INCOHÉRENCES D'ANNULATION, FERMÉES -----------------------------------
set local role authenticated;

do $$
declare
  v_inv uuid := pg_temp.id_de('facture_ref');
  v_cp  uuid;
  v_ok  int := 0;
begin
  perform pg_temp.agir_comme('responsable');
  select id into v_cp from public.customer_payments where customer_invoice_id = v_inv;

  -- Le responsable PEUT annuler règlements et factures ordinaires (il en a les
  -- capacités) … mais pas le règlement adossé, ni la facture d'une vente.
  begin
    perform public.cancel_customer_payment(v_cp, 'Recette');
    raise exception 'ÉCHEC : un règlement adossé a été annulé seul.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- La facture d'une vente ne s'annule pas (Q-11).
  begin
    perform public.cancel_customer_invoice(v_inv, 'Recette');
    raise exception 'ÉCHEC : la facture d''une vente a été annulée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- 🟥 B-10 : une vente facturée ne s'annule pas.
  begin
    perform public.cancel_pos_sale(pg_temp.id_de('vente_ref'), 'Erreur de saisie');
    raise exception 'ÉCHEC : une vente facturée a été annulée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  if v_ok <> 3 then raise exception 'Refus attendus : 3, obtenus %.', v_ok; end if;
  raise notice '[OK] 9. 🟥 Règlement adossé seul, facture d''une vente, vente facturée (B-10) : aucune annulation possible.';
end $$;


-- --- 10. LES LIGNES : VENDABLES, AU PRIX DU CATALOGUE -----------------------------
do $$
declare
  v_ok int := 0;
  v_cle text;
begin
  perform pg_temp.agir_comme('caissier');

  foreach v_cle in array array['achat', 'guide_inactif', 'guide_sans_prix'] loop
    begin
      perform public.record_pos_sale(pg_temp.id_de('session'),
        jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de(v_cle), 'quantity', 1)),
        jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 100000)));
      raise exception 'ÉCHEC : « % » a été vendu.', v_cle;
    exception when check_violation or no_data_found then v_ok := v_ok + 1;
    end;
  end loop;

  -- Une vente sans ligne.
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'), '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 1000)));
    raise exception 'ÉCHEC : une vente vide a été encaissée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  if v_ok <> 4 then raise exception 'Refus attendus : 4, obtenus %.', v_ok; end if;
  raise notice '[OK] 10. Service d''achat, variante inactive, variante sans prix, vente vide : refusés.';
end $$;


-- --- 11. LA MONNAIE ET LES MODES — PAIEMENT MIXTE (T-2, D-3) ----------------------
do $$
declare
  v_sale uuid;
  v_ok   int := 0;
  v_lines jsonb := jsonb_build_array(
    jsonb_build_object('variant_id', pg_temp.id_de('transfert'), 'quantity', 1),
    jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1));   -- 85 000
begin
  perform pg_temp.agir_comme('caissier');

  -- Montant inférieur, sans demande de crédit : refusé, motif nommé.
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'), v_lines,
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 50000)));
    raise exception 'ÉCHEC : une vente sous-payée a été encaissée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- Mvola au-delà du net : pas de monnaie sur un transfert mobile.
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'), v_lines,
      jsonb_build_array(jsonb_build_object('method', 'MVOLA', 'tendered', 90000, 'account_id', pg_temp.id_de('mvola'))));
    raise exception 'ÉCHEC : de la monnaie a été rendue sur un paiement Mvola.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- 🟥 D-3 : Mvola dans un compte de CAISSE.
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'), v_lines,
      jsonb_build_array(jsonb_build_object('method', 'MVOLA', 'tendered', 85000, 'account_id', pg_temp.id_de('cash_b'))));
    raise exception 'ÉCHEC : un paiement Mvola est entré dans une caisse.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- D-3 : un compte bancaire INACTIF ; un paiement hors espèces SANS compte.
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'), v_lines,
      jsonb_build_array(jsonb_build_object('method', 'CHEQUE', 'tendered', 85000, 'account_id', pg_temp.id_de('bank_off'))));
    raise exception 'ÉCHEC : un compte inactif a reçu un paiement.';
  exception when check_violation then v_ok := v_ok + 1;
  end;
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'), v_lines,
      jsonb_build_array(jsonb_build_object('method', 'HOLO', 'tendered', 85000)));
    raise exception 'ÉCHEC : un paiement Holo sans compte a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- Deux remises d'espèces ; un mode non admis au comptoir.
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'), v_lines,
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 50000),
                        jsonb_build_object('method', 'CASH', 'tendered', 50000)));
    raise exception 'ÉCHEC : deux remises d''espèces ont été acceptées.';
  exception when check_violation then v_ok := v_ok + 1;
  end;
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'), v_lines,
      jsonb_build_array(jsonb_build_object('method', 'BANK_TRANSFER', 'tendered', 85000, 'account_id', pg_temp.id_de('mvola'))));
    raise exception 'ÉCHEC : un virement a été accepté au comptoir.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- ✅ MIXTE : Mvola 50 000 + espèces 50 000 → espèces encaissées 35 000, monnaie 15 000.
  v_sale := public.record_pos_sale(pg_temp.id_de('session'), v_lines,
    jsonb_build_array(
      jsonb_build_object('method', 'MVOLA', 'tendered', 50000, 'account_id', pg_temp.id_de('mvola'), 'external_ref', 'MV-RECETTE-1'),
      jsonb_build_object('method', 'CASH', 'tendered', 50000)));
  perform pg_temp.valider();
  insert into recette_vte values ('vente_mixte', v_sale);

  if public.pos_sale_total(v_sale) <> 85000 or public.pos_sale_paid(v_sale) <> 85000
     or public.pos_sale_change(v_sale) <> 15000 then
    raise exception 'Mixte : net % / encaissé % / monnaie % (attendu 85 000 / 85 000 / 15 000).',
      public.pos_sale_total(v_sale), public.pos_sale_paid(v_sale), public.pos_sale_change(v_sale);
  end if;

  if v_ok <> 7 then raise exception 'Refus attendus : 7, obtenus %.', v_ok; end if;
  raise notice '[OK] 11. Sous-payée, monnaie hors espèces, Mvola en caisse, compte inactif ou absent, deux remises d''espèces, virement : refusés. Mixte 50 000 Mvola + 50 000 espèces → 85 000 encaissés, monnaie 15 000.';
end $$;

reset role;
do $$ begin perform pg_temp.redevenir_service(); end $$;

do $$
declare
  v_sale uuid := pg_temp.id_de('vente_mixte');
begin
  -- T-2 : DEUX écritures, une par paiement, chacune sur SON compte.
  if (select count(*) from public.treasury_entries e join public.pos_payments p on p.id = e.pos_payment_id
      where p.pos_sale_id = v_sale and e.status = 'VALIDATED') <> 2 then
    raise exception 'T-2 : un paiement mixte doit produire deux écritures.';
  end if;
  if not exists (select 1 from public.treasury_entries e join public.pos_payments p on p.id = e.pos_payment_id
                 where p.pos_sale_id = v_sale and e.account_id = pg_temp.id_de('mvola')
                   and e.amount = 50000 and e.description like '%Mvola%' and e.reference = 'MV-RECETTE-1')
     or not exists (select 1 from public.treasury_entries e join public.pos_payments p on p.id = e.pos_payment_id
                    where p.pos_sale_id = v_sale and e.account_id = pg_temp.id_de('cash') and e.amount = 35000) then
    raise exception 'T-2 / D-3 : 50 000 sur Mvola et 35 000 dans la caisse attendus.';
  end if;

  if pg_temp.mouvements(pg_temp.id_de('cash')) <> 95000 or pg_temp.mouvements(pg_temp.id_de('mvola')) <> 50000 then
    raise exception 'Soldes : caisse % (attendu 95 000), Mvola % (attendu 50 000).',
      pg_temp.mouvements(pg_temp.id_de('cash')), pg_temp.mouvements(pg_temp.id_de('mvola'));
  end if;

  -- La contrainte de la monnaie, éprouvée HORS des fonctions (drapeau posé).
  perform set_config('adikom.pos_sale', 'on', true);
  begin
    insert into public.pos_payments
      (pos_sale_id, line_no, session_id, cashier_id, method, tendered_amount, applied_amount, account_id)
    values (v_sale, 9, pg_temp.id_de('session'), pg_temp.id_de('caissier'), 'MVOLA', 20000, 10000, pg_temp.id_de('mvola'));
    raise exception 'ÉCHEC : la base a accepté de la monnaie sur un paiement Mvola.';
  exception when check_violation then null;
  end;
  begin
    insert into public.pos_payments
      (pos_sale_id, line_no, session_id, cashier_id, method, tendered_amount, applied_amount, account_id)
    values (v_sale, 9, pg_temp.id_de('session'), pg_temp.id_de('caissier'), 'CASH', 10000, 20000, pg_temp.id_de('cash'));
    raise exception 'ÉCHEC : la base a accepté un encaissé supérieur au donné.';
  exception when check_violation then null;
  end;
  perform set_config('adikom.pos_sale', 'off', true);

  raise notice '[OK] 11 bis. T-2 : une écriture par paiement — 50 000 sur Mvola (mode et référence lisibles), 35 000 en caisse. Contraintes de la monnaie tenues EN BASE.';
end $$;

set local role authenticated;


-- --- 12. 🟥 D-1 — LES REMISES ---------------------------------------------------
do $$
declare
  v_sale uuid;
  v_ok   int := 0;
  v_lines jsonb := jsonb_build_array(
    jsonb_build_object('variant_id', pg_temp.id_de('transfert'), 'quantity', 1, 'discount', 10000),
    jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1));
begin
  -- Un caissier sans `pos.sales.discount` : refusé, ligne ou globale.
  perform pg_temp.agir_comme('caissier');
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'), v_lines,
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 75000)));
    raise exception 'ÉCHEC : une remise de ligne sans capacité.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'),
      jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 25000)), null, 5000);
    raise exception 'ÉCHEC : une remise globale sans capacité.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- Le remiseur ouvre sa session sur la caisse B ? Non : B y est. Il vend sur la
  -- caisse A après fermeture… plus simple — il ouvre la caisse B après B.
  perform pg_temp.agir_comme('caissier_b');
  perform public.close_pos_session(pg_temp.id_de('session_b'), 0, 'Passe la main');
  perform pg_temp.valider();

  perform pg_temp.agir_comme('remiseur');
  insert into recette_vte values ('session_r', public.open_pos_session(pg_temp.id_de('caisse_b'), 0));

  -- Bornes DEC-051 §d.
  begin
    perform public.record_pos_sale(pg_temp.id_de('session_r'),
      jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1, 'discount', 30000)),
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 1000)));
    raise exception 'ÉCHEC : une remise de ligne supérieure au brut.';
  exception when check_violation then v_ok := v_ok + 1;
  end;
  begin
    perform public.record_pos_sale(pg_temp.id_de('session_r'),
      jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1, 'discount', -1)),
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 25001)));
    raise exception 'ÉCHEC : une remise négative.';
  exception when check_violation then v_ok := v_ok + 1;
  end;
  begin
    perform public.record_pos_sale(pg_temp.id_de('session_r'),
      jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 1000)), null, 30000);
    raise exception 'ÉCHEC : une remise globale supérieure au sous-total.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- ✅ 60 000 − 10 000 + 25 000 − 5 000 (globale) = 70 000, SOLDÉE.
  v_sale := public.record_pos_sale(pg_temp.id_de('session_r'), v_lines,
    jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 70000)),
    pg_temp.id_de('client'), 5000);
  perform pg_temp.valider();
  insert into recette_vte values ('vente_remise', v_sale);

  if public.pos_sale_subtotal(v_sale) <> 75000 or public.pos_sale_total(v_sale) <> 70000
     or public.pos_sale_paid(v_sale) <> 70000 then
    raise exception 'Remises : sous-total % / net % / encaissé % (attendu 75 000 / 70 000 / 70 000).',
      public.pos_sale_subtotal(v_sale), public.pos_sale_total(v_sale), public.pos_sale_paid(v_sale);
  end if;

  -- ✅ Remise TOTALE : net 0, aucun paiement — DEC-051 n'a pas de plafond (Q-15).
  v_sale := public.record_pos_sale(pg_temp.id_de('session_r'),
    jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1, 'discount', 25000)),
    '[]'::jsonb, pg_temp.id_de('client'));
  perform pg_temp.valider();
  insert into recette_vte values ('vente_offerte', v_sale);
  if public.pos_sale_total(v_sale) <> 0 then raise exception 'La vente offerte n''a pas un net nul.'; end if;

  if v_ok <> 5 then raise exception 'Refus attendus : 5, obtenus %.', v_ok; end if;
  raise notice '[OK] 12. D-1 : remises refusées sans capacité, hors bornes, négatives ; 75 000 − 5 000 = 70 000 soldée ; remise totale acceptée (net 0).';
end $$;


-- --- 13. D-1 SUR FACTURE — des lignes DISCOUNT libellées, le même net ----------------
do $$
declare
  v_inv uuid;
  v_ok  boolean := false;
begin
  perform pg_temp.agir_comme('facturier');
  v_inv := public.invoice_pos_sale(pg_temp.id_de('vente_remise'));
  perform pg_temp.valider();

  if public.customer_invoice_total(v_inv) <> 70000 or public.customer_invoice_paid(v_inv) <> 70000 then
    raise exception 'Facture avec remises : total % / encaissé %.', public.customer_invoice_total(v_inv), public.customer_invoice_paid(v_inv);
  end if;
  if (select count(*) from public.customer_invoice_lines where customer_invoice_id = v_inv and kind = 'DISCOUNT') <> 2
     or not exists (select 1 from public.customer_invoice_lines
                    where customer_invoice_id = v_inv and kind = 'DISCOUNT' and label = 'Remise globale' and unit_price = 5000)
     or not exists (select 1 from public.customer_invoice_lines
                    where customer_invoice_id = v_inv and kind = 'DISCOUNT' and label like 'Remise sur %' and unit_price = 10000) then
    raise exception 'Les remises ne sont pas des lignes DISCOUNT libellées.';
  end if;

  -- Une vente de net nul ne se facture pas.
  begin
    perform public.invoice_pos_sale(pg_temp.id_de('vente_offerte'));
    raise exception 'ÉCHEC : une créance de zéro a été facturée.';
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'Facture de net nul non refusée.'; end if;

  raise notice '[OK] 13. Facture d''une vente remisée : 70 000, deux lignes DISCOUNT libellées (de ligne, globale), PAYÉE ; net nul : non facturable.';
end $$;


-- --- 14. 🟥 P-4 — LA VENTE NON SOLDÉE --------------------------------------------
do $$
declare
  v_sale uuid;
  v_inv  uuid;
  v_ok   int := 0;
  v_lines jsonb := jsonb_build_array(
    jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 4));   -- 100 000
  v_cash  jsonb := jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 30000));
begin
  -- Sans `pos.sales.credit` (le remiseur ne l'a pas).
  perform pg_temp.agir_comme('remiseur');
  begin
    perform public.record_pos_sale(pg_temp.id_de('session_r'), v_lines, v_cash, pg_temp.id_de('client'), 0, null, true);
    raise exception 'ÉCHEC : une vente non soldée sans capacité.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- Le responsable ouvre sa session sur la caisse de A, une fois A parti.
  perform pg_temp.agir_comme('remiseur');
  perform public.close_pos_session(pg_temp.id_de('session_r'), 70000, null);
  perform pg_temp.valider();

  perform pg_temp.agir_comme('responsable');
  insert into recette_vte values ('session_resp', public.open_pos_session(pg_temp.id_de('caisse_b'), 5000));

  -- Sans client : refusée, même avec la capacité.
  begin
    perform public.record_pos_sale(pg_temp.id_de('session_resp'), v_lines, v_cash, null, 0, null, true);
    raise exception 'ÉCHEC : une vente non soldée anonyme.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- ✅ Avec client : la facture naît, émise, dans la même transaction.
  v_sale := public.record_pos_sale(pg_temp.id_de('session_resp'), v_lines, v_cash,
    pg_temp.id_de('client'), 0, 'Solde à 30 jours', true,
    (now() at time zone 'Indian/Comoro')::date + 30);
  perform pg_temp.valider();
  insert into recette_vte values ('vente_credit', v_sale);

  select id into v_inv from public.customer_invoices where pos_sale_id = v_sale and status <> 'CANCELLED';
  insert into recette_vte values ('facture_credit', v_inv);

  if v_inv is null or (select status from public.customer_invoices where id = v_inv) <> 'ISSUED' then
    raise exception 'P-4 : la vente non soldée ne porte pas sa facture émise.';
  end if;
  if public.customer_invoice_total(v_inv) <> 100000 or public.customer_invoice_paid(v_inv) <> 30000 then
    raise exception 'P-4 : facture % / encaissé % (attendu 100 000 / 30 000 — reste dû 70 000).',
      public.customer_invoice_total(v_inv), public.customer_invoice_paid(v_inv);
  end if;

  -- Le règlement ULTÉRIEUR est ordinaire : il produit SON écriture.
  perform public.record_customer_payment(v_inv, pg_temp.id_de('mvola'), 70000,
    (now() at time zone 'Indian/Comoro')::date, 'MVOLA', 'MV-SOLDE', 'Solde de la vente');
  perform pg_temp.valider();

  if public.customer_invoice_paid(v_inv) <> 100000 then
    raise exception 'Le règlement ultérieur n''a pas soldé la facture.';
  end if;

  if v_ok <> 2 then raise exception 'Refus attendus : 2, obtenus %.', v_ok; end if;
  raise notice '[OK] 14. P-4 : sans capacité, sans client — refusée ; avec client : facture 100 000 émise, 30 000 adossés, 70 000 dus puis réglés en Mvola (D-2) par la chaîne ordinaire.';
end $$;

reset role;
do $$ begin perform pg_temp.redevenir_service(); end $$;

do $$
declare
  v_sale uuid := pg_temp.id_de('vente_credit');
  v_inv  uuid := pg_temp.id_de('facture_credit');
begin
  -- Trésorerie : 30 000 POS_SALE dans la caisse B, 70 000 CUSTOMER_PAYMENT sur Mvola.
  if (select count(*) from public.treasury_entries e join public.pos_payments p on p.id = e.pos_payment_id
      where p.pos_sale_id = v_sale and e.amount = 30000 and e.account_id = pg_temp.id_de('cash_b')) <> 1 then
    raise exception 'P-4 : l''acompte au comptoir n''a pas son écriture POS_SALE de 30 000.';
  end if;
  if (select count(*) from public.treasury_entries e join public.customer_payments cp on cp.id = e.customer_payment_id
      where cp.customer_invoice_id = v_inv) <> 1 then
    raise exception 'P-4 : seul le règlement ultérieur doit porter une écriture CUSTOMER_PAYMENT.';
  end if;
  if pg_temp.mouvements(pg_temp.id_de('mvola')) <> 120000 then
    raise exception 'Le compte Mvola a bougé de % (attendu 50 000 + 70 000).', pg_temp.mouvements(pg_temp.id_de('mvola'));
  end if;

  -- D-2 : Mvola est bien un mode de règlement client.
  if not exists (select 1 from public.customer_payments where customer_invoice_id = v_inv and method = 'MVOLA' and pos_payment_id is null) then
    raise exception 'D-2 : le règlement client Mvola est absent.';
  end if;

  -- 🟥 P-4 EN BASE : hors fonction (drapeau posé), une vente non soldée sans client
  -- est refusée par le contrôle différé.
  perform set_config('adikom.pos_sale', 'on', true);
  begin
    insert into public.pos_sales (sale_no, session_id, cashier_id, sale_date)
    values ('VTE-FORGE-P4', pg_temp.id_de('session_resp'), pg_temp.id_de('responsable'),
            (now() at time zone 'Indian/Comoro')::date);
    perform pg_temp.valider();
    raise exception 'ÉCHEC : une vente sans ligne a passé le contrôle différé.';
  exception when check_violation then null;
  end;
  perform set_config('adikom.pos_sale', 'off', true);

  raise notice '[OK] 14 bis. P-4 : 30 000 POS_SALE en caisse, 70 000 CUSTOMER_PAYMENT sur Mvola, aucune autre écriture ; le contrôle différé tient la vente hors fonction.';
end $$;

set local role authenticated;


-- --- 15. 🟥 B-10 — ANNULER UNE VENTE NON FACTURÉE ----------------------------------
do $$
declare
  v_sale uuid := pg_temp.id_de('vente_mixte');
  v_ok   int := 0;
begin
  -- Le caissier n'annule pas ; l'annuleur sans lecture des écritures non plus.

  perform pg_temp.agir_comme('caissier');
  begin
    perform public.cancel_pos_sale(v_sale, 'Erreur');
    raise exception 'ÉCHEC : un caissier a annulé une vente.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  perform pg_temp.agir_comme('annuleur_aveugle');
  begin
    perform public.cancel_pos_sale(v_sale, 'Erreur');
    raise exception 'ÉCHEC : une vente a été annulée sans lecture des écritures.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  perform pg_temp.agir_comme('responsable');
  begin
    perform public.cancel_pos_sale(v_sale, '   ');
    raise exception 'ÉCHEC : une annulation sans motif.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- 🟥 L'écriture d'un paiement VIVANT ne s'annule pas par PATCH direct.
  begin
    update public.treasury_entries set status = 'CANCELLED'
     where pos_payment_id in (select id from public.pos_payments where pos_sale_id = v_sale);
    perform pg_temp.valider();
    raise exception 'ÉCHEC : l''écriture d''un paiement vivant a été annulée seule.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- Ni la vente par PATCH direct.
  begin
    update public.pos_sales set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'PATCH'
     where id = v_sale;
    raise exception 'ÉCHEC : une vente a été annulée par écriture directe.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- ✅ L'annulation légitime.
  perform public.cancel_pos_sale(v_sale, 'Erreur de saisie : client parti');
  perform pg_temp.valider();

  if (select status from public.pos_sales where id = v_sale) <> 'CANCELLED'
     or exists (select 1 from public.pos_payments where pos_sale_id = v_sale and status <> 'CANCELLED')
     or public.pos_sale_paid(v_sale) <> 0 then
    raise exception 'La vente ou ses paiements ne sont pas annulés.';
  end if;

  begin
    perform public.cancel_pos_sale(v_sale, 'Encore');
    raise exception 'ÉCHEC : une vente annulée deux fois.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  if v_ok <> 6 then raise exception 'Refus attendus : 6, obtenus %.', v_ok; end if;
  raise notice '[OK] 15. B-10 : caissier, annuleur sans lecture des écritures, motif vide, PATCH sur l''écriture ou la vente : refusés ; annulation motivée faite ; pas deux fois.';
end $$;

reset role;
do $$ begin perform pg_temp.redevenir_service(); end $$;

do $$
declare
  v_sale uuid := pg_temp.id_de('vente_mixte');
begin
  if exists (select 1 from public.treasury_entries e join public.pos_payments p on p.id = e.pos_payment_id
             where p.pos_sale_id = v_sale and e.status <> 'CANCELLED') then
    raise exception 'Une écriture de la vente annulée reste validée.';
  end if;
  -- Ses écritures, et elles seules : la vente de référence garde la sienne.
  if pg_temp.mouvements(pg_temp.id_de('cash')) <> 60000 or pg_temp.mouvements(pg_temp.id_de('mvola')) <> 70000 then
    raise exception 'Soldes après annulation : caisse % (attendu 60 000), Mvola % (attendu 70 000).',
      pg_temp.mouvements(pg_temp.id_de('cash')), pg_temp.mouvements(pg_temp.id_de('mvola'));
  end if;
  if (select count(*) from public.treasury_entries e join public.pos_payments p on p.id = e.pos_payment_id
      where p.pos_sale_id = v_sale) <> 2 then
    raise exception 'Une écriture a été effacée : on annule, on n''efface pas.';
  end if;
  if (select cancel_reason from public.pos_sales where id = v_sale) <> 'Erreur de saisie : client parti' then
    raise exception 'Le motif n''est pas conservé.';
  end if;

  raise notice '[OK] 15 bis. Écritures de la vente annulée : annulées, conservées ; celles des autres ventes intactes ; soldes revenus.';
end $$;

set local role authenticated;


-- --- 16. THÉORIQUE = FOND + ESPÈCES ; ANNULATION APRÈS CLÔTURE (B-10) ------------------
do $$
declare
  v_sale uuid;
  v_exp  bigint;
begin
  perform pg_temp.agir_comme('caissier');

  -- Session A : fond 10 000 ; espèces encaissées valides : 60 000 (référence).
  -- La vente mixte (35 000 en espèces) est annulée ; le Mvola n'entre jamais.
  v_exp := public.pos_session_expected(pg_temp.id_de('session'));
  if v_exp <> 70000 then
    raise exception 'Théorique de A : % (attendu 10 000 + 60 000 = 70 000).', v_exp;
  end if;

  -- Une dernière vente en espèces, puis la clôture.
  v_sale := public.record_pos_sale(pg_temp.id_de('session'),
    jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 30000)));
  perform pg_temp.valider();
  insert into recette_vte values ('vente_tardive', v_sale);

  if public.pos_session_expected(pg_temp.id_de('session')) <> 95000 then
    raise exception 'Théorique après la vente : % (attendu 95 000).', public.pos_session_expected(pg_temp.id_de('session'));
  end if;

  perform public.close_pos_session(pg_temp.id_de('session'), 95000, 'Juste');
  perform pg_temp.valider();
  if public.pos_session_variance(pg_temp.id_de('session')) <> 0 then
    raise exception 'Écart attendu 0.';
  end if;

  -- Vente sur session CLOSE : refusée.
  begin
    perform public.record_pos_sale(pg_temp.id_de('session'),
      jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 30000)));
    raise exception 'ÉCHEC : une vente sur une session close.';
  exception when check_violation then null;
  end;

  -- 🟥 B-10 : la vente d'une session CLOSE s'annule ; l'écart CHANGE.
  perform pg_temp.agir_comme('responsable');
  perform public.cancel_pos_sale(v_sale, 'Erreur constatée après clôture');
  perform pg_temp.valider();

  if public.pos_session_expected(pg_temp.id_de('session')) <> 70000
     or public.pos_session_variance(pg_temp.id_de('session')) <> 25000 then
    raise exception 'Après annulation : théorique % / écart % (attendu 70 000 / +25 000).',
      public.pos_session_expected(pg_temp.id_de('session')), public.pos_session_variance(pg_temp.id_de('session'));
  end if;

  raise notice '[OK] 16. Théorique = fond + espèces encaissées (Mvola exclu, vente annulée exclue) ; session close : vente refusée, annulation possible, écart dérivé +25 000.';
end $$;


-- --- 17. PERMISSIONS — LECTURES, ANTI-VACUITÉ ---------------------------------------
do $$
declare
  v_n int;
begin
  -- Le lecteur voit les ventes, n'encaisse pas.
  perform pg_temp.agir_comme('lecteur');
  select count(*) into v_n from public.pos_sales where id = pg_temp.id_de('vente_ref');
  if v_n <> 1 then raise exception 'Le lecteur ne voit pas la vente.'; end if;
  begin
    perform public.record_pos_sale(pg_temp.id_de('session_resp'),
      jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 25000)));
    raise exception 'ÉCHEC : pos.sales.view a permis d''encaisser.';
  exception when insufficient_privilege then null;
  end;

  -- 🟥 Le coût copié : le responsable le voit (sa vente en porte un) …
  perform pg_temp.agir_comme('responsable');
  select count(*) into v_n from public.commercial_line_costs c
  join public.pos_sale_lines l on l.id = c.pos_sale_line_id;
  if v_n = 0 then raise exception 'Le responsable ne voit aucun coût copié.'; end if;
  -- … le caissier ne copie pas ce qu'il ne lit pas (Q-13) : sa vente n'en a pas.
  if exists (select 1 from public.commercial_line_costs c
             join public.pos_sale_lines l on l.id = c.pos_sale_line_id
             where l.pos_sale_id = pg_temp.id_de('vente_mixte')) then
    raise exception 'Un coût a été copié par un vendeur qui ne pouvait pas le lire.';
  end if;

  -- … et le lecteur des ventes ne lit AUCUN coût.
  perform pg_temp.agir_comme('lecteur');
  if exists (select 1 from public.commercial_line_costs) then
    raise exception '🟥 pos.sales.view ouvre le coût copié (DEC-049 §e).';
  end if;

  -- Le profil minimal ne voit rien.
  perform pg_temp.agir_comme('minimal');
  if exists (select 1 from public.pos_sales) or exists (select 1 from public.pos_payments)
     or exists (select 1 from public.pos_sale_lines) then
    raise exception 'Le profil minimal lit les ventes.';
  end if;

  raise notice '[OK] 17. Lecteur : voit, n''encaisse pas ; coût copié lu par cost.view seule, jamais copié à l''aveugle ; profil minimal : rien.';
end $$;

reset role;
do $$ begin perform pg_temp.redevenir_service(); end $$;


-- --- 18. Q-12 — LA LECTURE PAR LIGNE DES PAIEMENTS ----------------------------------
do $$
declare
  v_id uuid := gen_random_uuid();
  v_n  int;
begin
  -- Un compte qui ne lit QUE les montants de session (aucune capacité de vente).
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'recette.vte.montants@adikom.test', now(), now());
  insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
  values (v_id, 'Recette', 'Vente montants', 'recette.vte.montants', 'recette.vte.montants@adikom.test', 'ACTIVE', false);
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_id, p.id, 'ALLOW' from public.permissions p
  where p.code in ('pos.sessions.view', 'pos.sessions.amounts.view');
  insert into recette_vte values ('montants', v_id);
end $$;

set local role authenticated;

do $$
declare
  v_n int;
begin
  perform pg_temp.agir_comme('montants');
  -- Il ne voit AUCUNE vente…
  if exists (select 1 from public.pos_sales) then
    raise exception 'amounts.view ouvre les ventes.';
  end if;
  -- … mais les paiements qui composent les montants de session, et donc le théorique exact.
  select count(*) into v_n from public.pos_payments where session_id = pg_temp.id_de('session');
  if v_n = 0 then raise exception 'Q-12 : le lecteur des montants ne voit pas les espèces de la session.'; end if;
  if public.pos_session_expected(pg_temp.id_de('session')) <> 70000 then
    raise exception 'Q-12 : théorique faux pour le lecteur des montants : %.', public.pos_session_expected(pg_temp.id_de('session'));
  end if;

  raise notice '[OK] 18. Q-12 : pos.sessions.amounts.view lit les paiements (théorique exact, 70 000), jamais les ventes.';
end $$;

reset role;
do $$ begin perform pg_temp.redevenir_service(); end $$;


-- --- 19. LE JOURNAL — CREATE, CANCEL, MODE ET COMPTE ---------------------------------
do $$
declare
  v_sale uuid := pg_temp.id_de('vente_mixte');
begin
  if not exists (select 1 from public.audit_log
                 where entity_type = 'pos_sales' and entity_id = v_sale::text and action = 'CREATE' and module_code = 'pos') then
    raise exception 'La création de la vente n''est pas journalisée.';
  end if;
  if not exists (select 1 from public.audit_log
                 where entity_type = 'pos_sales' and entity_id = v_sale::text and action = 'CANCEL'
                   and (after_data ->> 'cancel_reason') = 'Erreur de saisie : client parti') then
    raise exception 'L''annulation n''est pas journalisée CANCEL avec son motif.';
  end if;
  if not exists (select 1 from public.audit_log a
                 join public.pos_payments p on p.id::text = a.entity_id
                 where a.entity_type = 'pos_payments' and p.pos_sale_id = v_sale and a.action = 'CREATE'
                   and (a.after_data ->> 'method') = 'MVOLA' and (a.after_data ->> 'account_id') = pg_temp.id_de('mvola')::text) then
    raise exception 'D-3 : le mode et le compte du paiement ne sont pas lisibles dans le journal.';
  end if;

  raise notice '[OK] 19. Journal : vente CREATE, annulation CANCEL avec motif, paiement avec mode et compte (D-3).';
end $$;


-- --- 21. Q-10 — FACTURER UNE VENTE ANONYME : UN CLIENT, UNE FOIS -----------------
-- Décor (service) : un second client, et un valoriste des coûts pour le §22.
do $$
declare
  v_id uuid;
begin
  insert into public.clients (client_no, type, legal_name, phone, status)
  values (public.next_number('client'), 'COMPANY', 'RECETTE VTE AUTRE SARL', '+269 300 00 02', 'ACTIVE')
  returning id into v_id;
  insert into recette_vte values ('client2', v_id);

  v_id := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'recette.vte.valoriste@adikom.test', now(), now());
  insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
  values (v_id, 'Recette', 'Vente valoriste', 'recette.vte.valoriste', 'recette.vte.valoriste@adikom.test', 'ACTIVE', false);
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_id, p.id, 'ALLOW' from public.permissions p
  where p.code in ('pos.sales.view', 'catalog.services.cost.view', 'catalog.services.cost.update');
  insert into recette_vte values ('valoriste', v_id);
end $$;

set local role authenticated;

do $$
declare
  v_sale uuid;
  v_ok   int := 0;
begin
  -- Une vente ANONYME, soldée, par un caissier qui ne lit pas les coûts.
  perform pg_temp.agir_comme('caissier');
  insert into recette_vte values ('session_q10', public.open_pos_session(pg_temp.id_de('caisse'), 0));
  perform pg_temp.valider();
  v_sale := public.record_pos_sale(pg_temp.id_de('session_q10'),
    jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id_de('guide'), 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'CASH', 'tendered', 25000)));
  perform pg_temp.valider();
  insert into recette_vte values ('vente_anonyme', v_sale);

  -- Sans client choisi : refusée, comme avant Q-10.
  perform pg_temp.agir_comme('facturier');
  begin
    perform public.invoice_pos_sale(v_sale);
    raise exception 'ÉCHEC : une vente anonyme a été facturée sans client.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- Le caissier, qui ne facture pas, ne rattache pas non plus.
  perform pg_temp.agir_comme('caissier');
  begin
    perform public.invoice_pos_sale(v_sale, null, pg_temp.id_de('client'));
    raise exception 'ÉCHEC : un caissier a rattaché un client en facturant.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- 🟥 Écriture directe du client, même par qui facture : refusée.
  perform pg_temp.agir_comme('facturier');
  begin
    update public.pos_sales set client_id = pg_temp.id_de('client') where id = v_sale;
    raise exception 'ÉCHEC : le client d''une vente a été écrit directement.';
  exception when check_violation or insufficient_privilege then v_ok := v_ok + 1;
  end;

  if v_ok <> 3 then raise exception 'Refus attendus : 3, obtenus %.', v_ok; end if;
  if (select client_id from public.pos_sales where id = v_sale) is not null then
    raise exception 'Un refus a laissé un client sur la vente.';
  end if;
end $$;

reset role;
do $$ begin perform pg_temp.redevenir_service(); end $$;

do $$
declare
  v_sale uuid := pg_temp.id_de('vente_anonyme');
  v_ok   boolean := false;
begin
  -- 🟥 Le drapeau de la vente SEUL ne suffit pas : la garde exige celui du rattachement.
  perform set_config('adikom.pos_sale', 'on', true);
  begin
    update public.pos_sales set client_id = pg_temp.id_de('client') where id = v_sale;
    raise exception 'ÉCHEC : le client a été rattaché hors de invoice_pos_sale.';
  exception when check_violation then v_ok := true;
  end;
  perform set_config('adikom.pos_sale', 'off', true);
  if not v_ok then raise exception 'Rattachement hors fonction non refusé.'; end if;

  -- Mesures AVANT : solde de la caisse et écritures de la vente.
  create temporary table q10_mesure on commit drop as
    select pg_temp.mouvements(pg_temp.id_de('cash')) as solde,
           (select count(*) from public.treasury_entries e join public.pos_payments p on p.id = e.pos_payment_id
             where p.pos_sale_id = v_sale) as ecritures,
           (select count(*) from public.treasury_entries) as toutes;
end $$;

set local role authenticated;

do $$
declare
  v_sale uuid := pg_temp.id_de('vente_anonyme');
  v_inv  uuid;
  v_ok   boolean := false;
begin
  perform pg_temp.agir_comme('facturier');
  v_inv := public.invoice_pos_sale(v_sale, null, pg_temp.id_de('client'));
  perform pg_temp.valider();

  if (select client_id from public.pos_sales where id = v_sale) <> pg_temp.id_de('client')
     or (select client_id from public.customer_invoices where id = v_inv) <> pg_temp.id_de('client')
     or (select pos_sale_id from public.customer_invoices where id = v_inv) <> v_sale
     or (select status from public.customer_invoices where id = v_inv) <> 'ISSUED' then
    raise exception 'Q-10 : la facture n''est pas émise au client rattaché, liée à la vente.';
  end if;
  if public.pos_sale_total(v_sale) <> 25000 or public.pos_sale_paid(v_sale) <> 25000
     or public.customer_invoice_total(v_inv) <> 25000 or public.customer_invoice_paid(v_inv) <> 25000 then
    raise exception 'Q-10 : les montants ont bougé (vente % / %, facture % / %).',
      public.pos_sale_total(v_sale), public.pos_sale_paid(v_sale),
      public.customer_invoice_total(v_inv), public.customer_invoice_paid(v_inv);
  end if;

  -- Une fois : ni seconde facture, ni autre client.
  begin
    perform public.invoice_pos_sale(v_sale, null, pg_temp.id_de('client2'));
    raise exception 'ÉCHEC : une vente rattachée a été refacturée à un autre client.';
  exception when unique_violation or check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'Second rattachement non refusé.'; end if;
end $$;

reset role;
do $$ begin perform pg_temp.redevenir_service(); end $$;

do $$
declare
  v_sale uuid := pg_temp.id_de('vente_anonyme');
  m      record;
  v_ok   boolean := false;
begin
  select * into m from q10_mesure;
  -- 🟥 C-2 : aucune écriture de plus, solde inchangé.
  if pg_temp.mouvements(pg_temp.id_de('cash')) <> m.solde
     or (select count(*) from public.treasury_entries) <> m.toutes
     or (select count(*) from public.treasury_entries e join public.pos_payments p on p.id = e.pos_payment_id
          where p.pos_sale_id = v_sale) <> 1 then
    raise exception '🟥 Q-10 : la facture d''une vente anonyme a mouvementé la trésorerie.';
  end if;

  -- Le client rattaché ne se remplace pas, même sous les deux drapeaux.
  perform set_config('adikom.pos_sale', 'on', true);
  perform set_config('adikom.pos_client_attach', 'on', true);
  begin
    update public.pos_sales set client_id = pg_temp.id_de('client2') where id = v_sale;
    raise exception 'ÉCHEC : le client rattaché a été remplacé.';
  exception when check_violation then v_ok := true;
  end;
  perform set_config('adikom.pos_client_attach', 'off', true);
  perform set_config('adikom.pos_sale', 'off', true);
  if not v_ok then raise exception 'Remplacement du client non refusé.'; end if;

  -- Journalisé : avant sans client, après avec.
  if not exists (select 1 from public.audit_log
                 where entity_type = 'pos_sales' and entity_id = v_sale::text and action = 'UPDATE'
                   and (before_data ->> 'client_id') is null
                   and (after_data ->> 'client_id') = pg_temp.id_de('client')::text) then
    raise exception 'Q-10 : le rattachement du client n''est pas journalisé.';
  end if;

  raise notice '[OK] 21. Q-10 : vente anonyme facturée au client choisi, une fois ; refus sans client, au caissier, en écriture directe, hors drapeau, en remplacement ; montants et trésorerie inchangés ; journalisé.';
end $$;


-- --- 22. Q-13 — VALORISER APRÈS COUP, AU COÛT DU JOUR DE LA VENTE -------------------
do $$
begin
  -- Un nouveau coût, en vigueur DEMAIN : il ne doit jamais valoriser la vente d'aujourd'hui.
  perform public.set_service_cost(pg_temp.id_de('guide'), 99000,
    (now() at time zone 'Indian/Comoro')::date + 1, 'Hausse de demain');
end $$;

set local role authenticated;

do $$
declare
  v_sale uuid := pg_temp.id_de('vente_anonyme');
  v_line uuid := (select id from public.pos_sale_lines where pos_sale_id = pg_temp.id_de('vente_anonyme'));
  v_ok   int := 0;
  v_n    int;
begin
  -- Anti-vacuité : la vente du caissier n'a aucun coût copié.
  perform pg_temp.agir_comme('valoriste');
  if exists (select 1 from public.commercial_line_costs where pos_sale_line_id = v_line) then
    raise exception 'La vente du caissier porte déjà un coût : la recette ne prouverait rien.';
  end if;

  -- Sans les deux capacités de coût : refusé.
  perform pg_temp.agir_comme('facturier');
  begin
    perform public.value_pos_sale_costs(v_sale);
    raise exception 'ÉCHEC : un facturier a valorisé des coûts.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  perform pg_temp.agir_comme('responsable');   -- lit les coûts, ne les gère pas
  begin
    perform public.value_pos_sale_costs(v_sale);
    raise exception 'ÉCHEC : cost.view seule a valorisé des coûts.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- Écriture directe d'un coût par le valoriste : refusée.
  perform pg_temp.agir_comme('valoriste');
  begin
    insert into public.commercial_line_costs (pos_sale_line_id, unit_cost) values (v_line, 1);
    raise exception 'ÉCHEC : un coût a été écrit directement.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- Une vente annulée ne se valorise pas.
  begin
    perform public.value_pos_sale_costs(pg_temp.id_de('vente_mixte'));
    raise exception 'ÉCHEC : une vente annulée a été valorisée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;
  if v_ok <> 4 then raise exception 'Refus attendus : 4, obtenus %.', v_ok; end if;

  -- 🟥 La valorisation : le coût du JOUR DE LA VENTE (15 000), jamais 99 000.
  v_n := public.value_pos_sale_costs(v_sale);
  perform pg_temp.valider();
  if v_n <> 1 then raise exception 'Q-13 : % ligne(s) valorisée(s), attendu 1.', v_n; end if;
  if (select unit_cost from public.commercial_line_costs where pos_sale_line_id = v_line) <> 15000
     or (select created_by from public.commercial_line_costs where pos_sale_line_id = v_line) <> pg_temp.id_de('valoriste') then
    raise exception 'Q-13 : coût valorisé faux ou sans auteur.';
  end if;

  -- Une seconde fois : rien, aucun coût n'est remplacé.
  if public.value_pos_sale_costs(v_sale) <> 0 then
    raise exception 'Q-13 : un coût copié a été valorisé deux fois.';
  end if;

  -- Le prix de vente n'a pas bougé.
  if public.pos_sale_total(v_sale) <> 25000
     or (select unit_price from public.pos_sale_lines where id = v_line) <> 25000 then
    raise exception 'Q-13 : la valorisation a touché le prix de vente.';
  end if;

  -- 🟥 Le caissier et le lecteur des ventes ne lisent toujours AUCUN coût.
  perform pg_temp.agir_comme('caissier');
  if exists (select 1 from public.commercial_line_costs) then
    raise exception '🟥 Le caissier lit un coût.';
  end if;
  perform pg_temp.agir_comme('lecteur');
  if exists (select 1 from public.commercial_line_costs) then
    raise exception '🟥 pos.sales.view lit un coût.';
  end if;

  raise notice '[OK] 22. Q-13 : valorisé au coût du jour de la vente (15 000, pas 99 000), une fois, avec son auteur ; refus sans les deux capacités, en écriture directe, sur vente annulée ; prix intact ; caissier et lecteur ne lisent aucun coût.';
end $$;

reset role;
do $$ begin perform pg_temp.redevenir_service(); end $$;


-- --- 20. SAUVEGARDE — les quatre tables, dans l'ordre -------------------------------
do $$
declare
  v_scope text[] := public.backup_scope();
begin
  if array_length(v_scope, 1) <> 69
     or array_position(v_scope, 'pos_sales') < array_position(v_scope, 'pos_session_amounts')
     or array_position(v_scope, 'pos_payments') < array_position(v_scope, 'pos_sales')
     or array_position(v_scope, 'treasury_entries') < array_position(v_scope, 'pos_payments')
     or array_position(v_scope, 'customer_payments') < array_position(v_scope, 'pos_payments') then
    raise exception 'Périmètre de sauvegarde du LOT 28 incorrect.';
  end if;
  raise notice '[OK] 20. Sauvegarde : 69 tables, ventes avant ce qui les cite.';
end $$;


rollback;
