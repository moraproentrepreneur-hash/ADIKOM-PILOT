import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CarFront, Lock, Pencil } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { StatusChangeForm } from '@/components/ui/status-change-form'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import {
  getSupplierBankDetails,
  getSupplierDetail,
  STATUS_HINTS,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
} from '@/features/suppliers/data'
import { setSupplierStatusAction } from '@/features/suppliers/actions'
import { SupplierForm } from '@/features/suppliers/supplier-form'
import { BankDetailsForm } from '@/features/suppliers/bank-details-form'
import { listVehicles, STATUS_LABELS as VEHICLE_STATUS_LABELS, STATUS_TONES as VEHICLE_STATUS_TONES } from '@/features/fleet/data'

export const metadata: Metadata = { title: 'Fiche fournisseur' }

export default async function SupplierDetailPage(props: PageProps<'/tiers/fournisseurs/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.SUPPLIERS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const supplier = await getSupplierDetail(id)
  if (!supplier) notFound()

  const requestedTab = typeof searchParams.onglet === 'string' ? searchParams.onglet : 'informations'
  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'

  const [canUpdate, canArchive, canViewBank, canUpdateBank, canViewFleet, canDownload, canPrint] =
    await Promise.all([
      can(PERMISSIONS.SUPPLIERS_UPDATE),
      can(PERMISSIONS.SUPPLIERS_ARCHIVE),
      can(PERMISSIONS.SUPPLIERS_BANK_VIEW),
      can(PERMISSIONS.SUPPLIERS_BANK_UPDATE),
      can(PERMISSIONS.FLEET_VIEW),
      // DEC-024 : produire un document et l'imprimer sont deux capacités
      // distinctes de la consultation, attribuables séparément.
      can(PERMISSIONS.SUPPLIERS_DOWNLOAD),
      can(PERMISSIONS.SUPPLIERS_PRINT),
    ])

  const tabs: TabItem[] = [
    { key: 'informations', label: 'Informations', href: `/tiers/fournisseurs/${id}` },
    ...(canViewFleet
      ? [
          {
            key: 'vehicules',
            label: 'Véhicules',
            href: `/tiers/fournisseurs/${id}?onglet=vehicules`,
          },
        ]
      : []),
    ...(canViewBank
      ? [
          {
            key: 'banque',
            label: 'Coordonnées bancaires',
            href: `/tiers/fournisseurs/${id}?onglet=banque`,
          },
        ]
      : []),
    { key: 'factures', label: 'Factures', planned: true },
    { key: 'imputations', label: 'Imputations', planned: true },
    { key: 'reglements', label: 'Règlements', planned: true },
    { key: 'documents', label: 'Documents', planned: true },
  ]

  const tab = tabs.some((item) => item.key === requestedTab && item.href)
    ? requestedTab
    : 'informations'

  return (
    <>
      <Link
        href="/tiers/fournisseurs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Fournisseur créé. Son identifiant est <strong>{supplier.supplierNo}</strong>.
        </Notice>
      )}

      {justSaved && (
        <Notice tone="success" className="mb-5">
          Les informations du fournisseur ont été enregistrées.
        </Notice>
      )}

      <PageHeader
        title={supplier.legalName}
        description={supplier.tradeName ?? undefined}
        actions={
          <>
            <DocumentToolbar
              type="fournisseurs"
              id={id}
              label={`fiche de ${supplier.legalName}`}
              canDownload={canDownload}
              canPrint={canPrint}
            />
            {canUpdate && !editing && (
              <Link
                href={`/tiers/fournisseurs/${id}?mode=edition`}
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
        <Badge tone={STATUS_TONES[supplier.status]}>{STATUS_LABELS[supplier.status]}</Badge>
        <Badge>{TYPE_LABELS[supplier.type]}</Badge>
        <span className="text-sm text-muted tabular">{supplier.supplierNo}</span>
      </div>

      <Tabs items={tabs} current={tab} />

      {tab === 'vehicules' ? (
        <VehiclesTab supplierId={id} />
      ) : tab === 'banque' ? (
        <BankTab supplierId={id} editable={canUpdateBank} />
      ) : editing && canUpdate ? (
        <Card className="max-w-4xl">
          <SupplierForm mode="edit" supplier={supplier} />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card title="Coordonnées">
              <dl>
                <InfoRow label="Personne de contact">{supplier.contactName ?? <Empty />}</InfoRow>
                <InfoRow label="Téléphone">{supplier.phone}</InfoRow>
                <InfoRow label="Téléphone secondaire">
                  {supplier.phoneSecondary ?? <Empty />}
                </InfoRow>
                <InfoRow label="Email">{supplier.email ?? <Empty />}</InfoRow>
                <InfoRow label="Adresse">{supplier.address ?? <Empty />}</InfoRow>
                <InfoRow label="Ville">{supplier.city ?? <Empty />}</InfoRow>
                <InfoRow label="Pays">{supplier.country ?? <Empty />}</InfoRow>
              </dl>
            </Card>

            <Card title="Informations administratives">
              <dl>
                <InfoRow label="Registre du commerce">
                  {supplier.registrationNumber ?? <Empty />}
                </InfoRow>
                <InfoRow label="Identifiant fiscal">{supplier.taxIdentifier ?? <Empty />}</InfoRow>
                <InfoRow label="Notes administratives">
                  {supplier.administrativeNotes ?? <Empty />}
                </InfoRow>
              </dl>
            </Card>

            {supplier.notes && (
              <Card title="Observations">
                <p className="text-sm whitespace-pre-line text-ink">{supplier.notes}</p>
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card title="Fiche">
              <dl>
                <InfoRow label="Identifiant">
                  <span className="tabular">{supplier.supplierNo}</span>
                </InfoRow>
                <InfoRow label="Statut">
                  <Badge tone={STATUS_TONES[supplier.status]}>
                    {STATUS_LABELS[supplier.status]}
                  </Badge>
                </InfoRow>
                {supplier.statusReason && (
                  <InfoRow label="Motif" hint={formatDate(supplier.statusChangedAt) ?? undefined}>
                    {supplier.statusReason}
                  </InfoRow>
                )}
                <InfoRow label="Créée le">{formatDateTime(supplier.createdAt)}</InfoRow>
                <InfoRow label="Modifiée le">{formatDateTime(supplier.updatedAt)}</InfoRow>
              </dl>
            </Card>

            {canArchive && (
              <Card
                title="Statut du fournisseur"
                description="Seul un fournisseur actif peut recevoir de nouvelles opérations."
              >
                <StatusChangeForm
                  action={setSupplierStatusAction}
                  entityId={id}
                  entityField="supplierId"
                  currentStatus={supplier.status}
                  labels={STATUS_LABELS}
                  hints={STATUS_HINTS}
                  reasonPlaceholder="Fin de contrat, litige, inactivité…"
                />
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** Véhicules rattachés au fournisseur (03_Modules/04_Tiers.md §10.1). */
async function VehiclesTab({ supplierId }: { supplierId: string }) {
  const vehicles = await listVehicles({ supplierId })

  return (
    <Card
      title="Véhicules rattachés"
      description="Véhicules actuellement mis à disposition par ce fournisseur."
    >
      {vehicles.length === 0 ? (
        <EmptyState
          icon={CarFront}
          title="Aucun véhicule rattaché"
          description="Le rattachement se fait depuis la fiche d’un véhicule, où il est historisé."
        />
      ) : (
        <ul className="space-y-3">
          {vehicles.map((vehicle) => (
            <li key={vehicle.id}>
              <Link
                href={`/location/parc/${vehicle.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {vehicle.brand} {vehicle.model}
                  </p>
                  <p className="text-xs text-muted tabular">
                    {vehicle.vehicleNo}
                    {vehicle.plate ? ` · ${vehicle.plate}` : ''}
                    {vehicle.categoryLabel ? ` · ${vehicle.categoryLabel}` : ''}
                  </p>
                </div>
                <Badge tone={VEHICLE_STATUS_TONES[vehicle.status]}>
                  {VEHICLE_STATUS_LABELS[vehicle.status]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * Coordonnées bancaires.
 *
 * L'onglet n'apparaît qu'avec `parties.suppliers.bank.view`, et la lecture est
 * de toute façon filtrée par RLS : un accès direct par URL ne révèle rien.
 */
async function BankTab({ supplierId, editable }: { supplierId: string; editable: boolean }) {
  const details = await getSupplierBankDetails(supplierId)

  return (
    <Card
      title="Coordonnées bancaires"
      description="Donnée sensible : accès et modification soumis à une permission dédiée."
      className="max-w-3xl"
    >
      {!details && !editable ? (
        <EmptyState
          icon={Lock}
          title="Aucune coordonnée enregistrée"
          description="Les coordonnées bancaires de ce fournisseur n’ont pas encore été renseignées."
        />
      ) : (
        <BankDetailsForm supplierId={supplierId} details={details} editable={editable} />
      )}
    </Card>
  )
}
