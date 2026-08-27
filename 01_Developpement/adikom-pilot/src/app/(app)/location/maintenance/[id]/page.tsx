import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Badge, Card, Empty, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import {
  getMaintenanceDetail,
  isCancellable,
  isCompletable,
  NEXT_STATUSES,
  ORIGIN_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/maintenance/data'
import {
  CancelMaintenancePanel,
  CompleteMaintenancePanel,
  ImmobilizePanel,
  MaintenanceStatusPanel,
} from '@/features/maintenance/maintenance-panels'

export const metadata: Metadata = { title: 'Maintenance' }

export default async function MaintenanceDetailPage(
  props: PageProps<'/location/maintenance/[id]'>
) {
  await requirePermissionOrRedirect(PERMISSIONS.MAINTENANCE_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const maintenance = await getMaintenanceDetail(id)
  if (!maintenance) notFound()

  const justCreated = searchParams.cree === '1'

  const [canUpdate, canValidate, canClose, canReadIncidents, canReadRentals, canReadSuppliers] =
    await Promise.all([
      can(PERMISSIONS.MAINTENANCE_UPDATE),
      can(PERMISSIONS.MAINTENANCE_VALIDATE),
      can(PERMISSIONS.MAINTENANCE_CLOSE),
      can(PERMISSIONS.INCIDENTS_VIEW),
      can(PERMISSIONS.RENTALS_VIEW),
      can(PERMISSIONS.SUPPLIERS_VIEW),
    ])

  const immobilizing = maintenance.immobilizationFrom !== null
  const open = isCancellable(maintenance.status)
  // Le passage `Brouillon → Planifiée` relève de `validate` ; les autres
  // avancements de `update`. Le panneau n'apparaît que si l'un des deux permet
  // au moins un pas.
  const reachable = NEXT_STATUSES[maintenance.status]
  const canAdvance =
    reachable.length > 0 && (maintenance.status === 'DRAFT' ? canValidate || canUpdate : canUpdate)

  return (
    <>
      <PageHeader
        title={maintenance.reason}
        description={`${maintenance.maintenanceNo} · ${maintenance.vehicleLabel}`}
        actions={
          <Link
            href="/location/maintenance"
            className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Toutes les maintenances
          </Link>
        }
      />

      {justCreated && (
        <Notice tone="success" className="mb-5">
          La maintenance <strong>{maintenance.maintenanceNo}</strong> a été enregistrée.
          {immobilizing
            ? ' Le véhicule est immobilisé sur la période demandée.'
            : ' Elle n’immobilise pas le véhicule : le calendrier est inchangé.'}
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Intervention">
            <dl>
              <InfoRow label="Référence">
                <span className="tabular">{maintenance.maintenanceNo}</span>
              </InfoRow>
              <InfoRow label="Véhicule">{maintenance.vehicleLabel}</InfoRow>
              <InfoRow label="Origine">{ORIGIN_LABELS[maintenance.origin]}</InfoRow>
              <InfoRow
                label="Priorité"
                hint="Oriente le traitement. N’immobilise rien et ne déclenche aucune alerte."
              >
                <Badge tone={PRIORITY_TONES[maintenance.priority]}>
                  {PRIORITY_LABELS[maintenance.priority]}
                </Badge>
              </InfoRow>
              <InfoRow label="État">
                <Badge tone={STATUS_TONES[maintenance.status]}>
                  {STATUS_LABELS[maintenance.status]}
                </Badge>
              </InfoRow>
              <InfoRow label="Motif">{maintenance.reason}</InfoRow>
              <InfoRow label="Description">{maintenance.description ?? <Empty />}</InfoRow>
              <InfoRow label="Date prévue">
                {maintenance.plannedAt ? formatDateTime(maintenance.plannedAt) : <Empty />}
              </InfoRow>
              <InfoRow label="Intervention réalisée">
                {maintenance.intervention ?? <Empty />}
              </InfoRow>
              <InfoRow label="Observations">{maintenance.observations ?? <Empty />}</InfoRow>
              <InfoRow label="Terminée le">
                {maintenance.completedAt ? formatDateTime(maintenance.completedAt) : <Empty />}
              </InfoRow>
              <InfoRow label="Motif du dernier changement d’état">
                {maintenance.statusReason ?? <Empty />}
              </InfoRow>
            </dl>
          </Card>

          <Card
            title="Immobilisation"
            description="Seule une période bloquée au calendrier rend le véhicule indisponible."
          >
            <dl>
              <InfoRow label="Le véhicule est-il immobilisé ?">
                {immobilizing ? (
                  <span className="text-ink">Oui, sur la période ci-dessous</span>
                ) : (
                  <span className="text-muted">
                    Non — cette maintenance ne bloque aucune période
                  </span>
                )}
              </InfoRow>
              <InfoRow label="Du">
                {maintenance.immobilizationFrom ? (
                  formatDateTime(maintenance.immobilizationFrom)
                ) : (
                  <Empty />
                )}
              </InfoRow>
              <InfoRow label="Au">
                {maintenance.immobilizationTo ? (
                  formatDateTime(maintenance.immobilizationTo)
                ) : (
                  <Empty />
                )}
              </InfoRow>
            </dl>

            {maintenance.status === 'COMPLETED' && immobilizing && (
              <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
                La période reste inscrite au calendrier mais ne bloque plus rien : elle est
                libérée, non effacée, afin que l’historique des immobilisations demeure lisible.
              </p>
            )}
          </Card>

          <Card title="Rattachements" description="Tous facultatifs.">
            <dl>
              <InfoRow label="Incident d’origine">
                {maintenance.incidentId === null ? (
                  <span className="text-muted">Aucun</span>
                ) : canReadIncidents && maintenance.incidentNo ? (
                  <Link
                    href={`/location/incidents/${maintenance.incidentId}`}
                    className="text-adikom-500 hover:underline tabular"
                  >
                    {maintenance.incidentNo}
                  </Link>
                ) : (
                  /*
                   * DEC-017 : rattaché, mais illisible pour ce compte. Le DIRE
                   * plutôt qu'afficher « Aucun », qui serait une affirmation
                   * fausse tirée d'un refus de droit.
                   */
                  <span className="text-muted">
                    Rattachée à un incident que votre compte ne peut pas consulter
                  </span>
                )}
              </InfoRow>

              <InfoRow label="Location concernée">
                {maintenance.rentalId === null ? (
                  <span className="text-muted">Aucune</span>
                ) : canReadRentals && maintenance.rentalNo ? (
                  <Link
                    href={`/location/locations/${maintenance.rentalId}`}
                    className="text-adikom-500 hover:underline tabular"
                  >
                    {maintenance.rentalNo}
                  </Link>
                ) : (
                  <span className="text-muted">
                    Rattachée à une location que votre compte ne peut pas consulter
                  </span>
                )}
              </InfoRow>

              <InfoRow
                label="Prestataire"
                hint="Distinct du fournisseur du véhicule, même s’il s’agit de la même entité."
              >
                {maintenance.providerSupplierId === null ? (
                  <span className="text-muted">Non désigné</span>
                ) : canReadSuppliers && maintenance.providerLabel ? (
                  <Link
                    href={`/tiers/fournisseurs/${maintenance.providerSupplierId}`}
                    className="text-adikom-500 hover:underline"
                  >
                    {maintenance.providerLabel}
                  </Link>
                ) : (
                  <span className="text-muted">
                    Confiée à un prestataire que votre compte ne peut pas consulter
                  </span>
                )}
              </InfoRow>

              <InfoRow label="Maintenance précédente">
                {maintenance.previousMaintenanceId && maintenance.previousMaintenanceNo ? (
                  <Link
                    href={`/location/maintenance/${maintenance.previousMaintenanceId}`}
                    className="text-adikom-500 hover:underline tabular"
                  >
                    {maintenance.previousMaintenanceNo}
                  </Link>
                ) : (
                  <span className="text-muted">Aucune</span>
                )}
              </InfoRow>

              <InfoRow label="Déclarée le">{formatDateTime(maintenance.createdAt)}</InfoRow>
            </dl>
          </Card>
        </div>

        <div className="space-y-5">
          {canAdvance && (
            <Card
              title="Faire avancer l’intervention"
              description="Terminer et annuler disposent de leur propre écran."
            >
              <MaintenanceStatusPanel
                maintenanceId={maintenance.id}
                status={maintenance.status}
              />
            </Card>
          )}

          {canUpdate && open && !immobilizing && (
            <Card
              title="Immobiliser le véhicule"
              description="Possible dès que le calendrier le permet — par exemple au retour d’une location."
            >
              <ImmobilizePanel maintenanceId={maintenance.id} />
            </Card>
          )}

          {canClose && isCompletable(maintenance.status) && (
            <Card
              title="Terminer après contrôle"
              description="L’intervention est faite et le contrôle est satisfaisant."
            >
              <CompleteMaintenancePanel
                maintenanceId={maintenance.id}
                immobilizing={immobilizing}
              />
            </Card>
          )}

          {canUpdate && open && (
            <Card title="Annuler" description="Tant que l’intervention n’est pas terminée.">
              <CancelMaintenancePanel maintenanceId={maintenance.id} />
            </Card>
          )}

          <Card title="Étape suivante">
            <p className="text-sm text-muted">
              {maintenance.status === 'COMPLETED'
                ? 'Cette intervention est terminée. Son coût et son éventuelle imputation à un fournisseur relèvent d’un lot ultérieur.'
                : 'Aucun coût n’est saisi à ce stade : les montants, devis et justificatifs relèvent d’un lot ultérieur.'}
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
