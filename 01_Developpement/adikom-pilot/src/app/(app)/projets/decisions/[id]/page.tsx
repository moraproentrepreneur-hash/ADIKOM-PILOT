import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckSquare, Pencil } from 'lucide-react'

import {
  Badge,
  ButtonLink,
  Card,
  Empty,
  EmptyState,
  InfoRow,
  PageHeader,
} from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime, todayISO } from '@/lib/dates'
import { listAssignableUsers, listProjectOptions } from '@/features/projects/data'
import { DecisionForm } from '@/features/planning/forms'
import { NewActionForm } from '@/features/planning/panels'
import {
  ACTION_STATUS_LABELS,
  ACTION_STATUS_TONES,
  getDecisionDetail,
  listActions,
  listMeetingOptions,
} from '@/features/planning/data'

export const metadata: Metadata = { title: 'Fiche décision' }

/**
 * Fiche décision — Module 03 §24, §25.
 *
 * « Décision : lancer le partenariat → Action : préparer la convention » (§25).
 * La fiche montre donc les actions qui en découlent, et permet d'en ajouter :
 * une décision sans suite reste une intention.
 *
 * ELLE NE SE SUPPRIME PAS.
 *
 * §24 la conserve pour qu'elle reste retrouvable, et la base refuse tout
 * DELETE. Elle se corrige — avec `projects.decisions.update` —, et le journal
 * d'audit garde l'avant et l'après (§21 de CLAUDE.md).
 */
export default async function DecisionDetailPage(props: PageProps<'/projets/decisions/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.DECISIONS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const decision = await getDecisionDetail(id)
  if (!decision) notFound()

  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'

  const [canUpdate, canReadActions, canCreateAction, canReadMeetings] = await Promise.all([
    can(PERMISSIONS.DECISIONS_UPDATE),
    can(PERMISSIONS.ACTIONS_VIEW),
    can(PERMISSIONS.ACTIONS_CREATE),
    can(PERMISSIONS.MEETINGS_VIEW),
  ])

  if (editing) {
    const canReadProjects = await can(PERMISSIONS.PROJECTS_VIEW)
    const [users, projects, meetings] = await Promise.all([
      listAssignableUsers(),
      canReadProjects ? listProjectOptions() : Promise.resolve([]),
      canReadMeetings ? listMeetingOptions() : Promise.resolve([]),
    ])

    return (
      <>
        <PageHeader
          title={decision.title}
          description="Modification de la décision. Le changement est journalisé."
          actions={
            <Link
              href={`/projets/decisions/${decision.id}`}
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Retour à la fiche
            </Link>
          }
        />

        <Card>
          <DecisionForm
            decision={decision}
            users={users}
            projects={projects}
            meetings={meetings}
            canReadProjects={canReadProjects}
            canReadMeetings={canReadMeetings}
            defaultDecidedOn={todayISO()}
            cancelHref={`/projets/decisions/${decision.id}`}
          />
        </Card>
      </>
    )
  }

  const [actions, candidates] = await Promise.all([
    canReadActions ? listActions({ decisionId: decision.id }) : Promise.resolve([]),
    listAssignableUsers(),
  ])

  return (
    <>
      <PageHeader
        title={decision.title}
        description={`Décision prise le ${formatDate(decision.decidedOn)}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/projets/decisions"
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Décisions
            </Link>
            {canUpdate && (
              <ButtonLink
                href={`/projets/decisions/${decision.id}?mode=edition`}
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
          La décision a été enregistrée. Ajoutez-y les actions qui en découlent (§25).
        </Notice>
      )}
      {justSaved && (
        <Notice tone="success" className="mb-5">
          Les modifications ont été enregistrées.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="La décision" description="Telle qu’elle a été prise (§24).">
            <p className="whitespace-pre-line text-sm text-ink">{decision.statement}</p>
          </Card>

          <Card title="Contexte" description="Ce qui y a conduit.">
            {decision.context ? (
              <p className="whitespace-pre-line text-sm text-ink">{decision.context}</p>
            ) : (
              <p className="text-sm text-muted">Aucun contexte renseigné.</p>
            )}
          </Card>

          <Card
            title="Actions résultantes"
            description="Ce qu’il faut faire pour que la décision s’applique (§25)."
          >
            {!canReadActions ? (
              <Notice tone="info">
                Les actions de cette décision ne vous sont pas accessibles — permission{' '}
                <code className="tabular">projects.actions.view</code>. Cette décision peut en
                porter.
              </Notice>
            ) : (
              <div className="space-y-4">
                {actions.length === 0 ? (
                  <EmptyState
                    icon={CheckSquare}
                    title="Aucune action"
                    description="Une décision sans action reste une intention."
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
                              {action.assigneeLabel ?? 'Non attribuée'}
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

                {canCreateAction && (
                  <div className="border-t border-line pt-4">
                    <NewActionForm
                      origin={{ field: 'decisionId', id: decision.id }}
                      users={candidates}
                    />
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Origine">
            <dl>
              <InfoRow label="Date">
                <span className="tabular">{formatDate(decision.decidedOn)}</span>
              </InfoRow>

              <InfoRow label="Responsable" hint="Qui répond de son application (§24).">
                {decision.ownerLabel ?? <Empty />}
              </InfoRow>

              <InfoRow label="Réunion">
                {decision.meetingId && decision.meetingLabel ? (
                  canReadMeetings && !decision.meetingLabel.startsWith('Réunion non') ? (
                    <Link
                      href={`/projets/reunions/${decision.meetingId}`}
                      className="text-adikom-500 hover:underline"
                    >
                      {decision.meetingLabel}
                    </Link>
                  ) : (
                    decision.meetingLabel
                  )
                ) : (
                  <Empty />
                )}
              </InfoRow>

              <InfoRow label="Projet">
                {decision.projectId && decision.projectLabel ? (
                  decision.projectLabel.startsWith('Projet non') ? (
                    decision.projectLabel
                  ) : (
                    <Link
                      href={`/projets/${decision.projectId}`}
                      className="text-adikom-500 hover:underline"
                    >
                      {decision.projectLabel}
                    </Link>
                  )
                ) : (
                  <Empty />
                )}
              </InfoRow>

              <InfoRow label="Dernière modification">
                <span className="tabular">{formatDateTime(decision.updatedAt)}</span>
              </InfoRow>
            </dl>
          </Card>

          <Card title="Conservation">
            <p className="text-sm text-muted">
              Une décision enregistrée ne se supprime pas : elle reste consultable pour que rien
              d’important ne se perde (§24, §48). Une correction est journalisée, avec l’état
              précédent.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
