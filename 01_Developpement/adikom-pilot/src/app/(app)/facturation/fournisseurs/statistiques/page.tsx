import type { Metadata } from 'next'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Denied, Kpi, LoadError } from '@/components/ui/figure'
import { Notice } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatAmount } from '@/lib/money'
import { pick } from '@/lib/pilotage/figure'
import { loadBillingTabs, loadSupplierStatistics } from '@/features/billing-analytics/data'
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

export const metadata: Metadata = { title: 'Statistiques — Factures fournisseurs' }

export const dynamic = 'force-dynamic'

const kmf = (value: number) => formatAmount(value, { withCurrency: true })
const BASE = '/facturation/fournisseurs/statistiques'

/**
 * Statistiques des factures fournisseurs — Module 07 §58, §59.
 *
 * « Total facturé, total imputé, total payé, dettes restantes, factures en
 * retard. »
 *
 * TROIS FLUX, CHACUN DATÉ DE SON PROPRE ACTE.
 *
 * Le facturé au jour de la facture, l'imputé au jour où l'imputation est portée
 * sur elle, le payé au jour du règlement. Leur différence sur une période n'est
 * donc PAS une dette : une imputation d'octobre peut réduire une facture de
 * juillet. La dette est la situation, calculée hors période.
 *
 * UNE IMPUTATION N'EST PAS UN PAIEMENT — ET NE PEUT PAS ÊTRE IGNORÉE.
 *
 * CLAUDE.md §16 et §57. Sans `billing.imputations.view`, le net vaudrait le brut
 * et l'écran réclamerait 1 000 000 KMF là où ADIKOM en doit 700 000. La fonction
 * refuse plutôt que de répondre à côté, et l'écran nomme ce qui manque.
 */
export default async function SupplierStatisticsPage(
  props: PageProps<'/facturation/fournisseurs/statistiques'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.SUPPLIER_STATS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : undefined

  const period = resolveAnalyticsPeriod(read('periode'), read('du'), read('au'))
  const [tabs, { stats, series }] = await Promise.all([
    loadBillingTabs('fournisseurs', period),
    loadSupplierStatistics(period),
  ])

  return (
    <>
      <PageHeader
        title="Statistiques — Factures fournisseurs"
        description="Ce qu’ADIKOM a reçu, ce qu’elle a imputé, ce qu’elle a réglé, et ce qu’elle doit encore."
      />

      {/* Un seul onglet ne se dessine pas : il n'y a rien entre quoi choisir. */}
      {tabs.length > 1 && (
        <Tabs items={tabs} current="statistiques" label="Sous-menus des factures fournisseurs" />
      )}

      <PeriodNotice period={period} />
      <PeriodPicker basePath={BASE} period={period} />

      {stats.state === 'denied' && (
        <Notice tone="warning" className="mb-5">
          Ces statistiques supposent de lire les factures fournisseurs, les{' '}
          <strong>imputations</strong> et les règlements. Une imputation n’est pas un paiement,
          mais elle réduit bien la dette : l’ignorer ferait annoncer un montant dû supérieur au
          réel.
        </Notice>
      )}

      {/* --- Les flux de la période — §58 ------------------------------------ */}
      <section aria-labelledby="flux" className="mb-6">
        <h2 id="flux" className="mb-3 font-display text-sm font-semibold text-ink">
          Activité {describeAnalyticsPeriod(period)}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi
            label="Total facturé"
            figure={pick(stats, (s) => s.grossAmount)}
            format={kmf}
            hint={
              stats.state === 'ok'
                ? `${stats.value.invoiceCount} facture(s) validée(s) sur la période.`
                : undefined
            }
            href={`/facturation/fournisseurs?du=${period.from}&au=${period.to}&statut=VALIDATED`}
          />
          <Kpi
            label="Total imputé"
            figure={pick(stats, (s) => s.imputedAmount)}
            format={kmf}
            hint={
              stats.state === 'ok'
                ? `${stats.value.imputationCount} imputation(s) portée(s) sur une facture.`
                : undefined
            }
            href="/facturation/imputations?statut=IMPUTED"
          />
          <Kpi
            label="Total réglé"
            figure={pick(stats, (s) => s.paidAmount)}
            format={kmf}
            hint={
              stats.state === 'ok'
                ? `${stats.value.paymentCount} règlement(s), à leur date réelle.`
                : undefined
            }
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Trois flux distincts, chacun daté de son propre acte : une imputation d’octobre peut
          réduire une facture de juillet. « Facturé − imputé − payé » sur la période n’est donc
          pas une dette.
        </p>
      </section>

      {/* --- La dette, hors période — §57, §58 ------------------------------- */}
      <section aria-labelledby="dettes" className="mb-6">
        <h2 id="dettes" className="mb-3 font-display text-sm font-semibold text-ink">
          Dettes fournisseurs — toutes périodes
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Reste à payer"
            figure={pick(stats, (s) => s.payableAmount)}
            format={kmf}
            hint={
              stats.state === 'ok'
                ? `${stats.value.payableCount} facture(s) validée(s), imputations déduites.`
                : undefined
            }
            href="/facturation/fournisseurs?impayees=1"
          />
          <Kpi
            label="Dont échu"
            figure={pick(stats, (s) => s.payableOverdueAmount)}
            format={kmf}
            hint={
              stats.state === 'ok'
                ? `${stats.value.payableOverdueCount} facture(s) dont l’échéance est dépassée.`
                : undefined
            }
            href="/facturation/fournisseurs?statut=OVERDUE"
            level="important"
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Brut − imputé = net à payer ; net − payé = reste dû. Seules les factures validées
          portent une dette.
        </p>
      </section>

      {/* --- Série — §59 ----------------------------------------------------- */}
      <section aria-labelledby="serie">
        <h2 id="serie" className="mb-3 font-display text-sm font-semibold text-ink">
          Facturé, imputé et réglé, {GRAIN_LABELS[period.grain]}
        </h2>
        <Card>
          {series.state === 'denied' && <Denied missing={series.missing} />}
          {series.state === 'error' && <LoadError what="La série" />}
          {series.state === 'ok' && (
            <Series
              grainLabel={GRAIN_LABELS[period.grain]}
              legend={[
                { label: 'Facturé', tone: 'primary' },
                { label: 'Imputé', tone: 'warning' },
                { label: 'Réglé', tone: 'success' },
              ]}
              emptyLabel="Aucune facture validée, aucune imputation ni aucun règlement sur cette période."
              entries={series.value.map((point) =>
                toSeriesEntry(point.bucket, period.grain, [
                  { label: 'Facturé', amount: point.gross, tone: 'primary' },
                  { label: 'Imputé', amount: point.imputed, tone: 'warning' },
                  { label: 'Réglé', amount: point.paid, tone: 'success' },
                ])
              )}
            />
          )}
        </Card>
      </section>
    </>
  )
}
