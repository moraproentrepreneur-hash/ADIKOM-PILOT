import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listServiceCategories } from '@/features/catalog/data'
import { ServiceForm } from '@/features/catalog/service-form'

export const metadata: Metadata = { title: 'Nouveau service' }

export default async function NewServicePage() {
  await requirePermissionOrRedirect(PERMISSIONS.SERVICES_CREATE)

  // Catégories ACTIVES seulement : la base refuse d'accueillir un service dans
  // une catégorie archivée, et proposer un choix voué au refus serait un piège.
  const categories = await listServiceCategories(false)

  return (
    <>
      <Link
        href="/catalogue/services"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux services
      </Link>

      <PageHeader
        title="Nouveau service"
        description="Sa référence est attribuée automatiquement. Les prix se saisissent ensuite, sur sa fiche."
      />

      <Card className="max-w-3xl">
        <ServiceForm
          mode="create"
          categories={categories.map((category) => ({
            id: category.id,
            label: category.label,
          }))}
        />
      </Card>
    </>
  )
}
