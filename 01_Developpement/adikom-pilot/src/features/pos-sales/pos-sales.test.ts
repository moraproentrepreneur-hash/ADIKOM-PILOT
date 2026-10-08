import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { NAVIGATION, filterNavigation, isSection } from '@/lib/navigation'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER } from '@/features/treasury/constants'
import {
  COUNTER_METHODS,
  hasDiscount,
  needsAccount,
  previewSale,
  searchSellable,
  type CartLine,
  type CartPayment,
  type SellableItem,
} from './constants'

/**
 * Point de vente — ventes et encaissement (LOT 28, Module 12 §12 à §22).
 *
 * Ce que ces tests gardent SANS base :
 *
 *   1. la RÈGLE DE LA MONNAIE telle que la caisse l'annonce — le test de
 *      référence de la Direction, le paiement mixte, les refus (la base décide,
 *      l'écran doit dire la même chose) ;
 *   2. les REMISES selon DEC-051 §c et §d ;
 *   3. D-2 : Mvola, Holo, Wakati sont des modes de règlement partout ;
 *   4. la NAVIGATION des ventes, chacune sous SA capacité ;
 *   5. les MIGRATIONS du lot relues comme du texte : S-1 en premier et
 *      distinctes, enums isolés, aucune `SECURITY DEFINER`, une écriture de
 *      l'ENCAISSÉ, facture sur demande sans écriture, sauvegarde à 69 ;
 *   6. le REÇU ne lit aucun coût.
 *
 * Les refus en base — C-2, B-10, P-4, D-3 — s'éprouvent sous RLS réelle :
 * `supabase/tests/pos_sales.sql`.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations')

function lotMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.startsWith('20261009') && name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8') }))
}

const line = (unitPrice: number, quantity = 1, discount = 0, label = 'Service'): CartLine => ({
  variantId: `${label}-${unitPrice}`,
  label,
  unitPrice,
  quantity,
  discount,
})

const pay = (method: CartPayment['method'], tendered: number, accountId: string | null = null): CartPayment => ({
  method,
  tendered,
  accountId: method === 'CASH' ? null : (accountId ?? 'compte-mvola'),
  externalRef: '',
})

describe('🟥 la règle de la monnaie — le test de référence de la Direction', () => {
  it('net 60 000, donné 100 000 → encaissé 60 000, monnaie 40 000', () => {
    const preview = previewSale([line(60000)], 0, [pay('CASH', 100000)])
    expect(preview.net).toBe(60000)
    expect(preview.cashTendered).toBe(100000)
    expect(preview.paid).toBe(60000)
    expect(preview.change).toBe(40000)
    expect(preview.remaining).toBe(0)
    expect(preview.problems).toEqual([])
  })

  it('montant exact : monnaie nulle', () => {
    const preview = previewSale([line(60000)], 0, [pay('CASH', 60000)])
    expect(preview.paid).toBe(60000)
    expect(preview.change).toBe(0)
  })

  it('montant inférieur : un reste dû, jamais un encaissé gonflé', () => {
    const preview = previewSale([line(100000)], 0, [pay('CASH', 30000)])
    expect(preview.paid).toBe(30000)
    expect(preview.remaining).toBe(70000)
    expect(preview.change).toBe(0)
  })

  it('paiement mixte : Mvola pour son montant, les espèces pour le reste', () => {
    const preview = previewSale([line(60000), line(25000)], 0, [pay('MVOLA', 50000), pay('CASH', 50000)])
    expect(preview.net).toBe(85000)
    expect(preview.nonCash).toBe(50000)
    expect(preview.cashApplied).toBe(35000)
    expect(preview.paid).toBe(85000)
    expect(preview.change).toBe(15000)
  })

  it('refuse la monnaie hors espèces', () => {
    const preview = previewSale([line(85000)], 0, [pay('MVOLA', 90000)])
    expect(preview.problems.some((problem) => /monnaie/i.test(problem))).toBe(true)
  })

  it('refuse deux remises d’espèces, et des espèces inutiles', () => {
    expect(previewSale([line(85000)], 0, [pay('CASH', 50000), pay('CASH', 50000)]).problems.length).toBeGreaterThan(0)
    expect(previewSale([line(50000)], 0, [pay('CHEQUE', 50000), pay('CASH', 1000)]).problems.length).toBeGreaterThan(0)
  })

  it('exige le compte d’un paiement hors espèces (D-3)', () => {
    const preview = previewSale([line(50000)], 0, [{ method: 'HOLO', tendered: 50000, accountId: null, externalRef: '' }])
    expect(preview.problems.some((problem) => /compte/i.test(problem))).toBe(true)
    expect(needsAccount('CASH')).toBe(false)
    expect(COUNTER_METHODS.filter(needsAccount)).toEqual(['CHEQUE', 'MVOLA', 'HOLO', 'WAKATI'])
  })

  it('un panier vide ne se valide pas', () => {
    expect(previewSale([], 0, []).problems).toContain('Le panier est vide.')
  })
})

describe('🟥 les remises — DEC-051', () => {
  it('ligne puis globale : 60 000 − 10 000 + 25 000 − 5 000 = 70 000, soldée', () => {
    const preview = previewSale([line(60000, 1, 10000), line(25000)], 5000, [pay('CASH', 70000)])
    expect(preview.subtotal).toBe(75000)
    expect(preview.net).toBe(70000)
    expect(preview.remaining).toBe(0)
    expect(hasDiscount([line(60000, 1, 10000)], 0)).toBe(true)
    expect(hasDiscount([line(60000)], 5000)).toBe(true)
    expect(hasDiscount([line(60000)], 0)).toBe(false)
  })

  it('une remise de ligne ne dépasse pas son brut', () => {
    expect(previewSale([line(25000, 1, 30000)], 0, []).problems.length).toBeGreaterThan(0)
  })

  it('la remise globale ne dépasse pas le sous-total', () => {
    expect(previewSale([line(25000)], 30000, []).problems.length).toBeGreaterThan(0)
  })

  it('aucun plafond : une remise totale donne un net nul, sans paiement', () => {
    const preview = previewSale([line(25000, 1, 25000)], 0, [])
    expect(preview.net).toBe(0)
    expect(preview.problems).toEqual([])
  })
})

describe('recherche dans le catalogue vendable', () => {
  const items: SellableItem[] = [
    { variantId: 'a', serviceLabel: 'Transfert aéroport', variantLabel: 'Standard', unitLabel: 'trajet', price: 25000 },
    { variantId: 'b', serviceLabel: 'Excursion Itsandra', variantLabel: 'Groupe', unitLabel: null, price: 60000 },
  ]

  it('filtre sans tenir compte des accents ni de la casse', () => {
    expect(searchSellable(items, 'AEROPORT').map((item) => item.variantId)).toEqual(['a'])
    expect(searchSellable(items, 'excursion groupe').map((item) => item.variantId)).toEqual(['b'])
    expect(searchSellable(items, '')).toHaveLength(2)
    expect(searchSellable(items, 'plongée')).toHaveLength(0)
  })
})

describe('D-2 — Mvola, Holo, Wakati partout', () => {
  it('sont des modes de règlement, libellés', () => {
    for (const method of ['MVOLA', 'HOLO', 'WAKATI'] as const) {
      expect(PAYMENT_METHOD_ORDER).toContain(method)
      expect(PAYMENT_METHOD_LABELS[method]).toBeTruthy()
    }
  })

  it('sont admis par les formulaires de règlement client et fournisseur', () => {
    for (const file of ['features/customer-payments/actions.ts', 'features/supplier-invoices/payments-actions.ts']) {
      const source = readFileSync(resolve(ROOT, 'src', file), 'utf8')
      for (const method of ['MVOLA', 'HOLO', 'WAKATI']) expect(source, file).toContain(`'${method}'`)
    }
  })
})

describe('navigation des ventes', () => {
  const section = NAVIGATION.filter(isSection).find((entry) => entry.label === 'Point de vente')

  it('ouvre la section Point de vente par la caisse et l’historique, chacun sous SA capacité', () => {
    expect(section?.items.slice(0, 2).map((item) => [item.href, item.permission])).toEqual([
      ['/pdv/caisse', PERMISSIONS.POS_SALES_CREATE],
      ['/pdv/ventes', PERMISSIONS.POS_SALES_VIEW],
    ])
    expect(NAVIGATION.filter(isSection).some((entry) => entry.label === 'Ventes au comptoir')).toBe(false)
    expect(section?.items.every((item) => item.status === 'ready')).toBe(true)
  })

  it('montre l’historique à qui ne peut que consulter', () => {
    const visible = filterNavigation(NAVIGATION, new Set([PERMISSIONS.POS_SALES_VIEW]), false)
    const sales = visible.filter(isSection).find((entry) => entry.label === 'Point de vente')
    expect(sales?.items.map((item) => item.href)).toEqual(['/pdv/ventes'])
  })
})

describe('🟥 migrations du LOT 28', () => {
  const migrations = lotMigrations()
  const all = migrations.map((m) => m.sql).join('\n')

  it('commencent après le bloc réservé du LOT 27, S-1 en premier et distinctes', () => {
    expect(migrations.every((m) => m.name >= '20261009000100')).toBe(true)
    expect(migrations[0].name).toMatch(/une_facture_client_nait_par_sa_fonction/)
    expect(migrations[1].name).toMatch(/un_reglement_client_nait_par_sa_fonction/)
    // S-1 n'ajoute ni table, ni colonne : seulement la garde et la reprise d'une fonction.
    for (const m of migrations.slice(0, 2)) {
      expect(m.sql, m.name).not.toMatch(/^\s*(create table|alter table)/im)
    }
  })

  it('isolent chaque extension d’énumération', () => {
    for (const m of migrations.filter((m) => /alter type/i.test(m.sql))) {
      const statements = m.sql
        .split('\n')
        .filter((sqlLine) => sqlLine.trim() && !sqlLine.trim().startsWith('--'))
      expect(statements.every((statement) => /^alter type public\.\w+ add value if not exists '\w+';$/.test(statement.trim())), m.name).toBe(true)
    }
    expect(all).toMatch(/payment_method add value if not exists 'MVOLA'/)
    expect(all).toMatch(/treasury_entry_kind add value if not exists 'POS_SALE'/)
  })

  it('ne déclarent aucune fonction SECURITY DEFINER', () => {
    expect(all).not.toMatch(/^\s*security\s+definer\s*$/im)
  })

  it('posent la garde « née par sa fonction » sur les tables du lot et de S-1', () => {
    for (const table of ['pos_sales', 'pos_sale_lines', 'pos_payments', 'commercial_line_costs', 'customer_invoices', 'customer_payments']) {
      expect(all).toContain(`create trigger ${table}_zzz_born_by_function`)
    }
  })

  it('🟥 écrivent l’ENCAISSÉ en trésorerie, jamais le DONNÉ', () => {
    const fn = migrations.find((m) => m.name.includes('encaisser'))!.sql
    expect(fn).toMatch(/'POS_SALE', v_cash_applied/)
    expect(fn).not.toMatch(/'POS_SALE', v_cash_tendered/)
    const source = migrations.find((m) => m.name.includes('cinquieme_origine'))!.sql
    expect(source).toMatch(/new\.amount is distinct from pp\.applied_amount/)
  })

  it('🟥 C-2 : la facture sur demande n’écrit rien en trésorerie, un règlement adossé n’a pas d’écriture', () => {
    const fn = migrations.find((m) => m.name.includes('encaisser'))!.sql
    const invoice = fn.slice(fn.indexOf('create or replace function public.invoice_pos_sale'), fn.indexOf('create or replace function public.record_pos_sale'))
    expect(invoice).not.toMatch(/insert into public\.treasury_entries/i)
    expect(invoice).not.toMatch(/record_customer_payment\(/)
    expect(all).toMatch(/if cp\.pos_payment_id is not null then/)
  })

  it('n’ajoutent aucune pos_sales.customer_invoice_id (DEC-055 §b)', () => {
    expect(all).not.toMatch(/customer_invoice_id\s+uuid[^\n]*\n?[^\n]*pos_sales/)
    expect(all).not.toMatch(/alter table public\.pos_sales\s+add column[^;]*invoice/i)
  })

  it('portent le catalogue à 246 et la sauvegarde à 69', () => {
    expect(all).toMatch(/v_total <> 246/)
    expect(all).toMatch(/<> 69/)
  })

  it('révoquent anon et accordent authenticated sur chaque acte du lot', () => {
    for (const fn of ['record_pos_sale', 'invoice_pos_sale', 'cancel_pos_sale', 'pos_session_expected']) {
      expect(all).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\(`))
      expect(all).toMatch(new RegExp(`grant\\s+execute on function public\\.${fn}\\(`))
    }
  })
})

describe('🟥 le reçu ne porte ni coût ni marge', () => {
  it('ne lit aucun champ de coût', () => {
    const receipt = readFileSync(resolve(ROOT, 'src/features/pos-sales/documents/sale-receipt.tsx'), 'utf8')
    expect(receipt).not.toMatch(/unitCost|unit_cost|commercial_line_costs/)
  })

  it('est construit à partir d’une vente chargée sans coût', () => {
    const registry = readFileSync(resolve(ROOT, 'src/lib/documents/registry.ts'), 'utf8')
    const entry = registry.slice(registry.indexOf('  ventes: {'), registry.indexOf('/* -------------------------------------------------------- Tarification'))
    expect(entry).toMatch(/canSeeCosts: false/)
    expect(entry).toMatch(/POS_SALES_DOWNLOAD/)
    expect(entry).toMatch(/POS_SALES_PRINT/)
  })
})
