'use client'

import { useActionState, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

import { Input, Select } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  cancelReservationAction,
  confirmReservationAction,
  type ReservationFormState,
} from './actions'
import type { AvailableVehicle } from './data'

/**
 * Confirmation d'une réservation.
 *
 * La liste proposée est celle des véhicules RÉELLEMENT libres sur la période,
 * calculée depuis `vehicle_occupations` — jamais depuis le statut du véhicule,
 * qui décrit une situation courante et non un calendrier (DEC-025 §c).
 *
 * Elle reste un confort : entre son affichage et la validation, un autre
 * utilisateur peut avoir engagé le même véhicule. C'est la contrainte
 * d'exclusion qui refusera, et le message le dira clairement.
 */
export function ConfirmPanel({
  reservationId,
  vehicles,
  imposedVehicleId,
}: {
  reservationId: string
  vehicles: AvailableVehicle[]
  /** Véhicule exigé dès la création : il n'y a alors rien à choisir. */
  imposedVehicleId: string | null
}) {
  const [state, formAction] = useActionState<ReservationFormState, FormData>(
    confirmReservationAction,
    EMPTY_FORM_STATE
  )

  const imposed = imposedVehicleId
    ? vehicles.find((vehicle) => vehicle.id === imposedVehicleId)
    : undefined

  const [selected, setSelected] = useState(imposedVehicleId ?? vehicles[0]?.id ?? '')

  if (imposedVehicleId && !imposed) {
    return (
      <Notice tone="warning">
        Le véhicule imposé n’est plus disponible sur cette période. Modifiez la réservation pour en
        changer, ou libérez la période concernée depuis la fiche du véhicule.
      </Notice>
    )
  }

  if (vehicles.length === 0) {
    return (
      <Notice tone="warning">
        Aucun véhicule n’est disponible sur cette période. Élargissez la catégorie, décalez les
        dates, ou libérez une période depuis le parc.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reservationId" value={reservationId} />

      <FormFeedback error={state.error} success={state.success} />

      <div className="space-y-1.5">
        <label htmlFor="vehicleId" className="block text-sm font-medium text-ink">
          Véhicule à engager
        </label>
        <Select
          name="vehicleId"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={Boolean(imposedVehicleId)}
        >
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.label} · {vehicle.vehicleNo}
              {vehicle.categoryLabel ? ` · ${vehicle.categoryLabel}` : ''}
            </option>
          ))}
        </Select>
        {/* Un champ désactivé n'est pas transmis : la valeur imposée est portée
            par un champ caché, sans quoi la confirmation partirait sans véhicule. */}
        {imposedVehicleId && <input type="hidden" name="vehicleId" value={imposedVehicleId} />}
      </div>

      <p className="text-xs text-muted">
        La confirmation verrouille le tarif applicable et engage le véhicule sur la période. Une
        modification ultérieure de la grille tarifaire n’affectera plus cette réservation.
      </p>

      <SubmitButton label="Confirmer la réservation" icon={CheckCircle2} pendingLabel="Confirmation…" />
    </form>
  )
}

/** Annulation motivée. Le motif est conservé sur la fiche et dans le journal. */
export function CancelPanel({ reservationId }: { reservationId: string }) {
  const [state, formAction] = useActionState<ReservationFormState, FormData>(
    cancelReservationAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reservationId" value={reservationId} />

      <FormFeedback error={state.error} success={state.success} />

      <div className="space-y-1.5">
        <label htmlFor="reason" className="block text-sm font-medium text-ink">
          Motif de l’annulation
        </label>
        <Input
          name="reason"
          placeholder="Désistement du client, véhicule indisponible…"
          error={errors.reason}
        />
        {errors.reason && <p className="text-sm text-danger">{errors.reason}</p>}
      </div>

      <p className="text-xs text-muted">
        Le véhicule sera libéré et redeviendra disponible sur la période. La réservation reste
        consultable : rien n’est supprimé.
      </p>

      <SubmitButton
        label="Annuler la réservation"
        icon={XCircle}
        tone="danger"
        pendingLabel="Annulation…"
      />
    </form>
  )
}
