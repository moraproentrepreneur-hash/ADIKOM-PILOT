import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lock, Pencil, ShieldCheck, Users } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { can, getCurrentUser, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { STATUS_LABELS, STATUS_TONES, type UserStatus } from '@/features/users/constants'
import {
  getGroupDetail,
  getGroupPermissionOverview,
  isCurrentUserMember,
  listAssignableUsers,
  listGroupMembers,
} from '@/features/groups/data'
import { GroupForm } from '@/features/groups/group-form'
import { GroupLifecycleForm } from '@/features/groups/group-lifecycle-form'
import { GroupPermissionsPanel } from '@/features/groups/group-permissions-panel'
import { MembersForm } from '@/features/groups/members-form'

export const metadata: Metadata = { title: 'Fiche groupe' }

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/**
 * Fiche d'un groupe — Module 08 §28, §29, §30, §52.
 *
 * Deux onglets, comme la fiche utilisateur (§17) : ce qu'est le groupe, et ce
 * qu'il ouvre. Le vocabulaire de la gouvernance des accès reste ainsi le même
 * d'un écran à l'autre.
 *
 * Chaque section porte SA capacité, et aucune n'en ouvre une autre (DEC-024) :
 * consulter n'est pas modifier, modifier n'est pas désactiver, changer les
 * permissions n'est pas changer les membres.
 */
export default async function GroupDetailPage(props: PageProps<'/utilisateurs/groupes/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.GROUPS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const group = await getGroupDetail(id)
  if (!group) notFound()

  const tab = searchParams.onglet === 'permissions' ? 'permissions' : 'groupe'
  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'

  const [canUpdate, canArchive] = await Promise.all([
    can(PERMISSIONS.GROUPS_UPDATE),
    can(PERMISSIONS.GROUPS_ARCHIVE),
  ])

  const tabs = [
    { key: 'groupe', label: 'Groupe', href: `/utilisateurs/groupes/${id}` },
    {
      key: 'permissions',
      label: 'Permissions',
      href: `/utilisateurs/groupes/${id}?onglet=permissions`,
    },
  ] as const

  return (
    <>
      <Link
        href="/utilisateurs/groupes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux groupes
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Groupe créé. Il ne transmet encore aucun droit : réglez ses permissions, puis désignez ses
          membres.
        </Notice>
      )}

      <PageHeader
        title={group.name}
        description={group.description ?? undefined}
        actions={
          canUpdate && !editing && tab === 'groupe' ? (
            <Link
              href={`/utilisateurs/groupes/${id}?mode=edition`}
              className="inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
            >
              <Pencil className="size-4" aria-hidden />
              Modifier
            </Link>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={group.isActive ? 'success' : 'neutral'}>
          {group.isActive ? 'Actif' : 'Désactivé'}
        </Badge>
        {group.isSystem && (
          <Badge tone="info">
            <ShieldCheck className="mr-1 size-3.5" aria-hidden />
            Groupe système
          </Badge>
        )}
        <span className="font-mono text-xs text-muted">{group.code}</span>
      </div>

      <Tabs items={tabs} current={tab} />

      {tab === 'groupe' ? (
        editing && canUpdate ? (
          <Card className="max-w-3xl">
            <GroupForm mode="edit" group={group} />
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Card title="Informations">
                <dl>
                  <InfoRow label="Nom">{group.name}</InfoRow>
                  <InfoRow label="Code" hint="Identifie le groupe dans les exports et l’audit">
                    <span className="font-mono text-sm">{group.code}</span>
                  </InfoRow>
                  <InfoRow label="Description">{group.description ?? <Empty />}</InfoRow>
                  <InfoRow label="Ordre d’affichage">{group.sortOrder}</InfoRow>
                  <InfoRow label="Permissions accordées">
                    {group.allowCount}
                    {group.denyCount > 0 && (
                      <span className="ml-1.5 text-danger">
                        · {group.denyCount} refus explicite{group.denyCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </InfoRow>
                  <InfoRow label="Créé le">{formatDateTime(group.createdAt)}</InfoRow>
                  <InfoRow label="Dernière modification">
                    {formatDateTime(group.updatedAt)}
                  </InfoRow>
                </dl>
              </Card>

              <MembersSection group={group} />
            </div>

            <div className="space-y-5">
              {canArchive ? (
                <Card
                  title="Cycle de vie"
                  description="La désactivation suspend l’effet des permissions sans rien perdre."
                >
                  <GroupLifecycleForm
                    groupId={group.id}
                    isActive={group.isActive}
                    isSystem={group.isSystem}
                    memberCount={group.memberCount}
                  />
                </Card>
              ) : (
                <Card title="Cycle de vie">
                  <p className="text-sm text-muted">
                    Activer, désactiver ou supprimer un groupe relève d’une permission dédiée dont
                    vous ne disposez pas.
                  </p>
                </Card>
              )}
            </div>
          </div>
        )
      ) : (
        <PermissionsTab groupId={id} groupName={group.name} isActive={group.isActive} memberCount={group.memberCount} />
      )}
    </>
  )
}

/**
 * Membres du groupe.
 *
 * Trois situations, et l'écran ne les confond pas : le groupe est vide, ses
 * membres sont hors de portée de lecture, ou ils sont là et modifiables.
 */
async function MembersSection({
  group,
}: {
  group: { id: string; memberCount: number | null }
}) {
  const [membership, canManageMembers, actor] = await Promise.all([
    listGroupMembers(group.id, group.memberCount),
    can(PERMISSIONS.USER_PERMISSIONS_UPDATE),
    getCurrentUser(),
  ])

  if (!membership.readable) {
    return (
      <Card title="Membres">
        <EmptyState
          icon={Lock}
          title="Membres non consultables"
          description={
            group.memberCount === null
              ? 'Le nombre de membres de ce groupe n’a pas pu être établi.'
              : `Ce groupe compte ${group.memberCount} membre${group.memberCount > 1 ? 's' : ''}, mais leur identité relève de la consultation des utilisateurs, dont vous ne disposez pas.`
          }
        />
      </Card>
    )
  }

  if (!canManageMembers) {
    return (
      <Card
        title="Membres"
        description={`${membership.members.length} utilisateur${membership.members.length > 1 ? 's' : ''} héritent des permissions de ce groupe.`}
      >
        {membership.members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aucun membre"
            description="Ce groupe ne transmet actuellement ses permissions à personne."
          />
        ) : (
          <ul className="divide-y divide-line">
            {membership.members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link
                  href={`/utilisateurs/${member.id}`}
                  className="min-w-0 text-sm text-adikom-500 hover:underline"
                >
                  {member.fullName}
                  <span className="ml-1.5 text-xs text-muted">{member.username}</span>
                </Link>
                {member.status !== 'ACTIVE' && (
                  <Badge tone={STATUS_TONES[member.status as UserStatus]}>
                    {STATUS_LABELS[member.status as UserStatus]}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">
          Modifier l’appartenance à un groupe revient à modifier des droits d’accès : cette
          opération requiert une permission dédiée dont vous ne disposez pas.
        </p>
      </Card>
    )
  }

  const users = await listAssignableUsers()

  return (
    <Card
      title="Membres"
      description="Cocher un collaborateur lui transmet les permissions de ce groupe."
    >
      <MembersForm
        groupId={group.id}
        users={users}
        memberIds={membership.members.map((member) => member.id)}
        actorId={actor?.id ?? ''}
      />
    </Card>
  )
}

async function PermissionsTab({
  groupId,
  groupName,
  isActive,
  memberCount,
}: {
  groupId: string
  groupName: string
  isActive: boolean
  memberCount: number | null
}) {
  const [overview, canEdit, membership] = await Promise.all([
    getGroupPermissionOverview(groupId),
    can(PERMISSIONS.GROUP_PERMISSIONS_UPDATE),
    isCurrentUserMember(groupId),
  ])

  return (
    <GroupPermissionsPanel
      groupId={groupId}
      groupName={groupName}
      overview={overview}
      editable={canEdit && !membership}
      isMember={membership}
      isActive={isActive}
      memberCount={memberCount}
    />
  )
}
