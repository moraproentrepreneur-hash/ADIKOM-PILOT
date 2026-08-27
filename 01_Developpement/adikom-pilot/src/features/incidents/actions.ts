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
 * Actions du module Incidents — Étape 2.4, LOT 1.
 *
 * DEUX BARRIÈRES, JAMAIS UNE SEULE.
 *
 * `requirePermission` exige la permission de l'action demandée ; RLS refuse de
 * toute façon l'écriture, et le déclencheur de transition refuse un
 * enchaînement incohérent. Masquer un bouton n'a jamais rien protégé
 * (DEC-011, 05_Regles_Metier/05_Permissions.md §85).
 *
 * CE MODULE NE DÉCLENCHE RIEN.
 *
 * Déclarer un incident ne crée aucune maintenance, n'immobilise aucun véhicule
 * et n'écrit pas une ligne dans `vehicle_occupations` — arbitrages ADIKOM du
 * 26/08/2026. Constater et intervenir sont deux actes distincts, et le second
 * relève du LOT 2.
 */

export type IncidentFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /cette location ne porte pas sur le véhicule/i,
    'La location choisie ne concerne pas ce véhicule.',
  ],
  [
    /un état des lieux ne se rattache qu'avec sa location/i,
    'Rattacher un état des lieux exige d’indiquer aussi sa location.',
  ],
  [
    /cet état des lieux appartient à une autre location/i,
    'Cet état des lieux appartient à une autre location.',
  ],
  [
    /Transition d'incident refusée/i,
    'Ce changement d’état n’est pas possible depuis l’état actuel.',
  ],
  [
    /se rattache obligatoirement à un véhicule/i,
    'Un incident doit désigner le véhicule concerné.',
  ],
  [
    /description de l'incident est obligatoire/i,
    'La description de l’incident est obligatoire.',
  ],
  [
    /Aucune règle de numérotation/i,
    'La numérotation des incidents n’est pas configurée.',
  ],
]

/* -------------------------------------------------------------------------- */
/*  Déclaration d'un incident                                                  */
/* -------------------------------------------------------------------------- */

const KINDS = [
  'BREAKDOWN',
  'ACCIDENT',
  'FLAT_TYRE',
  'MECHANICAL',
  'ELECTRICAL',
  'DOCUMENT_LOSS',
  'OTHER',
] as const

const SEVERITIES = ['MINOR', 'MODERATE', 'MAJOR'] as const
const RESPONSIBILITIES = ['CLIENT', 'ADIKOM', 'SUPPLIER', 'UNDETERMINED'] as const

const incidentSchema = z.object({
  vehicleId: z.string().uuid({ message: 'Le véhicule concerné est obligatoire.' }),
  kind: z.enum(KINDS, { message: 'La nature de l’incident est obligatoire.' }),
  occurredAt: z.string().min(1, 'La date de l’incident est obligatoire.'),
  description: z
    .string()
    .trim()
    .min(1, 'Décrivez ce qui s’est passé.')
    .max(2000, 'La description est trop longue.'),
})

/**
 * Une ligne de dommage saisie au formulaire.
 *
 * Les champs arrivent en tableaux parallèles (`damageLocation[]`,
 * `damageSeverity[]`, …), forme qu'un formulaire HTML sait produire sans
 * JavaScript côté serveur. Une ligne dont l'emplacement est vide est ÉCARTÉE :
 * l'utilisateur a ajouté une ligne puis renoncé, ce n'est pas une erreur.
 */
function readDamages(formData: FormData) {
  const locations = formData.getAll('damageLocation')
  const descriptions = formData.getAll('damageDescription')
  const severities = formData.getAll('damageSeverity')
  const responsibilities = formData.getAll('damageResponsibility')
  const preexisting = formData.getAll('damagePreexisting')

  const at = (list: FormDataEntryValue[], index: number) =>
    typeof list[index] === 'string' ? (list[index] as string) : ''

  return locations
    .map((_, index) => ({
      location: at(locations, index).trim(),
      description: orNull(at(descriptions, index)),
      severity: SEVERITIES.includes(at(severities, index) as (typeof SEVERITIES)[number])
        ? at(severities, index)
        : 'MINOR',
      responsibility: RESPONSIBILITIES.includes(
        at(responsibilities, index) as (typeof RESPONSIBILITIES)[number]
      )
        ? at(responsibilities, index)
        : 'UNDETERMINED',
      // Case à cocher : la valeur transmise porte l'index de sa ligne, seule
      // façon de savoir LAQUELLE a été cochée quand les autres ne renvoient rien.
      isPreexisting: preexisting.includes(String(index)),
    }))
    .filter((damage) => damage.location !== '')
}

export async function createIncidentAction(
  prevState: IncidentFormState,
  formData: FormData
): Promise<IncidentFormState> {
  return guarded(
    'incidents:création',
    async () => {
      const actor = await requirePermission(PERMISSIONS.INCIDENTS_CREATE)

      const parsed = incidentSchema.safeParse({
        vehicleId: readText(formData, 'vehicleId'),
        kind: readText(formData, 'kind'),
        occurredAt: readText(formData, 'occurredAt'),
        description: readText(formData, 'description'),
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      // L'heure saisie est une heure DES COMORES (DEC-025 §e).
      const occurredAt = fromLocalInput(parsed.data.occurredAt)
      if (!occurredAt) {
        return { fieldErrors: { occurredAt: 'Cette date n’est pas valide.' } }
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

      const { data: incidentId, error } = await supabase.rpc('create_incident', {
        p_vehicle_id: parsed.data.vehicleId,
        p_kind: parsed.data.kind,
        p_description: parsed.data.description,
        p_occurred_at: occurredAt,
        p_rental_id: orNull(readText(formData, 'rentalId')),
        p_inspection_id: orNull(readText(formData, 'inspectionId')),
        p_damages: readDamages(formData),
      })

      if (error) throw new Error(error.message)

      const rejected = await attachPhotos(supabase, String(incidentId), photos, actor.id)

      revalidatePath('/location/incidents')
      revalidatePath('/location/parc')

      redirect(
        `/location/incidents/${incidentId}?cree=1${rejected ? `&photos=${rejected}` : ''}`
      )
    },
    ERROR_PATTERNS
  )
}

/**
 * Dépose les photos et les rattache à l'incident.
 *
 * Le dépôt passe par le client d'administration, seul autorisé sur un bucket
 * privé sans policy (migration 019) ; la LIGNE, elle, est écrite avec la
 * session de l'appelant, donc sous RLS. Le préfixe `incidents/` sépare ces
 * photos de celles des états des lieux et des documents du véhicule.
 *
 * Renvoie le nombre de photos écartées, afin que l'écran le dise plutôt que de
 * laisser croire qu'elles ont toutes été enregistrées.
 */
async function attachPhotos(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  incidentId: string,
  photos: File[],
  actorId: string
): Promise<number> {
  if (photos.length === 0) return 0

  const admin = createSupabaseAdminClient()
  let rejected = 0

  for (const photo of photos) {
    const path = `incidents/${incidentId}/${crypto.randomUUID()}-${safePhotoName(photo.name)}`

    const { error: uploadError } = await admin.storage
      .from('vehicle-documents')
      .upload(path, photo, { contentType: photo.type, upsert: false })

    if (uploadError) {
      console.error(`[incidents] dépôt photo : ${uploadError.message}`)
      rejected += 1
      continue
    }

    const { error: rowError } = await supabase.from('incident_photos').insert({
      incident_id: incidentId,
      storage_path: path,
      file_name: photo.name,
      file_size: photo.size,
      mime_type: photo.type,
      created_by: actorId,
    })

    if (rowError) {
      // Le fichier déposé sans sa ligne serait orphelin : il est retiré.
      console.error(`[incidents] rattachement photo : ${rowError.message}`)
      await admin.storage.from('vehicle-documents').remove([path])
      rejected += 1
    }
  }

  return rejected
}

/** Nom de fichier réduit à ce qu'un chemin de stockage accepte sans ambiguïté. */
function safePhotoName(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)

  return cleaned || 'photo'
}

/* -------------------------------------------------------------------------- */
/*  Changement d'état                                                          */
/* -------------------------------------------------------------------------- */

const STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED'] as const

/**
 * Fait passer un incident d'un état à l'autre.
 *
 * `rental.incidents.update` suffit : aucune permission `.close` n'est créée —
 * arbitrage ADIKOM du 26/08/2026. Le catalogue décrit des capacités réelles, et
 * clore un incident est une modification de son état, pas une capacité à part.
 *
 * L'ENCHAÎNEMENT, lui, n'est pas affaire de permission : le déclencheur
 * `fn_incident_status_transition` refuse de ressusciter un incident clos, quel
 * que soit le droit détenu par l'appelant.
 */
export async function updateIncidentStatusAction(
  prevState: IncidentFormState,
  formData: FormData
): Promise<IncidentFormState> {
  return guarded(
    'incidents:état',
    async () => {
      await requirePermission(PERMISSIONS.INCIDENTS_UPDATE)

      const incidentId = readText(formData, 'incidentId')
      if (!incidentId) return { error: 'Incident introuvable.' }

      const status = readText(formData, 'status')
      if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
        return { fieldErrors: { status: 'Choisissez le nouvel état.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('vehicle_incidents')
        .update({
          status,
          status_reason: orNull(readText(formData, 'reason')),
          status_changed_at: new Date().toISOString(),
        })
        .eq('id', incidentId)

      if (error) throw new Error(error.message)

      revalidatePath('/location/incidents')
      revalidatePath(`/location/incidents/${incidentId}`)

      return { success: 'L’état de l’incident a été mis à jour.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Dommage ajouté après coup                                                  */
/* -------------------------------------------------------------------------- */

const damageSchema = z.object({
  location: z
    .string()
    .trim()
    .min(1, 'Indiquez où se situe le dommage.')
    .max(200, 'L’emplacement est trop long.'),
  description: z.string().trim().max(1000, 'La description est trop longue.').optional(),
  severity: z.enum(SEVERITIES),
  responsibility: z.enum(RESPONSIBILITIES),
})

/**
 * Ajoute un dommage à un incident déjà déclaré.
 *
 * Un constat se complète : un dommage passe inaperçu au premier examen et
 * apparaît au lavage. Le refuser obligerait à déclarer un second incident pour
 * un événement unique, et le dossier perdrait son unité.
 */
export async function addDamageAction(
  prevState: IncidentFormState,
  formData: FormData
): Promise<IncidentFormState> {
  return guarded(
    'incidents:dommage',
    async () => {
      await requirePermission(PERMISSIONS.INCIDENTS_UPDATE)

      const incidentId = readText(formData, 'incidentId')
      if (!incidentId) return { error: 'Incident introuvable.' }

      const parsed = damageSchema.safeParse({
        location: readText(formData, 'location'),
        description: readText(formData, 'description'),
        severity: readText(formData, 'severity') || 'MINOR',
        responsibility: readText(formData, 'responsibility') || 'UNDETERMINED',
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.from('incident_damages').insert({
        incident_id: incidentId,
        location: parsed.data.location,
        description: orNull(parsed.data.description),
        severity: parsed.data.severity,
        responsibility: parsed.data.responsibility,
        is_preexisting: readText(formData, 'isPreexisting') === 'on',
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/location/incidents/${incidentId}`)

      return { success: 'Le dommage a été enregistré.' }
    },
    ERROR_PATTERNS
  )
}
