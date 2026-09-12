-- =============================================================================
-- ADIKOM PILOT — 080 · Un horodatage de connexion n'est pas une donnée du compte
-- LOT 19, défaut trouvé par `verify:audit` avant clôture — DEC-046
--
-- LE DÉFAUT
--
-- `fn_password_reset_guard` (migration 079) refuse, au porteur de la seule
-- capacité de réinitialisation, toute écriture portant sur une autre colonne que
-- `must_change_password`. La comparaison excluait `updated_at` et `updated_by`,
-- et RIEN D'AUTRE.
--
-- Or `record_login()` met à jour `last_login_at` À CHAQUE CONNEXION, sous la
-- session de l'utilisateur qui vient de se connecter. Pour tout compte dépourvu
-- de `users.users.update` — c'est-à-dire la quasi-totalité des collaborateurs —
-- le déclencheur levait donc une exception, et :
--
--   · la connexion n'était plus journalisée (`Audit` §25) ;
--   · « Dernière connexion » cessait de se mettre à jour sur la fiche.
--
-- LE DÉFAUT ÉTAIT SILENCIEUX. `signInAction` n'examine pas le résultat de
-- `record_login()` : la connexion aboutissait, et rien ne signalait que sa trace
-- avait été perdue. Aucune recette du lot 19 ne l'a vu — la recette du JOURNAL
-- D'ACTIVITÉ, elle, vérifie depuis le LOT 15 que « les connexions continuent
-- d'être journalisées ». C'est elle qui l'a arrêté.
--
-- POURQUOI C'EST UNE ERREUR DE QUALIFICATION, ET NON UN OUBLI DE COLONNE
--
-- `last_login_at` n'est pas une donnée que l'on RENSEIGNE sur un compte, comme
-- un téléphone ou une fonction : elle est PRODUITE PAR L'ACTE DE SE CONNECTER.
-- Le déclencheur d'audit fait d'ailleurs la même distinction depuis l'origine —
-- il exclut `last_login_at`, `updated_at` et `updated_by` de ce qu'il considère
-- comme un changement significatif.
--
-- LA CORRECTION N'OUVRE PAS LA COLONNE POUR AUTANT
--
-- L'exclure purement et simplement laisserait un porteur de
-- `users.users.password.reset` FORGER l'horodatage de connexion de n'importe
-- qui, par appel direct — et faire passer un compte dormant pour actif.
--
-- Or `record_login()` n'écrit QUE sur la ligne de l'acteur (`where id =
-- v_actor`). La tolérance suit donc exactement cette frontière :
--
--   · sur SA PROPRE ligne, `last_login_at` est toléré — c'est la connexion ;
--   · sur la ligne d'AUTRUI, il reste protégé comme toute autre colonne.
--
-- Aucun nom de rôle n'est invoqué, et la recette conserve sa portée : ses
-- écritures directes visent la ligne d'un autre compte.
-- =============================================================================

create or replace function public.fn_password_reset_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := public.current_actor();
  /*
   * Ce que la comparaison ignore.
   *
   * `updated_at` et `updated_by` sont posés par `fn_set_updated_at` : ils
   * datent l'écriture, ils ne sont pas son contenu.
   */
  v_ignore text[] := array['must_change_password', 'updated_at', 'updated_by'];
begin
  /* ---------------------------------------------------------------------- */
  /*  A. L'acte de réinitialisation                                          */
  /* ---------------------------------------------------------------------- */
  if coalesce(new.must_change_password, false)
     and not coalesce(old.must_change_password, false) then

    -- Cohérence, pour tout acteur : on réactive avant de rendre un accès.
    if old.status = 'ARCHIVED' then
      raise exception
        'Opération refusée : le mot de passe d''un compte archivé ne se réinitialise pas. Réactivez le compte d''abord.'
        using errcode = 'check_violation';
    end if;

    if v_actor is not null then
      -- L'écran de changement existe déjà : cette voie n'a pas à le doubler, et
      -- le journal resterait ambigu sur l'auteur réel de l'opération.
      if v_actor = old.id then
        raise exception
          'Opération refusée : cette voie ne réinitialise pas le mot de passe de son propre compte.'
          using errcode = 'insufficient_privilege';
      end if;

      -- SANS CE REFUS, LA CAPACITÉ DEVIENT UN CHEMIN DE PRISE DE CONTRÔLE :
      -- qui réinitialise le mot de passe du Super Admin se connecte à sa place,
      -- et s'attribue ensuite tout le reste.
      if old.is_super_admin and not public.is_super_admin() then
        raise exception
          'Opération refusée : seul un Super Admin peut réinitialiser le mot de passe d''un Super Admin.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    -- Deuxième barrière, après l'action serveur : la policy dit qui peut écrire
    -- dans la table, ceci dit qui peut accomplir CET acte. Sans effet lorsque
    -- aucune session applicative n'est en cause (clé de service, migration).
    perform public.require_capability(
      array['users.users.password.reset'],
      'réinitialiser le mot de passe d''un utilisateur'
    );
  end if;

  /* ---------------------------------------------------------------------- */
  /*  B. La portée de l'écriture                                             */
  /* ---------------------------------------------------------------------- */

  /*
   * `last_login_at` est PRODUIT PAR L'ACTE DE SE CONNECTER, et `record_login()`
   * ne l'écrit que sur la ligne de l'acteur. Il n'est donc toléré que là.
   *
   * Sur la ligne d'autrui il demeure protégé : un horodatage de connexion forgé
   * ferait passer un compte dormant pour actif.
   */
  -- `array_append`, et non `||` : `text[] || 'littéral'` laisse Postgres
  -- interpréter la chaîne comme un TABLEAU, et échoue sur un littéral malformé.
  if v_actor is not null and v_actor = old.id then
    v_ignore := array_append(v_ignore, 'last_login_at');
  end if;

  if v_actor is not null
     and not public.has_permission('users.users.update')
     and (to_jsonb(new) - v_ignore) is distinct from (to_jsonb(old) - v_ignore)
  then
    raise exception
      'Opération refusée : la seule capacité de réinitialisation du mot de passe ne permet de modifier aucune autre donnée du compte.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function public.fn_password_reset_guard() is
  'Lever must_change_password exige `users.users.password.reset` et subit les trois refus ; le porteur de cette seule capacité ne modifie aucune autre colonne — `last_login_at` excepté sur sa propre ligne, que produit sa connexion.';


-- =============================================================================
-- CONTRÔLES DE NON-RÉGRESSION
--
-- Le défaut corrigé ici est passé sous les recettes du lot parce qu'aucune
-- n'éprouvait la CONNEXION d'un compte ordinaire. Le contrôle ci-dessous
-- l'éprouve en base, à l'endroit même où il s'est produit.
-- =============================================================================

do $$
declare
  v_id    uuid := gen_random_uuid();
  v_ok    boolean := false;
  v_other uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'controle.080.' || v_id || '@adikom.test', now(), now());

  insert into public.app_users (id, first_name, last_name, username, email, status)
  values (v_id, 'Contrôle', '080', 'controle.080.' || left(v_id::text, 8),
          'controle.080.' || v_id || '@adikom.test', 'ACTIVE');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text,
    true
  );

  -- 1. LA CONNEXION EST DE NOUVEAU JOURNALISÉE.
  begin
    perform public.record_login();
    v_ok := true;
  exception when others then
    raise exception
      'record_login() reste refusé pour un compte ordinaire : la connexion ne serait pas journalisée. Motif : %',
      sqlerrm;
  end;

  if not exists (
    select 1 from public.audit_log
    where actor_id = v_id and action = 'LOGIN'
  ) then
    raise exception 'record_login() a abouti sans laisser d''entrée LOGIN au journal.';
  end if;

  if (select last_login_at from public.app_users where id = v_id) is null then
    raise exception '« Dernière connexion » n''a pas été mise à jour.';
  end if;

  -- 2. ET L'HORODATAGE D'AUTRUI RESTE HORS D'ATTEINTE.
  select id into v_other
  from public.app_users
  where id <> v_id
  limit 1;

  if v_other is not null then
    v_ok := false;
    begin
      update public.app_users set last_login_at = now() - interval '1 day' where id = v_other;
    exception when insufficient_privilege then
      v_ok := true;
    end;

    -- Une écriture sans effet est un refus : RLS masque au lieu de lever
    -- lorsque aucune policy n'ouvre la ligne.
    if not v_ok and (select last_login_at from public.app_users where id = v_other)
                    is distinct from (now() - interval '1 day') then
      v_ok := true;
    end if;

    if not v_ok then
      raise exception
        'Un compte ordinaire a forgé l''horodatage de connexion d''un autre compte.';
    end if;
  end if;

  /*
   * LE CONTEXTE SE REFERME EXPLICITEMENT.
   *
   * `set_config(..., true)` est local à la TRANSACTION, pas au bloc : une
   * identité endossée survivrait au `end` et s'appliquerait à la suite de la
   * migration. Un défaut de cette nature a déjà été trouvé une fois (LOT 18).
   */
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Le compte de contrôle est retiré avec le rôle de la migration. Son entrée
-- LOGIN demeure au journal, qui ne se supprime jamais (Audit §40) : elle est
-- seulement détachée du compte, comme le fait toute suppression de compte.
do $$
declare v_id uuid;
begin
  for v_id in
    select id from public.app_users where username like 'controle.080.%'
  loop
    update public.audit_log set actor_id = null where actor_id = v_id;
    delete from public.app_users where id = v_id;
    delete from auth.users where id = v_id;
  end loop;

  raise notice '[OK] 080. record_login() rétabli ; l''horodatage d''autrui reste protégé.';
end $$;
