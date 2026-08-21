'use client'

import { useActionState, useState } from 'react'
import { LogOut } from 'lucide-react'

import { Field, Input, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { todayISO } from '@/lib/dates'
import { retireVehicleAction, type FleetFormState } from './actions'

/**
 * Retrait définitif du parc.
 *
 * §45 et §47 : le véhicule n'est pas supprimé. Locations, maintenances,
 * factures et imputations passées restent intactes et consultables ; le
 * véhicule cesse simplement d'être proposé.
 *
 * Le geste est volontairement séparé du changement de statut ordinaire : il
 * n'est pas réversible d'un clic et relève d'une permission distincte.
 */
export function RetireVehicleForm({ vehicleId }: { vehicleId: string }) {
  const [state, formAction] = useActionState<FleetFormState, FormData>(
    retireVehicleAction,
    EMPTY_FORM_STATE
  )

  const [open, setOpen] = useState(false)
  const errors = state.fieldErrors ?? {}

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-control border border-danger-soft bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-white"
      >
        <LogOut className="size-4" aria-hidden />
        Retirer du parc
      </button>
    )
  }

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicleId} />

      <Notice tone="warning">
        Le véhicule ne pourra plus être loué. Son historique — locations, maintenances, factures —
        reste conservé et consultable.
      </Notice>

      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date de sortie" name="exitDate" required error={errors.exitDate}>
          <Input name="exitDate" type="date" defaultValue={todayISO()} error={errors.exitDate} />
        </Field>

        <Field label="Motif" name="exitReason" error={errors.exitReason}>
          <Input name="exitReason" placeholder="Vente, fin de partenariat, retrait…" />
        </Field>

        <Field label="Précisions" name="exitNotes" wide>
          <Textarea name="exitNotes" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Confirmer le retrait" icon={LogOut} tone="danger" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}
