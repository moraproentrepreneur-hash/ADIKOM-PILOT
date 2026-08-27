import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, TriangleAlert } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import {
  FILTERABLE_STATUSES,
  KIND_LABELS,
  KIND_ORDER,
  listIncidents,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/incidents/data'

export const metadata: Metadata = { title: 'Dommages & Incidents' }

/**
 * Répertoire des incidents.
 *
 * Aucun montant n'y figure : un incident se constate, il ne se chiffre pas
 * (DEC-008). La colonne « Dommages » compte des faits, pas des coûts.
 */
export default async function IncidentsPage(props: PageProps<'/location/incidents'>) {
  await requirePermissionOrRedirect(PERMISSIONS.INCIDENTS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = { search: read('q'), status: read('statut'), kind: read('nature') }

  const [incidents, canCreate] = await Promise.all([
    listIncidents(filters),
    can(PERMISSIONS.INCIDENTS_CREATE),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Dommages & Incidents"
        description="Ce qui est arrivé aux véhicules, constaté et conservé — sans valorisation."
        actions={
          canCreate ? (
            <ButtonLink href="/location/incidents/nouveau" icon={TriangleAlert}>
              Déclarer un incident
            </ButtonLink>
          ) : undefined
        }
      />

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                name="q"
                type="search"
                defaultValue={filters.search}
                placeholder="Référence, description…"
                aria-label="Rechercher un incident"
                className="pl-9"
              />
            </div>

            <Select name="nature" defaultValue={filters.kind} aria-label="Filtrer par nature">
              <option value="">Toutes les natures</option>
              {KIND_ORDER.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </Select>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
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
              {incidents.length} résultat{incidents.length > 1 ? 's' : ''} ·{' '}
              <Link href="/location/incidents" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      <Card className="overflow-hidden">
        {incidents.length === 0 ? (
          <EmptyState
            icon={TriangleAlert}
            title={hasFilters ? 'Aucun incident ne correspond' : 'Aucun incident'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Les incidents constatés sur les véhicules apparaîtront ici.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/location/incidents" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/location/incidents/nouveau" icon={TriangleAlert}>
                  Déclarer le premier incident
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
                    <th className="px-5 py-3 font-medium text-ink">Incident</th>
                    <th className="px-5 py-3 font-medium text-ink">Véhicule</th>
                    <th className="px-5 py-3 font-medium text-ink">Nature</th>
                    <th className="px-5 py-3 font-medium text-ink">Survenu le</th>
                    <th className="px-5 py-3 font-medium text-ink">Dommages</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((incident) => (
                    <tr
                      key={incident.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/location/incidents/${incident.id}`}
                          className="font-medium text-adikom-500 hover:underline tabular"
                        >
                          {incident.incidentNo}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted">{incident.vehicleLabel}</td>
                      <td className="px-5 py-3 text-muted">{KIND_LABELS[incident.kind]}</td>
                      <td className="px-5 py-3 text-muted">
                        {formatDateTime(incident.occurredAt)}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">{incident.damageCount}</td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONES[incident.status]}>
                          {STATUS_LABELS[incident.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <Link
                    href={`/location/incidents/${incident.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{KIND_LABELS[incident.kind]}</p>
                        <p className="truncate text-xs text-muted tabular">
                          {incident.incidentNo}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONES[incident.status]}>
                        {STATUS_LABELS[incident.status]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>{incident.vehicleLabel}</dd>
                      <dd>{formatDateTime(incident.occurredAt)}</dd>
                      <dd>
                        {incident.damageCount} dommage{incident.damageCount > 1 ? 's' : ''}{' '}
                        constaté{incident.damageCount > 1 ? 's' : ''}
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
