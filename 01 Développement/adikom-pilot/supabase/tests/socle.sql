-- =============================================================================
-- ADIKOM PILOT — Recette du socle
--
-- Vérifie que les garanties structurelles du socle sont réellement en place
-- après `supabase db reset`. Chaque contrôle échoue bruyamment : le script
-- s'arrête à la première règle non respectée.
--
-- Exécution :
--   docker exec -i supabase_db_adikom-pilot \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/socle.sql
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

-- La recette s'exécute dans une transaction annulée en fin de script.
-- Deux bénéfices : elle ne laisse aucun résidu en base, et elle peut être
-- rejouée indéfiniment sans nettoyage. Le nettoyage manuel serait d'ailleurs
-- impossible pour le Super Admin de test : le trigger de protection interdit
-- précisément de supprimer le dernier Super Admin actif.
begin;

-- --- 1. Tables du socle ------------------------------------------------------
do $$
declare
  expected text[] := array[
    'app_users', 'departments', 'user_departments',
    'groups', 'user_groups',
    'permissions', 'group_permissions', 'user_permissions',
    'audit_log', 'company_settings', 'numbering_rules'
  ];
  missing text[];
begin
  select array_agg(t) into missing
  from unnest(expected) t
  where not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = t
  );

  if missing is not null then
    raise exception 'Tables manquantes : %', missing;
  end if;

  raise notice '[OK] 1. Les 11 tables du socle sont présentes.';
end $$;


-- --- 2. RLS activée sur toutes les tables ------------------------------------
do $$
declare
  unprotected text[];
begin
  select array_agg(c.relname) into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'RLS absente sur : %', unprotected;
  end if;

  raise notice '[OK] 2. RLS activée sur toutes les tables publiques.';
end $$;


-- --- 3. Le journal d'audit est en écriture seule -----------------------------
-- 05_Regles_Metier/06_Audit.md §40 et §77
do $$
declare
  has_update boolean;
  has_delete boolean;
begin
  select
    bool_or(cmd = 'UPDATE'),
    bool_or(cmd = 'DELETE')
  into has_update, has_delete
  from (
    select polcmd::text as cmd
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'audit_log'
  ) s;

  if coalesce(has_update, false) or coalesce(has_delete, false) then
    raise exception 'Le journal d''audit expose une policy UPDATE ou DELETE.';
  end if;

  raise notice '[OK] 3. Aucune policy UPDATE/DELETE sur le journal d''audit.';
end $$;

-- Le trigger doit refuser toute modification, même en tant que propriétaire.
do $$
declare
  blocked boolean := false;
begin
  insert into public.audit_log (action, entity_type, entity_label)
  values ('CREATE', 'recette', 'contrôle append-only');

  begin
    update public.audit_log set reason = 'falsification'
    where entity_type = 'recette';
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'Le journal d''audit a pu être modifié : falsification possible.';
  end if;

  blocked := false;
  begin
    delete from public.audit_log where entity_type = 'recette';
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'Une entrée du journal d''audit a pu être supprimée.';
  end if;

  raise notice '[OK] 4. Le journal d''audit refuse UPDATE et DELETE.';
end $$;


-- --- 5. Catalogue des permissions --------------------------------------------
do $$
declare
  total       int;
  sensitive   int;
  orphan      int;
begin
  select count(*) into total from public.permissions;

  if total < 100 then
    raise exception 'Catalogue incomplet : % permissions.', total;
  end if;

  select count(*) into sensitive from public.permissions where is_sensitive;

  -- Toute permission doit porter un module et un libellé exploitables.
  select count(*) into orphan
  from public.permissions
  where module_code is null or module_label is null or label is null;

  if orphan > 0 then
    raise exception '% permissions sans module ou libellé.', orphan;
  end if;

  raise notice '[OK] 5. Catalogue : % permissions dont % sensibles.', total, sensitive;
end $$;


-- --- 6. Moteur d'autorisation ------------------------------------------------
-- DEC-009 : refus explicite > autorisation > absence = refus
do $$
declare
  v_user  uuid := gen_random_uuid();
  v_group uuid;
  v_perm  uuid;
begin
  -- Utilisateur de recette rattaché à un compte d'authentification factice.
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'recette@adikom.test', now(), now());

  insert into public.app_users (id, first_name, last_name, email, status)
  values (v_user, 'Recette', 'Permissions', 'recette@adikom.test', 'ACTIVE');

  select id into v_perm from public.permissions where code = 'parties.clients.view';

  -- 6a. Aucune règle → refus
  if public.has_permission('parties.clients.view', v_user) then
    raise exception 'Sans aucune règle, l''accès devrait être refusé.';
  end if;
  raise notice '[OK] 6a. Absence de permission = refus.';

  -- 6b. Autorisation héritée d'un groupe → accordé
  insert into public.groups (code, name) values ('RECETTE', 'Groupe de recette')
  returning id into v_group;

  insert into public.group_permissions (group_id, permission_id, effect)
  values (v_group, v_perm, 'ALLOW');

  insert into public.user_groups (user_id, group_id) values (v_user, v_group);

  if not public.has_permission('parties.clients.view', v_user) then
    raise exception 'Une autorisation héritée d''un groupe devrait accorder l''accès.';
  end if;
  raise notice '[OK] 6b. Autorisation héritée d''un groupe = accès accordé.';

  -- 6c. Refus individuel → prioritaire sur l'autorisation du groupe
  insert into public.user_permissions (user_id, permission_id, effect)
  values (v_user, v_perm, 'DENY');

  if public.has_permission('parties.clients.view', v_user) then
    raise exception 'Un refus explicite doit primer sur une autorisation héritée.';
  end if;
  raise notice '[OK] 6c. Refus explicite prioritaire sur l''autorisation.';

  -- 6d. Compte désactivé → aucun droit, quelles que soient les permissions
  delete from public.user_permissions where user_id = v_user;

  update public.app_users
     set status = 'INACTIVE', deactivated_at = now()
   where id = v_user;

  if public.has_permission('parties.clients.view', v_user) then
    raise exception 'Un compte non actif ne doit conserver aucun droit.';
  end if;
  raise notice '[OK] 6d. Compte désactivé = aucun droit.';

  -- 6e. Permission inconnue → refus
  update public.app_users set status = 'ACTIVE', deactivated_at = null where id = v_user;

  if public.has_permission('module.inexistant.view', v_user) then
    raise exception 'Une permission absente du catalogue doit être refusée.';
  end if;
  raise notice '[OK] 6e. Permission hors catalogue = refus.';
end $$;


-- --- 7. Super Admin : accès complet et protection -----------------------------
do $$
declare
  v_user uuid := gen_random_uuid();
  v_all  int;
  v_granted int;
  blocked boolean := false;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'superadmin@adikom.test', now(), now());

  insert into public.app_users (id, first_name, last_name, email, status, is_super_admin)
  values (v_user, 'Super', 'Recette', 'superadmin@adikom.test', 'ACTIVE', true);

  -- 7a. Accès complet sans aucune permission explicite
  select count(*) into v_all from public.permissions;
  select count(*) into v_granted
  from public.effective_permissions(v_user) where granted;

  if v_granted <> v_all then
    raise exception 'Super Admin : % permissions accordées sur %.', v_granted, v_all;
  end if;
  raise notice '[OK] 7a. Super Admin : accès complet (% permissions).', v_granted;

  -- 7b. Le dernier Super Admin actif ne peut pas être rétrogradé
  begin
    update public.app_users set is_super_admin = false where id = v_user;
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'Le dernier Super Admin actif a pu être rétrogradé.';
  end if;
  raise notice '[OK] 7b. Le dernier Super Admin est protégé.';
end $$;


-- --- 8. Numérotation ----------------------------------------------------------
-- 03_Modules/09_Parametres.md §16 : unique, atomique, sans collision
do $$
declare
  a text;
  b text;
  rules int;
begin
  select count(*) into rules from public.numbering_rules;
  if rules < 10 then
    raise exception 'Règles de numérotation incomplètes : %.', rules;
  end if;

  a := public.next_number('customer_invoice');
  b := public.next_number('customer_invoice');

  if a = b then
    raise exception 'Deux appels successifs ont produit le même numéro : %.', a;
  end if;

  if a !~ '^FAC-C-[0-9]{4}-[0-9]{6}$' then
    raise exception 'Format de numéro inattendu : %.', a;
  end if;

  raise notice '[OK] 8. Numérotation : % puis % (% règles).', a, b, rules;
end $$;


-- --- 9. Organisation de départ ------------------------------------------------
do $$
declare
  v_depts  int;
  v_groups int;
  v_links  int;
begin
  select count(*) into v_depts  from public.departments;
  select count(*) into v_groups from public.groups;
  select count(*) into v_links  from public.group_permissions;

  if v_depts < 5 then
    raise exception 'Départements ADIKOM manquants : %.', v_depts;
  end if;

  if v_groups < 6 then
    raise exception 'Groupes de départ manquants : %.', v_groups;
  end if;

  -- Aucun groupe de départ ne doit détenir la gestion des utilisateurs :
  -- elle reste réservée au Super Admin (Règles permissions §40 et §64).
  if exists (
    select 1
    from public.group_permissions gp
    join public.permissions p on p.id = gp.permission_id
    where gp.effect = 'ALLOW'
      and p.code in ('users.users.create', 'users.users.permissions.update',
                     'users.groups.permissions.update')
  ) then
    raise exception 'Un groupe de départ détient la gestion des utilisateurs.';
  end if;

  raise notice '[OK] 9. Organisation : % départements, % groupes, % attributions.',
    v_depts, v_groups, v_links;
end $$;


-- --- 10. Paramètres entreprise ------------------------------------------------
do $$
declare
  v_currency text;
  v_rounding text;
  blocked boolean := false;
begin
  select currency_code, rental_duration_rounding
    into v_currency, v_rounding
  from public.company_settings;

  if v_currency <> 'KMF' then
    raise exception 'Devise par défaut inattendue : %.', v_currency;
  end if;

  -- DEC-008 : aucune règle d'arrondi n'est inventée tant qu'ADIKOM n'a pas
  -- tranché. Le paramètre doit rester nul.
  if v_rounding is not null then
    raise exception 'Une règle d''arrondi a été fixée sans décision métier : %.', v_rounding;
  end if;

  -- La configuration ne se supprime pas.
  begin
    delete from public.company_settings;
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'La configuration d''entreprise a pu être supprimée.';
  end if;

  raise notice '[OK] 10. Paramètres : devise KMF, aucune règle métier inventée.';
end $$;


-- --- Synthèse -----------------------------------------------------------------
do $$
begin
  raise notice '';
  raise notice '===============================================';
  raise notice ' RECETTE DU SOCLE : TOUS LES CONTRÔLES PASSENT';
  raise notice '===============================================';
end $$;

-- Aucune donnée de recette ne subsiste en base.
rollback;
