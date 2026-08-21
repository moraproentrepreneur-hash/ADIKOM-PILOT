import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { ClientStatus, ClientType } from './constants'

/**
 * Accès aux données du module Clients.
 *
 * Toutes les requêtes passent par le client porteur de la session : RLS reste
 * la barrière au niveau des données. Aucun filtre applicatif n'a à prévoir ce
 * qu'un utilisateur peut voir — la policy s'en charge.
 */

export { STATUS_LABELS, STATUS_TONES, TYPE_LABELS, SELECTABLE_STATUSES } from './constants'
export type { ClientStatus, ClientType } from './constants'

export type ClientListItem = {
  id: string
  clientNo: string
  type: ClientType
  displayName: string
  legalName: string
  tradeName: string | null
  phone: string
  email: string | null
  city: string | null
  status: ClientStatus
  createdAt: string
}

export type ClientDetail = ClientListItem & {
  firstName: string | null
  phoneSecondary: string | null
  address: string | null
  country: string | null
  idDocumentType: string | null
  idDocumentNumber: string | null
  registrationNumber: string | null
  taxIdentifier: string | null
  administrativeNotes: string | null
  notes: string | null
  statusReason: string | null
  statusChangedAt: string | null
  updatedAt: string
}

type RawClientRow = {
  id: string
  client_no: string
  type: ClientType
  legal_name: string
  trade_name: string | null
  first_name: string | null
  phone: string
  email: string | null
  city: string | null
  status: ClientStatus
  created_at: string
}

const LIST_SELECT = `
  id, client_no, type, legal_name, trade_name, first_name,
  phone, email, city, status, created_at
`

const DETAIL_SELECT = `
  ${LIST_SELECT}, phone_secondary, address, country,
  id_document_type, id_document_number, registration_number, tax_identifier,
  administrative_notes, notes, status_reason, status_changed_at, updated_at
`

/**
 * Nom affiché : la raison sociale pour une entreprise, « Prénom Nom » pour un
 * particulier. Calculé ici, une fois, plutôt que dans chaque écran.
 */
function displayName(row: RawClientRow): string {
  if (row.type === 'INDIVIDUAL' && row.first_name) {
    return `${row.first_name} ${row.legal_name}`.trim()
  }
  return row.legal_name
}

function toListItem(row: RawClientRow): ClientListItem {
  return {
    id: row.id,
    clientNo: row.client_no,
    type: row.type,
    displayName: displayName(row),
    legalName: row.legal_name,
    tradeName: row.trade_name,
    phone: row.phone,
    email: row.email,
    city: row.city,
    status: row.status,
    createdAt: row.created_at,
  }
}

/** Échappe les caractères ayant une signification dans un filtre PostgREST. */
function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim()
}

export type ClientFilters = {
  search?: string
  status?: string
  type?: string
}

export async function listClients(filters: ClientFilters = {}): Promise<ClientListItem[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase.from('clients').select(LIST_SELECT)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search) {
    query = query.or(
      [
        `legal_name.ilike.%${search}%`,
        `trade_name.ilike.%${search}%`,
        `first_name.ilike.%${search}%`,
        `client_no.ilike.%${search}%`,
        `phone.ilike.%${search}%`,
        `email.ilike.%${search}%`,
        `city.ilike.%${search}%`,
      ].join(',')
    )
  }

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.type) query = query.eq('type', filters.type)

  const { data, error } = await query.order('legal_name').limit(200)

  if (error) {
    reportQueryFailure('clients', error, 'La liste des clients n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawClientRow[]).map(toListItem)
}

export async function getClientDetail(id: string): Promise<ClientDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('clients')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle()

  // Une ligne absente est un cas fonctionnel légitime (404) ; une erreur de
  // requête ne l'est pas et doit rester repérable (DEC-017).
  if (error) reportQueryFailure('client', error, 'Cette fiche client n’a pas pu être chargée.')
  if (!data) return null

  const row = data as unknown as RawClientRow & {
    phone_secondary: string | null
    address: string | null
    country: string | null
    id_document_type: string | null
    id_document_number: string | null
    registration_number: string | null
    tax_identifier: string | null
    administrative_notes: string | null
    notes: string | null
    status_reason: string | null
    status_changed_at: string | null
    updated_at: string
  }

  return {
    ...toListItem(row),
    firstName: row.first_name,
    phoneSecondary: row.phone_secondary,
    address: row.address,
    country: row.country,
    idDocumentType: row.id_document_type,
    idDocumentNumber: row.id_document_number,
    registrationNumber: row.registration_number,
    taxIdentifier: row.tax_identifier,
    administrativeNotes: row.administrative_notes,
    notes: row.notes,
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    updatedAt: row.updated_at,
  }
}

export type DuplicateMatch = {
  id: string
  clientNo: string
  displayName: string
  phone: string
  email: string | null
  reason: string
}

/**
 * Recherche des fiches ressemblant à celle qu'on s'apprête à créer.
 *
 * 03_Modules/04_Tiers.md §18 : le système AVERTIT, il ne bloque pas. Deux
 * personnes peuvent légitimement porter le même nom ; c'est à l'utilisateur de
 * trancher après avoir consulté la fiche existante.
 */
export async function findClientDuplicates(input: {
  legalName: string
  phone: string
  email: string | null
  excludeId?: string
}): Promise<DuplicateMatch[]> {
  const supabase = await createSupabaseServerClient()

  const name = sanitizeSearch(input.legalName)
  const conditions = [`legal_name.ilike.${name}`, `phone.eq.${input.phone}`]
  if (input.email) conditions.push(`email.ilike.${input.email}`)

  let query = supabase.from('clients').select(LIST_SELECT).or(conditions.join(','))
  if (input.excludeId) query = query.neq('id', input.excludeId)

  const { data, error } = await query.limit(5)

  // Un échec de la détection ne doit pas empêcher la création : il prive d'un
  // avertissement, ce qui reste moins grave que de bloquer une saisie légitime.
  if (error) {
    console.error(`[clients] détection de doublons : ${error.code ?? 'ERREUR'} ${error.message}`)
    return []
  }

  return ((data ?? []) as unknown as RawClientRow[]).map((row) => {
    const reasons: string[] = []
    if (row.legal_name.toLowerCase() === input.legalName.toLowerCase()) reasons.push('même nom')
    if (row.phone === input.phone) reasons.push('même téléphone')
    if (input.email && row.email?.toLowerCase() === input.email.toLowerCase()) {
      reasons.push('même email')
    }

    return {
      id: row.id,
      clientNo: row.client_no,
      displayName: displayName(row),
      phone: row.phone,
      email: row.email,
      reason: reasons.join(', ') || 'informations proches',
    }
  })
}

export type ClientOption = { id: string; label: string }

/**
 * Clients sélectionnables dans une autre opération.
 * Un client archivé ou inactif n'est pas proposé (§19).
 */
export async function listClientOptions(): Promise<ClientOption[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('clients')
    .select('id, client_no, type, legal_name, first_name')
    .in('status', ['ACTIVE', 'PROSPECT'])
    .order('legal_name')
    .limit(500)

  if (error) {
    reportQueryFailure('clients', error, 'La liste des clients n’a pas pu être chargée.')
  }

  return ((data ?? []) as unknown as RawClientRow[]).map((row) => ({
    id: row.id,
    label: `${displayName(row)} · ${row.client_no}`,
  }))
}
