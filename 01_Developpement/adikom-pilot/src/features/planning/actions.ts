'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { fromLocalInput } from '@/lib/dates'
import { guarded, orNull, readText, toFieldErrors, type FormState } from '@/lib/server-action'
import { ACTION_STATUSES, PLANNING_STATUSES } from './constants'

/**
 * Actions du second volet de Projets & Planification — Phase 4, LOT 13.
 *
 * DEUX BARRIÈRES, JAMAIS UNE SEULE.
 *
 * `requirePermission` exige la capacité de l'acte demandé ; RLS refuse de toute
 * façon l'écriture ; et le déclencheur `fn_meeting_write_guard` exige
 * `projects.meetings.report` pour un compte rendu, y compris lorsque l'appel ne
 * passe par aucun écran (DEC-011, DEC-024, DEC-036 §b).
 *
 * CE MODULE NE DÉCLENCHE RIEN AILLEURS — À UNE EXCEPTION PRÈS, ASSUMÉE.
 *
 * Aucune réservation, aucune facture, aucune maintenance n'est créée ni modifiée
 * d'ici : le module est une couche d'ORGANISATION (§3, §45). La seule écriture
 * hors de ses tables est la TÂCHE née d'une action (§25) — et le module 03 la
 * demande explicitement. Elle exige `projects.tasks.create`, et se fait dans une
 * seule transaction en base.
 *
 * AUCUNE SUPPRESSION.
 *
 * Une réunion s'annule, une décision se conserve (§24), une action s'annule
 * (§25). La base refuse d'ailleurs tout DELETE à un utilisateur authentifié
 * (migration 021). Seul le retrait d'un participant en est un — une convocation
 * se défait, et le journal d'audit en conserve la trace.
 */

export type PlanningFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /Transition refusée|Transition d’action refusée|Transition d'action refusée/i,
    'Ce changement d’état n’est pas possible depuis l’état actuel.',
  ],
  [/ce projet est archivé/i, 'Ce projet est archivé : il n’accepte plus de planification.'],
  [
    /compte rendu d'une réunion|compte rendu d’une réunion/i,
    'Vous ne disposez pas du droit d’enregistrer un compte rendu.',
  ],
  [/modifier une réunion/i, 'Vous ne disposez pas du droit de modifier une réunion.'],
  [
    /transformer une action en tâche/i,
    'Transformer une action en tâche demande aussi le droit de créer une tâche.',
  ],
  [/déjà suivie comme tâche/i, 'Cette action est déjà suivie comme tâche.'],
  [
    /suivie comme tâche : son état/i,
    'Cette action est suivie comme tâche : son état est celui de la tâche.',
  ],
  [
    /Seule une action à faire/i,
    'Seule une action encore à faire peut être transformée en tâche.',
  ],
  [
    /appointments_single_party/i,
    'Un rendez-vous concerne un seul tiers : client, fournisseur ou partenaire.',
  ],
  [
    /duration_sane/i,
    'La durée doit être comprise entre 5 minutes et 24 heures.',
  ],
  [/meeting_participants_pkey/i, 'Cette personne est déjà convoquée.'],
  [/appointment_participants_pkey/i, 'Cette personne est déjà conviée.'],
  [/actions_has_origin/i, 'Une action découle toujours d’une réunion ou d’une décision.'],
]

/* -------------------------------------------------------------------------- */
/*  Saisies communes                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Un jour civil, ou rien — pour une échéance d'action et une date de décision.
 *
 * Aucune conversion de fuseau : une décision prise le 30 est du 30, quelle que
 * soit l'heure à laquelle on la saisit.
 */
const dayOrEmpty = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Cette date n’est pas valide.',
  })
  .optional()

/**
 * Un INSTANT, lui, se convertit — et c'est tout le piège de DEC-025 §e.
 *
 * `<input type="datetime-local">` produit une heure nue. Transmise telle quelle,
 * elle serait lue en UTC : une réunion à 08:00 aux Comores partirait à 08:00 UTC
 * et se relirait à 11:00. `fromLocalInput` l'interprète sur `Indian/Comoro`.
 */
const instantRequired = z
  .string()
  .trim()
  .min(1, 'La date et l’heure sont obligatoires.')
  .refine((value) => /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value), {
    message: 'Cette date n’est pas valide.',
  })

const duration = z.coerce
  .number({ message: 'Choisissez une durée.' })
  .int()
  .min(5, 'La durée minimale est de 5 minutes.')
  .max(1440, 'La durée maximale est de 24 heures.')

/* -------------------------------------------------------------------------- */
/*  Réunions — §21                                                             */
/* -------------------------------------------------------------------------- */

const meetingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Le titre de la réunion est obligatoire.')
    .max(200, 'Ce titre est trop long.'),
  objective: z.string().trim().max(2000, 'L’objectif est trop long.').optional(),
  startsAt: instantRequired,
  durationMinutes: duration,
  location: z.string().trim().max(200, 'Ce lieu est trop long.').optional(),
  agenda: z.string().trim().max(8000, 'L’ordre du jour est trop long.').optional(),
})

function readMeetingForm(formData: FormData) {
  return {
    title: readText(formData, 'title'),
    objective: readText(formData, 'objective'),
    startsAt: readText(formData, 'startsAt'),
    durationMinutes: readText(formData, 'durationMinutes') || '60',
    location: readText(formData, 'location'),
    agenda: readText(formData, 'agenda'),
  }
}

function toMeetingRow(input: z.infer<typeof meetingSchema>, formData: FormData) {
  return {
    title: input.title,
    objective: orNull(input.objective),
    starts_at: fromLocalInput(input.startsAt),
    duration_minutes: input.durationMinutes,
    location: orNull(input.location),
    agenda: orNull(input.agenda),
    owner_id: orNull(readText(formData, 'ownerId')),
    project_id: orNull(readText(formData, 'projectId')),
  }
}

export async function createMeetingAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'reunions:création',
    async () => {
      const actor = await requirePermission(PERMISSIONS.MEETINGS_CREATE)

      const parsed = meetingSchema.safeParse(readMeetingForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase
        .from('project_meetings')
        .insert({
          ...toMeetingRow(parsed.data, formData),
          created_by: actor.id,
          updated_by: actor.id,
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      revalidatePath('/projets/reunions')
      revalidatePath('/projets/calendrier')
      redirect(`/projets/reunions/${data.id}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

export async function updateMeetingAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'reunions:modification',
    async () => {
      await requirePermission(PERMISSIONS.MEETINGS_UPDATE)

      const meetingId = readText(formData, 'meetingId')
      if (!meetingId) return { error: 'Réunion introuvable.' }

      const parsed = meetingSchema.safeParse(readMeetingForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_meetings')
        .update(toMeetingRow(parsed.data, formData))
        .eq('id', meetingId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets/reunions')
      revalidatePath(`/projets/reunions/${meetingId}`)
      revalidatePath('/projets/calendrier')
      redirect(`/projets/reunions/${meetingId}?enregistre=1`)
    },
    ERROR_PATTERNS
  )
}

/**
 * Changement d'état d'une réunion — et la frontière du lot.
 *
 * DÉCLARER QU'UNE RÉUNION S'EST TENUE N'EST PAS LA MODIFIER.
 *
 * §23 et §43 séparent « organiser » et « préparer le compte rendu ». La
 * capacité exigée dépend donc de l'état visé, exactement comme la clôture d'une
 * tâche au LOT 12. Le contrôle est fait ici pour pouvoir le DIRE, et refait par
 * `fn_meeting_write_guard` pour qu'un appel direct rencontre la même barrière.
 */
export async function setMeetingStatusAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'reunions:état',
    async () => {
      const meetingId = readText(formData, 'meetingId')
      const status = readText(formData, 'status')

      if (
        !meetingId ||
        !PLANNING_STATUSES.includes(status as (typeof PLANNING_STATUSES)[number])
      ) {
        return { error: 'Opération invalide.' }
      }

      await requirePermission(
        status === 'HELD' ? PERMISSIONS.MEETINGS_REPORT : PERMISSIONS.MEETINGS_UPDATE
      )

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_meetings')
        .update({ status, status_reason: orNull(readText(formData, 'reason')) })
        .eq('id', meetingId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets/reunions')
      revalidatePath(`/projets/reunions/${meetingId}`)
      revalidatePath('/projets/calendrier')

      return { success: 'L’état de la réunion a été mis à jour.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Le compte rendu — §23.
 *
 * Un seul acte, deux gestes : écrire ce qui s'est dit, et déclarer que la
 * réunion a eu lieu. Les séparer obligerait à détenir aussi `.update` pour
 * poser l'état, ce qui rendrait `projects.meetings.report` inutilisable seule.
 */
export async function recordMinutesAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'reunions:compte-rendu',
    async () => {
      await requirePermission(PERMISSIONS.MEETINGS_REPORT)

      const meetingId = readText(formData, 'meetingId')
      if (!meetingId) return { error: 'Réunion introuvable.' }

      const parsed = z
        .object({
          minutes: z
            .string()
            .trim()
            .min(1, 'Le compte rendu ne peut pas être vide.')
            .max(20000, 'Ce compte rendu est trop long.'),
        })
        .safeParse({ minutes: readText(formData, 'minutes') })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      // `minutes_recorded_at` et `minutes_recorded_by` sont posés par le
      // déclencheur : les écrire ici en ferait une seconde vérité.
      const { error } = await supabase
        .from('project_meetings')
        .update({ minutes: parsed.data.minutes, status: 'HELD' })
        .eq('id', meetingId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets/reunions')
      revalidatePath(`/projets/reunions/${meetingId}`)

      return { success: 'Le compte rendu a été enregistré. La réunion est marquée tenue.' }
    },
    ERROR_PATTERNS
  )
}

export async function addMeetingParticipantAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'reunions:participant',
    async () => {
      const actor = await requirePermission(PERMISSIONS.MEETINGS_UPDATE)

      const meetingId = readText(formData, 'meetingId')
      const userId = readText(formData, 'userId')
      if (!meetingId || !userId) return { error: 'Désignez la personne à convoquer.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_meeting_participants')
        .insert({ meeting_id: meetingId, user_id: userId, created_by: actor.id })

      if (error) throw new Error(error.message)

      revalidatePath(`/projets/reunions/${meetingId}`)

      return { success: 'La personne a été ajoutée aux participants.' }
    },
    ERROR_PATTERNS
  )
}

export async function removeMeetingParticipantAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'reunions:participant',
    async () => {
      await requirePermission(PERMISSIONS.MEETINGS_UPDATE)

      const meetingId = readText(formData, 'meetingId')
      const userId = readText(formData, 'userId')
      if (!meetingId || !userId) return { error: 'Opération invalide.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_meeting_participants')
        .delete()
        .eq('meeting_id', meetingId)
        .eq('user_id', userId)

      if (error) throw new Error(error.message)

      revalidatePath(`/projets/reunions/${meetingId}`)

      return { success: 'La personne a été retirée des participants.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Rendez-vous — §26, §27                                                     */
/* -------------------------------------------------------------------------- */

const appointmentSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, 'L’objet du rendez-vous est obligatoire.')
    .max(200, 'Cet objet est trop long.'),
  startsAt: instantRequired,
  durationMinutes: duration,
  location: z.string().trim().max(200, 'Ce lieu est trop long.').optional(),
  externalContact: z.string().trim().max(200, 'Ce nom est trop long.').optional(),
  notes: z.string().trim().max(8000, 'Ces notes sont trop longues.').optional(),
})

/**
 * Le tiers concerné — un seul, et son type dit lequel (§27).
 *
 * Le couple (type, identifiant) arrive du formulaire ; il est traduit en trois
 * colonnes nullables dont la base garantit l'exclusivité. Un type inconnu ne
 * rattache rien : il ne provoque pas d'erreur, il ne laisse pas non plus passer
 * une valeur arbitraire.
 */
function readParty(formData: FormData) {
  const type = readText(formData, 'partyType')
  const id = orNull(readText(formData, 'partyId'))

  return {
    client_id: type === 'CLIENT' ? id : null,
    supplier_id: type === 'SUPPLIER' ? id : null,
    partner_id: type === 'PARTNER' ? id : null,
  }
}

function readAppointmentForm(formData: FormData) {
  return {
    subject: readText(formData, 'subject'),
    startsAt: readText(formData, 'startsAt'),
    durationMinutes: readText(formData, 'durationMinutes') || '60',
    location: readText(formData, 'location'),
    externalContact: readText(formData, 'externalContact'),
    notes: readText(formData, 'notes'),
  }
}

function toAppointmentRow(input: z.infer<typeof appointmentSchema>, formData: FormData) {
  return {
    subject: input.subject,
    starts_at: fromLocalInput(input.startsAt),
    duration_minutes: input.durationMinutes,
    location: orNull(input.location),
    external_contact: orNull(input.externalContact),
    notes: orNull(input.notes),
    owner_id: orNull(readText(formData, 'ownerId')),
    ...readParty(formData),
  }
}

export async function createAppointmentAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'rendez-vous:création',
    async () => {
      const actor = await requirePermission(PERMISSIONS.APPOINTMENTS_CREATE)

      const parsed = appointmentSchema.safeParse(readAppointmentForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase
        .from('project_appointments')
        .insert({
          ...toAppointmentRow(parsed.data, formData),
          created_by: actor.id,
          updated_by: actor.id,
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      revalidatePath('/projets/rendez-vous')
      revalidatePath('/projets/calendrier')
      redirect(`/projets/rendez-vous/${data.id}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

export async function updateAppointmentAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'rendez-vous:modification',
    async () => {
      await requirePermission(PERMISSIONS.APPOINTMENTS_UPDATE)

      const appointmentId = readText(formData, 'appointmentId')
      if (!appointmentId) return { error: 'Rendez-vous introuvable.' }

      const parsed = appointmentSchema.safeParse(readAppointmentForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_appointments')
        .update(toAppointmentRow(parsed.data, formData))
        .eq('id', appointmentId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets/rendez-vous')
      revalidatePath(`/projets/rendez-vous/${appointmentId}`)
      revalidatePath('/projets/calendrier')
      redirect(`/projets/rendez-vous/${appointmentId}?enregistre=1`)
    },
    ERROR_PATTERNS
  )
}

export async function setAppointmentStatusAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'rendez-vous:état',
    async () => {
      await requirePermission(PERMISSIONS.APPOINTMENTS_UPDATE)

      const appointmentId = readText(formData, 'appointmentId')
      const status = readText(formData, 'status')

      if (
        !appointmentId ||
        !PLANNING_STATUSES.includes(status as (typeof PLANNING_STATUSES)[number])
      ) {
        return { error: 'Opération invalide.' }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_appointments')
        .update({ status, status_reason: orNull(readText(formData, 'reason')) })
        .eq('id', appointmentId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets/rendez-vous')
      revalidatePath(`/projets/rendez-vous/${appointmentId}`)
      revalidatePath('/projets/calendrier')

      return { success: 'L’état du rendez-vous a été mis à jour.' }
    },
    ERROR_PATTERNS
  )
}

export async function addAppointmentParticipantAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'rendez-vous:participant',
    async () => {
      const actor = await requirePermission(PERMISSIONS.APPOINTMENTS_UPDATE)

      const appointmentId = readText(formData, 'appointmentId')
      const userId = readText(formData, 'userId')
      if (!appointmentId || !userId) return { error: 'Désignez la personne à convier.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_appointment_participants')
        .insert({ appointment_id: appointmentId, user_id: userId, created_by: actor.id })

      if (error) throw new Error(error.message)

      revalidatePath(`/projets/rendez-vous/${appointmentId}`)

      return { success: 'La personne a été ajoutée aux participants.' }
    },
    ERROR_PATTERNS
  )
}

export async function removeAppointmentParticipantAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'rendez-vous:participant',
    async () => {
      await requirePermission(PERMISSIONS.APPOINTMENTS_UPDATE)

      const appointmentId = readText(formData, 'appointmentId')
      const userId = readText(formData, 'userId')
      if (!appointmentId || !userId) return { error: 'Opération invalide.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_appointment_participants')
        .delete()
        .eq('appointment_id', appointmentId)
        .eq('user_id', userId)

      if (error) throw new Error(error.message)

      revalidatePath(`/projets/rendez-vous/${appointmentId}`)

      return { success: 'La personne a été retirée des participants.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Décisions — §24                                                            */
/* -------------------------------------------------------------------------- */

const decisionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Le titre de la décision est obligatoire.')
    .max(200, 'Ce titre est trop long.'),
  context: z.string().trim().max(8000, 'Le contexte est trop long.').optional(),
  // §24 : « décision prise ». Un titre sans énoncé ne conserve rien — c'est
  // exactement ce que le module veut éviter.
  statement: z
    .string()
    .trim()
    .min(1, 'La décision prise doit être énoncée.')
    .max(8000, 'Cet énoncé est trop long.'),
  decidedOn: dayOrEmpty,
})

function readDecisionForm(formData: FormData) {
  return {
    title: readText(formData, 'title'),
    context: readText(formData, 'context'),
    statement: readText(formData, 'statement'),
    decidedOn: readText(formData, 'decidedOn'),
  }
}

function toDecisionRow(input: z.infer<typeof decisionSchema>, formData: FormData) {
  const row: Record<string, unknown> = {
    title: input.title,
    context: orNull(input.context),
    statement: input.statement,
    owner_id: orNull(readText(formData, 'ownerId')),
    project_id: orNull(readText(formData, 'projectId')),
    meeting_id: orNull(readText(formData, 'meetingId')),
  }

  // Sans date saisie, la base pose le jour des Comores : ne rien envoyer vaut
  // mieux qu'envoyer `null`, qui violerait la contrainte `not null`.
  const decidedOn = orNull(input.decidedOn)
  if (decidedOn) row.decided_on = decidedOn

  return row
}

export async function createDecisionAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'decisions:création',
    async () => {
      const actor = await requirePermission(PERMISSIONS.DECISIONS_CREATE)

      const parsed = decisionSchema.safeParse(readDecisionForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase
        .from('project_decisions')
        .insert({
          ...toDecisionRow(parsed.data, formData),
          created_by: actor.id,
          updated_by: actor.id,
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      revalidatePath('/projets/decisions')

      const back = readText(formData, 'retour')
      redirect(back ? `${back}?decision=1` : `/projets/decisions/${data.id}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

export async function updateDecisionAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'decisions:modification',
    async () => {
      await requirePermission(PERMISSIONS.DECISIONS_UPDATE)

      const decisionId = readText(formData, 'decisionId')
      if (!decisionId) return { error: 'Décision introuvable.' }

      const parsed = decisionSchema.safeParse(readDecisionForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_decisions')
        .update(toDecisionRow(parsed.data, formData))
        .eq('id', decisionId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets/decisions')
      revalidatePath(`/projets/decisions/${decisionId}`)
      redirect(`/projets/decisions/${decisionId}?enregistre=1`)
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Actions — §25                                                              */
/* -------------------------------------------------------------------------- */

const actionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Le libellé de l’action est obligatoire.')
    .max(200, 'Ce libellé est trop long.'),
  description: z.string().trim().max(4000, 'La description est trop longue.').optional(),
  dueOn: dayOrEmpty,
})

function readActionForm(formData: FormData) {
  return {
    title: readText(formData, 'title'),
    description: readText(formData, 'description'),
    dueOn: readText(formData, 'dueOn'),
  }
}

export async function createActionAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'actions:création',
    async () => {
      const actor = await requirePermission(PERMISSIONS.ACTIONS_CREATE)

      const parsed = actionSchema.safeParse(readActionForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const meetingId = orNull(readText(formData, 'meetingId'))
      const decisionId = orNull(readText(formData, 'decisionId'))

      // §25 : une action découle d'une réunion ou d'une décision. Sans origine,
      // ce serait une tâche — la base le refuse, l'écran le dit avant elle.
      if (!meetingId && !decisionId) {
        return { error: 'Une action découle d’une réunion ou d’une décision.' }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.from('project_actions').insert({
        title: parsed.data.title,
        description: orNull(parsed.data.description),
        due_on: orNull(parsed.data.dueOn),
        assignee_id: orNull(readText(formData, 'assigneeId')),
        meeting_id: meetingId,
        decision_id: decisionId,
        created_by: actor.id,
        updated_by: actor.id,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/projets/actions')
      if (meetingId) revalidatePath(`/projets/reunions/${meetingId}`)
      if (decisionId) revalidatePath(`/projets/decisions/${decisionId}`)

      return { success: 'L’action a été enregistrée.' }
    },
    ERROR_PATTERNS
  )
}

export async function updateActionAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'actions:modification',
    async () => {
      await requirePermission(PERMISSIONS.ACTIONS_UPDATE)

      const actionId = readText(formData, 'actionId')
      if (!actionId) return { error: 'Action introuvable.' }

      const parsed = actionSchema.safeParse(readActionForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_actions')
        .update({
          title: parsed.data.title,
          description: orNull(parsed.data.description),
          due_on: orNull(parsed.data.dueOn),
          assignee_id: orNull(readText(formData, 'assigneeId')),
        })
        .eq('id', actionId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets/actions')
      revalidatePath(`/projets/actions/${actionId}`)

      return { success: 'L’action a été mise à jour.' }
    },
    ERROR_PATTERNS
  )
}

export async function setActionStatusAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'actions:état',
    async () => {
      await requirePermission(PERMISSIONS.ACTIONS_UPDATE)

      const actionId = readText(formData, 'actionId')
      const status = readText(formData, 'status')

      if (!actionId || !ACTION_STATUSES.includes(status as (typeof ACTION_STATUSES)[number])) {
        return { error: 'Opération invalide.' }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_actions')
        .update({ status, status_reason: orNull(readText(formData, 'reason')) })
        .eq('id', actionId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets/actions')
      revalidatePath(`/projets/actions/${actionId}`)

      return { success: 'L’état de l’action a été mis à jour.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * « Une action peut être transformée en tâche » — §25.
 *
 * TROIS CAPACITÉS, ET UNE SEULE TRANSACTION.
 *
 * L'acte crée une VRAIE tâche : `projects.tasks.create` est donc exigée, en
 * plus de la lecture et de la modification des actions. Les deux écritures
 * vivent dans `transform_action_to_task()` afin qu'un échec ne laisse jamais
 * une tâche orpheline — que la base refuserait ensuite de supprimer (§48).
 */
export async function transformActionAction(
  prevState: PlanningFormState,
  formData: FormData
): Promise<PlanningFormState> {
  return guarded(
    'actions:transformation',
    async () => {
      await requirePermission(PERMISSIONS.ACTIONS_UPDATE)
      await requirePermission(PERMISSIONS.TASKS_CREATE)

      const actionId = readText(formData, 'actionId')
      if (!actionId) return { error: 'Action introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('transform_action_to_task', {
        p_action_id: actionId,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/projets/actions')
      revalidatePath(`/projets/actions/${actionId}`)
      revalidatePath('/projets/taches')

      redirect(`/projets/taches/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}
