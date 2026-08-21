'use client'

import { useActionState, useState } from 'react'
import { Pencil, Plus, Power, PowerOff, Tags } from 'lucide-react'

import { Badge, EmptyState } from '@/components/ui/primitives'
import { FormFeedback } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatDate } from '@/lib/dates'
import { togglePricingRuleAction, type PricingFormState } from './actions'
import { PricingRuleForm } from './rule-form'
import { formatDiscount, formatPrice } from './constants'
import type { PricingRuleRow } from './data'

type Option = { id: string; label: string }

/**
 * Conditions tarifaires d'un client, ou grille standard.
 *
 * Les deux usages partagent le même panneau : la seule différence est la
 * présence d'un client, qui autorise l'expression d'une remise.
 */
export function PricingRulesPanel({
  rules,
  categories,
  vehicles,
  clientId,
  editable,
}: {
  rules: PricingRuleRow[]
  categories: Option[]
  vehicles: Option[]
  clientId?: string
  editable: boolean
}) {
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const editingRule = rules.find((rule) => rule.id === editingId)

  if (creating || editingRule) {
    return (
      <div>
        <h3 className="mb-4 font-display text-sm font-semibold text-ink">
          {editingRule ? 'Modifier le tarif' : 'Nouveau tarif'}
        </h3>
        <PricingRuleForm
          clientId={clientId}
          categories={categories}
          vehicles={vehicles}
          rule={editingRule}
          onFinished={() => {
            setCreating(false)
            setEditingId(null)
          }}
        />
      </div>
    )
  }

  if (rules.length === 0) {
    return (
      <EmptyState
        icon={Tags}
        title={clientId ? 'Aucune condition tarifaire' : 'Aucun tarif standard'}
        description={
          clientId
            ? 'Ce client se voit appliquer le tarif standard. Ajoutez une condition pour lui accorder un tarif préférentiel.'
            : 'Aucun tarif n’est configuré. Une location ne pourra pas être valorisée tant qu’aucun tarif n’existe.'
        }
        action={
          editable ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              <Plus className="size-4" aria-hidden />
              Ajouter un tarif
            </button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      {editable && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
        >
          <Plus className="size-4" aria-hidden />
          Ajouter un tarif
        </button>
      )}

      <ul className="space-y-3">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className="rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink tabular">
                  {rule.amount != null && rule.unit
                    ? formatPrice(rule.amount, rule.unit)
                    : rule.discountPercent != null
                      ? `Remise de ${formatDiscount(rule.discountPercent)}`
                      : '—'}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {rule.vehicleLabel
                    ? `Véhicule : ${rule.vehicleLabel}`
                    : rule.categoryLabel
                      ? `Catégorie : ${rule.categoryLabel}`
                      : 'Tous les véhicules'}
                  {rule.clientLabel && !clientId ? ` · ${rule.clientLabel}` : ''}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {rule.validFrom || rule.validTo
                    ? `Valable ${rule.validFrom ? `du ${formatDate(rule.validFrom)}` : ''}${
                        rule.validTo ? ` au ${formatDate(rule.validTo)}` : ' sans date de fin'
                      }`
                    : 'Condition permanente'}
                </p>
                {rule.conditions && (
                  <p className="mt-1.5 text-xs text-muted italic">{rule.conditions}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {rule.isActive ? (
                  <Badge tone="success">Actif</Badge>
                ) : (
                  <Badge tone="neutral">Désactivé</Badge>
                )}

                {editable && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditingId(rule.id)}
                      className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Modifier
                    </button>
                    <ToggleRuleButton rule={rule} clientId={clientId} />
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted">
        Lorsqu’un client dispose de plusieurs conditions, le tarif le plus spécifique s’applique :
        client + véhicule, puis client + catégorie, puis client, puis les tarifs standard. À
        spécificité égale, le plus récent l’emporte.
      </p>
    </div>
  )
}

/**
 * Désactivation d'une condition.
 * Un tarif ne se supprime pas : les opérations passées doivent rester
 * explicables (Tiers §6.7).
 */
function ToggleRuleButton({ rule, clientId }: { rule: PricingRuleRow; clientId?: string }) {
  const [state, formAction] = useActionState<PricingFormState, FormData>(
    togglePricingRuleAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="ruleId" value={rule.id} />
      <input type="hidden" name="clientId" value={clientId ?? rule.clientId ?? ''} />
      <input type="hidden" name="activate" value={rule.isActive ? '0' : '1'} />

      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
      >
        {rule.isActive ? (
          <>
            <PowerOff className="size-3.5" aria-hidden />
            Désactiver
          </>
        ) : (
          <>
            <Power className="size-3.5" aria-hidden />
            Réactiver
          </>
        )}
      </button>

      {state.error && <FormFeedback error={state.error} />}
    </form>
  )
}
