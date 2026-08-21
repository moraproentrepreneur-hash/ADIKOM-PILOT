-- =============================================================================
-- ADIKOM PILOT — 021 · Portée de l'interdiction de suppression
-- Étape 2.2 (DEC-021), application de la portée déjà énoncée par DEC-020
--
-- CONSTAT
--
-- `fn_forbid_delete` refusait toute suppression, y compris pour le rôle de
-- service. Conséquence : une fiche créée par erreur — un véhicule saisi deux
-- fois, un client de test — restait définitivement en base, sans qu'aucune
-- opération d'environnement ne puisse la retirer. Les recettes automatisées ne
-- pouvaient pas davantage nettoyer leurs jeux d'essai, et devaient donc laisser
-- des lignes derrière elles dans la base réelle.
--
-- RÈGLE APPLIQUÉE
--
-- DEC-020 l'énonçait déjà pour le journal d'audit :
--   « un utilisateur se désactive, il ne se supprime pas. La suppression reste
--     réservée aux opérations d'environnement, hors interface. »
--
-- C'est exactement la distinction retenue ici :
--
--   · un utilisateur authentifié — donc toute action de l'application, qui
--     s'exécute toujours avec la session de son auteur — ne peut RIEN
--     supprimer. La règle métier reste entière : on archive, on ne supprime pas.
--
--   · une opération sans utilisateur authentifié — migration, script
--     d'environnement, correction par le rôle de service — reste possible.
--
-- Ce que cela ne change pas : le journal d'audit demeure protégé par
-- `fn_forbid_mutation`, qui refuse la suppression sans exception, quel que soit
-- le rôle (05_Regles_Metier/06_Audit.md §40 et §77).
-- =============================================================================

create or replace function public.fn_forbid_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- `current_actor()` renvoie NULL hors session applicative : migration, script
  -- d'environnement, tâche planifiée. L'application, elle, agit toujours avec
  -- la session de son utilisateur.
  if public.current_actor() is null then
    return old;
  end if;

  raise exception
    'Suppression refusée : cette donnée porte un historique métier. Elle doit être archivée (%).',
    tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function public.fn_forbid_delete() is
  'Refuse la suppression des données métier à tout utilisateur authentifié. Les opérations d''environnement restent possibles (DEC-020).';
