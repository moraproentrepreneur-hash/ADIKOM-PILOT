import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { PartnerForm } from '@/features/partners/partner-form'

export const metadata: Metadata = { title: 'Nouveau partenaire' }

export default async function NewPartnerPage() {
  // Première barrière : sans `parties.partners.create`, la page elle-même est
  // inaccessible, y compris par saisie directe de l'URL. L'action serveur et la
  // policy RLS d'insertion exigent la même permission.
  await requirePermissionOrRedirect(PERMISSIONS.PARTNERS_CREATE)

  return (
    <>
      <Link
        href="/tiers/partenaires"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      <PageHeader
        title="Nouveau partenaire"
        description="Les véhicules se rattachent ensuite depuis leur fiche, où le changement est historisé."
      />

      <Card className="max-w-4xl">
        <PartnerForm mode="create" />
      </Card>
    </>
  )
}
