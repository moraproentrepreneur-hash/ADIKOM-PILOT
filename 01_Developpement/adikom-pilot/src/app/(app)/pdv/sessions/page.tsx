import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Denied } from '@/components/ui/figure'
import { ExportButton } from '@/components/ui/export-button'
import { Field, Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import {
  SESSION_STATUS_LABELS,
  SESSION_STATUS_ORDER,
  SESSION_STATUS_TONES,
  VARIANCE_TONES,
  describeVariance,
  formatDuration,
  parseSessionWindow,
  readVariance,
} from '@/features/pos/constants'
import {
  SESSION_PAGE_SIZE,
  getMyOpenSession,
  listCashierOptions,
  listOpenableRegisters,
  listRegisterOptions,
  listSessions,
  loadVariances,
  type PosSession,
} from '@/features/pos/data'
import { OpenSessionBanner } from '@/features/pos/open-session-banner'
import { OpenSessionPanel } from '@/features/pos/panels'

export const metadata: Metadata = { title: 'Sessions de caisse' }

/**
 * Sessions de caisse — LOT 27, Module 12 §4 à §6.
 *
 * « QUI ÉTAIT EN CAISSE LE J ENTRE 10H00 ET 11H30 ? » : un jour et une plage
 * horaire suffisent. La question est posée à la base, qui répond par
 * recouvrement d'intervalles.
 *
 * 🟥 VOIR UNE SESSION N'EST PAS VOIR SES MONTANTS (B-13). Pour chaque ligne, la
 * colonne des montants dit ce que la base a rendu : les montants, ou « non
 * visibles » — jamais 0.
 */
export default async function SessionsPage(props: PageProps<'/pdv/sessions'>) {
  const user = await requirePermissionOrRedirect(PERMISSIONS.POS_SESSIONS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const input = { day: read('jour'), from: read('de'), to: read('a') }
  const window = parseSessionWindow(input)
  const filters = {
    window,
    registerId: read('caisse'),
    cashierId: read('caissier'),
    status: read('statut'),
  }

  const [canOpen, canExport, canSeeAllAmounts, canSeeRegisters, canSeeAccounts] = await Promise.all([
    can(PERMISSIONS.POS_SESSIONS_OPEN),
    can(PERMISSIONS.POS_SESSIONS_EXPORT),
    can(PERMISSIONS.POS_SESSION_AMOUNTS_VIEW),
    can(PERMISSIONS.POS_REGISTERS_VIEW),
    can(PERMISSIONS.ACCOUNTS_VIEW),
  ])

  const [{ sessions, truncated }, registerOptions, cashierOptions, myOpen] = await Promise.all([
    window.kind === 'invalid'
      ? Promise.resolve({ sessions: [] as PosSession[], truncated: false })
      : listSessions(filters),
    canSeeRegisters ? listRegisterOptions() : Promise.resolve([]),
    listCashierOptions(),
    canOpen ? getMyOpenSession(user.id) : Promise.resolve(null),
  ])

  const variances = await loadVariances(sessions)

  const openMissing = [
    ...(canSeeRegisters ? [] : [PERMISSIONS.POS_REGISTERS_VIEW]),
    ...(canSeeAccounts ? [] : [PERMISSIONS.ACCOUNTS_VIEW]),
  ]
  const openable = canOpen && !myOpen && openMissing.length === 0 ? await listOpenableRegisters() : []

  const hasFilters = Boolean(
    input.day || input.from || input.to || filters.registerId || filters.cashierId || filters.status
  )
  const exportFilters: Record<string, string> = {
    jour: input.day,
    de: input.from,
    a: input.to,
    caisse: filters.registerId,
    caissier: filters.cashierId,
    statut: filters.status,
  }

  return (
    <>
      <OpenSessionBanner />

      <PageHeader
        title="Sessions de caisse"
        description="Qui a tenu quelle caisse, de quand à quand. Les montants restent gardés."
        actions={canExport && <ExportButton module="sessions-caisse" filters={exportFilters} />}
      />

      {canOpen && !myOpen && (
        <Card title="Ouvrir une session" description="La session s’ouvre à votre nom." className="mb-5">
          {openMissing.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">
                Ouvrir une session suppose de consulter la caisse et de vérifier son compte adossé.
              </p>
              <Denied missing={openMissing} />
            </div>
          ) : (
            <OpenSessionPanel registers={openable} />
          )}
        </Card>
      )}

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Jour" name="jour">
              <Input name="jour" type="date" defaultValue={input.day} />
            </Field>
            <Field label="De" name="de">
              <Input name="de" type="time" defaultValue={input.from} />
            </Field>
            <Field label="À" name="a">
              <Input name="a" type="time" defaultValue={input.to} />
            </Field>
            <Field label="Caisse" name="caisse">
              <Select name="caisse" defaultValue={filters.registerId} disabled={!canSeeRegisters}>
                <option value="">Toutes les caisses</option>
                {registerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Caissier" name="caissier">
              <Select name="caissier" defaultValue={filters.cashierId}>
                <option value="">Tous les caissiers</option>
                {cashierOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Statut" name="statut">
              <Select name="statut" defaultValue={filters.status}>
                <option value="">Tous</option>
                {SESSION_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {SESSION_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              <Search className="size-4" aria-hidden />
              Rechercher
            </button>
            {hasFilters && (
              <p className="text-xs text-muted">
                {sessions.length} session{sessions.length > 1 ? 's' : ''}
                {window.kind === 'window' ? ` en caisse ${window.label}` : ''} ·{' '}
                <Link href="/pdv/sessions" className="text-adikom-500 hover:underline">
                  Réinitialiser
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      {window.kind === 'invalid' && (
        <Notice tone="error" className="mb-5">
          {window.message}
        </Notice>
      )}
      {window.kind === 'window' && (
        <Notice tone="info" className="mb-5">
          Sessions <strong>en caisse {window.label}</strong> (heure des Comores) : toute session
          ouverte avant la fin de la plage et non close avant son début. Une session close à
          l’instant exact du début, ou ouverte à l’instant exact de la fin, n’y figure pas.
        </Notice>
      )}
      {!canSeeAllAmounts && (
        <Notice tone="info" className="mb-5">
          Vous voyez les montants de <strong>vos</strong> sessions seulement. Ceux des autres
          caissiers relèvent d’une capacité distincte.
        </Notice>
      )}
      {truncated && (
        <Notice tone="warning" className="mb-5">
          Seules les {SESSION_PAGE_SIZE} sessions les plus récentes sont affichées : précisez un
          jour, une caisse ou un caissier.
        </Notice>
      )}

      <Card className="overflow-hidden">
        {sessions.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={hasFilters ? 'Aucune session ne correspond' : 'Aucune session de caisse'}
            description={
              hasFilters
                ? 'Personne n’était en caisse sur cette période, ou les filtres sont trop restrictifs.'
                : 'Les sessions apparaîtront ici dès la première ouverture de caisse.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/pdv/sessions" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="-mx-5 -my-4 hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-adikom-50 text-left">
                    <th className="px-5 py-3 font-medium text-ink">Session</th>
                    <th className="px-5 py-3 font-medium text-ink">Caisse</th>
                    <th className="px-5 py-3 font-medium text-ink">Caissier</th>
                    <th className="px-5 py-3 font-medium text-ink">Ouverture</th>
                    <th className="px-5 py-3 font-medium text-ink">Clôture</th>
                    <th className="px-5 py-3 font-medium text-ink">Montants</th>
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr
                      key={session.id}
                      className="border-b border-line align-top transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/pdv/sessions/${session.id}`}
                          className="font-medium text-adikom-500 tabular hover:underline"
                        >
                          {session.sessionNo}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted">{session.registerLabel}</td>
                      <td className="px-5 py-3 text-muted">{session.cashierLabel}</td>
                      <td className="px-5 py-3 text-muted tabular">{formatDateTime(session.openedAt)}</td>
                      <td className="px-5 py-3 text-muted tabular">
                        {session.closedAt ? formatDateTime(session.closedAt) : 'En cours'}
                        <span className="block text-xs">
                          {formatDuration(session.openedAt, session.closedAt)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <AmountsCell session={session} variance={variances.get(session.id) ?? null} />
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={SESSION_STATUS_TONES[session.status]}>
                          {SESSION_STATUS_LABELS[session.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {sessions.map((session) => (
                <li key={session.id}>
                  <Link
                    href={`/pdv/sessions/${session.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink tabular">{session.sessionNo}</p>
                        <p className="truncate text-xs text-muted">
                          {session.registerLabel} · {session.cashierLabel}
                        </p>
                      </div>
                      <Badge tone={SESSION_STATUS_TONES[session.status]}>
                        {SESSION_STATUS_LABELS[session.status]}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted tabular">
                      {formatDateTime(session.openedAt)} →{' '}
                      {session.closedAt ? formatDateTime(session.closedAt) : 'en cours'} (
                      {formatDuration(session.openedAt, session.closedAt)})
                    </p>
                    <div className="mt-2">
                      <AmountsCell session={session} variance={variances.get(session.id) ?? null} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  )
}

function AmountsCell({ session, variance }: { session: PosSession; variance: number | null }) {
  if (!session.amounts) {
    return <span className="text-xs italic text-muted">Non visibles</span>
  }
  const reading = readVariance(variance, true, session.status)
  return (
    <div className="space-y-1 text-xs">
      <p className="text-muted">
        Fond <span className="text-ink tabular">{formatAmount(session.amounts.openingFloat)}</span>
        {session.amounts.countedAmount !== null && (
          <>
            {' '}
            · Compté{' '}
            <span className="text-ink tabular">{formatAmount(session.amounts.countedAmount)}</span>
          </>
        )}
      </p>
      {session.status === 'CLOSED' && (
        <Badge tone={VARIANCE_TONES[reading.kind]}>{describeVariance(reading)}</Badge>
      )}
    </div>
  )
}
