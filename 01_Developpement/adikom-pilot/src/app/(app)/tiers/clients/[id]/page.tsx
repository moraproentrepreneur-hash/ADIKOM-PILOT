import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'

import { Badge, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { StatusChangeForm } from '@/components/ui/status-change-form'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import {
  getClientDetail,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
} from '@/features/clients/data'
import { setClientStatusAction } from '@/features/clients/actions'
import { ClientForm } from '@/features/clients/client-form'
import { listPricingRules } from '@/features/pricing/data'
import { PricingRulesPanel } from '@/features/pricing/rules-panel'
import { listCategoryOptions, listVehicleOptions } from '@/features/fleet/data'

export const metadata: Metadata = { title: 'Fiche client' }

export default async function ClientDetailPage(props: PageProps<'/tiers/clients/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.CLIENTS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const client = await getClientDetail(id)
  if (!client) notFound()

  const tab = searchParams.onglet === 'tarification' ? 'tarification' : 'informations'
  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'

  const [canUpdate, canArchive, canViewPricing, canDownload, canPrint] = await Promise.all([
    can(PERMISSIONS.CLIENTS_UPDATE),
    can(PERMISSIONS.CLIENTS_ARCHIVE),
    can(PERMISSIONS.CLIENTS_PRICING_VIEW),
    // DEC-024 : produire un document et l'imprimer sont deux capacités
    // distinctes de la consultation, attribuables séparément.
    can(PERMISSIONS.CLIENTS_DOWNLOAD),
    can(PERMISSIONS.CLIENTS_PRINT),
  ])

  /*
   * Organisation documentée de la fiche (03_Modules/04_Tiers.md §8.2). Les
   * onglets relevant des étapes 2.3 à 2.5 sont affichés inertes : la fiche
   * annonce ce qu'elle contiendra, sans laisser croire à un écran défaillant.
   */
  const tabs: TabItem[] = [
    { key: 'informations', label: 'Informations', href: `/tiers/clients/${id}` },
    ...(canViewPricing
      ? [
          {
            key: 'tarification',
            label: 'Tarification',
            href: `/tiers/clients/${id}?onglet=tarification`,
          },
        ]
      : []),
    { key: 'reservations', label: 'Réservations', planned: true },
    { key: 'locations', label: 'Locations', planned: true },
    { key: 'factures', label: 'Factures', planned: true },
    { key: 'paiements', label: 'Paiements', planned: true },
    { key: 'documents', label: 'Documents', planned: true },
    { key: 'historique', label: 'Historique', planned: true },
  ]

  return (
    <>
      <Link
        href="/tiers/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Client créé. Son identifiant est <strong>{client.clientNo}</strong>.
        </Notice>
      )}

      {justSaved && (
        <Notice tone="success" className="mb-5">
          Les informations du client ont été enregistrées.
        </Notice>
      )}

      <PageHeader
        title={client.displayName}
        description={client.tradeName ?? undefined}
        actions={
          <>
            <DocumentToolbar
              type="clients"
              id={id}
              label={`fiche de ${client.displayName}`}
              canDownload={canDownload}
              canPrint={canPrint}
            />
            {canUpdate && !editing && (
              <Link
                href={`/tiers/clients/${id}?mode=edition`}
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
        <Badge tone={STATUS_TONES[client.status]}>{STATUS_LABELS[client.status]}</Badge>
        <Badge>{TYPE_LABELS[client.type]}</Badge>
        <span className="text-sm text-muted tabular">{client.clientNo}</span>
      </div>

      <Tabs items={tabs} current={tab} />

      {tab === 'informations' ? (
        editing && canUpdate ? (
          <Card className="max-w-4xl">
            <ClientForm mode="edit" client={client} />
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Card title="Coordonnées">
                <dl>
                  <InfoRow label="Téléphone">{client.phone}</InfoRow>
                  <InfoRow label="Téléphone secondaire">
                    {client.phoneSecondary ?? <Empty />}
                  </InfoRow>
                  <InfoRow label="Email">{client.email ?? <Empty />}</InfoRow>
                  <InfoRow label="Adresse">{client.address ?? <Empty />}</InfoRow>
                  <InfoRow label="Ville">{client.city ?? <Empty />}</InfoRow>
                  <InfoRow label="Pays">{client.country ?? <Empty />}</InfoRow>
                </dl>
              </Card>

              <Card title="Identification">
                <dl>
                  <InfoRow label="Type de pièce">{client.idDocumentType ?? <Empty />}</InfoRow>
                  <InfoRow label="Numéro de pièce">{client.idDocumentNumber ?? <Empty />}</InfoRow>
                  <InfoRow label="Registre du commerce">
                    {client.registrationNumber ?? <Empty />}
                  </InfoRow>
                  <InfoRow label="Identifiant fiscal">{client.taxIdentifier ?? <Empty />}</InfoRow>
                  <InfoRow label="Notes administratives">
                    {client.administrativeNotes ?? <Empty />}
                  </InfoRow>
                </dl>
              </Card>

              {client.notes && (
                <Card title="Observations">
                  <p className="text-sm whitespace-pre-line text-ink">{client.notes}</p>
                </Card>
              )}
            </div>

            <div className="space-y-5">
              <Card title="Fiche">
                <dl>
                  <InfoRow label="Identifiant">
                    <span className="tabular">{client.clientNo}</span>
                  </InfoRow>
                  <InfoRow label="Statut">
                    <Badge tone={STATUS_TONES[client.status]}>
                      {STATUS_LABELS[client.status]}
                    </Badge>
                  </InfoRow>
                  {client.statusReason && (
                    <InfoRow label="Motif" hint={formatDate(client.statusChangedAt) ?? undefined}>
                      {client.statusReason}
                    </InfoRow>
                  )}
                  <InfoRow label="Créée le">{formatDateTime(client.createdAt)}</InfoRow>
                  <InfoRow label="Modifiée le">{formatDateTime(client.updatedAt)}</InfoRow>
                </dl>
              </Card>

              {canArchive && (
                <Card
                  title="Statut du client"
                  description="L’archivage retire le client des nouvelles opérations sans supprimer son historique."
                >
                  <StatusChangeForm
                    action={setClientStatusAction}
                    entityId={id}
                    entityField="clientId"
                    currentStatus={client.status}
                    labels={STATUS_LABELS}
                    reasonPlaceholder="Fin de relation, doublon, demande du client…"
                    hints={{
                      ARCHIVED:
                        'Le client ne sera plus proposé pour de nouvelles opérations. Réservations, locations et factures passées sont conservées.',
                      INACTIVE: 'Le client reste consultable mais n’est plus proposé par défaut.',
                      ACTIVE: 'Le client redevient sélectionnable dans les opérations.',
                      PROSPECT: 'Le client est identifié comme prospect, sans opération en cours.',
                    }}
                  />
                </Card>
              )}
            </div>
          </div>
        )
      ) : (
        <PricingTab clientId={id} />
      )}
    </>
  )
}

/**
 * Conditions tarifaires du client (03_Modules/04_Tiers.md §8.4).
 *
 * Le panneau n'est rendu qu'avec la permission de consultation, et la
 * modification exige `parties.clients.pricing.manage` — vérifiée à nouveau par
 * l'action serveur, jamais seulement ici.
 */
async function PricingTab({ clientId }: { clientId: string }) {
  const [rules, categories, vehicles, canManage] = await Promise.all([
    listPricingRules({ clientId, includeInactive: true }),
    listCategoryOptions(),
    listVehicleOptions(),
    can(PERMISSIONS.CLIENTS_PRICING_MANAGE),
  ])

  return (
    <Card
      title="Conditions tarifaires"
      description="Tarifs préférentiels applicables à ce client. Sans condition, le tarif standard s’applique."
    >
      <PricingRulesPanel
        rules={rules}
        categories={categories}
        vehicles={vehicles}
        clientId={clientId}
        editable={canManage}
      />
    </Card>
  )
}
