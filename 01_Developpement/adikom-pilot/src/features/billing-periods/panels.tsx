'use client'

import { useActionState, useState } from 'react'
import { CalendarClock, FileText, Ban } from 'lucide-react'

import { Field, Input, Textarea } from '@/components/ui/form'
import { Select } from '@/components/ui/select'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  CADENCE_HELP,
  CADENCE_LABELS,
  CADENCE_ORDER,
  LONG_TERM_NOTE,
  PLAN_LOCKED_NOTE,
  RENTAL_TYPE_HELP,
  RENTAL_TYPE_LABELS,
  type BillingCadence,
  type RentalType,
} from './constants'
import {
  cancelBillingPeriodAction,
  createPeriodInvoiceAction,
  setBillingPlanAction,
  type BillingPeriodFormState,
} from './actions'

/**
 * Formulaires de la facturation périodique — LOT 23, DEC-047.
 *
 * TOUS LES CHAMPS SONT PILOTÉS.
 *
 * React 19 remet à zéro les champs NON pilotés dès que l'action s'achève — y
 * compris sur un REFUS. Un exploitant qui choisit une cadence, saisit une date
 * et une échéance, puis se voit refuser l'acte perdrait toute sa saisie. C'est
 * le défaut que la recette du LOT 22 avait trouvé sur les avenants ; il ne se
 * reproduit pas ici.
 *
 * ET LES CHAMPS RESTENT DE VRAIS CHAMPS (consigne §21) : une date est une date,
 * un choix est un `select`, un motif est un `textarea`. Aucune case à cocher ne
 * remplace un champ de formulaire.
 */

/* -------------------------------------------------------------------------- */
/*  Régime de facturation — 🟩 A-6                                             */
/* -------------------------------------------------------------------------- */

export function BillingPlanPanel({
  rentalId,
  currentType,
  currentCadence,
  locked,
}: {
  rentalId: string
  currentType: RentalType
  currentCadence: BillingCadence | null
  /**
   * Le contrat porte déjà une facture : le régime est figé. `null` = la question
   * n'a pas pu être posée (lecture refusée), et l'écran s'abstient d'affirmer.
   */
  locked: boolean | null
}) {
  const [state, formAction] = useActionState<BillingPeriodFormState, FormData>(
    setBillingPlanAction,
    EMPTY_FORM_STATE
  )

  const [type, setType] = useState<RentalType>(currentType)
  const [cadence, setCadence] = useState<BillingCadence>(currentCadence ?? 'MONTHLY')

  const errors = state.fieldErrors ?? {}

  if (locked === true) {
    return (
      <div className="space-y-3">
        <Notice tone="info">{PLAN_LOCKED_NOTE}</Notice>
        <p className="text-sm text-muted">
          Régime actuel : <strong>{RENTAL_TYPE_LABELS[currentType]}</strong>
          {currentCadence ? ` · ${CADENCE_LABELS[currentCadence]}` : ''}
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Régime de facturation"
        name="rentalType"
        required
        error={errors.rentalType}
        hint={RENTAL_TYPE_HELP[type]}
      >
        <Select
          name="rentalType"
          value={type}
          error={errors.rentalType}
          onChange={(event) => setType(event.target.value as RentalType)}
        >
          <option value="FIXED_TERM">{RENTAL_TYPE_LABELS.FIXED_TERM}</option>
          <option value="LONG_TERM">{RENTAL_TYPE_LABELS.LONG_TERM}</option>
        </Select>
      </Field>

      {/*
        LA CADENCE NE PARAÎT QU'EN LONGUE DURÉE, et le champ est alors RETIRÉ du
        formulaire dans l'autre cas : une cadence postée sur une durée fixée
        serait refusée par la contrainte `rentals_billing_cadence_coherent`.
      */}
      {type === 'LONG_TERM' && (
        <>
          <Field
            label="Cadence"
            name="cadence"
            required
            error={errors.cadence}
            hint={CADENCE_HELP[cadence]}
          >
            <Select
              name="cadence"
              value={cadence}
              error={errors.cadence}
              onChange={(event) => setCadence(event.target.value as BillingCadence)}
            >
              {CADENCE_ORDER.map((value) => (
                <option key={value} value={value}>
                  {CADENCE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Notice tone="info">{LONG_TERM_NOTE}</Notice>
        </>
      )}

      {locked === null && (
        <Notice tone="warning">
          Vos droits ne permettent pas de savoir si ce contrat porte déjà une facture. Si c’est le
          cas, la base refusera le changement — et le dira.
        </Notice>
      )}

      <SubmitButton
        label="Enregistrer le régime"
        icon={CalendarClock}
        pendingLabel="Enregistrement…"
      />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Préparer la facture d'une période                                          */
/* -------------------------------------------------------------------------- */

export function PeriodInvoicePanel({
  rentalId,
  periodId,
  periodLabel,
  today,
}: {
  rentalId: string
  periodId: string
  /** « Période n° 2 · 01/10/2026 → 01/11/2026 » — ce que la facture couvrira. */
  periodLabel: string
  today: string
}) {
  const [state, formAction] = useActionState<BillingPeriodFormState, FormData>(
    createPeriodInvoiceAction,
    EMPTY_FORM_STATE
  )

  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />
      <input type="hidden" name="periodId" value={periodId} />

      <FormFeedback error={state.error} success={state.success} />

      <p className="text-sm text-ink">
        Cette facture couvrira <strong>{periodLabel}</strong>, et cette période seulement.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de la facture" name="invoiceDate" required error={errors.invoiceDate}>
          <Input
            name="invoiceDate"
            type="date"
            value={invoiceDate}
            onChange={(event) => setInvoiceDate(event.target.value)}
            error={errors.invoiceDate}
          />
        </Field>

        <Field
          label="Échéance"
          name="dueDate"
          error={errors.dueDate}
          hint="Facultative. Elle ne peut pas précéder la date de la facture."
        >
          <Input
            name="dueDate"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            error={errors.dueDate}
          />
        </Field>
      </div>

      <Field label="Observations" name="notes" error={errors.notes}>
        <Textarea
          name="notes"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>

      <p className="text-xs text-muted">
        La facture naît en <strong>brouillon, sans ligne</strong>. Ses lignes se saisissent ensuite :
        le prix unitaire de chaque portion tarifaire est repris du contrat, la quantité reste à
        saisir — la règle d’arrondi de durée n’est pas arrêtée.
      </p>

      <SubmitButton label="Préparer la facture" icon={FileText} pendingLabel="Préparation…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Annuler la dernière période                                                */
/* -------------------------------------------------------------------------- */

export function CancelPeriodButton({
  rentalId,
  periodId,
}: {
  rentalId: string
  periodId: string
}) {
  const [state, formAction] = useActionState<BillingPeriodFormState, FormData>(
    cancelBillingPeriodAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="rentalId" value={rentalId} />
      <input type="hidden" name="periodId" value={periodId} />
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
      <SubmitButton
        label="Annuler cette période"
        icon={Ban}
        tone="secondary"
        pendingLabel="Annulation…"
      />
    </form>
  )
}
