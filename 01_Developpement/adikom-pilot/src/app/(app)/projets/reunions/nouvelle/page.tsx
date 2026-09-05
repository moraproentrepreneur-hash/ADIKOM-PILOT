import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { listAssignableUsers, listProjectOptions } from '@/features/projects/data'
import { MeetingForm } from '@/features/planning/forms'
import { nextSlot } from '@/features/planning/data'

export const metadata: Metadata = { title: 'Nouvelle réunion' }

/**
 * Convocation d'une réunion — Module 03 §21.
 *
 * La page exige `projects.meetings.create` : la lecture ne suffit pas, et une
 * URL tapée à la main ne contourne rien (§51). L'action serveur l'exige de
 * nouveau, et RLS refuse de toute façon l'insertion.
 */
export default async function NewMeetingPage(props: PageProps<'/projets/reunions/nouvelle'>) {
  await requirePermissionOrRedirect(PERMISSIONS.MEETINGS_CREATE)

  const searchParams = await props.searchParams
  const canReadProjects = await can(PERMISSIONS.PROJECTS_VIEW)

  const [users, projects] = await Promise.all([
    listAssignableUsers(),
    canReadProjects ? listProjectOptions() : Promise.resolve([]),
  ])

  const projet = typeof searchParams.projet === 'string' ? searchParams.projet : undefined
  const retour = projet ? `/projets/${projet}` : '/projets/reunions'

  return (
    <>
      <PageHeader
        title="Nouvelle réunion"
        description="Ce qui doit être discuté, avec qui, et pour quand."
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
        <MeetingForm
          users={users}
          projects={projects}
          canReadProjects={canReadProjects}
          defaultStartsAt={nextSlot(todayISO())}
          cancelHref={retour}
        />
      </Card>
    </>
  )
}
