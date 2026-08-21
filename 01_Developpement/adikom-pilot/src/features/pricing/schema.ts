import { z } from 'zod'

import { parseAmount } from '@/lib/money'
import type { PricingMode, PricingScope, PricingUnit } from './constants'

/**
 * Validation d'une règle tarifaire.
 *
 * Reprend exactement les invariants garantis en base (migration 017) afin que
 * l'utilisateur reçoive un message au niveau du champ concerné plutôt qu'une
 * erreur de contrainte (Design System §39, CLAUDE.md §39). La base reste la
 * barrière réelle : ce schéma ne la remplace pas, il évite qu'elle ait à parler.
 *
 * Module pur, sans accès aux données : testable unitairement et importable
 * depuis un composant client.
 */

/** Analyse un pourcentage saisi à la française (« 7,5 ») ou à l'anglaise. */
export function parsePercent(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null

  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

const optionalId = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))

export type PricingRuleInput = {
  scope: PricingScope
  clientId: string | null
  vehicleId: string | null
  categoryId: string | null
  mode: PricingMode
  amount: number | null
  unit: PricingUnit | null
  discountPercent: number | null
  validFrom: string | null
  validTo: string | null
  conditions: string | null
  isActive: boolean
}

const rawSchema = z.object({
  scope: z.enum(['GLOBAL', 'CATEGORY', 'VEHICLE']),
  clientId: optionalId,
  vehicleId: optionalId,
  categoryId: optionalId,
  mode: z.enum(['AMOUNT', 'DISCOUNT']),
  amount: z.string().trim().optional().default(''),
  unit: z.string().trim().optional().default(''),
  discountPercent: z.string().trim().optional().default(''),
  validFrom: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  validTo: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  conditions: z
    .string()
    .trim()
    .max(2000, 'Les conditions particulières sont trop longues.')
    .optional()
    .transform((value) => (value ? value : null)),
  isActive: z.boolean().optional().default(true),
})

export const pricingRuleSchema = rawSchema.transform((raw, ctx): PricingRuleInput => {
  // --- Portée : une règle vise tous les véhicules, une catégorie, ou un
  //     véhicule précis. Jamais deux à la fois (contrainte pricing_rules_scope).
  const vehicleId = raw.scope === 'VEHICLE' ? raw.vehicleId : null
  const categoryId = raw.scope === 'CATEGORY' ? raw.categoryId : null

  if (raw.scope === 'VEHICLE' && !vehicleId) {
    ctx.addIssue({
      code: 'custom',
      path: ['vehicleId'],
      message: 'Choisissez le véhicule concerné.',
    })
  }

  if (raw.scope === 'CATEGORY' && !categoryId) {
    ctx.addIssue({
      code: 'custom',
      path: ['categoryId'],
      message: 'Choisissez la catégorie concernée.',
    })
  }

  // --- Montant ou remise, jamais les deux (pricing_rules_amount_xor_discount).
  let amount: number | null = null
  let unit: PricingUnit | null = null
  let discountPercent: number | null = null

  if (raw.mode === 'AMOUNT') {
    amount = parseAmount(raw.amount)

    if (amount === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Saisissez un montant en francs comoriens, sans décimale.',
      })
    } else if (amount < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Un tarif ne peut pas être négatif.',
      })
    }

    // DEC-001 : un montant sans unité n'existe pas.
    if (raw.unit === 'DAY' || raw.unit === 'FLAT') {
      unit = raw.unit
    } else {
      ctx.addIssue({
        code: 'custom',
        path: ['unit'],
        message: 'Précisez si ce montant s’applique par jour ou en forfait.',
      })
    }
  } else {
    // Une remise suppose un tarif de référence, donc un client
    // (pricing_rules_discount_needs_client).
    if (!raw.clientId) {
      ctx.addIssue({
        code: 'custom',
        path: ['clientId'],
        message: 'Une remise ne peut être accordée qu’à un client.',
      })
    }

    discountPercent = parsePercent(raw.discountPercent)

    if (discountPercent === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountPercent'],
        message: 'Saisissez un pourcentage, par exemple 10 ou 7,5.',
      })
    } else if (discountPercent <= 0 || discountPercent >= 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountPercent'],
        message: 'La remise doit être strictement comprise entre 0 et 100 %.',
      })
    }
  }

  // --- Période de validité (pricing_rules_period).
  if (raw.validFrom && raw.validTo && raw.validTo < raw.validFrom) {
    ctx.addIssue({
      code: 'custom',
      path: ['validTo'],
      message: 'La fin de validité ne peut pas précéder son début.',
    })
  }

  return {
    scope: raw.scope,
    clientId: raw.clientId,
    vehicleId,
    categoryId,
    mode: raw.mode,
    amount,
    unit,
    discountPercent,
    validFrom: raw.validFrom,
    validTo: raw.validTo,
    conditions: raw.conditions,
    isActive: raw.isActive,
  }
})

export type PricingRuleFormValues = z.input<typeof rawSchema>
