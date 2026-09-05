'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Power, Trash2 } from 'lucide-react'

import { Notice } from '@/components/ui/feedback'
import { deleteGroupAction, setGroupActiveAction } from './actions'

/**
 * Activation et suppression d'un groupe — Module 08 §52, CLAUDE.md §22.
 *
 * Les deux actes relèvent de la même capacité, `users.groups.archive`, parce
 * que le catalogue les nomme ensemble : « Supprimer / désactiver un groupe ».
 * Ils n'ont pourtant pas la même portée, et l'écran ne les présente pas de la
 * même façon.
 *
 * LA DÉSACTIVATION EST L'ISSUE NORMALE : elle suspend l'effet des permissions
 * du groupe sans rien perdre de sa configuration, et se rétablit d'un geste.
 *
 * LA SUPPRESSION EST DÉFINITIVE, et la base la refuse tant que le groupe compte
 * un membre ou qu'il est fourni avec le système (`fn_protect_group_deletion`).
 * Le bouton n'est donc proposé que lorsqu'elle a une chance d'aboutir — et son
 * refus, s'il survient, est affiché tel que la base l'exprime.
 */

function ActionButton({
  label,
  pendingLabel,
  tone,
  icon: Icon,
}: {
  label: string
  pendingLabel: string
  tone: 'neutral' | 'danger'
  icon: typeof Power
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        tone === 'danger'
          ? 'inline-flex items-center justify-center gap-2 rounded-control border border-danger-soft bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
          : 'inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500 disabled:cursor-not-allowed disabled:opacity-60'
      }
    >
      <Icon className="size-4" aria-hidden />
      {pending ? pendingLabel : label}
    </button>
  )
}

export function GroupLifecycleForm({
  groupId,
  isActive,
  isSystem,
  memberCount,
}: {
  groupId: string
  isActive: boolean
  isSystem: boolean
  /** `null` : le décompte n'a pas pu être établi ; la suppression n'est pas proposée. */
  memberCount: number | null
}) {
  const [activeState, activeAction] = useActionState(setGroupActiveAction, {})
  const [deleteState, deleteAction] = useActionState(deleteGroupAction, {})
  const [confirming, setConfirming] = useState(false)

  const deletable = !isSystem && memberCount === 0

  return (
    <div className="space-y-4">
      {activeState.error && <Notice tone="error">{activeState.error}</Notice>}
      {activeState.success && <Notice tone="success">{activeState.success}</Notice>}
      {deleteState.error && <Notice tone="error">{deleteState.error}</Notice>}

      <form action={activeAction}>
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="active" value={isActive ? '0' : '1'} />
        <p className="mb-3 text-sm text-muted">
          {isActive
            ? 'Désactiver le groupe suspend l’effet de ses permissions pour tous ses membres. Sa configuration est conservée.'
            : 'Ce groupe est désactivé : ses permissions ne s’appliquent pas. Le réactiver les rétablit telles quelles.'}
        </p>
        <ActionButton
          label={isActive ? 'Désactiver le groupe' : 'Réactiver le groupe'}
          pendingLabel="Enregistrement…"
          tone="neutral"
          icon={Power}
        />
      </form>

      <div className="border-t border-line pt-4">
        {isSystem ? (
          <p className="text-sm text-muted">
            Ce groupe est fourni avec le système : il ne peut pas être supprimé. Désactivez-le si
            vous ne souhaitez plus l’utiliser.
          </p>
        ) : memberCount === null ? (
          <p className="text-sm text-muted">
            La suppression n’est pas proposée : le nombre de membres de ce groupe n’a pas pu être
            établi, et supprimer un groupe encore utilisé serait refusé.
          </p>
        ) : !deletable ? (
          <p className="text-sm text-muted">
            Ce groupe compte {memberCount} utilisateur{memberCount > 1 ? 's' : ''} : il ne peut pas
            être supprimé. Retirez ses membres, ou désactivez-le.
          </p>
        ) : confirming ? (
          <form action={deleteAction} className="space-y-3">
            <input type="hidden" name="groupId" value={groupId} />
            <p className="text-sm text-danger">
              Supprimer définitivement ce groupe ? Ses permissions seront perdues. Cette action est
              irréversible — la désactivation, elle, se rétablit.
            </p>
            <div className="flex flex-wrap gap-3">
              <ActionButton
                label="Confirmer la suppression"
                pendingLabel="Suppression…"
                tone="danger"
                icon={Trash2}
              />
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
              >
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              Ce groupe ne compte aucun membre : il peut être supprimé définitivement.
            </p>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center justify-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:border-danger-soft hover:bg-danger-soft"
            >
              <Trash2 className="size-4" aria-hidden />
              Supprimer le groupe
            </button>
          </>
        )}
      </div>
    </div>
  )
}
