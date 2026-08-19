'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Client Supabase pour le navigateur.
 *
 * Utilise exclusivement la clé publique. Toute donnée qu'il peut lire est
 * gouvernée par les policies RLS : aucune information sensible ne doit
 * dépendre du seul masquage d'interface
 * (05_Regles_Metier/05_Permissions.md §50 et §85).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
