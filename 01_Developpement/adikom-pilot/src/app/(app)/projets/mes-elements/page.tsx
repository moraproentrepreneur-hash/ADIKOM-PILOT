import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FolderKanban, ListChecks } from 'lucide-react'

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { can, canAny, requireUser } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, todayISO } from '@/lib/dates'
import {
  PRIORITY_LABELS,
  PRIORITY_TONES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  listMyProjects,
  listMyTasks,
} from '@/features/projects/data'
import { moduleTabs } from '@/features/projects/tabs'

export const metadata: Metadata = { title: 'Mes éléments' }

/**
 * Vue personnelle — Module 03 §36.
 *
 * « Mes tâches, mes échéances, mes projets » : la vue FILTRE ce que l'utilisateur
 * a déjà le droit de lire, elle n'élargit rien. Sans `projects.tasks.view`, ses
 * propres tâches ne lui sont pas montrées — une vue personnelle n'est pas une
 * porte dérobée sur une capacité qu'il n'a pas (DEC-024).
 *
 * L'écran est accessible dès que l'une des deux lectures est détenue ; il DIT
 * laquelle manque plutôt que de présenter une moitié vide sans explication.
 */
export default async function MyItemsPage() {
  const user = await requireUser()

  const allowed = await canAny([PERMISSIONS.PROJECTS_VIEW, PERMISSIONS.TASKS_VIEW])
  if (!allowed && !user.isSuperAdmin) {
    redirect(`/acces-refuse?requis=${encodeURIComponent(PERMISSIONS.TASKS_VIEW)}`)
  }

  const [canReadProjects, canReadTasks] = await Promise.all([
    can(PERMISSIONS.PROJECTS_VIEW),
    can(PERMISSIONS.TASKS_VIEW),
  ])

  const readsProjects = canReadProjects || user.isSuperAdmin
  const readsTasks = canReadTasks || user.isSuperAdmin

  const [tasks, projects] = await Promise.all([
    readsTasks ? listMyTasks(user.id) : Promise.resolve([]),
    readsProjects ? listMyProjects(user.id) : Promise.resolve([]),
  ])

  const today = todayISO()
  const openTasks = tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED')
  const lateTasks = openTasks.filter((task) => task.isLate)
  const dueSoon = openTasks.filter((task) => task.dueOn && !task.isLate && task.dueOn <= today)

  return (
    <>
      <PageHeader
        title="Mes éléments"
        description={`Ce qui vous concerne, ${user.firstName} : vos tâches, vos échéances, vos projets.`}
      />

      <Tabs
        items={moduleTabs('mes-elements', { projects: readsProjects, tasks: readsTasks })}
        current="mes-elements"
      />

      {readsTasks && openTasks.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-xs font-medium text-muted">Tâches en cours</p>
            <p className="mt-2 font-display text-2xl font-semibold text-ink tabular">
              {openTasks.length}
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-muted">Échéance aujourd’hui</p>
            <p className="mt-2 font-display text-2xl font-semibold text-ink tabular">
              {dueSoon.length}
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-muted">En retard</p>
            <p
              className={`mt-2 font-display text-2xl font-semibold tabular ${
                lateTasks.length > 0 ? 'text-danger' : 'text-ink'
              }`}
            >
              {lateTasks.length}
            </p>
          </Card>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Mes tâches" description="Celles qui vous sont attribuées (§36).">
          {!readsTasks ? (
            <Notice tone="info">
              Vos tâches ne vous sont pas accessibles — permission{' '}
              <code className="tabular">projects.tasks.view</code>.
            </Notice>
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Aucune tâche ne vous est attribuée"
              description="Les tâches qui vous seront confiées apparaîtront ici."
            />
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/projets/taches/${task.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3.5 py-2.5 transition-colors hover:border-adikom-300"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{task.title}</p>
                      <p className="text-xs text-muted">
                        {task.projectLabel ?? 'Tâche indépendante'}
                        {task.dueOn ? ` · ${formatDate(task.dueOn)}` : ' · sans échéance'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {task.isLate && <Badge tone="danger">En retard</Badge>}
                      {task.priority === 'URGENT' && (
                        <Badge tone={PRIORITY_TONES.URGENT}>{PRIORITY_LABELS.URGENT}</Badge>
                      )}
                      <Badge tone={TASK_STATUS_TONES[task.status]}>
                        {TASK_STATUS_LABELS[task.status]}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Mes projets"
          description="Ceux dont vous êtes responsable, participant ou observateur."
        >
          {!readsProjects ? (
            <Notice tone="info">
              Vos projets ne vous sont pas accessibles — permission{' '}
              <code className="tabular">projects.view</code>.
            </Notice>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="Aucun projet ne vous concerne"
              description="Les projets dont vous êtes responsable ou participant apparaîtront ici."
            />
          ) : (
            <ul className="space-y-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projets/${project.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3.5 py-2.5 transition-colors hover:border-adikom-300"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{project.name}</p>
                      <p className="text-xs text-muted">
                        {project.dueOn ? `Échéance ${formatDate(project.dueOn)}` : 'Sans échéance'}
                      </p>
                    </div>
                    <Badge tone={PROJECT_STATUS_TONES[project.status]}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
