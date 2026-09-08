import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, KeyRound, Pencil, Tags } from 'lucide-react'

import {
  Badge,
  BUTTON_BASE,
  BUTTON_TONES,
  Card,
  Empty,
  EmptyState,
  InfoRow,
  PageHeader,
} from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { Notice } from '@/components/ui/feedback'
import { StatusChangeForm } from '@/components/ui/status-change-form'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import {
  FUEL_LABELS,
  getVehicleDetail,
  listOccupations,
  listSupplierHistory,
  listVehicleDocuments,
  ORIGIN_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  STATUS_TONES,
  TRANSMISSION_LABELS,
} from '@/features/fleet/data'
import { OPERATIONAL_STATUSES } from '@/features/fleet/constants'
import { setVehicleStatusAction } from '@/features/fleet/actions'
import { VehicleForm } from '@/features/fleet/vehicle-form'
import { SupplierPanel } from '@/features/fleet/supplier-panel'
import { DocumentsPanel } from '@/features/fleet/documents-panel'
import { AvailabilityPanel } from '@/features/fleet/availability-panel'
import { RetireVehicleForm } from '@/features/fleet/retire-form'
import { listCategoryOptions } from '@/features/fleet/data'
import { listSupplierOptions } from '@/features/suppliers/data'
import { listPartnerOptions } from '@/features/partners/data'
import { listPricingRules } from '@/features/pricing/data'
import {
  KIND_LABELS as INCIDENT_KIND_LABELS,
  listVehicleIncidents,
  STATUS_LABELS as INCIDENT_STATUS_LABELS,
  STATUS_TONES as INCIDENT_STATUS_TONES,
} from '@/features/incidents/data'
import {
  listVehicleMaintenances,
  ORIGIN_LABELS as MAINTENANCE_ORIGIN_LABELS,
  PRIORITY_LABELS as MAINTENANCE_PRIORITY_LABELS,
  STATUS_LABELS as MAINTENANCE_STATUS_LABELS,
  STATUS_TONES as MAINTENANCE_STATUS_TONES,
} from '@/features/maintenance/data'
import { formatPrice } from '@/features/pricing/constants'
import {
  displayStatus as displayRentalStatus,
  listRentals,
  STATUS_LABELS as RENTAL_STATUS_LABELS,
  STATUS_TONES as RENTAL_STATUS_TONES,
} from '@/features/rentals/data'
import { listCustomerInvoices } from '@/features/customer-invoices/data'
import { listImputations } from '@/features/imputations/data'
import { getVehicleMaintenanceCosts } from '@/features/maintenance/costs-data'
import { formatAmount } from '@/lib/money'
import { formatPeriod } from '@/lib/dates'

export const metadata: Metadata = { title: 'Fiche véhicule' }

/** Statuts proposés depuis la fiche : le retrait du parc a son propre geste. */
const SELECTABLE_STATUS_LABELS = Object.fromEntries(
  OPERATIONAL_STATUSES.map((status) => [status, STATUS_LABELS[status]])
) as Record<(typeof OPERATIONAL_STATUSES)[number], string>

export default async function VehicleDetailPage(props: PageProps<'/location/parc/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.FLEET_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const vehicle = await getVehicleDetail(id)
  if (!vehicle) notFound()

  const requestedTab = typeof searchParams.onglet === 'string' ? searchParams.onglet : 'fiche'
  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'

  const [
    canUpdate,
    canStatus,
    canSupplier,
    canArchive,
    canDocuments,
    canPricing,
    canDownload,
    canPrint,
    canIncidents,
    canMaintenance,
    canRentals,
    canInvoices,
    canPayments,
    canCosts,
    canImputations,
  ] = await Promise.all([
    can(PERMISSIONS.FLEET_UPDATE),
    can(PERMISSIONS.FLEET_STATUS_UPDATE),
    can(PERMISSIONS.FLEET_SUPPLIER_UPDATE),
    can(PERMISSIONS.FLEET_ARCHIVE),
    can(PERMISSIONS.VEHICLE_DOCUMENTS_VIEW),
    can(PERMISSIONS.PRICING_VIEW),
    // DEC-024 : produire un document et l'imprimer sont deux capacités
    // distinctes de la consultation, attribuables séparément.
    can(PERMISSIONS.FLEET_DOWNLOAD),
    can(PERMISSIONS.FLEET_PRINT),
    can(PERMISSIONS.INCIDENTS_VIEW),
    can(PERMISSIONS.MAINTENANCE_VIEW),
    /*
     * Les deux onglets ouverts par cet ajustement (DEC-042 §d).
     *
     * « Locations » suit `rental.rentals.view`. « Rentabilité » aussi : sans les
     * contrats du véhicule, il n'y a ni revenus à rapprocher ni période à
     * couvrir, et l'onglet ne dirait rien de vrai.
     */
    can(PERMISSIONS.RENTALS_VIEW),
    can(PERMISSIONS.CUSTOMER_INVOICES_VIEW),
    can(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW),
    can(PERMISSIONS.MAINTENANCE_COST_VIEW),
    can(PERMISSIONS.IMPUTATIONS_VIEW),
  ])

  const tabs: TabItem[] = [
    { key: 'fiche', label: 'Fiche', href: `/location/parc/${id}` },
    { key: 'disponibilite', label: 'Disponibilité', href: `/location/parc/${id}?onglet=disponibilite` },
    { key: 'fournisseur', label: 'Fournisseur', href: `/location/parc/${id}?onglet=fournisseur` },
    ...(canDocuments
      ? [{ key: 'documents', label: 'Documents', href: `/location/parc/${id}?onglet=documents` }]
      : []),
    ...(canPricing
      ? [{ key: 'tarifs', label: 'Tarifs', href: `/location/parc/${id}?onglet=tarifs` }]
      : []),
    /*
     * DEC-017 : sans `rental.incidents.view`, l'onglet DISPARAÎT. Le laisser
     * afficher une liste vide reviendrait à certifier que ce véhicule n'a
     * jamais connu d'incident, alors qu'on ne fait que refuser la lecture.
     */
    ...(canIncidents
      ? [{ key: 'incidents', label: 'Incidents', href: `/location/parc/${id}?onglet=incidents` }]
      : []),
    ...(canMaintenance
      ? [
          {
            key: 'maintenance',
            label: 'Maintenance',
            href: `/location/parc/${id}?onglet=maintenance`,
          },
        ]
      : []),
    ...(canRentals
      ? [
          {
            key: 'locations',
            label: 'Locations',
            href: `/location/parc/${id}?onglet=locations`,
          },
          {
            key: 'rentabilite',
            label: 'Rentabilité',
            href: `/location/parc/${id}?onglet=rentabilite`,
          },
        ]
      : []),
  ]

  const tab = tabs.some((item) => item.key === requestedTab && item.href) ? requestedTab : 'fiche'
  const retired = vehicle.status === 'RETIRED'

  return (
    <>
      <Link
        href="/location/parc"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour au parc
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Véhicule enregistré. Son identifiant est <strong>{vehicle.vehicleNo}</strong>.
        </Notice>
      )}

      {justSaved && (
        <Notice tone="success" className="mb-5">
          La fiche du véhicule a été enregistrée.
        </Notice>
      )}

      {retired && (
        <Notice tone="warning" className="mb-5">
          Ce véhicule est retiré du parc depuis le {formatDate(vehicle.exitDate)}. Il ne peut plus
          être loué ; son historique reste consultable.
        </Notice>
      )}

      <PageHeader
        title={`${vehicle.brand} ${vehicle.model}`}
        description={vehicle.plate ?? undefined}
        actions={
          <>
            {/* Un véhicule retiré reste documentable : sa fiche fait foi pour
                l'historique, et c'est souvent à ce moment qu'on l'imprime. */}
            <DocumentToolbar
              type="vehicules"
              id={id}
              label={`fiche de ${vehicle.brand} ${vehicle.model}`}
              canDownload={canDownload}
              canPrint={canPrint}
            />
            {canUpdate && !editing && !retired && (
              <Link
                href={`/location/parc/${id}?mode=edition`}
                className={cn(BUTTON_BASE, BUTTON_TONES.secondary)}
              >
                <Pencil className="size-4" aria-hidden />
                Modifier
              </Link>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[vehicle.status]}>{STATUS_LABELS[vehicle.status]}</Badge>
        <Badge>{ORIGIN_LABELS[vehicle.origin]}</Badge>
        {vehicle.categoryLabel && <Badge>{vehicle.categoryLabel}</Badge>}
        <span className="text-sm text-muted tabular">{vehicle.vehicleNo}</span>
      </div>

      <Tabs items={tabs} current={tab} />

      {tab === 'disponibilite' ? (
        <AvailabilityTab vehicleId={id} editable={canStatus && !retired} />
      ) : tab === 'fournisseur' ? (
        <SupplierTab vehicle={vehicle} editable={canSupplier && !retired} />
      ) : tab === 'documents' ? (
        <DocumentsTab vehicleId={id} />
      ) : tab === 'tarifs' ? (
        <PricingTab vehicleId={id} categoryId={vehicle.categoryId} />
      ) : tab === 'incidents' ? (
        <IncidentsTab vehicleId={id} />
      ) : tab === 'maintenance' ? (
        <MaintenanceTab vehicleId={id} />
      ) : tab === 'locations' ? (
        <RentalsTab vehicleId={id} />
      ) : tab === 'rentabilite' ? (
        <ProfitabilityTab
          vehicleId={id}
          canInvoices={canInvoices}
          canPayments={canPayments}
          canCosts={canCosts}
          canImputations={canImputations}
          canMaintenance={canMaintenance}
        />
      ) : editing && canUpdate ? (
        <EditPanel vehicleId={id} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card title="Identification">
              <dl>
                <InfoRow label="Identifiant">
                  <span className="tabular">{vehicle.vehicleNo}</span>
                </InfoRow>
                <InfoRow label="Immatriculation">
                  {vehicle.plate ? <span className="tabular">{vehicle.plate}</span> : <Empty />}
                </InfoRow>
                <InfoRow label="Marque et modèle">
                  {vehicle.brand} {vehicle.model}
                </InfoRow>
                <InfoRow label="Année">{vehicle.modelYear ?? <Empty />}</InfoRow>
                <InfoRow label="Catégorie">{vehicle.categoryLabel ?? <Empty />}</InfoRow>
                <InfoRow label="Couleur">{vehicle.color ?? <Empty />}</InfoRow>
              </dl>
            </Card>

            <Card title="Caractéristiques techniques">
              <dl>
                <InfoRow label="Carburant">
                  {vehicle.fuel ? FUEL_LABELS[vehicle.fuel] : <Empty />}
                </InfoRow>
                <InfoRow label="Boîte de vitesse">
                  {vehicle.transmission ? TRANSMISSION_LABELS[vehicle.transmission] : <Empty />}
                </InfoRow>
                <InfoRow label="Places">{vehicle.seats ?? <Empty />}</InfoRow>
                <InfoRow label="Portes">{vehicle.doors ?? <Empty />}</InfoRow>
                <InfoRow label="Kilométrage">
                  <span className="tabular">{vehicle.mileage.toLocaleString('fr-FR')} km</span>
                </InfoRow>
                <InfoRow label="Kilométrage initial">
                  {vehicle.initialMileage !== null ? (
                    <span className="tabular">
                      {vehicle.initialMileage.toLocaleString('fr-FR')} km
                    </span>
                  ) : (
                    <Empty />
                  )}
                </InfoRow>
              </dl>
            </Card>

            {vehicle.notes && (
              <Card title="Observations">
                <p className="text-sm whitespace-pre-line text-ink">{vehicle.notes}</p>
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card title="Situation">
              <dl>
                <InfoRow label="Statut">
                  <Badge tone={STATUS_TONES[vehicle.status]}>
                    {STATUS_LABELS[vehicle.status]}
                  </Badge>
                </InfoRow>
                {vehicle.statusReason && (
                  <InfoRow label="Motif" hint={formatDate(vehicle.statusChangedAt) ?? undefined}>
                    {vehicle.statusReason}
                  </InfoRow>
                )}
                <InfoRow label="Origine">{ORIGIN_LABELS[vehicle.origin]}</InfoRow>
                <InfoRow label="Fournisseur">
                  {vehicle.supplierId && vehicle.supplierLabel ? (
                    <Link
                      href={`/tiers/fournisseurs/${vehicle.supplierId}`}
                      className="text-adikom-500 hover:underline"
                    >
                      {vehicle.supplierLabel}
                    </Link>
                  ) : (
                    <Empty />
                  )}
                </InfoRow>
                <InfoRow label="Partenaire">
                  {vehicle.partnerId && vehicle.partnerLabel ? (
                    <Link
                      href={`/tiers/partenaires/${vehicle.partnerId}`}
                      className="text-adikom-500 hover:underline"
                    >
                      {vehicle.partnerLabel}
                    </Link>
                  ) : (
                    <Empty />
                  )}
                </InfoRow>
                <InfoRow label="Entrée dans le parc">
                  {formatDate(vehicle.entryDate) ?? <Empty />}
                </InfoRow>
                {vehicle.exitDate && (
                  <InfoRow label="Sortie du parc" hint={vehicle.exitReason ?? undefined}>
                    {formatDate(vehicle.exitDate)}
                  </InfoRow>
                )}
                <InfoRow label="Créée le">{formatDateTime(vehicle.createdAt)}</InfoRow>
              </dl>
            </Card>

            {canStatus && !retired && (
              <Card
                title="Statut du véhicule"
                description="Le statut décrit une situation. La disponibilité se lit dans le calendrier."
              >
                <StatusChangeForm
                  action={setVehicleStatusAction}
                  entityId={id}
                  entityField="vehicleId"
                  currentStatus={
                    (OPERATIONAL_STATUSES.includes(vehicle.status as never)
                      ? vehicle.status
                      : 'AVAILABLE') as keyof typeof SELECTABLE_STATUS_LABELS
                  }
                  labels={SELECTABLE_STATUS_LABELS}
                  hints={STATUS_HINTS as Partial<Record<string, string>>}
                  reasonPlaceholder="Panne, contrôle, usage interne…"
                />
              </Card>
            )}

            {canArchive && !retired && (
              <Card
                title="Retrait du parc"
                description="Opération définitive : le véhicule cesse d’être exploitable."
              >
                <RetireVehicleForm vehicleId={id} />
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Locations du véhicule — DEC-042 §d.
 *
 * La même lecture que la liste des locations, filtrée sur ce véhicule. « En
 * retard » se dérive de l'heure de retour attendue, jamais d'un statut écrit
 * (DEC-025 §a) : la fiche véhicule ne pose donc pas sa propre lecture du retard.
 */
async function RentalsTab({ vehicleId }: { vehicleId: string }) {
  const rentals = await listRentals({ vehicleId })

  return (
    <Card
      title="Locations"
      description="Contrats portant sur ce véhicule, du plus récent au plus ancien."
    >
      {rentals.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Aucune location"
          description="Ce véhicule n’a encore été loué à personne."
        />
      ) : (
        <ul className="divide-y divide-line">
          {rentals.map((rental) => {
            const shown = displayRentalStatus(rental.status, rental.expectedReturnAt)

            return (
              <li key={rental.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/location/locations/${rental.id}`}
                    className="font-medium text-adikom-500 hover:underline tabular"
                  >
                    {rental.rentalNo}
                  </Link>
                  <p className="text-xs text-muted">
                    {formatPeriod(rental.plannedFrom, rental.plannedTo)}
                    {rental.clientLabel ? ` · ${rental.clientLabel}` : ''}
                  </p>
                </div>
                <Badge tone={RENTAL_STATUS_TONES[shown]}>{RENTAL_STATUS_LABELS[shown]}</Badge>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/**
 * Rentabilité du véhicule — DEC-042 §d.
 *
 * LA RÈGLE EXISTE, ET ELLE EST TENUE TELLE QUELLE.
 *
 * `05_Regles_Metier/02_Parc_Automobile.md` §43 la pose, exemple à l'appui :
 * « Revenus : 2 500 000 KMF. Coûts de maintenance : 550 000 KMF. » Rien de plus
 * n'est inventé ici — ni amortissement, ni assurance, ni carburant, ni clé de
 * répartition : aucune de ces charges n'existe dans le système, et en supposer
 * une rendrait le résultat faux sans que personne puisse le vérifier.
 *
 * LE MÊME §43 POSE UN INTERDIT, ET C'EST LUI QUI COMMANDE L'ÉCRAN :
 *
 *   « Le système ne doit pas présenter un indicateur comme une rentabilité
 *     COMPLÈTE si toutes les charges ne sont pas prises en compte. »
 *
 * L'écran parle donc de MARGE D'EXPLOITATION, et énumère en toutes lettres ce
 * qu'elle ne couvre pas. Un chiffre honnête et borné vaut mieux qu'un chiffre
 * flatteur qu'on prendrait pour un résultat.
 *
 * UNE IMPUTATION N'EST PAS UN PAIEMENT — MAIS ELLE RÉDUIT BIEN LA CHARGE
 *
 * CLAUDE.md §16 : ce qu'ADIKOM impute à un fournisseur ne sort pas de sa poche.
 * Le coût NET supporté est donc « coût réel − imputé », et les deux montants
 * restent affichés séparément : les confondre effacerait la trace de ce qui a
 * été repris au fournisseur (§57).
 *
 * CE QUI N'EST PAS LISIBLE N'EST PAS COMPTÉ, ET L'ÉCRAN LE DIT
 *
 * Revenus, coûts et imputations relèvent de trois capacités distinctes. Il
 * manque l'une d'elles, la marge n'est pas calculée : un « 0 » y passerait pour
 * une charge nulle (DEC-017).
 */
async function ProfitabilityTab({
  vehicleId,
  canInvoices,
  canPayments,
  canCosts,
  canImputations,
  canMaintenance,
}: {
  vehicleId: string
  canInvoices: boolean
  canPayments: boolean
  canCosts: boolean
  canImputations: boolean
  canMaintenance: boolean
}) {
  const rentals = await listRentals({ vehicleId })
  const rentalIds = rentals.map((rental) => rental.id)

  const maintenances = canMaintenance ? await listVehicleMaintenances(vehicleId) : []
  const maintenanceIds = maintenances.map((maintenance) => maintenance.id)

  const [invoices, costs, imputations] = await Promise.all([
    canInvoices && rentalIds.length > 0
      ? listCustomerInvoices({ rentalIds }, { canSeePayments: canPayments })
      : Promise.resolve(null),
    canCosts ? getVehicleMaintenanceCosts(vehicleId) : Promise.resolve(null),
    canImputations && maintenanceIds.length > 0
      ? listImputations({ maintenanceIds })
      : Promise.resolve(canImputations ? [] : null),
  ])

  // Une facture annulée n'a jamais produit de chiffre d'affaires ; un brouillon
  // ne reconnaît encore aucune créance (Workflow 07 §25).
  const engaged = (invoices ?? []).filter(
    (invoice) => invoice.status !== 'CANCELLED' && invoice.status !== 'DRAFT'
  )
  const revenue = invoices === null ? null : engaged.reduce((sum, i) => sum + i.total, 0)
  const collected =
    invoices === null || !canPayments
      ? null
      : engaged.reduce((sum, i) => sum + (i.paidAmount ?? 0), 0)

  const imputed =
    imputations === null
      ? null
      : imputations
          .filter((imputation) => imputation.status !== 'CANCELLED')
          .reduce((sum, imputation) => sum + imputation.amount, 0)

  const netCost = costs === null || imputed === null ? null : costs.actualCost - imputed
  const margin = revenue === null || netCost === null ? null : revenue - netCost

  const unpriced = costs === null ? 0 : maintenances.length - costs.pricedCount
  const kmf = (value: number) => formatAmount(value, { withCurrency: true })

  return (
    <div className="space-y-5">
      <Card
        title="Marge d’exploitation"
        description="Revenus facturés moins le coût d’entretien réellement supporté par ADIKOM."
      >
        <dl>
          <InfoRow
            label="Revenus facturés"
            hint="Factures émises portant une location de ce véhicule. Brouillons et annulées exclus."
          >
            {revenue === null ? (
              <span className="text-xs text-muted">
                Non calculable sans le droit de consulter les factures clients.
              </span>
            ) : (
              <span className="font-medium tabular">{kmf(revenue)}</span>
            )}
          </InfoRow>

          <InfoRow
            label="Dont encaissé"
            hint="Règlements validés. Un revenu facturé n’est pas un revenu reçu."
          >
            {collected === null ? (
              <span className="text-xs text-muted">
                Non calculable sans le droit de consulter les règlements.
              </span>
            ) : (
              <span className="tabular">{kmf(collected)}</span>
            )}
          </InfoRow>

          <InfoRow
            label="Coût d’entretien réel"
            hint="Somme des coûts réels arrêtés. Une estimation n’y entre pas."
          >
            {costs === null ? (
              <span className="text-xs text-muted">
                Non calculable sans le droit de consulter les coûts de maintenance.
              </span>
            ) : (
              <span className="tabular">{kmf(costs.actualCost)}</span>
            )}
          </InfoRow>

          <InfoRow
            label="Imputé aux fournisseurs"
            hint="Ce qu’ADIKOM a déduit des factures fournisseurs. Ce n’est pas un paiement reçu : c’est une charge qu’elle ne supporte pas."
          >
            {imputed === null ? (
              <span className="text-xs text-muted">
                Non calculable sans le droit de consulter les imputations.
              </span>
            ) : (
              <span className="tabular">{imputed > 0 ? `− ${kmf(imputed)}` : kmf(0)}</span>
            )}
          </InfoRow>

          <InfoRow
            label="Coût net supporté"
            hint="Coût réel moins les imputations."
          >
            {netCost === null ? (
              <span className="text-xs text-muted">
                Non calculable : il manque le coût ou les imputations.
              </span>
            ) : (
              <span className="tabular">{kmf(netCost)}</span>
            )}
          </InfoRow>

          <InfoRow
            label="Marge d’exploitation"
            hint="Revenus facturés moins le coût net. Ce n’est PAS une rentabilité complète."
          >
            {margin === null ? (
              <span className="text-xs text-muted">
                Non calculable : toutes les composantes ne sont pas lisibles avec vos droits.
              </span>
            ) : (
              <span
                className={
                  margin < 0 ? 'font-medium text-danger tabular' : 'font-medium text-ink tabular'
                }
              >
                {kmf(margin)}
              </span>
            )}
          </InfoRow>

          <InfoRow label="Contrats pris en compte">
            <span className="tabular">{rentals.length}</span>
          </InfoRow>
        </dl>
      </Card>

      {unpriced > 0 && (
        <Notice tone="warning">
          {unpriced} intervention{unpriced > 1 ? 's' : ''} de ce véhicule n’
          {unpriced > 1 ? 'ont' : 'a'} pas encore de coût réel arrêté : {unpriced > 1 ? 'elles n’entrent' : 'elle n’entre'}{' '}
          donc pas dans le coût ci-dessus. Le chiffre est exact sur ce qui est chiffré, pas
          complet sur ce qui reste à chiffrer.
        </Notice>
      )}

      <Card title="Ce que ce chiffre ne couvre pas">
        <p className="text-sm text-muted">
          Cette marge rapproche deux grandeurs que le système connaît réellement : ce qui a été
          facturé pour ce véhicule, et ce que son entretien a coûté à ADIKOM une fois les
          imputations déduites.
        </p>
        <p className="mt-3 text-sm text-muted">
          Elle <strong>n’est pas une rentabilité complète</strong>. N’y figurent ni
          l’amortissement ou le loyer du véhicule, ni l’assurance, ni le carburant, ni les
          charges générales : aucune de ces dépenses n’est enregistrée par véhicule dans
          ADIKOM PILOT. Les présenter comme nulles donnerait un résultat flatteur et faux.
        </p>
      </Card>
    </div>
  )
}

async function EditPanel({ vehicleId }: { vehicleId: string }) {
  const [vehicle, categories, suppliers, partners] = await Promise.all([
    getVehicleDetail(vehicleId),
    listCategoryOptions(),
    listSupplierOptions(),
    listPartnerOptions(),
  ])

  if (!vehicle) notFound()

  return (
    <Card className="max-w-4xl">
      <VehicleForm
        mode="edit"
        vehicle={vehicle}
        categories={categories}
        suppliers={suppliers}
        partners={partners}
      />
    </Card>
  )
}

async function AvailabilityTab({ vehicleId, editable }: { vehicleId: string; editable: boolean }) {
  const occupations = await listOccupations(vehicleId)

  return (
    <Card
      title="Calendrier du véhicule"
      description="Toutes origines confondues : immobilisations, et plus tard réservations, locations et maintenances."
    >
      <AvailabilityPanel vehicleId={vehicleId} occupations={occupations} editable={editable} />
    </Card>
  )
}

async function SupplierTab({
  vehicle,
  editable,
}: {
  vehicle: NonNullable<Awaited<ReturnType<typeof getVehicleDetail>>>
  editable: boolean
}) {
  const [history, suppliers, partners] = await Promise.all([
    listSupplierHistory(vehicle.id),
    listSupplierOptions(),
    listPartnerOptions(),
  ])

  return (
    <Card
      title="Rattachement fournisseur"
      description="Un véhicule n’a qu’un fournisseur actif à la fois. Chaque changement est daté et conservé."
    >
      <SupplierPanel
        vehicleId={vehicle.id}
        currentOrigin={vehicle.origin}
        currentSupplierLabel={vehicle.supplierLabel}
        currentPartnerLabel={vehicle.partnerLabel}
        history={history}
        suppliers={suppliers}
        partners={partners}
        editable={editable}
      />
    </Card>
  )
}

async function DocumentsTab({ vehicleId }: { vehicleId: string }) {
  const [documents, canCreate, canArchive] = await Promise.all([
    listVehicleDocuments(vehicleId),
    can(PERMISSIONS.VEHICLE_DOCUMENTS_CREATE),
    can(PERMISSIONS.VEHICLE_DOCUMENTS_ARCHIVE),
  ])

  return (
    <Card
      title="Documents et échéances"
      description="Les fichiers sont stockés hors de portée du navigateur et servis par lien signé."
    >
      <DocumentsPanel
        vehicleId={vehicleId}
        documents={documents}
        canCreate={canCreate}
        canArchive={canArchive}
        canView
      />
    </Card>
  )
}

/**
 * Tarifs applicables à ce véhicule : ceux qui le visent nommément, et ceux de
 * sa catégorie. Vue de lecture — la gestion se fait depuis l'écran Tarification.
 */
async function PricingTab({ vehicleId, categoryId }: { vehicleId: string; categoryId: string }) {
  const [vehicleRules, categoryRules] = await Promise.all([
    listPricingRules({ vehicleId }),
    listPricingRules({ categoryId }),
  ])

  const rules = [...vehicleRules, ...categoryRules]

  return (
    <Card
      title="Tarifs applicables"
      description="Tarifs visant ce véhicule ou sa catégorie. La gestion se fait depuis l’écran Tarification."
    >
      {rules.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Aucun tarif ne vise ce véhicule ni sa catégorie. Un tarif standard général peut néanmoins
          s’appliquer.
        </p>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink tabular">
                  {rule.amount != null && rule.unit ? formatPrice(rule.amount, rule.unit) : '—'}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {rule.vehicleId ? 'Tarif du véhicule' : `Tarif de la catégorie`}
                  {rule.clientLabel ? ` · ${rule.clientLabel}` : ' · tous clients'}
                </p>
              </div>
              <Badge tone={rule.clientId ? 'info' : 'neutral'}>
                <Tags className="mr-1 size-3.5" aria-hidden />
                {rule.clientId ? 'Préférentiel' : 'Standard'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * Incidents connus de ce véhicule.
 *
 * L'HISTOIRE DU VÉHICULE, PAS CELLE D'UNE LOCATION.
 *
 * Un incident survenu hors exploitation y figure au même titre qu'un dommage
 * constaté au retour : c'est le véhicule qui les a subis, et c'est sa fiche qui
 * doit permettre de les retrouver des mois plus tard.
 *
 * L'onglet lui-même n'existe que si le lecteur peut consulter les incidents :
 * sans le droit, il ne s'affiche pas vide (DEC-017).
 */
async function IncidentsTab({ vehicleId }: { vehicleId: string }) {
  const incidents = await listVehicleIncidents(vehicleId)

  return (
    <Card
      title="Incidents"
      description="Constats enregistrés sur ce véhicule. Aucun montant : les barèmes ne sont pas définis."
    >
      {incidents.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Aucun incident n’a été constaté sur ce véhicule.
        </p>
      ) : (
        <ul className="space-y-3">
          {incidents.map((incident) => (
            <li key={incident.id} className="rounded-control border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/location/incidents/${incident.id}`}
                    className="font-medium text-adikom-500 hover:underline"
                  >
                    {INCIDENT_KIND_LABELS[incident.kind]}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted tabular">
                    {incident.incidentNo} · {formatDateTime(incident.occurredAt)}
                  </p>
                </div>
                <Badge tone={INCIDENT_STATUS_TONES[incident.status]}>
                  {INCIDENT_STATUS_LABELS[incident.status]}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{incident.description}</p>
              <p className="mt-2 text-xs text-muted">
                {incident.damageCount} dommage{incident.damageCount > 1 ? 's' : ''} constaté
                {incident.damageCount > 1 ? 's' : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * Interventions connues de ce véhicule.
 *
 * La ligne dit ce qui compte pour le parc : l'intervention a-t-elle SORTI le
 * véhicule du service, ou non ? Une maintenance sans période d'immobilisation
 * ne bloque aucun calendrier, et l'écrire évite de croire qu'un véhicule était
 * indisponible parce qu'il était suivi.
 *
 * Aucun coût n'y figure : les montants relèvent d'un lot ultérieur.
 *
 * L'onglet n'existe que si le lecteur peut consulter les maintenances : sans le
 * droit, il ne s'affiche pas vide (DEC-017).
 */
async function MaintenanceTab({ vehicleId }: { vehicleId: string }) {
  const maintenances = await listVehicleMaintenances(vehicleId)

  return (
    <Card
      title="Maintenance"
      description="Interventions déclarées sur ce véhicule. Les coûts relèvent d’une étape ultérieure."
    >
      {maintenances.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Aucune intervention n’a été déclarée sur ce véhicule.
        </p>
      ) : (
        <ul className="space-y-3">
          {maintenances.map((maintenance) => (
            <li key={maintenance.id} className="rounded-control border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/location/maintenance/${maintenance.id}`}
                    className="font-medium text-adikom-500 hover:underline"
                  >
                    {maintenance.reason}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted tabular">
                    {maintenance.maintenanceNo} ·{' '}
                    {MAINTENANCE_ORIGIN_LABELS[maintenance.origin]} ·{' '}
                    {MAINTENANCE_PRIORITY_LABELS[maintenance.priority]}
                  </p>
                </div>
                <Badge tone={MAINTENANCE_STATUS_TONES[maintenance.status]}>
                  {MAINTENANCE_STATUS_LABELS[maintenance.status]}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted">
                {maintenance.immobilizationFrom
                  ? `Immobilisé du ${formatDateTime(maintenance.immobilizationFrom)} au ${formatDateTime(maintenance.immobilizationTo)}`
                  : 'Sans immobilisation — le véhicule est resté louable'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
