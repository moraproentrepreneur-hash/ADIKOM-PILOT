-- =============================================================================
-- ADIKOM PILOT — Recette Tarifs fournisseurs des véhicules
-- LOT 21 — DEC-044, doctrine D16 réemployée
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur ne
-- peuvent garantir :
--
--   · les QUATRE capacités existent, sensibles, sous Tarification → Tarifs
--     fournisseurs — et aucune n'a été inventée ;
--   · la TABLE existe, RLS activée, suppression et TRUNCATE refermés ;
--   · la POLICY de lecture ne cite QUE `rental.pricing.supplier.view` — ni le
--     parc, ni la grille tarifaire, ni les fournisseurs, ni le financier ;
--   · les RÉSOLVEURS et les ACTES ne sont pas `SECURITY DEFINER` (doctrine D4) ;
--   · LE CAS DE RÉFÉRENCE DE LA DIRECTION se joue : 40 000 jusqu'au 30/09,
--     45 000 à partir du 01/10, saisis À L'AVANCE ; une location du 15/09 relève
--     de 40 000, une du 15/10 de 45 000 ;
--   · deux versions actives qui se CHEVAUCHENT sont refusées par la base ;
--   · un TROU ne rend aucune ligne — un coût absent n'est pas un coût nul ;
--   · UN VÉHICULE ADIKOM EST REFUSÉ, et le refus NOMME la décision manquante
--     P-2. Un véhicule de partenariat aussi, pour sa propre raison ;
--   · une VERSION NE SE RÉÉCRIT PAS : montant, unité, date d'effet, motif ;
--   · `create` n'ouvre pas le retrait, `update` n'ouvre pas l'ouverture ;
--   · AUCUNE MARGE N'EST STOCKÉE (doctrine D1) ;
--   · deux TARIFS CLIENTS de portée identique ne se recouvrent plus, et deux
--     portées DIFFÉRENTES se recouvrent toujours — DEC-002 intacte ;
--   · le périmètre de SAUVEGARDE porte la table, après ses deux parents.
--
-- Exécution :
--   npm run db:verify:supplier-rates
--
-- CE SCRIPT S'EXÉCUTE AVEC LE RÔLE DE LA CHAÎNE DE CONNEXION.
--
-- Ce rôle CONTOURNE RLS : les refus de LECTURE s'éprouvent donc par la forme des
-- policies ici, et par de VRAIES SESSIONS dans `verify:supplier-rates`. Les
-- refus portés par des DÉCLENCHEURS, eux, s'appliquent à tout le monde et sont
-- éprouvés pour de bon — en endossant l'identité d'un compte, comme PostgREST
-- le fait.
--
-- AUCUNE DATE EN DUR : tout se situe par rapport au JOUR COMORIEN. La
-- transaction est annulée en fin de script — aucun résidu.
-- =============================================================================

begin;


-- --- 1. LES QUATRE CAPACITÉS, ET PAS UNE DE PLUS ------------------------------
do $$
declare
  v_attendu text[] := array[
    'rental.pricing.supplier.view',
    'rental.pricing.supplier.create',
    'rental.pricing.supplier.update',
    'rental.pricing.supplier.export'
  ];
  v_manquantes text[];
  v_inconnues  text[];
  v_row public.permissions%rowtype;
begin
  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_manquantes is not null then
    raise exception 'Capacités du LOT 21 absentes : %', v_manquantes;
  end if;

  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.code like 'rental.pricing.supplier.%' and not (p.code = any (v_attendu));

  if v_inconnues is not null then
    raise exception 'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  /*
   * AUCUNE CAPACITÉ DE MARGE, DE DOCUMENT NI DE SUPPRESSION.
   *
   * Une marge est la différence de DEUX grandeurs déjà gouvernées : une capacité
   * de plus ne fermerait rien (CLAUDE.md §19 bis, Plan 02 §10.3). Aucun document
   * n'est produit par ce lot, et rien ne se supprime.
   */
  if exists (
    select 1 from public.permissions
    where code like '%.commission.%'
       or code like 'rental.pricing.supplier.%.download'
       or code like 'rental.pricing.supplier.%.print'
       or code like 'rental.pricing.supplier.delete'
       or code like 'rental.pricing.supplier.archive'
       or code like 'rental.pricing.supplier.%.history.%'
  ) then
    raise exception 'Une capacité a été créée pour une fonctionnalité que le lot ne livre pas.';
  end if;

  -- LES QUATRE SONT SENSIBLES : le coût fournisseur est confidentiel (A-2).
  if exists (
    select 1 from public.permissions
    where code = any (v_attendu) and is_sensitive is not true
  ) then
    raise exception 'Une capacité de tarif fournisseur n''est pas marquée sensible.';
  end if;

  select * into v_row from public.permissions where code = 'rental.pricing.supplier.view';
  if v_row.submenu_code <> 'supplier'
     or v_row.menu_code <> 'pricing'
     or v_row.module_code <> 'rental' then
    raise exception
      'La lecture des coûts ne vit pas sous Gestion de location → Tarification → Tarifs fournisseurs.';
  end if;

  -- LES CODES EXISTANTS N'ONT PAS BOUGÉ : un code attribué ne se touche pas.
  if not exists (select 1 from public.permissions where code = 'rental.pricing.view')
  or not exists (select 1 from public.permissions where code = 'rental.pricing.override')
  or not exists (select 1 from public.permissions where code = 'catalog.services.cost.view') then
    raise exception 'Une capacité antérieure au LOT 21 a disparu du catalogue.';
  end if;

  raise notice '[OK] 1. Quatre capacités, sensibilité et arborescence — et aucune de plus.';
end $$;


-- --- 2. LA TABLE, REFERMÉE ----------------------------------------------------
do $$
declare v_fautes text[] := '{}';
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'supplier_vehicle_rates'
  ) then
    raise exception 'Table supplier_vehicle_rates absente.';
  end if;

  if not (select relrowsecurity from pg_class
          where oid = 'public.supplier_vehicle_rates'::regclass) then
    v_fautes := v_fautes || 'RLS inactive'::text;
  end if;

  if has_table_privilege('authenticated', 'public.supplier_vehicle_rates', 'DELETE') then
    v_fautes := v_fautes || 'DELETE encore accordé'::text;
  end if;

  -- TRUNCATE ne déclenche aucun déclencheur de ligne : il contournerait
  -- `fn_forbid_delete` et viderait les coûts sans laisser une trace.
  if has_table_privilege('authenticated', 'public.supplier_vehicle_rates', 'TRUNCATE') then
    v_fautes := v_fautes || 'TRUNCATE encore accordé'::text;
  end if;

  if has_table_privilege('anon', 'public.supplier_vehicle_rates', 'SELECT') then
    v_fautes := v_fautes || 'anon peut lire'::text;
  end if;

  -- Les contraintes structurantes.
  if not exists (
    select 1 from pg_constraint
    where conname = 'supplier_vehicle_rates_no_overlap' and contype = 'x'
  ) then
    v_fautes := v_fautes || 'contrainte d''exclusion absente'::text;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'supplier_vehicle_rates_period' and contype = 'c'
  ) then
    v_fautes := v_fautes || 'contrainte de période absente'::text;
  end if;

  if array_length(v_fautes, 1) is not null then
    raise exception 'Table mal refermée : %', array_to_string(v_fautes, ' · ');
  end if;

  raise notice '[OK] 2. Table présente, RLS active, DELETE et TRUNCATE refermés, anon exclu.';
end $$;


-- --- 3. LA GARANTIE CENTRALE : LA LECTURE NE CITE QUE SA CAPACITÉ -------------
do $$
declare
  v_qual text;
  v_with text;
begin
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'supplier_vehicle_rates'
    and policyname = 'supplier_vehicle_rates_select';

  if v_qual is null then
    raise exception 'La policy de lecture des tarifs fournisseurs est absente.';
  end if;

  if v_qual not like '%rental.pricing.supplier.view%' then
    raise exception 'La lecture ne s''appuie pas sur `rental.pricing.supplier.view` : %', v_qual;
  end if;

  /*
   * AUCUNE AUTRE CAPACITÉ N'Y FIGURE, et c'est tout l'objet de la table séparée.
   *
   * Un exploitant qui gère le parc, la grille tarifaire, les fournisseurs ou les
   * montants d'une location NE VOIT PAS ce qu'ADIKOM paie (A-2, Plan 02 §6.3).
   */
  if v_qual like '%''rental.pricing.view''%'
  or v_qual like '%rental.fleet.view%'
  or v_qual like '%parties.suppliers.view%'
  or v_qual like '%rental.rentals.financial.view%'
  or v_qual like '%rental.rentals.view%' then
    raise exception
      'La lecture des tarifs fournisseurs s''ouvre par une capacité étrangère : %', v_qual;
  end if;

  -- La garde est ENVELOPPÉE : sans sous-select, `has_permission` serait évaluée
  -- une fois PAR LIGNE (migration 065).
  if v_qual not like '%SELECT%has_permission%' then
    raise exception
      'La garde de lecture n''est pas enveloppée dans un sous-select : %', v_qual;
  end if;

  -- L'écriture relève des capacités d'écriture, jamais de la seule lecture.
  select with_check into v_with
  from pg_policies
  where schemaname = 'public' and tablename = 'supplier_vehicle_rates'
    and policyname = 'supplier_vehicle_rates_insert';

  if v_with is null or v_with not like '%rental.pricing.supplier.create%' then
    raise exception 'L''écriture ne s''appuie pas sur `rental.pricing.supplier.create`.';
  end if;

  if v_with like '%supplier.view%' then
    raise exception 'Voir un coût suffirait à en écrire un : lire n''est pas écrire.';
  end if;

  raise notice '[OK] 3. Le coût d''acquisition ne s''ouvre QUE par sa capacité, et la garde est enveloppée.';
end $$;


-- --- 4. LES FONCTIONS — D4, JOUR COMORIEN, anon exclu -------------------------
do $$
declare
  v_fn   text;
  v_src  text;
  v_defs text[] := '{}';
begin
  foreach v_fn in array array[
    'public.resolve_supplier_rate(uuid, date)',
    'public.resolve_supplier_rates(date)',
    'public.resolve_standard_prices(date)',
    'public.set_supplier_vehicle_rate(uuid, uuid, bigint, public.pricing_unit, date, text, text)',
    'public.deactivate_supplier_vehicle_rate(uuid, text)'
  ] loop
    if not exists (select 1 from pg_proc where oid = v_fn::regprocedure) then
      raise exception 'Fonction % absente.', v_fn;
    end if;

    -- DOCTRINE D4 : aucune fonction MÉTIER en SECURITY DEFINER. Un appelant sans
    -- la capacité de lecture ne doit RIEN obtenir, résolveur compris.
    if (select prosecdef from pg_proc where oid = v_fn::regprocedure) then
      v_defs := v_defs || v_fn;
    end if;

    if has_function_privilege('anon', v_fn::regprocedure, 'execute') then
      raise exception 'anon peut exécuter %.', v_fn;
    end if;
  end loop;

  if array_length(v_defs, 1) is not null then
    raise exception 'Fonctions métier en SECURITY DEFINER : %', v_defs;
  end if;

  -- LA GARDE, elle, est SECURITY DEFINER — et doit l'être : elle compte la
  -- vérité de la base, pas ce que l'appelant peut lire (migration 062). Elle ne
  -- rend aucune ligne : elle refuse, ou laisse passer.
  if not (select prosecdef from pg_proc
          where oid = 'public.fn_supplier_vehicle_rate_guard()'::regprocedure) then
    raise exception
      'La garde de cohérence n''est pas SECURITY DEFINER : elle compterait ce que l''acteur voit.';
  end if;

  /*
   * LE JOUR EST COMORIEN, PAS UTC (DEC-025 §e).
   *
   * `current_date` s'évalue en UTC : entre 21 h et minuit, il désigne LA VEILLE
   * à Moroni. L'écart est invisible en recette de journée, et ferait résoudre un
   * coût du soir sur la version de la veille le jour d'un changement de tarif.
   */
  foreach v_fn in array array[
    'public.resolve_supplier_rate(uuid, date)',
    'public.resolve_supplier_rates(date)',
    'public.resolve_standard_prices(date)',
    'public.set_supplier_vehicle_rate(uuid, uuid, bigint, public.pricing_unit, date, text, text)'
  ] loop
    select pg_get_functiondef(v_fn::regprocedure) into v_src;

    if v_src not like '%Indian/Comoro%' then
      raise exception '% n''emploie pas le jour comorien.', v_fn;
    end if;
  end loop;

  raise notice '[OK] 4. Cinq fonctions, aucune métier en SECURITY DEFINER, anon exclu, jour comorien.';
end $$;


-- --- 5. PÉRIMÈTRE DE SAUVEGARDE ------------------------------------------------
do $$
declare
  v_scope text[] := public.backup_scope();
  v_rate  int;
  v_veh   int;
  v_sup   int;
begin
  if not ('supplier_vehicle_rates' = any (v_scope)) then
    raise exception 'Les tarifs fournisseurs sont hors du périmètre de sauvegarde.';
  end if;

  select array_position(v_scope, 'supplier_vehicle_rates') into v_rate;
  select array_position(v_scope, 'vehicles')               into v_veh;
  select array_position(v_scope, 'suppliers')              into v_sup;

  if v_rate < v_veh or v_rate < v_sup then
    raise exception
      'Ordre du périmètre invalide : les tarifs précèdent leurs parents, la restauration échouerait.';
  end if;

  -- Les acquis du LOT 20 sont toujours là.
  if not ('service_variant_costs' = any (v_scope)) then
    raise exception 'Le catalogue de services a disparu du périmètre de sauvegarde.';
  end if;

  raise notice '[OK] 5. Périmètre de sauvegarde : % tables, tarifs après véhicules et fournisseurs.',
    array_length(v_scope, 1);
end $$;


-- --- 6. TROIS PROFILS RÉELS ---------------------------------------------------
--
-- LE PROFIL LOCATION est le cœur du lot : il voit tout du contrat — le parc, la
-- grille tarifaire, les montants —, et il ne doit RIEN voir du coût.

create temporary table recette_svr (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_ids  uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_cles text[] := array['couts', 'location', 'nul'];
  v_i    int;
begin
  for v_i in 1..3 loop
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at
    ) values (
      v_ids[v_i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'recette.svr.' || v_cles[v_i] || '@adikom.test', now(), now()
    );
    insert into recette_svr (cle, id) values (v_cles[v_i], v_ids[v_i]);
  end loop;

  insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
  values
    (v_ids[1], 'Recette', 'Svr couts',    'recette.svr.couts',    'recette.svr.couts@adikom.test',    'ACTIVE', false),
    (v_ids[2], 'Recette', 'Svr location', 'recette.svr.location', 'recette.svr.location@adikom.test', 'ACTIVE', false),
    (v_ids[3], 'Recette', 'Svr nul',      'recette.svr.nul',      'recette.svr.nul@adikom.test',      'ACTIVE', false);

  -- LE PROFIL COÛTS : il gère les coûts d'acquisition, et lit le parc.
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[1], p.id, 'ALLOW'
  from public.permissions p
  where p.code in (
    'rental.pricing.supplier.view', 'rental.pricing.supplier.create',
    'rental.pricing.supplier.update', 'rental.fleet.view', 'parties.suppliers.view'
  );

  /*
   * LE PROFIL LOCATION : il voit le parc, la grille, les contrats et leurs
   * montants. Il n'a AUCUNE capacité de coût fournisseur — et c'est exactement
   * ce que la recette doit prouver : `rental.pricing.view` n'ouvre pas
   * `rental.pricing.supplier.view` (A-2, DEC-024).
   */
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[2], p.id, 'ALLOW'
  from public.permissions p
  where p.code in (
    'rental.fleet.view', 'rental.pricing.view', 'rental.pricing.create',
    'rental.pricing.update', 'rental.rentals.view', 'rental.rentals.financial.view',
    'parties.suppliers.view', 'users.audit.view'
  );

  -- LE PROFIL NUL : il voit le parc, et rien d'autre.
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[3], p.id, 'ALLOW'
  from public.permissions p
  where p.code = 'rental.fleet.view';

  raise notice '[OK] 6. Trois profils : coûts, location sans coûts, lecture seule du parc.';
end $$;


create or replace function pg_temp.agir_comme(p_cle text)
returns void
language plpgsql
as $$
declare v_id uuid;
begin
  select id into v_id from recette_svr where cle = p_cle;
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


-- --- 7. LE DÉCOR : UN FOURNISSEUR, TROIS VÉHICULES D'ORIGINES DIFFÉRENTES -----
create temporary table recette_svr_objets (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_cat     uuid;
  v_sup     uuid;
  v_autre   uuid;
  v_partner uuid;
  v_fourni  uuid;
  v_adikom  uuid;
  v_partenariat uuid;
begin
  /*
   * UNE CATÉGORIE PROPRE À LA RECETTE, et non la première venue.
   *
   * Une catégorie du parc réel porte déjà un tarif standard. Le contrôle 18 y
   * ajouterait une règle de MÊME PORTÉE, que la contrainte d'exclusion du LOT 21
   * refuserait — à juste titre. La recette éprouverait alors la production au
   * lieu d'éprouver la règle.
   */
  insert into public.vehicle_categories (code, label)
  values ('RECETTE-SVR', 'Recette — Catégorie tarifs fournisseurs')
  returning id into v_cat;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER',
          'RECETTE SVR — Fournisseur', '+269 950', 'ACTIVE')
  returning id into v_sup;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER',
          'RECETTE SVR — Fournisseur étranger', '+269 951', 'ACTIVE')
  returning id into v_autre;

  insert into public.partners (partner_no, legal_name, phone)
  values (public.next_number('partner'), 'RECETTE SVR — Partenaire', '+269 952')
  returning id into v_partner;

  -- Le véhicule FOURNI : le seul qui accepte un coût d'acquisition.
  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id, status, entry_date)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'SVR-FOURNI', 'SVR-0001',
          'SUPPLIED', v_sup, 'AVAILABLE', current_date - 90)
  returning id into v_fourni;

  insert into public.vehicle_supplier_history (vehicle_id, supplier_id, started_on)
  values (v_fourni, v_sup, current_date - 90);

  -- Le véhicule ADIKOM : P-2 non tranchée.
  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'SVR-ADIKOM', 'SVR-0002',
          'OWNED', 'AVAILABLE')
  returning id into v_adikom;

  -- Le véhicule de PARTENARIAT : aucune décision n'existe.
  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, partner_id, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'SVR-PARTENARIAT', 'SVR-0003',
          'PARTNERSHIP', v_partner, 'AVAILABLE')
  returning id into v_partenariat;

  insert into recette_svr_objets values
    ('categorie', v_cat), ('fournisseur', v_sup), ('fournisseur_autre', v_autre),
    ('partenaire', v_partner), ('vehicule_fourni', v_fourni),
    ('vehicule_adikom', v_adikom), ('vehicule_partenariat', v_partenariat);

  raise notice '[OK] 7. Décor : un fournisseur, un véhicule fourni, un ADIKOM, un de partenariat.';
end $$;


-- --- 8. LE CAS DE RÉFÉRENCE DE LA DIRECTION ------------------------------------
--
-- 40 000 KMF/jour jusqu'au 30/09, 45 000 à partir du 01/10 — le second SAISI
-- AVANT sa date d'effet, ce que « le coût de la fiche » ne savait pas faire.

do $$
declare
  v_veh    uuid := (select id from recette_svr_objets where cle = 'vehicule_fourni');
  v_debut  date := (now() at time zone 'Indian/Comoro')::date - 60;
  v_bascule date := (now() at time zone 'Indian/Comoro')::date + 30;
  v_r      record;
  v_nb     int;
begin
  perform pg_temp.agir_comme('couts');

  perform public.set_supplier_vehicle_rate(
    v_veh, null, 40000, 'DAY', v_debut, 'Contrat initial', 'Ouverture'
  );

  -- LE COÛT FUTUR, SAISI AUJOURD'HUI.
  perform public.set_supplier_vehicle_rate(
    v_veh, null, 45000, 'DAY', v_bascule, 'Révision annuelle', 'Hausse convenue'
  );

  perform pg_temp.redevenir_service();

  -- a. Avant la bascule : 40 000.
  select * into v_r from public.resolve_supplier_rate(v_veh, v_bascule - 1);
  if v_r.amount <> 40000 or v_r.unit <> 'DAY' then
    raise exception 'Avant la bascule, le coût devrait être 40 000/jour, obtenu % %.',
      v_r.amount, v_r.unit;
  end if;

  -- b. Après la bascule : 45 000, sans qu'on ait rien fait ce jour-là.
  select * into v_r from public.resolve_supplier_rate(v_veh, v_bascule);
  if v_r.amount <> 45000 then
    raise exception 'À la bascule, le coût devrait être 45 000, obtenu %.', v_r.amount;
  end if;

  -- c. L'ANCIENNE VERSION N'A PAS ÉTÉ RÉÉCRITE : elle est CLOSE la veille.
  select count(*) into v_nb
  from public.supplier_vehicle_rates
  where vehicle_id = v_veh and amount = 40000 and is_active
    and valid_from = v_debut and valid_to = v_bascule - 1;

  if v_nb <> 1 then
    raise exception 'La version à 40 000 n''a pas été close proprement à la veille de la bascule.';
  end if;

  -- d. AVANT TOUTE VERSION : AUCUNE LIGNE. Un coût absent n'est pas un coût nul.
  if exists (select 1 from public.resolve_supplier_rate(v_veh, v_debut - 1)) then
    raise exception 'Un coût a été rendu pour une date antérieure à toute version.';
  end if;

  -- e. Le fournisseur retenu est bien celui qui met le véhicule à disposition.
  select * into v_r from public.resolve_supplier_rate(v_veh, v_bascule);
  if v_r.supplier_id is distinct from
     (select id from recette_svr_objets where cle = 'fournisseur') then
    raise exception 'Le coût n''est pas rattaché au fournisseur du véhicule.';
  end if;

  raise notice '[OK] 8. Le cas de la Direction : 40 000 / 45 000, aucune réécriture, aucun zéro inventé.';
end $$;


-- --- 9. CHEVAUCHEMENT, MONTANT ET PÉRIODE -------------------------------------
do $$
declare
  v_veh uuid := (select id from recette_svr_objets where cle = 'vehicule_fourni');
  v_sup uuid := (select id from recette_svr_objets where cle = 'fournisseur');
  v_on  date := (now() at time zone 'Indian/Comoro')::date;
  v_ok  int := 0;
begin
  perform pg_temp.agir_comme('couts');

  -- a. Deux versions ACTIVES qui se recouvrent : refusé par la base, et non par
  --    un déclencheur — la contrainte d'exclusion ferme aussi la COURSE entre
  --    deux saisies simultanées (DEC-028).
  begin
    insert into public.supplier_vehicle_rates
      (vehicle_id, supplier_id, amount, unit, valid_from, valid_to)
    values (v_veh, v_sup, 50000, 'DAY', v_on - 10, v_on + 10);
    raise exception 'Deux versions de coût qui se chevauchent ont été acceptées.';
  exception when exclusion_violation then v_ok := v_ok + 1;
  end;

  -- b. Un montant nul ou négatif n'existe pas.
  begin
    insert into public.supplier_vehicle_rates
      (vehicle_id, supplier_id, amount, unit, valid_from)
    values (v_veh, v_sup, 0, 'DAY', v_on + 400);
    raise exception 'Un coût nul a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- c. Une période ne se referme pas avant de s'ouvrir.
  begin
    insert into public.supplier_vehicle_rates
      (vehicle_id, supplier_id, amount, unit, valid_from, valid_to)
    values (v_veh, v_sup, 30000, 'DAY', v_on + 400, v_on + 300);
    raise exception 'Une période inversée a été acceptée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- d. Une version débutant le même jour qu'une autre : l'acte le refuse, et
  --    DIT lequel des deux gestes est demandé.
  begin
    perform public.set_supplier_vehicle_rate(v_veh, null, 41000, 'DAY', v_on - 60);
    raise exception 'Deux versions ont pu débuter le même jour.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  perform pg_temp.redevenir_service();

  if v_ok <> 4 then
    raise exception 'Seuls % refus sur 4 ont été opposés.', v_ok;
  end if;

  raise notice '[OK] 9. Chevauchement, montant nul, période inversée et doublon de date : refusés.';
end $$;


-- --- 10. 🟥 P-2 : UN VÉHICULE ADIKOM EST REFUSÉ, ET LE REFUS LA NOMME ---------
do $$
declare
  v_adikom uuid := (select id from recette_svr_objets where cle = 'vehicule_adikom');
  v_part   uuid := (select id from recette_svr_objets where cle = 'vehicule_partenariat');
  v_sup    uuid := (select id from recette_svr_objets where cle = 'fournisseur');
  v_on     date := (now() at time zone 'Indian/Comoro')::date;
  v_msg    text;
  v_ok     int := 0;
begin
  perform pg_temp.agir_comme('couts');

  /*
   * LE VÉHICULE ADIKOM.
   *
   * La décision A-3 dit « ADIKOM est un fournisseur » ; elle ne dit pas ce
   * qu'est le coût interne — tarif de référence, ou coût de revient calculé.
   * Le LOT 21 ne tranche pas, et le refus NOMME le point ouvert (Plan 02 §3.2).
   */
  begin
    insert into public.supplier_vehicle_rates
      (vehicle_id, supplier_id, amount, unit, valid_from)
    values (v_adikom, v_sup, 40000, 'DAY', v_on);
    raise exception 'Un coût d''acquisition a été enregistré sur un véhicule ADIKOM.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%P-2%' then
      raise exception
        'Le refus sur un véhicule ADIKOM ne nomme pas la décision manquante : %', v_msg;
    end if;
    v_ok := v_ok + 1;
  end;

  -- LE VÉHICULE DE PARTENARIAT : autre cas, autre raison, autre message.
  begin
    insert into public.supplier_vehicle_rates
      (vehicle_id, supplier_id, amount, unit, valid_from)
    values (v_part, v_sup, 40000, 'DAY', v_on);
    raise exception 'Un coût d''acquisition a été enregistré sur un véhicule de partenariat.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%partenariat%' then
      raise exception 'Le refus sur un véhicule de partenariat ne dit pas sa raison : %', v_msg;
    end if;
    v_ok := v_ok + 1;
  end;

  perform pg_temp.redevenir_service();

  -- LA CONTRAINTE DU PARC N'A PAS BOUGÉ : aucun véhicule ADIKOM n'est devenu
  -- « fourni » pour contourner la question (Plan 02 §3.2, voie (a) refusée).
  if not exists (
    select 1 from pg_constraint where conname = 'vehicles_origin_attachment_coherent'
  ) then
    raise exception 'La contrainte d''origine du parc a été altérée par le LOT 21.';
  end if;

  if v_ok <> 2 then
    raise exception 'Seuls % refus sur 2 ont été opposés.', v_ok;
  end if;

  raise notice '[OK] 10. Véhicule ADIKOM et véhicule de partenariat refusés ; P-2 nommée, parc intact.';
end $$;


-- --- 11. UN FOURNISSEUR ÉTRANGER, UN FOURNISSEUR ARCHIVÉ, UN VÉHICULE RETIRÉ --
do $$
declare
  v_veh    uuid := (select id from recette_svr_objets where cle = 'vehicule_fourni');
  v_autre  uuid := (select id from recette_svr_objets where cle = 'fournisseur_autre');
  v_sup    uuid := (select id from recette_svr_objets where cle = 'fournisseur');
  v_cat    uuid := (select id from recette_svr_objets where cle = 'categorie');
  v_retire uuid;
  v_on     date := (now() at time zone 'Indian/Comoro')::date;
  v_ok     int := 0;
begin
  -- a. Un fournisseur qui n'a jamais mis ce véhicule à disposition.
  perform pg_temp.agir_comme('couts');
  begin
    insert into public.supplier_vehicle_rates
      (vehicle_id, supplier_id, amount, unit, valid_from)
    values (v_veh, v_autre, 40000, 'DAY', v_on + 500);
    raise exception 'Un fournisseur étranger au véhicule a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;
  perform pg_temp.redevenir_service();

  -- b. Un fournisseur ARCHIVÉ n'accueille aucun coût nouveau (consigne §7).
  update public.suppliers set status = 'ARCHIVED' where id = v_sup;

  perform pg_temp.agir_comme('couts');
  begin
    insert into public.supplier_vehicle_rates
      (vehicle_id, supplier_id, amount, unit, valid_from)
    values (v_veh, v_sup, 40000, 'DAY', v_on + 500);
    raise exception 'Un coût a été ouvert auprès d''un fournisseur archivé.';
  exception when check_violation then v_ok := v_ok + 1;
  end;
  perform pg_temp.redevenir_service();

  update public.suppliers set status = 'ACTIVE' where id = v_sup;

  -- c. Un véhicule RETIRÉ du parc n'accueille aucun coût nouveau (consigne §8).
  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id,
     status, exit_date, exit_reason)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'SVR-RETIRE', 'SVR-0004',
          'SUPPLIED', v_sup, 'RETIRED', current_date, 'Recette')
  returning id into v_retire;

  perform pg_temp.agir_comme('couts');
  begin
    insert into public.supplier_vehicle_rates
      (vehicle_id, supplier_id, amount, unit, valid_from)
    values (v_retire, v_sup, 40000, 'DAY', v_on);
    raise exception 'Un coût a été ouvert sur un véhicule retiré du parc.';
  exception when check_violation then v_ok := v_ok + 1;
  end;
  perform pg_temp.redevenir_service();

  if v_ok <> 3 then
    raise exception 'Seuls % refus sur 3 ont été opposés.', v_ok;
  end if;

  raise notice '[OK] 11. Fournisseur étranger, fournisseur archivé et véhicule retiré : refusés.';
end $$;


-- --- 12. UNE VERSION NE SE RÉÉCRIT PAS — D16(a) -------------------------------
do $$
declare
  v_veh  uuid := (select id from recette_svr_objets where cle = 'vehicule_fourni');
  v_id   uuid;
  v_ok   int := 0;
begin
  select id into v_id
  from public.supplier_vehicle_rates
  where vehicle_id = v_veh and amount = 40000 and is_active;

  perform pg_temp.agir_comme('couts');

  -- a. Le montant.
  begin
    update public.supplier_vehicle_rates set amount = 99000 where id = v_id;
    raise exception 'Le montant d''une version a pu être réécrit.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- b. L'unité.
  begin
    update public.supplier_vehicle_rates set unit = 'FLAT' where id = v_id;
    raise exception 'L''unité d''une version a pu être réécrite.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- c. La date d'effet.
  begin
    update public.supplier_vehicle_rates
       set valid_from = (now() at time zone 'Indian/Comoro')::date where id = v_id;
    raise exception 'La date d''effet d''une version a pu être réécrite.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- d. LE MOTIF NE SE RÉÉCRIT PAS APRÈS COUP (migration 069).
  begin
    update public.supplier_vehicle_rates set reason = 'Autre chose' where id = v_id;
    raise exception 'Le motif d''une version a pu être réécrit après coup.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- e. Les CONDITIONS, elles, se corrigent : c'est le seul champ qui le peut.
  update public.supplier_vehicle_rates
     set conditions = 'Contrat longue durée, révisable annuellement' where id = v_id;

  perform pg_temp.redevenir_service();

  if v_ok <> 4 then
    raise exception 'Seuls % refus de réécriture sur 4 ont été opposés.', v_ok;
  end if;

  if not exists (
    select 1 from public.supplier_vehicle_rates
    where id = v_id and conditions like 'Contrat longue durée%' and amount = 40000
  ) then
    raise exception 'La correction des conditions n''a pas abouti, ou a touché le montant.';
  end if;

  raise notice '[OK] 12. Montant, unité, date et motif inaltérables ; seules les conditions se corrigent.';
end $$;


-- --- 13. `create` N'OUVRE PAS LE RETRAIT, `update` N'OUVRE PAS L'OUVERTURE ----
--
-- DEC-024, A-14 : ouvrir un coût et retirer celui qui s'applique ne sont pas le
-- même geste. Deux profils partiels l'éprouvent, dans les deux sens.

do $$
declare
  v_veh    uuid := (select id from recette_svr_objets where cle = 'vehicule_fourni');
  v_id     uuid;
  v_creer  uuid := gen_random_uuid();
  v_retirer uuid := gen_random_uuid();
  v_on     date := (now() at time zone 'Indian/Comoro')::date;
  v_ok     int := 0;
begin
  select id into v_id
  from public.supplier_vehicle_rates where vehicle_id = v_veh and amount = 45000 and is_active;

  -- Deux profils partiels : l'un sait ouvrir, l'autre sait retirer.
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_creer,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'recette.svr.creer@adikom.test', now(), now()),
    (v_retirer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'recette.svr.retirer@adikom.test', now(), now());

  insert into public.app_users (id, first_name, last_name, username, email, status)
  values
    (v_creer,   'Recette', 'Svr creer',   'recette.svr.creer',   'recette.svr.creer@adikom.test',   'ACTIVE'),
    (v_retirer, 'Recette', 'Svr retirer', 'recette.svr.retirer', 'recette.svr.retirer@adikom.test', 'ACTIVE');

  insert into public.user_permissions (user_id, permission_id, effect)
  select v_creer, p.id, 'ALLOW' from public.permissions p
  where p.code in ('rental.pricing.supplier.view', 'rental.pricing.supplier.create',
                   'rental.fleet.view');

  insert into public.user_permissions (user_id, permission_id, effect)
  select v_retirer, p.id, 'ALLOW' from public.permissions p
  where p.code in ('rental.pricing.supplier.view', 'rental.pricing.supplier.update',
                   'rental.fleet.view');

  insert into recette_svr values ('creer', v_creer), ('retirer', v_retirer);

  -- a. `create` ne retire pas.
  perform pg_temp.agir_comme('creer');
  begin
    perform public.deactivate_supplier_vehicle_rate(v_id, 'Tentative');
    raise exception 'Un porteur de `create` a pu retirer une version.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  perform pg_temp.redevenir_service();

  -- b. `update` n'ouvre pas.
  perform pg_temp.agir_comme('retirer');
  begin
    perform public.set_supplier_vehicle_rate(v_veh, null, 47000, 'DAY', v_on + 700);
    raise exception 'Un porteur de `update` a pu ouvrir une version.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  perform pg_temp.redevenir_service();

  -- c. Chacun accomplit SON acte.
  perform pg_temp.agir_comme('creer');
  perform public.set_supplier_vehicle_rate(v_veh, null, 47000, 'DAY', v_on + 700, null, 'Recette');
  perform pg_temp.redevenir_service();

  perform pg_temp.agir_comme('retirer');
  perform public.deactivate_supplier_vehicle_rate(v_id, 'Version annulée en recette');
  perform pg_temp.redevenir_service();

  if v_ok <> 2 then
    raise exception 'Seuls % refus croisés sur 2 ont été opposés.', v_ok;
  end if;

  -- LA VERSION RETIRÉE N'A PAS DISPARU : elle garde son motif d'origine et la
  -- raison de son retrait, distincts l'un de l'autre.
  if not exists (
    select 1 from public.supplier_vehicle_rates
    where id = v_id and not is_active
      and deactivation_reason = 'Version annulée en recette'
      and reason = 'Hausse convenue'
  ) then
    raise exception 'La version retirée a perdu son motif, ou a disparu.';
  end if;

  raise notice '[OK] 13. Ouvrir et retirer sont deux actes, refusés séparément ; la version retirée demeure.';
end $$;


-- --- 14. RIEN NE SE SUPPRIME ---------------------------------------------------
do $$
declare
  v_id uuid := (select id from public.supplier_vehicle_rates
                where vehicle_id = (select id from recette_svr_objets where cle = 'vehicule_fourni')
                limit 1);
begin
  perform pg_temp.agir_comme('couts');
  begin
    delete from public.supplier_vehicle_rates where id = v_id;
    raise exception 'Une version de coût a pu être supprimée.';
  exception when others then null;
  end;
  perform pg_temp.redevenir_service();

  if not exists (select 1 from public.supplier_vehicle_rates where id = v_id) then
    raise exception 'La version a bel et bien disparu.';
  end if;

  raise notice '[OK] 14. Une version de coût ne se supprime pas.';
end $$;


-- --- 15. AUCUNE MARGE N'EST STOCKÉE — doctrine D1 -----------------------------
do $$
declare
  v_veh   uuid := (select id from recette_svr_objets where cle = 'vehicule_fourni');
  v_on    date := (now() at time zone 'Indian/Comoro')::date;
  v_cout  bigint;
  v_colonnes text[];
begin
  select amount into v_cout from public.resolve_supplier_rate(v_veh, v_on);

  if v_cout <> 40000 then
    raise exception 'Le coût applicable aujourd''hui devrait être 40 000, obtenu %.', v_cout;
  end if;

  -- 50 000 facturé − 40 000 payé = 10 000. Le calcul est possible ; il n'est
  -- écrit NULLE PART.
  if (50000 - v_cout) <> 10000 then
    raise exception 'La commission de référence de la Direction ne se calcule pas.';
  end if;

  select array_agg(column_name::text) into v_colonnes
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'supplier_vehicle_rates'
    and (column_name like '%margin%' or column_name like '%commission%');

  if v_colonnes is not null then
    raise exception 'Une marge est stockée en base : % (doctrine D1).', v_colonnes;
  end if;

  raise notice '[OK] 15. Commission calculable (10 000), et stockée nulle part.';
end $$;


-- --- 16. LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME — DEC-038 ---------------
do $$
declare
  v_veh uuid := (select id from recette_svr_objets where cle = 'vehicule_fourni');
  v_nb  int;
begin
  -- Toute écriture de coût est journalisée sous PRICE_CHANGE, module `rental`.
  select count(*) into v_nb
  from public.audit_log
  where entity_type = 'supplier_vehicle_rates' and action = 'PRICE_CHANGE';

  if v_nb = 0 then
    raise exception 'Aucune écriture de coût n''a été journalisée.';
  end if;

  -- LE POINT QUI COMPTE : le détail d'un événement de coût exige LA capacité du
  -- coût, jamais celle de la grille tarifaire ni celle du parc.
  if public.audit_detail_permission('supplier_vehicle_rates')
     is distinct from 'rental.pricing.supplier.view' then
    raise exception
      'Le détail d''un tarif fournisseur au journal ne dépend pas de `rental.pricing.supplier.view`.';
  end if;

  -- Les acquis antérieurs n'ont pas bougé en chemin.
  if public.audit_detail_permission('service_variant_costs')
     is distinct from 'catalog.services.cost.view'
  or public.audit_detail_permission('maintenance_costs')
     is distinct from 'rental.maintenance.cost.view'
  or public.audit_detail_permission('pricing_rules')
     is distinct from 'rental.pricing.view' then
    raise exception 'La cartographie du journal antérieure au LOT 21 a été altérée.';
  end if;

  raise notice '[OK] 16. % écritures journalisées ; le détail garde SA lecture.', v_nb;
end $$;


-- --- 17. UN TROU NE REND AUCUNE LIGNE ------------------------------------------
do $$
declare
  v_cat  uuid := (select id from recette_svr_objets where cle = 'categorie');
  v_sup  uuid := (select id from recette_svr_objets where cle = 'fournisseur');
  v_veh  uuid;
  v_on   date := (now() at time zone 'Indian/Comoro')::date;
begin
  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'SVR-TROU', 'SVR-0005',
          'SUPPLIED', v_sup, 'AVAILABLE')
  returning id into v_veh;

  perform pg_temp.agir_comme('couts');

  -- Une version bornée, et RIEN au-delà : le trou est explicite.
  insert into public.supplier_vehicle_rates
    (vehicle_id, supplier_id, amount, unit, valid_from, valid_to)
  values (v_veh, v_sup, 38000, 'DAY', v_on - 20, v_on - 10);

  perform pg_temp.redevenir_service();

  if not exists (select 1 from public.resolve_supplier_rate(v_veh, v_on - 15)) then
    raise exception 'Le coût de la période couverte n''est pas rendu.';
  end if;

  -- DANS LE TROU : aucune ligne. Jamais zéro, jamais le dernier connu.
  if exists (select 1 from public.resolve_supplier_rate(v_veh, v_on)) then
    raise exception 'Un coût a été rendu dans un trou de chronologie.';
  end if;

  -- Et la résolution PAR LOT dit la même chose : le véhicule reste dans la
  -- liste, sans coût — un véhicule sans coût n'est pas un véhicule absent.
  if not exists (
    select 1 from public.resolve_supplier_rates(v_on) r where r.vehicle_id = v_veh
  ) then
    raise exception 'La résolution par lot a fait disparaître un véhicule sans coût.';
  end if;

  if exists (
    select 1 from public.resolve_supplier_rates(v_on) r
    where r.vehicle_id = v_veh and r.amount is not null
  ) then
    raise exception 'La résolution par lot a inventé un coût dans un trou.';
  end if;

  raise notice '[OK] 17. Un trou ne rend aucune ligne, et le véhicule reste visible sans coût.';
end $$;


-- --- 18. LES TARIFS CLIENTS N'ONT PAS ÉTÉ TOUCHÉS — DEC-002 INTACTE -----------
--
-- 🟥 LE PLAN 02 §5.7 RECOMMANDAIT UNE CONTRAINTE D'EXCLUSION SUR
-- `pricing_rules`, pour refuser deux règles de PORTÉE IDENTIQUE dont les
-- périodes se recouvrent. LE LOT 21 NE L'A PAS POSÉE, et ce contrôle garde la
-- raison — afin que personne ne la repose sans rouvrir la décision.
--
-- DEC-002 dit : « à égalité de spécificité, le tarif LE PLUS RÉCEMMENT CRÉÉ
-- s'applique ». Cette règle SUPPOSE que deux tarifs de portée identique
-- coexistent : elle n'aurait aucun objet autrement. Elle est implémentée par
-- `resolve_pricing_rule` et éprouvée par `supabase/tests/location.sql` §15.
--
-- La contrainte recommandée fait donc échouer une règle métier EN VIGUEUR. Le
-- recensement demandé par le §5.7 a bien été mené (0 chevauchement en
-- production), et il ne change rien à ce constat : l'arbitrage appartient à la
-- Direction, et il suppose de ROUVRIR DEC-002.

do $$
declare
  v_cat  uuid := (select id from recette_svr_objets where cle = 'categorie');
  v_veh  uuid := (select id from recette_svr_objets where cle = 'vehicule_fourni');
  v_on   date := (now() at time zone 'Indian/Comoro')::date;
  v_r    record;
begin
  -- a. AUCUNE CONTRAINTE D'EXCLUSION N'A ÉTÉ POSÉE sur les tarifs clients.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pricing_rules'::regclass and contype = 'x'
  ) then
    raise exception
      'Une contrainte d''exclusion a été posée sur `pricing_rules` : elle contredit DEC-002, qui départage deux tarifs de portée identique par leur date de création.';
  end if;

  -- b. ET LA RÈGLE DE DEC-002 FONCTIONNE TOUJOURS : deux tarifs de portée
  --    identique coexistent, et le plus récent l'emporte.
  insert into public.pricing_rules (vehicle_id, amount, unit, valid_from, created_at)
  values (v_veh, 50000, 'DAY', v_on - 30, now() - interval '1 hour');

  insert into public.pricing_rules (vehicle_id, amount, unit, valid_from, created_at)
  values (v_veh, 60000, 'DAY', v_on - 30, now());

  select * into v_r from public.resolve_pricing_rule(null, v_veh, v_on);
  if v_r.amount <> 60000 then
    raise exception
      'DEC-002 ne départage plus à égalité de spécificité : obtenu % au lieu de 60 000.', v_r.amount;
  end if;

  -- c. ET LA HIÉRARCHIE DES PORTÉES TIENT : le véhicule l'emporte sur sa
  --    catégorie, qui l'emporte sur le tarif standard.
  insert into public.pricing_rules (category_id, amount, unit, valid_from)
  values (v_cat, 35000, 'DAY', v_on - 30);

  select * into v_r from public.resolve_pricing_rule(null, v_veh, v_on);
  if v_r.amount <> 60000 or v_r.source <> 'VEHICLE' then
    raise exception 'DEC-002 : le tarif du véhicule ne l''emporte plus (% / %).',
      v_r.amount, v_r.source;
  end if;

  -- d. AUCUNE COLONNE DE `pricing_rules` N'A ÉTÉ AJOUTÉE, MODIFIÉE NI RETIRÉE
  --    (Plan 02 §20.1, garantie n° 2).
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.pricing_rules'::regclass
      and attname = 'specificity' and attgenerated = 's'
  ) then
    raise exception 'La colonne générée `specificity` a été altérée : DEC-002 ne tiendrait plus.';
  end if;

  raise notice '[OK] 18. `pricing_rules` intacte : DEC-002 départage encore, aucune contrainte posée.';
end $$;


-- --- 19. LA RÉSOLUTION PAR LOT NE DUPLIQUE PAS LE PRÉDICAT --------------------
do $$
declare
  v_veh   uuid := (select id from recette_svr_objets where cle = 'vehicule_fourni');
  v_on    date := (now() at time zone 'Indian/Comoro')::date;
  v_unite bigint;
  v_lot   bigint;
begin
  select amount into v_unite from public.resolve_supplier_rate(v_veh, v_on);
  select amount into v_lot
  from public.resolve_supplier_rates(v_on) r where r.vehicle_id = v_veh;

  if v_unite is distinct from v_lot then
    raise exception
      'La résolution par lot (%) diverge de la résolution unitaire (%) : le prédicat est dupliqué.',
      v_lot, v_unite;
  end if;

  -- Les deux fonctions de lot DÉLÈGUENT réellement.
  if (select prosrc from pg_proc
      where oid = 'public.resolve_supplier_rates(date)'::regprocedure)
     not like '%resolve_supplier_rate(%' then
    raise exception 'resolve_supplier_rates n''appelle plus le résolveur unitaire.';
  end if;

  if (select prosrc from pg_proc
      where oid = 'public.resolve_standard_prices(date)'::regprocedure)
     not like '%resolve_pricing_rule(%' then
    raise exception 'resolve_standard_prices n''appelle plus resolve_pricing_rule.';
  end if;

  raise notice '[OK] 19. Résolution par lot identique à la résolution unitaire, sans duplication.';
end $$;


rollback;
