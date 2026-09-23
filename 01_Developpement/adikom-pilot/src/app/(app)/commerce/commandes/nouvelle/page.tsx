import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'

import { ButtonLink, Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { listClientFilters } from '@/features/customer-invoices/data'
import { CreateOrderPanel } from '@/features/commerce/panels'

export const metadata: Metadata = { title: 'Nouvelle commande client' }

/**
 * Création directe d'une commande — LOT 25, DEC-049.
 *
 * LE CHEMIN DIRECT EST PRÉVU, ET DOCUMENTÉ. Le Plan 01 §15.2 écrit
 * `sales_quote_id uuid → sales_quotes, -- origine facultative` : une commande
 * peut donc exister sans devis, lorsqu'un client commande sans proposition
 * préalable. Ce n'est pas une facilité ajoutée ici, c'est l'architecture
 * retenue.
 *
 * La conversion d'un devis accepté, elle, se fait depuis la fiche du devis :
 * c'est là que se trouve l'acte, et c'est là qu'on voit ce qu'on convertit.
 */
export default async function NewSalesOrderPage() {
  await requirePermissionOrRedirect(PERMISSIONS.SALES_ORDERS_CREATE)

  const clients = await listClientFilters()

  return (
    <>
      <PageHeader
        title="Nouvelle commande client"
        description="Un engagement du client. Elle n’est pas une facture et n’appelle, en elle-même, aucun règlement."
        actions={
          <ButtonLink href="/commerce/commandes" tone="secondary" icon={ArrowLeft}>
            Retour
          </ButtonLink>
        }
      />

      <div className="max-w-2xl">
        <Notice tone="info" className="mb-5">
          Pour transformer un devis accepté en commande, ouvrez <strong>ce devis</strong> : la
          conversion y reprend ses lignes et ses prix sans réinterroger le catalogue. Cet écran
          sert aux commandes <strong>sans proposition préalable</strong>.
        </Notice>

        <Card>
          <CreateOrderPanel clients={clients} today={todayISO()} />
        </Card>
      </div>
    </>
  )
}
