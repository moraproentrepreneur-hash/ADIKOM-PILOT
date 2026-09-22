import 'server-only'

import { can } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { getClientDetail, type ClientDetail } from '@/features/clients/data'
import { listRentalAmendments, listRentalSegments } from '@/features/amendments/data'
import { SEGMENT_STATUS_LABELS, AMENDMENT_KIND_LABELS } from '@/features/amendments/constants'
import { listBillingPeriods } from '@/features/billing-periods/data'
import { ORIGIN_LABELS, periodState, PERIOD_STATE_LABELS } from '@/features/billing-periods/constants'
import {
  listCustomerInvoiceLines,
  listInvoicesForRental,
} from '@/features/customer-invoices/data'
import { displayStatus as invoiceDisplayStatus } from '@/features/customer-invoices/constants'
import { CUSTOMER_INVOICE_STATUS_LABELS } from '@/features/customer-invoices/constants'
import { listRentalPayments } from '@/features/customer-payments/data'
import { PAYMENT_METHOD_LABELS } from '@/features/treasury/constants'
import { getRentalDetail, type RentalDetail } from '../data'
import type { ContractPeriod } from './rental-blocks'

/**
 * Le RELEVÉ DE LOCATION, assemblé — LOT 24, DEC-048.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE DOCUMENT NE CRÉE AUCUNE CRÉANCE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🟩 A-6 : « le client peut exiger une facture globale de toute la période de
 * location avec les détails et les historiques de payement ».
 *
 * Plan 02 §3.3 a tranché la lecture : une facture ne porte JAMAIS l'historique
 * de ses propres règlements. Ce que la Direction décrit est un RELEVÉ. Émettre
 * une seconde facture couvrant des périodes déjà facturées doublerait la
 * créance — le client devrait douze mensualités ET leur somme.
 *
 * Ce module ne fait donc que LIRE. Il n'écrit rien, n'appelle aucune action,
 * n'ouvre aucune transaction. Générer un relevé est une opération sans effet
 * financier, et la recette du lot le photographie avant / après.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IL NE RECALCULE PAS L'HISTOIRE — DEC-008
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Aucun montant n'est reconstitué en multipliant une durée par un tarif : la
 * règle d'arrondi — jour entamé, heure de retour, franchise — n'est pas
 * arrêtée. LES FACTURES ÉMISES RESTENT LA VÉRITÉ FINANCIÈRE. Le relevé reprend
 * leurs totaux, leurs lignes et leurs règlements ; il additionne, il n'invente
 * pas. La chronologie porte les tarifs VERROUILLÉS des segments, qui sont des
 * faits enregistrés, jamais un décompte.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUCUN COÛT FOURNISSEUR — Plan 02 §6.3, barrière n° 3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les types ci-dessous ÉCARTENT les colonnes confidentielles plutôt que de
 * compter sur le modèle PDF pour ne pas les imprimer. `StatementTimelineEntry`
 * réemploie `ContractPeriod` (LOT 22), qui ne porte pas le coût gelé ; aucun
 * champ ne relaie la table qui le conserve, ni commission, ni marge.
 *
 * ⚠ Le balayage structurel refuse jusqu'au NOM de ces colonnes dans ce
 * fichier — y compris en commentaire. C'est volontaire : un terme cité
 * aujourd'hui pour dire qu'on ne l'emploie pas est un terme que la prochaine
 * relecture prendra pour un emploi légitime.
 *
 * C'est la seule barrière qui tienne quand le demandeur DÉTIENT le droit de
 * lire le coût : un Super Admin qui télécharge un relevé ne peut pas en faire
 * sortir un coût que le modèle n'a jamais reçu. `document.test.ts` balaye ce
 * fichier — il vit dans `documents/` pour cette raison.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHAQUE LECTURE EST CONDITIONNÉE À SON PROPRE DROIT — DEC-024
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le relevé AGRÈGE plusieurs domaines. Il ne doit donc jamais devenir la porte
 * dérobée par laquelle un exploitant obtiendrait les factures et les règlements
 * que son profil lui refuse. Ce qui n'est pas autorisé n'est PAS LU — donc ne
 * peut pas figurer au PDF —, et le bloc absent est NOMMÉ plutôt que tu
 * (DEC-017). `null` signifie « pas le droit » ; un tableau vide signifie
 * « rien à montrer ». Les deux ne se confondent jamais.
 */

/* -------------------------------------------------------------------------- */
/*  Projections — ce qu'un relevé peut porter, et rien de plus                 */
/* -------------------------------------------------------------------------- */

/** Une période de la chronologie. Réemploi exact du type du LOT 22. */
export type StatementTimelineEntry = ContractPeriod

/** Un avenant, réduit à ce qui se remet au client. */
export type StatementAmendment = {
  amendmentNo: string
  sequenceNo: number
  kindLabel: string
  effectiveAt: string
  /**
   * Le motif est CONTRACTUEL : il figure déjà sur l'avenant remis au client
   * (LOT 22). Le reprendre ici ne divulgue donc rien de neuf.
   */
  reason: string
  /** Un tarif dérogatoire est signalé ; sa justification interne ne l'est pas. */
  rateOverride: boolean
}

/** Une période facturable, telle que le contrat la découpe. */
export type StatementPeriod = {
  sequenceNo: number
  from: string
  to: string
  originLabel: string
  stateLabel: string
  /** `null` sans `billing.customer_invoices.view`, ou sans facture. */
  invoiceNo: string | null
}

/** Une ligne de facture, reprise telle qu'elle est enregistrée. */
export type StatementInvoiceLine = {
  label: string
  quantity: number
  unitPrice: number
  lineTotal: number
  /** Une réduction se soustrait ; c'est la nature qui porte le sens. */
  deduction: boolean
}

/** Une facture du contrat — annulées exclues par la source. */
export type StatementInvoice = {
  invoiceNo: string
  /** L'état AFFICHÉ : « Payée » et « En retard » se calculent (DEC-025 §a). */
  statusLabel: string
  /** L'état STOCKÉ, qui décide seul de la créance reconnue. */
  recognised: boolean
  invoiceDate: string
  dueDate: string | null
  total: number
  /** `null` sans `billing.customer_payments.view`. */
  paidAmount: number | null
  remainingDue: number | null
  /** Bornes de la période couverte, pour une longue durée. `null` sinon. */
  periodSequenceNo: number | null
  lines: StatementInvoiceLine[]
}

/** Un règlement, tel qu'il a été enregistré. */
export type StatementPayment = {
  paymentNo: string
  receivedOn: string
  methodLabel: string
  externalRef: string | null
  amount: number
  /** La facture qu'il solde. `null` si elle n'est pas lisible. */
  invoiceNo: string | null
  /** Un règlement annulé se MONTRE et ne se COMPTE pas. */
  cancelled: boolean
}

/**
 * La synthèse financière — calculée des seules sources déjà reconnues.
 *
 * 🟥 CE QUI COMPTE, ET CE QUI NE COMPTE PAS. Les règles ne sont pas réinventées
 * ici : ce sont celles du pilotage (migration 052), appliquées au périmètre d'un
 * contrat plutôt qu'à une fenêtre de dates.
 *
 *   · FACTURÉ   Σ des totaux des factures dont l'état STOCKÉ est `ISSUED`.
 *               Un BROUILLON ne reconnaît aucune créance — il se modifie encore
 *               (`CUSTOMER_INVOICE_STATUS_EFFECT.DRAFT`). Une ANNULÉE n'en porte
 *               plus : la source l'a déjà écartée.
 *   · RÉGLÉ     Σ des règlements VALIDÉS portant sur ces mêmes factures. Un
 *               règlement annulé n'a rien encaissé — son écriture de trésorerie
 *               a été retirée (migration 054).
 *   · SOLDE     Facturé − Réglé. Jamais une colonne : une troisième valeur
 *               stockée finirait par contredire les deux premières.
 *
 * AUCUN DOUBLE COMPTAGE N'EST POSSIBLE : chaque facture est comptée une fois,
 * chaque règlement une fois, et le relevé n'ajoute aucune créance de synthèse
 * au-dessus des factures qu'il récapitule.
 */
export type StatementTotals = {
  invoiced: number
  /** `null` sans `billing.customer_payments.view` : on ne conclut alors RIEN. */
  paid: number | null
  balance: number | null
  /** Nombre de factures en brouillon écartées du total — le PDF le dit. */
  draftCount: number
  draftAmount: number
}

export type RentalStatement = {
  rental: RentalDetail
  /** `null` sans `parties.clients.view`. */
  client: ClientDetail | null
  timeline: StatementTimelineEntry[]
  amendments: StatementAmendment[]
  periods: StatementPeriod[]
  /** `null` sans `billing.customer_invoices.view` — le document le DIT. */
  invoices: StatementInvoice[] | null
  /** `null` sans `billing.customer_payments.view` — le document le DIT. */
  payments: StatementPayment[] | null
  /** `null` lorsque les factures ne sont pas lisibles : rien à synthétiser. */
  totals: StatementTotals | null
  /** `null` sans `rental.rentals.financial.view` : aucun montant n'est composé. */
  showAmounts: boolean
}

/* -------------------------------------------------------------------------- */
/*  Assemblage                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Assemble le relevé d'une location, à l'instant de sa génération.
 *
 * LE RELEVÉ N'EXIGE PAS UN CONTRAT TERMINÉ. Aucune règle du Plan 02 ne le
 * demande, et le besoin exprimé — « le client peut exiger » — ne l'attend pas :
 * un client de longue durée réclame son récapitulatif EN COURS de location,
 * c'est même le seul moment où il en a besoin. Un seul document sert les deux
 * cas et reflète l'état du contrat à sa DATE D'ÉDITION, laquelle figure en
 * en-tête de chaque page. Deux documents auraient divergé.
 *
 * Rend `null` si la location n'existe pas ou n'est pas lisible : la route ne
 * distingue pas les deux, afin de ne rien révéler d'une donnée inaccessible.
 */
export async function buildRentalStatement(rentalId: string): Promise<RentalStatement | null> {
  const rental = await getRentalDetail(rentalId)
  if (!rental) return null

  const [mayReadClient, showAmounts, mayReadInvoices, mayReadPayments] = await Promise.all([
    can(PERMISSIONS.CLIENTS_VIEW),
    can(PERMISSIONS.RENTALS_FINANCIAL_VIEW),
    can(PERMISSIONS.CUSTOMER_INVOICES_VIEW),
    can(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW),
  ])

  const [client, segments, amendments, periods] = await Promise.all([
    mayReadClient ? getClientDetail(rental.clientId) : Promise.resolve(null),
    // Segments, avenants et périodes s'ouvrent par `rental.rentals.view` : ils
    // sont l'organisation du contrat, que la route a déjà exigée.
    listRentalSegments(rentalId),
    listRentalAmendments(rentalId),
    listBillingPeriods(rentalId, { canSeeInvoices: mayReadInvoices }),
  ])

  /*
   * L'INSTANT DE RÉFÉRENCE, DÉCIDÉ UNE FOIS.
   *
   * Deux appels à `new Date()` dans un même assemblage peuvent tomber de part
   * et d'autre d'une borne : une période se lirait « À venir » en haut du
   * document et « Facturable » en bas.
   */
  const now = new Date()

  const invoices = mayReadInvoices
    ? await listInvoicesForRental(rentalId, { canSeePayments: mayReadPayments })
    : null

  /*
   * Les lignes sont chargées par facture. Une jointure unique aurait été plus
   * courte, mais `listCustomerInvoiceLines` porte déjà le filtrage des lignes
   * archivées et le calcul du total de ligne : le dupliquer aurait créé une
   * seconde règle, donc une occasion de diverger.
   */
  const lines = invoices
    ? await Promise.all(invoices.map((invoice) => listCustomerInvoiceLines(invoice.id)))
    : []

  const payments = mayReadPayments ? await listRentalPayments(rentalId) : null

  const periodSequence = new Map(periods.map((period) => [period.id, period.sequenceNo]))

  const statementInvoices: StatementInvoice[] | null =
    invoices?.map((invoice, index) => ({
      invoiceNo: invoice.invoiceNo,
      statusLabel:
        CUSTOMER_INVOICE_STATUS_LABELS[
          invoiceDisplayStatus(
            invoice.status,
            invoice.dueDate,
            invoice.total,
            invoice.paidAmount
          )
        ],
      // L'état STOCKÉ, et lui seul : « Payée » n'existe pas en base, et une
      // facture encaissée y reste « Émise ». C'est ce qui décide de la créance.
      recognised: invoice.status === 'ISSUED',
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      total: invoice.total,
      paidAmount: invoice.paidAmount,
      remainingDue: invoice.remainingDue,
      periodSequenceNo: invoice.billingPeriodId
        ? (periodSequence.get(invoice.billingPeriodId) ?? null)
        : null,
      lines: (lines[index] ?? []).map((line) => ({
        label: line.label,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        deduction: line.kind === 'DISCOUNT',
      })),
    })) ?? null

  const statementPayments: StatementPayment[] | null =
    payments?.map((payment) => ({
      paymentNo: payment.paymentNo,
      receivedOn: payment.receivedOn,
      methodLabel: PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
      externalRef: payment.externalRef,
      amount: payment.amount,
      invoiceNo: payment.invoiceNo,
      cancelled: payment.status === 'CANCELLED',
    })) ?? null

  return {
    rental,
    client,
    timeline: segments.map(toTimelineEntry),
    amendments: amendments.map((amendment) => ({
      amendmentNo: amendment.amendmentNo,
      sequenceNo: amendment.sequenceNo,
      kindLabel: AMENDMENT_KIND_LABELS[amendment.kind],
      effectiveAt: amendment.effectiveAt,
      reason: amendment.reason,
      rateOverride: amendment.rateOverride,
    })),
    periods: periods.map((period) => ({
      sequenceNo: period.sequenceNo,
      from: period.from,
      to: period.to,
      originLabel: ORIGIN_LABELS[period.origin] ?? period.origin,
      stateLabel: PERIOD_STATE_LABELS[periodState(period, now)],
      invoiceNo: period.invoiceNo,
    })),
    invoices: statementInvoices,
    payments: statementPayments,
    totals: statementInvoices ? totals(statementInvoices, statementPayments) : null,
    showAmounts,
  }
}

/**
 * Un segment, réduit à ce qu'un relevé peut montrer — et rien de plus.
 *
 * 🟥 LA CONVERSION EST LA BARRIÈRE, comme pour les autres documents du cycle.
 * `RentalSegment` porte un coût gelé, confidentiel (A-2) ; `ContractPeriod` ne
 * le porte pas. Le modèle ne peut donc pas le révéler, même par inadvertance.
 */
function toTimelineEntry(
  segment: Awaited<ReturnType<typeof listRentalSegments>>[number]
): StatementTimelineEntry {
  return {
    sequenceNo: segment.sequenceNo,
    vehicleLabel: segment.vehicleLabel,
    from: segment.from,
    to: segment.to,
    amount: segment.lockedAmount,
    unit: segment.lockedUnit,
    statusLabel: SEGMENT_STATUS_LABELS[segment.status],
  }
}

/**
 * La synthèse financière, calculée en entiers — DEC-010, jamais un flottant.
 *
 * Module PUR : il ne lit rien. C'est ce qui le rend testable ligne à ligne, et
 * ce qui garantit que deux passages sur les mêmes données donnent le même
 * solde.
 */
export function totals(
  invoices: StatementInvoice[],
  payments: StatementPayment[] | null
): StatementTotals {
  const recognised = invoices.filter((invoice) => invoice.recognised)
  const drafts = invoices.filter((invoice) => !invoice.recognised)

  /*
   * L'ENCAISSÉ SE LIT SUR LES FACTURES, NON SUR LE JOURNAL DES RÈGLEMENTS.
   *
   * `paidAmount` est déjà la Σ des règlements VALIDÉS de la facture, calculée
   * par la couche de données du LOT 8. Rejouer cette somme depuis la liste des
   * règlements aurait créé une SECONDE règle d'encaissement, qui aurait fini
   * par diverger de celle qui gouverne la facture et le tableau de bord.
   *
   * Le tableau des règlements reste, lui, l'HISTORIQUE demandé par A-6 : il
   * montre aussi les règlements annulés, que le total ne compte pas.
   */
  const readable = payments !== null && recognised.every((invoice) => invoice.paidAmount !== null)

  const invoiced = recognised.reduce((sum, invoice) => sum + invoice.total, 0)
  const paid = readable
    ? recognised.reduce((sum, invoice) => sum + (invoice.paidAmount ?? 0), 0)
    : null

  return {
    invoiced,
    paid,
    balance: paid === null ? null : invoiced - paid,
    draftCount: drafts.length,
    draftAmount: drafts.reduce((sum, invoice) => sum + invoice.total, 0),
  }
}
