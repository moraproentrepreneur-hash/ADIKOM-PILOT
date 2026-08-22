import { NextResponse } from 'next/server'

import { can, getCurrentUser } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getDocumentDefinition } from '@/lib/documents/registry'
import {
  documentFileName,
  documentHeaders,
  renderDocument,
  type DocumentMode,
} from '@/lib/documents/render'

/**
 * Production des documents PDF.
 *
 * Point de passage unique : un seul contrôle d'accès, un seul rendu, un seul
 * fichier — servi tel quel pour l'aperçu, le téléchargement et l'impression.
 * C'est ce qui rend structurellement impossible qu'un aperçu diffère du PDF
 * téléchargé (exigence de fidélité du système documentaire).
 *
 * TROIS CAPACITÉS DISTINCTES — DEC-024
 *
 *   ?mode=download  exige `<module>.download`
 *   ?mode=print     exige `<module>.print`
 *   ?mode=preview   exige l'une OU l'autre
 *
 * Consulter la fiche n'autorise donc RIEN ici : un utilisateur ne disposant que
 * de `view` n'obtient aucun document, y compris en appelant cette route
 * directement. Masquer les boutons n'est qu'un confort
 * (05_Regles_Metier/05_Permissions.md §85).
 *
 * Seul le téléchargement est journalisé : il produit un fichier qui quitte le
 * système. L'aperçu et l'impression montrent ce que l'écran montre déjà, et les
 * inscrire noierait le journal (05_Regles_Metier/06_Audit.md §80). Les refus,
 * eux, sont tracés quel que soit le mode.
 */

function parseMode(value: string | null): DocumentMode {
  if (value === 'download' || value === 'print') return value
  return 'preview'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  const { type, id } = await params
  const definition = getDocumentDefinition(type)

  if (!definition) {
    return NextResponse.json({ error: 'Type de document inconnu.' }, { status: 404 })
  }

  const mode = parseMode(new URL(request.url).searchParams.get('mode'))

  const [mayDownload, mayPrint] = await Promise.all([
    can(definition.downloadPermission),
    can(definition.printPermission),
  ])

  const allowed =
    user.isSuperAdmin ||
    (mode === 'download' ? mayDownload : mode === 'print' ? mayPrint : mayDownload || mayPrint)

  if (!allowed) {
    // Un refus sur une capacité documentaire est un événement de sécurité :
    // il est tracé, sans détail technique (Règles audit §60, §61).
    const supabase = await createSupabaseServerClient()
    await supabase.rpc('log_audit', {
      p_action: 'ACCESS_DENIED',
      p_entity_type: definition.entityType,
      p_entity_id: id,
      p_module_code: definition.moduleCode,
      p_reason: `Document refusé — mode ${mode}`,
      p_result: 'DENIED',
    })

    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
  }

  let built
  try {
    built = await definition.build(id)
  } catch (error) {
    console.error(`[documents] ${type}/${id} : ${(error as Error).message}`)
    return NextResponse.json({ error: 'Le document n’a pas pu être produit.' }, { status: 500 })
  }

  // Enregistrement inexistant ou invisible pour ce lecteur : même réponse dans
  // les deux cas, afin de ne rien révéler d'une donnée inaccessible (DEC-017).
  if (!built) {
    return NextResponse.json({ error: 'Document introuvable.' }, { status: 404 })
  }

  let pdf: Buffer
  try {
    pdf = await renderDocument(built.element)
  } catch (error) {
    console.error(`[documents] rendu ${type}/${id} : ${(error as Error).message}`)
    return NextResponse.json({ error: 'Le document n’a pas pu être produit.' }, { status: 500 })
  }

  /*
   * Seul le TÉLÉCHARGEMENT est journalisé. L'aperçu et l'impression affichent
   * ce que l'écran montre déjà ; les inscrire noierait le journal sous des
   * événements sans valeur de contrôle (Règles audit §80). Le téléchargement,
   * lui, produit un fichier qui quitte le système.
   */
  if (mode === 'download') {
    const supabase = await createSupabaseServerClient()
    await supabase.rpc('log_audit', {
      p_action: 'EXPORT',
      p_entity_type: definition.entityType,
      p_entity_id: id,
      p_entity_label: built.reference,
      p_module_code: definition.moduleCode,
      p_reason: 'Téléchargement PDF',
    })
  }

  const fileName = documentFileName(built.label, built.reference)

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: documentHeaders(fileName, mode),
  })
}
