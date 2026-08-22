/**
 * Codes de permission — miroir typé du catalogue défini en base.
 *
 * Source de vérité : `supabase/migrations/20260819000700_permissions_catalog.sql`
 * Structure : Module → Menu → Sous-menu → Action
 * (05_Regles_Metier/05_Permissions.md §16)
 *
 * Toute permission ajoutée ici doit l'être aussi dans la migration, et
 * réciproquement. Un code absent du catalogue en base entraîne un refus
 * d'accès : c'est le comportement attendu (principe de confiance minimale §87).
 */
export const PERMISSIONS = {
  // --- Tableau de bord -------------------------------------------------------
  DASHBOARD_VIEW: 'dashboard.view',
  DASHBOARD_FINANCIAL_VIEW: 'dashboard.financial.view',
  DASHBOARD_FLEET_VIEW: 'dashboard.fleet.view',

  // --- Centre de notifications ----------------------------------------------
  NOTIFICATIONS_VIEW: 'notifications.view',

  // --- Projets & Planification ----------------------------------------------
  PROJECTS_VIEW: 'projects.view',
  PROJECTS_CREATE: 'projects.create',
  PROJECTS_UPDATE: 'projects.update',
  PROJECTS_ARCHIVE: 'projects.archive',

  // --- Tiers · Clients -------------------------------------------------------
  CLIENTS_VIEW: 'parties.clients.view',
  CLIENTS_CREATE: 'parties.clients.create',
  CLIENTS_UPDATE: 'parties.clients.update',
  CLIENTS_ARCHIVE: 'parties.clients.archive',
  CLIENTS_EXPORT: 'parties.clients.export',
  CLIENTS_DOWNLOAD: 'parties.clients.download',
  CLIENTS_PRINT: 'parties.clients.print',
  CLIENTS_PRICING_VIEW: 'parties.clients.pricing.view',
  CLIENTS_PRICING_MANAGE: 'parties.clients.pricing.manage',

  // --- Tiers · Fournisseurs --------------------------------------------------
  SUPPLIERS_VIEW: 'parties.suppliers.view',
  SUPPLIERS_CREATE: 'parties.suppliers.create',
  SUPPLIERS_UPDATE: 'parties.suppliers.update',
  SUPPLIERS_ARCHIVE: 'parties.suppliers.archive',
  SUPPLIERS_EXPORT: 'parties.suppliers.export',
  SUPPLIERS_DOWNLOAD: 'parties.suppliers.download',
  SUPPLIERS_PRINT: 'parties.suppliers.print',
  SUPPLIERS_BANK_VIEW: 'parties.suppliers.bank.view',
  SUPPLIERS_BANK_UPDATE: 'parties.suppliers.bank.update',
  SUPPLIERS_FINANCIAL_VIEW: 'parties.suppliers.financial.view',

  // --- Tiers · Partenariats --------------------------------------------------
  PARTNERS_VIEW: 'parties.partners.view',
  PARTNERS_CREATE: 'parties.partners.create',
  PARTNERS_UPDATE: 'parties.partners.update',
  PARTNERS_ARCHIVE: 'parties.partners.archive',
  PARTNERS_EXPORT: 'parties.partners.export',
  PARTNERS_DOWNLOAD: 'parties.partners.download',
  PARTNERS_PRINT: 'parties.partners.print',

  // --- Location --------------------------------------------------------------
  RENTAL_BOARD_VIEW: 'rental.board.view',

  RESERVATIONS_VIEW: 'rental.reservations.view',
  RESERVATIONS_CREATE: 'rental.reservations.create',
  RESERVATIONS_UPDATE: 'rental.reservations.update',
  RESERVATIONS_CONFIRM: 'rental.reservations.confirm',
  RESERVATIONS_CANCEL: 'rental.reservations.cancel',

  RENTALS_VIEW: 'rental.rentals.view',
  RENTALS_CREATE: 'rental.rentals.create',
  RENTALS_UPDATE: 'rental.rentals.update',
  RENTALS_CHECKOUT: 'rental.rentals.checkout',
  RENTALS_EXTEND: 'rental.rentals.extend',
  RENTALS_RETURN: 'rental.rentals.return',
  RENTALS_CLOSE: 'rental.rentals.close',
  RENTALS_CANCEL: 'rental.rentals.cancel',
  RENTALS_FINANCIAL_VIEW: 'rental.rentals.financial.view',

  FLEET_VIEW: 'rental.fleet.view',
  FLEET_CREATE: 'rental.fleet.create',
  FLEET_UPDATE: 'rental.fleet.update',
  FLEET_STATUS_UPDATE: 'rental.fleet.status.update',
  FLEET_SUPPLIER_UPDATE: 'rental.fleet.supplier.update',
  FLEET_ARCHIVE: 'rental.fleet.archive',
  FLEET_EXPORT: 'rental.fleet.export',
  FLEET_DOWNLOAD: 'rental.fleet.download',
  FLEET_PRINT: 'rental.fleet.print',

  CATEGORIES_VIEW: 'rental.categories.view',
  CATEGORIES_CREATE: 'rental.categories.create',
  CATEGORIES_UPDATE: 'rental.categories.update',
  CATEGORIES_ARCHIVE: 'rental.categories.archive',
  CATEGORIES_EXPORT: 'rental.categories.export',

  PRICING_VIEW: 'rental.pricing.view',
  PRICING_CREATE: 'rental.pricing.create',
  PRICING_UPDATE: 'rental.pricing.update',
  PRICING_OVERRIDE: 'rental.pricing.override',
  PRICING_EXPORT: 'rental.pricing.export',
  PRICING_DOWNLOAD: 'rental.pricing.download',
  PRICING_PRINT: 'rental.pricing.print',

  MAINTENANCE_VIEW: 'rental.maintenance.view',
  MAINTENANCE_CREATE: 'rental.maintenance.create',
  MAINTENANCE_UPDATE: 'rental.maintenance.update',
  MAINTENANCE_COST_UPDATE: 'rental.maintenance.cost.update',
  MAINTENANCE_VALIDATE: 'rental.maintenance.validate',
  MAINTENANCE_CLOSE: 'rental.maintenance.close',

  INCIDENTS_VIEW: 'rental.incidents.view',
  INCIDENTS_CREATE: 'rental.incidents.create',
  INCIDENTS_UPDATE: 'rental.incidents.update',

  VEHICLE_DOCUMENTS_VIEW: 'rental.documents.view',
  VEHICLE_DOCUMENTS_CREATE: 'rental.documents.create',
  VEHICLE_DOCUMENTS_ARCHIVE: 'rental.documents.archive',

  // --- Banques & Caisses -----------------------------------------------------
  ACCOUNTS_VIEW: 'treasury.accounts.view',
  ACCOUNTS_CREATE: 'treasury.accounts.create',
  ACCOUNTS_UPDATE: 'treasury.accounts.update',
  ACCOUNTS_ARCHIVE: 'treasury.accounts.archive',
  BALANCES_VIEW: 'treasury.balances.view',
  ENTRIES_VIEW: 'treasury.entries.view',
  ENTRIES_CREATE: 'treasury.entries.create',
  ENTRIES_EXPORT: 'treasury.entries.export',
  TRANSFERS_CREATE: 'treasury.transfers.create',
  TRANSFERS_VALIDATE: 'treasury.transfers.validate',
  TRANSFERS_CANCEL: 'treasury.transfers.cancel',

  // --- Facturation · Clients -------------------------------------------------
  CUSTOMER_INVOICES_VIEW: 'billing.customer_invoices.view',
  CUSTOMER_INVOICES_CREATE: 'billing.customer_invoices.create',
  CUSTOMER_INVOICES_UPDATE: 'billing.customer_invoices.update',
  CUSTOMER_INVOICES_ISSUE: 'billing.customer_invoices.issue',
  CUSTOMER_INVOICES_CANCEL: 'billing.customer_invoices.cancel',
  CUSTOMER_INVOICES_EXPORT: 'billing.customer_invoices.export',
  CUSTOMER_INVOICES_PRINT: 'billing.customer_invoices.print',
  CUSTOMER_PAYMENTS_VIEW: 'billing.customer_payments.view',
  CUSTOMER_PAYMENTS_CREATE: 'billing.customer_payments.create',
  CUSTOMER_PAYMENTS_CANCEL: 'billing.customer_payments.cancel',
  CUSTOMER_STATS_VIEW: 'billing.customer.stats.view',
  CUSTOMER_REPORTS_VIEW: 'billing.customer.reports.view',

  // --- Facturation · Fournisseurs --------------------------------------------
  SUPPLIER_INVOICES_VIEW: 'billing.supplier_invoices.view',
  SUPPLIER_INVOICES_CREATE: 'billing.supplier_invoices.create',
  SUPPLIER_INVOICES_UPDATE: 'billing.supplier_invoices.update',
  SUPPLIER_INVOICES_VALIDATE: 'billing.supplier_invoices.validate',
  SUPPLIER_INVOICES_CANCEL: 'billing.supplier_invoices.cancel',
  SUPPLIER_INVOICES_EXPORT: 'billing.supplier_invoices.export',
  SUPPLIER_PAYMENTS_VIEW: 'billing.supplier_payments.view',
  SUPPLIER_PAYMENTS_CREATE: 'billing.supplier_payments.create',
  SUPPLIER_PAYMENTS_CANCEL: 'billing.supplier_payments.cancel',
  SUPPLIER_STATS_VIEW: 'billing.supplier.stats.view',
  SUPPLIER_REPORTS_VIEW: 'billing.supplier.reports.view',

  // --- Imputations (opération financière la plus sensible) -------------------
  IMPUTATIONS_VIEW: 'billing.imputations.view',
  IMPUTATIONS_CREATE: 'billing.imputations.create',
  IMPUTATIONS_UPDATE: 'billing.imputations.update',
  IMPUTATIONS_VALIDATE: 'billing.imputations.validate',
  IMPUTATIONS_CANCEL: 'billing.imputations.cancel',

  // --- Paiements divers ------------------------------------------------------
  MISC_PAYMENTS_VIEW: 'billing.misc_payments.view',
  MISC_PAYMENTS_CREATE: 'billing.misc_payments.create',
  MISC_PAYMENTS_VALIDATE: 'billing.misc_payments.validate',
  MISC_PAYMENTS_CANCEL: 'billing.misc_payments.cancel',

  // --- Utilisateurs & Groupes ------------------------------------------------
  USERS_VIEW: 'users.users.view',
  USERS_CREATE: 'users.users.create',
  USERS_UPDATE: 'users.users.update',
  USERS_ARCHIVE: 'users.users.archive',
  USER_PERMISSIONS_VIEW: 'users.users.permissions.view',
  USER_PERMISSIONS_UPDATE: 'users.users.permissions.update',
  HIERARCHY_VIEW: 'users.hierarchy.view',
  GROUPS_VIEW: 'users.groups.view',
  GROUPS_CREATE: 'users.groups.create',
  GROUPS_UPDATE: 'users.groups.update',
  GROUPS_ARCHIVE: 'users.groups.archive',
  GROUP_PERMISSIONS_UPDATE: 'users.groups.permissions.update',
  AUDIT_VIEW: 'users.audit.view',
  AUDIT_EXPORT: 'users.audit.export',

  // --- Paramètres ------------------------------------------------------------
  SETTINGS_COMPANY_VIEW: 'settings.company.view',
  SETTINGS_COMPANY_UPDATE: 'settings.company.update',
  SETTINGS_ADMINISTRATIVE_VIEW: 'settings.company.administrative.view',
  SETTINGS_ADMINISTRATIVE_UPDATE: 'settings.company.administrative.update',
  SETTINGS_BANK_VIEW: 'settings.company.bank.view',
  SETTINGS_BANK_UPDATE: 'settings.company.bank.update',
  SETTINGS_BRANDING_UPDATE: 'settings.branding.update',
  SETTINGS_NUMBERING_VIEW: 'settings.numbering.view',
  SETTINGS_NUMBERING_UPDATE: 'settings.numbering.update',
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** Actions possibles sur une permission (miroir de `public.permission_action`). */
export type PermissionAction =
  | 'VIEW'
  | 'CREATE'
  | 'UPDATE'
  | 'ARCHIVE'
  | 'VALIDATE'
  | 'CANCEL'
  | 'EXPORT'
  | 'DOWNLOAD'
  | 'PRINT'
  | 'ADMIN'

/** Libellés français des actions, pour l'onglet Permissions. */
export const ACTION_LABELS: Record<PermissionAction, string> = {
  VIEW: 'Voir',
  CREATE: 'Créer',
  UPDATE: 'Modifier',
  ARCHIVE: 'Archiver',
  VALIDATE: 'Valider',
  CANCEL: 'Annuler',
  EXPORT: 'Exporter',
  DOWNLOAD: 'Télécharger',
  PRINT: 'Imprimer',
  ADMIN: 'Administrer',
}
