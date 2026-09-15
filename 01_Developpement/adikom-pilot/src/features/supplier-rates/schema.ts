import { z } from 'zod'

import { parseAmount } from '@/lib/money'

/**
 * Validation des tarifs fournisseurs — LOT 21, DEC-044.
 *
 * Reprend les invariants garantis par la migration 083 afin que l'utilisateur
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

const UNITS = ['DAY', 'FLAT'] as const

/**
 * Une version de coût d'acquisition : un véhicule, un fournisseur, un montant,
 * une unité, une date d'effet.
 *
 * PAS DE DATE DE FIN À LA SAISIE, et c'est délibéré : la fin d'une version est
 * la veille du début de la suivante, et la base la pose elle-même
 * (`set_supplier_vehicle_rate`). La laisser saisir ouvrirait deux façons de dire
 * la même chose, qui finiraient par diverger.
 *
 * UNE DATE D'EFFET FUTURE EST ACCEPTÉE — c'est précisément le besoin :
 * « 40 000 jusqu'au 30/09, 45 000 à partir du 01/10 » se saisit en septembre.
 */
export const supplierRateSchema = z.object({
  vehicleId: z.string().trim().min(1, 'Choisissez un véhicule.'),
  /*
   * Le fournisseur est FACULTATIF à la saisie : à défaut, la base retient celui
   * qui met le véhicule à disposition aujourd'hui. Le champ n'existe que pour
   * enregistrer, rétroactivement, un coût convenu avec un fournisseur précédent.
   */
  supplierId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
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
        ctx.addIssue({
          code: 'custom',
          message: 'Un coût d’acquisition doit être strictement positif.',
        })
        return 0
      }
      return parsed
    }),
  /*
   * DEC-001 et A-1 : un montant sans unité n'existe pas, et la Direction a coché
   * DEUX unités — le coût journalier et le forfait par location. Le tarif
   * mensuel n'est pas coché : il n'est pas proposé.
   */
  unit: z.enum(UNITS, {
    message: 'Indiquez si ce coût est journalier ou forfaitaire.',
  }),
  validFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez la date à partir de laquelle ce coût s’applique.'),
  conditions: trimmedOrNull(2000, 'Les conditions sont trop longues.'),
  reason: trimmedOrNull(500, 'Le motif est trop long.'),
})

export type SupplierRateInput = z.output<typeof supplierRateSchema>

/** Retrait d'une version : le motif est libre, mais borné. */
export const supplierRateRetireSchema = z.object({
  rateId: z.string().trim().min(1, 'Version introuvable.'),
  reason: trimmedOrNull(500, 'Le motif est trop long.'),
})

/**
 * Correction des conditions écrites d'une version.
 *
 * SEUL CHAMP MODIFIABLE APRÈS COUP. Le montant, l'unité, la date d'effet et le
 * motif du changement ne se réécrivent pas — la base le refuse, et ce schéma ne
 * les propose même pas (D16(a), migration 069).
 */
export const supplierRateConditionsSchema = z.object({
  rateId: z.string().trim().min(1, 'Version introuvable.'),
  conditions: trimmedOrNull(2000, 'Les conditions sont trop longues.'),
})
