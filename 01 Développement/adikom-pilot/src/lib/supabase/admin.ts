import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * Client d'administration Supabase — CONTOURNE RLS.
 *
 * Réservé aux opérations que l'API utilisateur ne permet pas, essentiellement
 * la création de comptes d'authentification par le Super Admin
 * (03_Modules/08_Utilisateurs_et_Groupes.md §6 : pas d'auto-inscription).
 *
 * RÈGLES D'USAGE — non négociables :
 *   1. Jamais importé depuis un composant client. `server-only` le garantit
 *      à la compilation.
 *   2. Tout appel doit être précédé d'une vérification de permission explicite
 *      via `requirePermission()` : ce client ne contrôle rien par lui-même.
 *   3. La clé de service n'est jamais exposée au navigateur (CLAUDE.md §25).
 */
export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      "Configuration incomplète : SUPABASE_SERVICE_ROLE_KEY est absente de l'environnement serveur."
    )
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
