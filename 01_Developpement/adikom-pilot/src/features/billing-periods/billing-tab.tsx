import Link from 'next/link'
import { CalendarRange, Receipt } from 'lucide-react'

import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { formatDateTime } from '@/lib/dates'
import { formatPrice } from '@/features/pricing/constants'
import type { RentalSegment } from '@/features/amendments/data'
import {
  CADENCE_LABELS,
  GLOBAL_STATEMENT_NOTE,
  NO_DURATION_NOTE,
  ORIGIN_LABELS,
  PERIOD_STATE_HELP,
  PERIOD_STATE_LABELS,
  PERIOD_STATE_TONES,
  RENTAL_TYPE_LABELS,
  RENTAL_TYPE_TONES,
  periodState,
  type BillingCadence,
  type RentalType,
} from './constants'
import { ratePortions, type BillingPeriod } from './data'
import { BillingPlanPanel, CancelPeriodButton, PeriodInvoicePanel } from './panels'

/**
 * Onglet « Facturation » d'un contrat — LOT 23, DEC-047.
 *
 * CE QUE CET ÉCRAN DOIT RÉPONDRE, ET RÉPOND :
 *
 *   comment ce contrat se facture-t-il ?   → son régime, et sa cadence
 *   quelles périodes sont facturables ?    → chacune, avec son état
 *   laquelle est déjà facturée, et par quelle facture ?  → le lien y mène
 *   que couvrira la prochaine facture ?    → ses portions tarifaires, véhicule
 *                                            par véhicule
 *   pourquoi aucune quantité n'est proposée ? → l'écran le dit (DEC-008)
 *   et la « facture globale » ?             → l'écran dit ce qu'elle est
 *
 * TROIS RÈGLES DE LECTURE, APPLIQUÉES SANS EXCEPTION :
 *
 *   1. UN BLOC FERMÉ EST NOMMÉ. Sans `billing.customer_invoices.view`, l'écran
 *      DIT qu'il ne voit pas les factures — il n'écrit jamais « aucune facture »
 *      sur la foi d'une lecture refusée (DEC-017).
 *   2. AUCUN TOTAL QUI N'EN SERAIT PAS. Aucune durée, aucun montant de période :
 *      la règle d'arrondi n'est pas arrêtée (DEC-008).
 *   3. AUCUNE SECONDE FACTURE POSSIBLE. L'écran n'offre jamais de facturer une
 *      période déjà couverte, et la base le refuserait de toute façon.
 *
 * Rien de tout cela n'est une protection : la protection est en base.
 */

export function RentalBillingTab({
  rentalId,
  rentalStatus,
  rentalType,
  cadence,
  periods,
  segments,
  hasInvoice,
  canPlan,
  canSeeInvoices,
  canCreateInvoice,
  canSeeAmounts,
  today,
  now,
}: {
  rentalId: string
  rentalStatus: string
  rentalType: RentalType
  cadence: BillingCadence | null
  periods: BillingPeriod[]
  segments: RentalSegment[]
  hasInvoice: boolean | null
  /** `rental.rentals.billing.plan` */
  canPlan: boolean
  /** `billing.customer_invoices.view` */
  canSeeInvoices: boolean
  /** `billing.customer_invoices.create` */
  canCreateInvoice: boolean
  /** `rental.rentals.financial.view` — les tarifs verrouillés. */
  canSeeAmounts: boolean
  today: string
  /**
   * L'instant de référence, décidé UNE FOIS par la page.
   *
   * Deux appels à `new Date()` dans un même rendu peuvent tomber de part et
   * d'autre d'une borne de période : une ligne se lirait « Facturable » et le
   * bouton correspondant serait absent.
   */
  now: Date
}) {
  const plannable = !['CANCELLED', 'CLOSED', 'INVOICED'].includes(rentalStatus)

  return (
    <div className="space-y-5">
      <Card
        title="Régime de facturation"
        description="Décidé par contrat, et non par le système : la Direction a validé les deux cadences."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={RENTAL_TYPE_TONES[rentalType]}>{RENTAL_TYPE_LABELS[rentalType]}</Badge>
          {cadence && <span className="text-sm text-muted">{CADENCE_LABELS[cadence]}</span>}
        </div>

        {/*
          LE FORMULAIRE DISPARAÎT SANS LA CAPACITÉ — il n'est pas désactivé.
          Un bouton grisé promet une action que le refus démentirait (DEC-017).
        */}
        {canPlan && plannable ? (
          <BillingPlanPanel
            rentalId={rentalId}
            currentType={rentalType}
            currentCadence={cadence}
            locked={hasInvoice}
          />
        ) : canPlan ? (
          <Notice tone="info">
            Le régime de facturation d’un contrat annulé, clôturé ou déjà facturé ne se change plus.
          </Notice>
        ) : (
          <p className="text-sm text-muted">
            Votre compte ne peut pas définir le régime de facturation d’une location. Cette décision
            relève d’une capacité distincte : elle engage la façon dont ADIKOM réclame son argent sur
            ce contrat.
          </p>
        )}
      </Card>

      {rentalType === 'FIXED_TERM' ? (
        <Card title="Périodes facturables">
          <EmptyState
            icon={CalendarRange}
            title="Ce contrat se facture en une fois"
            description="Une location à durée fixée reçoit une seule facture, établie à la fin, après le retour et le contrôle. Les périodes facturables n’existent qu’en longue durée."
          />
        </Card>
      ) : (
        <Card
          title="Périodes facturables"
          description={`${periods.length} période${periods.length > 1 ? 's' : ''} — une facture par période, et une seule.`}
        >
          {periods.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Aucune période ouverte"
              description="Ce contrat est annoncé en longue durée mais ne porte aucune période facturable. Signalez-le plutôt que de le compléter à la main."
            />
          ) : (
            <ol className="space-y-4">
              {periods.map((period) => (
                <PeriodBlock
                  key={period.id}
                  rentalId={rentalId}
                  period={period}
                  segments={segments}
                  isLast={period.sequenceNo === lastPlanned(periods)}
                  canPlan={canPlan}
                  canSeeInvoices={canSeeInvoices}
                  canCreateInvoice={canCreateInvoice}
                  canSeeAmounts={canSeeAmounts}
                  today={today}
                  now={now}
                />
              ))}
            </ol>
          )}

          {!canSeeInvoices && periods.length > 0 && (
            <Notice tone="warning" className="mt-4">
              Votre compte ne peut pas consulter les factures clients : l’état « Facturée » ne peut
              pas être affiché ici. Une période peut être facturée sans que cet écran le sache.
            </Notice>
          )}

          {canSeeAmounts && periods.length > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{NO_DURATION_NOTE}</p>
          )}
        </Card>
      )}

      {/*
        🟥 LA « FACTURE GLOBALE » — A-6, et ce qu'elle est vraiment.

        L'écran le DIT, plutôt que de laisser un exploitant chercher un bouton
        qui doublerait la créance du client.
      */}
      {rentalType === 'LONG_TERM' && <Notice tone="info">{GLOBAL_STATEMENT_NOTE}</Notice>}
    </div>
  )
}

/** Le rang de la dernière période non annulée — la seule qui s'annule. */
function lastPlanned(periods: BillingPeriod[]): number {
  return periods.reduce(
    (max, period) => (period.status === 'PLANNED' ? Math.max(max, period.sequenceNo) : max),
    0
  )
}

function PeriodBlock({
  rentalId,
  period,
  segments,
  isLast,
  canPlan,
  canSeeInvoices,
  canCreateInvoice,
  canSeeAmounts,
  today,
  now,
}: {
  rentalId: string
  period: BillingPeriod
  segments: RentalSegment[]
  isLast: boolean
  canPlan: boolean
  canSeeInvoices: boolean
  canCreateInvoice: boolean
  canSeeAmounts: boolean
  today: string
  now: Date
}) {
  const state = periodState(period, now)
  const portions = ratePortions(period, segments)

  const label = `période n° ${period.sequenceNo} · ${formatDateTime(period.from)} → ${formatDateTime(period.to)}`

  return (
    <li className="rounded-control border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            Période n° {period.sequenceNo}
            <span className="ml-2 font-normal text-muted">{ORIGIN_LABELS[period.origin]}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {formatDateTime(period.from)} → {formatDateTime(period.to)}
          </p>
          {period.amendmentNo && (
            <p className="mt-1 text-xs text-muted">
              Ouverte par l’avenant <strong>{period.amendmentNo}</strong>.
            </p>
          )}
        </div>

        <Badge tone={PERIOD_STATE_TONES[state]}>{PERIOD_STATE_LABELS[state]}</Badge>
      </div>

      <p className="mt-2 text-xs text-muted">{PERIOD_STATE_HELP[state]}</p>

      {/*
        LES PORTIONS TARIFAIRES — consigne §11.

        Une période peut traverser plusieurs segments : véhicule A jusqu'au 12,
        véhicule B ensuite. Les segments restent LA SOURCE HISTORIQUE, et la
        facture portera une ligne par portion. Le tarif ne paraît qu'avec
        `rental.rentals.financial.view`.
      */}
      {portions.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs font-medium text-ink">
            {portions.length > 1
              ? `${portions.length} portions tarifaires dans cette période`
              : 'Portion tarifaire'}
          </p>
          <ul className="mt-2 space-y-1.5">
            {portions.map((portion) => (
              <li key={portion.segmentId} className="text-xs text-muted">
                <span className="text-ink">{portion.vehicleLabel ?? 'Véhicule non lisible'}</span>
                {' · '}
                {formatDateTime(portion.from)} → {formatDateTime(portion.to)}
                {canSeeAmounts && (
                  <>
                    {' · '}
                    <span className="tabular text-ink">
                      {formatPrice(portion.unitPrice, portion.unit)}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {portions.length > 1 && (
            <p className="mt-2 text-xs text-muted">
              La facture de cette période portera <strong>une ligne par portion</strong> : chaque
              tarif reste attaché à la période qu’il a couverte.
            </p>
          )}
        </div>
      )}

      {period.invoiceId && canSeeInvoices && (
        <p className="mt-3 text-sm">
          <Link
            href={`/facturation/clients/${period.invoiceId}`}
            className="inline-flex items-center gap-1.5 text-adikom-500 hover:underline"
          >
            <Receipt className="size-4" aria-hidden />
            {period.invoiceNo}
          </Link>
        </p>
      )}

      {/*
        LE BOUTON N'APPARAÎT QUE SI L'ACTE EST POSSIBLE : période échue, non
        annulée, non déjà facturée. Aucun bouton désactivé.
      */}
      {state === 'BILLABLE' && canCreateInvoice && (
        <div className="mt-4 border-t border-line pt-4">
          <PeriodInvoicePanel
            rentalId={rentalId}
            periodId={period.id}
            periodLabel={label}
            today={today}
          />
        </div>
      )}

      {state === 'UPCOMING' && isLast && canPlan && (
        <div className="mt-4 border-t border-line pt-4">
          <CancelPeriodButton rentalId={rentalId} periodId={period.id} />
          <p className="mt-2 text-xs text-muted">
            Seule la dernière période s’annule : en retirer une du milieu laisserait un intervalle du
            contrat que personne ne facturerait.
          </p>
        </div>
      )}
    </li>
  )
}
