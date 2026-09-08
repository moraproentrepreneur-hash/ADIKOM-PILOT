import 'server-only'

import { can } from '@/lib/auth/dal'
import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'
import {
  attempt as attemptIn,
  denied,
  gated as gatedIn,
  type Figure,
} from '@/lib/pilotage/figure'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { listRentals, type RentalListItem } from '@/features/rentals/data'
import { listFinancialAccounts, type FinancialAccount } from '@/features/treasury/data'
import { listExpiringVehicleDocuments, type ExpiringDocument } from '@/features/fleet/data'
import type { VehicleStatus } from '@/features/fleet/constants'
import { QUICK_ACTIONS } from './quick-actions'
import type { Period } from './period'

/**
 * Tableau de bord — la lecture, et rien d'autre.
 *
 * AUCUNE RÈGLE MÉTIER N'EST RÉÉCRITE ICI.
 *
 * Les sommes viennent des fonctions des migrations 055 et 076, qui appellent
 * elles-mêmes celles des factures. Les listes viennent des modules. Le tableau
 * de bord ne connaît donc aucune arithmétique qui lui soit propre : il
 * assemble, il n'invente pas.
 *
 * UN CHIFFRE AGRÉGÉ N'EST PAS UN ACCÈS AU MODULE — DEC-042 §a
 *
 * C'est le changement du 08/09/2026, et c'est une décision métier.
 *
 * Jusqu'ici, chaque indicateur exigeait la capacité du module qu'il résume :
 * sans `rental.rentals.view`, la carte « Retours en retard » affichait « Non
 * accessible » au lieu d'un nombre. ADIKOM a tranché : le tableau de bord est
 * une vue de pilotage GÉNÉRAL. Un collaborateur qui n'ouvre pas le module
 * Locations peut avoir besoin de savoir qu'il existe trois retours en retard,
 * pour en informer la personne qui en répond.
 *
 * La distinction qui rend cela sûr tient en une ligne :
 *
 *   VOIR UN NOMBRE AGRÉGÉ    ≠    ACCÉDER AUX DONNÉES DU MODULE
 *
 * Les fonctions de la migration 076 ne rendent que des NOMBRES, et exigent
 * `dashboard.view` — plus `dashboard.fleet.view` ou `dashboard.financial.view`
 * selon la section. Elles ne rendent jamais une ligne, un nom, une
 * immatriculation.
 *
 * CE QUI RESTE GOUVERNÉ PAR LA CAPACITÉ DU MODULE
 *
 * Tout ce qui NOMME : la liste des retards (client, véhicule, référence), les
 * échéances de documents (véhicule, pièce), la liste des comptes financiers
 * (libellé, banque, solde individuel). Ces trois-là passent toujours par la
 * capacité de leur module, sous RLS, et l'écran continue de dire ce qu'il ne
 * peut pas montrer.
 *
 * TROIS RÉPONSES, JAMAIS DEUX — Module 01 §25, §26, §27
 *
 *   `ok`      la valeur, calculée sur des données réelles ;
 *   `denied`  la capacité manque, et l'écran le DIT ;
 *   `error`   la donnée n'a pas pu être chargée, et l'écran le dit aussi.
 *
 * Un zéro ne dit aucune de ces trois choses (DEC-017). Le refus reste donc
 * possible — il ne frappe simplement plus un utilisateur au seul motif qu'il
 * n'ouvre pas le module d'origine.
 *
 * POURQUOI CHAQUE INDICATEUR EST ISOLÉ
 *
 * Une section en échec ne doit pas emporter la page : le tableau de bord est
 * l'écran d'atterrissage après connexion. Les erreurs sont donc capturées
 * indicateur par indicateur, journalisées côté serveur, et rendues sous forme
 * d'état — jamais propagées (§26).
 */

/* -------------------------------------------------------------------------- */
/*  L'état d'un indicateur                                                     */
/* -------------------------------------------------------------------------- */

/*
 * `Figure` et ses deux outils vivent dans `@/lib/pilotage/figure` : les
 * statistiques et les rapports de facturation posent la même question — un
 * chiffre, un refus nommé, ou un échec dit — et la recopier en aurait fait deux
 * vérités (CLAUDE.md §37).
 */
export type { Figure }

/** Les lectures du tableau de bord se journalisent sous son propre nom. */
const attempt = <T,>(scope: string, read: () => Promise<T>) =>
  attemptIn(`tableau de bord · ${scope}`, read)

/**
 * Un indicateur : d'abord les capacités, ensuite seulement la lecture.
 *
 * Les fonctions du pilotage REFUSENT lorsqu'une capacité manque — c'est la
 * garantie serveur, et elle reste seule maîtresse. Vérifier avant d'appeler n'y
 * ajoute aucune sécurité : cela permet seulement de DIRE laquelle manque, au
 * lieu d'afficher une erreur de chargement pour un refus de droit.
 */
const gated = <T,>(scope: string, codes: PermissionCode[], read: () => Promise<T>) =>
  gatedIn(`tableau de bord · ${scope}`, codes, read)

/* -------------------------------------------------------------------------- */
/*  Ce que le tableau de bord rend                                             */
/* -------------------------------------------------------------------------- */

export type Operations = {
  running: number
  startingToday: number
  returningToday: number
  late: number
  toControl: number
  toInvoice: number
}

export type Reservations = {
  upcoming: number
  startingToday: number
}

/** Les sept statuts du parc, tous présents — un statut sans véhicule vaut 0. */
export type FleetOverview = Record<VehicleStatus, number>

/** Créance ou dette : ce qui reste, et la part dont l'échéance est passée. */
export type Outstanding = {
  invoiceCount: number
  amount: number
  overdueCount: number
  overdueAmount: number
}

export type Activity = {
  clients: number
  reservations: number
  rentals: number
  invoices: number
}

export type Dashboard = {
  period: Period
  operations: Figure<Operations>
  reservations: Figure<Reservations>
  fleet: Figure<FleetOverview>
  invoiced: Figure<number>
  collected: Figure<number>
  receivables: Figure<Outstanding>
  payables: Figure<Outstanding>
  /** Σ des soldes des comptes actifs — un total, jamais une liste. */
  treasuryTotal: Figure<number>
  /**
   * Le DÉTAIL par compte : libellé, nature, solde individuel.
   *
   * Une liste nomme. Elle reste donc gouvernée par les capacités de Banques &
   * Caisses, contrairement au total qui les résume (DEC-042 §a).
   */
  treasuryAccounts: Figure<FinancialAccount[]>
  activity: Figure<Activity>
  lateRentals: Figure<RentalListItem[]>
  expiringDocuments: Figure<ExpiringDocument[]>
  maintenanceRunning: Figure<number>
  /** Notifications non lues du Centre — Module 02 §33. */
  unreadNotifications: Figure<number>
  /** Ce que l'utilisateur a le droit d'entreprendre depuis ici (§22). */
  quickActions: PermissionCode[]
}

/** Fenêtre des réservations « à venir » — la même que le Tableau de location. */
const UPCOMING_DAYS = 7

/** Un document se signale un mois avant son échéance (§14). */
export const DOCUMENT_HORIZON_DAYS = 30

/** Ce que l'alerte montre ; le compte, lui, reste exact. */
const ALERT_ROWS = 5

const EMPTY_FLEET: FleetOverview = {
  AVAILABLE: 0,
  RESERVED: 0,
  RENTED: 0,
  MAINTENANCE: 0,
  IMMOBILIZED: 0,
  UNAVAILABLE: 0,
  RETIRED: 0,
}

/* -------------------------------------------------------------------------- */
/*  Le tableau de bord                                                         */
/* -------------------------------------------------------------------------- */

export async function loadDashboard(period: Period): Promise<Dashboard> {
  const supabase = await createSupabaseServerClient()

  const {
    DASHBOARD_VIEW,
    DASHBOARD_FINANCIAL_VIEW,
    DASHBOARD_FLEET_VIEW,
    RENTALS_VIEW,
    FLEET_VIEW,
    ACCOUNTS_VIEW,
    BALANCES_VIEW,
    ENTRIES_VIEW,
    VEHICLE_DOCUMENTS_VIEW,
    NOTIFICATIONS_VIEW,
  } = PERMISSIONS

  /*
   * Toutes les lectures partent ensemble. Le tableau de bord est l'écran
   * d'atterrissage : les enchaîner ajouterait leurs latences les unes aux
   * autres, sur chaque connexion (§30).
   */
  const [
    operations,
    reservations,
    fleet,
    invoiced,
    collected,
    receivables,
    payables,
    treasuryTotal,
    treasuryAccounts,
    activity,
    lateRentals,
    expiringDocuments,
    maintenanceRunning,
    unreadNotifications,
    quickActions,
  ] = await Promise.all([
    gated<Operations>('exploitation', [DASHBOARD_VIEW], async () => {
      const { data, error } = await supabase.rpc('dashboard_operations')
      if (error) throw new Error(error.message)
      const row = (data as RawOperations[] | null)?.[0]
      return {
        running: row?.running ?? 0,
        startingToday: row?.starting_today ?? 0,
        returningToday: row?.returning_today ?? 0,
        late: row?.late ?? 0,
        toControl: row?.to_control ?? 0,
        toInvoice: row?.to_invoice ?? 0,
      }
    }),

    gated<Reservations>('réservations', [DASHBOARD_VIEW], async () => {
      const { data, error } = await supabase.rpc('dashboard_reservations', {
        p_days: UPCOMING_DAYS,
      })
      if (error) throw new Error(error.message)
      const row = (data as RawReservations[] | null)?.[0]
      return {
        upcoming: row?.upcoming ?? 0,
        startingToday: row?.starting_today ?? 0,
      }
    }),

    gated<FleetOverview>('parc', [DASHBOARD_FLEET_VIEW], async () => {
      const { data, error } = await supabase.rpc('dashboard_fleet')
      if (error) throw new Error(error.message)
      const overview = { ...EMPTY_FLEET }
      for (const row of (data as RawFleet[] | null) ?? []) {
        if (row.status in overview) {
          overview[row.status as VehicleStatus] = row.vehicle_count
        }
      }
      return overview
    }),

    gated<number>('facturé', [DASHBOARD_FINANCIAL_VIEW], async () => {
      const { data, error } = await supabase.rpc('dashboard_customer_invoiced', {
        p_from: period.from,
        p_to: period.to,
      })
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    }),

    gated<number>('encaissé', [DASHBOARD_FINANCIAL_VIEW], async () => {
      const { data, error } = await supabase.rpc('dashboard_customer_collected', {
        p_from: period.from,
        p_to: period.to,
      })
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    }),

    gated<Outstanding>('créances', [DASHBOARD_FINANCIAL_VIEW], async () => {
      const { data, error } = await supabase.rpc('dashboard_customer_receivables')
      if (error) throw new Error(error.message)
      return toOutstanding((data as RawOutstanding[] | null)?.[0])
    }),

    gated<Outstanding>('dettes fournisseurs', [DASHBOARD_FINANCIAL_VIEW], async () => {
      const { data, error } = await supabase.rpc('dashboard_supplier_payables')
      if (error) throw new Error(error.message)
      return toOutstanding((data as RawOutstanding[] | null)?.[0])
    }),

    /*
     * Le TOTAL des soldes — un nombre, sous la capacité du pilotage.
     *
     * `dashboard_treasury_total` et `financial_account_balance` partagent la
     * même arithmétique (`account_balance_formula`, migration 076) : le total
     * du tableau de bord et le solde d'une fiche ne peuvent pas diverger.
     */
    gated<number>('trésorerie', [DASHBOARD_FINANCIAL_VIEW], async () => {
      const { data, error } = await supabase.rpc('dashboard_treasury_total')
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    }),

    /*
     * Le DÉTAIL par compte reste sous les trois capacités de Banques & Caisses :
     * `financial_account_balance` les exige depuis la migration 050, et l'écran
     * ne peut pas être moins exigeant que la base sans mentir sur le motif.
     */
    gated<FinancialAccount[]>(
      'comptes financiers',
      [ACCOUNTS_VIEW, BALANCES_VIEW, ENTRIES_VIEW],
      () => listFinancialAccounts({ status: 'ACTIVE' }, { canSeeBalances: true })
    ),

    gated<Activity>('activité', [DASHBOARD_VIEW], async () => {
      const { data, error } = await supabase.rpc('dashboard_activity', {
        p_from: period.from,
        p_to: period.to,
      })
      if (error) throw new Error(error.message)
      const row = (data as RawActivity[] | null)?.[0]
      return {
        clients: row?.clients ?? 0,
        reservations: row?.reservations ?? 0,
        rentals: row?.rentals ?? 0,
        invoices: row?.invoices ?? 0,
      }
    }),

    /*
     * La liste NOMINATIVE des retards — client, véhicule, référence de contrat.
     * Elle nomme : elle reste sous `rental.rentals.view`, sous RLS. Le NOMBRE de
     * retards, lui, figure dans `operations.late` et s'affiche toujours.
     */
    gated<RentalListItem[]>('retards', [RENTALS_VIEW], async () => {
      const rows = await listRentals({ status: 'LATE' })
      return rows
        .sort(
          (a, b) =>
            new Date(a.expectedReturnAt).getTime() - new Date(b.expectedReturnAt).getTime()
        )
        .slice(0, ALERT_ROWS)
    }),

    /*
     * Un document se lit sous sa propre capacité OU sous celle du parc : c'est
     * la policy posée en migration 023, et l'écran ne peut pas être plus
     * restrictif que la base sans mentir sur le motif.
     */
    (async (): Promise<Figure<ExpiringDocument[]>> => {
      const [byDocument, byFleet] = await Promise.all([
        can(VEHICLE_DOCUMENTS_VIEW),
        can(FLEET_VIEW),
      ])
      if (!byDocument && !byFleet) return denied([VEHICLE_DOCUMENTS_VIEW])
      return attempt('échéances de documents', () =>
        listExpiringVehicleDocuments(DOCUMENT_HORIZON_DAYS)
      )
    })(),

    gated<number>('maintenances', [DASHBOARD_VIEW], async () => {
      const { data, error } = await supabase.rpc('dashboard_maintenance_open')
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    }),

    /*
     * Le compteur du Centre de notifications — Module 02 §33.
     *
     * Il garde SA capacité, et c'est le seul indicateur du tableau de bord dans
     * ce cas. Une notification n'est pas une donnée d'entreprise : c'est le
     * courrier PERSONNEL de l'utilisateur, calculé sur ses propres droits. Un
     * compte qui ne peut pas ouvrir le Centre n'a aucune notification à
     * compter — le chiffre n'existerait pour personne (DEC-042 §a).
     */
    gated<number>('notifications', [NOTIFICATIONS_VIEW], async () => {
      const { data, error } = await supabase.rpc('notifications_summary')
      if (error) throw new Error(error.message)
      const row = (data as { unread: number | string }[] | null)?.[0]
      return Number(row?.unread ?? 0)
    }),

    loadQuickActions(),
  ])

  return {
    period,
    operations,
    reservations,
    fleet,
    invoiced,
    collected,
    receivables,
    payables,
    treasuryTotal,
    treasuryAccounts,
    activity,
    lateRentals,
    expiringDocuments,
    maintenanceRunning,
    unreadNotifications,
    quickActions,
  }
}

/* -------------------------------------------------------------------------- */
/*  Actions rapides — Module 01 §22                                            */
/* -------------------------------------------------------------------------- */

/**
 * « Une action non autorisée ne doit pas être proposée » (§22).
 *
 * Ce n'est pas une protection : chaque écran de destination vérifie de nouveau
 * la capacité, et chaque acte la vérifie côté serveur. C'est une politesse —
 * ne pas proposer une porte fermée.
 */
async function loadQuickActions(): Promise<PermissionCode[]> {
  const held = await Promise.all(QUICK_ACTIONS.map((action) => can(action.code)))
  return QUICK_ACTIONS.filter((_, index) => held[index]).map((action) => action.code)
}

/* -------------------------------------------------------------------------- */
/*  Formes brutes renvoyées par les fonctions SQL                              */
/* -------------------------------------------------------------------------- */

type RawOperations = {
  running: number
  starting_today: number
  returning_today: number
  late: number
  to_control: number
  to_invoice: number
}

type RawReservations = {
  upcoming: number
  starting_today: number
}

type RawFleet = {
  status: string
  vehicle_count: number
}

type RawActivity = {
  clients: number
  reservations: number
  rentals: number
  invoices: number
}

type RawOutstanding = {
  invoice_count: number
  amount: number | string
  overdue_count: number
  overdue_amount: number | string
}

/** `bigint` transite en texte selon le pilote : il est ramené à un entier. */
function toOutstanding(row: RawOutstanding | undefined): Outstanding {
  return {
    invoiceCount: row?.invoice_count ?? 0,
    amount: Number(row?.amount ?? 0),
    overdueCount: row?.overdue_count ?? 0,
    overdueAmount: Number(row?.overdue_amount ?? 0),
  }
}
