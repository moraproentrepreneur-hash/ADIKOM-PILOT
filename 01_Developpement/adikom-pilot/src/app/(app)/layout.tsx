import { cookies } from 'next/headers'

import { Sidebar } from '@/components/layout/sidebar'
import { getPermissionCodes, requireUser } from '@/lib/auth/dal'
import { countUnreadNotifications } from '@/features/notifications/data'

/**
 * Enveloppe des routes applicatives.
 *
 * `requireUser()` constitue la garde serveur : aucune page de ce groupe ne
 * s'affiche sans session valide et sans compte actif. Le proxy effectue déjà un
 * premier filtrage, mais ne fait pas foi — la vérification est refaite ici
 * (05_Regles_Metier/05_Permissions.md §85).
 *
 * Next.js 16 : `cookies()` est asynchrone.
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requireUser()
  const granted = await getPermissionCodes()

  const cookieStore = await cookies()
  const collapsed = cookieStore.get('adikom-sidebar')?.value === 'collapsed'

  /*
   * Le compteur de notifications non lues (Module 02 §17).
   *
   * Il est porté par le gabarit, donc par TOUTES les pages : c'est pourquoi sa
   * lecture ne peut jamais faire échouer un écran. Sans la capacité, ou en cas
   * d'échec, elle rend `null` et aucune pastille ne s'affiche — l'absence de
   * pastille ne prétend pas qu'il n'y a rien, elle ne prétend rien du tout.
   */
  const unread = await countUnreadNotifications()

  return (
    /*
     * Sur desktop, l'enveloppe occupe exactement la hauteur de la fenêtre et ne
     * défile pas : chaque colonne porte son propre conteneur de défilement. La
     * barre latérale reste donc stable pendant que le contenu défile, et
     * inversement.
     *
     * Sur mobile, la barre latérale est un panneau superposé : la page conserve
     * son défilement naturel, sans hauteur imposée.
     */
    <div className="flex min-h-screen flex-col bg-canvas lg:fixed lg:inset-0 lg:min-h-0 lg:flex-row lg:overflow-hidden">
      <Sidebar
        grantedCodes={[...granted]}
        isSuperAdmin={user.isSuperAdmin}
        initiallyCollapsed={collapsed}
        user={{
          fullName: user.fullName,
          jobTitle: user.jobTitle,
          email: user.email,
        }}
        badges={unread === null ? undefined : { '/notifications': unread }}
      />

      <main className="min-w-0 flex-1 lg:overflow-x-hidden lg:overflow-y-auto">
        <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  )
}
