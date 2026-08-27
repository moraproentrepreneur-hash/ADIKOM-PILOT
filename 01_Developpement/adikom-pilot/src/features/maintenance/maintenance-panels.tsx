'use client'

import { useActionState } from 'react'
import { Ban, CheckCircle2, Lock, RefreshCw } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  cancelMaintenanceAction,
  completeMaintenanceAction,
  immobilizeMaintenanceAction,
  updateMaintenanceStatusAction,
  type MaintenanceFormState,
} from './actions'
import { NEXT_STATUSES, STATUS_LABELS, type MaintenanceStatus } from './constants'

/**
 * Avancement d'une maintenance.
 *
 * SEULS LES ÉTATS ATTEIGNABLES SONT PROPOSÉS, et « Terminée » n'y figure
 * jamais : terminer atteste d'un contrôle et rend le véhicule au parc, ce qui
 * relève d'un écran à part et d'une autre permission.
 */
export function MaintenanceStatusPanel({
  maintenanceId,
  status,
}: {
  maintenanceId: string
  status: MaintenanceStatus
}) {
  const [state, formAction] = useActionState<MaintenanceFormState, FormData>(
    updateMaintenanceStatusAction,
    EMPTY_FORM_STATE
  )

  const reachable = NEXT_STATUSES[status]
  if (reachable.length === 0) return null

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="maintenanceId" value={maintenanceId} />
      <input type="hidden" name="currentStatus" value={status} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Nouvel état" name="status" error={state.fieldErrors?.status}>
        <Select name="status" defaultValue={reachable[0]} error={state.fieldErrors?.status}>
          {reachable.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Motif" name="reason" hint="Facultatif, conservé dans l’historique.">
        <Textarea name="reason" rows={2} />
      </Field>

      <SubmitButton label="Mettre à jour" icon={RefreshCw} pendingLabel="Mise à jour…" />
    </form>
  )
}

/**
 * Immobilisation posée après coup.
 *
 * LE CAS DE LA PANNE PENDANT UNE LOCATION.
 *
 * Le véhicule est dehors : son calendrier est occupé, et aucune immobilisation
 * ne peut y tenir. La maintenance a donc été déclarée sans — ce qui est la
 * vérité — et l'immobilisation se pose ici, quand le véhicule est rentré.
 *
 * La période reste soumise à la contrainte du calendrier : elle sera refusée si
 * un engagement l'occupe.
 */
export function ImmobilizePanel({ maintenanceId }: { maintenanceId: string }) {
  const [state, formAction] = useActionState<MaintenanceFormState, FormData>(
    immobilizeMaintenanceAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="maintenanceId" value={maintenanceId} />

      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Début"
          name="immobilizationFrom"
          required
          error={errors.immobilizationFrom}
          hint="Heure des Comores."
        >
          <Input
            name="immobilizationFrom"
            type="datetime-local"
            error={errors.immobilizationFrom}
          />
        </Field>

        <Field
          label="Fin"
          name="immobilizationTo"
          required
          error={errors.immobilizationTo}
          hint="Refusée si un engagement occupe déjà la période."
        >
          <Input name="immobilizationTo" type="datetime-local" error={errors.immobilizationTo} />
        </Field>
      </div>

      <SubmitButton label="Immobiliser le véhicule" icon={Lock} pendingLabel="Immobilisation…" />
    </form>
  )
}

/**
 * Fin d'intervention.
 *
 * « Terminée » atteste que l'intervention est faite ET que le contrôle est
 * satisfaisant (§47, Parc §23). L'écran le dit explicitement : c'est la seule
 * garantie que l'utilisateur ne conclue pas par simple envie de classer.
 *
 * Aucun coût n'est saisi ici — LOT 3.
 */
export function CompleteMaintenancePanel({
  maintenanceId,
  immobilizing,
}: {
  maintenanceId: string
  immobilizing: boolean
}) {
  const [state, formAction] = useActionState<MaintenanceFormState, FormData>(
    completeMaintenanceAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="maintenanceId" value={maintenanceId} />

      <Notice tone="warning">
        Ne terminez cette maintenance que si le <strong>contrôle après intervention est
        satisfaisant</strong>. Si le problème persiste, laissez-la en cours ou en attente.
        {immobilizing
          ? ' L’immobilisation sera levée et le véhicule reviendra au parc.'
          : ' Cette maintenance n’immobilise pas le véhicule : le calendrier ne changera pas.'}
      </Notice>

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Date de fin" name="completedAt" hint="Heure des Comores.">
        <Input name="completedAt" type="datetime-local" />
      </Field>

      <Field
        label="Intervention réalisée"
        name="intervention"
        hint="Ce qui a été fait : remplacement, réparation, vidange…"
      >
        <Textarea name="intervention" rows={2} />
      </Field>

      <Field label="Observations" name="observations">
        <Textarea name="observations" rows={2} />
      </Field>

      <SubmitButton
        label="Terminer après contrôle"
        icon={CheckCircle2}
        pendingLabel="Clôture…"
      />
    </form>
  )
}

/** Annulation — §64 : le véhicule est libéré, la maintenance reste. */
export function CancelMaintenancePanel({ maintenanceId }: { maintenanceId: string }) {
  const [state, formAction] = useActionState<MaintenanceFormState, FormData>(
    cancelMaintenanceAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="maintenanceId" value={maintenanceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Motif" name="reason" hint="Conservé dans l’historique.">
        <Textarea name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        La fiche est conservée : une intervention abandonnée doit rester retrouvable.
        L’immobilisation éventuelle sera levée.
      </p>

      <SubmitButton
        label="Annuler la maintenance"
        icon={Ban}
        tone="danger"
        pendingLabel="Annulation…"
      />
    </form>
  )
}
