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
 * Actions de facturation fournisseur — Étape 2.5, LOT 5.
 *
 * QUATRE COUCHES, PAS UNE (audit 041–042).
 *
 * Ces gardes serveur sont la PREMIÈRE. Elles ne sont ni la seule ni la
 * dernière : les fonctions atomiques revérifient la capacité, les déclencheurs
 * imposent les transitions et figent ce qui doit l'être, et RLS refuse
 * l'écriture. Un appel direct à PostgREST ne rencontre aucune ligne de ce
 * fichier — d'où les trois autres.
 *
 * SIX CAPACITÉS, SIX ACTES
 *
 *   `billing.supplier_invoices.create`    enregistrer une facture reçue
 *   `billing.supplier_invoices.update`    la compléter, la soumettre
 *   `billing.supplier_invoices.validate`  la valider
 *   `billing.supplier_invoices.cancel`    l'annuler
 *   `billing.supplier_invoices.view`      la consulter
 *   `billing.supplier_invoices.export`    l'exporter
 *
 * Aucune n'est impliquée par une autre (DEC-024).
 *
 * LE RATTACHEMENT RELÈVE DE L'IMPUTATION
 *
 * Rattacher une imputation à une facture ne modifie AUCUNE colonne de la
 * facture — son net à payer est une soustraction, pas une donnée. L'acte porte
 * donc `billing.imputations.update`, et exige en plus de pouvoir LIRE la
 * facture et les imputations qu'elle porte : sans ces lectures, le plafond de
 * Workflow 06 §20 s'appliquerait à des sommes muettes.
 *
 * CE QUE CES ACTIONS NE FONT JAMAIS
 *
 * Aucun paiement, aucun règlement, aucun mouvement de compte, aucune clôture.
 * Valider une facture reconnaît une dette ; elle ne la paie pas.
 */

export type SupplierInvoiceFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /ne porte aucune ligne/i,
    'Cette facture ne porte aucune ligne : un montant brut est nécessaire à sa validation.',
  ],
  [
    /lignes d'une facture validée ou annulée sont figées/i,
    'Les lignes d’une facture validée ou annulée sont figées.',
  ],
  [
    /une facture validée ou annulée ne se modifie plus/i,
    'Cette facture est validée ou annulée : elle ne se modifie plus.',
  ],
  [
    /seule une facture en brouillon peut être soumise/i,
    'Seule une facture en brouillon peut être soumise au contrôle.',
  ],
  [
    /seule une facture soumise au contrôle peut être validée/i,
    'Cette facture doit d’abord être soumise au contrôle.',
  ],
  [
    /sont imputés sur cette facture/i,
    'Des imputations réduisent encore cette facture : chacune doit d’abord en être détachée.',
  ],
  [
    /cette facture est déjà annulée/i,
    'Cette facture est déjà annulée.',
  ],
  [
    /seule une facture fournisseur validée peut recevoir une imputation/i,
    'Seule une facture validée peut recevoir une imputation.',
  ],
  [
    /n'est pas celle du fournisseur auquel la dépense est imputée/i,
    'Cette facture n’est pas celle du fournisseur auquel la dépense est imputée.',
  ],
  [
    /dépasserait le montant de la facture/i,
    'Ce rattachement ferait dépasser le montant de la facture. Aucun crédit ni report n’est créé automatiquement.',
  ],
  [
    /déjà rattachée à une facture/i,
    'Cette imputation est déjà rattachée à une facture.',
  ],
  [
    /seule une imputation validée et en attente de facture/i,
    'Seule une imputation validée et en attente de facture peut être rattachée.',
  ],
  [
    /seule une imputation rattachée à une facture peut en être détachée/i,
    'Cette imputation n’est rattachée à aucune facture.',
  ],
  [
    /état de règlement d'une facture découle des paiements/i,
    'L’état de règlement découle des paiements enregistrés, et les règlements fournisseurs ne sont pas encore gérés.',
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

const amountSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, 'Indiquez un montant entier en KMF, sans espace ni décimale.')

/** Montant saisi → entier KMF (DEC-010). */
function toAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/* -------------------------------------------------------------------------- */
/*  Enregistrer une facture reçue — Module 07 §28, DEC-007                     */
/* -------------------------------------------------------------------------- */

const createSchema = z.object({
  supplierId: z.string().uuid('Choisissez le fournisseur émetteur.'),
  invoiceDate: dateSchema,
})

export async function createSupplierInvoiceAction(
  prevState: SupplierInvoiceFormState,
  formData: FormData
): Promise<SupplierInvoiceFormState> {
  return guarded(
    'facture fournisseur:création',
    async () => {
      await requirePermission(PERMISSIONS.SUPPLIER_INVOICES_CREATE)

      const parsed = createSchema.safeParse({
        supplierId: readText(formData, 'supplierId'),
        invoiceDate: readText(formData, 'invoiceDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const dueDate = orNull(readText(formData, 'dueDate'))
      if (dueDate && dueDate < parsed.data.invoiceDate) {
        return { fieldErrors: { dueDate: 'L’échéance ne peut pas précéder la date de la facture.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('create_supplier_invoice', {
        p_supplier_id: parsed.data.supplierId,
        p_invoice_date: parsed.data.invoiceDate,
        p_due_date: dueDate,
        p_external_ref: orNull(readText(formData, 'externalRef')),
        p_notes: orNull(readText(formData, 'notes')),
      })

      if (error) throw new Error(error.message)

      revalidatePath('/facturation/fournisseurs')
      redirect(`/facturation/fournisseurs/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Modifier l'en-tête — tant que la facture est en saisie                     */
/* -------------------------------------------------------------------------- */

export async function updateSupplierInvoiceAction(
  prevState: SupplierInvoiceFormState,
  formData: FormData
): Promise<SupplierInvoiceFormState> {
  return guarded(
    'facture fournisseur:modification',
    async () => {
      await requirePermission(PERMISSIONS.SUPPLIER_INVOICES_UPDATE)

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

      const { error } = await supabase.rpc('update_supplier_invoice', {
        p_invoice_id: invoiceId,
        p_invoice_date: parsed.data.invoiceDate,
        p_due_date: dueDate,
        p_external_ref: orNull(readText(formData, 'externalRef')),
        p_notes: orNull(readText(formData, 'notes')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/fournisseurs/${invoiceId}`)
      revalidatePath('/facturation/fournisseurs')

      return { success: 'La facture a été modifiée.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Lignes — la seule source du montant brut (Règles finance §8)               */
/* -------------------------------------------------------------------------- */

export async function addSupplierInvoiceLineAction(
  prevState: SupplierInvoiceFormState,
  formData: FormData
): Promise<SupplierInvoiceFormState> {
  return guarded(
    'facture fournisseur:ligne',
    async () => {
      /*
       * `update` OU `create` : ajouter une ligne appartient à la SAISIE de la
       * facture, que l'un ou l'autre porte selon qu'on la crée ou qu'on la
       * complète. La fonction serveur applique la même règle.
       */
      await requireSession()
      const maySave = await canAny([
        PERMISSIONS.SUPPLIER_INVOICES_UPDATE,
        PERMISSIONS.SUPPLIER_INVOICES_CREATE,
      ])
      if (!maySave) return { error: 'Droit insuffisant pour cette opération.' }

      const invoiceId = readText(formData, 'invoiceId')
      if (!invoiceId) return { error: 'Facture introuvable.' }

      const parsed = z
        .object({
          label: z.string().trim().min(2, 'Désignez cette ligne.').max(200, 'Désignation trop longue.'),
          amount: amountSchema,
        })
        .safeParse({
          label: readText(formData, 'label'),
          amount: readText(formData, 'amount').replace(/\s/g, ''),
        })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const amount = toAmount(parsed.data.amount)
      if (amount === null) {
        return { fieldErrors: { amount: 'Indiquez un montant entier positif, en KMF.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('add_supplier_invoice_line', {
        p_invoice_id: invoiceId,
        p_label: parsed.data.label,
        p_amount: amount,
        p_vehicle_id: orNull(readText(formData, 'vehicleId')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/fournisseurs/${invoiceId}`)
      revalidatePath('/facturation/fournisseurs')

      return { success: 'La ligne a été ajoutée.' }
    },
    ERROR_PATTERNS
  )
}

export async function archiveSupplierInvoiceLineAction(
  prevState: SupplierInvoiceFormState,
  formData: FormData
): Promise<SupplierInvoiceFormState> {
  return guarded(
    'facture fournisseur:retrait de ligne',
    async () => {
      await requirePermission(PERMISSIONS.SUPPLIER_INVOICES_UPDATE)

      const lineId = readText(formData, 'lineId')
      const invoiceId = readText(formData, 'invoiceId')
      if (!lineId) return { error: 'Ligne introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('archive_supplier_invoice_line', {
        p_line_id: lineId,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/fournisseurs/${invoiceId}`)
      revalidatePath('/facturation/fournisseurs')

      return { success: 'La ligne a été retirée de la facture. Elle reste conservée.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Soumettre au contrôle — dernier geste de la saisie                        */
/* -------------------------------------------------------------------------- */

export async function submitSupplierInvoiceAction(
  prevState: SupplierInvoiceFormState,
  formData: FormData
): Promise<SupplierInvoiceFormState> {
  return guarded(
    'facture fournisseur:soumission',
    async () => {
      await requirePermission(PERMISSIONS.SUPPLIER_INVOICES_UPDATE)

      const invoiceId = readText(formData, 'invoiceId')
      if (!invoiceId) return { error: 'Facture introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('submit_supplier_invoice', {
        p_invoice_id: invoiceId,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/fournisseurs/${invoiceId}`)
      revalidatePath('/facturation/fournisseurs')

      return { success: 'La facture attend désormais un contrôle.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Valider — la dette est reconnue, elle n'est pas payée                      */
/* -------------------------------------------------------------------------- */

export async function validateSupplierInvoiceAction(
  prevState: SupplierInvoiceFormState,
  formData: FormData
): Promise<SupplierInvoiceFormState> {
  return guarded(
    'facture fournisseur:validation',
    async () => {
      await requirePermission(PERMISSIONS.SUPPLIER_INVOICES_VALIDATE)

      const invoiceId = readText(formData, 'invoiceId')
      if (!invoiceId) return { error: 'Facture introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('validate_supplier_invoice', {
        p_invoice_id: invoiceId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/fournisseurs/${invoiceId}`)
      revalidatePath('/facturation/fournisseurs')

      return {
        success:
          'La facture est validée : la dette est reconnue et la facture peut recevoir des imputations. Aucun paiement n’a été enregistré.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annuler                                                                    */
/* -------------------------------------------------------------------------- */

export async function cancelSupplierInvoiceAction(
  prevState: SupplierInvoiceFormState,
  formData: FormData
): Promise<SupplierInvoiceFormState> {
  return guarded(
    'facture fournisseur:annulation',
    async () => {
      await requirePermission(PERMISSIONS.SUPPLIER_INVOICES_CANCEL)

      const invoiceId = readText(formData, 'invoiceId')
      if (!invoiceId) return { error: 'Facture introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_supplier_invoice', {
        p_invoice_id: invoiceId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/fournisseurs/${invoiceId}`)
      revalidatePath('/facturation/fournisseurs')

      return { success: 'La facture est annulée. L’historique est conservé.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Rattacher / détacher une imputation — DEC-013                              */
/* -------------------------------------------------------------------------- */

/**
 * Le seul acte du système qui réduise un montant dû.
 *
 * Il porte `billing.imputations.update` : c'est l'imputation qui change d'état,
 * la facture n'étant modifiée dans aucune de ses colonnes. Le serveur exige en
 * plus la lecture de la facture et des imputations — sans quoi le plafond de
 * Workflow 06 §20 porterait sur des sommes muettes.
 */
export async function attachImputationAction(
  prevState: SupplierInvoiceFormState,
  formData: FormData
): Promise<SupplierInvoiceFormState> {
  return guarded(
    'imputation:rattachement',
    async () => {
      await requirePermission(PERMISSIONS.IMPUTATIONS_UPDATE)

      const imputationId = readText(formData, 'imputationId')
      const invoiceId = readText(formData, 'invoiceId')
      if (!imputationId) return { error: 'Imputation introuvable.' }
      if (!invoiceId) {
        return { fieldErrors: { invoiceId: 'Choisissez la facture fournisseur concernée.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('attach_imputation_to_invoice', {
        p_imputation_id: imputationId,
        p_invoice_id: invoiceId,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/fournisseurs/${invoiceId}`)
      revalidatePath(`/facturation/imputations/${imputationId}`)
      revalidatePath('/facturation/imputations')
      revalidatePath('/facturation/fournisseurs')

      return {
        success:
          'L’imputation est rattachée à la facture : le net à payer diminue d’autant. Ce n’est pas un paiement.',
      }
    },
    ERROR_PATTERNS
  )
}

/** Procédure contrôlée de correction (§39), à défaut de contrepassation (§41). */
export async function detachImputationAction(
  prevState: SupplierInvoiceFormState,
  formData: FormData
): Promise<SupplierInvoiceFormState> {
  return guarded(
    'imputation:détachement',
    async () => {
      await requirePermission(PERMISSIONS.IMPUTATIONS_UPDATE)

      const imputationId = readText(formData, 'imputationId')
      const invoiceId = readText(formData, 'invoiceId')
      if (!imputationId) return { error: 'Imputation introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('detach_imputation_from_invoice', {
        p_imputation_id: imputationId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/fournisseurs/${invoiceId}`)
      revalidatePath(`/facturation/imputations/${imputationId}`)
      revalidatePath('/facturation/imputations')
      revalidatePath('/facturation/fournisseurs')

      return {
        success:
          'L’imputation est détachée : elle redevient en attente de facture, et le net à payer remonte d’autant.',
      }
    },
    ERROR_PATTERNS
  )
}
