'use client'

import { useActionState } from 'react'
import { Lock } from 'lucide-react'

import { Field, FormSection, Input, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { updateSupplierBankAction, type SupplierFormState } from './actions'
import type { SupplierBankDetails } from './data'

/**
 * Coordonnées bancaires d'un fournisseur — donnée sensible.
 *
 * Le formulaire n'est rendu qu'avec la permission de modification, mais ce
 * n'est pas ce qui protège la donnée : la lecture est filtrée par RLS et
 * l'écriture refusée côté serveur. Masquer ce bloc n'est qu'un confort
 * (05_Regles_Metier/05_Permissions.md §85).
 */
export function BankDetailsForm({
  supplierId,
  details,
  editable,
}: {
  supplierId: string
  details: SupplierBankDetails | null
  editable: boolean
}) {
  const [state, formAction] = useActionState<SupplierFormState, FormData>(
    updateSupplierBankAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  if (!editable) {
    return (
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-muted">Banque</dt>
          <dd className="text-ink">{details?.bankName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Titulaire</dt>
          <dd className="text-ink">{details?.accountHolder ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Numéro de compte</dt>
          <dd className="text-ink tabular">{details?.accountNumber ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">IBAN</dt>
          <dd className="text-ink tabular">{details?.iban ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">BIC / SWIFT</dt>
          <dd className="text-ink tabular">{details?.swiftBic ?? '—'}</dd>
        </div>
      </dl>
    )
  }

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="supplierId" value={supplierId} />

      <Notice tone="warning" className="mb-5">
        Ces informations servent au règlement du fournisseur. Toute modification est journalisée.
      </Notice>

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Compte bancaire">
        <Field label="Banque" name="bankName" error={errors.bankName}>
          <Input name="bankName" defaultValue={details?.bankName ?? ''} error={errors.bankName} />
        </Field>

        <Field label="Titulaire du compte" name="accountHolder" error={errors.accountHolder}>
          <Input
            name="accountHolder"
            defaultValue={details?.accountHolder ?? ''}
            error={errors.accountHolder}
          />
        </Field>

        <Field label="Numéro de compte" name="accountNumber" error={errors.accountNumber}>
          <Input
            name="accountNumber"
            defaultValue={details?.accountNumber ?? ''}
            error={errors.accountNumber}
            className="tabular"
            autoComplete="off"
          />
        </Field>

        <Field label="IBAN" name="iban" error={errors.iban}>
          <Input
            name="iban"
            defaultValue={details?.iban ?? ''}
            error={errors.iban}
            className="tabular"
            autoComplete="off"
          />
        </Field>

        <Field label="BIC / SWIFT" name="swiftBic" error={errors.swiftBic}>
          <Input
            name="swiftBic"
            defaultValue={details?.swiftBic ?? ''}
            error={errors.swiftBic}
            className="tabular"
            autoComplete="off"
          />
        </Field>

        <Field label="Précisions" name="bankNotes" error={errors.notes} wide>
          <Textarea name="bankNotes" defaultValue={details?.notes ?? ''} error={errors.notes} />
        </Field>
      </FormSection>

      <div className="pt-6">
        <SubmitButton label="Enregistrer les coordonnées" icon={Lock} />
      </div>
    </form>
  )
}
