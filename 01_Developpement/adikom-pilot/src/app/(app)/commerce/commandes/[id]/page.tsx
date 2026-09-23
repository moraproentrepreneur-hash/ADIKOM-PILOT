import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, ReceiptText } from 'lucide-react'

import { Badge, ButtonLink, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime, todayISO } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import {
  getSalesOrder,
  listOrderInvoices,
  listSalesOrderLines,
  listSellableVariants,
} from '@/features/commerce/data'
import {
  LINE_KIND_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  ORDER_TRANSITIONS,
  lineKind,
  orderIsEditable,
  orderIsInvoiceable,
  type OrderStatus,
} from '@/features/commerce/constants'
import { CUSTOMER_INVOICE_STATUS_LABELS } from '@/features/customer-invoices/constants'
import type { CustomerInvoiceStatus } from '@/features/customer-invoices/constants'
import {
  AddLinePanel,
  ArchiveLineForm,
  EditOrderPanel,
  InvoiceOrderPanel,
  OrderStatusPanel,
} from '@/features/commerce/panels'

export const metadata: Metadata = { title: 'Commande client' }

/**
 * Un couple libellé / valeur, avec une absence rendue de façon homogène.
 *
 * `InfoRow` prend des enfants : ce petit relais évite de répéter le repli sur
 * « — » à chaque ligne, et garantit qu'une valeur absente se lit toujours de la
 * même manière (Design System §40).
 */
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <InfoRow label={label}>{value ? value : <Empty />}</InfoRow>
  )
}

/**
 * Fiche d'une commande client — LOT 25, DEC-049.
 *
 * 🟥 L'ARTICULATION AVEC LA FACTURATION EXISTANTE SE VOIT ICI.
 *
 * « Préparer la facture » appelle la chaîne du LOT 7 et produit une
 * `customer_invoices` ORDINAIRE, en brouillon. L'écran renvoie ensuite vers le
 * module Factures clients : c'est là que la facture s'émet, se règle et entre
 * en trésorerie. Aucune de ces opérations n'est refaite ici.
 *
 * UNE COMMANDE, AU PLUS UNE FACTURE NON ANNULÉE. Le bouton disparaît donc dès
 * que la commande est facturée, et l'index partiel en base fait autorité quoi
 * qu'affiche l'écran.
 */
export default async function SalesOrderPage(props: PageProps<'/commerce/commandes/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.SALES_ORDERS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const order = await getSalesOrder(id)
  if (!order) notFound()

  const [canUpdate, canValidate, canCancel, canDownload, canPrint, canInvoice, canSeeInvoices, canSeeQuotes] =
    await Promise.all([
      can(PERMISSIONS.SALES_ORDERS_UPDATE),
      can(PERMISSIONS.SALES_ORDERS_VALIDATE),
      can(PERMISSIONS.SALES_ORDERS_CANCEL),
      can(PERMISSIONS.SALES_ORDERS_DOWNLOAD),
      can(PERMISSIONS.SALES_ORDERS_PRINT),
      can(PERMISSIONS.CUSTOMER_INVOICES_CREATE),
      can(PERMISSIONS.CUSTOMER_INVOICES_VIEW),
      can(PERMISSIONS.SALES_QUOTES_VIEW),
    ])

  const editable = orderIsEditable(order.status)

  const [lines, variants, invoices] = await Promise.all([
    listSalesOrderLines(id),
    editable && canUpdate ? listSellableVariants(order.orderDate) : Promise.resolve([]),
    // `null` plutôt que `[]` sans la capacité : l'écran DIT qu'il ne sait pas,
    // au lieu d'affirmer qu'aucune facture n'existe (DEC-017, DEC-024).
    canSeeInvoices ? listOrderInvoices(id) : Promise.resolve(null),
  ])

  const activeLines = lines.filter((line) => !line.isArchived)
  const archivedCount = lines.length - activeLines.length

  const available = ORDER_TRANSITIONS[order.status].filter((next: OrderStatus) =>
    next === 'CANCELLED' ? canCancel : canValidate
  )

  return (
    <>
      <PageHeader
        title={order.orderNo}
        description={
          order.clientLabel
            ? `Commande de ${order.clientLabel}`
            : 'Client non lisible avec vos droits'
        }
        actions={
          <>
            <ButtonLink href="/commerce/commandes" tone="secondary" icon={ArrowLeft}>
              Retour
            </ButtonLink>
            <DocumentToolbar
              type="commandes-clients"
              id={order.id}
              label="la commande"
              canDownload={canDownload}
              canPrint={canPrint}
            />
          </>
        }
      />

      {searchParams.cree === '1' && (
        <Notice tone="success" className="mb-5">
          La commande a été créée. Vérifiez ses lignes, puis confirmez-la pour pouvoir la facturer.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Identité">
            <div className="mb-4">
              <Badge tone={ORDER_STATUS_TONES[order.status]}>
                {ORDER_STATUS_LABELS[order.status]}
              </Badge>
            </div>

            <dl className="divide-y divide-line">
              <Row label="Numéro" value={order.orderNo} />
              <Row label="Client" value={order.clientLabel} />
              <Row label="Date de commande" value={formatDate(order.orderDate)} />
              <Row
                label="Livraison attendue"
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
              order.quoteId
                ? 'Reprises du devis, prix compris. Le catalogue n’a pas été réinterrogé à la conversion.'
                : editable
                  ? 'Le prix d’une ligne de catalogue est figé à son ajout, au tarif du jour de la commande.'
                  : 'Cette commande est confirmée : ses lignes et ses prix sont figés.'
            }
          >
            {activeLines.length === 0 ? (
              <p className="text-sm text-muted">
                Aucune ligne active. Le total de cette commande est nul, et elle ne peut pas être
                confirmée.
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
                            {LINE_KIND_LABELS[lineKind(line.serviceId)]}
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
                              <ArchiveLineForm
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
                        {LINE_KIND_LABELS[lineKind(line.serviceId)]} · {line.quantity} ×{' '}
                        {formatAmount(line.unitPrice)}
                      </p>
                      <p className="mt-1 font-medium text-ink tabular">
                        {formatAmount(line.lineTotal)}
                      </p>
                      {editable && canUpdate && (
                        <div className="mt-2">
                          <ArchiveLineForm target="order" documentId={order.id} lineId={line.id} />
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
                {archivedCount > 1 ? 's' : ''}, conservée
                {archivedCount > 1 ? 's' : ''} à l’historique et hors du total.
              </p>
            )}
          </Card>

          {editable && canUpdate && (
            <Card title="Ajouter une ligne">
              <AddLinePanel
                target="order"
                documentId={order.id}
                variants={variants}
                documentDate={formatDate(order.orderDate) ?? order.orderDate}
              />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {order.quoteId && (
            <Card title="Origine">
              {!canSeeQuotes ? (
                <p className="text-sm text-muted">
                  Cette commande est issue d’un devis. Votre compte ne peut pas consulter les devis
                  clients : sa référence ne vous est pas communiquée.
                </p>
              ) : order.quoteNo ? (
                <>
                  <Link
                    href={`/commerce/devis/${order.quoteId}`}
                    className="inline-flex items-center gap-2 font-medium text-adikom-500 hover:underline tabular"
                  >
                    <FileText className="size-4" aria-hidden />
                    {order.quoteNo}
                  </Link>
                  <p className="mt-2 text-xs text-muted">
                    Le devis est conservé tel qu’il a été remis au client. Les prix de cette
                    commande en sont recopiés — le catalogue n’a pas été réinterrogé.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">Devis d’origine non lisible.</p>
              )}
            </Card>
          )}

          {available.length > 0 && (
            <Card title="Cycle de la commande">
              <OrderStatusPanel orderId={order.id} available={available} />
            </Card>
          )}

          {orderIsInvoiceable(order.status) && canInvoice && (
            <Card title="Facturer la commande">
              <InvoiceOrderPanel orderId={order.id} today={todayISO()} />
            </Card>
          )}

          <Card title="Facturation">
            {invoices === null ? (
              <p className="text-sm text-muted">
                Votre compte ne peut pas consulter les factures clients : l’état de facturation de
                cette commande reste inconnu de cet écran.
              </p>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-muted">
                Aucune facture n’a encore été préparée à partir de cette commande.
              </p>
            ) : (
              <ul className="space-y-2">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/facturation/clients/${invoice.id}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-adikom-500 hover:underline tabular"
                    >
                      <ReceiptText className="size-4" aria-hidden />
                      {invoice.invoiceNo}
                    </Link>
                    <span className="text-xs text-muted">
                      {CUSTOMER_INVOICE_STATUS_LABELS[invoice.status as CustomerInvoiceStatus] ??
                        invoice.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">
              Une facture issue d’une commande est une facture client ordinaire : elle s’émet, se
              règle — partiellement compris — et entre en trésorerie depuis le module Facturation.
            </p>
          </Card>

          {editable && canUpdate && (
            <Card title="Modifier l’en-tête">
              <EditOrderPanel
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
              <Row label="Confirmée le" value={formatDateTime(order.confirmedAt)} />
              <Row label="Livrée le" value={formatDateTime(order.deliveredAt)} />
              <Row label="Facturée le" value={formatDateTime(order.invoicedAt)} />
              <Row label="Annulée le" value={formatDateTime(order.cancelledAt)} />
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
