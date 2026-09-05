import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ShieldAlert } from 'lucide-react'

import { Badge, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import {
  getAuditEvent,
  getAuditEventDetail,
  permissionLabel,
} from '@/features/audit/data'
import {
  ACTION_LABELS,
  RESULT_LABELS,
  RESULT_TONES,
  diffFields,
  entityLabel,
  fieldLabel,
  moduleLabel,
} from '@/features/audit/constants'

export const metadata: Metadata = { title: 'Événement du journal' }

/**
 * Fiche d'un événement — Règles métier 06 (Audit) §1, §9, §10, §24.
 *
 * C'est ici, et seulement ici, que s'ouvre la SITUATION AVANT / APRÈS.
 *
 * Elle ne s'ouvre pas aux mêmes conditions que la liste : `users.audit.view`
 * donne l'événement, la lecture de l'objet concerné donne sa donnée métier
 * (DEC-038). Un lecteur qui ne l'a pas voit le refus NOMMÉ, avec la capacité
 * qui l'ouvrirait — jamais un détail vide qui se lirait « rien n'a changé »
 * (DEC-017).
 */
export default async function AuditEventPage(props: PageProps<'/utilisateurs/journal/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.AUDIT_VIEW)

  const { id } = await props.params

  // Un identifiant qui n'est pas un nombre n'est pas un événement introuvable :
  // c'est une URL invraisemblable, et elle se termine de la même façon.
  const numericId = Number.parseInt(id, 10)
  if (!Number.isSafeInteger(numericId) || numericId <= 0) notFound()

  const event = await getAuditEvent(numericId)
  if (!event) notFound()

  const [detail, mayReadUsers] = await Promise.all([
    getAuditEventDetail(numericId),
    can(PERMISSIONS.USERS_VIEW),
  ])

  const required =
    detail && !detail.mayRead && detail.requiredPermission
      ? await permissionLabel(detail.requiredPermission)
      : null

  const changes = detail?.mayRead ? diffFields(detail.before, detail.after) : []

  const isCreation = Boolean(detail?.mayRead && !detail.before && detail.after)
  const isDeletion = Boolean(detail?.mayRead && detail.before && !detail.after)

  return (
    <>
      <PageHeader
        title={`${ACTION_LABELS[event.action]} · ${entityLabel(event.entityType)}`}
        description={formatDateTime(event.occurredAt) ?? undefined}
      />

      <Link
        href="/utilisateurs/journal"
        className="mb-5 inline-flex items-center gap-2 text-sm text-adikom-500 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour au journal
      </Link>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="L’événement" description="Qui, quoi, quand, sur quelle donnée.">
          <dl>
            <InfoRow label="Date et heure">{formatDateTime(event.occurredAt)}</InfoRow>

            <InfoRow
              label="Auteur"
              hint="Nom figé au moment de l’action : il survit à la suppression du compte."
            >
              {event.actorLabel ? (
                mayReadUsers && event.actorId ? (
                  <Link
                    href={`/utilisateurs/${event.actorId}`}
                    className="text-adikom-500 hover:underline"
                  >
                    {event.actorLabel}
                  </Link>
                ) : (
                  event.actorLabel
                )
              ) : (
                <span className="text-xs italic text-muted">
                  Compte supprimé — l’événement demeure
                </span>
              )}
            </InfoRow>

            <InfoRow label="Action">{ACTION_LABELS[event.action]}</InfoRow>

            <InfoRow label="Résultat">
              <Badge tone={RESULT_TONES[event.result]}>{RESULT_LABELS[event.result]}</Badge>
            </InfoRow>

            <InfoRow label="Module">{moduleLabel(event.moduleCode) ?? <Empty />}</InfoRow>

            <InfoRow label="Type d’objet">{entityLabel(event.entityType)}</InfoRow>

            <InfoRow label="Objet concerné">{event.entityLabel ?? <Empty />}</InfoRow>

            <InfoRow label="Référence interne">
              {event.entityId ? (
                <span className="tabular break-all">{event.entityId}</span>
              ) : (
                <Empty />
              )}
            </InfoRow>

            <InfoRow label="Motif">{event.reason ?? <Empty />}</InfoRow>

            <InfoRow label="Commentaire">{event.comment ?? <Empty />}</InfoRow>

            {/*
             * Les champs modifiés relèvent de l'ÉVÉNEMENT, pas de la donnée :
             * savoir qu'un montant a changé n'est pas connaître le montant. Ils
             * restent donc visibles sans la lecture de l'objet (§24).
             */}
            <InfoRow
              label="Champs modifiés"
              hint="Ce qui a changé — sans la valeur, qui relève de l’objet."
            >
              {event.changedFields && event.changedFields.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {event.changedFields.map((field) => (
                    <Badge key={field} tone="info">
                      {fieldLabel(field)}
                    </Badge>
                  ))}
                </span>
              ) : (
                <Empty />
              )}
            </InfoRow>
          </dl>
        </Card>

        <Card
          title="Situation avant et après"
          description={
            isCreation
              ? 'Création : il n’y a pas d’avant.'
              : isDeletion
                ? 'Suppression : il n’y a pas d’après.'
                : 'Seuls les champs réellement modifiés sont présentés.'
          }
        >
          {!detail ? (
            <Notice tone="warning">
              Le détail de cet événement n’a pas pu être retrouvé.
            </Notice>
          ) : !detail.mayRead ? (
            <div className="space-y-4">
              <Notice tone="warning">
                <p className="font-medium">Détail non consultable avec vos droits.</p>
                <p className="mt-1">
                  L’événement reste entièrement lisible ; sa <strong>donnée métier</strong>{' '}
                  relève du module concerné.
                </p>
              </Notice>

              <div className="flex items-start gap-2.5 rounded-control border border-line px-3.5 py-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <p className="text-sm text-muted">
                  {detail.requiredPermission ? (
                    <>
                      Capacité requise :{' '}
                      <strong className="text-ink">
                        {required ?? detail.requiredPermission}
                      </strong>
                      {required && (
                        <span className="block text-xs">{detail.requiredPermission}</span>
                      )}
                    </>
                  ) : (
                    <>
                      Ce type d’objet n’est ouvert qu’au <strong>Super Admin</strong>.
                    </>
                  )}
                </p>
              </div>
            </div>
          ) : changes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Aucune valeur n’a été conservée pour cet événement.
            </p>
          ) : (
            <div className="-mx-5 -my-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-adikom-50 text-left">
                    <th className="px-5 py-3 font-medium text-ink">Champ</th>
                    <th className="px-5 py-3 font-medium text-ink">Avant</th>
                    <th className="px-5 py-3 font-medium text-ink">Après</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.field} className="border-b border-line last:border-b-0">
                      <td className="px-5 py-3 text-ink">
                        {change.label}
                        {change.label !== change.field && (
                          <span className="block text-xs text-muted">{change.field}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 break-all text-muted">
                        {change.before ?? <Empty />}
                      </td>
                      <td className="px-5 py-3 break-all font-medium text-ink">
                        {change.after ?? <Empty />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
