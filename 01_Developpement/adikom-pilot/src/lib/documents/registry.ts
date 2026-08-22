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
import { getSupplierBankDetails, getSupplierDetail } from '@/features/suppliers/data'
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
       * Les coordonnées bancaires exigent leur propre permission
       * (Fournisseurs §44). Elles sont en outre filtrées par RLS : sans le
       * droit, la lecture ne renvoie rien. Le contrôle explicite évite
       * simplement d'interroger la base pour rien.
       */
      const mayReadBank = await can(PERMISSIONS.SUPPLIERS_BANK_VIEW)
      const bank = mayReadBank ? await getSupplierBankDetails(id) : null

      const mayReadFleet = await can(PERMISSIONS.FLEET_VIEW)
      const vehicles = mayReadFleet ? await listVehicles({ supplierId: id }) : []

      const identity = await getDocumentIdentity()

      return {
        element: SupplierSheetDocument({
          identity,
          supplier,
          vehicles,
          bank,
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
      const vehicles = mayReadFleet ? await listVehicles({ partnerId: id }) : []

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
