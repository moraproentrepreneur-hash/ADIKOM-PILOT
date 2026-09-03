import type { Metadata } from 'next'
import Link from 'next/link'
import { BellRing, CarFront, Wallet } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { getCurrentUser, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatAmount } from '@/lib/money'
import { formatDate, formatDateTime } from '@/lib/dates'
import { STATUS_LABELS as VEHICLE_LABELS, STATUS_TONES as VEHICLE_TONES } from '@/features/fleet/constants'
import type { VehicleStatus } from '@/features/fleet/constants'
import { DOCUMENT_LABELS } from '@/features/fleet/constants'
import { ACCOUNT_KIND_LABELS } from '@/features/treasury/constants'
import {
  DOCUMENT_HORIZON_DAYS,
  loadDashboard,
  type Dashboard,
  type Figure,
} from '@/features/dashboard/data'
import { AlertRow, Denied, Kpi, LoadError } from '@/features/dashboard/kpi'
import {
  PERIOD_KEYS,
  PERIOD_LABELS,
  describePeriod,
  resolvePeriod,
} from '@/features/dashboard/period'
import { QUICK_ACTIONS } from '@/features/dashboard/quick-actions'

export const metadata: Metadata = { title: 'Tableau de bord' }

/*
 * Le tableau de bord est un instantané, jamais une page mise en cache : deux
 * connexions à dix minutes d'intervalle ne doivent pas montrer les mêmes
 * retards (§24 — « éviter de donner l'impression qu'une donnée est en temps
 * réel si elle ne l'est pas », et réciproquement).
 */
export const dynamic = 'force-dynamic'

/** L'ordre d'affichage du parc : ce qui roule d'abord, ce qui dort ensuite. */
const FLEET_ORDER: VehicleStatus[] = [
  'AVAILABLE',
  'RESERVED',
  'RENTED',
  'MAINTENANCE',
  'IMMOBILIZED',
  'UNAVAILABLE',
  'RETIRED',
]

const kmf = (value: number) => formatAmount(value, { withCurrency: true })

/**
 * Tableau de bord — « Que dois-je savoir et que dois-je faire maintenant ? »
 * (Module 01 §34).
 *
 * IL NE DÉCIDE DE RIEN, ET NE CALCULE RIEN QUI LUI SOIT PROPRE.
 *
 * Chaque chiffre vient des fonctions de la migration 055 ou des modules
 * eux-mêmes ; chaque carte renvoie vers l'écran où le geste se fait. Aucun
 * indicateur n'est stocké : tout est refait à la lecture.
 *
 * CE QUE L'UTILISATEUR VOIT DÉPEND DE CE QU'IL A LE DROIT DE VOIR (§27).
 *
 * Les sections ne sont pas seulement masquées : les fonctions qui les
 * alimentent REFUSENT côté serveur (§28). Masquer une carte n'est pas une
 * protection — c'est la conséquence visible d'une protection posée ailleurs.
 */
export default async function DashboardPage(props: PageProps<'/tableau-de-bord'>) {
  await requirePermissionOrRedirect(PERMISSIONS.DASHBOARD_VIEW)

  const searchParams = await props.searchParams
  const raw = searchParams.periode
  const period = resolvePeriod(typeof raw === 'string' ? raw : undefined)

  const [user, board] = await Promise.all([getCurrentUser(), loadDashboard(period)])

  const allowed = new Set(board.quickActions)
  const actions = QUICK_ACTIONS.filter((action) => allowed.has(action.code))

  return (
    <>
      <PageHeader
        title={`Bonjour ${user?.firstName ?? ''}`.trim()}
        description="Ce qu’il faut savoir, et ce qu’il faut faire maintenant."
      />

      {/* --- En-tête de pilotage : la période analysée (§5, §8) ------------- */}
      <nav aria-label="Période analysée" className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_KEYS.map((key) => (
            <Link
              key={key}
              href={`/tableau-de-bord?periode=${key}`}
              aria-current={period.key === key ? 'page' : undefined}
              className={
                period.key === key
                  ? 'rounded-control bg-adikom-500 px-3.5 py-2 text-sm font-medium text-white'
                  : 'rounded-control border border-line bg-white px-3.5 py-2 text-sm text-muted transition-colors hover:border-adikom-300 hover:text-adikom-500'
              }
            >
              {PERIOD_LABELS[key]}
            </Link>
          ))}
          <p className="ml-auto text-xs text-muted">
            Période analysée : {describePeriod(period)}. Les files d’attente, le parc et les
            créances sont des situations actuelles — la période ne s’y applique pas.
          </p>
        </div>
      </nav>

      <ClosedNotice board={board} />

      {/* --- Alertes & échéances (§19) — d'abord, parce qu'elles pressent --- */}
      <Alerts board={board} />

      {/* --- Activité de location (§9) -------------------------------------- */}
      <section aria-labelledby="exploitation" className="mb-6">
        <h2 id="exploitation" className="mb-3 font-display text-sm font-semibold text-ink">
          Activité de location
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Kpi
            label="Locations en cours"
            figure={pick(board.operations, (o) => o.running)}
            hint="Véhicules actuellement sortis."
            href="/location/locations?statut=IN_PROGRESS"
          />
          <Kpi
            label="Départs du jour"
            figure={pick(board.operations, (o) => o.startingToday)}
            hint="Contrats confirmés dont le départ est prévu aujourd’hui."
            href="/location?jours=1"
          />
          <Kpi
            label="Retours du jour"
            figure={pick(board.operations, (o) => o.returningToday)}
            hint="Retards du jour compris."
            href="/location?jours=1"
          />
          <Kpi
            label="Retours en retard"
            figure={pick(board.operations, (o) => o.late)}
            hint="Échéance de retour dépassée. Aucun frais n’est calculé (DEC-008)."
            href="/location/locations?statut=LATE"
            level="urgent"
          />
          <Kpi
            label="À contrôler"
            figure={pick(board.operations, (o) => o.toControl)}
            hint="Véhicules rentrés dont l’état des lieux attend sa validation."
            href="/location/locations?statut=TO_CONTROL"
            level="important"
          />
          <Kpi
            label="À facturer"
            figure={pick(board.operations, (o) => o.toInvoice)}
            hint="Contrôle validé, facture client à établir."
            href="/location/locations?statut=TO_INVOICE"
            level="watch"
          />
          <Kpi
            label="Réservations à venir"
            figure={pick(board.reservations, (r) => r.upcoming)}
            hint="Engagements confirmés sur les 7 prochains jours."
            href="/location/reservations?statut=CONFIRMED"
          />
          <Kpi
            label="Réservations du jour"
            figure={pick(board.reservations, (r) => r.startingToday)}
            hint="Départs prévus aujourd’hui."
            href="/location?jours=1"
          />
        </div>
      </section>

      {/* --- État du parc (§12) --------------------------------------------- */}
      <section aria-labelledby="parc" className="mb-6">
        <h2 id="parc" className="mb-3 font-display text-sm font-semibold text-ink">
          État du parc
        </h2>
        <Card>
          {board.fleet.state === 'denied' && <Denied missing={board.fleet.missing} />}
          {board.fleet.state === 'error' && <LoadError what="L’état du parc" />}
          {board.fleet.state === 'ok' && <FleetGrid overview={board.fleet.value} />}
        </Card>
      </section>

      {/* --- Finance (§15, §16, §17) ---------------------------------------- */}
      <section aria-labelledby="finance" className="mb-6">
        <h2 id="finance" className="mb-3 font-display text-sm font-semibold text-ink">
          Finance
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Facturé sur la période"
            figure={board.invoiced}
            format={kmf}
            hint={`Factures clients émises ${describePeriod(period)}.`}
            href={`/facturation/clients?du=${period.from}&au=${period.to}&statut=ISSUED`}
          />
          <Kpi
            label="Encaissé sur la période"
            figure={board.collected}
            format={kmf}
            hint={`Règlements reçus ${describePeriod(period)}.`}
          />
          <Kpi
            label="Reste à encaisser"
            figure={pick(board.receivables, (r) => r.amount)}
            format={kmf}
            hint={
              board.receivables.state === 'ok'
                ? `${board.receivables.value.invoiceCount} facture(s) client(s) non soldée(s), toutes périodes.`
                : undefined
            }
            href="/facturation/clients?impayees=1"
          />
          <Kpi
            label="Reste à payer aux fournisseurs"
            figure={pick(board.payables, (p) => p.amount)}
            format={kmf}
            hint={
              board.payables.state === 'ok'
                ? `${board.payables.value.invoiceCount} facture(s) fournisseur(s) — imputations déduites.`
                : undefined
            }
            href="/facturation/fournisseurs?impayees=1"
          />
        </div>

        <div className="mt-3">
          <Card
            title="Banques &amp; Caisses"
            description="Soldes des comptes actifs — solde initial, entrées et sorties validées."
          >
            {board.treasury.state === 'denied' && <Denied missing={board.treasury.missing} />}
            {board.treasury.state === 'error' && <LoadError what="Les soldes" />}
            {board.treasury.state === 'ok' &&
              (board.treasury.value.accounts.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="Aucun compte actif"
                  description="Les règlements supposent un compte bancaire ou une caisse ouverte."
                />
              ) : (
                <>
                  <ul className="space-y-2">
                    {board.treasury.value.accounts.map((account) => (
                      <li key={account.id}>
                        <Link
                          href={`/tresorerie/comptes/${account.id}`}
                          className="flex flex-col gap-1 rounded-control border border-line p-3 transition-colors hover:border-adikom-300 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">
                              {account.label}
                            </p>
                            <p className="truncate text-xs text-muted">
                              {ACCOUNT_KIND_LABELS[account.kind]}
                              {account.institution ? ` · ${account.institution}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-medium text-ink tabular">
                            {kmf(account.balance ?? 0)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
                    <span className="font-medium text-ink">Total disponible</span>
                    <span className="font-display font-semibold text-ink tabular">
                      {kmf(board.treasury.value.total)}
                    </span>
                  </p>
                </>
              ))}
          </Card>
        </div>
      </section>

      {/* --- Activité de la période (§6) ------------------------------------ */}
      <section aria-labelledby="activite" className="mb-6">
        <h2 id="activite" className="mb-3 font-display text-sm font-semibold text-ink">
          Activité {describePeriod(period)}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Nouveaux clients" figure={board.activity.clients} />
          <Kpi label="Nouvelles réservations" figure={board.activity.reservations} />
          <Kpi label="Nouvelles locations" figure={board.activity.rentals} />
          <Kpi label="Nouvelles factures clients" figure={board.activity.invoices} />
        </div>
      </section>

      {/* --- Actions rapides (§22) ------------------------------------------ */}
      {actions.length > 0 && (
        <section aria-labelledby="actions" className="mb-2">
          <h2 id="actions" className="mb-3 font-display text-sm font-semibold text-ink">
            Actions rapides
          </h2>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <ButtonLink key={action.code} href={action.href} tone="secondary">
                {action.label}
              </ButtonLink>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Lire un champ d'un indicateur sans perdre son état                         */
/* -------------------------------------------------------------------------- */

/**
 * Un refus ou une erreur se PROPAGE au champ qu'on en extrait.
 *
 * Sans cela, une lecture refusée deviendrait `0` en traversant un accesseur —
 * et le tableau afficherait « 0 retard » à qui n'a pas le droit de compter les
 * locations (DEC-017).
 */
function pick<T>(figure: Figure<T>, read: (value: T) => number): Figure<number> {
  return figure.state === 'ok' ? { state: 'ok', value: read(figure.value) } : figure
}

/* -------------------------------------------------------------------------- */
/*  Le cas où rien n'est ouvert                                                */
/* -------------------------------------------------------------------------- */

/**
 * `dashboard.view` seule n'ouvre rien.
 *
 * C'est voulu : la capacité autorise l'écran, pas les données qu'il résume
 * (DEC-024). Un utilisateur qui n'aurait qu'elle verrait une page entièrement
 * verrouillée — il faut donc le lui DIRE, plutôt que de le laisser croire que
 * l'entreprise n'a aucune activité.
 */
function ClosedNotice({ board }: { board: Dashboard }) {
  const sections: Figure<unknown>[] = [
    board.operations,
    board.reservations,
    board.fleet,
    board.invoiced,
    board.collected,
    board.receivables,
    board.payables,
    board.treasury,
    board.activity.clients,
    board.activity.reservations,
    board.activity.rentals,
    board.activity.invoices,
    board.lateRentals,
    board.expiringDocuments,
    board.maintenanceRunning,
  ]

  if (sections.some((section) => section.state === 'ok')) return null

  return (
    <Notice tone="warning" className="mb-6">
      Vous accédez au tableau de bord, mais aucun des indicateurs qu’il présente ne vous est
      ouvert. Il n’est pas vide : il est fermé. Demandez à votre administrateur les permissions
      des modules que vous devez suivre.
    </Notice>
  )
}

/* -------------------------------------------------------------------------- */
/*  Alertes & échéances — §14, §19, §20                                        */
/* -------------------------------------------------------------------------- */

function Alerts({ board }: { board: Dashboard }) {
  const rows: React.ReactElement[] = []

  if (board.operations.state === 'ok' && board.operations.value.late > 0) {
    rows.push(
      <AlertRow
        key="late"
        level="urgent"
        title={`${board.operations.value.late} retour(s) en retard`}
        detail="Échéance de retour dépassée. Le retard est constaté, aucun frais n’est calculé."
        href="/location/locations?statut=LATE"
      />
    )
  }

  if (board.lateRentals.state === 'ok') {
    for (const rental of board.lateRentals.value) {
      rows.push(
        <AlertRow
          key={rental.id}
          level="urgent"
          title={`${rental.clientLabel} — ${rental.vehicleLabel}`}
          detail={`${rental.rentalNo} · retour attendu le ${formatDateTime(rental.expectedReturnAt)}`}
          href={`/location/locations/${rental.id}`}
        />
      )
    }
  }

  if (board.receivables.state === 'ok' && board.receivables.value.overdueCount > 0) {
    rows.push(
      <AlertRow
        key="receivables"
        level="urgent"
        title={`${board.receivables.value.overdueCount} facture(s) client(s) en retard`}
        detail={`${kmf(board.receivables.value.overdueAmount)} dont l’échéance est dépassée.`}
        href="/facturation/clients?statut=OVERDUE"
      />
    )
  }

  if (board.payables.state === 'ok' && board.payables.value.overdueCount > 0) {
    rows.push(
      <AlertRow
        key="payables"
        level="important"
        title={`${board.payables.value.overdueCount} facture(s) fournisseur(s) échue(s)`}
        detail={`${kmf(board.payables.value.overdueAmount)} restant dus, imputations déduites.`}
        href="/facturation/fournisseurs?statut=OVERDUE"
      />
    )
  }

  if (board.expiringDocuments.state === 'ok') {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Comoro' })
    for (const doc of board.expiringDocuments.value) {
      const expired = doc.expiresOn < today
      rows.push(
        <AlertRow
          key={doc.id}
          level={expired ? 'important' : 'watch'}
          title={`${DOCUMENT_LABELS[doc.docType]} — ${doc.vehicleLabel}`}
          detail={
            expired
              ? `${doc.label} · expiré depuis le ${formatDate(doc.expiresOn)}`
              : `${doc.label} · expire le ${formatDate(doc.expiresOn)}`
          }
          href={`/location/parc/${doc.vehicleId}?onglet=documents`}
        />
      )
    }
  }

  if (board.fleet.state === 'ok' && board.fleet.value.IMMOBILIZED > 0) {
    rows.push(
      <AlertRow
        key="immobilized"
        level="watch"
        title={`${board.fleet.value.IMMOBILIZED} véhicule(s) immobilisé(s)`}
        detail="Hors exploitation : ils ne peuvent pas être loués."
        href="/location/parc?statut=IMMOBILIZED"
      />
    )
  }

  if (board.maintenanceRunning.state === 'ok' && board.maintenanceRunning.value > 0) {
    rows.push(
      <AlertRow
        key="maintenance"
        level="watch"
        title={`${board.maintenanceRunning.value} maintenance(s) ouverte(s)`}
        detail="Planifiées, à diagnostiquer, en cours ou en attente."
        href="/location/maintenance"
      />
    )
  }

  const blocked = [
    board.operations,
    board.receivables,
    board.payables,
    board.expiringDocuments,
    board.fleet,
    board.maintenanceRunning,
  ].filter((section) => section.state !== 'ok')

  return (
    <section aria-labelledby="alertes" className="mb-6">
      <h2 id="alertes" className="mb-3 font-display text-sm font-semibold text-ink">
        Alertes &amp; échéances
      </h2>
      <Card
        actions={rows.length > 0 ? <Badge tone="danger">{rows.length}</Badge> : undefined}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={BellRing}
            title="Rien qui presse"
            description={
              blocked.length === 0
                ? `Aucun retard, aucune échéance dépassée, aucun document expirant sous ${DOCUMENT_HORIZON_DAYS} jours.`
                : 'Aucune alerte parmi les données qui vous sont accessibles. D’autres sources ne le sont pas.'
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <li key={index}>{row}</li>
            ))}
          </ul>
        )}

        {blocked.length > 0 && (
          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
            Certaines sources d’alerte ne sont pas lisibles avec vos permissions — retards,
            échéances de factures, documents de véhicule ou maintenances selon les cas. Les
            alertes correspondantes ne sont donc pas absentes : elles ne sont pas mesurées.
          </p>
        )}
      </Card>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  État du parc — §12                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Sept statuts, toujours les sept.
 *
 * Un statut à zéro reste affiché : « aucun véhicule en maintenance » est une
 * information utile, et la faire disparaître obligerait le lecteur à se
 * souvenir de ce qui manque. Le statut décrit une situation ; il ne dit rien de
 * la disponibilité, qui se lit au calendrier (Règles parc §69).
 */
function FleetGrid({ overview }: { overview: Record<VehicleStatus, number> }) {
  const total = FLEET_ORDER.reduce((acc, status) => acc + overview[status], 0)

  if (total === 0) {
    return (
      <EmptyState
        icon={CarFront}
        title="Aucun véhicule au parc"
        description="Les indicateurs d’exploitation resteront à zéro tant qu’aucun véhicule n’est enregistré."
      />
    )
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FLEET_ORDER.map((status) => (
          <li key={status}>
            <Link
              href={`/location/parc?statut=${status}`}
              className="flex items-center justify-between gap-2 rounded-control border border-line p-3 transition-colors hover:border-adikom-300"
            >
              <Badge tone={VEHICLE_TONES[status]}>{VEHICLE_LABELS[status]}</Badge>
              <span className="font-display text-lg font-semibold text-ink tabular">
                {overview[status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
        {total} véhicule(s) au parc. Un statut décrit une situation : un véhicule « Disponible »
        aujourd’hui peut être réservé demain — la disponibilité se lit au calendrier.
      </p>
    </>
  )
}

