import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Receipt } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import { getRentalDetail } from '@/features/rentals/data'
import {
  getCustomerInvoiceDetail,
  listCustomerInvoiceLines,
} from '@/features/customer-invoices/data'
import {
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

export const metadata: Metadata = { title: 'Facture client' }

/**
 * Fiche d'une facture client — Étape 2.5, LOT 7.
 *
 * ELLE RÉPOND À LA QUESTION DE WORKFLOW 07 §74 : « La facture doit toujours être
 * explicable. » Chaque ligne porte sa nature, sa quantité, son prix unitaire et
 * sa justification ; une réduction est visible comme telle (§24) ; la location
 * d'origine est atteignable en un clic (§49).
 *
 * CE QUE CET ÉCRAN REFUSE D'AFFICHER.
 *
 * Un montant encaissé et un solde. Ils supposent des règlements clients, qui
 * relèvent d'une étape ultérieure : afficher « 0 KMF encaissé » laisserait
 * croire que le système l'a vérifié.
 */
export default async function CustomerInvoiceDetailPage(
  props: PageProps<'/facturation/clients/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.CUSTOMER_INVOICES_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams
  const justCreated = searchParams.cree === '1'

  const [canUpdate, canIssue, canCancel, canSeeRentals, canSeeRentalAmounts] = await Promise.all([
    can(PERMISSIONS.CUSTOMER_INVOICES_UPDATE),
    can(PERMISSIONS.CUSTOMER_INVOICES_ISSUE),
    can(PERMISSIONS.CUSTOMER_INVOICES_CANCEL),
    can(PERMISSIONS.RENTALS_VIEW),
    can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
  ])

  const invoice = await getCustomerInvoiceDetail(id)
  if (!invoice) notFound()

  const editable = isEditable(invoice.status)

  const [lines, rental] = await Promise.all([
    listCustomerInvoiceLines(id),
    /*
     * Le tarif verrouillé n'est proposé qu'à qui a le droit de le voir : lire
     * une location et lire ses montants sont deux capacités distinctes
     * (DEC-024). Sans la seconde, la ligne de location se saisit entièrement.
     */
    invoice.rentalId && editable && canSeeRentals && canSeeRentalAmounts
      ? getRentalDetail(invoice.rentalId)
      : Promise.resolve(null),
  ])

  const shown = displayStatus(invoice.status, invoice.dueDate, invoice.total, invoice.paidAmount)
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
          L’échéance de cette facture est <strong>dépassée</strong>. Aucun encaissement n’étant
          géré, ce constat repose sur l’échéance seule.
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

              <InfoRow label="Encaissé" hint="Règlements clients (§32).">
                <span className="text-muted">
                  Les encaissements clients ne sont pas encore gérés.
                </span>
              </InfoRow>

              <InfoRow label="Solde" hint="Total moins les encaissements (§28).">
                <span className="text-muted">
                  Non calculable tant qu’aucun encaissement n’est enregistré.
                </span>
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

          {canCancel && isCancellable(invoice.status) && (
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
                  : invoice.rentalId
                    ? 'La créance est reconnue et la location est « Facturée ». Elle peut désormais être clôturée, même avant encaissement.'
                    : 'La créance est reconnue. Son encaissement relève d’une étape ultérieure.'}
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
