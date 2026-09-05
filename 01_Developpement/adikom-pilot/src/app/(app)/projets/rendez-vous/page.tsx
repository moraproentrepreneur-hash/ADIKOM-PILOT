import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, Search } from 'lucide-react'

import { Badge, ButtonLink, Card, Empty, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { Tabs } from '@/components/ui/tabs'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { listAssignableUsers } from '@/features/projects/data'
import { moduleAccess } from '@/features/projects/access'
import { moduleTabs } from '@/features/projects/tabs'
import {
  APPOINTMENT_STATUS_LABELS,
  PLANNING_STATUSES,
  PLANNING_STATUS_TONES,
  formatDuration,
  listAppointments,
} from '@/features/planning/data'

export const metadata: Metadata = { title: 'Rendez-vous' }

/**
 * Liste des rendez-vous — Module 03 §26, §27, §41.
 *
 * §41 : « Pour les rendez-vous : période, tiers, responsable. » Le filtre par
 * tiers se fait en deux temps — le type, puis l'identifiant — parce que trois
 * répertoires distincts gouvernent chacun leur lecture. Le tiers d'un
 * rendez-vous dont le répertoire n'est pas ouvert est NOMMÉ « non lisible » :
 * le rendez-vous, lui, reste vrai (doctrine de DEC-034 §d).
 */
export default async function AppointmentsPage(props: PageProps<'/projets/rendez-vous'>) {
  await requirePermissionOrRedirect(PERMISSIONS.APPOINTMENTS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    status: read('etat'),
    ownerId: read('responsable'),
    from: read('du'),
    to: read('au'),
  }

  const [appointments, canCreate, access, users] = await Promise.all([
    listAppointments(filters),
    can(PERMISSIONS.APPOINTMENTS_CREATE),
    moduleAccess(),
    listAssignableUsers(),
  ])

  const hasFilters = Boolean(
    filters.search || filters.status || filters.ownerId || filters.from || filters.to
  )

  return (
    <>
      <PageHeader
        title="Rendez-vous"
        description="Les rencontres professionnelles, et le tiers qu’elles concernent."
        actions={
          canCreate ? (
            <ButtonLink href="/projets/rendez-vous/nouveau" icon={CalendarClock}>
              Nouveau rendez-vous
            </ButtonLink>
          ) : undefined
        }
      />

      <Tabs
        items={moduleTabs('rendez-vous', { ...access, appointments: true })}
        current="rendez-vous"
      />

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
                placeholder="Objet, personne rencontrée…"
                aria-label="Rechercher un rendez-vous"
                className="pl-9"
              />
            </div>

            <Select name="etat" defaultValue={filters.status} aria-label="Filtrer par état">
              <option value="">Tous les états</option>
              {PLANNING_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {APPOINTMENT_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>

            <Input name="du" type="date" defaultValue={filters.from} aria-label="À partir du" />
            <Input name="au" type="date" defaultValue={filters.to} aria-label="Jusqu’au" />

            {users.length > 1 ? (
              <Select
                name="responsable"
                defaultValue={filters.ownerId}
                aria-label="Filtrer par responsable"
              >
                <option value="">Tous les responsables</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="self-center text-xs text-muted">
                Le filtre par responsable demande la permission{' '}
                <code className="tabular">users.users.view</code>.
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
              <span data-compteur="rendez-vous" data-compteur-valeur={appointments.length}>
                {appointments.length} rendez-vous
              </span>
              {hasFilters && (
                <Link href="/projets/rendez-vous" className="text-adikom-500 hover:underline">
                  Réinitialiser les filtres
                </Link>
              )}
            </p>
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {appointments.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={hasFilters ? 'Aucun rendez-vous ne correspond' : 'Aucun rendez-vous'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Un rendez-vous rattaché à un tiers conserve la continuité de la relation (§27).'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/projets/rendez-vous" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/projets/rendez-vous/nouveau" icon={CalendarClock}>
                  Fixer le premier rendez-vous
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
                    <th className="px-5 py-3 font-medium text-ink">Objet</th>
                    <th className="px-5 py-3 font-medium text-ink">Date et heure</th>
                    <th className="px-5 py-3 font-medium text-ink">Durée</th>
                    <th className="px-5 py-3 font-medium text-ink">Tiers concerné</th>
                    <th className="px-5 py-3 font-medium text-ink">Responsable</th>
                    <th className="px-5 py-3 font-medium text-ink">État</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((appointment) => (
                    <tr
                      key={appointment.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/projets/rendez-vous/${appointment.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {appointment.subject}
                        </Link>
                        {appointment.location && (
                          <p className="text-xs text-muted">{appointment.location}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDateTime(appointment.startsAt)}
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDuration(appointment.durationMinutes)}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {appointment.partyLabel ?? appointment.externalContact ?? <Empty />}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {appointment.ownerLabel ?? <Empty />}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={PLANNING_STATUS_TONES[appointment.status]}>
                          {APPOINTMENT_STATUS_LABELS[appointment.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {appointments.map((appointment) => (
                <li key={appointment.id}>
                  <Link
                    href={`/projets/rendez-vous/${appointment.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{appointment.subject}</p>
                        <p className="truncate text-xs text-muted tabular">
                          {formatDateTime(appointment.startsAt)}
                        </p>
                      </div>
                      <Badge tone={PLANNING_STATUS_TONES[appointment.status]}>
                        {APPOINTMENT_STATUS_LABELS[appointment.status]}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <dd>{appointment.partyLabel ?? 'Aucun tiers enregistré'}</dd>
                      {appointment.externalContact && <dd>{appointment.externalContact}</dd>}
                      <dd>{appointment.ownerLabel ?? 'Aucun responsable'}</dd>
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
