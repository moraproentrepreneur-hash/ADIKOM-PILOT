'use client'

import { useActionState, useState } from 'react'

import { Input, Select } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE, type FormState } from '@/lib/form-state'

/**
 * Changement de statut d'une donnée métier.
 *
 * Clients, fournisseurs et véhicules partagent exactement le même geste :
 * choisir un nouvel état, en donner le motif, et le voir journalisé. Un seul
 * composant les sert, plutôt que trois variantes qui divergeraient à la
 * première correction (CLAUDE.md §37).
 *
 * Le motif est consigné dans le journal d'audit. Aucun statut ne supprime quoi
 * que ce soit : l'historique est conservé (CLAUDE.md §22).
 */
export function StatusChangeForm<Status extends string>({
  action,
  entityId,
  entityField,
  currentStatus,
  labels,
  hints,
  reasonPlaceholder,
  submitLabel = 'Appliquer le changement',
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  entityId: string
  /** Nom du champ transmis à l'action : `clientId`, `supplierId`, `vehicleId`. */
  entityField: string
  currentStatus: Status
  labels: Record<Status, string>
  /** Conséquence de chaque statut, affichée avant validation. */
  hints?: Partial<Record<Status, string>>
  reasonPlaceholder?: string
  submitLabel?: string
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, EMPTY_FORM_STATE)

  const available = (Object.keys(labels) as Status[]).filter((value) => value !== currentStatus)
  const [target, setTarget] = useState<Status>(available[0])

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name={entityField} value={entityId} />

      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="status" className="block text-sm font-medium text-ink">
            Nouveau statut
          </label>
          <Select
            name="status"
            value={target}
            onChange={(event) => setTarget(event.target.value as Status)}
          >
            {available.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reason" className="block text-sm font-medium text-ink">
            Motif
          </label>
          <Input name="reason" placeholder={reasonPlaceholder} />
        </div>
      </div>

      {hints?.[target] && <p className="text-xs text-muted">{hints[target]}</p>}

      <SubmitButton label={submitLabel} pendingLabel="Application…" />
    </form>
  )
}
