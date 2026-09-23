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
import { listPurchaseQuotes, type PurchaseQuoteStatus } from '@/features/purchasing/data'
import {
  PURCHASE_QUOTE_STATUS_LABELS,
  PURCHASE_QUOTE_STATUS_TONES,
  purchaseQuoteIsExpired,
} from '@/features/purchasing/constants'
import { listSupplierFilters } from '@/features/supplier-invoices/data'

export const metadata: Metadata = { title: 'Devis fournisseurs' }

const STATUS_ORDER: PurchaseQuoteStatus[] = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REFUSED',
  'CONVERTED',
  'CANCELLED',
]

/**
 * Répertoire des devis fournisseurs — LOT 26.
 *
 * 🟥 CET ÉCRAN EST UNE LISTE DE PRIX D'ACHAT. `commerce.purchase_quotes.view`
 * n'est pas une capacité de confort : c'est elle qui garde les coûts d'ADIKOM.
 * Elle est marquée sensible au catalogue, au même titre que
 * `catalog.services.cost.view`.
 *
 * LA PÉREMPTION EST DÉRIVÉE, JAMAIS ÉCRITE (B-7) : le projet n'a aucun
 * ordonnanceur. Une offre reçue dont la validité est dépassée est SIGNALÉE ici,
 * à la lecture, sans que son statut change.
 */
export default async function PurchaseQuotesPage(
  props: PageProps<'/commerce/devis-fournisseurs'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.PURCHASE_QUOTES_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut'),
    supplierId: read('fournisseur'),
    from: read('du'),
    to: read('au'),
  }

  const [canCreate, canExport] = await Promise.all([
    can(PERMISSIONS.PURCHASE_QUOTES_CREATE),
    can(PERMISSIONS.PURCHASE_QUOTES_EXPORT),
  ])

  const [quotes, suppliers] = await Promise.all([
    listPurchaseQuotes({
      search: filters.search,
      status: (filters.status || undefined) as PurchaseQuoteStatus | undefined,
      supplierId: filters.supplierId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    listSupplierFilters(),
  ])

  const today = todayISO()
  const hasFilters = Boolean(
    filters.search || filters.status || filters.supplierId || filters.from || filters.to
  )

  return (
    <>
      <PageHeader
        title="Devis fournisseurs"
        description="Offres reçues des fournisseurs. Le prix de chaque ligne est celui que le fournisseur a proposé."
        actions={
          <>
            {canExport && (
              <ExportButton
                module="devis-fournisseurs"
                filters={{
                  q: filters.search,
                  statut: filters.status,
                  fournisseur: filters.supplierId,
                  du: filters.from,
                  au: filters.to,
                }}
              />
            )}
            {canCreate && (
              <ButtonLink href="/commerce/devis-fournisseurs/nouveau" icon={Plus}>
                Enregistrer une offre
              </ButtonLink>
            )}
          </>
        }
      />

      <Notice tone="info" className="mb-5">
        Un devis fournisseur est une <strong>offre reçue</strong>, enregistrée telle qu’elle a été
        remise. Il n’engage aucune dépense. Une fois enregistré, ses lignes et ses prix sont figés ;
        retenu, il peut devenir une commande — et il est alors{' '}
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
                placeholder="Numéro ADIKOM ou référence du fournisseur…"
                aria-label="Rechercher un devis fournisseur"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {PURCHASE_QUOTE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>

            <Select
              name="fournisseur"
              defaultValue={filters.supplierId}
              aria-label="Filtrer par fournisseur"
            >
              <option value="">Tous les fournisseurs</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.label}
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
                <Link
                  href="/commerce/devis-fournisseurs"
                  className="text-adikom-500 hover:underline"
                >
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
            title={hasFilters ? 'Aucune offre ne correspond' : 'Aucun devis fournisseur'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Une offre reçue s’enregistre pour un fournisseur, à partir des prestations du catalogue ou de lignes libres.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/commerce/devis-fournisseurs" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/commerce/devis-fournisseurs/nouveau" icon={Plus}>
                  Enregistrer une offre
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
                    <th className="px-5 py-3 font-medium text-ink">Offre</th>
                    <th className="px-5 py-3 font-medium text-ink">Fournisseur</th>
                    <th className="px-5 py-3 font-medium text-ink">Validité</th>
                    <th className="px-5 py-3 font-medium text-ink">Lignes</th>
                    <th className="px-5 py-3 font-medium text-ink">Total</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => {
                    const expired = purchaseQuoteIsExpired(quote.status, quote.validUntil, today)

                    return (
                      <tr
                        key={quote.id}
                        className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/commerce/devis-fournisseurs/${quote.id}`}
                            className="font-medium text-adikom-500 hover:underline tabular"
                          >
                            {quote.quoteNo}
                          </Link>
                          <span className="block text-xs text-muted">
                            {formatDate(quote.quoteDate)}
                            {quote.externalRef ? ` · ${quote.externalRef}` : ''}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted">
                          {quote.supplierLabel ?? (
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
                          <Badge tone={PURCHASE_QUOTE_STATUS_TONES[quote.status]}>
                            {PURCHASE_QUOTE_STATUS_LABELS[quote.status]}
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
                const expired = purchaseQuoteIsExpired(quote.status, quote.validUntil, today)

                return (
                  <li key={quote.id}>
                    <Link
                      href={`/commerce/devis-fournisseurs/${quote.id}`}
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
                        <Badge tone={PURCHASE_QUOTE_STATUS_TONES[quote.status]}>
                          {PURCHASE_QUOTE_STATUS_LABELS[quote.status]}
                        </Badge>
                      </div>
                      <dl className="mt-3 space-y-1 text-xs text-muted">
                        <dd>{quote.supplierLabel ?? 'Fournisseur non communiqué'}</dd>
                        {quote.externalRef && <dd>Réf. fournisseur : {quote.externalRef}</dd>}
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
