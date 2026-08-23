'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  saveSupplierPaymentAction,
  setSupplierPaymentStateAction,
  type SupplierFormState,
} from './actions'
import { PAYMENT_KIND_LABELS, type SupplierPaymentKind } from './constants'
import type { SupplierPaymentDetail } from './data'

/**
 * Informations de paiement d'un fournisseur — donnée sensible.
 *
 * Un fournisseur peut porter plusieurs coordonnées de règlement : deux comptes
 * bancaires, une coordonnée d'une autre nature. Une seule est principale, et la
 * base l'impose (migration 028).
 *
 * Le formulaire n'est rendu qu'avec la permission de modification, mais ce
 * n'est pas ce qui protège la donnée : la lecture est filtrée par RLS et
 * l'écriture refusée côté serveur. Masquer ce bloc n'est qu'un confort
 * (05_Regles_Metier/05_Permissions.md §85).
 *
 * Une coordonnée ne se supprime pas — elle se désactive. Aucune policy DELETE
 * n'existe, et le droit est retiré en base (CLAUDE.md §22).
 */

/* -------------------------------------------------------------------------- */
/*  Formulaire d'une coordonnée                                                */
/* -------------------------------------------------------------------------- */

export function PaymentDetailForm({
  supplierId,
  detail,
  cancelHref,
}: {
  supplierId: string
  /** Absent en création. */
  detail?: SupplierPaymentDetail
  cancelHref: string
}) {
  const [state, formAction] = useActionState<SupplierFormState, FormData>(
    saveSupplierPaymentAction,
    EMPTY_FORM_STATE
  )

  /*
   * La nature commande les champs présentés : un IBAN n'a pas de sens sur une
   * coordonnée non bancaire, et la base le refuse. Autant ne pas le proposer.
   */
  const [kind, setKind] = useState<SupplierPaymentKind>(detail?.kind ?? 'BANK_ACCOUNT')

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="supplierId" value={supplierId} />
      {detail && <input type="hidden" name="paymentId" value={detail.id} />}

      <Notice tone="warning" className="mb-5">
        Ces informations servent au règlement du fournisseur. Toute modification est journalisée.
      </Notice>

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Coordonnée">
        <Field label="Nature" name="kind" required error={errors.kind}>
          <Select
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as SupplierPaymentKind)}
            error={errors.kind}
          >
            {(Object.keys(PAYMENT_KIND_LABELS) as SupplierPaymentKind[]).map((value) => (
              <option key={value} value={value}>
                {PAYMENT_KIND_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Désignation"
          name="label"
          required
          error={errors.label}
          hint="Sert à reconnaître la coordonnée. N’y mettez aucune donnée sensible."
        >
          <Input
            name="label"
            defaultValue={detail?.label ?? ''}
            placeholder="Compte principal, compte devises…"
            error={errors.label}
          />
        </Field>

        <Field label="Titulaire / bénéficiaire" name="accountHolder" error={errors.accountHolder}>
          <Input
            name="accountHolder"
            defaultValue={detail?.accountHolder ?? ''}
            error={errors.accountHolder}
          />
        </Field>

        <Field
          label="Devise"
          name="currencyCode"
          error={errors.currencyCode}
          hint="Code à trois lettres, si la coordonnée est propre à une devise."
        >
          <Input
            name="currencyCode"
            defaultValue={detail?.currencyCode ?? ''}
            placeholder="KMF"
            maxLength={3}
            error={errors.currencyCode}
            className="tabular"
          />
        </Field>
      </FormSection>

      {kind === 'BANK_ACCOUNT' ? (
        <FormSection title="Compte bancaire">
          <Field label="Banque" name="bankName" error={errors.bankName}>
            <Input name="bankName" defaultValue={detail?.bankName ?? ''} error={errors.bankName} />
          </Field>

          <Field label="Agence / succursale" name="bankBranch" error={errors.bankBranch}>
            <Input
              name="bankBranch"
              defaultValue={detail?.bankBranch ?? ''}
              error={errors.bankBranch}
            />
          </Field>

          <Field label="Numéro de compte" name="accountNumber" error={errors.accountNumber}>
            <Input
              name="accountNumber"
              defaultValue={detail?.accountNumber ?? ''}
              error={errors.accountNumber}
              className="tabular"
              autoComplete="off"
            />
          </Field>

          <Field label="IBAN" name="iban" error={errors.iban}>
            <Input
              name="iban"
              defaultValue={detail?.iban ?? ''}
              error={errors.iban}
              className="tabular"
              autoComplete="off"
            />
          </Field>

          <Field label="BIC / SWIFT" name="swiftBic" error={errors.swiftBic}>
            <Input
              name="swiftBic"
              defaultValue={detail?.swiftBic ?? ''}
              error={errors.swiftBic}
              className="tabular"
              autoComplete="off"
            />
          </Field>
        </FormSection>
      ) : (
        <FormSection title="Autre coordonnée">
          <Field
            label="Référence"
            name="accountReference"
            required
            error={errors.accountReference}
            hint="L’identifiant permettant d’effectuer le règlement."
            wide
          >
            <Input
              name="accountReference"
              defaultValue={detail?.accountReference ?? ''}
              error={errors.accountReference}
              className="tabular"
              autoComplete="off"
            />
          </Field>
        </FormSection>
      )}

      <FormSection title="Précisions">
        <Field label="Notes" name="paymentNotes" error={errors.notes} wide>
          <Textarea name="paymentNotes" defaultValue={detail?.notes ?? ''} error={errors.notes} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
          <input
            type="checkbox"
            name="isPrimary"
            defaultChecked={detail?.isPrimary ?? false}
            className="size-4 rounded border-line accent-adikom-500"
          />
          Coordonnée principale — celle à utiliser par défaut pour régler ce fournisseur
        </label>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <SubmitButton
          label={detail ? 'Enregistrer la coordonnée' : 'Ajouter la coordonnée'}
          icon={Lock}
        />
        <Link href={cancelHref} className="text-sm text-muted transition-colors hover:text-ink">
          Annuler
        </Link>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Activation, désactivation, coordonnée principale                           */
/* -------------------------------------------------------------------------- */

export function PaymentStateButton({
  supplierId,
  paymentId,
  operation,
  label,
}: {
  supplierId: string
  paymentId: string
  operation: 'primary' | 'activate' | 'deactivate'
  label: string
}) {
  const [state, formAction] = useActionState<SupplierFormState, FormData>(
    setSupplierPaymentStateAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="operation" value={operation} />

      <SubmitButton label={label} pendingLabel="…" tone="secondary" />

      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  )
}
