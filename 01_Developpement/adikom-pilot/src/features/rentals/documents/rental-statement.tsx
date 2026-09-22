import 'server-only'

import { Text, View } from '@react-pdf/renderer'

import { DataTable, Field, FieldColumns, Note, Section, StatusChip } from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { formatPrice } from '@/features/pricing/constants'
import { RENTAL_TYPE_LABELS, CADENCE_LABELS } from '@/features/billing-periods/constants'
import { STATUS_LABELS } from '../constants'
import type {
  RentalStatement,
  StatementAmendment,
  StatementInvoice,
  StatementInvoiceLine,
  StatementPayment,
  StatementPeriod,
  StatementTimelineEntry,
} from './statement-data'

/**
 * RELEVÉ DE LOCATION — LOT 24, DEC-048. La cinquième pièce du cycle.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🟥 CE DOCUMENT N'EST PAS UNE FACTURE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🟩 A-6 : « le client peut exiger une facture globale de toute la période de
 * location avec les détails et les historiques de payement ».
 *
 * Plan 02 §3.3 : si cette pièce était une facture, elle créerait une SECONDE
 * créance sur des périodes déjà facturées. Le client devrait douze mensualités
 * ET leur somme ; `customer_invoice_total()` compterait les deux ; le solde du
 * compte client serait faux, et le tableau de bord avec lui.
 *
 * C'est donc un RELEVÉ : il RÉCAPITULE les factures existantes et les
 * règlements enregistrés. Il ne porte aucun numéro de facture, aucune mention
 * « À payer », aucune échéance propre — et il le DIT en toutes lettres, deux
 * fois : sous le titre, et en clôture. Un document remis à un client doit
 * pouvoir être lu sans son mode d'emploi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SIX SECTIONS, ET AUCUN BLOC VIDE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. Contrat            identité, période, régime
 *   2. Chronologie        véhicules, périodes, tarifs successifs
 *   3. Avenants           les actes qui ont modifié le contrat
 *   4. Périodes           le découpage de la créance (longue durée)
 *   5. Factures           chacune gardant son individualité
 *   6. Règlements         l'historique demandé par A-6
 *   7. Synthèse           facturé · réglé · solde
 *
 * Une section sans donnée DISPARAÎT ; une section fermée par un défaut de droit
 * est NOMMÉE (DEC-017). Les deux ne se confondent jamais : « aucun avenant » et
 * « vous n'avez pas le droit de voir les avenants » ne disent pas la même chose.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🟥 AUCUN COÛT, AUCUNE COMMISSION, AUCUNE MARGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Plan 02 §6.4 : « Aucun document destiné à un tiers ne porte un coût
 * d'acquisition, une commission ou une marge. […] ni synthèse de location
 * remise au client. »
 *
 * Ce modèle ne les OMET PAS : IL NE LES REÇOIT PAS. `RentalStatement` n'a
 * aucun champ qui les porte, et `document.test.ts` refuse structurellement
 * qu'un terme du domaine du coût entre dans ce fichier. C'est la seule barrière
 * qui tienne lorsque le demandeur détient le droit de lire le coût.
 */

export type RentalStatementDocumentProps = {
  identity: DocumentIdentity
  statement: RentalStatement
  issuedOn: string
}

/** Ce que le relevé affirme de lui-même, là où le lecteur commence. */
const NATURE =
  'Ce relevé récapitule les factures et les règlements existants de cette location. ' +
  'Il ne constitue pas une facture et ne crée aucune créance nouvelle.'

export function RentalStatementDocument({
  identity,
  statement,
  issuedOn,
}: RentalStatementDocumentProps) {
  const { rental, client, timeline, amendments, periods, invoices, payments, totals, showAmounts } =
    statement

  const kmf = (value: number) => formatAmount(value, { withCurrency: true })
  const longTerm = rental.rentalType === 'LONG_TERM'

  return (
    <DocumentShell
      identity={identity}
      title="Relevé de location"
      reference={rental.rentalNo}
      subtitle="Récapitulatif des factures et des règlements — ne constitue pas une facture"
      issuedOn={issuedOn}
    >
      {/*
        LA NATURE DU DOCUMENT, AVANT SON CONTENU.

        Placée en tête, et non reléguée en pied de page : un relevé qui
        ressemble à une facture sera lu comme une facture par qui ne lit que la
        première page.
      */}
      <View style={{ marginBottom: 12 }}>
        <Note>{NATURE}</Note>
      </View>

      {/* ------------------------------------------------- 1. Le contrat -- */}
      <Section title={client ? `Client — ${client.displayName}` : 'Client'}>
        {!client ? (
          <Note>
            L’identité du client ne figure pas sur ce document : sa consultation n’est pas
            autorisée pour le compte qui l’a produit.
          </Note>
        ) : (
          <FieldColumns
            left={
              <>
                <Field label="Identifiant" value={client.clientNo} />
                <Field label="Téléphone" value={client.phone} />
                <Field label="Email" value={client.email} />
              </>
            }
            right={
              <>
                <Field label="Adresse" value={client.address} />
                <Field label="Ville" value={client.city} />
                <Field label="Pays" value={client.country} />
              </>
            }
          />
        )}
      </Section>

      <Section title="Contrat">
        <View style={{ marginBottom: 8 }}>
          <StatusChip label={STATUS_LABELS[rental.status]} tone="info" />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Numéro de contrat" value={rental.rentalNo} />
              <Field label="Réservation" value={rental.reservationNo} />
              <Field label="Régime" value={RENTAL_TYPE_LABELS[rental.rentalType]} />
              {/* La cadence n'existe QUE en longue durée : la taire ailleurs
                  évite d'annoncer une périodicité qui ne s'applique pas. */}
              {longTerm && rental.billingCadence && (
                <Field label="Cadence" value={CADENCE_LABELS[rental.billingCadence]} />
              )}
            </>
          }
          right={
            <>
              <Field label="Début prévu" value={formatDateTime(rental.plannedFrom)} />
              <Field label="Départ réel" value={formatDateTime(rental.startedAt)} />
              <Field label="Retour attendu" value={formatDateTime(rental.expectedReturnAt)} />
              <Field label="Retour réel" value={formatDateTime(rental.returnedAt)} />
            </>
          }
        />

        {/*
          UN RELEVÉ INTERMÉDIAIRE LE DIT.

          Le document sert le contrat en cours comme le contrat terminé — c'est
          même en cours de longue durée qu'un client le réclame. Il doit alors
          annoncer qu'il n'est pas définitif, faute de quoi il se lirait comme
          un décompte final.
        */}
        {rental.returnedAt === null && (
          <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
            Cette location n’est pas terminée : le présent relevé décrit sa situation à la date
            d’édition figurant en en-tête. Des factures et des règlements peuvent s’y ajouter.
          </Text>
        )}
      </Section>

      {/* ---------------------------------------------- 2. Chronologie --- */}
      <TimelineSection entries={timeline} showAmounts={showAmounts} />

      {/* ------------------------------------------------- 3. Avenants --- */}
      <AmendmentsSection amendments={amendments} />

      {/* -------------------------------------- 4. Périodes facturables -- */}
      {longTerm && <PeriodsSection periods={periods} />}

      {/* ------------------------------------------------- 5. Factures --- */}
      <InvoicesSection invoices={invoices} longTerm={longTerm} kmf={kmf} />

      {/* ----------------------------------------------- 6. Règlements --- */}
      <PaymentsSection payments={payments} kmf={kmf} />

      {/* ------------------------------------- 7. Synthèse financière ---- */}
      <TotalsSection totals={totals} readableInvoices={invoices !== null} kmf={kmf} />

      {/* La clôture redit la nature du document, pour qui n'a lu que la fin. */}
      <Section title="Portée de ce document">
        <Note>
          {NATURE} Les factures énumérées ci-dessus conservent chacune leur numéro, leur échéance
          et leur solde propres : elles restent les seuls titres de créance. Aucune somme n’est ici
          réclamée une seconde fois.
        </Note>
      </Section>
    </DocumentShell>
  )
}

/* -------------------------------------------------------------------------- */
/*  2. Chronologie — véhicules, périodes et tarifs successifs                  */
/* -------------------------------------------------------------------------- */

/**
 * L'histoire du contrat, telle que les segments l'ont enregistrée — LOT 22.
 *
 * Contrairement au contrat de location, LE TABLEAU RESTE AFFICHÉ MÊME POUR UNE
 * SEULE PÉRIODE : c'est ici la section qui répond à « quel véhicule, du … au …,
 * à quel tarif ». La masquer priverait de sa chronologie le contrat le plus
 * simple — celui qui n'a jamais changé de véhicule.
 *
 * ⚠ `StatementTimelineEntry` ne porte AUCUN coût : le type écarte la colonne.
 */
function TimelineSection({
  entries,
  showAmounts,
}: {
  entries: StatementTimelineEntry[]
  showAmounts: boolean
}) {
  if (entries.length === 0) return null

  return (
    <Section title="Chronologie du contrat">
      <DataTable
        columns={[
          { header: 'N°', width: '7%', cell: (row: StatementTimelineEntry) => String(row.sequenceNo) },
          {
            header: 'Véhicule',
            width: showAmounts ? '35%' : '52%',
            cell: (row: StatementTimelineEntry) => row.vehicleLabel ?? 'Non communiqué',
          },
          { header: 'Du', width: '18%', cell: (row: StatementTimelineEntry) => formatDate(row.from) ?? '—' },
          { header: 'Au', width: '18%', cell: (row: StatementTimelineEntry) => formatDate(row.to) ?? '—' },
          ...(showAmounts
            ? [
                {
                  header: 'Tarif',
                  width: '17%',
                  align: 'right' as const,
                  cell: (row: StatementTimelineEntry) => formatPrice(row.amount, row.unit),
                },
              ]
            : []),
          { header: 'État', width: '13%', cell: (row: StatementTimelineEntry) => row.statusLabel },
        ]}
        rows={entries}
        emptyLabel="Aucune période enregistrée."
      />
      <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
        {showAmounts
          ? 'Les tarifs figurant ci-dessus sont ceux qui ont été verrouillés au contrat et à ses avenants. La date de fin d’une période est l’instant où la suivante commence : elle n’est pas comptée deux fois. Ces tarifs ne constituent pas un décompte : les montants facturés figurent au chapitre « Factures ».'
          : 'La date de fin d’une période est l’instant où la suivante commence : elle n’est pas comptée deux fois. Les tarifs ne figurent pas sur ce document : leur consultation n’est pas autorisée pour le compte qui l’a produit.'}
      </Text>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*  3. Avenants                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 🟩 A-4 : « On garde le même contrat et on rajoute des avenants. »
 *
 * Un contrat sans avenant n'a rien à montrer ici, et la section disparaît
 * plutôt que d'annoncer un tableau vide. Le MOTIF est repris : il figure déjà
 * sur l'avenant remis au client, et c'est lui qui rend la chronologie lisible —
 * « pourquoi le véhicule a-t-il changé le 10 ? ».
 */
function AmendmentsSection({ amendments }: { amendments: StatementAmendment[] }) {
  if (amendments.length === 0) return null

  return (
    <Section title="Avenants au contrat">
      <DataTable
        columns={[
          { header: 'N°', width: '20%', cell: (row: StatementAmendment) => row.amendmentNo },
          { header: 'Nature', width: '22%', cell: (row: StatementAmendment) => row.kindLabel },
          {
            header: 'Effet au',
            width: '16%',
            cell: (row: StatementAmendment) => formatDate(row.effectiveAt) ?? '—',
          },
          { header: 'Motif', width: '42%', cell: (row: StatementAmendment) => row.reason },
        ]}
        rows={amendments}
      />
      {amendments.some((amendment) => amendment.rateOverride) && (
        <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
          Un ou plusieurs avenants portent un tarif convenu différent du barème. Le tarif retenu
          figure au chapitre « Chronologie du contrat ».
        </Text>
      )}
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*  4. Périodes facturables — longue durée seulement                           */
/* -------------------------------------------------------------------------- */

/**
 * Le découpage de la CRÉANCE, distinct de celui de l'exploitation — LOT 23.
 *
 * Une période facturable peut traverser plusieurs segments, et un segment
 * plusieurs périodes : les deux tableaux se croisent sans coïncider. Le relevé
 * les présente séparément plutôt que de les fondre, ce qui aurait fabriqué une
 * troisième lecture que la base ne connaît pas.
 *
 * Réservé à la longue durée : une location à durée fixée n'a pas de découpage,
 * et un tableau d'une ligne redirait sa période.
 */
function PeriodsSection({ periods }: { periods: StatementPeriod[] }) {
  if (periods.length === 0) return null

  return (
    <Section title="Périodes facturables">
      <DataTable
        columns={[
          { header: 'N°', width: '7%', cell: (row: StatementPeriod) => String(row.sequenceNo) },
          { header: 'Du', width: '19%', cell: (row: StatementPeriod) => formatDate(row.from) ?? '—' },
          { header: 'Au', width: '19%', cell: (row: StatementPeriod) => formatDate(row.to) ?? '—' },
          { header: 'Origine', width: '22%', cell: (row: StatementPeriod) => row.originLabel },
          { header: 'État', width: '16%', cell: (row: StatementPeriod) => row.stateLabel },
          {
            header: 'Facture',
            width: '17%',
            cell: (row: StatementPeriod) => row.invoiceNo ?? '—',
          },
        ]}
        rows={periods}
      />
      <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
        Chaque période reçoit une facture, et une seule. Une période sans facture n’a pas encore
        été facturée : elle ne l’a pas été deux fois.
      </Text>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*  5. Factures                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 🟥 CHAQUE FACTURE GARDE SON INDIVIDUALITÉ.
 *
 * Elles ne sont JAMAIS fusionnées en une facture globale fictive : leur somme
 * apparaît au chapitre « Synthèse », comme un TOTAL, jamais comme une pièce.
 * C'est toute la différence que Plan 02 §3.3 sépare.
 *
 * Le détail des lignes suit chaque facture : c'est le « avec les détails »
 * qu'exige A-6. Un relevé qui n'aurait porté que des totaux aurait obligé le
 * client à réclamer, en plus, chacune de ses factures.
 */
function InvoicesSection({
  invoices,
  longTerm,
  kmf,
}: {
  invoices: StatementInvoice[] | null
  longTerm: boolean
  kmf: (value: number) => string
}) {
  // `null` = pas le droit. Le dire, plutôt que d'afficher un tableau vide qui
  // se lirait « cette location n'a jamais été facturée » (DEC-017).
  if (invoices === null) {
    return (
      <Section title="Factures">
        <Note>
          Les factures de cette location ne figurent pas sur ce document : leur consultation n’est
          pas autorisée pour le compte qui l’a produit.
        </Note>
      </Section>
    )
  }

  if (invoices.length === 0) {
    return (
      <Section title="Factures">
        <Note>Aucune facture n’a encore été établie pour cette location.</Note>
      </Section>
    )
  }

  return (
    <>
      <Section title="Factures">
        <DataTable
          columns={[
            { header: 'Numéro', width: '22%', cell: (row: StatementInvoice) => row.invoiceNo },
            ...(longTerm
              ? [
                  {
                    header: 'Période',
                    width: '11%',
                    cell: (row: StatementInvoice) =>
                      row.periodSequenceNo === null ? '—' : `n° ${row.periodSequenceNo}`,
                  },
                ]
              : []),
            {
              header: 'Date',
              width: longTerm ? '13%' : '16%',
              cell: (row: StatementInvoice) => formatDate(row.invoiceDate) ?? '—',
            },
            {
              header: 'Échéance',
              width: longTerm ? '13%' : '16%',
              cell: (row: StatementInvoice) => formatDate(row.dueDate) ?? '—',
            },
            { header: 'État', width: '17%', cell: (row: StatementInvoice) => row.statusLabel },
            {
              header: 'Montant',
              width: longTerm ? '24%' : '29%',
              align: 'right',
              cell: (row: StatementInvoice) => kmf(row.total),
            },
          ]}
          rows={invoices}
        />
        <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
          Chaque facture conserve son numéro, son échéance et son solde propres. Le présent relevé
          les récapitule sans les remplacer.
        </Text>
      </Section>

      {/*
        LE DÉTAIL DES LIGNES — « avec les détails » (A-6).

        Une facture sans ligne ne produit pas de bloc : la mention « aucune
        ligne » sous un montant nul n'apprendrait rien.
      */}
      {invoices
        .filter((invoice) => invoice.lines.length > 0)
        .map((invoice) => (
          <Section key={invoice.invoiceNo} title={`Détail de la facture ${invoice.invoiceNo}`}>
            <DataTable
              columns={[
                {
                  header: 'Désignation',
                  width: '52%',
                  cell: (line: StatementInvoiceLine) => line.label,
                },
                {
                  header: 'Qté',
                  width: '10%',
                  align: 'right',
                  cell: (line: StatementInvoiceLine) => String(line.quantity),
                },
                {
                  header: 'Prix unitaire',
                  width: '19%',
                  align: 'right',
                  cell: (line: StatementInvoiceLine) => kmf(line.unitPrice),
                },
                {
                  header: 'Montant',
                  width: '19%',
                  align: 'right',
                  // Une réduction SE SOUSTRAIT : le montant reste positif en
                  // base, c'est la nature qui porte le sens (Workflow 07 §24).
                  cell: (line: StatementInvoiceLine) =>
                    line.deduction ? `− ${kmf(line.lineTotal)}` : kmf(line.lineTotal),
                },
              ]}
              rows={invoice.lines}
            />
            <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
              Total de la facture {invoice.invoiceNo} : {kmf(invoice.total)}
              {invoice.remainingDue !== null && ` · Solde restant : ${kmf(invoice.remainingDue)}`}
            </Text>
          </Section>
        ))}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  6. Règlements                                                              */
/* -------------------------------------------------------------------------- */

/**
 * « … et les historiques de payement » — le second membre de A-6.
 *
 * C'est ce qu'une facture ne porte JAMAIS : aucune pièce de créance n'énumère
 * ses propres encaissements. Ce chapitre est la raison d'être du relevé.
 *
 * LES RÈGLEMENTS ANNULÉS Y FIGURENT, marqués comme tels. Les taire ferait
 * disparaître du récapitulatif un mouvement que le client a pu voir passer sur
 * son relevé bancaire, et qu'il chercherait ensuite à faire valoir. Ils ne sont
 * pas comptés dans la synthèse.
 */
function PaymentsSection({
  payments,
  kmf,
}: {
  payments: StatementPayment[] | null
  kmf: (value: number) => string
}) {
  if (payments === null) {
    return (
      <Section title="Règlements">
        <Note>
          L’historique des règlements ne figure pas sur ce document : sa consultation n’est pas
          autorisée pour le compte qui l’a produit.
        </Note>
      </Section>
    )
  }

  if (payments.length === 0) {
    return (
      <Section title="Règlements">
        <Note>Aucun règlement n’a été enregistré sur les factures de cette location.</Note>
      </Section>
    )
  }

  const cancelled = payments.filter((payment) => payment.cancelled).length

  return (
    <Section title="Règlements">
      <DataTable
        columns={[
          {
            header: 'Date',
            width: '14%',
            cell: (row: StatementPayment) => formatDate(row.receivedOn) ?? '—',
          },
          { header: 'Référence', width: '20%', cell: (row: StatementPayment) => row.paymentNo },
          { header: 'Mode', width: '18%', cell: (row: StatementPayment) => row.methodLabel },
          {
            header: 'Facture',
            width: '21%',
            cell: (row: StatementPayment) => row.invoiceNo ?? '—',
          },
          {
            header: 'Pièce',
            width: '12%',
            cell: (row: StatementPayment) => row.externalRef ?? '—',
          },
          {
            header: 'Montant',
            width: '15%',
            align: 'right',
            // Un règlement annulé n'a rien encaissé : le montant est barré d'un
            // mot, faute de pouvoir l'être d'un trait dans un tableau PDF.
            cell: (row: StatementPayment) =>
              row.cancelled ? `${kmf(row.amount)} (annulé)` : kmf(row.amount),
          },
        ]}
        rows={payments}
      />
      {cancelled > 0 && (
        <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
          {cancelled === 1
            ? 'Un règlement a été annulé : il figure ci-dessus pour mémoire et n’entre pas dans le total réglé.'
            : `${cancelled} règlements ont été annulés : ils figurent ci-dessus pour mémoire et n’entrent pas dans le total réglé.`}
        </Text>
      )}
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*  7. Synthèse financière                                                     */
/* -------------------------------------------------------------------------- */

/**
 * FACTURÉ · RÉGLÉ · SOLDE — et ce que chacun recouvre.
 *
 * 🟥 CES TROIS MONTANTS NE SONT PAS UNE FACTURE. Le solde est celui des
 * factures déjà émises : il est déjà dû au titre de ces factures, et le relevé
 * ne le réclame pas une seconde fois. La mention finale le dit.
 *
 * Un BROUILLON n'est pas compté — il ne reconnaît aucune créance — mais son
 * existence est ANNONCÉE : un total silencieusement amputé se lirait comme une
 * erreur de calcul par qui a vu la facture à l'écran.
 */
function TotalsSection({
  totals,
  readableInvoices,
  kmf,
}: {
  totals: RentalStatement['totals']
  readableInvoices: boolean
  kmf: (value: number) => string
}) {
  if (totals === null) {
    // Sans les factures, il n'y a rien à synthétiser. Le chapitre « Factures »
    // a déjà nommé le motif ; le redire ici encombrerait sans rien ajouter.
    if (!readableInvoices) return null
    return null
  }

  return (
    <Section title="Synthèse financière">
      <FieldColumns
        left={
          <>
            <Field label="Total facturé" value={kmf(totals.invoiced)} />
            <Field
              label="Total réglé"
              value={totals.paid === null ? null : kmf(totals.paid)}
            />
          </>
        }
        right={
          <Field
            label="Solde restant"
            value={totals.balance === null ? null : kmf(totals.balance)}
          />
        }
      />

      <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 6 }}>
        Le total facturé est la somme des factures ÉMISES de cette location ; les factures annulées
        n’y figurent pas. Le total réglé est celui des règlements validés reçus sur ces mêmes
        factures. Le solde est leur différence.
      </Text>

      {totals.paid === null && (
        <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
          Le total réglé et le solde ne figurent pas sur ce document : la consultation des
          règlements n’est pas autorisée pour le compte qui l’a produit. Aucun montant n’est
          affiché à leur place.
        </Text>
      )}

      {totals.draftCount > 0 && (
        <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
          {totals.draftCount === 1
            ? `Une facture en préparation, de ${kmf(totals.draftAmount)}, n’est pas comprise dans ce total : un brouillon ne reconnaît aucune créance tant qu’il n’est pas émis.`
            : `${totals.draftCount} factures en préparation, de ${kmf(totals.draftAmount)} au total, ne sont pas comprises dans ce total : un brouillon ne reconnaît aucune créance tant qu’il n’est pas émis.`}
        </Text>
      )}
    </Section>
  )
}
