import { describe, expect, it } from 'vitest'

import {
  commission,
  COMMISSION_GAP_MESSAGES,
  formatRate,
  toAmount,
} from './constants'
import {
  supplierRateConditionsSchema,
  supplierRateRetireSchema,
  supplierRateSchema,
} from './schema'

/**
 * Contrôles unitaires du LOT 21 — tarifs fournisseurs et commission.
 *
 * Ils portent sur ce qui se décide SANS la base : la forme d'une saisie, et le
 * calcul d'une commission. Les refus de la base — chevauchement, véhicule non
 * fourni, capacités — sont éprouvés par `supabase/tests/supplier_rates.sql` et
 * par `scripts/verify-supplier-rates.mjs`, avec de vraies sessions.
 */

const valid = {
  vehicleId: 'a3f1c2d4-0000-4000-8000-000000000001',
  supplierId: '',
  amount: '40000',
  unit: 'DAY',
  validFrom: '2026-09-01',
  conditions: '',
  reason: '',
}

describe('saisie d’un coût d’acquisition', () => {
  it('accepte une saisie complète et normalise les champs vides en null', () => {
    const parsed = supplierRateSchema.parse(valid)

    expect(parsed.amount).toBe(40000)
    expect(parsed.unit).toBe('DAY')
    // Le fournisseur non renseigné n'est pas une chaîne vide : la base retiendra
    // celui qui met le véhicule à disposition.
    expect(parsed.supplierId).toBeNull()
    expect(parsed.conditions).toBeNull()
    expect(parsed.reason).toBeNull()
  })

  it('refuse un montant à décimale plutôt que de l’arrondir en silence', () => {
    const parsed = supplierRateSchema.safeParse({ ...valid, amount: '40000.75' })

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.some((issue) => issue.path[0] === 'amount')).toBe(true)
  })

  it('refuse un montant nul ou négatif', () => {
    for (const amount of ['0', '-40000']) {
      expect(supplierRateSchema.safeParse({ ...valid, amount }).success).toBe(false)
    }
  })

  it('exige une unité : un montant sans unité n’existe pas (DEC-001)', () => {
    expect(supplierRateSchema.safeParse({ ...valid, unit: '' }).success).toBe(false)
    // Le tarif MENSUEL n'est pas coché par la Direction (A-1) : il n'existe pas.
    expect(supplierRateSchema.safeParse({ ...valid, unit: 'MONTH' }).success).toBe(false)
  })

  it('accepte une date d’effet FUTURE — c’est le besoin exprimé', () => {
    const parsed = supplierRateSchema.safeParse({ ...valid, validFrom: '2099-10-01' })
    expect(parsed.success).toBe(true)
  })

  it('n’expose aucune date de fin : la base la pose en closant la version', () => {
    expect(Object.keys(supplierRateSchema.shape)).not.toContain('validTo')
  })

  it('exige un véhicule', () => {
    expect(supplierRateSchema.safeParse({ ...valid, vehicleId: '' }).success).toBe(false)
  })
})

describe('correction d’une version', () => {
  it('ne propose QUE les conditions écrites — D16(a)', () => {
    const keys = Object.keys(supplierRateConditionsSchema.shape)

    expect(keys).toEqual(['rateId', 'conditions'])
    // Ni le montant, ni l'unité, ni la date d'effet, ni le motif d'origine.
    for (const forbidden of ['amount', 'unit', 'validFrom', 'reason']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('accepte un retrait sans motif, et borne le motif fourni', () => {
    expect(supplierRateRetireSchema.parse({ rateId: 'x', reason: '' }).reason).toBeNull()
    expect(
      supplierRateRetireSchema.safeParse({ rateId: 'x', reason: 'z'.repeat(501) }).success
    ).toBe(false)
  })
})

describe('commission de location', () => {
  const day = (amount: number) => ({ amount, unit: 'DAY' as const })

  it('le cas de référence de la Direction : 50 000 − 40 000 = 10 000', () => {
    const result = commission(day(50000), day(40000))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.commission.amount).toBe(10000)
    expect(result.commission.unit).toBe('DAY')
    expect(result.commission.rate).toBe(20)
  })

  it('le second cas : 60 000 − 40 000 = 20 000', () => {
    const result = commission(day(60000), day(40000))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.commission.amount).toBe(20000)
    expect(result.commission.rate).toBeCloseTo(33.3, 1)
  })

  it('CONSERVE une commission négative : vendre à perte est un fait', () => {
    const result = commission(day(35000), day(40000))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.commission.amount).toBe(-5000)
    expect(result.commission.rate).toBeCloseTo(-14.3, 1)
  })

  it('UN COÛT ABSENT N’EST PAS UN COÛT DE 0 KMF', () => {
    const result = commission(day(50000), null)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.gap).toBe('NO_COST_AT_DATE')
    // Surtout pas 50 000, qui se lirait « 100 % de marge ».
    expect(COMMISSION_GAP_MESSAGES[result.gap]).toContain('n’est pas un coût nul')
  })

  it('un tarif client illisible ne fait pas inventer de commission', () => {
    const result = commission(null, day(40000))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.gap).toBe('NO_CLIENT_PRICE_ACCESS')
  })

  it('refuse de soustraire un forfait d’un tarif journalier', () => {
    const result = commission(day(50000), { amount: 40000, unit: 'FLAT' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.gap).toBe('UNIT_MISMATCH')
  })

  it('une commission nulle est une commission, pas une absence', () => {
    const result = commission(day(40000), day(40000))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.commission.amount).toBe(0)
    expect(result.commission.rate).toBe(0)
  })

  it('chaque raison de non-calcul porte son message, aucune n’est muette', () => {
    for (const message of Object.values(COMMISSION_GAP_MESSAGES)) {
      expect(message.length).toBeGreaterThan(20)
    }
  })
})

describe('mise en forme', () => {
  it('accole l’unité au montant', () => {
    expect(formatRate(40000, 'DAY')).toContain('jour')
    expect(formatRate(400000, 'FLAT')).toContain('forfait')
  })

  it('rend un tiret plutôt qu’un zéro lorsqu’aucun montant n’existe', () => {
    expect(formatRate(null, 'DAY')).toBe('—')
  })

  it('convertit un bigint rendu en chaîne, et refuse ce qui n’est pas un entier sûr', () => {
    expect(toAmount('40000')).toBe(40000)
    expect(toAmount(null)).toBeNull()
    expect(toAmount('9007199254740993')).toBeNull()
  })
})
