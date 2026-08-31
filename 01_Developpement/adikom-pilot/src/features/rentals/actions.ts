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
  [
    /seule une location en cours peut être prolongée/i,
    'Seule une location en cours peut être prolongée.',
  ],
  [
    /postérieure à la date attendue/i,
    'La nouvelle date de retour doit être postérieure à celle actuellement attendue.',
  ],
  [
    /seule une location en cours peut être retournée/i,
    'Seule une location en cours peut être retournée.',
  ],
  [
    /retour de cette location est déjà enregistré/i,
    'Le retour de cette location est déjà enregistré.',
  ],
  [
    /jamais partie/i,
    'Cette location n’est jamais partie : il n’y a rien à retourner.',
  ],
  [
    /retour ne peut pas précéder le départ/i,
    'La date de retour ne peut pas précéder celle du départ.',
  ],
  [
    /kilométrage de retour/i,
    'Le kilométrage de retour ne peut pas être inférieur à celui relevé au départ.',
  ],
  [
    /seule une location facturée se clôture/i,
    'Seule une location facturée se clôture. Émettez d’abord sa facture client.',
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

      const rejected = await attachPhotos(
        supabase,
        String(inspectionId),
        photos,
        actor.id,
        'depart'
      )

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
  actorId: string,
  /** Segment de chemin : une photo de départ ne se confond pas avec un retour. */
  kind: 'depart' | 'retour'
): Promise<number> {
  if (photos.length === 0) return 0

  const admin = createSupabaseAdminClient()
  let rejected = 0

  for (const photo of photos) {
    const path = `inspections/${kind}/${inspectionId}/${crypto.randomUUID()}-${safePhotoName(photo.name)}`

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

/* -------------------------------------------------------------------------- */
/*  Prolongation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Prolonge une location en cours.
 *
 * TOUT SE JOUE DANS `extend_rental` (migration 031).
 *
 * La fonction étend la période de l'occupation AVANT de déplacer la date
 * attendue : si un autre engagement occupe le créneau, la contrainte
 * d'exclusion refuse, et rien n'est modifié — ni le calendrier, ni la
 * location. Une prolongation refusée ne laisse aucune trace partielle.
 *
 * LE TARIF N'EST PAS TOUCHÉ.
 *
 * `locked_amount` et `locked_unit` restent ceux du contrat. Module 05 §34
 * évoque un « nouveau montant » sans en définir le calcul, et DEC-008 laisse
 * ouvertes la règle d'arrondi de durée et le traitement du retard. Aucun
 * montant n'est donc recalculé : le système ne valorise pas ce qu'aucune règle
 * validée ne permet de valoriser.
 */
export async function extendRentalAction(
  prevState: RentalFormState,
  formData: FormData
): Promise<RentalFormState> {
  return guarded(
    'locations:prolongation',
    async () => {
      await requirePermission(PERMISSIONS.RENTALS_EXTEND)

      const rentalId = readText(formData, 'rentalId')
      const newEnd = readText(formData, 'newEnd')
      const reason = orNull(readText(formData, 'reason'))

      if (!rentalId) return { error: 'Location introuvable.' }
      if (!newEnd) {
        return { fieldErrors: { newEnd: 'La nouvelle date de retour est obligatoire.' } }
      }

      // L'heure saisie est une heure DES COMORES (DEC-025 §e).
      const endsAt = fromLocalInput(newEnd)
      if (!endsAt) {
        return { fieldErrors: { newEnd: 'Cette date n’est pas valide.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('extend_rental', {
        p_rental_id: rentalId,
        p_new_end: endsAt,
        p_reason: reason,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/locations')
      revalidatePath(`/location/locations/${rentalId}`)
      return {
        success:
          'La location est prolongée. Le tarif verrouillé du contrat reste inchangé : la valorisation de la période supplémentaire relèvera de la facturation.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Retour et contrôle                                                         */
/* -------------------------------------------------------------------------- */

const returnSchema = z.object({
  returnedAt: z.string().min(1, 'La date et l’heure de retour sont obligatoires.'),
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
  newDamages: z.string().trim().max(4000).optional(),
  observations: z.string().trim().max(4000).optional(),
})

/**
 * Enregistre le retour d'une location.
 *
 * `return_rental` (migration 036) écrit l'état des lieux de retour, la date
 * réelle, les deux transitions de statut, la libération du calendrier et le
 * statut du véhicule. Rien de cela n'est fait ici : une interruption entre deux
 * écritures laisserait un véhicule rendu que le calendrier croirait encore
 * engagé.
 *
 * AUCUN ÉCART N'EST VALORISÉ.
 *
 * Ni carburant manquant, ni kilométrage supplémentaire, ni retard, ni dommage.
 * Ces barèmes n'existent pas (DEC-008) et le contrôle CONSTATE (DEC-025 §i).
 */
export async function returnRentalAction(
  prevState: RentalFormState,
  formData: FormData
): Promise<RentalFormState> {
  return guarded(
    'locations:retour',
    async () => {
      const actor = await requirePermission(PERMISSIONS.RENTALS_RETURN)

      const rentalId = readText(formData, 'rentalId')
      if (!rentalId) return { error: 'Location introuvable.' }

      const parsed = returnSchema.safeParse({
        returnedAt: readText(formData, 'returnedAt'),
        mileage: readText(formData, 'mileage'),
        fuelLevel: readText(formData, 'fuelLevel'),
        exteriorCondition: readText(formData, 'exteriorCondition'),
        interiorCondition: readText(formData, 'interiorCondition'),
        newDamages: readText(formData, 'newDamages'),
        observations: readText(formData, 'observations'),
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      // L'heure saisie est une heure DES COMORES (DEC-025 §e).
      const returnedAt = fromLocalInput(parsed.data.returnedAt)
      if (!returnedAt) {
        return { fieldErrors: { returnedAt: 'Cette date n’est pas valide.' } }
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

      const { data: inspectionId, error } = await supabase.rpc('return_rental', {
        p_rental_id: rentalId,
        p_returned_at: returnedAt,
        p_mileage: parsed.data.mileage ? Number(parsed.data.mileage) : null,
        p_fuel_level: orNull(parsed.data.fuelLevel),
        p_exterior_condition: orNull(parsed.data.exteriorCondition),
        p_interior_condition: orNull(parsed.data.interiorCondition),
        p_new_damages: orNull(parsed.data.newDamages),
        p_observations: orNull(parsed.data.observations),
      })

      if (error) throw new Error(error.message)

      const rejected = await attachPhotos(
        supabase,
        String(inspectionId),
        photos,
        actor.id,
        'retour'
      )

      revalidatePath('/location/locations')
      revalidatePath(`/location/locations/${rentalId}`)
      revalidatePath('/location/parc')

      redirect(
        `/location/locations/${rentalId}?onglet=controle&rentre=1${rejected ? `&photos=${rejected}` : ''}`
      )
    },
    ERROR_PATTERNS
  )
}

/**
 * Valide le contrôle de retour : « À contrôler » → « À facturer ».
 *
 * DEC-025 §b : c'est `rental.rentals.close` qui porte cet acte, sans qu'une
 * permission de contrôle distincte soit créée. La location quitte
 * l'exploitation et attend la facturation, qui relève de l'Étape 2.5.
 *
 * Une seule table écrite : aucune fonction atomique ici, elle n'aurait rien à
 * rendre indivisible. Le déclencheur de transition reste le garde-fou, et le
 * filtre `eq('status', 'TO_CONTROL')` évite qu'un double clic ne rejoue l'acte.
 */
export async function closeControlAction(
  prevState: RentalFormState,
  formData: FormData
): Promise<RentalFormState> {
  return guarded(
    'locations:contrôle',
    async () => {
      const actor = await requirePermission(PERMISSIONS.RENTALS_CLOSE)

      const rentalId = readText(formData, 'rentalId')
      const observations = orNull(readText(formData, 'observations'))

      if (!rentalId) return { error: 'Location introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('rentals')
        .update({
          status: 'TO_INVOICE',
          status_reason: observations,
          status_changed_at: new Date().toISOString(),
          status_changed_by: actor.id,
          updated_by: actor.id,
        })
        .eq('id', rentalId)
        .eq('status', 'TO_CONTROL')

      if (error) throw new Error(error.message)

      revalidatePath('/location/locations')
      revalidatePath(`/location/locations/${rentalId}`)
      return {
        success:
          'Contrôle validé. La location passe « À facturer » : la valorisation relèvera de la facturation.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Clôture : « Facturée » → « Clôturée » — Workflow 01 §41                    */
/* -------------------------------------------------------------------------- */

/**
 * Clôture le dossier de location.
 *
 * LA CLÔTURE N'EXIGE AUCUN PAIEMENT.
 *
 * Workflow 01 §42 : « Une location peut être clôturée opérationnellement même si
 * la facture n'est pas encore entièrement payée. Le système doit conserver les
 * deux informations séparément. » Le solde de la facture et l'état du dossier
 * sont deux choses distinctes, et le resteront.
 *
 * L'acte porte `rental.rentals.close` — « Clôturer une location » au catalogue
 * depuis la migration 007. Aucune permission n'est créée : la migration 042
 * avait laissé cette transition sans capacité faute de facture, pas faute de
 * code.
 */
export async function closeRentalAction(
  prevState: RentalFormState,
  formData: FormData
): Promise<RentalFormState> {
  return guarded(
    'locations:clôture',
    async () => {
      await requirePermission(PERMISSIONS.RENTALS_CLOSE)

      const rentalId = readText(formData, 'rentalId')
      if (!rentalId) return { error: 'Location introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('close_rental', {
        p_rental_id: rentalId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/locations')
      revalidatePath(`/location/locations/${rentalId}`)
      return {
        success:
          'Location clôturée. Son historique reste consultable ; l’état de sa facture n’a pas changé.',
      }
    },
    ERROR_PATTERNS
  )
}
