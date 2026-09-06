import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, History } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
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
  MISC_PAYMENT_STATUS_HINTS,
  MISC_PAYMENT_STATUS_LABELS,
  MISC_PAYMENT_STATUS_TONES,
} from '@/features/misc-payments/constants'

export const metadata: Metadata = { title: 'Paiement divers' }

/**
 * Fiche d'un paiement divers — Module 07 §44 à §47.
 *
 * §45 : « Le système doit générer ou référencer l'écriture financière
 * correspondante. » Elle est donc présentée ici, avec son sens et son état :
 * un paiement validé sans écriture visible serait un décaissement invérifiable.
 */
export default async function MiscPaymentDetailPage(
  props: PageProps<'/facturation/paiements-divers/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.MISC_PAYMENTS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams
  const justCreated = searchParams.cree === '1'

  const [canValidate, canCancel, canSeeEntries] = await Promise.all([
    can(PERMISSIONS.MISC_PAYMENTS_VALIDATE),
    can(PERMISSIONS.MISC_PAYMENTS_CANCEL),
    can(PERMISSIONS.ENTRIES_VIEW),
  ])

  const payment = await getMiscPayment(id)
  if (!payment) notFound()

  // Sans `treasury.entries.view`, la section DISPARAÎT : une liste vide se
  // lirait « ce paiement n'a rien produit » (DEC-017).
  const entries = canSeeEntries ? await listTreasuryEntries({ miscPaymentId: id }) : null

  const isDraft = payment.status === 'DRAFT'
  const isValidated = payment.status === 'VALIDATED'

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
          <Badge tone={MISC_PAYMENT_STATUS_TONES[payment.status]}>
            {MISC_PAYMENT_STATUS_LABELS[payment.status]}
          </Badge>
        }
      />

      <Notice tone={isDraft ? 'warning' : isValidated ? 'success' : 'info'} className="mb-5">
        {MISC_PAYMENT_STATUS_HINTS[payment.status]}
      </Notice>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="Paiement"
            description="Un décaissement sans facture, documenté par son bénéficiaire et son motif (§43, §44)."
          >
            <dl>
              <InfoRow label="Bénéficiaire">{payment.beneficiary}</InfoRow>
              <InfoRow label="Catégorie">
                {MISC_PAYMENT_CATEGORY_LABELS[payment.category]}
              </InfoRow>
              <InfoRow label="Motif">{payment.purpose}</InfoRow>
              <InfoRow label="Montant">
                <span className="font-medium tabular">{formatAmount(payment.amount)}</span>
              </InfoRow>
              <InfoRow label="Date du paiement">{formatDate(payment.paidOn)}</InfoRow>
              <InfoRow label="Compte source" hint="Débité à la validation (§45).">
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
              description="Une sortie du montant payé, sur le compte source (§45)."
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
              description="C’est ce geste qui fait sortir les fonds (§45)."
            >
              <ValidateMiscPaymentPanel
                paymentId={payment.id}
                amount={payment.amount}
                accountLabel={payment.accountLabel}
              />
            </Card>
          )}

          {payment.status !== 'CANCELLED' && canCancel && (
            <Card
              title="Annuler"
              description="Rien n’est supprimé : la trace du paiement demeure (§47)."
            >
              <CancelMiscPaymentPanel
                paymentId={payment.id}
                amount={payment.amount}
                validated={isValidated}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
