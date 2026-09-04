import type { Metadata } from 'next'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Denied, Kpi, LoadError } from '@/components/ui/figure'
import { Notice } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatAmount } from '@/lib/money'
import { pick } from '@/lib/pilotage/figure'
import { loadBillingTabs, loadCustomerStatistics } from '@/features/billing-analytics/data'
import {
  PeriodNotice,
  PeriodPicker,
  Series,
  toSeriesEntry,
} from '@/features/billing-analytics/controls'
import {
  GRAIN_LABELS,
  describeAnalyticsPeriod,
  resolveAnalyticsPeriod,
} from '@/features/billing-analytics/period'

export const metadata: Metadata = { title: 'Statistiques — Factures clients' }

/*
 * Une statistique est un instantané, jamais une page mise en cache : deux
 * consultations à dix minutes d'intervalle ne doivent pas montrer le même
 * encaissé si un règlement a été enregistré entre les deux.
 */
export const dynamic = 'force-dynamic'

const kmf = (value: number) => formatAmount(value, { withCurrency: true })
const BASE = '/facturation/clients/statistiques'

/**
 * Statistiques des factures clients — Module 07 §26, §58.
 *
 * « Total facturé, total encaissé, total restant, factures payées, impayées, en
 * retard, paiements par période. »
 *
 * DEUX NATURES DE CHIFFRES, ET L'ÉCRAN LES SÉPARE.
 *
 * Le FACTURÉ et l'ENCAISSÉ sont des flux : ils appartiennent à la période
 * choisie, chacun daté de son propre acte. Un encaissement de septembre peut
 * solder une facture de juillet — les retrancher l'un de l'autre ne donnerait
 * donc AUCUN solde.
 *
 * Les CRÉANCES sont une situation : ce qu'un client doit encore, il le doit
 * quelle que soit la fenêtre affichée. Elles ignorent la période, et le disent.
 *
 * AUCUN CHIFFRE N'EST CALCULÉ ICI (Module 07 §26 — « à partir des données
 * réelles »). Tout vient des fonctions de la migration 057, qui appellent
 * elles-mêmes celles de la facture.
 */
export default async function CustomerStatisticsPage(
  props: PageProps<'/facturation/clients/statistiques'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.CUSTOMER_STATS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : undefined

  const period = resolveAnalyticsPeriod(read('periode'), read('du'), read('au'))
  const [tabs, { stats, series }] = await Promise.all([
    loadBillingTabs('clients', period),
    loadCustomerStatistics(period),
  ])

  return (
    <>
      <PageHeader
        title="Statistiques — Factures clients"
        description="Ce qui a été facturé, ce qui a été encaissé, et ce qui reste dû."
      />

      {/* Un seul onglet ne se dessine pas : il n'y a rien entre quoi choisir. */}
      {tabs.length > 1 && (
        <Tabs items={tabs} current="statistiques" label="Sous-menus des factures clients" />
      )}

      <PeriodNotice period={period} />
      <PeriodPicker basePath={BASE} period={period} />

      {stats.state === 'denied' && (
        <Notice tone="warning" className="mb-5">
          Ces statistiques supposent de lire les factures clients <strong>et</strong> leurs
          règlements. Sans les seconds, l’encaissé vaudrait zéro et toute facture se lirait
          impayée : l’écran refuse de l’écrire.
        </Notice>
      )}

      {/* --- Les flux de la période — §26 ----------------------------------- */}
      <section aria-labelledby="flux" className="mb-6">
        <h2 id="flux" className="mb-3 font-display text-sm font-semibold text-ink">
          Activité {describeAnalyticsPeriod(period)}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Total facturé"
            figure={pick(stats, (s) => s.invoicedAmount)}
            format={kmf}
            hint={
              stats.state === 'ok'
                ? `${stats.value.issuedCount} facture(s) émise(s) sur la période.`
                : undefined
            }
            href={`/facturation/clients?du=${period.from}&au=${period.to}&statut=ISSUED`}
          />
          <Kpi
            label="Total encaissé"
            figure={pick(stats, (s) => s.collectedAmount)}
            format={kmf}
            hint={
              stats.state === 'ok'
                ? `${stats.value.collectedCount} règlement(s) reçu(s), à leur date réelle.`
                : undefined
            }
          />
          <Kpi
            label="Factures soldées"
            figure={pick(stats, (s) => s.settledCount)}
            hint="Parmi les factures émises sur la période."
          />
          <Kpi
            label="Factures non soldées"
            figure={pick(stats, (s) => s.unsettledCount)}
            hint={
              stats.state === 'ok'
                ? `dont ${stats.value.periodOverdueCount} dépassant leur échéance.`
                : undefined
            }
            level="watch"
          />
        </div>
      </section>

      {/* --- La situation, hors période — §26, §58 -------------------------- */}
      <section aria-labelledby="creances" className="mb-6">
        <h2 id="creances" className="mb-3 font-display text-sm font-semibold text-ink">
          Créances — toutes périodes
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Total restant dû"
            figure={pick(stats, (s) => s.outstandingAmount)}
            format={kmf}
            hint={
              stats.state === 'ok'
                ? `${stats.value.outstandingCount} facture(s) non soldée(s).`
                : undefined
            }
            href="/facturation/clients?impayees=1"
          />
          <Kpi
            label="Dont échu"
            figure={pick(stats, (s) => s.outstandingOverdueAmount)}
            format={kmf}
            hint={
              stats.state === 'ok'
                ? `${stats.value.outstandingOverdueCount} facture(s) dont l’échéance est dépassée.`
                : undefined
            }
            href="/facturation/clients?statut=OVERDUE"
            level="urgent"
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Une créance ne se borne pas à une période : ce qu’un client doit encore, il le doit
          quelle que soit la fenêtre affichée. « Facturé − encaissé » sur la période n’est donc
          pas un solde.
        </p>
      </section>

      {/* --- Paiements par période — §26, §59 -------------------------------- */}
      <section aria-labelledby="serie">
        <h2 id="serie" className="mb-3 font-display text-sm font-semibold text-ink">
          Facturé et encaissé, {GRAIN_LABELS[period.grain]}
        </h2>
        <Card>
          {series.state === 'denied' && <Denied missing={series.missing} />}
          {series.state === 'error' && <LoadError what="La série" />}
          {series.state === 'ok' && (
            <Series
              grainLabel={GRAIN_LABELS[period.grain]}
              legend={[
                { label: 'Facturé', tone: 'primary' },
                { label: 'Encaissé', tone: 'success' },
              ]}
              emptyLabel="Aucune facture émise ni aucun règlement reçu sur cette période."
              entries={series.value.map((point) =>
                toSeriesEntry(point.bucket, period.grain, [
                  { label: 'Facturé', amount: point.invoiced, tone: 'primary' },
                  { label: 'Encaissé', amount: point.collected, tone: 'success' },
                ])
              )}
            />
          )}
        </Card>
      </section>
    </>
  )
}
