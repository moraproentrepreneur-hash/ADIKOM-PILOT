import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'

import { requireUser } from '@/lib/auth/dal'

export const metadata: Metadata = {
  title: 'Accès refusé',
}

/**
 * Écran d'accès refusé.
 *
 * Le refus doit être « propre et compréhensible » et ne jamais exposer
 * d'information sensible (05_Regles_Metier/05_Permissions.md §29).
 * L'utilisateur est informé et orienté vers un responsable, sans détail
 * technique sur la donnée protégée.
 */
export default async function AccessDeniedPage() {
  await requireUser()

  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning">
        <ShieldAlert className="size-7" aria-hidden />
      </span>

      <h1 className="mt-5 font-display text-xl font-semibold text-ink">
        Accès refusé
      </h1>

      <p className="mt-2.5 text-sm leading-relaxed text-muted">
        Vous ne disposez pas des droits nécessaires pour consulter cette page.
        Si vous pensez qu’il s’agit d’une erreur, contactez l’administrateur
        d’ADIKOM PILOT.
      </p>

      <Link
        href="/tableau-de-bord"
        className="mt-7 inline-flex items-center justify-center rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
      >
        Retour au tableau de bord
      </Link>
    </div>
  )
}
