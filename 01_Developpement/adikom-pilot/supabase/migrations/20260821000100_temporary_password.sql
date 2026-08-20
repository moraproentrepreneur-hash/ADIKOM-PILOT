-- ============================================================================
-- Mot de passe temporaire et changement obligatoire à la première connexion
--
-- Le Super Admin ne saisit plus le mot de passe initial : il est généré, remis
-- une seule fois, et considéré comme temporaire. Tant que son titulaire ne l'a
-- pas remplacé, il n'accède à aucune fonctionnalité métier.
--
-- Le mot de passe lui-même reste exclusivement dans Supabase Auth. Aucune
-- colonne applicative ne le stocke, ni en clair ni sous forme d'empreinte
-- (03_Modules/08_Utilisateurs_et_Groupes.md §41).
-- ============================================================================

alter table public.app_users
  add column if not exists must_change_password boolean not null default false;

comment on column public.app_users.must_change_password is
  'Vrai tant que le titulaire n''a pas remplacé le mot de passe temporaire remis à la création. Bloque l''accès aux fonctionnalités métier.';


-- --- Protection contre le contournement -------------------------------------
-- La policy `app_users_update` autorise la modification à tout détenteur de
-- `users.users.update`. Sans la garde ci-dessous, un utilisateur disposant de
-- cette permission pourrait effacer son propre indicateur et sauter l'étape de
-- changement.
--
-- La seule voie légitime reste l'action serveur dédiée, qui n'efface
-- l'indicateur qu'après un changement de mot de passe réellement accepté par
-- Supabase Auth.

create or replace function public.fn_prevent_self_promotion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_actor();
begin
  if v_actor is null or v_actor <> new.id then
    return new;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin then
    raise exception
      'Opération refusée : le statut de Super Admin ne peut pas être modifié par son propre titulaire.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status then
    raise exception
      'Opération refusée : un utilisateur ne peut pas modifier le statut de son propre compte.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.must_change_password is distinct from old.must_change_password then
    raise exception
      'Opération refusée : le changement de mot de passe obligatoire ne peut pas être levé par son propre titulaire.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;
