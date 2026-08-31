'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { canAny, requirePermission, requireSession } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'

/**
 * Actions de facturation client — Étape 2.5, LOT 7.
 *
 * CINQ COUCHES, PAS UNE (audit 041–042).
 *
 * Ces gardes serveur sont la PREMIÈRE. Elles ne sont ni la seule ni la dernière :
 * les fonctions atomiques revérifient la capacité, les déclencheurs imposent les
 * transitions et figent ce qui doit l'être, RLS refuse l'écriture, et un
 * déclencheur d'INSERT empêche une facture de naître émise. Un appel direct à
 * PostgREST ne rencontre aucune ligne de ce fichier — d'où les quatre autres.
 *
 * SIX CAPACITÉS, SIX ACTES
 *
 *   `billing.customer_invoices.create`  préparer une facture
 *   `billing.customer_invoices.update`  la compléter, la corriger
 *   `billing.customer_invoices.issue`   l'émettre — et rendre la location
 *                                       « Facturée »
 *   `billing.customer_invoices.cancel`  l'annuler — et rendre la location à
 *                                       « À facturer »
 *   `billing.customer_invoices.view`    la consulter
 *   `billing.customer_invoices.export`  l'exporter
 *
 * Aucune n'est impliquée par une autre (DEC-024).
 *
 * CE QUE CES ACTIONS NE FONT JAMAIS
 *
 * Aucun encaissement, aucun mouvement de compte. Émettre une facture reconnaît
 * une créance ; elle ne l'encaisse pas.
 */

export type CustomerInvoiceFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /ne porte aucune ligne facturable/i,
    'Cette facture ne porte aucune ligne facturable : un total est nécessaire à son émission.',
  ],
  [
    /réductions .* dépassent le sous-total|total de cette facture serait nul/i,
    'Les réductions dépassent le montant facturé. Un avoir relève de règles qu’ADIKOM n’a pas arrêtées.',
  ],
  [
    /lignes d'une facture émise ou annulée sont figées/i,
    'Les lignes d’une facture émise ou annulée sont figées.',
  ],
  [
    /une facture émise ou annulée ne se modifie plus/i,
    'Cette facture est émise ou annulée : elle ne se modifie plus.',
  ],
  [
    /seule une facture en brouillon peut être émise/i,
    'Seule une facture en brouillon peut être émise.',
  ],
  [
    /cette facture est déjà annulée/i,
    'Cette facture est déjà annulée.',
  ],
  [
    /cette location porte déjà une facture/i,
    'Cette location porte déjà une facture. Une prestation ne se facture pas deux fois.',
  ],
  [
    /seule une location « À facturer » se facture/i,
    'Seule une location « À facturer » peut être facturée : le retour doit être enregistré et le contrôle validé.',
  ],
  [
    /cette location n'est plus « À facturer »/i,
    'Cette location n’est plus « À facturer » : son état a changé depuis la préparation de la facture.',
  ],
  [
    /n'est pas celle du client facturé/i,
    'Cette location n’est pas celle du client facturé.',
  ],
  [
    /la location de cette facture est clôturée/i,
    'La location de cette facture est clôturée : une clôture d’exploitation ne se défait pas par l’annulation d’une facture.',
  ],
  [
    /seule une location facturée se clôture/i,
    'Seule une location facturée se clôture. Émettez d’abord sa facture.',
  ],
  [
    /état de règlement d'une facture se CALCULE/i,
    'L’état de règlement découle des encaissements enregistrés, et les règlements clients ne sont pas encore gérés.',
  ],
  [
    /« En retard » se déduit de l'échéance/i,
    '« En retard » se déduit de l’échéance : ce statut ne se déclare pas.',
  ],
  [
    /échéance ne peut pas précéder/i,
    'L’échéance ne peut pas précéder la date de la facture.',
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

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez une date valide.')

/** Montant ou quantité saisis → entier (DEC-010 : jamais un flottant). */
function toInteger(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '')
  if (cleaned === '' || !/^\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/* -------------------------------------------------------------------------- */
/*  Préparer une facture — Workflow 07 §18, §25                                */
/* -------------------------------------------------------------------------- */

const createSchema = z.object({
  clientId: z.string().uuid('Choisissez le client facturé.'),
  invoiceDate: dateSchema,
})

export async function createCustomerInvoiceAction(
  prevState: CustomerInvoiceFormState,
  formData: FormData
): Promise<CustomerInvoiceFormState> {
  return guarded(
    'facture client:création',
    async () => {
      await requirePermission(PERMISSIONS.CUSTOMER_INVOICES_CREATE)

      const parsed = createSchema.safeParse({
        clientId: readText(formData, 'clientId'),
        invoiceDate: readText(formData, 'invoiceDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const dueDate = orNull(readText(formData, 'dueDate'))
      if (dueDate && dueDate < parsed.data.invoiceDate) {
        return { fieldErrors: { dueDate: 'L’échéance ne peut pas précéder la date de la facture.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('create_customer_invoice', {
        p_client_id: parsed.data.clientId,
        p_invoice_date: parsed.data.invoiceDate,
        p_due_date: dueDate,
        p_rental_id: orNull(readText(formData, 'rentalId')),
        p_notes: orNull(readText(formData, 'notes')),
      })

      if (error) throw new Error(error.message)

      revalidatePath('/facturation/clients')
      revalidatePath('/location/locations')
      redirect(`/facturation/clients/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Modifier l'en-tête — tant que la facture est en brouillon                  */
/* -------------------------------------------------------------------------- */

export async function updateCustomerInvoiceAction(
  prevState: CustomerInvoiceFormState,
  formData: FormData
): Promise<CustomerInvoiceFormState> {
  return guarded(
    'facture client:modification',
    async () => {
      await requirePermission(PERMISSIONS.CUSTOMER_INVOICES_UPDATE)

      const invoiceId = readText(formData, 'invoiceId')
      if (!invoiceId) return { error: 'Facture introuvable.' }

      const parsed = z.object({ invoiceDate: dateSchema }).safeParse({
        invoiceDate: readText(formData, 'invoiceDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const dueDate = orNull(readText(formData, 'dueDate'))
      if (dueDate && dueDate < parsed.data.invoiceDate) {
        return { fieldErrors: { dueDate: 'L’échéance ne peut pas précéder la date de la facture.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('update_customer_invoice', {
        p_invoice_id: invoiceId,
        p_invoice_date: parsed.data.invoiceDate,
        p_due_date: dueDate,
        p_notes: orNull(readText(formData, 'notes')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/clients/${invoiceId}`)
      revalidatePath('/facturation/clients')

      return { success: 'La facture a été modifiée.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Lignes — la seule source des montants (Workflow 07 §22, §60)               */
/* -------------------------------------------------------------------------- */

export async function addCustomerInvoiceLineAction(
  prevState: CustomerInvoiceFormState,
  formData: FormData
): Promise<CustomerInvoiceFormState> {
  return guarded(
    'facture client:ligne',
    async () => {
      /*
       * `update` OU `create` : ajouter une ligne appartient à la SAISIE de la
       * facture, que l'un ou l'autre porte selon qu'on la crée ou qu'on la
       * complète. La fonction serveur applique la même règle.
       */
      await requireSession()
      const maySave = await canAny([
        PERMISSIONS.CUSTOMER_INVOICES_UPDATE,
        PERMISSIONS.CUSTOMER_INVOICES_CREATE,
      ])
      if (!maySave) return { error: 'Droit insuffisant pour cette opération.' }

      const invoiceId = readText(formData, 'invoiceId')
      if (!invoiceId) return { error: 'Facture introuvable.' }

      const parsed = z
        .object({
          kind: z.enum(['RENTAL', 'SERVICE', 'FEE', 'DISCOUNT'], {
            message: 'Choisissez la nature de la ligne.',
          }),
          label: z
            .string()
            .trim()
            .min(2, 'Désignez cette ligne.')
            .max(200, 'Désignation trop longue.'),
        })
        .safeParse({
          kind: readText(formData, 'kind'),
          label: readText(formData, 'label'),
        })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const quantity = toInteger(readText(formData, 'quantity'))
      if (quantity === null) {
        return { fieldErrors: { quantity: 'Indiquez une quantité entière positive.' } }
      }

      const unitPrice = toInteger(readText(formData, 'unitPrice'))
      if (unitPrice === null) {
        return { fieldErrors: { unitPrice: 'Indiquez un prix unitaire entier positif, en KMF.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('add_customer_invoice_line', {
        p_invoice_id: invoiceId,
        p_kind: parsed.data.kind,
        p_label: parsed.data.label,
        p_quantity: quantity,
        p_unit_price: unitPrice,
        p_justification: orNull(readText(formData, 'justification')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/clients/${invoiceId}`)
      revalidatePath('/facturation/clients')

      return { success: 'La ligne a été ajoutée.' }
    },
    ERROR_PATTERNS
  )
}

export async function archiveCustomerInvoiceLineAction(
  prevState: CustomerInvoiceFormState,
  formData: FormData
): Promise<CustomerInvoiceFormState> {
  return guarded(
    'facture client:retrait de ligne',
    async () => {
      await requirePermission(PERMISSIONS.CUSTOMER_INVOICES_UPDATE)

      const lineId = readText(formData, 'lineId')
      const invoiceId = readText(formData, 'invoiceId')
      if (!lineId) return { error: 'Ligne introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('archive_customer_invoice_line', {
        p_line_id: lineId,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/clients/${invoiceId}`)
      revalidatePath('/facturation/clients')

      return { success: 'La ligne a été retirée de la facture. Elle reste conservée.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Émettre — la créance est reconnue, la location devient « Facturée »        */
/* -------------------------------------------------------------------------- */

export async function issueCustomerInvoiceAction(
  prevState: CustomerInvoiceFormState,
  formData: FormData
): Promise<CustomerInvoiceFormState> {
  return guarded(
    'facture client:émission',
    async () => {
      await requirePermission(PERMISSIONS.CUSTOMER_INVOICES_ISSUE)

      const invoiceId = readText(formData, 'invoiceId')
      if (!invoiceId) return { error: 'Facture introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('issue_customer_invoice', {
        p_invoice_id: invoiceId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/clients/${invoiceId}`)
      revalidatePath('/facturation/clients')
      revalidatePath('/location/locations')

      return {
        success:
          'La facture est émise : la créance est reconnue et ses lignes sont figées. La location qu’elle facture est désormais « Facturée ». Aucun encaissement n’a été enregistré.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annuler — la location redevient « À facturer »                             */
/* -------------------------------------------------------------------------- */

export async function cancelCustomerInvoiceAction(
  prevState: CustomerInvoiceFormState,
  formData: FormData
): Promise<CustomerInvoiceFormState> {
  return guarded(
    'facture client:annulation',
    async () => {
      await requirePermission(PERMISSIONS.CUSTOMER_INVOICES_CANCEL)

      const invoiceId = readText(formData, 'invoiceId')
      if (!invoiceId) return { error: 'Facture introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_customer_invoice', {
        p_invoice_id: invoiceId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/clients/${invoiceId}`)
      revalidatePath('/facturation/clients')
      revalidatePath('/location/locations')

      return {
        success:
          'La facture est annulée. L’historique est conservé, et la location qu’elle facturait redevient « À facturer ».',
      }
    },
    ERROR_PATTERNS
  )
}
