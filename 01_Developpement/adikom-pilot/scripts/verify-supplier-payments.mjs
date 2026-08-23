#!/usr/bin/env node
/**
 * Recette des informations de paiement fournisseur — ADIKOM PILOT.
 *
 * TROIS QUESTIONS
 *
 *   1. La structure tient-elle ? Plusieurs coordonnées pour un fournisseur,
 *      une seule principale, désactivation plutôt que suppression.
 *
 *   2. La confidentialité tient-elle ? Voir un fournisseur ne donne pas accès
 *      à ses coordonnées de règlement ; les modifier exige une permission
 *      distincte. Contrôlé sur les trois barrières — onglet, route, base.
 *
 *   3. Le journal reste-t-il propre ? Aucun identifiant de règlement en clair
 *      dans `audit_log`, et pourtant assez d'information pour savoir QUI a
 *      changé QUOI.
 *
 * DONNÉES
 *
 * Le sujet est un fournisseur de recette créé puis supprimé — jamais un
 * fournisseur DEMO : aucune coordonnée bancaire fictive ne doit subsister sur
 * les données de démonstration. Leur intégrité est recomptée avant de rendre
 * la main.
 *
 * Utilisation :
 *   node scripts/verify-supplier-payments.mjs [url]
 *
 *   url   par défaut https://adikom-pilot.vercel.app
 */

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
const SUPPLIER_NAME = `RECETTE PAIEMENT ${STAMP}`

/* -------------------------------------------------------------------------- */
/*  Profils                                                                    */
/* -------------------------------------------------------------------------- */

const PROFILES = [
  {
    key: 'view',
    permissions: ['parties.suppliers.view', 'parties.suppliers.download'],
  },
  {
    key: 'read',
    permissions: [
      'parties.suppliers.view',
      'parties.suppliers.bank.view',
      'parties.suppliers.download',
    ],
  },
  {
    key: 'edit',
    permissions: [
      'parties.suppliers.view',
      'parties.suppliers.bank.view',
      'parties.suppliers.bank.update',
      'parties.suppliers.export',
    ],
  },
]

async function createProfile(admin, profile) {
  const username = `recette.pay.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-pay-${STAMP}`

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
    last_name: `Paiement ${profile.key}`,
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
      `catalogue incomplet pour ${profile.key} : ` +
        `${(catalog ?? []).length}/${profile.permissions.length}`
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

/**
 * Le formulaire se soumet par SON bouton : la barre latérale en porte un autre.
 *
 * L'attente d'inactivité réseau précède le clic : sans elle, il pouvait partir
 * avant l'hydratation, et l'action serveur ne recevait pas ce qui venait d'être
 * saisi.
 */
async function submitForm(page, label) {
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: label, exact: true }).click()
}

/**
 * Attend qu'une condition soit VRAIE en base, plutôt qu'un délai fixe.
 *
 * Une action serveur, sa revalidation et l'écriture ne prennent pas toujours le
 * même temps : mesurer l'état plutôt que patienter au jugé supprime la
 * dépendance à la vitesse de la machine.
 */
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
async function writeAsUser(account, url, anonKey, operation, supplierId, paymentId) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: signInError } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (signInError) throw new Error(`session ${account.username} : ${signInError.message}`)

  const operations = {
    select: () =>
      client.from('supplier_payment_details').select('id').eq('supplier_id', supplierId),
    insert: () =>
      client
        .from('supplier_payment_details')
        .insert({
          supplier_id: supplierId,
          kind: 'BANK_ACCOUNT',
          label: 'Intrusion',
          iban: 'KM9999999999999999',
        })
        .select('id'),
    update: () =>
      client
        .from('supplier_payment_details')
        .update({ label: 'Détourné' })
        .eq('id', paymentId)
        .select('id'),
    delete: () =>
      client.from('supplier_payment_details').delete().eq('id', paymentId).select('id'),
  }

  const result = await operations[operation]()
  await client.auth.signOut()

  return { error: result.error, rows: result.data?.length ?? 0 }
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
  let supplierId = null
  const browser = await chromium.launch()

  try {
    // --- Sujet : un fournisseur de recette, jamais un fournisseur DEMO ------
    const { data: supplierNo } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
    const { data: supplier, error: supplierError } = await admin
      .from('suppliers')
      .insert({
        supplier_no: supplierNo,
        type: 'VEHICLE_SUPPLIER',
        legal_name: SUPPLIER_NAME,
        phone: '+269 000 00 00',
      })
      .select('id')
      .single()

    if (supplierError) throw new Error(`sujet : ${supplierError.message}`)
    supplierId = supplier.id
    console.log(`${DIM}Sujet : ${supplierNo} · ${SUPPLIER_NAME}${RESET}\n`)

    for (const profile of PROFILES) accounts[profile.key] = await createProfile(admin, profile)

    /* ------------------------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('CAS 1 — VIEW seul : le fournisseur, pas ses coordonnées\n')

    {
      const { context, page } = await signIn(browser, base, accounts.view)

      await page.goto(`${base}/tiers/fournisseurs/${supplierId}`, { waitUntil: 'load' })
      check(
        (await page.getByRole('link', { name: 'Informations de paiement' }).count()) === 0,
        'Onglet « Informations de paiement » absent'
      )

      await page.goto(`${base}/tiers/fournisseurs/${supplierId}?onglet=paiement`, {
        waitUntil: 'load',
      })
      check(
        (await page.getByText('Ajouter', { exact: true }).count()) === 0,
        'Aucune action d’ajout par accès direct à l’onglet'
      )

      // Le document reste produit — sans la section, faute de permission.
      const pdf = await context.request.get(
        `${base}/api/documents/fournisseurs/${supplierId}?mode=download`
      )
      const bytes = Buffer.from(await pdf.body())
      check(
        pdf.status() === 200 && bytes.subarray(0, 5).toString('latin1') === '%PDF-',
        'La fiche PDF reste produite sans le droit sur les coordonnées',
        `${pdf.status()} · ${Math.round(bytes.byteLength / 1024)} Ko`
      )

      await context.close()

      const read = await writeAsUser(accounts.view, url, anonKey, 'select', supplierId)
      check(read.rows === 0, 'RLS ne laisse lire aucune coordonnée', 'aucune ligne')

      const insert = await writeAsUser(accounts.view, url, anonKey, 'insert', supplierId)
      check(insert.rows === 0, 'RLS refuse la création', insert.error?.code ?? 'aucune ligne')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 2 — VIEW + BANK.UPDATE : plusieurs coordonnées, une principale\n')

    {
      const { context, page } = await signIn(browser, base, accounts.edit)

      await page.goto(`${base}/tiers/fournisseurs/${supplierId}?onglet=paiement`, {
        waitUntil: 'load',
      })
      check(
        (await page.getByRole('link', { name: 'Ajouter' }).count()) === 1,
        'Bouton « Ajouter » présent'
      )

      // --- Première coordonnée : compte bancaire, principale ---------------
      await page.getByRole('link', { name: 'Ajouter' }).click()
      await page.waitForURL((u) => u.href.includes('paiement=nouveau'), { timeout: 30000 })

      await page.fill('#label', 'Compte de recette 1')
      await page.fill('#accountHolder', SUPPLIER_NAME)
      await page.fill('#currencyCode', 'KMF')
      await page.fill('#bankName', 'Banque de recette')
      await page.fill('#accountNumber', '0009999999')
      await page.check('input[name="isPrimary"]')
      await submitForm(page, 'Ajouter la coordonnée')

      const countRows = async (expected) => {
        const { data } = await admin
          .from('supplier_payment_details')
          .select('id')
          .eq('supplier_id', supplierId)
        return (data ?? []).length === expected
      }

      await until(() => countRows(1))

      // --- Deuxième coordonnée : autre nature, non principale ---------------
      await page.goto(`${base}/tiers/fournisseurs/${supplierId}?onglet=paiement&paiement=nouveau`, {
        waitUntil: 'load',
      })
      await page.selectOption('select[name="kind"]', 'OTHER')
      await page.fill('#label', 'Coordonnée de recette 2')
      await page.fill('#accountReference', `REF-${STAMP}`)
      await submitForm(page, 'Ajouter la coordonnée')

      await until(() => countRows(2))

      const { data: rows } = await admin
        .from('supplier_payment_details')
        .select('id, kind, label, is_primary, is_active, account_reference, currency_code')
        .eq('supplier_id', supplierId)
        .order('label')

      check((rows ?? []).length === 2, 'Deux coordonnées coexistent', `${(rows ?? []).length}`)
      check(
        (rows ?? []).filter((r) => r.is_primary).length === 1,
        'Une seule coordonnée principale'
      )
      check(
        (rows ?? []).some((r) => r.kind === 'BANK_ACCOUNT') &&
          (rows ?? []).some((r) => r.kind === 'OTHER'),
        'Les deux natures sont enregistrées'
      )
      check(
        (rows ?? []).find((r) => r.kind === 'OTHER')?.account_reference === `REF-${STAMP}`,
        'La référence générique est enregistrée'
      )

      const first = (rows ?? []).find((r) => r.label === 'Compte de recette 1')
      const second = (rows ?? []).find((r) => r.label === 'Coordonnée de recette 2')

      // --- Bascule de la principale -----------------------------------------
      await page.goto(`${base}/tiers/fournisseurs/${supplierId}?onglet=paiement`, {
        waitUntil: 'load',
      })
      await submitForm(page, 'Définir comme principale')

      await until(async () => {
        const { data } = await admin
          .from('supplier_payment_details')
          .select('is_primary')
          .eq('id', second.id)
          .maybeSingle()
        return data?.is_primary === true
      })

      const { data: afterSwap } = await admin
        .from('supplier_payment_details')
        .select('id, is_primary')
        .eq('supplier_id', supplierId)

      check(
        (afterSwap ?? []).filter((r) => r.is_primary).length === 1,
        'Après bascule, toujours une seule principale'
      )
      check(
        (afterSwap ?? []).find((r) => r.id === second.id)?.is_primary === true,
        'La coordonnée désignée est devenue la principale'
      )

      // --- Modification ------------------------------------------------------
      await page.goto(
        `${base}/tiers/fournisseurs/${supplierId}?onglet=paiement&paiement=${first.id}`,
        { waitUntil: 'load' }
      )
      check(
        (await page.inputValue('#label')) === 'Compte de recette 1',
        'Le formulaire de modification est pré-rempli'
      )
      await page.fill('#bankName', 'Banque de recette modifiee')
      await submitForm(page, 'Enregistrer la coordonnée')

      await until(async () => {
        const { data } = await admin
          .from('supplier_payment_details')
          .select('bank_name')
          .eq('id', first.id)
          .maybeSingle()
        return data?.bank_name === 'Banque de recette modifiee'
      })

      const { data: edited } = await admin
        .from('supplier_payment_details')
        .select('bank_name, updated_by')
        .eq('id', first.id)
        .maybeSingle()

      check(
        edited?.bank_name === 'Banque de recette modifiee',
        'La modification est enregistrée en base'
      )
      check(edited?.updated_by === accounts.edit.id, 'L’auteur de la modification est conservé')

      // --- Désactivation ------------------------------------------------------
      await page.goto(`${base}/tiers/fournisseurs/${supplierId}?onglet=paiement`, {
        waitUntil: 'load',
      })
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: 'Désactiver', exact: true }).first().click()

      await until(async () => {
        const { data } = await admin
          .from('supplier_payment_details')
          .select('is_active')
          .eq('supplier_id', supplierId)
        return (data ?? []).some((r) => !r.is_active)
      })

      const { data: afterOff } = await admin
        .from('supplier_payment_details')
        .select('id, is_active, is_primary')
        .eq('supplier_id', supplierId)

      check(
        (afterOff ?? []).some((r) => !r.is_active),
        'Une coordonnée peut être désactivée'
      )
      check(
        (afterOff ?? []).every((r) => r.is_active || !r.is_primary),
        'Une coordonnée désactivée n’est jamais restée principale'
      )
      check(
        (afterOff ?? []).length === 2,
        'La désactivation ne supprime rien',
        `${(afterOff ?? []).length} ligne(s) conservée(s)`
      )

      // --- Export Excel : aucune donnée de règlement --------------------------
      const xlsx = await context.request.get(`${base}/api/exports/fournisseurs`)
      const book = new ExcelJS.Workbook()
      await book.xlsx.load(Buffer.from(await xlsx.body()))
      const sheet = book.worksheets[0]
      const headers = []
      sheet.getRow(sheet.rowCount > 2 ? 2 : 1).eachCell((cell) => headers.push(String(cell.value)))
      const leaked = headers.filter((h) =>
        /iban|swift|bic|compte|banque|paiement|règlement/i.test(h)
      )
      check(
        leaked.length === 0,
        'Aucune colonne de règlement dans l’export Excel',
        `${headers.length} colonnes`
      )

      await context.close()

      // --- Suppression impossible, même avec le droit de modifier -------------
      const removal = await writeAsUser(
        accounts.edit,
        url,
        anonKey,
        'delete',
        supplierId,
        first.id
      )
      check(
        removal.rows === 0,
        'La suppression reste impossible depuis l’application',
        removal.error?.code ?? 'aucune ligne'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('CAS 3 — BANK.VIEW sans BANK.UPDATE : consulter, sans modifier\n')

    {
      const { context, page } = await signIn(browser, base, accounts.read)

      await page.goto(`${base}/tiers/fournisseurs/${supplierId}?onglet=paiement`, {
        waitUntil: 'load',
      })
      check(
        (await page.getByText('Compte de recette 1').count()) >= 1,
        'Les coordonnées sont consultables'
      )
      check(
        (await page.getByRole('link', { name: 'Ajouter' }).count()) === 0,
        'Consulter n’emporte pas modifier : aucun bouton « Ajouter »'
      )
      check(
        (await page.getByRole('button', { name: 'Désactiver', exact: true }).count()) === 0,
        'Aucune action de désactivation'
      )

      const pdf = await context.request.get(
        `${base}/api/documents/fournisseurs/${supplierId}?mode=download`
      )
      const bytes = Buffer.from(await pdf.body())
      check(
        pdf.status() === 200 && bytes.subarray(0, 5).toString('latin1') === '%PDF-',
        'La fiche PDF est produite avec la section paiement',
        `${pdf.status()} · ${Math.round(bytes.byteLength / 1024)} Ko`
      )

      await context.close()

      const { data: any } = await admin
        .from('supplier_payment_details')
        .select('id')
        .eq('supplier_id', supplierId)
        .limit(1)

      const update = await writeAsUser(
        accounts.read,
        url,
        anonKey,
        'update',
        supplierId,
        any[0].id
      )
      check(update.rows === 0, 'RLS refuse la modification', update.error?.code ?? 'aucune ligne')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('JOURNAL D’AUDIT\n')

    {
      const { data: journal } = await admin
        .from('audit_log')
        .select('action, after_data, before_data')
        .eq('entity_type', 'supplier_payment_details')
        .limit(100)

      const entries = journal ?? []
      const sensitive = ['account_number', 'iban', 'swift_bic', 'account_reference']

      const leaks = entries.filter((e) =>
        sensitive.some((k) => (e.after_data ?? {})[k] != null || (e.before_data ?? {})[k] != null)
      )

      check(entries.length > 0, 'Les écritures sont journalisées', `${entries.length} entrée(s)`)
      check(leaks.length === 0, 'Aucun identifiant de règlement en clair dans le journal')
      check(
        entries.some((e) => (e.after_data ?? {}).label != null),
        'Le journal conserve de quoi savoir QUELLE coordonnée a changé'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('DONNÉES DEMO\n')

    {
      const { data: demo } = await admin
        .from('suppliers')
        .select('supplier_no, legal_name')
        .like('legal_name', 'FOURNISSEUR DEMO%')
        .order('supplier_no')

      check(
        (demo ?? []).length === 3,
        'Les trois fournisseurs DEMO sont intacts',
        (demo ?? []).map((s) => s.supplier_no).join(', ')
      )

      const { data: demoPayments } = await admin
        .from('supplier_payment_details')
        .select('id, supplier_id, suppliers ( legal_name )')

      const onDemo = (demoPayments ?? []).filter((p) =>
        String(p.suppliers?.legal_name ?? '').startsWith('FOURNISSEUR DEMO')
      )

      check(
        onDemo.length === 0,
        'Aucune coordonnée de règlement fictive sur les fournisseurs DEMO'
      )
    }
  } finally {
    await browser.close()

    // Le rôle de service peut supprimer, l'application non (DEC-020).
    // La suppression du fournisseur emporte ses coordonnées (on delete cascade).
    if (supplierId) await admin.from('suppliers').delete().eq('id', supplierId)
    for (const account of Object.values(accounts)) {
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }
    console.log(`\n${DIM}Fournisseur et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE INFORMATIONS DE PAIEMENT : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE INFORMATIONS DE PAIEMENT : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
