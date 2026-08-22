import 'server-only'

import { Text } from '@react-pdf/renderer'

import { DataTable, Note, Section } from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { DOC_COLORS, DOC_SIZES } from '@/lib/documents/theme'
import { formatDate } from '@/lib/dates'
import { formatPrice, UNIT_LABELS } from '../constants'
import type { PricingRuleRow } from '../data'

/**
 * Grille tarifaire — document commercial.
 *
 * Ne présente que les TARIFS STANDARD, ceux qui s'appliquent à défaut de
 * condition particulière. Les conditions préférentielles sont propres à un
 * client : les faire figurer sur une grille remise à un tiers exposerait les
 * accords consentis à d'autres.
 *
 * Chaque montant porte son unité (DEC-001) : un prix sans unité n'a pas de
 * sens, et la mention « par jour » ou « forfait » change le devis du tout au
 * tout.
 *
 * Un tarif standard porte toujours un montant : `pricing_rules_discount_needs_client`
 * réserve les remises aux règles rattachées à un client, et
 * `pricing_rules_unit_required` impose l'unité qui va avec. Cette grille ne peut
 * donc pas afficher de ligne sans prix.
 */

export type PricingGridProps = {
  identity: DocumentIdentity
  /** Tarifs standard uniquement — aucune condition client. */
  rules: PricingRuleRow[]
  issuedOn: string
}

function scope(rule: PricingRuleRow): string {
  if (rule.vehicleLabel) return rule.vehicleLabel
  if (rule.categoryLabel) return rule.categoryLabel
  return 'Tous les véhicules'
}

function level(rule: PricingRuleRow): string {
  if (rule.vehicleLabel) return 'Véhicule'
  if (rule.categoryLabel) return 'Catégorie'
  return 'Général'
}

function validity(rule: PricingRuleRow): string {
  if (!rule.validFrom && !rule.validTo) return 'Permanent'
  const from = rule.validFrom ? `du ${formatDate(rule.validFrom)}` : ''
  const to = rule.validTo ? ` au ${formatDate(rule.validTo)}` : ''
  return `${from}${to}`.trim()
}

export function PricingGridDocument({ identity, rules, issuedOn }: PricingGridProps) {
  const active = rules.filter((rule) => rule.isActive)

  return (
    <DocumentShell
      identity={identity}
      title="Grille tarifaire"
      subtitle="Tarifs de location applicables"
      issuedOn={issuedOn}
    >
      <Section title="Tarifs standard">
        <DataTable
          columns={[
            { header: 'Niveau', width: '16%', cell: level },
            { header: 'S’applique à', width: '38%', cell: scope },
            {
              header: 'Tarif',
              width: '22%',
              align: 'right',
              cell: (rule) =>
                rule.amount != null && rule.unit ? formatPrice(rule.amount, rule.unit) : '—',
            },
            {
              header: 'Unité',
              width: '12%',
              cell: (rule) => (rule.unit ? UNIT_LABELS[rule.unit] : '—'),
            },
            { header: 'Validité', width: '12%', align: 'right', cell: validity },
          ]}
          rows={active}
          emptyLabel="Aucun tarif standard n’est configuré à ce jour."
        />

        <Text style={{ fontSize: DOC_SIZES.tiny, color: DOC_COLORS.muted, marginTop: 8 }}>
          Le tarif le plus spécifique s’applique : un tarif posé sur un véhicule l’emporte sur
          celui de sa catégorie, lequel l’emporte sur le tarif général.
        </Text>
      </Section>

      <Section title="Conditions">
        <Note>
          Grille communiquée à titre indicatif, sous réserve de disponibilité du véhicule à la
          période demandée. Des conditions particulières peuvent s’appliquer selon l’accord
          commercial conclu avec le client. Montants exprimés en francs comoriens (KMF).
        </Note>
      </Section>
    </DocumentShell>
  )
}
