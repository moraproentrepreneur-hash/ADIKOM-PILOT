'use client'

import { useActionState } from 'react'
import { Archive } from 'lucide-react'

import { Field, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { closeRentalAction, type RentalFormState } from './actions'

/**
 * Clôture d'une location facturée — Workflow 01 §41.
 *
 * §42 : la clôture est OPÉRATIONNELLE. Elle ne dit rien du paiement, et le
 * formulaire le rappelle : un dossier clôturé peut porter une facture impayée,
 * et les deux informations restent séparées.
 */
export function CloseRentalPanel({
  rentalId,
  invoiceNo,
}: {
  rentalId: string
  /** Numéro de la facture émise, quand il est lisible. */
  invoiceNo: string | null
}) {
  const [state, formAction] = useActionState<RentalFormState, FormData>(
    closeRentalAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Conclusion du dossier"
        name={`reason-close-${rentalId}`}
        hint="Facultative, conservée au journal."
      >
        <Textarea
          id={`reason-close-${rentalId}`}
          name="reason"
          rows={2}
          placeholder="Dossier complet : retour, contrôle et facturation traités."
        />
      </Field>

      <p className="text-xs text-muted">
        {invoiceNo ? (
          <>
            La facture <strong>{invoiceNo}</strong> reste en l’état.{' '}
          </>
        ) : null}
        La clôture est <strong>opérationnelle</strong> : elle n’encaisse rien et ne préjuge pas du
        règlement. Une location clôturée ne revient pas en arrière.
      </p>

      <SubmitButton label="Clôturer la location" icon={Archive} pendingLabel="Clôture…" />
    </form>
  )
}
