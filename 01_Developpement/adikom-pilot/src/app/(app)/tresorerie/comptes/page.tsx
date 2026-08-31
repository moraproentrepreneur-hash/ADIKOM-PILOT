import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Search, Wallet } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listFinancialAccounts } from '@/features/treasury/data'
import {
  ACCOUNT_KIND_LABELS,
  ACCOUNT_KIND_ORDER,
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_STATUS_ORDER,
  ACCOUNT_STATUS_TONES,
  formatAmount,
} from '@/features/treasury/constants'

export const metadata: Metadata = { title: 'Comptes financiers' }

/**
 * Comptes bancaires et caisses — Étape 2.5, LOT 6.
 *
 * VOIR UN COMPTE N'EST PAS VOIR SON SOLDE.
 *
 * Le catalogue distingue `treasury.accounts.view` de `treasury.balances.view`
 * (DEC-024). Sans la seconde, la colonne des soldes DISPARAÎT — elle n'affiche
 * pas « 0 KMF », qui se lirait « compte vide » (DEC-017).
 */
export default async function AccountsPage(props: PageProps<'/tresorerie/comptes'>) {
  await requirePermissionOrRedirect(PERMISSIONS.ACCOUNTS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = { search: read('q'), kind: read('type'), status: read('statut') }

  /*
   * Le solde est la SOMME DES ÉCRITURES : le calculer suppose de pouvoir les
   * lire. Sans `treasury.entries.view`, la base refuse — et elle a raison : un
   * solde calculé sur des écritures invisibles vaudrait le seul solde
   * d'ouverture, sans le dire (migration 050).
   */
  const [canCreate, canReadBalances, canReadEntries] = await Promise.all([
    can(PERMISSIONS.ACCOUNTS_CREATE),
    can(PERMISSIONS.BALANCES_VIEW),
    can(PERMISSIONS.ENTRIES_VIEW),
  ])

  const canSeeBalances = canReadBalances && canReadEntries

  const accounts = await listFinancialAccounts(filters, { canSeeBalances })
  const hasFilters = Boolean(filters.search || filters.kind || filters.status)

  return (
    <>
      <PageHeader
        title="Comptes financiers"
        description="Banques et caisses d’ADIKOM. Le solde ne se saisit pas : il se calcule des écritures."
        actions={
          canCreate && (
            <ButtonLink href="/tresorerie/comptes/nouveau" icon={Plus}>
              Ouvrir un compte
            </ButtonLink>
          )
        }
      />

      {!canSeeBalances && (
        <Notice tone="warning" className="mb-5">
          Les <strong>soldes</strong> ne sont pas affichés : ils supposent le droit de les
          consulter <em>et</em> celui de lire les écritures dont ils sont la somme. Ils ne sont pas
          nuls pour autant.
        </Notice>
      )}

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative lg:col-span-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                name="q"
                type="search"
                defaultValue={filters.search}
                placeholder="Nom, identifiant, banque…"
                aria-label="Rechercher un compte"
                className="pl-9"
              />
            </div>

            <Select name="type" defaultValue={filters.kind} aria-label="Filtrer par type">
              <option value="">Tous les types</option>
              {ACCOUNT_KIND_ORDER.map((kind) => (
                <option key={kind} value={kind}>
                  {ACCOUNT_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par statut">
              <option value="">Tous les statuts</option>
              {ACCOUNT_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {ACCOUNT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
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
                {accounts.length} résultat{accounts.length > 1 ? 's' : ''} ·{' '}
                <Link href="/tresorerie/comptes" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {accounts.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={hasFilters ? 'Aucun compte ne correspond' : 'Aucun compte financier'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Ouvrez un compte bancaire ou une caisse : un règlement fournisseur suppose un compte à mouvementer.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/tresorerie/comptes" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/tresorerie/comptes/nouveau" icon={Plus}>
                  Ouvrir un compte
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
                    <th className="px-5 py-3 font-medium text-ink">Compte</th>
                    <th className="px-5 py-3 font-medium text-ink">Type</th>
                    <th className="px-5 py-3 font-medium text-ink">Banque / responsable</th>
                    {canSeeBalances && <th className="px-5 py-3 font-medium text-ink">Solde</th>}
                    <th className="px-5 py-3 font-medium text-ink">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr
                      key={account.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/tresorerie/comptes/${account.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {account.label}
                        </Link>
                        <span className="block text-xs text-muted tabular">
                          {account.accountNo}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {ACCOUNT_KIND_LABELS[account.kind]}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {account.institution ?? <span className="text-xs italic">—</span>}
                      </td>
                      {canSeeBalances && (
                        <td className="px-5 py-3 font-medium text-ink tabular">
                          {formatAmount(account.balance) ?? (
                            <span className="text-xs font-normal italic text-muted">
                              Non calculable
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-5 py-3">
                        <Badge tone={ACCOUNT_STATUS_TONES[account.status]}>
                          {ACCOUNT_STATUS_LABELS[account.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {accounts.map((account) => (
                <li key={account.id}>
                  <Link
                    href={`/tresorerie/comptes/${account.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{account.label}</p>
                        <p className="truncate text-xs text-muted tabular">
                          {account.accountNo} · {ACCOUNT_KIND_LABELS[account.kind]}
                        </p>
                      </div>
                      <Badge tone={ACCOUNT_STATUS_TONES[account.status]}>
                        {ACCOUNT_STATUS_LABELS[account.status]}
                      </Badge>
                    </div>
                    {canSeeBalances && (
                      <p className="mt-3 text-sm font-medium text-ink tabular">
                        {formatAmount(account.balance) ?? 'Solde non calculable'}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  )
}
