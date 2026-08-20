'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Lock,
  Minus,
  ShieldAlert,
  X,
} from 'lucide-react'

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
import type { PermissionEntry, PermissionModuleTree, PermissionOverview } from './data'

/**
 * Onglet « Permissions ».
 *
 * Présente l'arborescence Module → Menu → Sous-menu → Action exigée par le
 * Module 08 §19 et §20, en distinguant sans ambiguïté les quatre états prévus
 * au §48 : accordé, refusé, hérité, non défini.
 *
 * Seules les règles **individuelles** sont modifiables ici : `ALLOW`, `DENY`,
 * ou aucune règle, l'héritage des groupes s'appliquant alors. Les permissions
 * de groupe ne sont jamais touchées, et l'origine d'un droit reste lisible.
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

/**
 * Résultat effectif d'une permission pour un choix individuel donné.
 *
 * Reproduit la précédence de `effective_permissions` :
 * refus individuel > refus hérité > autorisation individuelle > autorisation
 * héritée > aucun droit.
 */
function resolve(entry: PermissionEntry, choice: PermissionChoice): boolean {
  if (choice === 'DENY') return false
  if (entry.inheritedEffect === 'DENY') return false
  if (choice === 'ALLOW') return true
  return entry.inheritedEffect === 'ALLOW'
}

/** Origine du droit, recalculée avec la même précédence. */
function resolveSource(entry: PermissionEntry, choice: PermissionChoice): PermissionSource {
  if (choice === 'DENY') return 'USER_DENY'
  if (entry.inheritedEffect === 'DENY') return 'GROUP_DENY'
  if (choice === 'ALLOW') return 'USER_ALLOW'
  if (entry.inheritedEffect === 'ALLOW') return 'GROUP_ALLOW'
  return 'NONE'
}

/** Un droit refusé explicitement n'est pas la même chose qu'un droit non défini. */
function describe(granted: boolean, source: PermissionSource): StateStyle {
  if (granted) {
    return { label: SOURCE_LABELS[source], icon: Check, className: 'text-success' }
  }

  if (source === 'USER_DENY' || source === 'GROUP_DENY') {
    return { label: SOURCE_LABELS[source], icon: X, className: 'text-danger' }
  }

  return { label: SOURCE_LABELS.NONE, icon: Minus, className: 'text-muted/60' }
}

function sourceBadge(source: PermissionSource) {
  if (source === 'GROUP_ALLOW') return <Badge tone="info">Hérité</Badge>
  if (source === 'USER_ALLOW') return <Badge tone="success">Individuel</Badge>
  if (source === 'SUPER_ADMIN') return <Badge tone="info">Super Admin</Badge>
  if (source === 'USER_DENY') return <Badge tone="danger">Refusé</Badge>
  if (source === 'GROUP_DENY') return <Badge tone="danger">Refusé (groupe)</Badge>
  return null
}

const CHOICES: PermissionChoice[] = ['INHERIT', 'ALLOW', 'DENY']

/** Tons du sélecteur, repris du Design System : neutre, succès, danger. */
const CHOICE_TONES: Record<PermissionChoice, string> = {
  INHERIT: 'bg-canvas text-ink border-line',
  ALLOW: 'bg-success-soft text-success border-success-soft',
  DENY: 'bg-danger-soft text-danger border-danger-soft',
}

type Choices = Record<string, PermissionChoice>

/**
 * Sélecteur à trois positions, adossé à des boutons radio natifs : accessible
 * au clavier et annoncé correctement par un lecteur d'écran.
 */
function ChoiceSelector({
  entry,
  choice,
  onChange,
}: {
  entry: PermissionEntry
  choice: PermissionChoice
  onChange: (next: PermissionChoice) => void
}) {
  const name = `${PERMISSION_FIELD_PREFIX}${entry.code}`

  return (
    <fieldset className="shrink-0">
      <legend className="sr-only">{entry.label}</legend>
      <div className="flex rounded-control border border-line bg-white p-0.5">
        {CHOICES.map((option) => (
          <label key={option} className="relative">
            <input
              type="radio"
              name={name}
              value={option}
              checked={choice === option}
              onChange={() => onChange(option)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'block cursor-pointer rounded-control border border-transparent px-2.5 py-1 text-xs font-medium text-muted transition-colors',
                'hover:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-adikom-500',
                choice === option && CHOICE_TONES[option]
              )}
            >
              {CHOICE_LABELS[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Actions globales d'un bloc.
 *
 * « Tout refuser » remplace les décisions individuelles existantes de la
 * section : l'action est confirmée avant d'être appliquée. « Tout accorder »
 * n'est pas destructif au même titre, mais suit la même mécanique pour rester
 * prévisible.
 */
function BulkActions({
  moduleLabel,
  onApply,
}: {
  moduleLabel: string
  onApply: (choice: PermissionChoice) => void
}) {
  const [pendingChoice, setPendingChoice] = useState<PermissionChoice | null>(null)

  const stop = (event: React.MouseEvent) => {
    // Les boutons vivent dans le <summary> : sans cela, chaque clic replierait
    // ou déplierait le module.
    event.preventDefault()
    event.stopPropagation()
  }

  if (pendingChoice) {
    return (
      <span className="flex flex-wrap items-center gap-2" onClick={stop}>
        <span className="text-xs text-muted">
          {pendingChoice === 'DENY'
            ? 'Refuser toutes les permissions de cette section ?'
            : 'Accorder toutes les permissions de cette section ?'}
        </span>
        <button
          type="button"
          onClick={(event) => {
            stop(event)
            onApply(pendingChoice)
            setPendingChoice(null)
          }}
          className={cn(
            'rounded-control px-2.5 py-1 text-xs font-medium text-white transition-colors',
            pendingChoice === 'DENY'
              ? 'bg-danger hover:opacity-90'
              : 'bg-adikom-500 hover:bg-adikom-600'
          )}
        >
          Confirmer
        </button>
        <button
          type="button"
          onClick={(event) => {
            stop(event)
            setPendingChoice(null)
          }}
          className="rounded-control border border-line px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-adikom-50"
        >
          Annuler
        </button>
      </span>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5" onClick={stop}>
      <button
        type="button"
        onClick={(event) => {
          stop(event)
          setPendingChoice('ALLOW')
        }}
        aria-label={`Tout accorder — ${moduleLabel}`}
        className="rounded-control border border-line px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-success-soft hover:bg-success-soft hover:text-success"
      >
        Tout accorder
      </button>
      <button
        type="button"
        onClick={(event) => {
          stop(event)
          setPendingChoice('DENY')
        }}
        aria-label={`Tout refuser — ${moduleLabel}`}
        className="rounded-control border border-line px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-danger-soft hover:bg-danger-soft hover:text-danger"
      >
        Tout refuser
      </button>
    </span>
  )
}

function SaveBar({ dirty }: { dirty: number }) {
  const { pending } = useFormStatus()

  return (
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-muted">
        {dirty === 0
          ? 'Aucune modification en attente.'
          : `${dirty} modification${dirty > 1 ? 's' : ''} en attente d’enregistrement.`}
      </p>
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

/** Choix initiaux, tels qu'enregistrés en base. */
function initialChoices(modules: PermissionModuleTree[]): Choices {
  const choices: Choices = {}
  for (const moduleTree of modules) {
    for (const branch of moduleTree.branches) {
      for (const entry of branch.entries) {
        choices[entry.code] = entry.userEffect ?? 'INHERIT'
      }
    }
  }
  return choices
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

  // `key` change à chaque rechargement de la fiche : l'état repart des valeurs
  // enregistrées après un succès, sans effet de synchronisation manuelle.
  const [choices, setChoices] = useState<Choices>(() => initialChoices(overview.modules))

  const baseline = useMemo(() => initialChoices(overview.modules), [overview.modules])

  /* Comptes recalculés à chaque saisie, sans aller-retour serveur. */
  const counts = useMemo(() => {
    const perModule = new Map<string, { granted: number; sensitiveGranted: number }>()
    let granted = 0
    let sensitiveGranted = 0
    let dirty = 0

    for (const moduleTree of overview.modules) {
      let moduleGranted = 0
      let moduleSensitive = 0

      for (const branch of moduleTree.branches) {
        for (const entry of branch.entries) {
          const choice = choices[entry.code] ?? 'INHERIT'
          if (choice !== baseline[entry.code]) dirty += 1

          const isGranted = isSuperAdmin || resolve(entry, choice)
          if (isGranted) {
            moduleGranted += 1
            granted += 1
            if (entry.isSensitive) {
              moduleSensitive += 1
              sensitiveGranted += 1
            }
          }
        }
      }

      perModule.set(moduleTree.code, {
        granted: moduleGranted,
        sensitiveGranted: moduleSensitive,
      })
    }

    return { perModule, granted, sensitiveGranted, dirty }
  }, [overview.modules, choices, baseline, isSuperAdmin])

  if (!overview.readable) {
    return (
      <EmptyState
        icon={Lock}
        title="Permissions non consultables"
        description="Vous ne disposez pas des droits nécessaires pour consulter les permissions de cet utilisateur."
      />
    )
  }

  /** Applique un choix à toutes les permissions d'un module. */
  function applyToModule(moduleTree: PermissionModuleTree, choice: PermissionChoice) {
    setChoices((current) => {
      const next = { ...current }
      for (const branch of moduleTree.branches) {
        for (const entry of branch.entries) {
          next[entry.code] = choice
        }
      }
      return next
    })
  }

  const tree = (
    <div className="space-y-2">
      {overview.modules.map((moduleTree) => {
        const count = counts.perModule.get(moduleTree.code) ?? {
          granted: 0,
          sensitiveGranted: 0,
        }

        return (
          <details
            key={moduleTree.code}
            className="group rounded-control border border-line"
            open={moduleTree.granted > 0}
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-adikom-50/60">
              <ChevronRight
                className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                {moduleTree.label}
              </span>

              {editable && (
                <BulkActions
                  moduleLabel={moduleTree.label}
                  onApply={(choice) => applyToModule(moduleTree, choice)}
                />
              )}

              {count.sensitiveGranted > 0 && (
                <ShieldAlert
                  className="size-4 shrink-0 text-warning"
                  aria-label={`${count.sensitiveGranted} permission(s) sensible(s) accordée(s)`}
                />
              )}
              <span
                className={cn(
                  'shrink-0 text-xs tabular',
                  count.granted === 0 ? 'text-muted/70' : 'text-adikom-500'
                )}
              >
                {count.granted} / {moduleTree.total}
              </span>
            </summary>

            <div className="border-t border-line">
              {moduleTree.branches.map((branch) => (
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
                      const choice = choices[entry.code] ?? 'INHERIT'
                      const granted = isSuperAdmin || resolve(entry, choice)
                      const source = isSuperAdmin
                        ? 'SUPER_ADMIN'
                        : resolveSource(entry, choice)
                      const entryState = describe(granted, source)
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
                            <span className={cn('block', granted ? 'text-ink' : 'text-muted')}>
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
                            {sourceBadge(source)}
                          </span>

                          {editable && (
                            <ChoiceSelector
                              entry={entry}
                              choice={choice}
                              onChange={(next) =>
                                setChoices((current) => ({ ...current, [entry.code]: next }))
                              }
                            />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )
      })}
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
            <strong>{counts.granted}</strong> permission{counts.granted > 1 ? 's' : ''}{' '}
            accordée{counts.granted > 1 ? 's' : ''} sur {overview.total}
            {counts.sensitiveGranted > 0 && (
              <>
                {' '}
                — dont <strong>{counts.sensitiveGranted}</strong> sensible
                {counts.sensitiveGranted > 1 ? 's' : ''}
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

      {editable && counts.dirty > 0 && (
        <p className="flex items-start gap-2 rounded-control border border-warning-soft bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Les compteurs ci-dessous reflètent vos choix en cours. Ils ne prendront effet
          qu’après enregistrement.
        </p>
      )}

      {editable ? (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          {tree}
          <SaveBar dirty={counts.dirty} />
        </form>
      ) : (
        tree
      )}
    </div>
  )
}
