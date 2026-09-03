import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'

/**
 * Actions rapides du tableau de bord — Module 01 §22.
 *
 * « Une action non autorisée ne doit pas être proposée. »
 *
 * DEUX RÈGLES, ET AUCUNE TROISIÈME
 *
 *   1. La capacité doit être détenue.
 *   2. L'écran de destination doit EXISTER.
 *
 * La seconde écarte des gestes pourtant réels : créer une location ne s'amorce
 * pas depuis un menu — une location naît d'une réservation, et son geste vit
 * sur la fiche de celle-ci. Encaisser un règlement ne s'amorce pas non plus
 * d'ici : l'acte appartient à la facture qu'il solde (LOT 8).
 *
 * Proposer ces raccourcis obligerait à inventer un écran d'entrée que le cycle
 * documenté ne prévoit pas. Ils sont donc absents — pas oubliés.
 */

export type QuickAction = {
  code: PermissionCode
  label: string
  href: string
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    code: PERMISSIONS.RESERVATIONS_CREATE,
    label: 'Nouvelle réservation',
    href: '/location/reservations/nouvelle',
  },
  {
    code: PERMISSIONS.CLIENTS_CREATE,
    label: 'Nouveau client',
    href: '/tiers/clients/nouveau',
  },
  {
    code: PERMISSIONS.FLEET_CREATE,
    label: 'Nouveau véhicule',
    href: '/location/parc/nouveau',
  },
  {
    code: PERMISSIONS.INCIDENTS_CREATE,
    label: 'Constater un incident',
    href: '/location/incidents/nouveau',
  },
  {
    code: PERMISSIONS.MAINTENANCE_CREATE,
    label: 'Nouvelle maintenance',
    href: '/location/maintenance/nouvelle',
  },
  {
    code: PERMISSIONS.CUSTOMER_INVOICES_CREATE,
    label: 'Nouvelle facture client',
    href: '/facturation/clients/nouvelle',
  },
  {
    code: PERMISSIONS.SUPPLIER_INVOICES_CREATE,
    label: 'Nouvelle facture fournisseur',
    href: '/facturation/fournisseurs/nouvelle',
  },
]
