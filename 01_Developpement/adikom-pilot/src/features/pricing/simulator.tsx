'use client'

import { useActionState } from 'react'
import { Calculator } from 'lucide-react'

import { Badge } from '@/components/ui/primitives'
import { Field, Input, Select } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { todayISO } from '@/lib/dates'
import { simulatePriceAction, type SimulationState } from './actions'
import { formatDiscount, formatPrice, SOURCE_LABELS, SOURCE_TONES } from './constants'

type Option = { id: string; label: string }

/**
 * Simulation tarifaire.
 *
 * Interroge le même résolveur que celui qui vaudra pour une réservation réelle
 * (DEC-002). Deux usages : vérifier qu'une condition préférentielle produit
 * bien l'effet attendu, et pouvoir répondre à « pourquoi ce montant ? » avant
 * qu'un client ne pose la question.
 */
export function PricingSimulator({
  clients,
  vehicles,
}: {
  clients: Option[]
  vehicles: Option[]
}) {
  const [state, formAction] = useActionState<SimulationState, FormData>(
    simulatePriceAction,
    EMPTY_FORM_STATE
  )

  const errors = state.fieldErrors ?? {}
  const resolved = state.resolved

  return (
    <div className="space-y-5">
      <form action={formAction} noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Client" name="clientId" hint="Laisser vide pour le tarif standard.">
            <Select name="clientId" defaultValue={state.clientId ?? ''}>
              <option value="">Aucun client — tarif standard</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Véhicule" name="vehicleId" required error={errors.vehicleId}>
            <Select name="vehicleId" defaultValue={state.vehicleId ?? ''} error={errors.vehicleId}>
              <option value="">Choisir un véhicule…</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="À la date du" name="on">
            <Input name="on" type="date" defaultValue={state.on ?? todayISO()} />
          </Field>
        </div>

        <div className="pt-4">
          <SubmitButton label="Calculer le tarif" icon={Calculator} pendingLabel="Calcul…" />
        </div>
      </form>

      <FormFeedback error={state.error} />

      {state.vehicleId && resolved === null && (
        <Notice tone="warning">
          Aucun tarif n’est configuré pour ce véhicule à cette date. Une location ne pourra pas être
          valorisée tant qu’aucun tarif ne s’applique — le système ne suppose aucun montant.
        </Notice>
      )}

      {resolved && (
        <div className="rounded-control border border-adikom-200 bg-adikom-50/60 p-5">
          <p className="text-xs text-muted">Tarif applicable</p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink tabular">
            {formatPrice(resolved.amount, resolved.unit)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={SOURCE_TONES[resolved.source]}>{SOURCE_LABELS[resolved.source]}</Badge>
            {resolved.discountPercent !== null && resolved.baseAmount !== null && (
              <span className="text-xs text-muted">
                Remise de {formatDiscount(resolved.discountPercent)} sur{' '}
                {formatPrice(resolved.baseAmount, resolved.unit)}
              </span>
            )}
          </div>

          <p className="mt-3 text-xs text-muted">
            Le tarif le plus spécifique l’emporte : client + véhicule, puis client + catégorie, puis
            client, puis véhicule, puis catégorie, puis tarif standard général.
          </p>
        </div>
      )}
    </div>
  )
}
