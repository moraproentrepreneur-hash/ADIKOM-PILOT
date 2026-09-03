import 'server-only'

import { can } from '@/lib/auth/dal'
import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'
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
 * Les sommes viennent des fonctions de la migration 055, qui appellent
 * elles-mêmes celles des factures. Les listes viennent des modules. Le tableau
 * de bord ne connaît donc aucune arithmétique qui lui soit propre : il
 * assemble, il n'invente pas.
 *
 * TROIS RÉPONSES, JAMAIS DEUX — Module 01 §25, §26, §27
 *
 *   `ok`      la valeur, calculée sur des données réelles ;
 *   `denied`  la capacité manque, et l'écran le DIT ;
 *   `error`   la donnée n'a pas pu être chargée, et l'écran le dit aussi.
 *
 * Un zéro ne dit aucune de ces trois choses. « 0 facture impayée » est une
 * bonne nouvelle ; « je n'ai pas le droit de compter les factures » n'en est
 * pas une (DEC-017). Et §26 l'ajoute : le système « ne doit pas afficher de
 * données inventées pour masquer une erreur de chargement ».
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

export type Figure<T> =
  | { state: 'ok'; value: T }
  | { state: 'denied'; missing: PermissionCode[] }
  | { state: 'error' }

const ok = <T,>(value: T): Figure<T> => ({ state: 'ok', value })
const denied = <T,>(missing: PermissionCode[]): Figure<T> => ({ state: 'denied', missing })

/**
 * Exécute une lecture, ou rend l'échec lisible.
 *
 * Le motif technique reste dans les journaux du serveur : l'utilisateur n'a
 * pas à lire un message de PostgREST (CLAUDE.md §43).
 */
async function attempt<T>(scope: string, read: () => Promise<T>): Promise<Figure<T>> {
  try {
    return ok(await read())
  } catch (error) {
    console.error(`[tableau de bord · ${scope}]`, error)
    return { state: 'error' }
  }
}

/** Les capacités absentes parmi celles exigées — l'écran les nomme. */
async function missingAmong(codes: PermissionCode[]): Promise<PermissionCode[]> {
  const held = await Promise.all(codes.map((code) => can(code)))
  return codes.filter((_, index) => !held[index])
}

/**
 * Un indicateur : d'abord les capacités, ensuite seulement la lecture.
 *
 * Les fonctions de la migration 055 REFUSENT lorsqu'une capacité manque — c'est
 * la garantie serveur, et elle reste seule maîtresse. Vérifier avant d'appeler
 * n'y ajoute aucune sécurité : cela permet seulement de DIRE laquelle manque,
 * au lieu d'afficher une erreur de chargement pour un refus de droit.
 */
async function gated<T>(
  scope: string,
  codes: PermissionCode[],
  read: () => Promise<T>
): Promise<Figure<T>> {
  const missing = await missingAmong(codes)
  if (missing.length > 0) return denied(missing)
  return attempt(scope, read)
}

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

export type Treasury = {
  accounts: FinancialAccount[]
  /** Σ des soldes. Tous sont lisibles, sinon l'indicateur entier est refusé. */
  total: number
}

export type Activity = {
  clients: Figure<number>
  reservations: Figure<number>
  rentals: Figure<number>
  invoices: Figure<number>
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
  treasury: Figure<Treasury>
  activity: Activity
  lateRentals: Figure<RentalListItem[]>
  expiringDocuments: Figure<ExpiringDocument[]>
  maintenanceRunning: Figure<number>
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
/*  Comptages simples — sous RLS, et jamais sans sa capacité                   */
/* -------------------------------------------------------------------------- */

/**
 * Un comptage exact, sans transporter une seule ligne.
 *
 * `head: true` ne renvoie que le nombre. Sous RLS, il vaut 0 pour qui n'a pas
 * le droit de lire la table — raison pour laquelle il n'est jamais appelé sans
 * que la capacité ait été vérifiée par `gated`.
 */
async function countRows(
  table: string,
  build: (
    query: ReturnType<Awaited<ReturnType<typeof createSupabaseServerClient>>['from']>
  ) => PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const { count, error } = await build(supabase.from(table))
  if (error) throw new Error(`${table} : ${error.message}`)
  return count ?? 0
}

/* -------------------------------------------------------------------------- */
/*  Le tableau de bord                                                         */
/* -------------------------------------------------------------------------- */

export async function loadDashboard(period: Period): Promise<Dashboard> {
  const supabase = await createSupabaseServerClient()

  const {
    DASHBOARD_FINANCIAL_VIEW,
    DASHBOARD_FLEET_VIEW,
    RENTALS_VIEW,
    RESERVATIONS_VIEW,
    FLEET_VIEW,
    MAINTENANCE_VIEW,
    CLIENTS_VIEW,
    CUSTOMER_INVOICES_VIEW,
    CUSTOMER_PAYMENTS_VIEW,
    SUPPLIER_INVOICES_VIEW,
    SUPPLIER_PAYMENTS_VIEW,
    IMPUTATIONS_VIEW,
    ACCOUNTS_VIEW,
    BALANCES_VIEW,
    ENTRIES_VIEW,
    VEHICLE_DOCUMENTS_VIEW,
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
    treasury,
    activity,
    lateRentals,
    expiringDocuments,
    maintenanceRunning,
    quickActions,
  ] = await Promise.all([
    gated<Operations>('exploitation', [RENTALS_VIEW], async () => {
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

    gated<Reservations>('réservations', [RESERVATIONS_VIEW], async () => {
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

    gated<FleetOverview>('parc', [DASHBOARD_FLEET_VIEW, FLEET_VIEW], async () => {
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

    gated<number>(
      'facturé',
      [DASHBOARD_FINANCIAL_VIEW, CUSTOMER_INVOICES_VIEW],
      async () => {
        const { data, error } = await supabase.rpc('dashboard_customer_invoiced', {
          p_from: period.from,
          p_to: period.to,
        })
        if (error) throw new Error(error.message)
        return Number(data ?? 0)
      }
    ),

    gated<number>(
      'encaissé',
      [DASHBOARD_FINANCIAL_VIEW, CUSTOMER_PAYMENTS_VIEW],
      async () => {
        const { data, error } = await supabase.rpc('dashboard_customer_collected', {
          p_from: period.from,
          p_to: period.to,
        })
        if (error) throw new Error(error.message)
        return Number(data ?? 0)
      }
    ),

    gated<Outstanding>(
      'créances',
      [DASHBOARD_FINANCIAL_VIEW, CUSTOMER_INVOICES_VIEW, CUSTOMER_PAYMENTS_VIEW],
      async () => {
        const { data, error } = await supabase.rpc('dashboard_customer_receivables')
        if (error) throw new Error(error.message)
        return toOutstanding((data as RawOutstanding[] | null)?.[0])
      }
    ),

    gated<Outstanding>(
      'dettes fournisseurs',
      [
        DASHBOARD_FINANCIAL_VIEW,
        SUPPLIER_INVOICES_VIEW,
        IMPUTATIONS_VIEW,
        SUPPLIER_PAYMENTS_VIEW,
      ],
      async () => {
        const { data, error } = await supabase.rpc('dashboard_supplier_payables')
        if (error) throw new Error(error.message)
        return toOutstanding((data as RawOutstanding[] | null)?.[0])
      }
    ),

    /*
     * Les soldes ne passent pas par une fonction du LOT 9 : ils en ont déjà
     * une, `financial_account_balance`, qui exige `balances.view` ET
     * `entries.view` depuis la migration 050. La reproduire ici créerait une
     * seconde vérité sur le solde d'un compte.
     */
    gated<Treasury>(
      'trésorerie',
      [DASHBOARD_FINANCIAL_VIEW, ACCOUNTS_VIEW, BALANCES_VIEW, ENTRIES_VIEW],
      async () => {
        const accounts = await listFinancialAccounts(
          { status: 'ACTIVE' },
          { canSeeBalances: true }
        )
        return {
          accounts,
          total: accounts.reduce((acc, account) => acc + (account.balance ?? 0), 0),
        }
      }
    ),

    loadActivity(period, {
      clients: CLIENTS_VIEW,
      reservations: RESERVATIONS_VIEW,
      rentals: RENTALS_VIEW,
      invoices: CUSTOMER_INVOICES_VIEW,
    }),

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

    gated<number>('maintenances', [MAINTENANCE_VIEW], () =>
      countRows('maintenances', (query) =>
        query
          .select('id', { count: 'exact', head: true })
          .in('status', ['PLANNED', 'TO_DIAGNOSE', 'IN_PROGRESS', 'ON_HOLD'])
      )
    ),

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
    treasury,
    activity,
    lateRentals,
    expiringDocuments,
    maintenanceRunning,
    quickActions,
  }
}

/* -------------------------------------------------------------------------- */
/*  Activité de la période — Module 01 §6                                      */
/* -------------------------------------------------------------------------- */

/**
 * Ce qui est NÉ pendant la période, à la date de création.
 *
 * C'est bien un flux, et non un stock : « nouveaux clients » compte des
 * créations, pas des clients actifs. Les bornes sont des jours civils ; la
 * borne haute est donc portée au lendemain, exclu, pour englober la journée
 * entière quel que soit le fuseau de l'horodatage.
 */
async function loadActivity(
  period: Period,
  codes: {
    clients: PermissionCode
    reservations: PermissionCode
    rentals: PermissionCode
    invoices: PermissionCode
  }
): Promise<Activity> {
  const from = `${period.from}T00:00:00+03:00`
  const to = `${nextDay(period.to)}T00:00:00+03:00`

  const created = (table: string) => () =>
    countRows(table, (query) =>
      query.select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to)
    )

  const [clients, reservations, rentals, invoices] = await Promise.all([
    gated<number>('nouveaux clients', [codes.clients], created('clients')),
    gated<number>('nouvelles réservations', [codes.reservations], created('reservations')),
    gated<number>('nouvelles locations', [codes.rentals], created('rentals')),
    gated<number>('nouvelles factures', [codes.invoices], created('customer_invoices')),
  ])

  return { clients, reservations, rentals, invoices }
}

/** Le lendemain d'un jour civil `YYYY-MM-DD`, sans arithmétique de fuseau. */
function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10)
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
