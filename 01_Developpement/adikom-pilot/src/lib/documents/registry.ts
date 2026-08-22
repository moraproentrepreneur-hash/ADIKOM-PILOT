import 'server-only'

import type { ReactElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'

import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'
import { can } from '@/lib/auth/dal'
import { getDocumentIdentity } from './identity'
import { issuedOnLabel } from './render'
import { ClientSheetDocument } from '@/features/clients/documents/client-sheet'
import { getClientDetail } from '@/features/clients/data'
import { listPricingRules } from '@/features/pricing/data'

/**
 * Registre des documents.
 *
 * Un seul point d'entrée décrit, pour chaque type de document : la permission
 * de téléchargement, celle d'impression, et la façon de le construire. Ajouter
 * un document revient à ajouter une entrée — la route, les contrôles d'accès et
 * le rendu ne changent pas.
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
  downloadPermission: PermissionCode
  printPermission: PermissionCode
  /** `null` si l'enregistrement n'existe pas ou n'est pas lisible. */
  build: (id: string) => Promise<BuiltDocument | null>
}

export const DOCUMENTS: Record<string, DocumentDefinition> = {
  clients: {
    entityType: 'clients',
    moduleCode: 'parties',
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
}

export function getDocumentDefinition(type: string): DocumentDefinition | null {
  return Object.hasOwn(DOCUMENTS, type) ? DOCUMENTS[type] : null
}
