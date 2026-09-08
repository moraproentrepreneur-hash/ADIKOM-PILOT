import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, History } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import { listTreasuryEntries } from '@/features/treasury/data'
import {
  DIRECTION_LABELS,
  ENTRY_STATUS_LABELS,
  ENTRY_STATUS_TONES,
  formatAmount,
  formatSigned,
} from '@/features/treasury/constants'
import { getMiscPayment } from '@/features/misc-payments/data'
import {
  CancelMiscPaymentPanel,
  ValidateMiscPaymentPanel,
} from '@/features/misc-payments/panels'
import {
  MISC_PAYMENT_CATEGORY_LABELS,
  MISC_PAYMENT_DIRECTION_LABELS,
  MISC_PAYMENT_DIRECTION_TONES,
  MISC_PAYMENT_PARTY_LABELS,
  MISC_PAYMENT_STATUS_LABELS,
  MISC_PAYMENT_STATUS_TONES,
  miscPaymentStatusHint,
} from '@/features/misc-payments/constants'

export const metadata: Metadata = { title: 'Paiement divers' }

/**
 * Fiche d'un paiement divers.
 *
 * L'écriture financière produite est présentée ici, avec son sens et son état :
 * un paiement validé sans écriture visible serait un mouvement invérifiable.
 *
 * TOUT S'ACCORDE AU SENS — DEC-042 §b
 *
 * Encaissement ou décaissement : le bandeau, l'effet annoncé, le nom de l'autre
 * partie et le libellé du compte changent avec lui. Un écran qui parlerait de
 * « compte débité » sur un encaissement dirait le contraire de ce qui s'est
 * passé.
 */
export default async function MiscPaymentDetailPage(
  props: PageProps<'/facturation/paiements-divers/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.MISC_PAYMENTS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams
  const justCreated = searchParams.cree === '1'

  const [canValidate, canCancel, canSeeEntries, canDownload, canPrint] = await Promise.all([
    can(PERMISSIONS.MISC_PAYMENTS_VALIDATE),
    can(PERMISSIONS.MISC_PAYMENTS_CANCEL),
    can(PERMISSIONS.ENTRIES_VIEW),
    // DEC-024 : produire un document et l'imprimer sont deux capacités
    // distinctes de la consultation, attribuables séparément.
    can(PERMISSIONS.MISC_PAYMENTS_DOWNLOAD),
    can(PERMISSIONS.MISC_PAYMENTS_PRINT),
  ])

  const payment = await getMiscPayment(id)
  if (!payment) notFound()

  // Sans `treasury.entries.view`, la section DISPARAÎT : une liste vide se
  // lirait « ce paiement n'a rien produit » (DEC-017).
  const entries = canSeeEntries ? await listTreasuryEntries({ miscPaymentId: id }) : null

  const isDraft = payment.status === 'DRAFT'
  const isValidated = payment.status === 'VALIDATED'
  const entree = payment.direction === 'IN'

  return (
    <>
      <Link
        href="/facturation/paiements-divers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux paiements divers
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Paiement enregistré sous le numéro <strong>{payment.paymentNo}</strong>. Il reste en
          brouillon : aucun fonds n’est encore sorti.
        </Notice>
      )}

      <PageHeader
        title={payment.paymentNo}
        description={`${formatAmount(payment.amount)} · ${payment.beneficiary}`}
        actions={
          <DocumentToolbar
            type="paiements-divers"
            id={id}
            label={`reçu ${payment.paymentNo}`}
            canDownload={canDownload}
            canPrint={canPrint}
          />
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={MISC_PAYMENT_DIRECTION_TONES[payment.direction]}>
          {MISC_PAYMENT_DIRECTION_LABELS[payment.direction]}
        </Badge>
        <Badge tone={MISC_PAYMENT_STATUS_TONES[payment.status]}>
          {MISC_PAYMENT_STATUS_LABELS[payment.status]}
        </Badge>
      </div>

      <Notice tone={isDraft ? 'warning' : isValidated ? 'success' : 'info'} className="mb-5">
        {miscPaymentStatusHint(payment.status, payment.direction)}
      </Notice>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="Paiement"
            description="Un mouvement sans facture rattachée, documenté par son sens, son tiers et son motif."
          >
            <dl>
              <InfoRow
                label="Sens"
                hint={
                  entree
                    ? 'Une entrée de trésorerie : le solde du compte augmente.'
                    : 'Une sortie de trésorerie : le solde du compte diminue.'
                }
              >
                <Badge tone={MISC_PAYMENT_DIRECTION_TONES[payment.direction]}>
                  {MISC_PAYMENT_DIRECTION_LABELS[payment.direction]}
                </Badge>
              </InfoRow>
              <InfoRow label={MISC_PAYMENT_PARTY_LABELS[payment.direction]}>
                {payment.beneficiary}
              </InfoRow>
              <InfoRow label="Catégorie">
                {MISC_PAYMENT_CATEGORY_LABELS[payment.category]}
              </InfoRow>
              <InfoRow label="Motif">{payment.purpose}</InfoRow>
              <InfoRow label="Montant">
                <span className="font-medium tabular">{formatAmount(payment.amount)}</span>
              </InfoRow>
              <InfoRow label="Date du paiement">{formatDate(payment.paidOn)}</InfoRow>
              <InfoRow
                label="Compte"
                hint={entree ? 'Crédité à la validation.' : 'Débité à la validation.'}
              >
                {payment.accountLabel ? (
                  <Link
                    href={`/tresorerie/comptes/${payment.accountId}`}
                    className="text-adikom-500 hover:underline"
                  >
                    {payment.accountLabel}
                  </Link>
                ) : (
                  <span className="text-xs italic text-muted">
                    Compte non lisible avec vos droits
                  </span>
                )}
              </InfoRow>
              <InfoRow label="Référence">{payment.externalRef ?? <Empty />}</InfoRow>
              <InfoRow label="Commentaire">{payment.notes ?? <Empty />}</InfoRow>
            </dl>
          </Card>

          {canSeeEntries ? (
            <Card
              title="Écriture produite"
              description={
                entree
                  ? 'Une entrée du montant reçu, sur le compte désigné.'
                  : 'Une sortie du montant payé, sur le compte désigné.'
              }
            >
              {entries === null || entries.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="Aucune écriture"
                  description={
                    isDraft
                      ? 'Ce paiement est en brouillon : l’écriture naîtra à sa validation.'
                      : 'Aucune écriture n’est rattachée à ce paiement.'
                  }
                />
              ) : (
                <ul className="divide-y divide-line">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {DIRECTION_LABELS[entry.direction]} ·{' '}
                          {entry.accountLabel ?? 'Compte non lisible'}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDate(entry.entryDate)}
                          {entry.description ? ` · ${entry.description}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            entry.status === 'CANCELLED'
                              ? 'text-sm text-muted line-through tabular'
                              : 'font-medium text-ink tabular'
                          }
                        >
                          {formatSigned(entry.direction, entry.amount)}
                        </span>
                        <Badge tone={ENTRY_STATUS_TONES[entry.status]}>
                          {ENTRY_STATUS_LABELS[entry.status]}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : (
            <Notice tone="warning">
              Votre compte ne peut pas consulter les écritures : ce paiement peut en porter une
              sans que cet écran puisse la montrer.
            </Notice>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Suivi">
            <dl>
              <InfoRow label="Numéro">
                <span className="tabular">{payment.paymentNo}</span>
              </InfoRow>
              <InfoRow label="Saisi le">{formatDateTime(payment.createdAt)}</InfoRow>
              <InfoRow label="Validé le">
                {formatDateTime(payment.validatedAt) ?? <Empty />}
              </InfoRow>
              <InfoRow label="Annulé le">
                {formatDateTime(payment.cancelledAt) ?? <Empty />}
              </InfoRow>
              <InfoRow label="Motif d’annulation">{payment.statusReason ?? <Empty />}</InfoRow>
            </dl>
          </Card>

          {isDraft && canValidate && (
            <Card
              title="Valider"
              description={
                entree
                  ? 'C’est ce geste qui fait entrer les fonds.'
                  : 'C’est ce geste qui fait sortir les fonds.'
              }
            >
              <ValidateMiscPaymentPanel
                paymentId={payment.id}
                amount={payment.amount}
                direction={payment.direction}
                accountLabel={payment.accountLabel}
              />
            </Card>
          )}

          {payment.status !== 'CANCELLED' && canCancel && (
            <Card
              title="Annuler"
              description="Rien n’est supprimé : la trace du paiement demeure."
            >
              <CancelMiscPaymentPanel
                paymentId={payment.id}
                amount={payment.amount}
                direction={payment.direction}
                validated={isValidated}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
