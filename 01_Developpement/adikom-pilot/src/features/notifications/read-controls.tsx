'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Check, CheckCheck, LoaderCircle } from 'lucide-react'

import { FormFeedback } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE, type FormState } from '@/lib/form-state'
import { cn } from '@/lib/utils'

/**
 * Les deux gestes de lecture — Module 02 §19, §20.
 *
 * LA LECTURE EST UN ACTE EXPLICITE.
 *
 * §19 laisse le choix : une notification ouverte « PEUT être automatiquement
 * marquée comme lue selon le comportement UX retenu ». Le comportement retenu
 * est le marquage explicite, pour une raison tenue du même paragraphe : « une
 * notification importante ne doit pas disparaître simplement parce qu'elle a été
 * lue ». Ouvrir la location en retard ne la fait donc pas taire — c'est
 * l'utilisateur qui déclare l'avoir traitée.
 *
 * Aucun de ces boutons ne protège quoi que ce soit : le serveur vérifie la
 * capacité, et n'accepte que les clés de la veille de l'appelant.
 */

/* -------------------------------------------------------------------------- */
/*  Une notification                                                           */
/* -------------------------------------------------------------------------- */

export function MarkReadButton({
  notificationKey,
  action,
}: {
  notificationKey: string
  action: (state: FormState, formData: FormData) => Promise<FormState>
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, EMPTY_FORM_STATE)

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="cle" value={notificationKey} />
      <CompactButton label="Marquer comme lu" icon="one" />
      {state.error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Toutes les notifications                                                   */
/* -------------------------------------------------------------------------- */

export function MarkAllReadButton({
  unread,
  action,
}: {
  unread: number
  action: (state: FormState, formData: FormData) => Promise<FormState>
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, EMPTY_FORM_STATE)

  return (
    <div className="w-full sm:w-auto">
      <form action={formAction}>
        <CompactButton
          label={`Tout marquer comme lu (${unread})`}
          icon="all"
          disabled={unread === 0}
        />
      </form>
      <FormFeedback error={state.error} success={state.success} className="mt-2" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Un bouton discret, jamais inerte pendant l'envoi (§38 de CLAUDE.md).
 *
 * Le composant est distinct de `SubmitButton` : celui-ci porte la taille et le
 * ton d'un bouton principal, alors qu'une ligne de notification en compte un par
 * ligne. C'est une variante de taille, pas un second bouton.
 */
function CompactButton({
  label,
  icon,
  disabled,
}: {
  label: string
  icon: 'one' | 'all'
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  const Icon = icon === 'all' ? CheckCheck : Check

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-control border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-muted transition-colors',
        'hover:border-adikom-300 hover:text-adikom-500',
        'disabled:cursor-not-allowed disabled:opacity-60'
      )}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-3.5" aria-hidden />
      )}
      {pending ? 'Enregistrement…' : label}
    </button>
  )
}
