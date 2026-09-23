import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'

import { ButtonLink, Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { listSupplierFilters } from '@/features/supplier-invoices/data'
import { CreatePurchaseQuotePanel } from '@/features/purchasing/panels'

export const metadata: Metadata = { title: 'Nouveau devis fournisseur' }

/**
 * Enregistrement d'une offre reçue — LOT 26.
 *
 * L'écran ne demande que ce qui IDENTIFIE l'offre : son fournisseur, sa date, et
 * la référence que le fournisseur lui a donnée. Les lignes viennent ensuite, sur
 * la fiche.
 *
 * ⚠ Contrairement au devis client, la date NE DÉTERMINE AUCUN PRIX : les prix
 * d'achat sont ceux de l'offre, saisis ligne par ligne. Elle sert à situer
 * l'acte, et à dater le repère du catalogue que l'éditeur affiche.
 */
export default async function NewPurchaseQuotePage(
  props: PageProps<'/commerce/devis-fournisseurs/nouveau'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.PURCHASE_QUOTES_CREATE)

  const searchParams = await props.searchParams
  const supplierId =
    typeof searchParams.fournisseur === 'string' ? searchParams.fournisseur : undefined

  const suppliers = await listSupplierFilters()

  return (
    <>
      <PageHeader
        title="Nouveau devis fournisseur"
        description="L’offre d’un fournisseur, enregistrée telle qu’elle a été reçue. Elle n’engage aucune dépense."
        actions={
          <ButtonLink href="/commerce/devis-fournisseurs" tone="secondary" icon={ArrowLeft}>
            Retour
          </ButtonLink>
        }
      />

      <div className="max-w-2xl">
        <Notice tone="info" className="mb-5">
          Le <strong>prix de chaque ligne est celui que le fournisseur propose</strong> : il est
          saisi, jamais repris du catalogue. Le coût de référence d’ADIKOM sera affiché à côté,
          comme repère — le catalogue porte un coût unique par prestation, sans distinction de
          fournisseur.
        </Notice>

        <Card>
          <CreatePurchaseQuotePanel
            suppliers={suppliers}
            today={todayISO()}
            defaultSupplierId={supplierId}
          />
        </Card>
      </div>
    </>
  )
}
