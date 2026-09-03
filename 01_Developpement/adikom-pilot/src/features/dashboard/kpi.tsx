import Link from 'next/link'
import { ArrowRight, Lock, TriangleAlert } from 'lucide-react'

import { Badge, type BadgeTone } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { Figure } from './data'

/**
 * Les composants du tableau de bord — Module 01 §7, §19, §20, §25, §26.
 *
 * UNE CARTE KPI DOIT POUVOIR NE PAS AVOIR DE CHIFFRE.
 *
 * C'est tout l'objet de ce fichier. Un indicateur a trois issues — une valeur,
 * un refus de droit, une erreur de chargement — et les trois doivent se lire
 * différemment. Le piège serait d'afficher « 0 » dans les deux derniers cas :
 * « 0 facture en retard » rassure, alors que le système n'a rien vérifié du
 * tout (DEC-017, §26).
 *
 * NIVEAUX D'IMPORTANCE — §20
 *
 * « La présentation visuelle doit permettre de distinguer les niveaux sans
 * dépendre uniquement de la couleur. » Chaque niveau porte donc un MOT, pas
 * seulement une teinte : un daltonien, une impression en noir et blanc ou un
 * lecteur d'écran doivent lire la même hiérarchie.
 */

export type Level = 'info' | 'watch' | 'important' | 'urgent'

export const LEVEL_LABELS: Record<Level, string> = {
  info: 'Information',
  watch: 'À surveiller',
  important: 'Important',
  urgent: 'Urgent',
}

const LEVEL_TONES: Record<Level, BadgeTone> = {
  info: 'info',
  watch: 'neutral',
  important: 'warning',
  urgent: 'danger',
}

const LEVEL_ACCENTS: Record<Level, string> = {
  info: 'border-line',
  watch: 'border-line',
  important: 'border-warning-soft',
  urgent: 'border-danger-soft',
}

/* -------------------------------------------------------------------------- */
/*  Ce qu'on affiche quand il n'y a pas de chiffre                             */
/* -------------------------------------------------------------------------- */

/** Le refus de droit : nommé, jamais confondu avec une absence de données. */
export function Denied({ missing }: { missing: readonly string[] }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Non accessible — permission{missing.length > 1 ? 's' : ''}{' '}
        {missing.map((code, index) => (
          <span key={code}>
            {index > 0 && ', '}
            <code className="tabular">{code}</code>
          </span>
        ))}
        .
      </span>
    </p>
  )
}

/** L'échec de chargement : dit, jamais masqué par une valeur inventée (§26). */
export function LoadError({ what }: { what: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-danger">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{what} n’a pas pu être chargé. Actualisez la page pour réessayer.</span>
    </p>
  )
}

/* -------------------------------------------------------------------------- */
/*  Carte KPI — §7                                                             */
/* -------------------------------------------------------------------------- */

export function Kpi({
  label,
  figure,
  format = (value) => value.toLocaleString('fr-FR'),
  hint,
  href,
  level,
  emphasizeFrom = 1,
}: {
  label: string
  figure: Figure<number>
  /** Un nombre s'écrit autrement qu'un montant : le formatage vient du parent. */
  format?: (value: number) => string
  /** La période concernée, ou ce que le chiffre recouvre (§7). */
  hint?: string
  /** « Cliquer → la liste correspondante » (§23). Absent si rien à ouvrir. */
  href?: string
  /** Le niveau ne s'applique qu'au-delà du seuil : zéro alerte n'alerte pas. */
  level?: Level
  emphasizeFrom?: number
}) {
  const value = figure.state === 'ok' ? figure.value : null
  const raised = level && value !== null && value >= emphasizeFrom ? level : null

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {raised && <Badge tone={LEVEL_TONES[raised]}>{LEVEL_LABELS[raised]}</Badge>}
      </div>

      {figure.state === 'ok' && (
        <p
          data-kpi-value={figure.value}
          className={cn(
            'mt-2 font-display text-2xl font-semibold tabular',
            raised === 'urgent' ? 'text-danger' : 'text-ink'
          )}
        >
          {format(figure.value)}
        </p>
      )}
      {figure.state === 'denied' && (
        <div className="mt-2">
          <Denied missing={figure.missing} />
        </div>
      )}
      {figure.state === 'error' && (
        <div className="mt-2">
          <LoadError what={label} />
        </div>
      )}

      {hint && figure.state === 'ok' && <p className="mt-1 text-xs text-muted">{hint}</p>}

      {href && figure.state === 'ok' && (
        <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-adikom-500">
          Voir le détail
          <ArrowRight className="size-3.5" aria-hidden />
        </p>
      )}
    </>
  )

  const shell = cn(
    'block rounded-card border bg-white px-4 py-4 transition-colors',
    raised ? LEVEL_ACCENTS[raised] : 'border-line'
  )

  // Une carte sans droit ni valeur ne mène nulle part : la rendre cliquable
  // proposerait une porte que la page de destination refermerait aussitôt.
  //
  // `data-kpi` nomme la carte pour les recettes : une valeur s'y lit sans
  // dépendre de la mise en forme, qui peut changer sans que le chiffre change.
  return href && figure.state === 'ok' ? (
    <Link href={href} data-kpi={label} className={cn(shell, 'hover:border-adikom-300')}>
      {body}
    </Link>
  ) : (
    <div data-kpi={label} className={shell}>
      {body}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Ligne d'alerte — §19                                                       */
/* -------------------------------------------------------------------------- */

export function AlertRow({
  level,
  title,
  detail,
  href,
}: {
  level: Level
  title: string
  detail: string
  href?: string
}) {
  const content = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        <p className="truncate text-xs text-muted">{detail}</p>
      </div>
      <Badge tone={LEVEL_TONES[level]} className="shrink-0">
        {LEVEL_LABELS[level]}
      </Badge>
    </>
  )

  const shell =
    'flex flex-col gap-2 rounded-control border border-line p-3 sm:flex-row sm:items-center sm:justify-between'

  return href ? (
    <Link href={href} className={cn(shell, 'transition-colors hover:border-adikom-300')}>
      {content}
    </Link>
  ) : (
    <div className={shell}>{content}</div>
  )
}
