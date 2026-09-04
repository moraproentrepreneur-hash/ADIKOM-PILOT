import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@/lib/auth/permissions'
import {
  AMOUNT_LABELS,
  KIND_META,
  KINDS,
  LEVEL_LABELS,
  LEVEL_RANK,
  LEVEL_TONES,
  LEVELS,
  OBJECT_ACTION,
  OBJECT_HREF,
  OBJECT_TYPES,
  SOURCE_LABELS,
  SOURCES,
  STATE_LABELS,
  STATES,
  WATCH_SOURCES,
  isLevel,
  isObjectType,
  isSource,
  isState,
} from './constants'

/**
 * Le vocabulaire du Centre de notifications — Module 02.
 *
 * CE QUI EST ÉPROUVÉ ICI SONT DES DÉFAUTS RÉELS, PAS DES FORMALITÉS.
 *
 * La veille est en SQL ; l'écran, lui, traduit des `kind` en phrases. Une nature
 * ajoutée en base sans libellé ici produirait une notification sans titre — le
 * §5 exige au contraire qu'elle « contienne suffisamment d'informations pour être
 * comprise rapidement ». Un objet sans lien produirait une notification sans
 * action (§21, §34).
 *
 * Et un paramètre d'URL bricolé ne doit jamais atteindre la base : les gardes de
 * validation sont éprouvées avec de vraies chaînes hostiles.
 */

describe('niveaux', () => {
  it('les quatre niveaux produits ont un libellé, un ton et un rang', () => {
    for (const level of LEVELS) {
      expect(LEVEL_LABELS[level]).toBeTruthy()
      expect(LEVEL_TONES[level]).toBeTruthy()
      expect(LEVEL_RANK[level]).toBeGreaterThan(0)
    }
  })

  it('sont déclarés par priorité décroissante (§25)', () => {
    // L'écran présente les filtres dans cet ordre, et la base trie dans le même :
    // les inverser ferait remonter le rappel avant l'urgence.
    const ranks = LEVELS.map((level) => LEVEL_RANK[level])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(LEVEL_RANK.URGENT).toBeLessThan(LEVEL_RANK.IMPORTANT)
    expect(LEVEL_RANK.IMPORTANT).toBeLessThan(LEVEL_RANK.ATTENTION)
    expect(LEVEL_RANK.ATTENTION).toBeLessThan(LEVEL_RANK.REMINDER)
  })

  it('chaque niveau porte un MOT, jamais une seule couleur (§20 Module 01)', () => {
    // Un daltonien, une impression en noir et blanc ou un lecteur d'écran
    // doivent lire la même hiérarchie.
    expect(new Set(Object.values(LEVEL_LABELS)).size).toBe(LEVELS.length)
  })

  it('refuse un niveau bricolé dans l’URL', () => {
    expect(isLevel('URGENT')).toBe(true)
    expect(isLevel('INFORMATION')).toBe(false)
    expect(isLevel("'; drop table")).toBe(false)
    expect(isLevel(undefined)).toBe(false)
  })
})

describe('natures', () => {
  it('chaque nature produite par la veille a un titre et une origine', () => {
    for (const kind of KINDS) {
      const meta = KIND_META[kind]
      expect(meta, kind).toBeDefined()
      expect(meta.title, kind).toBeTruthy()
      expect(meta.origin, kind).toBeTruthy()
      expect(['day', 'minute']).toContain(meta.precision)
    }
  })

  it('n’en décrit aucune que la veille ne produit pas', () => {
    expect(Object.keys(KIND_META).sort()).toEqual([...KINDS].sort())
  })

  it('situe chaque notification dans le temps par une phrase, pas par une date nue', () => {
    for (const kind of KINDS) {
      const phrase = KIND_META[kind].moment('01/09/2026')
      expect(phrase, kind).toContain('01/09/2026')
      // Une date seule ne dit pas s'il s'agit d'une échéance passée ou à venir.
      expect(phrase.length, kind).toBeGreaterThan('01/09/2026'.length + 4)
    }
  })

  it('une échéance se lit au jour, un départ à la minute', () => {
    // Afficher « 00:00 » derrière une échéance de facture inventerait une
    // précision que la donnée n'a pas.
    expect(KIND_META.CUSTOMER_INVOICE_OVERDUE.precision).toBe('day')
    expect(KIND_META.SUPPLIER_INVOICE_OVERDUE.precision).toBe('day')
    expect(KIND_META.VEHICLE_DOCUMENT_EXPIRING.precision).toBe('day')
    expect(KIND_META.VEHICLE_DOCUMENT_EXPIRED.precision).toBe('day')
    expect(KIND_META.RESERVATION_DEPARTURE.precision).toBe('minute')
    expect(KIND_META.RENTAL_RETURN_LATE.precision).toBe('minute')
  })

  it('seules les natures financières annoncent un montant, et le nomment', () => {
    expect(Object.keys(AMOUNT_LABELS).sort()).toEqual([
      'CUSTOMER_INVOICE_OVERDUE',
      'SUPPLIER_INVOICE_OVERDUE',
    ])
    // CLAUDE.md §16 : le libellé doit DIRE que les imputations sont déduites,
    // sans quoi le lecteur croirait lire le montant facturé.
    expect(AMOUNT_LABELS.SUPPLIER_INVOICE_OVERDUE).toMatch(/imputations/i)
  })
})

describe('accès à l’objet concerné (§21, §34)', () => {
  it('chaque type d’objet mène à un écran et porte une action nommée', () => {
    for (const type of OBJECT_TYPES) {
      expect(OBJECT_HREF[type]('id'), type).toMatch(/^\//)
      expect(OBJECT_ACTION[type], type).toBeTruthy()
    }
  })

  it('mène à l’écran documenté, jamais à une liste', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    expect(OBJECT_HREF.reservation(id)).toBe(`/location/reservations/${id}`)
    expect(OBJECT_HREF.rental(id)).toBe(`/location/locations/${id}`)
    expect(OBJECT_HREF.maintenance(id)).toBe(`/location/maintenance/${id}`)
    expect(OBJECT_HREF.incident(id)).toBe(`/location/incidents/${id}`)
    expect(OBJECT_HREF.customer_invoice(id)).toBe(`/facturation/clients/${id}`)
    expect(OBJECT_HREF.supplier_invoice(id)).toBe(`/facturation/fournisseurs/${id}`)
    // Une échéance documentaire s'ouvre sur l'onglet où elle se corrige.
    expect(OBJECT_HREF.vehicle(id)).toBe(`/location/parc/${id}?onglet=documents`)
  })

  it('refuse un type d’objet inconnu', () => {
    expect(isObjectType('rental')).toBe(true)
    expect(isObjectType('utilisateur')).toBe(false)
  })
})

describe('filtres (§18)', () => {
  it('les trois modules producteurs sont nommés', () => {
    // `projects` a rejoint la veille avec le LOT 12 (Module 03 §38 — échéances
    // et retards de tâches). Un filtre proposé sans famille correspondante
    // resterait toujours vide ; une famille sans filtre serait introuvable.
    expect(SOURCES).toEqual(['rental', 'billing', 'projects'])
    for (const source of SOURCES) expect(SOURCE_LABELS[source]).toBeTruthy()
  })

  it('les deux états de lecture sont nommés (§19)', () => {
    expect(STATES).toEqual(['unread', 'read'])
    for (const state of STATES) expect(STATE_LABELS[state]).toBeTruthy()
  })

  it('refuse un module ou un état bricolés', () => {
    expect(isSource('billing')).toBe(true)
    expect(isSource('paie')).toBe(false)
    expect(isState('unread')).toBe(true)
    expect(isState('lues')).toBe(false)
  })
})

describe('sources de veille et capacités (§22, §37)', () => {
  it('chaque source nomme au moins une capacité', () => {
    expect(WATCH_SOURCES.length).toBeGreaterThan(0)
    for (const source of WATCH_SOURCES) {
      expect(source.label).toBeTruthy()
      expect(source.requires.length).toBeGreaterThan(0)
    }
  })

  it('une somme muette est refusée, jamais approchée (DEC-032 §d)', () => {
    // Sans les règlements, une facture soldée paraîtrait impayée. Le mode
    // `all` est donc la garantie que la source se TAIT au lieu de mentir.
    const clients = WATCH_SOURCES.find((s) => s.label.includes('Factures clients'))
    expect(clients?.mode).toBe('all')
    expect(clients?.requires).toContain(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW)
  })

  it('une imputation n’est pas un paiement, et ne peut pas être ignorée (CLAUDE.md §57)', () => {
    const suppliers = WATCH_SOURCES.find((s) => s.label.includes('Factures fournisseurs'))
    expect(suppliers?.mode).toBe('all')
    expect(suppliers?.requires).toContain(PERMISSIONS.SUPPLIER_INVOICES_VIEW)
    expect(suppliers?.requires).toContain(PERMISSIONS.IMPUTATIONS_VIEW)
    expect(suppliers?.requires).toContain(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW)
  })

  it('un document de véhicule se lit par l’une OU l’autre capacité', () => {
    // C'est la policy de la table (migration 008) : l'écran ne peut pas être
    // plus restrictif que la base sans mentir sur le motif.
    const documents = WATCH_SOURCES.find((s) => s.label.includes('documents de véhicule'))
    expect(documents?.mode).toBe('any')
    expect(documents?.requires).toEqual([
      PERMISSIONS.VEHICLE_DOCUMENTS_VIEW,
      PERMISSIONS.FLEET_VIEW,
    ])
  })

  it('aucune capacité de notification hors `notifications.view` n’est supposée', () => {
    // DEC-024 : le catalogue représente les capacités réelles. Marquer comme lu
    // n'en est pas une de plus.
    const codes = WATCH_SOURCES.flatMap((source) => source.requires)
    expect(codes.filter((code) => code.startsWith('notifications.'))).toEqual([])
  })
})
