import type { Metadata } from 'next'
import Link from 'next/link'
import { Gavel, Search } from 'lucide-react'

import { ButtonLink, Card, Empty, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { Tabs } from '@/components/ui/tabs'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/dates'
import { listProjectOptions } from '@/features/projects/data'
import { moduleAccess } from '@/features/projects/access'
import { moduleTabs } from '@/features/projects/tabs'
import { listDecisions } from '@/features/planning/data'

export const metadata: Metadata = { title: 'Décisions' }

/**
 * Liste des décisions — Module 03 §24, §37.
 *
 * « L'objectif est d'éviter que les décisions importantes soient perdues dans
 * des échanges informels. » Cet écran est la mémoire d'ADIKOM : la recherche y
 * porte sur le titre, le contexte ET l'énoncé, parce qu'on se souvient rarement
 * du titre exact d'une décision prise il y a six mois.
 *
 * §37 : la Direction doit pouvoir identifier « les décisions importantes ». La
 * liste est donc ordonnée de la plus récente à la plus ancienne.
 */
export default async function DecisionsPage(props: PageProps<'/projets/decisions'>) {
  await requirePermissionOrRedirect(PERMISSIONS.DECISIONS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    projectId: read('projet'),
    from: read('du'),
    to: read('au'),
  }

  const [decisions, canCreate, access] = await Promise.all([
    listDecisions(filters),
    can(PERMISSIONS.DECISIONS_CREATE),
    moduleAccess(),
  ])

  const projects = access.projects ? await listProjectOptions() : []

  const hasFilters = Boolean(filters.search || filters.projectId || filters.from || filters.to)

  return (
    <>
      <PageHeader
        title="Décisions"
        description="Ce qu’ADIKOM a arrêté, quand, et à la suite de quoi."
        actions={
          canCreate ? (
            <ButtonLink href="/projets/decisions/nouvelle" icon={Gavel}>
              Enregistrer une décision
            </ButtonLink>
          ) : undefined
        }
      />

      <Tabs items={moduleTabs('decisions', { ...access, decisions: true })} current="decisions" />

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
                placeholder="Titre, énoncé, contexte…"
                aria-label="Rechercher une décision"
                className="pl-9"
              />
            </div>

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

            <Input name="du" type="date" defaultValue={filters.from} aria-label="Prises à partir du" />
            <Input name="au" type="date" defaultValue={filters.to} aria-label="Prises jusqu’au" />

            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              Filtrer
            </button>
          </div>

          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span data-compteur="decisions" data-compteur-valeur={decisions.length}>
              {decisions.length} décision{decisions.length > 1 ? 's' : ''}
            </span>
            {hasFilters && (
              <Link href="/projets/decisions" className="text-adikom-500 hover:underline">
                Réinitialiser les filtres
              </Link>
            )}
          </p>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {decisions.length === 0 ? (
          <EmptyState
            icon={Gavel}
            title={hasFilters ? 'Aucune décision ne correspond' : 'Aucune décision'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Une décision consignée reste retrouvable ; une décision orale se perd.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/projets/decisions" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : canCreate ? (
                <ButtonLink href="/projets/decisions/nouvelle" icon={Gavel}>
                  Enregistrer la première décision
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
                    <th className="px-5 py-3 font-medium text-ink">Décision</th>
                    <th className="px-5 py-3 font-medium text-ink">Date</th>
                    <th className="px-5 py-3 font-medium text-ink">Responsable</th>
                    <th className="px-5 py-3 font-medium text-ink">Réunion</th>
                    <th className="px-5 py-3 font-medium text-ink">Projet</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((decision) => (
                    <tr
                      key={decision.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/projets/decisions/${decision.id}`}
                          className="font-medium text-adikom-500 hover:underline"
                        >
                          {decision.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted tabular">
                        {formatDate(decision.decidedOn)}
                      </td>
                      <td className="px-5 py-3 text-muted">{decision.ownerLabel ?? <Empty />}</td>
                      <td className="px-5 py-3 text-muted">{decision.meetingLabel ?? <Empty />}</td>
                      <td className="px-5 py-3 text-muted">{decision.projectLabel ?? <Empty />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {decisions.map((decision) => (
                <li key={decision.id}>
                  <Link
                    href={`/projets/decisions/${decision.id}`}
                    className="block rounded-control border border-line p-4 transition-colors hover:border-adikom-300"
                  >
                    <p className="font-medium text-ink">{decision.title}</p>
                    <dl className="mt-2 space-y-1 text-xs text-muted">
                      <dd className="tabular">{formatDate(decision.decidedOn)}</dd>
                      <dd>{decision.ownerLabel ?? 'Aucun responsable'}</dd>
                      {decision.meetingLabel && <dd>Réunion : {decision.meetingLabel}</dd>}
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
