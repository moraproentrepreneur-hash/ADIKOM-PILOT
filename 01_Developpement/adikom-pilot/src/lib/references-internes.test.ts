import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AUCUNE RÉFÉRENCE DE DOCUMENTATION INTERNE DANS UN TEXTE VISIBLE.
 *
 * La documentation d'ADIKOM PILOT se cite par paragraphe — « §43 »,
 * « Workflow 08 », « DEC-013 ». Ces repères servent à CELUI QUI DÉVELOPPE. Un
 * utilisateur qui lit « DEC-013 : seule « Imputée » réduit un montant dû » ne
 * peut pas ouvrir DEC-013 : la référence ne l'informe pas, elle l'exclut.
 *
 * Le contenu pédagogique, lui, reste : c'est la RÉFÉRENCE qui part, pas la
 * phrase. « Seule une imputation « Imputée » réduit un montant dû » dit la même
 * règle, à quelqu'un qui n'a pas la documentation sous les yeux.
 *
 * POURQUOI UN TEST PLUTÔT QU'UNE RECETTE
 *
 * La recette de production lit le HTML servi : elle ne voit un texte que si la
 * page a été visitée, avec les capacités qui l'affichent, sur une donnée dans
 * le bon état. Trois conditions. C'est ainsi qu'une description de carte —
 * rendue seulement à qui peut régler une facture fournisseur — a survécu à un
 * balayage par les écrans. La source, elle, se lit en entier.
 *
 * CE QUI EST EXCUSÉ : les commentaires. Ils s'adressent au développeur et
 * DOIVENT citer la documentation — c'est là que la traçabilité vit (§53 de
 * CLAUDE.md). Un commentaire n'atteint jamais l'écran.
 */

const SRC = resolve(import.meta.dirname, '..')

/** Les formes sous lesquelles la documentation interne se cite. */
const REFERENCE =
  /§\s*\d+|\bWorkflow\s+\d+|\bModule\s+\d+|\bDEC-\d{3}\b|CLAUDE\.md|\bArbitrage\s+\d+|\b00 Documentation\b/

function sources(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...sources(path))
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

/**
 * Le motif se trouve-t-il dans un `/* ... *\/` ouvert plus haut ?
 *
 * On relit le fichier depuis son début jusqu'au motif en fermant chaque bloc
 * rencontré. Ce qui reste ouvert à l'arrivée est un commentaire. La méthode
 * ignore les chaînes de caractères, et penche donc du côté PRUDENT : elle peut
 * excuser à tort, jamais accuser à tort — un `/*` dans une chaîne est une
 * rareté, un apostrophe dans un texte français ne l'est pas.
 */
function insideBlockComment(text: string): boolean {
  let i = 0
  while (i < text.length) {
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      if (end === -1) return true
      i = end + 2
      continue
    }
    i += 1
  }
  return false
}

describe('références de documentation interne', () => {
  it('n’en laisse aucune dans un texte que l’utilisateur peut lire', () => {
    const visible: string[] = []

    for (const path of sources(SRC)) {
      const content = readFileSync(path, 'utf8')
      const lines = content.split('\n')
      let offset = 0

      for (const line of lines) {
        const match = REFERENCE.exec(line)
        if (match) {
          const trimmed = line.trimStart()
          const opensAsComment = /^(\*|\/\/|\/\*|\{\/\*)/.test(trimmed)
          const lineComment = line.slice(0, match.index).includes('//')

          if (!opensAsComment && !lineComment) {
            const upTo = content.slice(0, offset + match.index)
            if (!insideBlockComment(upTo)) {
              const relative = path.slice(SRC.length + 1).replace(/\\/g, '/')
              visible.push(`${relative} — « ${match[0]} » dans : ${line.trim()}`)
            }
          }
        }
        offset += line.length + 1
      }
    }

    expect(visible).toEqual([])
  })
})
