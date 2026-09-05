import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'

import {
  Badge,
  ButtonLink,
  Card,
  Empty,
  InfoRow,
  PageHeader,
} from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { listAssignableUsers } from '@/features/projects/data'
import { listClientOptions } from '@/features/clients/data'
import { listSupplierOptions } from '@/features/suppliers/data'
import { listPartnerOptions } from '@/features/partners/data'
import { AppointmentForm } from '@/features/planning/forms'
import { AppointmentStatusForm, ParticipantsPanel } from '@/features/planning/panels'
import {
  APPOINTMENT_STATUS_LABELS,
  PLANNING_NEXT_STATUSES,
  PLANNING_STATUS_TONES,
  formatDuration,
  getAppointmentDetail,
} from '@/features/planning/data'

export const metadata: Metadata = { title: 'Fiche rendez-vous' }

/**
 * Fiche rendez-vous — Module 03 §26, §27.
 *
 * LE LIEN VERS LE TIERS N'EST PAS UN CONTOURNEMENT.
 *
 * §27 le demande — « Rendez-vous → Fournisseur A → Fiche fournisseur » — pour
 * conserver la continuité de la relation. La fiche de destination vérifie de
 * nouveau sa capacité, et le nom lui-même n'est lisible que si le répertoire
 * l'est : sinon l'écran affiche « Tiers non lisible », jamais un tiret.
 */
export default async function AppointmentDetailPage(
  props: PageProps<'/projets/rendez-vous/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.APPOINTMENTS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const appointment = await getAppointmentDetail(id)
  if (!appointment) notFound()

  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'

  const canUpdate = await can(PERMISSIONS.APPOINTMENTS_UPDATE)

  const [canReadClients, canReadSuppliers, canReadPartners] = await Promise.all([
    can(PERMISSIONS.CLIENTS_VIEW),
    can(PERMISSIONS.SUPPLIERS_VIEW),
    can(PERMISSIONS.PARTNERS_VIEW),
  ])

  if (editing) {
    const [users, clients, suppliers, partners] = await Promise.all([
      listAssignableUsers(),
      canReadClients ? listClientOptions() : Promise.resolve([]),
      canReadSuppliers ? listSupplierOptions() : Promise.resolve([]),
      canReadPartners ? listPartnerOptions() : Promise.resolve([]),
    ])

    return (
      <>
        <PageHeader
          title={appointment.subject}
          description="Modification de la fiche rendez-vous."
          actions={
            <Link
              href={`/projets/rendez-vous/${appointment.id}`}
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Retour à la fiche
            </Link>
          }
        />

        <Card>
          <AppointmentForm
            appointment={appointment}
            users={users}
            parties={{
              clients,
              suppliers,
              partners,
              canReadClients,
              canReadSuppliers,
              canReadPartners,
            }}
            defaultStartsAt=""
            cancelHref={`/projets/rendez-vous/${appointment.id}`}
          />
        </Card>
      </>
    )
  }

  const candidates = await listAssignableUsers()

  // §27 : la fiche du tiers, lorsqu'il est enregistré ET lisible.
  const partyHref = appointment.clientId
    ? canReadClients
      ? `/tiers/clients/${appointment.clientId}`
      : null
    : appointment.supplierId
      ? canReadSuppliers
        ? `/tiers/fournisseurs/${appointment.supplierId}`
        : null
      : appointment.partnerId
        ? canReadPartners
          ? `/tiers/partenaires/${appointment.partnerId}`
          : null
        : null

  return (
    <>
      <PageHeader
        title={appointment.subject}
        description={appointment.partyLabel ?? 'Aucun tiers enregistré.'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/projets/rendez-vous"
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Rendez-vous
            </Link>
            {canUpdate && appointment.status !== 'CANCELLED' && (
              <ButtonLink
                href={`/projets/rendez-vous/${appointment.id}?mode=edition`}
                tone="secondary"
                icon={Pencil}
              >
                Modifier
              </ButtonLink>
            )}
          </div>
        }
      />

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Le rendez-vous a été enregistré.
        </Notice>
      )}
      {justSaved && (
        <Notice tone="success" className="mb-5">
          Les modifications ont été enregistrées.
        </Notice>
      )}
      {appointment.status === 'CANCELLED' && (
        <Notice tone="info" className="mb-5">
          Ce rendez-vous est <strong>annulé</strong>. Il reste consultable et n’apparaît plus au
          calendrier.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Situation">
            <dl>
              <InfoRow label="État">
                <Badge tone={PLANNING_STATUS_TONES[appointment.status]}>
                  {APPOINTMENT_STATUS_LABELS[appointment.status]}
                </Badge>
                {appointment.statusReason && (
                  <p className="mt-1 text-xs text-muted">Motif : {appointment.statusReason}</p>
                )}
              </InfoRow>

              <InfoRow label="Date et heure">
                <span className="tabular">{formatDateTime(appointment.startsAt)}</span>
              </InfoRow>

              <InfoRow label="Durée">
                <span className="tabular">{formatDuration(appointment.durationMinutes)}</span>
              </InfoRow>

              <InfoRow label="Lieu">{appointment.location ?? <Empty />}</InfoRow>

              <InfoRow label="Tiers concerné" hint="La continuité de la relation (§27).">
                {appointment.partyLabel ? (
                  partyHref ? (
                    <Link href={partyHref} className="text-adikom-500 hover:underline">
                      {appointment.partyLabel}
                    </Link>
                  ) : (
                    appointment.partyLabel
                  )
                ) : (
                  <Empty />
                )}
              </InfoRow>

              <InfoRow label="Personne rencontrée">
                {appointment.externalContact ?? <Empty />}
              </InfoRow>

              <InfoRow label="Responsable">{appointment.ownerLabel ?? <Empty />}</InfoRow>

              <InfoRow label="Dernière modification">
                <span className="tabular">{formatDateTime(appointment.updatedAt)}</span>
              </InfoRow>
            </dl>
          </Card>

          <Card title="Notes" description="Ce qu’il faut préparer, ou ce qui s’est dit (§26).">
            {appointment.notes ? (
              <p className="whitespace-pre-line text-sm text-ink">{appointment.notes}</p>
            ) : (
              <p className="text-sm text-muted">Aucune note.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Participants" description="Qui s’y rend (§26).">
            <ParticipantsPanel
              kind={{ field: 'appointmentId', id: appointment.id }}
              ownerId={appointment.ownerId}
              participants={appointment.participants}
              candidates={candidates}
              canManage={canUpdate && appointment.status !== 'CANCELLED'}
            />
          </Card>

          {canUpdate && (
            <Card title="Changer l’état" description="Le changement est journalisé (§31).">
              <AppointmentStatusForm
                appointmentId={appointment.id}
                allowed={PLANNING_NEXT_STATUSES[appointment.status]}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
