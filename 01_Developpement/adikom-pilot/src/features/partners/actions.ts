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
 * Actions du module Partenaires.
 *
 * PÉRIMÈTRE — identité du partenaire, pas gestion du partenariat.
 *
 * Ces deux actions renseignent la table `partners` telle qu'elle existe :
 * identité, coordonnées, immatriculation, observations. Le partenariat
 * lui-même — type, responsable interne, dates, conditions, projets
 * (03_Modules/04_Tiers.md §14.2) — reste du ressort du module Partenariats :
 * aucune de ces informations n'a de colonne, et aucune n'est inventée ici.
 *
 * Les permissions employées existent déjà au catalogue depuis la migration 007
 * (`parties.partners.create`, `parties.partners.update`) et les policies RLS de
 * la migration 024 exigent exactement les mêmes : le contrôle serveur ci-dessous
 * est la première barrière, la base restant la seconde (DEC-011).
 */

export type PartnerFormState = FormState

/*
 * Le téléphone reste facultatif, contrairement aux clients et aux fournisseurs.
 * C'est le choix inscrit en base (migration 024) : le durcir ici empêcherait de
 * corriger une fiche existante qui n'en porte pas, et reviendrait à créer une
 * règle métier que rien ne documente (CLAUDE.md §55).
 */
const partnerSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(1, 'La raison sociale ou le nom est obligatoire.')
    .max(160, 'Ce nom est trop long.'),
  tradeName: z.string().trim().max(160).optional(),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
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
  notes: z.string().trim().max(2000).optional(),
})

function readForm(formData: FormData) {
  return {
    legalName: readText(formData, 'legalName'),
    tradeName: readText(formData, 'tradeName'),
    contactName: readText(formData, 'contactName'),
    phone: readText(formData, 'phone'),
    email: readText(formData, 'email'),
    address: readText(formData, 'address'),
    city: readText(formData, 'city'),
    country: readText(formData, 'country'),
    registrationNumber: readText(formData, 'registrationNumber'),
    notes: readText(formData, 'notes'),
  }
}

function toRow(input: z.infer<typeof partnerSchema>) {
  return {
    legal_name: input.legalName,
    trade_name: orNull(input.tradeName),
    contact_name: orNull(input.contactName),
    phone: orNull(input.phone),
    email: orNull(input.email),
    address: orNull(input.address),
    city: orNull(input.city),
    country: orNull(input.country),
    registration_number: orNull(input.registrationNumber),
    notes: orNull(input.notes),
  }
}

/* -------------------------------------------------------------------------- */
/*  Création                                                                   */
/* -------------------------------------------------------------------------- */

export async function createPartnerAction(
  prevState: PartnerFormState,
  formData: FormData
): Promise<PartnerFormState> {
  return guarded('partenaires:création', () => createPartnerInner(formData))
}

async function createPartnerInner(formData: FormData): Promise<PartnerFormState> {
  const actor = await requirePermission(PERMISSIONS.PARTNERS_CREATE)

  const parsed = partnerSchema.safeParse(readForm(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const supabase = await createSupabaseServerClient()

  // PAR-000001 : produit côté serveur, jamais saisi (DEC-005).
  const { data: partnerNo, error: numberError } = await supabase.rpc('next_number', {
    p_entity_key: 'partner',
  })

  if (numberError || !partnerNo) {
    return { error: 'L’identifiant partenaire n’a pas pu être attribué. Réessayez.' }
  }

  const { data, error } = await supabase
    .from('partners')
    .insert({ ...toRow(parsed.data), partner_no: partnerNo, created_by: actor.id })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/tiers/partenaires')
  redirect(`/tiers/partenaires/${data.id}?cree=1`)
}

/* -------------------------------------------------------------------------- */
/*  Modification                                                               */
/* -------------------------------------------------------------------------- */

export async function updatePartnerAction(
  prevState: PartnerFormState,
  formData: FormData
): Promise<PartnerFormState> {
  return guarded('partenaires:modification', () => updatePartnerInner(formData))
}

async function updatePartnerInner(formData: FormData): Promise<PartnerFormState> {
  const actor = await requirePermission(PERMISSIONS.PARTNERS_UPDATE)

  const partnerId = readText(formData, 'partnerId')
  if (!partnerId) return { error: 'Partenaire introuvable.' }

  const parsed = partnerSchema.safeParse(readForm(formData))
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('partners')
    .update({ ...toRow(parsed.data), updated_by: actor.id })
    .eq('id', partnerId)

  if (error) throw new Error(error.message)

  revalidatePath('/tiers/partenaires')
  revalidatePath(`/tiers/partenaires/${partnerId}`)
  redirect(`/tiers/partenaires/${partnerId}?enregistre=1`)
}

/* -------------------------------------------------------------------------- */
/*  Statut — suspension et archivage                                           */
/* -------------------------------------------------------------------------- */

const STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED'] as const

/**
 * Change le statut d'un partenaire.
 *
 * ARCHIVER N'EST PAS MODIFIER.
 *
 * La policy RLS `partners_update` accepte l'une OU l'autre des deux
 * permissions : c'est la garde serveur qui exige celle correspondant à l'action
 * réellement demandée — ici `parties.partners.archive`, jamais `.update`. Même
 * répartition que pour les clients et les fournisseurs, où elle est inscrite en
 * commentaire de la migration 018.
 *
 * Un partenaire ne se supprime pas : le trigger `partners_no_delete` refuse
 * toute suppression à un utilisateur authentifié (CLAUDE.md §22, DEC-020). Ce
 * changement de statut est donc le seul retrait possible depuis l'application.
 */
export async function setPartnerStatusAction(
  prevState: PartnerFormState,
  formData: FormData
): Promise<PartnerFormState> {
  return guarded('partenaires:statut', () => setPartnerStatusInner(formData))
}

async function setPartnerStatusInner(formData: FormData): Promise<PartnerFormState> {
  const actor = await requirePermission(PERMISSIONS.PARTNERS_ARCHIVE)

  const partnerId = readText(formData, 'partnerId')
  const status = readText(formData, 'status')
  const reason = orNull(readText(formData, 'reason'))

  if (!partnerId || !STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) {
    return { error: 'Opération invalide.' }
  }

  const supabase = await createSupabaseServerClient()

  const { error } = await supabase
    .from('partners')
    .update({
      status,
      status_reason: reason,
      status_changed_at: new Date().toISOString(),
      status_changed_by: actor.id,
    })
    .eq('id', partnerId)

  if (error) throw new Error(error.message)

  /*
   * Le trigger `partners_audit` journalise déjà l'avant et l'après. Cette
   * entrée-ci porte le MOTIF, que la ligne modifiée ne conserve qu'à l'état
   * courant : sans elle, la raison du dernier changement écraserait la
   * précédente (05_Regles_Metier/06_Audit.md).
   */
  if (reason) {
    await supabase.rpc('log_audit', {
      p_action: 'STATUS_CHANGE',
      p_entity_type: 'partners',
      p_entity_id: partnerId,
      p_module_code: 'parties',
      p_reason: reason,
    })
  }

  revalidatePath('/tiers/partenaires')
  revalidatePath(`/tiers/partenaires/${partnerId}`)
  return { success: 'Le statut du partenaire a été mis à jour.' }
}
