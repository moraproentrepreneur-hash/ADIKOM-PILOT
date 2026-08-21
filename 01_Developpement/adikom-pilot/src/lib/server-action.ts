import 'server-only'

import { z } from 'zod'

/**
 * Plomberie commune des actions serveur.
 *
 * Les modules du référentiel (clients, fournisseurs, parc, tarifs) partagent
 * exactement les mêmes besoins : valider une saisie, refuser proprement, ne
 * jamais laisser fuir un détail technique. Les regrouper ici évite d'en écrire
 * quatre variantes presque identiques (CLAUDE.md §37).
 *
 * Ce module ne contient AUCUNE règle métier ni aucun contrôle de permission :
 * ceux-ci restent dans chaque action, au plus près de l'opération concernée.
 */

// L'état de formulaire est défini dans un module client-compatible : les
// formulaires en ont besoin, et ce module-ci ne peut pas être importé par eux.
export type { FormState } from './form-state'
import type { FormState } from './form-state'

/** Convertit les erreurs zod en messages rattachés à chaque champ. */
export function toFieldErrors(error: z.ZodError): Record<string, string | undefined> {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>
  return Object.fromEntries(Object.entries(flat).map(([key, messages]) => [key, messages?.[0]]))
}

/** Valeur exploitable ou `null` : évite d'enregistrer des chaînes vides. */
export function orNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Lecture typée d'un champ de formulaire. */
export function readText(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export function readMultiple(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === 'string')
}

/**
 * Traduit une erreur de base en message compréhensible.
 *
 * Ne révèle jamais la structure interne, le nom d'une table, une contrainte ni
 * une trace technique (CLAUDE.md §43, 05_Regles_Metier/05_Permissions.md §29).
 * Les messages spécifiques à un domaine sont fournis par `patterns`.
 */
export function friendlyError(
  message: string,
  patterns: readonly [RegExp, string][] = []
): string {
  for (const [pattern, friendly] of patterns) {
    if (pattern.test(message)) return friendly
  }

  if (/row-level security|insufficient_privilege|permission denied/i.test(message)) {
    return 'Vous ne disposez pas des droits nécessaires pour cette opération.'
  }
  if (/violates exclusion constraint|no_overlap/i.test(message)) {
    return 'Cette période chevauche une autre indisponibilité de ce véhicule.'
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return 'Cette valeur est déjà utilisée par une autre fiche.'
  }
  if (/violates foreign key/i.test(message)) {
    return 'Cette opération référence un élément qui n’existe plus.'
  }
  if (/check constraint|check_violation/i.test(message)) {
    return 'Les informations saisies ne sont pas cohérentes entre elles.'
  }

  return 'L’opération n’a pas pu être effectuée. Veuillez vérifier les informations saisies.'
}

/**
 * Exécute une action sans jamais laisser une exception atteindre le client :
 * celui-ci verrait un écran d'erreur générique et perdrait sa saisie.
 * L'exception est journalisée côté serveur, l'utilisateur reçoit un message
 * fonctionnel (CLAUDE.md §38 et §43, DEC-017).
 */
export async function guarded<T extends FormState>(
  scope: string,
  run: () => Promise<T>,
  patterns: readonly [RegExp, string][] = []
): Promise<T | FormState> {
  try {
    return await run()
  } catch (error) {
    // `redirect()` et `notFound()` communiquent par exception : elles doivent
    // remonter intactes, sinon la navigation ne se produit jamais.
    if (error && typeof error === 'object' && 'digest' in error) throw error
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[${scope}] ${message}`)
    return { error: friendlyError(message, patterns) }
  }
}

/**
 * Signale l'échec d'une lecture, sans le confondre avec une absence de donnée.
 *
 * DEC-017 : une erreur de requête présentée comme un résultat vide fait passer
 * un défaut réel pour une page « introuvable » parfaitement crédible.
 */
export function reportQueryFailure(
  scope: string,
  error: { code?: string; message: string },
  userMessage: string
): never {
  console.error(`[${scope}] ${error.code ?? 'ERREUR'} ${error.message}`)
  throw new Error(userMessage)
}
