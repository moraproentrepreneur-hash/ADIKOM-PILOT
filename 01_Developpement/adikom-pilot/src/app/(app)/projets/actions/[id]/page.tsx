import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Badge, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import { TASK_STATUS_LABELS, TASK_STATUS_TONES, listAssignableUsers } from '@/features/projects/data'
import {
  ActionStatusForm,
  EditActionForm,
  TransformActionForm,
} from '@/features/planning/panels'
import {
  ACTION_NEXT_STATUSES,
  ACTION_STATUS_LABELS,
  ACTION_STATUS_TONES,
  getActionDetail,
} from '@/features/planning/data'

export const metadata: Metadata = { title: 'Fiche action' }

/**
 * Fiche action — Module 03 §25.
 *
 * C'EST ICI QUE VIT LA TRANSFORMATION EN TÂCHE.
 *
 * « Une action peut être transformée en tâche lorsqu'un suivi détaillé est
 * nécessaire. » L'acte crée une VRAIE tâche : il exige donc aussi
 * `projects.tasks.create`, et l'écran le DIT lorsqu'elle manque, plutôt que
 * d'offrir un bouton qui échouerait (DEC-017, DEC-036 §c).
 *
 * UNE FOIS TRANSFORMÉE, L'ACTION N'A PLUS D'ÉTAT PROPRE.
 *
 * Le suivi appartient à la tâche, et la base gèle la colonne. La fiche montre
 * alors l'état de la TÂCHE — ou dit qu'elle n'est pas lisible, ce qui n'est pas
 * la même chose qu'un état ancien.
 */
export default async function ActionDetailPage(props: PageProps<'/projets/actions/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.ACTIONS_VIEW)

  const { id } = await props.params
  const action = await getActionDetail(id)
  if (!action) notFound()

  const [canUpdate, canCreateTask, canReadMeetings, canReadDecisions, canReadTasks] =
    await Promise.all([
      can(PERMISSIONS.ACTIONS_UPDATE),
      can(PERMISSIONS.TASKS_CREATE),
      can(PERMISSIONS.MEETINGS_VIEW),
      can(PERMISSIONS.DECISIONS_VIEW),
      can(PERMISSIONS.TASKS_VIEW),
    ])

  const users = await listAssignableUsers()

  const transformed = Boolean(action.taskId)
  const origin = action.decisionId
    ? { href: `/projets/decisions/${action.decisionId}`, label: 'la décision', open: canReadDecisions }
    : { href: `/projets/reunions/${action.meetingId}`, label: 'la réunion', open: canReadMeetings }

  return (
    <>
      <PageHeader
        title={action.title}
        description={`À la suite de ${origin.label} « ${action.decisionLabel ?? action.meetingLabel} ».`}
        actions={
          <Link
            href="/projets/actions"
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Actions
          </Link>
        }
      />

      {transformed && (
        <Notice tone="info" className="mb-5">
          Cette action est <strong>suivie comme tâche</strong>. Son état est désormais celui de la
          tâche : le modifier ici créerait deux vérités pour un même travail.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Situation">
            <dl>
              <InfoRow label="État">
                {transformed ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">Suivie comme tâche</Badge>
                    {action.taskStatus ? (
                      <Badge tone={TASK_STATUS_TONES[action.taskStatus]}>
                        {TASK_STATUS_LABELS[action.taskStatus]}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted">
                        L’état de la tâche n’est pas lisible — permission{' '}
                        <code className="tabular">projects.tasks.view</code>.
                      </span>
                    )}
                  </div>
                ) : (
                  <Badge tone={ACTION_STATUS_TONES[action.status]}>
                    {ACTION_STATUS_LABELS[action.status]}
                  </Badge>
                )}
                {action.statusReason && (
                  <p className="mt-1 text-xs text-muted">Motif : {action.statusReason}</p>
                )}
              </InfoRow>

              <InfoRow label="Responsable">{action.assigneeLabel ?? <Empty />}</InfoRow>

              <InfoRow label="Échéance">
                {action.dueOn ? (
                  <span className={action.isLate ? 'text-danger tabular' : 'tabular'}>
                    {formatDate(action.dueOn)}
                    {action.isLate && ' · en retard'}
                  </span>
                ) : (
                  <Empty />
                )}
              </InfoRow>

              <InfoRow label="Origine" hint="Une action découle toujours d’un moment (§25).">
                {origin.open ? (
                  <Link href={origin.href} className="text-adikom-500 hover:underline">
                    {action.decisionLabel ?? action.meetingLabel}
                  </Link>
                ) : (
                  (action.decisionLabel ?? action.meetingLabel)
                )}
              </InfoRow>

              {action.completedAt && (
                <InfoRow label="Terminée le">
                  <span className="tabular">{formatDateTime(action.completedAt)}</span>
                </InfoRow>
              )}

              {transformed && (
                <InfoRow label="Tâche de suivi">
                  {canReadTasks && action.taskId ? (
                    <Link
                      href={`/projets/taches/${action.taskId}`}
                      className="text-adikom-500 hover:underline"
                    >
                      {action.taskLabel}
                    </Link>
                  ) : (
                    action.taskLabel
                  )}
                  {action.taskLinkedAt && (
                    <p className="mt-1 text-xs text-muted tabular">
                      Transformée le {formatDateTime(action.taskLinkedAt)}
                    </p>
                  )}
                </InfoRow>
              )}

              <InfoRow label="Dernière modification">
                <span className="tabular">{formatDateTime(action.updatedAt)}</span>
              </InfoRow>
            </dl>
          </Card>

          <Card title="Description">
            {action.description ? (
              <p className="whitespace-pre-line text-sm text-ink">{action.description}</p>
            ) : (
              <p className="text-sm text-muted">Aucune description.</p>
            )}
          </Card>

          {canUpdate && (
            <Card title="Modifier l’action" description="Libellé, responsable et échéance.">
              <EditActionForm action={action} users={users} />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {canUpdate && !transformed && (
            <Card title="Changer l’état" description="Le changement est journalisé (§31).">
              <ActionStatusForm
                actionId={action.id}
                allowed={ACTION_NEXT_STATUSES[action.status]}
              />
            </Card>
          )}

          {canUpdate && !transformed && action.status === 'TODO' && (
            <Card
              title="Transformer en tâche"
              description="Lorsqu’un suivi détaillé est nécessaire (§25)."
            >
              <TransformActionForm actionId={action.id} canCreateTask={canCreateTask} />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
