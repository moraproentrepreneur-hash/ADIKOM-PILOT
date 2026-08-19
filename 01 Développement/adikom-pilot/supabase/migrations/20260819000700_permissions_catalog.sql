-- =============================================================================
-- ADIKOM PILOT — 007 · Catalogue des permissions
--
-- Reflète la navigation documentée
-- (02_Architecture_Fonctionnelle/02_Navigation.md §3) selon la structure
--   Module → Menu → Sous-menu → Action
-- exigée par 05_Regles_Metier/05_Permissions.md §16.
--
-- Une permission absente de ce catalogue n'existe pas : l'accès est refusé
-- (principe de confiance minimale, §87).
--
-- Les permissions marquées « sensibles » concernent les données financières,
-- bancaires, tarifaires ou administratives (§28 et §71).
-- =============================================================================

with modules (code, label, ord) as (values
  ('dashboard',     'Tableau de bord',        1),
  ('notifications', 'Centre de notifications', 2),
  ('projects',      'Projets & Planification', 3),
  ('parties',       'Tiers',                   4),
  ('rental',        'Gestion de location',     5),
  ('treasury',      'Banques & Caisses',       6),
  ('billing',       'Facturation & Paiement',  7),
  ('users',         'Utilisateurs & Groupes',  8),
  ('settings',      'Paramètres',              9)
),
menus (module_code, code, label, ord) as (values
  ('parties',  'clients',            'Clients',               1),
  ('parties',  'suppliers',          'Fournisseurs',          2),
  ('parties',  'partners',           'Partenariat',           3),

  ('rental',   'board',              'Tableau de location',   1),
  ('rental',   'reservations',       'Réservations',          2),
  ('rental',   'rentals',            'Locations',             3),
  ('rental',   'fleet',              'Parc automobile',       4),
  ('rental',   'categories',         'Catégories',            5),
  ('rental',   'pricing',            'Tarification',          6),
  ('rental',   'maintenance',        'Maintenance',           7),
  ('rental',   'incidents',          'Dommages & Incidents',  8),
  ('rental',   'documents',          'Documents',             9),

  ('treasury', 'accounts',           'Comptes',               1),
  ('treasury', 'entries',            'Écritures',             2),
  ('treasury', 'transfers',          'Virements internes',    3),

  ('billing',  'customer_invoices',  'Factures clients',      1),
  ('billing',  'supplier_invoices',  'Factures fournisseurs', 2),
  ('billing',  'misc_payments',      'Paiements divers',      3),

  ('users',    'users',              'Utilisateurs',          1),
  ('users',    'groups',             'Groupes',               2),
  ('users',    'audit',              'Journal d''activité',   3),

  ('settings', 'company',            'Entreprise',            1),
  ('settings', 'numbering',          'Numérotation',          2)
),
perms (code, module_code, menu_code, submenu_code, submenu_label, action, label, sensitive, ord) as (values

  -- === Tableau de bord ======================================================
  ('dashboard.view',                    'dashboard', null, null, null, 'VIEW',   'Accéder au tableau de bord',              false, 1),
  ('dashboard.financial.view',          'dashboard', null, null, null, 'VIEW',   'Voir les indicateurs financiers',         true,  2),
  ('dashboard.fleet.view',              'dashboard', null, null, null, 'VIEW',   'Voir les indicateurs du parc',            false, 3),

  -- === Centre de notifications ==============================================
  ('notifications.view',                'notifications', null, null, null, 'VIEW', 'Consulter ses notifications',           false, 1),

  -- === Projets & Planification ==============================================
  ('projects.view',                     'projects', null, null, null, 'VIEW',    'Consulter les projets',                   false, 1),
  ('projects.create',                   'projects', null, null, null, 'CREATE',  'Créer un projet',                         false, 2),
  ('projects.update',                   'projects', null, null, null, 'UPDATE',  'Modifier un projet',                      false, 3),
  ('projects.archive',                  'projects', null, null, null, 'ARCHIVE', 'Archiver un projet',                      false, 4),

  -- === Tiers · Clients ======================================================
  ('parties.clients.view',              'parties', 'clients', null, null, 'VIEW',    'Consulter les clients',                false, 1),
  ('parties.clients.create',            'parties', 'clients', null, null, 'CREATE',  'Créer un client',                      false, 2),
  ('parties.clients.update',            'parties', 'clients', null, null, 'UPDATE',  'Modifier un client',                   false, 3),
  ('parties.clients.archive',           'parties', 'clients', null, null, 'ARCHIVE', 'Archiver un client',                   false, 4),
  ('parties.clients.export',            'parties', 'clients', null, null, 'EXPORT',  'Exporter la liste des clients',        true,  5),
  -- Tarifs préférentiels : fonction commerciale sensible (§30)
  ('parties.clients.pricing.view',      'parties', 'clients', 'pricing', 'Tarifs préférentiels', 'VIEW',   'Voir les tarifs préférentiels',   true, 6),
  ('parties.clients.pricing.manage',    'parties', 'clients', 'pricing', 'Tarifs préférentiels', 'UPDATE', 'Gérer les tarifs préférentiels',  true, 7),

  -- === Tiers · Fournisseurs =================================================
  ('parties.suppliers.view',            'parties', 'suppliers', null, null, 'VIEW',    'Consulter les fournisseurs',         false, 1),
  ('parties.suppliers.create',          'parties', 'suppliers', null, null, 'CREATE',  'Créer un fournisseur',               false, 2),
  ('parties.suppliers.update',          'parties', 'suppliers', null, null, 'UPDATE',  'Modifier un fournisseur',            false, 3),
  ('parties.suppliers.archive',         'parties', 'suppliers', null, null, 'ARCHIVE', 'Archiver un fournisseur',            false, 4),
  ('parties.suppliers.export',          'parties', 'suppliers', null, null, 'EXPORT',  'Exporter la liste des fournisseurs',  true, 5),
  -- Coordonnées bancaires : information sensible (§32)
  ('parties.suppliers.bank.view',       'parties', 'suppliers', 'bank',      'Coordonnées bancaires', 'VIEW',   'Voir les coordonnées bancaires',    true, 6),
  ('parties.suppliers.bank.update',     'parties', 'suppliers', 'bank',      'Coordonnées bancaires', 'UPDATE', 'Modifier les coordonnées bancaires', true, 7),
  ('parties.suppliers.financial.view',  'parties', 'suppliers', 'financial', 'Situation financière',  'VIEW',   'Voir la situation financière',       true, 8),

  -- === Tiers · Partenariats =================================================
  ('parties.partners.view',             'parties', 'partners', null, null, 'VIEW',    'Consulter les partenariats',          false, 1),
  ('parties.partners.create',           'parties', 'partners', null, null, 'CREATE',  'Créer un partenariat',                false, 2),
  ('parties.partners.update',           'parties', 'partners', null, null, 'UPDATE',  'Modifier un partenariat',             false, 3),
  ('parties.partners.archive',          'parties', 'partners', null, null, 'ARCHIVE', 'Archiver un partenariat',             false, 4),

  -- === Location · Tableau de bord opérationnel ==============================
  ('rental.board.view',                 'rental', 'board', null, null, 'VIEW', 'Accéder au tableau de location',             false, 1),

  -- === Location · Réservations ==============================================
  ('rental.reservations.view',          'rental', 'reservations', null, null, 'VIEW',   'Consulter les réservations',        false, 1),
  ('rental.reservations.create',        'rental', 'reservations', null, null, 'CREATE', 'Créer une réservation',             false, 2),
  ('rental.reservations.update',        'rental', 'reservations', null, null, 'UPDATE', 'Modifier une réservation',          false, 3),
  ('rental.reservations.confirm',       'rental', 'reservations', null, null, 'VALIDATE', 'Confirmer une réservation',       false, 4),
  ('rental.reservations.cancel',        'rental', 'reservations', null, null, 'CANCEL', 'Annuler une réservation',           false, 5),

  -- === Location · Locations =================================================
  ('rental.rentals.view',               'rental', 'rentals', null, null, 'VIEW',   'Consulter les locations',                false, 1),
  ('rental.rentals.create',             'rental', 'rentals', null, null, 'CREATE', 'Créer une location',                     false, 2),
  ('rental.rentals.update',             'rental', 'rentals', null, null, 'UPDATE', 'Modifier une location',                  false, 3),
  ('rental.rentals.checkout',           'rental', 'rentals', 'checkout', 'Départ',       'CREATE', 'Enregistrer un départ',  false, 4),
  ('rental.rentals.extend',             'rental', 'rentals', 'extension', 'Prolongation', 'UPDATE', 'Prolonger une location', false, 5),
  ('rental.rentals.return',             'rental', 'rentals', 'return',   'Retour',        'CREATE', 'Enregistrer un retour',  false, 6),
  ('rental.rentals.close',              'rental', 'rentals', null, null, 'VALIDATE', 'Clôturer une location',                false, 7),
  ('rental.rentals.cancel',             'rental', 'rentals', null, null, 'CANCEL',   'Annuler une location',                 false, 8),
  -- Montants visibles sur la fiche location (Module 05 §55)
  ('rental.rentals.financial.view',     'rental', 'rentals', 'financial', 'Informations financières', 'VIEW', 'Voir les montants d''une location', true, 9),

  -- === Location · Parc automobile ===========================================
  ('rental.fleet.view',                 'rental', 'fleet', null, null, 'VIEW',    'Consulter le parc',                       false, 1),
  ('rental.fleet.create',               'rental', 'fleet', null, null, 'CREATE',  'Créer un véhicule',                       false, 2),
  ('rental.fleet.update',               'rental', 'fleet', null, null, 'UPDATE',  'Modifier un véhicule',                    false, 3),
  ('rental.fleet.status.update',        'rental', 'fleet', 'status',   'Statut',      'UPDATE',  'Changer le statut / immobiliser', false, 4),
  ('rental.fleet.supplier.update',      'rental', 'fleet', 'supplier', 'Fournisseur', 'UPDATE',  'Changer le fournisseur du véhicule', true, 5),
  ('rental.fleet.archive',              'rental', 'fleet', null, null, 'ARCHIVE', 'Retirer un véhicule du parc',             false, 6),
  ('rental.fleet.export',               'rental', 'fleet', null, null, 'EXPORT',  'Exporter le parc',                        false, 7),

  -- === Location · Catégories ================================================
  ('rental.categories.view',            'rental', 'categories', null, null, 'VIEW',    'Consulter les catégories',           false, 1),
  ('rental.categories.create',          'rental', 'categories', null, null, 'CREATE',  'Créer une catégorie',                false, 2),
  ('rental.categories.update',          'rental', 'categories', null, null, 'UPDATE',  'Modifier une catégorie',             false, 3),
  ('rental.categories.archive',         'rental', 'categories', null, null, 'ARCHIVE', 'Archiver une catégorie',             false, 4),

  -- === Location · Tarification ==============================================
  ('rental.pricing.view',               'rental', 'pricing', null, null, 'VIEW',   'Consulter les tarifs',                   true, 1),
  ('rental.pricing.create',             'rental', 'pricing', null, null, 'CREATE', 'Créer un tarif',                         true, 2),
  ('rental.pricing.update',             'rental', 'pricing', null, null, 'UPDATE', 'Modifier un tarif',                      true, 3),
  ('rental.pricing.override',           'rental', 'pricing', null, null, 'ADMIN',  'Forcer un tarif manuellement',           true, 4),

  -- === Location · Maintenance ===============================================
  ('rental.maintenance.view',           'rental', 'maintenance', null, null, 'VIEW',     'Consulter les maintenances',       false, 1),
  ('rental.maintenance.create',         'rental', 'maintenance', null, null, 'CREATE',   'Créer une maintenance',            false, 2),
  ('rental.maintenance.update',         'rental', 'maintenance', null, null, 'UPDATE',   'Modifier une maintenance',         false, 3),
  ('rental.maintenance.cost.update',    'rental', 'maintenance', 'cost', 'Coûts', 'UPDATE', 'Saisir le coût et le montant imputable', true, 4),
  ('rental.maintenance.validate',       'rental', 'maintenance', null, null, 'VALIDATE', 'Valider une maintenance',          true, 5),
  ('rental.maintenance.close',          'rental', 'maintenance', null, null, 'VALIDATE', 'Clôturer une maintenance',         false, 6),

  -- === Location · Dommages & Incidents ======================================
  ('rental.incidents.view',             'rental', 'incidents', null, null, 'VIEW',   'Consulter dommages et incidents',      false, 1),
  ('rental.incidents.create',           'rental', 'incidents', null, null, 'CREATE', 'Déclarer un dommage ou un incident',   false, 2),
  ('rental.incidents.update',           'rental', 'incidents', null, null, 'UPDATE', 'Modifier un dommage ou un incident',   false, 3),

  -- === Location · Documents =================================================
  ('rental.documents.view',             'rental', 'documents', null, null, 'VIEW',    'Consulter les documents véhicule',    false, 1),
  ('rental.documents.create',           'rental', 'documents', null, null, 'CREATE',  'Ajouter un document',                 false, 2),
  ('rental.documents.archive',          'rental', 'documents', null, null, 'ARCHIVE', 'Archiver un document',                false, 3),

  -- === Banques & Caisses ====================================================
  ('treasury.accounts.view',            'treasury', 'accounts', null, null, 'VIEW',    'Consulter les comptes',              true, 1),
  ('treasury.accounts.create',          'treasury', 'accounts', null, null, 'CREATE',  'Créer un compte',                    true, 2),
  ('treasury.accounts.update',          'treasury', 'accounts', null, null, 'UPDATE',  'Modifier un compte',                 true, 3),
  ('treasury.accounts.archive',         'treasury', 'accounts', null, null, 'ARCHIVE', 'Archiver un compte',                 true, 4),
  ('treasury.balances.view',            'treasury', 'accounts', 'balances', 'Soldes', 'VIEW', 'Voir les soldes',             true, 5),
  ('treasury.entries.view',             'treasury', 'entries', null, null, 'VIEW',   'Consulter les écritures',              true, 1),
  ('treasury.entries.create',           'treasury', 'entries', null, null, 'CREATE', 'Créer une écriture',                   true, 2),
  ('treasury.entries.export',           'treasury', 'entries', null, null, 'EXPORT', 'Exporter les écritures',               true, 3),
  ('treasury.transfers.create',         'treasury', 'transfers', null, null, 'CREATE',   'Effectuer un virement interne',    true, 1),
  ('treasury.transfers.validate',       'treasury', 'transfers', null, null, 'VALIDATE', 'Valider un virement interne',      true, 2),
  ('treasury.transfers.cancel',         'treasury', 'transfers', null, null, 'CANCEL',   'Annuler un virement interne',      true, 3),

  -- === Facturation · Factures clients =======================================
  ('billing.customer_invoices.view',    'billing', 'customer_invoices', 'list', 'Liste',      'VIEW',     'Consulter les factures clients', true, 1),
  ('billing.customer_invoices.create',  'billing', 'customer_invoices', 'list', 'Liste',      'CREATE',   'Créer une facture client',       true, 2),
  ('billing.customer_invoices.update',  'billing', 'customer_invoices', 'list', 'Liste',      'UPDATE',   'Modifier une facture brouillon', true, 3),
  ('billing.customer_invoices.issue',   'billing', 'customer_invoices', 'list', 'Liste',      'VALIDATE', 'Émettre une facture client',     true, 4),
  ('billing.customer_invoices.cancel',  'billing', 'customer_invoices', 'list', 'Liste',      'CANCEL',   'Annuler une facture client',     true, 5),
  ('billing.customer_invoices.export',  'billing', 'customer_invoices', 'list', 'Liste',      'EXPORT',   'Exporter les factures clients',  true, 6),
  ('billing.customer_invoices.print',   'billing', 'customer_invoices', 'list', 'Liste',      'PRINT',    'Imprimer une facture client',    true, 7),
  ('billing.customer_payments.view',    'billing', 'customer_invoices', 'payments', 'Règlements', 'VIEW',   'Consulter les règlements clients', true, 8),
  ('billing.customer_payments.create',  'billing', 'customer_invoices', 'payments', 'Règlements', 'CREATE', 'Enregistrer un règlement client',  true, 9),
  ('billing.customer_payments.cancel',  'billing', 'customer_invoices', 'payments', 'Règlements', 'CANCEL', 'Annuler un règlement client',      true, 10),
  ('billing.customer.stats.view',       'billing', 'customer_invoices', 'stats',   'Statistiques', 'VIEW', 'Voir les statistiques clients',    true, 11),
  ('billing.customer.reports.view',     'billing', 'customer_invoices', 'reports', 'Rapports',     'VIEW', 'Consulter les rapports clients',   true, 12),

  -- === Facturation · Factures fournisseurs ==================================
  ('billing.supplier_invoices.view',    'billing', 'supplier_invoices', 'list', 'Liste', 'VIEW',     'Consulter les factures fournisseurs', true, 1),
  ('billing.supplier_invoices.create',  'billing', 'supplier_invoices', 'list', 'Liste', 'CREATE',   'Créer une facture fournisseur',       true, 2),
  ('billing.supplier_invoices.update',  'billing', 'supplier_invoices', 'list', 'Liste', 'UPDATE',   'Modifier une facture fournisseur',    true, 3),
  ('billing.supplier_invoices.validate','billing', 'supplier_invoices', 'list', 'Liste', 'VALIDATE', 'Valider une facture fournisseur',     true, 4),
  ('billing.supplier_invoices.cancel',  'billing', 'supplier_invoices', 'list', 'Liste', 'CANCEL',   'Annuler une facture fournisseur',     true, 5),
  ('billing.supplier_invoices.export',  'billing', 'supplier_invoices', 'list', 'Liste', 'EXPORT',   'Exporter les factures fournisseurs',  true, 6),
  ('billing.supplier_payments.view',    'billing', 'supplier_invoices', 'payments', 'Règlements', 'VIEW',   'Consulter les règlements fournisseurs', true, 7),
  ('billing.supplier_payments.create',  'billing', 'supplier_invoices', 'payments', 'Règlements', 'CREATE', 'Payer un fournisseur',                  true, 8),
  ('billing.supplier_payments.cancel',  'billing', 'supplier_invoices', 'payments', 'Règlements', 'CANCEL', 'Annuler un règlement fournisseur',      true, 9),
  -- Imputations : opération financière la plus sensible du système (§36)
  ('billing.imputations.view',          'billing', 'supplier_invoices', 'imputations', 'Imputations', 'VIEW',     'Consulter les imputations',   true, 10),
  ('billing.imputations.create',        'billing', 'supplier_invoices', 'imputations', 'Imputations', 'CREATE',   'Créer une imputation',        true, 11),
  ('billing.imputations.update',        'billing', 'supplier_invoices', 'imputations', 'Imputations', 'UPDATE',   'Modifier une imputation',     true, 12),
  ('billing.imputations.validate',      'billing', 'supplier_invoices', 'imputations', 'Imputations', 'VALIDATE', 'Valider une imputation',      true, 13),
  ('billing.imputations.cancel',        'billing', 'supplier_invoices', 'imputations', 'Imputations', 'CANCEL',   'Annuler une imputation',      true, 14),
  ('billing.supplier.stats.view',       'billing', 'supplier_invoices', 'stats',   'Statistiques', 'VIEW', 'Voir les statistiques fournisseurs', true, 15),
  ('billing.supplier.reports.view',     'billing', 'supplier_invoices', 'reports', 'Rapports',     'VIEW', 'Consulter les rapports fournisseurs', true, 16),

  -- === Facturation · Paiements divers =======================================
  ('billing.misc_payments.view',        'billing', 'misc_payments', null, null, 'VIEW',     'Consulter les paiements divers',  true, 1),
  ('billing.misc_payments.create',      'billing', 'misc_payments', null, null, 'CREATE',   'Créer un paiement divers',        true, 2),
  ('billing.misc_payments.validate',    'billing', 'misc_payments', null, null, 'VALIDATE', 'Valider un paiement divers',      true, 3),
  ('billing.misc_payments.cancel',      'billing', 'misc_payments', null, null, 'CANCEL',   'Annuler un paiement divers',      true, 4),

  -- === Utilisateurs & Groupes ===============================================
  ('users.users.view',                  'users', 'users', null, null, 'VIEW',    'Consulter les utilisateurs',               false, 1),
  ('users.users.create',                'users', 'users', null, null, 'CREATE',  'Créer un utilisateur',                     true,  2),
  ('users.users.update',                'users', 'users', null, null, 'UPDATE',  'Modifier un utilisateur',                  true,  3),
  ('users.users.archive',               'users', 'users', null, null, 'ARCHIVE', 'Activer / désactiver un utilisateur',      true,  4),
  ('users.users.permissions.view',      'users', 'users', 'permissions', 'Permissions', 'VIEW',   'Voir les permissions d''un utilisateur',   true, 5),
  ('users.users.permissions.update',    'users', 'users', 'permissions', 'Permissions', 'UPDATE', 'Modifier les permissions d''un utilisateur', true, 6),
  ('users.hierarchy.view',              'users', 'users', 'hierarchy',   'Vue hiérarchique', 'VIEW', 'Consulter la vue hiérarchique',          false, 7),
  ('users.groups.view',                 'users', 'groups', null, null, 'VIEW',    'Consulter les groupes',                   false, 1),
  ('users.groups.create',               'users', 'groups', null, null, 'CREATE',  'Créer un groupe',                         true,  2),
  ('users.groups.update',               'users', 'groups', null, null, 'UPDATE',  'Modifier un groupe',                      true,  3),
  ('users.groups.archive',              'users', 'groups', null, null, 'ARCHIVE', 'Supprimer / désactiver un groupe',        true,  4),
  ('users.groups.permissions.update',   'users', 'groups', 'permissions', 'Permissions', 'UPDATE', 'Modifier les permissions d''un groupe', true, 5),
  ('users.audit.view',                  'users', 'audit', null, null, 'VIEW',   'Consulter le journal d''activité',          true, 1),
  ('users.audit.export',                'users', 'audit', null, null, 'EXPORT', 'Exporter le journal d''activité',           true, 2),

  -- === Paramètres ===========================================================
  ('settings.company.view',             'settings', 'company', null, null, 'VIEW',   'Consulter les paramètres entreprise',   false, 1),
  ('settings.company.update',           'settings', 'company', null, null, 'UPDATE', 'Modifier les paramètres entreprise',    true,  2),
  ('settings.company.administrative.view',   'settings', 'company', 'administrative', 'Administratif', 'VIEW',   'Voir les informations administratives',    true, 3),
  ('settings.company.administrative.update', 'settings', 'company', 'administrative', 'Administratif', 'UPDATE', 'Modifier les informations administratives', true, 4),
  ('settings.company.bank.view',        'settings', 'company', 'bank', 'Banque', 'VIEW',   'Voir les informations bancaires',   true, 5),
  ('settings.company.bank.update',      'settings', 'company', 'bank', 'Banque', 'UPDATE', 'Modifier les informations bancaires', true, 6),
  ('settings.branding.update',          'settings', 'company', 'branding', 'Identité visuelle', 'UPDATE', 'Modifier l''identité visuelle', true, 7),
  ('settings.numbering.view',           'settings', 'numbering', null, null, 'VIEW',   'Consulter les règles de numérotation', false, 1),
  ('settings.numbering.update',         'settings', 'numbering', null, null, 'UPDATE', 'Modifier les règles de numérotation',  true,  2)
)
insert into public.permissions (
  code, module_code, module_label, menu_code, menu_label,
  submenu_code, submenu_label, action, label, is_sensitive,
  module_order, menu_order, submenu_order, action_order
)
select
  p.code,
  p.module_code,
  m.label,
  p.menu_code,
  mn.label,
  p.submenu_code,
  p.submenu_label,
  p.action::public.permission_action,
  p.label,
  p.sensitive,
  m.ord,
  coalesce(mn.ord, 0),
  p.ord,
  case p.action
    when 'VIEW'     then 1
    when 'CREATE'   then 2
    when 'UPDATE'   then 3
    when 'VALIDATE' then 4
    when 'CANCEL'   then 5
    when 'ARCHIVE'  then 6
    when 'EXPORT'   then 7
    when 'PRINT'    then 8
    when 'ADMIN'    then 9
    else 99
  end
from perms p
join modules m on m.code = p.module_code
left join menus mn on mn.module_code = p.module_code and mn.code = p.menu_code
on conflict (code) do update set
  module_label  = excluded.module_label,
  menu_label    = excluded.menu_label,
  submenu_label = excluded.submenu_label,
  label         = excluded.label,
  is_sensitive  = excluded.is_sensitive,
  module_order  = excluded.module_order,
  menu_order    = excluded.menu_order,
  submenu_order = excluded.submenu_order,
  action_order  = excluded.action_order;
