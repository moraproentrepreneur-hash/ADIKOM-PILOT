'use client'

import { useActionState } from 'react'
import { CheckCircle2, FileSignature, XCircle } from 'lucide-react'

import { Input } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  cancelRentalAction,
  confirmRentalAction,
  convertReservationAction,
  type RentalFormState,
} from './actions'

/**
 * Gestes du contrat, avant le départ.
 *
 * Trois formulaires distincts plutôt qu'un panneau à options : chacun porte sa
 * permission, et un bouton absent signifie une capacité non attribuée — jamais
 * une action indisponible pour une autre raison.
 */

/** Conversion, proposée depuis la fiche de la réservation. */
export function ConvertPanel({ reservationId }: { reservationId: string }) {
  const [state, formAction] = useActionState<RentalFormState, FormData>(
    convertReservationAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reservationId" value={reservationId} />

      <FormFeedback error={state.error} success={state.success} />

      <p className="text-xs text-muted">
        La location reprendra le client, le véhicule, la période et le tarif verrouillé. Le véhicule
        reste engagé sans interruption : l’occupation change d’origine plutôt que d’être recréée.
      </p>

      <SubmitButton
        label="Convertir en location"
        icon={FileSignature}
        pendingLabel="Conversion…"
      />
    </form>
  )
}

/** « En préparation » → « Confirmée ». */
export function ConfirmRentalPanel({ rentalId }: { rentalId: string }) {
  const [state, formAction] = useActionState<RentalFormState, FormData>(
    confirmRentalAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />

      <FormFeedback error={state.error} success={state.success} />

      <p className="text-xs text-muted">
        Le contrat est prêt : véhicule engagé, tarif figé, conditions arrêtées. Le départ sera
        enregistré séparément, avec l’état des lieux.
      </p>

      <SubmitButton label="Confirmer le contrat" icon={CheckCircle2} pendingLabel="Validation…" />
    </form>
  )
}

/** Annulation motivée, possible tant que la location n'est pas partie. */
export function CancelRentalPanel({ rentalId }: { rentalId: string }) {
  const [state, formAction] = useActionState<RentalFormState, FormData>(
    cancelRentalAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />

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
        Le véhicule sera libéré. La location reste consultable : rien n’est supprimé.
      </p>

      <SubmitButton
        label="Annuler la location"
        icon={XCircle}
        tone="danger"
        pendingLabel="Annulation…"
      />
    </form>
  )
}
