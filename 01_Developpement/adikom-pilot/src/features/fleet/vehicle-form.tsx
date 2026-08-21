'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { CarFront, Save } from 'lucide-react'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { createVehicleAction, updateVehicleAction, type FleetFormState } from './actions'
import {
  FUEL_LABELS,
  ORIGIN_LABELS,
  TRANSMISSION_LABELS,
  VEHICLE_COLORS,
  type FuelType,
  type TransmissionType,
  type VehicleOrigin,
} from './constants'
import type { VehicleDetail } from './data'

type Option = { id: string; label: string }

/**
 * Fiche véhicule — création et modification.
 *
 * Le rattachement à un fournisseur n'est modifiable qu'à la création : ensuite,
 * il relève d'un geste dédié et historisé (§59, §60). Le proposer ici
 * laisserait croire qu'un changement de fournisseur est une simple correction
 * de fiche, alors qu'il ouvre une nouvelle période de responsabilité.
 */
export function VehicleForm({
  mode,
  vehicle,
  categories,
  suppliers,
  partners,
}: {
  mode: 'create' | 'edit'
  vehicle?: VehicleDetail
  categories: Option[]
  suppliers: Option[]
  partners: Option[]
}) {
  const action = mode === 'create' ? createVehicleAction : updateVehicleAction
  const [state, formAction] = useActionState<FleetFormState, FormData>(action, EMPTY_FORM_STATE)

  const [origin, setOrigin] = useState<VehicleOrigin>(vehicle?.origin ?? 'OWNED')
  const errors = state.fieldErrors ?? {}

  // Un relevé inférieur au kilométrage enregistré doit être justifié (§26).
  const needsMileageReason = Boolean(errors.mileage?.includes('justifié'))

  return (
    <form action={formAction} noValidate>
      {vehicle && <input type="hidden" name="vehicleId" value={vehicle.id} />}
      {mode === 'edit' && <input type="hidden" name="origin" value={vehicle?.origin ?? 'OWNED'} />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      {categories.length === 0 && (
        <Notice tone="warning" className="mb-5">
          Aucune catégorie n’est définie. Créez-en une avant d’enregistrer un véhicule :{' '}
          <Link href="/location/parc/categories" className="underline underline-offset-2">
            gérer les catégories
          </Link>
          .
        </Notice>
      )}

      <FormSection title="Identification">
        <Field label="Marque" name="brand" required error={errors.brand}>
          <Input name="brand" defaultValue={vehicle?.brand ?? ''} error={errors.brand} />
        </Field>

        <Field label="Modèle" name="model" required error={errors.model}>
          <Input name="model" defaultValue={vehicle?.model ?? ''} error={errors.model} />
        </Field>

        <Field
          label="Immatriculation"
          name="plate"
          error={errors.plate}
          hint="Facultative, mais unique lorsqu’elle est renseignée."
        >
          <Input
            name="plate"
            defaultValue={vehicle?.plate ?? ''}
            error={errors.plate}
            className="tabular"
            autoComplete="off"
          />
        </Field>

        <Field label="Catégorie" name="categoryId" required error={errors.categoryId}>
          <Select
            name="categoryId"
            defaultValue={vehicle?.categoryId ?? ''}
            error={errors.categoryId}
          >
            <option value="">Choisir une catégorie…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Année" name="modelYear" error={errors.modelYear}>
          <Input
            name="modelYear"
            inputMode="numeric"
            defaultValue={vehicle?.modelYear ? String(vehicle.modelYear) : ''}
            placeholder="2022"
            error={errors.modelYear}
            className="tabular"
          />
        </Field>

        {/* Liste fermée : « gris », « Gris » et « gris métal » désignaient le
            même véhicule tout en rendant impossible le moindre filtre. */}
        <Field label="Couleur" name="color" error={errors.color}>
          <Select name="color" defaultValue={vehicle?.color ?? ''} error={errors.color}>
            <option value="">Non précisée</option>
            {VEHICLE_COLORS.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title="Caractéristiques techniques"
        description="Informations techniques, distinctes des informations commerciales."
      >
        <Field label="Carburant" name="fuel" error={errors.fuel}>
          <Select name="fuel" defaultValue={vehicle?.fuel ?? ''} error={errors.fuel}>
            <option value="">Non précisé</option>
            {(Object.keys(FUEL_LABELS) as FuelType[]).map((value) => (
              <option key={value} value={value}>
                {FUEL_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Boîte de vitesse" name="transmission" error={errors.transmission}>
          <Select
            name="transmission"
            defaultValue={vehicle?.transmission ?? ''}
            error={errors.transmission}
          >
            <option value="">Non précisée</option>
            {(Object.keys(TRANSMISSION_LABELS) as TransmissionType[]).map((value) => (
              <option key={value} value={value}>
                {TRANSMISSION_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Nombre de places" name="seats" error={errors.seats}>
          <Input
            name="seats"
            inputMode="numeric"
            defaultValue={vehicle?.seats ? String(vehicle.seats) : ''}
            error={errors.seats}
            className="tabular"
          />
        </Field>

        <Field label="Nombre de portes" name="doors" error={errors.doors}>
          <Input
            name="doors"
            inputMode="numeric"
            defaultValue={vehicle?.doors ? String(vehicle.doors) : ''}
            error={errors.doors}
            className="tabular"
          />
        </Field>

        <Field
          label="Kilométrage"
          name="mileage"
          error={errors.mileage}
          hint={mode === 'create' ? 'Kilométrage à l’entrée dans le parc.' : undefined}
        >
          <Input
            name="mileage"
            inputMode="numeric"
            defaultValue={vehicle ? String(vehicle.mileage) : '0'}
            error={errors.mileage}
            className="tabular"
          />
        </Field>

        {needsMileageReason && (
          <Field
            label="Justification du relevé"
            name="mileageReason"
            required
            wide
            hint="Compteur remplacé, correction d’une saisie antérieure…"
          >
            <Input name="mileageReason" />
          </Field>
        )}
      </FormSection>

      <FormSection
        title="Origine"
        description={
          mode === 'edit'
            ? 'Le changement de fournisseur se fait depuis l’onglet Fournisseur, où il est historisé.'
            : 'Un véhicule fourni doit désigner son fournisseur.'
        }
      >
        {mode === 'create' ? (
          <>
            <Field label="Origine du véhicule" name="origin" required error={errors.origin}>
              <Select
                name="origin"
                value={origin}
                onChange={(event) => setOrigin(event.target.value as VehicleOrigin)}
                error={errors.origin}
              >
                {(Object.keys(ORIGIN_LABELS) as VehicleOrigin[]).map((value) => (
                  <option key={value} value={value}>
                    {ORIGIN_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>

            {origin === 'SUPPLIED' && (
              <Field label="Fournisseur" name="supplierId" required error={errors.supplierId}>
                <Select name="supplierId" error={errors.supplierId}>
                  <option value="">Choisir un fournisseur…</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {/* Même principe que le fournisseur : le champ n'apparaît que
                lorsque l'origine l'exige, et la base impose la cohérence des
                trois cas (migration 024). */}
            {origin === 'PARTNERSHIP' && (
              <Field label="Partenaire" name="partnerId" required error={errors.partnerId}>
                <Select name="partnerId" error={errors.partnerId}>
                  <option value="">Choisir un partenaire…</option>
                  {partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {origin === 'PARTNERSHIP' && partners.length === 0 && (
              <div className="sm:col-span-2">
                <Notice tone="warning">
                  Aucun partenaire n’est enregistré. La gestion des partenariats relève d’une
                  étape ultérieure : les partenaires existants sont créés hors interface.
                </Notice>
              </div>
            )}
          </>
        ) : (
          <Field label="Origine" name="originReadonly">
            <Input
              name="originReadonly"
              defaultValue={ORIGIN_LABELS[vehicle?.origin ?? 'OWNED']}
              disabled
            />
          </Field>
        )}

        <Field label="Date d’entrée dans le parc" name="entryDate" error={errors.entryDate}>
          <Input
            name="entryDate"
            type="date"
            defaultValue={vehicle?.entryDate ?? ''}
            error={errors.entryDate}
          />
        </Field>
      </FormSection>

      <FormSection title="Observations">
        <Field label="Notes internes" name="notes" error={errors.notes} wide>
          <Textarea name="notes" defaultValue={vehicle?.notes ?? ''} error={errors.notes} />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <SubmitButton
          label={mode === 'create' ? 'Enregistrer le véhicule' : 'Enregistrer'}
          icon={mode === 'create' ? CarFront : Save}
          disabled={categories.length === 0}
        />
        <Link
          href={vehicle ? `/location/parc/${vehicle.id}` : '/location/parc'}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Annuler
        </Link>
      </div>
    </form>
  )
}
