-- =============================================================================
-- ADIKOM PILOT — 065 · Recherche dans le journal d'activité
-- Phase 4 — Organisation, LOT 15 (Module 08 §56 · Règles métier 06 §47, §48)
--
-- LE DÉFAUT MESURÉ
--
-- `06_Audit.md` §47 et §48 demandent de retrouver un événement par son OBJET et
-- par sa RÉFÉRENCE. L'écran le fait par `ilike '%terme%'` sur quatre colonnes —
-- une forme qu'AUCUN index B-tree ne peut servir, le motif ne commençant pas
-- par une constante.
--
-- Le journal comptant déjà plus de 47 000 lignes, chaque recherche balayait la
-- table DEUX FOIS : une pour compter, une pour lire la page. Mesuré à 2,5 s
-- depuis un poste, et cette durée ne cesse de croître — le journal est la seule
-- table du SaaS dont le volume dépend de la DURÉE d'exploitation plutôt que de
-- l'activité d'ADIKOM (Module 08 §56 : les listes doivent prévoir recherche et
-- chargement progressif).
--
-- LA CORRECTION
--
-- `pg_trgm` indexe des fragments de trois caractères, ce qui rend un
-- `ilike '%terme%'` servable par un index GIN. La recherche cesse de dépendre
-- du volume du journal.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
--
-- Elle ne change aucun comportement : mêmes colonnes cherchées, mêmes
-- résultats, mêmes droits. Elle ne crée ni table, ni capacité, ni colonne.
-- =============================================================================

create extension if not exists pg_trgm;

-- Les quatre colonnes que la recherche interroge, et elles seules.
--
-- `entity_label` — l'objet tel qu'il se nommait au moment de l'action (§47) ;
-- `entity_id`    — la référence de la ligne concernée (§48) ;
-- `reason`       — le motif, quand la règle métier en exige un (§11) ;
-- `comment`      — l'observation complémentaire (§12), qui porte notamment le
--                  code de la permission lors d'un changement de droits.
--
-- Aucun index sur `before_data` ni `after_data` : ces colonnes ne sont pas
-- cherchées, et ne sont même plus lisibles par l'application (DEC-038).

create index if not exists audit_log_entity_label_trgm_idx
  on public.audit_log using gin (entity_label gin_trgm_ops);

create index if not exists audit_log_entity_id_trgm_idx
  on public.audit_log using gin (entity_id gin_trgm_ops);

create index if not exists audit_log_reason_trgm_idx
  on public.audit_log using gin (reason gin_trgm_ops);

create index if not exists audit_log_comment_trgm_idx
  on public.audit_log using gin (comment gin_trgm_ops);
