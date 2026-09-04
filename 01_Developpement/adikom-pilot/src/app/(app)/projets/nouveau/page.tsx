import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listAssignableUsers } from '@/features/projects/data'
import { ProjectForm } from '@/features/projects/project-form'
import { listClientOptions } from '@/features/clients/data'
import { listSupplierOptions } from '@/features/suppliers/data'
import { listPartnerOptions } from '@/features/partners/data'

export const metadata: Metadata = { title: 'Nouveau projet' }

/**
 * Création d'un projet.
 *
 * Les répertoires de tiers ne sont interrogés QUE si la capacité correspondante
 * est détenue : sans elle, la requête rendrait une liste vide sous RLS, et un
 * menu vide se lirait « aucun client enregistré ». Le formulaire dit alors que
 * le rattachement n'est pas proposé, et pourquoi (DEC-017).
 */
export default async function NewProjectPage() {
  await requirePermissionOrRedirect(PERMISSIONS.PROJECTS_CREATE)

  const [canReadClients, canReadSuppliers, canReadPartners] = await Promise.all([
    can(PERMISSIONS.CLIENTS_VIEW),
    can(PERMISSIONS.SUPPLIERS_VIEW),
    can(PERMISSIONS.PARTNERS_VIEW),
  ])

  const [users, clients, suppliers, partners] = await Promise.all([
    listAssignableUsers(),
    canReadClients ? listClientOptions() : Promise.resolve([]),
    canReadSuppliers ? listSupplierOptions() : Promise.resolve([]),
    canReadPartners ? listPartnerOptions() : Promise.resolve([]),
  ])

  return (
    <>
      <PageHeader
        title="Nouveau projet"
        description="Une intention devient un projet : un objectif, un responsable, une échéance."
        actions={
          <Link
            href="/projets"
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Retour aux projets
          </Link>
        }
      />

      <Card>
        <ProjectForm
          users={users}
          parties={{
            clients,
            suppliers,
            partners,
            canReadClients,
            canReadSuppliers,
            canReadPartners,
          }}
          cancelHref="/projets"
        />
      </Card>
    </>
  )
}
