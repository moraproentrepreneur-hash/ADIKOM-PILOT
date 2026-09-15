'use client'

import { useActionState, useState } from 'react'
import { Lock, Plus, Wallet } from 'lucide-react'

import { ACTION_BASE, ACTION_TONES, Badge, EmptyState } from '@/components/ui/primitives'
import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { UNIT_HELP, UNIT_LABELS, type PricingUnit } from '@/features/pricing/constants'
import {
  retireSupplierRateAction,
  setSupplierRateAction,
  updateSupplierRateConditionsAction,
  type SupplierRateFormState,
} from './actions'
import { formatRate, INTERNAL_NOTICE } from './constants'
import type { SupplierRateRow } from './data'

/**
 * Chronologie des coûts d'acquisition d'un véhicule — LOT 21, DEC-044.
 *
 * TROIS RÈGLES DE LECTURE, APPLIQUÉES SANS EXCEPTION :
 *
 *   1. UN COÛT ABSENT N'EST PAS UN COÛT NUL. « Aucun coût applicable à cette
 *      date » est écrit en toutes lettres ; jamais « 0 KMF » (DEC-008).
 *
 *   2. UN BLOC FERMÉ EST NOMMÉ. Sans `rental.pricing.supplier.view`, les coûts
 *      ne sont pas silencieusement absents : l'écran DIT qu'ils existent
 *      peut-être et qu'ils ne sont pas ouverts (DEC-017). Les taire laisserait
 *      croire qu'il n'y a rien à voir.
 *
 *   3. LA DONNÉE EST MARQUÉE INTERNE, partout où elle apparaît. Un montant qui
 *      ne doit jamais sortir doit se reconnaître à l'écran (consigne §18).
 *
 * Rien de tout cela n'est une protection : la protection est en base.
 */

export type VehicleRateContext = {
  vehicleId: string
  vehicleLabel: string
  /** Origine du véhicule : seul `SUPPLIED` accepte un coût d'acquisition. */
  supplied: boolean
  supplierLabel: string | null
}

export function SupplierRatesPanel({
  context,
  today,
  history,
  canCreate,
  canUpdate,
  readable,
}: {
  context: VehicleRateContext
  today: string
  history: SupplierRateRow[]
  canCreate: boolean
  canUpdate: boolean
  /** Le lecteur détient-il `rental.pricing.supplier.view` ? */
  readable: boolean
}) {
  const [adding, setAdding] = useState(false)

  /*
   * LE BLOC FERMÉ EST NOMMÉ, PAS EFFACÉ — DEC-017.
   *
   * Sans la capacité, RLS ne rend aucune ligne : afficher « aucun coût » serait
   * une affirmation fausse. L'écran dit ce qu'il ne montre pas, et pourquoi.
   */
  if (!readable) {
    return (
      <Notice tone="info">
        Les coûts d’acquisition de ce véhicule ne vous sont pas accessibles. Cette information est
        interne à ADIKOM et protégée par une permission dédiée.
      </Notice>
    )
  }

  if (!context.supplied) {
    return (
      <Notice tone="info">
        Ce véhicule n’est pas mis à disposition par un fournisseur : aucun coût d’acquisition ne
        lui est enregistré. Le coût de référence interne d’un véhicule ADIKOM, comme les conditions
        financières d’un partenariat, attendent une décision de la Direction — en leur absence,
        aucun montant n’est supposé, et la commission reste non calculée plutôt que fausse.
      </Notice>
    )
  }

  const active = history.filter((row) => row.isActive)
  const retired = history.filter((row) => !row.isActive)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          {INTERNAL_NOTICE}
        </p>

        {canCreate && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(ACTION_BASE, ACTION_TONES.secondary)}
          >
            <Plus className="size-3.5" aria-hidden />
            Nouveau coût
          </button>
        )}
      </div>

      {adding && (
        <RateForm
          vehicleId={context.vehicleId}
          today={today}
          onFinished={() => setAdding(false)}
        />
      )}

      {history.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Aucun coût d’acquisition enregistré"
          description={`Tant qu’aucun coût n’est renseigné pour ${context.vehicleLabel}, la commission de location ne peut pas être calculée — et aucun montant n’est supposé à sa place.`}
        />
      ) : (
        <>
          {active.length > 0 && (
            <RateTable
              rows={active}
              today={today}
              vehicleId={context.vehicleId}
              canUpdate={canUpdate}
              caption="Versions en vigueur et à venir"
            />
          )}

          {retired.length > 0 && (
            <RateTable
              rows={retired}
              today={today}
              vehicleId={context.vehicleId}
              canUpdate={false}
              caption="Versions retirées"
            />
          )}
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  La chronologie                                                             */
/* -------------------------------------------------------------------------- */

/** Une version est-elle celle qui s'applique au jour considéré ? */
function applies(row: SupplierRateRow, today: string): boolean {
  return (
    row.isActive && row.validFrom <= today && (row.validTo === null || row.validTo >= today)
  )
}

function RateTable({
  rows,
  today,
  vehicleId,
  canUpdate,
  caption,
}: {
  rows: SupplierRateRow[]
  today: string
  vehicleId: string
  canUpdate: boolean
  caption: string
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{caption}</p>

      {/* Desktop : tableau. Mobile : cartes — on réorganise, on ne rétrécit pas
          (CLAUDE.md §35). */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-3 font-medium text-muted">Coût</th>
              <th className="py-2 pr-3 font-medium text-muted">Fournisseur</th>
              <th className="py-2 pr-3 font-medium text-muted">À partir du</th>
              <th className="py-2 pr-3 font-medium text-muted">Jusqu’au</th>
              <th className="py-2 pr-3 font-medium text-muted">Conditions</th>
              {canUpdate && <th className="py-2 font-medium text-muted">Action</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="py-2 pr-3">
                  <span className="font-medium tabular text-ink">
                    {formatRate(row.amount, row.unit)}
                  </span>
                  {applies(row, today) && (
                    <Badge tone="success" className="ml-2">
                      Applicable
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-3 text-muted">
                  {row.supplierLabel ?? (
                    <span className="text-xs">Fournisseur non lisible avec vos droits</span>
                  )}
                </td>
                <td className="py-2 pr-3 tabular text-muted">{formatDate(row.validFrom)}</td>
                <td className="py-2 pr-3 tabular text-muted">
                  {row.validTo ? formatDate(row.validTo) : 'sans terme'}
                </td>
                <td className="py-2 pr-3 text-muted">
                  {row.conditions ?? '—'}
                  {row.reason && <span className="block text-xs">Motif : {row.reason}</span>}
                  {row.deactivationReason && (
                    <span className="block text-xs">Retrait : {row.deactivationReason}</span>
                  )}
                </td>
                {canUpdate && (
                  <td className="py-2">
                    <RowActions row={row} vehicleId={vehicleId} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-control border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium tabular text-ink">{formatRate(row.amount, row.unit)}</p>
              {applies(row, today) && <Badge tone="success">Applicable</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted">
              {row.supplierLabel ?? 'Fournisseur non lisible avec vos droits'}
            </p>
            <p className="mt-1 text-xs tabular text-muted">
              du {formatDate(row.validFrom)}{' '}
              {row.validTo ? `au ${formatDate(row.validTo)}` : '— sans terme'}
            </p>
            {row.conditions && <p className="mt-1 text-xs text-muted">{row.conditions}</p>}
            {row.reason && <p className="mt-1 text-xs text-muted">Motif : {row.reason}</p>}
            {row.deactivationReason && (
              <p className="mt-1 text-xs text-muted">Retrait : {row.deactivationReason}</p>
            )}
            {canUpdate && (
              <div className="mt-2">
                <RowActions row={row} vehicleId={vehicleId} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Retirer une version · corriger ses conditions                              */
/* -------------------------------------------------------------------------- */

function RowActions({ row, vehicleId }: { row: SupplierRateRow; vehicleId: string }) {
  const [editing, setEditing] = useState(false)

  const [retireState, retire] = useActionState<SupplierRateFormState, FormData>(
    retireSupplierRateAction,
    EMPTY_FORM_STATE
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={retire}>
          <input type="hidden" name="rateId" value={row.id} />
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <button type="submit" className={cn(ACTION_BASE, ACTION_TONES.quiet)}>
            Retirer
          </button>
        </form>

        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          className={cn(ACTION_BASE, ACTION_TONES.quiet)}
        >
          Conditions
        </button>
      </div>

      <FormFeedback error={retireState.error} success={retireState.success} />

      {editing && (
        <ConditionsForm row={row} vehicleId={vehicleId} onFinished={() => setEditing(false)} />
      )}
    </div>
  )
}

/**
 * Seul champ modifiable après coup.
 *
 * Le montant, l'unité et la date d'effet d'une version ne se réécrivent jamais
 * (D16(a)) : pour les changer, on ouvre une version nouvelle. Le formulaire ne
 * les propose donc même pas — et la base les refuserait.
 */
function ConditionsForm({
  row,
  vehicleId,
  onFinished,
}: {
  row: SupplierRateRow
  vehicleId: string
  onFinished: () => void
}) {
  const [state, formAction] = useActionState<SupplierRateFormState, FormData>(
    async (previous, formData) => {
      const result = await updateSupplierRateConditionsAction(previous, formData)
      if (result.success) onFinished()
      return result
    },
    EMPTY_FORM_STATE
  )

  return (
    <form action={formAction} noValidate className="rounded-control border border-line p-3">
      <FormFeedback error={state.error} className="mb-3" />

      <input type="hidden" name="rateId" value={row.id} />
      <input type="hidden" name="vehicleId" value={vehicleId} />

      <Field
        label="Conditions négociées"
        name={`conditions-${row.id}`}
        error={state.fieldErrors?.conditions}
        hint="Le montant, l’unité et la date d’effet ne se corrigent pas : ouvrez une nouvelle version datée."
        wide
      >
        <Textarea
          name="conditions"
          id={`conditions-${row.id}`}
          defaultValue={row.conditions ?? ''}
          placeholder="Contrat longue durée, remise de volume, contrepartie convenue…"
          error={state.fieldErrors?.conditions}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3 pt-3">
        <SubmitButton label="Enregistrer" />
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
/*  Ouvrir une version                                                         */
/* -------------------------------------------------------------------------- */

const UNITS = Object.keys(UNIT_LABELS) as PricingUnit[]

/**
 * Nouveau coût d'acquisition pour un véhicule donné.
 *
 * Le fournisseur n'est pas demandé : c'est celui qui met le véhicule à
 * disposition, et la base le retient elle-même. Le demander ouvrirait la porte à
 * une incohérence que le déclencheur refuserait de toute façon.
 */
export function RateForm({
  vehicleId,
  today,
  onFinished,
}: {
  vehicleId: string
  today: string
  onFinished: () => void
}) {
  const [state, formAction] = useActionState<SupplierRateFormState, FormData>(
    async (previous, formData) => {
      const result = await setSupplierRateAction(previous, formData)
      if (result.success) onFinished()
      return result
    },
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}
  const field = (name: string) => `rate-${vehicleId}-${name}`

  return (
    <form action={formAction} noValidate className="rounded-control border border-line p-4">
      <FormFeedback error={state.error} success={state.success} className="mb-4" />

      <input type="hidden" name="vehicleId" value={vehicleId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Coût (KMF)" name={field('amount')} required error={errors.amount}>
          <Input
            name="amount"
            id={field('amount')}
            inputMode="numeric"
            placeholder="40 000"
            error={errors.amount}
            className="tabular"
          />
        </Field>

        <Field
          label="Unité"
          name={field('unit')}
          required
          error={errors.unit}
          hint={UNIT_HELP.DAY}
        >
          <Select name="unit" id={field('unit')} defaultValue="DAY" error={errors.unit}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Applicable à partir du"
          name={field('validFrom')}
          required
          error={errors.validFrom}
          hint="Une date future est acceptée : le coût prendra effet ce jour-là."
        >
          <Input
            name="validFrom"
            id={field('validFrom')}
            type="date"
            defaultValue={today}
            error={errors.validFrom}
          />
        </Field>

        <Field label="Motif du changement" name={field('reason')} error={errors.reason}>
          <Input
            name="reason"
            id={field('reason')}
            placeholder="Révision annuelle du contrat"
            error={errors.reason}
          />
        </Field>

        <Field
          label="Conditions négociées"
          name={field('conditions')}
          error={errors.conditions}
          hint="Conditions hors tarif ordinaire : contrat particulier, contrepartie, durée minimale."
          wide
        >
          <Textarea
            name="conditions"
            id={field('conditions')}
            placeholder="Contrat longue durée signé le 01/09, révisable annuellement."
            error={errors.conditions}
          />
        </Field>
      </div>

      <p className="mt-3 text-xs text-muted">
        La version en cours sera close la veille de cette date. Aucun montant n’est réécrit : les
        locations antérieures continuent de relever du coût qui leur était applicable.
      </p>

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <SubmitButton label="Enregistrer ce coût" icon={Wallet} />
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
/*  Ouvrir une version depuis l'écran d'ensemble                               */
/* -------------------------------------------------------------------------- */

export type RateVehicleChoice = { id: string; label: string; supplierLabel: string }

/**
 * Le même formulaire, précédé du choix du véhicule.
 *
 * Seuls les véhicules FOURNIS et non retirés sont proposés : ce sont exactement
 * ceux que la base accepte. Proposer les autres mènerait à un refus certain —
 * l'écran s'abstient plutôt que de le provoquer (CLAUDE.md §38, §56).
 */
export function NewRatePanel({
  vehicles,
  today,
}: {
  vehicles: RateVehicleChoice[]
  today: string
}) {
  const [open, setOpen] = useState(false)
  const [vehicleId, setVehicleId] = useState('')

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(ACTION_BASE, ACTION_TONES.secondary)}
      >
        <Plus className="size-3.5" aria-hidden />
        Nouveau coût d’acquisition
      </button>
    )
  }

  if (vehicles.length === 0) {
    return (
      <Notice tone="warning">
        Aucun véhicule du parc n’est actuellement mis à disposition par un fournisseur. Un coût
        d’acquisition ne s’enregistre que sur un véhicule fourni.
      </Notice>
    )
  }

  const chosen = vehicles.find((vehicle) => vehicle.id === vehicleId)

  return (
    <div className="w-full space-y-4 rounded-control border border-line p-4">
      <FormSection
        title="Nouveau coût d’acquisition"
        description="Le coût est enregistré pour le fournisseur qui met ce véhicule à disposition."
      >
        <Field label="Véhicule" name="new-rate-vehicle" required wide>
          <Select
            name="new-rate-vehicle"
            id="new-rate-vehicle"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
          >
            <option value="">Choisir un véhicule fourni…</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.label} — {vehicle.supplierLabel}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      {chosen ? (
        <RateForm vehicleId={chosen.id} today={today} onFinished={() => setOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Annuler
        </button>
      )}
    </div>
  )
}
