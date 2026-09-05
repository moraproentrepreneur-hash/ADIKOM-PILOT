import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@/lib/auth/permissions'
import {
  ACTION_LABELS,
  ACTION_ORDER,
  ENTITIES_BY_MODULE,
  ENTITY_LABELS,
  MODULE_LABELS,
  MODULE_ORDER,
  diffFields,
  entityLabel,
  formatValue,
  moduleLabel,
} from './constants'

/**
 * Journal d'activité — LOT 15.
 *
 * Deux natures de contrôle, et la seconde compte davantage que la première.
 *
 *   1. LA LECTURE DU DÉTAIL. `diffFields` décide de ce qu'on montre d'un
 *      événement : ce qui a changé, et rien d'autre. Un défaut y fait dire au
 *      journal l'inverse de ce qui s'est passé (§59 — l'audit doit refléter les
 *      actions réellement effectuées).
 *
 *   2. LA COMPLÉTUDE DE LA CARTOGRAPHIE. `audit_detail_permission`, en base,
 *      décide QUI voit la donnée métier d'un objet. Un type d'objet oublié y
 *      renvoie NULL, donc se referme sur le seul Super Admin — le défaut est
 *      sûr, mais il est SILENCIEUX. Ce test le rend bruyant.
 */

const MIGRATION = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260905000500_journal_d_activite.sql'
)

/** Rejoue la correspondance SQL `when '<objet>' then '<capacité>'`. */
function readDetailPermissionMap(): Map<string, string> {
  const sql = readFileSync(MIGRATION, 'utf8')

  const start = sql.indexOf('create or replace function public.audit_detail_permission')
  const end = sql.indexOf('comment on function public.audit_detail_permission')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)

  const body = sql.slice(start, end)
  const map = new Map<string, string>()

  for (const match of body.matchAll(/when '([a-z_]+)'\s+then '([a-z0-9_.]+)'/g)) {
    map.set(match[1], match[2])
  }

  return map
}

describe('cartographie des lectures (DEC-038)', () => {
  const map = readDetailPermissionMap()

  it('couvre tous les types d’objet que le journal sait nommer', () => {
    const unmapped = Object.keys(ENTITY_LABELS).filter((entity) => !map.has(entity))
    expect(unmapped).toEqual([])
  })

  it('n’ouvre le détail que par des capacités réellement au catalogue', () => {
    const known = new Set<string>(Object.values(PERMISSIONS))
    const unknown = [...map.values()].filter((code) => !known.has(code))
    expect(unknown).toEqual([])
  })

  it('n’ouvre le détail d’un coût de maintenance que par sa propre lecture', () => {
    // Le défaut refermé par la migration 041 : consulter une intervention n'a
    // jamais ouvert son montant. Le journal ne doit pas le rouvrir.
    expect(map.get('maintenance_costs')).toBe(PERMISSIONS.MAINTENANCE_COST_VIEW)
    expect(map.get('maintenance_cost_lines')).toBe(PERMISSIONS.MAINTENANCE_COST_VIEW)
  })

  it('n’ouvre une coordonnée de règlement que par sa capacité dédiée', () => {
    expect(map.get('supplier_payment_details')).toBe(PERMISSIONS.SUPPLIERS_BANK_VIEW)
    expect(map.get('supplier_bank_details')).toBe(PERMISSIONS.SUPPLIERS_BANK_VIEW)
  })

  it('ne s’ouvre jamais par la seule lecture du journal', () => {
    // `users.audit.view` donne l'événement. Si elle apparaissait ici, elle
    // donnerait aussi la donnée métier — exactement le contournement fermé.
    expect([...map.values()]).not.toContain(PERMISSIONS.AUDIT_VIEW)
    expect([...map.values()]).not.toContain(PERMISSIONS.AUDIT_EXPORT)
  })

  it('retire before_data et after_data des droits de `authenticated`', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toMatch(/revoke select on public\.audit_log from authenticated/)

    const grant = /grant select \(([\s\S]*?)\) on public\.audit_log to authenticated/.exec(sql)
    expect(grant).not.toBeNull()
    expect(grant?.[1]).not.toContain('before_data')
    expect(grant?.[1]).not.toContain('after_data')
    // Ce que l'écran lit doit rester accordé, sinon la liste ne s'affiche plus.
    for (const column of ['occurred_at', 'actor_label', 'action', 'result', 'entity_type']) {
      expect(grant?.[1]).toContain(column)
    }
  })
})

describe('vocabulaire du journal', () => {
  it('propose chaque action au filtre', () => {
    // Une action absente du filtre est une action qu'on ne peut pas chercher.
    expect([...ACTION_ORDER].sort()).toEqual(Object.keys(ACTION_LABELS).sort())
  })

  it('range chaque type d’objet nommé sous un module du filtre', () => {
    const listed = new Set(MODULE_ORDER.flatMap((code) => ENTITIES_BY_MODULE[code] ?? []))
    expect([...listed].sort()).toEqual(Object.keys(ENTITY_LABELS).sort())
  })

  it('nomme chaque module proposé', () => {
    for (const code of MODULE_ORDER) expect(MODULE_LABELS[code]).toBeTruthy()
  })

  it('affiche un type inconnu plutôt que de le taire', () => {
    expect(entityLabel('table_de_demain')).toBe('table_de_demain')
    expect(moduleLabel('module_inconnu')).toBe('module_inconnu')
    expect(moduleLabel(null)).toBeNull()
  })
})

describe('valeurs affichées', () => {
  it('rend un booléen en français', () => {
    expect(formatValue(true)).toBe('Oui')
    expect(formatValue(false)).toBe('Non')
  })

  it('ne confond pas « absent » et « vide »', () => {
    expect(formatValue(null)).toBeNull()
    expect(formatValue(undefined)).toBeNull()
    expect(formatValue('')).toBeNull()
    expect(formatValue(0)).toBe('0')
  })

  it('rend un objet imbriqué sans prétendre l’interpréter', () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}')
  })
})

describe('différence avant / après', () => {
  it('ne montre que ce qui a changé', () => {
    const changes = diffFields(
      { status: 'DRAFT', label: 'Toyota', amount: 500000 },
      { status: 'VALIDATED', label: 'Toyota', amount: 500000 }
    )

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ field: 'status', before: 'DRAFT', after: 'VALIDATED' })
  })

  it('montre tout d’une création, qui n’a pas d’avant', () => {
    const changes = diffFields(null, { label: 'Nouveau', status: 'ACTIVE' })

    expect(changes.map((c) => c.field).sort()).toEqual(['label', 'status'])
    expect(changes.every((c) => c.before === null)).toBe(true)
  })

  it('montre l’état perdu d’une suppression, qui n’a pas d’après', () => {
    const changes = diffFields({ label: 'Ancien' }, null)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ before: 'Ancien', after: null })
  })

  it('tait les champs purement techniques', () => {
    const changes = diffFields(
      { updated_at: '2026-09-01', updated_by: 'a', status: 'A' },
      { updated_at: '2026-09-02', updated_by: 'b', status: 'B' }
    )

    expect(changes.map((c) => c.field)).toEqual(['status'])
  })

  it('ne fabrique aucune ligne quand rien n’a changé', () => {
    expect(diffFields({ a: 1 }, { a: 1 })).toEqual([])
  })

  it('signale un champ vidé, plutôt que de l’ignorer', () => {
    // Effacer une valeur EST un changement : le taire ferait mentir le journal.
    const changes = diffFields({ reason: 'Erreur de saisie' }, { reason: null })

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ before: 'Erreur de saisie', after: null })
  })

  it('traduit le nom des champs qu’il connaît', () => {
    const [change] = diffFields({ first_name: 'A' }, { first_name: 'B' })
    expect(change.label).toBe('Prénom')
  })
})
