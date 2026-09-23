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
import type { ContractPeriod } from '@/features/rentals/documents/rental-blocks'
import { RentalStatementDocument } from '@/features/rentals/documents/rental-statement'
import { buildRentalStatement } from '@/features/rentals/documents/statement-data'
import { getRentalDetail, listInspections } from '@/features/rentals/data'
import { RentalAmendmentDocument } from '@/features/amendments/documents/rental-amendment'
import { SEGMENT_STATUS_LABELS } from '@/features/amendments/constants'
import {
  getAmendmentRentalId,
  getRentalAmendment,
  listRentalSegments,
} from '@/features/amendments/data'
import { ReservationConfirmationDocument } from '@/features/reservations/documents/reservation-confirmation'
import { getReservationDetail } from '@/features/reservations/data'
import { CustomerInvoiceDocument } from '@/features/customer-invoices/documents/customer-invoice'
import { listBillingPeriods } from '@/features/billing-periods/data'
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
import {
  SalesOrderDocument,
  SalesQuoteDocument,
} from '@/features/commerce/documents/commercial-documents'
import {
  getSalesOrder,
  getSalesQuote,
  listSalesOrderLines,
  listSalesQuoteLines,
} from '@/features/commerce/data'

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
    periods?: ContractPeriod[]
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

      const [client, vehicle, inspections, segments, identity] = await Promise.all([
        mayReadClient ? getClientDetail(rental.clientId) : Promise.resolve(null),
        mayReadFleet ? getVehicleDetail(rental.vehicleId) : Promise.resolve(null),
        listInspections(id),
        // LOT 22 : les périodes successives du contrat. Elles se lisent avec
        // `rental.rentals.view`, comme le reste du contrat.
        listRentalSegments(id),
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
          periods: segments.map(toContractPeriod),
          issuedOn: issuedOnLabel(),
        }),
        reference: rental.rentalNo,
        label,
      }
    },
  }
}

/**
 * Un segment de location, réduit à ce qu'un document client peut montrer.
 *
 * 🟥 LA CONVERSION EST LA BARRIÈRE. `RentalSegment` porte un coût gelé, qui est
 * confidentiel (A-2). `ContractPeriod` ne le porte pas : un modèle documentaire
 * ne peut donc pas le révéler, même par inadvertance, même pour un Super Admin
 * (Plan 02 §6.3, barrière n° 3).
 */
function toContractPeriod(segment: Awaited<ReturnType<typeof listRentalSegments>>[number]): ContractPeriod {
  return {
    sequenceNo: segment.sequenceNo,
    vehicleLabel: segment.vehicleLabel,
    from: segment.from,
    to: segment.to,
    amount: segment.lockedAmount,
    unit: segment.lockedUnit,
    statusLabel: SEGMENT_STATUS_LABELS[segment.status],
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
  // CINQ DOCUMENTS, UNE SEULE LOCATION.
  //
  // Le registre est indexé par TYPE, pas par entité : cinq entrées pointent
  // le même contrat et produisent cinq pièces différentes. Elles partagent
  // les mêmes permissions — voir, télécharger, imprimer une location — parce
  // qu'aucune ne constitue une capacité que l'administrateur aurait à
  // attribuer séparément des autres (Plan 02 §10.3).
  contrats: rentalDocument('Contrat-location', RentalContractDocument),
  departs: rentalDocument('Bon-depart', DepartureReportDocument),
  retours: rentalDocument('PV-retour', ReturnReportDocument),

  /*
   * AVENANT AU CONTRAT — LOT 22 (DEC-045), la quatrième pièce du cycle.
   *
   * 🟩 A-4 : « On garde le même contrat et on rajoute des avenants. » Un avenant
   * est une pièce CONTRACTUELLE : le client doit pouvoir la recevoir, signée, avec
   * l'avant et l'après du véhicule et du tarif.
   *
   * L'IDENTIFIANT EST CELUI DE L'AVENANT, non celui de la location : un contrat
   * peut en porter plusieurs, et « imprimer l'avenant n° 2 » doit désigner le
   * n° 2. Le contrat et ses périodes sont chargés à partir de lui.
   *
   * AUCUNE CAPACITÉ DOCUMENTAIRE NOUVELLE. `rental.rentals.download` et
   * `rental.rentals.print` gouvernent déjà les trois autres pièces du même cycle :
   * une quatrième capacité ne fermerait rien qu'elles n'aient déjà fermé
   * (CLAUDE.md §19 bis).
   *
   * 🟥 AUCUN COÛT, AUCUNE COMMISSION n'entre dans ce modèle — troisième barrière
   * du Plan 02 §6.3, vérifiée structurellement par `document.test.ts`.
   */
  avenants: {
    entityType: 'rental_amendments',
    moduleCode: 'rental',
    viewPermission: PERMISSIONS.RENTALS_VIEW,
    downloadPermission: PERMISSIONS.RENTALS_DOWNLOAD,
    printPermission: PERMISSIONS.RENTALS_PRINT,

    async build(id) {
      const amendment = await getRentalAmendment(id)
      if (!amendment) return null

      const rentalId = await getAmendmentRentalId(id)
      if (!rentalId) return null

      const rental = await getRentalDetail(rentalId)
      if (!rental) return null

      const [mayReadClient, showAmounts] = await Promise.all([
        can(PERMISSIONS.CLIENTS_VIEW),
        can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
      ])

      const [client, segments, identity] = await Promise.all([
        mayReadClient ? getClientDetail(rental.clientId) : Promise.resolve(null),
        listRentalSegments(rentalId),
        getDocumentIdentity(),
      ])

      return {
        element: RentalAmendmentDocument({
          identity,
          rental,
          amendment,
          periods: segments.map(toContractPeriod),
          openedSequenceNo:
            segments.find((segment) => segment.amendmentId === amendment.id)?.sequenceNo ?? null,
          client,
          showAmounts,
          issuedOn: issuedOnLabel(),
        }),
        reference: amendment.amendmentNo,
        label: 'Avenant-location',
      }
    },
  },

  /*
   * RELEVÉ DE LOCATION — LOT 24 (DEC-048), la cinquième pièce du cycle.
   *
   * 🟩 A-6 : « le client peut exiger une facture globale de toute la période de
   * location avec les détails et les historiques de payement. »
   *
   * 🟥 CE N'EST PAS UNE FACTURE, et cette entrée ne fait qu'ASSEMBLER : aucune
   * écriture, aucune action, aucune transaction. Émettre une seconde facture
   * couvrant des périodes déjà facturées doublerait la créance (Plan 02 §3.3).
   * Générer, télécharger ou imprimer ce document est sans effet financier.
   *
   * AUCUNE PERSISTANCE. Le relevé se reconstruit fidèlement de données
   * historiques immuables — segments, avenants, périodes, factures, règlements.
   * Une table de relevés n'aurait figé que ce que ces tables savent déjà, et
   * aurait créé une seconde vérité qu'une annulation de facture ferait diverger
   * (§17 de la consigne, Plan 02 §16.6).
   *
   * AUCUN NUMÉRO PROPRE. La référence portée en en-tête est celle du CONTRAT :
   * le relevé n'est pas un acte, c'est une représentation à la demande de l'état
   * d'un contrat à sa date d'édition. Une séquence aurait laissé croire à une
   * pièce comptable de plus.
   *
   * AUCUNE CAPACITÉ DOCUMENTAIRE NOUVELLE — Plan 02 §10.3 : « La synthèse est le
   * 4ᵉ document du cycle, sous `rental.rentals.download` / `.print` ». Une
   * capacité de plus ne fermerait rien que celles-ci n'aient déjà fermé
   * (CLAUDE.md §19 bis).
   *
   * 🟥 MAIS ELLE N'OUVRE RIEN NON PLUS. Le relevé AGRÈGE des domaines gouvernés
   * par d'autres capacités ; `buildRentalStatement` éprouve chacune séparément,
   * de sorte qu'il ne soit jamais la porte dérobée par laquelle un exploitant
   * obtiendrait les factures et les règlements que son profil lui refuse.
   */
  releves: {
    entityType: 'rentals',
    moduleCode: 'rental',
    viewPermission: PERMISSIONS.RENTALS_VIEW,
    downloadPermission: PERMISSIONS.RENTALS_DOWNLOAD,
    printPermission: PERMISSIONS.RENTALS_PRINT,

    async build(id) {
      const statement = await buildRentalStatement(id)
      if (!statement) return null

      const identity = await getDocumentIdentity()

      return {
        element: RentalStatementDocument({
          identity,
          statement,
          issuedOn: issuedOnLabel(),
        }),
        reference: statement.rental.rentalNo,
        label: 'Releve-location',
      }
    },
  },

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

      /*
       * LA PÉRIODE FACTURÉE — LOT 23, A-6.
       *
       * Elle relève de `rental.rentals.view`, comme le reste de l'organisation
       * du contrat. Sans cette capacité, la ligne disparaît du document plutôt
       * que d'y figurer vide : une période absente se lirait « facture globale »
       * (DEC-017, DEC-024).
       */
      const billingPeriod =
        invoice.billingPeriodId && invoice.rentalId && (await can(PERMISSIONS.RENTALS_VIEW))
          ? ((await listBillingPeriods(invoice.rentalId)).find(
              (item) => item.id === invoice.billingPeriodId
            ) ?? null)
          : null

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
          billingPeriod: billingPeriod
            ? {
                sequenceNo: billingPeriod.sequenceNo,
                from: billingPeriod.from,
                to: billingPeriod.to,
              }
            : null,
          issuedOn: issuedOnLabel(),
        }),
        reference: invoice.invoiceNo,
        label: 'Facture-client',
      }
    },
  },

  /* ------------------------------------------------------ Commerce client -- */
  //
  // DEUX PIÈCES, DEUX MENUS, QUATRE CAPACITÉS DOCUMENTAIRES.
  //
  // Contrairement aux cinq documents du cycle de location, qui partagent
  // `rental.rentals.download` / `.print`, le devis et la commande relèvent de
  // MENUS DISTINCTS (Plan 02 §10.2). Un collaborateur peut légitimement
  // produire un devis sans produire une commande : ce sont deux gestes
  // commerciaux différents, et A-14 veut qu'ils s'attribuent séparément.
  //
  // 🟥 AUCUN COÛT, AUCUNE MARGE — voir l'en-tête de `commercial-documents.tsx` :
  // la garantie est portée par le TYPE `CommercialLine`, qui ne comporte
  // aucune colonne de coût parce que la table n'en a aucune.
  'devis-clients': {
    entityType: 'sales_quotes',
    moduleCode: 'commerce',
    viewPermission: PERMISSIONS.SALES_QUOTES_VIEW,
    downloadPermission: PERMISSIONS.SALES_QUOTES_DOWNLOAD,
    printPermission: PERMISSIONS.SALES_QUOTES_PRINT,

    async build(id) {
      const quote = await getSalesQuote(id)
      if (!quote) return null

      // Les coordonnées du client relèvent de `parties.clients.view` : sans
      // elle, `clientLabel` revient déjà `null` de la couche de données, et le
      // document le dit plutôt que d'inventer un destinataire.
      const mayReadClient = await can(PERMISSIONS.CLIENTS_VIEW)
      const client = mayReadClient ? await getClientDetail(quote.clientId) : null

      const [lines, identity] = await Promise.all([
        listSalesQuoteLines(id),
        getDocumentIdentity(),
      ])

      return {
        element: SalesQuoteDocument({
          identity,
          quote,
          lines,
          clientAddress: client
            ? [client.address, client.city, client.country].filter(
                (line): line is string => Boolean(line)
              )
            : null,
          issuedOn: issuedOnLabel(),
        }),
        reference: quote.quoteNo,
        label: 'Devis-client',
      }
    },
  },

  'commandes-clients': {
    entityType: 'sales_orders',
    moduleCode: 'commerce',
    viewPermission: PERMISSIONS.SALES_ORDERS_VIEW,
    downloadPermission: PERMISSIONS.SALES_ORDERS_DOWNLOAD,
    printPermission: PERMISSIONS.SALES_ORDERS_PRINT,

    async build(id) {
      const order = await getSalesOrder(id)
      if (!order) return null

      const mayReadClient = await can(PERMISSIONS.CLIENTS_VIEW)
      const client = mayReadClient ? await getClientDetail(order.clientId) : null

      const [lines, identity] = await Promise.all([
        listSalesOrderLines(id),
        getDocumentIdentity(),
      ])

      return {
        element: SalesOrderDocument({
          identity,
          order,
          lines,
          clientAddress: client
            ? [client.address, client.city, client.country].filter(
                (line): line is string => Boolean(line)
              )
            : null,
          issuedOn: issuedOnLabel(),
        }),
        reference: order.orderNo,
        label: 'Commande-client',
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
