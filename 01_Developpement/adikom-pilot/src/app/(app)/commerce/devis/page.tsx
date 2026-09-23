import type { Metadata } from 'next'
import Link from 'next/link'
import { FileText, Plus, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { ExportButton } from '@/components/ui/export-button'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, todayISO } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { listSalesQuotes, type QuoteStatus } from '@/features/commerce/data'
import {
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONES,
  quoteIsExpired,
} from '@/features/commerce/constants'
import { listClientFilters } from '@/features/customer-invoices/data'

export const metadata: Metadata = { title: 'Devis clients' }

const STATUS_ORDER: QuoteStatus[] = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REFUSED',
  'CONVERTED',
  'CANCELLED',
]

/**
 * Répertoire des devis clients — LOT 25, DEC-049.
 *
 * LA PÉREMPTION EST DÉRIVÉE, JAMAIS ÉCRITE.
 *
 * Décision B-7 : le projet n'a aucun ordonnanceur, et un statut « expiré »
 * inscrit en base mentirait entre deux passages. Un devis émis dont la validité
 * est dépassée est donc SIGNALÉ ici, à la lecture, sans que son statut change —
 * exactement comme « En retard » pour une facture.
 */
export default async function SalesQuotesPage(props: PageProps<'/commerce/devis'>) {
  await requirePermissionOrRedirect(PERMISSIONS.SALES_QUOTES_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut'),
    clientId: read('client'),
    from: read('du'),
    to: read('au'),
  }

  const [canCreate, canExport] = await Promise.all([
    can(PERMISSIONS.SALES_QUOTES_CREATE),
    can(PERMISSIONS.SALES_QUOTES_EXPORT),
  ])

  const [quotes, clients] = await Promise.all([
    listSalesQuotes({
      search: filters.search,
      status: (filters.status || undefined) as QuoteStatus | undefined,
      clientId: filters.clientId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    listClientFilters(),
  ])

  const today = todayISO()
  const hasFilters = Boolean(
    filters.search || filters.status || filters.clientId || filters.from || filters.to
  )

  return (
    <>
      <PageHeader
        title="Devis clients"
        description="Propositions commerciales d’ADIKOM. Le prix de chaque ligne est figé à la date du devis."
        actions={
          <>
            {canExport && (
              <ExportButton
                module="devis-clients"
                filters={{
                  q: filters.search,
                  statut: filters.status,
                  client: filters.clientId,
                  du: filters.from,
                  au: filters.to,
                }}
              />
            )}
            {canCreate && (
              <ButtonLink href="/commerce/devis/nouveau" icon={Plus}>
                Créer un devis
              </ButtonLink>
            )}
          </>
        }
      />

      <Notice tone="info" className="mb-5">
        Un devis <strong>n’engage aucune créance</strong>. Une fois émis, ses lignes et ses prix
        sont figés ; accepté, il peut devenir une commande — et il est alors{' '}
        <strong>conservé tel quel</strong>.
      </Notice>

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative lg:col-span-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                name="q"
                type="search"
                defaultValue={filters.search}
                placeholder="Numéro de devis…"
                aria-label="Rechercher un devis"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {QUOTE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>

            <Select name="client" defaultValue={filters.clientId} aria-label="Filtrer par client">
              <option value="">Tous les clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </Select>

            <Input name="du" type="date" defaultValue={filters.from} aria-label="Depuis le" />
            <Input name="au" type="date" defaultValue={filters.to} aria-label="Jusqu’au" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              Filtrer
            </button>

            {hasFilters && (
              <p className="text-xs text-muted">
                {quotes.length} résultat{quotes.length > 1 ? 's' : ''} ·{' '}
                <Link href="/commerce/devis" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {quotes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={hasFilters ? 'Aucun devis ne correspond' : 'Aucun devis client'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Un devis se prépare pour un client, à partir des prestations du catalogue ou de lignes libres.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/commerce/devis" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/commerce/devis/nouveau" icon={Plus}>
                  Créer un devis
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
                    <th className="px-5 py-3 font-medium text-ink">Devis</th>
                    <th className="px-5 py-3 font-medium text-ink">Client</th>
                    <th className="px-5 py-3 font-medium text-ink">Validité</th>
                    <th className="px-5 py-3 font-medium text-ink">Lignes</th>
                    <th className="px-5 py-3 font-medium text-ink">Total</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => {
                    const expired = quoteIsExpired(quote.status, quote.validUntil, today)

                    return (
                      <tr
                        key={quote.id}
                        className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/commerce/devis/${quote.id}`}
                            className="font-medium text-adikom-500 hover:underline tabular"
                          >
                            {quote.quoteNo}
                          </Link>
                          <span className="block text-xs text-muted">
                            {formatDate(quote.quoteDate)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted">
                          {quote.clientLabel ?? (
                            <span className="text-xs italic">Non communiqué</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted tabular">
                          {quote.validUntil ? (
                            <>
                              {formatDate(quote.validUntil)}
                              {expired && (
                                <span className="block text-xs font-medium text-warning-700">
                                  Validité dépassée
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs italic">Non précisée</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted tabular">{quote.lineCount}</td>
                        <td className="px-5 py-3 font-medium text-ink tabular">
                          {formatAmount(quote.total)}
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={QUOTE_STATUS_TONES[quote.status]}>
                            {QUOTE_STATUS_LABELS[quote.status]}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {quotes.map((quote) => {
                const expired = quoteIsExpired(quote.status, quote.validUntil, today)

                return (
                  <li key={quote.id}>
                    <Link
                      href={`/commerce/devis/${quote.id}`}
                      className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink tabular">
                            {formatAmount(quote.total)}
                          </p>
                          <p className="truncate text-xs text-muted tabular">
                            {quote.quoteNo} · {formatDate(quote.quoteDate)}
                          </p>
                        </div>
                        <Badge tone={QUOTE_STATUS_TONES[quote.status]}>
                          {QUOTE_STATUS_LABELS[quote.status]}
                        </Badge>
                      </div>
                      <dl className="mt-3 space-y-1 text-xs text-muted">
                        <dd>{quote.clientLabel ?? 'Client non communiqué'}</dd>
                        <dd>
                          {quote.lineCount} ligne{quote.lineCount > 1 ? 's' : ''}
                        </dd>
                        {expired && (
                          <dd className="font-medium text-warning-700">Validité dépassée</dd>
                        )}
                      </dl>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>
    </>
  )
}
