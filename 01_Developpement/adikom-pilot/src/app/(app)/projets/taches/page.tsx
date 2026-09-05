import type { Metadata } from 'next'
import Link from 'next/link'
import { ListChecks, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, Empty, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { Tabs } from '@/components/ui/tabs'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/dates'
import {
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  TASK_BOARD_COLUMNS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  listProjectOptions,
  listTasks,
  type TaskListItem,
} from '@/features/projects/data'
import { moduleAccess } from '@/features/projects/access'
import { moduleTabs } from '@/features/projects/tabs'

export const metadata: Metadata = { title: 'Tâches' }

/**
 * Liste et tableau des tâches — Module 03 §34, §35.
 *
 * DEUX VUES, UNE SEULE LECTURE.
 *
 * §35 exige la vue liste, §34 propose le tableau. Les deux affichent EXACTEMENT
 * les mêmes tâches, filtrées de la même façon : le paramètre `vue` ne change que
 * la disposition. Deux requêtes différentes auraient fini par montrer deux
 * vérités.
 *
 * LE RETARD N'EST PAS UN STATUT.
 *
 * §14 le distingue explicitement : « tâches en retard » est un FILTRE, calculé
 * sur l'échéance et le jour civil des Comores. Aucune colonne ne le stocke — il
 * serait faux le lendemain (DEC-025 §a).
 */
export default async function TasksPage(props: PageProps<'/projets/taches'>) {
  await requirePermissionOrRedirect(PERMISSIONS.TASKS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const board = read('vue') === 'tableau'
  const filters = {
    search: read('q'),
    status: read('statut'),
    priority: read('priorite'),
    projectId: read('projet'),
    lateOnly: read('retard') === '1',
    withoutDueDate: read('sans_echeance') === '1',
  }

  const [tasks, canCreate, access] = await Promise.all([
    listTasks(filters),
    can(PERMISSIONS.TASKS_CREATE),
    moduleAccess(),
  ])

  const canReadProjects = access.projects

  const projects = canReadProjects ? await listProjectOptions() : []

  const hasFilters =
    Boolean(filters.search || filters.status || filters.priority || filters.projectId) ||
    filters.lateOnly ||
    filters.withoutDueDate

  const lateCount = tasks.filter((task) => task.isLate).length

  const keep = (extra: Record<string, string>) => {
    const params = new URLSearchParams()
    if (filters.search) params.set('q', filters.search)
    if (filters.status) params.set('statut', filters.status)
    if (filters.priority) params.set('priorite', filters.priority)
    if (filters.projectId) params.set('projet', filters.projectId)
    if (filters.lateOnly) params.set('retard', '1')
    if (filters.withoutDueDate) params.set('sans_echeance', '1')
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const query = params.toString()
    return query ? `/projets/taches?${query}` : '/projets/taches'
  }

  return (
    <>
      <PageHeader
        title="Tâches"
        description="Ce qu’il y a à faire, qui s’en charge, et pour quand."
        actions={
          canCreate ? (
            <ButtonLink href="/projets/taches/nouvelle" icon={ListChecks}>
              Nouvelle tâche
            </ButtonLink>
          ) : undefined
        }
      />

      <Tabs
        items={moduleTabs('taches', { ...access, tasks: true })}
        current="taches"
      />

      <form method="get" className="mb-5">
        {board && <input type="hidden" name="vue" value="tableau" />}
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
                placeholder="Titre, description…"
                aria-label="Rechercher une tâche"
                className="pl-9"
              />
            </div>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {TASK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {TASK_STATUS_LABELS[value]}
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

            {canReadProjects ? (
              <Select name="projet" defaultValue={filters.projectId} aria-label="Filtrer par projet">
                <option value="">Tous les projets</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.label}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="self-center text-xs text-muted">
                Le filtre par projet demande la permission{' '}
                <code className="tabular">projects.view</code>.
              </p>
            )}

            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              Filtrer
            </button>
          </div>

          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span data-compteur="taches" data-compteur-valeur={tasks.length}>
              {tasks.length} tâche{tasks.length > 1 ? 's' : ''}
            </span>
            <span data-compteur="retard" data-compteur-valeur={lateCount}>
              {lateCount} en retard
            </span>
            <Link href={keep({ retard: filters.lateOnly ? '' : '1' })} className="text-adikom-500 hover:underline">
              {filters.lateOnly ? 'Voir toutes les tâches' : 'Voir seulement les retards'}
            </Link>
            <Link
              href={keep({ sans_echeance: filters.withoutDueDate ? '' : '1' })}
              className="text-adikom-500 hover:underline"
            >
              {filters.withoutDueDate ? 'Voir toutes les échéances' : 'Voir les tâches sans échéance'}
            </Link>
            <Link href={keep({ vue: board ? '' : 'tableau' })} className="text-adikom-500 hover:underline">
              {board ? 'Afficher en liste' : 'Afficher en tableau'}
            </Link>
            {hasFilters && (
              <Link href="/projets/taches" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            )}
          </p>
        </Card>
      </form>

      {tasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title={hasFilters ? 'Aucune tâche ne correspond' : 'Aucune tâche'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Une tâche peut appartenir à un projet ou vivre seule.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/projets/taches" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/projets/taches/nouvelle" icon={ListChecks}>
                  Créer la première tâche
                </ButtonLink>
              ) : undefined
            }
          />
        </Card>
      ) : board ? (
        <TaskBoard tasks={tasks} />
      ) : (
        <TaskTable tasks={tasks} />
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Vue liste — §35                                                            */
/* -------------------------------------------------------------------------- */

function TaskTable({ tasks }: { tasks: TaskListItem[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="-mx-5 -my-4 hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-adikom-50 text-left">
              <th className="px-5 py-3 font-medium text-ink">Tâche</th>
              <th className="px-5 py-3 font-medium text-ink">Projet</th>
              <th className="px-5 py-3 font-medium text-ink">Responsable</th>
              <th className="px-5 py-3 font-medium text-ink">Échéance</th>
              <th className="px-5 py-3 font-medium text-ink">Priorité</th>
              <th className="px-5 py-3 font-medium text-ink">État</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task.id}
                className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/projets/taches/${task.id}`}
                    className="font-medium text-adikom-500 hover:underline"
                  >
                    {task.title}
                  </Link>
                </td>
                <td className="px-5 py-3 text-muted">{task.projectLabel ?? <Empty />}</td>
                <td className="px-5 py-3 text-muted">{task.assigneeLabel ?? <Empty />}</td>
                <td className="px-5 py-3 tabular">
                  {task.dueOn ? (
                    <span className={task.isLate ? 'text-danger' : 'text-muted'}>
                      {formatDate(task.dueOn)}
                      {task.isLate && ' · en retard'}
                    </span>
                  ) : (
                    <Empty />
                  )}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={PRIORITY_TONES[task.priority]}>
                    {PRIORITY_LABELS[task.priority]}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  <Badge tone={TASK_STATUS_TONES[task.status]}>
                    {TASK_STATUS_LABELS[task.status]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {tasks.map((task) => (
          <li key={task.id}>
            <Link
              href={`/projets/taches/${task.id}`}
              className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{task.title}</p>
                  <p className="truncate text-xs text-muted">
                    {task.projectLabel ?? 'Tâche indépendante'}
                  </p>
                </div>
                <Badge tone={TASK_STATUS_TONES[task.status]}>
                  {TASK_STATUS_LABELS[task.status]}
                </Badge>
              </div>
              <dl className="mt-3 space-y-1 text-xs text-muted">
                <dd>{task.assigneeLabel ?? 'Non attribuée'}</dd>
                <dd className={task.isLate ? 'text-danger' : undefined}>
                  {task.dueOn ? `Échéance ${formatDate(task.dueOn)}` : 'Sans échéance'}
                  {task.isLate && ' · en retard'}
                </dd>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Vue tableau — §34                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Quatre colonnes, et le déplacement se fait depuis la fiche.
 *
 * §34 exige que « le déplacement d'une tâche entre les colonnes respecte les
 * permissions ». Un glisser-déposer qui changerait l'état sans passer par une
 * action serveur contrôlée serait précisément ce qu'il ne faut pas faire : le
 * changement d'état vit donc sur la fiche, où la capacité exigée dépend de
 * l'état visé (`projects.tasks.close` pour « Terminée »).
 */
function TaskBoard({ tasks }: { tasks: TaskListItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {TASK_BOARD_COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column)

        return (
          <section key={column} className="rounded-card border border-line bg-white">
            <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="font-display text-sm font-semibold text-ink">
                {TASK_STATUS_LABELS[column]}
              </h2>
              <Badge tone={TASK_STATUS_TONES[column]}>{columnTasks.length}</Badge>
            </header>

            <div className="space-y-2 p-3">
              {columnTasks.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted">Aucune tâche</p>
              ) : (
                columnTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/projets/taches/${task.id}`}
                    className="block rounded-control border border-line p-3 transition-colors hover:border-adikom-300"
                  >
                    <p className="text-sm font-medium text-ink">{task.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {task.projectLabel ?? 'Tâche indépendante'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {task.isLate && <Badge tone="danger">En retard</Badge>}
                      {task.priority !== 'NORMAL' && task.priority !== 'LOW' && (
                        <Badge tone={PRIORITY_TONES[task.priority]}>
                          {PRIORITY_LABELS[task.priority]}
                        </Badge>
                      )}
                      {task.dueOn && (
                        <span className="text-xs text-muted tabular">
                          {formatDate(task.dueOn)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
