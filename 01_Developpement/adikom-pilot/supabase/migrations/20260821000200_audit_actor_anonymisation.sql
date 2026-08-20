-- ============================================================================
-- Journal d'audit : rendre effective l'anonymisation de l'auteur
--
-- CONTRADICTION CONSTATÉE (CLAUDE.md §6)
--
-- `audit_log.actor_id` est déclarée « references app_users (id) on delete set
-- null » : le schéma prévoit donc explicitement la suppression d'un compte et
-- la mise à NULL de la référence. Mais le trigger `audit_log_no_update`
-- interdisait TOUT UPDATE, y compris cette cascade — la clause était donc
-- inopérante, et aucun compte ayant agi une seule fois ne pouvait être
-- supprimé, même par le rôle de service.
--
-- RÉSOLUTION
--
-- Une seule modification est désormais tolérée : passer `actor_id` de sa valeur
-- à NULL, sans qu'aucune autre colonne ne change. C'est exactement ce que la
-- clé étrangère déclare, et rien de plus.
--
-- Le journal reste lisible et complet : `actor_label` fige le nom de l'auteur
-- au moment de l'action, précisément pour que l'historique survive à la
-- disparition du compte (commentaire de la colonne, migration ...0400).
--
-- Toute autre écriture — modification d'une action, d'un motif, d'une valeur
-- avant/après, d'un horodatage — reste refusée, ainsi que toute suppression.
-- ============================================================================

create or replace function public.fn_audit_log_guard_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Anonymisation de la référence, et elle seule : l'auteur reste identifié par
  -- `actor_label`, aucune autre colonne n'est touchée.
  if old.actor_id is not null
     and new.actor_id is null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id')
  then
    return new;
  end if;

  raise exception
    'Cette table est en écriture seule : UPDATE interdit sur audit_log.'
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function public.fn_audit_log_guard_update() is
  'Journal d''audit : refuse toute modification, sauf la mise à NULL de actor_id prévue par la clé étrangère lors de la suppression d''un compte.';

drop trigger if exists audit_log_no_update on public.audit_log;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.fn_audit_log_guard_update();

-- La suppression reste interdite sans exception : le trigger
-- `audit_log_no_delete` demeure inchangé.
