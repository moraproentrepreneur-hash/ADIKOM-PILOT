#!/usr/bin/env node
/**
 * Jeu de données de démonstration — ADIKOM PILOT.
 *
 * Crée un référentiel DEMO cohérent et PERMANENT : il n'est pas supprimé en fin
 * d'exécution et n'est jamais touché par les recettes, dont le nettoyage ne
 * vise que le marqueur « RECETTE 2.2 ».
 *
 * Le script est idempotent : relancé, il retrouve les fiches existantes par
 * leur nom et n'en crée pas de doublon. Il ne modifie aucune donnée réelle.
 *
 * Utilisation :
 *   npm run demo:seed
 *
 * Opération d'environnement : elle emprunte le rôle de service, comme
 * `bootstrap:admin`. Les identifiants internes restent produits par
 * `next_number`, donc conformes à DEC-005 et DEC-021.
 */

import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required } from './lib/env.mjs'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

const DEMO_NOTE = 'Donnée de démonstration — DEMO. Ne pas supprimer sans décision.'

const created = []
const reused = []

function report(kind, label, reference, id, isNew) {
  ;(isNew ? created : reused).push({ kind, label, reference, id })
  const tag = isNew ? `${GREEN}créé${RESET}   ` : `${DIM}existant${RESET}`
  console.log(`  ${tag} ${kind.padEnd(12)} ${label.padEnd(22)} ${reference.padEnd(12)} ${id}`)
}

/* -------------------------------------------------------------------------- */

const CLIENTS = [
  {
    legal_name: 'CLIENT DEMO 01',
    type: 'COMPANY',
    trade_name: 'Société de démonstration',
    phone: '+269 320 00 01',
    email: 'contact@client-demo-01.test',
    address: 'Avenue de la Corniche',
    city: 'Moroni',
    country: 'Comores',
    registration_number: 'RC-DEMO-001',
  },
  {
    legal_name: 'CLIENT DEMO 02',
    type: 'COMPANY',
    trade_name: 'Agence de démonstration',
    phone: '+269 320 00 02',
    email: 'contact@client-demo-02.test',
    city: 'Mutsamudu',
    country: 'Comores',
    registration_number: 'RC-DEMO-002',
  },
  {
    legal_name: 'CLIENT DEMO 03',
    type: 'INDIVIDUAL',
    first_name: 'Client',
    phone: '+269 320 00 03',
    email: 'contact@client-demo-03.test',
    city: 'Fomboni',
    country: 'Comores',
    id_document_type: 'Carte d’identité',
    id_document_number: 'ID-DEMO-003',
  },
]

const SUPPLIERS = [
  {
    legal_name: 'FOURNISSEUR DEMO 01',
    type: 'VEHICLE_SUPPLIER',
    contact_name: 'Responsable de démonstration',
    phone: '+269 330 00 01',
    email: 'contact@fournisseur-demo-01.test',
    city: 'Moroni',
    country: 'Comores',
  },
  {
    legal_name: 'FOURNISSEUR DEMO 02',
    type: 'MAINTENANCE_PROVIDER',
    contact_name: 'Atelier de démonstration',
    phone: '+269 330 00 02',
    city: 'Moroni',
    country: 'Comores',
  },
  {
    legal_name: 'FOURNISSEUR DEMO 03',
    type: 'SERVICE_PROVIDER',
    contact_name: 'Prestataire de démonstration',
    phone: '+269 330 00 03',
    city: 'Mutsamudu',
    country: 'Comores',
  },
]

const CATEGORIES = [
  {
    code: 'DEMO-01',
    label: 'CATEGORIE DEMO 01',
    description: 'Catégorie de démonstration — véhicules de tourisme.',
    display_order: 91,
  },
  {
    code: 'DEMO-02',
    label: 'CATEGORIE DEMO 02',
    description: 'Catégorie de démonstration — véhicules tout-terrain.',
    display_order: 92,
  },
  {
    code: 'DEMO-03',
    label: 'CATEGORIE DEMO 03',
    description: 'Catégorie de démonstration — utilitaires.',
    display_order: 93,
  },
]

/**
 * Véhicules de démonstration.
 *
 * VEHICULE DEMO 03, d'origine « Partenariat », n'est PAS créé : la structure
 * des partenaires n'existe pas encore dans le projet, et la contrainte
 * `vehicles_origin_supplier_coherent` n'offre aucun emplacement pour rattacher
 * un partenaire. Le créer sans rattachement donnerait un exemple faux.
 */
const VEHICLES = [
  {
    model: 'VEHICULE DEMO 01',
    brand: 'DEMO',
    plate: 'DEMO 001',
    categoryCode: 'DEMO-01',
    origin: 'OWNED',
    supplierName: null,
    model_year: 2022,
    color: 'Blanc',
    fuel: 'PETROL',
    transmission: 'AUTOMATIC',
    seats: 5,
    doors: 5,
    mileage: 18500,
  },
  {
    model: 'VEHICULE DEMO 02',
    brand: 'DEMO',
    plate: 'DEMO 002',
    categoryCode: 'DEMO-02',
    origin: 'SUPPLIED',
    supplierName: 'FOURNISSEUR DEMO 01',
    model_year: 2021,
    color: 'Gris métallisé',
    fuel: 'DIESEL',
    transmission: 'MANUAL',
    seats: 7,
    doors: 5,
    mileage: 42000,
  },
]

/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  console.log(`\nJeu de démonstration — ADIKOM PILOT\n`)

  // --- Clients ---------------------------------------------------------------
  console.log('Clients')
  const clientIds = {}

  for (const client of CLIENTS) {
    const { data: existing } = await admin
      .from('clients')
      .select('id, client_no')
      .eq('legal_name', client.legal_name)
      .maybeSingle()

    if (existing) {
      clientIds[client.legal_name] = existing.id
      report('client', client.legal_name, existing.client_no, existing.id, false)
      continue
    }

    const { data: number } = await admin.rpc('next_number', { p_entity_key: 'client' })
    const { data, error } = await admin
      .from('clients')
      .insert({ ...client, client_no: number, notes: DEMO_NOTE })
      .select('id, client_no')
      .single()

    if (error) throw new Error(`${client.legal_name} : ${error.message}`)

    clientIds[client.legal_name] = data.id
    report('client', client.legal_name, data.client_no, data.id, true)
  }

  // --- Fournisseurs ----------------------------------------------------------
  console.log('\nFournisseurs')
  const supplierIds = {}

  for (const supplier of SUPPLIERS) {
    const { data: existing } = await admin
      .from('suppliers')
      .select('id, supplier_no')
      .eq('legal_name', supplier.legal_name)
      .maybeSingle()

    if (existing) {
      supplierIds[supplier.legal_name] = existing.id
      report('fournisseur', supplier.legal_name, existing.supplier_no, existing.id, false)
      continue
    }

    const { data: number } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
    const { data, error } = await admin
      .from('suppliers')
      .insert({ ...supplier, supplier_no: number, notes: DEMO_NOTE })
      .select('id, supplier_no')
      .single()

    if (error) throw new Error(`${supplier.legal_name} : ${error.message}`)

    supplierIds[supplier.legal_name] = data.id
    report('fournisseur', supplier.legal_name, data.supplier_no, data.id, true)
  }

  // --- Catégories ------------------------------------------------------------
  console.log('\nCatégories')
  const categoryIds = {}

  for (const category of CATEGORIES) {
    const { data: existing } = await admin
      .from('vehicle_categories')
      .select('id, code')
      .eq('code', category.code)
      .maybeSingle()

    if (existing) {
      categoryIds[category.code] = existing.id
      report('catégorie', category.label, existing.code, existing.id, false)
      continue
    }

    const { data, error } = await admin
      .from('vehicle_categories')
      .insert(category)
      .select('id, code')
      .single()

    if (error) throw new Error(`${category.label} : ${error.message}`)

    categoryIds[category.code] = data.id
    report('catégorie', category.label, data.code, data.id, true)
  }

  // --- Véhicules -------------------------------------------------------------
  console.log('\nVéhicules')

  for (const vehicle of VEHICLES) {
    const { data: existing } = await admin
      .from('vehicles')
      .select('id, vehicle_no')
      .eq('model', vehicle.model)
      .maybeSingle()

    if (existing) {
      report('véhicule', vehicle.model, existing.vehicle_no, existing.id, false)
      continue
    }

    const supplierId = vehicle.supplierName ? supplierIds[vehicle.supplierName] : null
    const { data: number } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })

    const { data, error } = await admin
      .from('vehicles')
      .insert({
        vehicle_no: number,
        brand: vehicle.brand,
        model: vehicle.model,
        plate: vehicle.plate,
        category_id: categoryIds[vehicle.categoryCode],
        origin: vehicle.origin,
        current_supplier_id: supplierId,
        model_year: vehicle.model_year,
        color: vehicle.color,
        fuel: vehicle.fuel,
        transmission: vehicle.transmission,
        seats: vehicle.seats,
        doors: vehicle.doors,
        mileage: vehicle.mileage,
        initial_mileage: vehicle.mileage,
        entry_date: new Date().toISOString().slice(0, 10),
        notes: DEMO_NOTE,
      })
      .select('id, vehicle_no')
      .single()

    if (error) throw new Error(`${vehicle.model} : ${error.message}`)

    // Le rattachement ouvre l'historique du fournisseur : sans lui, on ne
    // saurait pas depuis quand ce fournisseur fournit ce véhicule (§60).
    if (supplierId) {
      const { error: historyError } = await admin.from('vehicle_supplier_history').insert({
        vehicle_id: data.id,
        supplier_id: supplierId,
        started_on: new Date().toISOString().slice(0, 10),
        reason: 'Mise à disposition initiale — démonstration',
      })

      if (historyError) throw new Error(`historique ${vehicle.model} : ${historyError.message}`)
    }

    report('véhicule', vehicle.model, data.vehicle_no, data.id, true)
  }

  console.log(`\n${'─'.repeat(74)}`)
  console.log(`${created.length} fiche(s) créée(s), ${reused.length} déjà présente(s).`)
  console.log(
    `${DIM}Ces données sont permanentes : aucune recette ne les supprime.${RESET}`
  )
  console.log(
    `${RED}VEHICULE DEMO 03 et PARTENAIRE DEMO 01-03 ne sont pas créés :${RESET}` +
      ` la structure des partenaires n'existe pas encore.`
  )
  console.log('')
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
