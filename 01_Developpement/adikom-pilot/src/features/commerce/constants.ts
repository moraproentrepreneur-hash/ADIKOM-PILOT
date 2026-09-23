import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Vocabulaire du commerce client — LOT 25, DEC-049.
 *
 * Aucun accès n'est décidé ici : les capacités sont vérifiées par les actions
 * serveur, par les fonctions atomiques et par RLS. Ce fichier ne porte que des
 * libellés, des mises en forme et des règles de CYCLE — utilisables aussi bien
 * par un composant serveur que client.
 *
 * LES TRANSITIONS SONT ÉCRITES DEUX FOIS, ET C'EST VOULU.
 *
 * Ici pour ne PROPOSER que ce qui est possible ; en base (déclencheurs
 * `fn_sales_quote_transition` et `fn_sales_order_transition`) pour l'IMPOSER.
 * L'écran ne décide rien : il évite seulement d'offrir un bouton que la base
 * refuserait (CLAUDE.md §38, §56).
 */

/* -------------------------------------------------------------------------- */
/*  Devis — miroir de `public.commercial_document_status`                      */
/* -------------------------------------------------------------------------- */

export type QuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REFUSED'
  | 'CONVERTED'
  | 'CANCELLED'

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Émis',
  ACCEPTED: 'Accepté',
  REFUSED: 'Refusé',
  CONVERTED: 'Converti',
  CANCELLED: 'Annulé',
}

export const QUOTE_STATUS_TONES: Record<QuoteStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  REFUSED: 'warning',
  CONVERTED: 'success',
  CANCELLED: 'danger',
}

export const QUOTE_STATUS_HELP: Record<QuoteStatus, string> = {
  DRAFT: 'Le devis se prépare. Ses lignes et son en-tête sont librement modifiables.',
  SENT: 'Le devis a été remis au client. Ses lignes et son prix sont figés.',
  ACCEPTED: 'Le client a donné son accord. Le devis peut devenir une commande.',
  REFUSED: 'Le client a décliné. Le devis reste consultable comme acte antérieur.',
  CONVERTED: 'Une commande est née de ce devis. Le devis, lui, est conservé tel quel.',
  CANCELLED: 'Le devis a été retiré par ADIKOM. Son historique est conservé.',
}

/**
 * Ce qu'un devis peut devenir, et par quelle capacité.
 *
 * `CONVERTED` n'y figure pas : il ne se déclare pas, il résulte de la création
 * de la commande. Le retour `CONVERTED → ACCEPTED` non plus : il résulte de
 * l'annulation de cette commande.
 */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['ACCEPTED', 'REFUSED', 'CANCELLED'],
  ACCEPTED: ['CANCELLED'],
  REFUSED: [],
  CONVERTED: [],
  CANCELLED: [],
}

/** Libellé de l'ACTE, et non de l'état atteint : on « émet », on n'« émet pas un émis ». */
export const QUOTE_ACTION_LABELS: Partial<Record<QuoteStatus, string>> = {
  SENT: 'Émettre le devis',
  ACCEPTED: 'Enregistrer l’acceptation',
  REFUSED: 'Enregistrer le refus',
  CANCELLED: 'Annuler le devis',
}

/** Un devis en brouillon se modifie ; passé cet état, il est figé. */
export function quoteIsEditable(status: QuoteStatus): boolean {
  return status === 'DRAFT'
}

/** Seul un devis accepté se convertit. */
export function quoteIsConvertible(status: QuoteStatus): boolean {
  return status === 'ACCEPTED'
}

/**
 * Un devis est-il PÉRIMÉ à la date considérée ?
 *
 * 🟥 DÉRIVÉ, JAMAIS ÉCRIT — décision B-7 du Plan 01 : « Un devis expiré
 * change-t-il de statut tout seul ? Non — aucun ordonnanceur. Dérivé de
 * `valid_until`, comme `OVERDUE` (D2). » Un statut `EXPIRED` supposerait une
 * tâche planifiée que le projet n'a pas, et mentirait entre deux passages.
 *
 * La péremption ne concerne qu'un devis ENCORE EN ATTENTE DE RÉPONSE : un devis
 * accepté le 1er reste accepté le 30, quelle que soit sa date de validité.
 */
export function quoteIsExpired(
  status: QuoteStatus,
  validUntil: string | null,
  today: string
): boolean {
  if (status !== 'SENT') return false
  if (!validUntil) return false
  return validUntil < today
}

/* -------------------------------------------------------------------------- */
/*  Commandes — miroir de `public.order_status`                                */
/* -------------------------------------------------------------------------- */

export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'DELIVERED' | 'INVOICED' | 'CANCELLED'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Brouillon',
  CONFIRMED: 'Confirmée',
  DELIVERED: 'Livrée',
  INVOICED: 'Facturée',
  CANCELLED: 'Annulée',
}

export const ORDER_STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  DRAFT: 'neutral',
  CONFIRMED: 'info',
  DELIVERED: 'success',
  INVOICED: 'success',
  CANCELLED: 'danger',
}

export const ORDER_STATUS_HELP: Record<OrderStatus, string> = {
  DRAFT: 'La commande se prépare. Ses lignes sont librement modifiables.',
  CONFIRMED: 'L’engagement est pris. Les lignes sont figées, la commande est facturable.',
  DELIVERED: 'La prestation est constatée. Aucun bon de livraison n’est produit (décision B-6).',
  INVOICED: 'Une facture client a été préparée à partir de cette commande.',
  CANCELLED: 'La commande a été annulée. Son devis d’origine redevient « accepté ».',
}

/**
 * Ce qu'une commande peut devenir par la main d'un utilisateur.
 *
 * `INVOICED` n'y figure pas : il résulte de la préparation d'une facture. Le
 * retour `INVOICED → CONFIRMED` non plus : il résulte de son annulation.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['CANCELLED'],
  INVOICED: [],
  CANCELLED: [],
}

export const ORDER_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Confirmer la commande',
  DELIVERED: 'Constater la livraison',
  CANCELLED: 'Annuler la commande',
}

export function orderIsEditable(status: OrderStatus): boolean {
  return status === 'DRAFT'
}

/**
 * Une commande confirmée ou livrée se facture.
 *
 * 🟥 UNE COMMANDE, AU PLUS UNE FACTURE NON ANNULÉE. `INVOICED` en est donc
 * exclu, et l'index partiel `customer_invoices_one_per_order_idx` fait autorité
 * quoi qu'affiche l'écran.
 */
export function orderIsInvoiceable(status: OrderStatus): boolean {
  return status === 'CONFIRMED' || status === 'DELIVERED'
}

/* -------------------------------------------------------------------------- */
/*  Lignes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Les deux natures de ligne — 🟩 A-13.
 *
 *   CATALOGUE : service + variante, prix RÉSOLU à la date du document.
 *   LIBRE     : désignation et prix saisis, aucun service.
 *
 * Ce n'est pas une colonne en base : la nature se LIT de la présence du
 * service. Une colonne de plus aurait pu contredire la donnée.
 */
export type LineKind = 'CATALOG' | 'FREE'

export function lineKind(serviceId: string | null): LineKind {
  return serviceId ? 'CATALOG' : 'FREE'
}

export const LINE_KIND_LABELS: Record<LineKind, string> = {
  CATALOG: 'Catalogue',
  FREE: 'Libre',
}

/**
 * Montant d'une ligne : quantité × prix unitaire.
 *
 * DEC-010 : deux entiers, un produit entier. Aucun flottant n'intervient.
 * `multiply` refuse une quantité négative ou non entière (B-14).
 */
export function lineTotal(quantity: number, unitPrice: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error(`Quantité invalide : ${String(quantity)}.`)
  }
  if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0) {
    throw new Error(`Prix unitaire invalide : ${String(unitPrice)}.`)
  }
  return quantity * unitPrice
}

/**
 * Total d'un document : Σ des lignes ACTIVES.
 *
 * Les lignes archivées sont écartées (D6 : on archive, on n'efface pas). Le
 * même calcul vit en base — `sales_quote_total`, `sales_order_total` — et c'est
 * lui qui fait foi ; celui-ci évite un aller-retour pour afficher un sous-total
 * pendant la saisie.
 */
export function documentTotal(
  lines: readonly { quantity: number; unitPrice: number; isArchived: boolean }[]
): number {
  let total = 0
  for (const line of lines) {
    if (line.isArchived) continue
    total += lineTotal(line.quantity, line.unitPrice)
  }
  return total
}
