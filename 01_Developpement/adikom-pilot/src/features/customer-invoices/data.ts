import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { CustomerInvoiceLineKind, CustomerInvoiceStatus } from './constants'

/**
 * Accès aux données de la facturation client — Étape 2.5, LOTs 7 et 8.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste la
 * barrière au niveau des données. Sans `billing.customer_invoices.view`, ces
 * fonctions ne renvoient rien — et l'appelant doit alors DIRE qu'il ne sait pas,
 * jamais afficher zéro (DEC-017).
 *
 * LES CINQ MONTANTS, ET CE QUE CE MODULE EN SAIT
 *
 *   Sous-total   Σ (quantité × prix) des lignes actives qui ajoutent.
 *   Réductions   Σ des lignes actives de type « réduction » (§24).
 *   Total        Sous-total − réductions (§23).
 *   Encaissé     Σ des règlements VALIDÉS (LOT 8). Exige EN PLUS
 *                `billing.customer_payments.view` : sans elle, la valeur est
 *                `null`, JAMAIS 0 — un zéro affirmerait que le système a
 *                vérifié qu'aucun encaissement n'a eu lieu.
 *   Solde        Total − encaissé (Workflow 08 §21), donc `null` dès que
 *                l'encaissé l'est.
 *
 * Aucun de ces montants n'est stocké : chacun est une somme refaite à chaque
 * lecture, comme le montant brut d'une facture fournisseur au LOT 5.
 */

export type { CustomerInvoiceStatus, CustomerInvoiceLineKind } from './constants'

/**
 * Quelles sommes l'appelant a le droit de lire.
 *
 * Ce n'est pas une option d'affichage : une somme illisible vaut `null`, et
 * l'écran DIT qu'il ne sait pas — il n'affiche jamais zéro à sa place
 * (DEC-017, DEC-024).
 */
export type AmountOptions = {
  canSeePayments: boolean
}

export type CustomerInvoiceAmounts = {
  subtotal: number
  discount: number
  total: number
  /** Σ des encaissements validés. `null` sans `billing.customer_payments.view`. */
  paidAmount: number | null
  /** Total − encaissé : ce qui reste dû (Workflow 08 §21). `null` si l'un manque. */
  remainingDue: number | null
}

export type CustomerInvoiceListItem = CustomerInvoiceAmounts & {
  id: string
  invoiceNo: string
  status: CustomerInvoiceStatus
  invoiceDate: string
  dueDate: string | null
  clientId: string
  /** `null` sans `parties.clients.view` — l'écran le dit (DEC-017). */
  clientLabel: string | null
  rentalId: string | null
  /** `null` sans `rental.rentals.view`, ou lorsqu'aucune location n'est visée. */
  rentalNo: string | null
}

export type CustomerInvoiceDetail = CustomerInvoiceListItem & {
  notes: string | null
  statusReason: string | null
  issuedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export type CustomerInvoiceLine = {
  id: string
  kind: CustomerInvoiceLineKind
  label: string
  quantity: number
  unitPrice: number
  /** Quantité × prix. Recalculé ici : aucune colonne ne le recopie. */
  lineTotal: number
  justification: string | null
}

const BASE_SELECT = `
  id, invoice_no, status, invoice_date, due_date, client_id, rental_id,
  clients ( client_no, type, legal_name, trade_name, first_name ),
  rentals ( rental_no )
`

export type RawClient = {
  client_no: string
  type: string
  legal_name: string
  trade_name: string | null
  first_name: string | null
}

type RawRow = {
  id: string
  invoice_no: string
  status: CustomerInvoiceStatus
  invoice_date: string
  due_date: string | null
  client_id: string
  rental_id: string | null
  clients?: RawClient | null
  rentals?: { rental_no: string } | null
}

/** Même composition que la fiche client : un particulier porte son prénom. */
export function clientLabel(client: RawClient | null | undefined): string | null {
  if (!client) return null
  const name =
    client.type === 'INDIVIDUAL' && client.first_name
      ? `${client.first_name} ${client.legal_name}`.trim()
      : (client.trade_name ?? client.legal_name)
  return `${name} (${client.client_no})`
}

export type CustomerInvoiceFilters = {
  search?: string
  status?: string
  clientId?: string
  rentalId?: string
  /** Période sur la date de facture (§54). */
  from?: string
  to?: string
  /** Filtre dérivé : facture émise dont le solde reste dû (§54 « impayées »). */
  unpaid?: boolean
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

/**
 * Montants d'un lot de factures — une requête par source, jamais N.
 *
 * Les lignes sont lues sous `billing.customer_invoices.view`, comme la facture
 * elle-même : elles ne s'attribuent pas séparément. Une facture illisible ne
 * remonte de toute façon pas dans la liste.
 *
 * Les ENCAISSEMENTS relèvent d'une autre capacité (DEC-024). Sans
 * `billing.customer_payments.view`, la somme serait vide et le solde, faux : on
 * renvoie alors `null`, et l'écran le dit.
 */
async function loadAmounts(
  invoiceIds: string[],
  options: AmountOptions
): Promise<Map<string, CustomerInvoiceAmounts>> {
  const amounts = new Map<string, CustomerInvoiceAmounts>()
  if (invoiceIds.length === 0) return amounts

  const supabase = await createSupabaseServerClient()

  const [lines, payments] = await Promise.all([
    supabase
      .from('customer_invoice_lines')
      .select('customer_invoice_id, kind, quantity, unit_price, is_archived')
      .in('customer_invoice_id', invoiceIds),
    options.canSeePayments
      ? supabase
          .from('customer_payments')
          .select('customer_invoice_id, amount, status')
          .in('customer_invoice_id', invoiceIds)
          .eq('status', 'VALIDATED')
      : Promise.resolve({ data: null, error: null }),
  ])

  if (lines.error) {
    reportQueryFailure(
      'lignes de facture client',
      lines.error,
      'Le montant des factures n’a pas pu être calculé.'
    )
  }
  if (payments.error) {
    reportQueryFailure(
      'règlements clients',
      payments.error,
      'Le total encaissé n’a pas pu être calculé.'
    )
  }

  // DEC-010 : sommes d'entiers, aucun flottant.
  const subtotals = new Map<string, number>()
  const discounts = new Map<string, number>()

  for (const line of lines.data ?? []) {
    if (line.is_archived) continue
    const bucket = line.kind === 'DISCOUNT' ? discounts : subtotals
    bucket.set(
      line.customer_invoice_id,
      (bucket.get(line.customer_invoice_id) ?? 0) + line.quantity * line.unit_price
    )
  }

  const paid = new Map<string, number>()
  for (const row of payments.data ?? []) {
    paid.set(row.customer_invoice_id, (paid.get(row.customer_invoice_id) ?? 0) + row.amount)
  }

  for (const id of invoiceIds) {
    const subtotal = subtotals.get(id) ?? 0
    const discount = discounts.get(id) ?? 0
    const total = subtotal - discount
    const paidAmount = options.canSeePayments ? (paid.get(id) ?? 0) : null

    amounts.set(id, {
      subtotal,
      discount,
      total,
      paidAmount,
      remainingDue: paidAmount === null ? null : total - paidAmount,
    })
  }

  return amounts
}

const NO_AMOUNTS: CustomerInvoiceAmounts = {
  subtotal: 0,
  discount: 0,
  total: 0,
  paidAmount: null,
  remainingDue: null,
}

export async function listCustomerInvoices(
  filters: CustomerInvoiceFilters = {},
  options: AmountOptions = { canSeePayments: false }
): Promise<CustomerInvoiceListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('customer_invoices').select(BASE_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    // §53 : numéro de facture, et référence de location.
    query = query.or(`invoice_no.ilike.%${search}%`)
  }

  /*
   * Trois statuts ne se filtrent PAS en base : « En retard », « Payée » et
   * « Partiellement payée » n'y sont jamais écrits (§61, DEC-025 §a). Ils
   * portent tous sur une facture ÉMISE, et sont appliqués plus bas, une fois
   * les sommes connues.
   */
  const DERIVED = ['OVERDUE', 'PAID', 'PARTIALLY_PAID']

  if (filters.status && !DERIVED.includes(filters.status)) {
    query = query.eq('status', filters.status)
  }
  if (filters.status && DERIVED.includes(filters.status)) {
    query = query.eq('status', 'ISSUED')
  }

  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.rentalId) query = query.eq('rental_id', filters.rentalId)
  if (filters.from) query = query.gte('invoice_date', filters.from)
  if (filters.to) query = query.lte('invoice_date', filters.to)

  const { data, error } = await query
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    reportQueryFailure(
      'factures clients',
      error,
      'La liste des factures clients n’a pas pu être chargée.'
    )
  }

  const rows = (data ?? []) as unknown as RawRow[]
  const amounts = await loadAmounts(
    rows.map((row) => row.id),
    options
  )

  let items = rows.map((row) => ({
    id: row.id,
    invoiceNo: row.invoice_no,
    status: row.status,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    clientId: row.client_id,
    clientLabel: clientLabel(row.clients),
    rentalId: row.rental_id,
    // Ressource embarquée : RLS s'applique indépendamment. Sans
    // `rental.rentals.view`, la location reste inconnue et l'écran le dit.
    rentalNo: row.rentals?.rental_no ?? null,
    ...(amounts.get(row.id) ?? NO_AMOUNTS),
  }))

  /*
   * « Impayées » et « En retard » se filtrent sur le SOLDE, jamais en base : la
   * valeur n'y est pas écrite (§61, DEC-025 §a). Une facture dont le solde n'est
   * pas lisible est conservée — on ne l'écarte pas sur une somme qu'on n'a pas
   * pu lire (DEC-017).
   */
  if (filters.unpaid || filters.status === 'OVERDUE') {
    items = items.filter(
      (item) => item.status === 'ISSUED' && (item.remainingDue === null || item.remainingDue > 0)
    )
  }

  if (filters.status === 'PAID') {
    items = items.filter(
      (item) =>
        item.status === 'ISSUED' &&
        item.remainingDue !== null &&
        item.remainingDue <= 0 &&
        item.total > 0
    )
  }

  if (filters.status === 'PARTIALLY_PAID') {
    items = items.filter(
      (item) =>
        item.status === 'ISSUED' &&
        item.remainingDue !== null &&
        item.remainingDue > 0 &&
        (item.paidAmount ?? 0) > 0
    )
  }

  return items
}

export async function getCustomerInvoiceDetail(
  id: string,
  options: AmountOptions = { canSeePayments: false }
): Promise<CustomerInvoiceDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('customer_invoices')
    .select(
      `${BASE_SELECT}, notes, status_reason, issued_at, cancelled_at, created_at, updated_at`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('facture client', error, 'Cette facture n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawRow & {
    notes: string | null
    status_reason: string | null
    issued_at: string | null
    cancelled_at: string | null
    created_at: string
    updated_at: string
  }

  const amounts = await loadAmounts([row.id], options)

  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    status: row.status,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    clientId: row.client_id,
    clientLabel: clientLabel(row.clients),
    rentalId: row.rental_id,
    rentalNo: row.rentals?.rental_no ?? null,
    notes: row.notes,
    statusReason: row.status_reason,
    issuedAt: row.issued_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(amounts.get(row.id) ?? NO_AMOUNTS),
  }
}

/** Lignes actives d'une facture — leur somme EST le total (§22, §60). */
export async function listCustomerInvoiceLines(
  invoiceId: string
): Promise<CustomerInvoiceLine[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('customer_invoice_lines')
    .select('id, kind, label, quantity, unit_price, justification, is_archived')
    .eq('customer_invoice_id', invoiceId)
    .order('created_at')

  if (error) {
    reportQueryFailure(
      'lignes de facture client',
      error,
      'Les lignes de cette facture n’ont pas pu être chargées.'
    )
  }

  const rows = (data ?? []) as unknown as {
    id: string
    kind: CustomerInvoiceLineKind
    label: string
    quantity: number
    unit_price: number
    justification: string | null
    is_archived: boolean
  }[]

  return rows
    .filter((row) => !row.is_archived)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      label: row.label,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      lineTotal: row.quantity * row.unit_price,
      justification: row.justification,
    }))
}

/**
 * Factures d'un client, pour son onglet dédié (Workflow 07 §50).
 *
 * L'appelant ne DOIT l'appeler qu'après avoir vérifié
 * `billing.customer_invoices.view` : une liste vide obtenue par refus de lecture
 * se lirait « ce client n'a jamais été facturé » (DEC-017).
 */
export async function listCustomerInvoicesForClient(
  clientId: string,
  options: AmountOptions = { canSeePayments: false }
): Promise<CustomerInvoiceListItem[]> {
  return listCustomerInvoices({ clientId }, options)
}

/** Facture portée par une location, s'il en existe une non annulée. */
export async function getInvoiceForRental(
  rentalId: string,
  options: AmountOptions = { canSeePayments: false }
): Promise<CustomerInvoiceListItem | null> {
  const invoices = await listCustomerInvoices({ rentalId }, options)
  return invoices.find((invoice) => invoice.status !== 'CANCELLED') ?? null
}

/** Clients actifs, pour le filtre de la liste et le choix à la création. */
export async function listClientFilters(): Promise<{ id: string; label: string }[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('clients')
    .select('id, client_no, type, legal_name, trade_name, first_name, status')
    .eq('status', 'ACTIVE')
    .order('legal_name')

  if (error) {
    reportQueryFailure('clients', error, 'La liste des clients n’a pas pu être chargée.')
  }

  return (data ?? []).map((client) => ({
    id: client.id,
    label: clientLabel(client as RawClient) ?? client.client_no,
  }))
}

/**
 * Locations « À facturer » — les seules qui puissent recevoir une facture (§5).
 *
 * Le tarif verrouillé accompagne chacune : c'est LUI que la ligne de location
 * reprendra (§7, §8). La quantité, elle, reste saisie — la règle d'arrondi de
 * durée n'est pas définie (DEC-008).
 */
export type InvoiceableRental = {
  id: string
  rentalNo: string
  clientId: string
  clientLabel: string | null
  vehicleLabel: string | null
  startedAt: string | null
  returnedAt: string | null
  lockedAmount: number
  lockedUnit: string
}

export async function listInvoiceableRentals(clientId?: string): Promise<InvoiceableRental[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('rentals')
    .select(
      `id, rental_no, client_id, started_at, returned_at, locked_amount, locked_unit,
       clients ( client_no, type, legal_name, trade_name, first_name ),
       vehicles ( brand, model, plate )`
    )
    .eq('status', 'TO_INVOICE')

  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query.order('returned_at', { ascending: false }).limit(200)

  if (error) {
    reportQueryFailure(
      'locations à facturer',
      error,
      'Les locations à facturer n’ont pas pu être chargées.'
    )
  }

  const rows = (data ?? []) as unknown as {
    id: string
    rental_no: string
    client_id: string
    started_at: string | null
    returned_at: string | null
    locked_amount: number
    locked_unit: string
    clients?: RawClient | null
    vehicles?: { brand: string; model: string; plate: string | null } | null
  }[]

  return rows.map((row) => ({
    id: row.id,
    rentalNo: row.rental_no,
    clientId: row.client_id,
    clientLabel: clientLabel(row.clients),
    vehicleLabel: row.vehicles
      ? `${row.vehicles.brand} ${row.vehicles.model}${row.vehicles.plate ? ` — ${row.vehicles.plate}` : ''}`
      : null,
    startedAt: row.started_at,
    returnedAt: row.returned_at,
    lockedAmount: row.locked_amount,
    lockedUnit: row.locked_unit,
  }))
}
