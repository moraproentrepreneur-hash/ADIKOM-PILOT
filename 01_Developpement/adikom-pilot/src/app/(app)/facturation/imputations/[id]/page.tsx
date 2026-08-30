import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Paperclip } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import { DOCUMENT_TYPE_LABELS } from '@/features/maintenance/costs-constants'
import {
  getImputableBudget,
  getImputationDetail,
  listImputationDocuments,
  listImputationSupplierOptions,
} from '@/features/imputations/data'
import {
  formatAmount,
  IMPUTATION_STATUS_EFFECT,
  IMPUTATION_STATUS_LABELS,
  IMPUTATION_STATUS_TONES,
  isAwaitingInvoice,
  isCancellable,
  isEditable,
} from '@/features/imputations/constants'
import {
  ArchiveImputationDocumentButton,
  CancelImputationPanel,
  EditImputationPanel,
  ImputationDocumentPanel,
  SubmitImputationPanel,
  ValidateImputationPanel,
} from '@/features/imputations/panels'

export const metadata: Metadata = { title: 'Imputation' }

/**
 * Fiche d'une imputation fournisseur.
 *
 * Réalise Workflow 06 §34 : « L'utilisateur doit pouvoir accéder directement à
 * la maintenance depuis l'imputation. » La chaîne affichée est celle du §39 —
 * Imputation → Maintenance → Véhicule → Fournisseur.
 *
 * CHAQUE MAILLON RESPECTE SA PROPRE RLS.
 *
 * Le numéro de maintenance et le nom du fournisseur viennent de ressources
 * embarquées : sans `rental.maintenance.view` ou `parties.suppliers.view`,
 * l'écran DIT qu'il ne peut pas les montrer, il n'affiche pas un tiret
 * (DEC-017, DEC-024).
 */
export default async function ImputationDetailPage(
  props: PageProps<'/facturation/imputations/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.IMPUTATIONS_VIEW)

  const { id } = await props.params

  const imputation = await getImputationDetail(id)
  if (!imputation) notFound()

  const [canUpdate, canValidate, canCancel, canSeeCosts] = await Promise.all([
    can(PERMISSIONS.IMPUTATIONS_UPDATE),
    can(PERMISSIONS.IMPUTATIONS_VALIDATE),
    can(PERMISSIONS.IMPUTATIONS_CANCEL),
    // Le plafond vit dans `maintenance_costs` : sans cette capacité, il n'est
    // pas lisible — et l'écran le dit plutôt que d'afficher « 0 KMF ».
    can(PERMISSIONS.MAINTENANCE_COST_VIEW),
  ])

  const [budget, documents, suppliers] = await Promise.all([
    getImputableBudget(imputation.maintenanceId, { canSeeCosts }),
    listImputationDocuments(id),
    isEditable(imputation.status)
      ? listImputationSupplierOptions(imputation.maintenanceId)
      : Promise.resolve(null),
  ])

  const editable = isEditable(imputation.status)
  const awaiting = isAwaitingInvoice(imputation.status, imputation.supplierInvoiceId)

  return (
    <>
      <PageHeader
        title={formatAmount(imputation.amount) ?? '—'}
        description={`${imputation.imputationNo} · ${imputation.supplierLabel ?? 'Fournisseur non communiqué'}`}
        actions={
          <Link
            href="/facturation/imputations"
            className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Toutes les imputations
          </Link>
        }
      />

      {awaiting && (
        <Notice tone="warning" className="mb-5">
          Cette imputation est <strong>validée et en attente de facture fournisseur</strong>. Elle
          ne réduit <strong>aucun montant dû</strong> et ne constitue pas un paiement. Le
          rattachement à une facture relève d’une étape ultérieure.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Imputation">
            <dl>
              <InfoRow label="Référence">
                <span className="tabular">{imputation.imputationNo}</span>
              </InfoRow>

              <InfoRow label="Montant imputé" hint="Montant effectivement imputé (§37).">
                <span className="font-medium tabular">{formatAmount(imputation.amount)}</span>
              </InfoRow>

              <InfoRow label="État">
                <Badge tone={IMPUTATION_STATUS_TONES[imputation.status]}>
                  {IMPUTATION_STATUS_LABELS[imputation.status]}
                </Badge>
              </InfoRow>

              <InfoRow label="Effet financier" hint="DEC-013 : seule « Imputée » réduit un montant dû.">
                {IMPUTATION_STATUS_EFFECT[imputation.status]}
              </InfoRow>

              <InfoRow label="Justification" hint="Pourquoi ce montant est déduit (§11).">
                {imputation.justification}
              </InfoRow>

              <InfoRow label="Motif du dernier changement">
                {imputation.statusReason ?? <Empty />}
              </InfoRow>
            </dl>
          </Card>

          <Card
            title="Chaîne de traçabilité"
            description="Imputation → Maintenance → Véhicule → Fournisseur (§34, §39)."
          >
            <dl>
              <InfoRow label="Maintenance">
                {imputation.maintenanceNo ? (
                  <Link
                    href={`/location/maintenance/${imputation.maintenanceId}?onglet=imputations`}
                    className="text-adikom-500 hover:underline tabular"
                  >
                    {imputation.maintenanceNo}
                  </Link>
                ) : (
                  <span className="text-muted">
                    Votre compte ne peut pas consulter les maintenances.
                  </span>
                )}
              </InfoRow>

              <InfoRow label="Véhicule">
                {imputation.vehicleLabel ?? (
                  <span className="text-muted">
                    Votre compte ne peut pas consulter le parc automobile.
                  </span>
                )}
              </InfoRow>

              <InfoRow label="Fournisseur">
                {imputation.supplierLabel ? (
                  <Link
                    href={`/tiers/fournisseurs/${imputation.supplierId}?onglet=imputations`}
                    className="text-adikom-500 hover:underline"
                  >
                    {imputation.supplierLabel}
                  </Link>
                ) : (
                  <span className="text-muted">
                    Votre compte ne peut pas consulter les fournisseurs.
                  </span>
                )}
              </InfoRow>

              <InfoRow
                label="Montant imputable de la maintenance"
                hint="Plafond arrêté par la maintenance, consommé par ses imputations."
              >
                {!canSeeCosts ? (
                  <span className="text-muted">
                    Votre compte ne peut pas consulter les coûts de maintenance.
                  </span>
                ) : budget.ceiling === null ? (
                  <span className="text-muted">Non arrêté</span>
                ) : (
                  <span className="tabular">
                    {formatAmount(budget.ceiling)} · {formatAmount(budget.used)} imputés ·{' '}
                    {formatAmount(budget.remaining)} disponibles
                  </span>
                )}
              </InfoRow>

              <InfoRow label="Facture fournisseur">
                <span className="text-muted">
                  Aucune — la facturation fournisseur relève d’une étape ultérieure.
                </span>
              </InfoRow>
            </dl>
          </Card>

          <Card title="Justificatifs" description="Pièces qui fondent la déduction (§35).">
            {documents.length === 0 ? (
              <EmptyState
                icon={Paperclip}
                title="Aucun justificatif"
                description="Facture du garage, reçu, devis, bon de réparation ou document contractuel."
              />
            ) : (
              <ul className="divide-y divide-line">
                {documents.map((document) => (
                  <li key={document.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/api/imputations/documents/${document.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-adikom-500 hover:underline"
                      >
                        {document.label}
                      </a>
                      <p className="truncate text-xs text-muted">
                        {DOCUMENT_TYPE_LABELS[document.docType]} · {document.fileName}
                      </p>
                    </div>
                    {canUpdate && editable && (
                      <ArchiveImputationDocumentButton
                        imputationId={id}
                        documentId={document.id}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Historique">
            <dl>
              <InfoRow label="Préparée le">{formatDateTime(imputation.createdAt)}</InfoRow>
              <InfoRow label="Validée le">
                {imputation.validatedAt ? formatDateTime(imputation.validatedAt) : <Empty />}
              </InfoRow>
              <InfoRow label="Annulée le">
                {imputation.cancelledAt ? formatDateTime(imputation.cancelledAt) : <Empty />}
              </InfoRow>
              <InfoRow label="Imputée le">
                {imputation.imputedAt ? formatDateTime(imputation.imputedAt) : <Empty />}
              </InfoRow>
            </dl>
            <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
              Qui a créé, qui a validé, qui a annulé : le journal d’audit conserve l’avant, l’après
              et l’auteur de chaque écriture (§48, §50).
            </p>
          </Card>

          {canUpdate && imputation.status === 'DRAFT' && (
            <Card title="Modifier" description="Tant que l’imputation n’est pas validée (§38).">
              <EditImputationPanel
                imputationId={id}
                amount={imputation.amount}
                justification={imputation.justification}
                suppliers={suppliers}
                currentSupplierId={imputation.supplierId}
              />
            </Card>
          )}

          {canUpdate && imputation.status === 'DRAFT' && (
            <Card title="Soumettre à validation">
              <SubmitImputationPanel imputationId={id} />
            </Card>
          )}

          {canUpdate && editable && (
            <Card title="Joindre un justificatif">
              <ImputationDocumentPanel imputationId={id} />
            </Card>
          )}

          {canValidate && imputation.status === 'TO_VALIDATE' && (
            <Card
              title="Valider"
              description="Contrôler et approuver la déduction (§16)."
            >
              <ValidateImputationPanel imputationId={id} />
            </Card>
          )}

          {canCancel && isCancellable(imputation.status) && (
            <Card title="Annuler" description="L’historique est conservé (§40).">
              <CancelImputationPanel imputationId={id} />
            </Card>
          )}

          <Card title="Étape suivante">
            <p className="text-sm text-muted">
              {imputation.status === 'CANCELLED'
                ? 'Cette imputation est annulée : le montant imputable qu’elle consommait est redevenu disponible.'
                : awaiting
                  ? 'Cette imputation attend une facture fournisseur. Son rattachement, et l’effet sur le montant dû, relèvent de la facturation fournisseur.'
                  : 'Une fois validée, l’imputation restera en attente de facture fournisseur. Aucun montant dû n’est réduit avant ce rattachement.'}
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
