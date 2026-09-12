'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
} from 'lucide-react'

import { generateTemporaryPassword } from '@/lib/auth/password'
import { resetUserPasswordAction, type UserFormState } from './actions'

const INITIAL_STATE: UserFormState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-control border border-danger-soft bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-white disabled:opacity-60"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        <KeyRound className="size-4" aria-hidden />
      )}
      Réinitialiser le mot de passe
    </button>
  )
}

/**
 * Réinitialisation du mot de passe d'un utilisateur — DEC-046.
 *
 * LE MOT DE PASSE NAÎT ET MEURT DANS CE NAVIGATEUR.
 *
 * `generateTemporaryPassword()` est le MÊME que celui de la création d'un
 * compte : aucun doublon, aucune seconde façon de produire un mot de passe. Il
 * est généré ici, transmis une fois à l'action serveur, affiché au seul
 * administrateur qui l'a demandé, et disparaît avec la page. Le serveur ne le
 * renvoie jamais — ce qui s'affiche après l'opération est la valeur que cette
 * page détenait déjà.
 *
 * LE MOT DE PASSE DÉFINITIF DE L'UTILISATEUR N'EST JAMAIS AFFICHÉ, ici ni
 * ailleurs : il n'existe que dans Supabase Auth, sous forme d'empreinte.
 *
 * Trois temps, pour qu'aucun clic ne réinitialise par inadvertance le compte
 * d'une personne qui n'avait rien demandé :
 *
 *   1. un bouton ;
 *   2. une confirmation qui NOMME la personne ;
 *   3. le mot de passe temporaire, affichable et copiable.
 */
export function PasswordResetForm({
  userId,
  fullName,
  username,
  pending: alreadyPending,
}: {
  userId: string
  fullName: string
  username: string
  /** Un mot de passe temporaire est déjà en attente de remplacement. */
  pending: boolean
}) {
  const [state, formAction] = useActionState(resetUserPasswordAction, INITIAL_STATE)

  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  function openConfirmation() {
    // La génération n'a lieu qu'ici, sur action explicite : au montage, elle
    // produirait une valeur absente du rendu serveur, donc une divergence
    // d'hydratation.
    setPassword(generateTemporaryPassword())
    setVisible(false)
    setCopied(false)
    setLocalError(null)
    setConfirming(true)
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // Le presse-papiers peut être refusé (contexte non sécurisé, permission) :
      // l'administrateur affiche alors le mot de passe et le recopie.
      setLocalError(
        'La copie automatique a été refusée par le navigateur. Affichez le mot de passe pour le recopier.'
      )
    }
  }

  const done = Boolean(state.success)

  return (
    <div className="space-y-4">
      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-control border border-danger-soft bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}

      {localError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-control border border-warning-soft bg-warning-soft px-3.5 py-3 text-sm text-warning"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{localError}</span>
        </div>
      )}

      {done ? (
        /* --- Après l'opération : le temporaire, affichable et copiable ------ */
        <>
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-control border border-success-soft bg-success-soft px-3.5 py-3 text-sm text-success"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{state.success}</span>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="temporary-password"
              className="block text-sm font-medium text-ink"
            >
              Mot de passe temporaire de {fullName}
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  id="temporary-password"
                  type={visible ? 'text' : 'password'}
                  value={password}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                  className="w-full rounded-control border border-line bg-canvas px-3.5 py-2.5 pr-11 font-mono text-sm text-ink outline-none"
                />
                <button
                  type="button"
                  onClick={() => setVisible((current) => !current)}
                  aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-control text-muted transition-colors hover:text-adikom-500"
                >
                  {visible ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={copyPassword}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-line px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
              >
                {copied ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
                {copied ? 'Copié' : 'Copier'}
              </button>
            </div>

            {copied && (
              <p role="status" className="text-xs text-success">
                Mot de passe temporaire copié dans le presse-papiers.
              </p>
            )}

            <p className="text-xs text-muted">
              Ce mot de passe est <strong className="font-medium text-ink">temporaire</strong>.
              L’utilisateur devra définir son propre mot de passe lors de sa prochaine
              connexion. Il ne sera plus affiché après avoir quitté cette page : communiquez-le
              par un canal sûr.
            </p>
          </div>
        </>
      ) : confirming ? (
        /* --- Confirmation nommant la personne ------------------------------ */
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          {/* Le champ porte la valeur envoyée : le mot de passe traverse le
              serveur une fois, vers Supabase Auth, et n'en revient jamais. */}
          <input type="hidden" name="password" value={password} />

          <div
            role="alert"
            className="rounded-control border border-warning-soft bg-warning-soft px-3.5 py-3 text-sm text-warning"
          >
            <p>
              Réinitialiser le mot de passe de{' '}
              <strong className="font-medium">{fullName}</strong> ({username}) ?
            </p>
            <p className="mt-1.5 text-xs">
              Son mot de passe actuel cessera d’être valable. Un mot de passe temporaire vous
              sera remis : il devra le remplacer à sa prochaine connexion.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <SubmitButton />
            <button
              type="button"
              onClick={() => {
                setConfirming(false)
                setPassword('')
                setLocalError(null)
              }}
              className="inline-flex items-center justify-center rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : (
        /* --- Point de départ ----------------------------------------------- */
        <>
          <p className="text-sm text-muted">
            {alreadyPending
              ? 'Un mot de passe temporaire est déjà en attente de remplacement. Une nouvelle réinitialisation en produira un autre et annulera le précédent.'
              : 'Un mot de passe temporaire sera produit et affiché une seule fois. Le mot de passe actuel de l’utilisateur n’est jamais consultable.'}
          </p>

          <button
            type="button"
            onClick={openConfirmation}
            className="inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
          >
            <KeyRound className="size-4" aria-hidden />
            Réinitialiser le mot de passe
          </button>
        </>
      )}
    </div>
  )
}
