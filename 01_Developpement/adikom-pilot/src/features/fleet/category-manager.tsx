'use client'

import { useActionState, useState } from 'react'
import { Archive, Layers, Plus, Power } from 'lucide-react'

import { Badge, EmptyState } from '@/components/ui/primitives'
import { Field, FormSection, Input, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { createCategoryAction, toggleCategoryAction, type FleetFormState } from './actions'
import type { CategoryRow } from './data'

/**
 * Catégories du parc.
 *
 * Une catégorie porte des caractéristiques tarifaires : elle peut être la cible
 * d'un tarif standard comme d'une condition préférentielle
 * (03_Modules/05_Gestion_de_Location.md §10).
 *
 * Une catégorie ne se supprime pas : elle s'archive. Des véhicules et des
 * tarifs historiques y font référence.
 */
export function CategoryManager({
  categories,
  canCreate,
  canArchive,
}: {
  categories: CategoryRow[]
  canCreate: boolean
  canArchive: boolean
}) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4">
      {canCreate &&
        (adding ? (
          <CategoryForm onFinished={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
          >
            <Plus className="size-4" aria-hidden />
            Nouvelle catégorie
          </button>
        ))}

      {categories.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Aucune catégorie"
          description="Les catégories regroupent les véhicules : citadine, berline, SUV, utilitaire, minibus…"
        />
      ) : (
        <ul className="space-y-3">
          {categories.map((category) => (
            <CategoryRowItem key={category.id} category={category} canArchive={canArchive} />
          ))}
        </ul>
      )}
    </div>
  )
}

function CategoryRowItem({
  category,
  canArchive,
}: {
  category: CategoryRow
  canArchive: boolean
}) {
  const [state, formAction] = useActionState<FleetFormState, FormData>(
    toggleCategoryAction,
    EMPTY_FORM_STATE
  )

  return (
    <li className="rounded-control border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{category.label}</p>
          <p className="mt-0.5 text-xs text-muted tabular">
            {category.code} · {category.vehicleCount} véhicule
            {category.vehicleCount > 1 ? 's' : ''}
          </p>
          {category.description && (
            <p className="mt-1 text-xs text-muted">{category.description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {category.isActive ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="neutral">Archivée</Badge>
          )}

          {canArchive && (
            <form action={formAction}>
              <input type="hidden" name="categoryId" value={category.id} />
              <input type="hidden" name="activate" value={category.isActive ? '0' : '1'} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
              >
                {category.isActive ? (
                  <>
                    <Archive className="size-3.5" aria-hidden />
                    Archiver
                  </>
                ) : (
                  <>
                    <Power className="size-3.5" aria-hidden />
                    Réactiver
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      <FormFeedback error={state.error} className="mt-3" />
    </li>
  )
}

function CategoryForm({ onFinished }: { onFinished: () => void }) {
  const [state, formAction] = useActionState<FleetFormState, FormData>(
    async (previous, formData) => {
      const result = await createCategoryAction(previous, formData)
      if (result.success) onFinished()
      return result
    },
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate className="rounded-control border border-line p-4">
      <FormFeedback error={state.error} success={state.success} className="mb-4" />

      <FormSection title="Nouvelle catégorie">
        <Field
          label="Code"
          name="code"
          required
          error={errors.code}
          hint="Référence courte et stable, par exemple SUV."
        >
          <Input name="code" placeholder="SUV" error={errors.code} autoComplete="off" />
        </Field>

        <Field label="Libellé" name="label" required error={errors.label}>
          <Input name="label" placeholder="SUV" error={errors.label} />
        </Field>

        <Field label="Ordre d’affichage" name="displayOrder" error={errors.displayOrder}>
          <Input
            name="displayOrder"
            inputMode="numeric"
            defaultValue="0"
            error={errors.displayOrder}
            className="tabular"
          />
        </Field>

        <Field label="Description" name="description" error={errors.description} wide>
          <Textarea name="description" error={errors.description} />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <SubmitButton label="Créer la catégorie" icon={Layers} />
        <button
          type="button"
          onClick={onFinished}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}
