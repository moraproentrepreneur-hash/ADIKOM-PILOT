'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  guarded,
  orNull,
  readText,
  toFieldErrors,
  type FormState,
} from '@/lib/server-action'
import { findClientDuplicates, type DuplicateMatch } from './data'

/**
 * Actions du module Clients.
 *
 * Chaque action commence par une vérification de permission côté serveur : une
 * action appelée directement, sans passer par l'interface, doit être refusée de
 * la même manière (05_Regles_Metier/05_Permissions.md §50 et §85).
 *
 * Aucune suppression n'est proposée : un client porteur d'historique s'archive
 * (03_Modules/04_Tiers.md §19). La base refuse d'ailleurs tout DELETE.
 */

export type ClientFormState = FormState & {
  /** Fiches ressemblantes détectées : l'utilisateur confirme ou consulte (§18). */
  duplicates?: DuplicateMatch[]
}

const clientSchema = z.object({
  type: z.enum(['INDIVIDUAL', 'COMPANY'], {
    message: 'Précisez s’il s’agit d’un particulier ou d’une entreprise.',
  }),
  legalName: z
    .string()
    .trim()
    .min(1, 'Le nom ou la raison sociale est obligatoire.')
    .max(160, 'Ce nom est trop long.'),
  tradeName: z.string().trim().max(160).optional(),
  firstName: z.string().trim().max(80).optional(),
  phone: z
    .string()
    .trim()
    .min(1, 'Le téléphone est obligatoire.')
    .max(40, 'Ce numéro est trop long.'),
  phoneSecondary: z.string().trim().max(40).optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .refine((value) => value === '' || z.email().safeParse(value).success, {
      message: 'Cette adresse email n’est pas valide.',
    })
    .optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  idDocumentType: z.string().trim().max(80).optional(),
  idDocumentNumber: z.string().trim().max(80).optional(),
  registrationNumber: z.string().trim().max(80).optional(),
  taxIdentifier: z.string().trim().max(80).optional(),
  administrativeNotes: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
})

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [/clients_client_no_key/i, 'L’identifiant client n’a pas pu être attribué. Réessayez.'],
]

function readForm(formData: FormData) {
  return {
    type: readText(formData, 'type'),
    legalName: readText(formData, 'legalName'),
    tradeName: readText(formData, 'tradeName'),
    firstName: readText(formData, 'firstName'),
    phone: readText(formData, 'phone'),
    phoneSecondary: readText(formData, 'phoneSecondary'),
    email: readText(formData, 'email'),
    address: readText(formData, 'address'),
    city: readText(formData, 'city'),
    country: readText(formData, 'country'),
    idDocumentType: readText(formData, 'idDocumentType'),
    idDocumentNumber: readText(formData, 'idDocumentNumber'),
    registrationNumber: readText(formData, 'registrationNumber'),
    taxIdentifier: readText(formData, 'taxIdentifier'),
    administrativeNotes: readText(formData, 'administrativeNotes'),
    notes: readText(formData, 'notes'),
  }
}

function toRow(input: z.infer<typeof clientSchema>) {
  return {
    type: input.type,
    legal_name: input.legalName,
    trade_name: orNull(input.tradeName),
    first_name: orNull(input.firstName),
    phone: input.phone,
    phone_secondary: orNull(input.phoneSecondary),
    email: orNull(input.email),
    address: orNull(input.address),
    city: orNull(input.city),
    country: orNull(input.country),
    id_document_type: orNull(input.idDocumentType),
    id_document_number: orNull(input.idDocumentNumber),
    registration_number: orNull(input.registrationNumber),
    tax_identifier: orNull(input.taxIdentifier),
    administrative_notes: orNull(input.administrativeNotes),
    notes: orNull(input.notes),
  }
}

/* -------------------------------------------------------------------------- */
/*  Création                                                                   */
/* -------------------------------------------------------------------------- */

export async function createClientAction(
  prevState: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  return guarded('clients:création', () => createClientInner(formData), ERROR_PATTERNS)
}

async function createClientInner(formData: FormData): Promise<ClientFormState> {
  const actor = await requirePermission(PERMISSIONS.CLIENTS_CREATE)

  const parsed = clientSchema.safeParse(readForm(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const input = parsed.data

  // §18 — avertissement, jamais blocage : deux clients peuvent légitimement
  // porter le même nom. L'utilisateur confirme après avoir consulté la fiche.
  if (readText(formData, 'confirmDuplicate') !== '1') {
    const duplicates = await findClientDuplicates({
      legalName: input.legalName,
      phone: input.phone,
      email: orNull(input.email),
    })

    if (duplicates.length > 0) return { duplicates }
  }

  const supabase = await createSupabaseServerClient()

  // Numérotation atomique côté serveur : aucun format codé en dur ici
  // (DEC-005 / DEC-021).
  const { data: clientNo, error: numberError } = await supabase.rpc('next_number', {
    p_entity_key: 'client',
  })

  if (numberError || !clientNo) {
    return { error: 'L’identifiant client n’a pas pu être attribué. Réessayez.' }
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...toRow(input), client_no: clientNo, created_by: actor.id })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/tiers/clients')
  redirect(`/tiers/clients/${data.id}?cree=1`)
}

/* -------------------------------------------------------------------------- */
/*  Modification                                                               */
/* -------------------------------------------------------------------------- */

export async function updateClientAction(
  prevState: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  return guarded('clients:modification', () => updateClientInner(formData), ERROR_PATTERNS)
}

async function updateClientInner(formData: FormData): Promise<ClientFormState> {
  await requirePermission(PERMISSIONS.CLIENTS_UPDATE)

  const clientId = readText(formData, 'clientId')
  if (!clientId) return { error: 'Client introuvable.' }

  const parsed = clientSchema.safeParse(readForm(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('clients').update(toRow(parsed.data)).eq('id', clientId)

  if (error) throw new Error(error.message)

  revalidatePath('/tiers/clients')
  revalidatePath(`/tiers/clients/${clientId}`)
  redirect(`/tiers/clients/${clientId}?enregistre=1`)
}

/* -------------------------------------------------------------------------- */
/*  Statut                                                                     */
/* -------------------------------------------------------------------------- */

const STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED'] as const

export async function setClientStatusAction(
  prevState: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  return guarded('clients:statut', () => setClientStatusInner(formData), ERROR_PATTERNS)
}

async function setClientStatusInner(formData: FormData): Promise<ClientFormState> {
  const actor = await requirePermission(PERMISSIONS.CLIENTS_ARCHIVE)

  const clientId = readText(formData, 'clientId')
  const status = readText(formData, 'status')
  const reason = orNull(readText(formData, 'reason'))

  if (!clientId || !STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) {
    return { error: 'Opération invalide.' }
  }

  const supabase = await createSupabaseServerClient()

  const { error } = await supabase
    .from('clients')
    .update({
      status,
      status_reason: reason,
      status_changed_at: new Date().toISOString(),
      status_changed_by: actor.id,
    })
    .eq('id', clientId)

  if (error) throw new Error(error.message)

  // Le changement de statut est déjà journalisé par le trigger d'audit
  // (STATUS_CHANGE). Le motif est ajouté comme événement distinct, afin qu'il
  // reste lisible dans le journal sans dépendre du diff de la ligne.
  if (reason) {
    await supabase.rpc('log_audit', {
      p_action: 'STATUS_CHANGE',
      p_entity_type: 'clients',
      p_entity_id: clientId,
      p_module_code: 'parties',
      p_reason: reason,
    })
  }

  revalidatePath('/tiers/clients')
  revalidatePath(`/tiers/clients/${clientId}`)
  return { success: 'Le statut du client a été mis à jour.' }
}
