import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listCategories } from '@/features/fleet/data'
import { CategoryManager } from '@/features/fleet/category-manager'

export const metadata: Metadata = { title: 'Catégories de véhicules' }

export default async function CategoriesPage() {
  await requirePermissionOrRedirect(PERMISSIONS.CATEGORIES_VIEW)

  // Les catégories archivées restent affichées : des véhicules et des tarifs
  // historiques y font référence, et il faut pouvoir les réactiver.
  const [categories, canCreate, canArchive] = await Promise.all([
    listCategories(true),
    can(PERMISSIONS.CATEGORIES_CREATE),
    can(PERMISSIONS.CATEGORIES_ARCHIVE),
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
        title="Catégories de véhicules"
        description="Elles regroupent les véhicules et peuvent porter un tarif standard."
      />

      <Card className="max-w-3xl">
        <CategoryManager categories={categories} canCreate={canCreate} canArchive={canArchive} />
      </Card>
    </>
  )
}
