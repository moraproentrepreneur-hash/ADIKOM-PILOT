'use client'

import { useActionState, useState } from 'react'
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
  MISC_PAYMENT_DIRECTIONS,
  MISC_PAYMENT_DIRECTION_HINTS,
  MISC_PAYMENT_DIRECTION_LABELS,
  MISC_PAYMENT_PARTY_HINTS,
  MISC_PAYMENT_PARTY_LABELS,
  type MiscPaymentDirection,
} from './constants'

/**
 * Formulaires de paiement divers — Module 07 §43 à §47.
 *
 * L'ÉCRAN DIT CE QUE CHAQUE GESTE PRODUIT.
 *
 * Un brouillon ne déplace aucun fonds : le formulaire l'annonce, pour qu'une
 * saisie ne soit jamais prise pour un paiement effectué. La validation mouvemente
 * le compte (§45), et le bouton le dit avant le clic.
 *
 * LE SENS EST LE PREMIER CHOIX — DEC-042 §b
 *
 * Encaissement ou décaissement : le reste du formulaire s'y accorde. Le
 * bénéficiaire devient un payeur, l'effet annoncé change de signe. Poser la
 * question en tête plutôt qu'en bas de page évite de saisir un mouvement entier
 * dans le mauvais sens.
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

  /*
   * Le sens choisi n'est pas qu'une valeur envoyée : il change les mots du
   * formulaire. Il est donc suivi ici — la valeur reste portée par le champ,
   * que le serveur relit dans le `FormData` comme les autres.
   */
  const [direction, setDirection] = useState<MiscPaymentDirection>('OUT')
  const entree = direction === 'IN'

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
          label="Sens"
          name="direction"
          required
          error={errors.direction}
          hint={MISC_PAYMENT_DIRECTION_HINTS[direction]}
        >
          <Select
            name="direction"
            value={direction}
            error={errors.direction}
            onChange={(event) => setDirection(event.target.value as MiscPaymentDirection)}
          >
            {MISC_PAYMENT_DIRECTIONS.map((value) => (
              <option key={value} value={value}>
                {MISC_PAYMENT_DIRECTION_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Compte"
          name="accountId"
          required
          error={errors.accountId}
          hint={
            entree
              ? 'Le compte crédité à la validation.'
              : 'Le compte débité à la validation.'
          }
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
          label={MISC_PAYMENT_PARTY_LABELS[direction]}
          name="beneficiary"
          required
          error={errors.beneficiary}
          hint={MISC_PAYMENT_PARTY_HINTS[direction]}
        >
          <Input
            name="beneficiary"
            placeholder={
              entree ? 'Assureur, partenaire, organisme…' : 'Trésor public, fournisseur ponctuel…'
            }
            error={errors.beneficiary}
          />
        </Field>

        <Field
          label="Référence"
          name="externalRef"
          hint="Reçu, bordereau, numéro de pièce."
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
        hint="Chaque paiement doit être suffisamment documenté."
      >
        <Textarea name="purpose" rows={2} error={errors.purpose} />
      </Field>

      <Field label="Commentaire" name="notes">
        <Textarea name="notes" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Le paiement est enregistré en <strong>brouillon</strong> : aucun fonds ne bouge, et aucune
        écriture n’est produite. La <strong>validation</strong>{' '}
        {entree ? 'créditera' : 'débitera'} le compte désigné du montant saisi.
      </p>

      <SubmitButton label="Enregistrer le paiement" icon={Plus} pendingLabel="Enregistrement…" />
    </form>
  )
}

/** Validation — §45. C'est ici que les fonds bougent, dans le sens du paiement. */
export function ValidateMiscPaymentPanel({
  paymentId,
  amount,
  direction,
  accountLabel,
}: {
  paymentId: string
  amount: number
  direction: MiscPaymentDirection
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
        <strong>{accountLabel ?? 'Le compte désigné'}</strong> sera{' '}
        {direction === 'IN' ? 'crédité' : 'débité'} de <strong>{formatAmount(amount)}</strong>, et
        l’écriture correspondante enregistrée au journal des mouvements.
      </p>

      <SubmitButton label="Valider le paiement" icon={Check} pendingLabel="Validation…" />
    </form>
  )
}

/** Annulation — §47. L'écriture suit ; rien n'est effacé. */
export function CancelMiscPaymentPanel({
  paymentId,
  amount,
  direction,
  validated,
}: {
  paymentId: string
  amount: number
  direction: MiscPaymentDirection
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
        hint="Facultatif, conservé au journal."
      >
        <Textarea id={`reason-misc-payment-${paymentId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        {validated ? (
          <>
            L’écriture de <strong>{formatAmount(amount)}</strong> sera annulée et le solde du
            compte {direction === 'IN' ? 'redescendra' : 'remontera'} d’autant. L’historique du
            paiement reste consultable.
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
