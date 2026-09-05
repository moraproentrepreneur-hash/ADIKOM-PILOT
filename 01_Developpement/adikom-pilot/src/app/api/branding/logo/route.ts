import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Ouverture du logo enregistré — Module 09 §39 (« aperçu »).
 *
 * Le bucket `branding` est privé et ne porte aucune policy : le navigateur ne
 * peut pas lire un objet, même en connaissant son chemin (migration 069). Ce
 * point de passage :
 *
 *   1. exige une session — le proxy applicatif l'impose déjà ;
 *   2. lit le chemin dans `company_profile`, la vue non sensible des
 *      paramètres ;
 *   3. délivre une URL signée de courte durée, et redirige vers elle.
 *
 * AUCUNE CAPACITÉ N'EST EXIGÉE AU-DELÀ DE LA SESSION, et c'est délibéré :
 * `logo_path` figure dans `company_profile`, lisible par tout compte
 * authentifié depuis la migration 027, parce que l'en-tête d'un document en a
 * besoin. Exiger ici `settings.company.view` créerait une frontière que la vue
 * ne pose pas — et l'écran d'un utilisateur ordinaire afficherait une image
 * cassée. Le logo d'une entreprise n'est pas une donnée sensible ; le stocker
 * en privé protège du grattage anonyme, pas des collaborateurs.
 */

const SIGNED_URL_TTL_SECONDS = 60

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('company_profile')
    .select('logo_path')
    .maybeSingle()

  if (error) {
    console.error(`[branding] lecture : ${error.code ?? 'ERREUR'} ${error.message}`)
    return NextResponse.json({ error: 'Le logo n’a pas pu être ouvert.' }, { status: 500 })
  }

  const path = (data as { logo_path: string | null } | null)?.logo_path
  if (!path) {
    return NextResponse.json({ error: 'Aucun logo enregistré.' }, { status: 404 })
  }

  const admin = createSupabaseAdminClient()
  const { data: signed, error: signError } = await admin.storage
    .from('branding')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (signError || !signed?.signedUrl) {
    console.error(`[branding] signature : ${signError?.message ?? 'aucune URL'}`)
    return NextResponse.json({ error: 'Le logo n’a pas pu être ouvert.' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
