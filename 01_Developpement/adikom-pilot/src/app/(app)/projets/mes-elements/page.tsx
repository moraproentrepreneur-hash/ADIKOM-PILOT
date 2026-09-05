import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarClock, CheckSquare, FolderKanban, ListChecks, Users2 } from 'lucide-react'

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { requireUser } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime, todayISO } from '@/lib/dates'
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
import { moduleAccess } from '@/features/projects/access'
import { moduleTabs } from '@/features/projects/tabs'
import {
  ACTION_STATUS_LABELS,
  ACTION_STATUS_TONES,
  APPOINTMENT_STATUS_LABELS,
  MEETING_STATUS_LABELS,
  PLANNING_STATUS_TONES,
  formatDuration,
  listMyActions,
  listMyAppointments,
  listMyMeetings,
} from '@/features/planning/data'

export const metadata: Metadata = { title: 'Mes éléments' }

/**
 * Vue personnelle — Module 03 §36.
 *
 * « Mes tâches, mes échéances, mes réunions, mes rendez-vous, mes projets » :
 * les cinq sections que le §36 énumère, plus les actions qui lui sont confiées
 * (§43 — « suivre les actions »).
 *
 * LA VUE FILTRE, ELLE N'ÉLARGIT RIEN.
 *
 * « Cette vue doit être construite selon les données réellement attribuées à
 * l'utilisateur » : sans `projects.meetings.view`, ses propres réunions ne lui
 * sont pas montrées. Une vue personnelle n'est pas une porte dérobée sur une
 * capacité qu'il n'a pas (DEC-024).
 *
 * L'écran est accessible dès qu'une seule des lectures est détenue ; il DIT
 * lesquelles manquent plutôt que de présenter des sections vides sans
 * explication (DEC-017).
 */
export default async function MyItemsPage() {
  const user = await requireUser()
  const access = await moduleAccess()

  const anyAccess =
    access.projects || access.tasks || access.meetings || access.appointments || access.actions

  if (!anyAccess) {
    redirect(`/acces-refuse?requis=${encodeURIComponent(PERMISSIONS.TASKS_VIEW)}`)
  }

  const [tasks, projects, meetings, appointments, actions] = await Promise.all([
    access.tasks ? listMyTasks(user.id) : Promise.resolve([]),
    access.projects ? listMyProjects(user.id) : Promise.resolve([]),
    access.meetings ? listMyMeetings(user.id) : Promise.resolve([]),
    access.appointments ? listMyAppointments(user.id) : Promise.resolve([]),
    access.actions ? listMyActions(user.id) : Promise.resolve([]),
  ])

  const today = todayISO()
  const openTasks = tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED')
  const lateTasks = openTasks.filter((task) => task.isLate)
  const dueSoon = openTasks.filter((task) => task.dueOn && !task.isLate && task.dueOn <= today)

  // §37 : « actions en attente ». Celles qui sont passées en tâche ne comptent
  // plus ici — leur suivi a changé de main, et les compter deux fois gonflerait
  // artificiellement ce qui reste à faire.
  const pendingActions = actions.filter((action) => action.status === 'TODO' && !action.taskId)

  return (
    <>
      <PageHeader
        title="Mes éléments"
        description={`Ce qui vous concerne, ${user.firstName} : vos tâches, vos échéances, vos réunions et vos rendez-vous.`}
      />

      <Tabs items={moduleTabs('mes-elements', access)} current="mes-elements" />

      {(access.tasks || access.actions) && (openTasks.length > 0 || pendingActions.length > 0) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {access.tasks && (
            <>
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
            </>
          )}
          {access.actions && (
            <Card>
              <p className="text-xs font-medium text-muted">Actions en attente</p>
              <p
                data-compteur="actions-en-attente"
                data-compteur-valeur={pendingActions.length}
                className="mt-2 font-display text-2xl font-semibold text-ink tabular"
              >
                {pendingActions.length}
              </p>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Mes tâches" description="Celles qui vous sont attribuées (§36).">
          {!access.tasks ? (
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
          {!access.projects ? (
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

        <Card
          title="Mes réunions"
          description="Celles que vous conduisez ou auxquelles vous êtes convoqué (§36)."
        >
          {!access.meetings ? (
            <Notice tone="info">
              Vos réunions ne vous sont pas accessibles — permission{' '}
              <code className="tabular">projects.meetings.view</code>.
            </Notice>
          ) : meetings.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="Aucune réunion ne vous concerne"
              description="Les réunions que vous conduisez ou auxquelles vous participez apparaîtront ici."
            />
          ) : (
            <ul className="space-y-2">
              {meetings.map((meeting) => (
                <li key={meeting.id}>
                  <Link
                    href={`/projets/reunions/${meeting.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3.5 py-2.5 transition-colors hover:border-adikom-300"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{meeting.title}</p>
                      <p className="text-xs text-muted tabular">
                        {formatDateTime(meeting.startsAt)}
                        {meeting.location ? ` · ${meeting.location}` : ''}
                      </p>
                    </div>
                    <Badge tone={PLANNING_STATUS_TONES[meeting.status]}>
                      {MEETING_STATUS_LABELS[meeting.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Mes rendez-vous"
          description="Ceux dont vous êtes responsable ou auxquels vous participez (§36)."
        >
          {!access.appointments ? (
            <Notice tone="info">
              Vos rendez-vous ne vous sont pas accessibles — permission{' '}
              <code className="tabular">projects.appointments.view</code>.
            </Notice>
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Aucun rendez-vous ne vous concerne"
              description="Les rendez-vous qui vous seront confiés apparaîtront ici."
            />
          ) : (
            <ul className="space-y-2">
              {appointments.map((appointment) => (
                <li key={appointment.id}>
                  <Link
                    href={`/projets/rendez-vous/${appointment.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3.5 py-2.5 transition-colors hover:border-adikom-300"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{appointment.subject}</p>
                      <p className="text-xs text-muted tabular">
                        {formatDateTime(appointment.startsAt)}
                        {appointment.partyLabel ? ` · ${appointment.partyLabel}` : ''}
                      </p>
                    </div>
                    <Badge tone={PLANNING_STATUS_TONES[appointment.status]}>
                      {APPOINTMENT_STATUS_LABELS[appointment.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Mes actions"
          description="Ce qui vous a été confié à la suite d’une réunion ou d’une décision (§25)."
          className="lg:col-span-2"
        >
          {!access.actions ? (
            <Notice tone="info">
              Vos actions ne vous sont pas accessibles — permission{' '}
              <code className="tabular">projects.actions.view</code>.
            </Notice>
          ) : actions.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="Aucune action ne vous est confiée"
              description="Les actions issues des réunions et des décisions apparaîtront ici."
            />
          ) : (
            <ul className="space-y-2">
              {actions.map((action) => (
                <li key={action.id}>
                  <Link
                    href={`/projets/actions/${action.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3.5 py-2.5 transition-colors hover:border-adikom-300"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{action.title}</p>
                      <p className="text-xs text-muted">
                        {action.decisionLabel ?? action.meetingLabel}
                        {action.dueOn ? ` · échéance ${formatDate(action.dueOn)}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {action.isLate && <Badge tone="danger">En retard</Badge>}
                      {action.taskId ? (
                        <Badge tone="info">Suivie comme tâche</Badge>
                      ) : (
                        <Badge tone={ACTION_STATUS_TONES[action.status]}>
                          {ACTION_STATUS_LABELS[action.status]}
                        </Badge>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {access.meetings && meetings.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Durée totale de vos prochaines réunions :{' '}
          <span className="tabular">
            {formatDuration(
              meetings
                .filter((meeting) => meeting.status === 'PLANNED')
                .reduce((total, meeting) => total + meeting.durationMinutes, 0)
            ) ?? 'aucune réunion à venir'}
          </span>
          .
        </p>
      )}
    </>
  )
}
