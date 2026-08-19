#!/usr/bin/env node
/**
 * Exécute un fichier SQL sur la base Supabase Cloud — ADIKOM PILOT.
 *
 * Sert notamment à la recette du schéma (`supabase/tests/socle.sql`), dont les
 * contrôles s'appuient sur RAISE NOTICE.
 *
 * Utilisation :
 *   node scripts/run-sql.mjs supabase/tests/socle.sql
 *
 * La chaîne de connexion provient de SUPABASE_DB_URL, lue depuis `.env.local`.
 * Elle contient le mot de passe de la base : elle n'est jamais affichée en
 * clair, ni passée en argument de ligne de commande.
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

import { loadEnvFile, maskConnectionString, required } from './lib/env.mjs'

const RESET = '\x1b[0m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const DIM = '\x1b[2m'

async function main() {
  loadEnvFile()

  const file = process.argv[2]
  if (!file) {
    console.error('\n✖ Usage : node scripts/run-sql.mjs <fichier.sql>\n')
    process.exit(1)
  }

  const connectionString = required(
    'SUPABASE_DB_URL',
    'Tableau de bord Supabase → Project Settings → Database → Connection string (URI).'
  )

  const sql = readFileSync(file, 'utf8')

  console.log(`\nBase    : ${maskConnectionString(connectionString)}`)
  console.log(`Script  : ${file}\n`)

  const client = new pg.Client({
    connectionString,
    // Supabase impose TLS ; le certificat est signé par une autorité que Node
    // ne connaît pas par défaut sur toutes les plateformes.
    ssl: { rejectUnauthorized: false },
  })

  // Les contrôles de la recette communiquent par RAISE NOTICE.
  client.on('notice', (notice) => {
    const message = notice.message ?? ''
    if (message.startsWith('[OK]')) {
      console.log(`${GREEN}${message}${RESET}`)
    } else if (message.trim() === '') {
      console.log('')
    } else {
      console.log(`${DIM}${message}${RESET}`)
    }
  })

  try {
    await client.connect()
  } catch (error) {
    console.error(`\n${RED}✖ Connexion impossible : ${error.message}${RESET}\n`)
    process.exit(1)
  }

  try {
    await client.query(sql)
    console.log(`\n${GREEN}✔ Script exécuté sans erreur.${RESET}\n`)
  } catch (error) {
    console.error(`\n${RED}✖ Échec SQL${RESET}`)
    console.error(`  ${error.message}`)
    if (error.where) console.error(`  Contexte : ${error.where}`)
    if (error.position) {
      // Localise l'erreur dans le fichier pour un diagnostic immédiat.
      const upTo = sql.slice(0, Number(error.position))
      const line = upTo.split('\n').length
      console.error(`  Ligne    : ${line}`)
      console.error(`  Extrait  : ${sql.split('\n')[line - 1]?.trim()}`)
    }
    console.error('')
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
