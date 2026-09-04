'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'

import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { createProjectAction, updateProjectAction, type ProjectFormState } from './actions'
import { PRIORITIES, PRIORITY_LABELS } from './constants'
import type { Option, ProjectDetail } from './data'

/**
 * Fiche projet — Module 03 §6.
 *
 * UN SEUL FORMULAIRE POUR CRÉER ET POUR MODIFIER.
 *
 * Les deux gestes portent exactement les mêmes champs ; en écrire deux versions
 * les ferait diverger à la première correction (CLAUDE.md §37). Seule l'action
 * change — et avec elle la capacité exigée côté serveur.
 *
 * LE TIERS EST FACULTATIF, ET UNIQUE.
 *
 * §28 : un projet « peut » être associé à un client, un fournisseur ou un
 * partenaire. Le type commande la liste, et la base garantit qu'un seul
 * rattachement existe. Sans la capacité de lire un répertoire, il n'est pas
 * proposé : l'écran le dit, plutôt que d'afficher un menu vide.
 */
export function ProjectForm({
  project,
  users,
  parties,
  cancelHref,
}: {
  project?: ProjectDetail
  users: Option[]
  parties: {
    clients: Option[]
    suppliers: Option[]
    partners: Option[]
    canReadClients: boolean
    canReadSuppliers: boolean
    canReadPartners: boolean
  }
  cancelHref: string
}) {
  const [state, formAction] = useActionState<ProjectFormState, FormData>(
    project ? updateProjectAction : createProjectAction,
    EMPTY_FORM_STATE
  )

  const initialType = project?.clientId
    ? 'CLIENT'
    : project?.supplierId
      ? 'SUPPLIER'
      : project?.partnerId
        ? 'PARTNER'
        : ''

  const [partyType, setPartyType] = useState(initialType)

  const errors = state.fieldErrors ?? {}

  const optionsFor = (type: string): Option[] =>
    type === 'CLIENT'
      ? parties.clients
      : type === 'SUPPLIER'
        ? parties.suppliers
        : type === 'PARTNER'
          ? parties.partners
          : []

  const currentPartyId =
    initialType === partyType
      ? (project?.clientId ?? project?.supplierId ?? project?.partnerId ?? '')
      : ''

  const availableTypes = [
    parties.canReadClients ? { value: 'CLIENT', label: 'Client' } : null,
    parties.canReadSuppliers ? { value: 'SUPPLIER', label: 'Fournisseur' } : null,
    parties.canReadPartners ? { value: 'PARTNER', label: 'Partenaire' } : null,
  ].filter((entry): entry is { value: string; label: string } => entry !== null)

  return (
    <form action={formAction} noValidate>
      {project && <input type="hidden" name="projectId" value={project.id} />}

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection
        title="Projet"
        description="Ce que le projet doit accomplir, et pour quand."
      >
        <Field label="Nom du projet" name="name" required error={errors.name} wide>
          <Input
            name="name"
            defaultValue={project?.name ?? ''}
            error={errors.name}
            placeholder="Partenariat avec la Société X"
            maxLength={160}
          />
        </Field>

        <Field
          label="Objectif"
          name="objective"
          error={errors.objective}
          hint="Ce à quoi on reconnaîtra que le projet est terminé."
          wide
        >
          <Input
            name="objective"
            defaultValue={project?.objective ?? ''}
            error={errors.objective}
            maxLength={2000}
          />
        </Field>

        <Field label="Description" name="description" error={errors.description} wide>
          <Textarea
            name="description"
            defaultValue={project?.description ?? ''}
            error={errors.description}
            rows={4}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Responsabilité et priorité"
        description="Qui suit l’avancement, et à quel point cela presse."
      >
        <Field
          label="Responsable"
          name="ownerId"
          error={errors.ownerId}
          hint={
            users.length <= 1
              ? 'La liste des utilisateurs n’est pas accessible avec vos droits (users.users.view).'
              : 'La personne chargée de suivre l’avancement général (§9).'
          }
        >
          <Select name="ownerId" defaultValue={project?.ownerId ?? ''} error={errors.ownerId}>
            <option value="">Aucun responsable désigné</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
                {user.description ? ` · ${user.description}` : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Priorité"
          name="priority"
          error={errors.priority}
          hint="Tout n’est pas urgent : la priorité ne sert qu’à distinguer (§8)."
        >
          <Select name="priority" defaultValue={project?.priority ?? 'NORMAL'} error={errors.priority}>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection title="Période" description="Des jours, jamais des heures.">
        <Field label="Date de début" name="startsOn" error={errors.startsOn}>
          <Input
            name="startsOn"
            type="date"
            defaultValue={project?.startsOn ?? ''}
            error={errors.startsOn}
          />
        </Field>

        <Field
          label="Date prévue de fin"
          name="dueOn"
          error={errors.dueOn}
          hint="Peut rester vide : tous les projets n’ont pas de terme fixé."
        >
          <Input name="dueOn" type="date" defaultValue={project?.dueOn ?? ''} error={errors.dueOn} />
        </Field>
      </FormSection>

      <FormSection
        title="Tiers concerné"
        description="Facultatif. Un projet peut concerner un client, un fournisseur ou un partenaire (§28)."
      >
        {availableTypes.length === 0 ? (
          <div className="sm:col-span-2">
            <Notice tone="info">
              Aucun répertoire de tiers ne vous est accessible : le rattachement à un client, un
              fournisseur ou un partenaire n’est donc pas proposé.
            </Notice>
          </div>
        ) : (
          <>
            <Field label="Type de tiers" name="partyType">
              <Select
                name="partyType"
                value={partyType}
                onChange={(event) => setPartyType(event.target.value)}
              >
                <option value="">Aucun</option>
                {availableTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Tiers"
              name="partyId"
              hint={partyType ? undefined : 'Choisissez d’abord un type.'}
            >
              <Select
                name="partyId"
                defaultValue={currentPartyId}
                disabled={!partyType}
                key={partyType}
              >
                <option value="">Aucun</option>
                {optionsFor(partyType).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </FormSection>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton label={project ? 'Enregistrer les modifications' : 'Créer le projet'} />
        <Link href={cancelHref} className="text-sm text-muted hover:text-ink">
          Annuler
        </Link>
      </div>
    </form>
  )
}
