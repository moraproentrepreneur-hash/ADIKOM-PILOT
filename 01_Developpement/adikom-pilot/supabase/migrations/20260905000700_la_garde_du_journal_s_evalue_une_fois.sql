-- =============================================================================
-- ADIKOM PILOT — 066 · La garde du journal s'évalue une fois, pas par ligne
-- Phase 4 — Organisation, LOT 15 (Module 08 §56)
--
-- LE DÉFAUT, MESURÉ PLUTÔT QUE SUPPOSÉ
--
-- La recette de production a montré deux écrans du journal rendant une page
-- d'erreur : une recherche sans résultat, et une page hors bornes. Le plan
-- d'exécution, relevé sous le rôle `authenticated` avec une session réelle,
-- dit pourquoi :
--
--   Seq Scan on audit_log
--     Filter: (has_permission('users.audit.view', …) AND (entity_label ~~* …))
--     Rows Removed by Filter: 47433
--     Execution Time: 2405 ms
--
-- `has_permission` figure dans le filtre de LIGNE. Elle est donc appelée une
-- fois PAR LIGNE — 47 433 fois pour une seule recherche. Chaque appel interroge
-- les permissions individuelles, les groupes et le statut du compte.
--
-- Deux requêtes composent un écran (le décompte, puis la page), et
-- `audit_actors()` en ajoute une troisième. Le tout dépassait le délai maximal
-- d'une requête, et l'écran affichait une panne là où il n'y avait qu'une
-- recherche infructueuse.
--
-- CE QUI CHANGE, ET CE QUI NE CHANGE PAS
--
-- La condition est enveloppée dans un sous-select. PostgreSQL la reconnaît
-- alors comme un InitPlan : elle est évaluée UNE FOIS, avant le parcours, et
-- son résultat sert de constante.
--
-- LA RÈGLE D'ACCÈS EST STRICTEMENT LA MÊME. `users.audit.view` reste exigée,
-- le refus reste total, et rien de nouveau ne devient lisible : la fonction
-- appelée est la même, avec le même argument, pour le même appelant. Seul le
-- NOMBRE d'appels change.
--
-- POURQUOI SEULEMENT CETTE TABLE
--
-- Toutes les policies du SaaS écrivent `has_permission(...)` de cette façon, et
-- c'est sans conséquence tant que la table est petite : le coût est
-- proportionnel au nombre de lignes examinées. `audit_log` est la seule table
-- dont le volume dépend de la DURÉE d'exploitation plutôt que de l'activité —
-- elle passe déjà 47 000 lignes et ne décroîtra jamais.
--
-- Le point est signalé pour les autres tables ; il n'y est pas corrigé sans
-- nécessité mesurée (CLAUDE.md §29).
-- =============================================================================

drop policy if exists audit_log_select on public.audit_log;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.has_permission('users.audit.view')));

comment on table public.audit_log is
  'Journal d''audit en écriture seule. Toute opération sensible y est tracée, Super Admin compris. Lecture sous users.audit.view, évaluée une fois par requête.';


-- Les index de trigramme viennent d'être créés (migration 065) : sans
-- statistiques à jour, le planificateur continue de leur préférer un parcours
-- complet, et la correction ci-dessus n'aurait servi qu'à moitié.
analyze public.audit_log;
