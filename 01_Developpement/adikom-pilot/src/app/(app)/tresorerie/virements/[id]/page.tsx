import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, History } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import {
  getFinancialAccount,
  getInternalTransfer,
  listTreasuryEntries,
} from '@/features/treasury/data'
import { CancelTransferPanel, ValidateTransferPanel } from '@/features/treasury/panels'
import {
  DIRECTION_LABELS,
  ENTRY_STATUS_LABELS,
  ENTRY_STATUS_TONES,
  TRANSFER_STATUS_HINTS,
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUS_TONES,
  formatAmount,
  formatSigned,
} from '@/features/treasury/constants'

export const metadata: Metadata = { title: 'Virement interne' }

/**
 * Fiche d'un virement — Module 06 §31 et §32.
 *
 * « Il doit être possible de retrouver les DEUX écritures à partir du
 * virement » (§32). Elles sont donc présentées ensemble, avec leur sens : lues
 * séparément, elles ressembleraient à une dépense et à une recette sans lien.
 */
export default async function TransferDetailPage(
  props: PageProps<'/tresorerie/virements/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.TRANSFERS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams
  const justCreated = searchParams.cree === '1'

  const [canValidate, canCancel, canSeeEntries, canReadBalances, canSeeAccounts] =
    await Promise.all([
      can(PERMISSIONS.TRANSFERS_VALIDATE),
      can(PERMISSIONS.TRANSFERS_CANCEL),
      can(PERMISSIONS.ENTRIES_VIEW),
      can(PERMISSIONS.BALANCES_VIEW),
      can(PERMISSIONS.ACCOUNTS_VIEW),
    ])

  const transfer = await getInternalTransfer(id)
  if (!transfer) notFound()

  // Sans `treasury.entries.view`, la section DISPARAÎT : une liste vide se
  // lirait « ce virement n'a rien produit » (DEC-017).
  const entries = canSeeEntries
    ? await listTreasuryEntries({ internalTransferId: id })
    : null

  /*
   * Le solde du compte source n'est affiché que si l'écran peut le CALCULER :
   * `treasury.balances.view` ET `treasury.entries.view` (migration 050). Il
   * n'est jamais présenté à zéro faute de droits.
   */
  const canSeeBalances = canReadBalances && canSeeEntries
  const sourceAccount =
    canSeeAccounts && canSeeBalances && transfer.status === 'DRAFT'
      ? await getFinancialAccount(transfer.sourceAccountId, { canSeeBalances: true })
      : null

  const isDraft = transfer.status === 'DRAFT'
  const isValidated = transfer.status === 'VALIDATED'

  return (
    <>
      <Link
        href="/tresorerie/virements"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux virements
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Virement enregistré sous la référence <strong>{transfer.transferNo}</strong>. Il reste en
          brouillon : aucun fonds n’a encore été déplacé.
        </Notice>
      )}

      <PageHeader
        title={transfer.transferNo}
        description={`${formatAmount(transfer.amount)} · ${formatDate(transfer.transferDate)}`}
        actions={
          <Badge tone={TRANSFER_STATUS_TONES[transfer.status]}>
            {TRANSFER_STATUS_LABELS[transfer.status]}
          </Badge>
        }
      />

      <Notice tone={isDraft ? 'warning' : isValidated ? 'success' : 'info'} className="mb-5">
        {TRANSFER_STATUS_HINTS[transfer.status]}
      </Notice>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="Trajet des fonds"
            description="Un virement n’est ni une recette ni une dépense (Module 06 §28)."
          >
            <dl>
              <InfoRow label="Compte source" hint="Débité à la validation.">
                {transfer.sourceAccountLabel ? (
                  <Link
                    href={`/tresorerie/comptes/${transfer.sourceAccountId}`}
                    className="text-adikom-500 hover:underline"
                  >
                    {transfer.sourceAccountLabel}
                  </Link>
                ) : (
                  <span className="text-xs italic text-muted">
                    Compte non lisible avec vos droits
                  </span>
                )}
              </InfoRow>
              <InfoRow label="Compte destination" hint="Crédité du même montant.">
                {transfer.destinationAccountLabel ? (
                  <Link
                    href={`/tresorerie/comptes/${transfer.destinationAccountId}`}
                    className="text-adikom-500 hover:underline"
                  >
                    {transfer.destinationAccountLabel}
                  </Link>
                ) : (
                  <span className="text-xs italic text-muted">
                    Compte non lisible avec vos droits
                  </span>
                )}
              </InfoRow>
              <InfoRow label="Montant">
                <span className="font-medium tabular">{formatAmount(transfer.amount)}</span>
              </InfoRow>
              <InfoRow label="Devise">
                <span className="tabular">{transfer.currencyCode}</span>
              </InfoRow>
            </dl>
          </Card>

          {canSeeEntries ? (
            <Card
              title="Écritures produites"
              description="Une sortie et une entrée, liées au même virement (§31, §32)."
            >
              {entries === null || entries.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="Aucune écriture"
                  description={
                    isDraft
                      ? 'Ce virement est en brouillon : les écritures naîtront à sa validation.'
                      : 'Aucune écriture n’est rattachée à ce virement.'
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
              Votre compte ne peut pas consulter les écritures : ce virement peut en porter sans
              que cet écran puisse les montrer.
            </Notice>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Virement">
            <dl>
              <InfoRow label="Référence">
                <span className="tabular">{transfer.transferNo}</span>
              </InfoRow>
              <InfoRow label="Date">{formatDate(transfer.transferDate)}</InfoRow>
              <InfoRow label="Motif">{transfer.purpose ?? <Empty />}</InfoRow>
              <InfoRow label="Référence externe">{transfer.reference ?? <Empty />}</InfoRow>
              <InfoRow label="Commentaire">{transfer.notes ?? <Empty />}</InfoRow>
              <InfoRow label="Saisi le">{formatDateTime(transfer.createdAt)}</InfoRow>
              <InfoRow label="Validé le">
                {formatDateTime(transfer.validatedAt) ?? <Empty />}
              </InfoRow>
              <InfoRow label="Annulé le">
                {formatDateTime(transfer.cancelledAt) ?? <Empty />}
              </InfoRow>
              <InfoRow label="Motif d’annulation">{transfer.statusReason ?? <Empty />}</InfoRow>
            </dl>
          </Card>

          {isDraft && canValidate && (
            <Card
              title="Valider"
              description="Le contrôle du solde, puis les deux écritures (§30, §31)."
            >
              <ValidateTransferPanel
                transferId={transfer.id}
                amount={transfer.amount}
                sourceLabel={transfer.sourceAccountLabel}
                destinationLabel={transfer.destinationAccountLabel}
                sourceBalance={sourceAccount?.balance ?? null}
              />
            </Card>
          )}

          {transfer.status !== 'CANCELLED' && canCancel && (
            <Card
              title="Annuler"
              description="Rien n’est supprimé : l’historique du virement demeure (§33)."
            >
              <CancelTransferPanel
                transferId={transfer.id}
                amount={transfer.amount}
                validated={isValidated}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
