'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'

/**
 * Actions de règlement client — Étape 2.5, LOT 8.
 *
 * TROIS CAPACITÉS, TROIS ACTES
 *
 *   `billing.customer_payments.view`    consulter les encaissements
 *   `billing.customer_payments.create`  enregistrer un encaissement
 *   `billing.customer_payments.cancel`  l'annuler
 *
 * AUCUNE CAPACITÉ DE VALIDATION N'EXISTE, et ce n'est pas un oubli :
 * `billing.misc_payments` en possède une, pas celle-ci. Workflow 08 §56 pose la
 * séparation saisie/validation comme une FACULTÉ — « ADIKOM peut décider de
 * séparer ». Un règlement constate ici un encaissement déjà reçu : il naît
 * validé, et s'annule (DEC-029 §c, reconduit).
 *
 * CE QUE CES ACTIONS NE FONT JAMAIS
 *
 * Aucune écriture libre dans la trésorerie. Le règlement PRODUIT son écriture
 * d'entrée, il ne l'écrit pas : le serveur vérifie qu'elle correspond bien au
 * règlement dont elle se réclame, dans le bon sens (§47).
 */

export type CustomerPaymentFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /dépasse le reste dû/i,
    'Ce règlement dépasse le reste dû sur cette facture. Le traitement d’un trop-perçu relève d’une règle qu’ADIKOM n’a pas arrêtée.',
  ],
  [
    /déjà soldée/i,
    'Cette facture est déjà soldée : aucun règlement supplémentaire n’est accepté.',
  ],
  [
    /seule une facture client émise peut être encaissée/i,
    'Seule une facture émise peut être encaissée : une facture en brouillon ne reconnaît aucune créance, une facture annulée n’en reconnaît plus.',
  ],
  [
    /n'est pas actif/i,
    'Ce compte n’est pas actif : un compte inactif ou archivé ne reçoit plus de nouvelle opération.',
  ],
  [
    /devise du compte/i,
    'La devise du compte diffère de celle de la facture. Aucune conversion n’est définie.',
  ],
  [/ce règlement est déjà annulé/i, 'Ce règlement est déjà annulé.'],
  [
    /un règlement ne se modifie pas/i,
    'Un règlement ne se modifie pas : il s’annule, et un règlement correct est enregistré.',
  ],
  [
    /ont été encaissés sur cette facture/i,
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
  receivedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez la date réelle de l’encaissement.'),
})

/** Montant saisi → entier KMF strictement positif (DEC-010). */
function toAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/* -------------------------------------------------------------------------- */
/*  Enregistrer un encaissement — Workflow 08 §5, §47                          */
/* -------------------------------------------------------------------------- */

export async function recordCustomerPaymentAction(
  prevState: CustomerPaymentFormState,
  formData: FormData
): Promise<CustomerPaymentFormState> {
  return guarded(
    'règlement client:enregistrement',
    async () => {
      await requirePermission(PERMISSIONS.CUSTOMER_PAYMENTS_CREATE)

      const invoiceId = readText(formData, 'invoiceId')
      if (!invoiceId) return { error: 'Facture introuvable.' }

      const method = readText(formData, 'method')
      if (!METHODS.includes(method as (typeof METHODS)[number])) {
        return { fieldErrors: { method: 'Choisissez le mode de paiement.' } }
      }

      const parsed = schema.safeParse({
        accountId: readText(formData, 'accountId'),
        amount: readText(formData, 'amount').replace(/\s/g, ''),
        receivedOn: readText(formData, 'receivedOn'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const amount = toAmount(parsed.data.amount)
      if (amount === null) {
        return { fieldErrors: { amount: 'Indiquez un montant entier positif, en KMF.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('record_customer_payment', {
        p_invoice_id: invoiceId,
        p_account_id: parsed.data.accountId,
        p_amount: amount,
        p_received_on: parsed.data.receivedOn,
        p_method: method,
        p_external_ref: orNull(readText(formData, 'externalRef')),
        p_notes: orNull(readText(formData, 'notes')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/clients/${invoiceId}`)
      revalidatePath('/facturation/clients')
      revalidatePath('/tresorerie/comptes')
      revalidatePath('/tresorerie/ecritures')

      return {
        success:
          'Le règlement est enregistré : le compte est crédité d’autant, et le solde de la facture diminue.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annuler un encaissement — §28, §29                                         */
/* -------------------------------------------------------------------------- */

export async function cancelCustomerPaymentAction(
  prevState: CustomerPaymentFormState,
  formData: FormData
): Promise<CustomerPaymentFormState> {
  return guarded(
    'règlement client:annulation',
    async () => {
      await requirePermission(PERMISSIONS.CUSTOMER_PAYMENTS_CANCEL)

      const paymentId = readText(formData, 'paymentId')
      const invoiceId = readText(formData, 'invoiceId')
      if (!paymentId) return { error: 'Règlement introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_customer_payment', {
        p_payment_id: paymentId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/clients/${invoiceId}`)
      revalidatePath('/facturation/clients')
      revalidatePath('/tresorerie/comptes')
      revalidatePath('/tresorerie/ecritures')

      return {
        success:
          'Le règlement est annulé. Le solde du compte et celui de la facture reviennent d’autant ; l’historique est conservé.',
      }
    },
    ERROR_PATTERNS
  )
}
