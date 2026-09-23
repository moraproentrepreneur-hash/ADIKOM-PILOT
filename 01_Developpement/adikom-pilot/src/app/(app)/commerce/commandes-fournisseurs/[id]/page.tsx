import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, Receipt } from 'lucide-react'

import { Badge, ButtonLink, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime, todayISO } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import {
  getPurchaseOrder,
  listPurchasableVariants,
  listPurchaseOrderInvoices,
  listPurchaseOrderLines,
} from '@/features/purchasing/data'
import {
  PURCHASE_LINE_KIND_LABELS,
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_STATUS_TONES,
  PURCHASE_ORDER_TRANSITIONS,
  invoiceGap,
  purchaseLineKind,
  purchaseOrderIsEditable,
  purchaseOrderIsInvoiceable,
  type PurchaseOrderStatus,
} from '@/features/purchasing/constants'
import { SUPPLIER_INVOICE_STATUS_LABELS } from '@/features/supplier-invoices/constants'
import type { SupplierInvoiceStatus } from '@/features/supplier-invoices/constants'
import {
  AddPurchaseLinePanel,
  ArchivePurchaseLineForm,
  EditPurchaseOrderPanel,
  InvoicePurchaseOrderPanel,
  PurchaseOrderStatusPanel,
} from '@/features/purchasing/panels'

export const metadata: Metadata = { title: 'Commande fournisseur' }

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return <InfoRow label={label}>{value ? value : <Empty />}</InfoRow>
}

/**
 * Fiche d'une commande fournisseur — LOT 26.
 *
 * 🟥 LA SECTION « FACTURE » EST LE POINT DE JONCTION AVEC LA CHAÎNE EXISTANTE.
 * Elle n'ouvre aucune table parallèle : elle prépare une `supplier_invoices`
 * ordinaire, en brouillon, dans le module Factures fournisseurs — où elle se
 * soumet, se valide, s'impute et se règle comme n'importe quelle autre.
 */
export default async function PurchaseOrderPage(
  props: PageProps<'/commerce/commandes-fournisseurs/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.PURCHASE_ORDERS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const order = await getPurchaseOrder(id)
  if (!order) notFound()

  const [
    canUpdate,
    canValidate,
    canCancel,
    canInvoice,
    canSeeInvoices,
    canDownload,
    canPrint,
    canSeeQuotes,
    canReadCost,
  ] = await Promise.all([
    can(PERMISSIONS.PURCHASE_ORDERS_UPDATE),
    can(PERMISSIONS.PURCHASE_ORDERS_VALIDATE),
    can(PERMISSIONS.PURCHASE_ORDERS_CANCEL),
    can(PERMISSIONS.SUPPLIER_INVOICES_CREATE),
    can(PERMISSIONS.SUPPLIER_INVOICES_VIEW),
    can(PERMISSIONS.PURCHASE_ORDERS_DOWNLOAD),
    can(PERMISSIONS.PURCHASE_ORDERS_PRINT),
    can(PERMISSIONS.PURCHASE_QUOTES_VIEW),
    can(PERMISSIONS.SERVICES_COST_VIEW),
  ])

  const editable = purchaseOrderIsEditable(order.status)

  const [lines, variants, invoices] = await Promise.all([
    listPurchaseOrderLines(id),
    editable && canUpdate
      ? listPurchasableVariants(order.orderDate, canReadCost)
      : Promise.resolve([]),
    canSeeInvoices ? listPurchaseOrderInvoices(id) : Promise.resolve(null),
  ])

  const activeLines = lines.filter((line) => !line.isArchived)
  const archivedCount = lines.length - activeLines.length

  const available = PURCHASE_ORDER_TRANSITIONS[order.status].filter(
    (next: PurchaseOrderStatus) => (next === 'CANCELLED' ? canCancel : canValidate)
  )

  const liveInvoice = (invoices ?? []).find((invoice) => invoice.status !== 'CANCELLED') ?? null
  const gap = liveInvoice ? invoiceGap(order.total, liveInvoice.gross) : null

  return (
    <>
      <PageHeader
        title={order.orderNo}
        description={
          order.supplierLabel
            ? `Commande adressée à ${order.supplierLabel}`
            : 'Fournisseur non lisible avec vos droits'
        }
        actions={
          <>
            <ButtonLink href="/commerce/commandes-fournisseurs" tone="secondary" icon={ArrowLeft}>
              Retour
            </ButtonLink>
            <DocumentToolbar
              type="commandes-fournisseurs"
              id={order.id}
              label="la commande fournisseur"
              canDownload={canDownload}
              canPrint={canPrint}
            />
          </>
        }
      />

      {searchParams.cree === '1' && (
        <Notice tone="success" className="mb-5">
          La commande a été créée. Complétez ses lignes, puis passez-la lorsqu’elle est prête à
          être transmise au fournisseur.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Identité">
            <div className="mb-4">
              <Badge tone={PURCHASE_ORDER_STATUS_TONES[order.status]}>
                {PURCHASE_ORDER_STATUS_LABELS[order.status]}
              </Badge>
            </div>

            <dl className="divide-y divide-line">
              <Row label="Numéro" value={order.orderNo} />
              <Row label="Fournisseur" value={order.supplierLabel} />
              <Row label="Date de la commande" value={formatDate(order.orderDate)} />
              <Row
                label="Réception attendue"
                value={order.expectedDate ? formatDate(order.expectedDate) : null}
              />
              <Row label="Devise" value={order.currencyCode} />
              <Row label="Conditions" value={order.terms} />
              <Row label="Observations" value={order.notes} />
              <Row label="Motif du dernier changement" value={order.statusReason} />
            </dl>
          </Card>

          <Card
            title="Lignes"
            description={
              editable
                ? 'Le prix de chaque ligne est celui convenu avec le fournisseur. Il est figé à son ajout.'
                : 'Cette commande est passée : ses lignes et ses prix sont figés.'
            }
          >
            {activeLines.length === 0 ? (
              <p className="text-sm text-muted">
                Aucune ligne active. Le total de cette commande est nul, et elle ne peut pas être
                passée.
              </p>
            ) : (
              <>
                <div className="-mx-5 hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-adikom-50 text-left">
                        <th className="px-5 py-2.5 font-medium text-ink">Désignation</th>
                        <th className="px-5 py-2.5 font-medium text-ink">Nature</th>
                        <th className="px-5 py-2.5 text-right font-medium text-ink">Qté</th>
                        <th className="px-5 py-2.5 text-right font-medium text-ink">
                          Prix unitaire
                        </th>
                        <th className="px-5 py-2.5 text-right font-medium text-ink">Montant</th>
                        {editable && canUpdate && <th className="px-5 py-2.5" />}
                      </tr>
                    </thead>
                    <tbody>
                      {activeLines.map((line) => (
                        <tr key={line.id} className="border-b border-line last:border-b-0">
                          <td className="px-5 py-2.5 text-ink">{line.label}</td>
                          <td className="px-5 py-2.5 text-xs text-muted">
                            {PURCHASE_LINE_KIND_LABELS[purchaseLineKind(line.serviceId)]}
                          </td>
                          <td className="px-5 py-2.5 text-right text-muted tabular">
                            {line.quantity}
                          </td>
                          <td className="px-5 py-2.5 text-right text-muted tabular">
                            {formatAmount(line.unitPrice)}
                          </td>
                          <td className="px-5 py-2.5 text-right font-medium text-ink tabular">
                            {formatAmount(line.lineTotal)}
                          </td>
                          {editable && canUpdate && (
                            <td className="px-5 py-2.5 text-right">
                              <ArchivePurchaseLineForm
                                target="order"
                                documentId={order.id}
                                lineId={line.id}
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-line">
                        <td colSpan={4} className="px-5 py-3 text-right font-medium text-ink">
                          Total de la commande
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-ink tabular">
                          {formatAmount(order.total)}
                        </td>
                        {editable && canUpdate && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <ul className="space-y-3 sm:hidden">
                  {activeLines.map((line) => (
                    <li key={line.id} className="rounded-control border border-line p-3">
                      <p className="font-medium text-ink">{line.label}</p>
                      <p className="mt-1 text-xs text-muted">
                        {PURCHASE_LINE_KIND_LABELS[purchaseLineKind(line.serviceId)]} ·{' '}
                        {line.quantity} × {formatAmount(line.unitPrice)}
                      </p>
                      <p className="mt-1 font-medium text-ink tabular">
                        {formatAmount(line.lineTotal)}
                      </p>
                      {editable && canUpdate && (
                        <div className="mt-2">
                          <ArchivePurchaseLineForm
                            target="order"
                            documentId={order.id}
                            lineId={line.id}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                  <li className="rounded-control bg-adikom-50 p-3">
                    <p className="text-sm font-medium text-ink">
                      Total de la commande :{' '}
                      <span className="tabular">{formatAmount(order.total)}</span>
                    </p>
                  </li>
                </ul>
              </>
            )}

            {archivedCount > 0 && (
              <p className="mt-4 text-xs text-muted">
                {archivedCount} ligne{archivedCount > 1 ? 's' : ''} retirée
                {archivedCount > 1 ? 's' : ''}. Elle
                {archivedCount > 1 ? 's sont conservées' : ' est conservée'} à l’historique et
                n’entre{archivedCount > 1 ? 'nt' : ''} pas dans le total.
              </p>
            )}
          </Card>

          {editable && canUpdate && (
            <Card
              title="Ajouter une ligne"
              description="Une prestation du catalogue, ou une ligne libre pour ce qui n’y figure pas."
            >
              <AddPurchaseLinePanel
                target="order"
                documentId={order.id}
                variants={variants}
                documentDate={formatDate(order.orderDate) ?? order.orderDate}
                mayReadCost={canReadCost}
              />
            </Card>
          )}

          {/*
            🟥 LA FACTURE REÇUE, ET SON ÉCART À LA COMMANDE.

            Les deux montants ne sont PAS forcés à coïncider : la facture
            fournisseur CONSTATE ce que le fournisseur réclame (Module 07 §28,
            §54), la commande dit ce qu'ADIKOM avait engagé. Les forcer
            reviendrait à réécrire un document reçu. L'écart est donc montré, à
            la vue de qui contrôle.
          */}
          <Card title="Facture fournisseur">
            {!canSeeInvoices ? (
              <p className="text-sm text-muted">
                Votre compte ne peut pas consulter les factures fournisseurs : l’état de
                facturation de cette commande ne vous est pas communiqué.
              </p>
            ) : (invoices ?? []).length === 0 ? (
              <p className="text-sm text-muted">
                Aucune facture n’a encore été enregistrée pour cette commande.
              </p>
            ) : (
              <ul className="space-y-3">
                {(invoices ?? []).map((invoice) => (
                  <li
                    key={invoice.id}
                    className="rounded-control border border-line p-3 sm:flex sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/facturation/fournisseurs/${invoice.id}`}
                        className="inline-flex items-center gap-2 font-medium text-adikom-500 hover:underline tabular"
                      >
                        <Receipt className="size-4" aria-hidden />
                        {invoice.invoiceNo}
                      </Link>
                      <p className="mt-1 text-xs text-muted">
                        {formatDate(invoice.invoiceDate)}
                        {invoice.externalRef ? ` · réf. ${invoice.externalRef}` : ''}
                      </p>
                    </div>
                    <div className="mt-2 text-sm sm:mt-0 sm:text-right">
                      <Badge tone={invoice.status === 'CANCELLED' ? 'danger' : 'info'}>
                        {SUPPLIER_INVOICE_STATUS_LABELS[invoice.status as SupplierInvoiceStatus] ??
                          invoice.status}
                      </Badge>
                      <p className="mt-1 font-medium text-ink tabular">
                        {invoice.gross === null
                          ? 'Montant non communiqué'
                          : formatAmount(invoice.gross)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {gap !== null && (
              <p
                className={`mt-4 text-sm tabular ${
                  gap === 0 ? 'text-muted' : gap > 0 ? 'text-warning-700' : 'text-success-700'
                }`}
              >
                {gap === 0 ? (
                  <>La facture reçue correspond exactement au montant commandé.</>
                ) : (
                  <>
                    Le fournisseur facture{' '}
                    <strong>
                      {gap > 0 ? '+' : '−'}
                      {formatAmount(Math.abs(gap))}
                    </strong>{' '}
                    par rapport à la commande. Ce n’est pas une anomalie du système : la facture
                    constate ce que le fournisseur réclame.
                  </>
                )}
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {available.length > 0 && (
            <Card title="Cycle de la commande">
              <PurchaseOrderStatusPanel orderId={order.id} available={available} />
            </Card>
          )}

          {purchaseOrderIsInvoiceable(order.status) && canInvoice && (
            <Card title="Enregistrer la facture reçue">
              <InvoicePurchaseOrderPanel orderId={order.id} today={todayISO()} />
            </Card>
          )}

          <Card title="Origine">
            {order.quoteId === null ? (
              <p className="text-sm text-muted">
                Commande <strong>directe</strong> : elle ne provient d’aucune offre enregistrée.
                C’est un chemin prévu par l’architecture, non un contournement.
              </p>
            ) : !canSeeQuotes ? (
              <p className="text-sm text-muted">
                Cette commande provient d’une offre enregistrée. Votre compte ne peut pas consulter
                les devis fournisseurs : sa référence ne vous est pas communiquée.
              </p>
            ) : order.quoteNo ? (
              <>
                <Link
                  href={`/commerce/devis-fournisseurs/${order.quoteId}`}
                  className="inline-flex items-center gap-2 font-medium text-adikom-500 hover:underline tabular"
                >
                  <FileText className="size-4" aria-hidden />
                  {order.quoteNo}
                </Link>
                {order.quoteExternalRef && (
                  <p className="mt-2 text-xs text-muted">
                    Référence du fournisseur : {order.quoteExternalRef}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted">
                  Les prix de cette commande sont ceux de l’offre retenue. Ils n’ont pas été relus
                  du catalogue.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">
                Cette commande provient d’une offre qui n’est plus lisible.
              </p>
            )}
          </Card>

          {editable && canUpdate && (
            <Card title="Modifier l’en-tête">
              <EditPurchaseOrderPanel
                orderId={order.id}
                orderDate={order.orderDate}
                expectedDate={order.expectedDate}
                notes={order.notes}
                terms={order.terms}
              />
            </Card>
          )}

          <Card title="Historique">
            <dl className="divide-y divide-line">
              <Row label="Créée le" value={formatDateTime(order.createdAt)} />
              <Row label="Passée le" value={formatDateTime(order.confirmedAt)} />
              <Row label="Réceptionnée le" value={formatDateTime(order.deliveredAt)} />
              <Row label="Facturée le" value={formatDateTime(order.invoicedAt)} />
              <Row label="Annulée le" value={formatDateTime(order.cancelledAt)} />
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
