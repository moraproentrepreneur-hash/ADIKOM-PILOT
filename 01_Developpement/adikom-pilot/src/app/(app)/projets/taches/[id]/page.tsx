import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'

import {
  Badge,
  ButtonLink,
  Card,
  Empty,
  InfoRow,
  PageHeader,
} from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import {
  PRIORITY_LABELS,
  PRIORITY_TONES,
  TASK_NEXT_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  getTaskDetail,
  listAssignableUsers,
  listProjectOptions,
} from '@/features/projects/data'
import { TaskForm } from '@/features/projects/task-form'
import { TaskStatusForm } from '@/features/projects/panels'

export const metadata: Metadata = { title: 'Fiche tâche' }

/**
 * Fiche tâche — Module 03 §11.
 *
 * LE RETARD SE LIT, IL NE SE STOCKE PAS.
 *
 * §16 : « lorsqu'une échéance est dépassée et que la tâche n'est pas terminée,
 * le système doit pouvoir la considérer comme en retard ». Le mot « considérer »
 * est le bon : c'est une lecture, refaite à chaque affichage sur le jour civil
 * des Comores, jamais un statut écrit qui deviendrait faux le lendemain.
 */
export default async function TaskDetailPage(props: PageProps<'/projets/taches/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.TASKS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const task = await getTaskDetail(id)
  if (!task) notFound()

  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'

  const [canUpdate, canClose, canReadProjects] = await Promise.all([
    can(PERMISSIONS.TASKS_UPDATE),
    can(PERMISSIONS.TASKS_CLOSE),
    can(PERMISSIONS.PROJECTS_VIEW),
  ])

  if (editing) {
    const [users, projects] = await Promise.all([
      listAssignableUsers(),
      canReadProjects ? listProjectOptions() : Promise.resolve([]),
    ])

    return (
      <>
        <PageHeader
          title={task.title}
          description="Modification de la tâche."
          actions={
            <Link
              href={`/projets/taches/${task.id}`}
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Retour à la tâche
            </Link>
          }
        />

        <Card>
          <TaskForm
            task={task}
            projects={projects}
            users={users}
            cancelHref={`/projets/taches/${task.id}`}
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={task.title}
        description={task.projectLabel ?? 'Tâche indépendante de tout projet.'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/projets/taches"
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Tâches
            </Link>
            {canUpdate && (
              <ButtonLink
                href={`/projets/taches/${task.id}?mode=edition`}
                tone="secondary"
                icon={Pencil}
              >
                Modifier
              </ButtonLink>
            )}
          </div>
        }
      />

      {justCreated && (
        <Notice tone="success" className="mb-5">
          La tâche a été créée.
        </Notice>
      )}
      {justSaved && (
        <Notice tone="success" className="mb-5">
          Les modifications ont été enregistrées.
        </Notice>
      )}
      {task.isLate && (
        <Notice tone="warning" className="mb-5">
          Cette tâche est <strong>en retard</strong> : son échéance du{' '}
          {formatDate(task.dueOn)} est dépassée et elle n’est pas terminée.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Tâche">
            <dl>
              <InfoRow label="État">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TASK_STATUS_TONES[task.status]}>
                    {TASK_STATUS_LABELS[task.status]}
                  </Badge>
                  <Badge tone={PRIORITY_TONES[task.priority]}>
                    Priorité {PRIORITY_LABELS[task.priority].toLowerCase()}
                  </Badge>
                  {task.isLate && <Badge tone="danger">En retard</Badge>}
                </div>
                {task.statusReason && (
                  <p className="mt-1 text-xs text-muted">Motif : {task.statusReason}</p>
                )}
              </InfoRow>

              <InfoRow label="Projet">
                {task.projectId && task.projectLabel ? (
                  canReadProjects ? (
                    <Link
                      href={`/projets/${task.projectId}`}
                      className="text-adikom-500 hover:underline"
                    >
                      {task.projectLabel}
                    </Link>
                  ) : (
                    task.projectLabel
                  )
                ) : (
                  <span className="text-muted">Tâche indépendante</span>
                )}
              </InfoRow>

              <InfoRow label="Responsable">{task.assigneeLabel ?? <Empty />}</InfoRow>

              <InfoRow label="Période">
                <span className="tabular">
                  {formatDate(task.startsOn) ?? '—'} → {formatDate(task.dueOn) ?? '—'}
                </span>
              </InfoRow>

              {task.completedAt && (
                <InfoRow label="Terminée le">
                  <span className="tabular">{formatDateTime(task.completedAt)}</span>
                </InfoRow>
              )}

              {task.description && (
                <InfoRow label="Description">
                  <p className="whitespace-pre-line">{task.description}</p>
                </InfoRow>
              )}

              <InfoRow label="Dernière modification">
                <span className="tabular">{formatDateTime(task.updatedAt)}</span>
              </InfoRow>
            </dl>
          </Card>
        </div>

        <div className="space-y-5">
          {canUpdate || canClose ? (
            <Card title="Changer l’état" description="Le changement est journalisé (§31).">
              <TaskStatusForm
                taskId={task.id}
                allowed={TASK_NEXT_STATUSES[task.status]}
                canClose={canClose}
              />
            </Card>
          ) : (
            <Card title="Changer l’état">
              <Notice tone="info">
                Vous consultez cette tâche sans pouvoir la modifier — permissions{' '}
                <code className="tabular">projects.tasks.update</code> et{' '}
                <code className="tabular">projects.tasks.close</code>.
              </Notice>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
