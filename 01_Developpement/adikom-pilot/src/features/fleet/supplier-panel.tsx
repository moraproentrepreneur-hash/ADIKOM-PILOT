'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { History, Repeat } from 'lucide-react'

import { Badge, EmptyState } from '@/components/ui/primitives'
import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatDate, todayISO } from '@/lib/dates'
import { changeVehicleAttachmentAction, type FleetFormState } from './actions'
import { ORIGIN_LABELS, type VehicleOrigin } from './constants'
import type { SupplierPeriod } from './data'

type Option = { id: string; label: string }

/**
 * Rattachement fournisseur d'un véhicule.
 *
 * Un véhicule n'a qu'un fournisseur actif à la fois (§59). Le changement clôt
 * la période précédente et en ouvre une nouvelle : l'historique permet de
 * savoir qui fournissait le véhicule à une date donnée, ce dont dépendront les
 * imputations de maintenance (§60, §62).
 */
export function SupplierPanel({
  vehicleId,
  currentOrigin,
  currentSupplierLabel,
  currentPartnerLabel,
  history,
  suppliers,
  partners,
  editable,
}: {
  vehicleId: string
  currentOrigin: VehicleOrigin
  currentSupplierLabel: string | null
  currentPartnerLabel: string | null
  history: SupplierPeriod[]
  suppliers: Option[]
  partners: Option[]
  editable: boolean
}) {
  const [state, formAction] = useActionState<FleetFormState, FormData>(
    changeVehicleAttachmentAction,
    EMPTY_FORM_STATE
  )

  const [origin, setOrigin] = useState<VehicleOrigin>(currentOrigin)
  const [open, setOpen] = useState(false)
  const errors = state.fieldErrors ?? {}

  return (
    <div className="space-y-6">
      <div className="rounded-control border border-line p-4">
        <p className="text-xs text-muted">Rattachement actuel</p>
        <p className="mt-1 font-medium text-ink">
          {currentSupplierLabel ?? currentPartnerLabel ?? ORIGIN_LABELS[currentOrigin]}
        </p>
        {(currentSupplierLabel || currentPartnerLabel) && (
          <p className="mt-0.5 text-xs text-muted">{ORIGIN_LABELS[currentOrigin]}</p>
        )}
      </div>

      <FormFeedback error={state.error} success={state.success} />

      {editable &&
        (open ? (
          <form action={formAction} noValidate className="rounded-control border border-line p-4">
            <input type="hidden" name="vehicleId" value={vehicleId} />

            <Notice tone="warning" className="mb-4">
              Le rattachement en cours sera clôturé à la date choisie, et un nouveau sera ouvert.
              Les opérations passées ne sont pas modifiées. L’historique daté ci-dessous ne
              concerne que les fournisseurs.
            </Notice>

            <FormSection title="Nouveau rattachement">
              <Field label="Origine" name="origin" required error={errors.origin}>
                <Select
                  name="origin"
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value as VehicleOrigin)}
                >
                  {(Object.keys(ORIGIN_LABELS) as VehicleOrigin[]).map((value) => (
                    <option key={value} value={value}>
                      {ORIGIN_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>

              {origin === 'SUPPLIED' && (
                <Field label="Fournisseur" name="supplierId" required error={errors.supplierId}>
                  <Select name="supplierId" error={errors.supplierId}>
                    <option value="">Choisir un fournisseur…</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              {origin === 'PARTNERSHIP' && (
                <Field label="Partenaire" name="partnerId" required error={errors.partnerId}>
                  <Select name="partnerId" error={errors.partnerId}>
                    <option value="">Choisir un partenaire…</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field label="Prend effet le" name="effectiveOn" error={errors.effectiveOn}>
                <Input name="effectiveOn" type="date" defaultValue={todayISO()} />
              </Field>

              <Field label="Motif" name="reason" error={errors.reason} wide>
                <Textarea name="reason" placeholder="Fin de mise à disposition, nouveau contrat…" />
              </Field>
            </FormSection>

            <div className="flex flex-wrap items-center gap-3 pt-4">
              <SubmitButton label="Appliquer le changement" icon={Repeat} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-muted transition-colors hover:text-ink"
              >
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
          >
            <Repeat className="size-4" aria-hidden />
            Changer de rattachement
          </button>
        ))}

      <div>
        <h3 className="mb-3 font-display text-sm font-semibold text-ink">
          Historique des rattachements
        </h3>

        {history.length === 0 ? (
          <EmptyState
            icon={History}
            title="Aucun rattachement enregistré"
            description="Ce véhicule n’a jamais été rattaché à un fournisseur."
          />
        ) : (
          <ul className="space-y-3">
            {history.map((period) => (
              <li
                key={period.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-control border border-line p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/tiers/fournisseurs/${period.supplierId}`}
                    className="font-medium text-adikom-500 hover:underline"
                  >
                    {period.supplierLabel}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    Du {formatDate(period.startedOn)}
                    {period.endedOn ? ` au ${formatDate(period.endedOn)}` : ' à aujourd’hui'}
                  </p>
                  {period.reason && (
                    <p className="mt-1 text-xs text-muted italic">{period.reason}</p>
                  )}
                </div>
                {period.endedOn ? (
                  <Badge tone="neutral">Clôturé</Badge>
                ) : (
                  <Badge tone="success">En cours</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
