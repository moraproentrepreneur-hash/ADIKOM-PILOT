#!/usr/bin/env node
/**
 * Recette Avenants, segments et remplacement de véhicule — LOT 22, DEC-045.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:amendments` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL s'exécute avec le rôle de la chaîne de connexion, qui CONTOURNE
 * RLS : elle prouve que les déclencheurs refusent ce qu'ils doivent refuser, et
 * que les policies ont la bonne forme. Elle ne peut pas prouver que LA LECTURE
 * EST RÉELLEMENT FERMÉE, ni qu'un exploitant peut faire le geste par l'écran.
 *
 * C'est ce que celle-ci fait, avec de VRAIES SESSIONS — jeton Supabase, cookie
 * applicatif, appels PostgREST directs, documents PDF :
 *
 *   1. 🟩 LE CAS DE LA DIRECTION, MONTÉ PAR L'ÉCRAN : un exploitant remplace le
 *      véhicule d'une location en cours. MÊME CONTRAT, même identifiant, un
 *      avenant, deux périodes contiguës (A-4).
 *   2. Le client paie le tarif du NOUVEAU véhicule — 50 000 → 60 000 — et
 *      l'ancien reste lisible sur la période qu'il a couverte (A-5, ordinaire).
 *   3. 🟩 L'EXCEPTION : `rental.rentals.swap` NE SUFFIT PAS pour déroger. Avec
 *      `rental.pricing.override` et une raison écrite, le client garde son tarif
 *      — et l'acte est journalisé sous `PRICE_CHANGE` (A-5, cas d'exception).
 *   4. LE COÛT GELÉ N'ATTEINT PAS L'EXPLOITANT : ni par la table, ni par
 *      l'écran, ni par la charge utile de la page, ni par le PDF. Le porteur de
 *      `rental.pricing.supplier.view`, lui, lit les deux commissions.
 *   5. Une saisie RÉTROACTIVE de tarif fournisseur ne déplace plus le coût gelé.
 *   6. Un véhicule INDISPONIBLE est refusé, et le refus ne laisse rien derrière.
 *   7. L'AVENANT EST UN DOCUMENT : il commence par `%PDF`, et ne porte aucun coût.
 *   8. Aucun résidu, jeu DEMO intact, catalogue conforme au code déclaré.
 *
 * Utilisation :
 *   node scripts/verify-amendments.mjs [url]
 *
 * NE JAMAIS piper la sortie vers `head` : SIGPIPE tuerait le processus avant son
 * nettoyage, et laisserait des comptes et des véhicules de recette en base.
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required, dayOffset, localInput } from './lib/env.mjs'
import { checkCatalogue } from './lib/capabilities.mjs'
import { demoFootprint } from './lib/demo.mjs'

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
const MARK = `RECETTE AVN ${STAMP}`

const BASE = ['dashboard.view']

const PROFILES = {
  /*
   * L'EXPLOITATION — le cœur de la recette.
   *
   * Elle conduit tout le cycle, REMPLACE un véhicule, voit les montants du
   * contrat, produit les documents et lit le JOURNAL. Elle n'a AUCUNE capacité
   * de coût fournisseur et AUCUNE capacité de dérogation tarifaire.
   *
   * `users.audit.view` est délibérée : sans elle, le refus du journal prouverait
   * seulement qu'elle ne lit pas le journal. Avec elle, il prouve ce qui compte
   * — lire le journal n'ouvre pas le coût (DEC-038).
   */
  exploitation: [
    ...BASE,
    'rental.fleet.view',
    'rental.pricing.view',
    'rental.reservations.view',
    'rental.rentals.view',
    'rental.rentals.create',
    'rental.rentals.update',
    'rental.rentals.checkout',
    'rental.rentals.extend',
    'rental.rentals.return',
    'rental.rentals.cancel',
    'rental.rentals.swap',
    'rental.rentals.financial.view',
    'rental.rentals.download',
    'rental.rentals.print',
    'parties.clients.view',
    'users.audit.view',
  ],

  /* L'exploitation, PLUS la dérogation tarifaire — A-5, cas d'exception. */
  avenant: [
    ...BASE,
    'rental.fleet.view',
    'rental.pricing.view',
    'rental.pricing.override',
    'rental.rentals.view',
    'rental.rentals.update',
    'rental.rentals.swap',
    'rental.rentals.financial.view',
    'parties.clients.view',
  ],

  /* Il lit les coûts d'acquisition, et voit donc les commissions par période. */
  couts: [
    ...BASE,
    'rental.pricing.supplier.view',
    'rental.pricing.supplier.create',
    'rental.pricing.supplier.update',
    'rental.fleet.view',
    'rental.rentals.view',
    'rental.rentals.financial.view',
    'parties.suppliers.view',
  ],

  /* Il consulte les locations, et ne peut RIEN y changer. */
  lecteur: [...BASE, 'rental.fleet.view', 'rental.rentals.view', 'rental.rentals.financial.view'],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.avn.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-avn-${STAMP}`

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
    last_name: `Avn ${key}`,
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
 *
 * Une exception non rattrapée ou une erreur de console ne fait échouer aucun
 * contrôle : l'écran s'affiche, la recette passe, et le défaut vit sa vie
 * jusqu'à ce qu'un utilisateur tombe dessus.
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
 * Attend l'issue d'un avenant : le succès, ou la raison du refus.
 *
 * UNE ATTENTE QUI EXPIRE NE DIT RIEN. Attendre le seul libellé de succès fait
 * échouer la recette sur un « Timeout exceeded » qui accuse le réseau, alors que
 * le formulaire a répondu — et répondu quelque chose d'utile.
 *
 * ET ON NE CHERCHE PAS « refusé » DANS LA PAGE ENTIÈRE : l'écran porte des
 * phrases d'aide qui contiennent ce mot — « un véhicule déjà engagé sera
 * refusé ». Une attente ainsi écrite se satisfait AVANT le premier clic, et la
 * recette valide un refus qui n'a pas eu lieu. On attend donc le libellé du
 * SUCCÈS, borné dans le temps, puis on RAPPORTE ce que la page dit.
 */
async function attendreIssue(page, motif = 'Avenant enregistré') {
  try {
    await page.waitForFunction((attendu) => document.body.innerText.includes(attendu), motif, {
      timeout: 45000,
    })
  } catch {
    // L'absence du libellé n'est pas une panne de recette : c'est un résultat.
  }

  const texte = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

  /*
   * LE MESSAGE DU FORMULAIRE, ET NON LA PAGE ENTIÈRE.
   *
   * `Notice` porte `role="alert"` pour une erreur et `role="status"` pour un
   * succès : c'est là que l'action répond. Un détail d'échec qui montre le haut
   * de la page n'aide personne ; celui-ci montre ce que l'écran a dit.
   */
  const messages = await page.locator('[role="alert"], [role="status"]').allInnerTexts()
  const feedback = messages.join(' | ').replace(/\s+/g, ' ').trim()

  return { ok: texte.includes(motif), texte, feedback: feedback || '(aucun message)' }
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/** Les chiffres d'un montant, sans ses espaces insécables. */
function digits(text) {
  return text.replace(/[  \s]/g, '')
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
    .like('brand', 'RECETTE AVN%')

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
    /* --- Sujets de recette ------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    for (const [key, codes] of Object.entries(PROFILES)) {
      await createProfile(admin, accounts, key, codes)
    }
    check(Object.keys(accounts).length === 4, 'Quatre comptes de recette créés')

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — LE DÉCOR : UN CLIENT, TROIS VÉHICULES, DEUX COÛTS\n')

    {
      const { data: categorie, error: catError } = await admin
        .from('vehicle_categories')
        .insert({ code: `RAVN${STAMP}`, label: `${MARK} — Catégorie` })
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
          phone: '+269 960',
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
          phone: '+269 961',
          status: 'ACTIVE',
        })
        .select('id')
        .single()
      if (cliError) throw new Error(`client : ${cliError.message}`)
      decor.client = client.id

      /*
       * TROIS VÉHICULES, TROIS SITUATIONS :
       *
       *   · A  fourni, tarif 50 000, coût 40 000  → commission 10 000
       *   · B  fourni, tarif 60 000, coût 45 000  → commission 15 000
       *   · C  fourni, tarif 55 000, AUCUN coût   → commission NON CALCULÉE
       */
      const plan = [
        { key: 'a', model: 'AVN-A', prix: 50000, cout: 40000 },
        { key: 'b', model: 'AVN-B', prix: 60000, cout: 45000 },
        { key: 'c', model: 'AVN-C', prix: 55000, cout: null },
      ]

      decor.vehicules = {}

      for (const item of plan) {
        const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
        const { data: vehicle, error: vehError } = await admin
          .from('vehicles')
          .insert({
            vehicle_no: vehicleNo,
            category_id: decor.categorie,
            brand: MARK,
            model: item.model,
            plate: `AVN-${STAMP}-${item.key.toUpperCase()}`,
            origin: 'SUPPLIED',
            current_supplier_id: decor.fournisseur,
            status: 'AVAILABLE',
            entry_date: dayOffset(-200),
          })
          .select('id')
          .single()
        if (vehError) throw new Error(`véhicule ${item.key} : ${vehError.message}`)

        decor.vehicules[item.key] = vehicle.id

        await admin.from('vehicle_supplier_history').insert({
          vehicle_id: vehicle.id,
          supplier_id: decor.fournisseur,
          started_on: dayOffset(-200),
        })

        // TARIF CLIENT AU VÉHICULE (spécificité 2) : aucune règle de portée
        // identique à celles du parc réel, donc DEC-002 reste hors d'atteinte.
        const { error: ruleError } = await admin.from('pricing_rules').insert({
          vehicle_id: vehicle.id,
          amount: item.prix,
          unit: 'DAY',
          valid_from: dayOffset(-200),
          is_active: true,
          conditions: `${MARK} — tarif de recette`,
        })
        if (ruleError) throw new Error(`tarif ${item.key} : ${ruleError.message}`)

        if (item.cout !== null) {
          const { error: costError } = await admin.rpc('set_supplier_vehicle_rate', {
            p_vehicle_id: vehicle.id,
            p_supplier_id: decor.fournisseur,
            p_amount: item.cout,
            p_unit: 'DAY',
            p_valid_from: dayOffset(-200),
            p_conditions: `${MARK} — coût de recette`,
            p_reason: 'Décor de recette',
          })
          if (costError) throw new Error(`coût ${item.key} : ${costError.message}`)
        }
      }

      check(Object.keys(decor.vehicules).length === 3, 'Trois véhicules fournis créés')

      /* --- LA LOCATION EN COURS, sur le véhicule A ------------------------ */
      decor.location = await creerLocation(admin, decor, {
        vehicule: decor.vehicules.a,
        du: -10,
        au: 5,
        depart: -10,
      })

      check(Boolean(decor.location.id), 'Location en cours créée', decor.location.no)

      /* --- LA LOCATION À VENIR, pour le cas d'exception ------------------- */
      decor.exception = await creerLocation(admin, decor, {
        vehicule: decor.vehicules.a,
        du: 20,
        au: 30,
        depart: null,
      })

      check(Boolean(decor.exception.id), 'Location à venir créée', decor.exception.no)

      /* --- LE SEGMENT INITIAL EXISTE, ET SON COÛT EST DÉJÀ GELÉ ----------- */
      const { data: segments } = await admin
        .from('rental_segments')
        .select('id, sequence_no, locked_amount, rental_segment_costs ( amount )')
        .eq('rental_id', decor.location.id)

      check(
        (segments ?? []).length === 1 && segments[0].sequence_no === 1,
        'Le contrat naît avec exactement UNE période'
      )
      check(
        segments?.[0]?.locked_amount === 50000,
        'La période initiale porte le tarif du barème',
        `${segments?.[0]?.locked_amount} KMF`
      )
      /*
       * UN OBJET, ET NON UN TABLEAU : `segment_id` est UNIQUE, et PostgREST en
       * déduit une relation à UN. Le lire comme une collection rendait
       * `undefined` — donc « aucun coût » — sur un segment qui en portait un.
       */
      check(
        segments?.[0]?.rental_segment_costs?.amount === 40000,
        'Son coût d’acquisition est GELÉ dès l’engagement',
        '40 000 KMF'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — CE QUE CHAQUE PROFIL VOIT DE LA CHRONOLOGIE\n')

    const chronologie = `/location/locations/${decor.location.id}?onglet=chronologie`

    {
      const { context, page } = await signIn(browser, base, accounts.lecteur)
      await page.goto(`${base}${chronologie}`, { waitUntil: 'load' })
      const texte = await mainText(page)

      check(
        texte.includes('Périodes et véhicules'),
        'La chronologie s’ouvre avec `rental.rentals.view`, sans capacité supplémentaire'
      )
      check(
        !texte.includes('Remplacer le véhicule'),
        'Sans `rental.rentals.swap`, le panneau de remplacement est ABSENT'
      )
      check(
        !texte.includes('Changer le tarif'),
        'Sans `rental.pricing.override`, le panneau de tarif est ABSENT'
      )
      check(
        !texte.includes('Coût d’acquisition gelé'),
        'Sans capacité de coût, le coût gelé n’apparaît pas'
      )
      check(
        !texte.includes('Commission de location'),
        'Sans capacité de coût, aucune commission n’apparaît'
      )
      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.exploitation)
      await page.goto(`${base}${chronologie}`, { waitUntil: 'load' })
      const texte = await mainText(page)

      check(
        texte.includes('Remplacer le véhicule'),
        'Avec `rental.rentals.swap`, le panneau de remplacement est PRÉSENT'
      )
      check(
        !texte.includes('Changer le tarif'),
        '🟩 A-14 : `swap` n’ouvre PAS le panneau de tarif dérogatoire'
      )
      check(
        !texte.includes('Coût d’acquisition gelé') && !texte.includes('Commission de location'),
        '🟥 L’exploitant ne voit NI le coût gelé, NI la commission'
      )
      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.couts)
      await page.goto(`${base}${chronologie}`, { waitUntil: 'load' })
      const texte = await mainText(page)

      check(
        texte.includes('Coût d’acquisition gelé') && digits(texte).includes('40000'),
        'Le porteur de `rental.pricing.supplier.view` lit le coût gelé',
        '40 000 KMF'
      )
      check(
        texte.includes('Commission de location') && digits(texte).includes('10000'),
        'Et la commission de la période : 50 000 − 40 000 = 10 000'
      )
      check(
        !texte.includes('Remplacer le véhicule'),
        'Lire le coût n’ouvre pas le remplacement'
      )
      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — 🟩 LE CAS DE LA DIRECTION, MONTÉ PAR L’ÉCRAN (A-4)\n')

    const bascule = localInput(-72)

    {
      const { context, page } = await signIn(browser, base, accounts.exploitation)
      await page.goto(`${base}${chronologie}`, { waitUntil: 'load' })

      /*
       * ON NOMME L'ACTE AVANT DE LE DÉCRIRE : le formulaire n'est monté qu'une
       * fois l'acte choisi. C'est ce qui évite que deux formulaires portant des
       * champs de même nom coexistent sur la page.
       */
      await page.getByRole('button', { name: /Remplacer le véhicule/ }).click()
      await page.waitForFunction(() => document.querySelector('#vehicleId') !== null)
      await page.selectOption('#vehicleId', decor.vehicules.b)
      await page.fill('#effectiveAt', bascule)
      await page.fill('#reason', 'Panne immobilisante du véhicule initial')
      await page.getByRole('button', { name: /Enregistrer l’avenant/i }).first().click()

      // L'effet, pas le réseau : on attend le libellé que l'action produit.
      const issue = await attendreIssue(page)
      check(issue.ok, 'Le remplacement est accepté par l’écran', issue.feedback.slice(0, 220))

      const texte = issue.texte
      check(
        texte.includes('Période 1') && texte.includes('Période 2'),
        '🟩 A-4 : DEUX périodes sur le MÊME contrat'
      )
      check(
        texte.includes('AVN-'),
        'Un avenant numéroté a été créé'
      )
      check(
        page.url().includes(decor.location.id),
        '🟩 Le contrat n’a pas changé d’identifiant'
      )

      await context.close()
    }

    {
      /* LE CONTRAT EN BASE : deux périodes contiguës, un seul contrat. */
      const { data: segments } = await admin
        .from('rental_segments')
        .select('sequence_no, status, vehicle_id, period, locked_amount, locked_source')
        .eq('rental_id', decor.location.id)
        .order('sequence_no')

      check((segments ?? []).length === 2, 'Deux périodes en base', `${segments?.length}`)
      check(
        segments?.[0]?.vehicle_id === decor.vehicules.a &&
          segments?.[1]?.vehicle_id === decor.vehicules.b,
        'La première porte le véhicule A, la seconde le véhicule B'
      )
      check(
        segments?.[0]?.status === 'ENDED' && segments?.[1]?.status === 'ACTIVE',
        'La première est terminée, la seconde est en cours'
      )
      check(
        segments?.[0]?.locked_amount === 50000,
        '🟩 A-5 : l’ancien tarif est CONSERVÉ sur sa période',
        '50 000 KMF'
      )
      check(
        segments?.[1]?.locked_amount === 60000 && segments?.[1]?.locked_source !== 'OVERRIDE',
        '🟩 A-5 : le client paie le tarif du NOUVEAU véhicule, résolu par le barème',
        '60 000 KMF'
      )

      const { data: rental } = await admin
        .from('rentals')
        .select('rental_no, vehicle_id')
        .eq('id', decor.location.id)
        .single()

      check(rental?.rental_no === decor.location.no, '🟩 Le numéro du contrat est inchangé')
      check(
        rental?.vehicle_id === decor.vehicules.b,
        'Le contrat porte désormais son véhicule COURANT'
      )

      const { count: contrats } = await admin
        .from('rentals')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', decor.client)

      check(contrats === 2, '🟩 Aucun contrat nouveau n’a été créé par le remplacement')

      /* LE CALENDRIER : A libéré à la bascule, B engagé à partir d'elle. */
      const { data: occupations } = await admin
        .from('vehicle_occupations')
        .select('vehicle_id, is_active, rental_segment_id')
        .eq('source', 'RENTAL')
        .eq('source_id', decor.location.id)

      const occA = (occupations ?? []).find((o) => o.vehicle_id === decor.vehicules.a)
      const occB = (occupations ?? []).find((o) => o.vehicle_id === decor.vehicules.b)

      check(occA && occA.is_active === false, 'L’engagement de l’ancien véhicule est LIBÉRÉ')
      check(occB && occB.is_active === true, 'Le nouveau véhicule est ENGAGÉ')
      check(
        Boolean(occA?.rental_segment_id) && Boolean(occB?.rental_segment_id),
        'Chaque occupation nomme SA période'
      )

      /* LES STATUTS DES DEUX VÉHICULES. */
      const { data: vehicules } = await admin
        .from('vehicles')
        .select('id, status')
        .in('id', [decor.vehicules.a, decor.vehicules.b])

      check(
        vehicules?.find((v) => v.id === decor.vehicules.a)?.status === 'AVAILABLE',
        'L’ancien véhicule est revenu au parc'
      )
      check(
        vehicules?.find((v) => v.id === decor.vehicules.b)?.status === 'RENTED',
        'Le nouveau véhicule est « en location »'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LES COMMISSIONS PAR PÉRIODE, ET LEUR CONFIDENTIALITÉ\n')

    {
      const { context, page } = await signIn(browser, base, accounts.couts)
      await page.goto(`${base}${chronologie}`, { waitUntil: 'load' })
      const texte = digits(await mainText(page))

      check(texte.includes('40000') && texte.includes('45000'), 'Les DEUX coûts gelés sont lisibles')
      check(
        texte.includes('10000') && texte.includes('15000'),
        'Les DEUX commissions : 10 000 puis 15 000'
      )
      await context.close()
    }

    {
      /* L'EXPLOITANT N'OBTIENT LE COÛT PAR AUCUNE VOIE. */
      const client = await session('exploitation')

      const { data: couts } = await client
        .from('rental_segment_costs')
        .select('amount')
        .eq('rental_id', decor.location.id)

      check(
        (couts ?? []).length === 0,
        '🟥 Appel PostgREST direct sur les coûts gelés : AUCUNE ligne'
      )

      const { data: segments } = await client
        .from('rental_segments')
        .select('sequence_no, rental_segment_costs ( amount )')
        .eq('rental_id', decor.location.id)

      check(
        (segments ?? []).length === 2,
        'Les périodes, elles, lui sont lisibles — c’est l’histoire de son contrat'
      )
      check(
        (segments ?? []).every((s) => !s.rental_segment_costs),
        '🟥 Le coût ne passe pas davantage par la jointure'
      )
    }

    {
      /* NI PAR LA CHARGE UTILE DE LA PAGE. */
      const { context, page } = await signIn(browser, base, accounts.exploitation)
      await page.goto(`${base}${chronologie}`, { waitUntil: 'load' })
      const html = digits(await page.content())

      check(
        !html.includes('40000') && !html.includes('45000'),
        '🟥 Le coût n’apparaît pas dans la charge utile de la page'
      )
      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — 🟩 L’EXCEPTION TARIFAIRE (A-5)\n')

    {
      /* `swap` SEUL NE DÉROGE PAS — éprouvé par appel direct. */
      const client = await session('exploitation')
      const { error } = await client.rpc('replace_rental_vehicle', {
        p_rental_id: decor.exception.id,
        p_new_vehicle_id: decor.vehicules.c,
        p_effective_at: new Date(Date.now() + 25 * 86400_000).toISOString(),
        p_reason: 'Tentative de dérogation',
        p_amount: 50000,
        p_unit: 'DAY',
        p_rate_reason: 'Tentative',
        p_notes: null,
      })

      check(
        Boolean(error),
        '🟩 A-14 : `rental.rentals.swap` seul ne permet PAS de forcer un tarif',
        error?.message?.slice(0, 60)
      )

      const { count } = await admin
        .from('rental_amendments')
        .select('id', { count: 'exact', head: true })
        .eq('rental_id', decor.exception.id)

      check(count === 0, 'Le refus ne laisse aucun avenant derrière lui')
    }

    {
      /* AVEC `rental.pricing.override`, PAR L'ÉCRAN. */
      const { context, page } = await signIn(browser, base, accounts.avenant)
      await page.goto(`${base}/location/locations/${decor.exception.id}?onglet=chronologie`, {
        waitUntil: 'load',
      })

      const texte = await mainText(page)
      check(
        texte.includes('Remplacer le véhicule') && texte.includes('Changer le tarif'),
        'Le porteur des deux capacités voit les deux panneaux'
      )

      await page.getByRole('button', { name: /Remplacer le véhicule/ }).click()
      await page.waitForFunction(() => document.querySelector('#vehicleId') !== null)
      await page.selectOption('#vehicleId', decor.vehicules.c)
      await page.fill('#effectiveAt', localInput(25 * 24))
      await page.fill('#reason', 'Véhicule A immobilisé avant le départ')

      // La dérogation est un geste SUPPLÉMENTAIRE : elle se choisit.
      await page.getByRole('radio', { name: /tarif dérogatoire/i }).check()
      await page.waitForFunction(() => document.querySelector('#amount') !== null)

      /* D'ABORD SANS RAISON : le formulaire refuse au niveau du champ. */
      await page.fill('#amount', '50000')
      await page.getByRole('button', { name: /Enregistrer l’avenant/i }).first().click()
      const refus = await attendreIssue(page, 'exige sa raison')
      check(
        refus.ok,
        '🟩 Une dérogation SANS raison écrite est refusée, au niveau du champ',
        refus.ok ? '' : refus.feedback.slice(0, 220)
      )

      /* PUIS AVEC. */
      await page.fill(
        '#rateReason',
        'ADIKOM absorbe l’écart : l’indisponibilité est de son fait'
      )
      await page.getByRole('button', { name: /Enregistrer l’avenant/i }).first().click()
      const accorde = await attendreIssue(page)
      check(accorde.ok, 'La dérogation est acceptée par l’écran', accorde.feedback.slice(0, 260))

      // La chronologie n'est relue qu'après un rechargement : l'action
      // revalide le chemin, mais la page affichée est celle du formulaire.
      await page.reload({ waitUntil: 'load' })
      const apres = await mainText(page)
      check(apres.includes('Tarif dérogatoire'), 'La dérogation est SIGNALÉE sur la chronologie')
      check(
        apres.includes('ADIKOM absorbe l’écart'),
        'Sa raison écrite figure sur la chronologie'
      )
      check(digits(apres).includes('50000'), 'Le client garde son tarif : 50 000 KMF')

      await context.close()
    }

    {
      const { data: amendements } = await admin
        .from('rental_amendments')
        .select('id, kind, rate_override, rate_override_reason')
        .eq('rental_id', decor.exception.id)

      check(
        amendements?.[0]?.rate_override === true &&
          Boolean(amendements?.[0]?.rate_override_reason),
        'L’avenant porte la dérogation ET sa raison'
      )

      const { data: segment } = await admin
        .from('rental_segments')
        .select('locked_amount, locked_source, vehicle_id')
        .eq('rental_id', decor.exception.id)
        .eq('sequence_no', 2)
        .single()

      check(
        segment?.locked_amount === 50000 && segment?.locked_source === 'OVERRIDE',
        '🟩 Le tarif appliqué est bien le tarif FORCÉ, et la période le dit',
        '50 000 KMF, source OVERRIDE'
      )
      check(
        segment?.vehicle_id === decor.vehicules.c,
        'Le véhicule C a bien pris le relais, à 55 000 de barème non appliqué'
      )

      /* LE JOURNAL PORTE LA DÉROGATION SOUS `PRICE_CHANGE`. */
      const { data: journal } = await admin
        .from('audit_log')
        .select('action')
        .eq('entity_type', 'rental_amendments')
        .eq('entity_id', amendements?.[0]?.id)

      const actions = (journal ?? []).map((row) => row.action)
      check(
        actions.includes('PRICE_CHANGE'),
        '🟩 La dérogation est journalisée sous PRICE_CHANGE'
      )
      check(actions.includes('CREATE'), 'Et l’avenant lui-même est journalisé')
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — 🟥 LE COÛT GELÉ NE BOUGE PLUS (l’écart du LOT 21, fermé)\n')

    {
      const { data: avant } = await admin
        .from('rental_segment_costs')
        .select('amount')
        .eq('rental_id', decor.location.id)
        .order('amount')

      const montants = (avant ?? []).map((row) => row.amount)
      check(
        montants.includes(40000) && montants.includes(45000),
        'Les deux coûts gelés sont en place avant la saisie rétroactive'
      )

      /* UNE VERSION RÉTROACTIVE, DÉLIBÉRÉE, PERMISSIONNÉE ET JOURNALISÉE. */
      const client = await session('couts')
      const { error } = await client.rpc('set_supplier_vehicle_rate', {
        p_vehicle_id: decor.vehicules.b,
        p_supplier_id: decor.fournisseur,
        p_amount: 99000,
        p_unit: 'DAY',
        p_valid_from: dayOffset(-5),
        p_conditions: `${MARK} — coût de recette`,
        p_reason: 'Correction rétroactive de recette',
      })
      check(!error, 'Une version rétroactive de coût est enregistrée', error?.message)

      const { data: resolu } = await client.rpc('resolve_supplier_rate', {
        p_vehicle_id: decor.vehicules.b,
        p_on: dayOffset(-3),
      })
      check(
        (resolu ?? [])[0]?.amount === 99000,
        'Le RÉSOLVEUR voit désormais le nouveau montant',
        '99 000 KMF'
      )

      const { data: apres } = await admin
        .from('rental_segment_costs')
        .select('amount')
        .eq('rental_id', decor.location.id)
        .order('amount')

      check(
        JSON.stringify((apres ?? []).map((r) => r.amount)) === JSON.stringify(montants),
        '🟥 ET LE COÛT GELÉ NE BOUGE PAS : l’historique financier est protégé'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — CE QUE LA BASE REFUSE, ET QUI NE LAISSE RIEN\n')

    {
      const client = await session('exploitation')

      /*
       * REMPLACER UN VÉHICULE PAR LUI-MÊME.
       *
       * Le véhicule A, lui, a été LIBÉRÉ à la bascule : il est de nouveau
       * disponible, et le proposer serait légitime. Le refus attendu porte donc
       * sur le véhicule COURANT, qui est B.
       */
      const { error: identique } = await client.rpc('replace_rental_vehicle', {
        p_rental_id: decor.location.id,
        p_new_vehicle_id: decor.vehicules.b,
        p_effective_at: new Date(Date.now() - 36 * 3600_000).toISOString(),
        p_reason: 'Tentative avec le même véhicule',
        p_amount: null,
        p_unit: null,
        p_rate_reason: null,
        p_notes: null,
      })

      check(
        Boolean(identique),
        'Remplacer un véhicule par LUI-MÊME est refusé',
        identique?.message?.slice(0, 80) ?? 'AUCUNE ERREUR RENVOYÉE'
      )

      /* UNE BASCULE PROGRAMMÉE SUR UNE LOCATION EN COURS. */
      const { error: futur } = await client.rpc('replace_rental_vehicle', {
        p_rental_id: decor.location.id,
        p_new_vehicle_id: decor.vehicules.c,
        p_effective_at: new Date(Date.now() + 2 * 86400_000).toISOString(),
        p_reason: 'Tentative de programmation',
        p_amount: null,
        p_unit: null,
        p_rate_reason: null,
        p_notes: null,
      })
      check(
        Boolean(futur),
        'Sur une location partie, un remplacement se CONSTATE — il ne se programme pas',
        futur?.message?.slice(0, 80) ?? 'AUCUNE ERREUR RENVOYÉE'
      )

      /* AUCUNE ÉCRITURE DIRECTE DANS LES TABLES DU LOT. */
      const { error: direct } = await client.from('rental_amendments').insert({
        amendment_no: `AVN-FORGE-${STAMP}`,
        rental_id: decor.location.id,
        sequence_no: 99,
        kind: 'VEHICLE_CHANGE',
        effective_at: new Date().toISOString(),
        reason: 'Avenant forgé',
      })
      check(Boolean(direct), 'Un avenant forgé par appel direct est refusé')

      const { error: cout } = await client.from('rental_segment_costs').insert({
        segment_id: decor.location.id,
        rental_id: decor.location.id,
        amount: 1,
        unit: 'DAY',
        resolved_on: dayOffset(0),
      })
      check(Boolean(cout), 'Un coût gelé forgé par appel direct est refusé')

      /* LE VÉHICULE D'UNE LOCATION NE SE CHANGE PAS À LA MAIN. */
      const { error: manuel } = await client
        .from('rentals')
        .update({ vehicle_id: decor.vehicules.c })
        .eq('id', decor.location.id)
      check(
        Boolean(manuel),
        'Le véhicule d’une location ne se change pas par écriture directe'
      )

      /* L'HISTOIRE EST INTACTE APRÈS TOUS CES REFUS. */
      const { count: segments } = await admin
        .from('rental_segments')
        .select('id', { count: 'exact', head: true })
        .eq('rental_id', decor.location.id)
      const { count: avenants } = await admin
        .from('rental_amendments')
        .select('id', { count: 'exact', head: true })
        .eq('rental_id', decor.location.id)

      check(
        segments === 2 && avenants === 1,
        'Aucun refus n’a laissé de trace partielle',
        `${segments} périodes · ${avenants} avenant`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — LES DOCUMENTS\n')

    {
      const { data: amendement } = await admin
        .from('rental_amendments')
        .select('id, amendment_no')
        .eq('rental_id', decor.location.id)
        .single()

      const contrat = await fetchAs(
        base,
        accounts.exploitation,
        url,
        anonKey,
        `/api/documents/contrats/${decor.location.id}`
      )
      check(
        contrat.status === 200 && (contrat.type ?? '').includes('pdf'),
        'Le CONTRAT est produit',
        `${contrat.status}`
      )
      check(
        (contrat.body ?? '').startsWith('%PDF'),
        'Il commence bien par %PDF'
      )

      const avenant = await fetchAs(
        base,
        accounts.exploitation,
        url,
        anonKey,
        `/api/documents/avenants/${amendement.id}`
      )
      check(
        avenant.status === 200 && (avenant.type ?? '').includes('pdf'),
        'L’AVENANT est produit — quatrième document du cycle',
        `${avenant.status}`
      )
      check(
        (avenant.body ?? '').startsWith('%PDF'),
        'Il commence bien par %PDF'
      )
      /*
       * 🟥 LA CONFIDENTIALITÉ DU PDF NE SE VÉRIFIE PAS EN CHERCHANT DES OCTETS.
       *
       * Un PDF produit par `@react-pdf/renderer` porte ses textes dans des flux
       * COMPRESSÉS : une suite de chiffres peut y apparaître par hasard, et un
       * montant réellement imprimé peut n'y apparaître nulle part. Un tel
       * balayage se trompe dans les deux sens — il accuse à tort, et il rassure
       * à tort.
       *
       * La garantie est ailleurs, et elle est structurelle : les modèles
       * documentaires ne reçoivent pas le segment mais un `ContractPeriod`, qui
       * NE PORTE PAS le coût gelé, et `src/lib/documents/document.test.ts` relit
       * les sources pour refuser toute référence au domaine du coût. Ce que la
       * recette éprouve ici, c'est ce qu'elle peut éprouver : le document sort,
       * et il ne sort qu'à qui en a la capacité.
       */
      check(
        (avenant.body ?? '').length > 30000,
        'Le document porte ses polices et son logo — ce n’est pas une coquille vide',
        `${Math.round((avenant.body ?? '').length / 1024)} Ko`
      )

      /* SANS LA CAPACITÉ DOCUMENTAIRE, RIEN NE SORT. */
      const refus = await fetchAs(
        base,
        accounts.lecteur,
        url,
        anonKey,
        `/api/documents/avenants/${amendement.id}`
      )
      check(
        refus.status === 403,
        'Sans `rental.rentals.download`, l’avenant n’est pas téléchargeable',
        `${refus.status}`
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — AUCUN EFFET DE BORD\n')

    {
      await checkCatalogue(admin, check)

      const { count: regles } = await admin
        .from('pricing_rules')
        .select('id', { count: 'exact', head: true })
        .not('conditions', 'like', `${MARK}%`)

      check(regles > 0, 'Le barème client réel est intact', `${regles} règles`)

      const after = await demoFootprint(admin)
      check(
        JSON.stringify(after) === JSON.stringify(before),
        'Le jeu de démonstration est intact',
        JSON.stringify(after)
      )

      const bruit = journalNavigateur.filter(
        (ligne) => !/favicon|_vercel|Failed to load resource/i.test(ligne)
      )
      check(
        bruit.length === 0,
        'Aucune erreur de console ni exception sur les écrans parcourus',
        bruit.slice(0, 2).join(' | ')
      )
    }
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
      ['vehicles', 'brand', 'RECETTE AVN%'],
      ['suppliers', 'legal_name', 'RECETTE AVN%'],
      ['clients', 'legal_name', 'RECETTE AVN%'],
      ['vehicle_categories', 'label', 'RECETTE AVN%'],
      ['pricing_rules', 'conditions', 'RECETTE AVN%'],
      ['supplier_vehicle_rates', 'conditions', 'RECETTE AVN%'],
      ['app_users', 'username', 'recette.avn.%'],
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
        `${DIM}Comptes, véhicules, client, fournisseur, tarifs, contrats et avenants de recette supprimés. Données DEMO intactes.${RESET}`
      )
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE AVENANTS ET SEGMENTS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE AVENANTS ET SEGMENTS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

/**
 * Une location de recette, du décor jusqu'au départ.
 *
 * Elle passe par les FONCTIONS ATOMIQUES, jamais par des `insert` successifs :
 * ce sont elles qui posent l'occupation, verrouillent le tarif et ouvrent le
 * segment initial. Monter le décor à la main produirait un contrat qui ne
 * ressemble à aucun contrat réel.
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
      notes: `RECETTE AVN`,
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
    .update({ status: 'CONFIRMED', notes: 'RECETTE AVN' })
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
 */
async function purgeStrays(admin) {
  const { data: reservations } = await admin
    .from('reservations')
    .select('id')
    .eq('notes', 'RECETTE AVN')
  const reservationIds = (reservations ?? []).map((row) => row.id)

  const { data: rentals } = await admin.from('rentals').select('id').eq('notes', 'RECETTE AVN')
  const rentalIds = (rentals ?? []).map((row) => row.id)

  if (rentalIds.length > 0) {
    // Les enfants d'abord : coût gelé, occupations, états des lieux, périodes,
    // avenants — puis la location.
    await admin.from('rental_segment_costs').delete().in('rental_id', rentalIds)
    await admin.from('vehicle_occupations').delete().in('source_id', rentalIds)
    await admin.from('rental_inspection_photos').delete().in('inspection_id', await idsOf(admin, 'rental_inspections', 'rental_id', rentalIds))
    await admin.from('rental_inspections').delete().in('rental_id', rentalIds)
    await admin.from('rental_segments').delete().in('rental_id', rentalIds)
    await admin.from('rental_amendments').delete().in('rental_id', rentalIds)
    await admin.from('rentals').delete().in('id', rentalIds)
  }

  if (reservationIds.length > 0) {
    await admin.from('vehicle_occupations').delete().in('source_id', reservationIds)
    await admin.from('reservations').delete().in('id', reservationIds)
  }

  await admin.from('supplier_vehicle_rates').delete().like('conditions', 'RECETTE AVN%')
  await admin.from('pricing_rules').delete().like('conditions', 'RECETTE AVN%')

  const { data: vehicles } = await admin.from('vehicles').select('id').like('brand', 'RECETTE AVN%')
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
    .like('legal_name', 'RECETTE AVN%')

  const supplierIds = (fournisseurs ?? []).map((row) => row.id)
  if (supplierIds.length > 0) {
    await admin.from('supplier_vehicle_rates').delete().in('supplier_id', supplierIds)
    await admin.from('vehicle_supplier_history').delete().in('supplier_id', supplierIds)
    await admin.from('suppliers').delete().in('id', supplierIds)
  }

  await admin.from('clients').delete().like('legal_name', 'RECETTE AVN%')
  await admin.from('vehicle_categories').delete().like('label', 'RECETTE AVN%')

  const { data: comptes } = await admin
    .from('app_users')
    .select('id')
    .like('username', 'recette.avn.%')

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
 *
 * Le jeton est obtenu de Supabase puis posé dans le cookie que `@supabase/ssr`
 * attend : l'application applique donc exactement les mêmes droits que pour un
 * utilisateur réel.
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

  // Le cookie est découpé comme `@supabase/ssr` le fait au-delà de sa taille
  // limite : un jeton entier dans un seul cookie serait refusé par le serveur.
  const size = 3180
  const parts = []
  for (let index = 0; index * size < value.length; index += 1) {
    parts.push(`sb-${ref}-auth-token.${index}=${value.slice(index * size, (index + 1) * size)}`)
  }

  const response = await fetch(`${base}${path}`, {
    headers: { cookie: parts.join('; ') },
    redirect: 'manual',
  })

  /*
   * LE CORPS EST LU, PAS SEULEMENT L'ENTÊTE.
   *
   * La confidentialité se vérifie dans le FICHIER : un PDF qui commence bien et
   * qui porterait un coût d'acquisition passerait tous les contrôles de statut.
   * `latin1` conserve les octets tels quels — un PDF n'est pas de l'UTF-8.
   */
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
