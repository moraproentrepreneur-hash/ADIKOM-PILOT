'use client'

import { useActionState } from 'react'
import { Check, Plus, Save, X } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  cancelInternalTransferAction,
  createFinancialAccountAction,
  createInternalTransferAction,
  updateFinancialAccountAction,
  validateInternalTransferAction,
  type TreasuryFormState,
} from './actions'
import {
  ACCOUNT_KIND_LABELS,
  ACCOUNT_KIND_ORDER,
  formatAmount,
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
          hint="En KMF. Il se fige dès la première écriture."
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
          ne l’explique.
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

/* -------------------------------------------------------------------------- */
/*  Virement interne — Module 06 §28 à §33                                     */
/*                                                                             */
/*  L'ÉCRAN DIT CE QUE CHAQUE GESTE PRODUIT.                                   */
/*                                                                             */
/*  La saisie ne déplace rien : le formulaire l'annonce, pour qu'un brouillon   */
/*  ne soit jamais pris pour un virement effectué. La validation, elle, débite  */
/*  et crédite dans le même mouvement (§31), et l'écran le dit avant le clic.   */
/* -------------------------------------------------------------------------- */

/** Comptes proposables — Module 06 §10 : les actifs seulement. */
export type TransferAccountOption = { id: string; label: string }

export function CreateTransferPanel({
  accounts,
  today,
}: {
  /** `null` lorsque les comptes ne sont pas lisibles (DEC-017). */
  accounts: TransferAccountOption[] | null
  today: string
}) {
  const [state, formAction] = useActionState<TreasuryFormState, FormData>(
    createInternalTransferAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  if (accounts === null) {
    return (
      <Notice tone="warning">
        Votre compte ne peut pas consulter les comptes financiers. Un virement suppose d’en
        désigner deux : il ne peut pas être saisi à l’aveugle.
      </Notice>
    )
  }

  if (accounts.length < 2) {
    return (
      <Notice tone="warning">
        Un virement interne exige <strong>deux comptes actifs</strong>. Ouvrez-en un second dans{' '}
        <strong>Banques &amp; Caisses</strong> avant de saisir un virement.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Compte source"
          name="sourceAccountId"
          required
          error={errors.sourceAccountId}
          hint="Le compte débité."
        >
          <Select name="sourceAccountId" defaultValue="" error={errors.sourceAccountId}>
            <option value="">À désigner</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Compte destination"
          name="destinationAccountId"
          required
          error={errors.destinationAccountId}
          hint="Le compte crédité, obligatoirement distinct du premier."
        >
          <Select
            name="destinationAccountId"
            defaultValue=""
            error={errors.destinationAccountId}
          >
            <option value="">À désigner</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Montant"
          name="amount"
          required
          error={errors.amount}
          hint="En KMF, sans décimale. Les fonds ne sortiront qu’à la validation."
        >
          <Input name="amount" inputMode="numeric" error={errors.amount} className="tabular" />
        </Field>

        <Field label="Date du virement" name="transferDate" required error={errors.transferDate}>
          <Input
            name="transferDate"
            type="date"
            defaultValue={today}
            error={errors.transferDate}
          />
        </Field>

        <Field label="Motif" name="purpose" hint="Pourquoi ce transfert.">
          <Input name="purpose" placeholder="Approvisionnement de la banque" />
        </Field>

        <Field label="Référence" name="reference" hint="Bordereau, avis d’opération.">
          <Input name="reference" placeholder="BORD-2026-0012" />
        </Field>
      </div>

      <Field label="Commentaire" name="notes">
        <Textarea name="notes" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Le virement est enregistré en <strong>brouillon</strong> : aucun fonds n’est déplacé, et
        aucune écriture n’est produite. La <strong>validation</strong> contrôlera le solde du
        compte source, puis débitera l’un et créditera l’autre du même montant.
      </p>

      <SubmitButton label="Enregistrer le virement" icon={Plus} pendingLabel="Enregistrement…" />
    </form>
  )
}

/** Validation — §30 puis §31. C'est ici que les fonds bougent. */
export function ValidateTransferPanel({
  transferId,
  amount,
  sourceLabel,
  destinationLabel,
  sourceBalance,
}: {
  transferId: string
  amount: number
  sourceLabel: string | null
  destinationLabel: string | null
  /** `null` lorsqu'il n'est pas calculable avec les droits du lecteur. */
  sourceBalance: number | null
}) {
  const [state, formAction] = useActionState<TreasuryFormState, FormData>(
    validateInternalTransferAction,
    EMPTY_FORM_STATE
  )

  const insufficient = sourceBalance !== null && sourceBalance < amount

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="transferId" value={transferId} />

      <FormFeedback error={state.error} success={state.success} />

      {sourceBalance === null ? (
        <Notice tone="info">
          Le solde du compte source n’est pas lisible avec vos droits. Le contrôle des fonds
          disponibles sera néanmoins appliqué par le serveur, qui refusera le virement s’ils
          manquent.
        </Notice>
      ) : insufficient ? (
        <Notice tone="warning">
          Le compte source ne porte que <strong>{formatAmount(sourceBalance)}</strong>, et ce
          virement en demande <strong>{formatAmount(amount)}</strong>. La validation sera refusée
          tant que les fonds manqueront.
        </Notice>
      ) : (
        <p className="text-xs text-muted">
          Solde du compte source :{' '}
          <strong className="tabular">{formatAmount(sourceBalance)}</strong>.
        </p>
      )}

      <p className="text-xs text-muted">
        <strong>{sourceLabel ?? 'Le compte source'}</strong> sera débité de{' '}
        <strong>{formatAmount(amount)}</strong>, et{' '}
        <strong>{destinationLabel ?? 'le compte destination'}</strong> crédité d’autant. Les deux
        écritures naissent ensemble : jamais l’une sans l’autre.
      </p>

      <SubmitButton
        label="Valider le virement"
        icon={Check}
        pendingLabel="Validation…"
        disabled={insufficient}
      />
    </form>
  )
}

/** Annulation — §33. Les deux écritures suivent ; rien n'est effacé. */
export function CancelTransferPanel({
  transferId,
  amount,
  validated,
}: {
  transferId: string
  amount: number
  validated: boolean
}) {
  const [state, formAction] = useActionState<TreasuryFormState, FormData>(
    cancelInternalTransferAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="transferId" value={transferId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Motif"
        name={`reason-transfer-${transferId}`}
        hint="Facultatif, conservé au journal."
      >
        <Textarea id={`reason-transfer-${transferId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        {validated ? (
          <>
            Les deux écritures de <strong>{formatAmount(amount)}</strong> seront annulées : les
            soldes des deux comptes reviennent. L’historique du virement reste consultable.
          </>
        ) : (
          <>
            Ce virement est en brouillon : il n’a produit aucune écriture. Son annulation le
            conserve à l’historique plutôt que de l’effacer.
          </>
        )}
      </p>

      <SubmitButton
        label="Annuler le virement"
        icon={X}
        tone="secondary"
        pendingLabel="Annulation…"
      />
    </form>
  )
}
