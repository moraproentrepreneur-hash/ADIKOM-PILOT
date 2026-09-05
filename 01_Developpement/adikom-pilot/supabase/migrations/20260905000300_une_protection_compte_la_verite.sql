-- =============================================================================
-- ADIKOM PILOT — 062 · Une protection compte la vérité, pas ce que l'on voit
-- Phase 4 — Organisation, LOT 14 (correctif découvert par la recette)
--
-- CE QUE LA RECETTE A DÉCOUVERT
--
-- Un compte de `users.groups.archive`, dépourvu de `users.users.view`, a tenté
-- de supprimer un groupe COMPTANT UN MEMBRE. La suppression a bien été
-- refusée — mais par la CLÉ ÉTRANGÈRE, avec ce message :
--
--   « update or delete on table "groups" violates foreign key constraint … »
--
-- et non par `fn_protect_group_deletion`, dont le message dit précisément ce
-- qui bloque : « Le groupe « X » compte N utilisateur(s) … Retirez-les ou
-- désactivez le groupe. »
--
-- LA CAUSE : `fn_protect_group_deletion` comptait les membres avec les droits
-- de l'APPELANT. `user_groups_select` n'ouvre les lignes d'autrui qu'avec
-- `users.users.view` : sans elle, la requête ne lève pas, elle rend zéro. Le
-- déclencheur concluait « aucun membre » et laissait passer.
--
-- LA RÈGLE QUI EN DÉCOULE, ET ELLE VAUT AU-DELÀ DE CE CAS
--
--   Une garde qui COMPTE doit compter la vérité, pas ce que l'appelant a le
--   droit de voir.
--
-- Elle n'affaiblit rien : ces fonctions ne RENVOIENT aucune ligne. Elles
-- refusent ou laissent passer, et le nombre qu'elles citent est déjà celui que
-- l'utilisateur obtiendrait en le demandant à son écran.
--
-- Deux gardes sont concernées, et la seconde n'avait encore jamais été prise en
-- défaut parce qu'aucun écran ne l'exerçait sans `users.users.view` :
--
--   · `fn_protect_group_deletion`    (migration 002, Module 08 §52) ;
--   · `fn_protect_last_super_admin`  (migration 002, Module 08 §34) — celle-ci
--     comptait les AUTRES Super Admins actifs. Invisibles, ils étaient comptés
--     pour zéro, et la garde REFUSAIT une opération légitime. Un faux refus
--     n'est pas moins un défaut qu'une fausse autorisation : il rend le système
--     imprévisible.
--
-- Aucune capacité n'est créée, aucune policy n'est modifiée.
-- =============================================================================


-- --- Suppression d'un groupe — Module 08 §52 ---------------------------------

create or replace function public.fn_protect_group_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_count int;
begin
  if old.is_system then
    raise exception
      'Le groupe « % » ne peut pas être supprimé : il est fourni avec le système. Désactivez-le si nécessaire.',
      old.name
      using errcode = 'raise_exception';
  end if;

  -- SECURITY DEFINER : le décompte est celui de la base, pas celui que
  -- l'appelant a le droit de lire.
  select count(*) into member_count
  from public.user_groups
  where group_id = old.id;

  if member_count > 0 then
    raise exception
      'Le groupe « % » compte % utilisateur(s) et ne peut pas être supprimé. Retirez-les ou désactivez le groupe.',
      old.name, member_count
      using errcode = 'raise_exception';
  end if;

  return old;
end;
$$;

comment on function public.fn_protect_group_deletion is
  'Un groupe utilisé ne se supprime pas (Module 08 §52). Compte les membres réels : une garde ne juge pas sur ce que l''appelant peut voir.';


-- --- Dernier Super Admin — Module 08 §34 -------------------------------------

create or replace function public.fn_protect_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  remaining int;
begin
  -- Seuls les cas de perte du statut ou d'inactivation sont contrôlés.
  if tg_op = 'UPDATE'
     and old.is_super_admin
     and (not new.is_super_admin or new.status <> 'ACTIVE')
  then
    select count(*) into remaining
    from public.app_users
    where is_super_admin
      and status = 'ACTIVE'
      and id <> old.id;

    if remaining = 0 then
      raise exception
        'Opération refusée : ADIKOM PILOT doit conserver au moins un Super Admin actif.'
        using errcode = 'raise_exception';
    end if;
  end if;

  if tg_op = 'DELETE' and old.is_super_admin then
    select count(*) into remaining
    from public.app_users
    where is_super_admin and status = 'ACTIVE' and id <> old.id;

    if remaining = 0 then
      raise exception
        'Opération refusée : le dernier Super Admin ne peut pas être supprimé.'
        using errcode = 'raise_exception';
    end if;
  end if;

  -- Retour explicite : un CASE référençant OLD et NEW ferait échouer le
  -- trigger sur DELETE, où NEW n'est pas assigné (PL/pgSQL lie toutes les
  -- variables d'une expression avant de l'évaluer).
  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.fn_protect_last_super_admin is
  'Il reste toujours un Super Admin actif (Module 08 §34). Compte les comptes réels : un faux refus est un défaut au même titre qu''une fausse autorisation.';


-- --- Droits d'exécution — DEC-022 --------------------------------------------
-- Ces fonctions ne s'appellent que par déclencheur.

revoke execute on function public.fn_protect_group_deletion()   from public;
revoke execute on function public.fn_protect_last_super_admin() from public;
