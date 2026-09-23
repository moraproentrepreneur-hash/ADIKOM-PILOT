-- =============================================================================
-- ADIKOM PILOT — Recette Commerce client : devis et commandes
-- LOT 25 (Module 11) — DEC-049
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur ne
-- peuvent garantir :
--
--   · les SEIZE capacités existent, avec leur action et leur sensibilité — et
--     aucune n'a été inventée sous `commerce` ;
--   · les QUATRE tables existent, RLS activée, suppression et TRUNCATE refermés ;
--   · AUCUNE colonne de coût ni de marge sur une ligne commerciale (Plan 02 §9.3) ;
--   · les fonctions ne sont pas `SECURITY DEFINER` (doctrine D4) ;
--   · 🟥 LE PRIX EST FIGÉ : un devis établi au prix du jour ne change pas quand
--     le catalogue change le lendemain ;
--   · 🟩 A-13 : une ligne libre coexiste avec une ligne de catalogue ;
--   · les lignes d'un devis ÉMIS sont figées — ajout, modification, archivage ;
--   · la CONVERSION crée un acte nouveau et CONSERVE le devis ; elle ne relit
--     pas le catalogue ;
--   · un devis ne produit PAS deux commandes ;
--   · la FACTURE née d'une commande est une `customer_invoices` ORDINAIRE, avec
--     les lignes de la commande et aucune autre ;
--   · une commande ne se facture PAS deux fois ;
--   · l'annulation d'une facture rend la commande à « Confirmée », et
--     l'annulation d'une commande rend son devis à « Accepté » ;
--   · une variante étrangère à son service est REFUSÉE PAR LA BASE ;
--   · les DEUX index d'unicité de la facturation de location sont intacts ;
--   · le périmètre de SAUVEGARDE porte les quatre tables, dans l'ordre.
--
-- Exécution :
--   npm run db:verify:commerce
--
-- CE SCRIPT S'EXÉCUTE AVEC LE RÔLE DE LA CHAÎNE DE CONNEXION.
--
-- Ce rôle CONTOURNE RLS : les refus de LECTURE s'éprouvent donc par la forme des
-- policies ici, et par de VRAIES SESSIONS dans `verify:commerce`. Les refus
-- portés par des DÉCLENCHEURS et des FONCTIONS, eux, s'appliquent à tout le
-- monde et sont éprouvés pour de bon — en endossant l'identité d'un compte,
-- comme PostgREST le fait.
--
-- AUCUNE DATE EN DUR : tout se situe par rapport au JOUR COMORIEN. La
-- transaction est annulée en fin de script — aucun résidu.
-- =============================================================================

begin;


-- --- 1. LES SEIZE CAPACITÉS, ET PAS UNE DE PLUS ------------------------------
do $$
declare
  v_attendu text[] := array[
    'commerce.sales_quotes.view', 'commerce.sales_quotes.create',
    'commerce.sales_quotes.update', 'commerce.sales_quotes.validate',
    'commerce.sales_quotes.cancel', 'commerce.sales_quotes.export',
    'commerce.sales_quotes.download', 'commerce.sales_quotes.print',
    'commerce.sales_orders.view', 'commerce.sales_orders.create',
    'commerce.sales_orders.update', 'commerce.sales_orders.validate',
    'commerce.sales_orders.cancel', 'commerce.sales_orders.export',
    'commerce.sales_orders.download', 'commerce.sales_orders.print'
  ];
  v_manquantes text[];
  v_inconnues  text[];
begin
  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_manquantes is not null then
    raise exception 'Capacités du LOT 25 absentes : %', v_manquantes;
  end if;

  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.module_code = 'commerce' and not (p.code = any (v_attendu));

  if v_inconnues is not null then
    raise exception 'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  -- AUCUNE capacité de remise, de marge, de coût, de facturation propre ni de
  -- commerce fournisseur : le lot ne les livre pas (CLAUDE.md §19 bis).
  if exists (
    select 1 from public.permissions
    where code like 'commerce.%'
      and (code like '%discount%' or code like '%margin%' or code like '%cost%'
        or code like '%invoice%' or code like '%purchase%')
  ) then
    raise exception 'Une capacité de remise, de marge, de coût ou d''achat a été créée.';
  end if;

  -- Les six capacités documentaires et d'export sont sensibles.
  if exists (
    select 1 from public.permissions
    where code like 'commerce.%'
      and action in ('EXPORT', 'DOWNLOAD', 'PRINT')
      and is_sensitive is not true
  ) then
    raise exception 'Une capacité documentaire du commerce client n''est pas sensible.';
  end if;

  -- Le module porte l'ordre 11, ses menus 1 et 2 (Plan 02 §7.1).
  if exists (
    select 1 from public.permissions where module_code = 'commerce' and module_order <> 11
  ) then
    raise exception 'Le module `commerce` ne porte pas l''ordre 11.';
  end if;

  raise notice '[OK] 1. Seize capacités sous `commerce`, six sensibles, aucune inventée.';
end $$;


-- --- 2. LES QUATRE TABLES, REFERMÉES -----------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'sales_quotes', 'sales_quote_lines', 'sales_orders', 'sales_order_lines'
  ] loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = v_table
    ) then
      raise exception 'Table % absente.', v_table;
    end if;

    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'RLS non activée sur %.', v_table;
    end if;

    if has_table_privilege('anon', 'public.' || quote_ident(v_table), 'SELECT') then
      raise exception 'La table % est lisible par `anon`.', v_table;
    end if;

    if has_table_privilege('authenticated', 'public.' || quote_ident(v_table), 'DELETE') then
      raise exception 'DELETE encore accordé à authenticated sur %.', v_table;
    end if;

    if has_table_privilege('authenticated', 'public.' || quote_ident(v_table), 'TRUNCATE') then
      raise exception 'TRUNCATE encore accordé à authenticated sur %.', v_table;
    end if;
  end loop;

  raise notice '[OK] 2. Quatre tables, RLS active, ni suppression ni TRUNCATE.';
end $$;


-- --- 3. LES POLICIES CITENT LA CAPACITÉ DE LEUR PROPRE MENU ------------------
--
-- 🟥 Consulter les devis n'ouvre PAS les commandes, et réciproquement (A-14).
-- Une policy de lecture qui citerait l'autre menu effacerait cette séparation.
do $$
declare
  v_qual text;
begin
  select qual into v_qual from pg_policies
  where schemaname = 'public' and tablename = 'sales_quotes' and policyname = 'sales_quotes_select';

  if v_qual is null or v_qual not like '%commerce.sales_quotes.view%' then
    raise exception 'La lecture des devis ne cite pas `commerce.sales_quotes.view`.';
  end if;
  if v_qual like '%sales_orders%' then
    raise exception 'La lecture des devis s''ouvre par une capacité des commandes.';
  end if;

  select qual into v_qual from pg_policies
  where schemaname = 'public' and tablename = 'sales_orders' and policyname = 'sales_orders_select';

  if v_qual is null or v_qual not like '%commerce.sales_orders.view%' then
    raise exception 'La lecture des commandes ne cite pas `commerce.sales_orders.view`.';
  end if;
  if v_qual like '%sales_quotes%' then
    raise exception 'La lecture des commandes s''ouvre par une capacité des devis.';
  end if;

  -- Les lignes se lisent avec leur document, jamais plus largement.
  select qual into v_qual from pg_policies
  where schemaname = 'public' and tablename = 'sales_quote_lines'
    and policyname = 'sales_quote_lines_select';
  if v_qual is null or v_qual not like '%commerce.sales_quotes.view%' then
    raise exception 'La lecture des lignes de devis ne cite pas la capacité du devis.';
  end if;

  select qual into v_qual from pg_policies
  where schemaname = 'public' and tablename = 'sales_order_lines'
    and policyname = 'sales_order_lines_select';
  if v_qual is null or v_qual not like '%commerce.sales_orders.view%' then
    raise exception 'La lecture des lignes de commande ne cite pas la capacité de la commande.';
  end if;

  /*
   * UNE GARDE DE RLS S'ÉVALUE PAR LIGNE.
   *
   * `has_permission` doit être enveloppée dans un SOUS-SELECT, sans quoi elle
   * coûte un appel par ligne de la liste (migration 065, Plan 02 §8.2).
   */
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename like 'sales_%'
      and qual is not null
      and qual like '%has_permission%'
      and qual not like '%( SELECT%'
  ) then
    raise exception
      'Une policy du commerce client appelle `has_permission` sans sous-select : elle serait évaluée par ligne.';
  end if;

  raise notice '[OK] 3. Chaque policy cite la capacité de son menu, et rien d''autre.';
end $$;


-- --- 4. AUCUN COÛT, AUCUNE MARGE SUR UNE LIGNE COMMERCIALE -------------------
--
-- 🟥 Plan 02 §9.3 : le coût copié vit dans `commercial_line_costs`, au LOT 28.
-- Une colonne glissée ici rendrait la confidentialité contournable par le PDF.
do $$
declare
  v_fautes text[];
begin
  select array_agg(table_name || '.' || column_name) into v_fautes
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('sales_quote_lines', 'sales_order_lines', 'customer_invoice_lines')
    and (column_name like '%cost%' or column_name like '%margin%'
      or column_name like '%commission%');

  if v_fautes is not null then
    raise exception
      'Une colonne de coût ou de marge figure sur une ligne commerciale : %', v_fautes;
  end if;

  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'commercial_line_costs'
  ) then
    raise exception '`commercial_line_costs` anticipe le LOT 28 (Plan 02 §13.2).';
  end if;

  raise notice '[OK] 4. Aucune colonne de coût ni de marge — la table des coûts reste au LOT 28.';
end $$;


-- --- 5. DOCTRINE D4 — aucun acte commercial en SECURITY DEFINER --------------
do $$
declare
  v_fautes text[];
begin
  select array_agg(p.proname) into v_fautes
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (p.proname like 'sales_%'
      or p.proname in ('create_sales_quote', 'update_sales_quote', 'add_sales_quote_line',
                       'archive_sales_quote_line', 'set_sales_quote_status',
                       'create_sales_order', 'update_sales_order', 'add_sales_order_line',
                       'archive_sales_order_line', 'set_sales_order_status',
                       'convert_sales_quote_to_order', 'create_invoice_from_sales_order',
                       'fn_sales_quote_transition', 'fn_sales_order_transition',
                       'fn_sales_quote_line_guard', 'fn_sales_order_line_guard'));

  if v_fautes is not null then
    raise exception 'Fonction du commerce client en SECURITY DEFINER : %', v_fautes;
  end if;

  -- Une seule version de chaque fonction de facturation étendue : deux
  -- surcharges rendraient tout appel par paramètres nommés ambigu.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_customer_invoice') <> 1
  or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'add_customer_invoice_line') <> 1 then
    raise exception 'Une fonction de facturation existe en plusieurs versions.';
  end if;

  raise notice '[OK] 5. Aucune fonction commerciale en SECURITY DEFINER, aucune surcharge.';
end $$;


-- --- 6. PÉRIMÈTRE DE SAUVEGARDE ----------------------------------------------
do $$
declare
  v_scope text[] := public.backup_scope();
  v_paire text;
  v_enf   int;
  v_par   int;
begin
  if not ('sales_quotes' = any (v_scope)) or not ('sales_quote_lines' = any (v_scope))
     or not ('sales_orders' = any (v_scope)) or not ('sales_order_lines' = any (v_scope)) then
    raise exception 'Le commerce client est hors du périmètre de sauvegarde.';
  end if;

  foreach v_paire in array array[
    'sales_quotes:clients',
    'sales_quote_lines:sales_quotes',
    'sales_quote_lines:service_variants',
    'sales_orders:sales_quotes',
    'sales_order_lines:sales_orders',
    'sales_order_lines:sales_quote_lines',
    'customer_invoices:sales_orders',
    'customer_invoice_lines:sales_order_lines'
  ] loop
    v_enf := array_position(v_scope, split_part(v_paire, ':', 1));
    v_par := array_position(v_scope, split_part(v_paire, ':', 2));

    if v_enf is null or v_par is null or v_enf < v_par then
      raise exception 'Ordre du périmètre invalide : « % » précède « % ».',
        split_part(v_paire, ':', 1), split_part(v_paire, ':', 2);
    end if;
  end loop;

  -- `backup_columns` rend bien le prix figé : sans lui, le montant accepté par
  -- le client serait perdu à la restauration — le catalogue n'en garde pas trace.
  if public.backup_columns('sales_quote_lines') not like '%unit_price%' then
    raise exception '`backup_columns` ne rend pas le prix figé des lignes de devis.';
  end if;

  raise notice '[OK] 6. Périmètre de sauvegarde à % tables, commerce client compris et ordonné.',
    array_length(v_scope, 1);
end $$;


-- =============================================================================
-- SUJETS DE RECETTE
-- =============================================================================

create temporary table recette_com (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_ids  uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_cles text[] := array['commercial', 'lecteur', 'factureur'];
  v_i    int;
begin
  for v_i in 1 .. 3 loop
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (
      v_ids[v_i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'recette.com.' || v_cles[v_i] || '@adikom.test', now(), now()
    );
    insert into recette_com (cle, id) values (v_cles[v_i], v_ids[v_i]);
  end loop;

  insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
  values
    (v_ids[1], 'Recette', 'Com commercial', 'recette.com.commercial',
     'recette.com.commercial@adikom.test', 'ACTIVE', false),
    (v_ids[2], 'Recette', 'Com lecteur',    'recette.com.lecteur',
     'recette.com.lecteur@adikom.test',    'ACTIVE', false),
    (v_ids[3], 'Recette', 'Com factureur',  'recette.com.factureur',
     'recette.com.factureur@adikom.test',  'ACTIVE', false);

  /*
   * LE COMMERCIAL — il mène le devis et la commande de bout en bout.
   *
   * Il n'a AUCUNE capacité de facturation : c'est ce qui permet d'éprouver que
   * facturer une commande exige `billing.customer_invoices.create`, et non la
   * seule capacité de lire la commande (Plan 01 §15.5).
   */
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[1], p.id, 'ALLOW'
  from public.permissions p
  where p.code in (
    'commerce.sales_quotes.view', 'commerce.sales_quotes.create',
    'commerce.sales_quotes.update', 'commerce.sales_quotes.validate',
    'commerce.sales_quotes.cancel',
    'commerce.sales_orders.view', 'commerce.sales_orders.create',
    'commerce.sales_orders.update', 'commerce.sales_orders.validate',
    'commerce.sales_orders.cancel',
    'catalog.services.view', 'parties.clients.view'
  );

  -- LE LECTEUR : il consulte les devis et les commandes, et rien d'autre.
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[2], p.id, 'ALLOW'
  from public.permissions p
  where p.code in (
    'commerce.sales_quotes.view', 'commerce.sales_orders.view',
    'catalog.services.view', 'parties.clients.view'
  );

  /*
   * LE FACTUREUR : il lit les commandes et tient la facturation. Il ne crée
   * ni devis ni commande.
   *
   * ⚠ `billing.customer_payments.view` n'est PAS un confort : depuis le LOT 8,
   * `fn_customer_invoice_no_cancel_when_paid` refuse d'annuler une facture à
   * qui ne peut pas lire les règlements qui la soldent — « une garde qui compte
   * doit compter la vérité ». Le commerce client hérite de cette exigence sans
   * la modifier.
   */
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[3], p.id, 'ALLOW'
  from public.permissions p
  where p.code in (
    'commerce.sales_orders.view', 'commerce.sales_quotes.view',
    'billing.customer_invoices.view', 'billing.customer_invoices.create',
    'billing.customer_invoices.update', 'billing.customer_invoices.issue',
    'billing.customer_invoices.cancel', 'billing.customer_payments.view',
    'catalog.services.view', 'parties.clients.view'
  );

  raise notice '[OK] 7. Trois profils : commercial sans facturation, lecteur seul, factureur sans commerce.';
end $$;


create or replace function pg_temp.agir_comme(p_cle text)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from recette_com where cle = p_cle;
  if v_id is null then
    raise exception 'Compte de recette « % » introuvable.', p_cle;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function pg_temp.redevenir_service()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
end;
$$;


-- --- 8. LE DÉCOR : un client, un service, deux variantes, un prix ------------
create temporary table recette_obj (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_client  uuid;
  v_cat     uuid;
  v_service uuid;
  v_std     uuid;
  v_prem    uuid;
  v_today   date := (now() at time zone 'Indian/Comoro')::date;
begin
  insert into public.clients (client_no, type, legal_name, phone, status)
  values (public.next_number('client'), 'COMPANY', 'RECETTE COMMERCE SARL',
          '+269 300 00 00', 'ACTIVE')
  returning id into v_client;
  insert into recette_obj values ('client', v_client);

  insert into public.service_categories (code, label)
  values ('RECETTE-COM', 'Recette — Commerce')
  returning id into v_cat;
  insert into recette_obj values ('categorie', v_cat);

  -- `services_default_variant` pose la variante « Standard » d'office.
  insert into public.services (service_no, label, category_id, purpose, unit_label)
  values (public.next_number('service'), 'Recette — Transfert aéroport', v_cat, 'SALE', 'trajet')
  returning id into v_service;
  insert into recette_obj values ('service', v_service);

  select id into v_std from public.service_variants where service_id = v_service and is_default;
  insert into recette_obj values ('variante_std', v_std);

  insert into public.service_variants (service_id, label, is_default, is_active)
  values (v_service, 'Véhicule premium', false, true)
  returning id into v_prem;
  insert into recette_obj values ('variante_premium', v_prem);

  -- Prix de vente en vigueur depuis un mois : 50 000 et 80 000 KMF.
  perform public.set_service_price(v_std,  50000, v_today - 30, 'Prix de recette');
  perform public.set_service_price(v_prem, 80000, v_today - 30, 'Prix de recette');

  raise notice '[OK] 8. Décor posé : un client, un service, deux variantes, deux prix en vigueur.';
end $$;


-- --- 9. UN DEVIS, DEUX LIGNES DE CATALOGUE ET UNE LIGNE LIBRE (A-13) ---------
do $$
declare
  v_devis  uuid;
  v_today  date := (now() at time zone 'Indian/Comoro')::date;
  v_l1     uuid;
  v_l2     uuid;
  v_l3     uuid;
  v_total  bigint;
  v_prix   bigint;
  v_srv    uuid;
begin
  perform pg_temp.agir_comme('commercial');

  v_devis := public.create_sales_quote(
    (select id from recette_obj where cle = 'client'),
    v_today, v_today + 15, 'Devis de recette', 'Conditions de recette'
  );
  insert into recette_obj values ('devis', v_devis);

  -- TYPE A — deux lignes de catalogue : le prix vient du catalogue, à la date.
  v_l1 := public.add_sales_quote_line(
    v_devis, 3, (select id from recette_obj where cle = 'variante_std'));
  v_l2 := public.add_sales_quote_line(
    v_devis, 1, (select id from recette_obj where cle = 'variante_premium'));

  -- TYPE B — une ligne LIBRE : aucun service, prix choisi.
  v_l3 := public.add_sales_quote_line(
    v_devis, 2, null, 'Accompagnement bagages — prestation hors catalogue', 7500);

  insert into recette_obj values ('ligne_libre', v_l3);
  perform pg_temp.redevenir_service();

  -- Le prix a été RÉSOLU, non saisi.
  select unit_price into v_prix from public.sales_quote_lines where id = v_l1;
  if v_prix <> 50000 then
    raise exception 'La ligne de catalogue ne porte pas le prix du catalogue : % KMF.', v_prix;
  end if;

  select unit_price into v_prix from public.sales_quote_lines where id = v_l2;
  if v_prix <> 80000 then
    raise exception 'La variante premium ne porte pas son prix : % KMF.', v_prix;
  end if;

  -- 🟩 A-13 : la ligne libre ne référence AUCUN service, et c'est permis.
  select service_id into v_srv from public.sales_quote_lines where id = v_l3;
  if v_srv is not null then
    raise exception 'Une ligne libre porte un service : A-13 n''est pas respectée.';
  end if;

  -- 3 × 50 000 + 1 × 80 000 + 2 × 7 500 = 245 000
  v_total := public.sales_quote_total(v_devis);
  if v_total <> 245000 then
    raise exception 'Total du devis attendu à 245 000 KMF, obtenu %.', v_total;
  end if;

  raise notice '[OK] 9. Devis à trois lignes — deux du catalogue, une libre (A-13). Total : 245 000 KMF.';
end $$;


-- --- 10. LE PRIX D'UNE LIGNE DE CATALOGUE NE SE CHOISIT PAS ------------------
--
-- Accepter un prix libre sur une ligne de catalogue serait une remise déguisée,
-- qu'aucune capacité ne garde (Plan 02 §10.2 : `pos.sales.discount` n'a pas
-- d'équivalent ici).
do $$
declare
  v_ok boolean := false;
begin
  perform pg_temp.agir_comme('commercial');
  begin
    perform public.add_sales_quote_line(
      (select id from recette_obj where cle = 'devis'), 1,
      (select id from recette_obj where cle = 'variante_std'), null, 1000);
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'Un prix choisi a été accepté sur une ligne de catalogue.';
  end if;

  raise notice '[OK] 10. Le prix d''une ligne de catalogue vient du catalogue, jamais de la saisie.';
end $$;


-- --- 11. UNE LIGNE LIBRE SANS DÉSIGNATION, UNE QUANTITÉ NULLE : REFUSÉES -----
do $$
declare
  v_devis uuid := (select id from recette_obj where cle = 'devis');
  v_n     int := 0;
begin
  perform pg_temp.agir_comme('commercial');

  begin perform public.add_sales_quote_line(v_devis, 1, null, '   ', 5000);
  exception when others then v_n := v_n + 1; end;

  begin perform public.add_sales_quote_line(v_devis, 0, null, 'Ligne', 5000);
  exception when others then v_n := v_n + 1; end;

  begin perform public.add_sales_quote_line(v_devis, 1, null, 'Ligne', 0);
  exception when others then v_n := v_n + 1; end;

  begin perform public.add_sales_quote_line(v_devis, 1, null, 'Ligne', null);
  exception when others then v_n := v_n + 1; end;

  perform pg_temp.redevenir_service();

  if v_n <> 4 then
    raise exception 'Une saisie invalide a été acceptée : % refus sur 4.', v_n;
  end if;

  raise notice '[OK] 11. Désignation vide, quantité nulle, prix nul ou absent : quatre refus.';
end $$;


-- --- 12. LE CYCLE DU DEVIS, ET SES CAPACITÉS ---------------------------------
do $$
declare
  v_devis  uuid := (select id from recette_obj where cle = 'devis');
  v_statut public.commercial_document_status;
  v_ok     boolean := false;
begin
  -- 🟥 LE LECTEUR NE PEUT PAS ÉMETTRE : « voir » n'a jamais inclus « valider ».
  perform pg_temp.agir_comme('lecteur');
  begin
    perform public.set_sales_quote_status(v_devis, 'SENT');
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'Un lecteur a pu émettre un devis sans `commerce.sales_quotes.validate`.';
  end if;

  -- Le commercial, lui, l'émet.
  perform pg_temp.agir_comme('commercial');
  perform public.set_sales_quote_status(v_devis, 'SENT', 'Remis au client');
  perform pg_temp.redevenir_service();

  select status into v_statut from public.sales_quotes where id = v_devis;
  if v_statut <> 'SENT' then
    raise exception 'Le devis n''est pas passé à « émis » : %.', v_statut;
  end if;

  -- Un devis émis ne revient pas en brouillon.
  v_ok := false;
  perform pg_temp.agir_comme('commercial');
  begin
    perform public.set_sales_quote_status(v_devis, 'DRAFT');
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'Un devis émis a pu revenir en brouillon.';
  end if;

  raise notice '[OK] 12. Émettre exige `validate` ; un devis émis ne revient pas en brouillon.';
end $$;


-- --- 13. LES LIGNES D'UN DEVIS ÉMIS SONT FIGÉES ------------------------------
--
-- 🟥 Ajout, modification ET archivage. Retirer une ligne changerait le total
-- aussi sûrement qu'en modifier le prix.
do $$
declare
  v_devis uuid := (select id from recette_obj where cle = 'devis');
  v_ligne uuid := (select id from recette_obj where cle = 'ligne_libre');
  v_n     int := 0;
  v_total bigint;
begin
  perform pg_temp.agir_comme('commercial');

  begin perform public.add_sales_quote_line(v_devis, 1, null, 'Ligne tardive', 1000);
  exception when others then v_n := v_n + 1; end;

  begin update public.sales_quote_lines set unit_price = 1 where id = v_ligne;
  exception when others then v_n := v_n + 1; end;

  begin perform public.archive_sales_quote_line(v_ligne);
  exception when others then v_n := v_n + 1; end;

  begin update public.sales_quotes set client_id = gen_random_uuid() where id = v_devis;
  exception when others then v_n := v_n + 1; end;

  perform pg_temp.redevenir_service();

  if v_n <> 4 then
    raise exception 'Un devis émis a pu être réécrit : % refus sur 4.', v_n;
  end if;

  v_total := public.sales_quote_total(v_devis);
  if v_total <> 245000 then
    raise exception 'Le total du devis émis a bougé : % KMF.', v_total;
  end if;

  raise notice '[OK] 13. Devis émis : ajout, modification, archivage et changement de client refusés.';
end $$;


-- --- 14. 🟥 LE PRIX HISTORIQUE NE SE RÉÉCRIT PAS -----------------------------
--
-- Le catalogue passe de 50 000 à 90 000 KMF, à effet immédiat. Le devis
-- historique doit rester à 50 000.
do $$
declare
  v_std    uuid := (select id from recette_obj where cle = 'variante_std');
  v_today  date := (now() at time zone 'Indian/Comoro')::date;
  v_prix   bigint;
  v_actuel bigint;
  v_total  bigint;
begin
  perform public.set_service_price(v_std, 90000, v_today, 'Hausse du catalogue');

  -- Le catalogue dit bien 90 000 aujourd'hui.
  select r.amount into v_actuel from public.resolve_service_price(v_std, v_today) r;
  if v_actuel <> 90000 then
    raise exception 'Le catalogue n''a pas pris la hausse : % KMF.', v_actuel;
  end if;

  -- La ligne du devis, elle, porte toujours 50 000.
  select unit_price into v_prix
  from public.sales_quote_lines
  where sales_quote_id = (select id from recette_obj where cle = 'devis')
    and service_variant_id = v_std;

  if v_prix <> 50000 then
    raise exception
      'LE PRIX HISTORIQUE A ÉTÉ RÉÉCRIT : la ligne du devis porte % KMF au lieu de 50 000.', v_prix;
  end if;

  v_total := public.sales_quote_total((select id from recette_obj where cle = 'devis'));
  if v_total <> 245000 then
    raise exception 'Le total du devis a suivi le catalogue : % KMF.', v_total;
  end if;

  raise notice '[OK] 14. 🟥 Catalogue à 90 000 ; le devis historique reste à 50 000. Total inchangé.';
end $$;


-- --- 15. LA CONVERSION — un acte nouveau, le devis conservé ------------------
do $$
declare
  v_devis  uuid := (select id from recette_obj where cle = 'devis');
  v_cmd    uuid;
  v_statut public.commercial_document_status;
  v_no     text;
  v_total  bigint;
  v_n      int;
  v_ok     boolean := false;
begin
  -- Un devis ÉMIS ne se convertit pas : il faut la réponse du client.
  perform pg_temp.agir_comme('commercial');
  begin
    perform public.convert_sales_quote_to_order(v_devis);
  exception when others then
    v_ok := true;
  end;

  if not v_ok then
    perform pg_temp.redevenir_service();
    raise exception 'Un devis non accepté a pu être converti.';
  end if;

  perform public.set_sales_quote_status(v_devis, 'ACCEPTED', 'Accord du client');
  v_cmd := public.convert_sales_quote_to_order(v_devis);
  perform pg_temp.redevenir_service();

  insert into recette_obj values ('commande', v_cmd);

  -- 🟥 LE DEVIS EST CONSERVÉ, et reste un devis.
  select status, quote_no into v_statut, v_no from public.sales_quotes where id = v_devis;
  if v_statut <> 'CONVERTED' then
    raise exception 'Le devis n''est pas passé à « converti » : %.', v_statut;
  end if;
  if v_no not like 'DEV-C-%' then
    raise exception 'Le devis a changé de référence : %.', v_no;
  end if;

  -- La commande est un acte NOUVEAU, lié, et numéroté à part.
  select order_no into v_no from public.sales_orders where id = v_cmd;
  if v_no not like 'CDE-C-%' then
    raise exception 'La commande ne porte pas sa propre référence : %.', v_no;
  end if;

  if (select sales_quote_id from public.sales_orders where id = v_cmd) is distinct from v_devis then
    raise exception 'La commande ne désigne pas son devis d''origine.';
  end if;

  -- 🟥 LES PRIX SONT RECOPIÉS, PAS RELUS — le catalogue dit 90 000.
  v_total := public.sales_order_total(v_cmd);
  if v_total <> 245000 then
    raise exception
      'La conversion a relu le catalogue : total de la commande % KMF au lieu de 245 000.', v_total;
  end if;

  select count(*) into v_n from public.sales_order_lines where sales_order_id = v_cmd;
  if v_n <> 3 then
    raise exception 'La commande porte % lignes au lieu de 3.', v_n;
  end if;

  -- Chaque ligne nomme celle du devis dont elle est née.
  select count(*) into v_n
  from public.sales_order_lines
  where sales_order_id = v_cmd and source_quote_line_id is not null;
  if v_n <> 3 then
    raise exception 'La traçabilité ligne à ligne est incomplète : % sur 3.', v_n;
  end if;

  -- La ligne libre traverse la conversion sans service.
  select count(*) into v_n
  from public.sales_order_lines
  where sales_order_id = v_cmd and service_id is null;
  if v_n <> 1 then
    raise exception 'La ligne libre n''a pas traversé la conversion à l''identique.';
  end if;

  raise notice '[OK] 15. Devis conservé (DEV-C, converti) ; commande CDE-C liée, prix recopiés, 3 lignes tracées.';
end $$;


-- --- 16. UN DEVIS NE PRODUIT PAS DEUX COMMANDES ------------------------------
do $$
declare
  v_devis uuid := (select id from recette_obj where cle = 'devis');
  v_ok    boolean := false;
  v_n     int;
begin
  perform pg_temp.agir_comme('commercial');
  begin
    perform public.convert_sales_quote_to_order(v_devis);
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'Le même devis a produit deux commandes.';
  end if;

  select count(*) into v_n from public.sales_orders where sales_quote_id = v_devis;
  if v_n <> 1 then
    raise exception 'Le devis porte % commandes.', v_n;
  end if;

  -- 🟥 L'INDEX FAIT AUTORITÉ, MÊME HORS DE LA FONCTION : un INSERT direct est
  -- refusé lui aussi. C'est ce qui protège de deux clics simultanés.
  v_ok := false;
  begin
    insert into public.sales_orders (order_no, client_id, sales_quote_id, order_date)
    values ('CDE-C-TEST-000001',
            (select id from recette_obj where cle = 'client'), v_devis,
            (now() at time zone 'Indian/Comoro')::date);
  exception when unique_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Un INSERT direct a créé une seconde commande sur le même devis.';
  end if;

  raise notice '[OK] 16. Une seule commande par devis — par la fonction ET par l''index.';
end $$;


-- --- 17. LA COMMANDE SE CONFIRME, PUIS SE FACTURE ----------------------------
do $$
declare
  v_cmd    uuid := (select id from recette_obj where cle = 'commande');
  v_statut public.order_status;
  v_ok     boolean := false;
begin
  -- Facturer un BROUILLON est refusé.
  perform pg_temp.agir_comme('factureur');
  begin
    perform public.create_invoice_from_sales_order(v_cmd);
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'Une commande en brouillon a pu être facturée.';
  end if;

  -- 🟥 LE FACTUREUR NE CONFIRME PAS : il n'a pas `commerce.sales_orders.validate`.
  v_ok := false;
  perform pg_temp.agir_comme('factureur');
  begin
    perform public.set_sales_order_status(v_cmd, 'CONFIRMED');
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'Le factureur a pu confirmer une commande sans `commerce.sales_orders.validate`.';
  end if;

  perform pg_temp.agir_comme('commercial');
  perform public.set_sales_order_status(v_cmd, 'CONFIRMED', 'Engagement du client');
  perform pg_temp.redevenir_service();

  select status into v_statut from public.sales_orders where id = v_cmd;
  if v_statut <> 'CONFIRMED' then
    raise exception 'La commande n''est pas confirmée : %.', v_statut;
  end if;

  -- 🟥 LE COMMERCIAL NE FACTURE PAS : il n'a pas `billing.customer_invoices.create`.
  v_ok := false;
  perform pg_temp.agir_comme('commercial');
  begin
    perform public.create_invoice_from_sales_order(v_cmd);
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception
      'Un porteur de `commerce.sales_orders.view` seul a pu facturer : Plan 01 §15.5 l''interdit.';
  end if;

  raise notice '[OK] 17. Confirmer exige `validate` ; facturer exige la capacité de facturation.';
end $$;


-- --- 18. 🟥 LA FACTURE EST UNE `customer_invoices` ORDINAIRE -----------------
do $$
declare
  v_cmd     uuid := (select id from recette_obj where cle = 'commande');
  v_facture uuid;
  f         public.customer_invoices%rowtype;
  v_n       int;
  v_total   bigint;
  v_statut  public.order_status;
begin
  perform pg_temp.agir_comme('factureur');
  v_facture := public.create_invoice_from_sales_order(v_cmd);
  perform pg_temp.redevenir_service();

  insert into recette_obj values ('facture', v_facture);

  select * into f from public.customer_invoices where id = v_facture;

  if f.invoice_no not like 'FAC-C-%' then
    raise exception 'La facture ne porte pas la numérotation existante : %.', f.invoice_no;
  end if;

  -- Elle naît en BROUILLON : émettre reste un acte distinct (Plan 01 §15.5).
  if f.status <> 'DRAFT' then
    raise exception 'La facture d''une commande ne naît pas en brouillon : %.', f.status;
  end if;

  if f.sales_order_id is distinct from v_cmd then
    raise exception 'La facture ne désigne pas sa commande.';
  end if;

  -- Les deux origines sont ÉTANCHES.
  if f.rental_id is not null or f.billing_period_id is not null then
    raise exception 'Une facture de commande vise aussi une location.';
  end if;

  if f.client_id is distinct from (select id from recette_obj where cle = 'client') then
    raise exception 'La facture n''est pas au client de la commande.';
  end if;

  -- Les lignes sont celles de la commande, et aucune autre.
  select count(*) into v_n from public.customer_invoice_lines
  where customer_invoice_id = v_facture;
  if v_n <> 3 then
    raise exception 'La facture porte % lignes au lieu de 3.', v_n;
  end if;

  select count(*) into v_n from public.customer_invoice_lines
  where customer_invoice_id = v_facture and kind <> 'SERVICE';
  if v_n <> 0 then
    raise exception 'Une ligne de facture n''est pas de nature « service ».';
  end if;

  select count(*) into v_n from public.customer_invoice_lines
  where customer_invoice_id = v_facture and source_order_line_id is not null;
  if v_n <> 3 then
    raise exception 'La traçabilité facture → commande est incomplète : % sur 3.', v_n;
  end if;

  -- 🟥 LE MONTANT TRAVERSE TOUTE LA CHAÎNE SANS BOUGER — et le catalogue dit 90 000.
  v_total := public.customer_invoice_total(v_facture);
  if v_total <> 245000 then
    raise exception
      'Le total de la facture est % KMF : un maillon a relu le catalogue.', v_total;
  end if;

  -- La commande est passée à « Facturée ».
  select status into v_statut from public.sales_orders where id = v_cmd;
  if v_statut <> 'INVOICED' then
    raise exception 'La commande n''est pas passée à « facturée » : %.', v_statut;
  end if;

  raise notice '[OK] 18. 🟥 Facture FAC-C ordinaire, en brouillon, 3 lignes SERVICE tracées, 245 000 KMF.';
end $$;


-- --- 19. UNE COMMANDE NE SE FACTURE PAS DEUX FOIS ----------------------------
do $$
declare
  v_cmd uuid := (select id from recette_obj where cle = 'commande');
  v_ok  boolean := false;
  v_n   int;
begin
  perform pg_temp.agir_comme('factureur');
  begin
    perform public.create_invoice_from_sales_order(v_cmd);
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'La même commande a produit deux factures.';
  end if;

  -- 🟥 L'INDEX FAIT AUTORITÉ HORS DE LA FONCTION.
  v_ok := false;
  begin
    insert into public.customer_invoices
      (invoice_no, client_id, sales_order_id, invoice_date)
    values ('FAC-C-TEST-000001',
            (select id from recette_obj where cle = 'client'), v_cmd,
            (now() at time zone 'Indian/Comoro')::date);
  exception when unique_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Un INSERT direct a créé une seconde facture sur la même commande.';
  end if;

  select count(*) into v_n from public.customer_invoices where sales_order_id = v_cmd;
  if v_n <> 1 then
    raise exception 'La commande porte % factures.', v_n;
  end if;

  raise notice '[OK] 19. Une seule facture par commande — par la fonction ET par l''index.';
end $$;


-- --- 20. LA FACTURE S'ÉMET, ET LA CHAÎNE EXISTANTE PREND LE RELAIS -----------
do $$
declare
  v_facture uuid := (select id from recette_obj where cle = 'facture');
  v_statut  public.customer_invoice_status;
begin
  perform pg_temp.agir_comme('factureur');
  perform public.issue_customer_invoice(v_facture, 'Émission de recette');
  perform pg_temp.redevenir_service();

  select status into v_statut from public.customer_invoices where id = v_facture;
  if v_statut <> 'ISSUED' then
    raise exception 'La facture n''est pas émise : %.', v_statut;
  end if;

  -- Une facture émise fige ses lignes : la chaîne du LOT 7 s'applique sans
  -- retouche à une facture née d'une commande.
  begin
    update public.customer_invoice_lines set unit_price = 1
    where customer_invoice_id = v_facture;
    raise exception 'Les lignes d''une facture émise née d''une commande ne sont pas figées.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 20. La facture s''émet par `issue_customer_invoice`, et fige ses lignes.';
end $$;


-- --- 21. ANNULER LA FACTURE REND LA COMMANDE À « CONFIRMÉE » -----------------
do $$
declare
  v_facture uuid := (select id from recette_obj where cle = 'facture');
  v_cmd     uuid := (select id from recette_obj where cle = 'commande');
  v_statut  public.order_status;
  v_inv     timestamptz;
begin
  perform pg_temp.agir_comme('factureur');
  perform public.cancel_customer_invoice(v_facture, 'Annulation de recette');
  perform pg_temp.redevenir_service();

  select status, invoiced_at into v_statut, v_inv from public.sales_orders where id = v_cmd;

  if v_statut <> 'CONFIRMED' then
    raise exception
      'La commande reste « % » après annulation de sa facture : elle serait facturée sans facture.', v_statut;
  end if;

  if v_inv is not null then
    raise exception 'La commande garde une date de facturation sans facture.';
  end if;

  -- Elle se facture de nouveau : l'index partiel a libéré la place.
  perform pg_temp.agir_comme('factureur');
  perform public.create_invoice_from_sales_order(v_cmd);
  perform pg_temp.redevenir_service();

  select status into v_statut from public.sales_orders where id = v_cmd;
  if v_statut <> 'INVOICED' then
    raise exception 'La commande n''a pas pu être refacturée après annulation.';
  end if;

  raise notice '[OK] 21. Facture annulée → commande « confirmée », refacturable. Aucune impasse.';
end $$;


-- --- 22. ANNULER LA COMMANDE REND SON DEVIS À « ACCEPTÉ » --------------------
--
-- Sans ce retour, un devis converti par erreur resterait « converti » sans
-- commande vivante, tandis que l'index d'unicité, lui, se libérerait.
do $$
declare
  v_cmd    uuid := (select id from recette_obj where cle = 'commande');
  v_devis  uuid := (select id from recette_obj where cle = 'devis');
  v_statut public.commercial_document_status;
  v_cmd2   uuid;
begin
  -- On annule d'abord la facture : une commande facturée ne s'annule pas.
  perform pg_temp.agir_comme('factureur');
  perform public.cancel_customer_invoice(
    (select id from public.customer_invoices
     where sales_order_id = v_cmd and status <> 'CANCELLED' limit 1),
    'Annulation de recette');
  perform pg_temp.redevenir_service();

  perform pg_temp.agir_comme('commercial');
  perform public.set_sales_order_status(v_cmd, 'CANCELLED', 'Affaire perdue');
  perform pg_temp.redevenir_service();

  select status into v_statut from public.sales_quotes where id = v_devis;
  if v_statut <> 'ACCEPTED' then
    raise exception
      'Le devis reste « % » après annulation de sa commande : il serait converti sans commande.', v_statut;
  end if;

  if (select converted_at from public.sales_quotes where id = v_devis) is not null then
    raise exception 'Le devis garde une date de conversion sans commande.';
  end if;

  -- Il se convertit de nouveau.
  perform pg_temp.agir_comme('commercial');
  v_cmd2 := public.convert_sales_quote_to_order(v_devis);
  perform pg_temp.redevenir_service();

  if v_cmd2 is null or v_cmd2 = v_cmd then
    raise exception 'La reconversion n''a pas produit une commande nouvelle.';
  end if;

  -- Le prix est TOUJOURS celui du devis, deux conversions plus tard.
  if public.sales_order_total(v_cmd2) <> 245000 then
    raise exception 'La reconversion a relu le catalogue.';
  end if;

  raise notice '[OK] 22. Commande annulée → devis « accepté », reconvertible. Prix toujours figé.';
end $$;


-- --- 23. UNE VARIANTE ÉTRANGÈRE À SON SERVICE : REFUSÉE PAR LA BASE ----------
--
-- 🟥 Un déclencheur lirait `service_variants` À TRAVERS RLS et conclurait
-- « introuvable » pour un appelant sans `catalog.services.view`. La clé
-- étrangère composite, elle, ne dépend d'aucune capacité.
do $$
declare
  v_cat     uuid;
  v_autre   uuid;
  v_vautre  uuid;
  v_devis   uuid;
  v_ok      boolean := false;
begin
  select id into v_cat from recette_obj where cle = 'categorie';

  insert into public.services (service_no, label, category_id, purpose, unit_label)
  values (public.next_number('service'), 'Recette — Autre service', v_cat, 'SALE', 'unité')
  returning id into v_autre;

  select id into v_vautre from public.service_variants where service_id = v_autre and is_default;

  perform pg_temp.agir_comme('commercial');
  v_devis := public.create_sales_quote(
    (select id from recette_obj where cle = 'client'),
    (now() at time zone 'Indian/Comoro')::date);
  perform pg_temp.redevenir_service();

  -- La variante de l'AUTRE service, rattachée au PREMIER : incohérent.
  begin
    insert into public.sales_quote_lines
      (sales_quote_id, service_id, service_variant_id, label, quantity, unit_price)
    values (v_devis, (select id from recette_obj where cle = 'service'), v_vautre,
            'Ligne incohérente', 1, 1000);
  exception when foreign_key_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une variante étrangère à son service a été acceptée sur une ligne de devis.';
  end if;

  -- Une variante SANS service : refusée aussi (les deux colonnes vont ensemble).
  v_ok := false;
  begin
    insert into public.sales_quote_lines
      (sales_quote_id, service_variant_id, label, quantity, unit_price)
    values (v_devis, v_vautre, 'Variante orpheline', 1, 1000);
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une variante sans service a été acceptée.';
  end if;

  raise notice '[OK] 23. Variante étrangère ou orpheline : refusées par la base, sans déclencheur.';
end $$;


-- --- 24. UNE FACTURE NE NAÎT PAS D'UNE COMMANDE *ET* D'UNE LOCATION ----------
--
-- Les deux origines sont étanches : le montant se compterait deux fois.
do $$
declare
  v_ok boolean := false;
begin
  begin
    insert into public.customer_invoices
      (invoice_no, client_id, sales_order_id, rental_id, invoice_date)
    values ('FAC-C-TEST-000002',
            (select id from recette_obj where cle = 'client'),
            (select id from recette_obj where cle = 'commande'),
            (select id from public.rentals limit 1),
            (now() at time zone 'Indian/Comoro')::date);
  exception when others then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une facture a pu naître d''une commande ET d''une location.';
  end if;

  raise notice '[OK] 24. Commande et location sont deux origines étanches.';
end $$;


-- --- 25. LES ACQUIS DE LA FACTURATION DE LOCATION SONT INTACTS --------------
do $$
declare
  v_manquants text[];
begin
  select array_agg(i) into v_manquants
  from unnest(array[
    'customer_invoices_one_per_fixed_rental_idx',
    'customer_invoices_one_per_period_idx',
    'customer_invoices_one_per_order_idx'
  ]) i
  where not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = i
  );

  if v_manquants is not null then
    raise exception 'Index d''unicité de facturation absent : %', v_manquants;
  end if;

  -- Le journal n'a pas perdu ses correspondances, et le commerce y est entré.
  if public.audit_detail_permission('rental_billing_periods') is null
     or public.audit_detail_permission('service_variant_costs') <> 'catalog.services.cost.view'
     or public.audit_detail_permission('rental_segment_costs') <> 'rental.pricing.supplier.view'
     or public.audit_detail_permission('sales_quotes') <> 'commerce.sales_quotes.view'
     or public.audit_detail_permission('sales_orders') <> 'commerce.sales_orders.view' then
    raise exception 'Le journal d''activité a perdu une correspondance, ou le commerce n''y figure pas.';
  end if;

  raise notice '[OK] 25. Trois index d''unicité, journal complet : aucun acquis perdu.';
end $$;


-- --- 26. L'AUDIT A VU PASSER LES ACTES ---------------------------------------
do $$
declare
  v_n int;
begin
  select count(*) into v_n from public.audit_log
  where entity_type in ('sales_quotes', 'sales_orders')
    and entity_id in (
      (select id::text from recette_obj where cle = 'devis'),
      (select id::text from recette_obj where cle = 'commande')
    );

  if v_n = 0 then
    raise exception 'Aucun acte commercial n''a été journalisé.';
  end if;

  -- Un changement de statut est qualifié comme tel (§34).
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'sales_quotes' and action = 'STATUS_CHANGE'
      and entity_id = (select id::text from recette_obj where cle = 'devis')
  ) then
    raise exception 'Les changements de statut du devis ne sont pas qualifiés.';
  end if;

  raise notice '[OK] 26. Le journal porte % événements du commerce client, statuts qualifiés.', v_n;
end $$;


-- --- 27. AUCUNE SUPPRESSION D'UN ACTE COMMERCIAL -----------------------------
do $$
declare
  v_n int := 0;
begin
  perform pg_temp.agir_comme('commercial');

  begin delete from public.sales_quotes where id = (select id from recette_obj where cle = 'devis');
  exception when others then v_n := v_n + 1; end;

  begin delete from public.sales_orders where id = (select id from recette_obj where cle = 'commande');
  exception when others then v_n := v_n + 1; end;

  perform pg_temp.redevenir_service();

  if v_n <> 2 then
    raise exception 'Un acte commercial a pu être supprimé : % refus sur 2.', v_n;
  end if;

  raise notice '[OK] 27. Ni un devis ni une commande ne se supprime — ils s''annulent.';
end $$;


rollback;
