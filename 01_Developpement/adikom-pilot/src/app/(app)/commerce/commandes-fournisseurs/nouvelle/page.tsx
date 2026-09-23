import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'

import { ButtonLink, Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { listSupplierFilters } from '@/features/supplier-invoices/data'
import { CreatePurchaseOrderPanel } from '@/features/purchasing/panels'

export const metadata: Metadata = { title: 'Nouvelle commande fournisseur' }

/**
 * Création directe d'une commande fournisseur — LOT 26, cas B.
 *
 * Le Plan 01 §15.2 rend l'origine FACULTATIVE pour la commande client, et
 * §15.3–15.4 donnent aux tables fournisseurs la « même structure, symétrique ».
 * La commande directe est donc prévue par l'architecture — et c'est le cas le
 * plus courant d'un achat de routine : exiger une offre préalable obligerait à
 * saisir un document fictif pour pouvoir commander.
 */
export default async function NewPurchaseOrderPage() {
  await requirePermissionOrRedirect(PERMISSIONS.PURCHASE_ORDERS_CREATE)

  const suppliers = await listSupplierFilters()

  return (
    <>
      <PageHeader
        title="Nouvelle commande fournisseur"
        description="Un engagement pris auprès d’un fournisseur. Elle n’appelle aucun décaissement par elle-même."
        actions={
          <ButtonLink href="/commerce/commandes-fournisseurs" tone="secondary" icon={ArrowLeft}>
            Retour
          </ButtonLink>
        }
      />

      <div className="max-w-2xl">
        <Notice tone="info" className="mb-5">
          Le <strong>prix de chaque ligne est celui convenu avec le fournisseur</strong> : il est
          saisi, jamais repris du catalogue. Le coût de référence d’ADIKOM sera affiché à côté,
          comme repère.
        </Notice>

        <Card>
          <CreatePurchaseOrderPanel suppliers={suppliers} today={todayISO()} />
        </Card>
      </div>
    </>
  )
}
