import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listDepartments, listGroups, listPotentialManagers } from '@/features/users/data'
import { UserForm } from '@/features/users/user-form'

export const metadata: Metadata = { title: 'Nouvel utilisateur' }

export default async function NewUserPage() {
  await requirePermissionOrRedirect(PERMISSIONS.USERS_CREATE)

  const [departments, groups, managers, canManageGroups] = await Promise.all([
    listDepartments(),
    listGroups(),
    listPotentialManagers(),
    can(PERMISSIONS.USER_PERMISSIONS_UPDATE),
  ])

  return (
    <>
      <Link
        href="/utilisateurs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      <PageHeader
        title="Nouvel utilisateur"
        description="Le compte est créé par le Super Admin. Aucune inscription publique n’est possible."
      />

      <Card className="max-w-4xl">
        <UserForm
          mode="create"
          departments={departments}
          groups={groups}
          managers={managers}
          canManageGroups={canManageGroups}
        />
      </Card>
    </>
  )
}
