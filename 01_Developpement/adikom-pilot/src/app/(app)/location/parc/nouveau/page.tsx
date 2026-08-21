import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listCategoryOptions } from '@/features/fleet/data'
import { listSupplierOptions } from '@/features/suppliers/data'
import { VehicleForm } from '@/features/fleet/vehicle-form'

export const metadata: Metadata = { title: 'Nouveau véhicule' }

export default async function NewVehiclePage() {
  await requirePermissionOrRedirect(PERMISSIONS.FLEET_CREATE)

  const [categories, suppliers] = await Promise.all([
    listCategoryOptions(),
    listSupplierOptions(),
  ])

  return (
    <>
      <Link
        href="/location/parc"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour au parc
      </Link>

      <PageHeader
        title="Nouveau véhicule"
        description="L’identifiant est attribué automatiquement. Le rattachement à un fournisseur ouvre son historique."
      />

      <Card className="max-w-4xl">
        <VehicleForm mode="create" categories={categories} suppliers={suppliers} />
      </Card>
    </>
  )
}
