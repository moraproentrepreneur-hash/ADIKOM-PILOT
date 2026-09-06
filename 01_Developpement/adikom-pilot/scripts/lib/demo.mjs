/**
 * Vocabulaire commun du jeu de démonstration — ADIKOM PILOT.
 *
 * Le SEUL point où se décide ce qui « est » une donnée de démonstration.
 * `seed-demo.mjs` l'écrit, `clean-demo.mjs` le relit : sans marqueur partagé,
 * le nettoyage devrait deviner, et une donnée réelle finirait par disparaître.
 */

/** Marqueur porté par toute fiche de démonstration dotée d'un champ libre. */
export const DEMO_NOTE = 'Donnée de démonstration — DEMO. Ne pas supprimer sans décision.'

/**
 * Marqueur d'un objet précis du scénario — `DEMO_NOTE [R1]`, `DEMO_NOTE [FC2]`.
 *
 * Une réservation n'a pas de clé naturelle : deux réservations du même client
 * sur la même période sont deux réservations légitimes. L'étiquette donne au
 * seed de quoi RETROUVER ce qu'il a déjà créé, et donc de ne pas le recréer.
 */
export function tag(code) {
  return `${DEMO_NOTE} [${code}]`
}

/** Préfixe des libellés visibles. Ce qui est de démonstration le dit. */
export const DEMO = 'DEMO'
