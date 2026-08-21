import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { ClientForm } from '@/features/clients/client-form'

export const metadata: Metadata = { title: 'Nouveau client' }

export default async function NewClientPage() {
  await requirePermissionOrRedirect(PERMISSIONS.CLIENTS_CREATE)

  return (
    <>
      <Link
        href="/tiers/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      <PageHeader
        title="Nouveau client"
        description="L’identifiant client est attribué automatiquement à l’enregistrement."
      />

      <Card className="max-w-4xl">
        <ClientForm mode="create" />
      </Card>
    </>
  )
}
