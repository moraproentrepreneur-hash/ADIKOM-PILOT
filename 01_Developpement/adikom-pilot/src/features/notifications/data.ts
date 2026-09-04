import 'server-only'

import { cache } from 'react'

import { can } from '@/lib/auth/dal'
import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  isLevel,
  isObjectType,
  isSource,
  type NotificationKind,
  type NotificationLevel,
  type NotificationObject,
  type NotificationSource,
  type NotificationState,
  WATCH_SOURCES,
  type WatchSource,
} from './constants'

/**
 * La lecture du Centre de notifications — Module 02.
 *
 * AUCUNE NOTIFICATION N'EST CONSTRUITE ICI.
 *
 * Tout vient de `notifications_feed()` et `notifications_summary()`
 * (migration 056), qui dérivent la veille des données des modules. Le rôle de
 * cette couche est de traduire, de compter ce qui n'est pas ouvert, et de ne
 * jamais transformer un refus en silence.
 *
 * POURQUOI LES COMPTEURS VIENNENT DE LA BASE
 *
 * §17 : « le compteur doit être mis à jour selon l'état réel des notifications ».
 * Un compteur calculé sur la liste affichée serait faux dès que la liste est
 * tronquée — la leçon de DEC-032 §b. Il se compte donc là où il n'y a pas de
 * page.
 *
 * POURQUOI L'ÉCRAN DIT CE QU'IL NE VOIT PAS
 *
 * §22 : une source non autorisée ne produit AUCUNE notification. C'est la bonne
 * règle, mais appliquée seule elle produirait un écran vide indiscernable d'un
 * écran calme. `closedSources` nomme donc les veilles fermées, sans rien
 * révéler de leur contenu (DEC-017).
 */

/* -------------------------------------------------------------------------- */
/*  Ce que le centre rend                                                      */
/* -------------------------------------------------------------------------- */

export type NotificationItem = {
  key: string
  kind: NotificationKind
  level: NotificationLevel
  source: NotificationSource
  /** La référence de l'objet — toujours lisible : LOC-…, FAC-…, un libellé. */
  subject: string | null
  /** Ce qui l'entoure : véhicule, client, fournisseur, motif. */
  detail: string | null
  objectType: NotificationObject | null
  objectId: string | null
  occurredAt: string | null
  dueOn: string | null
  /** Montant en jeu, pour les seules notifications financières. */
  amount: number | null
  /** Non nul : la notification a été lue par cet utilisateur, à cette date. */
  readAt: string | null
}

export type NotificationSummary = {
  total: number
  unread: number
  urgent: number
  important: number
  attention: number
  reminder: number
}

export type NotificationFilters = {
  state?: NotificationState
  level?: NotificationLevel
  source?: NotificationSource
}

/** Une veille que l'utilisateur ne peut pas lire : nommée, jamais devinée. */
export type ClosedSource = {
  label: string
  missing: PermissionCode[]
}

export type NotificationCentre =
  | {
      state: 'ok'
      items: NotificationItem[]
      summary: NotificationSummary
      closedSources: ClosedSource[]
      /** La liste atteint la limite : il en reste (§36). */
      truncated: boolean
    }
  | { state: 'error' }

/**
 * Ce que l'écran charge d'un coup.
 *
 * §36 : « éviter de charger inutilement l'intégralité de l'historique ». La
 * veille est bornée par nature — elle ne décrit que des situations ouvertes —
 * mais la borne reste posée : un parc de mille véhicules ne doit pas produire
 * une page de mille lignes.
 */
export const FEED_LIMIT = 200

const EMPTY_SUMMARY: NotificationSummary = {
  total: 0,
  unread: 0,
  urgent: 0,
  important: 0,
  attention: 0,
  reminder: 0,
}

/* -------------------------------------------------------------------------- */
/*  Formes brutes renvoyées par les fonctions SQL                              */
/* -------------------------------------------------------------------------- */

type RawItem = {
  key: string
  kind: string
  level: string
  source: string
  subject: string | null
  detail: string | null
  object_type: string | null
  object_id: string | null
  occurred_at: string | null
  due_on: string | null
  amount: number | string | null
  read_at: string | null
}

type RawSummary = {
  total: number | string
  unread: number | string
  urgent: number | string
  important: number | string
  attention: number | string
  reminder: number | string
}

/**
 * Une ligne de la veille, ou rien.
 *
 * Un `kind`, un `level` ou une `source` que l'application ne connaît pas est
 * ÉCARTÉ plutôt qu'affiché à moitié : cela ne peut arriver qu'entre le déploiement
 * d'une migration et celui du code, et une notification sans titre ne rendrait
 * service à personne.
 */
function toItem(row: RawItem): NotificationItem | null {
  if (!isLevel(row.level) || !isSource(row.source)) return null

  const objectType =
    row.object_type && isObjectType(row.object_type) ? row.object_type : null

  return {
    key: row.key,
    kind: row.kind as NotificationKind,
    level: row.level,
    source: row.source,
    subject: row.subject,
    detail: row.detail,
    objectType,
    objectId: objectType ? row.object_id : null,
    occurredAt: row.occurred_at,
    dueOn: row.due_on,
    // `bigint` transite en texte selon le pilote : ramené à un entier.
    amount: row.amount === null ? null : Number(row.amount),
    readAt: row.read_at,
  }
}

/* -------------------------------------------------------------------------- */
/*  Les compteurs — §17                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Les compteurs de l'utilisateur connecté, ou `null`.
 *
 * `null` couvre les deux cas où il n'y a rien à afficher : la capacité manque,
 * ou la lecture a échoué. Le badge de navigation ne doit ni s'inventer un
 * chiffre, ni empêcher la page de s'afficher — c'est le seul endroit de
 * l'application où une erreur se tait, parce qu'elle est portée par toutes les
 * pages à la fois.
 *
 * `cache()` déduplique l'appel : le gabarit applicatif et la page du centre le
 * demandent tous deux dans la même requête.
 */
export const getNotificationSummary = cache(
  async (): Promise<NotificationSummary | null> => {
    if (!(await can(PERMISSIONS.NOTIFICATIONS_VIEW))) return null

    try {
      const supabase = await createSupabaseServerClient()
      const { data, error } = await supabase.rpc('notifications_summary')
      if (error) throw new Error(error.message)

      const row = (data as RawSummary[] | null)?.[0]
      if (!row) return EMPTY_SUMMARY

      return {
        total: Number(row.total),
        unread: Number(row.unread),
        urgent: Number(row.urgent),
        important: Number(row.important),
        attention: Number(row.attention),
        reminder: Number(row.reminder),
      }
    } catch (error) {
      console.error('[notifications · compteurs]', error)
      return null
    }
  }
)

/** Le seul chiffre dont la navigation a besoin (§17). */
export async function countUnreadNotifications(): Promise<number | null> {
  const summary = await getNotificationSummary()
  return summary ? summary.unread : null
}

/* -------------------------------------------------------------------------- */
/*  Le centre — §18, §25, §36                                                  */
/* -------------------------------------------------------------------------- */

export async function loadNotificationCentre(
  filters: NotificationFilters
): Promise<NotificationCentre> {
  try {
    const supabase = await createSupabaseServerClient()

    const [feed, summary, closedSources] = await Promise.all([
      supabase.rpc('notifications_feed', {
        p_state: filters.state ?? null,
        p_level: filters.level ?? null,
        p_source: filters.source ?? null,
        p_limit: FEED_LIMIT,
      }),
      getNotificationSummary(),
      listClosedSources(),
    ])

    if (feed.error) throw new Error(feed.error.message)

    const rows = (feed.data as RawItem[] | null) ?? []
    const items = rows
      .map(toItem)
      .filter((item): item is NotificationItem => item !== null)

    return {
      state: 'ok',
      items,
      summary: summary ?? EMPTY_SUMMARY,
      closedSources,
      truncated: rows.length >= FEED_LIMIT,
    }
  } catch (error) {
    console.error('[notifications · centre]', error)
    return { state: 'error' }
  }
}

/* -------------------------------------------------------------------------- */
/*  Les veilles fermées — §22, §37                                             */
/* -------------------------------------------------------------------------- */

/**
 * Les sources que l'utilisateur ne peut pas lire, et ce qui leur manque.
 *
 * Ce n'est pas une protection : la base se tait déjà d'elle-même. C'est une
 * honnêteté d'écran — « aucune notification » et « aucune notification que vous
 * ayez le droit de voir » ne sont pas la même information.
 */
async function listClosedSources(): Promise<ClosedSource[]> {
  const closed: ClosedSource[] = []

  for (const source of WATCH_SOURCES) {
    const missing = await missingFor(source)
    if (missing.length > 0) closed.push({ label: source.label, missing })
  }

  return closed
}

async function missingFor(source: WatchSource): Promise<PermissionCode[]> {
  const held = await Promise.all(source.requires.map((code) => can(code)))

  // `any` : une seule suffit. `all` (défaut) : toutes sont exigées, parce que
  // l'absence de l'une rendrait la notification FAUSSE et non muette
  // (DEC-032 §d — une somme muette est refusée, jamais approchée).
  if (source.mode === 'any') {
    return held.some(Boolean) ? [] : [...source.requires]
  }

  return source.requires.filter((_, index) => !held[index])
}
