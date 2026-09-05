import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { requireAnyPermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { moduleAccess } from '@/features/projects/access'
import { moduleTabs } from '@/features/projects/tabs'
import { Calendar } from '@/features/planning/calendar'
import {
  CALENDAR_KINDS,
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  CALENDAR_KIND_LABELS,
  calendarRange,
  calendarTitle,
  getCalendar,
  isCalendarKind,
  isCalendarView,
  shiftAnchor,
  type CalendarKind,
  type CalendarView,
} from '@/features/planning/data'

export const metadata: Metadata = { title: 'Calendrier' }

/**
 * Le calendrier — Module 03 §19, §20.
 *
 * IL N'A PAS DE PERMISSION, ET C'EST VOULU.
 *
 * Le calendrier ne montre RIEN qu'une autre capacité n'ouvre déjà : échéances
 * de tâches, réunions, rendez-vous. Créer `projects.calendar.view` donnerait
 * l'illusion d'un contrôle sans rien contrôler — un droit qu'on retire sans
 * rien fermer, puisque les mêmes éléments restent lisibles dans leurs listes
 * (DEC-036 §d).
 *
 * La page s'ouvre donc à qui détient AU MOINS UNE des trois lectures, et
 * n'affiche que les couches correspondantes. LES COUCHES FERMÉES SONT NOMMÉES :
 * un calendrier vide et un calendrier amputé ne sont pas la même chose
 * (DEC-017).
 */
export default async function CalendarPage(props: PageProps<'/projets/calendrier'>) {
  await requireAnyPermissionOrRedirect([
    PERMISSIONS.TASKS_VIEW,
    PERMISSIONS.MEETINGS_VIEW,
    PERMISSIONS.APPOINTMENTS_VIEW,
  ])

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  const access = await moduleAccess()

  /*
   * Un paramètre d'URL arbitraire ne doit pas produire une page en erreur.
   *
   * Une vue inconnue retombe sur le mois, un jour illisible sur aujourd'hui, un
   * type inconnu sur « tout ». La recette éprouve d'ailleurs des valeurs
   * hostiles : un écran ne se casse pas parce qu'on a tapé n'importe quoi dans
   * la barre d'adresse (CLAUDE.md §43).
   */
  const viewParam = read('vue')
  const view: CalendarView = isCalendarView(viewParam) ? viewParam : 'mois'

  const today = todayISO()

  const anchorParam = read('jour')
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(anchorParam) ? anchorParam : today

  const kindParam = read('type')
  const kindFilter: CalendarKind | '' = isCalendarKind(kindParam) ? kindParam : ''

  const { from, to } = calendarRange(view, anchor)

  const layers: { kind: CalendarKind; permission: PermissionCode; open: boolean }[] = [
    { kind: 'TASK', permission: PERMISSIONS.TASKS_VIEW, open: access.tasks },
    { kind: 'MEETING', permission: PERMISSIONS.MEETINGS_VIEW, open: access.meetings },
    {
      kind: 'APPOINTMENT',
      permission: PERMISSIONS.APPOINTMENTS_VIEW,
      open: access.appointments,
    },
  ]

  const closed = layers.filter((layer) => !layer.open)

  const entries = await getCalendar(from, to)
  const shown = kindFilter ? entries.filter((entry) => entry.kind === kindFilter) : entries

  const link = (extra: Record<string, string>) => {
    const params = new URLSearchParams()
    if (view !== 'mois') params.set('vue', view)
    if (anchor !== today) params.set('jour', anchor)
    if (kindFilter) params.set('type', kindFilter)
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const query = params.toString()
    return query ? `/projets/calendrier?${query}` : '/projets/calendrier'
  }

  return (
    <>
      <PageHeader
        title="Calendrier"
        description="Ce qui est planifié : échéances de tâches, réunions et rendez-vous."
      />

      <Tabs items={moduleTabs('calendrier', access)} current="calendrier" />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href={link({ jour: shiftAnchor(view, anchor, -1) })}
              aria-label="Période précédente"
              className="inline-flex size-9 items-center justify-center rounded-control border border-line text-muted transition-colors hover:border-adikom-300 hover:text-ink"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Link>

            <p
              data-calendrier-titre
              className="min-w-52 font-display text-sm font-semibold text-ink"
            >
              {calendarTitle(view, from, to)}
            </p>

            <Link
              href={link({ jour: shiftAnchor(view, anchor, 1) })}
              aria-label="Période suivante"
              className="inline-flex size-9 items-center justify-center rounded-control border border-line text-muted transition-colors hover:border-adikom-300 hover:text-ink"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Link>

            {anchor !== today && (
              <Link href={link({ jour: '' })} className="text-sm text-adikom-500 hover:underline">
                Aujourd’hui
              </Link>
            )}
          </div>

          {/* §20 : journée, semaine, mois, agenda. */}
          <nav aria-label="Niveau de visualisation" className="flex flex-wrap gap-1">
            {CALENDAR_VIEWS.map((value) => (
              <Link
                key={value}
                href={link({ vue: value === 'mois' ? '' : value, jour: anchor })}
                aria-current={view === value ? 'page' : undefined}
                className={cn(
                  'rounded-control border px-3 py-1.5 text-sm transition-colors',
                  view === value
                    ? 'border-adikom-400 bg-adikom-50 text-adikom-500'
                    : 'border-line text-muted hover:text-ink'
                )}
              >
                {CALENDAR_VIEW_LABELS[value]}
              </Link>
            ))}
          </nav>
        </div>

        {/* §19 : « les éléments doivent être filtrables selon leur type ». */}
        <nav aria-label="Type d’élément" className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={link({ type: '' })}
            aria-current={kindFilter === '' ? 'page' : undefined}
            className={cn(
              'rounded-badge px-2.5 py-1 text-xs transition-colors',
              kindFilter === '' ? 'bg-adikom-50 text-adikom-500' : 'text-muted hover:text-ink'
            )}
          >
            Tout ({entries.length})
          </Link>

          {CALENDAR_KINDS.map((kind) => {
            const layer = layers.find((item) => item.kind === kind)
            const count = entries.filter((entry) => entry.kind === kind).length

            return layer?.open ? (
              <Link
                key={kind}
                href={link({ type: kindFilter === kind ? '' : kind })}
                aria-current={kindFilter === kind ? 'page' : undefined}
                data-couche={kind}
                data-couche-valeur={count}
                className={cn(
                  'rounded-badge px-2.5 py-1 text-xs transition-colors',
                  kindFilter === kind
                    ? 'bg-adikom-50 text-adikom-500'
                    : 'text-muted hover:text-ink'
                )}
              >
                {CALENDAR_KIND_LABELS[kind]} ({count})
              </Link>
            ) : null
          })}
        </nav>
      </Card>

      {/*
       * UNE COUCHE FERMÉE SE NOMME.
       *
       * Sans cela, un utilisateur sans `projects.meetings.view` lirait un
       * calendrier incomplet en le croyant complet — et conclurait qu'aucune
       * réunion n'est prévue (DEC-017).
       */}
      {closed.length > 0 && (
        <Notice tone="info" className="mb-5">
          Ce calendrier ne montre pas {closed.length > 1 ? 'les couches' : 'la couche'}{' '}
          {closed.map((layer, index) => (
            <span key={layer.kind}>
              {index > 0 && index === closed.length - 1 ? ' ni ' : index > 0 ? ', ' : ''}
              <strong>{CALENDAR_KIND_LABELS[layer.kind].toLowerCase()}</strong> (
              <code className="tabular">{layer.permission}</code>)
            </span>
          ))}
          . Des éléments peuvent donc être planifiés sans apparaître ici.
        </Notice>
      )}

      <Calendar entries={shown} view={view} from={from} to={to} today={today} />
    </>
  )
}
