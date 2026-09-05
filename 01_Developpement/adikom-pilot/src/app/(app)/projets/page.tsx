import type { Metadata } from 'next'
import Link from 'next/link'
import { FolderKanban, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, Empty, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { Tabs } from '@/components/ui/tabs'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/dates'
import { gated, type Figure } from '@/lib/pilotage/figure'
import {
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  getTaskCounts,
  listProjects,
  type TaskCounts,
} from '@/features/projects/data'
import { Progress } from '@/features/projects/progress'
import { moduleAccess } from '@/features/projects/access'
import { moduleTabs } from '@/features/projects/tabs'

export const metadata: Metadata = { title: 'Projets' }

/**
 * Tableau de suivi des projets — Module 03 §32.
 *
 * « Projet · Responsable · Statut · Priorité · Avancement · Échéance ». Chaque
 * colonne vient d'une source différente, et chacune peut manquer sans que la
 * ligne devienne fausse :
 *
 *   · le RESPONSABLE dépend de `users.users.view` ;
 *   · le TIERS dépend du répertoire correspondant ;
 *   · l'AVANCEMENT dépend de `projects.tasks.view`, et se REFUSE plutôt que de
 *     valoir 0 % (DEC-034 §c).
 *
 * Aucune de ces absences n'est présentée comme une donnée : elles se nomment.
 */
export default async function ProjectsPage(props: PageProps<'/projets'>) {
  await requirePermissionOrRedirect(PERMISSIONS.PROJECTS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const archived = read('archives') === '1'
  const filters = {
    search: read('q'),
    status: read('statut'),
    priority: read('priorite'),
    archived,
  }

  const [projects, canCreate, access] = await Promise.all([
    listProjects(filters),
    can(PERMISSIONS.PROJECTS_CREATE),
    moduleAccess(),
  ])

  // Un seul appel pour toute la liste : l'avancement de chaque projet en est
  // extrait, et le refus éventuel se propage à chaque ligne sans devenir zéro.
  const counts: Figure<Map<string, TaskCounts>> = await gated(
    'projets:avancement',
    [PERMISSIONS.TASKS_VIEW],
    () => getTaskCounts()
  )

  const countsFor = (id: string): Figure<TaskCounts | undefined> =>
    counts.state === 'ok' ? { state: 'ok', value: counts.value.get(id) } : counts

  const hasFilters = Boolean(filters.search || filters.status || filters.priority)

  return (
    <>
      <PageHeader
        title="Projets"
        description="Ce qu’ADIKOM a entrepris, qui le suit, et où cela en est."
        actions={
          canCreate ? (
            <ButtonLink href="/projets/nouveau" icon={FolderKanban}>
              Nouveau projet
            </ButtonLink>
          ) : undefined
        }
      />

      <Tabs items={moduleTabs('projets', { ...access, projects: true })} current="projets" />

      <form method="get" className="mb-5">
        {archived && <input type="hidden" name="archives" value="1" />}
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
                placeholder="Nom, objectif…"
                aria-label="Rechercher un projet"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {PROJECT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {PROJECT_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>

            <Select
              name="priorite"
              defaultValue={filters.priority}
              aria-label="Filtrer par priorité"
            >
              <option value="">Toutes les priorités</option>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
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

          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>
              {projects.length} projet{projects.length > 1 ? 's' : ''}
              {archived ? ' archivé' : ''}
              {archived && projects.length > 1 ? 's' : ''}
            </span>
            {hasFilters && (
              <Link
                href={archived ? '/projets?archives=1' : '/projets'}
                className="text-adikom-500 hover:underline"
              >
                Réinitialiser les filtres
              </Link>
            )}
            <Link
              href={archived ? '/projets' : '/projets?archives=1'}
              className="text-adikom-500 hover:underline"
            >
              {archived ? 'Revenir aux projets en cours' : 'Voir les projets archivés'}
            </Link>
          </p>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={
              hasFilters
                ? 'Aucun projet ne correspond'
                : archived
                  ? 'Aucun projet archivé'
                  : 'Aucun projet'
            }
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Un projet transforme une intention en tâches, en responsables et en échéances.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/projets" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate && !archived ? (
                <ButtonLink href="/projets/nouveau" icon={FolderKanban}>
                  Créer le premier projet
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
                    <th className="px-5 py-3 font-medium text-ink">Projet</th>
                    <th className="px-5 py-3 font-medium text-ink">Responsable</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                    <th className="px-5 py-3 font-medium text-ink">Priorité</th>
                    <th className="px-5 py-3 font-medium text-ink">Avancement</th>
                    <th className="px-5 py-3 font-medium text-ink">Échéance</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr
                      key={project.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/projets/${project.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {project.name}
                        </Link>
                        {project.partyLabel && (
                          <p className="text-xs text-muted">{project.partyLabel}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {project.ownerLabel ?? <Empty />}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={PROJECT_STATUS_TONES[project.status]}>
                          {PROJECT_STATUS_LABELS[project.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={PRIORITY_TONES[project.priority]}>
                          {PRIORITY_LABELS[project.priority]}
                        </Badge>
                      </td>
                      <td className="min-w-48 px-5 py-3">
                        <Progress figure={countsFor(project.id)} />
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDate(project.dueOn) ?? <Empty />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projets/${project.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{project.name}</p>
                        <p className="truncate text-xs text-muted">
                          {project.ownerLabel ?? 'Aucun responsable'}
                        </p>
                      </div>
                      <Badge tone={PROJECT_STATUS_TONES[project.status]}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </div>

                    <div className="mt-3">
                      <Progress figure={countsFor(project.id)} />
                    </div>

                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>Priorité : {PRIORITY_LABELS[project.priority]}</dd>
                      <dd>Échéance : {formatDate(project.dueOn) ?? 'aucune'}</dd>
                      {project.partyLabel && <dd>{project.partyLabel}</dd>}
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
