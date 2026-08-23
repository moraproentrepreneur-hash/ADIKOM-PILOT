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
 * La modification des informations de paiement est une opération sensible
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
/*  Informations de paiement                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Une coordonnée de règlement.
 *
 * Les deux formes — bancaire et générique — sont départagées ici comme elles le
 * sont en base : `supplier_payment_bank_shape` et `supplier_payment_other_shape`
 * (migration 028). La validation côté serveur produit un message utilisable ;
 * la contrainte, elle, garantit qu'aucune écriture ne l'esquive.
 */
const paymentSchema = z
  .object({
    kind: z.enum(['BANK_ACCOUNT', 'OTHER'], { message: 'Précisez la nature de la coordonnée.' }),
    label: z
      .string()
      .trim()
      .min(1, 'La désignation est obligatoire.')
      .max(120, 'Cette désignation est trop longue.'),
    accountHolder: z.string().trim().max(160).optional(),
    currencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .max(3)
      .refine((value) => value === '' || /^[A-Z]{3}$/.test(value), {
        message: 'Utilisez un code à trois lettres, par exemple KMF.',
      })
      .optional(),
    bankName: z.string().trim().max(160).optional(),
    bankBranch: z.string().trim().max(160).optional(),
    accountNumber: z.string().trim().max(64).optional(),
    iban: z.string().trim().max(64).optional(),
    swiftBic: z.string().trim().max(32).optional(),
    accountReference: z.string().trim().max(160).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine(
    (input) =>
      input.kind !== 'BANK_ACCOUNT' ||
      Boolean(orNull(input.bankName) ?? orNull(input.accountNumber) ?? orNull(input.iban)),
    {
      message: 'Renseignez au moins la banque, le numéro de compte ou l’IBAN.',
      path: ['bankName'],
    }
  )
  .refine(
    (input) => input.kind !== 'OTHER' || Boolean(orNull(input.accountReference)),
    {
      message: 'Renseignez la référence de cette coordonnée.',
      path: ['accountReference'],
    }
  )

function readPaymentForm(formData: FormData) {
  return {
    kind: readText(formData, 'kind'),
    label: readText(formData, 'label'),
    accountHolder: readText(formData, 'accountHolder'),
    currencyCode: readText(formData, 'currencyCode'),
    bankName: readText(formData, 'bankName'),
    bankBranch: readText(formData, 'bankBranch'),
    accountNumber: readText(formData, 'accountNumber'),
    iban: readText(formData, 'iban'),
    swiftBic: readText(formData, 'swiftBic'),
    accountReference: readText(formData, 'accountReference'),
    notes: readText(formData, 'paymentNotes'),
  }
}

/**
 * Les colonnes propres à une forme sont VIDÉES pour l'autre.
 *
 * Sans cela, changer la nature d'une coordonnée existante laisserait derrière
 * elle un IBAN orphelin — que la contrainte refuserait, avec un message
 * incompréhensible pour l'utilisateur.
 */
function toPaymentRow(input: z.infer<typeof paymentSchema>) {
  const isBank = input.kind === 'BANK_ACCOUNT'

  return {
    kind: input.kind,
    label: input.label,
    account_holder: orNull(input.accountHolder),
    currency_code: orNull(input.currencyCode),
    bank_name: isBank ? orNull(input.bankName) : null,
    bank_branch: isBank ? orNull(input.bankBranch) : null,
    account_number: isBank ? orNull(input.accountNumber) : null,
    iban: isBank ? orNull(input.iban) : null,
    swift_bic: isBank ? orNull(input.swiftBic) : null,
    account_reference: isBank ? null : orNull(input.accountReference),
    notes: orNull(input.notes),
  }
}

/**
 * Enregistre une coordonnée de règlement — création ou modification.
 *
 * Trois barrières, aucune ne remplaçant les autres :
 *   1. `requirePermission('parties.suppliers.bank.update')` côté serveur ;
 *   2. les policies RLS de `supplier_payment_details`, qui exigent la même
 *      permission — et n'autorisent aucune suppression ;
 *   3. le trigger d'audit, qui journalise le changement sans en recopier les
 *      valeurs sensibles (`fn_audit_redact`).
 */
export async function saveSupplierPaymentAction(
  prevState: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  return guarded('fournisseurs:paiement', () => saveSupplierPaymentInner(formData))
}

async function saveSupplierPaymentInner(formData: FormData): Promise<SupplierFormState> {
  const actor = await requirePermission(PERMISSIONS.SUPPLIERS_BANK_UPDATE)

  const supplierId = readText(formData, 'supplierId')
  if (!supplierId) return { error: 'Fournisseur introuvable.' }

  const parsed = paymentSchema.safeParse(readPaymentForm(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const paymentId = readText(formData, 'paymentId')
  const isPrimary = readText(formData, 'isPrimary') === 'on'

  if (paymentId) {
    const { error } = await supabase
      .from('supplier_payment_details')
      .update({ ...toPaymentRow(parsed.data), is_primary: isPrimary, updated_by: actor.id })
      .eq('id', paymentId)
      .eq('supplier_id', supplierId)

    if (error) throw new Error(error.message)

    revalidatePath(`/tiers/fournisseurs/${supplierId}`)
    return { success: 'La coordonnée de règlement a été enregistrée.' }
  }

  const { error } = await supabase.from('supplier_payment_details').insert({
    ...toPaymentRow(parsed.data),
    supplier_id: supplierId,
    is_primary: isPrimary,
    created_by: actor.id,
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/tiers/fournisseurs/${supplierId}`)
  return { success: 'La coordonnée de règlement a été ajoutée.' }
}

/**
 * Active ou désactive une coordonnée, ou la désigne comme principale.
 *
 * Une coordonnée ne se supprime pas : ni policy DELETE, ni droit accordé
 * (CLAUDE.md §22). La désactivation est le retrait, et le trigger
 * `fn_supplier_payment_single_primary` se charge de basculer l'ancienne
 * principale — l'application n'a pas à orchestrer deux écritures.
 */
export async function setSupplierPaymentStateAction(
  prevState: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  return guarded('fournisseurs:paiement:état', () => setSupplierPaymentStateInner(formData))
}

async function setSupplierPaymentStateInner(formData: FormData): Promise<SupplierFormState> {
  const actor = await requirePermission(PERMISSIONS.SUPPLIERS_BANK_UPDATE)

  const supplierId = readText(formData, 'supplierId')
  const paymentId = readText(formData, 'paymentId')
  const operation = readText(formData, 'operation')

  if (!supplierId || !paymentId) return { error: 'Coordonnée introuvable.' }

  const patch =
    operation === 'primary'
      ? { is_primary: true }
      : operation === 'deactivate'
        ? { is_active: false }
        : operation === 'activate'
          ? { is_active: true }
          : null

  if (!patch) return { error: 'Opération invalide.' }

  const supabase = await createSupabaseServerClient()

  const { error } = await supabase
    .from('supplier_payment_details')
    .update({ ...patch, updated_by: actor.id })
    .eq('id', paymentId)
    .eq('supplier_id', supplierId)

  if (error) throw new Error(error.message)

  revalidatePath(`/tiers/fournisseurs/${supplierId}`)

  return {
    success:
      operation === 'primary'
        ? 'Cette coordonnée est désormais la coordonnée principale.'
        : operation === 'deactivate'
          ? 'La coordonnée a été désactivée.'
          : 'La coordonnée a été réactivée.',
  }
}
