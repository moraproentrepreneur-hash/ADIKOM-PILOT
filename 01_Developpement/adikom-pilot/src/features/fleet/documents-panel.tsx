'use client'

import { useActionState, useState } from 'react'
import { Archive, FileText, Paperclip, Plus } from 'lucide-react'

import { Badge, EmptyState } from '@/components/ui/primitives'
import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatDate } from '@/lib/dates'
import {
  addVehicleDocumentAction,
  archiveVehicleDocumentAction,
  type FleetFormState,
} from './actions'
import { ACCEPTED_DOCUMENT_TYPES, DOCUMENT_LABELS, type VehicleDocumentType } from './constants'
import type { VehicleDocument } from './data'

/**
 * Documents et échéances d'un véhicule.
 *
 * Les fichiers résident dans un bucket privé : ils ne sont jamais servis
 * directement au navigateur. Le lien passe par un point de contrôle serveur qui
 * vérifie la permission puis délivre une URL signée d'une minute
 * (migration 019, route `/api/documents/vehicule/[id]`).
 *
 * Les échéances sont affichées ici ; leur notification relève de la Phase 3.
 */
export function DocumentsPanel({
  vehicleId,
  documents,
  canCreate,
  canArchive,
  canView,
}: {
  vehicleId: string
  documents: VehicleDocument[]
  canCreate: boolean
  canArchive: boolean
  canView: boolean
}) {
  const [adding, setAdding] = useState(false)

  if (adding) {
    return <DocumentForm vehicleId={vehicleId} onFinished={() => setAdding(false)} />
  }

  return (
    <div className="space-y-4">
      {canCreate && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
        >
          <Plus className="size-4" aria-hidden />
          Ajouter un document
        </button>
      )}

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun document"
          description="Carte grise, assurance, visite technique, contrat fournisseur…"
        />
      ) : (
        <ul className="space-y-3">
          {documents.map((document) => (
            <DocumentRow
              key={document.id}
              vehicleId={vehicleId}
              document={document}
              canArchive={canArchive}
              canView={canView}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/** État d'échéance, calculé à l'affichage : aucune notion n'est stockée. */
function expiryState(expiresOn: string | null): { label: string; tone: 'danger' | 'warning' } | null {
  if (!expiresOn) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(`${expiresOn}T00:00:00`)
  const days = Math.round((expiry.getTime() - today.getTime()) / 86_400_000)

  if (days < 0) return { label: 'Expiré', tone: 'danger' }
  if (days === 0) return { label: 'Expire aujourd’hui', tone: 'danger' }
  if (days <= 30) return { label: `Expire dans ${days} j`, tone: 'warning' }
  return null
}

function DocumentRow({
  vehicleId,
  document,
  canArchive,
  canView,
}: {
  vehicleId: string
  document: VehicleDocument
  canArchive: boolean
  canView: boolean
}) {
  const [state, formAction] = useActionState<FleetFormState, FormData>(
    archiveVehicleDocumentAction,
    EMPTY_FORM_STATE
  )

  const expiry = expiryState(document.expiresOn)

  return (
    <li className="rounded-control border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{document.label}</p>
          <p className="mt-0.5 text-xs text-muted">
            {DOCUMENT_LABELS[document.docType]}
            {document.reference ? ` · ${document.reference}` : ''}
            {document.issuedOn ? ` · émis le ${formatDate(document.issuedOn)}` : ''}
            {document.expiresOn ? ` · échéance ${formatDate(document.expiresOn)}` : ''}
          </p>
          {document.notes && <p className="mt-1 text-xs text-muted italic">{document.notes}</p>}

          {document.storagePath && canView && (
            <a
              href={`/api/documents/vehicule/${document.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-adikom-500 hover:underline"
            >
              <Paperclip className="size-3.5" aria-hidden />
              {document.fileName ?? 'Ouvrir le fichier'}
            </a>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {expiry && <Badge tone={expiry.tone}>{expiry.label}</Badge>}

          {canArchive && (
            <form action={formAction}>
              <input type="hidden" name="documentId" value={document.id} />
              <input type="hidden" name="vehicleId" value={vehicleId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
              >
                <Archive className="size-3.5" aria-hidden />
                Archiver
              </button>
            </form>
          )}
        </div>
      </div>

      <FormFeedback error={state.error} className="mt-3" />
    </li>
  )
}

function DocumentForm({ vehicleId, onFinished }: { vehicleId: string; onFinished: () => void }) {
  const [state, formAction] = useActionState<FleetFormState, FormData>(
    async (previous, formData) => {
      const result = await addVehicleDocumentAction(previous, formData)
      if (result.success) onFinished()
      return result
    },
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="vehicleId" value={vehicleId} />

      <FormFeedback error={state.error} success={state.success} className="mb-5" />

      <FormSection title="Nouveau document">
        <Field label="Type" name="docType" required error={errors.docType}>
          <Select name="docType" defaultValue="INSURANCE" error={errors.docType}>
            {(Object.keys(DOCUMENT_LABELS) as VehicleDocumentType[]).map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Libellé" name="label" required error={errors.label}>
          <Input name="label" placeholder="Assurance 2026" error={errors.label} />
        </Field>

        <Field label="Référence" name="reference" error={errors.reference}>
          <Input name="reference" placeholder="N° de police, de contrat…" error={errors.reference} />
        </Field>

        <Field label="Émis le" name="issuedOn" error={errors.issuedOn}>
          <Input name="issuedOn" type="date" error={errors.issuedOn} />
        </Field>

        <Field
          label="Échéance"
          name="expiresOn"
          error={errors.expiresOn}
          hint="Renseignée, elle permet de suivre l’expiration du document."
        >
          <Input name="expiresOn" type="date" error={errors.expiresOn} />
        </Field>

        <Field
          label="Fichier"
          name="file"
          error={errors.file}
          hint="PDF ou image, 10 Mo maximum. Facultatif."
        >
          <Input
            name="file"
            type="file"
            accept={ACCEPTED_DOCUMENT_TYPES.join(',')}
            error={errors.file}
            className="file:mr-3 file:rounded-control file:border-0 file:bg-adikom-50 file:px-3 file:py-1.5 file:text-sm file:text-adikom-500"
          />
        </Field>

        <Field label="Précisions" name="notes" error={errors.notes} wide>
          <Textarea name="notes" error={errors.notes} />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <SubmitButton label="Ajouter le document" icon={FileText} pendingLabel="Envoi…" />
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
