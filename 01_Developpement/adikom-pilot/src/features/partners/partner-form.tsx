'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Handshake, Save } from 'lucide-react'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries'
import { createPartnerAction, updatePartnerAction, type PartnerFormState } from './actions'
import type { PartnerDetail } from './data'

/**
 * Formulaire de création et de modification d'un partenaire.
 *
 * Mêmes sections, mêmes composants et même comportement que les formulaires
 * client et fournisseur : un utilisateur qui sait renseigner l'un sait
 * renseigner les autres (CLAUDE.md §37).
 *
 * Il ne couvre que l'identité du partenaire. Les conditions du partenariat,
 * son type, son responsable interne et ses dates n'ont pas de colonne en base :
 * les afficher ici laisserait croire qu'ils sont enregistrés.
 */
export function PartnerForm({
  mode,
  partner,
}: {
  mode: 'create' | 'edit'
  partner?: PartnerDetail
}) {
  const action = mode === 'create' ? createPartnerAction : updatePartnerAction
  const [state, formAction] = useActionState<PartnerFormState, FormData>(action, EMPTY_FORM_STATE)

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      {partner && <input type="hidden" name="partnerId" value={partner.id} />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Identité">
        <Field label="Raison sociale" name="legalName" required error={errors.legalName}>
          <Input
            name="legalName"
            defaultValue={partner?.legalName ?? ''}
            error={errors.legalName}
            autoComplete="off"
          />
        </Field>

        <Field label="Nom commercial" name="tradeName" error={errors.tradeName}>
          <Input name="tradeName" defaultValue={partner?.tradeName ?? ''} error={errors.tradeName} />
        </Field>

        <Field label="Personne de contact" name="contactName" error={errors.contactName}>
          <Input
            name="contactName"
            defaultValue={partner?.contactName ?? ''}
            error={errors.contactName}
          />
        </Field>
      </FormSection>

      <FormSection title="Coordonnées">
        {/* Facultatif, conformément à la structure en base (migration 024). */}
        <Field label="Téléphone" name="phone" error={errors.phone}>
          <Input
            name="phone"
            type="tel"
            defaultValue={partner?.phone ?? ''}
            placeholder="+269 …"
            error={errors.phone}
          />
        </Field>

        <Field label="Email" name="email" error={errors.email}>
          <Input name="email" type="email" defaultValue={partner?.email ?? ''} error={errors.email} />
        </Field>

        <Field label="Ville" name="city" error={errors.city}>
          <Input name="city" defaultValue={partner?.city ?? ''} error={errors.city} />
        </Field>

        <Field label="Adresse" name="address" error={errors.address} wide>
          <Input name="address" defaultValue={partner?.address ?? ''} error={errors.address} />
        </Field>

        {/* Liste fermée, comme sur les fiches client et fournisseur. */}
        <Field label="Pays" name="country" error={errors.country}>
          <Select
            name="country"
            defaultValue={partner?.country ?? DEFAULT_COUNTRY}
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
        <Field
          label="Registre du commerce"
          name="registrationNumber"
          error={errors.registrationNumber}
        >
          <Input
            name="registrationNumber"
            defaultValue={partner?.registrationNumber ?? ''}
            error={errors.registrationNumber}
          />
        </Field>
      </FormSection>

      <FormSection title="Observations">
        <Field label="Notes internes" name="notes" error={errors.notes} wide>
          <Textarea name="notes" defaultValue={partner?.notes ?? ''} error={errors.notes} />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <SubmitButton
          label={mode === 'create' ? 'Créer le partenaire' : 'Enregistrer'}
          icon={mode === 'create' ? Handshake : Save}
        />
        <Link
          href={partner ? `/tiers/partenaires/${partner.id}` : '/tiers/partenaires'}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Annuler
        </Link>
      </div>
    </form>
  )
}
