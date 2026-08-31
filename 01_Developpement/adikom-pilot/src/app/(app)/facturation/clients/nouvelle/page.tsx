import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { listClientFilters, listInvoiceableRentals } from '@/features/customer-invoices/data'
import { CreateCustomerInvoicePanel } from '@/features/customer-invoices/panels'

export const metadata: Metadata = { title: 'Nouvelle facture client' }

/**
 * Préparation d'une facture client — Workflow 07 §18.
 *
 * LE SYSTÈME REPREND, IL NE CALCULE PAS.
 *
 * §18 : « Le système doit reprendre automatiquement les informations
 * disponibles. » Client, location, véhicule et TARIF VERROUILLÉ sont donc
 * repris. Le MONTANT, lui, ne l'est pas : §9 et §12 interdisent d'inventer une
 * valorisation, et la règle d'arrondi de durée n'est pas arrêtée (DEC-008).
 */
export default async function NewCustomerInvoicePage(
  props: PageProps<'/facturation/clients/nouvelle'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.CUSTOMER_INVOICES_CREATE)

  const searchParams = await props.searchParams
  const preselectedClient =
    typeof searchParams.client === 'string' ? searchParams.client : undefined
  const preselectedRental =
    typeof searchParams.location === 'string' ? searchParams.location : undefined

  // Une location ne se propose qu'à qui a le droit de la lire : sans
  // `rental.rentals.view`, la liste serait vide et se lirait « aucune location à
  // facturer » (DEC-017).
  const canSeeRentals = await can(PERMISSIONS.RENTALS_VIEW)

  const [clients, rentals] = await Promise.all([
    listClientFilters(),
    canSeeRentals ? listInvoiceableRentals() : Promise.resolve([]),
  ])

  return (
    <>
      <Link
        href="/facturation/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux factures
      </Link>

      <PageHeader
        title="Préparer une facture client"
        description="Créance d’ADIKOM sur un client. Son total viendra de ses lignes."
      />

      {!canSeeRentals && (
        <Notice tone="warning" className="mb-5">
          Votre compte ne peut pas consulter les locations : aucune ne peut être rattachée à cette
          facture. Elle sera enregistrée comme <strong>facture de services</strong>.
        </Notice>
      )}

      <Card className="max-w-3xl">
        <CreateCustomerInvoicePanel
          clients={clients}
          rentals={rentals.map((rental) => ({
            id: rental.id,
            clientId: rental.clientId,
            lockedAmount: rental.lockedAmount,
            lockedUnit: rental.lockedUnit,
            label: `${rental.rentalNo} — ${rental.clientLabel ?? 'client non lisible'}${
              rental.vehicleLabel ? ` · ${rental.vehicleLabel}` : ''
            }`,
          }))}
          defaultClientId={preselectedClient}
          defaultRentalId={preselectedRental}
          today={todayISO()}
        />
      </Card>
    </>
  )
}
