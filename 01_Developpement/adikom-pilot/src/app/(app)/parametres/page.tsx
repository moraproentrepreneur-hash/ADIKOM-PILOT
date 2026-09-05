import type { Metadata } from 'next'
import { AlertTriangle, Check, Hash, ShieldAlert } from 'lucide-react'

import { Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { can, requireAnyPermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import {
  configurationChecklist,
  getCompanySettings,
  getSensitiveSettings,
  listNumberingRules,
} from '@/features/settings/data'
import { comorianYear } from '@/features/settings/constants'
import { PreferencesSection, SectionForm } from '@/features/settings/section-form'
import { LogoPanel } from '@/features/settings/logo-panel'
import { NumberingRuleForm } from '@/features/settings/numbering-form'

export const metadata: Metadata = { title: 'Paramètres' }

/**
 * Module 09 — Paramètres.
 *
 * « Une information générale configurée une fois → réutilisée de manière
 * cohérente dans tout le système » (§59).
 *
 * L'écran s'ouvre à qui détient AU MOINS UNE des deux lectures du module —
 * l'entreprise (§30) ou la numérotation (§15). Chaque onglet réexige ensuite la
 * sienne : détenir l'une n'ouvre pas l'autre (DEC-024).
 *
 * TROIS SECTIONS ONT LEUR PROPRE CAPACITÉ. Administratif (§34), Banque (§37) et
 * Identité visuelle (§38) ne se lisent ni ne s'écrivent avec la capacité
 * générale. La base l'impose colonne par colonne (migration 068) ; l'écran ne
 * fait que le refléter, et le DIT lorsqu'une section reste fermée.
 */
export default async function SettingsPage(props: PageProps<'/parametres'>) {
  const user = await requireAnyPermissionOrRedirect([
    PERMISSIONS.SETTINGS_COMPANY_VIEW,
    PERMISSIONS.SETTINGS_NUMBERING_VIEW,
  ])

  const searchParams = await props.searchParams
  const asked = typeof searchParams.onglet === 'string' ? searchParams.onglet : ''

  const [mayViewCompany, mayViewNumbering] = await Promise.all([
    can(PERMISSIONS.SETTINGS_COMPANY_VIEW),
    can(PERMISSIONS.SETTINGS_NUMBERING_VIEW),
  ])

  // Le Super Admin traverse toutes les gardes (Module 08 §33). Son cas est lu
  // sur la session, et non déduit de l'absence de capacité : une déduction
  // serait juste aujourd'hui et fausse au premier changement de garde.
  const canCompany = mayViewCompany || user.isSuperAdmin
  const canNumbering = mayViewNumbering || user.isSuperAdmin

  // L'onglet par défaut est celui qu'on a le droit d'ouvrir.
  const current =
    asked === 'numerotation' && canNumbering
      ? 'numerotation'
      : canCompany
        ? 'entreprise'
        : 'numerotation'

  const tabs = [
    { key: 'entreprise', label: 'Entreprise', href: '/parametres?onglet=entreprise' },
    { key: 'numerotation', label: 'Numérotation', href: '/parametres?onglet=numerotation' },
  ]

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="La configuration générale d’ADIKOM, définie une fois et reprise partout."
      />

      <Tabs items={tabs} current={current} label="Sections des paramètres" />

      {current === 'entreprise' ? (
        canCompany ? (
          <CompanyTab />
        ) : (
          <Refus capacite="Consulter les paramètres entreprise" />
        )
      ) : canNumbering ? (
        <NumberingTab />
      ) : (
        <Refus capacite="Consulter les règles de numérotation" />
      )}
    </>
  )
}

function Refus({ capacite }: { capacite: string }) {
  return (
    <Card>
      <EmptyState
        icon={ShieldAlert}
        title="Section non consultable avec vos droits"
        description={`Capacité requise : ${capacite}.`}
      />
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Onglet Entreprise — §31 à §38                                              */
/* -------------------------------------------------------------------------- */

async function CompanyTab() {
  const [settings, sensitive] = await Promise.all([getCompanySettings(), getSensitiveSettings()])

  if (!settings) {
    return (
      <Card>
        <EmptyState
          title="Configuration introuvable"
          description="Aucune fiche entreprise n’est enregistrée. Signalez-le à l’administrateur."
        />
      </Card>
    )
  }

  const [canUpdate, canUpdateAdmin, canUpdateBank, canUpdateBranding] = await Promise.all([
    can(PERMISSIONS.SETTINGS_COMPANY_UPDATE),
    can(PERMISSIONS.SETTINGS_ADMINISTRATIVE_UPDATE),
    can(PERMISSIONS.SETTINGS_BANK_UPDATE),
    can(PERMISSIONS.SETTINGS_BRANDING_UPDATE),
  ])

  const checklist = configurationChecklist(settings, sensitive)
  const text = (value: string | null) => value ?? ''

  return (
    <div className="space-y-5">
      {/* §49 — l'indicateur de configuration */}
      <Card
        title="État de la configuration"
        description="Ce qui est renseigné, et ce qui manque avant un usage complet du SaaS."
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-start gap-2.5">
              {!item.readable ? (
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              ) : item.done ? (
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="block text-sm text-ink">{item.label}</span>
                <span className="block text-xs text-muted">
                  {!item.readable ? 'Non consultable avec vos droits' : item.hint}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          Dernière modification : {formatDateTime(settings.updatedAt) ?? '—'}. Chaque changement
          est journalisé (§43) et consultable dans le Journal d’activité.
        </p>
      </Card>

      <SectionForm
        section="identite"
        title="Identité"
        description="Qui est ADIKOM. Ces informations servent d’en-tête aux documents générés."
        canUpdate={canUpdate}
        fields={[
          { name: 'legal_name', label: 'Raison sociale', value: settings.legalName, required: true },
          { name: 'trade_name', label: 'Nom commercial', value: text(settings.tradeName) },
          { name: 'acronym', label: 'Sigle', value: text(settings.acronym) },
          { name: 'internal_code', label: 'Identifiant interne', value: text(settings.internalCode) },
          { name: 'activity', label: 'Activité', value: text(settings.activity) },
          { name: 'tagline', label: 'Slogan', value: text(settings.tagline) },
          {
            name: 'description',
            label: 'Description',
            value: text(settings.description),
            type: 'textarea',
          },
        ]}
      />

      <SectionForm
        section="coordonnees"
        title="Coordonnées"
        description="Où joindre ADIKOM. Reprises automatiquement dans les documents (§13)."
        canUpdate={canUpdate}
        fields={[
          { name: 'address_line1', label: 'Adresse', value: text(settings.addressLine1), wide: true },
          {
            name: 'address_line2',
            label: 'Complément d’adresse',
            value: text(settings.addressLine2),
            wide: true,
          },
          { name: 'city', label: 'Ville', value: text(settings.city) },
          { name: 'country', label: 'Pays', value: text(settings.country) },
          {
            name: 'phone',
            label: 'Téléphone',
            value: text(settings.phone),
            hint: 'Plusieurs numéros peuvent être séparés par une barre verticale.',
          },
          { name: 'email', label: 'Email', value: text(settings.email), type: 'email' },
          { name: 'website', label: 'Site internet', value: text(settings.website), wide: true },
        ]}
      />

      {/*
        §34 — la section administrative ne se lit ni ne s'écrit avec la
        capacité générale. Quand elle est fermée, l'écran le DIT : des champs
        vides se liraient « non renseigné » (DEC-017).
      */}
      <SectionForm
        section="administratif"
        title="Administratif"
        description="Registre, identifiants fiscaux et mentions légales."
        canRead={sensitive?.mayReadAdministrative ?? false}
        requiredCapability="Voir les informations administratives"
        canUpdate={canUpdateAdmin}
        fields={[
          {
            name: 'registration_number',
            label: 'Numéro de registre',
            value: text(sensitive?.registrationNumber ?? null),
          },
          {
            name: 'tax_identifier',
            label: 'Identifiant fiscal',
            value: text(sensitive?.taxIdentifier ?? null),
          },
          { name: 'legal_form', label: 'Forme juridique', value: text(sensitive?.legalForm ?? null) },
          {
            name: 'administrative_notes',
            label: 'Mentions et observations',
            value: text(sensitive?.administrativeNotes ?? null),
            type: 'textarea',
          },
        ]}
      />

      <SectionForm
        section="commercial"
        title="Commercial"
        description="Activités et description commerciale."
        canUpdate={canUpdate}
        fields={[
          { name: 'main_activity', label: 'Activité principale', value: text(settings.mainActivity) },
          {
            name: 'secondary_activities',
            label: 'Activités secondaires',
            value: text(settings.secondaryActivities),
          },
          {
            name: 'commercial_description',
            label: 'Description commerciale',
            value: text(settings.commercialDescription),
            type: 'textarea',
          },
        ]}
      />

      <SectionForm
        section="facturation"
        title="Facturation"
        description="Ce qui figure sur une facture : nom affiché, adresse, mentions."
        canUpdate={canUpdate}
        fields={[
          {
            name: 'invoice_display_name',
            label: 'Nom affiché sur les factures',
            value: text(settings.invoiceDisplayName),
          },
          {
            name: 'invoice_address',
            label: 'Adresse de facturation',
            value: text(settings.invoiceAddress),
            type: 'textarea',
          },
          {
            name: 'invoice_footer_notes',
            label: 'Pied de page',
            value: text(settings.invoiceFooterNotes),
            type: 'textarea',
          },
          {
            name: 'invoice_legal_notes',
            label: 'Mentions légales',
            value: text(settings.invoiceLegalNotes),
            type: 'textarea',
          },
        ]}
      />

      {/* §37 — les coordonnées bancaires ont leur propre capacité. */}
      <SectionForm
        section="banque"
        title="Banque"
        description="Coordonnées bancaires officielles destinées aux documents. Les comptes réellement mouvementés relèvent de Banques & Caisses."
        canRead={sensitive?.mayReadBank ?? false}
        requiredCapability="Voir les informations bancaires"
        canUpdate={canUpdateBank}
        fields={[
          { name: 'bank_name', label: 'Banque', value: text(sensitive?.bankName ?? null) },
          {
            name: 'bank_account_holder',
            label: 'Titulaire',
            value: text(sensitive?.bankAccountHolder ?? null),
          },
          {
            name: 'bank_account_details',
            label: 'Références du compte',
            value: text(sensitive?.bankAccountDetails ?? null),
            type: 'textarea',
          },
        ]}
      />

      <LogoPanel hasLogo={Boolean(settings.logoPath)} canUpdate={canUpdateBranding} />

      <SectionForm
        section="visuelle"
        title="Couleurs"
        description="Employées par les documents générés. Format hexadécimal (§38)."
        canUpdate={canUpdateBranding}
        fields={[
          { name: 'color_primary', label: 'Couleur principale', value: settings.colorPrimary },
          { name: 'color_secondary', label: 'Couleur secondaire', value: settings.colorSecondary },
          { name: 'color_accent', label: 'Couleur d’accent', value: settings.colorAccent },
        ]}
      />

      <PreferencesSection
        currentCurrency={settings.currencyCode}
        canUpdate={canUpdate}
        fields={[
          { name: 'currency_label', label: 'Libellé de la devise', value: settings.currencyLabel },
          { name: 'locale', label: 'Langue', value: settings.locale, hint: 'Français : fr-FR.' },
          {
            name: 'timezone',
            label: 'Fuseau horaire',
            value: settings.timezone,
            hint: 'Comores : Indian/Comoro.',
          },
          { name: 'date_format', label: 'Format des dates', value: settings.dateFormat },
        ]}
      />

      <Notice tone="info">
        <p className="font-medium">Une modification ne réécrit pas le passé.</p>
        <p className="mt-1">
          Les nouveaux documents emploient les valeurs à jour ; les documents déjà émis conservent
          les informations qui leur étaient associées (§46, §47).
        </p>
      </Notice>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Onglet Numérotation — §15 à §17                                            */
/* -------------------------------------------------------------------------- */

async function NumberingTab() {
  const [rules, canUpdate] = await Promise.all([
    listNumberingRules(),
    can(PERMISSIONS.SETTINGS_NUMBERING_UPDATE),
  ])

  const year = comorianYear()

  return (
    <div className="space-y-5">
      <Notice tone="info">
        Les formats sont modifiables <strong>sans redéploiement</strong> (DEC-005). La génération
        reste atomique et côté serveur : aucun doublon, aucune collision, aucune réutilisation
        (§16). Le <strong>compteur</strong> n’est pas modifiable — un numéro déjà émis ne se
        réutilise jamais.
      </Notice>

      <Card
        title="Règles de numérotation"
        description={`Aperçu calculé sur l’exercice ${year}, celui d’ADIKOM.`}
      >
        {rules.length === 0 ? (
          <EmptyState
            icon={Hash}
            title="Aucune règle de numérotation"
            description="Aucune règle n’est définie. Signalez-le à l’administrateur."
          />
        ) : (
          <ul className="space-y-3">
            {rules.map((rule) => (
              <NumberingRuleForm
                key={rule.entityKey}
                rule={rule}
                year={year}
                canUpdate={canUpdate}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
