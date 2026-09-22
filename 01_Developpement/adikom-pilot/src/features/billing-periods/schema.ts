import { z } from 'zod'

/**
 * Validation du régime de facturation et des factures de période — LOT 23.
 *
 * Reprend les invariants garantis par les migrations 094 et 095 afin que
 * l'utilisateur reçoive un message AU NIVEAU DU CHAMP concerné plutôt qu'une
 * erreur de contrainte (CLAUDE.md §39).
 *
 * La base reste la barrière réelle : ce schéma ne la remplace pas, il évite
 * qu'elle ait à parler.
 *
 * Module pur, sans accès aux données : testable unitairement.
 */

const TYPES = ['FIXED_TERM', 'LONG_TERM'] as const
const CADENCES = ['MONTHLY', 'CONTRACT_TERM'] as const

/** Un jour du calendrier, tel qu'un champ `date` le rend. */
const calendarDay = (message: string) =>
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, message)

const optionalDay = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Cette date n’est pas valide.',
  })

/* -------------------------------------------------------------------------- */
/*  Régime de facturation — 🟩 A-6                                             */
/* -------------------------------------------------------------------------- */

/**
 * Définir le régime de facturation d'un contrat.
 *
 * LA CADENCE EST OBLIGATOIRE EN LONGUE DURÉE, ET INTERDITE AUTREMENT.
 *
 * Les deux cadences sont cochées par la Direction : le système ne peut pas en
 * choisir une à sa place. Et une location à durée fixée n'a pas de cadence —
 * elle se facture une fois, à la fin. La contrainte
 * `rentals_billing_cadence_coherent` dit exactement la même chose en base.
 */
export const billingPlanSchema = z
  .object({
    rentalId: z.string().trim().min(1, 'Location introuvable.'),
    rentalType: z.enum(TYPES, { message: 'Choisissez le régime de facturation.' }),
    cadence: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .superRefine((value, ctx) => {
    if (value.rentalType === 'LONG_TERM') {
      if (value.cadence === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['cadence'],
          message:
            'Choisissez la cadence : une facture chaque fin de mois, ou une facture par période définie au contrat.',
        })
        return
      }
      if (!CADENCES.includes(value.cadence as (typeof CADENCES)[number])) {
        ctx.addIssue({ code: 'custom', path: ['cadence'], message: 'Cadence inconnue.' })
      }
    } else if (value.cadence !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['cadence'],
        message:
          'Une location à durée fixée n’a pas de cadence : elle se facture une fois, à la fin.',
      })
    }
  })

export type BillingPlanInput = z.output<typeof billingPlanSchema>

/* -------------------------------------------------------------------------- */
/*  Facture d'une période                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Préparer la facture d'une période facturable.
 *
 * AUCUN MONTANT, AUCUNE QUANTITÉ, AUCUNE DURÉE (DEC-008). La facture naît en
 * brouillon SANS LIGNE, exactement comme celle d'une location à durée fixée :
 * les lignes se saisissent ensuite, prix unitaire repris des segments, quantité
 * vide.
 */
export const periodInvoiceSchema = z
  .object({
    periodId: z.string().trim().min(1, 'Période facturable introuvable.'),
    rentalId: z.string().trim().min(1, 'Location introuvable.'),
    invoiceDate: calendarDay('Indiquez la date de la facture.'),
    dueDate: optionalDay,
    notes: z
      .string()
      .trim()
      .max(2000, 'Les observations sont trop longues.')
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .superRefine((value, ctx) => {
    // §21 : une échéance antérieure à la facture est une erreur de saisie.
    if (value.dueDate !== null && value.dueDate < value.invoiceDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: 'L’échéance ne peut pas précéder la date de la facture.',
      })
    }
  })

export type PeriodInvoiceInput = z.output<typeof periodInvoiceSchema>

/* -------------------------------------------------------------------------- */
/*  Annulation d'une période                                                   */
/* -------------------------------------------------------------------------- */

export const cancelPeriodSchema = z.object({
  periodId: z.string().trim().min(1, 'Période facturable introuvable.'),
  rentalId: z.string().trim().min(1, 'Location introuvable.'),
})

export type CancelPeriodInput = z.output<typeof cancelPeriodSchema>
