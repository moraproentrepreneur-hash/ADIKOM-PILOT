import 'server-only'

import { View } from '@react-pdf/renderer'

import { DataTable, Field, FieldColumns, Note, Section, StatusChip } from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { formatDateTime } from '@/lib/dates'
import { STATUS_LABELS as VEHICLE_STATUS } from '@/features/fleet/constants'
import type { VehicleListItem } from '@/features/fleet/data'
import { STATUS_LABELS, TYPE_LABELS, type SupplierStatus } from '../constants'
import type { SupplierBankDetails, SupplierDetail } from '../data'

/**
 * Fiche fournisseur — document A4.
 *
 * Même enveloppe, mêmes blocs et même moteur que la fiche client : seul le
 * contenu change.
 *
 * Les coordonnées bancaires ne sont transmises que si le lecteur a le droit de
 * les consulter. Le modèle ne décide pas de ce qu'il montre — il affiche ce
 * qu'on lui donne — ce qui rend impossible qu'un document expose ce que l'écran
 * refuse (Fournisseurs §44, Tiers §22).
 */

const STATUS_TONES: Record<SupplierStatus, 'success' | 'neutral' | 'warning'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'warning',
  ARCHIVED: 'neutral',
}

export type SupplierSheetProps = {
  identity: DocumentIdentity
  supplier: SupplierDetail
  vehicles: VehicleListItem[]
  /** `null` lorsque le lecteur n'a pas accès aux coordonnées bancaires. */
  bank: SupplierBankDetails | null
  issuedOn: string
}

export function SupplierSheetDocument({
  identity,
  supplier,
  vehicles,
  bank,
  issuedOn,
}: SupplierSheetProps) {
  /* Pas de sous-titre : même règle que la fiche client. Le nom commercial est
     une donnée du fournisseur, il figure donc parmi ses champs, ci-dessous. */
  return (
    <DocumentShell
      identity={identity}
      title="Fiche fournisseur"
      reference={supplier.supplierNo}
      issuedOn={issuedOn}
    >
      <Section title={supplier.legalName}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          <StatusChip label={STATUS_LABELS[supplier.status]} tone={STATUS_TONES[supplier.status]} />
          <StatusChip label={TYPE_LABELS[supplier.type]} tone="neutral" />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Identifiant" value={supplier.supplierNo} />
              <Field label="Type" value={TYPE_LABELS[supplier.type]} />
              <Field label="Nom commercial" value={supplier.tradeName} />
              <Field label="Personne de contact" value={supplier.contactName} />
            </>
          }
          right={
            <>
              <Field label="Statut" value={STATUS_LABELS[supplier.status]} />
              <Field label="Créée le" value={formatDateTime(supplier.createdAt)} />
              <Field label="Modifiée le" value={formatDateTime(supplier.updatedAt)} />
            </>
          }
        />
      </Section>

      <Section title="Coordonnées">
        <FieldColumns
          left={
            <>
              <Field label="Téléphone" value={supplier.phone} />
              <Field label="Téléphone secondaire" value={supplier.phoneSecondary} />
              <Field label="Email" value={supplier.email} />
            </>
          }
          right={
            <>
              <Field label="Adresse" value={supplier.address} />
              <Field label="Ville" value={supplier.city} />
              <Field label="Pays" value={supplier.country} />
            </>
          }
        />
      </Section>

      <Section title="Informations administratives">
        <FieldColumns
          left={<Field label="Registre du commerce" value={supplier.registrationNumber} />}
          right={<Field label="Identifiant fiscal" value={supplier.taxIdentifier} />}
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
          emptyLabel="Aucun véhicule rattaché à ce fournisseur."
        />
      </Section>

      {bank && (
        <Section title="Coordonnées bancaires">
          <FieldColumns
            left={
              <>
                <Field label="Banque" value={bank.bankName} />
                <Field label="Titulaire" value={bank.accountHolder} />
              </>
            }
            right={
              <>
                <Field label="Numéro de compte" value={bank.accountNumber} />
                <Field label="IBAN" value={bank.iban} />
                <Field label="BIC / SWIFT" value={bank.swiftBic} />
              </>
            }
          />
        </Section>
      )}

      {supplier.notes && (
        <Section title="Observations">
          <Note>{supplier.notes}</Note>
        </Section>
      )}
    </DocumentShell>
  )
}
