-- =============================================================================
-- ADIKOM PILOT — Recette Commerce fournisseur : devis et commandes
-- LOT 26 (Module 11, menus 3 et 4)
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur ne
-- peuvent garantir :
--
--   · les SEIZE capacités existent, avec leur action et leur sensibilité — et
--     aucune n'a été inventée sous `commerce.purchase_` ;
--   · 🟥 les DEUX capacités de LECTURE sont SENSIBLES : elles ouvrent un coût
--     d'achat (Plan 02 §6, DEC-044) ;
--   · les QUATRE tables existent, RLS activée, suppression et TRUNCATE refermés ;
--   · AUCUNE colonne de coût de catalogue ni de marge sur une ligne d'achat ;
--   · 🟥 P-5 EST INTACT : `service_variant_costs` n'a reçu aucun `supplier_id` ;
--   · les fonctions ne sont pas `SECURITY DEFINER` (doctrine D4) ;
--   · 🟥 LE PRIX EST CELUI DE L'OFFRE : le coût de référence du catalogue ne le
--     détermine pas, et un changement de ce coût ne réécrit rien ;
--   · 🟩 A-13 : une ligne libre coexiste avec une ligne de catalogue ;
--   · les lignes d'un devis ENREGISTRÉ sont figées — ajout, modification,
--     archivage —, sa RÉFÉRENCE EXTERNE et ses CONDITIONS aussi ;
--   · la CONVERSION crée un acte nouveau et CONSERVE l'offre ;
--   · un devis fournisseur ne produit PAS deux commandes ;
--   · la FACTURE née d'une commande est une `supplier_invoices` ORDINAIRE, avec
--     les lignes de la commande, `amount = quantité × prix` garanti par la base ;
--   · une commande ne porte PAS deux factures vivantes ;
--   · l'annulation d'une facture rend la commande à « passée », et l'annulation
--     d'une commande rend son devis à « retenu » ;
--   · une variante étrangère à son service est REFUSÉE PAR LA BASE ;
--   · 🟥 AUCUNE ÉCRITURE DE TRÉSORERIE n'est créée par un devis, une commande ni
--     une facture préparée ;
--   · les acquis des LOTS 5, 6 et 25 sont intacts ;
--   · le périmètre de SAUVEGARDE porte les quatre tables, dans l'ordre.
--
-- Exécution :
--   npm run db:verify:purchasing
--
-- CE SCRIPT S'EXÉCUTE AVEC LE RÔLE DE LA CHAÎNE DE CONNEXION.
--
-- Ce rôle CONTOURNE RLS : les refus de LECTURE s'éprouvent donc par la forme des
-- policies ici, et par de VRAIES SESSIONS dans `verify:purchasing`. Les refus
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
    'commerce.purchase_quotes.view', 'commerce.purchase_quotes.create',
    'commerce.purchase_quotes.update', 'commerce.purchase_quotes.validate',
    'commerce.purchase_quotes.cancel', 'commerce.purchase_quotes.export',
    'commerce.purchase_quotes.download', 'commerce.purchase_quotes.print',
    'commerce.purchase_orders.view', 'commerce.purchase_orders.create',
    'commerce.purchase_orders.update', 'commerce.purchase_orders.validate',
    'commerce.purchase_orders.cancel', 'commerce.purchase_orders.export',
    'commerce.purchase_orders.download', 'commerce.purchase_orders.print'
  ];
  v_manquantes text[];
  v_inconnues  text[];
begin
  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_manquantes is not null then
    raise exception 'Capacités du LOT 26 absentes : %', v_manquantes;
  end if;

  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.code like 'commerce.purchase_%' and not (p.code = any (v_attendu));

  if v_inconnues is not null then
    raise exception 'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  -- AUCUNE capacité de remise, de marge, de coût de catalogue ni de facturation
  -- propre : le lot ne les livre pas (CLAUDE.md §19 bis).
  if exists (
    select 1 from public.permissions
    where code like 'commerce.purchase_%'
      and (code like '%discount%' or code like '%margin%' or code like '%cost%'
        or code like '%invoice%' or code like '%receipt%')
  ) then
    raise exception 'Une capacité de remise, de marge, de coût ou de facturation a été créée.';
  end if;

  -- Les six capacités documentaires et d'export sont sensibles.
  if exists (
    select 1 from public.permissions
    where code like 'commerce.purchase_%'
      and action in ('EXPORT', 'DOWNLOAD', 'PRINT')
      and is_sensitive is not true
  ) then
    raise exception 'Une capacité documentaire du commerce fournisseur n''est pas sensible.';
  end if;

  /*
   * 🟥 LES DEUX LECTURES SONT SENSIBLES — et c'est la barrière de
   * confidentialité du lot.
   *
   * Un devis fournisseur ne porte rien d'autre qu'un prix d'achat : lui retirer
   * ses montants ne laisserait qu'un nom et une date. Le Plan 02 §10.2 ne prévoit
   * donc AUCUNE capacité de montants pour ces menus — `view` EST la barrière, et
   * elle est marquée comme telle, au même titre que `catalog.services.cost.view`
   * et `rental.pricing.supplier.view` (Plan 02 §6, DEC-044).
   */
  if exists (
    select 1 from public.permissions
    where code in ('commerce.purchase_quotes.view', 'commerce.purchase_orders.view')
      and is_sensitive is not true
  ) then
    raise exception
      'La lecture d''un acte d''achat n''est pas marquée sensible : elle ouvre pourtant un coût d''acquisition.';
  end if;

  -- 🟥 AUCUN SECOND MODULE « ACHATS » : Plan 02 §7.1 place les quatre menus sous
  -- Commerce, ordre 11. Les menus 3 et 4 suivent les deux du commerce client.
  if exists (
    select 1 from public.permissions
    where code like 'commerce.purchase_%'
      and (module_code <> 'commerce' or module_order <> 11)
  ) then
    raise exception 'Le commerce fournisseur n''est pas sous le module `commerce` (ordre 11).';
  end if;

  if not exists (
    select 1 from public.permissions
    where code like 'commerce.purchase_quotes.%' and menu_order = 3
  ) or not exists (
    select 1 from public.permissions
    where code like 'commerce.purchase_orders.%' and menu_order = 4
  ) then
    raise exception
      'Les menus du commerce fournisseur ne portent pas les ordres 3 et 4 (Plan 01 §17.2).';
  end if;

  -- LES SEIZE DU LOT 25 SONT INTACTES : ce lot n'en retire aucune.
  if (select count(*) from public.permissions where code like 'commerce.sales_%') <> 16 then
    raise exception 'Le commerce client ne porte plus ses seize capacités.';
  end if;

  raise notice
    '[OK] 1. Seize capacités d''achat, huit sensibles dont les deux lectures, aucune inventée.';
end $$;


-- --- 2. LES QUATRE TABLES, REFERMÉES -----------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'purchase_quotes', 'purchase_quote_lines', 'purchase_orders', 'purchase_order_lines'
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
-- 🟥 Consulter les devis fournisseurs n'ouvre PAS les commandes, et
-- réciproquement (A-14). Et NI L'UN NI L'AUTRE n'est ouvert par une capacité du
-- commerce CLIENT : ce sont quatre menus, quatre capacités.
do $$
declare
  v_def text;
begin
  select pg_get_expr(polqual, polrelid) into v_def
  from pg_policy where polname = 'purchase_quotes_select';

  if v_def not like '%commerce.purchase_quotes.view%' then
    raise exception 'La lecture des devis fournisseurs ne cite pas sa capacité.';
  end if;
  if v_def like '%purchase_orders%' or v_def like '%sales_%' then
    raise exception 'La lecture des devis fournisseurs est ouverte par une capacité voisine.';
  end if;

  select pg_get_expr(polqual, polrelid) into v_def
  from pg_policy where polname = 'purchase_orders_select';

  if v_def not like '%commerce.purchase_orders.view%' then
    raise exception 'La lecture des commandes fournisseurs ne cite pas sa capacité.';
  end if;
  if v_def like '%purchase_quotes%' or v_def like '%sales_%' then
    raise exception 'La lecture des commandes fournisseurs est ouverte par une capacité voisine.';
  end if;

  -- Les lignes se lisent avec leur document, et rien de plus.
  select pg_get_expr(polqual, polrelid) into v_def
  from pg_policy where polname = 'purchase_quote_lines_select';
  if v_def not like '%commerce.purchase_quotes.view%' then
    raise exception 'Les lignes de devis fournisseur ne suivent pas la lecture de leur devis.';
  end if;

  select pg_get_expr(polqual, polrelid) into v_def
  from pg_policy where polname = 'purchase_order_lines_select';
  if v_def not like '%commerce.purchase_orders.view%' then
    raise exception 'Les lignes de commande fournisseur ne suivent pas la lecture de leur commande.';
  end if;

  /*
   * L'écriture d'une commande admet `billing.supplier_invoices.create` et
   * `.cancel` — il le faut, sans quoi la facturation échouerait au niveau de RLS
   * avant d'atteindre le déclencheur. C'est CE DERNIER qui restreint ces deux
   * capacités aux seuls passages `→ INVOICED` et `INVOICED → CONFIRMED`.
   */
  select pg_get_expr(polqual, polrelid) into v_def
  from pg_policy where polname = 'purchase_orders_update';

  if v_def not like '%billing.supplier_invoices.create%'
     or v_def not like '%billing.supplier_invoices.cancel%' then
    raise exception
      'La policy d''écriture des commandes fournisseurs n''admet pas la facturation : facturer échouerait au niveau de RLS.';
  end if;

  -- 🟥 UNE GARDE DE RLS S'ÉVALUE PAR LIGNE : `has_permission` est enveloppée
  -- dans un sous-select, sinon la liste coûterait un appel par ligne.
  if exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname in ('purchase_quotes', 'purchase_quote_lines',
                        'purchase_orders', 'purchase_order_lines')
      and coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%has_permission%'
      and coalesce(pg_get_expr(p.polqual, p.polrelid), '') not like '%( SELECT%'
  ) then
    raise exception
      'Une garde de RLS appelle `has_permission` sans sous-select : elle coûterait un appel par ligne.';
  end if;

  raise notice '[OK] 3. Chaque policy cite la capacité de son menu, et rien d''autre.';
end $$;


-- --- 4. AUCUN COÛT DE CATALOGUE SUR UNE LIGNE D'ACHAT · P-5 INTACT ----------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('purchase_quote_lines', 'purchase_order_lines')
      and (column_name like '%cost%' or column_name like '%margin%'
        or column_name like '%commission%')
  ) then
    raise exception
      'Une colonne de coût de catalogue ou de marge figure sur une ligne d''achat.';
  end if;

  /*
   * 🟥 P-5 SORT DE CE LOT COMME IL Y EST ENTRÉ.
   *
   * « Un service a-t-il un prix d'achat unique, ou un prix par fournisseur ? »
   * reste OUVERT (Plan 02 §15). Le commerce fournisseur fonctionne sans le
   * trancher : son prix est celui de l'offre, porté par l'acte. Ajouter un
   * `supplier_id` à `service_variant_costs` l'aurait tranché sans décision.
   */
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_variant_costs'
      and column_name = 'supplier_id'
  ) then
    raise exception
      '`service_variant_costs` a reçu un `supplier_id` : P-5 aurait été tranché sans décision.';
  end if;

  -- `commercial_line_costs` relève du LOT 28.
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'commercial_line_costs'
  ) then
    raise exception '`commercial_line_costs` est créée alors qu''elle relève du LOT 28.';
  end if;

  -- AUCUNE table de produit, aucun stock : la Direction a validé « Services
  -- maintenant, Produits plus tard ».
  if exists (
    select 1 from pg_tables
    where schemaname = 'public'
      and tablename in ('products', 'product_variants', 'stock_movements',
                        'warehouses', 'stock_levels', 'goods_receipts')
  ) then
    raise exception 'Une table de produit, de stock ou de réception a été créée.';
  end if;

  -- AUCUNE fonction de marge : « on n'a pas de marge sur un achat ».
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'purchase%margin%'
  ) then
    raise exception 'Une fonction de marge d''achat a été créée.';
  end if;

  raise notice
    '[OK] 4. Aucun coût de catalogue sur une ligne d''achat, P-5 intact, aucun produit ni stock.';
end $$;


-- --- 5. DOCTRINE D4 — aucun acte d'achat en SECURITY DEFINER ----------------
do $$
declare
  v_fautes text[];
begin
  select array_agg(p.proname) into v_fautes
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (p.proname like 'purchase_%'
      or p.proname in ('create_purchase_quote', 'update_purchase_quote',
                       'add_purchase_quote_line', 'archive_purchase_quote_line',
                       'set_purchase_quote_status', 'create_purchase_order',
                       'update_purchase_order', 'add_purchase_order_line',
                       'archive_purchase_order_line', 'set_purchase_order_status',
                       'convert_purchase_quote_to_order',
                       'create_invoice_from_purchase_order',
                       'fn_purchase_quote_transition', 'fn_purchase_order_transition',
                       'fn_purchase_quote_line_guard', 'fn_purchase_order_line_guard',
                       'fn_supplier_invoice_purchase_coherence'));

  if v_fautes is not null then
    raise exception 'Fonction du commerce fournisseur en SECURITY DEFINER : %', v_fautes;
  end if;

  /*
   * ⚠ UNE SEULE VERSION DE CHAQUE FONCTION ÉTENDUE.
   *
   * Deux surcharges de `create_supplier_invoice` rendraient tout appel par
   * paramètres nommés ambigu — et PostgREST n'appelle QUE par paramètres
   * nommés. Ce serait une panne totale de la facturation fournisseur.
   */
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_supplier_invoice') <> 1
  or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'add_supplier_invoice_line') <> 1 then
    raise exception 'Une fonction de facturation fournisseur existe en plusieurs versions.';
  end if;

  raise notice '[OK] 5. Aucune fonction d''achat en SECURITY DEFINER, aucune surcharge.';
end $$;


-- --- 6. PÉRIMÈTRE DE SAUVEGARDE ----------------------------------------------
do $$
declare
  v_scope text[] := public.backup_scope();
  v_paire text;
  v_enf   int;
  v_par   int;
begin
  if not ('purchase_quotes' = any (v_scope)) or not ('purchase_quote_lines' = any (v_scope))
     or not ('purchase_orders' = any (v_scope)) or not ('purchase_order_lines' = any (v_scope)) then
    raise exception 'Le commerce fournisseur est hors du périmètre de sauvegarde.';
  end if;

  foreach v_paire in array array[
    'purchase_quotes:suppliers',
    'purchase_quote_lines:purchase_quotes',
    'purchase_quote_lines:service_variants',
    'purchase_orders:purchase_quotes',
    'purchase_order_lines:purchase_orders',
    'purchase_order_lines:purchase_quote_lines',
    'supplier_invoices:purchase_orders'
  ] loop
    v_enf := array_position(v_scope, split_part(v_paire, ':', 1));
    v_par := array_position(v_scope, split_part(v_paire, ':', 2));

    if v_enf is null or v_par is null or v_enf < v_par then
      raise exception 'Ordre du périmètre invalide : « % » précède « % ».',
        split_part(v_paire, ':', 1), split_part(v_paire, ':', 2);
    end if;
  end loop;

  -- `backup_columns` rend bien le prix de l'offre ET la référence du
  -- fournisseur : sans eux, le montant négocié serait perdu à la restauration —
  -- le catalogue n'en garde AUCUNE trace, c'est tout l'objet de P-5.
  if public.backup_columns('purchase_quote_lines') not like '%unit_price%' then
    raise exception '`backup_columns` ne rend pas le prix des lignes de devis fournisseur.';
  end if;

  if public.backup_columns('purchase_quotes') not like '%external_ref%' then
    raise exception '`backup_columns` ne rend pas la référence du fournisseur.';
  end if;

  raise notice
    '[OK] 6. Périmètre de sauvegarde à % tables, commerce fournisseur compris et ordonné.',
    array_length(v_scope, 1);
end $$;


-- =============================================================================
-- SUJETS DE RECETTE
-- =============================================================================

create temporary table recette_ach (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_ids  uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_cles text[] := array['acheteur', 'lecteur', 'comptable'];
  v_i    int;
begin
  for v_i in 1 .. 3 loop
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (
      v_ids[v_i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'recette.ach.' || v_cles[v_i] || '@adikom.test', now(), now()
    );
    insert into recette_ach (cle, id) values (v_cles[v_i], v_ids[v_i]);
  end loop;

  insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
  values
    (v_ids[1], 'Recette', 'Ach acheteur', 'recette.ach.acheteur',
     'recette.ach.acheteur@adikom.test', 'ACTIVE', false),
    (v_ids[2], 'Recette', 'Ach lecteur',  'recette.ach.lecteur',
     'recette.ach.lecteur@adikom.test',   'ACTIVE', false),
    (v_ids[3], 'Recette', 'Ach comptable','recette.ach.comptable',
     'recette.ach.comptable@adikom.test', 'ACTIVE', false);

  /*
   * L'ACHETEUR — il mène l'offre et la commande de bout en bout.
   *
   * Il n'a AUCUNE capacité de facturation fournisseur : c'est ce qui permet
   * d'éprouver qu'enregistrer la facture d'une commande exige
   * `billing.supplier_invoices.create`, et non la seule capacité de lire la
   * commande.
   *
   * Il n'a PAS `catalog.services.cost.view` : un acheteur peut négocier sans
   * connaître le coût de référence interne — et le lot doit fonctionner sans.
   */
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[1], p.id, 'ALLOW'
  from public.permissions p
  where p.code in (
    'commerce.purchase_quotes.view', 'commerce.purchase_quotes.create',
    'commerce.purchase_quotes.update', 'commerce.purchase_quotes.validate',
    'commerce.purchase_quotes.cancel',
    'commerce.purchase_orders.view', 'commerce.purchase_orders.create',
    'commerce.purchase_orders.update', 'commerce.purchase_orders.validate',
    'commerce.purchase_orders.cancel',
    'catalog.services.view', 'parties.suppliers.view'
  );

  -- LE LECTEUR : il consulte les offres et les commandes, et rien d'autre.
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[2], p.id, 'ALLOW'
  from public.permissions p
  where p.code in (
    'commerce.purchase_quotes.view', 'commerce.purchase_orders.view',
    'catalog.services.view', 'parties.suppliers.view'
  );

  /*
   * LE COMPTABLE : il lit les commandes et tient la facturation fournisseur. Il
   * ne crée ni offre ni commande.
   *
   * ⚠ `billing.imputations.view` et `billing.supplier_payments.view` ne sont PAS
   * des conforts : depuis les LOTS 5 et 6, annuler une facture est refusé à qui
   * ne peut lire ni les imputations qui la réduisent, ni les règlements qui la
   * soldent — « une garde qui compte doit compter la vérité ». Le commerce
   * fournisseur hérite de ces exigences sans les modifier.
   */
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[3], p.id, 'ALLOW'
  from public.permissions p
  where p.code in (
    'commerce.purchase_orders.view', 'commerce.purchase_quotes.view',
    'billing.supplier_invoices.view', 'billing.supplier_invoices.create',
    'billing.supplier_invoices.update', 'billing.supplier_invoices.validate',
    'billing.supplier_invoices.cancel',
    'billing.imputations.view', 'billing.supplier_payments.view',
    'catalog.services.view', 'parties.suppliers.view'
  );

  raise notice
    '[OK] 7. Trois profils : acheteur sans facturation, lecteur seul, comptable sans achat.';
end $$;


create or replace function pg_temp.agir_comme(p_cle text)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from recette_ach where cle = p_cle;
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


-- --- 8. LE DÉCOR : un fournisseur, un service d'achat, deux variantes --------
create temporary table recette_obj (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_sup     uuid;
  v_cat     uuid;
  v_service uuid;
  v_std     uuid;
  v_prem    uuid;
  v_today   date := (now() at time zone 'Indian/Comoro')::date;
begin
  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'SERVICE_PROVIDER', 'RECETTE ACHAT SARL',
          '+269 300 11 11', 'ACTIVE')
  returning id into v_sup;
  insert into recette_obj values ('fournisseur', v_sup);

  insert into public.service_categories (code, label)
  values ('RECETTE-ACH', 'Recette — Achats')
  returning id into v_cat;
  insert into recette_obj values ('categorie', v_cat);

  -- `PURCHASE` : un service ACHETÉ. C'est ce que l'éditeur de lignes propose.
  -- `services_default_variant` pose la variante « Standard » d'office.
  insert into public.services (service_no, label, category_id, purpose, status, unit_label)
  values (public.next_number('service'), 'Recette — Prestation achetée', v_cat,
          'PURCHASE', 'ACTIVE', 'intervention')
  returning id into v_service;
  insert into recette_obj values ('service', v_service);

  select id into v_std from public.service_variants where service_id = v_service and is_default;
  insert into recette_obj values ('standard', v_std);

  insert into public.service_variants (service_id, label, is_default, is_active)
  values (v_service, 'Renforcée', false, true)
  returning id into v_prem;
  insert into recette_obj values ('renforcee', v_prem);

  /*
   * 🟥 LE COÛT DE RÉFÉRENCE DU CATALOGUE — 40 000 KMF.
   *
   * Il est posé pour que la recette puisse démontrer qu'il N'EST PAS APPLIQUÉ :
   * l'offre du fournisseur sera enregistrée à 52 000, et c'est 52 000 qui sera
   * figé sur la ligne. Sans ce coût, la démonstration ne prouverait rien.
   */
  perform public.set_service_cost(v_std, 40000, v_today - 30, 'Coût de référence de recette');

  raise notice
    '[OK] 8. Décor posé : un fournisseur, un service acheté, deux variantes, un coût de référence.';
end $$;


-- --- 9. L'OFFRE REÇUE — trois lignes, dont une libre (A-13) ------------------
do $$
declare
  v_quote uuid;
  v_sup   uuid := (select id from recette_obj where cle = 'fournisseur');
  v_std   uuid := (select id from recette_obj where cle = 'standard');
  v_prem  uuid := (select id from recette_obj where cle = 'renforcee');
  v_total bigint;
  v_no    text;
  v_ref   text;
begin
  perform pg_temp.agir_comme('acheteur');

  v_quote := public.create_purchase_quote(
    v_sup,
    (now() at time zone 'Indian/Comoro')::date,
    (now() at time zone 'Indian/Comoro')::date + 20,
    'PRO-RECETTE-4471',
    'Offre de recette',
    'Livraison sous 15 jours, transport inclus.'
  );
  insert into recette_obj values ('devis', v_quote);

  -- TYPE A — deux lignes de catalogue, au prix de L'OFFRE.
  perform public.add_purchase_quote_line(v_quote, 3, 52000, v_std, null);
  perform public.add_purchase_quote_line(v_quote, 1, 90000, v_prem, null);

  -- 🟩 A-13 — TYPE B, une ligne libre, sans aucun service au catalogue.
  perform public.add_purchase_quote_line(
    v_quote, 2, 7500, null, 'Pièce détachée hors catalogue');

  v_total := public.purchase_quote_total(v_quote);
  perform pg_temp.redevenir_service();

  if v_total <> 3 * 52000 + 90000 + 2 * 7500 then
    raise exception 'Total de l''offre incorrect : % KMF.', v_total;
  end if;

  select quote_no, external_ref into v_no, v_ref
  from public.purchase_quotes where id = v_quote;

  if v_no not like 'DEV-F-%' then
    raise exception 'Le devis fournisseur ne porte pas le préfixe DEV-F : %.', v_no;
  end if;

  -- 🟥 LES DEUX RÉFÉRENCES COEXISTENT, et jamais l'une à la place de l'autre.
  if v_ref <> 'PRO-RECETTE-4471' then
    raise exception 'La référence du fournisseur n''a pas été conservée : %.', v_ref;
  end if;

  if v_no = v_ref then
    raise exception 'Le numéro interne et la référence du fournisseur ont été confondus.';
  end if;

  -- Une ligne libre existe, et elle ne porte aucun service.
  if not exists (
    select 1 from public.purchase_quote_lines
    where purchase_quote_id = v_quote and service_id is null and service_variant_id is null
  ) then
    raise exception 'La ligne libre (A-13) n''a pas été enregistrée.';
  end if;

  raise notice
    '[OK] 9. Offre DEV-F à trois lignes — deux du catalogue, une libre (A-13). Total : % KMF.', v_total;
end $$;


-- --- 10. 🟥 LE PRIX EST CELUI DE L'OFFRE, PAS CELUI DU CATALOGUE ------------
do $$
declare
  v_std    uuid := (select id from recette_obj where cle = 'standard');
  v_quote  uuid := (select id from recette_obj where cle = 'devis');
  v_ligne  bigint;
  v_ref    bigint;
begin
  select unit_price into v_ligne
  from public.purchase_quote_lines
  where purchase_quote_id = v_quote and service_variant_id = v_std;

  select r.amount into v_ref
  from public.resolve_service_cost(v_std, (now() at time zone 'Indian/Comoro')::date) r;

  if v_ref is distinct from 40000 then
    raise exception
      'Le décor est faux : le coût de référence attendu était 40 000, obtenu %.', v_ref;
  end if;

  /*
   * LA DÉMONSTRATION DU LOT.
   *
   * Le catalogue dit 40 000 ; ce fournisseur propose 52 000 ; la ligne porte
   * 52 000. Le coût de référence n'a AUCUN effet sur l'acte — il n'a pas de
   * dimension fournisseur (P-5, ouvert), et l'appliquer ferait passer une valeur
   * interne pour une offre reçue.
   */
  if v_ligne <> 52000 then
    raise exception
      'La ligne ne porte pas le prix de l''offre : % au lieu de 52 000.', v_ligne;
  end if;

  raise notice
    '[OK] 10. 🟥 Coût de référence 40 000, offre 52 000 : la ligne porte le prix de l''offre.';
end $$;


-- --- 11. LES REFUS DE SAISIE -------------------------------------------------
do $$
declare
  v_quote uuid := (select id from recette_obj where cle = 'devis');
  v_std   uuid := (select id from recette_obj where cle = 'standard');
  v_n     int := 0;
begin
  perform pg_temp.agir_comme('acheteur');

  -- Quantité nulle.
  begin perform public.add_purchase_quote_line(v_quote, 0, 1000, v_std, null);
  exception when others then v_n := v_n + 1; end;

  -- Prix absent — sur une ligne de catalogue comme sur une ligne libre.
  begin perform public.add_purchase_quote_line(v_quote, 1, null, v_std, null);
  exception when others then v_n := v_n + 1; end;

  begin perform public.add_purchase_quote_line(v_quote, 1, null, null, 'Sans prix');
  exception when others then v_n := v_n + 1; end;

  -- Prix nul.
  begin perform public.add_purchase_quote_line(v_quote, 1, 0, null, 'Prix nul');
  exception when others then v_n := v_n + 1; end;

  -- Ligne libre sans désignation.
  begin perform public.add_purchase_quote_line(v_quote, 1, 5000, null, '   ');
  exception when others then v_n := v_n + 1; end;

  perform pg_temp.redevenir_service();

  if v_n <> 5 then
    raise exception 'Saisie invalide acceptée : % refus sur 5.', v_n;
  end if;

  raise notice
    '[OK] 11. Quantité nulle, prix absent ou nul, désignation vide : cinq refus.';
end $$;


-- --- 12. ENREGISTRER L'OFFRE EXIGE `validate` -------------------------------
do $$
declare
  v_quote  uuid := (select id from recette_obj where cle = 'devis');
  v_refus  int := 0;
  v_statut public.commercial_document_status;
begin
  -- Le LECTEUR ne fait pas avancer l'offre.
  perform pg_temp.agir_comme('lecteur');
  begin
    perform public.set_purchase_quote_status(v_quote, 'SENT', 'Tentative');
  exception when others then v_refus := v_refus + 1; end;

  -- L'ACHETEUR, oui.
  perform pg_temp.agir_comme('acheteur');
  perform public.set_purchase_quote_status(v_quote, 'SENT', 'Offre reçue du fournisseur');

  select status into v_statut from public.purchase_quotes where id = v_quote;
  if v_statut <> 'SENT' then
    raise exception 'L''offre n''a pas été enregistrée : %.', v_statut;
  end if;

  -- Une offre enregistrée ne revient pas en brouillon.
  begin
    perform public.set_purchase_quote_status(v_quote, 'DRAFT', 'Retour arrière');
    v_refus := v_refus - 1;
  exception when others then v_refus := v_refus + 1; end;

  perform pg_temp.redevenir_service();

  if v_refus <> 2 then
    raise exception 'Le cycle de l''offre est mal gardé : % refus attendus, 2.', v_refus;
  end if;

  raise notice
    '[OK] 12. Enregistrer exige `validate` ; une offre enregistrée ne revient pas en brouillon.';
end $$;


-- --- 13. UNE OFFRE ENREGISTRÉE EST FIGÉE ------------------------------------
do $$
declare
  v_quote uuid := (select id from recette_obj where cle = 'devis');
  v_std   uuid := (select id from recette_obj where cle = 'standard');
  v_sup2  uuid;
  v_ligne uuid;
  v_n     int := 0;
begin
  select id into v_ligne from public.purchase_quote_lines
  where purchase_quote_id = v_quote limit 1;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'SERVICE_PROVIDER', 'RECETTE ACHAT AUTRE',
          '+269 300 22 22', 'ACTIVE')
  returning id into v_sup2;
  insert into recette_obj values ('fournisseur2', v_sup2);

  perform pg_temp.agir_comme('acheteur');

  -- Ajouter une ligne.
  begin perform public.add_purchase_quote_line(v_quote, 1, 1000, v_std, null);
  exception when others then v_n := v_n + 1; end;

  -- Modifier une ligne par `UPDATE` direct.
  begin
    update public.purchase_quote_lines set unit_price = 1 where id = v_ligne;
  exception when others then v_n := v_n + 1; end;

  -- Archiver une ligne : RETIRER change le total aussi sûrement que MODIFIER.
  begin perform public.archive_purchase_quote_line(v_ligne);
  exception when others then v_n := v_n + 1; end;

  -- Changer de fournisseur.
  begin
    update public.purchase_quotes set supplier_id = v_sup2 where id = v_quote;
  exception when others then v_n := v_n + 1; end;

  -- 🟥 LA RÉFÉRENCE EXTERNE EST DANS LE GEL : la laisser réécrivable permettrait
  -- de faire passer une offre enregistrée pour une autre.
  begin
    update public.purchase_quotes set external_ref = 'PRO-AUTRE' where id = v_quote;
  exception when others then v_n := v_n + 1; end;

  -- Les CONDITIONS sont gelées (leçon de la migration 100, appliquée d'emblée).
  begin
    update public.purchase_quotes set terms = 'Autres conditions' where id = v_quote;
  exception when others then v_n := v_n + 1; end;

  -- L'en-tête ne se modifie plus par la fonction non plus.
  begin
    perform public.update_purchase_quote(
      v_quote, (now() at time zone 'Indian/Comoro')::date, null, 'X', null, null);
  exception when others then v_n := v_n + 1; end;

  perform pg_temp.redevenir_service();

  if v_n <> 7 then
    raise exception 'Une offre enregistrée a pu être réécrite : % refus sur 7.', v_n;
  end if;

  raise notice
    '[OK] 13. Offre enregistrée : lignes, fournisseur, référence externe et conditions figés.';
end $$;


-- --- 13 bis. ANNOTER, C'EST MODIFIER ----------------------------------------
do $$
declare
  v_quote uuid := (select id from recette_obj where cle = 'devis');
  v_n     int := 0;
begin
  -- Le LECTEUR ne peut pas annoter — même si la policy d'écriture ne le voit pas.
  perform pg_temp.agir_comme('lecteur');
  begin
    update public.purchase_quotes set notes = 'Annotation interdite' where id = v_quote;
    -- Sans droit d'écriture, RLS ne modifie AUCUNE ligne et ne lève pas : c'est
    -- l'effet qu'on mesure, pas l'exception.
  exception when others then null; end;

  perform pg_temp.redevenir_service();

  if exists (
    select 1 from public.purchase_quotes
    where id = v_quote and notes = 'Annotation interdite'
  ) then
    raise exception 'Un lecteur a pu annoter une offre fournisseur.';
  end if;

  -- L'ACHETEUR, qui détient `update`, le peut — dans tous les états.
  perform pg_temp.agir_comme('acheteur');
  update public.purchase_quotes set notes = 'Relance du fournisseur le 12' where id = v_quote;
  perform pg_temp.redevenir_service();

  if not exists (
    select 1 from public.purchase_quotes
    where id = v_quote and notes = 'Relance du fournisseur le 12'
  ) then
    raise exception 'Le porteur de `update` n''a pas pu annoter une offre enregistrée.';
  end if;

  v_n := 1;
  if v_n <> 1 then raise exception 'Contrôle incohérent.'; end if;

  raise notice
    '[OK] 13 bis. Conditions gelées, observations annotables — mais seulement par qui peut modifier.';
end $$;


-- --- 14. 🟥 LE COÛT DU CATALOGUE CHANGE : L'OFFRE NE BOUGE PAS -------------
do $$
declare
  v_std   uuid := (select id from recette_obj where cle = 'standard');
  v_quote uuid := (select id from recette_obj where cle = 'devis');
  v_today date := (now() at time zone 'Indian/Comoro')::date;
  v_ligne bigint;
  v_total bigint;
  v_ref   bigint;
begin
  -- Le coût de référence est relevé à 70 000, à compter d'aujourd'hui — par
  -- l'acte du catalogue, qui clôt la version précédente et en ouvre une nouvelle
  -- (D16 : changer un prix, c'est clore et ouvrir).
  perform public.set_service_cost(v_std, 70000, v_today, 'Révision de recette');

  select r.amount into v_ref from public.resolve_service_cost(v_std, v_today) r;

  if v_ref <> 70000 then
    raise exception 'Le coût de référence n''a pas été relevé : %.', v_ref;
  end if;

  select unit_price into v_ligne
  from public.purchase_quote_lines
  where purchase_quote_id = v_quote and service_variant_id = v_std;

  v_total := public.purchase_quote_total(v_quote);

  if v_ligne <> 52000 then
    raise exception
      'L''offre historique a été réécrite : % au lieu de 52 000.', v_ligne;
  end if;

  if v_total <> 3 * 52000 + 90000 + 2 * 7500 then
    raise exception 'Le total de l''offre a bougé : % KMF.', v_total;
  end if;

  raise notice
    '[OK] 14. 🟥 Coût de référence porté à 70 000 ; l''offre historique reste à 52 000.';
end $$;


-- --- 15. LA CONVERSION — un acte nouveau, l'ancien intact -------------------
do $$
declare
  v_quote  uuid := (select id from recette_obj where cle = 'devis');
  v_order  uuid;
  v_no     text;
  v_lignes int;
  v_total  bigint;
  v_statut public.commercial_document_status;
begin
  perform pg_temp.agir_comme('acheteur');

  perform public.set_purchase_quote_status(v_quote, 'ACCEPTED', 'Offre retenue');

  v_order := public.convert_purchase_quote_to_order(
    v_quote,
    (now() at time zone 'Indian/Comoro')::date,
    (now() at time zone 'Indian/Comoro')::date + 10
  );
  insert into recette_obj values ('commande', v_order);

  v_total := public.purchase_order_total(v_order);
  perform pg_temp.redevenir_service();

  select status into v_statut from public.purchase_quotes where id = v_quote;
  if v_statut <> 'CONVERTED' then
    raise exception 'L''offre n''est pas « convertie » : %.', v_statut;
  end if;

  -- 🟥 L'OFFRE EST CONSERVÉE, avec son numéro et sa référence externe.
  if not exists (
    select 1 from public.purchase_quotes
    where id = v_quote and quote_no like 'DEV-F-%' and external_ref = 'PRO-RECETTE-4471'
  ) then
    raise exception 'L''offre n''a pas été conservée telle qu''elle a été reçue.';
  end if;

  select order_no into v_no from public.purchase_orders where id = v_order;
  if v_no not like 'CDE-F-%' then
    raise exception 'La commande ne porte pas le préfixe CDE-F : %.', v_no;
  end if;

  -- LES PRIX SONT RECOPIÉS, ET LA TRAÇABILITÉ LIGNE À LIGNE EST POSÉE.
  select count(*) into v_lignes
  from public.purchase_order_lines
  where purchase_order_id = v_order and source_quote_line_id is not null;

  if v_lignes <> 3 then
    raise exception 'La traçabilité ligne à ligne est incomplète : % sur 3.', v_lignes;
  end if;

  if v_total <> 3 * 52000 + 90000 + 2 * 7500 then
    raise exception
      'Le total de la commande ne reprend pas celui de l''offre : % KMF.', v_total;
  end if;

  if exists (
    select 1 from public.purchase_order_lines l
    join public.purchase_quote_lines q on q.id = l.source_quote_line_id
    where l.purchase_order_id = v_order and l.unit_price <> q.unit_price
  ) then
    raise exception 'Un prix a été relu au lieu d''être recopié.';
  end if;

  raise notice
    '[OK] 15. Offre conservée (DEV-F, convertie) ; commande CDE-F liée, prix recopiés, 3 lignes tracées.';
end $$;


-- --- 16. UN DEVIS FOURNISSEUR NE PRODUIT PAS DEUX COMMANDES -----------------
do $$
declare
  v_quote uuid := (select id from recette_obj where cle = 'devis');
  v_sup   uuid := (select id from recette_obj where cle = 'fournisseur');
  v_n     int := 0;
begin
  perform pg_temp.agir_comme('acheteur');

  -- Par la fonction.
  begin perform public.convert_purchase_quote_to_order(v_quote, null, null);
  exception when others then v_n := v_n + 1; end;

  perform pg_temp.redevenir_service();

  -- Par un INSERT direct, qui ne passe par aucune fonction : c'est l'INDEX qui
  -- fait autorité.
  begin
    insert into public.purchase_orders (order_no, supplier_id, purchase_quote_id, order_date)
    values ('CDE-F-FORCE-001', v_sup, v_quote,
            (now() at time zone 'Indian/Comoro')::date);
    exception when others then v_n := v_n + 1;
  end;

  if v_n <> 2 then
    raise exception 'Un devis fournisseur a pu produire deux commandes : % refus sur 2.', v_n;
  end if;

  raise notice '[OK] 16. Une seule commande par offre — par la fonction ET par l''index.';
end $$;


-- --- 17. PASSER EXIGE `validate` ; FACTURER EXIGE LA FACTURATION ------------
do $$
declare
  v_order uuid := (select id from recette_obj where cle = 'commande');
  v_n     int := 0;
begin
  perform pg_temp.agir_comme('lecteur');
  begin perform public.set_purchase_order_status(v_order, 'CONFIRMED', 'Tentative');
  exception when others then v_n := v_n + 1; end;

  -- 🟥 L'ACHETEUR passe la commande, mais NE PEUT PAS enregistrer sa facture :
  -- cela relève de `billing.supplier_invoices.create`, et de rien d'autre.
  perform pg_temp.agir_comme('acheteur');
  perform public.set_purchase_order_status(v_order, 'CONFIRMED', 'Commande transmise');

  begin perform public.create_invoice_from_purchase_order(v_order, null, null, null);
  exception when others then v_n := v_n + 1; end;

  perform pg_temp.redevenir_service();

  if v_n <> 2 then
    raise exception 'Le cycle de la commande est mal gardé : % refus sur 2.', v_n;
  end if;

  if (select status from public.purchase_orders where id = v_order) <> 'CONFIRMED' then
    raise exception 'La commande n''a pas été passée.';
  end if;

  raise notice
    '[OK] 17. Passer exige `validate` ; enregistrer la facture exige la capacité de facturation.';
end $$;


-- --- 18. 🟥 LA FACTURE EST UNE `supplier_invoices` ORDINAIRE ----------------
do $$
declare
  v_order   uuid := (select id from recette_obj where cle = 'commande');
  v_invoice uuid;
  v_no      text;
  v_statut  public.supplier_invoice_status;
  v_gross   bigint;
  v_lignes  int;
  v_ecart   int;
begin
  perform pg_temp.agir_comme('comptable');

  v_invoice := public.create_invoice_from_purchase_order(
    v_order,
    (now() at time zone 'Indian/Comoro')::date,
    (now() at time zone 'Indian/Comoro')::date + 30,
    'FA-RECETTE-9012'
  );
  insert into recette_obj values ('facture', v_invoice);

  v_gross := public.supplier_invoice_gross(v_invoice);
  perform pg_temp.redevenir_service();

  select invoice_no, status into v_no, v_statut
  from public.supplier_invoices where id = v_invoice;

  -- MÊME NUMÉROTATION que toute facture fournisseur : aucun second numéroteur.
  if v_no not like 'FAC-F-%' then
    raise exception 'La facture ne porte pas la numérotation ordinaire : %.', v_no;
  end if;

  -- 🟥 ELLE NAÎT EN BROUILLON : reconnaître la dette reste un acte distinct.
  if v_statut <> 'DRAFT' then
    raise exception 'La facture ne naît pas en brouillon : %.', v_statut;
  end if;

  -- La référence du fournisseur est distincte du numéro interne.
  if (select external_ref from public.supplier_invoices where id = v_invoice)
     <> 'FA-RECETTE-9012' then
    raise exception 'La référence de la facture du fournisseur n''a pas été conservée.';
  end if;

  if (select purchase_order_id from public.supplier_invoices where id = v_invoice)
     is distinct from v_order then
    raise exception 'La facture n''est pas rattachée à sa commande.';
  end if;

  if v_gross <> 3 * 52000 + 90000 + 2 * 7500 then
    raise exception 'Le montant brut ne reprend pas celui de la commande : % KMF.', v_gross;
  end if;

  -- LES LIGNES PORTENT LEUR DÉCOMPOSITION, et `amount` reste la source du brut.
  select count(*) into v_lignes
  from public.supplier_invoice_lines
  where supplier_invoice_id = v_invoice and quantity is not null and unit_price is not null;

  if v_lignes <> 3 then
    raise exception 'La décomposition des lignes est incomplète : % sur 3.', v_lignes;
  end if;

  -- 🟥 `amount = quantité × prix` — Plan 02 §18.2, garanti par la base.
  select count(*) into v_ecart
  from public.supplier_invoice_lines
  where supplier_invoice_id = v_invoice
    and quantity is not null
    and amount <> quantity::bigint * unit_price;

  if v_ecart <> 0 then
    raise exception 'Une ligne de facture contredit sa décomposition.';
  end if;

  -- La traçabilité du catalogue est posée sur les lignes qui en viennent.
  if (select count(*) from public.supplier_invoice_lines
      where supplier_invoice_id = v_invoice and service_id is not null) <> 2 then
    raise exception 'Les lignes de catalogue ne sont pas tracées sur la facture.';
  end if;

  -- La commande est passée à « Facturée ».
  if (select status from public.purchase_orders where id = v_order) <> 'INVOICED' then
    raise exception 'La commande n''est pas passée à « facturée ».';
  end if;

  raise notice
    '[OK] 18. 🟥 Facture FAC-F ordinaire, en brouillon, 3 lignes décomposées, % KMF.', v_gross;
end $$;


-- --- 19. UNE COMMANDE NE PORTE PAS DEUX FACTURES VIVANTES -------------------
do $$
declare
  v_order uuid := (select id from recette_obj where cle = 'commande');
  v_sup   uuid := (select id from recette_obj where cle = 'fournisseur');
  v_n     int := 0;
begin
  perform pg_temp.agir_comme('comptable');

  -- Par la fonction.
  begin perform public.create_invoice_from_purchase_order(v_order, null, null, null);
  exception when others then v_n := v_n + 1; end;

  -- Par `create_supplier_invoice`, qui contrôle aussi.
  begin
    perform public.create_supplier_invoice(
      v_sup, (now() at time zone 'Indian/Comoro')::date, null, null, null, v_order);
  exception when others then v_n := v_n + 1; end;

  perform pg_temp.redevenir_service();

  -- Par un INSERT direct : c'est l'INDEX qui fait autorité.
  begin
    insert into public.supplier_invoices (invoice_no, supplier_id, invoice_date, purchase_order_id)
    values ('FAC-F-FORCE-001', v_sup, (now() at time zone 'Indian/Comoro')::date, v_order);
    exception when others then v_n := v_n + 1;
  end;

  if v_n <> 3 then
    raise exception 'Une commande a pu porter deux factures vivantes : % refus sur 3.', v_n;
  end if;

  raise notice '[OK] 19. Une seule facture par commande — par les fonctions ET par l''index.';
end $$;


-- --- 20. LA DETTE SE RECONNAÎT PAR LES ACTES EXISTANTS ----------------------
do $$
declare
  v_invoice uuid := (select id from recette_obj where cle = 'facture');
  v_statut  public.supplier_invoice_status;
  v_n       int := 0;
begin
  perform pg_temp.agir_comme('comptable');

  -- Soumettre, puis valider : les deux fonctions du LOT 5, inchangées.
  perform public.submit_supplier_invoice(v_invoice);
  perform public.validate_supplier_invoice(v_invoice, 'Contrôle fait');

  select status into v_statut from public.supplier_invoices where id = v_invoice;
  if v_statut <> 'VALIDATED' then
    raise exception 'La facture n''a pas été validée : %.', v_statut;
  end if;

  -- Les lignes sont figées après validation — acquis du LOT 5.
  begin perform public.add_supplier_invoice_line(v_invoice, 'Extra', 1000, null, null, null, null, null);
  exception when others then v_n := v_n + 1; end;

  -- 🟥 L'ORIGINE COMMERCIALE EST GELÉE avec la dette.
  begin
    update public.supplier_invoices set purchase_order_id = null where id = v_invoice;
  exception when others then v_n := v_n + 1; end;

  perform pg_temp.redevenir_service();

  if v_n <> 2 then
    raise exception 'Une facture validée a pu être réécrite : % refus sur 2.', v_n;
  end if;

  raise notice
    '[OK] 20. La dette se reconnaît par `submit` puis `validate` ; la facture validée est figée.';
end $$;


-- --- 21. ANNULER LA FACTURE REND LA COMMANDE À « PASSÉE » -------------------
do $$
declare
  v_invoice uuid := (select id from recette_obj where cle = 'facture');
  v_order   uuid := (select id from recette_obj where cle = 'commande');
  v_new     uuid;
begin
  perform pg_temp.agir_comme('comptable');

  perform public.cancel_supplier_invoice(v_invoice, 'Facture erronée');

  if (select status from public.purchase_orders where id = v_order) <> 'CONFIRMED' then
    raise exception
      'La commande n''est pas revenue à « passée » : elle serait facturée sans facture vivante.';
  end if;

  -- Et elle se refacture : l'index partiel s'est bien libéré.
  v_new := public.create_invoice_from_purchase_order(v_order, null, null, 'FA-RECETTE-9013');
  insert into recette_obj values ('facture2', v_new);

  perform pg_temp.redevenir_service();

  if (select status from public.purchase_orders where id = v_order) <> 'INVOICED' then
    raise exception 'La commande n''a pas pu être refacturée.';
  end if;

  raise notice
    '[OK] 21. Facture annulée → commande « passée », refacturable. Aucune impasse.';
end $$;


-- --- 22. ANNULER LA COMMANDE REND L'OFFRE À « RETENUE » ---------------------
do $$
declare
  v_order   uuid := (select id from recette_obj where cle = 'commande');
  v_quote   uuid := (select id from recette_obj where cle = 'devis');
  v_invoice uuid := (select id from recette_obj where cle = 'facture2');
  v_ligne   bigint;
begin
  -- La facture vivante s'annule d'abord : une commande facturée ne s'annule pas.
  perform pg_temp.agir_comme('comptable');
  perform public.cancel_supplier_invoice(v_invoice, 'Nettoyage de recette');

  perform pg_temp.agir_comme('acheteur');
  perform public.set_purchase_order_status(v_order, 'CANCELLED', 'Besoin annulé');
  perform pg_temp.redevenir_service();

  if (select status from public.purchase_quotes where id = v_quote) <> 'ACCEPTED' then
    raise exception
      'L''offre n''est pas revenue à « retenue » : elle resterait convertie sans commande vivante.';
  end if;

  if (select converted_at from public.purchase_quotes where id = v_quote) is not null then
    raise exception 'L''horodatage de conversion n''a pas été effacé.';
  end if;

  -- 🟥 LE PRIX RESTE FIGÉ, malgré tous ces allers-retours.
  select unit_price into v_ligne
  from public.purchase_quote_lines
  where purchase_quote_id = v_quote
    and service_variant_id = (select id from recette_obj where cle = 'standard');

  if v_ligne <> 52000 then
    raise exception 'Le prix de l''offre a bougé : %.', v_ligne;
  end if;

  raise notice
    '[OK] 22. Commande annulée → offre « retenue », reconvertible. Prix toujours figé.';
end $$;


-- --- 23. LA VARIANTE APPARTIENT À SON SERVICE — garanti par la base ---------
do $$
declare
  v_sup     uuid := (select id from recette_obj where cle = 'fournisseur');
  v_service uuid := (select id from recette_obj where cle = 'service');
  v_autre   uuid;
  v_quote   uuid;
  v_n       int := 0;
begin
  -- Une variante d'un AUTRE service. `services_default_variant` la pose d'office
  -- à la création du service : on la lit plutôt que de l'inventer.
  insert into public.service_categories (code, label)
  values ('RECETTE-ACH-2', 'Recette — Achats, second service')
  returning id into v_autre;

  insert into public.services (service_no, label, category_id, purpose, status)
  values (public.next_number('service'), 'Recette — Second service acheté', v_autre,
          'PURCHASE', 'ACTIVE')
  returning id into v_autre;

  select id into v_autre
  from public.service_variants where service_id = v_autre and is_default;

  insert into public.purchase_quotes (quote_no, supplier_id, quote_date)
  values ('DEV-F-TEST-FK', v_sup, (now() at time zone 'Indian/Comoro')::date)
  returning id into v_quote;

  -- Variante d'un autre service, rattachée de force à celui-ci.
  begin
    insert into public.purchase_quote_lines
      (purchase_quote_id, service_id, service_variant_id, label, quantity, unit_price)
    values (v_quote, v_service, v_autre, 'Variante étrangère', 1, 1000);
  exception when others then v_n := v_n + 1; end;

  -- Variante sans service : le couple va ensemble ou pas du tout.
  begin
    insert into public.purchase_quote_lines
      (purchase_quote_id, service_variant_id, label, quantity, unit_price)
    values (v_quote, v_autre, 'Variante orpheline', 1, 1000);
  exception when others then v_n := v_n + 1; end;

  if v_n <> 2 then
    raise exception 'Une ligne incohérente a été acceptée : % refus sur 2.', v_n;
  end if;

  raise notice '[OK] 23. Variante étrangère ou orpheline : refusées par la base, sans déclencheur.';
end $$;


-- --- 24. LE MONTANT D'UNE LIGNE DE FACTURE A UNE SEULE SOURCE ---------------
do $$
declare
  v_sup     uuid := (select id from recette_obj where cle = 'fournisseur');
  v_invoice uuid;
  v_n       int := 0;
  v_amount  bigint;
begin
  perform pg_temp.agir_comme('comptable');
  v_invoice := public.create_supplier_invoice(
    v_sup, (now() at time zone 'Indian/Comoro')::date, null, null, 'Recette D1');
  insert into recette_obj values ('facture3', v_invoice);

  -- Décomposition ET montant : deux sources du même chiffre (D1).
  begin
    perform public.add_supplier_invoice_line(
      v_invoice, 'Contradiction', 999999, null, 2, 5000, null, null);
  exception when others then v_n := v_n + 1; end;

  -- Décomposition incomplète.
  begin
    perform public.add_supplier_invoice_line(
      v_invoice, 'Sans prix', null, null, 2, null, null, null);
  exception when others then v_n := v_n + 1; end;

  -- Ni l'un ni l'autre.
  begin
    perform public.add_supplier_invoice_line(v_invoice, 'Sans rien', null, null, null, null, null, null);
  exception when others then v_n := v_n + 1; end;

  -- La décomposition seule : le montant est CALCULÉ.
  perform public.add_supplier_invoice_line(
    v_invoice, 'Prestation décomposée', null, null, 4, 12500, null, null);

  -- Le montant seul reste possible : une facture « forfait » n'a pas de quantité.
  perform public.add_supplier_invoice_line(v_invoice, 'Forfait', 35000, null, null, null, null, null);

  v_amount := public.supplier_invoice_gross(v_invoice);
  perform pg_temp.redevenir_service();

  if v_n <> 3 then
    raise exception 'Une ligne à deux sources a été acceptée : % refus sur 3.', v_n;
  end if;

  if v_amount <> 4 * 12500 + 35000 then
    raise exception 'Le montant brut est faux : % KMF.', v_amount;
  end if;

  -- Un `INSERT` direct contredisant la décomposition est refusé par la CONTRAINTE.
  begin
    insert into public.supplier_invoice_lines
      (supplier_invoice_id, label, amount, quantity, unit_price)
    values (v_invoice, 'Forcée', 1, 2, 5000);
    raise exception 'La contrainte de cohérence montant/décomposition est absente.';
  exception when check_violation then null;
  end;

  raise notice
    '[OK] 24. Le montant d''une ligne a une seule source ; la décomposition est vérifiée par la base.';
end $$;


-- --- 25. 🟥 AUCUNE ÉCRITURE DE TRÉSORERIE ----------------------------------
--
-- Créer un devis, retenir une offre, passer une commande, préparer et valider
-- une facture : aucun de ces actes ne meut un compte. La trésorerie ne connaît
-- que les RÈGLEMENTS. Et une imputation n'est jamais un paiement (§57).
do $$
declare
  v_factures uuid[];
  v_reglements int;
  v_ecritures  int;
begin
  select array_agg(id) into v_factures
  from recette_obj where cle in ('facture', 'facture2', 'facture3');

  if v_factures is null or array_length(v_factures, 1) < 3 then
    raise exception 'Le contrôle porterait sur rien : les factures de recette sont introuvables.';
  end if;

  select count(*) into v_reglements
  from public.supplier_payments
  where supplier_invoice_id = any (v_factures);

  select count(*) into v_ecritures
  from public.treasury_entries e
  join public.supplier_payments p on p.id = e.supplier_payment_id
  where p.supplier_invoice_id = any (v_factures);

  if v_reglements <> 0 then
    raise exception
      'Un règlement fournisseur a été créé sans acte de paiement : %.', v_reglements;
  end if;

  if v_ecritures <> 0 then
    raise exception
      'Une écriture de trésorerie a été créée par un acte commercial : %.', v_ecritures;
  end if;

  -- Et la trésorerie n'a reçu AUCUNE origine d'achat : un devis ou une commande
  -- ne meut aucun compte, et la colonne qui le permettrait n'existe pas.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'treasury_entries'
      and column_name in ('purchase_order_id', 'purchase_quote_id')
  ) then
    raise exception
      'La trésorerie a reçu une origine commerciale d''achat : un devis ne meut aucun compte (§57).';
  end if;

  raise notice
    '[OK] 25. Aucun règlement, aucune écriture : la trésorerie ne connaît que les paiements.';
end $$;


-- --- 26. LES ACQUIS DES LOTS 5, 6 ET 25 SONT INTACTS ------------------------
do $$
declare
  v_index text;
  v_def   text;
begin
  -- Les index d'unicité de la facturation client et de la location.
  foreach v_index in array array[
    'customer_invoices_one_per_fixed_rental_idx',
    'customer_invoices_one_per_period_idx',
    'customer_invoices_one_per_order_idx',
    'sales_orders_one_per_quote_idx',
    'supplier_invoices_one_per_purchase_order_idx',
    'purchase_orders_one_per_quote_idx'
  ] loop
    if not exists (
      select 1 from pg_indexes where schemaname = 'public' and indexname = v_index
    ) then
      raise exception 'L''index d''unicité « % » a disparu.', v_index;
    end if;
  end loop;

  -- Le refus de DÉCLARER une facture payée — acquis du LOT 6.
  select pg_get_functiondef('public.fn_supplier_invoice_transition()'::regprocedure) into v_def;
  if v_def not like '%se CALCULE des règlements enregistrés%' then
    raise exception 'Le refus de déclarer une facture payée a disparu.';
  end if;
  if v_def not like '%billing.imputations.view%' then
    raise exception 'L''exigence de lire les imputations avant annulation a disparu.';
  end if;

  -- Le refus d'annuler une facture réglée — acquis du LOT 6.
  if not exists (
    select 1 from pg_trigger
    where tgname = 'supplier_invoices_zz_no_cancel_when_paid' and not tgisinternal
  ) then
    raise exception 'Le refus d''annuler une facture réglée a disparu.';
  end if;

  -- Le journal ouvre chaque table par la capacité de SON menu.
  if public.audit_detail_permission('purchase_quotes') <> 'commerce.purchase_quotes.view'
     or public.audit_detail_permission('purchase_quote_lines') <> 'commerce.purchase_quotes.view'
     or public.audit_detail_permission('purchase_orders') <> 'commerce.purchase_orders.view'
     or public.audit_detail_permission('purchase_order_lines') <> 'commerce.purchase_orders.view' then
    raise exception
      'Le commerce fournisseur n''est pas rattaché au journal : ses prix d''achat fuiraient par l''avant/après.';
  end if;

  if public.audit_detail_permission('sales_quotes') <> 'commerce.sales_quotes.view'
     or public.audit_detail_permission('service_variant_costs') <> 'catalog.services.cost.view'
     or public.audit_detail_permission('rental_segment_costs') <> 'rental.pricing.supplier.view'
     or public.audit_detail_permission('supplier_invoices') <> 'billing.supplier_invoices.view' then
    raise exception 'Une correspondance du journal d''un lot antérieur a disparu.';
  end if;

  raise notice '[OK] 26. Six index d''unicité, journal complet : aucun acquis perdu.';
end $$;


-- --- 27. LE JOURNAL A ENREGISTRÉ LES ACTES D'ACHAT -------------------------
do $$
declare
  v_n     int;
  v_types text[];
begin
  select count(*), array_agg(distinct entity_type) into v_n, v_types
  from public.audit_log
  where module_code = 'commerce'
    and entity_type in ('purchase_quotes', 'purchase_quote_lines',
                        'purchase_orders', 'purchase_order_lines');

  if v_n = 0 then
    raise exception 'Aucun acte d''achat n''a été journalisé.';
  end if;

  if not ('purchase_quotes' = any (v_types)) or not ('purchase_orders' = any (v_types)) then
    raise exception 'Le journal ne couvre pas les deux entités d''achat : %.', v_types;
  end if;

  raise notice '[OK] 27. Le journal porte % événements du commerce fournisseur.', v_n;
end $$;


-- --- 28. AUCUNE SUPPRESSION D'UN ACTE D'ACHAT -------------------------------
do $$
declare
  v_n int := 0;
begin
  perform pg_temp.agir_comme('acheteur');

  begin delete from public.purchase_quotes
        where id = (select id from recette_obj where cle = 'devis');
  exception when others then v_n := v_n + 1; end;

  begin delete from public.purchase_orders
        where id = (select id from recette_obj where cle = 'commande');
  exception when others then v_n := v_n + 1; end;

  perform pg_temp.redevenir_service();

  if v_n <> 2 then
    raise exception 'Un acte d''achat a pu être supprimé : % refus sur 2.', v_n;
  end if;

  raise notice '[OK] 28. Ni une offre ni une commande ne se supprime — elles s''annulent.';
end $$;


rollback;
