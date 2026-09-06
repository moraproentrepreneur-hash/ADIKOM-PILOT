import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Banknote, Plus } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/dates'
import { listFinancialAccounts, listInternalTransfers } from '@/features/treasury/data'
import {
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUS_ORDER,
  TRANSFER_STATUS_TONES,
  formatAmount,
} from '@/features/treasury/constants'

export const metadata: Metadata = { title: 'Virements internes' }

/**
 * Virements internes — Module 06 §28 à §33.
 *
 * « Le virement ne constitue pas un revenu ou une dépense de l'entreprise. Il
 * s'agit d'un transfert interne » (§28). L'écran présente donc les DEUX comptes
 * sur la même ligne : lire une seule moitié laisserait croire à une dépense.
 *
 * LIRE LES VIREMENTS EST UNE CAPACITÉ À PART.
 *
 * `treasury.transfers.view` (DEC-040). Voir les écritures n'ouvre pas cet écran :
 * un virement en brouillon n'en a produit aucune, et resterait invisible à qui
 * doit le valider.
 */
export default async function TransfersPage(props: PageProps<'/tresorerie/virements'>) {
  await requirePermissionOrRedirect(PERMISSIONS.TRANSFERS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    accountId: read('compte'),
    status: read('statut'),
    from: read('du'),
    to: read('au'),
  }

  const [canCreate, canSeeAccounts] = await Promise.all([
    can(PERMISSIONS.TRANSFERS_CREATE),
    can(PERMISSIONS.ACCOUNTS_VIEW),
  ])

  const [transfers, accounts] = await Promise.all([
    listInternalTransfers(filters),
    canSeeAccounts
      ? listFinancialAccounts({}, { canSeeBalances: false })
      : Promise.resolve([]),
  ])

  const hasFilters = Object.values(filters).some(Boolean)
  const drafts = transfers.filter((transfer) => transfer.status === 'DRAFT').length

  return (
    <>
      <PageHeader
        title="Virements internes"
        description="Transferts entre les comptes d’ADIKOM. Ni recette ni dépense : l’argent change de place."
        actions={
          canCreate && (
            <ButtonLink href="/tresorerie/virements/nouveau" icon={Plus}>
              Nouveau virement
            </ButtonLink>
          )
        }
      />

      {!canSeeAccounts && (
        <Notice tone="warning" className="mb-5">
          Les <strong>comptes</strong> ne sont pas lisibles avec vos droits : les virements
          s’affichent, mais sans le nom des comptes qu’ils relient.
        </Notice>
      )}

      {drafts > 0 && (
        <Notice tone="info" className="mb-5">
          {drafts === 1 ? 'Un virement attend' : `${drafts} virements attendent`} une{' '}
          <strong>validation</strong>. Tant qu’ils sont en brouillon, aucun fonds n’a été déplacé.
        </Notice>
      )}

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              name="q"
              defaultValue={filters.search}
              placeholder="Référence, motif, numéro…"
              aria-label="Rechercher un virement"
              className="lg:col-span-2"
            />

            <Select
              name="compte"
              defaultValue={filters.accountId}
              aria-label="Filtrer par compte"
            >
              <option value="">Tous les comptes</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} ({account.accountNo})
                </option>
              ))}
            </Select>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {TRANSFER_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {TRANSFER_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>

            <Input name="du" type="date" defaultValue={filters.from} aria-label="Depuis le" />
            <Input name="au" type="date" defaultValue={filters.to} aria-label="Jusqu’au" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              Filtrer
            </button>

            {hasFilters && (
              <p className="text-xs text-muted">
                {transfers.length} résultat{transfers.length > 1 ? 's' : ''} ·{' '}
                <Link href="/tresorerie/virements" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {transfers.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title={hasFilters ? 'Aucun virement ne correspond' : 'Aucun virement'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Aucun transfert n’a encore été enregistré entre les comptes d’ADIKOM.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/tresorerie/virements" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/tresorerie/virements/nouveau" icon={Plus}>
                  Nouveau virement
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="-mx-5 -my-4 hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-adikom-50 text-left">
                    <th className="px-5 py-3 font-medium text-ink">Référence</th>
                    <th className="px-5 py-3 font-medium text-ink">Date</th>
                    <th className="px-5 py-3 font-medium text-ink">Trajet</th>
                    <th className="px-5 py-3 font-medium text-ink">Montant</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((transfer) => (
                    <tr
                      key={transfer.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/tresorerie/virements/${transfer.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {transfer.transferNo}
                        </Link>
                        {transfer.purpose && (
                          <span className="block text-xs text-muted">{transfer.purpose}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDate(transfer.transferDate)}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {transfer.sourceAccountLabel ?? (
                            <em className="text-xs">Compte non lisible</em>
                          )}
                          <ArrowRight className="size-3.5 shrink-0" aria-label="vers" />
                          {transfer.destinationAccountLabel ?? (
                            <em className="text-xs">Compte non lisible</em>
                          )}
                        </span>
                      </td>
                      <td
                        className={
                          transfer.status === 'CANCELLED'
                            ? 'px-5 py-3 text-muted line-through tabular'
                            : 'px-5 py-3 font-medium text-ink tabular'
                        }
                      >
                        {formatAmount(transfer.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={TRANSFER_STATUS_TONES[transfer.status]}>
                          {TRANSFER_STATUS_LABELS[transfer.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {transfers.map((transfer) => (
                <li key={transfer.id} className="rounded-control border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/tresorerie/virements/${transfer.id}`}
                        className="font-medium text-adikom-500 hover:underline"
                      >
                        {transfer.transferNo}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {formatDate(transfer.transferDate)}
                        {transfer.purpose ? ` · ${transfer.purpose}` : ''}
                      </p>
                    </div>
                    <Badge tone={TRANSFER_STATUS_TONES[transfer.status]}>
                      {TRANSFER_STATUS_LABELS[transfer.status]}
                    </Badge>
                  </div>

                  <p className="mt-2 text-xs text-muted">
                    {transfer.sourceAccountLabel ?? 'Compte non lisible'} →{' '}
                    {transfer.destinationAccountLabel ?? 'Compte non lisible'}
                  </p>

                  <p
                    className={
                      transfer.status === 'CANCELLED'
                        ? 'mt-2 text-sm text-muted line-through tabular'
                        : 'mt-2 text-sm font-medium text-ink tabular'
                    }
                  >
                    {formatAmount(transfer.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  )
}
