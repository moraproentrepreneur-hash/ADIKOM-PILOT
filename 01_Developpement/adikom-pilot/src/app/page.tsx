import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Building2,
  CarFront,
  CheckCircle2,
  FileText,
  History,
  KeyRound,
  Layers,
  Lock,
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
 *
 * ELLE NE PROMET QUE CE QUI EXISTE.
 *
 * Chaque module cité est livré, chaque étape du cycle est celle que le système
 * fait réellement franchir, et les seuls chiffres affichés sont vérifiables :
 * neuf modules, cent soixante et onze capacités au catalogue, un référentiel.
 * Aucun indicateur inventé, aucune capture fabriquée (CLAUDE.md §55).
 *
 * PALETTE INCHANGÉE. Bleu ADIKOM, encre, gris moyen, blanc — celles de la
 * charte, et elles seules (Design System §11).
 */

const MODULES = [
  {
    icon: CarFront,
    title: 'Gestion de location',
    text: 'Réservation, préparation, départ, suivi, retour, contrôle et clôture — avec un parc dont la disponibilité reflète toujours la réalité.',
  },
  {
    icon: Building2,
    title: 'Tiers',
    text: 'Clients, fournisseurs et partenaires dans un référentiel unique, avec tarifs préférentiels, coordonnées de règlement et historique.',
  },
  {
    icon: FileText,
    title: 'Facturation & Paiement',
    text: 'Factures clients et fournisseurs, imputations de maintenance et règlements — chaque montant reste rattaché à son origine.',
  },
  {
    icon: Wallet,
    title: 'Banques & Caisses',
    text: 'Comptes, écritures, virements internes et paiements divers. Une écriture ne naît jamais sans l’opération qui la produit.',
  },
  {
    icon: BarChart3,
    title: 'Pilotage',
    text: 'Tableau de bord, centre de notifications, statistiques et rapports — construits sur les données réelles, filtrés par les droits de chacun.',
  },
  {
    icon: ShieldCheck,
    title: 'Gouvernance',
    text: 'Utilisateurs, groupes, permissions détaillées, organigramme et journal d’activité des opérations sensibles.',
  },
]

/** Le cycle documenté, tel que le système le fait franchir (CLAUDE.md §11). */
const CYCLE = [
  'Réservation',
  'Préparation',
  'Départ',
  'Location en cours',
  'Retour',
  'Contrôle',
  'Clôture',
]

const FACTS = [
  { value: '9', label: 'modules ouverts', hint: 'Aucune entrée de navigation n’est « à venir ».' },
  {
    value: '178',
    label: 'capacités attribuables',
    hint: 'Consulter, exporter, imprimer : trois droits distincts.',
  },
  {
    value: '1',
    label: 'référentiel partagé',
    hint: 'Une donnée saisie une fois, reprise partout.',
  },
]

const PRINCIPLES = [
  {
    icon: BarChart3,
    title: 'Chaque donnée sert une décision',
    text: 'ADIKOM PILOT n’est pas un logiciel d’enregistrement. Une information saisie doit éclairer une opération ou une décision — sans quoi elle n’a pas sa place.',
  },
  {
    icon: FileText,
    title: 'Tout montant doit pouvoir être expliqué',
    text: 'Un montant facturé, imputé ou payé se relie toujours à son origine : véhicule, maintenance, location ou contrat. Une imputation n’est jamais un paiement.',
  },
  {
    icon: Layers,
    title: 'Une donnée saisie une fois',
    text: 'Les modules partagent le même référentiel. Aucune double saisie, aucune version divergente de la même information.',
  },
]

const GOVERNANCE = [
  {
    icon: KeyRound,
    title: 'Des droits attribués un par un',
    text: 'Voir, créer, modifier, valider, annuler, archiver, exporter, imprimer : autant de capacités distinctes, accordées séparément.',
  },
  {
    icon: Lock,
    title: 'Vérifiés côté serveur',
    text: 'Masquer un bouton n’est pas une protection. Chaque opération sensible est contrôlée par le serveur et par la base, jusque dans un appel direct.',
  },
  {
    icon: History,
    title: 'Consignés dans un journal',
    text: 'Qui, quoi, quand, sur quelle donnée. Les actions sensibles sont tracées — celles du Super Admin comprises — et le journal ne se réécrit pas.',
  },
]

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* --- En-tête ------------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <AdikomLogo size={40} priority />
            <div className="min-w-0 leading-tight">
              <p className="truncate font-display text-base font-semibold text-adikom-500">
                ADIKOM PILOT
              </p>
              <p className="truncate text-xs text-muted">Technology &amp; Travel</p>
            </div>
          </div>

          <Link
            href="/connexion"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-2 text-center text-sm leading-tight font-medium text-white transition-colors hover:bg-adikom-600"
          >
            <span>Se connecter</span>
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* --- Ouverture --------------------------------------------------- */}
        <section className="relative overflow-hidden border-b border-line bg-adikom-50">
          {/*
            Motif décoratif construit avec les seules couleurs de la charte :
            un dégradé sobre et une trame de points très pâle. Aucun élément
            interactif, aucun texte — purement visuel, donc `aria-hidden`.
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--color-adikom-200)_1px,transparent_0)] [background-size:22px_22px] opacity-60"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/70 via-transparent to-adikom-50"
          />

          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
            <div className="rise">
              <p className="inline-flex items-center gap-2 rounded-badge border border-adikom-200 bg-white px-3 py-1 text-xs font-medium tracking-wide text-adikom-600 uppercase">
                <span className="size-1.5 rounded-full bg-adikom-500" aria-hidden />
                Système interne de gestion et de pilotage
              </p>

              <h1 className="mt-5 font-display text-3xl leading-[1.15] font-bold text-ink sm:text-4xl lg:text-5xl">
                Passer d’une gestion dispersée à une{' '}
                <span className="text-adikom-500">organisation pilotée</span>.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                ADIKOM PILOT centralise les opérations d’ADIKOM TECHNOLOGIE &amp; TRAVEL :
                location de véhicules, parc automobile, tiers, facturation, trésorerie, projets
                et suivi de l’activité — dans un environnement unique, structuré et traçable.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/connexion"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-adikom-500 px-6 py-3 text-center text-sm leading-tight font-medium text-white shadow-[0_6px_20px_-8px_rgba(30,90,168,0.7)] transition-all hover:bg-adikom-600 hover:shadow-[0_10px_28px_-10px_rgba(30,90,168,0.8)]"
                >
                  <span>Accéder à l’application</span>
                  <ArrowRight className="size-4 shrink-0" aria-hidden />
                </Link>

                <p className="text-sm text-muted">
                  Accès réservé aux collaborateurs autorisés d’ADIKOM.
                </p>
              </div>

              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-adikom-200 pt-6">
                {FACTS.map((fact) => (
                  <div key={fact.label}>
                    <dt className="font-display text-2xl font-bold text-adikom-500 tabular sm:text-3xl">
                      {fact.value}
                    </dt>
                    <dd className="mt-0.5 text-xs leading-snug text-muted sm:text-sm">
                      {fact.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/*
              LE CYCLE, PLUTÔT QU'UNE CAPTURE D'ÉCRAN.
              Une image d'interface vieillirait au premier écran modifié, et
              une maquette inventée promettrait ce qui n'existe pas. Le cycle
              d'exploitation, lui, est la promesse elle-même — et il est exact.
            */}
            <div className="rise [animation-delay:120ms]">
              <div className="rounded-card border border-line bg-white p-6 shadow-[0_18px_50px_-28px_rgba(31,41,55,0.35)] sm:p-7">
                <p className="font-display text-sm font-semibold text-ink">
                  Le cycle d’une location
                </p>
                <p className="mt-1 text-xs text-muted">
                  Chaque étape est un acte, soumis à sa propre autorisation.
                </p>

                <ol className="mt-5 space-y-0">
                  {CYCLE.map((step, index) => (
                    <li key={step} className="flex gap-3.5">
                      <div className="flex flex-col items-center">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-adikom-200 bg-adikom-50 font-display text-[11px] font-semibold text-adikom-600 tabular">
                          {index + 1}
                        </span>
                        {index < CYCLE.length - 1 && (
                          <span className="w-px flex-1 bg-adikom-200" aria-hidden />
                        )}
                      </div>
                      <p
                        className={
                          index < CYCLE.length - 1
                            ? 'pb-4 text-sm font-medium text-ink'
                            : 'text-sm font-medium text-ink'
                        }
                      >
                        {step}
                      </p>
                    </li>
                  ))}
                </ol>

                <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">
                  Un incident survenu en cours de location ouvre une maintenance, dont le coût peut
                  être <strong className="font-medium text-ink">imputé</strong> à la facture du
                  fournisseur — sans jamais être confondu avec un paiement.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* --- Modules ------------------------------------------------------ */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              Ce que couvre le système
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
              Neuf modules, les mêmes données et les mêmes règles métier. Ce qui est saisi dans
              l’un est immédiatement exact dans les autres.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {MODULES.map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="group rounded-card border border-line bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-adikom-300 hover:shadow-[0_14px_34px_-24px_rgba(31,41,55,0.45)]"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-control bg-adikom-50 text-adikom-500 transition-colors group-hover:bg-adikom-500 group-hover:text-white">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* --- Principes ---------------------------------------------------- */}
        <section className="border-y border-line bg-adikom-50">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
                Les principes qui guident le système
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
                Trois règles, tenues partout, plutôt qu’une longue liste de fonctionnalités.
              </p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {PRINCIPLES.map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="rounded-card border border-adikom-200 bg-white p-6"
                >
                  <span className="inline-flex size-10 items-center justify-center rounded-control bg-adikom-50 text-adikom-500">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-display text-base font-semibold text-adikom-600">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- Gouvernance -------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
                Qui a le droit de faire quoi
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
                Le SaaS est interne. Les clients, fournisseurs et partenaires y sont des données
                métier, jamais des utilisateurs. Les collaborateurs, eux, ne reçoivent que les
                capacités dont leur poste a besoin.
              </p>

              <ul className="mt-6 space-y-2.5">
                {[
                  'Seul le Super Admin crée les comptes',
                  'Aucun utilisateur ne s’attribue de droits',
                  'Une donnée importante s’archive, elle ne se supprime pas',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-ink">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-adikom-500" aria-hidden />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-4">
              {GOVERNANCE.map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="flex gap-4 rounded-card border border-line bg-white p-5 transition-colors hover:border-adikom-300"
                >
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-adikom-50 text-adikom-500">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- Appel final -------------------------------------------------- */}
        <section className="border-t border-line bg-adikom-500">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-14 sm:px-8 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Un seul environnement pour piloter l’activité
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-adikom-100 sm:text-base">
                Connectez-vous avec vos identifiants ADIKOM. Le contenu qui s’affiche dépend des
                droits attribués à votre compte.
              </p>
            </div>

            <Link
              href="/connexion"
              className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-control bg-white px-6 py-3 text-center text-sm leading-tight font-semibold text-adikom-500 transition-colors hover:bg-adikom-50 lg:w-auto"
            >
              <span>Se connecter</span>
              <ArrowRight className="size-4 shrink-0" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      {/* --- Pied de page --------------------------------------------------- */}
      <footer className="border-t border-line bg-white">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <AdikomLogo size={36} />
              <div className="min-w-0 leading-tight">
                <p className="font-display text-sm font-semibold text-adikom-500">
                  ADIKOM TECHNOLOGIE &amp; TRAVEL
                </p>
                <p className="text-xs text-muted">Union des Comores</p>
              </div>
            </div>

            <div className="text-xs leading-relaxed text-muted sm:max-w-sm sm:text-right">
              <p>Application interne. Accès soumis à autorisation.</p>
              <p className="mt-1">
                Aucune inscription publique : les comptes sont créés par l’administration.
              </p>
            </div>
          </div>

          <p className="mt-8 border-t border-line pt-6 text-xs text-muted">
            © {new Date().getFullYear()} ADIKOM TECHNOLOGIE &amp; TRAVEL — ADIKOM PILOT.
          </p>
        </div>
      </footer>
    </div>
  )
}
