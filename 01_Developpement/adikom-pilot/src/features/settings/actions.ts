'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  friendlyError,
  guarded,
  orNull,
  readText,
  toFieldErrors,
  type FormState,
} from '@/lib/server-action'
import {
  HEX_COLOR,
  LOGO_MAX_BYTES,
  LOGO_MIME_TYPES,
  sectionDefinition,
  type SettingsSection,
} from './constants'

/**
 * Actions du module Paramètres — Module 09.
 *
 * HUIT SECTIONS, QUATRE CAPACITÉS, ET AUCUNE N'EN OUVRE UNE AUTRE (DEC-024) :
 *
 *   identité · coordonnées · commercial · facturation · préférences
 *                                    → `settings.company.update`
 *   administratif                    → `settings.company.administrative.update`
 *   banque                           → `settings.company.bank.update`
 *   identité visuelle                → `settings.branding.update`
 *   numérotation                     → `settings.numbering.update`
 *
 * La garde applicative refuse d'emblée ce qu'elle sait refusé ; le déclencheur
 * `company_settings_write_guard` reste la barrière décisive, colonne par
 * colonne, y compris pour un appel direct à l'API (§44 : « les contrôles
 * doivent être appliqués côté serveur »).
 *
 * AUCUNE ACTION N'ÉCRIT LE COMPTEUR D'UNE NUMÉROTATION. §16 interdit la
 * réutilisation d'un numéro ; `fn_numbering_rules_write_guard` le refuse en
 * base, et rien ici ne le propose.
 */

const SETTINGS_PATH = '/parametres'

/** Champs de chaque section — le serveur n'écrit jamais au-delà (§42). */
const SECTION_FIELDS: Record<SettingsSection, readonly string[]> = {
  identite: ['legal_name', 'trade_name', 'acronym', 'description', 'activity', 'tagline', 'internal_code'],
  coordonnees: ['address_line1', 'address_line2', 'city', 'country', 'phone', 'email', 'website'],
  administratif: ['registration_number', 'tax_identifier', 'legal_form', 'administrative_notes'],
  commercial: ['main_activity', 'secondary_activities', 'commercial_description'],
  facturation: ['invoice_display_name', 'invoice_address', 'invoice_footer_notes', 'invoice_legal_notes'],
  banque: ['bank_name', 'bank_account_holder', 'bank_account_details'],
  visuelle: ['color_primary', 'color_secondary', 'color_accent'],
  preferences: ['currency_code', 'currency_label', 'locale', 'timezone', 'date_format'],
}

const identitySchema = z.object({
  legal_name: z.string().trim().min(2, 'La raison sociale est obligatoire.').max(160),
  trade_name: z.string().trim().max(160).optional(),
  acronym: z.string().trim().max(24).optional(),
  description: z.string().trim().max(1000).optional(),
  activity: z.string().trim().max(200).optional(),
  tagline: z.string().trim().max(200).optional(),
  internal_code: z.string().trim().max(40).optional(),
})

const contactSchema = z.object({
  address_line1: z.string().trim().max(200).optional(),
  address_line2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(80).optional(),
  // §40 : « email valide ». Le champ reste facultatif ; c'est sa FORME qui est
  // contrôlée, et non sa présence.
  email: z
    .string()
    .trim()
    .max(160)
    .refine((value) => value === '' || z.email().safeParse(value).success, {
      message: 'Adresse email invalide.',
    })
    .optional(),
  website: z.string().trim().max(200).optional(),
})

const administrativeSchema = z.object({
  registration_number: z.string().trim().max(80).optional(),
  tax_identifier: z.string().trim().max(80).optional(),
  legal_form: z.string().trim().max(80).optional(),
  administrative_notes: z.string().trim().max(2000).optional(),
})

const commercialSchema = z.object({
  main_activity: z.string().trim().max(200).optional(),
  secondary_activities: z.string().trim().max(500).optional(),
  commercial_description: z.string().trim().max(2000).optional(),
})

const invoicingSchema = z.object({
  invoice_display_name: z.string().trim().max(160).optional(),
  invoice_address: z.string().trim().max(400).optional(),
  invoice_footer_notes: z.string().trim().max(1000).optional(),
  invoice_legal_notes: z.string().trim().max(1000).optional(),
})

const bankSchema = z.object({
  bank_name: z.string().trim().max(160).optional(),
  bank_account_holder: z.string().trim().max(160).optional(),
  bank_account_details: z.string().trim().max(400).optional(),
})

const brandingSchema = z.object({
  color_primary: z.string().trim().regex(HEX_COLOR, 'Couleur attendue au format #1E5AA8.'),
  color_secondary: z.string().trim().regex(HEX_COLOR, 'Couleur attendue au format #1E5AA8.'),
  color_accent: z.string().trim().regex(HEX_COLOR, 'Couleur attendue au format #1E5AA8.'),
})

const preferencesSchema = z.object({
  currency_code: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'Code devise attendu sur trois lettres majuscules (KMF).'),
  currency_label: z.string().trim().max(80).optional(),
  locale: z.string().trim().max(16).optional(),
  timezone: z.string().trim().max(64).optional(),
  date_format: z.string().trim().max(32).optional(),
})

const SCHEMAS: Record<SettingsSection, z.ZodType<Record<string, string | undefined>>> = {
  identite: identitySchema,
  coordonnees: contactSchema,
  administratif: administrativeSchema,
  commercial: commercialSchema,
  facturation: invoicingSchema,
  banque: bankSchema,
  visuelle: brandingSchema,
  preferences: preferencesSchema,
}

/**
 * Enregistre UNE section de la fiche Entreprise.
 *
 * Une action par section, et non une par formulaire : les huit sections
 * partagent exactement la même mécanique — valider, écrire les colonnes de
 * cette section, et rien d'autre. En écrire huit variantes garantirait qu'elles
 * divergent (CLAUDE.md §37).
 */
export async function updateCompanySection(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const key = readText(formData, 'section')
  const section = sectionDefinition(key)

  if (!section) {
    return { error: 'Section de paramètres inconnue.' }
  }

  await requirePermission(section.updatePermission)

  return guarded('parametres:section', async () => {
    const fields = SECTION_FIELDS[section.key]

    const raw = Object.fromEntries(fields.map((field) => [field, readText(formData, field)]))
    const parsed = SCHEMAS[section.key].safeParse(raw)

    if (!parsed.success) {
      return { fieldErrors: toFieldErrors(parsed.error), error: 'Vérifiez les champs signalés.' }
    }

    /*
     * CHANGER LA DEVISE EST UNE DÉCISION, PAS UNE SAISIE — §45 et §57.
     *
     * La documentation exige un avertissement explicite avant modification. Il
     * ne suffit pas de l'AFFICHER : un formulaire renvoyé sans la confirmation
     * — par une requête directe, ou par un navigateur qui n'aurait pas rendu la
     * case — passerait outre. La confirmation est donc EXIGÉE ici.
     */
    if (section.key === 'preferences') {
      const current = readText(formData, 'current_currency')
      const next = String(parsed.data.currency_code ?? '')

      if (current && next && current !== next && readText(formData, 'confirm_currency') !== 'on') {
        return {
          error:
            'Le changement de devise principale doit être confirmé : il affecte les nouveaux documents et opérations.',
          fieldErrors: { confirm_currency: 'Confirmation requise.' },
        }
      }
    }

    const payload: Record<string, string | null> = {}
    for (const field of fields) {
      const value = parsed.data[field]
      // Les couleurs et le code devise ne sont jamais nuls : leur schéma les
      // rend obligatoires, `orNull` ne les videra donc pas.
      payload[field] = orNull(value ?? '')
    }

    // La raison sociale ne se vide pas : elle porte l'en-tête de tout document.
    if (section.key === 'identite' && !payload.legal_name) {
      return { fieldErrors: { legal_name: 'La raison sociale est obligatoire.' } }
    }

    const supabase = await createSupabaseServerClient()
    const { error, count } = await supabase
      .from('company_settings')
      .update(payload, { count: 'exact' })
      .eq('id', true)

    if (error) {
      return { error: friendlyError(error.message, SETTINGS_PATTERNS) }
    }

    /*
     * UNE ÉCRITURE SANS EFFET EST UN REFUS.
     *
     * RLS ne lève pas : elle masque. Une policy qui refuse laisse `count` à
     * zéro et n'explique rien — l'utilisateur croirait avoir enregistré.
     */
    if (!count) {
      return {
        error: 'Vous ne disposez pas des droits nécessaires pour modifier cette section.',
      }
    }

    revalidatePath(SETTINGS_PATH)
    return { success: `${section.title} : modifications enregistrées.` }
  }, SETTINGS_PATTERNS)
}

const SETTINGS_PATTERNS: readonly [RegExp, string][] = [
  [/administratives requiert/i, 'Modifier les informations administratives requiert une autorisation dédiée.'],
  [/bancaires requiert/i, 'Modifier les informations bancaires requiert une autorisation dédiée.'],
  [/identité visuelle requiert/i, 'Modifier l’identité visuelle requiert une autorisation dédiée.'],
  [/paramètres de l’entreprise requiert|paramètres de l'entreprise requiert/i, 'Modifier les paramètres de l’entreprise requiert une autorisation.'],
  [/compteur d’une numérotation|compteur d'une numérotation/i, 'Le compteur d’une numérotation ne se modifie pas : un numéro ne se réutilise jamais.'],
  [/préfixe d’une règle|préfixe d'une règle/i, 'Le préfixe d’une règle de numérotation ne peut pas être vide.'],
]

/* -------------------------------------------------------------------------- */
/*  Numérotation — §15 à §17                                                   */
/* -------------------------------------------------------------------------- */

const numberingSchema = z.object({
  prefix: z
    .string()
    .trim()
    .min(1, 'Le préfixe est obligatoire.')
    .max(12, 'Le préfixe est trop long.')
    .regex(/^[A-Za-z0-9-]+$/, 'Lettres, chiffres et tirets uniquement.'),
  separator: z.string().trim().max(2, 'Le séparateur tient sur deux caractères au plus.'),
  padding: z.coerce
    .number()
    .int()
    .min(1, 'La longueur du compteur va de 1 à 12.')
    .max(12, 'La longueur du compteur va de 1 à 12.'),
})

/**
 * Modifie le FORMAT d'une numérotation — jamais son compteur.
 *
 * DEC-023 §3 pose une contrainte à retenir : une règle utilise l'année OU la
 * série, jamais les deux. La série n'est pas implémentée (son implémentation
 * est reportée), il n'y a donc rien à arbitrer ici aujourd'hui.
 */
export async function updateNumberingRule(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  await requirePermission(PERMISSIONS.SETTINGS_NUMBERING_UPDATE)

  return guarded('parametres:numerotation', async () => {
    const entityKey = readText(formData, 'entity_key')
    if (!entityKey) return { error: 'Règle de numérotation inconnue.' }

    const parsed = numberingSchema.safeParse({
      prefix: readText(formData, 'prefix'),
      separator: readText(formData, 'separator'),
      padding: readText(formData, 'padding'),
    })

    if (!parsed.success) {
      return { fieldErrors: toFieldErrors(parsed.error), error: 'Vérifiez les champs signalés.' }
    }

    const includeYear = readText(formData, 'include_year') === 'on'
    const resetYearly = readText(formData, 'reset_yearly') === 'on'

    /*
     * Une remise à zéro annuelle sans année dans la référence produirait DEUX
     * documents portant le même numéro à un an d'intervalle — exactement la
     * réutilisation que §16 interdit.
     */
    if (resetYearly && !includeYear) {
      return {
        error:
          'Une remise à zéro annuelle exige que l’année figure dans la référence, sans quoi deux documents porteraient le même numéro.',
        fieldErrors: { reset_yearly: 'Incompatible avec une référence sans année.' },
      }
    }

    const supabase = await createSupabaseServerClient()
    const { error, count } = await supabase
      .from('numbering_rules')
      .update(
        {
          prefix: parsed.data.prefix,
          separator: parsed.data.separator,
          padding: parsed.data.padding,
          include_year: includeYear,
          reset_yearly: resetYearly,
        },
        { count: 'exact' }
      )
      .eq('entity_key', entityKey)

    if (error) return { error: friendlyError(error.message, SETTINGS_PATTERNS) }
    if (!count) {
      return { error: 'Vous ne disposez pas des droits nécessaires pour modifier cette règle.' }
    }

    revalidatePath(SETTINGS_PATH)
    return { success: 'Format de numérotation enregistré.' }
  }, SETTINGS_PATTERNS)
}

/* -------------------------------------------------------------------------- */
/*  Logo — §6, §39                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Enregistre le logo officiel — §39.
 *
 * LE FICHIER EST STOCKÉ TEL QUEL. Il n'est ni redimensionné, ni recadré, ni
 * recomposé : CLAUDE.md §33 l'interdit sans réserve, et §39 exige que « le
 * fichier original soit conservé sans déformation ». L'affichage respecte le
 * ratio, le conteneur s'adapte au logo — jamais l'inverse (CLAUDE.md §34).
 *
 * Le bucket est PRIVÉ et ne porte aucune policy : le navigateur ne peut pas
 * lire un objet même en connaissant son chemin. La lecture passe par une URL
 * signée de courte durée, comme pour les documents de véhicule (migration 019).
 */
export async function uploadCompanyLogo(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  await requirePermission(PERMISSIONS.SETTINGS_BRANDING_UPDATE)

  return guarded('parametres:logo', async () => {
    const file = formData.get('logo')

    if (!(file instanceof File) || file.size === 0) {
      return { fieldErrors: { logo: 'Sélectionnez un fichier image.' } }
    }

    // §40 : « fichier image compatible ». Contrôlé ici, et non seulement par
    // l'attribut `accept` du champ, qui n'engage que les navigateurs polis.
    if (!LOGO_MIME_TYPES.includes(file.type)) {
      return { fieldErrors: { logo: 'Formats acceptés : PNG, JPEG, WebP ou SVG.' } }
    }

    if (file.size > LOGO_MAX_BYTES) {
      return { fieldErrors: { logo: 'Le fichier dépasse 2 Mo.' } }
    }

    const admin = createSupabaseAdminClient()
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
    // Le nom porte un horodatage : un remplacement ne recouvre pas l'ancien
    // fichier, et la page ne sert jamais une version périmée en cache.
    const path = `logo/principal-${Date.now()}.${extension}`

    const { error: uploadError } = await admin.storage
      .from('branding')
      .upload(path, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error(`[parametres:logo] dépôt : ${uploadError.message}`)
      return { error: 'Le logo n’a pas pu être enregistré.' }
    }

    const supabase = await createSupabaseServerClient()
    const { data: previous } = await supabase
      .from('company_settings')
      .select('logo_path')
      .eq('id', true)
      .maybeSingle()

    const { error, count } = await supabase
      .from('company_settings')
      .update({ logo_path: path }, { count: 'exact' })
      .eq('id', true)

    if (error || !count) {
      // La fiche n'a pas été mise à jour : le fichier déposé n'a plus de raison
      // d'exister, et le laisser ferait grossir le stockage sans référence.
      await admin.storage.from('branding').remove([path])
      return {
        error: error
          ? friendlyError(error.message, SETTINGS_PATTERNS)
          : 'Vous ne disposez pas des droits nécessaires pour modifier l’identité visuelle.',
      }
    }

    const oldPath = (previous as { logo_path: string | null } | null)?.logo_path
    if (oldPath && oldPath !== path) {
      await admin.storage.from('branding').remove([oldPath])
    }

    revalidatePath(SETTINGS_PATH)
    return { success: 'Logo enregistré.' }
  }, SETTINGS_PATTERNS)
}

/**
 * Retire le logo enregistré — §39.
 *
 * La confirmation est EXIGÉE côté serveur, et pas seulement affichée : un
 * retrait est irréversible — le fichier est effacé du stockage — et ne doit pas
 * pouvoir se déclencher par un appel dépourvu d'intention.
 */
export async function removeCompanyLogo(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  await requirePermission(PERMISSIONS.SETTINGS_BRANDING_UPDATE)

  return guarded('parametres:logo:retrait', async () => {
    if (readText(formData, 'confirm') !== 'oui') {
      return { error: 'Le retrait du logo doit être confirmé.' }
    }

    const supabase = await createSupabaseServerClient()

    const { data: current } = await supabase
      .from('company_settings')
      .select('logo_path')
      .eq('id', true)
      .maybeSingle()

    const path = (current as { logo_path: string | null } | null)?.logo_path
    if (!path) return { error: 'Aucun logo n’est enregistré.' }

    const { error, count } = await supabase
      .from('company_settings')
      .update({ logo_path: null }, { count: 'exact' })
      .eq('id', true)

    if (error) return { error: friendlyError(error.message, SETTINGS_PATTERNS) }
    if (!count) {
      return { error: 'Vous ne disposez pas des droits nécessaires pour modifier l’identité visuelle.' }
    }

    await createSupabaseAdminClient().storage.from('branding').remove([path])

    revalidatePath(SETTINGS_PATH)
    return { success: 'Logo retiré.' }
  }, SETTINGS_PATTERNS)
}
