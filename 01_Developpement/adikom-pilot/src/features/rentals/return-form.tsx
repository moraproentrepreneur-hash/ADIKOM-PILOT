'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Undo2 } from 'lucide-react'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { toLocalInput } from '@/lib/dates'
import { returnRentalAction, type RentalFormState } from './actions'
import { FUEL_LEVEL_LABELS, FUEL_LEVEL_ORDER, type FuelLevel } from './constants'

/**
 * Retour d'un véhicule — le pendant exact du départ.
 *
 * L'écran sépare visuellement DEUX natures d'information :
 *
 *   · ce qui est HÉRITÉ du départ, sur fond distinct et non modifiable : c'est
 *     la référence, elle ne s'écrase jamais ;
 *   · ce qui est CONSTATÉ au retour, saisissable.
 *
 * Les confondre serait l'erreur la plus coûteuse de tout le cycle : c'est
 * exactement cette distinction qui départage un dommage préexistant d'un
 * dommage survenu pendant la location (Module 05 §31 et §36).
 */
export function ReturnForm({
  rentalId,
  rentalNo,
  vehicleLabel,
  expectedReturnAt,
  departure,
  cancelHref,
}: {
  rentalId: string
  rentalNo: string
  vehicleLabel: string
  expectedReturnAt: string
  /** `null` si aucun état des lieux de départ n'existe — cas anormal, annoncé. */
  departure: {
    mileage: number | null
    fuelLevel: FuelLevel | null
    exteriorCondition: string | null
    interiorCondition: string | null
    preexistingDamages: string | null
  } | null
  cancelHref: string
}) {
  const [state, formAction] = useActionState<RentalFormState, FormData>(
    returnRentalAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="rentalId" value={rentalId} />

      <Notice tone="warning" className="mb-5">
        Cet enregistrement clôt la sortie du véhicule : la location passera{' '}
        <strong>« À contrôler »</strong>, le véhicule redeviendra{' '}
        <strong>disponible</strong> et la période sera libérée. Les écarts sont{' '}
        <strong>constatés, jamais chiffrés</strong> : aucune pénalité n’est calculée à ce stade.
      </Notice>

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      {departure ? (
        <ReferenceBlock departure={departure} />
      ) : (
        <Notice tone="warning" className="mb-5">
          Aucun état des lieux de départ n’a été trouvé pour cette location : le retour sera
          enregistré, mais aucune comparaison ne sera possible.
        </Notice>
      )}

      <FormSection title={`Retour — ${rentalNo}`}>
        <Field
          label="Date et heure de retour"
          name="returnedAt"
          required
          error={errors.returnedAt}
          hint="Heure des Comores. Peut être postérieure au retour attendu : le retard est constaté, pas facturé."
        >
          <Input
            name="returnedAt"
            type="datetime-local"
            defaultValue={toLocalInput(expectedReturnAt)}
            error={errors.returnedAt}
          />
        </Field>

        <Field label="Véhicule" name="vehicle">
          <Input name="vehicle" defaultValue={vehicleLabel} readOnly disabled />
        </Field>
      </FormSection>

      <FormSection title="Relevés au retour">
        <Field
          label="Kilométrage au retour"
          name="mileage"
          error={errors.mileage}
          hint={
            departure?.mileage != null
              ? `Au départ : ${departure.mileage.toLocaleString('fr-FR')} km. Le compteur ne peut pas reculer.`
              : 'Relevé au compteur, en kilomètres.'
          }
        >
          <Input
            name="mileage"
            type="number"
            min={departure?.mileage ?? 0}
            step={1}
            error={errors.mileage}
            className="tabular"
          />
        </Field>

        <Field
          label="Niveau de carburant"
          name="fuelLevel"
          error={errors.fuelLevel}
          hint={
            departure?.fuelLevel
              ? `Au départ : ${FUEL_LEVEL_LABELS[departure.fuelLevel]}.`
              : 'Relevé à la jauge, en fractions.'
          }
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

      <FormSection title="État constaté au retour">
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
          label="Nouveaux dommages"
          name="newDamages"
          error={errors.newDamages}
          hint="Uniquement ce qui n’était pas là au départ. Le constat est enregistré ; sa valorisation relèvera de la facturation."
          wide
        >
          <Textarea
            name="newDamages"
            placeholder="Rétroviseur droit fissuré, jante avant gauche rayée…"
            error={errors.newDamages}
          />
        </Field>

        <Field label="Observations" name="observations" error={errors.observations} wide>
          <Textarea name="observations" error={errors.observations} />
        </Field>
      </FormSection>

      <FormSection title="Photos du retour">
        <Field
          label="Photos"
          name="photos"
          error={errors.photos}
          hint="JPEG, PNG ou WebP, 10 Mo maximum par photo. Rangées séparément de celles du départ, et accessibles aux seuls comptes autorisés."
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
        <SubmitButton label="Enregistrer le retour" icon={Undo2} pendingLabel="Enregistrement…" />
        <Link href={cancelHref} className="text-sm text-muted transition-colors hover:text-ink">
          Annuler
        </Link>
      </div>
    </form>
  )
}

/**
 * Ce qui vient du départ — lecture seule, fond distinct.
 *
 * Aucun de ces champs n'est soumis : le formulaire ne peut pas, même par
 * accident, réécrire l'état des lieux de départ.
 */
function ReferenceBlock({
  departure,
}: {
  departure: {
    mileage: number | null
    fuelLevel: FuelLevel | null
    exteriorCondition: string | null
    interiorCondition: string | null
    preexistingDamages: string | null
  }
}) {
  const rows: [string, string][] = [
    [
      'Kilométrage au départ',
      departure.mileage != null ? `${departure.mileage.toLocaleString('fr-FR')} km` : 'Non relevé',
    ],
    [
      'Carburant au départ',
      departure.fuelLevel ? FUEL_LEVEL_LABELS[departure.fuelLevel] : 'Non relevé',
    ],
    ['État extérieur au départ', departure.exteriorCondition ?? 'Non renseigné'],
    ['État intérieur au départ', departure.interiorCondition ?? 'Non renseigné'],
    ['Dommages déjà présents', departure.preexistingDamages ?? 'Aucun relevé au départ'],
  ]

  return (
    <section className="mb-6 rounded-card border border-adikom-200 bg-adikom-50/60 p-5">
      <h3 className="font-display text-sm font-semibold text-adikom-600">
        Référence — état des lieux de départ
      </h3>
      <p className="mt-0.5 mb-3 text-xs text-muted">
        Non modifiable. C’est à cet état que le retour sera comparé.
      </p>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-sm whitespace-pre-line text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
