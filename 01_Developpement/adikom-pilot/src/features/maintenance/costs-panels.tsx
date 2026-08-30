'use client'

import { useActionState } from 'react'
import { Check, Paperclip, Plus, Save, X } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  addCostLineAction,
  addDocumentAction,
  addQuoteAction,
  decideQuoteAction,
  recordCostsAction,
  type CostFormState,
} from './costs-actions'
import {
  COST_LINE_KIND_LABELS,
  COST_LINE_KIND_ORDER,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_ORDER,
} from './costs-constants'
import type { MaintenanceCosts } from './costs-data'

/**
 * Saisie des montants — Workflow 05 §33, §34, Workflow 06 §7.
 *
 * TROIS MONTANTS INDÉPENDANTS.
 *
 * Aucun n'est déduit d'un autre : la documentation ne pose aucune règle entre
 * l'estimation, le réel et l'imputable, et en inventer une ferait autorité sur
 * une décision que personne n'a prise (DEC-008). Le seul rapport imposé est
 * celui du §7 — l'imputable ne dépasse pas le coût réel, faute de quoi le
 * « montant non imputable » serait négatif.
 *
 * Un champ vide n'est PAS zéro : il signifie « pas encore chiffré ».
 */
export function CostsPanel({
  maintenanceId,
  costs,
}: {
  maintenanceId: string
  costs: MaintenanceCosts | null
}) {
  const [state, formAction] = useActionState<CostFormState, FormData>(
    recordCostsAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="maintenanceId" value={maintenanceId} />

      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Coût estimé"
          name="estimatedCost"
          error={errors.estimatedCost}
          hint="Avant intervention. En KMF, sans décimale."
        >
          <Input
            name="estimatedCost"
            inputMode="numeric"
            defaultValue={costs?.estimatedCost ?? ''}
            error={errors.estimatedCost}
            className="tabular"
          />
        </Field>

        <Field
          label="Coût réel"
          name="actualCost"
          error={errors.actualCost}
          hint="Après intervention. L’estimation est conservée telle quelle."
        >
          <Input
            name="actualCost"
            inputMode="numeric"
            defaultValue={costs?.actualCost ?? ''}
            error={errors.actualCost}
            className="tabular"
          />
        </Field>

        <Field
          label="Montant imputable"
          name="imputableAmount"
          error={errors.imputableAmount}
          hint="Plafond imputable à un fournisseur. N’impute rien par lui-même."
        >
          <Input
            name="imputableAmount"
            inputMode="numeric"
            defaultValue={costs?.imputableAmount ?? ''}
            error={errors.imputableAmount}
            className="tabular"
          />
        </Field>
      </div>

      <Field label="Observations" name="notes">
        <Textarea name="notes" rows={2} defaultValue={costs?.notes ?? ''} />
      </Field>

      <p className="text-xs text-muted">
        Un champ laissé vide signifie <strong>« pas encore chiffré »</strong>, jamais zéro.
        Enregistrer un montant ne crée aucune imputation, aucune facture et aucun paiement.
      </p>

      <SubmitButton label="Enregistrer les montants" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}

/** Ventilation facultative du coût — §31, §32, plus « autres frais » (L4). */
export function CostLinePanel({ maintenanceId }: { maintenanceId: string }) {
  const [state, formAction] = useActionState<CostFormState, FormData>(
    addCostLineAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="maintenanceId" value={maintenanceId} />

      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nature" name="kind" error={errors.kind}>
          <Select name="kind" defaultValue="PARTS" error={errors.kind}>
            {COST_LINE_KIND_ORDER.map((kind) => (
              <option key={kind} value={kind}>
                {COST_LINE_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Libellé" name="label" required error={errors.label}>
          <Input name="label" placeholder="Plaquettes de frein avant" error={errors.label} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Quantité" name="quantity" hint="Facultative.">
          <Input name="quantity" inputMode="numeric" className="tabular" />
        </Field>

        <Field label="Prix unitaire" name="unitAmount" hint="Facultatif, en KMF.">
          <Input name="unitAmount" inputMode="numeric" className="tabular" />
        </Field>

        <Field
          label="Montant de la ligne"
          name="amount"
          required
          error={errors.amount}
          hint="Saisi, non calculé."
        >
          <Input name="amount" inputMode="numeric" error={errors.amount} className="tabular" />
        </Field>
      </div>

      <p className="text-xs text-muted">
        La somme des lignes <strong>documente</strong> le coût réel, elle ne le remplace pas :
        la ventilation étant facultative, un total qui en découlerait serait faux dès qu’une
        ligne manque.
      </p>

      <SubmitButton label="Ajouter la ligne" icon={Plus} pendingLabel="Ajout…" />
    </form>
  )
}

/** Enregistrement d'un devis reçu — §26. */
export function QuotePanel({
  maintenanceId,
  providers,
}: {
  maintenanceId: string
  /** `null` sans le droit de consulter les fournisseurs (DEC-017). */
  providers: { id: string; label: string }[] | null
}) {
  const [state, formAction] = useActionState<CostFormState, FormData>(
    addQuoteAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="maintenanceId" value={maintenanceId} />

      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Montant" name="amount" required error={errors.amount} hint="En KMF.">
          <Input name="amount" inputMode="numeric" error={errors.amount} className="tabular" />
        </Field>

        <Field label="Date du devis" name="quotedOn">
          <Input name="quotedOn" type="date" />
        </Field>
      </div>

      <Field
        label="Prestataire"
        name="providerSupplierId"
        hint="Peut différer de celui retenu : on compare des offres."
      >
        {providers === null ? (
          <p className="rounded-control border border-line bg-adikom-50/60 px-3 py-2.5 text-sm text-muted">
            Votre compte ne peut pas consulter les fournisseurs : le prestataire pourra être
            renseigné par quelqu’un qui en a le droit.
          </p>
        ) : (
          <Select name="providerSupplierId" defaultValue="">
            <option value="">Non désigné</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Description" name="description" error={errors.description}>
        <Textarea name="description" rows={2} error={errors.description} />
      </Field>

      <SubmitButton label="Enregistrer le devis" icon={Plus} pendingLabel="Enregistrement…" />
    </form>
  )
}

/**
 * Décision sur un devis — §27.
 *
 * `rental.maintenance.validate`, et non `cost.update` : décider engage
 * l'intervention, saisir ne fait que consigner (arbitrage L2). La décision est
 * DÉFINITIVE — l'écran le dit avant, pas après.
 */
export function QuoteDecisionPanel({
  quoteId,
  maintenanceId,
}: {
  quoteId: string
  maintenanceId: string
}) {
  const [state, formAction] = useActionState<CostFormState, FormData>(
    decideQuoteAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-line pt-3">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="maintenanceId" value={maintenanceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Motif" name={`reason-${quoteId}`} hint="Facultatif, conservé au journal.">
        <Textarea id={`reason-${quoteId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        La décision est <strong>définitive</strong> : un devis décidé ne se modifie plus.
        Accepter ne recopie aucun montant dans les coûts.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="accept"
          className="inline-flex items-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
        >
          <Check className="size-4" aria-hidden />
          Accepter
        </button>
        <button
          type="submit"
          name="decision"
          value="refuse"
          className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
        >
          <X className="size-4" aria-hidden />
          Refuser
        </button>
      </div>
    </form>
  )
}

/** Dépôt d'un justificatif financier — §37, §66. */
export function DocumentPanel({
  maintenanceId,
  quotes,
}: {
  maintenanceId: string
  quotes: { id: string; label: string }[]
}) {
  const [state, formAction] = useActionState<CostFormState, FormData>(
    addDocumentAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="maintenanceId" value={maintenanceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Notice tone="warning">
        Ces pièces ne sont accessibles qu’avec le droit de consulter les coûts, par une adresse
        signée de courte durée. Aucune n’est publiée, aucune ne se supprime.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nature" name="docType" error={errors.docType}>
          <Select name="docType" defaultValue="INVOICE" error={errors.docType}>
            {DOCUMENT_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Intitulé" name="label" required error={errors.label}>
          <Input name="label" placeholder="Facture garage n° 2026-118" error={errors.label} />
        </Field>
      </div>

      {quotes.length > 0 && (
        <Field label="Devis concerné" name="quoteId" hint="Facultatif.">
          <Select name="quoteId" defaultValue="">
            <option value="">Aucun devis en particulier</option>
            {quotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label="Fichier"
        name="file"
        required
        error={errors.file}
        hint="PDF, JPEG, PNG ou WebP. 10 Mo maximum."
      >
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="block w-full rounded-control border border-line px-3 py-2.5 text-sm text-ink file:mr-3 file:rounded-control file:border-0 file:bg-adikom-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-adikom-500"
        />
      </Field>

      <SubmitButton label="Joindre le justificatif" icon={Paperclip} pendingLabel="Dépôt…" />
    </form>
  )
}
