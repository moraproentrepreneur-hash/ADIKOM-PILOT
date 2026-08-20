'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Check, CheckCircle2, ChevronRight, Lock, Minus, ShieldAlert, X } from 'lucide-react'

import { Badge, EmptyState } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { updateUserPermissionsAction } from './actions'
import {
  CHOICE_LABELS,
  PERMISSION_FIELD_PREFIX,
  SOURCE_LABELS,
  type PermissionChoice,
  type PermissionSource,
} from './constants'
import type { PermissionEntry, PermissionOverview } from './data'

/**
 * Onglet « Permissions ».
 *
 * Présente l'arborescence Module → Menu → Sous-menu → Action exigée par le
 * Module 08 §19 et §20, en distinguant sans ambiguïté les quatre états prévus
 * au §48 : accordé, refusé, hérité, non défini.
 *
 * Seules les règles **individuelles** sont modifiables ici : `ALLOW`, `DENY`,
 * ou aucune règle, l'héritage des groupes s'appliquant alors. Les permissions
 * de groupe relèvent d'une étape ultérieure et ne sont pas touchées.
 *
 * Le formulaire n'est qu'un confort de saisie : la permission
 * `users.users.permissions.update` est revérifiée côté serveur, les policies
 * RLS s'appliquent à l'écriture, et la base interdit à quiconque de modifier
 * ses propres droits.
 */

type StateStyle = {
  label: string
  icon: typeof Check
  className: string
}

/** Un droit refusé explicitement n'est pas la même chose qu'un droit non défini. */
function describe(entry: PermissionEntry): StateStyle {
  if (entry.granted) {
    return {
      label: SOURCE_LABELS[entry.source],
      icon: Check,
      className: 'text-success',
    }
  }

  if (entry.source === 'USER_DENY' || entry.source === 'GROUP_DENY') {
    return {
      label: SOURCE_LABELS[entry.source],
      icon: X,
      className: 'text-danger',
    }
  }

  return {
    label: SOURCE_LABELS.NONE,
    icon: Minus,
    className: 'text-muted/60',
  }
}

function sourceBadge(source: PermissionSource) {
  if (source === 'GROUP_ALLOW') return <Badge tone="info">Hérité</Badge>
  if (source === 'USER_ALLOW') return <Badge tone="success">Individuel</Badge>
  if (source === 'SUPER_ADMIN') return <Badge tone="info">Super Admin</Badge>
  if (source === 'USER_DENY' || source === 'GROUP_DENY') return <Badge tone="danger">Refusé</Badge>
  return null
}

const CHOICES: PermissionChoice[] = ['INHERIT', 'ALLOW', 'DENY']

/** Tons du sélecteur, repris du Design System : succès, danger, neutre. */
const CHOICE_TONES: Record<PermissionChoice, string> = {
  INHERIT: 'peer-checked:bg-canvas peer-checked:text-ink peer-checked:border-line',
  ALLOW: 'peer-checked:bg-success-soft peer-checked:text-success peer-checked:border-success-soft',
  DENY: 'peer-checked:bg-danger-soft peer-checked:text-danger peer-checked:border-danger-soft',
}

/**
 * Sélecteur à trois positions, adossé à des boutons radio natifs : accessible
 * au clavier, lisible par un lecteur d'écran et fonctionnel avant hydratation.
 */
function ChoiceSelector({ entry }: { entry: PermissionEntry }) {
  const name = `${PERMISSION_FIELD_PREFIX}${entry.code}`
  const current: PermissionChoice = entry.userEffect ?? 'INHERIT'

  return (
    <fieldset className="shrink-0">
      <legend className="sr-only">{entry.label}</legend>
      <div className="flex rounded-control border border-line bg-white p-0.5">
        {CHOICES.map((choice) => (
          <label key={choice} className="relative">
            <input
              type="radio"
              name={name}
              value={choice}
              defaultChecked={current === choice}
              className="peer sr-only"
            />
            <span
              className={cn(
                'block cursor-pointer rounded-control border border-transparent px-2.5 py-1 text-xs font-medium text-muted transition-colors',
                'hover:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-adikom-500',
                CHOICE_TONES[choice]
              )}
            >
              {CHOICE_LABELS[choice]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function SaveBar({ dirtyHint }: { dirtyHint: string }) {
  const { pending } = useFormStatus()

  return (
    <div className="sticky bottom-0 -mx-px flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-muted">{dirtyHint}</p>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Enregistrement…' : 'Enregistrer les permissions'}
      </button>
    </div>
  )
}

export function PermissionsPanel({
  userId,
  overview,
  isSuperAdmin,
  editable,
  isSelf,
}: {
  userId: string
  overview: PermissionOverview
  isSuperAdmin: boolean
  editable: boolean
  isSelf: boolean
}) {
  const [state, formAction] = useActionState(updateUserPermissionsAction, {})

  if (!overview.readable) {
    return (
      <EmptyState
        icon={Lock}
        title="Permissions non consultables"
        description="Vous ne disposez pas des droits nécessaires pour consulter les permissions de cet utilisateur."
      />
    )
  }

  const tree = (
    <div className="space-y-2">
      {overview.modules.map((module) => (
        <details
          key={module.code}
          className="group rounded-control border border-line"
          open={module.granted > 0}
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-adikom-50/60">
            <ChevronRight
              className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-sm font-medium text-ink">{module.label}</span>
            {module.sensitiveGranted > 0 && (
              <ShieldAlert
                className="size-4 shrink-0 text-warning"
                aria-label={`${module.sensitiveGranted} permission(s) sensible(s) accordée(s)`}
              />
            )}
            <span
              className={cn(
                'shrink-0 text-xs tabular',
                module.granted === 0 ? 'text-muted/70' : 'text-adikom-500'
              )}
            >
              {module.granted} / {module.total}
            </span>
          </summary>

          <div className="border-t border-line">
            {module.branches.map((branch) => (
              <div key={branch.key} className="border-b border-line last:border-b-0">
                {(branch.menuLabel || branch.submenuLabel) && (
                  <p className="bg-canvas px-4 py-2 text-xs font-medium text-muted">
                    {branch.menuLabel}
                    {branch.submenuLabel && (
                      <>
                        <span className="mx-1.5 text-muted/50">›</span>
                        {branch.submenuLabel}
                      </>
                    )}
                  </p>
                )}

                <ul>
                  {branch.entries.map((entry) => {
                    const entryState = describe(entry)
                    const Icon = entryState.icon

                    return (
                      <li
                        key={entry.code}
                        className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-2.5 text-sm"
                      >
                        <Icon
                          className={cn('mt-0.5 size-4 shrink-0', entryState.className)}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn('block', entry.granted ? 'text-ink' : 'text-muted')}
                          >
                            {entry.label}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted/80">
                            {entry.actionLabel} · {entryState.label}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-1.5">
                          {entry.isSensitive && (
                            <Badge tone="warning" className="hidden sm:inline-flex">
                              Sensible
                            </Badge>
                          )}
                          {sourceBadge(entry.source)}
                        </span>

                        {editable && <ChoiceSelector entry={entry} />}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  )

  /* Pourquoi la modification n'est pas proposée, lorsque c'est le cas. */
  const readOnlyReason = isSuperAdmin
    ? 'Ce compte détient le rôle système Super Admin : ses droits ne dépendent d’aucune règle individuelle.'
    : isSelf
      ? 'Vous ne pouvez pas modifier vos propres droits d’accès.'
      : 'Consultation seule : vous ne disposez pas du droit de modifier les permissions.'

  return (
    <div className="space-y-4">
      {/* Synthèse */}
      <div className="rounded-control border border-line bg-adikom-50 px-4 py-3.5">
        {isSuperAdmin ? (
          <p className="text-sm text-ink">
            Ce compte détient le rôle système <strong>Super Admin</strong> : il dispose de
            l’accès complet aux {overview.total} permissions, indépendamment de tout groupe.
          </p>
        ) : (
          <p className="text-sm text-ink">
            <strong>{overview.granted}</strong> permission{overview.granted > 1 ? 's' : ''}{' '}
            accordée{overview.granted > 1 ? 's' : ''} sur {overview.total}
            {overview.sensitiveGranted > 0 && (
              <>
                {' '}
                — dont <strong>{overview.sensitiveGranted}</strong> sensible
                {overview.sensitiveGranted > 1 ? 's' : ''}
              </>
            )}
            .
          </p>
        )}
        <p className="mt-1.5 text-xs text-muted">
          {editable
            ? 'Les règles individuelles complètent l’héritage des groupes. « Non défini » laisse le groupe décider ; « Refuser » prime sur toute autorisation héritée.'
            : readOnlyReason}
        </p>
      </div>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control border border-danger-soft bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      {state.success && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control border border-success-soft bg-success-soft px-3.5 py-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.success}
        </p>
      )}

      {editable ? (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          {tree}
          <SaveBar dirtyHint="Les modifications ne sont appliquées qu’après enregistrement." />
        </form>
      ) : (
        tree
      )}
    </div>
  )
}
