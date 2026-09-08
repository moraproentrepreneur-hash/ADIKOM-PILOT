'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertTriangle, Download, FileJson, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { BUTTON_BASE, BUTTON_TONES, Card } from '@/components/ui/primitives'
import { FormFeedback, Notice } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/form'
import { EMPTY_FORM_STATE } from '@/lib/form-state'
import { cn } from '@/lib/utils'
import { resetSaasAction, restoreBackupAction } from './backup-actions'

/**
 * Paramètres → Sauvegarde — Module 09, LOT 18.
 *
 * TROIS ACTES, DONT DEUX IRRÉVERSIBLES.
 *
 * L'écran est construit pour qu'aucun des deux ne puisse être déclenché par
 * inadvertance : chacun exige la saisie EXACTE d'un mot, et énonce avant de
 * l'exiger ce qui sera supprimé — et ce qui ne le sera pas.
 *
 * L'INTERFACE NE PROTÈGE RIEN. Elle explique. Le refus, lui, est posé par
 * l'action serveur puis par la base, qui redemandent l'une et l'autre le même
 * mot et le même statut.
 */

const RESET_WORD = 'REINITIALISER'
const RESTORE_WORD = 'RESTAURER'

/** Ce qu'une réinitialisation efface, et ce qu'elle laisse intact. */
const REMOVED = [
  'Clients, fournisseurs, partenaires et véhicules',
  'Réservations, locations, états des lieux, incidents et maintenances',
  'Factures clients et fournisseurs, imputations et règlements',
  'Comptes financiers, écritures, virements et paiements divers',
  'Projets, tâches, réunions, rendez-vous, décisions et actions',
]

const PRESERVED = [
  'Le compte Super Admin et sa connexion',
  'Tous les autres comptes utilisateurs et leurs droits',
  'Les groupes, les départements et le catalogue des permissions',
  'Les paramètres de l’entreprise et les règles de numérotation',
  'Le journal d’activité, qui garde la trace de l’opération',
]

function SubmitDanger({
  label,
  pendingLabel,
  icon: Icon,
  disabled,
}: {
  label: string
  pendingLabel: string
  icon: LucideIcon
  disabled?: boolean
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(
        BUTTON_BASE,
        'w-full border border-danger bg-danger text-white hover:opacity-90 sm:w-auto'
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {pending ? pendingLabel : label}
    </button>
  )
}

/* -------------------------------------------------------------------------- */

export function BackupPanel() {
  return (
    <div className="space-y-5">
      <Notice tone="info">
        <p className="font-medium">Ces opérations sont réservées au Super Admin.</p>
        <p className="mt-1">
          Elles ne sont gouvernées par aucune permission attribuable : télécharger une sauvegarde,
          réinitialiser ou restaurer engage l’activité entière d’ADIKOM. Le refus est vérifié par le
          serveur <strong>et</strong> par la base, jamais seulement par cet écran.
        </p>
      </Notice>

      <ExportCard />
      <RestoreCard />
      <ResetCard />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  A. Télécharger                                                             */
/* -------------------------------------------------------------------------- */

function ExportCard() {
  return (
    <Card
      title="Télécharger une sauvegarde"
      description="Un fichier JSON versionné, daté, contenant les données métier des neuf modules."
    >
      <div className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-control border border-line p-3.5">
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
              Ce que le fichier contient
            </dt>
            <dd className="mt-1.5 text-sm text-ink">
              Tiers, parc, tarifs, cycle de location, maintenance, facturation, trésorerie, projets
              et planification — ainsi que la configuration de l’entreprise et les formats de
              numérotation.
            </dd>
          </div>
          <div className="rounded-control border border-line p-3.5">
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
              Ce qu’il ne contient pas
            </dt>
            <dd className="mt-1.5 text-sm text-ink">
              Aucun compte, aucune permission, aucun mot de passe, aucun jeton. Ces éléments ne se
              restaurent pas depuis un fichier : ils appartiennent à l’administration des
              utilisateurs.
            </dd>
          </div>
        </dl>

        <Notice tone="warning">
          <p className="font-medium">Le fichier obtenu est confidentiel.</p>
          <p className="mt-1">
            Il contient des montants, des coordonnées de règlement de fournisseurs et les références
            bancaires d’ADIKOM. Conservez-le en lieu sûr et ne le transmettez pas par un canal non
            maîtrisé.
          </p>
        </Notice>

        <a
          href="/api/sauvegarde"
          className={cn(BUTTON_BASE, BUTTON_TONES.primary, 'w-full sm:w-auto')}
        >
          <Download className="size-4 shrink-0" aria-hidden />
          Télécharger la sauvegarde
        </a>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  B. Restaurer                                                               */
/* -------------------------------------------------------------------------- */

type Summary =
  | { kind: 'ok'; createdAt: string | null; version: string; total: number; lines: [string, number][] }
  | { kind: 'error'; message: string }

/** Nom lisible d'une table du périmètre — l'écran ne montre pas du SQL. */
const TABLE_LABELS: Record<string, string> = {
  vehicle_categories: 'Catégories de véhicules',
  clients: 'Clients',
  suppliers: 'Fournisseurs',
  partners: 'Partenaires',
  supplier_payment_details: 'Coordonnées de règlement',
  vehicles: 'Véhicules',
  vehicle_supplier_history: 'Historique fournisseur des véhicules',
  vehicle_documents: 'Documents de véhicule',
  pricing_rules: 'Règles de tarification',
  financial_accounts: 'Comptes financiers',
  reservations: 'Réservations',
  rentals: 'Locations',
  rental_inspections: 'États des lieux',
  rental_inspection_photos: 'Photos d’état des lieux',
  vehicle_occupations: 'Engagements de véhicules',
  vehicle_incidents: 'Incidents',
  incident_damages: 'Dommages',
  incident_photos: 'Photos d’incident',
  vehicle_maintenances: 'Maintenances',
  maintenance_quotes: 'Devis de maintenance',
  maintenance_costs: 'Coûts de maintenance',
  maintenance_cost_lines: 'Lignes de coût',
  maintenance_documents: 'Documents de maintenance',
  supplier_invoices: 'Factures fournisseurs',
  supplier_invoice_lines: 'Lignes de factures fournisseurs',
  imputations: 'Imputations',
  imputation_documents: 'Justificatifs d’imputation',
  customer_invoices: 'Factures clients',
  customer_invoice_lines: 'Lignes de factures clients',
  supplier_payments: 'Règlements fournisseurs',
  customer_payments: 'Règlements clients',
  internal_transfers: 'Virements internes',
  misc_payments: 'Paiements divers',
  treasury_entries: 'Écritures de trésorerie',
  projects: 'Projets',
  project_members: 'Membres de projet',
  project_tasks: 'Tâches',
  project_meetings: 'Réunions',
  project_meeting_participants: 'Participants aux réunions',
  project_appointments: 'Rendez-vous',
  project_appointment_participants: 'Participants aux rendez-vous',
  project_decisions: 'Décisions',
  project_actions: 'Actions',
  notification_reads: 'Notifications lues',
}

function RestoreCard() {
  const [state, action] = useActionState(restoreBackupAction, EMPTY_FORM_STATE)
  const [summary, setSummary] = useState<Summary | null>(null)

  /**
   * LE RÉSUMÉ EST LU DANS LE NAVIGATEUR, AVANT TOUT ENVOI.
   *
   * Il n'a aucune valeur de sécurité — le serveur revérifiera tout — mais il
   * répond à la seule question qui compte avant de cliquer : « qu'est-ce que
   * je m'apprête à remettre en place ? »
   */
  async function inspect(file: File | undefined) {
    if (!file) {
      setSummary(null)
      return
    }

    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>

      if (parsed?.format !== 'adikom-pilot.sauvegarde') {
        setSummary({ kind: 'error', message: 'Ce fichier n’est pas une sauvegarde ADIKOM PILOT.' })
        return
      }

      const data = parsed.donnees
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        setSummary({ kind: 'error', message: 'Sauvegarde incomplète : aucune donnée à restaurer.' })
        return
      }

      const lines = Object.entries(data as Record<string, unknown>)
        .map(([table, rows]) => [table, Array.isArray(rows) ? rows.length : 0] as [string, number])
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])

      setSummary({
        kind: 'ok',
        createdAt: typeof parsed.created_at === 'string' ? parsed.created_at : null,
        version: String(parsed.version ?? '?'),
        total: lines.reduce((sum, [, count]) => sum + count, 0),
        lines,
      })
    } catch {
      setSummary({ kind: 'error', message: 'Ce fichier n’est pas un JSON lisible.' })
    }
  }

  return (
    <Card
      title="Restaurer une sauvegarde"
      description="Le contenu actuel des modules métier est remplacé par celui du fichier."
    >
      <form action={action} className="space-y-4">
        <FormFeedback error={state.error} success={state.success} />

        <Notice tone="warning">
          <p className="font-medium">La restauration remplace les données métier actuelles.</p>
          <p className="mt-1">
            Elle commence par les effacer, puis réécrit celles du fichier — le tout en une seule
            opération : si une seule ligne est refusée, <strong>rien</strong> n’est modifié. Les
            comptes, les permissions et le journal d’activité ne sont jamais touchés.
          </p>
        </Notice>

        <Field
          label="Fichier de sauvegarde"
          name="fichier"
          error={state.fieldErrors?.fichier}
          hint="Fichier JSON produit par « Télécharger la sauvegarde »."
          wide
        >
          <Input
            name="fichier"
            type="file"
            accept="application/json,.json"
            required
            onChange={(event) => inspect(event.currentTarget.files?.[0])}
            className="file:mr-3 file:rounded-control file:border-0 file:bg-adikom-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-adikom-500"
          />
        </Field>

        {summary?.kind === 'error' && <Notice tone="error">{summary.message}</Notice>}

        {summary?.kind === 'ok' && (
          <div className="rounded-control border border-line bg-canvas p-3.5">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
              <FileJson className="size-4 shrink-0 text-adikom-500" aria-hidden />
              {summary.total} ligne(s) seront restaurées
              <span className="text-xs font-normal text-muted">
                format version {summary.version}
                {summary.createdAt
                  ? ` · sauvegarde du ${new Date(summary.createdAt).toLocaleString('fr-FR', {
                      timeZone: 'Indian/Comoro',
                    })}`
                  : ''}
              </span>
            </p>

            <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {summary.lines.map(([table, count]) => (
                <li
                  key={table}
                  className="flex items-baseline justify-between gap-3 border-b border-line/70 py-1 text-sm last:border-b-0"
                >
                  <span className="min-w-0 truncate text-muted">
                    {TABLE_LABELS[table] ?? table}
                  </span>
                  <span className="tabular shrink-0 font-medium text-ink">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field
          label={`Saisissez « ${RESTORE_WORD} » pour confirmer`}
          name="confirmation"
          error={state.fieldErrors?.confirmation}
          hint="La confirmation est exigée par le serveur, pas seulement par cet écran."
        >
          <Input
            name="confirmation"
            autoComplete="off"
            spellCheck={false}
            placeholder={RESTORE_WORD}
            required
          />
        </Field>

        {/*
          LE BOUTON N'EST PAS DÉSACTIVÉ PAR L'APERÇU.

          Le résumé lu dans le navigateur AVERTIT ; il ne décide pas. Verrouiller
          le bouton ferait reposer le refus sur l'écran, alors qu'il appartient
          au serveur et à la base — et rendrait ce refus INVÉRIFIABLE par une
          recette, qui ne pourrait plus soumettre le fichier fautif.
        */}
        <SubmitDanger
          label="Restaurer la sauvegarde"
          pendingLabel="Restauration en cours…"
          icon={Upload}
        />
      </form>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  C. Réinitialiser                                                           */
/* -------------------------------------------------------------------------- */

function ResetCard() {
  const [state, action] = useActionState(resetSaasAction, EMPTY_FORM_STATE)

  return (
    <Card
      title="Réinitialiser le SaaS"
      description="Supprime définitivement les données métier. Opération irréversible."
    >
      <form action={action} className="space-y-4">
        <FormFeedback error={state.error} success={state.success} />

        <Notice tone="error">
          <p className="font-medium">Cette opération est irréversible.</p>
          <p className="mt-1">
            Téléchargez une sauvegarde <strong>avant</strong> de continuer : c’est le seul moyen de
            revenir en arrière.
          </p>
        </Notice>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-control border border-danger-soft bg-danger-soft/40 p-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              Ce qui sera supprimé
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {REMOVED.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden>·</span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-control border border-success-soft bg-success-soft/40 p-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-success">
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              Ce qui sera conservé
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {PRESERVED.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden>·</span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Notice tone="info">
          Les <strong>compteurs de numérotation</strong> ne reculent pas : un numéro déjà émis ne se
          réutilise jamais. Les prochaines fiches reprendront la série là où elle s’est
          arrêtée.
        </Notice>

        <Field
          label={`Saisissez « ${RESET_WORD} » pour confirmer`}
          name="confirmation"
          error={state.fieldErrors?.confirmation}
          hint="Aucune autre saisie ne déclenche l’opération."
        >
          <Input
            name="confirmation"
            autoComplete="off"
            spellCheck={false}
            placeholder={RESET_WORD}
            required
          />
        </Field>

        <SubmitDanger
          label="Réinitialiser le SaaS"
          pendingLabel="Réinitialisation en cours…"
          icon={RotateCcw}
        />
      </form>
    </Card>
  )
}
