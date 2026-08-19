import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Proxy applicatif — Next.js 16.
 *
 * Remplace l'ancienne convention `middleware`. Le runtime est Node.js et n'est
 * pas configurable.
 *
 * Deux responsabilités, et deux seulement :
 *   1. rafraîchir la session Supabase à chaque requête ;
 *   2. barrer l'accès aux routes applicatives sans session.
 *
 * Ce fichier n'est PAS la frontière de sécurité. La documentation de Next.js
 * précise que le proxy peut être déployé en périphérie et ne doit pas porter la
 * logique métier. Le contrôle réel des permissions est assuré par la couche
 * d'accès aux données (`src/lib/auth/dal.ts`) et par les policies RLS
 * (05_Regles_Metier/05_Permissions.md §85 et §86).
 */

/** Routes accessibles sans session. Le SaaS reste strictement interne (DEC-003). */
const PUBLIC_PATHS = ['/', '/connexion', '/mentions-legales'] as const

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path)
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }

          response = NextResponse.next({ request })

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }

          // @supabase/ssr 0.12 fournit les en-têtes anti-cache à appliquer.
          // Sans eux, un CDN pourrait servir le jeton d'un utilisateur à un autre.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value)
          }
        },
      },
    }
  )

  // getUser() valide le jeton auprès de Supabase et rafraîchit la session.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Route applicative sans session : retour à la connexion, en mémorisant
  // la destination souhaitée.
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL('/connexion', request.url)
    if (pathname !== '/') {
      loginUrl.searchParams.set('suite', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  // Déjà connecté et sur l'écran de connexion : aller au tableau de bord.
  if (user && pathname === '/connexion') {
    return NextResponse.redirect(new URL('/tableau-de-bord', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf :
     *   - les fichiers statiques Next.js
     *   - l'optimisation d'images
     *   - le favicon et les ressources de marque
     *   - les fichiers portant une extension
     */
    '/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.[\\w]+$).*)',
  ],
}
