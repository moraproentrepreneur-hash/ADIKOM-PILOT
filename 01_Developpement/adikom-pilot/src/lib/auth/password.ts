/**
 * Génération d'un mot de passe temporaire.
 *
 * Exécutée dans le navigateur de l'administrateur, à dessein : le mot de passe
 * n'est ainsi jamais produit côté serveur, jamais renvoyé dans le résultat
 * d'une action, et n'apparaît dans aucun journal applicatif. Il ne circule
 * qu'une fois, dans l'envoi du formulaire de création, exactement comme la
 * saisie manuelle qu'il remplace.
 *
 * `crypto.getRandomValues` est un générateur cryptographique, présent dans tous
 * les navigateurs visés et dans Node — contrairement à `Math.random`, qui est
 * prévisible et n'a pas sa place ici.
 */

/** Longueur minimale imposée par les règles d'authentification existantes. */
export const PASSWORD_MIN_LENGTH = 8

/** Longueur du mot de passe généré : au-delà du minimum, sans être impraticable
 *  à retranscrire lors de la remise au collaborateur. */
const GENERATED_LENGTH = 16

/*
 * Alphabets séparés pour garantir la présence de chaque catégorie.
 * Les caractères ambigus à l'oral ou à la lecture (I, l, 1, O, 0) sont écartés :
 * le mot de passe est transmis de vive voix ou recopié.
 */
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%*?-+='
const ALL = LOWER + UPPER + DIGITS + SYMBOLS

/** Entier aléatoire uniforme dans [0, max), sans biais de modulo. */
function randomIndex(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max
  const buffer = new Uint32Array(1)

  let value: number
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]
  } while (value >= limit)

  return value % max
}

function pick(alphabet: string): string {
  return alphabet[randomIndex(alphabet.length)]
}

/** Mélange de Fisher-Yates, pour que les caractères imposés ne restent pas en tête. */
function shuffle(characters: string[]): string[] {
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1)
    ;[characters[i], characters[j]] = [characters[j], characters[i]]
  }
  return characters
}

export function generateTemporaryPassword(): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]

  const filler = Array.from({ length: GENERATED_LENGTH - required.length }, () => pick(ALL))

  return shuffle([...required, ...filler]).join('')
}
