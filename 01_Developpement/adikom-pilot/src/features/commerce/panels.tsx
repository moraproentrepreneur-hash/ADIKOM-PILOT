'use client'

import { useActionState, useState } from 'react'
import { FileText, Plus, Save, X } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatAmount } from '@/lib/money'
import {
  addOrderLineAction,
  addQuoteLineAction,
  archiveOrderLineAction,
  archiveQuoteLineAction,
  convertQuoteAction,
  createSalesOrderAction,
  createSalesQuoteAction,
  invoiceOrderAction,
  setOrderStatusAction,
  setQuoteStatusAction,
  updateSalesOrderAction,
  updateSalesQuoteAction,
  type CommerceFormState,
} from './actions'
import {
  ORDER_ACTION_LABELS,
  ORDER_STATUS_HELP,
  QUOTE_ACTION_LABELS,
  QUOTE_STATUS_HELP,
  type OrderStatus,
  type QuoteStatus,
} from './constants'

/**
 * Formulaires du commerce client — LOT 25, DEC-049.
 *
 * L'ÉCRAN NE PROMET PAS CE QU'IL NE FAIT PAS.
 *
 * Un devis ne facture rien ; une commande n'encaisse rien. Le prix d'une ligne
 * de catalogue n'est pas saisissable — il vient du catalogue, à la date du
 * document —, et le formulaire le DIT avant l'envoi plutôt qu'après.
 *
 * ⚠ LES CHAMPS DE SAISIE SONT PILOTÉS (`useState`).
 *
 * React 19 réinitialise un formulaire après l'exécution de son action, même
 * lorsqu'elle REFUSE : un champ non piloté se viderait et l'utilisateur
 * perdrait sa saisie au moment précis où on lui demande de la corriger.
 */

export type ClientOption = { id: string; label: string }

/** Une variante vendable, telle que l'éditeur de lignes la propose. */
export type VariantOption = {
  variantId: string
  serviceLabel: string
  variantLabel: string
  unitLabel: string | null
  /** `null` : aucun prix en vigueur à la date du document. */
  price: number | null
}

/* ========================================================================== */
/*  Créer un devis                                                             */
/* ========================================================================== */

export function CreateQuotePanel({
  clients,
  today,
  defaultClientId,
}: {
  clients: ClientOption[]
  today: string
  defaultClientId?: string
}) {
  const [state, formAction] = useActionState<CommerceFormState, FormData>(
    createSalesQuoteAction,
    EMPTY_FORM_STATE
  )

  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [quoteDate, setQuoteDate] = useState(today)
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')

  const errors = state.fieldErrors ?? {}

  if (clients.length === 0) {
    return (
      <Notice tone="warning">
        Aucun client n’est lisible avec vos droits. Un devis ne se prépare pas sans savoir à qui il
        s’adresse.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Client"
        name="clientId"
        required
        error={errors.clientId}
        hint="Repris de la fiche client, jamais ressaisi."
      >
        <Select
          name="clientId"
          value={clientId}
          error={errors.clientId}
          onChange={(event) => setClientId(event.target.value)}
        >
          <option value="">Choisir un client…</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Date du devis"
          name="quoteDate"
          required
          error={errors.quoteDate}
          hint="Elle détermine le prix catalogue appliqué à chaque ligne."
        >
          <Input
            name="quoteDate"
            type="date"
            value={quoteDate}
            error={errors.quoteDate}
            onChange={(event) => setQuoteDate(event.target.value)}
          />
        </Field>

        {/*
          AUCUNE DURÉE PAR DÉFAUT. Aucune politique commerciale de validité
          n'est écrite chez ADIKOM : en proposer une ici reviendrait à la
          décider (CLAUDE.md §55). Le champ reste vide tant que personne ne le
          renseigne, et le devis le dit.
        */}
        <Field
          label="Valable jusqu’au"
          name="validUntil"
          error={errors.validUntil}
          hint="Facultatif. Aucune durée n’est proposée : ADIKOM n’en a arrêté aucune."
        >
          <Input
            name="validUntil"
            type="date"
            value={validUntil}
            error={errors.validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Conditions" name="terms" hint="Reprises telles quelles sur le document remis au client.">
        <Textarea
          name="terms"
          rows={2}
          value={terms}
          onChange={(event) => setTerms(event.target.value)}
        />
      </Field>

      <Field label="Observations" name="notes">
        <Textarea
          name="notes"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>

      <SubmitButton label="Créer le devis" icon={Plus} pendingLabel="Création…" />
    </form>
  )
}

/* ========================================================================== */
/*  Modifier l'en-tête d'un devis — tant qu'il est en brouillon                */
/* ========================================================================== */

export function EditQuotePanel({
  quoteId,
  quoteDate,
  validUntil,
  notes,
  terms,
}: {
  quoteId: string
  quoteDate: string
  validUntil: string | null
  notes: string | null
  terms: string | null
}) {
  const [state, formAction] = useActionState<CommerceFormState, FormData>(
    updateSalesQuoteAction,
    EMPTY_FORM_STATE
  )

  const [date, setDate] = useState(quoteDate)
  const [until, setUntil] = useState(validUntil ?? '')
  const [note, setNote] = useState(notes ?? '')
  const [term, setTerm] = useState(terms ?? '')

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="quoteId" value={quoteId} />
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date du devis" name="quoteDate" required error={errors.quoteDate}>
          <Input
            name="quoteDate"
            type="date"
            value={date}
            error={errors.quoteDate}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>

        <Field label="Valable jusqu’au" name="validUntil" error={errors.validUntil}>
          <Input
            name="validUntil"
            type="date"
            value={until}
            error={errors.validUntil}
            onChange={(event) => setUntil(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Conditions" name="terms">
        <Textarea name="terms" rows={2} value={term} onChange={(e) => setTerm(e.target.value)} />
      </Field>

      <Field label="Observations" name="notes">
        <Textarea name="notes" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <p className="text-xs text-muted">
        Le client n’est pas modifiable : le devis d’un autre client est un autre devis. Changer la
        date du devis ne change pas les prix déjà figés sur ses lignes.
      </p>

      <SubmitButton label="Enregistrer" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}

/* ========================================================================== */
/*  Éditeur de lignes — les DEUX types de A-13                                 */
/* ========================================================================== */

/**
 * Ajouter une ligne à un devis ou à une commande.
 *
 * 🟩 A-13 — DEUX NATURES, UN SEUL FORMULAIRE.
 *
 *   CATALOGUE : on choisit une prestation ; le prix est CELUI DU CATALOGUE à la
 *               date du document. Il est affiché, jamais saisissable.
 *   LIBRE     : on désigne la prestation et on fixe le prix. Aucun service
 *               fictif n'est créé pour autant.
 *
 * Sur mobile, le choix de la nature reste un vrai groupe de boutons radio et le
 * choix de la prestation un vrai `select` : aucune fenêtre à cases à cocher ne
 * remplace un déroulant (CLAUDE.md §35 : on réorganise, on ne rétrécit pas).
 */
export function AddLinePanel({
  target,
  documentId,
  variants,
  documentDate,
}: {
  target: 'quote' | 'order'
  documentId: string
  variants: VariantOption[]
  documentDate: string
}) {
  const [state, formAction] = useActionState<CommerceFormState, FormData>(
    target === 'quote' ? addQuoteLineAction : addOrderLineAction,
    EMPTY_FORM_STATE
  )

  const [kind, setKind] = useState<'CATALOG' | 'FREE'>(variants.length > 0 ? 'CATALOG' : 'FREE')
  const [variantId, setVariantId] = useState('')
  const [label, setLabel] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')

  const errors = state.fieldErrors ?? {}
  const chosen = variants.find((variant) => variant.variantId === variantId) ?? null

  const quantityValue = /^\d+$/.test(quantity) ? Number(quantity) : null
  const priceValue =
    kind === 'CATALOG' ? (chosen?.price ?? null) : /^\d+$/.test(unitPrice) ? Number(unitPrice) : null
  const preview =
    quantityValue && quantityValue > 0 && priceValue && priceValue > 0
      ? quantityValue * priceValue
      : null

  const idField = target === 'quote' ? 'quoteId' : 'orderId'

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name={idField} value={documentId} />
      <FormFeedback error={state.error} success={state.success} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Nature de la ligne</legend>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-control border border-line px-3 py-2 text-sm text-ink has-checked:border-adikom-400 has-checked:bg-adikom-50">
            <input
              type="radio"
              name="kindChoice"
              value="CATALOG"
              checked={kind === 'CATALOG'}
              disabled={variants.length === 0}
              onChange={() => {
                setKind('CATALOG')
                setUnitPrice('')
                setLabel('')
              }}
              className="size-4 text-adikom-500"
            />
            Prestation du catalogue
          </label>

          <label className="flex items-center gap-2 rounded-control border border-line px-3 py-2 text-sm text-ink has-checked:border-adikom-400 has-checked:bg-adikom-50">
            <input
              type="radio"
              name="kindChoice"
              value="FREE"
              checked={kind === 'FREE'}
              onChange={() => {
                setKind('FREE')
                setVariantId('')
              }}
              className="size-4 text-adikom-500"
            />
            Ligne libre
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          {kind === 'CATALOG'
            ? `Le prix est celui du catalogue au ${documentDate}. Il est figé sur la ligne : une hausse ultérieure ne le réécrira pas.`
            : 'Une prestation hors catalogue. Elle ne crée aucun service, et n’est pas une remise : c’est un montant convenu pour une prestation qui n’a pas de tarif publié.'}
        </p>
      </fieldset>

      {kind === 'CATALOG' ? (
        variants.length === 0 ? (
          <Notice tone="warning">
            Aucune prestation vendable n’est lisible avec vos droits, ou le catalogue n’en porte
            aucune. Utilisez une ligne libre, ou complétez le catalogue.
          </Notice>
        ) : (
          <Field
            label="Prestation"
            name="variantId"
            required
            error={errors.variantId}
            hint="Seuls les services actifs destinés à la vente figurent ici."
          >
            <Select
              name="variantId"
              value={variantId}
              error={errors.variantId}
              onChange={(event) => setVariantId(event.target.value)}
            >
              <option value="">Choisir une prestation…</option>
              {variants.map((variant) => (
                <option key={variant.variantId} value={variant.variantId}>
                  {variant.serviceLabel} — {variant.variantLabel}
                  {variant.price === null ? ' (aucun prix en vigueur)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        )
      ) : (
        <Field label="Désignation" name="label" required error={errors.label}>
          <Input
            name="label"
            value={label}
            error={errors.label}
            placeholder="Accompagnement, prestation ponctuelle…"
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
      )}

      {/*
        Le champ `label` existe aussi pour une ligne de catalogue : il permet
        d'ajuster la désignation remise au client. Laissé vide, la fonction
        reprend le libellé du service — COPIÉ, donc insensible à un renommage.
      */}
      {kind === 'CATALOG' && (
        <Field
          label="Désignation sur le document"
          name="label"
          hint="Facultatif. Vide, la désignation du catalogue est reprise et figée."
        >
          <Input
            name="label"
            value={label}
            placeholder={chosen ? `${chosen.serviceLabel} — ${chosen.variantLabel}` : ''}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Quantité"
          name="quantity"
          required
          error={errors.quantity}
          hint={chosen?.unitLabel ? `Unité : ${chosen.unitLabel}.` : 'Nombre entier d’unités.'}
        >
          <Input
            name="quantity"
            inputMode="numeric"
            value={quantity}
            error={errors.quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>

        {kind === 'FREE' ? (
          <Field
            label="Prix unitaire (KMF)"
            name="unitPrice"
            required
            error={errors.unitPrice}
            hint="Entier, en francs comoriens."
          >
            <Input
              name="unitPrice"
              inputMode="numeric"
              value={unitPrice}
              error={errors.unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
            />
          </Field>
        ) : (
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Prix unitaire</p>
            <p className="rounded-control border border-line bg-adikom-50/50 px-3 py-2.5 text-sm text-ink tabular">
              {chosen === null
                ? '—'
                : chosen.price === null
                  ? 'Aucun prix en vigueur à cette date'
                  : formatAmount(chosen.price)}
            </p>
            <p className="mt-1.5 text-xs text-muted">
              Le prix vient du catalogue et n’est pas saisissable. Pour un montant convenu,
              choisissez « Ligne libre ».
            </p>
          </div>
        )}
      </div>

      {preview !== null && (
        <p className="text-sm text-ink">
          Montant de la ligne : <strong className="tabular">{formatAmount(preview)}</strong>
        </p>
      )}

      <SubmitButton label="Ajouter la ligne" icon={Plus} pendingLabel="Ajout…" />
    </form>
  )
}

/* ========================================================================== */
/*  Retirer une ligne                                                          */
/* ========================================================================== */

export function ArchiveLineForm({
  target,
  documentId,
  lineId,
}: {
  target: 'quote' | 'order'
  documentId: string
  lineId: string
}) {
  const [state, formAction] = useActionState<CommerceFormState, FormData>(
    target === 'quote' ? archiveQuoteLineAction : archiveOrderLineAction,
    EMPTY_FORM_STATE
  )

  const idField = target === 'quote' ? 'quoteId' : 'orderId'

  return (
    <form action={formAction}>
      <input type="hidden" name={idField} value={documentId} />
      <input type="hidden" name="lineId" value={lineId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1 text-xs text-danger-600 hover:underline"
        title="Retirer cette ligne. Elle est archivée, jamais effacée."
      >
        <X className="size-3.5" aria-hidden />
        Retirer
      </button>
      {state.error && <p className="mt-1 text-xs text-danger-600">{state.error}</p>}
    </form>
  )
}

/* ========================================================================== */
/*  Cycle de vie du devis                                                      */
/* ========================================================================== */

export function QuoteStatusPanel({
  quoteId,
  available,
}: {
  quoteId: string
  /** Les états atteignables ET permis. Vide : la section ne s'affiche pas. */
  available: QuoteStatus[]
}) {
  const [state, formAction] = useActionState<CommerceFormState, FormData>(
    setQuoteStatusAction,
    EMPTY_FORM_STATE
  )

  const [status, setStatus] = useState<QuoteStatus>(available[0])
  const [reason, setReason] = useState('')

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="quoteId" value={quoteId} />
      <FormFeedback error={state.error} success={state.success} />

      <Field label="Action" name="status" required hint={QUOTE_STATUS_HELP[status]}>
        <Select
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as QuoteStatus)}
        >
          {available.map((value) => (
            <option key={value} value={value}>
              {QUOTE_ACTION_LABELS[value] ?? value}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Motif" name="reason" hint="Consigné avec l’acte, et lisible au journal.">
        <Textarea
          name="reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>

      <SubmitButton label="Enregistrer" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}

/* ========================================================================== */
/*  Convertir un devis en commande                                             */
/* ========================================================================== */

export function ConvertQuotePanel({ quoteId, today }: { quoteId: string; today: string }) {
  const [state, formAction] = useActionState<CommerceFormState, FormData>(
    convertQuoteAction,
    EMPTY_FORM_STATE
  )

  const [orderDate, setOrderDate] = useState(today)
  const [expectedDate, setExpectedDate] = useState('')

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="quoteId" value={quoteId} />
      <FormFeedback error={state.error} success={state.success} />

      <Notice tone="info">
        La commande est un <strong>acte nouveau</strong>. Le devis est conservé tel qu’il a été
        remis au client, et <strong>ses prix sont recopiés</strong> : une hausse du catalogue
        survenue depuis n’aura aucun effet.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de la commande" name="orderDate" error={errors.orderDate}>
          <Input
            name="orderDate"
            type="date"
            value={orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
          />
        </Field>

        <Field
          label="Livraison attendue"
          name="expectedDate"
          error={errors.expectedDate}
          hint="Facultative."
        >
          <Input
            name="expectedDate"
            type="date"
            value={expectedDate}
            error={errors.expectedDate}
            onChange={(event) => setExpectedDate(event.target.value)}
          />
        </Field>
      </div>

      <SubmitButton
        label="Convertir en commande"
        icon={FileText}
        pendingLabel="Conversion…"
      />
    </form>
  )
}

/* ========================================================================== */
/*  Commandes                                                                  */
/* ========================================================================== */

export function CreateOrderPanel({
  clients,
  today,
}: {
  clients: ClientOption[]
  today: string
}) {
  const [state, formAction] = useActionState<CommerceFormState, FormData>(
    createSalesOrderAction,
    EMPTY_FORM_STATE
  )

  const [clientId, setClientId] = useState('')
  const [orderDate, setOrderDate] = useState(today)
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')

  const errors = state.fieldErrors ?? {}

  if (clients.length === 0) {
    return (
      <Notice tone="warning">
        Aucun client n’est lisible avec vos droits. Une commande ne se crée pas sans savoir à qui
        elle s’adresse.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />

      <Notice tone="info">
        Une commande peut naître <strong>d’un devis accepté</strong> — depuis la fiche de ce devis —
        ou <strong>directement</strong>, lorsque le client commande sans proposition préalable.
      </Notice>

      <Field label="Client" name="clientId" required error={errors.clientId}>
        <Select
          name="clientId"
          value={clientId}
          error={errors.clientId}
          onChange={(event) => setClientId(event.target.value)}
        >
          <option value="">Choisir un client…</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Date de la commande"
          name="orderDate"
          required
          error={errors.orderDate}
          hint="Elle détermine le prix catalogue appliqué à chaque ligne."
        >
          <Input
            name="orderDate"
            type="date"
            value={orderDate}
            error={errors.orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
          />
        </Field>

        <Field label="Livraison attendue" name="expectedDate" error={errors.expectedDate}>
          <Input
            name="expectedDate"
            type="date"
            value={expectedDate}
            error={errors.expectedDate}
            onChange={(event) => setExpectedDate(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Conditions" name="terms">
        <Textarea name="terms" rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} />
      </Field>

      <Field label="Observations" name="notes">
        <Textarea name="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <SubmitButton label="Créer la commande" icon={Plus} pendingLabel="Création…" />
    </form>
  )
}

export function EditOrderPanel({
  orderId,
  orderDate,
  expectedDate,
  notes,
  terms,
}: {
  orderId: string
  orderDate: string
  expectedDate: string | null
  notes: string | null
  terms: string | null
}) {
  const [state, formAction] = useActionState<CommerceFormState, FormData>(
    updateSalesOrderAction,
    EMPTY_FORM_STATE
  )

  const [date, setDate] = useState(orderDate)
  const [expected, setExpected] = useState(expectedDate ?? '')
  const [note, setNote] = useState(notes ?? '')
  const [term, setTerm] = useState(terms ?? '')

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de la commande" name="orderDate" required error={errors.orderDate}>
          <Input
            name="orderDate"
            type="date"
            value={date}
            error={errors.orderDate}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>

        <Field label="Livraison attendue" name="expectedDate" error={errors.expectedDate}>
          <Input
            name="expectedDate"
            type="date"
            value={expected}
            error={errors.expectedDate}
            onChange={(event) => setExpected(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Conditions" name="terms">
        <Textarea name="terms" rows={2} value={term} onChange={(e) => setTerm(e.target.value)} />
      </Field>

      <Field label="Observations" name="notes">
        <Textarea name="notes" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <p className="text-xs text-muted">
        Ni le client ni le devis d’origine ne sont modifiables : la commande d’un autre engagement
        est une autre commande.
      </p>

      <SubmitButton label="Enregistrer" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}

export function OrderStatusPanel({
  orderId,
  available,
}: {
  orderId: string
  available: OrderStatus[]
}) {
  const [state, formAction] = useActionState<CommerceFormState, FormData>(
    setOrderStatusAction,
    EMPTY_FORM_STATE
  )

  const [status, setStatus] = useState<OrderStatus>(available[0])
  const [reason, setReason] = useState('')

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      <FormFeedback error={state.error} success={state.success} />

      <Field label="Action" name="status" required hint={ORDER_STATUS_HELP[status]}>
        <Select
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as OrderStatus)}
        >
          {available.map((value) => (
            <option key={value} value={value}>
              {ORDER_ACTION_LABELS[value] ?? value}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Motif" name="reason" hint="Consigné avec l’acte, et lisible au journal.">
        <Textarea
          name="reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>

      <SubmitButton label="Enregistrer" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}

/* ========================================================================== */
/*  Facturer une commande — par la chaîne existante                            */
/* ========================================================================== */

export function InvoiceOrderPanel({ orderId, today }: { orderId: string; today: string }) {
  const [state, formAction] = useActionState<CommerceFormState, FormData>(
    invoiceOrderAction,
    EMPTY_FORM_STATE
  )

  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState('')

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      <FormFeedback error={state.error} success={state.success} />

      <Notice tone="info">
        La facture est préparée <strong>en brouillon</strong>, dans le module Factures clients.
        L’<strong>émettre</strong> reste un acte distinct : c’est l’émission qui reconnaît la
        créance, et c’est elle qui ouvre les règlements.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de la facture" name="invoiceDate" error={errors.invoiceDate}>
          <Input
            name="invoiceDate"
            type="date"
            value={invoiceDate}
            onChange={(event) => setInvoiceDate(event.target.value)}
          />
        </Field>

        <Field label="Échéance" name="dueDate" error={errors.dueDate} hint="Facultative.">
          <Input
            name="dueDate"
            type="date"
            value={dueDate}
            error={errors.dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
      </div>

      <SubmitButton label="Préparer la facture" icon={FileText} pendingLabel="Préparation…" />
    </form>
  )
}
