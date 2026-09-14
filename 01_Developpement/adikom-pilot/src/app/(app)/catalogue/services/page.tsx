import type { Metadata } from 'next'
import Link from 'next/link'
import { ConciergeBell, Plus, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { ExportButton } from '@/components/ui/export-button'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import {
  listServiceCategories,
  listServices,
  PURPOSE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/catalog/data'
import type { ServicePurpose, ServiceStatus } from '@/features/catalog/data'

export const metadata: Metadata = { title: 'Services' }

export default async function ServicesPage(props: PageProps<'/catalogue/services'>) {
  // Garde serveur : le filtrage de la barre latérale n'est qu'un confort de
  // lecture, jamais une protection (CLAUDE.md §19).
  await requirePermissionOrRedirect(PERMISSIONS.SERVICES_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut'),
    categoryId: read('categorie'),
    purpose: read('destination'),
  }

  const [services, categories, canCreate, canExport] = await Promise.all([
    listServices(filters),
    // Archivées comprises : une catégorie retirée peut encore classer des
    // services existants, et le filtre doit pouvoir les retrouver.
    listServiceCategories(true),
    can(PERMISSIONS.SERVICES_CREATE),
    // DEC-024 : exporter est une capacité distincte de consulter.
    can(PERMISSIONS.SERVICES_EXPORT),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Services"
        description="Les prestations qu’ADIKOM vend, achète, ou les deux. Les prix sont portés par les variantes."
        actions={
          <>
            {canExport && (
              <ExportButton
                module="services"
                filters={{
                  q: filters.search,
                  statut: filters.status,
                  categorie: filters.categoryId,
                  destination: filters.purpose,
                }}
              />
            )}
            {canCreate && (
              <ButtonLink href="/catalogue/services/nouveau" icon={Plus}>
                Nouveau service
              </ButtonLink>
            )}
          </>
        }
      />

      {/* Formulaire GET : l'état des filtres reste dans l'URL, la page demeure
          partageable et rechargeable. */}
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
                placeholder="Libellé, référence, description…"
                aria-label="Rechercher un service"
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
                  {category.isActive ? '' : ' (archivée)'}
                </option>
              ))}
            </Select>

            <div className="flex gap-2 lg:col-span-2">
              <Select
                name="destination"
                defaultValue={filters.purpose}
                aria-label="Filtrer par destination"
                className="flex-1"
              >
                <option value="">Toutes les destinations</option>
                <option value="SALE">Vendables</option>
                <option value="PURCHASE">Achetables</option>
                <option value="BOTH">Achat et vente</option>
              </Select>
              <button
                type="submit"
                className="min-h-11 rounded-control bg-adikom-500 px-4 text-sm font-medium text-white transition-colors hover:bg-adikom-600 sm:min-h-0"
              >
                Filtrer
              </button>
            </div>
          </div>

          {hasFilters && (
            <p className="mt-3 text-xs text-muted">
              {services.length} résultat{services.length > 1 ? 's' : ''} ·{' '}
              <Link href="/catalogue/services" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      <Card className="overflow-hidden">
        {services.length === 0 ? (
          <EmptyState
            icon={ConciergeBell}
            title={hasFilters ? 'Aucun service ne correspond' : 'Aucun service enregistré'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Enregistrez les prestations qu’ADIKOM propose ou achète : transfert, excursion, assistance…'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/catalogue/services" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/catalogue/services/nouveau" icon={Plus}>
                  Créer le premier service
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop : tableau. Mobile : cartes — l'interface est réorganisée,
                pas simplement réduite (CLAUDE.md §35). */}
            <div className="-mx-5 -my-4 hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-adikom-50 text-left">
                    <th className="px-5 py-3 font-medium text-ink">Service</th>
                    <th className="px-5 py-3 font-medium text-ink">Catégorie</th>
                    <th className="px-5 py-3 font-medium text-ink">Destination</th>
                    <th className="px-5 py-3 font-medium text-ink">Variantes</th>
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((service) => (
                    <tr
                      key={service.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/catalogue/services/${service.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {service.label}
                        </Link>
                        <span className="mt-0.5 block text-xs text-muted tabular">
                          {service.serviceNo}
                          {service.unitLabel ? ` · ${service.unitLabel}` : ''}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {service.categoryLabel ?? '—'}
                        {!service.categoryIsActive && (
                          <span className="block text-xs">catégorie archivée</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {PURPOSE_LABELS[service.purpose as ServicePurpose]}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">{service.variantCount}</td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONES[service.status as ServiceStatus]}>
                          {STATUS_LABELS[service.status as ServiceStatus]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {services.map((service) => (
                <li key={service.id}>
                  <Link
                    href={`/catalogue/services/${service.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{service.label}</p>
                        <p className="truncate text-xs text-muted tabular">{service.serviceNo}</p>
                      </div>
                      <Badge tone={STATUS_TONES[service.status as ServiceStatus]}>
                        {STATUS_LABELS[service.status as ServiceStatus]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>{service.categoryLabel ?? '—'}</dd>
                      <dd>{PURPOSE_LABELS[service.purpose as ServicePurpose]}</dd>
                      <dd className="tabular">
                        {service.variantCount} variante{service.variantCount > 1 ? 's' : ''}
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
