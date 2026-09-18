import { describe, expect, it } from 'vitest'

import { rateChangeSchema, vehicleSwapSchema } from './schema'
import { businessDay } from './constants'

/**
 * Ce que la saisie d'un avenant doit refuser — LOT 22, DEC-045.
 *
 * La base reste la barrière réelle : `fn_rental_amendment_guard`,
 * `fn_rental_segment_guard` et les deux fonctions atomiques opposent les mêmes
 * refus à un appel direct. Ces contrôles éprouvent la COUCHE QUI PARLE — celle
 * qui doit dire à l'utilisateur, au niveau du champ, ce qui ne va pas.
 *
 * DEUX RÈGLES MÉTIER Y SONT VÉRIFIÉES PLUTÔT QUE SUPPOSÉES :
 *
 *   · 🟩 A-5 — sans montant, le client paie le tarif du nouveau véhicule ; avec
 *     un montant, la raison de la dérogation devient OBLIGATOIRE ;
 *   · 🟩 A-4 — un avenant porte toujours son motif : un changement de véhicule
 *     sans raison écrite serait un fait sans cause.
 */

const BASE_SWAP = {
  rentalId: '00000000-0000-0000-0000-000000000001',
  vehicleId: '00000000-0000-0000-0000-000000000002',
  effectiveAt: '2026-09-05T08:00',
  reason: 'Panne immobilisante du véhicule',
  amount: undefined,
  unit: undefined,
  rateReason: undefined,
  notes: undefined,
}

const BASE_RATE = {
  rentalId: '00000000-0000-0000-0000-000000000001',
  effectiveAt: '2026-09-05T08:00',
  amount: '70000',
  unit: 'DAY' as const,
  reason: 'Passage en longue durée, tarif renégocié',
  notes: undefined,
}

/** Premier message d'erreur rattaché à un champ. */
function fieldError(result: { success: boolean; error?: unknown }, field: string): string | null {
  if (result.success) return null
  const issues = (result.error as { issues: { path: (string | number)[]; message: string }[] })
    .issues
  return issues.find((issue) => issue.path[0] === field)?.message ?? null
}

/* -------------------------------------------------------------------------- */
/*  Remplacement de véhicule                                                   */
/* -------------------------------------------------------------------------- */

describe('remplacement de véhicule', () => {
  it('accepte un remplacement sans tarif : le client paie celui du barème', () => {
    const result = vehicleSwapSchema.safeParse(BASE_SWAP)

    expect(result.success).toBe(true)
    // `null` et non `0` : l'absence de montant signifie « applique le barème »,
    // jamais « le client ne paie rien ».
    expect(result.success && result.data.amount).toBeNull()
    expect(result.success && result.data.rateReason).toBeNull()
  })

  it('exige le véhicule de remplacement', () => {
    const result = vehicleSwapSchema.safeParse({ ...BASE_SWAP, vehicleId: '  ' })
    expect(fieldError(result, 'vehicleId')).toMatch(/véhicule de remplacement/i)
  })

  it('exige la date de bascule, et sous la forme attendue', () => {
    expect(fieldError(vehicleSwapSchema.safeParse({ ...BASE_SWAP, effectiveAt: '' }), 'effectiveAt'))
      .toMatch(/date et l’heure/i)

    expect(
      fieldError(vehicleSwapSchema.safeParse({ ...BASE_SWAP, effectiveAt: '05/09/2026' }), 'effectiveAt')
    ).toMatch(/date et l’heure/i)
  })

  it('exige le motif — un changement de véhicule sans cause ne se relit pas', () => {
    expect(fieldError(vehicleSwapSchema.safeParse({ ...BASE_SWAP, reason: '' }), 'reason')).toMatch(
      /pourquoi le véhicule est remplacé/i
    )
    expect(fieldError(vehicleSwapSchema.safeParse({ ...BASE_SWAP, reason: '  a ' }), 'reason')).not
      .toBeNull()
  })

  /**
   * 🟩 A-5, CAS D'EXCEPTION — « des situations peuvent se présenter autrement ».
   *
   * Le montant dérogatoire est accepté, MAIS il ne passe pas sans sa raison :
   * une dérogation silencieuse serait exactement ce que la consigne interdit.
   */
  it('accepte un tarif dérogatoire accompagné de sa raison', () => {
    const result = vehicleSwapSchema.safeParse({
      ...BASE_SWAP,
      amount: '50 000',
      unit: 'DAY',
      rateReason: 'ADIKOM absorbe l’écart : l’indisponibilité est de son fait',
    })

    expect(result.success).toBe(true)
    // Les espaces d'usage sont acceptés, le montant reste entier (DEC-010).
    expect(result.success && result.data.amount).toBe(50000)
  })

  it('refuse un tarif dérogatoire sans raison écrite', () => {
    const result = vehicleSwapSchema.safeParse({ ...BASE_SWAP, amount: '50000', unit: 'DAY' })
    expect(fieldError(result, 'rateReason')).toMatch(/exige sa raison/i)
  })

  it('refuse une raison de dérogation sans tarif : elle ne motiverait rien', () => {
    const result = vehicleSwapSchema.safeParse({
      ...BASE_SWAP,
      rateReason: 'Geste commercial',
    })
    expect(fieldError(result, 'amount')).toMatch(/sans saisir de tarif/i)
  })

  it('refuse un montant décimal : le franc comorien n’a pas de sous-unité', () => {
    const result = vehicleSwapSchema.safeParse({
      ...BASE_SWAP,
      amount: '50000,75',
      rateReason: 'Motif',
    })
    expect(fieldError(result, 'amount')).toMatch(/sans décimale/i)
  })

  it('refuse un tarif négatif', () => {
    const result = vehicleSwapSchema.safeParse({
      ...BASE_SWAP,
      amount: '-1000',
      rateReason: 'Motif',
    })
    expect(fieldError(result, 'amount')).toMatch(/négatif/i)
  })

  /** Un tarif à ZÉRO est un tarif : gratuité consentie, et non une absence. */
  it('accepte un tarif nul accompagné de sa raison', () => {
    const result = vehicleSwapSchema.safeParse({
      ...BASE_SWAP,
      amount: '0',
      unit: 'DAY',
      rateReason: 'Mise à disposition gratuite pendant l’immobilisation',
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.amount).toBe(0)
  })

  it('n’accepte que les deux unités cochées par la Direction', () => {
    expect(
      vehicleSwapSchema.safeParse({
        ...BASE_SWAP,
        amount: '50000',
        unit: 'MONTH',
        rateReason: 'Motif',
      }).success
    ).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  Changement de tarif                                                       */
/* -------------------------------------------------------------------------- */

describe('changement de tarif', () => {
  it('accepte un changement motivé', () => {
    const result = rateChangeSchema.safeParse(BASE_RATE)

    expect(result.success).toBe(true)
    expect(result.success && result.data.amount).toBe(70000)
    expect(result.success && result.data.unit).toBe('DAY')
  })

  it('exige le montant : un avenant de tarif sans tarif n’a pas d’objet', () => {
    expect(fieldError(rateChangeSchema.safeParse({ ...BASE_RATE, amount: '' }), 'amount')).toMatch(
      /Saisissez le tarif/i
    )
  })

  it('exige l’unité', () => {
    expect(
      rateChangeSchema.safeParse({ ...BASE_RATE, unit: undefined as unknown as 'DAY' }).success
    ).toBe(false)
  })

  it('exige le motif — un prix ne se modifie jamais en silence', () => {
    expect(fieldError(rateChangeSchema.safeParse({ ...BASE_RATE, reason: '' }), 'reason')).toMatch(
      /pourquoi le tarif change/i
    )
  })

  /**
   * 🟥 AUCUN BARÈME DE PÉNALITÉ N'EST PROPOSÉ.
   *
   * A-7 évoque « des pénalités de 20 à 100 % » sans dire de quoi, ni qui fixe le
   * taux, ni s'il s'agit d'une majoration ou d'une ligne de facture. Le schéma ne
   * connaît donc aucun champ de pourcentage : le montant est saisi.
   */
  it('n’expose aucun champ de pénalité ni de pourcentage', () => {
    const keys = Object.keys(rateChangeSchema.shape)

    expect(keys).toEqual(['rentalId', 'effectiveAt', 'amount', 'unit', 'reason', 'notes'])
    expect(keys.some((key) => /penalt|percent|pourcent|taux/i.test(key))).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  Le jour est comorien                                                       */
/* -------------------------------------------------------------------------- */

describe('jour métier', () => {
  /**
   * `Indian/Comoro` est UTC+3 toute l'année. Un instant à 22 h UTC est donc DÉJÀ
   * le lendemain à Moroni : découper l'instant en UTC daterait la bascule de la
   * veille, et résoudrait le coût sur la mauvaise version un jour de changement
   * de tarif.
   */
  it('date un instant du soir sur le jour comorien, non sur le jour UTC', () => {
    expect(businessDay('2026-09-17T22:30:00.000Z')).toBe('2026-09-18')
    expect(businessDay('2026-09-17T20:59:00.000Z')).toBe('2026-09-17')
  })

  it('retombe sur aujourd’hui plutôt que d’inventer une date invalide', () => {
    expect(businessDay('pas une date')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(businessDay(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
