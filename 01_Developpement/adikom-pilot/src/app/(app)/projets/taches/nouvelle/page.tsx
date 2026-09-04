import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listAssignableUsers, listProjectOptions } from '@/features/projects/data'
import { TaskForm } from '@/features/projects/task-form'

export const metadata: Metadata = { title: 'Nouvelle tâche' }

/**
 * Création d'une tâche.
 *
 * Appelée depuis la liste des tâches, ou depuis la fiche d'un projet — auquel
 * cas `?projet=` pré-remplit le rattachement et le retour se fait sur la fiche.
 *
 * Sans `projects.view`, la liste des projets n'est pas interrogée : elle
 * reviendrait vide sous RLS, et un menu vide se lirait « aucun projet ». La
 * tâche reste créable, indépendante — c'est exactement ce que le §10 prévoit.
 */
export default async function NewTaskPage(props: PageProps<'/projets/taches/nouvelle'>) {
  await requirePermissionOrRedirect(PERMISSIONS.TASKS_CREATE)

  const searchParams = await props.searchParams
  const projectId = typeof searchParams.projet === 'string' ? searchParams.projet : undefined

  const canReadProjects = await can(PERMISSIONS.PROJECTS_VIEW)

  const [users, projects] = await Promise.all([
    listAssignableUsers(),
    canReadProjects ? listProjectOptions() : Promise.resolve([]),
  ])

  const backHref = projectId ? `/projets/${projectId}` : '/projets/taches'

  return (
    <>
      <PageHeader
        title="Nouvelle tâche"
        description="Une action concrète, un responsable, une échéance."
        actions={
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Retour
          </Link>
        }
      />

      {!canReadProjects && (
        <Notice tone="info" className="mb-5">
          Le rattachement à un projet n’est pas proposé : il demande la permission{' '}
          <code className="tabular">projects.view</code>. La tâche sera créée indépendante.
        </Notice>
      )}

      <Card>
        <TaskForm
          projects={projects}
          users={users}
          defaultProjectId={projectId}
          returnTo={projectId ? `/projets/${projectId}` : undefined}
          cancelHref={backHref}
        />
      </Card>
    </>
  )
}
