import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Banknote, Receipt } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime, todayISO } from '@/lib/dates'
import { getRentalDetail } from '@/features/rentals/data'
import {
  getCustomerInvoiceDetail,
  listCustomerInvoiceLines,
} from '@/features/customer-invoices/data'
import {
  acceptsPayments,
  CUSTOMER_INVOICE_STATUS_EFFECT,
  CUSTOMER_INVOICE_STATUS_LABELS,
  CUSTOMER_INVOICE_STATUS_TONES,
  displayStatus,
  formatAmount,
  isCancellable,
  isDeduction,
  isEditable,
  LINE_KIND_LABELS,
} from '@/features/customer-invoices/constants'
import {
  AddCustomerInvoiceLinePanel,
  ArchiveCustomerLineButton,
  CancelCustomerInvoicePanel,
  EditCustomerInvoicePanel,
  IssueCustomerInvoicePanel,
} from '@/features/customer-invoices/panels'
import { listInvoiceCustomerPayments } from '@/features/customer-payments/data'
import {
  CancelCustomerPaymentPanel,
  RecordCustomerPaymentPanel,
} from '@/features/customer-payments/panels'
import { listOperableAccounts } from '@/features/treasury/data'
import { PAYMENT_METHOD_LABELS } from '@/features/treasury/constants'

export const metadata: Metadata = { title: 'Facture client' }

/**
 * Fiche d'une facture client — Étape 2.5, LOTs 7 et 8.
 *
 * ELLE RÉPOND À LA QUESTION DE WORKFLOW 07 §74 : « La facture doit toujours être
 * explicable. » Chaque ligne porte sa nature, sa quantité, son prix unitaire et
 * sa justification ; une réduction est visible comme telle (§24) ; la location
 * d'origine est atteignable en un clic (§49) ; chaque encaissement est daté,
 * nommé et rattaché au compte qu'il a crédité (§13, §47).
 *
 * CE QU'ELLE REFUSE D'AFFICHER.
 *
 * Un montant encaissé lu sans droit. Sans `billing.customer_payments.view`,
 * l'encaissé et le solde valent `null` — l'écran le DIT plutôt que d'afficher
 * un zéro qui se lirait « rien d'encaissé » (DEC-017, DEC-024).
 */
export default async function CustomerInvoiceDetailPage(
  props: PageProps<'/facturation/clients/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.CUSTOMER_INVOICES_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams
  const justCreated = searchParams.cree === '1'

  const [
    canUpdate,
    canIssue,
    canCancel,
    canSeeRentals,
    canSeeRentalAmounts,
    canSeePayments,
    canPay,
    canCancelPayment,
    canSeeAccounts,
  ] = await Promise.all([
    can(PERMISSIONS.CUSTOMER_INVOICES_UPDATE),
    can(PERMISSIONS.CUSTOMER_INVOICES_ISSUE),
    can(PERMISSIONS.CUSTOMER_INVOICES_CANCEL),
    can(PERMISSIONS.RENTALS_VIEW),
    can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
    can(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW),
    can(PERMISSIONS.CUSTOMER_PAYMENTS_CREATE),
    can(PERMISSIONS.CUSTOMER_PAYMENTS_CANCEL),
    can(PERMISSIONS.ACCOUNTS_VIEW),
  ])

  const invoice = await getCustomerInvoiceDetail(id, { canSeePayments })
  if (!invoice) notFound()

  const editable = isEditable(invoice.status)

  const shown = displayStatus(invoice.status, invoice.dueDate, invoice.total, invoice.paidAmount)
  const payable = acceptsPayments(shown)

  const [lines, rental, payments, accounts] = await Promise.all([
    listCustomerInvoiceLines(id),
    /*
     * Le tarif verrouillé n'est proposé qu'à qui a le droit de le voir : lire
     * une location et lire ses montants sont deux capacités distinctes
     * (DEC-024). Sans la seconde, la ligne de location se saisit entièrement.
     */
    invoice.rentalId && editable && canSeeRentals && canSeeRentalAmounts
      ? getRentalDetail(invoice.rentalId)
      : Promise.resolve(null),
    /*
     * Sans la capacité, la section DISPARAÎT : une liste vide se lirait
     * « aucun encaissement », affirmation qu'un refus de lecture ne permet pas
     * (DEC-017).
     */
    canSeePayments ? listInvoiceCustomerPayments(id) : Promise.resolve(null),
    // Module 06 §10 : seuls les comptes actifs sont proposés.
    payable && canPay && canSeeAccounts ? listOperableAccounts() : Promise.resolve(null),
  ])

  const hasRentalLine = lines.some((line) => line.kind === 'RENTAL')

  return (
    <>
      <Link
        href="/facturation/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux factures
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Facture préparée sous le numéro <strong>{invoice.invoiceNo}</strong>. Ajoutez ses lignes :
          leur somme fera le total.
        </Notice>
      )}

      <PageHeader
        title={formatAmount(invoice.total) ?? '—'}
        description={`${invoice.invoiceNo} · ${invoice.clientLabel ?? 'Client non communiqué'}`}
        actions={
          <Badge tone={CUSTOMER_INVOICE_STATUS_TONES[shown]}>
            {CUSTOMER_INVOICE_STATUS_LABELS[shown]}
          </Badge>
        }
      />

      {shown === 'OVERDUE' && (
        <Notice tone="warning" className="mb-5">
          L’échéance de cette facture est <strong>dépassée</strong> et son solde n’est pas
          encaissé.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="Montants"
            description="Sous-total, réductions et total restent séparés (Workflow 07 §23)."
          >
            <dl>
              <InfoRow label="Sous-total" hint="Location, services et frais.">
                <span className="tabular">{formatAmount(invoice.subtotal)}</span>
              </InfoRow>

              <InfoRow
                label="Réductions"
                hint="Identifiables ligne à ligne : jamais un prix modifié en silence (§24)."
              >
                {invoice.discount > 0 ? (
                  <span className="tabular">− {formatAmount(invoice.discount)}</span>
                ) : (
                  <Empty />
                )}
              </InfoRow>

              <InfoRow label="Total" hint="Sous-total moins les réductions.">
                <span className="font-medium tabular">{formatAmount(invoice.total)}</span>
              </InfoRow>

              <InfoRow label="Encaissé" hint="Règlements validés (Workflow 08 §21, §32).">
                {invoice.paidAmount === null ? (
                  <span className="text-muted">
                    Votre compte ne peut pas consulter les règlements.
                  </span>
                ) : (
                  <span className="tabular">{formatAmount(invoice.paidAmount)}</span>
                )}
              </InfoRow>

              <InfoRow label="Solde" hint="Total moins les encaissements validés (§21, §28).">
                {invoice.remainingDue === null ? (
                  <span className="text-muted">
                    Non calculable sans le droit de consulter les règlements.
                  </span>
                ) : (
                  <span className="font-medium tabular">{formatAmount(invoice.remainingDue)}</span>
                )}
              </InfoRow>

              <InfoRow label="Effet">{CUSTOMER_INVOICE_STATUS_EFFECT[shown]}</InfoRow>
            </dl>
          </Card>

          <Card
            title="Lignes"
            description="Leur somme fait le total (Workflow 07 §22, §60)."
          >
            {lines.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="Aucune ligne"
                description="Une facture sans ligne ne peut pas être émise : son total serait nul."
              />
            ) : (
              <div className="-mx-5 -my-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-adikom-50 text-left">
                      <th className="px-5 py-3 font-medium text-ink">Désignation</th>
                      <th className="px-5 py-3 text-right font-medium text-ink">Qté</th>
                      <th className="px-5 py-3 text-right font-medium text-ink">Prix unitaire</th>
                      <th className="px-5 py-3 text-right font-medium text-ink">Total</th>
                      {canUpdate && editable && <th className="px-5 py-3" />}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} className="border-b border-line last:border-b-0">
                        <td className="px-5 py-3">
                          <p className="font-medium text-ink">{line.label}</p>
                          <p className="text-xs text-muted">
                            {LINE_KIND_LABELS[line.kind]}
                            {line.justification ? ` — ${line.justification}` : ''}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-right text-muted tabular">
                          {line.quantity}
                        </td>
                        <td className="px-5 py-3 text-right text-muted tabular">
                          {formatAmount(line.unitPrice)}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-ink tabular">
                          {isDeduction(line.kind) ? '− ' : ''}
                          {formatAmount(line.lineTotal)}
                        </td>
                        {canUpdate && editable && (
                          <td className="px-5 py-3 text-right">
                            <ArchiveCustomerLineButton invoiceId={id} lineId={line.id} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {canSeePayments ? (
            <Card
              title="Règlements"
              description="Encaissements réels, rattachés au compte crédité (Workflow 08 §13, §47)."
            >
              {payments === null || payments.length === 0 ? (
                <EmptyState
                  icon={Banknote}
                  title="Aucun règlement"
                  description={
                    payable
                      ? 'Cette créance n’a encore fait entrer aucun argent sur un compte.'
                      : 'Seule une facture émise peut être encaissée.'
                  }
                />
              ) : (
                <ul className="divide-y divide-line">
                  {payments.map((payment) => (
                    <li key={payment.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink tabular">{payment.paymentNo}</p>
                          <p className="text-xs text-muted">
                            {formatDate(payment.receivedOn)} ·{' '}
                            {PAYMENT_METHOD_LABELS[payment.method]}
                            {payment.externalRef ? ` · ${payment.externalRef}` : ''}
                          </p>
                          <p className="text-xs text-muted">
                            {payment.accountLabel ? (
                              <Link
                                href={`/tresorerie/comptes/${payment.accountId}`}
                                className="text-adikom-500 hover:underline"
                              >
                                {payment.accountLabel}
                              </Link>
                            ) : (
                              'Compte non lisible avec vos droits'
                            )}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className={
                              payment.status === 'CANCELLED'
                                ? 'text-sm text-muted line-through tabular'
                                : 'font-medium tabular'
                            }
                          >
                            + {formatAmount(payment.amount)}
                          </span>
                          <Badge tone={payment.status === 'CANCELLED' ? 'danger' : 'success'}>
                            {payment.status === 'CANCELLED' ? 'Annulé' : 'Validé'}
                          </Badge>
                        </div>
                      </div>

                      {canCancelPayment && payment.status === 'VALIDATED' && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                            Annuler ce règlement
                          </summary>
                          <div className="mt-3 rounded-control border border-line p-4">
                            <CancelCustomerPaymentPanel
                              paymentId={payment.id}
                              invoiceId={id}
                              amount={payment.amount}
                            />
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : (
            <Notice tone="warning">
              Votre compte ne peut pas consulter les règlements : cette facture peut avoir été
              encaissée sans que cet écran puisse le montrer.
            </Notice>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Facture">
            <dl>
              <InfoRow label="Numéro">
                <span className="tabular">{invoice.invoiceNo}</span>
              </InfoRow>
              <InfoRow label="Client">
                {invoice.clientLabel ? (
                  <Link
                    href={`/tiers/clients/${invoice.clientId}?onglet=factures`}
                    className="text-adikom-500 hover:underline"
                  >
                    {invoice.clientLabel}
                  </Link>
                ) : (
                  <span className="text-muted">
                    Votre compte ne peut pas consulter les clients.
                  </span>
                )}
              </InfoRow>
              <InfoRow
                label="Location facturée"
                hint="Facture → Location → Véhicule → Client (§49)."
              >
                {invoice.rentalId === null ? (
                  <span className="text-muted">Facture de services, sans location.</span>
                ) : invoice.rentalNo ? (
                  <Link
                    href={`/location/locations/${invoice.rentalId}`}
                    className="text-adikom-500 hover:underline tabular"
                  >
                    {invoice.rentalNo}
                  </Link>
                ) : (
                  <span className="text-muted">
                    Votre compte ne peut pas consulter les locations.
                  </span>
                )}
              </InfoRow>
              <InfoRow label="Date">{formatDate(invoice.invoiceDate)}</InfoRow>
              <InfoRow label="Échéance">{formatDate(invoice.dueDate) ?? <Empty />}</InfoRow>
              <InfoRow label="Observations">{invoice.notes ?? <Empty />}</InfoRow>
              <InfoRow label="Motif du dernier changement">
                {invoice.statusReason ?? <Empty />}
              </InfoRow>
            </dl>
          </Card>

          <Card title="Historique">
            <dl>
              <InfoRow label="Préparée le">{formatDateTime(invoice.createdAt)}</InfoRow>
              <InfoRow label="Émise le">
                {invoice.issuedAt ? formatDateTime(invoice.issuedAt) : <Empty />}
              </InfoRow>
              <InfoRow label="Annulée le">
                {invoice.cancelledAt ? formatDateTime(invoice.cancelledAt) : <Empty />}
              </InfoRow>
            </dl>
            <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
              Qui a préparé, qui a émis, qui a annulé : le journal d’audit conserve l’avant,
              l’après et l’auteur de chaque écriture (§48, §71).
            </p>
          </Card>

          {canUpdate && editable && (
            <Card
              title="Ajouter une ligne"
              description="La somme des lignes fait le total."
            >
              <AddCustomerInvoiceLinePanel
                invoiceId={id}
                suggestedLabel={
                  rental && !hasRentalLine
                    ? `Location ${rental.vehicleLabel} — ${rental.rentalNo}`
                    : null
                }
                suggestedUnitPrice={rental && !hasRentalLine ? rental.lockedAmount : null}
                suggestedUnit={rental && !hasRentalLine ? rental.lockedUnit : null}
              />
            </Card>
          )}

          {canUpdate && editable && (
            <Card title="Modifier" description="Tant que la facture n’est pas émise.">
              <EditCustomerInvoicePanel
                invoiceId={id}
                invoiceDate={invoice.invoiceDate}
                dueDate={invoice.dueDate}
                notes={invoice.notes}
              />
            </Card>
          )}

          {canIssue && invoice.status === 'DRAFT' && (
            <Card title="Émettre" description="Reconnaître la créance (Workflow 07 §26).">
              <IssueCustomerInvoicePanel
                invoiceId={id}
                hasRental={invoice.rentalId !== null}
                total={invoice.total}
              />
            </Card>
          )}

          {canPay && payable && (
            <Card
              title="Enregistrer un règlement"
              description="L’encaissement qui solde la créance (Workflow 08 §5, §47)."
            >
              <RecordCustomerPaymentPanel
                invoiceId={id}
                accounts={
                  !canSeeAccounts
                    ? null
                    : (accounts ?? []).map((account) => ({
                        id: account.id,
                        label: `${account.label} (${account.accountNo})`,
                      }))
                }
                remainingDue={invoice.remainingDue}
                today={todayISO()}
              />
            </Card>
          )}

          {canCancel && isCancellable(shown) && (
            <Card title="Annuler" description="L’historique est conservé.">
              <CancelCustomerInvoicePanel
                invoiceId={id}
                hasRental={invoice.rentalId !== null}
              />
            </Card>
          )}

          <Card title="Étape suivante">
            <p className="text-sm text-muted">
              {invoice.status === 'CANCELLED'
                ? invoice.rentalId
                  ? 'Cette facture est annulée : la location qu’elle facturait est redevenue « À facturer » et peut recevoir une nouvelle facture.'
                  : 'Cette facture est annulée. L’historique est conservé.'
                : invoice.status === 'DRAFT'
                  ? invoice.total > 0
                    ? 'Les lignes sont saisies : la facture peut être émise. L’émission fige ses montants.'
                    : 'Ajoutez au moins une ligne facturable : une facture sans total ne peut pas être émise.'
                  : invoice.remainingDue === null
                    ? 'La créance est reconnue. Son solde n’est pas calculable avec vos droits.'
                    : invoice.remainingDue <= 0
                      ? invoice.rentalId
                        ? 'Cette facture est soldée. La location qu’elle facture peut être clôturée si elle ne l’est pas déjà.'
                        : 'Cette facture est soldée : son total est intégralement encaissé.'
                      : `Reste ${formatAmount(invoice.remainingDue)} à encaisser.${
                          invoice.rentalId
                            ? ' La location, elle, peut être clôturée sans attendre le paiement (Workflow 01 §42).'
                            : ''
                        }`}
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
