#!/usr/bin/env node
/**
 * Recette sécurité du référentiel d'exploitation — ADIKOM PILOT (Étape 2.2).
 *
 * Ouvre de vraies sessions utilisateur et vérifie ce que chacune peut
 * réellement atteindre — par appel direct, sans passer par l'interface. C'est
 * le seul contrôle qui vaille : masquer un bouton n'est pas une protection
 * (05_Regles_Metier/05_Permissions.md §50 et §85).
 *
 * Trois profils sont éprouvés :
 *   · le visiteur anonyme, muni de la seule clé publique ;
 *   · un compte authentifié sans aucune permission ;
 *   · un compte de consultation, autorisé à voir les tiers et le parc, mais
 *     PAS les coordonnées bancaires — la séparation la plus sensible du lot.
 *
 * Les jeux d'essai et les comptes sont retirés en fin d'exécution.
 *
 * Utilisation :
 *   npm run verify:referential
 */

import { createClient } from '@supabase/supabase-js'

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

/** Une écriture non autorisée doit échouer : l'absence d'erreur est l'échec. */
function refused(error, label) {
  if (error) ok(label, String(error.message).slice(0, 52))
  else ko(label, '*** OPÉRATION AUTORISÉE À TORT ***')
}

/**
 * Une lecture non autorisée ne lève pas d'erreur sous RLS : elle renvoie un
 * ensemble vide. Seule compte l'absence de donnée renvoyée.
 */
function noRows(result, label) {
  if (result.error) {
    ok(label, `refus explicite — ${String(result.error.message).slice(0, 40)}`)
  } else if (!result.data || result.data.length === 0) {
    ok(label, 'aucune ligne renvoyée')
  } else {
    ko(label, `*** ${result.data.length} LIGNE(S) LISIBLE(S) ***`)
  }
}

function hasRows(result, label) {
  if (result.error) {
    ko(label, result.error.message)
  } else if (result.data && result.data.length > 0) {
    ok(label, `${result.data.length} ligne(s)`)
  } else {
    ko(label, 'aucune ligne renvoyée alors que la permission est accordée')
  }
}

const MARKER = 'RECETTE 2.2'

const ACCOUNTS = {
  none: {
    username: 'recette.referentiel.nul',
    email: 'recette.referentiel.nul@adikom.test',
    password: 'recette-referentiel-2026',
    permissions: [],
  },
  reader: {
    username: 'recette.referentiel.lecture',
    email: 'recette.referentiel.lecture@adikom.test',
    password: 'recette-referentiel-2026',
    permissions: [
      'parties.clients.view',
      'parties.suppliers.view',
      'rental.fleet.view',
      'rental.pricing.view',
      // Volontairement ABSENTE : parties.suppliers.bank.view
    ],
  },
}

async function createAccount(admin, spec) {
  const { data: list } = await admin.auth.admin.listUsers()
  const stale = list?.users.find((u) => u.email === spec.email)
  if (stale) {
    await admin.from('user_permissions').delete().eq('user_id', stale.id)
    await admin.from('app_users').delete().eq('id', stale.id)
    await admin.auth.admin.deleteUser(stale.id)
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password: spec.password,
    email_confirm: true,
  })

  if (error || !created.user) {
    throw new Error(`création du compte ${spec.username} : ${error?.message}`)
  }

  const id = created.user.id

  const { error: profileError } = await admin.from('app_users').insert({
    id,
    first_name: 'Recette',
    last_name: spec.username,
    username: spec.username,
    email: spec.email,
    status: 'ACTIVE',
  })

  if (profileError) throw new Error(`profil ${spec.username} : ${profileError.message}`)

  if (spec.permissions.length > 0) {
    const { data: catalog } = await admin
      .from('permissions')
      .select('id, code')
      .in('code', spec.permissions)

    const rows = (catalog ?? []).map((permission) => ({
      user_id: id,
      permission_id: permission.id,
      effect: 'ALLOW',
    }))

    const { error: grantError } = await admin.from('user_permissions').insert(rows)
    if (grantError) throw new Error(`permissions ${spec.username} : ${grantError.message}`)
  }

  return id
}

async function signIn(url, anonKey, spec) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await client.auth.signInWithPassword({
    email: spec.email,
    password: spec.password,
  })

  if (error) throw new Error(`session ${spec.username} : ${error.message}`)
  return client
}

async function main() {
  loadEnvFile()

  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nProjet : ${url}\n`)

  const fixtures = { categoryId: null, supplierId: null, clientId: null, vehicleId: null, ruleId: null }
  const accounts = { none: null, reader: null }

  try {
    // ------------------------------------------------------- préparation ----
    accounts.none = await createAccount(admin, ACCOUNTS.none)
    accounts.reader = await createAccount(admin, ACCOUNTS.reader)

    const { data: category } = await admin
      .from('vehicle_categories')
      .insert({ code: `REC-${Date.now()}`, label: `${MARKER} — Catégorie` })
      .select('id')
      .single()
    fixtures.categoryId = category.id

    const { data: supplierNo } = await admin.rpc('next_number', { p_entity_key: 'supplier' })
    const { data: supplier } = await admin
      .from('suppliers')
      .insert({ supplier_no: supplierNo, legal_name: `${MARKER} — Fournisseur`, phone: '+269 000' })
      .select('id')
      .single()
    fixtures.supplierId = supplier.id

    await admin.from('supplier_bank_details').insert({
      supplier_id: supplier.id,
      bank_name: `${MARKER} — Banque`,
      account_number: '0001234567',
      iban: 'KM0000000000000000',
    })

    const { data: clientNo } = await admin.rpc('next_number', { p_entity_key: 'client' })
    const { data: client } = await admin
      .from('clients')
      .insert({
        client_no: clientNo,
        type: 'COMPANY',
        legal_name: `${MARKER} — Client`,
        phone: '+269 111',
      })
      .select('id')
      .single()
    fixtures.clientId = client.id

    const { data: vehicleNo } = await admin.rpc('next_number', { p_entity_key: 'vehicle' })
    const { data: vehicle } = await admin
      .from('vehicles')
      .insert({
        vehicle_no: vehicleNo,
        brand: MARKER,
        model: 'Véhicule',
        category_id: category.id,
      })
      .select('id')
      .single()
    fixtures.vehicleId = vehicle.id

    const { data: rule } = await admin
      .from('pricing_rules')
      .insert({ vehicle_id: vehicle.id, amount: 500000, unit: 'DAY' })
      .select('id')
      .single()
    fixtures.ruleId = rule.id

    console.log(`${DIM}Jeu d'essai et comptes de recette créés.${RESET}`)

    // ------------------------------------------- 1. Visiteur anonyme --------
    console.log('\n1. Visiteur anonyme, muni de la seule clé publique')
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    noRows(await anon.from('clients').select('id').limit(1), 'Clients illisibles')
    noRows(await anon.from('suppliers').select('id').limit(1), 'Fournisseurs illisibles')
    noRows(
      await anon.from('supplier_bank_details').select('supplier_id').limit(1),
      'Coordonnées bancaires illisibles'
    )
    noRows(await anon.from('vehicles').select('id').limit(1), 'Véhicules illisibles')
    noRows(await anon.from('pricing_rules').select('id').limit(1), 'Tarifs illisibles')
    noRows(
      await anon.from('vehicle_occupations').select('id').limit(1),
      'Calendrier des véhicules illisible'
    )
    noRows(
      await anon.from('vehicle_documents').select('id').limit(1),
      'Documents des véhicules illisibles'
    )

    /*
     * Fonctions SECURITY DEFINER : elles s'exécutent avec les droits de leur
     * propriétaire, et RLS ne les protège donc pas. Seul le droit d'EXÉCUTION
     * les met hors de portée (migration 022).
     *
     * Le contrôle sur `log_audit` est le plus important du lot : une entrée
     * écrite dans le journal ne peut plus jamais en être retirée. Si ce
     * contrôle échoue un jour, il laissera lui-même une trace indélébile —
     * ce qui est exactement le signal recherché.
     */
    refused(
      (await anon.rpc('next_number', { p_entity_key: 'client' })).error,
      'Génération de numéro refusée'
    )
    refused(
      (await anon.rpc('log_audit', { p_action: 'LOGIN', p_entity_type: 'sonde_anonyme' })).error,
      'Écriture dans le journal d’audit refusée'
    )
    refused(
      (await anon.rpc('has_permission', { p_code: 'users.users.view' })).error,
      'Interrogation du moteur d’autorisation refusée'
    )
    refused(
      (await anon.rpc('is_super_admin', {})).error,
      'Identification des comptes d’administration refusée'
    )
    refused(
      (await anon.rpc('my_permissions')).error,
      'Lecture des permissions refusée'
    )

    // ------------------------------- 2. Compte sans aucune permission -------
    console.log('\n2. Compte authentifié, aucune permission')
    const none = await signIn(url, anonKey, ACCOUNTS.none)

    noRows(await none.from('clients').select('id').limit(1), 'Clients illisibles')
    noRows(await none.from('suppliers').select('id').limit(1), 'Fournisseurs illisibles')
    noRows(await none.from('vehicles').select('id').limit(1), 'Véhicules illisibles')
    noRows(await none.from('pricing_rules').select('id').limit(1), 'Tarifs illisibles')
    noRows(
      await none.from('supplier_bank_details').select('supplier_id').limit(1),
      'Coordonnées bancaires illisibles'
    )

    refused(
      (
        await none.from('clients').insert({
          client_no: 'CLI-INTRUS',
          type: 'COMPANY',
          legal_name: 'Intrus',
          phone: '+269 999',
        })
      ).error,
      'Création de client refusée'
    )

    refused(
      (
        await none.from('vehicles').insert({
          vehicle_no: 'VEH-INTRUS',
          brand: 'Intrus',
          model: 'Test',
          category_id: fixtures.categoryId,
        })
      ).error,
      'Création de véhicule refusée'
    )

    refused(
      (await none.from('pricing_rules').insert({ amount: 1, unit: 'DAY' })).error,
      'Création de tarif refusée'
    )

    refused(
      (
        await none.from('vehicle_occupations').insert({
          vehicle_id: fixtures.vehicleId,
          source: 'IMMOBILIZATION',
          period: '[2030-01-01,2030-01-02)',
        })
      ).error,
      'Blocage de calendrier refusé'
    )

    const { error: deleteError, count: deleteCount } = await none
      .from('clients')
      .delete({ count: 'exact' })
      .eq('id', fixtures.clientId)

    if (deleteError) {
      ok('Suppression de client refusée', String(deleteError.message).slice(0, 52))
    } else if (!deleteCount) {
      ok('Suppression de client sans effet', 'aucune ligne supprimée')
    } else {
      ko('Suppression de client refusée', '*** LA FICHE A ÉTÉ SUPPRIMÉE ***')
    }

    await none.auth.signOut()

    // ---------------------- 3. Compte de consultation, sans accès bancaire --
    console.log('\n3. Compte de consultation — tiers et parc, sans accès bancaire')
    const reader = await signIn(url, anonKey, ACCOUNTS.reader)

    hasRows(await reader.from('clients').select('id').limit(5), 'Clients lisibles')
    hasRows(await reader.from('suppliers').select('id').limit(5), 'Fournisseurs lisibles')
    hasRows(await reader.from('vehicles').select('id').limit(5), 'Véhicules lisibles')
    hasRows(await reader.from('pricing_rules').select('id').limit(5), 'Tarifs lisibles')

    // Le contrôle central du lot : voir un fournisseur ne donne pas accès à son
    // RIB (05_Regles_Metier/04_Fournisseurs.md §44, 03_Modules/04_Tiers.md §22).
    noRows(
      await reader
        .from('supplier_bank_details')
        .select('supplier_id, iban')
        .eq('supplier_id', fixtures.supplierId),
      'Coordonnées bancaires INVISIBLES malgré l’accès au fournisseur'
    )

    refused(
      (
        await reader.from('supplier_bank_details').upsert({
          supplier_id: fixtures.supplierId,
          iban: 'KM9999999999999999',
        })
      ).error,
      'Modification des coordonnées bancaires refusée'
    )

    refused(
      (
        await reader.from('clients').insert({
          client_no: 'CLI-LECTEUR',
          type: 'COMPANY',
          legal_name: 'Lecteur',
          phone: '+269 888',
        })
      ).error,
      'Création de client refusée malgré le droit de lecture'
    )

    const { error: readerUpdate, count: readerCount } = await reader
      .from('vehicles')
      .update({ brand: 'Modifié sans droit' }, { count: 'exact' })
      .eq('id', fixtures.vehicleId)

    if (readerUpdate) {
      ok('Modification de véhicule refusée', String(readerUpdate.message).slice(0, 52))
    } else if (!readerCount) {
      ok('Modification de véhicule sans effet', 'aucune ligne modifiée')
    } else {
      ko('Modification de véhicule refusée', '*** LE VÉHICULE A ÉTÉ MODIFIÉ ***')
    }

    // Le résolveur s'exécute avec les droits de l'appelant : il ne révèle donc
    // que les tarifs que celui-ci a le droit de lire.
    const { data: resolved, error: resolveError } = await reader.rpc('resolve_pricing_rule', {
      p_client_id: fixtures.clientId,
      p_vehicle_id: fixtures.vehicleId,
    })

    if (resolveError) {
      ko('Résolution tarifaire', resolveError.message)
    } else if (resolved?.[0]?.amount === 500000 && resolved[0].source === 'VEHICLE') {
      ok('Résolution tarifaire', `500 000 KMF · source ${resolved[0].source}`)
    } else {
      ko('Résolution tarifaire', `résultat inattendu : ${JSON.stringify(resolved)}`)
    }

    await reader.auth.signOut()
  } finally {
    // --------------------------------------------------------- nettoyage ----
    // Possible parce qu'aucun utilisateur n'est authentifié : la suppression
    // reste réservée aux opérations d'environnement (migration 021, DEC-020).
    if (fixtures.ruleId) await admin.from('pricing_rules').delete().eq('id', fixtures.ruleId)
    if (fixtures.vehicleId) await admin.from('vehicles').delete().eq('id', fixtures.vehicleId)
    if (fixtures.clientId) await admin.from('clients').delete().eq('id', fixtures.clientId)
    if (fixtures.supplierId) await admin.from('suppliers').delete().eq('id', fixtures.supplierId)
    if (fixtures.categoryId) {
      await admin.from('vehicle_categories').delete().eq('id', fixtures.categoryId)
    }

    for (const id of Object.values(accounts)) {
      if (!id) continue
      await admin.from('user_permissions').delete().eq('user_id', id)
      await admin.from('app_users').delete().eq('id', id)
      await admin.auth.admin.deleteUser(id)
    }

    console.log(`\n${DIM}Jeu d'essai et comptes de recette supprimés.${RESET}`)
  }

  console.log(`\n${'─'.repeat(62)}`)
  if (failed === 0) {
    console.log(`${GREEN}RECETTE SÉCURITÉ DU RÉFÉRENTIEL : ${passed} contrôles, tous réussis${RESET}\n`)
  } else {
    console.log(
      `${RED}RECETTE SÉCURITÉ DU RÉFÉRENTIEL : ${failed} échec(s) sur ${passed + failed}${RESET}\n`
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
