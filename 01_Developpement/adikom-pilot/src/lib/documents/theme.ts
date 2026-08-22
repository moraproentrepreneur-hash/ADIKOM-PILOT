/**
 * Thème documentaire — ADIKOM PILOT.
 *
 * Transposition de la charte pour le rendu PDF. Les valeurs sont celles de
 * `globals.css` : un document imprimé et un écran doivent se ressembler, et
 * cette correspondance ne tient que si elle est écrite une fois, ici.
 *
 * `@react-pdf/renderer` ne connaît ni Tailwind ni les variables CSS : c'est le
 * prix de la fidélité entre aperçu, PDF et impression — un seul artefact, donc
 * un seul jeu de styles à maintenir (Design System §68).
 */

export const DOC_COLORS = {
  /** Bleu ADIKOM — couleur dominante de l'identité (#1E5AA8). */
  primary: '#1e5aa8',
  primaryDark: '#16427b',
  primaryLight: '#7faee3',
  /** Fond très clair des en-têtes de tableau. */
  tint: '#f2f6fb',

  ink: '#1f2937',
  muted: '#6b7280',
  line: '#e5e7eb',
  surface: '#ffffff',

  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  info: '#1e5aa8',
} as const

export const DOC_FONTS = {
  /** Titres — Montserrat, conformément au Design System §14. */
  display: 'Montserrat',
  /** Texte courant — Inter. */
  body: 'Inter',
} as const

/**
 * Échelle typographique, en points.
 * Le corps de texte reste à 9,5 pt : en dessous, un document A4 devient
 * pénible à lire une fois imprimé.
 */
export const DOC_SIZES = {
  title: 18,
  subtitle: 11,
  section: 10,
  body: 9.5,
  small: 8.5,
  tiny: 7.5,
} as const

/** Marges de page, en points. 1 cm ≈ 28,35 pt. */
export const DOC_SPACING = {
  page: 34,
  block: 14,
  row: 5,
  gutter: 10,
} as const
