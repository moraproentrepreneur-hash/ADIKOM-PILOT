import { describe, expect, it } from 'vitest'

import {
  allowsPurchase,
  allowsSale,
  formatMoney,
  margin,
  toAmount,
} from './constants'
import {
  serviceCategorySchema,
  servicePriceSchema,
  serviceSchema,
  serviceVariantSchema,
} from './schema'

/**
 * Catalogue de services — LOT 20, DEC-043.
 *
 * Deux natures de contrôle, et la seconde compte davantage :
 *
 *   1. LA SAISIE. Un montant mal analysé se glisserait dans une version de
 *      prix, et une facture s'en réclamerait plus tard.
 *
 *   2. CE QUE L'ÉCRAN A LE DROIT DE DIRE. `margin` décide s'il y a une marge à
 *      montrer. Un coût absent traité comme zéro ferait passer la marge pour
 *      100 % du prix — une affirmation fausse sur une donnée financière
 *      (DEC-008, DEC-017).
 */

describe('destination d’un service', () => {
  it('n’autorise un prix de vente que si le service est vendu', () => {
    expect(allowsSale('SALE')).toBe(true)
    expect(allowsSale('BOTH')).toBe(true)
    expect(allowsSale('PURCHASE')).toBe(false)
  })

  it('n’autorise un prix d’achat que si le service est acheté', () => {
    expect(allowsPurchase('PURCHASE')).toBe(true)
    expect(allowsPurchase('BOTH')).toBe(true)
    expect(allowsPurchase('SALE')).toBe(false)
  })
})

describe('marge — calculée, jamais devinée', () => {
  it('se calcule quand les deux prix sont applicables', () => {
    expect(margin(60_000, 45_000)).toEqual({ amount: 15_000, rate: 25 })
  })

  it('ne se calcule pas sans prix d’achat', () => {
    // Un coût absent n'est pas un coût nul : le traiter comme zéro annoncerait
    // 100 % de marge sur une donnée qu'on n'a pas.
    expect(margin(60_000, null)).toBeNull()
  })

  it('ne se calcule pas sans prix de vente', () => {
    expect(margin(null, 45_000)).toBeNull()
  })

  it('rend une marge négative telle quelle, sans la corriger', () => {
    // Vendre à perte est un fait, pas une erreur de saisie à masquer.
    expect(margin(40_000, 50_000)).toEqual({ amount: -10_000, rate: -25 })
  })
})

describe('montants', () => {
  it('lit un bigint rendu sous forme de chaîne par PostgREST', () => {
    expect(toAmount('50000')).toBe(50_000)
    expect(toAmount(50_000)).toBe(50_000)
  })

  it('refuse ce qui n’est pas un entier exploitable', () => {
    expect(toAmount('1500,75')).toBeNull()
    expect(toAmount(null)).toBeNull()
  })

  it('distingue « aucun montant » de « zéro »', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(0)).not.toBe('—')
  })
})

describe('catégorie de services', () => {
  const valid = { code: 'transport', label: 'Transport', description: '', displayOrder: '0' }

  it('met le code en capitales, pour qu’il reste une référence', () => {
    const parsed = serviceCategorySchema.parse(valid)
    expect(parsed.code).toBe('TRANSPORT')
  })

  it('refuse un code contenant une espace ou un accent', () => {
    expect(serviceCategorySchema.safeParse({ ...valid, code: 'TRANS PORT' }).success).toBe(false)
    expect(serviceCategorySchema.safeParse({ ...valid, code: 'TRANSPÔRT' }).success).toBe(false)
  })

  it('exige un libellé', () => {
    expect(serviceCategorySchema.safeParse({ ...valid, label: '   ' }).success).toBe(false)
  })

  it('ne confond pas une description vide avec une description absente', () => {
    expect(serviceCategorySchema.parse(valid).description).toBeNull()
  })
})

describe('service', () => {
  const valid = {
    label: 'Transfert aéroport',
    categoryId: 'e3b0c442-0000-0000-0000-000000000000',
    purpose: 'SALE',
    unitLabel: 'trajet',
    description: '',
    notes: '',
  }

  it('accepte une fiche complète', () => {
    const parsed = serviceSchema.parse(valid)
    expect(parsed.purpose).toBe('SALE')
    expect(parsed.unitLabel).toBe('trajet')
  })

  it('EXIGE une destination — elle ne se déduit pas d’un prix', () => {
    const result = serviceSchema.safeParse({ ...valid, purpose: '' })
    expect(result.success).toBe(false)
  })

  it('refuse une destination inventée', () => {
    expect(serviceSchema.safeParse({ ...valid, purpose: 'RENTAL' }).success).toBe(false)
  })

  it('exige une catégorie', () => {
    expect(serviceSchema.safeParse({ ...valid, categoryId: '' }).success).toBe(false)
  })
})

describe('variante', () => {
  it('accepte une variante sans référence', () => {
    const parsed = serviceVariantSchema.parse({ label: 'Premium', sku: '', displayOrder: '' })
    expect(parsed.sku).toBeNull()
    expect(parsed.displayOrder).toBe(0)
  })

  it('refuse un ordre d’affichage qui n’est pas un entier positif', () => {
    expect(
      serviceVariantSchema.safeParse({ label: 'Premium', sku: '', displayOrder: '-2' }).success
    ).toBe(false)
  })
})

describe('version de prix', () => {
  const valid = {
    variantId: 'e3b0c442-0000-0000-0000-000000000000',
    amount: '50 000',
    validFrom: '2026-09-14',
    reason: '',
  }

  it('analyse un montant séparé par des espaces', () => {
    expect(servicePriceSchema.parse(valid).amount).toBe(50_000)
  })

  it('REFUSE une décimale plutôt que de l’arrondir en silence', () => {
    // « 1500.75 » lu comme 150 075 serait l'arrondi silencieux que les règles
    // financières interdisent.
    expect(servicePriceSchema.safeParse({ ...valid, amount: '1500.75' }).success).toBe(false)
  })

  it('refuse un prix nul ou négatif', () => {
    expect(servicePriceSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false)
    expect(servicePriceSchema.safeParse({ ...valid, amount: '-10' }).success).toBe(false)
  })

  it('exige une date d’effet', () => {
    expect(servicePriceSchema.safeParse({ ...valid, validFrom: '' }).success).toBe(false)
    expect(servicePriceSchema.safeParse({ ...valid, validFrom: '14/09/2026' }).success).toBe(false)
  })

  it('ACCEPTE une date d’effet future — c’est le besoin exprimé', () => {
    const result = servicePriceSchema.safeParse({ ...valid, validFrom: '2099-07-01' })
    expect(result.success).toBe(true)
  })

  it('ne demande aucune date de fin : la base la pose elle-même', () => {
    const parsed = servicePriceSchema.parse(valid)
    expect(Object.keys(parsed)).not.toContain('validTo')
  })
})
