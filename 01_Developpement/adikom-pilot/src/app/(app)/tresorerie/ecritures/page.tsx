import type { Metadata } from 'next'
import Link from 'next/link'
import { History } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { ExportButton } from '@/components/ui/export-button'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/dates'
import { listFinancialAccounts, listTreasuryEntries } from '@/features/treasury/data'
import {
  DIRECTION_LABELS,
  ENTRY_KIND_LABELS,
  ENTRY_STATUS_LABELS,
  ENTRY_STATUS_TONES,
  formatSigned,
} from '@/features/treasury/constants'

export const metadata: Metadata = { title: 'Écritures' }

/**
 * Journal des mouvements financiers — Module 06 §24 à §27.
 *
 * Une écriture y est toujours lue avec son SENS (§19) : le montant stocké est
 * positif, et l'afficher nu laisserait confondre une entrée et une sortie.
 *
 * AUCUNE ÉCRITURE NE SE SAISIT ICI. Elles naissent d'un règlement : le dépôt,
 * le retrait et le virement interne relèvent d'un lot ultérieur.
 */
export default async function EntriesPage(props: PageProps<'/tresorerie/ecritures'>) {
  await requirePermissionOrRedirect(PERMISSIONS.ENTRIES_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    accountId: read('compte'),
    direction: read('sens'),
    status: read('statut'),
    from: read('du'),
    to: read('au'),
  }

  const [canExport, canSeeAccounts] = await Promise.all([
    can(PERMISSIONS.ENTRIES_EXPORT),
    can(PERMISSIONS.ACCOUNTS_VIEW),
  ])

  const [entries, accounts] = await Promise.all([
    listTreasuryEntries(filters),
    canSeeAccounts
      ? listFinancialAccounts({}, { canSeeBalances: false })
      : Promise.resolve([]),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Écritures"
        description="Mouvements des comptes bancaires et des caisses. Chaque écriture porte son sens et son origine."
        actions={
          canExport && (
            <ExportButton
              module="ecritures"
              filters={{
                compte: filters.accountId,
                sens: filters.direction,
                statut: filters.status,
                du: filters.from,
                au: filters.to,
              }}
            />
          )
        }
      />

      <Notice tone="info" className="mb-5">
        Une écriture naît d’un <strong>règlement</strong> : elle ne se saisit pas ici. Les dépôts,
        retraits et virements internes relèvent d’une étape ultérieure.
      </Notice>

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              name="compte"
              defaultValue={filters.accountId}
              aria-label="Filtrer par compte"
              className="lg:col-span-2"
            >
              <option value="">Tous les comptes</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} ({account.accountNo})
                </option>
              ))}
            </Select>

            <Select name="sens" defaultValue={filters.direction} aria-label="Filtrer par sens">
              <option value="">Tous les sens</option>
              <option value="IN">Entrée</option>
              <option value="OUT">Sortie</option>
            </Select>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              <option value="VALIDATED">Validée</option>
              <option value="CANCELLED">Annulée</option>
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
                {entries.length} résultat{entries.length > 1 ? 's' : ''} ·{' '}
                <Link href="/tresorerie/ecritures" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <EmptyState
            icon={History}
            title={hasFilters ? 'Aucune écriture ne correspond' : 'Aucune écriture'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Aucun compte n’a encore été mouvementé.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/tresorerie/ecritures" tone="secondary">
                  Réinitialiser les filtres
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
                    <th className="px-5 py-3 font-medium text-ink">Date</th>
                    <th className="px-5 py-3 font-medium text-ink">Compte</th>
                    <th className="px-5 py-3 font-medium text-ink">Origine</th>
                    <th className="px-5 py-3 font-medium text-ink">Sens</th>
                    <th className="px-5 py-3 font-medium text-ink">Montant</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDate(entry.entryDate)}
                      </td>
                      <td className="px-5 py-3">
                        {entry.accountLabel ? (
                          <Link
                            href={`/tresorerie/comptes/${entry.accountId}`}
                            className="text-adikom-500 hover:underline"
                          >
                            {entry.accountLabel}
                          </Link>
                        ) : (
                          <span className="text-xs italic text-muted">
                            Compte non lisible avec vos droits
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {ENTRY_KIND_LABELS[entry.kind]}
                        {entry.description && (
                          <span className="block text-xs">{entry.description}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {DIRECTION_LABELS[entry.direction]}
                      </td>
                      <td
                        className={
                          entry.status === 'CANCELLED'
                            ? 'px-5 py-3 text-muted line-through tabular'
                            : 'px-5 py-3 font-medium text-ink tabular'
                        }
                      >
                        {formatSigned(entry.direction, entry.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={ENTRY_STATUS_TONES[entry.status]}>
                          {ENTRY_STATUS_LABELS[entry.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-control border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{ENTRY_KIND_LABELS[entry.kind]}</p>
                      <p className="truncate text-xs text-muted">
                        {formatDate(entry.entryDate)} ·{' '}
                        {entry.accountLabel ?? 'Compte non lisible'}
                      </p>
                    </div>
                    <Badge tone={ENTRY_STATUS_TONES[entry.status]}>
                      {ENTRY_STATUS_LABELS[entry.status]}
                    </Badge>
                  </div>
                  <p
                    className={
                      entry.status === 'CANCELLED'
                        ? 'mt-3 text-sm text-muted line-through tabular'
                        : 'mt-3 text-sm font-medium text-ink tabular'
                    }
                  >
                    {formatSigned(entry.direction, entry.amount)}
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
