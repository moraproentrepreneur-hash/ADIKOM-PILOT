import { z } from 'zod'

import { parseAmount } from '@/lib/money'

/**
 * Validation des avenants — LOT 22, DEC-045.
 *
 * Reprend les invariants garantis par la migration 087 afin que l'utilisateur
 * reçoive un message AU NIVEAU DU CHAMP concerné plutôt qu'une erreur de
 * contrainte (CLAUDE.md §39).
 *
 * La base reste la barrière réelle : ce schéma ne la remplace pas, il évite
 * qu'elle ait à parler.
 *
 * Module pur, sans accès aux données : testable unitairement.
 */

const UNITS = ['DAY', 'FLAT'] as const

/** Un instant saisi dans un champ `datetime-local`, converti plus loin en UTC. */
const localInstant = (message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, message)

/**
 * LE MOTIF EST OBLIGATOIRE, PARTOUT.
 *
 * Plan 02 §12 : un avenant est journalisé « ✅ + motif ». Un changement de
 * véhicule sans raison écrite serait un fait sans cause : dans six mois, personne
 * ne saurait plus si le véhicule était en panne, réquisitionné ou vendu.
 */
const mandatoryReason = (message: string) =>
  z.string().trim().min(3, message).max(1000, 'Le motif est trop long.')

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : null))

/**
 * Montant en francs comoriens ENTIERS — DEC-010.
 *
 * Un tarif à 60 000,75 KMF n'existe pas : le franc comorien n'a pas de
 * sous-unité, et arrondir en silence produirait un écart que personne ne
 * remarquerait avant la facture.
 */
const amount = (allowEmpty: boolean) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) {
        if (allowEmpty) return null
        ctx.addIssue({ code: 'custom', message: 'Saisissez le tarif à appliquer.' })
        return null
      }

      const parsed = parseAmount(value)
      if (parsed === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Saisissez un montant en francs comoriens, sans décimale.',
        })
        return null
      }
      if (parsed < 0) {
        ctx.addIssue({ code: 'custom', message: 'Un tarif ne peut pas être négatif.' })
        return null
      }
      return parsed
    })

/* -------------------------------------------------------------------------- */
/*  Remplacement de véhicule — A-4, A-5                                        */
/* -------------------------------------------------------------------------- */

/**
 * Remplacer le véhicule d'une location, par avenant.
 *
 * LE TARIF EST FACULTATIF, et c'est toute la décision A-5 :
 *
 *   · laissé VIDE   → le client paie le tarif du nouveau véhicule, résolu par le
 *                     barème. C'est le cas ordinaire : « généralement le client
 *                     paie le nouveau tarif » ;
 *   · RENSEIGNÉ     → ADIKOM applique un autre montant. C'est l'exception, elle
 *                     exige `rental.pricing.override` ET sa propre raison écrite.
 *
 * « Généralement » ne devient pas une règle absolue, et une dérogation ne devient
 * pas un réglage muet.
 */
export const vehicleSwapSchema = z
  .object({
    rentalId: z.string().trim().min(1, 'Location introuvable.'),
    vehicleId: z.string().trim().min(1, 'Choisissez le véhicule de remplacement.'),
    effectiveAt: localInstant('Indiquez la date et l’heure à partir desquelles le nouveau véhicule prend le relais.'),
    reason: mandatoryReason('Indiquez pourquoi le véhicule est remplacé.'),
    amount: amount(true),
    unit: z.enum(UNITS).optional(),
    rateReason: optionalText(1000, 'La raison de la dérogation est trop longue.'),
    notes: optionalText(2000, 'Les observations sont trop longues.'),
  })
  .superRefine((value, ctx) => {
    // UNE DÉROGATION N'EST JAMAIS SILENCIEUSE (A-5, consigne §8).
    if (value.amount !== null && !value.rateReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['rateReason'],
        message:
          'Un tarif différent de celui du barème exige sa raison : pourquoi le client ne paie-t-il pas le tarif du nouveau véhicule ?',
      })
    }

    // Et un motif de dérogation sans montant n'a rien à motiver.
    if (value.amount === null && value.rateReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message:
          'Vous avez motivé une dérogation sans saisir de tarif. Laissez la raison vide pour appliquer le tarif du barème.',
      })
    }
  })

export type VehicleSwapInput = z.output<typeof vehicleSwapSchema>

/* -------------------------------------------------------------------------- */
/*  Changement de tarif — A-5, A-7                                             */
/* -------------------------------------------------------------------------- */

/**
 * Changer le tarif d'un contrat en cours, à partir d'une date d'effet.
 *
 * 🟥 AUCUN BARÈME DE PÉNALITÉ N'EST APPLIQUÉ. A-7 évoque « des pénalités de 20 à
 * 100 % » sans dire de quoi, ni qui fixe le taux, ni s'il s'agit d'une majoration
 * ou d'une ligne de facture (Plan 02 §3.1). Le montant est donc SAISI, motivé, et
 * l'écran ne propose aucun pourcentage : inventer un barème serait inventer une
 * règle métier (CLAUDE.md §55).
 */
export const rateChangeSchema = z.object({
  rentalId: z.string().trim().min(1, 'Location introuvable.'),
  effectiveAt: localInstant('Indiquez la date et l’heure à partir desquelles le nouveau tarif s’applique.'),
  amount: amount(false),
  unit: z.enum(UNITS, { message: 'Indiquez si ce tarif est journalier ou forfaitaire.' }),
  reason: mandatoryReason('Indiquez pourquoi le tarif change.'),
  notes: optionalText(2000, 'Les observations sont trop longues.'),
})

export type RateChangeInput = z.output<typeof rateChangeSchema>
