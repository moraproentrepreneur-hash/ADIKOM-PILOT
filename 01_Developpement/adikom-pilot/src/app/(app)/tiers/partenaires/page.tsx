import type { Metadata } from 'next'
import Link from 'next/link'
import { Handshake, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { ExportButton } from '@/components/ui/export-button'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listPartners, STATUS_LABELS, STATUS_TONES } from '@/features/partners/data'

export const metadata: Metadata = { title: 'Partenaires' }

/**
 * Répertoire des partenaires.
 *
 * Périmètre validé : CONSULTER. Un partenaire se rattache à des véhicules ;
 * la gestion du partenariat lui-même — conditions, contrats, projets communs —
 * relève du module Partenariats, à venir. L'écran n'offre donc ni création ni
 * modification, et ne fait pas semblant d'en offrir.
 */
export default async function PartnersPage(props: PageProps<'/tiers/partenaires'>) {
  await requirePermissionOrRedirect(PERMISSIONS.PARTNERS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = { search: read('q'), status: read('statut') }

  const [partners, canExport] = await Promise.all([
    listPartners(filters),
    can(PERMISSIONS.PARTNERS_EXPORT),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Partenaires"
        description="Organisations avec lesquelles ADIKOM exploite des véhicules en partenariat."
        actions={
          canExport ? (
            <ExportButton
              module="partenaires"
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
                placeholder="Raison sociale, contact, identifiant, téléphone…"
                aria-label="Rechercher un partenaire"
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

            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              Filtrer
            </button>
          </div>

          {hasFilters && (
            <p className="mt-3 text-xs text-muted">
              {partners.length} résultat{partners.length > 1 ? 's' : ''} ·{' '}
              <Link href="/tiers/partenaires" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      <Card className="overflow-hidden">
        {partners.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title={hasFilters ? 'Aucun partenaire ne correspond' : 'Aucun partenaire enregistré'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Les partenaires apparaissent ici dès qu’un partenariat est enregistré. Leur création relève du module Partenariats, à venir.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/tiers/partenaires" tone="secondary">
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
                    <th className="px-5 py-3 font-medium text-ink">Partenaire</th>
                    <th className="px-5 py-3 font-medium text-ink">Contact</th>
                    <th className="px-5 py-3 font-medium text-ink">Téléphone</th>
                    <th className="px-5 py-3 font-medium text-ink">Ville</th>
                    <th className="px-5 py-3 font-medium text-ink">Véhicules</th>
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => (
                    <tr
                      key={partner.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/tiers/partenaires/${partner.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {partner.legalName}
                        </Link>
                        <span className="mt-0.5 block text-xs text-muted tabular">
                          {partner.partnerNo}
                          {partner.tradeName ? ` · ${partner.tradeName}` : ''}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">{partner.contactName ?? '—'}</td>
                      <td className="px-5 py-3 text-muted tabular">{partner.phone ?? '—'}</td>
                      <td className="px-5 py-3 text-muted">{partner.city ?? '—'}</td>
                      <td className="px-5 py-3 text-muted tabular">{partner.vehicleCount}</td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONES[partner.status]}>
                          {STATUS_LABELS[partner.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {partners.map((partner) => (
                <li key={partner.id}>
                  <Link
                    href={`/tiers/partenaires/${partner.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{partner.legalName}</p>
                        <p className="truncate text-xs text-muted tabular">{partner.partnerNo}</p>
                      </div>
                      <Badge tone={STATUS_TONES[partner.status]}>
                        {STATUS_LABELS[partner.status]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      {partner.contactName && <dd>{partner.contactName}</dd>}
                      {partner.phone && <dd className="tabular">{partner.phone}</dd>}
                      <dd>
                        {partner.vehicleCount} véhicule{partner.vehicleCount > 1 ? 's' : ''}
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
