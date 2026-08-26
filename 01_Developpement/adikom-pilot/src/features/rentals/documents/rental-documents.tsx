import 'server-only'

import { View } from '@react-pdf/renderer'

import { Note, Section, StatusChip } from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import type { ClientDetail } from '@/features/clients/data'
import type { VehicleDetail } from '@/features/fleet/data'
import { STATUS_LABELS, type RentalStatus } from '../constants'
import type { Inspection, RentalDetail } from '../data'
import {
  InspectionSection,
  OmissionNote,
  PartiesSection,
  PeriodSection,
  PricingSection,
  SignatureBlock,
  VehicleSection,
} from './rental-blocks'

/**
 * Les trois documents du cycle de location.
 *
 * Même enveloppe, mêmes blocs et même moteur que les fiches client,
 * fournisseur, partenaire et véhicule : ces modèles ne décrivent QUE leur
 * contenu. Aucun second moteur PDF n'existe.
 *
 * AUCUN DOCUMENT NE RECALCULE QUOI QUE CE SOIT.
 *
 * Le tarif est celui qui a été verrouillé ; les relevés sont ceux des états
 * des lieux ; les écarts sont ceux que le contrôle constate. Aucune
 * valorisation du retard, du carburant ou des dommages n'apparaît : ces
 * barèmes n'existent pas (DEC-008, DEC-025 §i).
 */

const STATUS_TONES: Record<RentalStatus, 'success' | 'neutral' | 'warning' | 'info' | 'danger'> = {
  PREPARING: 'neutral',
  CONFIRMED: 'info',
  IN_PROGRESS: 'success',
  EXTENDED: 'info',
  LATE: 'danger',
  RETURNED: 'info',
  TO_CONTROL: 'warning',
  TO_INVOICE: 'warning',
  INVOICED: 'neutral',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
}

export type RentalDocumentProps = {
  identity: DocumentIdentity
  rental: RentalDetail
  /** `null` sans `parties.clients.view`. */
  client: ClientDetail | null
  /** `null` sans `rental.fleet.view`. */
  vehicle: VehicleDetail | null
  inspections: Inspection[]
  /** Faux sans `rental.rentals.financial.view` : aucun montant n'est imprimé. */
  showAmounts: boolean
  issuedOn: string
}

/** Ce que le document ne peut pas montrer, faute de droit — jamais tu. */
function omissions({ client, vehicle }: Pick<RentalDocumentProps, 'client' | 'vehicle'>): string[] {
  return [client ? null : 'l’identité du client', vehicle ? null : 'les caractéristiques du véhicule'].filter(
    (value): value is string => value !== null
  )
}

function StatusChips({ rental }: { rental: RentalDetail }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
      <StatusChip label={STATUS_LABELS[rental.status]} tone={STATUS_TONES[rental.status]} />
      <StatusChip label={rental.rentalNo} tone="neutral" />
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*  Contrat de location                                                        */
/* -------------------------------------------------------------------------- */

export function RentalContractDocument({
  identity,
  rental,
  client,
  vehicle,
  showAmounts,
  issuedOn,
}: Omit<RentalDocumentProps, 'inspections'>) {
  return (
    <DocumentShell
      identity={identity}
      title="Contrat de location"
      reference={rental.rentalNo}
      issuedOn={issuedOn}
    >
      <Section title={rental.clientLabel}>
        <StatusChips rental={rental} />
      </Section>

      <PartiesSection rental={rental} client={client} />
      <VehicleSection rental={rental} vehicle={vehicle} />
      <PeriodSection rental={rental} />
      <PricingSection rental={rental} showAmounts={showAmounts} />

      {rental.conditions && (
        <Section title="Conditions particulières">
          <Note>{rental.conditions}</Note>
        </Section>
      )}

      <OmissionNote omitted={omissions({ client, vehicle })} />

      {/* DEC-025 §h : la signature s'effectue hors système. */}
      <SignatureBlock />
    </DocumentShell>
  )
}

/* -------------------------------------------------------------------------- */
/*  Bon de départ                                                              */
/* -------------------------------------------------------------------------- */

export function DepartureReportDocument({
  identity,
  rental,
  client,
  vehicle,
  inspections,
  showAmounts,
  issuedOn,
}: RentalDocumentProps) {
  const departure = inspections.find((inspection) => inspection.kind === 'DEPARTURE')

  return (
    <DocumentShell
      identity={identity}
      title="Bon de départ"
      reference={rental.rentalNo}
      issuedOn={issuedOn}
    >
      <Section title={rental.clientLabel}>
        <StatusChips rental={rental} />
      </Section>

      <PartiesSection rental={rental} client={client} />
      <VehicleSection rental={rental} vehicle={vehicle} />
      <PeriodSection rental={rental} />

      <InspectionSection
        title="État des lieux de départ"
        inspection={departure}
        damagesLabel="Dommages déjà présents"
        emptyLabel="Aucun état des lieux de départ n’a encore été enregistré : ce véhicule n’est pas parti."
      />

      <PricingSection rental={rental} showAmounts={showAmounts} />

      <OmissionNote omitted={omissions({ client, vehicle })} />

      {departure && <SignatureBlock leftLabel="Le client — remise du véhicule" />}
    </DocumentShell>
  )
}

/* -------------------------------------------------------------------------- */
/*  Procès-verbal de retour                                                    */
/* -------------------------------------------------------------------------- */

export function ReturnReportDocument({
  identity,
  rental,
  client,
  vehicle,
  inspections,
  showAmounts,
  issuedOn,
}: RentalDocumentProps) {
  const departure = inspections.find((inspection) => inspection.kind === 'DEPARTURE')
  const back = inspections.find((inspection) => inspection.kind === 'RETURN')

  /*
   * La distance est une SOUSTRACTION de deux relevés, pas un calcul
   * commercial : elle constate ce que le compteur indique. Aucun montant n'en
   * découle ici (DEC-008, DEC-025 §i).
   */
  const distance =
    departure?.mileage != null && back?.mileage != null ? back.mileage - departure.mileage : null

  return (
    <DocumentShell
      identity={identity}
      title="Procès-verbal de retour"
      reference={rental.rentalNo}
      issuedOn={issuedOn}
    >
      <Section title={rental.clientLabel}>
        <StatusChips rental={rental} />
      </Section>

      <PartiesSection rental={rental} client={client} />
      <VehicleSection rental={rental} vehicle={vehicle} />
      <PeriodSection rental={rental} />

      <InspectionSection
        title="État des lieux de départ"
        inspection={departure}
        damagesLabel="Dommages déjà présents au départ"
        emptyLabel="Aucun état des lieux de départ n’a été enregistré : la comparaison n’est pas possible."
      />

      <InspectionSection
        title="État des lieux de retour"
        inspection={back}
        damagesLabel="Nouveaux dommages constatés"
        emptyLabel="Aucun état des lieux de retour n’a encore été enregistré : ce véhicule n’est pas rentré."
      />

      {back && (
        <Section title="Constat">
          <Note>
            {distance != null
              ? `Distance parcourue : ${distance.toLocaleString('fr-FR')} km. `
              : 'Distance parcourue : non déterminable, un relevé manque. '}
            Les écarts relevés — kilométrage, carburant, dommages, dépassement éventuel de la date
            de retour — sont constatés en l’état. Aucun montant n’est établi sur ce document : leur
            éventuelle valorisation relève de la facturation.
          </Note>
        </Section>
      )}

      <PricingSection rental={rental} showAmounts={showAmounts} />

      <OmissionNote omitted={omissions({ client, vehicle })} />

      {back && <SignatureBlock leftLabel="Le client — restitution du véhicule" />}
    </DocumentShell>
  )
}
