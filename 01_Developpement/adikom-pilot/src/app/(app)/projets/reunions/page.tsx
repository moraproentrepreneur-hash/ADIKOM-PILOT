import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, Users2 } from 'lucide-react'

import { Badge, ButtonLink, Card, Empty, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { Tabs } from '@/components/ui/tabs'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { listProjectOptions } from '@/features/projects/data'
import { moduleAccess } from '@/features/projects/access'
import { moduleTabs } from '@/features/projects/tabs'
import {
  MEETING_STATUS_LABELS,
  PLANNING_STATUSES,
  PLANNING_STATUS_TONES,
  formatDuration,
  listMeetings,
} from '@/features/planning/data'

export const metadata: Metadata = { title: 'Réunions' }

/**
 * Liste des réunions — Module 03 §21, §41.
 *
 * §41 : « Pour les réunions : période, participant, projet. » Les trois filtres
 * sont là ; celui par projet DIT la permission qu'il demande plutôt que de
 * présenter un menu vide (DEC-017).
 *
 * LE COMPTE RENDU SE VOIT DANS LA LISTE.
 *
 * §23 en fait l'aboutissement d'une réunion : savoir laquelle n'en a pas encore
 * est précisément ce qu'une assistante de direction cherche dans cet écran.
 */
export default async function MeetingsPage(props: PageProps<'/projets/reunions'>) {
  await requirePermissionOrRedirect(PERMISSIONS.MEETINGS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('etat'),
    projectId: read('projet'),
    from: read('du'),
    to: read('au'),
  }

  const [meetings, canCreate, access] = await Promise.all([
    listMeetings(filters),
    can(PERMISSIONS.MEETINGS_CREATE),
    moduleAccess(),
  ])

  const projects = access.projects ? await listProjectOptions() : []

  const hasFilters = Boolean(
    filters.search || filters.status || filters.projectId || filters.from || filters.to
  )

  const withoutMinutes = meetings.filter(
    (meeting) => meeting.status === 'HELD' && !meeting.hasMinutes
  ).length

  return (
    <>
      <PageHeader
        title="Réunions"
        description="Ce qui se dit, ce qui s’y décide, et ce qu’il en reste."
        actions={
          canCreate ? (
            <ButtonLink href="/projets/reunions/nouvelle" icon={Users2}>
              Nouvelle réunion
            </ButtonLink>
          ) : undefined
        }
      />

      <Tabs items={moduleTabs('reunions', { ...access, meetings: true })} current="reunions" />

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
                placeholder="Titre, objectif…"
                aria-label="Rechercher une réunion"
                className="pl-9"
              />
            </div>

            <Select name="etat" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {PLANNING_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {MEETING_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>

            <Input
              name="du"
              type="date"
              defaultValue={filters.from}
              aria-label="À partir du"
            />
            <Input name="au" type="date" defaultValue={filters.to} aria-label="Jusqu’au" />

            {access.projects ? (
              <Select name="projet" defaultValue={filters.projectId} aria-label="Filtrer par projet">
                <option value="">Tous les projets</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.label}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="self-center text-xs text-muted">
                Le filtre par projet demande la permission{' '}
                <code className="tabular">projects.view</code>.
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              Filtrer
            </button>

            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span data-compteur="reunions" data-compteur-valeur={meetings.length}>
                {meetings.length} réunion{meetings.length > 1 ? 's' : ''}
              </span>
              <span
                data-compteur="sans-compte-rendu"
                data-compteur-valeur={withoutMinutes}
                className={withoutMinutes > 0 ? 'text-warning' : undefined}
              >
                {withoutMinutes} sans compte rendu
              </span>
              {hasFilters && (
                <Link href="/projets/reunions" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              )}
            </p>
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {meetings.length === 0 ? (
          <EmptyState
            icon={Users2}
            title={hasFilters ? 'Aucune réunion ne correspond' : 'Aucune réunion'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Une réunion enregistrée conserve son ordre du jour, son compte rendu et ce qui en découle.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/projets/reunions" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/projets/reunions/nouvelle" icon={Users2}>
                  Convoquer la première réunion
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
                    <th className="px-5 py-3 font-medium text-ink">Réunion</th>
                    <th className="px-5 py-3 font-medium text-ink">Date et heure</th>
                    <th className="px-5 py-3 font-medium text-ink">Durée</th>
                    <th className="px-5 py-3 font-medium text-ink">Responsable</th>
                    <th className="px-5 py-3 font-medium text-ink">Participants</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((meeting) => (
                    <tr
                      key={meeting.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/projets/reunions/${meeting.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {meeting.title}
                        </Link>
                        <p className="text-xs text-muted">
                          {meeting.projectLabel ?? meeting.location ?? 'Sans projet'}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDateTime(meeting.startsAt)}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDuration(meeting.durationMinutes)}
                      </td>
                      <td className="px-5 py-3 text-muted">{meeting.ownerLabel ?? <Empty />}</td>
                      <td className="px-5 py-3 text-muted tabular">{meeting.participantCount}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={PLANNING_STATUS_TONES[meeting.status]}>
                            {MEETING_STATUS_LABELS[meeting.status]}
                          </Badge>
                          {meeting.hasMinutes && <Badge tone="success">Compte rendu</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {meetings.map((meeting) => (
                <li key={meeting.id}>
                  <Link
                    href={`/projets/reunions/${meeting.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{meeting.title}</p>
                        <p className="truncate text-xs text-muted tabular">
                          {formatDateTime(meeting.startsAt)}
                        </p>
                      </div>
                      <Badge tone={PLANNING_STATUS_TONES[meeting.status]}>
                        {MEETING_STATUS_LABELS[meeting.status]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>{meeting.ownerLabel ?? 'Aucun responsable'}</dd>
                      <dd>
                        {formatDuration(meeting.durationMinutes)}
                        {meeting.location ? ` · ${meeting.location}` : ''}
                      </dd>
                      {meeting.hasMinutes && <dd>Compte rendu enregistré</dd>}
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
