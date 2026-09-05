-- =============================================================================
-- ADIKOM PILOT — 063 · L'héritage se lit sans ouvrir les groupes
-- Phase 4 — Organisation, LOT 14 (correctif découvert par la recette)
--
-- CE QUE LA RECETTE A DÉCOUVERT
--
-- Un compte détenant `users.users.permissions.view` — donc autorisé à consulter
-- les droits d'un collègue — mais NON `users.groups.view`, ouvrait l'onglet
-- « Permissions » d'une fiche et y lisait « Non défini » sur une permission
-- que le GROUPE de cette personne refusait explicitement.
--
-- LA CAUSE : l'écran lisait l'héritage par une requête DIRECTE sur
-- `group_permissions`, dont la policy exige `users.groups.view`. RLS ne lève
-- pas, elle masque : la requête rendait zéro règle, et l'interface concluait
-- « aucune règle de groupe ».
--
-- CE QUE CELA PRODUISAIT, ET POURQUOI C'EST GRAVE
--
-- Le Module 08 §48 exige que l'interface distingue quatre états sans
-- ambiguïté : accordé, refusé, HÉRITÉ, non défini. Confondre « hérité » et
-- « non défini » n'est pas une imprécision d'affichage :
--
--   · sur un refus hérité, l'administrateur croit la question ouverte ;
--   · sur une AUTORISATION héritée, il lit « non défini » sur un droit que la
--     personne détient réellement — l'écran affirme le contraire de la vérité ;
--   · et le sélecteur, en repassant sur « Non défini », recalculait le résultat
--     à partir de cet héritage absent.
--
-- Un total faux fait autorité plus longtemps qu'un total absent (DEC-034 §a).
--
-- LA CORRECTION
--
-- L'héritage est désormais rendu par `effective_permissions()` elle-même, qui
-- est en SECURITY DEFINER et vérifie déjà sa propre autorisation depuis la
-- migration 011 : qui a le droit de voir les droits d'une personne a le droit
-- d'en connaître l'origine. La colonne `inherited_effect` porte le verdict des
-- GROUPES SEULS — ALLOW, DENY, ou NULL —, indépendamment de la règle
-- individuelle qui le masque dans `source`.
--
-- AUCUNE CAPACITÉ N'EST CRÉÉE NI ÉLARGIE. `users.groups.view` reste nécessaire
-- pour ouvrir la LISTE des groupes et voir ce que chacun accorde ; elle ne
-- l'était pas, et ne l'est toujours pas, pour lire l'origine d'un droit sur la
-- fiche d'une personne dont on administre déjà les permissions.
-- =============================================================================

-- Le type de retour change : `create or replace` ne le permet pas.
drop function if exists public.effective_permissions(uuid);

create function public.effective_permissions(p_user_id uuid default auth.uid())
returns table (
  permission_code  text,
  granted          boolean,
  source           text,  -- SUPER_ADMIN · USER_DENY · GROUP_DENY · USER_ALLOW · GROUP_ALLOW · NONE
  inherited_effect text   -- ALLOW · DENY · NULL — verdict des GROUPES SEULS
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

  -- Le Super Admin tient ses droits du rôle système : aucun groupe n'y entre,
  -- l'héritage est donc vide et non pas « accordé par un groupe ».
  if v_super then
    return query
      select p.code, true, 'SUPER_ADMIN'::text, null::text from public.permissions p;
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
    end,
    /*
     * L'HÉRITAGE SEUL, MÊME LORSQU'UNE RÈGLE INDIVIDUELLE LE MASQUE.
     *
     * `source` dit ce qui l'emporte ; `inherited_effect` dit ce que les groupes
     * décident. L'écran a besoin des deux : sans le second, repasser une
     * permission sur « Non défini » recalculerait le résultat à partir d'un
     * héritage inconnu — et annoncerait « aucun droit » là où le groupe accorde.
     *
     * Un refus de groupe prime sur une autorisation de groupe (DEC-009).
     */
    case
      when exists (select 1 from group_rules r where r.permission_id = p.id and r.effect = 'DENY')  then 'DENY'
      when exists (select 1 from group_rules r where r.permission_id = p.id and r.effect = 'ALLOW') then 'ALLOW'
      else null
    end
  from public.permissions p;
end;
$$;

comment on function public.effective_permissions(uuid) is
  'Permissions effectives, leur origine et le verdict des groupes seuls (Module 08 §48). Consulter celles d''autrui exige users.users.permissions.view.';


-- --- Droits d'exécution — DEC-022 --------------------------------------------
-- La fonction ayant été recréée, ses droits le sont aussi.

revoke execute on function public.effective_permissions(uuid) from public;
grant  execute on function public.effective_permissions(uuid) to authenticated;
