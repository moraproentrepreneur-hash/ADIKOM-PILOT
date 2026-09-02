import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Banknote, Pencil, Receipt } from 'lucide-react'

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
import { listCustomerInvoicesForClient } from '@/features/customer-invoices/data'
import {
  CUSTOMER_INVOICE_STATUS_LABELS,
  CUSTOMER_INVOICE_STATUS_TONES,
  displayStatus as displayInvoiceStatus,
  formatAmount,
} from '@/features/customer-invoices/constants'
import { listClientPayments } from '@/features/customer-payments/data'
import { PAYMENT_METHOD_LABELS } from '@/features/treasury/constants'

export const metadata: Metadata = { title: 'Fiche client' }

export default async function ClientDetailPage(props: PageProps<'/tiers/clients/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.CLIENTS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const client = await getClientDetail(id)
  if (!client) notFound()

  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'
  const justSaved = searchParams.enregistre === '1'

  const [
    canUpdate,
    canArchive,
    canViewPricing,
    canDownload,
    canPrint,
    canViewInvoices,
    canViewPayments,
  ] = await Promise.all([
    can(PERMISSIONS.CLIENTS_UPDATE),
    can(PERMISSIONS.CLIENTS_ARCHIVE),
    can(PERMISSIONS.CLIENTS_PRICING_VIEW),
    // DEC-024 : produire un document et l'imprimer sont deux capacités
    // distinctes de la consultation, attribuables séparément.
    can(PERMISSIONS.CLIENTS_DOWNLOAD),
    can(PERMISSIONS.CLIENTS_PRINT),
    // Consulter un client n'est pas consulter ses créances : l'onglet ne
    // s'ouvre qu'à qui a le droit de voir les factures (DEC-024).
    can(PERMISSIONS.CUSTOMER_INVOICES_VIEW),
    // Et voir ses créances n'est pas voir ce qu'il a versé : Workflow 08 §32
    // veut l'historique des règlements, il relève de sa propre capacité.
    can(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW),
  ])

  const requestedTab = searchParams.onglet
  const tab =
    requestedTab === 'tarification' && canViewPricing
      ? 'tarification'
      : requestedTab === 'factures' && canViewInvoices
        ? 'factures'
        : requestedTab === 'paiements' && canViewPayments
          ? 'paiements'
          : 'informations'

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
    ...(canViewInvoices
      ? [
          {
            key: 'factures',
            label: 'Factures',
            href: `/tiers/clients/${id}?onglet=factures`,
          },
        ]
      : [{ key: 'factures', label: 'Factures', planned: true }]),
    ...(canViewPayments
      ? [
          {
            key: 'paiements',
            label: 'Paiements',
            href: `/tiers/clients/${id}?onglet=paiements`,
          },
        ]
      : [{ key: 'paiements', label: 'Paiements', planned: true }]),
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
      ) : tab === 'tarification' ? (
        <PricingTab clientId={id} />
      ) : tab === 'paiements' ? (
        <PaymentsTab clientId={id} />
      ) : (
        <InvoicesTab clientId={id} />
      )}
    </>
  )
}

/**
 * Factures du client — Workflow 07 §50, §51.
 *
 * §51 énumère ce que la fiche PEUT afficher : total facturé, total payé, total
 * restant. Les trois le sont depuis le LOT 8 — à condition d'avoir le droit de
 * lire les règlements. Sans lui, l'encaissé et le reste dû ne sont pas affichés
 * à zéro : l'écran DIT ce qu'il ne sait pas (DEC-017, DEC-024).
 */
async function InvoicesTab({ clientId }: { clientId: string }) {
  const canSeePayments = await can(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW)

  const [invoices, canCreate] = await Promise.all([
    listCustomerInvoicesForClient(clientId, { canSeePayments }),
    can(PERMISSIONS.CUSTOMER_INVOICES_CREATE),
  ])

  // Une facture annulée n'est plus une créance : elle reste listée, mais elle
  // ne compte pas dans le total facturé.
  const engaged = invoices.filter(
    (invoice) => invoice.status !== 'CANCELLED' && invoice.status !== 'DRAFT'
  )
  const billed = engaged.reduce((sum, invoice) => sum + invoice.total, 0)
  const collected = canSeePayments
    ? engaged.reduce((sum, invoice) => sum + (invoice.paidAmount ?? 0), 0)
    : null

  return (
    <div className="space-y-5">
      <Card
        title="Historique financier"
        description="Calculé à partir des factures enregistrées (Workflow 07 §51)."
      >
        <dl>
          <InfoRow label="Total facturé" hint="Factures émises, hors brouillons et annulations.">
            <span className="font-medium tabular">{formatAmount(billed)}</span>
          </InfoRow>
          <InfoRow label="Total encaissé" hint="Règlements validés (Workflow 08 §32).">
            {collected === null ? (
              <span className="text-muted">
                Votre compte ne peut pas consulter les règlements.
              </span>
            ) : (
              <span className="tabular">{formatAmount(collected)}</span>
            )}
          </InfoRow>
          <InfoRow label="Reste dû" hint="Total facturé moins les encaissements validés.">
            {collected === null ? (
              <span className="text-muted">
                Non calculable sans le droit de consulter les règlements.
              </span>
            ) : (
              <span className="font-medium tabular">{formatAmount(billed - collected)}</span>
            )}
          </InfoRow>
          <InfoRow label="Nombre de factures">
            <span className="tabular">{invoices.length}</span>
          </InfoRow>
        </dl>
      </Card>

      <Card title="Factures" description="Créances d’ADIKOM sur ce client (§50).">
        {invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Aucune facture"
            description="Ce client n’a encore reçu aucune facture."
            action={
              canCreate ? (
                <ButtonLink href={`/facturation/clients/nouvelle?client=${clientId}`} icon={Receipt}>
                  Préparer une facture
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {invoices.map((invoice) => {
              const shown = displayInvoiceStatus(
                invoice.status,
                invoice.dueDate,
                invoice.total,
                invoice.paidAmount
              )

              return (
                <li key={invoice.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/facturation/clients/${invoice.id}`}
                      className="font-medium text-adikom-500 hover:underline tabular"
                    >
                      {invoice.invoiceNo}
                    </Link>
                    <p className="text-xs text-muted">
                      {formatDate(invoice.invoiceDate)}
                      {invoice.rentalNo ? ` · ${invoice.rentalNo}` : ''}
                      {invoice.dueDate ? ` · échéance ${formatDate(invoice.dueDate)}` : ''}
                    </p>
                  </div>
                  <span className="font-medium text-ink tabular">
                    {formatAmount(invoice.total)}
                  </span>
                  <Badge tone={CUSTOMER_INVOICE_STATUS_TONES[shown]}>
                    {CUSTOMER_INVOICE_STATUS_LABELS[shown]}
                  </Badge>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

/**
 * Règlements du client — Workflow 08 §32.
 *
 * « La fiche client doit permettre de retrouver ses règlements. » Ils ne sont
 * pas portés par le client mais par ses FACTURES : Client → Facture → Paiement.
 * Chaque ligne renvoie donc à la facture qu'elle solde, et au compte qu'elle a
 * crédité.
 *
 * Un règlement ANNULÉ reste listé, barré : il ne compte plus (§28), mais rien
 * n'est effacé (§31).
 */
async function PaymentsTab({ clientId }: { clientId: string }) {
  const payments = await listClientPayments(clientId)

  const collected = payments
    .filter((payment) => payment.status === 'VALIDATED')
    .reduce((sum, payment) => sum + payment.amount, 0)

  return (
    <div className="space-y-5">
      <Card
        title="Encaissements"
        description="Argent réellement reçu de ce client (Workflow 08 §3, §32)."
      >
        <dl>
          <InfoRow label="Total encaissé" hint="Règlements validés seulement (§28).">
            <span className="font-medium tabular">{formatAmount(collected)}</span>
          </InfoRow>
          <InfoRow label="Nombre de règlements">
            <span className="tabular">{payments.length}</span>
          </InfoRow>
        </dl>
      </Card>

      <Card title="Règlements" description="Du plus récent au plus ancien.">
        {payments.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="Aucun règlement"
            description="Ce client n’a encore rien versé. Un encaissement s’enregistre depuis la facture qu’il solde."
          />
        ) : (
          <ul className="divide-y divide-line">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink tabular">{payment.paymentNo}</p>
                  <p className="text-xs text-muted">
                    {formatDate(payment.receivedOn)} · {PAYMENT_METHOD_LABELS[payment.method]}
                    {payment.externalRef ? ` · ${payment.externalRef}` : ''}
                  </p>
                  <p className="text-xs text-muted">
                    {payment.invoiceNo ? (
                      <Link
                        href={`/facturation/clients/${payment.customerInvoiceId}`}
                        className="text-adikom-500 hover:underline tabular"
                      >
                        {payment.invoiceNo}
                      </Link>
                    ) : (
                      'Facture non lisible avec vos droits'
                    )}
                    {payment.accountLabel ? ` · ${payment.accountLabel}` : ''}
                  </p>
                </div>
                <span
                  className={
                    payment.status === 'CANCELLED'
                      ? 'text-sm text-muted line-through tabular'
                      : 'font-medium text-ink tabular'
                  }
                >
                  + {formatAmount(payment.amount)}
                </span>
                <Badge tone={payment.status === 'CANCELLED' ? 'danger' : 'success'}>
                  {payment.status === 'CANCELLED' ? 'Annulé' : 'Validé'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
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
