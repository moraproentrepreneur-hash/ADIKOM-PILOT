import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listSupplierFilters } from '@/features/supplier-invoices/data'
import { CreateSupplierInvoicePanel } from '@/features/supplier-invoices/panels'

export const metadata: Metadata = { title: 'Nouvelle facture fournisseur' }

/**
 * Enregistrement d'une facture reçue — Module 07 §28, DEC-007.
 *
 * Le système ne GÉNÈRE aucun montant : il enregistre ce que le fournisseur a
 * facturé. DEC-007 laisse ouverte la question d'une génération automatique
 * (contrat, loyer, part par location) ; tant qu'ADIKOM ne l'a pas tranchée,
 * aucun automatisme n'est développé.
 */
export default async function NewSupplierInvoicePage(
  props: PageProps<'/facturation/fournisseurs/nouvelle'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.SUPPLIER_INVOICES_CREATE)

  const searchParams = await props.searchParams
  const preselected =
    typeof searchParams.fournisseur === 'string' ? searchParams.fournisseur : undefined

  const suppliers = await listSupplierFilters()

  return (
    <>
      <Link
        href="/facturation/fournisseurs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux factures
      </Link>

      <PageHeader
        title="Enregistrer une facture fournisseur"
        description="Facture reçue d’un fournisseur. Son montant brut viendra de ses lignes."
      />

      <Card className="max-w-3xl">
        <CreateSupplierInvoicePanel suppliers={suppliers} defaultSupplierId={preselected} />
      </Card>
    </>
  )
}
