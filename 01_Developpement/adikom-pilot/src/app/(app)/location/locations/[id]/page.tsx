import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Badge, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime, formatPeriod } from '@/lib/dates'
import { formatPrice, SOURCE_LABELS, type PricingSource } from '@/features/pricing/constants'
import {
  displayStatus,
  getRentalDetail,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/rentals/data'
import {
  CancelRentalPanel,
  ConfirmRentalPanel,
} from '@/features/rentals/rental-actions-panel'

export const metadata: Metadata = { title: 'Location' }

export default async function RentalDetailPage(props: PageProps<'/location/locations/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.RENTALS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const rental = await getRentalDetail(id)
  if (!rental) notFound()

  const justCreated = searchParams.cree === '1'

  const [canUpdate, canCancel, canSeeAmounts, canViewReservation] = await Promise.all([
    can(PERMISSIONS.RENTALS_UPDATE),
    can(PERMISSIONS.RENTALS_CANCEL),
    can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
    can(PERMISSIONS.RESERVATIONS_VIEW),
  ])

  const shown = displayStatus(rental.status, rental.expectedReturnAt)
  const beforeDeparture = rental.status === 'PREPARING' || rental.status === 'CONFIRMED'

  const tabs: TabItem[] = [
    { key: 'informations', label: 'Informations', href: `/location/locations/${id}` },
    { key: 'etats', label: 'États des lieux', planned: true },
    { key: 'historique', label: 'Historique', planned: true },
  ]

  return (
    <>
      <Link
        href="/location/locations"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Contrat créé à partir de la réservation. Son identifiant est{' '}
          <strong>{rental.rentalNo}</strong>. Le tarif verrouillé et l’engagement du véhicule ont
          été repris sans interruption.
        </Notice>
      )}

      <PageHeader title={rental.clientLabel} description={rental.rentalNo} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[shown]}>{STATUS_LABELS[shown]}</Badge>
        <span className="text-sm text-muted">
          {formatPeriod(rental.plannedFrom, rental.plannedTo)}
        </span>
      </div>

      <Tabs items={tabs} current="informations" />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Contrat">
            <dl>
              <InfoRow label="Client">{rental.clientLabel}</InfoRow>
              <InfoRow label="Véhicule">
                <Link
                  href={`/location/parc/${rental.vehicleId}`}
                  className="text-adikom-500 hover:underline"
                >
                  {rental.vehicleLabel}
                </Link>
              </InfoRow>
              <InfoRow label="Période prévue">
                {formatPeriod(rental.plannedFrom, rental.plannedTo)}
              </InfoRow>
              <InfoRow label="Retour attendu">{formatDateTime(rental.expectedReturnAt)}</InfoRow>
              <InfoRow label="Départ réel">
                {rental.startedAt ? formatDateTime(rental.startedAt) : <Empty />}
              </InfoRow>
              <InfoRow label="Retour réel">
                {rental.returnedAt ? formatDateTime(rental.returnedAt) : <Empty />}
              </InfoRow>
            </dl>
          </Card>

          {/*
            Le tarif n'apparaît qu'avec la permission financière. Sans elle la
            carte DISPARAÎT : afficher « — » laisserait croire qu'aucun tarif
            n'a été verrouillé, alors qu'une location en porte toujours un
            (DEC-017, DEC-024).
          */}
          {canSeeAmounts && (
            <Card
              title="Tarif verrouillé"
              description="Repris de la réservation, jamais résolu de nouveau."
            >
              <dl>
                <InfoRow label="Montant">
                  <span className="tabular">
                    {formatPrice(rental.lockedAmount, rental.lockedUnit)}
                  </span>
                </InfoRow>
                <InfoRow label="Origine du tarif">
                  {rental.lockedSource
                    ? (SOURCE_LABELS[rental.lockedSource as PricingSource] ?? rental.lockedSource)
                    : <Empty />}
                </InfoRow>
                <InfoRow label="Verrouillé le">{formatDateTime(rental.lockedAt)}</InfoRow>
              </dl>
            </Card>
          )}

          {(rental.conditions || rental.notes) && (
            <Card title="Conditions et observations">
              <dl>
                <InfoRow label="Conditions particulières">
                  {rental.conditions ?? <Empty />}
                </InfoRow>
                <InfoRow label="Notes internes">{rental.notes ?? <Empty />}</InfoRow>
              </dl>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Fiche">
            <dl>
              <InfoRow label="Identifiant">
                <span className="tabular">{rental.rentalNo}</span>
              </InfoRow>
              <InfoRow label="Statut">
                <Badge tone={STATUS_TONES[shown]}>{STATUS_LABELS[shown]}</Badge>
              </InfoRow>
              {rental.statusReason && (
                <InfoRow label="Motif" hint={formatDate(rental.statusChangedAt) ?? undefined}>
                  {rental.statusReason}
                </InfoRow>
              )}
              {/*
                La réservation d'origine n'est nommée qu'à qui a le droit de
                consulter les réservations : sans cela, la ligne se tait plutôt
                que d'afficher un tiret trompeur.
              */}
              {rental.reservationId && canViewReservation && (
                <InfoRow label="Réservation d’origine">
                  <Link
                    href={`/location/reservations/${rental.reservationId}`}
                    className="text-adikom-500 hover:underline tabular"
                  >
                    {rental.reservationNo}
                  </Link>
                </InfoRow>
              )}
              <InfoRow label="Créée le">{formatDateTime(rental.createdAt)}</InfoRow>
              <InfoRow label="Modifiée le">{formatDateTime(rental.updatedAt)}</InfoRow>
            </dl>
          </Card>

          {canUpdate && rental.status === 'PREPARING' && (
            <Card title="Confirmer le contrat" description="Le contrat est prêt pour le départ.">
              <ConfirmRentalPanel rentalId={id} />
            </Card>
          )}

          {canCancel && beforeDeparture && (
            <Card title="Annuler" description="Possible tant que la location n’est pas partie.">
              <CancelRentalPanel rentalId={id} />
            </Card>
          )}

          <Card title="Étape suivante">
            <p className="text-sm text-muted">
              Le départ, l’état des lieux et les photos relèvent du lot suivant. Le retour et le
              contrôle viendront ensuite.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
