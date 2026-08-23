'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { KeyRound } from 'lucide-react'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { toLocalInput } from '@/lib/dates'
import { startRentalAction, type RentalFormState } from './actions'
import { FUEL_LEVEL_LABELS, FUEL_LEVEL_ORDER } from './constants'

/**
 * Départ d'une location — un acte métier, pas un formulaire de plus.
 *
 * Ce qui est saisi ici fait foi au retour : c'est la seule photographie de
 * l'état du véhicule avant qu'il ne quitte le parc. Les dommages relevés
 * maintenant sont ceux qui NE seront PAS imputés au client (Module 05 §31).
 *
 * L'écran annonce donc ce que l'enregistrement va produire, plutôt que de
 * laisser l'utilisateur le découvrir.
 */
export function CheckoutForm({
  rentalId,
  rentalNo,
  vehicleLabel,
  suggestedStart,
  cancelHref,
}: {
  rentalId: string
  rentalNo: string
  vehicleLabel: string
  /** Début prévu : proposé par défaut, modifiable si le départ est décalé. */
  suggestedStart: string
  cancelHref: string
}) {
  const [state, formAction] = useActionState<RentalFormState, FormData>(
    startRentalAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="rentalId" value={rentalId} />

      <Notice tone="warning" className="mb-5">
        Cet enregistrement fait partir le véhicule : la location passera{' '}
        <strong>« En cours »</strong>, le véhicule <strong>« En location »</strong>, et l’état des
        lieux ci-dessous sera conservé tel quel. Les dommages relevés maintenant sont ceux qui ne
        pourront pas être reprochés au client au retour.
      </Notice>

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title={`Départ — ${rentalNo}`}>
        <Field
          label="Date et heure de départ"
          name="startedAt"
          required
          error={errors.startedAt}
          hint="Heure des Comores."
        >
          <Input
            name="startedAt"
            type="datetime-local"
            defaultValue={toLocalInput(suggestedStart)}
            error={errors.startedAt}
          />
        </Field>

        <Field label="Véhicule" name="vehicle">
          <Input name="vehicle" defaultValue={vehicleLabel} readOnly disabled />
        </Field>
      </FormSection>

      <FormSection title="Relevés">
        <Field
          label="Kilométrage au départ"
          name="mileage"
          error={errors.mileage}
          hint="Relevé au compteur, en kilomètres."
        >
          <Input
            name="mileage"
            type="number"
            min={0}
            step={1}
            error={errors.mileage}
            className="tabular"
          />
        </Field>

        <Field
          label="Niveau de carburant"
          name="fuelLevel"
          error={errors.fuelLevel}
          hint="Relevé à la jauge, en fractions."
        >
          <Select name="fuelLevel" defaultValue="" error={errors.fuelLevel}>
            <option value="">Non relevé</option>
            {FUEL_LEVEL_ORDER.map((level) => (
              <option key={level} value={level}>
                {FUEL_LEVEL_LABELS[level]}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection title="État du véhicule">
        <Field label="État extérieur" name="exteriorCondition" error={errors.exteriorCondition} wide>
          <Textarea
            name="exteriorCondition"
            placeholder="Carrosserie, vitrages, pneumatiques…"
            error={errors.exteriorCondition}
          />
        </Field>

        <Field label="État intérieur" name="interiorCondition" error={errors.interiorCondition} wide>
          <Textarea
            name="interiorCondition"
            placeholder="Sellerie, tableau de bord, propreté, équipements…"
            error={errors.interiorCondition}
          />
        </Field>

        <Field
          label="Dommages déjà présents"
          name="preexistingDamages"
          error={errors.preexistingDamages}
          hint="Décisif au retour : ce qui n’est pas noté ici sera considéré comme survenu pendant la location."
          wide
        >
          <Textarea
            name="preexistingDamages"
            placeholder="Rayure portière avant droite, pare-chocs enfoncé…"
            error={errors.preexistingDamages}
          />
        </Field>

        <Field label="Observations" name="observations" error={errors.observations} wide>
          <Textarea name="observations" error={errors.observations} />
        </Field>
      </FormSection>

      <FormSection title="Photos">
        <Field
          label="Photos du véhicule"
          name="photos"
          error={errors.photos}
          hint="JPEG, PNG ou WebP, 10 Mo maximum par photo. Elles restent privées et ne sont accessibles qu’aux comptes autorisés."
          wide
        >
          <input
            id="photos"
            name="photos"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="block w-full rounded-control border border-line bg-white px-3 py-2 text-sm text-ink file:mr-3 file:rounded-control file:border-0 file:bg-adikom-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-adikom-500"
          />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <SubmitButton label="Enregistrer le départ" icon={KeyRound} pendingLabel="Enregistrement…" />
        <Link href={cancelHref} className="text-sm text-muted transition-colors hover:text-ink">
          Annuler
        </Link>
      </div>
    </form>
  )
}
