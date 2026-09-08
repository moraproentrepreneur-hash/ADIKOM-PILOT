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
  SUPPLIER_INVOICE_STATUS_LABELS,
  type SupplierInvoiceStatus,
} from '../constants'
import type { SupplierInvoiceDetail, SupplierInvoiceLine } from '../data'

/**
 * Facture fournisseur — document A4, DEC-042 §c.
 *
 * BRUT, IMPUTÉ, NET : TROIS MONTANTS QUI NE SE MÉLANGENT PAS
 *
 * C'est la règle la plus sensible du SaaS (CLAUDE.md §16, §57) : une imputation
 * de maintenance n'est PAS un paiement. Le document les tient donc séparés, et
 * détaille chaque imputation — un net à payer réduit sans que la raison
 * apparaisse serait invérifiable pour le fournisseur comme pour ADIKOM.
 *
 *   Brut − imputé = net à payer
 *   Net  − payé   = reste dû
 *
 * CE QUI DISPARAÎT PLUTÔT QUE DE VALOIR ZÉRO
 *
 * L'imputé relève de `billing.imputations.view`, le payé de
 * `billing.supplier_payments.view` (DEC-024). Sans l'une, la ligne
 * correspondante n'est pas écrite : un « 0 imputé » ferait passer pour dû ce
 * qu'une imputation a déjà réduit (DEC-017).
 */

const STATUS_TONES: Record<SupplierInvoiceStatus, ChipTone> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  VALIDATED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'danger',
}

export type SupplierInvoiceDocumentProps = {
  identity: DocumentIdentity
  invoice: SupplierInvoiceDetail
  lines: SupplierInvoiceLine[]
  /** Imputations rattachées. `null` sans `billing.imputations.view`. */
  imputations: { imputationNo: string; amount: number; maintenanceNo: string | null }[] | null
  issuedOn: string
}

export function SupplierInvoiceDocument({
  identity,
  invoice,
  lines,
  imputations,
  issuedOn,
}: SupplierInvoiceDocumentProps) {
  const kmf = (value: number) => formatAmount(value, { withCurrency: true })

  return (
    <DocumentShell
      identity={identity}
      title="Facture fournisseur"
      reference={invoice.invoiceNo}
      subtitle="Dette d’ADIKOM envers son fournisseur"
      issuedOn={issuedOn}
    >
      <Section title={invoice.supplierLabel ?? 'Fournisseur non lisible avec vos droits'}>
        <View style={{ marginBottom: 8 }}>
          <StatusChip
            label={SUPPLIER_INVOICE_STATUS_LABELS[invoice.status]}
            tone={STATUS_TONES[invoice.status]}
          />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Numéro interne" value={invoice.invoiceNo} />
              <Field label="Référence du fournisseur" value={invoice.externalRef} />
              <Field label="Fournisseur" value={invoice.supplierLabel} />
            </>
          }
          right={
            <>
              <Field label="Date de facture" value={formatDate(invoice.invoiceDate)} />
              <Field label="Échéance" value={formatDate(invoice.dueDate)} />
              <Field label="Validée le" value={formatDate(invoice.validatedAt)} />
            </>
          }
        />
      </Section>

      <Section title="Lignes">
        <DataTable
          columns={[
            { header: 'Désignation', width: '52%', cell: (line: SupplierInvoiceLine) => line.label },
            {
              header: 'Véhicule',
              width: '28%',
              cell: (line: SupplierInvoiceLine) => line.vehicleLabel ?? '—',
            },
            {
              header: 'Montant',
              width: '20%',
              align: 'right',
              cell: (line: SupplierInvoiceLine) => kmf(line.amount),
            },
          ]}
          rows={lines}
          emptyLabel="Aucune ligne. Le montant brut de cette facture est nul."
        />
      </Section>

      {imputations !== null && (
        <Section title="Imputations de maintenance">
          <DataTable
            columns={[
              {
                header: 'Imputation',
                width: '34%',
                cell: (row: { imputationNo: string }) => row.imputationNo,
              },
              {
                header: 'Maintenance',
                width: '38%',
                cell: (row: { maintenanceNo: string | null }) => row.maintenanceNo ?? '—',
              },
              {
                header: 'Montant imputé',
                width: '28%',
                align: 'right',
                cell: (row: { amount: number }) => `− ${kmf(row.amount)}`,
              },
            ]}
            rows={imputations}
            emptyLabel="Aucune imputation rattachée à cette facture."
          />
          <Note>
            Une imputation n’est pas un paiement : elle réduit le montant dû, elle ne le règle
            pas. Chaque imputation reste identifiable et traçable.
          </Note>
        </Section>
      )}

      <Section title="Montants">
        <FieldColumns
          left={
            <>
              <Field label="Montant brut" value={kmf(invoice.grossAmount)} />
              {invoice.imputedAmount !== null && (
                <Field
                  label="Total imputé"
                  value={invoice.imputedAmount > 0 ? `− ${kmf(invoice.imputedAmount)}` : '—'}
                />
              )}
            </>
          }
          right={
            <>
              {invoice.netPayable !== null && (
                <Field label="Net à payer" value={kmf(invoice.netPayable)} />
              )}
              {invoice.paidAmount !== null && (
                <Field label="Total réglé" value={kmf(invoice.paidAmount)} />
              )}
              {invoice.remainingDue !== null && (
                <Field label="Reste dû" value={kmf(invoice.remainingDue)} />
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
          {invoice.status === 'CANCELLED'
            ? 'Cette facture est ANNULÉE : elle ne porte plus aucune dette. Son historique est conservé.'
            : invoice.status === 'DRAFT' || invoice.status === 'PENDING'
              ? 'Cette facture n’est pas encore validée : aucune dette n’est reconnue, et elle ne peut recevoir ni imputation ni règlement.'
              : 'Cette facture est validée : la dette est reconnue. Le net à payer déduit les imputations de maintenance ; les règlements, eux, sont enregistrés séparément.'}
        </Note>
      </Section>
    </DocumentShell>
  )
}
