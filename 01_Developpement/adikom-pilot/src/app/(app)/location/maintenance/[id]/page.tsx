import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, Paperclip } from 'lucide-react'

import { Badge, Card, Empty, EmptyState, InfoRow, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Tabs, type TabItem } from '@/components/ui/tabs'
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
import {
  costVariance,
  getMaintenanceFinancials,
  linesTotal,
  nonImputableAmount,
} from '@/features/maintenance/costs-data'
import {
  COST_LINE_KIND_LABELS,
  DOCUMENT_TYPE_LABELS,
  formatAmount,
  formatVariance,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONES,
} from '@/features/maintenance/costs-constants'
import {
  CostLinePanel,
  CostsPanel,
  DocumentPanel,
  QuoteDecisionPanel,
  QuotePanel,
} from '@/features/maintenance/costs-panels'
import { listProviderOptions } from '@/features/maintenance/data'
import {
  getImputableBudget,
  listImputationSupplierOptions,
  listMaintenanceImputations,
} from '@/features/imputations/data'
import {
  IMPUTATION_STATUS_EFFECT,
  IMPUTATION_STATUS_LABELS,
  IMPUTATION_STATUS_TONES,
} from '@/features/imputations/constants'
import { CreateImputationPanel } from '@/features/imputations/panels'

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
  const requestedTab = typeof searchParams.onglet === 'string' ? searchParams.onglet : 'intervention'

  const [
    canUpdate,
    canValidate,
    canClose,
    canReadIncidents,
    canReadRentals,
    canReadSuppliers,
    canSeeCosts,
    canEditCosts,
    canSeeImputations,
    canCreateImputation,
  ] = await Promise.all([
    can(PERMISSIONS.MAINTENANCE_UPDATE),
    can(PERMISSIONS.MAINTENANCE_VALIDATE),
    can(PERMISSIONS.MAINTENANCE_CLOSE),
    can(PERMISSIONS.INCIDENTS_VIEW),
    can(PERMISSIONS.RENTALS_VIEW),
    can(PERMISSIONS.SUPPLIERS_VIEW),
    // DEC-024, arbitrage L1 : consulter un coût et le saisir sont deux
    // capacités. DEC-017 : sans la première, l'onglet DISPARAÎT — l'afficher
    // vide affirmerait que l'intervention n'a rien coûté.
    can(PERMISSIONS.MAINTENANCE_COST_VIEW),
    can(PERMISSIONS.MAINTENANCE_COST_UPDATE),
    // LOT 4 : imputer relève du domaine `billing`, jamais d'une capacité de
    // maintenance. Même règle DEC-017 : sans le droit de voir, l'onglet
    // disparaît — il ne s'affiche pas vide.
    can(PERMISSIONS.IMPUTATIONS_VIEW),
    can(PERMISSIONS.IMPUTATIONS_CREATE),
  ])

  const tabs: TabItem[] = [
    { key: 'intervention', label: 'Intervention', href: `/location/maintenance/${id}` },
    ...(canSeeCosts
      ? [{ key: 'couts', label: 'Coûts', href: `/location/maintenance/${id}?onglet=couts` }]
      : []),
    ...(canSeeImputations
      ? [
          {
            key: 'imputations',
            label: 'Imputations',
            href: `/location/maintenance/${id}?onglet=imputations`,
          },
        ]
      : []),
  ]

  const tab = tabs.some((item) => item.key === requestedTab && item.href)
    ? requestedTab
    : 'intervention'

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

      {tabs.length > 1 && <Tabs items={tabs} current={tab} />}

      {tab === 'imputations' ? (
        <ImputationsTab
          maintenanceId={id}
          maintenanceCancelled={maintenance.status === 'CANCELLED'}
          canCreate={canCreateImputation}
          canSeeCosts={canSeeCosts}
        />
      ) : tab === 'couts' ? (
        <CostsTab
          maintenanceId={id}
          locked={maintenance.status === 'COMPLETED' || maintenance.status === 'CANCELLED'}
          canEditCosts={canEditCosts}
          canValidate={canValidate}
          canReadSuppliers={canReadSuppliers}
        />
      ) : (
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
                ? 'Cette intervention est terminée : ses données financières sont verrouillées. Une imputation reste possible tant que le montant imputable n’est pas épuisé.'
                : canSeeCosts
                  ? 'Les montants, devis et justificatifs se saisissent dans l’onglet Coûts. Aucune imputation n’en découle : elle se décide séparément.'
                  : canSeeImputations
                    ? 'Les imputations à un fournisseur se préparent dans l’onglet Imputations.'
                    : 'L’imputation d’un coût à un fournisseur relève d’une capacité distincte.'}
            </p>
          </Card>
        </div>
      </div>
      )}
    </>
  )
}

/**
 * Le dossier financier d'une intervention.
 *
 * N'EST RENDU QU'AVEC `rental.maintenance.cost.view`.
 *
 * L'onglet lui-même n'existe pas sans ce droit : afficher un dossier vide, ou
 * pire « 0 KMF », affirmerait que l'intervention n'a rien coûté alors qu'on
 * refuse seulement d'en montrer le prix (DEC-017).
 *
 * TOUT CE QUI EST DÉRIVÉ EST CALCULÉ ICI, JAMAIS STOCKÉ.
 *
 * L'écart (§35), le montant non imputable (§7) et la somme des lignes sont des
 * soustractions et une addition refaites à chaque lecture. Les figer en base
 * créerait des valeurs capables de contredire celles dont elles découlent.
 */
async function CostsTab({
  maintenanceId,
  locked,
  canEditCosts,
  canValidate,
  canReadSuppliers,
}: {
  maintenanceId: string
  locked: boolean
  canEditCosts: boolean
  canValidate: boolean
  canReadSuppliers: boolean
}) {
  const [financials, providers] = await Promise.all([
    getMaintenanceFinancials(maintenanceId),
    canReadSuppliers ? listProviderOptions() : Promise.resolve(null),
  ])

  const { costs, lines, quotes, documents } = financials
  const variance = costVariance(costs)
  const nonImputable = nonImputableAmount(costs)
  const total = linesTotal(lines)
  const editable = canEditCosts && !locked

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {locked && (
          <Notice tone="warning">
            Cette maintenance est <strong>terminée ou annulée</strong> : ses données financières
            sont verrouillées. Aucune correction n’est possible depuis cet écran.
          </Notice>
        )}

        <Card
          title="Montants"
          description="Aucun de ces montants n’est déduit d’un autre : aucune règle ne les relie."
        >
          <dl>
            <InfoRow label="Coût estimé" hint="Avant intervention (§33).">
              {/*
                « Pas encore chiffré » n'est pas « gratuit » : un tiret dit
                l'absence de saisie là où un 0 KMF affirmerait une gratuité.
              */}
              {formatAmount(costs?.estimatedCost ?? null) ?? (
                <span className="text-muted">Pas encore chiffré</span>
              )}
            </InfoRow>

            <InfoRow label="Coût réel" hint="Après intervention (§34). L’estimation est conservée.">
              {formatAmount(costs?.actualCost ?? null) ?? (
                <span className="text-muted">Pas encore chiffré</span>
              )}
            </InfoRow>

            <InfoRow
              label="Écart"
              hint="Réel − estimé (§35). Indicateur de pilotage, calculé à la lecture."
            >
              {formatVariance(variance) ?? (
                <span className="text-muted">Indéterminable — un des deux montants manque</span>
              )}
            </InfoRow>

            <InfoRow
              label="Montant imputable"
              hint="Plafond imputable à un fournisseur. N’impute rien et ne réduit aucun solde."
            >
              {formatAmount(costs?.imputableAmount ?? null) ?? (
                <span className="text-muted">Non arrêté</span>
              )}
            </InfoRow>

            <InfoRow label="Montant non imputable" hint="Coût réel − imputable (Workflow 06 §7).">
              {formatAmount(nonImputable) ?? (
                <span className="text-muted">Indéterminable</span>
              )}
            </InfoRow>

            <InfoRow label="Observations">{costs?.notes ?? <Empty />}</InfoRow>
          </dl>

          <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
            Ces montants ne produisent <strong>aucune imputation</strong>, aucune facture, aucun
            paiement et aucun effet sur un solde. L’imputation à un fournisseur relève d’un lot
            ultérieur, et n’aura d’effet qu’une fois rattachée à une facture fournisseur.
          </p>
        </Card>

        <Card
          title="Ventilation"
          description="Pièces, main-d’œuvre et autres frais. Facultative."
        >
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Aucune ligne de coût n’a été saisie.
            </p>
          ) : (
            <>
              <div className="-mx-5 -my-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-adikom-50 text-left">
                      <th className="px-5 py-3 font-medium text-ink">Nature</th>
                      <th className="px-5 py-3 font-medium text-ink">Libellé</th>
                      <th className="px-5 py-3 font-medium text-ink">Quantité</th>
                      <th className="px-5 py-3 font-medium text-ink">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} className="border-b border-line last:border-b-0">
                        <td className="px-5 py-3 text-muted">
                          {COST_LINE_KIND_LABELS[line.kind]}
                        </td>
                        <td className="px-5 py-3 text-ink">{line.label}</td>
                        <td className="px-5 py-3 text-muted tabular">
                          {line.quantity ?? '—'}
                          {line.unitAmount !== null && (
                            <span className="block text-xs">
                              × {formatAmount(line.unitAmount)}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-ink tabular">{formatAmount(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 border-t border-line pt-4 text-sm">
                <p className="text-ink">
                  Somme des lignes : <strong className="tabular">{formatAmount(total)}</strong>
                </p>
                {/*
                  La ventilation étant facultative, sa somme ne remplace pas le
                  coût réel. Quand les deux divergent, l'écran le DIT et laisse
                  l'arbitrage à l'utilisateur — il ne corrige rien tout seul.
                */}
                {costs?.actualCost != null && costs.actualCost !== total && (
                  <p className="mt-1 text-xs text-warning">
                    Le coût réel enregistré est {formatAmount(costs.actualCost)}. La ventilation
                    est facultative : cet écart n’est pas corrigé automatiquement.
                  </p>
                )}
              </div>
            </>
          )}
        </Card>

        <Card title="Devis" description="Offres reçues pour cette intervention (§26).">
          {quotes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucun devis enregistré.</p>
          ) : (
            <ul className="space-y-3">
              {quotes.map((quote) => (
                <li key={quote.id} className="rounded-control border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink tabular">{formatAmount(quote.amount)}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {quote.providerLabel ??
                          (canReadSuppliers
                            ? 'Prestataire non désigné'
                            : 'Prestataire que votre compte ne peut pas consulter')}
                        {quote.quotedOn ? ` · ${quote.quotedOn}` : ''}
                      </p>
                      {quote.description && (
                        <p className="mt-1 text-sm text-muted">{quote.description}</p>
                      )}
                    </div>
                    <Badge tone={QUOTE_STATUS_TONES[quote.status]}>
                      {QUOTE_STATUS_LABELS[quote.status]}
                    </Badge>
                  </div>

                  {quote.decidedAt && (
                    <p className="mt-2 text-xs text-muted">
                      Décidé le {formatDateTime(quote.decidedAt)}
                      {quote.decisionReason ? ` — ${quote.decisionReason}` : ''}
                    </p>
                  )}

                  {/*
                    Décider engage l'intervention : `maintenance.validate`, et
                    non la capacité de saisie (arbitrage L2).
                  */}
                  {canValidate && !locked && quote.status === 'PROPOSED' && (
                    <QuoteDecisionPanel quoteId={quote.id} maintenanceId={maintenanceId} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Justificatifs" description="Devis, factures, reçus, bons de réparation (§37).">
          {documents.length === 0 ? (
            <EmptyState
              icon={Paperclip}
              title="Aucun justificatif"
              description="Aucune pièce n’a été jointe à ce dossier."
            />
          ) : (
            <ul className="space-y-2">
              {documents.map((document) => (
                <li key={document.id}>
                  {/*
                    Le chemin de stockage n'est jamais exposé : cette route
                    vérifie `cost.view` puis délivre une URL signée d'une
                    minute (DEC-025 §f).
                  */}
                  <a
                    href={`/api/maintenance/documents/${document.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-control border border-line px-3 py-2 text-sm text-adikom-500 transition-colors hover:border-adikom-300"
                  >
                    <FileText className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate">{document.label}</span>
                      <span className="block truncate text-xs text-muted">
                        {DOCUMENT_TYPE_LABELS[document.docType]} · {document.fileName}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        {editable ? (
          <>
            <Card title="Saisir les montants">
              <CostsPanel maintenanceId={maintenanceId} costs={costs} />
            </Card>

            <Card title="Ajouter une ligne de coût">
              <CostLinePanel maintenanceId={maintenanceId} />
            </Card>

            <Card title="Enregistrer un devis">
              <QuotePanel maintenanceId={maintenanceId} providers={providers} />
            </Card>

            <Card title="Joindre un justificatif">
              <DocumentPanel
                maintenanceId={maintenanceId}
                quotes={quotes.map((quote) => ({
                  id: quote.id,
                  label: `${formatAmount(quote.amount)} — ${QUOTE_STATUS_LABELS[quote.status]}`,
                }))}
              />
            </Card>
          </>
        ) : (
          <Card title="Saisie">
            <p className="text-sm text-muted">
              {locked
                ? 'Les données financières sont verrouillées : cette maintenance est terminée ou annulée.'
                : 'Votre compte peut consulter ces montants, mais pas les saisir.'}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}

/**
 * Les imputations issues de cette dépense — Étape 2.4, LOT 4.
 *
 * N'EST RENDU QU'AVEC `billing.imputations.view`.
 *
 * IMPUTER N'EST PAS UNE CAPACITÉ DE MAINTENANCE.
 *
 * Workflow 06 §2 : la maintenance constate et chiffre, l'imputation décide de
 * la part déduite. Deux actes, deux domaines de capacités — `rental.maintenance.*`
 * ne donne aucun droit ici, et réciproquement (DEC-024).
 *
 * LE PLAFOND EST AFFICHÉ, JAMAIS SUPPOSÉ.
 *
 * Il vit dans `maintenance_costs`, dont la lecture exige
 * `rental.maintenance.cost.view`. Sans cette capacité, l'écran dit qu'il ne
 * peut pas le montrer — il n'affiche ni « 0 KMF », ni un reste imputable
 * inventé (DEC-017).
 */
async function ImputationsTab({
  maintenanceId,
  maintenanceCancelled,
  canCreate,
  canSeeCosts,
}: {
  maintenanceId: string
  maintenanceCancelled: boolean
  canCreate: boolean
  canSeeCosts: boolean
}) {
  const [imputations, budget, suppliers] = await Promise.all([
    listMaintenanceImputations(maintenanceId),
    getImputableBudget(maintenanceId, { canSeeCosts }),
    canCreate ? listImputationSupplierOptions(maintenanceId) : Promise.resolve(null),
  ])

  // §10 : un montant imputable nul signifie « charge supportée par ADIKOM ».
  // Ce n'est pas la même chose qu'un plafond non arrêté.
  const zeroCeiling = budget.ceiling === 0
  const noCeiling = canSeeCosts && budget.ceiling === null

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Notice tone="warning">
          Une imputation <strong>n’est pas un paiement</strong> et ne réduit un montant dû qu’une
          fois rattachée à une facture fournisseur. La facturation fournisseur relève d’une étape
          ultérieure : les imputations validées restent <strong>en attente de facture</strong>.
        </Notice>

        <Card
          title="Montant imputable"
          description="Le plafond arrêté par la maintenance, et ce que les imputations en ont consommé."
        >
          <dl>
            <InfoRow label="Plafond imputable" hint="Arrêté dans l’onglet Coûts (Workflow 06 §7).">
              {!canSeeCosts ? (
                <span className="text-muted">
                  Votre compte ne peut pas consulter les coûts de maintenance.
                </span>
              ) : budget.ceiling === null ? (
                <span className="text-muted">Non arrêté</span>
              ) : (
                <span className="tabular">{formatAmount(budget.ceiling)}</span>
              )}
            </InfoRow>

            <InfoRow label="Déjà imputé" hint="Somme des imputations non annulées (§40).">
              <span className="tabular">{formatAmount(budget.used)}</span>
            </InfoRow>

            <InfoRow
              label="Reste imputable"
              hint="Plafond − déjà imputé. Contrôlé côté serveur (Module 07 §41)."
            >
              {budget.remaining === null ? (
                <span className="text-muted">
                  {canSeeCosts ? 'Indéterminable — aucun plafond arrêté' : 'Non communiqué'}
                </span>
              ) : (
                <span className="tabular">{formatAmount(budget.remaining)}</span>
              )}
            </InfoRow>
          </dl>

          {zeroCeiling && (
            <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
              Le montant imputable est <strong>nul</strong> : la dépense reste à la charge d’ADIKOM
              (Workflow 06 §10). Aucune imputation fournisseur n’est possible.
            </p>
          )}

          {noCeiling && (
            <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
              Aucun montant imputable n’a encore été arrêté. Il doit l’être dans l’onglet
              <strong> Coûts</strong> avant qu’une imputation puisse être préparée.
            </p>
          )}
        </Card>

        <Card title="Imputations" description="Chaque imputation reste identifiable (§22).">
          {imputations.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Aucune imputation"
              description="Cette dépense n’a été imputée à aucun fournisseur : elle reste à la charge d’ADIKOM."
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
                        {imputation.supplierLabel ?? 'Fournisseur non communiqué'} ·{' '}
                        {formatDateTime(imputation.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium tabular">
                        {formatAmount(imputation.amount)}
                      </span>
                      <Badge tone={IMPUTATION_STATUS_TONES[imputation.status]}>
                        {IMPUTATION_STATUS_LABELS[imputation.status]}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {IMPUTATION_STATUS_EFFECT[imputation.status]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        {canCreate && !maintenanceCancelled && !zeroCeiling && !noCeiling ? (
          <Card title="Préparer une imputation">
            <CreateImputationPanel
              maintenanceId={maintenanceId}
              suppliers={suppliers}
              remaining={budget.remaining}
              canSeeCeiling={canSeeCosts}
            />
          </Card>
        ) : (
          <Card title="Préparer une imputation">
            <p className="text-sm text-muted">
              {maintenanceCancelled
                ? 'Cette maintenance est annulée : elle ne donne lieu à aucune imputation.'
                : zeroCeiling
                  ? 'Le montant imputable est nul : la dépense reste à la charge d’ADIKOM.'
                  : noCeiling
                    ? 'Aucun montant imputable n’a été arrêté : il doit l’être avant toute imputation.'
                    : 'Votre compte peut consulter les imputations, mais pas en préparer.'}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
