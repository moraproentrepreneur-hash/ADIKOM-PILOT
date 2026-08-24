import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { getRentalDetail, listInspections, STATUS_LABELS } from '@/features/rentals/data'
import { ReturnForm } from '@/features/rentals/return-form'

export const metadata: Metadata = { title: 'Retour du véhicule' }

/**
 * Retour d'une location.
 *
 * L'écran n'existe que pour une location réellement partie, et disparaît dès
 * que le retour est enregistré : le contrôle prend alors le relais.
 */
export default async function ReturnPage(props: PageProps<'/location/locations/[id]/retour'>) {
  await requirePermissionOrRedirect(PERMISSIONS.RENTALS_RETURN)

  const { id } = await props.params
  const rental = await getRentalDetail(id)
  if (!rental) notFound()

  const running = rental.status === 'IN_PROGRESS' || rental.status === 'EXTENDED'

  if (!running) {
    // Déjà rentrée : le contrôle est la suite, l'écran de retour n'a plus d'objet.
    if (rental.returnedAt) redirect(`/location/locations/${id}?onglet=controle`)

    return (
      <>
        <BackLink id={id} />
        <PageHeader title="Retour du véhicule" description={rental.rentalNo} />
        <Notice tone="warning">
          Seule une location en cours peut être retournée. Celle-ci est «{' '}
          {STATUS_LABELS[rental.status]} »
          {rental.status === 'CONFIRMED' || rental.status === 'PREPARING'
            ? ' : elle n’est jamais partie, il n’y a rien à retourner.'
            : '.'}
        </Notice>
      </>
    )
  }

  const inspections = await listInspections(id)
  const departure = inspections.find((inspection) => inspection.kind === 'DEPARTURE') ?? null

  return (
    <>
      <BackLink id={id} />

      <PageHeader
        title="Retour du véhicule"
        description={`${rental.rentalNo} · ${rental.clientLabel}`}
      />

      <Card className="max-w-4xl">
        <ReturnForm
          rentalId={id}
          rentalNo={rental.rentalNo}
          vehicleLabel={rental.vehicleLabel}
          expectedReturnAt={rental.expectedReturnAt}
          departure={
            departure
              ? {
                  mileage: departure.mileage,
                  fuelLevel: departure.fuelLevel,
                  exteriorCondition: departure.exteriorCondition,
                  interiorCondition: departure.interiorCondition,
                  preexistingDamages: departure.preexistingDamages,
                }
              : null
          }
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
