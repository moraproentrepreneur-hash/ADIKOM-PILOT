-- =============================================================================
-- ADIKOM PILOT — 009 · Connexion par nom d'utilisateur
--
-- La connexion s'effectue désormais avec un nom d'utilisateur et un mot de
-- passe. L'utilisateur final ne saisit jamais d'adresse email.
--
-- Supabase Auth reste le système d'authentification : la correspondance
-- « nom d'utilisateur → compte Auth » est résolue côté serveur uniquement,
-- dans l'action de connexion. Aucune requête publique ne permet d'énumérer
-- les utilisateurs ni leurs adresses.
--
-- Cette migration ne change aucune règle métier, aucune permission et aucune
-- policy RLS. Elle renforce une contrainte d'intégrité rendue nécessaire par
-- le nouveau mode de connexion.
-- =============================================================================

-- L'unicité de `username` était sensible à la casse : « rachade » et
-- « Rachade » pouvaient coexister. La recherche de connexion, elle, doit être
-- insensible à la casse pour rester utilisable — deux comptes ne différant que
-- par la casse la rendraient ambiguë et bloqueraient les deux utilisateurs.
--
-- L'unicité est donc portée sur lower(username), comme pour l'email.
alter table public.app_users drop constraint if exists app_users_username_key;

create unique index if not exists app_users_username_unique_idx
  on public.app_users (lower(username))
  where username is not null;

comment on column public.app_users.username is
  'Identifiant de connexion. Unique sans distinction de casse. Requis pour se connecter.';
