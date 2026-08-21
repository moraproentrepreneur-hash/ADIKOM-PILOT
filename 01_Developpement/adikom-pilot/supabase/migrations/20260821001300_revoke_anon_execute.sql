-- =============================================================================
-- ADIKOM PILOT — 023 · Retrait effectif des droits d'exécution au rôle anonyme
-- Étape 2.2 (DEC-021) — complète les migrations 020 et 022
--
-- POURQUOI UNE TROISIÈME MIGRATION
--
-- Deux sources de droits coexistaient, et il fallait fermer les deux :
--
--   1. PostgreSQL accorde EXECUTE à **PUBLIC** sur toute fonction créée.
--      → traité par la migration 022.
--
--   2. Supabase accorde EXECUTE **directement** au rôle `anon` (et à
--      `authenticated`, `service_role`) via les privilèges par défaut du schéma
--      `public`. Ce droit-là est propre au rôle : révoquer à PUBLIC ne le
--      retire pas.
--      → traité ici.
--
-- La recette de sécurité a montré la différence de façon nette : après la
-- migration 022, `next_number` était bien refusée — parce que la migration 020
-- avait, elle, révoqué au rôle `anon` — tandis que `log_audit`,
-- `has_permission`, `is_super_admin` et `my_permissions` restaient appelables
-- avec la seule clé publique.
--
-- Enseignement : sur PostgreSQL, un droit ne se retire pas « en général ». Il se
-- retire à chaque source qui l'accorde. Un contrôle de sécurité qui ne mesure
-- que l'intention — la présence d'un REVOKE — ne prouve rien ; seul l'essai
-- réel, avec la clé publique, fait foi.
-- =============================================================================

revoke execute on function public.current_actor()                       from anon;
revoke execute on function public.is_super_admin(uuid)                  from anon;
revoke execute on function public.has_permission(text, uuid)            from anon;
revoke execute on function public.effective_permissions(uuid)           from anon;
revoke execute on function public.my_permissions()                      from anon;
revoke execute on function public.record_login()                        from anon;

revoke execute on function public.log_audit(
  public.audit_action, text, text, text, text, jsonb, jsonb, text, text, public.audit_result
) from anon;

revoke execute on function public.set_vehicle_supplier(
  uuid, uuid, public.vehicle_origin, date, text
) from anon;
revoke execute on function public.resolve_pricing_rule(uuid, uuid, date) from anon;
revoke execute on function public.is_vehicle_available(uuid, tstzrange)  from anon;
revoke execute on function public.vehicle_calendar(uuid, tstzrange)      from anon;


-- --- Fermeture de la source --------------------------------------------------
--
-- Sans cela, toute fonction créée par une migration ultérieure recevrait de
-- nouveau EXECUTE pour `anon`, et la correction serait à refaire à chaque fois.
-- Les droits nécessaires restent accordés explicitement, fonction par fonction :
-- c'est le principe du moindre privilège appliqué à la lettre
-- (05_Regles_Metier/05_Permissions.md §87 — l'absence de permission entraîne
-- un refus).
--
-- `authenticated` et `service_role` conservent le comportement par défaut : les
-- fonctions du projet leur sont destinées, et une révocation générale les
-- priverait des fonctions évaluées à l'intérieur des policies RLS.

alter default privileges in schema public revoke execute on functions from anon;

comment on schema public is
  'Schéma applicatif ADIKOM PILOT. Le rôle anonyme n''y détient aucun droit d''exécution par défaut (migration 023).';
