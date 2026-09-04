'use client'

import { useActionState } from 'react'
import { Archive, ArchiveRestore, UserMinus, UserPlus } from 'lucide-react'

import { Badge, Button } from '@/components/ui/primitives'
import { Field, Input, Select } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  addProjectMemberAction,
  archiveProjectAction,
  removeProjectMemberAction,
  setProjectStatusAction,
  setTaskStatusAction,
  type ProjectFormState,
} from './actions'
import {
  MEMBER_ROLES,
  MEMBER_ROLE_HINTS,
  MEMBER_ROLE_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  type ProjectStatus,
  type TaskStatus,
} from './constants'
import type { Option, ProjectMember } from './data'

/**
 * Les gestes d'une fiche de projet ou de tâche.
 *
 * CHAQUE FORMULAIRE NE PROPOSE QUE CE QUI EST POSSIBLE.
 *
 * Les états offerts sont ceux que la base accepte depuis l'état courant
 * (`PROJECT_NEXT_STATUSES`, `TASK_NEXT_STATUSES`) : proposer une transition
 * qu'un déclencheur refusera ferait passer une règle métier pour une panne.
 *
 * Ce filtrage NE PROTÈGE RIEN — la base reste seule maîtresse, et la recette
 * éprouve l'appel direct.
 */

/* -------------------------------------------------------------------------- */
/*  Changement d'état                                                          */
/* -------------------------------------------------------------------------- */

export function ProjectStatusForm({
  projectId,
  allowed,
}: {
  projectId: string
  allowed: readonly ProjectStatus[]
}) {
  const [state, formAction] = useActionState<ProjectFormState, FormData>(
    setProjectStatusAction,
    EMPTY_FORM_STATE
  )

  if (allowed.length === 0) {
    return (
      <Notice tone="info">
        Cet état est définitif : un projet annulé ne se reprend pas. Un nouveau projet peut être
        ouvert si le travail reprend.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nouvel état" name="status">
          <Select name="status" defaultValue={allowed[0]}>
            {allowed.map((value) => (
              <option key={value} value={value}>
                {PROJECT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Motif" name="reason" hint="Conservé au journal d’activité.">
          <Input name="reason" maxLength={300} placeholder="Décision de la réunion du…" />
        </Field>
      </div>

      <SubmitButton label="Appliquer le changement" pendingLabel="Application…" />
    </form>
  )
}

/**
 * Changement d'état d'une tâche.
 *
 * « Terminée » n'est proposée qu'à qui détient `projects.tasks.close` : c'est
 * une capacité distincte de la modification (§42). Le masquage n'est qu'une
 * politesse — l'action serveur et le déclencheur exigent la même chose.
 */
export function TaskStatusForm({
  taskId,
  allowed,
  canClose,
}: {
  taskId: string
  allowed: readonly TaskStatus[]
  canClose: boolean
}) {
  const [state, formAction] = useActionState<ProjectFormState, FormData>(
    setTaskStatusAction,
    EMPTY_FORM_STATE
  )

  const offered = allowed.filter((value) => value !== 'DONE' || canClose)

  if (offered.length === 0) {
    return (
      <Notice tone="info">
        {allowed.length === 0
          ? 'Cet état est définitif : une tâche annulée ne se rouvre pas.'
          : 'Le seul changement possible depuis cet état est la clôture, qui demande la permission projects.tasks.close.'}
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="taskId" value={taskId} />
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nouvel état" name="status">
          <Select name="status" defaultValue={offered[0]}>
            {offered.map((value) => (
              <option key={value} value={value}>
                {TASK_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Motif" name="reason" hint="Conservé au journal d’activité.">
          <Input name="reason" maxLength={300} placeholder="En attente du fournisseur…" />
        </Field>
      </div>

      {!canClose && (
        <p className="text-xs text-muted">
          « Terminée » n’est pas proposée : elle relève de la permission{' '}
          <code className="tabular">projects.tasks.close</code>.
        </p>
      )}

      <SubmitButton label="Appliquer le changement" pendingLabel="Application…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Archivage — §48                                                            */
/* -------------------------------------------------------------------------- */

export function ArchiveProjectForm({
  projectId,
  isArchived,
}: {
  projectId: string
  isArchived: boolean
}) {
  const [state, formAction] = useActionState<ProjectFormState, FormData>(
    archiveProjectAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="archive" value={isArchived ? '0' : '1'} />

      <FormFeedback error={state.error} success={state.success} />

      <p className="text-sm text-muted">
        {isArchived
          ? 'Ce projet est rangé. Le restaurer le fait réapparaître dans la liste et rend ses tâches modifiables.'
          : 'Archiver range le projet sans rien supprimer : ses tâches et son historique restent consultables, et ses échéances cessent d’alimenter les notifications.'}
      </p>

      <SubmitButton
        label={isArchived ? 'Restaurer le projet' : 'Archiver le projet'}
        pendingLabel="Enregistrement…"
        tone="secondary"
        icon={isArchived ? ArchiveRestore : Archive}
      />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Participants — §9                                                          */
/* -------------------------------------------------------------------------- */

export function MembersPanel({
  projectId,
  members,
  candidates,
  canManage,
}: {
  projectId: string
  members: ProjectMember[]
  candidates: Option[]
  canManage: boolean
}) {
  const [addState, addAction] = useActionState<ProjectFormState, FormData>(
    addProjectMemberAction,
    EMPTY_FORM_STATE
  )
  const [removeState, removeAction] = useActionState<ProjectFormState, FormData>(
    removeProjectMemberAction,
    EMPTY_FORM_STATE
  )

  const alreadyIn = new Set(members.map((member) => member.userId))
  const available = candidates.filter((candidate) => !alreadyIn.has(candidate.id))

  return (
    <div className="space-y-4">
      <FormFeedback error={addState.error ?? removeState.error} success={addState.success ?? removeState.success} />

      {members.length === 0 ? (
        <p className="text-sm text-muted">
          Aucun participant. Seul le responsable suit ce projet.
        </p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm text-ink">{member.label}</p>
                {member.jobTitle && <p className="text-xs text-muted">{member.jobTitle}</p>}
              </div>

              <div className="flex items-center gap-2">
                <Badge tone={member.role === 'PARTICIPANT' ? 'info' : 'neutral'}>
                  {MEMBER_ROLE_LABELS[member.role]}
                </Badge>

                {canManage && (
                  <form action={removeAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="userId" value={member.userId} />
                    <Button
                      type="submit"
                      tone="secondary"
                      icon={UserMinus}
                      className="px-2.5 py-1.5 text-xs"
                    >
                      Retirer
                    </Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage &&
        (available.length === 0 ? (
          <Notice tone="info">
            Aucun autre utilisateur ne vous est accessible. La composition d’une équipe suppose de
            pouvoir consulter les utilisateurs (<code className="tabular">users.users.view</code>).
          </Notice>
        ) : (
          <form action={addAction} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <input type="hidden" name="projectId" value={projectId} />

            <Field label="Ajouter" name="userId">
              <Select name="userId" defaultValue="">
                <option value="">Choisir une personne</option>
                {available.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Rôle" name="role" hint={MEMBER_ROLE_HINTS.PARTICIPANT}>
              <Select name="role" defaultValue="PARTICIPANT">
                {MEMBER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {MEMBER_ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="pb-0.5">
              <SubmitButton label="Ajouter" pendingLabel="Ajout…" icon={UserPlus} tone="secondary" />
            </div>
          </form>
        ))}
    </div>
  )
}
