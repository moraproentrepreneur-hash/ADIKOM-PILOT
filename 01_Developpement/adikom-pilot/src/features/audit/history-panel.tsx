import 'server-only'

import Link from 'next/link'
import { History } from 'lucide-react'

import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { formatDateTime } from '@/lib/dates'
import { HISTORY_ROWS, listEntityHistory } from './data'
import { ACTION_LABELS, RESULT_LABELS, RESULT_TONES, entityLabel } from './constants'

/**
 * L'onglet « Historique » d'une fiche — DEC-042 §d.
 *
 * IL NE FABRIQUE AUCUN HISTORIQUE.
 *
 * Ce panneau LIT le journal d'activité, qui consigne déjà chaque écriture avec
 * son auteur, sa date, son motif et le détail de ce qui a changé (Règles audit
 * §1). Tenir une seconde trace en aurait fait deux, dont l'une aurait fini par
 * diverger — et un historique qui ment est pire qu'un historique absent.
 *
 * CE QU'IL MONTRE, ET CE QU'IL NE MONTRE PAS
 *
 * Chaque ligne dit QUI a fait QUOI et QUAND, et mène à la fiche de l'événement
 * où l'avant/après se consulte — sous une capacité qui lui est propre
 * (DEC-038). Le panneau n'affiche donc jamais lui-même le contenu d'un champ :
 * il ne peut pas divulguer ce que la fiche de l'événement arbitre.
 *
 * L'ONGLET N'EXISTE PAS SANS `users.audit.view`
 *
 * C'est aux écrans de ne pas le proposer : la policy du journal refuserait de
 * toute façon la lecture, et une liste vide se lirait « il ne s'est rien
 * passé » (DEC-017).
 */
export async function EntityHistoryPanel({
  entityId,
  description,
}: {
  entityId: string
  /** Ce que l'historique recouvre, dit dans les mots de la fiche. */
  description: string
}) {
  const events = await listEntityHistory(entityId)

  return (
    <Card title="Historique" description={description}>
      {events.length === 0 ? (
        <EmptyState
          icon={History}
          title="Aucun événement"
          description="Aucune opération enregistrée sur cette fiche n’a encore été journalisée."
        />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/utilisateurs/journal/${event.id}`}
                    className="text-sm font-medium text-adikom-500 hover:underline"
                  >
                    {ACTION_LABELS[event.action]} · {entityLabel(event.entityType)}
                  </Link>
                  <p className="text-xs text-muted">
                    {formatDateTime(event.occurredAt)}
                    {' · '}
                    {event.actorLabel ?? 'Compte supprimé'}
                  </p>
                  {event.reason && (
                    <p className="mt-0.5 text-xs text-muted">{event.reason}</p>
                  )}
                  {event.changedFields && event.changedFields.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted">
                      {event.changedFields.length} champ
                      {event.changedFields.length > 1 ? 's modifiés' : ' modifié'}
                    </p>
                  )}
                </div>
                <Badge tone={RESULT_TONES[event.result]}>{RESULT_LABELS[event.result]}</Badge>
              </li>
            ))}
          </ul>

          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
            {events.length >= HISTORY_ROWS
              ? `Les ${HISTORY_ROWS} événements les plus récents. L’historique complet se consulte au Journal d’activité.`
              : 'Le détail avant / après de chaque événement se consulte au Journal d’activité.'}
          </p>
        </>
      )}
    </Card>
  )
}
