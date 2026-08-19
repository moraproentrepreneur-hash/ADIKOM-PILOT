-- =============================================================================
-- ADIKOM PILOT — 006 · Sécurité au niveau des données (RLS)
--
-- Deuxième barrière du dispositif (DEC-011). La première est la garde serveur
-- de l'application ; la troisième est le masquage d'interface, qui n'est
-- jamais une protection (05_Regles_Metier/05_Permissions.md §50 et §85).
--
-- Principe de confiance minimale (§87) : sans policy applicable, l'accès est
-- refusé. Le rôle `anon` (visiteur non authentifié) n'a aucun accès aux
-- données métier : ADIKOM PILOT est un SaaS strictement interne.
-- =============================================================================

-- --- Révocation systématique pour les visiteurs non authentifiés ------------

revoke all on public.app_users         from anon;
revoke all on public.departments       from anon;
revoke all on public.user_departments  from anon;
revoke all on public.groups            from anon;
revoke all on public.user_groups       from anon;
revoke all on public.permissions       from anon;
revoke all on public.group_permissions from anon;
revoke all on public.user_permissions  from anon;
revoke all on public.audit_log         from anon;
revoke all on public.company_settings  from anon;
revoke all on public.numbering_rules   from anon;

-- Le journal d'audit n'est jamais modifiable, même par un compte authentifié.
revoke insert, update, delete on public.audit_log from authenticated;

-- Le catalogue des permissions est géré par migration, pas par l'application.
revoke insert, update, delete on public.permissions from authenticated;

-- La configuration d'entreprise ne se supprime pas.
revoke delete on public.company_settings from authenticated;
revoke insert, delete on public.numbering_rules from authenticated;


-- --- Activation de RLS ------------------------------------------------------

alter table public.app_users         enable row level security;
alter table public.departments       enable row level security;
alter table public.user_departments  enable row level security;
alter table public.groups            enable row level security;
alter table public.user_groups       enable row level security;
alter table public.permissions       enable row level security;
alter table public.group_permissions enable row level security;
alter table public.user_permissions  enable row level security;
alter table public.audit_log         enable row level security;
alter table public.company_settings  enable row level security;
alter table public.numbering_rules   enable row level security;


-- --- Utilisateurs -----------------------------------------------------------

-- Chacun voit son propre profil ; la liste complète exige une permission.
create policy app_users_select on public.app_users
  for select to authenticated
  using (id = auth.uid() or public.has_permission('users.users.view'));

-- MVP : seul le Super Admin crée des utilisateurs
-- (05_Regles_Metier/05_Permissions.md §4 et §90.2).
create policy app_users_insert on public.app_users
  for insert to authenticated
  with check (public.is_super_admin());

-- Modification par un administrateur autorisé, ou de son propre profil.
-- Les triggers empêchent l'auto-promotion et l'auto-changement de statut.
create policy app_users_update on public.app_users
  for update to authenticated
  using (id = auth.uid() or public.has_permission('users.users.update'))
  with check (id = auth.uid() or public.has_permission('users.users.update'));

-- Aucune policy DELETE : un utilisateur ne se supprime pas, il se désactive
-- (05_Regles_Metier/05_Permissions.md §8).


-- --- Départements -----------------------------------------------------------

create policy departments_select on public.departments
  for select to authenticated
  using (true);

create policy departments_write on public.departments
  for all to authenticated
  using (public.has_permission('settings.company.update'))
  with check (public.has_permission('settings.company.update'));


create policy user_departments_select on public.user_departments
  for select to authenticated
  using (user_id = auth.uid() or public.has_permission('users.users.view'));

create policy user_departments_write on public.user_departments
  for all to authenticated
  using (public.has_permission('users.users.update'))
  with check (public.has_permission('users.users.update'));


-- --- Groupes ----------------------------------------------------------------

create policy groups_select on public.groups
  for select to authenticated
  using (public.has_permission('users.groups.view'));

create policy groups_insert on public.groups
  for insert to authenticated
  with check (public.has_permission('users.groups.create'));

create policy groups_update on public.groups
  for update to authenticated
  using (public.has_permission('users.groups.update'))
  with check (public.has_permission('users.groups.update'));

create policy groups_delete on public.groups
  for delete to authenticated
  using (public.has_permission('users.groups.archive'));


create policy user_groups_select on public.user_groups
  for select to authenticated
  using (user_id = auth.uid() or public.has_permission('users.users.view'));

-- L'affectation à un groupe modifie les droits : permission renforcée.
create policy user_groups_write on public.user_groups
  for all to authenticated
  using (public.has_permission('users.users.permissions.update'))
  with check (public.has_permission('users.users.permissions.update'));


-- --- Permissions ------------------------------------------------------------

-- Le catalogue est lisible par tout utilisateur authentifié : l'interface en a
-- besoin pour construire la navigation. Il ne contient aucune donnée métier.
create policy permissions_select on public.permissions
  for select to authenticated
  using (true);


create policy group_permissions_select on public.group_permissions
  for select to authenticated
  using (
    public.has_permission('users.groups.view')
    or exists (
      select 1 from public.user_groups ug
      where ug.group_id = group_permissions.group_id
        and ug.user_id = auth.uid()
    )
  );

create policy group_permissions_write on public.group_permissions
  for all to authenticated
  using (public.has_permission('users.groups.permissions.update'))
  with check (public.has_permission('users.groups.permissions.update'));


create policy user_permissions_select on public.user_permissions
  for select to authenticated
  using (user_id = auth.uid() or public.has_permission('users.users.permissions.view'));

create policy user_permissions_write on public.user_permissions
  for all to authenticated
  using (public.has_permission('users.users.permissions.update'))
  with check (public.has_permission('users.users.permissions.update'));


-- --- Journal d'audit --------------------------------------------------------
-- Lecture seule et sous permission (§41 et §62). L'écriture passe exclusivement
-- par log_audit(), en SECURITY DEFINER : aucune policy INSERT n'est nécessaire.

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.has_permission('users.audit.view'));


-- --- Paramètres entreprise --------------------------------------------------
-- La table complète contient des informations sensibles (administratives,
-- bancaires) : sa lecture directe exige une permission (§42).

create policy company_settings_select on public.company_settings
  for select to authenticated
  using (public.has_permission('settings.company.view'));

create policy company_settings_update on public.company_settings
  for update to authenticated
  using (public.has_permission('settings.company.update'))
  with check (public.has_permission('settings.company.update'));


-- Vue publique interne : informations non sensibles nécessaires à l'affichage
-- (en-tête, documents, formats). Accessible à tout utilisateur authentifié.
-- security_invoker = off : la vue expose délibérément un sous-ensemble sûr.
create view public.company_profile
with (security_invoker = off) as
  select
    legal_name,
    trade_name,
    acronym,
    tagline,
    city,
    country,
    phone,
    email,
    website,
    logo_path,
    color_primary,
    color_secondary,
    color_accent,
    currency_code,
    currency_label,
    locale,
    timezone,
    date_format
  from public.company_settings
  where id;

comment on view public.company_profile is
  'Sous-ensemble non sensible des paramètres entreprise. Exclut les données administratives et bancaires.';

revoke all on public.company_profile from anon;
grant select on public.company_profile to authenticated;


-- --- Règles de numérotation -------------------------------------------------

create policy numbering_rules_select on public.numbering_rules
  for select to authenticated
  using (public.has_permission('settings.numbering.view'));

create policy numbering_rules_update on public.numbering_rules
  for update to authenticated
  using (public.has_permission('settings.numbering.update'))
  with check (public.has_permission('settings.numbering.update'));
