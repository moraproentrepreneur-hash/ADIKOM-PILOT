-- =============================================================================
-- ADIKOM PILOT — 003 · Permissions
-- Catalogue, attributions (groupe / individuelle) et moteur d'autorisation.
--
-- Modèle de référence (05_Regles_Metier/05_Permissions.md §92) :
--   Utilisateur → Groupe → Module → Menu → Sous-menu → Action → Autorisé / Refusé
--
-- Règle de résolution retenue (DEC-009) :
--   Refus explicite  → refusé  (prioritaire sur tout)
--   Autorisation     → autorisé
--   Aucune règle     → refusé  (principe de confiance minimale, §87)
-- =============================================================================

-- --- Catalogue des permissions ----------------------------------------------
-- Le catalogue reflète la navigation réelle du SaaS
-- (03_Modules/08_Utilisateurs_et_Groupes.md §20 : « la liste exacte doit rester
--  synchronisée avec les modules réellement développés »).

create table public.permissions (
  id             uuid primary key default gen_random_uuid(),

  -- Code stable utilisé dans le code applicatif et les policies RLS.
  -- Format : module.menu.sousmenu.action — ex. « location.reservations.list.view »
  code           text not null unique,

  module_code    text not null,
  module_label   text not null,
  menu_code      text,
  menu_label     text,
  submenu_code   text,
  submenu_label  text,

  action         public.permission_action not null,
  label          text not null,
  description    text,

  -- Signale une permission financière ou administrative sensible, afin de
  -- l'afficher distinctement et de renforcer sa traçabilité
  -- (05_Regles_Metier/05_Permissions.md §28 et §71).
  is_sensitive   boolean not null default false,

  module_order   int not null default 0,
  menu_order     int not null default 0,
  submenu_order  int not null default 0,
  action_order   int not null default 0,

  created_at     timestamptz not null default now()
);

comment on table public.permissions is
  'Catalogue des permissions. Une permission absente du catalogue n''existe pas : accès refusé.';
comment on column public.permissions.code is
  'Code stable module.menu.sousmenu.action, référencé par le code applicatif et les policies RLS.';

create index permissions_module_idx    on public.permissions (module_code, menu_code, submenu_code);
create index permissions_sensitive_idx on public.permissions (is_sensitive) where is_sensitive;


-- --- Attribution aux groupes ------------------------------------------------

create table public.group_permissions (
  group_id      uuid not null references public.groups (id)      on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  effect        public.permission_effect not null default 'ALLOW',
  granted_at    timestamptz not null default now(),
  granted_by    uuid references public.app_users (id) on delete set null,
  primary key (group_id, permission_id)
);

comment on table public.group_permissions is
  'Permissions portées par un groupe. Source « héritée » côté interface.';

create index group_permissions_permission_idx on public.group_permissions (permission_id);


-- --- Attribution individuelle -----------------------------------------------
-- Complète les permissions de groupe pour traiter les cas particuliers sans
-- multiplier les groupes (03_Modules/08_Utilisateurs_et_Groupes.md §31).

create table public.user_permissions (
  user_id       uuid not null references public.app_users (id)   on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  effect        public.permission_effect not null default 'ALLOW',
  reason        text,
  granted_at    timestamptz not null default now(),
  granted_by    uuid references public.app_users (id) on delete set null,
  primary key (user_id, permission_id)
);

comment on table public.user_permissions is
  'Permissions individuelles. Distinguées des permissions héritées d''un groupe (§46).';

create index user_permissions_permission_idx on public.user_permissions (permission_id);


-- --- Moteur d'autorisation --------------------------------------------------
-- SECURITY DEFINER : ces fonctions doivent pouvoir lire les tables de droits
-- indépendamment des policies RLS, sans provoquer de récursion.

create or replace function public.is_super_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_users u
    where u.id = p_user_id
      and u.is_super_admin
      and u.status = 'ACTIVE'
  );
$$;

comment on function public.is_super_admin(uuid) is
  'Rôle système Super Admin : accès complet. Un compte non actif perd ce privilège.';


create or replace function public.has_permission(
  p_code    text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.user_status;
  v_super  boolean;
  v_perm   uuid;
begin
  if p_user_id is null or p_code is null then
    return false;                                   -- §87 : absence → refus
  end if;

  select u.status, u.is_super_admin
    into v_status, v_super
  from public.app_users u
  where u.id = p_user_id;

  -- Compte inconnu, désactivé ou suspendu : aucun droit.
  -- §48 : la désactivation du compte prime sur les permissions.
  if v_status is null or v_status <> 'ACTIVE' then
    return false;
  end if;

  -- §49 : le Super Admin n'est pas soumis aux restrictions des groupes.
  if v_super then
    return true;
  end if;

  select p.id into v_perm
  from public.permissions p
  where p.code = p_code;

  if v_perm is null then
    return false;                                   -- permission inconnue → refus
  end if;

  -- 1. Refus explicite, individuel ou hérité : prioritaire sur tout (DEC-009).
  if exists (
    select 1 from public.user_permissions up
    where up.user_id = p_user_id
      and up.permission_id = v_perm
      and up.effect = 'DENY'
  ) or exists (
    select 1
    from public.group_permissions gp
    join public.user_groups ug on ug.group_id = gp.group_id
    join public.groups g       on g.id = gp.group_id
    where ug.user_id = p_user_id
      and gp.permission_id = v_perm
      and gp.effect = 'DENY'
      and g.is_active
  ) then
    return false;
  end if;

  -- 2. Autorisation individuelle.
  if exists (
    select 1 from public.user_permissions up
    where up.user_id = p_user_id
      and up.permission_id = v_perm
      and up.effect = 'ALLOW'
  ) then
    return true;
  end if;

  -- 3. Autorisation héritée d'un groupe actif.
  if exists (
    select 1
    from public.group_permissions gp
    join public.user_groups ug on ug.group_id = gp.group_id
    join public.groups g       on g.id = gp.group_id
    where ug.user_id = p_user_id
      and gp.permission_id = v_perm
      and gp.effect = 'ALLOW'
      and g.is_active
  ) then
    return true;
  end if;

  -- 4. Aucune règle applicable : refus.
  return false;
end;
$$;

comment on function public.has_permission(text, uuid) is
  'Moteur d''autorisation unique. Refus explicite > autorisation > absence = refus (DEC-009).';


-- Permissions effectives d'un utilisateur, avec leur origine.
-- Alimente l'onglet « Permissions » de la fiche utilisateur, qui doit distinguer
-- accordé / refusé / hérité / non défini (03_Modules/08 §48).
create or replace function public.effective_permissions(p_user_id uuid default auth.uid())
returns table (
  permission_code text,
  granted         boolean,
  source          text        -- SUPER_ADMIN · USER_DENY · GROUP_DENY · USER_ALLOW · GROUP_ALLOW · NONE
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.user_status;
  v_super  boolean;
begin
  select u.status, u.is_super_admin into v_status, v_super
  from public.app_users u where u.id = p_user_id;

  if v_status is null or v_status <> 'ACTIVE' then
    return;                                          -- aucun droit : ensemble vide
  end if;

  if v_super then
    return query
      select p.code, true, 'SUPER_ADMIN'::text from public.permissions p;
    return;
  end if;

  return query
  with user_rules as (
    select up.permission_id, up.effect
    from public.user_permissions up
    where up.user_id = p_user_id
  ),
  group_rules as (
    select gp.permission_id, gp.effect
    from public.group_permissions gp
    join public.user_groups ug on ug.group_id = gp.group_id
    join public.groups g       on g.id = gp.group_id
    where ug.user_id = p_user_id and g.is_active
  )
  select
    p.code,
    case
      when exists (select 1 from user_rules  r where r.permission_id = p.id and r.effect = 'DENY')  then false
      when exists (select 1 from group_rules r where r.permission_id = p.id and r.effect = 'DENY')  then false
      when exists (select 1 from user_rules  r where r.permission_id = p.id and r.effect = 'ALLOW') then true
      when exists (select 1 from group_rules r where r.permission_id = p.id and r.effect = 'ALLOW') then true
      else false
    end,
    case
      when exists (select 1 from user_rules  r where r.permission_id = p.id and r.effect = 'DENY')  then 'USER_DENY'
      when exists (select 1 from group_rules r where r.permission_id = p.id and r.effect = 'DENY')  then 'GROUP_DENY'
      when exists (select 1 from user_rules  r where r.permission_id = p.id and r.effect = 'ALLOW') then 'USER_ALLOW'
      when exists (select 1 from group_rules r where r.permission_id = p.id and r.effect = 'ALLOW') then 'GROUP_ALLOW'
      else 'NONE'
    end
  from public.permissions p;
end;
$$;

comment on function public.effective_permissions(uuid) is
  'Permissions effectives et leur origine (individuelle / héritée / refus), pour l''onglet Permissions.';


-- Codes des permissions accordées à l'utilisateur courant.
-- Consommé par la couche d'accès aux données pour construire la navigation et
-- décider de l'affichage des actions. Ne remplace jamais la vérification
-- unitaire côté serveur avant l'exécution d'une action (§85).
create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select permission_code
  from public.effective_permissions(auth.uid())
  where granted;
$$;

comment on function public.my_permissions() is
  'Permissions accordées à l''utilisateur courant. Sert à l''affichage, jamais de garantie à elle seule.';


-- --- Protection contre l'escalade de privilèges -----------------------------
-- Source : 05_Regles_Metier/05_Permissions.md §42 et §90.3 —
-- « Un utilisateur ne doit pas pouvoir s'attribuer lui-même des permissions. »
-- Contrôle en base : reste vrai même si l'application est contournée.

create or replace function public.fn_prevent_self_privilege_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := public.current_actor();
  v_target uuid;
  v_row    jsonb;
begin
  -- NEW et OLD sont des enregistrements : ils sont convertis explicitement en
  -- jsonb selon l'opération. `coalesce(new, old)` sur des types record n'est
  -- pas une construction fiable en PL/pgSQL.
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  -- Opération système (migration, seed, tâche planifiée) : autorisée.
  if v_actor is not null then
    v_target := (v_row ->> 'user_id')::uuid;

    if v_target = v_actor then
      raise exception
        'Opération refusée : un utilisateur ne peut pas modifier ses propres droits d''accès.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger user_permissions_no_self_change
  before insert or update or delete on public.user_permissions
  for each row execute function public.fn_prevent_self_privilege_change();

create trigger user_groups_no_self_change
  before insert or update or delete on public.user_groups
  for each row execute function public.fn_prevent_self_privilege_change();


-- Nul ne peut se promouvoir Super Admin, ni modifier son propre statut de compte.
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

  return new;
end;
$$;

create trigger app_users_no_self_promotion
  before update on public.app_users
  for each row execute function public.fn_prevent_self_promotion();
