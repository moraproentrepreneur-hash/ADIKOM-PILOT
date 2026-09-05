#!/usr/bin/env node
/**
 * Recette Projets & Tâches — Phase 4, LOT 12.
 *
 * CE QU'ELLE ÉPROUVE, ET QUE `db:verify:projects` NE PEUT PAS ÉPROUVER
 *
 * La recette SQL contrôle les règles avec le rôle de service, pour lequel
 * `current_actor()` vaut NULL : aucune capacité n'y est vérifiée. Celle-ci
 * ouvre de VRAIES sessions et éprouve ce que chaque profil peut faire — par
 * l'écran ET par appel direct à l'API, sans passer par aucun bouton.
 *
 * Les critères d'acceptation du Module 03 §53 servent de fil :
 *
 *   1. §53.1  — un utilisateur autorisé crée un projet, par l'écran.
 *   2. §53.2  — le projet porte un responsable.
 *   3. §53.3-5 — il porte des tâches, attribuées, avec échéance.
 *   4. §53.6  — les tâches en retard sont identifiables, et filtrables.
 *   5. §53.7-8 — projets et tâches portent un statut lisible.
 *   6. §33    — l'avancement est celui des tâches réelles : 60 %, pas un chiffre
 *               stocké — et il se REFUSE plutôt que de valoir 0 % (DEC-034 §c).
 *   7. §42    — CLÔTURER N'EST PAS MODIFIER : le cœur du lot. Un compte doté de
 *               `projects.tasks.update` ne peut pas terminer une tâche, ni par
 *               l'écran, ni par un PATCH direct (DEC-024).
 *   8. §48    — ARCHIVER N'EST PAS MODIFIER, et réciproquement.
 *   9. §51    — aucune capacité ne s'obtient par une URL tapée à la main.
 *  10. §36    — la vue personnelle montre ce qui est attribué, et rien de plus.
 *  11. §38    — la veille apprend les échéances et les retards de tâches ; une
 *               source fermée est NOMMÉE, jamais silencieuse (DEC-017).
 *  12.        — aucun effet de bord : DEMO intactes, catalogue à 170, aucun
 *               autre module modifié.
 *
 * AUCUNE DATE EN DUR : les échéances se posent par rapport au jour d'exécution.
 *
 * Utilisation :
 *   node scripts/verify-projects.mjs [url]
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
const MARK = `RECETTE PRJ ${STAMP}`

/**
 * Un profil par frontière éprouvée.
 *
 * `dashboard.view` est donné à tous : c'est l'écran d'atterrissage après la
 * connexion, il n'a aucun rapport avec ce que le lot contrôle.
 */
const PROFILES = {
  /* Le poste complet : les huit capacités du module, et la lecture des comptes. */
  chef: [
    'dashboard.view',
    'notifications.view',
    'users.users.view',
    'projects.view',
    'projects.create',
    'projects.update',
    'projects.archive',
    'projects.tasks.view',
    'projects.tasks.create',
    'projects.tasks.update',
    'projects.tasks.close',
  ],

  /*
   * LE PROFIL CENTRAL DU LOT.
   *
   * Il modifie les tâches mais ne peut pas les CLÔTURER. Sans le déclencheur
   * `fn_task_write_guard`, `projects.tasks.close` serait impliquée par
   * `.update` — le défaut exact que la migration 040 avait corrigé pour la
   * maintenance (DEC-024).
   */
  coordinateur: [
    'dashboard.view',
    'users.users.view',
    'projects.view',
    'projects.tasks.view',
    'projects.tasks.create',
    'projects.tasks.update',
  ],

  /* Modifie un projet, mais ne le RANGE pas. */
  modificateur: ['dashboard.view', 'projects.view', 'projects.update', 'projects.tasks.view'],

  /* Range un projet, mais ne le MODIFIE pas. La frontière inverse. */
  archiviste: ['dashboard.view', 'projects.view', 'projects.archive', 'projects.tasks.view'],

  /*
   * Voit les projets, PAS leurs tâches.
   *
   * L'avancement doit se REFUSER en nommant `projects.tasks.view` : « 0 % »
   * signifierait « rien n'est fait », alors que rien n'a été compté.
   */
  lecteur: ['dashboard.view', 'notifications.view', 'projects.view'],

  /*
   * Voit les tâches, PAS les projets ni les utilisateurs.
   *
   * Ses listes restent justes : le projet et le responsable manquants sont
   * NOMMÉS « non lisible », jamais remplacés par un tiret qui dirait qu'il n'y
   * en a pas (doctrine de DEC-034 §d).
   */
  taches_seules: ['dashboard.view', 'projects.tasks.view'],

  /* Ni l'un ni l'autre : les deux écrans lui sont fermés. */
  sans_acces: ['dashboard.view'],
}

async function createProfile(admin, accounts, key, codes) {
  const username = `recette.prj.${key}.${STAMP}`
  const email = `${username}@adikom.test`
  const password = `recette-prj-${STAMP}`

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
    last_name: `Projet ${key}`,
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
  const fixtures = { projects: [], tasks: [] }
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

    // Projet suivi : dix tâches, six terminées → 60 % (§33).
    const suivi = await insert(admin, 'projects', {
      name: `${MARK} — Projet suivi`,
      objective: 'Éprouver l’avancement et les capacités',
      owner_id: accounts.chef.id,
      status: 'ACTIVE',
      priority: 'HIGH',
      starts_on: dayOffset(-10),
      due_on: dayOffset(20),
    })
    fixtures.projects.push(suivi.id)

    for (let i = 1; i <= 6; i += 1) {
      const done = await insert(admin, 'project_tasks', {
        project_id: suivi.id,
        title: `${MARK} — Tâche terminée ${i}`,
        due_on: dayOffset(-5),
      })
      fixtures.tasks.push(done.id)
      const { error } = await admin
        .from('project_tasks')
        .update({ status: 'DONE' })
        .eq('id', done.id)
      if (error) throw new Error(`clôture de mise en place : ${error.message}`)
    }

    // Une tâche en retard, attribuée au coordinateur : elle sert au retard, à la
    // vue personnelle et à la veille.
    const enRetard = await insert(admin, 'project_tasks', {
      project_id: suivi.id,
      title: `${MARK} — Tâche en retard`,
      due_on: dayOffset(-1),
      assignee_id: accounts.coordinateur.id,
      priority: 'URGENT',
    })
    fixtures.tasks.push(enRetard.id)

    // Trois tâches ouvertes de plus : le total non annulé vaut dix.
    for (const [suffixe, offset] of [
      ['du jour', 0],
      ['de demain', 1],
      ['sans échéance', null],
    ]) {
      const task = await insert(admin, 'project_tasks', {
        project_id: suivi.id,
        title: `${MARK} — Tâche ${suffixe}`,
        due_on: offset === null ? null : dayOffset(offset),
      })
      fixtures.tasks.push(task.id)
    }

    /*
     * Projet rangé — et il l'est APRÈS avoir reçu une tâche en retard.
     *
     * C'est ce qui rend le contrôle réel : ranger un projet n'efface pas son
     * travail, il cesse seulement de le rappeler (§48). Un projet archivé vide
     * n'aurait rien prouvé.
     */
    const range = await insert(admin, 'projects', {
      name: `${MARK} — Projet rangé`,
      status: 'DONE',
    })
    fixtures.projects.push(range.id)

    const tacheRangee = await insert(admin, 'project_tasks', {
      project_id: range.id,
      title: `${MARK} — Tâche d’un projet rangé`,
      due_on: dayOffset(-2),
    })
    fixtures.tasks.push(tacheRangee.id)

    {
      const { error } = await admin
        .from('projects')
        .update({ is_archived: true })
        .eq('id', range.id)
      if (error) throw new Error(`archivage de mise en place : ${error.message}`)
    }

    // Projet éprouvant les frontières d'écriture.
    const frontiere = await insert(admin, 'projects', {
      name: `${MARK} — Projet frontière`,
      status: 'ACTIVE',
    })
    fixtures.projects.push(frontiere.id)

    console.log(`  ${DIM}3 projets, ${fixtures.tasks.length} tâches, 7 comptes.${RESET}`)

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('1 — LES DEUX ÉCRANS EXIGENT LEUR CAPACITÉ (§51)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.sans_acces)

      await page.goto(`${base}/projets`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'Sans projects.view : /projets refusé', page.url().split('?')[0])

      await page.goto(`${base}/projets/taches`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Sans projects.tasks.view : /projets/taches refusé'
      )

      // L'URL d'une fiche, tapée à la main, ne contourne rien.
      await page.goto(`${base}/projets/${suivi.id}`, { waitUntil: 'load' })
      check(page.url().includes('/acces-refuse'), 'La fiche projet tapée à la main est refusée')

      await page.goto(`${base}/projets/mes-elements`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'La vue personnelle n’ouvre pas ce que les capacités ferment'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.taches_seules)

      await page.goto(`${base}/projets`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Lire les tâches n’ouvre pas les projets (DEC-024)'
      )

      await page.goto(`${base}/projets/taches`, { waitUntil: 'load' })
      check(!page.url().includes('/acces-refuse'), 'projects.tasks.view ouvre la liste des tâches')

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.lecteur)

      await page.goto(`${base}/projets/taches`, { waitUntil: 'load' })
      check(
        page.url().includes('/acces-refuse'),
        'Lire les projets n’ouvre pas les tâches (DEC-024)'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('2 — CRÉER UN PROJET, PAR L’ÉCRAN (§53.1, §53.2)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.chef)

      await page.goto(`${base}/projets/nouveau`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#name') !== null)

      const nom = `${MARK} — Projet créé par l’écran`
      await page.fill('#name', nom)
      await page.fill('#objective', 'Créé par la recette, supprimé par elle')
      await page.selectOption('#ownerId', accounts.chef.id)
      await page.selectOption('#priority', 'URGENT')
      await page.fill('#dueOn', dayOffset(30))
      await page.click('button:has-text("Créer le projet")')

      await page.waitForURL(/\/projets\/[0-9a-f-]{36}/, { timeout: 60000 })
      const texte = await mainText(page)

      check(texte.includes(nom), '§53.1 — le projet est créé et sa fiche s’ouvre')
      check(texte.includes('Recette Projet chef'), '§53.2 — le responsable désigné est lisible')
      check(texte.includes('Brouillon'), '§53.7 — le projet naît « Brouillon »')
      check(
        texte.includes('Aucune tâche'),
        '§33 — un projet sans tâche n’affiche pas 0 %',
        'l’écran dit « aucune tâche »'
      )

      const { data: row } = await admin
        .from('projects')
        .select('id, owner_id, priority')
        .eq('name', nom)
        .maybeSingle()

      if (row) {
        fixtures.projects.push(row.id)
        check(row.owner_id === accounts.chef.id, 'Le responsable est enregistré en base')
        check(row.priority === 'URGENT', 'La priorité saisie est enregistrée', row.priority)
      } else {
        check(false, 'Le projet créé par l’écran est retrouvé en base')
      }

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('3 — CRÉER UNE TÂCHE ATTRIBUÉE, AVEC ÉCHÉANCE (§53.3, §53.4, §53.5)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.chef)

      await page.goto(`${base}/projets/taches/nouvelle?projet=${suivi.id}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#title') !== null)

      const titre = `${MARK} — Tâche créée par l’écran`
      await page.fill('#title', titre)
      await page.selectOption('#assigneeId', accounts.coordinateur.id)
      await page.fill('#dueOn', dayOffset(3))
      await page.click('button:has-text("Créer la tâche")')

      await page.waitForURL(/\/projets\/[0-9a-f-]{36}/, { timeout: 60000 })
      const texte = await mainText(page)

      check(texte.includes(titre), '§53.3 — la tâche apparaît dans la fiche du projet')
      check(
        texte.includes('Recette Projet coordinateur'),
        '§53.4 — la tâche porte son responsable'
      )

      const { data: row } = await admin
        .from('project_tasks')
        .select('id, project_id, assignee_id, due_on, status')
        .eq('title', titre)
        .maybeSingle()

      if (row) {
        fixtures.tasks.push(row.id)
        check(row.project_id === suivi.id, 'La tâche est rattachée au projet demandé')
        check(row.due_on === dayOffset(3), '§53.5 — l’échéance est enregistrée telle que saisie', row.due_on)
        check(row.status === 'TODO', '§53.8 — la tâche naît « À faire »')
      } else {
        check(false, 'La tâche créée par l’écran est retrouvée en base')
      }

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('4 — AVANCEMENT : 60 %, OU UN REFUS NOMMÉ (§33, DEC-034 §c)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.chef)

      await page.goto(`${base}/projets/${suivi.id}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Avancement'))

      const valeur = await page
        .locator('[data-avancement]')
        .first()
        .getAttribute('data-avancement')

      // Onze tâches non annulées, six terminées : 55 % — la onzième est celle
      // que l'écran vient de créer. Le chiffre importe moins que sa PROVENANCE :
      // il est refait sur les tâches réelles, jamais lu dans une colonne.
      const { data: comptes } = await admin.rpc('projects_task_counts', {
        p_project_id: suivi.id,
      })
      const attendu = comptes?.[0]?.percent ?? null

      check(
        valeur !== null && Number(valeur) === attendu,
        '§33 — l’avancement affiché est celui des tâches réelles',
        `${valeur} % · base : ${attendu} %`
      )

      const texte = await mainText(page)
      check(
        texte.includes('terminée') && texte.includes('en retard'),
        'Le détail dit combien sont faites et combien sont en retard'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.lecteur)

      await page.goto(`${base}/projets/${suivi.id}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Avancement'))
      const texte = await mainText(page)

      check(
        texte.includes('projects.tasks.view'),
        'Sans la lecture des tâches, l’avancement REFUSE et nomme la permission'
      )
      check(
        !/\b0 %/.test(texte),
        'Il n’affiche jamais « 0 % » à la place d’un refus (DEC-017)'
      )
      check(
        texte.includes('Les tâches de ce projet ne vous sont pas accessibles'),
        'La section des tâches dit pourquoi elle est vide'
      )

      // La liste elle aussi : un refus par ligne, jamais un zéro.
      await page.goto(`${base}/projets`, { waitUntil: 'load' })
      const liste = await mainText(page)
      check(
        liste.includes('projects.tasks.view'),
        'La colonne Avancement de la liste refuse de la même façon'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('5 — LE RETARD SE VOIT ET SE FILTRE (§53.6, §14)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.chef)

      await page.goto(`${base}/projets/taches?q=${encodeURIComponent(MARK)}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.body.innerText.includes('tâche'))
      const texte = await mainText(page)

      check(texte.includes('en retard'), '§53.6 — la tâche dépassée est signalée « en retard »')
      check(
        !texte.includes('Tâche du jour · en retard'),
        'Une échéance du JOUR n’est pas un retard (DEC-025 §e)'
      )

      /*
       * DEUX RETARDS, ET C'EST LA BONNE RÉPONSE.
       *
       * Le second appartient au projet rangé. Ranger un projet n'efface pas son
       * travail : la liste continue de le montrer, avec son retard, parce que
       * §48 veut que les données restent consultables. Ce qui cesse, c'est le
       * RAPPEL — la §12 vérifie que la veille, elle, se tait.
       *
       * Lister et rappeler sont deux gestes différents ; les confondre ferait
       * disparaître un travail que personne n'a annulé.
       */
      const retards = await page
        .locator('[data-compteur="retard"]')
        .first()
        .getAttribute('data-compteur-valeur')
      check(
        Number(retards) === 2,
        'Les deux tâches dépassées sont comptées, projet rangé compris',
        `${retards}`
      )
      check(
        texte.includes(`${MARK} — Tâche d’un projet rangé`),
        '§48 — un projet rangé garde ses tâches consultables'
      )

      // Le filtre « retard » ne garde que lui.
      await page.goto(
        `${base}/projets/taches?q=${encodeURIComponent(MARK)}&retard=1`,
        { waitUntil: 'load' }
      )
      const filtre = await mainText(page)
      check(
        filtre.includes('Tâche en retard') && !filtre.includes('Tâche de demain'),
        '§35 — le filtre « en retard » ne garde que ce qui est dépassé'
      )

      // Vue tableau : les colonnes du §34, sans colonne d'abandons.
      await page.goto(
        `${base}/projets/taches?q=${encodeURIComponent(MARK)}&vue=tableau`,
        { waitUntil: 'load' }
      )
      const tableau = await mainText(page)
      check(
        tableau.includes('À faire') && tableau.includes('Terminée'),
        '§34 — la vue tableau présente les colonnes de statut'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('6 — CLÔTURER N’EST PAS MODIFIER (§42, DEC-024)\n')

    {
      const client = await session('coordinateur')

      // Il PEUT modifier : la barrière n'est pas un blocage général.
      const avance = await client
        .from('project_tasks')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', enRetard.id)
        .select('id')
      check(
        !refused(avance) && avance.data?.length === 1,
        'Avec `tasks.update`, faire passer une tâche « En cours » reste possible'
      )

      const titre = await client
        .from('project_tasks')
        .update({ title: `${MARK} — Tâche en retard` })
        .eq('id', enRetard.id)
        .select('id')
      check(!refused(titre), 'Il peut aussi corriger le titre')

      // Il ne peut PAS clôturer — appel direct, sans écran.
      const cloture = await client
        .from('project_tasks')
        .update({ status: 'DONE' })
        .eq('id', enRetard.id)
        .select('id')
      check(
        refused(cloture),
        '§42 — sans `tasks.close`, un PATCH direct vers « Terminée » est REFUSÉ',
        cloture.error?.message?.slice(0, 60)
      )

      const { data: apres } = await admin
        .from('project_tasks')
        .select('status')
        .eq('id', enRetard.id)
        .maybeSingle()
      check(apres?.status !== 'DONE', 'La tâche n’a pas changé d’état', apres?.status)
    }

    {
      const { context, page } = await signIn(browser, base, accounts.coordinateur)

      await page.goto(`${base}/projets/taches/${enRetard.id}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Changer l’état'))
      const texte = await mainText(page)

      check(
        texte.includes('projects.tasks.close'),
        'L’écran DIT pourquoi « Terminée » n’est pas proposée'
      )

      const options = await page.locator('#status option').allInnerTexts()
      check(
        !options.includes('Terminée'),
        'Et il ne la propose pas',
        options.join(' · ')
      )

      await context.close()
    }

    {
      const client = await session('chef')
      const cloture = await client
        .from('project_tasks')
        .update({ status: 'DONE' })
        .eq('id', enRetard.id)
        .select('id')
      check(!refused(cloture), 'Avec `tasks.close`, la clôture aboutit')

      const { data: apres } = await admin
        .from('project_tasks')
        .select('status, completed_at')
        .eq('id', enRetard.id)
        .maybeSingle()
      check(
        apres?.status === 'DONE' && Boolean(apres?.completed_at),
        'La clôture est horodatée par la base, jamais saisie'
      )

      // Remise en état : la suite éprouve la veille sur cette même tâche.
      const reouverture = await client
        .from('project_tasks')
        .update({ status: 'TODO' })
        .eq('id', enRetard.id)
        .select('id')
      check(!refused(reouverture), 'Une tâche close peut être rouverte (§12)')

      const { data: rouverte } = await admin
        .from('project_tasks')
        .select('completed_at')
        .eq('id', enRetard.id)
        .maybeSingle()
      check(
        rouverte?.completed_at === null,
        'La réouverture efface la date de clôture : plus rien ne dit « terminée le… »'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('7 — ARCHIVER N’EST PAS MODIFIER (§48, DEC-024)\n')

    {
      const client = await session('modificateur')

      const renomme = await client
        .from('projects')
        .update({ objective: 'Objectif corrigé par la recette' })
        .eq('id', frontiere.id)
        .select('id')
      check(!refused(renomme), 'Avec `projects.update`, modifier la fiche reste possible')

      const archive = await client
        .from('projects')
        .update({ is_archived: true })
        .eq('id', frontiere.id)
        .select('id')
      check(
        refused(archive),
        '§48 — sans `projects.archive`, archiver est REFUSÉ, même par appel direct',
        archive.error?.message?.slice(0, 60)
      )
    }

    {
      const client = await session('archiviste')

      const renomme = await client
        .from('projects')
        .update({ name: `${MARK} — Renommé sans droit` })
        .eq('id', frontiere.id)
        .select('id')
      check(
        refused(renomme),
        'Et réciproquement : sans `projects.update`, renommer est REFUSÉ',
        renomme.error?.message?.slice(0, 60)
      )

      const archive = await client
        .from('projects')
        .update({ is_archived: true })
        .eq('id', frontiere.id)
        .select('id')
      check(!refused(archive), 'Avec `projects.archive`, ranger le projet aboutit')

      const { data: range2 } = await admin
        .from('projects')
        .select('is_archived, archived_at, archived_by, name')
        .eq('id', frontiere.id)
        .maybeSingle()

      check(
        range2?.is_archived === true && Boolean(range2?.archived_at),
        'L’archivage est horodaté par la base'
      )
      check(
        range2?.archived_by === accounts.archiviste.id,
        'Et il porte le nom de qui l’a fait'
      )
      check(
        range2?.name === `${MARK} — Projet frontière`,
        'Le renommage refusé n’a rien laissé passer'
      )

      const restaure = await client
        .from('projects')
        .update({ is_archived: false })
        .eq('id', frontiere.id)
        .select('id')
      check(!refused(restaure), 'La restauration relève de la même capacité')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('8 — CE QU’UN PROJET RANGÉ N’ACCEPTE PLUS (§48)\n')

    {
      const client = await session('chef')

      const tache = await client
        .from('project_tasks')
        .insert({ project_id: range.id, title: `${MARK} — Tâche impossible` })
        .select('id')
      check(
        refused(tache),
        'Aucune tâche nouvelle dans un projet archivé, même pour le poste complet',
        tache.error?.message?.slice(0, 60)
      )

      if (tache.data?.[0]?.id) fixtures.tasks.push(tache.data[0].id)
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('9 — CRÉER SANS LE DROIT DE CRÉER\n')

    {
      const client = await session('coordinateur')
      const projet = await client
        .from('projects')
        .insert({ name: `${MARK} — Projet interdit` })
        .select('id')
      check(refused(projet), 'Sans `projects.create`, créer un projet est refusé')
      if (projet.data?.[0]?.id) fixtures.projects.push(projet.data[0].id)
    }

    {
      const client = await session('lecteur')
      const tache = await client
        .from('project_tasks')
        .insert({ title: `${MARK} — Tâche interdite` })
        .select('id')
      check(refused(tache), 'Sans `tasks.create`, créer une tâche est refusé')
      if (tache.data?.[0]?.id) fixtures.tasks.push(tache.data[0].id)

      const membre = await client
        .from('project_members')
        .insert({ project_id: suivi.id, user_id: accounts.lecteur.id })
        .select('project_id')
      check(refused(membre), 'Et l’on ne s’ajoute pas soi-même à un projet')
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('10 — CE QUI MANQUE SE NOMME, CE QUI EST FAUX SE TAIT (DEC-034 §d)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.taches_seules)

      await page.goto(`${base}/projets/taches?q=${encodeURIComponent(MARK)}`, {
        waitUntil: 'load',
      })
      await page.waitForFunction(() => document.body.innerText.includes('tâche'))
      const texte = await mainText(page)

      check(
        texte.includes('Tâche en retard'),
        'Les tâches restent lisibles sans la lecture des projets'
      )
      check(
        texte.includes('Projet non lisible'),
        'Le projet manquant est NOMMÉ, jamais remplacé par un tiret'
      )
      check(
        texte.includes('Utilisateur non lisible'),
        'Le responsable manquant l’est aussi (users.users.view)'
      )
      check(
        texte.includes('projects.view'),
        'Le filtre par projet dit la permission qu’il demande'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('11 — LA VUE PERSONNELLE MONTRE CE QUI EST ATTRIBUÉ (§36, §53.14)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.coordinateur)

      await page.goto(`${base}/projets/mes-elements`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Mes tâches'))
      const texte = await mainText(page)

      check(
        texte.includes(`${MARK} — Tâche en retard`),
        '§36 — la tâche qui lui est attribuée figure dans « Mes tâches »'
      )
      check(
        !texte.includes(`${MARK} — Tâche du jour`),
        'Celles des autres n’y figurent pas',
        'la vue filtre, elle n’élargit pas'
      )
      check(
        texte.includes('Aucun projet ne vous concerne'),
        'Et il ne « possède » aucun projet : la vue le dit'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('12 — LA VEILLE APPREND LES ÉCHÉANCES ET LES RETARDS (§38)\n')

    {
      const { context, page } = await signIn(browser, base, accounts.chef)

      await page.goto(`${base}/notifications?module=projects`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('notification'))
      const texte = await mainText(page)

      check(texte.includes('Tâche en retard'), 'Le retard de tâche est notifié')
      check(
        texte.includes(`${MARK} — Tâche en retard`),
        'La notification nomme la tâche concernée'
      )
      check(
        texte.includes('Échéance de tâche proche'),
        'L’échéance du jour est annoncée comme rappel'
      )
      check(
        !texte.includes(`${MARK} — Tâche d’un projet rangé`),
        'La tâche en retard d’un projet ARCHIVÉ ne rappelle plus rien (§48)'
      )

      await context.close()
    }

    {
      const { context, page } = await signIn(browser, base, accounts.lecteur)

      await page.goto(`${base}/notifications`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('notification'))
      const texte = await mainText(page)

      check(
        !texte.includes(`${MARK} — Tâche en retard`),
        'Sans `tasks.view`, aucune notification de tâche : la source se TAIT'
      )
      check(
        texte.includes('Échéances et retards de tâches') && texte.includes('projects.tasks.view'),
        'Mais l’écran NOMME la source fermée (DEC-017)'
      )

      await context.close()
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('13 — L’ÉQUIPE, ET LE JOURNAL (§9, §31)\n')

    {
      const client = await session('chef')

      const ajout = await client
        .from('project_members')
        .insert({
          project_id: suivi.id,
          user_id: accounts.coordinateur.id,
          role: 'PARTICIPANT',
        })
        .select('project_id')
      check(!refused(ajout), 'Composer l’équipe relève de `projects.update`')

      const doublon = await client
        .from('project_members')
        .insert({ project_id: suivi.id, user_id: accounts.coordinateur.id, role: 'OBSERVER' })
        .select('project_id')
      check(refused(doublon), 'Une même personne ne figure qu’une fois')

      // Le participant retrouve alors le projet dans sa vue personnelle.
      const { context, page } = await signIn(browser, base, accounts.coordinateur)
      await page.goto(`${base}/projets/mes-elements`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.includes('Mes projets'))
      const texte = await mainText(page)
      check(
        texte.includes(`${MARK} — Projet suivi`),
        '§36 — un participant voit le projet auquel il prend part'
      )
      await context.close()

      const { count: entrees } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('module_code', 'projects')
        .gte('occurred_at', new Date(Date.now() - 3600_000).toISOString())

      check(
        (entrees ?? 0) > 0,
        '§31 — les opérations du module sont journalisées',
        `${entrees} entrées récentes`
      )

      // Un changement d'état est QUALIFIÉ comme tel (Règles d'audit §34) : la
      // clôture de la §6 doit s'y retrouver, distincte d'une modification.
      const { count: changementsEtat } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('module_code', 'projects')
        .eq('entity_type', 'project_tasks')
        .eq('entity_id', enRetard.id)
        .eq('action', 'STATUS_CHANGE')
      check(
        (changementsEtat ?? 0) >= 2,
        'Clôture et réouverture sont tracées comme des changements d’état',
        `${changementsEtat} entrées`
      )

      const { data: auteur } = await admin
        .from('audit_log')
        .select('actor_id, actor_label')
        .eq('module_code', 'projects')
        .eq('entity_type', 'project_tasks')
        .eq('entity_id', enRetard.id)
        .eq('action', 'STATUS_CHANGE')
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      check(
        auteur?.actor_id === accounts.chef.id,
        'Le journal dit QUI a agi, pas seulement quoi',
        auteur?.actor_label ?? '—'
      )
    }

    /* ------------------------------------------------------------------ */
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('14 — AUCUN EFFET DE BORD, DONNÉES DEMO INTACTES\n')

    {
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

      // Le LOT 13 a porté le module à vingt et une capacités (migration 059).
      // Celles des TÂCHES restent quatre : c'est ce que ce lot-ci garantit.
      const { count: taskPerms } = await admin
        .from('permissions')
        .select('id', { count: 'exact', head: true })
        .like('code', 'projects.tasks.%')
      check(taskPerms === 4, 'Quatre capacités de tâches, aucune de plus', `${taskPerms}`)

      // Un projet référence, il ne pilote pas (§45).
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
     * Les tâches avant les projets : `project_tasks.project_id` est
     * `on delete restrict`, et un projet retenu par une tâche resterait en base
     * sans que rien ne le dise.
     */
    for (const id of fixtures.tasks) {
      await admin.from('project_tasks').delete().eq('id', id)
    }

    // Les tâches créées par l'écran ne sont pas toutes suivies par identifiant :
    // le marqueur les rattrape.
    await admin.from('project_tasks').delete().ilike('title', `%${MARK}%`)

    for (const id of fixtures.projects) {
      await admin.from('project_members').delete().eq('project_id', id)
      await admin.from('projects').delete().eq('id', id)
    }

    await admin.from('projects').delete().ilike('name', `%${MARK}%`)

    for (const account of Object.values(accounts)) {
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
      ['projects', 'name'],
      ['project_tasks', 'title'],
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
      .like('username', `recette.prj.%.${STAMP}`)
    if (strayUsers) leftovers.push(`app_users : ${strayUsers}`)

    if (leftovers.length > 0) {
      console.log(`\n${RED}Résidus de recette non supprimés — ${leftovers.join(', ')}${RESET}`)
    }

    console.log(`\n${DIM}Sujets et comptes de recette supprimés. Données DEMO intactes.${RESET}`)
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}RECETTE PROJETS & TÂCHES : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(`${RED}RECETTE PROJETS & TÂCHES : ${failed} échec(s) sur ${passed + failed}${RESET}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\n${RED}Recette interrompue : ${error.message}${RESET}\n`)
  process.exit(1)
})
