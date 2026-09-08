'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'
import { MISC_PAYMENT_CATEGORY_ORDER, MISC_PAYMENT_DIRECTIONS } from './constants'

/**
 * Actions de paiement divers — Module 07 §43 à §47, LOT 17.
 *
 * QUATRE CAPACITÉS, QUATRE ACTES
 *
 *   `billing.misc_payments.view`      consulter les paiements
 *   `billing.misc_payments.create`    en saisir un (brouillon)
 *   `billing.misc_payments.validate`  le valider — ce geste produit l'écriture
 *                                     de sortie et diminue le compte (§45)
 *   `billing.misc_payments.cancel`    l'annuler, avec son écriture (§47)
 *
 * LA VALIDATION EST UN ACTE DISTINCT, ET LE CATALOGUE LE DIT
 *
 * Les règlements clients et fournisseurs n'ont pas de capacité de validation :
 * ils CONSTATENT un mouvement déjà survenu, naissent validés et s'annulent
 * (DEC-029 §c). Le paiement divers en possède une, et §46 nomme explicitement
 * ses trois états. Saisir et engager les fonds sont donc deux gestes, qui
 * peuvent relever de deux personnes (DEC-040).
 *
 * AUCUNE MODIFICATION
 *
 * §52 cite « modifier » parmi les permissions envisageables, mais
 * `billing.misc_payments.update` n'existe pas au catalogue. Un brouillon erroné
 * s'annule, et un paiement correct est saisi (§47).
 */

export type MiscPaymentFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /bénéficiaire du paiement est obligatoire/i,
    'Indiquez à qui ce paiement est versé : un décaissement anonyme ne se contrôle pas.',
  ],
  [
    /motif du paiement est obligatoire/i,
    'Indiquez le motif de ce paiement : un mouvement sans cause écrite ne se contrôle pas.',
  ],
  [
    /sens du paiement est obligatoire/i,
    'Indiquez s’il s’agit d’un encaissement ou d’un décaissement.',
  ],
  [
    /n'est pas actif|n’est plus actif/i,
    'Ce compte n’est pas actif : un compte inactif ou archivé ne reçoit plus de nouvelle opération.',
  ],
  [
    /seul un paiement divers en brouillon peut être validé/i,
    'Seul un paiement en brouillon se valide. Celui-ci ne l’est plus.',
  ],
  [/ce paiement est déjà annulé/i, 'Ce paiement est déjà annulé.'],
  [
    /un paiement divers ne se modifie pas/i,
    'Un paiement divers ne se modifie pas : il s’annule, et un paiement correct est enregistré.',
  ],
  [
    /porte EXACTEMENT une écriture|sortie sans cause|écriture produite par ce paiement/i,
    'Le paiement n’a pas pu produire ou défaire son écriture. L’opération est annulée dans son ensemble : le compte ne porte aucun mouvement isolé.',
  ],
  [
    /Paiement divers introuvable/i,
    'Ce paiement est introuvable ou n’est pas accessible avec vos droits.',
  ],
  [
    /n'est pas lisible avec vos droits|n’est pas lisible avec vos droits/i,
    'Certaines informations nécessaires à cette opération ne sont pas accessibles avec vos droits.',
  ],
  [
    /Droit insuffisant pour cette opération/i,
    'Vous ne disposez pas de la capacité exacte requise pour cette opération.',
  ],
]

const schema = z.object({
  accountId: z.string().uuid('Choisissez le compte source.'),
  paidOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez la date du paiement.'),
  beneficiary: z
    .string()
    .trim()
    .min(2, 'Indiquez le bénéficiaire du paiement.')
    .max(160, 'Bénéficiaire trop long.'),
  purpose: z
    .string()
    .trim()
    .min(3, 'Indiquez le motif du paiement.')
    .max(300, 'Motif trop long.'),
})

/** Montant saisi → entier KMF strictement positif (DEC-010). */
function toAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function revalidateMisc(paymentId?: string) {
  if (paymentId) revalidatePath(`/facturation/paiements-divers/${paymentId}`)
  revalidatePath('/facturation/paiements-divers')
  revalidatePath('/tresorerie/comptes')
  revalidatePath('/tresorerie/ecritures')
}

/* -------------------------------------------------------------------------- */
/*  Saisir — §43, §44                                                          */
/* -------------------------------------------------------------------------- */

export async function createMiscPaymentAction(
  prevState: MiscPaymentFormState,
  formData: FormData
): Promise<MiscPaymentFormState> {
  return guarded(
    'paiement divers:saisie',
    async () => {
      await requirePermission(PERMISSIONS.MISC_PAYMENTS_CREATE)

      const category = readText(formData, 'category')
      if (!MISC_PAYMENT_CATEGORY_ORDER.includes(category as never)) {
        return { fieldErrors: { category: 'Choisissez la catégorie du paiement.' } }
      }

      /*
       * Le sens est OBLIGATOIRE (DEC-042 §b).
       *
       * Le déduire d'un défaut reviendrait à décider en silence qu'un paiement
       * est une sortie — la base le refuse d'ailleurs pour la même raison.
       */
      const direction = readText(formData, 'direction')
      if (!MISC_PAYMENT_DIRECTIONS.includes(direction as never)) {
        return {
          fieldErrors: {
            direction: 'Indiquez s’il s’agit d’un encaissement ou d’un décaissement.',
          },
        }
      }

      const parsed = schema.safeParse({
        accountId: readText(formData, 'accountId'),
        paidOn: readText(formData, 'paidOn'),
        beneficiary: readText(formData, 'beneficiary'),
        purpose: readText(formData, 'purpose'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const amount = toAmount(readText(formData, 'amount'))
      if (amount === null) {
        return {
          fieldErrors: {
            amount: 'Indiquez un montant entier positif, en KMF, sans espace ni décimale.',
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('create_misc_payment', {
        p_account_id: parsed.data.accountId,
        p_amount: amount,
        p_paid_on: parsed.data.paidOn,
        p_direction: direction,
        p_category: category,
        p_beneficiary: parsed.data.beneficiary,
        p_purpose: parsed.data.purpose,
        p_external_ref: orNull(readText(formData, 'externalRef')),
        p_notes: orNull(readText(formData, 'notes')),
      })

      if (error) throw new Error(error.message)

      revalidateMisc()
      redirect(`/facturation/paiements-divers/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Valider — §45                                                              */
/* -------------------------------------------------------------------------- */

export async function validateMiscPaymentAction(
  prevState: MiscPaymentFormState,
  formData: FormData
): Promise<MiscPaymentFormState> {
  return guarded(
    'paiement divers:validation',
    async () => {
      await requirePermission(PERMISSIONS.MISC_PAYMENTS_VALIDATE)

      const paymentId = readText(formData, 'paymentId')
      if (!paymentId) return { error: 'Paiement introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('validate_misc_payment', {
        p_payment_id: paymentId,
      })

      if (error) throw new Error(error.message)

      revalidateMisc(paymentId)

      /*
       * Le message ne dit pas « débité » : le sens décide, et la moitié des
       * paiements divers créditent désormais le compte (DEC-042 §b). Le
       * formulaire, lui, annonçait déjà l'effet exact avant le clic.
       */
      return {
        success:
          'Le paiement est validé : le compte est mouvementé du montant, dans le sens du paiement, et l’écriture correspondante est enregistrée.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annuler — §47                                                              */
/* -------------------------------------------------------------------------- */

export async function cancelMiscPaymentAction(
  prevState: MiscPaymentFormState,
  formData: FormData
): Promise<MiscPaymentFormState> {
  return guarded(
    'paiement divers:annulation',
    async () => {
      await requirePermission(PERMISSIONS.MISC_PAYMENTS_CANCEL)

      const paymentId = readText(formData, 'paymentId')
      if (!paymentId) return { error: 'Paiement introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_misc_payment', {
        p_payment_id: paymentId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidateMisc(paymentId)

      return {
        success:
          'Le paiement est annulé. Le solde du compte revient d’autant ; l’écriture reste, marquée annulée.',
      }
    },
    ERROR_PATTERNS
  )
}
