-- =============================================================================
-- ADIKOM PILOT — 060 · Groupes & Vue hiérarchique
-- Phase 4 — Organisation, LOT 14 (Module 08 §27 à §37, §52)
--
-- CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS
--
-- Elle ne crée AUCUNE table et AUCUNE capacité.
--
-- Les tables existent depuis la migration 002 (`groups`, `user_groups`) et 003
-- (`group_permissions`) ; les six capacités du lot existent depuis la 007 —
-- `users.groups.view`, `.create`, `.update`, `.archive`,
-- `users.groups.permissions.update`, `users.hierarchy.view`. Le catalogue reste
-- à 170 (DEC-024 : une permission ne se crée que si la fonctionnalité
-- correspondante n'est couverte par aucune existante).
--
-- Ce que le lot livre en base, c'est ce que les écrans supposent et que la base
-- ne tenait pas encore :
--
--   1. DEUX DÉFAUTS DE SÉCURITÉ, découverts en préparant les écrans :
--      · `group_permissions` échappait à la protection contre l'auto-attribution
--        de droits — un membre d'un groupe pouvait s'accorder n'importe quelle
--        permission en la donnant à SON groupe ;
--      · `users.groups.archive` était IMPLIQUÉE par `.update`, la colonne
--        `is_active` vivant sur la table que la policy d'UPDATE gouverne.
--   2. UNE RÈGLE DE COHÉRENCE : la hiérarchie ne boucle pas.
--   3. DEUX LECTURES : le décompte des membres d'un groupe (§29) et
--      l'organigramme (§35), chacune exigeant SA capacité.
--
-- Références : 03_Modules/08_Utilisateurs_et_Groupes.md §27 à §37 et §52 ;
--              05_Regles_Metier/05_Permissions.md §42 et §90.3 ;
--              CLAUDE.md §18, §19, §19 bis ; DEC-024, DEC-035 §b, DEC-036 §b.
-- =============================================================================


-- =============================================================================
-- 1. DÉSACTIVER N'EST PAS MODIFIER — Module 08 §52, DEC-024
-- =============================================================================
--
-- LE PREMIER POINT DE SÉCURITÉ DU LOT, et il a deux précédents exacts :
-- la migration 041 avait découvert que `rental.maintenance.close` était
-- impliquée par `.update` ; la 058 et la 059 ont posé la même barrière pour les
-- projets, les tâches et les comptes rendus de réunion.
--
-- Une policy d'UPDATE dit QUI PEUT ÉCRIRE dans une table. Elle ne sait pas
-- distinguer deux actes portés par des colonnes voisines. `groups.is_active`
-- vit sur la table que `groups_update` gouverne : sans garde, un compte de
-- `users.groups.update` pouvait désactiver un groupe — donc retirer d'un coup
-- leurs droits à tous ses membres — sans jamais détenir `users.groups.archive`.
--
-- Le catalogue nomme pourtant les deux actes séparément :
--   `users.groups.update`  → « Modifier un groupe »
--   `users.groups.archive` → « Supprimer / désactiver un groupe »
--
-- La barrière est au DÉCLENCHEUR, et non dans une fonction applicative : la
-- table `groups` se modifie DIRECTEMENT par PostgREST, et une garde placée
-- ailleurs ne se trouve pas sur ce chemin-là.

create or replace function public.fn_group_write_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_toggle boolean := false;
begin
  /* ------------------------------------------------------------------------ */
  /*  CRÉATION                                                                 */
  /* ------------------------------------------------------------------------ */
  if tg_op = 'INSERT' then
    -- Un groupe SYSTÈME est fourni avec le SaaS : il ne se supprime pas
    -- (`fn_protect_group_deletion`). S'en octroyer un depuis l'application
    -- reviendrait à créer un groupe indestructible sans que rien ne l'ait
    -- décidé. La clé de service et les migrations, elles, en posent.
    if new.is_system and public.current_actor() is not null then
      raise exception
        'Un groupe système ne se crée pas depuis l''application : il est fourni avec le SaaS.'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end if;

  /* ------------------------------------------------------------------------ */
  /*  MODIFICATION                                                             */
  /* ------------------------------------------------------------------------ */

  -- L'ACTIVATION EST UN ACTE À PART.
  --
  -- Désactiver un groupe retire leurs droits à tous ses membres d'un seul
  -- geste : c'est l'équivalent fonctionnel d'une suppression, et le catalogue
  -- le range avec elle. Réactiver les leur rend — la frontière vaut donc dans
  -- les deux sens.
  v_toggle := new.is_active is distinct from old.is_active;

  -- Migration, script d'environnement, clé de service (convention de la 021) :
  -- pas de session applicative, donc pas de capacité à vérifier.
  if public.current_actor() is null then
    return new;
  end if;

  -- Le CODE identifie le groupe, le NOM le désigne. Un code se retrouve dans
  -- un export, une reprise de données, un journal d'audit : le renommer ferait
  -- perdre la trace de ce qui l'a précédé. Le nom, lui, se corrige librement.
  --
  -- Ce gel est une règle d'APPLICATION, non une invariance absolue : une
  -- migration future peut légitimement corriger un code, et elle n'a pas
  -- d'acteur.
  if new.code is distinct from old.code then
    raise exception
      'Le code d''un groupe ne se modifie pas : il l''identifie. Modifiez son nom.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.is_system is distinct from old.is_system then
    raise exception
      'Le caractère système d''un groupe ne se modifie pas depuis l''application.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_toggle then
    perform public.require_capability(
      array['users.groups.archive'], 'activer ou désactiver un groupe'
    );
  end if;

  -- Tout le reste — nom, description, ordre d'affichage — relève de la
  -- modification. `is_active` est écartée de la comparaison lorsqu'elle vient
  -- d'être contrôlée : sans cela, désactiver un groupe exigerait AUSSI
  -- `users.groups.update`, ce qui rendrait `.archive` inutilisable seule.
  v_before := to_jsonb(old) - 'updated_at' - 'updated_by';
  v_after  := to_jsonb(new) - 'updated_at' - 'updated_by';

  if v_toggle then
    v_before := v_before - 'is_active';
    v_after  := v_after  - 'is_active';
  end if;

  if v_before is distinct from v_after then
    perform public.require_capability(array['users.groups.update'], 'modifier un groupe');
  end if;

  return new;
end;
$$;

comment on function public.fn_group_write_guard is
  'Désactiver n''est pas modifier (DEC-024, Module 08 §52) : `users.groups.archive` est exigée pour l''activation, y compris en appel direct.';

create trigger groups_write_guard
  before insert or update on public.groups
  for each row execute function public.fn_group_write_guard();


-- =============================================================================
-- 2. NUL NE S'ACCORDE UN DROIT PAR SON PROPRE GROUPE
--    Module 08 §34 · 05_Regles_Metier/05_Permissions.md §42 et §90.3 · CLAUDE.md §18
-- =============================================================================
--
-- LE SECOND POINT DE SÉCURITÉ DU LOT, ET C'EST UN DÉFAUT EXISTANT.
--
-- La migration 003 avait posé `fn_prevent_self_privilege_change` sur
-- `user_permissions` et `user_groups` : nul ne se donne une permission
-- individuelle, nul ne s'affecte à un groupe.
--
-- `group_permissions` était restée hors du dispositif — parce qu'aucun écran ne
-- l'écrivait encore. Le chemin était pourtant ouvert : un utilisateur détenant
-- `users.groups.permissions.update` et MEMBRE d'un groupe pouvait ajouter à CE
-- groupe n'importe quelle capacité du catalogue, et la recevoir aussitôt par
-- héritage. Deux appels PostgREST suffisaient, sans jamais passer par un écran.
--
-- La règle appliquée est exactement celle de la 003, portée à la troisième
-- table : ON NE TOUCHE PAS AUX DROITS DONT ON DÉPEND. Elle ne connaît pas
-- d'exception pour le Super Admin — il ne tient pas ses droits d'un groupe, la
-- règle ne lui retire donc rien.
--
-- Ce qui reste possible, et qui est le fonctionnement documenté : configurer un
-- groupe AUQUEL ON N'APPARTIENT PAS. Un administrateur qui doit modifier son
-- propre groupe s'en retire d'abord, ou le fait faire.

create or replace function public.fn_prevent_self_group_privilege()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_actor();
  v_group uuid;
begin
  -- Migration, seed, clé de service : aucune session, donc aucun bénéficiaire.
  if v_actor is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_group := old.group_id;
  else
    v_group := new.group_id;
  end if;

  if exists (
    select 1
    from public.user_groups ug
    where ug.group_id = v_group
      and ug.user_id  = v_actor
  ) then
    raise exception
      'Opération refusée : un utilisateur ne peut pas modifier les permissions d''un groupe dont il est membre.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

comment on function public.fn_prevent_self_group_privilege is
  'Ferme l''escalade par le groupe : nul ne modifie les permissions d''un groupe dont il est membre (Permissions §42, CLAUDE.md §18).';

create trigger group_permissions_no_self_change
  before insert or update or delete on public.group_permissions
  for each row execute function public.fn_prevent_self_group_privilege();


-- =============================================================================
-- 3. LA HIÉRARCHIE NE BOUCLE PAS — Module 08 §35
-- =============================================================================
--
-- La migration 002 interdisait déjà qu'un utilisateur soit son propre
-- responsable (`app_users_manager_not_self`). C'est le cycle de longueur 1 ;
-- rien n'interdisait le cycle de longueur 2.
--
--   A → responsable B
--   B → responsable A
--
-- Cet organigramme-là n'a pas de racine : il ne se dessine pas, et sa lecture
-- récursive tourne indéfiniment. Ce n'est pas une question de droit — c'est une
-- IMPOSSIBILITÉ. La règle vaut donc AUSSI pour une migration et pour la clé de
-- service : la base ne doit pas accepter d'un script ce qu'elle refuse à un
-- humain (DEC-036 §c).
--
-- SECURITY DEFINER : la remontée de chaîne doit voir des fiches que l'appelant
-- n'a pas forcément le droit de lire. Elle n'en RENVOIE rien — elle ne fait que
-- refuser ou laisser passer.

create or replace function public.fn_prevent_manager_cycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cursor uuid;
  v_depth  int := 0;
begin
  if new.manager_id is null then
    return new;
  end if;

  -- Rien n'a changé sur ce point : inutile de reparcourir la chaîne.
  if tg_op = 'UPDATE' and new.manager_id is not distinct from old.manager_id then
    return new;
  end if;

  v_cursor := new.manager_id;

  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception
        'Hiérarchie circulaire refusée : ce collaborateur figure déjà parmi les responsables de la personne désignée.'
        using errcode = 'check_violation';
    end if;

    v_depth := v_depth + 1;

    -- Garde-fou : une chaîne aussi longue n'est pas un organigramme d'ADIKOM,
    -- c'est une donnée corrompue. Mieux vaut refuser que boucler.
    if v_depth > 64 then
      raise exception 'Chaîne hiérarchique anormalement longue : vérifiez les responsables désignés.'
        using errcode = 'check_violation';
    end if;

    select u.manager_id into v_cursor
    from public.app_users u
    where u.id = v_cursor;
  end loop;

  return new;
end;
$$;

comment on function public.fn_prevent_manager_cycle is
  'Un organigramme sans racine ne se dessine pas : la chaîne des responsables ne peut pas boucler (Module 08 §35).';

create trigger app_users_no_manager_cycle
  before insert or update of manager_id on public.app_users
  for each row execute function public.fn_prevent_manager_cycle();


-- =============================================================================
-- 4. LE DÉCOMPTE DES MEMBRES D'UN GROUPE — Module 08 §29
-- =============================================================================
--
-- §29 : la liste des groupes présente « nom du groupe ; description ; NOMBRE
-- D'UTILISATEURS ; statut ; date de création ».
--
-- Or `user_groups` n'est lisible qu'avec `users.users.view` : un administrateur
-- des groupes qui ne consulte pas les utilisateurs verrait « 0 membre »
-- partout — un chiffre FAUX, et un total faux fait autorité plus longtemps
-- qu'un total absent (DEC-034 §a).
--
-- Le décompte est donc servi par une fonction qui exige `users.groups.view`,
-- c'est-à-dire la capacité qui ouvre précisément cette liste. Elle rend un
-- NOMBRE, jamais un nom : l'identité des membres reste derrière
-- `users.users.view`, et l'écran NOMME cette absence plutôt que d'afficher une
-- liste vide (DEC-017).
--
-- Aucune capacité n'est créée : `users.groups.view` ouvre déjà la liste dont ce
-- décompte est une colonne (DEC-024).

create or replace function public.groups_member_counts()
returns table (
  group_id     uuid,
  member_count integer,
  active_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_capability(
    array['users.groups.view'], 'consulter la liste des groupes'
  );

  return query
  select
    g.id,
    count(ug.user_id)::integer,
    count(ug.user_id) filter (where u.status = 'ACTIVE')::integer
  from public.groups g
  left join public.user_groups ug on ug.group_id = g.id
  left join public.app_users   u  on u.id = ug.user_id
  group by g.id;
end;
$$;

comment on function public.groups_member_counts() is
  'Nombre de membres par groupe (Module 08 §29). Rend un décompte, jamais un nom : l''identité des membres relève de `users.users.view`.';


-- =============================================================================
-- 5. LA VUE HIÉRARCHIQUE — Module 08 §35, §36, §37
-- =============================================================================
--
-- POURQUOI UNE FONCTION, ET POURQUOI CELLE-CI EXIGE SA CAPACITÉ
--
-- `users.hierarchy.view` est une capacité AUTONOME, et ce n'est pas une
-- déduction : la migration 008 l'accorde aux groupes « Direction » et
-- « Assistant(e) de direction » SANS leur donner `users.users.view`. Si
-- l'organigramme dépendait de la liste des utilisateurs, ces deux groupes
-- verraient un organigramme vide — le seed serait faux depuis l'origine.
--
-- La fonction est donc SECURITY DEFINER : elle bâtit l'organigramme complet
-- pour qui détient `users.hierarchy.view`, sans exiger la lecture des fiches.
--
-- CE QU'ELLE RENVOIE, ET CE QU'ELLE NE RENVOIE PAS
--
-- Une capacité ouvre exactement ce qu'elle nomme (DEC-024). Celle-ci nomme la
-- STRUCTURE : identité d'affichage, fonction, responsable, départements. Elle
-- ne rend NI email, NI téléphone, NI dernière connexion, NI notes — ces
-- informations sont celles de la fiche, et la fiche a sa propre capacité.
--
-- QUI FIGURE AU DESSIN
--
-- Les comptes ACTIFS. §35 demande de « représenter la structure interne
-- d'ADIKOM » : un organigramme peuplé de personnes parties n'est pas la
-- structure d'ADIKOM, c'est son histoire — et §13 conserve celle-ci dans la
-- fiche, pas dans l'organigramme. Les comptes écartés sont COMPTÉS et l'écran
-- le dit (DEC-017) : rien ne disparaît en silence.
--
-- Un collaborateur dont le responsable n'est plus actif n'est pas perdu : il
-- remonte à la racine, marqué `detached`, et l'écran signale que son
-- rattachement est à revoir. Le faire disparaître avec son responsable serait
-- la seule vraie erreur.
--
-- RIEN N'EST STOCKÉ. Ni profondeur, ni effectif, ni chemin : tout se recalcule
-- à chaque lecture. Un organigramme tenu par déclencheur serait faux au premier
-- oubli (DEC-035 §f).

create or replace function public.organisation_chart()
returns table (
  id             uuid,
  full_name      text,
  job_title      text,
  manager_id     uuid,          -- responsable RETENU (actif) ; NULL à la racine
  declared_manager_id uuid,     -- responsable DÉCLARÉ, actif ou non
  depth          integer,
  sort_path      text,
  is_super_admin boolean,
  is_detached    boolean,       -- responsable déclaré mais non actif
  departments    text[],        -- rattachements
  managed        text[]         -- départements dont la personne est responsable
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_capability(
    array['users.hierarchy.view'], 'consulter la vue hiérarchique'
  );

  return query
  with recursive active as (
    select
      u.id,
      btrim(u.first_name || ' ' || u.last_name) as full_name,
      u.job_title,
      u.manager_id as declared_manager_id,
      u.is_super_admin,
      u.last_name,
      u.first_name
    from public.app_users u
    where u.status = 'ACTIVE'
  ),
  /*
   * Un responsable désactivé ne rattache plus personne : son subordonné
   * remonte à la racine plutôt que de disparaître du dessin avec lui.
   */
  rooted as (
    select
      a.*,
      (a.declared_manager_id is not null
        and not exists (select 1 from active m where m.id = a.declared_manager_id)) as is_detached
    from active a
  ),
  tree as (
    select
      r.id,
      r.full_name,
      r.job_title,
      null::uuid as manager_id,
      r.declared_manager_id,
      1 as depth,
      lower(r.last_name || ' ' || r.first_name) || '|' || r.id::text as sort_path,
      r.is_super_admin,
      r.is_detached
    from rooted r
    where r.declared_manager_id is null or r.is_detached

    union all

    select
      c.id,
      c.full_name,
      c.job_title,
      c.declared_manager_id,
      c.declared_manager_id,
      t.depth + 1,
      t.sort_path || '/' || lower(c.last_name || ' ' || c.first_name) || '|' || c.id::text,
      c.is_super_admin,
      c.is_detached
    from rooted c
    join tree t on t.id = c.declared_manager_id
    -- Le déclencheur `app_users_no_manager_cycle` interdit les boucles ; la
    -- borne protège les données antérieures à cette migration.
    where not c.is_detached
      and t.depth < 24
  ),
  /*
   * FILET : tout compte actif doit figurer au dessin, exactement une fois.
   *
   * Une chaîne trop profonde priverait un collaborateur de sa ligne sans que
   * rien ne le dise. Ceux que l'arbre n'a pas atteints sont rattachés à la
   * racine, marqués détachés — visibles et signalés, plutôt qu'absents.
   */
  complete as (
    select * from tree
    union all
    select
      r.id, r.full_name, r.job_title,
      null::uuid, r.declared_manager_id,
      1,
      lower(r.last_name || ' ' || r.first_name) || '|' || r.id::text,
      r.is_super_admin,
      true
    from rooted r
    where not exists (select 1 from tree t where t.id = r.id)
  ),
  belongs as (
    select
      ud.user_id,
      array_agg(d.name order by d.sort_order, d.name)                              as departments,
      array_remove(
        array_agg(case when ud.is_manager then d.name end order by d.sort_order, d.name),
        null
      )                                                                            as managed
    from public.user_departments ud
    join public.departments d on d.id = ud.department_id
    group by ud.user_id
  )
  select
    c.id,
    c.full_name,
    c.job_title,
    c.manager_id,
    c.declared_manager_id,
    c.depth,
    c.sort_path,
    c.is_super_admin,
    c.is_detached,
    coalesce(b.departments, array[]::text[]),
    coalesce(b.managed,     array[]::text[])
  from complete c
  left join belongs b on b.user_id = c.id
  order by c.sort_path;
end;
$$;

comment on function public.organisation_chart() is
  'Organigramme d''ADIKOM (Module 08 §35 à §37) : structure seule, comptes actifs, responsabilités multiples conservées. Exige `users.hierarchy.view` et rien d''autre.';


-- Nombre de comptes non actifs, donc absents du dessin.
-- L'écran l'affiche : un organigramme amputé et un organigramme complet ne se
-- ressemblent pas, et confondre les deux ferait croire l'entreprise plus petite
-- qu'elle n'est (DEC-017).
create or replace function public.organisation_chart_excluded()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  perform public.require_capability(
    array['users.hierarchy.view'], 'consulter la vue hiérarchique'
  );

  select count(*)::integer into v_count
  from public.app_users u
  where u.status <> 'ACTIVE';

  return v_count;
end;
$$;

comment on function public.organisation_chart_excluded() is
  'Nombre de comptes non actifs écartés de l''organigramme. Une absence se dit, elle ne se devine pas (DEC-017).';


-- =============================================================================
-- 6. DROITS D'EXÉCUTION — DEC-022
-- =============================================================================
-- `EXECUTE` est retiré à PUBLIC : seul un rôle nommé peut appeler ces
-- fonctions, et chacune vérifie ensuite sa propre capacité.

revoke execute on function public.groups_member_counts()        from public;
revoke execute on function public.organisation_chart()          from public;
revoke execute on function public.organisation_chart_excluded() from public;

revoke execute on function public.fn_group_write_guard()            from public;
revoke execute on function public.fn_prevent_self_group_privilege() from public;
revoke execute on function public.fn_prevent_manager_cycle()        from public;

grant execute on function public.groups_member_counts()        to authenticated;
grant execute on function public.organisation_chart()          to authenticated;
grant execute on function public.organisation_chart_excluded() to authenticated;
