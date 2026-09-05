'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { Info, LoaderCircle } from 'lucide-react'

import { Field, FormSection, Input, Textarea } from '@/components/ui/form'
import { Notice } from '@/components/ui/feedback'
import { createGroupAction, updateGroupAction, type GroupFormState } from './actions'
import type { GroupDetail } from './data'

const INITIAL_STATE: GroupFormState = {}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {pending ? 'Enregistrement…' : label}
    </button>
  )
}

/**
 * Formulaire d'un groupe — Module 08 §28.
 *
 * Le groupe porte un nom, une description, un ordre d'affichage. Ses MEMBRES et
 * ses PERMISSIONS se gèrent depuis la fiche, sous leurs propres capacités : les
 * réunir ici laisserait croire qu'une seule autorisation suffit à tout faire.
 *
 * Le CODE n'est pas saisi. Il se dérive du nom à la création et ne change plus :
 * il identifie le groupe dans les exports et le journal d'audit, tandis que le
 * nom, lui, se corrige librement.
 */
export function GroupForm({ mode, group }: { mode: 'create' | 'edit'; group?: GroupDetail }) {
  const action = mode === 'create' ? createGroupAction : updateGroupAction
  const [state, formAction] = useActionState(action, INITIAL_STATE)

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      {group && <input type="hidden" name="groupId" value={group.id} />}

      {state.error && (
        <Notice tone="error" className="mb-5">
          {state.error}
        </Notice>
      )}

      {state.success && (
        <Notice tone="success" className="mb-5">
          {state.success}
        </Notice>
      )}

      <FormSection
        title="Identification"
        description="Le nom est ce que les administrateurs lisent dans les listes et les fiches."
      >
        <Field label="Nom du groupe" name="name" required error={errors.name}>
          <Input
            name="name"
            defaultValue={group?.name}
            error={errors.name}
            placeholder="Exploitation location"
            required
          />
        </Field>

        <Field
          label="Ordre d’affichage"
          name="sortOrder"
          error={errors.sortOrder}
          hint="Les plus petits d’abord. À égalité, l’ordre est alphabétique."
        >
          <Input
            name="sortOrder"
            type="number"
            min={0}
            max={999}
            defaultValue={group?.sortOrder ?? 0}
            error={errors.sortOrder}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Description"
            name="description"
            error={errors.description}
            hint="À quoi sert ce groupe, et pour quel poste."
          >
            <Textarea
              name="description"
              defaultValue={group?.description ?? ''}
              error={errors.description}
            />
          </Field>
        </div>

        {group && (
          <p className="flex items-start gap-2 rounded-control bg-canvas px-3.5 py-2.5 text-xs text-muted sm:col-span-2">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Code du groupe : <strong className="font-mono">{group.code}</strong>. Il identifie le
            groupe dans les exports et le journal d’audit, et ne se modifie pas.
          </p>
        )}
      </FormSection>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton label={mode === 'create' ? 'Créer le groupe' : 'Enregistrer'} />
        <Link
          href={group ? `/utilisateurs/groupes/${group.id}` : '/utilisateurs/groupes'}
          className="rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
        >
          Annuler
        </Link>
      </div>
    </form>
  )
}
