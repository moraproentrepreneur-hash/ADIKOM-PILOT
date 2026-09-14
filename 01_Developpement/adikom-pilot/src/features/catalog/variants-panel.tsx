'use client'

import { useActionState, useState } from 'react'
import { CircleSlash, Layers, Plus, Star, TrendingUp } from 'lucide-react'

import { ACTION_BASE, ACTION_TONES, Badge, EmptyState } from '@/components/ui/primitives'
import { Field, FormSection, Input } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  createServiceVariantAction,
  deactivatePriceVersionAction,
  setServiceCostAction,
  setServicePriceAction,
  updateServiceVariantAction,
  type CatalogFormState,
} from './actions'
import { allowsPurchase, allowsSale, formatMoney, margin, type ServicePurpose } from './constants'
import type { PriceVersionRow, ResolvedPrice, ServiceVariantRow } from './data'

/**
 * Variantes d'un service, et leurs prix — LOT 20, DEC-043.
 *
 * TROIS RÈGLES DE LECTURE, APPLIQUÉES SANS EXCEPTION :
 *
 *   1. UN PRIX ABSENT N'EST PAS UN PRIX NUL. « Aucun prix applicable à cette
 *      date » est écrit en toutes lettres ; jamais « 0 KMF » (DEC-008).
 *
 *   2. UN BLOC FERMÉ EST NOMMÉ. Sans `catalog.services.cost.view`, les prix
 *      d'achat ne sont pas silencieusement absents : l'écran DIT qu'ils
 *      existent peut-être et qu'ils ne sont pas ouverts (DEC-017). Les taire
 *      laisserait croire qu'il n'y a rien à voir.
 *
 *   3. LA MARGE NE SE DEVINE PAS. Elle n'apparaît que si les DEUX prix sont
 *      résolus à la date considérée, et que le lecteur a le droit de voir le
 *      coût. Sinon, l'écran dit ce qui manque.
 *
 * Rien de tout cela n'est une protection : la protection est en base. L'écran
 * ne fait que ne pas mentir.
 */

export type VariantPricing = {
  variant: ServiceVariantRow
  salePrice: ResolvedPrice | null
  purchaseCost: ResolvedPrice | null
  saleHistory: PriceVersionRow[]
  costHistory: PriceVersionRow[]
}

export function ServiceVariantsPanel({
  serviceId,
  purpose,
  status,
  today,
  rows,
  canUpdate,
  canUpdatePrice,
  canSeeCost,
  canUpdateCost,
}: {
  serviceId: string
  purpose: ServicePurpose
  status: string
  today: string
  rows: VariantPricing[]
  canUpdate: boolean
  canUpdatePrice: boolean
  canSeeCost: boolean
  canUpdateCost: boolean
}) {
  const [adding, setAdding] = useState(false)
  const sellable = allowsSale(purpose)
  const purchasable = allowsPurchase(purpose)

  return (
    <div className="space-y-5">
      {status === 'ARCHIVED' && (
        <Notice tone="info">
          Ce service est archivé. Ses variantes et ses prix restent consultables ; les modifier
          suppose de le réactiver d’abord.
        </Notice>
      )}

      {canUpdate &&
        (adding ? (
          <VariantForm serviceId={serviceId} onFinished={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(ACTION_BASE, ACTION_TONES.secondary)}
          >
            <Plus className="size-3.5" aria-hidden />
            Ajouter une variante
          </button>
        ))}

      {rows.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Aucune variante"
          description="Un service devrait toujours porter au moins une variante — c’est elle qui porte les prix."
        />
      ) : (
        <ul className="space-y-5">
          {rows.map((row) => (
            <li key={row.variant.id} className="rounded-control border border-line">
              <VariantHeader
                serviceId={serviceId}
                variant={row.variant}
                canUpdate={canUpdate}
              />

              <div className="space-y-5 px-4 pb-4">
                {sellable && (
                  <PriceBlock
                    kind="SALE"
                    title="Prix de vente"
                    serviceId={serviceId}
                    variantId={row.variant.id}
                    today={today}
                    resolved={row.salePrice}
                    history={row.saleHistory}
                    canWrite={canUpdatePrice}
                    readable
                  />
                )}

                {purchasable && (
                  <PriceBlock
                    kind="COST"
                    title="Prix d’achat"
                    serviceId={serviceId}
                    variantId={row.variant.id}
                    today={today}
                    resolved={row.purchaseCost}
                    history={row.costHistory}
                    canWrite={canUpdateCost}
                    readable={canSeeCost}
                  />
                )}

                <MarginBlock
                  sellable={sellable}
                  purchasable={purchasable}
                  canSeeCost={canSeeCost}
                  today={today}
                  salePrice={row.salePrice}
                  purchaseCost={row.purchaseCost}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  En-tête d'une variante                                                     */
/* -------------------------------------------------------------------------- */

function VariantHeader({
  serviceId,
  variant,
  canUpdate,
}: {
  serviceId: string
  variant: ServiceVariantRow
  canUpdate: boolean
}) {
  const [state, formAction] = useActionState<CatalogFormState, FormData>(
    updateServiceVariantAction,
    EMPTY_FORM_STATE
  )

  return (
    <div className="border-b border-line px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{variant.label}</p>
          {variant.sku && <p className="mt-0.5 text-xs text-muted tabular">{variant.sku}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {variant.isDefault && <Badge tone="info">Par défaut</Badge>}
          {!variant.isActive && <Badge tone="neutral">Inactive</Badge>}

          {canUpdate && !variant.isDefault && (
            <form action={formAction}>
              <input type="hidden" name="serviceId" value={serviceId} />
              <input type="hidden" name="variantId" value={variant.id} />
              <input type="hidden" name="setDefault" value="1" />
              <button type="submit" className={cn(ACTION_BASE, ACTION_TONES.quiet)}>
                <Star className="size-3.5" aria-hidden />
                Définir par défaut
              </button>
            </form>
          )}

          {/*
            La variante par défaut ne se désactive pas : la base le refuse
            (`fn_service_variant_default_guard`). Proposer le bouton mènerait à
            un refus certain — l'écran s'abstient plutôt que de le provoquer.
          */}
          {canUpdate && !variant.isDefault && (
            <form action={formAction}>
              <input type="hidden" name="serviceId" value={serviceId} />
              <input type="hidden" name="variantId" value={variant.id} />
              <input type="hidden" name="activate" value={variant.isActive ? '0' : '1'} />
              <button type="submit" className={cn(ACTION_BASE, ACTION_TONES.secondary)}>
                <CircleSlash className="size-3.5" aria-hidden />
                {variant.isActive ? 'Désactiver' : 'Réactiver'}
              </button>
            </form>
          )}
        </div>
      </div>

      <FormFeedback error={state.error} success={state.success} className="mt-3" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Un bloc de prix — vente ou achat, même forme                               */
/* -------------------------------------------------------------------------- */

function PriceBlock({
  kind,
  title,
  serviceId,
  variantId,
  today,
  resolved,
  history,
  canWrite,
  readable,
}: {
  kind: 'SALE' | 'COST'
  title: string
  serviceId: string
  variantId: string
  today: string
  resolved: ResolvedPrice | null
  history: PriceVersionRow[]
  canWrite: boolean
  /** Le lecteur détient-il la capacité qui ouvre ce prix ? */
  readable: boolean
}) {
  const [adding, setAdding] = useState(false)

  /*
   * LE BLOC FERMÉ EST NOMMÉ, PAS EFFACÉ — DEC-017.
   *
   * Sans la capacité, RLS ne rend aucune ligne : afficher « aucun prix d'achat »
   * serait une affirmation fausse. L'écran dit ce qu'il ne montre pas, et
   * pourquoi.
   */
  if (!readable) {
    return (
      <section>
        <h3 className="mb-2 font-display text-sm font-semibold text-ink">{title}</h3>
        <Notice tone="info">
          Les prix d’achat de ce service ne vous sont pas accessibles. Cette information est
          protégée par une permission dédiée.
        </Notice>
      </section>
    )
  }

  const active = history.filter((version) => version.isActive)
  const retired = history.filter((version) => !version.isActive)

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
        {canWrite && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(ACTION_BASE, ACTION_TONES.secondary)}
          >
            <Plus className="size-3.5" aria-hidden />
            Nouveau prix
          </button>
        )}
      </div>

      {/* Le prix APPLICABLE aujourd'hui, résolu en base — jamais « le dernier
          saisi », qui serait faux dès qu'une version future existe. */}
      {resolved ? (
        <p className="text-sm text-ink">
          <span className="font-semibold tabular">{formatMoney(resolved.amount)}</span>{' '}
          <span className="text-muted">
            applicable au {formatDate(today)} — en vigueur depuis le{' '}
            {formatDate(resolved.validFrom)}
            {resolved.validTo ? `, jusqu’au ${formatDate(resolved.validTo)}` : ''}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted">
          Aucun prix applicable au {formatDate(today)}. Rien ne sera facturé tant qu’une version
          n’aura pas été ouverte pour cette date.
        </p>
      )}

      {adding && (
        <PriceForm
          kind={kind}
          serviceId={serviceId}
          variantId={variantId}
          today={today}
          onFinished={() => setAdding(false)}
        />
      )}

      {active.length > 0 && (
        <VersionTable
          versions={active}
          kind={kind}
          serviceId={serviceId}
          canWrite={canWrite}
          caption="Versions en vigueur et à venir"
        />
      )}

      {retired.length > 0 && (
        <VersionTable
          versions={retired}
          kind={kind}
          serviceId={serviceId}
          canWrite={false}
          caption="Versions retirées"
        />
      )}
    </section>
  )
}

function VersionTable({
  versions,
  kind,
  serviceId,
  canWrite,
  caption,
}: {
  versions: PriceVersionRow[]
  kind: 'SALE' | 'COST'
  serviceId: string
  canWrite: boolean
  caption: string
}) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium text-muted">{caption}</p>

      {/* Desktop : tableau. Mobile : cartes — on réorganise, on ne rétrécit pas
          (CLAUDE.md §35). */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-3 font-medium text-muted">Montant</th>
              <th className="py-2 pr-3 font-medium text-muted">À partir du</th>
              <th className="py-2 pr-3 font-medium text-muted">Jusqu’au</th>
              <th className="py-2 pr-3 font-medium text-muted">Motif</th>
              {canWrite && <th className="py-2 font-medium text-muted">Action</th>}
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.id} className="border-b border-line last:border-b-0">
                <td className="py-2 pr-3 font-medium tabular text-ink">
                  {formatMoney(version.amount)}
                </td>
                <td className="py-2 pr-3 tabular text-muted">{formatDate(version.validFrom)}</td>
                <td className="py-2 pr-3 tabular text-muted">
                  {version.validTo ? formatDate(version.validTo) : 'sans terme'}
                </td>
                <td className="py-2 pr-3 text-muted">
                  {version.reason ?? '—'}
                  {version.deactivationReason && (
                    <span className="block text-xs">Retrait : {version.deactivationReason}</span>
                  )}
                </td>
                {canWrite && (
                  <td className="py-2">
                    <RetireForm kind={kind} serviceId={serviceId} versionId={version.id} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 sm:hidden">
        {versions.map((version) => (
          <li key={version.id} className="rounded-control border border-line p-3">
            <p className="font-medium tabular text-ink">{formatMoney(version.amount)}</p>
            <p className="mt-1 text-xs tabular text-muted">
              du {formatDate(version.validFrom)}{' '}
              {version.validTo ? `au ${formatDate(version.validTo)}` : '— sans terme'}
            </p>
            {version.reason && <p className="mt-1 text-xs text-muted">{version.reason}</p>}
            {version.deactivationReason && (
              <p className="mt-1 text-xs text-muted">Retrait : {version.deactivationReason}</p>
            )}
            {canWrite && (
              <div className="mt-2">
                <RetireForm kind={kind} serviceId={serviceId} versionId={version.id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function RetireForm({
  kind,
  serviceId,
  versionId,
}: {
  kind: 'SALE' | 'COST'
  serviceId: string
  versionId: string
}) {
  const [state, formAction] = useActionState<CatalogFormState, FormData>(
    deactivatePriceVersionAction,
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="versionId" value={versionId} />
      <button type="submit" className={cn(ACTION_BASE, ACTION_TONES.quiet)}>
        Retirer
      </button>
      <FormFeedback error={state.error} className="mt-2" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Ouvrir une version                                                         */
/* -------------------------------------------------------------------------- */

function PriceForm({
  kind,
  serviceId,
  variantId,
  today,
  onFinished,
}: {
  kind: 'SALE' | 'COST'
  serviceId: string
  variantId: string
  today: string
  onFinished: () => void
}) {
  const [state, formAction] = useActionState<CatalogFormState, FormData>(
    async (previous, formData) => {
      const result =
        kind === 'SALE'
          ? await setServicePriceAction(previous, formData)
          : await setServiceCostAction(previous, formData)
      if (result.success) onFinished()
      return result
    },
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}
  const field = (name: string) => `${kind.toLowerCase()}-${variantId}-${name}`

  return (
    <form action={formAction} noValidate className="mt-3 rounded-control border border-line p-4">
      <FormFeedback error={state.error} success={state.success} className="mb-4" />

      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="variantId" value={variantId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Montant (KMF)" name={field('amount')} required error={errors.amount}>
          <Input
            name="amount"
            id={field('amount')}
            inputMode="numeric"
            placeholder="50 000"
            error={errors.amount}
            className="tabular"
          />
        </Field>

        <Field
          label="Applicable à partir du"
          name={field('validFrom')}
          required
          error={errors.validFrom}
          hint="Une date future est acceptée : le prix prendra effet ce jour-là."
        >
          <Input
            name="validFrom"
            id={field('validFrom')}
            type="date"
            defaultValue={today}
            error={errors.validFrom}
          />
        </Field>

        <Field label="Motif" name={field('reason')} error={errors.reason} wide>
          <Input
            name="reason"
            id={field('reason')}
            placeholder="Révision tarifaire annuelle"
            error={errors.reason}
          />
        </Field>
      </div>

      <p className="mt-3 text-xs text-muted">
        La version en cours sera close la veille de cette date. Aucun montant n’est réécrit : les
        opérations antérieures continuent de relever du prix qui leur était applicable.
      </p>

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <SubmitButton label="Enregistrer ce prix" />
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

/* -------------------------------------------------------------------------- */
/*  Marge — calculée, jamais stockée                                           */
/* -------------------------------------------------------------------------- */

function MarginBlock({
  sellable,
  purchasable,
  canSeeCost,
  today,
  salePrice,
  purchaseCost,
}: {
  sellable: boolean
  purchasable: boolean
  canSeeCost: boolean
  today: string
  salePrice: ResolvedPrice | null
  purchaseCost: ResolvedPrice | null
}) {
  // Un service qui n'est pas acheté puis revendu n'a pas de marge à montrer :
  // le dire serait aussi faux que de l'afficher à 100 %.
  if (!sellable || !purchasable) return null

  if (!canSeeCost) {
    return (
      <p className="text-xs text-muted">
        La marge n’est pas affichée : elle se déduit du prix d’achat, qui n’est pas accessible avec
        vos droits.
      </p>
    )
  }

  const result = margin(salePrice?.amount ?? null, purchaseCost?.amount ?? null)

  if (!result) {
    return (
      <p className="text-xs text-muted">
        Marge non calculée : les deux prix ne sont pas tous les deux applicables au{' '}
        {formatDate(today)}. Un prix absent n’est pas un prix nul.
      </p>
    )
  }

  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
      <TrendingUp className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="text-muted">Marge unitaire au {formatDate(today)} :</span>
      <span className="font-semibold tabular">{formatMoney(result.amount)}</span>
      {result.rate !== null && (
        <span className="text-muted tabular">({result.rate.toLocaleString('fr-FR')} %)</span>
      )}
    </p>
  )
}

/* -------------------------------------------------------------------------- */
/*  Nouvelle variante                                                          */
/* -------------------------------------------------------------------------- */

function VariantForm({ serviceId, onFinished }: { serviceId: string; onFinished: () => void }) {
  const [state, formAction] = useActionState<CatalogFormState, FormData>(
    async (previous, formData) => {
      const result = await createServiceVariantAction(previous, formData)
      if (result.success) onFinished()
      return result
    },
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} noValidate className="rounded-control border border-line p-4">
      <FormFeedback error={state.error} success={state.success} className="mb-4" />
      <input type="hidden" name="serviceId" value={serviceId} />

      <FormSection title="Nouvelle variante">
        <Field label="Libellé" name="label" required error={errors.label}>
          <Input name="label" placeholder="Premium" error={errors.label} />
        </Field>

        <Field
          label="Référence"
          name="sku"
          error={errors.sku}
          hint="Facultative, unique dans tout le catalogue."
        >
          <Input name="sku" placeholder="TRF-PREM" error={errors.sku} autoComplete="off" />
        </Field>

        <Field label="Ordre d’affichage" name="displayOrder" error={errors.displayOrder}>
          <Input
            name="displayOrder"
            inputMode="numeric"
            defaultValue="0"
            error={errors.displayOrder}
            className="tabular"
          />
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <SubmitButton label="Ajouter la variante" icon={Layers} />
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
