'use client'

import { useState } from 'react'
import { Repeat, Tags } from 'lucide-react'

import { ACTION_BASE, ACTION_TONES } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { PricingUnit } from '@/features/pricing/constants'
import { VehicleSwapPanel } from './swap-panel'
import { RateChangePanel } from './rate-panel'
import type { SwapCandidate } from './data'

/**
 * Les deux actes d'un avenant, et le choix entre eux — LOT 22, DEC-045.
 *
 * POURQUOI ON CHOISIT D'ABORD L'ACTE.
 *
 * Deux formulaires dépliés côte à côte poseraient trois problèmes, et le
 * troisième est un défaut, pas un goût :
 *
 *   1. l'utilisateur doit LIRE les deux pour savoir lequel le concerne ;
 *   2. la page s'allonge de deux blocs dont un seul servira ;
 *   3. surtout, les deux portent des champs de MÊME NOM — date d'effet, tarif,
 *      unité, motif. Montés ensemble, ils produiraient deux contrôles du même
 *      identifiant, et le `<label>` du second désignerait le premier. Un clic
 *      sur un libellé mettrait alors le curseur dans le mauvais champ.
 *
 * Un seul formulaire est donc monté à la fois. Ce n'est pas un contournement :
 * nommer l'acte AVANT de le décrire est aussi ce que le métier fait — on
 * remplace un véhicule, ou on change un tarif, jamais les deux d'un même geste.
 *
 * CHAQUE BOUTON A SA CAPACITÉ, et n'apparaît pas sans elle (A-14, DEC-024) :
 *
 *   · « Remplacer le véhicule » → `rental.rentals.swap`
 *   · « Changer le tarif »      → `rental.pricing.override`
 */

type Acte = 'swap' | 'rate' | null

export function AmendmentActions({
  rentalId,
  currentVehicleLabel,
  candidates,
  periodFrom,
  periodTo,
  startedAt,
  running,
  currentAmount,
  currentUnit,
  canSwap,
  canOverride,
}: {
  rentalId: string
  currentVehicleLabel: string
  candidates: SwapCandidate[]
  periodFrom: string
  periodTo: string
  startedAt: string | null
  running: boolean
  currentAmount: number
  currentUnit: PricingUnit
  canSwap: boolean
  canOverride: boolean
}) {
  const [acte, setActe] = useState<Acte>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canSwap && (
          <button
            type="button"
            onClick={() => setActe(acte === 'swap' ? null : 'swap')}
            aria-pressed={acte === 'swap'}
            className={cn(ACTION_BASE, acte === 'swap' ? ACTION_TONES.secondary : ACTION_TONES.quiet)}
          >
            <Repeat className="size-3.5" aria-hidden />
            Remplacer le véhicule
          </button>
        )}

        {canOverride && (
          <button
            type="button"
            onClick={() => setActe(acte === 'rate' ? null : 'rate')}
            aria-pressed={acte === 'rate'}
            className={cn(ACTION_BASE, acte === 'rate' ? ACTION_TONES.secondary : ACTION_TONES.quiet)}
          >
            <Tags className="size-3.5" aria-hidden />
            Changer le tarif
          </button>
        )}
      </div>

      {acte === null && (
        <p className="text-xs text-muted">
          {canSwap && canOverride
            ? 'Choisissez l’acte à consigner. Dans les deux cas, le contrat reste le même : un avenant s’y ajoute, daté et motivé.'
            : canSwap
              ? 'Le remplacement conserve le contrat et son identifiant : un avenant s’y ajoute, daté et motivé.'
              : 'Le changement de tarif conserve le contrat : un avenant s’y ajoute, daté et motivé.'}
        </p>
      )}

      {acte === 'swap' && (
        <VehicleSwapPanel
          rentalId={rentalId}
          currentVehicleLabel={currentVehicleLabel}
          candidates={candidates}
          periodFrom={periodFrom}
          periodTo={periodTo}
          startedAt={startedAt}
          running={running}
          currentAmount={currentAmount}
          currentUnit={currentUnit}
          canOverride={canOverride}
        />
      )}

      {acte === 'rate' && (
        <RateChangePanel
          rentalId={rentalId}
          currentAmount={currentAmount}
          currentUnit={currentUnit}
          periodFrom={periodFrom}
          periodTo={periodTo}
        />
      )}
    </div>
  )
}
