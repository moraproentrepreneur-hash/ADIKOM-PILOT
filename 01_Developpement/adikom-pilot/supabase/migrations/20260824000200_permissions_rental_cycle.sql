-- =============================================================================
-- ADIKOM PILOT — 032 · Capacités documentaires des réservations et des locations
-- DEC-024 · DEC-025 — arbitrage ADIKOM du 24 août 2026
--
-- POURQUOI CES SIX PERMISSIONS
--
-- La migration 026 avait doté clients, fournisseurs, partenaires, parc,
-- catégories et tarification de leurs capacités d'export, de téléchargement et
-- d'impression. Les réservations et les locations n'existaient pas encore
-- fonctionnellement : elles n'en avaient reçu aucune.
--
-- L'Étape 2.3 produit des documents CONTRACTUELS — contrat de location, bon de
-- départ, procès-verbal de retour — et des listes exportables. DEC-024 interdit
-- de les faire dépendre de « voir » :
--
--   « Aucune fonctionnalité contrôlable par utilisateur ne doit être
--     implicitement autorisée par une autre permission lorsqu'elle peut
--     raisonnablement faire l'objet d'une attribution indépendante. »
--
-- Catalogue : 148 → 154.
--
-- POURQUOI PAS DAVANTAGE
--
-- Aucune permission n'est créée « au cas où » (CLAUDE.md §19 bis). En
-- particulier, aucun document de réservation n'est prévu — une réservation
-- n'est pas un engagement remis au client — et aucune permission de contrôle
-- distincte n'est introduite : DEC-025 §b retient `rental.rentals.close` pour
-- la transition « À contrôler → À facturer ».
--
-- TOUTES SENSIBLES
--
-- Ces documents et ces classeurs portent l'identité du client, la période
-- d'engagement et le MONTANT verrouillé. C'est exactement ce qui rend sensibles
-- `parties.clients.export` et `rental.pricing.export`. L'accès aux montants
-- reste en outre soumis à `rental.rentals.financial.view`, indépendante.
-- =============================================================================

with nouvelles (code, module_code, menu_code, action, label, sensitive, rang) as (values
  -- === Location · Réservations ==============================================
  ('rental.reservations.export',   'rental', 'reservations', 'EXPORT',
   'Exporter la liste des réservations',            true, 1),
  ('rental.reservations.download', 'rental', 'reservations', 'DOWNLOAD',
   'Télécharger un document de réservation en PDF', true, 2),
  ('rental.reservations.print',    'rental', 'reservations', 'PRINT',
   'Imprimer un document de réservation',           true, 3),

  -- === Location · Locations =================================================
  ('rental.rentals.export',        'rental', 'rentals',      'EXPORT',
   'Exporter la liste des locations',               true, 1),
  ('rental.rentals.download',      'rental', 'rentals',      'DOWNLOAD',
   'Télécharger les documents de location en PDF',  true, 2),
  ('rental.rentals.print',         'rental', 'rentals',      'PRINT',
   'Imprimer les documents de location',            true, 3)
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
  -- Les nouvelles actions se placent à la suite de celles du menu, exactement
  -- comme la migration 026 les avait placées pour les autres menus.
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
