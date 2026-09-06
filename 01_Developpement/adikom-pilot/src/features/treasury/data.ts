import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type {
  FinancialAccountKind,
  FinancialAccountStatus,
  InternalTransferStatus,
  TreasuryDirection,
  TreasuryEntryKind,
  TreasuryEntryStatus,
} from './constants'

/**
 * Accès aux données de Banques & Caisses — Étape 2.5, LOT 6.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données.
 *
 * VOIR UN COMPTE N'EST PAS VOIR SON SOLDE.
 *
 * Le catalogue distingue `treasury.accounts.view` de `treasury.balances.view`
 * (DEC-024). Le solde est donc `null` sans la seconde — et l'écran le DIT,
 * plutôt que d'afficher « 0 KMF », qui se lirait « compte vide » (DEC-017).
 *
 * Le solde n'est stocké nulle part : Module 06 §17 le calcule du solde initial
 * et des écritures validées, et la fonction `financial_account_balance` le fait
 * en base, sous les droits de l'appelant. Elle exige pour cela
 * `treasury.entries.view` EN PLUS : une somme portant sur des écritures que
 * l'appelant ne peut pas lire renverrait le seul solde d'ouverture, sans le
 * dire (migration 050). L'appelant doit donc réunir les deux capacités avant
 * de demander un solde.
 */

export type FinancialAccount = {
  id: string
  accountNo: string
  kind: FinancialAccountKind
  label: string
  institution: string | null
  accountReference: string | null
  currencyCode: string
  openingBalance: number
  openedOn: string | null
  status: FinancialAccountStatus
  description: string | null
  statusReason: string | null
  createdAt: string
  updatedAt: string
  /** `null` sans `treasury.balances.view`. Jamais 0 par défaut (DEC-017). */
  balance: number | null
}

export type TreasuryEntry = {
  id: string
  accountId: string
  /** `null` sans `treasury.accounts.view` — l'écran le dit. */
  accountLabel: string | null
  entryDate: string
  direction: TreasuryDirection
  kind: TreasuryEntryKind
  amount: number
  description: string | null
  reference: string | null
  status: TreasuryEntryStatus
  supplierPaymentId: string | null
  internalTransferId: string | null
  miscPaymentId: string | null
  createdAt: string
}

const ACCOUNT_SELECT = `
  id, account_no, kind, label, institution, account_reference, currency_code,
  opening_balance, opened_on, status, description, status_reason,
  created_at, updated_at
`

type RawAccount = {
  id: string
  account_no: string
  kind: FinancialAccountKind
  label: string
  institution: string | null
  account_reference: string | null
  currency_code: string
  opening_balance: number
  opened_on: string | null
  status: FinancialAccountStatus
  description: string | null
  status_reason: string | null
  created_at: string
  updated_at: string
}

/**
 * Soldes d'un lot de comptes.
 *
 * Un appel par compte : la fonction en base vérifie la capacité et somme sous
 * RLS. Les listes de comptes d'ADIKOM se comptent en unités, non en milliers —
 * une requête par ligne y reste sans conséquence, et évite de recopier en
 * TypeScript une règle financière qui doit vivre en base (§17).
 */
async function loadBalances(
  ids: string[],
  canSeeBalances: boolean
): Promise<Map<string, number | null>> {
  const balances = new Map<string, number | null>()
  if (!canSeeBalances || ids.length === 0) return balances

  const supabase = await createSupabaseServerClient()

  const results = await Promise.all(
    ids.map((id) => supabase.rpc('financial_account_balance', { p_account_id: id }))
  )

  results.forEach((result, index) => {
    if (result.error) {
      reportQueryFailure(
        'solde de compte',
        result.error,
        'Le solde des comptes n’a pas pu être calculé.'
      )
    }
    balances.set(ids[index], (result.data as number | null) ?? null)
  })

  return balances
}

function toAccount(row: RawAccount, balance: number | null): FinancialAccount {
  return {
    id: row.id,
    accountNo: row.account_no,
    kind: row.kind,
    label: row.label,
    institution: row.institution,
    accountReference: row.account_reference,
    currencyCode: row.currency_code,
    openingBalance: row.opening_balance,
    openedOn: row.opened_on,
    status: row.status,
    description: row.description,
    statusReason: row.status_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    balance,
  }
}

export type AccountFilters = {
  search?: string
  kind?: string
  status?: string
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export async function listFinancialAccounts(
  filters: AccountFilters,
  options: { canSeeBalances: boolean }
): Promise<FinancialAccount[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('financial_accounts').select(ACCOUNT_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(
      `account_no.ilike.%${search}%,label.ilike.%${search}%,institution.ilike.%${search}%`
    )
  }
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.status) query = query.eq('status', filters.status)

  const { data, error } = await query.order('label').limit(200)

  if (error) {
    reportQueryFailure(
      'comptes financiers',
      error,
      'La liste des comptes n’a pas pu être chargée.'
    )
  }

  const rows = (data ?? []) as unknown as RawAccount[]
  const balances = await loadBalances(
    rows.map((row) => row.id),
    options.canSeeBalances
  )

  return rows.map((row) => toAccount(row, balances.get(row.id) ?? null))
}

export async function getFinancialAccount(
  id: string,
  options: { canSeeBalances: boolean }
): Promise<FinancialAccount | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('financial_accounts')
    .select(ACCOUNT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('compte financier', error, 'Ce compte n’a pas pu être chargé.')
  }
  if (!data) return null

  const row = data as unknown as RawAccount
  const balances = await loadBalances([row.id], options.canSeeBalances)

  return toAccount(row, balances.get(row.id) ?? null)
}

/**
 * Comptes proposables pour une nouvelle opération — Module 06 §10.
 *
 * Les comptes inactifs et archivés en sont exclus : leur historique reste
 * consultable, mais ils ne reçoivent plus rien.
 */
export async function listOperableAccounts(): Promise<FinancialAccount[]> {
  return listFinancialAccounts({ status: 'ACTIVE' }, { canSeeBalances: false })
}

export type EntryFilters = {
  accountId?: string
  direction?: string
  kind?: string
  status?: string
  from?: string
  to?: string
  /** Les deux moitiés d'un virement — Module 06 §32. */
  internalTransferId?: string
  /** L'écriture d'un paiement divers — Module 07 §45. */
  miscPaymentId?: string
}

export async function listTreasuryEntries(filters: EntryFilters): Promise<TreasuryEntry[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('treasury_entries')
    .select(
      `id, account_id, entry_date, direction, kind, amount, description, reference,
       status, supplier_payment_id, internal_transfer_id, misc_payment_id, created_at,
       financial_accounts ( label, account_no )`
    )

  if (filters.accountId) query = query.eq('account_id', filters.accountId)
  if (filters.direction) query = query.eq('direction', filters.direction)
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.from) query = query.gte('entry_date', filters.from)
  if (filters.to) query = query.lte('entry_date', filters.to)
  if (filters.internalTransferId) {
    query = query.eq('internal_transfer_id', filters.internalTransferId)
  }
  if (filters.miscPaymentId) query = query.eq('misc_payment_id', filters.miscPaymentId)

  const { data, error } = await query
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) {
    reportQueryFailure(
      'écritures',
      error,
      'La liste des écritures n’a pas pu être chargée.'
    )
  }

  const rows = (data ?? []) as unknown as (Omit<
    TreasuryEntry,
    'accountLabel' | 'supplierPaymentId' | 'internalTransferId' | 'miscPaymentId'
  > & {
    account_id: string
    entry_date: string
    supplier_payment_id: string | null
    internal_transfer_id: string | null
    misc_payment_id: string | null
    created_at: string
    financial_accounts?: { label: string; account_no: string } | null
  })[]

  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    // Ressource embarquée : RLS s'applique indépendamment. Sans
    // `treasury.accounts.view`, l'écriture reste lisible, pas son compte.
    accountLabel: row.financial_accounts
      ? `${row.financial_accounts.label} (${row.financial_accounts.account_no})`
      : null,
    entryDate: row.entry_date,
    direction: row.direction,
    kind: row.kind,
    amount: row.amount,
    description: row.description,
    reference: row.reference,
    status: row.status,
    supplierPaymentId: row.supplier_payment_id,
    internalTransferId: row.internal_transfer_id,
    miscPaymentId: row.misc_payment_id,
    createdAt: row.created_at,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Virements internes — Module 06 §28 à §33                                   */
/*                                                                             */
/*  LA LECTURE PORTE SA CAPACITÉ.                                              */
/*                                                                             */
/*  `treasury.transfers.view` gouverne cette table, et rien d'autre ne la      */
/*  gouverne : voir les écritures n'est pas voir les virements, dont un        */
/*  brouillon n'a produit aucune (DEC-024, DEC-040). Les libellés de comptes,  */
/*  eux, restent derrière `treasury.accounts.view` — la ressource embarquée    */
/*  revient `null` sans cette capacité, et l'écran le DIT (DEC-017).           */
/* -------------------------------------------------------------------------- */

export type InternalTransfer = {
  id: string
  transferNo: string
  sourceAccountId: string
  /** `null` sans `treasury.accounts.view` — l'écran le dit, il n'invente pas. */
  sourceAccountLabel: string | null
  destinationAccountId: string
  destinationAccountLabel: string | null
  amount: number
  currencyCode: string
  transferDate: string
  purpose: string | null
  reference: string | null
  notes: string | null
  status: InternalTransferStatus
  statusReason: string | null
  validatedAt: string | null
  cancelledAt: string | null
  createdAt: string
}

const TRANSFER_SELECT = `
  id, transfer_no, source_account_id, destination_account_id, amount, currency_code,
  transfer_date, purpose, reference, notes, status, status_reason,
  validated_at, cancelled_at, created_at,
  source:financial_accounts!internal_transfers_source_account_id_fkey ( label, account_no ),
  destination:financial_accounts!internal_transfers_destination_account_id_fkey ( label, account_no )
`

type RawTransfer = {
  id: string
  transfer_no: string
  source_account_id: string
  destination_account_id: string
  amount: number
  currency_code: string
  transfer_date: string
  purpose: string | null
  reference: string | null
  notes: string | null
  status: InternalTransferStatus
  status_reason: string | null
  validated_at: string | null
  cancelled_at: string | null
  created_at: string
  source?: { label: string; account_no: string } | null
  destination?: { label: string; account_no: string } | null
}

function accountLabel(row?: { label: string; account_no: string } | null): string | null {
  return row ? `${row.label} (${row.account_no})` : null
}

function toTransfer(row: RawTransfer): InternalTransfer {
  return {
    id: row.id,
    transferNo: row.transfer_no,
    sourceAccountId: row.source_account_id,
    sourceAccountLabel: accountLabel(row.source),
    destinationAccountId: row.destination_account_id,
    destinationAccountLabel: accountLabel(row.destination),
    amount: row.amount,
    currencyCode: row.currency_code,
    transferDate: row.transfer_date,
    purpose: row.purpose,
    reference: row.reference,
    notes: row.notes,
    status: row.status,
    statusReason: row.status_reason,
    validatedAt: row.validated_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  }
}

export type TransferFilters = {
  search?: string
  accountId?: string
  status?: string
  from?: string
  to?: string
}

export async function listInternalTransfers(
  filters: TransferFilters
): Promise<InternalTransfer[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('internal_transfers').select(TRANSFER_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(
      `transfer_no.ilike.%${search}%,purpose.ilike.%${search}%,reference.ilike.%${search}%`
    )
  }
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.from) query = query.gte('transfer_date', filters.from)
  if (filters.to) query = query.lte('transfer_date', filters.to)
  // Un compte est concerné par un virement qu'il en soit la source OU la
  // destination : filtrer sur la seule source masquerait la moitié des
  // mouvements de ce compte.
  if (filters.accountId) {
    query = query.or(
      `source_account_id.eq.${filters.accountId},destination_account_id.eq.${filters.accountId}`
    )
  }

  const { data, error } = await query
    .order('transfer_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    reportQueryFailure(
      'virements internes',
      error,
      'La liste des virements n’a pas pu être chargée.'
    )
  }

  return ((data ?? []) as unknown as RawTransfer[]).map(toTransfer)
}

export async function getInternalTransfer(id: string): Promise<InternalTransfer | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('internal_transfers')
    .select(TRANSFER_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('virement interne', error, 'Ce virement n’a pas pu être chargé.')
  }
  if (!data) return null

  return toTransfer(data as unknown as RawTransfer)
}
