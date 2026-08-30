'use client'

import { useActionState } from 'react'
import { Check, Paperclip, Plus, Save, Send, X } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_ORDER,
} from '@/features/maintenance/costs-constants'
import {
  addImputationDocumentAction,
  archiveImputationDocumentAction,
  cancelImputationAction,
  createImputationAction,
  submitImputationAction,
  updateImputationAction,
  validateImputationAction,
  type ImputationFormState,
} from './actions'
import type { ImputationSupplierOption } from './data'

/**
 * Préparation d'une imputation — Workflow 06 §11, §14.
 *
 * L'ÉCRAN NE PROMET PAS CE QU'IL NE FAIT PAS.
 *
 * Préparer, puis valider, ne réduit AUCUN montant dû : DEC-013 réserve cet
 * effet au statut « Imputée », qui suppose une facture fournisseur. Le
 * formulaire le dit avant l'envoi, pas après.
 */
export function CreateImputationPanel({
  maintenanceId,
  suppliers,
  remaining,
  canSeeCeiling,
}: {
  maintenanceId: string
  /** `null` lorsque le rattachement fournisseur n'est pas lisible (DEC-017). */
  suppliers: ImputationSupplierOption[] | null
  /** Reste imputable. `null` lorsqu'il n'est pas lisible ou pas arrêté. */
  remaining: number | null
  canSeeCeiling: boolean
}) {
  const [state, formAction] = useActionState<ImputationFormState, FormData>(
    createImputationAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}
  const current = suppliers?.find((supplier) => supplier.isCurrent)

  if (suppliers === null) {
    return (
      <Notice tone="warning">
        Le rattachement fournisseur de ce véhicule n’est pas lisible avec vos droits. Une
        imputation ne peut pas être préparée sans savoir à qui elle s’adresse.
      </Notice>
    )
  }

  if (suppliers.length === 0) {
    return (
      <Notice tone="warning">
        Ce véhicule n’est mis à disposition par aucun fournisseur : la dépense reste à la charge
        d’ADIKOM (Workflow 06 §4). Aucune imputation n’est possible.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="maintenanceId" value={maintenanceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Fournisseur"
        name="supplierId"
        required
        error={errors.supplierId}
        hint="Le fournisseur du véhicule, ou l’un de ceux qui l’ont fourni (Workflow 06 §33)."
      >
        <Select name="supplierId" defaultValue={current?.id ?? ''} error={errors.supplierId}>
          <option value="">À désigner</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.label}
              {supplier.isCurrent ? ' — fournisseur actuel' : ' — ancien rattachement'}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Montant imputé"
        name="amount"
        required
        error={errors.amount}
        hint={
          canSeeCeiling && remaining !== null
            ? `En KMF. Reste imputable sur cette maintenance : ${remaining.toLocaleString('fr-FR')} KMF.`
            : 'En KMF, sans décimale.'
        }
      >
        <Input name="amount" inputMode="numeric" error={errors.amount} className="tabular" />
      </Field>

      <Field
        label="Justification"
        name="justification"
        required
        error={errors.justification}
        hint="Pourquoi ce montant est-il déduit ? La réponse doit rester retrouvable (§11)."
      >
        <Textarea
          name="justification"
          rows={3}
          error={errors.justification}
          placeholder="Coût de réparation d’une panne mécanique imputable au fournisseur selon les conditions de mise à disposition du véhicule."
        />
      </Field>

      <p className="text-xs text-muted">
        Préparer une imputation <strong>ne réduit aucun montant dû</strong>. Elle n’aura d’effet
        financier qu’une fois validée <em>et</em> rattachée à une facture fournisseur, ce qui
        relève d’une étape ultérieure.
      </p>

      <SubmitButton label="Préparer l’imputation" icon={Plus} pendingLabel="Enregistrement…" />
    </form>
  )
}

/** Modification d'une imputation encore en préparation — §38. */
export function EditImputationPanel({
  imputationId,
  amount,
  justification,
  suppliers,
  currentSupplierId,
}: {
  imputationId: string
  amount: number
  justification: string
  suppliers: ImputationSupplierOption[] | null
  currentSupplierId: string
}) {
  const [state, formAction] = useActionState<ImputationFormState, FormData>(
    updateImputationAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="imputationId" value={imputationId} />

      <FormFeedback error={state.error} success={state.success} />

      {suppliers === null ? (
        <p className="rounded-control border border-line bg-adikom-50/60 px-3 py-2.5 text-sm text-muted">
          Le rattachement fournisseur n’est pas lisible avec vos droits : il reste inchangé.
        </p>
      ) : (
        <Field label="Fournisseur" name="supplierId" hint="Inchangé si vous ne le modifiez pas.">
          <Select name="supplierId" defaultValue={currentSupplierId}>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.label}
                {supplier.isCurrent ? ' — fournisseur actuel' : ' — ancien rattachement'}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Montant imputé" name="amount" required error={errors.amount} hint="En KMF.">
        <Input
          name="amount"
          inputMode="numeric"
          defaultValue={amount}
          error={errors.amount}
          className="tabular"
        />
      </Field>

      <Field label="Justification" name="justification" required error={errors.justification}>
        <Textarea
          name="justification"
          rows={3}
          defaultValue={justification}
          error={errors.justification}
        />
      </Field>

      <SubmitButton label="Enregistrer" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}

/** Soumission à validation — §15. */
export function SubmitImputationPanel({ imputationId }: { imputationId: string }) {
  const [state, formAction] = useActionState<ImputationFormState, FormData>(
    submitImputationAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="imputationId" value={imputationId} />

      <FormFeedback error={state.error} success={state.success} />

      <p className="text-sm text-muted">
        Les informations doivent être complètes : fournisseur, maintenance, montant et
        justification. La validation relève d’une autre capacité.
      </p>

      <SubmitButton label="Soumettre à validation" icon={Send} pendingLabel="Envoi…" />
    </form>
  )
}

/**
 * Validation — §16.
 *
 * LE MESSAGE COMPTE AUTANT QUE L'ACTE.
 *
 * Valider ne déduit rien (DEC-013). L'écran l'annonce avant, afin que
 * personne ne croie avoir réduit une dette en cliquant.
 */
export function ValidateImputationPanel({ imputationId }: { imputationId: string }) {
  const [state, formAction] = useActionState<ImputationFormState, FormData>(
    validateImputationAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="imputationId" value={imputationId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Motif" name={`reason-validate-${imputationId}`} hint="Facultatif, conservé au journal.">
        <Textarea id={`reason-validate-${imputationId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Valider <strong>ne réduit aucun montant dû</strong>. L’imputation passera « en attente de
        facture fournisseur ».
      </p>

      <SubmitButton label="Valider l’imputation" icon={Check} pendingLabel="Validation…" />
    </form>
  )
}

/** Annulation — §18, §40. Rien n'est supprimé. */
export function CancelImputationPanel({ imputationId }: { imputationId: string }) {
  const [state, formAction] = useActionState<ImputationFormState, FormData>(
    cancelImputationAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="imputationId" value={imputationId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Motif" name={`reason-cancel-${imputationId}`} hint="Facultatif, conservé au journal.">
        <Textarea id={`reason-cancel-${imputationId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        L’imputation reste consultable : elle passe à « Annulée », et le montant imputable qu’elle
        consommait redevient disponible.
      </p>

      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
      >
        <X className="size-4" aria-hidden />
        Annuler l’imputation
      </button>
    </form>
  )
}

/** Dépôt d'un justificatif — §35. */
export function ImputationDocumentPanel({ imputationId }: { imputationId: string }) {
  const [state, formAction] = useActionState<ImputationFormState, FormData>(
    addImputationDocumentAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="imputationId" value={imputationId} />

      <FormFeedback error={state.error} success={state.success} />

      <Notice tone="warning">
        Ces pièces ne sont accessibles qu’avec le droit de consulter les imputations, par une
        adresse signée de courte durée. Aucune n’est publiée, aucune ne se supprime.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nature" name="docType" error={errors.docType}>
          <Select name="docType" defaultValue="INVOICE" error={errors.docType}>
            {DOCUMENT_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Intitulé" name="label" required error={errors.label}>
          <Input name="label" placeholder="Conditions de mise à disposition" error={errors.label} />
        </Field>
      </div>

      <Field
        label="Fichier"
        name="file"
        required
        error={errors.file}
        hint="PDF, JPEG, PNG ou WebP. 10 Mo maximum."
      >
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="block w-full rounded-control border border-line px-3 py-2.5 text-sm text-ink file:mr-3 file:rounded-control file:border-0 file:bg-adikom-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-adikom-500"
        />
      </Field>

      <p className="text-xs text-muted">
        Un justificatif ne s’attache qu’à une imputation <strong>en préparation</strong> : une
        fois validée, la pièce qui la fonde ne change plus (§39).
      </p>

      <SubmitButton label="Joindre le justificatif" icon={Paperclip} pendingLabel="Dépôt…" />
    </form>
  )
}

/** Retrait d'un justificatif de la fiche — archivage, jamais suppression. */
export function ArchiveImputationDocumentButton({
  imputationId,
  documentId,
}: {
  imputationId: string
  documentId: string
}) {
  const [state, formAction] = useActionState<ImputationFormState, FormData>(
    archiveImputationDocumentAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="imputationId" value={imputationId} />
      <input type="hidden" name="documentId" value={documentId} />
      {state.error && <span className="mr-2 text-xs text-danger">{state.error}</span>}
      <button type="submit" className="text-xs text-muted underline hover:text-ink">
        Retirer
      </button>
    </form>
  )
}
