-- =============================================================================
-- ADIKOM PILOT — 061 · Le droit de désactiver un groupe
-- Phase 4 — Organisation, LOT 14 (correctif découvert par la recette)
--
-- CE QUE LA RECETTE A DÉCOUVERT
--
-- La migration 060 a posé `fn_group_write_guard` : désactiver un groupe exige
-- désormais `users.groups.archive`, et non plus `.update`.
--
-- La recette de production a alors montré que PERSONNE ne pouvait plus
-- désactiver un groupe :
--
--   · un compte de `users.groups.update` passe la policy, mais le déclencheur
--     lui refuse l'acte — c'est voulu ;
--   · un compte de `users.groups.archive` se voit refuser l'écriture par la
--     POLICY elle-même, avant même d'atteindre le déclencheur.
--
-- La policy `groups_update` de la migration 006 n'admettait que
-- `users.groups.update`. Elle datait d'un temps où aucun écran n'écrivait dans
-- cette table : la contradiction dormait, sans effet, jusqu'à ce que le LOT 14
-- livre l'écran.
--
-- LA RÉPARTITION CORRECTE, ET C'EST CELLE DE DEC-035 §b
--
--   La POLICY dit QUI PEUT ÉCRIRE dans la table.
--   Le DÉCLENCHEUR dit QUI PEUT ACCOMPLIR CET ACTE-LÀ.
--
-- La policy `projects_update` (migration 058) admet déjà `projects.update` OU
-- `projects.archive`, et `fn_project_write_guard` tranche ensuite. Les groupes
-- suivent la même règle : deux capacités ouvrent la porte, une seule ouvre
-- chaque geste.
--
-- AUCUNE CAPACITÉ N'EST CRÉÉE NI ÉLARGIE. `users.groups.archive` faisait déjà
-- ce que son libellé annonce — « Supprimer / désactiver un groupe » — pour la
-- suppression (`groups_delete`) ; elle le fait désormais aussi pour la
-- désactivation, qui est l'autre moitié de la même phrase.
-- =============================================================================

drop policy if exists groups_update on public.groups;

create policy groups_update on public.groups
  for update to authenticated
  using (
    public.has_permission('users.groups.update')
    or public.has_permission('users.groups.archive')
  )
  with check (
    public.has_permission('users.groups.update')
    or public.has_permission('users.groups.archive')
  );

comment on table public.groups is
  'Groupes de permissions. La policy dit qui peut écrire ; `fn_group_write_guard` dit qui peut modifier et qui peut désactiver (DEC-024).';
