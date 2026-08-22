-- =============================================================================
-- ADIKOM PILOT — 026 · Permissions d'export, de téléchargement et d'impression
-- DEC-024 — arbitrage ADIKOM du 22 août 2026
--
-- RÈGLE APPLIQUÉE
--
-- « Aucune fonctionnalité contrôlable par utilisateur ne doit être
--   implicitement autorisée par une autre permission lorsqu'elle peut
--   raisonnablement faire l'objet d'une attribution indépendante. »
--
-- Exporter une liste, obtenir un document PDF et l'imprimer sont trois
-- capacités distinctes de la consultation. Un utilisateur peut désormais
-- recevoir l'une sans les autres.
--
-- PÉRIMÈTRE
--
-- Seules les capacités RÉELLEMENT prévues au développement en cours sont
-- ajoutées. Aucune permission n'est créée « au cas où » : le catalogue
-- représente ce que le SaaS sait faire, pas ce qu'il pourrait faire.
--
--   · pas de `download`/`print` pour les catégories — une « fiche catégorie »
--     n'a aucun usage documentaire ;
--   · rien pour la disponibilité — c'est un onglet de la fiche véhicule,
--     couvert par les permissions du parc ;
--   · rien pour les tarifs préférentiels — leurs capacités sont déjà
--     couvertes par `rental.pricing.*` et `parties.clients.pricing.*`.
--
-- Les libellés de module et de menu, ainsi que les ordres d'affichage, sont
-- repris des lignes existantes du même menu : le catalogue reste cohérent sans
-- que ces valeurs soient recopiées, donc sans risque de divergence.
-- =============================================================================

with nouvelles (code, module_code, menu_code, action, label, sensitive, rang) as (values
  -- === Tiers · Clients ======================================================
  -- Sensibles : ces documents sortent du système avec des données personnelles.
  ('parties.clients.download',   'parties', 'clients',    'DOWNLOAD', 'Télécharger la fiche client en PDF',        true, 1),
  ('parties.clients.print',      'parties', 'clients',    'PRINT',    'Imprimer la fiche client',                  true, 2),

  -- === Tiers · Fournisseurs =================================================
  ('parties.suppliers.download', 'parties', 'suppliers',  'DOWNLOAD', 'Télécharger la fiche fournisseur en PDF',   true, 1),
  ('parties.suppliers.print',    'parties', 'suppliers',  'PRINT',    'Imprimer la fiche fournisseur',             true, 2),

  -- === Tiers · Partenariats =================================================
  ('parties.partners.export',    'parties', 'partners',   'EXPORT',   'Exporter la liste des partenaires',         true, 1),
  ('parties.partners.download',  'parties', 'partners',   'DOWNLOAD', 'Télécharger la fiche partenaire en PDF',    true, 2),
  ('parties.partners.print',     'parties', 'partners',   'PRINT',    'Imprimer la fiche partenaire',              true, 3),

  -- === Location · Parc automobile ===========================================
  -- Non sensibles : l'identification d'un véhicule ne l'est pas. La relation
  -- commerciale qu'expose l'export est traitée à part, plus bas.
  ('rental.fleet.download',      'rental',  'fleet',      'DOWNLOAD', 'Télécharger la fiche véhicule en PDF',      false, 1),
  ('rental.fleet.print',         'rental',  'fleet',      'PRINT',    'Imprimer la fiche véhicule',                false, 2),

  -- === Location · Catégories ================================================
  ('rental.categories.export',   'rental',  'categories', 'EXPORT',   'Exporter les catégories',                   false, 1),

  -- === Location · Tarification ==============================================
  -- Sensibles : une grille tarifaire est une condition commerciale (§30).
  ('rental.pricing.export',      'rental',  'pricing',    'EXPORT',   'Exporter la grille tarifaire',              true, 1),
  ('rental.pricing.download',    'rental',  'pricing',    'DOWNLOAD', 'Télécharger la grille tarifaire en PDF',    true, 2),
  ('rental.pricing.print',       'rental',  'pricing',    'PRINT',    'Imprimer la grille tarifaire',              true, 3)
)
insert into public.permissions (
  code, module_code, module_label, menu_code, menu_label,
  submenu_code, submenu_label, action, label, is_sensitive,
  module_order, menu_order, submenu_order, action_order
)
select
  n.code,
  n.module_code,
  ref.module_label,
  n.menu_code,
  ref.menu_label,
  null,
  null,
  n.action::public.permission_action,
  n.label,
  n.sensitive,
  ref.module_order,
  ref.menu_order,
  -- Les nouvelles actions se placent à la suite de celles du menu.
  ref.last_order + n.rang,
  case n.action
    when 'EXPORT'   then 7
    when 'DOWNLOAD' then 8
    when 'PRINT'    then 9
    else 99
  end
from nouvelles n
join lateral (
  select
    p.module_label,
    p.menu_label,
    p.module_order,
    p.menu_order,
    max(p.submenu_order) over () as last_order
  from public.permissions p
  where p.module_code = n.module_code
    and p.menu_code   = n.menu_code
  limit 1
) ref on true
on conflict (code) do update set
  module_label  = excluded.module_label,
  menu_label    = excluded.menu_label,
  label         = excluded.label,
  is_sensitive  = excluded.is_sensitive,
  module_order  = excluded.module_order,
  menu_order    = excluded.menu_order,
  submenu_order = excluded.submenu_order,
  action_order  = excluded.action_order;


-- --- Sensibilité de l'export du parc ------------------------------------------
--
-- `rental.fleet.export` était la seule permission d'export non sensible, alors
-- que `parties.clients.export` et `parties.suppliers.export` le sont.
--
-- L'inspection du contenu réel de l'export tranche la question : la liste du
-- parc porte, véhicule par véhicule, le FOURNISSEUR ou le PARTENAIRE qui le met
-- à disposition. Le fichier expose donc la cartographie des relations
-- commerciales d'ADIKOM — exactement ce qui rend l'export des fournisseurs
-- sensible. Le rendre non sensible permettrait d'obtenir par le parc ce que
-- l'on refuse par les tiers.
--
-- Il est aligné. C'est la seule ligne existante modifiée par cette migration.
update public.permissions
   set is_sensitive = true
 where code = 'rental.fleet.export';


-- --- Ordre d'affichage de l'action « Imprimer » --------------------------------
-- `DOWNLOAD` s'intercale entre exporter et imprimer : la seule permission
-- PRINT antérieure (facture client) est réalignée pour que l'ordre des actions
-- reste le même partout.
update public.permissions
   set action_order = 9
 where action = 'PRINT'
   and action_order <> 9;
