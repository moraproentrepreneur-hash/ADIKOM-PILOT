import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AdikomLogo } from '@/components/brand/adikom-logo'
import { requireSession } from '@/lib/auth/dal'
import { PasswordChangeForm } from '@/features/auth/password-change-form'
import { signOutAction } from '@/features/auth/actions'

export const metadata: Metadata = { title: 'Changer votre mot de passe' }

/**
 * Définition du mot de passe personnel à la première connexion.
 *
 * Volontairement placée hors du groupe applicatif : ni barre latérale, ni
 * navigation, ni accès à une donnée métier tant que l'étape n'est pas terminée.
 *
 * `requireSession` exige une session sans imposer la redirection, faute de quoi
 * cette page se détournerait vers elle-même.
 */
export default async function ChangePasswordPage() {
  const user = await requireSession()

  // L'étape est déjà faite : rien à imposer, on rend la main à l'application.
  if (!user.mustChangePassword) redirect('/tableau-de-bord')

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <AdikomLogo size={56} priority />
        </div>

        <div className="rounded-card border border-line bg-white px-6 py-7 shadow-sm sm:px-8">
          <h1 className="font-display text-xl font-semibold text-ink">
            Changer votre mot de passe
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Bonjour {user.firstName}. Le mot de passe qui vous a été communiqué est
            temporaire. Choisissez le vôtre pour accéder à ADIKOM PILOT.
          </p>

          <div className="mt-6">
            <PasswordChangeForm />
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          Votre mot de passe n’est connu que de vous. ADIKOM PILOT ne le conserve jamais en
          clair et ne peut pas vous le rappeler.
        </p>

        {/* Seule issue possible sans terminer l'étape : elle ne donne accès à
            aucune donnée métier. */}
        <form action={signOutAction} className="mt-3 text-center">
          <button
            type="submit"
            className="text-xs text-muted underline-offset-2 transition-colors hover:text-adikom-500 hover:underline"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  )
}
