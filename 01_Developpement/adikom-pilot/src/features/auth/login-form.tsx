'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, LoaderCircle } from 'lucide-react'

import { signInAction, type SignInState } from './actions'

const INITIAL_STATE: SignInState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {pending ? 'Connexion en cours…' : 'Se connecter'}
    </button>
  )
}

export function LoginForm({ suite }: { suite?: string }) {
  const [state, formAction] = useActionState(signInAction, INITIAL_STATE)

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {suite && <input type="hidden" name="suite" value={suite} />}

      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-control border border-danger-soft bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Adresse email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? 'email-error' : undefined}
          className="w-full rounded-control border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-adikom-500"
          placeholder="prenom.nom@adikom.km"
        />
        {state.fieldErrors?.email && (
          <p id="email-error" className="text-sm text-danger">
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? 'password-error' : undefined}
          className="w-full rounded-control border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-adikom-500"
        />
        {state.fieldErrors?.password && (
          <p id="password-error" className="text-sm text-danger">
            {state.fieldErrors.password}
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  )
}
