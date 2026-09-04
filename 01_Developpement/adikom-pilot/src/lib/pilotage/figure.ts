import 'server-only'

import { can } from '@/lib/auth/dal'
import type { PermissionCode } from '@/lib/auth/permissions'

/**
 * L'état d'un indicateur de pilotage.
 *
 * TROIS RÉPONSES, JAMAIS DEUX — Module 01 §25, §26, §27.
 *
 *   `ok`      la valeur, calculée sur des données réelles ;
 *   `denied`  la capacité manque, et l'écran le DIT ;
 *   `error`   la donnée n'a pas pu être chargée, et l'écran le dit aussi.
 *
 * Un zéro ne dit aucune de ces trois choses. « 0 facture impayée » est une
 * bonne nouvelle ; « je n'ai pas le droit de compter les factures » n'en est
 * pas une (DEC-017). Et §26 l'ajoute : le système « ne doit pas afficher de
 * données inventées pour masquer une erreur de chargement ».
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * Ces outils sont nés avec le tableau de bord (LOT 9). Les statistiques et les
 * rapports de facturation (LOT 11) posent exactement la même question — un
 * chiffre, un refus nommé, ou un échec dit —, et la recopier en aurait fait
 * deux vérités sur la façon de ne pas répondre (CLAUDE.md §37).
 *
 * ILS NE PROTÈGENT RIEN.
 *
 * Les fonctions SQL du pilotage REFUSENT côté serveur lorsqu'une capacité
 * manque : c'est là qu'est la garantie, et elle reste seule maîtresse. Vérifier
 * avant d'appeler permet seulement de DIRE laquelle manque, au lieu d'afficher
 * une erreur de chargement pour un refus de droit.
 */

export type Figure<T> =
  | { state: 'ok'; value: T }
  | { state: 'denied'; missing: PermissionCode[] }
  | { state: 'error' }

export const ok = <T,>(value: T): Figure<T> => ({ state: 'ok', value })

export const denied = <T,>(missing: PermissionCode[]): Figure<T> => ({
  state: 'denied',
  missing,
})

/**
 * Exécute une lecture, ou rend l'échec lisible.
 *
 * Le motif technique reste dans les journaux du serveur : l'utilisateur n'a pas
 * à lire un message de PostgREST (CLAUDE.md §43).
 */
export async function attempt<T>(scope: string, read: () => Promise<T>): Promise<Figure<T>> {
  try {
    return ok(await read())
  } catch (error) {
    console.error(`[${scope}]`, error)
    return { state: 'error' }
  }
}

/** Les capacités absentes parmi celles exigées — l'écran les nomme. */
export async function missingAmong(codes: PermissionCode[]): Promise<PermissionCode[]> {
  const held = await Promise.all(codes.map((code) => can(code)))
  return codes.filter((_, index) => !held[index])
}

/** Un indicateur : d'abord les capacités, ensuite seulement la lecture. */
export async function gated<T>(
  scope: string,
  codes: PermissionCode[],
  read: () => Promise<T>
): Promise<Figure<T>> {
  const missing = await missingAmong(codes)
  if (missing.length > 0) return denied(missing)
  return attempt(scope, read)
}

/**
 * Lit un champ d'un indicateur SANS perdre son état.
 *
 * Sans cela, une lecture refusée deviendrait `0` en traversant un accesseur —
 * et l'écran afficherait « 0 retard » à qui n'a pas le droit de compter
 * (DEC-017).
 */
export function pick<T>(figure: Figure<T>, read: (value: T) => number): Figure<number> {
  return figure.state === 'ok' ? { state: 'ok', value: read(figure.value) } : figure
}
