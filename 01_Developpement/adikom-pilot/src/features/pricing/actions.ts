'use server'

import { revalidatePath } from 'next/cache'

import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'
import { canAny, requirePermission, requireUser } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, readText, toFieldErrors, type FormState } from '@/lib/server-action'
import { pricingRuleSchema } from './schema'
import { resolvePrice, type ResolvedPrice } from './data'

/**
 * Actions de la tarification.
 *
 * Un tarif peut être géré depuis deux endroits — l'écran Tarification et
 * l'onglet Tarification d'un client — et relève donc de deux permissions
 * possibles. La vérification les accepte l'une ou l'autre, mais toujours côté
 * serveur : l'écran d'où vient l'appel n'entre pas dans la décision.
 *
 * Un tarif ne se supprime jamais : il se désactive ou expire, pour qu'une
 * opération passée puisse continuer à désigner la règle qui lui a été appliquée
 * (03_Modules/04_Tiers.md §6.7).
 */

export type PricingFormState = FormState & { createdId?: string }

/** Permissions acceptées selon la portée de la règle. */
function requiredPermissions(hasClient: boolean, mode: 'create' | 'update'): PermissionCode[] {
  const base: PermissionCode[] =
    mode === 'create' ? [PERMISSIONS.PRICING_CREATE] : [PERMISSIONS.PRICING_UPDATE]

  return hasClient ? [...base, PERMISSIONS.CLIENTS_PRICING_MANAGE] : base
}

async function ensureAllowed(hasClient: boolean, mode: 'create' | 'update'): Promise<boolean> {
  const actor = await requireUser()
  if (actor.isSuperAdmin) return true
  return canAny(requiredPermissions(hasClient, mode))
}

function readRule(formData: FormData) {
  return {
    scope: readText(formData, 'scope'),
    clientId: readText(formData, 'clientId'),
    vehicleId: readText(formData, 'vehicleId'),
    categoryId: readText(formData, 'categoryId'),
    mode: readText(formData, 'mode'),
    amount: readText(formData, 'amount'),
    unit: readText(formData, 'unit'),
    discountPercent: readText(formData, 'discountPercent'),
    validFrom: readText(formData, 'validFrom'),
    validTo: readText(formData, 'validTo'),
    conditions: readText(formData, 'conditions'),
    isActive: readText(formData, 'isActive') !== '0',
  }
}

/** Chemins à rafraîchir : un tarif se lit depuis deux écrans. */
function revalidatePricing(clientId: string | null) {
  revalidatePath('/location/tarification')
  if (clientId) revalidatePath(`/tiers/clients/${clientId}`)
}

/* -------------------------------------------------------------------------- */
/*  Création                                                                   */
/* -------------------------------------------------------------------------- */

export async function createPricingRuleAction(
  prevState: PricingFormState,
  formData: FormData
): Promise<PricingFormState> {
  return guarded('tarification:création', () => createPricingRuleInner(formData))
}

async function createPricingRuleInner(formData: FormData): Promise<PricingFormState> {
  const parsed = pricingRuleSchema.safeParse(readRule(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const rule = parsed.data

  if (!(await ensureAllowed(Boolean(rule.clientId), 'create'))) {
    return { error: 'Vous ne disposez pas des droits nécessaires pour créer un tarif.' }
  }

  const actor = await requireUser()
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('pricing_rules')
    .insert({
      client_id: rule.clientId,
      vehicle_id: rule.vehicleId,
      category_id: rule.categoryId,
      amount: rule.amount,
      unit: rule.unit,
      discount_percent: rule.discountPercent,
      valid_from: rule.validFrom,
      valid_to: rule.validTo,
      conditions: rule.conditions,
      is_active: rule.isActive,
      created_by: actor.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePricing(rule.clientId)
  return { success: 'Le tarif a été enregistré.', createdId: data.id }
}

/* -------------------------------------------------------------------------- */
/*  Modification                                                               */
/* -------------------------------------------------------------------------- */

export async function updatePricingRuleAction(
  prevState: PricingFormState,
  formData: FormData
): Promise<PricingFormState> {
  return guarded('tarification:modification', () => updatePricingRuleInner(formData))
}

async function updatePricingRuleInner(formData: FormData): Promise<PricingFormState> {
  const ruleId = readText(formData, 'ruleId')
  if (!ruleId) return { error: 'Tarif introuvable.' }

  const parsed = pricingRuleSchema.safeParse(readRule(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const rule = parsed.data

  if (!(await ensureAllowed(Boolean(rule.clientId), 'update'))) {
    return { error: 'Vous ne disposez pas des droits nécessaires pour modifier un tarif.' }
  }

  const supabase = await createSupabaseServerClient()

  const { error } = await supabase
    .from('pricing_rules')
    .update({
      client_id: rule.clientId,
      vehicle_id: rule.vehicleId,
      category_id: rule.categoryId,
      amount: rule.amount,
      unit: rule.unit,
      discount_percent: rule.discountPercent,
      valid_from: rule.validFrom,
      valid_to: rule.validTo,
      conditions: rule.conditions,
      is_active: rule.isActive,
    })
    .eq('id', ruleId)

  if (error) throw new Error(error.message)

  revalidatePricing(rule.clientId)
  return { success: 'Le tarif a été mis à jour.' }
}

/* -------------------------------------------------------------------------- */
/*  Activation / désactivation                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Désactive ou réactive un tarif.
 *
 * Une condition désactivée cesse d'être candidate à la résolution sans
 * disparaître : les opérations passées qui l'ont utilisée restent explicables
 * (Tiers §6.7, Module 05 §21).
 */
export async function togglePricingRuleAction(
  prevState: PricingFormState,
  formData: FormData
): Promise<PricingFormState> {
  return guarded('tarification:activation', () => togglePricingRuleInner(formData))
}

async function togglePricingRuleInner(formData: FormData): Promise<PricingFormState> {
  const ruleId = readText(formData, 'ruleId')
  const clientId = readText(formData, 'clientId') || null
  const activate = readText(formData, 'activate') === '1'

  if (!ruleId) return { error: 'Tarif introuvable.' }

  if (!(await ensureAllowed(Boolean(clientId), 'update'))) {
    return { error: 'Vous ne disposez pas des droits nécessaires pour modifier un tarif.' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('pricing_rules')
    .update({ is_active: activate })
    .eq('id', ruleId)

  if (error) throw new Error(error.message)

  revalidatePricing(clientId)
  return { success: activate ? 'Le tarif a été réactivé.' : 'Le tarif a été désactivé.' }
}

/* -------------------------------------------------------------------------- */
/*  Simulation                                                                 */
/* -------------------------------------------------------------------------- */

export type SimulationState = FormState & {
  resolved?: ResolvedPrice | null
  /** Rappel des paramètres, pour que le résultat reste lisible après envoi. */
  clientId?: string
  vehicleId?: string
  on?: string
}

/**
 * « Quel tarif s'appliquerait ? »
 *
 * Interroge le résolveur central, exactement comme le fera la création d'une
 * réservation à l'Étape 2.3. C'est l'intérêt de l'écran : vérifier la règle
 * avant qu'un montant réel n'en dépende, et pouvoir expliquer POURQUOI ce
 * tarif s'applique (Workflow 02 §8).
 *
 * `resolved: null` signifie « aucun tarif configuré » — un cas explicite, jamais
 * un montant supposé (DEC-008).
 */
export async function simulatePriceAction(
  prevState: SimulationState,
  formData: FormData
): Promise<SimulationState> {
  return guarded('tarification:simulation', async () => {
    await requirePermission(PERMISSIONS.PRICING_VIEW)

    const clientId = readText(formData, 'clientId') || null
    const vehicleId = readText(formData, 'vehicleId')
    const on = readText(formData, 'on') || undefined

    if (!vehicleId) {
      return { fieldErrors: { vehicleId: 'Choisissez un véhicule.' } }
    }

    const resolved = await resolvePrice(clientId, vehicleId, on)

    return {
      resolved,
      clientId: clientId ?? undefined,
      vehicleId,
      on,
    }
  })
}
