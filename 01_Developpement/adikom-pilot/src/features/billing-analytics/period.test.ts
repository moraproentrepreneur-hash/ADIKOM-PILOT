import { describe, expect, it } from 'vitest'

import {
  describeBucket,
  grainFor,
  isCivilDay,
  periodQuery,
  resolveAnalyticsPeriod,
  spanInDays,
} from './period'

/**
 * La période des statistiques et des rapports — Module 07 §59.
 *
 * CE QUI EST ÉPROUVÉ ICI EST CE QUE LE TABLEAU DE BORD N'A PAS.
 *
 * Les cinq périodes civiles viennent du LOT 9 et sont déjà éprouvées par
 * `features/dashboard/period.test.ts` : le piège du fuseau — l'application
 * s'exécute en UTC, les Comores sont à UTC+3 — y est traité une fois pour
 * toutes. Ce fichier éprouve l'ajout du LOT 11 :
 *
 *   - la PÉRIODE PERSONNALISÉE, et ce qui arrive quand elle est mal saisie ;
 *   - le GRAIN, qui décide de ce que chaque point de la série agrège.
 *
 * Une période mal saisie ne doit jamais produire un résultat qui ait l'air
 * d'une réponse : elle retombe sur une période valide, ET l'écran le dit
 * (DEC-017).
 */

const at = (iso: string) => new Date(iso)

// Mercredi 2 septembre 2026, 15:00 aux Comores.
const now = at('2026-09-02T12:00:00Z')

describe('isCivilDay', () => {
  it('accepte un jour réel', () => {
    expect(isCivilDay('2026-09-02')).toBe(true)
    expect(isCivilDay('2024-02-29')).toBe(true)
  })

  it('refuse un jour qui n’existe pas', () => {
    // `Date.parse` reporterait le 30 février au 2 mars : l'aller-retour
    // l'attrape, une simple expression régulière ne l'aurait pas fait.
    expect(isCivilDay('2026-02-30')).toBe(false)
    expect(isCivilDay('2026-13-01')).toBe(false)
  })

  it('refuse ce qui n’est pas un jour', () => {
    expect(isCivilDay(undefined)).toBe(false)
    expect(isCivilDay('')).toBe(false)
    expect(isCivilDay('hier')).toBe(false)
    expect(isCivilDay('2026-09-02T10:00:00Z')).toBe(false)
  })
})

describe('spanInDays', () => {
  it('compte les deux bornes', () => {
    expect(spanInDays('2026-09-02', '2026-09-02')).toBe(1)
    expect(spanInDays('2026-09-01', '2026-09-30')).toBe(30)
  })

  it('traverse une année bissextile sans se décaler', () => {
    expect(spanInDays('2024-02-01', '2024-03-01')).toBe(30)
  })
})

describe('grainFor', () => {
  it('donne aux cinq périodes fixes le pas attendu', () => {
    expect(grainFor('2026-09-02', '2026-09-02')).toBe('day') // aujourd'hui
    expect(grainFor('2026-08-31', '2026-09-06')).toBe('day') // la semaine
    expect(grainFor('2026-09-01', '2026-09-30')).toBe('day') // le mois
    expect(grainFor('2026-07-01', '2026-09-30')).toBe('week') // le trimestre
    expect(grainFor('2026-01-01', '2026-12-31')).toBe('month') // l'année
  })

  it('élargit le pas plutôt que de rendre des centaines de points', () => {
    expect(grainFor('2020-01-01', '2026-12-31')).toBe('quarter')
    expect(grainFor('2000-01-01', '2026-12-31')).toBe('year')
  })
})

describe('resolveAnalyticsPeriod', () => {
  it('délègue les périodes civiles au tableau de bord', () => {
    expect(resolveAnalyticsPeriod('mois', undefined, undefined, now)).toMatchObject({
      key: 'mois',
      from: '2026-09-01',
      to: '2026-09-30',
      grain: 'day',
      note: null,
    })
  })

  it('retient une période personnalisée valide', () => {
    expect(
      resolveAnalyticsPeriod('personnalisee', '2026-01-15', '2026-04-15', now)
    ).toMatchObject({
      key: 'personnalisee',
      from: '2026-01-15',
      to: '2026-04-15',
      // 91 jours : le pas hebdomadaire, comme un trimestre civil.
      grain: 'week',
      note: null,
    })
  })

  it('élargit le pas d’une période personnalisée longue', () => {
    expect(
      resolveAnalyticsPeriod('personnalisee', '2024-01-01', '2026-12-31', now).grain
    ).toBe('month')
  })

  it('remet à l’endroit deux dates inversées, et le dit', () => {
    const period = resolveAnalyticsPeriod('personnalisee', '2026-04-15', '2026-01-15', now)
    expect(period.from).toBe('2026-01-15')
    expect(period.to).toBe('2026-04-15')
    // La correction est NOMMÉE : sans cela, l'utilisateur croirait lire les
    // chiffres des dates qu'il a tapées.
    expect(period.note).toBe('swapped')
  })

  it('retombe sur le mois quand une date manque, et le dit', () => {
    const period = resolveAnalyticsPeriod('personnalisee', '2026-01-15', undefined, now)
    expect(period).toMatchObject({ key: 'mois', from: '2026-09-01', note: 'incomplete' })
  })

  it('retombe sur le mois quand une date n’existe pas', () => {
    const period = resolveAnalyticsPeriod('personnalisee', '2026-02-30', '2026-03-15', now)
    expect(period.note).toBe('incomplete')
  })

  it('ignore une clé bricolée plutôt que d’échouer', () => {
    expect(resolveAnalyticsPeriod('decennie', undefined, undefined, now).key).toBe('mois')
  })
})

describe('describeBucket', () => {
  it('nomme le pas selon le grain', () => {
    expect(describeBucket('2026-09-02', 'day')).toBe('02/09')
    expect(describeBucket('2026-08-31', 'week')).toBe('sem. 31/08')
    expect(describeBucket('2026-09-01', 'month')).toBe('09/2026')
    expect(describeBucket('2026-07-01', 'quarter')).toBe('T3 2026')
    expect(describeBucket('2026-01-01', 'year')).toBe('2026')
  })
})

describe('periodQuery', () => {
  it('reconduit une période civile par sa seule clé', () => {
    const period = resolveAnalyticsPeriod('trimestre', undefined, undefined, now)
    expect(periodQuery(period)).toEqual({ periode: 'trimestre' })
  })

  it('reconduit une période personnalisée avec ses deux bornes', () => {
    const period = resolveAnalyticsPeriod('personnalisee', '2026-01-15', '2026-04-15', now)
    expect(periodQuery(period)).toEqual({
      periode: 'personnalisee',
      du: '2026-01-15',
      au: '2026-04-15',
    })
  })
})
