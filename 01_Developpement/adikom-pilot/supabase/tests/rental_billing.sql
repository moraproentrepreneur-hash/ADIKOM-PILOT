-- =============================================================================
-- ADIKOM PILOT — Recette Longue durée, prolongations et facturation périodique
-- LOT 23 — DEC-047 · A-4, A-5, A-6, A-7, A-14
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur ne
-- peuvent garantir :
--
--   · UNE capacité nouvelle — `rental.rentals.billing.plan` — et aucune de plus ;
--   · la TABLE des périodes, RLS activée, suppression et TRUNCATE refermés ;
--   · LES DEUX INDEX DISJOINTS, et l'ancien retiré — c'est ce couple qui
--     autorise plusieurs factures par contrat SANS jamais deux sur la même
--     période ;
--   · les ACTES ne sont pas `SECURITY DEFINER` (doctrine D4) ;
--   · 🟩 A-6, LE DÉCOUPAGE MENSUEL À LA FIN DU MOIS COMORIEN — et non UTC ;
--   · 🟩 A-6, LA PÉRIODE CONTRACTUELLE : une seule, entière ;
--   · 🟩 A-4, LA PROLONGATION EST UN AVENANT : même contrat, même numéro,
--     segments antérieurs intacts, périodes antérieures intactes ;
--   · 🟩 A-5, LE TARIF À LA PROLONGATION : conservé par défaut, changé sous
--     `rental.pricing.override` avec raison écrite, et l'ancien reste attaché à
--     sa période ;
--   · 🟥 A-7, AUCUN BARÈME : aucun pourcentage, aucune capacité de pénalité ;
--   · PLUSIEURS FACTURES sur une même location, JAMAIS DEUX sur une période ;
--   · une facture de période NE CLÔT PAS la location ;
--   · une période NON ÉCHUE ne se facture pas ;
--   · une longue durée REFUSE une facture globale ; une durée fixée REFUSE une
--     facture de période ;
--   · le RÉGIME se fige dès la première facture ;
--   · le RETOUR ramène les périodes non facturées à la réalité, et ne touche
--     PAS une période facturée ;
--   · l'ANNULATION du contrat annule ses périodes ;
--   · aucune période ne CHEVAUCHE, aucun TROU, aucun rang incohérent ;
--   · la CONFIDENTIALITÉ du coût fournisseur n'est pas ouverte par les périodes ;
--   · `pricing_rules` INTACTE, et les locations existantes toujours FIXED_TERM.
--
-- Exécution :
--   npm run db:verify:billing
--
-- CE SCRIPT S'EXÉCUTE AVEC LE RÔLE DE LA CHAÎNE DE CONNEXION.
--
-- Ce rôle CONTOURNE RLS : les refus de LECTURE s'éprouvent donc par la forme des
-- policies ici, et par de VRAIES SESSIONS dans `verify:billing-periods`. Les
-- refus portés par des DÉCLENCHEURS et par `require_capability`, eux,
-- s'appliquent à tout le monde et sont éprouvés pour de bon — en endossant
-- l'identité d'un compte, comme PostgREST le fait.
--
-- AUCUNE DATE EN DUR : tout se situe par rapport au JOUR COMORIEN. La
-- transaction est annulée en fin de script — aucun résidu.
-- =============================================================================

begin;


-- --- 1. UNE CAPACITÉ, ET PAS UNE DE PLUS --------------------------------------
do $$
declare v_row public.permissions%rowtype;
begin
  select * into v_row from public.permissions where code = 'rental.rentals.billing.plan';

  if not found then
    raise exception 'La capacité `rental.rentals.billing.plan` est absente du catalogue.';
  end if;

  if v_row.action <> 'ADMIN' or not v_row.is_sensitive then
    raise exception
      'Le régime de facturation doit être une capacité SENSIBLE de nature ADMIN.';
  end if;

  if v_row.module_code <> 'rental' or v_row.menu_code <> 'rentals' then
    raise exception 'Le régime de facturation ne vit pas sous Gestion de location → Locations.';
  end if;

  /*
   * AUCUNE CAPACITÉ INVENTÉE AUTOUR DES PÉRIODES (CLAUDE.md §19 bis).
   *
   *   · pas de `…billing.periods.view` — une période ne porte NI montant, NI
   *     coût, NI tarif : une capacité de plus ne fermerait qu'un onglet ;
   *   · pas de `…penalty.*` — 🟥 A-7 n'est pas tranchée, la fonctionnalité
   *     n'existe pas ;
   *   · pas de `…statement.*` — le relevé global relève du LOT 24.
   */
  if exists (
    select 1 from public.permissions
    where code like 'rental.rentals.penalty%'
       or code like 'rental.rentals.statement%'
       or code like 'rental.rentals.period%'
       or code like 'rental.rentals.billing.periods%'
       or code like '%.globale%'
  ) then
    raise exception 'Une capacité a été créée pour une fonctionnalité que le lot ne livre pas.';
  end if;

  raise notice '[OK] 1. Une capacité, sensible, ADMIN, bien placée — et aucune de plus.';
end $$;


-- --- 2. LA TABLE, SES DROITS, SES POLICIES -------------------------------------
do $$
declare
  v_policies text[];
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'rental_billing_periods'
  ) then
    raise exception 'La table `rental_billing_periods` est absente.';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.rental_billing_periods'::regclass) then
    raise exception 'RLS n''est pas activée sur `rental_billing_periods`.';
  end if;

  -- `anon` n'a RIEN, et `authenticated` ne supprime ni ne tronque.
  if has_table_privilege('anon', 'public.rental_billing_periods', 'SELECT')
     or has_table_privilege('anon', 'public.rental_billing_periods', 'INSERT') then
    raise exception 'Le rôle `anon` atteint les périodes facturables.';
  end if;

  if has_table_privilege('authenticated', 'public.rental_billing_periods', 'DELETE')
     or has_table_privilege('authenticated', 'public.rental_billing_periods', 'TRUNCATE') then
    raise exception
      'Une période facturable peut être supprimée ou tronquée : le découpage de la créance s''effacerait sans trace.';
  end if;

  -- Le déclencheur de refus de suppression est en place, et le journal aussi.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.rental_billing_periods'::regclass
      and tgname = 'rental_billing_periods_no_delete'
  ) then
    raise exception 'Rien n''interdit la suppression d''une période facturable.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.rental_billing_periods'::regclass
      and tgname = 'rental_billing_periods_audit'
  ) then
    raise exception 'Les périodes facturables ne sont pas journalisées.';
  end if;

  /*
   * LA LECTURE S'OUVRE PAR `rental.rentals.view`, ET PAR ELLE SEULE.
   *
   * Et surtout : ELLE N'OUVRE AUCUNE CAPACITÉ FINANCIÈRE. Une période ne porte
   * aucun montant, et sa policy ne doit citer ni les factures, ni le coût
   * fournisseur — sinon le découpage deviendrait une porte dérobée.
   */
  select array_agg(qual) into v_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'rental_billing_periods'
    and policyname = 'rental_billing_periods_select';

  if v_policies is null or array_to_string(v_policies, ' ') not like '%rental.rentals.view%' then
    raise exception 'La lecture des périodes ne s''ouvre pas par `rental.rentals.view`.';
  end if;

  if array_to_string(v_policies, ' ') like '%supplier%'
     or array_to_string(v_policies, ' ') like '%customer_invoices%' then
    raise exception
      'La policy de lecture des périodes cite une capacité financière : elle ouvrirait par la bande ce que d''autres tables ferment.';
  end if;

  -- `has_permission` enveloppée dans un sous-select : une garde de RLS s'évalue
  -- PAR LIGNE (migration 065).
  if array_to_string(v_policies, ' ') not like '%SELECT%' then
    raise exception
      'La policy de lecture n''enveloppe pas `has_permission` dans un sous-select : un aller-retour par ligne.';
  end if;

  raise notice '[OK] 2. Table, RLS, suppression et TRUNCATE refermés, `anon` exclu, lecture gardée.';
end $$;


-- --- 3. LES DEUX INDEX DISJOINTS, ET L'ANCIEN RETIRÉ ---------------------------
--
-- C'EST L'INVARIANT CENTRAL DU LOT. Il autorise plusieurs factures par contrat,
-- et interdit deux factures sur la même période — sans dépendre d'aucun droit de
-- lecture, et en fermant la course entre deux saisies simultanées (DEC-028).
do $$
declare v_def text;
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'customer_invoices_one_per_rental_idx'
  ) then
    raise exception
      'L''ancien index d''unicité par location est encore là : la facturation périodique resterait impossible.';
  end if;

  select indexdef into v_def from pg_indexes
  where schemaname = 'public' and indexname = 'customer_invoices_one_per_fixed_rental_idx';

  if v_def is null then
    raise exception 'L''index d''unicité des locations à durée fixée est absent.';
  end if;
  if v_def not like '%billing_period_id IS NULL%' or v_def not like '%rental_id%' then
    raise exception 'L''index des durées fixées ne se restreint pas aux factures SANS période.';
  end if;
  if v_def not like '%CANCELLED%' then
    raise exception
      'L''index des durées fixées compte les factures annulées : corriger une facture deviendrait impossible.';
  end if;

  select indexdef into v_def from pg_indexes
  where schemaname = 'public' and indexname = 'customer_invoices_one_per_period_idx';

  if v_def is null then
    raise exception 'L''index d''unicité par période est absent : la double facturation serait possible.';
  end if;
  if v_def not like '%billing_period_id IS NOT NULL%' then
    raise exception 'L''index par période n''est pas restreint aux factures QUI en portent une.';
  end if;
  if v_def not like '%CANCELLED%' then
    raise exception 'L''index par période compte les factures annulées.';
  end if;

  -- Une facture de période nomme toujours sa location.
  if not exists (
    select 1 from pg_constraint where conname = 'customer_invoices_period_names_rental'
  ) then
    raise exception
      'Rien n''impose qu''une facture de période nomme sa location : la chaîne Facture → Location → Client se romprait.';
  end if;

  raise notice '[OK] 3. Deux index DISJOINTS, l''ancien retiré, la chaîne préservée.';
end $$;


-- --- 4. LES ACTES, LES GARDES, ET LE JOUR COMORIEN ------------------------------
do $$
declare
  v_name text;
  v_def  text;
begin
  -- Doctrine D4 : aucune fonction MÉTIER en `SECURITY DEFINER`.
  foreach v_name in array array[
    'public.open_rental_billing_periods(uuid, timestamptz, timestamptz, uuid)',
    'public.set_rental_billing_plan(uuid, public.rental_type, public.rental_billing_cadence)',
    'public.cancel_rental_billing_period(uuid)',
    'public.extend_rental(uuid, timestamptz, text, bigint, public.pricing_unit, text, text)',
    'public.create_customer_invoice(uuid, date, date, uuid, text, uuid)',
    'public.issue_customer_invoice(uuid, text)',
    'public.cancel_customer_invoice(uuid, text)'
  ] loop
    if (select prosecdef from pg_proc where oid = v_name::regprocedure) then
      raise exception '« % » est SECURITY DEFINER : elle agirait avec les droits de son auteur.', v_name;
    end if;
  end loop;

  -- Les GARDES, elles, doivent l'être : elles comptent la vérité, non ce que
  -- l'acteur voit (migration 062).
  if not (select prosecdef from pg_proc where oid = 'public.fn_rental_billing_period_guard()'::regprocedure) then
    raise exception
      'La garde des périodes n''est pas SECURITY DEFINER : elle compterait à travers RLS et conclurait « aucun ».';
  end if;

  /*
   * 🟩 A-6 — LE MOIS EST COMORIEN.
   *
   * `date_trunc('month', …)` sur un `timestamptz` travaille en UTC. Un contrat
   * commencé le 30 septembre à 22 h UTC est du 1ᵉʳ octobre à Moroni : sans
   * conversion, la facture de septembre porterait un jour d'octobre.
   */
  select pg_get_functiondef(
    'public.open_rental_billing_periods(uuid, timestamptz, timestamptz, uuid)'::regprocedure
  ) into v_def;

  if v_def not like '%Indian/Comoro%' then
    raise exception 'Le découpage mensuel ignore le fuseau des Comores.';
  end if;

  -- AUCUN BARÈME DE PÉNALITÉ — A-7.
  if v_def ~* '(penalt|pourcent|percent)' then
    raise exception 'Un barème de pénalité s''est glissé dans le découpage : A-7 n''est pas tranchée.';
  end if;

  select pg_get_functiondef(
    'public.extend_rental(uuid, timestamptz, text, bigint, public.pricing_unit, text, text)'::regprocedure
  ) into v_def;

  if v_def ~* '(penalt|pourcent|percent|\* 1\.[0-9]|/ 100)' then
    raise exception 'Un barème de pénalité s''est glissé dans la prolongation : A-7 n''est pas tranchée.';
  end if;

  if v_def not like '%EXTENSION%' or v_def not like '%rental_amendments%' then
    raise exception 'La prolongation ne consigne pas d''avenant : A-4 est violée.';
  end if;

  raise notice '[OK] 4. Actes en INVOKER, garde en DEFINER, jour comorien, aucun barème.';
end $$;


-- --- 5. LE PÉRIMÈTRE DE SAUVEGARDE ---------------------------------------------
do $$
declare
  v_scope  text[] := public.backup_scope();
  v_paire  text;
  v_pos    int;
  v_parent int;
begin
  if not ('rental_billing_periods' = any (v_scope)) then
    raise exception 'Les périodes facturables sont hors du périmètre de sauvegarde.';
  end if;

  foreach v_paire in array array[
    'rental_billing_periods:rentals',
    'rental_billing_periods:rental_amendments',
    'customer_invoices:rental_billing_periods'
  ] loop
    select array_position(v_scope, split_part(v_paire, ':', 1)) into v_pos;
    select array_position(v_scope, split_part(v_paire, ':', 2)) into v_parent;

    if v_pos is null or v_parent is null or v_pos < v_parent then
      raise exception
        'Ordre du périmètre invalide : « % » précède « % », la restauration échouerait.',
        split_part(v_paire, ':', 1), split_part(v_paire, ':', 2);
    end if;
  end loop;

  -- La colonne nouvelle voyage avec la facture.
  if public.backup_columns('customer_invoices') not like '%billing_period_id%' then
    raise exception 'La facture reviendrait détachée de sa période après restauration.';
  end if;

  raise notice '[OK] 5. Périmètre de sauvegarde : % tables, périodes entre avenant et facture.',
    array_length(v_scope, 1);
end $$;


-- --- 6. TROIS PROFILS RÉELS -----------------------------------------------------
--
--   exploitation  conduit le cycle et PROLONGE. Aucun régime, aucune dérogation,
--                 aucune facture.
--   facturation   décide du RÉGIME et facture. Ne conduit pas le cycle.
--   derogation    prolonge ET force un tarif (A-5, cas d'exception).

create temporary table recette_fac (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_ids  uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_cles text[] := array['exploitation', 'facturation', 'derogation'];
  v_i    int;
begin
  for v_i in 1..3 loop
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_ids[v_i], '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated',
            'recette.fac.' || v_cles[v_i] || '@adikom.test', now(), now());
    insert into recette_fac (cle, id) values (v_cles[v_i], v_ids[v_i]);
  end loop;

  insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
  values
    (v_ids[1], 'Recette', 'Fac exploitation', 'recette.fac.exploitation', 'recette.fac.exploitation@adikom.test', 'ACTIVE', false),
    (v_ids[2], 'Recette', 'Fac facturation',  'recette.fac.facturation',  'recette.fac.facturation@adikom.test',  'ACTIVE', false),
    (v_ids[3], 'Recette', 'Fac derogation',   'recette.fac.derogation',   'recette.fac.derogation@adikom.test',   'ACTIVE', false);

  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[1], p.id, 'ALLOW' from public.permissions p
  where p.code in (
    'rental.fleet.view', 'rental.fleet.status.update', 'rental.pricing.view',
    'rental.reservations.view', 'rental.reservations.create', 'rental.reservations.confirm',
    'rental.rentals.view', 'rental.rentals.create', 'rental.rentals.update',
    'rental.rentals.checkout', 'rental.rentals.extend', 'rental.rentals.return',
    'rental.rentals.close', 'rental.rentals.cancel', 'rental.rentals.financial.view',
    'parties.clients.view', 'users.audit.view'
  );

  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[2], p.id, 'ALLOW' from public.permissions p
  where p.code in (
    'rental.rentals.view', 'rental.rentals.financial.view', 'rental.rentals.billing.plan',
    'rental.fleet.view', 'parties.clients.view',
    'billing.customer_invoices.view', 'billing.customer_invoices.create',
    'billing.customer_invoices.update', 'billing.customer_invoices.issue',
    'billing.customer_invoices.cancel',
    -- Annuler une facture suppose de savoir ce qui l'a soldée : la garde
    -- `fn_customer_invoice_no_cancel_when_paid` l'exige nommément, et c'est un
    -- acquis du LOT 8 qu'on ne contourne pas.
    'billing.customer_payments.view'
  );

  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[3], p.id, 'ALLOW' from public.permissions p
  where p.code in (
    'rental.fleet.view', 'rental.pricing.view', 'rental.pricing.override',
    'rental.rentals.view', 'rental.rentals.financial.view', 'rental.rentals.extend',
    'parties.clients.view'
  );

  raise notice '[OK] 6. Trois profils : exploitation, facturation, dérogation.';
end $$;

create or replace function pg_temp.agir_comme(p_cle text)
returns void
language plpgsql
as $$
declare v_id uuid;
begin
  select id into v_id from recette_fac where cle = p_cle;
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


-- --- 7. LE DÉCOR ----------------------------------------------------------------
--
-- Une catégorie PROPRE à la recette, et des tarifs posés AU VÉHICULE
-- (spécificité 2) : DEC-002 reste hors d'atteinte.

create temporary table recette_fac_objets (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_cat uuid;
  v_sup uuid;
  v_cli uuid;
  v_a   uuid;
  v_b   uuid;
  v_c   uuid;
  v_jour date := (now() at time zone 'Indian/Comoro')::date;
begin
  insert into public.vehicle_categories (code, label)
  values ('RECETTE-FAC', 'Recette — Catégorie facturation')
  returning id into v_cat;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER',
          'RECETTE FAC — Fournisseur', '+269 970', 'ACTIVE')
  returning id into v_sup;

  insert into public.clients (client_no, type, legal_name, phone, status)
  values (public.next_number('client'), 'COMPANY', 'RECETTE FAC — Client', '+269 971', 'ACTIVE')
  returning id into v_cli;

  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id, status, entry_date)
  values
    (public.next_number('vehicle'), v_cat, 'RECETTE', 'FAC-A', 'FAC-0001',
     'SUPPLIED', v_sup, 'AVAILABLE', v_jour - 400),
    (public.next_number('vehicle'), v_cat, 'RECETTE', 'FAC-B', 'FAC-0002',
     'SUPPLIED', v_sup, 'AVAILABLE', v_jour - 400),
    (public.next_number('vehicle'), v_cat, 'RECETTE', 'FAC-C', 'FAC-0003',
     'SUPPLIED', v_sup, 'AVAILABLE', v_jour - 400);

  select id into v_a from public.vehicles where plate = 'FAC-0001';
  select id into v_b from public.vehicles where plate = 'FAC-0002';
  select id into v_c from public.vehicles where plate = 'FAC-0003';

  insert into public.vehicle_supplier_history (vehicle_id, supplier_id, started_on)
  values (v_a, v_sup, v_jour - 400), (v_b, v_sup, v_jour - 400), (v_c, v_sup, v_jour - 400);

  insert into public.pricing_rules (vehicle_id, amount, unit, valid_from, is_active)
  values (v_a, 50000, 'DAY', v_jour - 400, true),
         (v_b, 60000, 'DAY', v_jour - 400, true),
         (v_c, 55000, 'DAY', v_jour - 400, true);

  insert into recette_fac_objets values
    ('categorie', v_cat), ('fournisseur', v_sup), ('client', v_cli),
    ('vehicule_a', v_a), ('vehicule_b', v_b), ('vehicule_c', v_c);

  raise notice '[OK] 7. Décor : 3 véhicules fournis, tarifs 50 000 / 60 000 / 55 000.';
end $$;


-- --- 8. 🟩 A-6 — LE DÉCOUPAGE MENSUEL, À LA FIN DU MOIS COMORIEN ---------------
--
-- Contrat J-100 → J-5, régime MENSUEL. Attendu : des périodes contiguës, qui
-- s'achèvent au premier instant du mois comorien suivant — sauf la dernière, qui
-- s'achève avec le contrat.

create temporary table recette_fac_loc (cle text primary key, id uuid not null) on commit drop;

do $$
declare
  v_a     uuid := (select id from recette_fac_objets where cle = 'vehicule_a');
  v_cli   uuid := (select id from recette_fac_objets where cle = 'client');
  v_res   uuid;
  v_loc   uuid;
  v_no    text;
  v_debut timestamptz := date_trunc('hour', now()) - interval '100 days';
  v_fin   timestamptz := date_trunc('hour', now()) - interval '5 days';
  v_n     int;
  v_p     record;
  v_prec  timestamptz;
  v_attendu timestamptz;
begin
  perform pg_temp.agir_comme('exploitation');

  insert into public.reservations (reservation_no, client_id, vehicle_id, period, created_by)
  values (public.next_number('reservation'), v_cli, v_a, tstzrange(v_debut, v_fin, '[)'),
          (select id from recette_fac where cle = 'exploitation'))
  returning id into v_res;

  perform public.confirm_reservation(v_res, v_a);
  v_loc := public.convert_reservation_to_rental(v_res);
  insert into recette_fac_loc values ('mensuelle', v_loc);

  update public.rentals
     set status = 'CONFIRMED', status_changed_at = now(),
         status_changed_by = public.current_actor(), updated_by = public.current_actor()
   where id = v_loc;

  perform public.start_rental(v_loc, v_debut, 10000, 'FULL');
  perform pg_temp.redevenir_service();

  -- a. LE RÉGIME PAR DÉFAUT EST « DURÉE FIXÉE » — Plan 02 §19.4.
  if (select rental_type from public.rentals where id = v_loc) <> 'FIXED_TERM' then
    raise exception 'Une location naît en longue durée : le régime par défaut a changé.';
  end if;

  if (select count(*) from public.rental_billing_periods where rental_id = v_loc) <> 0 then
    raise exception 'Une location à durée fixée porte des périodes facturables.';
  end if;

  -- b. L'EXPLOITATION NE DÉFINIT PAS LE RÉGIME — A-14.
  perform pg_temp.agir_comme('exploitation');
  begin
    perform public.set_rental_billing_plan(v_loc, 'LONG_TERM', 'MONTHLY');
    raise exception 'L''exploitation a défini le régime de facturation sans en avoir la capacité.';
  exception
    when insufficient_privilege then null;
  end;
  perform pg_temp.redevenir_service();

  -- c. LE PROFIL FACTURATION, LUI, LE PEUT.
  perform pg_temp.agir_comme('facturation');
  v_n := public.set_rental_billing_plan(v_loc, 'LONG_TERM', 'MONTHLY');
  perform pg_temp.redevenir_service();

  if v_n < 3 then
    raise exception 'Un contrat de 95 jours devrait produire au moins 3 périodes mensuelles, il en produit %.', v_n;
  end if;

  select rental_no into v_no from public.rentals where id = v_loc;

  -- d. LES BORNES : contiguës, alignées sur le mois COMORIEN, closes avec le contrat.
  v_prec := null;
  for v_p in
    select * from public.rental_billing_periods
    where rental_id = v_loc order by sequence_no
  loop
    if v_prec is null then
      if lower(v_p.period) <> v_debut then
        raise exception 'La première période ne part pas du début du contrat.';
      end if;
    elsif lower(v_p.period) <> v_prec then
      raise exception
        'Trou ou recouvrement entre deux périodes facturables du contrat %.', v_no;
    end if;

    if v_p.origin <> 'MONTHLY' then
      raise exception 'Une période mensuelle ne porte pas son origine.';
    end if;

    if upper(v_p.period) < v_fin then
      v_attendu := date_trunc(
        'month', (lower(v_p.period) at time zone 'Indian/Comoro') + interval '1 month'
      ) at time zone 'Indian/Comoro';

      if upper(v_p.period) <> v_attendu then
        raise exception
          'La période n° % ne s''achève pas à la fin du mois comorien : % au lieu de %.',
          v_p.sequence_no,
          to_char(upper(v_p.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI'),
          to_char(v_attendu at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI');
      end if;
    end if;

    v_prec := upper(v_p.period);
  end loop;

  if v_prec <> v_fin then
    raise exception 'La dernière période ne s''achève pas avec le contrat.';
  end if;

  raise notice
    '[OK] 8. 🟩 A-6 : % périodes mensuelles contiguës, closes à la fin du mois COMORIEN, la dernière avec le contrat.',
    v_n;
end $$;


-- --- 9. PLUSIEURS FACTURES, JAMAIS DEUX SUR LA MÊME PÉRIODE ---------------------
do $$
declare
  v_loc   uuid := (select id from recette_fac_loc where cle = 'mensuelle');
  v_p1    uuid;
  v_p2    uuid;
  v_cli   uuid := (select id from recette_fac_objets where cle = 'client');
  v_f1    uuid;
  v_f2    uuid;
  v_statut public.rental_status;
begin
  select id into v_p1 from public.rental_billing_periods
  where rental_id = v_loc and sequence_no = 1;
  select id into v_p2 from public.rental_billing_periods
  where rental_id = v_loc and sequence_no = 2;

  perform pg_temp.agir_comme('facturation');

  -- a. LA FACTURE DE LA PREMIÈRE PÉRIODE.
  v_f1 := public.create_customer_invoice(
    v_cli, (now() at time zone 'Indian/Comoro')::date, null, v_loc, null, v_p1
  );
  perform public.add_customer_invoice_line(v_f1, 'RENTAL', 'Location — période 1', 20, 50000, null);
  perform public.issue_customer_invoice(v_f1, null);

  -- b. 🟥 LA FACTURE DE PÉRIODE NE CLÔT PAS LA LOCATION — Plan 02 §18.2.
  select status into v_statut from public.rentals where id = v_loc;
  if v_statut <> 'IN_PROGRESS' then
    raise exception
      'La facture de période a changé l''état de la location : elle est « % » au lieu d''« En cours ».',
      v_statut;
  end if;

  -- c. UNE SECONDE FACTURE SUR LA MÊME PÉRIODE EST REFUSÉE.
  begin
    perform public.create_customer_invoice(
      v_cli, (now() at time zone 'Indian/Comoro')::date, null, v_loc, null, v_p1
    );
    raise exception 'Une seconde facture a été créée sur la même période : DOUBLE FACTURATION.';
  exception
    when unique_violation then null;
  end;

  -- d. UNE FACTURE GLOBALE SUR UNE LONGUE DURÉE EST REFUSÉE — A-6, Plan 02 §3.3.
  begin
    perform public.create_customer_invoice(
      v_cli, (now() at time zone 'Indian/Comoro')::date, null, v_loc, null, null
    );
    raise exception
      'Une facture SANS période a été créée sur une longue durée : le client devrait deux fois la même chose.';
  exception
    when check_violation then null;
  end;

  -- e. LA SECONDE PÉRIODE SE FACTURE — plusieurs factures sur le même contrat.
  v_f2 := public.create_customer_invoice(
    v_cli, (now() at time zone 'Indian/Comoro')::date, null, v_loc, null, v_p2
  );
  perform public.add_customer_invoice_line(v_f2, 'RENTAL', 'Location — période 2', 30, 50000, null);
  perform public.issue_customer_invoice(v_f2, null);

  if (select count(*) from public.customer_invoices
      where rental_id = v_loc and status <> 'CANCELLED') <> 2 then
    raise exception 'Le contrat devrait porter DEUX factures vivantes.';
  end if;

  -- f. L'ANNULATION REND LA PÉRIODE FACTURABLE — sans aucune colonne à remettre.
  perform public.cancel_customer_invoice(v_f2, 'Recette : erreur de saisie');

  v_f2 := public.create_customer_invoice(
    v_cli, (now() at time zone 'Indian/Comoro')::date, null, v_loc, null, v_p2
  );
  perform public.add_customer_invoice_line(v_f2, 'RENTAL', 'Location — période 2 bis', 30, 50000, null);
  perform public.issue_customer_invoice(v_f2, null);

  -- g. LE RÉGIME SE FIGE DÈS LA PREMIÈRE FACTURE.
  begin
    perform public.set_rental_billing_plan(v_loc, 'FIXED_TERM', null);
    raise exception
      'Le régime a été changé alors que des factures existent : le contrat deviendrait facturable une fois de plus.';
  exception
    when check_violation then null;
  end;

  perform pg_temp.redevenir_service();

  raise notice
    '[OK] 9. Deux factures sur un contrat, aucune seconde sur une période, aucune facture globale, régime figé.';
end $$;


-- --- 10. UNE PÉRIODE NON ÉCHUE NE SE FACTURE PAS — 🟩 « chaque FIN du mois » ---
--
-- Contrat J-20 → J+10 : sa dernière période court encore.

do $$
declare
  v_b     uuid := (select id from recette_fac_objets where cle = 'vehicule_b');
  v_cli   uuid := (select id from recette_fac_objets where cle = 'client');
  v_res   uuid;
  v_loc   uuid;
  v_debut timestamptz := date_trunc('hour', now()) - interval '20 days';
  v_fin   timestamptz := date_trunc('hour', now()) + interval '10 days';
  v_p     uuid;
begin
  perform pg_temp.agir_comme('exploitation');

  insert into public.reservations (reservation_no, client_id, vehicle_id, period, created_by)
  values (public.next_number('reservation'), v_cli, v_b, tstzrange(v_debut, v_fin, '[)'),
          (select id from recette_fac where cle = 'exploitation'))
  returning id into v_res;

  perform public.confirm_reservation(v_res, v_b);
  v_loc := public.convert_reservation_to_rental(v_res);
  insert into recette_fac_loc values ('prolongee', v_loc);

  update public.rentals
     set status = 'CONFIRMED', status_changed_at = now(),
         status_changed_by = public.current_actor(), updated_by = public.current_actor()
   where id = v_loc;

  perform public.start_rental(v_loc, v_debut, 20000, 'FULL');
  perform pg_temp.redevenir_service();

  perform pg_temp.agir_comme('facturation');
  perform public.set_rental_billing_plan(v_loc, 'LONG_TERM', 'MONTHLY');

  -- La DERNIÈRE période court encore : elle ne se facture pas.
  select id into v_p from public.rental_billing_periods
  where rental_id = v_loc and upper(period) > now()
  order by sequence_no desc limit 1;

  if v_p is null then
    raise exception 'Aucune période à venir : le décor de ce contrôle est faux.';
  end if;

  begin
    perform public.create_customer_invoice(
      v_cli, (now() at time zone 'Indian/Comoro')::date, null, v_loc, null, v_p
    );
    raise exception 'Une période NON ÉCHUE a été facturée : on facture un temps qui n''a pas couru.';
  exception
    when check_violation then null;
  end;

  perform pg_temp.redevenir_service();

  raise notice '[OK] 10. 🟩 A-6 : une période encore en cours ne se facture pas.';
end $$;


-- --- 11. 🟩 A-4 — LA PROLONGATION EST UN AVENANT --------------------------------
do $$
declare
  v_loc     uuid := (select id from recette_fac_loc where cle = 'prolongee');
  v_no      text;
  v_apres   text;
  v_avant_p int;
  v_apres_p int;
  v_avant_s int;
  v_amend   uuid;
  v_nouveau timestamptz := date_trunc('hour', now()) + interval '40 days';
  v_seg     public.rental_segments%rowtype;
  v_p1      public.rental_billing_periods%rowtype;
  v_p1_bis  public.rental_billing_periods%rowtype;
begin
  select rental_no into v_no from public.rentals where id = v_loc;
  select count(*) into v_avant_p from public.rental_billing_periods where rental_id = v_loc;
  select count(*) into v_avant_s from public.rental_segments where rental_id = v_loc;
  select * into v_p1 from public.rental_billing_periods where rental_id = v_loc and sequence_no = 1;

  -- a. SANS MOTIF, LA PROLONGATION EST REFUSÉE — un avenant porte son motif.
  perform pg_temp.agir_comme('exploitation');
  begin
    perform public.extend_rental(v_loc, v_nouveau, '   ');
    raise exception 'Une prolongation sans motif a été acceptée : un avenant porte toujours son motif.';
  exception
    when check_violation then null;
  end;

  -- b. AVEC UN MONTANT MAIS SANS `override`, ELLE EST REFUSÉE — A-14.
  begin
    perform public.extend_rental(v_loc, v_nouveau, 'Demande du client', 70000, 'DAY', 'Passage en longue durée');
    raise exception
      '`rental.rentals.extend` a ouvert `rental.pricing.override` : les deux capacités ne sont pas indépendantes.';
  exception
    when insufficient_privilege then null;
  end;

  -- c. LA PROLONGATION SIMPLE — le tarif du contrat est CONSERVÉ (A-5, cas 1).
  v_amend := public.extend_rental(v_loc, v_nouveau, 'Chantier prolongé de trente jours');
  perform pg_temp.redevenir_service();

  -- d. LE CONTRAT N'A PAS CHANGÉ D'IDENTITÉ — A-4.
  select rental_no into v_apres from public.rentals where id = v_loc;
  if v_apres is distinct from v_no then
    raise exception 'L''identifiant du contrat a changé : % → %', v_no, v_apres;
  end if;

  -- e. L'AVENANT EXISTE, ET IL EST DE NATURE « PROLONGATION ».
  if (select kind from public.rental_amendments where id = v_amend) <> 'EXTENSION' then
    raise exception 'La prolongation n''a pas produit un avenant de prolongation.';
  end if;

  if (select rate_override from public.rental_amendments where id = v_amend) then
    raise exception
      'Une prolongation sans changement de tarif a été consignée comme une dérogation.';
  end if;

  -- f. LE SEGMENT OUVERT S'EST ALLONGÉ, ET LUI SEUL — acquis de la migration 089.
  if (select count(*) from public.rental_segments where rental_id = v_loc) <> v_avant_s then
    raise exception
      'La prolongation sans changement de tarif a ouvert un segment : le tarif devait être conservé.';
  end if;

  select * into v_seg from public.rental_segments where rental_id = v_loc and status = 'ACTIVE';
  if upper(v_seg.period) <> v_nouveau then
    raise exception 'Le segment ouvert ne s''est pas allongé jusqu''à la nouvelle date.';
  end if;

  if v_seg.locked_amount <> 60000 then
    raise exception 'Le tarif du contrat a changé sans que personne ne le demande : % au lieu de 60 000.',
      v_seg.locked_amount;
  end if;

  -- g. LES PÉRIODES ANTÉRIEURES SONT INTACTES — consigne §4.
  select * into v_p1_bis from public.rental_billing_periods where id = v_p1.id;
  if v_p1_bis.period is distinct from v_p1.period or v_p1_bis.status <> v_p1.status then
    raise exception 'La prolongation a réécrit une période facturable antérieure.';
  end if;

  -- h. ET LE TEMPS AJOUTÉ EST FACTURABLE — une conséquence, jamais un acte.
  select count(*) into v_apres_p from public.rental_billing_periods where rental_id = v_loc;
  if v_apres_p <= v_avant_p then
    raise exception
      'La prolongation n''a ouvert aucune période : un intervalle du contrat ne serait jamais facturé.';
  end if;

  if (select max(upper(period)) from public.rental_billing_periods
      where rental_id = v_loc and status <> 'CANCELLED') <> v_nouveau then
    raise exception 'Le découpage facturable ne couvre pas la nouvelle date de fin.';
  end if;

  -- i. LES PÉRIODES AJOUTÉES NOMMENT LEUR AVENANT.
  if not exists (
    select 1 from public.rental_billing_periods
    where rental_id = v_loc and amendment_id = v_amend
  ) then
    raise exception 'Les périodes ajoutées ne nomment pas l''avenant qui les a ouvertes.';
  end if;

  raise notice
    '[OK] 11. 🟩 A-4 : même contrat, un avenant de prolongation, périodes antérieures intactes, temps ajouté facturable.';
end $$;


-- --- 12. 🟩 A-5 — LE TARIF CHANGE, ET L'ANCIEN RESTE SUR SA PÉRIODE -------------
do $$
declare
  v_loc     uuid := (select id from recette_fac_loc where cle = 'prolongee');
  v_avant   timestamptz;
  v_nouveau timestamptz := date_trunc('hour', now()) + interval '70 days';
  v_amend   uuid;
  v_ancien  public.rental_segments%rowtype;
  v_neuf    public.rental_segments%rowtype;
begin
  select * into v_ancien from public.rental_segments where rental_id = v_loc and status = 'ACTIVE';
  v_avant := upper(v_ancien.period);

  perform pg_temp.agir_comme('derogation');

  -- a. UN MONTANT SANS RAISON EST REFUSÉ — un prix ne change jamais en silence.
  begin
    perform public.extend_rental(v_loc, v_nouveau, 'Prolongation', 70000, 'DAY', null);
    raise exception 'Un nouveau tarif sans raison écrite a été accepté.';
  exception
    when check_violation then null;
  end;

  -- b. UNE RAISON SANS MONTANT EST REFUSÉE — elle ne motiverait rien.
  begin
    perform public.extend_rental(v_loc, v_nouveau, 'Prolongation', null, null, 'Passage longue durée');
    raise exception 'Une raison de changement de tarif sans montant a été acceptée.';
  exception
    when check_violation then null;
  end;

  -- c. LE CAS LÉGITIME — A-5, cas 2.
  v_amend := public.extend_rental(
    v_loc, v_nouveau, 'Seconde prolongation', 70000, 'DAY',
    'Passage du mode court au mode long, conditions renégociées'
  );
  perform pg_temp.redevenir_service();

  -- d. L'ANCIEN SEGMENT EST CLOS SUR SA PÉRIODE, AVEC SON TARIF — consigne §5.
  select * into v_neuf from public.rental_segments where id = v_ancien.id;
  if v_neuf.locked_amount <> v_ancien.locked_amount then
    raise exception 'Le tarif d''une période historique a été réécrit.';
  end if;
  if upper(v_neuf.period) <> v_avant then
    raise exception 'La période historique a été déplacée.';
  end if;
  if v_neuf.status <> 'ENDED' then
    raise exception 'L''ancien segment n''a pas été clos.';
  end if;

  -- e. LE NOUVEAU SEGMENT PORTE LE NOUVEAU TARIF, SUR LE TEMPS AJOUTÉ SEUL.
  select * into v_neuf from public.rental_segments where rental_id = v_loc and status = 'ACTIVE';
  if v_neuf.locked_amount <> 70000 then
    raise exception 'Le nouveau tarif n''est pas appliqué : % au lieu de 70 000.', v_neuf.locked_amount;
  end if;
  if lower(v_neuf.period) <> v_avant or upper(v_neuf.period) <> v_nouveau then
    raise exception 'Le nouveau tarif ne couvre pas exactement le temps ajouté.';
  end if;
  if v_neuf.locked_source <> 'OVERRIDE' then
    raise exception 'Le nouveau tarif n''est pas marqué comme dérogatoire.';
  end if;

  -- f. L'AVENANT PORTE LA DÉROGATION ET SA RAISON, et il est JOURNALISÉ.
  if not (select rate_override from public.rental_amendments where id = v_amend) then
    raise exception 'L''avenant ne porte pas la dérogation tarifaire.';
  end if;

  if (select rate_override_reason from public.rental_amendments where id = v_amend) is null then
    raise exception 'La dérogation n''a pas de raison écrite.';
  end if;

  if not exists (
    select 1 from public.audit_log
    where entity_type = 'rental_amendments' and entity_id = v_amend::text and action = 'PRICE_CHANGE'
  ) then
    raise exception 'Le changement de tarif n''a pas été journalisé sous PRICE_CHANGE.';
  end if;

  raise notice
    '[OK] 12. 🟩 A-5 : ancien tarif conservé sur sa période, nouveau tarif sur le temps ajouté, dérogation motivée et journalisée.';
end $$;


-- --- 13. LES REFUS STRUCTURELS DES PÉRIODES ------------------------------------
do $$
declare
  v_loc  uuid := (select id from recette_fac_loc where cle = 'prolongee');
  v_p    public.rental_billing_periods%rowtype;
  v_max  int;
begin
  select * into v_p from public.rental_billing_periods
  where rental_id = v_loc and sequence_no = 1;

  perform pg_temp.agir_comme('facturation');

  -- a. UN CHEVAUCHEMENT EST REFUSÉ PAR LA CONTRAINTE D'EXCLUSION.
  select max(sequence_no) into v_max from public.rental_billing_periods where rental_id = v_loc;
  begin
    insert into public.rental_billing_periods (rental_id, sequence_no, period, origin)
    values (v_loc, v_max + 1, v_p.period, 'MONTHLY');
    raise exception 'Deux périodes se recouvrent : le même temps pourrait être facturé deux fois.';
  exception
    when exclusion_violation then null;
    when check_violation then null;
  end;

  -- b. UN TROU EST REFUSÉ PAR LA CONTIGUÏTÉ.
  begin
    insert into public.rental_billing_periods (rental_id, sequence_no, period, origin)
    values (v_loc, v_max + 1,
            tstzrange(now() + interval '200 days', now() + interval '230 days', '[)'),
            'MONTHLY');
    raise exception 'Une période détachée a été ouverte : un intervalle du contrat ne serait jamais facturé.';
  exception
    when check_violation then null;
  end;

  -- c. UN RANG INCOHÉRENT EST REFUSÉ.
  begin
    insert into public.rental_billing_periods (rental_id, sequence_no, period, origin)
    values (v_loc, v_max + 5,
            tstzrange(now() + interval '70 days', now() + interval '80 days', '[)'),
            'MONTHLY');
    raise exception 'Un rang incohérent a été accepté.';
  exception
    when check_violation then null;
  end;

  -- d. RIEN NE SE SUPPRIME.
  begin
    delete from public.rental_billing_periods where id = v_p.id;
    raise exception 'Une période facturable a été supprimée.';
  exception
    when others then null;
  end;

  -- e. LE DÉBUT D'UNE PÉRIODE NE SE DÉPLACE PAS.
  begin
    update public.rental_billing_periods
       set period = tstzrange(lower(period) + interval '1 day', upper(period), '[)')
     where id = v_p.id;
    raise exception 'Le début d''une période facturable a été déplacé.';
  exception
    when check_violation then null;
  end;

  -- f. UNE PÉRIODE FACTURÉE NE S'ANNULE PAS.
  --    (la période 1 du contrat mensuel porte une facture émise)
  declare
    v_facturee uuid := (
      select bp.id from public.rental_billing_periods bp
      join public.customer_invoices i on i.billing_period_id = bp.id
      where i.status <> 'CANCELLED' limit 1
    );
  begin
    if v_facturee is null then
      raise exception 'Aucune période facturée : le décor de ce contrôle est faux.';
    end if;

    begin
      perform public.cancel_rental_billing_period(v_facturee);
      raise exception 'Une période FACTURÉE a été annulée : la facture mentirait.';
    exception
      when check_violation then null;
    end;
  end;

  -- g. SEULE LA DERNIÈRE PÉRIODE S'ANNULE.
  begin
    perform public.cancel_rental_billing_period(v_p.id);
    raise exception 'Une période du MILIEU a été annulée : un trou serait ouvert.';
  exception
    when check_violation then null;
  end;

  -- h. … ET LA DERNIÈRE S'ANNULE BIEN.
  declare
    v_derniere uuid := (
      select id from public.rental_billing_periods
      where rental_id = v_loc and status = 'PLANNED'
      order by sequence_no desc limit 1
    );
  begin
    perform public.cancel_rental_billing_period(v_derniere);

    if (select status from public.rental_billing_periods where id = v_derniere) <> 'CANCELLED' then
      raise exception 'La dernière période n''a pas été annulée.';
    end if;

    -- Elle ne se rouvre pas.
    begin
      update public.rental_billing_periods set status = 'PLANNED' where id = v_derniere;
      raise exception 'Une période annulée a été rouverte.';
    exception
      when check_violation then null;
    end;
  end;

  perform pg_temp.redevenir_service();

  raise notice
    '[OK] 13. Sept refus : chevauchement, trou, rang, suppression, début déplacé, période facturée, période du milieu.';
end $$;


-- --- 14. LE RETOUR RAMÈNE LE TEMPS FACTURABLE À LA RÉALITÉ ---------------------
do $$
declare
  v_c     uuid := (select id from recette_fac_objets where cle = 'vehicule_c');
  v_cli   uuid := (select id from recette_fac_objets where cle = 'client');
  v_res   uuid;
  v_loc   uuid;
  v_debut timestamptz := date_trunc('hour', now()) - interval '70 days';
  v_fin   timestamptz := date_trunc('hour', now()) + interval '30 days';
  v_retour timestamptz := date_trunc('hour', now()) - interval '2 days';
  v_apres int;
  v_tronquee int;
begin
  perform pg_temp.agir_comme('exploitation');

  insert into public.reservations (reservation_no, client_id, vehicle_id, period, created_by)
  values (public.next_number('reservation'), v_cli, v_c, tstzrange(v_debut, v_fin, '[)'),
          (select id from recette_fac where cle = 'exploitation'))
  returning id into v_res;

  perform public.confirm_reservation(v_res, v_c);
  v_loc := public.convert_reservation_to_rental(v_res);
  insert into recette_fac_loc values ('retour', v_loc);

  update public.rentals
     set status = 'CONFIRMED', status_changed_at = now(),
         status_changed_by = public.current_actor(), updated_by = public.current_actor()
   where id = v_loc;

  perform public.start_rental(v_loc, v_debut, 30000, 'FULL');
  perform pg_temp.redevenir_service();

  perform pg_temp.agir_comme('facturation');
  perform public.set_rental_billing_plan(v_loc, 'LONG_TERM', 'MONTHLY');
  perform pg_temp.redevenir_service();

  -- Le retour survient AVANT la fin prévue.
  perform pg_temp.agir_comme('exploitation');
  perform public.return_rental(v_loc, v_retour, 40000, 'FULL');
  perform pg_temp.redevenir_service();

  -- a. AUCUNE PÉRIODE VIVANTE NE DÉPASSE LE RETOUR.
  select count(*) into v_apres from public.rental_billing_periods
  where rental_id = v_loc and status = 'PLANNED' and upper(period) > v_retour;

  if v_apres <> 0 then
    raise exception
      '% période(s) facturable(s) courent encore après le retour : un temps qui n''a jamais couru serait facturé.',
      v_apres;
  end if;

  -- b. LA PÉRIODE À CHEVAL A ÉTÉ RAMENÉE AU RETOUR.
  select count(*) into v_tronquee from public.rental_billing_periods
  where rental_id = v_loc and status = 'PLANNED' and upper(period) = v_retour;

  if v_tronquee <> 1 then
    raise exception 'La période contenant le retour n''a pas été ramenée à la date réelle.';
  end if;

  -- c. LA COUVERTURE RESTE CONTIGUË — aucun trou n'a été creusé.
  if exists (
    select 1 from (
      select upper(period) as fin,
             lead(lower(period)) over (order by sequence_no) as suivant
      from public.rental_billing_periods
      where rental_id = v_loc and status = 'PLANNED'
    ) t where t.suivant is not null and t.suivant <> t.fin
  ) then
    raise exception 'Le retour a creusé un trou dans le découpage facturable.';
  end if;

  raise notice '[OK] 14. Le retour ramène les périodes non facturées à la réalité, sans creuser de trou.';
end $$;


-- --- 15. LA DERNIÈRE FACTURE DE PÉRIODE REND LA LOCATION « FACTURÉE » ----------
--
-- Une facture de période ne clôt PAS la location (contrôle 9). Mais lorsqu'elle
-- est « À facturer » ET qu'aucune période ne reste découverte, « Facturée » est
-- alors vrai — sans quoi une longue durée ne pourrait JAMAIS être clôturée.

do $$
declare
  v_loc   uuid := (select id from recette_fac_loc where cle = 'retour');
  v_cli   uuid := (select id from recette_fac_objets where cle = 'client');
  v_p     record;
  v_f     uuid;
  v_statut public.rental_status;
  v_reste int;
begin
  -- Le contrôle de retour est validé : la location passe « À facturer ».
  perform pg_temp.agir_comme('exploitation');
  update public.rentals
     set status = 'TO_INVOICE', status_changed_at = now(),
         status_changed_by = public.current_actor(), updated_by = public.current_actor()
   where id = v_loc;
  perform pg_temp.redevenir_service();

  perform pg_temp.agir_comme('facturation');

  for v_p in
    select * from public.rental_billing_periods
    where rental_id = v_loc and status = 'PLANNED'
    order by sequence_no
  loop
    v_f := public.create_customer_invoice(
      v_cli, (now() at time zone 'Indian/Comoro')::date, null, v_loc, null, v_p.id
    );
    perform public.add_customer_invoice_line(
      v_f, 'RENTAL', 'Location — période ' || v_p.sequence_no, 10, 55000, null
    );

    -- AVANT la dernière, la location doit rester « À facturer ».
    select count(*) into v_reste
    from public.rental_billing_periods bp
    where bp.rental_id = v_loc and bp.status <> 'CANCELLED'
      and not exists (
        select 1 from public.customer_invoices i
        where i.billing_period_id = bp.id and i.status <> 'CANCELLED'
      );

    perform public.issue_customer_invoice(v_f, null);

    select status into v_statut from public.rentals where id = v_loc;

    if v_reste > 1 and v_statut <> 'TO_INVOICE' then
      raise exception
        'La location est passée « % » alors que % périodes restaient à facturer.', v_statut, v_reste - 1;
    end if;
  end loop;

  select status into v_statut from public.rentals where id = v_loc;
  if v_statut <> 'INVOICED' then
    raise exception
      'Toutes les périodes sont facturées et la location est « % » : elle ne pourrait jamais être clôturée.',
      v_statut;
  end if;

  -- L'ANNULATION D'UNE FACTURE DE PÉRIODE LA RAMÈNE « À FACTURER ».
  select id into v_f from public.customer_invoices
  where rental_id = v_loc and status <> 'CANCELLED' order by created_at desc limit 1;

  perform public.cancel_customer_invoice(v_f, 'Recette : retour en arrière');

  if (select status from public.rentals where id = v_loc) <> 'TO_INVOICE' then
    raise exception
      'L''annulation d''une facture de période n''a pas ramené la location « À facturer » : impasse.';
  end if;

  perform pg_temp.redevenir_service();

  raise notice
    '[OK] 15. « Facturée » seulement quand AUCUNE période ne reste découverte ; l''annulation la défait.';
end $$;


-- --- 16. UNE DURÉE FIXÉE REFUSE UNE FACTURE DE PÉRIODE -------------------------
do $$
declare
  v_loc uuid;
  v_cli uuid := (select id from recette_fac_objets where cle = 'client');
  v_p   uuid;
begin
  -- Une location existante, à durée fixée : toutes le sont (Plan 02 §19.4).
  select id into v_loc from public.rentals
  where rental_type = 'FIXED_TERM' and id not in (select id from recette_fac_loc)
  limit 1;

  /*
   * UNE PÉRIODE D'UN AUTRE CONTRAT, ÉCHUE ET NON FACTURÉE.
   *
   * Non facturée : sinon le refus viendrait de l'unicité par période, et non du
   * rattachement — le contrôle passerait pour la mauvaise raison.
   */
  select bp.id into v_p
  from public.rental_billing_periods bp
  where bp.status = 'PLANNED'
    and upper(bp.period) <= now()
    and not exists (
      select 1 from public.customer_invoices i
      where i.billing_period_id = bp.id and i.status <> 'CANCELLED'
    )
  limit 1;

  if v_p is null then
    raise exception 'Le décor de ce contrôle est faux : aucune période libre et échue.';
  end if;

  if v_loc is null then
    raise notice '[OK] 16. (aucune location à durée fixée en base — contrôle sans objet)';
    return;
  end if;

  perform pg_temp.agir_comme('facturation');

  -- a. La période d'un AUTRE contrat est refusée.
  begin
    perform public.create_customer_invoice(
      v_cli, (now() at time zone 'Indian/Comoro')::date, null, v_loc, null, v_p
    );
    raise exception
      'Une facture a été rattachée à la période d''un AUTRE contrat.';
  exception
    when check_violation then null;
    when no_data_found then null;
    when insufficient_privilege then null;
  end;

  perform pg_temp.redevenir_service();

  -- b. Une période ne s'ouvre pas sur une location à durée fixée.
  begin
    insert into public.rental_billing_periods (rental_id, sequence_no, period, origin)
    values (v_loc, 1, tstzrange(now() - interval '2 days', now() - interval '1 day', '[)'), 'MONTHLY');
    raise exception
      'Une période facturable a été ouverte sur une location à durée fixée : les deux régimes se mélangeraient.';
  exception
    when check_violation then null;
  end;

  raise notice '[OK] 16. Les deux régimes sont étanches : ni période sur durée fixée, ni période d''un autre contrat.';
end $$;


-- --- 17. 🟩 A-6 — LA PÉRIODE CONTRACTUELLE : UNE SEULE, ENTIÈRE ----------------
do $$
declare
  v_loc uuid := (select id from recette_fac_loc where cle = 'mensuelle');
  v_a   uuid := (select id from recette_fac_objets where cle = 'vehicule_a');
  v_cli uuid := (select id from recette_fac_objets where cle = 'client');
  v_res uuid;
  v_new uuid;
  v_debut timestamptz := date_trunc('hour', now()) - interval '300 days';
  v_fin   timestamptz := date_trunc('hour', now()) - interval '210 days';
  v_n   int;
  v_p   public.rental_billing_periods%rowtype;
begin
  perform pg_temp.agir_comme('exploitation');

  insert into public.reservations (reservation_no, client_id, vehicle_id, period, created_by)
  values (public.next_number('reservation'), v_cli, v_a, tstzrange(v_debut, v_fin, '[)'),
          (select id from recette_fac where cle = 'exploitation'))
  returning id into v_res;

  perform public.confirm_reservation(v_res, v_a);
  v_new := public.convert_reservation_to_rental(v_res);
  insert into recette_fac_loc values ('contractuelle', v_new);

  update public.rentals
     set status = 'CONFIRMED', status_changed_at = now(),
         status_changed_by = public.current_actor(), updated_by = public.current_actor()
   where id = v_new;

  perform public.start_rental(v_new, v_debut, 10000, 'FULL');
  perform pg_temp.redevenir_service();

  perform pg_temp.agir_comme('facturation');
  v_n := public.set_rental_billing_plan(v_new, 'LONG_TERM', 'CONTRACT_TERM');
  perform pg_temp.redevenir_service();

  if v_n <> 1 then
    raise exception
      'Une cadence contractuelle a produit % périodes : elle doit en produire UNE, entière.', v_n;
  end if;

  select * into v_p from public.rental_billing_periods where rental_id = v_new;

  if lower(v_p.period) <> v_debut or upper(v_p.period) <> v_fin then
    raise exception 'La période contractuelle ne couvre pas exactement la durée engagée.';
  end if;

  if v_p.origin <> 'CONTRACT_TERM' then
    raise exception 'La période contractuelle ne porte pas son origine.';
  end if;

  raise notice '[OK] 17. 🟩 A-6 : la cadence contractuelle produit UNE période, du début à la fin.';
end $$;


-- --- 18. L'ANNULATION DU CONTRAT ANNULE SON TEMPS FACTURABLE -------------------
do $$
declare
  v_a   uuid := (select id from recette_fac_objets where cle = 'vehicule_a');
  v_cli uuid := (select id from recette_fac_objets where cle = 'client');
  v_res uuid;
  v_loc uuid;
  -- UNE FENÊTRE À VENIR : le contrat n'est jamais parti, et c'est précisément
  -- ce qu'une annulation suppose. Les tarifs du décor courent depuis J-400 ;
  -- une fenêtre antérieure n'en aurait aucun.
  v_debut timestamptz := date_trunc('hour', now()) + interval '200 days';
  v_fin   timestamptz := date_trunc('hour', now()) + interval '230 days';
begin
  perform pg_temp.agir_comme('exploitation');

  insert into public.reservations (reservation_no, client_id, vehicle_id, period, created_by)
  values (public.next_number('reservation'), v_cli, v_a, tstzrange(v_debut, v_fin, '[)'),
          (select id from recette_fac where cle = 'exploitation'))
  returning id into v_res;

  perform public.confirm_reservation(v_res, v_a);
  v_loc := public.convert_reservation_to_rental(v_res);
  insert into recette_fac_loc values ('annulee', v_loc);
  perform pg_temp.redevenir_service();

  perform pg_temp.agir_comme('facturation');
  perform public.set_rental_billing_plan(v_loc, 'LONG_TERM', 'CONTRACT_TERM');
  perform pg_temp.redevenir_service();

  if (select count(*) from public.rental_billing_periods
      where rental_id = v_loc and status = 'PLANNED') = 0 then
    raise exception 'Le décor de ce contrôle est faux : aucune période ouverte.';
  end if;

  perform pg_temp.agir_comme('exploitation');
  perform public.cancel_rental(v_loc, 'Recette : annulation');
  perform pg_temp.redevenir_service();

  if exists (
    select 1 from public.rental_billing_periods
    where rental_id = v_loc and status = 'PLANNED'
  ) then
    raise exception
      'Un contrat annulé garde des périodes facturables : un temps qui n''existera jamais serait facturé.';
  end if;

  -- Elles ne sont pas SUPPRIMÉES : elles ont existé (CLAUDE.md §22).
  if (select count(*) from public.rental_billing_periods where rental_id = v_loc) = 0 then
    raise exception 'Les périodes d''un contrat annulé ont été effacées.';
  end if;

  raise notice '[OK] 18. L''annulation du contrat annule ses périodes, sans les effacer.';
end $$;


-- --- 19. LE JOURNAL, ET CE QU'IL N'OUVRE PAS -----------------------------------
do $$
declare v_loc uuid := (select id from recette_fac_loc where cle = 'mensuelle');
begin
  -- a. Les périodes sont journalisées.
  if not exists (
    select 1 from public.audit_log a
    join public.rental_billing_periods bp on bp.id::text = a.entity_id
    where bp.rental_id = v_loc and a.entity_type = 'rental_billing_periods'
  ) then
    raise exception 'L''ouverture d''une période facturable n''est pas journalisée.';
  end if;

  -- b. Le détail se lit avec le CONTRAT, ni plus ni moins.
  if public.audit_detail_permission('rental_billing_periods') <> 'rental.rentals.view' then
    raise exception 'Le journal ouvre les périodes autrement que le contrat.';
  end if;

  -- c. 🟥 LE COÛT GELÉ GARDE SA LECTURE — A-2, et le LOT 23 ne l'entrouvre pas.
  if public.audit_detail_permission('rental_segment_costs') <> 'rental.pricing.supplier.view' then
    raise exception 'Le journal rendrait le coût gelé à qui ne peut pas le lire.';
  end if;

  -- d. L'avenant de prolongation est journalisé comme une création.
  if not exists (
    select 1 from public.audit_log a
    join public.rental_amendments am on am.id::text = a.entity_id
    where am.kind = 'EXTENSION' and a.action = 'CREATE'
  ) then
    raise exception 'Un avenant de prolongation n''est pas journalisé.';
  end if;

  raise notice '[OK] 19. Le journal enregistre les périodes et les prolongations, sans ouvrir le coût gelé.';
end $$;


-- --- 20. LES ACQUIS DES LOTS ANTÉRIEURS ----------------------------------------
do $$
declare v_n int;
begin
  -- a. `pricing_rules` INTACTE — Plan 02 §5.7 reste écarté, DEC-002 en vigueur.
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'pricing_rules' and c.contype = 'x'
  ) then
    raise exception 'Une contrainte d''exclusion a été posée sur `pricing_rules`.';
  end if;

  -- b. CHAQUE LOCATION porte au moins un segment — acquis du LOT 22.
  select count(*) into v_n
  from public.rentals r
  where not exists (select 1 from public.rental_segments s where s.rental_id = r.id);

  if v_n > 0 then
    raise exception '% location(s) sans segment : l''acquis du LOT 22 est perdu.', v_n;
  end if;

  -- c. LE COÛT GELÉ ne s'ouvre QUE par sa capacité — acquis du LOT 22.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rental_segment_costs'
      and (qual like '%rentals.view%' or qual like '%financial.view%' or qual like '%fleet.view%')
  ) then
    raise exception 'La lecture du coût gelé s''est élargie.';
  end if;

  -- d. `vehicles_origin_attachment_coherent` intacte — P-2 n'est pas tranchée.
  if not exists (
    select 1 from pg_constraint where conname = 'vehicles_origin_attachment_coherent'
  ) then
    raise exception 'La cohérence origine / fournisseur du parc a disparu.';
  end if;

  raise notice '[OK] 20. Acquis intacts : pricing_rules, segments, coût gelé, cohérence du parc.';
end $$;


rollback;
