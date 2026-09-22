'use client'

import { useActionState, useState } from 'react'
import { CalendarPlus } from 'lucide-react'

import { Field, Input, Textarea } from '@/components/ui/form'
import { Select } from '@/components/ui/select'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { toLocalInput } from '@/lib/dates'
import { extendRentalAction, type RentalFormState } from './actions'

/**
 * Prolongation d'une location en cours — LOT 23, DEC-047.
 *
 * 🟩 A-4 : « On garde le même contrat et on rajoute des avenants. » L'écran le
 * DIT : une prolongation ne crée pas un second contrat, elle y ajoute un
 * avenant numéroté et motivé.
 *
 * 🟩 A-5 / A-7 — LES DEUX CAS, NOMMÉS AVANT D'ÊTRE DÉCRITS :
 *
 *   ◉ Conserver le tarif du contrat        ← le défaut, le cas ordinaire
 *   ○ Appliquer un nouveau tarif           ← proposé SEULEMENT avec `override`
 *         ↳ Tarif · Unité · RAISON (obligatoire)
 *
 * Sans `rental.pricing.override`, l'écran DIT pourquoi le second cas n'est pas
 * proposé, plutôt que de le taire.
 *
 * 🟥 AUCUN BARÈME DE PÉNALITÉ. Aucun bouton « +20 % », aucun sélecteur, aucun
 * champ de pourcentage : A-7 n'arrête ni la base du calcul, ni le taux, ni la
 * nature comptable de la majoration (CLAUDE.md §55).
 *
 * TOUS LES CHAMPS SONT PILOTÉS : React 19 remet à zéro les champs non pilotés
 * dès que l'action s'achève, y compris sur un REFUS. Un exploitant qui saisit
 * une date, un motif, un tarif et sa raison, puis oublie un champ, perdrait
 * tout le reste.
 */
export function ExtendPanel({
  rentalId,
  expectedReturnAt,
  currentAmount,
  currentUnit,
  canOverride,
  canSeeAmounts,
  suggestedRate,
}: {
  rentalId: string
  expectedReturnAt: string
  /** Tarif verrouillé du contrat — affiché seulement avec la capacité financière. */
  currentAmount: number
  currentUnit: 'DAY' | 'FLAT'
  /** `rental.pricing.override` */
  canOverride: boolean
  /** `rental.rentals.financial.view` */
  canSeeAmounts: boolean
  /**
   * Le tarif que le barème donnerait à la date de prolongation, s'il est lisible
   * (`rental.pricing.view`). Information, jamais valeur imposée : `Règles
   * location` §24 — « Le système ne doit pas inventer automatiquement une
   * tarification », et le montant reste saisi.
   */
  suggestedRate: { amount: number; unit: 'DAY' | 'FLAT'; source: string | null } | null
}) {
  const [state, formAction] = useActionState<RentalFormState, FormData>(
    extendRentalAction,
    EMPTY_FORM_STATE
  )

  const [newEnd, setNewEnd] = useState(toLocalInput(expectedReturnAt))
  const [reason, setReason] = useState('')
  const [changeRate, setChangeRate] = useState(false)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<'DAY' | 'FLAT'>(currentUnit)
  const [rateReason, setRateReason] = useState('')

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Nouvelle date de retour"
        name="newEnd"
        required
        error={errors.newEnd}
        hint="Heure des Comores. Doit être postérieure au retour actuellement attendu."
      >
        <Input
          name="newEnd"
          type="datetime-local"
          value={newEnd}
          onChange={(event) => setNewEnd(event.target.value)}
          error={errors.newEnd}
        />
      </Field>

      <Field
        label="Motif"
        name="reason"
        required
        error={errors.reason}
        hint="Une prolongation est un avenant au contrat, et un avenant porte toujours son motif."
      >
        <Input
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Demande du client, retard de chantier…"
          error={errors.reason}
        />
      </Field>

      {/*
        🟩 A-5 — ON NOMME LE CAS AVANT DE LE DÉCRIRE.

        Le choix se fait par deux boutons radio — de vrais champs, adaptés à un
        choix exclusif (consigne §21) — et le bloc tarifaire n'est monté que
        lorsqu'il sert.
      */}
      {canOverride ? (
        <fieldset className="space-y-3 rounded-control border border-line p-4">
          <legend className="px-1 text-sm font-medium text-ink">Tarif de la prolongation</legend>

          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input
              type="radio"
              name="rateChoice"
              className="mt-1"
              checked={!changeRate}
              onChange={() => setChangeRate(false)}
            />
            <span>
              Conserver le tarif du contrat
              {canSeeAmounts && (
                <span className="text-muted">
                  {' — '}
                  {new Intl.NumberFormat('fr-FR').format(currentAmount)} KMF{' '}
                  {currentUnit === 'DAY' ? '/ jour' : 'forfait'}
                </span>
              )}
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input
              type="radio"
              name="rateChoice"
              className="mt-1"
              checked={changeRate}
              onChange={() => setChangeRate(true)}
            />
            <span>
              Appliquer un nouveau tarif à partir de la prolongation
              <span className="block text-xs text-muted">
                L’ancien tarif reste attaché à la période qu’il a couverte ; le nouveau ne vaut que
                pour le temps ajouté.
              </span>
            </span>
          </label>

          {changeRate && (
            <div className="space-y-4 border-t border-line pt-4">
              {suggestedRate && (
                <Notice tone="info">
                  Le barème applicable à cette date donnerait{' '}
                  <strong>
                    {new Intl.NumberFormat('fr-FR').format(suggestedRate.amount)} KMF{' '}
                    {suggestedRate.unit === 'DAY' ? '/ jour' : 'forfait'}
                  </strong>
                  {suggestedRate.source ? ` (${suggestedRate.source})` : ''}. Le montant reste saisi : aucun tarif
                  n’est appliqué sans décision.
                </Notice>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tarif" name="amount" required error={errors.amount}>
                  <Input
                    name="amount"
                    inputMode="numeric"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="60000"
                    error={errors.amount}
                    className="tabular"
                  />
                </Field>

                <Field label="Unité" name="unit" required error={errors.unit}>
                  <Select
                    name="unit"
                    value={unit}
                    error={errors.unit}
                    onChange={(event) => setUnit(event.target.value as 'DAY' | 'FLAT')}
                  >
                    <option value="DAY">Par jour</option>
                    <option value="FLAT">Forfait</option>
                  </Select>
                </Field>
              </div>

              <Field
                label="Raison du changement de tarif"
                name="rateReason"
                required
                error={errors.rateReason}
                hint="Obligatoire : un prix ne change jamais en silence. La raison figure sur l’avenant et au journal d’activité."
              >
                <Textarea
                  name="rateReason"
                  rows={2}
                  value={rateReason}
                  onChange={(event) => setRateReason(event.target.value)}
                  error={errors.rateReason}
                />
              </Field>

              <p className="text-xs text-muted">
                Aucun pourcentage n’est proposé : la base de calcul d’une pénalité, son taux et sa
                nature comptable ne sont pas arrêtés. Le montant est saisi, et il est motivé.
              </p>
            </div>
          )}
        </fieldset>
      ) : (
        <p className="text-xs text-muted">
          Le tarif du contrat sera conservé. Appliquer un autre tarif à la prolongation relève de la
          capacité « Forcer un tarif manuellement », que votre compte ne détient pas.
        </p>
      )}

      <p className="text-xs text-muted">
        Le véhicule reste engagé sans interruption : la période bloquée est étendue. Si un autre
        engagement occupe le créneau demandé, la prolongation est refusée et rien n’est modifié.{' '}
        <strong>Le contrat garde son numéro</strong> — un avenant y est ajouté.
      </p>

      <SubmitButton
        label="Prolonger la location"
        icon={CalendarPlus}
        pendingLabel="Prolongation…"
      />
    </form>
  )
}
