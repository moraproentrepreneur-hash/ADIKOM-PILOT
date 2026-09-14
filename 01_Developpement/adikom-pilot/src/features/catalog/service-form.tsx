'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { ConciergeBell, Save } from 'lucide-react'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { createServiceAction, updateServiceAction, type CatalogFormState } from './actions'
import { PURPOSE_HELP, PURPOSE_LABELS, type ServicePurpose } from './constants'
import type { ServiceRow } from './data'

type Option = { id: string; label: string }

/**
 * Fiche service — création et modification.
 *
 * LA DESTINATION EST UN CHOIX, PAS UNE DÉDUCTION.
 *
 * Elle est demandée d'emblée, et sa conséquence est écrite sous le champ : un
 * service de vente ne portera aucun prix d'achat, un service d'achat aucun prix
 * de vente. C'est la base qui l'impose (`fn_service_price_scope`) ; l'écran le
 * dit avant plutôt que de laisser découvrir un refus.
 *
 * AUCUN PRIX N'EST SAISI ICI. Un prix est une ligne datée, portée par une
 * variante, et il s'ouvre depuis la fiche une fois le service créé (D16).
 */
export function ServiceForm({
  mode,
  service,
  categories,
}: {
  mode: 'create' | 'edit'
  service?: ServiceRow
  /** Catégories ACTIVES seulement : la base refuse les autres. */
  categories: Option[]
}) {
  const action = mode === 'create' ? createServiceAction : updateServiceAction
  const [state, formAction] = useActionState<CatalogFormState, FormData>(action, EMPTY_FORM_STATE)

  const [purpose, setPurpose] = useState<ServicePurpose>(service?.purpose ?? 'SALE')
  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      {service && <input type="hidden" name="serviceId" value={service.id} />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      {categories.length === 0 && (
        <Notice tone="warning" className="mb-5">
          Aucune catégorie active n’est définie. Créez-en une avant d’enregistrer un service :{' '}
          <Link href="/catalogue/categories" className="underline underline-offset-2">
            gérer les catégories
          </Link>
          .
        </Notice>
      )}

      {mode === 'edit' && service && !service.categoryIsActive && (
        <Notice tone="info" className="mb-5">
          La catégorie actuelle de ce service est archivée. Elle reste affichée sur la fiche ; en
          choisir une autre est possible, mais rien ne l’impose.
        </Notice>
      )}

      <FormSection title="Identification">
        <Field label="Libellé du service" name="label" required error={errors.label} wide>
          <Input
            name="label"
            placeholder="Transfert aéroport"
            defaultValue={service?.label ?? ''}
            error={errors.label}
          />
        </Field>

        <Field label="Catégorie" name="categoryId" required error={errors.categoryId}>
          <Select
            name="categoryId"
            defaultValue={service?.categoryId ?? ''}
            error={errors.categoryId}
            placeholder="Choisir une catégorie"
          >
            <option value="">Choisir une catégorie</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Unité d’exploitation"
          name="unitLabel"
          error={errors.unitLabel}
          hint="Facultative : trajet, journée, personne… Elle n’intervient dans aucun calcul."
        >
          <Input
            name="unitLabel"
            placeholder="trajet"
            defaultValue={service?.unitLabel ?? ''}
            error={errors.unitLabel}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Destination"
        description="Ce que le service permet de faire. Elle commande les prix que le service pourra porter."
      >
        <Field label="Ce service est destiné à" name="purpose" required error={errors.purpose}>
          <Select
            name="purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value as ServicePurpose)}
            error={errors.purpose}
          >
            {(Object.keys(PURPOSE_LABELS) as ServicePurpose[]).map((value) => (
              <option key={value} value={value}>
                {PURPOSE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <Notice tone="info">{PURPOSE_HELP[purpose]}</Notice>
        </div>
      </FormSection>

      <FormSection title="Description">
        <Field label="Description" name="description" error={errors.description} wide>
          <Textarea
            name="description"
            placeholder="Ce que la prestation couvre."
            defaultValue={service?.description ?? ''}
            error={errors.description}
          />
        </Field>

        <Field
          label="Notes internes"
          name="notes"
          error={errors.notes}
          hint="Usage interne. Elles n’apparaissent sur aucun document."
          wide
        >
          <Textarea name="notes" defaultValue={service?.notes ?? ''} error={errors.notes} />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <SubmitButton
          label={mode === 'create' ? 'Créer le service' : 'Enregistrer'}
          icon={mode === 'create' ? ConciergeBell : Save}
          disabled={mode === 'create' && categories.length === 0}
        />
        <Link
          href={service ? `/catalogue/services/${service.id}` : '/catalogue/services'}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Annuler
        </Link>
      </div>

      {mode === 'create' && (
        <p className="mt-4 text-xs text-muted">
          Une variante « Standard » sera créée automatiquement : un service n’existe jamais sans
          variante, et c’est la variante qui porte les prix.
        </p>
      )}
    </form>
  )
}
