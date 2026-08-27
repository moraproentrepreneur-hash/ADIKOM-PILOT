'use client'

import { useActionState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'

import { CheckboxOption, Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  addDamageAction,
  updateIncidentStatusAction,
  type IncidentFormState,
} from './actions'
import {
  NEXT_STATUSES,
  RESPONSIBILITY_LABELS,
  RESPONSIBILITY_ORDER,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  STATUS_LABELS,
  type IncidentStatus,
} from './constants'

/**
 * Changement d'état d'un incident.
 *
 * SEULS LES ÉTATS ATTEIGNABLES SONT PROPOSÉS.
 *
 * La liste vient de `NEXT_STATUSES`, copie exacte de la table du déclencheur
 * `fn_incident_status_transition`. Elle ne relâche rien — la base refuse de
 * toute façon un enchaînement incohérent — mais elle évite de faire découvrir
 * un refus après coup à quelqu'un qui a rempli un motif pour rien.
 *
 * `rental.incidents.update` porte cet acte : aucune permission `.close` n'est
 * créée (arbitrage ADIKOM du 26/08/2026).
 */
export function IncidentStatusPanel({
  incidentId,
  status,
}: {
  incidentId: string
  status: IncidentStatus
}) {
  const [state, formAction] = useActionState<IncidentFormState, FormData>(
    updateIncidentStatusAction,
    EMPTY_FORM_STATE
  )

  const reachable = NEXT_STATUSES[status]

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="incidentId" value={incidentId} />

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
 * Ajout d'un dommage à un incident déjà déclaré.
 *
 * Un constat se complète : un dommage passe inaperçu au premier examen et
 * apparaît au lavage. Obliger à déclarer un second incident pour un événement
 * unique disperserait le dossier.
 *
 * Aucun coût n'est demandé — les barèmes n'existent pas (DEC-008).
 */
export function AddDamagePanel({ incidentId }: { incidentId: string }) {
  const [state, formAction] = useActionState<IncidentFormState, FormData>(
    addDamageAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="incidentId" value={incidentId} />

      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Emplacement" name="location" required error={errors.location}>
          <Input name="location" placeholder="Pare-chocs arrière" error={errors.location} />
        </Field>

        <Field label="Gravité" name="severity" error={errors.severity}>
          <Select name="severity" defaultValue="MINOR" error={errors.severity}>
            {SEVERITY_ORDER.map((severity) => (
              <option key={severity} value={severity}>
                {SEVERITY_LABELS[severity]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description" name="description" error={errors.description}>
        <Textarea name="description" rows={2} error={errors.description} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Responsabilité constatée"
          name="responsibility"
          hint="Constat seul : aucune imputation ni facturation n’en découle."
          error={errors.responsibility}
        >
          <Select
            name="responsibility"
            defaultValue="UNDETERMINED"
            error={errors.responsibility}
          >
            {RESPONSIBILITY_ORDER.map((value) => (
              <option key={value} value={value}>
                {RESPONSIBILITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex items-end">
          <CheckboxOption
            name="isPreexisting"
            value="on"
            label="Déjà présent au départ"
            description="Ne pourra pas être reproché au client."
          />
        </div>
      </div>

      <SubmitButton label="Enregistrer le dommage" icon={Plus} pendingLabel="Enregistrement…" />
    </form>
  )
}
