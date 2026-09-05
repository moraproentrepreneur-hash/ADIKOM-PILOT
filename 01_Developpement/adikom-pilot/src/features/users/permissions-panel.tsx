'use client'

import { useActionState, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Lock, Minus, X } from 'lucide-react'

import { Badge, EmptyState } from '@/components/ui/primitives'
import { updateUserPermissionsAction } from './actions'
import {
  CHOICE_LABELS,
  SOURCE_LABELS,
  type PermissionChoice,
  type PermissionSource,
} from './constants'
import type { PermissionEntry, PermissionModuleTree, PermissionOverview } from './data'
import {
  PermissionTree,
  SaveBar,
  type Choices,
  type EntryState,
  type TreeEntry,
} from './permission-tree'

/**
 * Onglet « Permissions » d'une fiche utilisateur.
 *
 * Présente l'arborescence Module → Menu → Sous-menu → Action exigée par le
 * Module 08 §19 et §20, en distinguant sans ambiguïté les quatre états prévus
 * au §48 : accordé, refusé, hérité, non défini.
 *
 * Seules les règles **individuelles** sont modifiables ici : `ALLOW`, `DENY`,
 * ou aucune règle, l'héritage des groupes s'appliquant alors. Les permissions
 * de groupe ne sont jamais touchées, et l'origine d'un droit reste lisible.
 *
 * Le formulaire n'est qu'un confort de saisie : la permission
 * `users.users.permissions.update` est revérifiée côté serveur, les policies
 * RLS s'appliquent à l'écriture, et la base interdit à quiconque de modifier
 * ses propres droits.
 */

/**
 * Résultat effectif d'une permission pour un choix individuel donné.
 *
 * Reproduit la précédence de `effective_permissions` :
 * refus individuel > refus hérité > autorisation individuelle > autorisation
 * héritée > aucun droit.
 */
function resolve(entry: PermissionEntry, choice: PermissionChoice): boolean {
  if (choice === 'DENY') return false
  if (entry.inheritedEffect === 'DENY') return false
  if (choice === 'ALLOW') return true
  return entry.inheritedEffect === 'ALLOW'
}

/** Origine du droit, recalculée avec la même précédence. */
function resolveSource(entry: PermissionEntry, choice: PermissionChoice): PermissionSource {
  if (choice === 'DENY') return 'USER_DENY'
  if (entry.inheritedEffect === 'DENY') return 'GROUP_DENY'
  if (choice === 'ALLOW') return 'USER_ALLOW'
  if (entry.inheritedEffect === 'ALLOW') return 'GROUP_ALLOW'
  return 'NONE'
}

function sourceBadge(source: PermissionSource) {
  if (source === 'GROUP_ALLOW') return <Badge tone="info">Hérité</Badge>
  if (source === 'USER_ALLOW') return <Badge tone="success">Individuel</Badge>
  if (source === 'SUPER_ADMIN') return <Badge tone="info">Super Admin</Badge>
  if (source === 'USER_DENY') return <Badge tone="danger">Refusé</Badge>
  if (source === 'GROUP_DENY') return <Badge tone="danger">Refusé (groupe)</Badge>
  return null
}

/** Choix initiaux, tels qu'enregistrés en base. */
function initialChoices(modules: PermissionModuleTree[]): Choices {
  const choices: Choices = {}
  for (const moduleTree of modules) {
    for (const branch of moduleTree.branches) {
      for (const entry of branch.entries) {
        choices[entry.code] = entry.userEffect ?? 'INHERIT'
      }
    }
  }
  return choices
}

export function PermissionsPanel({
  userId,
  overview,
  isSuperAdmin,
  editable,
  isSelf,
}: {
  userId: string
  overview: PermissionOverview
  isSuperAdmin: boolean
  editable: boolean
  isSelf: boolean
}) {
  const [state, formAction] = useActionState(updateUserPermissionsAction, {})

  // `key` change à chaque rechargement de la fiche : l'état repart des valeurs
  // enregistrées après un succès, sans effet de synchronisation manuelle.
  const [choices, setChoices] = useState<Choices>(() => initialChoices(overview.modules))

  const baseline = useMemo(() => initialChoices(overview.modules), [overview.modules])

  /**
   * Index des entrées par code : l'arborescence partagée ne connaît que
   * `TreeEntry`, alors que la précédence a besoin de l'héritage.
   */
  const byCode = useMemo(() => {
    const index = new Map<string, PermissionEntry>()
    for (const moduleTree of overview.modules) {
      for (const branch of moduleTree.branches) {
        for (const entry of branch.entries) index.set(entry.code, entry)
      }
    }
    return index
  }, [overview.modules])

  /* Comptes recalculés à chaque saisie, sans aller-retour serveur. */
  const counts = useMemo(() => {
    let granted = 0
    let sensitiveGranted = 0
    let dirty = 0

    for (const entry of byCode.values()) {
      const choice = choices[entry.code] ?? 'INHERIT'
      if (choice !== baseline[entry.code]) dirty += 1

      if (isSuperAdmin || resolve(entry, choice)) {
        granted += 1
        if (entry.isSensitive) sensitiveGranted += 1
      }
    }

    return { granted, sensitiveGranted, dirty }
  }, [byCode, choices, baseline, isSuperAdmin])

  if (!overview.readable) {
    return (
      <EmptyState
        icon={Lock}
        title="Permissions non consultables"
        description="Vous ne disposez pas des droits nécessaires pour consulter les permissions de cet utilisateur."
      />
    )
  }

  /** Un droit refusé explicitement n'est pas la même chose qu'un droit non défini. */
  function describe(treeEntry: TreeEntry, choice: PermissionChoice): EntryState {
    const entry = byCode.get(treeEntry.code)
    if (!entry) {
      return { granted: false, caption: SOURCE_LABELS.NONE, icon: Minus, className: 'text-muted/60' }
    }

    const granted = isSuperAdmin || resolve(entry, choice)
    const source: PermissionSource = isSuperAdmin ? 'SUPER_ADMIN' : resolveSource(entry, choice)

    if (granted) {
      return {
        granted: true,
        caption: SOURCE_LABELS[source],
        icon: Check,
        className: 'text-success',
        badge: sourceBadge(source),
      }
    }

    if (source === 'USER_DENY' || source === 'GROUP_DENY') {
      return {
        granted: false,
        caption: SOURCE_LABELS[source],
        icon: X,
        className: 'text-danger',
        badge: sourceBadge(source),
      }
    }

    return {
      granted: false,
      caption: SOURCE_LABELS.NONE,
      icon: Minus,
      className: 'text-muted/60',
    }
  }

  /** Applique un choix à toutes les permissions d'un module. */
  function applyToModule(moduleTree: { branches: { entries: TreeEntry[] }[] }, choice: PermissionChoice) {
    setChoices((current) => {
      const next = { ...current }
      for (const branch of moduleTree.branches) {
        for (const entry of branch.entries) next[entry.code] = choice
      }
      return next
    })
  }

  const tree = (
    <PermissionTree
      modules={overview.modules}
      choices={choices}
      describe={describe}
      editable={editable}
      choiceLabels={CHOICE_LABELS}
      onChange={(code, choice) => setChoices((current) => ({ ...current, [code]: choice }))}
      onApplyToModule={applyToModule}
    />
  )

  /* Pourquoi la modification n'est pas proposée, lorsque c'est le cas. */
  const readOnlyReason = isSuperAdmin
    ? 'Ce compte détient le rôle système Super Admin : ses droits ne dépendent d’aucune règle individuelle.'
    : isSelf
      ? 'Vous ne pouvez pas modifier vos propres droits d’accès.'
      : 'Consultation seule : vous ne disposez pas du droit de modifier les permissions.'

  return (
    <div className="space-y-4">
      {/* Synthèse */}
      <div className="rounded-control border border-line bg-adikom-50 px-4 py-3.5">
        {isSuperAdmin ? (
          <p className="text-sm text-ink">
            Ce compte détient le rôle système <strong>Super Admin</strong> : il dispose de l’accès
            complet aux {overview.total} permissions, indépendamment de tout groupe.
          </p>
        ) : (
          <p className="text-sm text-ink">
            <strong>{counts.granted}</strong> permission{counts.granted > 1 ? 's' : ''} accordée
            {counts.granted > 1 ? 's' : ''} sur {overview.total}
            {counts.sensitiveGranted > 0 && (
              <>
                {' '}
                — dont <strong>{counts.sensitiveGranted}</strong> sensible
                {counts.sensitiveGranted > 1 ? 's' : ''}
              </>
            )}
            .
          </p>
        )}
        <p className="mt-1.5 text-xs text-muted">
          {editable
            ? 'Les règles individuelles complètent l’héritage des groupes. « Non défini » laisse le groupe décider ; « Refuser » prime sur toute autorisation héritée.'
            : readOnlyReason}
        </p>
      </div>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control border border-danger-soft bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      {state.success && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control border border-success-soft bg-success-soft px-3.5 py-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.success}
        </p>
      )}

      {editable && counts.dirty > 0 && (
        <p className="flex items-start gap-2 rounded-control border border-warning-soft bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Les compteurs ci-dessous reflètent vos choix en cours. Ils ne prendront effet qu’après
          enregistrement.
        </p>
      )}

      {editable ? (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          {tree}
          <SaveBar dirty={counts.dirty} label="Enregistrer les permissions" />
        </form>
      ) : (
        tree
      )}
    </div>
  )
}
