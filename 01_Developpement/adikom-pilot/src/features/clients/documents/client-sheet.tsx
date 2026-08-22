import 'server-only'

import { Text, View } from '@react-pdf/renderer'

import { DataTable, Field, FieldColumns, Note, Section, StatusChip } from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatDiscount, formatPrice } from '@/features/pricing/constants'
import type { PricingRuleRow } from '@/features/pricing/data'
import { STATUS_LABELS, TYPE_LABELS, type ClientStatus } from '../constants'
import type { ClientDetail } from '../data'

/**
 * Fiche client — document A4.
 *
 * Premier modèle du moteur documentaire, et gabarit des suivants : il ne décrit
 * que son contenu, l'enveloppe se chargeant de l'identité, du logo, de la
 * référence et de la pagination.
 *
 * Les conditions tarifaires ne sont transmises que si le lecteur a le droit de
 * les consulter. Le modèle ne décide pas de ce qu'il montre — il montre ce qu'on
 * lui donne — ce qui rend impossible qu'un document expose plus que l'écran.
 */

const STATUS_TONES: Record<ClientStatus, 'success' | 'neutral' | 'info'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  PROSPECT: 'info',
  ARCHIVED: 'neutral',
}

export type ClientSheetProps = {
  identity: DocumentIdentity
  client: ClientDetail
  /** `null` lorsque le lecteur n'a pas accès à la tarification. */
  pricingRules: PricingRuleRow[] | null
  issuedOn: string
}

function ruleScope(rule: PricingRuleRow): string {
  if (rule.vehicleLabel) return `Véhicule : ${rule.vehicleLabel}`
  if (rule.categoryLabel) return `Catégorie : ${rule.categoryLabel}`
  return 'Tous les véhicules'
}

function ruleAmount(rule: PricingRuleRow): string {
  if (rule.amount != null && rule.unit) return formatPrice(rule.amount, rule.unit)
  if (rule.discountPercent != null) return `Remise de ${formatDiscount(rule.discountPercent)}`
  return '—'
}

function ruleValidity(rule: PricingRuleRow): string {
  if (!rule.validFrom && !rule.validTo) return 'Permanente'
  const from = rule.validFrom ? `du ${formatDate(rule.validFrom)}` : ''
  const to = rule.validTo ? ` au ${formatDate(rule.validTo)}` : ' sans fin'
  return `${from}${to}`.trim()
}

export function ClientSheetDocument({
  identity,
  client,
  pricingRules,
  issuedOn,
}: ClientSheetProps) {
  return (
    <DocumentShell
      identity={identity}
      title="Fiche client"
      subtitle={client.tradeName ?? undefined}
      reference={client.clientNo}
      issuedOn={issuedOn}
    >
      <Section title={client.displayName}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          <StatusChip label={STATUS_LABELS[client.status]} tone={STATUS_TONES[client.status]} />
          <StatusChip label={TYPE_LABELS[client.type]} tone="neutral" />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Identifiant" value={client.clientNo} />
              <Field label="Type" value={TYPE_LABELS[client.type]} />
              <Field label="Nom commercial" value={client.tradeName} />
            </>
          }
          right={
            <>
              <Field label="Statut" value={STATUS_LABELS[client.status]} />
              <Field label="Créée le" value={formatDateTime(client.createdAt)} />
              <Field label="Modifiée le" value={formatDateTime(client.updatedAt)} />
            </>
          }
        />
      </Section>

      <Section title="Coordonnées">
        <FieldColumns
          left={
            <>
              <Field label="Téléphone" value={client.phone} />
              <Field label="Téléphone secondaire" value={client.phoneSecondary} />
              <Field label="Email" value={client.email} />
            </>
          }
          right={
            <>
              <Field label="Adresse" value={client.address} />
              <Field label="Ville" value={client.city} />
              <Field label="Pays" value={client.country} />
            </>
          }
        />
      </Section>

      <Section title="Identification">
        <FieldColumns
          left={
            <>
              <Field label="Type de pièce" value={client.idDocumentType} />
              <Field label="Numéro de pièce" value={client.idDocumentNumber} />
            </>
          }
          right={
            <>
              <Field label="Registre du commerce" value={client.registrationNumber} />
              <Field label="Identifiant fiscal" value={client.taxIdentifier} />
            </>
          }
        />
      </Section>

      {pricingRules !== null && (
        <Section title="Conditions tarifaires">
          <DataTable
            columns={[
              { header: 'Portée', width: '38%', cell: ruleScope },
              { header: 'Tarif', width: '24%', cell: ruleAmount },
              { header: 'Validité', width: '26%', cell: ruleValidity },
              {
                header: 'État',
                width: '12%',
                align: 'right',
                cell: (rule) => (rule.isActive ? 'Actif' : 'Désactivé'),
              },
            ]}
            rows={pricingRules}
            emptyLabel="Aucune condition préférentielle : le tarif standard s’applique."
          />

          {pricingRules.length > 0 && (
            <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 6 }}>
              À conditions multiples, le tarif le plus spécifique s’applique : client + véhicule,
              puis client + catégorie, puis client, puis les tarifs standard.
            </Text>
          )}
        </Section>
      )}

      {client.notes && (
        <Section title="Observations">
          <Note>{client.notes}</Note>
        </Section>
      )}
    </DocumentShell>
  )
}
