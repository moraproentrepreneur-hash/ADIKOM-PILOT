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
   * Une capacité documentaire suppose un document — et elle en a un.
   *
   * `rental.reservations.download` et `.print` ont été RETIRÉES le 26/08/2026
   * (migration 037) avec ce motif : aucun document de réservation n'existait, et
   * une permission qui ne débloque rien ne doit pas être attribuable
   * (CLAUDE.md §19 bis). Un test veillait à ce qu'elles ne reviennent pas.
   *
   * ADIKOM a demandé cette pièce le 08/09/2026 (DEC-042 §c) : une confirmation
   * de réservation remise au client. Le motif du retrait est tombé avec le fait
   * qui le fondait, et la migration 078 les rétablit.
   *
   * LE TEST NE DISPARAÎT PAS, IL CHANGE D'OBJET.
   *
   * Ce qu'il gardait n'était pas « ces deux codes n'existent pas » mais « aucune
   * capacité documentaire n'est attribuable sans document ». C'est cela qu'il
   * vérifie désormais, pour TOUTES : chaque `.download` et chaque `.print` du
   * catalogue doit correspondre à une entrée du registre des documents.
   */
  it('chaque capacité documentaire correspond à un document réel', () => {
    const registry = readFileSync(
      resolve(import.meta.dirname, '../documents/registry.ts'),
      'utf8'
    )

    const documentaires = catalogCodes.filter(
      (code) => code.endsWith('.download') || code.endsWith('.print')
    )

    expect(documentaires.length).toBeGreaterThan(0)

    /*
     * Le registre désigne ses permissions par leur NOM de constante
     * (`PERMISSIONS.CLIENTS_DOWNLOAD`), jamais par leur code : c'est donc le nom
     * qu'il faut y chercher, retrouvé par lecture inverse du catalogue TS.
     */
    const nameOf = new Map(
      Object.entries(PERMISSIONS).map(([name, code]) => [code as string, name])
    )

    const orphelines = documentaires.filter((code) => {
      const name = nameOf.get(code)
      return !name || !registry.includes(`PERMISSIONS.${name}`)
    })

    expect(
      orphelines,
      `Ces capacités ne débloqueraient aucun document : ${orphelines.join(', ')}`
    ).toEqual([])
  })

  it('respecte la convention de nommage module.menu[.sousmenu].action', () => {
    const invalid = catalogCodes.filter((code) => !/^[a-z0-9_]+(\.[a-z0-9_]+){1,3}$/.test(code))
    expect(invalid, `Codes non conformes : ${invalid.join(', ')}`).toEqual([])
  })

  /**
   * LE TOTAL DU CATALOGUE N'EST AFFIRMÉ QUE DANS UNE MIGRATION — DEC-046.
   *
   * Il l'était dans TRENTE-CINQ fichiers de recette : `if v_total <> 178`,
   * `check(total === 178, …)`, `sur 178`. Chaque capacité ajoutée par un lot
   * faisait donc tomber trente-cinq recettes pour une raison sans rapport avec
   * ce qu'elles éprouvent — et chaque édition était une occasion d'en casser
   * une. Le Plan 02 chiffre le coût des six lots à venir : plus de deux cents
   * éditions.
   *
   * UNE MIGRATION, ELLE, ÉNONCE UN FAIT DATÉ : le total au moment où elle
   * s'applique. Elle n'a jamais à être rouverte, et les migrations ne sont
   * rejouées que dans l'ordre. Elles sont donc le seul endroit légitime.
   *
   * Ce contrôle ferme la porte plutôt que de compter sur la discipline : il
   * cherche la FORME d'une comparaison au total — le nombre courant du
   * catalogue, précédé d'un opérateur ou d'une préposition de dénombrement — et
   * refuse qu'elle reparaisse ailleurs. Il se met à jour tout seul : le nombre
   * cherché est celui du catalogue lu.
   */
  it('n’affirme le total du catalogue que dans une migration', () => {
    const total = String(catalogCodes.length)
    const root = resolve(import.meta.dirname, '../../..')

    const suspects = [
      ...readdirSync(resolve(root, 'supabase/tests'))
        .filter((name) => name.endsWith('.sql'))
        .map((name) => `supabase/tests/${name}`),
      ...readdirSync(resolve(root, 'scripts'))
        .filter((name) => name.endsWith('.mjs'))
        .map((name) => `scripts/${name}`),
      'src/app/page.tsx',
    ]

    /*
     * `<> 179`, `=== 179`, `sur 179`, `à 179` — et non « 179 » seul : un
     * montant, un kilométrage ou un identifiant de démonstration peut
     * légitimement valoir ce nombre, et un contrôle qui les confondrait
     * finirait par être désactivé.
     */
    const shape = new RegExp(
      // `\b` ne borne pas « à » : hors du mode Unicode, l'accent n'est pas un
      // caractère de mot, et la frontière n'existerait donc pas.
      String.raw`(?:<>|!==?|===?|==|>=|<=|\bsur\s|à\s)\s*` + total + String.raw`\b`
    )

    const guilty = suspects.filter((relative) => {
      const source = readFileSync(resolve(root, relative), 'utf8')
      return source
        .split('\n')
        .some((line) => !line.trimStart().startsWith('*') && shape.test(line))
    })

    expect(
      guilty,
      `Le total du catalogue (${total}) est comparé en dur hors migration : ${guilty.join(', ')}. ` +
        'Nommer les capacités éprouvées, ou lire le total depuis la base.'
    ).toEqual([])
  })

  /**
   * La capacité de réinitialisation existe, et elle est SEULE sous son
   * sous-menu — DEC-046.
   *
   * Le SaaS ne propose ni l'envoi d'un lien, ni la lecture d'un mot de passe :
   * une permission qui ne débloque rien ne s'attribue pas (CLAUDE.md §19 bis).
   */
  it('porte la réinitialisation du mot de passe, et rien d’autre sous ce sous-menu', () => {
    expect(catalogCodes).toContain('users.users.password.reset')

    const surnumeraires = catalogCodes.filter(
      (code) => code.startsWith('users.users.password.') && code !== 'users.users.password.reset'
    )

    expect(
      surnumeraires,
      `Ces capacités ne débloqueraient aucune fonctionnalité : ${surnumeraires.join(', ')}`
    ).toEqual([])
  })
})
