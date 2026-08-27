import { NextResponse } from 'next/server'

import { can, getCurrentUser } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Ouverture d'une photo d'incident.
 *
 * Même chemin de passage que les photos d'état des lieux et les documents de
 * véhicule, même bucket privé sans policy : le navigateur ne peut pas lire un
 * objet, même en connaissant son chemin. La photo n'est accessible que par
 * ici, qui :
 *
 *   1. exige une session — le proxy applicatif l'impose déjà ;
 *   2. vérifie `rental.incidents.view` : une photo d'incident appartient au
 *      constat, et se consulte avec lui ;
 *   3. relit la ligne avec la session de l'appelant, donc sous RLS ;
 *   4. délivre une URL signée d'une minute, et redirige vers elle.
 *
 * Aucune URL permanente n'est stockée ni renvoyée (DEC-025 §f).
 */

const SIGNED_URL_TTL_SECONDS = 60

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  if (!user.isSuperAdmin && !(await can(PERMISSIONS.INCIDENTS_VIEW))) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
  }

  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('incident_photos')
    .select('storage_path, is_archived')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error(`[incidents] lecture photo : ${error.code ?? 'ERREUR'} ${error.message}`)
    return NextResponse.json({ error: 'La photo n’a pas pu être ouverte.' }, { status: 500 })
  }

  // Photo inexistante, retirée, ou invisible pour ce compte : même réponse dans
  // tous les cas, afin de ne pas révéler l'existence d'une donnée inaccessible.
  if (!data?.storage_path || data.is_archived) {
    return NextResponse.json({ error: 'Photo introuvable.' }, { status: 404 })
  }

  const admin = createSupabaseAdminClient()
  const { data: signed, error: signError } = await admin.storage
    .from('vehicle-documents')
    .createSignedUrl(data.storage_path, SIGNED_URL_TTL_SECONDS)

  if (signError || !signed) {
    console.error(`[incidents] signature : ${signError?.message ?? 'inconnue'}`)
    return NextResponse.json({ error: 'La photo n’a pas pu être ouverte.' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
