-- =============================================================================
-- ADIKOM PILOT — 025 · Action « Télécharger » au catalogue des permissions
-- DEC-024 — règle d'attribution indépendante des capacités
--
-- POURQUOI UNE MIGRATION À ELLE SEULE
--
-- PostgreSQL interdit d'utiliser une valeur d'énumération dans la transaction
-- qui la crée. Le CLI Supabase enveloppant chaque migration dans une
-- transaction, ajouter `DOWNLOAD` puis l'employer dans le même fichier
-- échouerait sur « unsafe use of new value of enum type ».
--
-- L'ajout vit donc seul ici ; la migration 026 s'en sert.
--
-- `AFTER 'EXPORT'` place la valeur dans l'ordre naturel des actions —
-- consulter, créer, modifier, valider, annuler, archiver, exporter,
-- télécharger, imprimer, administrer — ce qui rend les tris par type d'action
-- lisibles sans traitement particulier.
-- =============================================================================

alter type public.permission_action add value if not exists 'DOWNLOAD' after 'EXPORT';
