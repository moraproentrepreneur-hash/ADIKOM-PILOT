import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Image as ImageIcon, TriangleAlert, Wrench } from 'lucide-react'

import {
  Badge,
  ButtonLink,
  Card,
  Empty,
  EmptyState,
  InfoRow,
  PageHeader,
} from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/dates'
import {
  getIncidentDetail,
  KIND_LABELS,
  RESPONSIBILITY_LABELS,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/features/incidents/data'
import { AddDamagePanel, IncidentStatusPanel } from '@/features/incidents/incident-panels'

export const metadata: Metadata = { title: 'Incident' }

export default async function IncidentDetailPage(props: PageProps<'/location/incidents/[id]'>) {
  await requirePermissionOrRedirect(PERMISSIONS.INCIDENTS_VIEW)

  const { id } = await props.params
  const searchParams = await props.searchParams

  const incident = await getIncidentDetail(id)
  if (!incident) notFound()

  const justCreated = searchParams.cree === '1'
  const rejectedPhotos = Number(typeof searchParams.photos === 'string' ? searchParams.photos : 0)

  const [canUpdate, canReadRentals, canCreateMaintenance] = await Promise.all([
    can(PERMISSIONS.INCIDENTS_UPDATE),
    can(PERMISSIONS.RENTALS_VIEW),
    // Faire reparer releve du module Maintenance, pas des incidents : un
    // utilisateur peut constater sans avoir le droit d'engager une intervention.
    can(PERMISSIONS.MAINTENANCE_CREATE),
  ])

  const open = incident.status === 'OPEN' || incident.status === 'IN_PROGRESS'

  return (
    <>
      <PageHeader
        title={KIND_LABELS[incident.kind]}
        description={`${incident.incidentNo} · ${incident.vehicleLabel}`}
        actions={
          <Link
            href="/location/incidents"
            className="inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Tous les incidents
          </Link>
        }
      />

      {justCreated && (
        <Notice tone="success" className="mb-5">
          L’incident <strong>{incident.incidentNo}</strong> a été enregistré. Le véhicule n’a pas
          été immobilisé et aucune maintenance n’a été créée : ces décisions vous appartiennent.
        </Notice>
      )}

      {rejectedPhotos > 0 && (
        <Notice tone="warning" className="mb-5">
          {rejectedPhotos} photo{rejectedPhotos > 1 ? 's' : ''} n’a pas pu être enregistrée. Les
          autres informations du constat, elles, l’ont été.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Constat">
            <dl>
              <InfoRow label="Référence">
                <span className="tabular">{incident.incidentNo}</span>
              </InfoRow>
              <InfoRow label="Nature">{KIND_LABELS[incident.kind]}</InfoRow>
              <InfoRow label="État">
                <Badge tone={STATUS_TONES[incident.status]}>
                  {STATUS_LABELS[incident.status]}
                </Badge>
              </InfoRow>
              <InfoRow label="Véhicule">{incident.vehicleLabel}</InfoRow>
              <InfoRow label="Survenu le">{formatDateTime(incident.occurredAt)}</InfoRow>

              <InfoRow
                label="Location concernée"
                hint="Un incident peut survenir hors de toute location."
              >
                {incident.rentalId === null ? (
                  <span className="text-muted">Hors location</span>
                ) : canReadRentals && incident.rentalNo ? (
                  <Link
                    href={`/location/locations/${incident.rentalId}`}
                    className="text-adikom-500 hover:underline tabular"
                  >
                    {incident.rentalNo}
                  </Link>
                ) : (
                  /*
                   * DEC-017 : rattaché à une location, mais illisible pour ce
                   * compte. Le DIRE, plutôt qu'afficher « Hors location » —
                   * qui serait une affirmation fausse tirée d'un refus de droit.
                   */
                  <span className="text-muted">
                    Rattaché à une location que votre compte ne peut pas consulter
                  </span>
                )}
              </InfoRow>

              <InfoRow label="Description">{incident.description}</InfoRow>
              <InfoRow label="Motif du dernier changement d’état">
                {incident.statusReason ?? <Empty />}
              </InfoRow>
              <InfoRow label="Déclaré le">{formatDateTime(incident.createdAt)}</InfoRow>
            </dl>
          </Card>

          <Card
            title="Dommages constatés"
            description="Aucun montant : les barèmes de dommage ne sont pas définis."
          >
            {incident.damages.length === 0 ? (
              <EmptyState
                icon={TriangleAlert}
                title="Aucun dommage constaté"
                description="Cet incident n’a laissé aucun dommage sur le véhicule, ou aucun n’a encore été relevé."
              />
            ) : (
              <ul className="space-y-3">
                {incident.damages.map((damage) => (
                  <li key={damage.id} className="rounded-control border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{damage.location}</p>
                        {damage.description && (
                          <p className="mt-1 text-sm text-muted">{damage.description}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={SEVERITY_TONES[damage.severity]}>
                          {SEVERITY_LABELS[damage.severity]}
                        </Badge>
                        {damage.isPreexisting && (
                          <Badge tone="neutral">Déjà présent au départ</Badge>
                        )}
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-muted">
                      Responsabilité constatée :{' '}
                      <strong className="text-ink">
                        {RESPONSIBILITY_LABELS[damage.responsibility]}
                      </strong>
                      {damage.isPreexisting
                        ? ' — relevé au départ, il ne peut pas être reproché au client.'
                        : ' — constat seul, aucune imputation n’en découle.'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Photos">
            {incident.photos.length === 0 ? (
              <EmptyState
                icon={ImageIcon}
                title="Aucune photo"
                description="Aucune photo n’a été jointe à ce constat."
              />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {incident.photos.map((photo) => (
                  <li key={photo.id}>
                    {/*
                      Le chemin de stockage n'est jamais exposé : cette route
                      vérifie la permission puis délivre une URL signée d'une
                      minute (DEC-025 §f).
                    */}
                    <a
                      href={`/api/incidents/photos/${photo.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs text-adikom-500 transition-colors hover:border-adikom-300"
                    >
                      <ImageIcon className="size-3.5" aria-hidden />
                      {photo.caption ?? photo.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {canUpdate && open && (
            <Card
              title="Faire évoluer l’incident"
              description="Ouvert → En traitement → Clos. Une annulation reste possible tant qu’il n’est pas clos."
            >
              <IncidentStatusPanel incidentId={incident.id} status={incident.status} />
            </Card>
          )}

          {canUpdate && open && (
            <Card
              title="Ajouter un dommage"
              description="Un dommage repéré après coup complète le constat."
            >
              <AddDamagePanel incidentId={incident.id} />
            </Card>
          )}

          {/*
            UNE DÉCISION, JAMAIS UN DÉCLENCHEMENT.
            Constater qu'un véhicule est abîmé et décider de le réparer sont
            deux actes distincts : le second est ici un lien, que quelqu'un
            choisit de suivre (Workflow 05 §44 appliqué à l'amont).
          */}
          {canCreateMaintenance && open && (
            <Card
              title="Faire réparer"
              description="Ce constat ne déclenche aucune intervention de lui-même."
            >
              <ButtonLink
                href={`/location/maintenance/nouvelle?incident=${incident.id}`}
                icon={Wrench}
                tone="secondary"
              >
                Créer une maintenance
              </ButtonLink>
              <p className="mt-2 text-xs text-muted">
                Le véhicule et l’incident seront repris ; l’immobilisation restera votre choix.
              </p>
            </Card>
          )}

          <Card title="Étape suivante">
            <p className="text-sm text-muted">
              {open
                ? 'Le coût d’une éventuelle intervention et son imputation à un fournisseur relèvent d’un lot ultérieur.'
                : 'Cet incident est clos. Il reste consultable dans l’historique du véhicule.'}
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
