import {
  Banknote,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CarFront,
  ClipboardList,
  FileText,
  FolderKanban,
  Handshake,
  History,
  KeyRound,
  LayoutDashboard,
  Layers,
  ReceiptText,
  Settings,
  ShieldCheck,
  Tags,
  Truck,
  UserCog,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'

/**
 * Navigation de référence.
 *
 * Reproduit la structure documentée
 * (02_Architecture_Fonctionnelle/02_Navigation.md §3).
 *
 * Chaque entrée porte la permission qui conditionne son affichage. Le filtrage
 * visuel est un confort de lecture : la protection réelle reste assurée par la
 * couche d'accès aux données et par RLS (§19 — « la sécurité ne doit jamais
 * dépendre uniquement du masquage visuel »).
 *
 * `status` distingue ce qui est livré de ce qui reste à construire, afin de ne
 * jamais présenter comme disponible une fonctionnalité qui ne l'est pas.
 */

export type NavStatus = 'ready' | 'planned'

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  permission: PermissionCode
  status: NavStatus
}

export type NavSection = {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

export type NavEntry = NavItem | NavSection

export function isSection(entry: NavEntry): entry is NavSection {
  return 'items' in entry
}

export const NAVIGATION: NavEntry[] = [
  {
    label: 'Tableau de bord',
    href: '/tableau-de-bord',
    icon: LayoutDashboard,
    permission: PERMISSIONS.DASHBOARD_VIEW,
    status: 'ready',
  },
  {
    label: 'Notifications',
    href: '/notifications',
    icon: Bell,
    permission: PERMISSIONS.NOTIFICATIONS_VIEW,
    status: 'planned',
  },
  {
    label: 'Projets & Planification',
    href: '/projets',
    icon: FolderKanban,
    permission: PERMISSIONS.PROJECTS_VIEW,
    status: 'planned',
  },
  {
    label: 'Tiers',
    icon: Building2,
    items: [
      {
        label: 'Clients',
        href: '/tiers/clients',
        icon: Users,
        permission: PERMISSIONS.CLIENTS_VIEW,
        status: 'ready',
      },
      {
        label: 'Fournisseurs',
        href: '/tiers/fournisseurs',
        icon: Truck,
        permission: PERMISSIONS.SUPPLIERS_VIEW,
        status: 'ready',
      },
      /*
       * Libellé « Partenaires », et non « Partenariats » comme le prévoit
       * 02_Architecture_Fonctionnelle/02_Navigation.md §3.
       *
       * Ce qui est livré est le RÉPERTOIRE des partenaires — consultation,
       * véhicules rattachés, fiche, export. La gestion du PARTENARIAT lui-même
       * (conditions, contrats, projets communs) reste à construire. Annoncer
       * « Partenariats » promettrait ce que l'écran ne fait pas ; le menu
       * reprendra ce nom lorsqu'il le fera.
       */
      {
        label: 'Partenaires',
        href: '/tiers/partenaires',
        icon: Handshake,
        permission: PERMISSIONS.PARTNERS_VIEW,
        status: 'ready',
      },
    ],
  },
  {
    label: 'Gestion de location',
    icon: CarFront,
    items: [
      {
        label: 'Tableau de location',
        href: '/location',
        icon: ClipboardList,
        permission: PERMISSIONS.RENTAL_BOARD_VIEW,
        status: 'planned',
      },
      {
        label: 'Réservations',
        href: '/location/reservations',
        icon: CalendarCheck,
        permission: PERMISSIONS.RESERVATIONS_VIEW,
        status: 'ready',
      },
      {
        label: 'Locations',
        href: '/location/locations',
        icon: CarFront,
        permission: PERMISSIONS.RENTALS_VIEW,
        status: 'planned',
      },
      {
        label: 'Parc automobile',
        href: '/location/parc',
        icon: Layers,
        permission: PERMISSIONS.FLEET_VIEW,
        status: 'ready',
      },
      {
        label: 'Tarification',
        href: '/location/tarification',
        icon: Tags,
        permission: PERMISSIONS.PRICING_VIEW,
        status: 'ready',
      },
      {
        label: 'Maintenance',
        href: '/location/maintenance',
        icon: Wrench,
        permission: PERMISSIONS.MAINTENANCE_VIEW,
        status: 'planned',
      },
    ],
  },
  {
    label: 'Banques & Caisses',
    icon: Wallet,
    items: [
      {
        label: 'Comptes',
        href: '/tresorerie/comptes',
        icon: Wallet,
        permission: PERMISSIONS.ACCOUNTS_VIEW,
        status: 'planned',
      },
      {
        label: 'Écritures',
        href: '/tresorerie/ecritures',
        icon: History,
        permission: PERMISSIONS.ENTRIES_VIEW,
        status: 'planned',
      },
      {
        label: 'Virement interne',
        href: '/tresorerie/virements',
        icon: Banknote,
        permission: PERMISSIONS.TRANSFERS_CREATE,
        status: 'planned',
      },
    ],
  },
  {
    label: 'Facturation & Paiement',
    icon: ReceiptText,
    items: [
      {
        label: 'Factures clients',
        href: '/facturation/clients',
        icon: FileText,
        permission: PERMISSIONS.CUSTOMER_INVOICES_VIEW,
        status: 'planned',
      },
      {
        label: 'Factures fournisseurs',
        href: '/facturation/fournisseurs',
        icon: FileText,
        permission: PERMISSIONS.SUPPLIER_INVOICES_VIEW,
        status: 'planned',
      },
      {
        label: 'Imputations',
        href: '/facturation/imputations',
        icon: BarChart3,
        permission: PERMISSIONS.IMPUTATIONS_VIEW,
        status: 'planned',
      },
      {
        label: 'Paiements divers',
        href: '/facturation/paiements-divers',
        icon: Banknote,
        permission: PERMISSIONS.MISC_PAYMENTS_VIEW,
        status: 'planned',
      },
    ],
  },
  {
    label: 'Utilisateurs & Groupes',
    icon: UserCog,
    items: [
      {
        label: 'Utilisateurs',
        href: '/utilisateurs',
        icon: Users,
        permission: PERMISSIONS.USERS_VIEW,
        status: 'ready',
      },
      {
        label: 'Groupes',
        href: '/utilisateurs/groupes',
        icon: ShieldCheck,
        permission: PERMISSIONS.GROUPS_VIEW,
        status: 'planned',
      },
      {
        label: 'Vue hiérarchique',
        href: '/utilisateurs/hierarchie',
        icon: KeyRound,
        permission: PERMISSIONS.HIERARCHY_VIEW,
        status: 'planned',
      },
      {
        label: 'Journal d’activité',
        href: '/utilisateurs/journal',
        icon: History,
        permission: PERMISSIONS.AUDIT_VIEW,
        status: 'planned',
      },
    ],
  },
  {
    label: 'Paramètres',
    href: '/parametres',
    icon: Settings,
    permission: PERMISSIONS.SETTINGS_COMPANY_VIEW,
    status: 'planned',
  },
]

/**
 * Restreint la navigation aux entrées autorisées.
 * Une section dont tous les éléments sont refusés disparaît entièrement.
 */
export function filterNavigation(
  entries: readonly NavEntry[],
  granted: ReadonlySet<string>,
  isSuperAdmin: boolean
): NavEntry[] {
  const allowed = (permission: PermissionCode) => isSuperAdmin || granted.has(permission)

  return entries.reduce<NavEntry[]>((acc, entry) => {
    if (isSection(entry)) {
      const items = entry.items.filter((item) => allowed(item.permission))
      if (items.length > 0) acc.push({ ...entry, items })
    } else if (allowed(entry.permission)) {
      acc.push(entry)
    }
    return acc
  }, [])
}
