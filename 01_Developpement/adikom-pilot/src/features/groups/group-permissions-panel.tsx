'use client'

import { useActionState, useMemo, useState } from 'react'
import { AlertTriangle, Check, Lock, Minus, X } from 'lucide-react'

import { Badge, EmptyState } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import type { PermissionChoice } from '@/features/users/constants'
import {
  PermissionTree,
  SaveBar,
  type Choices,
  type EntryState,
  type TreeEntry,
} from '@/features/users/permission-tree'
import { updateGroupPermissionsAction } from './actions'
import { GROUP_CHOICE_LABELS, GROUP_EFFECT_LABELS } from './constants'
import type { GroupPermissionEntry, GroupPermissionOverview } from './data'

/**
 * Onglet « Permissions » d'une fiche groupe — Module 08 §28, §31, §32.
 *
 * Un groupe est une SOURCE de droits, pas un destinataire : il n'hérite de
 * rien. Chaque permission y est donc dans l'un de trois états — accordée,
 * refusée, ou absente du groupe.
 *
 * LE REFUS N'EST PAS L'ABSENCE, et c'est tout l'enjeu de cet écran.
 *
 * « Non défini » laisse la question ouverte : un autre groupe, ou une règle
 * individuelle, peut accorder le droit. « Refuser » ferme la porte pour tous
 * les membres, y compris contre une autorisation individuelle — c'est la règle
 * de résolution du SaaS (DEC-009), et le geste le plus lourd de cette page.
 */

function badgeFor(choice: PermissionChoice) {
  if (choice === 'ALLOW') return <Badge tone="success">Accordée</Badge>
  if (choice === 'DENY') return <Badge tone="danger">Refusée</Badge>
  return null
}

function describe(_entry: TreeEntry, choice: PermissionChoice): EntryState {
  if (choice === 'ALLOW') {
    return {
      granted: true,
      caption: GROUP_EFFECT_LABELS.ALLOW,
      icon: Check,
      className: 'text-success',
      badge: badgeFor(choice),
    }
  }

  if (choice === 'DENY') {
    return {
      granted: false,
      caption: GROUP_EFFECT_LABELS.DENY,
      icon: X,
      className: 'text-danger',
      badge: badgeFor(choice),
    }
  }

  return {
    granted: false,
    caption: GROUP_EFFECT_LABELS.INHERIT,
    icon: Minus,
    className: 'text-muted/60',
  }
}

/** Choix initiaux, tels qu'enregistrés en base. */
function initialChoices(modules: GroupPermissionOverview['modules']): Choices {
  const choices: Choices = {}
  for (const moduleTree of modules) {
    for (const branch of moduleTree.branches) {
      for (const entry of branch.entries) {
        choices[entry.code] = entry.effect ?? 'INHERIT'
      }
    }
  }
  return choices
}

export function GroupPermissionsPanel({
  groupId,
  groupName,
  overview,
  editable,
  isMember,
  isActive,
  memberCount,
}: {
  groupId: string
  groupName: string
  overview: GroupPermissionOverview
  editable: boolean
  /** L'appelant appartient au groupe : la base lui refuse toute modification. */
  isMember: boolean
  isActive: boolean
  memberCount: number | null
}) {
  const [state, formAction] = useActionState(updateGroupPermissionsAction, {})
  const [choices, setChoices] = useState<Choices>(() => initialChoices(overview.modules))

  const baseline = useMemo(() => initialChoices(overview.modules), [overview.modules])

  const byCode = useMemo(() => {
    const index = new Map<string, GroupPermissionEntry>()
    for (const moduleTree of overview.modules) {
      for (const branch of moduleTree.branches) {
        for (const entry of branch.entries) index.set(entry.code, entry)
      }
    }
    return index
  }, [overview.modules])

  /* Décomptes recalculés à chaque saisie, sans aller-retour serveur. */
  const counts = useMemo(() => {
    let allow = 0
    let deny = 0
    let sensitiveAllow = 0
    let dirty = 0

    for (const entry of byCode.values()) {
      const choice = choices[entry.code] ?? 'INHERIT'
      if (choice !== baseline[entry.code]) dirty += 1

      if (choice === 'ALLOW') {
        allow += 1
        if (entry.isSensitive) sensitiveAllow += 1
      } else if (choice === 'DENY') {
        deny += 1
      }
    }

    return { allow, deny, sensitiveAllow, dirty }
  }, [byCode, choices, baseline])

  if (!overview.readable) {
    return (
      <EmptyState
        icon={Lock}
        title="Permissions non consultables"
        description="Vous ne disposez pas des droits nécessaires pour consulter les permissions de ce groupe."
      />
    )
  }

  function applyToModule(
    moduleTree: { branches: { entries: TreeEntry[] }[] },
    choice: PermissionChoice
  ) {
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
      choiceLabels={GROUP_CHOICE_LABELS}
      onChange={(code, choice) => setChoices((current) => ({ ...current, [code]: choice }))}
      onApplyToModule={applyToModule}
    />
  )

  const readOnlyReason = isMember
    ? 'Vous appartenez à ce groupe : nul ne modifie les droits dont il dépend. Retirez-vous du groupe, ou faites-le modifier par un autre administrateur.'
    : 'Consultation seule : vous ne disposez pas du droit de modifier les permissions d’un groupe.'

  return (
    <div className="space-y-4">
      {/* Synthèse */}
      <div className="rounded-control border border-line bg-adikom-50 px-4 py-3.5">
        <p className="text-sm text-ink">
          Ce groupe accorde <strong>{counts.allow}</strong> permission
          {counts.allow > 1 ? 's' : ''} sur {overview.total}
          {counts.deny > 0 && (
            <>
              {' '}
              et en refuse <strong>{counts.deny}</strong>
            </>
          )}
          {counts.sensitiveAllow > 0 && (
            <>
              {' '}
              — dont <strong>{counts.sensitiveAllow}</strong> sensible
              {counts.sensitiveAllow > 1 ? 's' : ''}
            </>
          )}
          .
        </p>
        <p className="mt-1.5 text-xs text-muted">
          {editable
            ? '« Non défini » laisse la question ouverte : un autre groupe ou une règle individuelle peut encore accorder le droit. « Refuser » ferme la porte pour tous les membres, y compris contre une autorisation individuelle.'
            : readOnlyReason}
        </p>
      </div>

      {!isActive && (
        <Notice tone="warning">
          Ce groupe est <strong>désactivé</strong> : aucune de ces règles ne s’applique
          actuellement à ses membres. Elles reprendront effet dès sa réactivation.
        </Notice>
      )}

      {isActive && memberCount !== null && memberCount > 0 && (
        <Notice tone="info">
          {memberCount} utilisateur{memberCount > 1 ? 's' : ''} héritent de ces permissions. Toute
          modification prend effet à leur prochaine vérification de droits.
        </Notice>
      )}

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <Notice tone="success">{state.success}</Notice>}

      {editable && counts.dirty > 0 && (
        <p className="flex items-start gap-2 rounded-control border border-warning-soft bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Les compteurs ci-dessous reflètent vos choix en cours. Ils ne prendront effet qu’après
          enregistrement.
        </p>
      )}

      {editable ? (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="groupId" value={groupId} />
          {tree}
          <SaveBar dirty={counts.dirty} label={`Enregistrer les permissions de « ${groupName} »`} />
        </form>
      ) : (
        tree
      )}
    </div>
  )
}
