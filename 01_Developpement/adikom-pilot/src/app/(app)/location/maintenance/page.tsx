import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, Wrench } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import {
  FILTERABLE_STATUSES,
  listMaintenances,
  ORIGIN_LABELS,
  ORIGIN_ORDER,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PRIORITY_TONES,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/maintenance/data'

export const metadata: Metadata = { title: 'Maintenance' }

/**
 * Répertoire des maintenances.
 *
 * Aucun montant n'y figure : cette liste décrit des interventions, pas des
 * dépenses. La colonne « Immobilisation » dit ce qui bloque réellement le
 * calendrier — une maintenance sans période n'y bloque rien.
 */
export default async function MaintenancePage(props: PageProps<'/location/maintenance'>) {
  await requirePermissionOrRedirect(PERMISSIONS.MAINTENANCE_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut'),
    origin: read('origine'),
    priority: read('priorite'),
  }

  const [maintenances, canCreate] = await Promise.all([
    listMaintenances(filters),
    can(PERMISSIONS.MAINTENANCE_CREATE),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Interventions sur les véhicules du parc. Les coûts relèvent d’une étape ultérieure."
        actions={
          canCreate ? (
            <ButtonLink href="/location/maintenance/nouvelle" icon={Wrench}>
              Déclarer une maintenance
            </ButtonLink>
          ) : undefined
        }
      />

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                name="q"
                type="search"
                defaultValue={filters.search}
                placeholder="Référence, motif…"
                aria-label="Rechercher une maintenance"
                className="pl-9"
              />
            </div>

            <Select name="origine" defaultValue={filters.origin} aria-label="Filtrer par origine">
              <option value="">Toutes les origines</option>
              {ORIGIN_ORDER.map((origin) => (
                <option key={origin} value={origin}>
                  {ORIGIN_LABELS[origin]}
                </option>
              ))}
            </Select>

            <Select
              name="priorite"
              defaultValue={filters.priority}
              aria-label="Filtrer par priorité"
            >
              <option value="">Toutes les priorités</option>
              {PRIORITY_ORDER.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
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
                {maintenances.length} résultat{maintenances.length > 1 ? 's' : ''} ·{' '}
                <Link href="/location/maintenance" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {maintenances.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={hasFilters ? 'Aucune maintenance ne correspond' : 'Aucune maintenance'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Les interventions déclarées sur les véhicules apparaîtront ici.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/location/maintenance" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/location/maintenance/nouvelle" icon={Wrench}>
                  Déclarer la première maintenance
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
                    <th className="px-5 py-3 font-medium text-ink">Maintenance</th>
                    <th className="px-5 py-3 font-medium text-ink">Véhicule</th>
                    <th className="px-5 py-3 font-medium text-ink">Motif</th>
                    <th className="px-5 py-3 font-medium text-ink">Origine</th>
                    <th className="px-5 py-3 font-medium text-ink">Priorité</th>
                    <th className="px-5 py-3 font-medium text-ink">Immobilisation</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenances.map((maintenance) => (
                    <tr
                      key={maintenance.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/location/maintenance/${maintenance.id}`}
                          className="font-medium text-adikom-500 hover:underline tabular"
                        >
                          {maintenance.maintenanceNo}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted">{maintenance.vehicleLabel}</td>
                      <td className="px-5 py-3 text-muted">{maintenance.reason}</td>
                      <td className="px-5 py-3 text-muted">
                        {ORIGIN_LABELS[maintenance.origin]}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={PRIORITY_TONES[maintenance.priority]}>
                          {PRIORITY_LABELS[maintenance.priority]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {maintenance.immobilizationFrom ? (
                          <>
                            <span className="block text-xs">
                              {formatDateTime(maintenance.immobilizationFrom)}
                            </span>
                            <span className="block text-xs">
                              au {formatDateTime(maintenance.immobilizationTo)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs">Sans immobilisation</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONES[maintenance.status]}>
                          {STATUS_LABELS[maintenance.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {maintenances.map((maintenance) => (
                <li key={maintenance.id}>
                  <Link
                    href={`/location/maintenance/${maintenance.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{maintenance.reason}</p>
                        <p className="truncate text-xs text-muted tabular">
                          {maintenance.maintenanceNo}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONES[maintenance.status]}>
                        {STATUS_LABELS[maintenance.status]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>{maintenance.vehicleLabel}</dd>
                      <dd>
                        {ORIGIN_LABELS[maintenance.origin]} ·{' '}
                        {PRIORITY_LABELS[maintenance.priority]}
                      </dd>
                      <dd>
                        {maintenance.immobilizationFrom
                          ? `Immobilisé du ${formatDateTime(maintenance.immobilizationFrom)} au ${formatDateTime(maintenance.immobilizationTo)}`
                          : 'Sans immobilisation'}
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
