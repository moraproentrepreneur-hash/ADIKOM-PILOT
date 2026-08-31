'use client'

import { useActionState, useState } from 'react'
import { Check, Plus, Save, X } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import {
  addCustomerInvoiceLineAction,
  archiveCustomerInvoiceLineAction,
  cancelCustomerInvoiceAction,
  createCustomerInvoiceAction,
  issueCustomerInvoiceAction,
  updateCustomerInvoiceAction,
  type CustomerInvoiceFormState,
} from './actions'
import {
  formatAmount,
  LINE_KIND_HELP,
  LINE_KIND_LABELS,
  LINE_KIND_ORDER,
  type CustomerInvoiceLineKind,
} from './constants'

/**
 * Formulaires de la facturation client — Étape 2.5, LOT 7.
 *
 * L'ÉCRAN NE PROMET PAS CE QU'IL NE FAIT PAS.
 *
 * Émettre une facture reconnaît une créance ; elle ne l'encaisse pas. Et la
 * quantité de la ligne de location n'est JAMAIS proposée : la durée facturable
 * dépend d'une règle d'arrondi qui n'est pas arrêtée (DEC-008). Le formulaire le
 * dit AVANT l'envoi, pas après.
 */

type Option = { id: string; label: string }

export type RentalOption = {
  id: string
  label: string
  clientId: string
  lockedAmount: number
  lockedUnit: string
}

/* -------------------------------------------------------------------------- */
/*  Préparer une facture — Workflow 07 §18                                     */
/* -------------------------------------------------------------------------- */

export function CreateCustomerInvoicePanel({
  clients,
  rentals,
  defaultClientId,
  defaultRentalId,
  today,
}: {
  clients: Option[]
  /** Locations « À facturer » : les seules facturables (§5). */
  rentals: RentalOption[]
  defaultClientId?: string
  defaultRentalId?: string
  today: string
}) {
  const [state, formAction] = useActionState<CustomerInvoiceFormState, FormData>(
    createCustomerInvoiceAction,
    EMPTY_FORM_STATE
  )

  const [rentalId, setRentalId] = useState(defaultRentalId ?? '')
  const [clientId, setClientId] = useState(
    defaultClientId ?? rentals.find((r) => r.id === defaultRentalId)?.clientId ?? ''
  )

  const errors = state.fieldErrors ?? {}
  const chosen = rentals.find((rental) => rental.id === rentalId) ?? null

  if (clients.length === 0) {
    return (
      <Notice tone="warning">
        Aucun client actif n’est lisible avec vos droits. Une facture ne se prépare pas sans savoir
        à qui elle s’adresse.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Location facturée"
        name="rentalId"
        error={errors.rentalId}
        hint="Facultatif. Seules les locations « À facturer » figurent ici : le retour doit être enregistré et le contrôle validé (§5)."
      >
        <Select
          name="rentalId"
          value={rentalId}
          error={errors.rentalId}
          onChange={(event) => {
            const next = event.target.value
            setRentalId(next)
            // Le client SUIT la location : la chaîne Facture → Location → Client
            // ne se rompt pas (§49), et la base refuserait l'incohérence.
            const rental = rentals.find((item) => item.id === next)
            if (rental) setClientId(rental.clientId)
          }}
        >
          <option value="">Aucune — facture de services</option>
          {rentals.map((rental) => (
            <option key={rental.id} value={rental.id}>
              {rental.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Client facturé"
        name="clientId"
        required
        error={errors.clientId}
        hint={
          chosen
            ? 'Repris de la location : une facture s’adresse au client du contrat (§49).'
            : 'Repris de la fiche client, jamais ressaisi (§6).'
        }
      >
        <Select
          name="clientId"
          value={clientId}
          error={errors.clientId}
          disabled={Boolean(chosen)}
          onChange={(event) => setClientId(event.target.value)}
        >
          <option value="">À désigner</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.label}
            </option>
          ))}
        </Select>
        {chosen && <input type="hidden" name="clientId" value={clientId} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de la facture" name="invoiceDate" required error={errors.invoiceDate}>
          <Input
            name="invoiceDate"
            type="date"
            defaultValue={today}
            error={errors.invoiceDate}
          />
        </Field>

        <Field
          label="Échéance"
          name="dueDate"
          error={errors.dueDate}
          hint="Facultative (§21). Elle sert au suivi des retards."
        >
          <Input name="dueDate" type="date" error={errors.dueDate} />
        </Field>
      </div>

      <Field label="Observations" name="notes">
        <Textarea name="notes" rows={2} />
      </Field>

      {chosen && (
        <Notice tone="info">
          Tarif verrouillé du contrat :{' '}
          <strong>
            {formatAmount(chosen.lockedAmount)}
            {chosen.lockedUnit === 'DAY' ? ' / jour' : ' — forfait'}
          </strong>
          . Il sera repris comme prix unitaire de la ligne de location ; la{' '}
          <strong>quantité</strong> reste à saisir : la règle d’arrondi de durée n’est pas définie.
        </Notice>
      )}

      <p className="text-xs text-muted">
        La facture est préparée <strong>en brouillon</strong>. Son total viendra de ses lignes :
        une facture sans ligne ne peut pas être émise.
      </p>

      <SubmitButton label="Préparer la facture" icon={Plus} pendingLabel="Préparation…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Modifier l'en-tête                                                         */
/* -------------------------------------------------------------------------- */

export function EditCustomerInvoicePanel({
  invoiceId,
  invoiceDate,
  dueDate,
  notes,
}: {
  invoiceId: string
  invoiceDate: string
  dueDate: string | null
  notes: string | null
}) {
  const [state, formAction] = useActionState<CustomerInvoiceFormState, FormData>(
    updateCustomerInvoiceAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Date de la facture" name="invoiceDate" required error={errors.invoiceDate}>
        <Input
          name="invoiceDate"
          type="date"
          defaultValue={invoiceDate}
          error={errors.invoiceDate}
        />
      </Field>

      <Field label="Échéance" name="dueDate" error={errors.dueDate}>
        <Input name="dueDate" type="date" defaultValue={dueDate ?? ''} error={errors.dueDate} />
      </Field>

      <Field label="Observations" name="notes">
        <Textarea name="notes" rows={2} defaultValue={notes ?? ''} />
      </Field>

      <p className="text-xs text-muted">
        Ni le client ni la location ne sont modifiables : la facture d’une autre prestation est une
        autre facture.
      </p>

      <SubmitButton label="Enregistrer" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Lignes — la seule source des montants                                      */
/* -------------------------------------------------------------------------- */

export function AddCustomerInvoiceLinePanel({
  invoiceId,
  suggestedLabel,
  suggestedUnitPrice,
  suggestedUnit,
}: {
  invoiceId: string
  /** Désignation proposée pour la ligne de location, quand la facture en porte une. */
  suggestedLabel: string | null
  /** Tarif verrouillé du contrat (§7, §8). Jamais recalculé. */
  suggestedUnitPrice: number | null
  suggestedUnit: string | null
}) {
  const [state, formAction] = useActionState<CustomerInvoiceFormState, FormData>(
    addCustomerInvoiceLineAction,
    EMPTY_FORM_STATE
  )

  const [kind, setKind] = useState<CustomerInvoiceLineKind>(
    suggestedUnitPrice !== null ? 'RENTAL' : 'SERVICE'
  )

  const errors = state.fieldErrors ?? {}
  const isRental = kind === 'RENTAL'
  const flatRate = suggestedUnit === 'FLAT'

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Nature" name="kind" required error={errors.kind} hint={LINE_KIND_HELP[kind]}>
        <Select
          name="kind"
          value={kind}
          error={errors.kind}
          onChange={(event) => setKind(event.target.value as CustomerInvoiceLineKind)}
        >
          {LINE_KIND_ORDER.map((value) => (
            <option key={value} value={value}>
              {LINE_KIND_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Désignation" name="label" required error={errors.label}>
        <Input
          name="label"
          key={`${kind}-${suggestedLabel ?? ''}`}
          defaultValue={isRental && suggestedLabel ? suggestedLabel : ''}
          placeholder="Location Toyota T5, siège enfant, carburant manquant…"
          error={errors.label}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Quantité"
          name="quantity"
          required
          error={errors.quantity}
          hint={
            isRental && !flatRate
              ? 'Nombre d’unités facturées. Aucune durée n’est proposée : la règle d’arrondi n’est pas définie.'
              : 'Nombre d’unités facturées.'
          }
        >
          <Input
            name="quantity"
            key={`${kind}-qty`}
            inputMode="numeric"
            defaultValue={isRental && !flatRate ? '' : '1'}
            error={errors.quantity}
            className="tabular"
          />
        </Field>

        <Field
          label="Prix unitaire"
          name="unitPrice"
          required
          error={errors.unitPrice}
          hint={
            isRental && suggestedUnitPrice !== null
              ? 'Tarif verrouillé du contrat, repris tel quel (§7, §8).'
              : 'En KMF, sans décimale.'
          }
        >
          <Input
            name="unitPrice"
            key={`${kind}-price`}
            inputMode="numeric"
            defaultValue={
              isRental && suggestedUnitPrice !== null ? String(suggestedUnitPrice) : ''
            }
            error={errors.unitPrice}
            className="tabular"
          />
        </Field>
      </div>

      <Field
        label="Justification"
        name="justification"
        hint="Recommandée pour un frais : elle explique ce que le client paie (§15)."
      >
        <Textarea name="justification" rows={2} />
      </Field>

      {kind === 'DISCOUNT' && (
        <Notice tone="info">
          Cette ligne se <strong>soustraira</strong> du total. Saisissez un montant{' '}
          <strong>positif</strong> : c’est la nature de la ligne qui porte le sens, jamais le signe.
        </Notice>
      )}

      <SubmitButton label="Ajouter la ligne" icon={Plus} pendingLabel="Ajout…" />
    </form>
  )
}

/** Retrait d'une ligne — archivage, jamais suppression (CLAUDE.md §22). */
export function ArchiveCustomerLineButton({
  invoiceId,
  lineId,
}: {
  invoiceId: string
  lineId: string
}) {
  const [state, formAction] = useActionState<CustomerInvoiceFormState, FormData>(
    archiveCustomerInvoiceLineAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="lineId" value={lineId} />
      {state.error && <span className="mr-2 text-xs text-danger">{state.error}</span>}
      <button type="submit" className="text-xs text-muted underline hover:text-ink">
        Retirer
      </button>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Émettre et annuler                                                         */
/* -------------------------------------------------------------------------- */

export function IssueCustomerInvoicePanel({
  invoiceId,
  hasRental,
  total,
}: {
  invoiceId: string
  hasRental: boolean
  total: number
}) {
  const [state, formAction] = useActionState<CustomerInvoiceFormState, FormData>(
    issueCustomerInvoiceAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Motif" name={`reason-issue-${invoiceId}`} hint="Facultatif, conservé au journal.">
        <Textarea id={`reason-issue-${invoiceId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Émettre <strong>reconnaît une créance de {formatAmount(total)}</strong> et fige les lignes.
        {hasRental && ' La location passera « Facturée ».'} Aucun encaissement n’est enregistré :
        les règlements clients relèvent d’une étape ultérieure.
      </p>

      <SubmitButton label="Émettre la facture" icon={Check} pendingLabel="Émission…" />
    </form>
  )
}

export function CancelCustomerInvoicePanel({
  invoiceId,
  hasRental,
}: {
  invoiceId: string
  hasRental: boolean
}) {
  const [state, formAction] = useActionState<CustomerInvoiceFormState, FormData>(
    cancelCustomerInvoiceAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <FormFeedback error={state.error} success={state.success} />

      <Field label="Motif" name={`reason-cancel-${invoiceId}`} hint="Facultatif, conservé au journal.">
        <Textarea id={`reason-cancel-${invoiceId}`} name="reason" rows={2} />
      </Field>

      <p className="text-xs text-muted">
        Rien n’est effacé : l’historique est conservé.
        {hasRental &&
          ' La location redeviendra « À facturer » et pourra être refacturée — sauf si elle est déjà clôturée.'}
      </p>

      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
      >
        <X className="size-4" aria-hidden />
        Annuler la facture
      </button>
    </form>
  )
}
