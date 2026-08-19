'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Eye, EyeOff, LoaderCircle } from 'lucide-react'

import { signInAction, type SignInState } from './actions'

const INITIAL_STATE: SignInState = {}

/** Longueur minimale du mot de passe. Doit rester alignée sur le contrôle serveur. */
const PASSWORD_MIN_LENGTH = 8

const TOO_SHORT = `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`

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

  const [passwordVisible, setPasswordVisible] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  /**
   * Validation côté interface, lue depuis le FormData réel du formulaire.
   *
   * Deux précautions :
   *
   * — La valeur est lue dans le formulaire, pas dans un état React contrôlé.
   *   Un champ rempli avant l'hydratation, par un gestionnaire de mots de passe
   *   par exemple, ne serait pas vu par React et rendrait le formulaire
   *   inutilisable.
   *
   * — `formAction` reste branché directement sur le formulaire. L'envelopper
   *   dans une fonction intermédiaire empêche `useActionState` de propager
   *   l'état retourné par l'action, et les messages d'erreur du serveur ne
   *   s'affichent plus.
   *
   * Ce contrôle évite une tentative d'authentification inutile. Ce n'est PAS
   * une mesure de sécurité : la même règle est appliquée côté serveur
   * (05_Regles_Metier/05_Permissions.md §85).
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const password = String(new FormData(event.currentTarget).get('password') ?? '')

    if (password.length < PASSWORD_MIN_LENGTH) {
      event.preventDefault()
      setLocalError(TOO_SHORT)
      return
    }

    setLocalError(null)
  }

  const passwordError = localError ?? state.fieldErrors?.password

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-5" noValidate>
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
        <label htmlFor="username" className="block text-sm font-medium text-ink">
          Nom d’utilisateur
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={Boolean(state.fieldErrors?.username)}
          aria-describedby={state.fieldErrors?.username ? 'username-error' : undefined}
          className="w-full rounded-control border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-adikom-500"
          placeholder="Votre nom d’utilisateur"
        />
        {state.fieldErrors?.username && (
          <p id="username-error" className="text-sm text-danger">
            {state.fieldErrors.username}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          Mot de passe
        </label>

        <div className="relative">
          <input
            id="password"
            name="password"
            type={passwordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            required
            onBlur={(event) => {
              const value = event.target.value
              setLocalError(
                value.length > 0 && value.length < PASSWORD_MIN_LENGTH ? TOO_SHORT : null
              )
            }}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError ? 'password-error' : undefined}
            className="w-full rounded-control border border-line bg-white py-2.5 pr-11 pl-3.5 text-sm text-ink outline-none transition-colors focus:border-adikom-500"
          />

          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={
              passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
            }
            aria-pressed={passwordVisible}
            title={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-control text-muted transition-colors hover:text-adikom-500"
          >
            {passwordVisible ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>

        {passwordError && (
          <p id="password-error" className="text-sm text-danger">
            {passwordError}
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  )
}
