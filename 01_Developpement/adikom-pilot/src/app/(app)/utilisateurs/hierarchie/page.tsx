import type { Metadata } from 'next'
import Link from 'next/link'
import { Lock, Network, ShieldCheck, Unlink } from 'lucide-react'

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { getOrganisationChart, type ChartNode } from '@/features/users/hierarchy'

export const metadata: Metadata = { title: 'Vue hiérarchique' }

/**
 * Vue hiérarchique — Module 08 §35, §36, §37.
 *
 * Le dessin suit le responsable hiérarchique déclaré sur chaque fiche, et
 * montre à côté de chacun les départements dont il RÉPOND (§36) : une même
 * personne peut en cumuler plusieurs sans qu'un second compte soit créé.
 *
 * L'organigramme n'est pas figé (§37) : il se recompose à chaque changement de
 * responsable ou de rattachement, sans configuration ni écran dédié.
 *
 * TROIS SILENCES SONT NOMMÉS PLUTÔT QUE SUBIS (DEC-017) :
 *   · la capacité manque → l'écran le dit, il n'affiche pas un vide ;
 *   · des comptes non actifs sont écartés → leur nombre est annoncé ;
 *   · un responsable désactivé → son subordonné remonte à la racine, signalé.
 */
export default async function HierarchyPage() {
  await requirePermissionOrRedirect(PERMISSIONS.HIERARCHY_VIEW)

  const [chart, canOpenFiles] = await Promise.all([
    getOrganisationChart(),
    can(PERMISSIONS.USERS_VIEW),
  ])

  if (!chart.readable) {
    return (
      <>
        <PageHeader title="Vue hiérarchique" description="Organisation interne d’ADIKOM." />
        <Card>
          <EmptyState
            icon={Lock}
            title="Organigramme non consultable"
            description="Vous ne disposez pas de la permission « Consulter la vue hiérarchique »."
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Vue hiérarchique"
        description="Organisation interne d’ADIKOM, telle que les fiches la décrivent."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-muted">Collaborateurs actifs</p>
          <p className="mt-1 text-2xl font-semibold text-ink tabular">{chart.total}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Rattachements racine</p>
          <p className="mt-1 text-2xl font-semibold text-ink tabular">{chart.roots.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Comptes non actifs</p>
          <p className="mt-1 text-2xl font-semibold text-ink tabular">{chart.excluded}</p>
        </Card>
      </div>

      {chart.excluded > 0 && (
        <Notice tone="info" className="mb-5">
          {chart.excluded} compte{chart.excluded > 1 ? 's' : ''} non actif
          {chart.excluded > 1 ? 's' : ''} {chart.excluded > 1 ? 'sont écartés' : 'est écarté'} de ce
          dessin : l’organigramme représente l’organisation actuelle, non son historique. Les
          fiches et les opérations passées sont conservées.
        </Notice>
      )}

      {chart.detached > 0 && (
        <Notice tone="warning" className="mb-5">
          {chart.detached} collaborateur{chart.detached > 1 ? 's' : ''}{' '}
          {chart.detached > 1 ? 'sont rattachés' : 'est rattaché'} à un responsable qui n’est plus
          actif. {chart.detached > 1 ? 'Ils apparaissent' : 'Il apparaît'} à la racine :
          désignez-leur un responsable depuis leur fiche.
        </Notice>
      )}

      <Card>
        {chart.roots.length === 0 ? (
          <EmptyState
            icon={Network}
            title="Aucun collaborateur actif"
            description="L’organigramme se construit à partir des comptes actifs et de leur responsable hiérarchique."
          />
        ) : (
          <ul className="space-y-2">
            {chart.roots.map((node) => (
              <Branch key={node.id} node={node} canOpenFiles={canOpenFiles} />
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-5 text-xs text-muted">
        Le responsable hiérarchique et les départements se règlent depuis la fiche de chaque
        collaborateur. Un département n’accorde aucun droit : les permissions relèvent des groupes
        et des règles individuelles.
      </p>
    </>
  )
}

/**
 * Une branche de l'organigramme.
 *
 * Le repli utilise `<details>` : la lecture reste possible sans JavaScript, et
 * l'arborescence se parcourt au clavier comme n'importe quel contenu natif.
 * Sur mobile, les niveaux se décalent moins et la carte prime sur la ligne —
 * l'interface est réorganisée, pas simplement réduite (Design System §53).
 */
function Branch({ node, canOpenFiles }: { node: ChartNode; canOpenFiles: boolean }) {
  const hasChildren = node.children.length > 0

  const header = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="flex min-w-0 items-center gap-1.5">
        {canOpenFiles ? (
          <Link
            href={`/utilisateurs/${node.id}`}
            className="truncate text-sm font-medium text-adikom-500 hover:underline"
          >
            {node.fullName}
          </Link>
        ) : (
          <span className="truncate text-sm font-medium text-ink">{node.fullName}</span>
        )}
        {node.isSuperAdmin && (
          <ShieldCheck className="size-3.5 shrink-0 text-adikom-500" aria-label="Super Admin" />
        )}
      </span>

      {node.jobTitle && <span className="truncate text-xs text-muted">{node.jobTitle}</span>}

      {node.isDetached && (
        <span className="inline-flex items-center gap-1 text-xs text-warning">
          <Unlink className="size-3.5" aria-hidden />
          Responsable non actif
        </span>
      )}

      {/* §36 — une même personne peut répondre de plusieurs départements. */}
      {node.managed.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {node.managed.map((name) => (
            <Badge key={name} tone="info">
              Responsable · {name}
            </Badge>
          ))}
        </span>
      )}

      {node.departments
        .filter((name) => !node.managed.includes(name))
        .map((name) => (
          <Badge key={name}>{name}</Badge>
        ))}

      {hasChildren && (
        <span className="ml-auto shrink-0 text-xs text-muted tabular">
          {node.children.length} rattaché{node.children.length > 1 ? 's' : ''}
        </span>
      )}
    </div>
  )

  if (!hasChildren) {
    return (
      <li>
        <div className="flex items-start gap-2 rounded-control border border-line px-3.5 py-2.5">
          {header}
        </div>
      </li>
    )
  }

  return (
    <li>
      <details open className="group rounded-control border border-line">
        <summary className="flex cursor-pointer list-none items-start gap-2 px-3.5 py-2.5 transition-colors hover:bg-adikom-50/60">
          <span
            aria-hidden
            className="mt-0.5 shrink-0 text-muted transition-transform group-open:rotate-90"
          >
            ›
          </span>
          {header}
        </summary>

        <ul className="space-y-2 border-t border-line p-2 pl-3 sm:pl-6">
          {node.children.map((child) => (
            <Branch key={child.id} node={child} canOpenFiles={canOpenFiles} />
          ))}
        </ul>
      </details>
    </li>
  )
}
