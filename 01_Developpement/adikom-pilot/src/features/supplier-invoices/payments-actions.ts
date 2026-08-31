'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'

/**
 * Actions de règlement fournisseur — Étape 2.5, LOT 6.
 *
 * TROIS CAPACITÉS, TROIS ACTES
 *
 *   `billing.supplier_payments.view`    consulter les règlements
 *   `billing.supplier_payments.create`  enregistrer un décaissement
 *   `billing.supplier_payments.cancel`  l'annuler
 *
 * AUCUNE CAPACITÉ DE VALIDATION N'EXISTE, et ce n'est pas un oubli :
 * `billing.misc_payments` en possède une, pas celle-ci. Workflow 08 §56 pose
 * d'ailleurs la séparation saisie/validation comme une FACULTÉ — « ADIKOM peut
 * décider de séparer ». Un règlement constate ici un décaissement déjà
 * effectué : il naît validé, et s'annule (DEC-029).
 *
 * CE QUE CES ACTIONS NE FONT JAMAIS
 *
 * Aucune écriture libre dans la trésorerie. Le règlement PRODUIT son écriture,
 * il ne l'écrit pas : le serveur vérifie qu'elle correspond bien au règlement
 * dont elle se réclame.
 */

export type SupplierPaymentFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /dépasse le reste dû/i,
    'Ce règlement dépasse le reste dû sur cette facture. Aucun solde négatif n’est créé automatiquement.',
  ],
  [
    /déjà soldée/i,
    'Cette facture est déjà soldée : aucun règlement supplémentaire n’est accepté.',
  ],
  [
    /seule une facture fournisseur validée peut être réglée/i,
    'Seule une facture validée peut être réglée.',
  ],
  [
    /n'est pas actif/i,
    'Ce compte n’est pas actif : un compte inactif ou archivé ne reçoit plus de nouvelle opération.',
  ],
  [
    /devise du compte/i,
    'La devise du compte diffère de celle de la facture. Aucune conversion n’est définie.',
  ],
  [
    /ce règlement est déjà annulé/i,
    'Ce règlement est déjà annulé.',
  ],
  [
    /un règlement ne se modifie pas/i,
    'Un règlement ne se modifie pas : il s’annule, et un règlement correct est enregistré.',
  ],
  [
    /ont été réglés sur cette facture/i,
    'Des règlements soldent encore cette facture : chacun doit d’abord être annulé.',
  ],
  [
    /n'est pas lisible avec vos droits/i,
    'Certaines informations nécessaires à cette opération ne sont pas accessibles avec vos droits.',
  ],
  [
    /Droit insuffisant pour cette opération/i,
    'Vous ne disposez pas de la capacité exacte requise pour cette opération.',
  ],
]

const METHODS = ['CASH', 'BANK_TRANSFER', 'BANK_DEPOSIT', 'CHEQUE', 'OTHER'] as const

const schema = z.object({
  accountId: z.string().uuid('Choisissez le compte à mouvementer.'),
  amount: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Indiquez un montant entier en KMF, sans espace ni décimale.'),
  paidOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez la date réelle du règlement.'),
})

/** Montant saisi → entier KMF strictement positif (DEC-010). */
function toAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/* -------------------------------------------------------------------------- */
/*  Enregistrer un règlement — Workflow 08                                     */
/* -------------------------------------------------------------------------- */

export async function recordSupplierPaymentAction(
  prevState: SupplierPaymentFormState,
  formData: FormData
): Promise<SupplierPaymentFormState> {
  return guarded(
    'règlement fournisseur:enregistrement',
    async () => {
      await requirePermission(PERMISSIONS.SUPPLIER_PAYMENTS_CREATE)

      const invoiceId = readText(formData, 'invoiceId')
      if (!invoiceId) return { error: 'Facture introuvable.' }

      const method = readText(formData, 'method')
      if (!METHODS.includes(method as (typeof METHODS)[number])) {
        return { fieldErrors: { method: 'Choisissez le mode de paiement.' } }
      }

      const parsed = schema.safeParse({
        accountId: readText(formData, 'accountId'),
        amount: readText(formData, 'amount').replace(/\s/g, ''),
        paidOn: readText(formData, 'paidOn'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const amount = toAmount(parsed.data.amount)
      if (amount === null) {
        return { fieldErrors: { amount: 'Indiquez un montant entier positif, en KMF.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('record_supplier_payment', {
        p_invoice_id: invoiceId,
        p_account_id: parsed.data.accountId,
        p_amount: amount,
        p_paid_on: parsed.data.paidOn,
        p_method: method,
        p_external_ref: orNull(readText(formData, 'externalRef')),
        p_notes: orNull(readText(formData, 'notes')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/fournisseurs/${invoiceId}`)
      revalidatePath('/facturation/fournisseurs')
      revalidatePath('/tresorerie/comptes')
      revalidatePath('/tresorerie/ecritures')

      return {
        success:
          'Le règlement est enregistré : le compte est débité d’autant, et le reste dû de la facture diminue.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annuler un règlement — §28, §29                                            */
/* -------------------------------------------------------------------------- */

export async function cancelSupplierPaymentAction(
  prevState: SupplierPaymentFormState,
  formData: FormData
): Promise<SupplierPaymentFormState> {
  return guarded(
    'règlement fournisseur:annulation',
    async () => {
      await requirePermission(PERMISSIONS.SUPPLIER_PAYMENTS_CANCEL)

      const paymentId = readText(formData, 'paymentId')
      const invoiceId = readText(formData, 'invoiceId')
      if (!paymentId) return { error: 'Règlement introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_supplier_payment', {
        p_payment_id: paymentId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/fournisseurs/${invoiceId}`)
      revalidatePath('/facturation/fournisseurs')
      revalidatePath('/tresorerie/comptes')
      revalidatePath('/tresorerie/ecritures')

      return {
        success:
          'Le règlement est annulé. Le solde du compte et le reste dû de la facture remontent d’autant ; l’historique est conservé.',
      }
    },
    ERROR_PATTERNS
  )
}
