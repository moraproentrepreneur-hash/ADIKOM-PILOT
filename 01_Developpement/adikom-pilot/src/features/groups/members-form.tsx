'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Search, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/primitives'
import { Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/feedback'
import { STATUS_LABELS, STATUS_TONES, type UserStatus } from '@/features/users/constants'
import { updateGroupMembersAction } from './actions'
import type { AssignableUser } from './data'

/**
 * Membres d'un groupe — Module 08 §30.
 *
 * Cocher quelqu'un ici lui donne les permissions du groupe : l'acte modifie SES
 * droits, et relève donc de `users.users.permissions.update`, la capacité que
 * la policy `user_groups_write` réclame déjà.
 *
 * L'APPELANT NE FIGURE PAS DANS LA LISTE MODIFIABLE. Le déclencheur
 * `user_groups_no_self_change` refuse en base qu'un utilisateur s'ajoute ou se
 * retire lui-même ; proposer la case reviendrait à préparer un échec. Sa ligne
 * reste affichée, marquée comme non modifiable — la masquer laisserait croire
 * qu'il n'est pas membre.
 */
export function MembersForm({
  groupId,
  users,
  memberIds,
  actorId,
}: {
  groupId: string
  users: AssignableUser[]
  memberIds: string[]
  actorId: string
}) {
  const [state, formAction] = useActionState(updateGroupMembersAction, {})
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(memberIds))

  const baseline = useMemo(() => new Set(memberIds), [memberIds])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return users
    return users.filter(
      (user) =>
        user.fullName.toLowerCase().includes(term) ||
        user.username.toLowerCase().includes(term) ||
        (user.jobTitle ?? '').toLowerCase().includes(term)
    )
  }, [users, search])

  const dirty = useMemo(() => {
    let count = 0
    for (const user of users) {
      if (user.id === actorId) continue
      if (selected.has(user.id) !== baseline.has(user.id)) count += 1
    }
    return count
  }, [users, selected, baseline, actorId])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="groupId" value={groupId} />

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <Notice tone="success">{state.success}</Notice>}

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        {/* `recherche` n'est lu par aucune action : le filtre reste local. */}
        <Input
          name="recherche"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un collaborateur…"
          aria-label="Rechercher un collaborateur"
          className="pl-9"
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-control border border-line bg-canvas px-3.5 py-3 text-sm text-muted">
          Aucun collaborateur ne correspond à cette recherche.
        </p>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {visible.map((user) => {
            const isSelf = user.id === actorId
            const checked = selected.has(user.id)

            return (
              <li key={user.id}>
                <label
                  className={`flex items-start gap-2.5 rounded-control border px-3.5 py-2.5 transition-colors ${
                    isSelf
                      ? 'cursor-not-allowed border-line bg-canvas'
                      : 'cursor-pointer border-line hover:border-adikom-300 hover:bg-adikom-50/50 has-checked:border-adikom-400 has-checked:bg-adikom-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="memberIds"
                    value={user.id}
                    checked={checked}
                    disabled={isSelf}
                    onChange={() => toggle(user.id)}
                    className="mt-0.5 size-4 shrink-0 accent-adikom-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{user.fullName}</span>
                    <span className="block text-xs text-muted">
                      {user.username}
                      {user.jobTitle && ` · ${user.jobTitle}`}
                    </span>
                    {isSelf && (
                      <span className="mt-1 block text-xs text-muted">
                        Votre propre compte : nul ne modifie son appartenance à un groupe.
                      </span>
                    )}
                  </span>
                  {user.status !== 'ACTIVE' && (
                    <Badge tone={STATUS_TONES[user.status as UserStatus]}>
                      {STATUS_LABELS[user.status as UserStatus]}
                    </Badge>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {/* Un compte hors de la recherche courante resterait décoché à l'envoi :
          les sélections masquées sont donc réémises en champs cachés. */}
      {[...selected]
        .filter((id) => id !== actorId && !visible.some((user) => user.id === id))
        .map((id) => (
          <input key={id} type="hidden" name="memberIds" value={id} />
        ))}

      <SaveMembers dirty={dirty} />
    </form>
  )
}

function SaveMembers({ dirty }: { dirty: number }) {
  const { pending } = useFormStatus()

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <p className="text-xs text-muted">
        {dirty === 0
          ? 'Aucune modification en attente.'
          : `${dirty} modification${dirty > 1 ? 's' : ''} en attente d’enregistrement.`}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Enregistrement…' : 'Enregistrer les membres'}
      </button>
    </div>
  )
}

/** Icône du Super Admin, réutilisée par la liste en lecture seule. */
export function SuperAdminMark() {
  return <ShieldCheck className="size-3.5 text-adikom-500" aria-label="Super Admin" />
}
