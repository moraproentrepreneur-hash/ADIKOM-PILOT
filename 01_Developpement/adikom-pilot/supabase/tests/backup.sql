-- =============================================================================
-- ADIKOM PILOT — Recette Sauvegarde, réinitialisation, restauration (LOT 18)
--
-- Vérifie ce que la BASE doit porter seule : le périmètre, les droits
-- d'exécution, le refus d'un fichier invalide, la fidélité de l'aller-retour,
-- et surtout — LA GARANTIE CENTRALE DU LOT — que ni la réinitialisation ni la
-- restauration n'atteignent un compte utilisateur.
--
-- Exécution :
--   npm run db:verify:backup
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne RLS
-- et les gardes de capacité (`current_actor()` y est NULL). Il contrôle donc le
-- SCHÉMA et les RÈGLES ; le statut de Super Admin et les refus par l'interface
-- sont éprouvés avec de vraies sessions par `verify:backup`.
--
-- IL RÉINITIALISE ET RESTAURE POUR DE VRAI — PUIS ANNULE TOUT.
--
-- Une recette qui se contenterait de lire les définitions ne dirait rien de ce
-- qui compte. Celle-ci exécute réellement les trois opérations, à l'intérieur
-- d'une transaction terminée par `rollback` : la base retrouve exactement son
-- état de départ, et le contrôle final le VÉRIFIE plutôt que de le promettre.
-- =============================================================================

begin;

create temporary table recette_sauvegarde (
  admin_id   uuid,
  autre_id   uuid,
  avant      jsonb,
  sauvegarde jsonb
) on commit drop;

-- La ligne unique qui porte l'état de la recette d'un bloc à l'autre. Sans
-- elle, les `update` suivants ne toucheraient rien et chaque lecture rendrait
-- NULL — un échec parfaitement crédible, et parfaitement trompeur.
insert into recette_sauvegarde values (null, null, null, null);


-- --- 1. Les fonctions existent, et aucune n'est SECURITY DEFINER -------------
do $$
declare
  v_missing text[];
  v_definer text[];
begin
  select array_agg(f) into v_missing
  from unnest(array[
    'is_restoring', 'backup_scope', 'backup_columns', 'assert_backup_operator',
    'admin_backup_export', 'admin_reset_business_data', 'admin_restore_backup',
    'restore_configuration'
  ]) f
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f
  );

  if v_missing is not null then
    raise exception 'Fonctions manquantes : %', v_missing;
  end if;

  /*
   * DEC-022 : aucune fonction de ce lot ne s'exécute avec les droits de son
   * propriétaire. Elles n'en ont pas besoin — elles sont appelées par la clé de
   * service, qui a déjà tous les droits, et ne doivent RIEN accorder de plus à
   * qui les appellerait autrement.
   */
  select array_agg(p.proname) into v_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.proname in (
      'is_restoring', 'backup_scope', 'backup_columns', 'assert_backup_operator',
      'admin_backup_export', 'admin_reset_business_data', 'admin_restore_backup',
      'restore_configuration'
    );

  if v_definer is not null then
    raise exception 'SECURITY DEFINER interdit sur : % (DEC-022).', v_definer;
  end if;

  raise notice '[OK] 1. Les huit fonctions existent, aucune en SECURITY DEFINER.';
end $$;


-- --- 2. Aucun utilisateur authentifié ne peut les exécuter -------------------
do $$
declare
  v_open text[];
begin
  select array_agg(p.proname || ' → ' || r.rolname) into v_open
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated'), ('public')) as r(rolname)
  where n.nspname = 'public'
    and p.proname in (
      'admin_backup_export', 'admin_reset_business_data', 'admin_restore_backup',
      'restore_configuration', 'backup_scope', 'backup_columns', 'assert_backup_operator'
    )
    and has_function_privilege(
      case when r.rolname = 'public' then 'public' else r.rolname end,
      p.oid, 'EXECUTE'
    );

  if v_open is not null then
    raise exception
      'Ces fonctions sont atteignables par un appel direct : %. L''EXECUTE doit être réservé au rôle de service.',
      v_open;
  end if;

  if not has_function_privilege('service_role',
       'public.admin_backup_export(uuid)'::regprocedure, 'EXECUTE') then
    raise exception 'Le rôle de service ne peut pas produire de sauvegarde.';
  end if;

  raise notice '[OK] 2. EXECUTE retiré à anon, authenticated et PUBLIC ; conservé au rôle de service.';
end $$;


-- --- 3. Le périmètre ne contient RIEN qui touche aux comptes -----------------
do $$
declare
  v_scope    text[] := public.backup_scope();
  v_interdit text[];
  v_absentes text[];
begin
  /*
   * LA GARANTIE CENTRALE DU LOT, VÉRIFIÉE PLUTÔT QUE PROMISE.
   *
   * Si `app_users` entrait un jour dans ce tableau, la réinitialisation
   * supprimerait le Super Admin et la restauration le remplacerait. Aucune
   * relecture de code ne rattraperait l'erreur aussi sûrement que ce contrôle.
   */
  select array_agg(t) into v_interdit
  from unnest(array[
    'app_users', 'user_groups', 'user_permissions', 'user_departments',
    'permissions', 'groups', 'group_permissions', 'departments',
    'company_settings', 'numbering_rules', 'audit_log'
  ]) t
  where t = any (v_scope);

  if v_interdit is not null then
    raise exception
      'Périmètre de sauvegarde invalide : % ne doit jamais y figurer.', v_interdit;
  end if;

  select array_agg(t) into v_absentes
  from unnest(v_scope) t
  where not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = t
  );

  if v_absentes is not null then
    raise exception 'Tables du périmètre introuvables : %', v_absentes;
  end if;

  if array_length(v_scope, 1) < 40 then
    raise exception 'Périmètre anormalement court : % tables.', array_length(v_scope, 1);
  end if;

  raise notice
    '[OK] 3. Périmètre de % tables métier ; ni comptes, ni permissions, ni journal.',
    array_length(v_scope, 1);
end $$;


-- --- 4. `TRUNCATE` retiré à `authenticated` sur tout le périmètre ------------
do $$
declare v_open text[];
begin
  -- `TRUNCATE` ne déclenche aucun déclencheur de ligne : il contournerait
  -- `fn_forbid_delete` sur toutes les tables métier (DEC-039 §g).
  select array_agg(t) into v_open
  from unnest(public.backup_scope()) t
  where has_table_privilege('authenticated', 'public.' || quote_ident(t), 'TRUNCATE');

  if v_open is not null then
    raise exception 'TRUNCATE encore accordé à authenticated sur : %', v_open;
  end if;

  raise notice '[OK] 4. TRUNCATE retiré à authenticated sur les % tables du périmètre.',
    array_length(public.backup_scope(), 1);
end $$;


-- --- 5. L'auteur doit être un Super Admin ACTIF ------------------------------
do $$
declare
  v_admin uuid;
  v_autre uuid;
  v_ok    boolean;
begin
  select id into v_admin
  from public.app_users where is_super_admin and status = 'ACTIVE' limit 1;

  if v_admin is null then
    raise exception 'Aucun Super Admin actif : la recette ne peut pas s''exécuter.';
  end if;

  select id into v_autre
  from public.app_users where not is_super_admin limit 1;

  update recette_sauvegarde set admin_id = v_admin, autre_id = v_autre;

  -- Un identifiant inconnu.
  v_ok := false;
  begin
    perform public.assert_backup_operator(gen_random_uuid());
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'Un identifiant inconnu a été accepté comme auteur.'; end if;

  -- NULL.
  v_ok := false;
  begin
    perform public.assert_backup_operator(null);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'Un auteur NULL a été accepté.'; end if;

  -- Un utilisateur ordinaire.
  if v_autre is not null then
    v_ok := false;
    begin
      perform public.assert_backup_operator(v_autre);
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then
      raise exception 'Un utilisateur non Super Admin a été accepté comme auteur.';
    end if;
  end if;

  -- Le Super Admin actif, lui, passe.
  perform public.assert_backup_operator(v_admin);

  raise notice '[OK] 5. Seul un Super Admin ACTIF est accepté comme auteur des trois opérations.';
end $$;


-- --- 6. La réinitialisation exige sa confirmation ----------------------------
do $$
declare
  v_admin uuid := (select admin_id from recette_sauvegarde);
  v_ok    boolean := false;
begin
  begin
    perform public.admin_reset_business_data(v_admin, 'oui');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'La réinitialisation s''est exécutée sans confirmation.'; end if;

  v_ok := false;
  begin
    perform public.admin_reset_business_data(v_admin, null);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'La réinitialisation s''est exécutée avec une confirmation nulle.'; end if;

  raise notice '[OK] 6. La réinitialisation exige le mot exact, en base et non seulement à l''écran.';
end $$;


-- --- 7. La sauvegarde : forme, version, contenu ------------------------------
do $$
declare
  v_admin  uuid := (select admin_id from recette_sauvegarde);
  v_backup jsonb;
  v_avant  jsonb := '{}'::jsonb;
  v_table  text;
  v_count  bigint;
  v_fuite  text[];
begin
  foreach v_table in array public.backup_scope() loop
    execute format('select count(*) from public.%I', v_table) into v_count;
    v_avant := v_avant || jsonb_build_object(v_table, v_count);
  end loop;

  v_backup := public.admin_backup_export(v_admin);

  if v_backup ->> 'format' <> 'adikom-pilot.sauvegarde' then
    raise exception 'Format de sauvegarde inattendu : %', v_backup ->> 'format';
  end if;

  if (v_backup ->> 'version')::int <> 1 then
    raise exception 'Version de format inattendue : %', v_backup ->> 'version';
  end if;

  if v_backup -> 'created_at' is null or v_backup -> 'donnees' is null then
    raise exception 'Sauvegarde incomplète : date ou données absentes.';
  end if;

  -- Aucune fuite de compte, de permission ni de journal dans le fichier.
  select array_agg(k) into v_fuite
  from unnest(array['app_users', 'permissions', 'audit_log', 'groups', 'user_permissions']) k
  where v_backup -> 'donnees' ? k;

  if v_fuite is not null then
    raise exception 'La sauvegarde expose des données hors périmètre : %', v_fuite;
  end if;

  update recette_sauvegarde set avant = v_avant, sauvegarde = v_backup;

  raise notice '[OK] 7. Sauvegarde produite : format versionné, datée, % ligne(s), sans aucun compte.',
    v_backup ->> 'total_lignes';
end $$;


-- --- 8. Un fichier invalide est refusé, et il l'est POUR SA RAISON -----------
do $$
declare
  v_admin uuid := (select admin_id from recette_sauvegarde);
  v_ok    boolean;
begin
  -- a. Pas un objet.
  v_ok := false;
  begin perform public.admin_restore_backup(v_admin, '[]'::jsonb);
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'Un tableau JSON a été accepté comme sauvegarde.'; end if;

  -- b. Format étranger.
  v_ok := false;
  begin perform public.admin_restore_backup(v_admin,
    jsonb_build_object('format', 'autre-produit', 'version', 1, 'donnees', '{}'::jsonb));
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'Un fichier d''un autre produit a été accepté.'; end if;

  -- c. Version postérieure à ce que le système sait lire.
  v_ok := false;
  begin perform public.admin_restore_backup(v_admin,
    jsonb_build_object('format', 'adikom-pilot.sauvegarde', 'version', 9, 'donnees', '{}'::jsonb));
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'Une sauvegarde en version 9 a été acceptée.'; end if;

  -- d. Version absente.
  v_ok := false;
  begin perform public.admin_restore_backup(v_admin,
    jsonb_build_object('format', 'adikom-pilot.sauvegarde', 'donnees', '{}'::jsonb));
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'Une sauvegarde sans version a été acceptée.'; end if;

  -- e. Section « donnees » absente.
  v_ok := false;
  begin perform public.admin_restore_backup(v_admin,
    jsonb_build_object('format', 'adikom-pilot.sauvegarde', 'version', 1));
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'Une sauvegarde sans données a été acceptée.'; end if;

  raise notice '[OK] 8. Enveloppe invalide refusée : tableau, format étranger, version future, version absente, données absentes.';
end $$;


-- --- 9. UN FICHIER QUI VISE LES COMPTES EST REFUSÉ ---------------------------
do $$
declare
  v_admin uuid := (select admin_id from recette_sauvegarde);
  v_ok    boolean;
  v_cible text;
begin
  /*
   * LE SCÉNARIO D'ATTAQUE QUE CE LOT DOIT FERMER.
   *
   * Un fichier fabriqué qui contiendrait `app_users` pourrait, s'il était
   * accepté, remplacer le Super Admin — ou en ajouter un. Le périmètre est donc
   * une LISTE BLANCHE : tout ce qui n'y figure pas vaut refus, et non silence.
   */
  foreach v_cible in array array['app_users', 'permissions', 'group_permissions', 'audit_log']
  loop
    v_ok := false;
    begin
      perform public.admin_restore_backup(v_admin, jsonb_build_object(
        'format', 'adikom-pilot.sauvegarde',
        'version', 1,
        'donnees', jsonb_build_object(v_cible, jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid())
        ))
      ));
    exception when check_violation then v_ok := true;
    end;

    if not v_ok then
      raise exception 'Un fichier visant « % » a été accepté.', v_cible;
    end if;
  end loop;

  -- Une table du périmètre dont la valeur n'est pas un tableau.
  v_ok := false;
  begin
    perform public.admin_restore_backup(v_admin, jsonb_build_object(
      'format', 'adikom-pilot.sauvegarde', 'version', 1,
      'donnees', jsonb_build_object('clients', 'beaucoup')
    ));
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'Une section « clients » non tabulaire a été acceptée.'; end if;

  raise notice '[OK] 9. Refus d''un fichier visant app_users, permissions, group_permissions ou le journal.';
end $$;


-- --- 10. La réinitialisation vide le métier et ÉPARGNE tout le reste ---------
do $$
declare
  v_admin       uuid := (select admin_id from recette_sauvegarde);
  v_users       int  := (select count(*) from public.app_users);
  v_supers      int  := (select count(*) from public.app_users where is_super_admin);
  v_perms       int  := (select count(*) from public.permissions);
  v_groups      int  := (select count(*) from public.groups);
  v_grants      int  := (select count(*) from public.group_permissions);
  v_depts       int  := (select count(*) from public.departments);
  v_settings    int  := (select count(*) from public.company_settings);
  v_rules       int  := (select count(*) from public.numbering_rules);
  v_journal     bigint := (select count(*) from public.audit_log);
  v_result      jsonb;
  v_table       text;
  v_reste       bigint;
  v_non_vides   text[];
begin
  v_result := public.admin_reset_business_data(v_admin, 'REINITIALISER');

  -- Chaque table du périmètre est vide.
  foreach v_table in array public.backup_scope() loop
    execute format('select count(*) from public.%I', v_table) into v_reste;
    if v_reste > 0 then
      v_non_vides := coalesce(v_non_vides, '{}') || v_table;
    end if;
  end loop;

  if v_non_vides is not null then
    raise exception 'Réinitialisation incomplète : % non vidée(s).', v_non_vides;
  end if;

  -- ET RIEN D'AUTRE N'A BOUGÉ.
  if (select count(*) from public.app_users) <> v_users then
    raise exception 'La réinitialisation a touché aux comptes utilisateurs.';
  end if;
  if (select count(*) from public.app_users where is_super_admin) <> v_supers then
    raise exception 'LA RÉINITIALISATION A TOUCHÉ AU SUPER ADMIN.';
  end if;
  if (select count(*) from public.permissions) <> v_perms then
    raise exception 'La réinitialisation a touché au catalogue des permissions.';
  end if;
  if (select count(*) from public.groups) <> v_groups
     or (select count(*) from public.group_permissions) <> v_grants
     or (select count(*) from public.departments) <> v_depts then
    raise exception 'La réinitialisation a touché aux groupes ou aux départements.';
  end if;
  if (select count(*) from public.company_settings) <> v_settings
     or (select count(*) from public.numbering_rules) <> v_rules then
    raise exception 'La réinitialisation a touché à la configuration.';
  end if;
  if (select count(*) from public.audit_log) < v_journal then
    raise exception 'La réinitialisation a effacé des lignes du journal.';
  end if;

  -- Elle s'est journalisée elle-même, au nom de son auteur.
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'backup' and action = 'DELETE' and actor_id = v_admin
  ) then
    raise exception 'La réinitialisation n''a pas été journalisée.';
  end if;

  raise notice
    '[OK] 10. Réinitialisation : % ligne(s) supprimée(s) ; comptes (% dont % Super Admin), % permissions, % groupes, configuration et journal intacts.',
    v_result ->> 'total_supprime', v_users, v_supers, v_perms, v_groups;
end $$;


-- --- 11. La restauration rétablit EXACTEMENT ce qui a été sauvegardé ---------
do $$
declare
  v_admin  uuid   := (select admin_id from recette_sauvegarde);
  v_backup jsonb  := (select sauvegarde from recette_sauvegarde);
  v_avant  jsonb  := (select avant from recette_sauvegarde);
  v_apres  jsonb  := '{}'::jsonb;
  v_users  int    := (select count(*) from public.app_users);
  v_supers int    := (select count(*) from public.app_users where is_super_admin);
  v_result jsonb;
  v_table  text;
  v_count  bigint;
begin
  v_result := public.admin_restore_backup(v_admin, v_backup);

  foreach v_table in array public.backup_scope() loop
    execute format('select count(*) from public.%I', v_table) into v_count;
    v_apres := v_apres || jsonb_build_object(v_table, v_count);
  end loop;

  if v_avant <> v_apres then
    raise exception
      'Aller-retour infidèle. Avant : %. Après : %.', v_avant, v_apres;
  end if;

  if (select count(*) from public.app_users) <> v_users
     or (select count(*) from public.app_users where is_super_admin) <> v_supers then
    raise exception 'LA RESTAURATION A TOUCHÉ AUX COMPTES.';
  end if;

  if not exists (
    select 1 from public.audit_log
    where entity_type = 'backup' and action = 'RESTORE' and actor_id = v_admin
  ) then
    raise exception 'La restauration n''a pas été journalisée.';
  end if;

  raise notice
    '[OK] 11. Restauration fidèle : % ligne(s) rétablies, table par table, comptes inchangés.',
    v_result ->> 'total_restaure';
end $$;


-- --- 12. Le contexte de restauration est refermé -----------------------------
do $$
begin
  /*
   * `is_restoring()` n'est vrai QUE pendant `admin_restore_backup`, et
   * seulement là. `set_config(..., true)` le rattache à la transaction : hors
   * de la fonction, il est retombé. S'il restait vrai, les gardes de cycle de
   * vie seraient levées pour toute la suite de la session.
   */
  if public.is_restoring() then
    raise exception 'Le contexte de restauration est resté ouvert après l''opération.';
  end if;

  raise notice '[OK] 12. Le contexte de restauration est refermé : les gardes de cycle de vie sont rétablies.';
end $$;


-- --- 13. Les gardes de cycle de vie refusent toujours, hors restauration -----
do $$
declare
  v_client uuid;
  v_ok     boolean := false;
begin
  select id into v_client from public.clients limit 1;

  if v_client is null then
    raise notice '[OK] 13. Aucun client en base : contrôle non applicable.';
    return;
  end if;

  -- Une facture client ne naît pas émise (§25). La restauration lève cette
  -- règle ; une écriture ordinaire, jamais.
  begin
    insert into public.customer_invoices (
      invoice_no, client_id, invoice_date, status
    ) values (
      'RECETTE-SAUV-' || substr(gen_random_uuid()::text, 1, 8),
      v_client, current_date, 'ISSUED'
    );
  exception when check_violation then v_ok := true;
  end;

  if not v_ok then
    raise exception
      'Une facture a pu naître ÉMISE hors restauration : la garde de cycle de vie est levée en permanence.';
  end if;

  raise notice '[OK] 13. Hors restauration, une facture ne naît toujours pas émise.';
end $$;


-- --- 14. Le compteur de numérotation ne recule jamais ------------------------
do $$
declare
  v_admin   uuid := (select admin_id from recette_sauvegarde);
  v_avant   bigint;
  v_apres   bigint;
begin
  select current_value into v_avant from public.numbering_rules where entity_key = 'client';

  -- Une configuration sauvegardée avec un compteur PLUS BAS ne doit pas le
  -- faire reculer : « un numéro déjà émis ne se réutilise jamais » (§16).
  perform public.restore_configuration(jsonb_build_object(
    'numbering_rules', jsonb_build_array(
      jsonb_build_object(
        'entity_key', 'client', 'label', 'Client', 'prefix', 'CLI',
        'include_year', false, 'padding', 6, 'separator', '-',
        'reset_yearly', false, 'current_value', 0, 'current_year', null
      )
    )
  ));

  select current_value into v_apres from public.numbering_rules where entity_key = 'client';

  if v_apres < v_avant then
    raise exception
      'Le compteur « client » a reculé de % à % : un numéro pourrait être réutilisé (§16).',
      v_avant, v_apres;
  end if;

  raise notice '[OK] 14. Le compteur de numérotation ne recule pas à la restauration (% conservé).', v_apres;
end $$;


-- --- 15. Le catalogue des permissions est intact -----------------------------
do $$
declare v_total int;
begin
  -- LE CONTRÔLE PORTE SUR DES CODES, PAS SUR UN TOTAL (DEC-046) : ce que la
  -- restauration ne doit pas avoir touché se nomme.
  --
  -- AUCUNE permission n'a été créée par ce lot (DEC-041) : la sauvegarde suit
  -- le STATUT de Super Admin, pas une capacité attribuable.
  if exists (select 1 from public.permissions where code like 'settings.backup%') then
    raise exception
      'Une permission de sauvegarde a été créée : elle ne serait jamais attribuable (CLAUDE.md §19 bis).';
  end if;

  /*
   * Le catalogue est HORS PÉRIMÈTRE de sauvegarde : ni l'export, ni la
   * réinitialisation, ni la restauration ne l'atteignent. La preuve ne demande
   * donc aucun nombre — elle demande que les capacités les plus sensibles du
   * SaaS soient encore là après les deux opérations exécutées ci-dessus.
   */
  select count(*) into v_total
  from public.permissions
  where code in (
    'users.users.create', 'users.users.permissions.update',
    'users.groups.permissions.update', 'users.users.password.reset',
    'billing.imputations.validate', 'billing.supplier_payments.create',
    'users.audit.view'
  );

  if v_total <> 7 then
    raise exception
      'Le catalogue a été altéré par la sauvegarde ou la restauration : % capacités sensibles sur 7 retrouvées.',
      v_total;
  end if;

  raise notice '[OK] 15. Catalogue intact après réinitialisation et restauration, aucune capacité de sauvegarde créée.';
end $$;


rollback;

-- =============================================================================
-- La transaction est annulée : la réinitialisation et la restauration exécutées
-- ci-dessus n'ont laissé aucune trace. C'est ce qui permet à cette recette
-- d'éprouver des opérations destructrices sur la base réelle.
-- =============================================================================
