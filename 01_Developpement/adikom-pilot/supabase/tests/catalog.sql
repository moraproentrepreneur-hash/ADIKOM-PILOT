-- =============================================================================
-- ADIKOM PILOT — Recette Catalogue de services
-- LOT 20 (Module 10) — DEC-043, doctrine D16
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur ne
-- peuvent garantir :
--
--   · les DOUZE capacités existent, avec leur action et leur sensibilité — et
--     aucune n'a été inventée sous `catalog` ;
--   · les CINQ tables existent, RLS activée, suppression et TRUNCATE refermés ;
--   · les POLICIES : le prix d'achat ne s'ouvre QUE par `cost.view` ;
--   · les RÉSOLVEURS ne sont pas `SECURITY DEFINER` (doctrine D4) ;
--   · le SCÉNARIO DE LA DIRECTION se joue : 50 000 jusqu'au 30/09, 60 000 à
--     partir du 01/10 ; une opération du 15/09 prend 50 000, une du 15/10 prend
--     60 000 — et le second prix se saisit SANS attendre le 1er octobre ;
--   · deux versions actives qui se chevauchent sont REFUSÉES PAR LA BASE ;
--   · un TROU ne rend aucune ligne — un prix absent n'est pas un prix nul ;
--   · la DESTINATION commande les prix, dans les deux sens ;
--   · une garde qui COMPTE compte la VÉRITÉ, pas ce que l'appelant peut lire ;
--   · le périmètre de SAUVEGARDE porte les cinq tables, dans l'ordre.
--
-- Exécution :
--   npm run db:verify:catalog
--
-- CE SCRIPT S'EXÉCUTE AVEC LE RÔLE DE LA CHAÎNE DE CONNEXION.
--
-- Ce rôle CONTOURNE RLS : les refus de LECTURE s'éprouvent donc par la forme des
-- policies ici, et par de VRAIES SESSIONS dans `verify:catalog`. Les refus portés
-- par des DÉCLENCHEURS, eux, s'appliquent à tout le monde et sont éprouvés pour
-- de bon — en endossant l'identité d'un compte, comme PostgREST le fait.
--
-- AUCUNE DATE EN DUR : tout se situe par rapport au JOUR COMORIEN. La
-- transaction est annulée en fin de script — aucun résidu.
-- =============================================================================

begin;


-- --- 1. LES DOUZE CAPACITÉS, ET PAS UNE DE PLUS -------------------------------
do $$
declare
  v_attendu text[] := array[
    'catalog.services.view', 'catalog.services.create', 'catalog.services.update',
    'catalog.services.archive', 'catalog.services.export',
    'catalog.services.price.update',
    'catalog.services.cost.view', 'catalog.services.cost.update',
    'catalog.categories.view', 'catalog.categories.create',
    'catalog.categories.update', 'catalog.categories.archive'
  ];
  v_manquantes text[];
  v_inconnues  text[];
  v_row public.permissions%rowtype;
begin
  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_manquantes is not null then
    raise exception 'Capacités du LOT 20 absentes : %', v_manquantes;
  end if;

  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.module_code = 'catalog' and not (p.code = any (v_attendu));

  if v_inconnues is not null then
    raise exception 'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  -- AUCUNE capacité de produit, de marge, d'historique ni de document : le lot
  -- ne les livre pas (CLAUDE.md §19 bis).
  if exists (
    select 1 from public.permissions
    where code like 'catalog.products.%'
       or code like '%.margin.%'
       or code like 'catalog.%.history.%'
       or code like 'catalog.%.download'
       or code like 'catalog.%.print'
       or code like 'catalog.%.delete'
  ) then
    raise exception 'Une capacité a été créée pour une fonctionnalité que le lot ne livre pas.';
  end if;

  -- Les quatre capacités sensibles.
  if exists (
    select 1 from public.permissions
    where code in ('catalog.services.export', 'catalog.services.price.update',
                   'catalog.services.cost.view', 'catalog.services.cost.update')
      and is_sensitive is not true
  ) then
    raise exception 'Une capacité de prix ou d''export n''est pas marquée sensible.';
  end if;

  select * into v_row from public.permissions where code = 'catalog.services.cost.view';
  if v_row.submenu_code <> 'cost' or v_row.module_label <> 'Produits & Services' then
    raise exception 'La lecture des coûts ne vit pas sous Produits & Services → Services → Prix d''achat.';
  end if;

  raise notice '[OK] 1. Douze capacités `catalog`, sensibilité et arborescence conformes.';
end $$;


-- --- 2. LES CINQ TABLES, REFERMÉES --------------------------------------------
do $$
declare
  v_table text;
  v_fautes text[] := '{}';
begin
  foreach v_table in array array[
    'service_categories', 'services', 'service_variants',
    'service_variant_prices', 'service_variant_costs'
  ] loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = v_table) then
      raise exception 'Table % absente.', v_table;
    end if;

    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      v_fautes := v_fautes || (v_table || ' : RLS inactive');
    end if;

    if has_table_privilege('authenticated', 'public.' || quote_ident(v_table), 'DELETE') then
      v_fautes := v_fautes || (v_table || ' : DELETE encore accordé');
    end if;

    if has_table_privilege('authenticated', 'public.' || quote_ident(v_table), 'TRUNCATE') then
      v_fautes := v_fautes || (v_table || ' : TRUNCATE encore accordé');
    end if;

    if has_table_privilege('anon', 'public.' || quote_ident(v_table), 'SELECT') then
      v_fautes := v_fautes || (v_table || ' : lisible par anon');
    end if;

    -- Rien ne se supprime : le déclencheur jumeau de la révocation.
    if not exists (
      select 1 from pg_trigger
      where tgrelid = ('public.' || v_table)::regclass
        and tgname = v_table || '_no_delete'
        and not tgisinternal
    ) then
      v_fautes := v_fautes || (v_table || ' : aucun garde-fou de suppression');
    end if;
  end loop;

  if array_length(v_fautes, 1) > 0 then
    raise exception 'Tables du catalogue mal refermées : %', v_fautes;
  end if;

  raise notice '[OK] 2. Cinq tables, RLS active, suppression et TRUNCATE refermés, anon exclu.';
end $$;


-- --- 3. LA GARANTIE CENTRALE : LE COÛT NE S'OUVRE QUE PAR SA CAPACITÉ ---------
--
-- Si `service_variant_costs_select` citait `catalog.services.view`, alors
-- consulter un service ouvrirait son coût — exactement ce que la table séparée
-- existe pour empêcher (DEC-024, DEC-043 §e).
do $$
declare
  v_cout  text;
  v_prix  text;
begin
  select qual into v_cout from pg_policies
  where schemaname = 'public' and tablename = 'service_variant_costs'
    and policyname = 'service_variant_costs_select';

  if v_cout is null then
    raise exception 'La policy de lecture des prix d''achat est absente.';
  end if;

  if v_cout not like '%catalog.services.cost.view%' then
    raise exception 'La lecture des prix d''achat ne cite pas sa capacité : %', v_cout;
  end if;

  if v_cout like '%''catalog.services.view''%' then
    raise exception
      'La lecture des prix d''achat s''ouvre par `catalog.services.view` : la confidentialité est contournable.';
  end if;

  -- Et la garde s'évalue UNE FOIS, pas par ligne (migration 065).
  if v_cout not like '%SELECT%' then
    raise exception
      'La garde de lecture des coûts n''est pas enveloppée dans un sous-select : elle coûterait un appel par ligne.';
  end if;

  select qual into v_prix from pg_policies
  where schemaname = 'public' and tablename = 'service_variant_prices'
    and policyname = 'service_variant_prices_select';

  if v_prix is null or v_prix not like '%catalog.services.view%' then
    raise exception 'L''historique des prix de vente devrait s''ouvrir par la lecture du service.';
  end if;

  -- L'écriture d'un prix de vente ne s'ouvre PAS par `catalog.services.update`.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_variant_prices'
      and policyname = 'service_variant_prices_insert'
      and with_check like '%catalog.services.update%'
  ) then
    raise exception
      'Modifier un service ouvrirait la saisie des prix : une capacité en inclurait une autre (DEC-024).';
  end if;

  raise notice '[OK] 3. Le prix d''achat ne s''ouvre que par `catalog.services.cost.view`.';
end $$;


-- --- 4. LES FONCTIONS — D4, ET LEURS DROITS D'EXÉCUTION -----------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.resolve_service_price(uuid, date)',
    'public.resolve_service_cost(uuid, date)',
    'public.set_service_price(uuid, bigint, date, text)',
    'public.set_service_cost(uuid, bigint, date, text)',
    'public.deactivate_service_price(uuid, text)',
    'public.deactivate_service_cost(uuid, text)'
  ] loop
    if not exists (select 1 from pg_proc where oid = v_fn::regprocedure) then
      raise exception 'Fonction % absente.', v_fn;
    end if;

    if (select prosecdef from pg_proc where oid = v_fn::regprocedure) then
      raise exception '% est SECURITY DEFINER (doctrine D4).', v_fn;
    end if;

    if has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE') then
      raise exception '% est exécutable par anon.', v_fn;
    end if;

    if not has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE') then
      raise exception '% n''est pas exécutable par un compte authentifié.', v_fn;
    end if;
  end loop;

  -- LE JOUR EST COMORIEN, PAS UTC : entre 21 h et minuit, `current_date`
  -- désignerait la veille à Moroni — et tarifierait une prestation du soir au
  -- prix de la veille, le jour d'un changement de tarif (DEC-025 §e).
  if not exists (
    select 1 from pg_proc
    where oid = 'public.resolve_service_price(uuid, date)'::regprocedure
      and pg_get_function_arguments(oid) like '%Indian/Comoro%'
  ) then
    raise exception 'La date d''effet par défaut du résolveur n''est pas le jour comorien.';
  end if;

  raise notice '[OK] 4. Six fonctions, aucune SECURITY DEFINER, jour comorien par défaut.';
end $$;


-- --- 5. LE PÉRIMÈTRE DE SAUVEGARDE --------------------------------------------
do $$
declare
  v_scope text[] := public.backup_scope();
  v_absentes text[];
begin
  select array_agg(t) into v_absentes
  from unnest(array[
    'service_categories', 'services', 'service_variants',
    'service_variant_prices', 'service_variant_costs'
  ]) t
  where not (t = any (v_scope));

  if v_absentes is not null then
    raise exception 'Tables du catalogue hors du périmètre de sauvegarde : %', v_absentes;
  end if;

  if array_position(v_scope, 'services') > array_position(v_scope, 'service_variants')
     or array_position(v_scope, 'service_variants') > array_position(v_scope, 'service_variant_prices')
     or array_position(v_scope, 'service_variants') > array_position(v_scope, 'service_variant_costs')
     or array_position(v_scope, 'service_categories') > array_position(v_scope, 'services')
  then
    raise exception 'Ordre du périmètre invalide : un enfant précède son parent.';
  end if;

  raise notice '[OK] 5. Périmètre de sauvegarde à % tables, catalogue compris et ordonné.',
    array_length(v_scope, 1);
end $$;


-- =============================================================================
-- SUJETS DE RECETTE
-- =============================================================================

create temporary table recette_cat (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_ids  uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_cles text[] := array['vendeur', 'couts', 'nul'];
  v_i    int;
begin
  for v_i in 1 .. 3 loop
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (
      v_ids[v_i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'recette.cat.' || v_cles[v_i] || '@adikom.test', now(), now()
    );
    insert into recette_cat (cle, id) values (v_cles[v_i], v_ids[v_i]);
  end loop;

  insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
  values
    (v_ids[1], 'Recette', 'Cat vendeur', 'recette.cat.vendeur', 'recette.cat.vendeur@adikom.test', 'ACTIVE', false),
    (v_ids[2], 'Recette', 'Cat couts',   'recette.cat.couts',   'recette.cat.couts@adikom.test',   'ACTIVE', false),
    (v_ids[3], 'Recette', 'Cat nul',     'recette.cat.nul',     'recette.cat.nul@adikom.test',     'ACTIVE', false);

  /*
   * LE PROFIL VENTE — le cœur du lot.
   *
   * Il gère les services et leurs prix de VENTE. Il n'a NI `cost.view`, NI
   * `cost.update` : un utilisateur capable de vendre un service ne doit pas
   * pouvoir voir ni saisir ce qu'il a coûté.
   */
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[1], p.id, 'ALLOW'
  from public.permissions p
  where p.code in (
    'catalog.services.view', 'catalog.services.create', 'catalog.services.update',
    'catalog.services.archive', 'catalog.services.price.update',
    'catalog.categories.view', 'catalog.categories.create',
    'catalog.categories.update', 'catalog.categories.archive'
  );

  -- LE PROFIL COÛTS : il voit et saisit les coûts, et lit les services. Il ne
  -- touche PAS aux prix de vente.
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[2], p.id, 'ALLOW'
  from public.permissions p
  where p.code in (
    'catalog.services.view', 'catalog.services.cost.view', 'catalog.services.cost.update'
  );

  -- LE PROFIL NUL : il lit le catalogue, et rien d'autre.
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[3], p.id, 'ALLOW'
  from public.permissions p
  where p.code = 'catalog.services.view';

  raise notice '[OK] 6. Trois profils : vente sans coûts, coûts sans vente, lecture seule.';
end $$;


create or replace function pg_temp.agir_comme(p_cle text)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from recette_cat where cle = p_cle;
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


-- --- 7. UN SERVICE NAÎT AVEC SA VARIANTE « STANDARD » -------------------------
create temporary table recette_objets (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_cat     uuid;
  v_service uuid;
  v_variant uuid;
  v_nb      int;
begin
  insert into public.service_categories (code, label, description)
  values ('RECETTE-CAT', 'Recette — Transport', 'Catégorie de recette, annulée avec la transaction')
  returning id into v_cat;

  insert into recette_objets values ('categorie', v_cat);

  insert into public.services (service_no, label, category_id, purpose, unit_label)
  values (public.next_number('service'), 'Recette — Transfert', v_cat, 'BOTH', 'trajet')
  returning id into v_service;

  insert into recette_objets values ('service', v_service);

  select count(*) into v_nb from public.service_variants where service_id = v_service;
  if v_nb <> 1 then
    raise exception 'Un service devrait naître avec exactement une variante, obtenu %.', v_nb;
  end if;

  select id into v_variant
  from public.service_variants
  where service_id = v_service and is_default and label = 'Standard';

  if v_variant is null then
    raise exception 'La variante par défaut « Standard » n''a pas été créée.';
  end if;

  insert into recette_objets values ('variante', v_variant);

  raise notice '[OK] 7. Le service naît avec sa variante « Standard » par défaut.';
end $$;


-- --- 8. UNE CATÉGORIE ARCHIVÉE N'ACCUEILLE PAS UN SERVICE NOUVEAU -------------
do $$
declare
  v_cat  uuid;
  v_ok   boolean := false;
begin
  insert into public.service_categories (code, label, is_active)
  values ('RECETTE-OLD', 'Recette — Catégorie retirée', false)
  returning id into v_cat;

  begin
    insert into public.services (service_no, label, category_id, purpose)
    values (public.next_number('service'), 'Recette — Refusé', v_cat, 'SALE');
  exception when others then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Un service a pu naître dans une catégorie archivée.';
  end if;

  raise notice '[OK] 8. Une catégorie archivée n''accueille aucun service nouveau.';
end $$;


-- --- 9. LA DESTINATION COMMANDE LES PRIX, DANS LES DEUX SENS ------------------
do $$
declare
  v_cat     uuid := (select id from recette_objets where cle = 'categorie');
  v_vente   uuid;
  v_achat   uuid;
  v_vv      uuid;
  v_va      uuid;
  v_ok      boolean;
  v_today   date := (now() at time zone 'Indian/Comoro')::date;
begin
  insert into public.services (service_no, label, category_id, purpose)
  values (public.next_number('service'), 'Recette — Vente seule', v_cat, 'SALE')
  returning id into v_vente;

  insert into public.services (service_no, label, category_id, purpose)
  values (public.next_number('service'), 'Recette — Achat seul', v_cat, 'PURCHASE')
  returning id into v_achat;

  select id into v_vv from public.service_variants where service_id = v_vente and is_default;
  select id into v_va from public.service_variants where service_id = v_achat and is_default;

  insert into recette_objets values ('variante_vente', v_vv), ('variante_achat', v_va);

  -- Un service de VENTE ne porte aucun prix d'achat.
  v_ok := false;
  begin
    insert into public.service_variant_costs (variant_id, amount, valid_from)
    values (v_vv, 30000, v_today);
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'Un prix d''achat a été accepté sur un service destiné à la vente.';
  end if;

  -- Un service d'ACHAT ne porte aucun prix de vente.
  v_ok := false;
  begin
    insert into public.service_variant_prices (variant_id, amount, valid_from)
    values (v_va, 30000, v_today);
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'Un prix de vente a été accepté sur un service destiné à l''achat.';
  end if;

  raise notice '[OK] 9. La destination refuse le prix qui la contredit, dans les deux sens.';
end $$;


-- --- 10. LE SCÉNARIO DE LA DIRECTION -----------------------------------------
--
--   50 000 KMF jusqu'au 30/09 · 60 000 KMF à partir du 01/10
--   Une opération du 15/09 prend 50 000 ; une du 15/10 prend 60 000.
--
-- ET LE SECOND PRIX SE SAISIT SANS ATTENDRE LE 1er OCTOBRE : c'est exactement
-- ce que « le prix actuel dans la fiche » ne savait pas faire.
do $$
declare
  v_variant uuid := (select id from recette_objets where cle = 'variante');
  v_today   date := (now() at time zone 'Indian/Comoro')::date;
  v_debut   date := v_today - 30;   -- le prix en vigueur, ouvert il y a un mois
  v_bascule date := v_today + 30;   -- le prix futur, saisi AUJOURD'HUI
  v_p1      uuid;
  v_p2      uuid;
  v_amount  bigint;
  v_fin     date;
begin
  perform pg_temp.agir_comme('vendeur');

  v_p1 := public.set_service_price(v_variant, 50000, v_debut, 'Tarif initial');
  v_p2 := public.set_service_price(v_variant, 60000, v_bascule, 'Révision tarifaire');

  perform pg_temp.redevenir_service();

  -- a. AUJOURD'HUI : l'ancien prix s'applique toujours, bien que le nouveau
  --    soit déjà enregistré.
  select amount into v_amount from public.resolve_service_price(v_variant, v_today);
  if v_amount is distinct from 50000 then
    raise exception 'Prix applicable aujourd''hui attendu 50 000, obtenu %.', coalesce(v_amount, -1);
  end if;

  -- b. APRÈS LA BASCULE : le nouveau prix s'applique, sans qu'aucune tâche
  --    planifiée n'ait eu à s'exécuter.
  select amount into v_amount from public.resolve_service_price(v_variant, v_bascule + 15);
  if v_amount is distinct from 60000 then
    raise exception 'Prix applicable après bascule attendu 60 000, obtenu %.', coalesce(v_amount, -1);
  end if;

  -- c. L'ANCIENNE VERSION N'A PAS ÉTÉ RÉÉCRITE : son montant est intact, et
  --    elle a été CLOSE la veille de la bascule.
  select amount, valid_to into v_amount, v_fin
  from public.service_variant_prices where id = v_p1;

  if v_amount <> 50000 then
    raise exception 'Le montant de l''ancienne version a été réécrit : %.', v_amount;
  end if;

  if v_fin is distinct from (v_bascule - 1) then
    raise exception 'L''ancienne version devrait être close la veille de la bascule, obtenu %.', v_fin;
  end if;

  -- d. LA NOUVELLE VERSION EST OUVERTE, SANS TERME.
  if (select valid_to from public.service_variant_prices where id = v_p2) is not null then
    raise exception 'La nouvelle version ne devrait pas être bornée.';
  end if;

  -- e. UNE SAISIE RÉTROACTIVE prend le prix de SA date, pas celui d'aujourd'hui.
  select amount into v_amount from public.resolve_service_price(v_variant, v_debut + 3);
  if v_amount is distinct from 50000 then
    raise exception 'Une opération datée d''avant la bascule devrait prendre 50 000, obtenu %.',
      coalesce(v_amount, -1);
  end if;

  raise notice '[OK] 10. 50 000 hier, 60 000 demain : les deux coexistent, aucune n''est réécrite.';
end $$;


-- --- 11. AUCUN CHEVAUCHEMENT, ET AUCUN ZÉRO SILENCIEUX ------------------------
do $$
declare
  v_variant uuid := (select id from recette_objets where cle = 'variante');
  v_today   date := (now() at time zone 'Indian/Comoro')::date;
  v_ok      boolean := false;
  v_lignes  int;
begin
  -- a. CHEVAUCHEMENT — refusé par la CONTRAINTE, donc y compris entre deux
  --    saisies simultanées qu'aucun déclencheur ne verrait (DEC-028).
  begin
    insert into public.service_variant_prices (variant_id, amount, valid_from, valid_to)
    values (v_variant, 55000, v_today - 10, v_today + 10);
  exception when exclusion_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Deux versions de prix se chevauchent : la base l''a accepté.';
  end if;

  -- b. UN TROU NE REND AUCUNE LIGNE — et surtout pas un zéro.
  select count(*) into v_lignes
  from public.resolve_service_price(v_variant, v_today - 200);

  if v_lignes <> 0 then
    raise exception 'Une date antérieure à toute version devrait ne rien renvoyer, obtenu % ligne(s).',
      v_lignes;
  end if;

  -- c. Et un montant ne peut pas être nul ni négatif.
  v_ok := false;
  begin
    insert into public.service_variant_prices (variant_id, amount, valid_from)
    values (v_variant, 0, v_today + 500);
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Un prix de vente nul a été accepté.';
  end if;

  raise notice '[OK] 11. Chevauchement refusé, trou explicite, montant nul refusé.';
end $$;


-- --- 12. LES CAPACITÉS S'OPPOSENT EN BASE, PAS SEULEMENT À L'ÉCRAN -----------
do $$
declare
  v_variant uuid := (select id from recette_objets where cle = 'variante');
  v_today   date := (now() at time zone 'Indian/Comoro')::date;
  v_ok      boolean;
begin
  -- a. LE PROFIL COÛTS ne modifie AUCUN prix de vente, bien qu'il lise le
  --    service. Le déclencheur le refuse — l'écran n'y est pour rien.
  perform pg_temp.agir_comme('couts');
  v_ok := false;
  begin
    perform public.set_service_price(v_variant, 70000, v_today + 120, 'Tentative');
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'Un profil « coûts » a pu modifier un prix de vente.';
  end if;

  -- b. LE PROFIL VENTE ne saisit AUCUN prix d'achat.
  perform pg_temp.agir_comme('vendeur');
  v_ok := false;
  begin
    perform public.set_service_cost(v_variant, 30000, v_today, 'Tentative');
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'Un profil « vente » a pu saisir un prix d''achat.';
  end if;

  -- c. LE PROFIL NUL — lecture seule — n'écrit rien du tout, par aucune voie.
  perform pg_temp.agir_comme('nul');
  v_ok := false;
  begin
    insert into public.service_variant_prices (variant_id, amount, valid_from)
    values (v_variant, 12345, v_today + 400);
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'Un compte en lecture seule a pu insérer une version de prix.';
  end if;

  -- d. ET RIEN NE SE SUPPRIME, quel que soit le droit détenu.
  perform pg_temp.agir_comme('vendeur');
  v_ok := false;
  begin
    delete from public.service_variant_prices where variant_id = v_variant;
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'Une version de prix a pu être supprimée.';
  end if;

  raise notice '[OK] 12. Vente, coûts, lecture seule : chacun à sa place, et rien ne se supprime.';
end $$;


-- --- 13. UNE GARDE QUI COMPTE, COMPTE LA VÉRITÉ ------------------------------
--
-- Le profil VENTE ne voit AUCUN coût. S'il pouvait, en les ignorant, rendre le
-- service « vente seule », il laisserait des versions de coût orphelines —
-- exactement le défaut refermé par la migration 062.
do $$
declare
  v_service uuid := (select id from recette_objets where cle = 'service');
  v_variant uuid := (select id from recette_objets where cle = 'variante');
  v_today   date := (now() at time zone 'Indian/Comoro')::date;
  v_ok      boolean := false;
  v_purpose public.service_purpose;
begin
  -- Un coût existe, posé par le profil qui en a le droit.
  perform pg_temp.agir_comme('couts');
  perform public.set_service_cost(v_variant, 35000, v_today - 30, 'Coût d''acquisition');
  perform pg_temp.redevenir_service();

  -- Le profil VENTE tente de basculer la destination en « vente seule ».
  perform pg_temp.agir_comme('vendeur');
  begin
    update public.services set purpose = 'SALE' where id = v_service;
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception
      'Un profil sans lecture des coûts a pu rendre « vente seule » un service qui en porte.';
  end if;

  select purpose into v_purpose from public.services where id = v_service;
  if v_purpose <> 'BOTH' then
    raise exception 'La destination a changé malgré le refus : %.', v_purpose;
  end if;

  raise notice '[OK] 13. La garde compte les coûts réels, non ceux que l''acteur peut lire.';
end $$;


-- --- 14. LA MARGE EST CALCULABLE, ET ELLE NE SE STOCKE PAS -------------------
do $$
declare
  v_variant uuid := (select id from recette_objets where cle = 'variante');
  v_today   date := (now() at time zone 'Indian/Comoro')::date;
  v_prix    bigint;
  v_cout    bigint;
  v_colonne text;
begin
  select amount into v_prix from public.resolve_service_price(v_variant, v_today);
  select amount into v_cout from public.resolve_service_cost(v_variant, v_today);

  if v_prix is null or v_cout is null then
    raise exception 'Les deux prix devraient être applicables aujourd''hui (% / %).', v_prix, v_cout;
  end if;

  if v_prix - v_cout <> 15000 then
    raise exception 'Marge attendue 15 000, obtenue %.', v_prix - v_cout;
  end if;

  -- AUCUNE COLONNE DE MARGE NULLE PART : une différence se recalcule (D1).
  select string_agg(table_name || '.' || column_name, ', ') into v_colonne
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('services', 'service_variants',
                       'service_variant_prices', 'service_variant_costs')
    and (column_name ~* 'margin' or column_name ~* 'marge');

  if v_colonne is not null then
    raise exception 'Une marge est stockée : %', v_colonne;
  end if;

  raise notice '[OK] 14. Marge calculable (15 000), et stockée nulle part.';
end $$;


-- --- 15. UNE VERSION SE RETIRE, ELLE NE SE SUPPRIME PAS -----------------------
do $$
declare
  v_variant uuid := (select id from recette_objets where cle = 'variante');
  v_today   date := (now() at time zone 'Indian/Comoro')::date;
  v_id      uuid;
  v_active  boolean;
  v_motif   text;
  v_reason  text;
begin
  select id, reason into v_id, v_reason
  from public.service_variant_prices
  where variant_id = v_variant and is_active
  order by valid_from desc limit 1;

  perform pg_temp.agir_comme('vendeur');
  perform public.deactivate_service_price(v_id, 'Erreur de saisie');
  perform pg_temp.redevenir_service();

  select is_active, deactivation_reason, reason
    into v_active, v_motif, v_reason
  from public.service_variant_prices where id = v_id;

  if v_active is not false then
    raise exception 'La version n''a pas été retirée.';
  end if;

  if v_motif <> 'Erreur de saisie' then
    raise exception 'Le motif du retrait n''a pas été enregistré : %.', coalesce(v_motif, '(aucun)');
  end if;

  -- LE MOTIF DU CHANGEMENT N'A PAS ÉTÉ ÉCRASÉ par celui du retrait : un motif
  -- ne se réécrit pas après coup (migration 069).
  if v_reason is distinct from 'Révision tarifaire' then
    raise exception 'Le motif d''origine a été réécrit : %.', coalesce(v_reason, '(aucun)');
  end if;

  raise notice '[OK] 15. Une version se retire, garde son motif, et ne disparaît jamais.';
end $$;


-- --- 16. L'AUDIT DIT QUI, ET NE DIVULGUE PAS LE COÛT -------------------------
do $$
declare
  v_variant uuid := (select id from recette_objets where cle = 'variante');
  v_prix    int;
  v_couts   int;
begin
  select count(*) into v_prix
  from public.audit_log
  where entity_type = 'service_variant_prices' and action = 'PRICE_CHANGE'
    and module_code = 'catalog';

  if v_prix < 2 then
    raise exception 'Les changements de prix de vente ne sont pas journalisés (% entrée(s)).', v_prix;
  end if;

  select count(*) into v_couts
  from public.audit_log
  where entity_type = 'service_variant_costs' and action = 'PRICE_CHANGE';

  if v_couts < 1 then
    raise exception 'Les changements de prix d''achat ne sont pas journalisés.';
  end if;

  -- LE DÉTAIL D'UN COÛT RESTE DERRIÈRE SA PROPRE LECTURE (DEC-038) : sans cela,
  -- le journal rendrait par la bande ce que la table refuse.
  if public.audit_detail_permission('service_variant_costs') <> 'catalog.services.cost.view' then
    raise exception
      'Le détail d''un prix d''achat s''ouvrirait par une autre capacité : %',
      coalesce(public.audit_detail_permission('service_variant_costs'), '(aucune)');
  end if;

  if public.audit_detail_permission('service_variant_prices') <> 'catalog.services.view' then
    raise exception 'Le détail d''un prix de vente ne s''ouvre pas par la lecture du service.';
  end if;

  -- Et les cinq objets du lot sont cartographiés : un oubli se refermerait sur
  -- le seul Super Admin, silencieusement.
  if public.audit_detail_permission('services') is null
     or public.audit_detail_permission('service_categories') is null
     or public.audit_detail_permission('service_variants') is null then
    raise exception 'Un objet du catalogue n''est pas cartographié pour la lecture du journal.';
  end if;

  raise notice '[OK] 16. PRICE_CHANGE journalisé ; le détail d''un coût garde sa propre lecture.';
end $$;


-- --- 17. ARCHIVER N'EST PAS MODIFIER -----------------------------------------
do $$
declare
  v_service uuid := (select id from recette_objets where cle = 'service');
  v_cat     uuid := (select id from recette_objets where cle = 'categorie');
  v_ok      boolean;
begin
  -- Le profil COÛTS lit les services mais n'a ni `update` ni `archive`.
  perform pg_temp.agir_comme('couts');

  v_ok := false;
  begin
    update public.services set label = 'Détourné' where id = v_service;
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'Un profil sans `catalog.services.update` a pu renommer un service.';
  end if;

  v_ok := false;
  begin
    update public.services set status = 'ARCHIVED' where id = v_service;
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'Un profil sans `catalog.services.archive` a pu archiver un service.';
  end if;

  v_ok := false;
  begin
    update public.service_categories set is_active = false where id = v_cat;
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'Un profil sans `catalog.categories.archive` a pu archiver une catégorie.';
  end if;

  perform pg_temp.redevenir_service();

  raise notice '[OK] 17. Modifier, archiver : deux actes, deux capacités, refusés séparément.';
end $$;


-- --- 18. UNE SEULE VARIANTE PAR DÉFAUT, ET ELLE RESTE ACTIVE ------------------
do $$
declare
  v_service uuid := (select id from recette_objets where cle = 'service');
  v_defaut  uuid := (select id from recette_objets where cle = 'variante');
  v_autre   uuid;
  v_nb      int;
  v_ok      boolean := false;
begin
  perform pg_temp.agir_comme('vendeur');

  insert into public.service_variants (service_id, label, sku)
  values (v_service, 'Premium', 'RECETTE-PREM')
  returning id into v_autre;

  -- Désigner la nouvelle retire l'ancienne, plutôt que d'échouer sèchement.
  update public.service_variants set is_default = true where id = v_autre;

  select count(*) into v_nb
  from public.service_variants where service_id = v_service and is_default;

  if v_nb <> 1 then
    raise exception 'Un service devrait avoir exactement une variante par défaut, obtenu %.', v_nb;
  end if;

  if (select is_default from public.service_variants where id = v_defaut) then
    raise exception 'L''ancienne variante par défaut n''a pas été basculée.';
  end if;

  -- La variante par défaut ne se désactive pas : on en désigne une autre d'abord.
  begin
    update public.service_variants set is_active = false where id = v_autre;
  exception when others then
    v_ok := true;
  end;

  perform pg_temp.redevenir_service();

  if not v_ok then
    raise exception 'La variante par défaut a pu être désactivée.';
  end if;

  raise notice '[OK] 18. Une seule variante par défaut, et elle reste active.';
end $$;


-- --- 19. AUCUNE TABLE, AUCUNE CAPACITÉ DE PRODUIT -----------------------------
do $$
declare v_tables text;
begin
  select string_agg(tablename, ', ') into v_tables
  from pg_tables
  where schemaname = 'public'
    and (tablename ~* '^products?$' or tablename ~* 'stock' or tablename ~* 'warehouse'
         or tablename ~* '^inventory');

  if v_tables is not null then
    raise exception 'Le LOT 20 ne livre AUCUN produit ni stock, or : %', v_tables;
  end if;

  raise notice '[OK] 19. Aucune table de produit, de stock ni d''entrepôt.';
end $$;


rollback;
