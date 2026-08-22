#!/usr/bin/env node
/**
 * Recette sécurité et production du moteur documentaire — ADIKOM PILOT.
 *
 * Deux questions, également nécessaires :
 *
 *   1. DEC-024 tient-elle sur le terrain ? Consulter, exporter, télécharger et
 *      imprimer sont quatre capacités distinctes ; refuser l'une doit bloquer
 *      la route, pas seulement masquer un bouton.
 *
 *   2. Les fichiers produits sont-ils RÉELLEMENT exploitables ? Un HTTP 200 ne
 *      prouve rien. Chaque PDF est donc vérifié jusqu'à sa signature, sa
 *      structure et son nombre de pages ; chaque classeur est RELU avec
 *      ExcelJS — feuille, en-tête, colonnes, lignes.
 *
 * Les comptes de recette sont fabriqués puis supprimés. Les données DEMO ne
 * sont jamais modifiées : elles servent uniquement de sujets.
 *
 * Utilisation :
 *   node scripts/verify-documents.mjs [url]
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

function ok(label, detail = '') {
  passed += 1
  console.log(`  ${GREEN}[OK]${RESET} ${label}${detail ? ` ${DIM}— ${detail}${RESET}` : ''}`)
}

function ko(label, detail = '') {
  failed += 1
  console.log(`  ${RED}[ÉCHEC]${RESET} ${label}${detail ? ` — ${detail}` : ''}`)
}

const STAMP = Date.now().toString().slice(-6)

/* -------------------------------------------------------------------------- */
/*  Contrôle réel des fichiers                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Un PDF est-il un vrai PDF ?
 *
 * Signature `%PDF-`, marqueur de fin `%%EOF`, au moins un objet page. Un
 * fichier tronqué, un message d'erreur renommé ou une page blanche produite par
 * une police manquante échouent ici — pas au contrôle du code HTTP.
 */
function inspectPdf(body) {
  const head = body.subarray(0, 8).toString('latin1')
  const tail = body.subarray(-1024).toString('latin1')
  const text = body.toString('latin1')

  const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  // Les polices embarquées portent leur nom dans le fichier : leur absence
  // signalerait un repli silencieux sur Helvetica.
  const embedsFonts = /Montserrat|Inter/.test(text)

  return {
    signature: head.startsWith('%PDF-'),
    version: head.slice(0, 8).trim(),
    complete: tail.includes('%%EOF'),
    pages,
    embedsFonts,
    size: body.byteLength,
  }
}

/** Un XLSX est-il relisible par un tableur ? */
async function inspectXlsx(body) {
  const workbook = new ExcelJS.Workbook()
  // `load` refuse une archive malformée : c'est l'équivalent d'un double-clic.
  await workbook.xlsx.load(body)

  const sheet = workbook.worksheets[0]
  if (!sheet) return { readable: false }

  const headers = []
  sheet.getRow(3).eachCell((cell) => headers.push(String(cell.value ?? '')))

  return {
    readable: true,
    sheet: sheet.name,
    title: String(sheet.getCell(1, 1).value ?? ''),
    headers,
    // Lignes 1 à 3 : titre, horodatage, en-tête. Le reste, ce sont les données.
    rows: Math.max(0, sheet.rowCount - 3),
    size: body.byteLength,
  }
}

/* -------------------------------------------------------------------------- */
/*  Profils de permissions                                                     */
/* -------------------------------------------------------------------------- */

/** Matrice DEC-024 appliquée aux documents, sur le module Clients. */
const DOCUMENT_PROFILES = [
  {
    key: 'view',
    title: 'CAS 1 — VIEW seul',
    permissions: ['parties.clients.view'],
    expected: { preview: 403, download: 403, print: 403 },
  },
  {
    key: 'download',
    title: 'CAS 2 — VIEW + DOWNLOAD',
    permissions: ['parties.clients.view', 'parties.clients.download'],
    expected: { preview: 200, download: 200, print: 403 },
  },
  {
    key: 'print',
    title: 'CAS 3 — VIEW + PRINT',
    permissions: ['parties.clients.view', 'parties.clients.print'],
    expected: { preview: 200, download: 403, print: 200 },
  },
  {
    key: 'full',
    title: 'CAS 4 — VIEW + DOWNLOAD + PRINT',
    permissions: ['parties.clients.view', 'parties.clients.download', 'parties.clients.print'],
    expected: { preview: 200, download: 200, print: 200 },
  },
  {
    key: 'orphan',
    title: 'CAS 5 — DOWNLOAD sans VIEW',
    // Capacité documentaire sans droit de consulter : refusée. Une capacité
    // transversale ne crée pas d'accès à une ressource.
    permissions: ['parties.clients.download'],
    expected: { preview: 403, download: 403, print: 403 },
  },
  {
    key: 'none',
    title: 'CAS 6 — aucune permission',
    permissions: [],
    expected: { preview: 403, download: 403, print: 403 },
  },
]

/** Matrice DEC-024 appliquée aux exports, sur le module Clients. */
const EXPORT_PROFILES = [
  {
    key: 'xview',
    title: 'CAS 1 — VIEW seul',
    permissions: ['parties.clients.view'],
    expected: 403,
  },
  {
    key: 'xexport',
    title: 'CAS 2 — VIEW + EXPORT',
    permissions: ['parties.clients.view', 'parties.clients.export'],
    expected: 200,
  },
  {
    key: 'xorphan',
    title: 'CAS 3 — EXPORT sans VIEW',
    permissions: ['parties.clients.export'],
    expected: 403,
  },
  {
    key: 'xnone',
    title: 'CAS 4 — aucune permission',
    permissions: [],
    expected: 403,
  },
]

/* -------------------------------------------------------------------------- */
/*  Comptes de recette                                                         */
/* -------------------------------------------------------------------------- */

async function createProfile(admin, profile) {
  const username = `recette.doc.${profile.key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-doc-${STAMP}`

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
    last_name: `Document ${profile.key}`,
    username,
    email,
    status: 'ACTIVE',
  })

  if (profileError) throw new Error(`profil ${profile.key} : ${profileError.message}`)

  if (profile.permissions.length > 0) {
    const { data: catalog } = await admin
      .from('permissions')
      .select('id, code')
      .in('code', profile.permissions)

    if ((catalog ?? []).length !== profile.permissions.length) {
      throw new Error(
        `catalogue incomplet pour ${profile.key} : ` +
          `${(catalog ?? []).length}/${profile.permissions.length} permission(s) trouvée(s)`
      )
    }

    const { error: grantError } = await admin.from('user_permissions').insert(
      catalog.map((permission) => ({
        user_id: id,
        permission_id: permission.id,
        effect: 'ALLOW',
      }))
    )

    if (grantError) throw new Error(`permissions ${profile.key} : ${grantError.message}`)
  }

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

/* -------------------------------------------------------------------------- */
/*  Recette                                                                    */
/* -------------------------------------------------------------------------- */

async function main() {
  loadEnvFile()

  const base = process.argv[2] ?? 'https://adikom-pilot.vercel.app'

  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  console.log(`\nCible : ${base}\n`)

  // --- Sujets : les données DEMO, jamais modifiées --------------------------
  const [{ data: client }, { data: supplier }, { data: partner }, { data: vehicles }] =
    await Promise.all([
      admin.from('clients').select('id, client_no, legal_name').eq('legal_name', 'CLIENT DEMO 01').maybeSingle(),
      admin.from('suppliers').select('id, supplier_no, legal_name').eq('legal_name', 'FOURNISSEUR DEMO 01').maybeSingle(),
      admin.from('partners').select('id, partner_no, legal_name').eq('legal_name', 'PARTENAIRE DEMO 01').maybeSingle(),
      admin.from('vehicles').select('id, vehicle_no, brand, model').like('vehicle_no', 'VEH-%').order('vehicle_no').limit(3),
    ])

  const missing = []
  if (!client) missing.push('CLIENT DEMO 01')
  if (!supplier) missing.push('FOURNISSEUR DEMO 01')
  if (!partner) missing.push('PARTENAIRE DEMO 01')
  if (!vehicles || vehicles.length === 0) missing.push('un véhicule')

  if (missing.length > 0) {
    console.error(`\n✖ Sujets introuvables : ${missing.join(', ')}. Lancer \`npm run demo:seed\`.\n`)
    process.exit(1)
  }

  console.log(`${DIM}Sujets : ${client.client_no} · ${supplier.supplier_no} · ${partner.partner_no} · ${vehicles.map((v) => v.vehicle_no).join(', ')}${RESET}`)

  /** Un document par type, sur un sujet réel. La grille n'a pas d'enregistrement. */
  const DOCUMENTS = [
    { type: 'clients', id: client.id, label: `Fiche client ${client.client_no}` },
    { type: 'fournisseurs', id: supplier.id, label: `Fiche fournisseur ${supplier.supplier_no}` },
    { type: 'partenaires', id: partner.id, label: `Fiche partenaire ${partner.partner_no}` },
    ...vehicles.map((vehicle) => ({
      type: 'vehicules',
      id: vehicle.id,
      label: `Fiche véhicule ${vehicle.vehicle_no}`,
    })),
    { type: 'tarification', id: 'grille', label: 'Grille tarifaire' },
  ]

  const EXPORT_MODULES = [
    'clients',
    'fournisseurs',
    'partenaires',
    'parc',
    'categories',
    'tarification',
  ]

  const documentUrl = (type, id, mode) => `${base}/api/documents/${type}/${id}?mode=${mode}`
  const exportUrl = (module) => `${base}/api/exports/${module}`

  const accounts = []
  const browser = await chromium.launch()

  try {
    /* ------------------------------------- 0. Visiteur sans session ------- */
    console.log('\n0. Visiteur sans session')

    const anonymous = await browser.newContext()
    const anonPage = await anonymous.newPage()

    for (const [label, target] of [
      ['Document', documentUrl('clients', client.id, 'download')],
      ['Export', exportUrl('clients')],
    ]) {
      const response = await anonPage.request.get(target, { maxRedirects: 0 })
      const status = response.status()

      if ([302, 307, 401].includes(status)) ok(`${label} refusé sans session`, `HTTP ${status}`)
      else ko(`${label} refusé sans session`, `HTTP ${status}`)
    }
    await anonymous.close()

    /* --------------------- 1. DEC-024 — capacités documentaires ----------- */
    console.log(`\n${'─'.repeat(62)}`)
    console.log('DEC-024 — DOCUMENTS : consulter, télécharger et imprimer')

    for (const profile of DOCUMENT_PROFILES) {
      const account = await createProfile(admin, profile)
      accounts.push(account)

      console.log(`\n${profile.title}`)
      const { context, page } = await signIn(browser, base, account)

      for (const mode of ['preview', 'download', 'print']) {
        const expected = profile.expected[mode]
        const response = await page.request.get(documentUrl('clients', client.id, mode), {
          maxRedirects: 0,
        })
        const status = response.status()
        const type = response.headers()['content-type'] ?? ''
        const body = await response.body()

        if (status !== expected) {
          ko(`${mode} → attendu ${expected}`, `obtenu ${status}`)
          continue
        }

        if (expected === 200) {
          const pdf = inspectPdf(body)
          const disposition = response.headers()['content-disposition'] ?? ''
          const attached =
            mode === 'download' ? /attachment/.test(disposition) : /inline/.test(disposition)

          if (/pdf/i.test(type) && pdf.signature && pdf.complete && attached) {
            ok(`${mode} autorisé`, `${(pdf.size / 1024).toFixed(0)} Ko · ${disposition.split(';')[0]}`)
          } else {
            ko(`${mode} autorisé`, `type ${type}, signature ${pdf.signature}, fin ${pdf.complete}`)
          }
        } else {
          const leaked = body.subarray(0, 5).toString('latin1') === '%PDF-'
          if (leaked) ko(`${mode} refusé`, '*** UN PDF A ÉTÉ SERVI ***')
          else ok(`${mode} refusé`, `HTTP ${status}, aucun fichier`)
        }
      }

      await context.close()
    }

    /* ------------------------- 2. DEC-024 — capacité d'export ------------- */
    console.log(`\n${'─'.repeat(62)}`)
    console.log('DEC-024 — EXPORTS : consulter et exporter')

    for (const profile of EXPORT_PROFILES) {
      const account = await createProfile(admin, profile)
      accounts.push(account)

      console.log(`\n${profile.title}`)
      const { context, page } = await signIn(browser, base, account)

      const response = await page.request.get(exportUrl('clients'), { maxRedirects: 0 })
      const status = response.status()
      const body = await response.body()

      if (status !== profile.expected) {
        ko(`export → attendu ${profile.expected}`, `obtenu ${status}`)
      } else if (profile.expected === 200) {
        const xlsx = await inspectXlsx(body)
        if (xlsx.readable && xlsx.headers.length > 0) {
          ok('export autorisé', `${xlsx.sheet} · ${xlsx.headers.length} colonnes · ${(xlsx.size / 1024).toFixed(0)} Ko`)
        } else {
          ko('export autorisé', 'classeur illisible')
        }
      } else {
        // Un refus ne doit produire AUCUNE archive.
        const leaked = body.subarray(0, 2).toString('latin1') === 'PK'
        if (leaked) ko('export refusé', '*** UN CLASSEUR A ÉTÉ SERVI ***')
        else ok('export refusé', `HTTP ${status}, aucun fichier`)
      }

      await context.close()
    }

    /* ---------------- 3. Production réelle — tous les documents ----------- */
    console.log(`\n${'─'.repeat(62)}`)
    console.log('PRODUCTION RÉELLE — chaque document, chaque export')

    /*
     * Un compte doté de toutes les capacités du référentiel.
     *
     * `parties.clients.pricing.view` en fait partie à dessein : c'est ce droit
     * qui, en produisant une section tarifaire — garnie ou VIDE —, avait fait
     * échouer la fiche client en production le 22/08/2026, alors que tous les
     * comptes d'essai, dépourvus de cette permission, obtenaient leur PDF.
     */
    const allAccount = await createProfile(admin, {
      key: 'complet',
      permissions: [
        'parties.clients.view',
        'parties.clients.export',
        'parties.clients.download',
        'parties.clients.print',
        'parties.clients.pricing.view',
        'parties.suppliers.view',
        'parties.suppliers.export',
        'parties.suppliers.download',
        'parties.suppliers.print',
        'parties.suppliers.bank.view',
        'parties.partners.view',
        'parties.partners.export',
        'parties.partners.download',
        'parties.partners.print',
        'rental.fleet.view',
        'rental.fleet.export',
        'rental.fleet.download',
        'rental.fleet.print',
        'rental.categories.view',
        'rental.categories.export',
        'rental.pricing.view',
        'rental.pricing.export',
        'rental.pricing.download',
        'rental.pricing.print',
        'rental.documents.view',
      ],
    })
    accounts.push(allAccount)

    const { context, page } = await signIn(browser, base, allAccount)

    console.log('\nDocuments PDF')
    for (const document of DOCUMENTS) {
      const response = await page.request.get(documentUrl(document.type, document.id, 'download'), {
        maxRedirects: 0,
      })
      const status = response.status()

      if (status !== 200) {
        // Le corps porte le message fonctionnel ; le détail est au journal
        // serveur Vercel, où le diagnostic complet est écrit.
        const text = (await response.text()).slice(0, 160)
        ko(document.label, `HTTP ${status} — ${text}`)
        continue
      }

      const body = await response.body()
      const type = response.headers()['content-type'] ?? ''
      const disposition = response.headers()['content-disposition'] ?? ''
      const pdf = inspectPdf(body)

      const problems = []
      if (!/^application\/pdf/.test(type)) problems.push(`type ${type}`)
      if (!pdf.signature) problems.push('signature absente')
      if (!pdf.complete) problems.push('fichier tronqué')
      if (pdf.pages < 1) problems.push('aucune page')
      if (!pdf.embedsFonts) problems.push('polices non embarquées')
      if (pdf.size < 20_000) problems.push(`${pdf.size} octets`)
      if (!/attachment/.test(disposition)) problems.push('pas en pièce jointe')

      if (problems.length === 0) {
        ok(
          document.label,
          `${pdf.version} · ${pdf.pages} page(s) · ${(pdf.size / 1024).toFixed(0)} Ko · ${
            disposition.match(/filename="([^"]+)"/)?.[1] ?? '—'
          }`
        )
      } else {
        ko(document.label, problems.join(', '))
      }
    }

    console.log('\nExports Excel')
    for (const moduleKey of EXPORT_MODULES) {
      const response = await page.request.get(exportUrl(moduleKey), { maxRedirects: 0 })
      const status = response.status()

      if (status !== 200) {
        const text = (await response.text()).slice(0, 160)
        ko(`Export ${moduleKey}`, `HTTP ${status} — ${text}`)
        continue
      }

      const body = await response.body()
      const type = response.headers()['content-type'] ?? ''
      const disposition = response.headers()['content-disposition'] ?? ''

      let xlsx
      try {
        xlsx = await inspectXlsx(body)
      } catch (error) {
        ko(`Export ${moduleKey}`, `classeur illisible : ${error.message}`)
        continue
      }

      const problems = []
      if (!/spreadsheetml\.sheet/.test(type)) problems.push(`type ${type}`)
      if (!xlsx.readable) problems.push('aucune feuille')
      if (xlsx.headers.length === 0) problems.push('en-tête absent')
      if (!/attachment/.test(disposition)) problems.push('pas en pièce jointe')
      if (!/\.xlsx"/.test(disposition)) problems.push('extension inattendue')

      if (problems.length === 0) {
        ok(
          `Export ${moduleKey}`,
          `« ${xlsx.sheet} » · ${xlsx.headers.length} colonnes · ${xlsx.rows} ligne(s) · ${(xlsx.size / 1024).toFixed(0)} Ko`
        )
      } else {
        ko(`Export ${moduleKey}`, problems.join(', '))
      }
    }

    /* ---------------------- 4. Écrans opérationnels ----------------------- */
    console.log('\nÉcrans')
    for (const [label, path] of [
      ['Liste des partenaires', '/tiers/partenaires'],
      ['Fiche partenaire', `/tiers/partenaires/${partner.id}`],
    ]) {
      const response = await page.goto(`${base}${path}`, { waitUntil: 'load' })
      const status = response?.status() ?? 0
      const visible = await page.locator('h1').first().textContent()

      if (status === 200 && visible) ok(label, `« ${visible.trim()} »`)
      else ko(label, `HTTP ${status}`)
    }

    await context.close()

    /* --------------------------------- 5. Journal d'audit ---------------- */
    console.log(`\n${'─'.repeat(62)}`)
    console.log('JOURNAL D’AUDIT')

    const ids = accounts.map((account) => account.id)

    const { count: exported } = await admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'EXPORT')
      .in('actor_id', ids)

    // Documents : CAS 2 et CAS 4 téléchargent (2) + le compte complet télécharge
    // chaque document (DOCUMENTS.length). Exports : CAS 2 (1) + le compte
    // complet sur chaque module (EXPORT_MODULES.length).
    const expectedExports = 2 + DOCUMENTS.length + 1 + EXPORT_MODULES.length

    if (exported === expectedExports) {
      ok('Sorties de données journalisées', `${exported} entrée(s) EXPORT`)
    } else {
      ko('Sorties de données journalisées', `${exported} entrée(s), ${expectedExports} attendues`)
    }

    const { count: denied } = await admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'ACCESS_DENIED')
      .in('actor_id', ids)

    // Documents : CAS 1, 5 et 6 → 3 refus chacun ; CAS 2 et 3 → 1 refus chacun.
    // Exports : CAS 1, 3 et 4 → 1 refus chacun.
    const expectedDenied = 3 * 3 + 2 * 1 + 3

    if (denied === expectedDenied) {
      ok('Refus journalisés', `${denied} entrée(s) ACCESS_DENIED`)
    } else {
      ko('Refus journalisés', `${denied} entrée(s), ${expectedDenied} attendues`)
    }

    const { count: noisy } = await admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'EXPORT')
      .in('actor_id', ids)
      .ilike('reason', '%perçu%')

    if (!noisy) ok('L’aperçu ne pollue pas le journal')
    else ko('L’aperçu ne pollue pas le journal', `${noisy} entrée(s)`)
  } finally {
    await browser.close()

    for (const account of accounts) {
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    console.log(`\n${DIM}Comptes de recette supprimés. Données DEMO intactes.${RESET}`)
    console.log(`${DIM}Les entrées d'audit produites restent : le journal est immuable.${RESET}`)
  }

  console.log(`\n${'─'.repeat(62)}`)
  if (failed === 0) {
    console.log(`${GREEN}RECETTE DOCUMENTAIRE : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE DOCUMENTAIRE : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
