import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { PartnerStatus } from './constants'

/**
 * Accès aux données des partenaires — LECTURE SEULE.
 *
 * Le périmètre validé se limite à consulter : liste, recherche, fiche,
 * véhicules rattachés, document et export. La création, la modification et la
 * gestion des conditions relèvent du module Partenariats, à venir.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données.
 */

export { STATUS_LABELS, STATUS_TONES } from './constants'
export type { PartnerStatus } from './constants'

export type PartnerListItem = {
  id: string
  partnerNo: string
  legalName: string
  tradeName: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  city: string | null
  country: string | null
  status: PartnerStatus
  vehicleCount: number
}

export type PartnerDetail = PartnerListItem & {
  address: string | null
  registrationNumber: string | null
  notes: string | null
  statusReason: string | null
  statusChangedAt: string | null
  createdAt: string
  updatedAt: string
}

type RawPartnerRow = {
  id: string
  partner_no: string
  legal_name: string
  trade_name: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  city: string | null
  country: string | null
  status: PartnerStatus
  vehicles?: { count: number }[] | null
}

const BASE_SELECT = `
  id, partner_no, legal_name, trade_name, contact_name,
  phone, email, city, country, status
`

function toListItem(row: RawPartnerRow): PartnerListItem {
  return {
    id: row.id,
    partnerNo: row.partner_no,
    legalName: row.legal_name,
    tradeName: row.trade_name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    city: row.city,
    country: row.country,
    status: row.status,
    vehicleCount: row.vehicles?.[0]?.count ?? 0,
  }
}

function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export type PartnerFilters = {
  search?: string
  status?: string
}

export async function listPartners(filters: PartnerFilters = {}): Promise<PartnerListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('partners').select(`${BASE_SELECT}, vehicles ( count )`)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(
      [
        `legal_name.ilike.%${search}%`,
        `trade_name.ilike.%${search}%`,
        `contact_name.ilike.%${search}%`,
        `partner_no.ilike.%${search}%`,
        `phone.ilike.%${search}%`,
        `email.ilike.%${search}%`,
      ].join(',')
    )
  }

  if (filters.status) query = query.eq('status', filters.status)

  const { data, error } = await query.order('legal_name').limit(200)

  if (error) {
    reportQueryFailure('partenaires', error, 'La liste des partenaires n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawPartnerRow[]).map(toListItem)
}

export async function getPartnerDetail(id: string): Promise<PartnerDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('partners')
    .select(
      `${BASE_SELECT}, address, registration_number, notes,
       status_reason, status_changed_at, created_at, updated_at,
       vehicles ( count )`
    )
    .eq('id', id)
    .maybeSingle()

  // Une ligne absente est un cas fonctionnel (404) ; une erreur de requête ne
  // l'est pas et doit rester repérable (DEC-017).
  if (error) {
    reportQueryFailure('partenaire', error, 'Cette fiche partenaire n’a pas pu être chargée.')
  }
  if (!data) return null

  const row = data as unknown as RawPartnerRow & {
    address: string | null
    registration_number: string | null
    notes: string | null
    status_reason: string | null
    status_changed_at: string | null
    created_at: string
    updated_at: string
  }

  return {
    ...toListItem(row),
    address: row.address,
    registrationNumber: row.registration_number,
    notes: row.notes,
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type PartnerOption = { id: string; label: string }

/**
 * Partenaires sélectionnables.
 * Seul un partenaire actif peut recevoir un véhicule — la base l'impose
 * également, dans `set_vehicle_attachment`.
 */
export async function listPartnerOptions(): Promise<PartnerOption[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('partners')
    .select('id, partner_no, legal_name')
    .eq('status', 'ACTIVE')
    .order('legal_name')
    .limit(500)

  if (error) {
    reportQueryFailure('partenaires', error, 'La liste des partenaires n’a pas pu être chargée.')
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${row.legal_name} · ${row.partner_no}`,
  }))
}
