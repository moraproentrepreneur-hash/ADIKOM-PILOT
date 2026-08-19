import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * Client Supabase pour les Server Components, Server Actions et Route Handlers.
 *
 * Agit sous l'identité de l'utilisateur connecté : les policies RLS s'appliquent.
 * C'est volontaire — la base constitue la seconde barrière de sécurité (DEC-011).
 *
 * Next.js 16 : `cookies()` est asynchrone.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Appel depuis un Server Component : l'écriture de cookies y est
            // interdite. Le rafraîchissement de session est assuré par proxy.ts,
            // cette exception peut donc être ignorée sans risque.
          }
        },
      },
    }
  )
}
