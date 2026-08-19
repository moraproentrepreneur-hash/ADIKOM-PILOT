#!/usr/bin/env node
/**
 * Inspection du schéma déployé — ADIKOM PILOT.
 *
 * Produit un état des lieux lisible de la base Supabase Cloud : tables, RLS,
 * policies, triggers, fonctions, contraintes et données de référence.
 *
 * Lecture seule : ce script ne modifie jamais la base.
 *
 * Utilisation :
 *   npm run db:inspect
 */

import pg from 'pg'

import { loadEnvFile, maskConnectionString, required } from './lib/env.mjs'

const QUERIES = [
  {
    title: 'Tables et sécurité au niveau des lignes',
    sql: `
      select
        c.relname                                     as "table",
        case when c.relrowsecurity then 'oui' else 'NON' end as "rls",
        (select count(*) from pg_policy p where p.polrelid = c.oid) as "policies",
        (select count(*) from pg_trigger t
          where t.tgrelid = c.oid and not t.tgisinternal)          as "triggers"
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname;
    `,
  },
  {
    title: 'Fonctions du socle',
    sql: `
      select
        p.proname                                        as "fonction",
        case when p.prosecdef then 'definer' else 'invoker' end as "securite",
        pg_get_function_result(p.oid)                    as "retour"
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      order by p.proname;
    `,
  },
  {
    title: 'Contraintes de contrôle et unicité',
    sql: `
      select
        rel.relname            as "table",
        con.conname            as "contrainte",
        case con.contype
          when 'c' then 'CHECK'
          when 'u' then 'UNIQUE'
          when 'f' then 'CLE ETRANGERE'
          when 'p' then 'CLE PRIMAIRE'
          when 'x' then 'EXCLUSION'
        end                    as "type"
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname = 'public' and con.contype in ('c', 'u', 'x')
      order by rel.relname, con.conname;
    `,
  },
  {
    title: 'Catalogue des permissions par module',
    sql: `
      select
        module_label                                  as "module",
        count(*)                                      as "permissions",
        count(*) filter (where is_sensitive)          as "sensibles"
      from public.permissions
      group by module_label, module_order
      order by module_order;
    `,
  },
  {
    title: 'Organisation de départ',
    sql: `
      select
        g.name                                        as "groupe",
        count(gp.permission_id)                       as "permissions",
        count(gp.permission_id) filter (where p.is_sensitive) as "sensibles"
      from public.groups g
      left join public.group_permissions gp on gp.group_id = g.id
      left join public.permissions p on p.id = gp.permission_id
      group by g.name, g.sort_order
      order by g.sort_order;
    `,
  },
  {
    title: 'Règles de numérotation',
    sql: `
      select entity_key as "objet", prefix as "prefixe",
             include_year as "annee", padding as "longueur",
             reset_yearly as "remise a zero", current_value as "compteur"
      from public.numbering_rules
      order by entity_key;
    `,
  },
  {
    title: 'Comptes utilisateurs',
    sql: `
      select
        coalesce(username, '—')                       as "identifiant",
        first_name || ' ' || last_name                as "nom",
        status                                        as "statut",
        case when is_super_admin then 'oui' else '—' end as "super admin"
      from public.app_users
      order by is_super_admin desc, last_name;
    `,
  },
  {
    title: 'Derniers événements du journal d’audit',
    sql: `
      select
        to_char(occurred_at, 'DD/MM HH24:MI')         as "quand",
        coalesce(actor_label, 'système')              as "qui",
        action                                        as "action",
        entity_type                                   as "objet",
        result                                        as "resultat"
      from public.audit_log
      order by occurred_at desc
      limit 12;
    `,
  },
]

function renderTable(rows) {
  if (rows.length === 0) return '  (aucune ligne)'

  const columns = Object.keys(rows[0])
  const widths = columns.map((col) =>
    Math.max(col.length, ...rows.map((row) => String(row[col] ?? '').length))
  )

  const header = columns.map((col, i) => col.padEnd(widths[i])).join('  ')
  const rule = widths.map((w) => '─'.repeat(w)).join('  ')
  const body = rows.map((row) =>
    columns.map((col, i) => String(row[col] ?? '').padEnd(widths[i])).join('  ')
  )

  return ['  ' + header, '  ' + rule, ...body.map((line) => '  ' + line)].join('\n')
}

async function main() {
  loadEnvFile()

  const connectionString = required(
    'SUPABASE_DB_URL',
    'Tableau de bord Supabase → Project Settings → Database → Connection string (URI).'
  )

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  console.log(`\nBase : ${maskConnectionString(connectionString)}`)

  try {
    for (const { title, sql } of QUERIES) {
      console.log(`\n\n━━ ${title} ${'━'.repeat(Math.max(0, 60 - title.length))}\n`)
      try {
        const { rows } = await client.query(sql)
        console.log(renderTable(rows))
      } catch (error) {
        console.log(`  ✖ ${error.message}`)
      }
    }
    console.log('\n')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`)
  process.exit(1)
})
