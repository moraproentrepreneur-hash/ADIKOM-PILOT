'use client'

import { useActionState } from 'react'
import { Ban, FileText } from 'lucide-react'

import { Field, Input, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { cancelSaleAction, invoiceSaleAction, type PosSaleFormState } from './actions'

/* -------------------------------------------------------------------------- */
/*  Facture sur demande — A-11, C-2                                            */
/* -------------------------------------------------------------------------- */

export function InvoiceSalePanel({ saleId }: { saleId: string }) {
  const [state, formAction] = useActionState<PosSaleFormState, FormData>(invoiceSaleAction, EMPTY_FORM_STATE)
  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />
      <input type="hidden" name="saleId" value={saleId} />

      <p className="text-sm text-muted">
        La facture reprend les lignes et les remises de la vente, s’émet, puis est soldée par les
        paiements déjà reçus au comptoir — <strong>sans nouvelle écriture de trésorerie</strong> :
        l’argent est déjà en caisse.
      </p>

      <Field label="Échéance" name="dueDate" error={errors.dueDate} hint="Facultative.">
        <Input name="dueDate" type="date" error={errors.dueDate} />
      </Field>

      <SubmitButton icon={FileText} label="Émettre la facture" pendingLabel="Facturation…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Annulation — B-10                                                          */
/* -------------------------------------------------------------------------- */

export function CancelSalePanel({
  saleId,
  sessionClosed,
}: {
  saleId: string
  /** B-10 : annuler la vente d'une session close change son écart. */
  sessionClosed: boolean
}) {
  const [state, formAction] = useActionState<PosSaleFormState, FormData>(cancelSaleAction, EMPTY_FORM_STATE)
  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />
      <input type="hidden" name="saleId" value={saleId} />

      {sessionClosed && (
        <Notice tone="warning">
          La session de cette vente est <strong>close</strong>. L’annuler retire ses espèces du
          montant théorique : <strong>l’écart constaté à la clôture changera</strong>.
        </Notice>
      )}

      <p className="text-sm text-muted">
        L’annulation corrige une erreur de saisie : la vente, ses paiements et leurs écritures
        passent « annulés », rien n’est effacé. Elle ne décrit pas un remboursement.
      </p>

      <Field label="Motif" name="reason" required error={errors.reason}>
        <Textarea name="reason" error={errors.reason} className="min-h-20" />
      </Field>

      <SubmitButton icon={Ban} tone="danger" label="Annuler la vente" pendingLabel="Annulation…" />
    </form>
  )
}
