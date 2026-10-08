import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { NAVIGATION, filterNavigation, isSection } from '@/lib/navigation'
import { NBSP } from '@/lib/money'
import {
  describeVariance,
  formatDuration,
  parseSessionWindow,
  readVariance,
} from './constants'

/**
 * Point de vente — LOT 27 (Module 12).
 *
 * Ce que ces tests gardent SANS base :
 *
 *   1. la LECTURE de l'écart : « non visible » n'est jamais « 0 », « ouverte »
 *      n'est jamais « équilibrée » (DEC-017, B-9) ;
 *   2. la FENÊTRE « qui était en caisse ? » : bornes, journée entière, saisies
 *      invalides ;
 *   3. la NAVIGATION : deux entrées, aucune vente « à venir » (DEC-042 §d) ;
 *   4. les MIGRATIONS du lot, relues comme du texte : aucune fonction
 *      `SECURITY DEFINER`, gardes « nées par leur fonction », sauvegarde à 65
 *      tables dans l'ordre parents → enfants.
 *
 * Les refus de LECTURE (B-13) s'éprouvent en base, sous le rôle
 * `authenticated` : `supabase/tests/pos_sessions.sql`.
 */

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../supabase/migrations')

function lotMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.startsWith('20261008') && name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8') }))
}

describe('écart de caisse — lecture', () => {
  it('ne dit jamais 0 quand les montants ne sont pas lisibles', () => {
    const reading = readVariance(null, false, 'CLOSED')
    expect(reading.kind).toBe('hidden')
    expect(describeVariance(reading)).not.toMatch(/0/)
  })

  it('reste « non visible » même si un nombre parvenait sans droit de lecture', () => {
    expect(readVariance(-2000, false, 'CLOSED').kind).toBe('hidden')
  })

  it('ne constate aucun écart sur une session ouverte', () => {
    expect(readVariance(null, true, 'OPEN').kind).toBe('pending')
    expect(readVariance(0, true, 'OPEN').kind).toBe('pending')
  })

  it('distingue équilibre, excédent et manque', () => {
    expect(readVariance(0, true, 'CLOSED')).toEqual({ kind: 'balanced' })
    expect(readVariance(5000, true, 'CLOSED')).toEqual({ kind: 'surplus', amount: 5000 })
    expect(readVariance(-2000, true, 'CLOSED')).toEqual({ kind: 'shortage', amount: 2000 })
  })

  it('formate le manque en KMF, sans signe et avec espaces insécables', () => {
    expect(describeVariance({ kind: 'shortage', amount: 2000 })).toBe(`Manque de 2${NBSP}000${NBSP}KMF`)
    expect(describeVariance({ kind: 'surplus', amount: 150000 })).toBe(
      `Excédent de 150${NBSP}000${NBSP}KMF`
    )
  })
})

describe('fenêtre « qui était en caisse ? »', () => {
  it('sans jour, aucune fenêtre', () => {
    expect(parseSessionWindow({ day: '', from: '', to: '' })).toEqual({ kind: 'none' })
  })

  it('refuse une plage horaire sans jour', () => {
    expect(parseSessionWindow({ day: '', from: '10:00', to: '' }).kind).toBe('invalid')
  })

  it('pose la fenêtre de la Direction : le J entre 10h00 et 11h30', () => {
    expect(parseSessionWindow({ day: '2026-09-09', from: '10:00', to: '11:30' })).toEqual({
      kind: 'window',
      fromLocal: '2026-09-09T10:00',
      toLocal: '2026-09-09T11:30',
      label: 'le 09/09/2026 entre 10:00 et 11:30',
    })
  })

  it('un jour seul couvre la journée ENTIÈRE, jusqu’à minuit suivant', () => {
    const window = parseSessionWindow({ day: '2026-12-31', from: '', to: '' })
    expect(window).toMatchObject({
      kind: 'window',
      fromLocal: '2026-12-31T00:00',
      toLocal: '2027-01-01T00:00',
    })
  })

  it('une heure de début seule court jusqu’à la fin de la journée', () => {
    expect(parseSessionWindow({ day: '2026-02-28', from: '18:00', to: '' })).toMatchObject({
      fromLocal: '2026-02-28T18:00',
      toLocal: '2026-03-01T00:00',
    })
  })

  it('refuse une fin qui ne suit pas le début', () => {
    expect(parseSessionWindow({ day: '2026-09-09', from: '11:30', to: '10:00' }).kind).toBe('invalid')
    expect(parseSessionWindow({ day: '2026-09-09', from: '10:00', to: '10:00' }).kind).toBe('invalid')
    expect(parseSessionWindow({ day: '2026-09-09', from: '', to: '00:00' }).kind).toBe('invalid')
  })

  it('refuse les saisies mal formées', () => {
    expect(parseSessionWindow({ day: '09/09/2026', from: '', to: '' }).kind).toBe('invalid')
    expect(parseSessionWindow({ day: '2026-09-09', from: '25:00', to: '' }).kind).toBe('invalid')
    expect(parseSessionWindow({ day: '2026-09-09', from: '', to: '9h' }).kind).toBe('invalid')
  })
})

describe('durée d’une session', () => {
  it('se lit à la minute', () => {
    expect(formatDuration('2026-09-09T07:00:00Z', '2026-09-09T09:05:00Z')).toBe('2 h 05')
    expect(formatDuration('2026-09-09T07:00:00Z', '2026-09-09T07:45:30Z')).toBe('45 min')
  })

  it('court jusqu’à maintenant pour une session ouverte', () => {
    const now = new Date('2026-09-09T08:30:00Z')
    expect(formatDuration('2026-09-09T07:00:00Z', null, now)).toBe('1 h 30')
  })

  it('ne fabrique pas de durée négative', () => {
    expect(formatDuration('2026-09-09T09:00:00Z', '2026-09-09T08:00:00Z')).toBe('—')
  })
})

describe('navigation du point de vente', () => {
  const section = NAVIGATION.filter(isSection).find((entry) => entry.label === 'Point de vente')

  it('porte deux entrées, chacune sous SA lecture', () => {
    expect(section?.items.map((item) => [item.href, item.permission])).toEqual([
      ['/pdv/caisses', PERMISSIONS.POS_REGISTERS_VIEW],
      ['/pdv/sessions', PERMISSIONS.POS_SESSIONS_VIEW],
    ])
  })

  it('n’annonce aucune vente « à venir » (DEC-042 §d)', () => {
    expect(section?.items.every((item) => item.status === 'ready')).toBe(true)
    expect(section?.items.some((item) => /vente/i.test(item.label))).toBe(false)
  })

  it('montre les sessions à qui ne peut que les consulter', () => {
    const visible = filterNavigation(NAVIGATION, new Set([PERMISSIONS.POS_SESSIONS_VIEW]), false)
    const pos = visible.filter(isSection).find((entry) => entry.label === 'Point de vente')
    expect(pos?.items.map((item) => item.href)).toEqual(['/pdv/sessions'])
  })

  it('disparaît pour le profil minimal', () => {
    const visible = filterNavigation(NAVIGATION, new Set([PERMISSIONS.DASHBOARD_VIEW]), false)
    expect(visible.filter(isSection).some((entry) => entry.label === 'Point de vente')).toBe(false)
  })
})

describe('migrations du LOT 27, relues', () => {
  const migrations = lotMigrations()
  const all = migrations.map((m) => m.sql).join('\n')

  it('sont quatre, horodatées après la dernière migration de main', () => {
    expect(migrations.map((m) => m.name)).toEqual([
      '20261008000100_caisses_et_sessions_de_caisse.sql',
      '20261008000200_ouvrir_et_cloturer_une_session.sql',
      '20261008000300_capacites_et_numerotation_du_point_de_vente.sql',
      '20261008000400_perimetre_de_sauvegarde_du_point_de_vente.sql',
    ])
    expect(migrations.every((m) => m.name > '20260929000300')).toBe(true)
  })

  it('ne déclarent aucune fonction SECURITY DEFINER', () => {
    // La CLAUSE, seule sur sa ligne, comme le projet l'écrit partout. Les
    // messages d'erreur et les commentaires qui citent la doctrine D4 ne
    // comptent pas.
    expect(all).not.toMatch(/^\s*security\s+definer\s*$/im)
  })

  it('révoquent anon et accordent authenticated sur chaque fonction créée', () => {
    // `audit_detail_permission` et `backup_scope` sont des REDÉFINITIONS : elles
    // gardent les droits posés à leur création (`create or replace`).
    const redefined = new Set(['public.audit_detail_permission', 'public.backup_scope'])
    const created = [...all.matchAll(/create or replace function (public\.[a-z_]+)\(/g)]
      .map((m) => m[1])
      .filter((fn) => !redefined.has(fn))
    expect(created.length).toBeGreaterThan(10)
    for (const fn of new Set(created)) {
      expect(all, `${fn} : revoke manquant`).toMatch(new RegExp(`revoke execute on function ${fn.replace('.', '\\.')}\\(`))
    }
  })

  it('posent la garde « née par sa fonction » sur les trois tables', () => {
    for (const table of ['pos_registers', 'pos_sessions', 'pos_session_amounts']) {
      expect(all).toContain(`create trigger ${table}_zzz_born_by_function`)
    }
  })

  it('n’écrivent jamais dans la trésorerie (B-9)', () => {
    expect(all).not.toMatch(/insert into public\.treasury_entries/i)
  })

  it('placent les trois tables au périmètre de sauvegarde, après les comptes', () => {
    const backup = migrations.find((m) => m.name.includes('sauvegarde'))!.sql
    const body = backup.slice(backup.indexOf('create or replace function public.backup_scope()'))
    const order = ['financial_accounts', 'pos_registers', 'pos_sessions', 'pos_session_amounts'].map(
      (table) => body.indexOf(`'${table}'`)
    )
    expect(order.every((position) => position > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(backup).toMatch(/<> 65/)
  })
})
