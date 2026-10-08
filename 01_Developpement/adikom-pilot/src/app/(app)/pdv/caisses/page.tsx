import type { Metadata } from 'next'
import Link from 'next/link'
import { Calculator, Plus, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { listRegisters, type PosRegister } from '@/features/pos/data'
import { OpenSessionBanner } from '@/features/pos/open-session-banner'

export const metadata: Metadata = { title: 'Caisses' }

/**
 * Caisses du point de vente — LOT 27, Module 12 §3.
 *
 * UNE CAISSE N'EST PAS UN COMPTE : la colonne « Compte adossé » le montre. Le
 * solde, lui, n'est jamais affiché ici — il appartient au compte, dans Banques
 * & Caisses, sous ses propres capacités.
 */
export default async function RegistersPage(props: PageProps<'/pdv/caisses'>) {
  await requirePermissionOrRedirect(PERMISSIONS.POS_REGISTERS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''
  const filters = { search: read('q'), active: read('active') }

  const [canCreate, canSeeSessions, canSeeAccounts] = await Promise.all([
    can(PERMISSIONS.POS_REGISTERS_CREATE),
    can(PERMISSIONS.POS_SESSIONS_VIEW),
    can(PERMISSIONS.ACCOUNTS_VIEW),
  ])

  const registers = await listRegisters(filters, { canSeeSessions })
  const hasFilters = Boolean(filters.search || filters.active)

  return (
    <>
      <OpenSessionBanner />

      <PageHeader
        title="Caisses"
        description="Les caisses du point de vente, chacune adossée à un compte de type Caisse."
        actions={
          canCreate && (
            <ButtonLink href="/pdv/caisses/nouvelle" icon={Plus}>
              Déclarer une caisse
            </ButtonLink>
          )
        }
      />

      {!canSeeAccounts && (
        <Notice tone="info" className="mb-5">
          Les <strong>comptes adossés</strong> ne sont pas nommés : leur consultation relève des
          comptes financiers. Chaque caisse en a pourtant un.
        </Notice>
      )}

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative sm:col-span-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                name="q"
                type="search"
                defaultValue={filters.search}
                placeholder="Nom, numéro, lieu…"
                aria-label="Rechercher une caisse"
                className="pl-9"
              />
            </div>
            <Select name="active" defaultValue={filters.active} aria-label="Filtrer par état">
              <option value="">Actives et inactives</option>
              <option value="oui">Actives</option>
              <option value="non">Inactives</option>
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
                {registers.length} résultat{registers.length > 1 ? 's' : ''} ·{' '}
                <Link href="/pdv/caisses" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              </p>
            )}
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {registers.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title={hasFilters ? 'Aucune caisse ne correspond' : 'Aucune caisse déclarée'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Déclarez une caisse, adossée à un compte de type Caisse, pour ouvrir des sessions.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/pdv/caisses" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/pdv/caisses/nouvelle" icon={Plus}>
                  Déclarer une caisse
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
                    <th className="px-5 py-3 font-medium text-ink">Caisse</th>
                    <th className="px-5 py-3 font-medium text-ink">Compte adossé</th>
                    <th className="px-5 py-3 font-medium text-ink">Lieu</th>
                    {canSeeSessions && (
                      <th className="px-5 py-3 font-medium text-ink">Session en cours</th>
                    )}
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {registers.map((register) => (
                    <tr
                      key={register.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/pdv/caisses/${register.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {register.label}
                        </Link>
                        <span className="block text-xs text-muted tabular">{register.registerNo}</span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        <AccountCell register={register} />
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {register.location ?? <span className="text-xs italic">—</span>}
                      </td>
                      {canSeeSessions && (
                        <td className="px-5 py-3">
                          <OpenSessionCell register={register} />
                        </td>
                      )}
                      <td className="px-5 py-3">
                        <Badge tone={register.isActive ? 'success' : 'neutral'}>
                          {register.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {registers.map((register) => (
                <li key={register.id}>
                  <Link
                    href={`/pdv/caisses/${register.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{register.label}</p>
                        <p className="truncate text-xs text-muted tabular">
                          {register.registerNo}
                          {register.location ? ` · ${register.location}` : ''}
                        </p>
                      </div>
                      <Badge tone={register.isActive ? 'success' : 'neutral'}>
                        {register.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      <AccountCell register={register} />
                    </p>
                    {canSeeSessions && (
                      <div className="mt-2 text-xs">
                        <OpenSessionCell register={register} />
                      </div>
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

function AccountCell({ register }: { register: PosRegister }) {
  if (register.accountLabel === null) {
    return <span className="text-xs italic">Compte non lisible avec vos droits</span>
  }
  return (
    <>
      {register.accountLabel}
      {register.accountActive === false && (
        <span className="ml-1.5 text-xs text-warning">· compte inactif</span>
      )}
    </>
  )
}

function OpenSessionCell({ register }: { register: PosRegister }) {
  if (!register.openSession) return <span className="text-xs text-muted">Aucune</span>
  return (
    <span className="text-xs text-ink">
      <span className="font-medium tabular">{register.openSession.sessionNo}</span>
      <span className="block text-muted">
        {register.openSession.cashierLabel} · {formatDateTime(register.openSession.openedAt)}
      </span>
    </span>
  )
}
