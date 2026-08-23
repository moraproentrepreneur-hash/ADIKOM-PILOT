import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { SupplierPaymentKind, SupplierStatus, SupplierType } from './constants'

/**
 * Accès aux données du module Fournisseurs.
 *
 * Les informations de paiement vivent dans une table distincte, protégée par sa
 * propre permission : voir un fournisseur ne donne pas accès à ses coordonnées
 * de règlement (05_Regles_Metier/04_Fournisseurs.md §44, 03_Modules/04_Tiers.md
 * §22). La restriction est portée par RLS, pas par l'affichage.
 */

export {
  PAYMENT_KIND_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  STATUS_HINTS,
  TYPE_LABELS,
} from './constants'
export type { SupplierPaymentKind, SupplierStatus, SupplierType } from './constants'

export type SupplierListItem = {
  id: string
  supplierNo: string
  type: SupplierType
  legalName: string
  tradeName: string | null
  contactName: string | null
  phone: string
  email: string | null
  city: string | null
  status: SupplierStatus
  vehicleCount: number
}

export type SupplierDetail = Omit<SupplierListItem, 'vehicleCount'> & {
  phoneSecondary: string | null
  address: string | null
  country: string | null
  registrationNumber: string | null
  taxIdentifier: string | null
  administrativeNotes: string | null
  notes: string | null
  statusReason: string | null
  statusChangedAt: string | null
  createdAt: string
  updatedAt: string
}

type RawSupplierRow = {
  id: string
  supplier_no: string
  type: SupplierType
  legal_name: string
  trade_name: string | null
  contact_name: string | null
  phone: string
  email: string | null
  city: string | null
  status: SupplierStatus
  vehicles?: { count: number }[] | null
}

const BASE_SELECT = `
  id, supplier_no, type, legal_name, trade_name, contact_name,
  phone, email, city, status
`

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export type SupplierFilters = {
  search?: string
  status?: string
  type?: string
}

export async function listSuppliers(filters: SupplierFilters = {}): Promise<SupplierListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('suppliers').select(`${BASE_SELECT}, vehicles ( count )`)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(
      [
        `legal_name.ilike.%${search}%`,
        `trade_name.ilike.%${search}%`,
        `contact_name.ilike.%${search}%`,
        `supplier_no.ilike.%${search}%`,
        `phone.ilike.%${search}%`,
        `email.ilike.%${search}%`,
      ].join(',')
    )
  }

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.type) query = query.eq('type', filters.type)

  const { data, error } = await query.order('legal_name').limit(200)

  if (error) {
    reportQueryFailure('fournisseurs', error, 'La liste des fournisseurs n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawSupplierRow[]).map((row) => ({
    id: row.id,
    supplierNo: row.supplier_no,
    type: row.type,
    legalName: row.legal_name,
    tradeName: row.trade_name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    city: row.city,
    status: row.status,
    vehicleCount: row.vehicles?.[0]?.count ?? 0,
  }))
}

export async function getSupplierDetail(id: string): Promise<SupplierDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select(
      `${BASE_SELECT}, phone_secondary, address, country, registration_number,
       tax_identifier, administrative_notes, notes, status_reason,
       status_changed_at, created_at, updated_at`
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    reportQueryFailure('fournisseur', error, 'Cette fiche fournisseur n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawSupplierRow & {
    phone_secondary: string | null
    address: string | null
    country: string | null
    registration_number: string | null
    tax_identifier: string | null
    administrative_notes: string | null
    notes: string | null
    status_reason: string | null
    status_changed_at: string | null
    created_at: string
    updated_at: string
  }

  return {
    id: row.id,
    supplierNo: row.supplier_no,
    type: row.type,
    legalName: row.legal_name,
    tradeName: row.trade_name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    city: row.city,
    status: row.status,
    phoneSecondary: row.phone_secondary,
    address: row.address,
    country: row.country,
    registrationNumber: row.registration_number,
    taxIdentifier: row.tax_identifier,
    administrativeNotes: row.administrative_notes,
    notes: row.notes,
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type SupplierPaymentDetail = {
  id: string
  kind: SupplierPaymentKind
  label: string
  accountHolder: string | null
  currencyCode: string | null
  bankName: string | null
  bankBranch: string | null
  accountNumber: string | null
  iban: string | null
  swiftBic: string | null
  accountReference: string | null
  isPrimary: boolean
  isActive: boolean
  notes: string | null
  updatedAt: string
}

/**
 * Coordonnées de règlement d'un fournisseur — où et comment il peut être payé.
 *
 * Renvoie un tableau VIDE aussi bien lorsqu'aucune coordonnée n'est enregistrée
 * que lorsque la permission manque : c'est RLS qui filtre, et l'appelant n'a
 * pas à distinguer les deux cas. L'écran affiche un refus explicite plutôt
 * qu'une liste vide, en s'appuyant sur la permission, pas sur ce résultat
 * (05_Regles_Metier/05_Permissions.md §85).
 *
 * L'ordre est celui de la lecture : la coordonnée principale d'abord, les
 * désactivées en dernier.
 */
export async function listSupplierPaymentDetails(
  supplierId: string
): Promise<SupplierPaymentDetail[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('supplier_payment_details')
    .select(
      `id, kind, label, account_holder, currency_code,
       bank_name, bank_branch, account_number, iban, swift_bic,
       account_reference, is_primary, is_active, notes, updated_at`
    )
    .eq('supplier_id', supplierId)
    .order('is_active', { ascending: false })
    .order('is_primary', { ascending: false })
    .order('label')

  // Un refus RLS se traduit ici par une absence de ligne, pas par une erreur.
  // Une erreur réelle reste signalée (DEC-017).
  if (error) {
    reportQueryFailure(
      'informations de paiement',
      error,
      'Les informations de paiement n’ont pas pu être chargées.'
    )
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as SupplierPaymentKind,
    label: row.label,
    accountHolder: row.account_holder,
    currencyCode: row.currency_code,
    bankName: row.bank_name,
    bankBranch: row.bank_branch,
    accountNumber: row.account_number,
    iban: row.iban,
    swiftBic: row.swift_bic,
    accountReference: row.account_reference,
    isPrimary: row.is_primary,
    isActive: row.is_active,
    notes: row.notes,
    updatedAt: row.updated_at,
  }))
}

export type SupplierOption = { id: string; label: string }

/**
 * Fournisseurs sélectionnables : seuls les fournisseurs actifs peuvent porter
 * une nouvelle opération (§6 et §7). La base l'impose également.
 */
export async function listSupplierOptions(): Promise<SupplierOption[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('id, supplier_no, legal_name')
    .eq('status', 'ACTIVE')
    .order('legal_name')
    .limit(500)

  if (error) {
    reportQueryFailure('fournisseurs', error, 'La liste des fournisseurs n’a pas pu être chargée.')
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${row.legal_name} · ${row.supplier_no}`,
  }))
}
