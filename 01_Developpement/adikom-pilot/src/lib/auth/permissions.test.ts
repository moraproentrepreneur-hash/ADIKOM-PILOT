import { readFileSync } from 'node:fs'
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
 * Ce test lit la migration du catalogue et compare les deux ensembles.
 */

const CATALOG_PATH = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260819000700_permissions_catalog.sql'
)

/** Extrait les codes de la liste VALUES de la CTE `perms`. */
function readCatalogCodes(): string[] {
  const sql = readFileSync(CATALOG_PATH, 'utf8')

  const start = sql.indexOf('perms (code,')
  expect(start, 'La CTE « perms » est introuvable dans la migration.').toBeGreaterThan(-1)

  const body = sql.slice(start)
  // Chaque ligne de valeurs commence par ('<code>',
  const matches = body.matchAll(/^\s*\('([a-z0-9_.]+)',/gm)

  return [...matches].map((match) => match[1])
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

  it('respecte la convention de nommage module.menu[.sousmenu].action', () => {
    const invalid = catalogCodes.filter((code) => !/^[a-z0-9_]+(\.[a-z0-9_]+){1,3}$/.test(code))
    expect(invalid, `Codes non conformes : ${invalid.join(', ')}`).toEqual([])
  })
})
