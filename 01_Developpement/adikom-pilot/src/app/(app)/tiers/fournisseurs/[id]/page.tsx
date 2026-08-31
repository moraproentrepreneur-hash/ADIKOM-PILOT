import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CarFront, Lock, Pencil, Plus } from 'lucide-react'

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
  getSupplierDetail,
  listSupplierPaymentDetails,
  PAYMENT_KIND_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
} from '@/features/suppliers/data'
import { setSupplierStatusAction } from '@/features/suppliers/actions'
import { SupplierForm } from '@/features/suppliers/supplier-form'
import {
  PaymentDetailForm,
  PaymentStateButton,
} from '@/features/suppliers/payment-details'
import { listVehicles, STATUS_LABELS as VEHICLE_STATUS_LABELS, STATUS_TONES as VEHICLE_STATUS_TONES } from '@/features/fleet/data'
import { listSupplierImputations } from '@/features/imputations/data'
import {
  formatAmount as formatImputationAmount,
  IMPUTATION_STATUS_LABELS,
  IMPUTATION_STATUS_TONES,
  isAwaitingInvoice,
} from '@/features/imputations/constants'
import { listSupplierInvoicesForSupplier } from '@/features/supplier-invoices/data'
import { listSupplierPayments } from '@/features/supplier-invoices/payments-data'
import {
  displayStatus as displayInvoiceStatus,
  PAYMENT_METHOD_LABELS,
  SUPPLIER_INVOICE_STATUS_LABELS,
  SUPPLIER_INVOICE_STATUS_TONES,
} from '@/features/supplier-invoices/constants'

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

  const [
    canUpdate,
    canArchive,
    canViewBank,
    canUpdateBank,
    canViewFleet,
    canDownload,
    canPrint,
    canViewImputations,
    canViewInvoices,
    canViewPayments,
  ] = await Promise.all([
    can(PERMISSIONS.SUPPLIERS_UPDATE),
    can(PERMISSIONS.SUPPLIERS_ARCHIVE),
    can(PERMISSIONS.SUPPLIERS_BANK_VIEW),
    can(PERMISSIONS.SUPPLIERS_BANK_UPDATE),
    can(PERMISSIONS.FLEET_VIEW),
    // DEC-024 : produire un document et l'imprimer sont deux capacités
    // distinctes de la consultation, attribuables séparément.
    can(PERMISSIONS.SUPPLIERS_DOWNLOAD),
    can(PERMISSIONS.SUPPLIERS_PRINT),
    // LOT 4 : l'onglet liste des imputations, il relève donc de leur propre
    // capacité. Sans elle, il DISPARAÎT — l'afficher vide laisserait croire
    // qu'aucune dépense n'a été imputée à ce fournisseur (DEC-017).
    can(PERMISSIONS.IMPUTATIONS_VIEW),
    // LOT 5 : même règle pour les factures — l'onglet suit sa propre capacité.
    can(PERMISSIONS.SUPPLIER_INVOICES_VIEW),
    // LOT 6 : et pour les règlements.
    can(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW),
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
            key: 'paiement',
            label: 'Informations de paiement',
            href: `/tiers/fournisseurs/${id}?onglet=paiement`,
          },
        ]
      : []),
    ...(canViewInvoices
      ? [
          {
            key: 'factures',
            label: 'Factures',
            href: `/tiers/fournisseurs/${id}?onglet=factures`,
          },
        ]
      : []),
    // L'onglet n'existe pas sans la capacité : un onglet « à venir » affiché à
    // qui n'a pas le droit de voir mentirait deux fois — sur l'existence de la
    // fonctionnalité, et sur la raison de son absence (DEC-017).
    ...(canViewImputations
      ? [
          {
            key: 'imputations',
            label: 'Imputations',
            href: `/tiers/fournisseurs/${id}?onglet=imputations`,
          },
        ]
      : []),
    ...(canViewPayments
      ? [
          {
            key: 'reglements',
            label: 'Règlements',
            href: `/tiers/fournisseurs/${id}?onglet=reglements`,
          },
        ]
      : []),
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
      ) : tab === 'factures' ? (
        <SupplierInvoicesTab
          supplierId={id}
          canSeeImputations={canViewImputations}
          canSeePayments={canViewPayments}
        />
      ) : tab === 'reglements' ? (
        <SupplierPaymentsTab supplierId={id} />
      ) : tab === 'imputations' ? (
        <SupplierImputationsTab supplierId={id} canSeeInvoices={canViewInvoices} />
      ) : tab === 'paiement' ? (
        <PaymentTab
          supplierId={id}
          editable={canUpdateBank}
          editing={typeof searchParams.paiement === 'string' ? searchParams.paiement : null}
        />
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

/**
 * Factures du fournisseur — Règles fournisseurs §32 et §33.
 *
 * « Référence, date, échéance, montant, imputations, montant net, paiements,
 * solde, statut. » Tout y est SAUF les paiements et le solde : aucun règlement
 * n'est géré. L'onglet le DIT, plutôt que d'afficher un zéro qui se lirait
 * « rien à payer » (DEC-017).
 */
async function SupplierInvoicesTab({
  supplierId,
  canSeeImputations,
  canSeePayments,
}: {
  supplierId: string
  canSeeImputations: boolean
  canSeePayments: boolean
}) {
  const invoices = await listSupplierInvoicesForSupplier(supplierId, {
    canSeeImputations,
    canSeePayments,
  })

  // DEC-010 : sommes d'entiers, aucun flottant. Les factures annulées sortent
  // du total : une dette annulée n'est pas due.
  const live = invoices.filter((invoice) => invoice.status !== 'CANCELLED')
  const grossTotal = live.reduce((total, invoice) => total + invoice.grossAmount, 0)
  const netTotal = canSeeImputations
    ? live.reduce((total, invoice) => total + (invoice.netPayable ?? 0), 0)
    : null
  const dueTotal =
    canSeeImputations && canSeePayments
      ? live.reduce((total, invoice) => total + (invoice.remainingDue ?? 0), 0)
      : null

  return (
    <div className="space-y-5">
      <Notice tone="info">
        Une facture validée reconnaît une <strong>dette</strong>. Une <strong>imputation</strong>
        {' '}la réduit sans la payer ; un <strong>règlement</strong> la solde en débitant un compte.
      </Notice>

      <Card
        title="Totaux"
        description="Factures non annulées de ce fournisseur (Règles fournisseurs §32)."
      >
        <dl>
          <InfoRow label="Montant brut facturé">
            <span className="font-medium tabular">{formatImputationAmount(grossTotal)}</span>
          </InfoRow>
          <InfoRow label="Net à payer" hint="Montant brut moins les imputations rattachées.">
            {netTotal === null ? (
              <span className="text-muted">
                Votre compte ne peut pas consulter les imputations : le net à payer n’est pas
                calculable.
              </span>
            ) : (
              <span className="tabular">{formatImputationAmount(netTotal)}</span>
            )}
          </InfoRow>
          <InfoRow label="Reste dû" hint="Net à payer moins les règlements validés.">
            {dueTotal === null ? (
              <span className="text-muted">
                Non calculable : il suppose de consulter à la fois les imputations et les
                règlements.
              </span>
            ) : (
              <span className="font-medium tabular">{formatImputationAmount(dueTotal)}</span>
            )}
          </InfoRow>
        </dl>
      </Card>

      <Card title="Factures" description="Chaque facture reste identifiable (§33).">
        {invoices.length === 0 ? (
          <EmptyState
            icon={CarFront}
            title="Aucune facture"
            description="Aucune facture reçue de ce fournisseur n’a été enregistrée."
          />
        ) : (
          <ul className="divide-y divide-line">
            {invoices.map((invoice) => {
              const shown = displayInvoiceStatus(
                invoice.status,
                invoice.dueDate,
                invoice.netPayable,
                invoice.paidAmount
              )

              return (
                <li key={invoice.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/facturation/fournisseurs/${invoice.id}`}
                        className="font-medium text-adikom-500 hover:underline tabular"
                      >
                        {invoice.invoiceNo}
                      </Link>
                      <p className="text-xs text-muted">
                        {formatDate(invoice.invoiceDate)}
                        {invoice.dueDate ? ` · échéance ${formatDate(invoice.dueDate)}` : ''}
                        {invoice.externalRef ? ` · ${invoice.externalRef}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-right">
                        <span className="block font-medium tabular">
                          {formatImputationAmount(invoice.grossAmount)}
                        </span>
                        <span className="block text-xs text-muted tabular">
                          {invoice.remainingDue === null
                            ? 'reste dû non calculable'
                            : `reste dû ${formatImputationAmount(invoice.remainingDue)}`}
                        </span>
                      </span>
                      <Badge tone={SUPPLIER_INVOICE_STATUS_TONES[shown]}>
                        {SUPPLIER_INVOICE_STATUS_LABELS[shown]}
                      </Badge>
                    </div>
                  </div>
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
 * Règlements du fournisseur — Workflow 08 §52, historique fournisseur.
 *
 * Les règlements ne portent pas le fournisseur : ils portent la FACTURE, qui le
 * porte (§33 — Fournisseur → Facture → Imputation → Paiement). Ce qui est
 * affiché ici est donc l'exact reflet de ce qui est enregistré, et non une
 * colonne recopiée qui pourrait le contredire.
 */
async function SupplierPaymentsTab({ supplierId }: { supplierId: string }) {
  const payments = await listSupplierPayments(supplierId)

  // DEC-010 : somme d'entiers. Les règlements annulés ne comptent plus (§28).
  const paidTotal = payments
    .filter((payment) => payment.status === 'VALIDATED')
    .reduce((total, payment) => total + payment.amount, 0)

  return (
    <div className="space-y-5">
      <Notice tone="info">
        Un règlement est un <strong>décaissement réel</strong> : il fait sortir de l’argent d’un
        compte. Il ne se confond pas avec une imputation, qui réduit la dette sans la payer
        (Module 07 §37).
      </Notice>

      <Card title="Total réglé" description="Règlements validés, annulations exclues (§28).">
        <dl>
          <InfoRow label="Versé à ce fournisseur">
            <span className="font-medium tabular">{formatImputationAmount(paidTotal)}</span>
          </InfoRow>
        </dl>
      </Card>

      <Card title="Règlements" description="Chaque décaissement reste identifiable.">
        {payments.length === 0 ? (
          <EmptyState
            icon={CarFront}
            title="Aucun règlement"
            description="Aucune facture de ce fournisseur n’a encore été réglée."
          />
        ) : (
          <ul className="divide-y divide-line">
            {payments.map((payment) => (
              <li key={payment.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink tabular">{payment.paymentNo}</p>
                    <p className="text-xs text-muted">
                      {formatDate(payment.paidOn)} · {PAYMENT_METHOD_LABELS[payment.method]}
                      {payment.invoiceNo ? ` · facture ${payment.invoiceNo}` : ''}
                    </p>
                    <p className="text-xs text-muted">
                      {payment.accountLabel ?? 'Compte non lisible avec vos droits'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        payment.status === 'CANCELLED'
                          ? 'text-sm text-muted line-through tabular'
                          : 'font-medium tabular'
                      }
                    >
                      {formatImputationAmount(payment.amount)}
                    </span>
                    <Badge tone={payment.status === 'CANCELLED' ? 'danger' : 'success'}>
                      {payment.status === 'CANCELLED' ? 'Annulé' : 'Validé'}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/**
 * Imputations du fournisseur — Workflow 06 §23 et §42.
 *
 * §42 demande montant brut, total imputé et montant net. Le brut et le net
 * appartiennent aux FACTURES : ils sont montrés dans l'onglet Factures, où ils
 * ont un sens facture par facture. Cet onglet montre l'autre face — d'où
 * viennent les déductions, et lesquelles attendent encore une facture.
 */
async function SupplierImputationsTab({
  supplierId,
  canSeeInvoices,
}: {
  supplierId: string
  canSeeInvoices: boolean
}) {
  const imputations = await listSupplierImputations(supplierId)

  // DEC-010 : sommes d'entiers, aucun flottant.
  const awaitingTotal = imputations
    .filter((imputation) => isAwaitingInvoice(imputation.status, imputation.supplierInvoiceId))
    .reduce((total, imputation) => total + imputation.amount, 0)

  const preparingTotal = imputations
    .filter((imputation) => imputation.status === 'DRAFT' || imputation.status === 'TO_VALIDATE')
    .reduce((total, imputation) => total + imputation.amount, 0)

  const imputedTotal = imputations
    .filter((imputation) => imputation.status === 'IMPUTED')
    .reduce((total, imputation) => total + imputation.amount, 0)

  return (
    <div className="space-y-5">
      <Notice tone="warning">
        Une imputation ne réduit un montant dû qu’une fois <strong>rattachée à une facture
        validée</strong> (DEC-013). Même alors, elle n’est <strong>pas un paiement</strong> :
        aucun compte n’est mouvementé.
      </Notice>

      <Card title="Totaux" description="Calculés depuis les opérations réellement enregistrées (§42).">
        <dl>
          <InfoRow
            label="Imputé sur des factures"
            hint="Imputations rattachées : elles réduisent un net à payer."
          >
            <span className="font-medium tabular">{formatImputationAmount(imputedTotal)}</span>
          </InfoRow>
          <InfoRow
            label="En attente de facture"
            hint="Imputations validées, sans facture rattachée (§31)."
          >
            <span className="tabular">{formatImputationAmount(awaitingTotal)}</span>
          </InfoRow>
          <InfoRow label="En préparation" hint="Brouillons et imputations à valider.">
            <span className="tabular">{formatImputationAmount(preparingTotal)}</span>
          </InfoRow>
          <InfoRow label="Montant brut et net à payer">
            {canSeeInvoices ? (
              <Link
                href={`/tiers/fournisseurs/${supplierId}?onglet=factures`}
                className="text-adikom-500 hover:underline"
              >
                Voir l’onglet Factures
              </Link>
            ) : (
              <span className="text-muted">
                Ils appartiennent aux factures, que votre compte ne peut pas consulter.
              </span>
            )}
          </InfoRow>
        </dl>
      </Card>

      <Card title="Imputations" description="Chaque imputation reste identifiable (§22, §23).">
        {imputations.length === 0 ? (
          <EmptyState
            icon={CarFront}
            title="Aucune imputation"
            description="Aucune dépense de maintenance n’a été imputée à ce fournisseur."
          />
        ) : (
          <ul className="divide-y divide-line">
            {imputations.map((imputation) => (
              <li key={imputation.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/facturation/imputations/${imputation.id}`}
                      className="font-medium text-adikom-500 hover:underline tabular"
                    >
                      {imputation.imputationNo}
                    </Link>
                    <p className="text-xs text-muted">
                      {imputation.maintenanceNo ?? 'Maintenance non communiquée'}
                      {imputation.vehicleLabel ? ` · ${imputation.vehicleLabel}` : ''} ·{' '}
                      {formatDateTime(imputation.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium tabular">
                      {formatImputationAmount(imputation.amount)}
                    </span>
                    <Badge tone={IMPUTATION_STATUS_TONES[imputation.status]}>
                      {IMPUTATION_STATUS_LABELS[imputation.status]}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
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
 * Informations de paiement — où et comment le fournisseur peut être payé.
 *
 * L'onglet n'apparaît qu'avec `parties.suppliers.bank.view`, et la lecture est
 * de toute façon filtrée par RLS : un accès direct par URL ne révèle rien.
 *
 * Le MOYEN employé pour une transaction n'est pas ici : il appartiendra au
 * règlement, avec le compte financier mouvementé (03_Modules/07 §22 et §23).
 */
async function PaymentTab({
  supplierId,
  editable,
  editing,
}: {
  supplierId: string
  editable: boolean
  /** Identifiant de la coordonnée en cours d'édition, ou « nouveau ». */
  editing: string | null
}) {
  const details = await listSupplierPaymentDetails(supplierId)
  const base = `/tiers/fournisseurs/${supplierId}?onglet=paiement`

  // Une coordonnée ne s'édite que par cette voie : le paramètre est vérifié
  // contre les lignes réellement lisibles, jamais suivi tel quel.
  const edited = editing && editing !== 'nouveau' ? details.find((d) => d.id === editing) : undefined

  if (editable && editing === 'nouveau') {
    return (
      <Card title="Nouvelle coordonnée de règlement" className="max-w-3xl">
        <PaymentDetailForm supplierId={supplierId} cancelHref={base} />
      </Card>
    )
  }

  if (editable && edited) {
    return (
      <Card title={`Coordonnée — ${edited.label}`} className="max-w-3xl">
        <PaymentDetailForm supplierId={supplierId} detail={edited} cancelHref={base} />
      </Card>
    )
  }

  return (
    <Card
      title="Informations de paiement"
      description="Donnée sensible : accès et modification soumis à une permission dédiée."
      actions={
        editable ? (
          <ButtonLink href={`${base}&paiement=nouveau`} icon={Plus}>
            Ajouter
          </ButtonLink>
        ) : undefined
      }
      className="max-w-3xl"
    >
      {details.length === 0 ? (
        <EmptyState
          icon={Lock}
          title="Aucune coordonnée enregistrée"
          description={
            editable
              ? 'Ajoutez une coordonnée pour indiquer où et comment régler ce fournisseur.'
              : 'Les informations de paiement de ce fournisseur n’ont pas encore été renseignées.'
          }
        />
      ) : (
        <ul className="space-y-4">
          {details.map((detail) => (
            <li
              key={detail.id}
              className={`rounded-control border p-4 ${
                detail.isActive ? 'border-line' : 'border-line bg-adikom-50/40'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{detail.label}</p>
                  <p className="text-xs text-muted">
                    {PAYMENT_KIND_LABELS[detail.kind]}
                    {detail.currencyCode ? ` · ${detail.currencyCode}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {detail.isPrimary && <Badge tone="success">Principale</Badge>}
                  {!detail.isActive && <Badge>Désactivée</Badge>}
                </div>
              </div>

              <dl className="mt-3">
                {detail.kind === 'BANK_ACCOUNT' ? (
                  <>
                    <InfoRow label="Banque">{detail.bankName ?? <Empty />}</InfoRow>
                    <InfoRow label="Agence">{detail.bankBranch ?? <Empty />}</InfoRow>
                    <InfoRow label="Titulaire">{detail.accountHolder ?? <Empty />}</InfoRow>
                    <InfoRow label="Numéro de compte">
                      <span className="tabular">{detail.accountNumber ?? <Empty />}</span>
                    </InfoRow>
                    <InfoRow label="IBAN">
                      <span className="tabular">{detail.iban ?? <Empty />}</span>
                    </InfoRow>
                    <InfoRow label="BIC / SWIFT">
                      <span className="tabular">{detail.swiftBic ?? <Empty />}</span>
                    </InfoRow>
                  </>
                ) : (
                  <>
                    <InfoRow label="Bénéficiaire">{detail.accountHolder ?? <Empty />}</InfoRow>
                    <InfoRow label="Référence">
                      <span className="tabular">{detail.accountReference ?? <Empty />}</span>
                    </InfoRow>
                  </>
                )}
                {detail.notes && <InfoRow label="Précisions">{detail.notes}</InfoRow>}
              </dl>

              {editable && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <ButtonLink
                    href={`${base}&paiement=${detail.id}`}
                    tone="secondary"
                    icon={Pencil}
                  >
                    Modifier
                  </ButtonLink>

                  {detail.isActive && !detail.isPrimary && (
                    <PaymentStateButton
                      supplierId={supplierId}
                      paymentId={detail.id}
                      operation="primary"
                      label="Définir comme principale"
                    />
                  )}

                  <PaymentStateButton
                    supplierId={supplierId}
                    paymentId={detail.id}
                    operation={detail.isActive ? 'deactivate' : 'activate'}
                    label={detail.isActive ? 'Désactiver' : 'Réactiver'}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
