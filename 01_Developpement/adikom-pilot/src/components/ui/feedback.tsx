'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Retours d'état des formulaires — ADIKOM PILOT.
 *
 * Les états succès / erreur / chargement doivent se présenter de la même façon
 * dans toute l'application (CLAUDE.md §38, Design System §48). Les regrouper ici
 * évite d'en écrire une variante par module, qui divergerait à la première
 * correction.
 */

type NoticeTone = 'error' | 'success' | 'warning'

const NOTICE_STYLES: Record<NoticeTone, string> = {
  error: 'border-danger-soft bg-danger-soft text-danger',
  success: 'border-success-soft bg-success-soft text-success',
  warning: 'border-warning-soft bg-warning-soft text-warning',
}

const NOTICE_ICONS: Record<NoticeTone, LucideIcon> = {
  error: AlertCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
}

export function Notice({
  tone,
  children,
  className,
}: {
  tone: NoticeTone
  children: ReactNode
  className?: string
}) {
  const Icon = NOTICE_ICONS[tone]

  return (
    <div
      role={tone === 'success' ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-2.5 rounded-control border px-3.5 py-3 text-sm',
        NOTICE_STYLES[tone],
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Messages renvoyés par une action serveur, affichés de façon homogène. */
export function FormFeedback({
  error,
  success,
  className,
}: {
  error?: string
  success?: string
  className?: string
}) {
  if (!error && !success) return null

  return (
    <div className={cn('space-y-3', className)}>
      {error && <Notice tone="error">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
    </div>
  )
}

/**
 * Bouton de soumission avec état de chargement.
 * Un formulaire ne doit jamais paraître inerte pendant l'envoi (§38).
 */
export function SubmitButton({
  label,
  pendingLabel = 'Enregistrement…',
  icon: Icon,
  tone = 'primary',
  disabled,
}: {
  label: string
  pendingLabel?: string
  icon?: LucideIcon
  tone?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}) {
  const { pending } = useFormStatus()

  const tones = {
    primary: 'bg-adikom-500 text-white hover:bg-adikom-600',
    secondary: 'border border-line bg-white text-ink hover:bg-adikom-50 hover:text-adikom-500',
    danger:
      'border border-danger-soft bg-danger-soft text-danger hover:bg-danger hover:text-white',
  } as const

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        tones[tone]
      )}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="size-4" aria-hidden />
      )}
      {pending ? pendingLabel : label}
    </button>
  )
}
