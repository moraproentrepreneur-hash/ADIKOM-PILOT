'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2, LoaderCircle, Power, PowerOff } from 'lucide-react'

import { Input, Select } from '@/components/ui/form'
import { setUserStatusAction, type UserFormState } from './actions'
import { STATUS_LABELS, type UserStatus } from './constants'

const INITIAL_STATE: UserFormState = {}

function SubmitButton({ deactivating }: { deactivating: boolean }) {
  const { pending } = useFormStatus()
  const Icon = deactivating ? PowerOff : Power

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        deactivating
          ? 'inline-flex items-center justify-center gap-2 rounded-control border border-danger-soft bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-white disabled:opacity-60'
          : 'inline-flex items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600 disabled:opacity-60'
      }
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-4" aria-hidden />
      )}
      {deactivating ? 'Appliquer le changement' : 'Réactiver le compte'}
    </button>
  )
}

/**
 * Changement de statut d'un compte.
 *
 * La désactivation ne supprime rien : elle empêche la connexion tout en
 * conservant l'historique et les opérations réalisées (Module 08 §13 et §51).
 *
 * Le motif est journalisé. Le dernier Super Admin actif reste protégé par la
 * base, et nul ne peut modifier le statut de son propre compte.
 */
export function StatusForm({
  userId,
  currentStatus,
}: {
  userId: string
  currentStatus: UserStatus
}) {
  const [state, formAction] = useActionState(setUserStatusAction, INITIAL_STATE)
  const [target, setTarget] = useState<UserStatus>(
    currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
  )

  const deactivating = target !== 'ACTIVE'

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />

      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-control border border-danger-soft bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}

      {state.success && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-control border border-success-soft bg-success-soft px-3.5 py-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.success}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="status" className="block text-sm font-medium text-ink">
            Nouveau statut
          </label>
          <Select
            name="status"
            value={target}
            onChange={(event) => setTarget(event.target.value as UserStatus)}
          >
            {(Object.keys(STATUS_LABELS) as UserStatus[])
              .filter((value) => value !== currentStatus)
              .map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reason" className="block text-sm font-medium text-ink">
            Motif
          </label>
          <Input name="reason" placeholder="Départ de l’entreprise, congé…" />
        </div>
      </div>

      <p className="text-xs text-muted">
        {deactivating
          ? 'Le compte ne pourra plus se connecter. L’historique et les opérations réalisées sont conservés.'
          : 'Le compte pourra de nouveau se connecter selon ses permissions.'}
      </p>

      <SubmitButton deactivating={deactivating} />
    </form>
  )
}
