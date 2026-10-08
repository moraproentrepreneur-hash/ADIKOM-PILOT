import type { Metadata } from 'next'
import Link from 'next/link'
import { Receipt, ScanLine, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { ExportButton } from '@/components/ui/export-button'
import { Field, Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { PAYMENT_METHOD_LABELS } from '@/features/treasury/constants'
import { OpenSessionBanner } from '@/features/pos/open-session-banner'
import {
  COUNTER_METHODS,
  COUNTER_METHOD_LABELS,
  SALE_PAGE_SIZE,
  SALE_STATUS_LABELS,
  SALE_STATUS_ORDER,
  SALE_STATUS_TONES,
} from '@/features/pos-sales/constants'
import { listRecentSessionOptions, listSales } from '@/features/pos-sales/data'

export const metadata: Metadata = { title: 'Ventes au comptoir' }

/**
 * Historique des ventes — LOT 28, Module 12 §22.1.
 *
 * Filtrable par jour, session, statut et mode. Le net et l'encaissé de chaque
 * ligne sont relus des faits stockés (DEC-051 §c) ; la fiche, elle, affiche les
 * montants calculés par la base.
 */
export default async function SalesPage(props: PageProps<'/pdv/ventes'>) {
  await requirePermissionOrRedirect(PERMISSIONS.POS_SALES_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) => (typeof searchParams[key] === 'string' ? (searchParams[key] as string) : '')

  const filters = { day: read('jour'), sessionId: read('session'), status: read('statut'), method: read('mode') }

  const [canExport, canSell, canSeeSessions] = await Promise.all([
    can(PERMISSIONS.POS_SALES_EXPORT),
    can(PERMISSIONS.POS_SALES_CREATE),
    can(PERMISSIONS.POS_SESSIONS_VIEW),
  ])

  const [{ sales, truncated }, sessionOptions] = await Promise.all([
    listSales(filters),
    canSeeSessions ? listRecentSessionOptions() : Promise.resolve([]),
  ])

  const hasFilters = Boolean(filters.day || filters.sessionId || filters.status || filters.method)
  const exportFilters: Record<string, string> = {
    jour: filters.day,
    session: filters.sessionId,
    statut: filters.status,
    mode: filters.method,
  }

  return (
    <>
      <OpenSessionBanner />

      <PageHeader
        title="Ventes au comptoir"
        description="Chaque vente, ses paiements et leur compte. Une vente erronée s’annule ; elle ne s’efface jamais."
        actions={
          <div className="flex flex-wrap gap-2">
            {canExport && <ExportButton module="ventes" filters={exportFilters} />}
            {canSell && (
              <ButtonLink href="/pdv/caisse" icon={ScanLine}>
                Caisse
              </ButtonLink>
            )}
          </div>
        }
      />

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Jour" name="jour">
              <Input name="jour" type="date" defaultValue={filters.day} />
            </Field>
            <Field label="Session" name="session">
              <Select name="session" defaultValue={filters.sessionId} disabled={!canSeeSessions}>
                <option value="">Toutes les sessions</option>
                {sessionOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Statut" name="statut">
              <Select name="statut" defaultValue={filters.status}>
                <option value="">Tous</option>
                {SALE_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {SALE_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mode de paiement" name="mode">
              <Select name="mode" defaultValue={filters.method}>
                <option value="">Tous les modes</option>
                {COUNTER_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {COUNTER_METHOD_LABELS[method]}
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
                {sales.length} vente{sales.length > 1 ? 's' : ''} ·{' '}
                <Link href="/pdv/ventes" className="text-adikom-500 hover:underline">
                  Réinitialiser
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      {truncated && (
        <Notice tone="warning" className="mb-5">
          Seules les {SALE_PAGE_SIZE} ventes les plus récentes sont affichées : précisez un jour ou une session.
        </Notice>
      )}

      <Card className="overflow-hidden">
        {sales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={hasFilters ? 'Aucune vente ne correspond' : 'Aucune vente au comptoir'}
            description={
              hasFilters
                ? 'Aucune vente sur ce jour ou cette session, ou les filtres sont trop restrictifs.'
                : 'Les ventes apparaîtront ici dès le premier encaissement.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/pdv/ventes" tone="secondary">
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
                    <th className="px-5 py-3 font-medium text-ink">Vente</th>
                    <th className="px-5 py-3 font-medium text-ink">Date</th>
                    <th className="px-5 py-3 font-medium text-ink">Caissier</th>
                    <th className="px-5 py-3 font-medium text-ink">Client</th>
                    <th className="px-5 py-3 font-medium text-ink">Modes</th>
                    <th className="px-5 py-3 text-right font-medium text-ink">Net</th>
                    <th className="px-5 py-3 text-right font-medium text-ink">Encaissé</th>
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-b border-line align-top last:border-b-0 hover:bg-adikom-50/60">
                      <td className="px-5 py-3">
                        <Link href={`/pdv/ventes/${sale.id}`} className="font-medium text-adikom-500 tabular hover:underline">
                          {sale.saleNo}
                        </Link>
                      </td>
                      <td className="px-5 py-3 tabular text-muted">{formatDateTime(sale.soldAt)}</td>
                      <td className="px-5 py-3">{sale.cashierLabel}</td>
                      <td className="px-5 py-3">{sale.clientLabel}</td>
                      <td className="px-5 py-3 text-muted">
                        {sale.methods.map((method) => PAYMENT_METHOD_LABELS[method]).join(', ') || '—'}
                      </td>
                      <td className="px-5 py-3 text-right tabular">{formatAmount(sale.net)}</td>
                      <td className="px-5 py-3 text-right tabular">{formatAmount(sale.paid)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={SALE_STATUS_TONES[sale.status]}>{SALE_STATUS_LABELS[sale.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sous 1024 px : des cartes, pas un tableau rétréci (CLAUDE.md §35). */}
            <ul className="divide-y divide-line lg:hidden">
              {sales.map((sale) => (
                <li key={sale.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/pdv/ventes/${sale.id}`} className="font-medium text-adikom-500 tabular hover:underline">
                      {sale.saleNo}
                    </Link>
                    <Badge tone={SALE_STATUS_TONES[sale.status]}>{SALE_STATUS_LABELS[sale.status]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {formatDateTime(sale.soldAt)} · {sale.cashierLabel}
                  </p>
                  <p className="text-xs text-muted">{sale.clientLabel}</p>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-muted">
                      {sale.methods.map((method) => PAYMENT_METHOD_LABELS[method]).join(', ') || 'Aucun paiement'}
                    </span>
                    <span className="tabular">
                      {formatAmount(sale.paid)} / {formatAmount(sale.net, { withCurrency: true })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  )
}
