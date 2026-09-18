'use client'

import { useActionState, useState } from 'react'
import { Repeat } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatDateTime, toLocalInput } from '@/lib/dates'
import { UNIT_LABELS, type PricingUnit } from '@/features/pricing/constants'
import { replaceRentalVehicleAction, type AmendmentFormState } from './actions'
import type { SwapCandidate } from './data'

/**
 * Remplacement du véhicule d'une location — LOT 22, A-4 et A-5.
 *
 * CE QUE L'ÉCRAN DOIT DIRE AVANT TOUTE SAISIE :
 *
 *   · le contrat NE CHANGE PAS. Un remplacement n'est pas une nouvelle location,
 *     et l'écran l'annonce plutôt que de laisser l'exploitant se demander s'il
 *     doit annuler puis recréer (A-4) ;
 *   · le client paie GÉNÉRALEMENT le nouveau tarif. Le champ de tarif est donc
 *     VIDE par défaut, et le laisser vide applique le barème ;
 *   · une DÉROGATION est un geste à part, avec sa propre raison, et elle n'est
 *     proposée qu'à qui détient la capacité correspondante (A-5, A-14).
 *
 * LES CHAMPS RESTENT DE VRAIS CHAMPS (consigne §25) : un `select` est un
 * `select`, une date est une date, un motif est un `textarea`. Aucune case à
 * cocher ne remplace un champ de formulaire.
 *
 * ET ILS SONT PILOTÉS, POUR UNE RAISON DE FOND.
 *
 * React 19 REMET À ZÉRO les champs non pilotés d'un formulaire dès que son action
 * s'achève — y compris lorsqu'elle s'achève sur un REFUS. Un exploitant qui
 * choisit un véhicule, une date, écrit son motif, coche la dérogation, saisit un
 * montant, puis oublie la raison de la dérogation, perdrait les six champs pour
 * un seul manquant. Le formulaire garde donc sa saisie dans son propre état : un
 * refus explique ce qui manque, il ne punit pas.
 */

/** Un instant, sur le fuseau des Comores — la seule lecture métier (DEC-025 §e). */
function formatInstant(value: string | null): string {
  return formatDateTime(value) ?? '—'
}
export function VehicleSwapPanel({
  rentalId,
  currentVehicleLabel,
  candidates,
  periodFrom,
  periodTo,
  startedAt,
  running,
  currentAmount,
  currentUnit,
  canOverride,
}: {
  rentalId: string
  currentVehicleLabel: string
  candidates: SwapCandidate[]
  /** Bornes de la période en cours — la bascule doit tomber entre les deux. */
  periodFrom: string
  periodTo: string
  startedAt: string | null
  /** La location est-elle partie ? Le message temporel en dépend. */
  running: boolean
  currentAmount: number
  currentUnit: PricingUnit
  /** `rental.pricing.override` — sans elle, la dérogation n'est pas proposée. */
  canOverride: boolean
}) {
  const [derogation, setDerogation] = useState(false)

  /*
   * LA BORNE PROPOSÉE PAR DÉFAUT.
   *
   * Pour une location EN COURS, le remplacement se CONSTATE : la base refuse une
   * bascule postérieure à maintenant. Le champ propose donc l'instant présent.
   * Pour un contrat non parti, la bascule est à venir : le début de la période.
   */
  const [saisie, setSaisie] = useState({
    vehicleId: '',
    effectiveAt: running ? toLocalInput(new Date().toISOString()) : toLocalInput(periodFrom),
    reason: '',
    amount: String(currentAmount),
    unit: currentUnit as string,
    rateReason: '',
    notes: '',
  })

  const champ =
    (cle: keyof typeof saisie) =>
    (event: { target: { value: string } }) =>
      setSaisie((etat) => ({ ...etat, [cle]: event.target.value }))

  const [state, formAction] = useActionState<AmendmentFormState, FormData>(
    replaceRentalVehicleAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  if (candidates.length === 0) {
    return (
      <Notice tone="info">
        Aucun autre véhicule du parc n’est disponible pour un remplacement. Un véhicule retiré du
        parc ne peut plus être engagé.
      </Notice>
    )
  }

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />

      <FormFeedback error={state.error} success={state.success} />

      <p className="text-xs text-muted">
        Le véhicule actuellement affecté est <strong>{currentVehicleLabel}</strong>. Le contrat et
        son identifiant ne changent pas : le remplacement est consigné par un avenant, et l’ancien
        véhicule reste dans l’historique.
      </p>

      <Field
        label="Véhicule de remplacement"
        name="vehicleId"
        required
        error={errors.vehicleId}
        hint="La disponibilité est vérifiée sur la période restante : un véhicule déjà engagé sera refusé."
        wide
      >
        <Select
          name="vehicleId"
          value={saisie.vehicleId}
          onChange={champ('vehicleId')}
          error={errors.vehicleId}
        >
          <option value="">Choisir un véhicule…</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
              {candidate.categoryLabel ? ` · ${candidate.categoryLabel}` : ''}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="À partir du"
        name="effectiveAt"
        required
        error={errors.effectiveAt}
        hint={
          running
            ? `Heure des Comores, entre le départ réel (${formatInstant(startedAt ?? periodFrom)}) et maintenant : un remplacement se CONSTATE au moment où il survient, il ne se programme pas sur un véhicule déjà dehors.`
            : `Heure des Comores, dans la période en cours (${formatInstant(periodFrom)} → ${formatInstant(periodTo)}). L’instant choisi appartient à la NOUVELLE période : l’ancienne s’arrête juste avant.`
        }
        wide
      >
        <Input
          name="effectiveAt"
          type="datetime-local"
          value={saisie.effectiveAt}
          onChange={champ('effectiveAt')}
          error={errors.effectiveAt}
        />
      </Field>

      <Field
        label="Motif du remplacement"
        name="reason"
        required
        error={errors.reason}
        hint="Obligatoire. Dans six mois, c’est cette phrase qui dira pourquoi le véhicule a changé."
        wide
      >
        <Textarea
          name="reason"
          rows={2}
          value={saisie.reason}
          onChange={champ('reason')}
          placeholder="Panne immobilisante, accident, immobilisation pour maintenance…"
          error={errors.reason}
        />
      </Field>

      {/*
        🟩 A-5 — « Généralement le client paie le nouveau tarif, toutefois des
        situations peuvent se présenter autrement et on les gère selon le
        contexte. »

        Le cas ordinaire est le DÉFAUT, et il n'exige rien : le barème du nouveau
        véhicule s'applique. La dérogation est un geste SUPPLÉMENTAIRE, réservé à
        qui détient `rental.pricing.override` — et l'écran dit pourquoi elle n'est
        pas proposée à qui ne l'a pas (DEC-017).
      */}
      {canOverride ? (
        <div className="rounded-control border border-line p-3">
          <p className="text-sm font-medium text-ink">Tarif facturé au client</p>
          <p className="mt-1 text-xs text-muted">
            Par défaut, le client paie le tarif du nouveau véhicule, résolu par le barème en
            vigueur à la date de bascule. Une dérogation est possible lorsque le contexte l’exige —
            elle est alors tracée, motivée et journalisée.
          </p>

          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="tarifMode"
                value="bareme"
                checked={!derogation}
                onChange={() => setDerogation(false)}
                className="size-4 accent-adikom-500"
              />
              Appliquer le tarif du nouveau véhicule
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="tarifMode"
                value="derogation"
                checked={derogation}
                onChange={() => setDerogation(true)}
                className="size-4 accent-adikom-500"
              />
              Appliquer un tarif dérogatoire
            </label>
          </div>

          {derogation && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Tarif (KMF)" name="amount" required error={errors.amount}>
                <Input
                  name="amount"
                  inputMode="numeric"
                  value={saisie.amount}
                  onChange={champ('amount')}
                  placeholder="50 000"
                  error={errors.amount}
                  className="tabular"
                />
              </Field>

              <Field label="Unité" name="unit" required error={errors.unit}>
                <Select
                  name="unit"
                  value={saisie.unit}
                  onChange={champ('unit')}
                  error={errors.unit}
                >
                  {(Object.keys(UNIT_LABELS) as PricingUnit[]).map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Raison de la dérogation"
                name="rateReason"
                required
                error={errors.rateReason}
                hint="Obligatoire : pourquoi le client ne paie-t-il pas le tarif du nouveau véhicule ?"
                wide
              >
                <Textarea
                  name="rateReason"
                  rows={2}
                  value={saisie.rateReason}
                  onChange={champ('rateReason')}
                  placeholder="ADIKOM absorbe l’écart : l’indisponibilité est de son fait…"
                  error={errors.rateReason}
                />
              </Field>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">
          Le client paiera le tarif du nouveau véhicule, résolu par le barème. Appliquer un tarif
          différent relève d’une capacité dédiée — « Forcer un tarif manuellement » — que votre
          compte ne détient pas.
        </p>
      )}

      <Field
        label="Observations"
        name="notes"
        error={errors.notes}
        hint="Facultatif, interne."
        wide
      >
        <Textarea
          name="notes"
          rows={2}
          value={saisie.notes}
          onChange={champ('notes')}
          error={errors.notes}
        />
      </Field>

      <p className="text-xs text-muted">
        L’ancien véhicule est libéré à l’instant de bascule et revient au parc ; le nouveau est
        engagé à partir du même instant. <strong>Le remplacement n’immobilise pas l’ancien
        véhicule</strong> : déclarer une panne reste un acte distinct, depuis le module Dommages
        &amp; Incidents.
      </p>

      <SubmitButton
        label="Enregistrer l’avenant"
        icon={Repeat}
        pendingLabel="Enregistrement…"
      />
    </form>
  )
}
