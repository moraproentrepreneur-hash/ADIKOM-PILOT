'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { ImageUp, Trash2 } from 'lucide-react'

import { Card } from '@/components/ui/primitives'
import { FormFeedback, Notice } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { removeCompanyLogo, uploadCompanyLogo } from './actions'

/**
 * Logo officiel — Module 09 §6, §39, et CLAUDE.md §33 et §34.
 *
 * LE LOGO N'EST JAMAIS TRANSFORMÉ. Le fichier est stocké tel qu'il est déposé,
 * et l'aperçu le présente sur un fond BLANC, à ses proportions, dans un
 * conteneur qui s'adapte à lui — `object-contain`, jamais `object-cover`, qui
 * recadrerait. C'est la règle absolue n° 13 du projet, et elle ne souffre
 * aucune exception d'affichage.
 *
 * L'aperçu passe par une route serveur qui délivre une URL signée de courte
 * durée : le bucket est privé et le navigateur ne l'atteint jamais directement.
 */

function PendingButton({
  label,
  pendingLabel,
  tone,
  icon: Icon,
}: {
  label: string
  pendingLabel: string
  tone: 'primary' | 'danger'
  icon: typeof ImageUp
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        tone === 'danger'
          ? 'inline-flex items-center justify-center gap-2 rounded-control border border-danger-soft bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
          : 'inline-flex items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600 disabled:cursor-not-allowed disabled:opacity-60'
      }
    >
      <Icon className="size-4" aria-hidden />
      {pending ? pendingLabel : label}
    </button>
  )
}

export function LogoPanel({
  hasLogo,
  canUpdate,
}: {
  hasLogo: boolean
  canUpdate: boolean
}) {
  const [uploadState, uploadAction] = useActionState(uploadCompanyLogo, EMPTY_FORM_STATE)
  const [removeState, removeAction] = useActionState(removeCompanyLogo, EMPTY_FORM_STATE)

  return (
    <Card
      title="Logo officiel"
      description="Enregistré tel quel, sans redimensionnement ni recadrage."
    >
      <div className="space-y-4">
        <FormFeedback error={uploadState.error ?? removeState.error} success={uploadState.success ?? removeState.success} />

        {/*
          Fond blanc et proportions conservées : le conteneur s'adapte au logo,
          jamais l'inverse (CLAUDE.md §34).
        */}
        <div className="flex min-h-32 items-center justify-center rounded-control border border-line bg-white p-6">
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/api/branding/logo"
              alt="Logo enregistré d’ADIKOM"
              className="max-h-24 w-auto max-w-full object-contain"
            />
          ) : (
            <p className="text-center text-sm text-muted">
              Aucun logo enregistré.
              <span className="mt-1 block text-xs">
                Les documents utilisent le fichier officiel embarqué dans l’application.
              </span>
            </p>
          )}
        </div>

        {canUpdate ? (
          <>
            <form action={uploadAction} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="logo" className="block text-sm font-medium text-ink">
                  Remplacer le logo
                </label>
                <input
                  id="logo"
                  name="logo"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                  className="w-full rounded-control border border-line bg-white px-3.5 py-2.5 text-sm text-ink file:mr-3 file:rounded-control file:border-0 file:bg-adikom-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-adikom-500"
                />
                {uploadState.fieldErrors?.logo ? (
                  <p className="text-sm text-danger">{uploadState.fieldErrors.logo}</p>
                ) : (
                  <p className="text-xs text-muted">PNG, JPEG, WebP ou SVG — 2 Mo au plus.</p>
                )}
              </div>

              <PendingButton
                label="Enregistrer le logo"
                pendingLabel="Envoi…"
                tone="primary"
                icon={ImageUp}
              />
            </form>

            {hasLogo && (
              <form action={removeAction}>
                {/* Le retrait efface le fichier : l'intention est transmise
                    explicitement, et le serveur l'exige (§39). */}
                <input type="hidden" name="confirm" value="oui" />
                <PendingButton
                  label="Retirer le logo"
                  pendingLabel="Retrait…"
                  tone="danger"
                  icon={Trash2}
                />
              </form>
            )}
          </>
        ) : (
          <p className="text-xs text-muted">
            Consultation seule — remplacer le logo relève de l’identité visuelle.
          </p>
        )}

        <Notice tone="info">
          Les documents générés (factures, contrats) emploient le{' '}
          <strong>fichier officiel embarqué</strong> dans l’application, et non ce logo. Le
          `Module 09` §6 prévoit explicitement cet usage « lorsque cette fonctionnalité sera
          développée ».
        </Notice>
      </div>
    </Card>
  )
}
