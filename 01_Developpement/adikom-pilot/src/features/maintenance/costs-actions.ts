'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'
import { ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE } from './costs-constants'

/**
 * Actions financières de la maintenance — Étape 2.4, LOT 3.
 *
 * QUATRE COUCHES, PAS UNE (audit 041–042).
 *
 * Ces gardes serveur sont la PREMIÈRE. Elles ne sont ni la seule ni la
 * dernière : les fonctions atomiques revérifient la capacité, les
 * déclencheurs figent ce qui doit l'être, et RLS refuse l'écriture. Un appel
 * direct à PostgREST ne rencontre aucune des lignes de ce fichier — d'où les
 * trois autres.
 *
 * DEUX CAPACITÉS, DEUX ACTES (arbitrage L2).
 *
 *   `rental.maintenance.cost.update`  saisir et modifier un montant, un devis
 *   `rental.maintenance.validate`     ACCEPTER ou REFUSER un devis
 *
 * La seconde n'est pas impliquée par la première, et réciproquement.
 *
 * CE QUE CES ACTIONS NE FONT JAMAIS
 *
 * Aucune imputation, aucune facture, aucun paiement, aucun solde. Aucune
 * occupation, aucun statut de véhicule, aucun statut de maintenance. Saisir un
 * coût ne déclenche rien : c'est un enregistrement, pas une décision.
 */

export type CostFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /données financières d'une maintenance terminée ou annulée sont verrouillées/i,
    'Cette maintenance est terminée ou annulée : ses données financières sont verrouillées.',
  ],
  [
    /aucun devis ne s'ajoute à une maintenance terminée/i,
    'Aucun devis ne peut être ajouté à une maintenance terminée ou annulée.',
  ],
  [
    /un devis accepté ou refusé ne se modifie plus/i,
    'Ce devis a été décidé : il ne se modifie plus.',
  ],
  [/ce devis a déjà été décidé/i, 'Ce devis a déjà été accepté ou refusé.'],
  [
    /une décision ne se reprend pas/i,
    'La décision prise sur ce devis est définitive.',
  ],
  [
    /maintenance_costs_imputable_within/i,
    'Le montant imputable ne peut pas dépasser le coût réel.',
  ],
  [
    /Droit insuffisant pour cette opération/i,
    'Vous ne disposez pas de la capacité exacte requise pour cette opération.',
  ],
]

const amountSchema = z
  .string()
  .trim()
  .regex(/^\d*$/, 'Indiquez un montant entier en KMF, sans espace ni décimale.')

/** Montant saisi → entier KMF (DEC-010). Vide = non renseigné, jamais zéro. */
function toAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

/* -------------------------------------------------------------------------- */
/*  Montants de la maintenance                                                 */
/* -------------------------------------------------------------------------- */

const costsSchema = z.object({
  estimatedCost: amountSchema,
  actualCost: amountSchema,
  imputableAmount: amountSchema,
})

export async function recordCostsAction(
  prevState: CostFormState,
  formData: FormData
): Promise<CostFormState> {
  return guarded(
    'maintenance:coûts',
    async () => {
      await requirePermission(PERMISSIONS.MAINTENANCE_COST_UPDATE)

      const maintenanceId = readText(formData, 'maintenanceId')
      if (!maintenanceId) return { error: 'Maintenance introuvable.' }

      const raw = {
        estimatedCost: readText(formData, 'estimatedCost').replace(/\s/g, ''),
        actualCost: readText(formData, 'actualCost').replace(/\s/g, ''),
        imputableAmount: readText(formData, 'imputableAmount').replace(/\s/g, ''),
      }

      const parsed = costsSchema.safeParse(raw)
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const estimated = toAmount(raw.estimatedCost)
      const actual = toAmount(raw.actualCost)
      const imputable = toAmount(raw.imputableAmount)

      /*
       * Le seul rapport que la documentation pose entre ces montants
       * (Workflow 06 §7 : « non imputable = total − imputable »). Aucun autre
       * n'est calculé, et aucune valeur n'est déduite d'une autre.
       */
      if (imputable !== null && actual !== null && imputable > actual) {
        return {
          fieldErrors: {
            imputableAmount: 'Le montant imputable ne peut pas dépasser le coût réel.',
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('record_maintenance_costs', {
        p_maintenance_id: maintenanceId,
        p_estimated_cost: estimated,
        p_actual_cost: actual,
        p_imputable_amount: imputable,
        p_notes: orNull(readText(formData, 'notes')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/location/maintenance/${maintenanceId}`)

      return { success: 'Les montants ont été enregistrés.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Lignes de coût                                                             */
/* -------------------------------------------------------------------------- */

const KINDS = ['PARTS', 'LABOUR', 'OTHER'] as const

const lineSchema = z.object({
  kind: z.enum(KINDS, { message: 'Choisissez la nature de la ligne.' }),
  label: z.string().trim().min(1, 'Décrivez la ligne.').max(200, 'Libellé trop long.'),
  amount: amountSchema.refine((value) => value !== '', 'Le montant est obligatoire.'),
})

export async function addCostLineAction(
  prevState: CostFormState,
  formData: FormData
): Promise<CostFormState> {
  return guarded(
    'maintenance:ligne de coût',
    async () => {
      await requirePermission(PERMISSIONS.MAINTENANCE_COST_UPDATE)

      const maintenanceId = readText(formData, 'maintenanceId')
      if (!maintenanceId) return { error: 'Maintenance introuvable.' }

      const parsed = lineSchema.safeParse({
        kind: readText(formData, 'kind'),
        label: readText(formData, 'label'),
        amount: readText(formData, 'amount').replace(/\s/g, ''),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const amount = toAmount(parsed.data.amount)
      if (amount === null) {
        return { fieldErrors: { amount: 'Indiquez un montant entier en KMF.' } }
      }

      const quantity = toAmount(readText(formData, 'quantity').replace(/\s/g, ''))
      const unitAmount = toAmount(readText(formData, 'unitAmount').replace(/\s/g, ''))

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.from('maintenance_cost_lines').insert({
        maintenance_id: maintenanceId,
        kind: parsed.data.kind,
        label: parsed.data.label,
        // §31 cite quantité et prix ; aucun des deux n'est requis, et le
        // montant de la ligne n'en est pas déduit.
        quantity: quantity && quantity > 0 ? quantity : null,
        unit_amount: unitAmount,
        amount,
        notes: orNull(readText(formData, 'notes')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/location/maintenance/${maintenanceId}`)

      return { success: 'La ligne de coût a été enregistrée.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Devis                                                                      */
/* -------------------------------------------------------------------------- */

const quoteSchema = z.object({
  amount: amountSchema.refine((value) => value !== '', 'Le montant du devis est obligatoire.'),
  providerSupplierId: z.string().uuid().optional().or(z.literal('')),
  description: z.string().trim().max(1000, 'Description trop longue.').optional(),
})

export async function addQuoteAction(
  prevState: CostFormState,
  formData: FormData
): Promise<CostFormState> {
  return guarded(
    'maintenance:devis',
    async () => {
      await requirePermission(PERMISSIONS.MAINTENANCE_COST_UPDATE)

      const maintenanceId = readText(formData, 'maintenanceId')
      if (!maintenanceId) return { error: 'Maintenance introuvable.' }

      const parsed = quoteSchema.safeParse({
        amount: readText(formData, 'amount').replace(/\s/g, ''),
        providerSupplierId: readText(formData, 'providerSupplierId'),
        description: readText(formData, 'description'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const amount = toAmount(parsed.data.amount)
      if (amount === null) {
        return { fieldErrors: { amount: 'Indiquez un montant entier en KMF.' } }
      }

      const quotedOn = readText(formData, 'quotedOn')

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('add_maintenance_quote', {
        p_maintenance_id: maintenanceId,
        p_amount: amount,
        p_provider_supplier_id: orNull(parsed.data.providerSupplierId),
        p_quoted_on: quotedOn || null,
        p_description: orNull(parsed.data.description),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/location/maintenance/${maintenanceId}`)

      return { success: 'Le devis a été enregistré.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Accepter ou refuser un devis — Workflow 05 §27.
 *
 * `rental.maintenance.validate`, et non `cost.update` : décider d'un devis
 * ENGAGE l'intervention, saisir son montant ne fait que l'enregistrer
 * (arbitrage L2).
 *
 * ACCEPTER NE RECOPIE AUCUN MONTANT dans les coûts : rien dans la
 * documentation ne dit qu'un devis accepté devient le coût estimé ou réel, et
 * le déduire serait inventer une règle (DEC-008).
 */
export async function decideQuoteAction(
  prevState: CostFormState,
  formData: FormData
): Promise<CostFormState> {
  return guarded(
    'maintenance:décision de devis',
    async () => {
      await requirePermission(PERMISSIONS.MAINTENANCE_VALIDATE)

      const quoteId = readText(formData, 'quoteId')
      const maintenanceId = readText(formData, 'maintenanceId')
      if (!quoteId) return { error: 'Devis introuvable.' }

      const decision = readText(formData, 'decision')
      if (decision !== 'accept' && decision !== 'refuse') {
        return { fieldErrors: { decision: 'Acceptez ou refusez le devis.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('decide_maintenance_quote', {
        p_quote_id: quoteId,
        p_accept: decision === 'accept',
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/location/maintenance/${maintenanceId}`)

      return {
        success:
          decision === 'accept'
            ? 'Le devis a été accepté. Aucun montant n’a été recopié dans les coûts.'
            : 'Le devis a été refusé.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Justificatifs                                                              */
/* -------------------------------------------------------------------------- */

const DOC_TYPES = ['QUOTE', 'INVOICE', 'RECEIPT', 'REPAIR_ORDER', 'REPORT', 'OTHER'] as const

/**
 * Dépose un justificatif financier.
 *
 * Aucun second système de fichiers (arbitrage L3) : le bucket PRIVÉ
 * `vehicle-documents`, sous un préfixe dédié. Le dépôt passe par le client
 * d'administration — seul autorisé sur un bucket sans policy — mais la LIGNE
 * est écrite avec la session de l'appelant, donc sous RLS.
 */
export async function addDocumentAction(
  prevState: CostFormState,
  formData: FormData
): Promise<CostFormState> {
  return guarded(
    'maintenance:justificatif',
    async () => {
      const actor = await requirePermission(PERMISSIONS.MAINTENANCE_COST_UPDATE)

      const maintenanceId = readText(formData, 'maintenanceId')
      if (!maintenanceId) return { error: 'Maintenance introuvable.' }

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
      const path = `maintenances/${maintenanceId}/${crypto.randomUUID()}-${safeName(file.name)}`

      const { error: uploadError } = await admin.storage
        .from('vehicle-documents')
        .upload(path, file, { contentType: file.type, upsert: false })

      if (uploadError) {
        console.error(`[maintenance:justificatif] dépôt : ${uploadError.message}`)
        return { error: 'Le fichier n’a pas pu être déposé.' }
      }

      const supabase = await createSupabaseServerClient()

      const { error: rowError } = await supabase.from('maintenance_documents').insert({
        maintenance_id: maintenanceId,
        quote_id: orNull(readText(formData, 'quoteId')),
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

      revalidatePath(`/location/maintenance/${maintenanceId}`)

      return { success: 'Le justificatif a été enregistré.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Retire un justificatif de la vue, sans l'effacer.
 *
 * Une pièce financière déposée par erreur s'archive : la supprimer ferait
 * disparaître une trace que le journal d'audit référence (CLAUDE.md §22).
 */
export async function archiveDocumentAction(
  prevState: CostFormState,
  formData: FormData
): Promise<CostFormState> {
  return guarded(
    'maintenance:archivage justificatif',
    async () => {
      await requirePermission(PERMISSIONS.MAINTENANCE_COST_UPDATE)

      const documentId = readText(formData, 'documentId')
      const maintenanceId = readText(formData, 'maintenanceId')
      if (!documentId) return { error: 'Justificatif introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('maintenance_documents')
        .update({ is_archived: true })
        .eq('id', documentId)

      if (error) throw new Error(error.message)

      revalidatePath(`/location/maintenance/${maintenanceId}`)

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
