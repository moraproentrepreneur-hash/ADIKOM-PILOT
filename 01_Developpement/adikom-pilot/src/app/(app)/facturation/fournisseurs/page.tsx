import type { Metadata } from 'next'
import Link from 'next/link'
import { FileText, Plus, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { ExportButton } from '@/components/ui/export-button'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { Tabs } from '@/components/ui/tabs'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/dates'
import { listSupplierFilters, listSupplierInvoices } from '@/features/supplier-invoices/data'
import { loadBillingTabs } from '@/features/billing-analytics/data'
import { resolveAnalyticsPeriod } from '@/features/billing-analytics/period'
import {
  displayStatus,
  formatAmount,
  SUPPLIER_INVOICE_STATUS_LABELS,
  SUPPLIER_INVOICE_STATUS_ORDER,
  SUPPLIER_INVOICE_STATUS_TONES,
} from '@/features/supplier-invoices/constants'

export const metadata: Metadata = { title: 'Factures fournisseurs' }

/**
 * Répertoire des factures fournisseurs — Étape 2.5, LOTs 5 et 6.
 *
 * LES CINQ MONTANTS, SÉPARÉS (Module 07 §32, §57).
 *
 * Brut, imputé, net à payer, réglé et reste dû sont affichés distinctement :
 * « Ne mélange jamais facture, règlement, imputation, paiement et solde »
 * (CLAUDE.md §57).
 *
 * Chaque somme suit SA capacité. Sans `billing.imputations.view`, le net n'est
 * pas calculable ; sans `billing.supplier_payments.view`, le reste dû ne l'est
 * pas non plus. Les colonnes le DISENT — elles n'affichent jamais un zéro qui
 * se lirait « rien à payer » (DEC-017, DEC-024).
 */
export default async function SupplierInvoicesPage(
  props: PageProps<'/facturation/fournisseurs'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.SUPPLIER_INVOICES_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut'),
    supplierId: read('fournisseur'),
    from: read('du'),
    to: read('au'),
    unpaid: read('impayees') === '1',
    withImputation: read('imputees') === '1',
  }

  const [canCreate, canExport, canSeeImputations, canSeePayments] = await Promise.all([
    can(PERMISSIONS.SUPPLIER_INVOICES_CREATE),
    can(PERMISSIONS.SUPPLIER_INVOICES_EXPORT),
    can(PERMISSIONS.IMPUTATIONS_VIEW),
    can(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW),
  ])

  const [invoices, suppliers, tabs] = await Promise.all([
    listSupplierInvoices(filters, { canSeeImputations, canSeePayments }),
    listSupplierFilters(),
    loadBillingTabs('fournisseurs', resolveAnalyticsPeriod(undefined, undefined, undefined)),
  ])

  const hasFilters =
    Boolean(filters.search || filters.status || filters.supplierId || filters.from || filters.to) ||
    filters.unpaid ||
    filters.withImputation

  return (
    <>
      <PageHeader
        title="Factures fournisseurs"
        description="Factures reçues des fournisseurs. Le montant brut, les imputations et le net à payer restent séparés."
        actions={
          <>
            {canExport && (
              <ExportButton
                module="factures-fournisseurs"
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
              <ButtonLink href="/facturation/fournisseurs/nouvelle" icon={Plus}>
                Enregistrer une facture
              </ButtonLink>
            )}
          </>
        }
      />

      {/* Un seul onglet ne se dessine pas : il n'y a rien entre quoi choisir. */}
      {tabs.length > 1 && (
        <Tabs items={tabs} current="liste" label="Sous-menus des factures fournisseurs" />
      )}

      <Notice tone="info" className="mb-5">
        Une facture validée reconnaît une <strong>dette</strong>. Une <strong>imputation</strong>
        {' '}la réduit sans la payer ; un <strong>règlement</strong> la solde en débitant un compte.
        Les deux restent des opérations distinctes.
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
                aria-label="Rechercher une facture"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {SUPPLIER_INVOICE_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {SUPPLIER_INVOICE_STATUS_LABELS[status]}
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

          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="impayees"
                value="1"
                defaultChecked={filters.unpaid}
                className="size-4 rounded border-line text-adikom-500"
              />
              Reste dû non soldé
            </label>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="imputees"
                value="1"
                defaultChecked={filters.withImputation}
                className="size-4 rounded border-line text-adikom-500"
              />
              Portant une imputation
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
                <Link href="/facturation/fournisseurs" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      {!canSeeImputations && (
        <Notice tone="warning" className="mb-5">
          Votre compte ne peut pas consulter les imputations : le <strong>total imputé</strong> et
          le <strong>net à payer</strong> ne sont pas affichés. Ils ne sont pas nuls pour autant.
        </Notice>
      )}

      {!canSeePayments && (
        <Notice tone="warning" className="mb-5">
          Votre compte ne peut pas consulter les règlements : le <strong>reste dû</strong> n’est
          pas calculable, et une facture soldée ne se distingue pas ici d’une facture impayée.
        </Notice>
      )}

      <Card className="overflow-hidden">
        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={hasFilters ? 'Aucune facture ne correspond' : 'Aucune facture fournisseur'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Une facture s’enregistre à réception du document envoyé par le fournisseur.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/facturation/fournisseurs" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/facturation/fournisseurs/nouvelle" icon={Plus}>
                  Enregistrer une facture
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
                    <th className="px-5 py-3 font-medium text-ink">Fournisseur</th>
                    <th className="px-5 py-3 font-medium text-ink">Échéance</th>
                    <th className="px-5 py-3 font-medium text-ink">Montant brut</th>
                    <th className="px-5 py-3 font-medium text-ink">Imputé</th>
                    <th className="px-5 py-3 font-medium text-ink">Net à payer</th>
                    <th className="px-5 py-3 font-medium text-ink">Reste dû</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const shown = displayStatus(invoice.status, invoice.dueDate, invoice.netPayable, invoice.paidAmount)

                    return (
                      <tr
                        key={invoice.id}
                        className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/facturation/fournisseurs/${invoice.id}`}
                            className="font-medium text-adikom-500 hover:underline tabular"
                          >
                            {invoice.invoiceNo}
                          </Link>
                          <span className="block text-xs text-muted">
                            {formatDate(invoice.invoiceDate)}
                            {invoice.externalRef ? ` · ${invoice.externalRef}` : ''}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted">
                          {invoice.supplierLabel ?? (
                            <span className="text-xs italic">Non communiqué</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted tabular">
                          {formatDate(invoice.dueDate) ?? <span className="text-xs italic">—</span>}
                        </td>
                        <td className="px-5 py-3 font-medium text-ink tabular">
                          {formatAmount(invoice.grossAmount)}
                        </td>
                        <td className="px-5 py-3 text-muted tabular">
                          {invoice.imputedAmount === null ? (
                            <span className="text-xs italic">Non lisible</span>
                          ) : (
                            formatAmount(invoice.imputedAmount)
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted tabular">
                          {invoice.netPayable === null ? (
                            <span className="text-xs italic">Non calculable</span>
                          ) : (
                            formatAmount(invoice.netPayable)
                          )}
                        </td>
                        <td className="px-5 py-3 font-medium text-ink tabular">
                          {invoice.remainingDue === null ? (
                            <span className="text-xs font-normal italic text-muted">
                              Non calculable
                            </span>
                          ) : (
                            formatAmount(invoice.remainingDue)
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={SUPPLIER_INVOICE_STATUS_TONES[shown]}>
                            {SUPPLIER_INVOICE_STATUS_LABELS[shown]}
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
                const shown = displayStatus(invoice.status, invoice.dueDate, invoice.netPayable, invoice.paidAmount)

                return (
                  <li key={invoice.id}>
                    <Link
                      href={`/facturation/fournisseurs/${invoice.id}`}
                      className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink tabular">
                            {formatAmount(invoice.grossAmount)}
                          </p>
                          <p className="truncate text-xs text-muted tabular">
                            {invoice.invoiceNo} · {formatDate(invoice.invoiceDate)}
                          </p>
                        </div>
                        <Badge tone={SUPPLIER_INVOICE_STATUS_TONES[shown]}>
                          {SUPPLIER_INVOICE_STATUS_LABELS[shown]}
                        </Badge>
                      </div>
                      <dl className="mt-3 space-y-1 text-xs text-muted">
                        <dd>{invoice.supplierLabel ?? 'Fournisseur non communiqué'}</dd>
                        <dd>
                          {invoice.remainingDue === null
                            ? 'Reste dû non calculable avec vos droits'
                            : `Reste dû ${formatAmount(invoice.remainingDue)}`}
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
