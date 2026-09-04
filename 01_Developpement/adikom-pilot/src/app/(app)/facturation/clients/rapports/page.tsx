import type { Metadata } from 'next'
import Link from 'next/link'
import { FileBarChart } from 'lucide-react'

import { Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Denied, LoadError } from '@/components/ui/figure'
import { Notice } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatAmount } from '@/lib/money'
import { loadBillingTabs, loadCustomerReport } from '@/features/billing-analytics/data'
import type { CustomerReportRow } from '@/features/billing-analytics/data'
import { PeriodNotice, PeriodPicker } from '@/features/billing-analytics/controls'
import {
  describeAnalyticsPeriod,
  resolveAnalyticsPeriod,
} from '@/features/billing-analytics/period'

export const metadata: Metadata = { title: 'Rapports — Factures clients' }

export const dynamic = 'force-dynamic'

const kmf = (value: number) => formatAmount(value, { withCurrency: true })
const BASE = '/facturation/clients/rapports'

/**
 * Rapports de facturation client — Module 07 §27.
 *
 * « Chiffre d'affaires facturé, encaissements, créances, impayés, factures par
 * période, factures par client. » Un seul état les porte tous : une ligne par
 * client, une colonne par question.
 *
 * L'ÉTAT N'EST PAS TRONQUÉ.
 *
 * Ce sont des agrégats, bornés par le répertoire des clients — pas des lignes de
 * détail. Une liste coupée à 200 lignes produirait un état dont les lignes ne
 * font pas le total affiché en bas (DEC-032 §b).
 *
 * DEUX COLONNES DE PÉRIODE, DEUX COLONNES DE SITUATION.
 *
 * « Facturé » et « Encaissé » portent sur la période. « Reste dû » et « dont
 * échu » portent sur tout l'historique : un client sans activité récente mais
 * débiteur figure donc dans l'état — l'omettre ferait disparaître une dette
 * parce qu'elle est ancienne.
 *
 * AUCUN DOCUMENT N'EST PRODUIT.
 *
 * Ni tableur, ni PDF, ni impression : aucune capacité du catalogue ne les
 * couvre, et en créer une d'office est interdit (DEC-024). Le point est signalé
 * au journal des décisions, il n'est pas tranché ici.
 */
export default async function CustomerReportsPage(
  props: PageProps<'/facturation/clients/rapports'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.CUSTOMER_REPORTS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : undefined

  const period = resolveAnalyticsPeriod(read('periode'), read('du'), read('au'))
  const [tabs, report] = await Promise.all([
    loadBillingTabs('clients', period),
    loadCustomerReport(period),
  ])

  return (
    <>
      <PageHeader
        title="Rapports — Factures clients"
        description="État des factures, des encaissements et des créances, client par client."
      />

      {/* Un seul onglet ne se dessine pas : il n'y a rien entre quoi choisir. */}
      {tabs.length > 1 && (
        <Tabs items={tabs} current="rapports" label="Sous-menus des factures clients" />
      )}

      <PeriodNotice period={period} />
      <PeriodPicker basePath={BASE} period={period} />

      {report.state === 'denied' && (
        <Notice tone="warning" className="mb-5">
          Cet état suppose de lire les factures clients <strong>et</strong> leurs règlements.
          Sans les seconds, aucune créance ne serait soldée et l’état les afficherait toutes
          comme impayées.
        </Notice>
      )}

      <Card className="overflow-hidden">
        {report.state === 'denied' && <Denied missing={report.missing} />}
        {report.state === 'error' && <LoadError what="L’état par client" />}
        {report.state === 'ok' &&
          (report.value.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="Aucune facture ni créance"
              description={`Aucune facture émise ${describeAnalyticsPeriod(period)}, et aucune créance en cours.`}
            />
          ) : (
            <ReportTable rows={report.value} period={describeAnalyticsPeriod(period)} />
          ))}
      </Card>
    </>
  )
}

/* -------------------------------------------------------------------------- */

function ReportTable({ rows, period }: { rows: CustomerReportRow[]; period: string }) {
  const totals = rows.reduce(
    (acc, row) => ({
      invoiceCount: acc.invoiceCount + row.invoiceCount,
      invoiced: acc.invoiced + row.invoiced,
      collected: acc.collected + row.collected,
      outstanding: acc.outstanding + row.outstanding,
      overdue: acc.overdue + row.overdue,
    }),
    { invoiceCount: 0, invoiced: 0, collected: 0, outstanding: 0, overdue: 0 }
  )

  return (
    <>
      <div className="-mx-5 -my-4 hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <caption className="sr-only">
            État des factures et créances par client, {period}
          </caption>
          <thead>
            <tr className="border-b border-line bg-adikom-50 text-left">
              <th className="px-5 py-3 font-medium text-ink">Client</th>
              <th className="px-5 py-3 text-right font-medium text-ink">Factures</th>
              <th className="px-5 py-3 text-right font-medium text-ink">Facturé</th>
              <th className="px-5 py-3 text-right font-medium text-ink">Encaissé</th>
              <th className="px-5 py-3 text-right font-medium text-ink">Reste dû</th>
              <th className="px-5 py-3 text-right font-medium text-ink">dont échu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.clientId}
                data-report-row={row.clientId}
                className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
              >
                <td className="px-5 py-3">
                  {row.label ? (
                    <Link
                      href={`/tiers/clients/${row.clientId}`}
                      className="font-medium text-adikom-500 hover:underline"
                    >
                      {row.label}
                    </Link>
                  ) : (
                    <span className="text-xs italic text-muted">Client non lisible</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right text-muted tabular">{row.invoiceCount}</td>
                <td className="px-5 py-3 text-right text-muted tabular">{kmf(row.invoiced)}</td>
                <td className="px-5 py-3 text-right text-muted tabular">{kmf(row.collected)}</td>
                <td className="px-5 py-3 text-right font-medium text-ink tabular">
                  {kmf(row.outstanding)}
                </td>
                <td
                  className={`px-5 py-3 text-right tabular ${row.overdue > 0 ? 'text-danger' : 'text-muted'}`}
                >
                  {kmf(row.overdue)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-canvas font-medium text-ink">
              <td className="px-5 py-3">Total — {rows.length} client(s)</td>
              <td className="px-5 py-3 text-right tabular">{totals.invoiceCount}</td>
              <td className="px-5 py-3 text-right tabular" data-total="facture">
                {kmf(totals.invoiced)}
              </td>
              <td className="px-5 py-3 text-right tabular" data-total="encaisse">
                {kmf(totals.collected)}
              </td>
              <td className="px-5 py-3 text-right tabular" data-total="reste">
                {kmf(totals.outstanding)}
              </td>
              <td className="px-5 py-3 text-right tabular" data-total="echu">
                {kmf(totals.overdue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <li
            key={row.clientId}
            data-report-row={row.clientId}
            className="rounded-control border border-line p-4"
          >
            <p className="font-medium text-ink">
              {row.label ?? <span className="text-xs italic text-muted">Client non lisible</span>}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">Facturé</dt>
                <dd className="text-ink tabular">{kmf(row.invoiced)}</dd>
              </div>
              <div>
                <dt className="text-muted">Encaissé</dt>
                <dd className="text-ink tabular">{kmf(row.collected)}</dd>
              </div>
              <div>
                <dt className="text-muted">Reste dû</dt>
                <dd className="font-medium text-ink tabular">{kmf(row.outstanding)}</dd>
              </div>
              <div>
                <dt className="text-muted">dont échu</dt>
                <dd className={row.overdue > 0 ? 'text-danger tabular' : 'text-ink tabular'}>
                  {kmf(row.overdue)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
        <li className="rounded-control border border-line bg-canvas p-4 text-sm">
          <p className="font-medium text-ink">Total — {rows.length} client(s)</p>
          <p className="mt-1 text-xs text-muted tabular">
            Facturé {kmf(totals.invoiced)} · Encaissé {kmf(totals.collected)} · Reste dû{' '}
            {kmf(totals.outstanding)}
          </p>
        </li>
      </ul>
    </>
  )
}
