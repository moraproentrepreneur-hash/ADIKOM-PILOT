import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listClientOptions } from '@/features/clients/data'
import { listCategoryOptions, listVehicleOptions } from '@/features/fleet/data'
import { ReservationForm } from '@/features/reservations/reservation-form'

export const metadata: Metadata = { title: 'Nouvelle réservation' }

export default async function NewReservationPage() {
  await requirePermissionOrRedirect(PERMISSIONS.RESERVATIONS_CREATE)

  /*
   * Une réservation désigne un client et un véhicule : les deux listes sont
   * filtrées par RLS. Sans `parties.clients.view` ou `rental.fleet.view`,
   * elles reviendraient VIDES, et un menu déroulant vide se lit « il n'y a
   * aucun client » — alors qu'il s'agit d'un refus d'accès (DEC-017). Le
   * manque est donc annoncé, et le formulaire n'est pas rendu.
   */
  const [canViewClients, canViewFleet] = await Promise.all([
    can(PERMISSIONS.CLIENTS_VIEW),
    can(PERMISSIONS.FLEET_VIEW),
  ])

  if (!canViewClients || !canViewFleet) {
    return <MissingPrerequisites clients={!canViewClients} fleet={!canViewFleet} />
  }

  const [clients, categories, vehicles] = await Promise.all([
    listClientOptions(),
    listCategoryOptions(),
    listVehicleOptions(),
  ])

  return (
    <>
      <Link
        href="/location/reservations"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      <PageHeader
        title="Nouvelle réservation"
        description="Le véhicule et le tarif se fixent à la confirmation, parmi les véhicules réellement disponibles."
      />

      <Card className="max-w-4xl">
        <ReservationForm
          mode="create"
          clients={clients}
          categories={categories}
          vehicles={vehicles}
        />
      </Card>
    </>
  )
}

/**
 * Le manque est NOMMÉ, plutôt que présenté comme une absence de données.
 * C'est la règle que quatre écrans ont déjà dû corriger (DEC-017).
 */
function MissingPrerequisites({ clients, fleet }: { clients: boolean; fleet: boolean }) {
  const missing = [clients && 'les clients', fleet && 'le parc automobile'].filter(Boolean)

  return (
    <>
      <Link
        href="/location/reservations"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      <PageHeader title="Nouvelle réservation" />

      <Notice tone="warning">
        Créer une réservation suppose de pouvoir consulter {missing.join(' et ')}. Ces droits ne
        vous sont pas attribués : les listes de sélection seraient vides, ce qui laisserait croire
        qu’aucune donnée n’existe. Demandez ces permissions à votre administrateur.
      </Notice>
    </>
  )
}
