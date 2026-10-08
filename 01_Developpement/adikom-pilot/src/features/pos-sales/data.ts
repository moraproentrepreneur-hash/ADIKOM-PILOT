import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import { todayISO } from '@/lib/dates'
import type { PaymentMethod, TreasuryEntryStatus } from '@/features/treasury/constants'
import {
  ANONYMOUS_CLIENT,
  SALE_PAGE_SIZE,
  UNREADABLE_ACCOUNT,
  UNREADABLE_CLIENT,
  type PosSaleStatus,
  type SellableItem,
} from './constants'

/**
 * Accès aux données des ventes au comptoir — LOT 28 (Module 12 §12 à §22).
 *
 * Toutes les lectures passent par le client porteur de la session : RLS reste
 * la barrière, et ce fichier n'ouvre rien qu'elle fermerait.
 *
 * LES MONTANTS DE LA FICHE SONT CEUX DE LA BASE : `pos_sale_total`,
 * `pos_sale_paid`, `pos_sale_tendered`, `pos_sale_change` (D1). La LISTE, elle,
 * relit les faits stockés — quantité, prix, remises, encaissé — et les somme
 * selon la même règle (DEC-051 §c) : rendre cent ventes en appelant quatre
 * fonctions par vente coûterait quatre cents allers-retours pour un affichage.
 *
 * 🟥 LE COÛT COPIÉ ne se lit qu'avec `catalog.services.cost.view` (DEC-049 §e),
 * et ne figure ni sur le reçu ni dans l'export d'un profil qui ne le lit pas.
 */

export type Option = { id: string; label: string; description?: string }

type RawSale = {
  id: string
  sale_no: string
  session_id: string
  cashier_id: string
  client_id: string | null
  sold_at: string
  sale_date: string
  global_discount: number
  observation: string | null
  status: PosSaleStatus
  cancelled_at: string | null
  cancel_reason: string | null
}

const SALE_SELECT =
  'id, sale_no, session_id, cashier_id, client_id, sold_at, sale_date, global_discount, observation, status, cancelled_at, cancel_reason'

type RawLine = {
  id: string
  pos_sale_id: string
  line_no: number
  service_variant_id: string
  label: string
  quantity: number
  unit_price: number
  line_discount: number
}

type RawPayment = {
  id: string
  pos_sale_id: string
  line_no: number
  method: PaymentMethod
  tendered_amount: number
  applied_amount: number
  account_id: string
  external_ref: string | null
  status: PosSaleStatus
}

export type PosSaleListItem = {
  id: string
  saleNo: string
  soldAt: string
  status: PosSaleStatus
  sessionId: string
  cashierLabel: string
  clientLabel: string
  /** Net à payer — sous-total − remise globale (DEC-051 §c). */
  net: number
  /** Σ encaissé des paiements validés. */
  paid: number
  methods: PaymentMethod[]
  /** D-3 : le mode et le compte de chaque paiement, pour l'export. */
  payments: { method: PaymentMethod; accountLabel: string; tendered: number; applied: number; status: PosSaleStatus }[]
}

export type PosSaleLine = {
  id: string
  lineNo: number
  label: string
  quantity: number
  unitPrice: number
  discount: number
  /** Brut − remise de ligne. */
  net: number
  /** `null` : coût non lisible avec vos droits, ou non copié (Q-13). */
  unitCost: number | null
}

export type PosSalePayment = {
  id: string
  lineNo: number
  method: PaymentMethod
  tendered: number
  applied: number
  change: number
  accountId: string
  accountLabel: string
  externalRef: string | null
  status: PosSaleStatus
}

export type PosSaleEntry = {
  id: string
  paymentId: string
  accountLabel: string
  amount: number
  status: TreasuryEntryStatus
  description: string | null
}

export type PosSaleInvoice = {
  id: string
  invoiceNo: string
  status: string
  invoiceDate: string
}

export type PosSaleDetail = {
  id: string
  saleNo: string
  soldAt: string
  saleDate: string
  status: PosSaleStatus
  observation: string | null
  cancelledAt: string | null
  cancelReason: string | null
  sessionId: string
  sessionNo: string | null
  sessionStatus: 'OPEN' | 'CLOSED' | null
  registerLabel: string | null
  cashierId: string
  cashierLabel: string
  clientId: string | null
  clientLabel: string
  globalDiscount: number
  lines: PosSaleLine[]
  payments: PosSalePayment[]
  /** Calculés EN BASE (D1). */
  subtotal: number
  net: number
  tendered: number
  paid: number
  change: number
  /** `null` sans `treasury.entries.view`. */
  entries: PosSaleEntry[] | null
  /** `null` sans `billing.customer_invoices.view` : on ne dit pas « non facturée » sans le savoir. */
  invoice: PosSaleInvoice | null | undefined
  /** Lisibilité du coût copié. */
  costsReadable: boolean
}

/* -------------------------------------------------------------------------- */
/*  Libellés liés                                                              */
/* -------------------------------------------------------------------------- */

async function loadUserLabels(ids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return labels

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('app_users').select('id, first_name, last_name').in('id', unique)
  if (error) reportQueryFailure('pdv:ventes:caissiers', error, 'Les caissiers n’ont pas pu être chargés.')

  for (const row of (data ?? []) as { id: string; first_name: string; last_name: string }[]) {
    labels.set(row.id, `${row.first_name} ${row.last_name}`.trim())
  }
  return labels
}

type RawClient = { id: string; client_no: string; type: string; legal_name: string; first_name: string | null }

async function loadClientLabels(ids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return labels

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('clients')
    .select('id, client_no, type, legal_name, first_name')
    .in('id', unique)
  if (error) reportQueryFailure('pdv:ventes:clients', error, 'Les clients n’ont pas pu être chargés.')

  for (const row of (data ?? []) as RawClient[]) {
    const name = row.type === 'INDIVIDUAL' && row.first_name ? `${row.first_name} ${row.legal_name}` : row.legal_name
    labels.set(row.id, `${name.trim()} · ${row.client_no}`)
  }
  return labels
}

async function loadAccountLabels(ids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return labels

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('financial_accounts').select('id, label, account_no').in('id', unique)
  if (error) reportQueryFailure('pdv:ventes:comptes', error, 'Les comptes n’ont pas pu être chargés.')

  for (const row of (data ?? []) as { id: string; label: string; account_no: string }[]) {
    labels.set(row.id, `${row.label} (${row.account_no})`)
  }
  return labels
}

function clientLabel(clientId: string | null, labels: Map<string, string>): string {
  if (!clientId) return ANONYMOUS_CLIENT
  return labels.get(clientId) ?? UNREADABLE_CLIENT
}

/* -------------------------------------------------------------------------- */
/*  Historique                                                                 */
/* -------------------------------------------------------------------------- */

export type SaleFilters = {
  /** AAAA-MM-JJ, jour comorien de la vente. */
  day?: string
  sessionId?: string
  status?: string
  method?: string
}

export async function listSales(
  filters: SaleFilters
): Promise<{ sales: PosSaleListItem[]; truncated: boolean }> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('pos_sales')
    .select(SALE_SELECT)
    .order('sold_at', { ascending: false })
    .limit(SALE_PAGE_SIZE + 1)

  if (filters.day && /^\d{4}-\d{2}-\d{2}$/.test(filters.day)) query = query.eq('sale_date', filters.day)
  if (filters.sessionId) query = query.eq('session_id', filters.sessionId)
  if (filters.status === 'VALIDATED' || filters.status === 'CANCELLED') query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) reportQueryFailure('pdv:ventes', error, 'Les ventes n’ont pas pu être chargées.')

  let rows = (data ?? []) as RawSale[]
  const truncated = rows.length > SALE_PAGE_SIZE
  rows = rows.slice(0, SALE_PAGE_SIZE)
  const ids = rows.map((row) => row.id)
  if (ids.length === 0) return { sales: [], truncated: false }

  const [linesRes, paymentsRes] = await Promise.all([
    supabase.from('pos_sale_lines').select('pos_sale_id, quantity, unit_price, line_discount').in('pos_sale_id', ids),
    supabase
      .from('pos_payments')
      .select('pos_sale_id, line_no, method, tendered_amount, applied_amount, account_id, status')
      .in('pos_sale_id', ids)
      .order('line_no'),
  ])
  if (linesRes.error) reportQueryFailure('pdv:ventes:lignes', linesRes.error, 'Les lignes des ventes n’ont pas pu être chargées.')
  if (paymentsRes.error) reportQueryFailure('pdv:ventes:paiements', paymentsRes.error, 'Les paiements n’ont pas pu être chargés.')

  const subtotals = new Map<string, number>()
  for (const line of (linesRes.data ?? []) as Pick<RawLine, 'pos_sale_id' | 'quantity' | 'unit_price' | 'line_discount'>[]) {
    subtotals.set(
      line.pos_sale_id,
      (subtotals.get(line.pos_sale_id) ?? 0) + line.quantity * line.unit_price - line.line_discount
    )
  }

  const rawPayments = (paymentsRes.data ?? []) as Pick<
    RawPayment,
    'pos_sale_id' | 'method' | 'tendered_amount' | 'applied_amount' | 'account_id' | 'status'
  >[]
  const paid = new Map<string, number>()
  const methods = new Map<string, Set<PaymentMethod>>()
  for (const payment of rawPayments) {
    if (!methods.has(payment.pos_sale_id)) methods.set(payment.pos_sale_id, new Set())
    methods.get(payment.pos_sale_id)!.add(payment.method)
    if (payment.status === 'VALIDATED') {
      paid.set(payment.pos_sale_id, (paid.get(payment.pos_sale_id) ?? 0) + payment.applied_amount)
    }
  }

  const [cashiers, clients, accounts] = await Promise.all([
    loadUserLabels(rows.map((row) => row.cashier_id)),
    loadClientLabels(rows.map((row) => row.client_id ?? '')),
    loadAccountLabels(rawPayments.map((payment) => payment.account_id)),
  ])

  let sales = rows.map((row) => ({
    id: row.id,
    saleNo: row.sale_no,
    soldAt: row.sold_at,
    status: row.status,
    sessionId: row.session_id,
    cashierLabel: cashiers.get(row.cashier_id) ?? 'Caissier non lisible avec vos droits',
    clientLabel: clientLabel(row.client_id, clients),
    net: (subtotals.get(row.id) ?? 0) - row.global_discount,
    paid: paid.get(row.id) ?? 0,
    methods: [...(methods.get(row.id) ?? [])],
    payments: rawPayments
      .filter((payment) => payment.pos_sale_id === row.id)
      .map((payment) => ({
        method: payment.method,
        accountLabel: accounts.get(payment.account_id) ?? UNREADABLE_ACCOUNT,
        tendered: payment.tendered_amount,
        applied: payment.applied_amount,
        status: payment.status,
      })),
  }))

  if (filters.method) sales = sales.filter((sale) => sale.methods.includes(filters.method as PaymentMethod))

  return { sales, truncated }
}

/* -------------------------------------------------------------------------- */
/*  Fiche                                                                      */
/* -------------------------------------------------------------------------- */

async function rpcAmount(fn: string, saleId: string): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(fn, { p_sale_id: saleId })
  if (error) reportQueryFailure(`pdv:vente:${fn}`, error, 'Les montants de la vente n’ont pas pu être calculés.')
  return Number(data ?? 0)
}

export async function getSale(
  id: string,
  options: { canSeeEntries: boolean; canSeeInvoices: boolean; canSeeCosts: boolean }
): Promise<PosSaleDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.from('pos_sales').select(SALE_SELECT).eq('id', id).maybeSingle()
  if (error) reportQueryFailure('pdv:vente', error, 'La vente n’a pas pu être chargée.')
  if (!data) return null
  const sale = data as RawSale

  const [linesRes, paymentsRes, sessionRes] = await Promise.all([
    supabase
      .from('pos_sale_lines')
      .select('id, pos_sale_id, line_no, service_variant_id, label, quantity, unit_price, line_discount')
      .eq('pos_sale_id', id)
      .order('line_no'),
    supabase
      .from('pos_payments')
      .select('id, pos_sale_id, line_no, method, tendered_amount, applied_amount, account_id, external_ref, status')
      .eq('pos_sale_id', id)
      .order('line_no'),
    supabase.from('pos_sessions').select('id, session_no, status, register_id').eq('id', sale.session_id).maybeSingle(),
  ])
  if (linesRes.error) reportQueryFailure('pdv:vente:lignes', linesRes.error, 'Les lignes de la vente n’ont pas pu être chargées.')
  if (paymentsRes.error) reportQueryFailure('pdv:vente:paiements', paymentsRes.error, 'Les paiements de la vente n’ont pas pu être chargés.')
  if (sessionRes.error) reportQueryFailure('pdv:vente:session', sessionRes.error, 'La session de la vente n’a pas pu être chargée.')

  const lines = (linesRes.data ?? []) as RawLine[]
  const payments = (paymentsRes.data ?? []) as RawPayment[]
  const session = sessionRes.data as { id: string; session_no: string; status: 'OPEN' | 'CLOSED'; register_id: string } | null

  let registerLabel: string | null = null
  if (session) {
    const { data: register } = await supabase
      .from('pos_registers')
      .select('label, register_no')
      .eq('id', session.register_id)
      .maybeSingle()
    if (register) registerLabel = `${(register as { label: string }).label} (${(register as { register_no: string }).register_no})`
  }

  const costs = new Map<string, number>()
  if (options.canSeeCosts && lines.length > 0) {
    const { data: rows, error: costError } = await supabase
      .from('commercial_line_costs')
      .select('pos_sale_line_id, unit_cost')
      .in('pos_sale_line_id', lines.map((line) => line.id))
    if (costError) reportQueryFailure('pdv:vente:coûts', costError, 'Les coûts copiés n’ont pas pu être chargés.')
    for (const row of (rows ?? []) as { pos_sale_line_id: string; unit_cost: number }[]) {
      costs.set(row.pos_sale_line_id, row.unit_cost)
    }
  }

  let entries: PosSaleEntry[] | null = null
  let entryAccounts: string[] = []
  if (options.canSeeEntries && payments.length > 0) {
    const { data: rows, error: entryError } = await supabase
      .from('treasury_entries')
      .select('id, pos_payment_id, account_id, amount, status, description')
      .in('pos_payment_id', payments.map((payment) => payment.id))
    if (entryError) reportQueryFailure('pdv:vente:écritures', entryError, 'Les écritures de la vente n’ont pas pu être chargées.')
    const raw = (rows ?? []) as {
      id: string
      pos_payment_id: string
      account_id: string
      amount: number
      status: TreasuryEntryStatus
      description: string | null
    }[]
    entryAccounts = raw.map((row) => row.account_id)
    entries = raw.map((row) => ({
      id: row.id,
      paymentId: row.pos_payment_id,
      accountLabel: row.account_id,
      amount: row.amount,
      status: row.status,
      description: row.description,
    }))
  } else if (options.canSeeEntries) {
    entries = []
  }

  let invoice: PosSaleInvoice | null | undefined = undefined
  if (options.canSeeInvoices) {
    const { data: rows, error: invoiceError } = await supabase
      .from('customer_invoices')
      .select('id, invoice_no, status, invoice_date')
      .eq('pos_sale_id', id)
      .neq('status', 'CANCELLED')
      .limit(1)
    if (invoiceError) reportQueryFailure('pdv:vente:facture', invoiceError, 'La facture de la vente n’a pas pu être chargée.')
    const row = (rows ?? [])[0] as { id: string; invoice_no: string; status: string; invoice_date: string } | undefined
    invoice = row ? { id: row.id, invoiceNo: row.invoice_no, status: row.status, invoiceDate: row.invoice_date } : null
  }

  const [accounts, cashiers, clients, subtotal, net, tendered, paid, change] = await Promise.all([
    loadAccountLabels([...payments.map((payment) => payment.account_id), ...entryAccounts]),
    loadUserLabels([sale.cashier_id]),
    loadClientLabels(sale.client_id ? [sale.client_id] : []),
    rpcAmount('pos_sale_subtotal', id),
    rpcAmount('pos_sale_total', id),
    rpcAmount('pos_sale_tendered', id),
    rpcAmount('pos_sale_paid', id),
    rpcAmount('pos_sale_change', id),
  ])

  return {
    id: sale.id,
    saleNo: sale.sale_no,
    soldAt: sale.sold_at,
    saleDate: sale.sale_date,
    status: sale.status,
    observation: sale.observation,
    cancelledAt: sale.cancelled_at,
    cancelReason: sale.cancel_reason,
    sessionId: sale.session_id,
    sessionNo: session?.session_no ?? null,
    sessionStatus: session?.status ?? null,
    registerLabel,
    cashierId: sale.cashier_id,
    cashierLabel: cashiers.get(sale.cashier_id) ?? 'Caissier non lisible avec vos droits',
    clientId: sale.client_id,
    clientLabel: clientLabel(sale.client_id, clients),
    globalDiscount: sale.global_discount,
    lines: lines.map((line) => ({
      id: line.id,
      lineNo: line.line_no,
      label: line.label,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      discount: line.line_discount,
      net: line.quantity * line.unit_price - line.line_discount,
      unitCost: costs.get(line.id) ?? null,
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      lineNo: payment.line_no,
      method: payment.method,
      tendered: payment.tendered_amount,
      applied: payment.applied_amount,
      change: payment.tendered_amount - payment.applied_amount,
      accountId: payment.account_id,
      accountLabel: accounts.get(payment.account_id) ?? UNREADABLE_ACCOUNT,
      externalRef: payment.external_ref,
      status: payment.status,
    })),
    subtotal,
    net,
    tendered,
    paid,
    change,
    entries: entries?.map((entry) => ({
      ...entry,
      accountLabel: accounts.get(entry.accountLabel) ?? UNREADABLE_ACCOUNT,
    })) ?? null,
    invoice,
    costsReadable: options.canSeeCosts,
  }
}

/* -------------------------------------------------------------------------- */
/*  La caisse — ce qui se vend aujourd'hui, et où l'argent entre               */
/* -------------------------------------------------------------------------- */

/**
 * Le catalogue VENDABLE du jour : services `SALE` ou `BOTH`, actifs ; variantes
 * actives ; prix en vigueur aujourd'hui (jour comorien, D16). Une variante sans
 * prix du jour n'est pas proposée — la base la refuserait.
 *
 * Le prix affiché est celui que la base retiendra : elle le résout elle-même à
 * la validation, et refuse toute autre valeur.
 */
export async function listSellableItems(): Promise<SellableItem[]> {
  const supabase = await createSupabaseServerClient()
  const today = todayISO()

  const { data: services, error } = await supabase
    .from('services')
    .select('id, label, unit_label, service_variants(id, label, is_active, display_order)')
    .in('purpose', ['SALE', 'BOTH'])
    .eq('status', 'ACTIVE')
    .order('label')
    .limit(500)
  if (error) reportQueryFailure('pdv:catalogue', error, 'Le catalogue n’a pas pu être chargé.')

  type RawService = {
    id: string
    label: string
    unit_label: string | null
    service_variants: { id: string; label: string; is_active: boolean; display_order: number }[]
  }
  const rows = (services ?? []) as RawService[]
  const variants = rows.flatMap((service) =>
    service.service_variants
      .filter((variant) => variant.is_active)
      .sort((a, b) => a.display_order - b.display_order)
      .map((variant) => ({ service, variant }))
  )
  if (variants.length === 0) return []

  const { data: prices, error: priceError } = await supabase
    .from('service_variant_prices')
    .select('variant_id, amount, valid_from, valid_to')
    .in('variant_id', variants.map(({ variant }) => variant.id))
    .eq('is_active', true)
    .lte('valid_from', today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
  if (priceError) reportQueryFailure('pdv:catalogue:prix', priceError, 'Les prix du jour n’ont pas pu être chargés.')

  const priceOf = new Map<string, number>()
  for (const row of (prices ?? []) as { variant_id: string; amount: number }[]) priceOf.set(row.variant_id, row.amount)

  return variants
    .filter(({ variant }) => priceOf.has(variant.id))
    .map(({ service, variant }) => ({
      variantId: variant.id,
      serviceLabel: service.label,
      variantLabel: variant.label,
      unitLabel: service.unit_label,
      price: priceOf.get(variant.id)!,
    }))
}

/**
 * D-3 — les comptes sur lesquels entre un paiement HORS espèces : comptes
 * bancaires ACTIFS, en KMF (« Mvola ADIKOM », « Banque »…). Les espèces, elles,
 * entrent d'office dans le compte de la caisse : aucun choix n'est proposé.
 */
export async function listCounterAccounts(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('id, label, account_no, institution')
    .eq('kind', 'BANK')
    .eq('status', 'ACTIVE')
    .eq('currency_code', 'KMF')
    .order('label')
  if (error) reportQueryFailure('pdv:comptes', error, 'Les comptes bancaires n’ont pas pu être chargés.')

  return ((data ?? []) as { id: string; label: string; account_no: string; institution: string | null }[]).map(
    (row) => ({
      id: row.id,
      label: `${row.label} · ${row.account_no}`,
      description: row.institution ?? undefined,
    })
  )
}

/** Sessions proposées au filtre de l'historique : les plus récentes, lisibles. */
export async function listRecentSessionOptions(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('pos_sessions')
    .select('id, session_no')
    .order('opened_at', { ascending: false })
    .limit(50)
  if (error) reportQueryFailure('pdv:sessions récentes', error, 'Les sessions n’ont pas pu être chargées.')
  return ((data ?? []) as { id: string; session_no: string }[]).map((row) => ({ id: row.id, label: row.session_no }))
}
