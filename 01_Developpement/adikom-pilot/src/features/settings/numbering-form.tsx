'use client'

import { useActionState, useState } from 'react'
import { Save } from 'lucide-react'

import { Badge } from '@/components/ui/primitives'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { updateNumberingRule } from './actions'
import { previewNumber, type NumberingRule } from './constants'

/**
 * Format d'une numérotation — Module 09 §15 à §17, DEC-005.
 *
 * LE COMPTEUR N'EST PAS UN CHAMP. Il est affiché, jamais saisi : §16 interdit
 * la réutilisation d'un numéro, et le remettre en arrière ferait rééditer des
 * références déjà portées par des factures. `fn_numbering_rules_write_guard`
 * le refuse en base, y compris par appel direct — l'absence de champ n'est
 * qu'un confort de lecture.
 *
 * L'APERÇU SE MET À JOUR À LA SAISIE, ce qui n'est pas un ornement : un format
 * de référence se juge sur ce qu'il produit, pas sur la valeur de ses réglages.
 */
export function NumberingRuleForm({
  rule,
  year,
  canUpdate,
}: {
  rule: NumberingRule
  /** Année civile d'ADIKOM, calculée côté serveur (DEC-025 §e). */
  year: number
  canUpdate: boolean
}) {
  const [state, action] = useActionState(updateNumberingRule, EMPTY_FORM_STATE)

  const [draft, setDraft] = useState({
    prefix: rule.prefix,
    separator: rule.separator,
    padding: String(rule.padding),
    includeYear: rule.includeYear,
    resetYearly: rule.resetYearly,
  })

  const padding = Number(draft.padding)
  const preview = previewNumber(
    {
      prefix: draft.prefix || '?',
      separator: draft.separator,
      padding: Number.isFinite(padding) && padding >= 1 && padding <= 12 ? padding : rule.padding,
      includeYear: draft.includeYear,
      resetYearly: draft.resetYearly,
      currentYear: rule.currentYear,
      currentValue: rule.currentValue,
    },
    year
  )

  const incoherent = draft.resetYearly && !draft.includeYear

  return (
    <li className="rounded-control border border-line p-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="entity_key" value={rule.entityKey} />

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-ink">{rule.label}</h3>
          <Badge tone="info">
            <span className="tabular">{preview}</span>
          </Badge>
        </div>

        <FormFeedback error={state.error} success={state.success} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor={`prefix-${rule.entityKey}`} className="block text-xs text-muted">
              Préfixe
            </label>
            <Input
              id={`prefix-${rule.entityKey}`}
              name="prefix"
              value={draft.prefix}
              disabled={!canUpdate}
              maxLength={12}
              error={state.fieldErrors?.prefix}
              onChange={(event) => setDraft({ ...draft, prefix: event.currentTarget.value })}
            />
            {state.fieldErrors?.prefix && (
              <p className="text-xs text-danger">{state.fieldErrors.prefix}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor={`separator-${rule.entityKey}`} className="block text-xs text-muted">
              Séparateur
            </label>
            <Input
              id={`separator-${rule.entityKey}`}
              name="separator"
              value={draft.separator}
              disabled={!canUpdate}
              maxLength={2}
              error={state.fieldErrors?.separator}
              onChange={(event) => setDraft({ ...draft, separator: event.currentTarget.value })}
            />
            {state.fieldErrors?.separator && (
              <p className="text-xs text-danger">{state.fieldErrors.separator}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor={`padding-${rule.entityKey}`} className="block text-xs text-muted">
              Longueur du compteur
            </label>
            <Input
              id={`padding-${rule.entityKey}`}
              name="padding"
              type="number"
              min={1}
              max={12}
              value={draft.padding}
              disabled={!canUpdate}
              error={state.fieldErrors?.padding}
              onChange={(event) => setDraft({ ...draft, padding: event.currentTarget.value })}
            />
            {state.fieldErrors?.padding && (
              <p className="text-xs text-danger">{state.fieldErrors.padding}</p>
            )}
          </div>

          <div className="space-y-2 pt-5">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="include_year"
                checked={draft.includeYear}
                disabled={!canUpdate}
                className="size-4 accent-adikom-500"
                onChange={(event) =>
                  setDraft({ ...draft, includeYear: event.currentTarget.checked })
                }
              />
              Année dans la référence
            </label>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="reset_yearly"
                checked={draft.resetYearly}
                disabled={!canUpdate}
                className="size-4 accent-adikom-500"
                onChange={(event) =>
                  setDraft({ ...draft, resetYearly: event.currentTarget.checked })
                }
              />
              Remise à zéro annuelle
            </label>
          </div>
        </div>

        {incoherent && (
          <p className="text-sm text-danger">
            Une remise à zéro annuelle exige que l’année figure dans la référence : sans elle, deux
            documents porteraient le même numéro à un an d’intervalle.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Dernier numéro émis :{' '}
            <span className="tabular text-ink">
              {rule.currentValue.toLocaleString('fr-FR')}
            </span>
            {rule.currentYear !== null && <> · exercice {rule.currentYear}</>}
            <span className="mt-0.5 block">
              Le compteur ne se modifie pas : un numéro ne se réutilise jamais (§16).
            </span>
          </p>

          {canUpdate && <SubmitButton label="Enregistrer le format" icon={Save} />}
        </div>
      </form>
    </li>
  )
}
