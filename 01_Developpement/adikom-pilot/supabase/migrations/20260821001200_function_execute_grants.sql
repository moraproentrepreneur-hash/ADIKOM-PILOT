-- =============================================================================
-- ADIKOM PILOT — 022 · Droits d'exécution : révocation à PUBLIC
-- Étape 2.2 (DEC-021) — corrige la migration 020, insuffisante
--
-- DÉFAUT CONSTATÉ
--
-- La migration 020 révoquait l'exécution au rôle `anon`. C'était sans effet :
-- PostgreSQL accorde EXECUTE à **PUBLIC** sur toute fonction créée, et `anon`
-- hérite de PUBLIC. Retirer un droit à un rôle ne retire pas celui qu'il tient
-- d'ailleurs.
--
-- La recette de sécurité du référentiel l'a mis en évidence : avec la seule clé
-- publique, sans aucun compte, il était possible d'appeler —
--
--   · `log_audit(...)`      → ÉCRIRE dans le journal d'audit. Le journal est
--                             la garantie de traçabilité du système ; il est
--                             volontairement inaltérable, ce qui signifie
--                             qu'une entrée injectée ne peut plus jamais en
--                             être retirée. Injecter, c'est falsifier
--                             (05_Regles_Metier/06_Audit.md §40 et §77).
--   · `next_number(...)`    → consommer des numéros de client, de véhicule ou
--                             de facture, et trouer une numérotation qui doit
--                             rester continue (Module 09 §16).
--   · `has_permission(...)` → éprouver les droits d'un compte donné.
--   · `is_super_admin(...)` → identifier les comptes d'administration.
--
-- CORRECTION
--
-- L'exécution est retirée à PUBLIC, puis accordée explicitement aux seuls rôles
-- qui en ont besoin. Le principe suivi est celui du moindre privilège
-- (05_Regles_Metier/05_Permissions.md §87) : un droit s'accorde, il ne se
-- suppose pas.
--
-- `anon` ne conserve aucune fonction : ADIKOM PILOT est un SaaS interne, et un
-- visiteur non authentifié n'a rien à y faire d'autre que consulter la page de
-- présentation et se connecter (DEC-003, DEC-015).
--
-- Les fonctions de déclenchement (`fn_*`) ne sont pas concernées : elles sont
-- appelées par le moteur de triggers, jamais directement, et PostgREST ne les
-- expose pas.
-- =============================================================================

-- --- Moteur d'autorisation --------------------------------------------------
-- Ces fonctions sont évaluées à l'intérieur des policies RLS : le rôle
-- `authenticated` doit pouvoir les exécuter, sans quoi toute lecture échouerait.

revoke execute on function public.current_actor() from public;
grant  execute on function public.current_actor() to authenticated, service_role;

revoke execute on function public.is_super_admin(uuid) from public;
grant  execute on function public.is_super_admin(uuid) to authenticated, service_role;

revoke execute on function public.has_permission(text, uuid) from public;
grant  execute on function public.has_permission(text, uuid) to authenticated, service_role;

revoke execute on function public.effective_permissions(uuid) from public;
grant  execute on function public.effective_permissions(uuid) to authenticated, service_role;

revoke execute on function public.my_permissions() from public;
grant  execute on function public.my_permissions() to authenticated, service_role;


-- --- Journal d'audit ---------------------------------------------------------
-- Le plus sensible : une entrée écrite ne peut plus être retirée.

revoke execute on function public.log_audit(
  public.audit_action, text, text, text, text, jsonb, jsonb, text, text, public.audit_result
) from public;
grant execute on function public.log_audit(
  public.audit_action, text, text, text, text, jsonb, jsonb, text, text, public.audit_result
) to authenticated, service_role;

revoke execute on function public.record_login() from public;
grant  execute on function public.record_login() to authenticated, service_role;


-- --- Numérotation -------------------------------------------------------------

revoke execute on function public.next_number(text) from public;
grant  execute on function public.next_number(text) to authenticated, service_role;


-- --- Référentiel d'exploitation ----------------------------------------------
-- Ces fonctions s'exécutent avec les droits de l'appelant : RLS les rend déjà
-- muettes pour un visiteur anonyme. La révocation retire la surface d'appel
-- elle-même — une fonction qu'on ne peut pas invoquer n'a pas besoin d'être
-- analysée pour savoir ce qu'elle laisse filtrer.

revoke execute on function public.set_vehicle_supplier(
  uuid, uuid, public.vehicle_origin, date, text
) from public;
grant execute on function public.set_vehicle_supplier(
  uuid, uuid, public.vehicle_origin, date, text
) to authenticated, service_role;

revoke execute on function public.resolve_pricing_rule(uuid, uuid, date) from public;
grant  execute on function public.resolve_pricing_rule(uuid, uuid, date) to authenticated, service_role;

revoke execute on function public.is_vehicle_available(uuid, tstzrange) from public;
grant  execute on function public.is_vehicle_available(uuid, tstzrange) to authenticated, service_role;

revoke execute on function public.vehicle_calendar(uuid, tstzrange) from public;
grant  execute on function public.vehicle_calendar(uuid, tstzrange) to authenticated, service_role;
