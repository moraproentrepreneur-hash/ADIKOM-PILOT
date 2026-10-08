'use client'

import { useActionState, useState } from 'react'
import { Ban, Calculator, FileText } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { cancelSaleAction, invoiceSaleAction, valueSaleCostsAction, type PosSaleFormState } from './actions'

/* -------------------------------------------------------------------------- */
/*  Valoriser les coûts manquants — Q-13                                       */
/* -------------------------------------------------------------------------- */

export function ValueCostsPanel({ saleId, missing }: { saleId: string; missing: number }) {
  const [state, formAction] = useActionState<PosSaleFormState, FormData>(valueSaleCostsAction, EMPTY_FORM_STATE)

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />
      <input type="hidden" name="saleId" value={saleId} />
      <p className="text-sm text-muted">
        {missing} ligne(s) sans coût : le vendeur ne pouvait pas le lire. La valorisation copie le coût
        <strong> en vigueur le jour de la vente</strong>, sans jamais remplacer un coût déjà copié. Une
        ligne sans coût ce jour-là garde une marge inconnue.
      </p>
      <SubmitButton icon={Calculator} label="Valoriser les coûts manquants" pendingLabel="Valorisation…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Facture sur demande — A-11, C-2                                            */
/* -------------------------------------------------------------------------- */

export function InvoiceSalePanel({
  saleId,
  clients,
}: {
  saleId: string
  /**
   * Q-10 : présent seulement pour une vente ANONYME — le client se choisit ici
   * et se rattache une seule fois, avec la facture. `null` : liste illisible.
   */
  clients?: { id: string; label: string }[] | null
}) {
  const [state, formAction] = useActionState<PosSaleFormState, FormData>(invoiceSaleAction, EMPTY_FORM_STATE)
  const errors = state.fieldErrors ?? {}
  // Piloté : React 19 vide les champs non pilotés après l'action, même refusée.
  const [clientId, setClientId] = useState('')

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />
      <input type="hidden" name="saleId" value={saleId} />

      <p className="text-sm text-muted">
        La facture reprend les lignes et les remises de la vente, s’émet, puis est soldée par les
        paiements déjà reçus au comptoir — <strong>sans nouvelle écriture de trésorerie</strong> :
        l’argent est déjà en caisse.
      </p>

      {clients !== undefined && (
        <Field
          label="Client facturé"
          name="clientId"
          required
          error={errors.clientId}
          hint="Vente sans client : le client choisi lui est rattaché une seule fois, avec la facture. Les montants ne changent pas."
        >
          {clients === null ? (
            <p className="text-sm text-muted">La liste des clients n’est pas lisible avec vos droits.</p>
          ) : (
            <Select name="clientId" value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Choisir un client…</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

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
