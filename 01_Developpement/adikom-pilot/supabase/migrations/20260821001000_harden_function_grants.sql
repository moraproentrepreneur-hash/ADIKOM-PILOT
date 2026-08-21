-- =============================================================================
-- ADIKOM PILOT — 020 · Droits d'exécution des fonctions
-- Étape 2.2 (DEC-021)
--
-- PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction créée, et le rôle
-- `anon` en fait partie. La plupart des fonctions du projet s'exécutent avec
-- les droits de l'appelant : RLS les rend inoffensives pour un visiteur non
-- authentifié, qui ne voit aucune ligne.
--
-- `next_number` fait exception : elle est SECURITY DEFINER — elle doit l'être,
-- puisqu'elle incrémente un compteur que l'application n'a pas le droit
-- d'écrire directement. Sans révocation, un visiteur muni de la seule clé
-- publique pouvait donc consommer des numéros de client, de véhicule ou de
-- facture, et creuser des trous dans une numérotation qui doit rester
-- continue et explicable (DEC-005, Module 09 §16).
--
-- L'accès est retiré au rôle anonyme, et à lui seul : les utilisateurs
-- authentifiés continuent d'en avoir besoin, sous le contrôle des permissions
-- vérifiées par les actions serveur.
-- =============================================================================

revoke execute on function public.next_number(text) from anon;

-- Fonctions du référentiel : elles s'exécutent avec les droits de l'appelant et
-- ne renvoient donc rien à un visiteur anonyme. La révocation retire malgré
-- tout la surface d'appel : une fonction qu'on ne peut pas invoquer n'a pas
-- besoin d'être analysée pour savoir si elle fuit quelque chose.
revoke execute on function public.set_vehicle_supplier(uuid, uuid, public.vehicle_origin, date, text) from anon;
revoke execute on function public.resolve_pricing_rule(uuid, uuid, date) from anon;
revoke execute on function public.is_vehicle_available(uuid, tstzrange) from anon;
revoke execute on function public.vehicle_calendar(uuid, tstzrange) from anon;
