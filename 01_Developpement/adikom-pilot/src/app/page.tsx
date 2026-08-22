import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Building2,
  CarFront,
  FileText,
  ShieldCheck,
  Wallet,
} from 'lucide-react'

import { AdikomLogo } from '@/components/brand/adikom-logo'

/**
 * Landing page publique — DEC-003.
 *
 * Page institutionnelle uniquement. Elle présente ADIKOM PILOT et conduit à la
 * connexion. Elle n'expose AUCUNE donnée métier et ne propose aucune création
 * de compte : le SaaS reste strictement interne
 * (README §65, 01_Vision_et_Objectifs/01_Vision_ADIKOM_PILOT.md §4).
 */

const MODULES = [
  {
    icon: CarFront,
    title: 'Gestion de location',
    text: "Cycle complet : réservation, départ, retour, contrôle et clôture, avec un parc dont la disponibilité reflète toujours la réalité.",
  },
  {
    icon: Building2,
    title: 'Tiers',
    text: 'Clients, fournisseurs et partenariats réunis dans un référentiel unique, avec conditions tarifaires et historique.',
  },
  {
    icon: FileText,
    title: 'Facturation & Paiement',
    text: 'Factures, règlements et imputations fournisseurs, avec des montants toujours explicables.',
  },
  {
    icon: Wallet,
    title: 'Banques & Caisses',
    text: 'Comptes, écritures et virements internes, rattachés à l’opération qui les a produits.',
  },
  {
    icon: BarChart3,
    title: 'Pilotage',
    text: 'Tableau de bord et notifications construits sur les données réelles, adaptés au rôle de chacun.',
  },
  {
    icon: ShieldCheck,
    title: 'Gouvernance',
    text: 'Utilisateurs, groupes, permissions détaillées et journal d’activité des opérations sensibles.',
  },
]

const PRINCIPLES = [
  {
    title: 'Chaque donnée sert une décision',
    text: "ADIKOM PILOT n'est pas un logiciel d'enregistrement. Chaque information saisie doit éclairer une opération ou une décision.",
  },
  {
    title: 'Tout montant doit pouvoir être expliqué',
    text: 'Un montant facturé, imputé ou payé peut toujours être relié à son origine : véhicule, maintenance, location ou contrat.',
  },
  {
    title: 'Une donnée saisie une fois',
    text: 'Les modules partagent le même référentiel. Aucune double saisie, aucune version divergente de la même information.',
  },
]

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* --- En-tête ------------------------------------------------------- */}
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <AdikomLogo size={40} priority />
            <div className="leading-tight">
              <p className="font-display text-base font-semibold text-adikom-500">
                ADIKOM PILOT
              </p>
              <p className="text-xs text-muted">Technology &amp; Travel</p>
            </div>
          </div>

          <Link
            href="/connexion"
            className="inline-flex items-center gap-2 rounded-control bg-adikom-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
          >
            Se connecter
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* --- Section d'ouverture ----------------------------------------- */}
        <section className="border-b border-line bg-adikom-50">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <p className="mb-4 text-sm font-medium tracking-wide text-adikom-600 uppercase">
              Système interne de gestion et de pilotage
            </p>
            <h1 className="max-w-3xl font-display text-3xl leading-tight font-bold text-ink sm:text-5xl">
              Passer d’une gestion dispersée à une organisation pilotée.
            </h1>
            <p className="mt-6 max-w-2xl text-base text-muted sm:text-lg">
              ADIKOM PILOT centralise les opérations d’ADIKOM TECHNOLOGIE &amp; TRAVEL :
              location de véhicules, parc automobile, tiers, facturation, trésorerie et
              suivi de l’activité — dans un environnement unique, structuré et traçable.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/connexion"
                className="inline-flex items-center gap-2 rounded-control bg-adikom-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-adikom-600"
              >
                Accéder à l’application
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <p className="text-sm text-muted">
                Accès réservé aux collaborateurs autorisés d’ADIKOM.
              </p>
            </div>
          </div>
        </section>

        {/* --- Modules ------------------------------------------------------ */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="font-display text-2xl font-semibold text-ink">
            Ce que couvre le système
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Les modules partagent les mêmes données et les mêmes règles métier.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-card border border-line bg-white p-6 transition-colors hover:border-adikom-300"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-control bg-adikom-50 text-adikom-500">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold text-ink">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* --- Principes ---------------------------------------------------- */}
        <section className="border-y border-line bg-adikom-50">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="font-display text-2xl font-semibold text-ink">
              Les principes qui guident le système
            </h2>

            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {PRINCIPLES.map(({ title, text }) => (
                <div key={title}>
                  <h3 className="font-display text-base font-semibold text-adikom-600">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* --- Pied de page --------------------------------------------------- */}
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-3">
            <AdikomLogo size={32} />
            <p className="text-sm text-muted">
              ADIKOM TECHNOLOGIE &amp; TRAVEL — Union des Comores
            </p>
          </div>
          <p className="text-xs text-muted">
            Application interne. Accès soumis à autorisation.
          </p>
        </div>
      </footer>
    </div>
  )
}
