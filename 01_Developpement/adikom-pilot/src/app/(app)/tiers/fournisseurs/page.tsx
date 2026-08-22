import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, Truck } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { ExportButton } from '@/components/ui/export-button'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import {
  listSuppliers,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
  type SupplierStatus,
  type SupplierType,
} from '@/features/suppliers/data'

export const metadata: Metadata = { title: 'Fournisseurs' }

export default async function SuppliersPage(props: PageProps<'/tiers/fournisseurs'>) {
  await requirePermissionOrRedirect(PERMISSIONS.SUPPLIERS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = { search: read('q'), status: read('statut'), type: read('type') }

  const [suppliers, canCreate, canExport] = await Promise.all([
    listSuppliers(filters),
    can(PERMISSIONS.SUPPLIERS_CREATE),
    // DEC-024 : exporter est une capacité distincte de consulter.
    can(PERMISSIONS.SUPPLIERS_EXPORT),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Fournisseurs"
        description="Partenaires mettant des véhicules ou des services à disposition d’ADIKOM."
        actions={
          <>
            {canExport && (
              <ExportButton
                module="fournisseurs"
                filters={{ q: filters.search, statut: filters.status, type: filters.type }}
              />
            )}
            {canCreate && (
              <ButtonLink href="/tiers/fournisseurs/nouveau" icon={Truck}>
                Nouveau fournisseur
              </ButtonLink>
            )}
          </>
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
                placeholder="Raison sociale, contact, identifiant, téléphone…"
                aria-label="Rechercher un fournisseur"
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

            <div className="flex gap-2">
              <Select
                name="type"
                defaultValue={filters.type}
                aria-label="Filtrer par type"
                className="flex-1"
              >
                <option value="">Tous les types</option>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
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
              {suppliers.length} résultat{suppliers.length > 1 ? 's' : ''} ·{' '}
              <Link href="/tiers/fournisseurs" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      <Card className="overflow-hidden">
        {suppliers.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={hasFilters ? 'Aucun fournisseur ne correspond' : 'Aucun fournisseur enregistré'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Enregistrez un fournisseur pour pouvoir lui rattacher des véhicules.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/tiers/fournisseurs" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/tiers/fournisseurs/nouveau" icon={Truck}>
                  Créer le premier fournisseur
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
                    <th className="px-5 py-3 font-medium text-ink">Fournisseur</th>
                    <th className="px-5 py-3 font-medium text-ink">Type</th>
                    <th className="px-5 py-3 font-medium text-ink">Contact</th>
                    <th className="px-5 py-3 font-medium text-ink">Téléphone</th>
                    <th className="px-5 py-3 font-medium text-ink">Véhicules</th>
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr
                      key={supplier.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/tiers/fournisseurs/${supplier.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {supplier.legalName}
                        </Link>
                        <span className="mt-0.5 block text-xs text-muted tabular">
                          {supplier.supplierNo}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {TYPE_LABELS[supplier.type as SupplierType]}
                      </td>
                      <td className="px-5 py-3 text-muted">{supplier.contactName ?? '—'}</td>
                      <td className="px-5 py-3 text-muted tabular">{supplier.phone}</td>
                      <td className="px-5 py-3 text-muted tabular">{supplier.vehicleCount}</td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONES[supplier.status as SupplierStatus]}>
                          {STATUS_LABELS[supplier.status as SupplierStatus]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {suppliers.map((supplier) => (
                <li key={supplier.id}>
                  <Link
                    href={`/tiers/fournisseurs/${supplier.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{supplier.legalName}</p>
                        <p className="truncate text-xs text-muted tabular">{supplier.supplierNo}</p>
                      </div>
                      <Badge tone={STATUS_TONES[supplier.status as SupplierStatus]}>
                        {STATUS_LABELS[supplier.status as SupplierStatus]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>{TYPE_LABELS[supplier.type as SupplierType]}</dd>
                      <dd className="tabular">{supplier.phone}</dd>
                      <dd>
                        {supplier.vehicleCount} véhicule{supplier.vehicleCount > 1 ? 's' : ''}
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
