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
  // Modifier une maintenance, sans l'engager ni la terminer.
  mnt_update: [...READERS, 'rental.maintenance.create', 'rental.maintenance.update'],
  // Terminer une maintenance, sans pouvoir l'engager.
  mnt_close: [...READERS, 'rental.maintenance.create', 'rental.maintenance.close'],
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
  const fixtures = { vehicleIds: [], reservations: [], rentals: [], maintenances: [] }

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
    console.log('CATALOGUE ET DONNÉES DEMO\n')

    {
      const { count: total } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
      check(total === 152, 'Catalogue inchangé', `${total} permissions`)

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

    for (const id of fixtures.maintenances) {
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
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }
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
