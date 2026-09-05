import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'

/**
 * Module 09 — Paramètres : vocabulaire et sections.
 *
 * §31 découpe la fiche Entreprise en huit sections. Elles ne sont pas un
 * découpage cosmétique : trois d'entre elles relèvent d'une capacité PROPRE
 * (§34 Administratif, §37 Banque, §38 Identité visuelle), et la base l'impose
 * colonne par colonne (migration 068).
 *
 * Cette liste sert donc à la fois à dessiner l'écran et à savoir, pour chaque
 * section, ce qu'il faut détenir pour la lire et pour l'écrire. La décision
 * reste prise en base ; ici, seulement de quoi ne rien proposer qui serait
 * refusé.
 */

export type SettingsSection =
  | 'identite'
  | 'coordonnees'
  | 'administratif'
  | 'commercial'
  | 'facturation'
  | 'banque'
  | 'visuelle'
  | 'preferences'

export type SectionDefinition = {
  key: SettingsSection
  title: string
  description: string
  /** `null` : la section suit la lecture générale des paramètres. */
  viewPermission: PermissionCode | null
  updatePermission: PermissionCode
}

export const SECTIONS: readonly SectionDefinition[] = [
  {
    key: 'identite',
    title: 'Identité',
    description: 'Qui est ADIKOM. Ces informations servent d’en-tête aux documents générés.',
    viewPermission: null,
    updatePermission: PERMISSIONS.SETTINGS_COMPANY_UPDATE,
  },
  {
    key: 'coordonnees',
    title: 'Coordonnées',
    description: 'Où joindre ADIKOM. Reprises automatiquement dans les documents (§13).',
    viewPermission: null,
    updatePermission: PERMISSIONS.SETTINGS_COMPANY_UPDATE,
  },
  {
    key: 'administratif',
    title: 'Administratif',
    description: 'Registre, identifiants fiscaux et mentions légales.',
    viewPermission: PERMISSIONS.SETTINGS_ADMINISTRATIVE_VIEW,
    updatePermission: PERMISSIONS.SETTINGS_ADMINISTRATIVE_UPDATE,
  },
  {
    key: 'commercial',
    title: 'Commercial',
    description: 'Activités et description commerciale.',
    viewPermission: null,
    updatePermission: PERMISSIONS.SETTINGS_COMPANY_UPDATE,
  },
  {
    key: 'facturation',
    title: 'Facturation',
    description: 'Ce qui figure sur une facture : nom affiché, adresse, mentions.',
    viewPermission: null,
    updatePermission: PERMISSIONS.SETTINGS_COMPANY_UPDATE,
  },
  {
    key: 'banque',
    title: 'Banque',
    description:
      'Coordonnées bancaires officielles destinées aux documents. Les comptes réellement mouvementés relèvent de Banques & Caisses (§37).',
    viewPermission: PERMISSIONS.SETTINGS_BANK_VIEW,
    updatePermission: PERMISSIONS.SETTINGS_BANK_UPDATE,
  },
  {
    key: 'visuelle',
    title: 'Identité visuelle',
    description: 'Logo et couleurs employés par les documents et l’interface.',
    viewPermission: null,
    updatePermission: PERMISSIONS.SETTINGS_BRANDING_UPDATE,
  },
  {
    key: 'preferences',
    title: 'Préférences',
    description: 'Devise, langue, fuseau horaire et format des dates.',
    viewPermission: null,
    updatePermission: PERMISSIONS.SETTINGS_COMPANY_UPDATE,
  },
]

export function sectionDefinition(key: string): SectionDefinition | null {
  return SECTIONS.find((section) => section.key === key) ?? null
}

/* -------------------------------------------------------------------------- */
/*  Numérotation — §15 à §17                                                   */
/* -------------------------------------------------------------------------- */

export type NumberingRule = {
  entityKey: string
  label: string
  prefix: string
  includeYear: boolean
  padding: number
  separator: string
  resetYearly: boolean
  currentYear: number | null
  currentValue: number
  updatedAt: string
}

/**
 * Aperçu du prochain numéro — la même règle que `next_number` en base.
 *
 * ELLE EST RECOPIÉE ICI, ET C'EST UN COMPROMIS ASSUMÉ. La génération réelle
 * reste exclusivement côté serveur (§16) : cet aperçu ne produit aucun numéro,
 * n'incrémente rien, et ne sert qu'à montrer l'effet d'un réglage avant de
 * l'enregistrer. Une divergence entre les deux ne fausserait aucune référence
 * émise — elle rendrait seulement l'aperçu trompeur, ce que la recette éprouve
 * en comparant l'aperçu au numéro réellement produit.
 */
export function previewNumber(
  rule: Pick<NumberingRule, 'prefix' | 'includeYear' | 'padding' | 'separator' | 'resetYearly' | 'currentYear' | 'currentValue'>,
  year: number
): string {
  const next = rule.resetYearly && rule.currentYear !== year ? 1 : rule.currentValue + 1

  const parts = [rule.prefix]
  if (rule.includeYear) parts.push(String(year))
  parts.push(String(next).padStart(rule.padding, '0'))

  return parts.join(rule.separator)
}

/** Année civile d'ADIKOM — celle des Comores, pas celle du serveur (DEC-025 §e). */
export function comorianYear(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Indian/Comoro' }).format(now)
  )
}

/* -------------------------------------------------------------------------- */
/*  Identité visuelle                                                          */
/* -------------------------------------------------------------------------- */

/** Types acceptés pour un logo — §40 : « fichier image compatible ». */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

/**
 * Deux mégaoctets.
 *
 * Un logo destiné à un document n'a aucune raison d'être plus lourd, et une
 * limite basse évite qu'un fichier de plusieurs mégaoctets ralentisse chaque
 * ouverture de l'écran.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024

/** Couleur hexadécimale — §38 : « format exploitable par l'application ». */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
