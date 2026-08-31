#!/usr/bin/env node
/**
 * Audit des capacités — aucune opération sensible par une permission moindre.
 *
 * CE QU'ELLE PROUVE
 *
 * Chaque compte ne détient QU'UNE capacité voisine de celle qu'exige l'acte,
 * et tente l'acte par APPEL DIRECT — RPC PostgREST ou `PATCH` sur la table —
 * sans jamais passer par un écran. Aucun de ces appels ne doit aboutir.
 *
 * C'est le seul protocole qui vaille ici : masquer un bouton ne protège rien,
 * et une garde serveur ne se trouve pas sur le chemin d'un appel direct.
 *
 * Le contrôle est POSITIF des deux côtés : on vérifie que l'acte est refusé au
 * porteur de la mauvaise capacité, ET qu'il reste possible au porteur de la
 * bonne. Une barrière qui bloque tout le monde n'est pas une barrière, c'est
 * une panne.
 *
 * Utilisation :
 *   node scripts/verify-capabilities.mjs
 */

import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required } from './lib/env.mjs'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0

function check(condition, label, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ${GREEN}[OK]${RESET} ${label}${detail ? ` ${DIM}— ${detail}${RESET}` : ''}`)
  } else {
    failed += 1
    console.log(`  ${RED}[ÉCHEC]${RESET} ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const STAMP = Date.now().toString().slice(-6)
const MARK = `AUDIT CAP ${STAMP}`

/** Toute lecture exige `view` : sans elle, RLS masquerait la ligne visée. */
const READERS = [
  'rental.reservations.view',
  'rental.rentals.view',
  'rental.maintenance.view',
  'rental.incidents.view',
  'rental.fleet.view',
  'parties.clients.view',
]

/**
 * Un profil par capacité éprouvée.
 *
 * Chacun porte les lectures, la capacité voisine — celle qui, avant la
 * migration 041, suffisait à tout — et rien d'autre.
 */
const PROFILES = {
  // Le compte de référence : il peut tout accomplir légitimement.
  operateur: [
    ...READERS,
    'rental.maintenance.cost.view',
    'rental.maintenance.cost.update',
    'rental.reservations.create',
    'rental.reservations.update',
    'rental.reservations.confirm',
    'rental.reservations.cancel',
    'rental.rentals.create',
    'rental.rentals.update',
    'rental.rentals.checkout',
    'rental.rentals.extend',
    'rental.rentals.return',
    'rental.rentals.close',
    'rental.rentals.cancel',
    'rental.maintenance.create',
    'rental.maintenance.update',
    'rental.maintenance.validate',
    'rental.maintenance.close',
    'rental.fleet.status.update',
  ],
  // Modifier une réservation, sans la confirmer ni l'annuler. La capacité de
  // calendrier ajoutée est celle qui, avant, ouvrait la porte.
  res_update: [...READERS, 'rental.reservations.update', 'rental.maintenance.create'],
  // Faire partir une location, sans la prolonger, la retourner ni l'annuler.
  loc_checkout: [...READERS, 'rental.rentals.checkout'],
  // Modifier un contrat, sans aucun acte d'exploitation.
  loc_update: [...READERS, 'rental.rentals.update'],
  // Modifier une maintenance, sans l'engager, la terminer NI toucher à l'argent.
  mnt_update: [...READERS, 'rental.maintenance.create', 'rental.maintenance.update'],
  // Terminer une maintenance, sans pouvoir l'engager.
  mnt_close: [...READERS, 'rental.maintenance.create', 'rental.maintenance.close'],
  /*
   * LOT 3 — les deux capacités financières, isolées.
   *
   * `mnt_cost_view` VOIT les montants sans pouvoir en écrire un ;
   * `mnt_cost_edit` les écrit sans pouvoir décider d'un devis — décider
   * relève de `validate` (arbitrage L2).
   */
  mnt_cost_view: [...READERS, 'rental.maintenance.cost.view'],
  mnt_cost_edit: [
    ...READERS,
    'rental.maintenance.cost.view',
    'rental.maintenance.cost.update',
  ],
  /*
   * LOT 4 — les cinq capacités d'imputation, isolées.
   *
   * Règles permissions §36 : « Un utilisateur ne doit pas automatiquement
   * disposer de toutes ces permissions. » Chaque profil n'en porte qu'une,
   * plus les lectures nécessaires pour que RLS ne masque pas la ligne visée.
   */
  imp_view: [...READERS, 'billing.imputations.view'],
  imp_create: [
    ...READERS,
    'rental.maintenance.cost.view',
    'billing.imputations.view',
    'billing.imputations.create',
  ],
  imp_update: [
    ...READERS,
    'rental.maintenance.cost.view',
    'billing.imputations.view',
    'billing.imputations.update',
  ],
  imp_validate: [...READERS, 'billing.imputations.view', 'billing.imputations.validate'],
  imp_cancel: [...READERS, 'billing.imputations.view', 'billing.imputations.cancel'],
  // Le compte complet du domaine `billing`, pour les contrôles positifs.
  imp_full: [
    ...READERS,
    'rental.maintenance.cost.view',
    'rental.maintenance.cost.update',
    'rental.maintenance.create',
    'billing.imputations.view',
    'billing.imputations.create',
    'billing.imputations.update',
    'billing.imputations.validate',
    'billing.imputations.cancel',
  ],
  /*
   * LOT 5 — les capacités de facturation fournisseur, isolées.
   *
   * `parties.suppliers.view` accompagne chacune : on n'enregistre ni ne
   * contrôle la dette d'un fournisseur qu'on n'a pas le droit de voir. Ce n'est
   * pas une capacité impliquée (DEC-024), c'est une capacité EXIGÉE — et le
   * refus la nomme.
   */
  inv_view: [...READERS, 'parties.suppliers.view', 'billing.supplier_invoices.view'],
  inv_create: [
    ...READERS,
    'parties.suppliers.view',
    'billing.supplier_invoices.view',
    'billing.supplier_invoices.create',
  ],
  inv_update: [
    ...READERS,
    'parties.suppliers.view',
    'billing.supplier_invoices.view',
    'billing.supplier_invoices.update',
  ],
  inv_validate: [
    ...READERS,
    'parties.suppliers.view',
    'billing.supplier_invoices.view',
    'billing.supplier_invoices.validate',
  ],
  /*
   * Annuler une facture exige de VOIR ce qui la réduit et ce qui la solde :
   * une annulation à l'aveugle orphelinerait une imputation ou un règlement
   * (LOT 5 pour l'une, LOT 6 pour l'autre).
   */
  inv_cancel: [
    ...READERS,
    'parties.suppliers.view',
    'billing.supplier_invoices.view',
    'billing.supplier_invoices.cancel',
    'billing.imputations.view',
    'billing.supplier_payments.view',
  ],
  // Rattacher exige `imputations.update` ET les deux lectures : ce profil les
  // porte, celui qui suit n'en porte qu'une.
  inv_full: [
    ...READERS,
    'parties.suppliers.view',
    'billing.supplier_invoices.view',
    'billing.supplier_invoices.create',
    'billing.supplier_invoices.update',
    'billing.supplier_invoices.validate',
    'billing.supplier_invoices.cancel',
    'billing.imputations.view',
    'billing.imputations.update',
  ],
  // Peut modifier une imputation, mais ne voit AUCUNE facture : le plafond de
  // Workflow 06 §20 porterait sur une somme muette. Le rattachement est refusé.
  imp_blind_invoice: [
    ...READERS,
    'rental.maintenance.cost.view',
    'billing.imputations.view',
    'billing.imputations.update',
  ],

  /*
   * LOT 6 — Banques & Caisses, et les règlements.
   *
   * `treasury.balances.view` est isolée à dessein : voir un compte n'est pas
   * voir ce qu'il contient (DEC-024).
   */
  acc_view: [...READERS, 'treasury.accounts.view'],
  acc_create: [...READERS, 'treasury.accounts.view', 'treasury.accounts.create'],
  acc_update: [...READERS, 'treasury.accounts.view', 'treasury.accounts.update'],
  acc_archive: [...READERS, 'treasury.accounts.view', 'treasury.accounts.archive'],
  // Le solde est la somme des ÉCRITURES : sans le droit de les lire, la
  // fonction refuse plutôt que de renvoyer le seul solde d'ouverture (050).
  acc_balance: [
    ...READERS,
    'treasury.accounts.view',
    'treasury.balances.view',
    'treasury.entries.view',
  ],

  // Le compte complet du domaine, pour les contrôles positifs.
  pay_full: [
    ...READERS,
    'parties.suppliers.view',
    'treasury.accounts.view',
    'treasury.accounts.create',
    'treasury.balances.view',
    'treasury.entries.view',
    'billing.supplier_invoices.view',
    'billing.supplier_invoices.create',
    'billing.supplier_invoices.update',
    'billing.supplier_invoices.validate',
    'billing.supplier_invoices.cancel',
    'billing.imputations.view',
    'billing.supplier_payments.view',
    'billing.supplier_payments.create',
    'billing.supplier_payments.cancel',
  ],
  /*
   * EXACTEMENT les cinq capacités qu'exige un règlement, et RIEN d'autre —
   * surtout aucun droit d'écriture sur la facture.
   *
   * C'est ce profil qui a révélé le défaut corrigé par la migration 051 : le
   * `select … for update` sur la facture appliquait, sous RLS, sa policy
   * d'ÉCRITURE, et déclarait la facture « introuvable » à qui n'avait pas le
   * droit de la modifier. Un profil complet ne l'aurait jamais vu.
   */
  pay_minimal: [
    ...READERS,
    'treasury.accounts.view',
    'billing.supplier_invoices.view',
    'billing.imputations.view',
    'billing.supplier_payments.view',
    'billing.supplier_payments.create',
  ],
  // Consulte les règlements, n'en enregistre aucun.
  pay_view: [
    ...READERS,
    'treasury.accounts.view',
    'billing.supplier_invoices.view',
    'billing.imputations.view',
    'billing.supplier_payments.view',
  ],
  // Peut payer, mais ne voit AUCUN compte : le compte à mouvementer serait
  // désigné à l'aveugle (Workflow 08 §13).
  pay_blind_account: [
    ...READERS,
    'billing.supplier_invoices.view',
    'billing.imputations.view',
    'billing.supplier_payments.view',
    'billing.supplier_payments.create',
  ],
  // Peut payer et voir les comptes, mais ne voit AUCUNE imputation : le net à
  // payer, dont dépend §22, porterait sur une somme muette.
  pay_blind_imputation: [
    ...READERS,
    'treasury.accounts.view',
    'billing.supplier_invoices.view',
    'billing.supplier_payments.view',
    'billing.supplier_payments.create',
  ],

  /*
   * LOT 7 — la facture client, et la clôture de la location.
   *
   * Deux frontières se croisent ici, et chacune doit tenir seule :
   *
   *   ÉMETTRE une facture rend la location « Facturée ». Cet acte porte
   *   `customer_invoices.issue` et RIEN d'autre : réclamer une capacité
   *   d'exploitation pour un acte de facturation inventerait une règle
   *   (DEC-024, même doctrine que la migration 051).
   *
   *   CLÔTURER une location est un acte d'exploitation, et porte
   *   `rental.rentals.close`. Détenir toutes les capacités de facturation ne
   *   doit pas y donner accès.
   */
  cli_view: [...READERS, 'billing.customer_invoices.view'],
  cli_create: [
    ...READERS,
    'billing.customer_invoices.view',
    'billing.customer_invoices.create',
  ],
  cli_update: [
    ...READERS,
    'billing.customer_invoices.view',
    'billing.customer_invoices.update',
  ],
  /*
   * EXACTEMENT les trois capacités qu'exige l'émission, et RIEN d'autre —
   * surtout aucun droit d'écriture sur la location.
   *
   * C'est le profil qui prouve que « Facturée » est bien la CONSÉQUENCE de
   * l'émission, et non un second acte : un compte complet réussirait pour de
   * mauvaises raisons.
   */
  cli_issue: [
    'rental.rentals.view',
    'billing.customer_invoices.view',
    'billing.customer_invoices.issue',
  ],
  cli_cancel: [
    ...READERS,
    'billing.customer_invoices.view',
    'billing.customer_invoices.cancel',
  ],
  // Peut émettre, mais ne voit AUCUNE location : la facture porte pourtant un
  // contrat dont l'état conditionne l'acte. On n'agit pas à l'aveugle.
  cli_blind_rental: [
    'parties.clients.view',
    'billing.customer_invoices.view',
    'billing.customer_invoices.create',
    'billing.customer_invoices.issue',
  ],
  // Tout le domaine `customer_invoices`, SANS `rental.rentals.close` : facturer
  // n'est pas clôturer.
  cli_full: [
    ...READERS,
    'billing.customer_invoices.view',
    'billing.customer_invoices.create',
    'billing.customer_invoices.update',
    'billing.customer_invoices.issue',
    'billing.customer_invoices.cancel',
  ],
  // Peut clôturer, et RIEN de la facturation : l'acte d'exploitation tient seul.
  loc_close: [...READERS, 'rental.rentals.close'],
}

async function createProfile(admin, key, codes) {
  const username = `audit.cap.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `audit-cap-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${key} : ${error?.message}`)

  const id = created.user.id

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Audit',
    last_name: `Capacité ${key}`,
    username,
    email,
    status: 'ACTIVE',
  })
  if (profileError) throw new Error(`profil ${key} : ${profileError.message}`)

  const { data: catalog } = await admin.from('permissions').select('id, code').in('code', codes)
  if ((catalog ?? []).length !== codes.length) {
    const found = new Set((catalog ?? []).map((p) => p.code))
    throw new Error(`catalogue incomplet (${key}) : ${codes.filter((c) => !found.has(c)).join(', ')}`)
  }

  const { error: grantError } = await admin
    .from('user_permissions')
    .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' })))
  if (grantError) throw new Error(`permissions ${key} : ${grantError.message}`)

  return { id, email, password, username }
}

/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nCible : ${url} ${DIM}(appels directs, aucun navigateur)${RESET}\n`)

  const accounts = {}
  const sessions = {}
  const fixtures = {
    vehicleIds: [],
    reservations: [],
    rentals: [],
    maintenances: [],
    imputations: [],
    invoices: [],
    accounts: [],
    payments: [],
    customerInvoices: [],
  }

  /** Session PostgREST d'un profil : exactement ce dont dispose un appelant. */
  async function session(key) {
    if (sessions[key]) return sessions[key]
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await client.auth.signInWithPassword({
      email: accounts[key].email,
      password: accounts[key].password,
    })
    if (error) throw new Error(`session ${key} : ${error.message}`)
    sessions[key] = client
    return client
  }

  /** Un refus est-il bien un refus de DROIT, et non un simple effet nul ? */
  function refused(result) {
    return Boolean(result.error)
  }

  /** La ligne est-elle encore là ? Preuve qu'un refus silencieux a protégé. */
  async function stillThere(client, id) {
    const { data } = await client.from('imputations').select('id').eq('id', id).maybeSingle()
    return Boolean(data)
  }

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `ACAP-${STAMP}`, label: `${MARK} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    const { data: rule } = await admin
      .from('pricing_rules')
      .insert({ category_id: category.id, amount: 100000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    // F et G servent au LOT 7 : deux locations menées jusqu'à « À facturer ».
    for (const suffix of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
      const { data: vehicle } = await admin
        .from('vehicles')
        .insert({
          vehicle_no: vehicleNo,
          category_id: category.id,
          brand: 'AUDIT',
          model: `CAP ${STAMP} ${suffix}`,
          plate: `AC-${STAMP}${suffix}`,
          origin: 'OWNED',
          status: 'AVAILABLE',
        })
        .select('id')
        .single()
      fixtures.vehicleIds.push(vehicle.id)
    }

    /*
     * LOT 4 — un fournisseur et un véhicule qu'il met à disposition.
     *
     * Workflow 06 §4 : sans rattachement fournisseur, aucune imputation n'est
     * possible. Les cinq véhicules ci-dessus appartiennent à ADIKOM (`OWNED`)
     * et ne s'y prêtent donc pas.
     */
    const { data: supplierNo } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
    const { data: supplier, error: supplierError } = await admin
      .from('suppliers')
      .insert({
        supplier_no: supplierNo,
        type: 'VEHICLE_SUPPLIER',
        legal_name: `${MARK} — Fournisseur`,
        phone: '+269 000',
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    if (supplierError) throw new Error(`fournisseur : ${supplierError.message}`)
    fixtures.supplierId = supplier.id

    const { data: suppliedNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
    const { data: supplied, error: suppliedError } = await admin
      .from('vehicles')
      .insert({
        vehicle_no: suppliedNo,
        category_id: category.id,
        brand: 'AUDIT',
        model: `CAP ${STAMP} SUP`,
        plate: `AC-${STAMP}S`,
        origin: 'SUPPLIED',
        current_supplier_id: supplier.id,
        status: 'AVAILABLE',
      })
      .select('id')
      .single()
    if (suppliedError) throw new Error(`véhicule fourni : ${suppliedError.message}`)
    fixtures.vehicleIds.push(supplied.id)
    fixtures.suppliedVehicleId = supplied.id

    const { data: clientNo } = await admin.rpc('next_number', { p_entity_key: 'client' })
    const { data: client } = await admin
      .from('clients')
      .insert({
        client_no: clientNo,
        type: 'COMPANY',
        legal_name: `${MARK} — Client`,
        phone: '+269 000',
      })
      .select('id')
      .single()
    fixtures.clientId = client.id

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, key, codes)
    }

    /** Une réservation neuve, en attente, sur le véhicule indiqué. */
    async function makeReservation(vehicleIndex, offsetDays) {
      const { data: no } = await admin.rpc('next_number', { p_entity_key: 'reservation' })
      const from = new Date(Date.now() + offsetDays * 864e5)
      const to = new Date(Date.now() + (offsetDays + 3) * 864e5)

      const { data, error } = await admin
        .from('reservations')
        .insert({
          reservation_no: no,
          client_id: fixtures.clientId,
          vehicle_id: fixtures.vehicleIds[vehicleIndex],
          period: `[${from.toISOString()},${to.toISOString()})`,
          status: 'PENDING',
        })
        .select('id')
        .single()
      if (error) throw new Error(`réservation : ${error.message}`)

      fixtures.reservations.push(data.id)
      return data.id
    }

    /**
     * Une location menée jusqu'à « À facturer » — le seul état facturable (§5).
     *
     * Le parcours emprunte les fonctions atomiques du cycle, sous le rôle de
     * service : `current_actor()` y est NULL, donc aucune capacité n'est
     * exigée. Ce n'est PAS ce qu'on éprouve ici — on construit un sujet, et les
     * capacités sont éprouvées ensuite, avec de vraies sessions.
     */
    async function makeInvoiceableRental(vehicleIndex, offsetDays) {
      const reservationId = await makeReservation(vehicleIndex, offsetDays)

      await admin.rpc('confirm_reservation', {
        p_reservation_id: reservationId,
        p_vehicle_id: fixtures.vehicleIds[vehicleIndex],
      })

      const { data: rentalId, error } = await admin.rpc('convert_reservation_to_rental', {
        p_reservation_id: reservationId,
      })
      if (error) throw new Error(`location : ${error.message}`)

      fixtures.rentals.push(rentalId)

      await admin
        .from('rentals')
        .update({ status: 'CONFIRMED', status_changed_at: new Date().toISOString() })
        .eq('id', rentalId)

      await admin.rpc('start_rental', {
        p_rental_id: rentalId,
        p_started_at: new Date().toISOString(),
        p_mileage: 10000,
        p_fuel_level: 'FULL',
      })

      await admin.rpc('return_rental', {
        p_rental_id: rentalId,
        p_returned_at: new Date(Date.now() + 3600_000).toISOString(),
        p_mileage: 10400,
        p_fuel_level: 'HALF',
      })

      const { error: controlError } = await admin
        .from('rentals')
        .update({ status: 'TO_INVOICE', status_changed_at: new Date().toISOString() })
        .eq('id', rentalId)
      if (controlError) throw new Error(`contrôle : ${controlError.message}`)

      return rentalId
    }

    console.log(`${DIM}Cinq véhicules, un client, six profils — chacun réduit à sa capacité.${RESET}`)

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('RÉSERVATIONS\n')

    {
      const target = await makeReservation(0, 200)

      // `reservations.update` + une capacité de calendrier : la combinaison qui
      // suffisait avant la migration 041.
      const weak = await session('res_update')
      const confirm = await weak.rpc('confirm_reservation', {
        p_reservation_id: target,
        p_vehicle_id: fixtures.vehicleIds[0],
      })
      check(refused(confirm), 'confirm_reservation refusée sans `reservations.confirm`')

      const patch = await weak
        .from('reservations')
        .update({ status: 'CONFIRMED' })
        .eq('id', target)
      check(refused(patch), 'PATCH direct vers « Confirmée » refusé de même')

      const cancel = await weak.rpc('cancel_reservation', { p_reservation_id: target })
      check(refused(cancel), 'cancel_reservation refusée sans `reservations.cancel`')

      const patchCancel = await weak
        .from('reservations')
        .update({ status: 'CANCELLED' })
        .eq('id', target)
      check(refused(patchCancel), 'PATCH direct vers « Annulée » refusé de même')

      const { data: untouched } = await admin
        .from('reservations')
        .select('status')
        .eq('id', target)
        .maybeSingle()
      check(untouched?.status === 'PENDING', 'La réservation n’a pas bougé', untouched?.status)

      // Et le porteur légitime, lui, passe.
      const strong = await session('operateur')
      const ok = await strong.rpc('confirm_reservation', {
        p_reservation_id: target,
        p_vehicle_id: fixtures.vehicleIds[0],
      })
      check(!refused(ok), 'La capacité `confirm` accomplit l’acte', ok.error?.message ?? '')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('LOCATIONS\n')

    let rentalId = null

    {
      const strong = await session('operateur')

      const reservation = await makeReservation(1, 210)
      await strong.rpc('confirm_reservation', {
        p_reservation_id: reservation,
        p_vehicle_id: fixtures.vehicleIds[1],
      })

      // `rentals.checkout` seul : suffisait avant à convertir ? Non — l'insert
      // exige `rentals.create`. On l'éprouve tout de même.
      const weakCheckout = await session('loc_checkout')
      const convert = await weakCheckout.rpc('convert_reservation_to_rental', {
        p_reservation_id: reservation,
      })
      check(refused(convert), 'convert_reservation_to_rental refusée sans `rentals.create`')

      const { data: created } = await strong.rpc('convert_reservation_to_rental', {
        p_reservation_id: reservation,
      })
      rentalId = String(created)
      fixtures.rentals.push(rentalId)

      await strong.from('rentals').update({ status: 'CONFIRMED' }).eq('id', rentalId)

      // Départ : `rentals.update` — qui a le droit d'écrire dans la table —
      // ne doit pas suffire à faire partir un véhicule.
      const weakUpdate = await session('loc_update')
      const patchStart = await weakUpdate
        .from('rentals')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', rentalId)
      check(refused(patchStart), 'PATCH direct vers « En cours » refusé sans `rentals.checkout`')

      const startedWeak = await weakUpdate.rpc('start_rental', {
        p_rental_id: rentalId,
        p_started_at: new Date().toISOString(),
        p_mileage: 10000,
      })
      check(refused(startedWeak), 'start_rental refusée de même')

      const started = await strong.rpc('start_rental', {
        p_rental_id: rentalId,
        p_started_at: new Date().toISOString(),
        p_mileage: 10000,
        p_fuel_level: 'FULL',
      })
      check(!refused(started), 'La capacité `checkout` fait partir la location', started.error?.message ?? '')

      // Prolonger : `checkout` ne doit pas suffire.
      const extend = await weakCheckout.rpc('extend_rental', {
        p_rental_id: rentalId,
        p_new_end: new Date(Date.now() + 400 * 864e5).toISOString(),
      })
      check(refused(extend), 'extend_rental refusée sans `rentals.extend`')

      // Retourner : `checkout` ne doit pas suffire — LE défaut historique.
      const back = await weakCheckout.rpc('return_rental', {
        p_rental_id: rentalId,
        p_returned_at: new Date().toISOString(),
        p_mileage: 10100,
      })
      check(refused(back), 'return_rental refusée sans `rentals.return`')

      const patchReturn = await weakCheckout
        .from('rentals')
        .update({ status: 'RETURNED' })
        .eq('id', rentalId)
      check(refused(patchReturn), 'PATCH direct vers « Retournée » refusé de même')

      // Annuler : `checkout` ne doit pas suffire non plus.
      const cancel = await weakCheckout.rpc('cancel_rental', { p_rental_id: rentalId })
      check(refused(cancel), 'cancel_rental refusée sans `rentals.cancel`')

      const { data: stillRunning } = await admin
        .from('rentals')
        .select('status')
        .eq('id', rentalId)
        .maybeSingle()
      check(
        stillRunning?.status === 'IN_PROGRESS',
        'La location est restée « En cours »',
        stillRunning?.status
      )

      // Le porteur légitime retourne, puis clôt le contrôle.
      const legit = await strong.rpc('return_rental', {
        p_rental_id: rentalId,
        p_returned_at: new Date().toISOString(),
        p_mileage: 10100,
      })
      check(!refused(legit), 'La capacité `return` accomplit le retour', legit.error?.message ?? '')

      const weakClose = await weakCheckout
        .from('rentals')
        .update({ status: 'TO_INVOICE' })
        .eq('id', rentalId)
      check(refused(weakClose), 'Valider le contrôle refusé sans `rentals.close`')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('MAINTENANCE\n')

    {
      const strong = await session('operateur')

      const { data: created } = await strong.rpc('create_maintenance', {
        p_vehicle_id: fixtures.vehicleIds[2],
        p_origin: 'BREAKDOWN',
        p_reason: `${MARK} — audit`,
      })
      const maintenanceId = String(created)
      fixtures.maintenances.push(maintenanceId)

      // Engager (Brouillon → Planifiée) exige `validate`.
      const closeOnly = await session('mnt_close')
      const validate = await closeOnly
        .from('vehicle_maintenances')
        .update({ status: 'PLANNED' })
        .eq('id', maintenanceId)
      check(refused(validate), 'Engager une maintenance refusé sans `maintenance.validate`')

      await strong.from('vehicle_maintenances').update({ status: 'PLANNED' }).eq('id', maintenanceId)
      await strong
        .from('vehicle_maintenances')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', maintenanceId)

      // Terminer exige `close` — le défaut trouvé au LOT 2.
      const updateOnly = await session('mnt_update')
      const complete = await updateOnly.rpc('complete_maintenance', {
        p_maintenance_id: maintenanceId,
      })
      check(refused(complete), 'complete_maintenance refusée sans `maintenance.close`')

      const patchComplete = await updateOnly
        .from('vehicle_maintenances')
        .update({ status: 'COMPLETED' })
        .eq('id', maintenanceId)
      check(refused(patchComplete), 'PATCH direct vers « Terminée » refusé de même')

      const { data: stillOpen } = await admin
        .from('vehicle_maintenances')
        .select('status')
        .eq('id', maintenanceId)
        .maybeSingle()
      check(
        stillOpen?.status === 'IN_PROGRESS',
        'La maintenance est restée « En cours »',
        stillOpen?.status
      )

      const done = await strong.rpc('complete_maintenance', { p_maintenance_id: maintenanceId })
      check(!refused(done), 'La capacité `close` termine l’intervention', done.error?.message ?? '')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CALENDRIER — UNE CAPACITÉ NE LÈVE PAS L’ENGAGEMENT D’UNE AUTRE\n')

    {
      const strong = await session('operateur')

      // Une immobilisation de maintenance, bien réelle.
      const { data: created } = await strong.rpc('create_maintenance', {
        p_vehicle_id: fixtures.vehicleIds[3],
        p_origin: 'INSPECTION',
        p_reason: `${MARK} — immobilisation`,
        p_immobilization_from: new Date(Date.now() - 3600e3).toISOString(),
        p_immobilization_to: new Date(Date.now() + 5 * 864e5).toISOString(),
      })
      const blocking = String(created)
      fixtures.maintenances.push(blocking)

      const { data: occupation } = await admin
        .from('vehicle_occupations')
        .select('id')
        .eq('source', 'MAINTENANCE')
        .eq('source_id', blocking)
        .maybeSingle()

      // Un porteur de `rentals.checkout` pouvait, avant, libérer n'importe
      // quelle occupation : c'est-à-dire remettre en location un véhicule au
      // garage.
      const weak = await session('loc_checkout')
      const release = await weak
        .from('vehicle_occupations')
        .update({ is_active: false, released_at: new Date().toISOString() })
        .eq('id', occupation.id)
      check(
        refused(release),
        'Une capacité de location ne lève pas une immobilisation de maintenance'
      )

      const { data: intact } = await admin
        .from('vehicle_occupations')
        .select('is_active')
        .eq('id', occupation.id)
        .maybeSingle()
      check(intact?.is_active === true, 'L’immobilisation tient toujours')

      // Et poser une immobilisation sans capacité de maintenance est refusé.
      const forge = await weak.from('vehicle_occupations').insert({
        vehicle_id: fixtures.vehicleIds[4],
        source: 'MAINTENANCE',
        source_id: blocking,
        period: `[${new Date().toISOString()},${new Date(Date.now() + 864e5).toISOString()})`,
        reason: 'forgée',
      })
      check(refused(forge), 'Ni n’en pose une sans capacité de maintenance')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('COÛTS — VOIR, SAISIR ET DÉCIDER SONT TROIS DROITS\n')

    {
      const strong = await session('operateur')

      const { data: created } = await strong.rpc('create_maintenance', {
        p_vehicle_id: fixtures.vehicleIds[4],
        p_origin: 'BREAKDOWN',
        p_reason: `${MARK} — coûts`,
      })
      const costed = String(created)
      fixtures.maintenances.push(costed)

      await strong.rpc('record_maintenance_costs', {
        p_maintenance_id: costed,
        p_estimated_cost: 250000,
        p_actual_cost: 300000,
        p_imputable_amount: 200000,
      })

      // --- Lire un montant exige `cost.view`, que `maintenance.view` ne donne pas.
      const noFinance = await session('mnt_update')
      const blindRead = await noFinance
        .from('maintenance_costs')
        .select('actual_cost')
        .eq('maintenance_id', costed)
      check(
        (blindRead.data?.length ?? 0) === 0,
        'RLS ne livre aucun montant sans `cost.view`',
        'la maintenance reste lisible, pas son prix'
      )

      // --- Écrire un montant exige `cost.update`, que `cost.view` ne donne pas.
      const readOnly = await session('mnt_cost_view')
      const seen = await readOnly
        .from('maintenance_costs')
        .select('actual_cost')
        .eq('maintenance_id', costed)
        .maybeSingle()
      check(seen.data?.actual_cost === 300000, 'Avec `cost.view`, le montant est lisible')

      const writeAttempt = await readOnly.rpc('record_maintenance_costs', {
        p_maintenance_id: costed,
        p_actual_cost: 999000,
      })
      check(refused(writeAttempt), 'record_maintenance_costs refusée sans `cost.update`')

      /*
       * Le `PATCH` direct ne lève PAS d'erreur : la clause `using` de la policy
       * filtre la ligne, et l'écriture ne touche rien. C'est la protection
       * attendue — mais elle est silencieuse, d'où le contrôle qui suit : la
       * seule preuve qui vaille est que la valeur n'a pas bougé.
       */
      const patchAttempt = await readOnly
        .from('maintenance_costs')
        .update({ actual_cost: 999000 })
        .eq('maintenance_id', costed)
        .select('actual_cost')

      check(
        refused(patchAttempt) || (patchAttempt.data?.length ?? 0) === 0,
        'PATCH direct sur un montant sans effet',
        refused(patchAttempt) ? 'refus explicite' : 'aucune ligne modifiée'
      )

      const { data: intact } = await admin
        .from('maintenance_costs')
        .select('actual_cost')
        .eq('maintenance_id', costed)
        .maybeSingle()
      check(intact?.actual_cost === 300000, 'Le montant n’a pas bougé', `${intact?.actual_cost}`)

      // --- Écrire un montant ne permet PAS de décider d'un devis (arbitrage L2).
      const editor = await session('mnt_cost_edit')
      const { data: quoteId } = await editor.rpc('add_maintenance_quote', {
        p_maintenance_id: costed,
        p_amount: 280000,
      })
      check(Boolean(quoteId), 'Avec `cost.update`, un devis s’enregistre')

      const decideAttempt = await editor.rpc('decide_maintenance_quote', {
        p_quote_id: String(quoteId),
        p_accept: true,
      })
      check(refused(decideAttempt), 'decide_maintenance_quote refusée sans `validate`')

      const patchDecision = await editor
        .from('maintenance_quotes')
        .update({ status: 'ACCEPTED', decided_at: new Date().toISOString() })
        .eq('id', String(quoteId))
      check(refused(patchDecision), 'PATCH direct de la décision refusé de même')

      const { data: stillOpen } = await admin
        .from('maintenance_quotes')
        .select('status')
        .eq('id', String(quoteId))
        .maybeSingle()
      check(stillOpen?.status === 'PROPOSED', 'Le devis est resté « Proposé »', stillOpen?.status)

      // --- Et le porteur légitime décide.
      const decided = await strong.rpc('decide_maintenance_quote', {
        p_quote_id: String(quoteId),
        p_accept: true,
      })
      check(!refused(decided), 'La capacité `validate` décide du devis', decided.error?.message ?? '')

      // --- Décider ne recopie aucun montant (DEC-008).
      const { data: unchanged } = await admin
        .from('maintenance_costs')
        .select('estimated_cost, actual_cost')
        .eq('maintenance_id', costed)
        .maybeSingle()
      check(
        unchanged?.estimated_cost === 250000 && unchanged?.actual_cost === 300000,
        'Accepter un devis (280 000) ne recopie rien dans les coûts'
      )

      // --- Un justificatif ne s'ouvre pas sans `cost.view`.
      const { data: document } = await admin
        .from('maintenance_documents')
        .insert({
          maintenance_id: costed,
          doc_type: 'INVOICE',
          label: `${MARK} — facture`,
          storage_path: `maintenances/${costed}/audit-${STAMP}.pdf`,
          file_name: 'audit.pdf',
        })
        .select('id')
        .single()

      const blindDoc = await noFinance
        .from('maintenance_documents')
        .select('id')
        .eq('id', document.id)
      check(
        (blindDoc.data?.length ?? 0) === 0,
        'RLS ne livre aucun justificatif financier sans `cost.view`'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('IMPUTATIONS — CINQ ACTES, CINQ CAPACITÉS (LOT 4)\n')

    {
      const owner = await session('imp_full')

      // Une maintenance sur le véhicule FOURNI, avec un montant imputable.
      const { data: created } = await owner.rpc('create_maintenance', {
        p_vehicle_id: fixtures.suppliedVehicleId,
        p_origin: 'BREAKDOWN',
        p_reason: `${MARK} — imputation`,
      })
      const imputable = String(created)
      fixtures.maintenances.push(imputable)

      await owner.rpc('record_maintenance_costs', {
        p_maintenance_id: imputable,
        p_actual_cost: 300000,
        p_imputable_amount: 300000,
      })

      /* --- CRÉER : ni une capacité de maintenance, ni une autre du domaine. */
      const mntEditor = await session('mnt_cost_edit')
      const forgedByMaintenance = await mntEditor.rpc('create_imputation', {
        p_maintenance_id: imputable,
        p_supplier_id: fixtures.supplierId,
        p_amount: 100000,
        p_justification: 'Tentative depuis une capacité de maintenance',
      })
      check(
        refused(forgedByMaintenance),
        'create_imputation refusée à `maintenance.cost.update`',
        'imputer n’est pas une capacité de maintenance'
      )

      const viewer = await session('imp_view')
      const createByViewer = await viewer.rpc('create_imputation', {
        p_maintenance_id: imputable,
        p_supplier_id: fixtures.supplierId,
        p_amount: 100000,
        p_justification: 'Tentative avec la seule lecture',
      })
      check(refused(createByViewer), 'create_imputation refusée sans `imputations.create`')

      // Et par INSERT direct sur la table, hors de toute fonction.
      const forgeInsert = await viewer.from('imputations').insert({
        imputation_no: `IMP-FORGE-${STAMP}`,
        maintenance_id: imputable,
        supplier_id: fixtures.supplierId,
        amount: 100000,
        justification: 'Insertion directe',
      })
      check(refused(forgeInsert), 'INSERT direct dans `imputations` refusé de même')

      /* --- CRÉER exige AUSSI de pouvoir lire le plafond (Module 07 §41). */
      const validator = await session('imp_validate')
      const blindCeiling = await validator.rpc('create_imputation', {
        p_maintenance_id: imputable,
        p_supplier_id: fixtures.supplierId,
        p_amount: 100000,
        p_justification: 'Tentative sans lecture du plafond',
      })
      check(
        refused(blindCeiling),
        'create_imputation refusée sans `maintenance.cost.view`',
        'on n’impute pas une dépense qu’on n’a pas le droit de voir'
      )

      /* --- Le porteur exact, lui, passe. */
      const creator = await session('imp_create')
      const { data: madeId, error: madeError } = await creator.rpc('create_imputation', {
        p_maintenance_id: imputable,
        p_supplier_id: fixtures.supplierId,
        p_amount: 200000,
        p_justification: 'Panne mécanique imputable selon les conditions de mise à disposition.',
      })
      check(!refused({ error: madeError }), 'La capacité `create` prépare l’imputation',
        madeError?.message ?? '')
      const impId = String(madeId)
      if (madeId) fixtures.imputations.push(impId)

      /* --- LE PLAFOND, contrôlé côté serveur (Module 07 §40 et §41). */
      const overflow = await creator.rpc('create_imputation', {
        p_maintenance_id: imputable,
        p_supplier_id: fixtures.supplierId,
        p_amount: 100001,
        p_justification: 'Dépassement volontaire du montant imputable.',
      })
      check(refused(overflow), 'Le plafond imputable refuse le dépassement au KMF près')

      /* --- SOUMETTRE relève de `update`, jamais de `validate`. */
      const submitByValidator = await validator.rpc('submit_imputation', {
        p_imputation_id: impId,
      })
      check(refused(submitByValidator), 'submit_imputation refusée sans `imputations.update`')

      const patchSubmit = await validator
        .from('imputations')
        .update({ status: 'TO_VALIDATE' })
        .eq('id', impId)
      check(refused(patchSubmit), 'PATCH direct vers « À valider » refusé de même')

      const updater = await session('imp_update')
      const submitted = await updater.rpc('submit_imputation', { p_imputation_id: impId })
      check(!refused(submitted), 'La capacité `update` soumet à validation',
        submitted.error?.message ?? '')

      /* --- VALIDER : ni `create`, ni `update`, ni une capacité de maintenance. */
      const validateByUpdater = await updater.rpc('validate_imputation', {
        p_imputation_id: impId,
      })
      check(refused(validateByUpdater), 'validate_imputation refusée sans `imputations.validate`')

      const patchValidate = await updater
        .from('imputations')
        .update({ status: 'VALIDATED', validated_at: new Date().toISOString() })
        .eq('id', impId)
      check(refused(patchValidate), 'PATCH direct vers « Validée » refusé de même')

      const validateByMaintenance = await mntEditor.rpc('validate_imputation', {
        p_imputation_id: impId,
      })
      check(
        refused(validateByMaintenance),
        'Ni `maintenance.validate` ni `maintenance.close` ne valident une imputation'
      )

      const { data: stillPending } = await admin
        .from('imputations')
        .select('status')
        .eq('id', impId)
        .maybeSingle()
      check(stillPending?.status === 'TO_VALIDATE', 'L’imputation n’a pas bougé',
        stillPending?.status)

      const validated = await validator.rpc('validate_imputation', {
        p_imputation_id: impId,
        p_reason: 'Conforme aux conditions',
      })
      check(!refused(validated), 'La capacité `validate` valide l’imputation',
        validated.error?.message ?? '')

      /* --- LA FRONTIÈRE DE L'ÉTAPE 2.5 (DEC-013). */
      const owner2 = await session('imp_full')

      const toImputed = await owner2
        .from('imputations')
        .update({ status: 'IMPUTED' })
        .eq('id', impId)
      check(
        refused(toImputed),
        '« Imputée » ne se DÉCLARE pas : elle suppose une facture rattachée (DEC-013)'
      )

      const forgeInvoice = await owner2
        .from('imputations')
        .update({ supplier_invoice_id: crypto.randomUUID() })
        .eq('id', impId)
      check(refused(forgeInvoice), 'Rattacher une facture forgée est refusé')

      const { data: intactImp } = await admin
        .from('imputations')
        .select('status, supplier_invoice_id')
        .eq('id', impId)
        .maybeSingle()
      check(
        intactImp?.status === 'VALIDATED' && intactImp?.supplier_invoice_id === null,
        'L’imputation reste « Validée », sans facture',
        `${intactImp?.status}`
      )

      /* --- VERROU après validation (Workflow 06 §39). */
      const lateEdit = await updater.rpc('update_imputation', {
        p_imputation_id: impId,
        p_amount: 150000,
        p_justification: 'Correction après validation, refusée.',
      })
      check(refused(lateEdit), 'Une imputation validée ne se modifie plus')

      const latePatch = await owner2.from('imputations').update({ amount: 150000 }).eq('id', impId)
      check(refused(latePatch), 'PATCH direct du montant refusé de même')

      /* --- ANNULER exige `cancel`, et rien d'autre. */
      const cancelByUpdater = await updater.rpc('cancel_imputation', { p_imputation_id: impId })
      check(refused(cancelByUpdater), 'cancel_imputation refusée sans `imputations.cancel`')

      const patchCancel = await updater
        .from('imputations')
        .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
        .eq('id', impId)
      check(refused(patchCancel), 'PATCH direct vers « Annulée » refusé de même')

      const canceller = await session('imp_cancel')
      const cancelled = await canceller.rpc('cancel_imputation', {
        p_imputation_id: impId,
        p_reason: 'Erreur constatée',
      })
      check(!refused(cancelled), 'La capacité `cancel` annule l’imputation',
        cancelled.error?.message ?? '')

      /* --- LECTURE : le montant d'une imputation n'est pas un coût. */
      const noBilling = await session('mnt_cost_edit')
      const blindRead = await noBilling.from('imputations').select('id').eq('id', impId)
      check(
        (blindRead.data?.length ?? 0) === 0,
        'RLS ne livre aucune imputation sans `billing.imputations.view`'
      )

      const seen = await viewer.from('imputations').select('amount').eq('id', impId).maybeSingle()
      check(seen.data?.amount === 200000, 'Avec `imputations.view`, l’imputation est lisible')

      // Et voir une imputation ne donne pas accès au coût de la maintenance.
      const blindCost = await viewer
        .from('maintenance_costs')
        .select('actual_cost')
        .eq('maintenance_id', imputable)
      check(
        (blindCost.data?.length ?? 0) === 0,
        '`imputations.view` ne donne pas accès aux coûts de maintenance'
      )

      /* --- SUPPRESSION : jamais. */
      const removal = await owner2.from('imputations').delete().eq('id', impId)
      check(refused(removal) || (await stillThere(admin, impId)), 'Aucune suppression possible')

      /* --- AUCUN EFFET SUR L'ÉTAPE 2.5. */
      const { data: costsIntact } = await admin
        .from('maintenance_costs')
        .select('imputable_amount, actual_cost')
        .eq('maintenance_id', imputable)
        .maybeSingle()
      check(
        costsIntact?.imputable_amount === 300000 && costsIntact?.actual_cost === 300000,
        'Le cycle complet n’a modifié aucun montant du LOT 3'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('FACTURES FOURNISSEURS — CINQ ACTES, CINQ CAPACITÉS (LOT 5)\n')

    {
      const creator = await session('inv_create')
      const viewer = await session('inv_view')
      const updater = await session('inv_update')
      const validator = await session('inv_validate')
      const canceller = await session('inv_cancel')
      const owner = await session('inv_full')

      /* --- CRÉER exige `create`, et rien d'autre. */
      const createByViewer = await viewer.rpc('create_supplier_invoice', {
        p_supplier_id: fixtures.supplierId,
        p_invoice_date: '2026-08-01',
      })
      check(refused(createByViewer), 'create_supplier_invoice refusée sans `supplier_invoices.create`')

      const createByUpdater = await updater.rpc('create_supplier_invoice', {
        p_supplier_id: fixtures.supplierId,
        p_invoice_date: '2026-08-01',
      })
      check(
        refused(createByUpdater),
        '`supplier_invoices.update` ne crée pas une facture',
        'modifier n’est pas enregistrer'
      )

      const forgeInsert = await viewer.from('supplier_invoices').insert({
        invoice_no: `FAC-F-FORGE-${STAMP}`,
        supplier_id: fixtures.supplierId,
        invoice_date: '2026-08-01',
      })
      check(refused(forgeInsert), 'INSERT direct dans `supplier_invoices` refusé de même')

      const { data: madeId, error: madeError } = await creator.rpc('create_supplier_invoice', {
        p_supplier_id: fixtures.supplierId,
        p_invoice_date: '2026-08-01',
        p_due_date: '2026-09-01',
        p_external_ref: `FRN-${STAMP}`,
        p_notes: `${MARK} — facture`,
      })
      check(!refused({ error: madeError }), 'La capacité `create` enregistre la facture',
        madeError?.message ?? '')

      const invId = String(madeId)
      if (madeId) fixtures.invoices.push(invId)

      /* --- UNE FACTURE NAÎT EN BROUILLON, y compris par INSERT direct. */
      const bornValidated = await creator.from('supplier_invoices').insert({
        invoice_no: `FAC-F-FORGE2-${STAMP}`,
        supplier_id: fixtures.supplierId,
        invoice_date: '2026-08-01',
        status: 'VALIDATED',
        validated_at: new Date().toISOString(),
      })
      check(
        refused(bornValidated),
        'Une facture ne naît pas validée : `validate` n’est pas contournable par INSERT'
      )

      /* --- LES LIGNES relèvent de la saisie. */
      const lineByValidator = await validator.rpc('add_supplier_invoice_line', {
        p_invoice_id: invId,
        p_label: 'Tentative',
        p_amount: 100000,
      })
      check(refused(lineByValidator), 'add_supplier_invoice_line refusée à `validate` seul')

      const lineOk = await creator.rpc('add_supplier_invoice_line', {
        p_invoice_id: invId,
        p_label: `${MARK} — mise à disposition`,
        p_amount: 500000,
      })
      check(!refused(lineOk), 'La capacité `create` chiffre la facture', lineOk.error?.message ?? '')

      /* --- SOUMETTRE relève de `update`. */
      const submitByValidator = await validator.rpc('submit_supplier_invoice', {
        p_invoice_id: invId,
      })
      check(refused(submitByValidator), 'submit_supplier_invoice refusée sans `update`')

      const submitted = await updater.rpc('submit_supplier_invoice', { p_invoice_id: invId })
      check(!refused(submitted), 'La capacité `update` soumet au contrôle',
        submitted.error?.message ?? '')

      /* --- VALIDER exige `validate`, et le PATCH direct ne l'esquive pas. */
      const validateByUpdater = await updater.rpc('validate_supplier_invoice', {
        p_invoice_id: invId,
      })
      check(refused(validateByUpdater), 'validate_supplier_invoice refusée sans `validate`')

      const patchValidate = await updater
        .from('supplier_invoices')
        .update({ status: 'VALIDATED', validated_at: new Date().toISOString() })
        .eq('id', invId)
      check(refused(patchValidate), 'PATCH direct vers « Validée » refusé de même')

      const validated = await validator.rpc('validate_supplier_invoice', {
        p_invoice_id: invId,
        p_reason: 'Contrôlée',
      })
      check(!refused(validated), 'La capacité `validate` reconnaît la dette',
        validated.error?.message ?? '')

      /* --- LES ÉTATS DE RÈGLEMENT NE SE DÉCLARENT PAS. */
      const declarePaid = await owner
        .from('supplier_invoices')
        .update({ status: 'PAID' })
        .eq('id', invId)
      check(
        refused(declarePaid),
        '« Payée » reste hors d’atteinte : elle découle de règlements, non gérés'
      )

      const declareOverdue = await owner
        .from('supplier_invoices')
        .update({ status: 'OVERDUE' })
        .eq('id', invId)
      check(refused(declareOverdue), '« En retard » ne s’écrit pas : il se calcule (DEC-025 §a)')

      /* --- LES LIGNES SONT FIGÉES après validation. */
      const lateLine = await updater.rpc('add_supplier_invoice_line', {
        p_invoice_id: invId,
        p_label: 'Ligne ajoutée après coup',
        p_amount: 50000,
      })
      check(refused(lateLine), 'Aucune ligne ne s’ajoute à une facture validée')

      /* --- RATTACHER : `imputations.update` ET les deux lectures. */
      const owner2 = await session('imp_full')
      const { data: mntId } = await owner2.rpc('create_maintenance', {
        p_vehicle_id: fixtures.suppliedVehicleId,
        p_origin: 'BREAKDOWN',
        p_reason: `${MARK} — rattachement`,
      })
      fixtures.maintenances.push(String(mntId))

      await owner2.rpc('record_maintenance_costs', {
        p_maintenance_id: mntId,
        p_actual_cost: 300000,
        p_imputable_amount: 300000,
      })

      const { data: impToAttach } = await owner2.rpc('create_imputation', {
        p_maintenance_id: mntId,
        p_supplier_id: fixtures.supplierId,
        p_amount: 300000,
        p_justification: `${MARK} — rattachement à la facture`,
      })
      fixtures.imputations.push(String(impToAttach))
      await owner2.rpc('submit_imputation', { p_imputation_id: impToAttach })

      const impValidator = await session('imp_validate')
      await impValidator.rpc('validate_imputation', { p_imputation_id: impToAttach })

      const attachByValidator = await impValidator.rpc('attach_imputation_to_invoice', {
        p_imputation_id: impToAttach,
        p_invoice_id: invId,
      })
      check(
        refused(attachByValidator),
        'attach_imputation_to_invoice refusée à `imputations.validate`',
        'valider n’est pas rattacher'
      )

      const blindInvoice = await session('imp_blind_invoice')
      const attachBlind = await blindInvoice.rpc('attach_imputation_to_invoice', {
        p_imputation_id: impToAttach,
        p_invoice_id: invId,
      })
      check(
        refused(attachBlind),
        'Rattacher est refusé sans `supplier_invoices.view`',
        'un plafond invisible n’est pas un plafond infini'
      )

      const attached = await owner.rpc('attach_imputation_to_invoice', {
        p_imputation_id: impToAttach,
        p_invoice_id: invId,
      })
      check(!refused(attached), 'Avec les trois capacités, le rattachement aboutit',
        attached.error?.message ?? '')

      const { data: nowImputed } = await admin
        .from('imputations')
        .select('status, supplier_invoice_id')
        .eq('id', impToAttach)
        .maybeSingle()
      check(
        nowImputed?.status === 'IMPUTED' && nowImputed?.supplier_invoice_id === invId,
        'L’imputation est « Imputée » et porte sa facture',
        `${nowImputed?.status}`
      )

      /* --- ANNULER : `cancel`, et jamais sur une facture encore réduite. */
      const cancelByUpdater = await updater.rpc('cancel_supplier_invoice', {
        p_invoice_id: invId,
      })
      check(refused(cancelByUpdater), 'cancel_supplier_invoice refusée sans `cancel`')

      const cancelWithImputation = await canceller.rpc('cancel_supplier_invoice', {
        p_invoice_id: invId,
        p_reason: 'Tentative',
      })
      check(
        refused(cancelWithImputation),
        'Une facture portant une imputation ne s’annule pas',
        'la déduction doit d’abord en être détachée'
      )

      /* --- DÉTACHER relève d'`imputations.update`. */
      const detachByValidator = await impValidator.rpc('detach_imputation_from_invoice', {
        p_imputation_id: impToAttach,
      })
      check(refused(detachByValidator), 'detach_imputation_from_invoice refusée à `validate`')

      const detached = await owner.rpc('detach_imputation_from_invoice', {
        p_imputation_id: impToAttach,
        p_reason: 'Recette',
      })
      check(!refused(detached), 'La capacité `imputations.update` détache',
        detached.error?.message ?? '')

      const cancelled = await canceller.rpc('cancel_supplier_invoice', {
        p_invoice_id: invId,
        p_reason: 'Facture reçue en double',
      })
      check(!refused(cancelled), 'Détachée, la facture s’annule', cancelled.error?.message ?? '')

      /* --- LECTURE ET SUPPRESSION. */
      const noInvoice = await session('imp_full')
      const blindRead = await noInvoice.from('supplier_invoices').select('id').eq('id', invId)
      check(
        (blindRead.data?.length ?? 0) === 0,
        'RLS ne livre aucune facture sans `supplier_invoices.view`'
      )

      const seen = await viewer
        .from('supplier_invoices')
        .select('invoice_no')
        .eq('id', invId)
        .maybeSingle()
      check(Boolean(seen.data?.invoice_no), 'Avec `supplier_invoices.view`, la facture est lisible')

      const removal = await owner.from('supplier_invoices').delete().eq('id', invId)
      const { data: stillHere } = await admin
        .from('supplier_invoices')
        .select('id')
        .eq('id', invId)
        .maybeSingle()
      check(refused(removal) || Boolean(stillHere), 'Aucune suppression possible')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('BANQUES & CAISSES — ET LES RÈGLEMENTS (LOT 6)\n')

    {
      const accViewer = await session('acc_view')
      const accCreator = await session('acc_create')
      const accUpdater = await session('acc_update')
      const accArchiver = await session('acc_archive')
      const balViewer = await session('acc_balance')
      const owner = await session('pay_full')

      /* --- OUVRIR UN COMPTE exige `accounts.create`. */
      const openByViewer = await accViewer.rpc('create_financial_account', {
        p_kind: 'BANK',
        p_label: `${MARK} — tentative`,
      })
      check(refused(openByViewer), 'create_financial_account refusée sans `accounts.create`')

      const openByUpdater = await accUpdater.rpc('create_financial_account', {
        p_kind: 'BANK',
        p_label: `${MARK} — tentative`,
      })
      check(
        refused(openByUpdater),
        '`accounts.update` n’ouvre pas un compte',
        'modifier n’est pas ouvrir'
      )

      const forgeAccount = await accViewer.from('financial_accounts').insert({
        account_no: `COMP-FORGE-${STAMP}`,
        kind: 'BANK',
        label: 'Compte forgé',
      })
      check(refused(forgeAccount), 'INSERT direct dans `financial_accounts` refusé de même')

      const { data: accId, error: accError } = await accCreator.rpc('create_financial_account', {
        p_kind: 'BANK',
        p_label: `${MARK} — Banque`,
        p_opening_balance: 1000000,
      })
      check(!refused({ error: accError }), 'La capacité `create` ouvre le compte',
        accError?.message ?? '')

      const accountId = String(accId)
      if (accId) fixtures.accounts.push(accountId)

      /* --- VOIR UN COMPTE N'EST PAS VOIR SON SOLDE (DEC-024). */
      const blindBalance = await accViewer.rpc('financial_account_balance', {
        p_account_id: accountId,
      })
      check(
        refused(blindBalance),
        'financial_account_balance refusée sans `treasury.balances.view`',
        'voir un compte n’est pas voir ce qu’il contient'
      )

      const seenBalance = await balViewer.rpc('financial_account_balance', {
        p_account_id: accountId,
      })
      check(
        !refused(seenBalance) && seenBalance.data === 1000000,
        'Avec `balances.view`, le solde est calculé',
        `${seenBalance.data}`
      )

      /* --- STATUT : `archive`, et rien d'autre. */
      const archiveByUpdater = await accUpdater.rpc('set_financial_account_status', {
        p_account_id: accountId,
        p_status: 'ARCHIVED',
      })
      check(refused(archiveByUpdater), 'set_financial_account_status refusée sans `archive`')

      const archived = await accArchiver.rpc('set_financial_account_status', {
        p_account_id: accountId,
        p_status: 'ARCHIVED',
        p_reason: 'Audit',
      })
      check(!refused(archived), 'La capacité `archive` change le statut',
        archived.error?.message ?? '')

      // Réactivé pour la suite : un compte archivé ne reçoit plus rien.
      await accArchiver.rpc('set_financial_account_status', {
        p_account_id: accountId,
        p_status: 'ACTIVE',
        p_reason: 'Audit',
      })

      /* --- UNE FACTURE VALIDÉE, À RÉGLER. */
      const { data: payInvId } = await owner.rpc('create_supplier_invoice', {
        p_supplier_id: fixtures.supplierId,
        p_invoice_date: '2026-08-01',
        p_external_ref: `FRN-CAP-${STAMP}`,
        p_notes: `${MARK} — à régler`,
      })
      const payInvoiceId = String(payInvId)
      if (payInvId) fixtures.invoices.push(payInvoiceId)

      await owner.rpc('add_supplier_invoice_line', {
        p_invoice_id: payInvoiceId,
        p_label: `${MARK} — prestation`,
        p_amount: 200000,
      })
      await owner.rpc('submit_supplier_invoice', { p_invoice_id: payInvoiceId })
      await owner.rpc('validate_supplier_invoice', { p_invoice_id: payInvoiceId })

      /* --- RÉGLER exige `supplier_payments.create` ET quatre lectures. */
      const payByViewer = await session('pay_view')
      const refusedCreate = await payByViewer.rpc('record_supplier_payment', {
        p_invoice_id: payInvoiceId,
        p_account_id: accountId,
        p_amount: 1000,
        p_paid_on: '2026-08-15',
        p_method: 'CASH',
      })
      check(refusedCreate.error !== null, 'record_supplier_payment refusée sans `payments.create`')

      const blindAccount = await session('pay_blind_account')
      const refusedBlindAccount = await blindAccount.rpc('record_supplier_payment', {
        p_invoice_id: payInvoiceId,
        p_account_id: accountId,
        p_amount: 1000,
        p_paid_on: '2026-08-15',
        p_method: 'CASH',
      })
      check(
        refused(refusedBlindAccount),
        'Régler est refusé sans `treasury.accounts.view`',
        'on ne débite pas un compte qu’on ne voit pas'
      )

      const blindImputation = await session('pay_blind_imputation')
      const refusedBlindImputation = await blindImputation.rpc('record_supplier_payment', {
        p_invoice_id: payInvoiceId,
        p_account_id: accountId,
        p_amount: 1000,
        p_paid_on: '2026-08-15',
        p_method: 'CASH',
      })
      check(
        refused(refusedBlindImputation),
        'Et refusé sans `billing.imputations.view`',
        'le net à payer en dépend (§22)'
      )

      const forgePayment = await payByViewer.from('supplier_payments').insert({
        payment_no: `REG-FORGE-${STAMP}`,
        supplier_invoice_id: payInvoiceId,
        account_id: accountId,
        amount: 1000,
        paid_on: '2026-08-15',
        method: 'CASH',
      })
      check(refused(forgePayment), 'INSERT direct dans `supplier_payments` refusé de même')

      /*
       * LE CONTRÔLE POSITIF SE FAIT AU PROFIL MINIMAL.
       *
       * Un compte complet réussirait pour de mauvaises raisons : il détient
       * aussi les capacités d'écriture de la facture. Régler n'en suppose
       * aucune (migration 051), et c'est ce que ce contrôle prouve.
       */
      const payer = await session('pay_minimal')
      const paid = await payer.rpc('record_supplier_payment', {
        p_invoice_id: payInvoiceId,
        p_account_id: accountId,
        p_amount: 120000,
        p_paid_on: '2026-08-15',
        p_method: 'BANK_TRANSFER',
        p_external_ref: `VIR-${STAMP}`,
      })
      check(
        !refused(paid),
        'Les cinq capacités suffisent : régler n’exige aucun droit sur la facture',
        paid.error?.message ?? ''
      )

      const paymentId = String(paid.data)
      if (paid.data) fixtures.payments.push(paymentId)

      /* --- L'ÉCRITURE EST LA CONSÉQUENCE DU RÈGLEMENT. */
      const { data: entry } = await admin
        .from('treasury_entries')
        .select('direction, kind, amount, account_id, status')
        .eq('supplier_payment_id', paymentId)
        .maybeSingle()
      check(
        entry?.direction === 'OUT' && entry?.amount === 120000 && entry?.account_id === accountId,
        'Le règlement a produit une SORTIE du montant réglé (§47)',
        `${entry?.direction} ${entry?.amount}`
      )

      const { data: afterPayment } = await balViewer.rpc('financial_account_balance', {
        p_account_id: accountId,
      })
      check(afterPayment === 880000, 'Le compte est débité : 1 000 000 → 880 000', `${afterPayment}`)

      /* --- UNE ÉCRITURE FORGÉE EST REFUSÉE. */
      const forgeEntry = await owner.from('treasury_entries').insert({
        account_id: accountId,
        entry_date: '2026-08-15',
        direction: 'IN',
        kind: 'SUPPLIER_PAYMENT',
        amount: 999999,
        supplier_payment_id: paymentId,
      })
      check(
        refused(forgeEntry),
        'Une écriture contredisant son règlement est refusée',
        'même au porteur de toutes les capacités du domaine'
      )

      const freeEntry = await owner.from('treasury_entries').insert({
        account_id: accountId,
        entry_date: '2026-08-15',
        direction: 'IN',
        kind: 'DEPOSIT',
        amount: 50000,
      })
      check(
        refused(freeEntry),
        'Et une écriture LIBRE exige `treasury.entries.create`',
        'aucun écran ne la produit'
      )

      /* --- ANNULER exige `supplier_payments.cancel`. */
      const cancelByCreator = await blindAccount.rpc('cancel_supplier_payment', {
        p_payment_id: paymentId,
      })
      check(refused(cancelByCreator), 'cancel_supplier_payment refusée sans `payments.cancel`')

      /*
       * Le `PATCH` direct ne rencontre AUCUNE ligne : la policy d'UPDATE exige
       * `payments.cancel`, que ce profil n'a pas. PostgREST ne renvoie alors
       * pas d'erreur — il ne modifie simplement rien. La preuve est donc l'état
       * de la ligne, pas le code de retour.
       */
      await payByViewer
        .from('supplier_payments')
        .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
        .eq('id', paymentId)

      const { data: untouched } = await admin
        .from('supplier_payments')
        .select('status')
        .eq('id', paymentId)
        .maybeSingle()
      check(
        untouched?.status === 'VALIDATED',
        'PATCH direct vers « Annulé » sans effet de même',
        `${untouched?.status}`
      )

      const cancelled = await owner.rpc('cancel_supplier_payment', {
        p_payment_id: paymentId,
        p_reason: 'Audit',
      })
      check(!refused(cancelled), 'La capacité `cancel` annule le règlement',
        cancelled.error?.message ?? '')

      const { data: afterCancel } = await balViewer.rpc('financial_account_balance', {
        p_account_id: accountId,
      })
      check(afterCancel === 1000000, 'Le solde du compte remonte', `${afterCancel}`)

      /* --- LECTURE ET SUPPRESSION. */
      const noTreasury = await session('imp_full')
      const blindRead = await noTreasury.from('financial_accounts').select('id').eq('id', accountId)
      check(
        (blindRead.data?.length ?? 0) === 0,
        'RLS ne livre aucun compte sans `treasury.accounts.view`'
      )

      const blindEntries = await accViewer.from('treasury_entries').select('id').limit(1)
      check(
        (blindEntries.data?.length ?? 0) === 0,
        '`accounts.view` ne donne pas accès aux écritures'
      )

      const removal = await owner.from('supplier_payments').delete().eq('id', paymentId)
      const { data: stillHere } = await admin
        .from('supplier_payments')
        .select('id')
        .eq('id', paymentId)
        .maybeSingle()
      check(refused(removal) || Boolean(stillHere), 'Aucune suppression possible')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('FACTURE CLIENT ET CLÔTURE (LOT 7)\n')

    {
      const viewer = await session('cli_view')
      const creator = await session('cli_create')
      const updater = await session('cli_update')
      const issuer = await session('cli_issue')
      const canceller = await session('cli_cancel')
      const owner = await session('cli_full')
      const closer = await session('loc_close')
      const blind = await session('cli_blind_rental')

      const rentalId = await makeInvoiceableRental(5, 400)

      /* --- PRÉPARER exige `customer_invoices.create`. */
      const createByViewer = await viewer.rpc('create_customer_invoice', {
        p_client_id: fixtures.clientId,
        p_invoice_date: '2026-09-01',
      })
      check(refused(createByViewer), 'create_customer_invoice refusée sans `customer_invoices.create`')

      const createByUpdater = await updater.rpc('create_customer_invoice', {
        p_client_id: fixtures.clientId,
        p_invoice_date: '2026-09-01',
      })
      check(
        refused(createByUpdater),
        '`customer_invoices.update` ne prépare pas une facture',
        'modifier n’est pas créer'
      )

      const forgeInvoice = await viewer.from('customer_invoices').insert({
        invoice_no: `FAC-C-FORGE-${STAMP}`,
        client_id: fixtures.clientId,
        invoice_date: '2026-09-01',
      })
      check(refused(forgeInvoice), 'INSERT direct dans `customer_invoices` refusé de même')

      /* --- FACTURER UNE LOCATION QU'ON NE VOIT PAS EST REFUSÉ. */
      const blindCreate = await blind.rpc('create_customer_invoice', {
        p_client_id: fixtures.clientId,
        p_invoice_date: '2026-09-01',
        p_rental_id: rentalId,
      })
      check(
        refused(blindCreate),
        'Facturer une location est refusé sans `rental.rentals.view`',
        'on ne facture pas un contrat qu’on ne peut pas lire'
      )

      /* --- LE CONTRÔLE POSITIF. */
      const prepared = await creator.rpc('create_customer_invoice', {
        p_client_id: fixtures.clientId,
        p_invoice_date: '2026-09-01',
        p_due_date: '2026-09-30',
        p_rental_id: rentalId,
        p_notes: `${MARK} — facture`,
      })
      check(
        !refused(prepared),
        'La capacité `create` prépare la facture',
        prepared.error?.message ?? ''
      )

      const invoiceId = String(prepared.data)
      if (prepared.data) fixtures.customerInvoices.push(invoiceId)

      /* --- PRÉPARER NE FACTURE RIEN : la location n'a pas bougé. */
      const { data: stillToInvoice } = await admin
        .from('rentals')
        .select('status')
        .eq('id', rentalId)
        .maybeSingle()
      check(
        stillToInvoice?.status === 'TO_INVOICE',
        'Préparer une facture ne change pas l’état de la location',
        `${stillToInvoice?.status}`
      )

      /* --- LES LIGNES relèvent de la saisie : `create` OU `update`. */
      const lineByViewer = await viewer.rpc('add_customer_invoice_line', {
        p_invoice_id: invoiceId,
        p_kind: 'SERVICE',
        p_label: 'Tentative',
        p_quantity: 1,
        p_unit_price: 1000,
      })
      check(refused(lineByViewer), 'add_customer_invoice_line refusée au simple lecteur')

      const forgeLine = await viewer.from('customer_invoice_lines').insert({
        customer_invoice_id: invoiceId,
        kind: 'SERVICE',
        label: 'Ligne forgée',
        quantity: 1,
        unit_price: 1000,
      })
      check(refused(forgeLine), 'INSERT direct dans `customer_invoice_lines` refusé de même')

      const lineAdded = await creator.rpc('add_customer_invoice_line', {
        p_invoice_id: invoiceId,
        p_kind: 'RENTAL',
        p_label: `${MARK} — location`,
        p_quantity: 3,
        p_unit_price: 150000,
      })
      check(!refused(lineAdded), 'La capacité `create` ajoute une ligne',
        lineAdded.error?.message ?? '')

      /* --- ÉMETTRE exige `customer_invoices.issue`. */
      const issueByUpdater = await updater.rpc('issue_customer_invoice', {
        p_invoice_id: invoiceId,
      })
      check(refused(issueByUpdater), 'issue_customer_invoice refusée sans `customer_invoices.issue`')

      const issueByCreator = await creator.rpc('issue_customer_invoice', {
        p_invoice_id: invoiceId,
      })
      check(
        refused(issueByCreator),
        '`customer_invoices.create` n’émet pas la facture',
        'préparer n’est pas reconnaître une créance'
      )

      const patchIssue = await updater
        .from('customer_invoices')
        .update({ status: 'ISSUED', issued_at: new Date().toISOString() })
        .eq('id', invoiceId)
      const { data: afterPatch } = await admin
        .from('customer_invoices')
        .select('status')
        .eq('id', invoiceId)
        .maybeSingle()
      check(
        refused(patchIssue) || afterPatch?.status === 'DRAFT',
        'PATCH direct vers « Émise » sans effet de même',
        `${afterPatch?.status}`
      )

      /*
       * LE CONTRÔLE POSITIF SE FAIT AU PROFIL MINIMAL.
       *
       * `cli_issue` ne porte QUE `rentals.view`, `customer_invoices.view` et
       * `.issue` — aucun droit d'écriture sur la location. C'est ce contrôle qui
       * prouve que « Facturée » est la conséquence de l'émission, et non un
       * acte d'exploitation déguisé (même leçon que la migration 051).
       */
      const issued = await issuer.rpc('issue_customer_invoice', {
        p_invoice_id: invoiceId,
        p_reason: 'Audit',
      })
      check(
        !refused(issued),
        'Les trois capacités suffisent : émettre n’exige aucun droit sur la location',
        issued.error?.message ?? ''
      )

      const { data: invoicedRental } = await admin
        .from('rentals')
        .select('status')
        .eq('id', rentalId)
        .maybeSingle()
      check(
        invoicedRental?.status === 'INVOICED',
        'L’émission a rendu la location « Facturée »',
        `${invoicedRental?.status}`
      )

      /* --- ÉMISE, ELLE EST FIGÉE. */
      const lateLine = await owner.rpc('add_customer_invoice_line', {
        p_invoice_id: invoiceId,
        p_kind: 'FEE',
        p_label: 'Après coup',
        p_quantity: 1,
        p_unit_price: 1000,
      })
      check(
        refused(lateLine),
        'Une ligne ne s’ajoute plus à une facture émise',
        'même au porteur de toutes les capacités du domaine'
      )

      /* --- CLÔTURER exige `rental.rentals.close`, pas la facturation. */
      const closeByOwner = await owner.rpc('close_rental', { p_rental_id: rentalId })
      check(
        refused(closeByOwner),
        'close_rental refusée sans `rental.rentals.close`',
        'facturer n’est pas clôturer'
      )

      const patchClose = await owner
        .from('rentals')
        .update({ status: 'CLOSED' })
        .eq('id', rentalId)
      const { data: afterCloseAttempt } = await admin
        .from('rentals')
        .select('status')
        .eq('id', rentalId)
        .maybeSingle()
      check(
        refused(patchClose) || afterCloseAttempt?.status === 'INVOICED',
        'PATCH direct vers « Clôturée » sans effet de même',
        `${afterCloseAttempt?.status}`
      )

      const closed = await closer.rpc('close_rental', {
        p_rental_id: rentalId,
        p_reason: 'Audit',
      })
      check(!refused(closed), 'La capacité `rentals.close` clôture la location',
        closed.error?.message ?? '')

      /* --- UNE CLÔTURE NE SE DÉFAIT PAS PAR L'ANNULATION D'UNE FACTURE. */
      const cancelClosed = await canceller.rpc('cancel_customer_invoice', {
        p_invoice_id: invoiceId,
        p_reason: 'Audit',
      })
      check(
        refused(cancelClosed),
        'La facture d’une location clôturée ne s’annule pas',
        'une clôture d’exploitation ne se défait pas côté facturation'
      )

      /* --- ANNULER exige `customer_invoices.cancel`, et rend la location. */
      const secondRental = await makeInvoiceableRental(6, 500)

      const { data: secondId } = await owner.rpc('create_customer_invoice', {
        p_client_id: fixtures.clientId,
        p_invoice_date: '2026-09-02',
        p_rental_id: secondRental,
      })
      const secondInvoice = String(secondId)
      if (secondId) fixtures.customerInvoices.push(secondInvoice)

      await owner.rpc('add_customer_invoice_line', {
        p_invoice_id: secondInvoice,
        p_kind: 'RENTAL',
        p_label: `${MARK} — location 2`,
        p_quantity: 2,
        p_unit_price: 100000,
      })
      await owner.rpc('issue_customer_invoice', { p_invoice_id: secondInvoice })

      const cancelByUpdater = await updater.rpc('cancel_customer_invoice', {
        p_invoice_id: secondInvoice,
      })
      check(refused(cancelByUpdater), 'cancel_customer_invoice refusée sans `customer_invoices.cancel`')

      const cancelled = await canceller.rpc('cancel_customer_invoice', {
        p_invoice_id: secondInvoice,
        p_reason: 'Audit',
      })
      check(!refused(cancelled), 'La capacité `cancel` annule la facture',
        cancelled.error?.message ?? '')

      const { data: backToInvoice } = await admin
        .from('rentals')
        .select('status')
        .eq('id', secondRental)
        .maybeSingle()
      check(
        backToInvoice?.status === 'TO_INVOICE',
        'L’annulation rend la location à « À facturer »',
        `${backToInvoice?.status}`
      )

      /* --- LECTURE ET SUPPRESSION. */
      const noBilling = await session('acc_view')
      const blindRead = await noBilling
        .from('customer_invoices')
        .select('id')
        .eq('id', invoiceId)
      check(
        (blindRead.data?.length ?? 0) === 0,
        'RLS ne livre aucune facture sans `customer_invoices.view`'
      )

      const seen = await viewer
        .from('customer_invoices')
        .select('invoice_no')
        .eq('id', invoiceId)
        .maybeSingle()
      check(
        Boolean(seen.data?.invoice_no),
        'Avec `customer_invoices.view`, la facture est lisible'
      )

      const removal = await owner.from('customer_invoices').delete().eq('id', invoiceId)
      const { data: stillHere } = await admin
        .from('customer_invoices')
        .select('id')
        .eq('id', invoiceId)
        .maybeSingle()
      check(refused(removal) || Boolean(stillHere), 'Aucune suppression possible')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CATALOGUE ET DONNÉES DEMO\n')

    {
      const { count: total } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
      check(total === 153, 'Catalogue conforme', `${total} permissions`)

      const [{ count: clients }, { count: vehicles }] = await Promise.all([
        admin
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .like('legal_name', '%DEMO%'),
        admin.from('vehicles').select('id', { count: 'exact', head: true }).like('model', '%DEMO%'),
      ])
      check(clients === 3, 'Les trois clients DEMO sont intacts', `${clients}`)
      check(vehicles === 3, 'Les trois véhicules DEMO sont intacts', `${vehicles}`)
    }
  } finally {
    for (const client of Object.values(sessions)) await client.auth.signOut()

    /*
     * Une imputation rattachée retient sa facture (`on delete restrict`), et
     * son rattachement ne se retire QUE par le détachement : la base refuse un
     * `UPDATE` qui laisserait « Imputée » sans facture. Le nettoyage emprunte
     * donc le même chemin que l'utilisateur.
     */
    for (const id of fixtures.imputations) {
      await admin.rpc('detach_imputation_from_invoice', { p_imputation_id: id })
      await admin.from('imputation_documents').delete().eq('imputation_id', id)
      await admin.from('imputations').delete().eq('id', id)
    }
    for (const id of fixtures.payments) {
      await admin.rpc('cancel_supplier_payment', { p_payment_id: id })
      await admin.from('treasury_entries').delete().eq('supplier_payment_id', id)
      await admin.from('supplier_payments').delete().eq('id', id)
    }
    for (const id of fixtures.invoices) {
      await admin.from('supplier_payments').delete().eq('supplier_invoice_id', id)
      await admin.from('supplier_invoice_lines').delete().eq('supplier_invoice_id', id)
      await admin.from('supplier_invoices').delete().eq('id', id)
    }
    for (const id of fixtures.accounts) {
      await admin.from('treasury_entries').delete().eq('account_id', id)
      await admin.from('financial_accounts').delete().eq('id', id)
    }
    for (const id of fixtures.maintenances) {
      await admin.from('imputations').delete().eq('maintenance_id', id)
      await admin.from('maintenance_documents').delete().eq('maintenance_id', id)
      await admin.from('maintenance_quotes').delete().eq('maintenance_id', id)
      await admin.from('maintenance_cost_lines').delete().eq('maintenance_id', id)
      await admin.from('maintenance_costs').delete().eq('maintenance_id', id)
      await admin.from('vehicle_occupations').delete().eq('source_id', id)
      await admin.from('vehicle_maintenances').delete().eq('id', id)
    }
    /*
     * Une facture retient sa location (`on delete restrict`) : elle part avant
     * elle, avec ses lignes.
     */
    for (const id of fixtures.customerInvoices) {
      await admin.from('customer_invoice_lines').delete().eq('customer_invoice_id', id)
      await admin.from('customer_invoices').delete().eq('id', id)
    }
    for (const id of fixtures.rentals) {
      await admin.from('rental_inspection_photos').delete().eq('inspection_id', id)
      await admin.from('rental_inspections').delete().eq('rental_id', id)
      await admin.from('vehicle_occupations').delete().eq('source_id', id)
      await admin.from('rentals').delete().eq('id', id)
    }
    for (const id of fixtures.reservations) {
      await admin.from('vehicle_occupations').delete().eq('source_id', id)
      await admin.from('reservations').delete().eq('id', id)
    }
    if (fixtures.ruleId) await admin.from('pricing_rules').delete().eq('id', fixtures.ruleId)
    if (fixtures.clientId) await admin.from('clients').delete().eq('id', fixtures.clientId)
    for (const vehicleId of fixtures.vehicleIds) {
      await admin.from('vehicle_occupations').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicle_supplier_history').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }
    if (fixtures.supplierId) await admin.from('suppliers').delete().eq('id', fixtures.supplierId)
    if (fixtures.categoryId) {
      await admin.from('vehicle_categories').delete().eq('id', fixtures.categoryId)
    }
    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    console.log(`\n${DIM}Sujets et comptes d'audit supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}AUDIT DES CAPACITÉS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}AUDIT DES CAPACITÉS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Audit interrompu : ${error.message}${RESET}\n`)
  process.exit(1)
})
