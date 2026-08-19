import { describe, expect, it } from 'vitest'

import {
  applyPercentage,
  formatAmount,
  InvalidAmountError,
  multiply,
  NBSP,
  parseAmount,
  subtract,
  sum,
} from './money'

/**
 * Les montants sont le point le plus sensible du système :
 * « Tout montant doit pouvoir être expliqué, justifié, retrouvé et relié à son
 * origine » (05_Regles_Metier/03_Finance.md §86).
 *
 * Ces tests verrouillent l'arithmétique entière en KMF (DEC-010).
 *
 * Les séparateurs attendus sont écrits via la constante NBSP plutôt qu'en clair :
 * un espace insécable est invisible dans le code source, et une comparaison de
 * chaînes contenant un caractère indiscernable est impossible à relire.
 */

describe('arithmétique monétaire', () => {
  it('additionne sans perte de précision', () => {
    expect(sum([500_000, 300_000, 200_000])).toBe(1_000_000)
  })

  it('calcule le net à payer fournisseur de l’exemple de référence ADIKOM', () => {
    // Facture 500 000 − imputation 300 000 = net à payer 200 000
    expect(subtract(500_000, 300_000)).toBe(200_000)
  })

  it('calcule le solde après imputation puis paiement', () => {
    // 500 000 − 300 000 imputés − 200 000 payés = 0
    expect(subtract(subtract(500_000, 300_000), 200_000)).toBe(0)
  })

  it('gère plusieurs imputations sur une même facture', () => {
    // 1 000 000 − (300 000 + 200 000) = 500 000
    expect(subtract(1_000_000, sum([300_000, 200_000]))).toBe(500_000)
  })

  it('multiplie un tarif journalier par une durée (unité JOUR — DEC-001)', () => {
    expect(multiply(150_000, 3)).toBe(450_000)
  })

  it('rejette un montant décimal plutôt que de l’arrondir en silence', () => {
    expect(() => sum([100.5])).toThrow(InvalidAmountError)
  })

  it('rejette NaN et Infinity', () => {
    expect(() => sum([Number.NaN])).toThrow(InvalidAmountError)
    expect(() => sum([Number.POSITIVE_INFINITY])).toThrow(InvalidAmountError)
  })

  it('rejette une quantité négative', () => {
    expect(() => multiply(150_000, -1)).toThrow(InvalidAmountError)
  })
})

describe('remises', () => {
  it('applique un pourcentage avec un arrondi unique et explicite', () => {
    expect(applyPercentage(500_000, 10)).toBe(50_000)
  })

  it('arrondit à l’entier le plus proche', () => {
    // 333 333 × 33 % = 109 999,89 → 110 000
    expect(applyPercentage(333_333, 33)).toBe(110_000)
  })

  it('refuse un pourcentage hors bornes', () => {
    expect(() => applyPercentage(500_000, 150)).toThrow(InvalidAmountError)
    expect(() => applyPercentage(500_000, -5)).toThrow(InvalidAmountError)
  })
})

describe('formatage', () => {
  it('formate selon la convention ADIKOM', () => {
    expect(formatAmount(500_000)).toBe(`500${NBSP}000${NBSP}KMF`)
  })

  it('peut omettre la devise', () => {
    expect(formatAmount(500_000, { withCurrency: false })).toBe(`500${NBSP}000`)
  })

  it('groupe correctement les millions', () => {
    expect(formatAmount(1_000_000, { withCurrency: false })).toBe(
      `1${NBSP}000${NBSP}000`
    )
  })

  it('n’insère aucun séparateur sous mille', () => {
    expect(formatAmount(999, { withCurrency: false })).toBe('999')
  })

  it('formate zéro', () => {
    expect(formatAmount(0)).toBe(`0${NBSP}KMF`)
  })

  it('formate un montant négatif (contrepassation)', () => {
    expect(formatAmount(-300_000, { withCurrency: false })).toBe(`-300${NBSP}000`)
  })

  it('n’utilise aucune espace sécable : un montant ne doit jamais être coupé', () => {
    expect(formatAmount(1_000_000)).not.toContain(' ')
  })
})

describe('analyse de saisie', () => {
  it('accepte les séparateurs de milliers de type espace', () => {
    expect(parseAmount('500 000')).toBe(500_000)
    expect(parseAmount(`500${NBSP}000`)).toBe(500_000)
    expect(parseAmount('  500 000  ')).toBe(500_000)
  })

  it('refuse le point et la virgule au lieu de deviner un arrondi', () => {
    // Régression : « 1500.75 » ne doit jamais devenir 150 075.
    expect(parseAmount('1500.75')).toBeNull()
    expect(parseAmount('500,50')).toBeNull()
    expect(parseAmount('500.000')).toBeNull()
  })

  it('refuse une saisie non numérique ou vide', () => {
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('   ')).toBeNull()
  })

  it('effectue un aller-retour fidèle avec le formatage', () => {
    const amount = 1_234_567
    expect(parseAmount(formatAmount(amount, { withCurrency: false }))).toBe(amount)
  })
})
