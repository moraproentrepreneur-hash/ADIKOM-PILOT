import Link from 'next/link'
import { CalendarDays } from 'lucide-react'

import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import {
  CALENDAR_KIND_HREF,
  CALENDAR_KIND_SINGULAR,
  CALENDAR_KIND_TONES,
  WEEKDAY_SHORT,
  dayLabel,
  dayNumber,
  gridDays,
  isWeekend,
  type CalendarEntry,
  type CalendarView,
} from './data'

/**
 * Le calendrier — Module 03 §19, §20.
 *
 * DEUX FORMES, QUATRE VUES.
 *
 * §20 propose « journée, semaine, mois, agenda ». Une GRILLE sert le mois et la
 * semaine — on y lit la place occupée ; une LISTE chronologique sert la journée
 * et l'agenda — on y lit la suite des choses. Quatre composants distincts
 * auraient produit quatre façons d'afficher le même élément.
 *
 * SUR MOBILE, LA GRILLE DEVIENT UNE LISTE.
 *
 * §49 : « le système ne doit pas simplement réduire l'interface desktop ». Une
 * grille de sept colonnes sur un téléphone n'est pas un calendrier, c'est un
 * timbre-poste. La liste montre exactement les mêmes éléments.
 *
 * L'HEURE N'EST AFFICHÉE QUE LORSQU'ELLE EXISTE.
 *
 * Une réunion a une heure ; une échéance de tâche n'en a pas — c'est un JOUR.
 * Afficher « 00:00 » derrière une échéance inventerait une précision que la
 * donnée n'a pas (même règle qu'au Centre de notifications).
 */

function timeOf(entry: CalendarEntry): string | null {
  if (!entry.startsAt) return null
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Indian/Comoro',
  }).format(new Date(entry.startsAt))
}

function EntryLink({
  entry,
  compact = false,
}: {
  entry: CalendarEntry
  compact?: boolean
}) {
  const time = timeOf(entry)

  return (
    <Link
      href={CALENDAR_KIND_HREF[entry.kind](entry.id)}
      data-calendrier={entry.kind}
      data-calendrier-jour={entry.day}
      className={cn(
        'block rounded-control border border-line transition-colors hover:border-adikom-300',
        compact ? 'px-2 py-1' : 'px-3.5 py-2.5'
      )}
    >
      <p
        className={cn(
          'truncate text-ink',
          compact ? 'text-xs' : 'text-sm',
          entry.isLate && 'text-danger'
        )}
      >
        {time && <span className="tabular text-muted">{time} </span>}
        {entry.title}
      </p>

      {!compact && entry.subtitle && (
        <p className="truncate text-xs text-muted">{entry.subtitle}</p>
      )}

      <div className={cn('flex flex-wrap items-center gap-1.5', compact ? 'mt-1' : 'mt-1.5')}>
        <Badge tone={CALENDAR_KIND_TONES[entry.kind]}>
          {CALENDAR_KIND_SINGULAR[entry.kind]}
        </Badge>
        {entry.isLate && <Badge tone="danger">En retard</Badge>}
      </div>
    </Link>
  )
}

/* -------------------------------------------------------------------------- */
/*  Grille — mois et semaine                                                   */
/* -------------------------------------------------------------------------- */

function CalendarGrid({
  entries,
  from,
  to,
  today,
}: {
  entries: CalendarEntry[]
  from: string
  to: string
  today: string
}) {
  const days = gridDays(from, to)

  const byDay = new Map<string, CalendarEntry[]>()
  for (const entry of entries) {
    const list = byDay.get(entry.day)
    if (list) list.push(entry)
    else byDay.set(entry.day, [entry])
  }

  return (
    <div className="hidden overflow-x-auto md:block">
      <div className="min-w-[46rem]">
        <div className="grid grid-cols-7 border-b border-line bg-adikom-50">
          {WEEKDAY_SHORT.map((name) => (
            <div key={name} className="px-2 py-2 text-center text-xs font-medium text-ink">
              {name}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const items = byDay.get(day) ?? []
            // Un jour hors de la période demandée appartient à la semaine
            // affichée : il se lit en retrait, sans jamais être masqué — ce qui
            // s'y passe est réel.
            const outside = day < from || day > to

            return (
              <div
                key={day}
                data-jour={day}
                className={cn(
                  'min-h-24 border-r border-b border-line p-1.5 last:border-r-0',
                  isWeekend(day) && 'bg-canvas/60',
                  outside && 'opacity-50'
                )}
              >
                <p
                  className={cn(
                    'mb-1 text-right text-xs tabular',
                    day === today
                      ? 'font-semibold text-adikom-500'
                      : 'text-muted'
                  )}
                >
                  {dayNumber(day)}
                </p>

                <div className="space-y-1">
                  {items.map((entry) => (
                    <EntryLink key={`${entry.kind}-${entry.id}`} entry={entry} compact />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Liste chronologique — journée, agenda, et tout le mobile                   */
/* -------------------------------------------------------------------------- */

function CalendarList({
  entries,
  today,
  className,
}: {
  entries: CalendarEntry[]
  today: string
  className?: string
}) {
  const days = [...new Set(entries.map((entry) => entry.day))].sort()

  return (
    <div className={cn('space-y-5', className)}>
      {days.map((day) => (
        <section key={day}>
          <h3
            className={cn(
              'mb-2 font-display text-sm font-semibold',
              day === today ? 'text-adikom-500' : 'text-ink'
            )}
          >
            {dayLabel(day)}
            {day === today && ' · aujourd’hui'}
          </h3>

          <ul className="space-y-2">
            {entries
              .filter((entry) => entry.day === day)
              .map((entry) => (
                <li key={`${entry.kind}-${entry.id}`}>
                  <EntryLink entry={entry} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export function Calendar({
  entries,
  view,
  from,
  to,
  today,
}: {
  entries: CalendarEntry[]
  view: CalendarView
  from: string
  to: string
  today: string
}) {
  /*
   * L'ordre est posé ICI, une fois pour toutes.
   *
   * La fonction SQL rend trois couches à la suite ; les trier par jour puis par
   * heure — les éléments sans heure d'abord, car un jour entier précède un
   * créneau — donne la même lecture à la grille et à la liste. Deux tris
   * différents auraient fini par montrer deux ordres.
   */
  const sorted = [...entries].sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? -1 : 1
    if (a.startsAt === b.startsAt) return a.title.localeCompare(b.title, 'fr')
    if (!a.startsAt) return -1
    if (!b.startsAt) return 1
    return a.startsAt < b.startsAt ? -1 : 1
  })

  if (sorted.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CalendarDays}
          title="Rien de planifié sur cette période"
          description="Les échéances de tâches, les réunions et les rendez-vous apparaîtront ici."
        />
      </Card>
    )
  }

  const grid = view === 'mois' || view === 'semaine'

  return (
    <Card className={grid ? 'overflow-hidden' : undefined}>
      {grid ? (
        <>
          <div className="-mx-5 -my-4">
            <CalendarGrid entries={sorted} from={from} to={to} today={today} />
          </div>
          {/* §49 : sur mobile, la même information, réorganisée — pas réduite. */}
          <CalendarList entries={sorted} today={today} className="md:hidden" />
        </>
      ) : (
        <CalendarList entries={sorted} today={today} />
      )}
    </Card>
  )
}
