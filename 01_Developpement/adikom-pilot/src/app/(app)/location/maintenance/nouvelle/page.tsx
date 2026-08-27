import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listVehicles } from '@/features/fleet/data'
import { getIncidentDetail } from '@/features/incidents/data'
import { listProviderOptions } from '@/features/maintenance/data'
import { MaintenanceForm } from '@/features/maintenance/maintenance-form'

export const metadata: Metadata = { title: 'Déclarer une maintenance' }

/**
 * Déclaration d'une maintenance.
 *
 * DEUX CHEMINS D'ARRIVÉE, UN SEUL FORMULAIRE.
 *
 * Depuis le menu, l'utilisateur choisit le véhicule. Depuis un incident, le
 * véhicule est celui du constat et n'est pas redemandé — mais l'arrivée reste
 * une DÉCISION : aucun incident ne déclenche de maintenance de lui-même
 * (Workflow 05 §44 appliqué à l'amont).
 */
export default async function NewMaintenancePage(
  props: PageProps<'/location/maintenance/nouvelle'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.MAINTENANCE_CREATE)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const incidentId = read('incident')

  /*
   * Chaque lecture est conditionnée à SON droit (DEC-024). Une liste vide
   * obtenue par refus se lirait « aucun véhicule au parc » ou « aucun
   * prestataire » : l'affirmation que DEC-017 interdit de tirer d'une absence
   * de permission. Le formulaire reçoit `null` et le DIT.
   */
  const [mayReadFleet, mayReadIncidents, mayReadSuppliers] = await Promise.all([
    can(PERMISSIONS.FLEET_VIEW),
    can(PERMISSIONS.INCIDENTS_VIEW),
    can(PERMISSIONS.SUPPLIERS_VIEW),
  ])

  const [vehicles, providers, incident] = await Promise.all([
    mayReadFleet ? listVehicles() : Promise.resolve(null),
    mayReadSuppliers ? listProviderOptions() : Promise.resolve(null),
    incidentId && mayReadIncidents ? getIncidentDetail(incidentId) : Promise.resolve(null),
  ])

  return (
    <>
      <PageHeader
        title="Déclarer une maintenance"
        description="Une intervention sur un véhicule du parc, immobilisante ou non."
        actions={
          <Link
            href={incident ? `/location/incidents/${incident.id}` : '/location/maintenance'}
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
            Déclarer une maintenance exige de désigner un véhicule, et votre compte n’a pas accès
            au parc automobile. Demandez le droit de consulter les véhicules pour pouvoir
            déclarer une intervention.
          </Notice>
        ) : vehicles.length === 0 ? (
          <Notice tone="warning">
            Aucun véhicule n’est enregistré au parc : il n’y a rien à entretenir.
          </Notice>
        ) : (
          <MaintenanceForm
            vehicles={vehicles.map((vehicle) => ({
              id: vehicle.id,
              label: `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''} (${vehicle.vehicleNo})`,
            }))}
            providers={providers}
            defaultVehicleId={incident?.vehicleId ?? read('vehicule') ?? undefined}
            incident={
              incident
                ? {
                    id: incident.id,
                    incidentNo: incident.incidentNo,
                    vehicleLabel: incident.vehicleLabel,
                    // Repris de l'incident, pas ressaisi (Workflow 05 §59).
                    rentalId: incident.rentalId,
                  }
                : null
            }
            cancelHref={
              incident ? `/location/incidents/${incident.id}` : '/location/maintenance'
            }
          />
        )}
      </Card>
    </>
  )
}
