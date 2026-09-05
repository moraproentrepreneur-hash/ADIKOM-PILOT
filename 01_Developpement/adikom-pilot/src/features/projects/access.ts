import 'server-only'

import { can } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import type { ModuleAccess } from './tabs'

/**
 * Les six lectures du module, en une fois.
 *
 * Chaque écran de Projets & Planification affiche les onglets des autres, et
 * ne doit proposer que ceux qui s'ouvriront. Recopier six appels à `can()` dans
 * sept pages ferait sept endroits à corriger au prochain écran (CLAUDE.md §37).
 *
 * `getPermissionCodes` est mémorisé pour la durée de la requête : ces six
 * appels ne produisent qu'une seule lecture en base. Et le Super Admin les
 * obtient toutes — `effective_permissions` lui rend le catalogue entier.
 *
 * CE N'EST PAS UNE PROTECTION. Chaque page réexige sa capacité, chaque action
 * la sienne, et RLS refuse de toute façon ce qui n'est pas ouvert.
 */
export async function moduleAccess(): Promise<ModuleAccess> {
  const [projects, tasks, meetings, appointments, actions, decisions] = await Promise.all([
    can(PERMISSIONS.PROJECTS_VIEW),
    can(PERMISSIONS.TASKS_VIEW),
    can(PERMISSIONS.MEETINGS_VIEW),
    can(PERMISSIONS.APPOINTMENTS_VIEW),
    can(PERMISSIONS.ACTIONS_VIEW),
    can(PERMISSIONS.DECISIONS_VIEW),
  ])

  return { projects, tasks, meetings, appointments, actions, decisions }
}
