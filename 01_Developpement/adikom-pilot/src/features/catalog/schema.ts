import { z } from 'zod'

import { parseAmount } from '@/lib/money'
import type { ServicePurpose, ServiceStatus } from './constants'

/**
 * Validation du catalogue de services — LOT 20.
 *
 * Reprend les invariants garantis par la migration 081 afin que l'utilisateur
 * reçoive un message AU NIVEAU DU CHAMP concerné plutôt qu'une erreur de
 * contrainte (Design System §39, CLAUDE.md §39).
 *
 * La base reste la barrière réelle : ce schéma ne la remplace pas, il évite
 * qu'elle ait à parler.
 *
 * Module pur, sans accès aux données : testable unitairement.
 */

const trimmedOrNull = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : null))

/* -------------------------------------------------------------------------- */
/*  Catégorie                                                                  */
/* -------------------------------------------------------------------------- */

export const serviceCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Le code est obligatoire.')
    .max(30, 'Le code est trop long.')
    // Une référence de classement ne contient ni espace ni accent : elle se
    // recopie, se cherche et se trie.
    .regex(/^[A-Za-z0-9._-]+$/, 'Le code n’accepte que lettres, chiffres, point, tiret et souligné.')
    .transform((value) => value.toUpperCase()),
  label: z
    .string()
    .trim()
    .min(1, 'Le libellé est obligatoire.')
    .max(120, 'Le libellé est trop long.'),
  description: trimmedOrNull(2000, 'La description est trop longue.'),
  displayOrder: z
    .string()
    .trim()
    .optional()
    .default('0')
    .transform((value, ctx) => {
      if (value === '') return 0
      const parsed = Number(value)
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        ctx.addIssue({ code: 'custom', message: 'Saisissez un nombre entier positif.' })
        return 0
      }
      return parsed
    }),
})

export type ServiceCategoryInput = z.output<typeof serviceCategorySchema>

/* -------------------------------------------------------------------------- */
/*  Service                                                                    */
/* -------------------------------------------------------------------------- */

const PURPOSES = ['PURCHASE', 'SALE', 'BOTH'] as const satisfies readonly ServicePurpose[]
const STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const satisfies readonly ServiceStatus[]

export const serviceSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Le libellé du service est obligatoire.')
    .max(160, 'Le libellé est trop long.'),
  categoryId: z.string().trim().min(1, 'Choisissez une catégorie.'),
  /*
   * LA DESTINATION EST OBLIGATOIRE, et le message le dit : elle ne se déduit pas
   * de la présence d'un prix (Plan 02 §7.4, DEC-043).
   */
  purpose: z.enum(PURPOSES, { message: 'Indiquez si ce service est acheté, vendu, ou les deux.' }),
  unitLabel: trimmedOrNull(40, 'L’unité est trop longue.'),
  description: trimmedOrNull(4000, 'La description est trop longue.'),
  notes: trimmedOrNull(4000, 'Les notes sont trop longues.'),
})

export type ServiceInput = z.output<typeof serviceSchema>

export const serviceStatusSchema = z.object({
  status: z.enum(STATUSES, { message: 'Statut inconnu.' }),
})

/* -------------------------------------------------------------------------- */
/*  Variante                                                                   */
/* -------------------------------------------------------------------------- */

export const serviceVariantSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Le libellé de la variante est obligatoire.')
    .max(120, 'Le libellé est trop long.'),
  sku: z
    .string()
    .trim()
    .max(40, 'La référence est trop longue.')
    .optional()
    .transform((value) => (value ? value : null)),
  displayOrder: z
    .string()
    .trim()
    .optional()
    .default('0')
    .transform((value, ctx) => {
      if (value === '') return 0
      const parsed = Number(value)
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        ctx.addIssue({ code: 'custom', message: 'Saisissez un nombre entier positif.' })
        return 0
      }
      return parsed
    }),
})

export type ServiceVariantInput = z.output<typeof serviceVariantSchema>

/* -------------------------------------------------------------------------- */
/*  Version de prix — vente comme achat                                        */
/* -------------------------------------------------------------------------- */

/**
 * Une version de prix : un montant, une date d'effet, un motif.
 *
 * PAS DE DATE DE FIN À LA SAISIE, et c'est délibéré : la fin d'une version est
 * la veille du début de la suivante, et la base la pose elle-même
 * (`set_service_price`). La laisser saisir ouvrirait deux façons de dire la même
 * chose, qui finiraient par diverger.
 *
 * UNE DATE D'EFFET FUTURE EST ACCEPTÉE — c'est précisément ce que la Direction
 * demande : préparer le prix du 1ᵉʳ juillet avant le 1ᵉʳ juillet.
 */
export const servicePriceSchema = z.object({
  variantId: z.string().trim().min(1, 'Variante introuvable.'),
  amount: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const parsed = parseAmount(value)
      if (parsed === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Saisissez un montant en francs comoriens, sans décimale.',
        })
        return 0
      }
      if (parsed <= 0) {
        ctx.addIssue({ code: 'custom', message: 'Un prix doit être strictement positif.' })
        return 0
      }
      return parsed
    }),
  validFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez la date à partir de laquelle ce prix s’applique.'),
  reason: trimmedOrNull(500, 'Le motif est trop long.'),
})

export type ServicePriceInput = z.output<typeof servicePriceSchema>
