import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'

import {
  Badge,
  ButtonLink,
  Card,
  Empty,
  InfoRow,
  PageHeader,
} from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { StatusChangeForm } from '@/components/ui/status-change-form'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, todayISO } from '@/lib/dates'
import {
  getService,
  listPurchaseCosts,
  listSalePrices,
  listServiceCategories,
  listServiceVariants,
  PURPOSE_HELP,
  PURPOSE_LABELS,
  resolvePurchaseCost,
  resolveSalePrice,
  STATUS_HELP,
  STATUS_LABELS,
  STATUS_TONES,
  type ServicePurpose,
  type ServiceStatus,
} from '@/features/catalog/data'
import { setServiceStatusAction } from '@/features/catalog/actions'
import { ServiceForm } from '@/features/catalog/service-form'
import { ServiceVariantsPanel, type VariantPricing } from '@/features/catalog/variants-panel'
import { EntityHistoryPanel } from '@/features/audit/history-panel'

export const metadata: Metadata = { title: 'Fiche service' }

/**
 * Fiche d'un service — LOT 20, DEC-043.
 *
 * TROIS ONGLETS, ET AUCUN « À VENIR » (DEC-042 §d) :
 *
 *   · Service    — identité, destination, statut ;
 *   · Variantes & prix — le cœur du lot : versions datées, marge, coûts ;
 *   · Journal    — qui a changé quoi, sous `users.audit.view`.
 *
 * Un onglet qui n'est pas ouvert n'est PAS AFFICHÉ : le montrer vide
 * certifierait qu'il n'y a rien à voir, alors qu'on ne fait que refuser la
 * lecture (DEC-017).
 */
export default async function ServiceDetailPage(props: PageProps<'/catalogue/services/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.SERVICES_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const service = await getService(id)
  if (!service) notFound()

  const tab = typeof searchParams.onglet === 'string' ? searchParams.onglet : 'service'
  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'

  const [canUpdate, canArchive, canUpdatePrice, canSeeCost, canUpdateCost, canReadAudit] =
    await Promise.all([
      can(PERMISSIONS.SERVICES_UPDATE),
      can(PERMISSIONS.SERVICES_ARCHIVE),
      can(PERMISSIONS.SERVICES_PRICE_UPDATE),
      // LA CAPACITÉ, ET NON LE RÉSULTAT DE LA REQUÊTE, décide du message :
      // RLS rend zéro ligne sans lever d'erreur (DEC-017).
      can(PERMISSIONS.SERVICES_COST_VIEW),
      can(PERMISSIONS.SERVICES_COST_UPDATE),
      can(PERMISSIONS.AUDIT_VIEW),
    ])

  const tabs: TabItem[] = [
    { key: 'service', label: 'Service', href: `/catalogue/services/${id}` },
    {
      key: 'prix',
      label: 'Variantes & prix',
      href: `/catalogue/services/${id}?onglet=prix`,
    },
    ...(canReadAudit
      ? [{ key: 'journal', label: 'Journal', href: `/catalogue/services/${id}?onglet=journal` }]
      : []),
  ]

  return (
    <>
      <Link
        href="/catalogue/services"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux services
      </Link>

      <PageHeader
        title={service.label}
        description={`${service.serviceNo} · ${PURPOSE_LABELS[service.purpose]}`}
        actions={
          canUpdate && !editing ? (
            <ButtonLink
              href={`/catalogue/services/${id}?mode=edition`}
              tone="secondary"
              icon={Pencil}
            >
              Modifier
            </ButtonLink>
          ) : undefined
        }
      />

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Le service a été créé, avec sa variante « Standard ». Ouvrez l’onglet « Variantes &
          prix » pour lui donner un prix.
        </Notice>
      )}
      {justSaved && (
        <Notice tone="success" className="mb-5">
          Les modifications ont été enregistrées.
        </Notice>
      )}

      <Tabs items={tabs} current={tab} />

      {tab === 'prix' ? (
        <PricingTab
          service={service}
          canUpdate={canUpdate}
          canUpdatePrice={canUpdatePrice}
          canSeeCost={canSeeCost}
          canUpdateCost={canUpdateCost}
        />
      ) : tab === 'journal' && canReadAudit ? (
        <Card title="Journal du service">
          <EntityHistoryPanel
            entityId={id}
            description="Ce qui a été enregistré sur ce service, du plus récent au plus ancien. Le détail d’un prix d’achat reste réservé à qui peut le lire."
          />
        </Card>
      ) : editing && canUpdate ? (
        <EditTab service={service} />
      ) : (
        <IdentityTab
          service={service}
          canArchive={canArchive}
        />
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */

async function EditTab({ service }: { service: Awaited<ReturnType<typeof getService>> }) {
  if (!service) return null

  const categories = await listServiceCategories(false)

  // La catégorie actuelle reste proposée même archivée : sinon le formulaire
  // effacerait silencieusement un classement que personne n'a demandé à changer.
  const options = categories.map((category) => ({ id: category.id, label: category.label }))
  if (!options.some((option) => option.id === service.categoryId) && service.categoryLabel) {
    options.unshift({
      id: service.categoryId,
      label: `${service.categoryLabel} (archivée)`,
    })
  }

  return (
    <Card className="max-w-3xl">
      <ServiceForm mode="edit" service={service} categories={options} />
    </Card>
  )
}

function IdentityTab({
  service,
  canArchive,
}: {
  service: NonNullable<Awaited<ReturnType<typeof getService>>>
  canArchive: boolean
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title="Identité">
        <dl>
          <InfoRow label="Référence">
            <span className="tabular">{service.serviceNo}</span>
          </InfoRow>
          <InfoRow label="Libellé">{service.label}</InfoRow>
          <InfoRow label="Catégorie">
            {service.categoryLabel ? (
              <>
                {service.categoryLabel}
                {!service.categoryIsActive && (
                  <span className="ml-2 text-xs text-muted">(archivée)</span>
                )}
              </>
            ) : (
              <Empty />
            )}
          </InfoRow>
          <InfoRow label="Destination" hint={PURPOSE_HELP[service.purpose as ServicePurpose]}>
            {PURPOSE_LABELS[service.purpose as ServicePurpose]}
          </InfoRow>
          <InfoRow label="Unité d’exploitation">
            {service.unitLabel ?? <Empty />}
          </InfoRow>
          <InfoRow label="Description">{service.description ?? <Empty />}</InfoRow>
          <InfoRow label="Notes internes">{service.notes ?? <Empty />}</InfoRow>
          <InfoRow label="Créé le">{formatDate(service.createdAt) ?? <Empty />}</InfoRow>
        </dl>
      </Card>

      <div className="space-y-5">
        <Card title="Statut">
          <div className="mb-4 flex items-center gap-2">
            <Badge tone={STATUS_TONES[service.status as ServiceStatus]}>
              {STATUS_LABELS[service.status as ServiceStatus]}
            </Badge>
            <span className="text-xs text-muted">
              {STATUS_HELP[service.status as ServiceStatus]}
            </span>
          </div>

          {canArchive ? (
            <StatusChangeForm
              action={setServiceStatusAction}
              entityId={service.id}
              entityField="serviceId"
              currentStatus={service.status as ServiceStatus}
              labels={STATUS_LABELS}
              hints={STATUS_HELP}
              reasonPlaceholder="Pourquoi ce changement ?"
            />
          ) : (
            <p className="text-xs text-muted">
              Changer le statut d’un service relève d’une capacité dédiée, distincte de la
              modification de sa fiche.
            </p>
          )}
        </Card>

        <Card title="Variantes">
          <p className="text-sm text-muted">
            {service.variantCount} variante{service.variantCount > 1 ? 's' : ''}. Les prix sont
            portés par les variantes, jamais par le service.
          </p>
          <p className="mt-3">
            <Link
              href={`/catalogue/services/${service.id}?onglet=prix`}
              className="text-sm text-adikom-500 hover:underline"
            >
              Ouvrir les variantes et les prix
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

async function PricingTab({
  service,
  canUpdate,
  canUpdatePrice,
  canSeeCost,
  canUpdateCost,
}: {
  service: NonNullable<Awaited<ReturnType<typeof getService>>>
  canUpdate: boolean
  canUpdatePrice: boolean
  canSeeCost: boolean
  canUpdateCost: boolean
}) {
  const today = todayISO()
  const variants = await listServiceVariants(service.id)
  const variantIds = variants.map((variant) => variant.id)

  /*
   * LE PRIX APPLICABLE EST RÉSOLU EN BASE, variante par variante.
   *
   * Le déduire de l'historique côté écran serait une SECONDE implémentation de
   * D16(c), qui finirait par diverger de celle du reste du SaaS. Le coût est
   * un aller-retour par variante — une poignée, jamais une liste.
   */
  const [saleHistory, costHistory, resolvedSales, resolvedCosts] = await Promise.all([
    listSalePrices(variantIds),
    canSeeCost ? listPurchaseCosts(variantIds) : Promise.resolve([]),
    Promise.all(variantIds.map((variantId) => resolveSalePrice(variantId, today))),
    canSeeCost
      ? Promise.all(variantIds.map((variantId) => resolvePurchaseCost(variantId, today)))
      : Promise.resolve(variantIds.map(() => null)),
  ])

  const rows: VariantPricing[] = variants.map((variant, index) => ({
    variant,
    salePrice: resolvedSales[index],
    purchaseCost: resolvedCosts[index],
    saleHistory: saleHistory.filter((version) => version.variantId === variant.id),
    costHistory: costHistory.filter((version) => version.variantId === variant.id),
  }))

  return (
    <Card
      title="Variantes et prix"
      description="Un prix est une ligne datée : changer un prix clôt la version courante et en ouvre une nouvelle."
    >
      <ServiceVariantsPanel
        serviceId={service.id}
        purpose={service.purpose as ServicePurpose}
        status={service.status}
        today={today}
        rows={rows}
        canUpdate={canUpdate}
        canUpdatePrice={canUpdatePrice}
        canSeeCost={canSeeCost}
        canUpdateCost={canUpdateCost}
      />
    </Card>
  )
}
