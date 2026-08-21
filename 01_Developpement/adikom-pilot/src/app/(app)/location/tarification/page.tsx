import type { Metadata } from 'next'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Tabs, type TabItem } from '@/components/ui/tabs'
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
  const tab = searchParams.onglet === 'simulation' ? 'simulation' : 'grille'

  const tabs: TabItem[] = [
    { key: 'grille', label: 'Grille standard', href: '/location/tarification' },
    { key: 'simulation', label: 'Simulation', href: '/location/tarification?onglet=simulation' },
    { key: 'preferentiels', label: 'Tarifs préférentiels', planned: true },
  ]

  return (
    <>
      <PageHeader
        title="Tarification"
        description="Tarifs standard des véhicules et des catégories, et vérification du tarif applicable."
      />

      <Tabs items={tabs} current={tab} label="Sections de la tarification" />

      {tab === 'simulation' ? <SimulationTab /> : <StandardGridTab />}
    </>
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
