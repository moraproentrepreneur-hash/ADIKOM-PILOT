import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { MiscPaymentCategory, MiscPaymentStatus } from './constants'

/**
 * Accès aux paiements divers — Module 07 §43 à §46, LOT 17.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données. `billing.misc_payments.view` gouverne
 * cette table ; le libellé du compte source relève, lui, de
 * `treasury.accounts.view` — la ressource embarquée revient `null` sans cette
 * capacité, et l'écran le DIT plutôt que de laisser une case vide (DEC-017).
 */

export type MiscPayment = {
  id: string
  paymentNo: string
  accountId: string
  /** `null` sans `treasury.accounts.view`. */
  accountLabel: string | null
  amount: number
  paidOn: string
  category: MiscPaymentCategory
  beneficiary: string
  purpose: string
  externalRef: string | null
  notes: string | null
  status: MiscPaymentStatus
  statusReason: string | null
  validatedAt: string | null
  cancelledAt: string | null
  createdAt: string
}

const SELECT = `
  id, payment_no, account_id, amount, paid_on, category, beneficiary, purpose,
  external_ref, notes, status, status_reason, validated_at, cancelled_at, created_at,
  financial_accounts ( label, account_no )
`

type RawMiscPayment = {
  id: string
  payment_no: string
  account_id: string
  amount: number
  paid_on: string
  category: MiscPaymentCategory
  beneficiary: string
  purpose: string
  external_ref: string | null
  notes: string | null
  status: MiscPaymentStatus
  status_reason: string | null
  validated_at: string | null
  cancelled_at: string | null
  created_at: string
  financial_accounts?: { label: string; account_no: string } | null
}

function toMiscPayment(row: RawMiscPayment): MiscPayment {
  return {
    id: row.id,
    paymentNo: row.payment_no,
    accountId: row.account_id,
    accountLabel: row.financial_accounts
      ? `${row.financial_accounts.label} (${row.financial_accounts.account_no})`
      : null,
    amount: row.amount,
    paidOn: row.paid_on,
    category: row.category,
    beneficiary: row.beneficiary,
    purpose: row.purpose,
    externalRef: row.external_ref,
    notes: row.notes,
    status: row.status,
    statusReason: row.status_reason,
    validatedAt: row.validated_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  }
}

export type MiscPaymentFilters = {
  search?: string
  accountId?: string
  category?: string
  status?: string
  from?: string
  to?: string
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export async function listMiscPayments(
  filters: MiscPaymentFilters
): Promise<MiscPayment[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('misc_payments').select(SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(
      `payment_no.ilike.%${search}%,beneficiary.ilike.%${search}%,purpose.ilike.%${search}%,external_ref.ilike.%${search}%`
    )
  }
  if (filters.accountId) query = query.eq('account_id', filters.accountId)
  if (filters.category) query = query.eq('category', filters.category)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.from) query = query.gte('paid_on', filters.from)
  if (filters.to) query = query.lte('paid_on', filters.to)

  const { data, error } = await query
    .order('paid_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    reportQueryFailure(
      'paiements divers',
      error,
      'La liste des paiements divers n’a pas pu être chargée.'
    )
  }

  return ((data ?? []) as unknown as RawMiscPayment[]).map(toMiscPayment)
}

export async function getMiscPayment(id: string): Promise<MiscPayment | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('misc_payments')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('paiement divers', error, 'Ce paiement n’a pas pu être chargé.')
  }
  if (!data) return null

  return toMiscPayment(data as unknown as RawMiscPayment)
}
