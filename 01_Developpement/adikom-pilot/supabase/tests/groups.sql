-- =============================================================================
-- ADIKOM PILOT — Recette Groupes & Vue hiérarchique
-- Phase 4 — Organisation, LOT 14 (Module 08 §27 à §37, §52)
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur
-- ne peuvent garantir :
--
--   · l'ABSENCE de capacité nouvelle — le lot n'en crée aucune (DEC-024) ;
--   · les GARDES posées par la migration 060 : elles existent, sur les bonnes
--     tables, au bon moment ;
--   · la COHÉRENCE de la hiérarchie (§35) — elle ne boucle pas, et cette
--     règle-là ne s'efface ni pour une migration ni pour la clé de service ;
--   · l'ORGANIGRAMME (§35 à §37) — tout compte actif y figure exactement une
--     fois, un responsable désactivé ne fait disparaître personne, et une même
--     personne peut répondre de plusieurs départements (§36) ;
--   · les PROTECTIONS de suppression (§52) — groupe système, groupe peuplé ;
--   · le DÉCOMPTE des membres (§29) — refait, jamais stocké ;
--   · l'ABSENCE de ce que le lot ne fait pas : aucun effectif stocké, aucune
--     profondeur stockée, aucune famille de veille de plus.
--
-- Exécution :
--   npm run db:verify:groups
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne RLS
-- et les gardes de CAPACITÉ (`current_actor()` y est NULL). Il contrôle donc la
-- STRUCTURE, les RÈGLES et la COHÉRENCE ; l'effet des capacités — notamment
-- `users.groups.archive` face à `.update`, et l'escalade par le groupe —
-- s'éprouve avec de vraies sessions, dans `verify:groups`.
--
-- AUCUNE DATE EN DUR : le lot n'en manipule aucune, et les rares bornes se
-- posent sur `Indian/Comoro` (DEC-025 §e).
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_groupes (
  chef      uuid,   -- racine de la hiérarchie de recette
  adjoint   uuid,   -- rattaché au chef
  agent     uuid,   -- rattaché à l'adjoint
  orphelin  uuid,   -- son responsable sera désactivé
  parti     uuid,   -- compte non actif : hors du dessin
  groupe    uuid,
  groupe_sys uuid,
  dept_a    uuid,
  dept_b    uuid
) on commit drop;

insert into recette_groupes default values;


-- --- 1. AUCUNE CAPACITÉ N'EST CRÉÉE PAR CE LOT --------------------------------
--
-- Les six capacités du lot existent depuis la migration 007. En créer une
-- septième serait en créer une d'office, ce que DEC-024 interdit.
do $$
declare
  v_total int;
  v_lot   int;
begin
  select count(*)::int into v_total from public.permissions;

  if v_total <> 170 then
    raise exception 'Le catalogue compte % capacités, 170 attendues.', v_total;
  end if;

  select count(*)::int into v_lot
  from public.permissions
  where code in (
    'users.groups.view', 'users.groups.create', 'users.groups.update',
    'users.groups.archive', 'users.groups.permissions.update',
    'users.hierarchy.view'
  );

  if v_lot <> 6 then
    raise exception 'Les six capacités du lot ne sont pas toutes au catalogue (% trouvées).', v_lot;
  end if;

  -- Ce qui n'existe pas, et ne doit pas exister : le lot ne produit aucun
  -- document et n'ouvre aucun export.
  if exists (
    select 1 from public.permissions
    where code in ('users.groups.export', 'users.groups.download', 'users.groups.print',
                   'users.hierarchy.export', 'users.hierarchy.download',
                   'users.hierarchy.print', 'users.groups.members.update')
  ) then
    raise exception 'Une capacité a été créée pour une fonctionnalité que le lot ne livre pas.';
  end if;

  raise notice '[OK] 1. Catalogue à 170 : le lot n''en crée aucune, et ses six existent.';
end $$;


-- --- 2. LES GARDES DE LA MIGRATION 060 SONT EN PLACE --------------------------
do $$
declare
  v_missing text := '';
begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'groups' and t.tgname = 'groups_write_guard' and not t.tgisinternal
  ) then v_missing := v_missing || 'groups_write_guard '; end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'group_permissions'
      and t.tgname = 'group_permissions_no_self_change' and not t.tgisinternal
  ) then v_missing := v_missing || 'group_permissions_no_self_change '; end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'app_users' and t.tgname = 'app_users_no_manager_cycle'
      and not t.tgisinternal
  ) then v_missing := v_missing || 'app_users_no_manager_cycle '; end if;

  -- Les protections antérieures ne doivent pas avoir disparu.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'groups' and t.tgname = 'groups_protect_deletion' and not t.tgisinternal
  ) then v_missing := v_missing || 'groups_protect_deletion '; end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'user_groups' and t.tgname = 'user_groups_no_self_change'
      and not t.tgisinternal
  ) then v_missing := v_missing || 'user_groups_no_self_change '; end if;

  if v_missing <> '' then
    raise exception 'Garde(s) absente(s) : %', v_missing;
  end if;

  raise notice '[OK] 2. Les cinq gardes de gouvernance sont en place.';
end $$;


-- --- 3. LA HIÉRARCHIE NE BOUCLE PAS -------------------------------------------
--
-- Cette règle est une COHÉRENCE, pas un droit : elle vaut aussi pour la clé de
-- service. Un organigramme sans racine ne se dessine pas (DEC-036 §c).
do $$
declare
  v_chef    uuid := gen_random_uuid();
  v_adjoint uuid := gen_random_uuid();
  v_agent   uuid := gen_random_uuid();
  v_refuse  boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_chef,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'recette.chef@adikom.test', now(), now()),
    (v_adjoint, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'recette.adjoint@adikom.test', now(), now()),
    (v_agent,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'recette.agent@adikom.test', now(), now());

  insert into public.app_users (id, first_name, last_name, username, email, status, job_title)
  values
    (v_chef,    'Recette', 'AAA Chef',    'recette.grp.chef',    'recette.chef@adikom.test',
     'ACTIVE', 'Gérant de recette'),
    (v_adjoint, 'Recette', 'BBB Adjoint', 'recette.grp.adjoint', 'recette.adjoint@adikom.test',
     'ACTIVE', 'Assistant de recette'),
    (v_agent,   'Recette', 'CCC Agent',   'recette.grp.agent',   'recette.agent@adikom.test',
     'ACTIVE', 'Agent de recette');

  update recette_groupes set chef = v_chef, adjoint = v_adjoint, agent = v_agent;

  -- Chaîne légitime : chef ← adjoint ← agent.
  update public.app_users set manager_id = v_chef    where id = v_adjoint;
  update public.app_users set manager_id = v_adjoint where id = v_agent;

  -- 3a. Cycle de longueur 1 — la contrainte de la migration 002.
  v_refuse := false;
  begin
    update public.app_users set manager_id = v_chef where id = v_chef;
  exception when others then v_refuse := true;
  end;
  if not v_refuse then
    raise exception 'Un utilisateur a pu devenir son propre responsable.';
  end if;
  raise notice '[OK] 3a. Nul n''est son propre responsable.';

  -- 3b. Cycle de longueur 2 — ce que la migration 060 ferme.
  v_refuse := false;
  begin
    update public.app_users set manager_id = v_agent where id = v_chef;
  exception when others then v_refuse := true;
  end;
  if not v_refuse then
    raise exception 'Une hiérarchie circulaire a été acceptée : l''organigramme n''a plus de racine.';
  end if;
  raise notice '[OK] 3b. Une hiérarchie circulaire est refusée, même pour la clé de service.';
end $$;


-- --- 4. L'ORGANIGRAMME PORTE TOUT COMPTE ACTIF, EXACTEMENT UNE FOIS -----------
do $$
declare
  v_actifs   int;
  v_noeuds   int;
  v_distinct int;
  v_prof     int;
begin
  select count(*)::int into v_actifs from public.app_users where status = 'ACTIVE';
  select count(*)::int into v_noeuds from public.organisation_chart();
  select count(distinct id)::int into v_distinct from public.organisation_chart();

  if v_noeuds <> v_actifs then
    raise exception 'L''organigramme compte % nœuds pour % comptes actifs.', v_noeuds, v_actifs;
  end if;

  if v_distinct <> v_noeuds then
    raise exception 'Un collaborateur figure plusieurs fois à l''organigramme.';
  end if;

  -- La chaîne de recette a bien trois niveaux : chef → adjoint → agent.
  select depth into v_prof
  from public.organisation_chart()
  where id = (select agent from recette_groupes);

  if v_prof <> 3 then
    raise exception 'La profondeur de l''agent vaut %, 3 attendue.', v_prof;
  end if;

  raise notice '[OK] 4. Tout compte actif figure une fois, à sa profondeur réelle (% nœuds).', v_noeuds;
end $$;


-- --- 5. L'ORGANIGRAMME NE REND QUE LA STRUCTURE -------------------------------
--
-- `users.hierarchy.view` nomme la STRUCTURE. Elle n'ouvre ni l'email, ni le
-- téléphone, ni la dernière connexion : ceux-là relèvent de la fiche, et la
-- fiche a sa propre capacité (DEC-024).
do $$
declare
  v_noms     text[];
  v_interdit text;
begin
  select p.proargnames into v_noms
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'organisation_chart';

  if v_noms is null then
    raise exception 'La fonction `organisation_chart` est introuvable.';
  end if;

  select string_agg(nom, ', ') into v_interdit
  from unnest(v_noms) as nom
  where nom in ('email', 'phone', 'last_login_at', 'notes', 'username', 'hired_on', 'avatar_path');

  if v_interdit is not null then
    raise exception 'L''organigramme expose des données de fiche : %', v_interdit;
  end if;

  raise notice '[OK] 5. L''organigramme ne rend que la structure : ni email, ni téléphone, ni connexion.';
end $$;


-- --- 6. UN RESPONSABLE DÉSACTIVÉ NE FAIT DISPARAÎTRE PERSONNE -----------------
--
-- Le subordonné remonte à la racine, marqué `is_detached`. Le faire disparaître
-- avec son responsable serait la seule vraie erreur.
do $$
declare
  v_adjoint uuid := (select adjoint from recette_groupes);
  v_agent   uuid := (select agent   from recette_groupes);
  v_detache boolean;
  v_parent  uuid;
  v_prof    int;
begin
  update public.app_users
  set status = 'INACTIVE', deactivated_at = now()
  where id = v_adjoint;

  select is_detached, manager_id, depth into v_detache, v_parent, v_prof
  from public.organisation_chart()
  where id = v_agent;

  if v_detache is null then
    raise exception 'L''agent a disparu de l''organigramme avec son responsable désactivé.';
  end if;

  if not v_detache or v_parent is not null or v_prof <> 1 then
    raise exception 'L''agent n''a pas été rattaché à la racine : détaché=%, parent=%, profondeur=%',
      v_detache, v_parent, v_prof;
  end if;

  -- Et le compte désactivé, lui, n'est plus au dessin — mais il est COMPTÉ.
  if exists (select 1 from public.organisation_chart() where id = v_adjoint) then
    raise exception 'Un compte non actif figure à l''organigramme.';
  end if;

  if public.organisation_chart_excluded()
     <> (select count(*)::int from public.app_users where status <> 'ACTIVE')
  then
    raise exception 'Le décompte des comptes écartés ne correspond pas à la réalité.';
  end if;

  raise notice '[OK] 6. Responsable désactivé : le subordonné remonte à la racine, signalé et compté.';

  -- Remise en état pour la suite du script.
  update public.app_users set status = 'ACTIVE', deactivated_at = null where id = v_adjoint;
end $$;


-- --- 7. UNE PERSONNE PEUT RÉPONDRE DE PLUSIEURS DÉPARTEMENTS — §36 ------------
--
-- « Le système doit pouvoir représenter cette situation sans créer deux comptes
--   pour la même personne. »
do $$
declare
  v_chef  uuid := (select chef from recette_groupes);
  v_a     uuid;
  v_b     uuid;
  v_dept  text[];
  v_gere  text[];
begin
  select id into v_a from public.departments order by sort_order limit 1;
  select id into v_b from public.departments order by sort_order offset 1 limit 1;

  if v_a is null or v_b is null then
    raise exception 'Moins de deux départements en base : la règle §36 ne peut pas être éprouvée.';
  end if;

  update recette_groupes set dept_a = v_a, dept_b = v_b;

  insert into public.user_departments (user_id, department_id, is_manager, is_primary)
  values (v_chef, v_a, true, true),
         (v_chef, v_b, true, false);

  select departments, managed into v_dept, v_gere
  from public.organisation_chart()
  where id = v_chef;

  if array_length(v_dept, 1) <> 2 then
    raise exception 'Les deux rattachements ne sont pas restitués (%).', v_dept;
  end if;

  if array_length(v_gere, 1) <> 2 then
    raise exception 'Les deux responsabilités ne sont pas restituées (%).', v_gere;
  end if;

  -- Un seul compte, deux départements : c'est exactement ce que §36 exige.
  if (select count(*)::int from public.app_users where username = 'recette.grp.chef') <> 1 then
    raise exception 'Un second compte a été créé pour porter la seconde responsabilité.';
  end if;

  raise notice '[OK] 7. Un compte, deux départements dirigés : §36 tenue.';
end $$;


-- --- 8. APPARTENIR N'EST PAS DIRIGER ------------------------------------------
do $$
declare
  v_agent uuid := (select agent from recette_groupes);
  v_a     uuid := (select dept_a from recette_groupes);
  v_gere  text[];
  v_dept  text[];
begin
  insert into public.user_departments (user_id, department_id, is_manager, is_primary)
  values (v_agent, v_a, false, true);

  select departments, managed into v_dept, v_gere
  from public.organisation_chart()
  where id = v_agent;

  if array_length(v_dept, 1) <> 1 then
    raise exception 'Le rattachement de l''agent n''est pas restitué.';
  end if;

  if coalesce(array_length(v_gere, 1), 0) <> 0 then
    raise exception 'Un simple rattachement a été présenté comme une responsabilité.';
  end if;

  raise notice '[OK] 8. Un rattachement sans responsabilité reste un rattachement.';
end $$;


-- --- 9. LE DÉCOMPTE DES MEMBRES EST REFAIT, JAMAIS STOCKÉ — §29 ---------------
do $$
declare
  v_groupe uuid;
  v_chef   uuid := (select chef from recette_groupes);
  v_agent  uuid := (select agent from recette_groupes);
  v_total  int;
  v_actifs int;
begin
  -- Aucune colonne d'effectif ne doit exister : un compteur tenu à part serait
  -- faux au premier oubli (DEC-034 §a).
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'groups'
      and column_name in ('member_count', 'members_count', 'effectif', 'permission_count')
  ) then
    raise exception 'Un effectif est stocké sur `groups` : il finira par mentir.';
  end if;

  insert into public.groups (code, name, description)
  values ('RECETTE_LOT14', 'Groupe de recette LOT 14', 'Supprimé en fin de recette')
  returning id into v_groupe;

  update recette_groupes set groupe = v_groupe;

  select member_count, active_count into v_total, v_actifs
  from public.groups_member_counts() where group_id = v_groupe;

  if v_total <> 0 or v_actifs <> 0 then
    raise exception 'Un groupe neuf compte % membres.', v_total;
  end if;

  insert into public.user_groups (user_id, group_id) values (v_chef, v_groupe), (v_agent, v_groupe);
  update public.app_users set status = 'SUSPENDED', deactivated_at = now() where id = v_agent;

  select member_count, active_count into v_total, v_actifs
  from public.groups_member_counts() where group_id = v_groupe;

  if v_total <> 2 then
    raise exception 'Le groupe devrait compter 2 membres, il en compte %.', v_total;
  end if;

  if v_actifs <> 1 then
    raise exception 'Le groupe devrait compter 1 membre actif, il en compte %.', v_actifs;
  end if;

  raise notice '[OK] 9. Le décompte suit la réalité : 2 membres, dont 1 actif.';

  update public.app_users set status = 'ACTIVE', deactivated_at = null where id = v_agent;
end $$;


-- --- 10. UN GROUPE PEUPLÉ NE SE SUPPRIME PAS — §52 ---------------------------
do $$
declare
  v_groupe uuid := (select groupe from recette_groupes);
  v_refuse boolean := false;
  v_motif  text;
begin
  begin
    delete from public.groups where id = v_groupe;
  exception when others then
    v_refuse := true;
    v_motif  := sqlerrm;
  end;

  if not v_refuse then
    raise exception 'Un groupe comptant des membres a été supprimé sans contrôle.';
  end if;

  -- Le refus doit venir de la RÈGLE MÉTIER, pas de la clé étrangère : le
  -- message parvient jusqu'à l'utilisateur (CLAUDE.md §43).
  if v_motif not like '%utilisateur(s) et ne peut pas être supprimé%' then
    raise exception 'Le refus ne vient pas de la règle métier : %', v_motif;
  end if;

  raise notice '[OK] 10. Un groupe comptant des membres ne se supprime pas, et le dit.';
end $$;


-- --- 11. UN GROUPE SYSTÈME NE SE SUPPRIME PAS — §52 --------------------------
do $$
declare
  v_sys    uuid;
  v_refuse boolean := false;
begin
  insert into public.groups (code, name, is_system)
  values ('RECETTE_SYSTEME_LOT14', 'Groupe système de recette', true)
  returning id into v_sys;

  update recette_groupes set groupe_sys = v_sys;

  begin
    delete from public.groups where id = v_sys;
  exception when others then v_refuse := true;
  end;

  if not v_refuse then
    raise exception 'Un groupe système a été supprimé.';
  end if;

  raise notice '[OK] 11. Un groupe système ne se supprime pas : il se désactive.';
end $$;


-- --- 12. UN GROUPE VIDE ET ORDINAIRE SE SUPPRIME ------------------------------
--
-- La protection du §52 ne doit pas tout bloquer : ce qui n'est utilisé par
-- personne se retire.
do $$
declare
  v_vide uuid;
begin
  insert into public.groups (code, name) values ('RECETTE_VIDE_LOT14', 'Groupe vide de recette')
  returning id into v_vide;

  delete from public.groups where id = v_vide;

  if exists (select 1 from public.groups where id = v_vide) then
    raise exception 'Un groupe vide et ordinaire n''a pas pu être supprimé.';
  end if;

  raise notice '[OK] 12. Un groupe vide et ordinaire se supprime.';
end $$;


-- --- 13. UN GROUPE DÉSACTIVÉ CESSE D'ACCORDER, SANS RIEN PERDRE ---------------
--
-- C'est la doctrine du LOT 12 — ranger n'est pas effacer — appliquée aux
-- droits : les règles restent en base, elles ne s'appliquent plus.
do $$
declare
  v_groupe uuid := (select groupe from recette_groupes);
  v_chef   uuid := (select chef from recette_groupes);
  v_perm   uuid;
  v_regles int;
begin
  select id into v_perm from public.permissions where code = 'parties.clients.view';

  insert into public.group_permissions (group_id, permission_id, effect)
  values (v_groupe, v_perm, 'ALLOW');

  if not public.has_permission('parties.clients.view', v_chef) then
    raise exception 'Un groupe actif n''a pas transmis sa permission.';
  end if;

  update public.groups set is_active = false where id = v_groupe;

  if public.has_permission('parties.clients.view', v_chef) then
    raise exception 'Un groupe désactivé continue de transmettre ses permissions.';
  end if;

  select count(*)::int into v_regles
  from public.group_permissions where group_id = v_groupe;

  if v_regles <> 1 then
    raise exception 'La désactivation a effacé les règles du groupe (% restantes).', v_regles;
  end if;

  update public.groups set is_active = true where id = v_groupe;

  if not public.has_permission('parties.clients.view', v_chef) then
    raise exception 'La réactivation n''a pas rétabli les permissions du groupe.';
  end if;

  raise notice '[OK] 13. Désactiver un groupe suspend ses droits sans perdre ses règles.';
end $$;


-- --- 14. LE REFUS DE GROUPE PRIME — DEC-009 ----------------------------------
do $$
declare
  v_groupe uuid := (select groupe from recette_groupes);
  v_chef   uuid := (select chef from recette_groupes);
  v_autre  uuid;
  v_perm   uuid;
begin
  select id into v_perm from public.permissions where code = 'parties.clients.view';

  -- Une autorisation INDIVIDUELLE, puis un refus de groupe : le refus gagne.
  insert into public.user_permissions (user_id, permission_id, effect)
  values (v_chef, v_perm, 'ALLOW');

  update public.group_permissions set effect = 'DENY'
  where group_id = v_groupe and permission_id = v_perm;

  if public.has_permission('parties.clients.view', v_chef) then
    raise exception 'Une autorisation individuelle a survécu à un refus de groupe.';
  end if;

  raise notice '[OK] 14. Un refus de groupe prime sur une autorisation individuelle (DEC-009).';

  -- Deux groupes qui se contredisent : le refus gagne encore.
  insert into public.groups (code, name) values ('RECETTE_AUTRE_LOT14', 'Second groupe de recette')
  returning id into v_autre;

  insert into public.group_permissions (group_id, permission_id, effect)
  values (v_autre, v_perm, 'ALLOW');
  insert into public.user_groups (user_id, group_id) values (v_chef, v_autre);

  if public.has_permission('parties.clients.view', v_chef) then
    raise exception 'Une autorisation d''un second groupe a effacé le refus du premier.';
  end if;

  raise notice '[OK] 14b. Entre deux groupes contradictoires, le refus l''emporte.';

  delete from public.user_permissions where user_id = v_chef and permission_id = v_perm;
end $$;


-- --- 15. AUCUNE FAMILLE DE VEILLE N'EST AJOUTÉE -------------------------------
--
-- Le Module 08 §53 cite des notifications de gouvernance — utilisateur créé,
-- permission modifiée. Ce sont des ÉVÉNEMENTS DE CRÉATION, et ils relèvent de
-- l'arbitrage ouvert par DEC-033 §h. Le lot n'en invente aucun.
do $$
declare
  v_source text;
begin
  select pg_get_functiondef(p.oid) into v_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'notifications_watch';

  if v_source is null then
    raise exception 'La fonction `notifications_watch` est introuvable.';
  end if;

  -- Aucune source de gouvernance n'a été greffée sur la veille.
  if v_source ~* '(from|join)\s+public\.(groups|user_groups|group_permissions|user_permissions)\b'
     or v_source ~* 'organisation_chart'
  then
    raise exception 'La veille s''est mise à surveiller la gouvernance des accès : c''est un arbitrage ouvert (DEC-033 §h), pas une déduction.';
  end if;

  raise notice '[OK] 15. La veille ignore la gouvernance : aucun événement de création inventé.';
end $$;


-- --- 16. LE JOURNAL D'AUDIT SUIT LA GOUVERNANCE — §54 ------------------------
do $$
declare
  v_groupe uuid := (select groupe from recette_groupes);
  v_lignes int;
begin
  select count(*)::int into v_lignes
  from public.audit_log
  where entity_type in ('groups', 'group_permissions', 'user_groups')
    and entity_id = v_groupe::text;

  if v_lignes = 0 then
    raise exception 'Aucune trace d''audit pour un groupe créé, modifié et configuré.';
  end if;

  raise notice '[OK] 16. Les mouvements du groupe sont journalisés (% ligne(s)).', v_lignes;
end $$;


-- --- 17. LES AUTRES MODULES SONT INTACTS --------------------------------------
do $$
declare
  v_rentals  int;
  v_invoices int;
  v_entries  int;
  v_clients  int;
begin
  select count(*)::int into v_rentals  from public.rentals           where status = 'IN_PROGRESS';
  select count(*)::int into v_invoices from public.customer_invoices where status = 'ISSUED';
  select count(*)::int into v_entries  from public.treasury_entries;
  select count(*)::int into v_clients  from public.clients;

  perform count(*) from public.organisation_chart();
  perform count(*) from public.groups_member_counts();

  if (select count(*)::int from public.rentals where status = 'IN_PROGRESS') <> v_rentals
     or (select count(*)::int from public.customer_invoices where status = 'ISSUED') <> v_invoices
     or (select count(*)::int from public.treasury_entries) <> v_entries
     or (select count(*)::int from public.clients) <> v_clients
  then
    raise exception 'La gouvernance des accès a modifié un autre module.';
  end if;

  raise notice '[OK] 17. Location, facturation, trésorerie et tiers : intacts.';
end $$;


rollback;

-- =============================================================================
-- Transaction annulée : aucune donnée de recette ne subsiste.
-- =============================================================================
