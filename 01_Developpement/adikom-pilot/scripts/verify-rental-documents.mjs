#!/usr/bin/env node
/**
 * Recette des documents et exports de location — Étape 2.3, Lot 8.
 *
 * CE QU'ELLE ÉPROUVE
 *
 *   1. DEC-024 sur la route : consulter, télécharger et imprimer une location
 *      sont trois capacités distinctes. Un refus se produit AVANT toute
 *      production de fichier — aucun octet de PDF ni d'archive ne sort.
 *
 *   2. Les trois pièces sont RÉELLEMENT produites : contrat, bon de départ,
 *      procès-verbal de retour. Signature, marqueur de fin, pages, polices
 *      embarquées. Un HTTP 200 ne prouve rien.
 *
 *   3. LES CAS VIDES AUSSI. Une location jamais partie doit produire son bon de
 *      départ et son PV — en DISANT qu'il n'y a pas d'état des lieux (DEC-017).
 *      C'est exactement la branche qui avait fait tomber la fiche client le
 *      22/08/2026 : elle n'était jamais rendue.
 *
 *   4. UN SEUL FICHIER. L'aperçu, le téléchargement et l'impression servent le
 *      même PDF, à l'octet près ; seule la disposition change.
 *
 *   5. Le document n'expose pas plus que l'écran : sans droit sur le client, le
 *      véhicule ou les montants, ces données ne sont pas chargées — et RLS le
 *      confirme indépendamment de l'application.
 *
 *   6. Les classeurs sont RELUS : la colonne « Tarif verrouillé » n'existe
 *      qu'avec `rental.rentals.financial.view`, et aucune valorisation de
 *      retard, de carburant ou de kilométrage n'y figure (DEC-008).
 *
 * Utilisation :
 *   node scripts/verify-rental-documents.mjs [url]
 */

import crypto from 'node:crypto'

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

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
const MARK = `RECETTE DOC ${STAMP}`

/* -------------------------------------------------------------------------- */
/*  Contrôle réel des fichiers                                                 */
/* -------------------------------------------------------------------------- */

function inspectPdf(body) {
  const head = body.subarray(0, 8).toString('latin1')
  const tail = body.subarray(-1024).toString('latin1')
  const text = body.toString('latin1')

  return {
    signature: head.startsWith('%PDF-'),
    version: head.slice(0, 8).trim(),
    complete: tail.includes('%%EOF'),
    pages: (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length,
    // Les polices embarquées portent leur nom : leur absence signalerait un
    // repli silencieux sur Helvetica.
    embedsFonts: /Montserrat|Inter/.test(text),
    size: body.byteLength,
  }
}

/**
 * Empreinte d'un PDF, insensible à l'instant de production.
 *
 * Deux rendus successifs du même document ne diffèrent qu'en DEUX endroits,
 * tous deux imposés par le format : l'horodatage `(D:…)` du dictionnaire
 * d'information, et l'identifiant `/ID` que le générateur tire à chaque
 * écriture. Vérifié : à ces deux zones près, les fichiers sont identiques
 * octet pour octet, jusqu'aux offsets de la table de références.
 *
 * Les neutraliser permet de comparer ce qui nous intéresse — le CONTENU servi
 * en aperçu, en téléchargement et à l'impression — au lieu de constater une
 * différence qui n'en est pas une.
 */
function fingerprint(body) {
  const normalised = body
    .toString('latin1')
    .replace(/\(D:\d{14}[^)]*\)/g, '(D:)')
    .replace(/\/ID\s*\[[^\]]*\]/g, '/ID []')
  return crypto.createHash('sha256').update(normalised, 'latin1').digest('hex').slice(0, 16)
}

async function inspectXlsx(body) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(body)

  const sheet = workbook.worksheets[0]
  if (!sheet) return { readable: false, headers: [] }

  const headers = []
  sheet.getRow(3).eachCell((cell) => headers.push(String(cell.value ?? '')))

  return {
    readable: true,
    sheet: sheet.name,
    subtitle: String(sheet.getCell(2, 1).value ?? ''),
    headers,
    rows: Math.max(0, sheet.rowCount - 3),
    size: body.byteLength,
  }
}

/* -------------------------------------------------------------------------- */
/*  Profils                                                                    */
/* -------------------------------------------------------------------------- */

/** De quoi voir une location entière : contrat, parties, véhicule, montants. */
const READERS = [
  'rental.rentals.view',
  'rental.reservations.view',
  'parties.clients.view',
  'rental.fleet.view',
  'rental.rentals.financial.view',
]

const PROFILES = [
  {
    key: 'full',
    // Le compte qui fabrique les sujets ET produit tous les fichiers.
    permissions: [
      ...READERS,
      'rental.reservations.confirm',
      'rental.rentals.create',
      'rental.rentals.update',
      'rental.rentals.checkout',
      'rental.rentals.return',
      'rental.rentals.download',
      'rental.rentals.print',
      'rental.rentals.export',
      'rental.reservations.export',
    ],
  },
  // Voir sans produire : DEC-024 dans son cas le plus courant.
  { key: 'view', permissions: READERS },
  { key: 'download', permissions: [...READERS, 'rental.rentals.download'] },
  { key: 'print', permissions: [...READERS, 'rental.rentals.print'] },
  // Capacité transversale sans droit de consulter : elle ne crée pas d'accès.
  {
    key: 'orphan',
    permissions: ['rental.rentals.download', 'rental.rentals.print', 'rental.rentals.export'],
  },
  { key: 'none', permissions: [] },
  /*
   * Le lecteur le plus DÉPOUILLÉ qui obtienne encore un fichier : il voit la
   * location, rien d'autre. C'est lui qui exerce toutes les branches « sans
   * droit » des trois modèles — celles qu'aucun compte confortable ne
   * rencontre jamais.
   */
  {
    key: 'minimal',
    permissions: ['rental.rentals.view', 'rental.rentals.download', 'rental.rentals.export'],
  },
]

async function createProfile(admin, profile) {
  const username = `recette.rdoc.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-rdoc-${STAMP}`

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
    last_name: `Doc ${profile.key}`,
    username,
    email,
    status: 'ACTIVE',
  })
  if (profileError) throw new Error(`profil ${profile.key} : ${profileError.message}`)

  if (profile.permissions.length > 0) {
    const { data: catalog } = await admin
      .from('permissions')
      .select('id, code')
      .in('code', profile.permissions)

    if ((catalog ?? []).length !== profile.permissions.length) {
      const found = new Set((catalog ?? []).map((p) => p.code))
      throw new Error(
        `catalogue incomplet pour ${profile.key} : ` +
          `${profile.permissions.filter((c) => !found.has(c)).join(', ')}`
      )
    }

    const { error: grantError } = await admin
      .from('user_permissions')
      .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' })))
    if (grantError) throw new Error(`permissions ${profile.key} : ${grantError.message}`)
  }

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
  const fixtures = { rentals: [] }
  const browser = await chromium.launch()

  // Le journal est compté au fil des requêtes plutôt qu'estimé à la fin : une
  // arithmétique posée d'avance se périme au premier contrôle ajouté.
  let expectedExports = 0
  let expectedDenied = 0

  const documentUrl = (type, id, mode) => `${base}/api/documents/${type}/${id}?mode=${mode}`
  const exportUrl = (module) => `${base}/api/exports/${module}`

  /** Une location au stade voulu : 'confirmed' | 'returned'. */
  async function makeRental({ vehicleId, offsetDays, stage }) {
    const { data: resNo } = await admin.rpc('next_number', { p_entity_key: 'reservation' })
    const from = new Date(Date.now() + offsetDays * 864e5)
    const to = new Date(Date.now() + (offsetDays + 3) * 864e5)

    const { data: reservation, error: resError } = await admin
      .from('reservations')
      .insert({
        reservation_no: resNo,
        client_id: fixtures.clientId,
        vehicle_id: vehicleId,
        period: `[${from.toISOString()},${to.toISOString()})`,
        conditions: 'Restitution avec le plein.',
      })
      .select('id')
      .single()
    if (resError) throw new Error(`réservation : ${resError.message}`)

    await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('confirm_reservation', { p_reservation_id: reservation.id, p_vehicle_id: vehicleId })
    )

    const { data: rentalId, error: convertError } = await asUser(accounts.full, url, anonKey, (c) =>
      c.rpc('convert_reservation_to_rental', { p_reservation_id: reservation.id })
    )
    if (convertError) throw new Error(`conversion : ${convertError.message}`)

    fixtures.rentals.push({ rentalId, reservationId: reservation.id })

    await asUser(accounts.full, url, anonKey, (c) =>
      c.from('rentals').update({ status: 'CONFIRMED' }).eq('id', rentalId)
    )

    if (stage === 'returned') {
      const { error: startError } = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('start_rental', {
          p_rental_id: rentalId,
          p_started_at: from.toISOString(),
          p_mileage: 20000,
          p_fuel_level: 'FULL',
          p_preexisting_damages: 'Rayure portière avant droite',
        })
      )
      if (startError) throw new Error(`départ : ${startError.message}`)

      const { error: returnError } = await asUser(accounts.full, url, anonKey, (c) =>
        c.rpc('return_rental', {
          p_rental_id: rentalId,
          p_returned_at: new Date(from.getTime() + 2 * 864e5).toISOString(),
          p_mileage: 20800,
          p_fuel_level: 'HALF',
          p_observations: 'Retour sans incident.',
        })
      )
      if (returnError) throw new Error(`retour : ${returnError.message}`)
    }

    return rentalId
  }

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RDOC-${STAMP}`, label: `${MARK} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    const { data: clientNo } = await admin.rpc('next_number', { p_entity_key: 'client' })
    const { data: client } = await admin
      .from('clients')
      .insert({
        client_no: clientNo,
        type: 'COMPANY',
        legal_name: `${MARK} — Client`,
        phone: '+269 000',
        city: 'Moroni',
      })
      .select('id')
      .single()
    fixtures.clientId = client.id

    const { data: rule } = await admin
      .from('pricing_rules')
      .insert({ category_id: category.id, amount: 120000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    fixtures.vehicleIds = []
    for (const suffix of ['A', 'B']) {
      const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
      const { data: vehicle } = await admin
        .from('vehicles')
        .insert({
          vehicle_no: vehicleNo,
          category_id: category.id,
          brand: 'RECETTE',
          model: `DOC ${STAMP} ${suffix}`,
          plate: `RD-${STAMP}${suffix}`,
          origin: 'OWNED',
          status: 'AVAILABLE',
        })
        .select('id')
        .single()
      fixtures.vehicleIds.push(vehicle.id)
    }

    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    const returned = await makeRental({
      vehicleId: fixtures.vehicleIds[0],
      offsetDays: 90,
      stage: 'returned',
    })
    const confirmed = await makeRental({
      vehicleId: fixtures.vehicleIds[1],
      offsetDays: 120,
      stage: 'confirmed',
    })

    console.log(
      `${DIM}Sujets : une location retournée (départ 20 000 km, retour 20 800 km) ` +
        `et une location confirmée, jamais partie${RESET}`
    )

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('0 — VISITEUR SANS SESSION\n')

    {
      const anonymous = await browser.newContext()
      const page = await anonymous.newPage()

      for (const [label, target] of [
        ['Contrat', documentUrl('contrats', returned, 'download')],
        ['Export des locations', exportUrl('locations')],
      ]) {
        const response = await page.request.get(target, { maxRedirects: 0 })
        const status = response.status()
        const body = await response.body()

        check(
          [302, 307, 401].includes(status) &&
            body.subarray(0, 5).toString('latin1') !== '%PDF-' &&
            body.subarray(0, 2).toString('latin1') !== 'PK',
          `${label} refusé sans session, aucun fichier`,
          `HTTP ${status}`
        )
      }

      await anonymous.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — DEC-024 : VOIR, TÉLÉCHARGER ET IMPRIMER SONT TROIS DROITS\n')

    const MATRIX = [
      { key: 'view', title: 'VIEW seul', expected: { preview: 403, download: 403, print: 403 } },
      {
        key: 'download',
        title: 'VIEW + DOWNLOAD',
        expected: { preview: 200, download: 200, print: 403 },
      },
      { key: 'print', title: 'VIEW + PRINT', expected: { preview: 200, download: 403, print: 200 } },
      {
        key: 'orphan',
        title: 'DOWNLOAD + PRINT sans VIEW',
        expected: { preview: 403, download: 403, print: 403 },
      },
      { key: 'none', title: 'aucune permission', expected: { preview: 403, download: 403, print: 403 } },
    ]

    for (const profile of MATRIX) {
      console.log(`  ${DIM}${profile.title}${RESET}`)
      const { context, page } = await signIn(browser, base, accounts[profile.key])

      for (const mode of ['preview', 'download', 'print']) {
        const expected = profile.expected[mode]
        const response = await page.request.get(documentUrl('contrats', returned, mode), {
          maxRedirects: 0,
        })
        const status = response.status()
        const body = await response.body()

        if (status !== expected) {
          check(false, `${mode} → attendu ${expected}`, `obtenu ${status}`)
          continue
        }

        if (expected === 200) {
          expectedExports += mode === 'download' ? 1 : 0
          const pdf = inspectPdf(body)
          const disposition = response.headers()['content-disposition'] ?? ''
          const attached =
            mode === 'download' ? /attachment/.test(disposition) : /inline/.test(disposition)

          check(
            pdf.signature && pdf.complete && attached,
            `${mode} autorisé, PDF servi`,
            `${(pdf.size / 1024).toFixed(0)} Ko · ${disposition.split(';')[0]}`
          )
        } else {
          expectedDenied += 1
          check(
            body.subarray(0, 5).toString('latin1') !== '%PDF-',
            `${mode} refusé AVANT production`,
            `HTTP ${status}, aucun octet de PDF`
          )
        }
      }

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — PRODUCTION RÉELLE : LES TROIS PIÈCES, GARNIES ET VIDES\n')

    const { context: fullContext, page: fullPage } = await signIn(browser, base, accounts.full)

    const PIECES = [
      { type: 'contrats', label: 'Contrat de location' },
      { type: 'departs', label: 'Bon de départ' },
      { type: 'retours', label: 'Procès-verbal de retour' },
    ]

    for (const [subject, rentalId, note] of [
      ['Location retournée', returned, 'états des lieux complets'],
      ['Location jamais partie', confirmed, 'aucun état des lieux'],
    ]) {
      console.log(`  ${DIM}${subject} — ${note}${RESET}`)

      for (const piece of PIECES) {
        const response = await fullPage.request.get(documentUrl(piece.type, rentalId, 'download'), {
          maxRedirects: 0,
        })
        const status = response.status()

        if (status !== 200) {
          const text = (await response.text()).slice(0, 160)
          check(false, piece.label, `HTTP ${status} — ${text}`)
          continue
        }

        expectedExports += 1

        const body = await response.body()
        const type = response.headers()['content-type'] ?? ''
        const disposition = response.headers()['content-disposition'] ?? ''
        const pdf = inspectPdf(body)

        const problems = []
        if (!/^application\/pdf/.test(type)) problems.push(`type ${type}`)
        if (!pdf.signature) problems.push('signature absente')
        if (!pdf.complete) problems.push('fichier tronqué')
        if (pdf.pages < 1) problems.push('aucune page')
        if (!pdf.embedsFonts) problems.push('polices non embarquées')
        if (pdf.size < 20_000) problems.push(`${pdf.size} octets`)
        if (!/attachment/.test(disposition)) problems.push('pas en pièce jointe')

        check(
          problems.length === 0,
          piece.label,
          problems.length === 0
            ? `${pdf.version} · ${pdf.pages} page(s) · ${(pdf.size / 1024).toFixed(0)} Ko · ` +
                `${disposition.match(/filename="([^"]+)"/)?.[1] ?? '—'}`
            : problems.join(', ')
        )
      }
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — UN SEUL FICHIER : APERÇU = TÉLÉCHARGEMENT = IMPRESSION\n')

    {
      const served = {}
      for (const mode of ['preview', 'download', 'print']) {
        const response = await fullPage.request.get(documentUrl('contrats', returned, mode), {
          maxRedirects: 0,
        })
        expectedExports += mode === 'download' ? 1 : 0
        const body = await response.body()
        served[mode] = {
          print: fingerprint(body),
          size: body.byteLength,
          disposition: (response.headers()['content-disposition'] ?? '').split(';')[0],
          cache: response.headers()['cache-control'] ?? '',
          name: (response.headers()['content-disposition'] ?? '').match(/filename="([^"]+)"/)?.[1],
        }
      }

      check(
        served.preview.print === served.download.print &&
          served.download.print === served.print.print,
        'Le même PDF, à l’octet près, dans les trois modes',
        served.download.print
      )
      check(
        served.preview.name === served.download.name && served.download.name === served.print.name,
        'Le même nom de fichier dans les trois modes',
        served.download.name ?? '—'
      )
      check(
        served.preview.disposition === 'inline' &&
          served.print.disposition === 'inline' &&
          served.download.disposition === 'attachment',
        'Seule la disposition distingue les modes',
        'inline / attachment'
      )
      check(
        ['preview', 'download', 'print'].every((m) => /private/.test(served[m].cache) && /no-store/.test(served[m].cache)),
        'Aucun cache partagé ne conserve un document',
        served.download.cache
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LE DOCUMENT N’EXPOSE PAS PLUS QUE L’ÉCRAN\n')

    {
      const { context, page } = await signIn(browser, base, accounts.minimal)

      for (const piece of PIECES) {
        const response = await page.request.get(documentUrl(piece.type, returned, 'download'), {
          maxRedirects: 0,
        })
        const status = response.status()

        if (status !== 200) {
          const text = (await response.text()).slice(0, 160)
          check(false, `${piece.label} — lecteur dépouillé`, `HTTP ${status} — ${text}`)
          continue
        }

        expectedExports += 1
        const body = await response.body()
        const pdf = inspectPdf(body)

        check(
          pdf.signature && pdf.complete && pdf.pages >= 1 && pdf.embedsFonts,
          `${piece.label} produit sans droit sur le client, le véhicule ni les montants`,
          `${pdf.pages} page(s) · ${(pdf.size / 1024).toFixed(0)} Ko`
        )
      }

      await context.close()

      /*
       * L'application n'a pas chargé ces données ; la base ne les lui aurait pas
       * données non plus. Les deux barrières sont vérifiées séparément — c'est
       * la seule façon de savoir que la seconde tient si la première cède.
       */
      const [readClient, readVehicle] = await Promise.all([
        asUser(accounts.minimal, url, anonKey, (c) =>
          c.from('clients').select('id').eq('id', fixtures.clientId)
        ),
        asUser(accounts.minimal, url, anonKey, (c) =>
          c.from('vehicles').select('id').eq('id', fixtures.vehicleIds[0])
        ),
      ])

      check((readClient.data?.length ?? 0) === 0, 'RLS ne livre aucun client à ce lecteur')
      check((readVehicle.data?.length ?? 0) === 0, 'RLS ne livre aucun véhicule à ce lecteur')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — DEC-024 : EXPORTER EST UNE CAPACITÉ DISTINCTE\n')

    for (const [key, title, expected] of [
      ['view', 'VIEW seul', 403],
      ['orphan', 'EXPORT sans VIEW', 403],
      ['none', 'aucune permission', 403],
      ['full', 'VIEW + EXPORT', 200],
    ]) {
      console.log(`  ${DIM}${title}${RESET}`)
      const { context, page } =
        key === 'full' ? { context: null, page: fullPage } : await signIn(browser, base, accounts[key])

      for (const moduleKey of ['reservations', 'locations']) {
        const response = await page.request.get(exportUrl(moduleKey), { maxRedirects: 0 })
        const status = response.status()
        const body = await response.body()

        if (status !== expected) {
          check(false, `Export ${moduleKey} → attendu ${expected}`, `obtenu ${status}`)
          continue
        }

        if (expected === 200) {
          expectedExports += 1
          let xlsx
          try {
            xlsx = await inspectXlsx(body)
          } catch (error) {
            check(false, `Export ${moduleKey}`, `classeur illisible : ${error.message}`)
            continue
          }

          const disposition = response.headers()['content-disposition'] ?? ''
          check(
            xlsx.readable && xlsx.headers.length > 0 && /attachment/.test(disposition),
            `Export ${moduleKey} autorisé et relisible`,
            `« ${xlsx.sheet} » · ${xlsx.headers.length} colonnes · ${xlsx.rows} ligne(s)`
          )
        } else {
          expectedDenied += 1
          check(
            body.subarray(0, 2).toString('latin1') !== 'PK',
            `Export ${moduleKey} refusé AVANT production`,
            `HTTP ${status}, aucune archive`
          )
        }
      }

      if (context) await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — CONTENU DES CLASSEURS\n')

    {
      const withAmounts = await inspectXlsx(
        await (await fullPage.request.get(exportUrl('locations'), { maxRedirects: 0 })).body()
      )
      expectedExports += 1

      const { context, page } = await signIn(browser, base, accounts.minimal)
      const withoutAmounts = await inspectXlsx(
        await (await page.request.get(exportUrl('locations'), { maxRedirects: 0 })).body()
      )
      expectedExports += 1
      await context.close()

      check(
        withAmounts.headers.includes('Tarif verrouillé'),
        'Le tarif verrouillé sort avec le droit financier',
        withAmounts.headers.join(' · ')
      )
      check(
        !withoutAmounts.headers.includes('Tarif verrouillé') &&
          !withoutAmounts.headers.includes('Unité'),
        'La colonne DISPARAÎT sans ce droit, au lieu d’exister vide (DEC-017)',
        withoutAmounts.headers.join(' · ')
      )
      check(
        withoutAmounts.subtitle !== withAmounts.subtitle,
        'Le sous-titre du classeur dit ce qu’il contient',
        `« ${withoutAmounts.subtitle} » vs « ${withAmounts.subtitle} »`
      )

      /*
       * DEC-008 : aucun barème de retard, de carburant ni de kilométrage n'est
       * défini. Un classeur qui en afficherait un ferait autorité sur une règle
       * que personne n'a arrêtée.
       */
      const invented = withAmounts.headers.filter((h) =>
        /pénalit|penalit|frais|total|montant dû|montant du|carburant|surcoût|surcout/i.test(h)
      )
      check(invented.length === 0, 'Aucune valorisation inventée dans l’export', invented.join(', '))
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — ÉCRANS\n')

    {
      await fullPage.goto(`${base}/location/locations/${returned}`, { waitUntil: 'load' })
      check(
        (await fullPage.getByRole('heading', { name: 'Documents', exact: true }).count()) === 1,
        'La fiche propose ses documents'
      )
      // `exact` est indispensable : la description de la carte cite les pièces
      // qu'elle contient, et une recherche par sous-chaîne la confondrait avec
      // le titre d'une pièce réellement offerte.
      check(
        (await fullPage.getByText('Procès-verbal de retour', { exact: true }).count()) >= 1,
        'Le PV de retour est offert sur une location rentrée'
      )

      // Jamais partie : ni bon de départ, ni PV. Les proposer laisserait croire
      // qu'un état des lieux existe.
      await fullPage.goto(`${base}/location/locations/${confirmed}`, { waitUntil: 'load' })
      check(
        (await fullPage.getByText('Bon de départ', { exact: true }).count()) === 0 &&
          (await fullPage.getByText('Procès-verbal de retour', { exact: true }).count()) === 0,
        'Aucune pièce d’exécution n’est offerte avant le départ'
      )
      check(
        (await fullPage.getByText('Contrat de location', { exact: true }).count()) >= 1,
        'Le contrat, lui, existe dès la confirmation'
      )
      check(
        (await fullPage.getByText('Contrat.', { exact: true }).count()) === 1,
        'La carte n’annonce que les pièces réellement disponibles (DEC-017)'
      )

      await fullPage.goto(`${base}/location/locations`, { waitUntil: 'load' })
      check(
        (await fullPage.getByRole('link', { name: 'Exporter Excel' }).count()) >= 1,
        'La liste des locations propose son export'
      )
      await fullPage.goto(`${base}/location/reservations`, { waitUntil: 'load' })
      check(
        (await fullPage.getByRole('link', { name: 'Exporter Excel' }).count()) >= 1,
        'La liste des réservations propose son export'
      )

      await fullContext.close()

      const { context, page } = await signIn(browser, base, accounts.view)
      await page.goto(`${base}/location/locations/${returned}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('heading', { name: 'Documents', exact: true }).count()) === 0,
        'Sans droit documentaire, la carte Documents n’apparaît pas'
      )
      await page.goto(`${base}/location/locations`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Exporter Excel' }).count()) === 0,
        'Sans droit d’export, le bouton n’apparaît pas'
      )
      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — JOURNAL D’AUDIT\n')

    {
      const ids = Object.values(accounts).map((a) => a.id)

      const [{ count: exported }, { count: denied }, { count: noisy }] = await Promise.all([
        admin
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('action', 'EXPORT')
          .in('actor_id', ids),
        admin
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('action', 'ACCESS_DENIED')
          .in('actor_id', ids)
          .in('entity_type', ['rentals', 'reservations']),
        admin
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('action', 'EXPORT')
          .in('actor_id', ids)
          .ilike('reason', '%perçu%'),
      ])

      check(
        exported === expectedExports,
        'Chaque sortie de données est journalisée',
        `${exported} entrée(s), ${expectedExports} attendue(s)`
      )
      check(
        denied === expectedDenied,
        'Chaque refus est journalisé',
        `${denied} entrée(s), ${expectedDenied} attendue(s)`
      )
      check(!noisy, 'L’aperçu ne pollue pas le journal', `${noisy ?? 0} entrée(s)`)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — DONNÉES DEMO\n')

    {
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
    await browser.close()

    for (const { rentalId, reservationId } of fixtures.rentals) {
      const { data: inspections } = await admin
        .from('rental_inspections')
        .select('id')
        .eq('rental_id', rentalId)

      for (const inspection of inspections ?? []) {
        await admin.from('rental_inspection_photos').delete().eq('inspection_id', inspection.id)
      }

      await admin.from('rental_inspections').delete().eq('rental_id', rentalId)
      await admin.from('vehicle_occupations').delete().eq('source_id', rentalId)
      await admin.from('rentals').delete().eq('id', rentalId)
      await admin.from('vehicle_occupations').delete().eq('source_id', reservationId)
      await admin.from('reservations').delete().eq('id', reservationId)
    }

    if (fixtures.ruleId) await admin.from('pricing_rules').delete().eq('id', fixtures.ruleId)
    for (const vehicleId of fixtures.vehicleIds ?? []) {
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }
    if (fixtures.clientId) await admin.from('clients').delete().eq('id', fixtures.clientId)
    if (fixtures.categoryId)
      await admin.from('vehicle_categories').delete().eq('id', fixtures.categoryId)

    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
    console.log(`${DIM}Les entrées d'audit produites restent : le journal est immuable.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE DOCUMENTS DE LOCATION : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE DOCUMENTS DE LOCATION : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
