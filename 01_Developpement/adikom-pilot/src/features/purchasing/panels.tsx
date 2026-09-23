'use client'

import { useActionState, useState } from 'react'
import { FileText, Plus, Save, X } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatAmount } from '@/lib/money'
import {
  addPurchaseOrderLineAction,
  addPurchaseQuoteLineAction,
  archivePurchaseOrderLineAction,
  archivePurchaseQuoteLineAction,
  convertPurchaseQuoteAction,
  createPurchaseOrderAction,
  createPurchaseQuoteAction,
  invoicePurchaseOrderAction,
  setPurchaseOrderStatusAction,
  setPurchaseQuoteStatusAction,
  updatePurchaseOrderAction,
  updatePurchaseQuoteAction,
  type PurchasingFormState,
} from './actions'
import {
  PURCHASE_ORDER_ACTION_LABELS,
  PURCHASE_ORDER_STATUS_HELP,
  PURCHASE_QUOTE_ACTION_LABELS,
  PURCHASE_QUOTE_STATUS_HELP,
  type PurchaseOrderStatus,
  type PurchaseQuoteStatus,
} from './constants'

/**
 * Formulaires du commerce FOURNISSEUR — LOT 26.
 *
 * L'ÉCRAN NE PROMET PAS CE QU'IL NE FAIT PAS.
 *
 * Un devis fournisseur n'engage aucun paiement ; une commande n'en déclenche
 * aucun. Le prix d'une ligne est TOUJOURS celui de l'offre — le coût du
 * catalogue est montré à côté, comme repère, et le formulaire le DIT.
 *
 * ⚠ LES CHAMPS DE SAISIE SONT PILOTÉS (`useState`).
 *
 * React 19 réinitialise un formulaire après l'exécution de son action, même
 * lorsqu'elle REFUSE : un champ non piloté se viderait et l'utilisateur perdrait
 * sa saisie au moment précis où on lui demande de la corriger.
 */

export type SupplierOption = { id: string; label: string }

/** Une variante achetable, telle que l'éditeur de lignes la propose. */
export type PurchasableOption = {
  variantId: string
  serviceLabel: string
  variantLabel: string
  unitLabel: string | null
  /**
   * Coût de RÉFÉRENCE du catalogue, indicatif. `null` sans
   * `catalog.services.cost.view` ou si aucune version n'est en vigueur.
   */
  referenceCost: number | null
}

/* ========================================================================== */
/*  Enregistrer une offre reçue                                                */
/* ========================================================================== */

export function CreatePurchaseQuotePanel({
  suppliers,
  today,
  defaultSupplierId,
}: {
  suppliers: SupplierOption[]
  today: string
  defaultSupplierId?: string
}) {
  const [state, formAction] = useActionState<PurchasingFormState, FormData>(
    createPurchaseQuoteAction,
    EMPTY_FORM_STATE
  )

  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? '')
  const [quoteDate, setQuoteDate] = useState(today)
  const [validUntil, setValidUntil] = useState('')
  const [externalRef, setExternalRef] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')

  const errors = state.fieldErrors ?? {}

  if (suppliers.length === 0) {
    return (
      <Notice tone="warning">
        Aucun fournisseur actif n’est lisible avec vos droits. Une offre ne s’enregistre pas sans
        savoir de qui elle vient.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />

      <Field
        label="Fournisseur"
        name="supplierId"
        required
        error={errors.supplierId}
        hint="Repris de la fiche fournisseur, jamais ressaisi."
      >
        <Select
          name="supplierId"
          value={supplierId}
          error={errors.supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <option value="">Choisir un fournisseur…</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.label}
            </option>
          ))}
        </Select>
      </Field>

      {/*
        LA RÉFÉRENCE DU FOURNISSEUR — distincte du numéro interne d'ADIKOM.
        C'est par elle que l'offre se retrouve dans les archives du fournisseur.
      */}
      <Field
        label="Référence du fournisseur"
        name="externalRef"
        error={errors.externalRef}
        hint="Facultative. Le numéro que le fournisseur a donné à son offre — ADIKOM lui attribue le sien, en plus."
      >
        <Input
          name="externalRef"
          value={externalRef}
          error={errors.externalRef}
          placeholder="PRO-2026-0147…"
          onChange={(event) => setExternalRef(event.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Date de l’offre"
          name="quoteDate"
          required
          error={errors.quoteDate}
          hint="Celle que porte le document du fournisseur."
        >
          <Input
            name="quoteDate"
            type="date"
            value={quoteDate}
            error={errors.quoteDate}
            onChange={(event) => setQuoteDate(event.target.value)}
          />
        </Field>

        <Field
          label="Valable jusqu’au"
          name="validUntil"
          error={errors.validUntil}
          hint="Facultative. C’est le fournisseur qui la fixe : aucune durée n’est proposée."
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

      <Field
        label="Conditions"
        name="terms"
        hint="Celles annoncées par le fournisseur : délai, transport, garantie."
      >
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

      <SubmitButton label="Enregistrer l’offre" icon={Plus} pendingLabel="Enregistrement…" />
    </form>
  )
}

/* ========================================================================== */
/*  Modifier l'en-tête d'une offre — tant qu'elle est en brouillon             */
/* ========================================================================== */

export function EditPurchaseQuotePanel({
  quoteId,
  quoteDate,
  validUntil,
  externalRef,
  notes,
  terms,
}: {
  quoteId: string
  quoteDate: string
  validUntil: string | null
  externalRef: string | null
  notes: string | null
  terms: string | null
}) {
  const [state, formAction] = useActionState<PurchasingFormState, FormData>(
    updatePurchaseQuoteAction,
    EMPTY_FORM_STATE
  )

  const [date, setDate] = useState(quoteDate)
  const [until, setUntil] = useState(validUntil ?? '')
  const [reference, setReference] = useState(externalRef ?? '')
  const [note, setNote] = useState(notes ?? '')
  const [term, setTerm] = useState(terms ?? '')

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="quoteId" value={quoteId} />
      <FormFeedback error={state.error} success={state.success} />

      <Field label="Référence du fournisseur" name="externalRef" error={errors.externalRef}>
        <Input
          name="externalRef"
          value={reference}
          error={errors.externalRef}
          onChange={(event) => setReference(event.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de l’offre" name="quoteDate" required error={errors.quoteDate}>
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
        Le fournisseur n’est pas modifiable : l’offre d’un autre fournisseur est une autre offre.
      </p>

      <SubmitButton label="Enregistrer" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}

/* ========================================================================== */
/*  Éditeur de lignes — les DEUX types de A-13                                 */
/* ========================================================================== */

/**
 * Ajouter une ligne à un devis ou à une commande fournisseur.
 *
 * 🟩 A-13 — DEUX NATURES, UN SEUL FORMULAIRE.
 *
 *   CATALOGUE : on nomme une prestation du catalogue. Le service et la variante
 *               servent la TRAÇABILITÉ — « qu'a-t-on acheté ».
 *   LIBRE     : on désigne la prestation soi-même. Aucun service n'est créé.
 *
 * 🟥 DANS LES DEUX CAS, LE PRIX EST SAISI — et c'est la différence centrale avec
 * le commerce client, où le prix d'une ligne de catalogue vient du catalogue.
 * Le coût de référence est affiché À CÔTÉ du champ, jamais dedans : c'est ce
 * qu'ADIKOM paie d'habitude, pas ce que CE fournisseur propose. Le catalogue ne
 * connaît pas encore le coût par fournisseur (point P-5, ouvert), et faire
 * passer l'un pour l'autre serait le trancher sans décision.
 */
export function AddPurchaseLinePanel({
  target,
  documentId,
  variants,
  documentDate,
  mayReadCost,
}: {
  target: 'quote' | 'order'
  documentId: string
  variants: PurchasableOption[]
  documentDate: string
  mayReadCost: boolean
}) {
  const [state, formAction] = useActionState<PurchasingFormState, FormData>(
    target === 'quote' ? addPurchaseQuoteLineAction : addPurchaseOrderLineAction,
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
  const priceValue = /^\d+$/.test(unitPrice) ? Number(unitPrice) : null
  const preview =
    quantityValue && quantityValue > 0 && priceValue && priceValue > 0
      ? quantityValue * priceValue
      : null

  /* L'écart au repère, tant qu'il y a un repère ET un prix saisi. */
  const gap =
    chosen?.referenceCost != null && priceValue != null && priceValue > 0
      ? priceValue - chosen.referenceCost
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
            ? 'La prestation est nommée pour la traçabilité. Le prix, lui, reste celui que ce fournisseur propose.'
            : 'Une prestation hors catalogue. Elle ne crée aucun service.'}
        </p>
      </fieldset>

      {kind === 'CATALOG' ? (
        variants.length === 0 ? (
          <Notice tone="warning">
            Aucune prestation achetable n’est lisible avec vos droits, ou le catalogue n’en porte
            aucune. Utilisez une ligne libre, ou complétez le catalogue.
          </Notice>
        ) : (
          <Field
            label="Prestation"
            name="variantId"
            required
            error={errors.variantId}
            hint="Seuls les services actifs destinés à l’achat figurent ici."
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
            placeholder="Pièce détachée, prestation ponctuelle…"
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
      )}

      {kind === 'CATALOG' && (
        <Field
          label="Désignation sur le document"
          name="label"
          hint="Facultative. Vide, la désignation du catalogue est reprise et figée."
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

        <Field
          label="Prix unitaire proposé (KMF)"
          name="unitPrice"
          required
          error={errors.unitPrice}
          hint="Le prix de CE fournisseur, entier, en francs comoriens."
        >
          <Input
            name="unitPrice"
            inputMode="numeric"
            value={unitPrice}
            error={errors.unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
          />
        </Field>
      </div>

      {/*
        🟥 LE REPÈRE, ET SEULEMENT UN REPÈRE.

        Il n'est montré qu'à qui détient `catalog.services.cost.view`, et il
        n'est jamais recopié dans le champ : le catalogue ne connaît pas le coût
        PAR FOURNISSEUR (P-5), et l'appliquer ferait passer une valeur interne
        pour une offre reçue.
      */}
      {kind === 'CATALOG' && chosen !== null && (
        <div className="rounded-control border border-line bg-adikom-50/50 p-3">
          {!mayReadCost ? (
            <p className="text-xs text-muted">
              Le coût de référence du catalogue n’est pas communiqué à votre compte. Le prix de
              cette ligne reste celui que le fournisseur propose.
            </p>
          ) : chosen.referenceCost === null ? (
            <p className="text-xs text-muted">
              Aucun coût de référence n’est en vigueur au {documentDate} pour cette prestation. Le
              prix de la ligne reste, de toute façon, celui de l’offre.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink">
                Coût de référence au {documentDate} :{' '}
                <strong className="tabular">{formatAmount(chosen.referenceCost)}</strong>
              </p>
              {gap !== null && gap !== 0 && (
                <p
                  className={`mt-1 text-xs font-medium tabular ${
                    gap > 0 ? 'text-warning-700' : 'text-success-700'
                  }`}
                >
                  {gap > 0 ? '+' : '−'}
                  {formatAmount(Math.abs(gap))} par rapport au repère
                </p>
              )}
              <p className="mt-1.5 text-xs text-muted">
                Repère interne, jamais appliqué : le catalogue porte un coût unique par prestation,
                sans distinction de fournisseur.
              </p>
            </>
          )}
        </div>
      )}

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

export function ArchivePurchaseLineForm({
  target,
  documentId,
  lineId,
}: {
  target: 'quote' | 'order'
  documentId: string
  lineId: string
}) {
  const [state, formAction] = useActionState<PurchasingFormState, FormData>(
    target === 'quote' ? archivePurchaseQuoteLineAction : archivePurchaseOrderLineAction,
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
/*  Cycle de vie de l'offre                                                    */
/* ========================================================================== */

export function PurchaseQuoteStatusPanel({
  quoteId,
  available,
}: {
  quoteId: string
  /** Les états atteignables ET permis. Vide : la section ne s'affiche pas. */
  available: PurchaseQuoteStatus[]
}) {
  const [state, formAction] = useActionState<PurchasingFormState, FormData>(
    setPurchaseQuoteStatusAction,
    EMPTY_FORM_STATE
  )

  const [status, setStatus] = useState<PurchaseQuoteStatus>(available[0])
  const [reason, setReason] = useState('')

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="quoteId" value={quoteId} />
      <FormFeedback error={state.error} success={state.success} />

      <Field label="Action" name="status" required hint={PURCHASE_QUOTE_STATUS_HELP[status]}>
        <Select
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as PurchaseQuoteStatus)}
        >
          {available.map((value) => (
            <option key={value} value={value}>
              {PURCHASE_QUOTE_ACTION_LABELS[value] ?? value}
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
/*  Convertir une offre en commande                                            */
/* ========================================================================== */

export function ConvertPurchaseQuotePanel({
  quoteId,
  today,
}: {
  quoteId: string
  today: string
}) {
  const [state, formAction] = useActionState<PurchasingFormState, FormData>(
    convertPurchaseQuoteAction,
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
        La commande est un <strong>acte nouveau</strong>. L’offre est conservée telle que le
        fournisseur l’a remise, avec sa référence, et <strong>ses prix sont recopiés</strong> : une
        évolution du catalogue n’a aucun effet.
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
          label="Réception attendue"
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

      <SubmitButton label="Convertir en commande" icon={FileText} pendingLabel="Conversion…" />
    </form>
  )
}

/* ========================================================================== */
/*  Commandes fournisseurs                                                     */
/* ========================================================================== */

export function CreatePurchaseOrderPanel({
  suppliers,
  today,
}: {
  suppliers: SupplierOption[]
  today: string
}) {
  const [state, formAction] = useActionState<PurchasingFormState, FormData>(
    createPurchaseOrderAction,
    EMPTY_FORM_STATE
  )

  const [supplierId, setSupplierId] = useState('')
  const [orderDate, setOrderDate] = useState(today)
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')

  const errors = state.fieldErrors ?? {}

  if (suppliers.length === 0) {
    return (
      <Notice tone="warning">
        Aucun fournisseur actif n’est lisible avec vos droits. Une commande ne se crée pas sans
        savoir à qui elle s’adresse.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />

      <Notice tone="info">
        Une commande peut naître <strong>d’une offre retenue</strong> — depuis la fiche de ce devis
        — ou <strong>directement</strong>, lorsqu’ADIKOM commande sans avoir demandé d’offre.
      </Notice>

      <Field label="Fournisseur" name="supplierId" required error={errors.supplierId}>
        <Select
          name="supplierId"
          value={supplierId}
          error={errors.supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <option value="">Choisir un fournisseur…</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de la commande" name="orderDate" required error={errors.orderDate}>
          <Input
            name="orderDate"
            type="date"
            value={orderDate}
            error={errors.orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
          />
        </Field>

        <Field
          label="Réception attendue"
          name="expectedDate"
          error={errors.expectedDate}
          hint="Facultative. Aucun bon de réception n’est produit : c’est un statut."
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

export function EditPurchaseOrderPanel({
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
  const [state, formAction] = useActionState<PurchasingFormState, FormData>(
    updatePurchaseOrderAction,
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

        <Field label="Réception attendue" name="expectedDate" error={errors.expectedDate}>
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
        Ni le fournisseur ni l’offre d’origine ne sont modifiables : la commande d’un autre
        engagement est une autre commande.
      </p>

      <SubmitButton label="Enregistrer" icon={Save} pendingLabel="Enregistrement…" />
    </form>
  )
}

export function PurchaseOrderStatusPanel({
  orderId,
  available,
}: {
  orderId: string
  available: PurchaseOrderStatus[]
}) {
  const [state, formAction] = useActionState<PurchasingFormState, FormData>(
    setPurchaseOrderStatusAction,
    EMPTY_FORM_STATE
  )

  const [status, setStatus] = useState<PurchaseOrderStatus>(available[0])
  const [reason, setReason] = useState('')

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      <FormFeedback error={state.error} success={state.success} />

      <Field label="Action" name="status" required hint={PURCHASE_ORDER_STATUS_HELP[status]}>
        <Select
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as PurchaseOrderStatus)}
        >
          {available.map((value) => (
            <option key={value} value={value}>
              {PURCHASE_ORDER_ACTION_LABELS[value] ?? value}
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
/*  Enregistrer la facture d'une commande — par la chaîne existante            */
/* ========================================================================== */

export function InvoicePurchaseOrderPanel({
  orderId,
  today,
}: {
  orderId: string
  today: string
}) {
  const [state, formAction] = useActionState<PurchasingFormState, FormData>(
    invoicePurchaseOrderAction,
    EMPTY_FORM_STATE
  )

  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState('')
  const [externalRef, setExternalRef] = useState('')

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      <FormFeedback error={state.error} success={state.success} />

      <Notice tone="info">
        La facture est préparée <strong>en brouillon</strong>, dans le module Factures
        fournisseurs, avec les lignes de la commande. <strong>La soumettre au contrôle puis la
        valider</strong> restent des actes distincts : c’est la validation qui reconnaît la dette,
        et elle seule ouvre l’imputation et le règlement.
      </Notice>

      <Field
        label="Référence de la facture du fournisseur"
        name="externalRef"
        error={errors.externalRef}
        hint="Facultative. Le numéro porté par la facture reçue — distinct du numéro interne d’ADIKOM."
      >
        <Input
          name="externalRef"
          value={externalRef}
          error={errors.externalRef}
          placeholder="FA-2026-0912…"
          onChange={(event) => setExternalRef(event.target.value)}
        />
      </Field>

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

      <p className="text-xs text-muted">
        Les lignes sont recopiées pour épargner une ressaisie, et restent modifiables tant que la
        facture est en saisie : le fournisseur a pu facturer autre chose que ce qui a été commandé.
      </p>

      <SubmitButton label="Enregistrer la facture" icon={FileText} pendingLabel="Enregistrement…" />
    </form>
  )
}
