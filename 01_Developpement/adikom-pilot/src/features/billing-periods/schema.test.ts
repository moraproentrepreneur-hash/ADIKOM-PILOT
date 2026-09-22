import { describe, expect, it } from 'vitest'

import { billingPlanSchema, cancelPeriodSchema, periodInvoiceSchema } from './schema'
import { periodState, ratePortions, type SegmentLike } from './constants'

/**
 * Contrôles unitaires de la facturation périodique — LOT 23, DEC-047.
 *
 * Ces modules sont PURS : ils ne lisent rien, n'écrivent rien, et n'ont besoin
 * d'aucune base. Ce qu'ils décident se vérifie donc sans décor — et ce qu'ils
 * décident engage la créance d'ADIKOM.
 *
 * LA BASE RESTE LA BARRIÈRE RÉELLE. Ces schémas ne la remplacent pas : ils
 * évitent qu'elle ait à parler, et ils portent le message AU NIVEAU DU CHAMP.
 */

/* -------------------------------------------------------------------------- */
/*  Régime de facturation — 🟩 A-6                                             */
/* -------------------------------------------------------------------------- */

const RENTAL = '00000000-0000-0000-0000-000000000001'

describe('billingPlanSchema — le régime et sa cadence', () => {
  it('accepte une durée fixée sans cadence', () => {
    const parsed = billingPlanSchema.safeParse({
      rentalId: RENTAL,
      rentalType: 'FIXED_TERM',
      cadence: '',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.cadence).toBeNull()
  })

  it('REFUSE une longue durée sans cadence — la Direction a validé les DEUX', () => {
    const parsed = billingPlanSchema.safeParse({
      rentalId: RENTAL,
      rentalType: 'LONG_TERM',
      cadence: '',
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const issue = parsed.error.issues.find((item) => item.path[0] === 'cadence')
      expect(issue?.message).toMatch(/chaque fin de mois/i)
    }
  })

  it('REFUSE une cadence sur une durée fixée — elle ne gouvernerait rien', () => {
    const parsed = billingPlanSchema.safeParse({
      rentalId: RENTAL,
      rentalType: 'FIXED_TERM',
      cadence: 'MONTHLY',
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.some((item) => item.path[0] === 'cadence')).toBe(true)
    }
  })

  it('accepte les deux cadences validées, et refuse toute autre', () => {
    for (const cadence of ['MONTHLY', 'CONTRACT_TERM']) {
      expect(
        billingPlanSchema.safeParse({ rentalId: RENTAL, rentalType: 'LONG_TERM', cadence }).success
      ).toBe(true)
    }

    // Ni hebdomadaire, ni trimestrielle : aucune case ne les coche.
    expect(
      billingPlanSchema.safeParse({ rentalId: RENTAL, rentalType: 'LONG_TERM', cadence: 'WEEKLY' })
        .success
    ).toBe(false)
  })

  it('n’expose AUCUN champ de pénalité ni de pourcentage — A-7 n’est pas tranchée', () => {
    const parsed = billingPlanSchema.safeParse({
      rentalId: RENTAL,
      rentalType: 'LONG_TERM',
      cadence: 'MONTHLY',
      penaltyPercent: '20',
      penalty: 'true',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(Object.keys(parsed.data).sort()).toEqual(['cadence', 'rentalId', 'rentalType'])
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  Facture d'une période                                                      */
/* -------------------------------------------------------------------------- */

describe('periodInvoiceSchema — la facture d’une période', () => {
  const BASE = {
    periodId: '00000000-0000-0000-0000-0000000000aa',
    rentalId: RENTAL,
    invoiceDate: '2026-11-01',
  }

  it('accepte une facture sans échéance', () => {
    const parsed = periodInvoiceSchema.safeParse({ ...BASE, dueDate: '', notes: '' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.dueDate).toBeNull()
      expect(parsed.data.notes).toBeNull()
    }
  })

  it('REFUSE une échéance antérieure à la facture', () => {
    const parsed = periodInvoiceSchema.safeParse({ ...BASE, dueDate: '2026-10-15' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.some((item) => item.path[0] === 'dueDate')).toBe(true)
    }
  })

  it('ne porte NI quantité, NI montant, NI durée — DEC-008', () => {
    const parsed = periodInvoiceSchema.safeParse({
      ...BASE,
      quantity: '30',
      amount: '1500000',
      days: '30',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(Object.keys(parsed.data).sort()).toEqual([
        'dueDate',
        'invoiceDate',
        'notes',
        'periodId',
        'rentalId',
      ])
    }
  })
})

describe('cancelPeriodSchema', () => {
  it('exige la période ET son contrat — la revalidation d’écran en dépend', () => {
    expect(cancelPeriodSchema.safeParse({ periodId: 'x', rentalId: '' }).success).toBe(false)
    expect(cancelPeriodSchema.safeParse({ periodId: 'x', rentalId: 'y' }).success).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/*  L'état d'une période — DÉDUIT, jamais stocké                               */
/* -------------------------------------------------------------------------- */

describe('periodState — trois faits, et rien d’autre', () => {
  const NOW = new Date('2026-11-15T10:00:00.000Z')

  it('« À venir » tant que la période court', () => {
    expect(
      periodState({ status: 'PLANNED', to: '2026-12-01T00:00:00.000Z', invoiceStatus: null }, NOW)
    ).toBe('UPCOMING')
  })

  it('« Facturable » dès qu’elle est échue et sans facture', () => {
    expect(
      periodState({ status: 'PLANNED', to: '2026-11-01T00:00:00.000Z', invoiceStatus: null }, NOW)
    ).toBe('BILLABLE')
  })

  it('« Facture en brouillon » n’est PAS « Facturée » — aucune créance n’est reconnue', () => {
    expect(
      periodState({ status: 'PLANNED', to: '2026-11-01T00:00:00.000Z', invoiceStatus: 'DRAFT' }, NOW)
    ).toBe('DRAFTED')
  })

  it('« Facturée » dès qu’une facture émise la couvre', () => {
    expect(
      periodState(
        { status: 'PLANNED', to: '2026-11-01T00:00:00.000Z', invoiceStatus: 'ISSUED' },
        NOW
      )
    ).toBe('INVOICED')
  })

  it('« Annulée » l’emporte sur tout le reste', () => {
    expect(
      periodState(
        { status: 'CANCELLED', to: '2026-11-01T00:00:00.000Z', invoiceStatus: null },
        NOW
      )
    ).toBe('CANCELLED')
  })

  it('une borne illisible ne devient JAMAIS « Facturable »', () => {
    // Mieux vaut ne pas proposer de facturer que de proposer à tort.
    expect(periodState({ status: 'PLANNED', to: '', invoiceStatus: null }, NOW)).toBe('UPCOMING')
  })
})

/* -------------------------------------------------------------------------- */
/*  Portions tarifaires — consigne §11                                         */
/* -------------------------------------------------------------------------- */

const segment = (over: Partial<SegmentLike>): SegmentLike => ({
  id: 'seg-1',
  sequenceNo: 1,
  status: 'ENDED',
  vehicleLabel: 'Toyota T5 — AB-123-CD',
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-11-01T00:00:00.000Z',
  lockedAmount: 50_000,
  lockedUnit: 'DAY',
  ...over,
})

describe('ratePortions — une période peut traverser plusieurs tarifs', () => {
  const PERIOD = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }

  it('rend UNE portion quand un seul véhicule a servi', () => {
    const portions = ratePortions(PERIOD, [segment({})])

    expect(portions).toHaveLength(1)
    expect(portions[0].unitPrice).toBe(50_000)
    expect(portions[0].from).toBe(PERIOD.from)
    expect(portions[0].to).toBe(PERIOD.to)
  })

  it('🟩 LE CAS DE LA CONSIGNE §11 : deux véhicules, deux tarifs, deux portions', () => {
    const portions = ratePortions(PERIOD, [
      segment({ id: 'a', from: '2026-10-01T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' }),
      segment({
        id: 'b',
        sequenceNo: 2,
        status: 'ACTIVE',
        vehicleLabel: 'Nissan Patrol — EF-456-GH',
        from: '2026-10-12T00:00:00.000Z',
        to: '2026-11-01T00:00:00.000Z',
        lockedAmount: 60_000,
      }),
    ])

    expect(portions).toHaveLength(2)
    expect(portions[0].unitPrice).toBe(50_000)
    expect(portions[1].unitPrice).toBe(60_000)

    // AUCUNE MOYENNE, AUCUN TOTAL : chaque tarif reste attaché à sa portion.
    expect(portions.map((item) => item.unitPrice)).toEqual([50_000, 60_000])

    // La bascule appartient à la portion SUIVANTE — convention `[début, fin)`.
    expect(portions[0].to).toBe('2026-10-12T00:00:00.000Z')
    expect(portions[1].from).toBe('2026-10-12T00:00:00.000Z')
  })

  it('coupe le segment aux bornes de la période, jamais au-delà', () => {
    const portions = ratePortions(PERIOD, [
      segment({ from: '2026-09-15T00:00:00.000Z', to: '2026-12-20T00:00:00.000Z' }),
    ])

    expect(portions[0].from).toBe(PERIOD.from)
    expect(portions[0].to).toBe(PERIOD.to)
  })

  it('écarte un segment ANNULÉ — il n’a jamais couru, il ne se facture pas', () => {
    expect(ratePortions(PERIOD, [segment({ status: 'CANCELLED' })])).toHaveLength(0)
  })

  it('écarte une intersection de durée NULLE — `[début, fin)`', () => {
    // Le segment s'achève à l'instant même où la période commence : il n'a rien
    // couvert de cette période, et une ligne de facture de durée nulle serait
    // une ligne de trop.
    const portions = ratePortions(PERIOD, [
      segment({ from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }),
    ])

    expect(portions).toHaveLength(0)
  })

  it('ne porte AUCUN coût fournisseur — la confidentialité tient par le type', () => {
    const portions = ratePortions(PERIOD, [segment({})])
    const keys = Object.keys(portions[0]).join(' ')

    expect(keys).not.toMatch(/cost|commission|supplier/i)
  })

  it('date la désignation à l’heure DES COMORES, pas en UTC', () => {
    // 21 h UTC le 30 septembre = 0 h le 1er octobre à Moroni. Une désignation
    // qui se tromperait de jour serait remise au client.
    const portions = ratePortions(
      { from: '2026-09-30T21:00:00.000Z', to: '2026-10-31T21:00:00.000Z' },
      [segment({ from: '2026-09-30T21:00:00.000Z', to: '2026-10-31T21:00:00.000Z' })]
    )

    expect(portions[0].label).toContain('01/10/2026')
  })
})
