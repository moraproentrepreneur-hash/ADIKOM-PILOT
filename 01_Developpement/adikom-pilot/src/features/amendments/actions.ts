'use server'

import { revalidatePath } from 'next/cache'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, readText, toFieldErrors, type FormState } from '@/lib/server-action'
import { fromLocalInput } from '@/lib/dates'
import { rateChangeSchema, vehicleSwapSchema } from './schema'

/**
 * Actions des avenants — LOT 22, DEC-045.
 *
 * CHAQUE ACTION COMMENCE PAR SA CAPACITÉ, et par la sienne seule :
 *
 *   · remplacer le véhicule   → `rental.rentals.swap`
 *   · forcer un tarif         → `rental.pricing.override`
 *
 * Aucune n'ouvre l'autre (DEC-024, A-14). Un remplacement AVEC dérogation
 * tarifaire exige LES DEUX : substituer un véhicule n'a jamais supposé le droit
 * de s'écarter du barème.
 *
 * La vérification côté serveur n'est pas la seule — la base oppose les mêmes
 * refus à un appel direct : policies, `fn_rental_amendment_guard`,
 * `fn_rental_segment_guard`, `fn_occupation_capability`, `require_capability`.
 * Masquer un bouton ne protège rien (CLAUDE.md §19).
 *
 * RIEN N'EST ÉCRIT D'ICI PAR UN `insert`. Un remplacement touche SIX choses —
 * l'avenant, le segment clos, son occupation libérée, le segment ouvert, son
 * occupation posée, le véhicule courant du contrat. Les enchaîner depuis
 * l'application laisserait, à la moindre interruption, un contrat sans véhicule
 * affecté, ou deux véhicules engagés en même temps. Les fonctions atomiques de la
 * migration 087 sont le seul chemin.
 */

export type AmendmentFormState = FormState

/**
 * Messages fonctionnels des refus que la base oppose.
 *
 * Sans eux, l'utilisateur lirait « violates exclusion constraint » — technique,
 * inutile, et révélateur de la structure interne (CLAUDE.md §43).
 */
const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /n'est pas disponible du|vehicle_occupations_no_overlap|exclusion/i,
    'Ce véhicule est déjà engagé sur tout ou partie de la période restante. Un véhicule ne peut pas être affecté à deux engagements incompatibles.',
  ],
  [
    /rental_segments_no_overlap/,
    'Cette période recouvre un autre segment du contrat. Les périodes d’un même contrat ne se chevauchent pas.',
  ],
  [
    /doit commencer exactement où le segment/,
    'La date de bascule laisserait le contrat sans véhicule affecté pendant un temps. Choisissez un instant situé dans la période en cours.',
  ],
  [
    /aucun segment ouvert/i,
    'Cette location n’a aucune période en cours : son véhicule ne peut plus être remplacé.',
  ],
  [
    /aucun tarif client n'est applicable/i,
    'Aucun tarif n’est configuré pour ce véhicule à cette date. Renseignez-le dans la tarification, ou appliquez explicitement un tarif dérogatoire motivé.',
  ],
  [
    /ne se remplace plus|ne se change plus/i,
    'Le contrat n’est plus dans un état qui permet cet avenant.',
  ],
  [
    /est retiré du parc/i,
    'Ce véhicule est retiré du parc : il ne peut plus être engagé sur une location.',
  ],
  [
    /avenant de prolongation n'est pas ouvert/i,
    'La prolongation se saisit par « Prolonger », qui déplace la date de retour attendue.',
  ],
  [
    /Droit insuffisant/i,
    'Votre compte ne détient pas la capacité requise pour cet acte.',
  ],
]

/**
 * Les écrans que ce lot alimente.
 *
 * Un avenant change le véhicule courant d'un contrat : la liste des locations, la
 * fiche du contrat, le tableau de location et les deux fiches véhicule en
 * dépendent. La revalidation les nomme tous plutôt que de supposer d'où vient
 * l'appel.
 */
function revalidateAmendmentSurfaces(rentalId: string, vehicleIds: (string | null)[]) {
  revalidatePath('/location')
  revalidatePath('/location/locations')
  revalidatePath(`/location/locations/${rentalId}`)
  revalidatePath('/location/parc')
  for (const id of vehicleIds) {
    if (id) revalidatePath(`/location/parc/${id}`)
  }
}

/* -------------------------------------------------------------------------- */
/*  Remplacement de véhicule — A-4, A-5                                        */
/* -------------------------------------------------------------------------- */

/**
 * Remplace le véhicule d'une location, par avenant.
 *
 * 🟩 A-4 : « On garde le même contrat et on rajoute des avenants. » L'identifiant
 * du contrat ne change pas, et aucune location nouvelle n'est créée.
 *
 * 🟩 A-5 : sans montant saisi, le client paie le tarif du NOUVEAU véhicule,
 * résolu par `resolve_pricing_rule` — DEC-002 n'est pas réécrite, elle est
 * appelée. Avec un montant, c'est une DÉROGATION : elle exige
 * `rental.pricing.override` et sa raison écrite, et la base les redemande.
 */
export async function replaceRentalVehicleAction(
  prevState: AmendmentFormState,
  formData: FormData
): Promise<AmendmentFormState> {
  return guarded(
    'avenant:remplacement',
    async () => {
      await requirePermission(PERMISSIONS.RENTALS_SWAP)

      const parsed = vehicleSwapSchema.safeParse({
        rentalId: readText(formData, 'rentalId'),
        vehicleId: readText(formData, 'vehicleId'),
        effectiveAt: readText(formData, 'effectiveAt'),
        reason: readText(formData, 'reason'),
        amount: readText(formData, 'amount'),
        unit: readText(formData, 'unit') || undefined,
        rateReason: readText(formData, 'rateReason'),
        notes: readText(formData, 'notes'),
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      /*
       * LA DÉROGATION EXIGE SA PROPRE CAPACITÉ, ET ELLE EST VÉRIFIÉE ICI AUSSI.
       *
       * La base la redemande — `fn_rental_amendment_guard` et la fonction
       * elle-même —, mais un refus levé au premier geste vaut mieux qu'un refus
       * levé au dernier : l'utilisateur sait ce qui lui manque avant d'avoir
       * rempli le formulaire (A-14).
       */
      if (parsed.data.amount !== null) {
        await requirePermission(PERMISSIONS.PRICING_OVERRIDE)
      }

      // L'heure saisie est une heure DES COMORES (DEC-025 §e).
      const effectiveAt = fromLocalInput(parsed.data.effectiveAt)
      if (!effectiveAt) {
        return { fieldErrors: { effectiveAt: 'Cette date n’est pas valide.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('replace_rental_vehicle', {
        p_rental_id: parsed.data.rentalId,
        p_new_vehicle_id: parsed.data.vehicleId,
        p_effective_at: effectiveAt,
        p_reason: parsed.data.reason,
        p_amount: parsed.data.amount,
        p_unit: parsed.data.unit ?? null,
        p_rate_reason: parsed.data.rateReason,
        p_notes: parsed.data.notes,
      })

      if (error) throw new Error(error.message)

      revalidateAmendmentSurfaces(parsed.data.rentalId, [parsed.data.vehicleId])

      return {
        success:
          parsed.data.amount !== null
            ? 'Avenant enregistré. Le véhicule de remplacement est affecté, et le tarif dérogatoire appliqué avec sa raison. Le contrat et son identifiant sont inchangés.'
            : 'Avenant enregistré. Le véhicule de remplacement est affecté au tarif de son barème, et l’ancien véhicule reste dans l’historique du contrat.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Changement de tarif — A-5, A-7                                             */
/* -------------------------------------------------------------------------- */

/**
 * Change le tarif d'un contrat en cours, à partir d'une date d'effet.
 *
 * `rental.pricing.override` — « Forcer un tarif manuellement », au catalogue
 * depuis le premier jour et jusqu'ici sans emploi (Plan 02 §1.4). AUCUNE
 * capacité nouvelle n'a été créée pour A-5 : le catalogue se corrige au lieu de
 * s'allonger.
 *
 * 🟥 AUCUN BARÈME DE PÉNALITÉ. A-7 n'est pas tranchée : le montant est SAISI et
 * motivé, aucun pourcentage n'est proposé, aucune majoration n'est calculée
 * (Plan 02 §3.1, CLAUDE.md §55).
 */
export async function changeRentalRateAction(
  prevState: AmendmentFormState,
  formData: FormData
): Promise<AmendmentFormState> {
  return guarded(
    'avenant:tarif',
    async () => {
      await requirePermission(PERMISSIONS.PRICING_OVERRIDE)

      const parsed = rateChangeSchema.safeParse({
        rentalId: readText(formData, 'rentalId'),
        effectiveAt: readText(formData, 'effectiveAt'),
        amount: readText(formData, 'amount'),
        unit: readText(formData, 'unit'),
        reason: readText(formData, 'reason'),
        notes: readText(formData, 'notes'),
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const effectiveAt = fromLocalInput(parsed.data.effectiveAt)
      if (!effectiveAt) {
        return { fieldErrors: { effectiveAt: 'Cette date n’est pas valide.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('change_rental_rate', {
        p_rental_id: parsed.data.rentalId,
        p_effective_at: effectiveAt,
        p_amount: parsed.data.amount,
        p_unit: parsed.data.unit,
        p_reason: parsed.data.reason,
        p_notes: parsed.data.notes,
      })

      if (error) throw new Error(error.message)

      revalidateAmendmentSurfaces(parsed.data.rentalId, [])

      return {
        success:
          'Avenant enregistré. Le nouveau tarif s’applique à partir de la date d’effet ; l’ancien reste attaché à la période qu’il a couverte.',
      }
    },
    [
      ...ERROR_PATTERNS,
      [
        /déjà celui du contrat/i,
        'Ce tarif est déjà celui du contrat : un avenant consigne un changement, pas une confirmation.',
      ],
      [
        /strictement à l'intérieur de la période/i,
        'La date d’effet doit tomber à l’intérieur de la période en cours, sans coïncider avec son début ni sa fin.',
      ],
    ]
  )
}
