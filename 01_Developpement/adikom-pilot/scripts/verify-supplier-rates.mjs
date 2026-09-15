#!/usr/bin/env node
/**
 * Recette Tarifs fournisseurs des véhicules — LOT 21, DEC-044.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:supplier-rates` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL s'exécute avec le rôle de la chaîne de connexion, qui CONTOURNE
 * RLS : elle prouve que les déclencheurs refusent ce qu'ils doivent refuser, et
 * que les policies ont la bonne forme. Elle ne peut pas prouver que LA LECTURE
 * EST RÉELLEMENT FERMÉE.
 *
 * C'est ce que celle-ci fait, avec de VRAIES SESSIONS — jeton Supabase, cookie
 * applicatif, appels PostgREST directs, documents PDF :
 *
 *   1. Sans `rental.pricing.supplier.view`, l'écran est REFUSÉ et l'entrée de
 *      menu absente.
 *   2. LE PROFIL LOCATION — parc, grille tarifaire, contrats, montants, journal
 *      — n'obtient le coût fournisseur par AUCUNE voie : ni table, ni résolveur,
 *      ni résolution par lot, ni écran, ni contrat PDF, ni export, ni journal.
 *      C'est le cœur du lot (A-2, consigne §15).
 *   3. Le profil COÛTS l'obtient, et le voit à l'écran.
 *   4. LE CAS DE RÉFÉRENCE DE LA DIRECTION, monté PAR L'ÉCRAN : 40 000 puis
 *      45 000 à une date future ; résolution correcte de part et d'autre.
 *   5. LA COMMISSION : 50 000 − 40 000 = 10 000. Une commission NÉGATIVE est
 *      conservée. Un coût ABSENT ne devient jamais 0.
 *   6. Un véhicule ADIKOM n'est pas proposé, et la base le refuse — P-2.
 *   7. L'export exige SA capacité ; sans elle, 403.
 *   8. Aucun résidu, jeu DEMO intact, catalogue conforme au code déclaré.
 *
 * Utilisation :
 *   node scripts/verify-supplier-rates.mjs [url]
 *
 * NE JAMAIS piper la sortie vers `head` : SIGPIPE tuerait le processus avant son
 * nettoyage, et laisserait des comptes et des véhicules de recette en base.
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required, dayOffset } from './lib/env.mjs'
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
const MARK = `RECETTE SVR ${STAMP}`

const BASE = ['dashboard.view']

const PROFILES = {
  /* Il gère les coûts d'acquisition. C'est lui qui monte le décor par l'écran. */
  couts: [
    ...BASE,
    'rental.pricing.supplier.view',
    'rental.pricing.supplier.create',
    'rental.pricing.supplier.update',
    'rental.pricing.supplier.export',
    'rental.fleet.view',
    'rental.pricing.view',
    'rental.rentals.view',
    'rental.rentals.financial.view',
    'parties.suppliers.view',
    'users.audit.view',
  ],

  /*
   * LE PROFIL LOCATION — le cœur du lot.
   *
   * Il voit TOUT du contrat : le parc, la grille tarifaire, les locations, leurs
   * montants verrouillés, et même le JOURNAL. Il n'a AUCUNE capacité de coût
   * fournisseur.
   *
   * `users.audit.view` est délibérée : sans elle, le refus du journal prouverait
   * seulement qu'il ne lit pas le journal. Avec elle, il prouve ce qui compte —
   * LIRE LE JOURNAL N'OUVRE PAS LE COÛT (DEC-038).
   */
  location: [
    ...BASE,
    'rental.fleet.view',
    'rental.pricing.view',
    'rental.pricing.create',
    'rental.pricing.update',
    'rental.pricing.export',
    'rental.rentals.view',
    'rental.rentals.financial.view',
    'rental.rentals.download',
    'parties.suppliers.view',
    'users.audit.view',
  ],

  /* Il voit les coûts, et ne peut ni en ouvrir ni en retirer. */
  lecteur: [...BASE, 'rental.pricing.supplier.view', 'rental.fleet.view'],

  /* Il n'a rien du coût fournisseur : l'écran doit lui être refusé. */
  nul: [...BASE, 'rental.fleet.view'],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.svr.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-svr-${STAMP}`

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
    last_name: `Svr ${key}`,
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
 * jusqu'à ce qu'un utilisateur tombe dessus. Chaque page ouverte par cette
 * recette est donc écoutée, et le verdict est rendu à la fin.
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

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/** Les chiffres d'un montant, sans ses espaces insécables. */
function digits(text) {
  return text.replace(/[  \s]/g, '')
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
    .like('brand', 'RECETTE SVR%')

  if (strays > 0) {
    console.log(
      `${DIM}${strays} véhicule(s) d’un passage antérieur détecté(s) : nettoyage préalable.${RESET}`
    )
    await purgeStrays(admin)
  }

  const accounts = {}
  const sessions = {}
  const browser = await chromium.launch()

  // Dates relatives au JOUR COMORIEN : une recette ne doit pas expirer avec le
  // calendrier.
  const debut = dayOffset(-60)
  const aujourdhui = dayOffset(0)
  const bascule = dayOffset(30)

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
    console.log('1 — LE DÉCOR : UN FOURNISSEUR, QUATRE VÉHICULES\n')

    {
      const { data: categorie, error: catError } = await admin
        .from('vehicle_categories')
        .insert({ code: `RSVR${STAMP}`, label: `${MARK} — Catégorie` })
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
          phone: '+269 950',
          status: 'ACTIVE',
        })
        .select('id')
        .single()
      if (supError) throw new Error(`fournisseur : ${supError.message}`)
      decor.fournisseur = fournisseur.id

      /*
       * QUATRE VÉHICULES, UN PAR SITUATION À ÉPROUVER :
       *
       *   · `gain`   fourni, coût 40 000, tarif client 50 000 → commission +10 000
       *   · `perte`  fourni, coût 40 000, tarif client 35 000 → commission −5 000
       *   · `vide`   fourni, AUCUN coût  → commission NON CALCULÉE, jamais 0
       *   · `adikom` propriété ADIKOM    → P-2, aucun coût enregistrable
       */
      const plan = [
        { key: 'gain', model: 'SVR-GAIN', origin: 'SUPPLIED', prix: 50000 },
        { key: 'perte', model: 'SVR-PERTE', origin: 'SUPPLIED', prix: 35000 },
        { key: 'vide', model: 'SVR-VIDE', origin: 'SUPPLIED', prix: 50000 },
        { key: 'adikom', model: 'SVR-ADIKOM', origin: 'OWNED', prix: 50000 },
      ]

      for (const item of plan) {
        const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
        const { data: vehicle, error: vehError } = await admin
          .from('vehicles')
          .insert({
            vehicle_no: vehicleNo,
            category_id: decor.categorie,
            brand: `${MARK}`,
            model: item.model,
            origin: item.origin,
            current_supplier_id: item.origin === 'SUPPLIED' ? decor.fournisseur : null,
            status: 'AVAILABLE',
          })
          .select('id')
          .single()
        if (vehError) throw new Error(`véhicule ${item.key} : ${vehError.message}`)

        decor[item.key] = vehicle.id

        if (item.origin === 'SUPPLIED') {
          await admin.from('vehicle_supplier_history').insert({
            vehicle_id: vehicle.id,
            supplier_id: decor.fournisseur,
            started_on: debut,
          })
        }

        // Le tarif CLIENT du barème, sur ce véhicule : c'est lui qui rend la
        // commission calculable.
        const { error: ruleError } = await admin.from('pricing_rules').insert({
          vehicle_id: vehicle.id,
          amount: item.prix,
          unit: 'DAY',
          valid_from: debut,
          conditions: MARK,
        })
        if (ruleError) throw new Error(`tarif client ${item.key} : ${ruleError.message}`)
      }

      check(Object.keys(decor).length === 6, 'Décor monté : 1 catégorie, 1 fournisseur, 4 véhicules')
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LE CAS DE LA DIRECTION, MONTÉ PAR L’ÉCRAN\n')

    {
      const { context, page } = await signIn(browser, base, accounts.couts)

      await page.goto(`${base}/location/parc/${decor.gain}?onglet=cout-fournisseur`, {
        waitUntil: 'load',
      })

      check(
        (await mainText(page)).includes('Coût d’acquisition'),
        'L’onglet « Coût fournisseur » s’ouvre pour le profil habilité'
      )

      // a. Le premier coût, applicable depuis deux mois.
      await page.getByRole('button', { name: 'Nouveau coût' }).first().click()
      await page.fill(`#rate-${decor.gain}-amount`, '40000')
      await page.fill(`#rate-${decor.gain}-validFrom`, debut)
      await page.fill(`#rate-${decor.gain}-reason`, 'Contrat initial')
      await page.getByRole('button', { name: 'Enregistrer ce coût' }).click()
      await page.getByText('40 000', { exact: false }).first().waitFor({ timeout: 60000 })
      check(true, 'Un premier coût d’acquisition est enregistré par l’écran', '40 000 KMF / jour')

      // b. LE COÛT FUTUR, SAISI AUJOURD'HUI — ce que « le coût de la fiche » ne
      //    savait pas faire.
      await page.reload({ waitUntil: 'load' })
      await page.getByRole('button', { name: 'Nouveau coût' }).first().click()
      await page.fill(`#rate-${decor.gain}-amount`, '45000')
      await page.fill(`#rate-${decor.gain}-validFrom`, bascule)
      await page.fill(`#rate-${decor.gain}-reason`, 'Révision annuelle')
      await page.getByRole('button', { name: 'Enregistrer ce coût' }).click()
      await page.getByText('45 000', { exact: false }).first().waitFor({ timeout: 60000 })
      check(true, 'Un coût FUTUR se saisit sans attendre sa date d’effet', bascule)

      await context.close()

      // c. Le résolveur confirme, de part et d'autre de la bascule.
      const operateur = await session('couts')

      const avant = await operateur.rpc('resolve_supplier_rate', {
        p_vehicle_id: decor.gain,
        p_on: aujourdhui,
      })
      check(
        Number(avant.data?.[0]?.amount) === 40000,
        'Avant la bascule, le coût applicable est 40 000',
        String(avant.data?.[0]?.amount)
      )

      const apres = await operateur.rpc('resolve_supplier_rate', {
        p_vehicle_id: decor.gain,
        p_on: bascule,
      })
      check(
        Number(apres.data?.[0]?.amount) === 45000,
        'À la bascule, le coût applicable est 45 000',
        String(apres.data?.[0]?.amount)
      )

      const avantTout = await operateur.rpc('resolve_supplier_rate', {
        p_vehicle_id: decor.gain,
        p_on: dayOffset(-120),
      })
      check(
        (avantTout.data ?? []).length === 0,
        'Avant toute version : AUCUNE ligne, jamais un coût de 0'
      )

      // d. L'ancienne version n'a pas été réécrite : elle est CLOSE la veille.
      const { data: versions } = await admin
        .from('supplier_vehicle_rates')
        .select('amount, valid_from, valid_to, is_active')
        .eq('vehicle_id', decor.gain)
        .order('valid_from')

      check(
        (versions ?? []).length === 2 &&
          Number(versions[0].amount) === 40000 &&
          versions[0].valid_to !== null,
        'L’ancienne version est CLOSE, pas réécrite',
        (versions ?? []).map((v) => `${v.amount}@${v.valid_from}→${v.valid_to ?? '∞'}`).join(' · ')
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — LA COMMISSION : 10 000, −5 000, ET UN COÛT ABSENT\n')

    {
      // Le second véhicule : coût 40 000, tarif client 35 000 → PERTE.
      const operateur = await session('couts')
      const perte = await operateur.rpc('set_supplier_vehicle_rate', {
        p_vehicle_id: decor.perte,
        p_supplier_id: null,
        p_amount: 40000,
        p_unit: 'DAY',
        p_valid_from: debut,
        p_conditions: null,
        p_reason: MARK,
      })
      check(!perte.error, 'Un coût est ouvert sur le véhicule à perte', perte.error?.message ?? '')

      const { context, page } = await signIn(browser, base, accounts.couts)

      // a. LE CAS DE RÉFÉRENCE : 50 000 − 40 000 = 10 000.
      await page.goto(`${base}/location/parc/${decor.gain}?onglet=cout-fournisseur`, {
        waitUntil: 'load',
      })
      const gainText = digits(await mainText(page))
      check(
        gainText.includes('10000') && gainText.includes('Commissiondelocation'),
        'La commission de 10 000 KMF s’affiche sur la fiche véhicule',
        '50 000 − 40 000'
      )

      // b. UNE COMMISSION NÉGATIVE EST CONSERVÉE, jamais ramenée à zéro.
      await page.goto(`${base}/location/parc/${decor.perte}?onglet=cout-fournisseur`, {
        waitUntil: 'load',
      })
      const perteText = digits(await mainText(page))
      check(
        perteText.includes('-5000') || perteText.includes('−5000'),
        'Une commission NÉGATIVE est rendue telle quelle',
        '35 000 − 40 000'
      )

      // c. UN COÛT ABSENT N'EST PAS UN COÛT DE 0.
      await page.goto(`${base}/location/parc/${decor.vide}?onglet=cout-fournisseur`, {
        waitUntil: 'load',
      })
      const videText = await mainText(page)
      check(
        videText.includes('Aucun coût d’acquisition renseigné'),
        'Sans coût, l’écran le DIT au lieu d’afficher 0'
      )
      check(
        videText.includes('Commission non calculée'),
        'Sans coût, aucune commission n’est calculée'
      )
      check(
        !digits(videText).includes('Commissiondelocation:0'),
        'Aucune commission de 0 n’est inventée'
      )

      // d. 🟥 P-2 : le véhicule ADIKOM n'est pas traité comme un fournisseur.
      await page.goto(`${base}/location/parc/${decor.adikom}?onglet=cout-fournisseur`, {
        waitUntil: 'load',
      })
      const adikomText = await mainText(page)
      check(
        adikomText.includes('n’est pas mis à disposition par un fournisseur'),
        'Un véhicule ADIKOM ne reçoit pas de coût d’acquisition — P-2 non tranchée'
      )
      check(
        adikomText.includes('décision de la Direction'),
        'L’écran NOMME la décision manquante plutôt que d’inventer un coût'
      )

      await context.close()

      // e. Et la base refuse aussi l'appel direct.
      const direct = await operateur.rpc('set_supplier_vehicle_rate', {
        p_vehicle_id: decor.adikom,
        p_supplier_id: decor.fournisseur,
        p_amount: 40000,
        p_unit: 'DAY',
        p_valid_from: aujourdhui,
      })
      check(
        Boolean(direct.error) && /P-2/.test(direct.error?.message ?? ''),
        'L’appel DIRECT sur un véhicule ADIKOM est refusé, et le refus nomme P-2',
        (direct.error?.message ?? '(accepté)').slice(0, 90)
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LE PROFIL LOCATION N’OBTIENT LE COÛT PAR AUCUNE VOIE\n')

    {
      const exploitant = await session('location')

      // a. La table, en appel PostgREST direct.
      const table = await exploitant
        .from('supplier_vehicle_rates')
        .select('id, amount')
        .eq('vehicle_id', decor.gain)
      check(
        !table.error && (table.data ?? []).length === 0,
        'L’appel direct à la table ne rend AUCUNE ligne',
        table.error ? table.error.message.slice(0, 60) : `${(table.data ?? []).length} ligne(s)`
      )

      // b. Le résolveur unitaire.
      const resolveur = await exploitant.rpc('resolve_supplier_rate', {
        p_vehicle_id: decor.gain,
        p_on: aujourdhui,
      })
      check(
        !resolveur.error && (resolveur.data ?? []).length === 0,
        'Le résolveur ne lui rend AUCUNE ligne (SECURITY INVOKER, doctrine D4)'
      )

      // c. La résolution PAR LOT — la voie détournée qu'on pourrait oublier.
      const lot = await exploitant.rpc('resolve_supplier_rates', { p_on: aujourdhui })
      const montants = (lot.data ?? []).filter((row) => row.amount !== null)
      check(
        !lot.error && montants.length === 0,
        'La résolution par lot ne lui rend AUCUN montant',
        `${montants.length} montant(s) sur ${(lot.data ?? []).length} véhicule(s)`
      )

      // d. Il voit pourtant bien le parc et la grille tarifaire : le refus est
      //    CIBLÉ, et ne vient pas d'un compte sans droits.
      const parc = await exploitant.from('vehicles').select('id').eq('id', decor.gain)
      check(
        !parc.error && (parc.data ?? []).length === 1,
        'Ce même compte voit le véhicule : le refus porte sur le COÛT, pas sur le parc'
      )

      const tarifs = await exploitant.rpc('resolve_pricing_rule', {
        p_client_id: null,
        p_vehicle_id: decor.gain,
        p_on: aujourdhui,
      })
      check(
        Number(tarifs.data?.[0]?.amount) === 50000,
        'Ce même compte lit le tarif CLIENT du barème',
        String(tarifs.data?.[0]?.amount)
      )

      // e. L'écran : ni onglet, ni commission, ni montant.
      const { context, page } = await signIn(browser, base, accounts.location)

      await page.goto(`${base}/location/parc/${decor.gain}`, { waitUntil: 'load' })
      const fiche = await mainText(page)
      check(
        !fiche.includes('Coût fournisseur'),
        'L’onglet « Coût fournisseur » est absent de la fiche véhicule'
      )
      check(!digits(fiche).includes('40000'), 'Le montant du coût n’apparaît nulle part')

      // f. L'écran dédié est REFUSÉ, et la barre latérale ne le propose pas.
      await page.goto(`${base}/location/tarifs-fournisseurs`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'L’écran des tarifs fournisseurs est refusé',
        new URL(page.url()).pathname + new URL(page.url()).search
      )
      check(
        page.url().includes('rental.pricing.supplier.view'),
        'Le refus NOMME la capacité manquante'
      )

      await page.goto(`${base}/location/tarification`, { waitUntil: 'load' })
      const barre = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(
        !barre.includes('Tarifs fournisseurs'),
        'L’entrée « Tarifs fournisseurs » est absente de la barre latérale'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — AUCUNE FUITE PAR L’EXPORT NI PAR LE JOURNAL\n')

    {
      // a. L'export exige SA capacité.
      const refuse = await fetchAs(
        base,
        accounts.location,
        url,
        anonKey,
        '/api/exports/tarifs-fournisseurs'
      )
      check(
        refuse.status === 403,
        'Exporter les tarifs fournisseurs sans la capacité : HTTP 403',
        String(refuse.status)
      )

      const accorde = await fetchAs(
        base,
        accounts.couts,
        url,
        anonKey,
        '/api/exports/tarifs-fournisseurs'
      )
      check(
        accorde.status === 200 && (accorde.type ?? '').includes('spreadsheet'),
        'Avec la capacité, le classeur est produit',
        `${accorde.status} · ${accorde.type ?? ''}`
      )

      // b. Le lecteur seul n'exporte pas : voir n'est pas emporter (DEC-024).
      const lecteur = await fetchAs(
        base,
        accounts.lecteur,
        url,
        anonKey,
        '/api/exports/tarifs-fournisseurs'
      )
      check(
        lecteur.status === 403,
        'Voir les coûts n’autorise pas à les exporter',
        String(lecteur.status)
      )

      // c. LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME — DEC-038.
      const { data: evenements } = await admin
        .from('audit_log')
        .select('id')
        .eq('entity_type', 'supplier_vehicle_rates')
        .eq('action', 'PRICE_CHANGE')
        .order('occurred_at', { ascending: false })
        .limit(1)

      const evenement = evenements?.[0]
      if (!evenement) {
        check(false, 'Une écriture de coût est journalisée')
      } else {
        check(true, 'Toute écriture de coût est journalisée sous PRICE_CHANGE')

        const exploitant = await session('location')
        const detail = await exploitant.rpc('audit_entry_detail', { p_id: evenement.id })
        const row = detail.data?.[0]

        check(
          !detail.error && row?.may_read === false,
          'Lire le journal n’ouvre pas le détail d’un coût fournisseur',
          detail.error ? detail.error.message.slice(0, 60) : `may_read=${row?.may_read}`
        )
        check(
          !detail.error && row?.after_data === null,
          'Aucun montant de coût ne transite par le journal'
        )
        check(
          row?.required_permission === 'rental.pricing.supplier.view',
          'Le journal NOMME la capacité qui manque',
          row?.required_permission ?? '(aucune)'
        )

        const operateur = await session('couts')
        const ouvert = await operateur.rpc('audit_entry_detail', { p_id: evenement.id })
        check(
          !ouvert.error && ouvert.data?.[0]?.may_read === true,
          'Le porteur de la capacité lit le détail du MÊME événement'
        )
      }
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — VOIR N’EST PAS ÉCRIRE\n')

    {
      const lecteur = await session('lecteur')

      const { data: version } = await admin
        .from('supplier_vehicle_rates')
        .select('id')
        .eq('vehicle_id', decor.gain)
        .eq('is_active', true)
        .limit(1)
        .single()

      // a. Il lit — c'est sa capacité.
      const lecture = await lecteur
        .from('supplier_vehicle_rates')
        .select('amount')
        .eq('vehicle_id', decor.gain)
      check(
        !lecture.error && (lecture.data ?? []).length > 0,
        'Le lecteur obtient bien les coûts',
        `${(lecture.data ?? []).length} version(s)`
      )

      // b. Il n'ouvre pas.
      const ouverture = await lecteur.rpc('set_supplier_vehicle_rate', {
        p_vehicle_id: decor.gain,
        p_supplier_id: null,
        p_amount: 99000,
        p_unit: 'DAY',
        p_valid_from: dayOffset(200),
      })
      check(Boolean(ouverture.error), 'Voir un coût n’autorise pas à en ouvrir un')

      // c. Il ne retire pas.
      const retrait = await lecteur.rpc('deactivate_supplier_vehicle_rate', {
        p_rate_id: version.id,
        p_reason: 'Tentative',
      })
      check(Boolean(retrait.error), 'Voir un coût n’autorise pas à en retirer un')

      // d. Et l'`insert` direct est refusé par la policy.
      const brut = await lecteur.from('supplier_vehicle_rates').insert({
        vehicle_id: decor.gain,
        supplier_id: decor.fournisseur,
        amount: 99000,
        unit: 'DAY',
        valid_from: dayOffset(300),
      })
      check(Boolean(brut.error), 'L’`insert` direct sans capacité d’écriture est refusé')

      // e. LA CHRONOLOGIE EST INTACTE APRÈS LES REFUS.
      const { count: apres } = await admin
        .from('supplier_vehicle_rates')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_id', decor.gain)
      check(apres === 2, 'La chronologie est intacte après les refus', `${apres} version(s)`)
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — L’ÉCRAN D’ENSEMBLE, ET SA DATE D’EFFET\n')

    {
      const { context, page } = await signIn(browser, base, accounts.couts)

      await page.goto(`${base}/location/tarifs-fournisseurs?q=${STAMP}`, { waitUntil: 'load' })
      const liste = digits(await mainText(page))

      check(liste.includes('40000'), 'Le coût applicable aujourd’hui figure dans la liste')
      check(liste.includes('10000'), 'La commission indicative figure dans la liste')
      check(
        (await mainText(page)).includes('Sans objet'),
        'Un véhicule ADIKOM est présent, et sa ligne dit « sans objet »'
      )
      check(
        (await mainText(page)).includes('Écran interne'),
        'L’écran se déclare INTERNE et met en garde contre toute remise au client'
      )

      // LA DATE D'EFFET EST UN FILTRE : le 15 du mois prochain, c'est 45 000.
      await page.goto(`${base}/location/tarifs-fournisseurs?q=${STAMP}&au=${bascule}`, {
        waitUntil: 'load',
      })
      const futur = digits(await mainText(page))
      check(
        futur.includes('45000'),
        'À une date future, la liste rend le coût qui s’appliquera',
        bascule
      )
      check(
        futur.includes('5000') && !futur.includes('10000'),
        'Et la commission suit : 50 000 − 45 000 = 5 000'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — LA COMMISSION D’UN CONTRAT RÉEL, ET LE DOCUMENT CLIENT\n')

    {
      /*
       * UN CONTRAT EXISTANT, ET AUCUNE ÉCRITURE — la leçon coûte cher à
       * apprendre deux fois.
       *
       * Une première version de cette recette POSAIT un coût sur le véhicule du
       * contrat, puis le retirait. Le retrait supprimait bien la ligne créée —
       * mais il ne pouvait pas ROUVRIR la période que l'ouverture avait close
       * la veille (D16(a)). Le jeu de démonstration gardait donc un TROU de
       * chronologie qu'aucun nettoyage ne voyait : le `finally` ne défait que ce
       * qu'il a créé, jamais ce qu'il a déplacé.
       *
       * Cette section n'écrit donc RIEN. Elle lit le contrat, demande au
       * résolveur le coût applicable À LA DATE DU CONTRAT, et vérifie que
       * l'écran affiche exactement cet écart — ce qui est précisément la
       * question : la commission d'un contrat se calcule sur le tarif VERROUILLÉ
       * et sur le coût de SA date, jamais sur ceux d'aujourd'hui.
       */
      const { data: contrats } = await admin
        .from('rentals')
        .select(
          'id, vehicle_id, locked_amount, locked_unit, started_at, planned_period, vehicles!inner ( origin )'
        )
        .eq('vehicles.origin', 'SUPPLIED')
        .order('created_at', { ascending: false })
        .limit(1)

      const contrat = contrats?.[0]
      const operateur = await session('couts')

      const cout = contrat
        ? (
            await operateur.rpc('resolve_supplier_rate', {
              p_vehicle_id: contrat.vehicle_id,
              p_on: new Intl.DateTimeFormat('en-CA', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                timeZone: 'Indian/Comoro',
              }).format(new Date(contrat.started_at)),
            })
          ).data?.[0]
        : null

      if (!contrat) {
        check(false, 'Un contrat sur véhicule fourni est disponible pour éprouver la commission')
      } else if (!cout) {
        check(
          false,
          'Le véhicule du contrat porte un coût à la date du départ',
          'le jeu de démonstration doit en porter un — `npm run demo:seed`'
        )
      } else {
        const jour = new Intl.DateTimeFormat('en-CA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: 'Indian/Comoro',
        }).format(new Date(contrat.started_at))

        /*
         * L'ÉCART ATTENDU EST CELUI DE LA DATE DU CONTRAT, pas celui du jour.
         *
         * Le jeu de démonstration porte TROIS versions datées : si l'écran
         * retenait la version en vigueur aujourd'hui plutôt que celle du départ,
         * ce contrôle le verrait.
         */
        const attendue = Number(contrat.locked_amount) - Number(cout.amount)

        check(
          Number(cout.amount) > 0,
          'Le coût applicable au départ du contrat est résolu',
          `${cout.amount} KMF au ${jour}`
        )

        const { context, page } = await signIn(browser, base, accounts.couts)
        await page.goto(`${base}/location/locations/${contrat.id}`, { waitUntil: 'load' })
        const vue = await mainText(page)

        check(
          vue.includes('Commission de location'),
          'Le contrat porte la commission pour le profil habilité',
          `départ ${jour}`
        )
        check(
          digits(vue).includes(String(attendue)),
          `La commission vaut ${contrat.locked_amount} − ${cout.amount} = ${attendue}`,
          `au ${jour}, la date du contrat`
        )
        check(
          vue.includes('Tarif verrouillé au contrat'),
          'Elle s’appuie sur le tarif VERROUILLÉ, nommé comme tel — pas sur le barème'
        )
        check(
          vue.includes('marge d’exploitation') || vue.includes('Rentabilité'),
          'L’écran distingue la commission de la marge d’exploitation du véhicule'
        )
        await context.close()

        // Le profil location voit le contrat, ses montants — et rien du coût.
        const autre = await signIn(browser, base, accounts.location)
        await autre.page.goto(`${base}/location/locations/${contrat.id}`, { waitUntil: 'load' })
        const vueAutre = await mainText(autre.page)

        check(
          !vueAutre.includes('Commission de location'),
          'Le profil location ne voit AUCUNE commission sur le même contrat'
        )
        check(
          !digits(vueAutre).includes(String(cout.amount)),
          'Le coût d’acquisition n’apparaît nulle part sur sa page',
          `${cout.amount} absent`
        )

        /*
         * LE TEXTE RENDU NE SUFFIT PAS — consigne §15, « données embarquées
         * dans les réponses serveur ».
         *
         * Un composant serveur peut recevoir une donnée qu'il n'affiche pas :
         * elle voyage alors dans la charge utile React, lisible par quiconque
         * ouvre les outils du navigateur. Ce contrôle lit le DOCUMENT ENTIER,
         * charge utile comprise.
         */
        const brut = await autre.page.content()
        const fuite = brut.includes('supplier_vehicle_rates') || brut.includes(String(cout.amount))
        check(
          !fuite,
          'Aucun coût ne voyage dans la charge utile de la page',
          fuite ? 'coût présent dans le document' : 'document propre'
        )
        check(
          vueAutre.includes('Tarif verrouillé'),
          'Il voit pourtant bien le tarif client : le refus est CIBLÉ'
        )
        await autre.context.close()

        /*
         * LE DOCUMENT REMIS AU CLIENT — barrière n° 3 (Plan 02 §6.3).
         *
         * Le contrat se produit toujours, et il est demandé ici par un compte
         * qui DÉTIENT la capacité du coût : si un générateur composait le coût,
         * c'est ce téléchargement-là qui le ferait sortir. Le fait que les
         * générateurs ne reçoivent jamais ces colonnes est par ailleurs garanti
         * à la source par `document.test.ts`.
         */
        const pdf = await fetchAs(
          base,
          accounts.location,
          url,
          anonKey,
          `/api/documents/contrats/${contrat.id}`
        )
        check(
          pdf.status === 200 && (pdf.type ?? '').includes('pdf'),
          'Le contrat de location se produit toujours — aucune régression documentaire',
          `${pdf.status} · ${pdf.type ?? ''}`
        )
      }
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — AUCUN EFFET DE BORD\n')

    {
      await checkCatalogue(admin, check)

      const after = await demoFootprint(admin)
      check(
        JSON.stringify(after) === JSON.stringify(before),
        'Le jeu de démonstration est intact',
        JSON.stringify(after)
      )

      const { count: marges } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
        .like('code', '%.commission.%')
      check(marges === 0, 'Aucune capacité de commission n’a été créée', String(marges))

      /*
       * LE NAVIGATEUR N'A RIEN SIGNALÉ.
       *
       * Les images manquantes et les préchargements inutilisés sont du bruit
       * d'hébergement, pas des défauts applicatifs : ils sont écartés nommément
       * plutôt qu'ignorés en bloc.
       */
      const critiques = journalNavigateur.filter(
        (ligne) =>
          !/favicon|apple-touch-icon|preload|net::ERR_ABORTED|Download the React DevTools/i.test(
            ligne
          )
      )

      check(
        critiques.length === 0,
        'Aucune erreur de console ni exception sur les écrans parcourus',
        critiques.length === 0
          ? `${journalNavigateur.length} message(s) de bruit écarté(s)`
          : critiques.slice(0, 3).join(' | ')
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
      ['vehicles', 'brand', 'RECETTE SVR%'],
      ['suppliers', 'legal_name', 'RECETTE SVR%'],
      ['vehicle_categories', 'label', 'RECETTE SVR%'],
      ['supplier_vehicle_rates', 'conditions', 'RECETTE SVR%'],
      ['app_users', 'username', 'recette.svr.%'],
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
        `${DIM}Comptes, véhicules, fournisseur et tarifs de recette supprimés. Données DEMO intactes.${RESET}`
      )
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE TARIFS FOURNISSEURS : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE TARIFS FOURNISSEURS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

/**
 * Retire tout ce que cette recette a pu poser, y compris lors d'un passage
 * interrompu. Les enfants avant les parents.
 */
async function purgeStrays(admin) {
  /*
   * LE COÛT POSÉ SUR UN VÉHICULE DE DÉMONSTRATION.
   *
   * Il ne se retrouve ni par le véhicule ni par le fournisseur — les deux sont
   * réels. Il porte donc le marqueur de la recette dans ses conditions, et c'est
   * par lui qu'on le reprend. Sans cela, la démonstration garderait un coût
   * qu'aucune décision n'a posé.
   */
  await admin.from('supplier_vehicle_rates').delete().like('conditions', 'RECETTE SVR%')

  const { data: vehicles } = await admin.from('vehicles').select('id').like('brand', 'RECETTE SVR%')
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
    .like('legal_name', 'RECETTE SVR%')

  const supplierIds = (fournisseurs ?? []).map((row) => row.id)
  if (supplierIds.length > 0) {
    await admin.from('supplier_vehicle_rates').delete().in('supplier_id', supplierIds)
    await admin.from('vehicle_supplier_history').delete().in('supplier_id', supplierIds)
    await admin.from('suppliers').delete().in('id', supplierIds)
  }

  await admin.from('vehicle_categories').delete().like('label', 'RECETTE SVR%')

  const { data: comptes } = await admin
    .from('app_users')
    .select('id')
    .like('username', 'recette.svr.%')

  for (const compte of comptes ?? []) {
    await admin.from('user_permissions').delete().eq('user_id', compte.id)
    await admin.from('app_users').delete().eq('id', compte.id)
    await admin.auth.admin.deleteUser(compte.id)
  }
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

  await client.auth.signOut()

  return { status: response.status, type: response.headers.get('content-type') }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
