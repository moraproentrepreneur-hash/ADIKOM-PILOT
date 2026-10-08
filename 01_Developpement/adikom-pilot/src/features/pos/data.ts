import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import { fromLocalInput } from '@/lib/dates'
import {
  UNREADABLE_CASHIER,
  UNREADABLE_REGISTER,
  type PosSessionStatus,
  type SessionWindow,
} from './constants'

/**
 * Accès aux données du point de vente — LOT 27 (Module 12).
 *
 * Toutes les lectures passent par le client porteur de la session : RLS reste
 * la barrière, et ce fichier n'ouvre rien qu'elle fermerait.
 *
 * 🟥 LES MONTANTS SONT LUS DANS LEUR TABLE SŒUR (T-1), et RLS décide LIGNE PAR
 * LIGNE : `pos.sessions.amounts.view`, ou être le caissier de la session (B-13).
 * Une session dont les montants ne reviennent pas porte donc `amounts: null` —
 * et l'écran dit « non visible », jamais « 0 KMF » (DEC-017).
 *
 * Le théorique et l'écart ne sont JAMAIS calculés ici : la base les dérive
 * (D1), et le LOT 28 enrichira le théorique sans que ce fichier change.
 *
 * Les libellés liés — caisse, caissier — se lisent sous leur propre policy. Un
 * lecteur des sessions qui n'a ni `pos.registers.view` ni `users.users.view`
 * reçoit l'aveu « non lisible », jamais un tiret qui se lirait « personne ».
 */

export type Option = { id: string; label: string; description?: string }

export type PosRegister = {
  id: string
  registerNo: string
  label: string
  accountId: string
  /** `null` sans `treasury.accounts.view`. */
  accountLabel: string | null
  accountNo: string | null
  accountActive: boolean | null
  location: string | null
  isActive: boolean
  statusReason: string | null
  statusChangedAt: string | null
  createdAt: string
  /** La session en cours, si `pos.sessions.view` permet de la lire. */
  openSession: { id: string; sessionNo: string; cashierLabel: string; openedAt: string } | null
}

export type SessionAmounts = {
  openingFloat: number
  countedAmount: number | null
}

export type PosSession = {
  id: string
  sessionNo: string
  registerId: string
  registerLabel: string
  registerNo: string | null
  cashierId: string
  cashierLabel: string
  status: PosSessionStatus
  openedAt: string
  closedAt: string | null
  closedByLabel: string | null
  closingNote: string | null
  /** `null` : non lisibles avec les droits de l'appelant (B-13). */
  amounts: SessionAmounts | null
}

export type PosSessionDetail = PosSession & {
  /** Dérivés EN BASE (D1). `null` si non lisibles, ou session ouverte pour l'écart. */
  expected: number | null
  variance: number | null
}

/* -------------------------------------------------------------------------- */
/*  Libellés liés                                                              */
/* -------------------------------------------------------------------------- */

async function loadUserLabels(ids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return labels

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('app_users')
    .select('id, first_name, last_name')
    .in('id', unique)

  if (error) {
    reportQueryFailure('pdv:utilisateurs', error, 'Les caissiers n’ont pas pu être chargés.')
  }

  for (const row of (data ?? []) as { id: string; first_name: string; last_name: string }[]) {
    labels.set(row.id, `${row.first_name} ${row.last_name}`.trim())
  }
  return labels
}

type RawRegisterRef = { id: string; register_no: string; label: string }

async function loadRegisterRefs(ids: string[]): Promise<Map<string, RawRegisterRef>> {
  const refs = new Map<string, RawRegisterRef>()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return refs

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('pos_registers')
    .select('id, register_no, label')
    .in('id', unique)

  if (error) {
    reportQueryFailure('pdv:caisses liées', error, 'Les caisses n’ont pas pu être chargées.')
  }
  for (const row of (data ?? []) as RawRegisterRef[]) refs.set(row.id, row)
  return refs
}

/**
 * Montants visibles, par session.
 *
 * RLS rend exactement les lignes autorisées : celles des sessions de
 * l'appelant, ou toutes avec `pos.sessions.amounts.view`. Une absence ici n'est
 * donc JAMAIS « zéro ».
 */
async function loadAmounts(sessionIds: string[]): Promise<Map<string, SessionAmounts>> {
  const amounts = new Map<string, SessionAmounts>()
  if (sessionIds.length === 0) return amounts

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('pos_session_amounts')
    .select('session_id, opening_float, counted_amount')
    .in('session_id', sessionIds)

  if (error) {
    reportQueryFailure('pdv:montants', error, 'Les montants des sessions n’ont pas pu être chargés.')
  }

  for (const row of (data ?? []) as {
    session_id: string
    opening_float: number
    counted_amount: number | null
  }[]) {
    amounts.set(row.session_id, {
      openingFloat: Number(row.opening_float),
      countedAmount: row.counted_amount === null ? null : Number(row.counted_amount),
    })
  }
  return amounts
}

/* -------------------------------------------------------------------------- */
/*  Caisses                                                                    */
/* -------------------------------------------------------------------------- */

const REGISTER_SELECT = `
  id, register_no, label, account_id, location, is_active,
  status_reason, status_changed_at, created_at
`

type RawRegister = {
  id: string
  register_no: string
  label: string
  account_id: string
  location: string | null
  is_active: boolean
  status_reason: string | null
  status_changed_at: string | null
  created_at: string
}

async function enrichRegisters(
  rows: RawRegister[],
  options: { canSeeSessions: boolean }
): Promise<PosRegister[]> {
  if (rows.length === 0) return []
  const supabase = await createSupabaseServerClient()

  // Le compte adossé se lit sous SA policy (`treasury.accounts.view`).
  const { data: accounts, error: accountsError } = await supabase
    .from('financial_accounts')
    .select('id, label, account_no, status')
    .in('id', [...new Set(rows.map((row) => row.account_id))])

  if (accountsError) {
    reportQueryFailure('pdv:comptes adossés', accountsError, 'Les comptes adossés n’ont pas pu être chargés.')
  }

  const accountById = new Map(
    ((accounts ?? []) as { id: string; label: string; account_no: string; status: string }[]).map(
      (account) => [account.id, account]
    )
  )

  const openByRegister = new Map<string, { id: string; session_no: string; cashier_id: string; opened_at: string }>()
  if (options.canSeeSessions) {
    const { data: open, error: openError } = await supabase
      .from('pos_sessions')
      .select('id, session_no, register_id, cashier_id, opened_at')
      .eq('status', 'OPEN')
      .in('register_id', rows.map((row) => row.id))

    if (openError) {
      reportQueryFailure('pdv:sessions ouvertes', openError, 'Les sessions en cours n’ont pas pu être chargées.')
    }
    for (const session of (open ?? []) as {
      id: string
      session_no: string
      register_id: string
      cashier_id: string
      opened_at: string
    }[]) {
      openByRegister.set(session.register_id, session)
    }
  }

  const cashiers = await loadUserLabels([...openByRegister.values()].map((s) => s.cashier_id))

  return rows.map((row) => {
    const account = accountById.get(row.account_id)
    const open = openByRegister.get(row.id)
    return {
      id: row.id,
      registerNo: row.register_no,
      label: row.label,
      accountId: row.account_id,
      accountLabel: account?.label ?? null,
      accountNo: account?.account_no ?? null,
      accountActive: account ? account.status === 'ACTIVE' : null,
      location: row.location,
      isActive: row.is_active,
      statusReason: row.status_reason,
      statusChangedAt: row.status_changed_at,
      createdAt: row.created_at,
      openSession: open
        ? {
            id: open.id,
            sessionNo: open.session_no,
            cashierLabel: cashiers.get(open.cashier_id) ?? UNREADABLE_CASHIER,
            openedAt: open.opened_at,
          }
        : null,
    }
  })
}

export async function listRegisters(
  filters: { search?: string; active?: string },
  options: { canSeeSessions: boolean }
): Promise<PosRegister[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('pos_registers').select(REGISTER_SELECT).order('label')

  if (filters.active === 'oui') query = query.eq('is_active', true)
  if (filters.active === 'non') query = query.eq('is_active', false)

  const search = filters.search?.trim()
  if (search) {
    // Les caractères qui structurent le filtre PostgREST sont neutralisés.
    const safe = search.replace(/[%,()*]/g, ' ')
    query = query.or(`label.ilike.%${safe}%,register_no.ilike.%${safe}%,location.ilike.%${safe}%`)
  }

  const { data, error } = await query
  if (error) reportQueryFailure('pdv:caisses', error, 'Les caisses n’ont pas pu être chargées.')

  return enrichRegisters((data ?? []) as RawRegister[], options)
}

export async function getRegister(
  id: string,
  options: { canSeeSessions: boolean }
): Promise<PosRegister | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('pos_registers')
    .select(REGISTER_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) reportQueryFailure('pdv:caisse', error, 'La caisse n’a pas pu être chargée.')
  if (!data) return null

  const [register] = await enrichRegisters([data as RawRegister], options)
  return register
}

/** Caisses ACTIVES proposées à l'ouverture d'une session. */
export async function listOpenableRegisters(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('pos_registers')
    .select('id, register_no, label, location')
    .eq('is_active', true)
    .order('label')

  if (error) reportQueryFailure('pdv:caisses actives', error, 'Les caisses n’ont pas pu être chargées.')

  return ((data ?? []) as { id: string; register_no: string; label: string; location: string | null }[]).map(
    (row) => ({
      id: row.id,
      label: row.label,
      description: [row.register_no, row.location].filter(Boolean).join(' · '),
    })
  )
}

/** Toutes les caisses lisibles — pour le filtre des sessions. */
export async function listRegisterOptions(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('pos_registers')
    .select('id, register_no, label')
    .order('label')

  if (error) reportQueryFailure('pdv:filtre caisses', error, 'Les caisses n’ont pas pu être chargées.')
  return ((data ?? []) as RawRegisterRef[]).map((row) => ({
    id: row.id,
    label: `${row.label} (${row.register_no})`,
  }))
}

/**
 * Comptes proposés pour adosser une caisse : de type Caisse, ACTIFS.
 *
 * Le compte courant d'une caisse est ajouté même s'il ne l'est plus, pour que
 * le formulaire de modification ne le perde pas en silence — la base refusera
 * de toute façon un compte inactif à la RÉACTIVATION ou au CHANGEMENT.
 */
export async function listCashAccountOptions(currentAccountId?: string): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('id, account_no, label, status')
    .eq('kind', 'CASH')
    .order('label')

  if (error) reportQueryFailure('pdv:comptes de caisse', error, 'Les comptes de caisse n’ont pas pu être chargés.')

  return ((data ?? []) as { id: string; account_no: string; label: string; status: string }[])
    .filter((row) => row.status === 'ACTIVE' || row.id === currentAccountId)
    .map((row) => ({
      id: row.id,
      label: row.label,
      description: row.status === 'ACTIVE' ? row.account_no : `${row.account_no} · inactif`,
    }))
}

/* -------------------------------------------------------------------------- */
/*  Sessions                                                                   */
/* -------------------------------------------------------------------------- */

const SESSION_SELECT = `
  id, session_no, register_id, cashier_id, status, opened_at, closed_at,
  closed_by, closing_note
`

type RawSession = {
  id: string
  session_no: string
  register_id: string
  cashier_id: string
  status: PosSessionStatus
  opened_at: string
  closed_at: string | null
  closed_by: string | null
  closing_note: string | null
}

async function enrichSessions(rows: RawSession[]): Promise<PosSession[]> {
  if (rows.length === 0) return []

  const [registers, users, amounts] = await Promise.all([
    loadRegisterRefs(rows.map((row) => row.register_id)),
    loadUserLabels(rows.flatMap((row) => [row.cashier_id, row.closed_by ?? ''])),
    loadAmounts(rows.map((row) => row.id)),
  ])

  return rows.map((row) => {
    const register = registers.get(row.register_id)
    return {
      id: row.id,
      sessionNo: row.session_no,
      registerId: row.register_id,
      registerLabel: register?.label ?? UNREADABLE_REGISTER,
      registerNo: register?.register_no ?? null,
      cashierId: row.cashier_id,
      cashierLabel: users.get(row.cashier_id) ?? UNREADABLE_CASHIER,
      status: row.status,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      closedByLabel: row.closed_by ? (users.get(row.closed_by) ?? UNREADABLE_CASHIER) : null,
      closingNote: row.closing_note,
      amounts: amounts.get(row.id) ?? null,
    }
  })
}

export type SessionFilters = {
  window: SessionWindow
  registerId?: string
  cashierId?: string
  status?: string
}

/** Une page de sessions : la liste est bornée, et l'écran le dit. */
export const SESSION_PAGE_SIZE = 100

/**
 * Sessions, filtrées.
 *
 * Avec une fenêtre, la question « qui était en caisse ? » est posée À LA BASE
 * (`pos_sessions_in_window`) : recouvrement de `[ouverture, clôture)` et de la
 * fenêtre, servi par l'index GiST. Sans fenêtre, les plus récentes d'abord.
 */
export async function listSessions(
  filters: SessionFilters
): Promise<{ sessions: PosSession[]; truncated: boolean }> {
  const supabase = await createSupabaseServerClient()
  let rows: RawSession[]

  if (filters.window.kind === 'window') {
    const from = fromLocalInput(filters.window.fromLocal)
    const to = fromLocalInput(filters.window.toLocal)
    if (!from || !to) return { sessions: [], truncated: false }

    const { data, error } = await supabase.rpc('pos_sessions_in_window', {
      p_from: from,
      p_to: to,
      p_register_id: filters.registerId || null,
      p_cashier_id: filters.cashierId || null,
    })
    if (error) reportQueryFailure('pdv:fenêtre', error, 'Les sessions de cette période n’ont pas pu être chargées.')

    rows = ((data ?? []) as RawSession[]).filter(
      (row) => !filters.status || row.status === filters.status
    )
  } else {
    let query = supabase
      .from('pos_sessions')
      .select(SESSION_SELECT)
      .order('opened_at', { ascending: false })
      .limit(SESSION_PAGE_SIZE + 1)

    if (filters.registerId) query = query.eq('register_id', filters.registerId)
    if (filters.cashierId) query = query.eq('cashier_id', filters.cashierId)
    if (filters.status === 'OPEN' || filters.status === 'CLOSED') query = query.eq('status', filters.status)

    const { data, error } = await query
    if (error) reportQueryFailure('pdv:sessions', error, 'Les sessions n’ont pas pu être chargées.')
    rows = (data ?? []) as RawSession[]
  }

  const truncated = rows.length > SESSION_PAGE_SIZE
  return { sessions: await enrichSessions(rows.slice(0, SESSION_PAGE_SIZE)), truncated }
}

/**
 * Écarts des sessions closes dont les montants sont visibles — dérivés EN BASE.
 *
 * Un appel par session : la règle (fond + espèces au LOT 28) vit en base, et ne
 * se recopie pas en TypeScript. La liste est bornée à une page.
 */
export async function loadVariances(sessions: PosSession[]): Promise<Map<string, number | null>> {
  const variances = new Map<string, number | null>()
  const eligible = sessions.filter((s) => s.status === 'CLOSED' && s.amounts !== null)
  if (eligible.length === 0) return variances

  const supabase = await createSupabaseServerClient()
  const results = await Promise.all(
    eligible.map((s) => supabase.rpc('pos_session_variance', { p_session_id: s.id }))
  )

  results.forEach((result, index) => {
    if (result.error) {
      reportQueryFailure('pdv:écart', result.error, 'L’écart des sessions n’a pas pu être calculé.')
    }
    variances.set(eligible[index].id, result.data === null ? null : Number(result.data))
  })
  return variances
}

export async function getSession(id: string): Promise<PosSessionDetail | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('pos_sessions')
    .select(SESSION_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) reportQueryFailure('pdv:session', error, 'La session n’a pas pu être chargée.')
  if (!data) return null

  const [session] = await enrichSessions([data as RawSession])

  if (!session.amounts) return { ...session, expected: null, variance: null }

  const [expected, variance] = await Promise.all([
    supabase.rpc('pos_session_expected', { p_session_id: id }),
    supabase.rpc('pos_session_variance', { p_session_id: id }),
  ])
  if (expected.error) reportQueryFailure('pdv:théorique', expected.error, 'Le montant théorique n’a pas pu être calculé.')
  if (variance.error) reportQueryFailure('pdv:écart', variance.error, 'L’écart n’a pas pu être calculé.')

  return {
    ...session,
    expected: expected.data === null ? null : Number(expected.data),
    variance: variance.data === null ? null : Number(variance.data),
  }
}

/** La session ouverte de l'utilisateur connecté — pour le bandeau. */
export async function getMyOpenSession(userId: string): Promise<PosSession | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('pos_sessions')
    .select(SESSION_SELECT)
    .eq('cashier_id', userId)
    .eq('status', 'OPEN')
    .maybeSingle()

  if (error) reportQueryFailure('pdv:ma session', error, 'Votre session en cours n’a pas pu être chargée.')
  if (!data) return null

  const [session] = await enrichSessions([data as RawSession])
  return session
}

/** Les dernières sessions d'une caisse — pour sa fiche. */
export async function listRegisterSessions(registerId: string, limit = 10): Promise<PosSession[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('pos_sessions')
    .select(SESSION_SELECT)
    .eq('register_id', registerId)
    .order('opened_at', { ascending: false })
    .limit(limit)

  if (error) reportQueryFailure('pdv:sessions de la caisse', error, 'Les sessions de cette caisse n’ont pas pu être chargées.')
  return enrichSessions((data ?? []) as RawSession[])
}

/**
 * Caissiers proposés au filtre : ceux qui ont tenu une session récente, et dont
 * le nom est lisible. Un caissier illisible reste filtrable par sa caisse.
 */
export async function listCashierOptions(): Promise<Option[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('pos_sessions')
    .select('cashier_id')
    .order('opened_at', { ascending: false })
    .limit(500)

  if (error) reportQueryFailure('pdv:filtre caissiers', error, 'Les caissiers n’ont pas pu être chargés.')

  const ids = [...new Set(((data ?? []) as { cashier_id: string }[]).map((row) => row.cashier_id))]
  const labels = await loadUserLabels(ids)

  return [...labels.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}
