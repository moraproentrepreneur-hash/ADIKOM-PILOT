#!/usr/bin/env node
/**
 * Recette Catalogue de services — LOT 20, DEC-043.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:catalog` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL s'exécute avec le rôle de la chaîne de connexion, qui
 * CONTOURNE RLS : elle prouve que les déclencheurs refusent ce qu'ils doivent
 * refuser, et que les policies ont la bonne forme. Elle ne peut pas prouver que
 * LA LECTURE EST RÉELLEMENT FERMÉE.
 *
 * C'est ce que celle-ci fait, avec de VRAIES SESSIONS — jeton Supabase, cookie
 * applicatif, appels PostgREST directs :
 *
 *   1. Sans `catalog.services.view`, l'écran est REFUSÉ.
 *   2. Le PROFIL VENTE voit les services et leurs prix de vente, et l'écran lui
 *      DIT que les prix d'achat existent et ne lui sont pas ouverts.
 *   3. L'appel DIRECT à la table des coûts ne lui rend RIEN — ni par `select`,
 *      ni par le résolveur. C'est le cœur du lot.
 *   4. Le PROFIL COÛTS, lui, les obtient.
 *   5. Les écritures croisées sont refusées : vente ne saisit pas un coût,
 *      coûts ne modifie pas un prix de vente.
 *   6. LE SCÉNARIO DE LA DIRECTION, à l'écran : un prix change, l'ancien reste
 *      historisé, une date antérieure garde l'ancien montant.
 *   7. Un prix FUTUR se saisit sans attendre sa date d'effet.
 *   8. Une catégorie ARCHIVÉE n'est plus proposée à la création d'un service.
 *   9. L'export exige SA capacité ; sans elle, 403.
 *  10. Aucun résidu, jeu DEMO intact, catalogue conforme au code déclaré.
 *
 * Utilisation :
 *   node scripts/verify-catalog.mjs [url]
 *
 * NE JAMAIS piper la sortie vers `head` : SIGPIPE tuerait le processus avant son
 * nettoyage, et laisserait des comptes et des services de recette en base.
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
const MARK = `RECETTE CATALOGUE ${STAMP}`

const BASE = ['dashboard.view']

const PROFILES = {
  /* Tout le catalogue, coûts compris : c'est lui qui met le décor en place. */
  complet: [
    ...BASE,
    'catalog.services.view',
    'catalog.services.create',
    'catalog.services.update',
    'catalog.services.archive',
    'catalog.services.export',
    'catalog.services.price.update',
    'catalog.services.cost.view',
    'catalog.services.cost.update',
    'catalog.categories.view',
    'catalog.categories.create',
    'catalog.categories.update',
    'catalog.categories.archive',
    'users.audit.view',
  ],

  /*
   * LE PROFIL VENTE — le cœur du lot.
   *
   * Il gère le catalogue et fixe les prix de vente. Il n'a NI `cost.view`, NI
   * `cost.update`, NI `export` : un utilisateur capable de vendre un service ne
   * doit pas pouvoir voir ce qu'il a coûté, ni emporter la liste.
   *
   * IL DÉTIENT EN REVANCHE `users.audit.view`, et c'est délibéré : sans elle, le
   * refus du journal prouverait seulement qu'il ne lit pas le journal. Avec
   * elle, il prouve ce qui compte — LIRE LE JOURNAL N'OUVRE PAS LE COÛT
   * (DEC-038).
   */
  vente: [
    ...BASE,
    'catalog.services.view',
    'catalog.services.create',
    'catalog.services.update',
    'catalog.services.price.update',
    'catalog.categories.view',
    'users.audit.view',
  ],

  /* Il voit les coûts, et ne touche à aucun prix de vente. */
  couts: [...BASE, 'catalog.services.view', 'catalog.services.cost.view'],

  /* Il n'a rien du catalogue : l'écran doit lui être refusé. */
  nul: [...BASE],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.cat.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-cat-${STAMP}`

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
    last_name: `Cat ${key}`,
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

async function signIn(browser, base, account) {
  const context = await browser.newContext()
  const page = await context.newPage()

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
   * L'EMPREINTE SE PREND AVANT TOUTE ÉCRITURE, et on refuse de démarrer si un
   * passage précédent a laissé des résidus : un `finally` ne protège que son
   * propre passage.
   */
  const before = await demoFootprint(admin)

  const { count: demoAvant } = await admin
    .from('services')
    .select('id', { count: 'exact', head: true })
    .like('label', 'SERVICE DEMO%')

  const { count: strays } = await admin
    .from('services')
    .select('id', { count: 'exact', head: true })
    .like('label', 'RECETTE CATALOGUE%')

  if (strays > 0) {
    console.log(
      `${DIM}${strays} service(s) d’un passage antérieur détecté(s) : nettoyage préalable.${RESET}`
    )
    await purgeStrays(admin)
  }

  const accounts = {}
  const sessions = {}
  const browser = await chromium.launch()

  /** Ce que la recette a créé, pour le retirer à coup sûr. */
  const made = { categories: [], services: [] }

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

  // Dates relatives au JOUR COMORIEN : une recette ne doit pas expirer avec le
  // calendrier.
  const hier = dayOffset(-60)
  const aujourdhui = dayOffset(0)
  const demain = dayOffset(45)

  let serviceId = null
  let variantId = null

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
    console.log('1 — LE DÉCOR : UNE CATÉGORIE, UN SERVICE, UN PRIX\n')

    {
      const { context, page } = await signIn(browser, base, accounts.complet)

      // a. La catégorie, par l'écran.
      await page.goto(`${base}/catalogue/categories`, { waitUntil: 'load' })
      await page.getByRole('button', { name: 'Nouvelle catégorie' }).click()
      await page.fill('#code', `RECCAT${STAMP}`)
      await page.fill('#label', `${MARK} — Catégorie`)
      await page.getByRole('button', { name: 'Créer la catégorie' }).click()
      // On attend L'EFFET, pas `networkidle` : le libellé apparu dans la liste.
      await page.getByText(`${MARK} — Catégorie`).first().waitFor({ timeout: 60000 })
      check(true, 'Une catégorie se crée depuis l’écran')

      const { data: category } = await admin
        .from('service_categories')
        .select('id')
        .eq('code', `RECCAT${STAMP}`)
        .single()
      made.categories.push(category.id)

      // b. Le service, par l'écran. Destination « achat et vente » : c'est la
      //    seule qui permette d'éprouver les deux prix et la marge.
      await page.goto(`${base}/catalogue/services/nouveau`, { waitUntil: 'load' })
      await page.fill('#label', `${MARK} — Transfert`)
      await page.selectOption('#categoryId', { label: `${MARK} — Catégorie` })
      await page.selectOption('#purpose', 'BOTH')
      await page.getByRole('button', { name: 'Créer le service' }).click()

      // Un motif à jokers sur `/catalogue/services/` ATTRAPERAIT `/nouveau`, la
      // page d'où l'on part : l'attente serait satisfaite avant même
      // l'enregistrement, et la recette repartirait avec « nouveau » pour
      // identifiant. Le prédicat exige donc un véritable identifiant.
      await page.waitForURL((target) => /\/catalogue\/services\/[0-9a-f-]{36}/.test(target.pathname), {
        timeout: 90000,
      })

      const created = page.url()
      serviceId = created.split('/catalogue/services/')[1]?.split('?')[0] ?? null
      check(
        Boolean(serviceId) && serviceId !== 'nouveau',
        'Le service est créé et sa fiche s’ouvre',
        serviceId ?? '(aucun identifiant)'
      )
      made.services.push(serviceId)

      // c. LA VARIANTE « STANDARD » EXISTE, sans que personne l'ait demandée.
      const { data: variants } = await admin
        .from('service_variants')
        .select('id, label, is_default')
        .eq('service_id', serviceId)
      check(
        (variants ?? []).length === 1 && variants[0].label === 'Standard' && variants[0].is_default,
        'Le service naît avec sa variante « Standard » par défaut'
      )
      variantId = variants?.[0]?.id ?? null

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LE SCÉNARIO DE LA DIRECTION, À L’ÉCRAN\n')

    {
      const { context, page } = await signIn(browser, base, accounts.complet)
      await page.goto(`${base}/catalogue/services/${serviceId}?onglet=prix`, { waitUntil: 'load' })

      // a. Le premier prix, applicable depuis deux mois.
      await page.getByRole('button', { name: 'Nouveau prix' }).first().click()
      await page.fill(`#sale-${variantId}-amount`, '50000')
      await page.fill(`#sale-${variantId}-validFrom`, hier)
      await page.fill(`#sale-${variantId}-reason`, 'Tarif d’ouverture')
      await page.getByRole('button', { name: 'Enregistrer ce prix' }).click()
      await page.getByText('50 000').first().waitFor({ timeout: 60000 })
      check(true, 'Un premier prix de vente est enregistré', '50 000 KMF')

      // b. LE PRIX FUTUR, SAISI AUJOURD'HUI — ce que « le prix de la fiche » ne
      //    savait pas faire.
      await page.reload({ waitUntil: 'load' })
      await page.getByRole('button', { name: 'Nouveau prix' }).first().click()
      await page.fill(`#sale-${variantId}-amount`, '60000')
      await page.fill(`#sale-${variantId}-validFrom`, demain)
      await page.fill(`#sale-${variantId}-reason`, 'Révision tarifaire')
      await page.getByRole('button', { name: 'Enregistrer ce prix' }).click()
      await page.getByText('60 000').first().waitFor({ timeout: 60000 })
      check(true, 'Un prix futur est saisi sans attendre sa date d’effet', `à partir du ${demain}`)

      const fiche = await mainText(page)
      check(
        fiche.includes('50 000') && fiche.includes('60 000'),
        'Les deux versions coexistent dans l’historique'
      )
      check(
        /applicable au/i.test(fiche) && fiche.includes('50 000'),
        'Le prix applicable AUJOURD’HUI reste l’ancien'
      )

      await context.close()
    }

    /* --- Et la base le confirme, par le résolveur -------------------------- */
    {
      const op = await session('complet')

      const ancien = await op.rpc('resolve_service_price', {
        p_variant_id: variantId,
        p_on: aujourdhui,
      })
      check(
        Number(ancien.data?.[0]?.amount) === 50000,
        'Le résolveur rend 50 000 pour aujourd’hui',
        String(ancien.data?.[0]?.amount ?? ancien.error?.message ?? 'aucune ligne')
      )

      const futur = await op.rpc('resolve_service_price', {
        p_variant_id: variantId,
        p_on: dayOffset(60),
      })
      check(
        Number(futur.data?.[0]?.amount) === 60000,
        'Le résolveur rend 60 000 après la bascule',
        String(futur.data?.[0]?.amount ?? 'aucune ligne')
      )

      // L'ANCIENNE VERSION N'A PAS ÉTÉ RÉÉCRITE : elle est close, pas modifiée.
      const { data: versions } = await admin
        .from('service_variant_prices')
        .select('amount, valid_from, valid_to')
        .eq('variant_id', variantId)
        .order('valid_from')

      check(
        versions?.length === 2 && Number(versions[0].amount) === 50000,
        'L’ancienne version conserve son montant',
        `${versions?.length ?? 0} version(s)`
      )
      check(
        versions?.[0]?.valid_to !== null && versions?.[1]?.valid_to === null,
        'L’ancienne version est close, la nouvelle est ouverte',
        `${versions?.[0]?.valid_to} → ${versions?.[1]?.valid_from}`
      )

      // UN TROU NE REND AUCUNE LIGNE, et surtout pas un zéro.
      const avant = await op.rpc('resolve_service_price', {
        p_variant_id: variantId,
        p_on: dayOffset(-400),
      })
      check(
        !avant.error && (avant.data ?? []).length === 0,
        'Avant toute version, le résolveur ne rend AUCUNE ligne — jamais zéro'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — LE COÛT EXISTE, ET IL EST CONFIDENTIEL\n')

    {
      const op = await session('complet')

      const pose = await op.rpc('set_service_cost', {
        p_variant_id: variantId,
        p_amount: 35000,
        p_valid_from: hier,
        p_reason: 'Coût d’acquisition',
      })
      check(!pose.error, 'Le porteur de `cost.update` saisit un prix d’achat', pose.error?.message)

      const lecture = await op
        .from('service_variant_costs')
        .select('amount')
        .eq('variant_id', variantId)
      check(
        !lecture.error && Number(lecture.data?.[0]?.amount) === 35000,
        'Le porteur de `cost.view` lit le prix d’achat',
        String(lecture.data?.[0]?.amount ?? lecture.error?.message)
      )
    }

    {
      /*
       * LE CONTRÔLE CENTRAL DU LOT.
       *
       * Le profil VENTE gère le catalogue et fixe les prix de vente. Il ne doit
       * obtenir le coût par AUCUNE voie : ni l'écran, ni la table, ni le
       * résolveur, ni l'historique.
       */
      const vendeur = await session('vente')

      const direct = await vendeur
        .from('service_variant_costs')
        .select('amount')
        .eq('variant_id', variantId)
      check(
        !direct.error && (direct.data ?? []).length === 0,
        'L’appel PostgREST direct sur les coûts ne lui rend AUCUNE ligne',
        direct.error ? direct.error.message : `${direct.data?.length ?? 0} ligne(s)`
      )

      const resolveur = await vendeur.rpc('resolve_service_cost', {
        p_variant_id: variantId,
        p_on: aujourdhui,
      })
      check(
        !resolveur.error && (resolveur.data ?? []).length === 0,
        'Le résolveur de coût ne lui rend AUCUNE ligne'
      )

      // Et il lit bien les prix de VENTE : le refus est ciblé, pas général.
      const vente = await vendeur
        .from('service_variant_prices')
        .select('amount')
        .eq('variant_id', variantId)
      check(
        !vente.error && (vente.data ?? []).length === 2,
        'Il lit en revanche les prix de vente',
        `${vente.data?.length ?? 0} version(s)`
      )
    }

    {
      // À L'ÉCRAN : le bloc fermé est NOMMÉ, pas effacé (DEC-017).
      const { context, page } = await signIn(browser, base, accounts.vente)
      await page.goto(`${base}/catalogue/services/${serviceId}?onglet=prix`, { waitUntil: 'load' })
      const fiche = await mainText(page)

      check(fiche.includes('Prix de vente'), 'Le profil vente voit les prix de vente')
      check(
        fiche.includes('ne vous sont pas accessibles'),
        'L’écran DIT que les prix d’achat ne lui sont pas ouverts'
      )
      check(
        !fiche.includes('35 000'),
        'Aucun montant de coût n’apparaît à l’écran'
      )
      check(
        /marge n’est pas affichée/i.test(fiche),
        'L’écran dit pourquoi la marge n’est pas montrée'
      )

      await context.close()
    }

    {
      // Et le porteur de `cost.view`, lui, obtient coût ET marge.
      const { context, page } = await signIn(browser, base, accounts.complet)
      await page.goto(`${base}/catalogue/services/${serviceId}?onglet=prix`, { waitUntil: 'load' })
      const fiche = await mainText(page)

      check(fiche.includes('35 000'), 'Le porteur de `cost.view` voit le prix d’achat')
      check(/Marge unitaire/i.test(fiche), 'La marge est présentée à qui peut la calculer')
      check(fiche.includes('15 000'), 'La marge affichée est juste', '50 000 − 35 000')

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LES ÉCRITURES CROISÉES SONT REFUSÉES\n')

    {
      const vendeur = await session('vente')
      const comptable = await session('couts')

      const coutParVendeur = await vendeur.rpc('set_service_cost', {
        p_variant_id: variantId,
        p_amount: 1,
        p_valid_from: dayOffset(120),
      })
      check(
        Boolean(coutParVendeur.error),
        'Le profil vente ne peut pas saisir un prix d’achat',
        coutParVendeur.error ? coutParVendeur.error.message.slice(0, 70) : '*** AUTORISÉ À TORT ***'
      )

      const prixParComptable = await comptable.rpc('set_service_price', {
        p_variant_id: variantId,
        p_amount: 1,
        p_valid_from: dayOffset(150),
      })
      check(
        Boolean(prixParComptable.error),
        'Le profil coûts ne peut pas modifier un prix de vente',
        prixParComptable.error
          ? prixParComptable.error.message.slice(0, 70)
          : '*** AUTORISÉ À TORT ***'
      )

      // `cost.view` SANS `cost.update` : lire n'est pas écrire.
      const ecriture = await comptable.rpc('set_service_cost', {
        p_variant_id: variantId,
        p_amount: 1,
        p_valid_from: dayOffset(180),
      })
      check(
        Boolean(ecriture.error),
        'Voir un coût n’autorise pas à le saisir',
        ecriture.error ? ecriture.error.message.slice(0, 70) : '*** AUTORISÉ À TORT ***'
      )

      // Un insert direct dans la table est refusé de la même façon.
      const brut = await vendeur
        .from('service_variant_costs')
        .insert({ variant_id: variantId, amount: 1, valid_from: dayOffset(200) })
      check(
        Boolean(brut.error),
        'L’insertion directe d’un coût lui est refusée',
        brut.error ? brut.error.message.slice(0, 70) : '*** AUTORISÉ À TORT ***'
      )

      // Et la chronologie est intacte : un refus qui laisserait passer une
      // ligne ne serait pas un refus.
      const { count } = await admin
        .from('service_variant_costs')
        .select('id', { count: 'exact', head: true })
        .eq('variant_id', variantId)
      check(count === 1, 'Une seule version de coût, celle du porteur légitime', String(count))
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — SANS LA LECTURE, PAS D’ÉCRAN\n')

    {
      const { context, page } = await signIn(browser, base, accounts.nul)

      await page.goto(`${base}/catalogue/services`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Sans `catalog.services.view`, la liste est refusée',
        page.url().replace(base, '')
      )

      await page.goto(`${base}/catalogue/categories`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Sans `catalog.categories.view`, les catégories sont refusées'
      )

      await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      const menu = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(
        !menu.includes('Produits & Services'),
        'Le module n’apparaît pas dans sa barre latérale'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — UNE CATÉGORIE ARCHIVÉE NE SE PROPOSE PLUS\n')

    {
      const { context, page } = await signIn(browser, base, accounts.complet)

      await page.goto(`${base}/catalogue/categories`, { waitUntil: 'load' })
      const ligne = page.locator('li', { hasText: `${MARK} — Catégorie` }).first()
      await ligne.getByRole('button', { name: 'Archiver' }).click()
      await page.getByText('Archivée').first().waitFor({ timeout: 60000 })
      check(true, 'La catégorie s’archive')

      await page.goto(`${base}/catalogue/services/nouveau`, { waitUntil: 'load' })
      const options = await page.locator('#categoryId option').allInnerTexts()
      check(
        !options.some((option) => option.includes(`${MARK} — Catégorie`)),
        'Elle n’est plus proposée à la création d’un service',
        `${options.length} option(s) restante(s)`
      )

      // Le service existant N'EST PAS DÉCLASSÉ : sa fiche le dit.
      await page.goto(`${base}/catalogue/services/${serviceId}`, { waitUntil: 'load' })
      const fiche = await mainText(page)
      check(
        fiche.includes(`${MARK} — Catégorie`) && fiche.includes('archivée'),
        'Le service existant garde sa catégorie, et la fiche signale qu’elle est archivée'
      )

      await context.close()
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — L’EXPORT EXIGE SA PROPRE CAPACITÉ (DEC-024)\n')

    {
      const refuse = await fetchAs(base, accounts.vente, url, anonKey, '/api/exports/services')
      check(
        refuse.status === 403,
        'Sans `catalog.services.export`, l’export est refusé',
        `HTTP ${refuse.status}`
      )

      const autorise = await fetchAs(base, accounts.complet, url, anonKey, '/api/exports/services')
      check(
        autorise.status === 200,
        'Avec la capacité, le classeur est produit',
        `HTTP ${autorise.status}`
      )
      check(
        (autorise.type ?? '').includes('spreadsheet'),
        'Le fichier est bien un classeur',
        autorise.type ?? '(aucun type)'
      )
    }

    /* ================================================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — LE JOURNAL DIT QUI, SANS OUVRIR LE COÛT\n')

    {
      const { data: events } = await admin
        .from('audit_log')
        .select('action, entity_type, module_code')
        .eq('module_code', 'catalog')
        .order('occurred_at', { ascending: false })
        .limit(50)

      check(
        (events ?? []).some(
          (event) => event.action === 'PRICE_CHANGE' && event.entity_type === 'service_variant_prices'
        ),
        'Un changement de prix de vente est journalisé en PRICE_CHANGE'
      )
      check(
        (events ?? []).some(
          (event) => event.action === 'PRICE_CHANGE' && event.entity_type === 'service_variant_costs'
        ),
        'Un changement de prix d’achat est journalisé en PRICE_CHANGE'
      )

      // LE DÉTAIL D'UN COÛT RESTE FERMÉ au profil vente, même par le journal.
      const { data: coutEvent } = await admin
        .from('audit_log')
        .select('id')
        .eq('entity_type', 'service_variant_costs')
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!coutEvent) {
        check(false, 'Un événement de coût est disponible pour éprouver le journal')
      } else {
        /*
         * LE PROFIL VENTE DÉTIENT `users.audit.view` : le refus qui suit ne
         * vient donc PAS du journal, mais de la lecture du coût. C'est ce que
         * DEC-038 promet, et ce que le LOT 20 doit tenir.
         */
        const vendeur = await session('vente')
        const detail = await vendeur.rpc('audit_entry_detail', { p_id: coutEvent.id })
        const row = detail.data?.[0]

        check(
          !detail.error && row?.may_read === false,
          'Lire le journal n’ouvre pas le détail d’un coût',
          detail.error ? detail.error.message.slice(0, 60) : `may_read=${row?.may_read}`
        )
        check(
          !detail.error && row?.after_data === null,
          'Aucun montant d’achat ne transite par le journal'
        )
        check(
          row?.required_permission === 'catalog.services.cost.view',
          'Le journal NOMME la capacité qui manque',
          row?.required_permission ?? '(aucune)'
        )

        // Et le porteur de `cost.view` l'obtient : le refus est ciblé, pas
        // général.
        const op = await session('complet')
        const ouvert = await op.rpc('audit_entry_detail', { p_id: coutEvent.id })
        check(
          !ouvert.error && ouvert.data?.[0]?.may_read === true,
          'Le porteur de `cost.view` lit le détail de ce même événement'
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

      const { count: demoServices } = await admin
        .from('services')
        .select('id', { count: 'exact', head: true })
        .like('label', 'SERVICE DEMO%')
      check(
        demoServices === demoAvant,
        'Les services de démonstration sont intacts',
        `${demoServices} / ${demoAvant}`
      )

      const { count: produits } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
        .like('code', 'catalog.products.%')
      check(produits === 0, 'Aucune capacité de produit n’a été créée', String(produits))
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
     * interrompu laisse des objets que `made` ne connaît pas.
     */
    await purgeStrays(admin)

    const { count: restantsServices } = await admin
      .from('services')
      .select('id', { count: 'exact', head: true })
      .like('label', 'RECETTE CATALOGUE%')
    if (restantsServices) leftovers.push(`services : ${restantsServices}`)

    const { count: restantsComptes } = await admin
      .from('app_users')
      .select('id', { count: 'exact', head: true })
      .like('username', 'recette.cat.%')
    if (restantsComptes) leftovers.push(`comptes : ${restantsComptes}`)

    if (leftovers.length > 0) {
      failed += 1
      console.log(`\n${RED}Résidus de recette non supprimés — ${leftovers.join(' · ')}${RESET}`)
    } else {
      console.log(`${DIM}Comptes et services de recette supprimés. Données DEMO intactes.${RESET}`)
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE CATALOGUE : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE CATALOGUE : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

/**
 * Retire tout ce que cette recette a pu poser, y compris lors d'un passage
 * interrompu. Les enfants avant les parents.
 */
async function purgeStrays(admin) {
  const { data: services } = await admin
    .from('services')
    .select('id')
    .like('label', 'RECETTE CATALOGUE%')

  const ids = (services ?? []).map((row) => row.id)

  if (ids.length > 0) {
    const { data: variants } = await admin
      .from('service_variants')
      .select('id')
      .in('service_id', ids)

    const variantIds = (variants ?? []).map((row) => row.id)

    if (variantIds.length > 0) {
      await admin.from('service_variant_prices').delete().in('variant_id', variantIds)
      await admin.from('service_variant_costs').delete().in('variant_id', variantIds)
      await admin.from('service_variants').delete().in('id', variantIds)
    }

    await admin.from('services').delete().in('id', ids)
  }

  await admin.from('service_categories').delete().like('code', 'RECCAT%')

  const { data: comptes } = await admin
    .from('app_users')
    .select('id')
    .like('username', 'recette.cat.%')

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
