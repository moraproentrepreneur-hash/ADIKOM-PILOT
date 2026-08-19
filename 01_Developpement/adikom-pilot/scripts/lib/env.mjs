import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Charge `.env.local` sans dépendance externe.
 *
 * Les variables déjà présentes dans l'environnement ne sont pas écrasées :
 * une surcharge ponctuelle en ligne de commande reste prioritaire.
 */
export function loadEnvFile(fileName = '.env.local') {
  try {
    const content = readFileSync(resolve(process.cwd(), fileName), 'utf8')
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue
      process.env[key] = rawValue.replace(/^["']|["']$/g, '')
    }
  } catch {
    // Fichier absent : les variables viennent alors de l'environnement.
  }
}

/** Récupère une variable obligatoire, ou interrompt avec un message clair. */
export function required(name, hint) {
  const value = process.env[name]
  if (!value) {
    console.error(`\n✖ Variable manquante : ${name}`)
    if (hint) console.error(`  ${hint}`)
    console.error('\n  Voir MISE_EN_PLACE.md, étape 2.\n')
    process.exit(1)
  }
  return value
}

/**
 * Masque une URL de connexion pour l'affichage.
 * Le mot de passe ne doit jamais apparaître dans une sortie de terminal,
 * un journal de build ou une capture d'écran.
 */
export function maskConnectionString(url) {
  try {
    const parsed = new URL(url)
    const user = parsed.username || 'postgres'
    return `postgresql://${user}:••••••@${parsed.host}${parsed.pathname}`
  } catch {
    return '(chaîne de connexion illisible)'
  }
}
