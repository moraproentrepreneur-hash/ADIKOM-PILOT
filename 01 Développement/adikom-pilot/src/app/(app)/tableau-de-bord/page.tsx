import type { Metadata } from 'next'
import { Info } from 'lucide-react'

import { getCurrentUser, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'

export const metadata: Metadata = {
  title: 'Tableau de bord',
}

/**
 * Tableau de bord — socle.
 *
 * Les indicateurs seront branchés sur les données réelles au fil des modules
 * (phase 8 du plan). Conformément au Module 01 §6, aucune donnée fictive n'est
 * affichée : tant qu'un indicateur n'a pas de source réelle, il n'apparaît pas.
 */
export default async function DashboardPage() {
  await requirePermissionOrRedirect(PERMISSIONS.DASHBOARD_VIEW)
  const user = await getCurrentUser()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink">
          Bonjour {user?.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Vue d’ensemble de l’activité d’ADIKOM Technology &amp; Travel.
        </p>
      </header>

      <section className="rounded-card border border-line bg-white p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-adikom-50 text-adikom-500">
            <Info className="size-4.5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              Socle en place
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              L’authentification, le système de permissions et le journal d’audit sont
              opérationnels. Les indicateurs de pilotage seront alimentés au fur et à
              mesure de la mise en service des modules — aucun chiffre n’est affiché
              tant qu’il ne provient pas des données réelles.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
