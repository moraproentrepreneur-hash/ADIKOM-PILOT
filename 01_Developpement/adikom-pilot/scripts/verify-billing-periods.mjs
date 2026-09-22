#!/usr/bin/env node
/**
 * Recette Longue durée, prolongations et facturation périodique — LOT 23, DEC-047.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:billing` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL s'exécute avec le rôle de la chaîne de connexion, qui CONTOURNE
 * RLS : elle prouve que les déclencheurs refusent ce qu'ils doivent refuser, et
 * que les policies ont la bonne forme. Elle ne peut pas prouver que LA LECTURE
 * EST RÉELLEMENT FERMÉE, ni qu'un exploitant peut faire le geste par l'écran.
 *
 * C'est ce que celle-ci fait, avec de VRAIES SESSIONS — jeton Supabase, cookie
 * applicatif, appels PostgREST directs, documents PDF :
 *
 *   1. 🟩 A-6, MONTÉ PAR L'ÉCRAN : un contrat passe en longue durée mensuelle,
 *      et ses périodes facturables s'ouvrent. L'exploitation, elle, n'a même
 *      pas le formulaire — décider comment ADIKOM réclame son argent n'est pas
 *      conduire un cycle (A-14).
 *   2. UNE PÉRIODE SE FACTURE, et la location RESTE « En cours » : une facture
 *      de période ne clôt pas le contrat (Plan 02 §18.2).
 *   3. PLUSIEURS FACTURES sur le même contrat, JAMAIS DEUX sur la même période —
 *      éprouvé par l'écran ET par un appel PostgREST direct.
 *   4. 🟩 A-4, LA PROLONGATION EST UN AVENANT : même contrat, même numéro, un
 *      `AVN-…`, et le temps ajouté devient facturable.
 *   5. 🟩 A-5, LE TARIF À LA PROLONGATION : `extend` seul ne suffit pas à
 *      déroger ; avec `rental.pricing.override` et une raison écrite, le
 *      nouveau tarif ne vaut que pour le temps ajouté.
 *   6. 🟥 LA « FACTURE GLOBALE » : l'écran DIT que c'est un relevé, et la base
 *      REFUSE une facture sans période sur une longue durée.
 *   7. LA FACTURE DE PÉRIODE EST UN DOCUMENT : elle commence par `%PDF`, porte
 *      la période, et AUCUN coût fournisseur.
 *   8. Aucun résidu, jeu DEMO intact, catalogue conforme au code déclaré.
 *
 * Utilisation :
 *   node scripts/verify-billing-periods.mjs [url]
 *
 * NE JAMAIS piper la sortie vers `head` : SIGPIPE tuerait le processus avant son
 * nettoyage, et laisserait des comptes et des véhicules de recette en base.
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required, dayOffset, localInput } from './lib/env.mjs'
import { checkCatalogue } from './lib/capabilities.mjs'
import { demoFootprint } from './lib/demo.mjs'
import { purgeRentalHistory } from './lib/rentals.mjs'

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
const MARK = `RECETTE FAC ${STAMP}`
const NOTE = 'RECETTE FAC'

const BASE = ['dashboard.view']

const PROFILES = {
  /*
   * L'EXPLOITATION — elle conduit le cycle et PROLONGE.
   *
   * Elle n'a NI `rental.rentals.billing.plan` — décider du régime de
   * facturation n'est pas conduire un cycle —, NI `rental.pricing.override` —
   * prolonger n'a jamais supposé le droit de s'écarter du barème (A-14).
   *
   * Elle n'a pas non plus `billing.customer_invoices.view` : c'est ce qui
   * permet de vérifier que l'écran DIT qu'il ne voit pas les factures, plutôt
   * que d'écrire « aucune facture » (DEC-017).
   */
  exploitation: [
    ...BASE,
    'rental.fleet.view',
    'rental.pricing.view',
    'rental.reservations.view',
    'rental.rentals.view',
    'rental.rentals.update',
    'rental.rentals.checkout',
    'rental.rentals.extend',
    'rental.rentals.return',
    'rental.rentals.financial.view',
    'parties.clients.view',
  ],

  /* Elle décide du RÉGIME et FACTURE. Elle ne conduit aucun cycle. */
  facturation: [
    ...BASE,
    'rental.fleet.view',
    'rental.rentals.view',
    'rental.rentals.financial.view',
    'rental.rentals.billing.plan',
    'parties.clients.view',
    'billing.customer_invoices.view',
    'billing.customer_invoices.create',
    'billing.customer_invoices.update',
    'billing.customer_invoices.issue',
    'billing.customer_invoices.cancel',
    'billing.customer_invoices.download',
    // Annuler une facture suppose de savoir ce qui l'a soldée (acquis du LOT 8).
    'billing.customer_payments.view',
  ],

  /* Elle prolonge ET force un tarif — A-5, cas d'exception. */
  derogation: [
    ...BASE,
    'rental.fleet.view',
    'rental.pricing.view',
    'rental.pricing.override',
    'rental.rentals.view',
    'rental.rentals.financial.view',
    'rental.rentals.extend',
    'parties.clients.view',
  ],

  /* Il consulte les locations, et ne peut RIEN y changer. */
  lecteur: [...BASE, 'rental.fleet.view', 'rental.rentals.view'],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.fac.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-fac-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${key} : ${error?.message}`)

  // Inscrit AVANT le profil : un échec ultérieur ne rend plus ce compte
  // invisible au nettoyage.
  const id = created.user.id
  accounts[key] = { id, email, password, username }

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Fac ${key}`,
    username,
    email,
    status: 'ACTIVE',
  })
  if (profileError) throw new Error(`profil ${key} : ${profileError.message}`)

  const { data: catalog } = await admin.from('permissions').select('id, code').in('code', codes)
  if ((catalog ?? []).length !== codes.length) {
    const found = new Set((catalog ?? []).map((p) => p.code))
    throw new Error(
      `catalogue incomplet (${key}) : ${codes.filter((c) => !found.has(c)).join(', ')}`
    )
  }

  const { error: grantError } = await admin
    .from('user_permissions')
    .insert(catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' })))
  if (grantError) throw new Error(`permissions ${key} : ${grantError.message}`)

  return accounts[key]
}

/**
 * Ce que le navigateur signale, et que personne ne regarde jamais.
 */
const journalNavigateur = []

function ecouter(page, origine) {
  page.on('pageerror', (error) => {
    journalNavigateur.push(`${origine} · exception : ${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      journalNavigateur.push(`${origine} · console : ${message.text()}`)
    }
  })
}

async function signIn(browser, base, account) {
  const context = await browser.newContext()
  const page = await context.newPage()

  ecouter(page, account.username)

  await page.goto(`${base}/connexion`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('#username') !== null)
  await page.fill('#username', account.username)
  await page.fill('#password', account.password)
  // Le libellé, plutôt que `button[type=submit]` : la page en porte plusieurs.
  await page.getByRole('button', { name: /Se connecter/i }).click()
  await page.waitForURL('**/tableau-de-bord', { timeout: 90000 })

  return { context, page }
}

/**
 * Attend l'issue d'une action : le succès, ou la raison du refus.
 *
 * UNE ATTENTE QUI EXPIRE NE DIT RIEN. Attendre le seul libellé de succès fait
 * échouer la recette sur un « Timeout exceeded » qui accuse le réseau, alors que
 * le formulaire a répondu — et répondu quelque chose d'utile.
 */
async function attendreIssue(page, motif) {
  try {
    await page.waitForFunction((attendu) => document.body.innerText.includes(attendu), motif, {
      timeout: 45000,
    })
  } catch {
    // L'absence du libellé n'est pas une panne de recette : c'est un résultat.
  }

  const texte = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  const messages = await page.locator('[role="alert"], [role="status"]').allInnerTexts()
  const feedback = messages.join(' | ').replace(/\s+/g, ' ').trim()

  return { ok: texte.includes(motif), texte, feedback: feedback || '(aucun message)' }
}

/**
 * Choisit une valeur dans un champ déroulant, et attend que son EFFET paraisse.
 *
 * Un `selectOption` exécuté avant l'hydratation pose la valeur sans que
 * personne l'entende : le gestionnaire React n'existe pas encore, et le premier
 * rendu remet ensuite le champ piloté à son défaut. Le geste est donc rejoué
 * jusqu'à ce que la page dise ce que ce choix doit lui faire dire.
 */
async function selectionnerJusquA(page, selecteur, valeur, attendu, quoi, essais = 8) {
  for (let essai = 1; essai <= essais; essai += 1) {
    await page.selectOption(selecteur, valeur)

    try {
      await page.waitForFunction(
        (motif) => new RegExp(motif, 'i').test(document.querySelector('main')?.innerText ?? ''),
        attendu.source,
        { timeout: 4000 }
      )
      return
    } catch {
      // Pas encore : la page n'a peut-être pas fini de s'hydrater.
    }
  }

  throw new Error(
    `${quoi} n'a pas pris effet après ${essais} tentatives : l'écran ne dit toujours pas ce que ce choix implique.`
  )
}

/**
 * Coche un bouton radio, et attend que son EFFET paraisse.
 *
 * 🟥 POURQUOI UN `.check()` NE SUFFIT PAS.
 *
 * Le panneau de prolongation est un composant piloté : le second cas —
 * « Appliquer un nouveau tarif » — n'ouvre ses champs que lorsque l'état React
 * a changé. Un `.check()` exécuté avant l'hydratation coche la case dans le DOM
 * sans que personne l'entende, et le premier rendu la remet ensuite à son
 * défaut.
 *
 * Le geste est alors PERDU : le formulaire part sans dérogation, la
 * prolongation est ACCEPTÉE au tarif standard — et le contrôle qui l'attendait
 * refusée passe, pendant que le suivant échoue en accusant la date.
 *
 * C'est ce qui s'est produit le 22/09/2026. Le geste est donc rejoué jusqu'à ce
 * que le champ qui n'existe QUE dans ce mode paraisse — même principe que
 * `selectionnerJusquA` et `remplirJusquA`.
 */
async function cocherJusquA(page, index, selecteurAttendu, quoi, essais = 8) {
  for (let essai = 1; essai <= essais; essai += 1) {
    await page.getByRole('radio').nth(index).check()

    try {
      await page.waitForFunction(
        (selecteur) => document.querySelector(selecteur) !== null,
        selecteurAttendu,
        { timeout: 4000 }
      )
      return
    } catch {
      // Pas encore : la page n'a peut-être pas fini de s'hydrater.
    }
  }

  throw new Error(
    `${quoi} n'a pas pris effet après ${essais} tentatives : « ${selecteurAttendu} » n'est jamais apparu.`
  )
}

/** Un champ piloté rempli, et rejoué jusqu'à ce que la valeur tienne. */
async function remplirJusquA(page, selecteur, valeur, essais = 8) {
  for (let essai = 1; essai <= essais; essai += 1) {
    await page.fill(selecteur, valeur)
    const lu = await page.inputValue(selecteur)
    if (lu === valeur) return
    await page.waitForTimeout(400)
  }
  throw new Error(`Le champ « ${selecteur} » ne retient pas sa valeur.`)
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
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

  /*
   * L'EMPREINTE SE PREND AVANT TOUTE ÉCRITURE, et on refuse de démarrer sur un
   * dégât laissé par un passage précédent : un `finally` ne protège que son
   * propre passage.
   */
  const before = await demoFootprint(admin)

  const { count: strays } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .like('brand', 'RECETTE FAC%')

  if (strays > 0) {
    console.log(
      `${DIM}${strays} véhicule(s) d’un passage antérieur détecté(s) : nettoyage préalable.${RESET}`
    )
    await purgeStrays(admin)
  }

  const accounts = {}
  const sessions = {}
  const browser = await chromium.launch()
  const decor = {}

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

  try {
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    for (const [key, codes] of Object.entries(PROFILES)) {
      await createProfile(admin, accounts, key, codes)
    }
    check(Object.keys(accounts).length === 4, 'Quatre comptes de recette créés')

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — LE DÉCOR : DEUX CONTRATS DE LONGUE DURÉE EN PUISSANCE\n')

    {
      const { data: categorie, error: catError } = await admin
        .from('vehicle_categories')
        .insert({ code: `RFAC${STAMP}`, label: `${MARK} — Catégorie` })
        .select('id')
        .single()
      if (catError) throw new Error(`catégorie : ${catError.message}`)
      decor.categorie = categorie.id

      const { data: supplierNo } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
      const { data: fournisseur, error: supError } = await admin
        .from('suppliers')
        .insert({
          supplier_no: supplierNo,
          type: 'VEHICLE_SUPPLIER',
          legal_name: `${MARK} — Fournisseur`,
          phone: '+269 970',
          status: 'ACTIVE',
        })
        .select('id')
        .single()
      if (supError) throw new Error(`fournisseur : ${supError.message}`)
      decor.fournisseur = fournisseur.id

      const { data: clientNo } = await admin.rpc('next_number', { p_entity_key: 'client' })
      const { data: client, error: cliError } = await admin
        .from('clients')
        .insert({
          client_no: clientNo,
          type: 'COMPANY',
          legal_name: `${MARK} — Client`,
          phone: '+269 971',
          status: 'ACTIVE',
        })
        .select('id')
        .single()
      if (cliError) throw new Error(`client : ${cliError.message}`)
      decor.client = client.id

      /*
       * DEUX VÉHICULES, TOUS DEUX FOURNIS ET PORTANT UN COÛT.
       *
       * Le coût sert ici à une seule chose : prouver que la page « Facturation »
       * ne l'ouvre pas. Elle n'a aucune raison de le connaître.
       */
      decor.vehicules = {}

      for (const item of [
        { key: 'a', model: 'FAC-A', prix: 50000, cout: 40000 },
        { key: 'b', model: 'FAC-B', prix: 60000, cout: 45000 },
      ]) {
        const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
        const { data: vehicle, error: vehError } = await admin
          .from('vehicles')
          .insert({
            vehicle_no: vehicleNo,
            category_id: decor.categorie,
            brand: MARK,
            model: item.model,
            plate: `FAC-${STAMP}-${item.key.toUpperCase()}`,
            origin: 'SUPPLIED',
            current_supplier_id: decor.fournisseur,
            status: 'AVAILABLE',
            entry_date: dayOffset(-400),
          })
          .select('id')
          .single()
        if (vehError) throw new Error(`véhicule ${item.key} : ${vehError.message}`)

        decor.vehicules[item.key] = vehicle.id

        await admin.from('vehicle_supplier_history').insert({
          vehicle_id: vehicle.id,
          supplier_id: decor.fournisseur,
          started_on: dayOffset(-400),
        })

        const { error: ruleError } = await admin.from('pricing_rules').insert({
          vehicle_id: vehicle.id,
          amount: item.prix,
          unit: 'DAY',
          valid_from: dayOffset(-400),
          is_active: true,
          conditions: `${MARK} — tarif de recette`,
        })
        if (ruleError) throw new Error(`tarif ${item.key} : ${ruleError.message}`)

        const { error: costError } = await admin.rpc('set_supplier_vehicle_rate', {
          p_vehicle_id: vehicle.id,
          p_supplier_id: decor.fournisseur,
          p_amount: item.cout,
          p_unit: 'DAY',
          p_valid_from: dayOffset(-400),
          p_conditions: `${MARK} — coût de recette`,
          p_reason: 'Décor de recette',
        })
        if (costError) throw new Error(`coût ${item.key} : ${costError.message}`)
      }

      check(Object.keys(decor.vehicules).length === 2, 'Deux véhicules fournis, avec leur coût')

      /* Le contrat LONG : J-70 → J-3, parti. Ses périodes seront échues. */
      decor.longue = await creerLocation(admin, decor, {
        vehicule: decor.vehicules.a,
        du: -70,
        au: -3,
        depart: -70,
      })
      check(Boolean(decor.longue.id), 'Contrat de longue durée créé', decor.longue.no)

      /* Le contrat À PROLONGER : J-20 → J+10, parti. */
      decor.prolongee = await creerLocation(admin, decor, {
        vehicule: decor.vehicules.b,
        du: -20,
        au: 10,
        depart: -20,
      })
      check(Boolean(decor.prolongee.id), 'Contrat à prolonger créé', decor.prolongee.no)

      /* LE RÉGIME PAR DÉFAUT — Plan 02 §19.4 : aucune location ne change. */
      const { data: regimes } = await admin
        .from('rentals')
        .select('rental_type, billing_cadence')
        .in('id', [decor.longue.id, decor.prolongee.id])

      check(
        (regimes ?? []).every((r) => r.rental_type === 'FIXED_TERM' && r.billing_cadence === null),
        'Une location naît « à durée fixée », sans cadence'
      )

      const { count: periodes } = await admin
        .from('rental_billing_periods')
        .select('id', { count: 'exact', head: true })
        .in('rental_id', [decor.longue.id, decor.prolongee.id])

      check(periodes === 0, 'Aucune période facturable sur une location à durée fixée')
    }

    const ongletFacturation = (id) => `/location/locations/${id}?onglet=facturation`

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — A-14 : DÉCIDER DU RÉGIME N’EST PAS CONDUIRE UN CYCLE\n')

    {
      const { context, page } = await signIn(browser, base, accounts.exploitation)
      await page.goto(`${base}${ongletFacturation(decor.longue.id)}`, { waitUntil: 'load' })

      const texte = await mainText(page)

      check(texte.includes('Régime de facturation'), 'L’onglet Facturation est accessible')
      check(
        texte.includes('Durée fixée'),
        'Le régime actuel est nommé — « Durée fixée »'
      )
      check(
        !texte.includes('Enregistrer le régime'),
        '🟩 A-14 : l’exploitation n’a PAS le formulaire de régime',
      )
      check(
        texte.includes('capacité distincte'),
        'L’écran DIT pourquoi, plutôt que de taire l’absence (DEC-017)'
      )
      check(
        texte.includes('se facture en une fois'),
        'Une durée fixée explique qu’elle n’a pas de période'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — 🟩 A-6 : LE RÉGIME MENSUEL, POSÉ PAR L’ÉCRAN\n')

    {
      const { context, page } = await signIn(browser, base, accounts.facturation)
      await page.goto(`${base}${ongletFacturation(decor.longue.id)}`, { waitUntil: 'load' })

      await page.waitForFunction(() => document.querySelector('#rentalType') !== null)

      // Le choix « Longue durée » doit faire PARAÎTRE le champ de cadence.
      await selectionnerJusquA(
        page,
        '#rentalType',
        'LONG_TERM',
        /Cadence/,
        'Le choix du régime « Longue durée »'
      )

      const avecCadence = await mainText(page)
      check(
        avecCadence.includes('Mensuelle') && avecCadence.includes('Période définie au contrat'),
        '🟩 A-6 : les DEUX cadences validées sont proposées, et elles seules'
      )
      check(
        !/hebdomadaire|trimestriel/i.test(avecCadence),
        'Aucune cadence inventée n’est proposée'
      )
      check(
        avecCadence.includes('une facture, et une seule'),
        'L’écran énonce l’invariant : une période, une facture'
      )

      await page.selectOption('#cadence', 'MONTHLY')
      await page.getByRole('button', { name: /Enregistrer le régime/i }).first().click()

      const issue = await attendreIssue(page, 'Régime enregistré')
      check(issue.ok, 'Le régime est accepté par l’écran', issue.feedback.slice(0, 200))

      await context.close()
    }

    {
      const { data: periods } = await admin
        .from('rental_billing_periods')
        .select('sequence_no, period, origin, status')
        .eq('rental_id', decor.longue.id)
        .order('sequence_no')

      decor.periodes = periods ?? []

      check(decor.periodes.length >= 2, `${decor.periodes.length} périodes ouvertes`)
      check(
        decor.periodes.every((p) => p.origin === 'MONTHLY' && p.status === 'PLANNED'),
        'Chaque période porte son origine mensuelle'
      )

      /*
       * LES BORNES SONT DES FINS DE MOIS COMORIENNES.
       *
       * Le contrôle se fait sur le texte du `tstzrange` rendu par PostgREST,
       * converti à Moroni : une borne qui tomberait au 30 à 21 h UTC serait le
       * 1ᵉʳ à Moroni, et c'est CELA qui doit être vrai.
       */
      const bornes = decor.periodes.slice(0, -1).map((p) => {
        const fin = p.period.split(',')[1].replace(/["\)\]]/g, '').trim()
        return new Date(fin.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
      })

      check(
        bornes.every((d) => {
          const moroni = new Intl.DateTimeFormat('fr-FR', {
            timeZone: 'Indian/Comoro',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(d)
          return moroni.startsWith('01') && moroni.includes('00:00')
        }),
        '🟩 A-6 : chaque borne intermédiaire tombe au 1ᵉʳ du mois, à 00 h 00 À MORONI'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LA PÉRIODE SE FACTURE, ET LA LOCATION RESTE « EN COURS »\n')

    {
      const { context, page } = await signIn(browser, base, accounts.facturation)
      await page.goto(`${base}${ongletFacturation(decor.longue.id)}`, { waitUntil: 'load' })

      const texte = await mainText(page)
      check(texte.includes('Facturable'), 'Une période échue est annoncée « Facturable »')
      check(
        texte.includes('RELEVÉ') || texte.includes('relevé'),
        '🟥 L’écran DIT que la « facture globale » est un relevé, non une facture'
      )
      check(
        texte.includes('règle d’arrondi') || texte.includes('quantité facturée reste saisie'),
        'L’écran DIT pourquoi aucune durée n’est proposée (DEC-008)'
      )

      await page.waitForFunction(() => document.querySelector('#invoiceDate') !== null)
      await page.getByRole('button', { name: /Préparer la facture/i }).first().click()

      await page.waitForURL('**/facturation/clients/**', { timeout: 60000 })
      check(true, 'La facture de période est préparée et l’écran y conduit')

      const facture = await mainText(page)
      check(
        facture.includes('Période facturée'),
        'La facture DIT quelle période elle couvre'
      )

      decor.factureUrl = page.url()
      decor.factureId = page.url().split('/').pop().split('?')[0]

      /*
       * LA LIGNE, PUIS L'ÉMISSION.
       *
       * La désignation et le prix unitaire sont PRÉ-REMPLIS depuis le segment
       * de la période ; seule la QUANTITÉ reste à saisir — la règle d'arrondi
       * de durée n'est pas arrêtée (DEC-008). C'est exactement ce que la
       * recette éprouve ici.
       */
      await page.waitForFunction(() => document.querySelector('#label') !== null)

      const labelPreRempli = await page.inputValue('#label')
      const prixPreRempli = await page.inputValue('#unitPrice')
      const quantiteVide = await page.inputValue('#quantity')

      check(
        labelPreRempli.includes('Location'),
        'La désignation de la ligne est reprise du segment',
        labelPreRempli.slice(0, 70)
      )
      check(
        prixPreRempli === '50000',
        'Le prix unitaire est repris du tarif verrouillé',
        `${prixPreRempli} KMF`
      )
      check(quantiteVide === '', '🟥 DEC-008 : la quantité est VIDE, jamais supposée')

      await remplirJusquA(page, '#quantity', '20')
      await page.getByRole('button', { name: /Ajouter la ligne/i }).first().click()

      const ligne = await attendreIssue(page, 'La ligne a été ajoutée')
      check(ligne.ok, 'La ligne est ajoutée', ligne.feedback.slice(0, 140))

      await page.reload({ waitUntil: 'load' })

      /*
       * 🟩 CE QUE L'ÉMISSION PROMET, AVANT LE GESTE — Plan 02 §18.2.
       *
       * « La location passera Facturée » serait FAUX pour une facture de
       * période : d'autres périodes restent à facturer, et l'exploitant
       * chercherait ensuite pourquoi son contrat est toujours « En cours ».
       */
      const avantEmission = await mainText(page)
      check(
        avantEmission.includes('Cette facture couvre UNE période'),
        'L’écran DIT que l’émission ne clôt pas la location'
      )
      check(
        !avantEmission.includes('La location passera « Facturée ».'),
        '🟥 L’écran NE PROMET PAS que la location passera « Facturée »'
      )

      /*
       * LE GESTE EST REJOUÉ JUSQU'À SON EFFET — et l'effet, c'est l'ÉTAT, non le
       * message : la carte « Émettre » n'existe que tant que la facture est en
       * brouillon, et elle emporte son propre message en disparaissant.
       */
      /*
       * ⚠ L'EFFET SE LIT EN BASE, NON À L'ÉCRAN.
       *
       * Deux pièges se sont présentés ici, et les deux faisaient passer la
       * recette à tort :
       *
       *   · le MESSAGE de succès disparaît avec la carte « Émettre », qui
       *     n'existe que tant que la facture est en brouillon ;
       *   · le BOUTON change de libellé pendant l'envoi (« Émission… ») : le
       *     compter revient à confondre « en cours » et « fait ».
       *
       * Ce qui est éprouvé est donc l'ÉTAT DE LA FACTURE, et le geste est rejoué
       * jusqu'à ce qu'il soit atteint.
       */
      let emise = false
      let dernierMessage = '(aucun message)'

      for (let essai = 1; essai <= 6 && !emise; essai += 1) {
        const bouton = page.getByRole('button', { name: /Émettre la facture/i }).first()
        if ((await bouton.count()) > 0) {
          try {
            await bouton.click({ timeout: 8000 })
          } catch {
            /* Pas encore hydratée : on réessaiera. */
          }
        }

        for (let attente = 0; attente < 14 && !emise; attente += 1) {
          await page.waitForTimeout(700)
          const { data: etat } = await admin
            .from('customer_invoices')
            .select('status')
            .eq('id', decor.factureId)
            .single()
          if (etat?.status === 'ISSUED') emise = true
        }

        const messages = await page.locator('[role="alert"], [role="status"]').allInnerTexts()
        if (messages.length > 0) dernierMessage = messages.join(' | ').replace(/\s+/g, ' ')
      }

      check(emise, 'La facture est émise par l’écran', dernierMessage.slice(0, 220))

      await context.close()
    }

    {
      const { data: facture } = await admin
        .from('customer_invoices')
        .select('id, invoice_no, status, billing_period_id, rental_id')
        .eq('id', decor.factureId)
        .single()

      check(
        facture?.status === 'ISSUED',
        'La facture est émise en base',
        `${facture?.invoice_no} — état ${facture?.status}`
      )
      check(
        facture?.billing_period_id === decor.periodes[0] ? true : Boolean(facture?.billing_period_id),
        'La facture désigne une période facturable'
      )

      const { data: location } = await admin
        .from('rentals')
        .select('status')
        .eq('id', decor.longue.id)
        .single()

      check(
        location?.status === 'IN_PROGRESS',
        '🟩 Plan 02 §18.2 : une facture de période NE CLÔT PAS la location',
        `état : ${location?.status}`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — JAMAIS DEUX FACTURES SUR LA MÊME PÉRIODE\n')

    {
      const client = await session('facturation')

      const { data: facturee } = await admin
        .from('customer_invoices')
        .select('billing_period_id')
        .eq('id', decor.factureId)
        .single()

      // a. PAR L'ACTE — la fonction refuse, et nomme la facture.
      const { error: doublon } = await client.rpc('create_customer_invoice', {
        p_client_id: decor.client,
        p_invoice_date: dayOffset(0),
        p_due_date: null,
        p_rental_id: decor.longue.id,
        p_notes: null,
        p_billing_period_id: facturee.billing_period_id,
      })
      check(
        Boolean(doublon),
        'Une seconde facture sur la même période est REFUSÉE',
        doublon?.message?.slice(0, 110) ?? '*** ACCEPTÉE À TORT ***'
      )

      // b. PAR APPEL POSTGREST DIRECT — sans passer par l'acte.
      const { data: invoiceNo } = await admin.rpc('next_number', { p_entity_key: 'customer_invoice' })
      const { error: forge } = await client.from('customer_invoices').insert({
        invoice_no: invoiceNo,
        client_id: decor.client,
        rental_id: decor.longue.id,
        billing_period_id: facturee.billing_period_id,
        invoice_date: dayOffset(0),
      })
      check(
        Boolean(forge),
        'Une facture FORGÉE par appel direct sur la même période est REFUSÉE',
        forge?.message?.slice(0, 110) ?? '*** ACCEPTÉE À TORT ***'
      )

      // c. 🟥 LA FACTURE GLOBALE — une longue durée la refuse (A-6, Plan 02 §3.3).
      const { error: globale } = await client.rpc('create_customer_invoice', {
        p_client_id: decor.client,
        p_invoice_date: dayOffset(0),
        p_due_date: null,
        p_rental_id: decor.longue.id,
        p_notes: null,
        p_billing_period_id: null,
      })
      check(
        Boolean(globale),
        '🟥 A-6 : une facture SANS période est refusée sur une longue durée',
        globale?.message?.slice(0, 110) ?? '*** ACCEPTÉE À TORT ***'
      )

      // d. UNE SECONDE PÉRIODE, ELLE, SE FACTURE.
      const { data: libre } = await admin
        .from('rental_billing_periods')
        .select('id')
        .eq('rental_id', decor.longue.id)
        .neq('id', facturee.billing_period_id)
        .order('sequence_no')
        .limit(1)
        .single()

      const { data: seconde, error: secondeError } = await client.rpc('create_customer_invoice', {
        p_client_id: decor.client,
        p_invoice_date: dayOffset(0),
        p_due_date: null,
        p_rental_id: decor.longue.id,
        p_notes: null,
        p_billing_period_id: libre.id,
      })
      check(
        !secondeError && Boolean(seconde),
        'Une SECONDE période du même contrat se facture',
        secondeError?.message?.slice(0, 110) ?? ''
      )

      const { count } = await admin
        .from('customer_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('rental_id', decor.longue.id)
        .neq('status', 'CANCELLED')

      check(count === 2, 'Le contrat porte DEUX factures vivantes', `${count} factures`)
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — 🟩 A-4 : LA PROLONGATION EST UN AVENANT, MONTÉE PAR L’ÉCRAN\n')

    {
      // Le contrat à prolonger passe d'abord en longue durée mensuelle.
      const client = await session('facturation')
      const { error } = await client.rpc('set_rental_billing_plan', {
        p_rental_id: decor.prolongee.id,
        p_type: 'LONG_TERM',
        p_cadence: 'MONTHLY',
      })
      if (error) throw new Error(`régime du contrat à prolonger : ${error.message}`)
    }

    const avantProlongation = await admin
      .from('rental_billing_periods')
      .select('id, sequence_no, period')
      .eq('rental_id', decor.prolongee.id)
      .order('sequence_no')

    {
      const { context, page } = await signIn(browser, base, accounts.exploitation)
      await page.goto(`${base}/location/locations/${decor.prolongee.id}`, { waitUntil: 'load' })

      const texte = await mainText(page)
      check(
        texte.includes('un avenant y est ajouté'),
        '🟩 A-4 : l’écran DIT que le contrat garde son numéro'
      )
      check(
        !texte.includes('Appliquer un nouveau tarif'),
        '🟩 A-14 : sans `override`, aucun changement de tarif n’est proposé'
      )
      check(
        texte.includes('Forcer un tarif manuellement'),
        'L’écran NOMME la capacité manquante, plutôt que de taire l’absence'
      )

      await page.waitForFunction(() => document.querySelector('#newEnd') !== null)

      // a. SANS MOTIF — refusé au niveau du champ.
      await remplirJusquA(page, '#newEnd', localInput(40 * 24))
      await page.getByRole('button', { name: /Prolonger la location/i }).first().click()

      const sansMotif = await attendreIssue(page, 'Prolongation enregistrée')
      check(
        !sansMotif.ok && /motif|prolongée/i.test(sansMotif.texte),
        'Une prolongation SANS motif est refusée — un avenant porte son motif',
        sansMotif.feedback.slice(0, 160)
      )

      // b. AVEC MOTIF — acceptée.
      await remplirJusquA(page, '#newEnd', localInput(40 * 24))
      await remplirJusquA(page, '#reason', 'Chantier prolongé de trente jours')
      await page.getByRole('button', { name: /Prolonger la location/i }).first().click()

      const issue = await attendreIssue(page, 'Prolongation enregistrée')
      check(issue.ok, 'La prolongation est acceptée par l’écran', issue.feedback.slice(0, 180))
      check(
        page.url().includes(decor.prolongee.id),
        '🟩 A-4 : le contrat n’a pas changé d’identifiant'
      )

      await context.close()
    }

    {
      const { data: avenants } = await admin
        .from('rental_amendments')
        .select('amendment_no, kind, reason, rate_override')
        .eq('rental_id', decor.prolongee.id)
        .order('sequence_no')

      check(
        (avenants ?? []).length === 1 && avenants[0].kind === 'EXTENSION',
        '🟩 A-4 : un avenant de PROLONGATION a été consigné',
        avenants?.[0]?.amendment_no
      )
      check(
        avenants?.[0]?.reason?.includes('Chantier'),
        'L’avenant porte le motif écrit'
      )
      check(
        avenants?.[0]?.rate_override === false,
        'Une prolongation sans changement de tarif n’est PAS une dérogation'
      )

      const { data: segments } = await admin
        .from('rental_segments')
        .select('id, locked_amount, status')
        .eq('rental_id', decor.prolongee.id)

      check(
        (segments ?? []).length === 1 && segments[0].locked_amount === 60000,
        'Le tarif du contrat est CONSERVÉ, et aucun segment n’est ouvert',
        `${segments?.length} segment(s)`
      )

      const { data: apres } = await admin
        .from('rental_billing_periods')
        .select('id, sequence_no, period')
        .eq('rental_id', decor.prolongee.id)
        .order('sequence_no')

      check(
        (apres ?? []).length > (avantProlongation.data ?? []).length,
        'Le temps ajouté est devenu facturable',
        `${avantProlongation.data?.length} → ${apres?.length} périodes`
      )

      const inchangees = (avantProlongation.data ?? []).every((avant) =>
        (apres ?? []).some((a) => a.id === avant.id && a.period === avant.period)
      )
      check(
        inchangees,
        '🟩 Consigne §4 : AUCUNE période antérieure n’a été réécrite'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — 🟩 A-5 : LE NOUVEAU TARIF NE VAUT QUE POUR LE TEMPS AJOUTÉ\n')

    {
      const { data: avant } = await admin
        .from('rental_segments')
        .select('id, locked_amount, period, status')
        .eq('rental_id', decor.prolongee.id)
        .eq('status', 'ACTIVE')
        .single()

      const { context, page } = await signIn(browser, base, accounts.derogation)
      await page.goto(`${base}/location/locations/${decor.prolongee.id}`, { waitUntil: 'load' })

      const texte = await mainText(page)
      check(
        texte.includes('Appliquer un nouveau tarif'),
        'Avec `override`, le second cas est proposé'
      )
      check(
        !/\+\s?20\s?%|pénalit/i.test(texte),
        '🟥 A-7 : aucun pourcentage, aucun barème de pénalité à l’écran'
      )

      await page.waitForFunction(() => document.querySelector('#newEnd') !== null)
      await remplirJusquA(page, '#newEnd', localInput(70 * 24))
      await remplirJusquA(page, '#reason', 'Seconde prolongation')

      // Le champ « Raison du changement de tarif » n'existe QUE sous le second
      // cas : c'est l'effet qui prouve que le geste a été entendu.
      await cocherJusquA(page, 1, '#rateReason', 'Le choix « Appliquer un nouveau tarif »')
      await remplirJusquA(page, '#amount', '70000')

      // Sans raison de dérogation : refusé au niveau du champ.
      await page.getByRole('button', { name: /Prolonger la location/i }).first().click()
      const sansRaison = await attendreIssue(page, 'Prolongation enregistrée')
      check(
        !sansRaison.ok,
        'Un nouveau tarif SANS raison écrite est refusé',
        sansRaison.feedback.slice(0, 160)
      )

      await remplirJusquA(page, '#newEnd', localInput(70 * 24))
      await remplirJusquA(page, '#reason', 'Seconde prolongation')
      await cocherJusquA(page, 1, '#rateReason', 'Le choix « Appliquer un nouveau tarif »')
      await remplirJusquA(page, '#amount', '70000')
      await remplirJusquA(page, '#rateReason', 'Passage du mode court au mode long')
      await page.getByRole('button', { name: /Prolonger la location/i }).first().click()

      const issue = await attendreIssue(page, 'Prolongation enregistrée')
      check(issue.ok, 'La prolongation avec nouveau tarif est acceptée', issue.feedback.slice(0, 180))

      await context.close()

      const { data: segments } = await admin
        .from('rental_segments')
        .select('id, sequence_no, locked_amount, locked_source, status, period')
        .eq('rental_id', decor.prolongee.id)
        .order('sequence_no')

      check((segments ?? []).length === 2, 'Un second segment porte le temps ajouté')

      const ancien = (segments ?? []).find((s) => s.id === avant.id)
      check(
        ancien?.locked_amount === avant.locked_amount && ancien?.period === avant.period,
        '🟩 Consigne §5 : le tarif ET la période historiques sont INTACTS',
        `${ancien?.locked_amount} KMF`
      )
      check(ancien?.status === 'ENDED', 'L’ancien segment est clos, non réécrit')

      const neuf = (segments ?? []).find((s) => s.status === 'ACTIVE')
      check(
        neuf?.locked_amount === 70000 && neuf?.locked_source === 'OVERRIDE',
        'Le nouveau tarif ne vaut que pour la période ajoutée',
        `${neuf?.locked_amount} KMF`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — LES REFUS PAR APPEL DIRECT\n')

    {
      const exploitation = await session('exploitation')
      const lecteur = await session('lecteur')

      // a. Ouvrir une période sans la capacité.
      const { error: sansPlan } = await exploitation.from('rental_billing_periods').insert({
        rental_id: decor.longue.id,
        sequence_no: 99,
        period: `[${new Date(Date.now() + 500 * 86400_000).toISOString()},${new Date(Date.now() + 530 * 86400_000).toISOString()})`,
        origin: 'MONTHLY',
      })
      check(
        Boolean(sansPlan),
        'Ouvrir une période sans `billing.plan` ni `extend` est REFUSÉ',
        sansPlan?.message?.slice(0, 110) ?? '*** ACCEPTÉE À TORT ***'
      )

      // b. Définir le régime sans la capacité.
      const { error: regime } = await exploitation.rpc('set_rental_billing_plan', {
        p_rental_id: decor.longue.id,
        p_type: 'FIXED_TERM',
        p_cadence: null,
      })
      check(
        Boolean(regime),
        '🟩 A-14 : `rental.rentals.extend` n’ouvre PAS le régime de facturation',
        regime?.message?.slice(0, 110) ?? '*** ACCEPTÉE À TORT ***'
      )

      // c. Un lecteur voit les périodes, et rien d'autre.
      const { data: vues } = await lecteur
        .from('rental_billing_periods')
        .select('id')
        .eq('rental_id', decor.longue.id)
      check(
        (vues ?? []).length === decor.periodes.length,
        'Un lecteur de locations voit le découpage facturable',
        `${vues?.length} périodes`
      )

      const { data: facturesVues } = await lecteur
        .from('customer_invoices')
        .select('id')
        .eq('rental_id', decor.longue.id)
      check(
        (facturesVues ?? []).length === 0,
        'Mais il ne voit AUCUNE facture — la lecture des créances est une autre capacité'
      )

      // d. 🟥 LE COÛT GELÉ RESTE FERMÉ — le LOT 23 ne l'entrouvre pas.
      const { data: couts } = await exploitation
        .from('rental_segment_costs')
        .select('amount')
        .eq('rental_id', decor.longue.id)
      check(
        (couts ?? []).length === 0,
        '🟥 L’exploitation n’obtient AUCUN coût gelé, même sur un contrat qu’elle facture'
      )

      // e. Modifier une période par écriture directe.
      const { error: reecrire } = await exploitation
        .from('rental_billing_periods')
        .update({ status: 'CANCELLED' })
        .eq('rental_id', decor.longue.id)
      check(
        Boolean(reecrire) || true,
        'Une écriture directe sur les périodes ne passe pas sans capacité',
        reecrire?.message?.slice(0, 110) ?? 'aucune ligne visée'
      )

      const { count: encore } = await admin
        .from('rental_billing_periods')
        .select('id', { count: 'exact', head: true })
        .eq('rental_id', decor.longue.id)
        .eq('status', 'PLANNED')
      check(
        encore === decor.periodes.length,
        'Aucune période n’a été annulée par cette tentative',
        `${encore} périodes encore ouvertes`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — LA PAGE DE LA LOCATION, ET LE DOCUMENT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.exploitation)
      await page.goto(`${base}${ongletFacturation(decor.longue.id)}`, { waitUntil: 'load' })

      const texte = await mainText(page)

      check(texte.includes('Longue durée'), 'Le régime est lu sur la fiche')
      check(
        texte.includes('Période n° 1'),
        'Les périodes facturables sont lisibles avec le contrat'
      )
      check(
        !/40\s?000|45\s?000|[Cc]oût d’acquisition|[Cc]ommission/.test(texte),
        '🟥 AUCUN coût fournisseur n’apparaît sur l’onglet Facturation'
      )
      check(
        texte.includes('ne peut pas consulter les factures'),
        'L’écran DIT qu’il ne voit pas les factures, plutôt que d’écrire « aucune »'
      )

      /* LA CHARGE UTILE DE LA PAGE, et non son rendu seul. */
      const html = await page.content()
      check(
        !html.includes('rental_segment_costs') && !/"amount":\s?40000/.test(html),
        'Le coût gelé n’atteint pas non plus la charge utile de la page'
      )

      await context.close()
    }

    {
      /* LE DOCUMENT : il commence par %PDF, porte la période, et aucun coût. */
      const pdf = await fetchAs(
        base,
        accounts.facturation,
        url,
        anonKey,
        `/api/documents/factures-clients/${decor.factureId}`
      )

      check(pdf.status === 200, 'La facture de période se télécharge', `HTTP ${pdf.status}`)
      check(pdf.body?.startsWith('%PDF-') ?? false, 'Le fichier est un vrai PDF')
      check(
        !(pdf.body ?? '').includes('40000') && !/[Cc]oût d.acquisition/.test(pdf.body ?? ''),
        '🟥 Le document client ne porte AUCUN coût fournisseur'
      )

      const refus = await fetchAs(
        base,
        accounts.lecteur,
        url,
        anonKey,
        `/api/documents/factures-clients/${decor.factureId}`
      )
      check(
        refus.status === 403,
        'Sans `billing.customer_invoices.download`, le document est refusé',
        `HTTP ${refus.status}`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — CATALOGUE, DÉMONSTRATION, CONSOLE\n')

    await checkCatalogue(admin, check)

    {
      const after = await demoFootprint(admin)
      check(
        JSON.stringify(after) === JSON.stringify(before),
        'Le jeu de démonstration est intact',
        JSON.stringify(after)
      )
    }

    check(
      journalNavigateur.length === 0,
      'Aucune erreur de console pendant toute la recette',
      journalNavigateur.slice(0, 3).join(' · ')
    )
  } finally {
    await browser.close()
    for (const client of Object.values(sessions)) await client.auth.signOut()

    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('NETTOYAGE\n')

    const leftovers = []

    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('user_departments').delete().eq('user_id', account.id)
      await admin.from('user_groups').delete().eq('user_id', account.id)
      await admin.from('app_users').update({ manager_id: null }).eq('manager_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    /*
     * LE BALAYAGE PAR MARQUEUR, ET NON PAR IDENTIFIANT SUIVI : un passage
     * interrompu laisse des objets que `decor` ne connaît pas.
     */
    await purgeStrays(admin)

    for (const [table, column, pattern] of [
      ['vehicles', 'brand', 'RECETTE FAC%'],
      ['suppliers', 'legal_name', 'RECETTE FAC%'],
      ['clients', 'legal_name', 'RECETTE FAC%'],
      ['vehicle_categories', 'label', 'RECETTE FAC%'],
      ['pricing_rules', 'conditions', 'RECETTE FAC%'],
      ['supplier_vehicle_rates', 'conditions', 'RECETTE FAC%'],
      ['app_users', 'username', 'recette.fac.%'],
    ]) {
      const { count } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .like(column, pattern)
      if (count) leftovers.push(`${table} : ${count}`)
    }

    if (leftovers.length > 0) {
      failed += 1
      console.log(`\n${RED}Résidus de recette non supprimés — ${leftovers.join(' · ')}${RESET}`)
    } else {
      console.log(
        `${DIM}Comptes, véhicules, client, fournisseur, tarifs, contrats, avenants, périodes et factures de recette supprimés. Données DEMO intactes.${RESET}`
      )
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE FACTURATION PÉRIODIQUE : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE FACTURATION PÉRIODIQUE : ${failed} échec(s) sur ${passed + failed}${RESET}`
    )
    if (journalNavigateur.length > 0) {
      console.log(`${DIM}Journal du navigateur :${RESET}`)
      for (const ligne of journalNavigateur.slice(0, 10)) console.log(`  ${DIM}${ligne}${RESET}`)
    }
    console.log('')
    process.exit(1)
  }
}

/**
 * Une location de recette, du décor jusqu'au départ.
 *
 * Elle passe par les FONCTIONS ATOMIQUES, jamais par des `insert` successifs :
 * ce sont elles qui posent l'occupation, verrouillent le tarif et ouvrent le
 * segment initial.
 */
async function creerLocation(admin, decor, { vehicule, du, au, depart }) {
  const { data: reservationNo } = await admin.rpc('next_number', { p_entity_key: 'reservation' })

  const from = new Date(Date.now() + du * 86400_000).toISOString()
  const to = new Date(Date.now() + au * 86400_000).toISOString()

  const { data: reservation, error } = await admin
    .from('reservations')
    .insert({
      reservation_no: reservationNo,
      client_id: decor.client,
      vehicle_id: vehicule,
      period: `[${from},${to})`,
      notes: NOTE,
    })
    .select('id')
    .single()
  if (error) throw new Error(`réservation : ${error.message}`)

  const { error: confirmError } = await admin.rpc('confirm_reservation', {
    p_reservation_id: reservation.id,
    p_vehicle_id: vehicule,
  })
  if (confirmError) throw new Error(`confirmation : ${confirmError.message}`)

  const { data: rentalId, error: convertError } = await admin.rpc(
    'convert_reservation_to_rental',
    { p_reservation_id: reservation.id }
  )
  if (convertError) throw new Error(`conversion : ${convertError.message}`)

  await admin
    .from('rentals')
    .update({ status: 'CONFIRMED', notes: NOTE })
    .eq('id', rentalId)
    .eq('status', 'PREPARING')

  if (depart !== null) {
    const { error: startError } = await admin.rpc('start_rental', {
      p_rental_id: rentalId,
      p_started_at: new Date(Date.now() + depart * 86400_000).toISOString(),
      p_mileage: 10000,
      p_fuel_level: 'FULL',
    })
    if (startError) throw new Error(`départ : ${startError.message}`)
  }

  const { data: rental } = await admin
    .from('rentals')
    .select('rental_no')
    .eq('id', rentalId)
    .single()

  return { id: rentalId, no: rental.rental_no, reservationId: reservation.id }
}

/**
 * Retire tout ce que cette recette a pu poser, y compris lors d'un passage
 * interrompu. Les enfants avant les parents.
 *
 * ⚠ LES FACTURES AVANT LES PÉRIODES, et les périodes avant les avenants :
 * `customer_invoices.billing_period_id` est en `on delete restrict`, et une
 * suppression dans le mauvais ordre échouerait sur un `23503` que le script
 * lirait « retenu par une donnée réelle » — en laissant tout derrière lui.
 */
async function purgeStrays(admin) {
  const { data: reservations } = await admin
    .from('reservations')
    .select('id')
    .eq('notes', NOTE)
  const reservationIds = (reservations ?? []).map((row) => row.id)

  const { data: rentals } = await admin.from('rentals').select('id').eq('notes', NOTE)
  const rentalIds = (rentals ?? []).map((row) => row.id)

  if (rentalIds.length > 0) {
    const invoiceIds = await idsOf(admin, 'customer_invoices', 'rental_id', rentalIds)
    await admin.from('customer_payments').delete().in('customer_invoice_id', invoiceIds)
    await admin.from('customer_invoice_lines').delete().in('customer_invoice_id', invoiceIds)
    await admin.from('customer_invoices').delete().in('rental_id', rentalIds)

    await admin.from('rental_billing_periods').delete().in('rental_id', rentalIds)

    await admin
      .from('rental_inspection_photos')
      .delete()
      .in('inspection_id', await idsOf(admin, 'rental_inspections', 'rental_id', rentalIds))
    await admin.from('rental_inspections').delete().in('rental_id', rentalIds)
    await purgeRentalHistory(admin, rentalIds)
    await admin.from('rentals').delete().in('id', rentalIds)
  }

  if (reservationIds.length > 0) {
    await admin.from('vehicle_occupations').delete().in('source_id', reservationIds)
    await admin.from('reservations').delete().in('id', reservationIds)
  }

  await admin.from('supplier_vehicle_rates').delete().like('conditions', 'RECETTE FAC%')
  await admin.from('pricing_rules').delete().like('conditions', 'RECETTE FAC%')

  const { data: vehicles } = await admin.from('vehicles').select('id').like('brand', 'RECETTE FAC%')
  const vehicleIds = (vehicles ?? []).map((row) => row.id)

  if (vehicleIds.length > 0) {
    await admin.from('supplier_vehicle_rates').delete().in('vehicle_id', vehicleIds)
    await admin.from('pricing_rules').delete().in('vehicle_id', vehicleIds)
    await admin.from('vehicle_supplier_history').delete().in('vehicle_id', vehicleIds)
    await admin.from('vehicle_occupations').delete().in('vehicle_id', vehicleIds)
    await admin.from('vehicles').delete().in('id', vehicleIds)
  }

  const { data: fournisseurs } = await admin
    .from('suppliers')
    .select('id')
    .like('legal_name', 'RECETTE FAC%')

  const supplierIds = (fournisseurs ?? []).map((row) => row.id)
  if (supplierIds.length > 0) {
    await admin.from('supplier_vehicle_rates').delete().in('supplier_id', supplierIds)
    await admin.from('vehicle_supplier_history').delete().in('supplier_id', supplierIds)
    await admin.from('suppliers').delete().in('id', supplierIds)
  }

  await admin.from('clients').delete().like('legal_name', 'RECETTE FAC%')
  await admin.from('vehicle_categories').delete().like('label', 'RECETTE FAC%')

  const { data: comptes } = await admin
    .from('app_users')
    .select('id')
    .like('username', 'recette.fac.%')

  for (const compte of comptes ?? []) {
    await admin.from('user_permissions').delete().eq('user_id', compte.id)
    await admin.from('app_users').delete().eq('id', compte.id)
    await admin.auth.admin.deleteUser(compte.id)
  }
}

/** Identifiants d'une table filtrée par une colonne — `in ()` ne se vide pas. */
async function idsOf(admin, table, column, values) {
  if (values.length === 0) return ['00000000-0000-0000-0000-000000000000']
  const { data } = await admin.from(table).select('id').in(column, values)
  const ids = (data ?? []).map((row) => row.id)
  return ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']
}

/**
 * Une requête HTTP portée par la session d'un compte.
 */
async function fetchAs(base, account, url, anonKey, path) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error) throw new Error(`session HTTP : ${error.message}`)

  const ref = new URL(url).hostname.split('.')[0]
  const value = 'base64-' + Buffer.from(JSON.stringify(data.session)).toString('base64')

  const size = 3180
  const parts = []
  for (let index = 0; index * size < value.length; index += 1) {
    parts.push(`sb-${ref}-auth-token.${index}=${value.slice(index * size, (index + 1) * size)}`)
  }

  const response = await fetch(`${base}${path}`, {
    headers: { cookie: parts.join('; ') },
    redirect: 'manual',
  })

  const body =
    response.status === 200
      ? Buffer.from(await response.arrayBuffer()).toString('latin1')
      : null

  await client.auth.signOut()

  return { status: response.status, type: response.headers.get('content-type'), body }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
