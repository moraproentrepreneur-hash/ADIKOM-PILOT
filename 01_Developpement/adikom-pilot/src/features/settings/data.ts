import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'
import type { NumberingRule } from './constants'

/**
 * Accès aux paramètres — Module 09.
 *
 * Toutes les lectures passent par le client porteur de la session : la policy
 * `company_settings_select` exige `settings.company.view`.
 *
 * CE QUE CETTE COUCHE NE PEUT PAS DEMANDER.
 *
 * Les quatre colonnes administratives (§34) et les trois colonnes bancaires
 * (§37) ne figurent dans aucune requête d'ici, et ce n'est pas une convenance :
 * la migration 068 les a retirées des droits de `authenticated`. Les demander
 * produirait une erreur, y compris par appel direct à l'API. Elles passent
 * exclusivement par `company_settings_sensitive()`, qui exige la capacité de
 * chaque section et DIT laquelle manque (DEC-017).
 */

export type CompanySettings = {
  legalName: string
  tradeName: string | null
  acronym: string | null
  description: string | null
  activity: string | null
  tagline: string | null
  internalCode: string | null

  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  country: string | null
  phone: string | null
  email: string | null
  website: string | null

  mainActivity: string | null
  secondaryActivities: string | null
  commercialDescription: string | null

  invoiceDisplayName: string | null
  invoiceAddress: string | null
  invoiceFooterNotes: string | null
  invoiceLegalNotes: string | null

  logoPath: string | null
  logoSecondaryPath: string | null
  colorPrimary: string
  colorSecondary: string
  colorAccent: string

  currencyCode: string
  currencyLabel: string
  locale: string
  timezone: string
  dateFormat: string

  rentalDurationRounding: string | null
  rentalBufferMinutes: number | null
  imputationApprovalThreshold: number | null

  updatedAt: string
}

export type SensitiveSettings = {
  /** L'appelant a-t-il le droit de lire la section Administratif (§34) ? */
  mayReadAdministrative: boolean
  /** Et la section Banque (§37) ? */
  mayReadBank: boolean

  registrationNumber: string | null
  taxIdentifier: string | null
  legalForm: string | null
  administrativeNotes: string | null

  bankName: string | null
  bankAccountHolder: string | null
  bankAccountDetails: string | null
}

const SELECT = `
  legal_name, trade_name, acronym, description, activity, tagline, internal_code,
  address_line1, address_line2, city, country, phone, email, website,
  main_activity, secondary_activities, commercial_description,
  invoice_display_name, invoice_address, invoice_footer_notes, invoice_legal_notes,
  logo_path, logo_secondary_path, color_primary, color_secondary, color_accent,
  currency_code, currency_label, locale, timezone, date_format,
  rental_duration_rounding, rental_buffer_minutes, imputation_approval_threshold,
  updated_at
`

type RawSettings = Record<string, string | number | null>

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('company_settings')
    .select(SELECT)
    .eq('id', true)
    .maybeSingle()

  if (error) {
    reportQueryFailure(
      'paramètres entreprise',
      error,
      'Les paramètres de l’entreprise n’ont pas pu être chargés.'
    )
  }
  if (!data) return null

  const row = data as unknown as RawSettings
  const text = (key: string) => (row[key] as string | null) ?? null

  return {
    legalName: (row.legal_name as string) ?? '',
    tradeName: text('trade_name'),
    acronym: text('acronym'),
    description: text('description'),
    activity: text('activity'),
    tagline: text('tagline'),
    internalCode: text('internal_code'),

    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    country: text('country'),
    phone: text('phone'),
    email: text('email'),
    website: text('website'),

    mainActivity: text('main_activity'),
    secondaryActivities: text('secondary_activities'),
    commercialDescription: text('commercial_description'),

    invoiceDisplayName: text('invoice_display_name'),
    invoiceAddress: text('invoice_address'),
    invoiceFooterNotes: text('invoice_footer_notes'),
    invoiceLegalNotes: text('invoice_legal_notes'),

    logoPath: text('logo_path'),
    logoSecondaryPath: text('logo_secondary_path'),
    colorPrimary: (row.color_primary as string) ?? '#1E5AA8',
    colorSecondary: (row.color_secondary as string) ?? '#7FAEE3',
    colorAccent: (row.color_accent as string) ?? '#F2F6FB',

    currencyCode: (row.currency_code as string) ?? 'KMF',
    currencyLabel: (row.currency_label as string) ?? '',
    locale: (row.locale as string) ?? 'fr-FR',
    timezone: (row.timezone as string) ?? 'Indian/Comoro',
    dateFormat: (row.date_format as string) ?? 'dd/MM/yyyy',

    rentalDurationRounding: text('rental_duration_rounding'),
    rentalBufferMinutes: (row.rental_buffer_minutes as number | null) ?? null,
    imputationApprovalThreshold: (row.imputation_approval_threshold as number | null) ?? null,

    updatedAt: (row.updated_at as string) ?? '',
  }
}

/**
 * Sections Administratif et Banque — arbitrées en base (§34, §37, §42).
 *
 * La fonction rend TOUJOURS une réponse : « autorisé, voici » ou « refusé ».
 * Un champ vide et un champ interdit ne se ressemblent pas à l'écran.
 */
export async function getSensitiveSettings(): Promise<SensitiveSettings | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('company_settings_sensitive')

  if (error) {
    reportQueryFailure(
      'paramètres sensibles',
      error,
      'Les informations administratives et bancaires n’ont pas pu être chargées.'
    )
  }

  const row = (data as
    | {
        may_read_administrative: boolean
        may_read_bank: boolean
        registration_number: string | null
        tax_identifier: string | null
        legal_form: string | null
        administrative_notes: string | null
        bank_name: string | null
        bank_account_holder: string | null
        bank_account_details: string | null
      }[]
    | null)?.[0]

  if (!row) return null

  return {
    mayReadAdministrative: row.may_read_administrative,
    mayReadBank: row.may_read_bank,
    registrationNumber: row.registration_number,
    taxIdentifier: row.tax_identifier,
    legalForm: row.legal_form,
    administrativeNotes: row.administrative_notes,
    bankName: row.bank_name,
    bankAccountHolder: row.bank_account_holder,
    bankAccountDetails: row.bank_account_details,
  }
}

/** Règles de numérotation — §15. Lecture sous `settings.numbering.view`. */
export async function listNumberingRules(): Promise<NumberingRule[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('numbering_rules')
    .select(
      'entity_key, label, prefix, include_year, padding, separator, reset_yearly, current_year, current_value, updated_at'
    )
    .order('label')

  if (error) {
    reportQueryFailure(
      'règles de numérotation',
      error,
      'Les règles de numérotation n’ont pas pu être chargées.'
    )
  }

  return ((data ?? []) as unknown as {
    entity_key: string
    label: string
    prefix: string
    include_year: boolean
    padding: number
    separator: string
    reset_yearly: boolean
    current_year: number | null
    current_value: number
    updated_at: string
  }[]).map((row) => ({
    entityKey: row.entity_key,
    label: row.label,
    prefix: row.prefix,
    includeYear: row.include_year,
    padding: row.padding,
    separator: row.separator,
    resetYearly: row.reset_yearly,
    currentYear: row.current_year,
    currentValue: row.current_value,
    updatedAt: row.updated_at,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Indicateur de configuration — §49                                          */
/* -------------------------------------------------------------------------- */

export type ConfigurationCheck = {
  label: string
  done: boolean
  /** `false` quand l'appelant n'a pas le droit de savoir (DEC-017). */
  readable: boolean
  hint: string
}

/**
 * Ce qui est configuré, ce qui ne l'est pas — §49.
 *
 * L'indicateur ne devine rien : une section qu'on n'a pas le droit de lire est
 * annoncée comme telle plutôt que comptée « incomplète », ce qui reviendrait à
 * révéler qu'elle est vide — ou à affirmer à tort qu'elle l'est.
 */
export function configurationChecklist(
  settings: CompanySettings,
  sensitive: SensitiveSettings | null
): ConfigurationCheck[] {
  const filled = (value: string | null) => Boolean(value && value.trim())

  return [
    {
      label: 'Identité',
      done: filled(settings.legalName),
      readable: true,
      hint: 'Raison sociale — elle figure en tête de chaque document.',
    },
    {
      label: 'Coordonnées',
      done: filled(settings.addressLine1) && filled(settings.phone),
      readable: true,
      hint: 'Adresse et téléphone — repris automatiquement dans les documents.',
    },
    {
      label: 'Devise',
      done: filled(settings.currencyCode),
      readable: true,
      hint: 'Devise principale des montants.',
    },
    {
      label: 'Logo',
      done: filled(settings.logoPath),
      readable: true,
      hint: 'Logo officiel enregistré (§6).',
    },
    {
      label: 'Informations administratives',
      done: Boolean(
        sensitive?.mayReadAdministrative &&
          (filled(sensitive.registrationNumber) || filled(sensitive.taxIdentifier))
      ),
      readable: Boolean(sensitive?.mayReadAdministrative),
      hint: 'Registre ou identifiant fiscal (§34).',
    },
    {
      label: 'Informations bancaires',
      done: Boolean(sensitive?.mayReadBank && filled(sensitive.bankAccountDetails)),
      readable: Boolean(sensitive?.mayReadBank),
      hint: 'Coordonnées destinées aux documents (§37).',
    },
  ]
}
