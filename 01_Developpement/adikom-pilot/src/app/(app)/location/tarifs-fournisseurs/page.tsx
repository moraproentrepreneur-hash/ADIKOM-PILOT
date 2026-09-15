import type { Metadata } from 'next'
import Link from 'next/link'
import { Lock, Search, Wallet } from 'lucide-react'

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { Notice } from '@/components/ui/feedback'
import { ExportButton } from '@/components/ui/export-button'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, todayISO } from '@/lib/dates'
import { ORIGIN_LABELS } from '@/features/fleet/data'
import { listSupplierOptions } from '@/features/suppliers/data'
import {
  listAcquisitionVehicles,
  listRateVehicleOptions,
  type AcquisitionVehicleRow,
} from '@/features/supplier-rates/data'
import { formatRate, INTERNAL_NOTICE } from '@/features/supplier-rates/constants'
import { CommissionAmount } from '@/features/supplier-rates/commission'
import { NewRatePanel } from '@/features/supplier-rates/rates-panel'

export const metadata: Metadata = { title: 'Tarifs fournisseurs' }

/**
 * Tarifs fournisseurs des véhicules — LOT 21, DEC-044.
 *
 * LA QUESTION À LAQUELLE CET ÉCRAN RÉPOND
 *
 * « Combien ADIKOM paie-t-elle ce véhicule, combien le facture-t-elle, et que
 *   lui reste-t-il ? » — à une DATE donnée, et non « aujourd'hui » seulement :
 * le sélecteur de date interroge le résolveur exactement comme une location le
 * ferait (D16(c)).
 *
 * CE QU'IL NE DIT PAS, ET LE DIT
 *
 *   · Un véhicule sans coût renseigné n'a pas un coût de 0 (DEC-008) ;
 *   · un véhicule ADIKOM ou de partenariat n'a PAS de coût d'acquisition dans ce
 *     SaaS : la décision manque, et rien n'est supposé à sa place ;
 *   · la commission montrée ici s'appuie sur le TARIF STANDARD du barème. Le
 *     tarif réellement appliqué à un contrat est celui qui y est VERROUILLÉ, et
 *     il se lit sur le contrat — c'est écrit sur l'écran, parce que confondre
 *     les deux ferait prendre une indication pour un résultat.
 *
 * L'ÉCRAN EST INTERNE, ET IL LE DIT. Aucun de ces montants ne figure sur un
 * document remis à un client (Plan 02 §6.4).
 */
export default async function SupplierRatesPage(
  props: PageProps<'/location/tarifs-fournisseurs'>
) {
  // Garde serveur : le filtrage de la barre latérale n'est qu'un confort de
  // lecture, jamais une protection (CLAUDE.md §19).
  await requirePermissionOrRedirect(PERMISSIONS.PRICING_SUPPLIER_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : ''

  // Le jour est comorien, pas celui du navigateur ni celui du serveur (DEC-025 §e).
  const today = todayISO()
  const on = /^\d{4}-\d{2}-\d{2}$/.test(read('au')) ? read('au') : today

  const filters = {
    search: read('q'),
    supplierId: read('fournisseur'),
    origin: read('origine'),
    on,
  }

  const [canCreate, canExport, canFleet, canPricingView, canSuppliers] = await Promise.all([
    can(PERMISSIONS.PRICING_SUPPLIER_CREATE),
    // DEC-024 : exporter est une capacité distincte de consulter.
    can(PERMISSIONS.PRICING_SUPPLIER_EXPORT),
    /*
     * Cet écran présente LE PARC. `vehicles_select` exige `rental.fleet.view`, et
     * sans elle la liste reviendrait VIDE — ce qui se lirait « aucun véhicule »,
     * affirmation qu'un refus de lecture ne permet pas (DEC-017). L'écran nomme
     * donc la capacité manquante plutôt que de laisser croire à un parc vide.
     */
    can(PERMISSIONS.FLEET_VIEW),
    can(PERMISSIONS.PRICING_VIEW),
    can(PERMISSIONS.SUPPLIERS_VIEW),
  ])

  const [vehicles, suppliers, rateVehicles] = await Promise.all([
    canFleet ? listAcquisitionVehicles(filters) : Promise.resolve([]),
    canSuppliers ? listSupplierOptions() : Promise.resolve([]),
    canCreate && canFleet ? listRateVehicleOptions() : Promise.resolve([]),
  ])

  const hasFilters = Boolean(filters.search || filters.supplierId || filters.origin)
  const supplied = vehicles.filter((row) => row.origin === 'SUPPLIED')
  const priced = supplied.filter((row) => row.cost !== null).length

  return (
    <>
      <PageHeader
        title="Tarifs fournisseurs"
        description="Ce qu’ADIKOM paie pour disposer de chaque véhicule, et la commission qui en résulte."
        actions={canExport ? <ExportButton module="tarifs-fournisseurs" filters={{ au: on }} /> : undefined}
      />

      <Notice tone="info" className="mb-5">
        <strong>Écran interne.</strong> {INTERNAL_NOTICE} La commission présentée ici se calcule
        sur le <strong>tarif standard du barème</strong> : le tarif réellement appliqué à un
        contrat est celui qui y est verrouillé, et il se lit sur le contrat. À ne pas confondre
        non plus avec la <strong>marge d’exploitation</strong> d’un véhicule — maintenances et
        imputations comprises —, qui se lit sur l’onglet « Rentabilité » de sa fiche.
      </Notice>

      {!canFleet ? (
        <Card>
          <Notice tone="warning">
            Cet écran présente les véhicules du parc et leur coût d’acquisition. Il exige donc
            aussi la capacité <strong>« Consulter le parc »</strong>, que votre compte ne détient
            pas. La liste n’est pas vide : elle ne vous est pas lisible.
          </Notice>
        </Card>
      ) : (
        <>
          {/* Formulaire GET : l'état des filtres reste dans l'URL, la page demeure
              partageable et rechargeable. */}
          <form method="get" className="mb-5">
            <Card>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative lg:col-span-2">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                    aria-hidden
                  />
                  <Input
                    name="q"
                    type="search"
                    defaultValue={filters.search}
                    placeholder="Marque, modèle, immatriculation…"
                    aria-label="Rechercher un véhicule"
                    className="pl-9"
                  />
                </div>

                <Select
                  name="fournisseur"
                  defaultValue={filters.supplierId}
                  aria-label="Filtrer par fournisseur"
                >
                  <option value="">Tous les fournisseurs</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.label}
                    </option>
                  ))}
                </Select>

                <Select
                  name="origine"
                  defaultValue={filters.origin}
                  aria-label="Filtrer par origine"
                >
                  <option value="">Toutes les origines</option>
                  {Object.entries(ORIGIN_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>

                <div className="flex gap-2 lg:col-span-2">
                  {/*
                    LA DATE D'EFFET EST UN FILTRE À PART ENTIÈRE, et c'est tout
                    l'intérêt de l'historisation : « quel coût s'appliquait le
                    15 septembre ? » se répond ici, sans attendre ni remonter le
                    temps (D16(c)).
                  */}
                  <Input
                    name="au"
                    type="date"
                    defaultValue={on}
                    aria-label="Coûts applicables à cette date"
                    className="flex-1"
                  />
                  <button
                    type="submit"
                    className="min-h-11 rounded-control bg-adikom-500 px-4 text-sm font-medium text-white transition-colors hover:bg-adikom-600 sm:min-h-0"
                  >
                    Appliquer
                  </button>
                </div>
              </div>

              <p className="mt-3 text-xs text-muted">
                Coûts applicables au <strong>{formatDate(on)}</strong> · {priced} véhicule
                {priced > 1 ? 's' : ''} fourni{priced > 1 ? 's' : ''} sur {supplied.length} avec un
                coût renseigné
                {hasFilters && (
                  <>
                    {' · '}
                    <Link
                      href="/location/tarifs-fournisseurs"
                      className="text-adikom-500 hover:underline"
                    >
                      Réinitialiser les filtres
                    </Link>
                  </>
                )}
              </p>
            </Card>
          </form>

          {canCreate && (
            <div className="mb-5 flex">
              <NewRatePanel
                vehicles={rateVehicles.map((vehicle) => ({
                  id: vehicle.id,
                  label: vehicle.label,
                  supplierLabel: vehicle.supplierLabel,
                }))}
                today={today}
              />
            </div>
          )}

          <Card className="overflow-hidden">
            {vehicles.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title={hasFilters ? 'Aucun véhicule ne correspond' : 'Aucun véhicule au parc'}
                description={
                  hasFilters
                    ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                    : 'Un coût d’acquisition se rattache à un véhicule fourni par un fournisseur.'
                }
              />
            ) : (
              <RatesTable rows={vehicles} on={on} canPricingView={canPricingView} />
            )}
          </Card>
        </>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */

function RatesTable({
  rows,
  on,
  canPricingView,
}: {
  rows: AcquisitionVehicleRow[]
  on: string
  canPricingView: boolean
}) {
  /*
   * « Le tarif client m'est-il lisible ? » se déduit de DEUX choses, et pas
   * d'une seule : la capacité, et le fait qu'un montant soit REVENU. La policy
   * de `pricing_rules` accepte plusieurs capacités ; la recopier ici en
   * produirait une seconde version, qui divergerait. La présence d'un montant,
   * elle, PROUVE la lisibilité.
   */
  const readable = (row: AcquisitionVehicleRow) => canPricingView || row.standardPrice !== null

  return (
    <>
      {/* Desktop : tableau. Mobile : cartes — l'interface est réorganisée, pas
          simplement réduite (CLAUDE.md §35). */}
      <div className="-mx-5 -my-4 hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-adikom-50 text-left">
              <th className="px-5 py-3 font-medium text-ink">Véhicule</th>
              <th className="px-5 py-3 font-medium text-ink">Fournisseur</th>
              <th className="px-5 py-3 font-medium text-ink">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="size-3.5" aria-hidden />
                  Coût d’acquisition
                </span>
              </th>
              <th className="px-5 py-3 font-medium text-ink">Applicable</th>
              <th className="px-5 py-3 font-medium text-ink">Tarif client standard</th>
              <th className="px-5 py-3 font-medium text-ink">Commission</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/location/parc/${row.id}?onglet=cout-fournisseur`}
                    className="font-medium text-adikom-500 hover:underline"
                  >
                    {row.label}
                  </Link>
                  <span className="mt-0.5 block text-xs text-muted tabular">
                    {row.vehicleNo}
                    {row.categoryLabel ? ` · ${row.categoryLabel}` : ''}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted">
                  {row.origin === 'SUPPLIED' ? (
                    (row.supplierLabel ?? (
                      <span className="text-xs">Non lisible avec vos droits</span>
                    ))
                  ) : (
                    <Badge>{ORIGIN_LABELS[row.origin]}</Badge>
                  )}
                </td>
                <td className="px-5 py-3">
                  <CostCell row={row} on={on} />
                </td>
                <td className="px-5 py-3 text-xs text-muted tabular">
                  {row.cost ? (
                    <>
                      depuis le {formatDate(row.cost.validFrom)}
                      {row.cost.validTo && <> jusqu’au {formatDate(row.cost.validTo)}</>}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-5 py-3 tabular text-muted">
                  {row.standardPrice ? (
                    formatRate(row.standardPrice.amount, row.standardPrice.unit)
                  ) : (
                    <span className="text-xs">
                      {canPricingView ? 'Aucun tarif applicable' : 'Non accessible'}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <CommissionAmount
                    clientPrice={row.standardPrice}
                    cost={row.cost}
                    canSeeCost
                    canSeeClientPrice={readable(row)}
                    supplied={row.origin === 'SUPPLIED'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-control border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/location/parc/${row.id}?onglet=cout-fournisseur`}
                  className="font-medium text-adikom-500 hover:underline"
                >
                  {row.label}
                </Link>
                <p className="truncate text-xs text-muted tabular">{row.vehicleNo}</p>
              </div>
              <Badge tone={row.origin === 'SUPPLIED' ? 'info' : 'neutral'}>
                {ORIGIN_LABELS[row.origin]}
              </Badge>
            </div>

            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted">Coût d’acquisition</dt>
                <dd>
                  <CostCell row={row} on={on} />
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted">Tarif client standard</dt>
                <dd className="tabular text-muted">
                  {row.standardPrice
                    ? formatRate(row.standardPrice.amount, row.standardPrice.unit)
                    : canPricingView
                      ? 'Aucun tarif applicable'
                      : 'Non accessible'}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted">Commission</dt>
                <dd>
                  <CommissionAmount
                    clientPrice={row.standardPrice}
                    cost={row.cost}
                    canSeeCost
                    canSeeClientPrice={readable(row)}
                    supplied={row.origin === 'SUPPLIED'}
                  />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Le coût, ou la raison de son absence.
 *
 * TROIS ABSENCES DIFFÉRENTES, TROIS MESSAGES DIFFÉRENTS — les confondre sous un
 * tiret ferait passer une décision manquante pour une saisie oubliée.
 */
function CostCell({ row, on }: { row: AcquisitionVehicleRow; on: string }) {
  if (row.origin !== 'SUPPLIED') {
    return (
      <span className="text-xs text-muted">
        Sans objet — véhicule non fourni par un fournisseur
      </span>
    )
  }

  if (!row.cost) {
    return (
      <span className="text-xs text-muted">Aucun coût renseigné au {formatDate(on)}</span>
    )
  }

  return (
    <span className="font-medium tabular text-ink">
      {formatRate(row.cost.amount, row.cost.unit)}
    </span>
  )
}
