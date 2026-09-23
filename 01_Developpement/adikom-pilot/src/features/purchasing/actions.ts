'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { canAny, requirePermission, requireSession } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'
import type { PurchaseOrderStatus, PurchaseQuoteStatus } from './constants'

/**
 * Actions du commerce FOURNISSEUR — LOT 26.
 *
 * CINQ COUCHES, PAS UNE.
 *
 * Ces gardes serveur sont la PREMIÈRE. Elles ne sont ni la seule ni la dernière :
 * les fonctions atomiques revérifient la capacité, les déclencheurs imposent les
 * transitions et figent ce qui doit l'être, RLS refuse l'écriture, et un
 * déclencheur d'INSERT empêche un acte de naître engagé. Un appel direct à
 * PostgREST ne rencontre AUCUNE ligne de ce fichier — d'où les quatre autres.
 *
 * DIX CAPACITÉS, DIX ACTES
 *
 *   `commerce.purchase_quotes.create`    saisir une offre, lui ajouter une ligne
 *   `commerce.purchase_quotes.update`    la corriger, retirer une ligne
 *   `commerce.purchase_quotes.validate`  l'enregistrer, la retenir, l'écarter
 *   `commerce.purchase_quotes.cancel`    retirer l'enregistrement
 *   `commerce.purchase_quotes.view`      la consulter — 🟥 elle porte un coût
 *   … et les cinq mêmes pour la commande.
 *
 * Aucune n'est impliquée par une autre (DEC-024).
 *
 * CE QUE CES ACTIONS NE FONT JAMAIS
 *
 * Aucun décaissement, aucun mouvement de compte, aucune écriture de trésorerie,
 * aucune imputation. Enregistrer la facture d'une commande la prépare EN
 * BROUILLON par la chaîne existante ; la soumettre au contrôle puis la valider
 * restent des actes distincts, depuis l'écran des factures fournisseurs.
 * Une imputation n'est jamais un paiement (CLAUDE.md §57).
 */

export type PurchasingFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /le prix unitaire (proposé|convenu)/i,
    'Le prix proposé par le fournisseur est obligatoire : un entier en KMF, supérieur à zéro.',
  ],
  [
    /les lignes d'un devis fournisseur enregistré sont figées/i,
    'Les lignes de ce devis sont figées : l’offre reçue ne se réécrit pas.',
  ],
  [
    /les lignes d'une commande fournisseur passée sont figées/i,
    'Les lignes de cette commande sont figées : l’engagement pris ne se réécrit pas.',
  ],
  [
    /un devis fournisseur enregistré ne se réécrit plus/i,
    'Cette offre a été enregistrée : son fournisseur, sa date, sa validité et sa référence ne se modifient plus.',
  ],
  [
    /une commande fournisseur passée ne se réécrit plus/i,
    'Cette commande est passée : son fournisseur, son origine et sa date ne se modifient plus.',
  ],
  [
    /seul un devis fournisseur en brouillon se modifie/i,
    'Seul un devis fournisseur en brouillon se modifie.',
  ],
  [
    /seule une commande fournisseur en brouillon se modifie/i,
    'Seule une commande fournisseur en brouillon se modifie.',
  ],
  [
    /ce devis fournisseur est déjà converti|un devis ne produit pas deux commandes/i,
    'Cette offre a déjà produit une commande. Une offre ne se convertit qu’une fois.',
  ],
  [
    /seule une offre RETENUE se convertit/i,
    'Seule une offre retenue se convertit en commande. Enregistrez d’abord la décision d’ADIKOM.',
  ],
  [
    /cette commande porte déjà une facture|cette commande est déjà couverte par la facture/i,
    'Cette commande porte déjà une facture. Une facture reçue pour un complément s’enregistre depuis le module Factures fournisseurs, sans commande d’origine.',
  ],
  [
    /seule une commande passée ou réceptionnée se facture/i,
    'Seule une commande passée ou réceptionnée porte une facture. Passez-la d’abord.',
  ],
  [
    /ne porte aucune ligne/i,
    'Ce document ne porte aucune ligne active : un montant est nécessaire.',
  ],
  [
    /transition de devis fournisseur refusée|transition de commande fournisseur refusée/i,
    'Cet état n’est pas atteignable depuis l’état actuel du document.',
  ],
  [
    /« converti » n'est pas un statut qui se déclare/i,
    '« Converti » ne se déclare pas : il résulte de la création de la commande.',
  ],
  [
    /« facturée » n'est pas un statut qui se déclare/i,
    '« Facturée » ne se déclare pas : elle résulte de l’enregistrement de la facture.',
  ],
  [/est déjà «/i, 'Ce document est déjà dans cet état.'],
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
/*  DEVIS FOURNISSEURS                                                         */
/* ========================================================================== */

const createQuoteSchema = z.object({
  supplierId: z.string().uuid('Choisissez le fournisseur de l’offre.'),
  quoteDate: dateSchema,
})

export async function createPurchaseQuoteAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'devis fournisseur:enregistrement',
    async () => {
      await requirePermission(PERMISSIONS.PURCHASE_QUOTES_CREATE)

      const parsed = createQuoteSchema.safeParse({
        supplierId: readText(formData, 'supplierId'),
        quoteDate: readText(formData, 'quoteDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const validUntil = orNull(readText(formData, 'validUntil'))
      if (validUntil && validUntil < parsed.data.quoteDate) {
        return {
          fieldErrors: { validUntil: 'La validité ne peut pas précéder la date de l’offre.' },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('create_purchase_quote', {
        p_supplier_id: parsed.data.supplierId,
        p_quote_date: parsed.data.quoteDate,
        p_valid_until: validUntil,
        p_external_ref: orNull(readText(formData, 'externalRef')),
        p_notes: orNull(readText(formData, 'notes')),
        p_terms: orNull(readText(formData, 'terms')),
      })

      if (error) throw new Error(error.message)

      revalidatePath('/commerce/devis-fournisseurs')
      redirect(`/commerce/devis-fournisseurs/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

export async function updatePurchaseQuoteAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'devis fournisseur:modification',
    async () => {
      await requirePermission(PERMISSIONS.PURCHASE_QUOTES_UPDATE)

      const quoteId = readText(formData, 'quoteId')
      if (!quoteId) return { error: 'Devis fournisseur introuvable.' }

      const parsed = z.object({ quoteDate: dateSchema }).safeParse({
        quoteDate: readText(formData, 'quoteDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const validUntil = orNull(readText(formData, 'validUntil'))
      if (validUntil && validUntil < parsed.data.quoteDate) {
        return {
          fieldErrors: { validUntil: 'La validité ne peut pas précéder la date de l’offre.' },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('update_purchase_quote', {
        p_quote_id: quoteId,
        p_quote_date: parsed.data.quoteDate,
        p_valid_until: validUntil,
        p_external_ref: orNull(readText(formData, 'externalRef')),
        p_notes: orNull(readText(formData, 'notes')),
        p_terms: orNull(readText(formData, 'terms')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/devis-fournisseurs/${quoteId}`)
      revalidatePath('/commerce/devis-fournisseurs')

      return { success: 'Le devis fournisseur a été modifié.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Ajouter une ligne — les DEUX types de A-13, par une seule action.
 *
 * 🟥 LE PRIX EST TOUJOURS TRANSMIS, y compris pour une ligne de catalogue. Le
 * catalogue n'est pas interrogé : son coût de référence n'a pas de dimension
 * fournisseur (P-5, ouvert), et l'appliquer ferait passer une valeur interne
 * pour l'offre d'un fournisseur donné.
 */
export async function addPurchaseQuoteLineAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'devis fournisseur:ligne',
    async () => {
      /*
       * `create` OU `update` : ajouter une ligne appartient à la SAISIE de
       * l'offre. Celui qui la saisit doit pouvoir la garnir sans détenir en plus
       * le droit de modifier une offre existante.
       */
      await requireSession()
      const maySave = await canAny([
        PERMISSIONS.PURCHASE_QUOTES_CREATE,
        PERMISSIONS.PURCHASE_QUOTES_UPDATE,
      ])
      if (!maySave) return { error: 'Droit insuffisant pour cette opération.' }

      const quoteId = readText(formData, 'quoteId')
      if (!quoteId) return { error: 'Devis fournisseur introuvable.' }

      const quantity = toInteger(readText(formData, 'quantity'))
      if (quantity === null) {
        return { fieldErrors: { quantity: 'Indiquez une quantité entière supérieure à zéro.' } }
      }

      const unitPrice = toInteger(readText(formData, 'unitPrice'))
      if (unitPrice === null) {
        return {
          fieldErrors: {
            unitPrice: 'Indiquez le prix unitaire proposé : un entier en KMF, supérieur à zéro.',
          },
        }
      }

      const variantId = orNull(readText(formData, 'variantId'))
      const label = orNull(readText(formData, 'label'))

      if (!variantId && !label) {
        return { fieldErrors: { label: 'Désignez la prestation de cette ligne libre.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('add_purchase_quote_line', {
        p_quote_id: quoteId,
        p_quantity: quantity,
        p_unit_price: unitPrice,
        p_variant_id: variantId,
        p_label: label,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/devis-fournisseurs/${quoteId}`)
      return { success: 'La ligne a été ajoutée.' }
    },
    ERROR_PATTERNS
  )
}

export async function archivePurchaseQuoteLineAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'devis fournisseur:ligne retirée',
    async () => {
      await requirePermission(PERMISSIONS.PURCHASE_QUOTES_UPDATE)

      const lineId = readText(formData, 'lineId')
      const quoteId = readText(formData, 'quoteId')
      if (!lineId) return { error: 'Ligne introuvable.' }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('archive_purchase_quote_line', { p_line_id: lineId })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/devis-fournisseurs/${quoteId}`)
      return { success: 'La ligne a été retirée.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Faire avancer l'offre, ou retirer son enregistrement.
 *
 * DEUX CAPACITÉS, PAS UNE. Le statut visé décide laquelle est exigée : `cancel`
 * pour l'annulation — retirer un enregistrement qui n'aurait pas dû être là — et
 * `validate` pour les autres — enregistrer l'offre, puis la décision d'ADIKOM.
 * Le déclencheur en base refait ce choix, et c'est lui qui fait autorité.
 */
export async function setPurchaseQuoteStatusAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'devis fournisseur:cycle',
    async () => {
      const quoteId = readText(formData, 'quoteId')
      const status = readText(formData, 'status') as PurchaseQuoteStatus
      if (!quoteId) return { error: 'Devis fournisseur introuvable.' }

      const allowed: PurchaseQuoteStatus[] = ['SENT', 'ACCEPTED', 'REFUSED', 'CANCELLED']
      if (!allowed.includes(status)) {
        return { error: 'Cet état ne se déclare pas depuis cet écran.' }
      }

      await requirePermission(
        status === 'CANCELLED'
          ? PERMISSIONS.PURCHASE_QUOTES_CANCEL
          : PERMISSIONS.PURCHASE_QUOTES_VALIDATE
      )

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('set_purchase_quote_status', {
        p_quote_id: quoteId,
        p_status: status,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/devis-fournisseurs/${quoteId}`)
      revalidatePath('/commerce/devis-fournisseurs')

      return { success: 'L’état du devis fournisseur a été enregistré.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Convertir une offre retenue en commande fournisseur.
 *
 * 🟥 LA CAPACITÉ EXIGÉE EST `commerce.purchase_orders.create` : l'acte est la
 * CRÉATION DE LA COMMANDE ; le passage du devis à « converti » n'en est que la
 * conséquence. Exiger en plus `commerce.purchase_quotes.validate` reviendrait à
 * demander deux capacités pour un seul geste.
 */
export async function convertPurchaseQuoteAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'devis fournisseur:conversion',
    async () => {
      await requirePermission(PERMISSIONS.PURCHASE_ORDERS_CREATE)

      const quoteId = readText(formData, 'quoteId')
      if (!quoteId) return { error: 'Devis fournisseur introuvable.' }

      const supabase = await createSupabaseServerClient()
      const { data, error } = await supabase.rpc('convert_purchase_quote_to_order', {
        p_quote_id: quoteId,
        p_order_date: orNull(readText(formData, 'orderDate')),
        p_expected_date: orNull(readText(formData, 'expectedDate')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/devis-fournisseurs/${quoteId}`)
      revalidatePath('/commerce/devis-fournisseurs')
      revalidatePath('/commerce/commandes-fournisseurs')
      redirect(`/commerce/commandes-fournisseurs/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

/* ========================================================================== */
/*  COMMANDES FOURNISSEURS                                                     */
/* ========================================================================== */

const createOrderSchema = z.object({
  supplierId: z.string().uuid('Choisissez le fournisseur de la commande.'),
  orderDate: dateSchema,
})

export async function createPurchaseOrderAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'commande fournisseur:création',
    async () => {
      await requirePermission(PERMISSIONS.PURCHASE_ORDERS_CREATE)

      const parsed = createOrderSchema.safeParse({
        supplierId: readText(formData, 'supplierId'),
        orderDate: readText(formData, 'orderDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const expectedDate = orNull(readText(formData, 'expectedDate'))
      if (expectedDate && expectedDate < parsed.data.orderDate) {
        return {
          fieldErrors: {
            expectedDate: 'La réception attendue ne peut pas précéder la date de la commande.',
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('create_purchase_order', {
        p_supplier_id: parsed.data.supplierId,
        p_order_date: parsed.data.orderDate,
        p_expected_date: expectedDate,
        p_notes: orNull(readText(formData, 'notes')),
        p_terms: orNull(readText(formData, 'terms')),
      })

      if (error) throw new Error(error.message)

      revalidatePath('/commerce/commandes-fournisseurs')
      redirect(`/commerce/commandes-fournisseurs/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

export async function updatePurchaseOrderAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'commande fournisseur:modification',
    async () => {
      await requirePermission(PERMISSIONS.PURCHASE_ORDERS_UPDATE)

      const orderId = readText(formData, 'orderId')
      if (!orderId) return { error: 'Commande fournisseur introuvable.' }

      const parsed = z.object({ orderDate: dateSchema }).safeParse({
        orderDate: readText(formData, 'orderDate'),
      })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const expectedDate = orNull(readText(formData, 'expectedDate'))
      if (expectedDate && expectedDate < parsed.data.orderDate) {
        return {
          fieldErrors: {
            expectedDate: 'La réception attendue ne peut pas précéder la date de la commande.',
          },
        }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('update_purchase_order', {
        p_order_id: orderId,
        p_order_date: parsed.data.orderDate,
        p_expected_date: expectedDate,
        p_notes: orNull(readText(formData, 'notes')),
        p_terms: orNull(readText(formData, 'terms')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/commandes-fournisseurs/${orderId}`)
      revalidatePath('/commerce/commandes-fournisseurs')

      return { success: 'La commande fournisseur a été modifiée.' }
    },
    ERROR_PATTERNS
  )
}

export async function addPurchaseOrderLineAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'commande fournisseur:ligne',
    async () => {
      await requireSession()
      const maySave = await canAny([
        PERMISSIONS.PURCHASE_ORDERS_CREATE,
        PERMISSIONS.PURCHASE_ORDERS_UPDATE,
      ])
      if (!maySave) return { error: 'Droit insuffisant pour cette opération.' }

      const orderId = readText(formData, 'orderId')
      if (!orderId) return { error: 'Commande fournisseur introuvable.' }

      const quantity = toInteger(readText(formData, 'quantity'))
      if (quantity === null) {
        return { fieldErrors: { quantity: 'Indiquez une quantité entière supérieure à zéro.' } }
      }

      const unitPrice = toInteger(readText(formData, 'unitPrice'))
      if (unitPrice === null) {
        return {
          fieldErrors: {
            unitPrice: 'Indiquez le prix unitaire convenu : un entier en KMF, supérieur à zéro.',
          },
        }
      }

      const variantId = orNull(readText(formData, 'variantId'))
      const label = orNull(readText(formData, 'label'))

      if (!variantId && !label) {
        return { fieldErrors: { label: 'Désignez la prestation de cette ligne libre.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('add_purchase_order_line', {
        p_order_id: orderId,
        p_quantity: quantity,
        p_unit_price: unitPrice,
        p_variant_id: variantId,
        p_label: label,
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/commandes-fournisseurs/${orderId}`)
      return { success: 'La ligne a été ajoutée.' }
    },
    ERROR_PATTERNS
  )
}

export async function archivePurchaseOrderLineAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'commande fournisseur:ligne retirée',
    async () => {
      await requirePermission(PERMISSIONS.PURCHASE_ORDERS_UPDATE)

      const lineId = readText(formData, 'lineId')
      const orderId = readText(formData, 'orderId')
      if (!lineId) return { error: 'Ligne introuvable.' }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('archive_purchase_order_line', { p_line_id: lineId })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/commandes-fournisseurs/${orderId}`)
      return { success: 'La ligne a été retirée.' }
    },
    ERROR_PATTERNS
  )
}

export async function setPurchaseOrderStatusAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'commande fournisseur:cycle',
    async () => {
      const orderId = readText(formData, 'orderId')
      const status = readText(formData, 'status') as PurchaseOrderStatus
      if (!orderId) return { error: 'Commande fournisseur introuvable.' }

      const allowed: PurchaseOrderStatus[] = ['CONFIRMED', 'DELIVERED', 'CANCELLED']
      if (!allowed.includes(status)) {
        return { error: 'Cet état ne se déclare pas depuis cet écran.' }
      }

      await requirePermission(
        status === 'CANCELLED'
          ? PERMISSIONS.PURCHASE_ORDERS_CANCEL
          : PERMISSIONS.PURCHASE_ORDERS_VALIDATE
      )

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('set_purchase_order_status', {
        p_order_id: orderId,
        p_status: status,
        p_reason: orNull(readText(formData, 'reason')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/commandes-fournisseurs/${orderId}`)
      revalidatePath('/commerce/commandes-fournisseurs')
      revalidatePath('/commerce/devis-fournisseurs')

      return { success: 'L’état de la commande fournisseur a été enregistré.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Enregistrer la facture d'une commande — PAR LA CHAÎNE EXISTANTE.
 *
 * 🟥 LA CAPACITÉ EXIGÉE EST CELLE DE LA FACTURATION FOURNISSEUR, non une
 * capacité commerciale : `billing.supplier_invoices.create`, qui existe depuis
 * la migration 007. En créer une seconde donnerait deux vérités sur le même acte
 * (CLAUDE.md §19 bis). La fonction SQL exige en outre de pouvoir CONSULTER la
 * commande et le fournisseur.
 *
 * La facture naît EN BROUILLON : la soumettre au contrôle puis la valider
 * restent des actes distincts, sous `billing.supplier_invoices.update` et
 * `.validate`, depuis l'écran des factures fournisseurs. C'est pourquoi cette
 * action redirige vers la facture plutôt que d'annoncer une dette reconnue.
 *
 * 🟥 LE MONTANT DE LA FACTURE N'EST PAS CELUI DE LA COMMANDE PAR DÉCRET : les
 * lignes sont recopiées pour épargner une ressaisie, et restent modifiables tant
 * que la facture est en saisie — le fournisseur a pu facturer autre chose.
 */
export async function invoicePurchaseOrderAction(
  prevState: PurchasingFormState,
  formData: FormData
): Promise<PurchasingFormState> {
  return guarded(
    'commande fournisseur:facturation',
    async () => {
      await requirePermission(PERMISSIONS.SUPPLIER_INVOICES_CREATE)

      const orderId = readText(formData, 'orderId')
      if (!orderId) return { error: 'Commande fournisseur introuvable.' }

      const invoiceDate = orNull(readText(formData, 'invoiceDate'))
      const dueDate = orNull(readText(formData, 'dueDate'))
      if (invoiceDate && dueDate && dueDate < invoiceDate) {
        return {
          fieldErrors: { dueDate: 'L’échéance ne peut pas précéder la date de la facture.' },
        }
      }

      const supabase = await createSupabaseServerClient()
      const { data, error } = await supabase.rpc('create_invoice_from_purchase_order', {
        p_order_id: orderId,
        p_invoice_date: invoiceDate,
        p_due_date: dueDate,
        p_external_ref: orNull(readText(formData, 'externalRef')),
      })

      if (error) throw new Error(error.message)

      revalidatePath(`/commerce/commandes-fournisseurs/${orderId}`)
      revalidatePath('/commerce/commandes-fournisseurs')
      revalidatePath('/facturation/fournisseurs')
      redirect(`/facturation/fournisseurs/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}
