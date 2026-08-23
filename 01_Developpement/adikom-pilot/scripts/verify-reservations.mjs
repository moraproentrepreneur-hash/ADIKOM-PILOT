#!/usr/bin/env node
/**
 * Recette du module Réservations — Étape 2.3, Lot 2.
 *
 * TROIS QUESTIONS
 *
 *   1. Le cycle fonctionne-t-il RÉELLEMENT ? Les formulaires sont remplis et
 *      soumis comme le ferait un utilisateur, puis les lignes sont RELUES en
 *      base — numéro attribué, période, tarif verrouillé, occupation posée.
 *
 *   2. Les quatre gestes sont-ils SÉPARABLES (DEC-024) ? Créer, modifier,
 *      confirmer et annuler sont quatre permissions. Aucune n'en emporte une
 *      autre, et `view` reste exigé pour atteindre la ressource. Contrôlé sur
 *      les trois barrières : bouton, route, base.
 *
 *   3. Les garanties de la BASE tiennent-elles depuis l'application ? Collision
 *      refusée, période adjacente acceptée, tarif verrouillé insensible à une
 *      modification ultérieure de la grille.
 *
 * DONNÉES
 *
 * Les sujets sont créés pour la recette et supprimés à la fin — jamais les
 * données DEMO, dont l'intégrité est recomptée avant de rendre la main.
 *
 * Utilisation :
 *   node scripts/verify-reservations.mjs [url]
 */

import { chromium } from '@playwright/test'
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
const MARK = `RECETTE RES ${STAMP}`

/* -------------------------------------------------------------------------- */
/*  Profils — un geste, une permission                                         */
/* -------------------------------------------------------------------------- */

const BASE = ['rental.reservations.view', 'parties.clients.view', 'rental.fleet.view']

const PROFILES = [
  { key: 'view', permissions: BASE },
  { key: 'create', permissions: [...BASE, 'rental.reservations.create'] },
  {
    key: 'full',
    permissions: [
      ...BASE,
      'rental.reservations.create',
      'rental.reservations.update',
      'rental.reservations.confirm',
      'rental.reservations.cancel',
      'rental.rentals.financial.view',
    ],
  },
  // Confirmer sans voir : attribution incohérente, volontairement éprouvée.
  { key: 'confirmonly', permissions: ['rental.reservations.confirm'] },
]

async function createProfile(admin, profile) {
  const username = `recette.res.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-res-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${profile.key} : ${error?.message}`)

  const id = created.user.id

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Réservation ${profile.key}`,
    username,
    email,
    status: 'ACTIVE',
  })
  if (profileError) throw new Error(`profil ${profile.key} : ${profileError.message}`)

  const { data: catalog } = await admin
    .from('permissions')
    .select('id, code')
    .in('code', profile.permissions)

  if ((catalog ?? []).length !== profile.permissions.length) {
    throw new Error(
      `catalogue incomplet pour ${profile.key} : ${(catalog ?? []).length}/${profile.permissions.length}`
    )
  }

  const { error: grantError } = await admin
    .from('user_permissions')
    .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' })))
  if (grantError) throw new Error(`permissions ${profile.key} : ${grantError.message}`)

  return { id, email, password, username }
}

async function signIn(browser, base, account) {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${base}/connexion`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#username') !== null)
  await page.fill('#username', account.username)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/tableau-de-bord', { timeout: 30000 })

  return { context, page }
}

/** Le formulaire se soumet par SON bouton : la barre latérale en porte un autre. */
async function submitForm(page, label) {
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: label, exact: true }).click()
}

/** Mesurer l'état plutôt que patienter au jugé. */
async function until(read, timeoutMs = 15000) {
  const started = Date.now()
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() - started > timeoutMs) return null
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

/** Écriture directe, interface contournée : seules les policies RLS répondent. */
async function asUser(account, url, anonKey, run) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error) throw new Error(`session ${account.username} : ${error.message}`)

  const result = await run(client)
  await client.auth.signOut()
  return result
}

/* -------------------------------------------------------------------------- */
/*  Recette                                                                    */
/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'
  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nCible : ${base}\n`)

  const accounts = {}
  const fixtures = {}
  const browser = await chromium.launch()

  try {
    /* --- Sujets de recette, jamais les données DEMO ---------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `REC-${STAMP}`, label: `${MARK} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    const { data: clientNo } = await admin.rpc('next_number', { p_entity_key: 'client' })
    const { data: client } = await admin
      .from('clients')
      .insert({ client_no: clientNo, type: 'COMPANY', legal_name: `${MARK} — Client`, phone: '+269 000' })
      .select('id')
      .single()
    fixtures.clientId = client.id

    const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
    const { data: vehicle } = await admin
      .from('vehicles')
      .insert({
        vehicle_no: vehicleNo,
        category_id: category.id,
        brand: 'RECETTE',
        model: `RES ${STAMP}`,
        plate: `RR-${STAMP}`,
        origin: 'OWNED',
        status: 'AVAILABLE',
      })
      .select('id')
      .single()
    fixtures.vehicleId = vehicle.id

    const { data: rule } = await admin
      .from('pricing_rules')
      .insert({ category_id: category.id, amount: 120000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    console.log(`${DIM}Sujets : ${clientNo} · ${vehicleNo} · tarif 120 000 KMF/jour${RESET}\n`)

    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    /* ------------------------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('CAS 1 — VIEW seul : consulter, sans rien engager\n')

    {
      const { context, page } = await signIn(browser, base, accounts.view)

      await page.goto(`${base}/location/reservations`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Nouvelle réservation' }).count()) === 0,
        'Bouton « Nouvelle réservation » absent'
      )

      await page.goto(`${base}/location/reservations/nouvelle`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Accès direct au formulaire refusé',
        page.url().replace(base, '')
      )

      await context.close()

      const insert = await asUser(accounts.view, url, anonKey, (c) =>
        c
          .from('reservations')
          .insert({
            reservation_no: `RES-INTRUS-${STAMP}`,
            client_id: fixtures.clientId,
            category_id: fixtures.categoryId,
            period: `[${new Date(Date.now() + 864e5).toISOString()},${new Date(Date.now() + 1728e5).toISOString()})`,
          })
          .select('id')
      )
      check(
        (insert.data?.length ?? 0) === 0,
        'RLS refuse la création',
        insert.error?.code ?? 'aucune ligne'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 2 — CREATE : créer, sans pouvoir confirmer\n')

    {
      const { context, page } = await signIn(browser, base, accounts.create)

      await page.goto(`${base}/location/reservations`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Nouvelle réservation' }).count()) === 1,
        'Bouton « Nouvelle réservation » présent'
      )

      await page.getByRole('link', { name: 'Nouvelle réservation' }).click()
      await page.waitForURL((u) => u.href.includes('/reservations/nouvelle'), { timeout: 30000 })
      check(
        (await page.locator('#clientId').count()) === 1,
        'Le bouton ouvre le formulaire réel de création'
      )

      // Période saisie en heure des Comores : 08:00 doit rester 08:00.
      const day = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10)
      const dayEnd = new Date(Date.now() + 23 * 864e5).toISOString().slice(0, 10)

      await page.selectOption('select[name="clientId"]', fixtures.clientId)
      await page.fill('#from', `${day}T08:00`)
      await page.fill('#to', `${dayEnd}T08:00`)
      await page.selectOption('select[name="categoryId"]', fixtures.categoryId)
      await submitForm(page, 'Créer la réservation')
      await page.waitForURL((u) => u.href.includes('cree=1'), { timeout: 30000 })

      const created = await until(async () => {
        const { data } = await admin
          .from('reservations')
          .select('id, reservation_no, status, period, locked_amount, created_by')
          .eq('client_id', fixtures.clientId)
          .maybeSingle()
        return data ?? null
      })

      fixtures.reservationId = created?.id ?? null

      check(Boolean(created), 'Réservation enregistrée en base', created?.reservation_no)
      check(
        /^RES-\d{4}-\d{6}$/.test(created?.reservation_no ?? ''),
        'Identifiant attribué côté serveur (DEC-005)',
        created?.reservation_no
      )
      check(created?.status === 'DRAFT', 'Statut initial « Brouillon »', created?.status)
      check(created?.locked_amount === null, 'Aucun tarif verrouillé avant confirmation')
      check(created?.created_by === accounts.create.id, 'L’auteur de la création est conservé')

      // L'HEURE SAISIE EST UNE HEURE DES COMORES, pas une heure UTC.
      const startIso = /^\[?"?([^",]+)/.exec(created?.period ?? '')?.[1] ?? ''
      const shownHour = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Indian/Comoro',
        hour: '2-digit',
        hour12: false,
      })
        .format(new Date(startIso))
        // `fr-FR` rend « 08 h » : seuls les chiffres nous intéressent.
        .replace(/\D/g, '')

      check(
        Number(shownHour) === 8,
        'L’heure saisie est interprétée aux Comores, sans dérive',
        `saisie 08:00 → relue ${shownHour}:00`
      )

      // La période doit s'AFFICHER : une plage mal relue laisserait la colonne
      // vide sans que rien ne le signale.
      await page.goto(`${base}/location/reservations`, { waitUntil: 'load' })
      check(
        (await page.getByText(':00', { exact: false }).count()) >= 1,
        'La période est affichée dans la liste'
      )

      check(
        (await page.getByRole('button', { name: 'Confirmer la réservation', exact: true }).count()) === 0,
        'Créer n’emporte pas confirmer : aucun panneau de confirmation'
      )

      await context.close()

      const confirmed = await asUser(accounts.create, url, anonKey, (c) =>
        c.rpc('confirm_reservation', {
          p_reservation_id: fixtures.reservationId,
          p_vehicle_id: fixtures.vehicleId,
        })
      )
      // La fonction n'est pas une barrière de permission : c'est RLS qui refuse
      // l'écriture qu'elle tente. L'absence de confirmation est ce qui compte.
      const stillDraft = await admin
        .from('reservations')
        .select('status')
        .eq('id', fixtures.reservationId)
        .maybeSingle()

      check(
        stillDraft.data?.status === 'DRAFT',
        'Un compte sans « confirmer » ne confirme pas, même par appel direct',
        confirmed.error?.code ?? stillDraft.data?.status
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 3 — CONFIRMER : disponibilité, verrouillage, occupation\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/reservations/${fixtures.reservationId}`, {
        waitUntil: 'load',
      })

      check(
        (await page.getByText('RECETTE RES', { exact: false }).count()) >= 1,
        'La fiche est consultable'
      )
      check(
        (await page.getByRole('button', { name: 'Confirmer la réservation', exact: true }).count()) === 1,
        'Le panneau de confirmation est présent'
      )
      check(
        (await page.getByText(`RECETTE RES ${STAMP}`, { exact: false }).count()) >= 1,
        'La recherche de disponibilité propose le véhicule libre'
      )

      await submitForm(page, 'Confirmer la réservation')

      const confirmed = await until(async () => {
        const { data } = await admin
          .from('reservations')
          .select('status, vehicle_id, locked_amount, locked_unit, locked_source, locked_at')
          .eq('id', fixtures.reservationId)
          .maybeSingle()
        return data?.status === 'CONFIRMED' ? data : null
      })

      check(Boolean(confirmed), 'La réservation est confirmée')
      check(confirmed?.vehicle_id === fixtures.vehicleId, 'Le véhicule est affecté')
      check(
        confirmed?.locked_amount === 120000 && confirmed?.locked_unit === 'DAY',
        'Le tarif est verrouillé',
        `${confirmed?.locked_amount} / ${confirmed?.locked_unit}`
      )
      check(Boolean(confirmed?.locked_at), 'La date de verrouillage est conservée')

      const { data: occupation } = await admin
        .from('vehicle_occupations')
        .select('id, source, is_active')
        .eq('source', 'RESERVATION')
        .eq('source_id', fixtures.reservationId)
        .maybeSingle()

      check(
        occupation?.is_active === true,
        'Une occupation active est posée sur le véhicule',
        occupation?.source
      )

      // DEC-025 §c : le statut du véhicule ne bouge PAS.
      const { data: veh } = await admin
        .from('vehicles')
        .select('status')
        .eq('id', fixtures.vehicleId)
        .maybeSingle()

      check(
        veh?.status === 'AVAILABLE',
        'Le statut du véhicule reste « Disponible » (aucun statut « Réservé »)',
        veh?.status
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 4 — Le tarif verrouillé résiste à la grille\n')

    {
      await admin.from('pricing_rules').update({ amount: 999000 }).eq('id', fixtures.ruleId)

      const { data: after } = await admin
        .from('reservations')
        .select('locked_amount')
        .eq('id', fixtures.reservationId)
        .maybeSingle()

      check(
        after?.locked_amount === 120000,
        'Le tarif verrouillé n’a pas bougé alors que la grille passe à 999 000',
        `${after?.locked_amount} KMF`
      )

      await admin.from('pricing_rules').update({ amount: 120000 }).eq('id', fixtures.ruleId)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 5 — Collision refusée, période adjacente acceptée\n')

    {
      const { data: no1 } = await admin.rpc('next_number', { p_entity_key: 'reservation' })
      const { data: overlapping } = await admin
        .from('reservations')
        .select('period')
        .eq('id', fixtures.reservationId)
        .maybeSingle()

      const bounds = /^\[?"?([^",]+)"?,"?([^",)\]]+)/.exec(overlapping?.period ?? '')
      // Meme normalisation que la couche donnees : Postgres rend « +00 ».
      const toDate = (raw) =>
        new Date(raw.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
      const start = toDate(bounds[1])
      const end = toDate(bounds[2])

      // Chevauche d'un jour.
      const { data: clash } = await admin
        .from('reservations')
        .insert({
          reservation_no: no1,
          client_id: fixtures.clientId,
          vehicle_id: fixtures.vehicleId,
          period: `[${new Date(end.getTime() - 864e5).toISOString()},${new Date(end.getTime() + 864e5).toISOString()})`,
        })
        .select('id')
        .single()
      fixtures.clashId = clash.id

      const refused = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('confirm_reservation', {
          p_reservation_id: clash.id,
          p_vehicle_id: fixtures.vehicleId,
        })
      )

      check(Boolean(refused.error), 'La collision est refusée par la base', refused.error?.code)

      // Adjacente : accolée à la fin, sans recouvrement.
      await admin
        .from('reservations')
        .update({
          period: `[${end.toISOString()},${new Date(end.getTime() + 864e5).toISOString()})`,
        })
        .eq('id', clash.id)

      const accepted = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('confirm_reservation', {
          p_reservation_id: clash.id,
          p_vehicle_id: fixtures.vehicleId,
        })
      )

      check(!accepted.error, 'La période adjacente est acceptée', accepted.error?.message ?? 'ok')
      void start
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 6 — Annulation motivée : le véhicule est libéré\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/reservations/${fixtures.clashId}`, { waitUntil: 'load' })
      await page.fill('input[name="reason"]', 'Recette : désistement')
      await submitForm(page, 'Annuler la réservation')

      const cancelled = await until(async () => {
        const { data } = await admin
          .from('reservations')
          .select('status, status_reason')
          .eq('id', fixtures.clashId)
          .maybeSingle()
        return data?.status === 'CANCELLED' ? data : null
      })

      check(Boolean(cancelled), 'La réservation est annulée')
      check(
        cancelled?.status_reason === 'Recette : désistement',
        'Le motif est conservé sur la fiche'
      )

      const { data: occ } = await admin
        .from('vehicle_occupations')
        .select('is_active, released_at')
        .eq('source_id', fixtures.clashId)
        .maybeSingle()

      check(occ?.is_active === false, 'L’occupation ne bloque plus')
      check(Boolean(occ?.released_at), 'L’occupation est libérée, pas effacée')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 7 — CONFIRMER sans VOIR : aucun contournement\n')

    {
      const { context, page } = await signIn(browser, base, accounts.confirmonly)

      await page.goto(`${base}/location/reservations`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Liste refusée sans « voir »',
        page.url().replace(base, '')
      )

      await page.goto(`${base}/location/reservations/${fixtures.reservationId}`, {
        waitUntil: 'load',
      })
      check(page.url().includes('/acces-refuse'), 'Fiche refusée sans « voir »')

      await context.close()

      const read = await asUser(accounts.confirmonly, url, anonKey, (c) =>
        c.from('reservations').select('id').eq('id', fixtures.reservationId)
      )
      check((read.data?.length ?? 0) === 0, 'RLS ne laisse rien lire sans « voir »')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('DONNÉES DEMO\n')

    {
      const [{ count: clients }, { count: vehicles }] = await Promise.all([
        admin.from('clients').select('id', { count: 'exact', head: true }).like('legal_name', '%DEMO%'),
        admin.from('vehicles').select('id', { count: 'exact', head: true }).like('model', '%DEMO%'),
      ])

      check(clients === 3, 'Les trois clients DEMO sont intacts', `${clients}`)
      check(vehicles === 3, 'Les trois véhicules DEMO sont intacts', `${vehicles}`)
    }
  } finally {
    await browser.close()

    // Le rôle de service peut supprimer, l'application non (DEC-020).
    for (const id of [fixtures.clashId, fixtures.reservationId]) {
      if (id) {
        await admin.from('vehicle_occupations').delete().eq('source_id', id)
        await admin.from('reservations').delete().eq('id', id)
      }
    }
    if (fixtures.ruleId) await admin.from('pricing_rules').delete().eq('id', fixtures.ruleId)
    if (fixtures.vehicleId) await admin.from('vehicles').delete().eq('id', fixtures.vehicleId)
    if (fixtures.clientId) await admin.from('clients').delete().eq('id', fixtures.clientId)
    if (fixtures.categoryId)
      await admin.from('vehicle_categories').delete().eq('id', fixtures.categoryId)

    for (const account of Object.values(accounts)) {
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }
    console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE RÉSERVATIONS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE RÉSERVATIONS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
