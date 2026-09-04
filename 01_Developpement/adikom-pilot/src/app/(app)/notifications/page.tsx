import type { Metadata } from 'next'
import Link from 'next/link'
import { BellRing, Inbox, Lock } from 'lucide-react'

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatAmount } from '@/lib/money'
import { formatDate, formatDateTime } from '@/lib/dates'
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/features/notifications/actions'
import {
  AMOUNT_LABELS,
  KIND_META,
  LEVEL_LABELS,
  LEVEL_TONES,
  LEVELS,
  OBJECT_ACTION,
  OBJECT_HREF,
  SOURCE_LABELS,
  SOURCES,
  STATE_LABELS,
  STATES,
  isLevel,
  isSource,
  isState,
  type NotificationLevel,
} from '@/features/notifications/constants'
import {
  FEED_LIMIT,
  loadNotificationCentre,
  type NotificationFilters,
  type NotificationItem,
} from '@/features/notifications/data'
import { MarkAllReadButton, MarkReadButton } from '@/features/notifications/read-controls'

export const metadata: Metadata = { title: 'Centre de notifications' }

/*
 * Une veille est un instantané, jamais une page mise en cache : un retard
 * apparu il y a dix minutes doit être là (§17 — « le compteur doit être mis à
 * jour selon l'état réel des notifications »).
 */
export const dynamic = 'force-dynamic'

const kmf = (value: number) => formatAmount(value, { withCurrency: true })

/**
 * Centre de notifications — « Y a-t-il quelque chose que je dois savoir ou faire
 * maintenant ? » (Module 02 §40).
 *
 * IL NE STOCKE RIEN, ET NE DÉCIDE DE RIEN.
 *
 * Chaque ligne est une SITUATION RÉELLE, relue à l'instant sur les données du
 * module qui la produit (migration 056). Une situation résolue disparaît d'elle-
 * même : aucune tâche ne vient « fermer » une notification, parce qu'il n'y a
 * rien à fermer.
 *
 * CE QUE L'UTILISATEUR VOIT DÉPEND DE CE QU'IL A LE DROIT DE VOIR (§22, §37).
 *
 * Une source non autorisée ne produit AUCUNE notification — pas un titre, pas un
 * montant. Mais l'écran DIT lesquelles sont fermées : « aucune notification » et
 * « aucune notification que vous ayez le droit de voir » ne sont pas la même
 * information (DEC-017).
 */
export default async function NotificationsPage(props: PageProps<'/notifications'>) {
  await requirePermissionOrRedirect(PERMISSIONS.NOTIFICATIONS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : undefined

  const rawState = read('etat')
  const rawLevel = read('niveau')
  const rawSource = read('module')

  const filters: NotificationFilters = {
    state: isState(rawState) ? rawState : undefined,
    level: isLevel(rawLevel) ? rawLevel : undefined,
    source: isSource(rawSource) ? rawSource : undefined,
  }

  const centre = await loadNotificationCentre(filters)

  if (centre.state === 'error') {
    return (
      <>
        <PageHeader
          title="Centre de notifications"
          description="Ce qu’il faut savoir, et ce qu’il faut faire maintenant."
        />
        <Notice tone="error">
          Vos notifications n’ont pas pu être chargées. Actualisez la page pour réessayer. Aucune
          donnée n’est affichée à la place : un écran vide se lirait « rien à signaler ».
        </Notice>
      </>
    )
  }

  const { items, summary, closedSources, truncated } = centre
  const filtered = Boolean(filters.state || filters.level || filters.source)

  return (
    <>
      <PageHeader
        title="Centre de notifications"
        description="Ce qu’il faut savoir, et ce qu’il faut faire maintenant."
        actions={
          summary.total > 0 ? (
            <MarkAllReadButton
              unread={summary.unread}
              action={markAllNotificationsReadAction}
            />
          ) : undefined
        }
      />

      {/* --- Compteurs (§17) ------------------------------------------------ */}
      <section aria-label="Compteurs" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Counter label="Non lues" value={summary.unread} tone="info" />
          <Counter label={LEVEL_LABELS.URGENT} value={summary.urgent} tone="danger" />
          <Counter label={LEVEL_LABELS.IMPORTANT} value={summary.important} tone="warning" />
          <Counter label="En veille" value={summary.total} tone="neutral" />
        </div>
      </section>

      {/* --- Filtres (§18) -------------------------------------------------- */}
      <Filters filters={filters} />

      {/* --- La liste ------------------------------------------------------- */}
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState
            icon={filtered ? Inbox : BellRing}
            title={filtered ? 'Aucune notification ne correspond' : 'Rien à signaler'}
            description={
              filtered
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : closedSources.length === 0
                  ? 'Aucun retard, aucune échéance dépassée, aucune situation à surveiller sur les données que vous suivez.'
                  : 'Aucune situation à signaler parmi les sources qui vous sont accessibles. D’autres ne le sont pas.'
            }
            action={
              filtered ? (
                <Link
                  href="/notifications"
                  className="text-sm font-medium text-adikom-500 hover:underline"
                >
                  Réinitialiser les filtres
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li key={item.key}>
                <NotificationRow item={item} />
              </li>
            ))}
          </ul>
        )}

        {truncated && (
          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
            Les {FEED_LIMIT} notifications les plus prioritaires sont affichées. Affinez les
            filtres pour atteindre les autres.
          </p>
        )}
      </Card>

      {/* --- Ce qui n'est pas surveillé, et pourquoi (§22, §37) -------------- */}
      {closedSources.length > 0 && (
        <Card
          title="Sources non surveillées"
          description="Ces situations existent peut-être ; elles ne vous sont pas lisibles."
          className="mt-5"
        >
          <ul className="space-y-2">
            {closedSources.map((source) => (
              <li key={source.label} className="flex items-start gap-2 text-sm">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="text-ink">{source.label}</span>
                  <span className="block text-xs text-muted">
                    Permission{source.missing.length > 1 ? 's' : ''} requise
                    {source.missing.length > 1 ? 's' : ''} :{' '}
                    {source.missing.map((code, index) => (
                      <span key={code}>
                        {index > 0 && ', '}
                        <code className="tabular">{code}</code>
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* --- Ce que le centre ne fait pas ----------------------------------- */}
      <Notice tone="info" className="mt-5">
        Les notifications sont établies à la lecture, sur les données réelles des modules : une
        situation résolue cesse d’apparaître, et aucune alerte n’est conservée après sa cause. Les
        créations — nouveau client, nouvelle réservation, véhicule ajouté — relèvent du journal
        d’activité, qui n’est pas encore livré.
      </Notice>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Compteurs — §17                                                            */
/* -------------------------------------------------------------------------- */

function Counter({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'info' | 'danger' | 'warning' | 'neutral'
}) {
  return (
    <div className="rounded-card border border-line bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {value > 0 && tone !== 'neutral' && <Badge tone={tone}>{label}</Badge>}
      </div>
      <p
        data-compteur={label}
        data-compteur-valeur={value}
        className="mt-1.5 font-display text-2xl font-semibold text-ink tabular"
      >
        {value.toLocaleString('fr-FR')}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Filtres — §18                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Trois filtres, et aucun quatrième.
 *
 * §18 les cite tous — état, niveau, catégorie, module, période — puis ajoute :
 * « les filtres doivent rester simples et ne pas surcharger l'interface ».
 *
 * LA PÉRIODE N'EN EST PAS.
 *
 * La veille ne décrit que des situations ACTUELLES : un retard court encore, une
 * facture reste échue. Filtrer sur « ce mois » n'y aurait aucun sens — c'est la
 * même distinction que le tableau de bord pose entre un flux et une situation
 * (DEC-032 §e). La catégorie, elle, se confond avec le niveau : elle n'est donc
 * pas dédoublée.
 */
function Filters({ filters }: { filters: NotificationFilters }) {
  const href = (patch: Partial<NotificationFilters>) => {
    const next = { ...filters, ...patch }
    const params = new URLSearchParams()
    if (next.state) params.set('etat', next.state)
    if (next.level) params.set('niveau', next.level)
    if (next.source) params.set('module', next.source)
    const query = params.toString()
    return query ? `/notifications?${query}` : '/notifications'
  }

  return (
    <nav aria-label="Filtres" className="mb-5 space-y-2.5">
      <FilterRow label="État">
        <FilterLink href={href({ state: undefined })} active={!filters.state}>
          Toutes
        </FilterLink>
        {STATES.map((state) => (
          <FilterLink
            key={state}
            href={href({ state })}
            active={filters.state === state}
          >
            {STATE_LABELS[state]}
          </FilterLink>
        ))}
      </FilterRow>

      <FilterRow label="Niveau">
        <FilterLink href={href({ level: undefined })} active={!filters.level}>
          Tous
        </FilterLink>
        {LEVELS.map((level: NotificationLevel) => (
          <FilterLink
            key={level}
            href={href({ level })}
            active={filters.level === level}
          >
            {LEVEL_LABELS[level]}
          </FilterLink>
        ))}
      </FilterRow>

      <FilterRow label="Module">
        <FilterLink href={href({ source: undefined })} active={!filters.source}>
          Tous
        </FilterLink>
        {SOURCES.map((source) => (
          <FilterLink
            key={source}
            href={href({ source })}
            active={filters.source === source}
          >
            {SOURCE_LABELS[source]}
          </FilterLink>
        ))}
      </FilterRow>
    </nav>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 shrink-0 text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  )
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'rounded-control bg-adikom-500 px-3 py-1.5 text-xs font-medium text-white'
          : 'rounded-control border border-line bg-white px-3 py-1.5 text-xs text-muted transition-colors hover:border-adikom-300 hover:text-adikom-500'
      }
    >
      {children}
    </Link>
  )
}

/* -------------------------------------------------------------------------- */
/*  Une notification — §5, §21, §34, §35                                       */
/* -------------------------------------------------------------------------- */

/**
 * Une ligne, lisible d'un coup d'œil, et responsive sans se dédoubler.
 *
 * §35 : sur mobile, la notification privilégie titre, niveau, date, message et
 * action. C'est exactement l'ordre de lecture de cette carte — un seul
 * composant, réorganisé par le point de rupture, plutôt qu'un tableau et une
 * liste qui divergeraient (CLAUDE.md §37).
 *
 * §20 du Module 01 vaut ici aussi : le niveau porte un MOT, jamais une seule
 * couleur.
 */
function NotificationRow({ item }: { item: NotificationItem }) {
  const meta = KIND_META[item.kind]
  const unread = item.readAt === null

  const moment =
    meta === undefined
      ? null
      : meta.precision === 'day'
        ? item.dueOn
          ? meta.moment(formatDate(item.dueOn) ?? item.dueOn)
          : null
        : item.occurredAt
          ? meta.moment(formatDateTime(item.occurredAt) ?? item.occurredAt)
          : null

  const target =
    item.objectType && item.objectId ? OBJECT_HREF[item.objectType](item.objectId) : null

  const amountLabel = AMOUNT_LABELS[item.kind]

  return (
    <article
      data-notification={item.key}
      data-notification-lue={unread ? 'non' : 'oui'}
      data-notification-niveau={item.level}
      className={
        unread
          ? 'rounded-control border border-line bg-white p-3.5'
          : 'rounded-control border border-line bg-canvas/60 p-3.5'
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={LEVEL_TONES[item.level]}>{LEVEL_LABELS[item.level]}</Badge>
            <p
              className={
                unread
                  ? 'font-display text-sm font-semibold text-ink'
                  : 'font-display text-sm font-medium text-muted'
              }
            >
              {meta?.title ?? 'Situation à vérifier'}
            </p>
            {unread && (
              <span className="rounded-badge bg-info-soft px-2 py-0.5 text-[10px] font-medium text-info">
                Non lue
              </span>
            )}
          </div>

          <p className="mt-1.5 text-sm text-ink">
            {item.subject ?? '—'}
            {item.detail && <span className="text-muted"> · {item.detail}</span>}
          </p>

          <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {moment && <dd>{moment}</dd>}
            {item.amount !== null && (
              <dd className="tabular">
                {amountLabel ? `${amountLabel} : ` : ''}
                {kmf(item.amount)}
              </dd>
            )}
            <dd>{meta?.origin}</dd>
            {!unread && item.readAt && <dd>Lue le {formatDateTime(item.readAt)}</dd>}
          </dl>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {target && item.objectType && (
            <Link
              href={target}
              className="inline-flex items-center rounded-control border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-adikom-500 transition-colors hover:border-adikom-300"
            >
              {OBJECT_ACTION[item.objectType]}
            </Link>
          )}
          {unread && (
            <MarkReadButton
              notificationKey={item.key}
              action={markNotificationReadAction}
            />
          )}
        </div>
      </div>
    </article>
  )
}
