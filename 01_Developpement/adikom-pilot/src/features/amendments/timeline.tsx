import Link from 'next/link'
import { CarFront, FileSignature, Lock } from 'lucide-react'

import { Badge, Card, EmptyState, InfoRow } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatPrice, SOURCE_LABELS, type PricingSource } from '@/features/pricing/constants'
import {
  COMMISSION_GAP_MESSAGES,
  formatRate,
  INTERNAL_NOTICE,
} from '@/features/supplier-rates/constants'
import {
  AMENDMENT_KIND_LABELS,
  AMENDMENT_KIND_TONES,
  COMMISSION_NO_TOTAL_NOTE,
  OVERRIDE_NOTE,
  SAME_CONTRACT_NOTE,
  SEGMENT_STATUS_HELP,
  SEGMENT_STATUS_LABELS,
  SEGMENT_STATUS_TONES,
} from './constants'
import { segmentCommission, type RentalAmendment, type RentalSegment } from './data'

/**
 * Chronologie d'un contrat de location — LOT 22, DEC-045.
 *
 * CE QUE CET ÉCRAN DOIT RÉPONDRE, ET RÉPOND :
 *
 *   quel véhicule était affecté ?          → chaque segment le nomme
 *   à quelle période ?                     → sa période, bornes comprises
 *   quel tarif client s'appliquait ?       → son tarif verrouillé, et son origine
 *   quel coût s'appliquait ?               → son coût GELÉ, sous sa capacité
 *   quel avenant a provoqué le changement ? → le segment nomme son avenant
 *   pourquoi ?                             → le motif écrit de l'avenant
 *   qui, et quand ?                        → l'auteur et l'horodatage
 *
 * TROIS RÈGLES DE LECTURE, APPLIQUÉES SANS EXCEPTION :
 *
 *   1. UN BLOC FERMÉ EST NOMMÉ. Sans `rental.pricing.supplier.view`, le coût
 *      n'est pas silencieusement absent : l'écran DIT qu'il existe peut-être et
 *      qu'il n'est pas ouvert (DEC-017). Le taire laisserait croire qu'il n'y a
 *      rien à voir — ou que le véhicule ne coûte rien.
 *   2. UN COÛT ABSENT N'EST PAS UN COÛT NUL. Jamais « 0 KMF » : « aucun coût
 *      connu à cette date », et la raison (DEC-008).
 *   3. AUCUN TOTAL QUI N'EN SERAIT PAS. Les commissions par segment ne
 *      s'additionnent pas sans règle de durée facturable (DEC-008).
 *
 * Rien de tout cela n'est une protection : la protection est en base.
 */

export function RentalTimeline({
  segments,
  amendments,
  canSeeAmounts,
  canSeeCost,
}: {
  segments: RentalSegment[]
  amendments: RentalAmendment[]
  /** `rental.rentals.financial.view` — les montants facturés au client. */
  canSeeAmounts: boolean
  /** `rental.pricing.supplier.view` — le coût d'acquisition. */
  canSeeCost: boolean
}) {
  if (segments.length === 0) {
    return (
      <Card title="Chronologie du contrat">
        <EmptyState
          icon={CarFront}
          title="Aucune période enregistrée"
          description="La chronologie d’un contrat se compose au fur et à mesure : une période par véhicule affecté. Si elle est vide, signalez-le plutôt que de la compléter à la main."
        />
      </Card>
    )
  }

  const byAmendment = new Map(amendments.map((item) => [item.id, item]))

  return (
    <div className="space-y-5">
      <Notice tone="info">{SAME_CONTRACT_NOTE}</Notice>

      <Card
        title="Périodes et véhicules"
        description={`${segments.length} période${segments.length > 1 ? 's' : ''} · ${amendments.length} avenant${amendments.length > 1 ? 's' : ''}`}
      >
        <ol className="space-y-4">
          {segments.map((segment, index) => (
            <SegmentBlock
              key={segment.id}
              segment={segment}
              amendment={segment.amendmentId ? byAmendment.get(segment.amendmentId) : undefined}
              previous={index > 0 ? segments[index - 1] : null}
              canSeeAmounts={canSeeAmounts}
              canSeeCost={canSeeCost}
            />
          ))}
        </ol>

        {canSeeAmounts && canSeeCost && segments.length > 1 && (
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
            {COMMISSION_NO_TOTAL_NOTE}
          </p>
        )}
      </Card>

      {amendments.length > 0 && (
        <Card
          title="Avenants"
          description="Les actes qui ont modifié ce contrat. Un avenant ne se réécrit pas : une erreur se corrige par l’avenant suivant."
        >
          <ul className="space-y-4">
            {amendments.map((amendment) => (
              <AmendmentBlock key={amendment.id} amendment={amendment} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Un segment                                                                 */
/* -------------------------------------------------------------------------- */

function SegmentBlock({
  segment,
  amendment,
  previous,
  canSeeAmounts,
  canSeeCost,
}: {
  segment: RentalSegment
  amendment: RentalAmendment | undefined
  previous: RentalSegment | null
  canSeeAmounts: boolean
  canSeeCost: boolean
}) {
  const result = segmentCommission(segment, {
    canSeeClientPrice: canSeeAmounts,
    canSeeCost,
  })

  /*
   * L'ÉCART DE TARIF ENTRE DEUX PÉRIODES, NOMMÉ.
   *
   * C'est la question de la Direction : « le client paie-t-il le nouveau
   * tarif ? » L'écran répond en montrant l'avant et l'après côte à côte, et non
   * en laissant l'utilisateur soustraire de tête.
   */
  const gap =
    canSeeAmounts && previous && previous.lockedUnit === segment.lockedUnit
      ? segment.lockedAmount - previous.lockedAmount
      : null

  return (
    <li className="rounded-control border border-line p-4">
      {/*
        `flex-wrap` et `min-w-0` — 360 px.

        Un libellé de véhicule tient rarement sur une ligne de téléphone :
        « DEMO VEHICULE DEMO 02 — DEMO 002 » en fait déjà trente-deux. Sans le
        retour à la ligne, l'en-tête pousse la carte hors de l'écran et TOUTE la
        page défile horizontalement. On réorganise, on ne rétrécit pas
        (CLAUDE.md §35).
      */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium text-ink">
          <span className="tabular text-muted">Période {segment.sequenceNo}</span>
          <CarFront className="size-4 shrink-0 text-muted" aria-hidden />
          {segment.vehicleLabel ? (
            <Link
              href={`/location/parc/${segment.vehicleId}`}
              className="break-words text-adikom-500 hover:underline"
            >
              {segment.vehicleLabel}
            </Link>
          ) : (
            /* `null` = véhicule non lisible, jamais « sans véhicule » (DEC-017). */
            <span className="text-muted">
              Véhicule non lisible avec vos droits
            </span>
          )}
        </p>

        <Badge tone={SEGMENT_STATUS_TONES[segment.status]}>
          {SEGMENT_STATUS_LABELS[segment.status]}
        </Badge>
      </div>

      <dl className="mt-3">
        <InfoRow label="Du" hint="Instant inclus dans cette période.">
          {formatDateTime(segment.from) ?? '—'}
        </InfoRow>
        <InfoRow
          label="Au"
          hint="Instant EXCLU : il appartient à la période suivante, sans ambiguïté."
        >
          {formatDateTime(segment.to) ?? '—'}
        </InfoRow>

        {canSeeAmounts && (
          <InfoRow
            label="Tarif client"
            hint={[
              segment.lockedSource === 'OVERRIDE'
                ? 'Tarif forcé en dérogation du barème.'
                : segment.lockedSource
                  ? (SOURCE_LABELS[segment.lockedSource as PricingSource] ?? segment.lockedSource)
                  : null,
              gap !== null && gap !== 0 ? 'Écart avec la période précédente.' : null,
            ]
              .filter(Boolean)
              .join(' ') || undefined}
          >
            {/*
              LE BADGE NE PORTE QUE LE MONTANT — il est `whitespace-nowrap`, et
              une phrase entière y déborderait de l'écran d'un téléphone. Ce
              qu'elle disait vit dans l'indication du champ, qui revient à la
              ligne.
            */}
            <span className="font-medium tabular">
              {formatPrice(segment.lockedAmount, segment.lockedUnit)}
            </span>
            {gap !== null && gap !== 0 && (
              <Badge tone={gap > 0 ? 'warning' : 'info'} className="ml-2">
                {gap > 0 ? '+' : '−'}
                {formatPrice(Math.abs(gap), segment.lockedUnit)}
              </Badge>
            )}
          </InfoRow>
        )}

        {/*
          LE COÛT ET LA COMMISSION — LOT 21 et 22.

          Le bloc DISPARAÎT sans `rental.pricing.supplier.view` : un « coût : — »
          se lirait « ce véhicule ne coûte rien » (A-2, DEC-017). Ce qui compte
          ici est que le coût soit GELÉ : une saisie rétroactive de tarif
          fournisseur ne le déplace plus.
        */}
        {canSeeCost && (
          <InfoRow
            label="Coût d’acquisition gelé"
            hint={
              segment.lockedCost
                ? `Résolu au ${formatDate(segment.lockedCost.resolvedOn)}, à l’ouverture de cette période. Une révision ultérieure du tarif fournisseur ne le déplace plus.`
                : undefined
            }
          >
            {segment.lockedCost ? (
              <span className="tabular">
                {formatRate(segment.lockedCost.amount, segment.lockedCost.unit)}
              </span>
            ) : (
              <span className="text-sm text-muted">
                Aucun coût connu à l’ouverture de cette période — un coût absent n’est pas un
                coût nul.
              </span>
            )}
          </InfoRow>
        )}

        {canSeeCost && canSeeAmounts && (
          <InfoRow label="Commission de location">
            {result.ok ? (
              <span className="font-medium tabular">
                {formatPrice(result.commission.amount, result.commission.unit)}
                {result.commission.rate !== null && (
                  <span className="ml-1.5 text-xs font-normal text-muted">
                    ({result.commission.rate} %)
                  </span>
                )}
              </span>
            ) : (
              <span className="text-sm text-muted">{COMMISSION_GAP_MESSAGES[result.gap]}</span>
            )}
          </InfoRow>
        )}

        {amendment ? (
          <InfoRow
            label="Ouverte par"
            hint={`${AMENDMENT_KIND_LABELS[amendment.kind]} du ${formatDateTime(amendment.createdAt) ?? ''}`}
          >
            <span className="tabular">{amendment.amendmentNo}</span>
            <span className="block text-xs text-muted">{amendment.reason}</span>
          </InfoRow>
        ) : (
          <InfoRow label="Ouverte par" hint="Première période du contrat.">
            Le contrat lui-même
          </InfoRow>
        )}
      </dl>

      {segment.status === 'CANCELLED' && (
        <p className="mt-3 text-xs text-muted">{SEGMENT_STATUS_HELP.CANCELLED}</p>
      )}

      {canSeeCost && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          {INTERNAL_NOTICE}
        </p>
      )}
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/*  Un avenant                                                                 */
/* -------------------------------------------------------------------------- */

function AmendmentBlock({ amendment }: { amendment: RentalAmendment }) {
  return (
    <li className="rounded-control border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium text-ink">
          <FileSignature className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="tabular">{amendment.amendmentNo}</span>
          <span className="text-muted">— avenant n° {amendment.sequenceNo}</span>
        </p>

        <div className="flex flex-wrap gap-2">
          <Badge tone={AMENDMENT_KIND_TONES[amendment.kind]}>
            {AMENDMENT_KIND_LABELS[amendment.kind]}
          </Badge>
          {amendment.rateOverride && <Badge tone="warning">Tarif dérogatoire</Badge>}
        </div>
      </div>

      <dl className="mt-3">
        <InfoRow
          label="Prend effet le"
          hint="Distinct de la date de saisie : un changement survenu hier se consigne aujourd’hui."
        >
          {formatDateTime(amendment.effectiveAt) ?? '—'}
        </InfoRow>
        <InfoRow label="Motif">{amendment.reason}</InfoRow>
        {amendment.rateOverrideReason && (
          <InfoRow label="Raison de la dérogation" hint={OVERRIDE_NOTE}>
            {amendment.rateOverrideReason}
          </InfoRow>
        )}
        {amendment.notes && <InfoRow label="Observations">{amendment.notes}</InfoRow>}
        <InfoRow label="Enregistré par">
          {/* `null` = auteur non lisible, jamais « personne » (DEC-017). */}
          {amendment.authorLabel ?? (
            <span className="text-muted">Auteur non lisible avec vos droits</span>
          )}
        </InfoRow>
        <InfoRow label="Enregistré le">{formatDateTime(amendment.createdAt) ?? '—'}</InfoRow>
      </dl>
    </li>
  )
}
