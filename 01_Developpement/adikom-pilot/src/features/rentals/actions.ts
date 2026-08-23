'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'

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
