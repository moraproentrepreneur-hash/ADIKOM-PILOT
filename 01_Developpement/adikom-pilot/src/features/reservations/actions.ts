'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { can, requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import { fromLocalInput } from '@/lib/dates'
import type { FormState } from '@/lib/form-state'

/**
 * Actions du module Réservations.
 *
 * QUATRE GESTES, QUATRE PERMISSIONS.
 *
 * Créer, modifier, confirmer et annuler sont quatre capacités distinctes
 * (DEC-024). La policy RLS `reservations_update` accepte l'une OU l'autre des
 * trois permissions d'écriture ; c'est ici qu'est exigée celle qui correspond
 * à l'opération réellement demandée — convention posée par la migration 018 et
 * appliquée depuis aux clients, fournisseurs et partenaires.
 *
 * Confirmer et annuler ne touchent pas la table directement : ils appellent les
 * fonctions atomiques de la migration 031, qui écrivent la réservation ET son
 * occupation en une seule opération. L'application n'orchestre rien.
 */

export type ReservationFormState = FormState

/**
 * Messages métier des refus que la base peut opposer.
 *
 * Sans eux, une collision remonterait sous la forme d'une violation de
 * contrainte — exacte, mais illisible (CLAUDE.md §43).
 */
const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /n'est pas disponible|exclusion|no_overlap|chevauche/i,
    'Ce véhicule est déjà engagé sur tout ou partie de cette période.',
  ],
  [
    /aucun tarif applicable/i,
    'Aucun tarif n’est configuré pour ce client et ce véhicule : la réservation ne peut pas être confirmée.',
  ],
  [/exige de désigner le véhicule/i, 'Choisissez le véhicule à engager avant de confirmer.'],
  [
    /seule une réservation en brouillon ou en attente/i,
    'Cette réservation n’est plus au stade où elle peut être confirmée.',
  ],
  [/ne peut plus être annulée/i, 'Cette réservation ne peut plus être annulée.'],
  [/Transition de réservation refusée/i, 'Ce changement d’état n’est pas permis à ce stade.'],
]

const reservationSchema = z
  .object({
    clientId: z.string().uuid({ message: 'Sélectionnez un client.' }),
    categoryId: z.string().uuid().optional().or(z.literal('')),
    vehicleId: z.string().uuid().optional().or(z.literal('')),
    from: z.string().min(1, 'La date de début est obligatoire.'),
    to: z.string().min(1, 'La date de fin est obligatoire.'),
    conditions: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((input) => Boolean(orNull(input.categoryId) ?? orNull(input.vehicleId)), {
    message: 'Indiquez une catégorie ou un véhicule : sans cela, la réservation ne désigne rien.',
    path: ['categoryId'],
  })

function readForm(formData: FormData) {
  return {
    clientId: readText(formData, 'clientId'),
    categoryId: readText(formData, 'categoryId'),
    vehicleId: readText(formData, 'vehicleId'),
    from: readText(formData, 'from'),
    to: readText(formData, 'to'),
    conditions: readText(formData, 'conditions'),
    notes: readText(formData, 'notes'),
  }
}

/**
 * Convertit la saisie en période.
 *
 * Les heures saisies sont des heures DES COMORES (DEC-025 §e) : `fromLocalInput`
 * les transforme en instants avant qu'elles n'atteignent PostgreSQL, qui lirait
 * sinon une heure nue dans le fuseau de la session — UTC — avec trois heures de
 * dérive sur la donnée qui commande la non-collision.
 */
function toPeriod(from: string, to: string): { period: string } | { error: FormState } {
  const startsAt = fromLocalInput(from)
  const endsAt = fromLocalInput(to)

  if (!startsAt) return { error: { fieldErrors: { from: 'Cette date n’est pas valide.' } } }
  if (!endsAt) return { error: { fieldErrors: { to: 'Cette date n’est pas valide.' } } }

  if (endsAt <= startsAt) {
    return { error: { fieldErrors: { to: 'La fin doit être postérieure au début.' } } }
  }

  return { period: `[${startsAt},${endsAt})` }
}

/* -------------------------------------------------------------------------- */
/*  Création                                                                   */
/* -------------------------------------------------------------------------- */

export async function createReservationAction(
  prevState: ReservationFormState,
  formData: FormData
): Promise<ReservationFormState> {
  return guarded('réservations:création', () => createReservationInner(formData), ERROR_PATTERNS)
}

async function createReservationInner(formData: FormData): Promise<ReservationFormState> {
  const actor = await requirePermission(PERMISSIONS.RESERVATIONS_CREATE)

  const parsed = reservationSchema.safeParse(readForm(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const period = toPeriod(parsed.data.from, parsed.data.to)
  if ('error' in period) return period.error

  const supabase = await createSupabaseServerClient()

  // RES-2026-000001 : produit côté serveur, jamais saisi (DEC-005).
  const { data: reservationNo, error: numberError } = await supabase.rpc('next_number', {
    p_entity_key: 'reservation',
  })

  if (numberError || !reservationNo) {
    return { error: 'L’identifiant de réservation n’a pas pu être attribué. Réessayez.' }
  }

  const { data, error } = await supabase
    .from('reservations')
    .insert({
      reservation_no: reservationNo,
      client_id: parsed.data.clientId,
      category_id: orNull(parsed.data.categoryId),
      vehicle_id: orNull(parsed.data.vehicleId),
      period: period.period,
      conditions: orNull(parsed.data.conditions),
      notes: orNull(parsed.data.notes),
      created_by: actor.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/location/reservations')
  redirect(`/location/reservations/${data.id}?cree=1`)
}

/* -------------------------------------------------------------------------- */
/*  Modification                                                               */
/* -------------------------------------------------------------------------- */

export async function updateReservationAction(
  prevState: ReservationFormState,
  formData: FormData
): Promise<ReservationFormState> {
  return guarded('réservations:modification', () => updateReservationInner(formData), ERROR_PATTERNS)
}

async function updateReservationInner(formData: FormData): Promise<ReservationFormState> {
  const actor = await requirePermission(PERMISSIONS.RESERVATIONS_UPDATE)

  const reservationId = readText(formData, 'reservationId')
  if (!reservationId) return { error: 'Réservation introuvable.' }

  const parsed = reservationSchema.safeParse(readForm(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const period = toPeriod(parsed.data.from, parsed.data.to)
  if ('error' in period) return period.error

  const supabase = await createSupabaseServerClient()

  /*
   * Une réservation confirmée porte une occupation : déplacer sa période ici
   * la désynchroniserait du calendrier. La modification est donc réservée aux
   * états non engagés, et l'écran ne propose pas davantage.
   */
  const { data: current, error: readError } = await supabase
    .from('reservations')
    .select('status')
    .eq('id', reservationId)
    .maybeSingle()

  if (readError) throw new Error(readError.message)
  if (!current) return { error: 'Réservation introuvable.' }

  if (current.status !== 'DRAFT' && current.status !== 'PENDING') {
    return {
      error:
        'Une réservation confirmée ne se modifie plus : elle bloque le calendrier. Annulez-la pour en créer une autre.',
    }
  }

  const { error } = await supabase
    .from('reservations')
    .update({
      client_id: parsed.data.clientId,
      category_id: orNull(parsed.data.categoryId),
      vehicle_id: orNull(parsed.data.vehicleId),
      period: period.period,
      conditions: orNull(parsed.data.conditions),
      notes: orNull(parsed.data.notes),
      updated_by: actor.id,
    })
    .eq('id', reservationId)

  if (error) throw new Error(error.message)

  revalidatePath('/location/reservations')
  revalidatePath(`/location/reservations/${reservationId}`)
  redirect(`/location/reservations/${reservationId}?enregistre=1`)
}

/* -------------------------------------------------------------------------- */
/*  Confirmation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Confirme une réservation : véhicule affecté, tarif verrouillé, occupation
 * posée — en une seule opération de base (`confirm_reservation`, migration 031).
 *
 * L'application ne résout pas le tarif elle-même et ne pose pas l'occupation :
 * entre deux écritures séparées, un autre utilisateur pourrait engager le même
 * véhicule. C'est la contrainte d'exclusion qui tranche, pas cet appel.
 */
export async function confirmReservationAction(
  prevState: ReservationFormState,
  formData: FormData
): Promise<ReservationFormState> {
  return guarded(
    'réservations:confirmation',
    async () => {
      await requirePermission(PERMISSIONS.RESERVATIONS_CONFIRM)

      /*
       * Le droit de VOIR le parc est exigé EN PLUS, jamais à la place.
       *
       * `is_vehicle_available()` lit `vehicles` avec la session de l'appelant :
       * sans `rental.fleet.view`, la ligne est invisible et la disponibilité
       * revient fausse. La confirmation échouerait sur « ce véhicule n'est pas
       * disponible » — un refus d'accès présenté comme un fait, ce que DEC-017
       * proscrit. Le manque est donc nommé.
       */
      if (!(await can(PERMISSIONS.FLEET_VIEW))) {
        return {
          error:
            'Confirmer une réservation suppose de pouvoir consulter le parc automobile, afin de vérifier la disponibilité du véhicule. Ce droit ne vous est pas attribué.',
        }
      }

      const reservationId = readText(formData, 'reservationId')
      const vehicleId = orNull(readText(formData, 'vehicleId'))

      if (!reservationId) return { error: 'Réservation introuvable.' }
      if (!vehicleId) {
        return { error: 'Choisissez le véhicule à engager avant de confirmer.' }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('confirm_reservation', {
        p_reservation_id: reservationId,
        p_vehicle_id: vehicleId,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/reservations')
      revalidatePath(`/location/reservations/${reservationId}`)
      return { success: 'La réservation est confirmée : le tarif est verrouillé et le véhicule engagé.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annulation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Annule une réservation et libère son occupation.
 *
 * « Une réservation annulée ne bloque plus la disponibilité du véhicule »
 * (Règles location §13). L'occupation n'est pas effacée : elle cesse de
 * bloquer, et la trace de ce qui avait été engagé demeure.
 */
export async function cancelReservationAction(
  prevState: ReservationFormState,
  formData: FormData
): Promise<ReservationFormState> {
  return guarded(
    'réservations:annulation',
    async () => {
      await requirePermission(PERMISSIONS.RESERVATIONS_CANCEL)

      const reservationId = readText(formData, 'reservationId')
      const reason = orNull(readText(formData, 'reason'))

      if (!reservationId) return { error: 'Réservation introuvable.' }
      if (!reason) {
        return { fieldErrors: { reason: 'Le motif d’annulation est obligatoire.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_reservation', {
        p_reservation_id: reservationId,
        p_reason: reason,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/reservations')
      revalidatePath(`/location/reservations/${reservationId}`)
      return { success: 'La réservation est annulée et le véhicule libéré.' }
    },
    ERROR_PATTERNS
  )
}
