import 'server-only'

import type { ReactElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'

import { DISPLAY_TIMEZONE } from '@/lib/dates'

/**
 * Production du PDF.
 *
 * Un seul artefact est produit, puis servi tel quel pour l'aperçu, le
 * téléchargement et l'impression. C'est ce qui rend impossible qu'un écran
 * montre autre chose que ce qui sort de l'imprimante.
 */

export type DocumentMode = 'preview' | 'download' | 'print'

export async function renderDocument(element: ReactElement<DocumentProps>): Promise<Buffer> {
  return renderToBuffer(element)
}

/** Date d'édition affichée dans l'en-tête, sur le fuseau retenu (DEC-014). */
export function issuedOnLabel(date = new Date()): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: DISPLAY_TIMEZONE,
  }).format(date)
}

/**
 * Nom de fichier explicite : le destinataire doit reconnaître le document sans
 * l'ouvrir. `ADIKOM_Fiche-client_CLI-000008_20260822.pdf`
 */
export function documentFileName(kind: string, reference: string | null): string {
  const stamp = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: DISPLAY_TIMEZONE,
  })
    .format(new Date())
    .replaceAll('-', '')

  const safe = (value: string) => value.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  const parts = ['ADIKOM', safe(kind), reference ? safe(reference) : null, stamp].filter(Boolean)

  return `${parts.join('_')}.pdf`
}

/**
 * En-têtes HTTP du document.
 *
 * `inline` sert l'aperçu et l'impression — le document s'affiche dans le
 * visualiseur ; `attachment` déclenche l'enregistrement. Le fichier est
 * identique dans les deux cas : seule la disposition change.
 */
export function documentHeaders(fileName: string, mode: DocumentMode): HeadersInit {
  const disposition = mode === 'download' ? 'attachment' : 'inline'

  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${disposition}; filename="${fileName}"`,
    // Un document porte des données métier : il ne doit être conservé ni par un
    // cache partagé, ni par un intermédiaire.
    'Cache-Control': 'private, no-store, max-age=0',
  }
}
