-- =============================================================================
-- ADIKOM PILOT — 069 · Stockage de l'identité visuelle
-- Phase 4 — Organisation, LOT 16 (Module 09 §6, §38, §39)
--
-- Bucket PRIVÉ, sans aucune policy sur `storage.objects` : sans policy, RLS
-- refuse tout. C'est le choix déjà fait pour les documents de véhicule
-- (migration 019), et il vaut ici pour la même raison.
--
-- Le chemin d'accès est unique et contrôlé :
--
--   navigateur → route serveur → session valide
--              → client d'administration → URL signée de courte durée
--
-- POURQUOI UN LOGO N'EST PAS UN FICHIER PUBLIC
--
-- Le logo lui-même n'a rien de secret. Mais un bucket public est lisible par
-- quiconque en devine le chemin, sans compte et sans trace — et « ADIKOM PILOT
-- ne propose aucun accès externe aux données » (DEC-015). Ouvrir un bucket
-- public pour une image créerait la seule exception à cette règle, et la
-- prochaine y semblerait naturelle.
--
-- CE QUI N'EST PAS FAIT ICI, ET POURQUOI
--
-- Les documents générés (factures, contrats) continuent d'employer le fichier
-- officiel EMBARQUÉ, et non ce logo téléversé. Deux raisons, toutes deux
-- documentées :
--
--   · `09_Parametres.md` §6 le prévoit explicitement — le logo « doit pouvoir
--     être utilisé dans les documents LORSQUE CETTE FONCTIONNALITÉ SERA
--     DÉVELOPPÉE » ;
--   · le moteur documentaire lit ses ressources sur disque, délibérément :
--     « un PDF ne doit pas dépendre d'un service extérieur au moment où un
--     utilisateur clique ».
--
-- Le point est porté aux arbitrages ouverts : ADIKOM décidera si un logo
-- téléversé doit remplacer le fichier officiel sur les documents émis.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  false,
  2097152,                           -- 2 Mio : un logo de document n'a pas à peser davantage
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]
)
on conflict (id) do update
  set public             = false,    -- ne peut jamais devenir public par accident
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
