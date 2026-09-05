'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'

import { CheckboxOption, Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { generateTemporaryPassword, PASSWORD_MIN_LENGTH } from '@/lib/auth/password'
import { createUserAction, updateUserAction, type UserFormState } from './actions'
import type { Option, UserDetail } from './data'

const INITIAL_STATE: UserFormState = {}

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
 * Rattachement à un département, et responsabilité éventuelle — Module 08 §36.
 *
 * Deux cases, parce que ce sont deux faits distincts : appartenir à un
 * département n'est pas en répondre. La seconde ne s'active qu'avec la
 * première — on ne dirige pas un département auquel on n'appartient pas — et
 * elle vit HORS du libellé cliquable, sans quoi chaque clic sur « Responsable »
 * décocherait le rattachement.
 */
function DepartmentOption({
  department,
  attached,
  managed,
}: {
  department: Option
  attached: boolean
  managed: boolean
}) {
  const [checked, setChecked] = useState(attached)
  const [leads, setLeads] = useState(managed)

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-control border border-line px-3.5 py-2.5 transition-colors has-checked:border-adikom-400 has-checked:bg-adikom-50">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name="departmentIds"
          value={department.id}
          checked={checked}
          onChange={(event) => {
            setChecked(event.target.checked)
            // Un département qu'on quitte n'est plus un département qu'on dirige.
            if (!event.target.checked) setLeads(false)
          }}
          className="mt-0.5 size-4 shrink-0 accent-adikom-500"
        />
        <span className="min-w-0">
          <span className="block text-sm text-ink">{department.label}</span>
          {department.description && (
            <span className="block text-xs text-muted">{department.description}</span>
          )}
        </span>
      </label>

      <label
        className={`flex shrink-0 items-center gap-2 text-xs ${
          checked ? 'cursor-pointer text-ink' : 'cursor-not-allowed text-muted/60'
        }`}
      >
        <input
          type="checkbox"
          name="managedDepartmentIds"
          value={department.id}
          checked={leads}
          disabled={!checked}
          onChange={(event) => setLeads(event.target.checked)}
          className="size-4 shrink-0 accent-adikom-500"
        />
        Responsable
      </label>
    </div>
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

  /**
   * Mot de passe temporaire.
   *
   * Généré dans le navigateur sur action explicite, jamais demandé à
   * l'administrateur. Il n'est conservé nulle part : il vit dans cet état le
   * temps de la création, est transmis une fois au serveur, et disparaît avec
   * la page.
   *
   * La génération n'est pas automatique au montage : elle produirait une valeur
   * absente du rendu serveur, donc une divergence d'hydratation.
   */
  const [password, setPassword] = useState('')
  const [copied, setCopied] = useState(false)

  function regenerate() {
    setPassword(generateTemporaryPassword())
    setCopied(false)
    setLocalError(null)
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // Le presse-papiers peut être refusé (contexte non sécurisé, permission) :
      // l'administrateur peut alors afficher le mot de passe et le recopier.
      setLocalError(
        'La copie automatique a été refusée par le navigateur. Affichez le mot de passe pour le recopier.'
      )
    }
  }

  const errors = state.fieldErrors ?? {}

  /**
   * Dernier filet avant envoi : sans mot de passe généré, la création échouerait
   * côté serveur avec un message moins clair. Ce n'est pas une mesure de
   * sécurité — la même règle est appliquée par l'action serveur.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (mode !== 'create') return

    if (password.length < PASSWORD_MIN_LENGTH) {
      event.preventDefault()
      setLocalError(
        'Aucun mot de passe temporaire n’a été généré. Utilisez « Générer un mot de passe ».'
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
            label="Mot de passe temporaire"
            name="password"
            error={errors.password}
            hint="Ce mot de passe ne sera plus affiché après la création du compte. Communiquez-le au collaborateur par un canal sûr : il devra le remplacer à sa première connexion."
            wide
          >
            {/* Le champ est toujours présent — il porte la valeur envoyée —
                mais reste vide tant que la génération n'a pas été demandée. */}
            <input type="hidden" name="password" value={password} />

            {password ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    id="password-visible"
                    type={passwordVisible ? 'text' : 'password'}
                    value={password}
                    readOnly
                    aria-label="Mot de passe temporaire"
                    className="w-full rounded-control border border-line bg-canvas px-3.5 py-2.5 pr-11 font-mono text-sm text-ink outline-none"
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

                <button
                  type="button"
                  onClick={copyPassword}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-line px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
                >
                  {copied ? (
                    <CheckCircle2 className="size-4 text-success" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                  {copied ? 'Copié' : 'Copier'}
                </button>

                <button
                  type="button"
                  onClick={regenerate}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-line px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
                >
                  <RefreshCw className="size-4" aria-hidden />
                  Régénérer
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={regenerate}
                className="inline-flex items-center gap-2 rounded-control border border-adikom-400 bg-adikom-50 px-4 py-2.5 text-sm font-medium text-adikom-500 transition-colors hover:bg-adikom-100"
              >
                <RefreshCw className="size-4" aria-hidden />
                Générer un mot de passe
              </button>
            )}

            <p className="mt-2 flex items-start gap-2 rounded-control bg-canvas px-3.5 py-2.5 text-xs text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Généré dans votre navigateur. Il n’est enregistré ni dans la fiche, ni dans le
              journal d’audit, et n’est plus consultable après la création.
            </p>
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
        description="Une même personne peut être rattachée à plusieurs départements, et en diriger plusieurs, sans compte supplémentaire."
      >
        <div className="grid gap-2 sm:col-span-2">
          {departments.map((department) => (
            <DepartmentOption
              key={department.id}
              department={department}
              attached={user?.departmentIds.includes(department.id) ?? false}
              managed={user?.managedDepartmentIds.includes(department.id) ?? false}
            />
          ))}
        </div>
        <p className="flex items-start gap-2 rounded-control bg-canvas px-3.5 py-2.5 text-xs text-muted sm:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Un département est une information d’organisation : il n’accorde aucun droit. Les
          permissions relèvent des groupes et des règles individuelles.
        </p>
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
