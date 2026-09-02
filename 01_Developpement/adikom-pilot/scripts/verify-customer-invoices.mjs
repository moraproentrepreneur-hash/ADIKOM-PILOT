#!/usr/bin/env node
/**
 * Recette Facture client et clôture — Étape 2.5, LOT 7.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * `db:verify:customer-invoices` contrôle le schéma et les règles ;
 * `verify:capabilities` contrôle les capacités par appel direct. Celle-ci
 * contrôle ce que L'UTILISATEUR VOIT :
 *
 *   1. Le cycle complet par l'écran : une location « À facturer » devient
 *      « Facturée » par l'émission de sa facture, puis « Clôturée ».
 *   2. Workflow 07 §9 et §12 — l'écran PROPOSE le tarif verrouillé et ne
 *      propose AUCUNE durée : la règle d'arrondi n'est pas définie (DEC-008).
 *   3. §24 — une réduction est visible comme telle, jamais fondue dans un prix.
 *   4. §8 et §72 — une facture émise ne se modifie plus : le formulaire de
 *      ligne DISPARAÎT.
 *   5. Workflow 01 §42 — la clôture n'exige aucun paiement, et l'écran le dit.
 *   6. DEC-024 — facturer n'est pas clôturer : le porteur des seules capacités
 *      de facturation ne voit pas le bouton de clôture.
 *   7. DEC-017 — sans `billing.customer_invoices.view`, la fiche de location ne
 *      montre PAS « aucune facture » : la carte disparaît.
 *   8. L'annulation d'une facture rend la location à « À facturer », à l'écran.
 *
 * Utilisation :
 *   node scripts/verify-customer-invoices.mjs [url]
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { dayOffset, loadEnvFile, required } from './lib/env.mjs'

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

const BASE_READERS = ['parties.clients.view', 'rental.fleet.view', 'rental.rentals.view']

const PROFILES = {
  /*
   * Le compte complet : il facture ET il clôture.
   *
   * `customer_payments.view` s'y ajoute depuis le LOT 8 : une facture encaissée
   * ne s'annule pas, et le contrôle lit la somme encaissée sous les droits de
   * l'appelant. Sans ce droit, elle vaudrait 0 et l'annulation passerait sur
   * une facture pourtant réglée — l'acte est donc refusé (DEC-031 §e).
   */
  full: [
    ...BASE_READERS,
    'rental.rentals.financial.view',
    'rental.rentals.close',
    'billing.customer_invoices.view',
    'billing.customer_invoices.create',
    'billing.customer_invoices.update',
    'billing.customer_invoices.issue',
    'billing.customer_invoices.cancel',
    'billing.customer_payments.view',
  ],
  // Facture, mais ne clôture pas : l'exploitation reste un autre métier.
  billingOnly: [
    ...BASE_READERS,
    'billing.customer_invoices.view',
    'billing.customer_invoices.create',
    'billing.customer_invoices.issue',
  ],
  // Voit la location, PAS ses factures.
  noInvoice: [...BASE_READERS, 'rental.rentals.financial.view'],
}

async function createProfile(admin, key, codes) {
  const username = `recette.fac.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-fac-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${key} : ${error?.message}`)

  const id = created.user.id
  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Facture ${key}`,
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
 * Valeur d'une ligne de fiche, en entier.
 *
 * Le libellé est ancré AU DÉBUT du `dt`, jamais cherché en sous-chaîne :
 * « Total » et « Sous-total » se ressemblent trop, et la recette lirait le
 * mauvais montant sans jamais s'en apercevoir.
 *
 * L'ancrage ne peut pas aller jusqu'à la fin : le `dt` contient aussi l'aide de
 * la ligne, dans un `span` imbriqué.
 */
async function rowAmount(page, label) {
  const text = await page
    .locator('dt', { hasText: new RegExp(`^\\s*${label}`) })
    .first()
    .locator('xpath=following-sibling::dd[1]')
    .innerText()
  return /\d/.test(text) ? Number(text.replace(/[^\d-]/g, '')) : null
}

/**
 * Déclenche un acte et attend le message que l'écran promet.
 *
 * `networkidle` ne prouve rien : une action serveur rend son résultat par un
 * nouvel arbre React, sans navigation.
 */
async function act(page, buttonName, expected, timeout = 60000) {
  const button = page.getByRole('button', { name: buttonName }).first()
  await button.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(800)
  await button.click()
  await page.getByText(expected, { exact: false }).first().waitFor({ timeout })
}

/**
 * Ajoute une ligne, et attend que LA SOMME change.
 *
 * « La ligne a été ajoutée » reste affiché d'un ajout au suivant : l'attendre
 * reviendrait à ne pas attendre, et la ligne suivante serait saisie dans un
 * formulaire que le rendu en cours va réinitialiser. Le seul repère fiable est
 * l'EFFET — le sous-total ou le total des réductions, relu jusqu'à la valeur
 * attendue.
 */
async function submitLine(page, rowLabel, expected, fields = null) {
  if (fields) {
    await page.waitForFunction(() => document.querySelector('#quantity') !== null)
    if (fields.kind) await page.selectOption('#kind', fields.kind)
    await page.fill('#label', fields.label)
    await page.fill('#quantity', fields.quantity)
    await page.fill('#unitPrice', fields.unitPrice)
    if (fields.justification) await page.fill('#justification', fields.justification)
  }

  const button = page.getByRole('button', { name: 'Ajouter la ligne' }).first()
  await button.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(500)
  await button.click()

  const started = Date.now()
  for (;;) {
    const value = await rowAmount(page, rowLabel).catch(() => null)
    if (value === expected) return true
    if (Date.now() - started > 60000) return false
    await page.waitForTimeout(1500)
    if (Date.now() - started > 20000) await page.reload({ waitUntil: 'load' })
  }
}

/**
 * Déclenche un acte qui FAIT DISPARAÎTRE SON PROPRE FORMULAIRE.
 *
 * L'émission retire le formulaire d'émission : le message de succès s'en va avec
 * lui. Le repère devient alors l'état que l'écran affiche ensuite, relu jusqu'à
 * ce qu'il change.
 */
async function actUntil(page, buttonName, needle, timeout = 60000) {
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

/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'
  const url = required('NEXT_PUBLIC_SUPABASE_URL')

  const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nCible : ${base}\n`)

  const accounts = {}
  const fixtures = { vehicleIds: [], reservations: [], rentals: [], invoices: [] }
  const browser = await chromium.launch()

  /** Une location menée jusqu'à « À facturer », par les fonctions du cycle. */
  async function makeInvoiceableRental(vehicleId, offsetDays) {
    const { data: no } = await admin.rpc('next_number', { p_entity_key: 'reservation' })
    const from = new Date(Date.now() + offsetDays * 864e5)
    const to = new Date(Date.now() + (offsetDays + 3) * 864e5)

    const { data: reservation, error } = await admin
      .from('reservations')
      .insert({
        reservation_no: no,
        client_id: fixtures.clientId,
        vehicle_id: vehicleId,
        period: `[${from.toISOString()},${to.toISOString()})`,
        status: 'PENDING',
      })
      .select('id')
      .single()
    if (error) throw new Error(`réservation : ${error.message}`)
    fixtures.reservations.push(reservation.id)

    await admin.rpc('confirm_reservation', {
      p_reservation_id: reservation.id,
      p_vehicle_id: vehicleId,
    })

    const { data: rentalId, error: convertError } = await admin.rpc(
      'convert_reservation_to_rental',
      { p_reservation_id: reservation.id }
    )
    if (convertError) throw new Error(`location : ${convertError.message}`)
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
      p_mileage: 10450,
      p_fuel_level: 'HALF',
    })
    await admin
      .from('rentals')
      .update({ status: 'TO_INVOICE', status_changed_at: new Date().toISOString() })
      .eq('id', rentalId)

    return rentalId
  }

  try {
    /* --- Sujets ---------------------------------------------------------- */
    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RFAC-${STAMP}`, label: `${MARK} — Catégorie` })
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
        phone: '+269 400',
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    fixtures.clientId = client.id

    // Tarif de catégorie : 150 000 KMF / jour. C'est LUI que la location
    // verrouillera, et que l'écran de facturation reprendra.
    const { data: rule } = await admin
      .from('pricing_rules')
      .insert({ category_id: category.id, amount: 150000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    for (const suffix of ['A', 'B']) {
      const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
      const { data: vehicle } = await admin
        .from('vehicles')
        .insert({
          vehicle_no: vehicleNo,
          category_id: category.id,
          brand: 'RECETTE',
          model: `FAC ${STAMP} ${suffix}`,
          plate: `RF-${STAMP}${suffix}`,
          origin: 'OWNED',
          status: 'AVAILABLE',
        })
        .select('id')
        .single()
      fixtures.vehicleIds.push(vehicle.id)
    }

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, key, codes)
    }

    const rentalId = await makeInvoiceableRental(fixtures.vehicleIds[0], 400)
    const secondRental = await makeInvoiceableRental(fixtures.vehicleIds[1], 500)

    console.log(
      `${DIM}Deux locations « À facturer », tarif verrouillé 150 000 KMF/jour.${RESET}`
    )

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — LA FICHE DE LOCATION APPELLE SA FACTURE\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(text.includes('À facturer'), 'La location se lit « À facturer »')
      check(
        /Facturer la location/i.test(text),
        'L’écran propose de la facturer'
      )
      check(
        /Aucune facture/i.test(text),
        'La carte Facturation dit qu’aucune facture n’existe encore'
      )
      check(
        /préparez la facture client/i.test(text),
        'L’étape suivante annoncée est bien la facturation'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — DEC-017 : SANS LE DROIT, LA CARTE DISPARAÎT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.noInvoice)

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        !/Aucune facture/i.test(text),
        'Sans `customer_invoices.view`, l’écran n’affirme PAS qu’aucune facture n’existe'
      )
      check(
        !/Facturer la location/i.test(text),
        'Et il ne propose pas de facturer'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — PRÉPARER : LE TARIF EST REPRIS, LA DURÉE NE L’EST PAS\n')

    let invoiceId = null

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/clients/nouvelle?location=${rentalId}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.querySelector('#invoiceDate') !== null)

      const text = await mainText(page)
      check(
        /150 000 KMF \/ jour|150 000 KMF\s*\/\s*jour/.test(text.replace(/ | /g, ' ')),
        'Le tarif verrouillé du contrat est annoncé (§7, §8)'
      )
      check(
        /quantité.{0,40}reste à saisir|règle d’arrondi de durée n’est pas définie/i.test(text),
        'Et l’écran DIT que la durée n’est pas proposée (DEC-008)'
      )

      await page.fill('#dueDate', dayOffset(60))
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: 'Préparer la facture' }).click()
      await page.waitForURL(/\/facturation\/clients\/[0-9a-f-]{36}/, { timeout: 45000 })

      invoiceId = page.url().split('/facturation/clients/')[1]?.split('?')[0] ?? null
      if (invoiceId) fixtures.invoices.push(invoiceId)

      check(Boolean(invoiceId), 'La facture est préparée et sa fiche s’ouvre')

      const detail = await mainText(page)
      check(/FAC-C-\d{4}-\d{6}/.test(detail), 'Le numéro FAC-C-AAAA-000000 est attribué')
      check(detail.includes('Brouillon'), 'Elle naît en brouillon (§25)')

      await context.close()
    }

    if (!invoiceId) throw new Error('La facture n’a pas pu être préparée : recette interrompue.')

    /* --- Préparer ne facture rien : la location n'a pas bougé. */
    {
      const { data: untouched } = await admin
        .from('rentals')
        .select('status')
        .eq('id', rentalId)
        .maybeSingle()
      check(
        untouched?.status === 'TO_INVOICE',
        'Préparer une facture ne change pas l’état de la location',
        `${untouched?.status}`
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — LES LIGNES FONT LE TOTAL, LA RÉDUCTION SE VOIT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/clients/${invoiceId}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#quantity') !== null)

      // La ligne de location : le prix unitaire est PRÉ-REMPLI au tarif
      // verrouillé, la quantité est VIDE.
      const prefilled = await page.inputValue('#unitPrice')
      const emptyQty = await page.inputValue('#quantity')
      check(prefilled === '150000', 'Le prix unitaire est pré-rempli au tarif verrouillé', prefilled)
      check(emptyQty === '', 'La quantité, elle, reste vide : rien n’est supposé', `« ${emptyQty} »`)

      // La ligne de location : seule la quantité reste à saisir.
      await page.fill('#quantity', '3')
      const rentalLine = await submitLine(page, 'Sous-total', 450000)
      check(rentalLine, 'Ligne de location : 3 × 150 000 = 450 000')

      // Un service supplémentaire (§14).
      const serviceLine = await submitLine(
        page,
        'Sous-total',
        500000,
        { kind: 'SERVICE', label: 'Siège enfant', quantity: '1', unitPrice: '50000' }
      )
      check(serviceLine, 'Service supplémentaire : sous-total à 500 000 (§14)')

      // Un frais validé, justifié (§15).
      const feeLine = await submitLine(page, 'Sous-total', 520000, {
        kind: 'FEE',
        label: 'Carburant manquant',
        quantity: '1',
        unitPrice: '20000',
        justification: 'Retour à 1/2 contre plein au départ.',
      })
      check(feeLine, 'Frais justifié : sous-total à 520 000 (§15)')

      // Une réduction (§24) : la nature est choisie d'abord, pour lire l'avis
      // que l'écran donne AVANT l'envoi.
      await page.waitForFunction(() => document.querySelector('#kind') !== null)
      await page.selectOption('#kind', 'DISCOUNT')

      const hint = await mainText(page)
      check(
        /se soustraira du total/i.test(hint),
        'L’écran annonce qu’une réduction se soustrait, sans montant négatif'
      )

      const discountLine = await submitLine(page, 'Réductions', 70000, {
        label: 'Geste commercial',
        quantity: '1',
        unitPrice: '70000',
      })
      check(discountLine, 'Réductions : 70 000 KMF (§24)')

      const total = await rowAmount(page, 'Total')
      check(total === 450000, 'Total : 520 000 − 70 000 = 450 000', String(total))

      const text = await mainText(page)
      /*
       * Une facture préparée n'a rien encaissé — et depuis le LOT 8, la somme
       * est LUE, non supposée. Le solde vaut donc le total : c'est le contrôle
       * qui remplace « les encaissements ne sont pas gérés ».
       */
      check((await rowAmount(page, 'Encaissé')) === 0, 'Encaissé : 0 KMF, une somme lue')
      check(
        (await rowAmount(page, 'Solde')) === 450000,
        'Solde : 450 000 KMF — rien n’a été encaissé sur cette facture'
      )
      check(
        /Réduction/.test(text) && /Geste commercial/.test(text),
        'La réduction est identifiable comme telle (§24)'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — ÉMETTRE : LA LOCATION DEVIENT « FACTURÉE », LES LIGNES SE FIGENT\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/clients/${invoiceId}`, { waitUntil: 'load' })

      /*
       * LE REPÈRE EST L'EFFET, PAS LE MOT.
       *
       * « Émise » figure déjà dans l'historique — « Émise le » — avant toute
       * émission : l'attendre reviendrait à ne pas attendre. On attend donc la
       * phrase que SEUL l'état émis produit.
       */
      const issued = await actUntil(page, 'Émettre la facture', 'Créance reconnue')
      check(issued, 'La facture est émise (§26)')

      await page.reload({ waitUntil: 'load' })
      const text = await mainText(page)

      check(
        !/Ajouter une ligne/i.test(text),
        'Le formulaire de ligne DISPARAÎT : la facture est figée (§8, §72)'
      )
      check(
        !/Retirer/.test(text),
        'Et aucune ligne ne se retire plus'
      )
      const totalAfter = await rowAmount(page, 'Total')
      check(totalAfter === 450000, 'Le total n’a pas bougé après émission', String(totalAfter))

      // La location a suivi.
      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })
      const rentalText = await mainText(page)
      check(rentalText.includes('Facturée'), 'La location se lit « Facturée »')
      check(/FAC-C-\d{4}-\d{6}/.test(rentalText), 'Sa fiche nomme la facture émise (§49)')
      check(
        /Clôturer/i.test(rentalText),
        'Et propose désormais la clôture'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — DEC-024 : FACTURER N’EST PAS CLÔTURER\n')

    {
      const { context, page } = await signIn(browser, base, accounts.billingOnly)

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(text.includes('Facturée'), 'Le porteur des capacités de facturation voit l’état')
      check(
        !/Clôturer la location/i.test(text),
        'Mais aucun bouton de clôture ne lui est proposé'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — LA FICHE CLIENT PORTE SES FACTURES (§50, §51)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/tiers/clients/${fixtures.clientId}?onglet=factures`, {
        waitUntil: 'load',
      })
      const text = await mainText(page)
      const billed = await rowAmount(page, 'Total facturé')

      check(/FAC-C-\d{4}-\d{6}/.test(text), 'L’onglet Factures liste la facture du client')
      check(
        billed === 450000,
        'Le total facturé est calculé des factures émises',
        String(billed)
      )
      check(
        (await rowAmount(page, 'Total encaissé')) === 0,
        'Le total encaissé du client est lu, et vaut 0 : rien n’a été versé'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — CLÔTURER SANS PAYER (Workflow 01 §42)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/location/locations/${rentalId}`, { waitUntil: 'load' })

      const text = await mainText(page)
      check(
        /n’encaisse rien|ne préjuge pas du règlement/i.test(text),
        'L’écran annonce une clôture OPÉRATIONNELLE, sans paiement'
      )

      const closed = await actUntil(page, 'Clôturer la location', 'Clôturée')
      check(closed, 'La location est clôturée, facture impayée comprise (§42)')

      await page.reload({ waitUntil: 'load' })
      const after = await mainText(page)
      check(
        !/Clôturer la location/i.test(after),
        'La clôture ne se rejoue pas : l’acte disparaît'
      )

      // La facture, elle, n'a pas bougé.
      const { data: invoice } = await admin
        .from('customer_invoices')
        .select('status')
        .eq('id', invoiceId)
        .maybeSingle()
      check(
        invoice?.status === 'ISSUED',
        'La facture reste « Émise » : les deux informations restent séparées',
        `${invoice?.status}`
      )

      // Et son annulation est refusée, à l'écran.
      await page.goto(`${base}/facturation/clients/${invoiceId}`, { waitUntil: 'load' })
      await act(
        page,
        'Annuler la facture',
        'La location de cette facture est clôturée'
      )
      check(true, 'Annuler la facture d’une location clôturée est refusé, avec son motif')

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — ANNULER : LA LOCATION REVIENT À « À FACTURER »\n')

    {
      const { context, page } = await signIn(browser, base, accounts.full)

      await page.goto(`${base}/facturation/clients/nouvelle?location=${secondRental}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.querySelector('#invoiceDate') !== null)
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: 'Préparer la facture' }).click()
      await page.waitForURL(/\/facturation\/clients\/[0-9a-f-]{36}/, { timeout: 45000 })

      const secondInvoice = page.url().split('/facturation/clients/')[1]?.split('?')[0] ?? null
      if (secondInvoice) fixtures.invoices.push(secondInvoice)

      await page.waitForFunction(() => document.querySelector('#quantity') !== null)
      await page.fill('#quantity', '2')
      check(
        await submitLine(page, 'Sous-total', 300000),
        'Ligne de location de la seconde facture : 2 × 150 000'
      )

      /*
       * LE REPÈRE EST L'EFFET, PAS LE MOT.
       *
       * « Émise » figure déjà dans l'historique — « Émise le » — avant toute
       * émission : l'attendre reviendrait à ne pas attendre. On attend donc la
       * phrase que SEUL l'état émis produit.
       */
      const issued = await actUntil(page, 'Émettre la facture', 'Créance reconnue')
      check(issued, 'La seconde facture est émise')

      // Même piège : « Annulée le » est un libellé d'historique, présent avant
      // toute annulation. Le repère est l'effet — la location rendue.
      const cancelled = await actUntil(page, 'Annuler la facture', 'redevenue')
      check(cancelled, 'Elle s’annule : rien n’est effacé (§46)')

      await page.goto(`${base}/location/locations/${secondRental}`, { waitUntil: 'load' })
      const text = await mainText(page)
      check(
        text.includes('À facturer'),
        'La location est revenue à « À facturer » — aucune impasse (DEC-027 §e)'
      )
      check(
        /Facturer la location/i.test(text),
        'Et peut recevoir une nouvelle facture'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — AUCUN EFFET DE BORD · CATALOGUE · DEMO\n')

    {
      // Facturer ne touche ni le parc, ni le tarif verrouillé du contrat.
      const { data: vehicle } = await admin
        .from('vehicles')
        .select('status')
        .eq('id', fixtures.vehicleIds[0])
        .maybeSingle()
      check(vehicle?.status === 'AVAILABLE', 'Le véhicule est resté au parc', `${vehicle?.status}`)

      const { data: rental } = await admin
        .from('rentals')
        .select('locked_amount, status')
        .eq('id', rentalId)
        .maybeSingle()
      check(rental?.locked_amount === 150000, 'Le tarif verrouillé n’a pas bougé')
      check(rental?.status === 'CLOSED', 'La location est bien clôturée', `${rental?.status}`)

      /*
       * FACTURER N'ENCAISSE RIEN.
       *
       * Le LOT 8 a livré les règlements clients : d'autres factures en portent
       * désormais. Ce que ce contrôle doit prouver reste le même — facturer et
       * clôturer ne font entrer aucun argent — et il se mesure donc sur LES
       * FACTURES DE CETTE RECETTE, jamais sur toute la base.
       */
      const { count: collected } = await admin
        .from('customer_payments')
        .select('id', { count: 'exact', head: true })
        .in('customer_invoice_id', fixtures.invoices)
      check(
        collected === 0,
        'Aucun encaissement n’a été produit par la facturation',
        `${collected}`
      )

      const [{ count: clients }, { count: vehicles }] = await Promise.all([
        admin
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .like('legal_name', '%DEMO%'),
        admin.from('vehicles').select('id', { count: 'exact', head: true }).like('model', '%DEMO%'),
      ])
      check(clients === 3, 'Les trois clients DEMO sont intacts', `${clients}`)
      check(vehicles === 3, 'Les trois véhicules DEMO sont intacts', `${vehicles}`)

      const { count: total } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
      check(total === 153, 'Catalogue conforme', `${total} permissions`)
    }
  } finally {
    await browser.close()

    /*
     * Une facture retient sa location (`on delete restrict`) : elle part avant
     * elle, avec ses lignes.
     */
    for (const id of fixtures.invoices) {
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
    for (const vehicleId of fixtures.vehicleIds) {
      await admin.from('vehicle_occupations').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicle_supplier_history').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }
    if (fixtures.clientId) await admin.from('clients').delete().eq('id', fixtures.clientId)
    if (fixtures.categoryId) {
      await admin.from('vehicle_categories').delete().eq('id', fixtures.categoryId)
    }
    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE FACTURE CLIENT : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE FACTURE CLIENT : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
