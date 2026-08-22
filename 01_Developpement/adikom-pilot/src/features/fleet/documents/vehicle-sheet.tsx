import 'server-only'

import { View } from '@react-pdf/renderer'

import { DataTable, Field, FieldColumns, Note, Section, StatusChip } from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { formatDate, formatDateTime } from '@/lib/dates'
import {
  DOCUMENT_LABELS,
  FUEL_LABELS,
  OCCUPATION_LABELS,
  ORIGIN_LABELS,
  STATUS_LABELS,
  TRANSMISSION_LABELS,
  type VehicleStatus,
} from '../constants'
import type { Occupation, SupplierPeriod, VehicleDetail, VehicleDocument } from '../data'

/**
 * Fiche véhicule — document A4.
 *
 * Présente l'identité du véhicule, ses caractéristiques, son rattachement selon
 * l'origine, ses documents et son calendrier.
 *
 * Documents et calendrier ne sont transmis que si le lecteur y a droit : le
 * modèle affiche ce qu'on lui donne, jamais davantage.
 */

const STATUS_TONES: Record<VehicleStatus, 'success' | 'neutral' | 'warning' | 'danger' | 'info'> = {
  AVAILABLE: 'success',
  RESERVED: 'info',
  RENTED: 'info',
  MAINTENANCE: 'warning',
  IMMOBILIZED: 'danger',
  UNAVAILABLE: 'neutral',
  RETIRED: 'neutral',
}

export type VehicleSheetProps = {
  identity: DocumentIdentity
  vehicle: VehicleDetail
  history: SupplierPeriod[]
  /** `null` lorsque le lecteur n'a pas accès aux documents du véhicule. */
  documents: VehicleDocument[] | null
  occupations: Occupation[]
  issuedOn: string
}

function kilometres(value: number | null): string | null {
  return value === null ? null : `${value.toLocaleString('fr-FR')} km`
}

export function VehicleSheetDocument({
  identity,
  vehicle,
  history,
  documents,
  occupations,
  issuedOn,
}: VehicleSheetProps) {
  /* Le rattachement dépend de l'origine : un véhicule n'a jamais les deux. */
  const attachment = vehicle.supplierLabel ?? vehicle.partnerLabel

  return (
    <DocumentShell
      identity={identity}
      title="Fiche véhicule"
      subtitle={vehicle.plate ?? undefined}
      reference={vehicle.vehicleNo}
      issuedOn={issuedOn}
    >
      <Section title={`${vehicle.brand} ${vehicle.model}`}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          <StatusChip label={STATUS_LABELS[vehicle.status]} tone={STATUS_TONES[vehicle.status]} />
          <StatusChip label={ORIGIN_LABELS[vehicle.origin]} tone="neutral" />
          {vehicle.categoryLabel && <StatusChip label={vehicle.categoryLabel} tone="neutral" />}
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Identifiant" value={vehicle.vehicleNo} />
              <Field label="Immatriculation" value={vehicle.plate} />
              <Field label="Marque" value={vehicle.brand} />
              <Field label="Modèle" value={vehicle.model} />
            </>
          }
          right={
            <>
              <Field label="Catégorie" value={vehicle.categoryLabel} />
              <Field label="Année" value={vehicle.modelYear ? String(vehicle.modelYear) : null} />
              <Field label="Couleur" value={vehicle.color} />
              <Field label="Statut" value={STATUS_LABELS[vehicle.status]} />
            </>
          }
        />
      </Section>

      <Section title="Caractéristiques techniques">
        <FieldColumns
          left={
            <>
              <Field label="Carburant" value={vehicle.fuel ? FUEL_LABELS[vehicle.fuel] : null} />
              <Field
                label="Boîte de vitesse"
                value={vehicle.transmission ? TRANSMISSION_LABELS[vehicle.transmission] : null}
              />
              <Field label="Places" value={vehicle.seats ? String(vehicle.seats) : null} />
            </>
          }
          right={
            <>
              <Field label="Portes" value={vehicle.doors ? String(vehicle.doors) : null} />
              <Field label="Kilométrage" value={kilometres(vehicle.mileage)} />
              <Field label="Kilométrage initial" value={kilometres(vehicle.initialMileage)} />
            </>
          }
        />
      </Section>

      <Section title="Origine et rattachement">
        <FieldColumns
          left={
            <>
              <Field label="Origine" value={ORIGIN_LABELS[vehicle.origin]} />
              <Field
                label={vehicle.partnerLabel ? 'Partenaire' : 'Fournisseur'}
                value={attachment}
              />
            </>
          }
          right={
            <>
              <Field label="Entrée dans le parc" value={formatDate(vehicle.entryDate)} />
              <Field label="Sortie du parc" value={formatDate(vehicle.exitDate)} />
              {vehicle.exitReason && <Field label="Motif de sortie" value={vehicle.exitReason} />}
            </>
          }
        />
      </Section>

      {history.length > 0 && (
        <Section title="Historique des rattachements">
          <DataTable
            columns={[
              {
                header: 'Fournisseur',
                width: '46%',
                cell: (p: SupplierPeriod) => p.supplierLabel,
              },
              {
                header: 'Du',
                width: '18%',
                cell: (p: SupplierPeriod) => formatDate(p.startedOn) ?? '—',
              },
              {
                header: 'Au',
                width: '18%',
                cell: (p: SupplierPeriod) => formatDate(p.endedOn) ?? 'en cours',
              },
              {
                header: 'Motif',
                width: '18%',
                align: 'right',
                cell: (p: SupplierPeriod) => p.reason ?? '—',
              },
            ]}
            rows={history}
          />
        </Section>
      )}

      {documents !== null && (
        <Section title="Documents et échéances">
          <DataTable
            columns={[
              {
                header: 'Type',
                width: '26%',
                cell: (d: VehicleDocument) => DOCUMENT_LABELS[d.docType],
              },
              { header: 'Libellé', width: '32%', cell: (d: VehicleDocument) => d.label },
              { header: 'Référence', width: '22%', cell: (d: VehicleDocument) => d.reference ?? '—' },
              {
                header: 'Échéance',
                width: '20%',
                align: 'right',
                cell: (d: VehicleDocument) => formatDate(d.expiresOn) ?? '—',
              },
            ]}
            rows={documents}
            emptyLabel="Aucun document enregistré."
          />
        </Section>
      )}

      <Section title="Périodes d’indisponibilité">
        <DataTable
          columns={[
            {
              header: 'Origine',
              width: '24%',
              cell: (o: Occupation) => OCCUPATION_LABELS[o.source],
            },
            { header: 'Du', width: '26%', cell: (o: Occupation) => formatDateTime(o.from) ?? '—' },
            { header: 'Au', width: '26%', cell: (o: Occupation) => formatDateTime(o.to) ?? '—' },
            {
              header: 'Motif',
              width: '24%',
              align: 'right',
              cell: (o: Occupation) => o.reason ?? '—',
            },
          ]}
          rows={occupations}
          emptyLabel="Le calendrier de ce véhicule est libre."
        />
      </Section>

      {vehicle.notes && (
        <Section title="Observations">
          <Note>{vehicle.notes}</Note>
        </Section>
      )}
    </DocumentShell>
  )
}
