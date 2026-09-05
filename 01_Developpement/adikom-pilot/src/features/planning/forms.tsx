'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  createAppointmentAction,
  createDecisionAction,
  createMeetingAction,
  updateAppointmentAction,
  updateDecisionAction,
  updateMeetingAction,
  type PlanningFormState,
} from './actions'
import { DURATION_CHOICES, formatDuration } from './constants'
import type { AppointmentDetail, DecisionDetail, MeetingDetail, Option } from './data'

/**
 * Les fiches de saisie du second volet — Module 03 §21, §24, §26.
 *
 * UNE HEURE SE SAISIT, UN JOUR SE CHOISIT.
 *
 * Une réunion et un rendez-vous ont une DATE ET UNE HEURE (§21, §26) : le champ
 * est un `datetime-local`, et l'action serveur convertit la saisie sur le fuseau
 * des Comores (DEC-025 §e). Une décision, elle, a un JOUR (§24) : aucune
 * conversion, le 30 est le 30.
 *
 * LA DURÉE EST UNE LISTE, PAS UN CHAMP LIBRE.
 *
 * Personne ne convoque une réunion de 37 minutes. La base accepte néanmoins
 * toute valeur entre 5 minutes et 24 heures : la liste est une commodité, elle
 * ne remplace pas la règle.
 */

/** Le libellé d'une liste de personnes fermée, plutôt qu'un menu vide muet. */
const USERS_HINT =
  'La liste des utilisateurs n’est pas accessible avec vos droits (users.users.view).'

function DurationField({ defaultValue, error }: { defaultValue?: number; error?: string }) {
  return (
    <Field label="Durée" name="durationMinutes" error={error}>
      <Select
        name="durationMinutes"
        defaultValue={String(defaultValue ?? 60)}
        error={error}
      >
        {/* Une durée enregistrée hors liste — par un import, par l'API — reste
            proposée : sinon, ouvrir la fiche la remplacerait silencieusement. */}
        {(defaultValue && !DURATION_CHOICES.includes(defaultValue)
          ? [defaultValue, ...DURATION_CHOICES].sort((a, b) => a - b)
          : DURATION_CHOICES
        ).map((minutes) => (
          <option key={minutes} value={minutes}>
            {formatDuration(minutes)}
          </option>
        ))}
      </Select>
    </Field>
  )
}

function OwnerField({
  label,
  hint,
  users,
  defaultValue,
  error,
}: {
  label: string
  hint: string
  users: Option[]
  defaultValue?: string | null
  error?: string
}) {
  return (
    <Field
      label={label}
      name="ownerId"
      error={error}
      hint={users.length <= 1 ? USERS_HINT : hint}
    >
      <Select name="ownerId" defaultValue={defaultValue ?? ''} error={error}>
        <option value="">Non désigné</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.label}
            {user.description ? ` · ${user.description}` : ''}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/* -------------------------------------------------------------------------- */
/*  Réunion — §21                                                              */
/* -------------------------------------------------------------------------- */

export function MeetingForm({
  meeting,
  users,
  projects,
  canReadProjects,
  defaultStartsAt,
  cancelHref,
}: {
  meeting?: MeetingDetail
  users: Option[]
  projects: Option[]
  canReadProjects: boolean
  /** Le prochain créneau rond, pour ne pas ouvrir sur un champ vide. */
  defaultStartsAt: string
  cancelHref: string
}) {
  const [state, formAction] = useActionState<PlanningFormState, FormData>(
    meeting ? updateMeetingAction : createMeetingAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      {meeting && <input type="hidden" name="meetingId" value={meeting.id} />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Réunion" description="De quoi il s’agit, et pourquoi elle est convoquée.">
        <Field label="Titre" name="title" required error={errors.title} wide>
          <Input
            name="title"
            defaultValue={meeting?.title ?? ''}
            error={errors.title}
            placeholder="Réunion avec le fournisseur A"
            maxLength={200}
          />
        </Field>

        <Field label="Objectif" name="objective" error={errors.objective} wide>
          <Textarea
            name="objective"
            defaultValue={meeting?.objective ?? ''}
            error={errors.objective}
            rows={2}
            placeholder="Ce que la réunion doit permettre de décider."
          />
        </Field>

        <Field
          label="Projet"
          name="projectId"
          error={errors.projectId}
          hint={
            canReadProjects
              ? 'Facultatif : une réunion de direction ne relève d’aucun projet.'
              : 'Le rattachement à un projet demande la permission projects.view.'
          }
        >
          <Select
            name="projectId"
            defaultValue={meeting?.projectId ?? ''}
            error={errors.projectId}
            disabled={!canReadProjects}
          >
            <option value="">Aucun projet</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.label}
              </option>
            ))}
          </Select>
        </Field>

        <OwnerField
          label="Responsable"
          hint="Qui la conduit (§21)."
          users={users}
          defaultValue={meeting?.ownerId}
          error={errors.ownerId}
        />
      </FormSection>

      <FormSection title="Quand et où" description="Date, heure, durée et lieu (§21).">
        <Field label="Date et heure" name="startsAt" required error={errors.startsAt}>
          <Input
            name="startsAt"
            type="datetime-local"
            defaultValue={meeting ? toLocalValue(meeting.startsAt) : defaultStartsAt}
            error={errors.startsAt}
          />
        </Field>

        <DurationField defaultValue={meeting?.durationMinutes} error={errors.durationMinutes} />

        <Field label="Lieu" name="location" error={errors.location} wide>
          <Input
            name="location"
            defaultValue={meeting?.location ?? ''}
            error={errors.location}
            placeholder="Bureau de la direction · Visioconférence"
            maxLength={200}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Ordre du jour"
        description="Les points à traiter (§21). La préparation, elle, se suit en tâches (§22)."
      >
        <Field label="Ordre du jour" name="agenda" error={errors.agenda} wide>
          <Textarea
            name="agenda"
            defaultValue={meeting?.agenda ?? ''}
            error={errors.agenda}
            rows={6}
            placeholder={'1. Historique du véhicule\n2. Factures de maintenance\n3. Imputation'}
          />
        </Field>
      </FormSection>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton label={meeting ? 'Enregistrer les modifications' : 'Créer la réunion'} />
        <Link href={cancelHref} className="text-sm text-muted hover:text-ink">
          Annuler
        </Link>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Rendez-vous — §26, §27                                                     */
/* -------------------------------------------------------------------------- */

export function AppointmentForm({
  appointment,
  users,
  parties,
  defaultStartsAt,
  cancelHref,
}: {
  appointment?: AppointmentDetail
  users: Option[]
  parties: {
    clients: Option[]
    suppliers: Option[]
    partners: Option[]
    canReadClients: boolean
    canReadSuppliers: boolean
    canReadPartners: boolean
  }
  defaultStartsAt: string
  cancelHref: string
}) {
  const [state, formAction] = useActionState<PlanningFormState, FormData>(
    appointment ? updateAppointmentAction : createAppointmentAction,
    EMPTY_FORM_STATE
  )

  const initialType = appointment?.clientId
    ? 'CLIENT'
    : appointment?.supplierId
      ? 'SUPPLIER'
      : appointment?.partnerId
        ? 'PARTNER'
        : ''

  const [partyType, setPartyType] = useState(initialType)

  const errors = state.fieldErrors ?? {}

  const options =
    partyType === 'CLIENT'
      ? parties.clients
      : partyType === 'SUPPLIER'
        ? parties.suppliers
        : partyType === 'PARTNER'
          ? parties.partners
          : []

  const readable =
    partyType === 'CLIENT'
      ? parties.canReadClients
      : partyType === 'SUPPLIER'
        ? parties.canReadSuppliers
        : partyType === 'PARTNER'
          ? parties.canReadPartners
          : true

  const currentPartyId =
    appointment?.clientId ?? appointment?.supplierId ?? appointment?.partnerId ?? ''

  return (
    <form action={formAction} noValidate>
      {appointment && <input type="hidden" name="appointmentId" value={appointment.id} />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Rendez-vous" description="Son objet, et qui s’en charge (§26).">
        <Field label="Objet" name="subject" required error={errors.subject} wide>
          <Input
            name="subject"
            defaultValue={appointment?.subject ?? ''}
            error={errors.subject}
            placeholder="Signature de la convention"
            maxLength={200}
          />
        </Field>

        <OwnerField
          label="Responsable"
          hint="Qui s’y rend (§26)."
          users={users}
          defaultValue={appointment?.ownerId}
          error={errors.ownerId}
        />

        <Field label="Lieu" name="location" error={errors.location}>
          <Input
            name="location"
            defaultValue={appointment?.location ?? ''}
            error={errors.location}
            placeholder="Moroni · Siège du partenaire"
            maxLength={200}
          />
        </Field>
      </FormSection>

      <FormSection title="Quand" description="Date, heure et durée (§26).">
        <Field label="Date et heure" name="startsAt" required error={errors.startsAt}>
          <Input
            name="startsAt"
            type="datetime-local"
            defaultValue={appointment ? toLocalValue(appointment.startsAt) : defaultStartsAt}
            error={errors.startsAt}
          />
        </Field>

        <DurationField
          defaultValue={appointment?.durationMinutes}
          error={errors.durationMinutes}
        />
      </FormSection>

      <FormSection
        title="Personne ou organisation concernée"
        description="Le tiers enregistré (§27), et la personne rencontrée."
      >
        <Field
          label="Type de tiers"
          name="partyType"
          hint="Facultatif : tous les rendez-vous ne concernent pas un tiers enregistré."
        >
          <Select
            name="partyType"
            value={partyType}
            onChange={(event) => setPartyType(event.target.value)}
          >
            <option value="">Aucun tiers enregistré</option>
            <option value="CLIENT">Client</option>
            <option value="SUPPLIER">Fournisseur</option>
            <option value="PARTNER">Partenaire</option>
          </Select>
        </Field>

        <Field
          label="Tiers"
          name="partyId"
          error={errors.partyId}
          hint={
            partyType && !readable
              ? 'Ce répertoire ne vous est pas accessible : le rattachement demande sa permission de lecture.'
              : undefined
          }
        >
          <Select
            name="partyId"
            defaultValue={currentPartyId}
            error={errors.partyId}
            disabled={!partyType || !readable}
          >
            <option value="">
              {partyType ? 'Choisir un tiers' : 'Choisissez d’abord un type'}
            </option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Personne rencontrée"
          name="externalContact"
          error={errors.externalContact}
          hint="Un nom qui n’est pas enregistré dans ADIKOM PILOT (§26)."
          wide
        >
          <Input
            name="externalContact"
            defaultValue={appointment?.externalContact ?? ''}
            error={errors.externalContact}
            placeholder="M. Ali, directeur administratif"
            maxLength={200}
          />
        </Field>
      </FormSection>

      <FormSection title="Notes" description="Ce qu’il faut préparer, ou ce qui s’est dit (§26).">
        <Field label="Notes" name="notes" error={errors.notes} wide>
          <Textarea
            name="notes"
            defaultValue={appointment?.notes ?? ''}
            error={errors.notes}
            rows={5}
          />
        </Field>
      </FormSection>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton
          label={appointment ? 'Enregistrer les modifications' : 'Créer le rendez-vous'}
        />
        <Link href={cancelHref} className="text-sm text-muted hover:text-ink">
          Annuler
        </Link>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Décision — §24                                                             */
/* -------------------------------------------------------------------------- */

export function DecisionForm({
  decision,
  users,
  projects,
  meetings,
  canReadProjects,
  canReadMeetings,
  defaultMeetingId,
  defaultDecidedOn,
  returnTo,
  cancelHref,
}: {
  decision?: DecisionDetail
  users: Option[]
  projects: Option[]
  meetings: Option[]
  canReadProjects: boolean
  canReadMeetings: boolean
  defaultMeetingId?: string
  defaultDecidedOn: string
  returnTo?: string
  cancelHref: string
}) {
  const [state, formAction] = useActionState<PlanningFormState, FormData>(
    decision ? updateDecisionAction : createDecisionAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      {decision && <input type="hidden" name="decisionId" value={decision.id} />}
      {returnTo && <input type="hidden" name="retour" value={returnTo} />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <Notice tone="info" className="mb-5">
        Une décision enregistrée ne se supprime pas. Elle reste consultable pour que rien
        d’important ne se perde dans des échanges informels (§24).
      </Notice>

      <FormSection
        title="La décision"
        description="Ce qui a été décidé, et dans quel contexte (§24)."
      >
        <Field label="Titre" name="title" required error={errors.title} wide>
          <Input
            name="title"
            defaultValue={decision?.title ?? ''}
            error={errors.title}
            placeholder="Lancer le partenariat avec le fournisseur A"
            maxLength={200}
          />
        </Field>

        <Field
          label="Décision prise"
          name="statement"
          required
          error={errors.statement}
          hint="L’énoncé lui-même : c’est lui qu’on relira dans un an."
          wide
        >
          <Textarea
            name="statement"
            defaultValue={decision?.statement ?? ''}
            error={errors.statement}
            rows={4}
          />
        </Field>

        <Field label="Contexte" name="context" error={errors.context} wide>
          <Textarea
            name="context"
            defaultValue={decision?.context ?? ''}
            error={errors.context}
            rows={3}
            placeholder="Ce qui a conduit à cette décision."
          />
        </Field>
      </FormSection>

      <FormSection title="Origine et responsabilité" description="Qui, quand, et à la suite de quoi.">
        <Field
          label="Date de la décision"
          name="decidedOn"
          error={errors.decidedOn}
          hint="Le jour où elle a été prise, pas celui où on la saisit."
        >
          <Input
            name="decidedOn"
            type="date"
            defaultValue={decision?.decidedOn ?? defaultDecidedOn}
            error={errors.decidedOn}
          />
        </Field>

        <OwnerField
          label="Responsable"
          hint="Qui répond de son application (§24)."
          users={users}
          defaultValue={decision?.ownerId}
          error={errors.ownerId}
        />

        <Field
          label="Réunion associée"
          name="meetingId"
          error={errors.meetingId}
          hint={
            canReadMeetings
              ? 'Facultatif : toute décision ne sort pas d’une réunion.'
              : 'Le rattachement à une réunion demande la permission projects.meetings.view.'
          }
        >
          <Select
            name="meetingId"
            defaultValue={decision?.meetingId ?? defaultMeetingId ?? ''}
            error={errors.meetingId}
            disabled={!canReadMeetings}
          >
            <option value="">Aucune réunion</option>
            {meetings.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>
                {meeting.label}
                {meeting.description ? ` · ${meeting.description}` : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Projet associé"
          name="projectId"
          error={errors.projectId}
          hint={
            canReadProjects
              ? undefined
              : 'Le rattachement à un projet demande la permission projects.view.'
          }
        >
          <Select
            name="projectId"
            defaultValue={decision?.projectId ?? ''}
            error={errors.projectId}
            disabled={!canReadProjects}
          >
            <option value="">Aucun projet</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.label}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton
          label={decision ? 'Enregistrer les modifications' : 'Enregistrer la décision'}
        />
        <Link href={cancelHref} className="text-sm text-muted hover:text-ink">
          Annuler
        </Link>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Instant ISO → valeur d'un `<input type="datetime-local">`.
 *
 * Reprend `toLocalInput` de `lib/dates`, que ce module client ne peut pas
 * importer : il vit à côté d'un fichier `server-only`. La conversion est la
 * même — le fuseau d'affichage, jamais celui du navigateur (DEC-025 §e).
 */
function toLocalValue(value: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Indian/Comoro',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value])
  ) as Record<string, string>

  const hour = String(Number(parts.hour) % 24).padStart(2, '0')
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`
}
