import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Pencil, ShieldCheck } from 'lucide-react'

import { Badge, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { can, getCurrentUser, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import {
  getPermissionOverview,
  getUserDetail,
  listDepartments,
  listGroups,
  listPotentialManagers,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/users/data'
import { PermissionsPanel } from '@/features/users/permissions-panel'
import { StatusForm } from '@/features/users/status-form'
import { UserForm } from '@/features/users/user-form'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Fiche utilisateur' }

function formatDateTime(value: string | null): string | null {
  if (!value) return null
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export default async function UserDetailPage(props: PageProps<'/utilisateurs/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.USERS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const user = await getUserDetail(id)
  if (!user) notFound()

  const tab = searchParams.onglet === 'permissions' ? 'permissions' : 'utilisateur'
  const editing = searchParams.mode === 'edition'
  const justCreated = searchParams.cree === '1'

  const [canUpdate, canArchive] = await Promise.all([
    can(PERMISSIONS.USERS_UPDATE),
    can(PERMISSIONS.USERS_ARCHIVE),
  ])

  /* La fiche comporte exactement deux onglets — exigence du Module 08 §17. */
  const tabs = [
    { key: 'utilisateur', label: 'Utilisateur', href: `/utilisateurs/${id}` },
    { key: 'permissions', label: 'Permissions', href: `/utilisateurs/${id}?onglet=permissions` },
  ] as const

  return (
    <>
      <Link
        href="/utilisateurs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      {justCreated && (
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-control border border-success-soft bg-success-soft px-3.5 py-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Compte créé. Communiquez le nom d’utilisateur et le mot de passe initial au
            collaborateur par un canal sûr — le mot de passe n’est plus consultable.
          </span>
        </div>
      )}

      <PageHeader
        title={user.fullName}
        description={user.jobTitle ?? undefined}
        actions={
          canUpdate && !editing ? (
            <Link
              href={`/utilisateurs/${id}?mode=edition`}
              className="inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
            >
              <Pencil className="size-4" aria-hidden />
              Modifier
            </Link>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[user.status]}>{STATUS_LABELS[user.status]}</Badge>
        {user.isSuperAdmin && (
          <Badge tone="info">
            <ShieldCheck className="mr-1 size-3.5" aria-hidden />
            Super Admin
          </Badge>
        )}
        <span className="text-sm text-muted">{user.username}</span>
      </div>

      {/* Onglets */}
      <div className="mb-5 border-b border-line">
        <nav className="-mb-px flex gap-1" aria-label="Sections de la fiche">
          {tabs.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={tab === item.key ? 'page' : undefined}
              className={cn(
                'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                tab === item.key
                  ? 'border-adikom-500 text-adikom-500'
                  : 'border-transparent text-muted hover:text-ink'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {tab === 'utilisateur' ? (
        editing && canUpdate ? (
          <EditPanel userId={id} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card title="Informations">
                <dl>
                  <InfoRow label="Nom d’utilisateur">{user.username}</InfoRow>
                  <InfoRow label="Email professionnel">{user.email}</InfoRow>
                  <InfoRow label="Téléphone">{user.phone ?? <Empty />}</InfoRow>
                  <InfoRow label="Fonction">{user.jobTitle ?? <Empty />}</InfoRow>
                  <InfoRow label="Responsable hiérarchique">
                    {user.managerId && user.managerName ? (
                      <Link
                        href={`/utilisateurs/${user.managerId}`}
                        className="text-adikom-500 hover:underline"
                      >
                        {user.managerName}
                      </Link>
                    ) : (
                      <Empty />
                    )}
                  </InfoRow>
                  <InfoRow
                    label="Départements"
                    hint="Une personne peut en cumuler plusieurs"
                  >
                    {user.departments.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {user.departments.map((name) => (
                          <Badge key={name}>{name}</Badge>
                        ))}
                      </span>
                    ) : (
                      <Empty />
                    )}
                  </InfoRow>
                  <InfoRow label="Groupes">
                    {user.groups.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {user.groups.map((name) => (
                          <Badge key={name} tone="info">
                            {name}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <Empty />
                    )}
                  </InfoRow>
                  <InfoRow label="Date d’entrée">{formatDate(user.hiredOn) ?? <Empty />}</InfoRow>
                  <InfoRow label="Notes">{user.notes ?? <Empty />}</InfoRow>
                </dl>
              </Card>
            </div>

            <div className="space-y-5">
              <Card title="Compte">
                <dl>
                  <InfoRow label="Statut">
                    <Badge tone={STATUS_TONES[user.status]}>{STATUS_LABELS[user.status]}</Badge>
                  </InfoRow>
                  <InfoRow label="Dernière connexion">
                    {formatDateTime(user.lastLoginAt) ?? (
                      <span className="text-muted">Jamais connecté</span>
                    )}
                  </InfoRow>
                  <InfoRow label="Créé le">{formatDateTime(user.createdAt)}</InfoRow>
                  {user.deactivatedAt && (
                    <InfoRow label="Désactivé le">{formatDateTime(user.deactivatedAt)}</InfoRow>
                  )}
                </dl>
              </Card>

              {canArchive && (
                <Card
                  title="Statut du compte"
                  description="La désactivation empêche la connexion sans supprimer l’historique."
                >
                  <StatusForm userId={id} currentStatus={user.status} />
                </Card>
              )}
            </div>
          </div>
        )
      ) : (
        /* Le panneau gère lui-même le refus : `effective_permissions` rejette
           l'appel sans la permission requise, et l'onglet affiche alors un
           message explicite plutôt qu'une arborescence vide, qui laisserait
           croire à une absence de droits. */
        <PermissionsTab userId={id} isSuperAdmin={user.isSuperAdmin} />
      )}
    </>
  )
}

/** Formulaire de modification, isolé pour ne charger ses données qu'au besoin. */
async function EditPanel({ userId }: { userId: string }) {
  const [user, departments, groups, managers, canManageGroups] = await Promise.all([
    getUserDetail(userId),
    listDepartments(),
    listGroups(),
    listPotentialManagers(userId),
    can(PERMISSIONS.USER_PERMISSIONS_UPDATE),
  ])

  if (!user) notFound()

  return (
    <Card className="max-w-4xl">
      <UserForm
        mode="edit"
        user={user}
        departments={departments}
        groups={groups}
        managers={managers}
        canManageGroups={canManageGroups}
      />
    </Card>
  )
}

async function PermissionsTab({
  userId,
  isSuperAdmin,
}: {
  userId: string
  isSuperAdmin: boolean
}) {
  const [overview, canEditPermissions, actor] = await Promise.all([
    getPermissionOverview(userId),
    can(PERMISSIONS.USER_PERMISSIONS_UPDATE),
    getCurrentUser(),
  ])

  // Les droits du Super Admin viennent du rôle système : aucune règle
  // individuelle ne s'y applique. Nul ne modifie non plus ses propres droits.
  const editable = canEditPermissions && !isSuperAdmin && actor?.id !== userId

  return (
    <PermissionsPanel
      userId={userId}
      overview={overview}
      isSuperAdmin={isSuperAdmin}
      editable={editable}
      isSelf={actor?.id === userId}
    />
  )
}
