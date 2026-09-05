import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckSquare, Gavel, Pencil, Plus } from 'lucide-react'

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
import { formatDate, formatDateTime } from '@/lib/dates'
import { listAssignableUsers, listProjectOptions } from '@/features/projects/data'
import { MeetingForm } from '@/features/planning/forms'
import {
  MeetingStatusForm,
  MinutesForm,
  NewActionForm,
  ParticipantsPanel,
} from '@/features/planning/panels'
import {
  ACTION_STATUS_LABELS,
  ACTION_STATUS_TONES,
  MEETING_STATUS_LABELS,
  PLANNING_NEXT_STATUSES,
  PLANNING_STATUS_TONES,
  formatDuration,
  getMeetingDetail,
  hasEnded,
  listActions,
  listDecisions,
  now,
} from '@/features/planning/data'

export const metadata: Metadata = { title: 'Fiche réunion' }

/**
 * Fiche réunion — Module 03 §21, §22, §23.
 *
 * LA RÉUNION EST UN POINT DE DÉPART, PAS UNE FIN.
 *
 * §46 pose l'enchaînement : réunion → décisions → actions. La fiche montre donc
 * les trois, chacune gouvernée par SA capacité — lire une réunion n'ouvre ni ses
 * décisions ni ses actions, et l'écran le DIT plutôt que d'afficher un vide
 * (DEC-017, DEC-024).
 *
 * CONSIGNER N'EST PAS ORGANISER.
 *
 * Le compte rendu (§23) n'apparaît qu'à qui détient
 * `projects.meetings.report` — une capacité distincte de `.update`, exigée de
 * nouveau par le déclencheur en base.
 */
export default async function MeetingDetailPage(props: PageProps<'/projets/reunions/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.MEETINGS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const meeting = await getMeetingDetail(id)
  if (!meeting) notFound()

  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'
  const decisionAdded = searchParams.decision === '1'

  const [canUpdate, canReport, canReadDecisions, canCreateDecision, canReadActions, canCreateAction] =
    await Promise.all([
      can(PERMISSIONS.MEETINGS_UPDATE),
      can(PERMISSIONS.MEETINGS_REPORT),
      can(PERMISSIONS.DECISIONS_VIEW),
      can(PERMISSIONS.DECISIONS_CREATE),
      can(PERMISSIONS.ACTIONS_VIEW),
      can(PERMISSIONS.ACTIONS_CREATE),
    ])

  if (editing) {
    const canReadProjects = await can(PERMISSIONS.PROJECTS_VIEW)
    const [users, projects] = await Promise.all([
      listAssignableUsers(),
      canReadProjects ? listProjectOptions() : Promise.resolve([]),
    ])

    return (
      <>
        <PageHeader
          title={meeting.title}
          description="Modification de la fiche réunion."
          actions={
            <Link
              href={`/projets/reunions/${meeting.id}`}
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Retour à la fiche
            </Link>
          }
        />

        <Card>
          <MeetingForm
            meeting={meeting}
            users={users}
            projects={projects}
            canReadProjects={canReadProjects}
            defaultStartsAt=""
            cancelHref={`/projets/reunions/${meeting.id}`}
          />
        </Card>
      </>
    )
  }

  const [decisions, actions, candidates] = await Promise.all([
    canReadDecisions ? listDecisions({ meetingId: meeting.id }) : Promise.resolve([]),
    canReadActions ? listActions({ meetingId: meeting.id }) : Promise.resolve([]),
    listAssignableUsers(),
  ])

  /*
   * « Terminée mais pas déclarée tenue » : la FIN est passée, pas le début.
   *
   * Aucune notification n'en découle — §38 ne nomme que « réunion à venir » —,
   * mais la fiche le rappelle à qui l'ouvre. L'instant est lu ICI et transmis :
   * un composant ne doit appeler aucune fonction impure pendant son rendu.
   */
  const past = hasEnded(meeting.startsAt, meeting.durationMinutes, now())

  return (
    <>
      <PageHeader
        title={meeting.title}
        description={meeting.objective ?? 'Aucun objectif renseigné.'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/projets/reunions"
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Réunions
            </Link>
            {canUpdate && meeting.status !== 'CANCELLED' && (
              <ButtonLink
                href={`/projets/reunions/${meeting.id}?mode=edition`}
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
          La réunion a été créée. Convoquez les participants, puis enregistrez son compte rendu
          lorsqu’elle aura eu lieu.
        </Notice>
      )}
      {justSaved && (
        <Notice tone="success" className="mb-5">
          Les modifications ont été enregistrées.
        </Notice>
      )}
      {decisionAdded && (
        <Notice tone="success" className="mb-5">
          La décision a été enregistrée et rattachée à cette réunion.
        </Notice>
      )}
      {meeting.status === 'CANCELLED' && (
        <Notice tone="info" className="mb-5">
          Cette réunion est <strong>annulée</strong>. Elle reste consultable et n’apparaît plus au
          calendrier ; ses décisions et ses actions, si elle en a produit, restent accessibles.
        </Notice>
      )}
      {meeting.status === 'PLANNED' && past && (
        <Notice tone="warning" className="mb-5">
          Cette réunion était prévue le {formatDateTime(meeting.startsAt)} et n’est toujours pas
          déclarée tenue. Son compte rendu reste à enregistrer.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Situation">
            <dl>
              <InfoRow label="État">
                <Badge tone={PLANNING_STATUS_TONES[meeting.status]}>
                  {MEETING_STATUS_LABELS[meeting.status]}
                </Badge>
                {meeting.statusReason && (
                  <p className="mt-1 text-xs text-muted">Motif : {meeting.statusReason}</p>
                )}
              </InfoRow>

              <InfoRow label="Date et heure">
                <span className="tabular">{formatDateTime(meeting.startsAt)}</span>
              </InfoRow>

              <InfoRow label="Durée">
                <span className="tabular">{formatDuration(meeting.durationMinutes)}</span>
              </InfoRow>

              <InfoRow label="Lieu">{meeting.location ?? <Empty />}</InfoRow>

              <InfoRow label="Responsable" hint="Qui la conduit (§21).">
                {meeting.ownerLabel ?? <Empty />}
              </InfoRow>

              <InfoRow label="Projet">
                {meeting.projectId && meeting.projectLabel ? (
                  meeting.projectLabel.startsWith('Projet non') ? (
                    meeting.projectLabel
                  ) : (
                    <Link
                      href={`/projets/${meeting.projectId}`}
                      className="text-adikom-500 hover:underline"
                    >
                      {meeting.projectLabel}
                    </Link>
                  )
                ) : (
                  <Empty />
                )}
              </InfoRow>

              <InfoRow label="Dernière modification">
                <span className="tabular">{formatDateTime(meeting.updatedAt)}</span>
              </InfoRow>
            </dl>
          </Card>

          <Card
            title="Ordre du jour"
            description="Les points à traiter (§21). La préparation se suit en tâches (§22)."
          >
            {meeting.agenda ? (
              <p className="whitespace-pre-line text-sm text-ink">{meeting.agenda}</p>
            ) : (
              <p className="text-sm text-muted">Aucun ordre du jour renseigné.</p>
            )}
          </Card>

          {/*
           * LE COMPTE RENDU — §23.
           *
           * Il est LISIBLE par qui lit la réunion, et MODIFIABLE par le seul
           * porteur de `projects.meetings.report`. Consulter ce qui s'est dit
           * n'est pas l'écrire.
           */}
          <Card
            title="Compte rendu"
            description={
              meeting.minutesRecordedAt
                ? `Enregistré le ${formatDateTime(meeting.minutesRecordedAt)}.`
                : 'Ce qui s’est dit, une fois la réunion tenue (§23).'
            }
          >
            {canReport ? (
              <MinutesForm
                meetingId={meeting.id}
                minutes={meeting.minutes}
                recordedAt={meeting.minutesRecordedAt}
              />
            ) : meeting.minutes ? (
              <p className="whitespace-pre-line text-sm text-ink">{meeting.minutes}</p>
            ) : (
              <Notice tone="info">
                Aucun compte rendu n’est encore enregistré. L’écrire relève de la permission{' '}
                <code className="tabular">projects.meetings.report</code>, distincte de la
                modification de la réunion.
              </Notice>
            )}
          </Card>

          <Card
            title="Décisions prises"
            description="Ce que la réunion a arrêté (§24)."
            actions={
              canCreateDecision && canReadDecisions ? (
                <ButtonLink
                  href={`/projets/decisions/nouvelle?reunion=${meeting.id}`}
                  tone="secondary"
                  icon={Plus}
                >
                  Enregistrer une décision
                </ButtonLink>
              ) : undefined
            }
          >
            {!canReadDecisions ? (
              <Notice tone="info">
                Les décisions de cette réunion ne vous sont pas accessibles — permission{' '}
                <code className="tabular">projects.decisions.view</code>. Cette réunion peut en
                porter.
              </Notice>
            ) : decisions.length === 0 ? (
              <EmptyState
                icon={Gavel}
                title="Aucune décision enregistrée"
                description="Une décision consignée ne se perd pas dans les échanges informels."
              />
            ) : (
              <ul className="space-y-2">
                {decisions.map((decision) => (
                  <li key={decision.id}>
                    <Link
                      href={`/projets/decisions/${decision.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3.5 py-2.5 transition-colors hover:border-adikom-300"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{decision.title}</p>
                        <p className="text-xs text-muted tabular">
                          {formatDate(decision.decidedOn)}
                          {decision.ownerLabel ? ` · ${decision.ownerLabel}` : ''}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Actions à effectuer"
            description="Ce qu’il reste à faire à la suite de cette réunion (§25)."
          >
            {!canReadActions ? (
              <Notice tone="info">
                Les actions de cette réunion ne vous sont pas accessibles — permission{' '}
                <code className="tabular">projects.actions.view</code>.
              </Notice>
            ) : (
              <div className="space-y-4">
                {actions.length === 0 ? (
                  <EmptyState
                    icon={CheckSquare}
                    title="Aucune action"
                    description="Une réunion sans suite n’engage personne."
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

                {canCreateAction && meeting.status !== 'CANCELLED' && (
                  <div className="border-t border-line pt-4">
                    <NewActionForm
                      origin={{ field: 'meetingId', id: meeting.id }}
                      users={candidates}
                    />
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Participants" description="Qui y prend part (§21).">
            <ParticipantsPanel
              kind={{ field: 'meetingId', id: meeting.id }}
              ownerId={meeting.ownerId}
              participants={meeting.participants}
              candidates={candidates}
              canManage={canUpdate && meeting.status !== 'CANCELLED'}
            />
          </Card>

          {(canUpdate || canReport) && (
            <Card title="Changer l’état" description="Le changement est journalisé (§31).">
              <MeetingStatusForm
                meetingId={meeting.id}
                allowed={PLANNING_NEXT_STATUSES[meeting.status]}
                canReport={canReport}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
