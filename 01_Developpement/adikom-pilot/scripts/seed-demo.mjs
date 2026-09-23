#!/usr/bin/env node
/**
 * Jeu de données de démonstration — ADIKOM PILOT.
 *
 * CE QUE CE SCRIPT PRODUIT
 *
 * Un environnement qui donne l'impression d'un SaaS RÉELLEMENT UTILISÉ : des
 * dossiers à différents stades, des factures partiellement réglées, une
 * maintenance imputée à un fournisseur, un projet en cours et des réunions
 * tenues. Pas une liste d'objets — des SITUATIONS, que les neuf modules
 * savent montrer.
 *
 * CE QU'IL NE FAIT PAS
 *
 *   · il n'invente aucune règle métier : chaque acte passe par la FONCTION
 *     prévue par l'application (`confirm_reservation`, `record_supplier_payment`,
 *     `validate_imputation`…), jamais par un `INSERT` qui contournerait un
 *     contrôle ;
 *   · il ne touche ni au catalogue des permissions, ni aux groupes système, ni
 *     aux paramètres de l'entreprise ;
 *   · il ne modifie aucune donnée réelle : il ne crée que ce qui porte le
 *     marqueur DEMO, et retrouve ce qui existe déjà.
 *
 * IDEMPOTENT. Relancé, il n'ajoute pas de doublon : chaque objet est retrouvé
 * par sa clé naturelle ou par son étiquette (`scripts/lib/demo.mjs`).
 *
 * RÉVERSIBLE. `npm run demo:clean` retire exactement ce que ce script a posé.
 *
 * Opération d'environnement : elle emprunte le rôle de service, comme
 * `bootstrap:admin`. `current_actor()` y vaut NULL — les capacités ne sont donc
 * pas vérifiées, mais TOUTES les règles de cohérence le sont (migration 021).
 * Les identifiants internes restent produits par `next_number` (DEC-005).
 *
 * Utilisation :
 *   npm run demo:seed
 */

import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required, dayOffset, instantOffset } from './lib/env.mjs'
import { DEMO_NOTE, tag } from './lib/demo.mjs'

const GREEN = '\x1b[32m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

let created = 0
let reused = 0

function report(kind, label, reference, isNew) {
  if (isNew) created += 1
  else reused += 1
  const mark = isNew ? `${GREEN}créé${RESET}    ` : `${DIM}existant${RESET}`
  console.log(`  ${mark} ${kind.padEnd(16)} ${label.padEnd(34)} ${DIM}${reference ?? ''}${RESET}`)
}

function section(title) {
  console.log(`\n${title}`)
}

/** Interrompt avec un message lisible plutôt qu'une trace technique. */
function fail(context, error) {
  throw new Error(`${context} : ${error.message ?? error}`)
}

/* ========================================================================== */
/*  Référentiel                                                               */
/* ========================================================================== */

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
    status: 'ACTIVE',
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
    status: 'ACTIVE',
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
    status: 'ACTIVE',
  },
  {
    legal_name: 'CLIENT DEMO 04',
    type: 'COMPANY',
    trade_name: 'Organisation de démonstration',
    phone: '+269 320 00 04',
    email: 'contact@client-demo-04.test',
    city: 'Moroni',
    country: 'Comores',
    status: 'PROSPECT',
  },
  {
    legal_name: 'CLIENT DEMO 05',
    type: 'INDIVIDUAL',
    first_name: 'Ancien',
    phone: '+269 320 00 05',
    city: 'Moroni',
    country: 'Comores',
    status: 'INACTIVE',
    status_reason: 'Compte inactif depuis la fin du contrat de démonstration.',
  },
  {
    legal_name: 'CLIENT DEMO 06',
    type: 'COMPANY',
    trade_name: 'Institution de démonstration',
    phone: '+269 320 00 06',
    email: 'contact@client-demo-06.test',
    city: 'Moroni',
    country: 'Comores',
    registration_number: 'RC-DEMO-006',
    status: 'ACTIVE',
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
  {
    legal_name: 'FOURNISSEUR DEMO 04',
    type: 'PARTS_SUPPLIER',
    contact_name: 'Pièces de démonstration',
    phone: '+269 330 00 04',
    city: 'Moroni',
    country: 'Comores',
  },
]

const PAYMENT_DETAILS = [
  {
    supplierName: 'FOURNISSEUR DEMO 01',
    kind: 'BANK_ACCOUNT',
    label: 'Compte principal',
    account_holder: 'FOURNISSEUR DEMO 01',
    bank_name: 'Banque de démonstration',
    account_number: 'DEMO-0000-0001',
    currency_code: 'KMF',
    is_primary: true,
  },
  {
    supplierName: 'FOURNISSEUR DEMO 02',
    kind: 'OTHER',
    label: 'Règlement en espèces',
    account_holder: 'FOURNISSEUR DEMO 02',
    // Une coordonnée non bancaire porte SA référence, et aucune colonne
    // bancaire : `supplier_payment_other_shape` l'impose.
    account_reference: 'Retrait en agence — guichet de démonstration',
    currency_code: 'KMF',
    is_primary: true,
  },
]

const PARTNERS = [
  {
    legal_name: 'PARTENAIRE DEMO 01',
    trade_name: 'Partenariat de démonstration',
    contact_name: 'Référent de démonstration',
    phone: '+269 340 00 01',
    email: 'contact@partenaire-demo-01.test',
    city: 'Moroni',
    country: 'Comores',
  },
  {
    legal_name: 'PARTENAIRE DEMO 02',
    contact_name: 'Référent de démonstration',
    phone: '+269 340 00 02',
    city: 'Mutsamudu',
    country: 'Comores',
  },
  {
    legal_name: 'PARTENAIRE DEMO 03',
    contact_name: 'Référent de démonstration',
    phone: '+269 340 00 03',
    city: 'Fomboni',
    country: 'Comores',
  },
]

const CATEGORIES = [
  { code: 'DEMO-01', label: 'CATEGORIE DEMO 01', description: 'Véhicules de tourisme.', display_order: 91 },
  { code: 'DEMO-02', label: 'CATEGORIE DEMO 02', description: 'Véhicules tout-terrain.', display_order: 92 },
  { code: 'DEMO-03', label: 'CATEGORIE DEMO 03', description: 'Utilitaires.', display_order: 93 },
  { code: 'DEMO-04', label: 'CATEGORIE DEMO 04', description: 'Véhicules avec chauffeur.', display_order: 94 },
]

/**
 * Les trois origines que le Parc doit savoir traiter, et les états qu'il doit
 * savoir montrer. La contrainte `vehicles_origin_attachment_coherent` impose
 * que chaque véhicule porte le rattachement de son origine, et lui seul.
 */
const VEHICLES = [
  {
    model: 'VEHICULE DEMO 01', brand: 'DEMO', plate: 'DEMO 001', categoryCode: 'DEMO-01',
    origin: 'OWNED', model_year: 2022, color: 'Blanc', fuel: 'PETROL',
    transmission: 'AUTOMATIC', seats: 5, doors: 5, mileage: 18500,
  },
  {
    model: 'VEHICULE DEMO 02', brand: 'DEMO', plate: 'DEMO 002', categoryCode: 'DEMO-02',
    origin: 'SUPPLIED', supplierName: 'FOURNISSEUR DEMO 01', model_year: 2021,
    color: 'Gris métallisé', fuel: 'DIESEL', transmission: 'MANUAL',
    seats: 7, doors: 5, mileage: 42000,
  },
  {
    model: 'VEHICULE DEMO 03', brand: 'DEMO', plate: 'DEMO 003', categoryCode: 'DEMO-03',
    origin: 'PARTNERSHIP', partnerName: 'PARTENAIRE DEMO 01', model_year: 2023,
    color: 'Bleu marine', fuel: 'HYBRID', transmission: 'AUTOMATIC',
    seats: 5, doors: 5, mileage: 9800,
  },
  {
    model: 'VEHICULE DEMO 04', brand: 'DEMO', plate: 'DEMO 004', categoryCode: 'DEMO-01',
    origin: 'OWNED', model_year: 2020, color: 'Noir', fuel: 'PETROL',
    transmission: 'MANUAL', seats: 5, doors: 5, mileage: 76400,
  },
  {
    model: 'VEHICULE DEMO 05', brand: 'DEMO', plate: 'DEMO 005', categoryCode: 'DEMO-02',
    origin: 'SUPPLIED', supplierName: 'FOURNISSEUR DEMO 01', model_year: 2022,
    color: 'Rouge', fuel: 'DIESEL', transmission: 'AUTOMATIC',
    seats: 5, doors: 3, mileage: 31200,
  },
  {
    model: 'VEHICULE DEMO 06', brand: 'DEMO', plate: 'DEMO 006', categoryCode: 'DEMO-03',
    origin: 'OWNED', model_year: 2019, color: 'Blanc', fuel: 'DIESEL',
    transmission: 'MANUAL', seats: 3, doors: 4, mileage: 118000,
    status: 'UNAVAILABLE',
    status_reason: 'Retiré de la disponibilité commerciale pour la démonstration.',
  },
  {
    model: 'VEHICULE DEMO 07', brand: 'DEMO', plate: 'DEMO 007', categoryCode: 'DEMO-04',
    origin: 'PARTNERSHIP', partnerName: 'PARTENAIRE DEMO 02', model_year: 2024,
    color: 'Gris anthracite', fuel: 'HYBRID', transmission: 'AUTOMATIC',
    seats: 5, doors: 5, mileage: 4200,
  },
  {
    model: 'VEHICULE DEMO 08', brand: 'DEMO', plate: 'DEMO 008', categoryCode: 'DEMO-01',
    origin: 'OWNED', model_year: 2018, color: 'Beige', fuel: 'PETROL',
    transmission: 'MANUAL', seats: 5, doors: 5, mileage: 143000,
    status: 'RETIRED',
    status_reason: 'Sorti du parc — fin de vie économique.',
    exit_reason: 'Fin de vie économique',
  },
]

/**
 * Tarification — du plus général au plus précis.
 *
 * `resolve_pricing_rule` choisit la règle la plus SPÉCIFIQUE applicable : une
 * règle de catégorie sert de tarif standard, une règle client de tarif
 * préférentiel (CLAUDE.md §13), une règle véhicule d'exception.
 */
const PRICING = [
  { code: 'T1', categoryCode: 'DEMO-01', amount: 25000, unit: 'DAY', conditions: 'Tarif standard tourisme.' },
  { code: 'T2', categoryCode: 'DEMO-02', amount: 40000, unit: 'DAY', conditions: 'Tarif standard tout-terrain.' },
  { code: 'T3', categoryCode: 'DEMO-03', amount: 32000, unit: 'DAY', conditions: 'Tarif standard utilitaire.' },
  { code: 'T4', categoryCode: 'DEMO-04', amount: 55000, unit: 'DAY', conditions: 'Tarif standard avec chauffeur.' },
  {
    code: 'T5', clientName: 'CLIENT DEMO 01', discount_percent: 15,
    conditions: 'Tarif préférentiel — convention annuelle de démonstration.',
  },
  {
    code: 'T6', clientName: 'CLIENT DEMO 02', categoryCode: 'DEMO-02', amount: 34000, unit: 'DAY',
    conditions: 'Tarif négocié tout-terrain — démonstration.',
  },
]

const ACCOUNTS = [
  {
    code: 'C1', kind: 'BANK', label: 'BANQUE DEMO — Compte courant',
    institution: 'Banque de démonstration', account_reference: 'DEMO-BQ-0001',
    opening_balance: 8_000_000, openedOffset: -365,
  },
  {
    code: 'C2', kind: 'BANK', label: 'BANQUE DEMO — Compte de réserve',
    institution: 'Banque de démonstration', account_reference: 'DEMO-BQ-0002',
    opening_balance: 3_500_000, openedOffset: -365,
  },
  {
    code: 'C3', kind: 'CASH', label: 'CAISSE DEMO — Agence de Moroni',
    opening_balance: 450_000, openedOffset: -180,
  },
]

/* ========================================================================== */
/*  Utilitaires d'idempotence                                                 */
/* ========================================================================== */

/**
 * Crée une ligne si elle n'existe pas, et renvoie son identifiant.
 * `match` désigne la clé naturelle : c'est elle qui fait l'idempotence.
 */
async function ensure(admin, table, match, build, label, kind, refColumn) {
  const query = admin.from(table).select(`id${refColumn ? `, ${refColumn}` : ''}`)
  for (const [column, value] of Object.entries(match)) query.eq(column, value)

  const { data: existing, error: readError } = await query.maybeSingle()
  if (readError) fail(`${kind} ${label}`, readError)

  if (existing) {
    report(kind, label, refColumn ? existing[refColumn] : null, false)
    return existing.id
  }

  const payload = await build()
  const { data, error } = await admin
    .from(table)
    .insert(payload)
    .select(`id${refColumn ? `, ${refColumn}` : ''}`)
    .single()

  if (error) fail(`${kind} ${label}`, error)

  report(kind, label, refColumn ? data[refColumn] : null, true)
  return data.id
}

/** Numéro interne produit par la base — jamais fabriqué par ce script. */
async function nextNumber(admin, entityKey) {
  const { data, error } = await admin.rpc('next_number', { p_entity_key: entityKey })
  if (error) fail(`numérotation ${entityKey}`, error)
  return data
}

async function rpc(admin, name, args, context) {
  const { data, error } = await admin.rpc(name, args)
  if (error) fail(context ?? name, error)
  return data
}

/** Période `tstzrange` sur des jours pleins, à l'heure des Comores. */
function period(fromOffset, toOffset) {
  return `[${dayOffset(fromOffset)}T08:00:00+03,${dayOffset(toOffset)}T18:00:00+03)`
}

/* ========================================================================== */
/*  Programme                                                                 */
/* ========================================================================== */

async function main() {
  loadEnvFile()

  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  console.log('\nJeu de démonstration — ADIKOM PILOT')
  console.log(`${DIM}Les données portent le marqueur DEMO et se retirent par « npm run demo:clean ».${RESET}`)

  const ids = {
    clients: {}, suppliers: {}, partners: {}, categories: {},
    vehicles: {}, accounts: {}, users: {}, projects: {},
    serviceCategories: {}, services: {},
  }

  /* --- Utilisateurs de démonstration -------------------------------------- */
  await seedUsers(admin, ids)

  /* --- Tiers --------------------------------------------------------------- */
  section('Clients')
  for (const client of CLIENTS) {
    ids.clients[client.legal_name] = await ensure(
      admin, 'clients', { legal_name: client.legal_name },
      async () => ({ ...client, client_no: await nextNumber(admin, 'client'), notes: DEMO_NOTE }),
      client.legal_name, 'client', 'client_no'
    )
  }

  section('Fournisseurs')
  for (const supplier of SUPPLIERS) {
    ids.suppliers[supplier.legal_name] = await ensure(
      admin, 'suppliers', { legal_name: supplier.legal_name },
      async () => ({ ...supplier, supplier_no: await nextNumber(admin, 'supplier'), notes: DEMO_NOTE }),
      supplier.legal_name, 'fournisseur', 'supplier_no'
    )
  }

  section('Coordonnées de règlement')
  for (const detail of PAYMENT_DETAILS) {
    const { supplierName, ...rest } = detail
    await ensure(
      admin, 'supplier_payment_details',
      { supplier_id: ids.suppliers[supplierName], label: rest.label },
      async () => ({ ...rest, supplier_id: ids.suppliers[supplierName], notes: DEMO_NOTE }),
      `${supplierName} — ${rest.label}`, 'règlement', null
    )
  }

  section('Partenaires')
  for (const partner of PARTNERS) {
    ids.partners[partner.legal_name] = await ensure(
      admin, 'partners', { legal_name: partner.legal_name },
      async () => ({ ...partner, partner_no: await nextNumber(admin, 'partner'), notes: DEMO_NOTE }),
      partner.legal_name, 'partenaire', 'partner_no'
    )
  }

  /* --- Parc ---------------------------------------------------------------- */
  section('Catégories de véhicules')
  for (const category of CATEGORIES) {
    ids.categories[category.code] = await ensure(
      admin, 'vehicle_categories', { code: category.code },
      async () => category, category.label, 'catégorie', 'code'
    )
  }

  section('Véhicules')
  for (const vehicle of VEHICLES) {
    const supplierId = vehicle.supplierName ? ids.suppliers[vehicle.supplierName] : null
    const isNew = !(await exists(admin, 'vehicles', { model: vehicle.model }))

    ids.vehicles[vehicle.model] = await ensure(
      admin, 'vehicles', { model: vehicle.model },
      async () => ({
        vehicle_no: await nextNumber(admin, 'vehicle'),
        brand: vehicle.brand,
        model: vehicle.model,
        plate: vehicle.plate,
        category_id: ids.categories[vehicle.categoryCode],
        origin: vehicle.origin,
        current_supplier_id: supplierId,
        partner_id: vehicle.partnerName ? ids.partners[vehicle.partnerName] : null,
        model_year: vehicle.model_year,
        color: vehicle.color,
        fuel: vehicle.fuel,
        transmission: vehicle.transmission,
        seats: vehicle.seats,
        doors: vehicle.doors,
        mileage: vehicle.mileage,
        initial_mileage: vehicle.mileage,
        entry_date: dayOffset(-400),
        exit_date: vehicle.status === 'RETIRED' ? dayOffset(-30) : null,
        exit_reason: vehicle.exit_reason ?? null,
        status: vehicle.status ?? 'AVAILABLE',
        status_reason: vehicle.status_reason ?? null,
        notes: DEMO_NOTE,
      }),
      vehicle.model, 'véhicule', 'vehicle_no'
    )

    // Le rattachement ouvre l'historique du fournisseur : sans lui, on ne
    // saurait pas depuis quand ce fournisseur fournit ce véhicule.
    if (isNew && supplierId) {
      const { error } = await admin.from('vehicle_supplier_history').insert({
        vehicle_id: ids.vehicles[vehicle.model],
        supplier_id: supplierId,
        started_on: dayOffset(-400),
        reason: 'Mise à disposition initiale — démonstration',
      })
      if (error) fail(`historique ${vehicle.model}`, error)
    }
  }

  section('Tarification')
  for (const rule of PRICING) {
    await ensure(
      admin, 'pricing_rules', { conditions: rule.conditions },
      async () => ({
        client_id: rule.clientName ? ids.clients[rule.clientName] : null,
        category_id: rule.categoryCode ? ids.categories[rule.categoryCode] : null,
        vehicle_id: rule.vehicleModel ? ids.vehicles[rule.vehicleModel] : null,
        amount: rule.amount ?? null,
        unit: rule.unit ?? null,
        discount_percent: rule.discount_percent ?? null,
        valid_from: dayOffset(-400),
        is_active: true,
        conditions: rule.conditions,
      }),
      rule.conditions, 'tarif', null
    )
  }

  /* --- Trésorerie ---------------------------------------------------------- */
  section('Comptes financiers')
  for (const account of ACCOUNTS) {
    const { data: existing } = await admin
      .from('financial_accounts').select('id, account_no').eq('label', account.label).maybeSingle()

    if (existing) {
      ids.accounts[account.code] = existing.id
      report('compte', account.label, existing.account_no, false)
      continue
    }

    const id = await rpc(admin, 'create_financial_account', {
      p_kind: account.kind,
      p_label: account.label,
      p_institution: account.institution ?? null,
      p_account_reference: account.account_reference ?? null,
      p_opening_balance: account.opening_balance,
      p_opened_on: dayOffset(account.openedOffset),
      p_description: DEMO_NOTE,
    }, `compte ${account.label}`)

    ids.accounts[account.code] = id
    report('compte', account.label, null, true)
  }

  await seedCatalog(admin, ids)
  await seedSupplierRates(admin, ids)

  await seedRentalCycle(admin, ids)
  await seedMaintenance(admin, ids)
  await seedSupplierBilling(admin, ids)
  await seedCustomerBilling(admin, ids)
  await seedTreasuryOperations(admin, ids)
  await seedCommerce(admin, ids)
  await seedPurchasing(admin, ids)
  await seedProjects(admin, ids)

  console.log(`\n${'─'.repeat(78)}`)
  console.log(`${created} élément(s) créé(s), ${reused} déjà présent(s).`)
  console.log(`${DIM}Retrait complet : npm run demo:clean${RESET}\n`)
}

async function exists(admin, table, match) {
  const query = admin.from(table).select('id')
  for (const [column, value] of Object.entries(match)) query.eq(column, value)
  const { data } = await query.maybeSingle()
  return Boolean(data)
}

/* ========================================================================== */
/*  Catalogue de services — Module 10, LOT 20                                 */
/* ========================================================================== */

/**
 * Trois services, et surtout UNE CHRONOLOGIE DE PRIX.
 *
 * Le Plan 02 §19.6 l'exige explicitement : « les jeux DEMO devront comporter des
 * services à PLUSIEURS VERSIONS DE PRIX, dont une ÉCHUE et une FUTURE — sans
 * quoi l'historisation ne serait jamais éprouvée en recette ».
 *
 * Un seul prix par service montrerait un écran qui marche et ne prouverait rien.
 * Le transfert aéroport porte donc trois versions : celle d'il y a trois mois,
 * close ; celle d'aujourd'hui ; et celle qui prendra effet dans un mois — saisie
 * AVANT sa date d'effet, ce qui est tout l'objet de D16.
 *
 * Les trois destinations sont représentées, parce que chacune ferme quelque
 * chose de différent : l'une refuse les coûts, l'autre refuse les prix de vente.
 */
const SERVICE_CATEGORIES = [
  {
    code: 'DEMO-SRV-TRANSPORT',
    label: 'DEMO Transport & Transfert',
    description: DEMO_NOTE,
    display_order: 1,
  },
  {
    code: 'DEMO-SRV-TOURISME',
    label: 'DEMO Prestations touristiques',
    description: DEMO_NOTE,
    display_order: 2,
  },
  {
    code: 'DEMO-SRV-TECHNIQUE',
    label: 'DEMO Services techniques',
    description: DEMO_NOTE,
    display_order: 3,
  },
]

const SERVICES = [
  {
    key: 'transfert',
    label: 'SERVICE DEMO 01 — Transfert aéroport',
    categoryCode: 'DEMO-SRV-TRANSPORT',
    purpose: 'BOTH',
    unit_label: 'trajet',
    description: 'Prise en charge à l’aéroport et transfert vers l’hébergement.',
    variants: [
      {
        label: 'Standard',
        // Trois versions : une échue, une en vigueur, une à venir.
        prices: [
          { amount: 50000, offset: -90, reason: 'Tarif d’ouverture' },
          { amount: 60000, offset: -30, reason: 'Révision tarifaire' },
          { amount: 65000, offset: 30, reason: 'Révision annoncée' },
        ],
        costs: [{ amount: 35000, offset: -90, reason: 'Coût d’acquisition négocié' }],
      },
      {
        label: 'Premium',
        sku: 'DEMO-TRF-PREM',
        prices: [{ amount: 95000, offset: -60, reason: 'Véhicule haut de gamme' }],
        costs: [{ amount: 62000, offset: -60, reason: 'Coût d’acquisition' }],
      },
    ],
  },
  {
    key: 'excursion',
    label: 'SERVICE DEMO 02 — Excursion Itsandra',
    categoryCode: 'DEMO-SRV-TOURISME',
    purpose: 'SALE',
    unit_label: 'personne',
    description: 'Excursion à la journée, guide inclus. Vendue, jamais achetée.',
    variants: [
      {
        label: 'Standard',
        prices: [{ amount: 28000, offset: -45, reason: 'Tarif saison' }],
        costs: [],
      },
    ],
  },
  {
    key: 'assistance',
    label: 'SERVICE DEMO 03 — Assistance technique',
    categoryCode: 'DEMO-SRV-TECHNIQUE',
    purpose: 'PURCHASE',
    unit_label: 'intervention',
    description: 'Prestation achetée auprès d’un tiers. Elle ne se vend pas.',
    variants: [
      {
        label: 'Standard',
        prices: [],
        costs: [{ amount: 45000, offset: -20, reason: 'Contrat d’assistance' }],
      },
    ],
  },
]

async function seedCatalog(admin, ids) {
  section('Catalogue de services')

  for (const category of SERVICE_CATEGORIES) {
    ids.serviceCategories[category.code] = await ensure(
      admin,
      'service_categories',
      { code: category.code },
      async () => category,
      category.label,
      'catégorie',
      'code'
    )
  }

  for (const service of SERVICES) {
    const serviceId = await ensure(
      admin,
      'services',
      { label: service.label },
      async () => ({
        service_no: await nextNumber(admin, 'service'),
        label: service.label,
        category_id: ids.serviceCategories[service.categoryCode],
        purpose: service.purpose,
        unit_label: service.unit_label,
        description: service.description,
        notes: DEMO_NOTE,
      }),
      service.label,
      'service',
      'service_no'
    )

    ids.services[service.key] = serviceId

    for (const variant of service.variants) {
      // La variante « Standard » est posée par la base à la création du service :
      // on la RETROUVE plutôt que de la recréer.
      const variantId = await ensure(
        admin,
        'service_variants',
        { service_id: serviceId, label: variant.label },
        async () => ({
          service_id: serviceId,
          label: variant.label,
          sku: variant.sku ?? null,
        }),
        `${service.label} · ${variant.label}`,
        'variante',
        null
      )

      /*
       * LES PRIX PASSENT PAR LA FONCTION, jamais par un `insert` : c'est elle
       * qui clôt la version précédente et ouvre la suivante (D16(a)). Un
       * `insert` direct produirait des versions qui se chevauchent, et la base
       * les refuserait — à juste titre.
       *
       * La saisie n'a lieu QUE si la variante n'a encore aucune version : le
       * script est idempotent, et rejouer une chronologie la fausserait.
       */
      await seedPriceTimeline(admin, 'service_variant_prices', 'set_service_price', variantId, variant.prices)
      await seedPriceTimeline(admin, 'service_variant_costs', 'set_service_cost', variantId, variant.costs)
    }
  }
}

async function seedPriceTimeline(admin, table, fn, variantId, versions) {
  if (!versions || versions.length === 0) return

  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('variant_id', variantId)

  if (error) fail(`lecture ${table}`, error)
  if (count > 0) {
    reused += 1
    return
  }

  // L'ordre chronologique est impératif : chaque version clôt la précédente.
  for (const version of [...versions].sort((a, b) => a.offset - b.offset)) {
    await rpc(
      admin,
      fn,
      {
        p_variant_id: variantId,
        p_amount: version.amount,
        p_valid_from: dayOffset(version.offset),
        p_reason: version.reason,
      },
      `${fn} (${version.amount} KMF au ${dayOffset(version.offset)})`
    )
    created += 1
  }
}

/* ========================================================================== */
/*  Coûts d'acquisition des véhicules — LOT 21, DEC-044                       */
/* ========================================================================== */

/**
 * Ce qu'ADIKOM PAIE pour disposer de ses véhicules fournis.
 *
 * UNE CHRONOLOGIE, ET NON UN MONTANT — même raison qu'au LOT 20 : un coût unique
 * montrerait un écran qui marche et ne prouverait rien. Le jeu porte donc une
 * version ÉCHUE, une EN VIGUEUR et une À VENIR, afin que l'historisation soit
 * visible sans attendre le calendrier.
 *
 * LE RÉSULTAT DE LA DIRECTION, SANS TOUCHER AU BARÈME EXISTANT :
 *
 *   VEHICULE DEMO 02 — barème client 40 000 KMF/jour (catégorie DEMO-02)
 *                      coût d'acquisition en vigueur 30 000
 *                   →  COMMISSION DE 10 000 KMF/JOUR
 *
 * Le mémo de la Direction illustre 40 000 payés pour 50 000 facturés. L'écart
 * qu'elle décrit — 10 000 KMF par jour — est celui que montre la démonstration ;
 * les deux montants sont ceux du barème DÉJÀ en place, qu'un jeu de données ne
 * doit pas déplacer pour faire joli. Le cas à la lettre, lui, est joué par
 * `verify:supplier-rates` sur son propre décor.
 *
 * AUCUN COÛT SUR LES VÉHICULES ADIKOM NI DE PARTENARIAT : la décision manque
 * (P-2 pour les premiers, aucune décision pour les seconds), et un jeu de
 * démonstration ne tranche pas ce que la Direction n'a pas tranché. L'écran
 * montre alors « sans objet », ce qui est la vérité.
 *
 * VEHICULE DEMO 05 reste SANS COÛT, délibérément : c'est le cas « coût absent »,
 * celui où la commission n'est pas calculée — et surtout pas égale au tarif.
 */
const SUPPLIER_RATES = [
  {
    vehicleModel: 'VEHICULE DEMO 02',
    versions: [
      { offset: -400, amount: 26000, reason: 'Contrat initial de mise à disposition' },
      { offset: -90, amount: 30000, reason: 'Révision annuelle du contrat' },
      { offset: 45, amount: 34000, reason: 'Hausse convenue, applicable à terme' },
    ],
    conditions: 'Contrat annuel, révision au 1er trimestre. Carburant à la charge du locataire.',
  },
]

async function seedSupplierRates(admin, ids) {
  section('Coûts d’acquisition des véhicules')

  for (const rate of SUPPLIER_RATES) {
    const vehicleId = ids.vehicles[rate.vehicleModel]
    if (!vehicleId) continue

    /*
     * Le script est IDEMPOTENT : rejouer une chronologie la fausserait. On ne
     * saisit que si le véhicule n'a encore aucune version.
     */
    const { count, error } = await admin
      .from('supplier_vehicle_rates')
      .select('id', { count: 'exact', head: true })
      .eq('vehicle_id', vehicleId)

    if (error) fail('lecture des coûts d’acquisition', error)

    if (count > 0) {
      reused += 1
      report('coût d’acquisition', rate.vehicleModel, null, false)
      continue
    }

    /*
     * LES COÛTS PASSENT PAR LA FONCTION, jamais par un `insert` : c'est elle qui
     * clôt la version précédente et ouvre la suivante (D16(a)). Un `insert`
     * direct produirait des versions qui se chevauchent, et la base les
     * refuserait — à juste titre.
     *
     * L'ordre chronologique est impératif : chaque version clôt la précédente.
     */
    for (const version of [...rate.versions].sort((a, b) => a.offset - b.offset)) {
      await rpc(
        admin,
        'set_supplier_vehicle_rate',
        {
          p_vehicle_id: vehicleId,
          p_supplier_id: null,
          p_amount: version.amount,
          p_unit: 'DAY',
          p_valid_from: dayOffset(version.offset),
          p_conditions: rate.conditions,
          p_reason: version.reason,
        },
        `coût d’acquisition (${version.amount} KMF au ${dayOffset(version.offset)})`
      )
      created += 1
    }

    report('coût d’acquisition', `${rate.vehicleModel} — 3 versions datées`, null, true)
  }
}

/* ========================================================================== */
/*  Utilisateurs — Module 08                                                  */
/* ========================================================================== */

/**
 * Trois comptes de démonstration, pour que la liste, l'arborescence des
 * permissions et l'organigramme aient quelque chose à montrer.
 *
 * AUCUN MOT DE PASSE N'EST CHOISI NI AFFICHÉ. Le mot de passe initial est
 * aléatoire et n'est écrit nulle part ; `must_change_password` est posé. Ces
 * comptes peuplent le module, ils n'ouvrent aucun accès (CLAUDE.md §25).
 */
const DEMO_USERS = [
  {
    key: 'responsable',
    first_name: 'Responsable',
    last_name: 'DEMO LOCATION',
    username: 'demo.location',
    job_title: 'Responsable location',
    groupCode: null,
  },
  {
    key: 'comptable',
    first_name: 'Comptable',
    last_name: 'DEMO FINANCE',
    username: 'demo.finance',
    job_title: 'Comptable',
    managerKey: 'responsable',
  },
  {
    key: 'assistante',
    first_name: 'Assistant',
    last_name: 'DEMO DIRECTION',
    username: 'demo.direction',
    job_title: 'Assistant(e) de direction',
    managerKey: 'responsable',
  },
]

async function seedUsers(admin, ids) {
  section('Utilisateurs de démonstration')

  for (const user of DEMO_USERS) {
    const email = `${user.username}@adikom-demo.test`

    const { data: existing } = await admin
      .from('app_users').select('id').eq('username', user.username).maybeSingle()

    if (existing) {
      ids.users[user.key] = existing.id
      report('utilisateur', `${user.first_name} ${user.last_name}`, user.username, false)
      continue
    }

    // Mot de passe aléatoire, jamais affiché ni conservé.
    const password = `Dm-${crypto.randomUUID()}`

    const { data: account, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) fail(`compte ${user.username}`, authError)

    const { error } = await admin.from('app_users').insert({
      id: account.user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      email,
      job_title: user.job_title,
      manager_id: user.managerKey ? ids.users[user.managerKey] : null,
      hired_on: dayOffset(-300),
      status: 'ACTIVE',
      is_super_admin: false,
      must_change_password: true,
      notes: DEMO_NOTE,
    })

    if (error) fail(`profil ${user.username}`, error)

    ids.users[user.key] = account.user.id
    report('utilisateur', `${user.first_name} ${user.last_name}`, user.username, true)
  }

  // Rattachement aux groupes et départements EXISTANTS — ce script n'en crée
  // aucun et n'en modifie aucun : l'organisation d'ADIKOM n'est pas une donnée
  // de démonstration (migration 008).
  const { data: groups } = await admin.from('groups').select('id, code').eq('is_active', true)
  const groupByCode = Object.fromEntries((groups ?? []).map((g) => [g.code, g.id]))

  const { data: departments } = await admin.from('departments').select('id, code')
  const deptByCode = Object.fromEntries((departments ?? []).map((d) => [d.code, d.id]))

  const wanted = [
    ['responsable', 'EXPLOITATION_LOCATION', 'TOURISME_MOBILITE'],
    ['comptable', 'ADMIN_FINANCE', 'ADMIN_FINANCE'],
    ['assistante', 'ASSISTANAT_DIRECTION', 'ADMIN_FINANCE'],
  ]

  for (const [key, groupCode, departmentCode] of wanted) {
    if (!ids.users[key]) continue

    if (groupByCode[groupCode]) {
      const { error } = await admin
        .from('user_groups')
        .upsert(
          { user_id: ids.users[key], group_id: groupByCode[groupCode] },
          { onConflict: 'user_id,group_id' }
        )
      if (error) fail(`rattachement au groupe de ${key}`, error)
    }

    if (deptByCode[departmentCode]) {
      const { error } = await admin
        .from('user_departments')
        .upsert(
          {
            user_id: ids.users[key],
            department_id: deptByCode[departmentCode],
            is_primary: true,
          },
          { onConflict: 'user_id,department_id' }
        )
      if (error) fail(`rattachement au département de ${key}`, error)
    }
  }
}

/* ========================================================================== */
/*  Cycle de location — Module 05                                             */
/* ========================================================================== */

/**
 * Cinq réservations et quatre locations, à des stades différents.
 *
 * Les périodes sont posées PAR RAPPORT AU JOUR D'EXÉCUTION : un jeu de
 * démonstration daté en dur finirait par présenter une location « à venir »
 * commencée l'an dernier.
 */
const RESERVATIONS = [
  {
    code: 'R1', clientName: 'CLIENT DEMO 01', vehicleModel: 'VEHICULE DEMO 01',
    from: -6, to: 2, confirm: true, convert: true, start: -6,
    conditions: 'Location en cours — départ effectué.',
  },
  {
    code: 'R2', clientName: 'CLIENT DEMO 02', vehicleModel: 'VEHICULE DEMO 02',
    from: -22, to: -15, confirm: true, convert: true, start: -22, return: -15,
    conditions: 'Location terminée et contrôlée.',
  },
  {
    code: 'R3', clientName: 'CLIENT DEMO 03', vehicleModel: 'VEHICULE DEMO 03',
    from: 6, to: 10, confirm: true,
    conditions: 'Réservation confirmée — départ à préparer.',
  },
  {
    code: 'R4', clientName: 'CLIENT DEMO 06', vehicleModel: 'VEHICULE DEMO 05',
    from: 14, to: 18, cancel: 'Annulation à la demande du client — démonstration.',
    conditions: 'Réservation annulée.',
  },
  {
    code: 'R5', clientName: 'CLIENT DEMO 04', vehicleModel: null, categoryCode: 'DEMO-04',
    from: 20, to: 24,
    conditions: 'Demande en attente d’attribution d’un véhicule.',
  },
  {
    code: 'R6', clientName: 'CLIENT DEMO 01', vehicleModel: 'VEHICULE DEMO 07',
    from: -9, to: -3, confirm: true, convert: true, start: -9,
    conditions: 'Location dont le retour est attendu — retard à signaler.',
  },
  /*
   * 🟩 LE CAS DE LA DIRECTION — A-4 et A-5, LOT 22.
   *
   * « On garde le même contrat et on rajoute des avenants. »
   *
   *   VEHICULE DEMO 02   J-40 → J-35   40 000 KMF/jour   coût 30 000 → commission 10 000
   *   panne au J-35, avenant, remplacement
   *   VEHICULE DEMO 07   J-35 → J-30   55 000 KMF/jour   véhicule de partenariat
   *
   * UN SEUL CONTRAT, DEUX PÉRIODES, UN AVENANT. Le client paie le NOUVEAU tarif
   * — le cas ordinaire de A-5 — et l'écart 40 000 → 55 000 se lit sur la
   * chronologie sans qu'on ait à le calculer.
   *
   * ET LE SECOND SEGMENT MONTRE L'HONNÊTETÉ DU SYSTÈME : le véhicule de
   * remplacement relève d'un PARTENARIAT, dont les conditions financières ne sont
   * arrêtées par aucune décision. Son coût est donc ABSENT, sa commission NON
   * CALCULÉE, et l'écran dit pourquoi. Un jeu de démonstration ne tranche pas ce
   * que la Direction n'a pas tranché — il montre la question.
   *
   * La fenêtre J-40 → J-30 est antérieure à toutes les autres : aucun des deux
   * véhicules n'y est engagé, et la contrainte d'exclusion n'a rien à refuser.
   */
  {
    code: 'R7', clientName: 'CLIENT DEMO 05', vehicleModel: 'VEHICULE DEMO 02',
    from: -40, to: -30, confirm: true, convert: true, start: -40, return: -30,
    conditions: 'Location avec remplacement de véhicule en cours de contrat.',
    swap: {
      offset: -35,
      vehicleModel: 'VEHICULE DEMO 07',
      reason: 'Panne immobilisante du véhicule initial — remplacement immédiat.',
      notes: 'Le client a été livré sur place ; aucune interruption de mise à disposition.',
    },
  },
  /*
   * 🟩 LA LONGUE DURÉE — A-6, LOT 23.
   *
   * « Chaque fin du mois, on établit une facture. »
   *
   *   VEHICULE DEMO 06   J-100 → J-30   32 000 KMF/jour, régime MENSUEL
   *
   * UN SEUL CONTRAT, PLUSIEURS PÉRIODES FACTURABLES, et une facture émise sur
   * la première. La démonstration montre donc ce que ce lot apporte :
   *
   *   · le découpage à la FIN DU MOIS COMORIEN, aux dates réelles du contrat ;
   *   · une facture par période, et une seule — les autres restent
   *     « Facturables » ;
   *   · la location qui RESTE EN COURS malgré une facture émise (Plan 02 §18.2).
   *
   * ⚠ AUCUNE QUANTITÉ N'EST INVENTÉE. La ligne de facture porte une quantité
   * SAISIE, comme à l'écran : la règle d'arrondi de durée n'est pas arrêtée
   * (DEC-008), et un jeu de démonstration ne tranche pas ce que la Direction
   * n'a pas tranché.
   *
   * La fenêtre J-100 → J-30 n'est occupée par aucun autre contrat de
   * démonstration, et `VEHICULE DEMO 06` n'est engagé nulle part ailleurs.
   */
  {
    code: 'R8', clientName: 'CLIENT DEMO 03', vehicleModel: 'VEHICULE DEMO 06',
    from: -100, to: -30, confirm: true, convert: true, start: -100,
    conditions: 'Location de longue durée — facturation mensuelle.',
    longTerm: {
      cadence: 'MONTHLY',
      invoice: {
        quantity: 17,
        label: 'Location VEHICULE DEMO 06 — première période mensuelle',
        /*
         * 17 × 32 000 = 544 000 facturés, dont 200 000 réglés : le relevé du
         * LOT 24 montre alors trois montants distincts — facturé, réglé, solde
         * de 344 000 — plutôt qu'un solde égal au facturé, qui ne démontre pas
         * la soustraction.
         */
        paid: 200_000,
      },
    },
  },
]

async function seedRentalCycle(admin, ids) {
  section('Réservations et locations')

  ids.reservations = {}
  ids.rentals = {}

  for (const item of RESERVATIONS) {
    const note = tag(item.code)

    const { data: existing } = await admin
      .from('reservations').select('id, reservation_no').eq('notes', note).maybeSingle()

    if (existing) {
      ids.reservations[item.code] = existing.id
      report('réservation', item.conditions, existing.reservation_no, false)

      const { data: rental } = await admin
        .from('rentals').select('id').eq('reservation_id', existing.id).maybeSingle()
      if (rental) ids.rentals[item.code] = rental.id

      /*
       * 🟥 LA MISE EN PLACE DE LA FACTURATION SE REJOUE SUR L'EXISTANT.
       *
       * Sans cet appel, tout ce qu'un lot ajoute après la création initiale du
       * jeu de démonstration reste hors de sa portée : la réservation existe,
       * la boucle passe, et l'ajout n'atteint jamais la base. C'est ainsi que
       * le règlement du LOT 24 manquait au contrat de longue durée.
       */
      created += await seedLongTermBilling(admin, ids, item, rental?.id ?? null)
      continue
    }

    const { data: reservation, error } = await admin
      .from('reservations')
      .insert({
        reservation_no: await nextNumber(admin, 'reservation'),
        client_id: ids.clients[item.clientName],
        vehicle_id: item.vehicleModel ? ids.vehicles[item.vehicleModel] : null,
        category_id: item.categoryCode ? ids.categories[item.categoryCode] : null,
        period: period(item.from, item.to),
        conditions: item.conditions,
        notes: note,
      })
      .select('id, reservation_no')
      .single()

    if (error) fail(`réservation ${item.code}`, error)
    ids.reservations[item.code] = reservation.id
    report('réservation', item.conditions, reservation.reservation_no, true)

    if (item.cancel) {
      await rpc(admin, 'cancel_reservation',
        { p_reservation_id: reservation.id, p_reason: item.cancel },
        `annulation ${item.code}`)
      continue
    }

    if (!item.confirm) continue

    await rpc(admin, 'confirm_reservation',
      { p_reservation_id: reservation.id, p_vehicle_id: ids.vehicles[item.vehicleModel] },
      `confirmation ${item.code}`)

    if (!item.convert) continue

    const rentalId = await rpc(admin, 'convert_reservation_to_rental',
      { p_reservation_id: reservation.id }, `conversion ${item.code}`)
    ids.rentals[item.code] = rentalId

    // Préparée → confirmée : c'est ce que fait l'écran de préparation.
    const { error: confirmError } = await admin
      .from('rentals')
      .update({ status: 'CONFIRMED', notes: note })
      .eq('id', rentalId)
      .eq('status', 'PREPARING')

    if (confirmError) fail(`préparation ${item.code}`, confirmError)

    if (item.start === undefined) continue

    await rpc(admin, 'start_rental', {
      p_rental_id: rentalId,
      p_started_at: `${dayOffset(item.start)}T08:15:00+03:00`,
      p_mileage: 20000,
      p_fuel_level: 'FULL',
      p_exterior_condition: 'Carrosserie en bon état, propreté correcte.',
      p_interior_condition: 'Habitacle propre, équipements complets.',
      p_preexisting_damages: 'Rayure légère sur le pare-chocs arrière.',
      p_observations: 'Départ de démonstration.',
    }, `départ ${item.code}`)

    /*
     * LE REMPLACEMENT DE VÉHICULE — LOT 22, A-4.
     *
     * Il passe par la FONCTION, jamais par un `insert` : elle clôt le segment
     * sortant, ouvre le segment entrant, déplace l'engagement du calendrier et
     * gèle le coût applicable — six écritures indivisibles. Un `insert` direct
     * produirait un contrat incohérent, et la base le refuserait.
     *
     * AUCUN TARIF N'EST FORCÉ : `p_amount` reste nul, donc le client paie le
     * tarif du nouveau véhicule, résolu par le barème (A-5, cas ordinaire). La
     * dérogation est un acte à part, éprouvé par la recette sur son propre décor.
     */
    if (item.swap) {
      await rpc(admin, 'replace_rental_vehicle', {
        p_rental_id: rentalId,
        p_new_vehicle_id: ids.vehicles[item.swap.vehicleModel],
        p_effective_at: `${dayOffset(item.swap.offset)}T09:30:00+03:00`,
        p_reason: item.swap.reason,
        p_amount: null,
        p_unit: null,
        p_rate_reason: null,
        p_notes: item.swap.notes ?? null,
      }, `remplacement de véhicule ${item.code}`)
      created += 1
    }

    created += await seedLongTermBilling(admin, ids, item, rentalId)

    if (item.return === undefined) continue

    await rpc(admin, 'return_rental', {
      p_rental_id: rentalId,
      p_returned_at: `${dayOffset(item.return)}T17:40:00+03:00`,
      p_mileage: 21450,
      p_fuel_level: 'THREE_QUARTERS',
      p_exterior_condition: 'Impact constaté sur la portière avant droite.',
      p_interior_condition: 'Habitacle correct.',
      p_new_damages: 'Impact portière avant droite, à expertiser.',
      p_observations: 'Retour de démonstration — contrôle effectué.',
    }, `retour ${item.code}`)
  }
}

/**
 * LE RÉGIME DE FACTURATION D'UN CONTRAT DE DÉMONSTRATION, ET SA PREMIÈRE
 * FACTURE — LOT 23, étendue au règlement du LOT 24.
 *
 * 🟥 POURQUOI CE BLOC EST UNE FONCTION, ET NON UN PASSAGE DE LA BOUCLE.
 *
 * La boucle des réservations `continue` dès que la réservation existe déjà :
 * tout ce qui la suivait ne s'exécutait donc QU'AU PREMIER PASSAGE, sur une
 * base vierge. Le découpage et la facture du LOT 23 ont été posés ce jour-là ;
 * le règlement que le LOT 24 ajoute ne les aurait JAMAIS rejoints, et le relevé
 * de démonstration serait resté sans historique de paiement — sans qu'aucune
 * erreur ne soit signalée.
 *
 * Extraite, la mise en place se rejoue à chaque passage sur les contrats
 * existants comme sur les nouveaux. Chaque geste porte sa propre garde
 * d'idempotence : le découpage à la présence de périodes, la facture et le
 * règlement à leur marqueur. Rien n'est dupliqué, et ce qui manque est ajouté.
 */
async function seedLongTermBilling(admin, ids, item, rentalId) {
  if (!item.longTerm || !rentalId) return 0

  let created = 0

  /*
   * LE RÉGIME DE FACTURATION, ET SES PÉRIODES — LOT 23, A-6.
   *
   * Il passe par la FONCTION, jamais par un `update` : elle pose le régime ET
   * ouvre le découpage contigu que la garde exige. Un `update` direct
   * laisserait un contrat annoncé « mensuel » sans aucune période — et
   * l'écran ne proposerait jamais rien.
   *
   * IDEMPOTENT : la fonction refuse un régime déjà posé (« un acte consigne un
   * changement, pas une confirmation »), et la présence de périodes suffit à
   * savoir que le travail est fait.
   */
  {
    const { count: dejaDecoupe } = await admin
      .from('rental_billing_periods')
      .select('id', { count: 'exact', head: true })
      .eq('rental_id', rentalId)

    if (!dejaDecoupe) {
      await rpc(admin, 'set_rental_billing_plan', {
        p_rental_id: rentalId,
        p_type: 'LONG_TERM',
        p_cadence: item.longTerm.cadence,
      }, `régime de facturation ${item.code}`)
      created += 1
    }

    if (item.longTerm.invoice) {
      const note = tag(`${item.code}-FAC1`)

      const { data: dejaFacturee } = await admin
        .from('customer_invoices')
        .select('id')
        .eq('notes', note)
        .maybeSingle()

      if (!dejaFacturee) {
        /*
         * LA PREMIÈRE PÉRIODE ÉCHUE, et elle seule : on ne facture pas un
         * temps qui n'a pas couru (A-6, « chaque FIN du mois »).
         */
        const { data: periodes } = await admin
          .from('rental_billing_periods')
          .select('id, period')
          .eq('rental_id', rentalId)
          .eq('status', 'PLANNED')
          .order('sequence_no')

        const premiere = (periodes ?? [])[0]

        if (premiere) {
          const invoiceId = await rpc(admin, 'create_customer_invoice', {
            p_client_id: ids.clients[item.clientName],
            p_invoice_date: dayOffset(-64),
            p_due_date: dayOffset(-34),
            p_rental_id: rentalId,
            p_notes: note,
            p_billing_period_id: premiere.id,
          }, `facture de période ${item.code}`)

          await rpc(admin, 'add_customer_invoice_line', {
            p_invoice_id: invoiceId,
            p_kind: 'RENTAL',
            p_label: item.longTerm.invoice.label,
            p_quantity: item.longTerm.invoice.quantity,
            p_unit_price: 32000,
            p_justification: null,
          }, `ligne de la facture de période ${item.code}`)

          await rpc(admin, 'issue_customer_invoice', {
            p_invoice_id: invoiceId,
            p_reason: 'Facture mensuelle de démonstration.',
          }, `émission de la facture de période ${item.code}`)

          created += 1
        }
      }

      /*
       * UN RÈGLEMENT PARTIEL — LOT 24, ce que le relevé sert à montrer.
       *
       * 🟩 A-6 : « avec les détails et les historiques de payement ». Sans un
       * seul règlement, le relevé de démonstration affichait un historique
       * VIDE — et c'est précisément le chapitre pour lequel la Direction a
       * demandé ce document. Le solde y valait le facturé, ce qui ne
       * démontrait rien de la soustraction.
       *
       * PARTIEL à dessein : facturé ≠ réglé ≠ solde, les trois montants de la
       * synthèse se lisent alors distinctement. Une facture soldée les aurait
       * ramenés à deux.
       *
       * 🟥 SON IDEMPOTENCE EST LA SIENNE, et non celle de la facture.
       *
       * Placé dans la branche « la facture vient d'être créée », ce règlement
       * n'aurait jamais atteint le jeu de démonstration DÉJÀ EN PLACE : la
       * facture existe depuis le LOT 23, et cette branche ne s'exécute plus.
       * Il se garde donc à son propre marqueur, et s'ajoute au passage suivant
       * sans rien dupliquer.
       */
      const noteReglement = tag(`${item.code}-REG1`)

      const { data: facture } = await admin
        .from('customer_invoices')
        .select('id, status')
        .eq('notes', note)
        .maybeSingle()

      if (facture?.status === 'ISSUED' && !(await findByNotes(admin, 'customer_payments', noteReglement))) {
        await rpc(admin, 'record_customer_payment', {
          p_invoice_id: facture.id,
          p_account_id: ids.accounts.C1,
          p_amount: item.longTerm.invoice.paid,
          p_received_on: dayOffset(-40),
          p_method: 'BANK_TRANSFER',
          p_external_ref: 'DEMO-ENC-LT01',
          p_notes: noteReglement,
        }, `règlement partiel de la facture de période ${item.code}`)
        created += 1
      }
    }
  }

  return created
}

/* ========================================================================== */
/*  Incidents et maintenance — Module 05                                      */
/* ========================================================================== */

async function seedMaintenance(admin, ids) {
  section('Incidents et maintenance')

  ids.incidents = {}
  ids.maintenances = {}

  /* --- Incident constaté au retour de la location R2 ----------------------- */
  const i1 = await ensureByDescription(admin, 'vehicle_incidents', tag('I1'), async () =>
    rpc(admin, 'create_incident', {
      p_vehicle_id: ids.vehicles['VEHICULE DEMO 02'],
      p_kind: 'ACCIDENT',
      p_description: tag('I1'),
      p_occurred_at: instantOffset(-24 * 15),
      p_rental_id: ids.rentals.R2 ?? null,
      p_inspection_id: null,
      p_damages: [
        {
          location: 'Portière avant droite',
          description: 'Impact et enfoncement de la tôle.',
          severity: 'MODERATE',
          responsibility: 'CLIENT',
        },
        {
          location: 'Rétroviseur droit',
          description: 'Coque fissurée.',
          severity: 'MINOR',
          responsibility: 'CLIENT',
        },
      ],
    }, 'incident I1'), 'Impact au retour — véhicule 02')
  ids.incidents.I1 = i1

  /* --- Panne signalée sur un autre véhicule -------------------------------- */
  ids.incidents.I2 = await ensureByDescription(admin, 'vehicle_incidents', tag('I2'), async () =>
    rpc(admin, 'create_incident', {
      p_vehicle_id: ids.vehicles['VEHICULE DEMO 04'],
      p_kind: 'BREAKDOWN',
      p_description: tag('I2'),
      p_occurred_at: instantOffset(-24 * 4),
      p_rental_id: null,
      p_inspection_id: null,
      p_damages: null,
    }, 'incident I2'), 'Panne signalée — véhicule 04')

  /* --- Maintenance terminée, chiffrée, imputable --------------------------- */
  const m1New = !(await exists(admin, 'vehicle_maintenances', { reason: tag('M1') }))
  ids.maintenances.M1 = m1New
    ? await rpc(admin, 'create_maintenance', {
        p_vehicle_id: ids.vehicles['VEHICULE DEMO 02'],
        p_origin: 'INCIDENT',
        p_reason: tag('M1'),
        p_priority: 'HIGH',
        p_description: 'Remise en état de la portière et du rétroviseur.',
        p_incident_id: ids.incidents.I1,
        p_rental_id: null,
        p_previous_maintenance_id: null,
        p_provider_supplier_id: ids.suppliers['FOURNISSEUR DEMO 02'],
        p_planned_at: instantOffset(-24 * 13),
        p_immobilization_from: instantOffset(-24 * 13),
        p_immobilization_to: instantOffset(-24 * 11),
      }, 'maintenance M1')
    : (await admin.from('vehicle_maintenances').select('id').eq('reason', tag('M1')).single()).data.id

  report('maintenance', 'Réparation portière — véhicule 02', null, m1New)

  /*
   * Le scénario se REPREND là où il s'est arrêté.
   *
   * Un seed interrompu laisse une maintenance en brouillon. Reprendre à
   * l'identique la recréerait — ou, pire, la laisserait inachevée pour
   * toujours. L'état courant décide donc de ce qui reste à faire.
   */
  const m1Status = await statusOf(admin, 'vehicle_maintenances', ids.maintenances.M1)

  if (m1Status !== 'COMPLETED') {
    // Brouillon → Planifiée → En cours : les transitions de `Workflow 05` §17,
    // dans l'ordre. Le seed ne court-circuite aucune étape.
    await advanceMaintenance(admin, ids.maintenances.M1, 'IN_PROGRESS')

    const quote = await rpc(admin, 'add_maintenance_quote', {
      p_maintenance_id: ids.maintenances.M1,
      p_amount: 320_000,
      p_provider_supplier_id: ids.suppliers['FOURNISSEUR DEMO 02'],
      p_quoted_on: dayOffset(-14),
      p_description: 'Devis de démonstration — tôlerie et peinture.',
    }, 'devis M1')

    await rpc(admin, 'decide_maintenance_quote',
      { p_quote_id: quote, p_accept: true, p_reason: 'Devis retenu — démonstration.' },
      'décision devis M1')

    await rpc(admin, 'record_maintenance_costs', {
      p_maintenance_id: ids.maintenances.M1,
      p_estimated_cost: 320_000,
      p_actual_cost: 300_000,
      p_imputable_amount: 300_000,
      p_notes: 'Coût réel inférieur au devis. Montant imputable au fournisseur du véhicule.',
    }, 'coûts M1')

    await rpc(admin, 'complete_maintenance', {
      p_maintenance_id: ids.maintenances.M1,
      p_completed_at: instantOffset(-24 * 11),
      p_intervention: 'Redressage, peinture, remplacement de la coque de rétroviseur.',
      p_observations: 'Véhicule remis en service.',
    }, 'clôture M1')
  }

  /* --- Maintenance préventive en cours ------------------------------------- */
  const m2New = !(await exists(admin, 'vehicle_maintenances', { reason: tag('M2') }))
  if (m2New) {
    ids.maintenances.M2 = await rpc(admin, 'create_maintenance', {
      p_vehicle_id: ids.vehicles['VEHICULE DEMO 04'],
      p_origin: 'BREAKDOWN',
      p_reason: tag('M2'),
      p_priority: 'URGENT',
      p_description: 'Diagnostic du démarreur à la suite de la panne signalée.',
      p_incident_id: ids.incidents.I2,
      p_rental_id: null,
      p_previous_maintenance_id: null,
      p_provider_supplier_id: ids.suppliers['FOURNISSEUR DEMO 02'],
      p_planned_at: instantOffset(24),
      p_immobilization_from: instantOffset(-24 * 2),
      p_immobilization_to: instantOffset(24 * 3),
    }, 'maintenance M2')
  } else {
    ids.maintenances.M2 = await findBy(admin, 'vehicle_maintenances', 'reason', tag('M2'))
  }

  if (await statusOf(admin, 'vehicle_maintenances', ids.maintenances.M2) !== 'IN_PROGRESS') {
    await advanceMaintenance(admin, ids.maintenances.M2, 'IN_PROGRESS')
  }
  report('maintenance', 'Diagnostic démarreur — véhicule 04', null, m2New)
}

/** État courant d'une ligne — ce qui reste à faire s'en déduit. */
async function statusOf(admin, table, id) {
  if (!id) return null
  const { data } = await admin.from(table).select('status').eq('id', id).maybeSingle()
  return data?.status ?? null
}

/**
 * Fait avancer une maintenance jusqu'à l'état visé, une transition à la fois.
 *
 * `fn_maintenance_status_transition` n'accepte que les enchaînements de
 * `Workflow 05` §17 : Brouillon → Planifiée → En cours. Sauter une étape est
 * refusé par la base, et c'est bien ainsi — le seed suit le chemin réel plutôt
 * que d'écrire l'état d'arrivée.
 */
const MAINTENANCE_PATH = ['DRAFT', 'PLANNED', 'IN_PROGRESS']

async function advanceMaintenance(admin, maintenanceId, target) {
  const reasons = {
    PLANNED: 'Intervention engagée auprès du prestataire — démonstration.',
    IN_PROGRESS: 'Prise en charge par l’atelier — démonstration.',
  }

  let current = await statusOf(admin, 'vehicle_maintenances', maintenanceId)
  const goal = MAINTENANCE_PATH.indexOf(target)

  while (MAINTENANCE_PATH.indexOf(current) < goal) {
    const next = MAINTENANCE_PATH[MAINTENANCE_PATH.indexOf(current) + 1]

    const { error } = await admin
      .from('vehicle_maintenances')
      .update({
        status: next,
        status_reason: reasons[next],
        status_changed_at: new Date().toISOString(),
      })
      .eq('id', maintenanceId)

    if (error) fail(`état de la maintenance (${next})`, error)
    current = next
  }
}

/** Retrouve ou crée un objet dont la description porte l'étiquette DEMO. */
async function ensureByDescription(admin, table, description, create, label) {
  const { data: existing } = await admin
    .from(table).select('id').eq('description', description).maybeSingle()

  if (existing) {
    report('incident', label, null, false)
    return existing.id
  }

  const id = await create()
  report('incident', label, null, true)
  return id
}

/* ========================================================================== */
/*  Facturation fournisseur et imputations — Modules 06 et 07                 */
/* ========================================================================== */

async function seedSupplierBilling(admin, ids) {
  section('Factures fournisseurs et imputations')

  ids.supplierInvoices = {}

  /*
   * LE SCÉNARIO CENTRAL DU SAAS (CLAUDE.md §15, §16).
   *
   * Le fournisseur met un véhicule à disposition pour 500 000 KMF. Le véhicule
   * tombe en panne, ADIKOM répare pour 300 000 KMF et impute ce montant sur la
   * facture. Net à payer : 200 000 KMF — dont 120 000 déjà réglés.
   *
   * L'IMPUTATION N'EST PAS UN PAIEMENT : la facture porte les deux séparément.
   */
  const f1Note = tag('FF1')
  let f1 = await findByNotes(admin, 'supplier_invoices', f1Note)

  if (!f1) {
    f1 = await rpc(admin, 'create_supplier_invoice', {
      p_supplier_id: ids.suppliers['FOURNISSEUR DEMO 01'],
      p_invoice_date: dayOffset(-12),
      p_due_date: dayOffset(18),
      p_external_ref: 'DEMO-F-2026-001',
      p_notes: f1Note,
    }, 'facture fournisseur FF1')

    await rpc(admin, 'add_supplier_invoice_line', {
      p_invoice_id: f1,
      p_label: 'Mise à disposition VEHICULE DEMO 02 — période de démonstration',
      p_amount: 500_000,
      p_vehicle_id: ids.vehicles['VEHICULE DEMO 02'],
    }, 'ligne FF1')

    await rpc(admin, 'submit_supplier_invoice', { p_invoice_id: f1 }, 'soumission FF1')
    await rpc(admin, 'validate_supplier_invoice',
      { p_invoice_id: f1, p_reason: 'Facture contrôlée — démonstration.' }, 'validation FF1')
    report('facture fnr', 'Mise à disposition — 500 000 KMF', null, true)
  } else {
    report('facture fnr', 'Mise à disposition — 500 000 KMF', null, false)
  }
  ids.supplierInvoices.FF1 = f1

  /* --- L'imputation de la maintenance sur cette facture -------------------- */
  const impNote = tag('IMP1')
  const existingImputation = await findBy(admin, 'imputations', 'justification', impNote)

  if (!existingImputation && ids.maintenances.M1) {
    const imputation = await rpc(admin, 'create_imputation', {
      p_maintenance_id: ids.maintenances.M1,
      p_supplier_id: ids.suppliers['FOURNISSEUR DEMO 01'],
      p_amount: 300_000,
      p_justification: impNote,
    }, 'imputation IMP1')

    await rpc(admin, 'submit_imputation', { p_imputation_id: imputation }, 'soumission IMP1')
    await rpc(admin, 'validate_imputation',
      { p_imputation_id: imputation, p_reason: 'Imputation validée — démonstration.' },
      'validation IMP1')
    await rpc(admin, 'attach_imputation_to_invoice',
      { p_imputation_id: imputation, p_invoice_id: f1 }, 'rattachement IMP1')
    report('imputation', 'Maintenance imputée — 300 000 KMF', null, true)
  } else {
    report('imputation', 'Maintenance imputée — 300 000 KMF', null, false)
  }

  /* --- Un règlement partiel du net à payer --------------------------------- */
  const payNote = tag('RF1')
  if (!(await findByNotes(admin, 'supplier_payments', payNote))) {
    await rpc(admin, 'record_supplier_payment', {
      p_invoice_id: f1,
      p_account_id: ids.accounts.C1,
      p_amount: 120_000,
      p_paid_on: dayOffset(-5),
      p_method: 'BANK_TRANSFER',
      p_external_ref: 'DEMO-VIR-0001',
      p_notes: payNote,
    }, 'règlement RF1')
    report('règlement fnr', 'Acompte — 120 000 KMF', null, true)
  } else {
    report('règlement fnr', 'Acompte — 120 000 KMF', null, false)
  }

  /* --- Une facture en brouillon, et une soldée ----------------------------- */
  const f2Note = tag('FF2')
  if (!(await findByNotes(admin, 'supplier_invoices', f2Note))) {
    const f2 = await rpc(admin, 'create_supplier_invoice', {
      p_supplier_id: ids.suppliers['FOURNISSEUR DEMO 03'],
      p_invoice_date: dayOffset(-2),
      p_due_date: dayOffset(28),
      p_external_ref: 'DEMO-F-2026-002',
      p_notes: f2Note,
    }, 'facture fournisseur FF2')

    await rpc(admin, 'add_supplier_invoice_line', {
      p_invoice_id: f2,
      p_label: 'Prestation de nettoyage du parc — démonstration',
      p_amount: 85_000,
      p_vehicle_id: null,
    }, 'ligne FF2')
    report('facture fnr', 'Prestation — brouillon', null, true)
  } else {
    report('facture fnr', 'Prestation — brouillon', null, false)
  }

  const f3Note = tag('FF3')
  if (!(await findByNotes(admin, 'supplier_invoices', f3Note))) {
    const f3 = await rpc(admin, 'create_supplier_invoice', {
      p_supplier_id: ids.suppliers['FOURNISSEUR DEMO 04'],
      p_invoice_date: dayOffset(-45),
      p_due_date: dayOffset(-15),
      p_external_ref: 'DEMO-F-2026-003',
      p_notes: f3Note,
    }, 'facture fournisseur FF3')

    await rpc(admin, 'add_supplier_invoice_line', {
      p_invoice_id: f3, p_label: 'Pièces détachées — démonstration',
      p_amount: 240_000, p_vehicle_id: null,
    }, 'ligne FF3')

    await rpc(admin, 'submit_supplier_invoice', { p_invoice_id: f3 }, 'soumission FF3')
    await rpc(admin, 'validate_supplier_invoice',
      { p_invoice_id: f3, p_reason: 'Facture contrôlée — démonstration.' }, 'validation FF3')
    await rpc(admin, 'record_supplier_payment', {
      p_invoice_id: f3,
      p_account_id: ids.accounts.C1,
      p_amount: 240_000,
      p_paid_on: dayOffset(-14),
      p_method: 'BANK_TRANSFER',
      p_external_ref: 'DEMO-VIR-0002',
      p_notes: tag('RF2'),
    }, 'règlement RF2')
    report('facture fnr', 'Pièces détachées — soldée', null, true)
  } else {
    report('facture fnr', 'Pièces détachées — soldée', null, false)
  }
}

/**
 * Fait avancer une location jusqu'à l'état visé, une transition à la fois.
 *
 * `fn_rental_status_transition` impose l'enchaînement de DEC-006 :
 * Retournée → À contrôler → À facturer → Facturée → Clôturée. Chaque pas est
 * un acte de l'exploitation, et le seed les pose dans l'ordre.
 */
const RENTAL_PATH = [
  'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'RETURNED', 'TO_CONTROL', 'TO_INVOICE',
]

async function advanceRental(admin, rentalId, target) {
  const reasons = {
    TO_CONTROL: 'Retour enregistré — contrôle à effectuer.',
    TO_INVOICE: 'Contrôle de retour satisfaisant — dossier à facturer.',
  }

  let current = await statusOf(admin, 'rentals', rentalId)
  const goal = RENTAL_PATH.indexOf(target)

  while (RENTAL_PATH.indexOf(current) >= 0 && RENTAL_PATH.indexOf(current) < goal) {
    const next = RENTAL_PATH[RENTAL_PATH.indexOf(current) + 1]

    const { error } = await admin
      .from('rentals')
      .update({
        status: next,
        status_reason: reasons[next] ?? null,
        status_changed_at: new Date().toISOString(),
      })
      .eq('id', rentalId)

    if (error) fail(`état de la location (${next})`, error)
    current = next
  }
}

/**
 * La LIGNE entière, et non son seul identifiant.
 *
 * `findBy` et `findByNotes` ne rendent que l'`id` : suffisant pour rattacher un
 * enfant, insuffisant pour REPRENDRE un cycle là où il s'est arrêté — il faut
 * alors lire le statut. Deux helpers plutôt qu'un changement de signature : les
 * appelants existants n'ont pas à être relus.
 */
async function rowBy(admin, table, column, value) {
  const { data } = await admin.from(table).select('*').eq(column, value).maybeSingle()
  return data ?? null
}

async function rowByNotes(admin, table, note) {
  return rowBy(admin, table, 'notes', note)
}

async function findByNotes(admin, table, note) {
  const { data } = await admin.from(table).select('id').eq('notes', note).maybeSingle()
  return data?.id ?? null
}

async function findBy(admin, table, column, value) {
  const { data } = await admin.from(table).select('id').eq(column, value).maybeSingle()
  return data?.id ?? null
}

/* ========================================================================== */
/*  Facturation client — Module 07                                            */
/* ========================================================================== */

async function seedCustomerBilling(admin, ids) {
  section('Factures clients et règlements')

  /* --- Facture émise et soldée, issue de la location terminée -------------- */
  const c1Note = tag('FC1')
  if (!(await findByNotes(admin, 'customer_invoices', c1Note))) {
    /*
     * Le contrôle de retour précède la facturation.
     *
     * `Workflow 07` §5 : seule une location « À facturer » se facture. Le
     * retour l'a laissée « À contrôler » ; le contrôle la fait passer à « À
     * facturer ». Le seed opère cette étape comme l'écran de contrôle le fait.
     */
    if (ids.rentals.R2) {
      await advanceRental(admin, ids.rentals.R2, 'TO_INVOICE')
    }

    const c1 = await rpc(admin, 'create_customer_invoice', {
      p_client_id: ids.clients['CLIENT DEMO 02'],
      p_invoice_date: dayOffset(-14),
      p_due_date: dayOffset(16),
      p_rental_id: ids.rentals.R2 ?? null,
      p_notes: c1Note,
    }, 'facture client FC1')

    await rpc(admin, 'add_customer_invoice_line', {
      p_invoice_id: c1, p_kind: 'RENTAL',
      p_label: 'Location VEHICULE DEMO 02 — 7 jours',
      p_quantity: 7, p_unit_price: 34_000, p_justification: 'Tarif négocié client.',
    }, 'ligne FC1 location')

    await rpc(admin, 'add_customer_invoice_line', {
      p_invoice_id: c1, p_kind: 'FEE',
      p_label: 'Frais de dossier', p_quantity: 1, p_unit_price: 15_000,
      p_justification: null,
    }, 'ligne FC1 frais')

    await rpc(admin, 'issue_customer_invoice',
      { p_invoice_id: c1, p_reason: 'Émission de démonstration.' }, 'émission FC1')

    await rpc(admin, 'record_customer_payment', {
      p_invoice_id: c1, p_account_id: ids.accounts.C1, p_amount: 253_000,
      p_received_on: dayOffset(-9), p_method: 'BANK_TRANSFER',
      p_external_ref: 'DEMO-ENC-0001', p_notes: tag('RC1'),
    }, 'règlement RC1')

    // La location facturée se clôture : le cycle se referme (Module 05).
    if (ids.rentals.R2) {
      await rpc(admin, 'close_rental',
        { p_rental_id: ids.rentals.R2, p_reason: 'Dossier soldé — démonstration.' },
        'clôture R2')
    }
    report('facture client', 'Location soldée — 253 000 KMF', null, true)
  } else {
    report('facture client', 'Location soldée — 253 000 KMF', null, false)
  }

  /* --- Facture émise, partiellement réglée --------------------------------- */
  const c2Note = tag('FC2')
  if (!(await findByNotes(admin, 'customer_invoices', c2Note))) {
    const c2 = await rpc(admin, 'create_customer_invoice', {
      p_client_id: ids.clients['CLIENT DEMO 01'],
      p_invoice_date: dayOffset(-8),
      p_due_date: dayOffset(22),
      p_rental_id: null,
      p_notes: c2Note,
    }, 'facture client FC2')

    await rpc(admin, 'add_customer_invoice_line', {
      p_invoice_id: c2, p_kind: 'RENTAL',
      p_label: 'Location VEHICULE DEMO 01 — 8 jours',
      p_quantity: 8, p_unit_price: 25_000, p_justification: null,
    }, 'ligne FC2')

    await rpc(admin, 'add_customer_invoice_line', {
      p_invoice_id: c2, p_kind: 'DISCOUNT',
      p_label: 'Remise convention annuelle (15 %)',
      p_quantity: 1, p_unit_price: 30_000,
      p_justification: 'Tarif préférentiel client.',
    }, 'ligne FC2 remise')

    await rpc(admin, 'issue_customer_invoice',
      { p_invoice_id: c2, p_reason: 'Émission de démonstration.' }, 'émission FC2')

    await rpc(admin, 'record_customer_payment', {
      p_invoice_id: c2, p_account_id: ids.accounts.C3, p_amount: 100_000,
      p_received_on: dayOffset(-3), p_method: 'CASH',
      p_external_ref: null, p_notes: tag('RC2'),
    }, 'règlement RC2')
    report('facture client', 'Partiellement réglée — 170 000 KMF', null, true)
  } else {
    report('facture client', 'Partiellement réglée — 170 000 KMF', null, false)
  }

  /* --- Facture échue, non réglée ------------------------------------------- */
  const c3Note = tag('FC3')
  if (!(await findByNotes(admin, 'customer_invoices', c3Note))) {
    const c3 = await rpc(admin, 'create_customer_invoice', {
      p_client_id: ids.clients['CLIENT DEMO 06'],
      p_invoice_date: dayOffset(-50),
      p_due_date: dayOffset(-20),
      p_rental_id: null,
      p_notes: c3Note,
    }, 'facture client FC3')

    await rpc(admin, 'add_customer_invoice_line', {
      p_invoice_id: c3, p_kind: 'RENTAL',
      p_label: 'Location VEHICULE DEMO 03 — 5 jours',
      p_quantity: 5, p_unit_price: 32_000, p_justification: null,
    }, 'ligne FC3')

    await rpc(admin, 'issue_customer_invoice',
      { p_invoice_id: c3, p_reason: 'Émission de démonstration.' }, 'émission FC3')
    report('facture client', 'Échue et impayée — 160 000 KMF', null, true)
  } else {
    report('facture client', 'Échue et impayée — 160 000 KMF', null, false)
  }

  /* --- Facture en préparation ---------------------------------------------- */
  const c4Note = tag('FC4')
  if (!(await findByNotes(admin, 'customer_invoices', c4Note))) {
    const c4 = await rpc(admin, 'create_customer_invoice', {
      p_client_id: ids.clients['CLIENT DEMO 03'],
      p_invoice_date: dayOffset(0),
      p_due_date: dayOffset(30),
      p_rental_id: null,
      p_notes: c4Note,
    }, 'facture client FC4')

    await rpc(admin, 'add_customer_invoice_line', {
      p_invoice_id: c4, p_kind: 'SERVICE',
      p_label: 'Mise à disposition avec chauffeur — journée',
      p_quantity: 2, p_unit_price: 55_000, p_justification: null,
    }, 'ligne FC4')
    report('facture client', 'Brouillon — 110 000 KMF', null, true)
  } else {
    report('facture client', 'Brouillon — 110 000 KMF', null, false)
  }
}

/* ========================================================================== */
/*  Virements internes et paiements divers — Modules 06 et 07                 */
/* ========================================================================== */

async function seedTreasuryOperations(admin, ids) {
  section('Virements internes et paiements divers')

  const transfers = [
    {
      code: 'V1', from: 'C1', to: 'C3', amount: 250_000, dayOffset: -7,
      purpose: 'Approvisionnement de la caisse de Moroni.', validate: true,
    },
    {
      code: 'V2', from: 'C1', to: 'C2', amount: 1_000_000, dayOffset: 0,
      purpose: 'Mise en réserve — en attente de validation.', validate: false,
    },
  ]

  for (const item of transfers) {
    const note = tag(item.code)
    if (await findByNotes(admin, 'internal_transfers', note)) {
      report('virement', item.purpose, null, false)
      continue
    }

    const id = await rpc(admin, 'create_internal_transfer', {
      p_source_account_id: ids.accounts[item.from],
      p_destination_account_id: ids.accounts[item.to],
      p_amount: item.amount,
      p_transfer_date: dayOffset(item.dayOffset),
      p_purpose: item.purpose,
      p_reference: `DEMO-${item.code}`,
      p_notes: note,
    }, `virement ${item.code}`)

    if (item.validate) {
      await rpc(admin, 'validate_internal_transfer', { p_transfer_id: id }, `validation ${item.code}`)
    }
    report('virement', item.purpose, null, true)
  }

  /*
   * Les paiements divers de la démonstration — dans LES DEUX SENS.
   *
   * DEC-042 §b a ouvert l'encaissement divers. Les trois décaissements d'origine
   * restent inchangés : leur sens est explicite plutôt que deviné, et un
   * quatrième montre ce que la nouveauté permet — un remboursement reçu, qui
   * AUGMENTE le solde du compte.
   */
  const payments = [
    {
      code: 'P1', account: 'C3', amount: 45_000, dayOffset: -6, direction: 'OUT',
      category: 'SMALL_EXPENSE',
      beneficiary: 'Fournitures de bureau DEMO', purpose: 'Achat de consommables pour l’agence.',
      validate: true,
    },
    {
      code: 'P2', account: 'C1', amount: 180_000, dayOffset: -2, direction: 'OUT',
      category: 'ADMIN_FEE',
      beneficiary: 'Administration DEMO', purpose: 'Frais administratifs annuels.',
      validate: true,
    },
    {
      code: 'P3', account: 'C1', amount: 95_000, dayOffset: 0, direction: 'OUT',
      category: 'ONE_OFF_SERVICE',
      beneficiary: 'Prestataire DEMO', purpose: 'Intervention ponctuelle — en attente de validation.',
      validate: false,
    },
    {
      code: 'P4', account: 'C1', amount: 120_000, dayOffset: -1, direction: 'IN',
      category: 'OTHER',
      beneficiary: 'Assureur DEMO',
      purpose: 'Remboursement de franchise après sinistre — encaissement divers.',
      validate: true,
    },
  ]

  for (const item of payments) {
    const note = tag(item.code)
    if (await findByNotes(admin, 'misc_payments', note)) {
      report('paiement divers', item.purpose, null, false)
      continue
    }

    const id = await rpc(admin, 'create_misc_payment', {
      p_account_id: ids.accounts[item.account],
      p_amount: item.amount,
      p_paid_on: dayOffset(item.dayOffset),
      p_direction: item.direction,
      p_category: item.category,
      p_beneficiary: item.beneficiary,
      p_purpose: item.purpose,
      p_external_ref: `DEMO-${item.code}`,
      p_notes: note,
    }, `paiement ${item.code}`)

    if (item.validate) {
      await rpc(admin, 'validate_misc_payment', { p_payment_id: id }, `validation ${item.code}`)
    }
    report('paiement divers', item.purpose, null, true)
  }
}

/* ========================================================================== */
/*  Projets et planification — Module 03                                      */
/* ========================================================================== */

const PROJECTS = [
  {
    name: 'PROJET DEMO — Renouvellement du parc',
    objective: 'Remplacer les véhicules les plus anciens et sécuriser la disponibilité.',
    status: 'ACTIVE', priority: 'HIGH', from: -60, to: 90,
    ownerKey: 'responsable',
    tasks: [
      { title: 'Inventaire des véhicules à remplacer', status: 'DONE', priority: 'HIGH', due: -30, assignee: 'responsable' },
      { title: 'Consultation des fournisseurs', status: 'IN_PROGRESS', priority: 'HIGH', due: 7, assignee: 'responsable' },
      { title: 'Étude de financement', status: 'WAITING', priority: 'NORMAL', due: 21, assignee: 'comptable' },
      { title: 'Plan de retrait des véhicules sortants', status: 'TODO', priority: 'NORMAL', due: 45, assignee: null },
    ],
  },
  {
    name: 'PROJET DEMO — Ouverture agence Mutsamudu',
    objective: 'Ouvrir un point d’exploitation à Mutsamudu.',
    status: 'UPCOMING', priority: 'NORMAL', from: 15, to: 150,
    ownerKey: 'assistante',
    tasks: [
      { title: 'Recherche de local', status: 'TODO', priority: 'HIGH', due: 30, assignee: 'assistante' },
      { title: 'Dossier administratif d’ouverture', status: 'TODO', priority: 'NORMAL', due: 60, assignee: null },
    ],
  },
  {
    name: 'PROJET DEMO — Refonte du suivi financier',
    objective: 'Fiabiliser le rapprochement des règlements et des écritures.',
    status: 'DONE', priority: 'NORMAL', from: -180, to: -20,
    ownerKey: 'comptable',
    tasks: [
      { title: 'Cartographie des flux existants', status: 'DONE', priority: 'NORMAL', due: -120, assignee: 'comptable' },
      { title: 'Mise en place du suivi mensuel', status: 'DONE', priority: 'NORMAL', due: -40, assignee: 'comptable' },
    ],
  },
]

/* ========================================================================== */
/*  Commerce client — LOT 25, DEC-049                                          */
/* ========================================================================== */

/**
 * La chaîne commerciale, jouée de bout en bout.
 *
 *     DEVIS (2 lignes catalogue + 1 ligne libre)
 *        └─ émis ─ accepté ─▶ COMMANDE ─ confirmée ─▶ FACTURE CLIENT émise
 *
 * CE QU'ELLE MONTRE, ET QUI NE SE VOIT NULLE PART AILLEURS :
 *
 *   · 🟩 A-13 — une ligne LIBRE coexiste avec des lignes de catalogue ;
 *   · le PRIX FIGÉ — le catalogue de démonstration porte une révision À VENIR
 *     (60 000 aujourd'hui, 65 000 dans trente jours). Le devis gardera 60 000
 *     le jour où elle prendra effet : c'est la démonstration du lot, et elle
 *     se vérifiera d'elle-même avec le temps ;
 *   · le DEVIS CONSERVÉ après conversion, avec sa propre référence ;
 *   · la FACTURE née de la commande, ORDINAIRE : même numérotation, même
 *     émission, même place dans le pilotage.
 *
 * ⚠ AUCUN `continue` NE PRÉCÈDE UNE ÉTAPE ULTÉRIEURE.
 *
 * Défaut relevé au LOT 24 : un `continue` posé pour sauter la création d'un
 * objet déjà présent sautait aussi tout ce qui venait après, et un ajout d'un
 * lot suivant n'atteignait jamais un jeu DEMO déjà en place. Ici, chaque étape
 * RETROUVE son objet et poursuit — un second passage complète ce que le premier
 * n'avait pas fait.
 */
async function seedCommerce(admin, ids) {
  section('Commerce client')

  const clientId = ids.clients['CLIENT DEMO 01']
  if (!clientId) {
    console.log(`  ${DIM}Aucun client de démonstration : le commerce client est ignoré.${RESET}`)
    return
  }

  /* --- Les deux variantes vendables du catalogue de démonstration ---------- */
  const variantIds = {}
  for (const [key, label] of [
    ['standard', 'Standard'],
    ['premium', 'Premium'],
  ]) {
    const { data } = await admin
      .from('service_variants')
      .select('id')
      .eq('service_id', ids.services.transfert)
      .eq('label', label)
      .maybeSingle()
    variantIds[key] = data?.id ?? null
  }

  if (!variantIds.standard) {
    console.log(
      `  ${DIM}Catalogue de démonstration incomplet : le commerce client est ignoré.${RESET}`
    )
    return
  }

  /* --- LE DEVIS ------------------------------------------------------------ */
  const quoteNote = tag('DEV1')
  let quote = await rowByNotes(admin, 'sales_quotes', quoteNote)
  let quoteId = quote?.id ?? null

  if (!quoteId) {
    quoteId = await rpc(
      admin,
      'create_sales_quote',
      {
        p_client_id: clientId,
        p_quote_date: dayOffset(-10),
        p_valid_until: dayOffset(20),
        p_notes: quoteNote,
        p_terms: 'Prestation réglable à réception de la facture.',
      },
      'devis de démonstration'
    )

    // Deux lignes de CATALOGUE — le prix est résolu à la date du devis.
    await rpc(
      admin,
      'add_sales_quote_line',
      {
        p_quote_id: quoteId,
        p_quantity: 4,
        p_variant_id: variantIds.standard,
        p_label: null,
        p_unit_price: null,
      },
      'ligne catalogue (standard)'
    )

    if (variantIds.premium) {
      await rpc(
        admin,
        'add_sales_quote_line',
        {
          p_quote_id: quoteId,
          p_quantity: 1,
          p_variant_id: variantIds.premium,
          p_label: null,
          p_unit_price: null,
        },
        'ligne catalogue (premium)'
      )
    }

    // 🟩 A-13 — UNE LIGNE LIBRE, sans aucun service au catalogue.
    await rpc(
      admin,
      'add_sales_quote_line',
      {
        p_quote_id: quoteId,
        p_quantity: 2,
        p_variant_id: null,
        p_label: 'Accompagnement bagages — prestation hors catalogue',
        p_unit_price: 7500,
      },
      'ligne libre (A-13)'
    )

    report('devis', 'Devis de démonstration', null, true)
  } else {
    report('devis', 'Devis de démonstration', quote.quote_no, false)
  }

  /* --- SON CYCLE — chaque étape se reprend là où elle en est ---------------- */
  quote = await rowBy(admin, 'sales_quotes', 'id', quoteId)

  if (quote?.status === 'DRAFT') {
    await rpc(
      admin,
      'set_sales_quote_status',
      { p_quote_id: quoteId, p_status: 'SENT', p_reason: 'Remis au client' },
      'émission du devis'
    )
    quote = await rowBy(admin, 'sales_quotes', 'id', quoteId)
  }

  if (quote?.status === 'SENT') {
    await rpc(
      admin,
      'set_sales_quote_status',
      { p_quote_id: quoteId, p_status: 'ACCEPTED', p_reason: 'Accord du client' },
      'acceptation du devis'
    )
    quote = await rowBy(admin, 'sales_quotes', 'id', quoteId)
  }

  /* --- LA COMMANDE --------------------------------------------------------- */
  let order = await rowBy(admin, 'sales_orders', 'sales_quote_id', quoteId)

  if (!order && quote?.status === 'ACCEPTED') {
    const orderId = await rpc(
      admin,
      'convert_sales_quote_to_order',
      {
        p_quote_id: quoteId,
        p_order_date: dayOffset(-8),
        p_expected_date: dayOffset(-2),
      },
      'conversion du devis'
    )
    order = await rowBy(admin, 'sales_orders', 'id', orderId)
    report('commande', 'Commande issue du devis', order?.order_no ?? null, true)
  } else if (order) {
    report('commande', 'Commande issue du devis', order.order_no, false)
  }

  if (!order) return

  if (order.status === 'DRAFT') {
    await rpc(
      admin,
      'set_sales_order_status',
      { p_order_id: order.id, p_status: 'CONFIRMED', p_reason: 'Engagement du client' },
      'confirmation de la commande'
    )
    order = await rowBy(admin, 'sales_orders', 'id', order.id)
  }

  /* --- LA FACTURE — par la chaîne EXISTANTE, jamais une table parallèle ----- */
  let invoice = await rowBy(admin, 'customer_invoices', 'sales_order_id', order.id)

  if (!invoice && (order.status === 'CONFIRMED' || order.status === 'DELIVERED')) {
    const invoiceId = await rpc(
      admin,
      'create_invoice_from_sales_order',
      {
        p_order_id: order.id,
        p_invoice_date: dayOffset(-5),
        p_due_date: dayOffset(25),
      },
      'facture de la commande'
    )
    invoice = await rowBy(admin, 'customer_invoices', 'id', invoiceId)
    report('facture', 'Facture issue de la commande', invoice?.invoice_no ?? null, true)
  } else if (invoice) {
    report('facture', 'Facture issue de la commande', invoice.invoice_no, false)
  }

  if (invoice?.status === 'DRAFT') {
    await rpc(
      admin,
      'issue_customer_invoice',
      { p_invoice_id: invoice.id, p_reason: 'Émission de démonstration' },
      'émission de la facture'
    )
  }
}

/* ========================================================================== */
/*  Commerce fournisseur — Module 11, menus 3 et 4 (LOT 26)                    */
/* ========================================================================== */

/**
 * LE SCÉNARIO D'ACHAT, DE BOUT EN BOUT.
 *
 *   FOURNISSEUR DEMO 01
 *        └─ OFFRE REÇUE (DEV-F) ─ retenue ─▶ COMMANDE (CDE-F) ─ passée ─▶ FACTURE
 *                                                                         FOURNISSEUR
 *
 * CE QU'IL MONTRE, ET QUI NE SE VOIT NULLE PART AILLEURS :
 *
 *   · 🟥 LE PRIX EST CELUI DE L'OFFRE — le catalogue de démonstration porte un
 *     coût de RÉFÉRENCE de 45 000 KMF pour « SERVICE DEMO 03 » ; le fournisseur,
 *     lui, propose 52 000. C'est 52 000 qui est figé sur la ligne. La
 *     démonstration du lot tient dans cet écart, et il est visible à l'écran ;
 *   · LES DEUX RÉFÉRENCES — celle d'ADIKOM (DEV-F) et celle du fournisseur
 *     (PRO-2026-0147), côte à côte et jamais confondues ;
 *   · 🟩 A-13 — une ligne LIBRE coexiste avec une ligne de catalogue ;
 *   · L'OFFRE CONSERVÉE après conversion, avec sa propre référence ;
 *   · LA FACTURE née de la commande, ORDINAIRE : même numérotation FAC-F, même
 *     écran, même imputation, même règlement.
 *
 * ⚠ AUCUN `continue` NE PRÉCÈDE UNE ÉTAPE ULTÉRIEURE.
 *
 * Défaut relevé au LOT 24 : un `continue` posé pour sauter la création d'un
 * objet déjà présent sautait aussi tout ce qui venait après, et un ajout d'un
 * lot suivant n'atteignait jamais un jeu DEMO déjà en place. Ici, chaque étape
 * RETROUVE son objet et poursuit — un second passage complète ce que le premier
 * n'avait pas fait.
 */
async function seedPurchasing(admin, ids) {
  section('Commerce fournisseur')

  const supplierId = ids.suppliers['FOURNISSEUR DEMO 01']
  if (!supplierId) {
    console.log(
      `  ${DIM}Aucun fournisseur de démonstration : le commerce fournisseur est ignoré.${RESET}`
    )
    return
  }

  /* --- La variante achetable du catalogue de démonstration ---------------- */
  const { data: variante } = await admin
    .from('service_variants')
    .select('id')
    .eq('service_id', ids.services.assistance)
    .eq('label', 'Standard')
    .maybeSingle()

  if (!variante?.id) {
    console.log(
      `  ${DIM}Catalogue de démonstration incomplet : le commerce fournisseur est ignoré.${RESET}`
    )
    return
  }

  /* --- L'OFFRE REÇUE ------------------------------------------------------- */
  const quoteNote = tag('DEVF1')
  let quote = await rowByNotes(admin, 'purchase_quotes', quoteNote)
  let quoteId = quote?.id ?? null

  if (!quoteId) {
    quoteId = await rpc(
      admin,
      'create_purchase_quote',
      {
        p_supplier_id: supplierId,
        p_quote_date: dayOffset(-12),
        p_valid_until: dayOffset(18),
        // La référence que LE FOURNISSEUR a donnée à son offre.
        p_external_ref: 'PRO-2026-0147',
        p_notes: quoteNote,
        p_terms: 'Intervention sous 72 h, pièces et déplacement inclus.',
      },
      'devis fournisseur de démonstration'
    )

    /*
     * 🟥 LE PRIX EST SAISI, ET C'EST CELUI DE L'OFFRE.
     *
     * Le coût de référence du catalogue vaut 45 000 KMF pour cette prestation.
     * Ce fournisseur-ci en demande 52 000 : c'est 52 000 qui est enregistré, et
     * le catalogue n'est pas interrogé (P-5 reste ouvert).
     */
    await rpc(
      admin,
      'add_purchase_quote_line',
      {
        p_quote_id: quoteId,
        p_quantity: 3,
        p_unit_price: 52000,
        p_variant_id: variante.id,
        p_label: null,
      },
      'ligne catalogue (assistance)'
    )

    // 🟩 A-13 — UNE LIGNE LIBRE, sans aucun service au catalogue.
    await rpc(
      admin,
      'add_purchase_quote_line',
      {
        p_quote_id: quoteId,
        p_quantity: 2,
        p_unit_price: 7500,
        p_variant_id: null,
        p_label: 'Pièce détachée — hors catalogue',
      },
      'ligne libre (A-13)'
    )

    report('devis fournisseur', 'Offre de démonstration', null, true)
  } else {
    report('devis fournisseur', 'Offre de démonstration', quote.quote_no, false)
  }

  /* --- SON CYCLE — chaque étape se reprend là où elle en est ---------------- */
  quote = await rowBy(admin, 'purchase_quotes', 'id', quoteId)

  if (quote?.status === 'DRAFT') {
    await rpc(
      admin,
      'set_purchase_quote_status',
      { p_quote_id: quoteId, p_status: 'SENT', p_reason: 'Offre reçue du fournisseur' },
      'enregistrement de l’offre'
    )
    quote = await rowBy(admin, 'purchase_quotes', 'id', quoteId)
  }

  if (quote?.status === 'SENT') {
    await rpc(
      admin,
      'set_purchase_quote_status',
      { p_quote_id: quoteId, p_status: 'ACCEPTED', p_reason: 'Offre retenue par ADIKOM' },
      'offre retenue'
    )
    quote = await rowBy(admin, 'purchase_quotes', 'id', quoteId)
  }

  /* --- LA COMMANDE --------------------------------------------------------- */
  let order = await rowBy(admin, 'purchase_orders', 'purchase_quote_id', quoteId)

  if (!order && quote?.status === 'ACCEPTED') {
    const orderId = await rpc(
      admin,
      'convert_purchase_quote_to_order',
      {
        p_quote_id: quoteId,
        p_order_date: dayOffset(-9),
        p_expected_date: dayOffset(-2),
      },
      'conversion de l’offre'
    )
    order = await rowBy(admin, 'purchase_orders', 'id', orderId)
    report('commande fournisseur', 'Commande issue de l’offre', order?.order_no ?? null, true)
  } else if (order) {
    report('commande fournisseur', 'Commande issue de l’offre', order.order_no, false)
  }

  if (!order) return

  if (order.status === 'DRAFT') {
    await rpc(
      admin,
      'set_purchase_order_status',
      { p_order_id: order.id, p_status: 'CONFIRMED', p_reason: 'Commande transmise au fournisseur' },
      'passage de la commande'
    )
    order = await rowBy(admin, 'purchase_orders', 'id', order.id)
  }

  if (order.status === 'CONFIRMED') {
    // 🟩 B-6 : la réception se constate par un statut, jamais par un document.
    await rpc(
      admin,
      'set_purchase_order_status',
      { p_order_id: order.id, p_status: 'DELIVERED', p_reason: 'Prestation reçue' },
      'réception de la commande'
    )
    order = await rowBy(admin, 'purchase_orders', 'id', order.id)
  }

  /* --- LA FACTURE — par la chaîne EXISTANTE, jamais une table parallèle ----- */
  let invoice = await rowBy(admin, 'supplier_invoices', 'purchase_order_id', order.id)

  if (!invoice && (order.status === 'CONFIRMED' || order.status === 'DELIVERED')) {
    const invoiceId = await rpc(
      admin,
      'create_invoice_from_purchase_order',
      {
        p_order_id: order.id,
        p_invoice_date: dayOffset(-4),
        p_due_date: dayOffset(26),
        p_external_ref: 'FA-2026-0912',
      },
      'facture de la commande fournisseur'
    )
    invoice = await rowBy(admin, 'supplier_invoices', 'id', invoiceId)
    report('facture fournisseur', 'Facture issue de la commande', invoice?.invoice_no ?? null, true)
  } else if (invoice) {
    report('facture fournisseur', 'Facture issue de la commande', invoice.invoice_no, false)
  }

  // La dette se reconnaît en deux actes distincts, ceux du LOT 5.
  if (invoice?.status === 'DRAFT') {
    await rpc(
      admin,
      'submit_supplier_invoice',
      { p_invoice_id: invoice.id },
      'soumission de la facture'
    )
    invoice = await rowBy(admin, 'supplier_invoices', 'id', invoice.id)
  }

  if (invoice?.status === 'PENDING') {
    await rpc(
      admin,
      'validate_supplier_invoice',
      { p_invoice_id: invoice.id, p_reason: 'Contrôle de démonstration' },
      'validation de la facture'
    )
  }
}

async function seedProjects(admin, ids) {
  section('Projets, tâches et planification')

  for (const project of PROJECTS) {
    const projectId = await ensure(
      admin, 'projects', { name: project.name },
      async () => ({
        name: project.name,
        description: DEMO_NOTE,
        objective: project.objective,
        owner_id: ids.users[project.ownerKey] ?? null,
        status: project.status,
        priority: project.priority,
        starts_on: dayOffset(project.from),
        due_on: dayOffset(project.to),
      }),
      project.name, 'projet', null
    )

    ids.projects[project.name] = projectId

    if (ids.users.responsable) {
      await admin.from('project_members').upsert(
        { project_id: projectId, user_id: ids.users.responsable, role: 'PARTICIPANT' },
        { onConflict: 'project_id,user_id' }
      )
    }
    if (ids.users.comptable) {
      await admin.from('project_members').upsert(
        { project_id: projectId, user_id: ids.users.comptable, role: 'OBSERVER' },
        { onConflict: 'project_id,user_id' }
      )
    }

    for (const task of project.tasks) {
      await ensure(
        admin, 'project_tasks', { title: task.title },
        async () => ({
          project_id: projectId,
          title: task.title,
          description: DEMO_NOTE,
          assignee_id: task.assignee ? (ids.users[task.assignee] ?? null) : null,
          status: task.status,
          priority: task.priority,
          starts_on: dayOffset(project.from),
          due_on: dayOffset(task.due),
          completed_at: task.status === 'DONE' ? instantOffset(-24 * 5) : null,
        }),
        task.title, 'tâche', null
      )
    }
  }

  /* --- Tâche indépendante, hors projet ------------------------------------- */
  await ensure(
    admin, 'project_tasks', { title: 'Contrôle mensuel des assurances du parc' },
    async () => ({
      project_id: null,
      title: 'Contrôle mensuel des assurances du parc',
      description: DEMO_NOTE,
      assignee_id: ids.users.assistante ?? null,
      status: 'TODO',
      priority: 'NORMAL',
      due_on: dayOffset(5),
    }),
    'Contrôle mensuel des assurances', 'tâche', null
  )

  /* --- Réunions ------------------------------------------------------------ */
  const meetings = [
    {
      title: 'RÉUNION DEMO — Comité d’exploitation',
      objective: 'Revue hebdomadaire de l’activité de location.',
      projectName: 'PROJET DEMO — Renouvellement du parc',
      startsIn: 48, duration: 90, status: 'PLANNED',
      location: 'Salle de réunion — Moroni',
      agenda: '1. Disponibilité du parc\n2. Retards de retour\n3. Créances clients',
    },
    {
      title: 'RÉUNION DEMO — Revue financière mensuelle',
      objective: 'Analyse des encaissements et des décaissements du mois.',
      projectName: 'PROJET DEMO — Refonte du suivi financier',
      startsIn: -24 * 10, duration: 120, status: 'HELD',
      location: 'Direction — Moroni',
      agenda: '1. Encaissements\n2. Imputations fournisseurs\n3. Trésorerie',
      minutes:
        'Les imputations fournisseurs ont été passées en revue. Le net à payer du ' +
        'fournisseur principal est ramené à 200 000 KMF après imputation de la ' +
        'maintenance. Le suivi mensuel est reconduit.',
    },
  ]

  for (const meeting of meetings) {
    const meetingId = await ensure(
      admin, 'project_meetings', { title: meeting.title },
      async () => ({
        title: meeting.title,
        objective: meeting.objective,
        project_id: ids.projects[meeting.projectName] ?? null,
        owner_id: ids.users.responsable ?? null,
        starts_at: instantOffset(meeting.startsIn),
        duration_minutes: meeting.duration,
        location: meeting.location,
        agenda: meeting.agenda,
        status: meeting.status,
        minutes: meeting.minutes ?? null,
        minutes_recorded_at: meeting.minutes ? instantOffset(meeting.startsIn + 2) : null,
      }),
      meeting.title, 'réunion', null
    )

    for (const key of ['responsable', 'comptable', 'assistante']) {
      if (!ids.users[key]) continue
      await admin.from('project_meeting_participants').upsert(
        { meeting_id: meetingId, user_id: ids.users[key] },
        { onConflict: 'meeting_id,user_id' }
      )
    }
  }

  /* --- Rendez-vous --------------------------------------------------------- */
  const appointments = [
    {
      subject: 'RENDEZ-VOUS DEMO — Convention annuelle CLIENT DEMO 01',
      startsIn: 72, duration: 60, status: 'PLANNED',
      location: 'Siège du client — Moroni',
      clientName: 'CLIENT DEMO 01',
    },
    {
      subject: 'RENDEZ-VOUS DEMO — Point fournisseur véhicules',
      startsIn: -24 * 6, duration: 45, status: 'HELD',
      location: 'Atelier — Moroni',
      supplierName: 'FOURNISSEUR DEMO 01',
    },
  ]

  for (const appointment of appointments) {
    const appointmentId = await ensure(
      admin, 'project_appointments', { subject: appointment.subject },
      async () => ({
        subject: appointment.subject,
        starts_at: instantOffset(appointment.startsIn),
        duration_minutes: appointment.duration,
        location: appointment.location,
        owner_id: ids.users.assistante ?? null,
        client_id: appointment.clientName ? ids.clients[appointment.clientName] : null,
        supplier_id: appointment.supplierName ? ids.suppliers[appointment.supplierName] : null,
        status: appointment.status,
        notes: DEMO_NOTE,
      }),
      appointment.subject, 'rendez-vous', null
    )

    if (ids.users.assistante) {
      await admin.from('project_appointment_participants').upsert(
        { appointment_id: appointmentId, user_id: ids.users.assistante },
        { onConflict: 'appointment_id,user_id' }
      )
    }
  }

  /* --- Décisions et actions ------------------------------------------------ */
  const decisions = [
    {
      title: 'DÉCISION DEMO — Imputation des maintenances au fournisseur',
      context: 'Les réparations engagées sur les véhicules mis à disposition pèsent sur la marge.',
      statement:
        'Toute maintenance dont la responsabilité incombe au fournisseur est imputée sur sa ' +
        'facture, sans jamais être enregistrée comme un paiement.',
      decidedOffset: -10,
      projectName: 'PROJET DEMO — Refonte du suivi financier',
    },
    {
      title: 'DÉCISION DEMO — Renouvellement prioritaire des véhicules de plus de 120 000 km',
      context: 'Le coût d’entretien des véhicules les plus anciens progresse.',
      statement:
        'Les véhicules dépassant 120 000 km sont retirés du parc commercial et remplacés en priorité.',
      decidedOffset: -25,
      projectName: 'PROJET DEMO — Renouvellement du parc',
    },
  ]

  const decisionIds = {}
  const meetingIds = {}

  for (const meeting of meetings) {
    const { data } = await admin
      .from('project_meetings').select('id').eq('title', meeting.title).maybeSingle()
    if (data) meetingIds[meeting.title] = data.id
  }

  for (const decision of decisions) {
    decisionIds[decision.title] = await ensure(
      admin, 'project_decisions', { title: decision.title },
      async () => ({
        title: decision.title,
        context: decision.context,
        statement: decision.statement,
        decided_on: dayOffset(decision.decidedOffset),
        owner_id: ids.users.responsable ?? null,
        project_id: ids.projects[decision.projectName] ?? null,
      }),
      decision.title, 'décision', null
    )
  }

  /*
   * UNE ACTION SANS ORIGINE N'EST PAS UNE ACTION : C'EST UNE TÂCHE.
   *
   * `actions_has_origin` l'impose — chaque action prolonge une réunion ou une
   * décision. Les trois ci-dessous citent donc celle dont elles découlent.
   */
  const actions = [
    {
      title: 'ACTION DEMO — Relancer le client sur la facture échue',
      description: 'Facture de démonstration échue depuis vingt jours.',
      status: 'TODO', due: 2, assignee: 'comptable',
      meetingTitle: 'RÉUNION DEMO — Revue financière mensuelle',
    },
    {
      title: 'ACTION DEMO — Transmettre le devis de réparation au fournisseur',
      description: 'Devis accepté, à transmettre pour information.',
      status: 'DONE', due: -8, assignee: 'responsable',
      decisionTitle: 'DÉCISION DEMO — Imputation des maintenances au fournisseur',
    },
    {
      title: 'ACTION DEMO — Préparer le dossier d’ouverture d’agence',
      description: 'Pièces administratives à réunir.',
      status: 'TODO', due: 12, assignee: 'assistante',
      decisionTitle: 'DÉCISION DEMO — Renouvellement prioritaire des véhicules de plus de 120 000 km',
    },
  ]

  for (const action of actions) {
    await ensure(
      admin, 'project_actions', { title: action.title },
      async () => ({
        title: action.title,
        description: action.description,
        meeting_id: action.meetingTitle ? (meetingIds[action.meetingTitle] ?? null) : null,
        decision_id: action.decisionTitle ? (decisionIds[action.decisionTitle] ?? null) : null,
        assignee_id: ids.users[action.assignee] ?? null,
        due_on: dayOffset(action.due),
        status: action.status,
        completed_at: action.status === 'DONE' ? instantOffset(-24 * 8) : null,
      }),
      action.title, 'action', null
    )
  }
}

main().catch((error) => {
  console.error(`\n${RED}✖ ${error.message}${RESET}\n`)
  process.exit(1)
})
