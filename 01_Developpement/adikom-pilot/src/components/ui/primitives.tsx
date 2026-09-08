import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Composants réutilisables ADIKOM PILOT.
 *
 * Premiers éléments d'une bibliothèque commune (Design System §63, §80,
 * CLAUDE.md §37) : un même composant doit se comporter de façon identique dans
 * toute l'application. Ne créer une variante que lorsqu'un besoin réel
 * l'exige — pas plusieurs composants presque identiques.
 *
 * Ces primitives sont des composants serveur : elles ne portent aucun état.
 */

/* -------------------------------------------------------------------------- */
/*  En-tête de page                                                            */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {/*
          `break-words` : un titre de fiche porte parfois une raison sociale
          d'un seul tenant. Sans lui, elle déborde de l'écran étroit et pousse
          toute la page en défilement horizontal.
        */}
        <h1 className="font-display text-xl font-semibold break-words text-ink sm:text-2xl">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>

      {/*
        Les actions passent à la ligne plutôt que de déborder.
        `shrink-0` n'est rétabli qu'à partir de `sm`, où l'en-tête redevient une
        rangée : sur mobile, il pousserait les boutons hors de l'écran.

        Elles ne sont PAS étirées à parts égales. Un bouton étiré force son
        libellé à passer à la ligne autour de son icône, et le centrage mesuré
        du contenu s'en trouve décalé de quelques pixels — la recette
        responsive l'a relevé. Chaque bouton garde donc sa largeur naturelle.
      */}
      {actions && <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div>}
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/*  Carte                                                                      */
/* -------------------------------------------------------------------------- */

export function Card({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  /** Ancre de la carte : une barre d'actions peut y conduire (`#modifier`). */
  id?: string
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      // Une ancre visée depuis la barre d'actions ne doit pas se coller au bord
      // haut de la fenêtre : le titre de la carte resterait sous l'en-tête.
      className={cn('scroll-mt-6 rounded-card border border-line bg-white', className)}
    >
      {(title || actions) && (
        // Empilé sur mobile : un titre et deux actions ne tiennent pas sur une
        // seule rangée à 360 px, et `shrink-0` les ferait déborder.
        <div className="flex flex-col gap-2 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-sm font-semibold break-words text-ink">{title}</h2>
            )}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div>}
        </div>
      )}
      {/*
        `px-5` reste identique à toutes les tailles : une trentaine d'écrans
        étendent leurs tableaux d'un bord à l'autre par `-mx-5`. Une marge
        différente sur mobile les ferait dépasser du cadre.
      */}
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Boutons et liens d'action                                                  */
/* -------------------------------------------------------------------------- */

export type Tone = 'primary' | 'secondary' | 'danger'

/** Hiérarchie des boutons (Design System §25). */
export const BUTTON_TONES: Record<Tone, string> = {
  primary: 'bg-adikom-500 text-white hover:bg-adikom-600',
  secondary: 'border border-line bg-white text-ink hover:bg-adikom-50 hover:text-adikom-500',
  danger: 'border border-danger-soft bg-danger-soft text-danger hover:bg-danger hover:text-white',
}

/**
 * Habillage commun de TOUS les boutons et liens d'action de l'application.
 *
 * Exporté, et non recopié : boutons d'export, barre documentaire, boutons de
 * soumission et panneaux partageaient jusqu'ici la même chaîne de classes,
 * répétée à cinq endroits. Une correction n'en atteignait qu'un
 * (CLAUDE.md §37).
 *
 * CE QUE CETTE BASE GARANTIT SUR MOBILE
 *
 *   `min-h-11`      — 44 px de haut, la plus petite cible qu'un doigt atteint
 *                     sans se tromper. Rendue au format naturel dès `sm` : la
 *                     souris est précise, et alourdir les barres d'action de
 *                     bureau n'apporterait rien.
 *   `text-center`   — le libellé reste centré même lorsqu'il passe à la ligne ;
 *   `leading-tight` — deux lignes tiennent dans le bouton sans le déformer ;
 *   `justify-center` + `items-center` — centrage horizontal ET vertical, icône
 *                     comprise, quelle que soit la hauteur réelle.
 */
export const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2.5 text-center text-sm leading-tight font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0'

const TONES = BUTTON_TONES

/**
 * Action COMPACTE — celle qui vit dans une ligne de liste ou un panneau.
 *
 * « Modifier », « Désactiver », « Voir la facture », « Marquer comme lu » : des
 * actions secondaires, nombreuses, qui doivent rester discrètes sur un écran
 * dense. Elles mesuraient 30 px de haut — impossibles à viser au doigt.
 *
 * `min-h-11 sm:min-h-0` règle les deux exigences à la fois : 44 px de cible sur
 * mobile, densité inchangée dès que la souris prend le relais. Le libellé reste
 * centré sur les deux axes, y compris lorsqu'il passe à la ligne.
 */
export const ACTION_BASE =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-3 py-1.5 text-center text-xs leading-tight font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0'

export const ACTION_TONES = {
  /** Bordure sobre, texte encre — l'action secondaire par défaut. */
  secondary: 'border border-line bg-white text-ink hover:bg-adikom-50 hover:text-adikom-500',
  /** Bordure sobre, texte bleu — un renvoi vers un autre écran. */
  link: 'border border-line bg-white text-adikom-500 hover:border-adikom-300',
  /** Atténuée — une action de confort, comme marquer comme lu. */
  quiet:
    'border border-line bg-white text-muted hover:border-adikom-300 hover:text-adikom-500',
  /** Sélection active d'un filtre. */
  active: 'bg-adikom-500 text-white hover:bg-adikom-600',
} as const

export function Button({
  tone = 'primary',
  icon: Icon,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; icon?: LucideIcon }) {
  return (
    <button className={cn(BUTTON_BASE, TONES[tone], className)} {...props}>
      {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      {children}
    </button>
  )
}

export function ButtonLink({
  href,
  tone = 'primary',
  icon: Icon,
  children,
  className,
}: {
  href: string
  tone?: Tone
  icon?: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <Link href={href} className={cn(BUTTON_BASE, TONES[tone], className)}>
      {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      {children}
    </Link>
  )
}

/* -------------------------------------------------------------------------- */
/*  Badges de statut                                                           */
/* -------------------------------------------------------------------------- */

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-muted',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-badge px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  États d'interface (Design System §48, §49, CLAUDE.md §38)                  */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      {Icon && (
        <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-adikom-50 text-adikom-500">
          <Icon className="size-6" aria-hidden />
        </span>
      )}
      <p className="font-display text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/** Squelette de chargement, préféré à un écran bloqué (Design System §49). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-canvas', className)} />
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3 py-2" aria-hidden>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: columns }).map((_, column) => (
            <Skeleton key={column} className={cn('h-5 flex-1', column === 0 && 'max-w-56')} />
          ))}
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Ligne d'information                                                        */
/* -------------------------------------------------------------------------- */

/** Couple libellé / valeur des fiches détaillées (Design System §40). */
export function InfoRow({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4">
      <dt className="text-sm text-muted">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted/70">{hint}</span>}
      </dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  )
}

/** Valeur absente, affichée de façon homogène plutôt que par un vide. */
export function Empty() {
  return <span className="text-muted">—</span>
}
