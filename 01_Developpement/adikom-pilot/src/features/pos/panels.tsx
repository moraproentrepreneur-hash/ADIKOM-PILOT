'use client'

import { useActionState, useState } from 'react'
import { Lock, LockOpen, Plus, Power, PowerOff, Save } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { FormFeedback, Notice, SubmitButton } from '@/components/ui/feedback'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { formatAmount, parseAmount } from '@/lib/money'
import {
  closeSessionAction,
  createRegisterAction,
  openSessionAction,
  setRegisterActiveAction,
  updateRegisterAction,
  type PosFormState,
} from './actions'
import { describeVariance, readVariance } from './constants'

type Option = { id: string; label: string; description?: string }

/* -------------------------------------------------------------------------- */
/*  Caisse — déclarer, modifier                                                */
/* -------------------------------------------------------------------------- */

export function RegisterForm({
  accounts,
  register,
}: {
  accounts: Option[]
  /** Absente : déclaration. Présente : modification. */
  register?: {
    id: string
    label: string
    accountId: string
    location: string | null
    hasOpenSession: boolean
  }
}) {
  const [state, formAction] = useActionState<PosFormState, FormData>(
    register ? updateRegisterAction : createRegisterAction,
    EMPTY_FORM_STATE
  )
  const errors = state.fieldErrors ?? {}

  if (accounts.length === 0) {
    return (
      <Notice tone="warning">
        Aucun compte de type <strong>Caisse</strong> actif n’est disponible. Une caisse s’adosse
        obligatoirement à un tel compte : ouvrez-le d’abord dans Banques &amp; Caisses.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />
      {register && <input type="hidden" name="registerId" value={register.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom de la caisse" name="label" required error={errors.label}>
          <Input
            name="label"
            defaultValue={register?.label}
            placeholder="Comptoir Moroni"
            error={errors.label}
          />
        </Field>

        <Field label="Lieu" name="location" error={errors.location} hint="Facultatif.">
          <Input name="location" defaultValue={register?.location ?? ''} error={errors.location} />
        </Field>

        <Field
          label="Compte de caisse adossé"
          name="accountId"
          required
          wide
          error={errors.accountId}
          hint={
            register?.hasOpenSession
              ? 'Une session est ouverte : le compte ne peut pas changer avant sa clôture.'
              : 'Une caisse n’est pas un compte : elle utilise un compte de type Caisse, qui porte le solde.'
          }
        >
          <Select
            name="accountId"
            defaultValue={register?.accountId ?? ''}
            placeholder="Choisir un compte…"
            error={errors.accountId}
            disabled={register?.hasOpenSession}
          >
            {!register && <option value="">Choisir un compte…</option>}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.description ? `${account.label} — ${account.description}` : account.label}
              </option>
            ))}
          </Select>
          {/* Un champ désactivé n'est pas transmis : la valeur courante l'est. */}
          {register?.hasOpenSession && (
            <input type="hidden" name="accountId" value={register.accountId} />
          )}
        </Field>
      </div>

      <SubmitButton
        label={register ? 'Enregistrer' : 'Déclarer la caisse'}
        icon={register ? Save : Plus}
        pendingLabel="Enregistrement…"
      />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Caisse — désactiver, réactiver                                             */
/* -------------------------------------------------------------------------- */

export function RegisterActivePanel({
  registerId,
  isActive,
  hasOpenSession,
}: {
  registerId: string
  isActive: boolean
  hasOpenSession: boolean
}) {
  const [state, formAction] = useActionState<PosFormState, FormData>(
    setRegisterActiveAction,
    EMPTY_FORM_STATE
  )

  const blocked = isActive && hasOpenSession

  return (
    <form action={formAction} className="space-y-3">
      <FormFeedback error={state.error} success={state.success} />
      <input type="hidden" name="registerId" value={registerId} />
      <input type="hidden" name="active" value={isActive ? 'false' : 'true'} />

      <p className="text-sm text-muted">
        {isActive
          ? 'Une caisse inactive n’accepte plus de session ; son historique reste consultable.'
          : 'Réactiver la caisse suppose que son compte adossé soit toujours actif.'}
      </p>

      <Field label="Motif" name="reason" hint="Facultatif — conservé au journal.">
        <Input name="reason" placeholder="Comptoir fermé, travaux…" disabled={blocked} />
      </Field>

      {blocked && (
        <Notice tone="info">
          Une session est ouverte sur cette caisse : elle doit être close avant toute
          désactivation.
        </Notice>
      )}

      <SubmitButton
        label={isActive ? 'Désactiver la caisse' : 'Réactiver la caisse'}
        icon={isActive ? PowerOff : Power}
        tone={isActive ? 'danger' : 'primary'}
        pendingLabel="Enregistrement…"
        disabled={blocked}
      />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Session — ouvrir                                                           */
/* -------------------------------------------------------------------------- */

export function OpenSessionPanel({ registers }: { registers: Option[] }) {
  const [state, formAction] = useActionState<PosFormState, FormData>(
    openSessionAction,
    EMPTY_FORM_STATE
  )
  const errors = state.fieldErrors ?? {}

  if (registers.length === 0) {
    return (
      <Notice tone="warning">
        Aucune caisse active n’est disponible. Une session s’ouvre sur une caisse déclarée et
        active.
      </Notice>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Caisse" name="registerId" required error={errors.registerId}>
          <Select
            name="registerId"
            defaultValue={registers.length === 1 ? registers[0].id : ''}
            placeholder="Choisir une caisse…"
            error={errors.registerId}
          >
            {registers.length > 1 && <option value="">Choisir une caisse…</option>}
            {registers.map((register) => (
              <option key={register.id} value={register.id}>
                {register.description ? `${register.label} — ${register.description}` : register.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Fond de caisse"
          name="openingFloat"
          required
          error={errors.openingFloat}
          hint="En KMF — 0 s’il n’y en a pas. Il ne se modifie plus ensuite."
        >
          <Input
            name="openingFloat"
            inputMode="numeric"
            defaultValue="0"
            error={errors.openingFloat}
            className="tabular"
          />
        </Field>
      </div>

      <p className="text-xs text-muted">
        La session s’ouvre <strong>à votre nom</strong>, à l’heure du serveur. Vous ne pouvez tenir
        qu’une session à la fois, et une caisse n’en a qu’une ouverte.
      </p>

      <SubmitButton label="Ouvrir la session" icon={LockOpen} pendingLabel="Ouverture…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Session — clôturer                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Clôture — B-9.
 *
 * Le montant compté est OBLIGATOIRE ; l'écart s'affiche, il ne bloque rien.
 * L'aperçu est INDICATIF : il part du théorique dérivé EN BASE et transmis par
 * la page, et la vérité reste celle que la base calculera à l'enregistrement
 * (afficher un total n'est pas le calculer). Sans montants lisibles, aucun
 * aperçu : on ne devine pas un écart qu'on n'a pas le droit de voir.
 */
export function CloseSessionPanel({
  sessionId,
  expected,
}: {
  sessionId: string
  /** Théorique dérivé en base ; `null` si les montants ne sont pas lisibles. */
  expected: number | null
}) {
  const [state, formAction] = useActionState<PosFormState, FormData>(
    closeSessionAction,
    EMPTY_FORM_STATE
  )
  const errors = state.fieldErrors ?? {}
  const [counted, setCounted] = useState('')

  const parsed = parseAmount(counted)
  const preview =
    expected !== null && parsed !== null && parsed >= 0
      ? describeVariance(readVariance(parsed - expected, true, 'CLOSED'))
      : null

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback error={state.error} success={state.success} />
      <input type="hidden" name="sessionId" value={sessionId} />

      <Field
        label="Montant compté"
        name="countedAmount"
        required
        error={errors.countedAmount}
        hint="En KMF, tel que compté dans la caisse."
      >
        <Input
          name="countedAmount"
          inputMode="numeric"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          error={errors.countedAmount}
          className="tabular"
          autoComplete="off"
        />
      </Field>

      {expected !== null && (
        <div className="rounded-control border border-line bg-canvas px-4 py-3 text-sm" aria-live="polite">
          <p className="text-muted">
            Théorique : <span className="font-medium text-ink tabular">{formatAmount(expected)}</span>
          </p>
          <p className="mt-1 text-muted">
            Écart indicatif :{' '}
            <span className="font-medium text-ink">{preview ?? 'saisissez le montant compté'}</span>
          </p>
        </div>
      )}

      <Field label="Observation" name="note" error={errors.note} hint="Facultative — figée avec la clôture.">
        <Textarea name="note" rows={2} maxLength={500} />
      </Field>

      <p className="text-xs text-muted">
        L’écart est <strong>constaté et journalisé</strong> ; il n’empêche pas la clôture et ne
        produit aucune écriture de trésorerie. Une session close <strong>ne se rouvre pas</strong>.
      </p>

      <SubmitButton label="Clôturer la session" icon={Lock} pendingLabel="Clôture…" />
    </form>
  )
}
