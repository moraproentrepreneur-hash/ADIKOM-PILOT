import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { listAssignableUsers, listProjectOptions } from '@/features/projects/data'
import { DecisionForm } from '@/features/planning/forms'
import { listMeetingOptions } from '@/features/planning/data'

export const metadata: Metadata = { title: 'Nouvelle décision' }

/**
 * Enregistrement d'une décision — Module 03 §24.
 *
 * Arrivée depuis une réunion, la décision s'y rattache d'office et le retour se
 * fait sur sa fiche : c'est l'enchaînement du §46 — réunion → décision →
 * actions — et non deux écrans indépendants qu'on relierait à la main.
 */
export default async function NewDecisionPage(props: PageProps<'/projets/decisions/nouvelle'>) {
  await requirePermissionOrRedirect(PERMISSIONS.DECISIONS_CREATE)

  const searchParams = await props.searchParams
  const reunion = typeof searchParams.reunion === 'string' ? searchParams.reunion : undefined

  const [canReadProjects, canReadMeetings] = await Promise.all([
    can(PERMISSIONS.PROJECTS_VIEW),
    can(PERMISSIONS.MEETINGS_VIEW),
  ])

  const [users, projects, meetings] = await Promise.all([
    listAssignableUsers(),
    canReadProjects ? listProjectOptions() : Promise.resolve([]),
    canReadMeetings ? listMeetingOptions() : Promise.resolve([]),
  ])

  const retour = reunion ? `/projets/reunions/${reunion}` : '/projets/decisions'

  return (
    <>
      <PageHeader
        title="Nouvelle décision"
        description="Ce qui a été décidé, pour que cela reste retrouvable."
        actions={
          <Link
            href={retour}
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Retour
          </Link>
        }
      />

      <Card>
        <DecisionForm
          users={users}
          projects={projects}
          meetings={meetings}
          canReadProjects={canReadProjects}
          canReadMeetings={canReadMeetings}
          defaultMeetingId={reunion}
          defaultDecidedOn={todayISO()}
          returnTo={reunion ? `/projets/reunions/${reunion}` : undefined}
          cancelHref={retour}
        />
      </Card>
    </>
  )
}
