-- =============================================================================
-- ADIKOM PILOT — 010 · Nom d'utilisateur obligatoire
--
-- Le nom d'utilisateur est l'identifiant de connexion (DEC-017). Un compte qui
-- en est dépourvu ne peut pas se connecter : la colonne devient obligatoire.
--
-- L'unicité insensible à la casse est déjà garantie par l'index posé en
-- migration 009 sur lower(username).
--
-- Aucune règle métier, aucune permission et aucune policy RLS ne sont modifiées.
-- =============================================================================

-- Filet de sécurité : si un compte historique était dépourvu d'identifiant, il
-- en reçoit un dérivé de son email plutôt que de bloquer la migration.
-- Aucun compte n'est dans ce cas aujourd'hui, mais la migration doit rester
-- rejouable sur n'importe quelle base.
update public.app_users
   set username = lower(split_part(email, '@', 1))
 where username is null;

alter table public.app_users
  alter column username set not null;

alter table public.app_users
  add constraint app_users_username_not_blank
  check (length(btrim(username)) > 0);

comment on column public.app_users.username is
  'Identifiant de connexion. Obligatoire et unique sans distinction de casse.';
