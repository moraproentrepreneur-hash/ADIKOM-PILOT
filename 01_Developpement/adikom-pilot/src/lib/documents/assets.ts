import 'server-only'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Font } from '@react-pdf/renderer'

import { DOC_FONTS } from './theme'

/**
 * Polices et logo du moteur documentaire.
 *
 * Les fichiers sont lus depuis le disque et non téléchargés : un PDF ne doit
 * pas dépendre d'un service extérieur au moment où un utilisateur clique. Leur
 * embarquement dans la fonction serverless est déclaré dans `next.config.ts`.
 *
 * L'enregistrement des polices est global à `@react-pdf/renderer` et ne doit
 * avoir lieu qu'une fois par processus — d'où le drapeau.
 */

const FONTS_DIR = join(process.cwd(), 'src', 'lib', 'documents', 'fonts')
const ASSETS_DIR = join(process.cwd(), 'src', 'lib', 'documents', 'assets')

let registered = false

export function registerDocumentFonts(): void {
  if (registered) return

  Font.register({
    family: DOC_FONTS.display,
    fonts: [
      { src: join(FONTS_DIR, 'Montserrat-SemiBold.ttf'), fontWeight: 600 },
      { src: join(FONTS_DIR, 'Montserrat-Bold.ttf'), fontWeight: 700 },
    ],
  })

  Font.register({
    family: DOC_FONTS.body,
    fonts: [
      { src: join(FONTS_DIR, 'Inter-Regular.ttf'), fontWeight: 400 },
      { src: join(FONTS_DIR, 'Inter-Medium.ttf'), fontWeight: 500 },
    ],
  })

  /*
   * Sans cela, une chaîne longue sans espace — un email, une référence — sort
   * de la colonne au lieu d'aller à la ligne. La coupure automatique de mots
   * est désactivée : couper « fournisseur » en « fournis- seur » dans un
   * document commercial fait négligé.
   */
  Font.registerHyphenationCallback((word) => [word])

  registered = true
}

/**
 * Logo officiel, en mémoire.
 *
 * Version réduite du fichier officiel : mêmes proportions, mêmes couleurs,
 * simplement redimensionnée pour l'impression. Le logo n'est ni recréé, ni
 * recoloré, ni déformé (CLAUDE.md §33, Design System §69).
 */
let logoCache: Buffer | null = null

export function getDocumentLogo(): Buffer {
  if (!logoCache) {
    logoCache = readFileSync(join(ASSETS_DIR, 'adikom-logo.png'))
  }
  return logoCache
}
