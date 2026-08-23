import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarCheck, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { formatPrice } from '@/features/pricing/constants'
import {
  displayStatus,
  FILTERABLE_STATUSES,
  listReservations,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/reservations/data'

export const metadata: Metadata = { title: 'Réservations' }

export default async function ReservationsPage(props: PageProps<'/location/reservations'>) {
  await requirePermissionOrRedirect(PERMISSIONS.RESERVATIONS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = { search: read('q'), status: read('statut') }

  const [reservations, canCreate, canSeeAmounts] = await Promise.all([
    listReservations(filters),
    can(PERMISSIONS.RESERVATIONS_CREATE),
    /*
     * DEC-024 : voir une réservation ne donne pas accès à son montant.
     * DEC-017 : sans ce droit, la colonne DISPARAÎT — afficher un tiret
     * laisserait croire qu'aucun tarif n'est verrouillé.
     */
    can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Réservations"
        description="Engagements pris sur un véhicule et une période, avant leur transformation en location."
        actions={
          canCreate ? (
            <ButtonLink href="/location/reservations/nouvelle" icon={CalendarCheck}>
              Nouvelle réservation
            </ButtonLink>
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
                aria-label="Rechercher une réservation"
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
              {reservations.length} résultat{reservations.length > 1 ? 's' : ''} ·{' '}
              <Link href="/location/reservations" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      <Card className="overflow-hidden">
        {reservations.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={hasFilters ? 'Aucune réservation ne correspond' : 'Aucune réservation'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Enregistrez une réservation pour engager un véhicule sur une période.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/location/reservations" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/location/reservations/nouvelle" icon={CalendarCheck}>
                  Créer la première réservation
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
                    <th className="px-5 py-3 font-medium text-ink">Réservation</th>
                    <th className="px-5 py-3 font-medium text-ink">Client</th>
                    <th className="px-5 py-3 font-medium text-ink">Période</th>
                    <th className="px-5 py-3 font-medium text-ink">Affectation</th>
                    {canSeeAmounts && <th className="px-5 py-3 font-medium text-ink">Tarif</th>}
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((reservation) => {
                    const shown = displayStatus(reservation.status, reservation.startsAt)

                    return (
                      <tr
                        key={reservation.id}
                        className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/location/reservations/${reservation.id}`}
                            className="font-medium text-adikom-500 hover:underline tabular"
                          >
                            {reservation.reservationNo}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-muted">{reservation.clientLabel}</td>
                        <td className="px-5 py-3 text-muted">
                          <span className="block">{formatDateTime(reservation.startsAt)}</span>
                          <span className="block text-xs">
                            au {formatDateTime(reservation.endsAt)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted">
                          {reservation.vehicleLabel ?? reservation.categoryLabel ?? '—'}
                        </td>
                        {canSeeAmounts && (
                          <td className="px-5 py-3 text-muted tabular">
                            {reservation.lockedAmount != null && reservation.lockedUnit
                              ? formatPrice(reservation.lockedAmount, reservation.lockedUnit)
                              : '—'}
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
              {reservations.map((reservation) => {
                const shown = displayStatus(reservation.status, reservation.startsAt)

                return (
                  <li key={reservation.id}>
                    <Link
                      href={`/location/reservations/${reservation.id}`}
                      className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{reservation.clientLabel}</p>
                          <p className="truncate text-xs text-muted tabular">
                            {reservation.reservationNo}
                          </p>
                        </div>
                        <Badge tone={STATUS_TONES[shown]}>{STATUS_LABELS[shown]}</Badge>
                      </div>
                      <dl className="mt-3 space-y-1 text-xs text-muted">
                        <dd>
                          {formatDateTime(reservation.startsAt)} → {formatDateTime(reservation.endsAt)}
                        </dd>
                        <dd>{reservation.vehicleLabel ?? reservation.categoryLabel ?? '—'}</dd>
                        {canSeeAmounts && reservation.lockedAmount != null && reservation.lockedUnit && (
                          <dd className="tabular">
                            {formatPrice(reservation.lockedAmount, reservation.lockedUnit)}
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
