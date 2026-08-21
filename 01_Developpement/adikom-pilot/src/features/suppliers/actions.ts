'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'
import { isKnownCountry } from '@/lib/countries'

/**
 * Actions du module Fournisseurs.
 *
 * La modification des coordonnées bancaires est une opération sensible
 * (05_Regles_Metier/04_Fournisseurs.md §45) : elle relève d'une permission
 * distincte, est vérifiée côté serveur, et journalisée — sans que le numéro de
 * compte lui-même n'entre dans le journal (Audit §79).
 */

export type SupplierFormState = FormState

const supplierSchema = z.object({
  type: z.enum(
    ['VEHICLE_SUPPLIER', 'MAINTENANCE_PROVIDER', 'PARTS_SUPPLIER', 'SERVICE_PROVIDER', 'OTHER'],
    { message: 'Précisez le type de fournisseur.' }
  ),
  legalName: z
    .string()
    .trim()
    .min(1, 'La raison sociale ou le nom est obligatoire.')
    .max(160, 'Ce nom est trop long.'),
  tradeName: z.string().trim().max(160).optional(),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(1, 'Le téléphone est obligatoire.').max(40),
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
  country: z
    .string()
    .trim()
    .max(120)
    .refine(isKnownCountry, { message: 'Ce pays ne figure pas dans la liste.' })
    .optional(),
  registrationNumber: z.string().trim().max(80).optional(),
  taxIdentifier: z.string().trim().max(80).optional(),
  administrativeNotes: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
})

function readForm(formData: FormData) {
  return {
    type: readText(formData, 'type'),
    legalName: readText(formData, 'legalName'),
    tradeName: readText(formData, 'tradeName'),
    contactName: readText(formData, 'contactName'),
    phone: readText(formData, 'phone'),
    phoneSecondary: readText(formData, 'phoneSecondary'),
    email: readText(formData, 'email'),
    address: readText(formData, 'address'),
    city: readText(formData, 'city'),
    country: readText(formData, 'country'),
    registrationNumber: readText(formData, 'registrationNumber'),
    taxIdentifier: readText(formData, 'taxIdentifier'),
    administrativeNotes: readText(formData, 'administrativeNotes'),
    notes: readText(formData, 'notes'),
  }
}

function toRow(input: z.infer<typeof supplierSchema>) {
  return {
    type: input.type,
    legal_name: input.legalName,
    trade_name: orNull(input.tradeName),
    contact_name: orNull(input.contactName),
    phone: input.phone,
    phone_secondary: orNull(input.phoneSecondary),
    email: orNull(input.email),
    address: orNull(input.address),
    city: orNull(input.city),
    country: orNull(input.country),
    registration_number: orNull(input.registrationNumber),
    tax_identifier: orNull(input.taxIdentifier),
    administrative_notes: orNull(input.administrativeNotes),
    notes: orNull(input.notes),
  }
}

/* -------------------------------------------------------------------------- */
/*  Création                                                                   */
/* -------------------------------------------------------------------------- */

export async function createSupplierAction(
  prevState: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  return guarded('fournisseurs:création', () => createSupplierInner(formData))
}

async function createSupplierInner(formData: FormData): Promise<SupplierFormState> {
  const actor = await requirePermission(PERMISSIONS.SUPPLIERS_CREATE)

  const parsed = supplierSchema.safeParse(readForm(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const supabase = await createSupabaseServerClient()

  const { data: supplierNo, error: numberError } = await supabase.rpc('next_number', {
    p_entity_key: 'supplier',
  })

  if (numberError || !supplierNo) {
    return { error: 'L’identifiant fournisseur n’a pas pu être attribué. Réessayez.' }
  }

  const { data, error } = await supabase
    .from('suppliers')
    .insert({ ...toRow(parsed.data), supplier_no: supplierNo, created_by: actor.id })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/tiers/fournisseurs')
  redirect(`/tiers/fournisseurs/${data.id}?cree=1`)
}

/* -------------------------------------------------------------------------- */
/*  Modification                                                               */
/* -------------------------------------------------------------------------- */

export async function updateSupplierAction(
  prevState: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  return guarded('fournisseurs:modification', () => updateSupplierInner(formData))
}

async function updateSupplierInner(formData: FormData): Promise<SupplierFormState> {
  await requirePermission(PERMISSIONS.SUPPLIERS_UPDATE)

  const supplierId = readText(formData, 'supplierId')
  if (!supplierId) return { error: 'Fournisseur introuvable.' }

  const parsed = supplierSchema.safeParse(readForm(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('suppliers').update(toRow(parsed.data)).eq('id', supplierId)

  if (error) throw new Error(error.message)

  revalidatePath('/tiers/fournisseurs')
  revalidatePath(`/tiers/fournisseurs/${supplierId}`)
  redirect(`/tiers/fournisseurs/${supplierId}?enregistre=1`)
}

/* -------------------------------------------------------------------------- */
/*  Statut                                                                     */
/* -------------------------------------------------------------------------- */

const STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED'] as const

export async function setSupplierStatusAction(
  prevState: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  return guarded('fournisseurs:statut', () => setSupplierStatusInner(formData))
}

async function setSupplierStatusInner(formData: FormData): Promise<SupplierFormState> {
  const actor = await requirePermission(PERMISSIONS.SUPPLIERS_ARCHIVE)

  const supplierId = readText(formData, 'supplierId')
  const status = readText(formData, 'status')
  const reason = orNull(readText(formData, 'reason'))

  if (!supplierId || !STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) {
    return { error: 'Opération invalide.' }
  }

  const supabase = await createSupabaseServerClient()

  const { error } = await supabase
    .from('suppliers')
    .update({
      status,
      status_reason: reason,
      status_changed_at: new Date().toISOString(),
      status_changed_by: actor.id,
    })
    .eq('id', supplierId)

  if (error) throw new Error(error.message)

  if (reason) {
    await supabase.rpc('log_audit', {
      p_action: 'STATUS_CHANGE',
      p_entity_type: 'suppliers',
      p_entity_id: supplierId,
      p_module_code: 'parties',
      p_reason: reason,
    })
  }

  revalidatePath('/tiers/fournisseurs')
  revalidatePath(`/tiers/fournisseurs/${supplierId}`)
  return { success: 'Le statut du fournisseur a été mis à jour.' }
}

/* -------------------------------------------------------------------------- */
/*  Coordonnées bancaires                                                      */
/* -------------------------------------------------------------------------- */

const bankSchema = z.object({
  bankName: z.string().trim().max(160).optional(),
  accountHolder: z.string().trim().max(160).optional(),
  accountNumber: z.string().trim().max(64).optional(),
  iban: z.string().trim().max(64).optional(),
  swiftBic: z.string().trim().max(32).optional(),
  notes: z.string().trim().max(1000).optional(),
})

/**
 * Enregistre les coordonnées bancaires d'un fournisseur.
 *
 * Trois barrières, aucune ne remplaçant les autres :
 *   1. `requirePermission('parties.suppliers.bank.update')` côté serveur ;
 *   2. la policy RLS de `supplier_bank_details`, qui exige la même permission ;
 *   3. le trigger d'audit, qui journalise le changement sans en recopier les
 *      valeurs sensibles (`fn_audit_redact`).
 */
export async function updateSupplierBankAction(
  prevState: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  return guarded('fournisseurs:banque', () => updateSupplierBankInner(formData))
}

async function updateSupplierBankInner(formData: FormData): Promise<SupplierFormState> {
  const actor = await requirePermission(PERMISSIONS.SUPPLIERS_BANK_UPDATE)

  const supplierId = readText(formData, 'supplierId')
  if (!supplierId) return { error: 'Fournisseur introuvable.' }

  const parsed = bankSchema.safeParse({
    bankName: readText(formData, 'bankName'),
    accountHolder: readText(formData, 'accountHolder'),
    accountNumber: readText(formData, 'accountNumber'),
    iban: readText(formData, 'iban'),
    swiftBic: readText(formData, 'swiftBic'),
    notes: readText(formData, 'bankNotes'),
  })

  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const input = parsed.data
  const supabase = await createSupabaseServerClient()

  const { error } = await supabase.from('supplier_bank_details').upsert(
    {
      supplier_id: supplierId,
      bank_name: orNull(input.bankName),
      account_holder: orNull(input.accountHolder),
      account_number: orNull(input.accountNumber),
      iban: orNull(input.iban),
      swift_bic: orNull(input.swiftBic),
      notes: orNull(input.notes),
      updated_by: actor.id,
    },
    { onConflict: 'supplier_id' }
  )

  if (error) throw new Error(error.message)

  revalidatePath(`/tiers/fournisseurs/${supplierId}`)
  return { success: 'Les coordonnées bancaires ont été enregistrées.' }
}
