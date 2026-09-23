import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'

import { ButtonLink, Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { listClientFilters } from '@/features/customer-invoices/data'
import { CreateQuotePanel } from '@/features/commerce/panels'

export const metadata: Metadata = { title: 'Nouveau devis client' }

/**
 * Création d'un devis — LOT 25, DEC-049.
 *
 * L'écran ne demande que ce qui FONDE le devis : son client et sa date. Les
 * lignes viennent ensuite, sur la fiche, parce que c'est la DATE DU DEVIS qui
 * détermine le prix catalogue de chacune — la choisir d'abord évite d'avoir à
 * recalculer ce qui vient d'être figé.
 */
export default async function NewSalesQuotePage(props: PageProps<'/commerce/devis/nouveau'>) {
  await requirePermissionOrRedirect(PERMISSIONS.SALES_QUOTES_CREATE)

  const searchParams = await props.searchParams
  const clientId = typeof searchParams.client === 'string' ? searchParams.client : undefined

  const clients = await listClientFilters()

  return (
    <>
      <PageHeader
        title="Nouveau devis client"
        description="Une proposition commerciale. Elle n’engage aucune créance et n’appelle aucun règlement."
        actions={
          <ButtonLink href="/commerce/devis" tone="secondary" icon={ArrowLeft}>
            Retour
          </ButtonLink>
        }
      />

      <div className="max-w-2xl">
        <Notice tone="info" className="mb-5">
          La <strong>date du devis</strong> détermine le prix catalogue appliqué à chaque ligne.
          Une hausse ultérieure ne le réécrira pas : le montant proposé au client reste celui du
          jour où il a été proposé.
        </Notice>

        <Card>
          <CreateQuotePanel clients={clients} today={todayISO()} defaultClientId={clientId} />
        </Card>
      </div>
    </>
  )
}
