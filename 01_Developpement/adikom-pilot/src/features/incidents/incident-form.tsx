'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'

import { CheckboxOption, Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { createIncidentAction, type IncidentFormState } from './actions'
import {
  KIND_LABELS,
  KIND_ORDER,
  RESPONSIBILITY_LABELS,
  RESPONSIBILITY_ORDER,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from './constants'

/**
 * Déclaration d'un incident.
 *
 * UN DOMMAGE EST UNE LIGNE, PAS UNE PHRASE.
 *
 * C'est toute la raison d'être de ce lot : jusqu'ici, ce qui abîmait un
 * véhicule finissait dans un champ texte d'état des lieux, impossible à
 * compter, à suivre d'une location à l'autre ou à rattacher à la réparation.
 * Chaque dommage a donc ici son emplacement, sa gravité et sa responsabilité
 * constatée.
 *
 * RIEN N'EST CHIFFRÉ.
 *
 * Aucun coût n'est demandé, et ce n'est pas un oubli : les barèmes de dommage
 * ne sont pas définis (DEC-008). L'écran le dit plutôt que de laisser un champ
 * vide faire croire à une omission.
 */
export function IncidentForm({
  vehicles,
  defaultVehicleId,
  rental,
  inspectionId,
  cancelHref,
}: {
  vehicles: { id: string; label: string }[]
  defaultVehicleId?: string
  /** Location d'origine lorsque le constat vient d'un contrôle de retour. */
  rental?: { id: string; rentalNo: string } | null
  inspectionId?: string | null
  cancelHref: string
}) {
  const [state, formAction] = useActionState<IncidentFormState, FormData>(
    createIncidentAction,
    EMPTY_FORM_STATE
  )

  // Une seule ligne au départ : déclarer un incident n'oblige pas à décrire un
  // dommage — une perte de document n'en cause aucun.
  const [damageRows, setDamageRows] = useState<number[]>([0])
  const [nextRow, setNextRow] = useState(1)

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      {rental && <input type="hidden" name="rentalId" value={rental.id} />}
      {inspectionId && <input type="hidden" name="inspectionId" value={inspectionId} />}

      <Notice tone="warning" className="mb-5">
        Ce constat est <strong>enregistré, pas chiffré</strong>. Aucun coût, aucune franchise et
        aucune refacturation ne sont calculés : les barèmes ne sont pas définis. Déclarer un
        incident <strong>n’immobilise pas le véhicule</strong> et ne crée aucune maintenance —
        ces décisions restent les vôtres.
      </Notice>

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Incident">
        {rental ? (
          <Field
            label="Location concernée"
            name="rentalLabel"
            hint="Reprise du dossier d’où vient le constat."
          >
            <Input name="rentalLabel" defaultValue={rental.rentalNo} readOnly disabled />
          </Field>
        ) : null}

        <Field
          label="Véhicule concerné"
          name="vehicleId"
          required
          error={errors.vehicleId}
          hint={
            rental
              ? 'Imposé par la location d’origine.'
              : 'Un incident peut survenir hors de toute location.'
          }
        >
          <Select
            name="vehicleId"
            defaultValue={defaultVehicleId ?? ''}
            error={errors.vehicleId}
            disabled={Boolean(rental)}
          >
            <option value="">Sélectionner un véhicule</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.label}
              </option>
            ))}
          </Select>
        </Field>

        {/* Un champ désactivé n'est pas transmis : la valeur imposée est renvoyée à part. */}
        {rental && defaultVehicleId && (
          <input type="hidden" name="vehicleId" value={defaultVehicleId} />
        )}

        <Field label="Nature" name="kind" required error={errors.kind}>
          <Select name="kind" defaultValue="BREAKDOWN" error={errors.kind}>
            {KIND_ORDER.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Date et heure de l’incident"
          name="occurredAt"
          required
          error={errors.occurredAt}
          hint="Heure des Comores."
        >
          <Input
            name="occurredAt"
            type="datetime-local"
            defaultValue={nowLocal()}
            error={errors.occurredAt}
          />
        </Field>

        <Field
          label="Description"
          name="description"
          required
          wide
          error={errors.description}
          hint="Ce qui s’est passé, tel qu’un lecteur qui n’était pas là doit pouvoir le comprendre."
        >
          <Textarea name="description" rows={4} error={errors.description} />
        </Field>
      </FormSection>

      <FormSection
        title="Dommages constatés"
        description="Un dommage par ligne. Une ligne sans emplacement est ignorée — un incident peut n’en causer aucun."
      >
        <div className="space-y-4 sm:col-span-2">
          {damageRows.map((row, index) => (
            <div key={row} className="rounded-control border border-line p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-ink">Dommage {index + 1}</p>
                {damageRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDamageRows((rows) => rows.filter((value) => value !== row))}
                    className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-danger"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Retirer
                  </button>
                )}
              </div>

              {/*
                Le NOM reste commun à toutes les lignes — c'est ce qui produit
                les tableaux parallèles que l'action relit. L'IDENTIFIANT, lui,
                porte le numéro de ligne : sans cela, cliquer sur un libellé
                activerait le champ de la première ligne, quelle que soit celle
                que l'on voulait remplir.
              */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Emplacement" name={`damageLocation-${row}`}>
                  <Input
                    id={`damageLocation-${row}`}
                    name="damageLocation"
                    placeholder="Portière avant droite"
                  />
                </Field>

                <Field label="Gravité" name={`damageSeverity-${row}`}>
                  <Select id={`damageSeverity-${row}`} name="damageSeverity" defaultValue="MINOR">
                    {SEVERITY_ORDER.map((severity) => (
                      <option key={severity} value={severity}>
                        {SEVERITY_LABELS[severity]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="mt-3">
                <Field
                  label="Description"
                  name={`damageDescription-${row}`}
                  hint="Facultatif : ce que l’emplacement seul ne dit pas."
                >
                  <Textarea
                    id={`damageDescription-${row}`}
                    name="damageDescription"
                    rows={2}
                  />
                </Field>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Responsabilité constatée"
                  name={`damageResponsibility-${row}`}
                  hint="Constat seul : aucune imputation ni facturation n’en découle."
                >
                  <Select
                    id={`damageResponsibility-${row}`}
                    name="damageResponsibility"
                    defaultValue="UNDETERMINED"
                  >
                    {RESPONSIBILITY_ORDER.map((value) => (
                      <option key={value} value={value}>
                        {RESPONSIBILITY_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="flex items-end">
                  <CheckboxOption
                    name="damagePreexisting"
                    value={String(index)}
                    label="Déjà présent au départ"
                    description="Ne pourra pas être reproché au client."
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              setDamageRows((rows) => [...rows, nextRow])
              setNextRow((value) => value + 1)
            }}
            className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-adikom-300 hover:text-adikom-500"
          >
            <Plus className="size-4" aria-hidden />
            Ajouter un dommage
          </button>
        </div>
      </FormSection>

      <FormSection
        title="Photos"
        description="Formats acceptés : JPEG, PNG, WebP. 10 Mo maximum par photo."
      >
        <Field label="Photos du constat" name="photos" wide error={errors.photos}>
          <input
            id="photos"
            name="photos"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="block w-full rounded-control border border-line px-3 py-2.5 text-sm text-ink file:mr-3 file:rounded-control file:border-0 file:bg-adikom-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-adikom-500"
          />
        </Field>
      </FormSection>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton label="Déclarer l’incident" pendingLabel="Enregistrement…" />
        <Link
          href={cancelHref}
          className="rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
        >
          Annuler
        </Link>
      </div>
    </form>
  )
}

/** Heure locale des Comores, au format attendu par `datetime-local`. */
function nowLocal(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Indian/Comoro',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(' ', 'T')
}
