import type { Metadata } from 'next'
import Link from 'next/link'
import { BarChart3, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import {
  listImputationSupplierFilters,
  listImputations,
} from '@/features/imputations/data'
import {
  formatAmount,
  IMPUTATION_STATUS_EFFECT,
  IMPUTATION_STATUS_LABELS,
  IMPUTATION_STATUS_ORDER,
  IMPUTATION_STATUS_TONES,
  isAwaitingInvoice,
} from '@/features/imputations/constants'

export const metadata: Metadata = { title: 'Imputations' }

/**
 * Répertoire des imputations fournisseurs — Étape 2.4, LOT 4.
 *
 * POURQUOI CETTE LISTE EXISTE.
 *
 * Règles permissions §36 sépare créer et valider : le valideur n'est pas le
 * créateur. Sans vue transversale, il devrait deviner sur quelle maintenance
 * ouvrir une fiche pour trouver ce qu'il doit contrôler. Le filtre « en
 * attente de facture » sert la même intention pour l'Étape 2.5.
 *
 * AUCUN MONTANT DÛ N'Y FIGURE.
 *
 * Ni net à payer, ni solde : DEC-013 réserve l'effet financier au statut
 * « Imputée », qui suppose une facture fournisseur. La colonne « Effet »
 * l'énonce, plutôt que de laisser croire à une déduction.
 */
export default async function ImputationsPage(props: PageProps<'/facturation/imputations'>) {
  await requirePermissionOrRedirect(PERMISSIONS.IMPUTATIONS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut'),
    supplierId: read('fournisseur'),
    awaitingInvoice: read('attente') === '1',
  }

  const [imputations, suppliers] = await Promise.all([
    listImputations(filters),
    listImputationSupplierFilters(),
  ])

  const hasFilters =
    Boolean(filters.search || filters.status || filters.supplierId) || filters.awaitingInvoice

  const awaiting = imputations.filter((imputation) =>
    isAwaitingInvoice(imputation.status, imputation.supplierInvoiceId)
  ).length

  return (
    <>
      <PageHeader
        title="Imputations fournisseurs"
        description="Part d’un coût de maintenance déduite du montant dû à un fournisseur. Une imputation n’est jamais un paiement."
      />

      <Notice tone="warning" className="mb-5">
        Une imputation ne réduit un montant dû qu’une fois <strong>rattachée à une facture
        fournisseur validée</strong> (DEC-013). Même alors, elle n’est <strong>pas un
        paiement</strong> : aucun compte n’est mouvementé.
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
                placeholder="Référence, justification…"
                aria-label="Rechercher une imputation"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {IMPUTATION_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {IMPUTATION_STATUS_LABELS[status]}
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
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="attente"
              value="1"
              defaultChecked={filters.awaitingInvoice}
              className="size-4 rounded border-line text-adikom-500"
            />
            En attente de facture fournisseur uniquement
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              Filtrer
            </button>

            {hasFilters && (
              <p className="text-xs text-muted">
                {imputations.length} résultat{imputations.length > 1 ? 's' : ''} ·{' '}
                <Link href="/facturation/imputations" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      {!hasFilters && awaiting > 0 && (
        <p className="mb-5 text-sm text-muted">
          <strong className="text-ink">{awaiting}</strong> imputation
          {awaiting > 1 ? 's' : ''} validée{awaiting > 1 ? 's' : ''} en attente de facture
          fournisseur.
        </p>
      )}

      <Card className="overflow-hidden">
        {imputations.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title={hasFilters ? 'Aucune imputation ne correspond' : 'Aucune imputation'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Une imputation se prépare depuis la maintenance concernée, une fois son montant imputable arrêté.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/facturation/imputations" tone="secondary">
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
                    <th className="px-5 py-3 font-medium text-ink">Imputation</th>
                    <th className="px-5 py-3 font-medium text-ink">Fournisseur</th>
                    <th className="px-5 py-3 font-medium text-ink">Maintenance</th>
                    <th className="px-5 py-3 font-medium text-ink">Montant</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                    <th className="px-5 py-3 font-medium text-ink">Effet financier</th>
                  </tr>
                </thead>
                <tbody>
                  {imputations.map((imputation) => (
                    <tr
                      key={imputation.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/facturation/imputations/${imputation.id}`}
                          className="font-medium text-adikom-500 hover:underline tabular"
                        >
                          {imputation.imputationNo}
                        </Link>
                        <span className="block text-xs text-muted">
                          {formatDateTime(imputation.createdAt)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {imputation.supplierLabel ?? (
                          <span className="text-xs italic">Non communiqué</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {imputation.maintenanceNo ? (
                          <>
                            <span className="block tabular text-xs">
                              {imputation.maintenanceNo}
                            </span>
                            <span className="block text-xs">{imputation.vehicleLabel}</span>
                          </>
                        ) : (
                          <span className="text-xs italic">Non communiquée</span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-medium text-ink tabular">
                        {formatAmount(imputation.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={IMPUTATION_STATUS_TONES[imputation.status]}>
                          {IMPUTATION_STATUS_LABELS[imputation.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted">
                        {isAwaitingInvoice(imputation.status, imputation.supplierInvoiceId)
                          ? 'En attente de facture — aucun montant dû réduit'
                          : IMPUTATION_STATUS_EFFECT[imputation.status]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {imputations.map((imputation) => (
                <li key={imputation.id}>
                  <Link
                    href={`/facturation/imputations/${imputation.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink tabular">
                          {formatAmount(imputation.amount)}
                        </p>
                        <p className="truncate text-xs text-muted tabular">
                          {imputation.imputationNo}
                        </p>
                      </div>
                      <Badge tone={IMPUTATION_STATUS_TONES[imputation.status]}>
                        {IMPUTATION_STATUS_LABELS[imputation.status]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>{imputation.supplierLabel ?? 'Fournisseur non communiqué'}</dd>
                      <dd>{imputation.maintenanceNo ?? 'Maintenance non communiquée'}</dd>
                      <dd>
                        {isAwaitingInvoice(imputation.status, imputation.supplierInvoiceId)
                          ? 'En attente de facture — aucun montant dû réduit'
                          : IMPUTATION_STATUS_EFFECT[imputation.status]}
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
