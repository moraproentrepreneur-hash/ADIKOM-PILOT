'use client'

import { useActionState } from 'react'
import { CalendarPlus } from 'lucide-react'

import { Input } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { toLocalInput } from '@/lib/dates'
import { extendRentalAction, type RentalFormState } from './actions'

/**
 * Prolongation d'une location en cours.
 *
 * Le refus d'une prolongation est TOUJOURS expliqué : « la période est déjà
 * engagée sur ce véhicule », jamais une indisponibilité sans cause. C'est la
 * contrainte d'exclusion qui tranche, et le message le dit.
 *
 * Le tarif du contrat n'est pas touché : l'écran l'annonce, plutôt que de
 * laisser croire qu'un nouveau montant a été calculé.
 */
export function ExtendPanel({
  rentalId,
  expectedReturnAt,
}: {
  rentalId: string
  expectedReturnAt: string
}) {
  const [state, formAction] = useActionState<RentalFormState, FormData>(
    extendRentalAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />

      <FormFeedback error={state.error} success={state.success} />

      <div className="space-y-1.5">
        <label htmlFor="newEnd" className="block text-sm font-medium text-ink">
          Nouvelle date de retour
        </label>
        <Input
          name="newEnd"
          type="datetime-local"
          defaultValue={toLocalInput(expectedReturnAt)}
          error={errors.newEnd}
        />
        {errors.newEnd && <p className="text-sm text-danger">{errors.newEnd}</p>}
        <p className="text-xs text-muted">
          Heure des Comores. Doit être postérieure au retour actuellement attendu.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reason" className="block text-sm font-medium text-ink">
          Motif
        </label>
        <Input name="reason" placeholder="Demande du client, retard de chantier…" />
      </div>

      <p className="text-xs text-muted">
        Le véhicule reste engagé sans interruption : la période bloquée est étendue. Si un autre
        engagement occupe le créneau demandé, la prolongation est refusée et rien n’est modifié.
        <strong> Le tarif verrouillé du contrat reste inchangé.</strong>
      </p>

      <SubmitButton
        label="Prolonger la location"
        icon={CalendarPlus}
        pendingLabel="Prolongation…"
      />
    </form>
  )
}
