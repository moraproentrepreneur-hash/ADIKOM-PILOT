'use client'

import { useActionState } from 'react'
import { ListChecks, UserMinus, UserPlus } from 'lucide-react'

import { Badge, Button } from '@/components/ui/primitives'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  addAppointmentParticipantAction,
  addMeetingParticipantAction,
  createActionAction,
  recordMinutesAction,
  removeAppointmentParticipantAction,
  removeMeetingParticipantAction,
  setActionStatusAction,
  setAppointmentStatusAction,
  setMeetingStatusAction,
  transformActionAction,
  updateActionAction,
  type PlanningFormState,
} from './actions'
import {
  ACTION_STATUS_LABELS,
  APPOINTMENT_STATUS_LABELS,
  MEETING_STATUS_LABELS,
  type ActionStatus,
  type PlanningStatus,
} from './constants'
import type { Option, Participant } from './data'

/**
 * Les gestes des fiches du second volet.
 *
 * CHAQUE FORMULAIRE NE PROPOSE QUE CE QUI EST POSSIBLE.
 *
 * Les états offerts sont ceux que la base accepte depuis l'état courant
 * (`PLANNING_NEXT_STATUSES`, `ACTION_NEXT_STATUSES`) : proposer une transition
 * qu'un déclencheur refusera ferait passer une règle métier pour une panne.
 *
 * Ce filtrage NE PROTÈGE RIEN — la base reste seule maîtresse, et la recette
 * éprouve l'appel direct.
 */

/* -------------------------------------------------------------------------- */
/*  Changement d'état d'une réunion — §21, §23                                 */
/* -------------------------------------------------------------------------- */

/**
 * « Tenue » n'est proposée qu'à qui détient `projects.meetings.report`.
 *
 * Déclarer qu'une réunion a eu lieu, c'est en ouvrir le compte rendu : §23 et
 * §43 en font un acte distinct de l'organisation. Le masquage n'est qu'une
 * politesse — l'action serveur et le déclencheur exigent la même chose.
 */
export function MeetingStatusForm({
  meetingId,
  allowed,
  canReport,
}: {
  meetingId: string
  allowed: readonly PlanningStatus[]
  canReport: boolean
}) {
  const [state, formAction] = useActionState<PlanningFormState, FormData>(
    setMeetingStatusAction,
    EMPTY_FORM_STATE
  )

  const offered = allowed.filter((value) => value !== 'HELD' || canReport)

  if (offered.length === 0) {
    return (
      <Notice tone="info">
        {allowed.length === 0
          ? 'Cet état est définitif : une réunion annulée ne se reprend pas. Une nouvelle réunion peut être convoquée.'
          : 'Le seul changement possible depuis cet état est de la déclarer tenue, ce qui relève de la permission projects.meetings.report.'}
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nouvel état" name="status">
          <Select name="status" defaultValue={offered[0]}>
            {offered.map((value) => (
              <option key={value} value={value}>
                {MEETING_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Motif" name="reason" hint="Conservé au journal d’activité.">
          <Input name="reason" maxLength={300} placeholder="Reportée à la semaine prochaine…" />
        </Field>
      </div>

      {!canReport && (
        <p className="text-xs text-muted">
          « Tenue » n’est pas proposée : elle relève de la permission{' '}
          <code className="tabular">projects.meetings.report</code>.
        </p>
      )}

      <SubmitButton label="Appliquer le changement" pendingLabel="Application…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Compte rendu — §23                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Un seul acte, deux gestes : consigner ce qui s'est dit, et déclarer que la
 * réunion a eu lieu. Les séparer rendrait `projects.meetings.report`
 * inutilisable seule — il faudrait `.update` pour poser l'état.
 */
export function MinutesForm({
  meetingId,
  minutes,
  recordedAt,
}: {
  meetingId: string
  minutes: string | null
  recordedAt: string | null
}) {
  const [state, formAction] = useActionState<PlanningFormState, FormData>(
    recordMinutesAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Compte rendu"
        name="minutes"
        required
        error={errors.minutes}
        hint="Sujets abordés, informations importantes, suites à donner (§23). Les décisions et les actions s’enregistrent séparément, pour être retrouvées."
      >
        <Textarea
          name="minutes"
          defaultValue={minutes ?? ''}
          error={errors.minutes}
          rows={10}
          placeholder={'Participants présents…\n\nPoints abordés…\n\nSuites à donner…'}
        />
      </Field>

      {recordedAt && (
        <p className="text-xs text-muted">
          Un compte rendu est déjà enregistré. L’enregistrer de nouveau le remplace, et le
          changement est journalisé (§31).
        </p>
      )}

      <SubmitButton
        label={recordedAt ? 'Mettre à jour le compte rendu' : 'Enregistrer le compte rendu'}
        pendingLabel="Enregistrement…"
      />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Changement d'état d'un rendez-vous — §26                                   */
/* -------------------------------------------------------------------------- */

export function AppointmentStatusForm({
  appointmentId,
  allowed,
}: {
  appointmentId: string
  allowed: readonly PlanningStatus[]
}) {
  const [state, formAction] = useActionState<PlanningFormState, FormData>(
    setAppointmentStatusAction,
    EMPTY_FORM_STATE
  )

  if (allowed.length === 0) {
    return (
      <Notice tone="info">
        Cet état est définitif : un rendez-vous annulé ne se reprend pas. Un nouveau rendez-vous
        peut être fixé.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nouvel état" name="status">
          <Select name="status" defaultValue={allowed[0]}>
            {allowed.map((value) => (
              <option key={value} value={value}>
                {APPOINTMENT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Motif" name="reason" hint="Conservé au journal d’activité.">
          <Input name="reason" maxLength={300} placeholder="Reporté à la demande du client…" />
        </Field>
      </div>

      <SubmitButton label="Appliquer le changement" pendingLabel="Application…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Participants — §21, §26                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Le même panneau pour une réunion et un rendez-vous.
 *
 * Convoquer et convier sont le même geste sur deux objets : deux composants
 * presque identiques divergeraient à la première correction (CLAUDE.md §37).
 * Seules les actions serveur et le nom du champ caché diffèrent.
 */
export function ParticipantsPanel({
  kind,
  ownerId,
  participants,
  candidates,
  canManage,
}: {
  kind: { field: 'meetingId' | 'appointmentId'; id: string }
  ownerId: string | null
  participants: Participant[]
  candidates: Option[]
  canManage: boolean
}) {
  const isMeeting = kind.field === 'meetingId'

  const [addState, addAction] = useActionState<PlanningFormState, FormData>(
    isMeeting ? addMeetingParticipantAction : addAppointmentParticipantAction,
    EMPTY_FORM_STATE
  )
  const [removeState, removeAction] = useActionState<PlanningFormState, FormData>(
    isMeeting ? removeMeetingParticipantAction : removeAppointmentParticipantAction,
    EMPTY_FORM_STATE
  )

  const alreadyIn = new Set(participants.map((person) => person.userId))
  // Le responsable n'est pas un participant à ajouter : il l'est par définition.
  const available = candidates.filter(
    (candidate) => !alreadyIn.has(candidate.id) && candidate.id !== ownerId
  )

  return (
    <div className="space-y-4">
      <FormFeedback
        error={addState.error ?? removeState.error}
        success={addState.success ?? removeState.success}
      />

      {participants.length === 0 ? (
        <p className="text-sm text-muted">
          {isMeeting
            ? 'Aucun participant convoqué. Seul le responsable y prend part.'
            : 'Aucun accompagnant. Seul le responsable s’y rend.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {participants.map((person) => (
            <li
              key={person.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm text-ink">{person.label}</p>
                {person.jobTitle && <p className="text-xs text-muted">{person.jobTitle}</p>}
              </div>

              {canManage && (
                <form action={removeAction}>
                  <input type="hidden" name={kind.field} value={kind.id} />
                  <input type="hidden" name="userId" value={person.userId} />
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
            </li>
          ))}
        </ul>
      )}

      {canManage &&
        (available.length === 0 ? (
          <Notice tone="info">
            Aucun autre utilisateur ne vous est accessible. Désigner des participants suppose de
            pouvoir consulter les utilisateurs (<code className="tabular">users.users.view</code>).
          </Notice>
        ) : (
          <form action={addAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name={kind.field} value={kind.id} />

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

            <div className="pb-0.5">
              <SubmitButton label="Ajouter" pendingLabel="Ajout…" icon={UserPlus} tone="secondary" />
            </div>
          </form>
        ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Actions — §25                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Créer une action depuis une réunion ou une décision.
 *
 * Le formulaire vit sur la fiche d'origine, jamais seul : §25 pose qu'une
 * action découle d'un moment. Une action sans origine serait une tâche, et la
 * base la refuse.
 */
export function NewActionForm({
  origin,
  users,
}: {
  origin: { field: 'meetingId' | 'decisionId'; id: string }
  users: Option[]
}) {
  const [state, formAction] = useActionState<PlanningFormState, FormData>(
    createActionAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name={origin.field} value={origin.id} />
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Action à effectuer" name="title" required error={errors.title} wide>
          <Input
            name="title"
            error={errors.title}
            placeholder="Préparer la convention"
            maxLength={200}
          />
        </Field>

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
          <Select name="assigneeId" defaultValue="" error={errors.assigneeId}>
            <option value="">Non attribuée</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Échéance"
          name="dueOn"
          error={errors.dueOn}
          hint="Sans échéance, l’action ne peut pas être en retard."
        >
          <Input name="dueOn" type="date" error={errors.dueOn} />
        </Field>
      </div>

      <SubmitButton label="Ajouter l’action" pendingLabel="Ajout…" tone="secondary" />
    </form>
  )
}

/**
 * Corriger une action — libellé, responsable, échéance.
 *
 * L'ÉTAT N'Y FIGURE PAS : il a son propre formulaire, parce qu'il obéit à des
 * enchaînements (`ACTION_NEXT_STATUSES`) et qu'une action transformée en tâche
 * n'en porte plus. Les mêler ferait apparaître un choix parfois impossible.
 */
export function EditActionForm({
  action,
  users,
}: {
  action: {
    id: string
    title: string
    description: string | null
    assigneeId: string | null
    dueOn: string | null
  }
  users: Option[]
}) {
  const [state, formAction] = useActionState<PlanningFormState, FormData>(
    updateActionAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="actionId" value={action.id} />
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Action à effectuer" name="title" required error={errors.title} wide>
          <Input
            name="title"
            defaultValue={action.title}
            error={errors.title}
            maxLength={200}
          />
        </Field>

        <Field label="Description" name="description" error={errors.description} wide>
          <Textarea
            name="description"
            defaultValue={action.description ?? ''}
            error={errors.description}
            rows={3}
          />
        </Field>

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
            defaultValue={action.assigneeId ?? ''}
            error={errors.assigneeId}
          >
            <option value="">Non attribuée</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Échéance"
          name="dueOn"
          error={errors.dueOn}
          hint="Sans échéance, l’action ne peut pas être en retard."
        >
          <Input
            name="dueOn"
            type="date"
            defaultValue={action.dueOn ?? ''}
            error={errors.dueOn}
          />
        </Field>
      </div>

      <SubmitButton label="Enregistrer les modifications" />
    </form>
  )
}

export function ActionStatusForm({
  actionId,
  allowed,
}: {
  actionId: string
  allowed: readonly ActionStatus[]
}) {
  const [state, formAction] = useActionState<PlanningFormState, FormData>(
    setActionStatusAction,
    EMPTY_FORM_STATE
  )

  if (allowed.length === 0) {
    return (
      <Notice tone="info">
        Cet état est définitif : une action annulée ne se rouvre pas.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="actionId" value={actionId} />
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nouvel état" name="status">
          <Select name="status" defaultValue={allowed[0]}>
            {allowed.map((value) => (
              <option key={value} value={value}>
                {ACTION_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Motif" name="reason" hint="Conservé au journal d’activité.">
          <Input name="reason" maxLength={300} placeholder="Traitée lors de la réunion du…" />
        </Field>
      </div>

      <SubmitButton label="Appliquer le changement" pendingLabel="Application…" />
    </form>
  )
}

/**
 * « Une action peut être transformée en tâche » — §25.
 *
 * Le bouton n'apparaît qu'à qui détient AUSSI `projects.tasks.create` : il naît
 * une vraie tâche. Sans ce droit, l'écran le DIT plutôt que d'offrir un geste
 * qui échouerait.
 */
export function TransformActionForm({
  actionId,
  canCreateTask,
}: {
  actionId: string
  canCreateTask: boolean
}) {
  const [state, formAction] = useActionState<PlanningFormState, FormData>(
    transformActionAction,
    EMPTY_FORM_STATE
  )

  if (!canCreateTask) {
    return (
      <Notice tone="info">
        Transformer cette action en tâche demande la permission{' '}
        <code className="tabular">projects.tasks.create</code> : il en naîtrait une véritable
        tâche, suivie dans l’avancement de son projet.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="actionId" value={actionId} />
      <FormFeedback error={state.error} success={state.success} />

      <p className="text-sm text-muted">
        La tâche reprendra le libellé, le responsable et l’échéance de cette action, et sera
        rattachée au projet de son origine. L’action en gardera la trace, et son état deviendra
        celui de la tâche.
      </p>

      <SubmitButton
        label="Transformer en tâche"
        pendingLabel="Transformation…"
        tone="secondary"
        icon={ListChecks}
      />
    </form>
  )
}

/** Le badge d'état d'une action, ou celui de la tâche qui la porte désormais. */
export function ActionStateBadge({
  status,
  taskStatus,
  taskLabel,
}: {
  status: ActionStatus
  taskStatus: string | null
  taskLabel: string | null
}) {
  if (taskLabel && !taskStatus) {
    return <Badge tone="neutral">Suivie comme tâche</Badge>
  }
  return <Badge tone="neutral">{ACTION_STATUS_LABELS[status]}</Badge>
}
