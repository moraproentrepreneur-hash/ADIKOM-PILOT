import 'server-only'

import type { ReactNode } from 'react'
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import { getDocumentLogo, registerDocumentFonts } from './assets'
import { DOC_COLORS, DOC_FONTS, DOC_SIZES, DOC_SPACING } from './theme'
import type { DocumentIdentity } from './identity'

/**
 * Enveloppe commune de tous les documents ADIKOM.
 *
 * Porte l'identité, le logo, le titre, la référence et la pagination. Un modèle
 * de document n'a donc qu'à décrire son contenu : il n'a ni à connaître
 * l'adresse d'ADIKOM, ni à redessiner un en-tête (Design System §68).
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: DOC_SPACING.page,
    paddingBottom: DOC_SPACING.page + 16,
    paddingHorizontal: DOC_SPACING.page,
    fontFamily: DOC_FONTS.body,
    fontSize: DOC_SIZES.body,
    color: DOC_COLORS.ink,
    lineHeight: 1.45,
  },

  /*
   * EN-TÊTE — trois blocs, un seul axe.
   *
   * Logo, identité et métadonnées n'ont pas la même hauteur : alignés en haut,
   * ils donnaient trois débuts de lecture à trois hauteurs différentes, et la
   * ligne bleue se retrouvait suspendue sous le seul bloc le plus long.
   * Centrés sur un axe commun, les trois blocs se répondent et la ligne ferme
   * l'ensemble à distance égale.
   */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  /* Logo + identité forment un seul groupe : c'est leur relation qui doit
     rester constante, quelle que soit la longueur de l'adresse. */
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: DOC_SPACING.gutter,
  },
  /* Zone claire derrière le logo : exigence absolue de la charte (§34). */
  logoBox: {
    backgroundColor: DOC_COLORS.surface,
    padding: 4,
    marginRight: DOC_SPACING.gutter + 2,
  },
  logo: { width: 52, height: 52, objectFit: 'contain' },

  identity: { flexShrink: 1 },
  legalName: {
    fontFamily: DOC_FONTS.display,
    fontWeight: 700,
    fontSize: DOC_SIZES.subtitle,
    color: DOC_COLORS.primary,
    letterSpacing: 0.3,
    lineHeight: 1.25,
    marginBottom: 2.5,
  },
  identityLine: { fontSize: DOC_SIZES.small, color: DOC_COLORS.muted, lineHeight: 1.35 },

  reference: { alignItems: 'flex-end', minWidth: 132 },
  referenceLabel: {
    fontSize: DOC_SIZES.tiny,
    color: DOC_COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    lineHeight: 1.25,
  },
  referenceValue: {
    fontFamily: DOC_FONTS.display,
    fontWeight: 600,
    fontSize: DOC_SIZES.section,
    color: DOC_COLORS.ink,
    lineHeight: 1.3,
  },
  /* Second couple libellé / valeur : respiration, sans rompre le bloc. */
  referenceGap: { marginTop: 7 },

  rule: {
    marginTop: DOC_SPACING.gutter + 2,
    borderBottomWidth: 2,
    borderBottomColor: DOC_COLORS.primary,
  },

  /* Le titre porte sa propre interligne : sans elle, celle de la page (1,45)
     ouvrait sous lui un blanc qu'aucune marge ne pilotait. */
  title: {
    marginTop: DOC_SPACING.block + 4,
    fontFamily: DOC_FONTS.display,
    fontWeight: 700,
    fontSize: DOC_SIZES.title,
    color: DOC_COLORS.ink,
    lineHeight: 1.2,
  },
  subtitle: { fontSize: DOC_SIZES.small, color: DOC_COLORS.muted, marginTop: 3 },

  body: { marginTop: DOC_SPACING.block + 2 },

  footer: {
    position: 'absolute',
    bottom: DOC_SPACING.page - 12,
    left: DOC_SPACING.page,
    right: DOC_SPACING.page,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: DOC_COLORS.line,
    paddingTop: 5,
  },
  footerText: { fontSize: DOC_SIZES.tiny, color: DOC_COLORS.muted },
})

export type DocumentShellProps = {
  identity: DocumentIdentity
  /** Nature du document : « Fiche client », « Grille tarifaire »… */
  title: string
  /** Référence interne de l'enregistrement : CLI-000008, VEH-000006… */
  reference?: string
  /**
   * Précision sur la NATURE du document — « Tarifs de location applicables ».
   *
   * Jamais une donnée de l'enregistrement : celle-ci a sa place parmi les
   * champs de la fiche. Répétée ici, elle s'intercale entre le titre et le nom
   * de l'objet, et sépare les deux lignes qui devraient se lire d'un trait.
   */
  subtitle?: string
  /** Date d'édition, déjà formatée. */
  issuedOn: string
  children: ReactNode
}

export function DocumentShell({
  identity,
  title,
  reference,
  subtitle,
  issuedOn,
  children,
}: DocumentShellProps) {
  registerDocumentFonts()

  const contact = [identity.phone && `Tel : ${identity.phone}`, identity.email && `Email : ${identity.email}`]
    .filter(Boolean)
    .join('   ')

  /*
   * Ville et pays sont assemblés avant d'être écrits, et non concaténés à la
   * volée : une ville absente donnait « ADIKOM …, Comores », avec une virgule
   * introduite par rien.
   */
  const place = [identity.city, identity.country].filter(Boolean).join(', ')

  return (
    <Document
      title={reference ? `${title} ${reference}` : title}
      author={identity.legalName}
      creator="ADIKOM PILOT"
      producer="ADIKOM PILOT"
    >
      <Page size="A4" style={styles.page}>
        {/* En-tête, répété sur chaque page d'un document long. */}
        <View style={styles.header} fixed>
          <View style={styles.brand}>
            <View style={styles.logoBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text --
                  Ce n'est pas une image HTML : le composant Image de
                  @react-pdf/renderer n'accepte pas d'attribut alt, et un PDF ne
                  se lit pas au lecteur d'écran par ce biais. */}
              <Image style={styles.logo} src={{ data: getDocumentLogo(), format: 'png' }} />
            </View>

            <View style={styles.identity}>
              <Text style={styles.legalName}>{identity.legalName}</Text>
              {identity.addressLines.map((line) => (
                <Text key={line} style={styles.identityLine}>
                  {line}
                </Text>
              ))}
              {contact !== '' && <Text style={styles.identityLine}>{contact}</Text>}
            </View>
          </View>

          <View style={styles.reference}>
            <Text style={styles.referenceLabel}>Édité le</Text>
            <Text style={styles.referenceValue}>{issuedOn}</Text>
            {reference && (
              <>
                <Text style={[styles.referenceLabel, styles.referenceGap]}>Référence</Text>
                <Text style={styles.referenceValue}>{reference}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.rule} fixed />

        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        <View style={styles.body}>{children}</View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {place ? `${identity.legalName} — ${place}` : identity.legalName}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
