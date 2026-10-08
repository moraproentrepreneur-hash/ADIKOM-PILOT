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
import { formatDateTime } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { PAYMENT_METHOD_LABELS } from '@/features/treasury/constants'
import { SALE_STATUS_LABELS, type PosSaleStatus } from '../constants'
import type { PosSaleDetail, PosSaleLine, PosSalePayment } from '../data'

/**
 * Reçu d'une vente au comptoir — A4, Plan 01 §16.8, Plan 02 §7.5.
 *
 * A4, JAMAIS 80 MM : la Direction veut une caisse clavier / souris / écran, et
 * l'imprimante de bureau attend un A4.
 *
 * 🟥 AUCUN COÛT, AUCUNE MARGE : c'est une pièce remise au client. Le registre
 * lui transmet une vente chargée SANS coût copié, et ce document ne lit aucun
 * champ de coût — le test `pos-sales.test.ts` relit ce fichier pour s'en
 * assurer.
 *
 * Il dit, pour chaque paiement, le MODE et le COMPTE (D-3), et pour la vente :
 * le montant DONNÉ, le montant ENCAISSÉ, la MONNAIE rendue — la règle de la
 * Direction, sur le papier.
 */

const STATUS_TONES: Record<PosSaleStatus, ChipTone> = {
  VALIDATED: 'success',
  CANCELLED: 'danger',
}

export type SaleReceiptProps = {
  identity: DocumentIdentity
  sale: PosSaleDetail
  issuedOn: string
}

export function SaleReceiptDocument({ identity, sale, issuedOn }: SaleReceiptProps) {
  const remaining = Math.max(sale.net - sale.paid, 0)

  return (
    <DocumentShell
      identity={identity}
      title="Reçu de vente"
      reference={sale.saleNo}
      subtitle="Vente au comptoir"
      issuedOn={issuedOn}
    >
      <Section title={sale.clientLabel}>
        <View style={{ marginBottom: 8 }}>
          <StatusChip label={SALE_STATUS_LABELS[sale.status]} tone={STATUS_TONES[sale.status]} />
        </View>
        <FieldColumns
          left={
            <>
              <Field label="Vente" value={sale.saleNo} />
              <Field label="Date et heure" value={formatDateTime(sale.soldAt)} />
              <Field label="Client" value={sale.clientLabel} />
            </>
          }
          right={
            <>
              <Field label="Caissier" value={sale.cashierLabel} />
              <Field label="Session" value={sale.sessionNo} />
              <Field label="Caisse" value={sale.registerLabel} />
            </>
          }
        />
      </Section>

      <Section title="Prestations">
        <DataTable<PosSaleLine>
          rows={sale.lines}
          columns={[
            { header: 'Service', width: '40%', cell: (line) => line.label },
            { header: 'Qté', width: '8%', align: 'right', cell: (line) => String(line.quantity) },
            { header: 'Prix unitaire', width: '17%', align: 'right', cell: (line) => formatAmount(line.unitPrice) },
            { header: 'Remise', width: '15%', align: 'right', cell: (line) => (line.discount ? formatAmount(line.discount) : '—') },
            { header: 'Montant', width: '20%', align: 'right', cell: (line) => formatAmount(line.net) },
          ]}
        />
        <View style={{ marginTop: 8 }}>
          <FieldColumns
            left={<Field label="Sous-total" value={formatAmount(sale.subtotal, { withCurrency: true })} />}
            right={
              <>
                {sale.globalDiscount > 0 && (
                  <Field label="Remise globale" value={`− ${formatAmount(sale.globalDiscount, { withCurrency: true })}`} />
                )}
                <Field label="Total à payer" value={formatAmount(sale.net, { withCurrency: true })} />
              </>
            }
          />
        </View>
      </Section>

      <Section title="Paiement">
        <DataTable<PosSalePayment>
          rows={sale.payments}
          emptyLabel="Aucun paiement reçu au comptoir."
          columns={[
            { header: 'Mode', width: '18%', cell: (payment) => PAYMENT_METHOD_LABELS[payment.method] },
            { header: 'Compte', width: '32%', cell: (payment) => payment.accountLabel },
            { header: 'Référence', width: '18%', cell: (payment) => payment.externalRef ?? '—' },
            { header: 'Donné', width: '16%', align: 'right', cell: (payment) => formatAmount(payment.tendered) },
            { header: 'Encaissé', width: '16%', align: 'right', cell: (payment) => formatAmount(payment.applied) },
          ]}
        />
        <View style={{ marginTop: 8 }}>
          <FieldColumns
            left={
              <>
                <Field label="Montant donné" value={formatAmount(sale.tendered, { withCurrency: true })} />
                <Field label="Montant encaissé" value={formatAmount(sale.paid, { withCurrency: true })} />
              </>
            }
            right={
              <>
                <Field label="Monnaie rendue" value={formatAmount(sale.change, { withCurrency: true })} />
                {remaining > 0 && sale.status === 'VALIDATED' && (
                  <Field label="Reste dû (facturé)" value={formatAmount(remaining, { withCurrency: true })} />
                )}
              </>
            }
          />
        </View>
      </Section>

      {sale.observation && (
        <Section title="Observation">
          <Note>{sale.observation}</Note>
        </Section>
      )}

      <Section title="Portée de ce document">
        <Note>
          {sale.status === 'CANCELLED'
            ? `Cette vente est ANNULÉE (${sale.cancelReason ?? 'motif non lisible'}). Ce document ne vaut plus reçu ; il conserve la trace de l’opération.`
            : remaining > 0
              ? 'Ce reçu atteste les sommes versées au comptoir. Le reste dû fait l’objet d’une facture client, qui en suit le règlement.'
              : 'Ce reçu atteste le règlement intégral de la vente. Une facture peut être émise sur demande ; elle ne donne lieu à aucun nouveau paiement.'}
        </Note>
      </Section>
    </DocumentShell>
  )
}
