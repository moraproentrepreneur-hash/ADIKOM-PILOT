import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckSquare, Search } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { Tabs } from '@/components/ui/tabs'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/dates'
import { TASK_STATUS_LABELS } from '@/features/projects/data'
import { moduleAccess } from '@/features/projects/access'
import { moduleTabs } from '@/features/projects/tabs'
import {
  ACTION_STATUSES,
  ACTION_STATUS_LABELS,
  ACTION_STATUS_TONES,
  listActions,
} from '@/features/planning/data'

export const metadata: Metadata = { title: 'Actions' }

/**
 * Liste des actions — Module 03 §25, §37, §53.12.
 *
 * §37 : la Direction doit pouvoir identifier « les actions en attente ». Le
 * filtre est donc mis en avant, et le compteur le dit sans qu'on ait à filtrer.
 *
 * UNE ACTION NE SE CRÉE PAS ICI.
 *
 * §25 : elle découle d'une réunion ou d'une décision. Le formulaire de création
 * vit donc sur la fiche de son origine, jamais seul — une action sans origine
 * serait une tâche, et la base la refuse. Cet écran RASSEMBLE, il n'invente pas.
 */
export default async function ActionsPage(props: PageProps<'/projets/actions'>) {
  await requirePermissionOrRedirect(PERMISSIONS.ACTIONS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('etat'),
    pendingOnly: read('attente') === '1',
    lateOnly: read('retard') === '1',
  }

  const [actions, access] = await Promise.all([listActions(filters), moduleAccess()])

  const hasFilters = Boolean(
    filters.search || filters.status || filters.pendingOnly || filters.lateOnly
  )

  const pending = actions.filter((action) => action.status === 'TODO' && !action.taskId).length
  const late = actions.filter((action) => action.isLate).length

  const keep = (extra: Record<string, string>) => {
    const params = new URLSearchParams()
    if (filters.search) params.set('q', filters.search)
    if (filters.status) params.set('etat', filters.status)
    if (filters.pendingOnly) params.set('attente', '1')
    if (filters.lateOnly) params.set('retard', '1')
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const query = params.toString()
    return query ? `/projets/actions?${query}` : '/projets/actions'
  }

  return (
    <>
      <PageHeader
        title="Actions"
        description="Ce qui découle des réunions et des décisions, et qui s’en charge."
      />

      <Tabs items={moduleTabs('actions', { ...access, actions: true })} current="actions" />

      <Notice tone="info" className="mb-5">
        Une action se crée depuis la fiche de la réunion ou de la décision dont elle découle
        (§25). Sans origine, ce serait une tâche.
      </Notice>

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative lg:col-span-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                name="q"
                type="search"
                defaultValue={filters.search}
                placeholder="Libellé, description…"
                aria-label="Rechercher une action"
                className="pl-9"
              />
            </div>

            <Select name="etat" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {ACTION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {ACTION_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>

            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              Filtrer
            </button>
          </div>

          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span data-compteur="actions" data-compteur-valeur={actions.length}>
              {actions.length} action{actions.length > 1 ? 's' : ''}
            </span>
            <span data-compteur="en-attente" data-compteur-valeur={pending}>
              {pending} en attente
            </span>
            <span
              data-compteur="retard"
              data-compteur-valeur={late}
              className={late > 0 ? 'text-danger' : undefined}
            >
              {late} en retard
            </span>
            <Link
              href={keep({ attente: filters.pendingOnly ? '' : '1' })}
              className="text-adikom-500 hover:underline"
            >
              {filters.pendingOnly ? 'Voir toutes les actions' : 'Voir seulement celles en attente'}
            </Link>
            <Link
              href={keep({ retard: filters.lateOnly ? '' : '1' })}
              className="text-adikom-500 hover:underline"
            >
              {filters.lateOnly ? 'Voir toutes les échéances' : 'Voir seulement les retards'}
            </Link>
            {hasFilters && (
              <Link href="/projets/actions" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            )}
          </p>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {actions.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title={hasFilters ? 'Aucune action ne correspond' : 'Aucune action'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Les actions issues des réunions et des décisions apparaîtront ici.'
            }
          />
        ) : (
          <>
            <div className="-mx-5 -my-4 hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-adikom-50 text-left">
                    <th className="px-5 py-3 font-medium text-ink">Action</th>
                    <th className="px-5 py-3 font-medium text-ink">Origine</th>
                    <th className="px-5 py-3 font-medium text-ink">Responsable</th>
                    <th className="px-5 py-3 font-medium text-ink">Échéance</th>
                    <th className="px-5 py-3 font-medium text-ink">Suivi</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((action) => (
                    <tr
                      key={action.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/projets/actions/${action.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {action.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {action.decisionLabel ?? action.meetingLabel ?? <Empty />}
                      </td>
                      <td className="px-5 py-3 text-muted">{action.assigneeLabel ?? <Empty />}</td>
                      <td className="px-5 py-3 tabular">
                        {action.dueOn ? (
                          <span className={action.isLate ? 'text-danger' : 'text-muted'}>
                            {formatDate(action.dueOn)}
                            {action.isLate && ' · en retard'}
                          </span>
                        ) : (
                          <Empty />
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <ActionState action={action} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {actions.map((action) => (
                <li key={action.id}>
                  <Link
                    href={`/projets/actions/${action.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{action.title}</p>
                        <p className="truncate text-xs text-muted">
                          {action.decisionLabel ?? action.meetingLabel}
                        </p>
                      </div>
                      <ActionState action={action} />
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>{action.assigneeLabel ?? 'Non attribuée'}</dd>
                      <dd className={action.isLate ? 'text-danger' : undefined}>
                        {action.dueOn ? `Échéance ${formatDate(action.dueOn)}` : 'Sans échéance'}
                        {action.isLate && ' · en retard'}
                      </dd>
                    </dl>
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

/**
 * L'état d'une action, ou celui de la tâche qui la porte désormais.
 *
 * §25 : une action transformée n'a plus d'état propre — le suivi appartient à
 * la tâche, et la base gèle la colonne. Trois cas se distinguent :
 *
 *   · pas de tâche          → l'état de l'action ;
 *   · tâche lisible         → l'état de la TÂCHE, avec la mention du transfert ;
 *   · tâche non lisible     → le transfert est dit, l'état ne l'est pas —
 *                             afficher l'ancien serait afficher un état périmé.
 */
function ActionState({
  action,
}: {
  action: {
    status: keyof typeof ACTION_STATUS_LABELS
    taskId: string | null
    taskStatus: keyof typeof TASK_STATUS_LABELS | null
  }
}) {
  if (!action.taskId) {
    return (
      <Badge tone={ACTION_STATUS_TONES[action.status]}>
        {ACTION_STATUS_LABELS[action.status]}
      </Badge>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="info">Tâche</Badge>
      {action.taskStatus ? (
        <Badge tone="neutral">{TASK_STATUS_LABELS[action.taskStatus]}</Badge>
      ) : (
        <span className="text-xs text-muted">état non lisible</span>
      )}
    </div>
  )
}
