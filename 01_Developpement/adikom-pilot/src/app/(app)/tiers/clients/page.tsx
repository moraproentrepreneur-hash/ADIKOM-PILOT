import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, Search, UserPlus, Users } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import {
  listClients,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
  type ClientStatus,
  type ClientType,
} from '@/features/clients/data'

export const metadata: Metadata = { title: 'Clients' }

export default async function ClientsPage(props: PageProps<'/tiers/clients'>) {
  // Garde serveur : le filtrage de la barre latérale n'est qu'un confort de
  // lecture, jamais une protection (05_Regles_Metier/05_Permissions.md §85).
  await requirePermissionOrRedirect(PERMISSIONS.CLIENTS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut'),
    type: read('type'),
  }

  const [clients, canCreate] = await Promise.all([
    listClients(filters),
    can(PERMISSIONS.CLIENTS_CREATE),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Clients"
        description="Particuliers et entreprises auxquels ADIKOM loue des véhicules."
        actions={
          canCreate ? (
            <ButtonLink href="/tiers/clients/nouveau" icon={UserPlus}>
              Nouveau client
            </ButtonLink>
          ) : undefined
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
                placeholder="Nom, identifiant, téléphone, email, ville…"
                aria-label="Rechercher un client"
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
              {clients.length} résultat{clients.length > 1 ? 's' : ''} ·{' '}
              <Link href="/tiers/clients" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      <Card className="overflow-hidden">
        {clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hasFilters ? 'Aucun client ne correspond' : 'Aucun client enregistré'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Créez une fiche client pour pouvoir lui attribuer des tarifs, puis des réservations.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/tiers/clients" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/tiers/clients/nouveau" icon={UserPlus}>
                  Créer le premier client
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop : tableau. Mobile : cartes — l'interface est réorganisée,
                pas simplement réduite (Design System §53). */}
            <div className="-mx-5 -my-4 hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-adikom-50 text-left">
                    <th className="px-5 py-3 font-medium text-ink">Client</th>
                    <th className="px-5 py-3 font-medium text-ink">Type</th>
                    <th className="px-5 py-3 font-medium text-ink">Téléphone</th>
                    <th className="px-5 py-3 font-medium text-ink">Email</th>
                    <th className="px-5 py-3 font-medium text-ink">Ville</th>
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr
                      key={client.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/tiers/clients/${client.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {client.displayName}
                        </Link>
                        <span className="mt-0.5 block text-xs text-muted tabular">
                          {client.clientNo}
                          {client.tradeName ? ` · ${client.tradeName}` : ''}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {TYPE_LABELS[client.type as ClientType]}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">{client.phone}</td>
                      <td className="px-5 py-3 text-muted">{client.email ?? '—'}</td>
                      <td className="px-5 py-3 text-muted">{client.city ?? '—'}</td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONES[client.status as ClientStatus]}>
                          {STATUS_LABELS[client.status as ClientStatus]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {clients.map((client) => (
                <li key={client.id}>
                  <Link
                    href={`/tiers/clients/${client.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-ink">
                          {client.type === 'COMPANY' && (
                            <Building2 className="size-3.5 shrink-0 text-muted" aria-hidden />
                          )}
                          {client.displayName}
                        </p>
                        <p className="truncate text-xs text-muted tabular">{client.clientNo}</p>
                      </div>
                      <Badge tone={STATUS_TONES[client.status as ClientStatus]}>
                        {STATUS_LABELS[client.status as ClientStatus]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd className="tabular">{client.phone}</dd>
                      {client.email && <dd className="truncate">{client.email}</dd>}
                      {client.city && <dd>{client.city}</dd>}
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
