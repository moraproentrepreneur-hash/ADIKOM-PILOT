'use client'

import { useActionState } from 'react'
import { Plus, Save } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  createFinancialAccountAction,
  updateFinancialAccountAction,
  type TreasuryFormState,
} from './actions'
import {
  ACCOUNT_KIND_LABELS,
  ACCOUNT_KIND_ORDER,
  type FinancialAccountKind,
} from './constants'

/**
 * Formulaires de compte financier — Étape 2.5, LOT 6.
 *
 * Le solde initial se saisit une fois, et se fige dès la première écriture
 * (Module 06 §12) : le modifier après coup déplacerait un solde sans mouvement
 * correspondant. Le formulaire le dit, et disparaît quand ce n'est plus permis.
 */

export function CreateAccountPanel() {
  const [state, formAction] = useActionState<TreasuryFormState, FormData>(
    createFinancialAccountAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" name="kind" required error={errors.kind}>
          <Select name="kind" defaultValue="BANK" error={errors.kind}>
            {ACCOUNT_KIND_ORDER.map((kind) => (
              <option key={kind} value={kind}>
                {ACCOUNT_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Nom du compte"
          name="label"
          required
          error={errors.label}
          hint="Ce que l’équipe appelle ce compte au quotidien."
        >
          <Input name="label" placeholder="Caisse principale" error={errors.label} />
        </Field>

        <Field
          label="Banque ou responsable"
          name="institution"
          hint="La banque du compte, ou la personne qui tient la caisse."
        >
          <Input name="institution" />
        </Field>

        <Field
          label="Numéro ou référence"
          name="accountReference"
          hint="Référence du compte. Sa consultation relève du droit de voir les comptes."
        >
          <Input name="accountReference" />
        </Field>

        <Field
          label="Solde initial"
          name="openingBalance"
          error={errors.openingBalance}
          hint="En KMF. Il se fige dès la première écriture (§12)."
        >
          <Input
            name="openingBalance"
            inputMode="numeric"
            defaultValue="0"
            error={errors.openingBalance}
            className="tabular"
          />
        </Field>

        <Field label="Date d’ouverture" name="openedOn">
          <Input name="openedOn" type="date" />
        </Field>
      </div>

      <Field label="Description" name="description">
        <Textarea name="description" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Le compte est ouvert <strong>actif</strong> : il sera proposé pour les règlements. Son
        solde ne se saisit jamais — il se calcule du solde initial et des écritures.
      </p>

      <SubmitButton label="Ouvrir le compte" icon={Plus} pendingLabel="Ouverture…" />
    </form>
  )
}

export function EditAccountPanel({
  accountId,
  kind,
  label,
  institution,
  accountReference,
  openingBalance,
  openedOn,
  description,
  balanceLocked,
}: {
  accountId: string
  kind: FinancialAccountKind
  label: string
  institution: string | null
  accountReference: string | null
  openingBalance: number
  openedOn: string | null
  description: string | null
  /** Vrai dès qu'une écriture existe : le solde initial ne bouge plus (§12). */
  balanceLocked: boolean
}) {
  const [state, formAction] = useActionState<TreasuryFormState, FormData>(
    updateFinancialAccountAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="accountId" value={accountId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Nom du compte" name="label" required error={errors.label}>
        <Input name="label" defaultValue={label} error={errors.label} />
      </Field>

      <Field label={kind === 'BANK' ? 'Banque' : 'Responsable'} name="institution">
        <Input name="institution" defaultValue={institution ?? ''} />
      </Field>

      <Field label="Numéro ou référence" name="accountReference">
        <Input name="accountReference" defaultValue={accountReference ?? ''} />
      </Field>

      {balanceLocked ? (
        <p className="rounded-control border border-line bg-canvas px-3.5 py-3 text-xs text-muted">
          Le <strong>solde initial</strong> ({openingBalance.toLocaleString('fr-FR')} KMF) est figé :
          ce compte porte des écritures. Le corriger déplacerait son solde sans qu’aucun mouvement
          ne l’explique (Module 06 §12, §17).
        </p>
      ) : (
        <Field
          label="Solde initial"
          name="openingBalance"
          error={errors.openingBalance}
          hint="En KMF. Il se figera dès la première écriture."
        >
          <Input
            name="openingBalance"
            inputMode="numeric"
            defaultValue={String(openingBalance)}
            error={errors.openingBalance}
            className="tabular"
          />
        </Field>
      )}

      <Field label="Date d’ouverture" name="openedOn">
        <Input name="openedOn" type="date" defaultValue={openedOn ?? ''} />
      </Field>

      <Field label="Description" name="description">
        <Textarea name="description" rows={2} defaultValue={description ?? ''} />
      </Field>

      <SubmitButton label="Enregistrer" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}
