'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'
import { ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE } from './constants'

/**
 * Actions du Parc automobile.
 *
 * Quatre gestes sensibles distincts, quatre permissions distinctes
 * (05_Regles_Metier/02_Parc_Automobile.md §71) : modifier la fiche, changer le
 * statut, changer de fournisseur, retirer du parc. L'interface les sépare parce
 * que la base et les permissions les séparent, pas l'inverse.
 *
 * Aucun véhicule n'est jamais supprimé : il est retiré du parc et conservé
 * (§45, §47).
 */

export type FleetFormState = FormState & { createdId?: string }

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /vehicles_plate_unique_idx/i,
    'Cette immatriculation est déjà enregistrée sur un autre véhicule.',
  ],
  [
    /vehicles_origin_supplier_coherent/i,
    'Un véhicule fourni doit désigner son fournisseur, et un véhicule ADIKOM ne doit pas en avoir.',
  ],
  [
    /vehicles_exit_coherent/i,
    'Le retrait du parc exige à la fois le statut « Retiré » et une date de sortie.',
  ],
  [/vehicle_categories_label_unique_idx|vehicle_categories_code_key/i, 'Cette catégorie existe déjà.'],
  [
    /vehicle_occupations_no_overlap/i,
    'Cette période chevauche une autre indisponibilité de ce véhicule.',
  ],
]

/* -------------------------------------------------------------------------- */
/*  Catégories                                                                 */
/* -------------------------------------------------------------------------- */

const categorySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Le code doit contenir au moins 2 caractères.')
    .max(32)
    .regex(/^[A-Z0-9_-]+$/, 'Lettres majuscules, chiffres, tiret et souligné uniquement.'),
  label: z.string().trim().min(1, 'Le libellé est obligatoire.').max(80),
  description: z.string().trim().max(500).optional(),
  displayOrder: z.coerce.number().int().min(0).max(999).optional(),
})

export async function createCategoryAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded(
    'parc:catégorie',
    async () => {
      const actor = await requirePermission(PERMISSIONS.CATEGORIES_CREATE)

      const parsed = categorySchema.safeParse({
        code: readText(formData, 'code'),
        label: readText(formData, 'label'),
        description: readText(formData, 'description'),
        displayOrder: readText(formData, 'displayOrder') || 0,
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.from('vehicle_categories').insert({
        code: parsed.data.code,
        label: parsed.data.label,
        description: orNull(parsed.data.description),
        display_order: parsed.data.displayOrder ?? 0,
        created_by: actor.id,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/parc/categories')
      return { success: 'La catégorie a été créée.' }
    },
    ERROR_PATTERNS
  )
}

export async function toggleCategoryAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded(
    'parc:catégorie',
    async () => {
      await requirePermission(PERMISSIONS.CATEGORIES_ARCHIVE)

      const categoryId = readText(formData, 'categoryId')
      const activate = readText(formData, 'activate') === '1'
      if (!categoryId) return { error: 'Catégorie introuvable.' }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase
        .from('vehicle_categories')
        .update({ is_active: activate })
        .eq('id', categoryId)

      if (error) throw new Error(error.message)

      revalidatePath('/location/parc/categories')
      return {
        success: activate ? 'La catégorie a été réactivée.' : 'La catégorie a été archivée.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Véhicules                                                                  */
/* -------------------------------------------------------------------------- */

const vehicleSchema = z.object({
  brand: z.string().trim().min(1, 'La marque est obligatoire.').max(80),
  model: z.string().trim().min(1, 'Le modèle est obligatoire.').max(80),
  categoryId: z.string().trim().min(1, 'La catégorie est obligatoire.'),
  plate: z.string().trim().max(32).optional(),
  modelYear: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .refine((value) => value === null || (Number.isInteger(value) && value >= 1950 && value <= 2100), {
      message: 'Année invalide.',
    }),
  color: z.string().trim().max(40).optional(),
  fuel: z.string().trim().optional(),
  transmission: z.string().trim().optional(),
  seats: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .refine((value) => value === null || (Number.isInteger(value) && value > 0 && value <= 100), {
      message: 'Nombre de places invalide.',
    }),
  doors: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .refine((value) => value === null || (Number.isInteger(value) && value > 0 && value <= 10), {
      message: 'Nombre de portes invalide.',
    }),
  mileage: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value.replace(/\s/g, '')) : 0))
    .refine((value) => Number.isInteger(value) && value >= 0, {
      message: 'Le kilométrage doit être un entier positif.',
    }),
  origin: z.enum(['OWNED', 'SUPPLIED', 'PARTNERSHIP', 'OTHER']),
  supplierId: z.string().trim().optional(),
  entryDate: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
})

function toVehicleRow(input: z.infer<typeof vehicleSchema>) {
  const supplied = input.origin === 'SUPPLIED'

  return {
    brand: input.brand,
    model: input.model,
    category_id: input.categoryId,
    plate: orNull(input.plate),
    model_year: input.modelYear,
    color: orNull(input.color),
    fuel: orNull(input.fuel),
    transmission: orNull(input.transmission),
    seats: input.seats,
    doors: input.doors,
    mileage: input.mileage,
    origin: input.origin,
    // La cohérence est aussi garantie en base : un véhicule ADIKOM ne porte
    // jamais de fournisseur, même si le formulaire en propose un.
    current_supplier_id: supplied ? orNull(input.supplierId) : null,
    entry_date: orNull(input.entryDate),
    notes: orNull(input.notes),
  }
}

function readVehicle(formData: FormData) {
  return {
    brand: readText(formData, 'brand'),
    model: readText(formData, 'model'),
    categoryId: readText(formData, 'categoryId'),
    plate: readText(formData, 'plate'),
    modelYear: readText(formData, 'modelYear'),
    color: readText(formData, 'color'),
    fuel: readText(formData, 'fuel'),
    transmission: readText(formData, 'transmission'),
    seats: readText(formData, 'seats'),
    doors: readText(formData, 'doors'),
    mileage: readText(formData, 'mileage'),
    origin: readText(formData, 'origin'),
    supplierId: readText(formData, 'supplierId'),
    entryDate: readText(formData, 'entryDate'),
    notes: readText(formData, 'notes'),
  }
}

export async function createVehicleAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded('parc:création', () => createVehicleInner(formData), ERROR_PATTERNS)
}

async function createVehicleInner(formData: FormData): Promise<FleetFormState> {
  const actor = await requirePermission(PERMISSIONS.FLEET_CREATE)

  const parsed = vehicleSchema.safeParse(readVehicle(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const input = parsed.data

  if (input.origin === 'SUPPLIED' && !orNull(input.supplierId)) {
    return { fieldErrors: { supplierId: 'Choisissez le fournisseur du véhicule.' } }
  }

  const supabase = await createSupabaseServerClient()

  const { data: vehicleNo, error: numberError } = await supabase.rpc('next_number', {
    p_entity_key: 'vehicle',
  })

  if (numberError || !vehicleNo) {
    return { error: 'L’identifiant véhicule n’a pas pu être attribué. Réessayez.' }
  }

  const row = toVehicleRow(input)

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      ...row,
      vehicle_no: vehicleNo,
      initial_mileage: row.mileage,
      created_by: actor.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  // Le rattachement initial ouvre l'historique : sans lui, on ne saurait pas à
  // partir de quelle date ce fournisseur fournissait ce véhicule (§60).
  if (row.current_supplier_id) {
    const { error: historyError } = await supabase.from('vehicle_supplier_history').insert({
      vehicle_id: data.id,
      supplier_id: row.current_supplier_id,
      started_on: row.entry_date ?? new Date().toISOString().slice(0, 10),
      reason: 'Mise à disposition initiale',
      created_by: actor.id,
    })

    if (historyError) throw new Error(historyError.message)
  }

  revalidatePath('/location/parc')
  redirect(`/location/parc/${data.id}?cree=1`)
}

export async function updateVehicleAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded('parc:modification', () => updateVehicleInner(formData), ERROR_PATTERNS)
}

async function updateVehicleInner(formData: FormData): Promise<FleetFormState> {
  await requirePermission(PERMISSIONS.FLEET_UPDATE)

  const vehicleId = readText(formData, 'vehicleId')
  if (!vehicleId) return { error: 'Véhicule introuvable.' }

  const parsed = vehicleSchema.safeParse(readVehicle(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const input = parsed.data
  const supabase = await createSupabaseServerClient()

  const { data: current, error: readError } = await supabase
    .from('vehicles')
    .select('mileage, current_supplier_id, origin')
    .eq('id', vehicleId)
    .maybeSingle()

  if (readError) throw new Error(readError.message)
  if (!current) return { error: 'Véhicule introuvable.' }

  /*
   * Cohérence du kilométrage (§26). Le document demande de « signaler
   * l'anomalie ou demander une justification », pas d'interdire : un compteur
   * remplacé ou une erreur de saisie antérieure sont des cas réels. La saisie
   * est donc acceptée, mais seulement accompagnée d'un motif, qui rejoint le
   * journal d'audit.
   */
  const mileageReason = orNull(readText(formData, 'mileageReason'))
  if (input.mileage < current.mileage && !mileageReason) {
    return {
      fieldErrors: {
        mileage: `Le kilométrage enregistré est de ${current.mileage} km. Un relevé inférieur doit être justifié.`,
      },
    }
  }

  const row = toVehicleRow(input)

  // Le rattachement fournisseur et l'origine sont volontairement exclus : ils
  // relèvent d'un geste dédié et historisé. Les modifier ici les rendrait
  // invisibles dans l'historique des rattachements (§60).
  const { current_supplier_id, origin, ...editable } = row
  void current_supplier_id
  void origin

  const { error } = await supabase.from('vehicles').update(editable).eq('id', vehicleId)

  if (error) throw new Error(error.message)

  if (mileageReason) {
    await supabase.rpc('log_audit', {
      p_action: 'UPDATE',
      p_entity_type: 'vehicles',
      p_entity_id: vehicleId,
      p_module_code: 'rental',
      p_reason: `Correction de kilométrage : ${mileageReason}`,
    })
  }

  revalidatePath('/location/parc')
  revalidatePath(`/location/parc/${vehicleId}`)
  redirect(`/location/parc/${vehicleId}?enregistre=1`)
}

/* -------------------------------------------------------------------------- */
/*  Statut et retrait du parc                                                  */
/* -------------------------------------------------------------------------- */

const OPERATIONAL = ['AVAILABLE', 'MAINTENANCE', 'IMMOBILIZED', 'UNAVAILABLE'] as const

export async function setVehicleStatusAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded(
    'parc:statut',
    async () => {
      const actor = await requirePermission(PERMISSIONS.FLEET_STATUS_UPDATE)

      const vehicleId = readText(formData, 'vehicleId')
      const status = readText(formData, 'status')
      const reason = orNull(readText(formData, 'reason'))

      if (!vehicleId || !OPERATIONAL.includes(status as (typeof OPERATIONAL)[number])) {
        return { error: 'Opération invalide.' }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('vehicles')
        .update({
          status,
          status_reason: reason,
          status_changed_at: new Date().toISOString(),
          status_changed_by: actor.id,
        })
        .eq('id', vehicleId)

      if (error) throw new Error(error.message)

      revalidatePath('/location/parc')
      revalidatePath(`/location/parc/${vehicleId}`)
      return {
        success:
          'Le statut a été mis à jour. La disponibilité reste déterminée par le calendrier du véhicule.',
      }
    },
    ERROR_PATTERNS
  )
}

/**
 * Retrait définitif du parc.
 *
 * §45 et §47 : le véhicule n'est pas supprimé. Il reçoit une date de sortie, un
 * motif, et passe au statut « Retiré ». Locations, maintenances, factures et
 * imputations passées restent intactes.
 */
export async function retireVehicleAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded(
    'parc:retrait',
    async () => {
      const actor = await requirePermission(PERMISSIONS.FLEET_ARCHIVE)

      const vehicleId = readText(formData, 'vehicleId')
      const exitDate = orNull(readText(formData, 'exitDate'))
      const exitReason = orNull(readText(formData, 'exitReason'))

      if (!vehicleId) return { error: 'Véhicule introuvable.' }
      if (!exitDate) return { fieldErrors: { exitDate: 'La date de sortie est obligatoire.' } }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('vehicles')
        .update({
          status: 'RETIRED',
          exit_date: exitDate,
          exit_reason: exitReason,
          status_reason: exitReason,
          status_changed_at: new Date().toISOString(),
          status_changed_by: actor.id,
        })
        .eq('id', vehicleId)

      if (error) throw new Error(error.message)

      revalidatePath('/location/parc')
      revalidatePath(`/location/parc/${vehicleId}`)
      return { success: 'Le véhicule est retiré du parc. Son historique reste consultable.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Fournisseur du véhicule                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Change le fournisseur d'un véhicule.
 *
 * L'opération est confiée à `set_vehicle_supplier` : clôture du rattachement
 * précédent, ouverture du nouveau et mise à jour de la fiche ne peuvent pas
 * être dissociées. Un échec à mi-chemin laisserait un véhicule rattaché à deux
 * fournisseurs ouverts, ce que §59 interdit.
 */
export async function changeVehicleSupplierAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded(
    'parc:fournisseur',
    async () => {
      await requirePermission(PERMISSIONS.FLEET_SUPPLIER_UPDATE)

      const vehicleId = readText(formData, 'vehicleId')
      const origin = readText(formData, 'origin')
      const supplierId = orNull(readText(formData, 'supplierId'))
      const effectiveOn = orNull(readText(formData, 'effectiveOn'))
      const reason = orNull(readText(formData, 'reason'))

      if (!vehicleId) return { error: 'Véhicule introuvable.' }
      if (origin === 'SUPPLIED' && !supplierId) {
        return { fieldErrors: { supplierId: 'Choisissez le nouveau fournisseur.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('set_vehicle_supplier', {
        p_vehicle_id: vehicleId,
        p_supplier_id: origin === 'SUPPLIED' ? supplierId : null,
        p_origin: origin,
        ...(effectiveOn ? { p_effective_on: effectiveOn } : {}),
        p_reason: reason,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/parc')
      revalidatePath(`/location/parc/${vehicleId}`)
      return { success: 'Le rattachement a été modifié et historisé.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Immobilisations                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Enregistre une période d'indisponibilité.
 *
 * L'écriture peut être refusée par la contrainte d'exclusion (DEC-012) : c'est
 * le comportement attendu, et le message le dit sans jargon. Aucune vérification
 * applicative préalable ne remplacerait cette garantie — deux saisies
 * simultanées passeraient au travers.
 */
export async function addImmobilizationAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded(
    'parc:immobilisation',
    async () => {
      const actor = await requirePermission(PERMISSIONS.FLEET_STATUS_UPDATE)

      const vehicleId = readText(formData, 'vehicleId')
      const from = readText(formData, 'from')
      const to = readText(formData, 'to')
      const reason = orNull(readText(formData, 'reason'))

      if (!vehicleId) return { error: 'Véhicule introuvable.' }
      if (!from) return { fieldErrors: { from: 'La date de début est obligatoire.' } }
      if (!to) return { fieldErrors: { to: 'La date de fin est obligatoire.' } }
      if (to <= from) {
        return { fieldErrors: { to: 'La fin doit être postérieure au début.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.from('vehicle_occupations').insert({
        vehicle_id: vehicleId,
        source: 'IMMOBILIZATION',
        period: `[${from},${to})`,
        reason,
        created_by: actor.id,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/location/parc/${vehicleId}`)
      return { success: 'La période d’indisponibilité a été enregistrée.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Libère une période.
 *
 * La ligne n'est pas supprimée : elle cesse de bloquer tout en conservant la
 * trace de ce qui avait été bloqué, et par qui (Règles location §55).
 */
export async function releaseOccupationAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded(
    'parc:disponibilité',
    async () => {
      const actor = await requirePermission(PERMISSIONS.FLEET_STATUS_UPDATE)

      const occupationId = readText(formData, 'occupationId')
      const vehicleId = readText(formData, 'vehicleId')
      if (!occupationId) return { error: 'Période introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('vehicle_occupations')
        .update({
          is_active: false,
          released_at: new Date().toISOString(),
          released_by: actor.id,
        })
        .eq('id', occupationId)
        .eq('source', 'IMMOBILIZATION')

      if (error) throw new Error(error.message)

      revalidatePath(`/location/parc/${vehicleId}`)
      return { success: 'La période a été levée.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Documents                                                                  */
/* -------------------------------------------------------------------------- */

const documentSchema = z.object({
  docType: z.enum([
    'REGISTRATION',
    'INSURANCE',
    'TECHNICAL_INSPECTION',
    'SUPPLIER_CONTRACT',
    'MAINTENANCE_RECORD',
    'ADMINISTRATIVE',
    'OTHER',
  ]),
  label: z.string().trim().min(1, 'Le libellé est obligatoire.').max(160),
  reference: z.string().trim().max(80).optional(),
  issuedOn: z.string().trim().optional(),
  expiresOn: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
})

/** Nom de fichier sûr : ni chemin, ni caractère susceptible d'être interprété. */
function safeFileName(name: string): string {
  // Liste blanche plutôt que retrait des caractères gênants : ce qui n'est pas
  // explicitement autorisé devient un tiret. Aucun chemin, aucun caractère
  // combinant, aucune surprise d'encodage.
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)

  return cleaned || 'document'
}

export async function addVehicleDocumentAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded(
    'parc:document',
    async () => {
      const actor = await requirePermission(PERMISSIONS.VEHICLE_DOCUMENTS_CREATE)

      const vehicleId = readText(formData, 'vehicleId')
      if (!vehicleId) return { error: 'Véhicule introuvable.' }

      const parsed = documentSchema.safeParse({
        docType: readText(formData, 'docType'),
        label: readText(formData, 'label'),
        reference: readText(formData, 'reference'),
        issuedOn: readText(formData, 'issuedOn'),
        expiresOn: readText(formData, 'expiresOn'),
        notes: readText(formData, 'notes'),
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const input = parsed.data
      if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) {
        return { fieldErrors: { expiresOn: 'L’échéance ne peut pas précéder la date d’émission.' } }
      }

      const file = formData.get('file')
      let storagePath: string | null = null
      let fileName: string | null = null
      let fileSize: number | null = null
      let mimeType: string | null = null

      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_DOCUMENT_SIZE) {
          return { fieldErrors: { file: 'Le fichier dépasse 10 Mo.' } }
        }

        if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type as (typeof ACCEPTED_DOCUMENT_TYPES)[number])) {
          return { fieldErrors: { file: 'Formats acceptés : PDF, JPEG, PNG, WebP.' } }
        }

        /*
         * Le dépôt passe par le client d'administration, seul autorisé sur un
         * bucket privé sans policy (migration 019). Le navigateur ne parle
         * jamais au stockage : il n'a ni droit d'écriture, ni droit de lecture.
         * La permission vient d'être vérifiée ci-dessus.
         */
        const admin = createSupabaseAdminClient()
        const path = `${vehicleId}/${crypto.randomUUID()}-${safeFileName(file.name)}`

        const { error: uploadError } = await admin.storage
          .from('vehicle-documents')
          .upload(path, file, { contentType: file.type, upsert: false })

        if (uploadError) {
          console.error(`[parc:document] dépôt : ${uploadError.message}`)
          return { error: 'Le fichier n’a pas pu être enregistré. Réessayez.' }
        }

        storagePath = path
        fileName = file.name
        fileSize = file.size
        mimeType = file.type
      }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.from('vehicle_documents').insert({
        vehicle_id: vehicleId,
        doc_type: input.docType,
        label: input.label,
        reference: orNull(input.reference),
        issued_on: orNull(input.issuedOn),
        expires_on: orNull(input.expiresOn),
        storage_path: storagePath,
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
        notes: orNull(input.notes),
        created_by: actor.id,
      })

      if (error) {
        // La fiche n'a pas pu être créée : le fichier déposé est retiré, afin de
        // ne pas laisser d'objet orphelin dans le bucket.
        if (storagePath) {
          await createSupabaseAdminClient().storage.from('vehicle-documents').remove([storagePath])
        }
        throw new Error(error.message)
      }

      revalidatePath(`/location/parc/${vehicleId}`)
      return { success: 'Le document a été ajouté.' }
    },
    ERROR_PATTERNS
  )
}

export async function archiveVehicleDocumentAction(
  prevState: FleetFormState,
  formData: FormData
): Promise<FleetFormState> {
  return guarded(
    'parc:document',
    async () => {
      await requirePermission(PERMISSIONS.VEHICLE_DOCUMENTS_ARCHIVE)

      const documentId = readText(formData, 'documentId')
      const vehicleId = readText(formData, 'vehicleId')
      if (!documentId) return { error: 'Document introuvable.' }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase
        .from('vehicle_documents')
        .update({ is_archived: true })
        .eq('id', documentId)

      if (error) throw new Error(error.message)

      revalidatePath(`/location/parc/${vehicleId}`)
      return { success: 'Le document a été archivé.' }
    },
    ERROR_PATTERNS
  )
}
