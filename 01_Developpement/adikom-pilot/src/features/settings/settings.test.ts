import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { HEX_COLOR, SECTIONS, comorianYear, previewNumber, sectionDefinition } from './constants'

/**
 * Module 09 — Paramètres.
 *
 * Deux natures de contrôle.
 *
 *   1. L'APERÇU D'UNE NUMÉROTATION. Il est écrit deux fois — en SQL pour
 *      produire les numéros, en TypeScript pour les montrer avant
 *      enregistrement. Une divergence ne fausserait aucune référence émise,
 *      mais rendrait l'aperçu menteur, ce qui est pire qu'un aperçu absent.
 *      Ces contrôles rejouent la règle SQL sur les mêmes entrées.
 *
 *   2. LES SECTIONS ET LEURS CAPACITÉS. Trois sections ont la leur (§34, §37,
 *      §38). Les rattacher à la mauvaise capacité — ou à celle qui n'existe pas
 *      — ouvrirait des coordonnées bancaires à qui n'en a pas le droit.
 */

const MIGRATION = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260905000900_parametres_entreprise_et_numerotation.sql'
)

describe('aperçu d’une numérotation (§15 à §17)', () => {
  const base = {
    prefix: 'FAC-C',
    separator: '-',
    padding: 6,
    includeYear: true,
    resetYearly: true,
    currentYear: 2026,
    currentValue: 111,
  }

  it('reprend le format documenté par DEC-005', () => {
    expect(previewNumber(base, 2026)).toBe('FAC-C-2026-000112')
  })

  it('repart à 1 au changement d’exercice quand la règle le prévoit', () => {
    expect(previewNumber(base, 2027)).toBe('FAC-C-2027-000001')
  })

  it('poursuit le compteur quand la remise à zéro n’est pas demandée', () => {
    expect(previewNumber({ ...base, resetYearly: false }, 2027)).toBe('FAC-C-2027-000112')
  })

  it('omet l’année quand la référence n’en porte pas', () => {
    expect(
      previewNumber(
        { ...base, prefix: 'CLI', includeYear: false, resetYearly: false, currentValue: 172 },
        2026
      )
    ).toBe('CLI-000173')
  })

  it('respecte la longueur du compteur', () => {
    expect(
      previewNumber({ ...base, padding: 3, includeYear: false, resetYearly: false }, 2026)
    ).toBe('FAC-C-112')
  })

  it('accepte un séparateur autre que le tiret', () => {
    expect(previewNumber({ ...base, separator: '/' }, 2026)).toBe('FAC-C/2026/000112')
  })

  it('n’écrête jamais un compteur plus long que sa longueur déclarée', () => {
    // `lpad` complète, il ne tronque pas : la référence s'allonge plutôt que de
    // se rompre en silence — même comportement qu'en base (DEC-023 §3).
    expect(
      previewNumber(
        { ...base, padding: 3, currentValue: 9999, includeYear: false, resetYearly: false },
        2026
      )
    ).toBe('FAC-C-10000')
  })
})

describe('l’exercice est celui d’ADIKOM (DEC-025 §e)', () => {
  it('lit l’année sur le fuseau des Comores, pas sur celui du serveur', () => {
    // 31 décembre 2026, 22 h 00 UTC : il est déjà le 1er janvier 2027 à Moroni.
    // Une facture émise à cet instant doit porter 2027.
    expect(comorianYear(new Date('2026-12-31T22:00:00Z'))).toBe(2027)
  })

  it('ne se trompe pas de sens le reste du temps', () => {
    expect(comorianYear(new Date('2026-06-15T12:00:00Z'))).toBe(2026)
    expect(comorianYear(new Date('2027-01-01T00:30:00Z'))).toBe(2027)
  })
})

describe('sections et capacités (§31 à §38)', () => {
  it('couvre les huit sections du §31', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual([
      'identite',
      'coordonnees',
      'administratif',
      'commercial',
      'facturation',
      'banque',
      'visuelle',
      'preferences',
    ])
  })

  it('ne cite que des capacités réellement au catalogue', () => {
    const known = new Set<string>(Object.values(PERMISSIONS))
    for (const section of SECTIONS) {
      expect(known.has(section.updatePermission)).toBe(true)
      if (section.viewPermission) expect(known.has(section.viewPermission)).toBe(true)
    }
  })

  it('donne aux trois sections sensibles leur propre capacité d’écriture', () => {
    expect(sectionDefinition('administratif')?.updatePermission).toBe(
      PERMISSIONS.SETTINGS_ADMINISTRATIVE_UPDATE
    )
    expect(sectionDefinition('banque')?.updatePermission).toBe(PERMISSIONS.SETTINGS_BANK_UPDATE)
    expect(sectionDefinition('visuelle')?.updatePermission).toBe(
      PERMISSIONS.SETTINGS_BRANDING_UPDATE
    )
  })

  it('ne place aucune section sensible derrière la capacité générale', () => {
    for (const key of ['administratif', 'banque', 'visuelle'] as const) {
      expect(sectionDefinition(key)?.updatePermission).not.toBe(
        PERMISSIONS.SETTINGS_COMPANY_UPDATE
      )
    }
  })

  it('ignore une section inconnue plutôt que d’en inventer une', () => {
    expect(sectionDefinition('inconnue')).toBeNull()
  })
})

describe('la base tient les mêmes frontières', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('retire les colonnes sensibles des droits de `authenticated`', () => {
    expect(sql).toMatch(/revoke select on public\.company_settings from authenticated/)

    const grant = /grant select \(([\s\S]*?)\) on public\.company_settings to authenticated/.exec(
      sql
    )
    expect(grant).not.toBeNull()

    for (const column of [
      'registration_number',
      'tax_identifier',
      'legal_form',
      'administrative_notes',
      'bank_name',
      'bank_account_holder',
      'bank_account_details',
    ]) {
      expect(grant?.[1]).not.toContain(column)
    }

    // Ce que l'écran lit doit rester accordé.
    for (const column of ['legal_name', 'city', 'currency_code', 'logo_path']) {
      expect(grant?.[1]).toContain(column)
    }
  })

  it('exige une capacité dédiée pour chaque section sensible', () => {
    expect(sql).toContain("has_permission('settings.company.administrative.update'")
    expect(sql).toContain("has_permission('settings.company.bank.update'")
    expect(sql).toContain("has_permission('settings.branding.update'")
  })

  it('interdit la modification d’un compteur de numérotation (§16)', () => {
    expect(sql).toMatch(/current_value is distinct from old\.current_value/)
    expect(sql).toMatch(/un numéro ne se réutilise jamais/)
  })

  it('date les numéros sur l’exercice comorien (§17)', () => {
    expect(sql).toMatch(/extract\(year from \(now\(\) at time zone 'Indian\/Comoro'\)\)/)
    expect(sql).not.toMatch(/extract\(year from \(now\(\) at time zone 'UTC'\)\)/)
  })
})

describe('validation des couleurs (§38, §40)', () => {
  it('accepte une couleur hexadécimale complète', () => {
    expect(HEX_COLOR.test('#1E5AA8')).toBe(true)
    expect(HEX_COLOR.test('#f2f6fb')).toBe(true)
  })

  it('refuse ce qu’un document ne saurait pas peindre', () => {
    expect(HEX_COLOR.test('1E5AA8')).toBe(false)
    expect(HEX_COLOR.test('#1E5')).toBe(false)
    expect(HEX_COLOR.test('bleu')).toBe(false)
    expect(HEX_COLOR.test('#1E5AA8; background:url(x)')).toBe(false)
  })
})
