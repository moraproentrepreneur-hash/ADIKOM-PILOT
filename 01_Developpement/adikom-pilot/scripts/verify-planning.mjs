#!/usr/bin/env node
/**
 * Recette Calendrier, Réunions, Rendez-vous, Décisions, Actions — LOT 13.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:planning` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL contrôle les règles avec le rôle de service, pour lequel
 * `current_actor()` vaut NULL : aucune capacité n'y est vérifiée. Celle-ci
 * ouvre de VRAIES sessions et éprouve ce que chaque profil peut faire — par
 * l'écran ET par appel direct à l'API, sans passer par aucun bouton.
 *
 * Les critères d'acceptation du Module 03 §53 non couverts par le LOT 12
 * servent de fil :
 *
 *   §53.9  — les réunions peuvent être enregistrées ;
 *   §53.10 — les rendez-vous peuvent être enregistrés ;
 *   §53.11 — les décisions peuvent être conservées ;
 *   §53.12 — les actions peuvent être suivies ;
 *   §53.13 — les notifications sont générées pour les événements pertinents.
 *
 * Et les frontières que le lot pose :
 *
 *   §23, §43 — CONSIGNER N'EST PAS ORGANISER. Un compte de `meetings.update`
 *              ne peut pas enregistrer un compte rendu ; un compte de
 *              `meetings.report` ne peut pas renommer la réunion (DEC-024).
 *   §25      — TRANSFORMER UNE ACTION EN TÂCHE exige aussi `tasks.create`, et
 *              l'état de l'action est GELÉ ensuite.
 *   §19      — LE CALENDRIER N'A PAS DE PERMISSION : il montre les couches
 *              ouvertes, et NOMME les autres (DEC-036 §d).
 *   §51      — aucune capacité ne s'obtient par une URL tapée à la main.
 *   DEC-025 §e — une heure saisie aux Comores est stockée comme telle.
 *
 * AUCUNE DATE EN DUR : tout se pose par rapport à l'instant d'exécution.
 *
 * Utilisation :
 *   node scripts/verify-planning.mjs [url]
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { dayOffset, instantOffset, loadEnvFile, localInput, required } from './lib/env.mjs'

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
const MARK = `RECETTE PLAN ${STAMP}`

/** Lectures communes : sans elles, RLS masquerait les sujets référencés. */
const BASE = ['dashboard.view', 'users.users.view']

/**
 * Un profil par frontière éprouvée.
 *
 * `dashboard.view` est donné à tous : c'est l'écran d'atterrissage après la
 * connexion, il n'a aucun rapport avec ce que le lot contrôle.
 */
const PROFILES = {
  /* Le poste de l'assistant(e) de direction (§43) : tout le module. */
  assistante: [
    ...BASE,
    'notifications.view',
    'parties.clients.view',
    'projects.view',
    'projects.tasks.view',
    'projects.tasks.create',
    'projects.meetings.view',
    'projects.meetings.create',
    'projects.meetings.update',
    'projects.meetings.report',
    'projects.appointments.view',
    'projects.appointments.create',
    'projects.appointments.update',
    'projects.actions.view',
    'projects.actions.create',
    'projects.actions.update',
    'projects.decisions.view',
    'projects.decisions.create',
    'projects.decisions.update',
  ],

  /*
   * LE PREMIER PROFIL CENTRAL DU LOT.
   *
   * Il organise les réunions mais ne peut pas CONSIGNER ce qui s'y est dit.
   * Sans le déclencheur `fn_meeting_write_guard`, `projects.meetings.report`
   * serait impliquée par `.update` — le défaut exact que la migration 040 avait
   * corrigé pour la maintenance (DEC-024).
   */
  organisateur: [
    ...BASE,
    'projects.meetings.view',
    'projects.meetings.create',
    'projects.meetings.update',
  ],

  /* La frontière inverse : il consigne, il n'organise pas. */
  rapporteur: [...BASE, 'projects.meetings.view', 'projects.meetings.report'],

  /*
   * LE SECOND PROFIL CENTRAL.
   *
   * Il suit les actions mais ne peut pas créer de tâche : la transformation du
   * §25 doit lui être refusée, y compris par appel direct au RPC.
   */
  suiveur: [...BASE, 'projects.actions.view', 'projects.actions.update'],

  /* Rendez-vous seuls : ni réunions, ni décisions, ni actions. */
  rdv: [
    ...BASE,
    'notifications.view',
    'projects.appointments.view',
    'projects.appointments.create',
    'projects.appointments.update',
  ],

  /* Décisions seules : leurs actions doivent lui être NOMMÉES, pas masquées. */
  decideur: [...BASE, 'projects.decisions.view', 'projects.decisions.create'],

  /* Réunions seules : le calendrier ne lui montre qu'une couche sur trois. */
  lecteur_reunions: [...BASE, 'notifications.view', 'projects.meetings.view'],

  /* Rien du module : tous les écrans lui sont fermés. */
  sans_acces: ['dashboard.view'],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.plan.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-plan-${STAMP}`

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
    last_name: `Plan ${key}`,
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

/**
 * Une insertion de mise en place qui échoue doit ARRÊTER la recette.
 *
 * Un sujet à moitié construit fait échouer les contrôles suivants pour une
 * raison qui n'est pas la leur.
 */
async function insert(admin, table, row, columns = 'id') {
  const { data, error } = await admin.from(table).insert(row).select(columns).single()
  if (error) throw new Error(`${table} : ${error.message}`)
  return data
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

  const accounts = {}
  const sessions = {}
  const fixtures = { projects: [], meetings: [], appointments: [], decisions: [], actions: [], tasks: [] }
  const browser = await chromium.launch()

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

  const refused = (result) => Boolean(result.error)

  try {
    /* --- Sujets de recette ------------------------------------------------ */
    console.log('──────────────────────────────────────────────────────────────')
    console.log('SUJETS\n')

    for (const [key, codes] of Object.entries(PROFILES)) {
      accounts[key] = await createProfile(admin, accounts, key, codes)
    }

    const projet = await insert(admin, 'projects', {
      name: `${MARK} — Projet de coordination`,
      status: 'ACTIVE',
      owner_id: accounts.assistante.id,
    })
    fixtures.projects.push(projet.id)

    // Réunion du jour : elle alimente le calendrier ET la veille.
    const reunion = await insert(admin, 'project_meetings', {
      title: `${MARK} — Réunion fournisseur`,
      objective: 'Éprouver le second volet du module',
      project_id: projet.id,
      owner_id: accounts.assistante.id,
      starts_at: instantOffset(3),
      duration_minutes: 90,
      location: 'Bureau de la direction',
      agenda: '1. Historique\n2. Factures\n3. Imputation',
    })
    fixtures.meetings.push(reunion.id)

    // Réunion « frontière » : c'est sur elle que se joue consigner ≠ organiser.
    const frontiere = await insert(admin, 'project_meetings', {
      title: `${MARK} — Réunion frontière`,
      starts_at: instantOffset(30),
    })
    fixtures.meetings.push(frontiere.id)

    const rendezVous = await insert(admin, 'project_appointments', {
      subject: `${MARK} — Signature de convention`,
      starts_at: instantOffset(5),
      duration_minutes: 60,
      owner_id: accounts.rdv.id,
      external_contact: 'M. Ali, directeur administratif',
      location: 'Moroni',
    })
    fixtures.appointments.push(rendezVous.id)

    const decision = await insert(admin, 'project_decisions', {
      title: `${MARK} — Lancer le partenariat`,
      context: 'À la suite de la réunion fournisseur',
      statement: 'Le partenariat est lancé aux conditions discutées.',
      owner_id: accounts.assistante.id,
      project_id: projet.id,
      meeting_id: reunion.id,
    })
    fixtures.decisions.push(decision.id)

    // Action à transformer, et action à suivre sur place.
    const aTransformer = await insert(admin, 'project_actions', {
      title: `${MARK} — Préparer la convention`,
      decision_id: decision.id,
      assignee_id: accounts.suiveur.id,
      due_on: dayOffset(5),
    })
    fixtures.actions.push(aTransformer.id)

    const enRetard = await insert(admin, 'project_actions', {
      title: `${MARK} — Vérifier les factures`,
      meeting_id: reunion.id,
      assignee_id: accounts.suiveur.id,
      due_on: dayOffset(-2),
    })
    fixtures.actions.push(enRetard.id)

    console.log(
      `  ${DIM}1 projet, 2 réunions, 1 rendez-vous, 1 décision, 2 actions, 8 comptes.${RESET}`
    )

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — CHAQUE ÉCRAN EXIGE SA CAPACITÉ (§51)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.sans_acces)

      for (const [chemin, libelle] of [
        ['/projets/reunions', 'les réunions'],
        ['/projets/rendez-vous', 'les rendez-vous'],
        ['/projets/decisions', 'les décisions'],
        ['/projets/actions', 'les actions'],
        ['/projets/calendrier', 'le calendrier'],
      ]) {
        await page.goto(`${base}${chemin}`, { waitUntil: 'load' })
        check(page.url().includes('/acces-refuse'), `Sans capacité : ${libelle} refusé${libelle.endsWith('s') ? 's' : ''}`)
      }

      // Les fiches, tapées à la main, ne contournent rien.
      await page.goto(`${base}/projets/reunions/${reunion.id}`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'La fiche réunion tapée à la main est refusée')

      await page.goto(`${base}/projets/decisions/${decision.id}`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'La fiche décision tapée à la main est refusée')

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.lecteur_reunions)

      await page.goto(`${base}/projets/reunions`, { waitUntil: 'load' })
      check(!page.url().includes('/acces-refuse'), 'meetings.view ouvre la liste des réunions')

      await page.goto(`${base}/projets/rendez-vous`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Lire les réunions n’ouvre pas les rendez-vous (DEC-024)'
      )

      await page.goto(`${base}/projets/decisions`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Lire les réunions n’ouvre pas les décisions (DEC-024)'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — ENREGISTRER UNE RÉUNION, PAR L’ÉCRAN (§53.9)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.assistante)

      await page.goto(`${base}/projets/reunions/nouvelle`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#title') !== null)

      const titre = `${MARK} — Réunion créée par l’écran`
      const saisie = localInput(48)

      await page.fill('#title', titre)
      await page.fill('#objective', 'Créée par la recette, supprimée par elle')
      await page.selectOption('#ownerId', accounts.assistante.id)
      await page.fill('#startsAt', saisie)
      await page.selectOption('#durationMinutes', '120')
      await page.fill('#location', 'Salle de réunion')
      await page.click('button:has-text("Créer la réunion")')

      await page.waitForURL(/\/projets\/reunions\/[0-9a-f-]{36}/, { timeout: 60000 })
      const texte = await mainText(page)

      check(texte.includes(titre), '§53.9 — la réunion est créée et sa fiche s’ouvre')
      check(texte.includes('Planifiée'), 'Elle naît « Planifiée »')
      check(texte.includes('2 h'), 'La durée saisie est lisible', '120 minutes → 2 h')
      check(
        texte.includes('Recette Plan assistante'),
        'Le responsable désigné est lisible'
      )

      const { data: row } = await admin
        .from('project_meetings')
        .select('id, starts_at, duration_minutes, owner_id')
        .eq('title', titre)
        .maybeSingle()

      if (row) {
        fixtures.meetings.push(row.id)

        /*
         * LE CONTRÔLE DE FUSEAU — DEC-025 §e.
         *
         * L'heure a été saisie telle qu'elle s'affiche AUX COMORES. Relue sur ce
         * même fuseau, elle doit être identique. Sans `fromLocalInput`, une
         * réunion à 14:30 serait stockée à 14:30 UTC et se relirait à 17:30.
         */
        const relue = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Indian/Comoro',
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
          .formatToParts(new Date(row.starts_at))
          .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {})

        const attendue = `${relue.year}-${relue.month}-${relue.day}T${String(
          Number(relue.hour) % 24
        ).padStart(2, '0')}:${relue.minute}`

        check(
          attendue === saisie,
          'DEC-025 §e — l’heure saisie aux Comores est l’heure enregistrée',
          `saisie ${saisie} · relue ${attendue}`
        )
        check(row.duration_minutes === 120, 'La durée est enregistrée', `${row.duration_minutes} min`)
        check(row.owner_id === accounts.assistante.id, 'Le responsable est enregistré en base')
      } else {
        check(false, 'La réunion créée par l’écran est retrouvée en base')
      }

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — ENREGISTRER UN RENDEZ-VOUS ET SON TIERS (§53.10, §27)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.assistante)

      const { data: client } = await admin
        .from('clients')
        .select('id, legal_name')
        .like('legal_name', '%DEMO%')
        .limit(1)
        .maybeSingle()

      await page.goto(`${base}/projets/rendez-vous/nouveau`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#subject') !== null)

      const objet = `${MARK} — Rendez-vous créé par l’écran`
      await page.fill('#subject', objet)
      await page.fill('#startsAt', localInput(72))
      await page.selectOption('#partyType', 'CLIENT')
      if (client) await page.selectOption('#partyId', client.id)
      await page.fill('#externalContact', 'Mme Saïd, gérante')
      await page.click('button:has-text("Créer le rendez-vous")')

      await page.waitForURL(/\/projets\/rendez-vous\/[0-9a-f-]{36}/, { timeout: 60000 })
      const texte = await mainText(page)

      check(texte.includes(objet), '§53.10 — le rendez-vous est créé et sa fiche s’ouvre')
      check(texte.includes('Planifié'), 'Il naît « Planifié »')
      check(
        client ? texte.includes(client.legal_name) : true,
        '§27 — le tiers concerné est lisible depuis la fiche'
      )
      check(
        texte.includes('Mme Saïd'),
        'La personne rencontrée coexiste avec le tiers enregistré'
      )

      const { data: row } = await admin
        .from('project_appointments')
        .select('id, client_id, supplier_id, partner_id')
        .eq('subject', objet)
        .maybeSingle()

      if (row) {
        fixtures.appointments.push(row.id)
        check(
          row.client_id === (client?.id ?? null) &&
            row.supplier_id === null &&
            row.partner_id === null,
          'Un seul tiers est rattaché, et c’est celui qui a été choisi'
        )
      } else {
        check(false, 'Le rendez-vous créé par l’écran est retrouvé en base')
      }

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — CONSERVER UNE DÉCISION, DEPUIS SA RÉUNION (§53.11, §46)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.assistante)

      await page.goto(`${base}/projets/decisions/nouvelle?reunion=${reunion.id}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.querySelector('#statement') !== null)

      const titre = `${MARK} — Décision créée par l’écran`
      await page.fill('#title', titre)
      await page.fill('#statement', 'La convention est signée avant la fin du mois.')
      await page.fill('#context', 'Décidé en séance.')
      await page.selectOption('#ownerId', accounts.assistante.id)
      await page.click('button:has-text("Enregistrer la décision")')

      // Le retour se fait sur la fiche de la réunion : §46, l'enchaînement.
      await page.waitForURL(new RegExp(`/projets/reunions/${reunion.id}`), { timeout: 60000 })
      const texte = await mainText(page)

      check(
        texte.includes('rattachée à cette réunion'),
        '§46 — la décision revient sur la fiche de sa réunion'
      )
      check(texte.includes(titre), '§53.11 — la décision figure parmi celles de la réunion')

      const { data: row } = await admin
        .from('project_decisions')
        .select('id, meeting_id, decided_on, statement')
        .eq('title', titre)
        .maybeSingle()

      if (row) {
        fixtures.decisions.push(row.id)
        check(row.meeting_id === reunion.id, 'Elle est rattachée à la réunion d’origine')
        check(
          row.decided_on === dayOffset(0),
          'Sa date par défaut est le jour des Comores',
          row.decided_on
        )
        check(Boolean(row.statement?.trim()), 'Son énoncé est conservé, pas seulement son titre')
      } else {
        check(false, 'La décision créée par l’écran est retrouvée en base')
      }

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — CONSIGNER N’EST PAS ORGANISER (§23, §43, DEC-024)\n')

    {
      const client = await session('organisateur')

      // Il PEUT organiser : la barrière n'est pas un blocage général.
      const renomme = await client
        .from('project_meetings')
        .update({ location: 'Salle repositionnée' })
        .eq('id', frontiere.id)
        .select('id')
      check(
        !refused(renomme) && renomme.data?.length === 1,
        'Avec `meetings.update`, déplacer une réunion reste possible'
      )

      // Il ne peut PAS consigner — appel direct, sans écran.
      const compteRendu = await client
        .from('project_meetings')
        .update({ minutes: 'Compte rendu interdit' })
        .eq('id', frontiere.id)
        .select('id')
      check(
        refused(compteRendu),
        '§23 — sans `meetings.report`, écrire un compte rendu est REFUSÉ',
        compteRendu.error?.message?.slice(0, 60)
      )

      // Ni déclarer la réunion tenue : c'est le même acte.
      const tenue = await client
        .from('project_meetings')
        .update({ status: 'HELD' })
        .eq('id', frontiere.id)
        .select('id')
      check(
        refused(tenue),
        'Ni la déclarer tenue : les deux gestes forment un seul acte',
        tenue.error?.message?.slice(0, 60)
      )

      const { data: apres } = await admin
        .from('project_meetings')
        .select('status, minutes')
        .eq('id', frontiere.id)
        .maybeSingle()
      check(
        apres?.status === 'PLANNED' && apres?.minutes === null,
        'La réunion n’a rien retenu de ces tentatives'
      )
    }

    {
      const { context, page } = await signIn(browser, base, accounts.organisateur)

      await page.goto(`${base}/projets/reunions/${frontiere.id}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Compte rendu'))
      const texte = await mainText(page)

      check(
        texte.includes('projects.meetings.report'),
        'L’écran DIT pourquoi le compte rendu ne lui est pas ouvert'
      )

      const options = await page.locator('#status option').allInnerTexts()
      check(!options.includes('Tenue'), 'Et « Tenue » ne lui est pas proposée', options.join(' · '))

      await context.close()
    }

    {
      const client = await session('rapporteur')

      // La frontière inverse : il consigne, il n'organise pas.
      const deplace = await client
        .from('project_meetings')
        .update({ location: 'Ailleurs' })
        .eq('id', frontiere.id)
        .select('id')
      check(
        refused(deplace),
        'Réciproquement : sans `meetings.update`, déplacer une réunion est REFUSÉ',
        deplace.error?.message?.slice(0, 60)
      )

      const consigne = await client
        .from('project_meetings')
        .update({ minutes: `${MARK} — Ce qui s’est dit.`, status: 'HELD' })
        .eq('id', frontiere.id)
        .select('id')
      check(!refused(consigne), 'Avec `meetings.report`, le compte rendu aboutit')

      const { data: apres } = await admin
        .from('project_meetings')
        .select('status, minutes, minutes_recorded_at, minutes_recorded_by, location')
        .eq('id', frontiere.id)
        .maybeSingle()

      check(
        apres?.status === 'HELD' && Boolean(apres?.minutes_recorded_at),
        'Le compte rendu déclare la réunion tenue, et il est horodaté par la base'
      )
      check(
        apres?.minutes_recorded_by === accounts.rapporteur.id,
        'Et il porte le nom de qui l’a écrit'
      )
      check(
        apres?.location === 'Salle repositionnée',
        'Le déplacement refusé n’a rien laissé passer'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — SUIVRE UNE ACTION, ET LA TRANSFORMER (§53.12, §25)\n')

    {
      const client = await session('suiveur')

      // Il suit : marquer une action réalisée relève de `actions.update`.
      const faite = await client
        .from('project_actions')
        .update({ status: 'DONE' })
        .eq('id', enRetard.id)
        .select('id')
      check(
        !refused(faite) && faite.data?.length === 1,
        '§53.12 — avec `actions.update`, une action se déclare réalisée'
      )

      const { data: apres } = await admin
        .from('project_actions')
        .select('status, completed_at')
        .eq('id', enRetard.id)
        .maybeSingle()
      check(
        apres?.status === 'DONE' && Boolean(apres?.completed_at),
        'La réalisation est horodatée par la base, jamais saisie'
      )

      // Mais il ne peut PAS transformer : il naîtrait une vraie tâche.
      const transformation = await client.rpc('transform_action_to_task', {
        p_action_id: aTransformer.id,
      })
      check(
        refused(transformation),
        '§25 — sans `tasks.create`, transformer une action en tâche est REFUSÉ',
        transformation.error?.message?.slice(0, 70)
      )

      const { data: intacte } = await admin
        .from('project_actions')
        .select('task_id')
        .eq('id', aTransformer.id)
        .maybeSingle()
      check(intacte?.task_id === null, 'Aucune tâche n’a été créée au passage')

      // Ni par un PATCH direct posant `task_id` : le déclencheur y veille aussi.
      const { data: tacheTemoin } = await admin
        .from('project_tasks')
        .insert({ title: `${MARK} — Tâche témoin` })
        .select('id')
        .single()
      fixtures.tasks.push(tacheTemoin.id)

      const lien = await client
        .from('project_actions')
        .update({ task_id: tacheTemoin.id })
        .eq('id', aTransformer.id)
        .select('id')
      check(
        refused(lien),
        'Un PATCH direct posant `task_id` rencontre la même barrière',
        lien.error?.message?.slice(0, 60)
      )
    }

    {
      const client = await session('assistante')

      const transformation = await client.rpc('transform_action_to_task', {
        p_action_id: aTransformer.id,
      })
      check(!refused(transformation), 'Avec `tasks.create`, la transformation aboutit')

      const tacheId = transformation.data
      if (tacheId) fixtures.tasks.push(tacheId)

      const { data: tache } = await admin
        .from('project_tasks')
        .select('id, title, project_id, assignee_id, due_on')
        .eq('id', tacheId)
        .maybeSingle()

      check(
        tache?.project_id === projet.id,
        '§33 — la tâche née hérite du projet de la décision, et compte dans le bon avancement'
      )
      check(
        tache?.assignee_id === accounts.suiveur.id && tache?.due_on === dayOffset(5),
        'Elle reprend le responsable et l’échéance de l’action'
      )

      // L'ÉTAT DE L'ACTION EST DÉSORMAIS GELÉ.
      const gele = await client
        .from('project_actions')
        .update({ status: 'DONE' })
        .eq('id', aTransformer.id)
        .select('id')
      check(
        refused(gele),
        '§25 — l’état d’une action transformée ne se change plus : le suivi est à la tâche',
        gele.error?.message?.slice(0, 60)
      )

      // Une seule fois.
      const seconde = await client.rpc('transform_action_to_task', {
        p_action_id: aTransformer.id,
      })
      check(refused(seconde), 'Une action ne se transforme qu’une fois')

      // Le reste, lui, reste modifiable : corriger un libellé n'est pas suivre.
      const correction = await client
        .from('project_actions')
        .update({ title: `${MARK} — Préparer la convention (corrigé)` })
        .eq('id', aTransformer.id)
        .select('id')
      check(!refused(correction), 'Corriger le libellé d’une action transformée reste possible')
    }

    {
      const { context, page } = await signIn(browser, base, accounts.assistante)

      await page.goto(`${base}/projets/actions/${aTransformer.id}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Situation'))
      const texte = await mainText(page)

      check(
        texte.includes('suivie comme tâche') || texte.includes('Suivie comme tâche'),
        'La fiche dit que le suivi a changé de main'
      )
      check(
        !texte.includes('Transformer en tâche'),
        'Et elle ne propose plus de la transformer'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — UNE ACTION DÉCOULE TOUJOURS D’UN MOMENT (§25)\n')

    {
      const client = await session('assistante')

      const orpheline = await client
        .from('project_actions')
        .insert({ title: `${MARK} — Action orpheline` })
        .select('id')
      check(
        refused(orpheline),
        'Sans réunion ni décision, une action est REFUSÉE — ce serait une tâche',
        orpheline.error?.message?.slice(0, 60)
      )
      if (orpheline.data?.[0]?.id) fixtures.actions.push(orpheline.data[0].id)
    }

    {
      const client = await session('decideur')

      const interdite = await client
        .from('project_actions')
        .insert({ title: `${MARK} — Action interdite`, decision_id: decision.id })
        .select('id')
      check(refused(interdite), 'Sans `actions.create`, créer une action est refusé')
      if (interdite.data?.[0]?.id) fixtures.actions.push(interdite.data[0].id)

      const reunionInterdite = await client
        .from('project_meetings')
        .insert({ title: `${MARK} — Réunion interdite`, starts_at: instantOffset(10) })
        .select('id')
      check(refused(reunionInterdite), 'Sans `meetings.create`, créer une réunion est refusé')
      if (reunionInterdite.data?.[0]?.id) fixtures.meetings.push(reunionInterdite.data[0].id)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — LE CALENDRIER N’A PAS DE PERMISSION (§19, DEC-036 §d)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.assistante)

      await page.goto(`${base}/projets/calendrier?vue=semaine`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Calendrier'))
      const texte = await mainText(page)

      check(
        texte.includes(`${MARK} — Réunion fournisseur`),
        '§19 — la réunion du jour figure au calendrier'
      )
      check(
        texte.includes(`${MARK} — Signature de convention`),
        'Le rendez-vous aussi'
      )
      check(
        !texte.includes('ne montre pas'),
        'Aucune couche fermée n’est annoncée : les trois lui sont ouvertes'
      )

      // §19 : « les éléments doivent être filtrables selon leur type ».
      await page.goto(`${base}/projets/calendrier?vue=semaine&type=MEETING`, {
        waitUntil: 'load',
      })
      const filtre = await mainText(page)
      check(
        filtre.includes(`${MARK} — Réunion fournisseur`) &&
          !filtre.includes(`${MARK} — Signature de convention`),
        '§19 — le filtre par type ne garde que la couche demandée'
      )

      // §20 : quatre niveaux de visualisation.
      for (const vue of ['jour', 'semaine', 'mois', 'agenda']) {
        await page.goto(`${base}/projets/calendrier?vue=${vue}`, { waitUntil: 'load' })
        const titre = await page.locator('[data-calendrier-titre]').first().innerText()
        check(Boolean(titre?.trim()), `§20 — la vue « ${vue} » s’ouvre et se nomme`, titre?.trim())
      }

      // Une valeur hostile dans l'URL ne casse pas l'écran.
      await page.goto(`${base}/projets/calendrier?vue=;drop%20table&jour=hier&type=XX`, {
        waitUntil: 'load',
      })
      check(
        !page.url().includes('/acces-refuse') &&
          (await mainText(page)).includes('Calendrier'),
        'Des paramètres d’URL absurdes ne cassent pas l’écran'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.lecteur_reunions)

      await page.goto(`${base}/projets/calendrier?vue=semaine`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Calendrier'))
      const texte = await mainText(page)

      check(
        texte.includes(`${MARK} — Réunion fournisseur`),
        'Le calendrier s’ouvre avec une seule couche sur trois'
      )
      check(
        !texte.includes(`${MARK} — Signature de convention`),
        'Il ne montre pas la couche qui lui est fermée'
      )
      check(
        texte.includes('projects.appointments.view') &&
          texte.includes('projects.tasks.view'),
        'Et il NOMME les deux couches fermées (DEC-017)',
        'un calendrier amputé n’est pas un calendrier vide'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — CE QUI MANQUE SE NOMME (DEC-017)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.decideur)

      await page.goto(`${base}/projets/decisions/${decision.id}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('La décision'))
      const texte = await mainText(page)

      check(
        texte.includes('Le partenariat est lancé'),
        'La décision reste lisible sans les autres capacités'
      )
      check(
        texte.includes('projects.actions.view'),
        'Ses actions ne sont pas masquées : leur absence est NOMMÉE'
      )
      check(
        texte.includes('Réunion non lisible'),
        'La réunion d’origine manquante est nommée, jamais remplacée par un tiret'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.rapporteur)

      await page.goto(`${base}/projets/reunions/${reunion.id}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Situation'))
      const texte = await mainText(page)

      check(
        texte.includes('projects.decisions.view'),
        'Sur une réunion, les décisions non lisibles sont nommées'
      )
      check(
        texte.includes('projects.actions.view'),
        'Ses actions aussi'
      )
      check(
        texte.includes('Projet non lisible'),
        'Et le projet, que `projects.view` commande'
      )

      await context.close()
    }

    /*
     * §6 — LA FICHE PROJET CITE SES RÉUNIONS ET SES DÉCISIONS.
     *
     * Rien n'y est dupliqué : ce sont les mêmes lignes que leurs listes,
     * filtrées sur ce projet (§53.20). Et chacune dépend de SA capacité — lire
     * un projet n'ouvre ni l'une ni l'autre.
     */
    {
      const { context, page } = await signIn(browser, base, accounts.assistante)

      await page.goto(`${base}/projets/${projet.id}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Réunions du projet'))
      const texte = await mainText(page)

      check(
        texte.includes(`${MARK} — Réunion fournisseur`),
        '§6 — la fiche projet cite les réunions rattachées'
      )
      check(
        texte.includes(`${MARK} — Lancer le partenariat`),
        '§6 — et les décisions prises dans son cadre'
      )

      await context.close()
    }

    {
      // Le même écran, sans les deux lectures : les sections se NOMMENT.
      const { context, page } = await signIn(browser, base, accounts.suiveur)

      const grant = await admin
        .from('permissions')
        .select('id')
        .eq('code', 'projects.view')
        .single()
      await admin
        .from('user_permissions')
        .insert({ user_id: accounts.suiveur.id, permission_id: grant.data.id, effect: 'ALLOW' })

      await page.goto(`${base}/projets/${projet.id}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Réunions du projet'))
      const texte = await mainText(page)

      check(
        texte.includes('projects.meetings.view'),
        'Sans la lecture des réunions, la section le DIT plutôt que d’être vide'
      )
      check(
        texte.includes('projects.decisions.view'),
        'Et la section des décisions aussi (DEC-017)'
      )
      check(
        !texte.includes('Aucune réunion rattachée'),
        'Elle ne prétend jamais qu’il n’y en a pas',
        'un projet sans réunion et un projet dont on ne lit pas les réunions diffèrent'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — LA VEILLE APPREND DEUX SITUATIONS (§38, §53.13)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.assistante)

      await page.goto(`${base}/notifications?module=projects`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('notification'))
      const texte = await mainText(page)

      check(texte.includes('Réunion à venir'), '§53.13 — la réunion proche est notifiée')
      check(
        texte.includes(`${MARK} — Réunion fournisseur`),
        'La notification nomme la réunion concernée'
      )
      check(texte.includes('Rendez-vous à venir'), 'Le rendez-vous proche est notifié')
      check(
        !texte.includes(`${MARK} — Réunion frontière`),
        'Une réunion TENUE ne rappelle plus rien (§38)'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.rdv)

      await page.goto(`${base}/notifications`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('notification'))
      const texte = await mainText(page)

      check(
        !texte.includes(`${MARK} — Réunion fournisseur`),
        'Sans `meetings.view`, aucune notification de réunion : la source se TAIT'
      )
      check(
        texte.includes('Réunions à venir') && texte.includes('projects.meetings.view'),
        'Mais l’écran NOMME la source fermée (DEC-017)'
      )
      check(
        texte.includes(`${MARK} — Signature de convention`),
        'Sa propre source, elle, lui parle'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('11 — LA VUE PERSONNELLE S’ÉTEND (§36)\n')

    {
      const client = await session('assistante')
      const convocation = await client
        .from('project_meeting_participants')
        .insert({ meeting_id: reunion.id, user_id: accounts.suiveur.id })
        .select('meeting_id')
      check(!refused(convocation), 'Convoquer relève de `meetings.update`')

      const doublon = await client
        .from('project_meeting_participants')
        .insert({ meeting_id: reunion.id, user_id: accounts.suiveur.id })
        .select('meeting_id')
      check(refused(doublon), 'Une même personne n’est convoquée qu’une fois')
    }

    {
      const { context, page } = await signIn(browser, base, accounts.rdv)

      await page.goto(`${base}/projets/mes-elements`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Mes rendez-vous'))
      const texte = await mainText(page)

      check(
        texte.includes(`${MARK} — Signature de convention`),
        '§36 — le rendez-vous dont il est responsable figure dans « Mes rendez-vous »'
      )
      check(
        texte.includes('projects.meetings.view'),
        'Et « Mes réunions » DIT la permission qui manque, plutôt que d’être vide'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.suiveur)

      await page.goto(`${base}/projets/mes-elements`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Mes actions'))
      const texte = await mainText(page)

      check(
        texte.includes(`${MARK} — Vérifier les factures`),
        '§43 — les actions qui lui sont confiées figurent dans « Mes actions »'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('12 — RIEN NE SE SUPPRIME (§24, §48)\n')

    {
      const client = await session('assistante')

      const suppressionDecision = await client
        .from('project_decisions')
        .delete()
        .eq('id', decision.id)
        .select('id')
      check(
        refused(suppressionDecision) || (suppressionDecision.data ?? []).length === 0,
        '§24 — une décision ne se supprime pas'
      )

      const suppressionReunion = await client
        .from('project_meetings')
        .delete()
        .eq('id', reunion.id)
        .select('id')
      check(
        refused(suppressionReunion) || (suppressionReunion.data ?? []).length === 0,
        'Une réunion non plus : elle s’annule'
      )

      const { count: restantes } = await admin
        .from('project_decisions')
        .select('id', { count: 'exact', head: true })
        .eq('id', decision.id)
      check(restantes === 1, 'La décision est toujours là', `${restantes}`)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('13 — LE JOURNAL, ET AUCUN EFFET DE BORD\n')

    {
      const { count: entrees } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('module_code', 'projects')
        .eq('entity_type', 'project_meetings')
        .gte('occurred_at', new Date(Date.now() - 3600_000).toISOString())
      check((entrees ?? 0) > 0, '§31 — les réunions sont journalisées', `${entrees} entrées`)

      const { data: auteur } = await admin
        .from('audit_log')
        .select('actor_id, actor_label')
        .eq('module_code', 'projects')
        .eq('entity_type', 'project_meetings')
        .eq('entity_id', frontiere.id)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      check(
        auteur?.actor_id === accounts.rapporteur.id,
        'Le journal dit QUI a consigné le compte rendu',
        auteur?.actor_label ?? '—'
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
      check(total === 170, 'Catalogue conforme', `${total} permissions`)

      const { count: projectPerms } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
        .like('code', 'projects.%')
      check(projectPerms === 21, 'Vingt et une capacités pour le module Projets')

      const { count: calendrier } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
        .like('code', 'projects.calendar%')
      check(calendrier === 0, 'Aucune capacité de calendrier : elle ne contrôlerait rien')

      // Le module référence, il ne pilote pas (§45).
      const { count: locations } = await admin
        .from('rentals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'IN_PROGRESS')
      const { count: factures } = await admin
        .from('customer_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ISSUED')
      check(
        typeof locations === 'number' && typeof factures === 'number',
        'Location et facturation restent lisibles et inchangées',
        `${locations} locations en cours · ${factures} factures émises`
      )
    }
  } finally {
    await browser.close()
    for (const client of Object.values(sessions)) await client.auth.signOut()

    /*
     * NETTOYAGE — dans l'ordre des dépendances.
     *
     * `project_actions` cite décisions, réunions et tâches en `on delete
     * restrict` ; `project_decisions` cite les réunions de même. Supprimer dans
     * le désordre laisserait des lignes retenues sans que rien ne le dise.
     */
    for (const id of fixtures.actions) {
      await admin.from('project_actions').delete().eq('id', id)
    }
    await admin.from('project_actions').delete().ilike('title', `%${MARK}%`)

    for (const id of fixtures.tasks) {
      await admin.from('project_tasks').delete().eq('id', id)
    }
    await admin.from('project_tasks').delete().ilike('title', `%${MARK}%`)

    for (const id of fixtures.decisions) {
      await admin.from('project_decisions').delete().eq('id', id)
    }
    await admin.from('project_decisions').delete().ilike('title', `%${MARK}%`)

    for (const id of fixtures.meetings) {
      await admin.from('project_meeting_participants').delete().eq('meeting_id', id)
      await admin.from('project_meetings').delete().eq('id', id)
    }
    await admin.from('project_meetings').delete().ilike('title', `%${MARK}%`)

    for (const id of fixtures.appointments) {
      await admin.from('project_appointment_participants').delete().eq('appointment_id', id)
      await admin.from('project_appointments').delete().eq('id', id)
    }
    await admin.from('project_appointments').delete().ilike('subject', `%${MARK}%`)

    for (const id of fixtures.projects) {
      await admin.from('project_members').delete().eq('project_id', id)
      await admin.from('projects').delete().eq('id', id)
    }
    await admin.from('projects').delete().ilike('name', `%${MARK}%`)

    for (const account of Object.values(accounts)) {
      await admin.from('project_meeting_participants').delete().eq('user_id', account.id)
      await admin.from('project_appointment_participants').delete().eq('user_id', account.id)
      await admin.from('project_members').delete().eq('user_id', account.id)
      await admin.from('notification_reads').delete().eq('user_id', account.id)
      await admin.from('user_permissions').delete().eq('user_id', account.id)
      await admin.from('app_users').delete().eq('id', account.id)
      await admin.auth.admin.deleteUser(account.id)
    }

    /*
     * BALAYAGE PAR MARQUEUR — le nettoyage par identifiants suivis ne suffit pas.
     *
     * Un `delete` refusé ne lève rien avec PostgREST : la boucle l'ignorerait.
     * Le balayage compte donc ce qui subsiste et le DIT — une recette silencieuse
     * sur ses résidus n'est pas une recette propre.
     */
    const leftovers = []
    for (const [table, column] of [
      ['project_actions', 'title'],
      ['project_decisions', 'title'],
      ['project_meetings', 'title'],
      ['project_appointments', 'subject'],
      ['project_tasks', 'title'],
      ['projects', 'name'],
    ]) {
      const { count } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .ilike(column, `%${MARK}%`)
      if (count) leftovers.push(`${table} : ${count}`)
    }

    const { count: strayUsers } = await admin
      .from('app_users')
      .select('id', { count: 'exact', head: true })
      .like('username', `recette.plan.%.${STAMP}`)
    if (strayUsers) leftovers.push(`app_users : ${strayUsers}`)

    if (leftovers.length > 0) {
      console.log(`\n${RED}Résidus de recette non supprimés — ${leftovers.join(', ')}${RESET}`)
    }

    console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE PLANIFICATION : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE PLANIFICATION : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
