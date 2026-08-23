import 'server-only'

import { View } from '@react-pdf/renderer'

import { DataTable, Field, FieldColumns, Note, Section, StatusChip } from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { formatDateTime } from '@/lib/dates'
import { STATUS_LABELS as VEHICLE_STATUS } from '@/features/fleet/constants'
import type { VehicleListItem } from '@/features/fleet/data'
import { STATUS_LABELS, type PartnerStatus } from '../constants'
import type { PartnerDetail } from '../data'

/**
 * Fiche partenaire — document A4.
 *
 * Reflète le périmètre actuel : les informations disponibles et les véhicules
 * rattachés. Conditions, projets et historique du partenariat relèvent du
 * module Partenariats, à venir — le document ne prétend donc pas les couvrir.
 */

const STATUS_TONES: Record<PartnerStatus, 'success' | 'neutral' | 'warning'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'warning',
  ARCHIVED: 'neutral',
}

export type PartnerSheetProps = {
  identity: DocumentIdentity
  partner: PartnerDetail
  vehicles: VehicleListItem[]
  issuedOn: string
}

export function PartnerSheetDocument({
  identity,
  partner,
  vehicles,
  issuedOn,
}: PartnerSheetProps) {
  /* Pas de sous-titre : même règle que les fiches client et fournisseur. Le nom
     commercial figure parmi les champs du partenaire, ci-dessous. */
  return (
    <DocumentShell
      identity={identity}
      title="Fiche partenaire"
      reference={partner.partnerNo}
      issuedOn={issuedOn}
    >
      <Section title={partner.legalName}>
        <View style={{ marginBottom: 8 }}>
          <StatusChip label={STATUS_LABELS[partner.status]} tone={STATUS_TONES[partner.status]} />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Identifiant" value={partner.partnerNo} />
              <Field label="Nom commercial" value={partner.tradeName} />
              <Field label="Personne de contact" value={partner.contactName} />
            </>
          }
          right={
            <>
              <Field label="Statut" value={STATUS_LABELS[partner.status]} />
              <Field label="Créée le" value={formatDateTime(partner.createdAt)} />
              <Field label="Modifiée le" value={formatDateTime(partner.updatedAt)} />
            </>
          }
        />
      </Section>

      <Section title="Coordonnées">
        <FieldColumns
          left={
            <>
              <Field label="Téléphone" value={partner.phone} />
              <Field label="Email" value={partner.email} />
              <Field label="Registre du commerce" value={partner.registrationNumber} />
            </>
          }
          right={
            <>
              <Field label="Adresse" value={partner.address} />
              <Field label="Ville" value={partner.city} />
              <Field label="Pays" value={partner.country} />
            </>
          }
        />
      </Section>

      <Section title="Véhicules mis à disposition">
        <DataTable
          columns={[
            { header: 'Identifiant', width: '20%', cell: (v: VehicleListItem) => v.vehicleNo },
            {
              header: 'Véhicule',
              width: '38%',
              cell: (v: VehicleListItem) => `${v.brand} ${v.model}`,
            },
            {
              header: 'Immatriculation',
              width: '22%',
              cell: (v: VehicleListItem) => v.plate ?? '—',
            },
            {
              header: 'Statut',
              width: '20%',
              align: 'right',
              cell: (v: VehicleListItem) => VEHICLE_STATUS[v.status],
            },
          ]}
          rows={vehicles}
          emptyLabel="Aucun véhicule rattaché à ce partenaire."
        />
      </Section>

      {partner.notes && (
        <Section title="Observations">
          <Note>{partner.notes}</Note>
        </Section>
      )}
    </DocumentShell>
  )
}
