#!/usr/bin/env node
/**
 * SAUVEGARDE PRÉALABLE À UNE MIGRATION — Plan 02 §19.2, consigne du LOT 23 §1.
 *
 * POURQUOI CE SCRIPT EXISTE
 *
 * Le Plan 02 exige une « sauvegarde complète avant application » de toute
 * migration qui transforme des données, ou qui déplace un invariant portant sur
 * des données existantes. Le LOT 22 ne l'a PAS prise — et l'a signalé
 * (Rapport 14 §23). Une exigence que rien n'outille finit par être oubliée :
 * elle est donc outillée ici.
 *
 * CE QU'IL FAIT, ET RIEN DE PLUS
 *
 *   1. appelle `admin_backup_export` — la MÊME fonction que le bouton
 *      « Télécharger la sauvegarde » des Paramètres. Aucun second mécanisme
 *      d'export n'est créé ;
 *   2. écrit le fichier JSON HORS DU DÉPÔT ;
 *   3. RELIT le fichier écrit et compare ses compteurs, table par table, aux
 *      `count(*)` réellement en base.
 *
 * Le troisième point est le seul qui compte : un fichier présent n'est pas une
 * sauvegarde exploitable. Ce qui est vérifié, c'est qu'il porte les mêmes lignes
 * que la base — et que sa structure est celle qu'`admin_restore_backup` attend
 * (`format`, `version`, `donnees`, `configuration`).
 *
 * OÙ LE FICHIER EST ÉCRIT, ET POURQUOI PAS DANS LE DÉPÔT
 *
 * Il contient des données CONFIDENTIELLES — coordonnées de règlement des
 * fournisseurs, montants, références bancaires d'ADIKOM. Il n'a donc rien à
 * faire dans un dépôt Git, même ignoré : un `.gitignore` se contourne d'un
 * `git add -f`. Le répertoire est par défaut À CÔTÉ du dépôt, et se règle par
 * `ADIKOM_BACKUP_DIR`.
 *
 * Utilisation :
 *   npm run backup:snapshot
 *   npm run backup:snapshot -- LOT23
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

import { loadEnvFile, maskConnectionString, required } from './lib/env.mjs'

const RESET = '\x1b[0m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const DIM = '\x1b[2m'

let failures = 0

function check(ok, label, detail) {
  const mark = ok ? `${GREEN}OK${RESET}` : `${RED}KO${RESET}`
  if (!ok) failures += 1
  console.log(`  [${mark}] ${label}${detail ? ` ${DIM}- ${detail}${RESET}` : ''}`)
}

async function main() {
  loadEnvFile()

  const label = (process.argv[2] ?? 'snapshot').replace(/[^A-Za-z0-9_-]/g, '')
  const connectionString = required(
    'SUPABASE_DB_URL',
    'Tableau de bord Supabase -> Project Settings -> Database -> Connection string (URI).'
  )

  const directory =
    process.env.ADIKOM_BACKUP_DIR ?? resolve(process.cwd(), '..', '..', '..', 'SAUVEGARDES_ADIKOM')

  console.log(`\nBase        : ${maskConnectionString(connectionString)}`)
  console.log(`Destination : ${directory}\n`)

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    /*
     * L'AUTEUR EST UN SUPER ADMIN RÉEL, LU EN BASE.
     *
     * `assert_backup_operator` le revérifie de toute façon : lui passer un
     * identifiant quelconque ferait échouer l'export. On le lit donc plutôt que
     * de le supposer.
     */
    const operator = await client.query(
      `select id, coalesce(username, first_name || ' ' || last_name) as label
         from public.app_users
        where is_super_admin and status = 'ACTIVE'
        order by created_at
        limit 1`
    )

    if (operator.rowCount === 0) {
      throw new Error('Aucun Super Admin actif : la sauvegarde ne peut pas etre prise.')
    }

    const actor = operator.rows[0]
    console.log(`Auteur      : ${actor.label}\n`)

    const exported = await client.query('select public.admin_backup_export($1) as payload', [
      actor.id,
    ])
    const payload = exported.rows[0].payload

    mkdirSync(directory, { recursive: true })

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const file = resolve(directory, `adikom-pilot-${label}-${stamp}.json`)

    writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8')

    console.log('VERIFICATION DE LA SAUVEGARDE ECRITE\n')

    // 1. Le fichier existe réellement, et n'est pas vide.
    const size = statSync(file).size
    check(size > 0, 'Le fichier existe et porte des octets', `${(size / 1024).toFixed(0)} Kio`)

    // 2. Il se RELIT — c'est le fichier, pas l'objet en mémoire, qui est éprouvé.
    const reread = JSON.parse(readFileSync(file, 'utf8'))

    check(
      reread.format === 'adikom-pilot.sauvegarde',
      'Format reconnu par admin_restore_backup',
      reread.format
    )
    check(Number.isInteger(reread.version), 'Version du format presente', `v${reread.version}`)
    check(Boolean(reread.created_at), 'Horodatage present', reread.created_at)
    check(
      (reread.configuration?.numbering_rules?.length ?? 0) > 0,
      'La configuration voyage avec les donnees',
      `${reread.configuration?.numbering_rules?.length ?? 0} regles de numerotation`
    )

    // 3. Le périmètre du fichier est CELUI de la base, table par table.
    const scope = await client.query('select unnest(public.backup_scope()) as t')
    const tables = scope.rows.map((row) => row.t)

    const missing = tables.filter((t) => !(t in (reread.donnees ?? {})))
    check(
      missing.length === 0,
      `Les ${tables.length} tables du perimetre figurent dans le fichier`,
      missing.length ? `absentes : ${missing.join(', ')}` : undefined
    )

    /*
     * 4. LE CONTRÔLE QUI FAIT DE CE FICHIER UNE SAUVEGARDE.
     *
     * Comparer les compteurs annoncés aux `count(*)` réels : un export qui
     * aurait lu à travers une policy restrictive écrirait un fichier bien
     * formé et VIDE. C'est exactement l'échec qu'on ne verrait pas.
     */
    let mismatched = 0
    let total = 0

    for (const table of tables) {
      const live = await client.query(`select count(*)::int as n from public.${table}`)
      const inFile = Array.isArray(reread.donnees[table]) ? reread.donnees[table].length : -1
      total += live.rows[0].n
      if (inFile !== live.rows[0].n) {
        mismatched += 1
        console.log(`  [${RED}KO${RESET}] ${table} - base ${live.rows[0].n}, fichier ${inFile}`)
      }
    }

    check(
      mismatched === 0,
      'Chaque table porte dans le fichier exactement ses lignes de la base',
      `${total} lignes`
    )
    check(
      reread.total_lignes === total,
      'Le total annonce par le fichier est celui de la base',
      `${reread.total_lignes} / ${total}`
    )

    console.log(`\n${DIM}Fichier : ${file}${RESET}`)

    if (failures > 0) {
      console.log(
        `\n${RED}${failures} controle(s) en echec - CETTE SAUVEGARDE N'EST PAS EXPLOITABLE.${RESET}\n`
      )
      process.exitCode = 1
      return
    }

    console.log(`\n${GREEN}Sauvegarde prise et verifiee. La migration peut etre appliquee.${RESET}\n`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(`\n${RED}${error.message}${RESET}\n`)
  process.exit(1)
})
