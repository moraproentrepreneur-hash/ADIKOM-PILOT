import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CarFront, Pencil } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { StatusChangeForm } from '@/components/ui/status-change-form'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import {
  getPartnerDetail,
  STATUS_HINTS,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/partners/data'
import { setPartnerStatusAction } from '@/features/partners/actions'
import { PartnerForm } from '@/features/partners/partner-form'
import {
  listVehicles,
  STATUS_LABELS as VEHICLE_STATUS_LABELS,
  STATUS_TONES as VEHICLE_STATUS_TONES,
} from '@/features/fleet/data'

export const metadata: Metadata = { title: 'Fiche partenaire' }

/**
 * Fiche partenaire — consultation et modification.
 *
 * Les onglets relevant du module Partenariats sont annoncés inertes : la fiche
 * dit ce qu'elle contiendra sans laisser croire à un écran défaillant
 * (03_Modules/04_Tiers.md §11).
 */
export default async function PartnerDetailPage(props: PageProps<'/tiers/partenaires/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.PARTNERS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const partner = await getPartnerDetail(id)
  if (!partner) notFound()

  const requestedTab = typeof searchParams.onglet === 'string' ? searchParams.onglet : 'informations'
  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'

  const [canUpdate, canArchive, canViewFleet, canDownload, canPrint] = await Promise.all([
    can(PERMISSIONS.PARTNERS_UPDATE),
    // DEC-024 : archiver est une capacité distincte de modifier. Un utilisateur
    // peut légitimement corriger une fiche sans avoir le droit de la retirer
    // des listes de sélection.
    can(PERMISSIONS.PARTNERS_ARCHIVE),
    can(PERMISSIONS.FLEET_VIEW),
    // DEC-024 : produire un document et l'imprimer sont deux capacités
    // distinctes de la consultation, attribuables séparément.
    can(PERMISSIONS.PARTNERS_DOWNLOAD),
    can(PERMISSIONS.PARTNERS_PRINT),
  ])

  const tabs: TabItem[] = [
    { key: 'informations', label: 'Informations', href: `/tiers/partenaires/${id}` },
    ...(canViewFleet
      ? [
          {
            key: 'vehicules',
            label: 'Véhicules',
            href: `/tiers/partenaires/${id}?onglet=vehicules`,
          },
        ]
      : []),
    { key: 'conditions', label: 'Conditions', planned: true },
    { key: 'projets', label: 'Projets', planned: true },
    { key: 'documents', label: 'Documents', planned: true },
    { key: 'historique', label: 'Historique', planned: true },
  ]

  const tab = tabs.some((item) => item.key === requestedTab && item.href)
    ? requestedTab
    : 'informations'

  return (
    <>
      <Link
        href="/tiers/partenaires"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Partenaire créé. Son identifiant est <strong>{partner.partnerNo}</strong>.
        </Notice>
      )}

      {justSaved && (
        <Notice tone="success" className="mb-5">
          Les informations du partenaire ont été enregistrées.
        </Notice>
      )}

      <PageHeader
        title={partner.legalName}
        description={partner.tradeName ?? undefined}
        actions={
          <>
            <DocumentToolbar
              type="partenaires"
              id={id}
              label={`fiche de ${partner.legalName}`}
              canDownload={canDownload}
              canPrint={canPrint}
            />
            {canUpdate && !editing && (
              <Link
                href={`/tiers/partenaires/${id}?mode=edition`}
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
        <Badge tone={STATUS_TONES[partner.status]}>{STATUS_LABELS[partner.status]}</Badge>
        <span className="text-sm text-muted tabular">{partner.partnerNo}</span>
      </div>

      <Tabs items={tabs} current={tab} />

      {tab === 'vehicules' ? (
        <VehiclesTab partnerId={id} />
      ) : editing && canUpdate ? (
        <Card className="max-w-4xl">
          <PartnerForm mode="edit" partner={partner} />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card title="Coordonnées">
              <dl>
                <InfoRow label="Personne de contact">{partner.contactName ?? <Empty />}</InfoRow>
                <InfoRow label="Téléphone">{partner.phone ?? <Empty />}</InfoRow>
                <InfoRow label="Email">{partner.email ?? <Empty />}</InfoRow>
                <InfoRow label="Adresse">{partner.address ?? <Empty />}</InfoRow>
                <InfoRow label="Ville">{partner.city ?? <Empty />}</InfoRow>
                <InfoRow label="Pays">{partner.country ?? <Empty />}</InfoRow>
              </dl>
            </Card>

            <Card title="Informations administratives">
              <dl>
                <InfoRow label="Registre du commerce">
                  {partner.registrationNumber ?? <Empty />}
                </InfoRow>
              </dl>
            </Card>

            {partner.notes && (
              <Card title="Observations">
                <p className="text-sm whitespace-pre-line text-ink">{partner.notes}</p>
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card title="Fiche">
              <dl>
                <InfoRow label="Identifiant">
                  <span className="tabular">{partner.partnerNo}</span>
                </InfoRow>
                <InfoRow label="Statut">
                  <Badge tone={STATUS_TONES[partner.status]}>
                    {STATUS_LABELS[partner.status]}
                  </Badge>
                </InfoRow>
                {partner.statusReason && (
                  <InfoRow label="Motif" hint={formatDate(partner.statusChangedAt) ?? undefined}>
                    {partner.statusReason}
                  </InfoRow>
                )}
                <InfoRow label="Véhicules rattachés">
                  <span className="tabular">{partner.vehicleCount}</span>
                </InfoRow>
                <InfoRow label="Créée le">{formatDateTime(partner.createdAt)}</InfoRow>
                <InfoRow label="Modifiée le">{formatDateTime(partner.updatedAt)}</InfoRow>
              </dl>
            </Card>

            {canArchive && (
              <Card
                title="Statut du partenaire"
                description="Seul un partenaire actif peut recevoir de nouveaux véhicules."
              >
                <StatusChangeForm
                  action={setPartnerStatusAction}
                  entityId={id}
                  entityField="partnerId"
                  currentStatus={partner.status}
                  labels={STATUS_LABELS}
                  hints={STATUS_HINTS}
                  reasonPlaceholder="Fin de partenariat, inactivité, décision interne…"
                />
              </Card>
            )}

            <Card title="Périmètre actuel">
              <p className="text-sm text-muted">
                Cette fiche couvre l’identité du partenaire. La gestion du partenariat —
                conditions, contrats, projets communs — relèvera du module Partenariats.
              </p>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

/** Véhicules rattachés au partenaire — via `partner_id`, jamais le fournisseur. */
async function VehiclesTab({ partnerId }: { partnerId: string }) {
  const vehicles = await listVehicles({ partnerId })

  return (
    <Card
      title="Véhicules rattachés"
      description="Véhicules actuellement exploités dans le cadre de ce partenariat."
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
