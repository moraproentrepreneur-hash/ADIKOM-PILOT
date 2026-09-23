import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ShoppingCart } from 'lucide-react'

import { Badge, ButtonLink, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime, todayISO } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import {
  getSalesQuote,
  listSalesQuoteLines,
  listSellableVariants,
} from '@/features/commerce/data'
import {
  LINE_KIND_LABELS,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONES,
  QUOTE_TRANSITIONS,
  lineKind,
  quoteIsConvertible,
  quoteIsEditable,
  quoteIsExpired,
  type QuoteStatus,
} from '@/features/commerce/constants'
import {
  AddLinePanel,
  ArchiveLineForm,
  ConvertQuotePanel,
  EditQuotePanel,
  QuoteStatusPanel,
} from '@/features/commerce/panels'

export const metadata: Metadata = { title: 'Devis client' }

/**
 * Un couple libellé / valeur, avec une absence rendue de façon homogène.
 *
 * `InfoRow` prend des enfants : ce petit relais évite de répéter le repli sur
 * « — » à chaque ligne, et garantit qu'une valeur absente se lit toujours de la
 * même manière (Design System §40).
 */
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <InfoRow label={label}>{value ? value : <Empty />}</InfoRow>
  )
}

/**
 * Fiche d'un devis client — LOT 25, DEC-049.
 *
 * CE QUE CHAQUE SECTION EXIGE, ET CE QU'ELLE DIT QUAND ELLE NE PEUT PAS.
 *
 * Modifier, faire avancer, annuler, convertir, produire le document : cinq
 * capacités distinctes (A-14, DEC-024). Une section absente faute de droit est
 * NOMMÉE plutôt que tue (DEC-017) — sauf les boutons d'action, dont l'absence
 * ne cache aucune information.
 *
 * 🟥 LE MASQUAGE NE PROTÈGE RIEN. Chaque action est revérifiée côté serveur,
 * par sa fonction atomique, par le déclencheur de transition et par RLS.
 */
export default async function SalesQuotePage(props: PageProps<'/commerce/devis/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.SALES_QUOTES_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const quote = await getSalesQuote(id)
  if (!quote) notFound()

  const [canUpdate, canValidate, canCancel, canCreateOrder, canDownload, canPrint, canSeeOrders] =
    await Promise.all([
      can(PERMISSIONS.SALES_QUOTES_UPDATE),
      can(PERMISSIONS.SALES_QUOTES_VALIDATE),
      can(PERMISSIONS.SALES_QUOTES_CANCEL),
      can(PERMISSIONS.SALES_ORDERS_CREATE),
      can(PERMISSIONS.SALES_QUOTES_DOWNLOAD),
      can(PERMISSIONS.SALES_QUOTES_PRINT),
      can(PERMISSIONS.SALES_ORDERS_VIEW),
    ])

  const editable = quoteIsEditable(quote.status)

  const [lines, variants] = await Promise.all([
    listSalesQuoteLines(id),
    // Le catalogue n'est chargé que si l'on peut réellement ajouter une ligne,
    // et il est résolu À LA DATE DU DEVIS : c'est ce prix-là qui sera figé.
    editable && canUpdate ? listSellableVariants(quote.quoteDate) : Promise.resolve([]),
  ])

  const activeLines = lines.filter((line) => !line.isArchived)
  const archivedCount = lines.length - activeLines.length
  const expired = quoteIsExpired(quote.status, quote.validUntil, todayISO())

  /*
   * LES ACTIONS DE CYCLE RÉELLEMENT OFFERTES : celles que l'état autorise ET
   * que l'utilisateur détient. Croiser les deux évite un bouton qui échouerait.
   */
  const available = QUOTE_TRANSITIONS[quote.status].filter((next: QuoteStatus) =>
    next === 'CANCELLED' ? canCancel : canValidate
  )

  return (
    <>
      <PageHeader
        title={quote.quoteNo}
        description={
          quote.clientLabel
            ? `Devis pour ${quote.clientLabel}`
            : 'Client non lisible avec vos droits'
        }
        actions={
          <>
            <ButtonLink href="/commerce/devis" tone="secondary" icon={ArrowLeft}>
              Retour
            </ButtonLink>
            <DocumentToolbar
              type="devis-clients"
              id={quote.id}
              label="le devis"
              canDownload={canDownload}
              canPrint={canPrint}
            />
          </>
        }
      />

      {searchParams.cree === '1' && (
        <Notice tone="success" className="mb-5">
          Le devis a été créé. Ajoutez ses lignes, puis émettez-le lorsqu’il est prêt à être remis
          au client.
        </Notice>
      )}

      {expired && (
        <Notice tone="warning" className="mb-5">
          La validité de ce devis est dépassée depuis le{' '}
          <strong>{formatDate(quote.validUntil)}</strong>. Son état n’a pas changé pour autant :
          ADIKOM ne dispose d’aucun automatisme qui le ferait, et un statut écrit sans surveillance
          mentirait. Décidez explicitement de le reconduire ou de l’annuler.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Identité">
            <div className="mb-4">
              <Badge tone={QUOTE_STATUS_TONES[quote.status]}>
                {QUOTE_STATUS_LABELS[quote.status]}
              </Badge>
            </div>

            <dl className="divide-y divide-line">
              <Row label="Numéro" value={quote.quoteNo} />
              <Row label="Client" value={quote.clientLabel} />
              <Row label="Date du devis" value={formatDate(quote.quoteDate)} />
              <Row
                label="Valable jusqu’au"
                value={quote.validUntil ? formatDate(quote.validUntil) : null}
              />
              <Row label="Devise" value={quote.currencyCode} />
              <Row label="Conditions" value={quote.terms} />
              <Row label="Observations" value={quote.notes} />
              <Row label="Motif du dernier changement" value={quote.statusReason} />
            </dl>
          </Card>

          <Card
            title="Lignes"
            description={
              editable
                ? 'Le prix d’une ligne de catalogue est figé à son ajout, au tarif du jour du devis.'
                : 'Ce devis a quitté le brouillon : ses lignes et ses prix sont figés.'
            }
          >
            {activeLines.length === 0 ? (
              <p className="text-sm text-muted">
                Aucune ligne active. Le total de ce devis est nul, et il ne peut pas être émis.
              </p>
            ) : (
              <>
                <div className="-mx-5 hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-adikom-50 text-left">
                        <th className="px-5 py-2.5 font-medium text-ink">Désignation</th>
                        <th className="px-5 py-2.5 font-medium text-ink">Nature</th>
                        <th className="px-5 py-2.5 text-right font-medium text-ink">Qté</th>
                        <th className="px-5 py-2.5 text-right font-medium text-ink">
                          Prix unitaire
                        </th>
                        <th className="px-5 py-2.5 text-right font-medium text-ink">Montant</th>
                        {editable && canUpdate && <th className="px-5 py-2.5" />}
                      </tr>
                    </thead>
                    <tbody>
                      {activeLines.map((line) => (
                        <tr key={line.id} className="border-b border-line last:border-b-0">
                          <td className="px-5 py-2.5 text-ink">{line.label}</td>
                          <td className="px-5 py-2.5 text-xs text-muted">
                            {LINE_KIND_LABELS[lineKind(line.serviceId)]}
                          </td>
                          <td className="px-5 py-2.5 text-right text-muted tabular">
                            {line.quantity}
                          </td>
                          <td className="px-5 py-2.5 text-right text-muted tabular">
                            {formatAmount(line.unitPrice)}
                          </td>
                          <td className="px-5 py-2.5 text-right font-medium text-ink tabular">
                            {formatAmount(line.lineTotal)}
                          </td>
                          {editable && canUpdate && (
                            <td className="px-5 py-2.5 text-right">
                              <ArchiveLineForm target="quote" documentId={quote.id} lineId={line.id} />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-line">
                        <td colSpan={4} className="px-5 py-3 text-right font-medium text-ink">
                          Total du devis
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-ink tabular">
                          {formatAmount(quote.total)}
                        </td>
                        {editable && canUpdate && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <ul className="space-y-3 sm:hidden">
                  {activeLines.map((line) => (
                    <li key={line.id} className="rounded-control border border-line p-3">
                      <p className="font-medium text-ink">{line.label}</p>
                      <p className="mt-1 text-xs text-muted">
                        {LINE_KIND_LABELS[lineKind(line.serviceId)]} · {line.quantity} ×{' '}
                        {formatAmount(line.unitPrice)}
                      </p>
                      <p className="mt-1 font-medium text-ink tabular">
                        {formatAmount(line.lineTotal)}
                      </p>
                      {editable && canUpdate && (
                        <div className="mt-2">
                          <ArchiveLineForm target="quote" documentId={quote.id} lineId={line.id} />
                        </div>
                      )}
                    </li>
                  ))}
                  <li className="rounded-control bg-adikom-50 p-3">
                    <p className="text-sm font-medium text-ink">
                      Total du devis :{' '}
                      <span className="tabular">{formatAmount(quote.total)}</span>
                    </p>
                  </li>
                </ul>
              </>
            )}

            {archivedCount > 0 && (
              <p className="mt-4 text-xs text-muted">
                {archivedCount} ligne{archivedCount > 1 ? 's' : ''} retirée
                {archivedCount > 1 ? 's' : ''}. Elle
                {archivedCount > 1 ? 's sont conservées' : ' est conservée'} à l’historique et
                n’entre{archivedCount > 1 ? 'nt' : ''} pas dans le total.
              </p>
            )}
          </Card>

          {editable && canUpdate && (
            <Card
              title="Ajouter une ligne"
              description="Une prestation du catalogue, ou une ligne libre pour ce qui n’y figure pas."
            >
              <AddLinePanel
                target="quote"
                documentId={quote.id}
                variants={variants}
                documentDate={formatDate(quote.quoteDate) ?? quote.quoteDate}
              />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {available.length > 0 && (
            <Card title="Cycle du devis">
              <QuoteStatusPanel quoteId={quote.id} available={available} />
            </Card>
          )}

          {/*
            LA CONVERSION — l'acte central du lot.

            Elle exige `commerce.sales_orders.create` : c'est la CRÉATION DE LA
            COMMANDE qui est l'acte ; le passage du devis à « converti » n'en
            est que la conséquence (Plan 01 §15.5, par symétrie).
          */}
          {quoteIsConvertible(quote.status) && canCreateOrder && (
            <Card title="Convertir en commande">
              <ConvertQuotePanel quoteId={quote.id} today={todayISO()} />
            </Card>
          )}

          {quote.status === 'CONVERTED' && (
            <Card title="Commande issue de ce devis">
              {!canSeeOrders ? (
                <p className="text-sm text-muted">
                  Ce devis a produit une commande. Votre compte ne peut pas consulter les commandes
                  clients : sa référence ne vous est pas communiquée.
                </p>
              ) : quote.orderNo && quote.orderId ? (
                <>
                  <Link
                    href={`/commerce/commandes/${quote.orderId}`}
                    className="inline-flex items-center gap-2 font-medium text-adikom-500 hover:underline tabular"
                  >
                    <ShoppingCart className="size-4" aria-hidden />
                    {quote.orderNo}
                  </Link>
                  <p className="mt-2 text-xs text-muted">
                    Ce devis est conservé tel qu’il a été remis au client. Ses prix ne seront pas
                    réécrits, quoi qu’il advienne du catalogue ou de la commande.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Ce devis porte l’état « converti », mais aucune commande active ne lui est
                  rattachée. Elle a probablement été annulée.
                </p>
              )}
            </Card>
          )}

          {editable && canUpdate && (
            <Card title="Modifier l’en-tête">
              <EditQuotePanel
                quoteId={quote.id}
                quoteDate={quote.quoteDate}
                validUntil={quote.validUntil}
                notes={quote.notes}
                terms={quote.terms}
              />
            </Card>
          )}

          <Card title="Historique">
            <dl className="divide-y divide-line">
              <Row label="Créé le" value={formatDateTime(quote.createdAt)} />
              <Row label="Émis le" value={formatDateTime(quote.sentAt)} />
              <Row label="Accepté le" value={formatDateTime(quote.acceptedAt)} />
              <Row label="Refusé le" value={formatDateTime(quote.refusedAt)} />
              <Row label="Converti le" value={formatDateTime(quote.convertedAt)} />
              <Row label="Annulé le" value={formatDateTime(quote.cancelledAt)} />
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
