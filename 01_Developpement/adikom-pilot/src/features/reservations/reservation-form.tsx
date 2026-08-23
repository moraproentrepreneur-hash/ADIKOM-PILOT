'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { CalendarCheck, Save } from 'lucide-react'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { toLocalInput } from '@/lib/dates'
import {
  createReservationAction,
  updateReservationAction,
  type ReservationFormState,
} from './actions'
import type { ReservationDetail } from './data'

/**
 * Formulaire de création et de modification d'une réservation.
 *
 * L'affectation se fait par CATÉGORIE ou par VÉHICULE (Module 05 §24 et §26) :
 * réserver « une berline » est un besoin courant, et le véhicule précis se
 * choisit à la confirmation, parmi ceux réellement disponibles.
 *
 * Les heures saisies sont des heures des Comores. La conversion en instant a
 * lieu côté serveur, en un seul endroit (DEC-025 §e).
 */
export function ReservationForm({
  mode,
  reservation,
  clients,
  categories,
  vehicles,
}: {
  mode: 'create' | 'edit'
  reservation?: ReservationDetail
  clients: { id: string; label: string }[]
  categories: { id: string; label: string }[]
  vehicles: { id: string; label: string }[]
}) {
  const action = mode === 'create' ? createReservationAction : updateReservationAction
  const [state, formAction] = useActionState<ReservationFormState, FormData>(
    action,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      {reservation && <input type="hidden" name="reservationId" value={reservation.id} />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Client et période">
        <Field label="Client" name="clientId" required error={errors.clientId}>
          <Select name="clientId" defaultValue={reservation?.clientId ?? ''} error={errors.clientId}>
            <option value="">Sélectionner un client…</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Du"
          name="from"
          required
          error={errors.from}
          hint="Heure des Comores."
        >
          <Input
            name="from"
            type="datetime-local"
            defaultValue={toLocalInput(reservation?.startsAt)}
            error={errors.from}
          />
        </Field>

        <Field label="Au" name="to" required error={errors.to}>
          <Input
            name="to"
            type="datetime-local"
            defaultValue={toLocalInput(reservation?.endsAt)}
            error={errors.to}
          />
        </Field>
      </FormSection>

      <FormSection title="Affectation">
        <Field
          label="Catégorie"
          name="categoryId"
          error={errors.categoryId}
          hint="Le véhicule précis se choisit à la confirmation."
        >
          <Select
            name="categoryId"
            defaultValue={reservation?.categoryId ?? ''}
            error={errors.categoryId}
          >
            <option value="">Aucune catégorie</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Véhicule"
          name="vehicleId"
          error={errors.vehicleId}
          hint="À renseigner seulement si le client exige ce véhicule."
        >
          <Select
            name="vehicleId"
            defaultValue={reservation?.vehicleId ?? ''}
            error={errors.vehicleId}
          >
            <option value="">Aucun véhicule imposé</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.label}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection title="Conditions et observations">
        <Field label="Conditions particulières" name="conditions" error={errors.conditions} wide>
          <Textarea
            name="conditions"
            defaultValue={reservation?.conditions ?? ''}
            error={errors.conditions}
          />
        </Field>

        <Field label="Notes internes" name="notes" error={errors.notes} wide>
          <Textarea name="notes" defaultValue={reservation?.notes ?? ''} error={errors.notes} />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <SubmitButton
          label={mode === 'create' ? 'Créer la réservation' : 'Enregistrer'}
          icon={mode === 'create' ? CalendarCheck : Save}
        />
        <Link
          href={
            reservation ? `/location/reservations/${reservation.id}` : '/location/reservations'
          }
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Annuler
        </Link>
      </div>
    </form>
  )
}
