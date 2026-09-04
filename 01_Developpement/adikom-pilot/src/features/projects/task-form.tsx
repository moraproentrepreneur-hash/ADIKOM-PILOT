'use client'

import { useActionState } from 'react'
import Link from 'next/link'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { createTaskAction, updateTaskAction, type ProjectFormState } from './actions'
import { PRIORITIES, PRIORITY_LABELS } from './constants'
import type { Option, TaskDetail } from './data'

/**
 * Fiche tâche — Module 03 §11.
 *
 * UNE TÂCHE PEUT N'APPARTENIR À AUCUN PROJET.
 *
 * §10 le pose : une tâche peut être indépendante. Le champ « Projet » commence
 * donc sur « Aucun », et ce n'est pas un oubli de saisie — « rappeler le
 * fournisseur A » n'a pas toujours de projet, et l'obliger à en avoir un
 * conduirait à en créer d'artificiels.
 *
 * L'ÉCHÉANCE AUSSI EST FACULTATIVE.
 *
 * §14 distingue explicitement les « tâches sans échéance » : elles existent, et
 * la liste sait les retrouver. Une tâche sans échéance n'est jamais en retard.
 */
export function TaskForm({
  task,
  projects,
  users,
  defaultProjectId,
  /** Retour vers la fiche projet lorsque la tâche y est créée. */
  returnTo,
  cancelHref,
}: {
  task?: TaskDetail
  projects: Option[]
  users: Option[]
  defaultProjectId?: string
  returnTo?: string
  cancelHref: string
}) {
  const [state, formAction] = useActionState<ProjectFormState, FormData>(
    task ? updateTaskAction : createTaskAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      {task && <input type="hidden" name="taskId" value={task.id} />}
      {returnTo && <input type="hidden" name="retour" value={returnTo} />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Tâche" description="Ce qu’il y a à faire, en une phrase.">
        <Field label="Titre" name="title" required error={errors.title} wide>
          <Input
            name="title"
            defaultValue={task?.title ?? ''}
            error={errors.title}
            placeholder="Préparer le dossier fournisseur"
            maxLength={200}
          />
        </Field>

        <Field label="Description" name="description" error={errors.description} wide>
          <Textarea
            name="description"
            defaultValue={task?.description ?? ''}
            error={errors.description}
            rows={4}
          />
        </Field>

        <Field
          label="Projet"
          name="projectId"
          error={errors.projectId}
          hint="Facultatif : une tâche peut être indépendante (§10)."
        >
          <Select
            name="projectId"
            defaultValue={task?.projectId ?? defaultProjectId ?? ''}
            error={errors.projectId}
          >
            <option value="">Aucun projet</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Priorité"
          name="priority"
          error={errors.priority}
        >
          <Select name="priority" defaultValue={task?.priority ?? 'NORMAL'} error={errors.priority}>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title="Responsable et échéance"
        description="Qui s’en charge, et pour quand (§13, §14)."
      >
        <Field
          label="Responsable"
          name="assigneeId"
          error={errors.assigneeId}
          hint={
            users.length <= 1
              ? 'La liste des utilisateurs n’est pas accessible avec vos droits (users.users.view).'
              : undefined
          }
        >
          <Select
            name="assigneeId"
            defaultValue={task?.assigneeId ?? ''}
            error={errors.assigneeId}
          >
            <option value="">Non attribuée</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
                {user.description ? ` · ${user.description}` : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Date de début" name="startsOn" error={errors.startsOn}>
          <Input
            name="startsOn"
            type="date"
            defaultValue={task?.startsOn ?? ''}
            error={errors.startsOn}
          />
        </Field>

        <Field
          label="Échéance"
          name="dueOn"
          error={errors.dueOn}
          hint="Sans échéance, la tâche ne peut pas être en retard."
        >
          <Input name="dueOn" type="date" defaultValue={task?.dueOn ?? ''} error={errors.dueOn} />
        </Field>
      </FormSection>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton label={task ? 'Enregistrer les modifications' : 'Créer la tâche'} />
        <Link href={cancelHref} className="text-sm text-muted hover:text-ink">
          Annuler
        </Link>
      </div>
    </form>
  )
}
