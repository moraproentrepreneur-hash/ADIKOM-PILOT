import 'server-only'

import { View } from '@react-pdf/renderer'

import {
  Field,
  FieldColumns,
  Note,
  Section,
  StatusChip,
  type ChipTone,
} from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import {
  MISC_PAYMENT_CATEGORY_LABELS,
  MISC_PAYMENT_DIRECTION_LABELS,
  MISC_PAYMENT_PARTY_LABELS,
  MISC_PAYMENT_STATUS_LABELS,
  type MiscPaymentStatus,
} from '../constants'
import type { MiscPayment } from '../data'

/**
 * Reçu d'un paiement divers — document A4, DEC-042 §b et §c.
 *
 * POURQUOI UN REÇU, ET POURQUOI MAINTENANT
 *
 * Le LOT 17 n'avait créé aucune capacité documentaire pour ce menu : un
 * décaissement interne n'appelait pas de pièce remise à un tiers. Le sens change
 * cela — un ENCAISSEMENT divers reçoit de l'argent d'un tiers, et un tiers qui
 * verse attend un reçu.
 *
 * LE DOCUMENT DIT LE SENS, ET IL LE DIT D'ABORD
 *
 * « Reçu de » et « Versé à » ne sont pas la même pièce. Le titre, le nom de
 * l'autre partie et l'effet sur le compte s'accordent tous au sens : un reçu qui
 * se tromperait de sens attesterait l'inverse de ce qui s'est passé.
 *
 * UN BROUILLON N'ATTESTE RIEN
 *
 * Tant que le paiement n'est pas validé, aucun fonds n'a bougé et aucune
 * écriture n'existe. Le document le porte en toutes lettres plutôt que de
 * laisser circuler un reçu sans mouvement derrière lui.
 */

const STATUS_TONES: Record<MiscPaymentStatus, ChipTone> = {
  DRAFT: 'warning',
  VALIDATED: 'success',
  CANCELLED: 'danger',
}

export type MiscPaymentReceiptProps = {
  identity: DocumentIdentity
  payment: MiscPayment
  issuedOn: string
}

export function MiscPaymentReceiptDocument({
  identity,
  payment,
  issuedOn,
}: MiscPaymentReceiptProps) {
  const entree = payment.direction === 'IN'

  return (
    <DocumentShell
      identity={identity}
      title={entree ? 'Reçu d’encaissement' : 'Reçu de décaissement'}
      reference={payment.paymentNo}
      subtitle="Mouvement de trésorerie sans facture rattachée"
      issuedOn={issuedOn}
    >
      <Section title={payment.beneficiary}>
        <View style={{ marginBottom: 8 }}>
          <StatusChip
            label={`${MISC_PAYMENT_DIRECTION_LABELS[payment.direction]} · ${MISC_PAYMENT_STATUS_LABELS[payment.status]}`}
            tone={STATUS_TONES[payment.status]}
          />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Référence" value={payment.paymentNo} />
              <Field label="Sens" value={MISC_PAYMENT_DIRECTION_LABELS[payment.direction]} />
              <Field
                label={MISC_PAYMENT_PARTY_LABELS[payment.direction]}
                value={payment.beneficiary}
              />
              <Field
                label="Catégorie"
                value={MISC_PAYMENT_CATEGORY_LABELS[payment.category]}
              />
            </>
          }
          right={
            <>
              <Field
                label="Montant"
                value={formatAmount(payment.amount, { withCurrency: true })}
              />
              <Field label="Date" value={formatDate(payment.paidOn)} />
              <Field label="Compte" value={payment.accountLabel} />
              <Field label="Pièce" value={payment.externalRef} />
            </>
          }
        />
      </Section>

      <Section title="Motif">
        <Note>{payment.purpose}</Note>
      </Section>

      <Section title="Suivi">
        <FieldColumns
          left={
            <>
              <Field label="Saisi le" value={formatDateTime(payment.createdAt)} />
              <Field label="Validé le" value={formatDateTime(payment.validatedAt)} />
            </>
          }
          right={
            <>
              <Field label="Annulé le" value={formatDateTime(payment.cancelledAt)} />
              <Field label="Motif du changement" value={payment.statusReason} />
            </>
          }
        />
      </Section>

      <Section title="Portée de ce document">
        <Note>
          {payment.status === 'DRAFT'
            ? 'Ce paiement est un BROUILLON : aucun fonds n’a bougé et aucune écriture n’existe. Ce document ne vaut donc pas reçu.'
            : payment.status === 'CANCELLED'
              ? 'Ce paiement est ANNULÉ : son écriture a été annulée et le solde du compte est revenu. Ce document ne vaut plus reçu ; il conserve la trace de l’opération.'
              : entree
                ? 'Ce document atteste la réception de la somme indiquée, portée en entrée sur le compte désigné.'
                : 'Ce document atteste le versement de la somme indiquée, portée en sortie sur le compte désigné.'}
        </Note>
      </Section>
    </DocumentShell>
  )
}
