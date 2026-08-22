import { NextResponse } from 'next/server'

import { can, getCurrentUser } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getExportDefinition } from '@/lib/exports/registry'
import { exportFileName, exportHeaders } from '@/lib/exports/workbook'

/**
 * Export Excel des listes.
 *
 * Point de passage unique, comme pour les documents : un seul contrôle
 * d'accès, une seule fabrique de classeur.
 *
 * DEUX BARRIÈRES, PAS UNE
 *
 *   1. la permission d'export du module, vérifiée ici — `view` n'autorise rien
 *      (DEC-024) — et le droit de consulter, exigé EN PLUS : on n'exporte pas
 *      ce qu'on n'a pas le droit de voir ;
 *   2. les données sont lues avec la SESSION de l'appelant, donc sous RLS.
 *
 * Un utilisateur ne peut donc pas contourner ses droits par l'export : sans la
 * permission, il n'obtient aucun fichier ; avec elle, il n'obtient que les
 * lignes que son écran lui montrerait.
 *
 * Les filtres de l'écran sont repris tels quels, afin que le fichier
 * corresponde à ce que l'utilisateur voit au moment où il l'exporte.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ module: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  const { module } = await params
  const definition = getExportDefinition(module)

  if (!definition) {
    return NextResponse.json({ error: 'Export inconnu.' }, { status: 404 })
  }

  const [mayView, mayExport] = await Promise.all([
    can(definition.viewPermission),
    can(definition.permission),
  ])

  if (!user.isSuperAdmin && !(mayView && mayExport)) {
    const supabase = await createSupabaseServerClient()
    await supabase.rpc('log_audit', {
      p_action: 'ACCESS_DENIED',
      p_entity_type: definition.entityType,
      p_module_code: definition.moduleCode,
      p_reason: `Export refusé — ${definition.title}`,
      p_result: 'DENIED',
    })

    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const filters: Record<string, string> = {}
  for (const [key, value] of url.searchParams.entries()) {
    if (value) filters[key] = value
  }

  let workbook: Buffer
  let rowCount = 0

  try {
    const data = await definition.build(filters)
    rowCount = data.rowCount

    workbook = await data.toWorkbook({ title: definition.title, subtitle: data.subtitle })
  } catch (error) {
    // Le journal serveur garde de quoi identifier la panne ; l'utilisateur
    // reçoit un message fonctionnel, sans détail interne (CLAUDE.md §43).
    const cause = error instanceof Error ? error : new Error(String(error))
    console.error(`[exports] ÉCHEC — module=${module} : ${cause.name}: ${cause.message}`)
    if (cause.stack) console.error(cause.stack)

    return NextResponse.json({ error: 'L’export n’a pas pu être produit.' }, { status: 500 })
  }

  // L'export fait sortir des données du système : il est journalisé. Le nombre
  // de lignes suffit à comprendre la portée — le contenu du fichier n'a rien à
  // faire dans le journal (Règles audit §79, §80).
  const supabase = await createSupabaseServerClient()
  await supabase.rpc('log_audit', {
    p_action: 'EXPORT',
    p_entity_type: definition.entityType,
    p_module_code: definition.moduleCode,
    p_reason: `Export Excel — ${definition.title} (${rowCount} ligne${rowCount > 1 ? 's' : ''})`,
  })

  return new NextResponse(new Uint8Array(workbook), {
    status: 200,
    headers: exportHeaders(exportFileName(definition.title)),
  })
}
