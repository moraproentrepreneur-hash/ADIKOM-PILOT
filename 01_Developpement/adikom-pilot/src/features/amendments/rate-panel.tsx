'use client'

import { useActionState, useState } from 'react'
import { Tags } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatDateTime, toLocalInput } from '@/lib/dates'
import { formatPrice, UNIT_LABELS, type PricingUnit } from '@/features/pricing/constants'
import { changeRentalRateAction, type AmendmentFormState } from './actions'

/**
 * Changement de tarif d'un contrat en cours — LOT 22, A-5 et A-7.
 *
 * 🟥 AUCUN BARÈME N'EST PROPOSÉ, ET C'EST DÉLIBÉRÉ.
 *
 * A-7 dit : « un changement de tarif peut survenir si le client change le mode de
 * location (court à long) ou si le client n'a pas respecté les termes du contrat,
 * en rajoutant des pénalités de 20 à 100 % ». Ce qui manque : de quoi ces
 * pourcentages se calculent, qui fixe le taux, et s'il s'agit d'une majoration du
 * tarif ou d'une ligne de facture distincte (Plan 02 §3.1).
 *
 * L'écran n'offre donc AUCUN bouton « +20 % », AUCUN sélecteur de pénalité :
 * le montant est SAISI et MOTIVÉ. Inventer un barème serait inventer une règle
 * métier (CLAUDE.md §55). Le jour où la Direction tranchera, il n'y aura qu'à
 * calculer le montant que quelqu'un saisit aujourd'hui.
 */
export function RateChangePanel({
  rentalId,
  currentAmount,
  currentUnit,
  periodFrom,
  periodTo,
}: {
  rentalId: string
  currentAmount: number
  currentUnit: PricingUnit
  periodFrom: string
  periodTo: string
}) {
  /*
   * CHAMPS PILOTÉS : React 19 remet à zéro les champs non pilotés dès que
   * l'action s'achève, refus compris. Un montant et un motif ne se ressaisissent
   * pas parce qu'une date était mal formée.
   */
  const [saisie, setSaisie] = useState({
    amount: '',
    unit: currentUnit as string,
    effectiveAt: toLocalInput(periodFrom),
    reason: '',
    notes: '',
  })

  const champ =
    (cle: keyof typeof saisie) =>
    (event: { target: { value: string } }) =>
      setSaisie((etat) => ({ ...etat, [cle]: event.target.value }))

  const [state, formAction] = useActionState<AmendmentFormState, FormData>(
    changeRentalRateAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />

      <FormFeedback error={state.error} success={state.success} />

      <p className="text-xs text-muted">
        Tarif actuellement appliqué : <strong>{formatPrice(currentAmount, currentUnit)}</strong>.
        Le nouveau tarif s’appliquera à partir de la date d’effet ; l’ancien restera attaché à la
        période qu’il a couverte.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nouveau tarif (KMF)" name="amount" required error={errors.amount}>
          <Input
            name="amount"
            inputMode="numeric"
            value={saisie.amount}
            onChange={champ('amount')}
            placeholder={String(currentAmount)}
            error={errors.amount}
            className="tabular"
          />
        </Field>

        <Field label="Unité" name="unit" required error={errors.unit}>
          <Select name="unit" value={saisie.unit} onChange={champ('unit')} error={errors.unit}>
            {(Object.keys(UNIT_LABELS) as PricingUnit[]).map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="À partir du"
          name="effectiveAt"
          required
          error={errors.effectiveAt}
          hint={`Heure des Comores, strictement à l’intérieur de la période en cours (${formatDateTime(periodFrom) ?? '—'} → ${formatDateTime(periodTo) ?? '—'}).`}
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
          label="Motif du changement"
          name="reason"
          required
          error={errors.reason}
          hint="Obligatoire. Un prix ne se modifie jamais en silence : cette raison accompagne l’acte au journal d’activité."
          wide
        >
          <Textarea
            name="reason"
            rows={2}
            value={saisie.reason}
            onChange={champ('reason')}
            placeholder="Passage en longue durée, tarif renégocié d’un commun accord, non-respect des termes du contrat…"
            error={errors.reason}
          />
        </Field>

        <Field label="Observations" name="notes" error={errors.notes} wide>
          <Textarea
            name="notes"
            rows={2}
            value={saisie.notes}
            onChange={champ('notes')}
            error={errors.notes}
          />
        </Field>
      </div>

      <p className="text-xs text-muted">
        Aucun pourcentage n’est appliqué automatiquement : le montant est celui que vous saisissez.
        Les pénalités de 20 à 100 % évoquées par la Direction attendent une décision sur leur base
        de calcul et leur nature — elles ne sont donc pas implémentées.
      </p>

      <SubmitButton label="Enregistrer l’avenant" icon={Tags} pendingLabel="Enregistrement…" />
    </form>
  )
}
