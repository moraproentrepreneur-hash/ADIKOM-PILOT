'use client'

import { useActionState } from 'react'
import { Banknote, X } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  cancelCustomerPaymentAction,
  recordCustomerPaymentAction,
  type CustomerPaymentFormState,
} from './actions'
import {
  formatAmount,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
} from '@/features/treasury/constants'

/**
 * Formulaires de règlement client — Étape 2.5, LOT 8.
 *
 * L'ÉCRAN DIT CE QUE L'ACTE PRODUIT.
 *
 * Un encaissement fait ENTRER de l'argent sur un compte (Workflow 08 §47) : le
 * formulaire l'annonce avant l'envoi, avec le solde qui le borne (§40).
 */

/** Comptes proposables — Module 06 §10 : les actifs seulement. */
export type AccountOption = { id: string; label: string }

export function RecordCustomerPaymentPanel({
  invoiceId,
  accounts,
  remainingDue,
  today,
}: {
  invoiceId: string
  /** `null` lorsque les comptes ne sont pas lisibles (DEC-017). */
  accounts: AccountOption[] | null
  /** Solde restant. `null` lorsqu'il n'est pas calculable avec les droits du lecteur. */
  remainingDue: number | null
  today: string
}) {
  const [state, formAction] = useActionState<CustomerPaymentFormState, FormData>(
    recordCustomerPaymentAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  if (accounts === null) {
    return (
      <Notice tone="warning">
        Votre compte ne peut pas consulter les comptes financiers. Un encaissement suppose de
        désigner celui qui sera crédité : il ne peut pas être enregistré à l’aveugle.
      </Notice>
    )
  }

  if (accounts.length === 0) {
    return (
      <Notice tone="warning">
        Aucun compte <strong>actif</strong> n’est disponible. Ouvrez un compte bancaire ou une
        caisse dans <strong>Banques &amp; Caisses</strong> avant d’enregistrer un règlement.
      </Notice>
    )
  }

  if (remainingDue !== null && remainingDue <= 0) {
    return (
      <Notice tone="success">
        Cette facture est <strong>soldée</strong> : son total est intégralement encaissé. Aucun
        règlement supplémentaire n’est accepté.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Compte à mouvementer"
        name="accountId"
        required
        error={errors.accountId}
        hint="Banque ou caisse où entre l’argent (Workflow 08 §13, §46)."
      >
        <Select name="accountId" defaultValue="" error={errors.accountId}>
          <option value="">À désigner</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Montant encaissé"
          name="amount"
          required
          error={errors.amount}
          hint={
            remainingDue !== null
              ? `En KMF. Solde de cette facture : ${remainingDue.toLocaleString('fr-FR')} KMF.`
              : 'En KMF, sans décimale.'
          }
        >
          <Input name="amount" inputMode="numeric" error={errors.amount} className="tabular" />
        </Field>

        <Field
          label="Date du règlement"
          name="receivedOn"
          required
          error={errors.receivedOn}
          hint="Date réelle de l’encaissement, distincte de celle de la facture (§11)."
        >
          <Input name="receivedOn" type="date" defaultValue={today} error={errors.receivedOn} />
        </Field>

        <Field label="Mode de paiement" name="method" required error={errors.method}>
          <Select name="method" defaultValue="BANK_TRANSFER" error={errors.method}>
            {PAYMENT_METHOD_ORDER.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Référence externe"
          name="externalRef"
          hint="Numéro de virement, de chèque ou de bordereau (§16)."
        >
          <Input name="externalRef" placeholder="VIR-2026-0042" />
        </Field>
      </div>

      <Field label="Observations" name="notes">
        <Textarea name="notes" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Le compte désigné sera <strong>crédité</strong> du montant encaissé, et le solde de la
        facture diminuera d’autant. Un versement supérieur au solde est refusé : le traitement
        d’un trop-perçu relève d’une règle qu’ADIKOM n’a pas arrêtée.
      </p>

      <SubmitButton
        label="Enregistrer le règlement"
        icon={Banknote}
        pendingLabel="Enregistrement…"
      />
    </form>
  )
}

/** Annulation — Workflow 08 §28 et §29. Rien n'est effacé. */
export function CancelCustomerPaymentPanel({
  paymentId,
  invoiceId,
  amount,
}: {
  paymentId: string
  invoiceId: string
  amount: number
}) {
  const [state, formAction] = useActionState<CustomerPaymentFormState, FormData>(
    cancelCustomerPaymentAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Motif"
        name={`reason-customer-payment-${paymentId}`}
        hint="Facultatif, conservé au journal."
      >
        <Textarea id={`reason-customer-payment-${paymentId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Le compte sera débité de <strong>{formatAmount(amount)}</strong> et le solde de la facture
        remontera d’autant. L’écriture reste, marquée annulée : rien n’est effacé.
      </p>

      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
      >
        <X className="size-4" aria-hidden />
        Annuler le règlement
      </button>
    </form>
  )
}
