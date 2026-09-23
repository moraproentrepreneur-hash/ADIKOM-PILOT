'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { canAny, requirePermission, requireSession } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'
import type { OrderStatus, QuoteStatus } from './constants'

/**
 * Actions du commerce client — LOT 25, DEC-049.
 *
 * CINQ COUCHES, PAS UNE.
 *
 * Ces gardes serveur sont la PREMIÈRE. Elles ne sont ni la seule ni la
 * dernière : les fonctions atomiques revérifient la capacité, les déclencheurs
 * imposent les transitions et figent ce qui doit l'être, RLS refuse l'écriture,
 * et un déclencheur d'INSERT empêche un devis de naître émis. Un appel direct à
 * PostgREST ne rencontre AUCUNE ligne de ce fichier — d'où les quatre autres.
 *
 * DIX CAPACITÉS, DIX ACTES
 *
 *   `commerce.sales_quotes.create`    préparer un devis, lui ajouter une ligne
 *   `commerce.sales_quotes.update`    le corriger, retirer une ligne
 *   `commerce.sales_quotes.validate`  l'émettre, enregistrer la réponse du client
 *   `commerce.sales_quotes.cancel`    le retirer
 *   `commerce.sales_quotes.view`      le consulter
 *   … et les cinq mêmes pour la commande.
 *
 * Aucune n'est impliquée par une autre (DEC-024).
 *
 * CE QUE CES ACTIONS NE FONT JAMAIS
 *
 * Aucun encaissement, aucun mouvement de compte, aucune écriture de trésorerie.
 * Facturer une commande prépare une facture EN BROUILLON par la chaîne
 * existante ; l'émettre reste un acte distinct, sous
 * `billing.customer_invoices.issue`, depuis l'écran de facturation.
 */

export type CommerceFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /le prix d'une ligne de catalogue vient du catalogue/i,
    'Le prix d’une ligne de catalogue vient du catalogue, à la date du document. Pour un montant choisi, ajoutez une ligne libre.',
  ],
  [
    /aucun prix de vente n'est en vigueur/i,
    'Aucun prix de vente n’est en vigueur à cette date pour la prestation choisie. Renseignez-le au catalogue avant de l’ajouter.',
  ],
  [
    /les lignes d'un devis émis sont figées/i,
    'Les lignes d’un devis émis sont figées : le prix remis au client ne se réécrit pas.',
  ],
  [
    /les lignes d'une commande confirmée sont figées/i,
    'Les lignes d’une commande confirmée sont figées : l’engagement pris ne se réécrit pas.',
  ],
  [
    /un devis émis ne se réécrit plus/i,
    'Ce devis a été remis au client : son client, sa date et sa validité ne se modifient plus.',
  ],
  [
    /une commande confirmée ne se réécrit plus/i,
    'Cette commande est confirmée : son client, son origine et sa date ne se modifient plus.',
  ],
  [
    /seul un devis en brouillon se modifie/i,
    'Seul un devis en brouillon se modifie.',
  ],
  [
    /seule une commande en brouillon se modifie/i,
    'Seule une commande en brouillon se modifie.',
  ],
  [
    /ce devis est déjà converti|un devis ne produit pas deux commandes/i,
    'Ce devis a déjà produit une commande. Un devis ne se convertit qu’une fois.',
  ],
  [
    /seul un devis accepté se convertit/i,
    'Seul un devis accepté se convertit en commande. Enregistrez d’abord la réponse du client.',
  ],
  [
    /cette commande est déjà facturée|une commande ne se facture pas deux fois/i,
    'Cette commande est déjà facturée. Une commande ne se facture pas deux fois.',
  ],
  [
    /seule une commande confirmée ou livrée se facture/i,
    'Seule une commande confirmée ou livrée se facture. Confirmez-la d’abord.',
  ],
  [
    /ne porte aucune ligne/i,
    'Ce document ne porte aucune ligne active : un total est nécessaire.',
  ],
  [
    /transition de devis refusée|transition de commande refusée/i,
    'Cet état n’est pas atteignable depuis l’état actuel du document.',
  ],
  [
    /« converti » n'est pas un statut qui se déclare/i,
    '« Converti » ne se déclare pas : il résulte de la création de la commande.',
  ],
  [
    /« facturée » n'est pas un statut qui se déclare/i,
    '« Facturée » ne se déclare pas : elle résulte de la préparation d’une facture.',
  ],
  [
    /est déjà «/i,
    'Ce document est déjà dans cet état.',
  ],
  [
    /n'est pas lisible avec vos droits/i,
    'Certaines informations nécessaires à cette opération ne sont pas accessibles avec vos droits.',
  ],
  [
    /Droit insuffisant pour cette opération/i,
    'Vous ne disposez pas de la capacité exacte requise pour cette opération.',
  ],
]

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez une date valide.')

/** Saisie → entier strictement positif (DEC-010 : jamais un flottant). */
function toInteger(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, '')
  if (cleaned === '' || !/^\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/* ========================================================================== */
/*  DEVIS                                                                      */
/* ========================================================================== */

const createQuoteSchema = z.object({
  clientId: z.string().uuid('Choisissez le client du devis.'),
  quoteDate: dateSchema,
})

export async function createSalesQuoteAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'devis client:création',
    async () => {
      await requirePermission(PERMISSIONS.SALES_QUOTES_CREATE)

      const parsed = createQuoteSchema.safeParse({
        clientId: readText(formData, 'clientId'),
        quoteDate: readText(formData, 'quoteDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const validUntil = orNull(readText(formData, 'validUntil'))
      if (validUntil && validUntil < parsed.data.quoteDate) {
        return {
          fieldErrors: { validUntil: 'La validité ne peut pas précéder la date du devis.' },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('create_sales_quote', {
        p_client_id: parsed.data.clientId,
        p_quote_date: parsed.data.quoteDate,
        p_valid_until: validUntil,
        p_notes: orNull(readText(formData, 'notes')),
        p_terms: orNull(readText(formData, 'terms')),
      })

      if (error) throw new Error(error.message)

      revalidatePath('/commerce/devis')
      redirect(`/commerce/devis/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

export async function updateSalesQuoteAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'devis client:modification',
    async () => {
      await requirePermission(PERMISSIONS.SALES_QUOTES_UPDATE)

      const quoteId = readText(formData, 'quoteId')
      if (!quoteId) return { error: 'Devis introuvable.' }

      const parsed = z.object({ quoteDate: dateSchema }).safeParse({
        quoteDate: readText(formData, 'quoteDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const validUntil = orNull(readText(formData, 'validUntil'))
      if (validUntil && validUntil < parsed.data.quoteDate) {
        return {
          fieldErrors: { validUntil: 'La validité ne peut pas précéder la date du devis.' },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('update_sales_quote', {
        p_quote_id: quoteId,
        p_quote_date: parsed.data.quoteDate,
        p_valid_until: validUntil,
        p_notes: orNull(readText(formData, 'notes')),
        p_terms: orNull(readText(formData, 'terms')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/devis/${quoteId}`)
      revalidatePath('/commerce/devis')

      return { success: 'Le devis a été modifié.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Ajouter une ligne — les DEUX types de A-13, par une seule action.
 *
 * Le formulaire porte `variantId` (ligne catalogue) OU `label` + `unitPrice`
 * (ligne libre). C'est la FONCTION SQL qui tranche, et elle seule : le prix
 * d'une ligne de catalogue y est RÉSOLU à la date du document, jamais transmis
 * d'ici. Un prix envoyé avec une variante est refusé par la base.
 */
export async function addQuoteLineAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'devis client:ligne',
    async () => {
      /*
       * `create` OU `update` : ajouter une ligne appartient à la SAISIE du
       * devis. Celui qui le prépare doit pouvoir le garnir sans détenir en
       * plus le droit de modifier un devis existant.
       */
      await requireSession()
      const maySave = await canAny([
        PERMISSIONS.SALES_QUOTES_CREATE,
        PERMISSIONS.SALES_QUOTES_UPDATE,
      ])
      if (!maySave) return { error: 'Droit insuffisant pour cette opération.' }

      const quoteId = readText(formData, 'quoteId')
      if (!quoteId) return { error: 'Devis introuvable.' }

      const quantity = toInteger(readText(formData, 'quantity'))
      if (quantity === null) {
        return { fieldErrors: { quantity: 'Indiquez une quantité entière supérieure à zéro.' } }
      }

      const variantId = orNull(readText(formData, 'variantId'))
      const label = orNull(readText(formData, 'label'))
      const rawPrice = readText(formData, 'unitPrice')

      let unitPrice: number | null = null
      if (!variantId) {
        if (!label) {
          return { fieldErrors: { label: 'Désignez la prestation de cette ligne libre.' } }
        }
        unitPrice = toInteger(rawPrice)
        if (unitPrice === null) {
          return {
            fieldErrors: {
              unitPrice: 'Indiquez un prix unitaire entier en KMF, supérieur à zéro.',
            },
          }
        }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('add_sales_quote_line', {
        p_quote_id: quoteId,
        p_quantity: quantity,
        p_variant_id: variantId,
        p_label: label,
        p_unit_price: unitPrice,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/devis/${quoteId}`)
      return { success: 'La ligne a été ajoutée.' }
    },
    ERROR_PATTERNS
  )
}

export async function archiveQuoteLineAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'devis client:ligne retirée',
    async () => {
      await requirePermission(PERMISSIONS.SALES_QUOTES_UPDATE)

      const lineId = readText(formData, 'lineId')
      const quoteId = readText(formData, 'quoteId')
      if (!lineId) return { error: 'Ligne introuvable.' }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('archive_sales_quote_line', { p_line_id: lineId })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/devis/${quoteId}`)
      return { success: 'La ligne a été retirée.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Faire avancer le devis, ou le retirer.
 *
 * DEUX CAPACITÉS, PAS UNE. Le statut visé décide laquelle est exigée :
 * `cancel` pour l'annulation — un acte d'ADIKOM — et `validate` pour les
 * autres — l'émission, puis la réponse du client. Le déclencheur en base
 * refait ce choix, et c'est lui qui fait autorité.
 */
export async function setQuoteStatusAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'devis client:cycle',
    async () => {
      const quoteId = readText(formData, 'quoteId')
      const status = readText(formData, 'status') as QuoteStatus
      if (!quoteId) return { error: 'Devis introuvable.' }

      const allowed: QuoteStatus[] = ['SENT', 'ACCEPTED', 'REFUSED', 'CANCELLED']
      if (!allowed.includes(status)) {
        return { error: 'Cet état ne se déclare pas depuis cet écran.' }
      }

      await requirePermission(
        status === 'CANCELLED'
          ? PERMISSIONS.SALES_QUOTES_CANCEL
          : PERMISSIONS.SALES_QUOTES_VALIDATE
      )

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('set_sales_quote_status', {
        p_quote_id: quoteId,
        p_status: status,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/devis/${quoteId}`)
      revalidatePath('/commerce/devis')

      return { success: 'L’état du devis a été enregistré.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Convertir un devis accepté en commande.
 *
 * 🟥 LA CAPACITÉ EXIGÉE EST `commerce.sales_orders.create`, et c'est la règle
 * du Plan 01 §15.5 appliquée par symétrie : l'acte est la CRÉATION DE LA
 * COMMANDE ; le passage du devis à « converti » n'en est que la conséquence.
 * Exiger en plus `commerce.sales_quotes.validate` reviendrait à demander deux
 * capacités pour un seul geste.
 */
export async function convertQuoteAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'devis client:conversion',
    async () => {
      await requirePermission(PERMISSIONS.SALES_ORDERS_CREATE)

      const quoteId = readText(formData, 'quoteId')
      if (!quoteId) return { error: 'Devis introuvable.' }

      const expectedDate = orNull(readText(formData, 'expectedDate'))

      const supabase = await createSupabaseServerClient()
      const { data, error } = await supabase.rpc('convert_sales_quote_to_order', {
        p_quote_id: quoteId,
        p_order_date: orNull(readText(formData, 'orderDate')),
        p_expected_date: expectedDate,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/devis/${quoteId}`)
      revalidatePath('/commerce/devis')
      revalidatePath('/commerce/commandes')
      redirect(`/commerce/commandes/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

/* ========================================================================== */
/*  COMMANDES                                                                  */
/* ========================================================================== */

const createOrderSchema = z.object({
  clientId: z.string().uuid('Choisissez le client de la commande.'),
  orderDate: dateSchema,
})

export async function createSalesOrderAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'commande client:création',
    async () => {
      await requirePermission(PERMISSIONS.SALES_ORDERS_CREATE)

      const parsed = createOrderSchema.safeParse({
        clientId: readText(formData, 'clientId'),
        orderDate: readText(formData, 'orderDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const expectedDate = orNull(readText(formData, 'expectedDate'))
      if (expectedDate && expectedDate < parsed.data.orderDate) {
        return {
          fieldErrors: {
            expectedDate: 'La date attendue ne peut pas précéder la date de la commande.',
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('create_sales_order', {
        p_client_id: parsed.data.clientId,
        p_order_date: parsed.data.orderDate,
        p_expected_date: expectedDate,
        p_notes: orNull(readText(formData, 'notes')),
        p_terms: orNull(readText(formData, 'terms')),
      })

      if (error) throw new Error(error.message)

      revalidatePath('/commerce/commandes')
      redirect(`/commerce/commandes/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

export async function updateSalesOrderAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'commande client:modification',
    async () => {
      await requirePermission(PERMISSIONS.SALES_ORDERS_UPDATE)

      const orderId = readText(formData, 'orderId')
      if (!orderId) return { error: 'Commande introuvable.' }

      const parsed = z.object({ orderDate: dateSchema }).safeParse({
        orderDate: readText(formData, 'orderDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const expectedDate = orNull(readText(formData, 'expectedDate'))
      if (expectedDate && expectedDate < parsed.data.orderDate) {
        return {
          fieldErrors: {
            expectedDate: 'La date attendue ne peut pas précéder la date de la commande.',
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('update_sales_order', {
        p_order_id: orderId,
        p_order_date: parsed.data.orderDate,
        p_expected_date: expectedDate,
        p_notes: orNull(readText(formData, 'notes')),
        p_terms: orNull(readText(formData, 'terms')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/commandes/${orderId}`)
      revalidatePath('/commerce/commandes')

      return { success: 'La commande a été modifiée.' }
    },
    ERROR_PATTERNS
  )
}

export async function addOrderLineAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'commande client:ligne',
    async () => {
      await requireSession()
      const maySave = await canAny([
        PERMISSIONS.SALES_ORDERS_CREATE,
        PERMISSIONS.SALES_ORDERS_UPDATE,
      ])
      if (!maySave) return { error: 'Droit insuffisant pour cette opération.' }

      const orderId = readText(formData, 'orderId')
      if (!orderId) return { error: 'Commande introuvable.' }

      const quantity = toInteger(readText(formData, 'quantity'))
      if (quantity === null) {
        return { fieldErrors: { quantity: 'Indiquez une quantité entière supérieure à zéro.' } }
      }

      const variantId = orNull(readText(formData, 'variantId'))
      const label = orNull(readText(formData, 'label'))

      let unitPrice: number | null = null
      if (!variantId) {
        if (!label) {
          return { fieldErrors: { label: 'Désignez la prestation de cette ligne libre.' } }
        }
        unitPrice = toInteger(readText(formData, 'unitPrice'))
        if (unitPrice === null) {
          return {
            fieldErrors: {
              unitPrice: 'Indiquez un prix unitaire entier en KMF, supérieur à zéro.',
            },
          }
        }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('add_sales_order_line', {
        p_order_id: orderId,
        p_quantity: quantity,
        p_variant_id: variantId,
        p_label: label,
        p_unit_price: unitPrice,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/commandes/${orderId}`)
      return { success: 'La ligne a été ajoutée.' }
    },
    ERROR_PATTERNS
  )
}

export async function archiveOrderLineAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'commande client:ligne retirée',
    async () => {
      await requirePermission(PERMISSIONS.SALES_ORDERS_UPDATE)

      const lineId = readText(formData, 'lineId')
      const orderId = readText(formData, 'orderId')
      if (!lineId) return { error: 'Ligne introuvable.' }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('archive_sales_order_line', { p_line_id: lineId })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/commandes/${orderId}`)
      return { success: 'La ligne a été retirée.' }
    },
    ERROR_PATTERNS
  )
}

export async function setOrderStatusAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'commande client:cycle',
    async () => {
      const orderId = readText(formData, 'orderId')
      const status = readText(formData, 'status') as OrderStatus
      if (!orderId) return { error: 'Commande introuvable.' }

      const allowed: OrderStatus[] = ['CONFIRMED', 'DELIVERED', 'CANCELLED']
      if (!allowed.includes(status)) {
        return { error: 'Cet état ne se déclare pas depuis cet écran.' }
      }

      await requirePermission(
        status === 'CANCELLED'
          ? PERMISSIONS.SALES_ORDERS_CANCEL
          : PERMISSIONS.SALES_ORDERS_VALIDATE
      )

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('set_sales_order_status', {
        p_order_id: orderId,
        p_status: status,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/commandes/${orderId}`)
      revalidatePath('/commerce/commandes')
      revalidatePath('/commerce/devis')

      return { success: 'L’état de la commande a été enregistré.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Facturer une commande — PAR LA CHAÎNE EXISTANTE.
 *
 * 🟥 LA CAPACITÉ EXIGÉE EST CELLE DE LA FACTURATION, non une capacité
 * commerciale : `billing.customer_invoices.create`, qui existe depuis la
 * migration 007. En créer une seconde donnerait deux vérités sur le même acte
 * (CLAUDE.md §19 bis). La fonction SQL exige en outre de pouvoir CONSULTER la
 * commande et le client.
 *
 * La facture naît EN BROUILLON : l'émettre reste un acte distinct, sous
 * `billing.customer_invoices.issue`, depuis l'écran de facturation. C'est
 * pourquoi cette action redirige vers la facture plutôt que d'annoncer une
 * créance qui n'existe pas encore.
 */
export async function invoiceOrderAction(
  prevState: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  return guarded(
    'commande client:facturation',
    async () => {
      await requirePermission(PERMISSIONS.CUSTOMER_INVOICES_CREATE)

      const orderId = readText(formData, 'orderId')
      if (!orderId) return { error: 'Commande introuvable.' }

      const invoiceDate = orNull(readText(formData, 'invoiceDate'))
      const dueDate = orNull(readText(formData, 'dueDate'))
      if (invoiceDate && dueDate && dueDate < invoiceDate) {
        return {
          fieldErrors: { dueDate: 'L’échéance ne peut pas précéder la date de la facture.' },
        }
      }

      const supabase = await createSupabaseServerClient()
      const { data, error } = await supabase.rpc('create_invoice_from_sales_order', {
        p_order_id: orderId,
        p_invoice_date: invoiceDate,
        p_due_date: dueDate,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/commandes/${orderId}`)
      revalidatePath('/commerce/commandes')
      revalidatePath('/facturation/clients')
      redirect(`/facturation/clients/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}
