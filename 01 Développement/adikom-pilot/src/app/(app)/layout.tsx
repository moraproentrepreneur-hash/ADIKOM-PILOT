import { cookies } from 'next/headers'

import { Sidebar } from '@/components/layout/sidebar'
import { getPermissionCodes, requireUser } from '@/lib/auth/dal'

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

  return (
    <div className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      <Sidebar
        grantedCodes={[...granted]}
        isSuperAdmin={user.isSuperAdmin}
        initiallyCollapsed={collapsed}
        user={{
          fullName: user.fullName,
          jobTitle: user.jobTitle,
          email: user.email,
        }}
      />

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  )
}
