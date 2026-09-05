import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { listAssignableUsers } from '@/features/projects/data'
import { listClientOptions } from '@/features/clients/data'
import { listSupplierOptions } from '@/features/suppliers/data'
import { listPartnerOptions } from '@/features/partners/data'
import { AppointmentForm } from '@/features/planning/forms'
import { nextSlot } from '@/features/planning/data'

export const metadata: Metadata = { title: 'Nouveau rendez-vous' }

/**
 * Fixation d'un rendez-vous — Module 03 §26, §27.
 *
 * Les trois répertoires de tiers ne sont chargés que si leur lecture est
 * détenue : sans `parties.suppliers.view`, la liste des fournisseurs reste
 * vide, et le formulaire DIT pourquoi (DEC-017).
 */
export default async function NewAppointmentPage() {
  await requirePermissionOrRedirect(PERMISSIONS.APPOINTMENTS_CREATE)

  const [canReadClients, canReadSuppliers, canReadPartners] = await Promise.all([
    can(PERMISSIONS.CLIENTS_VIEW),
    can(PERMISSIONS.SUPPLIERS_VIEW),
    can(PERMISSIONS.PARTNERS_VIEW),
  ])

  const [users, clients, suppliers, partners] = await Promise.all([
    listAssignableUsers(),
    canReadClients ? listClientOptions() : Promise.resolve([]),
    canReadSuppliers ? listSupplierOptions() : Promise.resolve([]),
    canReadPartners ? listPartnerOptions() : Promise.resolve([]),
  ])

  return (
    <>
      <PageHeader
        title="Nouveau rendez-vous"
        description="Avec qui, pour quoi, et quand."
        actions={
          <Link
            href="/projets/rendez-vous"
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Rendez-vous
          </Link>
        }
      />

      <Card>
        <AppointmentForm
          users={users}
          parties={{
            clients,
            suppliers,
            partners,
            canReadClients,
            canReadSuppliers,
            canReadPartners,
          }}
          defaultStartsAt={nextSlot(todayISO())}
          cancelHref="/projets/rendez-vous"
        />
      </Card>
    </>
  )
}
