# ADIKOM PILOT — Application

Code source du SaaS interne d'ADIKOM Technology & Travel.

> La documentation fonctionnelle est la **source de vérité** du projet :
> `../../00 Documentation/`. Les décisions d'arbitrage sont consignées dans
> `../../00 Documentation/08_Decisions/01_Journal_des_Decisions.md`.

---

## Pile technique

| Domaine | Choix |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) · React 19.2 · TypeScript |
| Styles | Tailwind CSS v4, tokens issus de la charte ADIKOM |
| Données | Supabase **Cloud** — PostgreSQL, Auth, Storage |
| Tests | Vitest |
| Déploiement | Vercel (*Root Directory* : `01 Développement/adikom-pilot`) |

Flux de développement (DEC-015) :

```
Code  →  Supabase Cloud  →  Tests  →  GitHub  →  Vercel  →  Recette en ligne
```

Docker n'est **pas** requis.

---

## Démarrage

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env.local     # puis renseigner les valeurs du projet Supabase

# 3. Schéma de base de données
npm run db:push                # applique les migrations sur Supabase Cloud
npm run db:verify              # recette du schéma

# 4. Développement
npm run dev
```

Procédure détaillée : [MISE_EN_PLACE.md](./MISE_EN_PLACE.md)

`.env.local` n'est **jamais** commité. Aucun secret ne doit apparaître dans le
code, la documentation ou un message de commit.

---

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript |
| `npm run test` | Tests unitaires |
| `npm run verify` | lint + typecheck + tests + build — **à passer avant chaque commit** |
| `npm run db:push` | Applique les migrations manquantes sur Supabase Cloud |
| `npm run db:status` | Liste les migrations à appliquer, sans rien modifier |
| `npm run db:verify` | Recette du schéma déployé (transaction annulée) |
| `npm run db:inspect` | État des lieux du schéma : tables, RLS, policies, triggers |
| `npm run bootstrap:admin` | Crée ou met à jour le Super Admin |

---

## Organisation du code

```
src/
├── app/                    routes — (app) regroupe les pages authentifiées
├── components/brand/       logo officiel (point d'entrée unique)
├── components/layout/      barre latérale, structure applicative
├── features/<domaine>/     actions serveur et composants par domaine métier
├── lib/auth/               couche d'accès aux données, permissions
├── lib/supabase/           clients serveur / navigateur / administration
├── lib/money.ts            arithmétique monétaire entière en KMF
├── lib/navigation.ts       navigation de référence
└── proxy.ts                rafraîchissement de session, filtrage des routes

supabase/migrations/        schéma versionné — jamais modifié à la main en base
```

---

## Trois règles à ne jamais contourner

**1. Les permissions se vérifient côté serveur.**
Toute action sensible commence par `requirePermission()`. Masquer un bouton
n'est pas une protection. Les policies RLS constituent la seconde barrière.

**2. Les montants sont des entiers.**
Tout passe par `src/lib/money.ts`. Aucun flottant dans un calcul financier.
Une imputation n'est pas un paiement : montant brut, imputé, payé et solde
restent conservés séparément.

**3. Le logo officiel ne se transforme jamais.**
Le composant `AdikomLogo` est le seul point d'entrée. Il garantit le ratio,
l'espace de respiration et le fond clair. Les fichiers sources sont opaques :
un fond clair derrière le logo n'est pas une option de style.
