import { NextResponse } from 'next/server'

import { can, getCurrentUser } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Ouverture d'un justificatif d'imputation.
 *
 * Même chemin de passage que les photos d'état des lieux, les photos
 * d'incident, les documents de véhicule et les justificatifs de maintenance —
 * aucun second système de fichiers. Le bucket reste PRIVÉ et sans policy : le
 * navigateur ne peut pas lire un objet, même en connaissant son chemin.
 *
 * La capacité exigée est `billing.imputations.view` : la pièce qui fonde une
 * déduction se consulte avec le droit de consulter les imputations — pas avec
 * celui de consulter les coûts de maintenance, ni celui de voir l'intervention.
 *
 * Aucune URL permanente n'est stockée ni renvoyée (DEC-025 §f).
 */

const SIGNED_URL_TTL_SECONDS = 60

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  if (!user.isSuperAdmin && !(await can(PERMISSIONS.IMPUTATIONS_VIEW))) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
  }

  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('imputation_documents')
    .select('storage_path, is_archived')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error(`[imputation] lecture justificatif : ${error.code ?? 'ERREUR'} ${error.message}`)
    return NextResponse.json({ error: 'Le justificatif n’a pas pu être ouvert.' }, { status: 500 })
  }

  // Inexistant, retiré, ou invisible pour ce compte : même réponse dans tous
  // les cas, afin de ne pas révéler l'existence d'une donnée inaccessible.
  if (!data?.storage_path || data.is_archived) {
    return NextResponse.json({ error: 'Justificatif introuvable.' }, { status: 404 })
  }

  const admin = createSupabaseAdminClient()
  const { data: signed, error: signError } = await admin.storage
    .from('vehicle-documents')
    .createSignedUrl(data.storage_path, SIGNED_URL_TTL_SECONDS)

  if (signError || !signed) {
    console.error(`[imputation] signature : ${signError?.message ?? 'inconnue'}`)
    return NextResponse.json({ error: 'Le justificatif n’a pas pu être ouvert.' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
