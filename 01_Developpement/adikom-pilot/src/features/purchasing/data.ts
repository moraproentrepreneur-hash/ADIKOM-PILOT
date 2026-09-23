import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import { purchaseDocumentTotal } from './constants'
import type { PurchaseOrderStatus, PurchaseQuoteStatus } from './constants'

/**
 * Accès aux données du commerce FOURNISSEUR — LOT 26.
 *
 * TOUTES les requêtes passent par le client porteur de la session : RLS reste la
 * barrière au niveau des données. Sans `commerce.purchase_quotes.view`, ces
 * fonctions ne renvoient rien — et l'appelant doit alors DIRE qu'il ne sait pas,
 * jamais afficher une liste vide (DEC-017).
 *
 * 🟥 CE QUE CES TYPES PORTENT, ET CE QU'ILS NE PORTERONT JAMAIS
 *
 * `unitPrice` est LE PRIX PROPOSÉ PAR LE FOURNISSEUR sur cet acte. Ce n'est pas
 * le coût de référence du catalogue, qui vit dans sa propre table, gardée par
 * `catalog.services.cost.view`, et que P-5 laisse sans dimension fournisseur.
 *
 * Les deux ne se rencontrent qu'à UN seul endroit du SaaS — l'éditeur de lignes,
 * où le coût de référence est affiché À TITRE INDICATIF, et uniquement à qui
 * détient `catalog.services.cost.view` (voir `listPurchasableVariants`). Il
 * n'entre dans aucun document, dans aucun export, dans aucune ligne enregistrée.
 *
 * LES TOTAUX NE SONT PAS STOCKÉS (D1). Ils sont recalculés ici à partir des
 * lignes actives, exactement comme `purchase_quote_total` et
 * `purchase_order_total` le font en base. Les deux implémentations sont
 * éprouvées l'une contre l'autre par la recette.
 */

export type { PurchaseQuoteStatus, PurchaseOrderStatus } from './constants'

/* -------------------------------------------------------------------------- */
/*  Lignes — la forme est commune au devis et à la commande                    */
/* -------------------------------------------------------------------------- */

export type PurchaseLine = {
  id: string
  /** `null` pour une ligne libre (A-13). */
  serviceId: string | null
  serviceVariantId: string | null
  /** Désignation FIGÉE à l'ajout. Un service renommé ne la réécrit pas. */
  label: string
  quantity: number
  /** 🟥 Le prix PROPOSÉ PAR LE FOURNISSEUR, figé à l'ajout. */
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

function toLine(row: RawLine): PurchaseLine {
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
/*  Le fournisseur, tel qu'un acte d'achat le nomme                            */
/* -------------------------------------------------------------------------- */

type RawSupplier = {
  supplier_no: string
  legal_name: string
  trade_name: string | null
}

/**
 * Le libellé d'un fournisseur, identique à celui de la facturation.
 *
 * ⚠ PostgREST rend un OBJET, non un tableau, quand la clé étrangère est unique.
 * Lu comme un tableau, l'embarqué vaudrait `undefined` et le fournisseur
 * disparaîtrait en silence.
 */
function supplierLabel(raw: RawSupplier | null | undefined): string | null {
  if (!raw) return null
  return raw.trade_name?.trim() || raw.legal_name
}

/** Total et nombre de lignes actives d'un document d'achat. */
function totals(rows: RawLine[] | undefined) {
  const lines = (rows ?? []).map(toLine)
  return {
    total: purchaseDocumentTotal(lines),
    lineCount: lines.filter((line) => !line.isArchived).length,
  }
}

/* -------------------------------------------------------------------------- */
/*  Devis fournisseurs                                                         */
/* -------------------------------------------------------------------------- */

export type PurchaseQuoteListItem = {
  id: string
  quoteNo: string
  /** La référence du fournisseur sur SON document. Distincte de `quoteNo`. */
  externalRef: string | null
  status: PurchaseQuoteStatus
  quoteDate: string
  validUntil: string | null
  supplierId: string
  /** `null` sans `parties.suppliers.view` — l'écran le dit (DEC-017). */
  supplierLabel: string | null
  total: number
  lineCount: number
}

export type PurchaseQuoteDetail = PurchaseQuoteListItem & {
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
  id, quote_no, external_ref, status, quote_date, valid_until, supplier_id, currency_code,
  notes, terms, status_reason,
  sent_at, accepted_at, refused_at, converted_at, cancelled_at,
  created_at, updated_at,
  suppliers ( supplier_no, legal_name, trade_name ),
  purchase_quote_lines ( id, service_id, service_variant_id, label, quantity, unit_price, is_archived )
`

type RawQuote = {
  id: string
  quote_no: string
  external_ref: string | null
  status: PurchaseQuoteStatus
  quote_date: string
  valid_until: string | null
  supplier_id: string
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
  suppliers?: RawSupplier | null
  purchase_quote_lines?: RawLine[]
}

export type PurchaseQuoteFilters = {
  search?: string
  status?: PurchaseQuoteStatus | 'ALL'
  supplierId?: string
  from?: string
  to?: string
}

export async function listPurchaseQuotes(
  filters: PurchaseQuoteFilters = {}
): Promise<PurchaseQuoteListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('purchase_quotes').select(QUOTE_SELECT)

  if (filters.status && filters.status !== 'ALL') query = query.eq('status', filters.status)
  if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId)
  if (filters.from) query = query.gte('quote_date', filters.from)
  if (filters.to) query = query.lte('quote_date', filters.to)

  /*
   * La recherche porte sur les DEUX références : celle d'ADIKOM et celle du
   * fournisseur. Chercher « DEV-F-2026-000012 » et chercher « PRO-4471 » sont
   * deux gestes légitimes, et l'un des deux est souvent le seul dont on dispose
   * quand le fournisseur rappelle.
   */
  const search = filters.search?.trim()
  if (search) {
    const pattern = `%${search.replace(/[%,()]/g, '')}%`
    query = query.or(`quote_no.ilike.${pattern},external_ref.ilike.${pattern}`)
  }

  const { data, error } = await query
    .order('quote_date', { ascending: false })
    .order('quote_no', { ascending: false })

  if (error) {
    reportQueryFailure(
      'achats:devis',
      error,
      'Les devis fournisseurs n’ont pas pu être chargés.'
    )
  }

  return ((data ?? []) as unknown as RawQuote[]).map((row) => ({
    id: row.id,
    quoteNo: row.quote_no,
    externalRef: row.external_ref,
    status: row.status,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    supplierId: row.supplier_id,
    supplierLabel: supplierLabel(row.suppliers),
    ...totals(row.purchase_quote_lines),
  }))
}

export async function getPurchaseQuote(id: string): Promise<PurchaseQuoteDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('purchase_quotes')
    .select(QUOTE_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('achats:devis', error, 'Ce devis fournisseur n’a pas pu être chargé.')
  }
  if (!data) return null

  const row = data as unknown as RawQuote

  /*
   * La commande née du devis relève de `commerce.purchase_orders.view`. Sans
   * cette capacité, RLS ne rend aucune ligne et le lien reste `null` : l'écran
   * dit alors qu'il ne sait pas, plutôt que d'affirmer qu'aucune commande
   * n'existe (DEC-017, DEC-024).
   */
  const { data: order } = await supabase
    .from('purchase_orders')
    .select('id, order_no')
    .eq('purchase_quote_id', id)
    .neq('status', 'CANCELLED')
    .maybeSingle()

  return {
    id: row.id,
    quoteNo: row.quote_no,
    externalRef: row.external_ref,
    status: row.status,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    supplierId: row.supplier_id,
    supplierLabel: supplierLabel(row.suppliers),
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
    ...totals(row.purchase_quote_lines),
  }
}

export async function listPurchaseQuoteLines(quoteId: string): Promise<PurchaseLine[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('purchase_quote_lines')
    .select('id, service_id, service_variant_id, label, quantity, unit_price, is_archived')
    .eq('purchase_quote_id', quoteId)
    .order('created_at', { ascending: true })

  if (error) {
    reportQueryFailure(
      'achats:lignes de devis',
      error,
      'Les lignes de ce devis fournisseur n’ont pas pu être chargées.'
    )
  }

  return ((data ?? []) as unknown as RawLine[]).map(toLine)
}

/* -------------------------------------------------------------------------- */
/*  Commandes fournisseurs                                                     */
/* -------------------------------------------------------------------------- */

export type PurchaseOrderListItem = {
  id: string
  orderNo: string
  status: PurchaseOrderStatus
  orderDate: string
  expectedDate: string | null
  supplierId: string
  supplierLabel: string | null
  /** `null` sans `commerce.purchase_quotes.view`, ou sans devis d'origine. */
  quoteId: string | null
  quoteNo: string | null
  total: number
  lineCount: number
}

export type PurchaseOrderDetail = PurchaseOrderListItem & {
  currencyCode: string
  notes: string | null
  terms: string | null
  statusReason: string | null
  /** La référence du fournisseur sur SON offre, reprise du devis d'origine. */
  quoteExternalRef: string | null
  confirmedAt: string | null
  deliveredAt: string | null
  invoicedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

const ORDER_SELECT = `
  id, order_no, status, order_date, expected_date, supplier_id, purchase_quote_id,
  currency_code, notes, terms, status_reason,
  confirmed_at, delivered_at, invoiced_at, cancelled_at,
  created_at, updated_at,
  suppliers ( supplier_no, legal_name, trade_name ),
  purchase_quotes ( quote_no, external_ref ),
  purchase_order_lines ( id, service_id, service_variant_id, label, quantity, unit_price, is_archived, source_quote_line_id )
`

type RawOrder = {
  id: string
  order_no: string
  status: PurchaseOrderStatus
  order_date: string
  expected_date: string | null
  supplier_id: string
  purchase_quote_id: string | null
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
  suppliers?: RawSupplier | null
  purchase_quotes?: { quote_no: string; external_ref: string | null } | null
  purchase_order_lines?: RawLine[]
}

export type PurchaseOrderFilters = {
  search?: string
  status?: PurchaseOrderStatus | 'ALL'
  supplierId?: string
  from?: string
  to?: string
}

export async function listPurchaseOrders(
  filters: PurchaseOrderFilters = {}
): Promise<PurchaseOrderListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('purchase_orders').select(ORDER_SELECT)

  if (filters.status && filters.status !== 'ALL') query = query.eq('status', filters.status)
  if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId)
  if (filters.from) query = query.gte('order_date', filters.from)
  if (filters.to) query = query.lte('order_date', filters.to)

  const search = filters.search?.trim()
  if (search) query = query.ilike('order_no', `%${search}%`)

  const { data, error } = await query
    .order('order_date', { ascending: false })
    .order('order_no', { ascending: false })

  if (error) {
    reportQueryFailure(
      'achats:commandes',
      error,
      'Les commandes fournisseurs n’ont pas pu être chargées.'
    )
  }

  return ((data ?? []) as unknown as RawOrder[]).map((row) => ({
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    orderDate: row.order_date,
    expectedDate: row.expected_date,
    supplierId: row.supplier_id,
    supplierLabel: supplierLabel(row.suppliers),
    quoteId: row.purchase_quote_id,
    quoteNo: row.purchase_quotes?.quote_no ?? null,
    ...totals(row.purchase_order_lines),
  }))
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('achats:commandes', error, 'Cette commande fournisseur n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawOrder

  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    orderDate: row.order_date,
    expectedDate: row.expected_date,
    supplierId: row.supplier_id,
    supplierLabel: supplierLabel(row.suppliers),
    quoteId: row.purchase_quote_id,
    quoteNo: row.purchase_quotes?.quote_no ?? null,
    quoteExternalRef: row.purchase_quotes?.external_ref ?? null,
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
    ...totals(row.purchase_order_lines),
  }
}

export async function listPurchaseOrderLines(orderId: string): Promise<PurchaseLine[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('purchase_order_lines')
    .select(
      'id, service_id, service_variant_id, label, quantity, unit_price, is_archived, source_quote_line_id'
    )
    .eq('purchase_order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) {
    reportQueryFailure(
      'achats:lignes de commande',
      error,
      'Les lignes de cette commande fournisseur n’ont pas pu être chargées.'
    )
  }

  return ((data ?? []) as unknown as RawLine[]).map(toLine)
}

/* -------------------------------------------------------------------------- */
/*  Factures issues d'une commande fournisseur                                 */
/* -------------------------------------------------------------------------- */

export type PurchaseOrderInvoice = {
  id: string
  invoiceNo: string
  externalRef: string | null
  status: string
  invoiceDate: string
  /** Montant brut de la facture REÇUE. `null` si ses lignes ne sont pas lisibles. */
  gross: number | null
}

/**
 * Les factures nées d'une commande fournisseur.
 *
 * Un TABLEAU, bien qu'une seule facture non annulée soit possible : les factures
 * ANNULÉES restent lisibles, et l'historique d'une commande refacturée en porte
 * plusieurs. Le montrer évite qu'une annulation paraisse avoir effacé quelque
 * chose.
 *
 * Exige `billing.supplier_invoices.view` : sans elle, RLS ne rend rien et
 * l'appelant doit dire qu'il ne sait pas, jamais « aucune facture » (DEC-017).
 *
 * 🟥 LE MONTANT BRUT EST CELUI DE LA FACTURE REÇUE, et il peut légitimement
 * différer de celui de la commande : c'est ce que le fournisseur réclame, non ce
 * qu'ADIKOM avait commandé (Module 07 §28, §54).
 */
export async function listPurchaseOrderInvoices(
  orderId: string
): Promise<PurchaseOrderInvoice[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('supplier_invoices')
    .select(
      'id, invoice_no, external_ref, status, invoice_date, supplier_invoice_lines ( amount, is_archived )'
    )
    .eq('purchase_order_id', orderId)
    .order('invoice_date', { ascending: false })

  if (error) {
    reportQueryFailure(
      'achats:factures de commande',
      error,
      'Les factures de cette commande n’ont pas pu être chargées.'
    )
  }

  type RawInvoice = {
    id: string
    invoice_no: string
    external_ref: string | null
    status: string
    invoice_date: string
    supplier_invoice_lines?: { amount: number; is_archived: boolean }[]
  }

  return ((data ?? []) as unknown as RawInvoice[]).map((row) => {
    const lines = row.supplier_invoice_lines
    return {
      id: row.id,
      invoiceNo: row.invoice_no,
      externalRef: row.external_ref,
      status: row.status,
      invoiceDate: row.invoice_date,
      // Aucune ligne lisible : on ne prétend pas que le brut vaut zéro.
      gross:
        lines === undefined
          ? null
          : lines
              .filter((line) => !line.is_archived)
              .reduce((sum, line) => sum + line.amount, 0),
    }
  })
}

/* -------------------------------------------------------------------------- */
/*  Ce que propose l'éditeur de lignes                                         */
/* -------------------------------------------------------------------------- */

export type PurchasableVariant = {
  variantId: string
  serviceId: string
  serviceLabel: string
  variantLabel: string
  unitLabel: string | null
  /**
   * 🟥 Le coût de RÉFÉRENCE du catalogue à la date du document — INDICATIF.
   *
   * `null` sans `catalog.services.cost.view`, et `null` si aucune version n'est
   * en vigueur. Il n'est JAMAIS appliqué à la ligne : c'est un point de
   * comparaison offert à l'acheteur, pas une valorisation.
   */
  referenceCost: number | null
}

/**
 * Les variantes ACHETABLES, avec leur coût de référence à une date.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🟥 CE COÛT EST AFFICHÉ, JAMAIS APPLIQUÉ — ET P-5 RESTE OUVERT
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * `service_variant_costs` porte UNE valeur par variante et par date, sans
 * dimension fournisseur — c'est exactement le point P-5, non tranché. Le
 * proposer comme prix de ligne ferait passer une moyenne interne pour l'offre
 * d'un fournisseur donné, et trancherait P-5 par un défaut d'implémentation.
 *
 * Il est donc AFFICHÉ à côté du champ de saisie — « voici ce que nous payons
 * d'habitude » — et le prix de la ligne reste celui de l'offre.
 *
 * `resolve_service_cost` est `SECURITY INVOKER` et lit `service_variant_costs` À
 * TRAVERS RLS : sans `catalog.services.cost.view`, elle ne rend AUCUNE ligne. La
 * confidentialité n'a donc pas besoin d'être refaite ici — elle est portée par
 * la base, et `mayReadCost` ne sert qu'à ÉVITER des appels inutiles et à
 * permettre à l'écran de DIRE pourquoi la colonne est vide (DEC-017).
 */
export async function listPurchasableVariants(
  on: string,
  mayReadCost: boolean
): Promise<PurchasableVariant[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('service_variants')
    .select(
      'id, label, service_id, is_active, services!inner ( label, status, purpose, unit_label )'
    )
    .eq('is_active', true)
    .eq('services.status', 'ACTIVE')
    .in('services.purpose', ['PURCHASE', 'BOTH'])
    .order('label', { ascending: true })

  if (error) {
    reportQueryFailure(
      'achats:variantes achetables',
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

  const costs = mayReadCost
    ? await Promise.all(
        rows.map(async (row) => {
          const { data: resolved } = await supabase
            .rpc('resolve_service_cost', { p_variant_id: row.id, p_on: on })
            .maybeSingle()
          return (resolved as { amount?: number } | null)?.amount ?? null
        })
      )
    : rows.map(() => null)

  return rows.map((row, index) => ({
    variantId: row.id,
    serviceId: row.service_id,
    serviceLabel: row.services?.label ?? 'Service',
    variantLabel: row.label,
    unitLabel: row.services?.unit_label ?? null,
    referenceCost: costs[index],
  }))
}
