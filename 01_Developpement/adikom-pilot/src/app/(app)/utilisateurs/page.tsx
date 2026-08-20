import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, ShieldCheck, UserPlus, Users } from 'lucide-react'

import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
} from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import {
  listDepartments,
  listGroups,
  listUsers,
  STATUS_LABELS,
  STATUS_TONES,
  type UserStatus,
} from '@/features/users/data'

export const metadata: Metadata = { title: 'Utilisateurs' }

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export default async function UsersPage(props: PageProps<'/utilisateurs'>) {
  // Garde serveur : la page n'est rendue que si la permission est détenue.
  // Le filtrage de la barre latérale n'est qu'un confort de lecture.
  await requirePermissionOrRedirect(PERMISSIONS.USERS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('statut'),
    departmentId: read('departement'),
    groupId: read('groupe'),
  }

  const [users, departments, groups, canCreate] = await Promise.all([
    listUsers(filters),
    listDepartments(),
    listGroups(),
    can(PERMISSIONS.USERS_CREATE),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Collaborateurs autorisés à accéder à ADIKOM PILOT."
        actions={
          canCreate ? (
            <ButtonLink href="/utilisateurs/nouveau" icon={UserPlus}>
              Nouvel utilisateur
            </ButtonLink>
          ) : undefined
        }
      />

      {/* Recherche et filtres — formulaire GET : l'état reste dans l'URL et
          la page demeure partageable et rechargeable. */}
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
                placeholder="Nom, identifiant, email, fonction…"
                aria-label="Rechercher un utilisateur"
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
              name="departement"
              defaultValue={filters.departmentId}
              aria-label="Filtrer par département"
            >
              <option value="">Tous les départements</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.label}
                </option>
              ))}
            </Select>

            <div className="flex gap-2">
              <Select
                name="groupe"
                defaultValue={filters.groupId}
                aria-label="Filtrer par groupe"
                className="flex-1"
              >
                <option value="">Tous les groupes</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
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
              {users.length} résultat{users.length > 1 ? 's' : ''} ·{' '}
              <Link href="/utilisateurs" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      <Card className="overflow-hidden" >
        {users.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hasFilters ? 'Aucun utilisateur ne correspond' : 'Aucun utilisateur enregistré'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Les comptes sont créés par le Super Admin. Aucune inscription publique n’est possible.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/utilisateurs" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/utilisateurs/nouveau" icon={UserPlus}>
                  Créer le premier utilisateur
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
                    <th className="px-5 py-3 font-medium text-ink">Utilisateur</th>
                    <th className="px-5 py-3 font-medium text-ink">Fonction</th>
                    <th className="px-5 py-3 font-medium text-ink">Département</th>
                    <th className="px-5 py-3 font-medium text-ink">Groupe</th>
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                    <th className="px-5 py-3 font-medium text-ink">Dernière connexion</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/utilisateurs/${user.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {user.fullName}
                        </Link>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          {user.username}
                          {user.isSuperAdmin && (
                            <ShieldCheck
                              className="size-3.5 text-adikom-500"
                              aria-label="Super Admin"
                            />
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">{user.jobTitle ?? '—'}</td>
                      <td className="px-5 py-3 text-muted">
                        {user.departments.length > 0 ? user.departments.join(', ') : '—'}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {user.groups.length > 0 ? user.groups.join(', ') : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONES[user.status as UserStatus]}>
                          {STATUS_LABELS[user.status as UserStatus]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDate(user.lastLoginAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {users.map((user) => (
                <li key={user.id}>
                  <Link
                    href={`/utilisateurs/${user.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-ink">
                          {user.fullName}
                          {user.isSuperAdmin && (
                            <ShieldCheck
                              className="size-3.5 shrink-0 text-adikom-500"
                              aria-label="Super Admin"
                            />
                          )}
                        </p>
                        <p className="truncate text-xs text-muted">{user.username}</p>
                      </div>
                      <Badge tone={STATUS_TONES[user.status as UserStatus]}>
                        {STATUS_LABELS[user.status as UserStatus]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      {user.jobTitle && <dd>{user.jobTitle}</dd>}
                      {user.departments.length > 0 && <dd>{user.departments.join(', ')}</dd>}
                      {user.groups.length > 0 && <dd>Groupe : {user.groups.join(', ')}</dd>}
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
