'use client'

import { useActionState, useState } from 'react'
import type { ReactNode } from 'react'
import { Lock, Save, ShieldAlert } from 'lucide-react'

import { Card } from '@/components/ui/primitives'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { updateCompanySection } from './actions'
import type { SettingsSection } from './constants'

/**
 * Une section de la fiche Entreprise — Module 09 §31 à §38.
 *
 * TROIS ÉTATS, ET AUCUN NE SE CONFOND AVEC UN AUTRE (CLAUDE.md §38) :
 *
 *   · MODIFIABLE     — l'utilisateur détient la capacité d'écriture ;
 *   · LECTURE SEULE  — il voit, il n'écrit pas ; les champs sont désactivés et
 *                      le bouton n'existe pas, mais c'est la base qui refuse ;
 *   · NON CONSULTABLE — il n'a pas le droit de LIRE cette section, et l'écran
 *                      le DIT au lieu d'afficher des champs vides, qui se
 *                      liraient « non renseigné » (DEC-017).
 */

export type SectionField = {
  name: string
  label: string
  value: string
  hint?: string
  required?: boolean
  type?: 'text' | 'email' | 'url' | 'tel' | 'color' | 'textarea'
  wide?: boolean
}

export function SectionForm({
  section,
  title,
  description,
  fields,
  canUpdate,
  canRead = true,
  requiredCapability,
  children,
}: {
  section: SettingsSection
  title: string
  description: string
  fields: readonly SectionField[]
  canUpdate: boolean
  canRead?: boolean
  /** Libellé de la capacité qui ouvrirait la lecture, si elle manque. */
  requiredCapability?: string
  /** Contenu supplémentaire inséré avant le bouton (confirmation, avertissement). */
  children?: ReactNode
}) {
  const [state, action] = useActionState(updateCompanySection, EMPTY_FORM_STATE)

  if (!canRead) {
    return (
      <Card title={title} description={description}>
        <div className="flex items-start gap-2.5 rounded-control border border-line px-3.5 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">Section non consultable avec vos droits.</span>
            {requiredCapability && (
              <span className="mt-1 block">
                Capacité requise : <strong className="text-ink">{requiredCapability}</strong>
              </span>
            )}
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card title={title} description={description}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="section" value={section} />

        <FormFeedback error={state.error} success={state.success} />

        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              name={field.name}
              hint={field.hint}
              error={state.fieldErrors?.[field.name]}
              required={field.required}
              wide={field.wide || field.type === 'textarea'}
            >
              {field.type === 'textarea' ? (
                <Textarea
                  name={field.name}
                  defaultValue={field.value}
                  disabled={!canUpdate}
                  error={state.fieldErrors?.[field.name]}
                />
              ) : (
                <Input
                  name={field.name}
                  type={field.type === 'color' ? 'text' : (field.type ?? 'text')}
                  defaultValue={field.value}
                  disabled={!canUpdate}
                  error={state.fieldErrors?.[field.name]}
                />
              )}
            </Field>
          ))}
        </div>

        {children}

        {canUpdate ? (
          <div className="flex justify-end pt-1">
            <SubmitButton label="Enregistrer" icon={Save} />
          </div>
        ) : (
          <p className="flex items-center gap-2 pt-1 text-xs text-muted">
            <Lock className="size-3.5" aria-hidden />
            Consultation seule — la modification relève d’une autorisation dédiée.
          </p>
        )}
      </form>
    </Card>
  )
}

/**
 * La section Préférences, et son avertissement de devise — §45 et §57.
 *
 * « La devise principale constitue un paramètre critique. Avant toute
 * modification, le système doit avertir l'utilisateur. »
 *
 * L'avertissement n'apparaît QUE lorsque la valeur change réellement : le
 * montrer en permanence l'aurait rendu invisible à force d'être là. La
 * confirmation est exigée côté serveur, jamais seulement ici.
 */
export function PreferencesSection({
  fields,
  currentCurrency,
  canUpdate,
}: {
  fields: readonly SectionField[]
  currentCurrency: string
  canUpdate: boolean
}) {
  const [state, action] = useActionState(updateCompanySection, EMPTY_FORM_STATE)
  const [currency, setCurrency] = useState(currentCurrency)

  const changing = currency.trim().toUpperCase() !== currentCurrency.trim().toUpperCase()

  return (
    <Card
      title="Préférences"
      description="Devise, langue, fuseau horaire et format des dates."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="section" value="preferences" />
        <input type="hidden" name="current_currency" value={currentCurrency} />

        <FormFeedback error={state.error} success={state.success} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Devise principale"
            name="currency_code"
            hint="Code sur trois lettres — KMF pour le franc comorien."
            error={state.fieldErrors?.currency_code}
            required
          >
            <Input
              name="currency_code"
              defaultValue={currentCurrency}
              disabled={!canUpdate}
              maxLength={3}
              onChange={(event) => setCurrency(event.currentTarget.value)}
              error={state.fieldErrors?.currency_code}
            />
          </Field>

          {fields.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              name={field.name}
              hint={field.hint}
              error={state.fieldErrors?.[field.name]}
            >
              <Input
                name={field.name}
                defaultValue={field.value}
                disabled={!canUpdate}
                error={state.fieldErrors?.[field.name]}
              />
            </Field>
          ))}
        </div>

        {changing && (
          <Notice tone="warning">
            <p className="font-medium">Vous modifiez la devise principale.</p>
            <p className="mt-1">
              Ce changement s’applique aux <strong>nouveaux</strong> documents et opérations. Les
              montants déjà enregistrés ne sont pas convertis et conservent leur contexte
              d’origine (§46, §57).
            </p>
            <label className="mt-3 flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="confirm_currency"
                className="mt-0.5 size-4 shrink-0 accent-adikom-500"
              />
              <span>
                Je confirme le passage de <strong>{currentCurrency}</strong> à{' '}
                <strong>{currency.toUpperCase() || '—'}</strong>.
              </span>
            </label>
            {state.fieldErrors?.confirm_currency && (
              <p className="mt-1 text-sm">{state.fieldErrors.confirm_currency}</p>
            )}
          </Notice>
        )}

        {canUpdate ? (
          <div className="flex justify-end pt-1">
            <SubmitButton label="Enregistrer" icon={Save} />
          </div>
        ) : (
          <p className="flex items-center gap-2 pt-1 text-xs text-muted">
            <Lock className="size-3.5" aria-hidden />
            Consultation seule — la modification relève d’une autorisation dédiée.
          </p>
        )}
      </form>
    </Card>
  )
}
