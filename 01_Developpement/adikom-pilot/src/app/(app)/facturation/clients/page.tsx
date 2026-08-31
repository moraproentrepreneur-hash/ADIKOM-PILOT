import type { Metadata } from 'next'
import Link from 'next/link'
import { FileText, Plus, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { ExportButton } from '@/components/ui/export-button'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/dates'
import { listClientFilters, listCustomerInvoices } from '@/features/customer-invoices/data'
import {
  CUSTOMER_INVOICE_STATUS_LABELS,
  CUSTOMER_INVOICE_STATUS_ORDER,
  CUSTOMER_INVOICE_STATUS_TONES,
  displayStatus,
  formatAmount,
} from '@/features/customer-invoices/constants'

export const metadata: Metadata = { title: 'Factures clients' }

/**
 * Répertoire des factures clients — Étape 2.5, LOT 7.
 *
 * LES TROIS MONTANTS, SÉPARÉS (Workflow 07 §23).
 *
 * Sous-total, réductions et total sont affichés distinctement : une réduction
 * doit être identifiable, jamais fondue dans un prix (§24).
 *
 * CE QUE CET ÉCRAN REFUSE D'AFFICHER.
 *
 * Un montant encaissé et un solde. Ils supposent des RÈGLEMENTS CLIENTS, qui
 * relèvent d'une étape ultérieure : afficher « 0 KMF encaissé » laisserait
 * croire que le système l'a vérifié. Il dit donc ce qu'il ne sait pas (DEC-017).
 */
export default async function CustomerInvoicesPage(props: PageProps<'/facturation/clients'>) {
  await requirePermissionOrRedirect(PERMISSIONS.CUSTOMER_INVOICES_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut'),
    clientId: read('client'),
    from: read('du'),
    to: read('au'),
    unpaid: read('impayees') === '1',
  }

  const [canCreate, canExport] = await Promise.all([
    can(PERMISSIONS.CUSTOMER_INVOICES_CREATE),
    can(PERMISSIONS.CUSTOMER_INVOICES_EXPORT),
  ])

  const [invoices, clients] = await Promise.all([
    listCustomerInvoices(filters),
    listClientFilters(),
  ])

  const hasFilters =
    Boolean(filters.search || filters.status || filters.clientId || filters.from || filters.to) ||
    filters.unpaid

  return (
    <>
      <PageHeader
        title="Factures clients"
        description="Créances d’ADIKOM sur ses clients. Sous-total, réductions et total restent séparés."
        actions={
          <>
            {canExport && (
              <ExportButton
                module="factures-clients"
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
              <ButtonLink href="/facturation/clients/nouvelle" icon={Plus}>
                Préparer une facture
              </ButtonLink>
            )}
          </>
        }
      />

      <Notice tone="info" className="mb-5">
        Une facture <strong>émise</strong> reconnaît une créance et fige ses montants. Les{' '}
        <strong>encaissements</strong> ne sont pas encore gérés : aucune facture n’est donc
        affichée « payée », et le solde n’est pas calculé.
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
                placeholder="Numéro de facture…"
                aria-label="Rechercher une facture"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {CUSTOMER_INVOICE_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {CUSTOMER_INVOICE_STATUS_LABELS[status]}
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

          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="impayees"
                value="1"
                defaultChecked={filters.unpaid}
                className="size-4 rounded border-line text-adikom-500"
              />
              Émises, non soldées
            </label>
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
                {invoices.length} résultat{invoices.length > 1 ? 's' : ''} ·{' '}
                <Link href="/facturation/clients" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={hasFilters ? 'Aucune facture ne correspond' : 'Aucune facture client'}
            description={
              filters.status === 'PAID' || filters.status === 'PARTIALLY_PAID'
                ? 'Les encaissements clients ne sont pas encore gérés : aucune facture ne peut être dite payée.'
                : hasFilters
                  ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                  : 'Une facture se prépare depuis une location « À facturer », ou pour une prestation isolée.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/facturation/clients" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/facturation/clients/nouvelle" icon={Plus}>
                  Préparer une facture
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
                    <th className="px-5 py-3 font-medium text-ink">Facture</th>
                    <th className="px-5 py-3 font-medium text-ink">Client</th>
                    <th className="px-5 py-3 font-medium text-ink">Location</th>
                    <th className="px-5 py-3 font-medium text-ink">Échéance</th>
                    <th className="px-5 py-3 font-medium text-ink">Sous-total</th>
                    <th className="px-5 py-3 font-medium text-ink">Réductions</th>
                    <th className="px-5 py-3 font-medium text-ink">Total</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const shown = displayStatus(
                      invoice.status,
                      invoice.dueDate,
                      invoice.total,
                      invoice.paidAmount
                    )

                    return (
                      <tr
                        key={invoice.id}
                        className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/facturation/clients/${invoice.id}`}
                            className="font-medium text-adikom-500 hover:underline tabular"
                          >
                            {invoice.invoiceNo}
                          </Link>
                          <span className="block text-xs text-muted">
                            {formatDate(invoice.invoiceDate)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted">
                          {invoice.clientLabel ?? (
                            <span className="text-xs italic">Non communiqué</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted tabular">
                          {invoice.rentalId === null ? (
                            <span className="text-xs italic">Services</span>
                          ) : invoice.rentalNo ? (
                            <Link
                              href={`/location/locations/${invoice.rentalId}`}
                              className="text-adikom-500 hover:underline"
                            >
                              {invoice.rentalNo}
                            </Link>
                          ) : (
                            <span className="text-xs italic">Non lisible</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted tabular">
                          {formatDate(invoice.dueDate) ?? <span className="text-xs italic">—</span>}
                        </td>
                        <td className="px-5 py-3 text-muted tabular">
                          {formatAmount(invoice.subtotal)}
                        </td>
                        <td className="px-5 py-3 text-muted tabular">
                          {invoice.discount > 0 ? (
                            `− ${formatAmount(invoice.discount)}`
                          ) : (
                            <span className="text-xs italic">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 font-medium text-ink tabular">
                          {formatAmount(invoice.total)}
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={CUSTOMER_INVOICE_STATUS_TONES[shown]}>
                            {CUSTOMER_INVOICE_STATUS_LABELS[shown]}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {invoices.map((invoice) => {
                const shown = displayStatus(
                  invoice.status,
                  invoice.dueDate,
                  invoice.total,
                  invoice.paidAmount
                )

                return (
                  <li key={invoice.id}>
                    <Link
                      href={`/facturation/clients/${invoice.id}`}
                      className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink tabular">
                            {formatAmount(invoice.total)}
                          </p>
                          <p className="truncate text-xs text-muted tabular">
                            {invoice.invoiceNo} · {formatDate(invoice.invoiceDate)}
                          </p>
                        </div>
                        <Badge tone={CUSTOMER_INVOICE_STATUS_TONES[shown]}>
                          {CUSTOMER_INVOICE_STATUS_LABELS[shown]}
                        </Badge>
                      </div>
                      <dl className="mt-3 space-y-1 text-xs text-muted">
                        <dd>{invoice.clientLabel ?? 'Client non communiqué'}</dd>
                        <dd>
                          {invoice.rentalId === null
                            ? 'Facture de services'
                            : (invoice.rentalNo ?? 'Location non lisible')}
                        </dd>
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
