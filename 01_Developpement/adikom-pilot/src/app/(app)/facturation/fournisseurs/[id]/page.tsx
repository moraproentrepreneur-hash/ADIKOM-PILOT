import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BarChart3, Receipt } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/dates'
import { listVehicles } from '@/features/fleet/data'
import { listInvoiceImputations } from '@/features/imputations/data'
import {
  IMPUTATION_STATUS_LABELS,
  IMPUTATION_STATUS_TONES,
} from '@/features/imputations/constants'
import {
  getSupplierInvoiceDetail,
  listSupplierInvoiceLines,
} from '@/features/supplier-invoices/data'
import {
  acceptsImputations,
  displayStatus,
  formatAmount,
  isCancellable,
  isEditable,
  SUPPLIER_INVOICE_STATUS_EFFECT,
  SUPPLIER_INVOICE_STATUS_LABELS,
  SUPPLIER_INVOICE_STATUS_TONES,
} from '@/features/supplier-invoices/constants'
import {
  AddInvoiceLinePanel,
  ArchiveInvoiceLineButton,
  CancelSupplierInvoicePanel,
  DetachImputationPanel,
  EditSupplierInvoicePanel,
  SubmitSupplierInvoicePanel,
  ValidateSupplierInvoicePanel,
} from '@/features/supplier-invoices/panels'

export const metadata: Metadata = { title: 'Facture fournisseur' }

/**
 * Fiche d'une facture fournisseur — Étape 2.5, LOT 5.
 *
 * ELLE RÉPOND À LA QUESTION DE MODULE 07 §39.
 *
 * « Pourquoi 300 000 KMF ont-ils été déduits de cette facture fournisseur ? »
 * Chaque imputation portée par la facture est listée, avec son montant, sa
 * maintenance et son numéro : la réponse est retrouvable ici.
 *
 * CE QUE CET ÉCRAN REFUSE D'AFFICHER.
 *
 * Un montant payé et un solde. Ils supposent des RÈGLEMENTS, qui relèvent d'une
 * étape ultérieure : afficher « 0 KMF payé » laisserait croire que le système
 * l'a vérifié. Il dit donc ce qu'il ne sait pas.
 */
export default async function SupplierInvoiceDetailPage(
  props: PageProps<'/facturation/fournisseurs/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.SUPPLIER_INVOICES_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams
  const justCreated = searchParams.cree === '1'

  const [canUpdate, canValidate, canCancel, canSeeImputations, canDetach, canSeeFleet] =
    await Promise.all([
      can(PERMISSIONS.SUPPLIER_INVOICES_UPDATE),
      can(PERMISSIONS.SUPPLIER_INVOICES_VALIDATE),
      can(PERMISSIONS.SUPPLIER_INVOICES_CANCEL),
      can(PERMISSIONS.IMPUTATIONS_VIEW),
      can(PERMISSIONS.IMPUTATIONS_UPDATE),
      can(PERMISSIONS.FLEET_VIEW),
    ])

  const invoice = await getSupplierInvoiceDetail(id, { canSeeImputations })
  if (!invoice) notFound()

  const editable = isEditable(invoice.status)

  const [lines, imputations, vehicles] = await Promise.all([
    listSupplierInvoiceLines(id),
    // Sans la capacité, la section DISPARAÎT : une liste vide se lirait
    // « aucune déduction », affirmation qu'un refus de lecture ne permet pas
    // (DEC-017).
    canSeeImputations ? listInvoiceImputations(id) : Promise.resolve(null),
    editable && canSeeFleet ? listVehicles() : Promise.resolve(null),
  ])

  const shown = displayStatus(invoice.status, invoice.dueDate, invoice.netPayable)

  return (
    <>
      <Link
        href="/facturation/fournisseurs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux factures
      </Link>

      {justCreated && (
        <Notice tone="success" className="mb-5">
          Facture enregistrée sous le numéro <strong>{invoice.invoiceNo}</strong>. Ajoutez ses
          lignes : leur somme fera le montant brut.
        </Notice>
      )}

      <PageHeader
        title={formatAmount(invoice.grossAmount) ?? '—'}
        description={`${invoice.invoiceNo} · ${invoice.supplierLabel ?? 'Fournisseur non communiqué'}`}
        actions={
          <Badge tone={SUPPLIER_INVOICE_STATUS_TONES[shown]}>
            {SUPPLIER_INVOICE_STATUS_LABELS[shown]}
          </Badge>
        }
      />

      {shown === 'OVERDUE' && (
        <Notice tone="warning" className="mb-5">
          L’échéance de cette facture est <strong>dépassée</strong> et son net à payer n’est pas
          soldé. Aucun règlement n’étant géré, ce constat repose sur l’échéance seule.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="Montants"
            description="Brut, imputé et net à payer restent séparés (Module 07 §57)."
          >
            <dl>
              <InfoRow label="Montant brut" hint="Somme des lignes de la facture.">
                <span className="font-medium tabular">{formatAmount(invoice.grossAmount)}</span>
              </InfoRow>

              <InfoRow
                label="Total imputé"
                hint="Imputations « Imputée » rattachées à cette facture (DEC-013)."
              >
                {invoice.imputedAmount === null ? (
                  <span className="text-muted">
                    Votre compte ne peut pas consulter les imputations.
                  </span>
                ) : (
                  <span className="tabular">{formatAmount(invoice.imputedAmount)}</span>
                )}
              </InfoRow>

              <InfoRow label="Net à payer" hint="Montant brut moins les imputations.">
                {invoice.netPayable === null ? (
                  <span className="text-muted">
                    Non calculable sans le droit de consulter les imputations.
                  </span>
                ) : (
                  <span className="font-medium tabular">{formatAmount(invoice.netPayable)}</span>
                )}
              </InfoRow>

              <InfoRow label="Montant payé et solde">
                <span className="text-muted">
                  Aucun règlement n’est géré : ces montants relèvent d’une étape ultérieure. Ils ne
                  sont pas nuls, ils sont inconnus du système.
                </span>
              </InfoRow>

              <InfoRow label="Effet">{SUPPLIER_INVOICE_STATUS_EFFECT[shown]}</InfoRow>
            </dl>
          </Card>

          <Card
            title="Lignes"
            description="Leur somme fait le montant brut (Règles finance §8)."
          >
            {lines.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="Aucune ligne"
                description="Une facture sans ligne ne peut pas être validée : son montant brut serait nul."
              />
            ) : (
              <ul className="divide-y divide-line">
                {lines.map((line) => (
                  <li key={line.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{line.label}</p>
                      <p className="text-xs text-muted">
                        {line.vehicleId === null
                          ? 'Aucun véhicule désigné'
                          : (line.vehicleLabel ??
                            'Véhicule non lisible avec vos droits')}
                      </p>
                    </div>
                    <span className="font-medium text-ink tabular">
                      {formatAmount(line.amount)}
                    </span>
                    {canUpdate && editable && (
                      <ArchiveInvoiceLineButton invoiceId={id} lineId={line.id} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canSeeImputations ? (
            <Card
              title="Imputations portées par cette facture"
              description="Pourquoi le montant dû a été réduit (Module 07 §39)."
            >
              {imputations === null || imputations.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Aucune imputation"
                  description={
                    acceptsImputations(invoice.status)
                      ? 'Une imputation se rattache depuis sa propre fiche, une fois validée.'
                      : 'Seule une facture validée peut recevoir une imputation (Workflow 06 §32).'
                  }
                />
              ) : (
                <ul className="divide-y divide-line">
                  {imputations.map((imputation) => (
                    <li key={imputation.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/facturation/imputations/${imputation.id}`}
                            className="font-medium text-adikom-500 hover:underline tabular"
                          >
                            {imputation.imputationNo}
                          </Link>
                          <p className="text-xs text-muted">
                            {imputation.maintenanceNo ?? 'Maintenance non communiquée'}
                            {imputation.vehicleLabel ? ` · ${imputation.vehicleLabel}` : ''}
                          </p>
                          <p className="mt-1 text-xs text-muted">{imputation.justification}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="font-medium tabular">
                            − {formatAmount(imputation.amount)}
                          </span>
                          <Badge tone={IMPUTATION_STATUS_TONES[imputation.status]}>
                            {IMPUTATION_STATUS_LABELS[imputation.status]}
                          </Badge>
                        </div>
                      </div>

                      {canDetach && imputation.status === 'IMPUTED' && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                            Détacher cette imputation
                          </summary>
                          <div className="mt-3 rounded-control border border-line p-4">
                            <DetachImputationPanel
                              imputationId={imputation.id}
                              invoiceId={id}
                            />
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : (
            <Notice tone="warning">
              Votre compte ne peut pas consulter les imputations : cette facture peut en porter
              sans que cet écran puisse les montrer.
            </Notice>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Facture">
            <dl>
              <InfoRow label="Numéro ADIKOM">
                <span className="tabular">{invoice.invoiceNo}</span>
              </InfoRow>
              <InfoRow label="Référence du fournisseur" hint="Numéro porté par le document reçu (§30).">
                {invoice.externalRef ?? <Empty />}
              </InfoRow>
              <InfoRow label="Fournisseur">
                {invoice.supplierLabel ? (
                  <Link
                    href={`/tiers/fournisseurs/${invoice.supplierId}?onglet=factures`}
                    className="text-adikom-500 hover:underline"
                  >
                    {invoice.supplierLabel}
                  </Link>
                ) : (
                  <span className="text-muted">
                    Votre compte ne peut pas consulter les fournisseurs.
                  </span>
                )}
              </InfoRow>
              <InfoRow label="Date">{formatDate(invoice.invoiceDate)}</InfoRow>
              <InfoRow label="Échéance">{formatDate(invoice.dueDate) ?? <Empty />}</InfoRow>
              <InfoRow label="Observations">{invoice.notes ?? <Empty />}</InfoRow>
              <InfoRow label="Motif du dernier changement">
                {invoice.statusReason ?? <Empty />}
              </InfoRow>
            </dl>
          </Card>

          <Card title="Historique">
            <dl>
              <InfoRow label="Enregistrée le">{formatDateTime(invoice.createdAt)}</InfoRow>
              <InfoRow label="Validée le">
                {invoice.validatedAt ? formatDateTime(invoice.validatedAt) : <Empty />}
              </InfoRow>
              <InfoRow label="Annulée le">
                {invoice.cancelledAt ? formatDateTime(invoice.cancelledAt) : <Empty />}
              </InfoRow>
            </dl>
            <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
              Qui a enregistré, qui a validé, qui a annulé : le journal d’audit conserve l’avant,
              l’après et l’auteur de chaque écriture.
            </p>
          </Card>

          {canUpdate && editable && (
            <Card title="Ajouter une ligne" description="La somme des lignes fait le montant brut.">
              <AddInvoiceLinePanel
                invoiceId={id}
                vehicles={
                  vehicles === null
                    ? null
                    : vehicles.map((vehicle) => ({
                        id: vehicle.id,
                        label: `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''}`,
                      }))
                }
              />
            </Card>
          )}

          {canUpdate && editable && (
            <Card title="Modifier" description="Tant que la facture n’est pas validée.">
              <EditSupplierInvoicePanel
                invoiceId={id}
                invoiceDate={invoice.invoiceDate}
                dueDate={invoice.dueDate}
                externalRef={invoice.externalRef}
                notes={invoice.notes}
              />
            </Card>
          )}

          {canUpdate && invoice.status === 'DRAFT' && (
            <Card title="Soumettre au contrôle">
              <SubmitSupplierInvoicePanel invoiceId={id} />
            </Card>
          )}

          {canValidate && invoice.status === 'PENDING' && (
            <Card title="Valider" description="Reconnaître la dette (Module 07 §31).">
              <ValidateSupplierInvoicePanel invoiceId={id} />
            </Card>
          )}

          {canCancel && isCancellable(invoice.status) && (
            <Card title="Annuler" description="L’historique est conservé.">
              <CancelSupplierInvoicePanel invoiceId={id} />
            </Card>
          )}

          <Card title="Étape suivante">
            <p className="text-sm text-muted">
              {invoice.status === 'CANCELLED'
                ? 'Cette facture est annulée : elle ne peut plus recevoir d’imputation.'
                : acceptsImputations(invoice.status)
                  ? 'Cette facture peut recevoir des imputations validées du même fournisseur. Son règlement relève d’une étape ultérieure.'
                  : 'Une fois validée, la facture pourra recevoir les imputations validées de ce fournisseur.'}
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
