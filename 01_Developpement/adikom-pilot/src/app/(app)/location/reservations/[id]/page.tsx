import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'

import { Badge, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime, formatPeriod } from '@/lib/dates'
import { formatPrice, SOURCE_LABELS, type PricingSource } from '@/features/pricing/constants'
import { listClientOptions } from '@/features/clients/data'
import { listCategoryOptions, listVehicleOptions } from '@/features/fleet/data'
import {
  displayStatus,
  getReservationDetail,
  listAvailableVehicles,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/reservations/data'
import { ReservationForm } from '@/features/reservations/reservation-form'
import { CancelPanel, ConfirmPanel } from '@/features/reservations/confirm-panel'
import { ConvertPanel } from '@/features/rentals/rental-actions-panel'

export const metadata: Metadata = { title: 'Réservation' }

export default async function ReservationDetailPage(
  props: PageProps<'/location/reservations/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.RESERVATIONS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const reservation = await getReservationDetail(id)
  if (!reservation) notFound()

  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'

  const [canUpdate, canConfirm, canCancel, canSeeAmounts, canConvert] = await Promise.all([
    can(PERMISSIONS.RESERVATIONS_UPDATE),
    can(PERMISSIONS.RESERVATIONS_CONFIRM),
    can(PERMISSIONS.RESERVATIONS_CANCEL),
    // DEC-024 : le montant verrouillé est une information distincte.
    can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
    // Créer une location est une capacité du module Locations, pas des
    // réservations : c'est bien `rental.rentals.create` qui l'ouvre.
    can(PERMISSIONS.RENTALS_CREATE),
  ])

  const shown = displayStatus(reservation.status, reservation.startsAt)
  const isOpen = reservation.status === 'DRAFT' || reservation.status === 'PENDING'
  const isEngaged = reservation.status === 'CONFIRMED' || reservation.status === 'PREPARING'
  const isCancellable = isOpen || isEngaged
  // Seule une réservation engagée — véhicule affecté, tarif verrouillé — peut
  // devenir un contrat. La base l'impose également.
  const isConvertible = isEngaged && !reservation.rentalId

  return (
    <>
      <Link
        href="/location/reservations"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Réservation créée. Son identifiant est <strong>{reservation.reservationNo}</strong>.
          Confirmez-la pour engager un véhicule et verrouiller le tarif.
        </Notice>
      )}

      {justSaved && (
        <Notice tone="success" className="mb-5">
          Les informations de la réservation ont été enregistrées.
        </Notice>
      )}

      <PageHeader
        title={reservation.clientLabel}
        description={reservation.reservationNo}
        actions={
          canUpdate && isOpen && !editing ? (
            <Link
              href={`/location/reservations/${id}?mode=edition`}
              className="inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
            >
              <Pencil className="size-4" aria-hidden />
              Modifier
            </Link>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[shown]}>{STATUS_LABELS[shown]}</Badge>
        <span className="text-sm text-muted">{formatPeriod(reservation.startsAt, reservation.endsAt)}</span>
      </div>

      {editing && canUpdate && isOpen ? (
        <EditCard reservation={reservation} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card title="Engagement">
              <dl>
                <InfoRow label="Client">{reservation.clientLabel}</InfoRow>
                <InfoRow label="Période">
                  {formatPeriod(reservation.startsAt, reservation.endsAt)}
                </InfoRow>
                <InfoRow label="Catégorie">{reservation.categoryLabel ?? <Empty />}</InfoRow>
                <InfoRow label="Véhicule">
                  {reservation.vehicleId && reservation.vehicleLabel ? (
                    <Link
                      href={`/location/parc/${reservation.vehicleId}`}
                      className="text-adikom-500 hover:underline"
                    >
                      {reservation.vehicleLabel}
                    </Link>
                  ) : (
                    <Empty />
                  )}
                </InfoRow>
              </dl>
            </Card>

            {/*
              Le tarif verrouillé n'apparaît qu'avec la permission financière.
              Sans elle, la carte DISPARAÎT : afficher « — » laisserait croire
              qu'aucun tarif n'a été verrouillé (DEC-017).
            */}
            {canSeeAmounts && (
              <Card
                title="Tarif verrouillé"
                description="Copié à la confirmation. Une modification de la grille ne l’atteint plus."
              >
                {reservation.lockedAmount != null && reservation.lockedUnit ? (
                  <dl>
                    <InfoRow label="Montant">
                      <span className="tabular">
                        {formatPrice(reservation.lockedAmount, reservation.lockedUnit)}
                      </span>
                    </InfoRow>
                    <InfoRow label="Origine du tarif">
                      {reservation.lockedSource
                        ? (SOURCE_LABELS[reservation.lockedSource as PricingSource] ??
                          reservation.lockedSource)
                        : <Empty />}
                    </InfoRow>
                    <InfoRow label="Verrouillé le">
                      {formatDateTime(reservation.lockedAt) ?? <Empty />}
                    </InfoRow>
                  </dl>
                ) : (
                  <p className="text-sm text-muted">
                    Aucun tarif n’est encore verrouillé : il le sera à la confirmation.
                  </p>
                )}
              </Card>
            )}

            {(reservation.conditions || reservation.notes) && (
              <Card title="Conditions et observations">
                <dl>
                  <InfoRow label="Conditions particulières">
                    {reservation.conditions ?? <Empty />}
                  </InfoRow>
                  <InfoRow label="Notes internes">{reservation.notes ?? <Empty />}</InfoRow>
                </dl>
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card title="Fiche">
              <dl>
                <InfoRow label="Identifiant">
                  <span className="tabular">{reservation.reservationNo}</span>
                </InfoRow>
                <InfoRow label="Statut">
                  <Badge tone={STATUS_TONES[shown]}>{STATUS_LABELS[shown]}</Badge>
                </InfoRow>
                {reservation.statusReason && (
                  <InfoRow label="Motif" hint={formatDate(reservation.statusChangedAt) ?? undefined}>
                    {reservation.statusReason}
                  </InfoRow>
                )}
                {reservation.rentalId && reservation.rentalNo && (
                  <InfoRow label="Location">
                    <span className="tabular">{reservation.rentalNo}</span>
                  </InfoRow>
                )}
                <InfoRow label="Créée le">{formatDateTime(reservation.createdAt)}</InfoRow>
                <InfoRow label="Modifiée le">{formatDateTime(reservation.updatedAt)}</InfoRow>
              </dl>
            </Card>

            {canConfirm && isOpen && (
              <Card
                title="Confirmer"
                description="Engage le véhicule sur la période et verrouille le tarif."
              >
                <ConfirmSection reservation={reservation} />
              </Card>
            )}

            {canConvert && isConvertible && (
              <Card
                title="Convertir en location"
                description="Le contrat reprend le tarif verrouillé et l’engagement en cours."
              >
                <ConvertPanel reservationId={id} />
              </Card>
            )}

            {canCancel && isCancellable && (
              <Card title="Annuler" description="Le véhicule est libéré ; la fiche est conservée.">
                <CancelPanel reservationId={id} />
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** Formulaire de modification, réservé aux réservations non encore engagées. */
async function EditCard({
  reservation,
}: {
  reservation: NonNullable<Awaited<ReturnType<typeof getReservationDetail>>>
}) {
  const [canViewClients, canViewFleet] = await Promise.all([
    can(PERMISSIONS.CLIENTS_VIEW),
    can(PERMISSIONS.FLEET_VIEW),
  ])

  // Même raison qu'à la création : des listes vides mentiraient (DEC-017).
  if (!canViewClients || !canViewFleet) {
    return (
      <Notice tone="warning">
        Modifier une réservation suppose de pouvoir consulter les clients et le parc automobile.
        Ces droits ne vous sont pas tous attribués.
      </Notice>
    )
  }

  const [clients, categories, vehicles] = await Promise.all([
    listClientOptions(),
    listCategoryOptions(),
    listVehicleOptions(),
  ])

  return (
    <Card className="max-w-4xl">
      <ReservationForm
        mode="edit"
        reservation={reservation}
        clients={clients}
        categories={categories}
        vehicles={vehicles}
      />
    </Card>
  )
}

/** Recherche de disponibilité réelle, calculée depuis le calendrier. */
async function ConfirmSection({
  reservation,
}: {
  reservation: NonNullable<Awaited<ReturnType<typeof getReservationDetail>>>
}) {
  /*
   * La recherche lit le parc, filtré par RLS. Sans `rental.fleet.view` elle
   * ne renverrait rien, et « aucun véhicule disponible » se lirait comme un
   * fait alors que c'est un refus d'accès (DEC-017).
   */
  if (!(await can(PERMISSIONS.FLEET_VIEW))) {
    return (
      <Notice tone="warning">
        Confirmer une réservation suppose de pouvoir consulter le parc automobile, afin de choisir
        un véhicule réellement disponible. Ce droit ne vous est pas attribué.
      </Notice>
    )
  }

  const vehicles = await listAvailableVehicles(
    reservation.startsAt,
    reservation.endsAt,
    // Un véhicule imposé prime sur la catégorie : on vérifie sa disponibilité,
    // pas celle de sa famille.
    reservation.vehicleId ? null : reservation.categoryId
  )

  return (
    <ConfirmPanel
      reservationId={reservation.id}
      vehicles={vehicles}
      imposedVehicleId={reservation.vehicleId}
    />
  )
}
