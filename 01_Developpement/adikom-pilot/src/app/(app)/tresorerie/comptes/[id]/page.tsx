import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Banknote, History } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { StatusChangeForm } from '@/components/ui/status-change-form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import {
  getFinancialAccount,
  listInternalTransfers,
  listTreasuryEntries,
} from '@/features/treasury/data'
import { setFinancialAccountStatusAction } from '@/features/treasury/actions'
import { EditAccountPanel } from '@/features/treasury/panels'
import {
  ACCOUNT_INSTITUTION_LABELS,
  ACCOUNT_KIND_LABELS,
  ACCOUNT_STATUS_HINTS,
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_STATUS_TONES,
  ENTRY_KIND_LABELS,
  ENTRY_STATUS_LABELS,
  ENTRY_STATUS_TONES,
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUS_TONES,
  formatAmount,
  formatSigned,
} from '@/features/treasury/constants'

export const metadata: Metadata = { title: 'Compte financier' }

/**
 * Fiche d'un compte — Module 06 §16, §17, §41.
 *
 * Le solde y est CALCULÉ, jamais lu dans une colonne : solde initial, plus les
 * entrées, moins les sorties, écritures validées seulement. C'est aussi ce qui
 * rend l'historique lisible — chaque ligne explique une part du solde.
 */
export default async function AccountDetailPage(props: PageProps<'/tresorerie/comptes/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.ACCOUNTS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams
  const justCreated = searchParams.cree === '1'

  const [canUpdate, canArchive, canReadBalances, canSeeEntries, canSeeTransfers] =
    await Promise.all([
      can(PERMISSIONS.ACCOUNTS_UPDATE),
      can(PERMISSIONS.ACCOUNTS_ARCHIVE),
      can(PERMISSIONS.BALANCES_VIEW),
      can(PERMISSIONS.ENTRIES_VIEW),
      can(PERMISSIONS.TRANSFERS_VIEW),
    ])

  // Le solde est la somme des écritures : sans le droit de les lire, la base
  // refuse de le calculer plutôt que de renvoyer le solde d'ouverture (050).
  const canSeeBalances = canReadBalances && canSeeEntries

  const account = await getFinancialAccount(id, { canSeeBalances })
  if (!account) notFound()

  // Sans `treasury.entries.view`, la section DISPARAÎT : une liste vide se
  // lirait « ce compte n'a jamais bougé » (DEC-017).
  const entries = canSeeEntries ? await listTreasuryEntries({ accountId: id }) : null

  /*
   * Module 06 §16 — la fiche d'un compte comporte un volet « Virements ».
   *
   * Un virement en BROUILLON n'a produit aucune écriture : il n'apparaîtrait
   * nulle part ailleurs, alors qu'il engage ce compte. Sa lecture relève de
   * `treasury.transfers.view`, distincte de celle des écritures (DEC-040).
   */
  const transfers = canSeeTransfers
    ? await listInternalTransfers({ accountId: id })
    : null

  const balanceLocked = (entries ?? []).length > 0

  return (
    <>
      <Link
        href="/tresorerie/comptes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux comptes
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Compte ouvert sous l’identifiant <strong>{account.accountNo}</strong>.
        </Notice>
      )}

      <PageHeader
        title={account.label}
        description={`${account.accountNo} · ${ACCOUNT_KIND_LABELS[account.kind]}`}
        actions={
          <Badge tone={ACCOUNT_STATUS_TONES[account.status]}>
            {ACCOUNT_STATUS_LABELS[account.status]}
          </Badge>
        }
      />

      {account.status !== 'ACTIVE' && (
        <Notice tone="warning" className="mb-5">
          Ce compte n’est plus proposé pour de nouvelles opérations. Son historique
          reste consultable.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Solde" description="Solde initial + entrées − sorties.">
            <dl>
              <InfoRow label="Solde initial" hint="Figé dès la première écriture.">
                <span className="tabular">{formatAmount(account.openingBalance)}</span>
              </InfoRow>
              <InfoRow label="Solde actuel">
                {!canSeeBalances ? (
                  <span className="text-muted">
                    Votre compte ne peut pas consulter les soldes, ou les écritures dont ils sont
                    la somme.
                  </span>
                ) : account.balance === null ? (
                  <span className="text-muted">Non calculable.</span>
                ) : (
                  <span className="font-medium tabular">{formatAmount(account.balance)}</span>
                )}
              </InfoRow>
              <InfoRow label="Devise">
                <span className="tabular">{account.currencyCode}</span>
              </InfoRow>
            </dl>
          </Card>

          {canSeeEntries ? (
            <Card
              title="Écritures"
              description="Chaque mouvement, son sens et son origine."
            >
              {entries === null || entries.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="Aucune écriture"
                  description="Ce compte n’a encore été mouvementé par aucun règlement."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {entries.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {ENTRY_KIND_LABELS[entry.kind]}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDate(entry.entryDate)}
                          {entry.description ? ` · ${entry.description}` : ''}
                          {entry.reference ? ` · ${entry.reference}` : ''}
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
              Votre compte ne peut pas consulter les écritures : ce compte peut en porter sans que
              cet écran puisse les montrer.
            </Notice>
          )}

          {canSeeTransfers && (
            <Card
              title="Virements"
              description="Transferts au départ ou à destination de ce compte."
            >
              {transfers === null || transfers.length === 0 ? (
                <EmptyState
                  icon={Banknote}
                  title="Aucun virement"
                  description="Ce compte n’a encore participé à aucun transfert interne."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {transfers.map((transfer) => (
                    <li
                      key={transfer.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/tresorerie/virements/${transfer.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {transfer.transferNo}
                        </Link>
                        <p className="text-xs text-muted">
                          {formatDate(transfer.transferDate)} ·{' '}
                          {transfer.sourceAccountId === id
                            ? `Sortie vers ${transfer.destinationAccountLabel ?? 'un compte non lisible'}`
                            : `Entrée depuis ${transfer.sourceAccountLabel ?? 'un compte non lisible'}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            transfer.status === 'VALIDATED'
                              ? 'font-medium text-ink tabular'
                              : 'text-sm text-muted tabular'
                          }
                        >
                          {formatAmount(transfer.amount)}
                        </span>
                        <Badge tone={TRANSFER_STATUS_TONES[transfer.status]}>
                          {TRANSFER_STATUS_LABELS[transfer.status]}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Compte">
            <dl>
              <InfoRow label="Identifiant">
                <span className="tabular">{account.accountNo}</span>
              </InfoRow>
              <InfoRow label="Type">{ACCOUNT_KIND_LABELS[account.kind]}</InfoRow>
              <InfoRow label={ACCOUNT_INSTITUTION_LABELS[account.kind]}>
                {account.institution ?? <Empty />}
              </InfoRow>
              <InfoRow label="Numéro ou référence">
                {account.accountReference ?? <Empty />}
              </InfoRow>
              <InfoRow label="Ouvert le">{formatDate(account.openedOn) ?? <Empty />}</InfoRow>
              <InfoRow label="Description">{account.description ?? <Empty />}</InfoRow>
              <InfoRow label="Motif du dernier changement">
                {account.statusReason ?? <Empty />}
              </InfoRow>
              <InfoRow label="Créé le">{formatDateTime(account.createdAt)}</InfoRow>
            </dl>
          </Card>

          {canUpdate && (
            <Card title="Modifier">
              <EditAccountPanel
                accountId={id}
                kind={account.kind}
                label={account.label}
                institution={account.institution}
                accountReference={account.accountReference}
                openingBalance={account.openingBalance}
                openedOn={account.openedOn}
                description={account.description}
                balanceLocked={balanceLocked || !canSeeEntries}
              />
            </Card>
          )}

          {canArchive && (
            <Card
              title="Statut du compte"
              description="Seul un compte actif reçoit de nouvelles opérations."
            >
              <StatusChangeForm
                action={setFinancialAccountStatusAction}
                entityId={id}
                entityField="accountId"
                currentStatus={account.status}
                labels={ACCOUNT_STATUS_LABELS}
                hints={ACCOUNT_STATUS_HINTS}
                reasonPlaceholder="Compte clôturé, caisse transférée…"
              />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
