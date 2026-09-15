'use server'

import { revalidatePath } from 'next/cache'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, readText, toFieldErrors, type FormState } from '@/lib/server-action'
import {
  supplierRateConditionsSchema,
  supplierRateRetireSchema,
  supplierRateSchema,
} from './schema'

/**
 * Actions des tarifs fournisseurs — LOT 21, DEC-044.
 *
 * CHAQUE ACTION COMMENCE PAR SA CAPACITÉ, et par la sienne seule :
 *
 *   · ouvrir une version de coût   → `rental.pricing.supplier.create`
 *   · retirer une version          → `rental.pricing.supplier.update`
 *   · corriger les conditions      → `rental.pricing.supplier.update`
 *
 * Aucune n'ouvre l'autre (DEC-024, A-14), et `rental.pricing.view` n'en ouvre
 * aucune : gérer le barème client n'a jamais supposé de connaître ce qu'ADIKOM
 * paie. La vérification côté serveur n'est pas la seule — la base oppose les
 * mêmes refus à un appel direct : policies, `fn_supplier_vehicle_rate_guard`,
 * `require_capability`. Masquer un bouton ne protège rien (CLAUDE.md §19).
 *
 * LES VERSIONS NE SONT JAMAIS ÉCRITES D'ICI PAR UN `insert` : elles passent par
 * `set_supplier_vehicle_rate`, qui clôt la version courante et ouvre la nouvelle
 * dans une même transaction (D16(a)). Un écran ne saurait pas garantir cet
 * enchaînement.
 */

export type SupplierRateFormState = FormState

/**
 * Messages fonctionnels des refus que la base oppose.
 *
 * Sans eux, l'utilisateur lirait « violates exclusion constraint » — technique,
 * inutile, et révélateur de la structure interne (CLAUDE.md §43).
 */
const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /supplier_vehicle_rates_no_overlap/,
    'Cette période chevauche une autre version de coût en vigueur pour ce véhicule. À une date donnée, un véhicule n’a qu’un seul coût d’acquisition.',
  ],
  [
    /supplier_vehicle_rates_period/,
    'La date de fin d’une version ne peut pas précéder sa date de début.',
  ],
  [
    /supplier_vehicle_rates_amount_check/,
    'Un coût d’acquisition doit être strictement positif.',
  ],
]

function readRate(formData: FormData) {
  return {
    vehicleId: readText(formData, 'vehicleId'),
    supplierId: readText(formData, 'supplierId'),
    amount: readText(formData, 'amount'),
    unit: readText(formData, 'unit'),
    validFrom: readText(formData, 'validFrom'),
    conditions: readText(formData, 'conditions'),
    reason: readText(formData, 'reason'),
  }
}

/**
 * Les écrans que ce lot alimente.
 *
 * Le coût se lit à trois endroits — l'écran dédié, la fiche du véhicule, le
 * contrat de location. Une version ouverte depuis l'un doit se voir depuis les
 * autres : la revalidation les nomme tous plutôt que de supposer d'où vient
 * l'appel.
 */
function revalidateRateSurfaces(vehicleId: string) {
  revalidatePath('/location/tarifs-fournisseurs')
  if (vehicleId) revalidatePath(`/location/parc/${vehicleId}`)
  revalidatePath('/location/locations', 'layout')
}

/**
 * Ouvre une version de COÛT D'ACQUISITION.
 *
 * L'ancienne version n'est pas réécrite : elle est close la veille de la date
 * d'effet. Une location commencée avant cette date continue donc de relever de
 * l'ancien coût — c'est exactement l'exigence de la Direction : « le changement
 * du tarif fournisseur ne doit pas modifier rétroactivement les anciennes
 * locations » (D16(a), (e)).
 */
export async function setSupplierRateAction(
  prevState: SupplierRateFormState,
  formData: FormData
): Promise<SupplierRateFormState> {
  return guarded(
    'tarif-fournisseur:ouverture',
    async () => {
      await requirePermission(PERMISSIONS.PRICING_SUPPLIER_CREATE)

      const parsed = supplierRateSchema.safeParse(readRate(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('set_supplier_vehicle_rate', {
        p_vehicle_id: parsed.data.vehicleId,
        p_supplier_id: parsed.data.supplierId,
        p_amount: parsed.data.amount,
        p_unit: parsed.data.unit,
        p_valid_from: parsed.data.validFrom,
        p_conditions: parsed.data.conditions,
        p_reason: parsed.data.reason,
      })

      if (error) throw new Error(error.message)

      revalidateRateSurfaces(parsed.data.vehicleId)
      return {
        success:
          'Le nouveau coût d’acquisition est enregistré. L’ancien reste historisé, et les locations antérieures ne sont pas retarifées.',
      }
    },
    ERROR_PATTERNS
  )
}

/**
 * Retire une version de coût — elle ne se supprime jamais (D16).
 *
 * `rental.pricing.supplier.update`, et non `create` : retirer un coût sans
 * qu'aucun autre ne le remplace change ce qui s'applique, et laisse le véhicule
 * sans coût connu à cette date. C'est un acte à part (DEC-024).
 *
 * Le motif du retrait est enregistré à part de celui du changement de tarif : un
 * motif ne se réécrit pas après coup (migration 069).
 */
export async function retireSupplierRateAction(
  prevState: SupplierRateFormState,
  formData: FormData
): Promise<SupplierRateFormState> {
  return guarded(
    'tarif-fournisseur:retrait',
    async () => {
      await requirePermission(PERMISSIONS.PRICING_SUPPLIER_UPDATE)

      const parsed = supplierRateRetireSchema.safeParse({
        rateId: readText(formData, 'rateId'),
        reason: readText(formData, 'reason'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('deactivate_supplier_vehicle_rate', {
        p_rate_id: parsed.data.rateId,
        p_reason: parsed.data.reason,
      })

      if (error) throw new Error(error.message)

      revalidateRateSurfaces(readText(formData, 'vehicleId'))
      return {
        success: 'La version a été retirée. Elle reste consultable dans l’historique.',
      }
    },
    ERROR_PATTERNS
  )
}

/**
 * Corrige les CONDITIONS ÉCRITES d'une version — et rien d'autre.
 *
 * Le montant, l'unité, la date d'effet et le motif d'origine ne se réécrivent
 * pas : `fn_supplier_vehicle_rate_guard` les refuse, y compris en appel direct.
 * Ce qui se corrige ici, ce sont les conditions négociées que A-1 demande de
 * consigner — « personne distinguée, agence demandant un ajustement, contrat
 * longue durée spécial » (Plan 02 §2.3).
 */
export async function updateSupplierRateConditionsAction(
  prevState: SupplierRateFormState,
  formData: FormData
): Promise<SupplierRateFormState> {
  return guarded(
    'tarif-fournisseur:conditions',
    async () => {
      await requirePermission(PERMISSIONS.PRICING_SUPPLIER_UPDATE)

      const parsed = supplierRateConditionsSchema.safeParse({
        rateId: readText(formData, 'rateId'),
        conditions: readText(formData, 'conditions'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase
        .from('supplier_vehicle_rates')
        .update({ conditions: parsed.data.conditions })
        .eq('id', parsed.data.rateId)
        .select('id')

      if (error) throw new Error(error.message)

      /*
       * L'EFFET, PAS L'INTENTION (leçon DEC-046).
       *
       * Une policy manquante rendrait zéro ligne modifiée SANS lever d'erreur, et
       * l'utilisateur croirait sa correction enregistrée.
       */
      if ((data ?? []).length === 0) {
        return {
          error:
            'Cette version de coût est introuvable, ou hors de portée de votre compte. Rien n’a été modifié.',
        }
      }

      revalidateRateSurfaces(readText(formData, 'vehicleId'))
      return { success: 'Les conditions ont été mises à jour.' }
    },
    ERROR_PATTERNS
  )
}
