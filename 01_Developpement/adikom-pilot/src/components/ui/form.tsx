import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Champs de formulaire ADIKOM PILOT.
 *
 * Design System §37 à §39 : formulaires organisés en sections, champs
 * obligatoires clairement identifiés, erreurs affichées **au niveau du champ
 * concerné** plutôt que dans un message global.
 *
 * Les champs sont volontairement non contrôlés : la valeur est lue dans le
 * FormData à la soumission. Un champ rempli avant l'hydratation — par un
 * gestionnaire de mots de passe, par exemple — reste ainsi pris en compte.
 */

const CONTROL =
  'w-full rounded-control border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-adikom-500 disabled:bg-canvas disabled:text-muted'

const CONTROL_INVALID = 'border-danger focus:border-danger'

/** Regroupe des champs par thème (Design System §37). */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="border-b border-line py-6 first:pt-0 last:border-b-0 last:pb-0">
      <div className="mb-4">
        <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export function Field({
  label,
  name,
  error,
  hint,
  required,
  wide,
  children,
}: {
  label: string
  name: string
  error?: string
  hint?: string
  required?: boolean
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', wide && 'sm:col-span-2')}>
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-1 text-danger" title="Champ obligatoire" aria-hidden>
            *
          </span>
        )}
      </label>

      {children}

      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({
  name,
  error,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { name: string; error?: string }) {
  return (
    <input
      id={name}
      name={name}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${name}-error` : undefined}
      className={cn(CONTROL, error && CONTROL_INVALID, className)}
      {...props}
    />
  )
}

export function Select({
  name,
  error,
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { name: string; error?: string }) {
  return (
    <select
      id={name}
      name={name}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${name}-error` : undefined}
      className={cn(CONTROL, error && CONTROL_INVALID, className)}
      {...props}
    >
      {children}
    </select>
  )
}

export function Textarea({
  name,
  error,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { name: string; error?: string }) {
  return (
    <textarea
      id={name}
      name={name}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${name}-error` : undefined}
      className={cn(CONTROL, 'min-h-24 resize-y', error && CONTROL_INVALID, className)}
      {...props}
    />
  )
}

/** Case à cocher d'une liste à choix multiples (départements, groupes). */
export function CheckboxOption({
  name,
  value,
  label,
  description,
  defaultChecked,
}: {
  name: string
  value: string
  label: string
  description?: string
  defaultChecked?: boolean
}) {
  const id = `${name}-${value}`

  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line px-3.5 py-2.5 transition-colors hover:border-adikom-300 hover:bg-adikom-50/50 has-checked:border-adikom-400 has-checked:bg-adikom-50"
    >
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-adikom-500"
      />
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  )
}
