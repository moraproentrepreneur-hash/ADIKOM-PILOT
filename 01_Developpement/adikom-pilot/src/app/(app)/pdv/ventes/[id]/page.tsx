import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Badge, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Denied } from '@/components/ui/figure'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { ENTRY_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/features/treasury/constants'
import { SALE_STATUS_LABELS, SALE_STATUS_TONES } from '@/features/pos-sales/constants'
import { getSale } from '@/features/pos-sales/data'
import { CancelSalePanel, InvoiceSalePanel, ValueCostsPanel } from '@/features/pos-sales/panels'
import { listClientOptions } from '@/features/clients/data'

export const metadata: Metadata = { title: 'Vente au comptoir' }

/**
 * Fiche d'une vente — LOT 28, Module 12 §13 à §19.
 *
 * Les montants affichés sont CEUX DE LA BASE (`pos_sale_total`, `pos_sale_paid`,
 * `pos_sale_change` — D1). Chaque bloc dont la lecture relève d'une autre
 * capacité — écritures, facture, coût copié — dit ce qui manque au lieu de se
 * taire (DEC-017).
 */
export default async function SaleDetailPage(props: PageProps<'/pdv/ventes/[id]'>) {
  const user = await requirePermissionOrRedirect(PERMISSIONS.POS_SALES_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const [canSeeEntries, canSeeInvoices, canSeeCosts, canUpdateCosts, canDownload, canPrint, canCancel, invoicing] = await Promise.all([
    can(PERMISSIONS.ENTRIES_VIEW),
    can(PERMISSIONS.CUSTOMER_INVOICES_VIEW),
    can(PERMISSIONS.SERVICES_COST_VIEW),
    can(PERMISSIONS.SERVICES_COST_UPDATE),
    can(PERMISSIONS.POS_SALES_DOWNLOAD),
    can(PERMISSIONS.POS_SALES_PRINT),
    can(PERMISSIONS.POS_SALES_CANCEL),
    Promise.all([
      can(PERMISSIONS.CUSTOMER_INVOICES_CREATE),
      can(PERMISSIONS.CUSTOMER_INVOICES_ISSUE),
      can(PERMISSIONS.CUSTOMER_PAYMENTS_CREATE),
      can(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW),
      can(PERMISSIONS.CLIENTS_VIEW),
      can(PERMISSIONS.SERVICES_VIEW),
    ]),
  ])
  const canInvoice = user.isSuperAdmin || (canSeeInvoices && invoicing.every(Boolean))

  const sale = await getSale(id, { canSeeEntries, canSeeInvoices, canSeeCosts })
  if (!sale) notFound()

  const remaining = Math.max(sale.net - sale.paid, 0)

  // Q-10 : une vente anonyme reçoit son client à sa facturation.
  const anonymousInvoicing = canInvoice && !sale.clientId && sale.status === 'VALIDATED' && sale.net > 0
  const clientOptions = anonymousInvoicing ? await listClientOptions() : null

  // Q-13 : lignes sans coût copié, valorisables par qui gère les coûts.
  const missingCosts = sale.lines.filter((line) => line.unitCost === null).length
  const canValueCosts = (user.isSuperAdmin || (canSeeCosts && canUpdateCosts)) && sale.status === 'VALIDATED' && missingCosts > 0
  const invoiced = sale.invoice !== undefined && sale.invoice !== null

  return (
    <>
      <Link
        href="/pdv/ventes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux ventes
      </Link>

      {searchParams.encaissee === '1' && (
        <Notice tone="success" className="mb-5">
          Vente <strong>{sale.saleNo}</strong> encaissée : {formatAmount(sale.paid, { withCurrency: true })}.
          {sale.change > 0 && (
            <>
              {' '}
              Monnaie à rendre : <strong>{formatAmount(sale.change, { withCurrency: true })}</strong>.
            </>
          )}
        </Notice>
      )}
      {searchParams.facturee === '1' && (
        <Notice tone="success" className="mb-5">
          Facture émise et soldée par les paiements reçus au comptoir — aucune nouvelle écriture de trésorerie.
        </Notice>
      )}
      {searchParams.annulee === '1' && (
        <Notice tone="success" className="mb-5">
          Vente annulée : ses paiements et leurs écritures sont annulés, rien n’est effacé.
        </Notice>
      )}

      <PageHeader
        title={`Vente ${sale.saleNo}`}
        description={`${formatDateTime(sale.soldAt)} · ${sale.cashierLabel}`}
        actions={<Badge tone={SALE_STATUS_TONES[sale.status]}>{SALE_STATUS_LABELS[sale.status]}</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Vente">
            <dl>
              <InfoRow label="Session">
                {sale.sessionNo ? (
                  <Link href={`/pdv/sessions/${sale.sessionId}`} className="text-adikom-500 hover:underline">
                    {sale.sessionNo}
                  </Link>
                ) : (
                  <span className="text-muted">Session non lisible avec vos droits</span>
                )}
                {sale.sessionStatus === 'CLOSED' && <span className="ml-1.5 text-xs text-muted">(close)</span>}
              </InfoRow>
              <InfoRow label="Caisse">{sale.registerLabel ?? <span className="text-muted">Caisse non lisible avec vos droits</span>}</InfoRow>
              <InfoRow label="Caissier">{sale.cashierLabel}</InfoRow>
              <InfoRow label="Client">{sale.clientLabel}</InfoRow>
              <InfoRow label="Observation">{sale.observation ?? <Empty />}</InfoRow>
              {sale.status === 'CANCELLED' && (
                <>
                  <InfoRow label="Annulée le">{formatDateTime(sale.cancelledAt)}</InfoRow>
                  <InfoRow label="Motif">{sale.cancelReason}</InfoRow>
                </>
              )}
            </dl>
          </Card>

          <Card title="Prestations" description="Prix du catalogue au jour de la vente — jamais saisis.">
            <div className="-mx-5 -my-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-adikom-50 text-left">
                    <th className="px-5 py-2.5 font-medium text-ink">Service</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink">Qté</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink">Prix</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink">Remise</th>
                    <th className="px-5 py-2.5 text-right font-medium text-ink">Montant</th>
                    {canSeeCosts && <th className="px-5 py-2.5 text-right font-medium text-ink">Marge</th>}
                  </tr>
                </thead>
                <tbody>
                  {sale.lines.map((line) => (
                    <tr key={line.id} className="border-b border-line last:border-b-0">
                      <td className="px-5 py-2.5">{line.label}</td>
                      <td className="px-3 py-2.5 text-right tabular">{line.quantity}</td>
                      <td className="px-3 py-2.5 text-right tabular">{formatAmount(line.unitPrice)}</td>
                      <td className="px-3 py-2.5 text-right tabular">{line.discount ? formatAmount(line.discount) : '—'}</td>
                      <td className="px-5 py-2.5 text-right tabular">{formatAmount(line.net)}</td>
                      {canSeeCosts && (
                        <td className="px-5 py-2.5 text-right tabular">
                          {line.unitCost === null ? (
                            <span className="text-xs text-muted" title="Aucun coût copié : le vendeur ne pouvait pas le lire, ou aucun coût n’était en vigueur.">
                              inconnue
                            </span>
                          ) : (
                            formatAmount(line.net - line.unitCost * line.quantity)
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Paiements" description="Mode, compte mouvementé, montant donné et montant encaissé.">
            {sale.payments.length === 0 ? (
              <p className="text-sm text-muted">Aucun paiement reçu au comptoir.</p>
            ) : (
              <ul className="divide-y divide-line">
                {sale.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {PAYMENT_METHOD_LABELS[payment.method]}
                        {payment.status === 'CANCELLED' && <Badge tone="neutral" className="ml-2">Annulé</Badge>}
                      </p>
                      <p className="text-xs text-muted">
                        {payment.accountLabel}
                        {payment.externalRef && ` · réf. ${payment.externalRef}`}
                      </p>
                    </div>
                    <p className="text-sm tabular text-ink">
                      donné {formatAmount(payment.tendered)} · encaissé <strong>{formatAmount(payment.applied)}</strong>
                      {payment.change > 0 && ` · monnaie ${formatAmount(payment.change)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Écritures de trésorerie" description="Une écriture par paiement, de l’encaissé.">
            {sale.entries === null ? (
              <Denied missing={[PERMISSIONS.ENTRIES_VIEW]} />
            ) : sale.entries.length === 0 ? (
              <p className="text-sm text-muted">Aucune écriture : aucun paiement n’a été reçu au comptoir.</p>
            ) : (
              <ul className="divide-y divide-line">
                {sale.entries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="text-ink">{entry.description ?? 'Vente au comptoir'}</span>
                      <span className="block text-xs text-muted">{entry.accountLabel}</span>
                    </span>
                    <span className="shrink-0 tabular">
                      + {formatAmount(entry.amount)}{' '}
                      <Badge tone={entry.status === 'VALIDATED' ? 'success' : 'neutral'}>
                        {ENTRY_STATUS_LABELS[entry.status]}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Montants" description="Calculés par la base, jamais stockés.">
            <dl>
              <InfoRow label="Sous-total"><span className="tabular">{formatAmount(sale.subtotal)}</span></InfoRow>
              {sale.globalDiscount > 0 && (
                <InfoRow label="Remise globale"><span className="tabular">− {formatAmount(sale.globalDiscount)}</span></InfoRow>
              )}
              <InfoRow label="Total à payer">
                <span className="tabular font-semibold">{formatAmount(sale.net, { withCurrency: true })}</span>
              </InfoRow>
              <InfoRow label="Montant donné"><span className="tabular">{formatAmount(sale.tendered)}</span></InfoRow>
              <InfoRow label="Montant encaissé"><span className="tabular">{formatAmount(sale.paid)}</span></InfoRow>
              <InfoRow label="Monnaie rendue"><span className="tabular">{formatAmount(sale.change)}</span></InfoRow>
              {remaining > 0 && sale.status === 'VALIDATED' && (
                <InfoRow label="Reste dû" hint="Suivi par la facture client.">
                  <span className="tabular text-warning">{formatAmount(remaining, { withCurrency: true })}</span>
                </InfoRow>
              )}
            </dl>
          </Card>

          <Card title="Reçu" description="A4, sans coût ni marge.">
            {canDownload || canPrint ? (
              <DocumentToolbar type="ventes" id={sale.id} label="le reçu" canDownload={canDownload} canPrint={canPrint} />
            ) : (
              <Denied missing={[PERMISSIONS.POS_SALES_DOWNLOAD, PERMISSIONS.POS_SALES_PRINT]} />
            )}
          </Card>

          <Card title="Facture" description="Sur demande : adossée aux paiements reçus, sans seconde écriture.">
            {sale.invoice === undefined ? (
              <Denied missing={[PERMISSIONS.CUSTOMER_INVOICES_VIEW]} />
            ) : sale.invoice ? (
              <dl>
                <InfoRow label="Facture">
                  <Link href={`/facturation/clients/${sale.invoice.id}`} className="text-adikom-500 hover:underline">
                    {sale.invoice.invoiceNo}
                  </Link>
                </InfoRow>
                <InfoRow label="Date">{formatDate(sale.invoice.invoiceDate)}</InfoRow>
              </dl>
            ) : sale.status !== 'VALIDATED' ? (
              <p className="text-sm text-muted">Une vente annulée ne se facture pas.</p>
            ) : sale.net <= 0 ? (
              <p className="text-sm text-muted">Le net de cette vente est nul : il n’y a rien à facturer.</p>
            ) : canInvoice ? (
              <InvoiceSalePanel saleId={sale.id} clients={sale.clientId ? undefined : clientOptions} />
            ) : (
              <Denied
                missing={[
                  PERMISSIONS.CUSTOMER_INVOICES_CREATE,
                  PERMISSIONS.CUSTOMER_INVOICES_ISSUE,
                  PERMISSIONS.CUSTOMER_PAYMENTS_CREATE,
                ]}
              />
            )}
          </Card>

          {canValueCosts && (
            <Card title="Coûts et marge" description="Valorisation ultérieure, au coût du jour de la vente.">
              <ValueCostsPanel saleId={sale.id} missing={missingCosts} />
            </Card>
          )}

          {sale.status === 'VALIDATED' && canCancel && (
            <Card title="Annuler la vente" description="Motif obligatoire.">
              {sale.invoice === undefined ? (
                <Denied missing={[PERMISSIONS.CUSTOMER_INVOICES_VIEW]} />
              ) : invoiced ? (
                <p className="text-sm text-muted">
                  Cette vente est facturée : elle ne s’annule pas tant que les avoirs ne sont pas gérés.
                </p>
              ) : !canSeeEntries ? (
                <Denied missing={[PERMISSIONS.ENTRIES_VIEW]} />
              ) : (
                <CancelSalePanel saleId={sale.id} sessionClosed={sale.sessionStatus === 'CLOSED'} />
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
