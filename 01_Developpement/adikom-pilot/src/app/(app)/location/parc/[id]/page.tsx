import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil, Tags } from 'lucide-react'

import { Badge, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
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
import { formatPrice } from '@/features/pricing/constants'

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
    { key: 'locations', label: 'Locations', planned: true },
    { key: 'maintenance', label: 'Maintenance', planned: true },
    { key: 'rentabilite', label: 'Rentabilité', planned: true },
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
                className="inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
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
