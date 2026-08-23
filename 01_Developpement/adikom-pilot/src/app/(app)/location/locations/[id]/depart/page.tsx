import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { getRentalDetail, STATUS_LABELS } from '@/features/rentals/data'
import { CheckoutForm } from '@/features/rentals/checkout-form'

export const metadata: Metadata = { title: 'Départ du véhicule' }

/**
 * Départ d'une location.
 *
 * L'écran est une étape du cycle, pas une variante de la fiche : il n'existe
 * que pour une location confirmée, et disparaît dès que le départ est
 * enregistré.
 */
export default async function CheckoutPage(
  props: PageProps<'/location/locations/[id]/depart'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.RENTALS_CHECKOUT)

  const { id } = await props.params
  const rental = await getRentalDetail(id)
  if (!rental) notFound()

  // Le départ est déjà fait : la fiche le montre, cet écran n'a plus d'objet.
  if (rental.status !== 'CONFIRMED') {
    if (rental.startedAt) redirect(`/location/locations/${id}?onglet=etats`)

    return (
      <>
        <BackLink id={id} />
        <PageHeader title="Départ du véhicule" description={rental.rentalNo} />
        <Notice tone="warning">
          Seule une location confirmée peut partir. Celle-ci est «{' '}
          {STATUS_LABELS[rental.status]} ». Confirmez d’abord le contrat depuis sa fiche.
        </Notice>
      </>
    )
  }

  return (
    <>
      <BackLink id={id} />

      <PageHeader
        title="Départ du véhicule"
        description={`${rental.rentalNo} · ${rental.clientLabel}`}
      />

      <Card className="max-w-4xl">
        <CheckoutForm
          rentalId={id}
          rentalNo={rental.rentalNo}
          vehicleLabel={rental.vehicleLabel}
          suggestedStart={rental.plannedFrom}
          cancelHref={`/location/locations/${id}`}
        />
      </Card>
    </>
  )
}

function BackLink({ id }: { id: string }) {
  return (
    <Link
      href={`/location/locations/${id}`}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Retour au contrat
    </Link>
  )
}
