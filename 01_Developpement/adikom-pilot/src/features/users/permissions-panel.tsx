import { Check, ChevronRight, Lock, Minus, ShieldAlert, X } from 'lucide-react'

import { Badge, EmptyState } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { SOURCE_LABELS, type PermissionSource } from './constants'
import type { PermissionEntry, PermissionOverview } from './data'

/**
 * Onglet « Permissions » — lecture seule (Étape 2.1).
 *
 * Présente l'arborescence Module → Menu → Sous-menu → Action exigée par le
 * Module 08 §19 et §20, en distinguant sans ambiguïté les quatre états prévus
 * au §48 : accordé, refusé, hérité, non défini.
 *
 * La modification des permissions relève d'une étape ultérieure. Cet onglet
 * n'expose donc aucun contrôle de saisie : il rend compte de l'état réel des
 * droits et de leur origine.
 */

type StateStyle = {
  label: string
  icon: typeof Check
  className: string
}

/** Un droit refusé explicitement n'est pas la même chose qu'un droit non défini. */
function describe(entry: PermissionEntry): StateStyle {
  if (entry.granted) {
    return {
      label: SOURCE_LABELS[entry.source],
      icon: Check,
      className: 'text-success',
    }
  }

  if (entry.source === 'USER_DENY' || entry.source === 'GROUP_DENY') {
    return {
      label: SOURCE_LABELS[entry.source],
      icon: X,
      className: 'text-danger',
    }
  }

  return {
    label: SOURCE_LABELS.NONE,
    icon: Minus,
    className: 'text-muted/60',
  }
}

function sourceBadge(source: PermissionSource) {
  if (source === 'GROUP_ALLOW') return <Badge tone="info">Hérité</Badge>
  if (source === 'USER_ALLOW') return <Badge tone="success">Individuel</Badge>
  if (source === 'SUPER_ADMIN') return <Badge tone="info">Super Admin</Badge>
  if (source === 'USER_DENY' || source === 'GROUP_DENY') return <Badge tone="danger">Refusé</Badge>
  return null
}

export function PermissionsPanel({
  overview,
  isSuperAdmin,
}: {
  overview: PermissionOverview
  isSuperAdmin: boolean
}) {
  if (!overview.readable) {
    return (
      <EmptyState
        icon={Lock}
        title="Permissions non consultables"
        description="Vous ne disposez pas des droits nécessaires pour consulter les permissions de cet utilisateur."
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Synthèse */}
      <div className="rounded-control border border-line bg-adikom-50 px-4 py-3.5">
        {isSuperAdmin ? (
          <p className="text-sm text-ink">
            Ce compte détient le rôle système <strong>Super Admin</strong> : il dispose de
            l’accès complet aux {overview.total} permissions, indépendamment de tout groupe.
          </p>
        ) : (
          <p className="text-sm text-ink">
            <strong>{overview.granted}</strong> permission{overview.granted > 1 ? 's' : ''}{' '}
            accordée{overview.granted > 1 ? 's' : ''} sur {overview.total}
            {overview.sensitiveGranted > 0 && (
              <>
                {' '}
                — dont <strong>{overview.sensitiveGranted}</strong> sensible
                {overview.sensitiveGranted > 1 ? 's' : ''}
              </>
            )}
            .
          </p>
        )}
        <p className="mt-1.5 text-xs text-muted">
          Consultation seule. La modification des permissions s’effectuera par les groupes.
        </p>
      </div>

      {/* Arborescence par module */}
      <div className="space-y-2">
        {overview.modules.map((module) => (
          <details
            key={module.code}
            className="group rounded-control border border-line"
            open={module.granted > 0}
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-adikom-50/60">
              <ChevronRight
                className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                {module.label}
              </span>
              {module.sensitiveGranted > 0 && (
                <ShieldAlert
                  className="size-4 shrink-0 text-warning"
                  aria-label={`${module.sensitiveGranted} permission(s) sensible(s) accordée(s)`}
                />
              )}
              <span
                className={cn(
                  'shrink-0 text-xs tabular',
                  module.granted === 0 ? 'text-muted/70' : 'text-adikom-500'
                )}
              >
                {module.granted} / {module.total}
              </span>
            </summary>

            <div className="border-t border-line">
              {module.branches.map((branch) => (
                <div key={branch.key} className="border-b border-line last:border-b-0">
                  {(branch.menuLabel || branch.submenuLabel) && (
                    <p className="bg-canvas px-4 py-2 text-xs font-medium text-muted">
                      {branch.menuLabel}
                      {branch.submenuLabel && (
                        <>
                          <span className="mx-1.5 text-muted/50">›</span>
                          {branch.submenuLabel}
                        </>
                      )}
                    </p>
                  )}

                  <ul>
                    {branch.entries.map((entry) => {
                      const state = describe(entry)
                      const Icon = state.icon

                      return (
                        <li
                          key={entry.code}
                          className="flex items-start gap-3 px-4 py-2.5 text-sm"
                        >
                          <Icon
                            className={cn('mt-0.5 size-4 shrink-0', state.className)}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block',
                                entry.granted ? 'text-ink' : 'text-muted'
                              )}
                            >
                              {entry.label}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted/80">
                              {entry.actionLabel} · {state.label}
                            </span>
                          </span>

                          <span className="flex shrink-0 items-center gap-1.5">
                            {entry.isSensitive && (
                              <Badge tone="warning" className="hidden sm:inline-flex">
                                Sensible
                              </Badge>
                            )}
                            {sourceBadge(entry.source)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
