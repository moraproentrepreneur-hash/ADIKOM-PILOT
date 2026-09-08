import type { Metadata } from 'next'
import Link from 'next/link'
import { Banknote, Plus } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/dates'
import { listFinancialAccounts } from '@/features/treasury/data'
import { formatAmount } from '@/features/treasury/constants'
import { listMiscPayments } from '@/features/misc-payments/data'
import {
  MISC_PAYMENT_CATEGORY_LABELS,
  MISC_PAYMENT_CATEGORY_ORDER,
  MISC_PAYMENT_STATUS_LABELS,
  MISC_PAYMENT_STATUS_ORDER,
  MISC_PAYMENT_STATUS_TONES,
  MISC_PAYMENT_DIRECTIONS,
  MISC_PAYMENT_DIRECTION_LABELS,
  MISC_PAYMENT_DIRECTION_TONES,
} from '@/features/misc-payments/constants'

export const metadata: Metadata = { title: 'Paiements divers' }

/**
 * Paiements divers — Module 07 §43 à §46.
 *
 * « Des paiements qui ne sont pas directement rattachés à une facture client ou
 * fournisseur » (§43). Ce n'est pas une comptabilité générale : chaque ligne
 * reste un mouvement documenté, rattaché à un compte de trésorerie.
 *
 * DEUX SENS DEPUIS DEC-042 §b : encaissement ou décaissement. La liste le montre
 * colonne par colonne, et se filtre sur lui — on cherche rarement les deux à la
 * fois.
 */
export default async function MiscPaymentsPage(
  props: PageProps<'/facturation/paiements-divers'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.MISC_PAYMENTS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    accountId: read('compte'),
    direction: read('sens'),
    category: read('categorie'),
    status: read('statut'),
    from: read('du'),
    to: read('au'),
  }

  const [canCreate, canSeeAccounts] = await Promise.all([
    can(PERMISSIONS.MISC_PAYMENTS_CREATE),
    can(PERMISSIONS.ACCOUNTS_VIEW),
  ])

  const [payments, accounts] = await Promise.all([
    listMiscPayments(filters),
    canSeeAccounts
      ? listFinancialAccounts({}, { canSeeBalances: false })
      : Promise.resolve([]),
  ])

  const hasFilters = Object.values(filters).some(Boolean)
  const drafts = payments.filter((payment) => payment.status === 'DRAFT').length

  return (
    <>
      <PageHeader
        title="Paiements divers"
        description="Encaissements et décaissements sans facture rattachée : frais, petites dépenses, prestations ponctuelles."
        actions={
          canCreate && (
            <ButtonLink href="/facturation/paiements-divers/nouveau" icon={Plus}>
              Nouveau paiement
            </ButtonLink>
          )
        }
      />

      {!canSeeAccounts && (
        <Notice tone="warning" className="mb-5">
          Les <strong>comptes</strong> ne sont pas lisibles avec vos droits : les paiements
          s’affichent, mais sans le nom du compte qui les porte.
        </Notice>
      )}

      {drafts > 0 && (
        <Notice tone="info" className="mb-5">
          {drafts === 1 ? 'Un paiement attend' : `${drafts} paiements attendent`} une{' '}
          <strong>validation</strong>. Tant qu’ils sont en brouillon, aucun fonds n’a bougé.
        </Notice>
      )}

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              name="q"
              defaultValue={filters.search}
              placeholder="Numéro, bénéficiaire, motif…"
              aria-label="Rechercher un paiement"
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

            <Select
              name="categorie"
              defaultValue={filters.category}
              aria-label="Filtrer par catégorie"
            >
              <option value="">Toutes les catégories</option>
              {MISC_PAYMENT_CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {MISC_PAYMENT_CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>

            <Select name="sens" defaultValue={filters.direction} aria-label="Filtrer par sens">
              <option value="">Les deux sens</option>
              {MISC_PAYMENT_DIRECTIONS.map((value) => (
                <option key={value} value={value}>
                  {MISC_PAYMENT_DIRECTION_LABELS[value]}
                </option>
              ))}
            </Select>

            <Select name="statut" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {MISC_PAYMENT_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {MISC_PAYMENT_STATUS_LABELS[status]}
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
                {payments.length} résultat{payments.length > 1 ? 's' : ''} ·{' '}
                <Link
                  href="/facturation/paiements-divers"
                  className="text-adikom-500 hover:underline"
                >
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {payments.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title={hasFilters ? 'Aucun paiement ne correspond' : 'Aucun paiement divers'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Aucun mouvement hors facture n’a encore été enregistré.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/facturation/paiements-divers" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/facturation/paiements-divers/nouveau" icon={Plus}>
                  Nouveau paiement
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
                    <th className="px-5 py-3 font-medium text-ink">Numéro</th>
                    <th className="px-5 py-3 font-medium text-ink">Date</th>
                    <th className="px-5 py-3 font-medium text-ink">Sens</th>
                    <th className="px-5 py-3 font-medium text-ink">Tiers</th>
                    <th className="px-5 py-3 font-medium text-ink">Catégorie</th>
                    <th className="px-5 py-3 font-medium text-ink">Compte</th>
                    <th className="px-5 py-3 font-medium text-ink">Montant</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/facturation/paiements-divers/${payment.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {payment.paymentNo}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDate(payment.paidOn)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={MISC_PAYMENT_DIRECTION_TONES[payment.direction]}>
                          {MISC_PAYMENT_DIRECTION_LABELS[payment.direction]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-ink">
                        {payment.beneficiary}
                        <span className="block text-xs text-muted">{payment.purpose}</span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {MISC_PAYMENT_CATEGORY_LABELS[payment.category]}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {payment.accountLabel ?? (
                          <span className="text-xs italic">Compte non lisible</span>
                        )}
                      </td>
                      <td
                        className={
                          payment.status === 'CANCELLED'
                            ? 'px-5 py-3 text-muted line-through tabular'
                            : 'px-5 py-3 font-medium text-ink tabular'
                        }
                      >
                        {formatAmount(payment.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={MISC_PAYMENT_STATUS_TONES[payment.status]}>
                          {MISC_PAYMENT_STATUS_LABELS[payment.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {payments.map((payment) => (
                <li key={payment.id} className="rounded-control border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/facturation/paiements-divers/${payment.id}`}
                        className="font-medium text-adikom-500 hover:underline"
                      >
                        {payment.paymentNo}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {formatDate(payment.paidOn)} · {payment.beneficiary}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={MISC_PAYMENT_DIRECTION_TONES[payment.direction]}>
                        {MISC_PAYMENT_DIRECTION_LABELS[payment.direction]}
                      </Badge>
                      <Badge tone={MISC_PAYMENT_STATUS_TONES[payment.status]}>
                        {MISC_PAYMENT_STATUS_LABELS[payment.status]}
                      </Badge>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-muted">
                    {MISC_PAYMENT_CATEGORY_LABELS[payment.category]} ·{' '}
                    {payment.accountLabel ?? 'Compte non lisible'}
                  </p>

                  <p
                    className={
                      payment.status === 'CANCELLED'
                        ? 'mt-2 text-sm text-muted line-through tabular'
                        : 'mt-2 text-sm font-medium text-ink tabular'
                    }
                  >
                    {formatAmount(payment.amount)}
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
