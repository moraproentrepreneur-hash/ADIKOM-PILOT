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

    for (const suffix of ['A', 'B', 'C', 'D', 'E']) {
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
        '« Imputée » reste hors d’atteinte : elle suppose une facture (Étape 2.5)'
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

    for (const id of fixtures.imputations) {
      await admin.from('imputation_documents').delete().eq('imputation_id', id)
      await admin.from('imputations').delete().eq('id', id)
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
