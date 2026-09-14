import type { Metadata } from 'next'

import { Card, PageHeader } from '@/components/ui/primitives'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listServiceCategories } from '@/features/catalog/data'
import { ServiceCategoryManager } from '@/features/catalog/category-manager'

export const metadata: Metadata = { title: 'Catégories de services' }

/**
 * Catégories du catalogue — LOT 20.
 *
 * Aucun export : `catalog.categories.export` n'existe pas, parce qu'aucun export
 * n'est livré. Une permission qui ne débloque rien ne s'attribue pas
 * (CLAUDE.md §19 bis).
 *
 * Les catégories ARCHIVÉES restent affichées : des services y font référence, et
 * il faut pouvoir les réactiver. Elles ne sont simplement plus proposées à la
 * création d'un service — la base le refuse.
 */
export default async function ServiceCategoriesPage() {
  await requirePermissionOrRedirect(PERMISSIONS.SERVICE_CATEGORIES_VIEW)

  const [categories, canCreate, canUpdate, canArchive] = await Promise.all([
    listServiceCategories(true),
    can(PERMISSIONS.SERVICE_CATEGORIES_CREATE),
    can(PERMISSIONS.SERVICE_CATEGORIES_UPDATE),
    // DEC-024 : archiver est une capacité distincte de modifier.
    can(PERMISSIONS.SERVICE_CATEGORIES_ARCHIVE),
  ])

  return (
    <>
      <PageHeader
        title="Catégories de services"
        description="Elles classent le catalogue : transport, excursion, assistance, services techniques…"
      />

      <Card className="max-w-3xl">
        <ServiceCategoryManager
          categories={categories}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canArchive={canArchive}
        />
      </Card>
    </>
  )
}
