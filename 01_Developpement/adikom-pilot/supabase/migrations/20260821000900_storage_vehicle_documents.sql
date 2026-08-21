-- =============================================================================
-- ADIKOM PILOT — 019 · Stockage des documents de véhicule
-- Étape 2.2 (DEC-021 §2)
--
-- Bucket PRIVÉ. Aucune policy n'est créée sur `storage.objects` pour les rôles
-- `anon` et `authenticated` : sans policy, RLS refuse tout. C'est délibéré.
--
-- L'accès aux fichiers suit un chemin unique et contrôlé :
--
--   navigateur → action serveur → requirePermission('rental.documents.view')
--              → client d'administration → URL signée de courte durée
--
-- Le navigateur ne parle jamais au stockage directement. Un utilisateur qui
-- devinerait le chemin d'un objet n'obtiendrait rien : ni le rôle `anon`, ni un
-- compte authentifié ne peuvent lire le bucket.
--
-- Ce choix vaut aussi protection contre la dérive : personne ne peut « ouvrir
-- un peu » l'accès en modifiant un composant d'interface.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-documents',
  'vehicle-documents',
  false,
  10485760,                          -- 10 Mio par fichier
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
  set public             = false,    -- ne peut jamais devenir public par accident
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
