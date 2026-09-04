import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ListChecks, Pencil, Plus } from 'lucide-react'

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
import { gated, type Figure } from '@/lib/pilotage/figure'
import {
  PRIORITY_LABELS,
  PRIORITY_TONES,
  PROJECT_NEXT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  getProjectDetail,
  getTaskCounts,
  listAssignableUsers,
  listTasks,
  type TaskCounts,
} from '@/features/projects/data'
import { ProjectForm } from '@/features/projects/project-form'
import { Progress } from '@/features/projects/progress'
import { ArchiveProjectForm, MembersPanel, ProjectStatusForm } from '@/features/projects/panels'
import { listClientOptions } from '@/features/clients/data'
import { listSupplierOptions } from '@/features/suppliers/data'
import { listPartnerOptions } from '@/features/partners/data'

export const metadata: Metadata = { title: 'Fiche projet' }

/**
 * Fiche projet — Module 03 §6.
 *
 * « La fiche doit permettre de comprendre rapidement la situation du projet » :
 * l'objectif, le responsable, l'avancement réel et les tâches restantes tiennent
 * donc dans le premier écran.
 *
 * LES TÂCHES SONT UNE SECTION, PAS UNE PROMESSE.
 *
 * Sans `projects.tasks.view`, la section n'affiche pas « aucune tâche » — elle
 * DIT que la lecture n'est pas ouverte. Un projet sans tâche et un projet dont
 * on n'a pas le droit de lire les tâches ne sont pas la même chose (DEC-017).
 */
export default async function ProjectDetailPage(props: PageProps<'/projets/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.PROJECTS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const project = await getProjectDetail(id)
  if (!project) notFound()

  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'
  const taskAdded = searchParams.tache === '1'

  const [canUpdate, canArchive, canReadTasks, canCreateTask] = await Promise.all([
    can(PERMISSIONS.PROJECTS_UPDATE),
    can(PERMISSIONS.PROJECTS_ARCHIVE),
    can(PERMISSIONS.TASKS_VIEW),
    can(PERMISSIONS.TASKS_CREATE),
  ])

  const counts: Figure<TaskCounts | undefined> = await gated(
    'projet:avancement',
    [PERMISSIONS.TASKS_VIEW],
    async () => (await getTaskCounts(project.id)).get(project.id)
  )

  const tasks = canReadTasks ? await listTasks({ projectId: project.id }) : []

  if (editing) {
    const [canReadClients, canReadSuppliers, canReadPartners] = await Promise.all([
      can(PERMISSIONS.CLIENTS_VIEW),
      can(PERMISSIONS.SUPPLIERS_VIEW),
      can(PERMISSIONS.PARTNERS_VIEW),
    ])

    const [users, clients, suppliers, partners] = await Promise.all([
      listAssignableUsers(),
      canReadClients ? listClientOptions() : Promise.resolve([]),
      canReadSuppliers ? listSupplierOptions() : Promise.resolve([]),
      canReadPartners ? listPartnerOptions() : Promise.resolve([]),
    ])

    return (
      <>
        <PageHeader
          title={project.name}
          description="Modification de la fiche projet."
          actions={
            <Link
              href={`/projets/${project.id}`}
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Retour à la fiche
            </Link>
          }
        />

        <Card>
          <ProjectForm
            project={project}
            users={users}
            parties={{
              clients,
              suppliers,
              partners,
              canReadClients,
              canReadSuppliers,
              canReadPartners,
            }}
            cancelHref={`/projets/${project.id}`}
          />
        </Card>
      </>
    )
  }

  const members = await listAssignableUsers()

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.objective ?? 'Aucun objectif renseigné.'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/projets"
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Projets
            </Link>
            {canUpdate && (
              <ButtonLink
                href={`/projets/${project.id}?mode=edition`}
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
          Le projet a été créé. Ajoutez-y des tâches pour suivre son avancement.
        </Notice>
      )}
      {justSaved && (
        <Notice tone="success" className="mb-5">
          Les modifications ont été enregistrées.
        </Notice>
      )}
      {taskAdded && (
        <Notice tone="success" className="mb-5">
          La tâche a été créée et rattachée à ce projet.
        </Notice>
      )}
      {project.isArchived && (
        <Notice tone="info" className="mb-5">
          Ce projet est <strong>archivé</strong>. Ses données restent consultables ; aucune tâche
          nouvelle ne peut y être rattachée, et ses échéances n’alimentent plus les notifications.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Situation">
            <dl>
              <InfoRow label="État">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={PROJECT_STATUS_TONES[project.status]}>
                    {PROJECT_STATUS_LABELS[project.status]}
                  </Badge>
                  <Badge tone={PRIORITY_TONES[project.priority]}>
                    Priorité {PRIORITY_LABELS[project.priority].toLowerCase()}
                  </Badge>
                </div>
                {project.statusReason && (
                  <p className="mt-1 text-xs text-muted">Motif : {project.statusReason}</p>
                )}
              </InfoRow>

              <InfoRow label="Responsable" hint="Suit l’avancement général (§9).">
                {project.ownerLabel ?? <Empty />}
              </InfoRow>

              <InfoRow label="Tiers concerné">{project.partyLabel ?? <Empty />}</InfoRow>

              <InfoRow label="Période">
                <span className="tabular">
                  {formatDate(project.startsOn) ?? '—'} → {formatDate(project.dueOn) ?? '—'}
                </span>
              </InfoRow>

              <InfoRow label="Avancement">
                <Progress figure={counts} />
              </InfoRow>

              {project.description && (
                <InfoRow label="Description">
                  <p className="whitespace-pre-line">{project.description}</p>
                </InfoRow>
              )}

              <InfoRow label="Dernière modification">
                <span className="tabular">{formatDateTime(project.updatedAt)}</span>
              </InfoRow>
            </dl>
          </Card>

          <Card
            title="Tâches du projet"
            description="Ce qu’il reste à faire, et par qui."
            actions={
              canCreateTask && !project.isArchived ? (
                <ButtonLink
                  href={`/projets/taches/nouvelle?projet=${project.id}`}
                  tone="secondary"
                  icon={Plus}
                >
                  Nouvelle tâche
                </ButtonLink>
              ) : undefined
            }
          >
            {!canReadTasks ? (
              <Notice tone="info">
                Les tâches de ce projet ne vous sont pas accessibles — permission{' '}
                <code className="tabular">projects.tasks.view</code>. Ce projet peut en porter.
              </Notice>
            ) : tasks.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="Aucune tâche"
                description="Un projet sans tâche n’a pas d’avancement mesurable."
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
                          {task.assigneeLabel ?? 'Non attribuée'}
                          {task.dueOn ? ` · échéance ${formatDate(task.dueOn)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {task.isLate && <Badge tone="danger">En retard</Badge>}
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
        </div>

        <div className="space-y-5">
          <Card title="Équipe" description="Responsable, participants et observateurs (§9).">
            <MembersPanel
              projectId={project.id}
              members={project.members}
              candidates={members.filter((user) => user.id !== project.ownerId)}
              canManage={canUpdate && !project.isArchived}
            />
          </Card>

          {canUpdate && !project.isArchived && (
            <Card title="Changer l’état" description="Le changement est journalisé (§31).">
              <ProjectStatusForm
                projectId={project.id}
                allowed={PROJECT_NEXT_STATUSES[project.status]}
              />
            </Card>
          )}

          {canArchive && (
            <Card title="Archivage">
              <ArchiveProjectForm projectId={project.id} isArchived={project.isArchived} />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
