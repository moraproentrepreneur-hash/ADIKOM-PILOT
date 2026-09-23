import { describe, expect, it } from 'vitest'

import {
  ORDER_ACTION_LABELS,
  ORDER_STATUS_HELP,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  ORDER_TRANSITIONS,
  QUOTE_ACTION_LABELS,
  QUOTE_STATUS_HELP,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONES,
  QUOTE_TRANSITIONS,
  documentTotal,
  lineKind,
  lineTotal,
  orderIsEditable,
  orderIsInvoiceable,
  quoteIsConvertible,
  quoteIsEditable,
  quoteIsExpired,
  type OrderStatus,
  type QuoteStatus,
} from './constants'

/**
 * Le vocabulaire et les règles pures du commerce client — LOT 25, DEC-049.
 *
 * CE QUI EST ÉPROUVÉ ICI, ET QUE LA BASE NE PEUT PAS ÉPROUVER :
 *
 *   · l'arithmétique des lignes et des totaux, dans ses BRANCHES — pas
 *     seulement le cas nominal ;
 *   · la PÉREMPTION DÉRIVÉE d'un devis (B-7), qui n'existe qu'ici : aucun
 *     statut ne la porte en base, et c'est délibéré ;
 *   · la cohérence entre les tables de transitions et les écrans qui les
 *     offrent — une action proposée sans libellé serait un bouton muet ;
 *   · qu'aucun état inatteignable ne soit offert.
 *
 * Les transitions elles-mêmes sont IMPOSÉES en base (déclencheurs
 * `fn_sales_quote_transition` et `fn_sales_order_transition`) et éprouvées par
 * `supabase/tests/commerce.sql`. Ce fichier vérifie que l'écran ne propose rien
 * que la base refuserait — pas l'inverse.
 */

const QUOTE_STATUSES: QuoteStatus[] = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REFUSED',
  'CONVERTED',
  'CANCELLED',
]

const ORDER_STATUSES: OrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'DELIVERED',
  'INVOICED',
  'CANCELLED',
]

describe('montant d’une ligne', () => {
  it('multiplie la quantité par le prix unitaire', () => {
    expect(lineTotal(3, 50_000)).toBe(150_000)
    expect(lineTotal(1, 1)).toBe(1)
  })

  it('reste exact sur de grands montants — aucun flottant (DEC-010)', () => {
    expect(lineTotal(999, 999_999)).toBe(998_999_001)
    expect(Number.isSafeInteger(lineTotal(999, 999_999))).toBe(true)
  })

  it('refuse une quantité nulle, négative ou décimale (B-14)', () => {
    expect(() => lineTotal(0, 1000)).toThrow()
    expect(() => lineTotal(-1, 1000)).toThrow()
    expect(() => lineTotal(2.5, 1000)).toThrow()
    expect(() => lineTotal(Number.NaN, 1000)).toThrow()
  })

  it('refuse un prix nul, négatif ou décimal', () => {
    expect(() => lineTotal(1, 0)).toThrow()
    expect(() => lineTotal(1, -500)).toThrow()
    expect(() => lineTotal(1, 1500.75)).toThrow()
  })
})

describe('total d’un document', () => {
  const ligne = (quantity: number, unitPrice: number, isArchived = false) => ({
    quantity,
    unitPrice,
    isArchived,
  })

  it('somme les lignes actives', () => {
    expect(documentTotal([ligne(3, 50_000), ligne(1, 80_000), ligne(2, 7_500)])).toBe(245_000)
  })

  it('écarte les lignes archivées — D6 : on archive, on n’efface pas', () => {
    expect(documentTotal([ligne(3, 50_000), ligne(10, 1_000_000, true)])).toBe(150_000)
  })

  it('rend zéro sur un document sans ligne', () => {
    expect(documentTotal([])).toBe(0)
  })

  it('rend zéro lorsque toutes les lignes sont archivées', () => {
    expect(documentTotal([ligne(1, 1000, true), ligne(2, 2000, true)])).toBe(0)
  })

  it('propage le refus d’une ligne invalide plutôt que de l’ignorer', () => {
    // Une ligne impossible ne doit pas se fondre en silence dans un total :
    // un montant faux est pire qu'une erreur.
    expect(() => documentTotal([ligne(1, 1000), ligne(0, 500)])).toThrow()
  })
})

describe('nature d’une ligne — A-13', () => {
  it('une ligne qui nomme un service est une ligne de catalogue', () => {
    expect(lineKind('00000000-0000-0000-0000-000000000001')).toBe('CATALOG')
  })

  it('une ligne sans service est une ligne libre', () => {
    expect(lineKind(null)).toBe('FREE')
  })
})

describe('péremption d’un devis — dérivée, jamais écrite (B-7)', () => {
  it('un devis émis dont la validité est passée est périmé', () => {
    expect(quoteIsExpired('SENT', '2026-09-01', '2026-09-23')).toBe(true)
  })

  it('le jour même de la validité, il ne l’est pas encore', () => {
    expect(quoteIsExpired('SENT', '2026-09-23', '2026-09-23')).toBe(false)
  })

  it('sans date de validité, il ne périme jamais', () => {
    expect(quoteIsExpired('SENT', null, '2030-01-01')).toBe(false)
  })

  it('un devis accepté reste accepté, quelle que soit la date', () => {
    // La péremption ne concerne qu'un devis ENCORE EN ATTENTE DE RÉPONSE :
    // un accord donné le 1er ne s'évapore pas le 30.
    expect(quoteIsExpired('ACCEPTED', '2026-09-01', '2026-12-31')).toBe(false)
    expect(quoteIsExpired('CONVERTED', '2026-09-01', '2026-12-31')).toBe(false)
    expect(quoteIsExpired('REFUSED', '2026-09-01', '2026-12-31')).toBe(false)
    expect(quoteIsExpired('CANCELLED', '2026-09-01', '2026-12-31')).toBe(false)
  })

  it('un brouillon n’est pas périmé : il n’a jamais été remis', () => {
    expect(quoteIsExpired('DRAFT', '2026-09-01', '2026-12-31')).toBe(false)
  })
})

describe('ce qu’un état autorise', () => {
  it('seul un brouillon se modifie', () => {
    for (const status of QUOTE_STATUSES) {
      expect(quoteIsEditable(status)).toBe(status === 'DRAFT')
    }
    for (const status of ORDER_STATUSES) {
      expect(orderIsEditable(status)).toBe(status === 'DRAFT')
    }
  })

  it('seul un devis accepté se convertit', () => {
    for (const status of QUOTE_STATUSES) {
      expect(quoteIsConvertible(status)).toBe(status === 'ACCEPTED')
    }
  })

  it('seule une commande confirmée ou livrée se facture', () => {
    for (const status of ORDER_STATUSES) {
      expect(orderIsInvoiceable(status)).toBe(status === 'CONFIRMED' || status === 'DELIVERED')
    }
  })

  it('une commande déjà facturée ne se refacture pas depuis l’écran', () => {
    // Une commande, au plus une facture non annulée. L'index partiel en base
    // fait autorité ; l'écran ne doit pas proposer ce qu'il refuserait.
    expect(orderIsInvoiceable('INVOICED')).toBe(false)
  })
})

describe('tables de transitions', () => {
  it('un état terminal n’offre aucune suite', () => {
    expect(QUOTE_TRANSITIONS.REFUSED).toEqual([])
    expect(QUOTE_TRANSITIONS.CONVERTED).toEqual([])
    expect(QUOTE_TRANSITIONS.CANCELLED).toEqual([])
    expect(ORDER_TRANSITIONS.INVOICED).toEqual([])
    expect(ORDER_TRANSITIONS.CANCELLED).toEqual([])
  })

  it('« converti » et « facturée » ne se déclarent jamais depuis l’écran', () => {
    // Ils résultent de la création de la commande et de la préparation de la
    // facture. Les offrir donnerait deux chemins vers le même état, dont un
    // sans son acte.
    for (const status of QUOTE_STATUSES) {
      expect(QUOTE_TRANSITIONS[status]).not.toContain('CONVERTED')
    }
    for (const status of ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[status]).not.toContain('INVOICED')
    }
  })

  it('aucun état ne se propose lui-même', () => {
    for (const status of QUOTE_STATUSES) {
      expect(QUOTE_TRANSITIONS[status]).not.toContain(status)
    }
    for (const status of ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[status]).not.toContain(status)
    }
  })

  it('tout état proposé porte un libellé d’action', () => {
    // Sans libellé, l'écran offrirait un bouton muet.
    for (const status of QUOTE_STATUSES) {
      for (const next of QUOTE_TRANSITIONS[status]) {
        expect(QUOTE_ACTION_LABELS[next], `libellé manquant pour ${next}`).toBeTruthy()
      }
    }
    for (const status of ORDER_STATUSES) {
      for (const next of ORDER_TRANSITIONS[status]) {
        expect(ORDER_ACTION_LABELS[next], `libellé manquant pour ${next}`).toBeTruthy()
      }
    }
  })

  it('un devis se retire depuis tout état encore vivant', () => {
    expect(QUOTE_TRANSITIONS.DRAFT).toContain('CANCELLED')
    expect(QUOTE_TRANSITIONS.SENT).toContain('CANCELLED')
    expect(QUOTE_TRANSITIONS.ACCEPTED).toContain('CANCELLED')
  })

  it('la réponse du client, favorable ou non, part du devis émis', () => {
    expect(QUOTE_TRANSITIONS.SENT).toContain('ACCEPTED')
    expect(QUOTE_TRANSITIONS.SENT).toContain('REFUSED')
    // Un brouillon n'a été remis à personne : il ne peut recevoir aucune réponse.
    expect(QUOTE_TRANSITIONS.DRAFT).not.toContain('ACCEPTED')
    expect(QUOTE_TRANSITIONS.DRAFT).not.toContain('REFUSED')
  })

  it('la livraison ne se constate que sur une commande confirmée', () => {
    expect(ORDER_TRANSITIONS.CONFIRMED).toContain('DELIVERED')
    expect(ORDER_TRANSITIONS.DRAFT).not.toContain('DELIVERED')
  })
})

describe('libellés — aucun état muet', () => {
  it('chaque état de devis porte un libellé, un ton et une aide', () => {
    for (const status of QUOTE_STATUSES) {
      expect(QUOTE_STATUS_LABELS[status]).toBeTruthy()
      expect(QUOTE_STATUS_TONES[status]).toBeTruthy()
      expect(QUOTE_STATUS_HELP[status]).toBeTruthy()
    }
  })

  it('chaque état de commande porte un libellé, un ton et une aide', () => {
    for (const status of ORDER_STATUSES) {
      expect(ORDER_STATUS_LABELS[status]).toBeTruthy()
      expect(ORDER_STATUS_TONES[status]).toBeTruthy()
      expect(ORDER_STATUS_HELP[status]).toBeTruthy()
    }
  })

  it('aucun libellé ne parle de remise, de marge ni de coût', () => {
    // Le lot n'en livre aucune fonctionnalité : en parler à l'écran promettrait
    // ce que le système ne fait pas.
    const textes = [
      ...Object.values(QUOTE_STATUS_LABELS),
      ...Object.values(ORDER_STATUS_LABELS),
      ...Object.values(QUOTE_STATUS_HELP),
      ...Object.values(ORDER_STATUS_HELP),
      ...Object.values(QUOTE_ACTION_LABELS),
      ...Object.values(ORDER_ACTION_LABELS),
    ].join(' ').toLowerCase()

    expect(textes).not.toContain('remise')
    expect(textes).not.toContain('marge')
    expect(textes).not.toContain('coût d’achat')
  })
})
