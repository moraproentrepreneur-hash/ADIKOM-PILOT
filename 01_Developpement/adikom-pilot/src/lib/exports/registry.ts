import 'server-only'

import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'
import { can } from '@/lib/auth/dal'
import { dataset, toExcelDate, type ExportDataset } from './workbook'
import { formatDateTime, todayISO } from '@/lib/dates'

import {
  listClients,
  STATUS_LABELS as CLIENT_STATUS,
  TYPE_LABELS as CLIENT_TYPE,
} from '@/features/clients/data'
import {
  listSuppliers,
  STATUS_LABELS as SUPPLIER_STATUS,
  TYPE_LABELS as SUPPLIER_TYPE,
} from '@/features/suppliers/data'
import { listPartners, STATUS_LABELS as PARTNER_STATUS } from '@/features/partners/data'
import {
  listCategories,
  listVehicles,
  ORIGIN_LABELS,
  STATUS_LABELS as VEHICLE_STATUS,
} from '@/features/fleet/data'
import { listPricingRules } from '@/features/pricing/data'
import { UNIT_LABELS } from '@/features/pricing/constants'
import { listSupplierRates } from '@/features/supplier-rates/data'
import {
  listServices,
  PURPOSE_LABELS as SERVICE_PURPOSE_LABELS,
  STATUS_LABELS as SERVICE_STATUS_LABELS,
} from '@/features/catalog/data'
import {
  displayStatus as displayReservationStatus,
  listReservations,
  STATUS_LABELS as RESERVATION_STATUS,
} from '@/features/reservations/data'
import {
  displayStatus as displayRentalStatus,
  listRentals,
  STATUS_LABELS as RENTAL_STATUS,
} from '@/features/rentals/data'
import { listCustomerInvoices } from '@/features/customer-invoices/data'
import {
  CUSTOMER_INVOICE_STATUS_LABELS,
  displayStatus as displayCustomerInvoiceStatus,
} from '@/features/customer-invoices/constants'
import { listSupplierInvoices } from '@/features/supplier-invoices/data'
import {
  displayStatus as displaySupplierInvoiceStatus,
  SUPPLIER_INVOICE_STATUS_LABELS,
} from '@/features/supplier-invoices/constants'
import { listTreasuryEntries } from '@/features/treasury/data'
import {
  DIRECTION_LABELS,
  ENTRY_KIND_LABELS,
  ENTRY_STATUS_LABELS,
} from '@/features/treasury/constants'
import { listSalesOrders, listSalesQuotes } from '@/features/commerce/data'
import {
  ORDER_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  type OrderStatus,
  type QuoteStatus,
} from '@/features/commerce/constants'
import { listPurchaseOrders, listPurchaseQuotes } from '@/features/purchasing/data'
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_QUOTE_STATUS_LABELS,
  type PurchaseOrderStatus,
  type PurchaseQuoteStatus,
} from '@/features/purchasing/constants'
import { EXPORT_LIMIT, listAuditEventsForExport } from '@/features/audit/data'
import {
  ACTION_LABELS as AUDIT_ACTION_LABELS,
  RESULT_LABELS as AUDIT_RESULT_LABELS,
  entityLabel as auditEntityLabel,
  fieldLabel as auditFieldLabel,
  moduleLabel as auditModuleLabel,
} from '@/features/audit/constants'

/**
 * Registre des exports.
 *
 * Un module = une entrée : sa permission, ses colonnes, sa façon de charger les
 * lignes. La route, le contrôle d'accès et la fabrication du classeur ne
 * changent jamais.
 *
 * DEC-024 : exporter est une capacité distincte de consulter. Chaque entrée
 * porte donc sa propre permission d'export, jamais celle de lecture.
 *
 * Les chargements réutilisent les fonctions des modules, qui interrogent la
 * base avec la session de l'appelant : un export ne peut pas contenir ce que
 * l'écran ne montrerait pas.
 */

export type ExportDefinition = {
  /** Titre du classeur et base du nom de fichier. */
  title: string
  /**
   * Droit de consulter la liste.
   *
   * Exigé EN PLUS de la permission d'export, jamais à sa place : on n'exporte
   * pas ce qu'on n'a pas le droit de voir. Sans ce contrôle, un compte doté du
   * seul `export` recevrait un classeur vide — RLS ayant tout filtré — et
   * croirait la liste vide plutôt que l'accès refusé.
   */
  viewPermission: PermissionCode
  permission: PermissionCode
  /** Entité journalisée à l'audit. */
  entityType: string
  moduleCode: string
  build: (filters: Record<string, string>) => Promise<ExportDataset>
}

export const EXPORTS: Record<string, ExportDefinition> = {
  clients: {
    title: 'Clients',
    viewPermission: PERMISSIONS.CLIENTS_VIEW,
    permission: PERMISSIONS.CLIENTS_EXPORT,
    entityType: 'clients',
    moduleCode: 'parties',
    async build(filters) {
      const rows = await listClients({
        search: filters.q,
        status: filters.statut,
        type: filters.type,
      })

      return dataset(rows, [
        { header: 'Identifiant', width: 14, value: (r) => r.clientNo },
        { header: 'Client', width: 34, value: (r) => r.displayName },
        { header: 'Nom commercial', width: 26, value: (r) => r.tradeName },
        { header: 'Type', width: 14, value: (r) => CLIENT_TYPE[r.type] },
        { header: 'Téléphone', width: 20, value: (r) => r.phone },
        { header: 'Email', width: 30, value: (r) => r.email },
        { header: 'Ville', width: 18, value: (r) => r.city },
        { header: 'Statut', width: 14, value: (r) => CLIENT_STATUS[r.status] },
        { header: 'Créé le', width: 14, format: 'date', value: (r) => toExcelDate(r.createdAt) },
      ])
    },
  },

  fournisseurs: {
    title: 'Fournisseurs',
    viewPermission: PERMISSIONS.SUPPLIERS_VIEW,
    permission: PERMISSIONS.SUPPLIERS_EXPORT,
    entityType: 'suppliers',
    moduleCode: 'parties',
    async build(filters) {
      const rows = await listSuppliers({
        search: filters.q,
        status: filters.statut,
        type: filters.type,
      })

      /*
       * Aucune coordonnée bancaire ici, quelles que soient les permissions du
       * lecteur : un fichier tableur circule, se transfère et se conserve hors
       * du système. Ces données ne se consultent que sur la fiche, où l'accès
       * reste tracé (Fournisseurs §44).
       */
      return dataset(rows, [
        { header: 'Identifiant', width: 14, value: (r) => r.supplierNo },
        { header: 'Fournisseur', width: 34, value: (r) => r.legalName },
        { header: 'Nom commercial', width: 26, value: (r) => r.tradeName },
        { header: 'Type', width: 26, value: (r) => SUPPLIER_TYPE[r.type] },
        { header: 'Contact', width: 24, value: (r) => r.contactName },
        { header: 'Téléphone', width: 20, value: (r) => r.phone },
        { header: 'Email', width: 30, value: (r) => r.email },
        { header: 'Ville', width: 18, value: (r) => r.city },
        { header: 'Véhicules', width: 11, format: 'number', value: (r) => r.vehicleCount },
        { header: 'Statut', width: 14, value: (r) => SUPPLIER_STATUS[r.status] },
      ])
    },
  },

  partenaires: {
    title: 'Partenaires',
    viewPermission: PERMISSIONS.PARTNERS_VIEW,
    permission: PERMISSIONS.PARTNERS_EXPORT,
    entityType: 'partners',
    moduleCode: 'parties',
    async build(filters) {
      const rows = await listPartners({ search: filters.q, status: filters.statut })

      return dataset(rows, [
        { header: 'Identifiant', width: 14, value: (r) => r.partnerNo },
        { header: 'Partenaire', width: 34, value: (r) => r.legalName },
        { header: 'Nom commercial', width: 26, value: (r) => r.tradeName },
        { header: 'Contact', width: 24, value: (r) => r.contactName },
        { header: 'Téléphone', width: 20, value: (r) => r.phone },
        { header: 'Email', width: 30, value: (r) => r.email },
        { header: 'Ville', width: 18, value: (r) => r.city },
        { header: 'Véhicules', width: 11, format: 'number', value: (r) => r.vehicleCount },
        { header: 'Statut', width: 14, value: (r) => PARTNER_STATUS[r.status] },
      ])
    },
  },

  parc: {
    title: 'Parc automobile',
    viewPermission: PERMISSIONS.FLEET_VIEW,
    permission: PERMISSIONS.FLEET_EXPORT,
    entityType: 'vehicles',
    moduleCode: 'rental',
    async build(filters) {
      const rows = await listVehicles({
        search: filters.q,
        status: filters.statut,
        categoryId: filters.categorie,
        origin: filters.origine,
      })

      /*
       * Identification, rattachement et situation : de quoi tenir un inventaire
       * du parc. Aucune donnée financière — la valeur d'un véhicule, son loyer
       * fournisseur et sa rentabilité relèvent d'autres permissions, et n'ont
       * rien à faire dans un export du référentiel.
       */
      return dataset(rows, [
        { header: 'Identifiant', width: 14, value: (r) => r.vehicleNo },
        { header: 'Immatriculation', width: 18, value: (r) => r.plate },
        { header: 'Marque', width: 18, value: (r) => r.brand },
        { header: 'Modèle', width: 22, value: (r) => r.model },
        { header: 'Année', width: 9, format: 'number', value: (r) => r.modelYear },
        { header: 'Catégorie', width: 22, value: (r) => r.categoryLabel },
        { header: 'Origine', width: 26, value: (r) => ORIGIN_LABELS[r.origin] },
        {
          header: 'Fournisseur / Partenaire',
          width: 34,
          value: (r) => r.supplierLabel ?? r.partnerLabel,
        },
        { header: 'Kilométrage', width: 14, format: 'number', value: (r) => r.mileage },
        { header: 'Statut', width: 16, value: (r) => VEHICLE_STATUS[r.status] },
      ])
    },
  },

  reservations: {
    title: 'Réservations',
    viewPermission: PERMISSIONS.RESERVATIONS_VIEW,
    permission: PERMISSIONS.RESERVATIONS_EXPORT,
    entityType: 'reservations',
    moduleCode: 'rental',
    async build(filters) {
      const rows = await listReservations({
        search: filters.q,
        status: filters.statut,
        clientId: filters.client,
      })

      /*
       * Le TARIF VERROUILLÉ est une condition commerciale : il ne sort qu'avec
       * `rental.rentals.financial.view`, comme à l'écran. Sans ce droit, la
       * colonne n'existe pas — plutôt que d'exister vide, ce qui laisserait
       * croire qu'aucun tarif n'a été figé (DEC-017, DEC-024).
       */
      const mayReadAmounts = await can(PERMISSIONS.RENTALS_FINANCIAL_VIEW)

      return dataset(
        rows,
        [
          { header: 'Réservation', width: 20, value: (r) => r.reservationNo },
          { header: 'Client', width: 32, value: (r) => r.clientLabel },
          { header: 'Début', width: 18, format: 'date', value: (r) => toExcelDate(r.startsAt) },
          { header: 'Fin', width: 18, format: 'date', value: (r) => toExcelDate(r.endsAt) },
          { header: 'Catégorie', width: 24, value: (r) => r.categoryLabel },
          { header: 'Véhicule', width: 30, value: (r) => r.vehicleLabel },
          {
            header: 'Statut',
            width: 20,
            value: (r) => RESERVATION_STATUS[displayReservationStatus(r.status, r.startsAt)],
          },
          ...(mayReadAmounts
            ? ([
                {
                  header: 'Tarif verrouillé',
                  width: 18,
                  format: 'amount' as const,
                  value: (r: (typeof rows)[number]) => r.lockedAmount,
                },
                {
                  header: 'Unité',
                  width: 12,
                  value: (r: (typeof rows)[number]) => (r.lockedUnit ? UNIT_LABELS[r.lockedUnit] : null),
                },
              ])
            : []),
        ],
        mayReadAmounts ? 'Engagements et tarifs verrouillés' : 'Engagements'
      )
    },
  },

  locations: {
    title: 'Locations',
    viewPermission: PERMISSIONS.RENTALS_VIEW,
    permission: PERMISSIONS.RENTALS_EXPORT,
    entityType: 'rentals',
    moduleCode: 'rental',
    async build(filters) {
      const rows = await listRentals({
        search: filters.q,
        status: filters.statut,
        clientId: filters.client,
        vehicleId: filters.vehicule,
      })

      const mayReadAmounts = await can(PERMISSIONS.RENTALS_FINANCIAL_VIEW)

      /*
       * Exploitation, pas facturation. Aucune durée facturable, aucun total,
       * aucun frais : ces règles ne sont pas définies (DEC-008), et un tableur
       * qui les afficherait ferait autorité alors qu'il les aurait inventées.
       * Les dates réelles suffisent à qui veut compter lui-même.
       */
      return dataset(
        rows,
        [
          { header: 'Location', width: 20, value: (r) => r.rentalNo },
          { header: 'Client', width: 32, value: (r) => r.clientLabel },
          { header: 'Véhicule', width: 30, value: (r) => r.vehicleLabel },
          {
            header: 'Départ prévu',
            width: 18,
            format: 'date',
            value: (r) => toExcelDate(r.plannedFrom),
          },
          {
            header: 'Départ réel',
            width: 18,
            format: 'date',
            value: (r) => toExcelDate(r.startedAt),
          },
          {
            header: 'Retour attendu',
            width: 18,
            format: 'date',
            value: (r) => toExcelDate(r.expectedReturnAt),
          },
          {
            header: 'Retour réel',
            width: 18,
            format: 'date',
            value: (r) => toExcelDate(r.returnedAt),
          },
          {
            header: 'Statut',
            width: 20,
            value: (r) => RENTAL_STATUS[displayRentalStatus(r.status, r.expectedReturnAt)],
          },
          ...(mayReadAmounts
            ? ([
                {
                  header: 'Tarif verrouillé',
                  width: 18,
                  format: 'amount' as const,
                  value: (r: (typeof rows)[number]) => r.lockedAmount,
                },
                {
                  header: 'Unité',
                  width: 12,
                  value: (r: (typeof rows)[number]) => UNIT_LABELS[r.lockedUnit],
                },
              ])
            : []),
        ],
        mayReadAmounts ? 'Exécution et tarifs verrouillés' : 'Exécution'
      )
    },
  },

  'factures-clients': {
    title: 'Factures clients',
    viewPermission: PERMISSIONS.CUSTOMER_INVOICES_VIEW,
    permission: PERMISSIONS.CUSTOMER_INVOICES_EXPORT,
    entityType: 'customer_invoices',
    moduleCode: 'billing',
    async build(filters) {
      /*
       * L'ENCAISSÉ ET LE SOLDE NE SORTENT QU'AVEC
       * `billing.customer_payments.view`, comme à l'écran.
       *
       * Sans ce droit, les colonnes n'existent pas — plutôt que d'exister à
       * zéro, ce qui ferait d'un classeur exporté l'affirmation qu'aucun
       * encaissement n'a eu lieu (DEC-017, DEC-024).
       */
      const mayReadPayments = await can(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW)

      const rows = await listCustomerInvoices(
        {
          search: filters.q,
          status: filters.statut,
          clientId: filters.client,
          from: filters.du,
          to: filters.au,
        },
        { canSeePayments: mayReadPayments }
      )

      return dataset(
        rows,
        [
          { header: 'Facture', width: 20, value: (r) => r.invoiceNo },
          { header: 'Client', width: 34, value: (r) => r.clientLabel },
          { header: 'Location', width: 20, value: (r) => r.rentalNo },
          {
            header: 'Date',
            width: 14,
            format: 'date',
            value: (r) => toExcelDate(r.invoiceDate),
          },
          {
            header: 'Échéance',
            width: 14,
            format: 'date',
            value: (r) => toExcelDate(r.dueDate),
          },
          { header: 'Sous-total', width: 18, format: 'amount', value: (r) => r.subtotal },
          { header: 'Réductions', width: 18, format: 'amount', value: (r) => r.discount },
          { header: 'Total', width: 18, format: 'amount', value: (r) => r.total },
          ...(mayReadPayments
            ? ([
                {
                  header: 'Encaissé',
                  width: 18,
                  format: 'amount' as const,
                  value: (r: (typeof rows)[number]) => r.paidAmount,
                },
                {
                  header: 'Solde',
                  width: 18,
                  format: 'amount' as const,
                  value: (r: (typeof rows)[number]) => r.remainingDue,
                },
              ])
            : []),
          {
            header: 'État',
            width: 22,
            value: (r) =>
              CUSTOMER_INVOICE_STATUS_LABELS[
                displayCustomerInvoiceStatus(r.status, r.dueDate, r.total, r.paidAmount)
              ],
          },
        ],
        mayReadPayments
          ? 'Sous-total, réductions, total, encaissements et solde'
          : 'Sous-total, réductions et total — les encaissements ne sont pas lisibles'
      )
    },
  },

  'factures-fournisseurs': {
    title: 'Factures fournisseurs',
    viewPermission: PERMISSIONS.SUPPLIER_INVOICES_VIEW,
    permission: PERMISSIONS.SUPPLIER_INVOICES_EXPORT,
    entityType: 'supplier_invoices',
    moduleCode: 'billing',
    async build(filters) {
      /*
       * Le TOTAL IMPUTÉ et le NET À PAYER ne sortent qu'avec
       * `billing.imputations.view`, comme à l'écran. Sans ce droit, les
       * colonnes n'existent pas — plutôt que d'exister à zéro, ce qui ferait
       * d'un classeur exporté l'affirmation qu'aucune déduction n'a eu lieu
       * (DEC-017, DEC-024).
       */
      const [mayReadImputations, mayReadPayments] = await Promise.all([
        can(PERMISSIONS.IMPUTATIONS_VIEW),
        can(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW),
      ])

      const rows = await listSupplierInvoices(
        {
          search: filters.q,
          status: filters.statut,
          supplierId: filters.fournisseur,
          from: filters.du,
          to: filters.au,
        },
        { canSeeImputations: mayReadImputations, canSeePayments: mayReadPayments }
      )

      /*
       * Le montant PAYÉ et le RESTE DÛ ne sortent qu'avec
       * `billing.supplier_payments.view`, comme à l'écran : une colonne à zéro
       * dans un classeur exporté ferait autorité alors qu'elle n'aurait rien lu.
       */
      return dataset(
        rows,
        [
          { header: 'Facture', width: 20, value: (r) => r.invoiceNo },
          { header: 'Référence fournisseur', width: 22, value: (r) => r.externalRef },
          { header: 'Fournisseur', width: 34, value: (r) => r.supplierLabel },
          {
            header: 'Date',
            width: 14,
            format: 'date',
            value: (r) => toExcelDate(r.invoiceDate),
          },
          {
            header: 'Échéance',
            width: 14,
            format: 'date',
            value: (r) => toExcelDate(r.dueDate),
          },
          { header: 'Montant brut', width: 18, format: 'amount', value: (r) => r.grossAmount },
          ...(mayReadImputations
            ? ([
                {
                  header: 'Total imputé',
                  width: 18,
                  format: 'amount' as const,
                  value: (r: (typeof rows)[number]) => r.imputedAmount,
                },
                {
                  header: 'Net à payer',
                  width: 18,
                  format: 'amount' as const,
                  value: (r: (typeof rows)[number]) => r.netPayable,
                },
              ])
            : []),
          ...(mayReadPayments
            ? ([
                {
                  header: 'Total réglé',
                  width: 18,
                  format: 'amount' as const,
                  value: (r: (typeof rows)[number]) => r.paidAmount,
                },
                {
                  header: 'Reste dû',
                  width: 18,
                  format: 'amount' as const,
                  value: (r: (typeof rows)[number]) => r.remainingDue,
                },
              ])
            : []),
          {
            header: 'État',
            width: 22,
            value: (r) =>
              SUPPLIER_INVOICE_STATUS_LABELS[
                displaySupplierInvoiceStatus(r.status, r.dueDate, r.netPayable, r.paidAmount)
              ],
          },
        ],
        mayReadImputations && mayReadPayments
          ? 'Montant brut, imputations, règlements et reste dû'
          : 'Montant brut — certaines sommes ne sont pas lisibles'
      )
    },
  },

  ecritures: {
    title: 'Écritures',
    viewPermission: PERMISSIONS.ENTRIES_VIEW,
    permission: PERMISSIONS.ENTRIES_EXPORT,
    entityType: 'treasury_entries',
    moduleCode: 'treasury',
    async build(filters) {
      const rows = await listTreasuryEntries({
        accountId: filters.compte,
        direction: filters.sens,
        status: filters.statut,
        from: filters.du,
        to: filters.au,
      })

      /*
       * Le montant sort SIGNÉ (Module 06 §19) : stocké positif, il se lirait
       * autrement comme une entrée dans un tableur où le sens ne se voit pas.
       * Une écriture annulée sort à zéro — elle ne compte plus dans le solde
       * (§36) — et sa colonne « État » le dit.
       */
      return dataset(rows, [
        { header: 'Date', width: 14, format: 'date', value: (r) => toExcelDate(r.entryDate) },
        { header: 'Compte', width: 34, value: (r) => r.accountLabel },
        { header: 'Origine', width: 24, value: (r) => ENTRY_KIND_LABELS[r.kind] },
        { header: 'Sens', width: 12, value: (r) => DIRECTION_LABELS[r.direction] },
        {
          header: 'Montant',
          width: 18,
          format: 'amount',
          value: (r) =>
            r.status === 'CANCELLED' ? 0 : r.direction === 'IN' ? r.amount : -r.amount,
        },
        { header: 'Libellé', width: 42, value: (r) => r.description },
        { header: 'Référence', width: 22, value: (r) => r.reference },
        { header: 'État', width: 14, value: (r) => ENTRY_STATUS_LABELS[r.status] },
      ])
    },
  },

  categories: {
    title: 'Catégories de véhicules',
    viewPermission: PERMISSIONS.CATEGORIES_VIEW,
    permission: PERMISSIONS.CATEGORIES_EXPORT,
    entityType: 'vehicle_categories',
    moduleCode: 'rental',
    async build() {
      // Catégories archivées comprises : des véhicules et des tarifs y font
      // encore référence, et un inventaire qui les tait est incomplet.
      const rows = await listCategories(true)

      return dataset(rows, [
        { header: 'Code', width: 16, value: (r) => r.code },
        { header: 'Libellé', width: 32, value: (r) => r.label },
        { header: 'Description', width: 46, value: (r) => r.description },
        { header: 'Véhicules', width: 11, format: 'number', value: (r) => r.vehicleCount },
        { header: 'État', width: 14, value: (r) => (r.isActive ? 'Active' : 'Archivée') },
      ])
    },
  },

  /*
   * CATALOGUE DE SERVICES — LOT 20.
   *
   * L'export porte L'IDENTITÉ du catalogue : référence, libellé, catégorie,
   * destination, nombre de variantes, statut. Il ne porte AUCUN PRIX, et ce
   * n'est pas un oubli.
   *
   *   1. UN PRIX EST UNE LIGNE DATÉE. Le prix applicable se résout EN BASE, à
   *      une date donnée (`resolve_service_price`, D16(c)). Le recalculer ici,
   *      ligne par ligne, serait une SECONDE implémentation de la résolution —
   *      celle qui finit par diverger de l'autre.
   *
   *   2. UN CLASSEUR CIRCULE. Il se transfère, se conserve et s'ouvre hors du
   *      système. Un prix d'achat n'a rien à y faire, quelles que soient les
   *      permissions du lecteur au moment de l'export — même raisonnement que
   *      pour les coordonnées bancaires des fournisseurs.
   *
   * Les prix se lisent sur la fiche, où le résolveur s'applique et où la
   * capacité de lecture des coûts est vérifiée à chaque affichage.
   */
  services: {
    title: 'Services',
    viewPermission: PERMISSIONS.SERVICES_VIEW,
    permission: PERMISSIONS.SERVICES_EXPORT,
    entityType: 'services',
    moduleCode: 'catalog',
    async build(filters) {
      const rows = await listServices({
        search: filters.q,
        status: filters.statut,
        categoryId: filters.categorie,
        purpose: filters.destination,
      })

      return dataset(
        rows,
        [
          { header: 'Référence', width: 14, value: (r) => r.serviceNo },
          { header: 'Service', width: 36, value: (r) => r.label },
          { header: 'Catégorie', width: 26, value: (r) => r.categoryLabel },
          {
            header: 'Destination',
            width: 18,
            value: (r) => SERVICE_PURPOSE_LABELS[r.purpose],
          },
          { header: 'Unité', width: 14, value: (r) => r.unitLabel },
          { header: 'Variantes', width: 11, format: 'number', value: (r) => r.variantCount },
          { header: 'Statut', width: 14, value: (r) => SERVICE_STATUS_LABELS[r.status] },
          { header: 'Description', width: 46, value: (r) => r.description },
        ],
        'Identité du catalogue — les prix se lisent sur la fiche, à une date donnée'
      )
    },
  },

  'devis-clients': {
    title: 'Devis clients',
    viewPermission: PERMISSIONS.SALES_QUOTES_VIEW,
    permission: PERMISSIONS.SALES_QUOTES_EXPORT,
    entityType: 'sales_quotes',
    moduleCode: 'commerce',
    async build(filters) {
      const rows = await listSalesQuotes({
        search: filters.q,
        status: filters.statut as QuoteStatus | 'ALL' | undefined,
        clientId: filters.client,
        from: filters.du,
        to: filters.au,
      })

      /*
       * Le TOTAL y figure, le DÉTAIL DES LIGNES non : un classeur de suivi
       * commercial répond à « où en sont mes devis », pas à « que contient
       * celui-ci ». Le détail se lit sur la fiche, ou se remet au client sous
       * forme de document (`commerce.sales_quotes.download`).
       *
       * 🟥 AUCUN COÛT, AUCUNE MARGE — `SalesQuoteListItem` n'en porte aucun,
       * parce que la table n'en a aucun (Plan 02 §9.3).
       */
      return dataset(
        rows,
        [
          { header: 'Numéro', width: 20, value: (r) => r.quoteNo },
          { header: 'Date', width: 13, format: 'date', value: (r) => toExcelDate(r.quoteDate) },
          {
            header: 'Valable jusqu’au',
            width: 16,
            format: 'date',
            value: (r) => toExcelDate(r.validUntil),
          },
          { header: 'Client', width: 34, value: (r) => r.clientLabel },
          { header: 'Statut', width: 14, value: (r) => QUOTE_STATUS_LABELS[r.status] },
          { header: 'Lignes', width: 10, format: 'number', value: (r) => r.lineCount },
          { header: 'Total', width: 16, format: 'amount', value: (r) => r.total },
        ],
        'Devis clients — montants figés à la date de chaque devis'
      )
    },
  },

  'commandes-clients': {
    title: 'Commandes clients',
    viewPermission: PERMISSIONS.SALES_ORDERS_VIEW,
    permission: PERMISSIONS.SALES_ORDERS_EXPORT,
    entityType: 'sales_orders',
    moduleCode: 'commerce',
    async build(filters) {
      const rows = await listSalesOrders({
        search: filters.q,
        status: filters.statut as OrderStatus | 'ALL' | undefined,
        clientId: filters.client,
        from: filters.du,
        to: filters.au,
      })

      return dataset(
        rows,
        [
          { header: 'Numéro', width: 20, value: (r) => r.orderNo },
          { header: 'Date', width: 13, format: 'date', value: (r) => toExcelDate(r.orderDate) },
          {
            header: 'Livraison attendue',
            width: 18,
            format: 'date',
            value: (r) => toExcelDate(r.expectedDate),
          },
          { header: 'Client', width: 34, value: (r) => r.clientLabel },
          // `null` sans `commerce.sales_quotes.view` : la colonne se tait
          // plutôt que d'affirmer qu'aucun devis n'est à l'origine (DEC-017).
          { header: 'Devis d’origine', width: 20, value: (r) => r.quoteNo },
          { header: 'Statut', width: 14, value: (r) => ORDER_STATUS_LABELS[r.status] },
          { header: 'Lignes', width: 10, format: 'number', value: (r) => r.lineCount },
          { header: 'Total', width: 16, format: 'amount', value: (r) => r.total },
        ],
        'Commandes clients — montants repris du devis, jamais relus du catalogue'
      )
    },
  },

  /*
   * 🟥 DEUX CLASSEURS DE COÛTS D'ACHAT — Plan 02 §30 du cadrage LOT 26 :
   * « un utilisateur qui ne peut pas voir les montants fournisseurs ne doit pas
   * les récupérer via CSV ».
   *
   * `viewPermission` ET `permission` sont exigées toutes les deux, comme pour
   * tous les exports du SaaS : l'export n'est JAMAIS plus permissif que l'écran.
   * Ici, `viewPermission` est elle-même la barrière de confidentialité — un
   * devis fournisseur n'est qu'un prix d'achat.
   */
  'devis-fournisseurs': {
    title: 'Devis fournisseurs',
    viewPermission: PERMISSIONS.PURCHASE_QUOTES_VIEW,
    permission: PERMISSIONS.PURCHASE_QUOTES_EXPORT,
    entityType: 'purchase_quotes',
    moduleCode: 'commerce',
    async build(filters) {
      const rows = await listPurchaseQuotes({
        search: filters.q,
        status: filters.statut as PurchaseQuoteStatus | 'ALL' | undefined,
        supplierId: filters.fournisseur,
        from: filters.du,
        to: filters.au,
      })

      /*
       * Le TOTAL y figure, le DÉTAIL DES LIGNES non : un classeur de suivi des
       * achats répond à « où en sont mes consultations », pas à « que contient
       * celle-ci ». Le détail se lit sur la fiche.
       *
       * LES DEUX RÉFÉRENCES y figurent : celle d'ADIKOM classe, celle du
       * fournisseur permet de rapprocher avec ses propres documents.
       */
      return dataset(
        rows,
        [
          { header: 'Numéro', width: 20, value: (r) => r.quoteNo },
          { header: 'Réf. fournisseur', width: 20, value: (r) => r.externalRef },
          { header: 'Date', width: 13, format: 'date', value: (r) => toExcelDate(r.quoteDate) },
          {
            header: 'Valable jusqu’au',
            width: 16,
            format: 'date',
            value: (r) => toExcelDate(r.validUntil),
          },
          { header: 'Fournisseur', width: 34, value: (r) => r.supplierLabel },
          { header: 'Statut', width: 14, value: (r) => PURCHASE_QUOTE_STATUS_LABELS[r.status] },
          { header: 'Lignes', width: 10, format: 'number', value: (r) => r.lineCount },
          { header: 'Total', width: 16, format: 'amount', value: (r) => r.total },
        ],
        'Devis fournisseurs — prix proposés par chaque fournisseur, figés à la date de son offre'
      )
    },
  },

  'commandes-fournisseurs': {
    title: 'Commandes fournisseurs',
    viewPermission: PERMISSIONS.PURCHASE_ORDERS_VIEW,
    permission: PERMISSIONS.PURCHASE_ORDERS_EXPORT,
    entityType: 'purchase_orders',
    moduleCode: 'commerce',
    async build(filters) {
      const rows = await listPurchaseOrders({
        search: filters.q,
        status: filters.statut as PurchaseOrderStatus | 'ALL' | undefined,
        supplierId: filters.fournisseur,
        from: filters.du,
        to: filters.au,
      })

      return dataset(
        rows,
        [
          { header: 'Numéro', width: 20, value: (r) => r.orderNo },
          { header: 'Date', width: 13, format: 'date', value: (r) => toExcelDate(r.orderDate) },
          {
            header: 'Réception attendue',
            width: 18,
            format: 'date',
            value: (r) => toExcelDate(r.expectedDate),
          },
          { header: 'Fournisseur', width: 34, value: (r) => r.supplierLabel },
          // `null` sans `commerce.purchase_quotes.view` : la colonne se tait
          // plutôt que d'affirmer qu'aucune offre n'est à l'origine (DEC-017).
          { header: 'Offre d’origine', width: 20, value: (r) => r.quoteNo },
          { header: 'Statut', width: 14, value: (r) => PURCHASE_ORDER_STATUS_LABELS[r.status] },
          { header: 'Lignes', width: 10, format: 'number', value: (r) => r.lineCount },
          { header: 'Total', width: 16, format: 'amount', value: (r) => r.total },
        ],
        'Commandes fournisseurs — montants repris de l’offre retenue, jamais relus du catalogue'
      )
    },
  },

  tarification: {
    title: 'Grille tarifaire',
    viewPermission: PERMISSIONS.PRICING_VIEW,
    permission: PERMISSIONS.PRICING_EXPORT,
    entityType: 'pricing_rules',
    moduleCode: 'rental',
    async build() {
      /*
       * Les conditions consenties à un client sont une information distincte du
       * barème : sans `parties.clients.pricing.view`, l'export se limite aux
       * tarifs standard.
       *
       * RLS n'aurait pas suffi ici — `pricing_rules` est lisible dans son
       * ensemble par qui consulte la tarification. La restriction est donc
       * posée à la construction, comme sur la fiche client.
       */
      const mayReadClientPricing = await can(PERMISSIONS.CLIENTS_PRICING_VIEW)

      const rows = await listPricingRules(
        mayReadClientPricing ? { includeInactive: true } : { clientId: null, includeInactive: true }
      )

      return dataset(
        rows,
        [
          {
            header: 'Portée',
            width: 30,
            value: (r) => r.vehicleLabel ?? r.categoryLabel ?? 'Tous les véhicules',
          },
          { header: 'Client', width: 32, value: (r) => r.clientLabel ?? 'Tous les clients' },
          { header: 'Montant', width: 16, format: 'amount', value: (r) => r.amount },
          { header: 'Unité', width: 12, value: (r) => (r.unit ? UNIT_LABELS[r.unit] : null) },
          { header: 'Remise %', width: 11, format: 'number', value: (r) => r.discountPercent },
          { header: 'Du', width: 13, format: 'date', value: (r) => toExcelDate(r.validFrom) },
          { header: 'Au', width: 13, format: 'date', value: (r) => toExcelDate(r.validTo) },
          { header: 'Conditions', width: 34, value: (r) => r.conditions },
          { header: 'État', width: 13, value: (r) => (r.isActive ? 'Actif' : 'Désactivé') },
        ],
        mayReadClientPricing
          ? 'Tarifs standard et conditions préférentielles'
          : 'Tarifs standard'
      )
    },
  },

  /*
   * TARIFS FOURNISSEURS — LOT 21, DEC-044.
   *
   * POURQUOI CET EXPORT PORTE LES MONTANTS, ALORS QUE CELUI DES SERVICES NE
   * PORTE AUCUN PRIX
   *
   * L'export des services refuse les prix parce que son objet est l'IDENTITÉ du
   * catalogue : y ajouter un prix supposerait de le résoudre à une date, donc de
   * réimplémenter la résolution dans un classeur (§8.4 du Rapport 12).
   *
   * Ici, le montant EST l'objet : un export de tarifs fournisseurs sans tarif ne
   * serait pas un export, et `rental.pricing.supplier.export` ne débloquerait
   * rien — ce que `CLAUDE.md` §19 bis proscrit. La date de résolution est donc
   * portée par le classeur lui-même, et chaque ligne dit à quelle date son coût
   * s'appliquait.
   *
   * DEUX GARDES, ET LA SECONDE N'EST PAS FACULTATIVE
   *
   *   · `viewPermission` = `rental.pricing.supplier.view` : on n'exporte pas ce
   *     qu'on n'a pas le droit de voir. Sans elle, RLS rendrait un classeur VIDE,
   *     et le lecteur croirait qu'aucun coût n'existe (DEC-017) ;
   *   · `permission` = `rental.pricing.supplier.export` : emporter un fichier
   *     n'est pas consulter un écran (DEC-024). UN CLASSEUR CIRCULE — il se
   *     transfère, se conserve et s'ouvre hors du système. C'est exactement
   *     pourquoi cette capacité est SENSIBLE, et attribuée à part.
   *
   * Le classeur porte l'avertissement en sous-titre : ce qu'il contient ne se
   * remet à aucun client (Plan 02 §6.4).
   */
  'tarifs-fournisseurs': {
    title: 'Tarifs fournisseurs',
    viewPermission: PERMISSIONS.PRICING_SUPPLIER_VIEW,
    permission: PERMISSIONS.PRICING_SUPPLIER_EXPORT,
    entityType: 'supplier_vehicle_rates',
    moduleCode: 'rental',
    async build(filters) {
      const on = /^\d{4}-\d{2}-\d{2}$/.test(filters.au ?? '') ? filters.au : todayISO()

      /*
       * L'HISTORIQUE ENTIER, versions retirées comprises — et non le seul coût
       * du jour. C'est précisément ce qu'un export sert à emporter : « quel coût
       * s'appliquait, et depuis quand ? ». Chaque ligne porte sa période, et
       * l'état dit si la version compte encore.
       */
      const rows = await listSupplierRates({ includeRetired: true })

      return dataset(
        rows,
        [
          { header: 'Véhicule', width: 34, value: (r) => r.vehicleLabel },
          { header: 'Référence', width: 14, value: (r) => r.vehicleNo },
          { header: 'Fournisseur', width: 30, value: (r) => r.supplierLabel },
          { header: 'Coût d’acquisition', width: 18, format: 'amount', value: (r) => r.amount },
          { header: 'Unité', width: 12, value: (r) => (r.unit ? UNIT_LABELS[r.unit] : null) },
          { header: 'Du', width: 13, format: 'date', value: (r) => toExcelDate(r.validFrom) },
          { header: 'Au', width: 13, format: 'date', value: (r) => toExcelDate(r.validTo) },
          { header: 'État', width: 13, value: (r) => (r.isActive ? 'En vigueur' : 'Retirée') },
          { header: 'Conditions', width: 40, value: (r) => r.conditions },
          { header: 'Motif', width: 30, value: (r) => r.reason },
          { header: 'Motif du retrait', width: 30, value: (r) => r.deactivationReason },
        ],
        `Coûts internes ADIKOM — état au ${on}. Document interne : ne pas remettre à un client.`
      )
    },
  },

  /*
   * JOURNAL D'ACTIVITÉ — Règles métier 06 (Audit) §64.
   *
   * L'export porte L'ÉVÉNEMENT, jamais la SITUATION AVANT / APRÈS.
   *
   * Ce n'est pas une facilité : un classeur circule, se transfère et se
   * conserve hors du système, et la donnée métier d'un événement ne s'ouvre
   * qu'à qui détient la lecture de l'objet concerné — objet par objet
   * (DEC-038). Un fichier unique mêlant quarante-huit types d'objet ne saurait
   * porter cet arbitrage : il l'annulerait.
   *
   * Ce qui sort est donc exactement ce que la LISTE montre, plus les champs
   * modifiés — assez pour retracer qui a fait quoi, quand, sur quoi et avec
   * quel résultat (§76), sans rien divulguer de plus que l'écran (§80).
   */
  journal: {
    title: 'Journal d’activité',
    viewPermission: PERMISSIONS.AUDIT_VIEW,
    permission: PERMISSIONS.AUDIT_EXPORT,
    entityType: 'audit_log',
    moduleCode: 'users',
    async build(filters) {
      const { events, truncated } = await listAuditEventsForExport({
        search: filters.q,
        actorId: filters.auteur,
        moduleCode: filters.module,
        entityType: filters.objet,
        action: filters.action,
        result: filters.resultat,
        from: filters.du,
        to: filters.au,
      })

      return dataset(
        events,
        [
          {
            header: 'Date et heure',
            width: 20,
            // Texte plutôt que date Excel : l'heure est celle des Comores
            // (DEC-025 §e), et un tableur la réinterpréterait sur le fuseau du
            // poste qui l'ouvre.
            value: (r) => formatDateTime(r.occurredAt),
          },
          { header: 'Auteur', width: 28, value: (r) => r.actorLabel },
          { header: 'Action', width: 26, value: (r) => AUDIT_ACTION_LABELS[r.action] },
          { header: 'Résultat', width: 12, value: (r) => AUDIT_RESULT_LABELS[r.result] },
          { header: 'Module', width: 26, value: (r) => auditModuleLabel(r.moduleCode) },
          { header: 'Type d’objet', width: 30, value: (r) => auditEntityLabel(r.entityType) },
          { header: 'Objet', width: 34, value: (r) => r.entityLabel },
          { header: 'Référence interne', width: 38, value: (r) => r.entityId },
          {
            header: 'Champs modifiés',
            width: 44,
            value: (r) => (r.changedFields ?? []).map(auditFieldLabel).join(', ') || null,
          },
          { header: 'Motif', width: 40, value: (r) => r.reason },
          { header: 'Commentaire', width: 40, value: (r) => r.comment },
        ],
        truncated
          ? `Les ${EXPORT_LIMIT.toLocaleString('fr-FR')} événements les plus récents — affinez les filtres pour couvrir le reste`
          : 'Événements, sans la situation avant / après'
      )
    },
  },
}

export function getExportDefinition(module: string): ExportDefinition | null {
  return Object.hasOwn(EXPORTS, module) ? EXPORTS[module] : null
}
