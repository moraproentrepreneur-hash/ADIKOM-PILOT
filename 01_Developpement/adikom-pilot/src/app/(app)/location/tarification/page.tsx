import type { Metadata } from 'next'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { DocumentToolbar } from '@/components/ui/document-toolbar'
import { ExportButton } from '@/components/ui/export-button'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listPricingRules } from '@/features/pricing/data'
import { PricingRulesPanel } from '@/features/pricing/rules-panel'
import { PricingSimulator } from '@/features/pricing/simulator'
import { listCategoryOptions, listVehicleOptions } from '@/features/fleet/data'
import { listClientOptions } from '@/features/clients/data'

export const metadata: Metadata = { title: 'Tarification' }

export default async function PricingPage(props: PageProps<'/location/tarification'>) {
  await requirePermissionOrRedirect(PERMISSIONS.PRICING_VIEW)

  const searchParams = await props.searchParams
  const requested = typeof searchParams.onglet === 'string' ? searchParams.onglet : 'grille'

  const [canExport, canDownload, canPrint, canSeePreferential] = await Promise.all([
    can(PERMISSIONS.PRICING_EXPORT),
    // DEC-024 : produire un document et l'imprimer sont deux capacités
    // distinctes de la consultation, attribuables séparément.
    can(PERMISSIONS.PRICING_DOWNLOAD),
    can(PERMISSIONS.PRICING_PRINT),
    /*
     * Les tarifs préférentiels relèvent de la fiche client, et de SA capacité :
     * `parties.clients.pricing.view` (DEC-024, migration 007). Consulter la
     * grille standard n'ouvre pas les conditions consenties à un client en
     * particulier — c'est une information commerciale distincte.
     *
     * Sans cette capacité, l'onglet DISPARAÎT plutôt que d'afficher une liste
     * vide qui se lirait « aucun client ne bénéficie d'un tarif » (DEC-017).
     */
    can(PERMISSIONS.CLIENTS_PRICING_VIEW),
  ])

  const tabs: TabItem[] = [
    { key: 'grille', label: 'Grille standard', href: '/location/tarification' },
    { key: 'simulation', label: 'Simulation', href: '/location/tarification?onglet=simulation' },
    ...(canSeePreferential
      ? [
          {
            key: 'preferentiels',
            label: 'Tarifs préférentiels',
            href: '/location/tarification?onglet=preferentiels',
          },
        ]
      : []),
  ]

  const tab = tabs.some((item) => item.key === requested && item.href) ? requested : 'grille'

  return (
    <>
      <PageHeader
        title="Tarification"
        description="Tarifs standard des véhicules et des catégories, et vérification du tarif applicable."
        actions={
          <>
            {/*
              La grille ne porte pas sur un enregistrement : son identifiant est
              conventionnel — voir le registre des documents.
            */}
            <DocumentToolbar
              type="tarification"
              id="grille"
              label="grille tarifaire"
              canDownload={canDownload}
              canPrint={canPrint}
            />
            {canExport && <ExportButton module="tarification" />}
          </>
        }
      />

      <Tabs items={tabs} current={tab} label="Sections de la tarification" />

      {tab === 'simulation' ? (
        <SimulationTab />
      ) : tab === 'preferentiels' ? (
        <PreferentialTab />
      ) : (
        <StandardGridTab />
      )}
    </>
  )
}

/**
 * Tarifs préférentiels — toutes les conditions consenties, tous clients.
 *
 * POURQUOI CET ONGLET, ALORS QUE LA FICHE CLIENT LES PORTE DÉJÀ
 *
 * La fiche client répond à « quelles conditions ce client a-t-il ? ». Cet onglet
 * répond à la question inverse, celle qui manquait : « à qui avons-nous consenti
 * des conditions, et lesquelles ? ». C'est la vue dont on a besoin pour réviser
 * une politique commerciale, ou pour retrouver une remise dont on ne se rappelle
 * plus le bénéficiaire.
 *
 * LE MÊME PANNEAU, LES MÊMES RÈGLES
 *
 * Il réutilise `PricingRulesPanel` — celui de la fiche client et celui de la
 * grille standard. Portée, véhicule, catégorie, mode, montant ou remise, unité,
 * période de validité : rien n'est réécrit ici, et la priorité de la règle la
 * plus spécifique reste celle du résolveur en base (DEC-002).
 *
 * MODIFIER RELÈVE DE LA CAPACITÉ DU CLIENT
 *
 * `parties.clients.pricing.manage`, comme sur la fiche client — et l'action
 * serveur la vérifie de nouveau. Un porteur de `rental.pricing.create`, qui
 * gère la grille standard, ne gagne rien ici : consentir une condition à un
 * client est un autre acte (DEC-024).
 */
async function PreferentialTab() {
  const [rules, categories, vehicles, clients, canManage] = await Promise.all([
    listPricingRules({ withClient: true, includeInactive: true }),
    listCategoryOptions(),
    listVehicleOptions(),
    listClientOptions(),
    can(PERMISSIONS.CLIENTS_PRICING_MANAGE),
  ])

  return (
    <Card
      title="Conditions consenties aux clients"
      description="Toutes les conditions particulières, tous clients confondus. Un tarif verrouillé sur une réservation n’est pas atteint par une modification faite ici."
    >
      {rules.length === 0 ? (
        <Notice tone="info">
          Aucun client ne bénéficie de condition particulière. Le tarif standard s’applique à
          tous. Une condition s’ajoute depuis la fiche du client concerné, ou ici.
        </Notice>
      ) : null}

      <PricingRulesPanel
        rules={rules}
        categories={categories}
        vehicles={vehicles}
        clients={clients}
        editable={canManage}
        preferential
      />
    </Card>
  )
}

/**
 * Grille standard : les tarifs sans client.
 *
 * Les conditions préférentielles se gèrent depuis la fiche du client concerné
 * (03_Modules/04_Tiers.md §8.4) : c'est là qu'elles ont un sens, à côté du
 * client auquel elles s'appliquent.
 */
async function StandardGridTab() {
  const [rules, categories, vehicles, canManage] = await Promise.all([
    listPricingRules({ clientId: null, includeInactive: true }),
    listCategoryOptions(),
    listVehicleOptions(),
    can(PERMISSIONS.PRICING_CREATE),
  ])

  return (
    <Card
      title="Grille standard"
      description="Tarifs applicables à défaut de condition particulière. Chaque tarif porte son unité."
    >
      <PricingRulesPanel
        rules={rules}
        categories={categories}
        vehicles={vehicles}
        editable={canManage}
      />
    </Card>
  )
}

async function SimulationTab() {
  const [clients, vehicles] = await Promise.all([listClientOptions(), listVehicleOptions()])

  return (
    <Card
      title="Quel tarif s’appliquerait ?"
      description="Interroge exactement le résolveur qui vaudra pour une réservation réelle."
    >
      {vehicles.length === 0 ? (
        <Notice tone="warning">
          Aucun véhicule n’est enregistré : il n’y a rien à simuler pour l’instant.
        </Notice>
      ) : (
        <PricingSimulator clients={clients} vehicles={vehicles} />
      )}
    </Card>
  )
}
