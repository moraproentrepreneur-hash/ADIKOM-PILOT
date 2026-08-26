import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from './permissions'

/**
 * Cohérence entre le catalogue SQL et les constantes TypeScript.
 *
 * Un code présent d'un seul côté est une panne silencieuse :
 *   · code en TS mais absent du catalogue → has_permission() renvoie toujours
 *     false, l'action est refusée sans explication ;
 *   · code en base mais absent du TS → permission jamais vérifiée par le code
 *     applicatif, donc jamais appliquée.
 *
 * Ce test lit les migrations du catalogue et compare les deux ensembles.
 *
 * TOUTES les migrations qui alimentent `public.permissions` sont parcourues, et
 * non un fichier nommé en dur : DEC-024 impose qu'une nouvelle capacité
 * s'accompagne d'une nouvelle permission, donc de nouvelles migrations. Figer
 * un seul fichier ferait passer ce contrôle à côté de tout ce qui vient après.
 */

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../supabase/migrations')

/**
 * Rejoue les migrations pour reconstituer le catalogue.
 *
 * La lecture démarre à la liste de colonnes `(code, module_code` — celle de la
 * CTE des permissions — afin d'ignorer les listes de modules et de menus qui la
 * précèdent et dont les valeurs ont exactement la même forme.
 *
 * LES MIGRATIONS NE SONT PAS QU'ADDITIVES.
 *
 * Une capacité peut être retirée : le 26/08/2026, deux permissions déclarées
 * par la migration 032 se sont révélées sans fonctionnalité correspondante
 * (CLAUDE.md §19 bis). Les fichiers étant rejoués dans l'ordre, un retrait
 * annoncé par `-- CATALOGUE: RETRAIT <code>` défait l'insertion qui le
 * précède — exactement comme la base l'a fait.
 *
 * Le retrait est ANNONCÉ plutôt que déduit d'un `delete`, dont la forme
 * (tableau, `in (…)`, sous-requête) varierait d'une migration à l'autre et
 * demanderait à ce lecteur d'interpréter du SQL. Une déclaration ne se
 * trompe pas.
 */
function readCatalogCodes(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  const codes: string[] = []

  for (const name of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8')
    if (!sql.includes('public.permissions')) continue

    const start = sql.indexOf('(code, module_code')
    if (start !== -1) {
      for (const match of sql.slice(start).matchAll(/^\s*\('([a-z0-9_.]+)',/gm)) {
        codes.push(match[1])
      }
    }

    for (const match of sql.matchAll(/^--\s*CATALOGUE:\s*RETRAIT\s+([a-z0-9_.]+)\s*$/gm)) {
      const removed = codes.indexOf(match[1])
      expect(
        removed,
        `La migration ${name} retire ${match[1]}, qu'aucune migration n'avait déclarée.`
      ).toBeGreaterThan(-1)
      codes.splice(removed, 1)
    }
  }

  expect(codes.length, 'Aucun catalogue de permissions trouvé dans les migrations.').toBeGreaterThan(0)

  return codes
}

describe('catalogue des permissions', () => {
  const catalogCodes = readCatalogCodes()
  const tsCodes = Object.values(PERMISSIONS) as string[]

  it('la migration déclare un catalogue non vide', () => {
    expect(catalogCodes.length).toBeGreaterThan(100)
  })

  it('ne contient aucun doublon en base', () => {
    const duplicates = catalogCodes.filter(
      (code, index) => catalogCodes.indexOf(code) !== index
    )
    expect(duplicates, `Codes dupliqués : ${duplicates.join(', ')}`).toEqual([])
  })

  it('ne contient aucun doublon côté TypeScript', () => {
    const duplicates = tsCodes.filter((code, index) => tsCodes.indexOf(code) !== index)
    expect(duplicates, `Codes dupliqués : ${duplicates.join(', ')}`).toEqual([])
  })

  it('chaque code TypeScript existe dans le catalogue SQL', () => {
    const catalog = new Set(catalogCodes)
    const missing = tsCodes.filter((code) => !catalog.has(code))
    expect(
      missing,
      `Ces codes provoqueraient un refus silencieux : ${missing.join(', ')}`
    ).toEqual([])
  })

  it('chaque code du catalogue SQL est exposé en TypeScript', () => {
    const declared = new Set(tsCodes)
    const missing = catalogCodes.filter((code) => !declared.has(code))
    expect(
      missing,
      `Ces permissions ne seraient jamais vérifiées : ${missing.join(', ')}`
    ).toEqual([])
  })

  /**
   * Une capacité retirée ne revient pas par la petite porte.
   *
   * `rental.reservations.download` et `.print` n'ont jamais eu de document à
   * produire : une réservation n'est pas une pièce remise au client. Les
   * réintroduire — dans une migration ou dans les constantes — rendrait de
   * nouveau attribuable un droit qui ne débloque rien.
   *
   * Le contrôle porte sur les DEUX côtés : le catalogue reconstitué et le
   * TypeScript. Les deux tests de parité ci-dessus ne le remplaceraient pas —
   * ils passeraient très bien si ces codes revenaient des deux côtés à la fois.
   */
  it('ne réintroduit pas les capacités documentaires sans objet', () => {
    const retirees = ['rental.reservations.download', 'rental.reservations.print']

    expect(retirees.filter((code) => catalogCodes.includes(code))).toEqual([])
    expect(retirees.filter((code) => tsCodes.includes(code))).toEqual([])
  })

  it('respecte la convention de nommage module.menu[.sousmenu].action', () => {
    const invalid = catalogCodes.filter((code) => !/^[a-z0-9_]+(\.[a-z0-9_]+){1,3}$/.test(code))
    expect(invalid, `Codes non conformes : ${invalid.join(', ')}`).toEqual([])
  })
})
