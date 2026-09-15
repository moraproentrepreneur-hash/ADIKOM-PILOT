import { formatAmount, NBSP } from '@/lib/money'
import { UNIT_SUFFIX, type PricingUnit } from '@/features/pricing/constants'

/**
 * Vocabulaire du coût d'acquisition — LOT 21, DEC-044.
 *
 * Séparé de `data.ts`, marqué `server-only` : les composants clients ont besoin
 * de ces libellés, et les importer depuis la couche de données entraînerait le
 * client Supabase serveur dans le bundle navigateur.
 *
 * QUATRE NOTIONS, QUATRE NOMS, JAMAIS CONFONDUS — Plan 02 §6.2. C'est le risque
 * principal de ce lot, et il se traite par le vocabulaire :
 *
 *   · COÛT D'ACQUISITION    ce qu'ADIKOM paie au fournisseur pour disposer du
 *                           véhicule. Confidentiel.
 *   · TARIF CLIENT          ce qu'ADIKOM facture. Le seul montant des documents
 *                           remis au client.
 *   · COMMISSION            tarif client − coût d'acquisition, sur la SEULE mise
 *                           à disposition du véhicule.
 *   · MARGE D'EXPLOITATION  revenus facturés − coût d'entretien net supporté,
 *                           sur la VIE du véhicule. Livrée par l'onglet
 *                           « Rentabilité » de la fiche véhicule.
 *
 * LES DEUX DERNIÈRES NE SE MÉLANGENT JAMAIS. La commission regarde un contrat ;
 * la marge d'exploitation regarde un véhicule sur sa durée, maintenances et
 * imputations comprises. Chaque écran NOMME la sienne et ÉNUMÈRE ce qu'elle ne
 * couvre pas.
 */

export const ACQUISITION_COST_LABEL = 'Coût d’acquisition'
export const COMMISSION_LABEL = 'Commission de location'

/** Rappel affiché partout où un coût d'acquisition apparaît. */
export const INTERNAL_NOTICE =
  'Donnée interne ADIKOM. Elle ne figure sur aucun document remis au client : ni devis, ni contrat, ni facture, ni reçu.'

/**
 * Ce que la commission ne couvre PAS.
 *
 * `05_Regles_Metier/02_Parc_Automobile.md` §43 pose l'interdit qui commande ces
 * écrans : « le système ne doit pas présenter un indicateur comme une
 * rentabilité COMPLÈTE si toutes les charges ne sont pas prises en compte ».
 * Il vaut ici mot pour mot.
 */
export const COMMISSION_SCOPE_NOTE =
  'Écart entre le tarif facturé au client et le coût d’acquisition du véhicule, sur la seule mise à disposition. N’y entrent ni les services, ni les maintenances, ni les imputations fournisseurs : la marge d’exploitation du véhicule se lit sur l’onglet « Rentabilité » de sa fiche.'

/* -------------------------------------------------------------------------- */
/*  Date d'effet                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Le jour COMORIEN d'un instant, au format `AAAA-MM-JJ`.
 *
 * LA DATE D'EFFET D'UN RÉSOLVEUR EST LA DATE MÉTIER DE L'OPÉRATION, jamais
 * « aujourd'hui » (Plan 02 §5.6). Pour un contrat, c'est son départ réel, ou à
 * défaut le début de la période prévue : un contrat parti le 22 août relève du
 * coût du 22 août, même consulté en décembre.
 *
 * ET LE JOUR EST COMORIEN. Découper un instant UTC donnerait, entre 21 h et
 * minuit, la veille à Moroni — invisible en recette de journée, et faux le jour
 * d'un changement de tarif (DEC-025 §e).
 */
export function businessDate(instant: string | null | undefined): string {
  const parsed = instant ? new Date(instant) : new Date()
  const value = Number.isNaN(parsed.getTime()) ? new Date() : parsed

  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Indian/Comoro',
  }).format(value)
}

/* -------------------------------------------------------------------------- */
/*  Montants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `bigint` en base, donc chaîne renvoyée par PostgREST lorsqu'il dépasse la
 * plage sûre. La conversion est faite une fois, ici, plutôt que devinée à
 * l'affichage — un montant n'est jamais une chaîne dans un calcul (DEC-010).
 */
export function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'string' ? Number(value) : value
  return Number.isSafeInteger(parsed) ? parsed : null
}

/** `40 000 KMF / jour`, ou `—` lorsqu'aucun montant n'est applicable. */
export function formatRate(amount: number | null, unit: PricingUnit | null): string {
  if (amount === null) return '—'
  return unit ? `${formatAmount(amount)}${NBSP}${UNIT_SUFFIX[unit]}` : formatAmount(amount)
}

/* -------------------------------------------------------------------------- */
/*  Commission — calculée, jamais stockée (doctrine D1)                        */
/* -------------------------------------------------------------------------- */

/**
 * Pourquoi la commission n'a pas pu être calculée.
 *
 * Un écran ne dit jamais « 0 » à la place d'une de ces raisons : il dit
 * LAQUELLE (DEC-008, DEC-017).
 */
export type CommissionGap =
  /** Le lecteur n'a pas `rental.rentals.financial.view`. */
  | 'NO_CLIENT_PRICE_ACCESS'
  /** Le lecteur n'a pas `rental.pricing.supplier.view`. */
  | 'NO_COST_ACCESS'
  /** Aucune version de coût n'est applicable à la date considérée. */
  | 'NO_COST_AT_DATE'
  /**
   * Le véhicule n'est pas fourni par un fournisseur.
   *
   * Véhicule ADIKOM : décision P-2 en attente. Véhicule de partenariat : aucune
   * décision n'existe. Dans les deux cas, un coût inventé serait pire que rien.
   */
  | 'NOT_SUPPLIED'
  /**
   * Les deux montants ne portent pas la même unité.
   *
   * 50 000 par jour moins 40 000 de forfait ne fait pas 10 000 : ce sont deux
   * grandeurs différentes, et les soustraire produirait un nombre qui ressemble
   * à une marge sans en être une.
   */
  | 'UNIT_MISMATCH'

export const COMMISSION_GAP_MESSAGES: Record<CommissionGap, string> = {
  NO_CLIENT_PRICE_ACCESS:
    'Commission non calculée : le tarif facturé au client n’est pas accessible avec vos droits.',
  NO_COST_ACCESS:
    'Commission non calculée : le coût d’acquisition est protégé par une permission dédiée, que votre compte ne détient pas.',
  NO_COST_AT_DATE:
    'Commission non calculée : aucun coût d’acquisition n’est renseigné pour ce véhicule à cette date. Un coût absent n’est pas un coût nul.',
  NOT_SUPPLIED:
    'Commission non calculée : ce véhicule n’est pas mis à disposition par un fournisseur. Le coût de référence d’un véhicule ADIKOM et les conditions d’un partenariat ne sont pas arrêtés — aucun montant n’est supposé à leur place.',
  UNIT_MISMATCH:
    'Commission non calculée : le tarif client et le coût d’acquisition ne portent pas la même unité. Un montant journalier et un forfait ne se soustraient pas.',
}

export type Commission = {
  /** Positif, nul ou NÉGATIF — vendre à perte est un fait, pas une erreur. */
  amount: number
  unit: PricingUnit
  /** Taux en pourcentage du tarif client, arrondi à une décimale. */
  rate: number | null
}

export type CommissionResult =
  | { ok: true; commission: Commission }
  | { ok: false; gap: CommissionGap }

/**
 * Commission d'une mise à disposition : tarif client − coût d'acquisition.
 *
 * TROIS RÈGLES, ET AUCUNE N'EST NÉGOCIABLE :
 *
 *   1. UN COÛT ABSENT N'EST PAS UN COÛT NUL. Sans coût applicable, la fonction
 *      rend `NO_COST_AT_DATE` — jamais une commission égale au tarif client,
 *      qui se lirait « 100 % de marge » (DEC-008).
 *   2. UNE COMMISSION NÉGATIVE EST RENDUE TELLE QUELLE. Louer à 35 000 ce qui
 *      coûte 40 000 est un fait ; le ramener à zéro effacerait la perte.
 *   3. DEUX UNITÉS DIFFÉRENTES NE SE SOUSTRAIENT PAS.
 */
export function commission(
  clientPrice: { amount: number; unit: PricingUnit } | null,
  cost: { amount: number; unit: PricingUnit } | null
): CommissionResult {
  if (clientPrice === null) return { ok: false, gap: 'NO_CLIENT_PRICE_ACCESS' }
  if (cost === null) return { ok: false, gap: 'NO_COST_AT_DATE' }
  if (clientPrice.unit !== cost.unit) return { ok: false, gap: 'UNIT_MISMATCH' }

  const amount = clientPrice.amount - cost.amount
  const rate =
    clientPrice.amount > 0 ? Math.round((amount / clientPrice.amount) * 1000) / 10 : null

  return { ok: true, commission: { amount, unit: cost.unit, rate } }
}
