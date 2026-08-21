import { describe, expect, it } from 'vitest'

import { parsePercent, pricingRuleSchema } from './schema'
import { formatDiscount, formatPrice } from './constants'
import { NBSP } from '@/lib/money'

/**
 * Les invariants testés ici sont ceux que la base garantit déjà (migration 017).
 * Le but n'est pas de remplacer la contrainte, mais de vérifier que
 * l'utilisateur reçoit un message utile, rattaché au bon champ, avant qu'elle
 * n'ait à se déclencher.
 */

const CLIENT = '11111111-1111-1111-1111-111111111111'
const VEHICLE = '22222222-2222-2222-2222-222222222222'
const CATEGORY = '33333333-3333-3333-3333-333333333333'

function fieldErrors(result: ReturnType<typeof pricingRuleSchema.safeParse>) {
  if (result.success) return {}
  return Object.fromEntries(
    result.error.issues.map((issue) => [String(issue.path[0]), issue.message])
  )
}

describe('parsePercent', () => {
  it('accepte la virgule décimale française', () => {
    expect(parsePercent('7,5')).toBe(7.5)
  })

  it('accepte le point décimal', () => {
    expect(parsePercent('7.5')).toBe(7.5)
  })

  it('refuse une saisie non numérique', () => {
    expect(parsePercent('dix')).toBeNull()
    expect(parsePercent('')).toBeNull()
  })

  it('refuse plus de deux décimales, faute de règle d’arrondi', () => {
    expect(parsePercent('7,555')).toBeNull()
  })
})

describe('règle tarifaire — montant', () => {
  it('accepte un tarif standard global', () => {
    const result = pricingRuleSchema.safeParse({
      scope: 'GLOBAL',
      mode: 'AMOUNT',
      amount: '500 000',
      unit: 'DAY',
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.amount).toBe(500000)
    expect(result.data.unit).toBe('DAY')
    expect(result.data.vehicleId).toBeNull()
    expect(result.data.categoryId).toBeNull()
  })

  it('refuse un montant sans unité — DEC-001', () => {
    const result = pricingRuleSchema.safeParse({
      scope: 'GLOBAL',
      mode: 'AMOUNT',
      amount: '500000',
      unit: '',
    })

    expect(result.success).toBe(false)
    expect(fieldErrors(result).unit).toMatch(/par jour ou en forfait/)
  })

  it('refuse un montant décimal plutôt que de l’arrondir en silence', () => {
    const result = pricingRuleSchema.safeParse({
      scope: 'GLOBAL',
      mode: 'AMOUNT',
      amount: '450000,50',
      unit: 'DAY',
    })

    expect(result.success).toBe(false)
    expect(fieldErrors(result).amount).toMatch(/sans décimale/)
  })

  it('exige le véhicule lorsque la portée le désigne', () => {
    const result = pricingRuleSchema.safeParse({
      scope: 'VEHICLE',
      mode: 'AMOUNT',
      amount: '300000',
      unit: 'DAY',
    })

    expect(result.success).toBe(false)
    expect(fieldErrors(result).vehicleId).toMatch(/véhicule/)
  })

  it('ignore le véhicule lorsque la portée vise une catégorie', () => {
    const result = pricingRuleSchema.safeParse({
      scope: 'CATEGORY',
      mode: 'AMOUNT',
      amount: '200000',
      unit: 'FLAT',
      categoryId: CATEGORY,
      vehicleId: VEHICLE,
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    // La base refuse une règle visant à la fois un véhicule et une catégorie :
    // l'interface ne doit donc jamais lui en soumettre une.
    expect(result.data.categoryId).toBe(CATEGORY)
    expect(result.data.vehicleId).toBeNull()
  })
})

describe('règle tarifaire — remise', () => {
  it('accepte une remise client exprimée avec une virgule', () => {
    const result = pricingRuleSchema.safeParse({
      scope: 'GLOBAL',
      mode: 'DISCOUNT',
      clientId: CLIENT,
      discountPercent: '7,5',
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.discountPercent).toBe(7.5)
    expect(result.data.amount).toBeNull()
    expect(result.data.unit).toBeNull()
  })

  it('refuse une remise sans client', () => {
    const result = pricingRuleSchema.safeParse({
      scope: 'GLOBAL',
      mode: 'DISCOUNT',
      discountPercent: '10',
    })

    expect(result.success).toBe(false)
    expect(fieldErrors(result).clientId).toMatch(/client/)
  })

  it('refuse une remise hors des bornes', () => {
    for (const value of ['0', '100', '150']) {
      const result = pricingRuleSchema.safeParse({
        scope: 'GLOBAL',
        mode: 'DISCOUNT',
        clientId: CLIENT,
        discountPercent: value,
      })

      expect(result.success).toBe(false)
      expect(fieldErrors(result).discountPercent).toMatch(/entre 0 et 100/)
    }
  })
})

describe('période de validité', () => {
  it('refuse une fin antérieure au début', () => {
    const result = pricingRuleSchema.safeParse({
      scope: 'GLOBAL',
      mode: 'AMOUNT',
      amount: '500000',
      unit: 'DAY',
      validFrom: '2026-09-01',
      validTo: '2026-08-01',
    })

    expect(result.success).toBe(false)
    expect(fieldErrors(result).validTo).toMatch(/précéder/)
  })

  it('accepte une condition permanente, sans date de fin', () => {
    const result = pricingRuleSchema.safeParse({
      scope: 'GLOBAL',
      mode: 'AMOUNT',
      amount: '500000',
      unit: 'DAY',
      validFrom: '2026-09-01',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.validTo).toBeNull()
  })
})

describe('affichage', () => {
  it('accole l’unité au montant', () => {
    // Séparateurs écrits via NBSP plutôt qu'en clair : un espace insécable est
    // indiscernable d'une espace ordinaire dans un fichier source.
    expect(formatPrice(450000, 'DAY')).toBe(`450${NBSP}000${NBSP}KMF${NBSP}/ jour`)
    expect(formatPrice(450000, 'FLAT')).toBe(`450${NBSP}000${NBSP}KMF${NBSP}forfait`)
  })

  it('affiche une remise à la française', () => {
    expect(formatDiscount(7.5)).toBe(`7,5${NBSP}%`)
    expect(formatDiscount(10)).toBe(`10${NBSP}%`)
  })
})
