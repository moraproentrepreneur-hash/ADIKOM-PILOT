import type { Metadata } from 'next'
import Link from 'next/link'
import { CarFront, Layers, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { ExportButton } from '@/components/ui/export-button'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import {
  listCategories,
  listVehicles,
  ORIGIN_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  type VehicleOrigin,
  type VehicleStatus,
} from '@/features/fleet/data'

export const metadata: Metadata = { title: 'Parc automobile' }

export default async function FleetPage(props: PageProps<'/location/parc'>) {
  await requirePermissionOrRedirect(PERMISSIONS.FLEET_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut'),
    categoryId: read('categorie'),
    origin: read('origine'),
  }

  const [vehicles, categories, canCreate, canManageCategories, canExport] = await Promise.all([
    listVehicles(filters),
    listCategories(),
    can(PERMISSIONS.FLEET_CREATE),
    can(PERMISSIONS.CATEGORIES_VIEW),
    // DEC-024 : exporter est une capacité distincte de consulter.
    can(PERMISSIONS.FLEET_EXPORT),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Parc automobile"
        description="Référentiel des véhicules exploités par ADIKOM."
        actions={
          <>
            {canManageCategories && (
              <ButtonLink href="/location/parc/categories" tone="secondary" icon={Layers}>
                Catégories
              </ButtonLink>
            )}
            {canExport && (
              <ExportButton
                module="parc"
                filters={{
                  q: filters.search,
                  statut: filters.status,
                  categorie: filters.categoryId,
                  origine: filters.origin,
                }}
              />
            )}
            {canCreate && (
              <ButtonLink href="/location/parc/nouveau" icon={CarFront}>
                Nouveau véhicule
              </ButtonLink>
            )}
          </>
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
                placeholder="Marque, modèle, immatriculation, identifiant…"
                aria-label="Rechercher un véhicule"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par statut">
              <option value="">Tous les statuts</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>

            <Select
              name="categorie"
              defaultValue={filters.categoryId}
              aria-label="Filtrer par catégorie"
            >
              <option value="">Toutes les catégories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </Select>

            <div className="flex gap-2">
              <Select
                name="origine"
                defaultValue={filters.origin}
                aria-label="Filtrer par origine"
                className="flex-1"
              >
                <option value="">Toutes origines</option>
                {Object.entries(ORIGIN_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <button
                type="submit"
                className="rounded-control bg-adikom-500 px-4 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
              >
                Filtrer
              </button>
            </div>
          </div>

          {hasFilters && (
            <p className="mt-3 text-xs text-muted">
              {vehicles.length} résultat{vehicles.length > 1 ? 's' : ''} ·{' '}
              <Link href="/location/parc" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      <Card className="overflow-hidden">
        {vehicles.length === 0 ? (
          <EmptyState
            icon={CarFront}
            title={hasFilters ? 'Aucun véhicule ne correspond' : 'Aucun véhicule enregistré'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Créez d’abord une catégorie, puis enregistrez les véhicules du parc.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/location/parc" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/location/parc/nouveau" icon={CarFront}>
                  Enregistrer le premier véhicule
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
                    <th className="px-5 py-3 font-medium text-ink">Véhicule</th>
                    <th className="px-5 py-3 font-medium text-ink">Catégorie</th>
                    <th className="px-5 py-3 font-medium text-ink">Origine</th>
                    <th className="px-5 py-3 font-medium text-ink">Fournisseur / Partenaire</th>
                    <th className="px-5 py-3 font-medium text-ink">Kilométrage</th>
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((vehicle) => (
                    <tr
                      key={vehicle.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/location/parc/${vehicle.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {vehicle.brand} {vehicle.model}
                        </Link>
                        <span className="mt-0.5 block text-xs text-muted tabular">
                          {vehicle.vehicleNo}
                          {vehicle.plate ? ` · ${vehicle.plate}` : ''}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">{vehicle.categoryLabel ?? '—'}</td>
                      <td className="px-5 py-3 text-muted">
                        {ORIGIN_LABELS[vehicle.origin as VehicleOrigin]}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {vehicle.supplierLabel ?? vehicle.partnerLabel ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {vehicle.mileage.toLocaleString('fr-FR')} km
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONES[vehicle.status as VehicleStatus]}>
                          {STATUS_LABELS[vehicle.status as VehicleStatus]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {vehicles.map((vehicle) => (
                <li key={vehicle.id}>
                  <Link
                    href={`/location/parc/${vehicle.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {vehicle.brand} {vehicle.model}
                        </p>
                        <p className="truncate text-xs text-muted tabular">
                          {vehicle.vehicleNo}
                          {vehicle.plate ? ` · ${vehicle.plate}` : ''}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONES[vehicle.status as VehicleStatus]}>
                        {STATUS_LABELS[vehicle.status as VehicleStatus]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      {vehicle.categoryLabel && <dd>{vehicle.categoryLabel}</dd>}
                      <dd>{ORIGIN_LABELS[vehicle.origin as VehicleOrigin]}</dd>
                      {(vehicle.supplierLabel || vehicle.partnerLabel) && (
                        <dd>{vehicle.supplierLabel ?? vehicle.partnerLabel}</dd>
                      )}
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
