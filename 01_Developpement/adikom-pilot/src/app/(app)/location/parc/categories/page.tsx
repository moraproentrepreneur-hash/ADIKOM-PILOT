import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { ExportButton } from '@/components/ui/export-button'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listCategories } from '@/features/fleet/data'
import { CategoryManager } from '@/features/fleet/category-manager'

export const metadata: Metadata = { title: 'Catégories de véhicules' }

/**
 * Catégories — export Excel uniquement.
 *
 * Une catégorie est un paramètre de classement : un code, un libellé, un
 * nombre de véhicules. Aucun destinataire n'attend cela sous forme de document
 * imprimé ; en produire un serait de la décoration (CLAUDE.md §29).
 */
export default async function CategoriesPage() {
  await requirePermissionOrRedirect(PERMISSIONS.CATEGORIES_VIEW)

  // Les catégories archivées restent affichées : des véhicules et des tarifs
  // historiques y font référence, et il faut pouvoir les réactiver.
  const [categories, canCreate, canArchive, canExport] = await Promise.all([
    listCategories(true),
    can(PERMISSIONS.CATEGORIES_CREATE),
    can(PERMISSIONS.CATEGORIES_ARCHIVE),
    // DEC-024 : exporter est une capacité distincte de consulter.
    can(PERMISSIONS.CATEGORIES_EXPORT),
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
        actions={canExport ? <ExportButton module="categories" /> : undefined}
      />

      <Card className="max-w-3xl">
        <CategoryManager categories={categories} canCreate={canCreate} canArchive={canArchive} />
      </Card>
    </>
  )
}
