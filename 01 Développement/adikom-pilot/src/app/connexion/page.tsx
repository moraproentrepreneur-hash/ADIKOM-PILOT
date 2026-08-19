import type { Metadata } from 'next'
import Link from 'next/link'

import { AdikomLogo } from '@/components/brand/adikom-logo'
import { LoginForm } from '@/features/auth/login-form'

export const metadata: Metadata = {
  title: 'Connexion',
}

/**
 * Écran de connexion (Design System §57 et §58).
 *
 * Fond clair et zone blanche derrière le logo officiel, qui reste inchangé.
 * Aucun lien d'inscription : les comptes sont créés par le Super Admin.
 *
 * Next.js 16 : `searchParams` est une promesse.
 */
export default async function LoginPage(props: PageProps<'/connexion'>) {
  const searchParams = await props.searchParams
  const suite = typeof searchParams.suite === 'string' ? searchParams.suite : undefined

  return (
    <div className="flex min-h-screen flex-col bg-adikom-50">
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <AdikomLogo size={72} priority />
            <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
              ADIKOM PILOT
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Système interne de gestion et de pilotage
            </p>
          </div>

          <div className="rounded-card border border-line bg-white p-6 shadow-[0_1px_3px_rgba(31,41,55,0.06)] sm:p-8">
            <h2 className="font-display text-lg font-semibold text-ink">Connexion</h2>
            <p className="mt-1 mb-6 text-sm text-muted">
              Accès réservé aux collaborateurs autorisés d’ADIKOM.
            </p>

            <LoginForm suite={suite} />
          </div>

          <p className="mt-6 text-center text-xs text-muted">
            Vous n’avez pas de compte ? Contactez l’administrateur d’ADIKOM PILOT.
          </p>

          <p className="mt-8 text-center text-xs text-muted">
            <Link href="/" className="transition-colors hover:text-adikom-500">
              Retour à l’accueil
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
