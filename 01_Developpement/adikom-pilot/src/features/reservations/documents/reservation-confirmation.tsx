import 'server-only'

import { View } from '@react-pdf/renderer'

import { Field, FieldColumns, Note, Section, StatusChip } from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { formatDateTime, formatPeriod } from '@/lib/dates'
import { formatPrice } from '@/features/pricing/constants'
import { STATUS_LABELS, type ReservationStatus } from '../constants'
import type { ReservationDetail } from '../data'

/**
 * Confirmation de réservation — document A4, DEC-042 §c.
 *
 * CE QUE CETTE PIÈCE EST, ET CE QU'ELLE N'EST PAS
 *
 * Elle atteste un ENGAGEMENT : un client, une période, un véhicule ou une
 * catégorie, et le tarif verrouillé lorsqu'il l'a été. Ce n'est ni un contrat de
 * location — celui-ci naît au départ du véhicule —, ni une facture : aucune
 * créance n'est reconnue ici.
 *
 * La migration 037 avait retiré les deux capacités documentaires de la
 * réservation, faute de document à produire. ADIKOM demande cette pièce
 * (DEC-042 §c) : elle existe, et les capacités reviennent avec elle.
 *
 * LE MONTANT NE FIGURE QUE SI LE LECTEUR A LE DROIT DE LE VOIR
 *
 * `rental.rentals.financial.view` gouverne le tarif verrouillé partout ailleurs
 * (DEC-024). Un document n'expose jamais plus que l'écran : sans cette capacité,
 * la section entière disparaît plutôt que d'afficher un tiret — un tiret se
 * lirait « aucun tarif verrouillé », ce qui serait faux (DEC-017).
 */

const STATUS_TONES: Record<ReservationStatus, 'success' | 'neutral' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  CONFIRMED: 'success',
  PREPARING: 'success',
  CONVERTED: 'neutral',
  CANCELLED: 'danger',
  EXPIRED: 'danger',
}

export type ReservationConfirmationProps = {
  identity: DocumentIdentity
  reservation: ReservationDetail
  /** `false` sans `rental.rentals.financial.view` : la section se tait. */
  showAmounts: boolean
  issuedOn: string
}

export function ReservationConfirmationDocument({
  identity,
  reservation,
  showAmounts,
  issuedOn,
}: ReservationConfirmationProps) {
  const engagement = reservation.status === 'CONFIRMED' || reservation.status === 'PREPARING'

  return (
    <DocumentShell
      identity={identity}
      title="Confirmation de réservation"
      reference={reservation.reservationNo}
      subtitle="Engagement de mise à disposition d’un véhicule"
      issuedOn={issuedOn}
    >
      <Section title={reservation.clientLabel}>
        <View style={{ marginBottom: 8 }}>
          <StatusChip
            label={STATUS_LABELS[reservation.status]}
            tone={STATUS_TONES[reservation.status]}
          />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Référence" value={reservation.reservationNo} />
              <Field label="Client" value={reservation.clientLabel} />
              <Field
                label="Période"
                value={formatPeriod(reservation.startsAt, reservation.endsAt)}
              />
            </>
          }
          right={
            <>
              <Field label="Véhicule" value={reservation.vehicleLabel} />
              <Field label="Catégorie" value={reservation.categoryLabel} />
              <Field label="Établie le" value={formatDateTime(reservation.createdAt)} />
            </>
          }
        />
      </Section>

      {showAmounts && (
        <Section title="Tarif verrouillé">
          <FieldColumns
            left={
              <>
                <Field
                  label="Tarif"
                  value={
                    reservation.lockedAmount != null && reservation.lockedUnit
                      ? formatPrice(reservation.lockedAmount, reservation.lockedUnit)
                      : null
                  }
                />
              </>
            }
            right={
              <>
                <Field
                  label="Verrouillé le"
                  value={formatDateTime(reservation.lockedAt)}
                />
              </>
            }
          />
          <Note>
            Le tarif est copié à la confirmation. Une modification ultérieure de la grille ne
            l’atteint plus : c’est celui-ci qui vaudra pour la location.
          </Note>
        </Section>
      )}

      {reservation.conditions && (
        <Section title="Conditions particulières">
          <Note>{reservation.conditions}</Note>
        </Section>
      )}

      <Section title="Portée de ce document">
        <Note>
          {engagement
            ? 'Cette réservation engage la mise à disposition du véhicule sur la période indiquée. Le contrat de location et le bon de départ seront établis à la sortie du véhicule ; aucune créance n’est reconnue par ce document.'
            : 'Cette réservation n’engage pas encore la mise à disposition d’un véhicule : seule une réservation confirmée réserve la période et verrouille le tarif.'}
        </Note>
      </Section>
    </DocumentShell>
  )
}
