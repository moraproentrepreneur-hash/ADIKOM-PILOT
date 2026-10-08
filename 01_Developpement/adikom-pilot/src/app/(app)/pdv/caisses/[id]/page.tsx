import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Denied } from '@/components/ui/figure'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { getRegister, listCashAccountOptions, listRegisterSessions } from '@/features/pos/data'
import { RegisterActivePanel, RegisterForm } from '@/features/pos/panels'
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES, formatDuration } from '@/features/pos/constants'

export const metadata: Metadata = { title: 'Caisse' }

/** Fiche d'une caisse — Module 12 §3. Aucun montant, aucun solde. */
export default async function RegisterDetailPage(props: PageProps<'/pdv/caisses/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.POS_REGISTERS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams
  const justCreated = searchParams.cree === '1'

  const [canUpdate, canArchive, canSeeSessions, canSeeAccounts] = await Promise.all([
    can(PERMISSIONS.POS_REGISTERS_UPDATE),
    can(PERMISSIONS.POS_REGISTERS_ARCHIVE),
    can(PERMISSIONS.POS_SESSIONS_VIEW),
    can(PERMISSIONS.ACCOUNTS_VIEW),
  ])

  const register = await getRegister(id, { canSeeSessions })
  if (!register) notFound()

  const [sessions, accounts] = await Promise.all([
    canSeeSessions ? listRegisterSessions(id) : Promise.resolve(null),
    canUpdate && canSeeAccounts ? listCashAccountOptions(register.accountId) : Promise.resolve([]),
  ])

  const hasOpenSession = register.openSession !== null

  return (
    <>
      <Link
        href="/pdv/caisses"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux caisses
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Caisse déclarée sous le numéro <strong>{register.registerNo}</strong>.
        </Notice>
      )}

      <PageHeader
        title={register.label}
        description={`${register.registerNo}${register.location ? ` · ${register.location}` : ''}`}
        actions={
          <Badge tone={register.isActive ? 'success' : 'neutral'}>
            {register.isActive ? 'Active' : 'Inactive'}
          </Badge>
        }
      />

      {!register.isActive && (
        <Notice tone="warning" className="mb-5">
          Cette caisse est inactive : elle n’accepte aucune nouvelle session. Son historique reste
          consultable.
        </Notice>
      )}
      {register.accountActive === false && (
        <Notice tone="warning" className="mb-5">
          Le compte adossé n’est plus actif : aucune session ne peut s’ouvrir sur cette caisse tant
          qu’elle n’est pas adossée à un compte de caisse actif.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Caisse">
            <dl>
              <InfoRow label="Numéro">
                <span className="tabular">{register.registerNo}</span>
              </InfoRow>
              <InfoRow label="Compte adossé" hint="Le solde appartient au compte, jamais à la caisse.">
                {register.accountLabel ? (
                  <Link
                    href={`/tresorerie/comptes/${register.accountId}`}
                    className="text-adikom-500 hover:underline"
                  >
                    {register.accountLabel}
                    {register.accountNo ? ` (${register.accountNo})` : ''}
                  </Link>
                ) : (
                  <span className="text-muted">Compte non lisible avec vos droits</span>
                )}
              </InfoRow>
              <InfoRow label="Lieu">{register.location ?? <Empty />}</InfoRow>
              <InfoRow label="Motif du dernier changement d’état">
                {register.statusReason ?? <Empty />}
              </InfoRow>
              <InfoRow label="Déclarée le">{formatDateTime(register.createdAt)}</InfoRow>
            </dl>
          </Card>

          {canSeeSessions ? (
            <Card
              title="Dernières sessions"
              description="Les dix plus récentes. Les montants se lisent sur la fiche de chaque session."
              actions={
                <Link
                  href={`/pdv/sessions?caisse=${register.id}`}
                  className="text-sm text-adikom-500 hover:underline"
                >
                  Toutes les sessions
                </Link>
              }
            >
              {sessions === null || sessions.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="Aucune session"
                  description="Aucune session n’a encore été ouverte sur cette caisse."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {sessions.map((session) => (
                    <li key={session.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`/pdv/sessions/${session.id}`}
                          className="font-medium text-adikom-500 tabular hover:underline"
                        >
                          {session.sessionNo}
                        </Link>
                        <p className="text-xs text-muted">
                          {session.cashierLabel} · {formatDateTime(session.openedAt)} ·{' '}
                          {formatDuration(session.openedAt, session.closedAt)}
                        </p>
                      </div>
                      <Badge tone={SESSION_STATUS_TONES[session.status]}>
                        {SESSION_STATUS_LABELS[session.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : (
            <Card title="Sessions">
              <Denied missing={[PERMISSIONS.POS_SESSIONS_VIEW]} />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {canUpdate && (
            <Card title="Modifier">
              {canSeeAccounts && (!hasOpenSession || canSeeSessions) ? (
                <RegisterForm
                  accounts={accounts}
                  register={{
                    id: register.id,
                    label: register.label,
                    accountId: register.accountId,
                    location: register.location,
                    hasOpenSession,
                  }}
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted">
                    Modifier une caisse suppose de consulter les comptes de caisse.
                  </p>
                  <Denied missing={[PERMISSIONS.ACCOUNTS_VIEW]} />
                </div>
              )}
            </Card>
          )}

          {canArchive && (
            <Card title={register.isActive ? 'Désactiver' : 'Réactiver'}>
              <RegisterActivePanel
                registerId={register.id}
                isActive={register.isActive}
                hasOpenSession={hasOpenSession}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
