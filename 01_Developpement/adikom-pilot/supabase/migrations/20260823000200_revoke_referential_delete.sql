-- =============================================================================
-- ADIKOM PILOT — 029 · Retrait du droit DELETE resté accordé
--
-- CE QUE LA RECETTE A RÉVÉLÉ
--
-- Le test n° 2 de `supabase/tests/location.sql` vérifiait qu'aucune policy
-- DELETE n'existait sur le référentiel. Il ne vérifiait pas le DROIT lui-même,
-- ni les policies `for all` — lesquelles couvrent pourtant la suppression.
--
-- Renforcé en même temps que la migration 028, il a signalé trois tables où
-- `authenticated` conserve le droit DELETE :
--
--   · vehicle_categories
--   · vehicle_supplier_history
--   · vehicle_documents
--
-- CE QUE CELA CHANGE : RIEN, AUJOURD'HUI
--
-- Aucune de ces tables ne porte de policy couvrant DELETE : RLS refuse déjà la
-- suppression, et l'application n'en émet aucune. Le droit est donc inerte.
--
-- CE QUE CELA ÉVITE, DEMAIN
--
-- C'est exactement la combinaison qui a rendu `supplier_bank_details`
-- réellement supprimable : le droit était resté accordé, et une policy
-- `for all` ajoutée plus tard a ouvert la porte sans que personne ne l'écrive.
-- Une seule des deux barrières manquait à chaque fois.
--
-- La migration 018 avait posé la règle pour cinq tables — clients, suppliers,
-- vehicles, pricing_rules, vehicle_occupations. Ces trois-là avaient été
-- omises. L'intention du projet est appliquée partout (CLAUDE.md §22,
-- DEC-011, DEC-020).
-- =============================================================================

revoke delete on public.vehicle_categories        from authenticated;
revoke delete on public.vehicle_supplier_history  from authenticated;
revoke delete on public.vehicle_documents         from authenticated;
