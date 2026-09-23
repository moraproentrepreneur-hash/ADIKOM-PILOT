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
  ORDER_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  type OrderStatus,
  type QuoteStatus,
} from '../constants'
import type { CommercialLine, SalesOrderDetail, SalesQuoteDetail } from '../data'

/**
 * Devis et commande clients — documents A4, LOT 25 (DEC-049).
 *
 * AUCUN SECOND MOTEUR PDF. Ils réemploient `DocumentShell`, la charte, le logo
 * officiel, la pagination et les blocs des onze documents déjà livrés. Ajouter
 * une pièce revient à écrire son contenu ; l'en-tête, le pied et le rendu ne
 * changent pas.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🟥 CE QUE CES MODÈLES NE PEUVENT PAS RÉVÉLER — et pourquoi c'est structurel
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Le LOT 24 a établi qu'un BALAYAGE D'OCTETS d'un PDF produit par `@react-pdf`
 * NE PROUVE RIEN : les flux sont compressés et les polices sous-ensemblées, si
 * bien qu'un coût présent n'y apparaîtrait pas en clair. Chercher une chaîne
 * dans le fichier revient à ne rien chercher du tout.
 *
 * La confidentialité est donc portée par LE TYPE, et vérifiée par le
 * compilateur :
 *
 *   · `CommercialLine` NE PORTE AUCUNE COLONNE DE COÛT — parce que
 *     `sales_quote_lines` et `sales_order_lines` n'en ont aucune (Plan 02 §9.3,
 *     migration 097 §17). Il n'existe donc, dans tout le système, aucun chemin
 *     par lequel un coût atteindrait ce modèle ;
 *   · le prix d'achat d'un service vit dans SA PROPRE TABLE, gardée par
 *     `catalog.services.cost.view` ; ces modèles ne l'interrogent jamais ;
 *   · aucune marge n'est calculée nulle part : elle exigerait les deux
 *     grandeurs, et ce lot n'en manipule qu'une.
 *
 * `document.test.ts` refuse en outre, par un balayage des SOURCES, toute
 * référence au domaine du coût dans un modèle documentaire. Ce balayage est
 * LEXICAL et ne distingue pas un commentaire d'un appel — d'où l'absence, ici,
 * du nom de la table des coûts : une preuve qui se laisserait attendrir par un
 * commentaire n'en serait pas une. Elle vaut pour tout document qu'on écrirait
 * demain.
 */

const QUOTE_TONES: Record<QuoteStatus, ChipTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  REFUSED: 'warning',
  CONVERTED: 'success',
  CANCELLED: 'danger',
}

const ORDER_TONES: Record<OrderStatus, ChipTone> = {
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
 * Il ne reçoit que des `CommercialLine` : désignation, quantité, prix, montant.
 * La NATURE de la ligne — catalogue ou libre (A-13) — n'y figure pas : elle
 * regarde ADIKOM, pas le client, qui achète une prestation et non une entrée de
 * référentiel.
 */
function LinesSection({ lines }: { lines: CommercialLine[] }) {
  const active = lines.filter((line) => !line.isArchived)

  return (
    <Section title="Détail">
      <DataTable
        columns={[
          {
            header: 'Désignation',
            width: '55%',
            cell: (line: CommercialLine) => line.label,
          },
          {
            header: 'Qté',
            width: '10%',
            align: 'right',
            cell: (line: CommercialLine) => String(line.quantity),
          },
          {
            header: 'Prix unitaire',
            width: '17%',
            align: 'right',
            cell: (line: CommercialLine) => kmf(line.unitPrice),
          },
          {
            header: 'Montant',
            width: '18%',
            align: 'right',
            cell: (line: CommercialLine) => kmf(line.lineTotal),
          },
        ]}
        rows={active}
        emptyLabel="Aucune ligne. Le total de ce document est nul."
      />
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Devis client                                                               */
/* -------------------------------------------------------------------------- */

export type SalesQuoteDocumentProps = {
  identity: DocumentIdentity
  quote: SalesQuoteDetail
  lines: CommercialLine[]
  /** `null` sans `parties.clients.view` : le document ne l'invente pas. */
  clientAddress: string[] | null
  issuedOn: string
}

export function SalesQuoteDocument({
  identity,
  quote,
  lines,
  clientAddress,
  issuedOn,
}: SalesQuoteDocumentProps) {
  return (
    <DocumentShell
      identity={identity}
      title="Devis client"
      reference={quote.quoteNo}
      issuedOn={issuedOn}
    >
      <Section title={quote.clientLabel ?? 'Client non lisible avec vos droits'}>
        <View style={{ marginBottom: 8 }}>
          <StatusChip
            label={QUOTE_STATUS_LABELS[quote.status]}
            tone={QUOTE_TONES[quote.status]}
          />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Numéro" value={quote.quoteNo} />
              <Field label="Date du devis" value={formatDate(quote.quoteDate)} />
              {/*
                LA VALIDITÉ N'EST JAMAIS INVENTÉE. Aucune durée par défaut n'est
                écrite chez ADIKOM ; lorsqu'elle est absente, le document le DIT
                plutôt que d'annoncer un délai que personne n'a décidé.
              */}
              <Field
                label="Valable jusqu’au"
                value={quote.validUntil ? formatDate(quote.validUntil) : null}
              />
            </>
          }
          right={
            <>
              <Field label="Client" value={quote.clientLabel} />
              {(clientAddress ?? []).map((line, index) => (
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
          right={<Field label="Total du devis" value={kmf(quote.total)} />}
        />
      </Section>

      {quote.terms && (
        <Section title="Conditions">
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
            ? 'Ce devis est un BROUILLON : il n’engage pas ADIKOM et ne doit pas être remis au client en l’état.'
            : quote.status === 'CANCELLED'
              ? 'Ce devis est ANNULÉ : il n’engage plus ADIKOM. Son historique est conservé.'
              : quote.status === 'REFUSED'
                ? 'Ce devis a été REFUSÉ par le client. Il est conservé comme acte antérieur.'
                : quote.status === 'CONVERTED'
                  ? 'Ce devis a donné lieu à une commande. Il est conservé tel qu’il a été remis, et ses prix ne seront pas réécrits.'
                  : 'Ce devis est une proposition commerciale. Il ne constitue ni une commande, ni une facture, et n’appelle aucun règlement.'}
        </Note>
      </Section>
    </DocumentShell>
  )
}

/* -------------------------------------------------------------------------- */
/*  Commande client                                                            */
/* -------------------------------------------------------------------------- */

export type SalesOrderDocumentProps = {
  identity: DocumentIdentity
  order: SalesOrderDetail
  lines: CommercialLine[]
  clientAddress: string[] | null
  issuedOn: string
}

export function SalesOrderDocument({
  identity,
  order,
  lines,
  clientAddress,
  issuedOn,
}: SalesOrderDocumentProps) {
  return (
    <DocumentShell
      identity={identity}
      title="Commande client"
      reference={order.orderNo}
      issuedOn={issuedOn}
    >
      <Section title={order.clientLabel ?? 'Client non lisible avec vos droits'}>
        <View style={{ marginBottom: 8 }}>
          <StatusChip
            label={ORDER_STATUS_LABELS[order.status]}
            tone={ORDER_TONES[order.status]}
          />
        </View>

        <FieldColumns
          left={
            <>
              <Field label="Numéro" value={order.orderNo} />
              <Field label="Date de commande" value={formatDate(order.orderDate)} />
              <Field
                label="Livraison attendue"
                value={order.expectedDate ? formatDate(order.expectedDate) : null}
              />
              {/*
                L'ORIGINE, SUR LA PIÈCE. Le client qui a signé un devis doit
                retrouver sa référence sur la commande : c'est ce qui rend la
                chaîne lisible hors du système.
              */}
              <Field label="Devis d’origine" value={order.quoteNo} />
            </>
          }
          right={
            <>
              <Field label="Client" value={order.clientLabel} />
              {(clientAddress ?? []).map((line, index) => (
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
            ? 'Cette commande est un BROUILLON : elle n’engage aucune des deux parties et ne doit pas être remise au client en l’état.'
            : order.status === 'CANCELLED'
              ? 'Cette commande est ANNULÉE. Son historique est conservé, et son devis d’origine redevient disponible.'
              : order.status === 'INVOICED'
                ? 'Cette commande a donné lieu à une facture client. Le règlement s’effectue sur la base de cette facture, non de ce document.'
                : 'Cette commande constate un engagement. Elle n’est pas une facture et n’appelle, en elle-même, aucun règlement.'}
        </Note>
      </Section>
    </DocumentShell>
  )
}
