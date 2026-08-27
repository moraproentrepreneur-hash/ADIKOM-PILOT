'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import { fromLocalInput } from '@/lib/dates'
import type { FormState } from '@/lib/form-state'
import { requiresValidate, type MaintenanceStatus } from './constants'

/**
 * Actions du module Maintenance — Étape 2.4, LOT 2.
 *
 * AUCUNE RÈGLE MÉTIER N'EST RÉÉCRITE ICI.
 *
 * Déclarer, immobiliser, terminer et annuler appellent les fonctions atomiques
 * de la migration 039 : chacune touche la maintenance, le calendrier et le
 * parc, et doit rester indivisible. Confier cet enchaînement à React
 * laisserait, à la première interruption, une fiche annonçant une
 * immobilisation que le calendrier ignore.
 *
 * LA COLLISION N'EST PAS ÉVALUÉE ICI.
 *
 * La contrainte d'exclusion de `vehicle_occupations` est l'autorité (DEC-012).
 * Ces actions ne la devancent pas : elles appellent, et traduisent son refus en
 * une phrase compréhensible.
 *
 * AUCUN MONTANT.
 *
 * `rental.maintenance.cost.update` n'apparaît nulle part dans ce fichier : les
 * coûts relèvent du LOT 3.
 */

export type MaintenanceFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /exclusion|no_overlap|chevauche/i,
    'Un engagement existant — réservation, location ou autre immobilisation — occupe déjà ce véhicule sur cette période. La maintenance n’a pas été créée.',
  ],
  [
    /cet incident ne concerne pas le véhicule/i,
    'L’incident choisi ne concerne pas ce véhicule.',
  ],
  [
    /cette location ne porte pas sur le véhicule/i,
    'La location choisie ne porte pas sur ce véhicule.',
  ],
  [
    /maintenance précédente porte sur un autre véhicule/i,
    'La maintenance précédente concerne un autre véhicule.',
  ],
  [/ne peut pas se suivre elle-même/i, 'Une maintenance ne peut pas se suivre elle-même.'],
  [
    /Transition de maintenance refusée/i,
    'Ce changement d’état n’est pas possible depuis l’état actuel.',
  ],
  [
    /seule une maintenance en cours peut être terminée/i,
    'Seule une maintenance en cours peut être terminée : reprenez l’intervention avant de conclure.',
  ],
  [
    /ne peut plus être annulée/i,
    'Cette maintenance ne peut plus être annulée.',
  ],
  [
    /terminée ou annulée ne s'immobilise plus/i,
    'Une maintenance terminée ou annulée n’immobilise plus le véhicule.',
  ],
  [
    /immobilise déjà le véhicule/i,
    'Cette maintenance immobilise déjà le véhicule.',
  ],
  [
    /exige une période valide|fin de l'immobilisation doit suivre/i,
    'La période d’immobilisation n’est pas valide : la fin doit suivre le début.',
  ],
  [
    /exige une date de début ET une date de fin/i,
    'Une immobilisation exige une date de début et une date de fin.',
  ],
  [
    /motif de la maintenance est obligatoire/i,
    'Le motif de la maintenance est obligatoire.',
  ],
  [
    /Aucune règle de numérotation/i,
    'La numérotation des maintenances n’est pas configurée.',
  ],
]

/* -------------------------------------------------------------------------- */
/*  Déclaration                                                                */
/* -------------------------------------------------------------------------- */

const ORIGINS = [
  'RENTAL_RETURN',
  'BREAKDOWN',
  'INCIDENT',
  'INSPECTION',
  'PREVENTIVE',
  'OTHER',
] as const

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

const STATUSES = [
  'DRAFT',
  'PLANNED',
  'TO_DIAGNOSE',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
] as const

const optionalUuid = z.string().uuid().optional().or(z.literal(''))

const maintenanceSchema = z.object({
  vehicleId: z.string().uuid({ message: 'Le véhicule concerné est obligatoire.' }),
  origin: z.enum(ORIGINS, { message: 'L’origine est obligatoire.' }),
  priority: z.enum(PRIORITIES),
  reason: z
    .string()
    .trim()
    .min(1, 'Indiquez pourquoi l’intervention est nécessaire.')
    .max(300, 'Le motif est trop long.'),
  description: z.string().trim().max(2000, 'La description est trop longue.').optional(),
  incidentId: optionalUuid,
  rentalId: optionalUuid,
  previousMaintenanceId: optionalUuid,
  providerSupplierId: optionalUuid,
})

export async function createMaintenanceAction(
  prevState: MaintenanceFormState,
  formData: FormData
): Promise<MaintenanceFormState> {
  return guarded(
    'maintenance:création',
    async () => {
      await requirePermission(PERMISSIONS.MAINTENANCE_CREATE)

      const parsed = maintenanceSchema.safeParse({
        vehicleId: readText(formData, 'vehicleId'),
        origin: readText(formData, 'origin'),
        priority: readText(formData, 'priority') || 'NORMAL',
        reason: readText(formData, 'reason'),
        description: readText(formData, 'description'),
        incidentId: readText(formData, 'incidentId'),
        rentalId: readText(formData, 'rentalId'),
        previousMaintenanceId: readText(formData, 'previousMaintenanceId'),
        providerSupplierId: readText(formData, 'providerSupplierId'),
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      // Les heures saisies sont des heures DES COMORES (DEC-025 §e).
      const plannedAt = fromLocalInput(readText(formData, 'plannedAt'))

      /*
       * L'IMMOBILISATION EST UN CHOIX, PAS UNE CONSÉQUENCE.
       *
       * Workflow 05 §45 : « lorsqu'une maintenance nécessite une
       * immobilisation » — donc toutes ne la nécessitent pas. Sans période,
       * aucune occupation n'est créée et le véhicule reste louable.
       */
      const immobilizes = readText(formData, 'immobilizes') === 'on'
      const from = immobilizes ? fromLocalInput(readText(formData, 'immobilizationFrom')) : null
      const to = immobilizes ? fromLocalInput(readText(formData, 'immobilizationTo')) : null

      if (immobilizes && (!from || !to)) {
        return {
          fieldErrors: {
            immobilizationFrom: !from ? 'Indiquez le début de l’immobilisation.' : undefined,
            immobilizationTo: !to ? 'Indiquez la fin de l’immobilisation.' : undefined,
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { data: maintenanceId, error } = await supabase.rpc('create_maintenance', {
        p_vehicle_id: parsed.data.vehicleId,
        p_origin: parsed.data.origin,
        p_reason: parsed.data.reason,
        p_priority: parsed.data.priority,
        p_description: orNull(parsed.data.description),
        p_incident_id: orNull(parsed.data.incidentId),
        p_rental_id: orNull(parsed.data.rentalId),
        p_previous_maintenance_id: orNull(parsed.data.previousMaintenanceId),
        p_provider_supplier_id: orNull(parsed.data.providerSupplierId),
        p_planned_at: plannedAt,
        p_immobilization_from: from,
        p_immobilization_to: to,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/maintenance')
      revalidatePath('/location/parc')

      redirect(`/location/maintenance/${maintenanceId}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Immobilisation posée après coup                                            */
/* -------------------------------------------------------------------------- */

/**
 * Immobilise un véhicule pour une maintenance déjà déclarée.
 *
 * LE CAS DE LA PANNE PENDANT UNE LOCATION.
 *
 * Le véhicule est dehors : son calendrier est occupé, et aucune immobilisation
 * ne peut y tenir. La maintenance existe donc d'abord sans, puis on l'immobilise
 * quand il est rentré. Aucune période artificielle n'est inventée pour
 * contourner l'attente ; la contrainte de calendrier reste l'autorité.
 */
export async function immobilizeMaintenanceAction(
  prevState: MaintenanceFormState,
  formData: FormData
): Promise<MaintenanceFormState> {
  return guarded(
    'maintenance:immobilisation',
    async () => {
      await requirePermission(PERMISSIONS.MAINTENANCE_UPDATE)

      const maintenanceId = readText(formData, 'maintenanceId')
      if (!maintenanceId) return { error: 'Maintenance introuvable.' }

      const from = fromLocalInput(readText(formData, 'immobilizationFrom'))
      const to = fromLocalInput(readText(formData, 'immobilizationTo'))

      if (!from || !to) {
        return {
          fieldErrors: {
            immobilizationFrom: !from ? 'Indiquez le début de l’immobilisation.' : undefined,
            immobilizationTo: !to ? 'Indiquez la fin de l’immobilisation.' : undefined,
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('immobilize_maintenance', {
        p_maintenance_id: maintenanceId,
        p_from: from,
        p_to: to,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/maintenance')
      revalidatePath(`/location/maintenance/${maintenanceId}`)
      revalidatePath('/location/parc')

      return { success: 'Le véhicule est immobilisé sur la période indiquée.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Changement d'état                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Fait avancer une maintenance d'un état à l'autre.
 *
 * DEUX PERMISSIONS, SELON L'ACTE.
 *
 * `Brouillon → Planifiée` ENGAGE l'intervention : c'est
 * `rental.maintenance.validate`. Les autres changements relèvent de
 * `rental.maintenance.update` (arbitrage ADIKOM du 27/08/2026).
 *
 * Terminer et annuler ne passent PAS par ici : ils touchent le calendrier et le
 * parc, et disposent de leur propre action atomique.
 */
export async function updateMaintenanceStatusAction(
  prevState: MaintenanceFormState,
  formData: FormData
): Promise<MaintenanceFormState> {
  return guarded(
    'maintenance:état',
    async () => {
      const maintenanceId = readText(formData, 'maintenanceId')
      if (!maintenanceId) return { error: 'Maintenance introuvable.' }

      const current = readText(formData, 'currentStatus')
      const status = readText(formData, 'status')

      if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
        return { fieldErrors: { status: 'Choisissez le nouvel état.' } }
      }

      /*
       * Terminer et annuler ont leurs propres actions : les laisser passer ici
       * contournerait la libération de l'occupation et laisserait un véhicule
       * bloqué sur un calendrier que plus rien ne justifie.
       */
      if (status === 'COMPLETED' || status === 'CANCELLED') {
        return { error: 'Cet état s’atteint depuis son propre écran.' }
      }

      const needsValidate = requiresValidate(
        current as MaintenanceStatus,
        status as MaintenanceStatus
      )

      await requirePermission(
        needsValidate ? PERMISSIONS.MAINTENANCE_VALIDATE : PERMISSIONS.MAINTENANCE_UPDATE
      )

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('vehicle_maintenances')
        .update({
          status,
          status_reason: orNull(readText(formData, 'reason')),
          status_changed_at: new Date().toISOString(),
        })
        .eq('id', maintenanceId)

      if (error) throw new Error(error.message)

      revalidatePath('/location/maintenance')
      revalidatePath(`/location/maintenance/${maintenanceId}`)

      return { success: 'L’état de la maintenance a été mis à jour.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Fin d'intervention                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Termine une maintenance après contrôle satisfaisant.
 *
 * « TERMINÉE » EST UNE ATTESTATION, PAS UN CLASSEMENT.
 *
 * Workflow 05 §47 et Parc §23 : le véhicule ne revient pas au parc sans qu'on
 * ait vérifié son état. §49 : tant que le problème persiste, cet état ne doit
 * pas être employé. C'est pourquoi la base n'ouvre la transition que depuis
 * « En cours », et pourquoi cet acte relève de `rental.maintenance.close`.
 *
 * Aucun coût n'est demandé ici, et ce n'est pas un oubli : §46 en cite un, mais
 * les montants relèvent du LOT 3.
 */
export async function completeMaintenanceAction(
  prevState: MaintenanceFormState,
  formData: FormData
): Promise<MaintenanceFormState> {
  return guarded(
    'maintenance:fin',
    async () => {
      await requirePermission(PERMISSIONS.MAINTENANCE_CLOSE)

      const maintenanceId = readText(formData, 'maintenanceId')
      if (!maintenanceId) return { error: 'Maintenance introuvable.' }

      const completedAt = fromLocalInput(readText(formData, 'completedAt'))

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('complete_maintenance', {
        p_maintenance_id: maintenanceId,
        p_completed_at: completedAt ?? new Date().toISOString(),
        p_intervention: orNull(readText(formData, 'intervention')),
        p_observations: orNull(readText(formData, 'observations')),
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/maintenance')
      revalidatePath(`/location/maintenance/${maintenanceId}`)
      revalidatePath('/location/parc')

      return { success: 'La maintenance est terminée et le véhicule est revenu au parc.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annulation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Annule une maintenance et libère le véhicule lorsque cela est permis (§64).
 *
 * La fiche reste : une opération annulée se retrouve, elle ne s'efface pas.
 */
export async function cancelMaintenanceAction(
  prevState: MaintenanceFormState,
  formData: FormData
): Promise<MaintenanceFormState> {
  return guarded(
    'maintenance:annulation',
    async () => {
      await requirePermission(PERMISSIONS.MAINTENANCE_UPDATE)

      const maintenanceId = readText(formData, 'maintenanceId')
      if (!maintenanceId) return { error: 'Maintenance introuvable.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_maintenance', {
        p_maintenance_id: maintenanceId,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath('/location/maintenance')
      revalidatePath(`/location/maintenance/${maintenanceId}`)
      revalidatePath('/location/parc')

      return { success: 'La maintenance a été annulée et le véhicule libéré.' }
    },
    ERROR_PATTERNS
  )
}
