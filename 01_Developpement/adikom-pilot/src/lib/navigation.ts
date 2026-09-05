import {
  Banknote,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CarFront,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderKanban,
  Gavel,
  Handshake,
  History,
  LayoutDashboard,
  Layers,
  ListChecks,
  Network,
  ReceiptText,
  Settings,
  ShieldCheck,
  Tags,
  TriangleAlert,
  Truck,
  UserCog,
  Users,
  Users2,
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
  /**
   * Lectures alternatives, pour un écran qui n'a pas de capacité propre.
   *
   * Le calendrier (Module 03 §19) superpose des couches gouvernées chacune par
   * sa permission ; il n'en possède aucune, parce qu'il ne montre rien de plus
   * qu'elles (DEC-036 §d). L'entrée s'affiche donc dès qu'une seule est
   * détenue — et la page n'affiche alors que la couche correspondante.
   *
   * Ce champ ne relâche rien : `filterNavigation` ne fait que du confort de
   * lecture, la page réexige les mêmes capacités.
   */
  alternatives?: readonly PermissionCode[]
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
    status: 'ready',
  },
  /*
   * Le module s'ouvre en deux entrées, et non en une.
   *
   * `Navigation` §6 le décrit comme un enchaînement « Projet → Tâches →
   * Responsables → Échéances → Suivi ». Les tâches ne sont pas une sous-page
   * des projets : elles peuvent être INDÉPENDANTES (Module 03 §10), et leur
   * lecture relève d'une capacité distincte. Une seule entrée aurait laissé
   * croire que l'une ouvre l'autre.
   *
   * Le LOT 13 a complété la section : elle reprend désormais, dans l'ordre, la
   * structure du `Module 03` §4 — Projets, Tâches, Calendrier, Réunions,
   * Rendez-vous, Actions, Décisions. Chaque entrée porte SA lecture ; le
   * calendrier n'en a pas, il en accepte trois (DEC-036 §d).
   */
  {
    label: 'Projets & Planification',
    icon: FolderKanban,
    items: [
      {
        label: 'Projets',
        href: '/projets',
        icon: FolderKanban,
        permission: PERMISSIONS.PROJECTS_VIEW,
        status: 'ready',
      },
      {
        label: 'Tâches',
        href: '/projets/taches',
        icon: ListChecks,
        permission: PERMISSIONS.TASKS_VIEW,
        status: 'ready',
      },
      {
        label: 'Calendrier',
        href: '/projets/calendrier',
        icon: CalendarDays,
        permission: PERMISSIONS.TASKS_VIEW,
        alternatives: [PERMISSIONS.MEETINGS_VIEW, PERMISSIONS.APPOINTMENTS_VIEW],
        status: 'ready',
      },
      {
        label: 'Réunions',
        href: '/projets/reunions',
        icon: Users2,
        permission: PERMISSIONS.MEETINGS_VIEW,
        status: 'ready',
      },
      {
        label: 'Rendez-vous',
        href: '/projets/rendez-vous',
        icon: CalendarClock,
        permission: PERMISSIONS.APPOINTMENTS_VIEW,
        status: 'ready',
      },
      {
        label: 'Actions',
        href: '/projets/actions',
        icon: CheckSquare,
        permission: PERMISSIONS.ACTIONS_VIEW,
        status: 'ready',
      },
      {
        label: 'Décisions',
        href: '/projets/decisions',
        icon: Gavel,
        permission: PERMISSIONS.DECISIONS_VIEW,
        status: 'ready',
      },
    ],
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
        status: 'ready',
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
        status: 'ready',
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
        label: 'Dommages & Incidents',
        href: '/location/incidents',
        icon: TriangleAlert,
        permission: PERMISSIONS.INCIDENTS_VIEW,
        status: 'ready',
      },
      {
        label: 'Maintenance',
        href: '/location/maintenance',
        icon: Wrench,
        permission: PERMISSIONS.MAINTENANCE_VIEW,
        status: 'ready',
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
        status: 'ready',
      },
      {
        label: 'Écritures',
        href: '/tresorerie/ecritures',
        icon: History,
        permission: PERMISSIONS.ENTRIES_VIEW,
        status: 'ready',
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
        status: 'ready',
      },
      {
        label: 'Factures fournisseurs',
        href: '/facturation/fournisseurs',
        icon: FileText,
        permission: PERMISSIONS.SUPPLIER_INVOICES_VIEW,
        status: 'ready',
      },
      {
        label: 'Imputations',
        href: '/facturation/imputations',
        icon: BarChart3,
        permission: PERMISSIONS.IMPUTATIONS_VIEW,
        status: 'ready',
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
        status: 'ready',
      },
      /*
       * La vue hiérarchique porte SA capacité, et elle est autonome.
       *
       * `users.hierarchy.view` n'est pas déduite de `users.users.view` : la
       * migration 008 l'accorde à « Direction » et « Assistant(e) de direction »
       * SANS la lecture des utilisateurs. L'organigramme montre la structure,
       * la liste montre les fiches — deux choses distinctes (DEC-024).
       */
      {
        label: 'Vue hiérarchique',
        href: '/utilisateurs/hierarchie',
        icon: Network,
        permission: PERMISSIONS.HIERARCHY_VIEW,
        status: 'ready',
      },
      /*
       * Le journal porte SA capacité, et elle n'en implique aucune autre.
       *
       * `users.audit.view` ouvre l'ÉVÉNEMENT — qui, quoi, quand, sur quoi, avec
       * quel résultat. Elle n'ouvre pas la donnée métier des autres modules :
       * la situation avant / après reste derrière la lecture de l'objet
       * concerné (DEC-038). Sans cette distinction, une seule capacité aurait
       * rendu lisible tout le SaaS.
       */
      {
        label: 'Journal d’activité',
        href: '/utilisateurs/journal',
        icon: History,
        permission: PERMISSIONS.AUDIT_VIEW,
        status: 'ready',
      },
    ],
  },
  /*
   * Deux lectures ouvrent l'écran, et aucune n'implique l'autre.
   *
   * `settings.company.view` ouvre la fiche Entreprise (§30) ;
   * `settings.numbering.view` ouvre les formats de référence (§15). Un compte
   * chargé de la numérotation n'a aucune raison de lire les coordonnées
   * bancaires d'ADIKOM, et réciproquement (DEC-024).
   *
   * Comme pour le calendrier (DEC-036 §d), l'entrée s'affiche dès qu'une seule
   * est détenue, et la page n'ouvre que l'onglet correspondant.
   */
  {
    label: 'Paramètres',
    href: '/parametres',
    icon: Settings,
    permission: PERMISSIONS.SETTINGS_COMPANY_VIEW,
    alternatives: [PERMISSIONS.SETTINGS_NUMBERING_VIEW],
    status: 'ready',
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
  const allowed = (item: NavItem) =>
    isSuperAdmin ||
    granted.has(item.permission) ||
    (item.alternatives ?? []).some((code) => granted.has(code))

  return entries.reduce<NavEntry[]>((acc, entry) => {
    if (isSection(entry)) {
      const items = entry.items.filter(allowed)
      if (items.length > 0) acc.push({ ...entry, items })
    } else if (allowed(entry)) {
      acc.push(entry)
    }
    return acc
  }, [])
}
