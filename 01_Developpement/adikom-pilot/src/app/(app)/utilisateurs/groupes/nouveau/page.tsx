import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { GroupForm } from '@/features/groups/group-form'

export const metadata: Metadata = { title: 'Nouveau groupe' }

/**
 * Nouveau groupe — Module 08 §28.
 *
 * Le groupe naît vide : ni membre, ni permission. Les deux se règlent ensuite
 * depuis sa fiche, sous leurs propres capacités — `users.groups.permissions.update`
 * pour ce qu'il ouvre, `users.users.permissions.update` pour qui en bénéficie.
 * Les réunir ici laisserait croire qu'une seule autorisation suffit à tout faire
 * (DEC-024).
 */
export default async function NewGroupPage() {
  await requirePermissionOrRedirect(PERMISSIONS.GROUPS_CREATE)

  return (
    <>
      <Link
        href="/utilisateurs/groupes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux groupes
      </Link>

      <PageHeader
        title="Nouveau groupe"
        description="Un groupe rassemble les permissions d’un poste et les transmet à ses membres."
      />

      <Notice tone="info" className="mb-5">
        Le groupe est créé <strong>vide</strong>. Ses permissions et ses membres se règlent ensuite
        depuis sa fiche : ce sont deux actes distincts, avec chacun sa permission.
      </Notice>

      <Card className="max-w-3xl">
        <GroupForm mode="create" />
      </Card>
    </>
  )
}
