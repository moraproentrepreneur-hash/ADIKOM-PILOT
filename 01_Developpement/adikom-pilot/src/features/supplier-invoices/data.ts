import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { SupplierInvoiceStatus } from './constants'

/**
 * Accès aux données de la facturation fournisseur — Étape 2.5, LOT 5.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données. Sans `billing.supplier_invoices.view`, ces
 * fonctions ne renvoient rien — et l'appelant doit alors DIRE qu'il ne sait
 * pas, jamais afficher zéro (DEC-017).
 *
 * LES CINQ MONTANTS, ET CE QUE CE MODULE EN SAIT
 *
 *   Brut       Σ des lignes actives. Lisible avec `supplier_invoices.view`.
 *   Imputé     Σ des imputations « Imputée ». Exige EN PLUS
 *              `billing.imputations.view` : sans elle, la valeur est `null`,
 *              JAMAIS 0 — un net à payer calculé sur un total imputé illisible
 *              serait faux, et se lirait comme une dette plus élevée qu'elle
 *              ne l'est.
 *   Net        Brut − Imputé, donc `null` dès que l'imputé l'est.
 *   Payé       Σ des règlements validés (LOT 6). Exige
 *              `billing.supplier_payments.view`, pour la même raison.
 *   Reste dû   Net − Payé (Workflow 08 §21), donc `null` dès que l'un manque.
 *
 * Aucun de ces montants n'est stocké : chacun est une somme refaite à chaque
 * lecture, comme le reste imputable du LOT 4.
 */

export type { SupplierInvoiceStatus } from './constants'

/**
 * Quelles sommes l'appelant a le droit de lire.
 *
 * Ce ne sont pas des options d'affichage : une somme illisible vaut `null`, et
 * l'écran DIT qu'il ne sait pas — il n'affiche jamais zéro à sa place
 * (DEC-017, DEC-024).
 */
export type AmountOptions = {
  canSeeImputations: boolean
  canSeePayments: boolean
}

export type SupplierInvoiceAmounts = {
  grossAmount: number
  /** `null` sans `billing.imputations.view` : jamais 0 par défaut (DEC-017). */
  imputedAmount: number | null
  /** Brut − imputé. `null` dès que l'imputé ne peut pas être lu. */
  netPayable: number | null
  /** Σ des règlements validés. `null` sans `billing.supplier_payments.view`. */
  paidAmount: number | null
  /** Net − payé : ce qui reste dû (Workflow 08 §21). `null` si l'un manque. */
  remainingDue: number | null
}

export type SupplierInvoiceListItem = SupplierInvoiceAmounts & {
  id: string
  invoiceNo: string
  externalRef: string | null
  status: SupplierInvoiceStatus
  invoiceDate: string
  dueDate: string | null
  supplierId: string
  /** `null` sans `parties.suppliers.view` — l'écran le dit (DEC-017). */
  supplierLabel: string | null
}

export type SupplierInvoiceDetail = SupplierInvoiceListItem & {
  notes: string | null
  statusReason: string | null
  validatedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export type SupplierInvoiceLine = {
  id: string
  label: string
  amount: number
  vehicleId: string | null
  /** `null` sans `rental.fleet.view`, ou lorsqu'aucun véhicule n'est désigné. */
  vehicleLabel: string | null
}

const BASE_SELECT = `
  id, invoice_no, external_ref, status, invoice_date, due_date, supplier_id,
  suppliers ( supplier_no, legal_name, trade_name )
`

type RawRow = {
  id: string
  invoice_no: string
  external_ref: string | null
  status: SupplierInvoiceStatus
  invoice_date: string
  due_date: string | null
  supplier_id: string
  suppliers?: { supplier_no: string; legal_name: string; trade_name: string | null } | null
}

function supplierLabel(
  supplier: { supplier_no: string; legal_name: string; trade_name: string | null } | null | undefined
): string | null {
  return supplier ? `${supplier.trade_name ?? supplier.legal_name} (${supplier.supplier_no})` : null
}

export type SupplierInvoiceFilters = {
  search?: string
  status?: string
  supplierId?: string
  vehicleId?: string
  /** Période sur la date de facture (Module 07 §33). */
  from?: string
  to?: string
  /** Filtre dérivé : facture validée dont le net à payer reste dû (§34). */
  unpaid?: boolean
  /** Filtre §34 : factures portant au moins une imputation. */
  withImputation?: boolean
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

/**
 * Montants d'un lot de factures — une requête par source, jamais N.
 *
 * `canSeeImputations` n'est pas un confort d'affichage : sans
 * `billing.imputations.view`, la somme des imputations serait vide et le net à
 * payer, faux. On renvoie alors `null`, et l'écran le dit.
 */
async function loadAmounts(
  invoiceIds: string[],
  options: AmountOptions
): Promise<Map<string, SupplierInvoiceAmounts>> {
  const amounts = new Map<string, SupplierInvoiceAmounts>()
  if (invoiceIds.length === 0) return amounts

  const supabase = await createSupabaseServerClient()

  const [lines, imputations, payments] = await Promise.all([
    supabase
      .from('supplier_invoice_lines')
      .select('supplier_invoice_id, amount, is_archived')
      .in('supplier_invoice_id', invoiceIds),
    options.canSeeImputations
      ? supabase
          .from('imputations')
          .select('supplier_invoice_id, amount, status')
          .in('supplier_invoice_id', invoiceIds)
          .eq('status', 'IMPUTED')
      : Promise.resolve({ data: null, error: null }),
    options.canSeePayments
      ? supabase
          .from('supplier_payments')
          .select('supplier_invoice_id, amount, status')
          .in('supplier_invoice_id', invoiceIds)
          .eq('status', 'VALIDATED')
      : Promise.resolve({ data: null, error: null }),
  ])

  if (lines.error) {
    reportQueryFailure(
      'lignes de facture',
      lines.error,
      'Le montant des factures n’a pas pu être calculé.'
    )
  }
  if (imputations.error) {
    reportQueryFailure(
      'imputations',
      imputations.error,
      'Le total imputé n’a pas pu être calculé.'
    )
  }
  if (payments.error) {
    reportQueryFailure(
      'règlements fournisseurs',
      payments.error,
      'Le total réglé n’a pas pu être calculé.'
    )
  }

  // DEC-010 : sommes d'entiers, aucun flottant.
  const gross = new Map<string, number>()
  for (const line of lines.data ?? []) {
    if (line.is_archived) continue
    gross.set(
      line.supplier_invoice_id,
      (gross.get(line.supplier_invoice_id) ?? 0) + line.amount
    )
  }

  const imputed = new Map<string, number>()
  for (const row of imputations.data ?? []) {
    if (!row.supplier_invoice_id) continue
    imputed.set(row.supplier_invoice_id, (imputed.get(row.supplier_invoice_id) ?? 0) + row.amount)
  }

  const paid = new Map<string, number>()
  for (const row of payments.data ?? []) {
    paid.set(row.supplier_invoice_id, (paid.get(row.supplier_invoice_id) ?? 0) + row.amount)
  }

  for (const id of invoiceIds) {
    const grossAmount = gross.get(id) ?? 0
    const imputedAmount = options.canSeeImputations ? (imputed.get(id) ?? 0) : null
    const paidAmount = options.canSeePayments ? (paid.get(id) ?? 0) : null
    const netPayable = imputedAmount === null ? null : grossAmount - imputedAmount

    amounts.set(id, {
      grossAmount,
      imputedAmount,
      netPayable,
      paidAmount,
      remainingDue:
        netPayable === null || paidAmount === null ? null : netPayable - paidAmount,
    })
  }

  return amounts
}

const NO_AMOUNTS: SupplierInvoiceAmounts = {
  grossAmount: 0,
  imputedAmount: null,
  netPayable: null,
  paidAmount: null,
  remainingDue: null,
}

export async function listSupplierInvoices(
  filters: SupplierInvoiceFilters,
  options: AmountOptions
): Promise<SupplierInvoiceListItem[]> {
  const supabase = await createSupabaseServerClient()

  /*
   * Filtre par véhicule (§34) : le lien vit sur la LIGNE, une facture pouvant
   * en couvrir plusieurs. On résout donc d'abord les factures concernées.
   */
  let vehicleScope: string[] | null = null
  if (filters.vehicleId) {
    const { data, error } = await supabase
      .from('supplier_invoice_lines')
      .select('supplier_invoice_id')
      .eq('vehicle_id', filters.vehicleId)
      .eq('is_archived', false)

    if (error) {
      reportQueryFailure(
        'lignes de facture',
        error,
        'Les factures de ce véhicule n’ont pas pu être recherchées.'
      )
    }

    vehicleScope = [...new Set((data ?? []).map((row) => row.supplier_invoice_id))]
    if (vehicleScope.length === 0) return []
  }

  let query = supabase.from('supplier_invoices').select(BASE_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    // §33 : numéro interne ADIKOM ET numéro porté par le document du fournisseur.
    query = query.or(`invoice_no.ilike.%${search}%,external_ref.ilike.%${search}%`)
  }

  /*
   * Trois statuts ne se filtrent PAS en base : « En retard », « Payée » et
   * « Partiellement payée » n'y sont jamais écrits (Module 07 §55,
   * DEC-025 §a). Ils portent tous sur une facture VALIDÉE, et sont appliqués
   * plus bas, une fois les sommes connues.
   */
  const DERIVED = ['OVERDUE', 'PAID', 'PARTIALLY_PAID']

  if (filters.status && !DERIVED.includes(filters.status)) {
    query = query.eq('status', filters.status)
  }
  if (filters.status && DERIVED.includes(filters.status)) {
    query = query.eq('status', 'VALIDATED')
  }

  if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId)
  if (filters.from) query = query.gte('invoice_date', filters.from)
  if (filters.to) query = query.lte('invoice_date', filters.to)
  if (vehicleScope) query = query.in('id', vehicleScope)

  const { data, error } = await query
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    reportQueryFailure(
      'factures fournisseurs',
      error,
      'La liste des factures fournisseurs n’a pas pu être chargée.'
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
    externalRef: row.external_ref,
    status: row.status,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    supplierId: row.supplier_id,
    supplierLabel: supplierLabel(row.suppliers),
    ...(amounts.get(row.id) ?? NO_AMOUNTS),
  }))

  if (filters.withImputation) {
    items = items.filter((item) => (item.imputedAmount ?? 0) > 0)
  }

  /*
   * « Impayées » et « En retard » se filtrent sur le RESTE DÛ, jamais en base :
   * la valeur n'y est pas écrite (Module 07 §55, DEC-025 §a). Une facture dont
   * le reste dû n'est pas lisible est conservée — on ne l'écarte pas sur une
   * somme qu'on n'a pas pu lire.
   */
  if (filters.unpaid || filters.status === 'OVERDUE') {
    items = items.filter((item) => item.remainingDue === null || item.remainingDue > 0)
  }

  if (filters.status === 'PAID') {
    items = items.filter(
      (item) => item.remainingDue !== null && item.remainingDue <= 0 && item.grossAmount > 0
    )
  }

  if (filters.status === 'PARTIALLY_PAID') {
    items = items.filter(
      (item) =>
        item.remainingDue !== null &&
        item.remainingDue > 0 &&
        (item.paidAmount ?? 0) > 0
    )
  }

  return items
}

export async function getSupplierInvoiceDetail(
  id: string,
  options: AmountOptions
): Promise<SupplierInvoiceDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('supplier_invoices')
    .select(
      `${BASE_SELECT}, notes, status_reason, validated_at, cancelled_at, created_at, updated_at`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('facture fournisseur', error, 'Cette facture n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawRow & {
    notes: string | null
    status_reason: string | null
    validated_at: string | null
    cancelled_at: string | null
    created_at: string
    updated_at: string
  }

  const amounts = await loadAmounts([row.id], options)

  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    externalRef: row.external_ref,
    status: row.status,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    supplierId: row.supplier_id,
    supplierLabel: supplierLabel(row.suppliers),
    notes: row.notes,
    statusReason: row.status_reason,
    validatedAt: row.validated_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(amounts.get(row.id) ?? NO_AMOUNTS),
  }
}

/** Lignes actives d'une facture — leur somme EST le montant brut. */
export async function listSupplierInvoiceLines(
  invoiceId: string
): Promise<SupplierInvoiceLine[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('supplier_invoice_lines')
    .select('id, label, amount, vehicle_id, is_archived, vehicles ( brand, model, plate )')
    .eq('supplier_invoice_id', invoiceId)
    .order('created_at')

  if (error) {
    reportQueryFailure(
      'lignes de facture',
      error,
      'Les lignes de cette facture n’ont pas pu être chargées.'
    )
  }

  const rows = (data ?? []) as unknown as {
    id: string
    label: string
    amount: number
    vehicle_id: string | null
    is_archived: boolean
    vehicles?: { brand: string; model: string; plate: string | null } | null
  }[]

  return rows
    .filter((row) => !row.is_archived)
    .map((row) => ({
      id: row.id,
      label: row.label,
      amount: row.amount,
      vehicleId: row.vehicle_id,
      // Ressource embarquée : RLS s'applique indépendamment. Sans
      // `rental.fleet.view`, le véhicule reste inconnu et l'écran le dit.
      vehicleLabel: row.vehicles
        ? `${row.vehicles.brand} ${row.vehicles.model}${row.vehicles.plate ? ` — ${row.vehicles.plate}` : ''}`
        : null,
    }))
}

/**
 * Factures d'un fournisseur, pour son onglet dédié (Règles fournisseurs §32).
 *
 * L'appelant ne DOIT l'appeler qu'après avoir vérifié
 * `billing.supplier_invoices.view` : une liste vide obtenue par refus de
 * lecture se lirait « ce fournisseur n'a jamais facturé » (DEC-017).
 */
export async function listSupplierInvoicesForSupplier(
  supplierId: string,
  options: AmountOptions
): Promise<SupplierInvoiceListItem[]> {
  return listSupplierInvoices({ supplierId }, options)
}

/**
 * Factures validées d'un fournisseur — cibles possibles d'un rattachement.
 *
 * Workflow 06 §32 : seule une facture existante, c'est-à-dire validée, reçoit
 * une imputation. Une facture annulée ou en saisie n'y figure donc pas.
 */
export async function listAttachableInvoices(
  supplierId: string,
  options: AmountOptions
): Promise<SupplierInvoiceListItem[]> {
  const invoices = await listSupplierInvoices({ supplierId, status: 'VALIDATED' }, options)
  return invoices
}

/** Fournisseurs actifs, pour le filtre de la liste. */
export async function listSupplierFilters(): Promise<{ id: string; label: string }[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('id, supplier_no, legal_name, trade_name, status')
    .eq('status', 'ACTIVE')
    .order('legal_name')

  if (error) {
    reportQueryFailure(
      'fournisseurs',
      error,
      'La liste des fournisseurs n’a pas pu être chargée.'
    )
  }

  return (data ?? []).map((supplier) => ({
    id: supplier.id,
    label: `${supplier.trade_name ?? supplier.legal_name} (${supplier.supplier_no})`,
  }))
}
