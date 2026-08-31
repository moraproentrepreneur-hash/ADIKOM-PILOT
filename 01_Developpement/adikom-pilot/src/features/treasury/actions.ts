'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'

/**
 * Actions de Banques & Caisses — Étape 2.5, LOT 6.
 *
 * QUATRE CAPACITÉS, QUATRE ACTES
 *
 *   `treasury.accounts.view`     consulter un compte
 *   `treasury.accounts.create`   ouvrir un compte
 *   `treasury.accounts.update`   le modifier
 *   `treasury.accounts.archive`  changer son statut (§10)
 *
 * `treasury.balances.view` est à part : voir un compte n'est pas voir ce qu'il
 * contient. La fonction de calcul l'exige elle-même, en base.
 *
 * CE QUE CES ACTIONS NE FONT JAMAIS
 *
 * Aucune écriture libre. Une écriture naît d'un règlement, jamais d'un
 * formulaire : le dépôt, le retrait et le virement interne relèvent d'un lot
 * ultérieur (Module 06 §28).
 */

export type TreasuryFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /porte des écritures/i,
    'Ce compte porte des écritures : son solde initial, sa devise et son type ne se modifient plus.',
  ],
  [
    /doit être nommé/i,
    'Donnez un nom à ce compte.',
  ],
  [
    /Compte financier introuvable/i,
    'Ce compte est introuvable ou n’est pas accessible avec vos droits.',
  ],
  [
    /Droit insuffisant pour cette opération/i,
    'Vous ne disposez pas de la capacité exacte requise pour cette opération.',
  ],
]

const KINDS = ['BANK', 'CASH'] as const
const STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const

const labelSchema = z
  .string()
  .trim()
  .min(2, 'Donnez un nom à ce compte.')
  .max(120, 'Nom trop long.')

/**
 * Montant saisi → entier KMF (DEC-010).
 *
 * Le solde initial peut être NÉGATIF : un compte peut ouvrir à découvert, et le
 * refuser inventerait une règle qu'ADIKOM n'a pas posée (DEC-008).
 */
function toBalance(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '')
  if (cleaned === '') return 0
  if (!/^-?\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) ? value : null
}

/* -------------------------------------------------------------------------- */
/*  Ouvrir un compte — Module 06 §6, §7, §8                                    */
/* -------------------------------------------------------------------------- */

export async function createFinancialAccountAction(
  prevState: TreasuryFormState,
  formData: FormData
): Promise<TreasuryFormState> {
  return guarded(
    'compte financier:création',
    async () => {
      await requirePermission(PERMISSIONS.ACCOUNTS_CREATE)

      const kind = readText(formData, 'kind')
      if (!KINDS.includes(kind as (typeof KINDS)[number])) {
        return { fieldErrors: { kind: 'Choisissez un compte bancaire ou une caisse.' } }
      }

      const parsed = z.object({ label: labelSchema }).safeParse({
        label: readText(formData, 'label'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const opening = toBalance(readText(formData, 'openingBalance'))
      if (opening === null) {
        return {
          fieldErrors: {
            openingBalance: 'Indiquez un montant entier en KMF, sans espace ni décimale.',
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('create_financial_account', {
        p_kind: kind,
        p_label: parsed.data.label,
        p_institution: orNull(readText(formData, 'institution')),
        p_account_reference: orNull(readText(formData, 'accountReference')),
        p_opening_balance: opening,
        p_opened_on: orNull(readText(formData, 'openedOn')),
        p_description: orNull(readText(formData, 'description')),
      })

      if (error) throw new Error(error.message)

      revalidatePath('/tresorerie/comptes')
      redirect(`/tresorerie/comptes/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Modifier un compte                                                         */
/* -------------------------------------------------------------------------- */

export async function updateFinancialAccountAction(
  prevState: TreasuryFormState,
  formData: FormData
): Promise<TreasuryFormState> {
  return guarded(
    'compte financier:modification',
    async () => {
      await requirePermission(PERMISSIONS.ACCOUNTS_UPDATE)

      const accountId = readText(formData, 'accountId')
      if (!accountId) return { error: 'Compte introuvable.' }

      const parsed = z.object({ label: labelSchema }).safeParse({
        label: readText(formData, 'label'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const raw = readText(formData, 'openingBalance')
      const opening = raw.trim() === '' ? null : toBalance(raw)
      if (raw.trim() !== '' && opening === null) {
        return {
          fieldErrors: {
            openingBalance: 'Indiquez un montant entier en KMF, sans espace ni décimale.',
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('update_financial_account', {
        p_account_id: accountId,
        p_label: parsed.data.label,
        p_institution: orNull(readText(formData, 'institution')),
        p_account_reference: orNull(readText(formData, 'accountReference')),
        p_opening_balance: opening,
        p_opened_on: orNull(readText(formData, 'openedOn')),
        p_description: orNull(readText(formData, 'description')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/tresorerie/comptes/${accountId}`)
      revalidatePath('/tresorerie/comptes')

      return { success: 'Le compte a été modifié.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Statut d'un compte — Module 06 §10                                         */
/* -------------------------------------------------------------------------- */

export async function setFinancialAccountStatusAction(
  prevState: TreasuryFormState,
  formData: FormData
): Promise<TreasuryFormState> {
  return guarded(
    'compte financier:statut',
    async () => {
      await requirePermission(PERMISSIONS.ACCOUNTS_ARCHIVE)

      const accountId = readText(formData, 'accountId')
      const status = readText(formData, 'status')

      if (!accountId) return { error: 'Compte introuvable.' }
      if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
        return { fieldErrors: { status: 'Choisissez un statut.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('set_financial_account_status', {
        p_account_id: accountId,
        p_status: status,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/tresorerie/comptes/${accountId}`)
      revalidatePath('/tresorerie/comptes')

      return {
        success:
          status === 'ACTIVE'
            ? 'Le compte est actif : il est de nouveau proposé pour les opérations.'
            : 'Le compte n’est plus proposé pour de nouvelles opérations. Son historique reste consultable.',
      }
    },
    ERROR_PATTERNS
  )
}
