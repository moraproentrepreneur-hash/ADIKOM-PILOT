import type { Metadata } from 'next'
import Link from 'next/link'
import { Info, Plus, Search, ShieldCheck } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listGroups } from '@/features/groups/data'

export const metadata: Metadata = { title: 'Groupes' }

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

/**
 * Liste des groupes — Module 08 §29.
 *
 * Les colonnes sont celles que le document nomme : nom, description, nombre
 * d'utilisateurs, statut, date de création. S'y ajoute le nombre de permissions
 * accordées, parce qu'un groupe se juge d'abord à ce qu'il ouvre.
 */
export default async function GroupsPage(props: PageProps<'/utilisateurs/groupes'>) {
  // Garde serveur : le filtrage de la barre latérale n'est qu'un confort de
  // lecture, la protection réelle est ici et dans RLS.
  await requirePermissionOrRedirect(PERMISSIONS.GROUPS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut') as '' | 'ACTIVE' | 'INACTIVE',
  }

  const [groups, canCreate] = await Promise.all([
    listGroups(filters),
    can(PERMISSIONS.GROUPS_CREATE),
  ])

  const hasFilters = Boolean(filters.search || filters.status)
  const countsUnavailable = groups.some((group) => group.memberCount === null)

  return (
    <>
      <PageHeader
        title="Groupes"
        description="Un groupe rassemble des permissions et les transmet à ses membres."
        actions={
          canCreate ? (
            <ButtonLink href="/utilisateurs/groupes/nouveau" icon={Plus}>
              Nouveau groupe
            </ButtonLink>
          ) : undefined
        }
      />

      {read('supprime') === '1' && (
        <Notice tone="success" className="mb-5">
          Le groupe a été supprimé.
        </Notice>
      )}

      {/* Recherche et filtres — formulaire GET : l'état reste dans l'URL et la
          page demeure partageable et rechargeable. */}
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
                placeholder="Nom ou description…"
                aria-label="Rechercher un groupe"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par statut">
              <option value="">Tous les statuts</option>
              <option value="ACTIVE">Actifs</option>
              <option value="INACTIVE">Désactivés</option>
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
              {groups.length} résultat{groups.length > 1 ? 's' : ''} ·{' '}
              <Link href="/utilisateurs/groupes" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      {/* Une absence se dit, elle ne se devine pas (DEC-017). */}
      {countsUnavailable && (
        <Notice tone="info" className="mb-5">
          Le nombre de membres n’a pas pu être établi pour tous les groupes. La colonne reste vide
          plutôt que d’afficher un chiffre faux.
        </Notice>
      )}

      <Card className="overflow-hidden">
        {groups.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={hasFilters ? 'Aucun groupe ne correspond' : 'Aucun groupe enregistré'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Un groupe rassemble les permissions d’un poste et les transmet à ses membres.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/utilisateurs/groupes" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/utilisateurs/groupes/nouveau" icon={Plus}>
                  Créer le premier groupe
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
                    <th className="px-5 py-3 font-medium text-ink">Groupe</th>
                    <th className="px-5 py-3 font-medium text-ink">Membres</th>
                    <th className="px-5 py-3 font-medium text-ink">Permissions</th>
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                    <th className="px-5 py-3 font-medium text-ink">Créé le</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr
                      key={group.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/utilisateurs/groupes/${group.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {group.name}
                        </Link>
                        {group.description && (
                          <span className="mt-0.5 block max-w-md text-xs text-muted">
                            {group.description}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {group.memberCount === null ? (
                          '—'
                        ) : (
                          <>
                            {group.memberCount}
                            {group.activeMemberCount !== null &&
                              group.activeMemberCount !== group.memberCount && (
                                <span className="ml-1 text-xs">
                                  ({group.activeMemberCount} actif
                                  {group.activeMemberCount > 1 ? 's' : ''})
                                </span>
                              )}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {group.allowCount}
                        {group.denyCount > 0 && (
                          <span className="ml-1 text-xs text-danger">
                            · {group.denyCount} refus
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={group.isActive ? 'success' : 'neutral'}>
                          {group.isActive ? 'Actif' : 'Désactivé'}
                        </Badge>
                        {group.isSystem && (
                          <Badge tone="info" className="ml-1.5">
                            Système
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">{formatDate(group.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {groups.map((group) => (
                <li key={group.id}>
                  <Link
                    href={`/utilisateurs/groupes/${group.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{group.name}</p>
                        {group.description && (
                          <p className="text-xs text-muted">{group.description}</p>
                        )}
                      </div>
                      <Badge tone={group.isActive ? 'success' : 'neutral'}>
                        {group.isActive ? 'Actif' : 'Désactivé'}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      {group.memberCount === null
                        ? 'Membres non consultables'
                        : `${group.memberCount} membre${group.memberCount > 1 ? 's' : ''}`}{' '}
                      · {group.allowCount} permission{group.allowCount > 1 ? 's' : ''}
                      {group.denyCount > 0 && ` · ${group.denyCount} refus`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <p className="mt-5 flex items-start gap-2 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Un utilisateur peut appartenir à plusieurs groupes. Lorsque deux groupes se contredisent,
        le refus l’emporte — et un refus de groupe prime même sur une autorisation individuelle.
      </p>
    </>
  )
}
