'use client'

import { useActionState } from 'react'
import { Check, Link2, Plus, Save, Send, Unlink, X } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  addSupplierInvoiceLineAction,
  archiveSupplierInvoiceLineAction,
  attachImputationAction,
  cancelSupplierInvoiceAction,
  createSupplierInvoiceAction,
  detachImputationAction,
  submitSupplierInvoiceAction,
  updateSupplierInvoiceAction,
  validateSupplierInvoiceAction,
  type SupplierInvoiceFormState,
} from './actions'
import { formatAmount } from './constants'

/**
 * Formulaires de la facturation fournisseur — Étape 2.5, LOT 5.
 *
 * L'ÉCRAN NE PROMET PAS CE QU'IL NE FAIT PAS.
 *
 * Valider une facture reconnaît une dette ; elle ne la règle pas. Rattacher une
 * imputation réduit le net à payer ; ce n'est pas un paiement (Module 07 §37).
 * Les deux formulaires le disent AVANT l'envoi, pas après.
 */

type Option = { id: string; label: string }

/* -------------------------------------------------------------------------- */
/*  Enregistrer une facture reçue — Module 07 §28                              */
/* -------------------------------------------------------------------------- */

export function CreateSupplierInvoicePanel({
  suppliers,
  defaultSupplierId,
}: {
  suppliers: Option[]
  defaultSupplierId?: string
}) {
  const [state, formAction] = useActionState<SupplierInvoiceFormState, FormData>(
    createSupplierInvoiceAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  if (suppliers.length === 0) {
    return (
      <Notice tone="warning">
        Aucun fournisseur actif n’est lisible avec vos droits. Une facture ne s’enregistre pas sans
        savoir de qui elle vient.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Fournisseur"
          name="supplierId"
          required
          error={errors.supplierId}
          hint="Émetteur de la facture reçue."
        >
          <Select
            name="supplierId"
            defaultValue={defaultSupplierId ?? ''}
            error={errors.supplierId}
          >
            <option value="">À désigner</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Référence du fournisseur"
          name="externalRef"
          hint="Numéro porté par le document reçu (§30). Distinct du numéro ADIKOM."
        >
          <Input name="externalRef" placeholder="FRN-2026-0042" />
        </Field>

        <Field label="Date de la facture" name="invoiceDate" required error={errors.invoiceDate}>
          <Input name="invoiceDate" type="date" error={errors.invoiceDate} />
        </Field>

        <Field
          label="Échéance"
          name="dueDate"
          error={errors.dueDate}
          hint="Facultative. Elle sert au suivi des retards."
        >
          <Input name="dueDate" type="date" error={errors.dueDate} />
        </Field>
      </div>

      <Field label="Observations" name="notes">
        <Textarea name="notes" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        La facture est enregistrée <strong>en brouillon</strong>. Son montant brut viendra de ses
        lignes : une facture sans ligne ne peut pas être validée.
      </p>

      <SubmitButton label="Enregistrer la facture" icon={Plus} pendingLabel="Enregistrement…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Modifier l'en-tête                                                         */
/* -------------------------------------------------------------------------- */

export function EditSupplierInvoicePanel({
  invoiceId,
  invoiceDate,
  dueDate,
  externalRef,
  notes,
}: {
  invoiceId: string
  invoiceDate: string
  dueDate: string | null
  externalRef: string | null
  notes: string | null
}) {
  const [state, formAction] = useActionState<SupplierInvoiceFormState, FormData>(
    updateSupplierInvoiceAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Date de la facture" name="invoiceDate" required error={errors.invoiceDate}>
        <Input
          name="invoiceDate"
          type="date"
          defaultValue={invoiceDate}
          error={errors.invoiceDate}
        />
      </Field>

      <Field label="Échéance" name="dueDate" error={errors.dueDate}>
        <Input name="dueDate" type="date" defaultValue={dueDate ?? ''} error={errors.dueDate} />
      </Field>

      <Field label="Référence du fournisseur" name="externalRef">
        <Input name="externalRef" defaultValue={externalRef ?? ''} />
      </Field>

      <Field label="Observations" name="notes">
        <Textarea name="notes" rows={2} defaultValue={notes ?? ''} />
      </Field>

      <p className="text-xs text-muted">
        Le fournisseur n’est pas modifiable : la facture d’un autre fournisseur est une autre
        facture.
      </p>

      <SubmitButton label="Enregistrer" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Lignes — la seule source du montant brut                                   */
/* -------------------------------------------------------------------------- */

export function AddInvoiceLinePanel({
  invoiceId,
  vehicles,
}: {
  invoiceId: string
  /** `null` lorsque le parc n'est pas lisible : le champ disparaît (DEC-017). */
  vehicles: Option[] | null
}) {
  const [state, formAction] = useActionState<SupplierInvoiceFormState, FormData>(
    addSupplierInvoiceLineAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Désignation" name="label" required error={errors.label}>
        <Input
          name="label"
          placeholder="Mise à disposition du véhicule — janvier"
          error={errors.label}
        />
      </Field>

      <Field
        label="Montant"
        name="amount"
        required
        error={errors.amount}
        hint="En KMF, sans décimale. La somme des lignes fait le montant brut."
      >
        <Input name="amount" inputMode="numeric" error={errors.amount} className="tabular" />
      </Field>

      {vehicles === null ? (
        <p className="text-xs text-muted">
          Votre compte ne peut pas consulter le parc automobile : la ligne sera enregistrée sans
          véhicule rattaché.
        </p>
      ) : (
        <Field
          label="Véhicule concerné"
          name="vehicleId"
          hint="Facultatif. Une facture peut couvrir plusieurs véhicules : le lien est porté par la ligne."
        >
          <Select name="vehicleId" defaultValue="">
            <option value="">Aucun véhicule désigné</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <SubmitButton label="Ajouter la ligne" icon={Plus} pendingLabel="Ajout…" />
    </form>
  )
}

/** Retrait d'une ligne — archivage, jamais suppression (CLAUDE.md §22). */
export function ArchiveInvoiceLineButton({
  invoiceId,
  lineId,
}: {
  invoiceId: string
  lineId: string
}) {
  const [state, formAction] = useActionState<SupplierInvoiceFormState, FormData>(
    archiveSupplierInvoiceLineAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="lineId" value={lineId} />
      {state.error && <span className="mr-2 text-xs text-danger">{state.error}</span>}
      <button type="submit" className="text-xs text-muted underline hover:text-ink">
        Retirer
      </button>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Soumettre, valider, annuler                                                */
/* -------------------------------------------------------------------------- */

export function SubmitSupplierInvoicePanel({ invoiceId }: { invoiceId: string }) {
  const [state, formAction] = useActionState<SupplierInvoiceFormState, FormData>(
    submitSupplierInvoiceAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <p className="text-sm text-muted">
        La saisie doit être complète : fournisseur, date, échéance et lignes. Le contrôle relève
        d’une autre capacité.
      </p>

      <SubmitButton label="Soumettre au contrôle" icon={Send} pendingLabel="Envoi…" />
    </form>
  )
}

export function ValidateSupplierInvoicePanel({ invoiceId }: { invoiceId: string }) {
  const [state, formAction] = useActionState<SupplierInvoiceFormState, FormData>(
    validateSupplierInvoiceAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Motif" name={`reason-validate-${invoiceId}`} hint="Facultatif, conservé au journal.">
        <Textarea id={`reason-validate-${invoiceId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Valider <strong>reconnaît la dette</strong> et fige les lignes. Aucun paiement n’est
        enregistré : les règlements fournisseurs relèvent d’une étape ultérieure.
      </p>

      <SubmitButton label="Valider la facture" icon={Check} pendingLabel="Validation…" />
    </form>
  )
}

export function CancelSupplierInvoicePanel({ invoiceId }: { invoiceId: string }) {
  const [state, formAction] = useActionState<SupplierInvoiceFormState, FormData>(
    cancelSupplierInvoiceAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Motif" name={`reason-cancel-${invoiceId}`} hint="Facultatif, conservé au journal.">
        <Textarea id={`reason-cancel-${invoiceId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Une facture portant encore une imputation ne s’annule pas : chaque déduction doit d’abord
        en être détachée.
      </p>

      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
      >
        <X className="size-4" aria-hidden />
        Annuler la facture
      </button>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Rattacher / détacher une imputation — DEC-013                              */
/* -------------------------------------------------------------------------- */

/**
 * Le seul geste du SaaS qui réduise un montant dû.
 *
 * Le formulaire le dit, et rappelle qu'il ne s'agit pas d'un paiement
 * (Module 07 §37).
 */
export function AttachImputationPanel({
  imputationId,
  invoices,
  amount,
}: {
  imputationId: string
  /** Factures validées du même fournisseur (§24, §32). */
  invoices: { id: string; label: string; netPayable: number | null }[]
  amount: number
}) {
  const [state, formAction] = useActionState<SupplierInvoiceFormState, FormData>(
    attachImputationAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  if (invoices.length === 0) {
    return (
      <Notice tone="warning">
        Aucune facture <strong>validée</strong> de ce fournisseur n’est disponible. L’imputation
        reste en attente de facture : elle ne réduit aucun montant dû.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="imputationId" value={imputationId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Facture fournisseur"
        name="invoiceId"
        required
        error={errors.invoiceId}
        hint="Seule une facture validée du même fournisseur peut recevoir cette imputation (§24, §32)."
      >
        <Select name="invoiceId" defaultValue="" error={errors.invoiceId}>
          <option value="">À désigner</option>
          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.label}
              {invoice.netPayable !== null
                ? ` — net à payer ${formatAmount(invoice.netPayable)}`
                : ''}
            </option>
          ))}
        </Select>
      </Field>

      <p className="text-xs text-muted">
        Le net à payer de la facture diminuera de <strong>{formatAmount(amount)}</strong>. Une
        imputation <strong>n’est pas un paiement</strong> : aucun compte n’est mouvementé.
      </p>

      <SubmitButton label="Rattacher à la facture" icon={Link2} pendingLabel="Rattachement…" />
    </form>
  )
}

/** Détachement — procédure contrôlée de correction (§39). */
export function DetachImputationPanel({
  imputationId,
  invoiceId,
}: {
  imputationId: string
  invoiceId: string
}) {
  const [state, formAction] = useActionState<SupplierInvoiceFormState, FormData>(
    detachImputationAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="imputationId" value={imputationId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Motif" name={`reason-detach-${imputationId}`} hint="Facultatif, conservé au journal.">
        <Textarea id={`reason-detach-${imputationId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        L’imputation redeviendra <strong>en attente de facture</strong> et le net à payer remontera
        d’autant. Rien n’est effacé : le journal conserve l’avant et l’après.
      </p>

      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
      >
        <Unlink className="size-4" aria-hidden />
        Détacher de la facture
      </button>
    </form>
  )
}
