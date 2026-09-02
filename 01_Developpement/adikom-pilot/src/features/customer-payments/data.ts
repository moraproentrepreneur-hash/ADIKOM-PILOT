import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { PaymentMethod } from '@/features/treasury/constants'

/**
 * Accès aux règlements clients — Étape 2.5, LOT 8.
 *
 * UN ENCAISSEMENT EST L'EXACT MIROIR D'UN DÉCAISSEMENT.
 *
 * Workflow 08 §47 : « Lorsqu'un paiement client est encaissé : Banque/Caisse
 * AUGMENTE. » Deux tables, deux capacités, deux sens — et le sens est porté par
 * le sens de l'écriture, jamais par le signe d'un montant (Module 06 §19).
 *
 * L'appelant ne DOIT interroger ce module qu'après avoir vérifié
 * `billing.customer_payments.view` : une liste vide obtenue par refus de
 * lecture se lirait « cette facture n'a jamais été encaissée » (DEC-017).
 */

export type CustomerPaymentStatus = 'VALIDATED' | 'CANCELLED'

export type CustomerPayment = {
  id: string
  paymentNo: string
  customerInvoiceId: string
  /** `null` sans `billing.customer_invoices.view`. */
  invoiceNo: string | null
  accountId: string
  /** `null` sans `treasury.accounts.view` — l'écran le dit. */
  accountLabel: string | null
  amount: number
  receivedOn: string
  method: PaymentMethod
  externalRef: string | null
  notes: string | null
  status: CustomerPaymentStatus
  statusReason: string | null
  cancelledAt: string | null
  createdAt: string
}

const BASE_SELECT = `
  id, payment_no, customer_invoice_id, account_id, amount, received_on, method,
  external_ref, notes, status, status_reason, cancelled_at, created_at,
  financial_accounts ( label, account_no ),
  customer_invoices ( invoice_no )
`

type RawRow = {
  id: string
  payment_no: string
  customer_invoice_id: string
  account_id: string
  amount: number
  received_on: string
  method: PaymentMethod
  external_ref: string | null
  notes: string | null
  status: CustomerPaymentStatus
  status_reason: string | null
  cancelled_at: string | null
  created_at: string
  financial_accounts?: { label: string; account_no: string } | null
  customer_invoices?: { invoice_no: string } | null
}

function toPayment(row: RawRow): CustomerPayment {
  return {
    id: row.id,
    paymentNo: row.payment_no,
    customerInvoiceId: row.customer_invoice_id,
    invoiceNo: row.customer_invoices?.invoice_no ?? null,
    accountId: row.account_id,
    // Ressource embarquée : RLS s'applique indépendamment. Sans
    // `treasury.accounts.view`, le règlement reste lisible, pas le compte qu'il
    // a mouvementé (DEC-024).
    accountLabel: row.financial_accounts
      ? `${row.financial_accounts.label} (${row.financial_accounts.account_no})`
      : null,
    amount: row.amount,
    receivedOn: row.received_on,
    method: row.method,
    externalRef: row.external_ref,
    notes: row.notes,
    status: row.status,
    statusReason: row.status_reason,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  }
}

/** Règlements d'une facture — Workflow 08 §20 : « Plusieurs paiements ». */
export async function listInvoiceCustomerPayments(
  invoiceId: string
): Promise<CustomerPayment[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('customer_payments')
    .select(BASE_SELECT)
    .eq('customer_invoice_id', invoiceId)
    .order('received_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    reportQueryFailure(
      'règlements clients',
      error,
      'La liste des règlements n’a pas pu être chargée.'
    )
  }

  return ((data ?? []) as unknown as RawRow[]).map(toPayment)
}

/**
 * Règlements d'un client, pour son onglet dédié — Workflow 08 §32.
 *
 * « La fiche client doit permettre de retrouver ses règlements. » Les
 * règlements ne portent pas le client : ils portent la FACTURE, qui le porte
 * (Client → Facture → Paiement). La résolution passe donc par les factures, et
 * non par une colonne recopiée qui pourrait les contredire.
 */
export async function listClientPayments(clientId: string): Promise<CustomerPayment[]> {
  const supabase = await createSupabaseServerClient()

  const { data: invoices, error } = await supabase
    .from('customer_invoices')
    .select('id')
    .eq('client_id', clientId)

  if (error) {
    reportQueryFailure(
      'factures clients',
      error,
      'Les règlements de ce client n’ont pas pu être recherchés.'
    )
  }

  const ids = (invoices ?? []).map((row) => row.id)
  if (ids.length === 0) return []

  const { data, error: paymentsError } = await supabase
    .from('customer_payments')
    .select(BASE_SELECT)
    .in('customer_invoice_id', ids)
    .order('received_on', { ascending: false })
    .limit(200)

  if (paymentsError) {
    reportQueryFailure(
      'règlements clients',
      paymentsError,
      'La liste des règlements n’a pas pu être chargée.'
    )
  }

  return ((data ?? []) as unknown as RawRow[]).map(toPayment)
}
