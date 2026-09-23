import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Vocabulaire du commerce FOURNISSEUR — LOT 26.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🟥 POURQUOI UN FICHIER À PART, ET NON DES LIBELLÉS DE PLUS DANS `commerce`
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Les deux domaines partagent leurs TYPES de statut — `commercial_document_status`
 * et `order_status` sont les mêmes en base (Plan 02 §9.5) — mais PAS leur sens :
 *
 *     Code        Devis CLIENT   Devis FOURNISSEUR
 *     SENT        Émis           🟥 Reçu       — ADIKOM n'émet rien, elle enregistre
 *     ACCEPTED    Accepté        Retenu        — ADIKOM retient cette offre
 *     REFUSED     Refusé         Écarté        — ADIKOM en préfère une autre
 *     DELIVERED   Livrée         Réceptionnée  — B-6 : un statut, pas un document
 *
 * Mélanger les deux tables de libellés aurait produit, tôt ou tard, un écran
 * disant « Émettre le devis » à quelqu'un qui enregistre l'offre d'un
 * fournisseur. Ce sont deux lectures d'un même code, et elles vivent séparément.
 *
 * Aucun accès n'est décidé ici : les capacités sont vérifiées par les actions
 * serveur, par les fonctions atomiques et par RLS. Ce fichier ne porte que des
 * libellés, des mises en forme et des règles de CYCLE.
 *
 * LES TRANSITIONS SONT ÉCRITES DEUX FOIS, ET C'EST VOULU. Ici pour ne PROPOSER
 * que ce qui est possible ; en base (`fn_purchase_quote_transition`,
 * `fn_purchase_order_transition`) pour l'IMPOSER.
 */

/* -------------------------------------------------------------------------- */
/*  Devis fournisseur — miroir de `public.commercial_document_status`          */
/* -------------------------------------------------------------------------- */

export type PurchaseQuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REFUSED'
  | 'CONVERTED'
  | 'CANCELLED'

export const PURCHASE_QUOTE_STATUS_LABELS: Record<PurchaseQuoteStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Reçu',
  ACCEPTED: 'Retenu',
  REFUSED: 'Écarté',
  CONVERTED: 'Converti',
  CANCELLED: 'Annulé',
}

export const PURCHASE_QUOTE_STATUS_TONES: Record<PurchaseQuoteStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  REFUSED: 'warning',
  CONVERTED: 'success',
  CANCELLED: 'danger',
}

export const PURCHASE_QUOTE_STATUS_HELP: Record<PurchaseQuoteStatus, string> = {
  DRAFT: 'L’offre se saisit. Son en-tête et ses lignes sont librement modifiables.',
  SENT: 'L’offre est enregistrée telle que le fournisseur l’a remise. Ses lignes et ses prix sont figés.',
  ACCEPTED: 'ADIKOM retient cette offre. Elle peut devenir une commande fournisseur.',
  REFUSED: 'ADIKOM a écarté cette offre. Elle reste consultable comme acte antérieur.',
  CONVERTED: 'Une commande est née de cette offre. L’offre, elle, est conservée telle quelle.',
  CANCELLED: 'L’enregistrement a été retiré par ADIKOM. Son historique est conservé.',
}

/**
 * Ce qu'un devis fournisseur peut devenir par la main d'un utilisateur.
 *
 * `CONVERTED` n'y figure pas : il ne se déclare pas, il résulte de la création
 * de la commande. Le retour `CONVERTED → ACCEPTED` non plus : il résulte de
 * l'annulation de cette commande.
 */
export const PURCHASE_QUOTE_TRANSITIONS: Record<PurchaseQuoteStatus, PurchaseQuoteStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['ACCEPTED', 'REFUSED', 'CANCELLED'],
  ACCEPTED: ['CANCELLED'],
  REFUSED: [],
  CONVERTED: [],
  CANCELLED: [],
}

/** Libellé de l'ACTE, et non de l'état atteint. */
export const PURCHASE_QUOTE_ACTION_LABELS: Partial<Record<PurchaseQuoteStatus, string>> = {
  SENT: 'Enregistrer l’offre reçue',
  ACCEPTED: 'Retenir cette offre',
  REFUSED: 'Écarter cette offre',
  CANCELLED: 'Annuler l’enregistrement',
}

/** Un devis fournisseur en brouillon se modifie ; passé cet état, il est figé. */
export function purchaseQuoteIsEditable(status: PurchaseQuoteStatus): boolean {
  return status === 'DRAFT'
}

/** Seule une offre RETENUE se convertit. */
export function purchaseQuoteIsConvertible(status: PurchaseQuoteStatus): boolean {
  return status === 'ACCEPTED'
}

/**
 * L'offre est-elle PÉRIMÉE à la date considérée ?
 *
 * 🟥 DÉRIVÉ, JAMAIS ÉCRIT — décision B-7. Le projet n'a aucun ordonnanceur, et
 * un statut « expiré » inscrit en base mentirait entre deux passages.
 *
 * La péremption ne concerne qu'une offre ENCORE EN ATTENTE DE DÉCISION : une
 * offre retenue le 1er reste retenue le 30, quelle que soit sa validité.
 */
export function purchaseQuoteIsExpired(
  status: PurchaseQuoteStatus,
  validUntil: string | null,
  today: string
): boolean {
  if (status !== 'SENT') return false
  if (!validUntil) return false
  return validUntil < today
}

/* -------------------------------------------------------------------------- */
/*  Commande fournisseur — miroir de `public.order_status`                     */
/* -------------------------------------------------------------------------- */

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'DELIVERED'
  | 'INVOICED'
  | 'CANCELLED'

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Brouillon',
  CONFIRMED: 'Passée',
  DELIVERED: 'Réceptionnée',
  INVOICED: 'Facturée',
  CANCELLED: 'Annulée',
}

export const PURCHASE_ORDER_STATUS_TONES: Record<PurchaseOrderStatus, BadgeTone> = {
  DRAFT: 'neutral',
  CONFIRMED: 'info',
  DELIVERED: 'success',
  INVOICED: 'success',
  CANCELLED: 'danger',
}

export const PURCHASE_ORDER_STATUS_HELP: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'La commande se prépare. Ses lignes sont librement modifiables.',
  CONFIRMED: 'La commande est transmise au fournisseur. Les lignes sont figées, la facture peut être enregistrée.',
  DELIVERED:
    'La prestation est constatée reçue. Aucun bon de réception n’est produit : c’est un statut, pas un document (décision B-6).',
  INVOICED: 'Une facture fournisseur a été enregistrée à partir de cette commande.',
  CANCELLED: 'La commande a été annulée. Son devis d’origine redevient « retenu ».',
}

/**
 * Ce qu'une commande fournisseur peut devenir par la main d'un utilisateur.
 *
 * `INVOICED` n'y figure pas : il résulte de l'enregistrement d'une facture. Le
 * retour `INVOICED → CONFIRMED` non plus : il résulte de son annulation.
 */
export const PURCHASE_ORDER_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['CANCELLED'],
  INVOICED: [],
  CANCELLED: [],
}

export const PURCHASE_ORDER_ACTION_LABELS: Partial<Record<PurchaseOrderStatus, string>> = {
  CONFIRMED: 'Passer la commande',
  DELIVERED: 'Constater la réception',
  CANCELLED: 'Annuler la commande',
}

export function purchaseOrderIsEditable(status: PurchaseOrderStatus): boolean {
  return status === 'DRAFT'
}

/**
 * Une commande passée ou réceptionnée peut porter sa facture.
 *
 * 🟦 UNE COMMANDE, AU PLUS UNE FACTURE NON ANNULÉE. `INVOICED` en est donc
 * exclu, et l'index partiel `supplier_invoices_one_per_purchase_order_idx` fait
 * autorité quoi qu'affiche l'écran. Une facture reçue pour un complément
 * s'enregistre, elle, sans commande d'origine : rien n'est perdu.
 */
export function purchaseOrderIsInvoiceable(status: PurchaseOrderStatus): boolean {
  return status === 'CONFIRMED' || status === 'DELIVERED'
}

/* -------------------------------------------------------------------------- */
/*  Lignes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Les deux natures de ligne — 🟩 A-13.
 *
 *   CATALOGUE : service + variante NOMMÉS, prix de l'offre SAISI.
 *   LIBRE     : désignation et prix saisis, aucun service.
 *
 * Ce n'est pas une colonne en base : la nature se LIT de la présence du service.
 *
 * 🟥 DANS LES DEUX CAS, LE PRIX EST SAISI. C'est la différence centrale avec le
 * commerce client, où le prix d'une ligne de catalogue est résolu du catalogue :
 * le coût de référence n'a pas de dimension fournisseur (P-5, ouvert), et
 * l'appliquer ferait passer une valeur interne pour une offre reçue.
 */
export type PurchaseLineKind = 'CATALOG' | 'FREE'

export function purchaseLineKind(serviceId: string | null): PurchaseLineKind {
  return serviceId ? 'CATALOG' : 'FREE'
}

export const PURCHASE_LINE_KIND_LABELS: Record<PurchaseLineKind, string> = {
  CATALOG: 'Catalogue',
  FREE: 'Libre',
}

/**
 * Montant d'une ligne : quantité × prix unitaire.
 *
 * DEC-010 : deux entiers, un produit entier. Aucun flottant n'intervient.
 * Refuse une valeur invalide plutôt que de l'ignorer : un montant faux est pire
 * qu'une erreur — et les contraintes de la base rendent le cas impossible, si
 * bien qu'une levée signalerait une corruption réelle.
 */
export function purchaseLineTotal(quantity: number, unitPrice: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error(`Quantité invalide : ${String(quantity)}.`)
  }
  if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0) {
    throw new Error(`Prix unitaire invalide : ${String(unitPrice)}.`)
  }
  return quantity * unitPrice
}

/**
 * Total d'un document d'achat : Σ des lignes ACTIVES.
 *
 * Les lignes archivées sont écartées (D6). Le même calcul vit en base —
 * `purchase_quote_total`, `purchase_order_total` — et c'est lui qui fait foi ;
 * celui-ci évite un aller-retour pour afficher un sous-total pendant la saisie.
 */
export function purchaseDocumentTotal(
  lines: readonly { quantity: number; unitPrice: number; isArchived: boolean }[]
): number {
  let total = 0
  for (const line of lines) {
    if (line.isArchived) continue
    total += purchaseLineTotal(line.quantity, line.unitPrice)
  }
  return total
}

/* -------------------------------------------------------------------------- */
/*  🟥 L'ÉCART ENTRE LA COMMANDE ET SA FACTURE                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ce que le fournisseur facture, comparé à ce qui a été commandé.
 *
 * 🟥 LES DEUX MONTANTS NE SONT PAS FORCÉS À COÏNCIDER, et c'est une règle de
 * fond, pas un oubli :
 *
 *   CÔTÉ CLIENT      la facture EXPRIME l'engagement d'ADIKOM.
 *   CÔTÉ FOURNISSEUR la facture CONSTATE ce que le fournisseur réclame
 *                    (Module 07 §28, §54). Son montant brut est la somme de SES
 *                    lignes, et ce montant doit être conservé tel quel.
 *
 * Un fournisseur peut facturer un extra, consentir un geste, livrer une quantité
 * différente. Forcer l'égalité reviendrait à réécrire un document reçu. Le
 * système les rend donc COMPARABLES, et laisse l'écart à la vue de qui contrôle.
 *
 * `null` lorsque l'un des deux montants n'est pas lisible : un écart calculé sur
 * un zéro d'ignorance se lirait comme un écart réel (DEC-017).
 */
export function invoiceGap(
  orderTotal: number | null,
  invoiceGross: number | null
): number | null {
  if (orderTotal === null || invoiceGross === null) return null
  return invoiceGross - orderTotal
}
