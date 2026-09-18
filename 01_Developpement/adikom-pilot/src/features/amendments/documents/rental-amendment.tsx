import 'server-only'

import { View } from '@react-pdf/renderer'

import { DataTable, Field, FieldColumns, Note, Section, StatusChip } from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatPrice } from '@/features/pricing/constants'
import type { ClientDetail } from '@/features/clients/data'
import type { RentalDetail } from '@/features/rentals/data'
import {
  PartiesSection,
  SignatureBlock,
  type ContractPeriod,
} from '@/features/rentals/documents/rental-blocks'
import { AMENDMENT_KIND_LABELS } from '../constants'
import type { RentalAmendment } from '../data'

/**
 * AVENANT AU CONTRAT DE LOCATION — LOT 22, A-4.
 *
 * LE QUATRIÈME DOCUMENT DU CYCLE, après le contrat, le bon de départ et le
 * procès-verbal de retour. Même enveloppe, mêmes blocs, même moteur : aucun
 * second système documentaire n'est créé (consigne §19).
 *
 * 🟥 CE DOCUMENT NE PORTE AUCUN COÛT D'ACQUISITION, AUCUNE COMMISSION, AUCUNE
 * MARGE. C'est la troisième barrière du Plan 02 §6.3 — la seule qui tienne même
 * lorsque le demandeur DÉTIENT la capacité de lire le coût : le modèle ne reçoit
 * tout simplement pas ces données. `src/lib/documents/document.test.ts` relit les
 * sources et refuse toute référence au domaine du coût.
 *
 * CE QU'IL PORTE, ET QUI APPARTIENT AU CLIENT (consigne §19) :
 *
 *   · le contrat d'origine, inchangé — c'est tout l'objet de A-4 ;
 *   · l'acte : sa nature, sa date d'effet, son motif ;
 *   · les périodes : quel véhicule, du quand au quand, à quel tarif ;
 *   · la dérogation tarifaire lorsqu'il y en a une, et sa raison.
 *
 * LE TARIF N'APPARAÎT QU'AVEC `rental.rentals.financial.view`. Sans elle, la
 * colonne disparaît et le document le DIT — un avenant sans tarif reste un
 * document valide : il constate un changement de véhicule.
 */

export type AmendmentDocumentProps = {
  identity: DocumentIdentity
  rental: RentalDetail
  amendment: RentalAmendment
  /**
   * Toutes les périodes du contrat : l'avenant se lit dans sa chronologie.
   *
   * `ContractPeriod` — et non le segment entier. Le type ÉCARTE le coût gelé,
   * confidentiel (A-2) : un modèle documentaire ne peut pas révéler ce qu'il ne
   * reçoit pas (Plan 02 §6.3, barrière n° 3).
   */
  periods: ContractPeriod[]
  /** Rang du segment ouvert par cet avenant — la chronologie donne le reste. */
  openedSequenceNo: number | null
  /** `null` sans `parties.clients.view`. */
  client: ClientDetail | null
  /** Faux sans `rental.rentals.financial.view` : aucun montant n'est imprimé. */
  showAmounts: boolean
  issuedOn: string
}

export function RentalAmendmentDocument({
  identity,
  rental,
  amendment,
  periods,
  openedSequenceNo,
  client,
  showAmounts,
  issuedOn,
}: AmendmentDocumentProps) {
  /*
   * LE SEGMENT OUVERT PAR CET AVENANT, et celui qu'il a clos.
   *
   * Les deux sont lus depuis la chronologie plutôt que recopiés sur l'avenant :
   * l'acte ne duplique pas ce que les segments disent déjà (consigne §6).
   */
  const opened =
    openedSequenceNo === null
      ? null
      : (periods.find((period) => period.sequenceNo === openedSequenceNo) ?? null)
  const closed =
    opened && opened.sequenceNo > 1
      ? (periods.find((period) => period.sequenceNo === opened.sequenceNo - 1) ?? null)
      : null

  return (
    <DocumentShell
      identity={identity}
      title={`Avenant n° ${amendment.sequenceNo} au contrat de location`}
      reference={amendment.amendmentNo}
      subtitle={`Contrat ${rental.rentalNo} — ${AMENDMENT_KIND_LABELS[amendment.kind]}`}
      issuedOn={issuedOn}
    >
      <Section title={rental.clientLabel}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          <StatusChip label={amendment.amendmentNo} tone="info" />
          <StatusChip label={AMENDMENT_KIND_LABELS[amendment.kind]} tone="neutral" />
          {amendment.rateOverride && <StatusChip label="Tarif dérogatoire" tone="warning" />}
        </View>

        {/*
          🟩 A-4, écrit noir sur blanc sur le document remis au client : le
          contrat ne change pas. C'est exactement ce que la Direction a demandé,
          et c'est la phrase qui évite une contestation.
        */}
        <Note>
          Le présent avenant modifie le contrat {rental.rentalNo} sans le remplacer. Le contrat
          d’origine, son identifiant et ses conditions générales demeurent en vigueur ; seules les
          stipulations ci-dessous sont modifiées, à compter de la date d’effet indiquée.
        </Note>
      </Section>

      <PartiesSection rental={rental} client={client} />

      <Section title="L’avenant">
        <FieldColumns
          left={
            <>
              <Field label="Référence" value={amendment.amendmentNo} />
              <Field label="Rang" value={`n° ${amendment.sequenceNo}`} />
              <Field label="Nature" value={AMENDMENT_KIND_LABELS[amendment.kind]} />
            </>
          }
          right={
            <>
              <Field label="Prend effet le" value={formatDateTime(amendment.effectiveAt)} />
              <Field label="Établi le" value={formatDateTime(amendment.createdAt)} />
              <Field label="Contrat d’origine" value={rental.rentalNo} />
            </>
          }
        />

        <Note>Motif : {amendment.reason}</Note>
      </Section>

      {/* LE CHANGEMENT, AVANT / APRÈS — la question que le client se pose. */}
      <Section title="Ce qui change">
        <FieldColumns
          left={
            <>
              <Field
                label="Véhicule précédent"
                value={closed?.vehicleLabel ?? (closed ? 'Non communiqué' : '—')}
              />
              <Field
                label="Jusqu’au"
                value={closed ? formatDateTime(closed.to) : '—'}
              />
              {showAmounts && (
                <Field
                  label="Tarif précédent"
                  value={closed ? formatPrice(closed.amount, closed.unit) : '—'}
                />
              )}
            </>
          }
          right={
            <>
              <Field
                label="Véhicule affecté"
                value={opened?.vehicleLabel ?? 'Non communiqué'}
              />
              <Field
                label="À compter du"
                value={opened ? formatDateTime(opened.from) : formatDateTime(amendment.effectiveAt)}
              />
              {showAmounts && (
                <Field
                  label="Tarif appliqué"
                  value={opened ? formatPrice(opened.amount, opened.unit) : '—'}
                />
              )}
            </>
          }
        />

        {/*
          LA DÉROGATION TARIFAIRE, ÉCRITE SUR LE DOCUMENT DU CLIENT.
          A-5 : « des situations peuvent se présenter autrement et on les gère
          selon le contexte ». Le contexte, c'est cette phrase.
        */}
        {amendment.rateOverride && amendment.rateOverrideReason && (
          <Note>Condition particulière convenue : {amendment.rateOverrideReason}</Note>
        )}

        {!showAmounts && (
          <Note>
            Les montants ne figurent pas sur ce document : leur consultation n’est pas autorisée
            pour le compte qui l’a produit.
          </Note>
        )}
      </Section>

      {/* LA CHRONOLOGIE COMPLÈTE : le client voit ce qu'il a réellement eu. */}
      <Section title="Périodes du contrat">
        <DataTable
          columns={[
            { header: 'N°', width: '8%', cell: (row: ContractPeriod) => String(row.sequenceNo) },
            {
              header: 'Véhicule',
              width: showAmounts ? '30%' : '45%',
              cell: (row: ContractPeriod) => row.vehicleLabel ?? 'Non communiqué',
            },
            { header: 'Du', width: '20%', cell: (row: ContractPeriod) => formatDate(row.from) ?? '—' },
            { header: 'Au', width: '20%', cell: (row: ContractPeriod) => formatDate(row.to) ?? '—' },
            ...(showAmounts
              ? [
                  {
                    header: 'Tarif',
                    width: '15%',
                    align: 'right' as const,
                    cell: (row: ContractPeriod) => formatPrice(row.amount, row.unit),
                  },
                ]
              : []),
            {
              header: 'État',
              width: '7%',
              cell: (row: ContractPeriod) => row.statusLabel,
            },
          ]}
          rows={periods}
          emptyLabel="Aucune période enregistrée pour ce contrat."
        />

        <Note>
          La date de fin d’une période est l’instant où la période suivante commence : elle n’est
          pas comptée deux fois.
        </Note>
      </Section>

      {amendment.notes && (
        <Section title="Observations">
          <Note>{amendment.notes}</Note>
        </Section>
      )}

      {/* DEC-025 §h : la signature s'effectue hors système. */}
      <SignatureBlock />
    </DocumentShell>
  )
}
