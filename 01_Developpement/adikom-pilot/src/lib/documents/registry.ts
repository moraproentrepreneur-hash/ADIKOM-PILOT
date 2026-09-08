import 'server-only'

import type { ReactElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'

import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'
import { can } from '@/lib/auth/dal'
import { getDocumentIdentity } from './identity'
import { issuedOnLabel } from './render'

import { ClientSheetDocument } from '@/features/clients/documents/client-sheet'
import { getClientDetail } from '@/features/clients/data'
import { SupplierSheetDocument } from '@/features/suppliers/documents/supplier-sheet'
import { getSupplierDetail, listSupplierPaymentDetails } from '@/features/suppliers/data'
import { PartnerSheetDocument } from '@/features/partners/documents/partner-sheet'
import { getPartnerDetail } from '@/features/partners/data'
import { VehicleSheetDocument } from '@/features/fleet/documents/vehicle-sheet'
import {
  getVehicleDetail,
  listOccupations,
  listSupplierHistory,
  listVehicleDocuments,
  listVehicles,
} from '@/features/fleet/data'
import { PricingGridDocument } from '@/features/pricing/documents/pricing-grid'
import { listPricingRules } from '@/features/pricing/data'
import {
  DepartureReportDocument,
  RentalContractDocument,
  ReturnReportDocument,
} from '@/features/rentals/documents/rental-documents'
import { getRentalDetail, listInspections } from '@/features/rentals/data'
import { ReservationConfirmationDocument } from '@/features/reservations/documents/reservation-confirmation'
import { getReservationDetail } from '@/features/reservations/data'
import { CustomerInvoiceDocument } from '@/features/customer-invoices/documents/customer-invoice'
import {
  getCustomerInvoiceDetail,
  listCustomerInvoiceLines,
} from '@/features/customer-invoices/data'
import { SupplierInvoiceDocument } from '@/features/supplier-invoices/documents/supplier-invoice'
import {
  getSupplierInvoiceDetail,
  listSupplierInvoiceLines,
} from '@/features/supplier-invoices/data'
import { listInvoiceImputations } from '@/features/imputations/data'
import { MiscPaymentReceiptDocument } from '@/features/misc-payments/documents/misc-payment-receipt'
import { getMiscPayment } from '@/features/misc-payments/data'

/**
 * Registre des documents.
 *
 * Un seul point d'entrée décrit, pour chaque type : la permission de
 * téléchargement, celle d'impression, et la façon de le construire. Ajouter un
 * document revient à ajouter une entrée — la route, les contrôles d'accès et le
 * rendu ne changent pas.
 *
 * DEC-024 : télécharger et imprimer sont deux capacités distinctes, aucune
 * n'étant incluse dans le droit de consulter.
 *
 * NOMMAGE DES TYPES — au pluriel, toujours.
 *
 * La route `/api/documents/vehicule/[id]` sert déjà les PIÈCES JOINTES d'un
 * véhicule — des fichiers déposés, pas des documents produits. Un segment
 * statique l'emporte sur un segment dynamique : un type nommé « vehicule »
 * serait donc capté par cette route et ne produirait jamais de PDF.
 *
 * Le pluriel écarte la collision — `vehicules` ≠ `vehicule` — et distingue au
 * passage ce que le système produit de ce qu'il conserve.
 *
 * DOCUMENTS DE LISTE
 *
 * La grille tarifaire ne porte pas sur un enregistrement : son identifiant est
 * conventionnel (`/api/documents/tarification/grille`) et son constructeur
 * l'ignore.
 */

export type BuiltDocument = {
  element: ReactElement<DocumentProps>
  /** Référence de l'enregistrement, reprise dans le nom du fichier. */
  reference: string | null
  /** Intitulé court, repris dans le nom du fichier et le journal d'audit. */
  label: string
}

export type DocumentDefinition = {
  /** Type d'entité journalisé dans l'audit. */
  entityType: string
  moduleCode: string
  /**
   * Droit de consulter la ressource.
   *
   * Exigé EN PLUS de la capacité documentaire, jamais à sa place. `download`
   * n'ouvre donc pas une porte dérobée sur une ressource que le lecteur n'a
   * pas le droit de voir.
   *
   * L'inverse resterait faux : `view` n'autorise ni à télécharger ni à
   * imprimer (DEC-024). Cumuler les deux exigences resserre le contrôle ; ce
   * serait le relâcher que d'en déduire l'une de l'autre.
   */
  viewPermission: PermissionCode
  downloadPermission: PermissionCode
  printPermission: PermissionCode
  /** `null` si l'enregistrement n'existe pas ou n'est pas lisible. */
  build: (id: string) => Promise<BuiltDocument | null>
}

/**
 * Fabrique les trois documents du cycle de location.
 *
 * Ils chargent exactement les mêmes données ; seule la pièce produite change.
 * Écrire trois fois ce chargement aurait laissé trois occasions de diverger —
 * et de laisser fuir, dans l'un d'eux, ce que les deux autres protègent.
 *
 * CHAQUE LECTURE EST CONDITIONNÉE À SON PROPRE DROIT.
 *
 * Le client, le véhicule et les montants relèvent de permissions distinctes de
 * `rental.rentals.view`. Ce qui n'est pas accessible n'est pas chargé, donc ne
 * peut pas figurer dans le PDF : un document n'expose jamais plus que l'écran
 * (DEC-024). Le modèle, lui, le MENTIONNE plutôt que de le taire (DEC-017).
 */
function rentalDocument(
  label: string,
  render: (props: {
    identity: Awaited<ReturnType<typeof getDocumentIdentity>>
    rental: NonNullable<Awaited<ReturnType<typeof getRentalDetail>>>
    client: Awaited<ReturnType<typeof getClientDetail>>
    vehicle: Awaited<ReturnType<typeof getVehicleDetail>>
    inspections: Awaited<ReturnType<typeof listInspections>>
    showAmounts: boolean
    issuedOn: string
  }) => ReactElement<DocumentProps>
): DocumentDefinition {
  return {
    entityType: 'rentals',
    moduleCode: 'rental',
    viewPermission: PERMISSIONS.RENTALS_VIEW,
    downloadPermission: PERMISSIONS.RENTALS_DOWNLOAD,
    printPermission: PERMISSIONS.RENTALS_PRINT,

    async build(id) {
      const rental = await getRentalDetail(id)
      if (!rental) return null

      const [mayReadClient, mayReadFleet, showAmounts] = await Promise.all([
        can(PERMISSIONS.CLIENTS_VIEW),
        can(PERMISSIONS.FLEET_VIEW),
        can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
      ])

      const [client, vehicle, inspections, identity] = await Promise.all([
        mayReadClient ? getClientDetail(rental.clientId) : Promise.resolve(null),
        mayReadFleet ? getVehicleDetail(rental.vehicleId) : Promise.resolve(null),
        listInspections(id),
        getDocumentIdentity(),
      ])

      return {
        element: render({
          identity,
          rental,
          client,
          vehicle,
          inspections,
          showAmounts,
          issuedOn: issuedOnLabel(),
        }),
        reference: rental.rentalNo,
        label,
      }
    },
  }
}

export const DOCUMENTS: Record<string, DocumentDefinition> = {
  /* ------------------------------------------------------------ Clients -- */
  clients: {
    entityType: 'clients',
    moduleCode: 'parties',
    viewPermission: PERMISSIONS.CLIENTS_VIEW,
    downloadPermission: PERMISSIONS.CLIENTS_DOWNLOAD,
    printPermission: PERMISSIONS.CLIENTS_PRINT,

    async build(id) {
      // Lecture avec la session de l'appelant : RLS s'applique. Un client
      // invisible à l'écran l'est aussi dans le document.
      const client = await getClientDetail(id)
      if (!client) return null

      /*
       * Les conditions tarifaires n'entrent dans le document que si le lecteur
       * a le droit de les voir. Sans cette vérification, le PDF exposerait une
       * information que la fiche lui refuse.
       */
      const mayReadPricing = await can(PERMISSIONS.CLIENTS_PRICING_VIEW)
      const pricingRules = mayReadPricing
        ? await listPricingRules({ clientId: id, includeInactive: true })
        : null

      const identity = await getDocumentIdentity()

      return {
        element: ClientSheetDocument({
          identity,
          client,
          pricingRules,
          issuedOn: issuedOnLabel(),
        }),
        reference: client.clientNo,
        label: 'Fiche-client',
      }
    },
  },

  /* ------------------------------------------------------- Fournisseurs -- */
  fournisseurs: {
    entityType: 'suppliers',
    moduleCode: 'parties',
    viewPermission: PERMISSIONS.SUPPLIERS_VIEW,
    downloadPermission: PERMISSIONS.SUPPLIERS_DOWNLOAD,
    printPermission: PERMISSIONS.SUPPLIERS_PRINT,

    async build(id) {
      const supplier = await getSupplierDetail(id)
      if (!supplier) return null

      /*
       * Les informations de paiement exigent leur propre permission
       * (Fournisseurs §44). Elles sont en outre filtrées par RLS : sans le
       * droit, la lecture ne renvoie rien. Le contrôle explicite évite
       * simplement d'interroger la base pour rien, et distingue « pas le
       * droit » (`null`, section absente) de « aucune coordonnée »
       * (tableau vide, section qui le dit).
       */
      const mayReadPayments = await can(PERMISSIONS.SUPPLIERS_BANK_VIEW)
      const payments = mayReadPayments ? await listSupplierPaymentDetails(id) : null

      // `null` sans la permission : la section disparaît du document, au lieu
      // d'annoncer un parc vide qui n'est qu'un refus d'accès (DEC-017).
      const mayReadFleet = await can(PERMISSIONS.FLEET_VIEW)
      const vehicles = mayReadFleet ? await listVehicles({ supplierId: id }) : null

      const identity = await getDocumentIdentity()

      return {
        element: SupplierSheetDocument({
          identity,
          supplier,
          vehicles,
          payments,
          issuedOn: issuedOnLabel(),
        }),
        reference: supplier.supplierNo,
        label: 'Fiche-fournisseur',
      }
    },
  },

  /* -------------------------------------------------------- Partenaires -- */
  partenaires: {
    entityType: 'partners',
    moduleCode: 'parties',
    viewPermission: PERMISSIONS.PARTNERS_VIEW,
    downloadPermission: PERMISSIONS.PARTNERS_DOWNLOAD,
    printPermission: PERMISSIONS.PARTNERS_PRINT,

    async build(id) {
      const partner = await getPartnerDetail(id)
      if (!partner) return null

      const mayReadFleet = await can(PERMISSIONS.FLEET_VIEW)
      // Le rattachement d'un partenaire passe par `partner_id`, jamais par le
      // fournisseur : les deux voies sont exclusives (DEC-021).
      // `null` sans la permission : la section disparaît (DEC-017).
      const vehicles = mayReadFleet ? await listVehicles({ partnerId: id }) : null

      const identity = await getDocumentIdentity()

      return {
        element: PartnerSheetDocument({
          identity,
          partner,
          vehicles,
          issuedOn: issuedOnLabel(),
        }),
        reference: partner.partnerNo,
        label: 'Fiche-partenaire',
      }
    },
  },

  /* ----------------------------------------------------------- Véhicules -- */
  vehicules: {
    entityType: 'vehicles',
    moduleCode: 'rental',
    viewPermission: PERMISSIONS.FLEET_VIEW,
    downloadPermission: PERMISSIONS.FLEET_DOWNLOAD,
    printPermission: PERMISSIONS.FLEET_PRINT,

    async build(id) {
      const vehicle = await getVehicleDetail(id)
      if (!vehicle) return null

      const mayReadDocuments = await can(PERMISSIONS.VEHICLE_DOCUMENTS_VIEW)

      const [history, documents, occupations, identity] = await Promise.all([
        listSupplierHistory(id),
        mayReadDocuments ? listVehicleDocuments(id) : Promise.resolve(null),
        listOccupations(id),
        getDocumentIdentity(),
      ])

      return {
        element: VehicleSheetDocument({
          identity,
          vehicle,
          history,
          documents,
          occupations,
          issuedOn: issuedOnLabel(),
        }),
        reference: vehicle.vehicleNo,
        label: 'Fiche-vehicule',
      }
    },
  },

  /* ------------------------------------------------------------ Location -- */
  //
  // TROIS DOCUMENTS, UNE SEULE LOCATION.
  //
  // Le registre est indexé par TYPE, pas par entité : trois entrées pointent
  // le même contrat et produisent trois pièces différentes. Elles partagent
  // les mêmes permissions — voir, télécharger, imprimer une location — parce
  // qu'aucune ne constitue une capacité que l'administrateur aurait à
  // attribuer séparément des deux autres.
  contrats: rentalDocument('Contrat-location', RentalContractDocument),
  departs: rentalDocument('Bon-depart', DepartureReportDocument),
  retours: rentalDocument('PV-retour', ReturnReportDocument),

  /* -------------------------------------------------------- Réservation -- */
  //
  // La CONFIRMATION DE RÉSERVATION — DEC-042 §c.
  //
  // La migration 037 avait retiré `download` et `print` de ce menu, faute de
  // document à produire. ADIKOM demande cette pièce ; la migration 078 les
  // rétablit, et cette entrée est ce qui les rend utiles.
  reservations: {
    entityType: 'reservations',
    moduleCode: 'rental',
    viewPermission: PERMISSIONS.RESERVATIONS_VIEW,
    downloadPermission: PERMISSIONS.RESERVATIONS_DOWNLOAD,
    printPermission: PERMISSIONS.RESERVATIONS_PRINT,

    async build(id) {
      const reservation = await getReservationDetail(id)
      if (!reservation) return null

      // Le tarif verrouillé relève de sa propre capacité (DEC-024) : sans elle,
      // la section entière disparaît du document comme elle disparaît de
      // l'écran. Un document n'expose jamais plus que la fiche.
      const showAmounts = await can(PERMISSIONS.RENTALS_FINANCIAL_VIEW)
      const identity = await getDocumentIdentity()

      return {
        element: ReservationConfirmationDocument({
          identity,
          reservation,
          showAmounts,
          issuedOn: issuedOnLabel(),
        }),
        reference: reservation.reservationNo,
        label: 'Confirmation-reservation',
      }
    },
  },

  /* ---------------------------------------------------- Factures clients -- */
  'factures-clients': {
    entityType: 'customer_invoices',
    moduleCode: 'billing',
    viewPermission: PERMISSIONS.CUSTOMER_INVOICES_VIEW,
    downloadPermission: PERMISSIONS.CUSTOMER_INVOICES_DOWNLOAD,
    printPermission: PERMISSIONS.CUSTOMER_INVOICES_PRINT,

    async build(id) {
      /*
       * L'encaissé et le solde relèvent de `billing.customer_payments.view`.
       * Sans cette capacité, ils ne sont ni lus ni écrits : une facture soldée
       * ne doit pas passer pour impayée faute de droit de lire ses règlements
       * (DEC-017, DEC-024).
       */
      const canSeePayments = await can(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW)

      const invoice = await getCustomerInvoiceDetail(id, { canSeePayments })
      if (!invoice) return null

      // Le client relève de `parties.clients.view` : sans elle, `clientLabel`
      // revient déjà `null` de la couche de données, et le document le dit.
      const mayReadClient = await can(PERMISSIONS.CLIENTS_VIEW)
      const client = mayReadClient ? await getClientDetail(invoice.clientId) : null

      const [lines, identity] = await Promise.all([
        listCustomerInvoiceLines(id),
        getDocumentIdentity(),
      ])

      return {
        element: CustomerInvoiceDocument({
          identity,
          invoice,
          lines,
          clientLabel: invoice.clientLabel,
          clientAddress: client
            ? [client.address, client.city, client.country].filter(
                (line): line is string => Boolean(line)
              )
            : null,
          showPayments: canSeePayments,
          issuedOn: issuedOnLabel(),
        }),
        reference: invoice.invoiceNo,
        label: 'Facture-client',
      }
    },
  },

  /* ----------------------------------------------- Factures fournisseurs -- */
  'factures-fournisseurs': {
    entityType: 'supplier_invoices',
    moduleCode: 'billing',
    viewPermission: PERMISSIONS.SUPPLIER_INVOICES_VIEW,
    downloadPermission: PERMISSIONS.SUPPLIER_INVOICES_DOWNLOAD,
    printPermission: PERMISSIONS.SUPPLIER_INVOICES_PRINT,

    async build(id) {
      /*
       * Une imputation n'est pas un paiement (CLAUDE.md §57). Les deux
       * capacités sont donc éprouvées séparément, et ce qui n'est pas lisible
       * n'est pas écrit — un « 0 imputé » ferait passer pour dû ce qu'une
       * imputation a déjà réduit.
       */
      const [canSeeImputations, canSeePayments] = await Promise.all([
        can(PERMISSIONS.IMPUTATIONS_VIEW),
        can(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW),
      ])

      const invoice = await getSupplierInvoiceDetail(id, {
        canSeeImputations,
        canSeePayments,
      })
      if (!invoice) return null

      const [lines, imputations, identity] = await Promise.all([
        listSupplierInvoiceLines(id),
        canSeeImputations ? listInvoiceImputations(id) : Promise.resolve(null),
        getDocumentIdentity(),
      ])

      return {
        element: SupplierInvoiceDocument({
          identity,
          invoice,
          lines,
          imputations:
            imputations?.map((imputation) => ({
              imputationNo: imputation.imputationNo,
              amount: imputation.amount,
              maintenanceNo: imputation.maintenanceNo,
            })) ?? null,
          issuedOn: issuedOnLabel(),
        }),
        reference: invoice.invoiceNo,
        label: 'Facture-fournisseur',
      }
    },
  },

  /* ------------------------------------------------------ Paiement divers -- */
  'paiements-divers': {
    entityType: 'misc_payments',
    moduleCode: 'billing',
    viewPermission: PERMISSIONS.MISC_PAYMENTS_VIEW,
    downloadPermission: PERMISSIONS.MISC_PAYMENTS_DOWNLOAD,
    printPermission: PERMISSIONS.MISC_PAYMENTS_PRINT,

    async build(id) {
      const payment = await getMiscPayment(id)
      if (!payment) return null

      const identity = await getDocumentIdentity()

      return {
        element: MiscPaymentReceiptDocument({
          identity,
          payment,
          issuedOn: issuedOnLabel(),
        }),
        reference: payment.paymentNo,
        label: payment.direction === 'IN' ? 'Recu-encaissement' : 'Recu-decaissement',
      }
    },
  },

  /* -------------------------------------------------------- Tarification -- */
  tarification: {
    entityType: 'pricing_rules',
    moduleCode: 'rental',
    viewPermission: PERMISSIONS.PRICING_VIEW,
    downloadPermission: PERMISSIONS.PRICING_DOWNLOAD,
    printPermission: PERMISSIONS.PRICING_PRINT,

    async build() {
      // Tarifs standard uniquement : une grille commerciale ne divulgue pas les
      // conditions consenties à un client en particulier.
      const rules = await listPricingRules({ clientId: null })
      const identity = await getDocumentIdentity()

      return {
        element: PricingGridDocument({
          identity,
          rules,
          issuedOn: issuedOnLabel(),
        }),
        reference: null,
        label: 'Grille-tarifaire',
      }
    },
  },
}

export function getDocumentDefinition(type: string): DocumentDefinition | null {
  return Object.hasOwn(DOCUMENTS, type) ? DOCUMENTS[type] : null
}
