'use client'

import { useActionState } from 'react'
import { Check, Plus, X } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatAmount } from '@/features/treasury/constants'
import {
  cancelMiscPaymentAction,
  createMiscPaymentAction,
  validateMiscPaymentAction,
  type MiscPaymentFormState,
} from './actions'
import {
  MISC_PAYMENT_CATEGORY_LABELS,
  MISC_PAYMENT_CATEGORY_ORDER,
} from './constants'

/**
 * Formulaires de paiement divers — Module 07 §43 à §47, LOT 17.
 *
 * L'ÉCRAN DIT CE QUE CHAQUE GESTE PRODUIT.
 *
 * Un brouillon ne sort aucun fonds : le formulaire l'annonce, pour qu'une
 * saisie ne soit jamais prise pour un paiement effectué. La validation débite
 * le compte source (§45), et le bouton le dit avant le clic.
 */

/** Comptes proposables — Module 06 §10 : les actifs seulement. */
export type AccountOption = { id: string; label: string }

export function CreateMiscPaymentPanel({
  accounts,
  today,
}: {
  /** `null` lorsque les comptes ne sont pas lisibles (DEC-017). */
  accounts: AccountOption[] | null
  today: string
}) {
  const [state, formAction] = useActionState<MiscPaymentFormState, FormData>(
    createMiscPaymentAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  if (accounts === null) {
    return (
      <Notice tone="warning">
        Votre compte ne peut pas consulter les comptes financiers. Un paiement suppose de désigner
        celui qui sera débité : il ne peut pas être saisi à l’aveugle.
      </Notice>
    )
  }

  if (accounts.length === 0) {
    return (
      <Notice tone="warning">
        Aucun compte <strong>actif</strong> n’est disponible. Ouvrez un compte bancaire ou une
        caisse dans <strong>Banques &amp; Caisses</strong> avant de saisir un paiement.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Compte source"
          name="accountId"
          required
          error={errors.accountId}
          hint="Le compte débité à la validation (§44, §45)."
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

        <Field label="Catégorie" name="category" required error={errors.category}>
          <Select name="category" defaultValue="ADMIN_FEE" error={errors.category}>
            {MISC_PAYMENT_CATEGORY_ORDER.map((category) => (
              <option key={category} value={category}>
                {MISC_PAYMENT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Montant"
          name="amount"
          required
          error={errors.amount}
          hint="En KMF, sans décimale."
        >
          <Input name="amount" inputMode="numeric" error={errors.amount} className="tabular" />
        </Field>

        <Field label="Date du paiement" name="paidOn" required error={errors.paidOn}>
          <Input name="paidOn" type="date" defaultValue={today} error={errors.paidOn} />
        </Field>

        <Field
          label="Bénéficiaire"
          name="beneficiary"
          required
          error={errors.beneficiary}
          hint="À qui l’argent est versé (§44)."
        >
          <Input
            name="beneficiary"
            placeholder="Trésor public, fournisseur ponctuel…"
            error={errors.beneficiary}
          />
        </Field>

        <Field
          label="Référence"
          name="externalRef"
          hint="Reçu, bordereau, numéro de pièce (§44)."
        >
          <Input name="externalRef" placeholder="RECU-2026-0042" />
        </Field>
      </div>

      <Field
        label="Motif"
        name="purpose"
        required
        error={errors.purpose}
        wide
        hint="§43 : « chaque paiement doit être suffisamment documenté »."
      >
        <Textarea name="purpose" rows={2} error={errors.purpose} />
      </Field>

      <Field label="Commentaire" name="notes">
        <Textarea name="notes" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Le paiement est enregistré en <strong>brouillon</strong> : aucun fonds ne sort, et aucune
        écriture n’est produite. La <strong>validation</strong> débitera le compte source du
        montant payé.
      </p>

      <SubmitButton label="Enregistrer le paiement" icon={Plus} pendingLabel="Enregistrement…" />
    </form>
  )
}

/** Validation — §45. C'est ici que les fonds sortent. */
export function ValidateMiscPaymentPanel({
  paymentId,
  amount,
  accountLabel,
}: {
  paymentId: string
  amount: number
  accountLabel: string | null
}) {
  const [state, formAction] = useActionState<MiscPaymentFormState, FormData>(
    validateMiscPaymentAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />

      <FormFeedback error={state.error} success={state.success} />

      <p className="text-xs text-muted">
        <strong>{accountLabel ?? 'Le compte source'}</strong> sera débité de{' '}
        <strong>{formatAmount(amount)}</strong>, et l’écriture correspondante enregistrée au
        journal des mouvements (§45).
      </p>

      <SubmitButton label="Valider le paiement" icon={Check} pendingLabel="Validation…" />
    </form>
  )
}

/** Annulation — §47. L'écriture suit ; rien n'est effacé. */
export function CancelMiscPaymentPanel({
  paymentId,
  amount,
  validated,
}: {
  paymentId: string
  amount: number
  validated: boolean
}) {
  const [state, formAction] = useActionState<MiscPaymentFormState, FormData>(
    cancelMiscPaymentAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Motif"
        name={`reason-misc-payment-${paymentId}`}
        hint="Facultatif, conservé au journal (§47)."
      >
        <Textarea id={`reason-misc-payment-${paymentId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        {validated ? (
          <>
            L’écriture de <strong>{formatAmount(amount)}</strong> sera annulée et le solde du
            compte remontera d’autant. L’historique du paiement reste consultable.
          </>
        ) : (
          <>
            Ce paiement est en brouillon : il n’a produit aucune écriture. Son annulation le
            conserve à l’historique plutôt que de l’effacer.
          </>
        )}
      </p>

      <SubmitButton
        label="Annuler le paiement"
        icon={X}
        tone="secondary"
        pendingLabel="Annulation…"
      />
    </form>
  )
}
