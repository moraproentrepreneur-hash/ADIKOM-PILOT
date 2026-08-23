'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import { fromLocalInput } from '@/lib/dates'
import type { FormState } from '@/lib/form-state'
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_SIZE } from './constants'

/**
 * Actions du module Locations.
 *
 * AUCUNE RÈGLE MÉTIER N'EST RÉÉCRITE ICI.
 *
 * La conversion et l'annulation appellent les fonctions atomiques des
 * migrations 031 et 034 : elles touchent plusieurs tables — location,
 * réservation, occupation — et doivent rester indivisibles. L'application
 * vérifie la permission, appelle, et traduit le refus éventuel.
 *
 * Le tarif n'est jamais résolu de nouveau : la location REPREND celui que la
 * réservation a verrouillé (Module 05 §21). Le résoudre une seconde fois
 * exposerait le contrat à une modification de la grille intervenue entre-temps.
 */

export type RentalFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /seule une réservation confirmée/i,
    'Seule une réservation confirmée peut devenir une location.',
  ],
  [
    /Réservation incomplète/i,
    'Cette réservation n’a pas de véhicule ou de tarif verrouillé : confirmez-la d’abord.',
  ],
  [
    /une location déjà partie ne s'annule pas|déjà partie/i,
    'Une location déjà partie ne s’annule pas : elle se termine par un retour.',
  ],
  [/Transition de location refusée/i, 'Ce changement d’état n’est pas permis à ce stade.'],
  [
    /exclusion|no_overlap|chevauche/i,
    'La période est déjà engagée sur ce véhicule.',
  ],
]

/* -------------------------------------------------------------------------- */
/*  Conversion d'une réservation en location                                   */
/* -------------------------------------------------------------------------- */

/**
 * Transforme une réservation confirmée en contrat de location.
 *
 * L'occupation CHANGE D'ORIGINE au lieu d'être recréée : sans cela, il
 * existerait une fenêtre — si brève soit-elle — pendant laquelle le véhicule
 * paraîtrait libre et pourrait être engagé ailleurs.
 */
export async function convertReservationAction(
  prevState: RentalFormState,
  formData: FormData
): Promise<RentalFormState> {
  return guarded(
    'locations:conversion',
    async () => {
      await requirePermission(PERMISSIONS.RENTALS_CREATE)

      const reservationId = readText(formData, 'reservationId')
      if (!reservationId) return { error: 'Réservation introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { data: rentalId, error } = await supabase.rpc('convert_reservation_to_rental', {
        p_reservation_id: reservationId,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/reservations')
      revalidatePath(`/location/reservations/${reservationId}`)
      revalidatePath('/location/locations')
      redirect(`/location/locations/${rentalId}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Validation avant départ                                                    */
/* -------------------------------------------------------------------------- */

/**
 * « En préparation » → « Confirmée ».
 *
 * Le contrat est prêt : le véhicule est réservé, le tarif figé, les conditions
 * arrêtées. Le départ lui-même relève du lot suivant et d'une autre permission.
 */
export async function confirmRentalAction(
  prevState: RentalFormState,
  formData: FormData
): Promise<RentalFormState> {
  return guarded(
    'locations:validation',
    async () => {
      const actor = await requirePermission(PERMISSIONS.RENTALS_UPDATE)

      const rentalId = readText(formData, 'rentalId')
      if (!rentalId) return { error: 'Location introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('rentals')
        .update({
          status: 'CONFIRMED',
          status_changed_at: new Date().toISOString(),
          status_changed_by: actor.id,
          updated_by: actor.id,
        })
        .eq('id', rentalId)
        .eq('status', 'PREPARING')

      if (error) throw new Error(error.message)

      revalidatePath('/location/locations')
      revalidatePath(`/location/locations/${rentalId}`)
      return { success: 'Le contrat est confirmé : la location peut partir.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annulation avant départ                                                    */
/* -------------------------------------------------------------------------- */

export async function cancelRentalAction(
  prevState: RentalFormState,
  formData: FormData
): Promise<RentalFormState> {
  return guarded(
    'locations:annulation',
    async () => {
      await requirePermission(PERMISSIONS.RENTALS_CANCEL)

      const rentalId = readText(formData, 'rentalId')
      const reason = orNull(readText(formData, 'reason'))

      if (!rentalId) return { error: 'Location introuvable.' }
      if (!reason) {
        return { fieldErrors: { reason: 'Le motif d’annulation est obligatoire.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_rental', {
        p_rental_id: rentalId,
        p_reason: reason,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/locations')
      revalidatePath(`/location/locations/${rentalId}`)
      return { success: 'La location est annulée et le véhicule libéré.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Départ et état des lieux                                                   */
/* -------------------------------------------------------------------------- */

const inspectionSchema = z.object({
  startedAt: z.string().min(1, 'La date et l’heure de départ sont obligatoires.'),
  mileage: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^\d{1,9}$/.test(value), {
      message: 'Le kilométrage doit être un nombre entier.',
    }),
  fuelLevel: z.enum(['', 'EMPTY', 'QUARTER', 'HALF', 'THREE_QUARTERS', 'FULL']).optional(),
  exteriorCondition: z.string().trim().max(2000).optional(),
  interiorCondition: z.string().trim().max(2000).optional(),
  preexistingDamages: z.string().trim().max(4000).optional(),
  observations: z.string().trim().max(4000).optional(),
})

/** Nom de fichier sûr : ni chemin, ni caractère susceptible d'être interprété. */
function safePhotoName(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)

  return cleaned || 'photo'
}

/**
 * Enregistre le départ d'une location.
 *
 * UNE SEULE OPÉRATION EN BASE, PUIS LES PHOTOS.
 *
 * `start_rental` (migration 035) écrit l'état des lieux, la date de départ, le
 * statut de la location, celui du véhicule et, si le départ précède la période
 * prévue, la borne du calendrier. Rien de tout cela n'est fait ici : une
 * interruption entre deux écritures laisserait une location partie sans état
 * des lieux.
 *
 * Les photos viennent APRÈS, et leur échec ne remet pas le départ en cause :
 * le véhicule est parti, c'est le fait qui compte. L'échec est signalé, pas
 * masqué.
 */
export async function startRentalAction(
  prevState: RentalFormState,
  formData: FormData
): Promise<RentalFormState> {
  return guarded(
    'locations:départ',
    async () => {
      const actor = await requirePermission(PERMISSIONS.RENTALS_CHECKOUT)

      const rentalId = readText(formData, 'rentalId')
      if (!rentalId) return { error: 'Location introuvable.' }

      const parsed = inspectionSchema.safeParse({
        startedAt: readText(formData, 'startedAt'),
        mileage: readText(formData, 'mileage'),
        fuelLevel: readText(formData, 'fuelLevel'),
        exteriorCondition: readText(formData, 'exteriorCondition'),
        interiorCondition: readText(formData, 'interiorCondition'),
        preexistingDamages: readText(formData, 'preexistingDamages'),
        observations: readText(formData, 'observations'),
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      // L'heure saisie est une heure DES COMORES (DEC-025 §e).
      const startedAt = fromLocalInput(parsed.data.startedAt)
      if (!startedAt) {
        return { fieldErrors: { startedAt: 'Cette date n’est pas valide.' } }
      }

      const photos = formData
        .getAll('photos')
        .filter((entry): entry is File => entry instanceof File && entry.size > 0)

      for (const photo of photos) {
        if (photo.size > MAX_PHOTO_SIZE) {
          return { fieldErrors: { photos: 'Chaque photo doit peser moins de 10 Mo.' } }
        }
        if (!ACCEPTED_PHOTO_TYPES.includes(photo.type as (typeof ACCEPTED_PHOTO_TYPES)[number])) {
          return { fieldErrors: { photos: 'Formats acceptés : JPEG, PNG, WebP.' } }
        }
      }

      const supabase = await createSupabaseServerClient()

      const { data: inspectionId, error } = await supabase.rpc('start_rental', {
        p_rental_id: rentalId,
        p_started_at: startedAt,
        p_mileage: parsed.data.mileage ? Number(parsed.data.mileage) : null,
        p_fuel_level: orNull(parsed.data.fuelLevel),
        p_exterior_condition: orNull(parsed.data.exteriorCondition),
        p_interior_condition: orNull(parsed.data.interiorCondition),
        p_preexisting_damages: orNull(parsed.data.preexistingDamages),
        p_observations: orNull(parsed.data.observations),
      })

      if (error) throw new Error(error.message)

      const rejected = await attachPhotos(supabase, String(inspectionId), photos, actor.id)

      revalidatePath('/location/locations')
      revalidatePath(`/location/locations/${rentalId}`)
      revalidatePath(`/location/parc`)

      redirect(
        `/location/locations/${rentalId}?onglet=etats&parti=1${rejected ? `&photos=${rejected}` : ''}`
      )
    },
    ERROR_PATTERNS
  )
}

/**
 * Dépose les photos et les rattache à l'état des lieux.
 *
 * Le dépôt passe par le client d'administration, seul autorisé sur un bucket
 * privé sans policy (migration 019) ; la LIGNE, elle, est écrite avec la
 * session de l'appelant, donc sous RLS. Le préfixe `inspections/` sépare ces
 * photos des documents du véhicule (DEC-025 §f).
 *
 * Renvoie le nombre de photos écartées, afin que l'écran le dise plutôt que de
 * laisser croire qu'elles ont toutes été enregistrées.
 */
async function attachPhotos(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  inspectionId: string,
  photos: File[],
  actorId: string
): Promise<number> {
  if (photos.length === 0) return 0

  const admin = createSupabaseAdminClient()
  let rejected = 0

  for (const photo of photos) {
    const path = `inspections/${inspectionId}/${crypto.randomUUID()}-${safePhotoName(photo.name)}`

    const { error: uploadError } = await admin.storage
      .from('vehicle-documents')
      .upload(path, photo, { contentType: photo.type, upsert: false })

    if (uploadError) {
      console.error(`[locations:départ] dépôt photo : ${uploadError.message}`)
      rejected += 1
      continue
    }

    const { error: rowError } = await supabase.from('rental_inspection_photos').insert({
      inspection_id: inspectionId,
      storage_path: path,
      file_name: photo.name,
      file_size: photo.size,
      mime_type: photo.type,
      created_by: actorId,
    })

    if (rowError) {
      // Le fichier déposé sans sa ligne serait orphelin : il est retiré.
      console.error(`[locations:départ] rattachement photo : ${rowError.message}`)
      await admin.storage.from('vehicle-documents').remove([path])
      rejected += 1
    }
  }

  return rejected
}
