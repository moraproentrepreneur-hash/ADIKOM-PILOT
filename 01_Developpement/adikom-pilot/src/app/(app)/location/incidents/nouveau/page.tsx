import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listVehicles } from '@/features/fleet/data'
import { getRentalDetail } from '@/features/rentals/data'
import { IncidentForm } from '@/features/incidents/incident-form'

export const metadata: Metadata = { title: 'Déclarer un incident' }

/**
 * Déclaration d'un incident.
 *
 * DEUX CHEMINS D'ARRIVÉE, UN SEUL FORMULAIRE.
 *
 * Depuis le menu, l'utilisateur choisit le véhicule. Depuis le contrôle de
 * retour d'une location, le véhicule, la location et l'état des lieux sont
 * déjà connus : les redemander ferait ressaisir ce que le système sait déjà,
 * et ouvrirait la porte à un rattachement erroné.
 */
export default async function NewIncidentPage(props: PageProps<'/location/incidents/nouveau'>) {
  await requirePermissionOrRedirect(PERMISSIONS.INCIDENTS_CREATE)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const rentalId = read('location')
  const inspectionId = read('etat')

  /*
   * Le parc n'est lisible qu'avec `rental.fleet.view` — capacité distincte
   * (DEC-024). Sans elle, la liste serait vide, et un menu déroulant vide se
   * lirait « aucun véhicule au parc » : exactement l'affirmation que DEC-017
   * interdit de tirer d'un refus de lecture. L'écran le DIT.
   */
  const mayReadFleet = await can(PERMISSIONS.FLEET_VIEW)
  const vehicles = mayReadFleet ? await listVehicles() : null

  // Location d'origine : lisible seulement avec le droit correspondant.
  const mayReadRentals = await can(PERMISSIONS.RENTALS_VIEW)
  const rental = rentalId && mayReadRentals ? await getRentalDetail(rentalId) : null

  return (
    <>
      <PageHeader
        title="Déclarer un incident"
        description="Un constat : ce qui est arrivé au véhicule, et ce qu’il a laissé comme dommages."
        actions={
          <Link
            href={rental ? `/location/locations/${rental.id}` : '/location/incidents'}
            className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Retour
          </Link>
        }
      />

      <Card className="max-w-4xl">
        {vehicles === null ? (
          <Notice tone="warning">
            La déclaration d’un incident exige de désigner un véhicule, et votre compte n’a pas
            accès au parc automobile. Demandez le droit de consulter les véhicules pour pouvoir
            déclarer un incident.
          </Notice>
        ) : vehicles.length === 0 ? (
          <Notice tone="warning">
            Aucun véhicule n’est enregistré au parc : il n’y a rien sur quoi constater un
            incident.
          </Notice>
        ) : (
          <IncidentForm
            vehicles={vehicles.map((vehicle) => ({
              id: vehicle.id,
              label: `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''} (${vehicle.vehicleNo})`,
            }))}
            defaultVehicleId={rental?.vehicleId ?? read('vehicule') ?? undefined}
            rental={rental ? { id: rental.id, rentalNo: rental.rentalNo } : null}
            inspectionId={rental ? inspectionId || null : null}
            cancelHref={rental ? `/location/locations/${rental.id}` : '/location/incidents'}
          />
        )}
      </Card>
    </>
  )
}
