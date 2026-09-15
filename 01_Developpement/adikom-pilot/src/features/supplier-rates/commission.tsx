import { Lock, TrendingUp } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { UNIT_SUFFIX, type PricingUnit } from '@/features/pricing/constants'
import {
  commission,
  COMMISSION_GAP_MESSAGES,
  COMMISSION_SCOPE_NOTE,
  INTERNAL_NOTICE,
  type CommissionGap,
} from './constants'

/**
 * La commission de location, affichée — LOT 21, DEC-044.
 *
 * UN SEUL COMPOSANT POUR LES TROIS SURFACES : l'écran des tarifs fournisseurs,
 * la fiche du véhicule, le contrat de location. Trois rendus différents
 * finiraient par dire trois choses différentes du même chiffre.
 *
 * CE QU'IL NE FAIT JAMAIS :
 *
 *   · afficher « 0 » quand un montant manque — il DIT ce qui manque (DEC-008) ;
 *   · ramener une commission négative à zéro — vendre à perte est un fait ;
 *   · appeler « rentabilité » ce qui n'est qu'un écart sur la mise à
 *     disposition. La marge d'exploitation du véhicule est un autre indicateur,
 *     et l'écran le NOMME pour qu'on ne les confonde pas (Plan 02 §6.2).
 *
 * Il ne protège rien : la protection est en base. Il ne fait que ne pas mentir.
 */

export type CommissionInput = {
  clientPrice: { amount: number; unit: PricingUnit } | null
  cost: { amount: number; unit: PricingUnit } | null
  /** Le lecteur détient-il `rental.pricing.supplier.view` ? */
  canSeeCost: boolean
  /** Le lecteur détient-il le droit de lire le tarif client de cette surface ? */
  canSeeClientPrice: boolean
  /** Véhicule fourni par un fournisseur ? Sinon la question ne se pose pas. */
  supplied: boolean
}

/**
 * Pourquoi la commission ne peut pas être calculée — ou `null` si elle le peut.
 *
 * L'ORDRE COMPTE : une capacité manquante se dit AVANT une donnée manquante.
 * Dire « aucun coût renseigné » à qui n'a pas le droit de le lire serait une
 * affirmation fausse — RLS rend zéro ligne, elle ne prouve pas l'absence
 * (DEC-017).
 */
export function commissionGap({
  clientPrice,
  cost,
  canSeeCost,
  canSeeClientPrice,
  supplied,
}: CommissionInput): CommissionGap | null {
  if (!canSeeClientPrice) return 'NO_CLIENT_PRICE_ACCESS'
  if (!canSeeCost) return 'NO_COST_ACCESS'
  if (!supplied) return 'NOT_SUPPLIED'

  const result = commission(clientPrice, cost)
  return result.ok ? null : result.gap
}

/** Le montant seul, pour une cellule de tableau. Jamais un zéro inventé. */
export function CommissionAmount(props: CommissionInput) {
  const gap = commissionGap(props)

  if (gap !== null) {
    return <span className="text-xs text-muted">{SHORT_GAP[gap]}</span>
  }

  const result = commission(props.clientPrice, props.cost)
  if (!result.ok) return <span className="text-xs text-muted">{SHORT_GAP[result.gap]}</span>

  const { amount, unit, rate } = result.commission

  return (
    <span
      className={cn(
        'font-medium tabular',
        amount < 0 ? 'text-danger' : amount === 0 ? 'text-muted' : 'text-ink'
      )}
    >
      {formatAmount(amount)} {UNIT_SUFFIX[unit]}
      {rate !== null && (
        <span className="ml-1 font-normal text-muted">
          ({rate.toLocaleString('fr-FR')} %)
        </span>
      )}
    </span>
  )
}

/** Version courte, pour une cellule : la version longue tient dans l'aide. */
const SHORT_GAP: Record<CommissionGap, string> = {
  NO_CLIENT_PRICE_ACCESS: 'Tarif client non accessible',
  NO_COST_ACCESS: 'Coût non accessible',
  NO_COST_AT_DATE: 'Coût non renseigné',
  NOT_SUPPLIED: 'Sans objet',
  UNIT_MISMATCH: 'Unités différentes',
}

/**
 * Le bloc complet : les trois montants, et ce qu'ils ne couvrent pas.
 *
 * `priceLabel` nomme la nature du tarif client montré — « Tarif verrouillé »
 * sur un contrat, « Tarif standard » sur une fiche véhicule. Les deux ne
 * répondent pas à la même question, et les présenter sous le même mot ferait
 * prendre l'un pour l'autre.
 */
export function CommissionBlock({
  on,
  priceLabel,
  priceHint,
  ...input
}: CommissionInput & {
  on: string
  priceLabel: string
  priceHint: string
}) {
  const gap = commissionGap(input)
  const result = gap === null ? commission(input.clientPrice, input.cost) : null

  return (
    <div className="space-y-3">
      <dl>
        <Row label={priceLabel} hint={priceHint}>
          {input.clientPrice ? (
            <span className="tabular">
              {formatAmount(input.clientPrice.amount)} {UNIT_SUFFIX[input.clientPrice.unit]}
            </span>
          ) : (
            <span className="text-xs text-muted">
              {input.canSeeClientPrice
                ? 'Aucun tarif client applicable à cette date.'
                : 'Non accessible avec vos droits.'}
            </span>
          )}
        </Row>

        <Row
          label="Coût d’acquisition"
          hint="Ce qu’ADIKOM verse au fournisseur pour disposer du véhicule. Donnée interne."
        >
          {!input.canSeeCost ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Lock className="size-3.5 shrink-0" aria-hidden />
              Protégé par une permission dédiée, que votre compte ne détient pas.
            </span>
          ) : !input.supplied ? (
            <span className="text-xs text-muted">
              Ce véhicule n’est pas mis à disposition par un fournisseur.
            </span>
          ) : input.cost ? (
            <span className="tabular">
              {formatAmount(input.cost.amount)} {UNIT_SUFFIX[input.cost.unit]}
            </span>
          ) : (
            <span className="text-xs text-muted">
              Aucun coût d’acquisition renseigné au {formatDate(on)}.
            </span>
          )}
        </Row>

        <Row label="Commission de location" hint={COMMISSION_SCOPE_NOTE}>
          {result?.ok ? (
            <span
              className={cn(
                'inline-flex items-center gap-2 font-medium tabular',
                result.commission.amount < 0 ? 'text-danger' : 'text-ink'
              )}
            >
              <TrendingUp className="size-4 shrink-0 text-muted" aria-hidden />
              {formatAmount(result.commission.amount)} {UNIT_SUFFIX[result.commission.unit]}
              {result.commission.rate !== null && (
                <span className="font-normal text-muted">
                  ({result.commission.rate.toLocaleString('fr-FR')} %)
                </span>
              )}
            </span>
          ) : (
            <span className="text-xs text-muted">
              {COMMISSION_GAP_MESSAGES[gap as CommissionGap]}
            </span>
          )}
        </Row>
      </dl>

      {input.canSeeCost && (
        <p className="text-xs text-muted">
          <Lock className="mr-1 inline size-3 align-[-1px]" aria-hidden />
          {INTERNAL_NOTICE}
        </p>
      )}
    </div>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4">
      <dt className="text-sm text-muted">
        {label}
        <span className="mt-0.5 block text-xs text-muted/70">{hint}</span>
      </dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  )
}
