import { NextResponse } from 'next/server'

import { can, getCurrentUser } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Ouverture d'un document de véhicule.
 *
 * Le bucket est privé et ne porte aucune policy : le navigateur ne peut pas
 * lire un objet, même en connaissant son chemin (migration 019). Le fichier
 * n'est accessible que par ce point de passage, qui :
 *
 *   1. exige une session — le proxy applicatif l'impose déjà ;
 *   2. vérifie la permission de consultation des documents ;
 *   3. relit la fiche du document avec la session de l'appelant, donc sous RLS ;
 *   4. délivre une URL signée de courte durée, et redirige vers elle.
 *
 * L'URL signée expire en une minute : elle ne peut être ni partagée, ni mise en
 * favori, ni rejouée utilement.
 */

const SIGNED_URL_TTL_SECONDS = 60

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  if (!user.isSuperAdmin && !(await can(PERMISSIONS.VEHICLE_DOCUMENTS_VIEW))) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
  }

  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('vehicle_documents')
    .select('storage_path, file_name')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error(`[documents] lecture : ${error.code ?? 'ERREUR'} ${error.message}`)
    return NextResponse.json({ error: 'Le document n’a pas pu être ouvert.' }, { status: 500 })
  }

  // Document inexistant ou invisible pour cet utilisateur : même réponse dans
  // les deux cas, afin de ne pas révéler l'existence d'une donnée inaccessible
  // (DEC-017).
  if (!data?.storage_path) {
    return NextResponse.json({ error: 'Document introuvable.' }, { status: 404 })
  }

  const admin = createSupabaseAdminClient()
  const { data: signed, error: signError } = await admin.storage
    .from('vehicle-documents')
    .createSignedUrl(data.storage_path, SIGNED_URL_TTL_SECONDS)

  if (signError || !signed) {
    console.error(`[documents] signature : ${signError?.message ?? 'inconnue'}`)
    return NextResponse.json({ error: 'Le document n’a pas pu être ouvert.' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
