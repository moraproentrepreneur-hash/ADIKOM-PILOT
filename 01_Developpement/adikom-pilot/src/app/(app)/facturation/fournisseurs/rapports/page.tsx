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
import { loadBillingTabs, loadSupplierReport } from '@/features/billing-analytics/data'
import type { SupplierReportRow } from '@/features/billing-analytics/data'
import { PeriodNotice, PeriodPicker } from '@/features/billing-analytics/controls'
import {
  describeAnalyticsPeriod,
  resolveAnalyticsPeriod,
} from '@/features/billing-analytics/period'

export const metadata: Metadata = { title: 'Rapports — Factures fournisseurs' }

export const dynamic = 'force-dynamic'

const kmf = (value: number) => formatAmount(value, { withCurrency: true })
const BASE = '/facturation/fournisseurs/rapports'

/**
 * Rapports de facturation fournisseur — Module 07 §60.
 *
 * « État des factures fournisseurs, état des dettes, état des règlements, état
 * des imputations. » Quatre états, une ligne par fournisseur : la chaîne
 * complète se lit d'un coup d'œil —
 *
 *   brut − imputé = net à payer      (CLAUDE.md §16)
 *   net  − payé   = reste dû         (Workflow 08 §21)
 *
 * L'ÉTAT DES PAIEMENTS DIVERS N'Y FIGURE PAS.
 *
 * Le module n'est pas livré : sa navigation reste marquée « à venir ». Une
 * colonne vide se lirait « aucun paiement divers », ce qui serait faux dès le
 * jour où il en existera.
 */
export default async function SupplierReportsPage(
  props: PageProps<'/facturation/fournisseurs/rapports'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.SUPPLIER_REPORTS_VIEW)

  const searchParams = await props.searchParams
  const read = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : undefined

  const period = resolveAnalyticsPeriod(read('periode'), read('du'), read('au'))
  const [tabs, report] = await Promise.all([
    loadBillingTabs('fournisseurs', period),
    loadSupplierReport(period),
  ])

  return (
    <>
      <PageHeader
        title="Rapports — Factures fournisseurs"
        description="État des factures, des imputations, des règlements et des dettes, fournisseur par fournisseur."
      />

      {/* Un seul onglet ne se dessine pas : il n'y a rien entre quoi choisir. */}
      {tabs.length > 1 && (
        <Tabs items={tabs} current="rapports" label="Sous-menus des factures fournisseurs" />
      )}

      <PeriodNotice period={period} />
      <PeriodPicker basePath={BASE} period={period} />

      {report.state === 'denied' && (
        <Notice tone="warning" className="mb-5">
          Cet état suppose de lire les factures fournisseurs, les <strong>imputations</strong> et
          les règlements. Une imputation réduit la dette sans être un paiement : l’ignorer ferait
          annoncer un reste dû supérieur au réel.
        </Notice>
      )}

      <Card className="overflow-hidden">
        {report.state === 'denied' && <Denied missing={report.missing} />}
        {report.state === 'error' && <LoadError what="L’état par fournisseur" />}
        {report.state === 'ok' &&
          (report.value.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="Aucune facture ni dette"
              description={`Aucune facture validée ${describeAnalyticsPeriod(period)}, et aucune dette en cours.`}
            />
          ) : (
            <ReportTable rows={report.value} period={describeAnalyticsPeriod(period)} />
          ))}
      </Card>
    </>
  )
}

/* -------------------------------------------------------------------------- */

function ReportTable({ rows, period }: { rows: SupplierReportRow[]; period: string }) {
  const totals = rows.reduce(
    (acc, row) => ({
      invoiceCount: acc.invoiceCount + row.invoiceCount,
      gross: acc.gross + row.gross,
      imputed: acc.imputed + row.imputed,
      paid: acc.paid + row.paid,
      payable: acc.payable + row.payable,
      overdue: acc.overdue + row.overdue,
    }),
    { invoiceCount: 0, gross: 0, imputed: 0, paid: 0, payable: 0, overdue: 0 }
  )

  return (
    <>
      <div className="-mx-5 -my-4 hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <caption className="sr-only">
            État des factures, imputations, règlements et dettes par fournisseur, {period}
          </caption>
          <thead>
            <tr className="border-b border-line bg-adikom-50 text-left">
              <th className="px-5 py-3 font-medium text-ink">Fournisseur</th>
              <th className="px-5 py-3 text-right font-medium text-ink">Factures</th>
              <th className="px-5 py-3 text-right font-medium text-ink">Brut</th>
              <th className="px-5 py-3 text-right font-medium text-ink">Imputé</th>
              <th className="px-5 py-3 text-right font-medium text-ink">Réglé</th>
              <th className="px-5 py-3 text-right font-medium text-ink">Reste dû</th>
              <th className="px-5 py-3 text-right font-medium text-ink">dont échu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.supplierId}
                data-report-row={row.supplierId}
                className="border-b border-line transition-colors last:border-b-0 hover:bg-adikom-50/60"
              >
                <td className="px-5 py-3">
                  {row.label ? (
                    <Link
                      href={`/tiers/fournisseurs/${row.supplierId}`}
                      className="font-medium text-adikom-500 hover:underline"
                    >
                      {row.label}
                    </Link>
                  ) : (
                    <span className="text-xs italic text-muted">Fournisseur non lisible</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right text-muted tabular">{row.invoiceCount}</td>
                <td className="px-5 py-3 text-right text-muted tabular">{kmf(row.gross)}</td>
                <td className="px-5 py-3 text-right text-muted tabular">
                  {row.imputed > 0 ? `− ${kmf(row.imputed)}` : kmf(0)}
                </td>
                <td className="px-5 py-3 text-right text-muted tabular">{kmf(row.paid)}</td>
                <td className="px-5 py-3 text-right font-medium text-ink tabular">
                  {kmf(row.payable)}
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
              <td className="px-5 py-3">Total — {rows.length} fournisseur(s)</td>
              <td className="px-5 py-3 text-right tabular">{totals.invoiceCount}</td>
              <td className="px-5 py-3 text-right tabular" data-total="brut">
                {kmf(totals.gross)}
              </td>
              <td className="px-5 py-3 text-right tabular" data-total="impute">
                {totals.imputed > 0 ? `− ${kmf(totals.imputed)}` : kmf(0)}
              </td>
              <td className="px-5 py-3 text-right tabular" data-total="regle">
                {kmf(totals.paid)}
              </td>
              <td className="px-5 py-3 text-right tabular" data-total="reste">
                {kmf(totals.payable)}
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
            key={row.supplierId}
            data-report-row={row.supplierId}
            className="rounded-control border border-line p-4"
          >
            <p className="font-medium text-ink">
              {row.label ?? (
                <span className="text-xs italic text-muted">Fournisseur non lisible</span>
              )}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">Brut</dt>
                <dd className="text-ink tabular">{kmf(row.gross)}</dd>
              </div>
              <div>
                <dt className="text-muted">Imputé</dt>
                <dd className="text-ink tabular">{kmf(row.imputed)}</dd>
              </div>
              <div>
                <dt className="text-muted">Réglé</dt>
                <dd className="text-ink tabular">{kmf(row.paid)}</dd>
              </div>
              <div>
                <dt className="text-muted">Reste dû</dt>
                <dd className="font-medium text-ink tabular">{kmf(row.payable)}</dd>
              </div>
            </dl>
          </li>
        ))}
        <li className="rounded-control border border-line bg-canvas p-4 text-sm">
          <p className="font-medium text-ink">Total — {rows.length} fournisseur(s)</p>
          <p className="mt-1 text-xs text-muted tabular">
            Brut {kmf(totals.gross)} · Imputé {kmf(totals.imputed)} · Réglé {kmf(totals.paid)} ·
            Reste dû {kmf(totals.payable)}
          </p>
        </li>
      </ul>
    </>
  )
}
