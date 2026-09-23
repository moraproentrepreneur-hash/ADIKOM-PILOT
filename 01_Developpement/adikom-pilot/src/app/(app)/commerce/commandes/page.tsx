import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Search, ShoppingCart } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { ExportButton } from '@/components/ui/export-button'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { listSalesOrders, type OrderStatus } from '@/features/commerce/data'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '@/features/commerce/constants'
import { listClientFilters } from '@/features/customer-invoices/data'

export const metadata: Metadata = { title: 'Commandes clients' }

const STATUS_ORDER: OrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'DELIVERED',
  'INVOICED',
  'CANCELLED',
]

/**
 * Répertoire des commandes clients — LOT 25, DEC-049.
 *
 * LA COLONNE « DEVIS D'ORIGINE » PEUT ÊTRE VIDE POUR DEUX RAISONS.
 *
 * Soit la commande a été créée directement — le Plan 01 §15.2 rend l'origine
 * facultative —, soit le lecteur n'a pas `commerce.sales_quotes.view` et RLS
 * ne lui rend pas le devis. Les deux cas sont DISTINGUÉS à l'écran : confondre
 * « pas de devis » et « devis invisible » serait exactement ce que DEC-017
 * interdit.
 */
export default async function SalesOrdersPage(props: PageProps<'/commerce/commandes'>) {
  await requirePermissionOrRedirect(PERMISSIONS.SALES_ORDERS_VIEW)

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

  const [canCreate, canExport, canSeeQuotes] = await Promise.all([
    can(PERMISSIONS.SALES_ORDERS_CREATE),
    can(PERMISSIONS.SALES_ORDERS_EXPORT),
    can(PERMISSIONS.SALES_QUOTES_VIEW),
  ])

  const [orders, clients] = await Promise.all([
    listSalesOrders({
      search: filters.search,
      status: (filters.status || undefined) as OrderStatus | undefined,
      clientId: filters.clientId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    listClientFilters(),
  ])

  const hasFilters = Boolean(
    filters.search || filters.status || filters.clientId || filters.from || filters.to
  )

  return (
    <>
      <PageHeader
        title="Commandes clients"
        description="Engagements pris par les clients d’ADIKOM. Une commande confirmée alimente la facturation client existante."
        actions={
          <>
            {canExport && (
              <ExportButton
                module="commandes-clients"
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
              <ButtonLink href="/commerce/commandes/nouvelle" icon={Plus}>
                Créer une commande
              </ButtonLink>
            )}
          </>
        }
      />

      <Notice tone="info" className="mb-5">
        Une commande <strong>n’est pas une facture</strong> et n’appelle aucun règlement. Facturée,
        elle produit une facture client ordinaire — même numérotation, même émission, mêmes
        règlements, même trésorerie.
      </Notice>

      {!canSeeQuotes && (
        <Notice tone="warning" className="mb-5">
          Votre compte ne peut pas consulter les devis clients : l’origine des commandes qui en
          sont issues reste inconnue de cet écran.
        </Notice>
      )}

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
                placeholder="Numéro de commande…"
                aria-label="Rechercher une commande"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
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
                {orders.length} résultat{orders.length > 1 ? 's' : ''} ·{' '}
                <Link href="/commerce/commandes" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {orders.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title={hasFilters ? 'Aucune commande ne correspond' : 'Aucune commande client'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Une commande naît d’un devis accepté, ou se crée directement lorsque le client commande sans proposition préalable.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/commerce/commandes" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/commerce/commandes/nouvelle" icon={Plus}>
                  Créer une commande
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
                    <th className="px-5 py-3 font-medium text-ink">Commande</th>
                    <th className="px-5 py-3 font-medium text-ink">Client</th>
                    <th className="px-5 py-3 font-medium text-ink">Devis d’origine</th>
                    <th className="px-5 py-3 font-medium text-ink">Livraison attendue</th>
                    <th className="px-5 py-3 font-medium text-ink">Lignes</th>
                    <th className="px-5 py-3 font-medium text-ink">Total</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/commerce/commandes/${order.id}`}
                          className="font-medium text-adikom-500 hover:underline tabular"
                        >
                          {order.orderNo}
                        </Link>
                        <span className="block text-xs text-muted">
                          {formatDate(order.orderDate)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {order.clientLabel ?? <span className="text-xs italic">Non communiqué</span>}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {order.quoteId === null ? (
                          <span className="text-xs italic">Création directe</span>
                        ) : order.quoteNo ? (
                          <Link
                            href={`/commerce/devis/${order.quoteId}`}
                            className="text-adikom-500 hover:underline"
                          >
                            {order.quoteNo}
                          </Link>
                        ) : (
                          <span className="text-xs italic">Non lisible</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDate(order.expectedDate) ?? (
                          <span className="text-xs italic">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">{order.lineCount}</td>
                      <td className="px-5 py-3 font-medium text-ink tabular">
                        {formatAmount(order.total)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={ORDER_STATUS_TONES[order.status]}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/commerce/commandes/${order.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink tabular">{formatAmount(order.total)}</p>
                        <p className="truncate text-xs text-muted tabular">
                          {order.orderNo} · {formatDate(order.orderDate)}
                        </p>
                      </div>
                      <Badge tone={ORDER_STATUS_TONES[order.status]}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>{order.clientLabel ?? 'Client non communiqué'}</dd>
                      <dd>
                        {order.quoteId === null
                          ? 'Création directe'
                          : (order.quoteNo ?? 'Devis non lisible')}
                      </dd>
                      <dd>
                        {order.lineCount} ligne{order.lineCount > 1 ? 's' : ''}
                      </dd>
                    </dl>
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
