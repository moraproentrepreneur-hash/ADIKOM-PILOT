'use client'

import { useActionState } from 'react'
import { ClipboardCheck } from 'lucide-react'

import { Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { closeControlAction, type RentalFormState } from './actions'

/**
 * Validation du contrôle de retour : « À contrôler » → « À facturer ».
 *
 * DEC-025 §b : `rental.rentals.close` porte cet acte, sans permission de
 * contrôle distincte. La location quitte l'exploitation.
 *
 * Aucun montant n'est saisi ici, et aucun n'est proposé : les barèmes de
 * carburant, de kilométrage, de retard et de dommages n'existent pas
 * (DEC-008). Le contrôle acte un CONSTAT.
 */
export function ControlPanel({ rentalId }: { rentalId: string }) {
  const [state, formAction] = useActionState<RentalFormState, FormData>(
    closeControlAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />

      <FormFeedback error={state.error} success={state.success} />

      <div className="space-y-1.5">
        <label htmlFor="observations" className="block text-sm font-medium text-ink">
          Conclusion du contrôle
        </label>
        <Textarea
          name="observations"
          placeholder="Véhicule conforme à l’état de départ, hormis les points relevés ci-dessus…"
        />
      </div>

      <p className="text-xs text-muted">
        La location passera <strong>« À facturer »</strong>. Aucun montant n’est calculé à ce
        stade : la durée facturable et les éventuels frais seront établis à la facturation, une
        fois leurs règles arrêtées.
      </p>

      <SubmitButton
        label="Valider le contrôle"
        icon={ClipboardCheck}
        pendingLabel="Validation…"
      />
    </form>
  )
}
