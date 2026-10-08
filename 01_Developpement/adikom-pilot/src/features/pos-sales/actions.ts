'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { can, requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { friendlyError, guarded, readText } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'
import { COUNTER_METHODS } from './constants'

/**
 * Actions des ventes au comptoir — LOT 28 (Module 12 §13 à §19).
 *
 * TROIS BARRIÈRES, COMME PARTOUT DANS LE SAAS
 *
 *   1. ici, `requirePermission` — un refus net, avant toute écriture ;
 *   2. la FONCTION en base, qui exige SES capacités (`require_capability`) —
 *      remise et crédit compris (D-1, P-4), vérifiés DANS `record_pos_sale` ;
 *   3. RLS et les gardes : une vente, ses lignes, ses paiements, l'écriture, le
 *      lien vers la facture et le règlement adossé naissent PAR LEURS FONCTIONS.
 *
 * 🟥 AUCUN MONTANT N'EST ENVOYÉ COMME VÉRITÉ : l'écran transmet le service, la
 * quantité, les remises, le mode, le montant DONNÉ et (hors espèces) le compte.
 * Le prix, l'encaissé, la monnaie et l'écriture sont décidés par la base.
 */

export type PosSaleFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [/session de caisse est close|exige une session ouverte|Session de caisse introuvable/i, 'Aucune session ouverte : ouvrez une session de caisse pour encaisser.'],
  [/sa propre session/i, 'On n’encaisse que sur sa propre session de caisse.'],
  [/il manque (\d+) KMF/i, 'Le montant encaissé ne couvre pas le net à payer. Complétez le paiement, ou validez une vente non soldée.'],
  [/non soldée exige un client|créance sans débiteur/i, 'Une vente non soldée exige un client enregistré : choisissez le client, ou réglez la vente intégralement.'],
  [/valider une vente non soldée/i, 'Valider une vente non soldée relève d’une capacité que vous n’avez pas.'],
  [/accorder une remise/i, 'Accorder une remise relève d’une capacité que vous n’avez pas.'],
  [/remise .*dépasse|remise globale .*dépasse/i, 'Une remise ne peut pas dépasser le montant qu’elle réduit : le net n’est jamais négatif.'],
  [/hors espèces .*dépassent|monnaie ne se rend/i, 'Aucune monnaie ne se rend sur un chèque ni un transfert mobile : le paiement hors espèces ne peut pas dépasser le net.'],
  [/au plus une remise d'espèces/i, 'Une vente reçoit au plus une remise d’espèces.'],
  [/déjà réglée sans espèces/i, 'La vente est déjà réglée sans espèces : retirez le montant en espèces.'],
  [/jamais dans une caisse|compte bancaire déclaré/i, 'Un paiement hors espèces entre sur un compte bancaire déclaré (Mvola, Holo, Wakati, banque), jamais dans une caisse.'],
  [/désigne le compte sur lequel il entre/i, 'Choisissez le compte sur lequel entre chaque paiement hors espèces.'],
  [/ne reçoit plus de nouvelle opération/i, 'Ce compte n’est pas actif : il ne reçoit plus de nouvelle opération.'],
  [/n'est pas un service de vente/i, 'Ce service n’est pas destiné à la vente.'],
  [/n'est pas actif au catalogue/i, 'Ce service n’est plus actif au catalogue.'],
  [/aucun prix de vente n'est en vigueur/i, 'Aucun prix de vente n’est en vigueur aujourd’hui pour ce service.'],
  [/déjà reprise par la facture|ne se facture qu'une fois/i, 'Cette vente est déjà facturée. Une vente ne se facture qu’une fois.'],
  [/vente anonyme ne se facture pas|n'a pas de client/i, 'Une vente sans client ne se facture pas : une facture se rattache à un client enregistré.'],
  [/créance de zéro/i, 'Le net de cette vente est nul : il n’y a rien à facturer.'],
  [/vente facturée ne s'annule pas/i, 'Cette vente est facturée : elle ne s’annule pas tant que les avoirs ne sont pas gérés.'],
  [/motif d'annulation est obligatoire/i, 'Le motif d’annulation est obligatoire.'],
  [/déjà annulée/i, 'Cette vente est déjà annulée.'],
  [/annuler les écritures de la vente/i, 'Annuler une vente suppose de pouvoir consulter les écritures de trésorerie qu’elle a produites.'],
  [/vérifier que la vente n'est pas facturée/i, 'Annuler une vente suppose de pouvoir consulter les factures clients.'],
  [/Droit insuffisant pour cette opération/i, 'Vous ne disposez pas de toutes les capacités requises pour cette opération.'],
]

/* -------------------------------------------------------------------------- */
/*  Encaisser                                                                  */
/* -------------------------------------------------------------------------- */

const amount = z.number().int('Un montant est un entier de KMF.').min(0, 'Un montant ne peut pas être négatif.').max(1_000_000_000_000)

const saleInput = z.object({
  sessionId: z.string().uuid('Aucune session ouverte.'),
  clientId: z.string().uuid().nullable(),
  globalDiscount: amount,
  observation: z.string().trim().max(500, 'Observation trop longue.'),
  credit: z.boolean(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1, 'La quantité doit être au moins 1.').max(10_000),
        discount: amount,
      })
    )
    .min(1, 'Le panier est vide.')
    .max(200),
  payments: z
    .array(
      z.object({
        method: z.enum(COUNTER_METHODS),
        tendered: amount.min(1, 'Un montant donné est positif.'),
        accountId: z.string().uuid().nullable(),
        externalRef: z.string().trim().max(120),
      })
    )
    .max(10),
})

export type SaleInput = z.infer<typeof saleInput>

export type RecordSaleResult = { error?: string; saleId?: string }

export async function recordSaleAction(input: SaleInput): Promise<RecordSaleResult> {
  try {
    await requirePermission(PERMISSIONS.POS_SALES_CREATE)

    const parsed = saleInput.safeParse(input)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'La vente est mal formée.' }
    }
    const sale = parsed.data

    // Refus nets, AVANT l'écriture — la base les refait de toute façon.
    const discounted = sale.globalDiscount > 0 || sale.lines.some((line) => line.discount > 0)
    if (discounted && !(await can(PERMISSIONS.POS_SALES_DISCOUNT))) {
      return { error: 'Accorder une remise relève d’une capacité que vous n’avez pas.' }
    }
    if (sale.credit && !(await can(PERMISSIONS.POS_SALES_CREDIT))) {
      return { error: 'Valider une vente non soldée relève d’une capacité que vous n’avez pas.' }
    }

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('record_pos_sale', {
      p_session_id: sale.sessionId,
      p_lines: sale.lines.map((line) => ({
        variant_id: line.variantId,
        quantity: line.quantity,
        discount: line.discount,
      })),
      p_payments: sale.payments.map((payment) => ({
        method: payment.method,
        tendered: payment.tendered,
        account_id: payment.method === 'CASH' ? null : payment.accountId,
        external_ref: payment.externalRef || null,
      })),
      p_client_id: sale.clientId,
      p_global_discount: sale.globalDiscount,
      p_observation: sale.observation || null,
      p_credit: sale.credit,
      p_due_date: sale.credit ? sale.dueDate : null,
    })
    if (error) throw new Error(error.message)

    revalidatePath('/pdv/ventes')
    revalidatePath(`/pdv/sessions/${sale.sessionId}`)
    return { saleId: data as string }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[pdv:vente:encaissement] ${message}`)
    return { error: friendlyError(message, ERROR_PATTERNS) }
  }
}

/* -------------------------------------------------------------------------- */
/*  Facturer sur demande (A-11, C-2)                                           */
/* -------------------------------------------------------------------------- */

export async function invoiceSaleAction(
  prevState: PosSaleFormState,
  formData: FormData
): Promise<PosSaleFormState> {
  return guarded(
    'pdv:vente:facture',
    async () => {
      await requirePermission(PERMISSIONS.POS_SALES_VIEW)
      await requirePermission(PERMISSIONS.CUSTOMER_INVOICES_CREATE)
      await requirePermission(PERMISSIONS.CUSTOMER_INVOICES_ISSUE)

      const saleId = readText(formData, 'saleId')
      if (!saleId) return { error: 'Vente introuvable.' }

      const due = readText(formData, 'dueDate')
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { fieldErrors: { dueDate: 'Date invalide.' } }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('invoice_pos_sale', {
        p_sale_id: saleId,
        p_due_date: due || null,
      })
      if (error) throw new Error(error.message)

      revalidatePath(`/pdv/ventes/${saleId}`)
      revalidatePath('/facturation/clients')
      redirect(`/pdv/ventes/${saleId}?facturee=1`)
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annuler (B-10)                                                             */
/* -------------------------------------------------------------------------- */

export async function cancelSaleAction(
  prevState: PosSaleFormState,
  formData: FormData
): Promise<PosSaleFormState> {
  return guarded(
    'pdv:vente:annulation',
    async () => {
      await requirePermission(PERMISSIONS.POS_SALES_CANCEL)

      const saleId = readText(formData, 'saleId')
      if (!saleId) return { error: 'Vente introuvable.' }

      const reason = readText(formData, 'reason').trim()
      if (reason.length < 3) {
        return { fieldErrors: { reason: 'Le motif d’annulation est obligatoire.' } }
      }
      if (reason.length > 500) return { fieldErrors: { reason: 'Motif trop long.' } }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('cancel_pos_sale', { p_sale_id: saleId, p_reason: reason })
      if (error) throw new Error(error.message)

      revalidatePath('/pdv/ventes')
      revalidatePath(`/pdv/ventes/${saleId}`)
      redirect(`/pdv/ventes/${saleId}?annulee=1`)
    },
    ERROR_PATTERNS
  )
}
