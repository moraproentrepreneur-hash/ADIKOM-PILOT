/**
 * Arithmétique et formatage monétaires — ADIKOM PILOT.
 *
 * DEC-010 : tous les montants sont des ENTIERS exprimés en KMF, devise sans
 * sous-unité en usage. Aucun flottant n'intervient dans un calcul financier
 * (CLAUDE.md §58 : « évite les calculs flottants inadaptés aux montants
 * monétaires »).
 *
 * Le format d'affichage est séparé du stockage (03_Modules/09_Parametres.md §19).
 */

/** Montant en KMF. Toujours un entier. */
export type Amount = number

export const CURRENCY_CODE = 'KMF'

/**
 * Espace insécable (U+00A0) : séparateur de milliers et séparateur avant le
 * code devise. Garantit qu'un montant n'est jamais coupé en fin de ligne dans
 * un tableau ou un document imprimé.
 *
 * Écrit sous forme échappée à dessein : un espace insécable est indiscernable
 * d'une espace ordinaire dans un fichier source, ce qui rend les comparaisons
 * impossibles à relire et les tests ininterprétables.
 */
export const NBSP = ' '

/** Erreur levée lorsqu'un montant invalide entre dans un calcul financier. */
export class InvalidAmountError extends Error {
  constructor(value: unknown) {
    super(`Montant invalide : ${String(value)}. Un montant doit être un entier de francs comoriens.`)
    this.name = 'InvalidAmountError'
  }
}

/**
 * Valide qu'une valeur est un montant exploitable.
 * Rejette les décimales, NaN et Infinity — jamais arrondis en silence.
 */
export function assertAmount(value: unknown): asserts value is Amount {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new InvalidAmountError(value)
  }
}

/** Somme d'une liste de montants. */
export function sum(amounts: readonly Amount[]): Amount {
  let total = 0
  for (const amount of amounts) {
    assertAmount(amount)
    total += amount
  }
  return total
}

/** Différence entre deux montants. */
export function subtract(a: Amount, b: Amount): Amount {
  assertAmount(a)
  assertAmount(b)
  return a - b
}

/**
 * Produit d'un montant par une quantité entière.
 * Utilisé pour les tarifs à l'unité JOUR : montant × durée facturable (DEC-001).
 */
export function multiply(amount: Amount, quantity: number): Amount {
  assertAmount(amount)
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new InvalidAmountError(quantity)
  }
  return amount * quantity
}

/**
 * Applique un pourcentage de remise, arrondi à l'entier le plus proche.
 *
 * L'arrondi est explicite et centralisé : il ne doit jamais être laissé à
 * l'appelant, sous peine d'écarts entre deux écrans affichant le même montant.
 */
export function applyPercentage(amount: Amount, percentage: number): Amount {
  assertAmount(amount)
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new InvalidAmountError(percentage)
  }
  return Math.round((amount * percentage) / 100)
}

/**
 * Sépare les milliers manuellement.
 *
 * Volontairement indépendant de `Intl.NumberFormat` : le séparateur produit par
 * l'ICU varie selon la plateforme et la version de Node (espace ordinaire,
 * insécable ou fine insécable). Le rendu d'un montant ne doit pas dépendre de
 * l'environnement d'exécution.
 */
function groupThousands(value: number): string {
  const negative = value < 0
  const digits = Math.abs(value).toString()

  let grouped = ''
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) {
      grouped += NBSP
    }
    grouped += digits[index]
  }

  return negative ? `-${grouped}` : grouped
}

/** Formate un montant pour l'affichage : `500 000 KMF`. */
export function formatAmount(amount: Amount, options?: { withCurrency?: boolean }): string {
  assertAmount(amount)
  const withCurrency = options?.withCurrency ?? true
  const formatted = groupThousands(amount)
  return withCurrency ? `${formatted}${NBSP}${CURRENCY_CODE}` : formatted
}

/**
 * Analyse une saisie utilisateur et renvoie un montant entier, ou `null`.
 *
 * Seuls les séparateurs de type espace sont acceptés : espace ordinaire,
 * insécable (U+00A0) et fine insécable (U+202F).
 *
 * Le point et la virgule sont volontairement REFUSÉS. Les traiter comme
 * séparateurs de milliers transformerait « 1500.75 » en 150 075, soit
 * exactement l'arrondi silencieux que les règles financières interdisent
 * (05_Regles_Metier/03_Finance.md §85.15 : le système doit toujours permettre
 * d'expliquer l'origine d'un montant). Une saisie ambiguë doit être corrigée
 * par l'utilisateur, jamais devinée par le système.
 */
export function parseAmount(input: string): Amount | null {
  const cleaned = input.replace(/[\s  ]/g, '')
  if (cleaned === '') return null
  if (!/^-?\d+$/.test(cleaned)) return null

  const value = Number(cleaned)
  return Number.isSafeInteger(value) ? value : null
}
