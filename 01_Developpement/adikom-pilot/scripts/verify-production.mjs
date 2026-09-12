/**
 * Recette de production — par le HTML SERVI, sans navigateur.
 *
 * POURQUOI CETTE FORME
 *
 * Les écrans d'ADIKOM PILOT sont rendus par le SERVEUR : le texte, les onglets,
 * les chiffres et les refus sont dans le HTML avant qu'aucun script ne
 * s'exécute. Les lire suffit donc à éprouver ce que la production répond.
 *
 * Le poste de recette n'atteignait plus les fichiers statiques de Vercel — une
 * police de 35 Ko en plus de trente secondes, un morceau de 150 Ko jamais
 * complet — et le navigateur piloté ne pouvait plus ouvrir une page. Le serveur,
 * lui, répondait. Cette recette interroge donc ce qui répond.
 *
 * La session est celle d'un vrai compte : le jeton est obtenu de Supabase, puis
 * posé dans le cookie que `@supabase/ssr` attend. RLS et les capacités
 * s'appliquent donc exactement comme pour un utilisateur.
 */

import { createClient } from '@supabase/supabase-js'

import { loadEnvFile, required } from './lib/env.mjs'
import { catalogueSize, checkCatalogue } from './lib/capabilities.mjs'

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

loadEnvFile()

const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'
const url = required('NEXT_PUBLIC_SUPABASE_URL')
const anon = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const ref = new URL(url).hostname.split('.')[0]

const STAMP = Date.now().toString().slice(-6)
const MARK = `RECETTE PROD ${STAMP}`

const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

const COMPLET = [
  'dashboard.view', 'dashboard.fleet.view', 'dashboard.financial.view',
  'parties.clients.view', 'parties.clients.download', 'parties.clients.print',
  'parties.clients.pricing.view',
  'parties.suppliers.view', 'parties.suppliers.download', 'parties.suppliers.print',
  'parties.partners.view', 'parties.partners.download', 'parties.partners.print',
  'rental.reservations.view', 'rental.reservations.download', 'rental.reservations.print',
  'rental.rentals.view', 'rental.rentals.financial.view',
  'rental.rentals.download', 'rental.rentals.print',
  'rental.fleet.view', 'rental.categories.view', 'rental.pricing.view',
  'rental.maintenance.view', 'rental.maintenance.cost.view',
  'rental.incidents.view', 'rental.documents.view',
  'billing.customer_invoices.view', 'billing.customer_invoices.download',
  'billing.customer_invoices.print', 'billing.customer_payments.view',
  'billing.supplier_invoices.view', 'billing.supplier_invoices.download',
  'billing.supplier_invoices.print', 'billing.supplier_payments.view',
  'billing.imputations.view',
  'billing.misc_payments.view', 'billing.misc_payments.download',
  'billing.misc_payments.print',
  'treasury.accounts.view', 'treasury.balances.view', 'treasury.entries.view',
  'projects.view', 'projects.actions.view',
  'billing.misc_payments.create',
  'users.users.view', 'users.audit.view',
]

const PILOTE = ['dashboard.view', 'dashboard.fleet.view', 'dashboard.financial.view']

async function createProfile(key, codes) {
  const username = `recette.prod.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-prod-${STAMP}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error) throw new Error(`compte ${key} : ${error.message}`)

  const id = created.user.id
  const { error: pe } = await admin.from('app_users').insert({
    id, first_name: 'Recette', last_name: `Production ${key}`, username, email, status: 'ACTIVE',
  })
  if (pe) throw new Error(`profil ${key} : ${pe.message}`)

  const { data: catalog } = await admin.from('permissions').select('id, code').in('code', codes)
  if ((catalog ?? []).length !== codes.length) {
    const found = new Set((catalog ?? []).map((p) => p.code))
    throw new Error(`catalogue incomplet : ${codes.filter((c) => !found.has(c)).join(', ')}`)
  }
  await admin.from('user_permissions').insert(
    catalog.map((p) => ({ user_id: id, permission_id: p.id, effect: 'ALLOW' }))
  )

  return { id, email, password }
}

/**
 * Le cookie de session, tel que `@supabase/ssr` l'écrit.
 *
 * Il est découpé en tranches de 3 180 octets au-delà de cette taille : le
 * serveur les recolle dans l'ordre des suffixes.
 */
function sessionCookies(session) {
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const name = `sb-${ref}-auth-token`
  const size = 3180

  if (value.length <= size) return [`${name}=${value}`]

  const parts = []
  for (let i = 0; i * size < value.length; i += 1) {
    parts.push(`${name}.${i}=${value.slice(i * size, (i + 1) * size)}`)
  }
  return parts
}

/**
 * Les lectures qui n'ont jamais abouti — le lien, pas l'application.
 *
 * Une lecture abandonnée rend un corps VIDE. Les contrôles qui cherchent un
 * libellé dedans échouent alors comme si l'écran avait perdu son contenu, et
 * l'on part chercher un défaut là où il n'y en a pas. La liste ci-dessous est
 * rappelée à la fin de la recette pour que l'aléa de transport se distingue
 * d'une panne du SaaS.
 */
const interrupted = []

/**
 * Une lecture, réessayée : un lien lointain n'est pas un défaut du SaaS.
 *
 * La recette s'exécute contre la production, à travers l'internet. Une coupure
 * de transfert y arrive, et l'abandon au premier essai ferait passer un aléa de
 * réseau pour une panne applicative. Trois essais, puis l'échec — nommé.
 */
async function get(path, cookies, attempts = 3) {
  let last = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { Cookie: cookies.join('; '), 'User-Agent': 'ADIKOM-recette' },
        redirect: 'manual',
        signal: AbortSignal.timeout(90000),
      })
      const body = response.status < 300 ? await response.text() : ''
      return { status: response.status, body, location: response.headers.get('location') }
    } catch (error) {
      last = error
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }

  const reason = last?.message ?? 'lecture impossible'
  interrupted.push(`${path} — ${reason}`)
  return { status: 0, body: '', location: null, error: reason }
}

/** Le texte d'une page, balises retirées et entités les plus courantes rendues. */
function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    // L'apostrophe TYPOGRAPHIQUE, ramenée à la droite : l'interface écrit
    // « d’exploitation », les motifs de cette recette « d'exploitation ». Sans
    // cette normalisation, un contrôle échouerait sur un signe de ponctuation.
    .replace(/[‘’]/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
}

const accounts = {}

try {
  console.log(`\nCible : ${base}${DIM} — par le HTML servi${RESET}\n`)

  accounts.complet = await createProfile('complet', COMPLET)
  accounts.pilote = await createProfile('pilote', PILOTE)

  const sessions = {}
  for (const [key, account] of Object.entries(accounts)) {
    const client = createClient(url, anon, { auth: { persistSession: false } })
    const { data, error } = await client.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    })
    if (error) throw new Error(`session ${key} : ${error.message}`)
    sessions[key] = sessionCookies(data.session)
  }

  const [{ data: client }, { data: supplier }, { data: partner }, { data: vehicle }] =
    await Promise.all([
      admin.from('clients').select('id').like('legal_name', '%DEMO%').limit(1).maybeSingle(),
      admin.from('suppliers').select('id').like('legal_name', '%DEMO%').limit(1).maybeSingle(),
      admin.from('partners').select('id').like('legal_name', '%DEMO%').limit(1).maybeSingle(),
      admin.from('vehicles').select('id').like('model', '%DEMO%').limit(1).maybeSingle(),
    ])
  const [{ data: reservation }, { data: rental }, { data: invoice }, { data: supInvoice }] =
    await Promise.all([
      admin.from('reservations').select('id').limit(1).maybeSingle(),
      admin.from('rentals').select('id').limit(1).maybeSingle(),
      admin.from('customer_invoices').select('id').limit(1).maybeSingle(),
      admin.from('supplier_invoices').select('id').limit(1).maybeSingle(),
    ])
  const { data: misc } = await admin
    .from('misc_payments').select('id, direction').eq('direction', 'IN').limit(1).maybeSingle()

  /* ================================================================== */
  console.log('──────────────────────────────────────────────────────────────')
  console.log('1 — LA SESSION EST RECONNUE PAR LA PRODUCTION\n')

  const board = await get('/tableau-de-bord', sessions.complet)
  check(board.status === 200, 'Le tableau de bord répond à un compte authentifié', `${board.status}`)

  const anonymous = await get('/tableau-de-bord', [])
  check(
    anonymous.status >= 300 && /connexion/.test(anonymous.location ?? ''),
    'Un visiteur sans session est renvoyé à la connexion',
    `${anonymous.status} → ${anonymous.location}`
  )

  /* ================================================================== */
  console.log('\n──────────────────────────────────────────────────────────────')
  console.log('2 — TABLEAU DE BORD : LES CHIFFRES SANS LES MODULES (DEC-042 §a)\n')

  const pilot = await get('/tableau-de-bord', sessions.pilote)
  const pilotText = text(pilot.body)

  for (const label of [
    'Locations en cours', 'Retours en retard', 'À contrôler', 'À facturer',
    'Réservations à venir', 'Nouveaux clients', 'Nouvelles locations',
  ]) {
    check(pilotText.includes(label), `« ${label} » figure sur le tableau de bord du pilote`)
  }

  const values = [...pilot.body.matchAll(/data-kpi-value="(\d+)"/g)].map((m) => m[1])
  check(values.length >= 12, 'Douze indicateurs au moins portent une valeur', `${values.length}`)
  check(!pilotText.includes('Non accessible'), 'Aucun « Non accessible » ne subsiste')
  check(!/LOC-\d/.test(pilotText), 'Aucune référence de contrat ne transparaît')

  /* ================================================================== */
  console.log('\n──────────────────────────────────────────────────────────────')
  console.log('3 — AUCUNE RÉFÉRENCE DE DOCUMENTATION (DEC-042 §h)\n')

  const PAGES = [
    ['/tableau-de-bord', 'Tableau de bord'],
    ['/projets/actions', 'Actions'],
    [`/tiers/clients/${client.id}`, 'Fiche client'],
    [`/tiers/fournisseurs/${supplier.id}`, 'Fiche fournisseur'],
    [`/tiers/partenaires/${partner.id}`, 'Fiche partenaire'],
    [`/location/parc/${vehicle.id}`, 'Fiche véhicule'],
    ['/location/tarification', 'Tarification'],
    [`/location/reservations/${reservation.id}`, 'Fiche réservation'],
    [`/location/locations/${rental.id}`, 'Fiche location'],
    ['/facturation/clients', 'Factures clients'],
    [`/facturation/clients/${invoice.id}`, 'Fiche facture client'],
    [`/facturation/fournisseurs/${supInvoice.id}`, 'Fiche facture fournisseur'],
    ['/facturation/paiements-divers', 'Paiements divers'],
    ['/facturation/paiements-divers/nouveau', 'Nouveau paiement divers'],
    ['/tresorerie/comptes', 'Comptes'],
  ]

  const pages = new Map()
  let clean = 0
  for (const [path, label] of PAGES) {
    const page = await get(path, sessions.complet)
    pages.set(path, text(page.body))
    const body = pages.get(path)

    if (page.status !== 200) {
      check(false, `${label} répond`, `${page.status}`)
      continue
    }
    // « §43 » n'est pas la seule forme : la documentation se cite aussi par
    // « Workflow 08 » ou « Module 01 », sans le signe. Une description de carte
    // portant « (Workflow 08) » a franchi un premier balayage qui ne cherchait
    // que le §. Le motif couvre désormais les trois formes.
    const found = /§|\bWorkflow\s+\d+|\bModule\s+\d+|\bDEC-\d{3}\b|CLAUDE\.md/.exec(body)
    if (found) check(false, `${label} porte une référence interne`, found[0])
    else clean += 1
  }
  check(clean === PAGES.length, `Les ${PAGES.length} pages parcourues sont nettes`, `${clean}/${PAGES.length}`)

  /* ================================================================== */
  console.log('\n──────────────────────────────────────────────────────────────')
  console.log('4 — PLUS AUCUN ONGLET « À VENIR » (DEC-042 §d, §e)\n')

  for (const [path, label, tabs] of [
    [`/tiers/clients/${client.id}`, 'Fiche client', ['Réservations', 'Locations', 'Documents', 'Historique']],
    [`/tiers/fournisseurs/${supplier.id}`, 'Fiche fournisseur', ['Documents']],
    [`/tiers/partenaires/${partner.id}`, 'Fiche partenaire', ['Projets', 'Documents', 'Historique']],
    [`/location/locations/${rental.id}`, 'Fiche location', ['Historique']],
    [`/location/parc/${vehicle.id}`, 'Fiche véhicule', ['Locations', 'Rentabilité']],
    ['/location/tarification', 'Tarification', ['Tarifs préférentiels']],
  ]) {
    const body = pages.get(path)
    check(!/à venir/i.test(body), `${label} : aucun onglet « à venir »`)
    for (const tab of tabs) check(body.includes(tab), `${label} : l’onglet « ${tab} » est là`)
  }

  const profit = text((await get(`/location/parc/${vehicle.id}?onglet=rentabilite`, sessions.complet)).body)
  check(/Marge d'exploitation/.test(profit), 'Véhicule → Rentabilité : la marge est calculée')
  check(
    /n'est pas une rentabilité complète/i.test(profit),
    'Et l’écran DIT que ce n’est pas une rentabilité complète'
  )

  const preferential = text((await get('/location/tarification?onglet=preferentiels', sessions.complet)).body)
  check(
    /Conditions consenties aux clients/.test(preferential),
    'Tarification → Tarifs préférentiels : les conditions s’ouvrent'
  )

  const history = text((await get(`/location/locations/${rental.id}?onglet=historique`, sessions.complet)).body)
  check(/Historique/.test(history), 'Location → Historique : le journal de la fiche s’ouvre')

  /* ================================================================== */
  console.log('\n──────────────────────────────────────────────────────────────')
  console.log('5 — BARRES D’ACTIONS ET DOCUMENTS PRODUITS (DEC-042 §c)\n')

  for (const [path, type, id, label] of [
    [`/location/reservations/${reservation.id}`, 'reservations', reservation.id, 'Réservation'],
    [`/facturation/clients/${invoice.id}`, 'factures-clients', invoice.id, 'Facture client'],
    [`/facturation/fournisseurs/${supInvoice.id}`, 'factures-fournisseurs', supInvoice.id, 'Facture fournisseur'],
    [`/facturation/paiements-divers/${misc.id}`, 'paiements-divers', misc.id, 'Paiement divers'],
  ]) {
    const body = pages.get(path) ?? text((await get(path, sessions.complet)).body)
    check(
      /Aperçu/.test(body) && /Télécharger PDF/.test(body) && /Imprimer/.test(body),
      `${label} : la barre d’actions est complète`
    )

    let produced = null
    for (let attempt = 1; attempt <= 3 && produced === null; attempt += 1) {
      try {
        const response = await fetch(`${base}/api/documents/${type}/${id}?mode=download`, {
          headers: { Cookie: sessions.complet.join('; ') },
          signal: AbortSignal.timeout(120000),
        })
        const buffer = Buffer.from(await response.arrayBuffer())
        produced = { status: response.status, size: buffer.length, pdf: buffer.subarray(0, 4).toString() }
      } catch (error) {
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt))
        else interrupted.push(`/api/documents/${type}/${id} — ${error.message}`)
      }
    }

    check(
      produced?.status === 200 && produced.pdf === '%PDF',
      `${label} : le PDF est réellement produit`,
      produced ? `${produced.status}, ${produced.size} octets` : 'lecture impossible'
    )
  }

  /* ================================================================== */
  console.log('\n──────────────────────────────────────────────────────────────')
  console.log('6 — LE SENS D’UN PAIEMENT DIVERS (DEC-042 §b)\n')

  const miscPage = text((await get(`/facturation/paiements-divers/${misc.id}`, sessions.complet)).body)
  check(/Encaissement/.test(miscPage), 'La fiche d’un encaissement porte son sens')
  check(/Payeur/.test(miscPage), 'Le tiers y est un « Payeur », non un bénéficiaire')
  check(/crédité/.test(miscPage), 'Le bandeau parle de compte CRÉDITÉ')
  check(!/Le compte est débité/.test(miscPage), 'Et jamais de compte débité')

  const form = pages.get('/facturation/paiements-divers/nouveau')
  check(/Sens/.test(form), 'Le formulaire de saisie demande le sens')
  check(/Encaissement/.test(form) && /Décaissement/.test(form), 'Les deux sens y sont proposés')

  const list = pages.get('/facturation/paiements-divers')
  check(/Encaissement/.test(list), 'La liste distingue les encaissements')

  /* ================================================================== */
  console.log('\n──────────────────────────────────────────────────────────────')
  console.log('7 — LE CHAMP DÉROULANT DE L’APPLICATION EST SERVI (DEC-042 §f)\n')

  const raw = (await get('/facturation/paiements-divers/nouveau', sessions.complet)).body
  check(/role="combobox"/.test(raw), 'Le déclencheur de liste est rendu par le serveur')
  check(/data-select-for="direction"/.test(raw), 'Il désigne le champ qu’il ouvre')
  check(
    /<select[^>]*name="direction"/.test(raw),
    'Le `<select>` natif demeure : le formulaire enverra bien le champ'
  )
  check(
    /pointer-events-none/.test(raw),
    'Et il est hors d’atteinte du pointeur : le système n’ouvre pas sa fenêtre'
  )

  /* ================================================================== */
  console.log('\n──────────────────────────────────────────────────────────────')
  console.log('8 — LE CATALOGUE, VU DE LA PRODUCTION\n')

  // Le catalogue déployé est comparé au code, code par code (DEC-046) : un total
  // écrit en dur ne disait pas QUELLE capacité manquait, et laissait passer un
  // échange — une créée, une disparue.
  await checkCatalogue(admin, check, 'Catalogue conforme au code déployé')

  /*
   * LA PAGE PUBLIQUE ANNONCE LE CATALOGUE RÉEL.
   *
   * Le nombre attendu vient de la base, et non de cette recette : la page le
   * dérive elle-même du catalogue typé, dont la parité avec les migrations est
   * garantie par `permissions.test.ts`. Les trois sources doivent dire la même
   * chose — et si elles divergent, c'est le déploiement qui est en retard.
   */
  const total = await catalogueSize(admin)
  const home = await get('/', [])
  const homeText = text(home.body)
  check(
    new RegExp(`${total}\\s*capacités attribuables`).test(homeText),
    'La page publique annonce le catalogue réel',
    `${total} capacités`
  )
} catch (error) {
  console.log(`\n${RED}Recette interrompue : ${error.message}${RESET}`)
  failed += 1
} finally {
  console.log('\n──────────────────────────────────────────────────────────────')
  for (const account of Object.values(accounts)) {
    await admin.from('user_permissions').delete().eq('user_id', account.id)
    await admin.from('app_users').delete().eq('id', account.id)
    await admin.auth.admin.deleteUser(account.id)
  }

  const { count: left } = await admin
    .from('app_users')
    .select('id', { count: 'exact', head: true })
    .like('username', 'recette.prod.%')

  if ((left ?? 0) > 0) {
    console.log(`${RED}RÉSIDUS : ${left} compte(s) de recette.${RESET}`)
    failed += 1
  } else {
    console.log(`${DIM}Comptes de recette supprimés. ${MARK}${RESET}`)
  }

  if (interrupted.length > 0) {
    console.log(`\n${RED}LIENS INTERROMPUS — ${interrupted.length} lecture(s) n’ont jamais abouti :${RESET}`)
    for (const line of interrupted) console.log(`  ${line}`)
    console.log(
      `${DIM}Les contrôles portant sur ces pages ont lu un corps vide : ils disent le` +
        ` transport, pas le SaaS. Rejouer la recette avant de conclure.${RESET}`
    )
  }

  if (failed === 0) {
    console.log(`\n${GREEN}RECETTE DE PRODUCTION : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`\n${RED}RECETTE DE PRODUCTION : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}
