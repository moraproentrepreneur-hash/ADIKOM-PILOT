'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Save, Truck } from 'lucide-react'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries'
import { createSupplierAction, updateSupplierAction, type SupplierFormState } from './actions'
import { TYPE_LABELS, type SupplierType } from './constants'
import type { SupplierDetail } from './data'

/**
 * Formulaire de création et de modification d'un fournisseur.
 *
 * Les coordonnées bancaires n'y figurent pas : elles relèvent d'une permission
 * distincte et d'un formulaire séparé (Fournisseurs §44 à §46). Les mêler ici
 * reviendrait à exiger le droit de les modifier pour corriger un numéro de
 * téléphone.
 */
export function SupplierForm({
  mode,
  supplier,
}: {
  mode: 'create' | 'edit'
  supplier?: SupplierDetail
}) {
  const action = mode === 'create' ? createSupplierAction : updateSupplierAction
  const [state, formAction] = useActionState<SupplierFormState, FormData>(action, EMPTY_FORM_STATE)

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      {supplier && <input type="hidden" name="supplierId" value={supplier.id} />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Identité">
        <Field label="Type de fournisseur" name="type" required error={errors.type}>
          <Select
            name="type"
            defaultValue={supplier?.type ?? 'VEHICLE_SUPPLIER'}
            error={errors.type}
          >
            {(Object.keys(TYPE_LABELS) as SupplierType[]).map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Raison sociale" name="legalName" required error={errors.legalName}>
          <Input
            name="legalName"
            defaultValue={supplier?.legalName ?? ''}
            error={errors.legalName}
            autoComplete="off"
          />
        </Field>

        <Field label="Nom commercial" name="tradeName" error={errors.tradeName}>
          <Input name="tradeName" defaultValue={supplier?.tradeName ?? ''} error={errors.tradeName} />
        </Field>

        <Field label="Personne de contact" name="contactName" error={errors.contactName}>
          <Input
            name="contactName"
            defaultValue={supplier?.contactName ?? ''}
            error={errors.contactName}
          />
        </Field>
      </FormSection>

      <FormSection title="Coordonnées">
        <Field label="Téléphone" name="phone" required error={errors.phone}>
          <Input
            name="phone"
            type="tel"
            defaultValue={supplier?.phone ?? ''}
            placeholder="+269 …"
            error={errors.phone}
          />
        </Field>

        <Field label="Téléphone secondaire" name="phoneSecondary" error={errors.phoneSecondary}>
          <Input
            name="phoneSecondary"
            type="tel"
            defaultValue={supplier?.phoneSecondary ?? ''}
            error={errors.phoneSecondary}
          />
        </Field>

        <Field label="Email" name="email" error={errors.email}>
          <Input name="email" type="email" defaultValue={supplier?.email ?? ''} error={errors.email} />
        </Field>

        <Field label="Ville" name="city" error={errors.city}>
          <Input name="city" defaultValue={supplier?.city ?? ''} error={errors.city} />
        </Field>

        <Field label="Adresse" name="address" error={errors.address} wide>
          <Input name="address" defaultValue={supplier?.address ?? ''} error={errors.address} />
        </Field>

        {/* Liste fermée, comme sur la fiche client : même donnée, même
            traitement. Voir le commentaire dans `clients/client-form.tsx`. */}
        <Field label="Pays" name="country" error={errors.country}>
          <Select
            name="country"
            defaultValue={supplier?.country ?? DEFAULT_COUNTRY}
            error={errors.country}
          >
            <option value="">Non précisé</option>
            {COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection title="Informations administratives">
        <Field label="Registre du commerce" name="registrationNumber" error={errors.registrationNumber}>
          <Input
            name="registrationNumber"
            defaultValue={supplier?.registrationNumber ?? ''}
            error={errors.registrationNumber}
          />
        </Field>

        <Field label="Identifiant fiscal" name="taxIdentifier" error={errors.taxIdentifier}>
          <Input
            name="taxIdentifier"
            defaultValue={supplier?.taxIdentifier ?? ''}
            error={errors.taxIdentifier}
          />
        </Field>

        <Field
          label="Notes administratives"
          name="administrativeNotes"
          error={errors.administrativeNotes}
          wide
        >
          <Textarea
            name="administrativeNotes"
            defaultValue={supplier?.administrativeNotes ?? ''}
            error={errors.administrativeNotes}
          />
        </Field>
      </FormSection>

      <FormSection title="Observations">
        <Field label="Notes internes" name="notes" error={errors.notes} wide>
          <Textarea name="notes" defaultValue={supplier?.notes ?? ''} error={errors.notes} />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <SubmitButton
          label={mode === 'create' ? 'Créer le fournisseur' : 'Enregistrer'}
          icon={mode === 'create' ? Truck : Save}
        />
        <Link
          href={supplier ? `/tiers/fournisseurs/${supplier.id}` : '/tiers/fournisseurs'}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Annuler
        </Link>
      </div>
    </form>
  )
}
