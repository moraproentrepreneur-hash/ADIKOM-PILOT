-- =============================================================================
-- ADIKOM PILOT — 002 · Identité interne
-- Utilisateurs, départements, groupes.
--
-- Règles appliquées :
--   · ADIKOM PILOT est un SaaS 100 % interne : aucun compte client, fournisseur
--     ou partenaire (05_Regles_Metier/05_Permissions.md §3).
--   · Une personne = un seul compte, même avec plusieurs responsabilités
--     (03_Modules/08_Utilisateurs_et_Groupes.md §36 et §62).
--   · Département ≠ permission (02_Architecture_Fonctionnelle/03 §8).
--   · Un utilisateur ayant un historique n'est jamais supprimé physiquement
--     (05_Regles_Metier/05_Permissions.md §8).
-- =============================================================================

-- --- Utilisateurs internes --------------------------------------------------

create table public.app_users (
  -- Clé partagée avec Supabase Auth. ON DELETE RESTRICT : la suppression d'un
  -- compte d'authentification ne doit jamais effacer un profil porteur
  -- d'historique métier (05_Regles_Metier/05_Permissions.md §8).
  id                uuid primary key references auth.users (id) on delete restrict,

  -- Identité
  first_name        text        not null check (length(btrim(first_name)) > 0),
  last_name         text        not null check (length(btrim(last_name)) > 0),
  username          text        unique,
  email             citext      not null unique,
  phone             text,

  -- Informations professionnelles
  job_title         text,                     -- poste / fonction
  manager_id        uuid references public.app_users (id) on delete set null,
  hired_on          date,
  avatar_path       text,                     -- chemin Supabase Storage (bucket privé)

  -- Accès
  status            public.user_status not null default 'ACTIVE',

  -- Rôle système : accès complet, indépendant des groupes ordinaires.
  -- Source : 03_Modules/08_Utilisateurs_et_Groupes.md §33.
  is_super_admin    boolean     not null default false,

  last_login_at     timestamptz,
  notes             text,

  -- Traçabilité
  created_at        timestamptz not null default now(),
  created_by        uuid references public.app_users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.app_users (id) on delete set null,
  deactivated_at    timestamptz,
  deactivated_by    uuid references public.app_users (id) on delete set null,

  -- Un utilisateur ne peut pas être son propre responsable hiérarchique.
  constraint app_users_manager_not_self check (manager_id is null or manager_id <> id),

  -- Cohérence : un compte non actif porte une date de désactivation.
  constraint app_users_deactivation_coherent
    check (status = 'ACTIVE' or deactivated_at is not null)
);

comment on table  public.app_users is
  'Collaborateurs ADIKOM autorisés à accéder au SaaS. Aucun tiers externe.';
comment on column public.app_users.is_super_admin is
  'Rôle système : accès complet, non soumis aux permissions de groupe.';
comment on column public.app_users.status is
  'Un compte INACTIVE/SUSPENDED/ARCHIVED ne peut plus se connecter, mais son historique est conservé.';

create index app_users_status_idx     on public.app_users (status);
create index app_users_manager_idx    on public.app_users (manager_id);
create index app_users_last_name_idx  on public.app_users (last_name, first_name);

create trigger app_users_set_updated_at
  before update on public.app_users
  for each row execute function public.fn_set_updated_at();


-- Garde-fou : il doit toujours rester au moins un Super Admin actif.
-- Source : 03_Modules/08_Utilisateurs_et_Groupes.md §34 —
-- « empêcher de supprimer le dernier Super Admin ou de désactiver
--   accidentellement le seul compte administrateur global ».
create or replace function public.fn_protect_last_super_admin()
returns trigger
language plpgsql
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

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger app_users_protect_last_super_admin
  before update or delete on public.app_users
  for each row execute function public.fn_protect_last_super_admin();


-- --- Départements -----------------------------------------------------------
-- Information organisationnelle. Ne confère aucun droit par elle-même.

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  code        text        not null unique,
  name        text        not null,
  description text,
  is_active   boolean     not null default true,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.departments is
  'Départements ADIKOM. Donnée organisationnelle : Département ≠ Permission.';

create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.fn_set_updated_at();


-- Un utilisateur peut être responsable de plusieurs départements.
-- Source : 02_Architecture_Fonctionnelle/01 §13 — le système ne doit jamais
-- supposer « 1 utilisateur = 1 département ».
create table public.user_departments (
  user_id       uuid not null references public.app_users (id)  on delete cascade,
  department_id uuid not null references public.departments (id) on delete restrict,
  is_manager    boolean     not null default false,  -- responsable du département
  is_primary    boolean     not null default false,  -- rattachement principal
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references public.app_users (id) on delete set null,
  primary key (user_id, department_id)
);

comment on table public.user_departments is
  'Rattachements organisationnels. Un utilisateur peut en cumuler plusieurs.';

create index user_departments_department_idx on public.user_departments (department_id);

-- Au plus un rattachement principal par utilisateur.
create unique index user_departments_one_primary_idx
  on public.user_departments (user_id)
  where is_primary;


-- --- Groupes ----------------------------------------------------------------
-- Un groupe porte un ensemble de permissions et se voit attribuer des utilisateurs.

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  code        text        not null unique,
  name        text        not null,
  description text,
  is_active   boolean     not null default true,

  -- Groupe structurant fourni avec le système : non supprimable.
  is_system   boolean     not null default false,

  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.app_users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.app_users (id) on delete set null
);

comment on table public.groups is
  'Groupes de permissions. Modifier un groupe impacte plusieurs utilisateurs : action sensible.';

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.fn_set_updated_at();


create table public.user_groups (
  user_id     uuid not null references public.app_users (id) on delete cascade,
  group_id    uuid not null references public.groups (id)    on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.app_users (id) on delete set null,
  primary key (user_id, group_id)
);

comment on table public.user_groups is
  'Appartenance aux groupes. Un utilisateur peut appartenir à plusieurs groupes (DEC-009).';

create index user_groups_group_idx on public.user_groups (group_id);


-- Un groupe encore utilisé ne peut pas être supprimé sans contrôle.
-- Source : 03_Modules/08_Utilisateurs_et_Groupes.md §52.
create or replace function public.fn_protect_group_deletion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  member_count int;
begin
  if old.is_system then
    raise exception
      'Le groupe système « % » ne peut pas être supprimé. Désactivez-le si nécessaire.',
      old.name
      using errcode = 'raise_exception';
  end if;

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

create trigger groups_protect_deletion
  before delete on public.groups
  for each row execute function public.fn_protect_group_deletion();
