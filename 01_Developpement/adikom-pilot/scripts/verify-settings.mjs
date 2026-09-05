#!/usr/bin/env node
/**
 * Recette Paramètres — LOT 16.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:settings` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL contrôle la structure et les droits avec le rôle de service,
 * pour lequel `current_actor()` vaut NULL : aucune capacité n'y est vérifiée.
 * Celle-ci ouvre de VRAIES sessions et éprouve ce que chaque profil peut lire
 * et écrire — par l'écran ET par appel direct à l'API, sans passer par aucun
 * bouton.
 *
 * LA FRONTIÈRE CENTRALE DU LOT
 *
 * `company_settings` est un SINGLETON, et RLS est ROW-level. Une seule policy
 * gouvernait donc la ligne entière : `settings.company.view` rendait le
 * registre de commerce et les coordonnées bancaires, et
 * `settings.company.update` permettait de les réécrire — alors que le catalogue
 * leur donne depuis toujours leurs propres capacités (§34, §37, §38, DEC-024).
 *
 * Les profils ci-dessous sont construits pour qu'AUCUN ne cumule deux sections
 * sensibles : c'est précisément le cumul qui masquerait le défaut.
 *
 * Critères d'acceptation du Module 09 §58 couverts :
 *   1 à 7, 10 à 15, 18, 19.
 *
 * PRUDENCE PARTICULIÈRE — CETTE RECETTE ÉCRIT DANS LA VRAIE CONFIGURATION.
 *
 * Il n'existe qu'une ligne de paramètres, et c'est celle d'ADIKOM. La recette
 * en prend une empreinte complète au départ et la restitue à la fin, quoi qu'il
 * arrive. Elle n'emploie que des valeurs reconnaissables, et ne consomme AUCUN
 * numéro : un numéro émis ne se reprend pas (§16).
 *
 * Utilisation :
 *   node scripts/verify-settings.mjs [url]
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
const MARK = `RECETTE PARAM ${STAMP}`

const BASE = ['dashboard.view']

/** La règle de numérotation éprouvée : le virement interne n'est pas livré. */
const RULE = 'transfer'

const PROFILES = {
  /* Il voit la fiche Entreprise, et n'y touche à rien. */
  lecteur: [...BASE, 'settings.company.view'],

  /*
   * LE PROFIL CENTRAL DU LOT.
   *
   * Il modifie l'identité, les coordonnées, le commercial, la facturation et
   * les préférences — et RIEN d'autre. Ni le registre de commerce, ni les
   * coordonnées bancaires, ni le logo. C'est la frontière que la migration 068
   * pose colonne par colonne.
   */
  redacteur: [...BASE, 'settings.company.view', 'settings.company.update'],

  /* La section Administratif seule (§34). */
  administratif: [
    ...BASE,
    'settings.company.view',
    'settings.company.administrative.view',
    'settings.company.administrative.update',
  ],

  /* La section Banque seule (§37) — la plus sensible. */
  banque: [
    ...BASE,
    'settings.company.view',
    'settings.company.bank.view',
    'settings.company.bank.update',
  ],

  /* L'identité visuelle seule (§38). */
  visuel: [...BASE, 'settings.company.view', 'settings.branding.update'],

  /*
   * LA NUMÉROTATION SANS L'ENTREPRISE.
   *
   * Exactement la dotation d'un poste chargé des formats de référence : il n'a
   * aucune raison de lire les coordonnées bancaires d'ADIKOM (DEC-024).
   */
  numerotation: [...BASE, 'settings.numbering.view', 'settings.numbering.update'],

  /* Rien du module : l'écran lui est fermé. */
  sans_acces: [...BASE],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.set.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-set-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`compte ${key} : ${error?.message}`)

  const id = created.user.id
  accounts[key] = { id, email, password, username }

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: `Set ${key}`,
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
  await page.waitForURL('**/tableau-de-bord', { timeout: 60000 })

  return { context, page }
}

async function mainText(page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ')
}

/** Toutes les colonnes de la fiche : l'empreinte à restituer. */
const ALL_COLUMNS = `
  id, legal_name, trade_name, acronym, description, activity, tagline, internal_code,
  address_line1, address_line2, city, country, phone, email, website,
  registration_number, tax_identifier, legal_form, administrative_notes,
  main_activity, secondary_activities, commercial_description,
  invoice_display_name, invoice_address, invoice_footer_notes, invoice_legal_notes,
  bank_name, bank_account_holder, bank_account_details,
  logo_path, logo_secondary_path, color_primary, color_secondary, color_accent,
  currency_code, currency_label, locale, timezone, date_format,
  rental_duration_rounding, rental_buffer_minutes, imputation_approval_threshold
`

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
  const sessions = {}
  const browser = await chromium.launch()

  let snapshot = null
  let ruleSnapshot = null

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

  const refused = (result) => Boolean(result.error) || !result.count
  const why = (result) => {
    if (result.error) return String(result.error.message).slice(0, 70)
    if (!result.count) return 'aucune ligne modifiée'
    return '*** OPÉRATION AUTORISÉE À TORT ***'
  }

  try {
    /* --- Empreinte de la configuration réelle ------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    const { data: original, error: snapError } = await admin
      .from('company_settings')
      .select(ALL_COLUMNS)
      .eq('id', true)
      .single()

    if (snapError || !original) {
      throw new Error(`empreinte de la configuration : ${snapError?.message ?? 'introuvable'}`)
    }
    snapshot = original
    console.log(`  ${DIM}empreinte de la configuration prise (${Object.keys(original).length} colonnes)${RESET}`)

    const { data: rule, error: ruleError } = await admin
      .from('numbering_rules')
      .select('entity_key, prefix, separator, padding, include_year, reset_yearly, current_value, current_year')
      .eq('entity_key', RULE)
      .single()
    if (ruleError || !rule) throw new Error(`règle ${RULE} : ${ruleError?.message}`)
    ruleSnapshot = rule

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, accounts, key, codes)
    }
    console.log(`  ${DIM}${Object.keys(PROFILES).length} profils créés${RESET}`)

    /* ================== 1. ACCÈS À L'ÉCRAN (§30, §58.1) =================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1. L’accès au module est restreint (§30, §44)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.sans_acces)

      await page.goto(`${base}/parametres`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Sans capacité, les paramètres sont refusés',
        page.url().replace(base, '')
      )

      await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      const nav = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(!nav.includes('Paramètres'), 'La barre latérale n’annonce pas un écran fermé')

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.lecteur)
      await page.goto(`${base}/parametres`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(!page.url().includes('/acces-refuse'), 'Avec la lecture, l’écran s’ouvre')
      check(text.includes('Paramètres'), 'L’écran porte son titre')

      for (const section of ['Identité', 'Coordonnées', 'Commercial', 'Facturation', 'Préférences']) {
        check(text.includes(section), `Section « ${section} » présente (§31)`)
      }

      const nav = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(nav.includes('Paramètres'), 'La barre latérale l’annonce')

      // §49 — l'indicateur de configuration.
      check(text.includes('État de la configuration'), 'L’état de la configuration est présenté (§49)')

      await context.close()
    }

    /*
     * LA NUMÉROTATION N'OUVRE PAS L'ENTREPRISE.
     *
     * Deux lectures distinctes, et aucune n'implique l'autre : un poste chargé
     * des formats de référence n'a pas à lire les coordonnées bancaires.
     */
    {
      const { context, page } = await signIn(browser, base, accounts.numerotation)

      await page.goto(`${base}/parametres`, { waitUntil: 'load' })
      const parDefaut = await mainText(page)
      check(
        !page.url().includes('/acces-refuse'),
        'settings.numbering.view ouvre bien l’écran'
      )
      check(
        parDefaut.includes('Règles de numérotation'),
        'Et l’écran s’ouvre directement sur l’onglet qu’il peut lire'
      )

      await page.goto(`${base}/parametres?onglet=entreprise`, { waitUntil: 'load' })
      const entreprise = await mainText(page)
      check(
        entreprise.includes('non consultable') || entreprise.includes('Section non consultable'),
        'La numérotation n’ouvre PAS la fiche Entreprise (DEC-024)'
      )
      check(
        !entreprise.includes('Raison sociale'),
        'Aucun champ de la fiche Entreprise ne transparaît'
      )

      await context.close()
    }

    /* ================== 2. LES SECTIONS SENSIBLES (§34, §37, §42) ========= */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2. Chaque section sensible suit SA capacité (§34, §37, §42)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.lecteur)
      await page.goto(`${base}/parametres`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(
        text.includes('Section non consultable avec vos droits'),
        'Sans la capacité, les sections sensibles se ferment — et le DISENT'
      )
      check(
        text.includes('Voir les informations administratives'),
        'Le refus nomme la capacité administrative manquante (DEC-017)'
      )
      check(
        text.includes('Voir les informations bancaires'),
        'Le refus nomme la capacité bancaire manquante'
      )
      check(
        !text.includes('Numéro de registre') && !text.includes('Références du compte'),
        'Aucun champ sensible n’apparaît, même vide'
      )
      check(
        text.includes('Consultation seule'),
        'La lecture seule est annoncée plutôt que suggérée par un bouton absent'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.administratif)
      await page.goto(`${base}/parametres`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(text.includes('Numéro de registre'), 'Avec sa capacité, l’administratif s’ouvre')
      check(
        !text.includes('Références du compte'),
        'Et la MÊME capacité n’ouvre pas la section bancaire'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.banque)
      await page.goto(`${base}/parametres`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(text.includes('Références du compte'), 'Avec sa capacité, la banque s’ouvre')
      check(
        !text.includes('Numéro de registre'),
        'Et la MÊME capacité n’ouvre pas la section administrative'
      )

      await context.close()
    }

    /* --- Par appel direct : là où plus aucun écran ne protège ------------- */
    {
      const lecteur = await session('lecteur')
      const administratif = await session('administratif')
      const banque = await session('banque')
      const sansAcces = await session('sans_acces')

      const registre = await lecteur.from('company_settings').select('registration_number').limit(1)
      check(
        Boolean(registre.error),
        'API : le registre de commerce est refusé à la lecture directe',
        registre.error ? String(registre.error.message).slice(0, 60) : '*** COLONNE LISIBLE ***'
      )

      const compte = await lecteur.from('company_settings').select('bank_account_details').limit(1)
      check(
        Boolean(compte.error),
        'API : les références bancaires sont refusées à la lecture directe',
        compte.error ? String(compte.error.message).slice(0, 60) : '*** COLONNE LISIBLE ***'
      )

      const ouvert = await lecteur.from('company_settings').select('legal_name, city').limit(1)
      check(
        !ouvert.error && (ouvert.data ?? []).length === 1,
        'API : la fiche reste lisible avec la capacité générale'
      )

      const rpcLecteur = (await lecteur.rpc('company_settings_sensitive')).data?.[0]
      check(
        rpcLecteur && rpcLecteur.may_read_administrative === false && rpcLecteur.may_read_bank === false,
        'RPC : les deux sections se déclarent fermées'
      )
      check(
        rpcLecteur && rpcLecteur.registration_number === null && rpcLecteur.bank_account_details === null,
        'RPC : et rien de leur contenu ne transite'
      )

      const rpcAdmin = (await administratif.rpc('company_settings_sensitive')).data?.[0]
      check(
        rpcAdmin && rpcAdmin.may_read_administrative === true && rpcAdmin.may_read_bank === false,
        'RPC : l’administratif s’ouvre, la banque non'
      )
      check(rpcAdmin && rpcAdmin.bank_account_details === null, 'RPC : aucune fuite bancaire')

      const rpcBanque = (await banque.rpc('company_settings_sensitive')).data?.[0]
      check(
        rpcBanque && rpcBanque.may_read_bank === true && rpcBanque.may_read_administrative === false,
        'RPC : la banque s’ouvre, l’administratif non'
      )

      const rpcInterdit = await sansAcces.rpc('company_settings_sensitive')
      check(
        Boolean(rpcInterdit.error),
        'RPC : sans settings.company.view, la fonction refuse',
        rpcInterdit.error ? String(rpcInterdit.error.message).slice(0, 60) : '*** OUVERTE À TORT ***'
      )

      const listeInterdite = await sansAcces.from('company_settings').select('legal_name').limit(1)
      check(
        (listeInterdite.data ?? []).length === 0,
        'API : sans capacité, la fiche ne rend aucune ligne'
      )
    }

    /* ================== 3. ÉCRITURE PAR SECTION (§34, §37, §38) =========== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3. Écrire une section exige SA capacité — par appel direct\n')

    {
      const redacteur = await session('redacteur')
      const administratif = await session('administratif')
      const banque = await session('banque')
      const visuel = await session('visuel')
      const lecteur = await session('lecteur')

      // Ce que le rédacteur PEUT faire — la règle ne doit pas fermer le métier.
      const identite = await redacteur
        .from('company_settings')
        .update({ tagline: `${MARK} — slogan` }, { count: 'exact' })
        .eq('id', true)
      check(
        !identite.error && identite.count === 1,
        'settings.company.update écrit bien l’identité',
        identite.error ? String(identite.error.message).slice(0, 60) : '1 ligne'
      )

      // Ce qu'il ne peut PAS faire.
      const versAdmin = await redacteur
        .from('company_settings')
        .update({ registration_number: `RC-${STAMP}` }, { count: 'exact' })
        .eq('id', true)
      check(
        refused(versAdmin),
        'Mais il n’écrit pas le registre de commerce (§34)',
        why(versAdmin)
      )

      const versBanque = await redacteur
        .from('company_settings')
        .update({ bank_account_details: `IBAN-${STAMP}` }, { count: 'exact' })
        .eq('id', true)
      check(
        refused(versBanque),
        'Ni les références bancaires (§37)',
        why(versBanque)
      )

      const versLogo = await redacteur
        .from('company_settings')
        .update({ color_primary: '#000000' }, { count: 'exact' })
        .eq('id', true)
      check(
        refused(versLogo),
        'Ni l’identité visuelle (§38)',
        why(versLogo)
      )

      // La frontière inverse : chaque spécialiste chez lui.
      const adminChezLui = await administratif
        .from('company_settings')
        .update({ administrative_notes: `${MARK} — note` }, { count: 'exact' })
        .eq('id', true)
      check(
        !adminChezLui.error && adminChezLui.count === 1,
        'La capacité administrative écrit bien l’administratif'
      )

      const adminAilleurs = await administratif
        .from('company_settings')
        .update({ tagline: `${MARK} — usurpation` }, { count: 'exact' })
        .eq('id', true)
      check(
        refused(adminAilleurs),
        'Et elle n’écrit rien d’autre',
        why(adminAilleurs)
      )

      const banqueChezElle = await banque
        .from('company_settings')
        .update({ bank_account_holder: `${MARK}` }, { count: 'exact' })
        .eq('id', true)
      check(
        !banqueChezElle.error && banqueChezElle.count === 1,
        'La capacité bancaire écrit bien la banque'
      )

      const banqueAilleurs = await banque
        .from('company_settings')
        .update({ registration_number: `RC-${STAMP}` }, { count: 'exact' })
        .eq('id', true)
      check(
        refused(banqueAilleurs),
        'Et elle n’écrit pas l’administratif',
        why(banqueAilleurs)
      )

      const visuelChezLui = await visuel
        .from('company_settings')
        .update({ color_accent: '#ABCDEF' }, { count: 'exact' })
        .eq('id', true)
      check(
        !visuelChezLui.error && visuelChezLui.count === 1,
        'La capacité d’identité visuelle écrit bien les couleurs'
      )

      const visuelAilleurs = await visuel
        .from('company_settings')
        .update({ email: `faux-${STAMP}@adikom.test` }, { count: 'exact' })
        .eq('id', true)
      check(
        refused(visuelAilleurs),
        'Et elle n’écrit pas les coordonnées',
        why(visuelAilleurs)
      )

      // Le lecteur n'écrit rien du tout.
      const lecteurEcrit = await lecteur
        .from('company_settings')
        .update({ tagline: `${MARK} — lecteur` }, { count: 'exact' })
        .eq('id', true)
      check(refused(lecteurEcrit), 'La lecture seule n’écrit rien', why(lecteurEcrit))

      // Et personne ne dédouble la configuration.
      const doublon = await redacteur.from('company_settings').insert({ id: true })
      check(
        Boolean(doublon.error),
        'Nul ne crée une seconde configuration',
        doublon.error ? String(doublon.error.message).slice(0, 60) : '*** INSERTION ACCEPTÉE ***'
      )
    }

    /* ================== 4. LA DEVISE SE CONFIRME (§45, §57) =============== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4. Changer la devise est une décision, pas une saisie (§45, §57)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.redacteur)
      await page.goto(`${base}/parametres`, { waitUntil: 'load' })

      // Tant que la devise ne change pas, aucun avertissement ne s'affiche :
      // un avertissement permanent finit par ne plus être lu.
      check(
        !(await mainText(page)).includes('Vous modifiez la devise principale'),
        'Aucun avertissement tant que la devise ne change pas'
      )

      await page.fill('#currency_code', 'EUR')
      const avertissement = await mainText(page)
      check(
        avertissement.includes('Vous modifiez la devise principale'),
        'L’avertissement apparaît dès que la valeur change'
      )
      check(
        avertissement.includes('ne sont pas convertis'),
        'Il dit ce que le changement ne fait PAS (§46)'
      )

      // Sans confirmation, le serveur refuse — le contrôle n'est pas dans la case.
      await page.locator('form:has(#currency_code) button[type="submit"]').click()
      await page.waitForFunction(
        () => document.querySelector('main')?.textContent?.includes('doit être confirmé') ?? false,
        { timeout: 30000 }
      )
      check(true, 'Sans confirmation, le changement est refusé côté serveur')

      const { data: inchangee } = await admin
        .from('company_settings')
        .select('currency_code')
        .eq('id', true)
        .single()
      check(
        inchangee?.currency_code === snapshot.currency_code,
        'Et la devise n’a pas bougé',
        `${inchangee?.currency_code}`
      )

      await context.close()
    }

    /* ================== 5. NUMÉROTATION (§15 à §17) ======================= */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5. Le format se règle, le compteur jamais (§16)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.numerotation)
      await page.goto(`${base}/parametres?onglet=numerotation`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(text.includes('Règles de numérotation'), 'L’onglet Numérotation s’ouvre')
      check(
        text.includes('Le compteur ne se modifie pas'),
        'L’écran dit que le compteur n’est pas réglable (§16)'
      )
      check(
        (await page.locator('input[name="current_value"]').count()) === 0,
        'Et il n’en propose aucun champ'
      )

      // L'aperçu doit correspondre au format enregistré : un aperçu menteur
      // vaut moins qu'un aperçu absent.
      const { data: rules } = await admin
        .from('numbering_rules')
        .select('label, prefix, separator, padding, include_year, current_value, current_year')
        .eq('entity_key', 'client')
        .single()

      const attendu = `${rules.prefix}${rules.separator}${String(rules.current_value + 1).padStart(rules.padding, '0')}`
      check(
        text.includes(attendu),
        'L’aperçu reprend exactement le format enregistré',
        attendu
      )

      await context.close()
    }

    {
      const numerotation = await session('numerotation')
      const lecteur = await session('lecteur')

      // Le format se modifie — DEC-005 le veut paramétrable.
      const format = await numerotation
        .from('numbering_rules')
        .update({ prefix: `Z${STAMP.slice(-3)}` }, { count: 'exact' })
        .eq('entity_key', RULE)
      check(
        !format.error && format.count === 1,
        'settings.numbering.update modifie bien un format',
        format.error ? String(format.error.message).slice(0, 60) : ''
      )

      // Le compteur, non — et c'est vrai même avec la capacité.
      const compteur = await numerotation
        .from('numbering_rules')
        .update({ current_value: 0 }, { count: 'exact' })
        .eq('entity_key', RULE)
      check(
        refused(compteur),
        'Mais il ne remet PAS un compteur en arrière (§16)',
        why(compteur)
      )

      const exercice = await numerotation
        .from('numbering_rules')
        .update({ current_year: 1999 }, { count: 'exact' })
        .eq('entity_key', RULE)
      check(refused(exercice), 'Ni l’exercice d’une numérotation', why(exercice))

      // Sans la capacité, rien.
      const sansDroit = await lecteur
        .from('numbering_rules')
        .update({ prefix: 'XXX' }, { count: 'exact' })
        .eq('entity_key', RULE)
      check(
        refused(sansDroit),
        'Sans settings.numbering.update, aucun format ne bouge',
        why(sansDroit)
      )

      // Et la lecture non plus n'est pas ouverte à tous.
      const lecture = await lecteur.from('numbering_rules').select('prefix').limit(1)
      check(
        (lecture.data ?? []).length === 0,
        'La lecture des formats exige elle aussi sa capacité (DEC-024)'
      )
    }

    /* ================== 6. LOGO (§6, §39) ================================= */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6. Le logo suit l’identité visuelle (§6, §39, CLAUDE.md §33)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.visuel)
      await page.goto(`${base}/parametres`, { waitUntil: 'load' })
      const text = await mainText(page)

      check(text.includes('Logo officiel'), 'La section Logo est présente')
      check(
        (await page.locator('input[type="file"][name="logo"]').count()) === 1,
        'Avec settings.branding.update, le dépôt est proposé'
      )
      check(
        text.includes('sans redimensionnement ni recadrage'),
        'L’écran énonce que le fichier n’est jamais transformé (CLAUDE.md §33)'
      )
      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.redacteur)
      await page.goto(`${base}/parametres`, { waitUntil: 'load' })
      check(
        (await page.locator('input[type="file"][name="logo"]').count()) === 0,
        'Sans elle, le dépôt n’est pas proposé'
      )
      check(
        (await mainText(page)).includes('Consultation seule — remplacer le logo'),
        'Et l’écran dit pourquoi'
      )
      await context.close()
    }

    {
      // Le bucket est privé : il ne se lit pas sans passer par l'application.
      const anon = createClient(url, anonKey, { auth: { persistSession: false } })
      const direct = await anon.storage.from('branding').list()
      check(
        Boolean(direct.error) || (direct.data ?? []).length === 0,
        'Le stockage du logo ne se parcourt pas sans compte',
        direct.error ? String(direct.error.message).slice(0, 50) : `${direct.data?.length} objet(s)`
      )
    }

    /* ================== 7. AUDIT (§43) ==================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7. Les modifications sont journalisées (§43)\n')

    {
      const { count: journalisees } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'company_settings')
        .in('actor_id', Object.values(accounts).map((a) => a.id))

      check(
        (journalisees ?? 0) >= 4,
        'Chaque écriture des paramètres laisse une trace',
        `${journalisees} événement(s)`
      )

      const { count: numerotees } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'numbering_rules')
        .eq('actor_id', accounts.numerotation.id)

      check(
        (numerotees ?? 0) >= 1,
        'Un changement de format aussi',
        `${numerotees} événement(s)`
      )
    }

    /* ================== 8. NON-RÉGRESSION ================================= */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8. Non-régression — le lot ne referme rien d’autre\n')

    {
      const { context, page } = await signIn(browser, base, accounts.lecteur)

      // `company_profile` alimente l'en-tête des documents et doit rester
      // lisible par TOUT compte : le lot en a retiré les droits de table.
      const profil = await (await session('sans_acces'))
        .from('company_profile')
        .select('legal_name, city, logo_path')
        .maybeSingle()
      check(
        !profil.error && Boolean(profil.data),
        'La vue publique reste lisible par tout compte (en-tête des documents)',
        profil.error ? String(profil.error.message).slice(0, 60) : ''
      )

      await page.goto(`${base}/tableau-de-bord`, { waitUntil: 'load' })
      check(!page.url().includes('/acces-refuse'), 'Le tableau de bord s’ouvre toujours')
      await context.close()

      const { count: catalogue } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
      check(catalogue === 170, 'Catalogue à 170 capacités', String(catalogue))

      const { count: settingsCaps } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
        .like('code', 'settings.%')
      check(settingsCaps === 9, 'Neuf capacités de paramètres, pas une de plus', String(settingsCaps))
    }

    /* ================== 9. RESPONSIVE ===================================== */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9. Responsive (§51, CLAUDE.md §35)\n')

    {
      const formats = [
        [390, 844, 'mobile'],
        [820, 1180, 'tablette'],
        [1440, 900, 'desktop'],
      ]

      const { context, page } = await signIn(browser, base, accounts.banque)

      for (const [route, libelle] of [
        ['/parametres?onglet=entreprise', 'Entreprise'],
        ['/parametres?onglet=numerotation', 'Numérotation'],
      ]) {
        for (const [width, height, format] of formats) {
          await page.setViewportSize({ width, height })
          await page.goto(`${base}${route}`, { waitUntil: 'load' })

          const debordement = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          )
          check(
            debordement <= 1,
            `${libelle} · ${format} : aucun défilement horizontal`,
            `${width} px · débordement ${debordement} px`
          )
        }
      }

      // §51 : sur mobile, les sections restent des blocs verticaux lisibles.
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${base}/parametres`, { waitUntil: 'load' })
      const mobile = await mainText(page)
      check(
        mobile.includes('Identité') && mobile.includes('Coordonnées'),
        'Entreprise · mobile : les sections restent lisibles'
      )

      await context.close()
    }
  } finally {
    await browser.close()
    for (const client of Object.values(sessions)) await client.auth.signOut()

    /*
     * RESTITUTION DE LA CONFIGURATION RÉELLE.
     *
     * Il n'existe qu'une ligne de paramètres, et c'est celle d'ADIKOM : la
     * recette la remet EXACTEMENT dans l'état où elle l'a trouvée, colonne par
     * colonne, avant même de supprimer ses comptes.
     */
    const leftovers = []

    if (snapshot) {
      const { id: _ignored, ...columns } = snapshot
      const { error } = await admin.from('company_settings').update(columns).eq('id', true)
      if (error) leftovers.push(`configuration non restituée : ${error.message}`)
      else {
        const { data: after } = await admin
          .from('company_settings')
          .select(ALL_COLUMNS)
          .eq('id', true)
          .single()
        const divergent = Object.keys(columns).filter(
          (key) => String(after?.[key] ?? '') !== String(columns[key] ?? '')
        )
        if (divergent.length > 0) leftovers.push(`colonnes divergentes : ${divergent.join(', ')}`)
        else console.log(`\n${DIM}Configuration d’ADIKOM restituée à l’identique.${RESET}`)
      }
    }

    if (ruleSnapshot) {
      const { entity_key, current_value: _v, current_year: _y, ...format } = ruleSnapshot
      const { error } = await admin
        .from('numbering_rules')
        .update(format)
        .eq('entity_key', entity_key)
      if (error) leftovers.push(`format ${entity_key} non restitué : ${error.message}`)
    }

    for (const account of Object.values(accounts)) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').update({ manager_id: null }).eq('manager_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    const { count: strayUsers } = await admin
      .from('app_users')
      .select('id', { count: 'exact', head: true })
      .like('username', `recette.set.%.${STAMP}`)
    if (strayUsers) leftovers.push(`app_users : ${strayUsers}`)

    if (leftovers.length > 0) {
      failed += 1
      console.log(`\n${RED}Résidus de recette non supprimés — ${leftovers.join(' · ')}${RESET}`)
    } else {
      console.log(`${DIM}Comptes de recette supprimés. Données DEMO intactes.${RESET}`)
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE PARAMÈTRES : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE PARAMÈTRES : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
