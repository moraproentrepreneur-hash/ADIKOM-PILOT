'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, readText } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'

/**
 * Marquer comme lu — Module 02 §19, §20.
 *
 * CES DEUX ACTIONS NE TOUCHENT AUCUNE DONNÉE MÉTIER.
 *
 * §20 : « cette action doit uniquement modifier l'état de lecture ; elle ne doit
 * pas supprimer les notifications ». Elle ne peut rien supprimer : il n'existe
 * aucune notification stockée. Ce qui s'écrit est une ligne dans
 * `notification_reads` — qui a lu quoi, et quand.
 *
 * UNE SEULE CAPACITÉ, ET C'EST VOULU
 *
 * Le catalogue porte `notifications.view` — « Consulter ses notifications » — et
 * rien d'autre. Tenir l'état de lecture DE SES PROPRES notifications est
 * inhérent à leur consultation : §19 l'exige de tout utilisateur qui les lit.
 * En créer une seconde serait en créer une d'office, ce que DEC-024 interdit.
 *
 * LE SERVEUR RESTE MAÎTRE
 *
 * `requirePermission` refuse ici, `require_capability` refuse en base, et la
 * fonction n'accepte que les clés de la PROPRE veille de l'appelant : une clé
 * inventée, ou celle d'une notification qu'il n'a pas le droit de voir, ne
 * produit aucune ligne (migration 056).
 */

export type NotificationActionState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /Droit insuffisant pour cette opération/i,
    'Vous ne disposez pas de la capacité requise pour consulter vos notifications.',
  ],
  [
    /Aucune session applicative/i,
    'Votre session a expiré. Reconnectez-vous puis réessayez.',
  ],
]

/* -------------------------------------------------------------------------- */
/*  Une notification — §19                                                     */
/* -------------------------------------------------------------------------- */

export async function markNotificationReadAction(
  prevState: NotificationActionState,
  formData: FormData
): Promise<NotificationActionState> {
  return guarded(
    'notification:marquer lue',
    async () => {
      await requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)

      const key = readText(formData, 'cle')
      if (!key) return { error: 'Notification introuvable.' }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('notification_mark_read', { p_keys: [key] })
      if (error) throw new Error(error.message)

      revalidatePath('/notifications')
      revalidatePath('/tableau-de-bord')

      return { success: 'Notification marquée comme lue.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Toutes les notifications — §20                                             */
/* -------------------------------------------------------------------------- */

/**
 * Un seul paramètre : cette action n'a rien à lire dans le formulaire.
 *
 * `useActionState` transmet bien `(état, FormData)` ; une fonction qui ignore le
 * second argument reste assignable — et déclarer un paramètre inutilisé
 * laisserait croire qu'il porte quelque chose.
 */
export async function markAllNotificationsReadAction(
  /*
   * L'état précédent est imposé par `useActionState`, qui le transmet toujours.
   * Il n'est pas lu : cette action ne dépend de rien d'antérieur. Déclarer à sa
   * suite un `FormData` inutilisé laisserait croire que le formulaire porte
   * quelque chose — il ne porte rien.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: NotificationActionState
): Promise<NotificationActionState> {
  return guarded(
    'notifications:tout marquer lu',
    async () => {
      await requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)

      const supabase = await createSupabaseServerClient()
      const { data, error } = await supabase.rpc('notification_mark_all_read')
      if (error) throw new Error(error.message)

      revalidatePath('/notifications')
      revalidatePath('/tableau-de-bord')

      const count = Number(data ?? 0)

      return {
        success:
          count === 0
            ? 'Aucune notification non lue.'
            : `${count} notification${count > 1 ? 's' : ''} marquée${count > 1 ? 's' : ''} comme lue${count > 1 ? 's' : ''}.`,
      }
    },
    ERROR_PATTERNS
  )
}
