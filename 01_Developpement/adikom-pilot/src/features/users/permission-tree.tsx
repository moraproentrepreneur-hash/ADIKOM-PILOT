'use client'

import { useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { ChevronRight, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { PERMISSION_FIELD_PREFIX, type PermissionChoice } from './constants'

/**
 * Arborescence des permissions — Module 08 §19, §20, §47.
 *
 * Une seule et même arborescence sert la fiche UTILISATEUR et la fiche GROUPE.
 * Les deux présentent Module → Menu → Sous-menu → Action, les deux offrent le
 * même sélecteur à trois positions, les deux affichent le même décompte.
 *
 * Ce qui les distingue n'est pas la présentation, c'est la SÉMANTIQUE d'une
 * case : côté utilisateur, « non défini » laisse l'héritage des groupes
 * s'appliquer ; côté groupe, il n'y a rien à hériter, la règle est simplement
 * absente. Cette différence vit dans la fonction `describe` que chaque panneau
 * fournit — jamais dans deux composants presque identiques (CLAUDE.md §37).
 *
 * Le formulaire n'est qu'un confort de saisie. Les capacités sont revérifiées
 * côté serveur, les policies RLS s'appliquent à l'écriture, et la base interdit
 * à quiconque de toucher aux droits dont il dépend.
 */

/** Ce que l'arborescence a besoin de savoir d'une permission pour l'afficher. */
export type TreeEntry = {
  code: string
  label: string
  actionLabel: string
  isSensitive: boolean
}

export type TreeBranch = {
  key: string
  menuLabel: string | null
  submenuLabel: string | null
  entries: TreeEntry[]
}

export type TreeModule = {
  code: string
  label: string
  total: number
  branches: TreeBranch[]
}

/** Verdict affiché pour une permission, tel que le panneau appelant l'établit. */
export type EntryState = {
  /** Compté dans les totaux, et coloré comme un droit ouvert. */
  granted: boolean
  /** Origine ou nature du droit, en toutes lettres. */
  caption: string
  icon: LucideIcon
  className: string
  badge?: ReactNode
}

export type Choices = Record<string, PermissionChoice>

const CHOICES: PermissionChoice[] = ['INHERIT', 'ALLOW', 'DENY']

/** Tons du sélecteur, repris du Design System : neutre, succès, danger. */
const CHOICE_TONES: Record<PermissionChoice, string> = {
  INHERIT: 'bg-canvas text-ink border-line',
  ALLOW: 'bg-success-soft text-success border-success-soft',
  DENY: 'bg-danger-soft text-danger border-danger-soft',
}

/**
 * Sélecteur à trois positions, adossé à des boutons radio natifs : accessible
 * au clavier et annoncé correctement par un lecteur d'écran.
 */
export function ChoiceSelector({
  entry,
  choice,
  labels,
  onChange,
}: {
  entry: TreeEntry
  choice: PermissionChoice
  labels: Record<PermissionChoice, string>
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
              {labels[option]}
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
 * « Tout refuser » remplace les décisions existantes de la section : l'action
 * est confirmée avant d'être appliquée. « Tout accorder » n'est pas destructif
 * au même titre, mais suit la même mécanique pour rester prévisible.
 */
export function BulkActions({
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
            pendingChoice === 'DENY' ? 'bg-danger hover:opacity-90' : 'bg-adikom-500 hover:bg-adikom-600'
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

export function SaveBar({ dirty, label }: { dirty: number; label: string }) {
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
        {pending ? 'Enregistrement…' : label}
      </button>
    </div>
  )
}

export function PermissionTree({
  modules,
  choices,
  describe,
  editable,
  choiceLabels,
  onChange,
  onApplyToModule,
}: {
  modules: readonly TreeModule[]
  choices: Choices
  /** Verdict affiché pour une permission, selon le choix courant. */
  describe: (entry: TreeEntry, choice: PermissionChoice) => EntryState
  editable: boolean
  choiceLabels: Record<PermissionChoice, string>
  onChange: (code: string, choice: PermissionChoice) => void
  onApplyToModule: (moduleTree: TreeModule, choice: PermissionChoice) => void
}) {
  return (
    <div className="space-y-2">
      {modules.map((moduleTree) => {
        /*
         * Les décomptes se refont à chaque rendu plutôt que d'être transmis :
         * un total tenu à part serait faux au premier oubli, et un total faux
         * fait autorité plus longtemps qu'un total absent (DEC-034 §a).
         */
        let granted = 0
        let sensitive = 0
        for (const branch of moduleTree.branches) {
          for (const entry of branch.entries) {
            const state = describe(entry, choices[entry.code] ?? 'INHERIT')
            if (state.granted) {
              granted += 1
              if (entry.isSensitive) sensitive += 1
            }
          }
        }

        return (
          <details
            key={moduleTree.code}
            className="group rounded-control border border-line"
            open={granted > 0}
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-adikom-50/60">
              <ChevronRight
                className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-sm font-medium text-ink">{moduleTree.label}</span>

              {editable && (
                <BulkActions
                  moduleLabel={moduleTree.label}
                  onApply={(choice) => onApplyToModule(moduleTree, choice)}
                />
              )}

              {sensitive > 0 && (
                <ShieldAlert
                  className="size-4 shrink-0 text-warning"
                  aria-label={`${sensitive} permission(s) sensible(s) accordée(s)`}
                />
              )}
              <span
                className={cn(
                  'shrink-0 text-xs tabular',
                  granted === 0 ? 'text-muted/70' : 'text-adikom-500'
                )}
              >
                {granted} / {moduleTree.total}
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
                      const state = describe(entry, choice)
                      const Icon = state.icon

                      return (
                        <li
                          key={entry.code}
                          className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-2.5 text-sm"
                        >
                          <Icon
                            className={cn('mt-0.5 size-4 shrink-0', state.className)}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className={cn('block', state.granted ? 'text-ink' : 'text-muted')}>
                              {entry.label}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted/80">
                              {entry.actionLabel} · {state.caption}
                            </span>
                          </span>

                          <span className="flex shrink-0 items-center gap-1.5">
                            {entry.isSensitive && (
                              <Badge tone="warning" className="hidden sm:inline-flex">
                                Sensible
                              </Badge>
                            )}
                            {state.badge}
                          </span>

                          {editable && (
                            <ChoiceSelector
                              entry={entry}
                              choice={choice}
                              labels={choiceLabels}
                              onChange={(next) => onChange(entry.code, next)}
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
}
