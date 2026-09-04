import 'server-only'

import type { TabItem } from '@/components/ui/tabs'
import { can } from '@/lib/auth/dal'
import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'
import { gated as gatedIn, type Figure } from '@/lib/pilotage/figure'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { clientLabel, type RawClient } from '@/features/customer-invoices/data'
import { supplierLabel } from '@/features/supplier-invoices/data'
import { periodQuery, type AnalyticsPeriod } from './period'

/**
 * Statistiques et rapports de facturation — la lecture, et rien d'autre.
 *
 * AUCUNE ARITHMÉTIQUE N'EST ÉCRITE ICI.
 *
 * Tous les chiffres viennent des fonctions de la migration 057, qui appellent
 * elles-mêmes celles des factures — `customer_invoice_total`,
 * `customer_invoice_paid`, `supplier_invoice_gross`,
 * `supplier_invoice_imputed`, `supplier_invoice_paid`. Un total recalculé ici
 * serait une seconde vérité sur le même montant, et rien ne garantirait qu'elle
 * dise la même chose que la fiche.
 *
 * ET AUCUNE SOMME N'EST FAITE SUR UNE LISTE PAGINÉE.
 *
 * Les listes de l'application s'arrêtent à 200 lignes : parfait pour un écran,
 * faux pour un total (DEC-032 §b). Les statistiques se calculent donc là où il
 * n'y a pas de page — dans la base, sur l'ensemble des lignes VISIBLES par
 * l'appelant.
 *
 * TROIS RÉPONSES, JAMAIS DEUX
 *
 * `Figure` porte la valeur, le refus nommé ou l'échec de chargement
 * (`@/lib/pilotage/figure`). Les fonctions SQL refusent d'elles-mêmes lorsqu'une
 * capacité manque : la vérification faite ici ne protège rien, elle permet de
 * DIRE laquelle manque.
 */

const gated = <T,>(scope: string, codes: PermissionCode[], read: () => Promise<T>) =>
  gatedIn(`facturation · ${scope}`, codes, read)

/* -------------------------------------------------------------------------- */
/*  Les capacités exigées, réunies une fois                                    */
/* -------------------------------------------------------------------------- */

const {
  CUSTOMER_STATS_VIEW,
  CUSTOMER_REPORTS_VIEW,
  CUSTOMER_INVOICES_VIEW,
  CUSTOMER_PAYMENTS_VIEW,
  SUPPLIER_STATS_VIEW,
  SUPPLIER_REPORTS_VIEW,
  SUPPLIER_INVOICES_VIEW,
  SUPPLIER_PAYMENTS_VIEW,
  IMPUTATIONS_VIEW,
} = PERMISSIONS

/**
 * Une synthèse client suppose de lire les factures ET les règlements.
 *
 * Sans les seconds, l'encaissé vaudrait zéro et le solde le total : toute
 * facture se lirait impayée. Ce n'est pas une omission, c'est une erreur — la
 * fonction SQL refuse, et l'écran nomme ce qui manque (DEC-032 §d).
 */
export const CUSTOMER_STATS_CODES: PermissionCode[] = [
  CUSTOMER_STATS_VIEW,
  CUSTOMER_INVOICES_VIEW,
  CUSTOMER_PAYMENTS_VIEW,
]

export const CUSTOMER_REPORT_CODES: PermissionCode[] = [
  CUSTOMER_REPORTS_VIEW,
  CUSTOMER_INVOICES_VIEW,
  CUSTOMER_PAYMENTS_VIEW,
]

/**
 * Une synthèse fournisseur suppose les trois lectures de la chaîne.
 *
 * Brut − imputé = net à payer ; net − payé = reste dû (CLAUDE.md §16). Une
 * imputation n'est pas un paiement (§57) — et elle ne doit pas non plus pouvoir
 * être ignorée : sans `billing.imputations.view`, l'écran réclamerait
 * 1 000 000 KMF là où ADIKOM en doit 700 000.
 */
export const SUPPLIER_STATS_CODES: PermissionCode[] = [
  SUPPLIER_STATS_VIEW,
  SUPPLIER_INVOICES_VIEW,
  IMPUTATIONS_VIEW,
  SUPPLIER_PAYMENTS_VIEW,
]

export const SUPPLIER_REPORT_CODES: PermissionCode[] = [
  SUPPLIER_REPORTS_VIEW,
  SUPPLIER_INVOICES_VIEW,
  IMPUTATIONS_VIEW,
  SUPPLIER_PAYMENTS_VIEW,
]

/* -------------------------------------------------------------------------- */
/*  Les trois sous-menus d'un côté de la facturation                           */
/* -------------------------------------------------------------------------- */

export type BillingSide = 'clients' | 'fournisseurs'

/**
 * Liste · Statistiques · Rapports — Navigation §10.1 et §10.2.
 *
 * Ces trois entrées sont les SOUS-MENUS documentés de « Factures clients » et
 * « Factures fournisseurs ». La barre latérale s'arrête au menu : ses troisièmes
 * niveaux deviennent des pages, comme « Nouvelle facture » ou les catégories du
 * parc (DEC-021 §6). Ils se rejoignent donc par des onglets.
 *
 * UN ONGLET QUE L'UTILISATEUR NE PEUT PAS OUVRIR N'EST PAS AFFICHÉ.
 *
 * Ce n'est pas une protection — chaque page exige de nouveau sa capacité — mais
 * une politesse : ne pas proposer une porte qui se refermerait aussitôt
 * (Module 01 §22, appliqué ici).
 */
export async function loadBillingTabs(
  side: BillingSide,
  period: AnalyticsPeriod
): Promise<TabItem[]> {
  const codes =
    side === 'clients'
      ? {
          list: CUSTOMER_INVOICES_VIEW,
          stats: CUSTOMER_STATS_VIEW,
          reports: CUSTOMER_REPORTS_VIEW,
        }
      : {
          list: SUPPLIER_INVOICES_VIEW,
          stats: SUPPLIER_STATS_VIEW,
          reports: SUPPLIER_REPORTS_VIEW,
        }

  const [list, stats, reports] = await Promise.all([
    can(codes.list),
    can(codes.stats),
    can(codes.reports),
  ])

  // La période suit l'utilisateur d'un onglet à l'autre : changer d'écran ne
  // doit pas lui faire perdre la fenêtre qu'il vient de choisir (CLAUDE.md §56).
  const query = new URLSearchParams(periodQuery(period)).toString()
  const base = `/facturation/${side}`

  const items: TabItem[] = []
  if (list) items.push({ key: 'liste', label: 'Liste', href: base })
  if (stats) {
    items.push({ key: 'statistiques', label: 'Statistiques', href: `${base}/statistiques?${query}` })
  }
  if (reports) {
    items.push({ key: 'rapports', label: 'Rapports', href: `${base}/rapports?${query}` })
  }
  return items
}

/* -------------------------------------------------------------------------- */
/*  Ce que les écrans reçoivent                                                */
/* -------------------------------------------------------------------------- */

/** Module 07 §26 — flux de la période, puis situation des créances. */
export type CustomerStats = {
  issuedCount: number
  invoicedAmount: number
  collectedCount: number
  collectedAmount: number
  settledCount: number
  unsettledCount: number
  periodOverdueCount: number
  outstandingCount: number
  outstandingAmount: number
  outstandingOverdueCount: number
  outstandingOverdueAmount: number
}

export type CustomerPoint = {
  bucket: string
  invoiced: number
  collected: number
}

export type CustomerReportRow = {
  clientId: string
  /** `null` sans `parties.clients.view` : le montant reste juste, pas le nom. */
  label: string | null
  invoiceCount: number
  invoiced: number
  collected: number
  outstanding: number
  overdue: number
}

/** Module 07 §58 — trois flux datés de leur acte, puis la dette. */
export type SupplierStats = {
  invoiceCount: number
  grossAmount: number
  imputationCount: number
  imputedAmount: number
  paymentCount: number
  paidAmount: number
  payableCount: number
  payableAmount: number
  payableOverdueCount: number
  payableOverdueAmount: number
}

export type SupplierPoint = {
  bucket: string
  gross: number
  imputed: number
  paid: number
}

export type SupplierReportRow = {
  supplierId: string
  label: string | null
  invoiceCount: number
  gross: number
  imputed: number
  paid: number
  payable: number
  overdue: number
}

/* -------------------------------------------------------------------------- */
/*  Statistiques clients — Module 07 §26                                       */
/* -------------------------------------------------------------------------- */

export async function loadCustomerStatistics(period: AnalyticsPeriod): Promise<{
  stats: Figure<CustomerStats>
  series: Figure<CustomerPoint[]>
}> {
  const supabase = await createSupabaseServerClient()
  const bounds = { p_from: period.from, p_to: period.to }

  // Les deux lectures partent ensemble : elles ne dépendent pas l'une de
  // l'autre, et les enchaîner ajouterait leurs latences.
  const [stats, series] = await Promise.all([
    gated<CustomerStats>('statistiques clients', CUSTOMER_STATS_CODES, async () => {
      const { data, error } = await supabase.rpc('billing_customer_stats', bounds)
      if (error) throw new Error(error.message)
      const row = (data as RawCustomerStats[] | null)?.[0]
      return {
        issuedCount: count(row?.issued_count),
        invoicedAmount: amount(row?.invoiced_amount),
        collectedCount: count(row?.collected_count),
        collectedAmount: amount(row?.collected_amount),
        settledCount: count(row?.settled_count),
        unsettledCount: count(row?.unsettled_count),
        periodOverdueCount: count(row?.period_overdue_count),
        outstandingCount: count(row?.outstanding_count),
        outstandingAmount: amount(row?.outstanding_amount),
        outstandingOverdueCount: count(row?.outstanding_overdue_count),
        outstandingOverdueAmount: amount(row?.outstanding_overdue_amount),
      }
    }),

    gated<CustomerPoint[]>('série clients', CUSTOMER_STATS_CODES, async () => {
      const { data, error } = await supabase.rpc('billing_customer_series', {
        ...bounds,
        p_grain: period.grain,
      })
      if (error) throw new Error(error.message)
      return ((data as RawCustomerPoint[] | null) ?? []).map((row) => ({
        bucket: row.bucket,
        invoiced: amount(row.invoiced_amount),
        collected: amount(row.collected_amount),
      }))
    }),
  ])

  return { stats, series }
}

/* -------------------------------------------------------------------------- */
/*  Rapport clients — Module 07 §27                                            */
/* -------------------------------------------------------------------------- */

export async function loadCustomerReport(
  period: AnalyticsPeriod
): Promise<Figure<CustomerReportRow[]>> {
  const supabase = await createSupabaseServerClient()

  return gated<CustomerReportRow[]>('rapport clients', CUSTOMER_REPORT_CODES, async () => {
    const { data, error } = await supabase.rpc('billing_customer_report', {
      p_from: period.from,
      p_to: period.to,
    })
    if (error) throw new Error(error.message)

    /*
     * Le nom se compose ICI, avec la fonction de la facture client : un
     * particulier porte son prénom, une société son nom commercial. La base
     * rend les parties, jamais un libellé — deux compositions finiraient par
     * diverger.
     */
    return ((data as RawCustomerReportRow[] | null) ?? []).map((row) => ({
      clientId: row.client_id,
      label: clientLabel(toRawClient(row)),
      invoiceCount: count(row.invoice_count),
      invoiced: amount(row.invoiced_amount),
      collected: amount(row.collected_amount),
      outstanding: amount(row.outstanding_amount),
      overdue: amount(row.overdue_amount),
    }))
  })
}

/* -------------------------------------------------------------------------- */
/*  Statistiques fournisseurs — Module 07 §58, §59                             */
/* -------------------------------------------------------------------------- */

export async function loadSupplierStatistics(period: AnalyticsPeriod): Promise<{
  stats: Figure<SupplierStats>
  series: Figure<SupplierPoint[]>
}> {
  const supabase = await createSupabaseServerClient()
  const bounds = { p_from: period.from, p_to: period.to }

  const [stats, series] = await Promise.all([
    gated<SupplierStats>('statistiques fournisseurs', SUPPLIER_STATS_CODES, async () => {
      const { data, error } = await supabase.rpc('billing_supplier_stats', bounds)
      if (error) throw new Error(error.message)
      const row = (data as RawSupplierStats[] | null)?.[0]
      return {
        invoiceCount: count(row?.invoice_count),
        grossAmount: amount(row?.gross_amount),
        imputationCount: count(row?.imputation_count),
        imputedAmount: amount(row?.imputed_amount),
        paymentCount: count(row?.payment_count),
        paidAmount: amount(row?.paid_amount),
        payableCount: count(row?.payable_count),
        payableAmount: amount(row?.payable_amount),
        payableOverdueCount: count(row?.payable_overdue_count),
        payableOverdueAmount: amount(row?.payable_overdue_amount),
      }
    }),

    gated<SupplierPoint[]>('série fournisseurs', SUPPLIER_STATS_CODES, async () => {
      const { data, error } = await supabase.rpc('billing_supplier_series', {
        ...bounds,
        p_grain: period.grain,
      })
      if (error) throw new Error(error.message)
      return ((data as RawSupplierPoint[] | null) ?? []).map((row) => ({
        bucket: row.bucket,
        gross: amount(row.gross_amount),
        imputed: amount(row.imputed_amount),
        paid: amount(row.paid_amount),
      }))
    }),
  ])

  return { stats, series }
}

/* -------------------------------------------------------------------------- */
/*  Rapport fournisseurs — Module 07 §60                                       */
/* -------------------------------------------------------------------------- */

export async function loadSupplierReport(
  period: AnalyticsPeriod
): Promise<Figure<SupplierReportRow[]>> {
  const supabase = await createSupabaseServerClient()

  return gated<SupplierReportRow[]>('rapport fournisseurs', SUPPLIER_REPORT_CODES, async () => {
    const { data, error } = await supabase.rpc('billing_supplier_report', {
      p_from: period.from,
      p_to: period.to,
    })
    if (error) throw new Error(error.message)

    return ((data as RawSupplierReportRow[] | null) ?? []).map((row) => ({
      supplierId: row.supplier_id,
      label: row.supplier_no
        ? supplierLabel({
            supplier_no: row.supplier_no,
            legal_name: row.legal_name ?? '',
            trade_name: row.trade_name,
          })
        : null,
      invoiceCount: count(row.invoice_count),
      gross: amount(row.gross_amount),
      imputed: amount(row.imputed_amount),
      paid: amount(row.paid_amount),
      payable: amount(row.payable_amount),
      overdue: amount(row.overdue_amount),
    }))
  })
}

/* -------------------------------------------------------------------------- */
/*  Formes brutes renvoyées par les fonctions SQL                              */
/* -------------------------------------------------------------------------- */

/**
 * `bigint` transite en texte selon le pilote : il est ramené à un entier.
 *
 * Les montants sont en KMF, entiers (DEC-010). `Number` ne perd rien avant
 * 2^53 : aucune facture ne s'en approche.
 */
const amount = (value: number | string | null | undefined): number => Number(value ?? 0)
const count = (value: number | null | undefined): number => Number(value ?? 0)

type RawCustomerStats = {
  issued_count: number
  invoiced_amount: number | string
  collected_count: number
  collected_amount: number | string
  settled_count: number
  unsettled_count: number
  period_overdue_count: number
  outstanding_count: number
  outstanding_amount: number | string
  outstanding_overdue_count: number
  outstanding_overdue_amount: number | string
}

type RawCustomerPoint = {
  bucket: string
  invoiced_amount: number | string
  collected_amount: number | string
}

type RawCustomerReportRow = {
  client_id: string
  client_no: string | null
  client_type: string | null
  legal_name: string | null
  trade_name: string | null
  first_name: string | null
  invoice_count: number
  invoiced_amount: number | string
  collected_amount: number | string
  outstanding_amount: number | string
  overdue_amount: number | string
}

/** Le client n'est lisible que sous `parties.clients.view` : sinon, rien. */
function toRawClient(row: RawCustomerReportRow): RawClient | null {
  if (!row.client_no || !row.client_type || !row.legal_name) return null
  return {
    client_no: row.client_no,
    type: row.client_type,
    legal_name: row.legal_name,
    trade_name: row.trade_name,
    first_name: row.first_name,
  }
}

type RawSupplierStats = {
  invoice_count: number
  gross_amount: number | string
  imputation_count: number
  imputed_amount: number | string
  payment_count: number
  paid_amount: number | string
  payable_count: number
  payable_amount: number | string
  payable_overdue_count: number
  payable_overdue_amount: number | string
}

type RawSupplierPoint = {
  bucket: string
  gross_amount: number | string
  imputed_amount: number | string
  paid_amount: number | string
}

type RawSupplierReportRow = {
  supplier_id: string
  supplier_no: string | null
  legal_name: string | null
  trade_name: string | null
  invoice_count: number
  gross_amount: number | string
  imputed_amount: number | string
  paid_amount: number | string
  payable_amount: number | string
  overdue_amount: number | string
}
