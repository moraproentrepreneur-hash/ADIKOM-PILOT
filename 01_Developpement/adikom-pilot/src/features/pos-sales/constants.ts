import type { BadgeTone } from '@/components/ui/primitives'
import { PAYMENT_METHOD_LABELS } from '@/features/treasury/constants'

/**
 * Point de vente — ventes et encaissement (LOT 28, Module 12 §12 à §22).
 *
 * Vocabulaire et calculs d'AFFICHAGE, sans accès aux données : importable par
 * les composants clients comme par le serveur, testable sans base.
 *
 * 🟥 AUCUN MONTANT CALCULÉ ICI N'EST CRU. Le prix vient du catalogue, résolu par
 * la base à la date de la vente (D16) ; l'encaissé, la monnaie et le net sont
 * calculés PAR LA BASE à la validation (`record_pos_sale`, Q-9). Ce fichier
 * reproduit la même règle pour que la caisse affiche, À LA FRAPPE, ce que la
 * base dira — « afficher un total n'est pas le calculer » (Plan 01 §16.15).
 */

export type PosSaleStatus = 'VALIDATED' | 'CANCELLED'

export const SALE_STATUS_LABELS: Record<PosSaleStatus, string> = {
  VALIDATED: 'Validée',
  CANCELLED: 'Annulée',
}

export const SALE_STATUS_TONES: Record<PosSaleStatus, BadgeTone> = {
  VALIDATED: 'success',
  CANCELLED: 'neutral',
}

export const SALE_STATUS_ORDER: PosSaleStatus[] = ['VALIDATED', 'CANCELLED']

/** A-9 — les cinq modes du comptoir, et eux seuls. */
export const COUNTER_METHODS = ['CASH', 'CHEQUE', 'MVOLA', 'HOLO', 'WAKATI'] as const
export type CounterMethod = (typeof COUNTER_METHODS)[number]

export const COUNTER_METHOD_LABELS: Record<CounterMethod, string> = {
  CASH: PAYMENT_METHOD_LABELS.CASH,
  CHEQUE: PAYMENT_METHOD_LABELS.CHEQUE,
  MVOLA: PAYMENT_METHOD_LABELS.MVOLA,
  HOLO: PAYMENT_METHOD_LABELS.HOLO,
  WAKATI: PAYMENT_METHOD_LABELS.WAKATI,
}

export function isCounterMethod(value: string): value is CounterMethod {
  return (COUNTER_METHODS as readonly string[]).includes(value)
}

/** D-3 — hors espèces, l'argent entre sur un compte bancaire choisi. */
export function needsAccount(method: CounterMethod): boolean {
  return method !== 'CASH'
}

/** Libellés de ce qui ne peut pas être lu — jamais un tiret (DEC-017). */
export const UNREADABLE_CLIENT = 'Client non lisible avec vos droits'
export const UNREADABLE_ACCOUNT = 'Compte non lisible avec vos droits'
export const ANONYMOUS_CLIENT = 'Vente sans client'

/* -------------------------------------------------------------------------- */
/*  Raccourcis — annoncés à l'écran, jamais devinés (Plan 02 §7.5)             */
/* -------------------------------------------------------------------------- */

export const SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: 'Ctrl+K', action: 'Rechercher un service' },
  { keys: '↑ ↓', action: 'Choisir dans la liste' },
  { keys: 'Entrée', action: 'Ajouter au panier' },
  { keys: 'F2', action: 'Valider la vente' },
  { keys: 'Échap', action: 'Annuler la saisie en cours' },
]

/* -------------------------------------------------------------------------- */
/*  Le panier — DEC-051 §c                                                     */
/* -------------------------------------------------------------------------- */

export type CartLine = {
  variantId: string
  label: string
  unitPrice: number
  quantity: number
  /** Remise de ligne, fixe en KMF. */
  discount: number
}

export type CartPayment = {
  method: CounterMethod
  /** Montant DONNÉ. */
  tendered: number
  accountId: string | null
  externalRef: string
}

export type SalePreview = {
  /** Σ (quantité × prix). */
  gross: number
  /** Σ remises de ligne. */
  lineDiscounts: number
  /** Σ (quantité × prix − remise de ligne). */
  subtotal: number
  /** NET À PAYER = sous-total − remise globale. */
  net: number
  /** Σ donné hors espèces — encaissé pour son montant. */
  nonCash: number
  /** Espèces données. */
  cashTendered: number
  /** Espèces ENCAISSÉES : le reste à payer, jamais plus. */
  cashApplied: number
  /** Σ ENCAISSÉ — ce que la trésorerie enregistrera. */
  paid: number
  /** Monnaie à rendre — en espèces seulement. */
  change: number
  /** Reste dû : 0 pour une vente soldée. */
  remaining: number
  /** Ce qui empêche la validation, tel que la base le dirait. */
  problems: string[]
}

function lineGross(line: CartLine): number {
  return line.quantity * line.unitPrice
}

/**
 * Ce que la base calculera à la validation — Module 12 §14.3 et §15.2.
 *
 * Mêmes règles, mêmes bornes, mêmes refus que `record_pos_sale` : la caisse
 * annonce le résultat, la base le décide.
 */
export function previewSale(
  lines: readonly CartLine[],
  globalDiscount: number,
  payments: readonly CartPayment[]
): SalePreview {
  const problems: string[] = []

  let gross = 0
  let lineDiscounts = 0
  for (const line of lines) {
    const amount = lineGross(line)
    gross += amount
    lineDiscounts += line.discount
    if (line.discount < 0) problems.push(`La remise de « ${line.label} » ne peut pas être négative.`)
    if (line.discount > amount) {
      problems.push(`La remise de « ${line.label} » dépasse le montant de la ligne.`)
    }
  }

  const subtotal = gross - lineDiscounts
  if (globalDiscount < 0) problems.push('La remise globale ne peut pas être négative.')
  if (globalDiscount > subtotal) {
    problems.push('La remise globale dépasse le sous-total après remises de ligne.')
  }
  const net = Math.max(subtotal - globalDiscount, 0)

  let nonCash = 0
  let cashTendered = 0
  let cashCount = 0
  for (const payment of payments) {
    if (payment.tendered <= 0) continue
    if (payment.method === 'CASH') {
      cashCount += 1
      cashTendered += payment.tendered
    } else {
      nonCash += payment.tendered
      if (!payment.accountId) {
        problems.push(`Choisissez le compte sur lequel entre le paiement ${COUNTER_METHOD_LABELS[payment.method]}.`)
      }
    }
  }

  if (cashCount > 1) problems.push('Une vente reçoit au plus une remise d’espèces.')
  if (nonCash > net) {
    problems.push('Les paiements hors espèces dépassent le net : aucune monnaie ne se rend sur un chèque ni un transfert mobile.')
  }

  const cashApplied = cashTendered > 0 ? Math.max(Math.min(cashTendered, net - nonCash), 0) : 0
  if (cashTendered > 0 && cashApplied === 0 && nonCash <= net) {
    problems.push('La vente est déjà réglée sans espèces : aucun montant en espèces n’est à encaisser.')
  }

  const paid = Math.min(nonCash, net) + cashApplied
  const change = cashTendered - cashApplied
  const remaining = Math.max(net - paid, 0)

  if (lines.length === 0) problems.push('Le panier est vide.')

  return {
    gross,
    lineDiscounts,
    subtotal,
    net,
    nonCash,
    cashTendered,
    cashApplied,
    paid,
    change,
    remaining,
    problems,
  }
}

/** Une remise, de ligne ou globale, est-elle consentie ? — D-1 : elle exige sa capacité. */
export function hasDiscount(lines: readonly CartLine[], globalDiscount: number): boolean {
  return globalDiscount > 0 || lines.some((line) => line.discount > 0)
}

/* -------------------------------------------------------------------------- */
/*  Recherche dans le catalogue — filtre à la frappe                          */
/* -------------------------------------------------------------------------- */

export type SellableItem = {
  variantId: string
  serviceLabel: string
  variantLabel: string
  unitLabel: string | null
  /** Prix du jour, résolu en base (D16). */
  price: number
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/**
 * Filtre le catalogue vendable : chaque mot saisi doit apparaître dans le
 * service ou la variante, sans tenir compte des accents ni de la casse.
 */
export function searchSellable(items: readonly SellableItem[], query: string): SellableItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...items]
  return items.filter((item) => {
    const haystack = fold(`${item.serviceLabel} ${item.variantLabel}`)
    return words.every((word) => haystack.includes(word))
  })
}

/* -------------------------------------------------------------------------- */
/*  Bornes d'affichage                                                         */
/* -------------------------------------------------------------------------- */

/** Liste des ventes : au-delà, l'écran demande de préciser. */
export const SALE_PAGE_SIZE = 100
