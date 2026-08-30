'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'
import {
  ACCEPTED_DOCUMENT_TYPES,
  MAX_DOCUMENT_SIZE,
} from '@/features/maintenance/costs-constants'

/**
 * Actions d'imputation fournisseur — Étape 2.4, LOT 4.
 *
 * QUATRE COUCHES, PAS UNE (audit 041–042).
 *
 * Ces gardes serveur sont la PREMIÈRE. Elles ne sont ni la seule ni la
 * dernière : les fonctions atomiques revérifient la capacité, les déclencheurs
 * imposent les transitions et figent ce qui doit l'être, et RLS refuse
 * l'écriture. Un appel direct à PostgREST ne rencontre aucune ligne de ce
 * fichier — d'où les trois autres.
 *
 * CINQ CAPACITÉS, CINQ ACTES (Règles permissions §36).
 *
 *   `billing.imputations.create`    préparer une imputation
 *   `billing.imputations.update`    la modifier, la soumettre à validation
 *   `billing.imputations.validate`  la valider
 *   `billing.imputations.cancel`    l'annuler
 *   `billing.imputations.view`      la consulter
 *
 * « Un utilisateur ne doit pas automatiquement disposer de toutes ces
 * permissions. » Aucune n'est impliquée par une autre.
 *
 * CE QUE CES ACTIONS NE FONT JAMAIS
 *
 * Aucune facture fournisseur, aucun paiement, aucun solde, aucun net à payer,
 * aucune clôture financière. Valider une imputation ne réduit RIEN : DEC-013
 * réserve cet effet au statut « Imputée », qui suppose une facture — Étape 2.5.
 */

export type ImputationFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /aucun montant imputable n'a été arrêté/i,
    'Aucun montant imputable n’a été arrêté pour cette maintenance. Il doit l’être avant toute imputation.',
  ],
  [
    /le montant imputable de cette maintenance est nul/i,
    'Le montant imputable de cette maintenance est nul : la dépense reste à la charge d’ADIKOM.',
  ],
  [
    /dépasserait le montant imputable/i,
    'Ce montant dépasserait le montant imputable restant sur cette maintenance.',
  ],
  [
    /n'a jamais mis ce véhicule à disposition/i,
    'Ce fournisseur n’a jamais mis ce véhicule à disposition : l’imputation serait incohérente.',
  ],
  [
    /n'est mis à disposition par aucun fournisseur/i,
    'Ce véhicule n’est mis à disposition par aucun fournisseur : aucune imputation n’est possible.',
  ],
  [
    /une maintenance annulée ne donne lieu à aucune imputation/i,
    'Cette maintenance est annulée : elle ne donne lieu à aucune imputation.',
  ],
  [
    /ne se modifie plus/i,
    'Cette imputation est validée, imputée ou annulée : elle ne se modifie plus.',
  ],
  [
    /seule une imputation en brouillon peut être soumise/i,
    'Seule une imputation en brouillon peut être soumise à validation.',
  ],
  [
    /seule une imputation soumise à validation peut être validée/i,
    'Cette imputation doit d’abord être soumise à validation.',
  ],
  [
    /ne peut plus être annulée/i,
    'Cette imputation ne peut plus être annulée.',
  ],
  [
    /relève de l'Étape 2\.5/i,
    'Le rattachement à une facture fournisseur relève d’une étape ultérieure : aucune facture fournisseur n’existe encore.',
  ],
  [
    /justificatifs d'une imputation validée/i,
    'Les justificatifs d’une imputation validée, imputée ou annulée sont figés.',
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

const justificationSchema = z
  .string()
  .trim()
  .min(10, 'La justification doit expliquer pourquoi ce montant est déduit (10 caractères au moins).')
  .max(2000, 'Justification trop longue.')

/* -------------------------------------------------------------------------- */
/*  Préparer une imputation — Workflow 06 §11, §14                             */
/* -------------------------------------------------------------------------- */

const createSchema = z.object({
  amount: amountSchema,
  justification: justificationSchema,
  supplierId: z.string().uuid('Choisissez le fournisseur concerné.'),
})

export async function createImputationAction(
  prevState: ImputationFormState,
  formData: FormData
): Promise<ImputationFormState> {
  return guarded(
    'imputation:création',
    async () => {
      await requirePermission(PERMISSIONS.IMPUTATIONS_CREATE)

      const maintenanceId = readText(formData, 'maintenanceId')
      if (!maintenanceId) return { error: 'Maintenance introuvable.' }

      const parsed = createSchema.safeParse({
        amount: readText(formData, 'amount').replace(/\s/g, ''),
        justification: readText(formData, 'justification'),
        supplierId: readText(formData, 'supplierId'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const amount = toAmount(parsed.data.amount)
      if (amount === null) {
        return { fieldErrors: { amount: 'Indiquez un montant entier positif, en KMF.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('create_imputation', {
        p_maintenance_id: maintenanceId,
        p_supplier_id: parsed.data.supplierId,
        p_amount: amount,
        p_justification: parsed.data.justification,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/location/maintenance/${maintenanceId}`)
      revalidatePath('/facturation/imputations')

      return {
        success:
          'L’imputation a été préparée. Elle ne réduit aucun montant dû tant qu’elle n’est pas rattachée à une facture fournisseur.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Modifier une imputation en préparation — §38                               */
/* -------------------------------------------------------------------------- */

export async function updateImputationAction(
  prevState: ImputationFormState,
  formData: FormData
): Promise<ImputationFormState> {
  return guarded(
    'imputation:modification',
    async () => {
      await requirePermission(PERMISSIONS.IMPUTATIONS_UPDATE)

      const imputationId = readText(formData, 'imputationId')
      if (!imputationId) return { error: 'Imputation introuvable.' }

      const parsed = z
        .object({ amount: amountSchema, justification: justificationSchema })
        .safeParse({
          amount: readText(formData, 'amount').replace(/\s/g, ''),
          justification: readText(formData, 'justification'),
        })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const amount = toAmount(parsed.data.amount)
      if (amount === null) {
        return { fieldErrors: { amount: 'Indiquez un montant entier positif, en KMF.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('update_imputation', {
        p_imputation_id: imputationId,
        p_amount: amount,
        p_justification: parsed.data.justification,
        p_supplier_id: orNull(readText(formData, 'supplierId')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/imputations/${imputationId}`)
      revalidatePath('/facturation/imputations')

      return { success: 'L’imputation a été modifiée.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Soumettre à validation — §15                                               */
/* -------------------------------------------------------------------------- */

/**
 * Soumettre n'est pas valider.
 *
 * C'est le dernier geste de la PRÉPARATION, que §38 range sous la
 * modification. Aucune capacité nouvelle n'est créée pour lui : le catalogue
 * décrit ce que le SaaS sait faire, et `billing.imputations.update` le dit
 * déjà (DEC-024, précédent DEC-025 §b).
 */
export async function submitImputationAction(
  prevState: ImputationFormState,
  formData: FormData
): Promise<ImputationFormState> {
  return guarded(
    'imputation:soumission',
    async () => {
      await requirePermission(PERMISSIONS.IMPUTATIONS_UPDATE)

      const imputationId = readText(formData, 'imputationId')
      if (!imputationId) return { error: 'Imputation introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('submit_imputation', {
        p_imputation_id: imputationId,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/imputations/${imputationId}`)
      revalidatePath('/facturation/imputations')

      return { success: 'L’imputation attend désormais une validation.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Valider — §16, et la frontière de DEC-013                                  */
/* -------------------------------------------------------------------------- */

/**
 * Valider une imputation ne réduit AUCUN montant dû.
 *
 * DEC-013 : seule « Imputée » — validée ET rattachée à une facture — produit
 * un effet financier. Une imputation validée sans facture est ce que
 * Workflow 06 §31 nomme une « imputation en attente de facture ». Le message
 * de succès le dit, plutôt que de laisser croire à une déduction.
 */
export async function validateImputationAction(
  prevState: ImputationFormState,
  formData: FormData
): Promise<ImputationFormState> {
  return guarded(
    'imputation:validation',
    async () => {
      await requirePermission(PERMISSIONS.IMPUTATIONS_VALIDATE)

      const imputationId = readText(formData, 'imputationId')
      if (!imputationId) return { error: 'Imputation introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('validate_imputation', {
        p_imputation_id: imputationId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/imputations/${imputationId}`)
      revalidatePath('/facturation/imputations')

      return {
        success:
          'L’imputation est validée. Elle reste en attente de facture fournisseur et ne réduit encore aucun montant dû.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annuler — §18, §40                                                         */
/* -------------------------------------------------------------------------- */

export async function cancelImputationAction(
  prevState: ImputationFormState,
  formData: FormData
): Promise<ImputationFormState> {
  return guarded(
    'imputation:annulation',
    async () => {
      await requirePermission(PERMISSIONS.IMPUTATIONS_CANCEL)

      const imputationId = readText(formData, 'imputationId')
      if (!imputationId) return { error: 'Imputation introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_imputation', {
        p_imputation_id: imputationId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/imputations/${imputationId}`)
      revalidatePath('/facturation/imputations')

      return {
        success:
          'L’imputation est annulée. Le montant imputable qu’elle consommait est redevenu disponible ; l’historique est conservé.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Justificatifs — §35                                                        */
/* -------------------------------------------------------------------------- */

const DOC_TYPES = ['QUOTE', 'INVOICE', 'RECEIPT', 'REPAIR_ORDER', 'REPORT', 'OTHER'] as const

/**
 * Joint un justificatif à une imputation en préparation.
 *
 * Aucun second système de fichiers : le bucket PRIVÉ `vehicle-documents`, sous
 * le préfixe `imputations/{id}/`. Le dépôt passe par le client
 * d'administration — seul autorisé sur un bucket sans policy — mais la LIGNE
 * est écrite avec la session de l'appelant, donc sous RLS.
 */
export async function addImputationDocumentAction(
  prevState: ImputationFormState,
  formData: FormData
): Promise<ImputationFormState> {
  return guarded(
    'imputation:justificatif',
    async () => {
      const actor = await requirePermission(PERMISSIONS.IMPUTATIONS_UPDATE)

      const imputationId = readText(formData, 'imputationId')
      if (!imputationId) return { error: 'Imputation introuvable.' }

      const docType = readText(formData, 'docType')
      if (!DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) {
        return { fieldErrors: { docType: 'Choisissez la nature du justificatif.' } }
      }

      const label = readText(formData, 'label').trim()
      if (!label) return { fieldErrors: { label: 'Donnez un intitulé à ce justificatif.' } }

      const file = formData.get('file')
      if (!(file instanceof File) || file.size === 0) {
        return { fieldErrors: { file: 'Joignez un fichier.' } }
      }
      if (file.size > MAX_DOCUMENT_SIZE) {
        return { fieldErrors: { file: 'Le fichier doit peser moins de 10 Mo.' } }
      }
      if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type as (typeof ACCEPTED_DOCUMENT_TYPES)[number])) {
        return { fieldErrors: { file: 'Formats acceptés : PDF, JPEG, PNG, WebP.' } }
      }

      const admin = createSupabaseAdminClient()
      const path = `imputations/${imputationId}/${crypto.randomUUID()}-${safeName(file.name)}`

      const { error: uploadError } = await admin.storage
        .from('vehicle-documents')
        .upload(path, file, { contentType: file.type, upsert: false })

      if (uploadError) {
        console.error(`[imputation:justificatif] dépôt : ${uploadError.message}`)
        return { error: 'Le fichier n’a pas pu être déposé.' }
      }

      const supabase = await createSupabaseServerClient()

      const { error: rowError } = await supabase.from('imputation_documents').insert({
        imputation_id: imputationId,
        doc_type: docType,
        label,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        created_by: actor.id,
      })

      if (rowError) {
        // Un fichier déposé sans sa ligne serait orphelin : il est retiré.
        await admin.storage.from('vehicle-documents').remove([path])
        throw new Error(rowError.message)
      }

      revalidatePath(`/facturation/imputations/${imputationId}`)

      return { success: 'Le justificatif a été enregistré.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Retire un justificatif de la vue, sans l'effacer.
 *
 * Une pièce déposée par erreur s'archive : la supprimer ferait disparaître une
 * trace que le journal d'audit référence (CLAUDE.md §22).
 */
export async function archiveImputationDocumentAction(
  prevState: ImputationFormState,
  formData: FormData
): Promise<ImputationFormState> {
  return guarded(
    'imputation:archivage justificatif',
    async () => {
      await requirePermission(PERMISSIONS.IMPUTATIONS_UPDATE)

      const documentId = readText(formData, 'documentId')
      const imputationId = readText(formData, 'imputationId')
      if (!documentId) return { error: 'Justificatif introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('imputation_documents')
        .update({ is_archived: true })
        .eq('id', documentId)

      if (error) throw new Error(error.message)

      revalidatePath(`/facturation/imputations/${imputationId}`)

      return { success: 'Le justificatif a été retiré de la fiche.' }
    },
    ERROR_PATTERNS
  )
}

/** Nom de fichier réduit à ce qu'un chemin de stockage accepte sans ambiguïté. */
function safeName(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)

  return cleaned || 'justificatif'
}
