import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  ClipboardCheck,
  Image as ImageIcon,
  KeyRound,
  Receipt,
  TriangleAlert,
  Undo2,
} from 'lucide-react'

import {
  Badge,
  ButtonLink,
  Card,
  Empty,
  EmptyState,
  InfoRow,
  PageHeader,
} from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime, formatPeriod } from '@/lib/dates'
import { formatPrice, SOURCE_LABELS, type PricingSource } from '@/features/pricing/constants'
import {
  calendarDaysUntil,
  displayStatus,
  FUEL_LEVEL_LABELS,
  getRentalDetail,
  INSPECTION_LABELS,
  listInspections,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/rentals/data'
import {
  CancelRentalPanel,
  ConfirmRentalPanel,
} from '@/features/rentals/rental-actions-panel'
import { ExtendPanel } from '@/features/rentals/extend-panel'
import { ControlPanel } from '@/features/rentals/control-panel'
import { CloseRentalPanel } from '@/features/rentals/close-panel'
import { getInvoiceForRental } from '@/features/customer-invoices/data'
import {
  CUSTOMER_INVOICE_STATUS_LABELS,
  CUSTOMER_INVOICE_STATUS_TONES,
  displayStatus as displayInvoiceStatus,
  formatAmount,
} from '@/features/customer-invoices/constants'

export const metadata: Metadata = { title: 'Location' }

/** « Contrat. » · « Contrat et bon de départ. » · « A, B et C. » */
function enumerate(items: string[]): string {
  if (items.length === 1) return `${items[0]}.`
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}.`
}

export default async function RentalDetailPage(props: PageProps<'/location/locations/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.RENTALS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const rental = await getRentalDetail(id)
  if (!rental) notFound()

  const justCreated = searchParams.cree === '1'
  const justLeft = searchParams.parti === '1'
  const rejectedPhotos = Number(
    typeof searchParams.photos === 'string' ? searchParams.photos : 0
  )
  const requestedTab = typeof searchParams.onglet === 'string' ? searchParams.onglet : 'informations'

  const [
    canUpdate,
    canCancel,
    canCheckout,
    canExtend,
    canReturn,
    canClose,
    canSeeAmounts,
    canViewReservation,
  ] = await Promise.all([
    can(PERMISSIONS.RENTALS_UPDATE),
    can(PERMISSIONS.RENTALS_CANCEL),
    can(PERMISSIONS.RENTALS_CHECKOUT),
    can(PERMISSIONS.RENTALS_EXTEND),
    can(PERMISSIONS.RENTALS_RETURN),
    // DEC-025 §b : valider le contrôle relève de `close`, sans permission
    // de contrôle distincte.
    can(PERMISSIONS.RENTALS_CLOSE),
    can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
    can(PERMISSIONS.RESERVATIONS_VIEW),
  ])

  // DEC-024 : produire un document et l'imprimer sont deux capacités
  // distinctes de la consultation, attribuables séparément.
  const [canDownload, canPrint] = await Promise.all([
    can(PERMISSIONS.RENTALS_DOWNLOAD),
    can(PERMISSIONS.RENTALS_PRINT),
  ])

  // Déclarer un incident relève du module Incidents, pas des locations : un
  // exploitant peut suivre un contrat sans avoir le droit d'ouvrir un constat.
  const canDeclareIncident = await can(PERMISSIONS.INCIDENTS_CREATE)

  /*
   * LA FACTURATION EST UN AUTRE MÉTIER (DEC-024).
   *
   * Voir une location n'est pas voir sa facture, et la préparer encore moins.
   * Sans `billing.customer_invoices.view`, la carte DISPARAÎT : une carte vide
   * se lirait « cette location n'a pas été facturée », affirmation qu'un refus
   * de lecture ne permet pas (DEC-017).
   */
  const [canSeeInvoices, canCreateInvoice, canSeeCustomerPayments] = await Promise.all([
    can(PERMISSIONS.CUSTOMER_INVOICES_VIEW),
    can(PERMISSIONS.CUSTOMER_INVOICES_CREATE),
    // Et voir une facture n'est pas voir ce qui l'a soldée (DEC-024) : sans
    // cette capacité, l'état affiché reste « Émise », jamais « Payée ».
    can(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW),
  ])

  const invoice = canSeeInvoices
    ? await getInvoiceForRental(id, { canSeePayments: canSeeCustomerPayments })
    : null

  const shown = displayStatus(rental.status, rental.expectedReturnAt)
  const beforeDeparture = rental.status === 'PREPARING' || rental.status === 'CONFIRMED'
  const running = rental.status === 'IN_PROGRESS' || rental.status === 'EXTENDED'

  // Repère d'exploitation, jamais une durée facturable (DEC-008).
  const daysLeft = running ? calendarDaysUntil(rental.expectedReturnAt) : null

  const tabs: TabItem[] = [
    { key: 'informations', label: 'Informations', href: `/location/locations/${id}` },
    { key: 'etats', label: 'États des lieux', href: `/location/locations/${id}?onglet=etats` },
    { key: 'controle', label: 'Contrôle', href: `/location/locations/${id}?onglet=controle` },
    { key: 'historique', label: 'Historique', planned: true },
  ]

  const tab = tabs.some((item) => item.key === requestedTab && item.href)
    ? requestedTab
    : 'informations'

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

      {searchParams.rentre === '1' && (
        <Notice tone="success" className="mb-5">
          Retour enregistré. La location est <strong>à contrôler</strong>, la période est libérée
          et le véhicule est revenu au parc.
          {rejectedPhotos > 0 && (
            <>
              {' '}
              En revanche, {rejectedPhotos} photo{rejectedPhotos > 1 ? 's n’ont' : ' n’a'} pas pu
              être enregistrée{rejectedPhotos > 1 ? 's' : ''} : le retour, lui, est bien pris en
              compte.
            </>
          )}
        </Notice>
      )}

      {justLeft && (
        <Notice tone="success" className="mb-5">
          Départ enregistré. La location est <strong>en cours</strong> et le véhicule est sorti du
          parc.
          {rejectedPhotos > 0 && (
            <>
              {' '}
              En revanche, {rejectedPhotos} photo{rejectedPhotos > 1 ? 's n’ont' : ' n’a'} pas pu
              être enregistrée{rejectedPhotos > 1 ? 's' : ''} : le départ, lui, est bien pris en
              compte.
            </>
          )}
        </Notice>
      )}

      <PageHeader
        title={rental.clientLabel}
        description={rental.rentalNo}
        actions={
          canCheckout && rental.status === 'CONFIRMED' ? (
            <ButtonLink href={`/location/locations/${id}/depart`} icon={KeyRound}>
              Enregistrer le départ
            </ButtonLink>
          ) : canReturn && running ? (
            <ButtonLink href={`/location/locations/${id}/retour`} icon={Undo2}>
              Enregistrer le retour
            </ButtonLink>
          ) : canCreateInvoice && rental.status === 'TO_INVOICE' && !invoice ? (
            <ButtonLink href={`/facturation/clients/nouvelle?location=${id}`} icon={Receipt}>
              Facturer la location
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[shown]}>{STATUS_LABELS[shown]}</Badge>
        <span className="text-sm text-muted">
          {formatPeriod(rental.plannedFrom, rental.plannedTo)}
        </span>
        {/*
          Repère de calendrier, pas de facturation : « attendu dans deux jours »
          se lit sans ambiguïté, alors qu'un nombre de jours facturables
          supposerait une règle d'arrondi qui n'est pas arrêtée (DEC-008).
        */}
        {daysLeft !== null && (
          <Badge tone={daysLeft < 0 ? 'danger' : daysLeft === 0 ? 'warning' : 'neutral'}>
            {daysLeft < 0
              ? `Retour dépassé de ${Math.abs(daysLeft)} jour${Math.abs(daysLeft) > 1 ? 's' : ''}`
              : daysLeft === 0
                ? 'Retour attendu aujourd’hui'
                : `Retour attendu dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`}
          </Badge>
        )}
      </div>

      <Tabs items={tabs} current={tab} />

      {tab === 'etats' ? (
        <InspectionsTab rentalId={id} />
      ) : tab === 'controle' ? (
        <ControlTab
          rentalId={id}
          canClose={canClose}
          canDeclareIncident={canDeclareIncident}
          status={rental.status}
          expectedReturnAt={rental.expectedReturnAt}
          returnedAt={rental.returnedAt}
        />
      ) : (
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

          {/*
            Relevés du départ, remontés sur la fiche : ce sont EUX que le retour
            comparera. Les avoir sous les yeux pendant la location, c'est
            préparer le contrôle sans rien valoriser (DEC-025 §i).
          */}
          {running && <DepartureReadings rentalId={id} />}

          {/*
            LA FACTURATION, VUE DEPUIS LE CONTRAT (Workflow 07 §49).
            « L'utilisateur doit pouvoir accéder à la location depuis la
            facture » — et réciproquement : le dossier dit où en est sa créance.
          */}
          {canSeeInvoices && rental.status !== 'CANCELLED' && (
            <Card
              title="Facturation"
              description="La créance issue de ce contrat (Workflow 07 §49)."
            >
              {invoice ? (
                <dl>
                  <InfoRow label="Facture">
                    <Link
                      href={`/facturation/clients/${invoice.id}`}
                      className="text-adikom-500 hover:underline tabular"
                    >
                      {invoice.invoiceNo}
                    </Link>
                  </InfoRow>
                  <InfoRow label="Total">
                    <span className="font-medium tabular">{formatAmount(invoice.total)}</span>
                  </InfoRow>
                  <InfoRow label="État">
                    {(() => {
                      // « Payée » et « En retard » se calculent (Workflow 07
                      // §61, DEC-025 §a) : l'état affiché n'est jamais celui
                      // qui dort en base.
                      const invoiceStatus = displayInvoiceStatus(
                        invoice.status,
                        invoice.dueDate,
                        invoice.total,
                        invoice.paidAmount
                      )
                      return (
                        <Badge tone={CUSTOMER_INVOICE_STATUS_TONES[invoiceStatus]}>
                          {CUSTOMER_INVOICE_STATUS_LABELS[invoiceStatus]}
                        </Badge>
                      )
                    })()}
                  </InfoRow>
                  <InfoRow label="Solde" hint="Total moins les encaissements validés.">
                    {invoice.remainingDue === null ? (
                      <span className="text-muted">
                        Votre compte ne peut pas consulter les règlements.
                      </span>
                    ) : (
                      <span className="tabular">{formatAmount(invoice.remainingDue)}</span>
                    )}
                  </InfoRow>
                  <InfoRow label="Échéance">
                    {formatDate(invoice.dueDate) ?? <Empty />}
                  </InfoRow>
                </dl>
              ) : (
                <EmptyState
                  icon={Receipt}
                  title="Aucune facture"
                  description={
                    rental.status === 'TO_INVOICE'
                      ? 'Cette location attend sa facture. Son émission la fera passer « Facturée ».'
                      : 'Une location se facture une fois son contrôle de retour validé.'
                  }
                  action={
                    canCreateInvoice && rental.status === 'TO_INVOICE' ? (
                      <ButtonLink
                        href={`/facturation/clients/nouvelle?location=${id}`}
                        icon={Receipt}
                      >
                        Facturer la location
                      </ButtonLink>
                    ) : undefined
                  }
                />
              )}
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

          {canExtend && running && (
            <Card
              title="Prolonger"
              description="Le véhicule reste engagé sans interruption ; le tarif du contrat ne change pas."
            >
              <ExtendPanel rentalId={id} expectedReturnAt={rental.expectedReturnAt} />
            </Card>
          )}

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

          {/*
            La clôture ferme le dossier d'exploitation, pas la créance
            (Workflow 01 §42). Elle n'apparaît qu'une fois la facture émise.
          */}
          {canClose && rental.status === 'INVOICED' && (
            <Card
              title="Clôturer"
              description="Le dossier est traité. La facture, elle, garde son état."
            >
              <CloseRentalPanel rentalId={id} invoiceNo={invoice?.invoiceNo ?? null} />
            </Card>
          )}

          {/*
            Trois documents, une seule location : le contrat, le bon remis au
            départ et le procès-verbal signé au retour. Chacun n'est proposé
            qu'une fois la pièce a un sens — un bon de départ avant le départ
            ne décrirait rien.
          */}
          {(canDownload || canPrint) && (
            <Card
              title="Documents"
              /*
               * La description ÉNUMÈRE ce qui est réellement disponible.
               * Annoncer trois pièces alors qu'une seule existe encore ferait
               * chercher les deux autres — la même faute que d'afficher « 0 »
               * pour une donnée simplement pas encore produite (DEC-017).
               */
              description={enumerate([
                'Contrat',
                ...(rental.startedAt ? ['bon de départ'] : []),
                ...(rental.returnedAt ? ['procès-verbal de retour'] : []),
              ])}
            >
              <div className="space-y-4">
                <RentalDocument
                  type="contrats"
                  id={id}
                  title="Contrat de location"
                  label={`contrat ${rental.rentalNo}`}
                  canDownload={canDownload}
                  canPrint={canPrint}
                />

                {rental.startedAt && (
                  <RentalDocument
                    type="departs"
                    id={id}
                    title="Bon de départ"
                    label={`bon de départ ${rental.rentalNo}`}
                    canDownload={canDownload}
                    canPrint={canPrint}
                  />
                )}

                {rental.returnedAt && (
                  <RentalDocument
                    type="retours"
                    id={id}
                    title="Procès-verbal de retour"
                    label={`PV de retour ${rental.rentalNo}`}
                    canDownload={canDownload}
                    canPrint={canPrint}
                  />
                )}
              </div>
            </Card>
          )}

          <Card title="Étape suivante">
            <p className="text-sm text-muted">
              {rental.status === 'PREPARING'
                ? 'Confirmez le contrat pour pouvoir enregistrer le départ.'
                : rental.status === 'CONFIRMED'
                  ? 'Le contrat est prêt : enregistrez le départ et l’état des lieux du véhicule.'
                  : running
                    ? 'Le véhicule est sorti : enregistrez son retour à la restitution.'
                    : rental.status === 'RETURNED' || rental.status === 'TO_CONTROL'
                      ? 'Le véhicule est rentré : validez le contrôle de retour pour passer à la facturation.'
                      : rental.status === 'TO_INVOICE'
                        ? 'Le contrôle est validé : préparez la facture client. Son émission rendra la location « Facturée ».'
                        : rental.status === 'INVOICED'
                          ? 'La facture est émise. Le dossier peut être clôturé, même avant encaissement (Workflow 01 §42).'
                          : rental.status === 'CLOSED'
                            ? 'Dossier clôturé. Son historique reste consultable ; l’encaissement se suit sur la facture.'
                            : 'Cette location est annulée : son historique est conservé.'}
            </p>
          </Card>
        </div>
      </div>
      )}
    </>
  )
}

/**
 * Relevés du départ — ce que le retour comparera.
 *
 * Kilométrage et carburant relevés à la sortie du parc. Aucun écart n'est
 * calculé et aucun montant n'est proposé : le rapprochement relève du contrôle
 * de retour, et sa valorisation d'une règle qui n'existe pas (DEC-008).
 */
async function DepartureReadings({ rentalId }: { rentalId: string }) {
  const inspections = await listInspections(rentalId)
  const departure = inspections.find((inspection) => inspection.kind === 'DEPARTURE')

  if (!departure) return null

  return (
    <Card
      title="Relevés au départ"
      description="Références du contrôle de retour. Aucun écart n’est calculé à ce stade."
    >
      <dl>
        <InfoRow label="Kilométrage au départ">
          {departure.mileage != null ? (
            <span className="tabular">{departure.mileage.toLocaleString('fr-FR')} km</span>
          ) : (
            <Empty />
          )}
        </InfoRow>
        <InfoRow label="Carburant au départ">
          {departure.fuelLevel ? FUEL_LEVEL_LABELS[departure.fuelLevel] : <Empty />}
        </InfoRow>
        <InfoRow
          label="Dommages préexistants"
          hint="Relevés au départ : ils ne seront pas imputés au client."
        >
          {departure.preexistingDamages ?? <Empty />}
        </InfoRow>
      </dl>
    </Card>
  )
}

/**
 * États des lieux de la location.
 *
 * Tant qu'aucun départ n'a été enregistré, l'onglet le DIT — il ne se contente
 * pas d'être vide. La distinction compte : un écran vide se lit comme une
 * panne, une absence annoncée se lit comme une étape à venir (DEC-017).
 */
async function InspectionsTab({ rentalId }: { rentalId: string }) {
  const inspections = await listInspections(rentalId)

  if (inspections.length === 0) {
    return (
      <Card title="États des lieux">
        <EmptyState
          icon={ClipboardCheck}
          title="Aucun état des lieux"
          description="L’état des lieux de départ sera enregistré au moment où le véhicule quittera le parc."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {inspections.map((inspection) => (
        <Card
          key={inspection.id}
          title={INSPECTION_LABELS[inspection.kind]}
          description={formatDateTime(inspection.performedAt) ?? undefined}
        >
          <dl>
            <InfoRow label="Kilométrage">
              {inspection.mileage != null ? (
                <span className="tabular">{inspection.mileage.toLocaleString('fr-FR')} km</span>
              ) : (
                <Empty />
              )}
            </InfoRow>
            <InfoRow label="Carburant">
              {inspection.fuelLevel ? FUEL_LEVEL_LABELS[inspection.fuelLevel] : <Empty />}
            </InfoRow>
            <InfoRow label="État extérieur">{inspection.exteriorCondition ?? <Empty />}</InfoRow>
            <InfoRow label="État intérieur">{inspection.interiorCondition ?? <Empty />}</InfoRow>
            <InfoRow
              label="Dommages préexistants"
              hint="Relevés au départ : ils ne seront pas imputés au client."
            >
              {inspection.preexistingDamages ?? <Empty />}
            </InfoRow>
            <InfoRow label="Observations">{inspection.observations ?? <Empty />}</InfoRow>
          </dl>

          {inspection.photos.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-xs font-medium text-ink">
                {inspection.photos.length} photo{inspection.photos.length > 1 ? 's' : ''}
              </p>
              <ul className="flex flex-wrap gap-2">
                {inspection.photos.map((photo) => (
                  <li key={photo.id}>
                    {/*
                      Le chemin de stockage n'est jamais exposé : cette route
                      vérifie la permission puis délivre une URL signée d'une
                      minute (DEC-025 §f).
                    */}
                    <a
                      href={`/api/inspections/${photo.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs text-adikom-500 transition-colors hover:border-adikom-300"
                    >
                      <ImageIcon className="size-3.5" aria-hidden />
                      {photo.caption ?? photo.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}

/**
 * Contrôle de retour — la comparaison, et rien qu'elle.
 *
 * Le rapprochement départ / retour est un CONSTAT : distance parcourue, écart
 * de carburant, dommages préexistants opposés aux dommages nouveaux. Aucun
 * montant n'en est tiré, et l'écran le dit — les barèmes de carburant, de
 * kilométrage, de retard et de dommages ne sont pas définis (DEC-008,
 * DEC-025 §i).
 */
async function ControlTab({
  rentalId,
  canClose,
  canDeclareIncident,
  status,
  expectedReturnAt,
  returnedAt,
}: {
  rentalId: string
  canClose: boolean
  canDeclareIncident: boolean
  status: string
  expectedReturnAt: string
  returnedAt: string | null
}) {
  const inspections = await listInspections(rentalId)
  const departure = inspections.find((inspection) => inspection.kind === 'DEPARTURE')
  const back = inspections.find((inspection) => inspection.kind === 'RETURN')

  if (!back) {
    return (
      <Card title="Contrôle de retour">
        <EmptyState
          icon={ClipboardCheck}
          title="Le véhicule n’est pas encore rentré"
          description="La comparaison départ / retour sera possible dès que le retour aura été enregistré."
        />
      </Card>
    )
  }

  const distance =
    departure?.mileage != null && back.mileage != null ? back.mileage - departure.mileage : null

  const fuelChanged =
    departure?.fuelLevel != null &&
    back.fuelLevel != null &&
    departure.fuelLevel !== back.fuelLevel

  const lateBy =
    returnedAt && new Date(returnedAt).getTime() > new Date(expectedReturnAt).getTime()
      ? calendarDaysUntil(expectedReturnAt)
      : null

  return (
    <div className="space-y-5">
      <Card
        title="Comparaison départ / retour"
        description="Constat. Aucun montant n’est calculé à ce stade."
      >
        <dl>
          <InfoRow label="Kilométrage">
            {departure?.mileage != null && back.mileage != null ? (
              <span className="tabular">
                {departure.mileage.toLocaleString('fr-FR')} km →{' '}
                {back.mileage.toLocaleString('fr-FR')} km
              </span>
            ) : (
              <Empty />
            )}
          </InfoRow>

          <InfoRow label="Distance parcourue">
            {distance != null ? (
              <span className="tabular font-medium text-ink">
                {distance.toLocaleString('fr-FR')} km
              </span>
            ) : (
              <Empty />
            )}
          </InfoRow>

          <InfoRow
            label="Carburant"
            hint={fuelChanged ? 'Écart constaté, non valorisé.' : undefined}
          >
            {departure?.fuelLevel && back.fuelLevel ? (
              <span>
                {FUEL_LEVEL_LABELS[departure.fuelLevel]} → {FUEL_LEVEL_LABELS[back.fuelLevel]}
              </span>
            ) : (
              <Empty />
            )}
          </InfoRow>

          <InfoRow label="Retour attendu">{formatDateTime(expectedReturnAt)}</InfoRow>
          <InfoRow
            label="Retour réel"
            hint={
              lateBy != null && lateBy < 0
                ? `Dépassement de ${Math.abs(lateBy)} jour${Math.abs(lateBy) > 1 ? 's' : ''}, constaté sans valorisation.`
                : undefined
            }
          >
            {returnedAt ? formatDateTime(returnedAt) : <Empty />}
          </InfoRow>
        </dl>
      </Card>

      <Card
        title="Dommages"
        description="Ce qui était déjà là, et ce qui ne l’était pas."
      >
        <dl>
          <InfoRow
            label="Déjà présents au départ"
            hint="Ne peuvent pas être reprochés au client."
          >
            {departure?.preexistingDamages ?? <Empty />}
          </InfoRow>
          <InfoRow
            label="Constatés au retour"
            hint="Constat enregistré. Leur valorisation relèvera de la facturation."
          >
            {back.preexistingDamages ?? <Empty />}
          </InfoRow>
        </dl>

        {/*
          Le champ ci-dessus est du TEXTE : il décrit, il ne se compte pas et
          ne se suit pas d'une location à l'autre. Ouvrir un incident transforme
          ce constat en dommages identifiés, que la maintenance saura reprendre.
          Rien n'est déclenché automatiquement : c'est une décision, pas une
          conséquence (Workflow 05 §44).
        */}
        {canDeclareIncident && (
          <div className="mt-4 border-t border-line pt-4">
            <ButtonLink
              href={`/location/incidents/nouveau?location=${rentalId}&etat=${back.id}`}
              icon={TriangleAlert}
              tone="secondary"
            >
              Déclarer un incident
            </ButtonLink>
            <p className="mt-2 text-xs text-muted">
              Le véhicule ne sera pas immobilisé et aucune maintenance ne sera créée.
            </p>
          </div>
        )}
      </Card>

      <Card title="États relevés">
        <dl>
          <InfoRow label="Extérieur au départ">{departure?.exteriorCondition ?? <Empty />}</InfoRow>
          <InfoRow label="Extérieur au retour">{back.exteriorCondition ?? <Empty />}</InfoRow>
          <InfoRow label="Intérieur au départ">{departure?.interiorCondition ?? <Empty />}</InfoRow>
          <InfoRow label="Intérieur au retour">{back.interiorCondition ?? <Empty />}</InfoRow>
          <InfoRow label="Observations du retour">{back.observations ?? <Empty />}</InfoRow>
        </dl>
      </Card>

      {canClose && status === 'TO_CONTROL' && (
        <Card
          title="Valider le contrôle"
          description="La location quittera l’exploitation et attendra sa facturation."
          className="max-w-3xl"
        >
          <ControlPanel rentalId={rentalId} />
        </Card>
      )}
    </div>
  )
}

/**
 * Une pièce documentaire, avec sa barre d'actions.
 *
 * Trois documents cohabitent sur la même fiche : chacun est annoncé par son
 * nom, faute de quoi trois barres identiques laisseraient l'utilisateur
 * deviner laquelle produit quoi. La barre elle-même est celle de tous les
 * autres référentiels — un seul PDF sert l'aperçu, le téléchargement et
 * l'impression.
 */
function RentalDocument({
  type,
  id,
  title,
  label,
  canDownload,
  canPrint,
}: {
  type: string
  id: string
  title: string
  label: string
  canDownload: boolean
  canPrint: boolean
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink">{title}</p>
      <DocumentToolbar
        type={type}
        id={id}
        label={label}
        canDownload={canDownload}
        canPrint={canPrint}
      />
    </div>
  )
}
