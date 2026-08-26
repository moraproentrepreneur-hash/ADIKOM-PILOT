import 'server-only'

import { Text, View } from '@react-pdf/renderer'

import { Field, FieldColumns, Note, Section } from '@/lib/documents/blocks'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatPrice } from '@/features/pricing/constants'
import { SOURCE_LABELS, type PricingSource } from '@/features/pricing/constants'
import type { ClientDetail } from '@/features/clients/data'
import type { VehicleDetail } from '@/features/fleet/data'
import { FUEL_LEVEL_LABELS } from '../constants'
import type { Inspection, RentalDetail } from '../data'

/**
 * Blocs communs aux trois documents du cycle.
 *
 * Contrat, bon de départ et procès-verbal de retour partagent le même en-tête
 * de parties, le même bloc véhicule et le même bloc tarifaire. Les écrire une
 * fois évite qu'ils ne divergent — trois versions du même bloc auraient
 * divergé à la première correction (CLAUDE.md §37).
 *
 * CE QUE `null` SIGNIFIE, ICI AUSSI
 *
 * `client` et `vehicle` valent `null` lorsque le lecteur n'a pas le droit de
 * les consulter. Le bloc DISPARAÎT alors, et le document porte une mention
 * explicite : un PDF ne doit jamais montrer ce que l'écran refuse, ni faire
 * passer un refus pour une donnée absente (DEC-017, DEC-024).
 */

export type RentalDocumentParts = {
  rental: RentalDetail
  /** `null` sans `parties.clients.view`. */
  client: ClientDetail | null
  /** `null` sans `rental.fleet.view`. */
  vehicle: VehicleDetail | null
  /** `null` sans `rental.rentals.financial.view`. */
  showAmounts: boolean
}

/** Les parties au contrat : ADIKOM figure déjà dans l'en-tête du document. */
export function PartiesSection({ rental, client }: Pick<RentalDocumentParts, 'rental' | 'client'>) {
  if (!client) {
    return (
      <Section title="Client">
        <Note>
          L’identité du client ne figure pas sur ce document : sa consultation n’est pas autorisée
          pour le compte qui l’a produit.
        </Note>
      </Section>
    )
  }

  return (
    <Section title={`Client — ${client.displayName}`}>
      <FieldColumns
        left={
          <>
            <Field label="Identifiant" value={client.clientNo} />
            <Field label="Téléphone" value={client.phone} />
            <Field label="Email" value={client.email} />
          </>
        }
        right={
          <>
            <Field label="Adresse" value={client.address} />
            <Field label="Ville" value={client.city} />
            <Field label="Pièce d’identité" value={client.idDocumentNumber} />
          </>
        }
      />
      <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
        Contrat n° {rental.rentalNo}
      </Text>
    </Section>
  )
}

export function VehicleSection({ rental, vehicle }: Pick<RentalDocumentParts, 'rental' | 'vehicle'>) {
  if (!vehicle) {
    return (
      <Section title="Véhicule">
        <Note>
          Les caractéristiques du véhicule ne figurent pas sur ce document : leur consultation
          n’est pas autorisée pour le compte qui l’a produit.
        </Note>
      </Section>
    )
  }

  return (
    <Section title={`Véhicule — ${vehicle.brand} ${vehicle.model}`}>
      <FieldColumns
        left={
          <>
            <Field label="Identifiant" value={vehicle.vehicleNo} />
            <Field label="Immatriculation" value={vehicle.plate} />
            <Field label="Catégorie" value={vehicle.categoryLabel} />
          </>
        }
        right={
          <>
            <Field label="Année" value={vehicle.modelYear ? String(vehicle.modelYear) : null} />
            <Field label="Couleur" value={vehicle.color} />
            <Field label="Places" value={vehicle.seats ? String(vehicle.seats) : null} />
          </>
        }
      />
      <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
        Rattaché à la location {rental.rentalNo}
      </Text>
    </Section>
  )
}

/** Période prévue et dates réelles, telles qu'elles sont enregistrées. */
export function PeriodSection({ rental }: Pick<RentalDocumentParts, 'rental'>) {
  return (
    <Section title="Période">
      <FieldColumns
        left={
          <>
            <Field label="Début prévu" value={formatDateTime(rental.plannedFrom)} />
            <Field label="Retour attendu" value={formatDateTime(rental.expectedReturnAt)} />
          </>
        }
        right={
          <>
            <Field label="Départ réel" value={formatDateTime(rental.startedAt)} />
            <Field label="Retour réel" value={formatDateTime(rental.returnedAt)} />
          </>
        }
      />
    </Section>
  )
}

/**
 * Le tarif VERROUILLÉ, tel qu'il a été figé — jamais recalculé.
 *
 * Aucun total n'est porté : la durée facturable dépend d'une règle d'arrondi
 * qui n'est pas arrêtée (DEC-008), et un document qui afficherait un montant
 * global l'inventerait. Le contrat porte donc le tarif applicable et la
 * période ; le décompte relèvera de la facture.
 */
export function PricingSection({
  rental,
  showAmounts,
}: Pick<RentalDocumentParts, 'rental' | 'showAmounts'>) {
  if (!showAmounts) return null

  return (
    <Section title="Conditions tarifaires">
      <FieldColumns
        left={
          <>
            <Field label="Tarif applicable" value={formatPrice(rental.lockedAmount, rental.lockedUnit)} />
            <Field
              label="Origine du tarif"
              value={
                rental.lockedSource
                  ? (SOURCE_LABELS[rental.lockedSource as PricingSource] ?? rental.lockedSource)
                  : null
              }
            />
          </>
        }
        right={<Field label="Verrouillé le" value={formatDateTime(rental.lockedAt)} />}
      />
      <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 6 }}>
        Tarif figé à la confirmation de la réservation : une modification ultérieure du barème ne
        l’affecte pas. Le décompte de la durée facturable et les éventuels frais sont établis à la
        facturation.
      </Text>
    </Section>
  )
}

/** Un état des lieux, sous la forme exacte des deux côtés du cycle. */
export function InspectionSection({
  title,
  inspection,
  damagesLabel,
  emptyLabel,
}: {
  title: string
  inspection: Inspection | undefined
  damagesLabel: string
  emptyLabel: string
}) {
  if (!inspection) {
    return (
      <Section title={title}>
        <Note>{emptyLabel}</Note>
      </Section>
    )
  }

  return (
    <Section title={title}>
      <FieldColumns
        left={
          <>
            <Field label="Réalisé le" value={formatDateTime(inspection.performedAt)} />
            <Field
              label="Kilométrage"
              value={
                inspection.mileage != null
                  ? `${inspection.mileage.toLocaleString('fr-FR')} km`
                  : null
              }
            />
            <Field
              label="Carburant"
              value={inspection.fuelLevel ? FUEL_LEVEL_LABELS[inspection.fuelLevel] : null}
            />
          </>
        }
        right={
          <>
            <Field label="État extérieur" value={inspection.exteriorCondition} />
            <Field label="État intérieur" value={inspection.interiorCondition} />
            <Field
              label="Photos jointes"
              value={
                inspection.photos.length > 0
                  ? `${inspection.photos.length} photo${inspection.photos.length > 1 ? 's' : ''}, consultables dans ADIKOM PILOT`
                  : null
              }
            />
          </>
        }
      />

      <View style={{ marginTop: 4 }}>
        <Field label={damagesLabel} value={inspection.preexistingDamages} />
        <Field label="Observations" value={inspection.observations} />
      </View>
    </Section>
  )
}

/**
 * Emplacements de signature.
 *
 * DEC-025 §h : la signature s'effectue HORS SYSTÈME. Le document porte donc
 * les emplacements, et aucun mécanisme de signature électronique n'existe.
 */
export function SignatureBlock({ leftLabel = 'Le client' }: { leftLabel?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 20, marginTop: 18 }} wrap={false}>
      {[leftLabel, 'Pour ADIKOM Technologie & Travel'].map((label) => (
        <View key={label} style={{ flexGrow: 1, flexBasis: 0 }}>
          <Text style={{ fontSize: 8.5, color: '#6b7280' }}>{label}</Text>
          <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 1 }}>
            Date et signature
          </Text>
          <View
            style={{
              marginTop: 34,
              borderTopWidth: 1,
              borderTopColor: '#e5e7eb',
            }}
          />
        </View>
      ))}
    </View>
  )
}

/** Mention finale lorsqu'une section a été retirée faute de permission. */
export function OmissionNote({ omitted }: { omitted: string[] }) {
  if (omitted.length === 0) return null

  return (
    <Section title="Mentions">
      <Note>
        Ce document a été produit par un compte ne disposant pas de l’accès à :{' '}
        {omitted.join(', ')}. Ces informations existent dans le système ; elles sont absentes de ce
        document, et non de la location.
      </Note>
    </Section>
  )
}

/** Date d'édition lisible, pour les mentions de bas de document. */
export function issuedLine(value: string | null): string {
  return formatDate(value) ?? '—'
}
