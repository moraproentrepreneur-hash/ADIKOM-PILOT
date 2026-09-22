-- =============================================================================
-- ADIKOM PILOT — Recette Avenants, segments et remplacement de véhicule
-- LOT 22 — DEC-045 · A-3, A-4, A-5, A-7
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur ne
-- peuvent garantir :
--
--   · UNE capacité nouvelle — `rental.rentals.swap` — et aucune de plus ;
--   · trois TABLES, RLS activée, suppression et TRUNCATE refermés ;
--   · le COÛT GELÉ ne s'ouvre QUE par `rental.pricing.supplier.view` ;
--   · les ACTES ne sont pas `SECURITY DEFINER` (doctrine D4) ;
--   · 🟩 LE CAS DE LA DIRECTION, de bout en bout : véhicule A du J-10 au J-6,
--     panne, véhicule B du J-6 au J-1, MÊME CONTRAT, un avenant, deux segments ;
--   · le TARIF du nouveau véhicule s'applique au bon segment, l'ancien est
--     CONSERVÉ (A-5, cas ordinaire) ;
--   · l'EXCEPTION tarifaire exige `rental.pricing.override`, un motif écrit, et
--     elle est journalisée sous `PRICE_CHANGE` (A-5, cas d'exception) ;
--   · le COÛT est GELÉ par segment, et une saisie RÉTROACTIVE de tarif
--     fournisseur ne le déplace plus ;
--   · les COMMISSIONS par segment : 10 000 puis 15 000 ;
--   · un véhicule INDISPONIBLE est refusé ; deux segments qui se RECOUVRENT
--     aussi ; un TROU dans la couverture aussi ;
--   · l'IDENTIFIANT DU CONTRAT ne change pas, et l'ancien véhicule reste
--     consultable ;
--   · rien ne se SUPPRIME, un avenant ne se RÉÉCRIT pas ;
--   · 🟥 LA PROLONGATION n'allonge QUE le segment ouvert — l'obstacle du
--     Plan 02 §1.3, celui qui aurait bloqué un véhicule rendu — et elle
--     consigne désormais SON AVENANT (A-4, LOT 23) ;
--   · `pricing_rules` INTACTE : DEC-002 départage toujours, aucune contrainte
--     d'exclusion n'y a été posée ;
--   · CHAQUE LOCATION du système porte au moins un segment.
--
-- Exécution :
--   npm run db:verify:amendments
--
-- CE SCRIPT S'EXÉCUTE AVEC LE RÔLE DE LA CHAÎNE DE CONNEXION.
--
-- Ce rôle CONTOURNE RLS : les refus de LECTURE s'éprouvent donc par la forme des
-- policies ici, et par de VRAIES SESSIONS dans `verify:amendments`. Les refus
-- portés par des DÉCLENCHEURS et par `require_capability`, eux, s'appliquent à
-- tout le monde et sont éprouvés pour de bon — en endossant l'identité d'un
-- compte, comme PostgREST le fait.
--
-- AUCUNE DATE EN DUR : tout se situe par rapport au JOUR COMORIEN. La
-- transaction est annulée en fin de script — aucun résidu.
-- =============================================================================

begin;


-- --- 1. UNE CAPACITÉ, ET PAS UNE DE PLUS --------------------------------------
do $$
declare v_row public.permissions%rowtype;
begin
  select * into v_row from public.permissions where code = 'rental.rentals.swap';

  if not found then
    raise exception 'La capacité `rental.rentals.swap` est absente du catalogue.';
  end if;

  if v_row.action <> 'UPDATE' or not v_row.is_sensitive then
    raise exception
      'Le remplacement de véhicule doit être une capacité SENSIBLE de nature UPDATE.';
  end if;

  if v_row.module_code <> 'rental' or v_row.menu_code <> 'rentals' then
    raise exception
      'Le remplacement ne vit pas sous Gestion de location → Locations.';
  end if;

  /*
   * AUCUNE CAPACITÉ INVENTÉE AUTOUR DE L'AVENANT (CLAUDE.md §19 bis).
   *
   * Consulter les avenants et les segments, c'est consulter L'HISTOIRE DU
   * CONTRAT : quel véhicule, quand, à quel tarif. Une capacité de plus ne
   * fermerait qu'un onglet — et une permission qui ne fait que masquer une carte
   * n'en est pas une (DEC-036 §d). Ce qui EST confidentiel dans un segment, son
   * coût, a sa propre table et sa propre capacité.
   */
  if exists (
    select 1 from public.permissions
    where code like 'rental.rentals.amendment%'
       or code like 'rental.rentals.segment%'
       or code like 'rental.rentals.penalty%'
       or code like 'rental.rentals.rate.%'
       or code like '%.commission.%'
  ) then
    raise exception 'Une capacité a été créée pour une fonctionnalité que le lot ne livre pas.';
  end if;

  -- LA CAPACITÉ DORMANTE TROUVE SON EMPLOI, elle n'est pas doublée (Plan 02 §1.4).
  if not exists (
    select 1 from public.permissions
    where code = 'rental.pricing.override' and action = 'ADMIN'
  ) then
    raise exception '`rental.pricing.override` a disparu ou a changé de nature.';
  end if;

  -- Les codes antérieurs n'ont pas bougé : un code attribué ne se touche pas.
  if not exists (select 1 from public.permissions where code = 'rental.rentals.extend')
  or not exists (select 1 from public.permissions where code = 'rental.pricing.supplier.view')
  or not exists (select 1 from public.permissions where code = 'rental.rentals.download') then
    raise exception 'Une capacité antérieure au LOT 22 a disparu du catalogue.';
  end if;

  raise notice '[OK] 1. Une capacité nouvelle, sensible, bien placée — et aucune de plus.';
end $$;


-- --- 2. LES TROIS TABLES, REFERMÉES -------------------------------------------
do $$
declare
  v_table  text;
  v_fautes text[] := '{}';
begin
  foreach v_table in array array[
    'rental_amendments', 'rental_segments', 'rental_segment_costs'
  ] loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = v_table
    ) then
      raise exception 'Table % absente.', v_table;
    end if;

    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      v_fautes := v_fautes || (v_table || ' : RLS inactive');
    end if;

    if has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') then
      v_fautes := v_fautes || (v_table || ' : DELETE accordé');
    end if;

    -- TRUNCATE ne déclenche aucun déclencheur de ligne : il contournerait
    -- `fn_forbid_delete` et effacerait l'histoire sans laisser de trace.
    if has_table_privilege('authenticated', 'public.' || v_table, 'TRUNCATE') then
      v_fautes := v_fautes || (v_table || ' : TRUNCATE accordé');
    end if;

    if has_table_privilege('anon', 'public.' || v_table, 'SELECT') then
      v_fautes := v_fautes || (v_table || ' : anon peut lire');
    end if;

    -- Aucune policy de suppression, sous aucune forme — `*` couvre DELETE.
    if exists (
      select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relname = v_table and p.polcmd in ('d', '*')
    ) then
      v_fautes := v_fautes || (v_table || ' : policy autorisant la suppression');
    end if;
  end loop;

  -- UN AVENANT NE SE RÉÉCRIT PAS : le droit lui-même est retiré.
  if has_table_privilege('authenticated', 'public.rental_amendments', 'UPDATE') then
    v_fautes := v_fautes || 'rental_amendments : UPDATE accordé';
  end if;

  -- LE COÛT GELÉ N'EST ÉCRIT QUE PAR LA BASE.
  if has_table_privilege('authenticated', 'public.rental_segment_costs', 'INSERT')
  or has_table_privilege('authenticated', 'public.rental_segment_costs', 'UPDATE') then
    v_fautes := v_fautes || 'rental_segment_costs : écrivable par une session';
  end if;

  -- Les contraintes structurantes.
  if not exists (
    select 1 from pg_constraint where conname = 'rental_segments_no_overlap' and contype = 'x'
  ) then
    v_fautes := v_fautes || 'contrainte d''exclusion des segments absente';
  end if;

  if not exists (select 1 from pg_class where relname = 'rental_segments_one_active_idx') then
    v_fautes := v_fautes || 'index du segment ouvert unique absent';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rental_amendments_override_motivated'
  ) then
    v_fautes := v_fautes || 'contrainte de motif d''exception absente';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicle_occupations'
      and column_name = 'rental_segment_id'
  ) then
    v_fautes := v_fautes || 'vehicle_occupations ne nomme pas son segment';
  end if;

  if array_length(v_fautes, 1) is not null then
    raise exception 'Tables mal refermées : %', array_to_string(v_fautes, ' · ');
  end if;

  raise notice '[OK] 2. Trois tables, RLS active, suppression et TRUNCATE refermés, anon exclu.';
end $$;


-- --- 3. LA GARANTIE CENTRALE : LE COÛT GELÉ NE CITE QUE SA CAPACITÉ -----------
do $$
declare
  v_qual text;
  v_seg  text;
begin
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'rental_segment_costs'
    and policyname = 'rental_segment_costs_select';

  if v_qual is null then
    raise exception 'La policy de lecture du coût gelé est absente.';
  end if;

  if v_qual not like '%rental.pricing.supplier.view%' then
    raise exception
      'La lecture du coût gelé ne s''appuie pas sur `rental.pricing.supplier.view` : %', v_qual;
  end if;

  /*
   * AUCUNE AUTRE CAPACITÉ N'Y FIGURE, et c'est tout l'objet de la table séparée.
   *
   * `rental_segments` s'ouvre par `rental.rentals.view` — il FAUT qu'un
   * exploitant voie quel véhicule a servi et quand. Si le coût y était rangé, ce
   * même `select` le lui rendrait : RLS filtre des LIGNES, pas des COLONNES.
   */
  if v_qual like '%rental.rentals.view%'
  or v_qual like '%rental.rentals.financial.view%'
  or v_qual like '%rental.fleet.view%'
  or v_qual like '%''rental.pricing.view''%' then
    raise exception 'Le coût gelé s''ouvre par une capacité étrangère : %', v_qual;
  end if;

  -- La garde est ENVELOPPÉE : sans sous-select, `has_permission` serait évaluée
  -- une fois PAR LIGNE (migration 065).
  if v_qual not like '%SELECT%has_permission%' then
    raise exception 'La garde de lecture du coût gelé n''est pas enveloppée : %', v_qual;
  end if;

  -- AUCUNE policy d'écriture sur le coût gelé : il n'est écrit que par la base.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rental_segment_costs'
      and cmd <> 'SELECT'
  ) then
    raise exception 'Une policy d''écriture existe sur le coût gelé.';
  end if;

  -- Et le segment, lui, se lit AVEC le contrat — c'est son objet.
  select qual into v_seg
  from pg_policies
  where schemaname = 'public' and tablename = 'rental_segments'
    and policyname = 'rental_segments_select';

  if v_seg is null or v_seg not like '%rental.rentals.view%' then
    raise exception 'Un segment doit se lire avec la location dont il fait l''histoire.';
  end if;

  if v_seg like '%supplier%' then
    raise exception
      'La lecture d''un segment exige une capacité de coût : l''histoire du contrat deviendrait confidentielle.';
  end if;

  raise notice '[OK] 3. Le coût gelé ne s''ouvre QUE par sa capacité ; le segment se lit avec le contrat.';
end $$;


-- --- 4. LES FONCTIONS — D4, JOUR COMORIEN, anon exclu -------------------------
do $$
declare
  v_fn   text;
  v_src  text;
  v_defs text[] := '{}';
begin
  foreach v_fn in array array[
    'public.replace_rental_vehicle(uuid, uuid, timestamptz, text, bigint, public.pricing_unit, text, text)',
    'public.change_rental_rate(uuid, timestamptz, bigint, public.pricing_unit, text, text)'
  ] loop
    if not exists (select 1 from pg_proc where oid = v_fn::regprocedure) then
      raise exception 'Fonction % absente.', v_fn;
    end if;

    -- DOCTRINE D4 : aucun ACTE métier en SECURITY DEFINER.
    if (select prosecdef from pg_proc where oid = v_fn::regprocedure) then
      v_defs := v_defs || v_fn;
    end if;

    if has_function_privilege('anon', v_fn::regprocedure, 'execute') then
      raise exception 'anon peut exécuter %.', v_fn;
    end if;

    /*
     * LE JOUR EST COMORIEN, PAS UTC (DEC-025 §e). `current_date` s'évalue en
     * UTC : entre 21 h et minuit, il désigne LA VEILLE à Moroni. Un tarif
     * résolu le soir d'une bascule prendrait alors la version de la veille.
     */
    select pg_get_functiondef(v_fn::regprocedure) into v_src;
    if v_src not like '%Indian/Comoro%' then
      raise exception '% n''emploie pas le jour comorien.', v_fn;
    end if;
  end loop;

  if array_length(v_defs, 1) is not null then
    raise exception 'Actes métier en SECURITY DEFINER : %', v_defs;
  end if;

  /*
   * LES GARDES, ELLES, SONT `SECURITY DEFINER` — et doivent l'être : elles
   * comptent la vérité de la base, non ce que l'appelant peut lire
   * (migration 062). Le gel du coût en particulier : l'exploitant qui remplace
   * un véhicule n'a PAS le droit de lire le coût fournisseur, et le coût doit
   * néanmoins être gelé.
   */
  foreach v_fn in array array[
    'public.fn_rental_amendment_guard()',
    'public.fn_rental_segment_guard()',
    'public.fn_lock_rental_segment_cost()',
    'public.fn_rental_vehicle_follows_segment()'
  ] loop
    if not (select prosecdef from pg_proc where oid = v_fn::regprocedure) then
      raise exception
        '% n''est pas SECURITY DEFINER : elle compterait ce que l''acteur voit, ou perdrait le coût.',
        v_fn;
    end if;
  end loop;

  -- Le gel interroge LE RÉSOLVEUR, il ne redéfinit pas le prédicat (D16(c)).
  select pg_get_functiondef('public.fn_lock_rental_segment_cost()'::regprocedure) into v_src;
  if v_src not like '%resolve_supplier_rate%' then
    raise exception
      'Le gel du coût ne délègue pas au résolveur du LOT 21 : il y aurait deux implémentations de la résolution.';
  end if;

  -- Et le remplacement délègue la résolution du TARIF CLIENT à DEC-002.
  select pg_get_functiondef(
    'public.replace_rental_vehicle(uuid, uuid, timestamptz, text, bigint, public.pricing_unit, text, text)'::regprocedure
  ) into v_src;
  if v_src not like '%resolve_pricing_rule%' then
    raise exception
      'Le remplacement ne délègue pas le tarif client à `resolve_pricing_rule` : DEC-002 serait réécrite.';
  end if;

  raise notice '[OK] 4. Deux actes en SECURITY INVOKER, quatre gardes en DEFINER, jour comorien, résolveurs délégués.';
end $$;


-- --- 5. PÉRIMÈTRE DE SAUVEGARDE ------------------------------------------------
do $$
declare
  v_scope text[] := public.backup_scope();
  v_paire text;
  v_pos   int;
  v_par   int;
begin
  foreach v_paire in array array[
    'rental_amendments:rentals',
    'rental_segments:rental_amendments',
    'rental_segments:vehicles',
    'rental_segment_costs:rental_segments',
    'rental_segment_costs:supplier_vehicle_rates',
    'vehicle_occupations:rental_segments'
  ] loop
    select array_position(v_scope, split_part(v_paire, ':', 1)) into v_pos;
    select array_position(v_scope, split_part(v_paire, ':', 2)) into v_par;

    if v_pos is null then
      raise exception 'Table « % » hors du périmètre de sauvegarde.', split_part(v_paire, ':', 1);
    end if;

    if v_par is null or v_pos < v_par then
      raise exception
        'Ordre du périmètre invalide : « % » précède « % », la restauration échouerait.',
        split_part(v_paire, ':', 1), split_part(v_paire, ':', 2);
    end if;
  end loop;

  -- Les acquis des lots antérieurs sont toujours là.
  if not ('supplier_vehicle_rates' = any (v_scope))
  or not ('service_variant_costs' = any (v_scope)) then
    raise exception 'Un acquis d''un lot antérieur a disparu du périmètre de sauvegarde.';
  end if;

  raise notice '[OK] 5. Périmètre de sauvegarde : % tables, avenants et segments dans l''ordre.',
    array_length(v_scope, 1);
end $$;


-- --- 6. QUATRE PROFILS RÉELS ---------------------------------------------------
--
-- LE PROFIL `exploitation` EST LE CŒUR DE LA RECETTE : il conduit tout le cycle,
-- remplace un véhicule, voit les montants du contrat et lit le journal — et il ne
-- doit voir AUCUN coût, ni pouvoir forcer AUCUN tarif.

create temporary table recette_avn (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_ids  uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_cles text[] := array['exploitation', 'avenant', 'couts', 'lecture'];
  v_i    int;
begin
  for v_i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_ids[v_i], '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated',
            'recette.avn.' || v_cles[v_i] || '@adikom.test', now(), now());
    insert into recette_avn (cle, id) values (v_cles[v_i], v_ids[v_i]);
  end loop;

  insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
  values
    (v_ids[1], 'Recette', 'Avn exploitation', 'recette.avn.exploitation', 'recette.avn.exploitation@adikom.test', 'ACTIVE', false),
    (v_ids[2], 'Recette', 'Avn avenant',      'recette.avn.avenant',      'recette.avn.avenant@adikom.test',      'ACTIVE', false),
    (v_ids[3], 'Recette', 'Avn couts',        'recette.avn.couts',        'recette.avn.couts@adikom.test',        'ACTIVE', false),
    (v_ids[4], 'Recette', 'Avn lecture',      'recette.avn.lecture',      'recette.avn.lecture@adikom.test',      'ACTIVE', false);

  -- EXPLOITATION : tout le cycle, le remplacement, les montants, le journal.
  -- AUCUN coût fournisseur, AUCUNE dérogation tarifaire.
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[1], p.id, 'ALLOW' from public.permissions p
  where p.code in (
    'rental.fleet.view', 'rental.fleet.status.update', 'rental.pricing.view',
    'rental.reservations.view', 'rental.reservations.create', 'rental.reservations.confirm',
    'rental.reservations.cancel',
    'rental.rentals.view', 'rental.rentals.create', 'rental.rentals.update',
    'rental.rentals.checkout', 'rental.rentals.extend', 'rental.rentals.return',
    'rental.rentals.cancel', 'rental.rentals.financial.view', 'rental.rentals.swap',
    'parties.clients.view', 'users.audit.view'
  );

  -- AVENANT : l'exploitation, PLUS la dérogation tarifaire (A-5, cas d'exception).
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[2], p.id, 'ALLOW' from public.permissions p
  where p.code in (
    'rental.fleet.view', 'rental.pricing.view', 'rental.pricing.override',
    'rental.rentals.view', 'rental.rentals.financial.view', 'rental.rentals.swap',
    'rental.rentals.checkout', 'rental.rentals.extend', 'rental.rentals.return',
    'parties.clients.view'
  );

  -- COÛTS : les coûts d'acquisition, et le parc. AUCUN remplacement.
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[3], p.id, 'ALLOW' from public.permissions p
  where p.code in (
    'rental.pricing.supplier.view', 'rental.pricing.supplier.create',
    'rental.pricing.supplier.update', 'rental.fleet.view', 'parties.suppliers.view',
    'rental.rentals.view'
  );

  -- LECTURE : les locations et le parc, rien d'autre.
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[4], p.id, 'ALLOW' from public.permissions p
  where p.code in ('rental.rentals.view', 'rental.fleet.view');

  raise notice '[OK] 6. Quatre profils : exploitation sans coût ni dérogation, avenant, coûts, lecture seule.';
end $$;

create or replace function pg_temp.agir_comme(p_cle text)
returns void
language plpgsql
as $$
declare v_id uuid;
begin
  select id into v_id from recette_avn where cle = p_cle;
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


-- --- 7. LE DÉCOR : UN CLIENT, TROIS VÉHICULES FOURNIS, TROIS TARIFS -----------
--
-- UNE CATÉGORIE PROPRE À LA RECETTE, et non la première venue : une catégorie du
-- parc réel porte déjà un tarif standard, et les tarifs de recette sont posés
-- AU VÉHICULE (spécificité 2), donc sans jamais concurrencer une règle existante
-- à portée identique — DEC-002 reste hors d'atteinte.

create temporary table recette_avn_objets (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_cat  uuid;
  v_sup  uuid;
  v_cli  uuid;
  v_a    uuid;
  v_b    uuid;
  v_c    uuid;
  v_jour date := (now() at time zone 'Indian/Comoro')::date;
begin
  insert into public.vehicle_categories (code, label)
  values ('RECETTE-AVN', 'Recette — Catégorie avenants')
  returning id into v_cat;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER',
          'RECETTE AVN — Fournisseur', '+269 960', 'ACTIVE')
  returning id into v_sup;

  insert into public.clients (client_no, type, legal_name, phone, status)
  values (public.next_number('client'), 'COMPANY', 'RECETTE AVN — Client', '+269 961', 'ACTIVE')
  returning id into v_cli;

  -- Trois véhicules FOURNIS : seuls eux acceptent un coût d'acquisition (P-2
  -- n'est pas tranchée, et le LOT 22 ne la tranche pas davantage).
  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id, status, entry_date)
  values
    (public.next_number('vehicle'), v_cat, 'RECETTE', 'AVN-A', 'AVN-0001',
     'SUPPLIED', v_sup, 'AVAILABLE', v_jour - 120),
    (public.next_number('vehicle'), v_cat, 'RECETTE', 'AVN-B', 'AVN-0002',
     'SUPPLIED', v_sup, 'AVAILABLE', v_jour - 120),
    (public.next_number('vehicle'), v_cat, 'RECETTE', 'AVN-C', 'AVN-0003',
     'SUPPLIED', v_sup, 'AVAILABLE', v_jour - 120);

  select id into v_a from public.vehicles where plate = 'AVN-0001';
  select id into v_b from public.vehicles where plate = 'AVN-0002';
  select id into v_c from public.vehicles where plate = 'AVN-0003';

  insert into public.vehicle_supplier_history (vehicle_id, supplier_id, started_on)
  values (v_a, v_sup, v_jour - 120), (v_b, v_sup, v_jour - 120), (v_c, v_sup, v_jour - 120);

  -- TARIFS CLIENTS, au véhicule : A 50 000, B 60 000, C 55 000.
  insert into public.pricing_rules (vehicle_id, amount, unit, valid_from, is_active)
  values (v_a, 50000, 'DAY', v_jour - 120, true),
         (v_b, 60000, 'DAY', v_jour - 120, true),
         (v_c, 55000, 'DAY', v_jour - 120, true);

  -- COÛTS D'ACQUISITION : A 40 000, B 45 000 — le cas de la consigne §11.
  perform pg_temp.agir_comme('couts');
  perform public.set_supplier_vehicle_rate(v_a, v_sup, 40000, 'DAY', v_jour - 120, null, 'Décor de recette');
  perform public.set_supplier_vehicle_rate(v_b, v_sup, 45000, 'DAY', v_jour - 120, null, 'Décor de recette');
  perform pg_temp.redevenir_service();

  insert into recette_avn_objets values
    ('categorie', v_cat), ('fournisseur', v_sup), ('client', v_cli),
    ('vehicule_a', v_a), ('vehicule_b', v_b), ('vehicule_c', v_c);

  raise notice
    '[OK] 7. Décor : 3 véhicules fournis, tarifs 50 000 / 60 000 / 55 000, coûts 40 000 / 45 000.';
end $$;


-- --- 8. 🟩 LE CAS DE LA DIRECTION, DE BOUT EN BOUT ----------------------------
--
-- A-4 : « On garde le même contrat et on rajoute des avenants. »
--
--   Contrat  J-10 → J-1    véhicule A, 50 000 KMF/jour
--   Panne à  J-6           véhicule B prend le relais, 60 000 KMF/jour
--
-- Attendu : MÊME CONTRAT, MÊME IDENTIFIANT, un avenant, DEUX segments contigus,
-- et l'ancien véhicule toujours là.

create temporary table recette_avn_loc (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_a       uuid := (select id from recette_avn_objets where cle = 'vehicule_a');
  v_b       uuid := (select id from recette_avn_objets where cle = 'vehicule_b');
  v_cli     uuid := (select id from recette_avn_objets where cle = 'client');
  v_res     uuid;
  v_loc     uuid;
  v_no      text;
  v_ancien  text;
  v_debut   timestamptz := date_trunc('hour', now()) - interval '10 days';
  v_fin     timestamptz := date_trunc('hour', now()) - interval '1 day';
  v_bascule timestamptz := date_trunc('hour', now()) - interval '6 days';
  v_amend   uuid;
  v_seg     record;
  v_seg1    public.rental_segments%rowtype;
begin
  perform pg_temp.agir_comme('exploitation');

  insert into public.reservations (reservation_no, client_id, vehicle_id, period, created_by)
  values (public.next_number('reservation'), v_cli, v_a, tstzrange(v_debut, v_fin, '[)'),
          (select id from recette_avn where cle = 'exploitation'))
  returning id into v_res;

  perform public.confirm_reservation(v_res, v_a);
  v_loc := public.convert_reservation_to_rental(v_res);

  select rental_no into v_ancien from public.rentals where id = v_loc;
  insert into recette_avn_loc values ('principale', v_loc);

  -- LE SEGMENT INITIAL EXISTE, et porte le tarif du contrat.
  select * into v_seg1 from public.rental_segments where rental_id = v_loc;
  if v_seg1.sequence_no <> 1 or v_seg1.status <> 'ACTIVE' or v_seg1.vehicle_id <> v_a then
    raise exception 'Le segment initial du contrat est absent ou mal formé.';
  end if;

  if v_seg1.locked_amount <> 50000 then
    raise exception 'Le segment initial devrait porter 50 000, il porte %.', v_seg1.locked_amount;
  end if;

  /*
   * SON COÛT EST GELÉ DÈS L'ENGAGEMENT — et l'exploitant qui a créé ce contrat
   * n'a AUCUNE capacité de coût fournisseur. Le gel n'est pas un acte qu'il
   * demande : c'est une conséquence, écrite par la base, qu'il ne lit pas.
   */
  if not exists (
    select 1 from public.rental_segment_costs where segment_id = v_seg1.id and amount = 40000
  ) then
    raise exception 'Le coût du segment initial n''a pas été gelé à 40 000.';
  end if;

  -- Le contrat est confirmé, puis il part ; puis la panne et le remplacement.
  update public.rentals
     set status = 'CONFIRMED', status_changed_at = now(),
         status_changed_by = public.current_actor(), updated_by = public.current_actor()
   where id = v_loc;

  perform public.start_rental(v_loc, v_debut, 10000, 'FULL');

  v_amend := public.replace_rental_vehicle(
    v_loc, v_b, v_bascule, 'Panne immobilisante du véhicule A'
  );

  perform pg_temp.redevenir_service();

  -- a. LE CONTRAT N'A PAS CHANGÉ D'IDENTITÉ — consigne §21, cas 8.
  select rental_no into v_no from public.rentals where id = v_loc;
  if v_no is distinct from v_ancien then
    raise exception 'L''identifiant du contrat a changé : %  →  %', v_ancien, v_no;
  end if;

  if (select count(*) from public.rentals where reservation_id =
        (select reservation_id from public.rentals where id = v_loc)) <> 1 then
    raise exception 'Un second contrat a été créé : A-4 est violée.';
  end if;

  -- b. UN AVENANT, numéroté, motivé, daté.
  select * into v_seg from public.rental_amendments where id = v_amend;
  if v_seg.kind <> 'VEHICLE_CHANGE' or v_seg.sequence_no <> 1 then
    raise exception 'L''avenant n''est pas un changement de véhicule n° 1.';
  end if;

  if v_seg.amendment_no not like 'AVN-%' then
    raise exception 'L''avenant ne porte pas de référence AVN : %', v_seg.amendment_no;
  end if;

  if v_seg.reason is null or v_seg.effective_at <> v_bascule then
    raise exception 'L''avenant ne porte pas son motif ou sa date de bascule.';
  end if;

  if v_seg.rate_override then
    raise exception
      'Un remplacement au tarif du barème a été enregistré comme une dérogation.';
  end if;

  -- c. DEUX SEGMENTS, CONTIGUS, DANS L'ORDRE.
  if (select count(*) from public.rental_segments where rental_id = v_loc) <> 2 then
    raise exception 'Le contrat ne porte pas exactement deux segments.';
  end if;

  select s1.status as st1, s2.status as st2,
         upper(s1.period) as fin1, lower(s2.period) as debut2,
         s1.vehicle_id as v1, s2.vehicle_id as v2,
         s1.locked_amount as m1, s2.locked_amount as m2,
         s2.amendment_id as amend2
    into v_seg
  from public.rental_segments s1
  join public.rental_segments s2 on s2.rental_id = s1.rental_id and s2.sequence_no = 2
  where s1.rental_id = v_loc and s1.sequence_no = 1;

  if v_seg.st1 <> 'ENDED' or v_seg.st2 <> 'ACTIVE' then
    raise exception 'Les statuts des segments sont faux : % puis %.', v_seg.st1, v_seg.st2;
  end if;

  if v_seg.fin1 is distinct from v_seg.debut2 then
    raise exception
      'Les deux segments ne sont pas contigus : le contrat aurait une période sans véhicule.';
  end if;

  if v_seg.fin1 is distinct from v_bascule then
    raise exception 'La bascule n''est pas à la date demandée.';
  end if;

  if v_seg.v1 <> v_a or v_seg.v2 <> v_b then
    raise exception 'Les véhicules des deux segments ne sont pas A puis B.';
  end if;

  if v_seg.amend2 is distinct from v_amend then
    raise exception 'Le second segment ne nomme pas l''avenant qui l''a ouvert.';
  end if;

  -- d. LE VÉHICULE COURANT DU CONTRAT EST B — c'est lui qui est dehors.
  if (select vehicle_id from public.rentals where id = v_loc) <> v_b then
    raise exception 'Le contrat ne porte pas son véhicule courant.';
  end if;

  -- e. L'ANCIEN VÉHICULE N'EST PAS EFFACÉ — consigne §21, cas 9.
  if not exists (
    select 1 from public.rental_segments where rental_id = v_loc and vehicle_id = v_a
  ) then
    raise exception 'L''ancien véhicule a disparu de l''historique du contrat.';
  end if;

  -- f. LE CALENDRIER : A libéré à la bascule, B engagé à partir d'elle.
  if not exists (
    select 1 from public.vehicle_occupations
    where source = 'RENTAL' and source_id = v_loc and vehicle_id = v_a
      and not is_active and upper(period) = v_bascule
  ) then
    raise exception 'L''occupation du véhicule A n''a pas été ramenée à la bascule puis libérée.';
  end if;

  if not exists (
    select 1 from public.vehicle_occupations
    where source = 'RENTAL' and source_id = v_loc and vehicle_id = v_b
      and is_active and lower(period) = v_bascule
      and rental_segment_id = (
        select id from public.rental_segments where rental_id = v_loc and sequence_no = 2
      )
  ) then
    raise exception 'L''occupation du véhicule B n''a pas été posée sur son segment.';
  end if;

  -- g. LES STATUTS DES DEUX VÉHICULES.
  if (select status from public.vehicles where id = v_a) <> 'AVAILABLE' then
    raise exception 'Le véhicule remplacé n''est pas revenu au parc.';
  end if;

  if (select status from public.vehicles where id = v_b) <> 'RENTED' then
    raise exception 'Le véhicule de remplacement n''est pas « en location ».';
  end if;

  raise notice
    '[OK] 8. 🟩 Le cas de la Direction : MÊME contrat %, un avenant, deux segments contigus A → B.',
    v_ancien;
end $$;


-- --- 9. CAS 2 — LE TARIF DU NOUVEAU VÉHICULE S'APPLIQUE, L'ANCIEN EST GARDÉ ---
--
-- A-5, cas ordinaire : « généralement le client paie le nouveau tarif ».

do $$
declare
  v_loc uuid := (select id from recette_avn_loc where cle = 'principale');
  v_r   record;
begin
  select s1.locked_amount as m1, s1.locked_source as src1,
         s2.locked_amount as m2, s2.locked_source as src2
    into v_r
  from public.rental_segments s1
  join public.rental_segments s2 on s2.rental_id = s1.rental_id and s2.sequence_no = 2
  where s1.rental_id = v_loc and s1.sequence_no = 1;

  if v_r.m1 <> 50000 then
    raise exception 'L''ancien tarif n''a pas été conservé : % au lieu de 50 000.', v_r.m1;
  end if;

  if v_r.m2 <> 60000 then
    raise exception 'Le nouveau tarif n''a pas été appliqué : % au lieu de 60 000.', v_r.m2;
  end if;

  -- Le tarif du second segment vient du BARÈME, résolu par DEC-002 — pas d'une
  -- dérogation.
  if v_r.src2 = 'OVERRIDE' then
    raise exception 'Le tarif du nouveau véhicule a été forcé alors qu''un barème existe.';
  end if;

  -- LE TARIF DU CONTRAT, LUI, N'A PAS ÉTÉ RÉÉCRIT : `rentals.locked_amount` est
  -- la trace de l'engagement initial. Ce sont les SEGMENTS qui portent la suite.
  if (select locked_amount from public.rentals where id = v_loc) <> 50000 then
    raise exception 'Le tarif verrouillé du contrat a été réécrit : la trace initiale est perdue.';
  end if;

  raise notice
    '[OK] 9. Ancien tarif conservé (50 000), nouveau appliqué au bon segment (60 000), source du barème.';
end $$;


-- --- 10. CAS 4 — LE COÛT EST GELÉ PAR SEGMENT, ET LES COMMISSIONS SUIVENT -----
do $$
declare
  v_loc uuid := (select id from recette_avn_loc where cle = 'principale');
  v_r   record;
begin
  select c1.amount as c1, c2.amount as c2,
         s1.locked_amount - c1.amount as com1,
         s2.locked_amount - c2.amount as com2,
         c1.unit as u1, c2.unit as u2,
         c1.resolved_on as d1, c2.resolved_on as d2
    into v_r
  from public.rental_segments s1
  join public.rental_segment_costs c1 on c1.segment_id = s1.id
  join public.rental_segments s2 on s2.rental_id = s1.rental_id and s2.sequence_no = 2
  join public.rental_segment_costs c2 on c2.segment_id = s2.id
  where s1.rental_id = v_loc and s1.sequence_no = 1;

  if v_r.c1 <> 40000 or v_r.c2 <> 45000 then
    raise exception 'Les coûts gelés ne sont pas 40 000 et 45 000, mais % et %.', v_r.c1, v_r.c2;
  end if;

  -- LES COMMISSIONS DE LA CONSIGNE §11 : 10 000 puis 15 000.
  if v_r.com1 <> 10000 or v_r.com2 <> 15000 then
    raise exception
      'Les commissions par segment ne sont pas 10 000 et 15 000, mais % et %.', v_r.com1, v_r.com2;
  end if;

  if v_r.u1 <> v_r.u2 then
    raise exception 'Deux unités différentes ne se comparent pas.';
  end if;

  -- LA DATE DE RÉSOLUTION EST CELLE DU SEGMENT, pas celle du jour.
  if v_r.d2 <> (date_trunc('hour', now()) - interval '6 days')::date then
    raise exception
      'Le coût du second segment a été résolu à une autre date que le début du segment : %.', v_r.d2;
  end if;

  -- AUCUNE COMMISSION N'EST STOCKÉE — doctrine D1.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('rental_segments', 'rental_segment_costs', 'rental_amendments')
      and (column_name like '%commission%' or column_name like '%margin%'
           or column_name like '%marge%')
  ) then
    raise exception 'Une commission est stockée : elle doit être une différence (D1).';
  end if;

  raise notice
    '[OK] 10. Coûts gelés 40 000 / 45 000 ; commissions 10 000 / 15 000, calculées et stockées nulle part.';
end $$;


-- --- 11. CAS 11 — UNE SAISIE RÉTROACTIVE NE DÉPLACE PLUS LE COÛT GELÉ ---------
--
-- L'ÉCART QUE LE LOT 21 AVAIT NOMMÉ (Rapport 13 §12.3), fermé ici.

do $$
declare
  v_loc  uuid := (select id from recette_avn_loc where cle = 'principale');
  v_b    uuid := (select id from recette_avn_objets where cle = 'vehicule_b');
  v_sup  uuid := (select id from recette_avn_objets where cle = 'fournisseur');
  v_seg  uuid;
  v_gele bigint;
  v_now  bigint;
  v_date date := ((date_trunc('hour', now()) - interval '7 days') at time zone 'Indian/Comoro')::date;
begin
  select id into v_seg from public.rental_segments where rental_id = v_loc and sequence_no = 2;
  select amount into v_gele from public.rental_segment_costs where segment_id = v_seg;

  -- Une version RÉTROACTIVE, délibérée, permissionnée et journalisée.
  perform pg_temp.agir_comme('couts');
  perform public.set_supplier_vehicle_rate(
    v_b, v_sup, 99000, 'DAY', v_date, null, 'Correction rétroactive de recette'
  );
  perform pg_temp.redevenir_service();

  -- LE RÉSOLVEUR voit le nouveau montant…
  select amount into v_now
  from public.resolve_supplier_rate(v_b, ((date_trunc('hour', now()) - interval '6 days'))::date);

  if v_now <> 99000 then
    raise exception 'La version rétroactive n''a pas pris effet pour le résolveur : %.', v_now;
  end if;

  -- … ET LE COÛT GELÉ NE BOUGE PAS.
  if (select amount from public.rental_segment_costs where segment_id = v_seg) <> v_gele then
    raise exception
      'Le coût gelé du segment a été déplacé par une saisie rétroactive : l''historique financier n''est pas protégé.';
  end if;

  -- Et il ne se laisse pas modifier, même directement.
  begin
    update public.rental_segment_costs set amount = 1 where segment_id = v_seg;
    raise exception 'Le coût gelé a pu être modifié.';
  exception when check_violation then null;
  end;

  raise notice
    '[OK] 11. Une saisie rétroactive déplace le résolveur (45 000 → 99 000) et LAISSE le coût gelé à %.',
    v_gele;
end $$;


-- --- 12. CAS 3 — L'EXCEPTION TARIFAIRE : EXPLICITE, MOTIVÉE, AUDITÉE ----------
--
-- A-5 : « toutefois des situations peuvent se présenter autrement et on les gère
-- selon le contexte ». ADIKOM absorbe la différence : le client garde 50 000
-- alors que le véhicule de remplacement vaut 55 000.

do $$
declare
  v_cli     uuid := (select id from recette_avn_objets where cle = 'client');
  v_a       uuid := (select id from recette_avn_objets where cle = 'vehicule_a');
  v_c       uuid := (select id from recette_avn_objets where cle = 'vehicule_c');
  v_res     uuid;
  v_loc     uuid;
  v_debut   timestamptz := date_trunc('hour', now()) + interval '20 days';
  v_fin     timestamptz := date_trunc('hour', now()) + interval '30 days';
  v_bascule timestamptz := date_trunc('hour', now()) + interval '25 days';
  v_amend   uuid;
  v_seg     record;
begin
  perform pg_temp.agir_comme('exploitation');

  insert into public.reservations (reservation_no, client_id, vehicle_id, period, created_by)
  values (public.next_number('reservation'), v_cli, v_a, tstzrange(v_debut, v_fin, '[)'),
          (select id from recette_avn where cle = 'exploitation'))
  returning id into v_res;

  perform public.confirm_reservation(v_res, v_a);
  v_loc := public.convert_reservation_to_rental(v_res);
  insert into recette_avn_loc values ('exception', v_loc);

  -- a. L'EXPLOITATION NE PEUT PAS DÉROGER : `swap` n'ouvre pas `override`.
  begin
    perform public.replace_rental_vehicle(
      v_loc, v_c, v_bascule, 'Indisponibilité', 50000, 'DAY', 'ADIKOM absorbe l''écart'
    );
    raise exception 'Un porteur de `swap` seul a pu forcer un tarif.';
  exception when insufficient_privilege then null;
  end;

  -- b. UNE DÉROGATION SANS RAISON EST REFUSÉE — jamais silencieuse.
  perform pg_temp.agir_comme('avenant');
  begin
    perform public.replace_rental_vehicle(v_loc, v_c, v_bascule, 'Indisponibilité', 50000, 'DAY', null);
    raise exception 'Une dérogation tarifaire sans raison écrite a été acceptée.';
  exception when check_violation then null;
  end;

  -- c. LA DÉROGATION, ACCORDÉE : le client garde 50 000 sur un véhicule à 55 000.
  v_amend := public.replace_rental_vehicle(
    v_loc, v_c, v_bascule,
    'Véhicule A immobilisé, remplacement de courtoisie',
    50000, 'DAY',
    'ADIKOM absorbe l''écart de 5 000 KMF/jour : le retard est de son fait'
  );
  perform pg_temp.redevenir_service();

  select a.rate_override, a.rate_override_reason, s.locked_amount, s.locked_source,
         s.locked_rule_id
    into v_seg
  from public.rental_amendments a
  join public.rental_segments s on s.amendment_id = a.id
  where a.id = v_amend;

  if not v_seg.rate_override then
    raise exception 'La dérogation n''a pas été marquée comme telle.';
  end if;

  if v_seg.rate_override_reason is null then
    raise exception 'La raison de la dérogation n''a pas été conservée.';
  end if;

  if v_seg.locked_amount <> 50000 then
    raise exception 'Le prix client n''est pas celui qui a été décidé : %.', v_seg.locked_amount;
  end if;

  if v_seg.locked_source <> 'OVERRIDE' then
    raise exception
      'Le segment ne dit pas que son tarif a été forcé : il se lirait comme un tarif de barème.';
  end if;

  if v_seg.locked_rule_id is not null then
    raise exception 'Un tarif forcé ne se rattache à aucune règle du barème.';
  end if;

  -- d. LE JOURNAL PORTE LA DÉROGATION SOUS `PRICE_CHANGE` — Plan 02 §12.
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'rental_amendments' and entity_id = v_amend::text
      and action = 'PRICE_CHANGE'
  ) then
    raise exception 'Une dérogation tarifaire n''a pas été journalisée sous PRICE_CHANGE.';
  end if;

  -- Et l'avenant lui-même est journalisé comme une création.
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'rental_amendments' and entity_id = v_amend::text
      and action = 'CREATE'
  ) then
    raise exception 'L''avenant n''a pas été journalisé.';
  end if;

  -- e. UN REMPLACEMENT SANS DÉROGATION N'ÉCRIT PAS DE `PRICE_CHANGE`.
  if exists (
    select 1 from public.audit_log
    where entity_type = 'rental_amendments' and action = 'PRICE_CHANGE'
      and entity_id = (
        select id::text from public.rental_amendments
        where rental_id = (select id from recette_avn_loc where cle = 'principale')
      )
  ) then
    raise exception
      'Un remplacement au tarif du barème a été journalisé comme un changement de prix.';
  end if;

  raise notice
    '[OK] 12. 🟩 A-5 : `swap` seul refuse la dérogation ; sans raison elle est refusée ; accordée, elle est tracée et journalisée PRICE_CHANGE.';
end $$;


-- --- 13. CAS 6 ET 7 — CHEVAUCHEMENT, TROU, VÉHICULE INDISPONIBLE --------------
do $$
declare
  v_loc uuid := (select id from recette_avn_loc where cle = 'principale');
  v_a   uuid := (select id from recette_avn_objets where cle = 'vehicule_a');
  v_b   uuid := (select id from recette_avn_objets where cle = 'vehicule_b');
  v_c   uuid := (select id from recette_avn_objets where cle = 'vehicule_c');
  v_seg public.rental_segments%rowtype;
  v_ok  int := 0;
begin
  select * into v_seg from public.rental_segments where rental_id = v_loc and sequence_no = 2;

  perform pg_temp.agir_comme('exploitation');

  -- a. DEUX SEGMENTS QUI SE RECOUVRENT : refusés PAR LA BASE.
  begin
    insert into public.rental_segments
      (rental_id, vehicle_id, sequence_no, period, status,
       locked_amount, locked_unit, locked_source)
    values (v_loc, v_c, 3,
            tstzrange(lower(v_seg.period) - interval '1 day', upper(v_seg.period), '[)'),
            'ENDED', 55000, 'DAY', 'VEHICLE');
    raise exception 'Deux segments recouvrants ont été acceptés.';
  exception
    when exclusion_violation then v_ok := v_ok + 1;
    when check_violation     then v_ok := v_ok + 1;  -- la contiguïté a tranché d'abord
  end;

  -- b. UN TROU DANS LA COUVERTURE : refusé. Un contrat ne reste jamais sans
  --    véhicule affecté (consigne §7).
  begin
    insert into public.rental_segments
      (rental_id, vehicle_id, sequence_no, period, status,
       locked_amount, locked_unit, locked_source)
    values (v_loc, v_c, 3,
            tstzrange(upper(v_seg.period) + interval '1 day',
                      upper(v_seg.period) + interval '2 days', '[)'),
            'ACTIVE', 55000, 'DAY', 'VEHICLE');
    raise exception 'Un trou dans la couverture du contrat a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- c. UN RANG QUI SAUTE : refusé.
  begin
    insert into public.rental_segments
      (rental_id, vehicle_id, sequence_no, period, status,
       locked_amount, locked_unit, locked_source)
    values (v_loc, v_c, 9, tstzrange(upper(v_seg.period), upper(v_seg.period) + interval '1 day', '[)'),
            'ENDED', 55000, 'DAY', 'VEHICLE');
    raise exception 'Un segment au rang incohérent a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- d. LE MÊME VÉHICULE : refusé.
  begin
    perform public.replace_rental_vehicle(
      v_loc, v_b, lower(v_seg.period) + interval '1 hour', 'Motif'
    );
    raise exception 'Le remplacement par le même véhicule a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  perform pg_temp.redevenir_service();

  if v_ok <> 4 then
    raise exception 'Seuls % refus sur 4 ont été obtenus.', v_ok;
  end if;

  raise notice
    '[OK] 13. Recouvrement, trou, rang incohérent et véhicule identique : quatre refus distincts.';
end $$;


-- --- 14. CAS 7 — UN VÉHICULE DÉJÀ OCCUPÉ NE S'AFFECTE PAS --------------------
do $$
declare
  v_loc uuid := (select id from recette_avn_loc where cle = 'principale');
  v_c   uuid := (select id from recette_avn_objets where cle = 'vehicule_c');
  v_seg public.rental_segments%rowtype;
  v_occ uuid;
begin
  select * into v_seg from public.rental_segments where rental_id = v_loc and sequence_no = 2;

  -- Une immobilisation couvre la fenêtre visée.
  insert into public.vehicle_occupations
    (vehicle_id, source, source_id, period, reason)
  values (v_c, 'IMMOBILIZATION', null,
          tstzrange(lower(v_seg.period), upper(v_seg.period) + interval '1 day', '[)'),
          'Recette — immobilisation bloquante')
  returning id into v_occ;

  perform pg_temp.agir_comme('exploitation');
  begin
    perform public.replace_rental_vehicle(
      v_loc, v_c, lower(v_seg.period) + interval '1 hour', 'Tentative sur véhicule occupé'
    );
    raise exception 'Un véhicule déjà occupé a été affecté à la location.';
  exception when exclusion_violation then null;
  end;
  perform pg_temp.redevenir_service();

  -- Le contrat n'a pas bougé : un refus ne laisse aucune trace partielle.
  if (select count(*) from public.rental_segments where rental_id = v_loc) <> 2 then
    raise exception 'Un refus a laissé un segment derrière lui.';
  end if;

  if (select count(*) from public.rental_amendments where rental_id = v_loc) <> 1 then
    raise exception 'Un refus a laissé un avenant derrière lui.';
  end if;

  update public.vehicle_occupations
     set is_active = false, released_at = now()
   where id = v_occ;

  raise notice
    '[OK] 14. Un véhicule déjà occupé est refusé, et le refus ne laisse ni segment ni avenant.';
end $$;


-- --- 15. 🟥 LA PROLONGATION N'ALLONGE QUE LE SEGMENT OUVERT -------------------
--
-- L'OBSTACLE DU PLAN 02 §1.3. Sans le filtre par segment, prolonger allongerait
-- aussi l'engagement du véhicule RENDU : il bloquerait un créneau pour rien, et
-- refuserait une autre location. Rien n'échouerait — c'est ce qui rend le défaut
-- dangereux.

do $$
declare
  v_loc     uuid := (select id from recette_avn_loc where cle = 'principale');
  v_a       uuid := (select id from recette_avn_objets where cle = 'vehicule_a');
  v_b       uuid := (select id from recette_avn_objets where cle = 'vehicule_b');
  v_fin_a   timestamptz;
  v_apres_a timestamptz;
  v_fin_b   timestamptz;
  v_seg_a   timestamptz;
  v_nouveau timestamptz;
  v_avenants int;
begin
  select upper(period) into v_fin_a
  from public.vehicle_occupations
  where source = 'RENTAL' and source_id = v_loc and vehicle_id = v_a;

  select upper(period) into v_seg_a
  from public.rental_segments where rental_id = v_loc and sequence_no = 1;

  v_nouveau := (select expected_return_at from public.rentals where id = v_loc)
               + interval '3 days';

  select count(*) into v_avenants from public.rental_amendments where rental_id = v_loc;

  perform pg_temp.agir_comme('exploitation');
  perform public.extend_rental(v_loc, v_nouveau, 'Prolongation de recette');
  perform pg_temp.redevenir_service();

  /*
   * CE CONTROLE A EVOLUE AU LOT 23, ET VOICI POURQUOI.
   *
   * Au LOT 22, `extend_rental` deplacait une date sans rien consigner. Le
   * LOT 23 applique A-4 jusqu'au bout -- « on garde le meme contrat et on
   * rajoute des avenants » -- et la prolongation devient un ACTE CONTRACTUEL :
   * un `AVN-...` numerote, motive, date, attribue.
   *
   * Ce que le controle eprouvait reste eprouve A L'IDENTIQUE ci-dessous : seul
   * le segment OUVERT s'allonge, et le vehicule rendu garde sa date. Ce qui
   * s'ajoute est la consequence de A-4, et non un assouplissement.
   */
  if (select count(*) from public.rental_amendments where rental_id = v_loc)
     <> v_avenants + 1 then
    raise exception
      'A-4 : la prolongation n''a consigne aucun avenant. Le contrat aurait change sans trace.';
  end if;

  if not exists (
    select 1 from public.rental_amendments
    where rental_id = v_loc and kind = 'EXTENSION' and reason = 'Prolongation de recette'
  ) then
    raise exception 'L''avenant de prolongation n''est pas de nature EXTENSION, ou a perdu son motif.';
  end if;

  -- a. L'OCCUPATION DU VÉHICULE RENDU N'A PAS BOUGÉ.
  select upper(period) into v_apres_a
  from public.vehicle_occupations
  where source = 'RENTAL' and source_id = v_loc and vehicle_id = v_a;

  if v_apres_a is distinct from v_fin_a then
    raise exception
      '🟥 La prolongation a allongé l''engagement du véhicule RENDU : %  →  %. Il bloquerait un créneau pour rien.',
      v_fin_a, v_apres_a;
  end if;

  -- b. LE SEGMENT DU VÉHICULE RENDU NON PLUS.
  if (select upper(period) from public.rental_segments
      where rental_id = v_loc and sequence_no = 1) is distinct from v_seg_a then
    raise exception 'La prolongation a déplacé la fin du segment déjà clos.';
  end if;

  -- c. LE SEGMENT OUVERT ET SON OCCUPATION, EUX, SUIVENT.
  select upper(period) into v_fin_b
  from public.vehicle_occupations
  where source = 'RENTAL' and source_id = v_loc and vehicle_id = v_b and is_active;

  if v_fin_b is distinct from v_nouveau then
    raise exception 'L''occupation du véhicule courant n''a pas été prolongée.';
  end if;

  if (select upper(period) from public.rental_segments
      where rental_id = v_loc and status = 'ACTIVE') is distinct from v_nouveau then
    raise exception 'Le segment ouvert n''a pas été prolongé.';
  end if;

  -- d. Et le contrat reste cohérent : segments contigus, un seul ouvert.
  if (select count(*) from public.rental_segments
      where rental_id = v_loc and status = 'ACTIVE') <> 1 then
    raise exception 'Le contrat porte plus d''un segment ouvert.';
  end if;

  raise notice
    '[OK] 15. 🟥 La prolongation n''allonge QUE le segment ouvert, et consigne son avenant (A-4, LOT 23).';
end $$;


-- --- 16. LE RETOUR CLÔT LE SEGMENT OUVERT, ET LUI SEUL -----------------------
do $$
declare
  v_loc    uuid := (select id from recette_avn_loc where cle = 'principale');
  v_retour timestamptz := date_trunc('hour', now()) - interval '2 hours';
  v_a      uuid := (select id from recette_avn_objets where cle = 'vehicule_a');
begin
  perform pg_temp.agir_comme('exploitation');
  perform public.return_rental(v_loc, v_retour, 10800, 'HALF');
  perform pg_temp.redevenir_service();

  if (select count(*) from public.rental_segments
      where rental_id = v_loc and status = 'ACTIVE') <> 0 then
    raise exception 'Un segment reste ouvert après le retour.';
  end if;

  if (select upper(period) from public.rental_segments
      where rental_id = v_loc and sequence_no = 2) is distinct from v_retour then
    raise exception 'Le segment ouvert n''a pas été ramené à la date réelle du retour.';
  end if;

  if (select status from public.rental_segments
      where rental_id = v_loc and sequence_no = 1) <> 'ENDED' then
    raise exception 'Le retour a modifié l''état d''un segment déjà clos.';
  end if;

  -- Une location rendue ne reçoit plus d'avenant de remplacement.
  perform pg_temp.agir_comme('exploitation');
  begin
    perform public.replace_rental_vehicle(
      v_loc, v_a, v_retour - interval '1 hour', 'Tentative après retour'
    );
    raise exception 'Une location rendue a pu changer de véhicule.';
  exception when check_violation then null;
  end;
  perform pg_temp.redevenir_service();

  raise notice
    '[OK] 16. Le retour clôt le segment ouvert à la date réelle, ne touche pas les précédents, et ferme l''avenant.';
end $$;


-- --- 17. CAS 10 — RIEN NE SE SUPPRIME, UN AVENANT NE SE RÉÉCRIT PAS ----------
do $$
declare
  v_loc   uuid := (select id from recette_avn_loc where cle = 'principale');
  v_amend uuid;
  v_seg   uuid;
  v_ok    int := 0;
  v_segments int;
  v_avenants int;
begin
  select id into v_amend from public.rental_amendments where rental_id = v_loc limit 1;
  select id into v_seg   from public.rental_segments  where rental_id = v_loc limit 1;

  select count(*) into v_segments from public.rental_segments  where rental_id = v_loc;
  select count(*) into v_avenants from public.rental_amendments where rental_id = v_loc;

  perform pg_temp.agir_comme('exploitation');

  begin
    delete from public.rental_amendments where id = v_amend;
    raise exception 'Un avenant a pu être supprimé.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  begin
    delete from public.rental_segments where id = v_seg;
    raise exception 'Un segment a pu être supprimé.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  begin
    delete from public.rental_segment_costs where segment_id = v_seg;
    raise exception 'Un coût gelé a pu être supprimé.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- UN AVENANT EST UN ACTE : il ne se modifie pas.
  begin
    update public.rental_amendments set reason = 'Réécrit' where id = v_amend;
    raise exception 'Un avenant a pu être réécrit.';
  exception
    when check_violation      then v_ok := v_ok + 1;
    when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- UN SEGMENT NE RÉÉCRIT NI SON VÉHICULE NI SON TARIF.
  begin
    update public.rental_segments set locked_amount = 1 where id = v_seg;
    raise exception 'Le tarif verrouillé d''un segment a pu être réécrit.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  begin
    update public.rental_segments
       set vehicle_id = (select id from recette_avn_objets where cle = 'vehicule_c')
     where id = v_seg;
    raise exception 'Le véhicule d''un segment a pu être réécrit.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  perform pg_temp.redevenir_service();

  if v_ok <> 6 then
    raise exception 'Seuls % refus sur 6 ont été obtenus.', v_ok;
  end if;

  /*
   * L'HISTOIRE EST INTACTE APRÈS TOUS CES REFUS.
   *
   * DEUX AVENANTS DEPUIS LE LOT 23, ET NON PLUS UN : le remplacement de
   * véhicule (contrôle 8) et la PROLONGATION (contrôle 15), qui consigne
   * désormais le sien (A-4). Le nombre n'est pas la règle -- la règle est que
   * RIEN N'A BOUGÉ --, et il est donc relevé AVANT les tentatives plutôt
   * qu'écrit en dur.
   */
  if (select count(*) from public.rental_segments where rental_id = v_loc) <> v_segments
  or (select count(*) from public.rental_amendments where rental_id = v_loc) <> v_avenants then
    raise exception 'L''historique du contrat a été altéré par une tentative refusée.';
  end if;

  raise notice
    '[OK] 17. Six refus : rien ne se supprime, un avenant ne se réécrit pas, un segment garde son véhicule et son tarif.';
end $$;


-- --- 18. LE VÉHICULE D'UNE LOCATION NE SE CHANGE PAS À LA MAIN ---------------
do $$
declare
  v_loc uuid := (select id from recette_avn_loc where cle = 'exception');
  v_a   uuid := (select id from recette_avn_objets where cle = 'vehicule_a');
begin
  perform pg_temp.agir_comme('exploitation');
  begin
    update public.rentals set vehicle_id = v_a where id = v_loc;
    raise exception 'Le véhicule d''une location a pu être changé par écriture directe.';
  exception when check_violation then null;
  end;
  perform pg_temp.redevenir_service();

  -- LA COHÉRENCE AVANT L'ACTEUR (migration 055) : même la clé de service est
  -- refusée, sinon un script contournerait la règle.
  begin
    update public.rentals set vehicle_id = v_a where id = v_loc;
    raise exception 'La clé de service a pu changer le véhicule sans segment.';
  exception when check_violation then null;
  end;

  raise notice
    '[OK] 18. Le véhicule d''une location ne se change qu''en suivant son segment ouvert — clé de service comprise.';
end $$;


-- --- 19. CAS 12 — `pricing_rules` INTACTE, DEC-002 DÉPARTAGE TOUJOURS --------
--
-- 🟥 LE PLAN 02 §5.7 RESTE ÉCARTÉ (Rapport 13 §5). Une contrainte d'exclusion
-- sur `pricing_rules` ferait échouer DEC-002 — « à égalité de spécificité, le
-- tarif le plus récemment créé s'applique » — et `location.sql` §15 avec elle.

do $$
declare
  v_cli  uuid := (select id from recette_avn_objets where cle = 'client');
  v_a    uuid := (select id from recette_avn_objets where cle = 'vehicule_a');
  v_jour date := (now() at time zone 'Indian/Comoro')::date;
  v_r    record;
begin
  if exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
    where t.relname = 'pricing_rules' and c.contype = 'x'
  ) then
    raise exception
      '🟥 Une contrainte d''exclusion a été posée sur `pricing_rules` : elle contredit DEC-002.';
  end if;

  -- Aucune colonne n'y a été ajoutée par ce lot.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pricing_rules'
      and column_name in ('segment_id', 'rental_id', 'amendment_id')
  ) then
    raise exception '`pricing_rules` a reçu une colonne du LOT 22.';
  end if;

  /*
   * DEC-002 départage encore : deux règles de portée IDENTIQUE coexistent, et la
   * plus récente l'emporte.
   *
   * `created_at` EST RENSEIGNÉ EXPLICITEMENT — comme le fait `location.sql` §15,
   * et pour la même raison : `now()` renvoie l'horodatage de la TRANSACTION,
   * identique pour toutes les lignes insérées ici. Sans cela, le départage
   * tomberait sur `id desc`, donc sur un identifiant aléatoire, et ce contrôle
   * réussirait une fois sur deux. En usage réel, chaque création est sa propre
   * transaction et les horodatages diffèrent.
   */
  insert into public.pricing_rules
    (client_id, vehicle_id, amount, unit, valid_from, is_active, created_at)
  values (v_cli, v_a, 11000, 'DAY', v_jour - 10, true, now());

  insert into public.pricing_rules
    (client_id, vehicle_id, amount, unit, valid_from, is_active, created_at)
  values (v_cli, v_a, 12000, 'DAY', v_jour - 10, true, now() + interval '1 minute');

  select * into v_r from public.resolve_pricing_rule(v_cli, v_a, v_jour);

  if v_r.amount <> 12000 then
    raise exception
      'DEC-002 ne départage plus : le tarif retenu est % au lieu du plus récent (12 000).', v_r.amount;
  end if;

  raise notice
    '[OK] 19. `pricing_rules` intacte ; DEC-002 départage toujours par la date de création (12 000).';
end $$;


-- --- 20. LA REPRISE : CHAQUE LOCATION PORTE AU MOINS UN SEGMENT --------------
--
-- Plan 02 §19.2, garantie n° 3 — vérifiée sur la base RÉELLE, pas sur le décor.

do $$
declare
  v_sans   text[];
  v_multi  int;
  v_ouvert text[];
begin
  select array_agg(l.rental_no) into v_sans
  from public.rentals l
  where not exists (select 1 from public.rental_segments s where s.rental_id = l.id);

  if v_sans is not null then
    raise exception 'Locations sans aucun segment : %', v_sans;
  end if;

  -- Une location VIVANTE porte exactement UN segment ouvert ; une location
  -- rendue, clôturée ou annulée n'en porte aucun.
  select array_agg(l.rental_no) into v_ouvert
  from public.rentals l
  where l.status in ('PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'EXTENDED')
    and (select count(*) from public.rental_segments s
         where s.rental_id = l.id and s.status = 'ACTIVE') <> 1;

  if v_ouvert is not null then
    raise exception 'Locations vivantes sans segment ouvert unique : %', v_ouvert;
  end if;

  -- Toute occupation de location nomme son segment.
  select count(*) into v_multi
  from public.vehicle_occupations
  where source = 'RENTAL' and rental_segment_id is null;

  if v_multi <> 0 then
    raise exception '% occupation(s) de location ne nomment pas leur segment.', v_multi;
  end if;

  -- Et aucune occupation ne désigne le segment d'un autre véhicule.
  if exists (
    select 1 from public.vehicle_occupations o
    join public.rental_segments s on s.id = o.rental_segment_id
    where o.vehicle_id <> s.vehicle_id
  ) then
    raise exception 'Une occupation désigne un segment portant un autre véhicule.';
  end if;

  raise notice
    '[OK] 20. % location(s), toutes segmentées ; chaque occupation de location nomme son segment.',
    (select count(*) from public.rentals);
end $$;


-- --- 21. L'AVENANT DE PROLONGATION EXIGE SA CAPACITE -- A-7 TOUJOURS OUVERTE -
--
-- CE CONTROLE A EVOLUE AU LOT 23, ET VOICI POURQUOI.
--
-- Au LOT 22, l'avenant de prolongation etait REFUSE, et le refus nommait le
-- LOT 23 : le vocabulaire existait, l'acte non. Le LOT 23 le livre (A-4), et le
-- refus est donc leve -- remplace par l'exigence qui lui correspond,
-- `rental.rentals.extend`, comme `swap` pour le vehicule et `override` pour le
-- tarif (A-14).
--
-- CE QUI N'A PAS BOUGE, ET QUI EST REVERIFIE ICI : A-7 n'est toujours pas
-- tranchee. Aucune capacite de penalite n'existe, et aucun bareme n'est applique.

do $$
declare
  v_loc uuid := (select id from recette_avn_loc where cle = 'exception');
begin
  /*
   * SANS `rental.rentals.extend`, L'AVENANT DE PROLONGATION EST REFUSE.
   *
   * Le profil `lecture` consulte les locations et ne peut rien y changer : ni
   * la policy d'insertion, ni la garde ne lui ouvrent l'acte.
   */
  perform pg_temp.agir_comme('lecture');
  begin
    insert into public.rental_amendments
      (amendment_no, rental_id, sequence_no, kind, effective_at, reason)
    values (public.next_number('rental_amendment'), v_loc, 2, 'EXTENSION', now(), 'Tentative');
    raise exception
      'Un avenant de prolongation a ete accepte sans `rental.rentals.extend` : A-14 est violee.';
  exception
    when insufficient_privilege then null;
    when check_violation        then null;
  end;
  perform pg_temp.redevenir_service();

  -- ET AUCUNE CAPACITE DE PENALITE N'EXISTE : A-7 n'est pas tranchee.
  if exists (select 1 from public.permissions where code like '%penalt%') then
    raise exception 'Une capacite de penalite a ete creee alors qu''A-7 n''est pas tranchee.';
  end if;

  -- Ni aucun bareme dans l'acte de prolongation.
  if pg_get_functiondef(
       'public.extend_rental(uuid, timestamptz, text, bigint, public.pricing_unit, text, text)'::regprocedure
     ) ~* '(penalt|pourcent|percent)' then
    raise exception 'Un bareme de penalite s''est glisse dans la prolongation.';
  end if;

  raise notice
    '[OK] 21. L''avenant de prolongation exige `rental.rentals.extend` (LOT 23) ; A-7 reste non tranchee.';
end $$;


-- --- 22. LE CHANGEMENT DE TARIF SEUL — `rental.pricing.override` À L'ŒUVRE ---
--
-- A-7 prépare le modèle sans le barème : un changement de tarif se REPRÉSENTE,
-- se motive, s'historise et s'audite. Aucun pourcentage n'est appliqué.

do $$
declare
  v_loc     uuid := (select id from recette_avn_loc where cle = 'exception');
  v_seg     public.rental_segments%rowtype;
  v_amend   uuid;
  v_r       record;
begin
  select * into v_seg from public.rental_segments
  where rental_id = v_loc and status = 'ACTIVE';

  -- a. L'EXPLOITATION NE PEUT PAS : `swap` n'ouvre pas `override`.
  perform pg_temp.agir_comme('exploitation');
  begin
    perform public.change_rental_rate(
      v_loc, lower(v_seg.period) + interval '1 day', 70000, 'DAY', 'Passage en longue durée'
    );
    raise exception 'Un porteur de `swap` seul a pu changer le tarif du contrat.';
  exception when insufficient_privilege then null;
  end;

  -- b. SANS MOTIF : refusé.
  perform pg_temp.agir_comme('avenant');
  begin
    perform public.change_rental_rate(
      v_loc, lower(v_seg.period) + interval '1 day', 70000, 'DAY', '   '
    );
    raise exception 'Un changement de tarif sans motif a été accepté.';
  exception when check_violation then null;
  end;

  -- c. AVEC MOTIF : un avenant, un segment, le MÊME véhicule.
  v_amend := public.change_rental_rate(
    v_loc, lower(v_seg.period) + interval '1 day', 70000, 'DAY',
    'Le client passe en longue durée : tarif renégocié d''un commun accord'
  );
  perform pg_temp.redevenir_service();

  select a.kind, a.rate_override, s.locked_amount, s.locked_source, s.vehicle_id,
         s.sequence_no, lower(s.period) as debut
    into v_r
  from public.rental_amendments a
  join public.rental_segments s on s.amendment_id = a.id
  where a.id = v_amend;

  if v_r.kind <> 'RATE_CHANGE' or not v_r.rate_override then
    raise exception 'Le changement de tarif n''est pas enregistré comme tel.';
  end if;

  if v_r.locked_amount <> 70000 or v_r.locked_source <> 'OVERRIDE' then
    raise exception 'Le nouveau tarif n''a pas été appliqué au segment.';
  end if;

  if v_r.vehicle_id <> v_seg.vehicle_id then
    raise exception 'Un changement de tarif a déplacé le véhicule.';
  end if;

  -- L'ANCIEN TARIF EST CONSERVÉ sur le segment clos.
  if (select locked_amount from public.rental_segments
      where rental_id = v_loc and sequence_no = v_r.sequence_no - 1) <> v_seg.locked_amount then
    raise exception 'L''ancien tarif n''a pas été conservé.';
  end if;

  -- L'OCCUPATION SUIT LE SEGMENT, même véhicule : une par segment.
  if (select count(*) from public.vehicle_occupations
      where source = 'RENTAL' and source_id = v_loc and is_active) <> 1 then
    raise exception 'Le contrat porte plus d''une occupation active.';
  end if;

  -- Un tarif identique n'est pas un changement.
  perform pg_temp.agir_comme('avenant');
  begin
    perform public.change_rental_rate(
      v_loc, lower(v_seg.period) + interval '2 days', 70000, 'DAY', 'Confirmation'
    );
    raise exception 'Un avenant confirmant le tarif en vigueur a été accepté.';
  exception when check_violation then null;
  end;
  perform pg_temp.redevenir_service();

  raise notice
    '[OK] 22. 🟩 Le changement de tarif seul : refusé sans `override`, refusé sans motif, accepté motivé, véhicule inchangé.';
end $$;


-- --- 23. L'ANNULATION ANNULE LE SEGMENT OUVERT, SANS RÉÉCRIRE LE PASSÉ -------
do $$
declare
  v_cli   uuid := (select id from recette_avn_objets where cle = 'client');
  v_a     uuid := (select id from recette_avn_objets where cle = 'vehicule_a');
  v_res   uuid;
  v_loc   uuid;
  v_debut timestamptz := date_trunc('hour', now()) + interval '60 days';
  v_fin   timestamptz := date_trunc('hour', now()) + interval '65 days';
begin
  perform pg_temp.agir_comme('exploitation');

  insert into public.reservations (reservation_no, client_id, vehicle_id, period, created_by)
  values (public.next_number('reservation'), v_cli, v_a, tstzrange(v_debut, v_fin, '[)'),
          (select id from recette_avn where cle = 'exploitation'))
  returning id into v_res;

  perform public.confirm_reservation(v_res, v_a);
  v_loc := public.convert_reservation_to_rental(v_res);
  perform public.cancel_rental(v_loc, 'Annulation de recette');
  perform pg_temp.redevenir_service();

  if (select status from public.rental_segments where rental_id = v_loc) <> 'CANCELLED' then
    raise exception
      'Le segment d''une location annulée devrait être ANNULÉ : il n''a jamais été exécuté.';
  end if;

  if exists (
    select 1 from public.vehicle_occupations
    where source = 'RENTAL' and source_id = v_loc and is_active
  ) then
    raise exception 'Une location annulée engage encore son véhicule.';
  end if;

  -- L'occupation n'est pas EFFACÉE : la trace de ce qui avait été engagé demeure.
  if not exists (
    select 1 from public.vehicle_occupations
    where source = 'RENTAL' and source_id = v_loc
  ) then
    raise exception 'L''occupation d''une location annulée a été effacée.';
  end if;

  raise notice
    '[OK] 23. Une location annulée voit son segment ANNULÉ, son véhicule libéré et sa trace conservée.';
end $$;


-- --- 24. LE JOURNAL N'OUVRE PAS CE QUE LES TABLES FERMENT — DEC-038 ----------
do $$
begin
  if public.audit_detail_permission('rental_amendments') is distinct from 'rental.rentals.view' then
    raise exception 'Le détail d''un avenant au journal doit se lire avec la location.';
  end if;

  if public.audit_detail_permission('rental_segments') is distinct from 'rental.rentals.view' then
    raise exception 'Le détail d''un segment au journal doit se lire avec la location.';
  end if;

  -- LE POINT QUI COMPTE : le coût gelé garde SA lecture jusque dans le journal.
  if public.audit_detail_permission('rental_segment_costs')
     is distinct from 'rental.pricing.supplier.view' then
    raise exception
      'Le détail d''un coût gelé au journal doit exiger `rental.pricing.supplier.view`.';
  end if;

  -- Les acquis des lots antérieurs n'ont pas bougé.
  if public.audit_detail_permission('supplier_vehicle_rates')
     is distinct from 'rental.pricing.supplier.view'
  or public.audit_detail_permission('service_variant_costs')
     is distinct from 'catalog.services.cost.view'
  or public.audit_detail_permission('maintenance_costs')
     is distinct from 'rental.maintenance.cost.view'
  or public.audit_detail_permission('rentals') is distinct from 'rental.rentals.view' then
    raise exception 'La cartographie du journal d''un lot antérieur a été altérée.';
  end if;

  raise notice
    '[OK] 24. Avenant et segment se lisent avec le contrat ; le coût gelé garde SA lecture.';
end $$;


-- --- 25. LA CONVENTION TEMPORELLE EST SEMI-OUVERTE, PARTOUT ------------------
do $$
declare
  v_loc uuid := (select id from recette_avn_loc where cle = 'principale');
  v_r   record;
begin
  select s1.period as p1, s2.period as p2 into v_r
  from public.rental_segments s1
  join public.rental_segments s2 on s2.rental_id = s1.rental_id and s2.sequence_no = 2
  where s1.rental_id = v_loc and s1.sequence_no = 1;

  -- `[)` : borne basse INCLUSE, borne haute EXCLUE. L'instant de bascule
  -- appartient au SEGMENT SUIVANT, et à lui seul.
  if not lower_inc(v_r.p1) or upper_inc(v_r.p1)
  or not lower_inc(v_r.p2) or upper_inc(v_r.p2) then
    raise exception
      'Les périodes de segment ne sont pas semi-ouvertes : la bascule deviendrait ambiguë.';
  end if;

  if v_r.p1 && v_r.p2 then
    raise exception 'Deux segments contigus se recouvrent : la convention n''est pas tenue.';
  end if;

  -- L'instant de bascule est dans le SECOND, pas dans le premier.
  if v_r.p1 @> upper(v_r.p1) then
    raise exception 'L''instant de bascule appartient aux deux segments.';
  end if;

  if not (v_r.p2 @> lower(v_r.p2)) then
    raise exception 'L''instant de bascule n''appartient à aucun segment.';
  end if;

  raise notice
    '[OK] 25. Convention [début, fin) tenue : l''instant de bascule appartient au segment SUIVANT, et à lui seul.';
end $$;


do $$
begin
  raise notice '';
  raise notice '[OK] Recette Avenants, segments et remplacement de véhicule complète — LOT 22.';
end $$;

rollback;
