import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { SupplierForm } from '@/features/suppliers/supplier-form'

export const metadata: Metadata = { title: 'Nouveau fournisseur' }

export default async function NewSupplierPage() {
  await requirePermissionOrRedirect(PERMISSIONS.SUPPLIERS_CREATE)

  return (
    <>
      <Link
        href="/tiers/fournisseurs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      <PageHeader
        title="Nouveau fournisseur"
        description="Les coordonnées bancaires se renseignent depuis la fiche, sous permission distincte."
      />

      <Card className="max-w-4xl">
        <SupplierForm mode="create" />
      </Card>
    </>
  )
}
