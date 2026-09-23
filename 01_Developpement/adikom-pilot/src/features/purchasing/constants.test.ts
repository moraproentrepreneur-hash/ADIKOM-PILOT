import { describe, expect, it } from 'vitest'

import {
  PURCHASE_ORDER_ACTION_LABELS,
  PURCHASE_ORDER_STATUS_HELP,
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_STATUS_TONES,
  PURCHASE_ORDER_TRANSITIONS,
  PURCHASE_QUOTE_ACTION_LABELS,
  PURCHASE_QUOTE_STATUS_HELP,
  PURCHASE_QUOTE_STATUS_LABELS,
  PURCHASE_QUOTE_STATUS_TONES,
  PURCHASE_QUOTE_TRANSITIONS,
  PURCHASE_LINE_KIND_LABELS,
  invoiceGap,
  purchaseDocumentTotal,
  purchaseLineKind,
  purchaseLineTotal,
  purchaseOrderIsEditable,
  purchaseOrderIsInvoiceable,
  purchaseQuoteIsConvertible,
  purchaseQuoteIsEditable,
  purchaseQuoteIsExpired,
  type PurchaseOrderStatus,
  type PurchaseQuoteStatus,
} from './constants'
import {
  ORDER_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  type OrderStatus,
  type QuoteStatus,
} from '../commerce/constants'

/**
 * Vocabulaire et arithmétique du commerce FOURNISSEUR — LOT 26.
 *
 * CE QUE CES TESTS ÉPROUVENT, ET QU'AUCUNE RECETTE NE PEUT
 *
 * Les branches d'un calcul et la forme d'une table de transitions. Une recette
 * de production ne joue qu'un chemin à la fois ; ici, chaque état est visité et
 * chaque refus est constaté.
 *
 * 🟥 ET SURTOUT : QUE LE VOCABULAIRE DE L'ACHAT N'EST PAS CELUI DE LA VENTE.
 * Les deux domaines partagent leurs TYPES de statut en base — Plan 02 §9.5 n'en
 * crée qu'une paire — mais pas leur sens. Un écran qui dirait « Émettre le
 * devis » à quelqu'un qui enregistre l'offre d'un fournisseur serait faux, et
 * ces tests le refusent explicitement.
 */

const QUOTE_STATUSES: PurchaseQuoteStatus[] = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REFUSED',
  'CONVERTED',
  'CANCELLED',
]

const ORDER_STATUSES: PurchaseOrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'DELIVERED',
  'INVOICED',
  'CANCELLED',
]

describe('vocabulaire du devis fournisseur', () => {
  it('nomme les six états, sans en oublier un', () => {
    for (const status of QUOTE_STATUSES) {
      expect(PURCHASE_QUOTE_STATUS_LABELS[status]).toBeTruthy()
      expect(PURCHASE_QUOTE_STATUS_TONES[status]).toBeTruthy()
      expect(PURCHASE_QUOTE_STATUS_HELP[status]).toBeTruthy()
    }
  })

  /**
   * 🟥 LE CŒUR DU LOT, EN UN TEST.
   *
   * `SENT` se lit « Émis » côté client et « Reçu » côté fournisseur : ADIKOM
   * n'émet aucun devis à un fournisseur, elle enregistre celui qu'il lui a
   * remis. Recopier les libellés de la vente aurait produit un écran qui ment
   * sur la nature de l'acte.
   */
  it('ne recopie pas les libellés de la vente là où le sens s’inverse', () => {
    expect(PURCHASE_QUOTE_STATUS_LABELS.SENT).toBe('Reçu')
    expect(QUOTE_STATUS_LABELS.SENT as string).toBe('Émis')
    expect(PURCHASE_QUOTE_STATUS_LABELS.SENT).not.toBe(QUOTE_STATUS_LABELS.SENT as string)

    expect(PURCHASE_ORDER_STATUS_LABELS.DELIVERED).toBe('Réceptionnée')
    expect(ORDER_STATUS_LABELS.DELIVERED as string).toBe('Livrée')

    expect(PURCHASE_ORDER_STATUS_LABELS.CONFIRMED).toBe('Passée')
    expect(ORDER_STATUS_LABELS.CONFIRMED as string).toBe('Confirmée')
  })

  it('couvre les mêmes codes que le commerce client — c’est le même type en base', () => {
    const vente = Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[]
    const achat = Object.keys(PURCHASE_QUOTE_STATUS_LABELS) as PurchaseQuoteStatus[]
    expect([...achat].sort()).toEqual([...vente].sort())

    const venteOrdre = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]
    const achatOrdre = Object.keys(PURCHASE_ORDER_STATUS_LABELS) as PurchaseOrderStatus[]
    expect([...achatOrdre].sort()).toEqual([...venteOrdre].sort())
  })

  /**
   * `CONVERTED` ne se déclare pas — il résulte de la création de la commande —
   * et le retour `CONVERTED → ACCEPTED` non plus : il résulte de son annulation.
   * L'écran ne doit donc jamais les proposer.
   */
  it('n’offre jamais « converti » comme action de l’utilisateur', () => {
    for (const status of QUOTE_STATUSES) {
      expect(PURCHASE_QUOTE_TRANSITIONS[status]).not.toContain('CONVERTED')
    }
    expect(PURCHASE_QUOTE_TRANSITIONS.CONVERTED).toEqual([])
  })

  it('offre un libellé d’ACTE pour chaque transition proposée', () => {
    for (const status of QUOTE_STATUSES) {
      for (const next of PURCHASE_QUOTE_TRANSITIONS[status]) {
        expect(
          PURCHASE_QUOTE_ACTION_LABELS[next],
          `Aucun libellé d’acte pour ${status} → ${next}`
        ).toBeTruthy()
      }
    }
  })

  it('n’ouvre aucune sortie depuis un état terminal', () => {
    expect(PURCHASE_QUOTE_TRANSITIONS.REFUSED).toEqual([])
    expect(PURCHASE_QUOTE_TRANSITIONS.CANCELLED).toEqual([])
  })

  it('ne laisse modifier qu’un brouillon', () => {
    for (const status of QUOTE_STATUSES) {
      expect(purchaseQuoteIsEditable(status)).toBe(status === 'DRAFT')
    }
  })

  it('ne laisse convertir qu’une offre retenue', () => {
    for (const status of QUOTE_STATUSES) {
      expect(purchaseQuoteIsConvertible(status)).toBe(status === 'ACCEPTED')
    }
  })
})

describe('péremption d’une offre — dérivée, jamais écrite (B-7)', () => {
  it('ne concerne qu’une offre en attente de décision', () => {
    expect(purchaseQuoteIsExpired('SENT', '2026-09-01', '2026-09-23')).toBe(true)
    // Retenue le 1er, elle ne s'évapore pas le 30.
    expect(purchaseQuoteIsExpired('ACCEPTED', '2026-09-01', '2026-09-23')).toBe(false)
    expect(purchaseQuoteIsExpired('CONVERTED', '2026-09-01', '2026-09-23')).toBe(false)
    expect(purchaseQuoteIsExpired('REFUSED', '2026-09-01', '2026-09-23')).toBe(false)
    expect(purchaseQuoteIsExpired('DRAFT', '2026-09-01', '2026-09-23')).toBe(false)
  })

  it('n’invente aucune durée lorsque la validité est absente', () => {
    expect(purchaseQuoteIsExpired('SENT', null, '2026-09-23')).toBe(false)
  })

  it('n’est pas dépassée le jour même de sa validité', () => {
    expect(purchaseQuoteIsExpired('SENT', '2026-09-23', '2026-09-23')).toBe(false)
    expect(purchaseQuoteIsExpired('SENT', '2026-09-24', '2026-09-23')).toBe(false)
  })
})

describe('vocabulaire de la commande fournisseur', () => {
  it('nomme les cinq états', () => {
    for (const status of ORDER_STATUSES) {
      expect(PURCHASE_ORDER_STATUS_LABELS[status]).toBeTruthy()
      expect(PURCHASE_ORDER_STATUS_TONES[status]).toBeTruthy()
      expect(PURCHASE_ORDER_STATUS_HELP[status]).toBeTruthy()
    }
  })

  it('n’offre jamais « facturée » comme action de l’utilisateur', () => {
    for (const status of ORDER_STATUSES) {
      expect(PURCHASE_ORDER_TRANSITIONS[status]).not.toContain('INVOICED')
    }
    expect(PURCHASE_ORDER_TRANSITIONS.INVOICED).toEqual([])
  })

  it('offre un libellé d’ACTE pour chaque transition proposée', () => {
    for (const status of ORDER_STATUSES) {
      for (const next of PURCHASE_ORDER_TRANSITIONS[status]) {
        expect(
          PURCHASE_ORDER_ACTION_LABELS[next],
          `Aucun libellé d’acte pour ${status} → ${next}`
        ).toBeTruthy()
      }
    }
  })

  /**
   * B-6 : la réception n'est PAS un passage obligé. Une commande passée se
   * facture sans avoir été réceptionnée — et c'est ce que l'écran doit offrir.
   */
  it('facture une commande passée sans exiger sa réception', () => {
    expect(purchaseOrderIsInvoiceable('CONFIRMED')).toBe(true)
    expect(purchaseOrderIsInvoiceable('DELIVERED')).toBe(true)
    expect(purchaseOrderIsInvoiceable('DRAFT')).toBe(false)
    expect(purchaseOrderIsInvoiceable('INVOICED')).toBe(false)
    expect(purchaseOrderIsInvoiceable('CANCELLED')).toBe(false)
  })

  it('ne laisse modifier qu’un brouillon', () => {
    for (const status of ORDER_STATUSES) {
      expect(purchaseOrderIsEditable(status)).toBe(status === 'DRAFT')
    }
  })

  it('laisse annuler tant que la commande n’est ni facturée ni déjà annulée', () => {
    expect(PURCHASE_ORDER_TRANSITIONS.DRAFT).toContain('CANCELLED')
    expect(PURCHASE_ORDER_TRANSITIONS.CONFIRMED).toContain('CANCELLED')
    expect(PURCHASE_ORDER_TRANSITIONS.DELIVERED).toContain('CANCELLED')
  })
})

describe('nature d’une ligne — A-13', () => {
  it('se LIT de la présence du service, jamais d’une colonne', () => {
    expect(purchaseLineKind('11111111-1111-1111-1111-111111111111')).toBe('CATALOG')
    expect(purchaseLineKind(null)).toBe('FREE')
    expect(PURCHASE_LINE_KIND_LABELS.CATALOG).toBeTruthy()
    expect(PURCHASE_LINE_KIND_LABELS.FREE).toBeTruthy()
  })
})

describe('arithmétique d’une ligne d’achat', () => {
  it('multiplie deux entiers, et rien d’autre', () => {
    expect(purchaseLineTotal(3, 40_000)).toBe(120_000)
    expect(purchaseLineTotal(1, 1)).toBe(1)
  })

  it('refuse une quantité invalide plutôt que de l’ignorer', () => {
    expect(() => purchaseLineTotal(0, 1000)).toThrow(/Quantité invalide/)
    expect(() => purchaseLineTotal(-2, 1000)).toThrow(/Quantité invalide/)
    expect(() => purchaseLineTotal(1.5, 1000)).toThrow(/Quantité invalide/)
    expect(() => purchaseLineTotal(Number.NaN, 1000)).toThrow(/Quantité invalide/)
  })

  it('refuse un prix invalide plutôt que de l’ignorer', () => {
    expect(() => purchaseLineTotal(1, 0)).toThrow(/Prix unitaire invalide/)
    expect(() => purchaseLineTotal(1, -5)).toThrow(/Prix unitaire invalide/)
    expect(() => purchaseLineTotal(1, 12.5)).toThrow(/Prix unitaire invalide/)
  })
})

describe('total d’un document d’achat', () => {
  const ligne = (quantity: number, unitPrice: number, isArchived = false) => ({
    quantity,
    unitPrice,
    isArchived,
  })

  it('somme les lignes actives', () => {
    expect(
      purchaseDocumentTotal([ligne(3, 40_000), ligne(1, 80_000), ligne(2, 7_500)])
    ).toBe(215_000)
  })

  it('écarte les lignes archivées (D6)', () => {
    expect(purchaseDocumentTotal([ligne(3, 40_000), ligne(10, 1_000_000, true)])).toBe(120_000)
  })

  it('rend zéro sur un document vide', () => {
    expect(purchaseDocumentTotal([])).toBe(0)
  })

  /**
   * Une ligne invalide ne peut pas exister en base — les contraintes l'y
   * empêchent. Si elle apparaissait, ce serait une corruption réelle : le calcul
   * doit alors LEVER, pas produire un montant faux.
   */
  it('lève sur une ligne corrompue au lieu de l’écarter en silence', () => {
    expect(() => purchaseDocumentTotal([ligne(1, 40_000), ligne(0, 1000)])).toThrow()
  })

  it('ne lève pas sur une ligne corrompue déjà archivée', () => {
    expect(purchaseDocumentTotal([ligne(1, 40_000), ligne(0, 1000, true)])).toBe(40_000)
  })
})

describe('écart entre la commande et la facture reçue', () => {
  /**
   * 🟥 LES DEUX MONTANTS NE SONT PAS FORCÉS À COÏNCIDER : la facture CONSTATE ce
   * que le fournisseur réclame (Module 07 §28, §54), la commande dit ce qu'ADIKOM
   * avait engagé. L'écart est une information, pas une erreur.
   */
  it('dit de combien le fournisseur dépasse ou reste en deçà', () => {
    expect(invoiceGap(215_000, 215_000)).toBe(0)
    expect(invoiceGap(215_000, 240_000)).toBe(25_000)
    expect(invoiceGap(215_000, 200_000)).toBe(-15_000)
  })

  /**
   * Un montant illisible n'est pas un montant nul (DEC-017) : un écart calculé
   * sur un zéro d'ignorance se lirait comme un écart réel.
   */
  it('se tait plutôt que de comparer à un zéro d’ignorance', () => {
    expect(invoiceGap(null, 240_000)).toBeNull()
    expect(invoiceGap(215_000, null)).toBeNull()
    expect(invoiceGap(null, null)).toBeNull()
  })
})
