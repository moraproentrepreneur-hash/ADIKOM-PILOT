'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { createMaintenanceAction, type MaintenanceFormState } from './actions'
import {
  ORIGIN_LABELS,
  ORIGIN_ORDER,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  type MaintenanceOrigin,
} from './constants'

/**
 * Déclaration d'une maintenance.
 *
 * L'IMMOBILISATION EST UN CHOIX, PAS UNE CONSÉQUENCE.
 *
 * Workflow 05 §45 dit « lorsqu'une maintenance nécessite une immobilisation » :
 * toutes ne la nécessitent pas. La case est donc décochée par défaut, et sans
 * elle aucune période n'est bloquée — le véhicule reste louable.
 *
 * Quand la case est cochée, la période demandée est soumise à la contrainte
 * d'exclusion du calendrier. Si un engagement l'occupe déjà, RIEN n'est créé :
 * ni la fiche, ni l'immobilisation. Une fiche annonçant un blocage inexistant
 * serait pire que l'absence de fiche.
 *
 * AUCUN COÛT n'est demandé : les montants relèvent du LOT 3.
 */
export function MaintenanceForm({
  vehicles,
  providers,
  defaultVehicleId,
  incident,
  cancelHref,
}: {
  vehicles: { id: string; label: string }[]
  /** `null` sans le droit de consulter les fournisseurs (DEC-017). */
  providers: { id: string; label: string; isMaintenanceProvider: boolean }[] | null
  defaultVehicleId?: string
  /**
   * Incident d'origine lorsque la déclaration part d'un constat.
   *
   * `rentalId` est celui de l'incident, repris tel quel : Workflow 05 §59 veut
   * qu'une maintenance issue d'une location conserve le lien avec elle, et
   * l'incident le porte déjà. Le redemander ferait ressaisir ce que le système
   * sait, avec le risque de désigner la mauvaise.
   */
  incident?: {
    id: string
    incidentNo: string
    vehicleLabel: string
    rentalId: string | null
  } | null
  cancelHref: string
}) {
  const [state, formAction] = useActionState<MaintenanceFormState, FormData>(
    createMaintenanceAction,
    EMPTY_FORM_STATE
  )

  const [immobilizes, setImmobilizes] = useState(false)

  const errors = state.fieldErrors ?? {}
  const defaultOrigin: MaintenanceOrigin = incident ? 'INCIDENT' : 'BREAKDOWN'

  return (
    <form action={formAction} noValidate>
      {incident && <input type="hidden" name="incidentId" value={incident.id} />}
      {incident?.rentalId && (
        <input type="hidden" name="rentalId" value={incident.rentalId} />
      )}

      <Notice tone="warning" className="mb-5">
        Cette fiche décrit une <strong>intervention</strong>, pas son coût : aucun montant, devis
        ni justificatif n’est demandé à ce stade. Déclarer une maintenance{' '}
        <strong>n’immobilise le véhicule que si vous le demandez</strong>, et n’entraîne aucune
        imputation à un fournisseur.
      </Notice>

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Intervention">
        {incident ? (
          <Field
            label="Incident d’origine"
            name="incidentLabel"
            hint="Le véhicule est celui du constat."
          >
            <Input name="incidentLabel" defaultValue={incident.incidentNo} readOnly disabled />
          </Field>
        ) : null}

        <Field
          label="Véhicule concerné"
          name="vehicleId"
          required
          error={errors.vehicleId}
          hint={incident ? 'Imposé par l’incident d’origine.' : undefined}
        >
          <Select
            name="vehicleId"
            defaultValue={defaultVehicleId ?? ''}
            error={errors.vehicleId}
            disabled={Boolean(incident)}
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
        {incident && defaultVehicleId && (
          <input type="hidden" name="vehicleId" value={defaultVehicleId} />
        )}

        <Field label="Origine" name="origin" required error={errors.origin}>
          <Select name="origin" defaultValue={defaultOrigin} error={errors.origin}>
            {ORIGIN_ORDER.map((origin) => (
              <option key={origin} value={origin}>
                {ORIGIN_LABELS[origin]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Priorité"
          name="priority"
          error={errors.priority}
          hint="Oriente le traitement. N’immobilise rien et ne déclenche aucune alerte."
        >
          <Select name="priority" defaultValue="NORMAL" error={errors.priority}>
            {PRIORITY_ORDER.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Motif"
          name="reason"
          required
          wide
          error={errors.reason}
          hint="Pourquoi l’intervention est nécessaire : panne moteur, vidange, freinage…"
        >
          <Input name="reason" error={errors.reason} />
        </Field>

        <Field
          label="Description"
          name="description"
          wide
          error={errors.description}
          hint="Facultatif : la situation telle qu’elle a été constatée."
        >
          <Textarea name="description" rows={3} error={errors.description} />
        </Field>
      </FormSection>

      <FormSection title="Prestataire et planification">
        <Field
          label="Prestataire"
          name="providerSupplierId"
          error={errors.providerSupplierId}
          hint="Issu du référentiel fournisseurs. Distinct du fournisseur du véhicule, même s’il s’agit de la même entité."
        >
          {providers === null ? (
            /*
             * DEC-017 : sans le droit de consulter les fournisseurs, la liste
             * serait vide et se lirait « aucun prestataire n'existe ». Le champ
             * DIT ce qu'il en est.
             */
            <p className="rounded-control border border-line bg-adikom-50/60 px-3 py-2.5 text-sm text-muted">
              Votre compte ne peut pas consulter les fournisseurs : le prestataire pourra être
              renseigné plus tard par quelqu’un qui en a le droit.
            </p>
          ) : (
            <Select
              name="providerSupplierId"
              defaultValue=""
              error={errors.providerSupplierId}
            >
              <option value="">Non désigné</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                  {provider.isMaintenanceProvider ? ' · prestataire' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Date prévue"
          name="plannedAt"
          hint="Heure des Comores. Aucune alerte ni relance automatique n’en découle."
        >
          <Input name="plannedAt" type="datetime-local" />
        </Field>
      </FormSection>

      <FormSection
        title="Immobilisation"
        description="Toutes les interventions n’immobilisent pas le véhicule."
      >
        {/*
          UNE SEULE CASE, QUI DÉCIDE ET QUI AFFICHE.
          En dédoubler le rôle — une case transmise au serveur, une autre pour
          révéler les champs — laisserait les deux se contredire : le serveur
          recevrait une immobilisation dont l'utilisateur n'a jamais vu les
          dates, ou l'inverse.
        */}
        <div className="sm:col-span-2">
          <label
            htmlFor="immobilizes"
            className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line px-3.5 py-2.5 transition-colors hover:border-adikom-300 hover:bg-adikom-50/50 has-checked:border-adikom-400 has-checked:bg-adikom-50"
          >
            <input
              id="immobilizes"
              type="checkbox"
              name="immobilizes"
              checked={immobilizes}
              onChange={(event) => setImmobilizes(event.target.checked)}
              className="mt-0.5 size-4 rounded border-line accent-adikom-500"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                Cette maintenance immobilise le véhicule
              </span>
              <span className="block text-xs text-muted">
                Une période sera bloquée au calendrier. Sans cela, le véhicule reste louable.
              </span>
            </span>
          </label>
        </div>

        {immobilizes && (
          <>
            <Field
              label="Début de l’immobilisation"
              name="immobilizationFrom"
              required
              error={errors.immobilizationFrom}
              hint="Heure des Comores."
            >
              <Input
                name="immobilizationFrom"
                type="datetime-local"
                error={errors.immobilizationFrom}
              />
            </Field>

            <Field
              label="Fin de l’immobilisation"
              name="immobilizationTo"
              required
              error={errors.immobilizationTo}
              hint="La période sera refusée si un engagement l’occupe déjà."
            >
              <Input
                name="immobilizationTo"
                type="datetime-local"
                error={errors.immobilizationTo}
              />
            </Field>
          </>
        )}
      </FormSection>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton label="Déclarer la maintenance" pendingLabel="Enregistrement…" />
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
