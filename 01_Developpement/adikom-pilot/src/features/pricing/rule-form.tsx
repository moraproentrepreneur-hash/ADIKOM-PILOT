'use client'

import { useActionState, useState } from 'react'
import { Tags } from 'lucide-react'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { createPricingRuleAction, updatePricingRuleAction, type PricingFormState } from './actions'
import {
  MODE_LABELS,
  SCOPE_LABELS,
  UNIT_HELP,
  UNIT_LABELS,
  type PricingMode,
  type PricingScope,
  type PricingUnit,
} from './constants'
import type { PricingRuleRow } from './data'

type Option = { id: string; label: string }

/**
 * Saisie d'une règle tarifaire.
 *
 * Les contrôles reproduits ici — portée exclusive, montant OU remise, unité
 * obligatoire — sont exactement ceux que la base garantit (migration 017). Ils
 * ne la remplacent pas : ils évitent qu'elle ait à parler à l'utilisateur.
 *
 * La remise n'est proposée que pour un client : elle s'applique à un tarif de
 * référence, et un tarif standard n'en a pas.
 */
export function PricingRuleForm({
  clientId,
  categories,
  vehicles,
  rule,
  onFinished,
}: {
  /** Fixé lorsque le formulaire est ouvert depuis la fiche d'un client. */
  clientId?: string
  categories: Option[]
  vehicles: Option[]
  rule?: PricingRuleRow
  onFinished?: () => void
}) {
  const editing = Boolean(rule)
  const action = editing ? updatePricingRuleAction : createPricingRuleAction

  const [state, formAction] = useActionState<PricingFormState, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData)
      if (result.success && onFinished) onFinished()
      return result
    },
    EMPTY_FORM_STATE
  )

  const initialScope: PricingScope = rule?.vehicleId
    ? 'VEHICLE'
    : rule?.categoryId
      ? 'CATEGORY'
      : 'GLOBAL'

  const [scope, setScope] = useState<PricingScope>(initialScope)
  const [mode, setMode] = useState<PricingMode>(
    rule?.discountPercent !== null && rule?.discountPercent !== undefined ? 'DISCOUNT' : 'AMOUNT'
  )

  const effectiveClientId = clientId ?? rule?.clientId ?? ''
  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      {rule && <input type="hidden" name="ruleId" value={rule.id} />}
      <input type="hidden" name="clientId" value={effectiveClientId} />

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection
        title="Portée"
        description={
          effectiveClientId
            ? 'Ce tarif ne s’appliquera qu’à ce client.'
            : 'Ce tarif s’appliquera à tous les clients sans condition particulière.'
        }
      >
        <Field label="S’applique à" name="scope" required>
          <Select
            name="scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as PricingScope)}
          >
            {(Object.keys(SCOPE_LABELS) as PricingScope[]).map((value) => (
              <option key={value} value={value}>
                {SCOPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        {scope === 'CATEGORY' && (
          <Field label="Catégorie" name="categoryId" required error={errors.categoryId}>
            <Select
              name="categoryId"
              defaultValue={rule?.categoryId ?? ''}
              error={errors.categoryId}
            >
              <option value="">Choisir une catégorie…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {scope === 'VEHICLE' && (
          <Field label="Véhicule" name="vehicleId" required error={errors.vehicleId}>
            <Select name="vehicleId" defaultValue={rule?.vehicleId ?? ''} error={errors.vehicleId}>
              <option value="">Choisir un véhicule…</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </FormSection>

      <FormSection title="Tarif">
        {effectiveClientId ? (
          <Field label="Exprimé en" name="mode" required>
            <Select
              name="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as PricingMode)}
              error={errors.clientId}
            >
              {(Object.keys(MODE_LABELS) as PricingMode[]).map((value) => (
                <option key={value} value={value}>
                  {MODE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          /* Un tarif standard s'exprime toujours en montant : il est
             lui-même la référence sur laquelle une remise s'appliquerait. */
          <input type="hidden" name="mode" value="AMOUNT" />
        )}

        {mode === 'AMOUNT' || !effectiveClientId ? (
          <>
            <Field
              label="Montant"
              name="amount"
              required
              error={errors.amount}
              hint="En francs comoriens, sans décimale."
            >
              <Input
                name="amount"
                inputMode="numeric"
                defaultValue={rule?.amount != null ? String(rule.amount) : ''}
                placeholder="500 000"
                error={errors.amount}
                className="tabular"
              />
            </Field>

            <Field label="Unité" name="unit" required error={errors.unit} hint={UNIT_HELP[
              (rule?.unit ?? 'DAY') as PricingUnit
            ]}>
              <Select name="unit" defaultValue={rule?.unit ?? 'DAY'} error={errors.unit}>
                {(Object.keys(UNIT_LABELS) as PricingUnit[]).map((value) => (
                  <option key={value} value={value}>
                    {UNIT_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <Field
            label="Remise"
            name="discountPercent"
            required
            error={errors.discountPercent ?? errors.clientId}
            hint="Pourcentage appliqué au tarif standard applicable au moment de la location."
          >
            <Input
              name="discountPercent"
              inputMode="decimal"
              defaultValue={rule?.discountPercent != null ? String(rule.discountPercent) : ''}
              placeholder="10"
              error={errors.discountPercent}
              className="tabular"
            />
          </Field>
        )}
      </FormSection>

      <FormSection
        title="Validité"
        description="Sans date de fin, la condition est permanente. Une condition expirée n’est plus appliquée."
      >
        <Field label="À partir du" name="validFrom" error={errors.validFrom}>
          <Input
            name="validFrom"
            type="date"
            defaultValue={rule?.validFrom ?? ''}
            error={errors.validFrom}
          />
        </Field>

        <Field label="Jusqu’au" name="validTo" error={errors.validTo}>
          <Input name="validTo" type="date" defaultValue={rule?.validTo ?? ''} error={errors.validTo} />
        </Field>

        <Field label="Conditions particulières" name="conditions" error={errors.conditions} wide>
          <Textarea
            name="conditions"
            defaultValue={rule?.conditions ?? ''}
            placeholder="Accord commercial, contrepartie, durée minimale…"
            error={errors.conditions}
          />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <SubmitButton label={editing ? 'Enregistrer le tarif' : 'Ajouter le tarif'} icon={Tags} />
        {onFinished && (
          <button
            type="button"
            onClick={onFinished}
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  )
}
