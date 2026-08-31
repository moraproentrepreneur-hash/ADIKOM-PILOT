import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { PaymentMethod } from './constants'

/**
 * Accès aux règlements fournisseurs — Étape 2.5, LOT 6.
 *
 * UN RÈGLEMENT N'EST PAS UNE IMPUTATION.
 *
 * Module 07 §37 : « L'imputation doit être enregistrée comme une opération
 * DISTINCTE du paiement. » Deux tables, deux capacités, deux écrans — et deux
 * effets : l'imputation réduit le net à payer, le règlement le solde en faisant
 * sortir de l'argent d'un compte.
 *
 * L'appelant ne DOIT interroger ce module qu'après avoir vérifié
 * `billing.supplier_payments.view` : une liste vide obtenue par refus de
 * lecture se lirait « cette facture n'a jamais été réglée » (DEC-017).
 */

export type SupplierPaymentStatus = 'VALIDATED' | 'CANCELLED'

export type SupplierPayment = {
  id: string
  paymentNo: string
  supplierInvoiceId: string
  /** `null` sans `billing.supplier_invoices.view`. */
  invoiceNo: string | null
  accountId: string
  /** `null` sans `treasury.accounts.view` — l'écran le dit. */
  accountLabel: string | null
  amount: number
  paidOn: string
  method: PaymentMethod
  externalRef: string | null
  notes: string | null
  status: SupplierPaymentStatus
  statusReason: string | null
  cancelledAt: string | null
  createdAt: string
}

const BASE_SELECT = `
  id, payment_no, supplier_invoice_id, account_id, amount, paid_on, method,
  external_ref, notes, status, status_reason, cancelled_at, created_at,
  financial_accounts ( label, account_no ),
  supplier_invoices ( invoice_no )
`

type RawRow = {
  id: string
  payment_no: string
  supplier_invoice_id: string
  account_id: string
  amount: number
  paid_on: string
  method: PaymentMethod
  external_ref: string | null
  notes: string | null
  status: SupplierPaymentStatus
  status_reason: string | null
  cancelled_at: string | null
  created_at: string
  financial_accounts?: { label: string; account_no: string } | null
  supplier_invoices?: { invoice_no: string } | null
}

function toPayment(row: RawRow): SupplierPayment {
  return {
    id: row.id,
    paymentNo: row.payment_no,
    supplierInvoiceId: row.supplier_invoice_id,
    invoiceNo: row.supplier_invoices?.invoice_no ?? null,
    accountId: row.account_id,
    // Ressource embarquée : RLS s'applique indépendamment. Sans
    // `treasury.accounts.view`, le règlement reste lisible, pas le compte
    // qu'il a mouvementé (DEC-024).
    accountLabel: row.financial_accounts
      ? `${row.financial_accounts.label} (${row.financial_accounts.account_no})`
      : null,
    amount: row.amount,
    paidOn: row.paid_on,
    method: row.method,
    externalRef: row.external_ref,
    notes: row.notes,
    status: row.status,
    statusReason: row.status_reason,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  }
}

export type PaymentFilters = {
  supplierInvoiceId?: string
  accountId?: string
  status?: string
}

async function listPayments(filters: PaymentFilters): Promise<SupplierPayment[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('supplier_payments').select(BASE_SELECT)

  if (filters.supplierInvoiceId) {
    query = query.eq('supplier_invoice_id', filters.supplierInvoiceId)
  }
  if (filters.accountId) query = query.eq('account_id', filters.accountId)
  if (filters.status) query = query.eq('status', filters.status)

  const { data, error } = await query
    .order('paid_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    reportQueryFailure(
      'règlements fournisseurs',
      error,
      'La liste des règlements n’a pas pu être chargée.'
    )
  }

  return ((data ?? []) as unknown as RawRow[]).map(toPayment)
}

/** Règlements d'une facture — Workflow 08 §20 : « Plusieurs paiements ». */
export async function listInvoicePayments(invoiceId: string): Promise<SupplierPayment[]> {
  return listPayments({ supplierInvoiceId: invoiceId })
}

/** Règlements passés par un compte — Module 06 §41, historique du compte. */
export async function listAccountPayments(accountId: string): Promise<SupplierPayment[]> {
  return listPayments({ accountId })
}

/**
 * Règlements d'un fournisseur, pour son onglet dédié.
 *
 * Les règlements ne portent pas le fournisseur : ils portent la FACTURE, qui le
 * porte (Workflow 08 §33 — Fournisseur → Facture → Imputation → Paiement). La
 * résolution passe donc par les factures, et non par une colonne recopiée qui
 * pourrait les contredire.
 */
export async function listSupplierPayments(supplierId: string): Promise<SupplierPayment[]> {
  const supabase = await createSupabaseServerClient()

  const { data: invoices, error } = await supabase
    .from('supplier_invoices')
    .select('id')
    .eq('supplier_id', supplierId)

  if (error) {
    reportQueryFailure(
      'factures fournisseurs',
      error,
      'Les règlements de ce fournisseur n’ont pas pu être recherchés.'
    )
  }

  const ids = (invoices ?? []).map((row) => row.id)
  if (ids.length === 0) return []

  const { data, error: paymentsError } = await supabase
    .from('supplier_payments')
    .select(BASE_SELECT)
    .in('supplier_invoice_id', ids)
    .order('paid_on', { ascending: false })
    .limit(200)

  if (paymentsError) {
    reportQueryFailure(
      'règlements fournisseurs',
      paymentsError,
      'La liste des règlements n’a pas pu être chargée.'
    )
  }

  return ((data ?? []) as unknown as RawRow[]).map(toPayment)
}
