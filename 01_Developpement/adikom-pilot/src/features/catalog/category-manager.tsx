'use client'

import { useActionState, useState } from 'react'
import { Archive, FolderTree, Pencil, Plus, Power } from 'lucide-react'

import { ACTION_BASE, ACTION_TONES, Badge, EmptyState } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { Field, FormSection, Input, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  createServiceCategoryAction,
  toggleServiceCategoryAction,
  updateServiceCategoryAction,
  type CatalogFormState,
} from './actions'
import type { ServiceCategoryRow } from './data'

/**
 * Catégories du catalogue de services — LOT 20.
 *
 * Une catégorie NE SE SUPPRIME PAS : elle s'archive (CLAUDE.md §22). Des
 * services, et par eux des opérations futures, y font référence.
 *
 * Une catégorie archivée reste affichée ici — il faut pouvoir la réactiver —
 * mais elle N'EST PLUS PROPOSÉE à la création d'un service, et la base le
 * refuse (`fn_service_category_active`).
 */
export function ServiceCategoryManager({
  categories,
  canCreate,
  canUpdate,
  canArchive,
}: {
  categories: ServiceCategoryRow[]
  canCreate: boolean
  canUpdate: boolean
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600 sm:min-h-0"
          >
            <Plus className="size-4" aria-hidden />
            Nouvelle catégorie
          </button>
        ))}

      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Aucune catégorie"
          description="Les catégories classent le catalogue : transport, excursion, assistance, services techniques…"
        />
      ) : (
        <ul className="space-y-3">
          {categories.map((category) => (
            <CategoryItem
              key={category.id}
              category={category}
              canUpdate={canUpdate}
              canArchive={canArchive}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function CategoryItem({
  category,
  canUpdate,
  canArchive,
}: {
  category: ServiceCategoryRow
  canUpdate: boolean
  canArchive: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [state, formAction] = useActionState<CatalogFormState, FormData>(
    toggleServiceCategoryAction,
    EMPTY_FORM_STATE
  )

  return (
    <li className="rounded-control border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{category.label}</p>
          <p className="mt-0.5 text-xs text-muted tabular">
            {category.code} · {category.serviceCount} service
            {category.serviceCount > 1 ? 's' : ''}
          </p>
          {category.description && (
            <p className="mt-1 text-xs text-muted">{category.description}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {category.isActive ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="neutral">Archivée</Badge>
          )}

          {canUpdate && (
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className={cn(ACTION_BASE, ACTION_TONES.secondary)}
            >
              <Pencil className="size-3.5" aria-hidden />
              {editing ? 'Fermer' : 'Modifier'}
            </button>
          )}

          {canArchive && (
            <form action={formAction}>
              <input type="hidden" name="categoryId" value={category.id} />
              <input type="hidden" name="activate" value={category.isActive ? '0' : '1'} />
              <button type="submit" className={cn(ACTION_BASE, ACTION_TONES.secondary)}>
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

      <FormFeedback error={state.error} success={state.success} className="mt-3" />

      {editing && (
        <div className="mt-4 border-t border-line pt-4">
          <CategoryForm category={category} onFinished={() => setEditing(false)} />
        </div>
      )}
    </li>
  )
}

function CategoryForm({
  category,
  onFinished,
}: {
  category?: ServiceCategoryRow
  onFinished: () => void
}) {
  const [state, formAction] = useActionState<CatalogFormState, FormData>(
    async (previous, formData) => {
      const result = category
        ? await updateServiceCategoryAction(previous, formData)
        : await createServiceCategoryAction(previous, formData)
      if (result.success) onFinished()
      return result
    },
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate className="rounded-control border border-line p-4">
      <FormFeedback error={state.error} success={state.success} className="mb-4" />

      {category && <input type="hidden" name="categoryId" value={category.id} />}

      <FormSection title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}>
        <Field
          label="Code"
          name="code"
          required
          error={errors.code}
          hint="Référence courte et stable, par exemple TRANSPORT."
        >
          <Input
            name="code"
            placeholder="TRANSPORT"
            defaultValue={category?.code}
            error={errors.code}
            autoComplete="off"
          />
        </Field>

        <Field label="Libellé" name="label" required error={errors.label}>
          <Input
            name="label"
            placeholder="Transport"
            defaultValue={category?.label}
            error={errors.label}
          />
        </Field>

        <Field label="Ordre d’affichage" name="displayOrder" error={errors.displayOrder}>
          <Input
            name="displayOrder"
            inputMode="numeric"
            defaultValue={String(category?.displayOrder ?? 0)}
            error={errors.displayOrder}
            className="tabular"
          />
        </Field>

        <Field label="Description" name="description" error={errors.description} wide>
          <Textarea
            name="description"
            defaultValue={category?.description ?? ''}
            error={errors.description}
          />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <SubmitButton
          label={category ? 'Enregistrer' : 'Créer la catégorie'}
          icon={FolderTree}
        />
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
