-- =============================================================================
-- ADIKOM PILOT — 011 · Protection de la lecture des permissions d'autrui
--
-- `effective_permissions(uuid)` est en SECURITY DEFINER : elle contourne RLS
-- par construction, afin de pouvoir lire les tables de droits sans récursion.
--
-- Elle ne comportait aucun contrôle interne. N'importe quel utilisateur
-- authentifié pouvait donc l'appeler avec l'identifiant d'un collègue et
-- obtenir la liste complète de ses droits — une cartographie précise de qui
-- peut faire quoi dans le système.
--
-- Ce n'était exploitable que par un compte déjà authentifié, mais cela
-- contrevient au principe selon lequel les permissions d'un utilisateur sont
-- une information sensible (05_Regles_Metier/05_Permissions.md §62 et §71).
--
-- La fonction vérifie désormais l'autorisation de l'appelant. Aucun autre
-- comportement n'est modifié.
-- =============================================================================

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
  -- Chacun peut consulter ses propres droits. Consulter ceux d'autrui exige
  -- la permission dédiée. Le Super Admin conserve la vue d'ensemble.
  if p_user_id is distinct from auth.uid()
     and not public.has_permission('users.users.permissions.view')
     and not public.is_super_admin()
  then
    raise exception
      'Vous ne disposez pas des droits nécessaires pour consulter ces permissions.'
      using errcode = 'insufficient_privilege';
  end if;

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
  'Permissions effectives et leur origine. Consulter celles d''autrui exige users.users.permissions.view.';
