'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Save, UserPlus } from 'lucide-react'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { createClientAction, updateClientAction, type ClientFormState } from './actions'
import { TYPE_LABELS, type ClientType } from './constants'
import type { ClientDetail } from './data'

/**
 * Formulaire de création et de modification d'un client.
 *
 * Les champs sont non contrôlés — la valeur est lue dans le FormData à la
 * soumission — sauf le type, qui commande l'affichage : une entreprise n'a pas
 * de prénom, un particulier n'a pas de raison sociale.
 *
 * Champs obligatoires (DEC-021 §4) : type, nom ou raison sociale, téléphone.
 * Le reste est facultatif : la documentation renvoyait explicitement ces choix
 * à ADIKOM (03_Modules/04_Tiers.md §5.3).
 */
export function ClientForm({ mode, client }: { mode: 'create' | 'edit'; client?: ClientDetail }) {
  const action = mode === 'create' ? createClientAction : updateClientAction
  const [state, formAction] = useActionState<ClientFormState, FormData>(action, EMPTY_FORM_STATE)

  const [type, setType] = useState<ClientType>(client?.type ?? 'COMPANY')
  const isCompany = type === 'COMPANY'

  const errors = state.fieldErrors ?? {}
  const duplicates = state.duplicates ?? []

  return (
    <form action={formAction} noValidate>
      {client && <input type="hidden" name="clientId" value={client.id} />}

      {/* Une fois averti, l'utilisateur confirme : le doublon potentiel n'est
          jamais un blocage (§18). */}
      {duplicates.length > 0 && <input type="hidden" name="confirmDuplicate" value="1" />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      {duplicates.length > 0 && (
        <Notice tone="warning" className="mb-5">
          <p className="font-medium">
            {duplicates.length === 1
              ? 'Un client similaire existe déjà.'
              : `${duplicates.length} clients similaires existent déjà.`}
          </p>
          <ul className="mt-2 space-y-1">
            {duplicates.map((duplicate) => (
              <li key={duplicate.id}>
                <Link
                  href={`/tiers/clients/${duplicate.id}`}
                  className="underline underline-offset-2"
                >
                  {duplicate.displayName}
                </Link>
                <span className="text-warning/80">
                  {' '}
                  · {duplicate.clientNo} · {duplicate.reason}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Consultez la fiche existante avant de continuer. Si ce client est bien distinct,
            enregistrez de nouveau pour confirmer la création.
          </p>
        </Notice>
      )}

      <FormSection
        title="Identité"
        description="Le type détermine les informations demandées."
      >
        <Field label="Type de client" name="type" required>
          <Select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as ClientType)}
            error={errors.type}
          >
            {(Object.keys(TYPE_LABELS) as ClientType[]).map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        {!isCompany && (
          <Field label="Prénom" name="firstName" error={errors.firstName}>
            <Input name="firstName" defaultValue={client?.firstName ?? ''} error={errors.firstName} />
          </Field>
        )}

        <Field
          label={isCompany ? 'Raison sociale' : 'Nom'}
          name="legalName"
          required
          error={errors.legalName}
          wide={!isCompany}
        >
          <Input
            name="legalName"
            defaultValue={client?.legalName ?? ''}
            error={errors.legalName}
            autoComplete="off"
          />
        </Field>

        {isCompany && (
          <Field label="Nom commercial" name="tradeName" error={errors.tradeName}>
            <Input name="tradeName" defaultValue={client?.tradeName ?? ''} error={errors.tradeName} />
          </Field>
        )}
      </FormSection>

      <FormSection title="Coordonnées">
        <Field label="Téléphone" name="phone" required error={errors.phone}>
          <Input
            name="phone"
            type="tel"
            defaultValue={client?.phone ?? ''}
            placeholder="+269 …"
            error={errors.phone}
          />
        </Field>

        <Field label="Téléphone secondaire" name="phoneSecondary" error={errors.phoneSecondary}>
          <Input
            name="phoneSecondary"
            type="tel"
            defaultValue={client?.phoneSecondary ?? ''}
            error={errors.phoneSecondary}
          />
        </Field>

        <Field label="Email" name="email" error={errors.email}>
          <Input name="email" type="email" defaultValue={client?.email ?? ''} error={errors.email} />
        </Field>

        <Field label="Ville" name="city" error={errors.city}>
          <Input name="city" defaultValue={client?.city ?? ''} error={errors.city} />
        </Field>

        <Field label="Adresse" name="address" error={errors.address} wide>
          <Input name="address" defaultValue={client?.address ?? ''} error={errors.address} />
        </Field>

        <Field label="Pays" name="country" error={errors.country}>
          <Input name="country" defaultValue={client?.country ?? 'Comores'} error={errors.country} />
        </Field>
      </FormSection>

      <FormSection
        title="Identification"
        description="Informations administratives, selon le type de client."
      >
        <Field label="Type de pièce" name="idDocumentType" error={errors.idDocumentType}>
          <Input
            name="idDocumentType"
            defaultValue={client?.idDocumentType ?? ''}
            placeholder="Carte d’identité, passeport…"
            error={errors.idDocumentType}
          />
        </Field>

        <Field label="Numéro de pièce" name="idDocumentNumber" error={errors.idDocumentNumber}>
          <Input
            name="idDocumentNumber"
            defaultValue={client?.idDocumentNumber ?? ''}
            error={errors.idDocumentNumber}
          />
        </Field>

        <Field label="Registre du commerce" name="registrationNumber" error={errors.registrationNumber}>
          <Input
            name="registrationNumber"
            defaultValue={client?.registrationNumber ?? ''}
            error={errors.registrationNumber}
          />
        </Field>

        <Field label="Identifiant fiscal" name="taxIdentifier" error={errors.taxIdentifier}>
          <Input
            name="taxIdentifier"
            defaultValue={client?.taxIdentifier ?? ''}
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
            defaultValue={client?.administrativeNotes ?? ''}
            error={errors.administrativeNotes}
          />
        </Field>
      </FormSection>

      <FormSection title="Observations">
        <Field label="Notes internes" name="notes" error={errors.notes} wide>
          <Textarea name="notes" defaultValue={client?.notes ?? ''} error={errors.notes} />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <SubmitButton
          label={
            mode === 'create'
              ? duplicates.length > 0
                ? 'Confirmer la création'
                : 'Créer le client'
              : 'Enregistrer'
          }
          icon={mode === 'create' ? UserPlus : Save}
        />
        <Link
          href={client ? `/tiers/clients/${client.id}` : '/tiers/clients'}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Annuler
        </Link>
      </div>
    </form>
  )
}
