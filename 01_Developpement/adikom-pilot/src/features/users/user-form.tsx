'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, LoaderCircle } from 'lucide-react'

import { CheckboxOption, Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { createUserAction, updateUserAction, type UserFormState } from './actions'
import type { Option, UserDetail } from './data'

const INITIAL_STATE: UserFormState = {}
const PASSWORD_MIN_LENGTH = 8

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

type UserFormProps = {
  mode: 'create' | 'edit'
  user?: UserDetail
  departments: Option[]
  groups: Option[]
  managers: Option[]
  /** Modifier les groupes revient à modifier des droits : permission distincte. */
  canManageGroups: boolean
}

export function UserForm({
  mode,
  user,
  departments,
  groups,
  managers,
  canManageGroups,
}: UserFormProps) {
  const action = mode === 'create' ? createUserAction : updateUserAction
  const [state, formAction] = useActionState(action, INITIAL_STATE)

  const [passwordVisible, setPasswordVisible] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const errors = state.fieldErrors ?? {}

  /**
   * Contrôle du mot de passe initial avant soumission.
   *
   * Lu depuis le FormData plutôt qu'un état contrôlé : un champ rempli avant
   * l'hydratation resterait sinon invisible pour React. Ce n'est pas une
   * mesure de sécurité — la même règle s'applique côté serveur.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (mode !== 'create') return

    const password = String(new FormData(event.currentTarget).get('password') ?? '')
    if (password.length < PASSWORD_MIN_LENGTH) {
      event.preventDefault()
      setLocalError(
        `Le mot de passe initial doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
      )
      return
    }
    setLocalError(null)
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate>
      {user && <input type="hidden" name="userId" value={user.id} />}

      {(state.error || localError) && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-control border border-danger-soft bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error ?? localError}</span>
        </div>
      )}

      {state.success && (
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-control border border-success-soft bg-success-soft px-3.5 py-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.success}</span>
        </div>
      )}

      <FormSection title="Identité" description="Informations personnelles du collaborateur.">
        <Field label="Prénom" name="firstName" required error={errors.firstName}>
          <Input
            name="firstName"
            defaultValue={user?.firstName}
            error={errors.firstName}
            autoComplete="given-name"
            required
          />
        </Field>

        <Field label="Nom" name="lastName" required error={errors.lastName}>
          <Input
            name="lastName"
            defaultValue={user?.lastName}
            error={errors.lastName}
            autoComplete="family-name"
            required
          />
        </Field>
      </FormSection>

      <FormSection
        title="Accès"
        description="Le nom d’utilisateur est l’identifiant saisi sur l’écran de connexion."
      >
        <Field
          label="Nom d’utilisateur"
          name="username"
          required
          error={errors.username}
          hint="Lettres, chiffres, point, tiret et souligné. Insensible à la casse."
        >
          <Input
            name="username"
            defaultValue={user?.username}
            error={errors.username}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="prenom.nom"
            required
          />
        </Field>

        <Field
          label="Email professionnel"
          name="email"
          required
          error={errors.email}
          hint="Sert à l’authentification. Jamais saisi à la connexion."
        >
          <Input
            name="email"
            type="email"
            defaultValue={user?.email}
            error={errors.email}
            autoComplete="off"
            required
          />
        </Field>

        {mode === 'create' && (
          <Field
            label="Mot de passe initial"
            name="password"
            required
            error={errors.password}
            hint={`Au moins ${PASSWORD_MIN_LENGTH} caractères. Communiquez-le au collaborateur par un canal sûr : il ne sera plus affiché ensuite.`}
            wide
          >
            <div className="relative">
              <Input
                name="password"
                type={passwordVisible ? 'text' : 'password'}
                error={errors.password}
                autoComplete="new-password"
                className="pr-11"
                required
              />
              <button
                type="button"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={
                  passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                }
                className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-control text-muted transition-colors hover:text-adikom-500"
              >
                {passwordVisible ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>
          </Field>
        )}
      </FormSection>

      <FormSection title="Informations professionnelles" description="Poste et rattachements.">
        <Field label="Fonction" name="jobTitle" error={errors.jobTitle}>
          <Input
            name="jobTitle"
            defaultValue={user?.jobTitle ?? ''}
            error={errors.jobTitle}
            placeholder="Assistant(e) de direction"
          />
        </Field>

        <Field label="Téléphone professionnel" name="phone" error={errors.phone}>
          <Input name="phone" type="tel" defaultValue={user?.phone ?? ''} error={errors.phone} />
        </Field>

        <Field label="Responsable hiérarchique" name="managerId" error={errors.managerId}>
          <Select name="managerId" defaultValue={user?.managerId ?? ''} error={errors.managerId}>
            <option value="">Aucun</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Date d’entrée" name="hiredOn" error={errors.hiredOn}>
          <Input name="hiredOn" type="date" defaultValue={user?.hiredOn ?? ''} error={errors.hiredOn} />
        </Field>
      </FormSection>

      <FormSection
        title="Départements"
        description="Une même personne peut être rattachée à plusieurs départements sans compte supplémentaire."
      >
        <div className="grid gap-2 sm:col-span-2">
          {departments.map((department) => (
            <CheckboxOption
              key={department.id}
              name="departmentIds"
              value={department.id}
              label={department.label}
              description={department.description}
              defaultChecked={user?.departmentIds.includes(department.id)}
            />
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Groupes"
        description="Les groupes déterminent les permissions héritées par l’utilisateur."
      >
        {canManageGroups ? (
          <div className="grid gap-2 sm:col-span-2">
            {groups.map((group) => (
              <CheckboxOption
                key={group.id}
                name="groupIds"
                value={group.id}
                label={group.label}
                description={group.description}
                defaultChecked={user?.groupIds.includes(group.id)}
              />
            ))}
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-control bg-canvas px-3.5 py-3 text-sm text-muted sm:col-span-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Modifier les groupes revient à modifier des droits d’accès. Cette opération
            requiert une permission dédiée dont vous ne disposez pas.
          </p>
        )}
      </FormSection>

      <FormSection title="Notes" description="Informations complémentaires internes.">
        <div className="sm:col-span-2">
          <Field label="Notes" name="notes" error={errors.notes}>
            <Textarea name="notes" defaultValue={user?.notes ?? ''} error={errors.notes} />
          </Field>
        </div>
      </FormSection>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton label={mode === 'create' ? 'Créer l’utilisateur' : 'Enregistrer'} />
        <Link
          href={user ? `/utilisateurs/${user.id}` : '/utilisateurs'}
          className="rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
        >
          Annuler
        </Link>
      </div>
    </form>
  )
}
