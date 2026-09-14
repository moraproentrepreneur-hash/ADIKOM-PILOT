'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, readText, toFieldErrors, type FormState } from '@/lib/server-action'
import {
  serviceCategorySchema,
  servicePriceSchema,
  serviceSchema,
  serviceStatusSchema,
  serviceVariantSchema,
} from './schema'

/**
 * Actions du catalogue de services — LOT 20, DEC-043.
 *
 * CHAQUE ACTION COMMENCE PAR SA CAPACITÉ, et par la sienne seule :
 *
 *   · créer un service                → `catalog.services.create`
 *   · modifier une fiche              → `catalog.services.update`
 *   · changer un statut               → `catalog.services.archive`
 *   · ouvrir une version de prix      → `catalog.services.price.update`
 *   · saisir un prix d'achat          → `catalog.services.cost.update`
 *
 * Aucune n'ouvre l'autre (DEC-024, A-14). Et la vérification côté serveur n'est
 * pas la seule : la base oppose les mêmes refus à un appel direct — policies,
 * `fn_service_write_guard`, `fn_service_price_scope`, `require_capability`.
 * Masquer un bouton ne protège rien (CLAUDE.md §19).
 *
 * LES VERSIONS DE PRIX NE SONT JAMAIS ÉCRITES D'ICI PAR UN `insert` : elles
 * passent par `set_service_price` / `set_service_cost`, qui closent la version
 * courante et ouvrent la nouvelle dans une même transaction (D16(a)). Un écran
 * ne saurait pas garantir cet enchaînement.
 */

export type CatalogFormState = FormState & { createdId?: string }

/**
 * Messages fonctionnels des refus que la base oppose.
 *
 * Sans eux, l'utilisateur lirait « violates exclusion constraint » — technique,
 * inutile, et révélateur de la structure interne (CLAUDE.md §43).
 */
const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /service_variant_(prices|costs)_no_overlap/,
    'Cette période chevauche une autre version de prix en vigueur pour cette variante.',
  ],
  [
    /services_label_unique_idx/,
    'Un service portant ce libellé existe déjà dans cette catégorie.',
  ],
  [
    /service_categories_label_unique_idx|service_categories_code_key/,
    'Une catégorie portant ce code ou ce libellé existe déjà.',
  ],
  [
    /service_variants_label_unique/,
    'Une variante portant ce libellé existe déjà pour ce service.',
  ],
  [/service_variants_sku_idx/, 'Cette référence de variante est déjà utilisée.'],
]

/* -------------------------------------------------------------------------- */
/*  Catégories                                                                 */
/* -------------------------------------------------------------------------- */

function readCategory(formData: FormData) {
  return {
    code: readText(formData, 'code'),
    label: readText(formData, 'label'),
    description: readText(formData, 'description'),
    displayOrder: readText(formData, 'displayOrder'),
  }
}

export async function createServiceCategoryAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded(
    'catalogue:catégorie:création',
    async () => {
      const actor = await requirePermission(PERMISSIONS.SERVICE_CATEGORIES_CREATE)

      const parsed = serviceCategorySchema.safeParse(readCategory(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.from('service_categories').insert({
        code: parsed.data.code,
        label: parsed.data.label,
        description: parsed.data.description,
        display_order: parsed.data.displayOrder,
        created_by: actor.id,
        updated_by: actor.id,
      })

      if (error) throw new Error(error.message)

      revalidatePath('/catalogue/categories')
      return { success: 'La catégorie a été créée.' }
    },
    ERROR_PATTERNS
  )
}

export async function updateServiceCategoryAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded(
    'catalogue:catégorie:modification',
    async () => {
      await requirePermission(PERMISSIONS.SERVICE_CATEGORIES_UPDATE)

      const categoryId = readText(formData, 'categoryId')
      if (!categoryId) return { error: 'Catégorie introuvable.' }

      const parsed = serviceCategorySchema.safeParse(readCategory(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase
        .from('service_categories')
        .update({
          code: parsed.data.code,
          label: parsed.data.label,
          description: parsed.data.description,
          display_order: parsed.data.displayOrder,
        })
        .eq('id', categoryId)

      if (error) throw new Error(error.message)

      revalidatePath('/catalogue/categories')
      return { success: 'La catégorie a été mise à jour.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Archiver une catégorie, ou la réactiver.
 *
 * Capacité DISTINCTE de la modification (DEC-024) : retirer une catégorie du
 * catalogue engage le classement de tout ce qui s'y rattache, corriger sa
 * description n'engage rien. Le déclencheur
 * `fn_service_category_write_guard` l'exige aussi en base.
 */
export async function toggleServiceCategoryAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded(
    'catalogue:catégorie:archivage',
    async () => {
      await requirePermission(PERMISSIONS.SERVICE_CATEGORIES_ARCHIVE)

      const categoryId = readText(formData, 'categoryId')
      const activate = readText(formData, 'activate') === '1'
      if (!categoryId) return { error: 'Catégorie introuvable.' }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase
        .from('service_categories')
        .update({ is_active: activate })
        .eq('id', categoryId)

      if (error) throw new Error(error.message)

      revalidatePath('/catalogue/categories')
      revalidatePath('/catalogue/services')
      return {
        success: activate ? 'La catégorie a été réactivée.' : 'La catégorie a été archivée.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Services                                                                   */
/* -------------------------------------------------------------------------- */

function readService(formData: FormData) {
  return {
    label: readText(formData, 'label'),
    categoryId: readText(formData, 'categoryId'),
    purpose: readText(formData, 'purpose'),
    unitLabel: readText(formData, 'unitLabel'),
    description: readText(formData, 'description'),
    notes: readText(formData, 'notes'),
  }
}

export async function createServiceAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded('catalogue:service:création', () => createServiceInner(formData), ERROR_PATTERNS)
}

async function createServiceInner(formData: FormData): Promise<CatalogFormState> {
  const actor = await requirePermission(PERMISSIONS.SERVICES_CREATE)

  const parsed = serviceSchema.safeParse(readService(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const supabase = await createSupabaseServerClient()

  // Numérotation atomique côté serveur : aucun format codé en dur (DEC-005).
  const { data: serviceNo, error: numberError } = await supabase.rpc('next_number', {
    p_entity_key: 'service',
  })

  if (numberError || !serviceNo) {
    return { error: 'L’identifiant du service n’a pas pu être attribué. Réessayez.' }
  }

  const { data, error } = await supabase
    .from('services')
    .insert({
      service_no: serviceNo,
      label: parsed.data.label,
      category_id: parsed.data.categoryId,
      purpose: parsed.data.purpose,
      unit_label: parsed.data.unitLabel,
      description: parsed.data.description,
      notes: parsed.data.notes,
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/catalogue/services')
  // La variante « Standard » est posée par la base : le service n'est jamais
  // sans variante, et la fiche s'ouvre déjà tarifable.
  redirect(`/catalogue/services/${data.id}?cree=1`)
}

export async function updateServiceAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded('catalogue:service:modification', () => updateServiceInner(formData), ERROR_PATTERNS)
}

async function updateServiceInner(formData: FormData): Promise<CatalogFormState> {
  await requirePermission(PERMISSIONS.SERVICES_UPDATE)

  const serviceId = readText(formData, 'serviceId')
  if (!serviceId) return { error: 'Service introuvable.' }

  const parsed = serviceSchema.safeParse(readService(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('services')
    .update({
      label: parsed.data.label,
      category_id: parsed.data.categoryId,
      purpose: parsed.data.purpose,
      unit_label: parsed.data.unitLabel,
      description: parsed.data.description,
      notes: parsed.data.notes,
    })
    .eq('id', serviceId)

  if (error) throw new Error(error.message)

  revalidatePath('/catalogue/services')
  revalidatePath(`/catalogue/services/${serviceId}`)
  redirect(`/catalogue/services/${serviceId}?enregistre=1`)
}

/**
 * Activer, suspendre ou archiver un service.
 *
 * `catalog.services.archive`, et non `update` : retirer une prestation du
 * catalogue est un acte commercial, corriger sa description ne l'est pas
 * (DEC-024).
 */
export async function setServiceStatusAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded(
    'catalogue:service:statut',
    async () => {
      await requirePermission(PERMISSIONS.SERVICES_ARCHIVE)

      const serviceId = readText(formData, 'serviceId')
      if (!serviceId) return { error: 'Service introuvable.' }

      const parsed = serviceStatusSchema.safeParse({ status: readText(formData, 'status') })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const reason = readText(formData, 'reason').trim() || null
      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('services')
        .update({ status: parsed.data.status })
        .eq('id', serviceId)

      if (error) throw new Error(error.message)

      // Le changement est déjà journalisé par le déclencheur (STATUS_CHANGE) ;
      // le motif est ajouté comme événement distinct, afin qu'il reste lisible
      // sans dépendre du diff de la ligne — comme pour les clients.
      if (reason) {
        await supabase.rpc('log_audit', {
          p_action: 'STATUS_CHANGE',
          p_entity_type: 'services',
          p_entity_id: serviceId,
          p_module_code: 'catalog',
          p_reason: reason,
        })
      }

      revalidatePath('/catalogue/services')
      revalidatePath(`/catalogue/services/${serviceId}`)
      return { success: 'Le statut du service a été mis à jour.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Variantes                                                                  */
/* -------------------------------------------------------------------------- */

export async function createServiceVariantAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded(
    'catalogue:variante:création',
    async () => {
      const actor = await requirePermission(PERMISSIONS.SERVICES_UPDATE)

      const serviceId = readText(formData, 'serviceId')
      if (!serviceId) return { error: 'Service introuvable.' }

      const parsed = serviceVariantSchema.safeParse({
        label: readText(formData, 'label'),
        sku: readText(formData, 'sku'),
        displayOrder: readText(formData, 'displayOrder'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.from('service_variants').insert({
        service_id: serviceId,
        label: parsed.data.label,
        sku: parsed.data.sku,
        display_order: parsed.data.displayOrder,
        created_by: actor.id,
        updated_by: actor.id,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/catalogue/services/${serviceId}`)
      return { success: 'La variante a été ajoutée.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Désigner la variante par défaut, ou activer / désactiver une variante.
 *
 * La bascule de l'ancienne variante par défaut est faite EN BASE
 * (`fn_service_variant_default_guard`) : deux écrans ne peuvent donc pas en
 * décider différemment, et une variante par défaut désactivée est refusée.
 */
export async function updateServiceVariantAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded(
    'catalogue:variante:modification',
    async () => {
      await requirePermission(PERMISSIONS.SERVICES_UPDATE)

      const variantId = readText(formData, 'variantId')
      const serviceId = readText(formData, 'serviceId')
      if (!variantId || !serviceId) return { error: 'Variante introuvable.' }

      const supabase = await createSupabaseServerClient()

      const patch: Record<string, unknown> = {}
      if (readText(formData, 'setDefault') === '1') patch.is_default = true
      if (readText(formData, 'activate')) patch.is_active = readText(formData, 'activate') === '1'

      if (Object.keys(patch).length === 0) return { error: 'Aucune modification demandée.' }

      const { error } = await supabase.from('service_variants').update(patch).eq('id', variantId)
      if (error) throw new Error(error.message)

      revalidatePath(`/catalogue/services/${serviceId}`)
      return { success: 'La variante a été mise à jour.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Versions de prix — D16                                                     */
/* -------------------------------------------------------------------------- */

function readPrice(formData: FormData) {
  return {
    variantId: readText(formData, 'variantId'),
    amount: readText(formData, 'amount'),
    validFrom: readText(formData, 'validFrom'),
    reason: readText(formData, 'reason'),
  }
}

/**
 * Ouvre une version de PRIX DE VENTE.
 *
 * L'ancienne version n'est pas réécrite : elle est close la veille de la date
 * d'effet. Une opération datée d'avant cette date continue donc de relever de
 * l'ancien prix — c'est exactement l'exigence de la Direction (D16(a), (e)).
 */
export async function setServicePriceAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded(
    'catalogue:prix-de-vente',
    async () => {
      await requirePermission(PERMISSIONS.SERVICES_PRICE_UPDATE)

      const parsed = servicePriceSchema.safeParse(readPrice(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const serviceId = readText(formData, 'serviceId')
      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('set_service_price', {
        p_variant_id: parsed.data.variantId,
        p_amount: parsed.data.amount,
        p_valid_from: parsed.data.validFrom,
        p_reason: parsed.data.reason,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/catalogue/services/${serviceId}`)
      return { success: 'Le nouveau prix de vente est enregistré. L’ancien reste historisé.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Ouvre une version de PRIX D'ACHAT.
 *
 * `catalog.services.cost.update` — jamais `price.update`, jamais `update` :
 * saisir ce qu'ADIKOM paie est un acte à part (DEC-043 §e).
 */
export async function setServiceCostAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded(
    'catalogue:prix-d-achat',
    async () => {
      await requirePermission(PERMISSIONS.SERVICES_COST_UPDATE)

      const parsed = servicePriceSchema.safeParse(readPrice(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const serviceId = readText(formData, 'serviceId')
      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('set_service_cost', {
        p_variant_id: parsed.data.variantId,
        p_amount: parsed.data.amount,
        p_valid_from: parsed.data.validFrom,
        p_reason: parsed.data.reason,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/catalogue/services/${serviceId}`)
      return { success: 'Le nouveau prix d’achat est enregistré. L’ancien reste historisé.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Retire une version de prix — elle ne se supprime jamais (D16).
 *
 * Le motif du retrait est enregistré à part de celui du changement de prix : un
 * motif ne se réécrit pas après coup (migration 069).
 */
export async function deactivatePriceVersionAction(
  prevState: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  return guarded(
    'catalogue:retrait-de-version',
    async () => {
      const kind = readText(formData, 'kind')
      const isCost = kind === 'COST'

      await requirePermission(
        isCost ? PERMISSIONS.SERVICES_COST_UPDATE : PERMISSIONS.SERVICES_PRICE_UPDATE
      )

      const versionId = readText(formData, 'versionId')
      const serviceId = readText(formData, 'serviceId')
      if (!versionId) return { error: 'Version introuvable.' }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc(
        isCost ? 'deactivate_service_cost' : 'deactivate_service_price',
        {
          ...(isCost ? { p_cost_id: versionId } : { p_price_id: versionId }),
          p_reason: readText(formData, 'reason') || null,
        }
      )

      if (error) throw new Error(error.message)

      revalidatePath(`/catalogue/services/${serviceId}`)
      return { success: 'La version a été retirée. Elle reste consultable dans l’historique.' }
    },
    ERROR_PATTERNS
  )
}
