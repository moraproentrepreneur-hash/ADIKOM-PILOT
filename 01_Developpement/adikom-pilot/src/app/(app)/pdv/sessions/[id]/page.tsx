import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'

import { Badge, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Denied } from '@/components/ui/figure'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import {
  SESSION_STATUS_LABELS,
  SESSION_STATUS_TONES,
  VARIANCE_TONES,
  describeVariance,
  formatDuration,
  readVariance,
} from '@/features/pos/constants'
import { getSession } from '@/features/pos/data'
import { OpenSessionBanner } from '@/features/pos/open-session-banner'
import { CloseSessionPanel } from '@/features/pos/panels'

export const metadata: Metadata = { title: 'Session de caisse' }

/**
 * Fiche d'une session — Module 12 §4, §5.
 *
 * 🟥 TROIS LECTURES POSSIBLES DES MONTANTS, ET L'ÉCRAN DIT LAQUELLE :
 *
 *   · `pos.sessions.amounts.view` : tous les montants ;
 *   · caissier de la session : les siens (B-13) ;
 *   · sinon : « non visibles » — jamais 0 KMF (DEC-017).
 *
 * Le théorique et l'écart viennent de la base (D1). Rien n'est recalculé ici.
 */
export default async function SessionDetailPage(props: PageProps<'/pdv/sessions/[id]'>) {
  const user = await requirePermissionOrRedirect(PERMISSIONS.POS_SESSIONS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams
  const justOpened = searchParams.ouverte === '1'
  const justClosed = searchParams.close === '1'

  const [canClose, canSeeAllAmounts] = await Promise.all([
    can(PERMISSIONS.POS_SESSIONS_CLOSE),
    can(PERMISSIONS.POS_SESSION_AMOUNTS_VIEW),
  ])

  const session = await getSession(id)
  if (!session) notFound()

  const isOwn = session.cashierId === user.id
  const amountsReadable = session.amounts !== null
  const reading = readVariance(session.variance, amountsReadable, session.status)

  // Q-2 : clôturer la session d'un autre suppose d'en voir les montants.
  const mayClose =
    session.status === 'OPEN' && canClose && (isOwn || canSeeAllAmounts || user.isSuperAdmin)

  return (
    <>
      <OpenSessionBanner hideFor={session.id} />

      <Link
        href="/pdv/sessions"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux sessions
      </Link>

      {justOpened && (
        <Notice tone="success" className="mb-5">
          Session <strong>{session.sessionNo}</strong> ouverte à votre nom.
        </Notice>
      )}
      {justClosed && (
        <Notice tone="success" className="mb-5">
          Session <strong>{session.sessionNo}</strong> close. {describeVariance(reading)}.
        </Notice>
      )}

      <PageHeader
        title={`Session ${session.sessionNo}`}
        description={`${session.registerLabel} · ${session.cashierLabel}`}
        actions={
          <Badge tone={SESSION_STATUS_TONES[session.status]}>
            {SESSION_STATUS_LABELS[session.status]}
          </Badge>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Session" description="Qui, sur quelle caisse, de quand à quand.">
            <dl>
              <InfoRow label="Caisse">
                {session.registerNo ? (
                  <Link href={`/pdv/caisses/${session.registerId}`} className="text-adikom-500 hover:underline">
                    {session.registerLabel} ({session.registerNo})
                  </Link>
                ) : (
                  <span className="text-muted">{session.registerLabel}</span>
                )}
              </InfoRow>
              <InfoRow label="Caissier">
                {session.cashierLabel}
                {isOwn && <span className="ml-1.5 text-xs text-muted">(vous)</span>}
              </InfoRow>
              <InfoRow label="Ouverte le">
                <span className="tabular">{formatDateTime(session.openedAt)}</span>
              </InfoRow>
              <InfoRow label="Close le">
                {session.closedAt ? (
                  <span className="tabular">{formatDateTime(session.closedAt)}</span>
                ) : (
                  <span className="text-muted">En cours</span>
                )}
              </InfoRow>
              <InfoRow label="Durée">{formatDuration(session.openedAt, session.closedAt)}</InfoRow>
              {session.status === 'CLOSED' && (
                <>
                  <InfoRow label="Close par">{session.closedByLabel ?? <Empty />}</InfoRow>
                  <InfoRow label="Observation de clôture">{session.closingNote ?? <Empty />}</InfoRow>
                </>
              )}
            </dl>
          </Card>

          <Card
            title="Montants"
            description="Le théorique et l’écart sont calculés, jamais saisis ni stockés."
          >
            {!amountsReadable ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">
                  Les montants de cette session ne sont pas visibles avec vos droits. Ils ne sont pas
                  nuls pour autant : un caissier voit ceux de ses propres sessions, et ceux des
                  autres relèvent d’une capacité distincte.
                </p>
                <Denied missing={[PERMISSIONS.POS_SESSION_AMOUNTS_VIEW]} />
              </div>
            ) : (
              <dl>
                <InfoRow label="Fond de caisse" hint="Déclaré à l’ouverture, figé ensuite.">
                  <span className="tabular">{formatAmount(session.amounts!.openingFloat)}</span>
                </InfoRow>
                <InfoRow
                  label="Montant théorique"
                  hint="Fond de caisse ; les encaissements en espèces s’y ajouteront avec les ventes."
                >
                  {session.expected === null ? (
                    <Empty />
                  ) : (
                    <span className="tabular">{formatAmount(session.expected)}</span>
                  )}
                </InfoRow>
                <InfoRow label="Montant compté">
                  {session.amounts!.countedAmount === null ? (
                    <span className="text-muted">Se constate à la clôture</span>
                  ) : (
                    <span className="font-medium tabular">
                      {formatAmount(session.amounts!.countedAmount)}
                    </span>
                  )}
                </InfoRow>
                <InfoRow label="Écart" hint="Compté − théorique. Constaté, jamais bloquant.">
                  <Badge tone={VARIANCE_TONES[reading.kind]}>{describeVariance(reading)}</Badge>
                </InfoRow>
              </dl>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {session.status === 'OPEN' ? (
            <Card title="Clôturer" description="Le montant compté est obligatoire.">
              {mayClose ? (
                <CloseSessionPanel sessionId={session.id} expected={session.expected} />
              ) : !canClose ? (
                <Denied missing={[PERMISSIONS.POS_SESSIONS_CLOSE]} />
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted">
                    Clôturer la session d’un autre caissier suppose de pouvoir compter sa caisse,
                    donc d’en voir les montants.
                  </p>
                  <Denied missing={[PERMISSIONS.POS_SESSION_AMOUNTS_VIEW]} />
                </div>
              )}
            </Card>
          ) : (
            <Card title="Session close">
              <p className="flex items-start gap-2 text-sm text-muted">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                Une session close ne se rouvre pas. Sa clôture, son montant compté et son
                observation sont figés ; l’écart constaté est consigné au journal.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
