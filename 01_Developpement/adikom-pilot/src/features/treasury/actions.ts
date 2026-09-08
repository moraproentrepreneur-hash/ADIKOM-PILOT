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
 * TROIS AUTRES POUR LE VIREMENT INTERNE — Module 06 §28 à §33
 *
 *   `treasury.transfers.view`      consulter les virements
 *   `treasury.transfers.create`    en saisir un (brouillon)
 *   `treasury.transfers.validate`  le valider — c'est ce geste qui déplace
 *                                  les fonds et produit les DEUX écritures
 *   `treasury.transfers.cancel`    l'annuler, avec ses deux écritures
 *
 * CE QUE CES ACTIONS NE FONT JAMAIS
 *
 * Aucune écriture libre. Une écriture naît d'un règlement, d'un paiement divers
 * ou d'un virement validé — jamais d'un formulaire. Le dépôt, le retrait et la
 * correction figurent au vocabulaire de Module 06 §20 : aucun écran ne les
 * produit.
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
    /doivent être distincts/i,
    'Le compte source et le compte destination doivent être différents : un virement d’un compte vers lui-même ne déplace rien.',
  ],
  [
    /fonds disponibles sont insuffisants|ne dispose que de/i,
    'Le compte source ne dispose pas des fonds nécessaires. Le virement est bloqué.',
  ],
  [
    /n'est pas actif|n’est plus actif/i,
    'Un compte du virement n’est pas actif : un compte inactif ou archivé ne reçoit plus de nouvelle opération.',
  ],
  [
    /devise du compte source|ne partagent plus la même devise/i,
    'Les deux comptes n’ont pas la même devise. Aucune conversion n’est définie.',
  ],
  [
    /seul un virement en brouillon peut être validé/i,
    'Seul un virement en brouillon se valide. Celui-ci ne l’est plus.',
  ],
  [/ce virement est déjà annulé/i, 'Ce virement est déjà annulé.'],
  [
    /un virement ne se modifie pas/i,
    'Un virement ne se modifie pas : il s’annule, et un virement correct est enregistré.',
  ],
  [
    /porte EXACTEMENT deux écritures|mouvement sans contrepartie|écritures produites par ce virement/i,
    'Le virement n’a pas pu produire ses deux écritures. L’opération est annulée dans son ensemble : aucun compte ne porte de mouvement isolé.',
  ],
  [
    /n'est pas lisible avec vos droits|n’est pas lisible avec vos droits/i,
    'Certaines informations nécessaires à cette opération ne sont pas accessibles avec vos droits.',
  ],
  [
    /Virement introuvable/i,
    'Ce virement est introuvable ou n’est pas accessible avec vos droits.',
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

/* -------------------------------------------------------------------------- */
/*  Virement interne — Module 06 §28 à §33                                     */
/*                                                                             */
/*  TROIS ACTES, TROIS CAPACITÉS, ET C'EST LA VALIDATION QUI DÉPLACE LES FONDS */
/*                                                                             */
/*  La saisie ne produit rien : ni écriture, ni mouvement de solde. Le contrôle */
/*  de solde de §30 porte donc sur l'instant où l'argent sort réellement, et    */
/*  non sur un chiffre qui serait périmé au moment de la validation.           */
/* -------------------------------------------------------------------------- */

const AMOUNT_PATTERN = /^\d+$/

/** Montant saisi → entier KMF strictement positif (DEC-010). */
function toAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '')
  if (!AMOUNT_PATTERN.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function revalidateTreasury(transferId?: string) {
  if (transferId) revalidatePath(`/tresorerie/virements/${transferId}`)
  revalidatePath('/tresorerie/virements')
  revalidatePath('/tresorerie/comptes')
  revalidatePath('/tresorerie/ecritures')
}

export async function createInternalTransferAction(
  prevState: TreasuryFormState,
  formData: FormData
): Promise<TreasuryFormState> {
  return guarded(
    'virement interne:saisie',
    async () => {
      await requirePermission(PERMISSIONS.TRANSFERS_CREATE)

      const parsed = z
        .object({
          sourceAccountId: z.string().uuid('Choisissez le compte source.'),
          destinationAccountId: z.string().uuid('Choisissez le compte destination.'),
          transferDate: z
            .string()
            .trim()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez la date du virement.'),
        })
        .safeParse({
          sourceAccountId: readText(formData, 'sourceAccountId'),
          destinationAccountId: readText(formData, 'destinationAccountId'),
          transferDate: readText(formData, 'transferDate'),
        })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      // Le serveur le refuse aussi (§29) ; le dire ici évite un aller-retour
      // pour une erreur que l'écran peut voir.
      if (parsed.data.sourceAccountId === parsed.data.destinationAccountId) {
        return {
          fieldErrors: {
            destinationAccountId:
              'Le compte destination doit être différent du compte source.',
          },
        }
      }

      const amount = toAmount(readText(formData, 'amount'))
      if (amount === null) {
        return {
          fieldErrors: {
            amount: 'Indiquez un montant entier positif, en KMF, sans espace ni décimale.',
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('create_internal_transfer', {
        p_source_account_id: parsed.data.sourceAccountId,
        p_destination_account_id: parsed.data.destinationAccountId,
        p_amount: amount,
        p_transfer_date: parsed.data.transferDate,
        p_purpose: orNull(readText(formData, 'purpose')),
        p_reference: orNull(readText(formData, 'reference')),
        p_notes: orNull(readText(formData, 'notes')),
      })

      if (error) throw new Error(error.message)

      revalidateTreasury()
      redirect(`/tresorerie/virements/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

/** Valider — §30 (contrôle du solde) puis §31 (les deux écritures). */
export async function validateInternalTransferAction(
  prevState: TreasuryFormState,
  formData: FormData
): Promise<TreasuryFormState> {
  return guarded(
    'virement interne:validation',
    async () => {
      await requirePermission(PERMISSIONS.TRANSFERS_VALIDATE)

      const transferId = readText(formData, 'transferId')
      if (!transferId) return { error: 'Virement introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('validate_internal_transfer', {
        p_transfer_id: transferId,
      })

      if (error) throw new Error(error.message)

      revalidateTreasury(transferId)

      return {
        success:
          'Le virement est validé : le compte source est débité et le compte destination crédité du même montant.',
      }
    },
    ERROR_PATTERNS
  )
}

/** Annuler — §33. Les deux écritures suivent ; rien n'est effacé. */
export async function cancelInternalTransferAction(
  prevState: TreasuryFormState,
  formData: FormData
): Promise<TreasuryFormState> {
  return guarded(
    'virement interne:annulation',
    async () => {
      await requirePermission(PERMISSIONS.TRANSFERS_CANCEL)

      const transferId = readText(formData, 'transferId')
      if (!transferId) return { error: 'Virement introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_internal_transfer', {
        p_transfer_id: transferId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidateTreasury(transferId)

      return {
        success:
          'Le virement est annulé. Les deux soldes reviennent d’autant ; les écritures restent, marquées annulées.',
      }
    },
    ERROR_PATTERNS
  )
}
