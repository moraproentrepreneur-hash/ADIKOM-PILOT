import 'server-only'

import { View } from '@react-pdf/renderer'

import {
  DataTable,
  Field,
  FieldColumns,
  Note,
  Section,
  StatusChip,
  type ChipTone,
} from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { formatDate } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import {
  CUSTOMER_INVOICE_STATUS_LABELS,
  LINE_KIND_LABELS,
  type CustomerInvoiceStatus,
} from '../constants'
import type { CustomerInvoiceDetail, CustomerInvoiceLine } from '../data'

/**
 * Facture client — document A4, DEC-042 §c.
 *
 * LES TROIS MONTANTS RESTENT SÉPARÉS
 *
 * Sous-total, réductions et total ne se confondent jamais (Workflow 07 §23) :
 * une réduction consentie doit rester lisible sur la pièce remise au client,
 * ligne à ligne, plutôt que d'être fondue dans un prix modifié en silence.
 *
 * CE QUI N'Y FIGURE QUE SI LE LECTEUR PEUT LE LIRE
 *
 * L'encaissé et le solde relèvent de `billing.customer_payments.view`
 * (DEC-024). Sans cette capacité, la section « Règlement » disparaît : elle ne
 * s'affiche pas à zéro, ce qui ferait passer une facture soldée pour impayée
 * (DEC-017).
 *
 * UN BROUILLON LE DIT
 *
 * Une facture non émise ne reconnaît aucune créance (Workflow 07 §25). Le
 * document le porte en toutes lettres : sans cette mention, un brouillon
 * imprimé circulerait comme une facture.
 */

const STATUS_TONES: Record<CustomerInvoiceStatus, ChipTone> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'danger',
  CANCELLED: 'danger',
}

export type CustomerInvoiceDocumentProps = {
  identity: DocumentIdentity
  invoice: CustomerInvoiceDetail
  lines: CustomerInvoiceLine[]
  /** `null` sans `parties.clients.view` : le document ne l'invente pas. */
  clientLabel: string | null
  /** Coordonnées du client, lorsqu'elles sont lisibles. */
  clientAddress: string[] | null
  /** `false` sans `billing.customer_payments.view` : la section se tait. */
  showPayments: boolean
  issuedOn: string
}

export function CustomerInvoiceDocument({
  identity,
  invoice,
  lines,
  clientLabel,
  clientAddress,
  showPayments,
  issuedOn,
}: CustomerInvoiceDocumentProps) {
  const kmf = (value: number) => formatAmount(value, { withCurrency: true })

  return (
    <DocumentShell
      identity={identity}
      title="Facture client"
      reference={invoice.invoiceNo}
      issuedOn={issuedOn}
    >
      <Section title={clientLabel ?? 'Client non lisible avec vos droits'}>
        <View style={{ marginBottom: 8 }}>
          <StatusChip
            label={CUSTOMER_INVOICE_STATUS_LABELS[invoice.status]}
            tone={STATUS_TONES[invoice.status]}
          />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Numéro" value={invoice.invoiceNo} />
              <Field label="Date de facture" value={formatDate(invoice.invoiceDate)} />
              <Field label="Échéance" value={formatDate(invoice.dueDate)} />
            </>
          }
          right={
            <>
              <Field label="Client" value={clientLabel} />
              {(clientAddress ?? []).map((line, index) => (
                <Field key={line} label={index === 0 ? 'Adresse' : ' '} value={line} />
              ))}
              <Field label="Location facturée" value={invoice.rentalNo} />
            </>
          }
        />
      </Section>

      <Section title="Détail">
        <DataTable
          columns={[
            { header: 'Nature', width: '18%', cell: (line: CustomerInvoiceLine) => LINE_KIND_LABELS[line.kind] },
            { header: 'Désignation', width: '42%', cell: (line: CustomerInvoiceLine) => line.label },
            {
              header: 'Qté',
              width: '10%',
              align: 'right',
              cell: (line: CustomerInvoiceLine) => String(line.quantity),
            },
            {
              header: 'Prix unitaire',
              width: '15%',
              align: 'right',
              cell: (line: CustomerInvoiceLine) => kmf(line.unitPrice),
            },
            {
              header: 'Montant',
              width: '15%',
              align: 'right',
              cell: (line: CustomerInvoiceLine) =>
                // Une réduction SE SOUSTRAIT : le montant reste positif en
                // base, c'est la nature qui porte le sens (Workflow 07 §24).
                line.kind === 'DISCOUNT' ? `− ${kmf(line.lineTotal)}` : kmf(line.lineTotal),
            },
          ]}
          rows={lines}
          emptyLabel="Aucune ligne. Le total de cette facture est nul."
        />
      </Section>

      <Section title="Montants">
        <FieldColumns
          left={
            <>
              <Field label="Sous-total" value={kmf(invoice.subtotal)} />
              <Field
                label="Réductions"
                value={invoice.discount > 0 ? `− ${kmf(invoice.discount)}` : null}
              />
            </>
          }
          right={
            <>
              <Field label="Total" value={kmf(invoice.total)} />
              {showPayments && (
                <>
                  <Field
                    label="Encaissé"
                    value={invoice.paidAmount === null ? null : kmf(invoice.paidAmount)}
                  />
                  <Field
                    label="Solde"
                    value={invoice.remainingDue === null ? null : kmf(invoice.remainingDue)}
                  />
                </>
              )}
            </>
          }
        />
      </Section>

      {invoice.notes && (
        <Section title="Observations">
          <Note>{invoice.notes}</Note>
        </Section>
      )}

      <Section title="Portée de ce document">
        <Note>
          {invoice.status === 'DRAFT'
            ? 'Cette facture est un BROUILLON : elle ne reconnaît aucune créance et ne doit pas être remise au client en l’état.'
            : invoice.status === 'CANCELLED'
              ? 'Cette facture est ANNULÉE : elle ne reconnaît plus aucune créance. Son historique est conservé.'
              : 'Cette facture reconnaît une créance et fige ses montants. Les états « Payée » et « Partiellement payée » ne s’écrivent pas : ils se calculent des règlements enregistrés.'}
        </Note>
      </Section>
    </DocumentShell>
  )
}
