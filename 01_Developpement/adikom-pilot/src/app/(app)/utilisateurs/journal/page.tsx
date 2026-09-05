import type { Metadata } from 'next'
import Link from 'next/link'
import { History } from 'lucide-react'

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { ExportButton } from '@/components/ui/export-button'
import { Notice } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime, todayISO } from '@/lib/dates'
import { listAuditActors, listAuditEvents, PAGE_SIZE } from '@/features/audit/data'
import {
  ACTION_LABELS,
  ACTION_ORDER,
  ENTITIES_BY_MODULE,
  MODULE_LABELS,
  MODULE_ORDER,
  RESULT_LABELS,
  RESULT_TONES,
  entityLabel,
  moduleLabel,
} from '@/features/audit/constants'

export const metadata: Metadata = { title: 'Journal d’activité' }

/**
 * Journal d'activité — Module 08 §54, Règles métier 06 (Audit).
 *
 * L'écran répond aux six questions du §1 : qui, quoi, quand, sur quelle donnée,
 * avec quel résultat, et pour quel motif. Le « avant / après » n'y figure pas :
 * il tient rarement sur une ligne, et il ne s'ouvre pas aux mêmes conditions
 * (DEC-038). Il vit sur la fiche de l'événement.
 *
 * AUCUNE ÉCRITURE, JAMAIS. Le journal est en écriture seule depuis la migration
 * 004 : ni cet écran ni aucun autre ne propose de modifier ou de supprimer un
 * événement (§40, §77).
 */
export default async function AuditJournalPage(props: PageProps<'/utilisateurs/journal'>) {
  await requirePermissionOrRedirect(PERMISSIONS.AUDIT_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const filters = {
    search: read('q'),
    actorId: read('auteur'),
    moduleCode: read('module'),
    entityType: read('objet'),
    action: read('action'),
    result: read('resultat'),
    from: read('du'),
    to: read('au'),
  }

  const page = Number.parseInt(read('page'), 10) || 1

  const [canExport, { events, total, page: current, pageCount }, actors] = await Promise.all([
    can(PERMISSIONS.AUDIT_EXPORT),
    listAuditEvents(filters, page),
    listAuditActors(),
  ])

  const hasFilters = Object.values(filters).some(Boolean)

  /** Conserve les filtres en changeant de page. */
  const pageHref = (target: number) => {
    const query = new URLSearchParams(
      Object.entries({
        q: filters.search,
        auteur: filters.actorId,
        module: filters.moduleCode,
        objet: filters.entityType,
        action: filters.action,
        resultat: filters.result,
        du: filters.from,
        au: filters.to,
      }).filter(([, value]) => Boolean(value))
    )
    if (target > 1) query.set('page', String(target))
    const search = query.toString()
    return `/utilisateurs/journal${search ? `?${search}` : ''}`
  }

  const today = todayISO()
  const firstRow = total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1
  const lastRow = Math.min(current * PAGE_SIZE, total)

  return (
    <>
      <PageHeader
        title="Journal d’activité"
        description="Qui a fait quoi, quand, sur quelle donnée, et avec quel résultat."
        actions={
          canExport && (
            <ExportButton
              module="journal"
              filters={{
                q: filters.search,
                auteur: filters.actorId,
                module: filters.moduleCode,
                objet: filters.entityType,
                action: filters.action,
                resultat: filters.result,
                du: filters.from,
                au: filters.to,
              }}
            />
          )
        }
      />

      <Notice tone="info" className="mb-5">
        Le journal est en <strong>écriture seule</strong> : un événement ne se modifie ni ne
        s’efface, y compris pour un administrateur. La <strong>situation avant / après</strong>{' '}
        s’ouvre sur la fiche de chaque événement, selon les droits détenus sur l’objet concerné.
      </Notice>

      <form method="get" className="mb-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              name="q"
              type="search"
              defaultValue={filters.search}
              placeholder="Objet, référence ou motif"
              aria-label="Rechercher un objet, une référence ou un motif"
              className="lg:col-span-2"
            />

            <Select name="auteur" defaultValue={filters.actorId} aria-label="Filtrer par auteur">
              <option value="">Tous les auteurs</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.label}
                </option>
              ))}
            </Select>

            <Select name="module" defaultValue={filters.moduleCode} aria-label="Filtrer par module">
              <option value="">Tous les modules</option>
              {MODULE_ORDER.map((code) => (
                <option key={code} value={code}>
                  {MODULE_LABELS[code]}
                </option>
              ))}
            </Select>

            <Select
              name="objet"
              defaultValue={filters.entityType}
              aria-label="Filtrer par type d’objet"
              className="lg:col-span-2"
            >
              <option value="">Tous les types d’objet</option>
              {MODULE_ORDER.map((code) => (
                <optgroup key={code} label={MODULE_LABELS[code]}>
                  {(ENTITIES_BY_MODULE[code] ?? []).map((type) => (
                    <option key={type} value={type}>
                      {entityLabel(type)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>

            <Select name="action" defaultValue={filters.action} aria-label="Filtrer par action">
              <option value="">Toutes les actions</option>
              {ACTION_ORDER.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action]}
                </option>
              ))}
            </Select>

            <Select
              name="resultat"
              defaultValue={filters.result}
              aria-label="Filtrer par résultat"
            >
              <option value="">Tous les résultats</option>
              <option value="SUCCESS">Réussie</option>
              <option value="FAILURE">Échec</option>
              <option value="DENIED">Refusée</option>
            </Select>

            <Input
              name="du"
              type="date"
              max={today}
              defaultValue={filters.from}
              aria-label="Depuis le"
            />
            <Input
              name="au"
              type="date"
              max={today}
              defaultValue={filters.to}
              aria-label="Jusqu’au"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
            >
              Filtrer
            </button>

            <p className="text-xs text-muted">
              {total.toLocaleString('fr-FR')} événement{total > 1 ? 's' : ''}
              {hasFilters && (
                <>
                  {' · '}
                  <Link href="/utilisateurs/journal" className="text-adikom-500 hover:underline">
                    Réinitialiser les filtres
                  </Link>
                </>
              )}
            </p>
          </div>
        </Card>
      </form>

      <Card className="overflow-hidden">
        {events.length === 0 ? (
          <EmptyState
            icon={History}
            title={hasFilters ? 'Aucun événement ne correspond' : 'Aucun événement'}
            description={
              hasFilters
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Aucune opération n’a encore été journalisée.'
            }
            action={
              hasFilters ? (
                <ButtonLink href="/utilisateurs/journal" tone="secondary">
                  Réinitialiser les filtres
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="-mx-5 -mt-4 hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-adikom-50 text-left">
                    <th className="px-5 py-3 font-medium text-ink">Date et heure</th>
                    <th className="px-5 py-3 font-medium text-ink">Auteur</th>
                    <th className="px-5 py-3 font-medium text-ink">Action</th>
                    <th className="px-5 py-3 font-medium text-ink">Objet</th>
                    <th className="px-5 py-3 font-medium text-ink">Module</th>
                    <th className="px-5 py-3 font-medium text-ink">Résultat</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr
                      key={event.id}
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
                    >
                      <td className="px-5 py-3 whitespace-nowrap text-muted tabular">
                        <Link
                          href={`/utilisateurs/journal/${event.id}`}
                          className="text-adikom-500 hover:underline"
                        >
                          {formatDateTime(event.occurredAt)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ink">
                        {event.actorLabel ?? (
                          <span className="text-xs italic text-muted">Compte supprimé</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted">{ACTION_LABELS[event.action]}</td>
                      <td className="px-5 py-3">
                        <span className="text-ink">{entityLabel(event.entityType)}</span>
                        {event.entityLabel && (
                          <span className="block text-xs text-muted">{event.entityLabel}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {moduleLabel(event.moduleCode) ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={RESULT_TONES[event.result]}>
                          {RESULT_LABELS[event.result]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {events.map((event) => (
                <li key={event.id} className="rounded-control border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/utilisateurs/journal/${event.id}`}
                        className="font-medium text-adikom-500 hover:underline"
                      >
                        {ACTION_LABELS[event.action]} · {entityLabel(event.entityType)}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {formatDateTime(event.occurredAt)} ·{' '}
                        {event.actorLabel ?? 'Compte supprimé'}
                      </p>
                    </div>
                    <Badge tone={RESULT_TONES[event.result]}>
                      {RESULT_LABELS[event.result]}
                    </Badge>
                  </div>
                  {event.entityLabel && (
                    <p className="mt-2 truncate text-sm text-ink">{event.entityLabel}</p>
                  )}
                </li>
              ))}
            </ul>

            {/*
             * La pagination n'est pas un ornement : le journal est la seule
             * liste dont le volume croît avec le temps plutôt qu'avec
             * l'activité (Module 08 §56).
             */}
            <nav
              className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-line pt-4 sm:flex-row"
              aria-label="Pagination du journal"
            >
              <p className="text-xs text-muted tabular">
                Événements {firstRow.toLocaleString('fr-FR')} à {lastRow.toLocaleString('fr-FR')}{' '}
                sur {total.toLocaleString('fr-FR')} · page {current} sur {pageCount}
              </p>

              <div className="flex gap-2">
                {current > 1 ? (
                  <ButtonLink href={pageHref(current - 1)} tone="secondary">
                    Précédent
                  </ButtonLink>
                ) : (
                  <span className="inline-flex items-center rounded-control border border-line px-4 py-2.5 text-sm text-muted opacity-60">
                    Précédent
                  </span>
                )}

                {current < pageCount ? (
                  <ButtonLink href={pageHref(current + 1)} tone="secondary">
                    Suivant
                  </ButtonLink>
                ) : (
                  <span className="inline-flex items-center rounded-control border border-line px-4 py-2.5 text-sm text-muted opacity-60">
                    Suivant
                  </span>
                )}
              </div>
            </nav>
          </>
        )}
      </Card>
    </>
  )
}
