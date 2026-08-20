'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Eye, EyeOff, LoaderCircle } from 'lucide-react'

import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password'
import { changePasswordAction, type PasswordChangeState } from './actions'

const INITIAL_STATE: PasswordChangeState = {}

const TOO_SHORT = `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
const MISMATCH = 'Les deux mots de passe ne correspondent pas.'

const CONTROL =
  'w-full rounded-control border border-line bg-white px-3.5 py-2.5 pr-11 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-adikom-500'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {pending ? 'Enregistrement…' : 'Définir mon mot de passe'}
    </button>
  )
}

export function PasswordChangeForm() {
  const [state, formAction] = useActionState(changePasswordAction, INITIAL_STATE)

  const [visible, setVisible] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  /**
   * Contrôle avant envoi, lu depuis le FormData réel : un champ rempli par un
   * gestionnaire de mots de passe avant l'hydratation reste ainsi pris en
   * compte. Ce n'est pas une protection — les mêmes règles sont appliquées par
   * l'action serveur.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const confirmation = String(data.get('confirmation') ?? '')

    if (password.length < PASSWORD_MIN_LENGTH) {
      event.preventDefault()
      setLocalError(TOO_SHORT)
      return
    }

    if (password !== confirmation) {
      event.preventDefault()
      setLocalError(MISMATCH)
      return
    }

    setLocalError(null)
  }

  const message = state.error ?? localError
  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-4">
      {message && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control border border-danger-soft bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          Nouveau mot de passe
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            required
            aria-invalid={Boolean(errors.password)}
            className={CONTROL}
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-control text-muted transition-colors hover:text-adikom-500"
          >
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {errors.password ? (
          <p className="text-sm text-danger">{errors.password}</p>
        ) : (
          <p className="text-xs text-muted">Au moins {PASSWORD_MIN_LENGTH} caractères.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirmation" className="block text-sm font-medium text-ink">
          Confirmer le mot de passe
        </label>
        <input
          id="confirmation"
          name="confirmation"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.confirmation)}
          className={CONTROL}
        />
        {errors.confirmation && <p className="text-sm text-danger">{errors.confirmation}</p>}
      </div>

      <SubmitButton />
    </form>
  )
}
