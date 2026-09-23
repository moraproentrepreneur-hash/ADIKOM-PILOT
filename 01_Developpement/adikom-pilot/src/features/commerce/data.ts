import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { OrderStatus, QuoteStatus } from './constants'

/**
 * Accès aux données du commerce client — LOT 25, DEC-049.
 *
 * TOUTES les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données. Sans `commerce.sales_quotes.view`, ces
 * fonctions ne renvoient rien — et l'appelant doit alors DIRE qu'il ne sait
 * pas, jamais afficher une liste vide (DEC-017).
 *
 * LES TOTAUX NE SONT PAS STOCKÉS (D1).
 *
 * Ils sont recalculés ici à partir des lignes actives, exactement comme les
 * fonctions SQL `sales_quote_total` et `sales_order_total` le font en base.
 * Les deux implémentations sont éprouvées l'une contre l'autre par la recette :
 * si elles divergeaient, ce serait un défaut, pas une commodité.
 *
 * 🟥 AUCUN COÛT, AUCUNE MARGE.
 *
 * Aucune colonne de coût n'existe sur une ligne commerciale (Plan 02 §9.3) :
 * ces types ne peuvent donc pas en porter, et aucun écran ni aucun document ne
 * peut en révéler. La garantie est portée par le SCHÉMA, non par la vigilance.
 */

export type { QuoteStatus, OrderStatus } from './constants'

/* -------------------------------------------------------------------------- */
/*  Lignes — la forme est commune au devis et à la commande                    */
/* -------------------------------------------------------------------------- */

export type CommercialLine = {
  id: string
  /** `null` pour une ligne libre (A-13). */
  serviceId: string | null
  serviceVariantId: string | null
  /** Désignation FIGÉE à l'ajout. Un service renommé ne la réécrit pas. */
  label: string
  quantity: number
  /** Prix FIGÉ à l'ajout, résolu du catalogue à la date du document. */
  unitPrice: number
  /** Quantité × prix. Recalculé : aucune colonne ne le recopie (D1). */
  lineTotal: number
  isArchived: boolean
  /** Ligne de devis dont celle-ci est née — sur une ligne de commande. */
  sourceQuoteLineId?: string | null
}

type RawLine = {
  id: string
  service_id: string | null
  service_variant_id: string | null
  label: string
  quantity: number
  unit_price: number
  is_archived: boolean
  source_quote_line_id?: string | null
}

function toLine(row: RawLine): CommercialLine {
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceVariantId: row.service_variant_id,
    label: row.label,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    lineTotal: row.quantity * row.unit_price,
    isArchived: row.is_archived,
    sourceQuoteLineId: row.source_quote_line_id ?? null,
  }
}

/* -------------------------------------------------------------------------- */
/*  Le client, tel qu'un document commercial le nomme                          */
/* -------------------------------------------------------------------------- */

type RawClient = {
  client_no: string
  type: string
  legal_name: string
  trade_name: string | null
  first_name: string | null
}

/**
 * Le libellé d'un client, identique à celui de la facturation.
 *
 * ⚠ PostgREST rend un OBJET, non un tableau, quand la clé étrangère est unique.
 * Lu comme un tableau, l'embarqué vaudrait `undefined` et le client
 * disparaîtrait en silence.
 */
function clientLabel(raw: RawClient | null | undefined): string | null {
  if (!raw) return null
  if (raw.type === 'INDIVIDUAL') {
    return [raw.first_name, raw.legal_name].filter(Boolean).join(' ').trim() || raw.legal_name
  }
  return raw.trade_name?.trim() || raw.legal_name
}

/* -------------------------------------------------------------------------- */
/*  Devis                                                                      */
/* -------------------------------------------------------------------------- */

export type SalesQuoteListItem = {
  id: string
  quoteNo: string
  status: QuoteStatus
  quoteDate: string
  validUntil: string | null
  clientId: string
  /** `null` sans `parties.clients.view` — l'écran le dit (DEC-017). */
  clientLabel: string | null
  total: number
  lineCount: number
}

export type SalesQuoteDetail = SalesQuoteListItem & {
  currencyCode: string
  notes: string | null
  terms: string | null
  statusReason: string | null
  sentAt: string | null
  acceptedAt: string | null
  refusedAt: string | null
  convertedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  /** Commande née de ce devis, si elle existe et est lisible. */
  orderId: string | null
  orderNo: string | null
}

const QUOTE_SELECT = `
  id, quote_no, status, quote_date, valid_until, client_id, currency_code,
  notes, terms, status_reason,
  sent_at, accepted_at, refused_at, converted_at, cancelled_at,
  created_at, updated_at,
  clients ( client_no, type, legal_name, trade_name, first_name ),
  sales_quote_lines ( id, service_id, service_variant_id, label, quantity, unit_price, is_archived )
`

type RawQuote = {
  id: string
  quote_no: string
  status: QuoteStatus
  quote_date: string
  valid_until: string | null
  client_id: string
  currency_code: string
  notes: string | null
  terms: string | null
  status_reason: string | null
  sent_at: string | null
  accepted_at: string | null
  refused_at: string | null
  converted_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  clients?: RawClient | null
  sales_quote_lines?: RawLine[]
}

function quoteTotals(rows: RawLine[] | undefined) {
  const active = (rows ?? []).filter((row) => !row.is_archived)
  return {
    total: active.reduce((sum, row) => sum + row.quantity * row.unit_price, 0),
    lineCount: active.length,
  }
}

export type SalesQuoteFilters = {
  search?: string
  status?: QuoteStatus | 'ALL'
  clientId?: string
  from?: string
  to?: string
}

export async function listSalesQuotes(
  filters: SalesQuoteFilters = {}
): Promise<SalesQuoteListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('sales_quotes').select(QUOTE_SELECT)

  if (filters.status && filters.status !== 'ALL') query = query.eq('status', filters.status)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.from) query = query.gte('quote_date', filters.from)
  if (filters.to) query = query.lte('quote_date', filters.to)

  const search = filters.search?.trim()
  if (search) query = query.ilike('quote_no', `%${search}%`)

  const { data, error } = await query
    .order('quote_date', { ascending: false })
    .order('quote_no', { ascending: false })

  if (error) {
    reportQueryFailure('commerce:devis', error, 'Les devis clients n’ont pas pu être chargés.')
  }

  return ((data ?? []) as unknown as RawQuote[]).map((row) => ({
    id: row.id,
    quoteNo: row.quote_no,
    status: row.status,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    clientId: row.client_id,
    clientLabel: clientLabel(row.clients),
    ...quoteTotals(row.sales_quote_lines),
  }))
}

export async function getSalesQuote(id: string): Promise<SalesQuoteDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('sales_quotes')
    .select(QUOTE_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('commerce:devis', error, 'Ce devis n’a pas pu être chargé.')
  }
  if (!data) return null

  const row = data as unknown as RawQuote

  /*
   * La commande née du devis relève de `commerce.sales_orders.view`. Sans cette
   * capacité, RLS ne rend aucune ligne et le lien reste `null` : l'écran dit
   * alors qu'il ne sait pas, plutôt que d'affirmer qu'aucune commande n'existe
   * (DEC-017, DEC-024).
   */
  const { data: order } = await supabase
    .from('sales_orders')
    .select('id, order_no')
    .eq('sales_quote_id', id)
    .neq('status', 'CANCELLED')
    .maybeSingle()

  return {
    id: row.id,
    quoteNo: row.quote_no,
    status: row.status,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    clientId: row.client_id,
    clientLabel: clientLabel(row.clients),
    currencyCode: row.currency_code,
    notes: row.notes,
    terms: row.terms,
    statusReason: row.status_reason,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    refusedAt: row.refused_at,
    convertedAt: row.converted_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orderId: order?.id ?? null,
    orderNo: order?.order_no ?? null,
    ...quoteTotals(row.sales_quote_lines),
  }
}

export async function listSalesQuoteLines(quoteId: string): Promise<CommercialLine[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('sales_quote_lines')
    .select('id, service_id, service_variant_id, label, quantity, unit_price, is_archived')
    .eq('sales_quote_id', quoteId)
    .order('created_at', { ascending: true })

  if (error) {
    reportQueryFailure(
      'commerce:lignes de devis',
      error,
      'Les lignes de ce devis n’ont pas pu être chargées.'
    )
  }

  return ((data ?? []) as unknown as RawLine[]).map(toLine)
}

/* -------------------------------------------------------------------------- */
/*  Commandes                                                                  */
/* -------------------------------------------------------------------------- */

export type SalesOrderListItem = {
  id: string
  orderNo: string
  status: OrderStatus
  orderDate: string
  expectedDate: string | null
  clientId: string
  clientLabel: string | null
  /** `null` sans `commerce.sales_quotes.view`, ou sans devis d'origine. */
  quoteId: string | null
  quoteNo: string | null
  total: number
  lineCount: number
}

export type SalesOrderDetail = SalesOrderListItem & {
  currencyCode: string
  notes: string | null
  terms: string | null
  statusReason: string | null
  confirmedAt: string | null
  deliveredAt: string | null
  invoicedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

const ORDER_SELECT = `
  id, order_no, status, order_date, expected_date, client_id, sales_quote_id,
  currency_code, notes, terms, status_reason,
  confirmed_at, delivered_at, invoiced_at, cancelled_at,
  created_at, updated_at,
  clients ( client_no, type, legal_name, trade_name, first_name ),
  sales_quotes ( quote_no ),
  sales_order_lines ( id, service_id, service_variant_id, label, quantity, unit_price, is_archived, source_quote_line_id )
`

type RawOrder = {
  id: string
  order_no: string
  status: OrderStatus
  order_date: string
  expected_date: string | null
  client_id: string
  sales_quote_id: string | null
  currency_code: string
  notes: string | null
  terms: string | null
  status_reason: string | null
  confirmed_at: string | null
  delivered_at: string | null
  invoiced_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  clients?: RawClient | null
  sales_quotes?: { quote_no: string } | null
  sales_order_lines?: RawLine[]
}

export type SalesOrderFilters = {
  search?: string
  status?: OrderStatus | 'ALL'
  clientId?: string
  from?: string
  to?: string
}

export async function listSalesOrders(
  filters: SalesOrderFilters = {}
): Promise<SalesOrderListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('sales_orders').select(ORDER_SELECT)

  if (filters.status && filters.status !== 'ALL') query = query.eq('status', filters.status)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.from) query = query.gte('order_date', filters.from)
  if (filters.to) query = query.lte('order_date', filters.to)

  const search = filters.search?.trim()
  if (search) query = query.ilike('order_no', `%${search}%`)

  const { data, error } = await query
    .order('order_date', { ascending: false })
    .order('order_no', { ascending: false })

  if (error) {
    reportQueryFailure(
      'commerce:commandes',
      error,
      'Les commandes clients n’ont pas pu être chargées.'
    )
  }

  return ((data ?? []) as unknown as RawOrder[]).map((row) => {
    const active = (row.sales_order_lines ?? []).filter((line) => !line.is_archived)
    return {
      id: row.id,
      orderNo: row.order_no,
      status: row.status,
      orderDate: row.order_date,
      expectedDate: row.expected_date,
      clientId: row.client_id,
      clientLabel: clientLabel(row.clients),
      quoteId: row.sales_quote_id,
      quoteNo: row.sales_quotes?.quote_no ?? null,
      total: active.reduce((sum, line) => sum + line.quantity * line.unit_price, 0),
      lineCount: active.length,
    }
  })
}

export async function getSalesOrder(id: string): Promise<SalesOrderDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('sales_orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('commerce:commandes', error, 'Cette commande n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawOrder
  const active = (row.sales_order_lines ?? []).filter((line) => !line.is_archived)

  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    orderDate: row.order_date,
    expectedDate: row.expected_date,
    clientId: row.client_id,
    clientLabel: clientLabel(row.clients),
    quoteId: row.sales_quote_id,
    quoteNo: row.sales_quotes?.quote_no ?? null,
    currencyCode: row.currency_code,
    notes: row.notes,
    terms: row.terms,
    statusReason: row.status_reason,
    confirmedAt: row.confirmed_at,
    deliveredAt: row.delivered_at,
    invoicedAt: row.invoiced_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    total: active.reduce((sum, line) => sum + line.quantity * line.unit_price, 0),
    lineCount: active.length,
  }
}

export async function listSalesOrderLines(orderId: string): Promise<CommercialLine[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('sales_order_lines')
    .select(
      'id, service_id, service_variant_id, label, quantity, unit_price, is_archived, source_quote_line_id'
    )
    .eq('sales_order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) {
    reportQueryFailure(
      'commerce:lignes de commande',
      error,
      'Les lignes de cette commande n’ont pas pu être chargées.'
    )
  }

  return ((data ?? []) as unknown as RawLine[]).map(toLine)
}

/* -------------------------------------------------------------------------- */
/*  Factures issues d'une commande                                             */
/* -------------------------------------------------------------------------- */

export type OrderInvoice = {
  id: string
  invoiceNo: string
  status: string
  invoiceDate: string
}

/**
 * Les factures nées d'une commande.
 *
 * Un TABLEAU, bien qu'une seule facture non annulée soit possible : les
 * factures ANNULÉES restent lisibles, et l'historique d'une commande
 * refacturée en porte plusieurs. Le montrer évite qu'une annulation paraisse
 * avoir effacé quelque chose.
 *
 * Exige `billing.customer_invoices.view` : sans elle, RLS ne rend rien et
 * l'appelant doit dire qu'il ne sait pas, jamais « aucune facture » (DEC-017).
 */
export async function listOrderInvoices(orderId: string): Promise<OrderInvoice[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('customer_invoices')
    .select('id, invoice_no, status, invoice_date')
    .eq('sales_order_id', orderId)
    .order('invoice_date', { ascending: false })

  if (error) {
    reportQueryFailure(
      'commerce:factures de commande',
      error,
      'Les factures de cette commande n’ont pas pu être chargées.'
    )
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    invoiceNo: row.invoice_no as string,
    status: row.status as string,
    invoiceDate: row.invoice_date as string,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Ce que propose l'éditeur de lignes                                         */
/* -------------------------------------------------------------------------- */

export type SellableVariant = {
  variantId: string
  serviceId: string
  serviceLabel: string
  variantLabel: string
  unitLabel: string | null
  /** Prix en vigueur À LA DATE DU DOCUMENT. `null` si aucun ne l'est. */
  price: number | null
}

/**
 * Les variantes vendables, avec leur prix applicable à une date.
 *
 * 🟥 LE PRIX N'EST PAS CALCULÉ ICI. Il est résolu EN BASE par
 * `resolve_service_price`, unique implémentation de D16(c) : un écran ne peut
 * donc pas appliquer une règle différente d'un autre, il n'a pas les moyens de
 * la reformuler. Cette fonction ne fait qu'AFFICHER ce que la base répondra.
 *
 * Une variante sans prix en vigueur est renvoyée avec `price: null` plutôt
 * qu'omise : l'écran dit alors pourquoi elle ne peut pas être ajoutée, au lieu
 * de la faire disparaître sans explication (DEC-017).
 */
export async function listSellableVariants(on: string): Promise<SellableVariant[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('service_variants')
    .select('id, label, service_id, is_active, services!inner ( label, status, purpose, unit_label )')
    .eq('is_active', true)
    .eq('services.status', 'ACTIVE')
    .in('services.purpose', ['SALE', 'BOTH'])
    .order('label', { ascending: true })

  if (error) {
    reportQueryFailure(
      'commerce:variantes vendables',
      error,
      'Le catalogue de services n’a pas pu être chargé.'
    )
    return []
  }

  type Raw = {
    id: string
    label: string
    service_id: string
    services: { label: string; unit_label: string | null } | null
  }

  const rows = (data ?? []) as unknown as Raw[]

  // Le résolveur est interrogé variante par variante : c'est lui qui connaît la
  // règle de version, et il n'y en a qu'un.
  const prices = await Promise.all(
    rows.map(async (row) => {
      const { data: resolved } = await supabase
        .rpc('resolve_service_price', { p_variant_id: row.id, p_on: on })
        .maybeSingle()
      return (resolved as { amount?: number } | null)?.amount ?? null
    })
  )

  return rows.map((row, index) => ({
    variantId: row.id,
    serviceId: row.service_id,
    serviceLabel: row.services?.label ?? 'Service',
    variantLabel: row.label,
    unitLabel: row.services?.unit_label ?? null,
    price: prices[index],
  }))
}
