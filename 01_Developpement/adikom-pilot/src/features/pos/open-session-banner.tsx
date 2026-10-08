import 'server-only'

import Link from 'next/link'
import { ArrowRight, CircleDot } from 'lucide-react'

import { can, getCurrentUser } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { formatDuration } from './constants'
import { getMyOpenSession } from './data'

/**
 * Bandeau « session ouverte » — Module 12 §8.
 *
 * RÉUTILISABLE : le LOT 28 l'affichera en tête de l'écran de caisse, où une
 * vente exigera une session ouverte. Il rappelle à l'utilisateur la session
 * qu'IL tient — jamais celle d'un autre — et mène à sa clôture.
 *
 * Il n'affiche AUCUN montant : un rappel ne doit rien exposer de plus que la
 * session elle-même. Sans `pos.sessions.view`, il ne s'affiche pas.
 *
 * `hideFor` : sur la fiche de la session elle-même, le bandeau serait redondant.
 */
export async function OpenSessionBanner({ hideFor }: { hideFor?: string }) {
  const user = await getCurrentUser()
  if (!user || !(await can(PERMISSIONS.POS_SESSIONS_VIEW))) return null

  const session = await getMyOpenSession(user.id)
  if (!session || session.id === hideFor) return null

  return (
    <div
      role="status"
      className="mb-5 flex flex-col gap-3 rounded-card border border-success-soft bg-success-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <CircleDot className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <p className="min-w-0 text-sm text-ink">
          <span className="font-medium">Votre session {session.sessionNo} est ouverte</span>
          <span className="block text-xs text-muted sm:inline">
            <span className="hidden sm:inline"> · </span>
            {session.registerLabel} · depuis {formatDateTime(session.openedAt)} (
            {formatDuration(session.openedAt, null)})
          </span>
        </p>
      </div>
      <Link
        href={`/pdv/sessions/${session.id}`}
        className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-adikom-500 hover:underline"
      >
        Voir et clôturer
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  )
}
