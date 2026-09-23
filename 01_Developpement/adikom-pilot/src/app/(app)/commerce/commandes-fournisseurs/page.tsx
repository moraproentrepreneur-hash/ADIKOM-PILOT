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
import { listPurchaseOrders, type PurchaseOrderStatus } from '@/features/purchasing/data'
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_STATUS_TONES,
} from '@/features/purchasing/constants'
import { listSupplierFilters } from '@/features/supplier-invoices/data'

export const metadata: Metadata = { title: 'Commandes fournisseurs' }

const STATUS_ORDER: PurchaseOrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'DELIVERED',
  'INVOICED',
  'CANCELLED',
]

/**
 * Répertoire des commandes fournisseurs — LOT 26.
 *
 * 🟥 CET ÉCRAN EST UNE LISTE D'ENGAGEMENTS DE DÉPENSE.
 * `commerce.purchase_orders.view` garde les prix convenus avec chaque
 * fournisseur ; elle est marquée sensible au catalogue.
 */
export default async function PurchaseOrdersPage(
  props: PageProps<'/commerce/commandes-fournisseurs'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.PURCHASE_ORDERS_VIEW)

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
    can(PERMISSIONS.PURCHASE_ORDERS_CREATE),
    can(PERMISSIONS.PURCHASE_ORDERS_EXPORT),
  ])

  const [orders, suppliers] = await Promise.all([
    listPurchaseOrders({
      search: filters.search,
      status: (filters.status || undefined) as PurchaseOrderStatus | undefined,
      supplierId: filters.supplierId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    listSupplierFilters(),
  ])

  const hasFilters = Boolean(
    filters.search || filters.status || filters.supplierId || filters.from || filters.to
  )

  return (
    <>
      <PageHeader
        title="Commandes fournisseurs"
        description="Ce qu’ADIKOM commande à ses fournisseurs. Le prix de chaque ligne est celui qui a été convenu."
        actions={
          <>
            {canExport && (
              <ExportButton
                module="commandes-fournisseurs"
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
              <ButtonLink href="/commerce/commandes-fournisseurs/nouvelle" icon={Plus}>
                Créer une commande
              </ButtonLink>
            )}
          </>
        }
      />

      <Notice tone="info" className="mb-5">
        Une commande fournisseur <strong>n’engage aucun décaissement</strong> : elle constate un
        engagement. La dette n’est reconnue qu’à la <strong>validation de la facture reçue</strong>,
        et la trésorerie ne bouge qu’au règlement.
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
                placeholder="Numéro de commande…"
                aria-label="Rechercher une commande fournisseur"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {PURCHASE_ORDER_STATUS_LABELS[status]}
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
                {orders.length} résultat{orders.length > 1 ? 's' : ''} ·{' '}
                <Link
                  href="/commerce/commandes-fournisseurs"
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
        {orders.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title={hasFilters ? 'Aucune commande ne correspond' : 'Aucune commande fournisseur'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Une commande naît d’une offre retenue, ou se crée directement lorsqu’ADIKOM commande sans avoir demandé d’offre.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/commerce/commandes-fournisseurs" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/commerce/commandes-fournisseurs/nouvelle" icon={Plus}>
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
                    <th className="px-5 py-3 font-medium text-ink">Fournisseur</th>
                    <th className="px-5 py-3 font-medium text-ink">Réception attendue</th>
                    <th className="px-5 py-3 font-medium text-ink">Offre d’origine</th>
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
                          href={`/commerce/commandes-fournisseurs/${order.id}`}
                          className="font-medium text-adikom-500 hover:underline tabular"
                        >
                          {order.orderNo}
                        </Link>
                        <span className="block text-xs text-muted">
                          {formatDate(order.orderDate)} · {order.lineCount} ligne
                          {order.lineCount > 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {order.supplierLabel ?? (
                          <span className="text-xs italic">Non communiqué</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {order.expectedDate ? (
                          formatDate(order.expectedDate)
                        ) : (
                          <span className="text-xs italic">Non précisée</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {order.quoteId === null ? (
                          <span className="text-xs italic">Commande directe</span>
                        ) : order.quoteNo ? (
                          order.quoteNo
                        ) : (
                          <span className="text-xs italic">Non communiquée</span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-medium text-ink tabular">
                        {formatAmount(order.total)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={PURCHASE_ORDER_STATUS_TONES[order.status]}>
                          {PURCHASE_ORDER_STATUS_LABELS[order.status]}
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
                    href={`/commerce/commandes-fournisseurs/${order.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink tabular">
                          {formatAmount(order.total)}
                        </p>
                        <p className="truncate text-xs text-muted tabular">
                          {order.orderNo} · {formatDate(order.orderDate)}
                        </p>
                      </div>
                      <Badge tone={PURCHASE_ORDER_STATUS_TONES[order.status]}>
                        {PURCHASE_ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>{order.supplierLabel ?? 'Fournisseur non communiqué'}</dd>
                      <dd>
                        {order.lineCount} ligne{order.lineCount > 1 ? 's' : ''}
                      </dd>
                      {order.quoteNo && <dd>Offre d’origine : {order.quoteNo}</dd>}
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
