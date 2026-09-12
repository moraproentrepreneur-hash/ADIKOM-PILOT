-- =============================================================================
-- ADIKOM PILOT — Recette Réinitialisation du mot de passe
-- LOT 19 (Module 08) — DEC-046
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur ne
-- peuvent garantir :
--
--   · la CAPACITÉ existe, avec son action, sa sensibilité et son sous-menu ;
--   · aucune capacité de mot de passe n'a été créée en plus (DEC-024) ;
--   · la POLICY dédiée existe et ne cite QUE la nouvelle capacité — s'en tenir
--     à `app_users_update` rendrait la réinitialisation implicitement incluse
--     dans « modifier un utilisateur » ;
--   · le DÉCLENCHEUR existe, et la FONCTION n'est pas `SECURITY DEFINER` ;
--   · `require_password_reset` est retirée à `public` et à `anon` ;
--   · les TROIS REFUS sont opposés par la base, éprouvés avec de vraies
--     capacités posées sur de vrais comptes ;
--   · le porteur de la SEULE capacité de réinitialisation ne modifie AUCUNE
--     autre colonne ;
--   · AUCUN mot de passe, en clair ou sous forme d'empreinte, n'entre au
--     journal ni dans `app_users`.
--
-- Exécution :
--   npm run db:verify:password-reset
--
-- CE SCRIPT S'EXÉCUTE AVEC LE RÔLE DE LA CHAÎNE DE CONNEXION.
--
-- `current_actor()` y vaut NULL : aucune capacité n'est détenue, et les gardes
-- qui dépendent de l'acteur ne se déclenchent pas. Les contrôles qui exigent un
-- ACTEUR posent donc `request.jwt.claims` à la main — c'est ce que PostgREST
-- fait pour une vraie session, et `auth.uid()` le lit de la même façon.
--
-- AUCUNE DATE EN DUR. La transaction est annulée en fin de script : aucun compte
-- de recette ne subsiste.
-- =============================================================================

begin;


-- --- 1. LA CAPACITÉ, ET ELLE SEULE -------------------------------------------
do $$
declare
  v_row public.permissions%rowtype;
  v_sib int;
begin
  select * into v_row from public.permissions where code = 'users.users.password.reset';

  if not found then
    raise exception 'La capacité `users.users.password.reset` est absente du catalogue.';
  end if;

  if v_row.action <> 'ADMIN' then
    raise exception 'Action attendue ADMIN (comme `rental.pricing.override`), obtenu %.', v_row.action;
  end if;

  if v_row.is_sensitive is not true then
    raise exception 'La réinitialisation doit être sensible : elle rend un accès.';
  end if;

  if v_row.module_code <> 'users' or v_row.menu_code <> 'users'
     or v_row.submenu_code <> 'password' then
    raise exception 'La capacité ne vit pas sous users → users → password.';
  end if;

  -- DEC-024 / CLAUDE.md §19 bis : le SaaS ne propose ni l'envoi d'un lien, ni la
  -- lecture d'un mot de passe. Une capacité qui ne débloque rien ne s'attribue pas.
  select count(*) into v_sib
  from public.permissions
  where code like 'users.users.password.%' and code <> 'users.users.password.reset';

  if v_sib > 0 then
    raise exception '% capacité(s) de mot de passe créée(s) sans fonctionnalité.', v_sib;
  end if;

  raise notice '[OK] 1. `users.users.password.reset` existe, ADMIN, sensible, et seule.';
end $$;


-- --- 2. LA POLICY DÉDIÉE, ET CE QU'ELLE NE CITE PAS ---------------------------
--
-- LE CONTRÔLE CENTRAL DU LOT.
--
-- Si cette policy citait `users.users.update`, ou si elle n'existait pas et que
-- l'écriture reposait sur `app_users_update`, alors « modifier un utilisateur »
-- inclurait « rendre un accès ». C'est exactement ce que DEC-024 interdit.
do $$
declare
  v_using text;
  v_check text;
begin
  select qual, with_check into v_using, v_check
  from pg_policies
  where schemaname = 'public' and tablename = 'app_users'
    and policyname = 'app_users_password_reset';

  if v_using is null then
    raise exception 'La policy `app_users_password_reset` est absente.';
  end if;

  if v_using not like '%users.users.password.reset%'
     or v_check not like '%users.users.password.reset%' then
    raise exception 'La policy ne garde pas la capacité de réinitialisation : % / %', v_using, v_check;
  end if;

  if v_using like '%users.users.update%' or v_check like '%users.users.update%' then
    raise exception
      'La policy de réinitialisation cite `users.users.update` : la capacité serait incluse dans une autre (DEC-024).';
  end if;

  -- `app_users_update` demeure, inchangée : les policies permissives se cumulent,
  -- et refermer l'autre casserait la modification d'une fiche.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_users' and policyname = 'app_users_update'
  ) then
    raise exception 'La policy `app_users_update` a disparu : la fiche ne serait plus modifiable.';
  end if;

  raise notice '[OK] 2. Policy dédiée présente, gardée par la seule capacité de réinitialisation.';
end $$;


-- --- 3. LE DÉCLENCHEUR, LA FONCTION, LES DROITS D'EXÉCUTION -------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.app_users'::regclass
      and tgname = 'app_users_password_reset_guard'
      and not tgisinternal
  ) then
    raise exception 'Le déclencheur `app_users_password_reset_guard` est absent.';
  end if;

  -- DOCTRINE D4 : aucune fonction métier `SECURITY DEFINER`. L'écriture passe
  -- par les policies de l'appelant, sans quoi la garde de RLS serait contournée.
  if (select prosecdef from pg_proc where oid = 'public.require_password_reset(uuid)'::regprocedure) then
    raise exception '`require_password_reset` est SECURITY DEFINER.';
  end if;

  if (select prosecdef from pg_proc where oid = 'public.fn_password_reset_guard()'::regprocedure) then
    raise exception '`fn_password_reset_guard` est SECURITY DEFINER.';
  end if;

  -- Retirée à `public` et à `anon` : un appel sans compte ne l'atteint pas.
  if has_function_privilege('anon', 'public.require_password_reset(uuid)', 'EXECUTE') then
    raise exception '`require_password_reset` est exécutable sans compte.';
  end if;

  if not has_function_privilege('authenticated', 'public.require_password_reset(uuid)', 'EXECUTE') then
    raise exception '`require_password_reset` est inatteignable par l''application.';
  end if;

  raise notice '[OK] 3. Déclencheur présent, aucune fonction SECURITY DEFINER, `anon` exclu.';
end $$;


-- --- 4. AUCUNE COLONNE DE MOT DE PASSE, NULLE PART ----------------------------
do $$
declare
  v_cols text;
begin
  select string_agg(column_name, ', ') into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and column_name ~* 'password'
    and column_name <> 'must_change_password';

  if v_cols is not null then
    raise exception 'Une colonne de mot de passe est apparue dans le schéma public : %', v_cols;
  end if;

  -- Et le journal redacte par construction toute clé nommée `password`.
  if (public.fn_audit_redact('{"password":"secret","x":1}'::jsonb)) ? 'password' then
    raise exception 'Le journal n''efface plus les clés de mot de passe.';
  end if;

  raise notice '[OK] 4. Aucune colonne de mot de passe ; le journal redacte toujours.';
end $$;


-- =============================================================================
-- 5. LES TROIS REFUS, ÉPROUVÉS AVEC DE VRAIS ACTEURS
--
-- Cinq comptes de recette, aux capacités exactes :
--
--   op       `password.reset` + `users.view`   → l'acteur légitime
--   maj      `users.update`  + `users.view`    → le VOISIN : modifie, ne réinitialise pas
--   cible    aucune                            → le collaborateur ordinaire
--   archive  aucune, statut ARCHIVED           → le compte qu'on ne réinitialise pas
--   patron   aucune, is_super_admin            → le compte à ne jamais rendre
--
-- Aucun ne cumule deux capacités voisines : c'est le cumul qui masquerait le
-- défaut.
-- =============================================================================

create temporary table recette_pwd (
  cle    text primary key,
  id     uuid not null
) on commit drop;

do $$
declare
  v_ids uuid[] := array[
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid()
  ];
  v_cles text[] := array['op', 'maj', 'cible', 'archive', 'patron'];
  v_i    int;
begin
  /*
   * Les comptes d'authentification sont créés en premier : `app_users.id`
   * référence `auth.users` (on delete restrict).
   */
  for v_i in 1 .. 5 loop
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (
      v_ids[v_i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'recette.pwd.' || v_cles[v_i] || '@adikom.test', now(), now()
    );

    insert into recette_pwd (cle, id) values (v_cles[v_i], v_ids[v_i]);
  end loop;

  insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
  values
    (v_ids[1], 'Recette', 'Pwd op',     'recette.pwd.op',     'recette.pwd.op@adikom.test',     'ACTIVE', false),
    (v_ids[2], 'Recette', 'Pwd maj',    'recette.pwd.maj',    'recette.pwd.maj@adikom.test',    'ACTIVE', false),
    (v_ids[3], 'Recette', 'Pwd cible',  'recette.pwd.cible',  'recette.pwd.cible@adikom.test',  'ACTIVE', false),
    (v_ids[5], 'Recette', 'Pwd patron', 'recette.pwd.patron', 'recette.pwd.patron@adikom.test', 'ACTIVE', true);

  -- Le compte ARCHIVED porte sa date de désactivation : la contrainte
  -- `app_users_deactivation_coherent` l'exige.
  insert into public.app_users (
    id, first_name, last_name, username, email, status, is_super_admin, deactivated_at
  )
  values (
    v_ids[4], 'Recette', 'Pwd archive', 'recette.pwd.archive', 'recette.pwd.archive@adikom.test',
    'ARCHIVED', false, now()
  );

  -- Les capacités, posées une à une.
  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[1], p.id, 'ALLOW'
  from public.permissions p
  where p.code in ('users.users.password.reset', 'users.users.view');

  insert into public.user_permissions (user_id, permission_id, effect)
  select v_ids[2], p.id, 'ALLOW'
  from public.permissions p
  where p.code in ('users.users.update', 'users.users.view');

  raise notice '[OK] 5. Cinq comptes de recette, aux capacités exactes.';
end $$;


/**
 * Endosse l'identité d'un compte de recette, comme PostgREST le fait.
 *
 * `set local` : le réglage meurt avec la transaction, et la recette s'annule
 * de toute façon.
 */
create or replace function pg_temp.agir_comme(p_cle text)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from recette_pwd where cle = p_cle;
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


-- --- 6. L'ACTE ABOUTIT AU PORTEUR DE LA CAPACITÉ ------------------------------
do $$
declare
  v_cible uuid;
  v_flag  boolean;
  v_trace int;
begin
  select id into v_cible from recette_pwd where cle = 'cible';

  perform pg_temp.agir_comme('op');
  perform public.require_password_reset(v_cible);
  perform pg_temp.redevenir_service();

  select must_change_password into v_flag from public.app_users where id = v_cible;
  if v_flag is not true then
    raise exception 'La réinitialisation n''a pas imposé le changement de mot de passe.';
  end if;

  -- Le journal dit qu'une réinitialisation a eu lieu, par qui, sur qui, quand.
  select count(*) into v_trace
  from public.audit_log
  where entity_type = 'app_users'
    and entity_id = v_cible::text
    and actor_id = (select id from recette_pwd where cle = 'op')
    and reason like 'Réinitialisation du mot de passe%';

  if v_trace < 1 then
    raise exception 'La réinitialisation n''a laissé aucune trace nommée au journal.';
  end if;

  raise notice '[OK] 6. L''acte aboutit, et le journal le nomme (% entrée(s)).', v_trace;
end $$;


-- --- 7. AUCUN MOT DE PASSE AU JOURNAL ----------------------------------------
--
-- La base ne connaît AUCUN mot de passe : la fonction n'en reçoit pas, et
-- l'écriture dans Supabase Auth appartient à l'appelant. Ce contrôle vérifie
-- qu'aucune trace n'a pu s'y glisser malgré tout.
do $$
declare
  v_fuite int;
begin
  select count(*) into v_fuite
  from public.audit_log
  where entity_type = 'app_users'
    and entity_id = (select id::text from recette_pwd where cle = 'cible')
    and (
      coalesce(before_data::text, '') ~* 'password"\s*:\s*"[^"]'
      or coalesce(after_data::text, '') ~* 'password"\s*:\s*"[^"]'
      or coalesce(reason, '')  ~* '\$2[aby]\$|[A-Za-z0-9!@#$%*?+=-]{16}'
      or coalesce(comment, '') ~* '\$2[aby]\$'
    );

  if v_fuite > 0 then
    raise exception '% entrée(s) de journal porte(nt) une valeur ressemblant à un mot de passe.', v_fuite;
  end if;

  raise notice '[OK] 7. Aucune valeur de mot de passe, en clair ni en empreinte, au journal.';
end $$;


-- --- 8. `users.users.update` NE RÉINITIALISE PAS ------------------------------
--
-- LE REFUS QUE DEC-024 COMMANDE. Le voisin modifie les fiches ; il ne rend pas
-- d'accès. Éprouvé par la fonction ET par un UPDATE direct, sans passer par elle.
do $$
declare
  v_maj    uuid;
  v_cible  uuid;
  v_refuse boolean := false;
begin
  select id into v_maj   from recette_pwd where cle = 'maj';
  select id into v_cible from recette_pwd where cle = 'cible';

  -- Remis à faux avec le rôle de service : le voisin doit tenter une LEVÉE.
  update public.app_users set must_change_password = false where id = v_cible;

  perform pg_temp.agir_comme('maj');

  begin
    perform public.require_password_reset(v_cible);
  exception when insufficient_privilege then
    v_refuse := true;
  end;

  if not v_refuse then
    perform pg_temp.redevenir_service();
    raise exception
      'LE PORTEUR DE `users.users.update` A RÉINITIALISÉ UN MOT DE PASSE : la capacité est incluse dans une autre (DEC-024).';
  end if;

  -- L'APPEL DIRECT, sans la fonction : c'est le chemin qu'un masquage de bouton
  -- ne fermerait pas.
  v_refuse := false;
  begin
    update public.app_users set must_change_password = true where id = v_cible;
  exception when insufficient_privilege then
    v_refuse := true;
  end;

  perform pg_temp.redevenir_service();

  if not v_refuse then
    raise exception
      'UN UPDATE DIRECT A LEVÉ L''INDICATEUR SOUS `users.users.update` SEULE : le déclencheur ne garde rien.';
  end if;

  if (select must_change_password from public.app_users where id = v_cible) is not false then
    raise exception 'L''indicateur a changé malgré le refus.';
  end if;

  raise notice '[OK] 8. `users.users.update` ne réinitialise pas : ni par la fonction, ni en direct.';
end $$;


-- --- 9. LE PORTEUR DE LA RÉINITIALISATION NE TOUCHE RIEN D'AUTRE --------------
--
-- RLS est ROW-level : la policy dédiée ouvre la LIGNE. Sans le déclencheur, elle
-- ouvrirait donc le nom, l'email, la fonction, le statut et le rôle Super Admin.
do $$
declare
  v_cible  uuid;
  v_col    text;
  v_reste  text := '';
  v_avant  public.app_users%rowtype;
begin
  select id into v_cible from recette_pwd where cle = 'cible';
  select * into v_avant from public.app_users where id = v_cible;

  foreach v_col in array array[
    'first_name', 'last_name', 'email', 'phone', 'job_title', 'notes', 'status', 'is_super_admin'
  ] loop
    perform pg_temp.agir_comme('op');

    begin
      execute format(
        'update public.app_users set %I = %L where id = %L',
        v_col,
        case v_col
          when 'status'         then 'SUSPENDED'
          when 'is_super_admin' then 'true'
          when 'email'          then 'detourne@adikom.test'
          else 'DÉTOURNÉ'
        end,
        v_cible
      );
      -- Aucune exception : l'écriture a été acceptée.
      v_reste := v_reste || v_col || ' ';
    exception when insufficient_privilege then
      null;                                       -- refus attendu
    end;

    perform pg_temp.redevenir_service();
  end loop;

  if v_reste <> '' then
    raise exception
      'LE PORTEUR DE LA SEULE RÉINITIALISATION A MODIFIÉ : %— la garde de colonnes ne tient pas.', v_reste;
  end if;

  -- Et la fiche est intacte : un refus qui laisserait passer une valeur ne
  -- serait pas un refus.
  if (select row(first_name, last_name, email, phone, job_title, notes, status, is_super_admin)
      from public.app_users where id = v_cible)
     is distinct from
     row(v_avant.first_name, v_avant.last_name, v_avant.email, v_avant.phone,
         v_avant.job_title, v_avant.notes, v_avant.status, v_avant.is_super_admin) then
    raise exception 'La fiche de l''utilisateur a changé malgré les refus.';
  end if;

  raise notice '[OK] 9. Huit colonnes tentées, huit refusées ; la fiche est intacte.';
end $$;


-- --- 10. NUL NE RÉINITIALISE SON PROPRE MOT DE PASSE PAR CETTE VOIE -----------
do $$
declare
  v_op     uuid;
  v_refuse boolean := false;
begin
  select id into v_op from recette_pwd where cle = 'op';

  perform pg_temp.agir_comme('op');
  begin
    perform public.require_password_reset(v_op);
  exception when insufficient_privilege then
    v_refuse := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_refuse then
    raise exception 'Un utilisateur a réinitialisé son propre mot de passe par cette voie.';
  end if;

  -- L'APPEL DIRECT aussi : l'écran de changement existe, celui-ci n'a pas à le
  -- doubler, et le journal resterait ambigu sur l'auteur réel.
  v_refuse := false;
  perform pg_temp.agir_comme('op');
  begin
    update public.app_users set must_change_password = true where id = v_op;
  exception when insufficient_privilege then
    v_refuse := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_refuse then
    raise exception 'Un UPDATE direct a levé l''indicateur sur son propre compte.';
  end if;

  raise notice '[OK] 10. L''auto-réinitialisation est refusée, par la fonction et en direct.';
end $$;


-- --- 11. UN NON-SUPER-ADMIN NE RÉINITIALISE PAS LE SUPER ADMIN ----------------
--
-- SANS CE REFUS, LA CAPACITÉ DEVIENT UN CHEMIN DE PRISE DE CONTRÔLE : qui
-- réinitialise le mot de passe du Super Admin se connecte à sa place, et
-- s'attribue ensuite tout le reste.
do $$
declare
  v_patron uuid;
  v_refuse boolean := false;
begin
  select id into v_patron from recette_pwd where cle = 'patron';

  perform pg_temp.agir_comme('op');
  begin
    perform public.require_password_reset(v_patron);
  exception when insufficient_privilege then
    v_refuse := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_refuse then
    raise exception
      'UN NON-SUPER-ADMIN A RÉINITIALISÉ LE MOT DE PASSE DU SUPER ADMIN : la capacité est un chemin de prise de contrôle.';
  end if;

  v_refuse := false;
  perform pg_temp.agir_comme('op');
  begin
    update public.app_users set must_change_password = true where id = v_patron;
  exception when insufficient_privilege then
    v_refuse := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_refuse then
    raise exception 'UN UPDATE DIRECT A LEVÉ L''INDICATEUR SUR UN SUPER ADMIN.';
  end if;

  if (select must_change_password from public.app_users where id = v_patron) is not false then
    raise exception 'L''indicateur du Super Admin a changé malgré le refus.';
  end if;

  raise notice '[OK] 11. Le compte Super Admin reste hors de portée d''un non-Super-Admin.';
end $$;


-- --- 12. UN COMPTE ARCHIVÉ NE SE RÉINITIALISE PAS -----------------------------
--
-- On le réactive d'abord. Réinitialiser un compte archivé rendrait un accès à
-- quelqu'un qui n'en a plus.
--
-- CE REFUS EST UNE RÈGLE DE COHÉRENCE : il vaut pour TOUT acteur, la clé de
-- service comprise. Les deux cas sont éprouvés.
do $$
declare
  v_arch   uuid;
  v_refuse boolean := false;
begin
  select id into v_arch from recette_pwd where cle = 'archive';

  perform pg_temp.agir_comme('op');
  begin
    perform public.require_password_reset(v_arch);
  exception when check_violation then
    v_refuse := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_refuse then
    raise exception 'Le mot de passe d''un compte ARCHIVED a été réinitialisé.';
  end if;

  -- Le rôle de service lui-même : la cohérence n'a pas d'acteur privilégié.
  v_refuse := false;
  begin
    update public.app_users set must_change_password = true where id = v_arch;
  exception when check_violation then
    v_refuse := true;
  end;

  if not v_refuse then
    raise exception
      'LA CLÉ DE SERVICE A RÉINITIALISÉ UN COMPTE ARCHIVÉ : la règle de cohérence a été placée derrière le contrôle d''acteur.';
  end if;

  raise notice '[OK] 12. Un compte archivé ne se réinitialise pas, quel que soit l''acteur.';
end $$;


-- --- 13. L'ACTE EXIGE DE POUVOIR LIRE LA FICHE --------------------------------
--
-- UN `UPDATE` SOUS RLS LIT LES LIGNES QU'IL VISE. Sans `users.users.view`,
-- l'écriture ne modifierait rien et ne dirait rien : zéro ligne touchée, aucune
-- erreur. La fonction exige donc la lecture explicitement, plutôt que de
-- laisser l'appelant croire l'opération faite.
do $$
declare
  v_op     uuid;
  v_cible  uuid;
  v_view   uuid;
  v_refuse boolean := false;
begin
  select id into v_op    from recette_pwd where cle = 'op';
  select id into v_cible from recette_pwd where cle = 'cible';
  select id into v_view  from public.permissions where code = 'users.users.view';

  -- On retire la seule lecture, et rien d'autre.
  delete from public.user_permissions where user_id = v_op and permission_id = v_view;

  perform pg_temp.agir_comme('op');
  begin
    perform public.require_password_reset(v_cible);
  exception when insufficient_privilege then
    v_refuse := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_refuse then
    raise exception
      'La réinitialisation a abouti sans droit de lire la fiche : elle aurait pu ne rien modifier en silence.';
  end if;

  -- Rendue, pour ne pas laisser le compte dans un état intermédiaire.
  insert into public.user_permissions (user_id, permission_id, effect)
  values (v_op, v_view, 'ALLOW');

  raise notice '[OK] 13. Sans `users.users.view`, l''acte est refusé — et non silencieusement sans effet.';
end $$;


-- --- 14. LE MÉCANISME EXISTANT N'A PAS BOUGÉ ----------------------------------
--
-- Le lot REJOUE le mécanisme du mot de passe temporaire ; il ne le remplace pas.
-- Ses deux pièces d'origine doivent être intactes.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users'
      and column_name = 'must_change_password' and is_nullable = 'NO'
  ) then
    raise exception 'La colonne `must_change_password` a changé de nature.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.app_users'::regclass
      and tgname = 'app_users_no_self_promotion' and not tgisinternal
  ) then
    raise exception 'Le déclencheur `app_users_no_self_promotion` a disparu : un titulaire pourrait lever son propre indicateur.';
  end if;

  raise notice '[OK] 14. `must_change_password` et `app_users_no_self_promotion` sont intacts.';
end $$;


-- --- 15. LA CONNEXION D'UN COMPTE ORDINAIRE RESTE JOURNALISÉE -----------------
--
-- LE DÉFAUT QUE CE CONTRÔLE GARDE A RÉELLEMENT EU LIEU (migration 080).
--
-- La garde de colonnes de la migration 079 excluait `updated_at` et
-- `updated_by`, et rien d'autre. Or `record_login()` met à jour `last_login_at`
-- À CHAQUE CONNEXION, sous la session de l'utilisateur. Pour tout compte
-- dépourvu de `users.users.update` — la quasi-totalité des collaborateurs — le
-- déclencheur levait donc une exception :
--
--   · la connexion n'était plus journalisée ;
--   · « Dernière connexion » cessait de se mettre à jour.
--
-- ET C'ÉTAIT SILENCIEUX : `signInAction` n'examine pas le résultat de
-- `record_login()`. La connexion aboutissait, la trace disparaissait.
--
-- `last_login_at` n'est pas une donnée que l'on RENSEIGNE sur un compte : elle
-- est PRODUITE PAR L'ACTE DE SE CONNECTER. Elle n'est donc tolérée que sur la
-- ligne de l'acteur — celle que `record_login()` vise. Sur la ligne d'autrui,
-- elle reste protégée : un horodatage forgé ferait passer un compte dormant
-- pour actif.
do $$
declare
  v_cible  uuid;
  v_op     uuid;
  v_refuse boolean := false;
begin
  select id into v_cible from recette_pwd where cle = 'cible';
  select id into v_op    from recette_pwd where cle = 'op';

  -- 1. LE COMPTE ORDINAIRE — aucune capacité d'utilisateur — se connecte.
  perform pg_temp.agir_comme('cible');
  begin
    perform public.record_login();
  exception when others then
    perform pg_temp.redevenir_service();
    raise exception
      'record_login() est refusé à un compte ordinaire : sa connexion ne serait pas journalisée. Motif : %',
      sqlerrm;
  end;
  perform pg_temp.redevenir_service();

  if not exists (
    select 1 from public.audit_log where actor_id = v_cible and action = 'LOGIN'
  ) then
    raise exception 'La connexion n''a laissé aucune entrée LOGIN au journal.';
  end if;

  if (select last_login_at from public.app_users where id = v_cible) is null then
    raise exception '« Dernière connexion » n''a pas été mise à jour.';
  end if;

  -- 2. ET L'HORODATAGE D'AUTRUI RESTE HORS D'ATTEINTE, y compris du porteur de
  --    la capacité de réinitialisation.
  perform pg_temp.agir_comme('op');
  begin
    update public.app_users
       set last_login_at = now() - interval '400 days'
     where id = v_cible;
  exception when insufficient_privilege then
    v_refuse := true;
  end;
  perform pg_temp.redevenir_service();

  if not v_refuse then
    raise exception
      'Le porteur de la réinitialisation a forgé l''horodatage de connexion d''un autre compte.';
  end if;

  raise notice '[OK] 15. La connexion reste journalisée ; l''horodatage d''autrui est protégé.';
end $$;


do $$ begin
  raise notice '';
  raise notice '[OK] Recette de la réinitialisation du mot de passe complète — LOT 19.';
end $$;

rollback;

-- =============================================================================
-- Transaction annulée : les cinq comptes de recette, leurs capacités et les
-- entrées de journal qu'ils ont produites disparaissent avec elle. Aucun résidu.
-- =============================================================================
