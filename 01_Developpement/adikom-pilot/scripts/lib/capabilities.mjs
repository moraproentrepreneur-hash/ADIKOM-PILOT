import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Le catalogue des capacités, COMPARÉ et non recopié — DEC-046.
 *
 * CE QUE CE MODULE REMPLACE
 *
 * Chaque recette portait la ligne suivante, avec le total écrit en dur :
 *
 *     check(total === 178, 'Catalogue conforme', `${total} permissions`)
 *
 * Ce nombre figurait dans TRENTE-CINQ fichiers. Une capacité ajoutée par un lot
 * faisait donc tomber trente-cinq recettes, pour une raison sans rapport avec ce
 * que chacune éprouve — et chaque édition était une occasion d'en casser une.
 *
 * CE QUI EST VÉRIFIÉ À LA PLACE EST PLUS STRICT, PAS MOINS
 *
 * Un total est une information pauvre : il ne dit pas QUELLE capacité manque, et
 * il laisse passer un échange — une capacité créée, une autre disparue. Ce
 * module compare donc les DEUX ENSEMBLES, code par code :
 *
 *   · le catalogue déployé en base ;
 *   · le miroir typé `src/lib/auth/permissions.ts`, dont `permissions.test.ts`
 *     garantit par ailleurs l'égalité avec les migrations.
 *
 * Une capacité présente d'un seul côté est nommée dans le message d'échec. Et
 * aucune valeur n'est à mettre à jour lorsque le catalogue grandit : la source de
 * vérité est lue, pas transcrite.
 */

/** Chemin du miroir typé, relatif à la racine du projet. */
const MIRROR = 'src/lib/auth/permissions.ts'

/**
 * Codes déclarés par le miroir typé.
 *
 * La lecture s'arrête à la fermeture de l'objet `PERMISSIONS` : ce qui suit
 * (types, libellés d'action) porte des chaînes de même forme.
 */
export function declaredCapabilities() {
  const source = readFileSync(resolve(process.cwd(), MIRROR), 'utf8')

  const start = source.indexOf('export const PERMISSIONS = {')
  if (start === -1) throw new Error(`${MIRROR} : objet PERMISSIONS introuvable.`)

  const end = source.indexOf('\n} as const', start)
  if (end === -1) throw new Error(`${MIRROR} : fin de l'objet PERMISSIONS introuvable.`)

  const codes = [
    ...source.slice(start, end).matchAll(/^\s+[A-Z0-9_]+:\s*'([a-z0-9_.]+)',?$/gm),
  ].map((match) => match[1])

  // Un miroir illisible produirait un ensemble vide, donc une comparaison
  // triomphante et fausse. Mieux vaut interrompre.
  if (codes.length < 100) {
    throw new Error(`${MIRROR} : ${codes.length} capacités lues, catalogue manifestement illisible.`)
  }

  return codes
}

/**
 * Le catalogue déployé est exactement celui que le code déclare.
 *
 * `admin` porte la clé de service : la lecture du catalogue ne dépend d'aucune
 * capacité, et ce contrôle ne mesure donc que la base elle-même.
 */
export async function checkCatalogue(admin, check, label = 'Catalogue conforme') {
  const declared = declaredCapabilities()
  const { data, error } = await admin.from('permissions').select('code')

  if (error) {
    check(false, label, `lecture impossible : ${error.message}`)
    return null
  }

  const deployed = (data ?? []).map((row) => row.code)
  const inBase = new Set(deployed)
  const inCode = new Set(declared)

  const absentes = declared.filter((code) => !inBase.has(code))
  const inconnues = deployed.filter((code) => !inCode.has(code))

  const detail =
    absentes.length === 0 && inconnues.length === 0
      ? `${deployed.length} capacités, identiques au code`
      : [
          absentes.length > 0 ? `absentes de la base : ${absentes.join(', ')}` : '',
          inconnues.length > 0 ? `inconnues du code : ${inconnues.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' · ')

  check(absentes.length === 0 && inconnues.length === 0, label, detail)

  return deployed.length
}

/**
 * Nombre de capacités au catalogue déployé.
 *
 * Pour les recettes qui doivent CONFRONTER ce nombre à ce qu'un écran affiche —
 * l'arborescence des permissions annonce « X sur Y ». Le nombre vient alors de
 * la base, jamais d'une constante recopiée dans la recette.
 */
export async function catalogueSize(admin) {
  const { count, error } = await admin
    .from('permissions')
    .select('id', { count: 'exact', head: true })

  if (error) throw new Error(`catalogue des permissions : ${error.message}`)
  return count
}
