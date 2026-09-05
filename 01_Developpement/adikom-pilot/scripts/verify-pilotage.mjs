#!/usr/bin/env node
/**
 * Recette Tableau de bord — Phase 3, LOT 9.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS
 *
 * `db:verify:dashboard` contrôle l'arithmétique des sommes ;
 * `verify:capabilities` contrôle les refus par appel direct. Celle-ci contrôle
 * ce que L'UTILISATEUR VOIT — les douze critères d'acceptation du Module 01
 * §33, éprouvés dans un navigateur :
 *
 *   1. §33.1 — l'utilisateur autorisé accède à son tableau de bord.
 *   2. §33.3 — les indicateurs viennent des DONNÉES RÉELLES : un sujet créé
 *      pour la recette apparaît dans les chiffres.
 *   3. §33.4, §9 — les files de location sont visibles.
 *   4. §33.5, §12 — l'état du parc est consultable, statut par statut.
 *   5. §33.6, §19 — les alertes remontent : retour en retard, facture échue,
 *      document proche de l'expiration.
 *   6. §33.7, §27 — les montants sont PROTÉGÉS : sans
 *      `dashboard.financial.view`, l'écran DIT la permission manquante ; il
 *      n'affiche jamais « 0 » à sa place (DEC-017).
 *   7. §33.8, §22 — les actions rapides suivent les permissions.
 *   8. §33.9, §23 — un indicateur mène à la liste correspondante.
 *   9. §8 — le filtre de période change réellement les chiffres.
 *  10. §33.12 — aucune donnée fictive : une section fermée le dit.
 *
 * Utilisation :
 *   node scripts/verify-pilotage.mjs [url]
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
const MARK = `RECETTE TDB ${STAMP}`

/** Les lectures sans lesquelles RLS masquerait les sujets de la recette. */
const READERS = [
  'parties.clients.view',
  'parties.suppliers.view',
  'rental.rentals.view',
  'rental.reservations.view',
  'rental.fleet.view',
  'rental.maintenance.view',
  'rental.documents.view',
]

const PROFILES = {
  /*
   * Le pilote complet : il voit tout ce que le tableau de bord résume, et peut
   * amorcer les gestes qu'il propose.
   */
  pilote: [
    ...READERS,
    'dashboard.view',
    'dashboard.fleet.view',
    'dashboard.financial.view',
    'billing.customer_invoices.view',
    'billing.customer_payments.view',
    'billing.supplier_invoices.view',
    'billing.supplier_payments.view',
    'billing.imputations.view',
    'treasury.accounts.view',
    'treasury.balances.view',
    'treasury.entries.view',
    'rental.reservations.create',
    'parties.clients.create',
    // LOT 10 : le tableau de bord compte les notifications non lues (Module 02
    // §33). Il ne les présente pas — le Centre reste l'endroit principal.
    'notifications.view',
  ],
  /*
   * Le même, PRIVÉ de `dashboard.financial.view`.
   *
   * Il détient pourtant toutes les lectures financières : c'est exactement le
   * cas qui distingue « masquer » de « protéger ». L'écran doit nommer la
   * capacité manquante, et n'afficher aucun montant.
   */
  exploitant: [
    ...READERS,
    'dashboard.view',
    'dashboard.fleet.view',
    'billing.customer_invoices.view',
    'billing.customer_payments.view',
    'billing.supplier_invoices.view',
    'billing.supplier_payments.view',
    'billing.imputations.view',
    'treasury.accounts.view',
    'treasury.balances.view',
    'treasury.entries.view',
  ],
  // `dashboard.view` et rien d'autre : la page s'ouvre, et elle est FERMÉE.
  nu: ['dashboard.view'],
}

async function createProfile(admin, key, codes) {
  const username = `recette.tdb.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-tdb-${STAMP}`

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
    last_name: `Pilotage ${key}`,
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
  await page.waitForURL('**/tableau-de-bord', { timeout: 60000 })

  return { context, page }
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/**
 * La valeur d'une carte KPI, en entier.
 *
 * Elle est lue sur `data-kpi-value`, la valeur BRUTE, jamais sur le texte
 * formaté : un espace insécable ou un suffixe « KMF » ne doit pas décider du
 * résultat d'un contrôle. Rend `null` lorsque la carte n'affiche aucun
 * chiffre — refus de droit ou erreur de chargement.
 */
async function kpiValue(page, label) {
  const value = page.locator(`[data-kpi="${label}"] [data-kpi-value]`).first()
  if ((await value.count()) === 0) return null
  const raw = await value.getAttribute('data-kpi-value')
  return raw === null ? null : Number(raw)
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
  const fixtures = {
    vehicleIds: [],
    reservations: [],
    rentals: [],
    customerInvoices: [],
    financial: [],
    documents: [],
  }
  const browser = await chromium.launch()

  try {
    /* --- Sujets de recette ------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `RTDB-${STAMP}`, label: `${MARK} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    const { data: rule } = await admin
      .from('pricing_rules')
      .insert({ category_id: category.id, amount: 150000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    const { data: clientNo } = await admin.rpc('next_number', { p_entity_key: 'client' })
    const { data: client } = await admin
      .from('clients')
      .insert({
        client_no: clientNo,
        type: 'COMPANY',
        legal_name: `${MARK} — Client`,
        phone: '+269 700',
        status: 'ACTIVE',
      })
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
        model: `TDB ${STAMP}`,
        plate: `RT-${STAMP}`,
        origin: 'OWNED',
        status: 'AVAILABLE',
      })
      .select('id')
      .single()
    fixtures.vehicleIds.push(vehicle.id)

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, key, codes)
    }

    /*
     * UNE LOCATION EN RETARD.
     *
     * Le départ est daté d'hier et le retour attendu ce matin : le retard est
     * DÉRIVÉ de l'heure courante (DEC-025 §a), jamais écrit. Aucune date en
     * dur — la recette resterait vraie dans six mois.
     */
    const { data: reservationNo } = await admin.rpc('next_number', {
      p_entity_key: 'reservation',
    })
    const start = new Date(Date.now() - 2 * 86400_000)
    const end = new Date(Date.now() - 3600_000)
    const { data: reservation } = await admin
      .from('reservations')
      .insert({
        reservation_no: reservationNo,
        client_id: client.id,
        category_id: category.id,
        period: `[${start.toISOString()},${end.toISOString()})`,
      })
      .select('id')
      .single()
    fixtures.reservations.push(reservation.id)

    await admin.rpc('confirm_reservation', {
      p_reservation_id: reservation.id,
      p_vehicle_id: vehicle.id,
    })
    const { data: rentalId } = await admin.rpc('convert_reservation_to_rental', {
      p_reservation_id: reservation.id,
    })
    fixtures.rentals.push(rentalId)

    await admin
      .from('rentals')
      .update({ status: 'CONFIRMED', status_changed_at: new Date().toISOString() })
      .eq('id', rentalId)
    await admin.rpc('start_rental', {
      p_rental_id: rentalId,
      p_started_at: start.toISOString(),
      p_mileage: 10000,
      p_fuel_level: 'FULL',
    })

    const { data: rentalRow } = await admin
      .from('rentals')
      .select('rental_no, status, expected_return_at')
      .eq('id', rentalId)
      .maybeSingle()
    check(
      rentalRow?.status === 'IN_PROGRESS' &&
        new Date(rentalRow.expected_return_at).getTime() < Date.now(),
      'Une location en cours, retour attendu DÉPASSÉ',
      `${rentalRow?.rental_no}`
    )

    /* Une facture client émise, échéance passée : créance échue. */
    const { data: invoiceId } = await admin.rpc('create_customer_invoice', {
      p_client_id: client.id,
      p_invoice_date: dayOffset(-20),
      p_due_date: dayOffset(-5),
      p_rental_id: null,
      p_notes: MARK,
    })
    fixtures.customerInvoices.push(invoiceId)
    await admin.rpc('add_customer_invoice_line', {
      p_invoice_id: invoiceId,
      p_kind: 'SERVICE',
      p_label: 'Prestation de recette',
      p_quantity: 1,
      p_unit_price: 450000,
      p_justification: null,
    })
    await admin.rpc('issue_customer_invoice', { p_invoice_id: invoiceId, p_reason: MARK })

    /*
     * Une caisse ouverte à 500 000 KMF.
     *
     * Le total de trésorerie ne se contrôle pas sur un parc de comptes qu'on
     * n'a pas posé : sans compte actif, l'écran affiche à juste titre un état
     * vide, et le contrôle mesurerait la base plutôt que le code.
     */
    const { data: accountId } = await admin.rpc('create_financial_account', {
      p_kind: 'CASH',
      p_label: `${MARK} — Caisse`,
      p_institution: 'Responsable de recette',
      p_account_reference: null,
      p_opening_balance: 500000,
      p_opened_on: dayOffset(-30),
      p_description: MARK,
    })
    fixtures.financial.push(accountId)

    /* Un document de véhicule dont l'échéance approche (§14). */
    const { data: document } = await admin
      .from('vehicle_documents')
      .insert({
        vehicle_id: vehicle.id,
        doc_type: 'INSURANCE',
        label: `${MARK} — Assurance`,
        expires_on: dayOffset(10),
      })
      .select('id')
      .single()
    fixtures.documents.push(document.id)

    console.log(
      `${DIM}Un client, un véhicule, une location en retard, une facture échue, un document.${RESET}`
    )

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — LE PILOTE VOIT SON TABLEAU DE BORD (§33.1, §33.3)\n')

    let pilotPage
    let pilotContext
    {
      const opened = await signIn(browser, base, accounts.pilote)
      pilotContext = opened.context
      pilotPage = opened.page

      const text = await mainText(pilotPage)

      check(/Bonjour Recette/.test(text), 'La page s’ouvre et nomme son utilisateur')
      check(
        /Activité de location/.test(text) &&
          /État du parc/.test(text) &&
          /Finance/.test(text) &&
          /Alertes/.test(text),
        'Les quatre zones de pilotage sont présentes (§4)'
      )
      check(
        !/Il n’est pas vide : il est fermé/.test(text),
        'Le pilote ne voit pas la page « fermée »'
      )

      const late = await kpiValue(pilotPage, 'Retours en retard')
      check(late !== null && late >= 1, 'Les retours en retard sont comptés', `${late}`)

      const running = await kpiValue(pilotPage, 'Locations en cours')
      check(running !== null && running >= 1, 'Les locations en cours sont comptées', `${running}`)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — LES ALERTES REMONTENT (§19, §20)\n')

    {
      const text = await mainText(pilotPage)

      check(/retour\(s\) en retard/.test(text), 'Le retard de retour est signalé')
      check(/Urgent/.test(text), 'Le niveau d’importance est écrit, pas seulement coloré (§20)')
      check(
        new RegExp(`${rentalRow.rental_no}`).test(text),
        'La location en retard est nommée, avec son numéro',
        rentalRow.rental_no
      )
      check(
        /facture\(s\) client\(s\) en retard/.test(text),
        'La facture client échue est signalée'
      )
      check(/Assurance/.test(text), 'Le document proche de son expiration est signalé (§14)')
      check(/À surveiller/.test(text), 'Un niveau plus faible est distingué du niveau urgent')

      /*
       * AUCUN INDICATEUR EN ERREUR DE CHARGEMENT.
       *
       * Un indicateur qui échoue le DIT (§26) — c'est la bonne conduite, mais
       * sur le compte d'un pilote complet, aucun ne doit échouer. Ce contrôle
       * transforme un message honnête en signal de régression : il aurait vu la
       * table de maintenances lue sous un nom qui n'existait pas.
       */
      check(
        !/n’a pas pu être chargé/.test(text),
        'Aucun indicateur n’est en erreur de chargement'
      )

      // Module 02 §33 — le tableau de bord compte les non lues, sans les
      // présenter : le Centre reste l'endroit principal.
      check(
        /notification\(s\) non lue\(s\)/.test(text),
        'Le nombre de notifications non lues est annoncé (Module 02 §33)'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — L’ÉTAT DU PARC EST CONSULTABLE (§12, §33.5)\n')

    {
      const text = await mainText(pilotPage)

      for (const label of [
        'Disponible',
        'Réservé',
        'En location',
        'En maintenance',
        'Immobilisé',
        'Indisponible',
        'Retiré',
      ]) {
        if (!new RegExp(label).test(text)) {
          check(false, `Statut « ${label} » absent du parc`)
        }
      }
      check(
        ['Disponible', 'En location', 'En maintenance', 'Immobilisé', 'Retiré'].every((label) =>
          new RegExp(label).test(text)
        ),
        'Les sept statuts du parc sont présentés, même à zéro (§25)'
      )
      check(
        /véhicule\(s\) au parc/.test(text),
        'Le total du parc est donné'
      )
      check(
        /la disponibilité se lit au calendrier/.test(text),
        'L’écran rappelle qu’un statut n’est pas une disponibilité (Règles parc §69)'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — UN INDICATEUR MÈNE À SA LISTE (§23, §33.9)\n')

    {
      await pilotPage.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      const link = pilotPage.locator('a[href="/location/locations?statut=LATE"]').first()
      const found = (await link.count()) > 0
      check(found, 'La carte « Retours en retard » est un lien vers la liste')

      if (found) {
        await link.click()
        await pilotPage.waitForURL('**/location/locations**', { timeout: 30000 })
        const text = await mainText(pilotPage)
        check(
          new RegExp(rentalRow.rental_no).test(text),
          'La liste atteinte contient bien la location en retard'
        )
      }
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — LA PÉRIODE CHANGE RÉELLEMENT LES CHIFFRES (§8)\n')

    {
      await pilotPage.goto(`${base}/tableau-de-bord?periode=jour`, { waitUntil: 'load' })
      const today = await mainText(pilotPage)
      check(/Aujourd’hui/.test(today), 'Le filtre de période est proposé')
      check(
        /Période analysée : le /.test(today),
        'La période retenue est écrite, sans ambiguïté',
      )

      const invoicedToday = await kpiValue(pilotPage, 'Facturé sur la période')

      await pilotPage.goto(`${base}/tableau-de-bord?periode=annee`, { waitUntil: 'load' })
      const yearText = await mainText(pilotPage)
      const invoicedYear = await kpiValue(pilotPage, 'Facturé sur la période')

      check(/Période analysée : du /.test(yearText), 'L’année affiche un intervalle de dates')
      check(
        invoicedToday !== null && invoicedYear !== null && invoicedYear >= invoicedToday,
        'L’année englobe le jour : le facturé ne diminue pas',
        `${invoicedToday} → ${invoicedYear}`
      )
      check(
        invoicedYear !== null && invoicedYear >= 450000,
        'La facture de recette est comptée dans l’année',
        `${invoicedYear} KMF`
      )

      // Une période bricolée ne casse pas l'écran (§26).
      await pilotPage.goto(`${base}/tableau-de-bord?periode=n-importe-quoi`, {
        waitUntil: 'load',
      })
      const junk = await mainText(pilotPage)
      check(/Bonjour Recette/.test(junk), 'Une période inconnue retombe sur le mois, sans erreur')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — LES CRÉANCES ET LES DETTES SONT JUSTES (§16, §17)\n')

    {
      await pilotPage.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      const text = await mainText(pilotPage)

      check(/Reste à encaisser/.test(text), 'Le reste à encaisser est présenté')
      check(
        /Reste à payer aux fournisseurs/.test(text),
        'Le reste à payer aux fournisseurs aussi'
      )
      check(
        /imputations déduites/.test(text),
        'L’écran DIT que les imputations sont déduites (CLAUDE.md §16)'
      )
      check(/Total disponible/.test(text), 'Les soldes des comptes sont totalisés')
      check(
        new RegExp(`${MARK} — Caisse`).test(text) && /500 000 KMF/.test(text),
        'La caisse de recette figure avec son solde',
        '500 000 KMF'
      )

      const receivable = await kpiValue(pilotPage, 'Reste à encaisser')
      check(
        receivable !== null && receivable >= 450000,
        'La facture échue figure dans la créance',
        `${receivable} KMF`
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — ACTIONS RAPIDES : CELLES QU’IL PEUT FAIRE (§22, §33.8)\n')

    {
      const text = await mainText(pilotPage)
      check(/Actions rapides/.test(text), 'Les actions rapides sont proposées')
      check(/Nouvelle réservation/.test(text), 'Celle qu’il détient est là')
      check(/Nouveau client/.test(text), 'Et l’autre aussi')
      check(
        !/Nouvelle facture client/.test(text),
        'Celle qu’il ne détient PAS n’est pas proposée'
      )
      check(
        !/Nouveau véhicule/.test(text),
        'Ni celle-là : voir le parc n’autorise pas à l’étendre'
      )
    }

    await pilotContext.close()

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — SANS `dashboard.financial.view` : DIT, JAMAIS ZÉRO (§27, DEC-017)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.exploitant)
      const text = await mainText(page)

      check(/Activité de location/.test(text), 'L’exploitation lui reste ouverte')
      check(/État du parc/.test(text), 'Le parc aussi')
      check(
        /dashboard\.financial\.view/.test(text),
        'La capacité manquante est NOMMÉE (§26, DEC-017)'
      )
      check(
        /Non accessible/.test(text),
        'Les montants sont annoncés inaccessibles, pas affichés à zéro'
      )
      check(
        !/Total disponible/.test(text),
        'Aucun solde de trésorerie n’est totalisé'
      )
      check(
        !/facture\(s\) client\(s\) en retard/.test(text),
        'Aucune alerte financière ne fuit par les alertes'
      )
      check(
        /ne sont donc pas absentes : elles ne sont pas mesurées/.test(text),
        'Et l’écran explique pourquoi certaines alertes manquent'
      )
      check(
        /retour\(s\) en retard/.test(text),
        'Les alertes d’exploitation, elles, remontent normalement'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — `dashboard.view` SEULE : LA PAGE EST FERMÉE, ET LE DIT (§33.12)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.nu)
      const text = await mainText(page)

      check(
        /Il n’est pas vide : il est fermé/.test(text),
        'L’écran dit qu’il est fermé, et non que l’entreprise est vide'
      )
      check(
        !/Total disponible/.test(text) && !/véhicule\(s\) au parc/.test(text),
        'Aucun chiffre n’est affiché'
      )
      check(/Non accessible/.test(text), 'Chaque indicateur nomme ce qui lui manque')
      check(
        !/Actions rapides/.test(text),
        'Aucune action rapide n’est proposée : il n’en détient aucune'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — AUCUN EFFET DE BORD, DONNÉES DEMO INTACTES\n')

    {
      const [{ data: rental }, { data: veh }, { data: inv }] = await Promise.all([
        admin.from('rentals').select('status').eq('id', rentalId).maybeSingle(),
        admin.from('vehicles').select('status').eq('id', vehicle.id).maybeSingle(),
        admin.from('customer_invoices').select('status').eq('id', invoiceId).maybeSingle(),
      ])

      check(rental?.status === 'IN_PROGRESS', 'Consulter le pilotage ne clôture rien', rental?.status)
      check(veh?.status === 'RENTED', 'Le statut du véhicule est inchangé', veh?.status)
      check(inv?.status === 'ISSUED', 'La facture reste « Émise »', inv?.status)

      const { count: entries } = await admin
        .from('treasury_entries')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', '00000000-0000-0000-0000-000000000000')
      check(entries === 0, 'Aucune écriture fantôme produite par le pilotage')

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
      check(total === 170, 'Catalogue conforme', `${total} permissions`)
    }
  } finally {
    await browser.close()

    for (const id of fixtures.documents) {
      await admin.from('vehicle_documents').delete().eq('id', id)
    }

    for (const id of fixtures.customerInvoices) {
      const { data: payments } = await admin
        .from('customer_payments')
        .select('id')
        .eq('customer_invoice_id', id)
      for (const payment of payments ?? []) {
        await admin.from('treasury_entries').delete().eq('customer_payment_id', payment.id)
        await admin.from('customer_payments').delete().eq('id', payment.id)
      }
      await admin.from('customer_invoice_lines').delete().eq('customer_invoice_id', id)
      await admin.from('customer_invoices').delete().eq('id', id)
    }

    for (const id of fixtures.financial) {
      await admin.from('treasury_entries').delete().eq('account_id', id)
      await admin.from('financial_accounts').delete().eq('id', id)
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

    for (const vehicleId of fixtures.vehicleIds) {
      await admin.from('vehicle_documents').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicle_occupations').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicle_supplier_history').delete().eq('vehicle_id', vehicleId)
      await admin.from('vehicles').delete().eq('id', vehicleId)
    }

    if (fixtures.ruleId) await admin.from('pricing_rules').delete().eq('id', fixtures.ruleId)
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
    console.log(`${GREEN}RECETTE TABLEAU DE BORD : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE TABLEAU DE BORD : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
