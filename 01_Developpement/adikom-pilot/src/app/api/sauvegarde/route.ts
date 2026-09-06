import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Téléchargement d'une sauvegarde JSON — Module 09, LOT 18.
 *
 * POURQUOI UNE ROUTE, ET NON UNE ACTION SERVEUR
 *
 * Le navigateur doit RECEVOIR UN FICHIER, avec son nom et sa date. Seule une
 * réponse HTTP portant `Content-Disposition` le permet ; une action serveur
 * renverrait une chaîne qu'il faudrait reconstruire côté client.
 *
 * DEUX BARRIÈRES, COMME AILLEURS
 *
 *   1. le statut de Super Admin, vérifié ici — aucune permission du catalogue
 *      ne gouverne cet acte, par décision (DEC-041) ;
 *   2. `admin_backup_export` revérifie le statut EN BASE, et son `EXECUTE` est
 *      retiré à `authenticated` : un appel direct avec un jeton d'utilisateur
 *      n'atteint pas la fonction.
 *
 * UN REFUS EST JOURNALISÉ. `Audit` §81.17 : une tentative refusée ne doit
 * jamais ressembler à une absence de tentative.
 *
 * CE QUE LE FICHIER CONTIENT — ET CE QU'IL NE CONTIENT PAS
 *
 * Les données métier des neuf modules, et la configuration de l'entreprise.
 * Aucun compte, aucune permission, aucun mot de passe, aucun jeton : ces
 * tables ne figurent pas au périmètre (`backup_scope`, migration 075). Le
 * fichier reste néanmoins CONFIDENTIEL — montants, coordonnées de règlement,
 * références bancaires —, et l'écran le dit à qui le télécharge.
 */

export async function GET() {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  if (!user.isSuperAdmin) {
    const supabase = await createSupabaseServerClient()
    await supabase.rpc('log_audit', {
      p_action: 'ACCESS_DENIED',
      p_entity_type: 'backup',
      p_module_code: 'settings',
      p_reason: 'Téléchargement d’une sauvegarde refusé — statut Super Admin requis.',
      p_result: 'DENIED',
    })

    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
  }

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('admin_backup_export', { p_actor_id: user.id })

  if (error || !data) {
    console.error(`[sauvegarde:export] ${error?.message ?? 'réponse vide'}`)
    return NextResponse.json(
      { error: 'La sauvegarde n’a pas pu être produite.' },
      { status: 500 }
    )
  }

  // Le jour d'ADIKOM, pas celui du serveur (DEC-025 §e).
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Comoro' })

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="adikom-pilot-sauvegarde-${day}.json"`,
      // Une sauvegarde ne se met jamais en cache : elle vaut pour l'instant où
      // elle est demandée, et pour lui seul.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
