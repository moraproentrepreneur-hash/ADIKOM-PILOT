import type { Metadata } from 'next'
import Link from 'next/link'
import { CarFront, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { ExportButton } from '@/components/ui/export-button'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { formatPrice } from '@/features/pricing/constants'
import {
  displayStatus,
  FILTERABLE_STATUSES,
  listRentals,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/rentals/data'

export const metadata: Metadata = { title: 'Locations' }

/**
 * Répertoire des locations.
 *
 * Une location naît d'une réservation confirmée : il n'y a pas de bouton
 * « Nouvelle location » ici. La conversion se fait depuis la réservation, seul
 * endroit où le tarif verrouillé et l'occupation existent déjà.
 */
export default async function RentalsPage(props: PageProps<'/location/locations'>) {
  await requirePermissionOrRedirect(PERMISSIONS.RENTALS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = { search: read('q'), status: read('statut') }

  const [rentals, canExport, canSeeAmounts] = await Promise.all([
    listRentals(filters),
    // DEC-024 : exporter est une capacite distincte de consulter.
    can(PERMISSIONS.RENTALS_EXPORT),
    // DEC-024 : voir une location ne donne pas accès à ses montants.
    can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Locations"
        description="Contrats en cours d’exécution, de la préparation à la facturation."
        actions={
          canExport ? (
            <ExportButton
              module="locations"
              filters={{ q: filters.search, statut: filters.status }}
            />
          ) : undefined
        }
      />

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
                placeholder="Identifiant, conditions…"
                aria-label="Rechercher une location"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par statut">
              <option value="">Tous les statuts</option>
              {FILTERABLE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </Select>

            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              Filtrer
            </button>
          </div>

          {hasFilters && (
            <p className="mt-3 text-xs text-muted">
              {rentals.length} résultat{rentals.length > 1 ? 's' : ''} ·{' '}
              <Link href="/location/locations" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      <Card className="overflow-hidden">
        {rentals.length === 0 ? (
          <EmptyState
            icon={CarFront}
            title={hasFilters ? 'Aucune location ne correspond' : 'Aucune location'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Une location naît d’une réservation confirmée, depuis sa fiche.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/location/locations" tone="secondary">
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
                    <th className="px-5 py-3 font-medium text-ink">Location</th>
                    <th className="px-5 py-3 font-medium text-ink">Client</th>
                    <th className="px-5 py-3 font-medium text-ink">Véhicule</th>
                    <th className="px-5 py-3 font-medium text-ink">Retour attendu</th>
                    {canSeeAmounts && <th className="px-5 py-3 font-medium text-ink">Tarif</th>}
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {rentals.map((rental) => {
                    const shown = displayStatus(rental.status, rental.expectedReturnAt)

                    return (
                      <tr
                        key={rental.id}
                        className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/location/locations/${rental.id}`}
                            className="font-medium text-adikom-500 hover:underline tabular"
                          >
                            {rental.rentalNo}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-muted">{rental.clientLabel}</td>
                        <td className="px-5 py-3 text-muted">{rental.vehicleLabel}</td>
                        <td className="px-5 py-3 text-muted">
                          {formatDateTime(rental.expectedReturnAt)}
                        </td>
                        {canSeeAmounts && (
                          <td className="px-5 py-3 text-muted tabular">
                            {formatPrice(rental.lockedAmount, rental.lockedUnit)}
                          </td>
                        )}
                        <td className="px-5 py-3">
                          <Badge tone={STATUS_TONES[shown]}>{STATUS_LABELS[shown]}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {rentals.map((rental) => {
                const shown = displayStatus(rental.status, rental.expectedReturnAt)

                return (
                  <li key={rental.id}>
                    <Link
                      href={`/location/locations/${rental.id}`}
                      className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{rental.clientLabel}</p>
                          <p className="truncate text-xs text-muted tabular">{rental.rentalNo}</p>
                        </div>
                        <Badge tone={STATUS_TONES[shown]}>{STATUS_LABELS[shown]}</Badge>
                      </div>
                      <dl className="mt-3 space-y-1 text-xs text-muted">
                        <dd>{rental.vehicleLabel}</dd>
                        <dd>Retour attendu : {formatDateTime(rental.expectedReturnAt)}</dd>
                        {canSeeAmounts && (
                          <dd className="tabular">
                            {formatPrice(rental.lockedAmount, rental.lockedUnit)}
                          </dd>
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
