#!/usr/bin/env node
/**
 * Retrait du jeu de démonstration — ADIKOM PILOT.
 *
 * CE QU'IL RETIRE, ET RIEN D'AUTRE
 *
 * Uniquement ce que `seed-demo.mjs` a posé, reconnu par son MARQUEUR
 * (`scripts/lib/demo.mjs`) ou par son rattachement à un objet marqué. Une donnée
 * réelle saisie dans le SaaS ne porte aucun de ces marqueurs et n'est donc
 * jamais touchée.
 *
 * CE QU'IL NE RETIRE JAMAIS
 *
 *   · le compte Super Admin, ni aucun compte réel ;
 *   · le catalogue des permissions, les groupes, les départements ;
 *   · les paramètres de l'entreprise et les règles de numérotation ;
 *   · le journal d'activité — il garde la trace de ce qui a existé.
 *
 * L'ORDRE EST CELUI DES DÉPENDANCES, À L'ENVERS : les enfants avant les
 * parents. Une suppression dans le désordre échouerait sur une clé étrangère et
 * laisserait le jeu à moitié retiré.
 *
 * LES COMPTEURS DE NUMÉROTATION NE RECULENT PAS. Les identifiants consommés par
 * la démonstration ne sont pas réattribués : « un numéro déjà émis ne se
 * réutilise jamais » (Module 09 §16). C'est voulu, et c'est sans conséquence.
 *
 * Opération d'environnement : elle emprunte le rôle de service. `current_actor()`
 * y vaut NULL, ce qui autorise la suppression (DEC-020, migration 021) — aucune
 * session applicative ne le peut.
 *
 * Utilisation :
 *   npm run demo:clean
 *   npm run demo:clean -- --oui      (sans confirmation interactive)
 */

import { createInterface } from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required } from './lib/env.mjs'
import { DEMO_NOTE } from './lib/demo.mjs'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

let removed = 0
const blocked = []

function fail(context, error) {
  throw new Error(`${context} : ${error.message ?? error}`)
}

/** Identifiants d'un ensemble, lus une fois et réutilisés par les enfants. */
async function idsWhere(admin, table, apply, column = 'id') {
  const query = admin.from(table).select(column)
  apply(query)
  const { data, error } = await query
  if (error) fail(`lecture de ${table}`, error)
  return (data ?? []).map((row) => row[column])
}

/**
 * Supprime les lignes désignées, et dit combien.
 *
 * `.select('id')` après un `delete` renvoie les lignes RÉELLEMENT supprimées :
 * c'est la seule façon de compter juste. Un compteur qui annonce zéro pendant
 * qu'il vide une table ne sert à rien, et masquerait un défaut de filtre.
 *
 * UNE CLÉ ÉTRANGÈRE QUI RÉSISTE N'EST PAS UNE PANNE. Elle signale qu'une donnée
 * NON marquée DEMO s'appuie sur celle-ci : le retrait s'arrête là, le dit, et ne
 * force rien. Détruire la donnée réelle pour retirer la démonstration serait
 * exactement l'inverse de ce que ce script promet.
 */
async function purge(admin, table, apply, label) {
  const query = admin.from(table).delete()
  apply(query)
  const { data, error } = await query.select('id')

  if (error) {
    if (error.code === '23503') {
      blocked.push({ table, label, message: error.message })
      console.log(
        `  ${RED}   ·${RESET} ${table.padEnd(34)} ${DIM}${label} — retenu par une donnée réelle${RESET}`
      )
      return
    }
    fail(`suppression dans ${table}`, error)
  }

  const n = data?.length ?? 0
  removed += n
  console.log(
    `  ${n > 0 ? GREEN : DIM}${String(n).padStart(4)}${RESET} ${table.padEnd(34)} ${DIM}${label}${RESET}`
  )
}

/** Aucun identifiant : la clause `in ()` serait vide et illégale. */
const NONE = ['00000000-0000-0000-0000-000000000000']
const safe = (list) => (list.length > 0 ? list : NONE)

async function main() {
  loadEnvFile()

  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  console.log('\nRetrait du jeu de démonstration — ADIKOM PILOT')
  console.log(
    `${DIM}Seules les données marquées DEMO sont retirées. Comptes réels, permissions,\n` +
      `configuration et journal d'activité sont conservés.${RESET}\n`
  )

  if (!process.argv.includes('--oui')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('Confirmer le retrait des données DEMO ? (oui/non) ')
    rl.close()
    if (answer.trim().toLowerCase() !== 'oui') {
      console.log('\nAbandon. Rien n’a été supprimé.\n')
      return
    }
    console.log('')
  }

  /* --- Les racines, lues une fois ----------------------------------------- */
  const clients = await idsWhere(admin, 'clients', (q) => q.eq('notes', DEMO_NOTE))
  const suppliers = await idsWhere(admin, 'suppliers', (q) => q.eq('notes', DEMO_NOTE))
  const partners = await idsWhere(admin, 'partners', (q) => q.eq('notes', DEMO_NOTE))
  const categories = await idsWhere(admin, 'vehicle_categories', (q) => q.like('code', 'DEMO-%'))
  const vehicles = await idsWhere(admin, 'vehicles', (q) => q.eq('notes', DEMO_NOTE))
  const accounts = await idsWhere(admin, 'financial_accounts', (q) => q.eq('description', DEMO_NOTE))
  const reservations = await idsWhere(admin, 'reservations', (q) => q.like('notes', `${DEMO_NOTE}%`))
  const rentals = await idsWhere(admin, 'rentals', (q) =>
    q.in('reservation_id', safe(reservations))
  )
  const inspections = await idsWhere(admin, 'rental_inspections', (q) =>
    q.in('rental_id', safe(rentals))
  )
  const incidents = await idsWhere(admin, 'vehicle_incidents', (q) =>
    q.like('description', `${DEMO_NOTE}%`)
  )
  const maintenances = await idsWhere(admin, 'vehicle_maintenances', (q) =>
    q.like('reason', `${DEMO_NOTE}%`)
  )
  const supplierInvoices = await idsWhere(admin, 'supplier_invoices', (q) =>
    q.like('notes', `${DEMO_NOTE}%`)
  )
  const customerInvoices = await idsWhere(admin, 'customer_invoices', (q) =>
    q.like('notes', `${DEMO_NOTE}%`)
  )
  const imputations = await idsWhere(admin, 'imputations', (q) =>
    q.like('justification', `${DEMO_NOTE}%`)
  )
  const supplierPayments = await idsWhere(admin, 'supplier_payments', (q) =>
    q.like('notes', `${DEMO_NOTE}%`)
  )
  const customerPayments = await idsWhere(admin, 'customer_payments', (q) =>
    q.like('notes', `${DEMO_NOTE}%`)
  )
  const transfers = await idsWhere(admin, 'internal_transfers', (q) =>
    q.like('notes', `${DEMO_NOTE}%`)
  )
  const miscPayments = await idsWhere(admin, 'misc_payments', (q) =>
    q.like('notes', `${DEMO_NOTE}%`)
  )
  const projects = await idsWhere(admin, 'projects', (q) => q.eq('description', DEMO_NOTE))
  const meetings = await idsWhere(admin, 'project_meetings', (q) => q.like('title', 'RÉUNION DEMO%'))
  const appointments = await idsWhere(admin, 'project_appointments', (q) =>
    q.like('subject', 'RENDEZ-VOUS DEMO%')
  )
  const demoUsers = await idsWhere(admin, 'app_users', (q) =>
    q.eq('notes', DEMO_NOTE).eq('is_super_admin', false)
  )

  console.log('Suppression, des enfants vers les parents\n')

  /* --- Projets et planification -------------------------------------------- */
  await purge(admin, 'project_actions', (q) => q.like('title', 'ACTION DEMO%'), 'actions')
  await purge(admin, 'project_decisions', (q) => q.like('title', 'DÉCISION DEMO%'), 'décisions')
  await purge(admin, 'project_appointment_participants',
    (q) => q.in('appointment_id', safe(appointments)), 'participants aux rendez-vous')
  await purge(admin, 'project_appointments',
    (q) => q.in('id', safe(appointments)), 'rendez-vous')
  await purge(admin, 'project_meeting_participants',
    (q) => q.in('meeting_id', safe(meetings)), 'participants aux réunions')
  await purge(admin, 'project_meetings', (q) => q.in('id', safe(meetings)), 'réunions')
  await purge(admin, 'project_tasks', (q) => q.eq('description', DEMO_NOTE), 'tâches')
  await purge(admin, 'project_members', (q) => q.in('project_id', safe(projects)), 'membres')
  await purge(admin, 'projects', (q) => q.in('id', safe(projects)), 'projets')

  /* --- Trésorerie ---------------------------------------------------------- */
  // Une écriture ne se supprime jamais seule : elle suit l'opération qui l'a
  // produite (Module 06 §20).
  await purge(admin, 'treasury_entries',
    (q) => q.in('supplier_payment_id', safe(supplierPayments)), 'écritures de règlement fournisseur')
  await purge(admin, 'treasury_entries',
    (q) => q.in('customer_payment_id', safe(customerPayments)), 'écritures d’encaissement client')
  await purge(admin, 'treasury_entries',
    (q) => q.in('internal_transfer_id', safe(transfers)), 'écritures de virement')
  await purge(admin, 'treasury_entries',
    (q) => q.in('misc_payment_id', safe(miscPayments)), 'écritures de paiement divers')

  await purge(admin, 'misc_payments', (q) => q.in('id', safe(miscPayments)), 'paiements divers')
  await purge(admin, 'internal_transfers', (q) => q.in('id', safe(transfers)), 'virements internes')
  await purge(admin, 'customer_payments', (q) => q.in('id', safe(customerPayments)), 'règlements clients')
  await purge(admin, 'supplier_payments', (q) => q.in('id', safe(supplierPayments)), 'règlements fournisseurs')

  /* --- Facturation --------------------------------------------------------- */
  await purge(admin, 'customer_invoice_lines',
    (q) => q.in('customer_invoice_id', safe(customerInvoices)), 'lignes de factures clients')
  await purge(admin, 'customer_invoices',
    (q) => q.in('id', safe(customerInvoices)), 'factures clients')
  await purge(admin, 'imputation_documents',
    (q) => q.in('imputation_id', safe(imputations)), 'justificatifs d’imputation')
  await purge(admin, 'imputations', (q) => q.in('id', safe(imputations)), 'imputations')
  await purge(admin, 'supplier_invoice_lines',
    (q) => q.in('supplier_invoice_id', safe(supplierInvoices)), 'lignes de factures fournisseurs')
  await purge(admin, 'supplier_invoices',
    (q) => q.in('id', safe(supplierInvoices)), 'factures fournisseurs')

  /* --- Maintenance et incidents -------------------------------------------- */
  await purge(admin, 'maintenance_documents',
    (q) => q.in('maintenance_id', safe(maintenances)), 'documents de maintenance')
  await purge(admin, 'maintenance_cost_lines',
    (q) => q.in('maintenance_id', safe(maintenances)), 'lignes de coût')
  await purge(admin, 'maintenance_costs',
    (q) => q.in('maintenance_id', safe(maintenances)), 'coûts de maintenance')
  await purge(admin, 'maintenance_quotes',
    (q) => q.in('maintenance_id', safe(maintenances)), 'devis')
  await purge(admin, 'vehicle_maintenances',
    (q) => q.in('id', safe(maintenances)), 'maintenances')
  await purge(admin, 'incident_photos', (q) => q.in('incident_id', safe(incidents)), 'photos d’incident')
  await purge(admin, 'incident_damages', (q) => q.in('incident_id', safe(incidents)), 'dommages')
  await purge(admin, 'vehicle_incidents', (q) => q.in('id', safe(incidents)), 'incidents')

  /* --- Cycle de location ---------------------------------------------------- */
  //
  // L'OCCUPATION SE RETIRE PAR SON ORIGINE, JAMAIS PAR SON VÉHICULE.
  //
  // Un véhicule de démonstration peut porter l'engagement d'une location
  // RÉELLE : filtrer par véhicule retirerait cet engagement et laisserait la
  // location sans occupation — un véhicule libre pendant qu'il est loué.
  const occupationSources = [...reservations, ...rentals, ...maintenances]
  await purge(admin, 'vehicle_occupations',
    (q) => q.in('source_id', safe(occupationSources)), 'occupations')
  await purge(admin, 'rental_inspection_photos',
    (q) => q.in('inspection_id', safe(inspections)), 'photos d’état des lieux')
  await purge(admin, 'rental_inspections', (q) => q.in('id', safe(inspections)), 'états des lieux')
  await purge(admin, 'rentals', (q) => q.in('id', safe(rentals)), 'locations')
  await purge(admin, 'reservations', (q) => q.in('id', safe(reservations)), 'réservations')

  /* --- Référentiel ---------------------------------------------------------- */
  await purge(admin, 'financial_accounts', (q) => q.in('id', safe(accounts)), 'comptes financiers')
  await purge(admin, 'pricing_rules',
    (q) => q.or(
      `client_id.in.(${safe(clients).join(',')}),category_id.in.(${safe(categories).join(',')})`
    ),
    'règles de tarification')
  await purge(admin, 'vehicle_documents', (q) => q.in('vehicle_id', safe(vehicles)), 'documents véhicule')
  await purge(admin, 'vehicle_supplier_history',
    (q) => q.in('vehicle_id', safe(vehicles)), 'historique fournisseur')
  await purge(admin, 'vehicles', (q) => q.in('id', safe(vehicles)), 'véhicules')
  await purge(admin, 'vehicle_categories', (q) => q.in('id', safe(categories)), 'catégories')
  await purge(admin, 'supplier_payment_details',
    (q) => q.in('supplier_id', safe(suppliers)), 'coordonnées de règlement')
  await purge(admin, 'partners', (q) => q.in('id', safe(partners)), 'partenaires')
  await purge(admin, 'suppliers', (q) => q.in('id', safe(suppliers)), 'fournisseurs')
  await purge(admin, 'clients', (q) => q.in('id', safe(clients)), 'clients')

  /* --- Comptes de démonstration --------------------------------------------- */
  //
  // JAMAIS UN SUPER ADMIN, JAMAIS UN COMPTE RÉEL : la lecture qui les a
  // désignés exige `notes = DEMO_NOTE` ET `is_super_admin = false`.
  await purge(admin, 'notification_reads', (q) => q.in('user_id', safe(demoUsers)), 'lectures de notifications')
  await purge(admin, 'user_groups', (q) => q.in('user_id', safe(demoUsers)), 'rattachements aux groupes')
  await purge(admin, 'user_departments', (q) => q.in('user_id', safe(demoUsers)), 'rattachements aux départements')
  await purge(admin, 'app_users', (q) => q.in('id', safe(demoUsers)), 'comptes de démonstration')

  for (const userId of demoUsers) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) fail('suppression du compte d’authentification', error)
  }

  console.log(`\n${'─'.repeat(78)}`)
  console.log(`${removed} ligne(s) retirée(s), ${demoUsers.length} compte(s) de démonstration supprimé(s).`)

  if (blocked.length > 0) {
    console.log(
      `\n${RED}${blocked.length} table(s) partiellement retenue(s) par des données réelles :${RESET}`
    )
    for (const item of blocked) {
      console.log(`  · ${item.table} — ${item.label}`)
    }
    console.log(
      `${DIM}Ces fiches de démonstration sont référencées par des données qui ne portent\n` +
        `pas le marqueur DEMO. Elles sont conservées : le retrait ne détruit jamais\n` +
        `ce qu'il n'a pas créé.${RESET}`
    )
  }

  console.log(`${DIM}Le journal d'activité conserve la trace de ce qui a existé.${RESET}\n`)
}

main().catch((error) => {
  console.error(`\n${RED}✖ ${error.message}${RESET}\n`)
  process.exit(1)
})
