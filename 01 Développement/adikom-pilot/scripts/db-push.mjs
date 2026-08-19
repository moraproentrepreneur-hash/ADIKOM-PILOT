#!/usr/bin/env node
/**
 * Applique les migrations sur la base Supabase Cloud — ADIKOM PILOT.
 *
 * Enveloppe `supabase db push` afin que la chaîne de connexion soit lue depuis
 * `.env.local` plutôt que saisie à la main : le mot de passe de la base ne
 * transite ainsi jamais par l'historique du terminal.
 *
 * Utilisation :
 *   npm run db:push          applique les migrations manquantes
 *   npm run db:status        liste ce qui serait appliqué, sans rien modifier
 *
 * Le schéma se modifie uniquement par migration versionnée. Une modification
 * faite à la main dans l'interface Supabase serait perdue au déploiement
 * suivant et romprait la reproductibilité.
 */

import { spawn } from 'node:child_process'

import { loadEnvFile, maskConnectionString, required } from './lib/env.mjs'

loadEnvFile()

const connectionString = required(
  'SUPABASE_DB_URL',
  'Tableau de bord Supabase → Project Settings → Database → Connection string (URI).'
)

const dryRun = process.argv.includes('--dry-run')

console.log(`\nBase   : ${maskConnectionString(connectionString)}`)
console.log(`Action : ${dryRun ? 'simulation (aucune modification)' : 'application des migrations'}\n`)

const args = ['supabase', 'db', 'push', '--db-url', connectionString, '--yes']
if (dryRun) args.push('--dry-run')

const child = spawn('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
