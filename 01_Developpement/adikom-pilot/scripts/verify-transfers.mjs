#!/usr/bin/env node
/**
 * Recette Virement interne et Paiements divers — LOT 17.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * `db:verify:transfers` contrôle le schéma et les règles avec la clé de
 * service, qui contourne RLS et les gardes de capacité. Celle-ci fait
 * l'inverse : elle agit avec de VRAIES SESSIONS, aux capacités minimales, par
 * l'écran ET par appel direct.
 *
 *   1. Le cycle complet à l'écran : saisir, valider, voir les DEUX soldes
 *      bouger, annuler, les voir revenir (Module 06 §30, §31, §33).
 *   2. §30 — les fonds insuffisants bloquent la validation, avec son motif.
 *   3. DEC-024 / DEC-040 — `treasury.transfers.view` gouverne l'écran : ni
 *      `entries.view` ni `transfers.create` ne l'ouvrent.
 *   4. Saisir n'est pas valider : un compte de saisie voit le brouillon et se
 *      voit refuser la validation, à l'écran comme par RPC.
 *   5. LE DEMI-VIREMENT EST IMPOSSIBLE — un `PATCH` direct qui passe un
 *      virement à « Validé » sans écriture est refusé par la garde différée.
 *   6. Une écriture ne se fabrique pas : `INSERT` direct sur un brouillon,
 *      sur un compte étranger, dans le mauvais sens — tous refusés.
 *   7. Une écriture ne se défait que sous LA capacité de son origine : un
 *      profil qui annule les règlements — et qui LIT les écritures du
 *      virement — ne peut pas les annuler (migration 073).
 *   8. Paiement divers : brouillon sans écriture, validation qui débite,
 *      annulation qui rend, aucune modification possible (Module 07 §43 à §47).
 *   9. Les données DEMO sont intactes, le catalogue à 178, aucun résidu.
 *
 * Utilisation :
 *   node scripts/verify-transfers.mjs [url]
 *
 * NE JAMAIS piper la sortie vers `head` : SIGPIPE tuerait le processus avant
 * son nettoyage, et laisserait des comptes financiers en base.
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { dayOffset, loadEnvFile, required } from './lib/env.mjs'
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
const MARK = `RECETTE VIR ${STAMP}`

/**
 * Un profil par capacité éprouvée — jamais une de plus.
 *
 * Chacun porte exactement ce que l'acte exige, et le voisin porte exactement
 * ce qui ne devrait PAS suffire. Un profil trop généreux ne prouve rien.
 */
const PROFILES = {
  // Le compte complet : il accomplit tout légitimement.
  full: [
    'treasury.accounts.view',
    'treasury.accounts.create',
    'treasury.accounts.archive',
    'treasury.balances.view',
    'treasury.entries.view',
    'treasury.transfers.view',
    'treasury.transfers.create',
    'treasury.transfers.validate',
    'treasury.transfers.cancel',
    'billing.misc_payments.view',
    'billing.misc_payments.create',
    'billing.misc_payments.validate',
    'billing.misc_payments.cancel',
  ],
  // Saisit, mais ne valide pas : la séparation de DEC-040, éprouvée.
  saisie: [
    'treasury.accounts.view',
    'treasury.transfers.view',
    'treasury.transfers.create',
    'billing.misc_payments.view',
    'billing.misc_payments.create',
  ],
  // Valide sans lire les écritures : la garde différée doit refuser.
  valideurAveugle: [
    'treasury.accounts.view',
    'treasury.balances.view',
    'treasury.transfers.view',
    'treasury.transfers.validate',
    'treasury.transfers.cancel',
    'billing.misc_payments.view',
    'billing.misc_payments.validate',
    'billing.misc_payments.cancel',
  ],
  // Voit les écritures, PAS les virements : l'écran doit lui rester fermé.
  ecritures: ['treasury.accounts.view', 'treasury.balances.view', 'treasury.entries.view'],
  /*
   * Le VOISIN : il annule les règlements, pas les virements.
   *
   * Il porte `supplier_payments.cancel` et `customer_payments.cancel`, et LIT
   * les écritures. Avant la migration 073, la policy d'UPDATE était une
   * disjonction de capacités sans lien avec l'origine de la ligne : il pouvait
   * annuler l'écriture d'un VIREMENT, dont le virement restait validé.
   */
  voisin: [
    'treasury.accounts.view',
    'treasury.entries.view',
    'billing.supplier_payments.cancel',
    'billing.customer_payments.cancel',
  ],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.vir.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-vir-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${key} : ${error?.message}`)

  // Inscrit AVANT le profil et les permissions : un échec ultérieur ne rend
  // plus ce compte invisible au nettoyage.
  const id = created.user.id
  accounts[key] = { id, email, password, username }

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Virement ${key}`,
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
  await page.click('button[type="submit"]')
  await page.waitForURL('**/tableau-de-bord', { timeout: 30000 })

  return { context, page }
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/**
 * Déclenche un acte qui FAIT DISPARAÎTRE SON PROPRE FORMULAIRE.
 *
 * Valider un virement retire le panneau de validation ; l'annuler retire celui
 * d'annulation. Le message de succès s'en va avec eux, et l'attendre rendrait
 * la recette intermittente. Le repère devient donc l'ÉTAT AFFICHÉ ENSUITE —
 * la phrase que la fiche porte une fois l'acte accompli — relu jusqu'à ce
 * qu'il change.
 *
 * `networkidle` ne prouverait rien : une action serveur rend son résultat par
 * un nouvel arbre React, sans navigation.
 */
async function actUntil(page, buttonName, needle, timeout = 90000) {
  const button = page.getByRole('button', { name: buttonName }).first()
  await button.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(800)
  await button.click()

  const started = Date.now()
  for (;;) {
    const text = await mainText(page).catch(() => '')
    if (text.includes(needle)) return true
    if (Date.now() - started > timeout) return false
    await page.waitForTimeout(1500)
    if (Date.now() - started > timeout / 3) await page.reload({ waitUntil: 'load' })
  }
}

/**
 * Identifiant de la fiche atteinte après une création.
 *
 * `waitForURL('**\/virements/**')` ne suffit pas : `/virements/nouveau` y
 * répond déjà, et la recette repartirait avec « nouveau » pour identifiant —
 * chaque appel suivant échouerait sur un UUID invalide, en accusant la base.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

async function createdId(page, prefix) {
  await page.waitForURL((current) => UUID.test(current.toString()), { timeout: 60000 })
  const match = page.url().split(prefix)[1]?.split('?')[0]
  if (!match || !UUID.test(match)) {
    throw new Error(`identifiant introuvable dans l'URL : ${page.url()}`)
  }
  return match
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

  /*
   * L'EMPREINTE DU JEU DE DÉMONSTRATION, PRISE AVANT TOUTE ÉCRITURE.
   *
   * Le contrôle final vérifie que la recette n'a touché à rien qui ne lui
   * appartienne. Il se comparait autrefois à un nombre écrit en dur, qui a
   * cessé d'être vrai dès que la démonstration s'est étoffée.
   */
  const demoAvant = await demoFootprint(admin)

  console.log(`\nCible : ${base}\n`)

  const accounts = {}
  const sessions = {}
  const fixtures = { financial: [], transfers: [], miscPayments: [] }
  const browser = await chromium.launch()

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

  try {
    /* --- Sujets : deux comptes, l'un approvisionné ------------------------ */
    const { data: srcId } = await admin.rpc('create_financial_account', {
      p_kind: 'CASH',
      p_label: `${MARK} — Caisse source`,
      p_institution: 'Recette',
      p_opening_balance: 1000000,
      p_opened_on: dayOffset(-30),
    })
    fixtures.financial.push(srcId)

    const { data: dstId } = await admin.rpc('create_financial_account', {
      p_kind: 'BANK',
      p_label: `${MARK} — Banque destination`,
      p_institution: 'Recette',
      p_opening_balance: 200000,
      p_opened_on: dayOffset(-30),
    })
    fixtures.financial.push(dstId)

    for (const [key, codes] of Object.entries(PROFILES)) {
      await createProfile(admin, accounts, key, codes)
    }

    console.log(
      `${DIM}Sujets : caisse à 1 000 000 KMF, banque à 200 000 KMF, quatre profils.${RESET}`
    )

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — LA LECTURE DES VIREMENTS EST UNE CAPACITÉ À PART\n')

    {
      const { context, page } = await signIn(browser, base, accounts.ecritures)

      await page.goto(`${base}/tresorerie/virements`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        !text.includes('Virements internes') || text.includes('Accès refusé'),
        'Sans `treasury.transfers.view`, l’écran des virements reste fermé',
        text.slice(0, 60)
      )

      const nav = (await page.locator('nav').first().innerText()).replace(/\s+/g, ' ')
      check(
        !nav.includes('Virement interne'),
        'Le menu « Virement interne » n’est pas proposé à qui ne peut pas les lire'
      )

      // Le contrôle négatif ne vaut que si le positif tient aussi.
      const client = await session('ecritures')
      const { data: rows } = await client.from('internal_transfers').select('id')
      check(
        (rows ?? []).length === 0,
        'RLS masque la table elle-même, pas seulement l’écran',
        `${(rows ?? []).length} ligne(s)`
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — SAISIR N’EST PAS VALIDER (DEC-040)\n')

    let transferId = null

    {
      const { context, page } = await signIn(browser, base, accounts.saisie)

      await page.goto(`${base}/tresorerie/virements/nouveau`, { waitUntil: 'load' })
      await page.waitForFunction(
        () => document.querySelector('select[name="sourceAccountId"]') !== null
      )

      await page.selectOption('select[name="sourceAccountId"]', srcId)
      await page.selectOption('select[name="destinationAccountId"]', dstId)
      await page.fill('input[name="amount"]', '300000')
      await page.fill('input[name="transferDate"]', dayOffset(0))
      await page.fill('input[name="purpose"]', `${MARK} — approvisionnement`)

      await page.getByRole('button', { name: 'Enregistrer le virement' }).click()
      transferId = await createdId(page, '/tresorerie/virements/')
      fixtures.transfers.push(transferId)

      const text = await mainText(page)
      check(text.includes('Brouillon'), 'Le virement naît en brouillon')
      check(
        text.includes('Aucun fonds déplacé') || text.includes('aucun fonds'),
        'L’écran dit qu’aucun fonds n’a bougé'
      )
      check(
        !text.includes('Valider le virement'),
        'Un compte de saisie ne se voit pas proposer la validation'
      )

      // Les soldes n'ont pas bougé : le brouillon ne produit aucune écriture.
      const { data: entries } = await admin
        .from('treasury_entries')
        .select('id')
        .eq('internal_transfer_id', transferId)
      check(
        (entries ?? []).length === 0,
        'Un brouillon ne produit aucune écriture',
        `${(entries ?? []).length}`
      )

      await context.close()
    }

    {
      const client = await session('saisie')

      const rpc = await client.rpc('validate_internal_transfer', {
        p_transfer_id: transferId,
      })
      check(
        Boolean(rpc.error),
        'RPC direct : valider sans `transfers.validate` est refusé',
        rpc.error?.message?.slice(0, 70)
      )

      const patch = await client
        .from('internal_transfers')
        .update({ status: 'VALIDATED', validated_at: new Date().toISOString() })
        .eq('id', transferId)
        .select('id')
      check(
        Boolean(patch.error) || (patch.data ?? []).length === 0,
        'PATCH direct : le statut ne se force pas sans la capacité',
        patch.error?.message?.slice(0, 70) ?? 'aucune ligne modifiée'
      )

      const { data: after } = await admin
        .from('internal_transfers')
        .select('status')
        .eq('id', transferId)
        .maybeSingle()
      check(after?.status === 'DRAFT', 'Le virement est resté en brouillon', after?.status)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — LE DEMI-VIREMENT EST IMPOSSIBLE\n')

    {
      const client = await session('valideurAveugle')

      /*
       * Ce profil DÉTIENT `transfers.validate` : la policy le laisse écrire. Il
       * ne détient PAS `treasury.entries.view` — il ne peut donc pas produire
       * les écritures. La garde différée doit refuser la transaction ENTIÈRE.
       */
      const patch = await client
        .from('internal_transfers')
        .update({ status: 'VALIDATED', validated_at: new Date().toISOString() })
        .eq('id', transferId)
        .select('id')

      check(
        Boolean(patch.error),
        'PATCH direct : « validé » sans écriture est refusé par la garde différée',
        patch.error?.message?.slice(0, 80)
      )

      const { data: after } = await admin
        .from('internal_transfers')
        .select('status')
        .eq('id', transferId)
        .maybeSingle()
      check(
        after?.status === 'DRAFT',
        'Aucun virement validé ne subsiste sans ses deux écritures',
        after?.status
      )

      // Et l'acte légitime lui est refusé pour le même motif, mais NOMMÉ.
      const rpc = await client.rpc('validate_internal_transfer', {
        p_transfer_id: transferId,
      })
      check(
        Boolean(rpc.error) && /écriture|Droit insuffisant/i.test(rpc.error?.message ?? ''),
        'La fonction refuse d’emblée, en nommant la lecture manquante',
        rpc.error?.message?.slice(0, 80)
      )
    }

    {
      const client = await session('full')

      // Une écriture ne se fabrique pas : le virement n'est pas encore validé.
      const early = await client.from('treasury_entries').insert({
        account_id: srcId,
        entry_date: dayOffset(0),
        direction: 'OUT',
        kind: 'TRANSFER',
        amount: 300000,
        internal_transfer_id: transferId,
      })
      check(
        Boolean(early.error),
        'INSERT direct : aucune écriture ne devance la validation',
        early.error?.message?.slice(0, 70)
      )

      const free = await client.from('treasury_entries').insert({
        account_id: srcId,
        entry_date: dayOffset(0),
        direction: 'OUT',
        kind: 'TRANSFER',
        amount: 300000,
      })
      check(
        Boolean(free.error),
        'INSERT direct : une écriture de virement sans virement est refusée',
        free.error?.message?.slice(0, 70)
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LA VALIDATION DÉPLACE LES DEUX SOLDES\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/tresorerie/virements/${transferId}`, { waitUntil: 'load' })

      const validated = await actUntil(
        page,
        'Valider le virement',
        'le compte destination crédité'
      )
      check(validated, 'Le virement est validé, et la fiche le dit')

      const text = await mainText(page)
      check(
        text.includes('Sortie') && text.includes('Entrée'),
        'Les DEUX écritures sont présentées depuis le virement (§32)'
      )

      // Le solde des deux comptes, lu à l'écran du compte.
      await page.goto(`${base}/tresorerie/comptes/${srcId}`, { waitUntil: 'load' })
      const srcText = await mainText(page)
      check(
        srcText.includes('700 000'),
        'Compte source : 1 000 000 − 300 000 = 700 000 KMF',
        srcText.includes('700 000') ? '700 000 KMF' : srcText.slice(0, 80)
      )
      check(
        srcText.includes('Virements'),
        'La fiche du compte présente ses virements (Module 06 §16)'
      )

      await page.goto(`${base}/tresorerie/comptes/${dstId}`, { waitUntil: 'load' })
      const dstText = await mainText(page)
      check(
        dstText.includes('500 000'),
        'Compte destination : 200 000 + 300 000 = 500 000 KMF',
        dstText.includes('500 000') ? '500 000 KMF' : dstText.slice(0, 80)
      )

      await context.close()
    }

    {
      // Une troisième écriture ne se greffe pas sur un virement validé.
      const client = await session('full')
      const extra = await client.from('treasury_entries').insert({
        account_id: dstId,
        entry_date: dayOffset(0),
        direction: 'IN',
        kind: 'TRANSFER',
        amount: 300000,
        internal_transfer_id: transferId,
      })
      check(
        Boolean(extra.error),
        'INSERT direct : aucune écriture surnuméraire ne s’ajoute au virement',
        extra.error?.message?.slice(0, 70)
      )

      const { count } = await admin
        .from('treasury_entries')
        .select('id', { count: 'exact', head: true })
        .eq('internal_transfer_id', transferId)
      check(count === 2, 'Le virement porte exactement deux écritures', `${count}`)
    }

    {
      /*
       * L'écriture s'annule sous LA capacité de son origine — migration 073.
       *
       * Ce profil annule les règlements, et lit les écritures. Il ne doit pas
       * pouvoir défaire celles d'un virement : le virement resterait validé,
       * et le solde du compte remonterait sans cause.
       */
      const client = await session('voisin')

      const seen = await client
        .from('treasury_entries')
        .select('id')
        .eq('internal_transfer_id', transferId)
      check(
        (seen.data ?? []).length === 2,
        'Le voisin LIT bien les deux écritures — le refus qui suit n’est pas un effet de RLS',
        `${(seen.data ?? []).length}`
      )

      const patch = await client
        .from('treasury_entries')
        .update({ status: 'CANCELLED' })
        .eq('internal_transfer_id', transferId)
        .select('id')
      check(
        Boolean(patch.error) || (patch.data ?? []).length === 0,
        'PATCH direct : annuler l’écriture d’un virement exige `transfers.cancel`',
        patch.error?.message?.slice(0, 70) ?? 'aucune ligne modifiée'
      )

      const { count: alive } = await admin
        .from('treasury_entries')
        .select('id', { count: 'exact', head: true })
        .eq('internal_transfer_id', transferId)
        .eq('status', 'VALIDATED')
      check(
        alive === 2,
        'Les deux écritures restent validées : aucun solde n’a bougé sans cause',
        `${alive}`
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — §30 : LES FONDS INSUFFISANTS BLOQUENT LE VIREMENT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/tresorerie/virements/nouveau`, { waitUntil: 'load' })
      await page.waitForFunction(
        () => document.querySelector('select[name="sourceAccountId"]') !== null
      )

      // La caisse porte 700 000 : ce virement en demande 900 000.
      await page.selectOption('select[name="sourceAccountId"]', srcId)
      await page.selectOption('select[name="destinationAccountId"]', dstId)
      await page.fill('input[name="amount"]', '900000')
      await page.fill('input[name="transferDate"]', dayOffset(0))
      await page.fill('input[name="purpose"]', `${MARK} — au-delà du solde`)

      await page.getByRole('button', { name: 'Enregistrer le virement' }).click()
      const tooBigId = await createdId(page, '/tresorerie/virements/')
      fixtures.transfers.push(tooBigId)

      const text = await mainText(page)
      check(
        text.includes('ne porte que') || text.includes('700 000'),
        'L’écran annonce le solde insuffisant AVANT la tentative (§30)'
      )

      // Le bouton est désactivé : l'acte reste néanmoins refusé côté serveur.
      const client = await session('full')
      const rpc = await client.rpc('validate_internal_transfer', {
        p_transfer_id: tooBigId,
      })
      check(
        Boolean(rpc.error) && /insuffisant|ne dispose que/i.test(rpc.error?.message ?? ''),
        'RPC direct : la validation est refusée, fonds insuffisants (§30)',
        rpc.error?.message?.slice(0, 80)
      )

      const { data: after } = await admin
        .from('internal_transfers')
        .select('status')
        .eq('id', tooBigId)
        .maybeSingle()
      check(after?.status === 'DRAFT', 'Un refus n’avance pas l’état', after?.status)

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — L’ANNULATION DÉFAIT LES DEUX ÉCRITURES (§33)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/tresorerie/virements/${transferId}`, { waitUntil: 'load' })

      const cancelled = await actUntil(
        page,
        'Annuler le virement',
        'les soldes sont revenus'
      )
      check(cancelled, 'Le virement est annulé, et la fiche le dit')

      const { count: alive } = await admin
        .from('treasury_entries')
        .select('id', { count: 'exact', head: true })
        .eq('internal_transfer_id', transferId)
        .eq('status', 'VALIDATED')
      check(alive === 0, 'Aucune écriture validée ne survit à l’annulation', `${alive}`)

      const { count: kept } = await admin
        .from('treasury_entries')
        .select('id', { count: 'exact', head: true })
        .eq('internal_transfer_id', transferId)
      check(kept === 2, 'Les deux écritures restent, marquées annulées (§33)', `${kept}`)

      await page.goto(`${base}/tresorerie/comptes/${srcId}`, { waitUntil: 'load' })
      const srcText = await mainText(page)
      check(srcText.includes('1 000 000'), 'Le solde du compte source est revenu')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — PAIEMENT DIVERS : BROUILLON, VALIDATION, ANNULATION\n')

    let miscId = null

    {
      const { context, page } = await signIn(browser, base, accounts.saisie)

      await page.goto(`${base}/facturation/paiements-divers/nouveau`, { waitUntil: 'load' })
      await page.waitForFunction(
        () => document.querySelector('select[name="accountId"]') !== null
      )

      await page.selectOption('select[name="accountId"]', srcId)
      await page.selectOption('select[name="category"]', 'ADMIN_FEE')
      await page.fill('input[name="amount"]', '45000')
      await page.fill('input[name="paidOn"]', dayOffset(0))
      await page.fill('input[name="beneficiary"]', `${MARK} — Trésor public`)
      await page.fill('textarea[name="purpose"]', 'Taxe annuelle de recette')

      await page.getByRole('button', { name: 'Enregistrer le paiement' }).click()
      miscId = await createdId(page, '/facturation/paiements-divers/')
      fixtures.miscPayments.push(miscId)

      const text = await mainText(page)
      check(text.includes('Brouillon'), 'Le paiement divers naît en brouillon (§46)')
      check(
        !text.includes('Valider le paiement'),
        'Un compte de saisie ne se voit pas proposer la validation'
      )

      const { count } = await admin
        .from('treasury_entries')
        .select('id', { count: 'exact', head: true })
        .eq('misc_payment_id', miscId)
      check(count === 0, 'Un brouillon ne produit aucune écriture', `${count}`)

      await context.close()
    }

    {
      const client = await session('saisie')

      // Aucune modification : `billing.misc_payments.update` n'existe pas.
      const patch = await client
        .from('misc_payments')
        .update({ amount: 5 })
        .eq('id', miscId)
        .select('id')
      check(
        Boolean(patch.error) || (patch.data ?? []).length === 0,
        'PATCH direct : le montant d’un paiement divers ne se modifie pas',
        patch.error?.message?.slice(0, 70) ?? 'aucune ligne modifiée'
      )

      const forced = await client
        .from('misc_payments')
        .update({ status: 'VALIDATED', validated_at: new Date().toISOString() })
        .eq('id', miscId)
        .select('id')
      check(
        Boolean(forced.error) || (forced.data ?? []).length === 0,
        'PATCH direct : le statut ne se force pas sans `misc_payments.validate`',
        forced.error?.message?.slice(0, 70) ?? 'aucune ligne modifiée'
      )
    }

    {
      const client = await session('valideurAveugle')

      // Détient `.validate`, pas `treasury.entries.view` : la garde différée
      // refuse un paiement validé sans son écriture.
      const patch = await client
        .from('misc_payments')
        .update({ status: 'VALIDATED', validated_at: new Date().toISOString() })
        .eq('id', miscId)
        .select('id')
      check(
        Boolean(patch.error),
        'PATCH direct : « validé » sans écriture est refusé par la garde différée',
        patch.error?.message?.slice(0, 80)
      )

      const { data: after } = await admin
        .from('misc_payments')
        .select('status')
        .eq('id', miscId)
        .maybeSingle()
      check(after?.status === 'DRAFT', 'Le paiement est resté en brouillon', after?.status)
    }

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/paiements-divers/${miscId}`, { waitUntil: 'load' })
      const validated = await actUntil(
        page,
        'Valider le paiement',
        'débité du montant payé'
      )
      check(validated, 'Le paiement divers est validé, et la fiche le dit')

      const text = await mainText(page)
      check(text.includes('Sortie'), 'L’écriture de sortie est présentée (§45)')

      await page.goto(`${base}/tresorerie/comptes/${srcId}`, { waitUntil: 'load' })
      const srcText = await mainText(page)
      check(
        srcText.includes('955 000'),
        'Compte source : 1 000 000 − 45 000 = 955 000 KMF',
        srcText.includes('955 000') ? '955 000 KMF' : srcText.slice(0, 80)
      )

      await page.goto(`${base}/facturation/paiements-divers/${miscId}`, { waitUntil: 'load' })
      const cancelled = await actUntil(
        page,
        'Annuler le paiement',
        'le solde du compte est revenu'
      )
      check(cancelled, 'Le paiement divers est annulé, et la fiche le dit')

      const { count: alive } = await admin
        .from('treasury_entries')
        .select('id', { count: 'exact', head: true })
        .eq('misc_payment_id', miscId)
        .eq('status', 'VALIDATED')
      check(alive === 0, 'L’écriture ne survit pas à l’annulation (§47)', `${alive}`)

      await page.goto(`${base}/tresorerie/comptes/${srcId}`, { waitUntil: 'load' })
      const back = await mainText(page)
      check(back.includes('1 000 000'), 'Le solde du compte est revenu')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — UN COMPTE ARCHIVÉ NE REÇOIT PLUS RIEN (Module 06 §10)\n')

    {
      const client = await session('full')

      await client.rpc('set_financial_account_status', {
        p_account_id: dstId,
        p_status: 'ARCHIVED',
        p_reason: `${MARK} — archivage`,
      })

      const rpc = await client.rpc('create_internal_transfer', {
        p_source_account_id: srcId,
        p_destination_account_id: dstId,
        p_amount: 1000,
        p_transfer_date: dayOffset(0),
      })
      check(
        Boolean(rpc.error) && /pas actif/i.test(rpc.error?.message ?? ''),
        'Un virement VERS un compte archivé est refusé',
        rpc.error?.message?.slice(0, 70)
      )

      const same = await client.rpc('create_internal_transfer', {
        p_source_account_id: srcId,
        p_destination_account_id: srcId,
        p_amount: 1000,
        p_transfer_date: dayOffset(0),
      })
      check(
        Boolean(same.error) && /distinct/i.test(same.error?.message ?? ''),
        'Un virement d’un compte vers lui-même est refusé (§29)',
        same.error?.message?.slice(0, 70)
      )

      const misc = await client.rpc('create_misc_payment', {
        p_account_id: dstId,
        p_amount: 1000,
        p_paid_on: dayOffset(0),
        p_direction: 'OUT',
        p_category: 'OTHER',
        p_beneficiary: 'X',
        p_purpose: 'Y',
      })
      check(
        Boolean(misc.error) && /pas actif/i.test(misc.error?.message ?? ''),
        'Un paiement divers depuis un compte archivé est refusé',
        misc.error?.message?.slice(0, 70)
      )

      await client.rpc('set_financial_account_status', {
        p_account_id: dstId,
        p_status: 'ACTIVE',
        p_reason: `${MARK} — réactivation`,
      })
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — AUCUN EFFET DE BORD, DONNÉES DEMO INTACTES\n')

    {
      const demoApres = await demoFootprint(admin)
      check(
        demoApres.clients === demoAvant.clients,
        'Les clients DEMO sont intacts',
        `${demoApres.clients} / ${demoAvant.clients} au départ`
      )
      check(
        demoApres.vehicles === demoAvant.vehicles,
        'Les véhicules DEMO sont intacts',
        `${demoApres.vehicles} / ${demoAvant.vehicles} au départ`
      )

      const { count: total } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
      check(total === 178, 'Catalogue conforme', `${total} permissions`)

      // Le journal a bien enregistré les opérations sensibles (Module 06 §49).
      const { count: journal } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .in('entity_type', ['internal_transfers', 'misc_payments'])
      check(
        (journal ?? 0) > 0,
        'Virements et paiements divers sont journalisés (§49)',
        `${journal} entrées`
      )
    }
  } finally {
    await browser.close()

    /*
     * NETTOYAGE — par identifiant suivi, PUIS par marqueur.
     *
     * Un objet créé dont la réponse s'est perdue n'a pas d'id suivi : aucune
     * suppression ne le viserait, et il retiendrait par `on delete restrict`
     * les comptes financiers qui, eux, sont suivis. Le balayage par marqueur
     * ferme cette porte, et le comptage final l'annonce.
     */
    for (const id of fixtures.transfers) {
      await admin.from('treasury_entries').delete().eq('internal_transfer_id', id)
      await admin.from('internal_transfers').delete().eq('id', id)
    }

    for (const id of fixtures.miscPayments) {
      await admin.from('treasury_entries').delete().eq('misc_payment_id', id)
      await admin.from('misc_payments').delete().eq('id', id)
    }

    // Balayage par marqueur : ce que les ids suivis n'ont pas pu viser.
    const { data: strayAccounts } = await admin
      .from('financial_accounts')
      .select('id')
      .like('label', `%${MARK}%`)

    for (const account of strayAccounts ?? []) {
      const { data: strayTransfers } = await admin
        .from('internal_transfers')
        .select('id')
        .or(`source_account_id.eq.${account.id},destination_account_id.eq.${account.id}`)
      for (const transfer of strayTransfers ?? []) {
        await admin.from('treasury_entries').delete().eq('internal_transfer_id', transfer.id)
        await admin.from('internal_transfers').delete().eq('id', transfer.id)
      }

      const { data: strayMisc } = await admin
        .from('misc_payments')
        .select('id')
        .eq('account_id', account.id)
      for (const payment of strayMisc ?? []) {
        await admin.from('treasury_entries').delete().eq('misc_payment_id', payment.id)
        await admin.from('misc_payments').delete().eq('id', payment.id)
      }

      await admin.from('treasury_entries').delete().eq('account_id', account.id)
      await admin.from('financial_accounts').delete().eq('id', account.id)
    }

    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    // Le nettoyage COMPTE ce qui subsiste : un « tous réussis » ne prouve pas
    // l'absence de résidus.
    const [{ count: leftAccounts }, { count: leftUsers }] = await Promise.all([
      admin
        .from('financial_accounts')
        .select('id', { count: 'exact', head: true })
        .like('label', '%RECETTE VIR%'),
      admin
        .from('app_users')
        .select('id', { count: 'exact', head: true })
        .like('username', 'recette.vir.%'),
    ])

    if ((leftAccounts ?? 0) > 0 || (leftUsers ?? 0) > 0) {
      console.log(
        `\n${RED}RÉSIDUS : ${leftAccounts} compte(s) financier(s), ${leftUsers} compte(s) utilisateur.${RESET}`
      )
      failed += 1
    } else {
      console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(
      `${GREEN}RECETTE VIREMENTS ET PAIEMENTS DIVERS : ${passed} contrôles, tous réussis${RESET}\n`
    )
  } else {
    console.log(
      `${RED}RECETTE VIREMENTS ET PAIEMENTS DIVERS : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
