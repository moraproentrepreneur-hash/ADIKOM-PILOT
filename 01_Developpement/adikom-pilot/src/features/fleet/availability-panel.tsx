'use client'

import { useActionState, useState } from 'react'
import { CalendarClock, Plus, Unlock } from 'lucide-react'

import { Badge, EmptyState } from '@/components/ui/primitives'
import { Field, FormSection, Input, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatDateTime } from '@/lib/dates'
import {
  addImmobilizationAction,
  releaseOccupationAction,
  type FleetFormState,
} from './actions'
import { OCCUPATION_LABELS, OCCUPATION_TONES } from './constants'
import type { Occupation } from './data'

/**
 * Calendrier d'indisponibilité d'un véhicule.
 *
 * §68 : le calendrier montre des périodes, pas un statut permanent. §69 : un
 * véhicule « Disponible » aujourd'hui peut être réservé demain — les deux
 * notions restent distinctes.
 *
 * À cette étape, seules les immobilisations sont saisies ici. Les réservations,
 * locations et maintenances alimenteront les mêmes lignes aux étapes suivantes,
 * et la contrainte d'exclusion les départagera de la même manière.
 */
export function AvailabilityPanel({
  vehicleId,
  occupations,
  editable,
}: {
  vehicleId: string
  occupations: Occupation[]
  editable: boolean
}) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4">
      <Notice tone="warning">
        Un véhicule n’est disponible que si son calendrier est libre : le statut affiché ne suffit
        jamais à le conclure.
      </Notice>

      {editable &&
        (adding ? (
          <ImmobilizationForm vehicleId={vehicleId} onFinished={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
          >
            <Plus className="size-4" aria-hidden />
            Enregistrer une indisponibilité
          </button>
        ))}

      {occupations.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Aucune période bloquée"
          description="Le calendrier de ce véhicule est entièrement libre."
        />
      ) : (
        <ul className="space-y-3">
          {occupations.map((occupation) => (
            <OccupationRow
              key={occupation.id}
              vehicleId={vehicleId}
              occupation={occupation}
              editable={editable}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function OccupationRow({
  vehicleId,
  occupation,
  editable,
}: {
  vehicleId: string
  occupation: Occupation
  editable: boolean
}) {
  const [state, formAction] = useActionState<FleetFormState, FormData>(
    releaseOccupationAction,
    EMPTY_FORM_STATE
  )

  // Seules les immobilisations se lèvent ici : une réservation ou une location
  // se libère depuis l'opération qui l'a créée, aux étapes 2.3 et 2.4.
  const releasable = editable && occupation.source === 'IMMOBILIZATION'

  return (
    <li className="rounded-control border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {formatDateTime(occupation.from)} → {formatDateTime(occupation.to)}
          </p>
          {occupation.reason && <p className="mt-1 text-xs text-muted">{occupation.reason}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={OCCUPATION_TONES[occupation.source]}>
            {OCCUPATION_LABELS[occupation.source]}
          </Badge>

          {releasable && (
            <form action={formAction}>
              <input type="hidden" name="occupationId" value={occupation.id} />
              <input type="hidden" name="vehicleId" value={vehicleId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
              >
                <Unlock className="size-3.5" aria-hidden />
                Lever
              </button>
            </form>
          )}
        </div>
      </div>

      <FormFeedback error={state.error} className="mt-3" />
    </li>
  )
}

function ImmobilizationForm({
  vehicleId,
  onFinished,
}: {
  vehicleId: string
  onFinished: () => void
}) {
  const [state, formAction] = useActionState<FleetFormState, FormData>(
    async (previous, formData) => {
      const result = await addImmobilizationAction(previous, formData)
      if (result.success) onFinished()
      return result
    },
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate className="rounded-control border border-line p-4">
      <input type="hidden" name="vehicleId" value={vehicleId} />

      <FormFeedback error={state.error} success={state.success} className="mb-4" />

      <FormSection title="Période d’indisponibilité">
        <Field label="Du" name="from" required error={errors.from}>
          <Input name="from" type="datetime-local" error={errors.from} />
        </Field>

        <Field label="Au" name="to" required error={errors.to}>
          <Input name="to" type="datetime-local" error={errors.to} />
        </Field>

        <Field label="Motif" name="reason" error={errors.reason} wide>
          <Textarea name="reason" placeholder="Contrôle, panne, usage interne…" />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <SubmitButton label="Enregistrer" icon={CalendarClock} />
        <button
          type="button"
          onClick={onFinished}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}
