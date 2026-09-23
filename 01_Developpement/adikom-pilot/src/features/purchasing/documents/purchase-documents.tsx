import 'server-only'

import { View } from '@react-pdf/renderer'

import {
  DataTable,
  Field,
  FieldColumns,
  Note,
  Section,
  StatusChip,
  type ChipTone,
} from '@/lib/documents/blocks'
import { DocumentShell } from '@/lib/documents/layout'
import type { DocumentIdentity } from '@/lib/documents/identity'
import { formatDate } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_QUOTE_STATUS_LABELS,
  type PurchaseOrderStatus,
  type PurchaseQuoteStatus,
} from '../constants'
import type { PurchaseLine, PurchaseOrderDetail, PurchaseQuoteDetail } from '../data'

/**
 * Devis et commande fournisseurs — documents A4, LOT 26.
 *
 * AUCUN SECOND MOTEUR PDF. Ils réemploient `DocumentShell`, la charte, le logo
 * officiel, la pagination et les blocs des treize documents déjà livrés.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🟥 DEUX PIÈCES, DEUX DESTINATIONS — ET LA CONFIDENTIALITÉ N'Y EST PAS LA MÊME
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   DEVIS FOURNISSEUR    pièce INTERNE. Elle restitue l'offre reçue, pour la
 *                        comparer, la classer, la faire viser.
 *   COMMANDE FOURNISSEUR pièce DESTINÉE AU FOURNISSEUR. Elle porte le prix
 *                        convenu AVEC LUI — ce n'est pas une fuite : c'est
 *                        précisément ce qu'il doit lire pour honorer la commande.
 *
 * La confidentialité des coûts d'achat, ici, ne consiste donc PAS à taire des
 * montants : elle consiste à ce que la pièce n'existe QUE pour qui détient
 * `commerce.purchase_quotes.download` / `.print` — ou celles de la commande —,
 * chacune distincte de `view` (DEC-024).
 *
 * 🟥 CE QUE CES MODÈLES NE PEUVENT PAS RÉVÉLER, ET POURQUOI C'EST STRUCTUREL
 *
 * Le LOT 24 a établi qu'un BALAYAGE D'OCTETS d'un PDF NE PROUVE RIEN : les flux
 * sont compressés et les polices sous-ensemblées. La garantie est portée par LE
 * TYPE, et vérifiée par le compilateur :
 *
 *   · `PurchaseLine` porte `unitPrice` — LE PRIX DE L'OFFRE — et RIEN D'AUTRE.
 *     Le coût de RÉFÉRENCE du catalogue vit dans sa propre table, gardée par
 *     `catalog.services.cost.view`, et ne franchit jamais la couche de données :
 *     il n'existe que dans l'éditeur de lignes, à l'écran, comme repère ;
 *   · aucune marge n'est calculée nulle part — un achat n'en a pas
 *     (Plan 01 §15.3) ;
 *   · aucun prix de VENTE ne figure sur une pièce d'achat, et réciproquement :
 *     ce sont deux domaines, deux tables, deux jeux de capacités.
 *
 * `document.test.ts` refuse en outre, par un balayage des SOURCES, toute
 * référence au domaine du coût de référence dans un modèle documentaire. Ce
 * balayage est LEXICAL et ne distingue pas un commentaire d'un appel — d'où
 * l'absence, ici, du nom de la table des coûts et de celui du repère affiché à
 * l'écran : une preuve qui se laisserait attendrir par un commentaire n'en
 * serait pas une.
 */

const QUOTE_TONES: Record<PurchaseQuoteStatus, ChipTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  REFUSED: 'warning',
  CONVERTED: 'success',
  CANCELLED: 'danger',
}

const ORDER_TONES: Record<PurchaseOrderStatus, ChipTone> = {
  DRAFT: 'neutral',
  CONFIRMED: 'info',
  DELIVERED: 'success',
  INVOICED: 'success',
  CANCELLED: 'danger',
}

const kmf = (value: number) => formatAmount(value, { withCurrency: true })

/**
 * Le tableau des lignes, commun aux deux pièces.
 *
 * Il ne reçoit que des `PurchaseLine` : désignation, quantité, prix, montant. La
 * NATURE de la ligne — catalogue ou libre (A-13) — n'y figure pas : elle regarde
 * l'organisation interne d'ADIKOM, pas le fournisseur, qui vend une prestation
 * et non une entrée de référentiel.
 */
function LinesSection({ lines }: { lines: PurchaseLine[] }) {
  const active = lines.filter((line) => !line.isArchived)

  return (
    <Section title="Détail">
      <DataTable
        columns={[
          {
            header: 'Désignation',
            width: '55%',
            cell: (line: PurchaseLine) => line.label,
          },
          {
            header: 'Qté',
            width: '10%',
            align: 'right',
            cell: (line: PurchaseLine) => String(line.quantity),
          },
          {
            header: 'Prix unitaire',
            width: '17%',
            align: 'right',
            cell: (line: PurchaseLine) => kmf(line.unitPrice),
          },
          {
            header: 'Montant',
            width: '18%',
            align: 'right',
            cell: (line: PurchaseLine) => kmf(line.lineTotal),
          },
        ]}
        rows={active}
        emptyLabel="Aucune ligne. Le total de ce document est nul."
      />
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Devis fournisseur — pièce interne                                          */
/* -------------------------------------------------------------------------- */

export type PurchaseQuoteDocumentProps = {
  identity: DocumentIdentity
  quote: PurchaseQuoteDetail
  lines: PurchaseLine[]
  /** `null` sans `parties.suppliers.view` : le document ne l'invente pas. */
  supplierAddress: string[] | null
  issuedOn: string
}

export function PurchaseQuoteDocument({
  identity,
  quote,
  lines,
  supplierAddress,
  issuedOn,
}: PurchaseQuoteDocumentProps) {
  return (
    <DocumentShell
      identity={identity}
      title="Devis fournisseur"
      reference={quote.quoteNo}
      issuedOn={issuedOn}
    >
      <Section title={quote.supplierLabel ?? 'Fournisseur non lisible avec vos droits'}>
        <View style={{ marginBottom: 8 }}>
          <StatusChip
            label={PURCHASE_QUOTE_STATUS_LABELS[quote.status]}
            tone={QUOTE_TONES[quote.status]}
          />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Référence interne" value={quote.quoteNo} />
              {/*
                LES DEUX RÉFÉRENCES, CÔTE À CÔTE ET JAMAIS CONFONDUES. Le numéro
                d'ADIKOM classe l'offre chez elle ; celui du fournisseur la
                retrouve chez lui.
              */}
              <Field label="Référence du fournisseur" value={quote.externalRef} />
              <Field label="Date de l’offre" value={formatDate(quote.quoteDate)} />
              <Field
                label="Valable jusqu’au"
                value={quote.validUntil ? formatDate(quote.validUntil) : null}
              />
            </>
          }
          right={
            <>
              <Field label="Fournisseur" value={quote.supplierLabel} />
              {(supplierAddress ?? []).map((line, index) => (
                <Field key={line} label={index === 0 ? 'Adresse' : ' '} value={line} />
              ))}
            </>
          }
        />
      </Section>

      <LinesSection lines={lines} />

      <Section title="Montant">
        <FieldColumns
          left={<Field label="Devise" value={quote.currencyCode} />}
          right={<Field label="Total de l’offre" value={kmf(quote.total)} />}
        />
      </Section>

      {quote.terms && (
        <Section title="Conditions annoncées par le fournisseur">
          <Note>{quote.terms}</Note>
        </Section>
      )}

      {quote.notes && (
        <Section title="Observations">
          <Note>{quote.notes}</Note>
        </Section>
      )}

      <Section title="Portée de ce document">
        <Note>
          {quote.status === 'DRAFT'
            ? 'Cette offre est en cours de saisie : elle ne restitue pas encore, de façon définitive, le document reçu du fournisseur.'
            : quote.status === 'CANCELLED'
              ? 'Cet enregistrement a été ANNULÉ par ADIKOM. Son historique est conservé.'
              : quote.status === 'REFUSED'
                ? 'Cette offre a été ÉCARTÉE par ADIKOM. Elle est conservée comme acte antérieur.'
                : quote.status === 'CONVERTED'
                  ? 'Cette offre a donné lieu à une commande. Elle est conservée telle qu’elle a été reçue, et ses prix ne seront pas réécrits.'
                  : 'Pièce interne. Elle restitue une offre REÇUE d’un fournisseur ; elle n’engage ADIKOM à aucun achat et n’appelle aucun règlement.'}
        </Note>
      </Section>
    </DocumentShell>
  )
}

/* -------------------------------------------------------------------------- */
/*  Commande fournisseur — pièce destinée au fournisseur                       */
/* -------------------------------------------------------------------------- */

export type PurchaseOrderDocumentProps = {
  identity: DocumentIdentity
  order: PurchaseOrderDetail
  lines: PurchaseLine[]
  supplierAddress: string[] | null
  issuedOn: string
}

export function PurchaseOrderDocument({
  identity,
  order,
  lines,
  supplierAddress,
  issuedOn,
}: PurchaseOrderDocumentProps) {
  return (
    <DocumentShell
      identity={identity}
      title="Bon de commande fournisseur"
      reference={order.orderNo}
      issuedOn={issuedOn}
    >
      <Section title={order.supplierLabel ?? 'Fournisseur non lisible avec vos droits'}>
        <View style={{ marginBottom: 8 }}>
          <StatusChip
            label={PURCHASE_ORDER_STATUS_LABELS[order.status]}
            tone={ORDER_TONES[order.status]}
          />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Référence interne" value={order.orderNo} />
              <Field label="Date de la commande" value={formatDate(order.orderDate)} />
              <Field
                label="Réception attendue"
                value={order.expectedDate ? formatDate(order.expectedDate) : null}
              />
              {/*
                L'ORIGINE, SUR LA PIÈCE. Le fournisseur qui a remis une offre doit
                retrouver SA référence sur la commande : c'est ce qui rend la
                chaîne lisible chez lui, où le numéro d'ADIKOM ne dit rien.
              */}
              <Field label="Offre d’origine (ADIKOM)" value={order.quoteNo} />
              <Field label="Votre référence" value={order.quoteExternalRef} />
            </>
          }
          right={
            <>
              <Field label="Fournisseur" value={order.supplierLabel} />
              {(supplierAddress ?? []).map((line, index) => (
                <Field key={line} label={index === 0 ? 'Adresse' : ' '} value={line} />
              ))}
            </>
          }
        />
      </Section>

      <LinesSection lines={lines} />

      <Section title="Montant">
        <FieldColumns
          left={<Field label="Devise" value={order.currencyCode} />}
          right={<Field label="Total de la commande" value={kmf(order.total)} />}
        />
      </Section>

      {order.terms && (
        <Section title="Conditions">
          <Note>{order.terms}</Note>
        </Section>
      )}

      {order.notes && (
        <Section title="Observations">
          <Note>{order.notes}</Note>
        </Section>
      )}

      <Section title="Portée de ce document">
        <Note>
          {order.status === 'DRAFT'
            ? 'Cette commande est un BROUILLON : elle n’engage aucune des deux parties et ne doit pas être transmise au fournisseur en l’état.'
            : order.status === 'CANCELLED'
              ? 'Cette commande est ANNULÉE. Son historique est conservé, et l’offre d’origine redevient disponible.'
              : order.status === 'INVOICED'
                ? 'Une facture a été enregistrée pour cette commande. Le règlement s’effectue sur la base de cette facture, non de ce document.'
                : 'Ce bon de commande engage ADIKOM aux prix et quantités ci-dessus. Il n’est pas une facture : la facture reste à établir par le fournisseur. Aucun bon de réception distinct n’est produit — la réception est constatée dans le système.'}
        </Note>
      </Section>
    </DocumentShell>
  )
}
