import Link from 'next/link'

import { Card } from '@/components/ui/primitives'
import { Input } from '@/components/ui/form'
import { formatAmount } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  ANALYTICS_PERIOD_KEYS,
  ANALYTICS_PERIOD_LABELS,
  CUSTOM_PERIOD_KEY,
  GRAIN_LABELS,
  describeAnalyticsPeriod,
  describeBucket,
  type AnalyticsPeriod,
} from './period'

/**
 * Les commandes communes aux quatre écrans de statistiques et de rapports.
 *
 * Un même sélecteur de période, une même série, une même façon de dire qu'il
 * n'y a rien : deux écrans qui posent la même question ne doivent pas se
 * répondre de deux façons (CLAUDE.md §37).
 */

const kmf = (value: number) => formatAmount(value, { withCurrency: true })

/* -------------------------------------------------------------------------- */
/*  Sélecteur de période — Module 07 §59                                       */
/* -------------------------------------------------------------------------- */

/**
 * Cinq périodes civiles, plus la période personnalisée.
 *
 * Les cinq premières sont des LIENS : elles ne demandent aucune saisie, et un
 * clic doit suffire (CLAUDE.md §56 — réduire les clics inutiles). La sixième
 * est un formulaire, parce qu'elle attend deux dates.
 *
 * Le formulaire est un `GET` : la période choisie vit dans l'URL, donc elle se
 * partage, se met en favori et survit à un rechargement.
 */
export function PeriodPicker({
  basePath,
  period,
}: {
  basePath: string
  period: AnalyticsPeriod
}) {
  const custom = period.key === CUSTOM_PERIOD_KEY

  return (
    <nav aria-label="Période analysée" className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        {ANALYTICS_PERIOD_KEYS.filter((key) => key !== CUSTOM_PERIOD_KEY).map((key) => (
          <Link
            key={key}
            href={`${basePath}?periode=${key}`}
            aria-current={period.key === key ? 'page' : undefined}
            className={cn(
              'rounded-control px-3.5 py-2 text-sm transition-colors',
              period.key === key
                ? 'bg-adikom-500 font-medium text-white'
                : 'border border-line bg-white text-muted hover:border-adikom-300 hover:text-adikom-500'
            )}
          >
            {ANALYTICS_PERIOD_LABELS[key]}
          </Link>
        ))}

        <form method="get" action={basePath} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="periode" value={CUSTOM_PERIOD_KEY} />
          <Input
            name="du"
            type="date"
            defaultValue={custom ? period.from : ''}
            aria-label="Période personnalisée — premier jour"
            className="w-auto"
          />
          <Input
            name="au"
            type="date"
            defaultValue={custom ? period.to : ''}
            aria-label="Période personnalisée — dernier jour"
            className="w-auto"
          />
          <button
            type="submit"
            className={cn(
              'rounded-control px-3.5 py-2 text-sm transition-colors',
              custom
                ? 'bg-adikom-500 font-medium text-white'
                : 'border border-line bg-white text-muted hover:border-adikom-300 hover:text-adikom-500'
            )}
          >
            Période personnalisée
          </button>
        </form>
      </div>

      <p className="mt-2 text-xs text-muted">
        Période analysée : {describeAnalyticsPeriod(period)} — série{' '}
        {GRAIN_LABELS[period.grain]}. Les créances et les dettes sont des situations
        actuelles : la période ne s’y applique pas.
      </p>
    </nav>
  )
}

/* -------------------------------------------------------------------------- */
/*  Série — Module 07 §26, §59                                                 */
/* -------------------------------------------------------------------------- */

export type SeriesBar = {
  label: string
  amount: number
  tone: 'primary' | 'success' | 'warning'
}

export type SeriesEntry = {
  bucket: string
  bars: SeriesBar[]
}

const BAR_TONES: Record<SeriesBar['tone'], string> = {
  primary: 'bg-adikom-500',
  success: 'bg-success',
  warning: 'bg-warning',
}

/**
 * La série, en barres proportionnelles ET en chiffres.
 *
 * « Ne crée pas de graphiques décoratifs sans valeur » (CLAUDE.md §41) : la
 * barre sert à comparer d'un coup d'œil, le montant reste écrit à côté. Une
 * barre seule ne se lit pas au clavier, ne s'imprime pas en noir et blanc et ne
 * s'énonce pas par un lecteur d'écran — le chiffre, si.
 *
 * L'échelle est commune à toutes les barres : deux périodes ne se comparent que
 * si elles se mesurent avec le même mètre.
 */
export function Series({
  entries,
  grainLabel,
  legend,
  emptyLabel,
}: {
  entries: SeriesEntry[]
  grainLabel: string
  legend: { label: string; tone: SeriesBar['tone'] }[]
  emptyLabel: string
}) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>
  }

  const max = Math.max(
    1,
    ...entries.flatMap((entry) => entry.bars.map((bar) => bar.amount))
  )

  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-4">
        {legend.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={cn('inline-block size-2.5 rounded-sm', BAR_TONES[item.tone])} />
            {item.label}
          </li>
        ))}
      </ul>

      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.bucket} className="grid gap-1 sm:grid-cols-[6rem_1fr] sm:gap-3">
            <p className="text-xs font-medium text-ink tabular">{entry.bucket}</p>
            <div className="space-y-1">
              {entry.bars.map((bar) => (
                <div key={bar.label} className="flex items-center gap-2">
                  <span className="h-2.5 min-w-0 flex-1 rounded-full bg-canvas">
                    <span
                      className={cn('block h-2.5 rounded-full', BAR_TONES[bar.tone])}
                      style={{ width: `${Math.round((bar.amount / max) * 100)}%` }}
                    />
                  </span>
                  <span className="w-36 shrink-0 text-right text-xs text-muted tabular">
                    <span className="sr-only">{bar.label} : </span>
                    {kmf(bar.amount)}
                  </span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
        {entries.length} période(s) {grainLabel}. Un pas sans mouvement n’est pas affiché : il
        vaut zéro.
      </p>
    </div>
  )
}

/** Réécrit un point de série en entrée d'affichage. */
export function toSeriesEntry(
  bucket: string,
  grain: AnalyticsPeriod['grain'],
  bars: SeriesBar[]
): SeriesEntry {
  return { bucket: describeBucket(bucket, grain), bars }
}

/* -------------------------------------------------------------------------- */
/*  Avertissement de période corrigée                                          */
/* -------------------------------------------------------------------------- */

/**
 * Une période corrigée se DIT.
 *
 * Sans cela, l'utilisateur croirait lire les chiffres des dates qu'il a tapées
 * (DEC-017).
 */
export function PeriodNotice({ period }: { period: AnalyticsPeriod }) {
  if (period.note === null) return null

  return (
    <Card className="mb-5 border-warning-soft">
      <p className="text-sm text-ink">
        {period.note === 'incomplete'
          ? `Une période personnalisée demande deux dates valides. À défaut, les chiffres ci-dessous portent sur ${describeAnalyticsPeriod(period)}.`
          : `Les deux dates étaient inversées : la période est lue ${describeAnalyticsPeriod(period)}.`}
      </p>
    </Card>
  )
}
