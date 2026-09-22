import type { BadgeTone } from '@/components/ui/primitives'

/**
 * Vocabulaire de la facturation périodique — LOT 23, DEC-047.
 *
 * Séparé de `data.ts`, sans `server-only` : les composants clients ont besoin de
 * ces libellés, et les importer depuis la couche de données entraînerait le
 * client Supabase serveur dans le bundle navigateur.
 *
 * QUATRE MOTS, QUATRE CHOSES, JAMAIS CONFONDUES :
 *
 *   · CONTRAT   ce qui lie ADIKOM au client. Il ne change pas d'identité, même
 *               prolongé (A-4).
 *   · SEGMENT   la chronologie de l'EXPLOITATION : un véhicule, un tarif.
 *   · PÉRIODE   le découpage de la CRÉANCE : ce qu'UNE facture couvre.
 *   FACTURABLE
 *   · FACTURE   la créance elle-même, avec ses lignes et ses règlements.
 *
 * Une période facturable peut traverser plusieurs segments — véhicule A jusqu'au
 * 12 octobre, véhicule B ensuite — et sa facture portera alors une ligne par
 * portion tarifaire. Les deux découpages se croisent sans coïncider.
 */

/* -------------------------------------------------------------------------- */
/*  Régime du contrat — 🟩 A-6                                                 */
/* -------------------------------------------------------------------------- */

export type RentalType = 'FIXED_TERM' | 'LONG_TERM'

export const RENTAL_TYPE_LABELS: Record<RentalType, string> = {
  FIXED_TERM: 'Durée fixée',
  LONG_TERM: 'Longue durée',
}

export const RENTAL_TYPE_TONES: Record<RentalType, BadgeTone> = {
  FIXED_TERM: 'neutral',
  LONG_TERM: 'info',
}

export const RENTAL_TYPE_HELP: Record<RentalType, string> = {
  FIXED_TERM:
    'Une seule facture, établie à la fin du contrat, après le retour et le contrôle. C’est le régime de toutes les locations par défaut.',
  LONG_TERM:
    'Le contrat se facture par périodes successives, en cours de location. Chaque période reçoit sa propre facture, et une seule.',
}

/* -------------------------------------------------------------------------- */
/*  Cadence — 🟩 A-6, les deux cases cochées par la Direction                   */
/* -------------------------------------------------------------------------- */

export type BillingCadence = 'MONTHLY' | 'CONTRACT_TERM'

export const CADENCE_LABELS: Record<BillingCadence, string> = {
  MONTHLY: 'Mensuelle — chaque fin de mois',
  CONTRACT_TERM: 'Période définie au contrat',
}

export const CADENCE_HELP: Record<BillingCadence, string> = {
  MONTHLY:
    'Une période par mois civil, aux dates réelles du contrat : la première court du départ à la fin de son mois, la dernière s’achève avec le contrat. Les bornes suivent l’heure des Comores.',
  CONTRACT_TERM:
    'Une seule période couvrant toute la durée engagée. Une prolongation en ouvre une nouvelle, sans toucher à la précédente.',
}

export const CADENCE_ORDER: BillingCadence[] = ['MONTHLY', 'CONTRACT_TERM']

/* -------------------------------------------------------------------------- */
/*  Origine d'une période                                                      */
/* -------------------------------------------------------------------------- */

export type BillingOrigin = 'MONTHLY' | 'CONTRACT_TERM'

export const ORIGIN_LABELS: Record<BillingOrigin, string> = {
  MONTHLY: 'Échéance mensuelle',
  CONTRACT_TERM: 'Période contractuelle',
}

/* -------------------------------------------------------------------------- */
/*  État d'une période — DÉDUIT, jamais stocké                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ce que l'utilisateur lit, et qui ne vit dans aucune colonne.
 *
 * La base ne stocke que `PLANNED` et `CANCELLED` : le reste se DÉDUIT de la
 * période et de la facture qui la couvre. Stocker « Facturée » créerait une
 * seconde vérité qu'une annulation de facture ferait diverger — exactement ce
 * que `customer_invoices_overdue_is_derived` interdit depuis le LOT 5.
 */
export type BillingPeriodState = 'UPCOMING' | 'BILLABLE' | 'DRAFTED' | 'INVOICED' | 'CANCELLED'

export const PERIOD_STATE_LABELS: Record<BillingPeriodState, string> = {
  UPCOMING: 'À venir',
  BILLABLE: 'Facturable',
  DRAFTED: 'Facture en brouillon',
  INVOICED: 'Facturée',
  CANCELLED: 'Annulée',
}

export const PERIOD_STATE_TONES: Record<BillingPeriodState, BadgeTone> = {
  UPCOMING: 'neutral',
  BILLABLE: 'warning',
  DRAFTED: 'info',
  INVOICED: 'success',
  CANCELLED: 'danger',
}

export const PERIOD_STATE_HELP: Record<BillingPeriodState, string> = {
  UPCOMING:
    'Cette période court encore. Elle se facturera lorsqu’elle sera échue : on ne facture pas un temps qui n’a pas couru.',
  BILLABLE: 'Cette période est échue et n’a pas encore de facture.',
  DRAFTED:
    'Une facture est préparée pour cette période, mais pas encore émise : aucune créance n’est reconnue tant qu’elle reste en brouillon.',
  INVOICED: 'Cette période est couverte par une facture émise. Elle ne se facture pas deux fois.',
  CANCELLED:
    'Cette période a été abandonnée : retour anticipé, contrat annulé, ou découpage corrigé. Elle ne sera jamais facturée.',
}

/* -------------------------------------------------------------------------- */
/*  Ce que l'écran doit dire, et ne jamais taire                               */
/* -------------------------------------------------------------------------- */

/**
 * 🟩 A-6, écrit là où l'utilisateur décide.
 */
export const LONG_TERM_NOTE =
  'Une location de longue durée se facture par périodes : chaque période reçoit une facture, et une seule. Les factures déjà émises ne sont jamais refaites, et aucune facture ne peut couvrir deux fois le même intervalle.'

/**
 * 🟥 LA « FACTURE GLOBALE » N'EST PAS UNE FACTURE — A-6, Plan 02 §3.3.
 *
 * La Direction a écrit : « le client peut exiger une facture globale de toute la
 * période de location avec les détails et les historiques de payement ». Une
 * facture ne porte jamais l'historique de ses propres règlements : ce document
 * est un RELEVÉ. L'écran le dit plutôt que de laisser croire qu'une seconde
 * facture est possible — elle doublerait la créance.
 *
 * LOT 24 (DEC-048) : le document existe désormais. La note cesse d'annoncer un
 * lot à venir et INDIQUE OÙ LE PRODUIRE — une mention qui renverrait encore au
 * « lot suivant » enverrait chercher ailleurs ce qui est à deux onglets de là.
 */
export const GLOBAL_STATEMENT_NOTE =
  'Un client peut demander un récapitulatif de toute la location, avec le détail des factures et l’historique des règlements. Ce document est un RELEVÉ, non une facture : émettre une seconde facture couvrant des périodes déjà facturées doublerait la créance. Le relevé de location se produit depuis l’onglet « Informations », carte « Documents ».'

/**
 * Pourquoi aucune quantité n'est proposée — DEC-008.
 */
export const NO_DURATION_NOTE =
  'Aucune durée n’est proposée : la règle d’arrondi — jour entamé, heure de retour, franchise — n’est pas arrêtée. Le prix unitaire est repris du contrat ; la quantité facturée reste saisie.'

/**
 * Pourquoi le régime se fige dès la première facture.
 */
export const PLAN_LOCKED_NOTE =
  'Le régime de facturation ne se change plus dès qu’une facture existe sur ce contrat : le modifier permettrait de facturer une seconde fois un temps déjà facturé.'

/* -------------------------------------------------------------------------- */
/*  Lecture de l'état d'une période                                            */
/* -------------------------------------------------------------------------- */

/**
 * L'état affiché d'une période, déduit de trois faits et de rien d'autre.
 *
 * Module pur : aucune lecture, aucune date implicite. L'instant de référence est
 * PASSÉ, afin que la fonction soit testable et que deux appels d'un même rendu
 * ne puissent pas se contredire.
 */
export function periodState(period: {
  status: 'PLANNED' | 'CANCELLED'
  to: string
  invoiceStatus: string | null
}, now: Date): BillingPeriodState {
  if (period.status === 'CANCELLED') return 'CANCELLED'
  if (period.invoiceStatus === 'DRAFT') return 'DRAFTED'
  if (period.invoiceStatus !== null) return 'INVOICED'

  const end = new Date(period.to)
  if (Number.isNaN(end.getTime())) return 'UPCOMING'

  return end.getTime() > now.getTime() ? 'UPCOMING' : 'BILLABLE'
}

/* -------------------------------------------------------------------------- */
/*  Portions tarifaires d'une période — consigne §11                           */
/* -------------------------------------------------------------------------- */

/**
 * Ce qu'une portion a besoin de savoir d'un segment, et rien de plus.
 *
 * Structurel plutôt qu'importé : `RentalSegment` vit dans un module
 * `server-only`, et ce fichier est chargé par des composants clients. Un type
 * minimal évite d'entraîner la couche de données dans le bundle navigateur —
 * et il NE PORTE AUCUN COÛT : la confidentialité du tarif fournisseur est
 * portée par le TYPE, pas par la vigilance (LOT 22 §10.8).
 */
export type SegmentLike = {
  id: string
  sequenceNo: number
  status: 'ACTIVE' | 'ENDED' | 'CANCELLED'
  vehicleLabel: string | null
  from: string
  to: string
  lockedAmount: number
  lockedUnit: 'DAY' | 'FLAT'
}

/**
 * Une portion d'une période facturable couverte par UN segment.
 *
 * C'est la réponse à la question de la consigne §11 : « Si une facture doit
 * détailler plusieurs portions tarifaires, utilise les segments comme source
 * historique. »
 *
 *   01/10 → 31/10  = période facturable
 *   01/10 → 12/10  = véhicule A, tarif A   ← portion 1
 *   12/10 → 31/10  = véhicule B, tarif B   ← portion 2
 *
 * Chaque portion donnera UNE LIGNE de facture, de nature « Location », avec le
 * tarif verrouillé de SON segment. Aucune ligne nouvelle n'est inventée : ce
 * sont les `customer_invoice_lines` existantes.
 *
 * AUCUNE DURÉE N'EST CALCULÉE (DEC-008). La portion porte ses bornes et son prix
 * unitaire ; la quantité reste saisie.
 */
export type RatePortion = {
  segmentId: string
  sequenceNo: number
  vehicleLabel: string | null
  from: string
  to: string
  unitPrice: number
  unit: 'DAY' | 'FLAT'
  /** Désignation proposée pour la ligne de facture. */
  label: string
}

/**
 * Découpe une période facturable selon les segments qu'elle traverse.
 *
 * Module PUR : il ne lit rien. Les segments lui sont donnés, et les segments
 * ANNULÉS en sont écartés — ils n'ont jamais couru, donc ils ne se facturent pas.
 */
export function ratePortions(
  period: { from: string; to: string },
  segments: SegmentLike[]
): RatePortion[] {
  const start = new Date(period.from).getTime()
  const end = new Date(period.to).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return []

  const portions: RatePortion[] = []

  for (const segment of segments) {
    if (segment.status === 'CANCELLED') continue

    const segStart = new Date(segment.from).getTime()
    const segEnd = new Date(segment.to).getTime()
    if (Number.isNaN(segStart) || Number.isNaN(segEnd)) continue

    const from = Math.max(start, segStart)
    const to = Math.min(end, segEnd)

    /*
     * Bornes semi-ouvertes `[début, fin)` : une intersection de durée nulle
     * n'est PAS une portion (LOT 22 §4.4). Sans ce refus, le segment qui
     * s'achève à l'instant même où la période commence produirait une ligne de
     * facture sur une durée nulle.
     */
    if (from >= to) continue

    const fromIso = new Date(from).toISOString()
    const toIso = new Date(to).toISOString()

    portions.push({
      segmentId: segment.id,
      sequenceNo: segment.sequenceNo,
      vehicleLabel: segment.vehicleLabel,
      from: fromIso,
      to: toIso,
      unitPrice: segment.lockedAmount,
      unit: segment.lockedUnit,
      label: `Location ${segment.vehicleLabel ?? 'véhicule'} — ${formatDay(fromIso)} au ${formatDay(toIso)}`,
    })
  }

  return portions
}

/**
 * `JJ/MM/AAAA` à l'heure DES COMORES.
 *
 * ⚠ Le fuseau est explicite : un instant de 22 h UTC est daté du LENDEMAIN à
 * Moroni, et une désignation de ligne de facture qui se tromperait de jour
 * serait remise au client (DEC-025 §e).
 */
function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Indian/Comoro',
  }).format(new Date(iso))
}
