import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarCheck,
  ClipboardCheck,
  KeyRound,
  Receipt,
  Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { formatPrice } from '@/features/pricing/constants'
import { listClientOptions } from '@/features/clients/data'
import { listCategoryOptions, listVehicleOptions } from '@/features/fleet/data'
import {
  displayStatus as reservationStatus,
  STATUS_LABELS as RESERVATION_LABELS,
  STATUS_TONES as RESERVATION_TONES,
  type ReservationListItem,
} from '@/features/reservations/data'
import {
  displayStatus as rentalStatus,
  STATUS_LABELS as RENTAL_LABELS,
  STATUS_TONES as RENTAL_TONES,
  type RentalListItem,
} from '@/features/rentals/data'
import { isToday, loadBoard } from '@/features/board/data'

export const metadata: Metadata = { title: 'Tableau de location' }

const WINDOWS = [
  { value: '1', label: 'Aujourd’hui' },
  { value: '7', label: '7 prochains jours' },
  { value: '30', label: '30 prochains jours' },
]

/**
 * Tableau de location — le poste de pilotage quotidien.
 *
 * Il ne décide de rien : il montre ce qui appelle une action, et renvoie vers
 * la fiche où le geste se fait. Aucun statut n'y est inventé, aucun montant
 * n'y est calculé (DEC-008 : les barèmes de durée, de retard et de frais ne
 * sont pas arrêtés).
 */
export default async function RentalBoardPage(props: PageProps<'/location'>) {
  await requirePermissionOrRedirect(PERMISSIONS.RENTAL_BOARD_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const days = Number(read('jours')) || 7
  const filters = {
    days: WINDOWS.some((w) => w.value === String(days)) ? days : 7,
    clientId: read('client') || undefined,
    vehicleId: read('vehicule') || undefined,
    categoryId: read('categorie') || undefined,
  }

  /*
   * Les listes de sélection lisent clients, parc et catégories, chacune sous
   * sa propre RLS. Sans le droit, elles reviendraient VIDES — et un menu vide
   * se lit « il n'y a aucun client » (DEC-017). Chaque filtre n'est donc
   * proposé qu'à qui peut en lire les valeurs.
   */
  const [canViewClients, canViewFleet] = await Promise.all([
    can(PERMISSIONS.CLIENTS_VIEW),
    can(PERMISSIONS.FLEET_VIEW),
  ])

  const [board, clients, vehicles, categories] = await Promise.all([
    loadBoard(filters),
    canViewClients ? listClientOptions() : Promise.resolve([]),
    canViewFleet ? listVehicleOptions() : Promise.resolve([]),
    canViewFleet ? listCategoryOptions() : Promise.resolve([]),
  ])

  const noAccess = board.upcomingReservations === null && board.running === null

  return (
    <>
      <PageHeader
        title="Tableau de location"
        description="Ce qui part, ce qui rentre, ce qui attend un contrôle. Aucun montant n’y est calculé."
      />

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select name="jours" defaultValue={String(filters.days)} aria-label="Fenêtre">
              {WINDOWS.map((window) => (
                <option key={window.value} value={window.value}>
                  {window.label}
                </option>
              ))}
            </Select>

            {canViewClients && (
              <Select name="client" defaultValue={filters.clientId ?? ''} aria-label="Client">
                <option value="">Tous les clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.label}
                  </option>
                ))}
              </Select>
            )}

            {canViewFleet && (
              <Select name="categorie" defaultValue={filters.categoryId ?? ''} aria-label="Catégorie">
                <option value="">Toutes les catégories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </Select>
            )}

            {canViewFleet && (
              <Select name="vehicule" defaultValue={filters.vehicleId ?? ''} aria-label="Véhicule">
                <option value="">Tous les véhicules</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.label}
                  </option>
                ))}
              </Select>
            )}

            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600 lg:col-start-4"
            >
              Filtrer
            </button>
          </div>

          {(filters.clientId || filters.vehicleId || filters.categoryId || filters.days !== 7) && (
            <p className="mt-3 text-xs text-muted">
              <Link href="/location" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            </p>
          )}
        </Card>
      </form>

      {noAccess && (
        <Notice tone="warning" className="mb-5">
          Vous accédez au tableau, mais aucune des ressources qu’il présente ne vous est ouverte :
          ni les réservations, ni les locations. Demandez ces permissions à votre administrateur —
          le tableau n’est pas vide, il est fermé.
        </Notice>
      )}

      <div className="space-y-5">
        <RentalGroup
          title="Départs à préparer"
          description="Contrats confirmés dont le départ approche ou est dépassé."
          icon={KeyRound}
          rows={board.startingSoon}
          missing="rental.rentals.view"
          empty="Aucun départ sur la fenêtre choisie."
          showAmounts={board.showAmounts}
          dateOf={(row) => row.plannedFrom}
          dateLabel="Départ prévu"
        />

        <RentalGroup
          title="En retard"
          description="Retour attendu dépassé. Le retard est constaté ; aucun frais n’est calculé."
          icon={AlertTriangle}
          tone="danger"
          rows={board.late}
          missing="rental.rentals.view"
          empty="Aucune location en retard."
          showAmounts={board.showAmounts}
          dateOf={(row) => row.expectedReturnAt}
          dateLabel="Retour attendu"
        />

        <RentalGroup
          title="Retours attendus"
          description="Véhicules à reprendre sur la fenêtre choisie."
          icon={Undo2}
          rows={board.returningSoon}
          missing="rental.rentals.view"
          empty="Aucun retour attendu sur la fenêtre choisie."
          showAmounts={board.showAmounts}
          dateOf={(row) => row.expectedReturnAt}
          dateLabel="Retour attendu"
        />

        <RentalGroup
          title="À contrôler"
          description="Véhicules rentrés dont l’état des lieux attend sa validation."
          icon={ClipboardCheck}
          tone="warning"
          rows={board.toControl}
          missing="rental.rentals.view"
          empty="Aucun contrôle en attente."
          showAmounts={board.showAmounts}
          dateOf={(row) => row.returnedAt ?? row.expectedReturnAt}
          dateLabel="Rentré le"
          href={(row) => `/location/locations/${row.id}?onglet=controle`}
        />

        <RentalGroup
          title="À facturer"
          description="Contrôle validé. La facturation relèvera de l’étape dédiée."
          icon={Receipt}
          rows={board.toInvoice}
          missing="rental.rentals.view"
          empty="Aucune location en attente de facturation."
          showAmounts={board.showAmounts}
          dateOf={(row) => row.returnedAt ?? row.expectedReturnAt}
          dateLabel="Rentré le"
        />

        <RentalGroup
          title="Locations en cours"
          description="Ensemble des véhicules actuellement sortis."
          icon={KeyRound}
          rows={board.running}
          missing="rental.rentals.view"
          empty="Aucune location en cours."
          showAmounts={board.showAmounts}
          dateOf={(row) => row.expectedReturnAt}
          dateLabel="Retour attendu"
        />

        <ReservationGroup
          title="Réservations à venir"
          description="Engagements confirmés qui deviendront des contrats."
          rows={board.upcomingReservations}
          empty="Aucune réservation sur la fenêtre choisie."
          showAmounts={board.showAmounts}
        />
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Groupes                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Un groupe de locations.
 *
 * `rows === null` signifie « pas la permission » et le DIT ; un tableau vide
 * signifie « rien à faire aujourd'hui ». Les confondre transformerait un refus
 * d'accès en information rassurante — exactement ce que DEC-017 proscrit.
 */
function RentalGroup({
  title,
  description,
  icon,
  tone,
  rows,
  missing,
  empty,
  showAmounts,
  dateOf,
  dateLabel,
  href,
}: {
  title: string
  description: string
  icon: LucideIcon
  tone?: 'danger' | 'warning'
  rows: RentalListItem[] | null
  missing: string
  empty: string
  showAmounts: boolean
  dateOf: (row: RentalListItem) => string
  dateLabel: string
  href?: (row: RentalListItem) => string
}) {
  if (rows === null) {
    return (
      <Card title={title} description={description}>
        <Notice tone="warning">
          Ces informations ne vous sont pas accessibles : la permission «{' '}
          <code className="tabular">{missing}</code> » ne vous est pas attribuée. Il ne s’agit pas
          d’une absence de données.
        </Notice>
      </Card>
    )
  }

  return (
    <Card
      title={title}
      description={description}
      actions={rows.length > 0 ? <Badge tone={tone ?? 'neutral'}>{rows.length}</Badge> : undefined}
    >
      {rows.length === 0 ? (
        <EmptyState icon={icon} title="Rien à traiter" description={empty} />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const shown = rentalStatus(row.status, row.expectedReturnAt)
            const date = dateOf(row)

            return (
              <li key={row.id}>
                <Link
                  href={href ? href(row) : `/location/locations/${row.id}`}
                  className="flex flex-col gap-2 rounded-control border border-line p-3 transition-colors hover:border-adikom-300 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{row.clientLabel}</p>
                    <p className="truncate text-xs text-muted">
                      <span className="tabular">{row.rentalNo}</span> · {row.vehicleLabel}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                    <span className="text-xs text-muted">
                      {dateLabel} : {formatDateTime(date)}
                      {isToday(date) ? ' · aujourd’hui' : ''}
                    </span>
                    {/* DEC-024 : sans le droit financier, RIEN — pas même un tiret. */}
                    {showAmounts && (
                      <span className="text-xs text-muted tabular">
                        {formatPrice(row.lockedAmount, row.lockedUnit)}
                      </span>
                    )}
                    <Badge tone={RENTAL_TONES[shown]}>{RENTAL_LABELS[shown]}</Badge>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function ReservationGroup({
  title,
  description,
  rows,
  empty,
  showAmounts,
}: {
  title: string
  description: string
  rows: ReservationListItem[] | null
  empty: string
  showAmounts: boolean
}) {
  if (rows === null) {
    return (
      <Card title={title} description={description}>
        <Notice tone="warning">
          Ces informations ne vous sont pas accessibles : la permission «{' '}
          <code className="tabular">rental.reservations.view</code> » ne vous est pas attribuée. Il
          ne s’agit pas d’une absence de données.
        </Notice>
      </Card>
    )
  }

  return (
    <Card
      title={title}
      description={description}
      actions={rows.length > 0 ? <Badge>{rows.length}</Badge> : undefined}
    >
      {rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Rien à venir" description={empty} />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const shown = reservationStatus(row.status, row.startsAt)

            return (
              <li key={row.id}>
                <Link
                  href={`/location/reservations/${row.id}`}
                  className="flex flex-col gap-2 rounded-control border border-line p-3 transition-colors hover:border-adikom-300 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{row.clientLabel}</p>
                    <p className="truncate text-xs text-muted">
                      <span className="tabular">{row.reservationNo}</span> ·{' '}
                      {row.vehicleLabel ?? row.categoryLabel ?? '—'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                    <span className="text-xs text-muted">
                      Début : {formatDateTime(row.startsAt)}
                      {isToday(row.startsAt) ? ' · aujourd’hui' : ''}
                    </span>
                    {showAmounts && row.lockedAmount != null && row.lockedUnit && (
                      <span className="text-xs text-muted tabular">
                        {formatPrice(row.lockedAmount, row.lockedUnit)}
                      </span>
                    )}
                    <Badge tone={RESERVATION_TONES[shown]}>{RESERVATION_LABELS[shown]}</Badge>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
