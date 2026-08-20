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
        <h1 className="font-display text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/*  Carte                                                                      */
/* -------------------------------------------------------------------------- */

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn('rounded-card border border-line bg-white', className)}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>
            )}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Boutons et liens d'action                                                  */
/* -------------------------------------------------------------------------- */

type Tone = 'primary' | 'secondary' | 'danger'

/** Hiérarchie des boutons (Design System §25). */
const TONES: Record<Tone, string> = {
  primary: 'bg-adikom-500 text-white hover:bg-adikom-600',
  secondary: 'border border-line bg-white text-ink hover:bg-adikom-50 hover:text-adikom-500',
  danger: 'border border-danger-soft bg-danger-soft text-danger hover:bg-danger hover:text-white',
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export function Button({
  tone = 'primary',
  icon: Icon,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; icon?: LucideIcon }) {
  return (
    <button className={cn(BUTTON_BASE, TONES[tone], className)} {...props}>
      {Icon && <Icon className="size-4" aria-hidden />}
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
      {Icon && <Icon className="size-4" aria-hidden />}
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
